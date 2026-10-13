-- 0141 · أعداد الزيتونات في الحاسبة — the steps the owner actually wants offered.
--
-- Its test is supabase/tests/088_tree_counts.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0141_tree_counts.sql supabase/tests/088_tree_counts.sql
--
-- THE OWNER'S REQUEST (2026-10-13, on /start): «زيد 5-10-15-20، نحّي 250-500-100».
--
-- WHY THE THREE ARE DEACTIVATED AND NOT DELETED. public.interest_requests.tree_count_option_id points at
-- these rows: every demand ever sent with «100 زيتونة» names that option by id. Deleting it would either
-- refuse (the foreign key) or orphan a figure the CRM still prints on a file somebody is working. is_active
-- is how this list has always retired a choice — trees_250p was switched off the same way — and it keeps the
-- old demands readable while the card stops being offered.
--
-- The four new steps sit between «1 زيتونة» and «25 زيتونة», and they are not arbitrary: 10 is where the
-- owner's quantity ladder starts (0132), so the calculator now offers the first discount instead of jumping
-- from 1 to 25 past it.
--
-- Their words are seeded in the five languages, labels and taglines both. start.tier_taglines is rewritten
-- whole rather than patched key by key — the setting is one json object per language, and a key left behind
-- for a card nobody shows is a line the Back Office's texts screen still lists.

update public.option_items set is_active = false
 where list_key = 'tree_count' and code in ('trees_100', 'trees_250', 'trees_500');

insert into public.option_items (list_key, code, label_ar, label_fr, min_number, max_number, sort_order, is_active) values
  ('tree_count', 'trees_5', '5 زيتونات', '5 oliviers', 5, 5, 6, true),
  ('tree_count', 'trees_10', '10 زيتونات', '10 oliviers', 10, 10, 7, true),
  ('tree_count', 'trees_15', '15 زيتونة', '15 oliviers', 15, 15, 8, true),
  ('tree_count', 'trees_20', '20 زيتونة', '20 oliviers', 20, 20, 9, true)
on conflict (list_key, code) do update set
  label_ar = excluded.label_ar, label_fr = excluded.label_fr,
  min_number = excluded.min_number, max_number = excluded.max_number,
  sort_order = excluded.sort_order, is_active = true;

-- The label in the four other languages, keyed by the row's id like every other option.
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', t.locale, to_jsonb(t.label), true
  from public.option_items o
  join (values
    ('trees_5', 'fr', '5 oliviers'),
    ('trees_5', 'de', '5 Olivenbäume'),
    ('trees_5', 'it', '5 ulivi'),
    ('trees_5', 'en', '5 olive trees'),
    ('trees_10', 'fr', '10 oliviers'),
    ('trees_10', 'de', '10 Olivenbäume'),
    ('trees_10', 'it', '10 ulivi'),
    ('trees_10', 'en', '10 olive trees'),
    ('trees_15', 'fr', '15 oliviers'),
    ('trees_15', 'de', '15 Olivenbäume'),
    ('trees_15', 'it', '15 ulivi'),
    ('trees_15', 'en', '15 olive trees'),
    ('trees_20', 'fr', '20 oliviers'),
    ('trees_20', 'de', '20 Olivenbäume'),
    ('trees_20', 'it', '20 ulivi'),
    ('trees_20', 'en', '20 olive trees')
  ) as t(code, locale, label) on t.code = o.code
 where o.list_key = 'tree_count'
on conflict (entity, entity_key, field, locale) do nothing;

-- The one-line tagline under each card, rewritten whole in each language.
update public.settings set value = '{"custom":{"ar":"على قدّ طموحك","fr":"Selon vos ambitions"},"trees_25":{"ar":"بداية مثالية","fr":"Un excellent départ"},"trees_50":{"ar":"خطوة واثقة","fr":"Un choix judicieux"},"trees_any":{"ar":"نقترحولك الأنسب","fr":"Nous vous proposons le plus adapté"},"trees_500p":{"ar":"طموح أكبر","fr":"Une ambition plus grande"},"trees_5":{"ar":"جرّب بالصغير","fr":"Pour essayer"},"trees_10":{"ar":"أوّل تخفيض","fr":"Première remise"},"trees_15":{"ar":"بداية محترمة","fr":"Un bon début"},"trees_20":{"ar":"قريب من 25","fr":"Presque 25"}}'::jsonb where key = 'start.tier_taglines';

update public.translations set value = '{"custom":{"ar":"So groß wie Ihre Ambitionen","fr":"Nach Ihren Ambitionen"},"trees_25":{"ar":"Ein idealer Anfang","fr":"Ein ausgezeichneter Anfang"},"trees_50":{"ar":"Ein sicherer Schritt","fr":"Eine kluge Wahl"},"trees_any":{"ar":"Wir schlagen Ihnen das Passende vor","fr":"Wir schlagen Ihnen das Passende vor"},"trees_500p":{"ar":"Größere Ambitionen","fr":"Größere Ambitionen"},"trees_5":{"ar":"Zum Ausprobieren","fr":"Zum Ausprobieren"},"trees_10":{"ar":"Erster Rabatt","fr":"Erster Rabatt"},"trees_15":{"ar":"Ein guter Start","fr":"Ein guter Start"},"trees_20":{"ar":"Fast 25","fr":"Fast 25"}}'::jsonb
 where entity = 'setting' and entity_key = 'start.tier_taglines' and field = 'value' and locale = 'de';

update public.translations set value = '{"custom":{"ar":"As big as your ambition","fr":"To suit your ambitions"},"trees_25":{"ar":"An ideal start","fr":"An excellent start"},"trees_50":{"ar":"A confident step","fr":"A wise choice"},"trees_any":{"ar":"We''ll suggest what suits you best","fr":"We''ll suggest what suits you best"},"trees_500p":{"ar":"A bigger ambition","fr":"A bigger ambition"},"trees_5":{"ar":"A first taste","fr":"A first taste"},"trees_10":{"ar":"First discount","fr":"First discount"},"trees_15":{"ar":"A solid start","fr":"A solid start"},"trees_20":{"ar":"Almost 25","fr":"Almost 25"}}'::jsonb
 where entity = 'setting' and entity_key = 'start.tier_taglines' and field = 'value' and locale = 'en';

update public.translations set value = '{"custom":{"ar":"À la mesure de vos ambitions","fr":"Selon vos ambitions"},"trees_25":{"ar":"Un départ idéal","fr":"Un excellent départ"},"trees_50":{"ar":"Un pas assuré","fr":"Un choix judicieux"},"trees_any":{"ar":"Nous vous proposons le plus adapté","fr":"Nous vous proposons le plus adapté"},"trees_500p":{"ar":"Une ambition plus grande","fr":"Une ambition plus grande"},"trees_5":{"ar":"Pour essayer","fr":"Pour essayer"},"trees_10":{"ar":"Première remise","fr":"Première remise"},"trees_15":{"ar":"Un bon début","fr":"Un bon début"},"trees_20":{"ar":"Presque 25","fr":"Presque 25"}}'::jsonb
 where entity = 'setting' and entity_key = 'start.tier_taglines' and field = 'value' and locale = 'fr';

update public.translations set value = '{"custom":{"ar":"All''altezza delle Sue ambizioni","fr":"Secondo le Sue ambizioni"},"trees_25":{"ar":"Un inizio ideale","fr":"Un ottimo inizio"},"trees_50":{"ar":"Un passo sicuro","fr":"Una scelta oculata"},"trees_any":{"ar":"Le proponiamo la soluzione più adatta","fr":"Le proponiamo la soluzione più adatta"},"trees_500p":{"ar":"Un''ambizione più grande","fr":"Un''ambizione più grande"},"trees_5":{"ar":"Per iniziare","fr":"Per iniziare"},"trees_10":{"ar":"Primo sconto","fr":"Primo sconto"},"trees_15":{"ar":"Un buon inizio","fr":"Un buon inizio"},"trees_20":{"ar":"Quasi 25","fr":"Quasi 25"}}'::jsonb
 where entity = 'setting' and entity_key = 'start.tier_taglines' and field = 'value' and locale = 'it';
