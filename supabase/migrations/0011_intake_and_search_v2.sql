-- 0011 · Intake, CRM search and dashboard statistics for the new answers (clause 25).
-- The scenario the citizen picks decides the project type; the area and the priority are stored as given.

create or replace function public.submit_interest_request(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name         text := btrim(coalesce(p->>'full_name', ''));
  v_phone        text := p->>'phone_e164';
  v_whatsapp     text := nullif(p->>'whatsapp_e164', '');
  v_email        text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_gov          smallint := nullif(p->>'residence_governorate_id', '')::smallint;
  v_del          integer := nullif(p->>'residence_delegation_id', '')::integer;
  v_anywhere     boolean := coalesce((p->>'invest_anywhere')::boolean, false);
  v_unsure       boolean := coalesce((p->>'project_type_unsure')::boolean, false);
  v_consent      text := nullif(btrim(coalesce(p->>'consent_text', '')), '');
  v_invest_govs  smallint[];
  v_types        uuid[];
  v_scenarios    uuid[];
  v_scn_labels   text[] := '{}';
  v_plantation   text[] := '{}';
  v_production   text[] := '{}';
  v_any_scenario boolean := false;
  v_channel      public.contact_channel;
  v_goal         public.option_items;
  v_down         public.option_items;
  v_inst         public.option_items;
  v_time         public.option_items;
  v_area         public.option_items;
  v_priority     public.option_items;
  v_status_id    uuid;
  v_person_id    uuid;
  v_inserted     boolean;
  v_assignee     uuid;
  v_year         text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_request_no   text;
  v_request_id   uuid;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'invalid_full_name' using errcode = 'P0001';
  end if;
  perform app.assert_phone(v_phone, 'invalid_phone');
  if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_whatsapp' using errcode = 'P0001';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_consent is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  -- Residence: governorate required, delegation optional but checked when given.
  if not exists (select 1 from public.governorates g where g.id = v_gov and g.is_active) then
    raise exception 'invalid_governorate' using errcode = 'P0001';
  end if;
  if v_del is not null and not exists (
    select 1 from public.delegations d where d.id = v_del and d.governorate_id = v_gov and d.is_active
  ) then
    raise exception 'invalid_delegation' using errcode = 'P0001';
  end if;

  -- Where to invest
  select coalesce(array_agg(distinct x::smallint), '{}') into v_invest_govs
  from jsonb_array_elements_text(coalesce(p->'invest_governorate_ids', '[]'::jsonb)) x;
  if v_anywhere then
    v_invest_govs := '{}';
  elsif cardinality(v_invest_govs) = 0 then
    raise exception 'invest_location_required' using errcode = 'P0001';
  elsif (select count(*) from public.governorates g where g.id = any (v_invest_govs) and g.is_active)
        <> cardinality(v_invest_govs) then
    raise exception 'invalid_invest_governorate' using errcode = 'P0001';
  end if;

  -- What the citizen wants to own (clause 25.3). Scenarios decide the project types.
  select coalesce(array_agg(distinct x::uuid), '{}') into v_scenarios
  from jsonb_array_elements_text(coalesce(p->'scenario_ids', '[]'::jsonb)) x;

  if cardinality(v_scenarios) > 0 then
    if (select count(*) from public.ownership_scenarios s where s.id = any (v_scenarios) and s.is_active)
       <> cardinality(v_scenarios) then
      raise exception 'invalid_scenario' using errcode = 'P0001';
    end if;
    if not app.setting_bool('lead.project_types_multi', true) and cardinality(v_scenarios) > 1 then
      raise exception 'single_scenario_only' using errcode = 'P0001';
    end if;

    select
      coalesce(array_agg(distinct s.project_type_id) filter (where s.project_type_id is not null), '{}'),
      coalesce(array_agg(s.label_ar order by s.sort_order), '{}'),
      coalesce(array_agg(distinct s.plantation_system) filter (where s.plantation_system is not null), '{}'),
      coalesce(array_agg(distinct s.production_status) filter (where s.production_status is not null), '{}'),
      bool_or(s.is_any)
    into v_types, v_scn_labels, v_plantation, v_production, v_any_scenario
    from public.ownership_scenarios s
    where s.id = any (v_scenarios);

    if v_any_scenario then
      v_types := '{}';
    end if;
    v_unsure := v_any_scenario or cardinality(v_types) = 0;
  else
    -- Fallback for callers that still send project types directly.
    select coalesce(array_agg(distinct x::uuid), '{}') into v_types
    from jsonb_array_elements_text(coalesce(p->'project_type_ids', '[]'::jsonb)) x;
    if v_unsure then
      v_types := '{}';
    elsif cardinality(v_types) = 0 then
      raise exception 'scenario_required' using errcode = 'P0001';
    elsif not app.setting_bool('lead.project_types_multi', true) and cardinality(v_types) > 1 then
      raise exception 'single_project_type_only' using errcode = 'P0001';
    elsif (select count(*) from public.project_types t where t.id = any (v_types) and t.is_active)
          <> cardinality(v_types) then
      raise exception 'invalid_project_type' using errcode = 'P0001';
    end if;
  end if;

  -- Options from Back Office lists (LEAD-01), snapshotted below (LEAD-02)
  v_goal := app.active_option('goal', p->>'goal_option_id');
  if v_goal.id is null then raise exception 'invalid_goal' using errcode = 'P0001'; end if;
  v_down := app.active_option('down_payment', p->>'down_payment_option_id');
  if v_down.id is null then raise exception 'invalid_down_payment' using errcode = 'P0001'; end if;
  v_inst := app.active_option('monthly_installment', p->>'installment_option_id');
  if v_inst.id is null then raise exception 'invalid_installment' using errcode = 'P0001'; end if;
  if nullif(p->>'contact_time_option_id', '') is not null then
    v_time := app.active_option('contact_time', p->>'contact_time_option_id');
    if v_time.id is null then raise exception 'invalid_contact_time' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'desired_area_option_id', '') is not null then
    v_area := app.active_option('desired_area', p->>'desired_area_option_id');
    if v_area.id is null then raise exception 'invalid_desired_area' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'priority_option_id', '') is not null then
    v_priority := app.active_option('priority', p->>'priority_option_id');
    if v_priority.id is null then raise exception 'invalid_priority' using errcode = 'P0001'; end if;
  end if;
  begin
    v_channel := (p->>'contact_channel')::public.contact_channel;
  exception when invalid_text_representation then
    v_channel := null;
  end;
  if v_channel is null then
    raise exception 'contact_channel_required' using errcode = 'P0001';
  end if;

  -- Throttling (LEAD-06)
  perform app.check_throttle('interest:ip', nullif(p->>'ip_hash', ''), interval '1 hour',
                             app.setting_int('antispam.max_requests_per_ip_per_hour', 10));
  if (select count(*) from public.interest_requests r
      where r.phone_e164 = v_phone and r.created_at > now() - interval '1 day')
     >= app.setting_int('antispam.max_requests_per_phone_per_day', 3) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- One person per phone (LEAD-04). Existing person data is never overwritten from the public form.
  select id into v_status_id from public.lead_statuses
  where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;

  insert into public.persons as ps
    (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, status_id, consent_at, last_request_at)
  values
    (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del, v_status_id, now(), now())
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at
  returning ps.id, (ps.xmax = 0) into v_person_id, v_inserted;

  -- Optional automatic assignment (LEAD-12)
  if v_inserted and app.setting_text('crm.auto_assign_mode', 'manual') = 'round_robin' then
    select ur.user_id into v_assignee
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    left join lateral (
      select max(pa.created_at) as last_at from public.person_assignments pa where pa.to_user = ur.user_id
    ) la on true
    where ur.role = 'commercial' and pr.is_active
    order by la.last_at nulls first, ur.granted_at
    limit 1;
    if v_assignee is not null then
      update public.persons set assigned_to = v_assignee where id = v_person_id;
      insert into public.person_assignments (person_id, from_user, to_user, reason)
      values (v_person_id, null, v_assignee, 'auto:round_robin');
    end if;
  end if;

  v_request_no := app.setting_text('request_no.prefix', 'AGZ') || '-' || v_year || '-'
                  || lpad(app.next_number('interest_request:' || v_year)::text, 6, '0');

  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, email,
    residence_governorate_id, residence_delegation_id,
    invest_anywhere, invest_governorate_ids, project_type_unsure, project_type_ids,
    scenario_ids, scenario_labels, plantation_systems, production_statuses,
    desired_area_option_id, desired_area_label_ar, desired_area_min_m2, desired_area_max_m2,
    priority_option_id, priority_code, priority_label_ar,
    goal_option_id, goal_code, goal_label_ar,
    down_payment_option_id, down_payment_label_ar, down_payment_min_millimes, down_payment_max_millimes,
    installment_option_id, installment_label_ar, installment_min_millimes, installment_max_millimes,
    contact_channel, contact_time_option_id, contact_time_label_ar,
    is_duplicate, source, consent_text
  ) values (
    v_request_no, v_person_id, v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email,
    v_gov, v_del,
    v_anywhere, v_invest_govs, v_unsure, v_types,
    v_scenarios, v_scn_labels, v_plantation, v_production,
    v_area.id, v_area.label_ar, v_area.min_number, v_area.max_number,
    v_priority.id, v_priority.code, v_priority.label_ar,
    v_goal.id, v_goal.code, v_goal.label_ar,
    v_down.id, v_down.label_ar, v_down.min_millimes, v_down.max_millimes,
    v_inst.id, v_inst.label_ar, v_inst.min_millimes, v_inst.max_millimes,
    v_channel, v_time.id, v_time.label_ar,
    not v_inserted, app.clean_source(coalesce(p->'source', '{}'::jsonb)), v_consent
  ) returning id into v_request_id;

  perform app.enqueue_message(
    'lead.confirmation', v_phone,
    jsonb_build_object('name', split_part(v_name, ' ', 1), 'request_no', v_request_no),
    'interest_requests', v_request_id
  );

  return jsonb_build_object('request_no', v_request_no);
end $$;

-- ---------------------------------------------------------------------------
-- CRM search with the new filters (PARC-12)
-- ---------------------------------------------------------------------------

drop function if exists public.crm_search_requests(jsonb, integer, integer);

-- A view freezes its column list when it is created, so it has to be rebuilt to expose
-- the columns added in 0010.
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
  total_count bigint
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
      coalesce((p->>'duplicates_only')::boolean, false) as duplicates_only
  )
  select
    c.id, c.request_no, c.created_at, c.person_id, c.full_name, c.phone_e164,
    c.residence_governorate_id, c.residence_delegation_id,
    c.invest_anywhere, c.invest_governorate_ids, c.project_type_unsure, c.project_type_ids,
    c.scenario_labels, c.plantation_systems, c.production_statuses,
    c.desired_area_label_ar, c.desired_area_min_m2, c.desired_area_max_m2,
    c.priority_code, c.priority_label_ar,
    c.goal_code, c.goal_label_ar,
    c.down_payment_label_ar, c.down_payment_min_millimes,
    c.installment_label_ar, c.installment_min_millimes,
    c.contact_channel, c.contact_time_label_ar, c.is_duplicate, c.source,
    c.status_id, c.stage, c.status_label_ar, c.assigned_to, c.assigned_to_name,
    count(*) over () as total_count
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
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0)
$$;

revoke execute on function public.crm_search_requests(jsonb, integer, integer) from public, anon;
grant execute on function public.crm_search_requests(jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard: demand by scenario, area and priority
-- ---------------------------------------------------------------------------

create or replace function public.crm_demand_stats(p_from date default null, p_to date default null)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with r as (
    select *
    from public.interest_requests ir
    where (p_from is null or ir.created_at >= (p_from::timestamp at time zone 'Africa/Tunis'))
      and (p_to is null or ir.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Tunis'))
  ),
  today as (
    select date_trunc('day', now() at time zone 'Africa/Tunis') as day
  )
  select jsonb_build_object(
    'requests', (select count(*) from r),
    'persons', (select count(distinct person_id) from r),
    'duplicates', (select count(*) from r where is_duplicate),
    'today', (select count(*) from r, today where r.created_at >= (today.day at time zone 'Africa/Tunis')),
    'last_7_days', (select count(*) from r where created_at >= now() - interval '7 days'),
    'anywhere', (select count(*) from r where invest_anywhere),
    'unsure_type', (select count(*) from r where project_type_unsure),
    'by_invest_governorate', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name_ar, 'count', coalesce(c.n, 0))
                       order by coalesce(c.n, 0) desc, g.sort_order)
      from public.governorates g
      left join (
        select gid, count(*) as n from r, unnest(r.invest_governorate_ids) as gid group by gid
      ) c on c.gid = g.id
    ), '[]'::jsonb),
    'by_project_type', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.label_ar, 'count', coalesce(c.n, 0)) order by t.sort_order)
      from public.project_types t
      left join (
        select tid, count(*) as n from r, unnest(r.project_type_ids) as tid group by tid
      ) c on c.tid = t.id
    ), '[]'::jsonb),
    'by_scenario', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.label_ar, 'count', coalesce(c.n, 0)) order by s.sort_order)
      from public.ownership_scenarios s
      left join (
        select sid, count(*) as n from r, unnest(r.scenario_ids) as sid group by sid
      ) c on c.sid = s.id
    ), '[]'::jsonb),
    'by_desired_area', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select coalesce(desired_area_label_ar, 'بدون إجابة') as label, desired_area_min_m2 as min, count(*) as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    'by_priority', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc)
      from (select coalesce(priority_label_ar, 'بدون إجابة') as label, count(*) as n from r group by 1) x
    ), '[]'::jsonb),
    'by_plantation_system', coalesce((
      select jsonb_agg(jsonb_build_object('code', o.code, 'name', o.label_ar, 'count', coalesce(c.n, 0)) order by o.sort_order)
      from public.option_items o
      left join (
        select ps, count(*) as n from r, unnest(r.plantation_systems) as ps group by ps
      ) c on c.ps = o.code
      where o.list_key = 'plantation_system'
    ), '[]'::jsonb),
    'by_down_payment', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select down_payment_label_ar as label, down_payment_min_millimes as min, count(*) as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    'by_installment', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select installment_label_ar as label, installment_min_millimes as min, count(*) as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    'by_goal', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc)
      from (select goal_label_ar as label, count(*) as n from r group by 1) x
    ), '[]'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'count', x.n) order by x.n desc)
      from (select coalesce(source->>'utm_source', 'direct') as source, count(*) as n from r group by 1) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0)) order by d.day)
      from today,
           generate_series(today.day - interval '29 days', today.day, interval '1 day') as d(day)
      left join (
        select date_trunc('day', created_at at time zone 'Africa/Tunis') as day, count(*) as n from r group by 1
      ) c on c.day = d.day
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.crm_demand_stats(date, date) from public, anon;
grant execute on function public.crm_demand_stats(date, date) to authenticated;
