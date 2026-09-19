-- bb · The Back Office stops offering knobs for a thing the product sells no more (owner, 2026-09-18:
-- «remove the pieces thing, its simply selling the trees» · «remove all the unnecessary stuff»).
--
-- WHAT THIS IS. Fifteen settings rows written for the parcel screens. Every screen that read them was
-- deleted on 2026-09-18 and none was replaced: verified twice, once by grep over all of src/ (no file names
-- any of the fifteen) and once against every stored function in the live database (no function's body names
-- any of the fifteen). They are not dormant — they are unreachable. What is left of them is the settings
-- page, where the owner still reads «أنا مهتم بهذه القطعة», «القطع في هذا المشروع» and three «قطعة صغيرة /
-- متوسطة / أكبر» example cards, inside a projects group of 73 rows, on a platform that sells numbered olive
-- trees. That is the same confusion on the staff side that was taken off the visitor side.
--
-- WHY THIS IS A MIGRATION AND NOT A BACK-OFFICE EDIT. The Back Office edits a row's value; it cannot delete
-- the row. And supabase/tests/006_public_projects.sql T13 asserts eleven of them exist as public text, so
-- deleting them by hand would turn `npm run db:test` red with no record of why.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH, and why each one waits:
--   projects.listing_limit              still read by public.public_parcels(), which still exists.
--   projects.show_taken_parcels         still read by app.parcel_visible_status().
--   projects.offer_includes_interested  still read by app.parcel_offer_statuses(), which app.parcel_offered()
--                                       calls, which public.public_projects() calls — a live public read.
--   The three go in bb_03 with the functions that read them, so no row is ever deleted out from under a caller.
--   legal.parcel_card_note              STAYS. Its key names a parcel, its Arabic names trees and spacing
--                                       («عدد الزيتونات والإنتاج يختلفان حسب المشروع، المسافات الزراعية…»),
--                                       and four live surfaces print it. Renaming the key is its own
--                                       migration, with its readers moved in the same commit.
--
-- ONE ROW WORTH READING BEFORE APPLYING. site.parcels_title does not hold parcel copy any more: the owner
-- edited its value to «شنوّة معناها «ارض و زيتون» عند AgriZed؟». No page reads it (its section was replaced
-- by site.unit_title, «الزيتونة مع مساحتها»), so it is a knob that does nothing — but it is his sentence,
-- and deleting it loses it. If he wants that heading back, it belongs in site.unit_title, not here.
--
-- COMPANION CHANGE, SAME COMMIT: supabase/tests/006_public_projects.sql T13 stops requiring the eleven and
-- asserts instead that none of the fifteen is public copy any more. Apply this file with that test.
-- The one TypeScript leftover is src/app/admin/(panel)/settings/ranges.ts, which still declares a range for
-- projects.listing_limit; that key is not deleted here, so nothing to do until bb_03.
--
-- Deliberately not numbered: migration numbers are claimed at apply time.
-- Spec: MIL-02, PRN-02, §53. Owner decision of 2026-09-18 on the unit of sale.

-- ---------------------------------------------------------------------------
-- The fifteen rows, deleted by name so the list is auditable in the diff
-- ---------------------------------------------------------------------------

-- The lot grid and the parcel page: list heading, the two calls to action, the three «taken» texts,
-- the banner that told a visitor which parcel their request was tied to, and the plan picker.
delete from public.settings where key in (
  'projects.detail_parcels_title',   -- «القطع في هذا المشروع»
  'projects.parcel_cta',             -- «أنا مهتم بهذه القطعة»
  'projects.browse_cta',             -- «شوف القطع اللي تناسبك»
  'projects.taken_hint',             -- «القطع المحجوزة أو المتعاقد عليها تظهر للمعلومة فقط، بلا سعر.»
  'projects.taken_text',
  'projects.taken_cta',
  'projects.interest_banner',        -- «طلبك مرتبط بالقطعة {parcel} من مشروع {project}…»
  'projects.picker_title',
  'projects.picker_nearest',
  'projects.examples_title',
  'projects.examples_note'
);

-- The home page's parcel band: three illustrative «قطعة صغيرة / متوسطة / أكبر» cards, its text and its
-- heading. The band itself became «الزيتونة مع مساحتها» (site.unit_*) on 2026-09-15.
delete from public.settings where key in (
  'site.parcel_examples',
  'site.parcels_text',
  'site.parcels_title'
);

-- Clause 11.1: «a public interest request moves an available parcel to «مهتم بها» in the same transaction».
-- It has had no reader since it was seeded — not in TypeScript, not in any stored function — and it can
-- never gain one: there is no parcel to move, and a tree is moved by staff_allocate_trees with a reason.
delete from public.settings where key = 'projects.interest_marks_parcel';

-- ---------------------------------------------------------------------------
-- The help text under a knob that stays, and no longer describes parcels
-- ---------------------------------------------------------------------------

-- audit.reason_min_length governs the reason §51 demands before a sensitive act. Its description still lists
-- «حالات القطع» among them; what actually asks for a reason today is numbering, reserving, releasing and
-- selling olive trees (staff_generate_trees, staff_allocate_trees, staff_set_tree_state) and price edits.
update public.settings
set description_ar = $t$عدد الأحرف الأدنى لسبب تغيير الأسعار وحالات الزيتونات (الترقيم، الحجز، الرفع، البيع). السبب يُحفظ في سجل العمليات. أقل قيمة مقبولة: 1.$t$,
    updated_at = now()
where key = 'audit.reason_min_length';

-- ---------------------------------------------------------------------------
-- Proof, inside the same transaction: nothing was left half-deleted
-- ---------------------------------------------------------------------------

do $$
declare
  v_left text;
begin
  select string_agg(s.key, ', ' order by s.key) into v_left
  from public.settings s
  where s.key in (
    'projects.detail_parcels_title', 'projects.parcel_cta', 'projects.browse_cta', 'projects.taken_hint',
    'projects.taken_text', 'projects.taken_cta', 'projects.interest_banner', 'projects.picker_title',
    'projects.picker_nearest', 'projects.examples_title', 'projects.examples_note',
    'site.parcel_examples', 'site.parcels_text', 'site.parcels_title', 'projects.interest_marks_parcel');
  assert v_left is null, 'these rows were supposed to go and did not: ' || v_left;

  assert exists (select 1 from public.settings s where s.key = 'legal.parcel_card_note' and s.is_public),
    'legal.parcel_card_note stays: four live surfaces print it';
  assert exists (select 1 from public.settings s where s.key = 'projects.listing_limit'),
    'projects.listing_limit stays until public_parcels() goes (bb_03)';
end $$;
