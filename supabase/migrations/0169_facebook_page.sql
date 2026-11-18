-- The Facebook page on the site (owner, 2026-11-18: the page facebook.com/profile.php?id=61592854362769, «نربطوها
-- بالبلاتفورم باش نحضّرو كومباني بيبليسيتير»). The ad sends people from the page to the site (/story/<code>, the
-- links of /admin/stories); this sends them back: the footer's contact column and the home page's closing card
-- carry «صفحتنا على فايسبوك».
--
-- Test: supabase/tests/115_facebook_page.sql
--
-- The page itself is already known to the Back Office as public.social_accounts (network facebook, external_id
-- 61592854362769, 0157); this does not touch it. Posting from the platform still waits for the Page access token
-- the owner pastes into /admin/marketing.
--
-- Both are settings: emptying site.facebook_url removes the link everywhere.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.facebook_url', to_jsonb('https://www.facebook.com/profile.php?id=61592854362769'::text), 'text', 'site',
   'رابط صفحة فايسبوك', 'يبان في آخر كل صفحة وفي آخر الصفحة الرئيسية. فارغ ينحّي الرابط.', true, 105),
  ('site.facebook_label', to_jsonb('صفحتنا على فايسبوك'::text), 'text', 'site', 'اسم رابط صفحة فايسبوك', null, true, 106)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'site.facebook_label', 'value', 'fr', to_jsonb('Notre page Facebook'::text), true),
  ('setting', 'site.facebook_label', 'value', 'de', to_jsonb('Unsere Facebook-Seite'::text), true),
  ('setting', 'site.facebook_label', 'value', 'it', to_jsonb('La nostra pagina Facebook'::text), true),
  ('setting', 'site.facebook_label', 'value', 'en', to_jsonb('Our Facebook page'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;
