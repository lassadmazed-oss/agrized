-- 0149 · «افتح حسابك» — the offer made after a request is sent, and never before.
--
-- Its test is supabase/tests/096_account_invite.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0149_account_invite.sql supabase/tests/096_account_invite.sql
--
-- THE OWNER'S CHOICE (2026-10-22). He asked whether a buyer who sends a request should get an account made
-- for him automatically, or be given the way to make his own; offered both, he answered «2» — offer it.
--
-- WHY THAT IS THE CHEAPER AND THE KINDER ONE. Making the account automatically means an SMS to every single
-- person who fills a form: money out of the same budget he is trying to cut, sent to people who did not ask
-- for it, carrying a password link they never requested. The offer costs nothing until it is accepted. Not
-- one message is sent by any of this — the sentences below sit on the screen that already says «تمّ», and
-- the SMS is sent by 0096's own first-time flow, when the buyer presses the button inside it.
--
-- NOTHING NEW IS BUILT BEHIND IT EITHER. The link lands on فضاء «زيتونتي» with the number the buyer has just
-- typed already in the field, and the door there is the one that has always been there: «أوّل مرّة؟ ادخل
-- برمز SMS» proves the number, then he chooses a password. A second sign-up path would be a second place for
-- the rules about codes, attempts and rate limits to drift out of step with 0096 and 0108.
--
-- THE INVITATION IS NOT SHOWN TO SOMEBODY WHO IS ALREADY SIGNED IN. He has the account; what he gets instead
-- is 0147's «عمّرنا معلوماتك», one screen earlier.

create temp table _invite_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _invite_texts values
  ('ui.account_invite.title', 10, 'عنوان دعوة فتح الحساب', 'في صفحة «تمّ، بعثنا مطلبك»، للي ما عندوش حساب.',
   'افتح حسابك في AgriZed', 'Ouvrez votre compte AgriZed', 'Eröffnen Sie Ihr AgriZed-Konto',
   'Apri il tuo account AgriZed', 'Open your AgriZed account'),

  ('ui.account_invite.text', 11, 'شرح دعوة فتح الحساب', 'شنوّة يربح بيه. لازم يبيّن إنّو اختياري.',
   'حسابك يلمّ مطالبك وزيتوناتك وحجوزاتك ودفعاتك في بلاصة وحدة، وما تعاودش تعمّر معلوماتك في كل مرّة. اختياري — مطلبك وصلنا في كل الحالات.',
   'Votre compte réunit vos demandes, vos oliviers, vos réservations et vos paiements au même endroit, et vous évite de ressaisir vos informations. C''est facultatif : votre demande nous est bien parvenue dans tous les cas.',
   'In Ihrem Konto finden Sie Ihre Anfragen, Ihre Olivenbäume, Ihre Reservierungen und Ihre Zahlungen an einem Ort, und Sie müssen Ihre Angaben nicht erneut eingeben. Freiwillig — Ihre Anfrage ist in jedem Fall bei uns angekommen.',
   'Il tuo account riunisce le tue richieste, i tuoi ulivi, le tue prenotazioni e i tuoi pagamenti in un unico posto, e ti evita di riscrivere i tuoi dati. È facoltativo: la tua richiesta ci è arrivata in ogni caso.',
   'Your account brings your requests, your olive trees, your reservations and your payments together in one place, and saves you retyping your details. It is optional — your request has reached us either way.'),

  ('ui.account_invite.cta', 12, 'زرّ فتح الحساب', 'يوجّه لـ«زيتونتي» والنمرة معمّرة. ما يبعث حتى SMS وحدو.',
   'افتح حسابي', 'Ouvrir mon compte', 'Mein Konto eröffnen', 'Apri il mio account', 'Open my account'),

  ('zitounti.invite_login_note', 13, 'ملاحظة الدخول كي يجي من الدعوة', 'تظهر عوض ملاحظة الدخول العادية كي تكون النمرة جاية في الرابط.',
   'هاك نمرتك. أوّل مرّة؟ انقر على «أوّل مرّة؟ ادخل برمز SMS» تحت، ونبعثولك رمز باش تثبّت نمرتك وتختار كلمة سرّ.',
   'Voici votre numéro. Première fois ? Touchez « Première fois ? Entrer avec un code SMS » ci-dessous : nous vous enverrons un code pour confirmer votre numéro et choisir un mot de passe.',
   'Hier ist Ihre Nummer. Zum ersten Mal? Tippen Sie unten auf «Zum ersten Mal? Mit SMS-Code anmelden» — wir senden Ihnen einen Code, um Ihre Nummer zu bestätigen und ein Passwort zu wählen.',
   'Ecco il tuo numero. È la prima volta? Tocca «Prima volta? Entra con un codice SMS» qui sotto: ti invieremo un codice per confermare il numero e scegliere una password.',
   'Here is your number. First time? Tap «First time? Sign in with an SMS code» below and we will send you a code to confirm your number and choose a password.');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true, 780 + sort
from _invite_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _invite_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
