-- The site assistant: a floating helper that answers a visitor's questions (owner, 2026-09-23).
--
-- WHAT IT IS ALLOWED TO KNOW. Nothing in this file, and nothing in the code, states a price, a tree count
-- or an offer name. The route builds the model's context at request time from the same published rows the
-- offers page reads, plus the public `settings` copy, so the assistant cannot drift from the site: change
-- an offer in the Back Office and its next answer changes with it.
--
-- WHAT IT MAY NOT DO. It is a guide, not a salesman and not an advisor. The persona forbids inventing
-- figures, promising a yield, and giving financial advice -- the line the footer already takes
-- («AgriZed لا تضمن أي إنتاج أو مردود مالي»). When it does not know, it hands over to the form or the phone.
--
-- COST. Every value that drives spend is a row: the model, how many offers are described to it, how long
-- an answer may be, and how many questions one visitor gets per hour. Setting the `assistant` flag to
-- 'disabled' removes it from the site without a deploy.

insert into public.feature_flags (key, state, phase, label_ar, description_ar, sort_order) values
  ('assistant', 'public', 1, 'مساعد الموقع',
   'الدائرة العايمة اللي تجاوب الزائر. كي تتحط disabled تختفي من الموقع.', 115)
on conflict (key) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  -- Not public: the visitor never needs to know which model answered, and it is a spend decision.
  ('assistant.model', to_jsonb('gpt-4o-mini'::text), 'text', 'assistant', 'الموديل',
   'إسم موديل OpenAI. gpt-4o-mini رخيص وياسر مليح بالعربي. بدّلو كي تحب أقوى، مثلاً gpt-4.1-mini.',
   false, 10),

  ('assistant.max_offers', to_jsonb(14), 'integer', 'assistant', 'عدد العروض اللي يشوفهم',
   'قدّاش من عرض نوصفولو في كل سؤال. أكثر يعني جواب أدقّ وكلفة أكبر.', false, 20),

  ('assistant.max_answer_chars', to_jsonb(700), 'integer', 'assistant', 'أقصى طول للجواب',
   'الجواب لازم يكون قصير ومفيد. هذا سقف يتقالّو للموديل.', false, 30),

  ('assistant.max_questions_per_hour', to_jsonb(25), 'integer', 'assistant', 'أسئلة الزائر في الساعة',
   'حماية من الاستهلاك الزائد. كي يفوتو، نقولولو يعاود بعد شوية.', false, 40),

  ('assistant.max_question_chars', to_jsonb(400), 'integer', 'assistant', 'أقصى طول للسؤال',
   'سؤال أطول من هكّا يتردّ قبل ما يمشي للموديل.', false, 50),

  -- Public: this is copy on the screen.
  ('assistant.title', to_jsonb('مساعد AgriZed'::text), 'text', 'assistant', 'إسم المساعد',
   'يظهر في راس النافذة.', true, 60),

  ('assistant.tagline', to_jsonb('نجاوبك على أسئلتك على الزيتون والعروض'::text), 'text', 'assistant',
   'السطر الصغير تحت الإسم', 'يظهر في راس النافذة تحت الإسم.', true, 70),

  ('assistant.greeting', to_jsonb('أهلا! أنا مساعد AgriZed. إسألني على العروض، على الأسعار، ولّا على كيفاش تبدا.'::text),
   'text', 'assistant', 'أول رسالة', 'اللي يقرا الزائر كي يحلّ النافذة.', true, 80),

  ('assistant.suggestions',
   '["شنوّة أحسن عرض متوفّر؟", "قدّاش لازم نبدا بيه؟", "نحب نزور أرض قبل ما نشري", "كيفاش تخدم AgriZed؟"]'::jsonb,
   'json', 'assistant', 'أسئلة مقترحة', 'أزرار جاهزة يلوّج بيهم الزائر. قائمة نصوص.', true, 90),

  ('assistant.persona', to_jsonb(
     'إنت مساعد AgriZed، منصّة تونسية تبيع زياتين في ضيعات. تكلّم بالتونسي البسيط، بلا رسميات، بجمل قصيرة.'::text),
   'text', 'assistant', 'شخصية المساعد',
   'سطر يتزاد لتعليمات الموديل. يبدّل نبرة الكلام، ما يبدّلش المعطيات.', false, 100),

  ('assistant.unavailable', to_jsonb('المساعد مش متوفّر توّا. تنجّم تعمّر الفورمولير ونتصلو بيك.'::text),
   'text', 'assistant', 'كي يطيح', 'اللي يتقال للزائر كي الخدمة ما تردّش.', true, 110),

  ('assistant.rate_limited', to_jsonb('سألت برشة أسئلة في وقت قصير. إستنّى شوية وعاود.'::text),
   'text', 'assistant', 'كي يفوت العدد', 'اللي يتقال كي يفوت عدد الأسئلة في الساعة.', true, 120)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------------------------------------------------------------------------
-- What people asked. The owner cannot improve the copy without seeing the questions.
-- ---------------------------------------------------------------------------
--
-- No name, no phone, no account: a visitor asking a question is anonymous and this table keeps it that
-- way. `ip_hash` is the salted hash the intake forms already use for throttling -- it groups one visitor's
-- questions together and identifies nobody.

create table public.assistant_messages (
  id           uuid primary key default gen_random_uuid(),
  ip_hash      text,
  question     text not null,
  answer       text,
  model        text,
  tokens_in    integer,
  tokens_out   integer,
  error        text,
  created_at   timestamptz not null default now()
);

create index assistant_messages_recent_idx on public.assistant_messages (created_at desc);

alter table public.assistant_messages enable row level security;

-- The route writes with the service role, which bypasses RLS. Nobody else writes at all, and a visitor
-- may not read what other visitors asked.
revoke all on public.assistant_messages from public, anon, authenticated;

create policy assistant_messages_staff_read on public.assistant_messages
  for select to authenticated
  using ((select app.is_staff()));

grant select on public.assistant_messages to authenticated;

comment on table public.assistant_messages is
  'One row per question put to the site assistant (0080). Anonymous: a visitor is grouped by the salted ip_hash the intake forms use, never by name or phone. Staff read it to see what visitors actually ask.';

-- ---------------------------------------------------------------------------
-- One turn: throttle, then write the question down. The answer lands in a second call.
-- ---------------------------------------------------------------------------
--
-- The throttle is `app.check_throttle`, the same one the intake forms use, so a visitor hammering the
-- assistant is counted exactly like one hammering the form. It raises 'rate_limited', which the route
-- turns into the Arabic `assistant.rate_limited`.

create or replace function public.assistant_begin_turn(p_ip_hash text, p_question text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := coalesce((select (s.value #>> '{}')::integer from public.settings s
                              where s.key = 'assistant.max_questions_per_hour'), 25);
  v_id  uuid;
begin
  perform app.check_throttle('assistant', p_ip_hash, interval '1 hour', v_max);

  insert into public.assistant_messages (ip_hash, question)
  values (p_ip_hash, left(p_question, 2000))
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.assistant_begin_turn(text, text) from public, anon, authenticated;
grant execute on function public.assistant_begin_turn(text, text) to service_role;

create or replace function public.assistant_finish_turn(
  p_id uuid, p_answer text, p_model text, p_tokens_in integer, p_tokens_out integer, p_error text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assistant_messages
     set answer     = left(p_answer, 4000),
         model      = p_model,
         tokens_in  = p_tokens_in,
         tokens_out = p_tokens_out,
         error      = left(p_error, 500)
   where id = p_id;
end $$;

revoke execute on function public.assistant_finish_turn(uuid, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.assistant_finish_turn(uuid, text, text, integer, integer, text) to service_role;
