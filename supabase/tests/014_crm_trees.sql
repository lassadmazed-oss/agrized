-- WP-07a · Trees requested in the CRM reports, people next to requests, bulk transfer.
-- Spec v2: §20, §21, §46, §47. Requirements: MIL-01, COM-05, COM-09, CRM-01.
--
-- Runs against the live database: fresh staff users, phones nobody uses and options read from the lists.
-- Exact figures are read as a fixture commercial, whose RLS scope holds the fixtures and nothing else;
-- figures over the whole database are compared inside one statement, so real traffic cannot move them.

-- 0032 retires these lists (plan Q-7) but this file submits their items: active again inside this rolled-back test only.
update public.option_items set is_active = true where list_key in ('down_payment', 'monthly_installment');

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

do $$
declare
  v_phone text;
  i       integer;
begin
  for i in 1..3 loop
    loop
      v_phone := '+21698' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.persons where phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests where phone_e164 = v_phone)
        and v_phone <> coalesce(current_setting('test.trees_phone_1', true), '')
        and v_phone <> coalesce(current_setting('test.trees_phone_2', true), '');
    end loop;
    perform set_config('test.trees_phone_' || i, v_phone, true);
  end loop;
end $$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_com1  uuid := gen_random_uuid();
  v_com2  uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (v_admin, 'trees-admin-' || v_admin || '@test.local'),
    (v_com1,  'trees-com1-' || v_com1 || '@test.local'),
    (v_com2,  'trees-com2-' || v_com2 || '@test.local');
  update public.profiles set full_name = 'Trees Test', is_active = true where id in (v_admin, v_com1, v_com2);
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_com1, 'commercial'), (v_com2, 'commercial');

  perform set_config('test.trees_admin', v_admin::text, true);
  perform set_config('test.trees_com1', v_com1::text, true);
  perform set_config('test.trees_com2', v_com2::text, true);
end $$;

create function pg_temp.trees_payload(p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف الزيتون',
    'residence_governorate_id', 34,
    'invest_governorate_ids', jsonb_build_array(34),
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios
                                       where is_active and not is_any order by sort_order limit 1)),
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and is_active order by sort_order limit 1),
    'down_payment_option_id', (select id from public.option_items
                               where list_key = 'down_payment' and is_active order by sort_order limit 1),
    'installment_option_id', (select id from public.option_items
                              where list_key = 'monthly_installment' and is_active order by sort_order limit 1),
    'contact_channel', 'phone',
    'consent_text', 'أوافق'
  ) || p_overrides
$$;

-- Two numbered cards, a typed number, a duplicate and a blank answer:
--   person 1 → card A, then a duplicate with card B   (commercial 1)
--   person 2 → a typed number                          (commercial 1)
--   person 3 → no tree count, «anywhere»               (commercial 2)
do $$
declare
  v_a     public.option_items;
  v_b     public.option_items;
  v_n     integer := least(greatest(37, app.setting_int('million.custom_trees_min', 1)),
                           app.setting_int('million.custom_trees_max', 5000));
  v_res   jsonb;
begin
  select * into v_a from public.option_items
  where list_key = 'tree_count' and is_active and min_number is not null order by sort_order limit 1;
  select * into v_b from public.option_items
  where list_key = 'tree_count' and is_active and min_number is not null and code <> v_a.code order by sort_order limit 1;
  assert v_a.id is not null and v_b.id is not null, 'the tree_count list has two active numbered cards';

  perform set_config('test.trees_code_a', v_a.code, true);
  perform set_config('test.trees_code_b', v_b.code, true);
  perform set_config('test.trees_a', v_a.min_number::integer::text, true);
  perform set_config('test.trees_n', v_n::text, true);

  v_res := public.submit_interest_request(pg_temp.trees_payload(jsonb_build_object(
    'phone_e164', current_setting('test.trees_phone_1'), 'tree_count_option_id', v_a.id)));
  v_res := public.submit_interest_request(pg_temp.trees_payload(jsonb_build_object(
    'phone_e164', current_setting('test.trees_phone_1'), 'tree_count_option_id', v_b.id)));
  assert (select is_duplicate from public.interest_requests where request_no = v_res->>'request_no'),
    'the second demand of person 1 is a duplicate';

  perform public.submit_interest_request(pg_temp.trees_payload(jsonb_build_object(
    'phone_e164', current_setting('test.trees_phone_2'), 'tree_count_custom', v_n::text)));

  perform public.submit_interest_request(pg_temp.trees_payload(jsonb_build_object(
    'phone_e164', current_setting('test.trees_phone_3'), 'invest_anywhere', true,
    'invest_governorate_ids', jsonb_build_array())));

  update public.persons set assigned_to = current_setting('test.trees_com1')::uuid
  where phone_e164 in (current_setting('test.trees_phone_1'), current_setting('test.trees_phone_2'));
  update public.persons set assigned_to = current_setting('test.trees_com2')::uuid
  where phone_e164 = current_setting('test.trees_phone_3');

  perform set_config('test.trees_p1', (select id::text from public.persons where phone_e164 = current_setting('test.trees_phone_1')), true);
  perform set_config('test.trees_p2', (select id::text from public.persons where phone_e164 = current_setting('test.trees_phone_2')), true);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · Grants and signature
-- ---------------------------------------------------------------------------

do $$
begin
  assert to_regprocedure('public.crm_demand_stats(date, date)') is null, 'the two-argument report is replaced';
  assert not has_function_privilege('anon', 'public.crm_demand_stats(date, date, boolean)', 'execute'),
    'visitors cannot run the demand report';
  assert has_function_privilege('authenticated', 'public.crm_demand_stats(date, date, boolean)', 'execute'),
    'staff can run the demand report';
  assert not has_function_privilege('anon', 'public.crm_search_requests(jsonb, integer, integer)', 'execute'),
    'visitors cannot search the CRM';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Commercial 1 counts exactly their two files (COM-05, MIL-01)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.trees_com1'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_a       bigint := current_setting('test.trees_a')::bigint;
  v_n       bigint := current_setting('test.trees_n')::bigint;
  v_s       jsonb := public.crm_demand_stats();
  v_people  jsonb := public.crm_demand_stats(null, null, true);
  v_bucket  jsonb;
  v_gov     jsonb;
  v_row     record;
  v_rows    bigint;
begin
  assert (v_s->>'requests')::bigint = 3, 'commercial 1 sees 3 demands, got ' || (v_s->>'requests');
  assert (v_s->>'persons')::bigint = 2, 'commercial 1 sees 2 persons, got ' || (v_s->>'persons');
  assert (v_s->>'duplicates')::bigint = 1, 'one of them is a duplicate, got ' || (v_s->>'duplicates');
  assert (v_s->>'trees_total')::bigint = v_a + v_n,
    'trees = card A + typed number, duplicate excluded: expected ' || (v_a + v_n) || ', got ' || (v_s->>'trees_total');

  -- The typed number has its own bucket, labelled from settings
  select b into v_bucket from jsonb_array_elements(v_s->'by_tree_count') b where b->>'code' = 'custom';
  assert v_bucket is not null, 'typed numbers have their own bucket';
  assert (v_bucket->>'count')::bigint = 1 and (v_bucket->>'trees')::bigint = v_n,
    'the custom bucket holds the typed number, got ' || v_bucket::text;
  assert v_bucket->>'label' = app.setting_text('start.custom_label', 'عدد مخصّص'), 'the custom bucket label comes from settings';

  select b into v_bucket from jsonb_array_elements(v_s->'by_tree_count') b where b->>'code' = current_setting('test.trees_code_a');
  assert (v_bucket->>'count')::bigint = 1 and (v_bucket->>'trees')::bigint = v_a, 'card A counts its trees, got ' || v_bucket::text;

  select b into v_bucket from jsonb_array_elements(v_s->'by_tree_count') b where b->>'code' = current_setting('test.trees_code_b');
  assert (v_bucket->>'count')::bigint = 1 and (v_bucket->>'trees')::bigint = 0,
    'a duplicate is a demand in its bucket but adds no trees, got ' || v_bucket::text;

  assert (select sum((b->>'trees')::bigint) from jsonb_array_elements(v_s->'by_tree_count') b) = (v_s->>'trees_total')::bigint,
    'the tree-count buckets add up to the total';

  -- Governorates: Sfax holds every demand and every tree of commercial 1
  select g into v_gov from jsonb_array_elements(v_s->'by_invest_governorate') g where (g->>'id')::int = 34;
  assert (v_gov->>'count')::bigint = 3 and (v_gov->>'trees')::bigint = v_a + v_n, 'Sfax counts 3 demands and their trees, got ' || v_gov::text;
  select g into v_gov from jsonb_array_elements(v_s->'by_governorate_trees') g where (g->>'id')::int = 34;
  assert (v_gov->>'trees')::bigint = v_a + v_n, 'trees by governorate agree, got ' || v_gov::text;
  assert (v_s->'by_governorate_trees'->0->>'id')::int = 34, 'the governorate with most trees comes first';

  -- People mode counts persons in the breakdowns; the headline figures do not move
  assert (v_people->>'people_mode')::boolean, 'people mode is reported';
  select g into v_gov from jsonb_array_elements(v_people->'by_invest_governorate') g where (g->>'id')::int = 34;
  assert (v_gov->>'count')::bigint = 2, 'people mode counts 2 persons in Sfax, got ' || v_gov::text;
  assert (v_gov->>'trees')::bigint = v_a + v_n, 'people mode leaves the trees unchanged';
  assert (v_people->>'requests')::bigint = 3 and (v_people->>'persons')::bigint = 2
     and (v_people->>'trees_total')::bigint = v_a + v_n, 'people mode keeps the headline figures';

  -- The period filter applies to the trees too
  assert (public.crm_demand_stats((now() at time zone 'Africa/Tunis')::date + 1)->>'trees_total')::bigint = 0,
    'no trees are requested tomorrow';

  -- Search: totals of the whole filtered set, then one row per person
  select total_count, requests_total, persons_total, trees_total into v_row
  from public.crm_search_requests('{}'::jsonb, 1) limit 1;
  assert v_row.total_count = 3 and v_row.requests_total = 3 and v_row.persons_total = 2 and v_row.trees_total = v_a + v_n,
    'search totals cover the filtered set, not the page: got ' || row_to_json(v_row)::text;

  select count(*) as rows_n, count(distinct person_id) as persons_n, max(total_count) as total_n,
         max(requests_total) as requests_n
  into v_row
  from public.crm_search_requests('{"people": true}'::jsonb, 50);
  assert v_row.rows_n = 2 and v_row.persons_n = 2 and v_row.total_n = 2 and v_row.requests_n = 3,
    'people mode lists each person once, pages by persons and keeps the demand total: got ' || row_to_json(v_row)::text;

  -- §47: a tree range finds the typed number, and the totals follow the filter
  select count(*) filter (where tree_count_code = 'custom') as custom_rows, max(trees_total) as trees,
         coalesce(sum(tree_count_min) filter (where not is_duplicate), 0) as listed
  into v_row
  from public.crm_search_requests(jsonb_build_object('trees_min', v_n, 'trees_max', v_n), 500);
  assert v_row.custom_rows = 1, 'the typed number is found by its tree range';
  assert v_row.trees = v_row.listed, 'the filtered tree total equals the listed demands';

  -- A commercial cannot transfer files (COM-09)
  begin
    perform public.admin_assign_persons(array[current_setting('test.trees_p1')::uuid], current_setting('test.trees_com1')::uuid, 'x');
    raise exception 'a commercial must not transfer files';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · Commercial 2 counts only their own file
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.trees_com2'), 'role', 'authenticated')::text, true);

do $$
declare
  v_s      jsonb := public.crm_demand_stats();
  v_bucket jsonb;
begin
  assert (v_s->>'requests')::bigint = 1, 'commercial 2 sees 1 demand, got ' || (v_s->>'requests');
  assert (v_s->>'trees_total')::bigint = 0, 'a blank answer adds no trees, got ' || (v_s->>'trees_total');
  assert (v_s->>'anywhere')::bigint = 1, 'the «anywhere» demand is counted apart';
  assert (select coalesce(sum((g->>'count')::bigint), 0) from jsonb_array_elements(v_s->'by_invest_governorate') g) = 0,
    'commercial 2 has nothing in any governorate';
  select b into v_bucket from jsonb_array_elements(v_s->'by_tree_count') b where b->>'code' is null;
  assert (v_bucket->>'count')::bigint = 1, 'a blank answer has its own bucket, got ' || coalesce(v_bucket::text, 'null');
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Admin: whole-database figures agree with the rows, and bulk transfer (COM-09)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.trees_admin'), 'role', 'authenticated')::text, true);

do $$
declare
  v_ok    boolean;
  v_count integer;
begin
  -- One statement, one snapshot: the report and the rows it summarises cannot drift apart.
  select (x.s->>'trees_total')::bigint = x.direct_trees
     and (x.s->>'requests')::bigint = x.direct_requests
     and (select sum((b->>'trees')::bigint) from jsonb_array_elements(x.s->'by_tree_count') b) = x.direct_trees
     and not exists (
       select 1
       from jsonb_array_elements(x.s->'by_invest_governorate') g
       join jsonb_array_elements(x.pp->'by_invest_governorate') gp on gp->>'id' = g->>'id'
       where (gp->>'count')::bigint > (g->>'count')::bigint
     )
  into v_ok
  from (
    select public.crm_demand_stats() as s,
           public.crm_demand_stats(null, null, true) as pp,
           (select coalesce(sum(tree_count_min) filter (where not is_duplicate), 0) from public.interest_requests) as direct_trees,
           (select count(*) from public.interest_requests) as direct_requests
  ) x;
  assert v_ok, 'admin figures match the rows, buckets add up and people never exceed demands';

  v_count := public.admin_assign_persons(
    array[current_setting('test.trees_p1')::uuid, current_setting('test.trees_p2')::uuid, current_setting('test.trees_p1')::uuid],
    current_setting('test.trees_com2')::uuid, 'تحويل جماعي');
  assert v_count = 2, 'bulk transfer moves two files once each, got ' || v_count;
  assert (select count(*) from public.person_assignments
          where person_id in (current_setting('test.trees_p1')::uuid, current_setting('test.trees_p2')::uuid)
            and from_user = current_setting('test.trees_com1')::uuid
            and to_user = current_setting('test.trees_com2')::uuid
            and created_by = current_setting('test.trees_admin')::uuid) = 2,
    'each transfer is kept in the history';
end $$;

-- The totals follow the files
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.trees_com1'), 'role', 'authenticated')::text, true);

do $$
begin
  assert (public.crm_demand_stats()->>'requests')::bigint = 0, 'commercial 1 no longer counts transferred files';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.trees_com2'), 'role', 'authenticated')::text, true);

do $$
declare
  v_s jsonb := public.crm_demand_stats();
begin
  assert (v_s->>'requests')::bigint = 4, 'commercial 2 now counts 4 demands, got ' || (v_s->>'requests');
  assert (v_s->>'trees_total')::bigint = current_setting('test.trees_a')::bigint + current_setting('test.trees_n')::bigint,
    'commercial 2 now counts the transferred trees';
end $$;

reset role;
