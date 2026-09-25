-- bb · The parcel layer leaves the database (owner, 2026-09-18: «remove the pieces thing, its simply selling
-- the trees, but legally yes there is a piece — for our system it is not necessary»).
--
-- ███ DO NOT APPLY THIS FILE YET — RE-MEASURED 2026-09-25, and the answer has not changed.
-- ███
-- ███ The file itself now applies cleanly: it used to fail its OWN proof in §9, which matched
-- ███ pg_proc.prosrc against '%public.parcels%' and so fired on app.zitounti_trees for a COMMENT saying it
-- ███ deliberately does not read parcels. That check strips `--` comments now and the migration is green
-- ███ on its own. That was the only thing wrong with the file.
-- ███
-- ███ WHAT IS STILL WRONG IS EVERYTHING AROUND IT. Measured against today's suite, one test at a time,
-- ███ each inside its own rolled-back transaction: the suite is 62/62 green, and with this file applied
-- ███ TWELVE go red:
-- ███
-- ███   003_pricing_matching   005_start_custom_trees   007_parcel_statuses_v2   008_cards_and_costs_v3
-- ███   016_intake_v3          018_intake_pricing       020_project_quote        021_projects_tree
-- ███   030_annual_fee         032_crm_offer_columns    034_trees_intake_and_roles  037_visits
-- ███
-- ███ Most fail with «relation public.parcels does not exist» or «type public.parcel_status does not
-- ███ exist» — they are not incidental, they test the layer this file removes. Retiring the parcel layer
-- ███ means rewriting those twelve first, and that is a piece of work, not a step in a migration run.
-- ███ bb_01 and bb_02 are independent of this file and can be applied today; this one waits.
--
-- WHERE THE LAYER STANDS (verified against the live database, 2026-09-19). public.parcels holds 0 rows. Its
-- only writer, saveParcel(), was deleted on 2026-09-18 and nothing replaced it, so no row can ever be
-- created again. No screen renders a parcel. What is left is 19 functions, 4 triggers, 3 policies, 12 null
-- columns on public.interest_requests and a seven-value enum, three of the functions still granted EXECUTE
-- to `anon` — a public API surface advertising a product that does not exist.
--
-- THE ONE FUNCTION HERE THAT HAS A LIVE CALLER, and why it is in the file anyway.
-- public.public_projects() is read by the whole public site, and it reads public.parcels: a lateral join over
-- an empty table, calling app.parcel_price() and app.parcel_offered() per row, for six columns. It is the
-- last live reader of both helpers, so the layer cannot go while it stands. §1 rewrites it — the lateral
-- goes and six columns with it — and nothing else about it changes. The six:
--   parcels_total, parcels_offered, min_area_m2, max_area_m2, parcel_trees   read by no TypeScript at all.
--   min_cash_price_millimes  read at src/app/(public)/projects/[code]/page.tsx:438, in the fallback branch
--       of offerPrice(). Over 0 parcel rows that column is already always null, so the branch is already
--       unreachable; after this it is `undefined`, which is falsy in the same way. The page behaves
--       identically before and after.
--
-- TYPESCRIPT THAT MUST FOLLOW (none of it is required for the site to keep working, and none of it is in
-- this agent's files — hand it to whoever owns src/lib and src/app):
--   1. npm run db:types                       public_projects() loses six columns; public_parcels,
--                                             public_parcel_offer, public_coverage, staff_parcel_offer,
--                                             staff_project_parcel_prices and match_requests_for_parcel
--                                             disappear from the generated types.
--   2. src/lib/public-projects.ts             delete the six fields from PublicProject and their mapping,
--                                             and the dead exports getPublicParcels, getParcelOffer,
--                                             findParcel, getCoverage, PublicParcel, CoverageRow.
--   3. src/app/(public)/projects/[code]/page.tsx  drop the `min_cash_price_millimes` branch of offerPrice().
--   4. src/lib/parcel-prices.ts               delete the file: it is the last caller of
--                                             staff_project_parcel_prices and has no importer.
--   5. src/lib/errors.ts:54-55                parcel_spacing_not_in_project and spacing_used_by_parcels are
--                                             no longer raised by anything. §4 below raises
--                                             `spacing_used_by_trees` instead and it needs its Arabic line,
--                                             or a staff member removing a spacing class from an offer that
--                                             already has numbered trees gets the generic fallback.
--   6. src/app/admin/(panel)/settings/ranges.ts  drop 'projects.listing_limit' (§8 deletes the row).
--   7. scripts/seed-demo-projects.mjs         inserts into public.parcels at :156 and deletes from it at :74.
--                                             It breaks outright the moment §7 runs. Rewrite it to seed
--                                             offers and call staff_generate_trees, or delete it with its
--                                             `npm run demo:projects` entry in package.json.
--
-- WHAT MUST MOVE FIRST — the ten test files this file turns red, each verified by dry-running it against
-- bb_01 + bb_02 + bb_03. supabase/tests/006, 011 and 012 were rewritten alongside it and are green before
-- and after. These ten were not, and each one must be settled before this file is applied:
--   034_trees_intake_and_roles.sql:1027-1038  THE BLOCKER. It asserts the parcel layer is untouched:
--       to_regclass('public.parcels') is not null, to_regprocedure('public.public_parcels()') is not null,
--       and parcel_status has exactly 7 values. Every step below turns it red on a green database. Invert
--       the assertions or delete the block; nothing else is safe until it is settled.
--   003_pricing_matching.sql:82-90, :139-176  PARC-01/02 (area and tree count are independent facts) is a
--       real rule that outlives the parcel: restate it about public.projects. The four
--       match_requests_for_parcel exercises go, or become a match over trees requested vs trees left.
--   007_parcel_statuses_v2.sql                the whole file is about the seven statuses. Delete it.
--   008_cards_and_costs_v3.sql:53-72          public_parcels() output and its whitelist regex.
--   016_intake_v3.sql:204-207, 018:284-289, 032:166   the twelve snapshot columns (§6).
--   020_project_quote.sql:171-203             six exact-millime cases against app.parcel_price. PORT THEM,
--       do not delete them: they are the only proof the arithmetic is right, and app.project_quote_payload /
--       app.tree_price answer the same question for an offer. :212-237 guards the two error codes.
--   021_projects_tree.sql:75-193              public_parcels() output; T5 (:181-193) is the area fanout §3
--       drops, and has no successor — delete it rather than port it.
--   030_annual_fee.sql:116-142                the annual fee inside app.parcel_price; port with 020's cases.
--
-- Deliberately not numbered: migration numbers are claimed at apply time.
-- Spec: PUB-01, PRJ-02/03, PARC-01/02, FLAG-01..03, §51, §53.

-- ---------------------------------------------------------------------------
-- 0 · The order this file depends on, checked rather than assumed
-- ---------------------------------------------------------------------------

do $$
begin
  assert position('public.parcels' in pg_get_functiondef('public.million_progress()'::regprocedure)) = 0,
    'apply supabase/pending/bb_01_counter_counts_trees.sql first: the «وين وصلنا؟» counter still reads '
    'public.parcels, and this file removes the table under it';
  assert not exists (select 1 from public.settings s where s.key = 'site.parcel_examples'),
    'apply supabase/pending/bb_02_parcel_copy_retires.sql first: the parcel copy rows are still in settings';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The public listing stops reading an empty table (the last live reader)
-- ---------------------------------------------------------------------------

-- The column list changes, so this is a drop and a create: CREATE OR REPLACE cannot change a return type.
drop function if exists public.public_projects();

create function public.public_projects()
returns table (
  id uuid, code text, name text, project_type_id uuid, governorate_id smallint, delegation_id integer,
  location_description text, total_area_m2 numeric, olive_variety text, tree_count integer,
  tree_age_years numeric, plantation_system text, production_status text,
  irrigation public.irrigation_type, status public.project_status,
  offered boolean, on_tree_pricing boolean,
  min_price_per_tree_millimes bigint, area_per_tree_min_m2 numeric, area_per_tree_max_m2 numeric,
  cover_url text, cover_alt_ar text, cover_aspect text
)
language sql stable security definer set search_path = '' as $$
  select
    pj.id, pj.code, pj.name, pj.project_type_id, pj.governorate_id, pj.delegation_id,
    pj.location_description, pj.total_area_m2, pj.olive_variety, pj.tree_count, pj.tree_age_years,
    pj.plantation_system, pj.production_status, pj.irrigation, pj.status,
    (pj.status = 'published'),
    app.project_on_tree_pricing(pj.id),
    -- PRJ-03 unchanged: the only money here is the lowest per-tree price, published only while the offer is
    -- published AND the `pricing` module is open. Stock is a fact and is read from public_offer_stock.
    case when pj.status = 'published' and app.module_open('pricing') then t.min_price_per_tree end,
    t.min_area_per_tree, t.max_area_per_tree,
    c.url, c.alt_ar, null::text
  from public.projects pj
  left join lateral (
    select
      min(cl.area_m2) as min_area_per_tree,
      max(cl.area_m2) as max_area_per_tree,
      min((app.tree_price(cl.id, pj.id)->>'price_per_tree_millimes')::bigint) as min_price_per_tree
    from public.project_spacing_classes psc
    join public.tree_spacing_classes cl on cl.id = psc.spacing_class_id
    where psc.project_id = pj.id
  ) t on true
  left join lateral (
    select m.url, m.alt_ar
    from public.project_media m
    where m.project_id = pj.id
    order by m.is_cover desc, m.sort_order, m.created_at
    limit 1
  ) c on true
  where app.project_visible(pj.status)
  order by (pj.status = 'published') desc, pj.created_at desc
$$;

comment on function public.public_projects() is
  'Public listing surface (PUB-01). min_price_per_tree_millimes (plan P5-4) only for published projects while pricing is open; area_per_tree_min/max_m2 from the project''s spacing classes. How many olive trees an offer still has is a separate read, public_offer_stock (0054), because a count is not a price. Never pricing formulas, land price, planting cost, extras, margin, project_costs, legal_notes, coordinates, staff ids (PRJ-03).';

revoke execute on function public.public_projects() from public;
grant execute on function public.public_projects() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2 · The RPCs with no caller left, in SQL or in TypeScript
-- ---------------------------------------------------------------------------

-- public_parcels, public_parcel_offer and public_coverage are granted to `anon` today, so this is the line
-- that actually shrinks the public API. public_coverage lost its last reader on 2026-09-18, when
-- /projects/map moved to public_offer_stock.
drop function if exists public.public_parcels();
drop function if exists public.public_parcel_offer(uuid, uuid, uuid);
drop function if exists public.public_coverage();
drop function if exists public.staff_parcel_offer(uuid, uuid, uuid);
drop function if exists public.staff_project_parcel_prices(uuid);
drop function if exists public.match_requests_for_parcel(uuid, integer);

-- ---------------------------------------------------------------------------
-- 3 · The trigger that kept a derived area on a row that does not exist
-- ---------------------------------------------------------------------------

-- app.spacing_area_fanout multiplied every parcel's area by its class area whenever a spacing class was
-- edited. With no parcel rows it fires on every spacing edit a staff member makes and updates nothing.
-- Nothing replaces it: a tree carries one class area and every reader multiplies live.
drop trigger if exists tree_spacing_classes_area_fanout on public.tree_spacing_classes;
drop function if exists app.spacing_area_fanout();

-- ---------------------------------------------------------------------------
-- 4 · The one guard that is still needed, aimed at the inventory that exists
-- ---------------------------------------------------------------------------

-- app.check_project_class_in_use fires on public.project_spacing_classes, which is very much alive. It asked
-- «does a parcel of this offer use this class?»; a tree does not carry a class of its own, the offer's class
-- is what prices and sizes every one of its trees. So the rule becomes: an offer whose trees are already
-- numbered may not have a spacing class taken away from it, because that would silently re-price trees a
-- client may already hold.
-- staff_save_project_spacing_classes deletes only classes absent from the new list and re-inserts with
-- `on conflict do nothing`, so saving an unchanged list never reaches this trigger.
create or replace function app.check_project_class_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.project_id = old.project_id and new.spacing_class_id = old.spacing_class_id then
    return new;
  end if;
  if exists (select 1 from public.trees t where t.project_id = old.project_id) then
    raise exception 'spacing_used_by_trees' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

comment on function app.check_project_class_in_use() is
  'Refuses to take a spacing class off an offer whose olive trees are already numbered: their area and their price come from it, and a tree a client holds must not be re-priced by a Back Office edit. Raise code spacing_used_by_trees — src/lib/errors.ts carries its Arabic.';

-- ---------------------------------------------------------------------------
-- 5 · The internal pricing helpers whose only callers were §1 and §2
-- ---------------------------------------------------------------------------

drop function if exists app.parcel_offer_payload(uuid, uuid, uuid, boolean);
drop function if exists app.parcel_down_from(uuid, bigint);
drop function if exists app.parcel_pricing(uuid);
drop function if exists app.parcel_price(uuid);
drop function if exists app.parcel_visible_status(public.parcel_status);
drop function if exists app.parcel_offered(public.project_status, public.parcel_status);
drop function if exists app.parcel_offer_statuses();

-- ---------------------------------------------------------------------------
-- 6 · The twelve snapshot columns on a demand, and the view that freezes them
-- ---------------------------------------------------------------------------

-- All twelve are null on all 31 request rows: no intake has ever written one. project_id, project_code and
-- project_name are NOT among them — submit_offer_request writes all three today (0054 §8) and they stay.
-- public.crm_requests is `select r.*`, which froze its column list at creation, so it has to be rebuilt for
-- the drop to be possible at all. crm_search_requests reads the view but declares its own RETURNS TABLE and
-- names no parcel column, so it needs nothing.
drop view if exists public.crm_requests;

alter table public.interest_requests
  drop column if exists parcel_id,                    -- takes interest_requests_parcel_id_fkey
  drop column if exists parcel_code,                  -- and interest_requests_parcel_idx with it
  drop column if exists parcel_area_m2,
  drop column if exists parcel_property_type,
  drop column if exists parcel_plantation_system,
  drop column if exists parcel_olive_tree_count,
  drop column if exists parcel_production_status,
  drop column if exists parcel_cash_price_millimes,
  drop column if exists parcel_plan_months,
  drop column if exists parcel_plan_total_millimes,
  drop column if exists parcel_plan_last_millimes,
  drop column if exists parcel_captured_at;

create view public.crm_requests with (security_invoker = on) as
select
  r.*,
  p.status_id,
  s.stage,
  s.label_ar as status_label_ar,
  p.assigned_to,
  pr.full_name as assigned_to_name,
  p.archived_at as person_archived_at
from public.interest_requests r
join public.persons p on p.id = r.person_id
join public.lead_statuses s on s.id = p.status_id
left join public.profiles pr on pr.id = p.assigned_to;

revoke all on public.crm_requests from anon;

-- ---------------------------------------------------------------------------
-- 7 · The table, its four triggers, its three policies and its enum
-- ---------------------------------------------------------------------------

-- The triggers (parcels_audit, parcels_spacing_class_check, parcels_stamp, parcels_tree_unit_sync), the
-- three policies (parcels_select, parcels_write, parcels_update — there was never a delete policy, so a
-- parcel has never been deletable through the API) and the six indexes go with the table.
-- public.audit_logs keeps its 138 entity='parcels' rows: the trail is append-only and stays readable, which
-- is why src/app/admin/(panel)/audit/page.tsx:27 must keep its `parcels: "القطع"` label.
drop table if exists public.parcels;

-- Trigger-free now, so they can go.
drop function if exists app.parcel_tree_unit_sync();
drop function if exists app.check_parcel_spacing_class();

drop type if exists public.parcel_status;

-- ---------------------------------------------------------------------------
-- 8 · The last three settings rows, deleted with the functions that read them
-- ---------------------------------------------------------------------------

-- bb_02 deleted the fifteen pure-copy rows and deliberately left these three, because each one still had a
-- reader: projects.listing_limit in public_parcels() (§2), projects.show_taken_parcels in
-- app.parcel_visible_status() and projects.offer_includes_interested in app.parcel_offer_statuses() (§5).
-- All three readers are gone above, so the rows go here.
delete from public.settings where key in (
  'projects.listing_limit',
  'projects.show_taken_parcels',
  'projects.offer_includes_interested'
);

-- The matching weights still explain themselves in parcel words, and the function that scored a parcel went
-- in §2. The weights themselves are untouched: they still score a person against a demand.
update public.settings
set description_ar = $t$مجموع الأوزان الأساسية 100. «priority_bonus» نقاط إضافية كي يخدم العرض أولوية الحريف (PARC-09).$t$,
    updated_at = now()
where key = 'matching.weights';
update public.settings
set description_ar = $t$الحرفاء تحت هذه النتيجة ما يظهروش في اقتراحات العرض.$t$,
    updated_at = now()
where key = 'matching.min_score';

-- ---------------------------------------------------------------------------
-- 9 · Proof, inside the same transaction: nothing is left half-retired
-- ---------------------------------------------------------------------------

do $$
declare
  v_left text;
begin
  assert to_regclass('public.parcels') is null, 'public.parcels is gone';
  assert (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public' and t.typname = 'parcel_status') = 0,
    'public.parcel_status is gone';

  -- COMMENTS ARE STRIPPED BEFORE THIS LOOKS, and that is a correction, not a loosening.
  --
  -- pg_proc.prosrc is the whole body INCLUDING its comments, so `prosrc like '%public.parcels%'` matched
  -- any function that merely mentions the table in prose. app.zitounti_trees (0068) does exactly that, in a
  -- line whose whole point is that it does NOT read parcels: «the offer's plan, not a parcel's —
  -- public.parcels holds no rows and is being retired». This proof therefore failed on a function that is
  -- already correct, and the file refused itself — which is how it came to be marked unappliable.
  --
  -- What matters is whether any function still READS the table. So the `--` comments come out first and the
  -- match runs against code.
  select string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname) into v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public') and p.prokind = 'f'
    and (p.proname like '%parcel%'
         or regexp_replace(p.prosrc, '--[^\n]*', '', 'g') like '%public.parcels%');
  assert v_left is null, 'these functions still name a parcel: ' || coalesce(v_left, '');

  assert not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('interest_requests', 'crm_requests')
      and column_name like 'parcel%'),
    'no demand column names a parcel any more';
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_requests' and column_name = 'offer_trees'),
    'the rebuilt view still carries the offer columns';

  -- PRJ-03 in one line: the public listing publishes a per-tree price and no other money.
  assert pg_get_function_result('public.public_projects()'::regprocedure)
         !~ '\m(pricing|legal_notes|land_offer|plan_storage|latitude|longitude|updated_by|annual_costs|notes|cash_price)\M',
    'public_projects() exposes no internal column';
  assert has_function_privilege('anon', 'public.public_projects()', 'execute'),
    'a visitor still reads the listing';
  assert coalesce((select p.proacl::text from pg_proc p
                   where p.oid = 'public.public_projects()'::regprocedure), '') not like '{=X/%',
    'the listing carries no PUBLIC execute';

  -- The offer inventory is untouched by all of the above.
  assert (select count(*) from public.trees) > 0, 'the olive trees are still there';
end $$;
