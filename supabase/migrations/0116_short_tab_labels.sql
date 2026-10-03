-- 0116 · كلمات الشريط — THE PHONE'S TAB BAR GETS WORDS THAT FIT IT.
--
-- Five tabs share 375 pixels, about 70 each. In Arabic the tabs borrowed the titles of the pages they open
-- («عروضنا»، «حسابي»، «احسب مشروعك») and fitted. In French, German, Italian and English the same titles —
-- «Calculez votre projet», «Le nostre offerte», «Il mio account» — wrap onto two lines and push the icons up.
-- So the bar has its own two words (offers, account) and the calculator's draft becomes one verb. The Arabic is
-- unchanged: the same words the bar always showed.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('ui.shell.tab_offers',  to_jsonb('عروضنا'::text), 'text', 'ui', 'خانة العروض في شريط التلفون',
   'الشريط اللي في أسفل شاشة التلفون. كلمة قصيرة: الخانة عرضها قرابة 70 بيكسل.', true, 910),
  ('ui.shell.tab_account', to_jsonb('حسابي'::text),  'text', 'ui', 'خانة الحساب في شريط التلفون',
   'الشريط اللي في أسفل شاشة التلفون. كلمة قصيرة: الخانة عرضها قرابة 70 بيكسل.', true, 920)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.shell.tab_offers',  'value', 'fr', '"Offres"', true),
  ('setting', 'ui.shell.tab_offers',  'value', 'de', '"Angebote"', true),
  ('setting', 'ui.shell.tab_offers',  'value', 'it', '"Offerte"', true),
  ('setting', 'ui.shell.tab_offers',  'value', 'en', '"Offers"', true),
  ('setting', 'ui.shell.tab_account', 'value', 'fr', '"Compte"', true),
  ('setting', 'ui.shell.tab_account', 'value', 'de', '"Konto"', true),
  ('setting', 'ui.shell.tab_account', 'value', 'it', '"Account"', true),
  ('setting', 'ui.shell.tab_account', 'value', 'en', '"Account"', true)
on conflict (entity, entity_key, field, locale) do nothing;

-- The calculator tab: one verb. Only drafts are touched — a word the owner already saved stays his.
update public.translations t set value = d.value
from (values ('fr', '"Simuler"'::jsonb), ('de', '"Rechner"'::jsonb), ('it', '"Calcola"'::jsonb), ('en', '"Calculate"'::jsonb)) as d (locale, value)
where t.entity = 'setting' and t.entity_key = 'site.tab_calculator' and t.field = 'value' and t.locale = d.locale and t.is_draft;
