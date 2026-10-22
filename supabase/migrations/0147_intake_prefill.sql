-- 0147 · «ما يقعدش كل مرّة يعمّر» — what a signed-in buyer no longer has to type again.
--
-- Its test is supabase/tests/094_intake_prefill.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0147_intake_prefill.sql supabase/tests/094_intake_prefill.sql
--
-- THE OWNER'S REQUEST (2026-10-22): a buyer may send a request with no account at all — that does not change
-- — but one who HAS an account should sign in and send from it, and «ما يقعدش كل مرّة يعمّر»: not fill his
-- name, his number and how to reach him into every form, every time.
--
-- The data was already right. submit_interest_request upserts public.persons by phone and hangs the request
-- on person_id, so two requests from one number have always been one person's. What was missing was the
-- other direction: a signed-in buyer opening a form and the form knowing nothing about him. This is that
-- direction, and nothing else — it reads, it never writes, and the forms it feeds still accept a visitor who
-- is not signed in and never ask him to be.
--
-- IT TAKES NO ARGUMENT, for the reason 0102 sets out at length for my_zitounti_file: the identity comes from
-- auth.uid() through public.persons.profile_id, which is unique, so a client session can only ever reach its
-- own details and there is NOWHERE TO PUT a request for somebody else's. A check against a parameter can be
-- forgotten in a later edit; a missing parameter cannot.
--
-- NO MODULE GATE, unlike my_zitounti_file. That function opens a whole screen, which the owner stages behind
-- the `zitounti` flag. This one hands a person back the four things he himself typed the last time, so that
-- a form can save him typing them again. There is no module to close, and gating it on `interest_form` would
-- silently stop pre-filling the VISIT form the day the owner closed the intake — a coupling nobody would
-- look for. Signing in is the whole gate, and `anon` is revoked below.
--
-- WHY THE LAST REQUEST AND NOT ONLY THE PERSON ROW. persons carries the name, the numbers, the e-mail and
-- the governorate — the durable facts. How the buyer wants to be reached, and when, is a fact about a
-- request and lives on interest_requests, so the most recent one is read for those two. If he has never sent
-- one, they come back null and the form simply asks, as it does today.
--
-- A RETIRED CONTACT TIME IS NOT RETURNED. option_items retire (0141 and 0145 retired six between them), and
-- the intake refuses a retired choice with invalid_time_choice — correctly. Handing the form an id it would
-- be refused for is how a pre-filled form becomes worse than an empty one, so `is_active` is checked here
-- and a buyer whose old choice has since been retired is asked that one question again.

create or replace function public.my_intake_prefill() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_person public.persons;
  v_last   public.interest_requests;
  v_time   uuid;
  v_count  integer;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- THE ONLY LOOKUP THAT CHOOSES A PERSON, and the reason this needs no parameter. profile_id is unique, so
  -- this is one row or none.
  select p.* into v_person
  from public.persons p
  where p.profile_id = v_uid and p.archived_at is null;

  if v_person.id is null then
    raise exception 'no_file' using errcode = 'P0001';
  end if;

  select r.* into v_last
  from public.interest_requests r
  where r.person_id = v_person.id
  order by r.created_at desc, r.id desc
  limit 1;

  select count(*) into v_count
  from public.interest_requests r
  where r.person_id = v_person.id;

  -- Only if the buyer could still be refused for it. See the note above.
  select o.id into v_time
  from public.option_items o
  where o.id = v_last.contact_time_option_id and o.is_active;

  return jsonb_build_object(
    'person_id', v_person.id,
    'full_name', v_person.full_name,
    'phone_e164', v_person.phone_e164,
    'whatsapp_e164', v_person.whatsapp_e164,
    'email', v_person.email,
    'governorate_id', coalesce(v_person.governorate_id, v_last.residence_governorate_id),
    'delegation_id', coalesce(v_person.delegation_id, v_last.residence_delegation_id),
    'lives_abroad', coalesce(v_person.lives_abroad, v_last.lives_abroad, false),
    'preferred_locale', v_person.preferred_locale,
    'contact_channel', v_last.contact_channel,
    'contact_time_option_id', v_time,
    'requests', coalesce(v_count, 0),
    'last_request_at', v_last.created_at,
    'last_request_no', v_last.request_no
  );
end $fn$;

-- THE GRANT IS THE SECURITY BOUNDARY, together with the missing parameter: a visitor who has not signed in
-- is refused by Postgres before a line of this body runs.
revoke execute on function public.my_intake_prefill() from public, anon;
grant execute on function public.my_intake_prefill() to authenticated;

comment on function public.my_intake_prefill() is
  'The contact details a signed-in buyer already gave us, so a request form does not ask for them twice (owner, 2026-10-22: «ما يقعدش كل مرّة يعمّر»). Takes NO argument on purpose: the person is resolved from auth.uid() through public.persons.profile_id (unique), so a session can only ever reach its own details. Reads only; the durable facts come from public.persons and the two per-request preferences from the buyer''s most recent interest_request. A contact-time option that has since been retired is NOT returned, because the intake would refuse it. Raises not_signed_in or no_file. Granted to authenticated, revoked from anon — a visitor with no account sends requests exactly as before.';

-- ---------------------------------------------------------------------------
-- The words around it. Nothing here decides anything: these are the sentences
-- the form prints above a field it has already filled in.
-- ---------------------------------------------------------------------------

create temp table _prefill_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _prefill_texts values
  ('ui.prefill.title', 10, 'عنوان صندوق «معلوماتك معمّرة»', 'يظهر فوق الفورمولير كي يكون الحريف داخل لحسابو.',
   'عمّرنا معلوماتك', 'Vos informations sont déjà là', 'Ihre Angaben sind schon da',
   'I tuoi dati sono già qui', 'Your details are already here'),

  ('ui.prefill.text', 11, 'شرح «معلوماتك معمّرة»', 'لازم يقول إنّو ينجّم يبدّلهم: معمّرة موش مقفولة.',
   'جبنا اسمك ورقمك من حسابك باش ما تعاودش تكتبهم. تنجّم تبدّلهم كيف ما تحبّ قبل ما تبعث.',
   'Nous avons repris votre nom et votre numéro depuis votre compte pour vous éviter de les ressaisir. Vous pouvez les modifier avant d''envoyer.',
   'Wir haben Ihren Namen und Ihre Nummer aus Ihrem Konto übernommen, damit Sie sie nicht erneut eingeben müssen. Sie können sie vor dem Senden ändern.',
   'Abbiamo ripreso il tuo nome e il tuo numero dal tuo account per non fartali riscrivere. Puoi modificarli prima di inviare.',
   'We filled in your name and number from your account so you do not have to type them again. You can change them before sending.'),

  ('ui.prefill.not_you', 12, 'رابط «موش إنت؟»', 'يخرّجو من حسابو ويرجّع الفورمولير فارغ.',
   'موش إنت؟ اخرج', 'Ce n''est pas vous ? Se déconnecter', 'Nicht Sie? Abmelden',
   'Non sei tu? Esci', 'Not you? Sign out'),

  ('ui.prefill.offer', 13, 'سطر تحت المعلومات المعمّرة', 'يقولو إنّو المطلب باش يتعلّق بحسابو.',
   'هذا المطلب باش يتزاد لملفّك، مع اللي بعثتهم قبل.',
   'Cette demande sera ajoutée à votre dossier, avec les précédentes.',
   'Diese Anfrage wird Ihrem Vorgang hinzugefügt, zu den vorherigen.',
   'Questa richiesta sarà aggiunta alla tua pratica, insieme alle precedenti.',
   'This request will be added to your file, alongside the earlier ones.'),

  ('ui.prefill.sign_in', 20, 'دعوة الدخول للي ما عندوش حساب مفتوح', 'يظهر للزائر اللي موش داخل. ما يمنعوش يبعث.',
   'عندك حساب؟ ادخل وما تعاودش تعمّر معلوماتك.',
   'Vous avez déjà un compte ? Connectez-vous et ne ressaisissez rien.',
   'Sie haben schon ein Konto? Melden Sie sich an und geben Sie nichts erneut ein.',
   'Hai già un account? Accedi e non riscrivere nulla.',
   'Already have an account? Sign in and skip the typing.'),

  ('ui.prefill.sign_in_cta', 21, 'زر الدخول الصغير', 'يوجّه لـ«زيتونتي».',
   'دخول', 'Se connecter', 'Anmelden', 'Accedi', 'Sign in');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true, 760 + sort
from _prefill_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _prefill_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
