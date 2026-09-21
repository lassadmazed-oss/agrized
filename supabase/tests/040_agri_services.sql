-- Stage 4, first half: the tariff of a service, the record of the work, and the client's annual package.
-- Tests supabase/pending/bb_40_agri_services.sql.
--
-- PERMISSIONS FIRST, and the closed module before any happy path — the two flags are 'disabled' in the live
-- database and stay that way, so the refusal is the only case the live database can prove. Everything after
-- T2 opens the flags INSIDE this transaction, which the runner rolls back; the live rows are untouched.
--
-- Runs against the live database inside a rolled-back transaction: every fixture carries a code, a phone
-- number and a user id of its own, and nothing survives the file. public.parcels is never read and never
-- written.

-- ---------------------------------------------------------------------------
-- Helpers (the shape supabase/tests/033_trees.sql established)
-- ---------------------------------------------------------------------------

create or replace function pg_temp.tt_expect(p_sql text, p_expected text) returns void language plpgsql as $$
declare
  v_ran boolean := false;
begin
  begin
    execute p_sql;
    v_ran := true;
  exception when others then
    if sqlerrm <> p_expected then
      raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
    end if;
  end;
  if v_ran then
    raise exception 'expected error "%" but the call went through: %', p_expected, p_sql;
  end if;
end $$;

create or replace function pg_temp.tt_denied(p_sql text) returns void language plpgsql as $$
declare
  v_ran boolean := false;
begin
  begin
    execute p_sql;
    v_ran := true;
  exception when insufficient_privilege then null;
  end;
  if v_ran then
    raise exception 'expected a privilege error, the call went through: %', p_sql;
  end if;
end $$;

create or replace function pg_temp.tt_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
end $$;

create or replace function pg_temp.tt_as_user(p_sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function pg_temp.ag(p_key text) returns uuid language sql stable as $$
  select nullif(current_setting('test.ag_' || p_key, true), '')::uuid
$$;

create function pg_temp.tt_service(p_code text) returns uuid language sql stable as $$
  select oi.id from public.option_items oi where oi.list_key = 'agrized_service' and oi.code = p_code
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

do $$
declare
  v_id     uuid;
  v_status uuid;
begin
  -- Pinned so the seasons and the lateness below do not depend on what the owner has edited today.
  update public.settings set value = to_jsonb(10) where key = 'agri.season_start_month';
  update public.settings set value = to_jsonb(7)  where key = 'agri.overdue_grace_days';

  -- One of each desk. The agricultural manager runs the grove and reads no client file; Finance prices and
  -- reads every file; the commercial reads only their own; the client is authenticated and is not staff.
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000004001', 'authenticated', 'authenticated', 'agri-s4@test.local', '{"full_name":"Agri S4"}'),
    ('00000000-0000-0000-0000-000000004002', 'authenticated', 'authenticated', 'fin-s4@test.local',  '{"full_name":"Finance S4"}'),
    ('00000000-0000-0000-0000-000000004003', 'authenticated', 'authenticated', 'com-s4@test.local',  '{"full_name":"Commercial S4"}'),
    ('00000000-0000-0000-0000-000000004004', 'authenticated', 'authenticated', 'cli-s4@test.local',  '{"full_name":"Client S4"}');

  insert into public.user_roles (user_id, role) values
    ('00000000-0000-0000-0000-000000004001', 'agri_manager'),
    ('00000000-0000-0000-0000-000000004002', 'finance'),
    ('00000000-0000-0000-0000-000000004003', 'commercial'),
    ('00000000-0000-0000-0000-000000004004', 'client');

  -- An offer that advertises التقليم and الجني, and one that advertises nothing at all — OFF-AIRPORT's real
  -- situation today.
  insert into public.projects (code, name, governorate_id, status, tree_count, service_option_ids)
  values ('AG-A-' || gen_random_uuid(), 'ضيعة الخدمات', 34, 'published', 6,
          array[pg_temp.tt_service('pruning'), pg_temp.tt_service('harvest')])
  returning id into v_id;
  perform set_config('test.ag_a', v_id::text, true);

  insert into public.projects (code, name, governorate_id, status, tree_count, service_option_ids)
  values ('AG-B-' || gen_random_uuid(), 'ضيعة بلا خدمات', 34, 'published', 3, '{}')
  returning id into v_id;
  perform set_config('test.ag_b', v_id::text, true);

  -- Its own annual fee, so the snapshot below is provably the OFFER's figure and not the global one.
  insert into public.tree_pricing_rules (project_id, annual_fee_per_tree_millimes)
  values (pg_temp.ag('a'), 44000);

  select id into v_status from public.lead_statuses where stage = 'new' and is_active
  order by is_stage_default desc, sort_order limit 1;

  -- One client the commercial owns, one nobody owns.
  insert into public.persons (full_name, phone_e164, status_id, governorate_id, assigned_to)
  values ('حريف الاشتراك', '+21655540101', v_status, 34, '00000000-0000-0000-0000-000000004003')
  returning id into v_id;
  perform set_config('test.ag_p1', v_id::text, true);

  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف بلا مكلّف', '+21655540102', v_status, 34) returning id into v_id;
  perform set_config('test.ag_p2', v_id::text, true);

  -- Four trees of offer A owned by the first client, two still available; and the second offer's three.
  insert into public.trees (project_id, seq, code, state, held_by, allocated_at)
  select pg_temp.ag('a'), s, 'AG-A-' || lpad(s::text, 4, '0'), 'sold', pg_temp.ag('p1'), now()
  from generate_series(1, 4) as s;
  insert into public.trees (project_id, seq, code)
  select pg_temp.ag('a'), s, 'AG-A-' || lpad(s::text, 4, '0') from generate_series(5, 6) as s;
  insert into public.trees (project_id, seq, code)
  select pg_temp.ag('b'), s, 'AG-B-' || lpad(s::text, 4, '0') from generate_series(1, 3) as s;

  select id into v_id from public.trees where project_id = pg_temp.ag('a') and seq = 1;
  perform set_config('test.ag_t1', v_id::text, true);
  select id into v_id from public.trees where project_id = pg_temp.ag('b') and seq = 1;
  perform set_config('test.ag_tb', v_id::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- T1 · PERMISSIONS. Who may read the four tables, and who may execute the ten functions.
-- ---------------------------------------------------------------------------

do $$
begin
  -- A visitor reads none of it, ever: not a tariff, not a work log, not a client's package.
  perform pg_temp.tt_as_anon();
  perform pg_temp.tt_denied('select 1 from public.project_service_terms');
  perform pg_temp.tt_denied('select 1 from public.agri_operations');
  perform pg_temp.tt_denied('select 1 from public.agri_operation_trees');
  perform pg_temp.tt_denied('select 1 from public.subscriptions');
  perform pg_temp.tt_denied('select 1 from public.subscription_lines');
  perform pg_temp.tt_denied('select public.staff_agri_operations(null, ''all'', null)');
  perform pg_temp.tt_denied('select public.staff_subscriptions(''all'', null, null)');
  perform pg_temp.tt_denied('select public.staff_offer_services(''00000000-0000-0000-0000-000000000000''::uuid)');
  reset role;

  -- A signed-in client is not staff and sees nothing either. The rows are refused by RLS, not by the grant,
  -- so the assertion is «no rows», not «privilege error».
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004004');
  assert (select count(*) from public.project_service_terms) = 0, 'a client reads no tariff';
  assert (select count(*) from public.agri_operations) = 0, 'a client reads no operation';
  assert (select count(*) from public.subscriptions) = 0, 'a client reads no subscription';
  perform pg_temp.tt_expect('select public.staff_agri_operations(null, ''all'', null)', 'forbidden');
  perform pg_temp.tt_expect('select public.staff_subscriptions(''all'', null, null)', 'forbidden');
  reset role;

  -- The grove log is the agricultural desk's. A commercial reads client files, never what the grove cost.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004003');
  perform pg_temp.tt_expect('select public.staff_agri_operations(null, ''all'', null)', 'forbidden');
  perform pg_temp.tt_expect(
    format('select public.staff_offer_services(%L::uuid)', pg_temp.ag('a')), 'forbidden');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T2 · THE CLOSED MODULE. Both flags are 'disabled' live; every writer refuses, in both modules.
-- ---------------------------------------------------------------------------

do $$
begin
  assert (select state from public.feature_flags where key = 'agri_backoffice') = 'disabled',
    'agri_backoffice must still be disabled — the owner presses the switch himself';
  assert (select state from public.feature_flags where key = 'subscriptions') = 'disabled',
    'subscriptions must still be disabled — the owner presses the switch himself';

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004002');  -- Finance: every role check would pass
  perform pg_temp.tt_expect(
    format('select public.staff_save_offer_service(jsonb_build_object(''project_id'', %L, ''service_option_id'', %L, ''basis'', ''per_tree'', ''amount_millimes'', 1000), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.tt_service('harvest')), 'module_closed');
  perform pg_temp.tt_expect(
    format('select public.staff_save_agri_operation(jsonb_build_object(''project_id'', %L, ''service_option_id'', %L), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.tt_service('pruning')), 'module_closed');
  perform pg_temp.tt_expect(
    format('select public.staff_create_subscription(jsonb_build_object(''project_id'', %L, ''person_id'', %L), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.ag('p1')), 'module_closed');
  reset role;

  -- A reader is NOT gated: the Back Office is where a module is prepared. It reports the state instead.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004001');
  assert public.staff_agri_operations(null, 'all', null)->>'module_state' = 'disabled',
    'the reader must open while the module is off and say so';
  reset role;

  -- Open both for the rest of the file. Rolled back with everything else.
  update public.feature_flags set state = 'internal' where key in ('agri_backoffice', 'subscriptions');
end $$;

-- ---------------------------------------------------------------------------
-- T3 · THE TARIFF. An offer may not price a service it never advertised, and a package service is free.
-- ---------------------------------------------------------------------------

do $$
declare
  v_terms jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004001');  -- the agri manager does not set prices
  perform pg_temp.tt_expect(
    format('select public.staff_save_offer_service(jsonb_build_object(''project_id'', %L, ''service_option_id'', %L, ''basis'', ''per_tree'', ''amount_millimes'', 1000), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.tt_service('harvest')), 'forbidden');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004002');  -- Finance does

  -- الحرث is not in this offer's card, so this offer cannot charge for it.
  perform pg_temp.tt_expect(
    format('select public.staff_save_offer_service(jsonb_build_object(''project_id'', %L, ''service_option_id'', %L, ''basis'', ''per_tree'', ''amount_millimes'', 1000), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.tt_service('plowing')), 'service_not_in_offer');

  -- THE ONE ANNUAL FIGURE: a service inside the package may not carry a price of its own.
  perform pg_temp.tt_expect(
    format('select public.staff_save_offer_service(jsonb_build_object(''project_id'', %L, ''service_option_id'', %L, ''basis'', ''per_tree'', ''amount_millimes'', 5000, ''in_annual_package'', true), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.tt_service('pruning')), 'package_service_has_price');

  -- التقليم: inside the package, therefore free. الجني: an extra, therefore priced.
  perform public.staff_save_offer_service(
    jsonb_build_object('project_id', pg_temp.ag('a'), 'service_option_id', pg_temp.tt_service('pruning'),
                       'basis', 'per_tree', 'amount_millimes', 0, 'in_annual_package', true,
                       'frequency_option_id', (select id from public.option_items
                                               where list_key = 'service_frequency' and code = 'yearly')),
    'باقة الموسم');
  perform public.staff_save_offer_service(
    jsonb_build_object('project_id', pg_temp.ag('a'), 'service_option_id', pg_temp.tt_service('harvest'),
                       'basis', 'per_tree', 'amount_millimes', 3000),
    'ثمن الجني');
  reset role;

  -- Resolution: the offer's own row wins, and says so.
  v_terms := app.service_terms(pg_temp.ag('a'), pg_temp.tt_service('harvest'));
  assert (v_terms->>'ok')::boolean and v_terms->>'source' = 'project'
         and (v_terms->>'amount_millimes')::bigint = 3000,
    format('the offer''s own tariff must win, got %s', v_terms);

  -- A service with no tariff anywhere says so rather than pretending it is free.
  v_terms := app.service_terms(pg_temp.ag('b'), pg_temp.tt_service('pruning'));
  assert not (v_terms->>'ok')::boolean and v_terms->>'reason' = 'no_terms',
    format('a service with no tariff must say no_terms, got %s', v_terms);

  -- A global default is inherited by an offer that has no row of its own.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004002');
  perform public.staff_save_offer_service(
    jsonb_build_object('service_option_id', pg_temp.tt_service('pruning'),
                       'basis', 'per_tree', 'amount_millimes', 9000),
    'السعر العام للتقليم');
  reset role;

  v_terms := app.service_terms(pg_temp.ag('b'), pg_temp.tt_service('pruning'));
  assert (v_terms->>'ok')::boolean and v_terms->>'source' = 'global'
         and (v_terms->>'amount_millimes')::bigint = 9000,
    format('an offer with no row of its own inherits the global tariff, got %s', v_terms);

  -- And the offer that HAS its own row still reads its own, not the global one.
  v_terms := app.service_terms(pg_temp.ag('a'), pg_temp.tt_service('pruning'));
  assert v_terms->>'source' = 'project' and (v_terms->>'in_annual_package')::boolean,
    format('the offer''s own row must not be shadowed by the global one, got %s', v_terms);
end $$;

-- ---------------------------------------------------------------------------
-- T4 · THE OPERATION. Offer grain, an optional subset, and «done» needs a date.
-- ---------------------------------------------------------------------------

do $$
declare
  v_op   jsonb;
  v_list jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004001');  -- the agricultural desk

  perform pg_temp.tt_expect(
    format('select public.staff_save_agri_operation(jsonb_build_object(''project_id'', %L, ''service_option_id'', %L, ''status'', ''done''), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.tt_service('pruning')), 'operation_date_required');

  -- A tree of another offer may never be named here.
  perform pg_temp.tt_expect(
    format('select public.staff_save_agri_operation(jsonb_build_object(''project_id'', %L, ''service_option_id'', %L, ''tree_ids'', jsonb_build_array(%L)), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.tt_service('pruning'), pg_temp.ag('tb')), 'invalid_tree_selection');

  -- The normal case: one act on the whole grove. ONE ROW, not one per tree.
  v_op := public.staff_save_agri_operation(
    jsonb_build_object('project_id', pg_temp.ag('a'), 'service_option_id', pg_temp.tt_service('pruning'),
                       'status', 'done', 'executed_on', (current_date - 400)::text,
                       'cost_millimes', 250000, 'note', 'تقليم الموسم الفائت'),
    'تسجيل التقليم');
  assert v_op->>'scope' = 'offer' and v_op->>'label_ar' = 'التقليم',
    format('an operation with no tree list covers the whole offer, got %s', v_op);
  assert (select count(*) from public.agri_operations where project_id = pg_temp.ag('a')) = 1,
    'ploughing a grove of six trees writes one row, not six';

  -- The exception: an act on named trees.
  v_op := public.staff_save_agri_operation(
    jsonb_build_object('project_id', pg_temp.ag('a'), 'service_option_id', pg_temp.tt_service('harvest'),
                       'status', 'planned', 'planned_on', (current_date - 30)::text,
                       'tree_ids', jsonb_build_array(pg_temp.ag('t1'))),
    'جني زيتونة واحدة');
  assert v_op->>'scope' = 'trees', format('a named tree list sets the scope, got %s', v_op);
  assert (select count(*) from public.agri_operation_trees where operation_id = (v_op->>'id')::uuid) = 1,
    'the named tree is recorded once';

  -- v2 §41's «Approved by» is its own act.
  assert v_op->>'approved_by' is null, 'a new operation is not approved by itself';
  v_op := public.staff_approve_agri_operation((v_op->>'id')::uuid, 'مصادقة');
  assert v_op->>'approved_by' is not null and v_op->>'approved_at' is not null,
    'approving records who and when';

  -- The list: three counts, and being late is computed, never stored.
  v_list := public.staff_agri_operations(pg_temp.ag('a'), 'all', null);
  assert (v_list#>>'{counts,done}')::integer = 1 and (v_list#>>'{counts,planned}')::integer = 1,
    format('the counts must match the rows, got %s', v_list->'counts');
  assert (v_list#>>'{counts,late}')::integer = 1,
    format('a planned operation 30 days past its date is late, got %s', v_list->'counts');
  assert jsonb_array_length(v_list->'rows') = 2, 'both operations are listed';

  -- PRJ-03: the agricultural manager records a cost but is not Finance, so the list hides the figure from him.
  assert not (v_list->>'costs_visible')::boolean, 'costs are not visible to the agricultural manager';
  assert (v_list#>'{rows,0}')->>'cost_millimes' is null and v_list->>'season_cost_millimes' is null,
    'a masked cost is absent, not zero';
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004002');  -- Finance sees the money
  v_list := public.staff_agri_operations(pg_temp.ag('a'), 'all', null);
  assert (v_list->>'costs_visible')::boolean, 'Finance sees costs';
  assert (select count(*) from jsonb_array_elements(v_list->'rows') e
          where (e->>'cost_millimes')::bigint = 250000) = 1,
    format('Finance reads the operation cost, got %s', v_list->'rows');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T5 · OVERDUE IS A FACT OF THE CLOCK, computed from the frequency and the grace days
-- ---------------------------------------------------------------------------

do $$
declare
  v_svc jsonb;
  v_row jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004001');
  v_svc := public.staff_offer_services(pg_temp.ag('a'));
  reset role;

  select e into v_row from jsonb_array_elements(v_svc->'services') e
  where (e->>'service_option_id')::uuid = pg_temp.tt_service('pruning');

  -- Pruned 400 days ago, due every 365, 7 days of grace → overdue, and the due date is stated.
  assert (v_row->>'next_due_on')::date = (current_date - 400) + 365,
    format('the due date is the last one plus the frequency, got %s', v_row);
  assert (v_row->>'is_overdue')::boolean, format('400 days after a yearly service is overdue, got %s', v_row);

  select e into v_row from jsonb_array_elements(v_svc->'services') e
  where (e->>'service_option_id')::uuid = pg_temp.tt_service('harvest');
  -- الجني has been planned but never performed, and carries no frequency: no due date, never late.
  assert v_row->>'next_due_on' is null and not (v_row->>'is_overdue')::boolean,
    format('a service with no frequency is never late, got %s', v_row);
  assert (v_row->>'planned_late')::integer = 1,
    format('a planned date that has passed is counted, got %s', v_row);

  -- The screen reads the offer's own annual fee here too — one figure, one resolution.
  assert (v_svc->>'annual_fee_per_tree_millimes')::bigint = 44000,
    format('the offer''s own annual fee must be the one shown, got %s', v_svc->>'annual_fee_per_tree_millimes');
end $$;

-- ---------------------------------------------------------------------------
-- T6 · THE SUBSCRIPTION. The annual fee is quoted once, frozen, and never recomputed.
-- ---------------------------------------------------------------------------

do $$
declare
  v_sub  jsonb;
  v_prev jsonb;
  v_list jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004002');  -- Finance

  -- An offer that advertises no service has no package, so it can sell no subscription — OFF-AIRPORT's exact
  -- situation, and the error names it rather than writing an empty package.
  perform pg_temp.tt_expect(
    format('select public.staff_create_subscription(jsonb_build_object(''project_id'', %L, ''person_id'', %L, ''tree_count'', 1), ''تجربة'')',
           pg_temp.ag('b'), pg_temp.ag('p1')), 'offer_has_no_package');

  -- A client who owns no tree in this offer has nothing to subscribe for.
  perform pg_temp.tt_expect(
    format('select public.staff_create_subscription(jsonb_build_object(''project_id'', %L, ''person_id'', %L), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.ag('p2')), 'no_trees_held');

  -- The preview and the write must agree, or the form promises a figure the write would not honour.
  v_prev := public.staff_subscription_preview(pg_temp.ag('a'), pg_temp.ag('p1'));
  assert (v_prev->>'trees_sold')::integer = 4 and (v_prev->>'fee_per_tree_millimes')::bigint = 44000
         and v_prev->>'fee_source' = 'project' and (v_prev->>'total_millimes')::bigint = 176000,
    format('the preview counts the trees owned and the offer''s own fee, got %s', v_prev);

  v_sub := public.staff_create_subscription(
    jsonb_build_object('project_id', pg_temp.ag('a'), 'person_id', pg_temp.ag('p1')), 'اشتراك الموسم');

  assert (v_sub->>'tree_count')::integer = 4, 'the count defaults to the trees the client owns';
  assert (v_sub->>'fee_per_tree_millimes')::bigint = 44000 and v_sub->>'fee_source' = 'project',
    format('the fee is the offer''s own, frozen, and says where it came from, got %s', v_sub);
  assert (v_sub->>'total_millimes')::bigint = 176000, 'the total is the count times the frozen fee';
  assert v_sub->>'status' = 'draft' and v_sub->>'payment_status' = 'unpaid',
    'status and payment are two columns and both start at the beginning';
  assert (v_sub->>'lines')::integer = 1, 'only the service inside the package becomes a line';
  assert (select amount_millimes from public.subscription_lines
          where subscription_id = (v_sub->>'id')::uuid) = 0,
    'a line inside the package carries no price of its own';

  -- THE POINT OF THE SNAPSHOT: the pricing rule moves, the subscription does not. (The rule is written as the
  -- migration owner: editing it belongs to the pricing screen's own RPC, which is not what is under test.)
  reset role;
  update public.tree_pricing_rules set annual_fee_per_tree_millimes = 12000 where project_id = pg_temp.ag('a');
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004002');
  assert (select fee_per_tree_millimes from public.subscriptions where id = (v_sub->>'id')::uuid) = 44000,
    'a subscription must never be re-priced by a later edit of the rule';
  assert (select total_millimes from public.subscriptions where id = (v_sub->>'id')::uuid) = 176000,
    'and neither must its total';

  -- One subscription per client per offer per season.
  perform pg_temp.tt_expect(
    format('select public.staff_create_subscription(jsonb_build_object(''project_id'', %L, ''person_id'', %L), ''تجربة'')',
           pg_temp.ag('a'), pg_temp.ag('p1')), 'subscription_exists');

  -- Status and payment move independently.
  perform public.staff_set_subscription_status((v_sub->>'id')::uuid, 'active', null, 'إمضاء');
  assert (select status || '/' || payment_status from public.subscriptions where id = (v_sub->>'id')::uuid)
         = 'active/unpaid',
    'setting the status must not touch the payment';
  perform public.staff_set_subscription_status((v_sub->>'id')::uuid, null, 'paid', 'خلاص');
  assert (select status || '/' || payment_status from public.subscriptions where id = (v_sub->>'id')::uuid)
         = 'active/paid',
    'setting the payment must not touch the status';

  -- «الخدمات المطلوبة» (§33): an extra becomes a line the day the client asks for it.
  perform public.staff_request_subscription_service((v_sub->>'id')::uuid, pg_temp.tt_service('harvest'), 'طلب الجني');
  v_list := public.staff_subscriptions('all', pg_temp.ag('a'), null);
  assert (v_list#>>'{counts,requested}')::integer = 1,
    format('a requested service is counted, got %s', v_list->'counts');
  assert (select amount_millimes from public.subscription_lines
          where subscription_id = (v_sub->>'id')::uuid
            and service_option_id = pg_temp.tt_service('harvest')) = 3000,
    'a requested extra carries the offer''s price for it';
  assert (v_list#>>'{counts,active}')::integer = 1 and (v_list#>>'{counts,unpaid}')::integer = 0,
    format('a paid active subscription is active and not unpaid, got %s', v_list->'counts');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T7 · A CLIENT FILE'S RULE APPLIES. A commercial reads their own, and not one more.
-- ---------------------------------------------------------------------------

do $$
declare
  v_list jsonb;
begin
  -- The commercial owns حريف الاشتراك (p1) and nobody else.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004003');
  v_list := public.staff_subscriptions('all', null, null);
  assert (select count(*) from jsonb_array_elements(v_list->'rows') e
          where (e->>'person_id')::uuid = pg_temp.ag('p1')) = 1,
    'a commercial reads the subscription of their own client';
  assert (select count(*) from jsonb_array_elements(v_list->'rows') e
          where (e->>'person_id')::uuid <> pg_temp.ag('p1')) = 0,
    'and not one belonging to anybody else';

  -- Reading a file is not pricing it: a commercial never writes subscription money.
  perform pg_temp.tt_expect(
    format('select public.staff_set_subscription_status(%L::uuid, ''cancelled'', null, ''تجربة'')',
           (select id from public.subscriptions where person_id = pg_temp.ag('p1') limit 1)), 'forbidden');
  reset role;

  -- The agricultural manager runs the grove and is not in app.can_see_person: he reads no client's package.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004001');
  v_list := public.staff_subscriptions('all', null, null);
  assert jsonb_array_length(v_list->'rows') = 0,
    'the agricultural manager reads no client file, so he reads no subscription';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T8 · The audit trail: every act left a row with its reason.
-- ---------------------------------------------------------------------------

do $$
begin
  assert (select count(*) from public.audit_logs
          where action in ('offer_service.save', 'agri_operation.save', 'agri_operation.approve',
                           'subscription.create', 'subscription.status', 'subscription_line.request')) >= 6,
    'every stage 4 act writes its own audit row (§51)';
  assert (select count(*) from public.audit_logs
          where action = 'subscription.create' and reason = 'اشتراك الموسم') = 1,
    'the reason the writer typed is what the log keeps';
end $$;
