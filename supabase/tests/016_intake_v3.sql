-- Intake v3: the client picks a down payment and a payment duration, may give a budget, and says whether
-- they want a visit and bank financing; the CRM lists and filters those answers.
-- Report v3: §6, §7, §8, §14, §17, §40, §44, §49; decision N-9. Requirements: LEAD-01, LEAD-02, COM-05.
--
-- Runs against the live database: phones nobody uses, fresh staff users, fixture options with unused codes,
-- and every CRM read scoped to the fixture phones, so real traffic cannot move the figures.

-- 0032 retires these lists (plan Q-7) but this file submits their items: active again inside this rolled-back test only.
update public.option_items set is_active = true where list_key in ('down_payment', 'monthly_installment');

do $$
declare
  v_phone text;
  i       integer;
begin
  for i in 1..2 loop
    loop
      v_phone := '+21693' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.persons where phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests where phone_e164 = v_phone)
        and v_phone <> coalesce(current_setting('test.v3_phone_1', true), '');
    end loop;
    perform set_config('test.v3_phone_' || i, v_phone, true);
  end loop;
end $$;

-- A v3 demand: down payment and goal, no installment.
create function pg_temp.v3_payload(p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف المدة',
    'phone_e164', current_setting('test.v3_phone_1'),
    'residence_governorate_id', 34,
    'invest_governorate_ids', jsonb_build_array(34),
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios
                                       where is_active and not is_any order by sort_order limit 1)),
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and is_active order by sort_order limit 1),
    'down_payment_option_id', (select id from public.option_items
                               where list_key = 'down_payment' and is_active order by sort_order limit 1),
    'contact_channel', 'phone',
    'consent_text', 'أوافق'
  ) || p_overrides
$$;

create function pg_temp.v3_expect_error(p jsonb, p_expected text) returns void language plpgsql as $$
begin
  perform public.submit_interest_request(p);
  raise exception 'expected error "%" but the call succeeded', p_expected;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%"', p_expected, sqlerrm;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The lists: durations seeded from §8, budgets waiting for AgriZed (§40)
-- ---------------------------------------------------------------------------

do $$
declare
  v_months integer[];
begin
  assert (select l.value_kind = 'number_range' from public.option_lists l where l.key = 'duration'),
    'the duration list exists and holds month ranges';
  select array_agg(o.min_number::integer order by o.min_number) into v_months
  from public.option_items o
  where o.list_key = 'duration' and o.code in ('d_36', 'd_60', 'd_84') and o.min_number = o.max_number;
  assert v_months = array[36, 60, 84], 'the three seeded durations hold 36, 60 and 84 months, got ' || coalesce(v_months::text, 'none');

  assert (select l.value_kind = 'money' from public.option_lists l where l.key = 'budget'),
    'the budget list exists and holds money ranges';

  set local role anon;
  assert (select count(*) from public.option_items o where o.list_key = 'duration' and o.code in ('d_36', 'd_60', 'd_84')) = 3,
    'a visitor reads the durations';
  assert exists (select 1 from public.option_lists l where l.key = 'budget'), 'a visitor reads the budget list';
  reset role;
end $$;

-- Budget fixtures: one active range and one retired range, with codes nobody uses
do $$
declare
  v_active   uuid;
  v_inactive uuid;
begin
  insert into public.option_items (list_key, code, label_ar, min_millimes, max_millimes, sort_order, is_active)
  values ('budget', 'intake_v3_test_active', 'ميزانية تجريبية', 5000000, 10000000, 9990, true)
  returning id into v_active;
  insert into public.option_items (list_key, code, label_ar, min_millimes, max_millimes, sort_order, is_active)
  values ('budget', 'intake_v3_test_retired', 'ميزانية قديمة', 1000000, 2000000, 9991, false)
  returning id into v_inactive;
  perform set_config('test.v3_budget_active', v_active::text, true);
  perform set_config('test.v3_budget_retired', v_inactive::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 2 · A v3 demand without an installment is snapshotted (LEAD-02)
-- ---------------------------------------------------------------------------

do $$
declare
  v_duration public.option_items;
  v_budget   public.option_items;
  v_res      jsonb;
  v_req      public.interest_requests;
begin
  select * into v_duration from public.option_items where list_key = 'duration' and code = 'd_60';
  select * into v_budget from public.option_items where id = current_setting('test.v3_budget_active')::uuid;

  v_res := public.submit_interest_request(pg_temp.v3_payload(jsonb_build_object(
    'duration_option_id', v_duration.id,
    'budget_option_id', v_budget.id,
    'wants_visit', true,
    'wants_bank_financing', false,
    'ip_hash', 'intake-v3-1')));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';
  perform set_config('test.v3_request_no', v_req.request_no, true);

  assert v_req.installment_option_id is null and v_req.installment_label_ar is null and v_req.installment_min_millimes is null,
    'a v3 demand carries no installment';
  assert v_req.duration_option_id = v_duration.id, 'the chosen duration is kept';
  assert v_req.duration_months = 60, 'the duration months are snapshotted, got ' || coalesce(v_req.duration_months::text, 'null');
  assert v_req.duration_label_ar = v_duration.label_ar, 'the duration label is kept as displayed, got ' || coalesce(v_req.duration_label_ar, 'null');
  assert v_req.budget_option_id = v_budget.id and v_req.budget_label_ar = v_budget.label_ar
     and v_req.budget_min_millimes = 5000000 and v_req.budget_max_millimes = 10000000,
    'the budget range is snapshotted in millimes';
  assert v_req.wants_visit is true, 'the visit answer is kept';
  assert v_req.wants_bank_financing is false, 'a «no» to bank financing is kept as false, not as no answer';

  -- Editing the list later does not change the demand (LEAD-02)
  update public.option_items set label_ar = 'مدة معدّلة', min_number = 61, max_number = 61 where id = v_duration.id;
  assert (select r.duration_months = 60 and r.duration_label_ar = v_duration.label_ar
          from public.interest_requests r where r.id = v_req.id), 'the duration snapshot survives list edits';
  update public.option_items set label_ar = v_duration.label_ar, min_number = 60, max_number = 60 where id = v_duration.id;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · Older callers still send an installment, and it is still snapshotted
-- ---------------------------------------------------------------------------

do $$
declare
  v_inst public.option_items;
  v_res  jsonb;
  v_req  public.interest_requests;
begin
  select * into v_inst from public.option_items
  where list_key = 'monthly_installment' and is_active order by sort_order limit 1;
  assert v_inst.id is not null, 'the installment list still has an active item';

  v_res := public.submit_interest_request(pg_temp.v3_payload(jsonb_build_object(
    'phone_e164', current_setting('test.v3_phone_2'),
    'installment_option_id', v_inst.id,
    'ip_hash', 'intake-v3-2')));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';

  assert v_req.installment_option_id = v_inst.id and v_req.installment_label_ar = v_inst.label_ar
     and v_req.installment_min_millimes is not distinct from v_inst.min_millimes,
    'a legacy installment is snapshotted as before';
  assert v_req.duration_option_id is null and v_req.duration_months is null, 'no duration was given, none is invented';
  assert v_req.wants_visit is null and v_req.wants_bank_financing is null, 'unanswered questions stay empty';

  perform pg_temp.v3_expect_error(pg_temp.v3_payload(jsonb_build_object(
    'installment_option_id', gen_random_uuid(), 'ip_hash', 'intake-v3-3')), 'invalid_installment');
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Wrong values: a duration or budget from nowhere is refused, a strange yes/no is «no answer»
-- ---------------------------------------------------------------------------

do $$
declare
  v_res jsonb;
  v_req public.interest_requests;
begin
  perform pg_temp.v3_expect_error(pg_temp.v3_payload(jsonb_build_object(
    'duration_option_id', gen_random_uuid(), 'ip_hash', 'intake-v3-4')), 'invalid_duration');
  perform pg_temp.v3_expect_error(pg_temp.v3_payload(jsonb_build_object(
    'duration_option_id', 'not-a-uuid', 'ip_hash', 'intake-v3-5')), 'invalid_duration');
  -- An item of another list is not a duration
  perform pg_temp.v3_expect_error(pg_temp.v3_payload(jsonb_build_object(
    'duration_option_id', (select id from public.option_items where list_key = 'down_payment' and is_active limit 1),
    'ip_hash', 'intake-v3-6')), 'invalid_duration');

  perform pg_temp.v3_expect_error(pg_temp.v3_payload(jsonb_build_object(
    'budget_option_id', gen_random_uuid(), 'ip_hash', 'intake-v3-7')), 'invalid_budget');
  perform pg_temp.v3_expect_error(pg_temp.v3_payload(jsonb_build_object(
    'budget_option_id', current_setting('test.v3_budget_retired'), 'ip_hash', 'intake-v3-8')), 'invalid_budget');

  v_res := public.submit_interest_request(pg_temp.v3_payload(jsonb_build_object(
    'wants_visit', 'maybe', 'wants_bank_financing', 42, 'ip_hash', 'intake-v3-9')));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';
  assert v_req.wants_visit is null, 'a non-boolean visit answer is stored as no answer';
  assert v_req.wants_bank_financing is null, 'a non-boolean bank financing answer is stored as no answer';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · The view keeps every column and stays closed to visitors (COM-05)
-- ---------------------------------------------------------------------------

do $$
begin
  assert (select count(*) from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = 'crm_requests'
            and c.column_name in ('parcel_id', 'project_code', 'parcel_code', 'parcel_plan_months', 'parcel_captured_at',
                                  'duration_months', 'duration_label_ar', 'budget_label_ar', 'wants_visit',
                                  'wants_bank_financing', 'status_label_ar', 'person_archived_at')) = 12,
    'crm_requests exposes the 0020 parcel snapshot, the v3 answers and the person columns';

  assert not has_table_privilege('anon', 'public.crm_requests', 'select'), 'visitors cannot read the CRM view';
  assert has_table_privilege('authenticated', 'public.crm_requests', 'select'), 'staff read the CRM view under RLS';
  assert not has_function_privilege('anon', 'public.crm_search_requests(jsonb, integer, integer)', 'execute'),
    'visitors cannot search the CRM';
  assert has_function_privilege('authenticated', 'public.crm_search_requests(jsonb, integer, integer)', 'execute'),
    'staff can search the CRM';
  assert not has_function_privilege('anon', 'public.crm_demand_stats(date, date, boolean)', 'execute'),
    'visitors cannot run the demand report';

  set local role anon;
  begin
    perform 1 from public.crm_requests limit 1;
    raise exception 'expected a visitor to be refused the CRM view but the query ran';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 6 · An admin finds the demands by duration, visit and bank financing (report v3 §44, §49)
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_admin, 'intake-v3-admin-' || v_admin || '@test.local');
  update public.profiles set full_name = 'Admin Intake v3', is_active = true where id = v_admin;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  perform set_config('test.v3_admin', v_admin::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.v3_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_phone1 text := current_setting('test.v3_phone_1');
  v_phone2 text := current_setting('test.v3_phone_2');
  v_row    record;
  v_n      bigint;
  v_ok     boolean;
begin
  -- The duration range finds the 60-month demand and returns the new columns
  select * into v_row
  from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'duration_min', 60, 'duration_max', 60), 500)
  where request_no = current_setting('test.v3_request_no');
  assert v_row.id is not null, 'the 60-month demand is found in the 60..60 range';
  assert v_row.duration_months = 60 and v_row.duration_label_ar is not null
     and v_row.budget_label_ar = 'ميزانية تجريبية' and v_row.budget_min_millimes = 5000000
     and v_row.wants_visit is true and v_row.wants_bank_financing is false,
    'the search returns the v3 answers, got ' || row_to_json(v_row)::text;

  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'duration_min', 61), 500)
  where phone_e164 = v_phone1;
  assert v_n = 0, 'no fixture demand is longer than 60 months, got ' || v_n;

  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('q', v_phone2, 'duration_max', 84), 500)
  where phone_e164 = v_phone2;
  assert v_n = 0, 'a demand without a duration is not returned by a duration filter, got ' || v_n;

  -- Visit: true keeps the «yes», false keeps the «not yet», absent keeps everything
  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'wants_visit', 'true'), 500)
  where phone_e164 = v_phone1;
  assert v_n = 1, 'one fixture demand wants a visit, got ' || v_n;

  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'wants_visit', 'false'), 500)
  where phone_e164 = v_phone1;
  assert v_n = 0, 'no fixture demand answered «not yet» to the visit, got ' || v_n;

  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('q', v_phone1), 500)
  where phone_e164 = v_phone1;
  assert v_n = 2, 'without the filter both demands of phone 1 are listed, got ' || v_n;

  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('q', v_phone1, 'wants_bank_financing', 'false'), 500)
  where phone_e164 = v_phone1;
  assert v_n = 1, 'the «no» to bank financing is found, got ' || v_n;

  -- The demand report: durations add up to the demands, in one snapshot
  select (select sum((b->>'count')::bigint) from jsonb_array_elements(s->'by_duration') b) = (s->>'requests')::bigint
     and exists (select 1 from jsonb_array_elements(s->'by_duration') b
                 where b->>'id' = (select id::text from public.option_items where list_key = 'duration' and code = 'd_60')
                   and (b->>'months')::integer = 60 and (b->>'count')::bigint >= 1)
     and exists (select 1 from jsonb_array_elements(s->'by_duration') b where b->>'id' is null)
     and (s->>'visit_yes')::bigint >= 1
     and (s->>'bank_financing_yes')::bigint >= 0
     and (select sum((b->>'count')::bigint) from jsonb_array_elements(p->'by_duration') b) >= (p->>'persons')::bigint
  into v_ok
  from (select public.crm_demand_stats() as s, public.crm_demand_stats(null, null, true) as p) x;
  assert v_ok, 'by_duration adds up to the demands, holds the 60-month bucket and a no-answer bucket, and visits are counted';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 7 · Copy: the summary row exists, and the closing call to action no longer says «سجّل مطلبك» (§17)
-- ---------------------------------------------------------------------------

do $$
begin
  assert (select count(*) from public.settings s
          where s.key in ('start.row_duration', 'start.row_duration_fr') and s.is_public and s.value_type = 'text'
            and s.group_key = 'site') = 2,
    'the duration row copy is a public site text, in Arabic and French';
  assert (select s.value from public.settings s where s.key = 'site.final_cta_title')
         is distinct from to_jsonb('سجّل مطلبك في مشروع المليون زيتونة'::text),
    'the closing call to action no longer holds the «سجّل مطلبك» seed';
end $$;
