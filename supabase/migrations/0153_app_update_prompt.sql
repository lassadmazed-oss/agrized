-- 0153 · «تحديث جديد متوفّر» — the app tells a person an update is waiting and opens the store on it.
--
-- Its test is supabase/tests/100_app_update_prompt.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0153_app_update_prompt.sql supabase/tests/100_app_update_prompt.sql
--
-- WHY THE APP CANNOT SIMPLY KNOW. Google Play updates an installed app on its own schedule, often days after a
-- release, and a person who opens the app on the old build has no way to learn there is a better one. The owner
-- asked that such a person be led to Google Play, on this app's page, to update. The app therefore compares
-- the build it is running with two numbers the owner sets here, per platform:
--
--   app.<platform>.latest_build  the newest build published in the store. A build below it sees a notice it can
--                                 close («لاحقاً»), shown once per newer build and not on every launch.
--   app.<platform>.min_build     the oldest build still allowed. A build below it sees a notice that cannot be
--                                 closed and covers the app, for a release that must not stay in use (a broken
--                                 sign-in, a changed contract). The owner raises it deliberately.
--
-- Both are the build NUMBER (Android's versionCode), not «1.1.0»: two builds of the same 1.1.0 differ, and the
-- number is what the store shows under «App bundle explorer».
--
-- SHIPPING THIS PROMPTS NOBODY. Both numbers start at 0, which means «no information», and the app shows nothing
-- for 0. The notice appears only after the owner has published a build to the store and typed its number here, so
-- the order is always: release first, setting second — never a notice pointing at an update that is not there.
-- Builds made before this migration do not read these rows at all.
--
-- THE STORE ADDRESS IS A SETTING TOO. The app takes the package id out of it to open Play's own app
-- (market://details?id=…) and keeps the https address as the fallback for a phone without the Play app. iOS is
-- seeded empty: with no address there is nothing to open, so the app shows no notice on an iPhone until the
-- owner has an App Store page and writes it here.

create temp table _update_settings (
  key text primary key, sort integer, value_type text, value jsonb, label_ar text, description_ar text
) on commit drop;

insert into _update_settings values
  ('app.android.latest_build', 10, 'integer', '0'::jsonb,
   'أندرويد: آخر نسخة منشورة (رقم البناء)',
   'رقم البناء (versionCode) متاع آخر نسخة نشرتها في Google Play. كل تطبيق رقم بنائو أصغر يشوف إشعار «تحديث متوفّر» ويقدر يسكّرو. 0 = ما فمّاش إشعار. اكتبو بعد ما تتنشر النسخة في Play، موش قبل.'),
  ('app.android.min_build', 11, 'integer', '0'::jsonb,
   'أندرويد: أقدم نسخة مسموحة (رقم البناء)',
   'أي تطبيق رقم بنائو أصغر من هذا يشوف إشعار تحديث ما يتسكّرش ويغطّي التطبيق. استعملو كان نسخة قديمة فيها مشكل خطير. 0 = ما فمّاش إجبار. لازم يكون أصغر ولا يساوي آخر نسخة.'),
  ('app.android.store_url', 12, 'text', to_jsonb('https://play.google.com/store/apps/details?id=site.agrized.app'::text),
   'أندرويد: رابط التطبيق في Google Play',
   'الرابط اللي يتفتح كي يضغط الحريف على «حدّث توّا». يفتح تطبيق Play مباشرة على صفحة AgriZed.'),
  ('app.ios.latest_build', 20, 'integer', '0'::jsonb,
   'آيفون: آخر نسخة منشورة (رقم البناء)',
   'نفس الفكرة متاع أندرويد، لما يكون عندك التطبيق في App Store. 0 = ما فمّاش إشعار.'),
  ('app.ios.min_build', 21, 'integer', '0'::jsonb,
   'آيفون: أقدم نسخة مسموحة (رقم البناء)',
   'نفس الفكرة متاع أندرويد. 0 = ما فمّاش إجبار.'),
  ('app.ios.store_url', 22, 'text', to_jsonb(''::text),
   'آيفون: رابط التطبيق في App Store',
   'فارغ حتى يكون عندك صفحة في App Store. بلا رابط، ما يظهر إشعار تحديث في الآيفون.');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, value, value_type, 'app', label_ar, description_ar, true, 800 + sort
from _update_settings
on conflict (key) do nothing;

create temp table _update_texts (
  key text primary key, sort integer, label_ar text, description_ar text,
  ar text, fr text, de text, it text, en text
) on commit drop;

insert into _update_texts values
  ('ui.app_update.title', 10, 'عنوان إشعار التحديث', 'يظهر في التطبيق كي تكون فما نسخة أجدد في المتجر.',
   'تحديث جديد متوفّر', 'Une mise à jour est disponible', 'Ein Update ist verfügbar',
   'È disponibile un aggiornamento', 'An update is available'),

  ('ui.app_update.text', 11, 'نصّ إشعار التحديث', 'للنسخة اللي يتنجّم يسكّر عليها الحريف.',
   'فما نسخة أجدد من AgriZed في المتجر، فيها تحسينات وإصلاحات. حدّث باش تستفيد منها.',
   'Une version plus récente d''AgriZed est disponible dans la boutique, avec des améliorations et des corrections. Mettez à jour pour en profiter.',
   'Im Store ist eine neuere Version von AgriZed mit Verbesserungen und Fehlerbehebungen verfügbar. Aktualisieren Sie, um davon zu profitieren.',
   'È disponibile nello store una versione più recente di AgriZed, con miglioramenti e correzioni. Aggiorna per usufruirne.',
   'A newer version of AgriZed is available in the store, with improvements and fixes. Update to get them.'),

  ('ui.app_update.text_required', 12, 'نصّ التحديث الإجباري', 'للنسخة اللي ما عادش مسموح بيها (أقدم من «أقدم نسخة مسموحة»).',
   'النسخة هذي من AgriZed ما عادش مدعومة. حدّث من المتجر باش تواصل تستعمل التطبيق.',
   'Cette version d''AgriZed n''est plus prise en charge. Mettez à jour depuis la boutique pour continuer à utiliser l''application.',
   'Diese Version von AgriZed wird nicht mehr unterstützt. Aktualisieren Sie über den Store, um die App weiter zu nutzen.',
   'Questa versione di AgriZed non è più supportata. Aggiorna dallo store per continuare a usare l''app.',
   'This version of AgriZed is no longer supported. Update from the store to keep using the app.'),

  ('ui.app_update.cta', 13, 'زرّ التحديث', 'يفتح المتجر مباشرة على صفحة التطبيق.',
   'حدّث توّا', 'Mettre à jour', 'Jetzt aktualisieren', 'Aggiorna ora', 'Update now'),

  ('ui.app_update.later', 14, 'زرّ «لاحقاً»', 'يسكّر الإشعار. ما يظهرش في التحديث الإجباري.',
   'لاحقاً', 'Plus tard', 'Später', 'Più tardi', 'Later');

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select key, to_jsonb(ar), 'text', 'ui', label_ar, nullif(description_ar, ''), true, 820 + sort
from _update_texts
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', x.key, 'value', l.locale, to_jsonb(l.value), true
from _update_texts x
cross join lateral (values ('fr', x.fr), ('de', x.de), ('it', x.it), ('en', x.en)) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
