-- 0007 · CRM search, demand statistics, demand indicator for land offers, WhatsApp templates
-- Spec: CRM-01..03, DSH-01..03, MATCH-05, CNT-04.

-- ---------------------------------------------------------------------------
-- CRM search (security invoker: Row Level Security of the caller applies)
-- ---------------------------------------------------------------------------

create or replace function app.like_escape(p_value text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(p_value, '\', '\\'), '%', '\%'), '_', '\_')
$$;

create or replace function public.crm_search_requests(p jsonb, p_limit integer default 50, p_offset integer default 0)
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
-- Demand statistics for the dashboard (RLS applies: a commercial sees own files only)
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

-- ---------------------------------------------------------------------------
-- MATCH-05: demand around a land offer, as counts only (no personal data)
-- ---------------------------------------------------------------------------

create or replace function public.demand_indicator(p_governorate smallint)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_any_role(array['agri_manager', 'legal', 'finance', 'admin', 'super_admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'in_governorate', (select count(distinct person_id) from public.interest_requests where invest_governorate_ids @> array[p_governorate]),
    'anywhere', (select count(distinct person_id) from public.interest_requests where invest_anywhere),
    'by_project_type', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.label_ar, 'count', coalesce(c.n, 0)) order by t.sort_order)
      from public.project_types t
      left join (
        select tid, count(distinct ir.person_id) as n
        from public.interest_requests ir, unnest(ir.project_type_ids) as tid
        where ir.invest_governorate_ids @> array[p_governorate] or ir.invest_anywhere
        group by tid
      ) c on c.tid = t.id
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function public.demand_indicator(smallint) from public, anon;
grant execute on function public.demand_indicator(smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- CNT-04: WhatsApp message templates readable by staff (sending stays manual via wa.me links)
-- ---------------------------------------------------------------------------

drop policy message_templates_select on public.message_templates;
create policy message_templates_select on public.message_templates for select to authenticated
  using ((select app.is_admin()) or (channel = 'whatsapp' and (select app.is_staff())));

insert into public.message_templates (key, channel, body_ar, description_ar, variables) values
  ('lead.whatsapp_first_contact', 'whatsapp',
   'مرحبا {name}، معاك {agent} من AgriZed. نتصل بيك بخصوص مطلبك رقم {request_no} للاستثمار في الزيتون. وقتاش يناسبك نحكيو؟',
   'أول رسالة WhatsApp يرسلها الـCommercial للحريف (CNT-04).', array['name', 'agent', 'request_no'])
on conflict (key) do nothing;
