-- 0161 · a ceiling on what the assistant can spend in a day.
--
-- Its test is supabase/tests/107_assistant_budget.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0161_assistant_budget.sql supabase/tests/107_assistant_budget.sql
--
-- The external review of 2026-10-25 (F09) asked for «سقف إنفاق وتنبيه» on the public assistant. Checking
-- what was there: assistant_begin_turn throttles 25 questions an hour PER ip_hash, and nothing counts the
-- whole. That is a limit on one visitor's enthusiasm, not a limit on the bill.
--
-- WHY THAT IS A REAL HOLE AND NOT A THEORETICAL ONE. The per-visitor throttle is keyed on a hashed IP, and
-- an IP is the cheapest thing on the internet to have a hundred of. A single afternoon of someone being
-- bored with a proxy list is 2 500 questions an hour against an OpenAI key that has no ceiling of its own
-- on this side — and the first anyone would know is the invoice. Every other door on this site has a number
-- behind it (antispam.max_requests_per_ip_per_hour, auth.client_code_max_per_hour, social.max_per_day); the
-- assistant, which is the only one that costs money per use, had none.
--
-- TWO CEILINGS, BECAUSE THEY FAIL DIFFERENTLY. A question count catches a flood of short questions; a token
-- count catches a smaller number of expensive ones, which is what a long conversation history produces.
-- Either one reached closes the assistant for the rest of the day.
--
-- AND IT SAYS WHICH IT IS. «سألت برشة أسئلة» is the wrong sentence for a visitor who has asked once and met
-- a ceiling somebody else filled: it blames him for something he did not do, and he is a potential client
-- reading it. A separate reason gets a separate sentence.
--
-- THE DAY IS AFRICA/TUNIS, like every other date in this schema.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('assistant.max_questions_per_day', to_jsonb(300), 'integer', 'assistant', 'أقصى عدد أسئلة في اليوم (الكل)',
   'سقف على المساعد كامل، موش على زائر واحد. يحمي فاتورة الـAPI كي يجي فيضان من عناوين مختلفة. كي يتوفّى، المساعد يسكّر لين الغدوة.',
   false, 40),

  ('assistant.max_tokens_per_day', to_jsonb(400000), 'integer', 'assistant', 'أقصى عدد توكن في اليوم (الكل)',
   'السقف الثاني: يمسك الأسئلة الغالية (محادثة طويلة) اللي ما يمسكهاش عدد الأسئلة. أيّ سقف يتوفّى يسكّر المساعد.',
   false, 41)
on conflict (key) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values ('assistant.budget_reached',
        to_jsonb('المساعد وفّى حصّتو لليوم. عاود غدوة، ولا عمّر الفورمولير ونتصلو بيك.'::text),
        'text', 'assistant', 'كي يتوفّى سقف اليوم',
        'لازم ما تلومش الزائر: هو ما عملش شيء. غير جملة «سألت برشة أسئلة» اللي للزائر اللي فعلاً أكثر.',
        true, 42)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', 'assistant.budget_reached', 'value', l.locale, to_jsonb(l.value), true
from (values
  ('fr', 'L''assistant a atteint sa limite pour aujourd''hui. Revenez demain, ou remplissez le formulaire et nous vous rappellerons.'),
  ('de', 'Der Assistent hat sein Tageslimit erreicht. Versuchen Sie es morgen wieder oder füllen Sie das Formular aus — wir melden uns.'),
  ('it', 'L''assistente ha raggiunto il limite giornaliero. Riprova domani, oppure compila il modulo e ti richiamiamo.'),
  ('en', 'The assistant has reached its limit for today. Try again tomorrow, or fill in the form and we will call you.')
) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;

-- Today's rows are counted on every question, so the count has an index to read.
create index if not exists assistant_messages_day_idx on public.assistant_messages (created_at desc);

create or replace function public.assistant_begin_turn(p_ip_hash text, p_question text) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare
  v_max        integer := coalesce((select (s.value #>> '{}')::integer from public.settings s
                                     where s.key = 'assistant.max_questions_per_hour'), 25);
  v_day_max    integer := coalesce((select (s.value #>> '{}')::integer from public.settings s
                                     where s.key = 'assistant.max_questions_per_day'), 300);
  v_token_max  bigint  := coalesce((select (s.value #>> '{}')::bigint from public.settings s
                                     where s.key = 'assistant.max_tokens_per_day'), 400000);
  v_since      timestamptz := date_trunc('day', (now() at time zone 'Africa/Tunis')) at time zone 'Africa/Tunis';
  v_asked      integer;
  v_tokens     bigint;
  v_id         uuid;
begin
  -- One visitor's share, unchanged: this is the limit on enthusiasm.
  perform app.check_throttle('assistant', p_ip_hash, interval '1 hour', v_max);

  -- And the whole day's, which is the limit on the bill. Counted together so one scan answers both.
  select count(*)::integer, coalesce(sum(coalesce(m.tokens_in, 0) + coalesce(m.tokens_out, 0)), 0)
    into v_asked, v_tokens
    from public.assistant_messages m
   where m.created_at >= v_since;

  if (v_day_max > 0 and v_asked >= v_day_max) or (v_token_max > 0 and v_tokens >= v_token_max) then
    -- A DIFFERENT REASON FROM rate_limited, deliberately. The visitor who meets this has asked once and run
    -- into a ceiling somebody else filled; telling him he asked too many questions blames him for something
    -- he did not do, and he is a potential client reading it.
    raise exception 'assistant_budget' using errcode = 'P0001';
  end if;

  insert into public.assistant_messages (ip_hash, question)
  values (p_ip_hash, left(p_question, 2000))
  returning id into v_id;

  return v_id;
end $fn$;

comment on function public.assistant_begin_turn(text, text) is
  'Opens one assistant turn, against two ceilings: the visitor''s own (25 an hour by default) and the whole day''s, in questions and in tokens (0161). The second is the one that protects the API bill — an IP is the cheapest thing on the internet to have a hundred of, so a per-visitor throttle is not a budget. Raises rate_limited for the first and assistant_budget for the second, because they are different sentences to a reader.';
