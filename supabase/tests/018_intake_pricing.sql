-- Intake with tree pricing: the demand snapshots the spacing class, the area, the payment mode, the down payment
-- percentage and the figures shown on /start; the old lists are retired; the CRM lists, filters and counts it all.
-- Addendum docs/tree-area-and-cost.md; plan docs/plan-zitouna.md Q-1, Q-2, Q-6, Q-7, P2-3, P2-6, P4-2;
-- report v3 §12, §44, §49, §51-§52; LEAD-01, LEAD-02, COM-05.
--
-- Runs against the live database: phones nobody uses, a fresh admin, option fixtures with unused codes, seeded
-- items and global pricing rows set inside the rolled-back transaction, and every CRM read scoped to the fixtures.

do $$
declare
  v_phone text;
  i       integer;
begin
  for i in 1..3 loop
    loop
      v_phone := '+21696' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.persons where phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests where phone_e164 = v_phone)
        and v_phone <> coalesce(current_setting('test.ip_phone_1', true), '')
        and v_phone <> coalesce(current_setting('test.ip_phone_2', true), '');
    end loop;
    perform set_config('test.ip_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('test.ip_reason', rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 5)), '.'), true)
from (values ('حذف فئة مستعملة في الاختبار')) as t (s);
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner): options, an admin, and the global pricing the figures below rely on
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_id    uuid;
begin
  insert into auth.users (id, email) values (v_admin, 'intake-pricing-admin-' || v_admin || '@test.local');
  update public.profiles set full_name = 'Admin Intake Pricing', is_active = true where id = v_admin;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  perform set_config('test.ip_admin', v_admin::text, true);

  insert into public.option_items (list_key, code, label_ar, min_number, max_number, sort_order)
  values ('tree_count', 'intake_pricing_test_20', '20 زيتونة اختبار', 20, 20, 9990) returning id into v_id;
  perform set_config('test.ip_trees_20', v_id::text, true);

  -- The seeded 10% and 60 months, pinned to their seed values; a retired percentage with a code nobody uses
  update public.option_items set min_number = 10, max_number = 10, is_active = true
  where list_key = 'down_payment_percent' and code = 'dpp_10' returning id into v_id;
  perform set_config('test.ip_dpp_10', v_id::text, true);
  update public.option_items set min_number = 60, max_number = 60, is_active = true
  where list_key = 'duration' and code = 'd_60' returning id into v_id;
  perform set_config('test.ip_dur_60', v_id::text, true);
  insert into public.option_items (list_key, code, label_ar, min_number, max_number, sort_order, is_active)
  values ('down_payment_percent', 'intake_pricing_test_15', 'نسبة اختبار 15', 15, 15, 9990, false) returning id into v_id;
  perform set_config('test.ip_dpp_retired', v_id::text, true);
  perform set_config('test.ip_legacy_down',
    (select id::text from public.option_items where list_key = 'down_payment' order by sort_order, code limit 1), true);

  perform set_config('test.ip_7x5', (select id::text from public.tree_spacing_classes where code = 'int_7x5'), true);
  perform set_config('test.ip_5x5', (select id::text from public.tree_spacing_classes where code = 'int_5x5'), true);

  -- The owner's example: 500 د per tree, +18% over 60 months
  update public.tree_pricing_rules
  set land_price_per_m2_millimes = 10000, planting_cost_per_tree_millimes = 50000,
      margin_mode = 'percent', margin_percent_bp = 2500, margin_fixed_millimes = null,
      price_rounding_millimes = 1000, monthly_rounding_millimes = 1000
  where project_id is null;
  delete from public.tree_cost_items where project_id is null;
  delete from public.financing_markups where project_id is null;
  insert into public.financing_markups (project_id, months, markup_bp) values (null, 60, 1800);
end $$;

-- A calculator demand as /register sends it (plan P2-6): no amount down payment, no budget, no area, no priority.
create function pg_temp.ip_payload(p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف المساحة',
    'phone_e164', current_setting('test.ip_phone_1'),
    'residence_governorate_id', 34,
    'invest_governorate_ids', jsonb_build_array(34),
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios
                                       where is_active and not is_any order by sort_order limit 1)),
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and is_active order by sort_order limit 1),
    'tree_count_option_id', current_setting('test.ip_trees_20'),
    'spacing_class_id', current_setting('test.ip_7x5'),
    'payment_mode', 'installments',
    'down_payment_percent_option_id', current_setting('test.ip_dpp_10'),
    'duration_option_id', current_setting('test.ip_dur_60'),
    'contact_channel', 'phone',
    'consent_text', 'أوافق'
  ) || p_overrides
$$;

create function pg_temp.ip_expect_error(p jsonb, p_expected text) returns void language plpgsql as $$
begin
  perform public.submit_interest_request(p);
  raise exception 'expected error "%" but the call succeeded', p_expected;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%"', p_expected, sqlerrm;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Plan Q-7: the old lists are retired, never deleted; the calculator lists stay
-- ---------------------------------------------------------------------------

do $$
declare
  v_list text;
begin
  assert not exists (select 1 from public.option_items o
                     where o.list_key in ('desired_area', 'priority', 'monthly_installment', 'down_payment', 'budget') and o.is_active),
    'the desired area, priority, monthly installment, amount down payment and budget lists have no active item';
  assert exists (select 1 from public.option_items o where o.list_key = 'down_payment')
     and exists (select 1 from public.option_lists l where l.key = 'budget'),
    'the retired lists and their items are kept for the demands that carry them';
  assert (select not o.is_active from public.option_items o where o.id = current_setting('test.ip_legacy_down')::uuid),
    'the amount down payment the tests below send is retired';
  foreach v_list in array array['goal', 'tree_count', 'duration', 'down_payment_percent'] loop
    assert exists (select 1 from public.option_items o where o.list_key = v_list and o.is_active),
      'the list ' || v_list || ' keeps active items';
  end loop;
  assert exists (select 1 from public.ownership_scenarios s where s.is_active), 'the offer types stay active';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · While the module is internal, the public intake snapshots the area and the choices but no price (LEAD-02)
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'internal' where key = 'pricing';

do $$
declare
  v_res jsonb;
  v_req public.interest_requests;
begin
  v_res := public.submit_interest_request(pg_temp.ip_payload('{"ip_hash": "intake-pricing-1"}'));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';

  assert v_req.spacing_class_id = current_setting('test.ip_7x5')::uuid, 'the chosen class is kept';
  assert v_req.spacing_label_ar = (select label_ar from public.tree_spacing_classes where code = 'int_7x5'),
    'the class label is kept as displayed, got ' || coalesce(v_req.spacing_label_ar, 'null');
  assert v_req.area_per_tree_m2 = 35 and v_req.total_area_m2 = 700,
    '35 m² per tree and 700 m² for 20 trees, got ' || coalesce(v_req.area_per_tree_m2::text, 'null') || ' / ' || coalesce(v_req.total_area_m2::text, 'null');
  assert v_req.payment_mode = 'installments', 'the payment mode is kept';
  assert v_req.down_payment_percent_option_id = current_setting('test.ip_dpp_10')::uuid and v_req.down_payment_percent = 10
     and v_req.duration_months = 60, 'the percentage and the duration are kept';
  assert v_req.down_payment_option_id is null and v_req.down_payment_label_ar is null, 'no amount down payment is invented';
  assert v_req.price_per_tree_millimes is null and v_req.total_price_millimes is null and v_req.down_payment_amount_millimes is null
     and v_req.total_financed_millimes is null and v_req.monthly_millimes is null,
    'an internal module stores no price for a public demand';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Once public, the demand keeps the prices the client saw (addendum, plan §5 phase 2, report v3 §12, §51)
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'public' where key = 'pricing';

do $$
declare
  v_res jsonb;
  v_req public.interest_requests;
begin
  v_res := public.submit_interest_request(pg_temp.ip_payload('{"ip_hash": "intake-pricing-2"}'));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';
  perform set_config('test.ip_request_no', v_req.request_no, true);

  assert v_req.price_per_tree_millimes = 500000 and v_req.total_price_millimes = 10000000,
    '500 د per tree and 10,000 د for 20 trees, got ' || coalesce(v_req.price_per_tree_millimes::text, 'null')
    || ' / ' || coalesce(v_req.total_price_millimes::text, 'null');
  assert v_req.down_payment_amount_millimes = 1000000 and v_req.total_financed_millimes = 11620000 and v_req.monthly_millimes = 177000,
    '10% down and 18% on the 9,000 د left over 60 months: 1,000 د down, 11,620 د in all and 177 د a month, got '
    || coalesce(v_req.down_payment_amount_millimes::text, 'null') || ' / '
    || coalesce(v_req.total_financed_millimes::text, 'null') || ' / ' || coalesce(v_req.monthly_millimes::text, 'null');
  assert (v_req.down_payment_amount_millimes, v_req.total_financed_millimes, v_req.monthly_millimes)
         = ((public.public_tree_quote(v_req.spacing_class_id, 20, 'installments', v_req.down_payment_percent_option_id,
                                      v_req.duration_option_id)->'installments'->>'down_payment_millimes')::bigint,
            (public.public_tree_quote(v_req.spacing_class_id, 20, 'installments', v_req.down_payment_percent_option_id,
                                      v_req.duration_option_id)->'installments'->>'total_financed_millimes')::bigint,
            (public.public_tree_quote(v_req.spacing_class_id, 20, 'installments', v_req.down_payment_percent_option_id,
                                      v_req.duration_option_id)->'installments'->>'monthly_millimes')::bigint),
    'the demand holds exactly the figures /start showed';
  assert exists (select 1 from public.notification_outbox o
                 where o.related_id = v_req.id and o.template_key = 'lead.confirmation'
                   and o.body like '%' || v_req.request_no || '%'), 'the confirmation is still enqueued with the request number';

  -- A later price change never touches the demand (LEAD-02)
  update public.tree_pricing_rules set land_price_per_m2_millimes = 20000 where project_id is null;
  assert (select r.price_per_tree_millimes = 500000 and r.down_payment_amount_millimes = 1000000
          from public.interest_requests r where r.id = v_req.id),
    'the price snapshot survives a rule change';
  update public.tree_pricing_rules set land_price_per_m2_millimes = 10000 where project_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · Cash needs no down payment; wrong choices are refused; the offer type is optional
-- ---------------------------------------------------------------------------

do $$
declare
  v_res  jsonb;
  v_req  public.interest_requests;
  v_ids  uuid[];
begin
  v_res := public.submit_interest_request(pg_temp.ip_payload(jsonb_build_object(
    'phone_e164', current_setting('test.ip_phone_2'),
    'payment_mode', 'cash',
    'installment_option_id', gen_random_uuid(),
    'ip_hash', 'intake-pricing-3')));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';

  assert v_req.payment_mode = 'cash', 'the cash mode is kept';
  assert v_req.down_payment_percent_option_id is null and v_req.down_payment_percent is null
     and v_req.down_payment_option_id is null and v_req.down_payment_amount_millimes is null,
    'a cash demand carries no down payment, even when a percentage was sent';
  assert v_req.duration_option_id is null and v_req.duration_months is null
     and v_req.installment_option_id is null and v_req.installment_label_ar is null,
    'ids sent with a cash demand are ignored';
  assert v_req.total_price_millimes = 10000000 and v_req.total_financed_millimes is null and v_req.monthly_millimes is null,
    'a cash demand keeps the cash total only, got ' || row_to_json(v_req)::text;

  perform pg_temp.ip_expect_error(pg_temp.ip_payload('{"payment_mode": "card", "ip_hash": "intake-pricing-4"}'), 'invalid_payment_mode');
  perform pg_temp.ip_expect_error(pg_temp.ip_payload(jsonb_build_object(
    'spacing_class_id', gen_random_uuid(), 'ip_hash', 'intake-pricing-5')), 'invalid_spacing');
  perform pg_temp.ip_expect_error(pg_temp.ip_payload('{"spacing_class_id": "not-a-uuid", "ip_hash": "intake-pricing-6"}'), 'invalid_spacing');

  -- The percentage comes from the active percentage list only
  perform pg_temp.ip_expect_error(pg_temp.ip_payload(jsonb_build_object(
    'down_payment_percent_option_id', gen_random_uuid(), 'ip_hash', 'intake-pricing-7')), 'invalid_down_payment_percent');
  perform pg_temp.ip_expect_error(pg_temp.ip_payload(jsonb_build_object(
    'down_payment_percent_option_id', current_setting('test.ip_dur_60'), 'ip_hash', 'intake-pricing-8')), 'invalid_down_payment_percent');
  perform pg_temp.ip_expect_error(pg_temp.ip_payload(jsonb_build_object(
    'down_payment_percent_option_id', current_setting('test.ip_dpp_retired'), 'ip_hash', 'intake-pricing-9')), 'invalid_down_payment_percent');

  -- Installments need both answers while the lists offer them
  perform pg_temp.ip_expect_error(pg_temp.ip_payload(
    '{"down_payment_percent_option_id": null, "ip_hash": "intake-pricing-10"}'), 'down_payment_percent_required');
  perform pg_temp.ip_expect_error(pg_temp.ip_payload(
    '{"duration_option_id": null, "ip_hash": "intake-pricing-11"}'), 'duration_required');

  -- An amount down payment from the retired list is refused like any inactive option (Q-7)
  perform pg_temp.ip_expect_error(pg_temp.ip_payload(jsonb_build_object(
    'down_payment_option_id', current_setting('test.ip_legacy_down'), 'ip_hash', 'intake-pricing-12')), 'invalid_down_payment');

  -- Plan Q-6: no offer type is «no specific type», not an error
  v_res := public.submit_interest_request(pg_temp.ip_payload(jsonb_build_object(
    'phone_e164', current_setting('test.ip_phone_3'), 'scenario_ids', jsonb_build_array(), 'ip_hash', 'intake-pricing-13')));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';
  assert v_req.project_type_unsure and v_req.project_type_ids = '{}' and v_req.scenario_ids = '{}',
    'a demand without an offer type is recorded as unsure, got ' || row_to_json(v_req)::text;
  assert v_req.down_payment_amount_millimes = 1000000, 'it is still priced like any calculator demand';

  -- With no active percentage, installments need none (the Back Office emptied the list)
  select array_agg(o.id) into v_ids from public.option_items o where o.list_key = 'down_payment_percent' and o.is_active;
  update public.option_items set is_active = false where id = any (v_ids);
  v_res := public.submit_interest_request(pg_temp.ip_payload(jsonb_build_object(
    'phone_e164', current_setting('test.ip_phone_3'), 'down_payment_percent_option_id', null, 'ip_hash', 'intake-pricing-14')));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';
  assert v_req.down_payment_percent is null and v_req.duration_months = 60 and v_req.total_financed_millimes is null,
    'without a percentage list the demand keeps the duration and no financed figure';
  update public.option_items set is_active = true where id = any (v_ids);

  select array_agg(o.id) into v_ids from public.option_items o where o.list_key = 'duration' and o.is_active;
  update public.option_items set is_active = false where id = any (v_ids);
  v_res := public.submit_interest_request(pg_temp.ip_payload(jsonb_build_object(
    'phone_e164', current_setting('test.ip_phone_3'), 'duration_option_id', null, 'ip_hash', 'intake-pricing-15')));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';
  assert v_req.down_payment_percent = 10 and v_req.duration_option_id is null and v_req.down_payment_amount_millimes is null,
    'without a duration list the demand keeps the percentage and no financed figure';
  update public.option_items set is_active = true where id = any (v_ids);
end $$;

-- ---------------------------------------------------------------------------
-- 4 · The CRM view keeps the 0020 parcel snapshot and exposes the new columns
-- ---------------------------------------------------------------------------

do $$
begin
  assert (select count(*) from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = 'crm_requests'
            and c.column_name in ('parcel_id', 'project_code', 'parcel_code', 'parcel_plan_months', 'parcel_captured_at',
                                  'duration_months', 'status_label_ar', 'person_archived_at',
                                  'spacing_class_id', 'spacing_label_ar', 'area_per_tree_m2', 'total_area_m2', 'payment_mode',
                                  'price_per_tree_millimes', 'total_price_millimes', 'total_financed_millimes', 'monthly_millimes',
                                  'down_payment_percent_option_id', 'down_payment_percent', 'down_payment_amount_millimes')) = 20,
    'crm_requests exposes the parcel snapshot, the v3 answers and the tree pricing snapshot';
  assert not has_table_privilege('anon', 'public.crm_requests', 'select'), 'visitors cannot read the CRM view';
  assert not has_function_privilege('anon', 'public.crm_search_requests(jsonb, integer, integer)', 'execute')
     and has_function_privilege('authenticated', 'public.crm_search_requests(jsonb, integer, integer)', 'execute'),
    'the CRM search keeps its grants';
  assert not has_function_privilege('anon', 'public.crm_demand_stats(date, date, boolean)', 'execute')
     and has_function_privilege('authenticated', 'public.crm_demand_stats(date, date, boolean)', 'execute'),
    'the demand report keeps its grants';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · An admin filters and counts by class, payment mode, percentage and total price band (report v3 §44, §49)
-- ---------------------------------------------------------------------------

update public.settings set value = '[]'::jsonb where key = 'analytics.total_price_bands_millimes';

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ip_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_phone1 text := current_setting('test.ip_phone_1');
  v_phone2 text := current_setting('test.ip_phone_2');
  v_class  text := current_setting('test.ip_7x5');
  v_row    record;
  v_n      bigint;
  v_ok     boolean;
  v_bands  jsonb;
begin
  select * into v_row
  from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'payment_mode', 'installments', 'spacing_class_id', v_class,
                                                     'down_payment_percent', '10'), 500)
  where request_no = current_setting('test.ip_request_no');
  assert v_row.id is not null, 'the priced demand is found by payment mode, class and percentage';
  assert v_row.spacing_class_id = v_class::uuid and v_row.spacing_label_ar is not null
     and v_row.area_per_tree_m2 = 35 and v_row.total_area_m2 = 700 and v_row.payment_mode = 'installments'
     and v_row.total_price_millimes = 10000000 and v_row.down_payment_percent = 10
     and v_row.down_payment_amount_millimes = 1000000
     and v_row.total_financed_millimes = 11620000 and v_row.monthly_millimes = 177000,
    'the search returns the tree pricing snapshot, got ' || row_to_json(v_row)::text;

  select count(*) into v_n from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'down_payment_percent', 20), 500)
  where phone_e164 = v_phone1;
  assert v_n = 0, 'no demand of phone 1 chose 20%, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'payment_mode', 'cash'), 500)
  where phone_e164 = v_phone1;
  assert v_n = 0, 'no demand of phone 1 is cash, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(jsonb_build_object('q', v_phone2, 'payment_mode', 'cash'), 500)
  where phone_e164 = v_phone2;
  assert v_n = 1, 'the cash demand is found, got ' || v_n;

  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'spacing_class_id', current_setting('test.ip_5x5')), 500)
  where phone_e164 = v_phone1;
  assert v_n = 0, 'another class finds nothing, got ' || v_n;

  -- One statement, one snapshot: every demand lands in exactly one bucket of each breakdown
  select (select sum((b->>'count')::bigint) from jsonb_array_elements(s->'by_spacing_class') b) = (s->>'requests')::bigint
     and (select sum((b->>'count')::bigint) from jsonb_array_elements(s->'by_payment_mode') b) = (s->>'requests')::bigint
     and (select sum((b->>'count')::bigint) from jsonb_array_elements(s->'by_down_payment_percent') b) = (s->>'requests')::bigint
     and exists (select 1 from jsonb_array_elements(s->'by_spacing_class') b
                 where b->>'id' = v_class and (b->>'area_m2')::numeric = 35 and (b->>'count')::bigint >= 3)
     and exists (select 1 from jsonb_array_elements(s->'by_spacing_class') b where b->>'id' is null)
     and exists (select 1 from jsonb_array_elements(s->'by_payment_mode') b where b->>'code' = 'cash' and (b->>'count')::bigint >= 1)
     and exists (select 1 from jsonb_array_elements(s->'by_payment_mode') b where b->>'code' = 'installments' and (b->>'count')::bigint >= 2)
     and jsonb_array_length(s->'by_payment_mode') = 3
     and exists (select 1 from jsonb_array_elements(s->'by_down_payment_percent') b
                 where (b->>'percent')::numeric = 10 and (b->>'count')::bigint >= 3)
     and exists (select 1 from jsonb_array_elements(s->'by_down_payment_percent') b
                 where b->'percent' = 'null'::jsonb and b->>'label' = 'بدون إجابة')
     and s->'by_total_price_band' = '[]'::jsonb
     and (select sum((b->>'count')::bigint) from jsonb_array_elements(pp->'by_payment_mode') b) >= (pp->>'persons')::bigint
     and (select sum((b->>'count')::bigint) from jsonb_array_elements(pp->'by_down_payment_percent') b) >= (pp->>'persons')::bigint
  into v_ok
  from (select public.crm_demand_stats() as s, public.crm_demand_stats(null, null, true) as pp) x;
  assert v_ok, 'by_spacing_class, by_payment_mode and by_down_payment_percent add up and hold the fixture buckets; no band without bounds';

  -- Finance sets two bounds: three price bands, then the demands without a total
  reset role;
  update public.settings set value = '[20000000, 5000000, "x"]'::jsonb where key = 'analytics.total_price_bands_millimes';
  set local role authenticated;

  select s->'by_total_price_band',
         (select sum((b->>'count')::bigint) from jsonb_array_elements(s->'by_total_price_band') b) = (s->>'requests')::bigint
  into v_bands, v_ok
  from (select public.crm_demand_stats() as s) x;
  assert v_ok and jsonb_array_length(v_bands) = 4, 'the bands and the no-total bucket add up to the demands, got ' || v_bands::text;
  assert v_bands->0->'min' = 'null'::jsonb and (v_bands->0->>'max')::bigint = 5000000
     and (v_bands->1->>'min')::bigint = 5000000 and (v_bands->1->>'max')::bigint = 20000000 and (v_bands->1->>'count')::bigint >= 2
     and (v_bands->2->>'min')::bigint = 20000000 and v_bands->2->'max' = 'null'::jsonb
     and v_bands->3->>'label' = 'بدون إجابة',
    'bounds are sorted, junk is ignored, and the 10,000 د demands sit in the 5,000..20,000 د band, got ' || v_bands::text;

  -- A class carried by a demand cannot be removed (LEAD-02)
  begin
    perform public.staff_delete_spacing_class(v_class::uuid, current_setting('test.ip_reason'));
    raise exception 'expected spacing_in_use but the class was removed';
  exception when others then
    if sqlerrm <> 'spacing_in_use' then
      raise exception 'expected spacing_in_use but got "%"', sqlerrm;
    end if;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 6 · Copy: every new /start text is a public site setting with a French twin; /register texts are Arabic
-- ---------------------------------------------------------------------------

do $$
declare
  v_keys text[] := array['start.spacing_title', 'start.spacing_hint', 'start.spacing_any', 'start.payment_title',
    'start.payment_cash', 'start.payment_installments', 'start.row_area_per_tree', 'start.row_total_area',
    'start.row_price_per_tree', 'start.row_total_price', 'start.row_payment', 'start.row_total_financed',
    'start.row_remaining', 'start.row_monthly', 'start.last_installment', 'start.installments_count',
    'start.from_prefix', 'start.estimate_note', 'start.price_unavailable', 'start.duration_not_priced',
    'start.down_covers_total', 'start.down_percent_title', 'start.down_percent_hint', 'start.edit_choices',
    'start.continue_hint_payment', 'start.continue_hint_installments'];
  v_found bigint;
begin
  select count(*) into v_found
  from public.settings s
  where s.key in (select k from unnest(v_keys) k union all select k || '_fr' from unnest(v_keys) k)
    and s.is_public and s.value_type = 'text' and s.group_key = 'site';
  assert v_found = 2 * cardinality(v_keys), 'every new /start text and its French twin exist, got ' || v_found;

  assert (select count(*) from public.settings s
          where s.key in ('register.summary_title', 'register.success_note')
            and s.is_public and s.value_type = 'text' and s.group_key = 'site') = 2,
    'the /register summary title and success note are public site texts';

  assert (select s.value_type = 'json' and not s.is_public from public.settings s where s.key = 'analytics.total_price_bands_millimes'),
    'the price bands are a json setting kept off the public site';

  assert (select s.value from public.settings s where s.key = 'start.continue') is distinct from to_jsonb('متابعة'::text)
     and (select s.value from public.settings s where s.key = 'start.continue_hint')
         is distinct from to_jsonb('اختر عدد الزيتونات باش تكمّل. الباقي اختياري.'::text),
    'the /start button and its hint no longer hold the 0019 seeds';
end $$;
