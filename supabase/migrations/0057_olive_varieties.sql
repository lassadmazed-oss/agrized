-- «الصنف» becomes a list you pick from (owner, 2026-09-19: «list all the existing types, this should be one
-- thing I copy»).
--
-- The variety was a free text box on the offer card, so every offer could spell the same cultivar differently —
-- شملالي, chemlali, Chemlali — and nothing could ever group or filter by it. It is a closed set in practice: the
-- olive varieties grown in Tunisia are known, and a new one arrives once in a decade.
--
-- The list lives in option_lists / option_items like every other list in this product, so the owner adds,
-- renames, reorders or deactivates a variety from «الإعدادات ← القوائم» without a deploy, and src/lib/config.ts
-- picks it up with no code change: it already loads every active option item and filters by list_key.
--
-- public.projects.olive_variety STAYS a text column and is not constrained to these codes. The offers already
-- entered keep their value — OFF-TNAYEUR reads «شملالي», which is the first row below — and an offer planted
-- with something nobody listed can still be written down. The list is a shortcut, not a gate.
--
-- Order: the oil varieties this owner actually meets first (he plants around Sfax, which is Chemlali country),
-- then the regional ones, then the table olives, then the introduced varieties used in super-intensive groves.

insert into public.option_lists (key, label_ar, value_kind, description_ar)
values (
  'olive_variety',
  'أصناف الزيتون',
  'plain',
  'الأصناف اللي تظهر في قائمة «الصنف» في بطاقة العرض. تنجّم تزيد صنف، تبدّل اسمو، ترتّبهم، ولّا تعطّل واحد ما عادش تستعملو. العرض ينجّم زادة يتكتبلو صنف موش في القائمة.'
)
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order, is_active) values
  -- Oil varieties, by how much of the country they cover
  ('olive_variety', 'chemlali',  'شملالي',            'Chemlali',   10, true),
  ('olive_variety', 'chetoui',   'شتوي',              'Chétoui',    20, true),
  ('olive_variety', 'oueslati',  'وسلاتي',            'Oueslati',   30, true),
  ('olive_variety', 'zalmati',   'زلماطي',            'Zalmati',    40, true),
  ('olive_variety', 'zarrazi',   'زرازي',             'Zarrazi',    50, true),
  ('olive_variety', 'chemchali', 'شمشالي',            'Chemchali',  60, true),
  ('olive_variety', 'jemri',     'جمري',              'Jemri',      70, true),
  ('olive_variety', 'besbessi',  'بسباسي',            'Besbessi',   80, true),
  ('olive_variety', 'sahli',     'ساحلي',             'Sahli',      90, true),
  -- Table olives
  ('olive_variety', 'meski',     'مسكي (زيتون مائدة)', 'Meski',     100, true),
  ('olive_variety', 'picholine', 'بيشولين',           'Picholine', 110, true),
  -- Introduced varieties, the ones super-intensive groves are planted with
  ('olive_variety', 'arbequina', 'أربيكينا',          'Arbequina', 120, true),
  ('olive_variety', 'arbosana',  'أربوزانا',          'Arbosana',  130, true),
  ('olive_variety', 'koroneiki', 'كورونيكي',          'Koroneiki', 140, true),
  -- A grove that was not planted with one single variety
  ('olive_variety', 'mixed',     'مخلوط',             'Mélangé',   150, true)
on conflict (list_key, code) do nothing;
