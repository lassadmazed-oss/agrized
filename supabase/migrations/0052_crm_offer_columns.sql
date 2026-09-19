-- bb · The Back Office sees an offer lead as an offer lead (owner, 2026-09-18).
--
-- 0049_offer_intake.sql gave public.interest_requests its offer columns — request_kind, project_id, project_code,
-- project_name, offer_trees, offer_price_per_tree_millimes, offer_total_price_millimes and the annual-fee pair —
-- and public.submit_offer_request fills them. The CRM shows none of them. public.crm_requests is `select r.*`, but
-- a view freezes its column list at creation time, and it was last created in 0032_intake_pricing.sql, before 0049.
-- public.crm_search_requests was last defined in the same file and names its columns one by one, so it could not
-- return them either. That is the whole bug: a client who asked for 25 trees of a named offer is indistinguishable
-- in the leads list from someone who moved a slider on /start.
--
-- The view is dropped and recreated so `select r.*` re-expands over today's table — it picks up the six 0049
-- columns; project_id, project_code and project_name arrived with 0020 and were already exposed. The search
-- function's RETURNS TABLE grows by request_kind, project_id, project_code, project_name and offer_trees, and a
-- request_kind filter tells the two intakes apart. Every other column, parameter, filter, ordering, total and
-- grant is exactly the one 0032 had.
--
-- The security posture is unchanged: the view keeps security_invoker, the function stays `stable security invoker`
-- with an empty search_path, so RLS on interest_requests and persons (app.can_see_person) still decides which
-- files the caller sees, anon keeps nothing and only authenticated may execute. A stable function writes no audit
-- row, as before — the CSV export logs `crm.export` from the server, where it always did.
--
-- TypeScript callers that MUST move in the same commit. A RETURNS TABLE change forces a drop, so the generated
-- types change with it and everything typed from them follows (`grep -rn crm_search_requests src/`):
--   1. src/lib/supabase/database.types.ts             regenerate with `npm run db:types`. Both the crm_requests Row
--                                                     and the crm_search_requests Returns gain the new columns;
--                                                     nothing below compiles against the new names until it is run.
--   2. src/app/admin/(panel)/leads/filters.ts         LeadFilters and parseLeadFilters must accept request_kind
--                                                     ('calculator' | 'offer'). filtersToRpc forwards only the keys
--                                                     parseLeadFilters produced, so without it the URL parameter
--                                                     never reaches the database. This file is the gate for all
--                                                     three callers below.
--   3. src/app/admin/(panel)/leads/page.tsx           the leads list: the request_kind filter control, and the offer
--                                                     name and offer_trees in the table and the mobile cards.
--   4. src/app/admin/(panel)/leads/export/route.ts    the CSV: new HEADER entries and the cells that match them,
--                                                     read off the same row objects.
--   5. src/app/admin/(panel)/leads/actions.ts         bulk assign calls the same RPC with the same filter object; no
--                                                     new code is required, but its row type changes with 1 and the
--                                                     filter round-trip must be re-checked once 2 lands.
-- src/app/admin/(panel)/leads/[personId]/page.tsx reads interest_requests directly with select("*") and already
-- sees the 0049 columns. It needs nothing from this migration.
--
-- Deliberately not applied and not numbered. When it is applied, rename this file to
-- supabase/migrations/00NN_crm_offer_columns.sql and its test to supabase/tests/0NN_crm_offer_columns.sql,
-- with the number in the first line of each, the way 0038 was.

-- ---------------------------------------------------------------------------
-- 1 · The view, rebuilt so `select r.*` re-expands (the function goes first: it depends on the view)
-- ---------------------------------------------------------------------------

drop function if exists public.crm_search_requests(jsonb, integer, integer);

drop view if exists public.crm_requests;
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
-- 2 · The search, with the offer columns and the calculator-vs-offer filter
-- ---------------------------------------------------------------------------

create function public.crm_search_requests(p jsonb, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  request_no text,
  created_at timestamptz,
  -- Which intake brought the demand, and which offer it names (0049)
  request_kind text,
  project_id uuid,
  project_code text,
  project_name text,
  offer_trees integer,
  person_id uuid,
  full_name text,
  phone_e164 text,
  residence_governorate_id smallint,
  residence_delegation_id integer,
  invest_anywhere boolean,
  invest_governorate_ids smallint[],
  project_type_unsure boolean,
  project_type_ids uuid[],
  scenario_labels text[],
  plantation_systems text[],
  production_statuses text[],
  tree_count_code text,
  tree_count_label_ar text,
  tree_count_min integer,
  tree_count_max integer,
  desired_area_label_ar text,
  desired_area_min_m2 numeric,
  desired_area_max_m2 numeric,
  priority_code text,
  priority_label_ar text,
  goal_code text,
  goal_label_ar text,
  down_payment_label_ar text,
  down_payment_min_millimes bigint,
  installment_label_ar text,
  installment_min_millimes bigint,
  duration_months integer,
  duration_label_ar text,
  budget_label_ar text,
  budget_min_millimes bigint,
  wants_visit boolean,
  wants_bank_financing boolean,
  spacing_class_id uuid,
  spacing_label_ar text,
  area_per_tree_m2 numeric,
  total_area_m2 numeric,
  payment_mode text,
  total_price_millimes bigint,
  down_payment_percent numeric,
  down_payment_amount_millimes bigint,
  total_financed_millimes bigint,
  monthly_millimes bigint,
  contact_channel public.contact_channel,
  contact_time_label_ar text,
  is_duplicate boolean,
  source jsonb,
  status_id uuid,
  stage public.lead_stage,
  status_label_ar text,
  assigned_to uuid,
  assigned_to_name text,
  total_count bigint,
  requests_total bigint,
  persons_total bigint,
  trees_total bigint
)
language sql stable security invoker set search_path = '' as $$
  with f as (
    select
      nullif(btrim(p->>'q'), '') as q,
      nullif(regexp_replace(coalesce(p->>'q', ''), '\D', '', 'g'), '') as q_digits,
      -- 0049: «calculator» or «offer». Absent means both, so the list keeps its old meaning by default.
      nullif(p->>'request_kind', '') as request_kind,
      nullif(p->>'project_id', '')::uuid as project_id,
      nullif(p->>'residence_governorate_id', '')::smallint as residence_governorate_id,
      nullif(p->>'residence_delegation_id', '')::integer as residence_delegation_id,
      nullif(p->>'invest_governorate_id', '')::smallint as invest_governorate_id,
      coalesce((p->>'include_anywhere')::boolean, false) as include_anywhere,
      nullif(p->>'project_type_id', '')::uuid as project_type_id,
      coalesce((p->>'include_unsure')::boolean, false) as include_unsure,
      nullif(p->>'plantation_system', '') as plantation_system,
      nullif(p->>'production_status', '') as production_status,
      nullif(p->>'priority_code', '') as priority_code,
      nullif(p->>'area_min', '')::numeric as area_min,
      nullif(p->>'area_max', '')::numeric as area_max,
      coalesce((p->>'include_area_any')::boolean, false) as include_area_any,
      nullif(p->>'trees_min', '')::integer as trees_min,
      nullif(p->>'trees_max', '')::integer as trees_max,
      coalesce((p->>'include_trees_any')::boolean, false) as include_trees_any,
      nullif(p->>'down_min', '')::bigint as down_min,
      nullif(p->>'down_max', '')::bigint as down_max,
      nullif(p->>'installment_min', '')::bigint as installment_min,
      nullif(p->>'installment_max', '')::bigint as installment_max,
      nullif(p->>'duration_min', '')::integer as duration_min,
      nullif(p->>'duration_max', '')::integer as duration_max,
      -- Absent means «any answer»; true or false keeps only the demands that gave that answer.
      nullif(p->>'wants_visit', '')::boolean as wants_visit,
      nullif(p->>'wants_bank_financing', '')::boolean as wants_bank_financing,
      nullif(p->>'spacing_class_id', '')::uuid as spacing_class_id,
      nullif(p->>'payment_mode', '') as payment_mode,
      nullif(p->>'down_payment_percent', '')::numeric as down_payment_percent,
      nullif(p->>'goal_code', '') as goal_code,
      nullif(p->>'stage', '')::public.lead_stage as stage,
      nullif(p->>'status_id', '')::uuid as status_id,
      nullif(p->>'assigned_to', '') as assigned_to,
      nullif(p->>'from', '')::date as date_from,
      nullif(p->>'to', '')::date as date_to,
      nullif(p->>'source', '') as source,
      coalesce((p->>'duplicates_only')::boolean, false) as duplicates_only,
      -- §47 asks «how many people»: one row per person, their latest matching demand
      coalesce((p->>'people')::boolean, false) as people
  ),
  m as (
    select
      c.*,
      row_number() over (partition by c.person_id order by c.created_at desc, c.id desc) as person_rank
    from public.crm_requests c, f
    where (f.q is null
           or c.full_name ilike '%' || app.like_escape(f.q) || '%'
           or c.request_no ilike '%' || app.like_escape(f.q) || '%'
           or (f.q_digits is not null and length(f.q_digits) >= 3 and c.phone_e164 like '%' || f.q_digits || '%'))
      -- The two intakes, told apart (0049). Older demands carry the 'calculator' default, so none is ever lost.
      and (f.request_kind is null or c.request_kind = f.request_kind)
      and (f.project_id is null or c.project_id = f.project_id)
      and (f.residence_governorate_id is null or c.residence_governorate_id = f.residence_governorate_id)
      and (f.residence_delegation_id is null or c.residence_delegation_id = f.residence_delegation_id)
      and (f.invest_governorate_id is null
           or c.invest_governorate_ids @> array[f.invest_governorate_id]
           or (f.include_anywhere and c.invest_anywhere))
      and (f.project_type_id is null
           or c.project_type_ids @> array[f.project_type_id]
           or (f.include_unsure and c.project_type_unsure))
      and (f.plantation_system is null or c.plantation_systems @> array[f.plantation_system])
      and (f.production_status is null or c.production_statuses @> array[f.production_status])
      and (f.priority_code is null or c.priority_code = f.priority_code)
      -- Area overlap: the citizen's range meets the searched range (PARC-12)
      and ((f.area_min is null and f.area_max is null)
           or (f.include_area_any and c.desired_area_min_m2 is null and c.desired_area_max_m2 is null)
           or (c.desired_area_min_m2 is not null
               and (f.area_max is null or c.desired_area_min_m2 <= f.area_max)
               and (f.area_min is null or coalesce(c.desired_area_max_m2, c.desired_area_min_m2) >= f.area_min)))
      -- Tree count overlap, read exactly like the area filter and never derived from it (PARC-02)
      and ((f.trees_min is null and f.trees_max is null)
           or (f.include_trees_any and c.tree_count_min is null and c.tree_count_max is null)
           or (c.tree_count_min is not null
               and (f.trees_max is null or c.tree_count_min <= f.trees_max)
               and (f.trees_min is null or coalesce(c.tree_count_max, c.tree_count_min) >= f.trees_min)))
      and (f.down_min is null or c.down_payment_min_millimes >= f.down_min)
      and (f.down_max is null or c.down_payment_min_millimes <= f.down_max)
      and (f.installment_min is null or c.installment_min_millimes >= f.installment_min)
      and (f.installment_max is null or c.installment_min_millimes <= f.installment_max)
      and (f.duration_min is null or c.duration_months >= f.duration_min)
      and (f.duration_max is null or c.duration_months <= f.duration_max)
      and (f.wants_visit is null or c.wants_visit = f.wants_visit)
      and (f.wants_bank_financing is null or c.wants_bank_financing = f.wants_bank_financing)
      and (f.spacing_class_id is null or c.spacing_class_id = f.spacing_class_id)
      and (f.payment_mode is null or c.payment_mode = f.payment_mode)
      and (f.down_payment_percent is null or c.down_payment_percent = f.down_payment_percent)
      and (f.goal_code is null or c.goal_code = f.goal_code)
      and (f.stage is null or c.stage = f.stage)
      and (f.status_id is null or c.status_id = f.status_id)
      and (f.assigned_to is null
           or (f.assigned_to = 'none' and c.assigned_to is null)
           or c.assigned_to::text = f.assigned_to)
      and (f.date_from is null or c.created_at >= (f.date_from::timestamp at time zone 'Africa/Tunis'))
      and (f.date_to is null or c.created_at < ((f.date_to + 1)::timestamp at time zone 'Africa/Tunis'))
      and (f.source is null or coalesce(c.source->>'utm_source', 'direct') = f.source)
      and (not f.duplicates_only or c.is_duplicate)
  ),
  -- Totals cover the whole filtered set, not the page, and trees skip duplicates (MIL-01)
  t as (
    select
      count(*) as requests,
      count(distinct m.person_id) as persons,
      coalesce(sum(m.tree_count_min) filter (where not m.is_duplicate), 0) as trees
    from m
  )
  select
    m.id, m.request_no, m.created_at,
    m.request_kind, m.project_id, m.project_code, m.project_name, m.offer_trees,
    m.person_id, m.full_name, m.phone_e164,
    m.residence_governorate_id, m.residence_delegation_id,
    m.invest_anywhere, m.invest_governorate_ids, m.project_type_unsure, m.project_type_ids,
    m.scenario_labels, m.plantation_systems, m.production_statuses,
    m.tree_count_code, m.tree_count_label_ar, m.tree_count_min, m.tree_count_max,
    m.desired_area_label_ar, m.desired_area_min_m2, m.desired_area_max_m2,
    m.priority_code, m.priority_label_ar,
    m.goal_code, m.goal_label_ar,
    m.down_payment_label_ar, m.down_payment_min_millimes,
    m.installment_label_ar, m.installment_min_millimes,
    m.duration_months, m.duration_label_ar,
    m.budget_label_ar, m.budget_min_millimes,
    m.wants_visit, m.wants_bank_financing,
    m.spacing_class_id, m.spacing_label_ar, m.area_per_tree_m2, m.total_area_m2, m.payment_mode,
    m.total_price_millimes, m.down_payment_percent, m.down_payment_amount_millimes,
    m.total_financed_millimes, m.monthly_millimes,
    m.contact_channel, m.contact_time_label_ar, m.is_duplicate, m.source,
    m.status_id, m.stage, m.status_label_ar, m.assigned_to, m.assigned_to_name,
    count(*) over () as total_count,
    t.requests, t.persons, t.trees
  from m, t, f
  where not f.people or m.person_rank = 1
  order by m.created_at desc, m.id desc
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0)
$$;

comment on function public.crm_search_requests(jsonb, integer, integer) is
  'CRM list and export (CRM-01..03, spec v2 §47, report v3 §44). Security invoker over crm_requests. total_count counts the rows being paged (persons when p.people is true); requests_total, persons_total and trees_total describe the whole filtered set. duration_min/duration_max are months; wants_visit and wants_bank_financing keep only the demands that gave that answer; spacing_class_id, payment_mode (cash | installments) and down_payment_percent (exact percentage) filter the calculator answers. request_kind (calculator | offer) and project_id filter by the intake the demand came from (0049): an offer demand also carries project_code, project_name and offer_trees.';

revoke execute on function public.crm_search_requests(jsonb, integer, integer) from public, anon;
grant execute on function public.crm_search_requests(jsonb, integer, integer) to authenticated;
