-- WP-07a · CRM: the olive tree count in every report, people next to requests (spec v2 §20, §21, §46, §47)
--
-- crm_demand_stats gains the trees requested (trees_total, by_tree_count, by_governorate_trees) and a
-- people mode; crm_search_requests returns the totals of the whole filtered set and can list one row per
-- person. Both stay security invoker, so a commercial only ever counts the files RLS lets them see (COM-05).
-- Trees are the lower bound of each stated choice and skip duplicate demands, exactly like
-- public.million_progress() (MIL-01). A number typed on /start (code 'custom') counts like a card.
-- Bulk transfer needs no change: public.admin_assign_persons(uuid[], uuid, text) already takes many files.

-- ---------------------------------------------------------------------------
-- Dashboard and analytics: demand by tree count, governorate and period
-- ---------------------------------------------------------------------------

drop function if exists public.crm_demand_stats(date, date);

create function public.crm_demand_stats(p_from date default null, p_to date default null, p_people boolean default false)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with r as (
    select
      ir.*,
      case when ir.is_duplicate then 0 else coalesce(ir.tree_count_min, 0) end as trees
    from public.interest_requests ir
    where (p_from is null or ir.created_at >= (p_from::timestamp at time zone 'Africa/Tunis'))
      and (p_to is null or ir.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Tunis'))
  ),
  today as (
    select date_trunc('day', now() at time zone 'Africa/Tunis') as day
  ),
  tc as (
    select
      coalesce(r.tree_count_code, '') as code,
      case when p_people then count(distinct r.person_id) else count(*) end as n,
      sum(r.trees) as trees,
      min(r.tree_count_min) as min_number,
      max(r.tree_count_label_ar) as snapshot_label
    from r
    group by 1
  ),
  -- Every active card, then retired cards, typed numbers and blank answers that demands still carry
  tb as (
    select o.code, o.label_ar as label, o.min_number::integer as min_number,
           case when o.min_number is null then 2 else 0 end as rank, o.sort_order
    from public.option_items o
    where o.list_key = 'tree_count' and o.code is not null
      and (o.is_active or exists (select 1 from tc where tc.code = o.code))
    union all
    select tc.code,
           case tc.code
             when 'custom' then app.setting_text('start.custom_label', 'عدد مخصّص')
             when '' then 'بدون إجابة'
             else tc.snapshot_label
           end,
           tc.min_number,
           case tc.code when '' then 3 else 1 end,
           0
    from tc
    where not exists (select 1 from public.option_items o where o.list_key = 'tree_count' and o.code = tc.code)
  ),
  gov as (
    select gid,
           case when p_people then count(distinct r.person_id) else count(*) end as n,
           sum(r.trees) as trees
    from r, unnest(r.invest_governorate_ids) as gid
    group by gid
  )
  select jsonb_build_object(
    'people_mode', p_people,
    'requests', (select count(*) from r),
    'persons', (select count(distinct person_id) from r),
    'duplicates', (select count(*) from r where is_duplicate),
    'trees_total', (select coalesce(sum(trees), 0) from r),
    'today', (select case when p_people then count(distinct person_id) else count(*) end
              from r, today where r.created_at >= (today.day at time zone 'Africa/Tunis')),
    'last_7_days', (select case when p_people then count(distinct person_id) else count(*) end
                    from r where created_at >= now() - interval '7 days'),
    'anywhere', (select case when p_people then count(distinct person_id) else count(*) end from r where invest_anywhere),
    'anywhere_trees', (select coalesce(sum(trees), 0) from r where invest_anywhere),
    'unsure_type', (select case when p_people then count(distinct person_id) else count(*) end from r where project_type_unsure),
    'by_tree_count', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', nullif(tb.code, ''), 'label', tb.label, 'min', tb.min_number,
               'count', coalesce(tc.n, 0), 'trees', coalesce(tc.trees, 0))
             order by tb.rank, tb.sort_order, tb.min_number nulls last, tb.code)
      from tb
      left join tc on tc.code = tb.code
    ), '[]'::jsonb),
    -- A demand naming several governorates counts in each of them: nothing is split or invented.
    'by_invest_governorate', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name_ar, 'count', coalesce(gov.n, 0), 'trees', coalesce(gov.trees, 0))
                       order by coalesce(gov.n, 0) desc, g.sort_order)
      from public.governorates g
      left join gov on gov.gid = g.id
    ), '[]'::jsonb),
    'by_governorate_trees', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name_ar, 'trees', coalesce(gov.trees, 0), 'count', coalesce(gov.n, 0))
                       order by coalesce(gov.trees, 0) desc, coalesce(gov.n, 0) desc, g.sort_order)
      from public.governorates g
      left join gov on gov.gid = g.id
    ), '[]'::jsonb),
    'by_project_type', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.label_ar, 'count', coalesce(c.n, 0)) order by t.sort_order)
      from public.project_types t
      left join (
        select tid, case when p_people then count(distinct r.person_id) else count(*) end as n
        from r, unnest(r.project_type_ids) as tid group by tid
      ) c on c.tid = t.id
    ), '[]'::jsonb),
    'by_scenario', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.label_ar, 'count', coalesce(c.n, 0)) order by s.sort_order)
      from public.ownership_scenarios s
      left join (
        select sid, case when p_people then count(distinct r.person_id) else count(*) end as n
        from r, unnest(r.scenario_ids) as sid group by sid
      ) c on c.sid = s.id
    ), '[]'::jsonb),
    'by_desired_area', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select coalesce(desired_area_label_ar, 'بدون إجابة') as label, desired_area_min_m2 as min,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    'by_priority', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc)
      from (select coalesce(priority_label_ar, 'بدون إجابة') as label,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1) x
    ), '[]'::jsonb),
    'by_plantation_system', coalesce((
      select jsonb_agg(jsonb_build_object('code', o.code, 'name', o.label_ar, 'count', coalesce(c.n, 0)) order by o.sort_order)
      from public.option_items o
      left join (
        select ps, case when p_people then count(distinct r.person_id) else count(*) end as n
        from r, unnest(r.plantation_systems) as ps group by ps
      ) c on c.ps = o.code
      where o.list_key = 'plantation_system'
    ), '[]'::jsonb),
    'by_down_payment', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select down_payment_label_ar as label, down_payment_min_millimes as min,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    'by_installment', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select installment_label_ar as label, installment_min_millimes as min,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    'by_goal', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc)
      from (select goal_label_ar as label,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1) x
    ), '[]'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'count', x.n) order by x.n desc)
      from (select coalesce(source->>'utm_source', 'direct') as source,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0)) order by d.day)
      from today,
           generate_series(today.day - interval '29 days', today.day, interval '1 day') as d(day)
      left join (
        select date_trunc('day', created_at at time zone 'Africa/Tunis') as day,
               case when p_people then count(distinct person_id) else count(*) end as n
        from r group by 1
      ) c on c.day = d.day
    ), '[]'::jsonb)
  )
$$;

comment on function public.crm_demand_stats(date, date, boolean) is
  'Demand report for the dashboard and analytics (spec v2 §46, §47, §55). Security invoker: figures cover only the files the caller may see. p_people counts distinct persons in every breakdown; trees never count duplicates (MIL-01).';

revoke execute on function public.crm_demand_stats(date, date, boolean) from public, anon;
grant execute on function public.crm_demand_stats(date, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- CRM search: totals of the filtered set, and one row per person on request
-- ---------------------------------------------------------------------------

-- The return type grows, so the function is dropped; the arguments and every existing column stay.
drop function if exists public.crm_search_requests(jsonb, integer, integer);

create function public.crm_search_requests(p jsonb, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  request_no text,
  created_at timestamptz,
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
    m.id, m.request_no, m.created_at, m.person_id, m.full_name, m.phone_e164,
    m.residence_governorate_id, m.residence_delegation_id,
    m.invest_anywhere, m.invest_governorate_ids, m.project_type_unsure, m.project_type_ids,
    m.scenario_labels, m.plantation_systems, m.production_statuses,
    m.tree_count_code, m.tree_count_label_ar, m.tree_count_min, m.tree_count_max,
    m.desired_area_label_ar, m.desired_area_min_m2, m.desired_area_max_m2,
    m.priority_code, m.priority_label_ar,
    m.goal_code, m.goal_label_ar,
    m.down_payment_label_ar, m.down_payment_min_millimes,
    m.installment_label_ar, m.installment_min_millimes,
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
  'CRM list and export (CRM-01..03, spec v2 §47). Security invoker over crm_requests. total_count counts the rows being paged (persons when p.people is true); requests_total, persons_total and trees_total describe the whole filtered set.';

revoke execute on function public.crm_search_requests(jsonb, integer, integer) from public, anon;
grant execute on function public.crm_search_requests(jsonb, integer, integer) to authenticated;
