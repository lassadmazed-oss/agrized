-- The CRM sees who lives abroad (0121 added the column; a view does not grow one by itself).
--
-- public.crm_requests enumerates its columns at creation time, so the moment 0121 added interest_requests
-- .lives_abroad the view stopped carrying every column of its own table and test 032 said so. «create or
-- replace view» cannot add a column in the middle, so both the view and the function that reads it are
-- dropped and rebuilt — from their live definitions, with nothing else changed.
--
-- crm_search_requests gains the column on the way out AND as a filter, because the reason the owner asked for
-- the question is to work the diaspora as a segment: «وريني الحرفاء اللي بالخارج» has to be answerable.

drop function if exists public.crm_search_requests(jsonb, integer, integer);
drop view if exists public.crm_requests;

create view public.crm_requests with (security_invoker = on) as
 SELECT r.id,
    r.request_no,
    r.person_id,
    r.full_name,
    r.phone_e164,
    r.whatsapp_e164,
    r.email,
    r.residence_governorate_id,
    r.lives_abroad,
    r.residence_delegation_id,
    r.invest_anywhere,
    r.invest_governorate_ids,
    r.project_type_unsure,
    r.project_type_ids,
    r.goal_option_id,
    r.goal_code,
    r.goal_label_ar,
    r.down_payment_option_id,
    r.down_payment_label_ar,
    r.down_payment_min_millimes,
    r.down_payment_max_millimes,
    r.installment_option_id,
    r.installment_label_ar,
    r.installment_min_millimes,
    r.installment_max_millimes,
    r.contact_channel,
    r.contact_time_option_id,
    r.contact_time_label_ar,
    r.is_duplicate,
    r.source,
    r.consent_text,
    r.created_at,
    r.scenario_ids,
    r.scenario_labels,
    r.plantation_systems,
    r.production_statuses,
    r.desired_area_option_id,
    r.desired_area_label_ar,
    r.desired_area_min_m2,
    r.desired_area_max_m2,
    r.priority_option_id,
    r.priority_code,
    r.priority_label_ar,
    r.tree_count_option_id,
    r.tree_count_code,
    r.tree_count_label_ar,
    r.tree_count_min,
    r.tree_count_max,
    r.parcel_id,
    r.project_id,
    r.project_code,
    r.project_name,
    r.parcel_code,
    r.parcel_area_m2,
    r.parcel_property_type,
    r.parcel_plantation_system,
    r.parcel_olive_tree_count,
    r.parcel_production_status,
    r.parcel_cash_price_millimes,
    r.parcel_plan_months,
    r.parcel_plan_total_millimes,
    r.parcel_plan_last_millimes,
    r.parcel_captured_at,
    r.duration_option_id,
    r.duration_label_ar,
    r.duration_months,
    r.budget_option_id,
    r.budget_label_ar,
    r.budget_min_millimes,
    r.budget_max_millimes,
    r.wants_visit,
    r.wants_bank_financing,
    r.spacing_class_id,
    r.spacing_label_ar,
    r.area_per_tree_m2,
    r.total_area_m2,
    r.payment_mode,
    r.price_per_tree_millimes,
    r.total_price_millimes,
    r.down_payment_percent_option_id,
    r.down_payment_percent,
    r.down_payment_amount_millimes,
    r.total_financed_millimes,
    r.monthly_millimes,
    r.request_kind,
    r.offer_trees,
    r.offer_price_per_tree_millimes,
    r.offer_total_price_millimes,
    r.offer_annual_fee_per_tree_millimes,
    r.offer_annual_fee_total_millimes,
    p.status_id,
    s.stage,
    s.label_ar AS status_label_ar,
    p.assigned_to,
    pr.full_name AS assigned_to_name,
    p.archived_at AS person_archived_at
   FROM interest_requests r
     JOIN persons p ON p.id = r.person_id
     JOIN lead_statuses s ON s.id = p.status_id
     LEFT JOIN profiles pr ON pr.id = p.assigned_to;;

revoke all on public.crm_requests from anon;

CREATE OR REPLACE FUNCTION public.crm_search_requests(p jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, request_no text, created_at timestamp with time zone, request_kind text, project_id uuid, project_code text, project_name text, offer_trees integer, person_id uuid, full_name text, phone_e164 text, residence_governorate_id smallint, lives_abroad boolean, residence_delegation_id integer, invest_anywhere boolean, invest_governorate_ids smallint[], project_type_unsure boolean, project_type_ids uuid[], scenario_labels text[], plantation_systems text[], production_statuses text[], tree_count_code text, tree_count_label_ar text, tree_count_min integer, tree_count_max integer, desired_area_label_ar text, desired_area_min_m2 numeric, desired_area_max_m2 numeric, priority_code text, priority_label_ar text, goal_code text, goal_label_ar text, down_payment_label_ar text, down_payment_min_millimes bigint, installment_label_ar text, installment_min_millimes bigint, duration_months integer, duration_label_ar text, budget_label_ar text, budget_min_millimes bigint, wants_visit boolean, wants_bank_financing boolean, spacing_class_id uuid, spacing_label_ar text, area_per_tree_m2 numeric, total_area_m2 numeric, payment_mode text, total_price_millimes bigint, down_payment_percent numeric, down_payment_amount_millimes bigint, total_financed_millimes bigint, monthly_millimes bigint, contact_channel contact_channel, contact_time_label_ar text, is_duplicate boolean, source jsonb, status_id uuid, stage lead_stage, status_label_ar text, assigned_to uuid, assigned_to_name text, total_count bigint, requests_total bigint, persons_total bigint, trees_total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with f as (
    select
      nullif(btrim(p->>'q'), '') as q,
      nullif(regexp_replace(coalesce(p->>'q', ''), '\D', '', 'g'), '') as q_digits,
      -- 0049: «calculator» or «offer». Absent means both, so the list keeps its old meaning by default.
      nullif(p->>'request_kind', '') as request_kind,
      nullif(p->>'project_id', '')::uuid as project_id,
      nullif(p->>'residence_governorate_id', '')::smallint as residence_governorate_id,
      nullif(p->>'lives_abroad', '')::boolean as lives_abroad,
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
      and (f.lives_abroad is null or c.lives_abroad = f.lives_abroad)
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
    m.residence_governorate_id,
    m.lives_abroad, m.residence_delegation_id,
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
$function$
;

-- A recreated function is granted to PUBLIC by default, which would hand the CRM search to every visitor.
-- Test 032 catches exactly that, and these two lines are what it is asking for.
revoke execute on function public.crm_search_requests(jsonb, integer, integer) from public, anon;
grant execute on function public.crm_search_requests(jsonb, integer, integer) to authenticated, service_role;

comment on view public.crm_requests is
  'Every column of interest_requests plus the person''s CRM state. Rebuilt whenever interest_requests gains a column — test 032 is the guard.';
