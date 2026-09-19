-- The words follow the unit: the visitor reads «زيتونة», not «قطعة» (owner, 2026-09-18).
--
-- «remove the pieces thing, its simply selling the trees» · «we just give each tree a number or an id and
-- associate it with the client». Migration 0054 made the tree the unit of inventory and the screens were
-- rebuilt on it, but six texts a visitor actually reads still described parcels. A page that counts trees and
-- calls them plots contradicts itself out loud, and the owner reads these rows in the Back Office too.
--
-- ONLY THE SIX THAT STILL REACH SOMEONE. Nine more parcel texts exist — projects.browse_cta,
-- projects.detail_parcels_title, projects.interest_banner, projects.parcel_cta, projects.taken_cta,
-- projects.taken_hint, projects.taken_text, site.parcel_examples, site.parcels_text. No code reads any of them
-- any more, and seven are asserted by supabase/tests/006_public_projects.sql, so removing them here would break
-- a PRJ-03 guard test to no one's benefit. They belong to the phase that retires the parcel layer from the
-- database, which updates 006 with them.
--
-- Every value below is a setting: the owner rewrites any of them from the Back Office without a deploy, and an
-- emptied one falls back to the code's own fallback, as before. Nothing here changes what a page computes.

update public.settings set value = to_jsonb('وين تلقى زيتونتك؟'::text), updated_at = now()
where key = 'projects.map_title' and value #>> '{}' = 'وين تلقى قطعتك؟';

update public.settings set value = to_jsonb(
  'الأرقام هي عدد العروض والزيتونات المتاحة فعلاً في كل ولاية اليوم. الولايات بلا رقم مفتوحة للتسجيل، والطلبات هي اللي تقرّر وين نلوّجو بعد.'::text
), updated_at = now()
where key = 'projects.map_text' and value #>> '{}' like '%القطع%';

update public.settings set value = to_jsonb(
  'ما فماش زيتونات متاحة بهذه المعايير توّا. سجّل مطلبك ونعلموك أول ما يتوفّر عرض يشبه اللي تحب.'::text
), updated_at = now()
where key = 'projects.empty_text' and value #>> '{}' like '%قطع%';

update public.settings set value = to_jsonb(
  'زيتونات حقيقية: كل زيتونة برقمها ومساحتها وسعرها، حاضر أو بالتقسيط. بلا وعود.'::text
), updated_at = now()
where key = 'projects.meta_description' and value #>> '{}' like '%قطع%';

update public.settings set value = to_jsonb(
  'حاضر، أو تسبقة ثم أقساط شهرية تسهّل البداية: بمبلغ شهري بسيط يتحوّل الإدخار لأصل ملموس. التفاصيل تتحسب لكل زيتونة، والمبلغ النهائي والمدة يُضبطان في وعد البيع.'::text
), updated_at = now()
where key = 'projects.payment_text' and value #>> '{}' like '%قطعة%';

-- The value was already about trees; only the row's own name in the Back Office still said «القطعة».
update public.settings set label_ar = 'تنبيه بطاقة العرض', updated_at = now()
where key = 'legal.parcel_card_note';
