-- Pricing calculator and matching score.
-- Spec: SIM-06, SIM-07 (millimes), PARC-01, PARC-02, MATCH-01, MATCH-04, 25.5.

-- ---------------------------------------------------------------------------
-- The installment calculator, checked against the worked examples in clause 7.3
-- ---------------------------------------------------------------------------

-- 0032 retires these lists (plan Q-7) but this file submits their items: active again inside this rolled-back test only.
update public.option_items set is_active = true where list_key in ('desired_area', 'priority', 'down_payment', 'monthly_installment');

do $$
declare
  v_brackets jsonb := '{"model":"markup_brackets","max_months":84,"brackets":[
    {"max_months":36,"markup_pct":10},{"max_months":60,"markup_pct":18},{"max_months":84,"markup_pct":25}]}'::jsonb;
  v jsonb;
begin
  -- Model A: 6,000 TND cash, 1,000 down, 80 per month → 82 months, 7,500 total, last 20
  v := public.compute_installment_plan(6000000, 1000000, 80000, v_brackets);
  assert (v->>'ok')::boolean, 'model A returns a plan: ' || v::text;
  assert (v->>'months')::integer = 82, 'model A months = 82, got ' || (v->>'months');
  assert (v->>'total_millimes')::bigint = 7500000, 'model A total = 7,500 TND, got ' || (v->>'total_millimes');
  assert (v->>'last_installment_millimes')::bigint = 20000, 'model A last installment = 20 TND, got ' || (v->>'last_installment_millimes');

  -- Model B: same case at 0.5% per month with 100 per month → 67 months, 7,675 total, last 75
  v := public.compute_installment_plan(6000000, 1000000, 100000, '{"model":"monthly_rate","monthly_rate_pct":0.5,"max_months":120}'::jsonb);
  assert (v->>'ok')::boolean, 'model B returns a plan: ' || v::text;
  assert (v->>'months')::integer = 67, 'model B months = 67, got ' || (v->>'months');
  assert (v->>'total_millimes')::bigint = 7675000, 'model B total = 7,675 TND, got ' || (v->>'total_millimes');
  assert (v->>'last_installment_millimes')::bigint = 75000, 'model B last installment = 75 TND, got ' || (v->>'last_installment_millimes');

  -- An installment that never finishes is refused, not silently wrong (SIM-05)
  v := public.compute_installment_plan(6000000, 1000000, 20000, v_brackets);
  assert not (v->>'ok')::boolean, 'an installment that is too low is refused';

  -- Minimum down payment rule
  v := public.compute_installment_plan(6000000, 100000, 80000, v_brackets || '{"min_down_pct":10}'::jsonb);
  assert v->>'reason' = 'down_payment_too_low', 'down payment below the minimum is refused, got ' || v::text;

  -- The last installment is always between 0 and one full installment
  v := public.compute_installment_plan(3000000, 1000000, 80000, v_brackets);
  assert (v->>'ok')::boolean, 'small project plan';
  assert (v->>'last_installment_millimes')::bigint > 0
     and (v->>'last_installment_millimes')::bigint <= 80000, 'last installment within one installment, got ' || v::text;

  -- Paying cash needs no schedule
  v := public.compute_installment_plan(3000000, 3000000, 80000, v_brackets);
  assert (v->>'ok')::boolean and (v->>'months')::integer = 0, 'a full down payment means no installments';
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: one project, two parcels with the SAME area and different everything else
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'adm3@test.local', '{"full_name":"Admin 3"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'com3@test.local', '{"full_name":"Commercial 3"}');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'admin'),
  ('00000000-0000-0000-0000-0000000000d2', 'commercial');

insert into public.projects (code, name, governorate_id, project_type_id, plantation_system, pricing, status)
values ('TEST-P1', 'مشروع تجريبي', 34,
        (select id from public.project_types where code = 'productive'), 'traditional',
        '{"model":"markup_brackets","max_months":84,"brackets":[{"max_months":84,"markup_pct":25}]}'::jsonb,
        'internal');

insert into public.parcels (project_id, code, area_m2, property_type, plantation_system, olive_tree_count, tree_age_years, production_status, irrigation, cash_price_millimes, sort_order)
values
  ((select id from public.projects where code = 'TEST-P1'), 'P01', 500, 'planted', 'traditional', 1, 40, 'producing', 'rainfed', 5000000, 10),
  ((select id from public.projects where code = 'TEST-P1'), 'P02', 500, 'planted', 'intensive', 20, 4, 'starting', 'irrigated', 7500000, 20);

do $$
declare
  v_p1 public.parcels;
  v_p2 public.parcels;
begin
  -- Scoped to this test's project: the live catalog may hold other parcels coded P01/P02.
  select * into v_p1 from public.parcels where code = 'P01' and project_id = (select id from public.projects where code = 'TEST-P1');
  select * into v_p2 from public.parcels where code = 'P02' and project_id = (select id from public.projects where code = 'TEST-P1');

  -- PARC-01: same area, different tree count, plantation system and price
  assert v_p1.area_m2 = v_p2.area_m2, 'both parcels share the same area';
  assert v_p1.olive_tree_count = 1 and v_p2.olive_tree_count = 20, 'tree counts are independent of area';
  assert v_p1.cash_price_millimes <> v_p2.cash_price_millimes, 'prices are independent of area';

  -- PARC-02: changing the area changes nothing else
  update public.parcels set area_m2 = 800 where id = v_p1.id;
  assert (select olive_tree_count from public.parcels where id = v_p1.id) = 1, 'the tree count does not follow the area';
  assert (select cash_price_millimes from public.parcels where id = v_p1.id) = 5000000, 'the price does not follow the area';
  update public.parcels set area_m2 = 500 where id = v_p1.id;
end $$;

-- A request that fits parcel P01 exactly
select public.submit_interest_request(jsonb_build_object(
  'full_name', 'حريف مطابق',
  'phone_e164', '+21655000011',
  'residence_governorate_id', 34,
  'invest_governorate_ids', jsonb_build_array(34),
  'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios where code = 'big_productive')),
  'desired_area_option_id', (select id from public.option_items where list_key = 'desired_area' and code = 'area_500'),
  'priority_option_id', (select id from public.option_items where list_key = 'priority' and code = 'productive'),
  'goal_option_id', (select id from public.option_items where list_key = 'goal' and code = 'both'),
  'down_payment_option_id', (select id from public.option_items where list_key = 'down_payment' and code = 'dp_1000'),
  'installment_option_id', (select id from public.option_items where list_key = 'monthly_installment' and code = 'mi_80'),
  'contact_channel', 'phone',
  'consent_text', 'أوافق'
));

-- A request that does not fit: another governorate, bare land, tiny area
select public.submit_interest_request(jsonb_build_object(
  'full_name', 'حريف بعيد',
  'phone_e164', '+21655000022',
  'residence_governorate_id', 11,
  'invest_governorate_ids', jsonb_build_array(11),
  'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios where code = 'bare_land')),
  'desired_area_option_id', (select id from public.option_items where list_key = 'desired_area' and code = 'area_400'),
  'priority_option_id', (select id from public.option_items where list_key = 'priority' and code = 'lowest_price'),
  'goal_option_id', (select id from public.option_items where list_key = 'goal' and code = 'family'),
  'down_payment_option_id', (select id from public.option_items where list_key = 'down_payment' and code = 'dp_500'),
  'installment_option_id', (select id from public.option_items where list_key = 'monthly_installment' and code = 'mi_50'),
  'contact_channel', 'phone',
  'consent_text', 'أوافق'
));

select set_config('test.parcel', (select id::text from public.parcels where code = 'P01' and project_id = (select id from public.projects where code = 'TEST-P1')), true);

-- ---------------------------------------------------------------------------
-- Matching as an admin
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

do $$
declare
  v_top record;
  v_count integer;
begin
  select count(*) into v_count from public.match_requests_for_parcel(current_setting('test.parcel')::uuid, 50);
  assert v_count >= 1, 'the matching parcel finds at least one request';

  select * into v_top from public.match_requests_for_parcel(current_setting('test.parcel')::uuid, 50) limit 1;
  assert v_top.phone_e164 = '+21655000011', 'the closest request comes first, got ' || v_top.phone_e164;
  assert v_top.score >= 100, 'a full match scores at least 100, got ' || v_top.score;
  assert (v_top.breakdown->>'location')::numeric > 0
     and (v_top.breakdown->>'area')::numeric > 0
     and (v_top.breakdown->>'installment')::numeric > 0, 'the score is explained per criterion: ' || v_top.breakdown::text;
  assert (v_top.breakdown->>'priority_bonus')::numeric > 0, 'a productive parcel serves the "productive" priority (PARC-09)';

  -- MATCH-04: the same data gives the same ranking
  assert (select phone_e164 from public.match_requests_for_parcel(current_setting('test.parcel')::uuid, 50) limit 1)
         = v_top.phone_e164, 'the ranking is stable';
end $$;

-- A commercial only sees their own files
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated"}';

do $$
begin
  assert (select count(*) from public.match_requests_for_parcel(current_setting('test.parcel')::uuid, 50)) = 0,
    'a commercial with no assigned files gets no matches';
end $$;

reset role;

-- Internal costs stay with Finance and Admin (PRJ-03)
insert into public.project_costs (project_id, kind, label, amount_millimes)
values ((select id from public.projects where code = 'TEST-P1'), 'purchase', 'شراء العقار', 40000000);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated"}';

do $$
begin
  assert (select count(*) from public.project_costs) = 0, 'a commercial cannot read internal project costs';
  assert (select count(*) from public.parcels where project_id = (select id from public.projects where code = 'TEST-P1')) = 2, 'a commercial can read parcels';
end $$;

reset role;
