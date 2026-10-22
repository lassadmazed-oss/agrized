-- 0145 · «أكثر من 50» — the last card on /start, after the ladder under it was rebuilt.
--
-- Its test is supabase/tests/092_tree_counts_tail.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0145_tree_counts_tail.sql supabase/tests/092_tree_counts_tail.sql
--
-- 0141 retired 100, 250 and 500 at the owner's word and put 5, 10, 15 and 20 in their place. It left the open
-- end alone, so the calculator finished 25 · 50 · «أكثر من 500» — a jump over a tenfold gap with nothing in
-- it. A reader who wants eighty olive trees had no card to press. The open end now starts where the concrete
-- steps stop, at 50, which is the whole of this change.
--
-- WHY A NEW ROW RATHER THAN A NEW LABEL ON THE OLD ONE. `trees_500p` carries min_number 500, and the demands
-- already sent with it mean «500 or more» — a figure the CRM prints on files people are working. Editing the
-- label in place would rewrite what those demands said. The row is retired the way this list always retires
-- one (0141 did it for three; trees_250p went the same way before them), and the open end that replaces it is
-- its own row with its own floor.

insert into public.option_items (list_key, code, label_ar, label_fr, min_number, max_number, sort_order, is_active) values
  ('tree_count', 'trees_50p', 'أكثر من 50', 'Plus de 50', 50, null, 50, true)
on conflict (list_key, code) do update set
  label_ar = excluded.label_ar, label_fr = excluded.label_fr,
  min_number = excluded.min_number, max_number = excluded.max_number,
  sort_order = excluded.sort_order, is_active = true;

update public.option_items set is_active = false
 where list_key = 'tree_count' and code = 'trees_500p';

-- The label in the four other languages, keyed by the row's id like every other option.
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'option_item', o.id::text, 'label', t.locale, to_jsonb(t.label), true
  from public.option_items o
  join (values
    ('trees_50p', 'fr', 'Plus de 50'),
    ('trees_50p', 'de', 'Mehr als 50'),
    ('trees_50p', 'it', 'Più di 50'),
    ('trees_50p', 'en', 'More than 50')
  ) as t(code, locale, label) on t.code = o.code
 where o.list_key = 'tree_count'
on conflict (entity, entity_key, field, locale) do nothing;

-- The tagline under the card keeps its words and changes its key. The object is rewritten whole for the
-- reason 0141 gives: a key left behind for a card nobody shows is a line the Back Office's texts screen
-- still lists.
update public.settings set value = '{"custom":{"ar":"على قدّ طموحك","fr":"Selon vos ambitions"},"trees_25":{"ar":"بداية مثالية","fr":"Un excellent départ"},"trees_50":{"ar":"خطوة واثقة","fr":"Un choix judicieux"},"trees_any":{"ar":"نقترحولك الأنسب","fr":"Nous vous proposons le plus adapté"},"trees_50p":{"ar":"طموح أكبر","fr":"Une ambition plus grande"},"trees_5":{"ar":"جرّب بالصغير","fr":"Pour essayer"},"trees_10":{"ar":"أوّل تخفيض","fr":"Première remise"},"trees_15":{"ar":"بداية محترمة","fr":"Un bon début"},"trees_20":{"ar":"قريب من 25","fr":"Presque 25"}}'::jsonb where key = 'start.tier_taglines';

update public.translations set value = '{"custom":{"ar":"So groß wie Ihre Ambitionen","fr":"Nach Ihren Ambitionen"},"trees_25":{"ar":"Ein idealer Anfang","fr":"Ein ausgezeichneter Anfang"},"trees_50":{"ar":"Ein sicherer Schritt","fr":"Eine kluge Wahl"},"trees_any":{"ar":"Wir schlagen Ihnen das Passende vor","fr":"Wir schlagen Ihnen das Passende vor"},"trees_50p":{"ar":"Größere Ambitionen","fr":"Größere Ambitionen"},"trees_5":{"ar":"Zum Ausprobieren","fr":"Zum Ausprobieren"},"trees_10":{"ar":"Erster Rabatt","fr":"Erster Rabatt"},"trees_15":{"ar":"Ein guter Start","fr":"Ein guter Start"},"trees_20":{"ar":"Fast 25","fr":"Fast 25"}}'::jsonb
 where entity = 'setting' and entity_key = 'start.tier_taglines' and field = 'value' and locale = 'de';

update public.translations set value = '{"custom":{"ar":"As big as your ambition","fr":"To suit your ambitions"},"trees_25":{"ar":"An ideal start","fr":"An excellent start"},"trees_50":{"ar":"A confident step","fr":"A wise choice"},"trees_any":{"ar":"We''ll suggest what suits you best","fr":"We''ll suggest what suits you best"},"trees_50p":{"ar":"A bigger ambition","fr":"A bigger ambition"},"trees_5":{"ar":"A first taste","fr":"A first taste"},"trees_10":{"ar":"First discount","fr":"First discount"},"trees_15":{"ar":"A solid start","fr":"A solid start"},"trees_20":{"ar":"Almost 25","fr":"Almost 25"}}'::jsonb
 where entity = 'setting' and entity_key = 'start.tier_taglines' and field = 'value' and locale = 'en';

update public.translations set value = '{"custom":{"ar":"À la mesure de vos ambitions","fr":"Selon vos ambitions"},"trees_25":{"ar":"Un départ idéal","fr":"Un excellent départ"},"trees_50":{"ar":"Un pas assuré","fr":"Un choix judicieux"},"trees_any":{"ar":"Nous vous proposons le plus adapté","fr":"Nous vous proposons le plus adapté"},"trees_50p":{"ar":"Une ambition plus grande","fr":"Une ambition plus grande"},"trees_5":{"ar":"Pour essayer","fr":"Pour essayer"},"trees_10":{"ar":"Première remise","fr":"Première remise"},"trees_15":{"ar":"Un bon début","fr":"Un bon début"},"trees_20":{"ar":"Presque 25","fr":"Presque 25"}}'::jsonb
 where entity = 'setting' and entity_key = 'start.tier_taglines' and field = 'value' and locale = 'fr';

update public.translations set value = '{"custom":{"ar":"All''altezza delle Sue ambizioni","fr":"Secondo le Sue ambizioni"},"trees_25":{"ar":"Un inizio ideale","fr":"Un ottimo inizio"},"trees_50":{"ar":"Un passo sicuro","fr":"Una scelta oculata"},"trees_any":{"ar":"Le proponiamo la soluzione più adatta","fr":"Le proponiamo la soluzione più adatta"},"trees_50p":{"ar":"Un''ambizione più grande","fr":"Un''ambizione più grande"},"trees_5":{"ar":"Per iniziare","fr":"Per iniziare"},"trees_10":{"ar":"Primo sconto","fr":"Primo sconto"},"trees_15":{"ar":"Un buon inizio","fr":"Un buon inizio"},"trees_20":{"ar":"Quasi 25","fr":"Quasi 25"}}'::jsonb
 where entity = 'setting' and entity_key = 'start.tier_taglines' and field = 'value' and locale = 'it';
