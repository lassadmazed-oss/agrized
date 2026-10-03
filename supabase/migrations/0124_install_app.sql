-- 0124 · «ثبّت التطبيق» — the words on the install card, in the five languages.
--
-- Its test is supabase/tests/075_install_app.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0124_install_app.sql supabase/tests/075_install_app.sql
--
-- THE OWNER'S REQUEST (2026-10-03): «add a install pwa button on the android users … in the landing page».
--
-- The card is src/components/site/install-app.tsx. It draws nothing until Chrome says the site is installable
-- on this phone, so these three strings are read on every render of the home page and shown on very few of
-- them — which is exactly why they belong in settings and not in the component: the owner can reword the offer
-- without a deploy, and he will not be able to see the result on his own screen to check it.
--
-- No feature flag. The browser is the gate: an iPhone, a desktop without Chromium, a phone that has already
-- installed it — none of them ever fire the event, so none of them see the card.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('ui.install.title', to_jsonb('حطّ AgriZed في تلفونك'::text), 'text', 'ui',
   'كرت تثبيت التطبيق · العنوان',
   'الكرت في الصفحة الرئيسية اللي يعرض تثبيت الموقع كتطبيق. يظهر كان في الأندرويد وكان ما كانش مثبّت قبل — فما تنجّمش تشوفو في كل تلفون.', true, 5130),
  ('ui.install.note', to_jsonb('يتحطّ مع تطبيقاتك ويتحلّ من الشاشة الرئيسية، بلا متجر وبلا مساحة تقريباً.'::text), 'text', 'ui',
   'كرت تثبيت التطبيق · الشرح',
   'السطر الصغير تحت العنوان في كرت التثبيت.', true, 5131),
  ('ui.install.cta', to_jsonb('ثبّت'::text), 'text', 'ui',
   'كرت تثبيت التطبيق · الزرّ',
   'زرّ التثبيت. كي يتنقر، المتصفّح روحو يسأل التأكيد.', true, 5132)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.install.title', 'value', 'fr', to_jsonb('Installez AgriZed sur votre téléphone'::text), true),
  ('setting', 'ui.install.title', 'value', 'de', to_jsonb('AgriZed auf Ihr Handy holen'::text), true),
  ('setting', 'ui.install.title', 'value', 'it', to_jsonb('Installa AgriZed sul telefono'::text), true),
  ('setting', 'ui.install.title', 'value', 'en', to_jsonb('Put AgriZed on your phone'::text), true),

  ('setting', 'ui.install.note', 'value', 'fr', to_jsonb('Il rejoint vos applications et s''ouvre depuis l''écran d''accueil, sans passer par un magasin et presque sans espace.'::text), true),
  ('setting', 'ui.install.note', 'value', 'de', to_jsonb('Es liegt bei Ihren Apps und öffnet sich vom Startbildschirm — ohne Store und fast ohne Speicherplatz.'::text), true),
  ('setting', 'ui.install.note', 'value', 'it', to_jsonb('Si aggiunge alle sue app e si apre dalla schermata principale, senza store e quasi senza spazio.'::text), true),
  ('setting', 'ui.install.note', 'value', 'en', to_jsonb('It sits with your apps and opens from the home screen — no store, and almost no space.'::text), true),

  ('setting', 'ui.install.cta', 'value', 'fr', to_jsonb('Installer'::text), true),
  ('setting', 'ui.install.cta', 'value', 'de', to_jsonb('Installieren'::text), true),
  ('setting', 'ui.install.cta', 'value', 'it', to_jsonb('Installa'::text), true),
  ('setting', 'ui.install.cta', 'value', 'en', to_jsonb('Install'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;
