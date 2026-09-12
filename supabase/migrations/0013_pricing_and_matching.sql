-- 0013 · One pricing function for the whole system (SIM-06), and the matching score (8.3 / 25.5).

-- ---------------------------------------------------------------------------
-- Settings (examples; Finance must confirm before any project goes live, decision D-06)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('pricing.default', $json${
    "model": "markup_brackets",
    "brackets": [
      {"max_months": 36, "markup_pct": 10},
      {"max_months": 60, "markup_pct": 18},
      {"max_months": 84, "markup_pct": 25}
    ],
    "max_months": 84,
    "min_down_pct": 10,
    "min_installment_millimes": 50000
  }$json$::jsonb, 'json', 'pricing', 'صيغة التسعير الافتراضية',
   'تُستعمل للمشاريع التي لم تُضبط لها صيغة خاصة. الأرقام أمثلة تحتاج مصادقة Finance (القرار D-06).', false, 10),

  ('matching.weights', $json${
    "location": 25,
    "project_type": 20,
    "plantation": 10,
    "area": 15,
    "down_payment": 15,
    "installment": 15,
    "priority_bonus": 5
  }$json$::jsonb, 'json', 'matching', 'أوزان الـMatching',
   'مجموع الأوزان الأساسية 100. «priority_bonus» نقاط إضافية عندما تخدم القطعة أولوية الحريف (PARC-09).', false, 20),

  ('matching.min_score', '40'::jsonb, 'integer', 'matching', 'أدنى نتيجة لعرض الحريف',
   'الحرفاء تحت هذه النتيجة لا يظهرون في اقتراحات القطعة.', false, 30);

-- ---------------------------------------------------------------------------
-- SIM-06: the single installment calculator. All amounts are integer millimes.
-- ---------------------------------------------------------------------------

create or replace function public.compute_installment_plan(
  p_cash_millimes bigint,
  p_down_millimes bigint,
  p_installment_millimes bigint,
  p_pricing jsonb
) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_model        text := coalesce(p_pricing->>'model', 'markup_brackets');
  v_max_months   integer := coalesce((p_pricing->>'max_months')::integer, 120);
  v_min_down_pct numeric := coalesce((p_pricing->>'min_down_pct')::numeric, 0);
  v_min_install  bigint := coalesce((p_pricing->>'min_installment_millimes')::bigint, 0);
  v_bracket      jsonb;
  v_total        bigint;
  v_months       integer;
  v_financed     bigint;
  v_rate         numeric;
  v_scenario     jsonb;
begin
  if p_cash_millimes is null or p_cash_millimes <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_price');
  end if;
  if p_down_millimes is null or p_down_millimes < 0 or p_installment_millimes is null or p_installment_millimes <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;
  if p_down_millimes >= p_cash_millimes then
    return jsonb_build_object('ok', true, 'months', 0, 'total_millimes', p_cash_millimes,
                              'last_installment_millimes', 0, 'financed_millimes', 0, 'model', 'cash');
  end if;
  if v_min_down_pct > 0 and p_down_millimes < ceil(p_cash_millimes * v_min_down_pct / 100.0) then
    return jsonb_build_object('ok', false, 'reason', 'down_payment_too_low',
                              'min_down_millimes', ceil(p_cash_millimes * v_min_down_pct / 100.0)::bigint);
  end if;
  if p_installment_millimes < v_min_install then
    return jsonb_build_object('ok', false, 'reason', 'installment_too_low',
                              'min_installment_millimes', v_min_install);
  end if;

  if v_model = 'scenarios' then
    select s into v_scenario
    from jsonb_array_elements(coalesce(p_pricing->'scenarios', '[]'::jsonb)) s
    where (s->>'down_millimes')::bigint = p_down_millimes
      and (s->>'installment_millimes')::bigint = p_installment_millimes
    limit 1;
    if v_scenario is null then
      return jsonb_build_object('ok', false, 'reason', 'no_matching_scenario');
    end if;
    v_total := (v_scenario->>'total_millimes')::bigint;
    v_months := (v_scenario->>'months')::integer;
    return jsonb_build_object(
      'ok', true, 'model', v_model, 'months', v_months, 'total_millimes', v_total,
      'financed_millimes', v_total - p_down_millimes,
      'last_installment_millimes', (v_total - p_down_millimes) - p_installment_millimes * (v_months - 1)
    );
  end if;

  if v_model = 'monthly_rate' then
    v_rate := coalesce((p_pricing->>'monthly_rate_pct')::numeric, 0) / 100.0;
    v_financed := p_cash_millimes - p_down_millimes;
    if p_installment_millimes <= v_financed * v_rate then
      return jsonb_build_object('ok', false, 'reason', 'installment_too_low',
                                'min_installment_millimes', ceil(v_financed * v_rate)::bigint + 1);
    end if;
    v_months := ceil(v_financed / (p_installment_millimes - v_financed * v_rate))::integer;
    if v_months > v_max_months then
      return jsonb_build_object('ok', false, 'reason', 'too_many_months', 'months', v_months, 'max_months', v_max_months);
    end if;
    v_total := p_cash_millimes + round(v_financed * v_rate * v_months)::bigint;
    return jsonb_build_object(
      'ok', true, 'model', v_model, 'months', v_months, 'total_millimes', v_total,
      'financed_millimes', v_total - p_down_millimes,
      'last_installment_millimes', (v_total - p_down_millimes) - p_installment_millimes * (v_months - 1)
    );
  end if;

  -- Default: markup per duration bracket
  for v_bracket in
    select b from jsonb_array_elements(coalesce(p_pricing->'brackets', '[]'::jsonb)) b
    order by (b->>'max_months')::integer
  loop
    v_total := round(p_cash_millimes * (1 + (v_bracket->>'markup_pct')::numeric / 100.0))::bigint;
    v_months := ceil((v_total - p_down_millimes)::numeric / p_installment_millimes)::integer;
    if v_months <= least((v_bracket->>'max_months')::integer, v_max_months) then
      return jsonb_build_object(
        'ok', true, 'model', 'markup_brackets', 'months', v_months, 'total_millimes', v_total,
        'financed_millimes', v_total - p_down_millimes,
        'markup_pct', (v_bracket->>'markup_pct')::numeric,
        'last_installment_millimes', (v_total - p_down_millimes) - p_installment_millimes * (v_months - 1)
      );
    end if;
  end loop;

  return jsonb_build_object('ok', false, 'reason', 'installment_too_low');
end $$;

grant execute on function public.compute_installment_plan(bigint, bigint, bigint, jsonb) to authenticated, service_role;

/** Effective pricing for a parcel: its own formula, else the project's, else the default setting. */
create or replace function app.parcel_pricing(p_parcel uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
           when pa.pricing is not null and pa.pricing <> '{}'::jsonb then pa.pricing
           when pr.pricing is not null and pr.pricing <> '{}'::jsonb then pr.pricing
           else coalesce(app.setting('pricing.default'), '{}'::jsonb)
         end
  from public.parcels pa
  join public.projects pr on pr.id = pa.project_id
  where pa.id = p_parcel
$$;

-- ---------------------------------------------------------------------------
-- Matching: which registered people fit this parcel (8.3, 25.5)
-- Counts and scores only; a commercial sees their own files, other roles see all.
-- ---------------------------------------------------------------------------

create or replace function public.match_requests_for_parcel(p_parcel uuid, p_limit integer default 50)
returns table (
  request_id uuid,
  request_no text,
  person_id uuid,
  full_name text,
  phone_e164 text,
  created_at timestamptz,
  assigned_to uuid,
  score numeric,
  breakdown jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_weights jsonb := coalesce(app.setting('matching.weights'), '{}'::jsonb);
  v_min     numeric := coalesce((app.setting('matching.min_score') #>> '{}')::numeric, 0);
  v_all     boolean := app.has_any_role(array['finance', 'legal', 'admin', 'super_admin']::public.app_role[]);
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with parcel as (
    select pa.*, pr.governorate_id, pr.project_type_id, pr.id as project_id
    from public.parcels pa join public.projects pr on pr.id = pa.project_id
    where pa.id = p_parcel
  ),
  w as (
    select coalesce((v_weights->>'location')::numeric, 25) as location,
           coalesce((v_weights->>'project_type')::numeric, 20) as project_type,
           coalesce((v_weights->>'plantation')::numeric, 10) as plantation,
           coalesce((v_weights->>'area')::numeric, 15) as area,
           coalesce((v_weights->>'down_payment')::numeric, 15) as down_payment,
           coalesce((v_weights->>'installment')::numeric, 15) as installment,
           coalesce((v_weights->>'priority_bonus')::numeric, 5) as priority_bonus
  ),
  scored as (
    select
      r.id, r.request_no, r.person_id, r.full_name, r.phone_e164, r.created_at, p.assigned_to,
      -- Where: exact governorate, or "anywhere" as a partial match
      case when r.invest_governorate_ids @> array[parcel.governorate_id] then w.location
           when r.invest_anywhere then w.location * 0.6 else 0 end as s_location,
      -- What they want to own
      case when parcel.project_type_id is not null and r.project_type_ids @> array[parcel.project_type_id] then w.project_type
           when r.project_type_unsure then w.project_type * 0.5 else 0 end as s_type,
      case when parcel.plantation_system is null or cardinality(r.plantation_systems) = 0 then w.plantation * 0.5
           when r.plantation_systems @> array[parcel.plantation_system] then w.plantation else 0 end as s_plantation,
      -- Area: the parcel falls inside the range they asked for
      case when r.desired_area_min_m2 is null then w.area * 0.6
           when parcel.area_m2 between r.desired_area_min_m2 and coalesce(r.desired_area_max_m2, r.desired_area_min_m2) then w.area
           when parcel.area_m2 between r.desired_area_min_m2 * 0.8 and coalesce(r.desired_area_max_m2, r.desired_area_min_m2) * 1.2 then w.area * 0.5
           else 0 end as s_area,
      case when r.down_payment_min_millimes is null then 0
           when r.down_payment_min_millimes >= coalesce((app.parcel_pricing(parcel.id)->>'min_down_pct')::numeric, 0) * parcel.cash_price_millimes / 100.0
             then w.down_payment
           else w.down_payment * 0.5 end as s_down,
      case when coalesce((public.compute_installment_plan(parcel.cash_price_millimes, r.down_payment_min_millimes,
                                                          r.installment_min_millimes, app.parcel_pricing(parcel.id))->>'ok')::boolean, false)
             then w.installment else 0 end as s_installment,
      case when r.priority_code = 'productive' and parcel.production_status = 'producing' then w.priority_bonus
           when r.priority_code = 'area_max' and parcel.area_m2 >= coalesce(r.desired_area_max_m2, r.desired_area_min_m2, 0) then w.priority_bonus
           when r.priority_code = 'trees_max' and coalesce(parcel.olive_tree_count, 0) > 1 then w.priority_bonus
           else 0 end as s_priority
    from public.interest_requests r
    join public.persons p on p.id = r.person_id
    cross join parcel
    cross join w
    where (v_all or p.assigned_to = auth.uid())
      and p.archived_at is null
  )
  select
    scored.id, scored.request_no, scored.person_id, scored.full_name, scored.phone_e164,
    scored.created_at, scored.assigned_to,
    round(scored.s_location + scored.s_type + scored.s_plantation + scored.s_area + scored.s_down
          + scored.s_installment + scored.s_priority, 1) as score,
    jsonb_build_object(
      'location', scored.s_location, 'project_type', scored.s_type, 'plantation', scored.s_plantation,
      'area', scored.s_area, 'down_payment', scored.s_down, 'installment', scored.s_installment,
      'priority_bonus', scored.s_priority
    ) as breakdown
  from scored
  where (scored.s_location + scored.s_type + scored.s_plantation + scored.s_area + scored.s_down
         + scored.s_installment + scored.s_priority) >= v_min
  -- Seniority decides ties (MATCH-01)
  order by score desc, scored.created_at asc
  limit least(greatest(p_limit, 1), 200);
end $$;

revoke execute on function public.match_requests_for_parcel(uuid, integer) from public, anon;
grant execute on function public.match_requests_for_parcel(uuid, integer) to authenticated;
