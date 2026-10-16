-- 0142 · The words the phone app shows when it asks to send notifications.
--
-- Test: supabase/tests/089_push_ui_copy.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0142_push_ui_copy.sql supabase/tests/089_push_ui_copy.sql
--
-- 0138 and 0139 built the whole of push except the one screen a person sees: the row in حسابي that asks
-- whether they want their phone to buzz. These are its words.
--
-- WHY THE APP ASKS BEFORE THE SYSTEM DOES. iOS gives an app ONE permission prompt, ever. A person who taps
-- «Don't Allow» cannot be asked again from inside the app — only sent to Settings, which almost nobody does.
-- So the system prompt is never shown cold: `ui.push.text` explains what the notifications are for first,
-- and only someone who taps «فعّل» sees Apple's dialog. The refusal rate on the second prompt is the one
-- that matters, and this is the only lever on it.
--
-- WHAT IS PROMISED HERE MUST MATCH WHAT IS SENT. The templates behind these are 0138's push rows — a visit
-- confirmed, a contract ready, an instalment due, a receipt. No marketing, and the sentence says so; an app
-- that asks for notifications and then advertises is how an entire install base turns them off at once.
--
-- `ui.push.denied` is deliberately not an error. The person made a choice, the app respects it, and the
-- sentence says where it can be changed rather than asking again on every visit to the screen.

create temp table _push_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _push_texts values
  ('ui.push.title', 10, 'عنوان صفّ الإشعارات', 'في «حسابي» في التطبيق.',
   'الإشعارات', 'Notifications', 'Benachrichtigungen', 'Notifiche', 'Notifications'),

  ('ui.push.text', 11, 'شرح الإشعارات', 'السطر اللي يقراه قبل ما يقبل. لازم يقول بالضبط شنوّة باش يوصلو.',
   'نعلّموك كي تتأكّد زيارة، كي يوفّى عقدك، ولا كي يقرب قسط. إشعارات على مطلبك برك، بلا إشهار.',
   'Nous vous prévenons quand une visite est confirmée, quand votre contrat est prêt ou qu''une échéance approche. Rien que votre dossier, aucune publicité.',
   'Wir melden uns, wenn ein Besuch bestätigt ist, Ihr Vertrag bereitliegt oder eine Rate fällig wird. Nur Ihr Vorgang, keine Werbung.',
   'Ti avvisiamo quando una visita è confermata, quando il contratto è pronto o quando una rata si avvicina. Solo la tua pratica, nessuna pubblicità.',
   'We tell you when a visit is confirmed, when your contract is ready, or when an instalment is due. Your file only — no advertising.'),

  ('ui.push.enable', 12, 'زر تفعيل الإشعارات', 'كي يتنقر، يظهر سؤال النظام.',
   'فعّل الإشعارات', 'Activer les notifications', 'Benachrichtigungen aktivieren',
   'Attiva le notifiche', 'Turn on notifications'),

  ('ui.push.on', 13, 'كي تكون الإشعارات مفعّلة', 'يتبدّل بيه الزر.',
   'الإشعارات مفعّلة', 'Notifications activées', 'Benachrichtigungen aktiv',
   'Notifiche attive', 'Notifications on'),

  ('ui.push.denied', 14, 'كي يرفض الإشعارات', 'موش غلطة: اختيارو. نقولولو برك وين يبدّلو.',
   'الإشعارات مطفية. تنجّم تشعّلها من إعدادات التلفون.',
   'Les notifications sont désactivées. Vous pouvez les réactiver dans les réglages du téléphone.',
   'Benachrichtigungen sind aus. Sie können sie in den Telefoneinstellungen wieder einschalten.',
   'Le notifiche sono disattivate. Puoi riattivarle nelle impostazioni del telefono.',
   'Notifications are off. You can turn them back on in your phone settings.'),

  ('ui.push.failed', 15, 'كي يطيح التفعيل', 'شبكة ولا سيرفور. يعاود من بعد.',
   'ما نجّمناش نفعّلو الإشعارات. عاود من بعد.',
   'Impossible d''activer les notifications. Réessayez plus tard.',
   'Benachrichtigungen konnten nicht aktiviert werden. Bitte später erneut versuchen.',
   'Non è stato possibile attivare le notifiche. Riprova più tardi.',
   'Could not turn on notifications. Try again later.');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true, 700 + sort
from _push_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _push_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
