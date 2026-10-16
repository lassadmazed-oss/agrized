-- 0143 · «قدّاش يبعد عليّ؟» — the words of the distance line on an offer, in the phone app.
--
-- Test: supabase/tests/090_nearby_ui_copy.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0143_nearby_ui_copy.sql supabase/tests/090_nearby_ui_copy.sql
--
-- The app can now tell someone how far an offer is from where they are standing. It appears ONLY where the
-- team ticked «إظهار الموقع» — `public_project_page` withholds the coordinates otherwise — and only after
-- the person taps to ask. Nothing is sent anywhere: the phone has the offer's coordinates already, asks the
-- system where it is, and subtracts. No position reaches this database, and none is stored on the device.
--
-- THE RESULT IS HEDGED ON PURPOSE. «تقريباً» is in the sentence because the fix is good to about a hundred
-- metres and the distance is a straight line — not a drive. Someone reading «42 كم» and planning an hour is
-- reading a number this app did not promise; «يبعد عليك 42 كم تقريباً» is the number it can stand behind.
--
-- `{km}` is the one blank. The app formats it before substituting (one decimal under 10 km, whole numbers
-- above), so the row must not try to round, pluralise or add a unit of its own.

create temp table _nearby_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _nearby_texts values
  ('ui.nearby.ask', 20, 'زر «قدّاش يبعد عليّ؟»', 'في قسم الموقع في صفحة العرض في التطبيق. يظهر كان الموقع متاع العرض ظاهر.',
   'قدّاش يبعد عليّ؟', 'À quelle distance de moi ?', 'Wie weit von mir?',
   'Quanto dista da me?', 'How far from me?'),

  ('ui.nearby.result', 21, 'نتيجة البعد', 'فيها {km}: الرقم يتحسب في التلفون. ما تزيدش «كم» مرّة أخرى ولا تقرّب.',
   'يبعد عليك {km} كم تقريباً', 'À environ {km} km de vous', 'Etwa {km} km von Ihnen entfernt',
   'A circa {km} km da te', 'About {km} km from you'),

  ('ui.nearby.denied', 22, 'كي يرفض يعطي موقعو', 'موش غلطة: اختيارو. نقولولو برك وين يبدّلو.',
   'ما عطيتناش موقعك. تنجّم تبدّلها من إعدادات التلفون.',
   'Vous n''avez pas partagé votre position. Vous pouvez la modifier dans les réglages du téléphone.',
   'Sie haben Ihren Standort nicht freigegeben. Sie können das in den Telefoneinstellungen ändern.',
   'Non hai condiviso la tua posizione. Puoi modificarla nelle impostazioni del telefono.',
   'You did not share your location. You can change that in your phone settings.'),

  ('ui.nearby.failed', 23, 'كي ما نلقاوش الموقع', 'الـGPS مطفي ولا ما وصلناش لموقع. يعاود.',
   'ما نجّمناش نلقاو موقعك. عاود.',
   'Impossible de trouver votre position. Réessayez.',
   'Ihr Standort konnte nicht ermittelt werden. Bitte erneut versuchen.',
   'Non è stato possibile trovare la tua posizione. Riprova.',
   'Could not find your location. Try again.');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true, 700 + sort
from _nearby_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _nearby_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
