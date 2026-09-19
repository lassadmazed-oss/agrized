-- bb · «وين وصلنا؟» counts olive trees, not parcels (owner, 2026-09-19: «نظّم المنصة من الأول إلى الآخر»).
--
-- THE UNTRUTH THIS ENDS. public.million_progress() computes trees_reserved, trees_contracted and
-- trees_planted by summing public.parcels.olive_tree_count (0025 §41-44). public.parcels holds 0 rows, has
-- had no writer since saveParcel() was deleted on 2026-09-18, and no screen can create one. So the home
-- page tells every visitor «0 زيتونة محجوزة · 0 متعاقد عليها · 0 مغروسة» while 600 numbered olive trees
-- sit in public.trees — and the figures are not merely zero, they are frozen: reserving a tree through
-- public.staff_allocate_trees would not move them either. The section's own note says «الأرقام هذي حقيقية
-- وتتحدّث مع كل مطلب جديد»; today it cannot.
--
-- WHY THIS IS SAFE TO APPLY FIRST, ALONE. Every figure it touches reads 0 before and after:
--   parcels: 0 rows → reserved 0, contracted 0, planted 0
--   trees:   600 rows, all `available`, 0 offers in `operating` → reserved 0, contracted 0, planted 0
-- Nothing on the live site changes the day this is applied. What changes is that the figures can move
-- afterwards, the moment the Back Office reserves its first tree.
--
-- WHAT EACH FIGURE READS NOW, AND WHY.
--   trees_reserved     count of public.trees rows in state 'reserved'.   One-to-one with the parcel version.
--   trees_contracted   count of public.trees rows in state 'sold'.       NOT one-to-one: see §2 below.
--   trees_planted      count of public.trees rows whose offer is in status 'operating'. The parcel version
--                      was already project-driven (`pj.status = 'operating'`), so this survives unchanged in
--                      meaning: it is «what is in the ground», decided by the offer, not by one tree.
--   trees_requested    unchanged. Demand, not inventory: the lower bound of every non-duplicate request.
--   participants       unchanged. Distinct persons.
--   requests           unchanged, and still unrendered — see the note at the end of §1.
--   projects_under_study unchanged. draft + preparing + internal projects.
--   goal               unchanged in source (the million.goal setting), changed in fallback — see §1.
-- No figure was dropped: every one of the eight has an honest source over trees. The one that needed a
-- decision rather than a rewrite is trees_contracted, and §2 settles it in copy rather than in SQL.
--
-- GUARANTEES KEPT, UNCHANGED. Same module gate (`public_statistics`, §54/FLAG-01) with the same escape for
-- a direct database session, so migrations, tests and scripts still read whatever the flag says. Same
-- `security definer set search_path = ''`. Same grants (anon, authenticated; never PUBLIC). Counts only,
-- never personal data (MIL-01), and no money key anywhere in the payload (PRJ-03) — not a price, not a
-- formula, not a millime. Test 011 re-asserts all four properties.
--
-- COMPANION CHANGE, SAME COMMIT: supabase/tests/011_million_counter_split.sql. Its section 2 builds eleven
-- parcels and asserts three exact deltas; it now builds an offer, numbers its trees and allocates them.
-- APPLY THIS FILE AND THAT TEST TOGETHER — 011 is red before it, green after it.
--
-- NO TypeScript follows. src/lib/million.ts maps the same eight keys and reads each as `row[key] ?? 0`;
-- the RPC's return type is jsonb, so nothing is regenerated and `npx tsc --noEmit` is unaffected.
--
-- Deliberately not numbered: migration numbers are claimed at apply time. When it is applied, rename it to
-- supabase/migrations/00NN_counter_counts_trees.sql with the number in the first line, the way 0038 was.
-- Spec: MIL-01, MIL-02, PRN-01, PRJ-03, §6, §54.

-- ---------------------------------------------------------------------------
-- 1 · The counter, read from the inventory that exists
-- ---------------------------------------------------------------------------

-- The `goal` fallback moves from 1,000,000 to 0. The live row is already 0 and 0053 wrote down why — «الهدف
-- مش الوصول لرقم مليون زيتونة» — so a fallback that resurrects the million the day someone deletes the row
-- is a lie waiting to happen. 0 is the honest default: MillionCounter draws no bar while goal is 0.
create or replace function public.million_progress() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    -- A direct database session carries no JWT (migrations, tests, scripts) and always reads.
    when app.module_open('public_statistics')
      or coalesce(current_setting('request.jwt.claims', true), '') = ''
    then (
      select jsonb_build_object(
        'goal', app.setting_int('million.goal', 0),
        -- Lower bound of every stated choice, so the figure is never larger than what people asked for.
        'trees_requested', coalesce((
          select sum(r.tree_count_min) from public.interest_requests r where not r.is_duplicate
        ), 0),
        'participants', (
          select count(distinct r.person_id) from public.interest_requests r
        ),
        'requests', (select count(*) from public.interest_requests r where not r.is_duplicate),
        -- Land being studied before anything is offered: draft, preparing and internal projects.
        'projects_under_study', (
          select count(*) from public.projects pj
          where pj.status in ('draft', 'preparing', 'internal')
        ),
        'trees_reserved', t.reserved,
        'trees_contracted', t.contracted,
        'trees_planted', t.planted
      )
      from (
        select
          count(*) filter (where tr.state = 'reserved')  as reserved,
          -- public.tree_state holds no 'contracting': a tree is sold or it is not. The tile's hint is
          -- reworded in §2 so the word on screen says only what this counts.
          count(*) filter (where tr.state = 'sold')      as contracted,
          -- «مغروسة / موجودة فعلياً» is a fact about the land, so the offer's status decides, exactly as
          -- it did before this rewrite. An offer in 'operating' whose trees were never numbered adds 0;
          -- that gap is visible in the Back Office as «عروض ما ترقّمتش زيتوناتها», which is where it belongs.
          count(*) filter (where pj.status = 'operating') as planted
        from public.trees tr
        join public.projects pj on pj.id = tr.project_id
      ) t
    )
  end
$$;

-- `requests` is kept, though no component has ever rendered it: it is a true count with an honest source,
-- and src/lib/million.ts still maps it. Dropping the key would need that file changed in the same commit,
-- and a key silently reading 0 would be worse than an unused key reading the truth. Give it a tile with its
-- own million.tile_requests_label setting, or drop both together — not one without the other.

comment on function public.million_progress() is
  'Aggregate counters for the public «وين وصلنا؟» section, split by stage (spec v2 §6). Reserved, contracted and planted are counts of public.trees rows — the unit of inventory since 2026-09-18 — not of public.parcels. Counts only, never personal data (MIL-01), and no money (PRJ-03). Returns null to API callers while the public_statistics module is closed to them (§54).';

-- CREATE OR REPLACE keeps the existing ACL; these two lines restate it so the posture is readable here.
revoke execute on function public.million_progress() from public;
grant execute on function public.million_progress() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · The one tile whose word stopped being true, and three help texts that name a retired thing
-- ---------------------------------------------------------------------------

-- Over parcels this tile counted three statuses — contracting, sold and owned — and its hint promised
-- «عقود فعلية أو في طور الإمضاء». Over trees only 'sold' exists (0054 left 'contracting' out on purpose:
-- it «would split المباعة in two and the owner named four figures, not five»). So the hint now promises
-- something the figure no longer contains. Rather than add a fourth tree state to fit an old sentence,
-- the sentence says what the number is.
update public.settings
set value = to_jsonb($t$زيتونات تمّ إمضاء عقودها.$t$::text), updated_at = now()
where key = 'million.tile_contracted_hint';
update public.settings
set value = to_jsonb($t$Oliviers dont le contrat est signé.$t$::text), updated_at = now()
where key = 'million.tile_contracted_hint_fr';

-- The Back Office help under each tile still described parcels («زيتونات القطع المحجوزة»), which is the
-- owner reading, in the screen where he edits the site, a word the product dropped. Values are untouched;
-- only the explanation of where each number comes from changes.
update public.settings
set description_ar = $t$عدد الزيتونات اللي حالتها «محجوزة» في جرد الزيتونات (البند 6). اتركه فارغاً لإخفاء الخانة.$t$,
    updated_at = now()
where key = 'million.tile_reserved_label';

update public.settings
set description_ar = $t$عدد الزيتونات اللي حالتها «مباعة» في جرد الزيتونات (البند 6). ما فماش حالة «في طور التعاقد»: الزيتونة مباعة ولا لا. اتركه فارغاً لإخفاء الخانة.$t$,
    updated_at = now()
where key = 'million.tile_contracted_label';

update public.settings
set description_ar = $t$الرقم يحسب كان الزيتونات المباعة، على خاطر ما فماش حالة «في طور التعاقد» في جرد الزيتونات.$t$,
    updated_at = now()
where key = 'million.tile_contracted_hint';

update public.settings
set description_ar = $t$عدد زيتونات العروض اللي دخلت طور الاستغلال (البند 6). اتركه فارغاً لإخفاء الخانة.$t$,
    updated_at = now()
where key = 'million.tile_planted_label';
