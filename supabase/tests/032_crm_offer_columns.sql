-- The Back Office tells an offer lead from a calculator lead. Migration bb_crm_offer_columns.sql.
--
-- 0049 wrote request_kind, the offer and its trees onto the demand; the CRM view and search froze before it and
-- never showed them. These checks hold the fix in place: the rebuilt view carries every column of the table, the
-- search returns the offer ones, the new filter separates the two intakes, every filter that was already there
-- still answers the same way, and neither the view nor the search loosened who may read them.
--
-- Runs against the live database inside a rolled-back transaction: a fresh admin, two fresh commercials, unused
-- phone numbers and an offer with an unused code. Every search is scoped to the fixtures with assigned_to, so
-- real demands can neither hide a failure nor cause one.

do $$
declare
  v_phone text;
  i       integer;
begin
  for i in 1..2 loop
    loop
      v_phone := '+21695' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.persons where phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests where phone_e164 = v_phone)
        and v_phone <> coalesce(current_setting('test.co_phone_1', true), '');
    end loop;
    perform set_config('test.co_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Fixtures: the staff who read the list, one offer on sale, and three demands on two people
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin   uuid := gen_random_uuid();
  v_com     uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();
  v_project uuid;
  v_status  uuid;
  v_goal    public.option_items;
  v_person1 uuid;
  v_person2 uuid;
  v_result  jsonb;
  v_no      text;
begin
  insert into auth.users (id, email) values (v_admin, 'crm-offer-admin-' || v_admin || '@test.local');
  update public.profiles set full_name = 'Admin CRM Offer', is_active = true where id = v_admin;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  perform set_config('test.co_admin', v_admin::text, true);

  -- The commercial the fixtures are assigned to, and one who owns nothing: RLS must part them.
  insert into auth.users (id, email) values (v_com, 'crm-offer-com-' || v_com || '@test.local');
  update public.profiles set full_name = 'Commercial CRM Offer', is_active = true where id = v_com;
  insert into public.user_roles (user_id, role) values (v_com, 'commercial');
  perform set_config('test.co_commercial', v_com::text, true);

  insert into auth.users (id, email) values (v_other, 'crm-offer-other-' || v_other || '@test.local');
  update public.profiles set full_name = 'Commercial Sans Dossier', is_active = true where id = v_other;
  insert into public.user_roles (user_id, role) values (v_other, 'commercial');
  perform set_config('test.co_other', v_other::text, true);

  -- One offer on sale, priced the way an offer page prices itself (0034, 0048), as test 031 sets it up.
  update public.feature_flags set state = 'public' where key = 'pricing';
  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('crm-offer-test-' || gen_random_uuid(), 'ضيعة العرض', 34, 'published', 100)
  returning id into v_project;
  perform set_config('test.co_project', v_project::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id)
  values (v_project, (select id from public.tree_spacing_classes where code = 'trad_wide_24x24'));
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_project, 7000, 50000, 150000, 'percent', 1000, 1000);

  -- The demand this migration exists for: 25 trees of a named offer, taken by the real intake (0049).
  v_result := public.submit_offer_request(jsonb_build_object(
    'full_name', 'حريفة العرض',
    'phone_e164', current_setting('test.co_phone_2'),
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', current_setting('test.co_project'),
    'trees', '25'));
  perform set_config('test.co_offer_no', v_result->>'request_no', true);
  select person_id into v_person2 from public.interest_requests where request_no = v_result->>'request_no';

  select id into v_status from public.lead_statuses
  where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;
  select * into v_goal from public.option_items o where o.list_key = 'goal' and o.is_active order by o.sort_order limit 1;

  -- A slider demand from someone else, two hours older.
  insert into public.persons (full_name, phone_e164, whatsapp_e164, governorate_id, status_id, consent_at, last_request_at)
  values ('حريف الحاسبة', current_setting('test.co_phone_1'), current_setting('test.co_phone_1'), 34, v_status, now(), now())
  returning id into v_person1;

  v_no := 'AGZ-COTEST-' || substr(gen_random_uuid()::text, 1, 8);
  perform set_config('test.co_calc_no', v_no, true);
  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, residence_governorate_id,
    invest_anywhere, project_type_unsure,
    goal_option_id, goal_code, goal_label_ar,
    tree_count_code, tree_count_label_ar, tree_count_min, tree_count_max,
    payment_mode, wants_visit, contact_channel, consent_text, is_duplicate, created_at
  ) values (
    v_no, v_person1, 'حريف الحاسبة', current_setting('test.co_phone_1'), current_setting('test.co_phone_1'), 34,
    true, true,
    v_goal.id, v_goal.code, v_goal.label_ar,
    'custom', '5 زيتونة', 5, 5,
    'cash', true, 'phone', 'موافقة تجريبية', false, now() - interval '2 hours'
  );

  -- The same person as the offer demand asked through the calculator an hour earlier, and it was a repeat:
  -- the people mode and the tree total both have something to say about it.
  v_no := 'AGZ-COTEST-' || substr(gen_random_uuid()::text, 1, 8);
  perform set_config('test.co_calc_dup_no', v_no, true);
  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, residence_governorate_id,
    invest_anywhere, project_type_unsure,
    goal_option_id, goal_code, goal_label_ar,
    tree_count_code, tree_count_label_ar, tree_count_min, tree_count_max,
    payment_mode, wants_visit, contact_channel, consent_text, is_duplicate, created_at
  ) values (
    v_no, v_person2, 'حريفة العرض', current_setting('test.co_phone_2'), current_setting('test.co_phone_2'), 34,
    true, true,
    v_goal.id, v_goal.code, v_goal.label_ar,
    'custom', '10 زيتونة', 10, 10,
    'installments', false, 'phone', 'موافقة تجريبية', true, now() - interval '1 hour'
  );

  -- Both files belong to one commercial, so every search below is scoped to exactly these three demands.
  update public.persons set assigned_to = v_com where id in (v_person1, v_person2);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The view was rebuilt, so `select r.*` re-expanded over today's table
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
  v_result  text;
  v_col     text;
begin
  -- The bug in one assertion: a frozen view is a view missing columns the table has.
  select string_agg(t.column_name, ', ' order by t.column_name) into v_missing
  from information_schema.columns t
  where t.table_schema = 'public' and t.table_name = 'interest_requests'
    and not exists (select 1 from information_schema.columns v
                    where v.table_schema = 'public' and v.table_name = 'crm_requests'
                      and v.column_name = t.column_name);
  assert v_missing is null, 'crm_requests froze again and no longer carries: ' || coalesce(v_missing, '');

  assert (select count(*) from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = 'crm_requests'
            and c.column_name in ('request_kind', 'project_id', 'project_code', 'project_name', 'offer_trees',
                                  'offer_price_per_tree_millimes', 'offer_total_price_millimes',
                                  'offer_annual_fee_per_tree_millimes', 'offer_annual_fee_total_millimes')) = 9,
    'crm_requests exposes the nine offer columns of 0049';

  -- The parcel snapshot and the tree pricing snapshot the view already had are still there (0020, 0032).
  assert (select count(*) from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = 'crm_requests'
            and c.column_name in ('parcel_id', 'parcel_code', 'parcel_plan_months', 'parcel_captured_at',
                                  'duration_months', 'status_label_ar', 'person_archived_at', 'assigned_to_name',
                                  'spacing_class_id', 'area_per_tree_m2', 'payment_mode', 'total_price_millimes',
                                  'down_payment_percent', 'total_financed_millimes', 'monthly_millimes')) = 15,
    'the rebuilt view keeps everything it showed before';

  select pg_get_function_result(p.oid) into v_result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'crm_search_requests';
  foreach v_col in array array['request_kind', 'project_id', 'project_code', 'project_name', 'offer_trees'] loop
    assert v_result like '%' || v_col || '%', 'crm_search_requests returns ' || v_col;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · An offer demand is not a calculator demand (the bug the owner saw)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.co_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_scope jsonb := jsonb_build_object('assigned_to', current_setting('test.co_commercial'));
  v_offer record;
  v_calc  record;
  v_src   public.interest_requests;
begin
  select * into v_offer from public.crm_search_requests(v_scope, 500)
  where request_no = current_setting('test.co_offer_no');
  assert v_offer.id is not null, 'the offer demand reaches the leads list at all';
  assert v_offer.request_kind = 'offer',
    'the list says which intake brought it, got ' || coalesce(v_offer.request_kind, 'null');
  assert v_offer.project_id::text = current_setting('test.co_project')
     and v_offer.project_code is not null and v_offer.project_name = 'ضيعة العرض',
    'the list names the offer the client asked for, got ' || coalesce(v_offer.project_name, 'null');
  assert v_offer.offer_trees = 25,
    'the list carries the trees asked for in the offer, got ' || coalesce(v_offer.offer_trees::text, 'null');

  -- Nothing is derived on the way out: the row is what the demand stored (LEAD-02).
  select * into v_src from public.interest_requests r where r.request_no = v_offer.request_no;
  assert (v_offer.request_kind, v_offer.project_id, v_offer.project_code, v_offer.project_name, v_offer.offer_trees)
         is not distinct from
         (v_src.request_kind, v_src.project_id, v_src.project_code, v_src.project_name, v_src.offer_trees),
    'the CRM shows the demand''s own snapshot, unchanged';
  assert v_offer.tree_count_min = v_src.offer_trees,
    'the shared tree columns still agree with the offer columns, so the counter and the filters keep working';

  select * into v_calc from public.crm_search_requests(v_scope, 500)
  where request_no = current_setting('test.co_calc_no');
  assert v_calc.request_kind = 'calculator' and v_calc.project_id is null and v_calc.project_name is null
     and v_calc.offer_trees is null,
    'a slider demand stays a calculator demand with no offer on it, got ' || coalesce(v_calc.request_kind, 'null');
end $$;

-- ---------------------------------------------------------------------------
-- 3 · The new filter parts the two intakes and still counts the whole filtered set
-- ---------------------------------------------------------------------------

do $$
declare
  v_scope jsonb := jsonb_build_object('assigned_to', current_setting('test.co_commercial'));
  v_n     bigint;
  v_row   record;
begin
  select count(*) into v_n from public.crm_search_requests(v_scope, 500);
  assert v_n = 3, 'without the filter the list is unchanged: three demands, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(v_scope || '{"request_kind": "offer"}'::jsonb, 500);
  assert v_n = 1, 'one demand came from an offer, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(v_scope || '{"request_kind": "calculator"}'::jsonb, 500);
  assert v_n = 2, 'two demands came from the calculator, got ' || v_n;

  -- Demands made before 0049 carry the 'calculator' default, so the filter never loses one.
  assert not exists (select 1 from public.crm_search_requests(v_scope, 500) c where c.request_kind is null),
    'every demand says which intake it came from';

  select * into v_row from public.crm_search_requests(v_scope || '{"request_kind": "offer"}'::jsonb, 500) limit 1;
  assert v_row.requests_total = 1 and v_row.persons_total = 1 and v_row.trees_total = 25 and v_row.total_count = 1,
    'the totals follow the filter, got ' || coalesce(v_row.requests_total::text, 'null') || ' / '
    || coalesce(v_row.persons_total::text, 'null') || ' / ' || coalesce(v_row.trees_total::text, 'null');

  -- All three: two people, and the repeat demand is left out of the trees (MIL-01), 5 + 25.
  select * into v_row from public.crm_search_requests(v_scope, 500) limit 1;
  assert v_row.requests_total = 3 and v_row.persons_total = 2 and v_row.trees_total = 30,
    'the untouched totals still read the whole filtered set, got ' || coalesce(v_row.requests_total::text, 'null')
    || ' / ' || coalesce(v_row.persons_total::text, 'null') || ' / ' || coalesce(v_row.trees_total::text, 'null');

  -- One offer, every demand that asked for it (the companion filter).
  select count(*) into v_n
  from public.crm_search_requests(v_scope || jsonb_build_object('project_id', current_setting('test.co_project')), 500);
  assert v_n = 1, 'the offer filter finds the demands of that offer, got ' || v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Every filter, total, ordering and page that was already there answers the same way
-- ---------------------------------------------------------------------------

do $$
declare
  v_scope jsonb := jsonb_build_object('assigned_to', current_setting('test.co_commercial'));
  v_n     bigint;
  v_row   record;
  v_today date := (now() at time zone 'Africa/Tunis')::date;
begin
  select count(*) into v_n
  from public.crm_search_requests(v_scope || jsonb_build_object('q', current_setting('test.co_phone_1')), 500);
  assert v_n = 1, 'the search by phone still finds one demand, got ' || v_n;

  select count(*) into v_n
  from public.crm_search_requests(v_scope || jsonb_build_object('q', current_setting('test.co_calc_no')), 500);
  assert v_n = 1, 'the search by request number still works, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(v_scope || '{"trees_min": "20"}'::jsonb, 500);
  assert v_n = 1, 'the tree range still reads the demand''s own bounds, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(v_scope || '{"trees_max": "10"}'::jsonb, 500);
  assert v_n = 2, 'the upper tree bound still matches two demands, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(v_scope || '{"payment_mode": "cash"}'::jsonb, 500);
  assert v_n = 1, 'the payment mode filter still works, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(v_scope || '{"payment_mode": "installments"}'::jsonb, 500);
  assert v_n = 1, 'the installments filter still works, got ' || v_n;

  -- Absent means «any answer»; true and false keep only the demands that answered that way.
  select count(*) into v_n from public.crm_search_requests(v_scope || '{"wants_visit": "true"}'::jsonb, 500);
  assert v_n = 1, 'the yes answers are still kept apart, got ' || v_n;
  select count(*) into v_n from public.crm_search_requests(v_scope || '{"wants_visit": "false"}'::jsonb, 500);
  assert v_n = 1, 'the no answers are still kept apart, got ' || v_n;

  select count(*) into v_n from public.crm_search_requests(v_scope || '{"duplicates_only": "true"}'::jsonb, 500);
  assert v_n = 1, 'the duplicates filter still works, got ' || v_n;

  select count(*) into v_n
  from public.crm_search_requests(v_scope || jsonb_build_object('from', (v_today - 1)::text, 'to', v_today::text), 500);
  assert v_n = 3, 'the Africa/Tunis date range still holds the three demands, got ' || v_n;

  -- The new filter next to an old one
  select count(*) into v_n
  from public.crm_search_requests(v_scope || '{"request_kind": "calculator", "wants_visit": "true"}'::jsonb, 500);
  assert v_n = 1, 'the intake filter narrows alongside the others, got ' || v_n;

  -- §47 people mode: one row per person, their latest demand, and the totals still cover every demand
  select count(*) into v_n from public.crm_search_requests(v_scope || '{"people": "true"}'::jsonb, 500);
  assert v_n = 2, 'the people mode still lists one row per person, got ' || v_n;
  select * into v_row from public.crm_search_requests(v_scope || '{"people": "true"}'::jsonb, 500) limit 1;
  assert v_row.total_count = 2 and v_row.requests_total = 3 and v_row.persons_total = 2,
    'in people mode total_count counts the people being paged and the totals still count the demands';
  assert exists (select 1 from public.crm_search_requests(v_scope || '{"people": "true"}'::jsonb, 500) c
                 where c.request_no = current_setting('test.co_offer_no')),
    'the person''s latest demand is the offer one, so the people mode shows it';

  -- Ordering: newest first, and the page limit does not change the totals
  select * into v_row from public.crm_search_requests(v_scope, 1, 0);
  assert v_row.request_no = current_setting('test.co_offer_no'),
    'the newest demand still comes first, got ' || coalesce(v_row.request_no, 'null');
  assert v_row.total_count = 3, 'a one-row page still reports the whole filtered set, got ' || v_row.total_count;

  select count(*) into v_n from public.crm_search_requests(v_scope, 1, 0);
  assert v_n = 1, 'the page limit is still honoured, got ' || v_n;
  select count(*) into v_n from public.crm_search_requests(v_scope, 500, 2);
  assert v_n = 1, 'the offset is still honoured, got ' || v_n;

  -- The unassigned filter still means «nobody», and these files have a commercial
  select count(*) into v_n from public.crm_search_requests('{"assigned_to": "none"}'::jsonb, 500)
  where request_no in (current_setting('test.co_offer_no'), current_setting('test.co_calc_no'));
  assert v_n = 0, 'assigned files are still left out of «no commercial», got ' || v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 5 · RLS still scopes the list to the files the caller may see (app.can_see_person)
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.co_commercial'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_n bigint;
begin
  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('assigned_to', current_setting('test.co_commercial')), 500);
  assert v_n = 3, 'the commercial still reads the files assigned to them, got ' || v_n;
end $$;

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.co_other'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_n bigint;
begin
  select count(*) into v_n
  from public.crm_search_requests(jsonb_build_object('assigned_to', current_setting('test.co_commercial')), 500);
  assert v_n = 0, 'a commercial still reads nothing of another one''s files, got ' || v_n;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 6 · Nobody gained anything: the same grants, the same security posture
-- ---------------------------------------------------------------------------

do $$
begin
  assert not has_function_privilege('anon', 'public.crm_search_requests(jsonb, integer, integer)', 'execute'),
    'visitors still cannot run the CRM search';
  assert has_function_privilege('authenticated', 'public.crm_search_requests(jsonb, integer, integer)', 'execute'),
    'signed-in staff still can';
  assert not has_table_privilege('anon', 'public.crm_requests', 'select'), 'visitors still cannot read the CRM view';
  assert has_table_privilege('authenticated', 'public.crm_requests', 'select'),
    'the search reads the view as the caller, so signed-in staff must keep select on it';

  -- Security invoker: the caller's RLS decides. Stable: the search writes nothing, so it still logs no audit row
  -- (the CSV export logs crm.export from the server, as before).
  assert (select not p.prosecdef and p.provolatile = 's'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'crm_search_requests'),
    'crm_search_requests is still a stable security invoker function';
  assert (select bool_or(o ~ '^security_invoker=(on|true)$')
          from pg_class c, unnest(c.reloptions) o
          where c.oid = 'public.crm_requests'::regclass),
    'crm_requests keeps security_invoker, so RLS scopes it to the caller';
end $$;
