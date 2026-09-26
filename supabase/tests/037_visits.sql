-- الزيارات الميدانية (report v3 §25). Migration supabase/pending/bb_21_visits.sql.
--
-- THIS FILE IS RED UNTIL THAT DRAFT IS APPLIED, and that is not a bug in it: `npm run db:test` runs every file
-- against the live schema, public.visits does not exist there yet, and the first statement that names it fails
-- with «relation "public.visits" does not exist». Check the two together instead, in one rolled-back
-- transaction, which is how this file was written:
--
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_21_visits.sql supabase/tests/037_visits.sql
--
-- When the owner applies the draft, this file goes green on its own and the command above stops being needed.
-- (If some OTHER file is red, read its message first: supabase/pending/bb_03_parcel_layer_retires.sql is
-- documented to turn ten of them red, 034 among them, and none of that is this module's doing.)
--
-- WHAT IT PINS, IN ORDER. Permissions first — anon reads and calls nothing, a signed-in user with no role is
-- refused, an agricultural manager is refused because they read no client file, and a commercial is held to
-- their own files. Then the flag: the visitor's door is shut while `visits` is disabled and opens when it is
-- not, while the Back Office keeps working either way, which is the whole reason the two gates are different.
-- Then the rules — every delay, ceiling and list read from settings and never from SQL — then the five statuses
-- of §25 and the moves between them, then the board and the demand that has been waiting for a visit since the
-- day someone ticked «نحب نزور الأرض» and nothing happened.
--
-- Every fixture is created inside the transaction with unused codes and unused phone numbers, and every count is
-- scoped to those fixtures, so live traffic can neither hide a failure nor cause one.

-- Said once, in the runner's own output, so a red line in `npm run db:test` explains itself instead of
-- reading like a broken test.
do $$
begin
  if to_regclass('public.visits') is null then
    raise exception 'supabase/pending/bb_21_visits.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_21_visits.sql supabase/tests/037_visits.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.vi_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- For a refusal that may come from the GRANT (no EXECUTE at all) or from the role check inside the function:
-- both are 42501, and from the caller's side both mean «not for you».
create function pg_temp.vi_denied(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected a permission denial but the call succeeded: %', p_sql;
exception when insufficient_privilege then
  return;
end $$;

-- Unused phone numbers: this file takes real intakes, and an intake is throttled per phone (LEAD-06).
do $$
declare
  v_used  text[] := '{}';
  v_phone text;
  i       integer;
begin
  for i in 1..6 loop
    loop
      v_phone := '+21696' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.vi_phone_' || i, v_phone, true);
  end loop;
end $$;

-- An offer request with everything valid, as test 034 builds it.
create function pg_temp.vi_payload(p_project text, p_phone text, p_visit boolean) returns jsonb
language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف الزيارة',
    'phone_e164', p_phone,
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', p_project,
    'trees', '3',
    'wants_visit', p_visit)
$$;

select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures: the configuration this file measures, two offers, five accounts, four demands
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin   uuid := gen_random_uuid();
  v_com_a   uuid := gen_random_uuid();
  v_com_b   uuid := gen_random_uuid();
  v_agri    uuid := gen_random_uuid();
  v_plain   uuid := gen_random_uuid();
  v_class   uuid;
  v_id      uuid;
  v_code    text;
  v_result  jsonb;
  v_request public.interest_requests;
begin
  -- Pinned here, so the file measures its own inputs and never the live configuration. `visits` is deliberately
  -- NOT pinned: it starts as the owner left it, disabled, because section 2 is about exactly that.
  update public.feature_flags set state = 'public' where key in ('projects', 'pricing');
  update public.settings set value = to_jsonb(1)  where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb(3)  where key = 'antispam.max_requests_per_phone_per_day';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(1)  where key = 'visits.min_lead_days';
  update public.settings set value = to_jsonb(30) where key = 'visits.max_ahead_days';
  update public.settings set value = to_jsonb(4)  where key = 'visits.max_people';
  update public.settings set value = '[]'::jsonb  where key = 'visits.closed_weekdays';
  update public.settings set value = to_jsonb(''::text) where key = 'visits.meeting_point_default';

  -- Five callers, one per line the module draws.
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'vis-admin-' || v_admin || '@test.local', '{"full_name":"Admin Ziara"}'),
    (v_com_a, 'authenticated', 'authenticated', 'vis-coma-'  || v_com_a || '@test.local', '{"full_name":"Commercial A"}'),
    (v_com_b, 'authenticated', 'authenticated', 'vis-comb-'  || v_com_b || '@test.local', '{"full_name":"Commercial B"}'),
    (v_agri,  'authenticated', 'authenticated', 'vis-agri-'  || v_agri  || '@test.local', '{"full_name":"Masoul Falahi"}'),
    (v_plain, 'authenticated', 'authenticated', 'vis-plain-' || v_plain || '@test.local', '{"full_name":"Bla Dawr"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_com_a, 'commercial'), (v_com_b, 'commercial'), (v_agri, 'agri_manager');
  perform set_config('test.vi_admin', v_admin::text, true);
  perform set_config('test.vi_com_a', v_com_a::text, true);
  perform set_config('test.vi_com_b', v_com_b::text, true);
  perform set_config('test.vi_agri', v_agri::text, true);
  perform set_config('test.vi_plain', v_plain::text, true);

  select c.id into v_class from public.tree_spacing_classes c where c.is_active order by c.sort_order limit 1;

  -- Offer A carries its own meeting point; offer B has none and falls back to the setting.
  v_code := 'VIS-A-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count, visit_meeting_point)
  values (v_code, 'عرض الزيارة أ', 34, 'published', 10, 'قدّام جامع أولاد سالم') returning id into v_id;
  perform set_config('test.vi_a', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);

  v_code := 'VIS-B-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_code, 'عرض الزيارة ب', 34, 'published', 10) returning id into v_id;
  perform set_config('test.vi_b', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);

  -- The available time the client picks (§25). It is a list row, not a free time input.
  select o.id into v_id from public.option_items o
  where o.list_key = 'visit_slot' and o.is_active order by o.sort_order limit 1;
  perform set_config('test.vi_slot', v_id::text, true);

  -- R1 · a demand on offer A that asked for a visit → its person becomes commercial A's file.
  v_result := public.submit_offer_request(
    pg_temp.vi_payload(current_setting('test.vi_a'), current_setting('test.vi_phone_1'), true));
  select * into v_request from public.interest_requests r where r.request_no = v_result->>'request_no';
  perform set_config('test.vi_r1', v_request.id::text, true);
  perform set_config('test.vi_p1', v_request.person_id::text, true);
  update public.persons set assigned_to = v_com_a where id = v_request.person_id;

  -- R2 · a demand on offer B that asked for a visit → commercial B's file.
  v_result := public.submit_offer_request(
    pg_temp.vi_payload(current_setting('test.vi_b'), current_setting('test.vi_phone_2'), true));
  select * into v_request from public.interest_requests r where r.request_no = v_result->>'request_no';
  perform set_config('test.vi_r2', v_request.id::text, true);
  perform set_config('test.vi_p2', v_request.person_id::text, true);
  update public.persons set assigned_to = v_com_b where id = v_request.person_id;

  -- R3 · a demand that did NOT ask for a visit, in commercial A's file: it must never appear in the worklist.
  v_result := public.submit_offer_request(
    pg_temp.vi_payload(current_setting('test.vi_a'), current_setting('test.vi_phone_3'), false));
  select * into v_request from public.interest_requests r where r.request_no = v_result->>'request_no';
  perform set_config('test.vi_r3', v_request.id::text, true);
  perform set_config('test.vi_p3', v_request.person_id::text, true);
  update public.persons set assigned_to = v_com_a where id = v_request.person_id;

  -- R4 · the case that is 22 of the 25 live wishes: «نحب نزور الأرض» on a demand that names no offer. Copied
  -- from R1 so every not-null column is a real one, then emptied of its offer and moved to P3 — whose only
  -- other demand asked for no visit, so this person has a wish and no visit at all.
  select * into v_request from public.interest_requests r where r.id = current_setting('test.vi_r1')::uuid;
  v_request.person_id := current_setting('test.vi_p3')::uuid;
  v_request.id := gen_random_uuid();
  v_request.request_no := 'VIS-CALC-' || substr(v_request.id::text, 1, 8);
  v_request.request_kind := 'calculator';
  -- interest_requests_goal_check (0049): the calculator always asks a goal and an offer never does.
  select o.id, o.label_ar into v_request.goal_option_id, v_request.goal_label_ar
  from public.option_items o where o.list_key = 'goal' and o.is_active order by o.sort_order limit 1;
  v_request.project_id := null;
  v_request.project_code := null;
  v_request.project_name := null;
  v_request.wants_visit := true;
  v_request.created_at := now();
  insert into public.interest_requests select (v_request).*;
  perform set_config('test.vi_r4', v_request.id::text, true);

  -- Dates are read in Africa/Tunis and computed in the database (app.tunis_today), never in TypeScript. They are
  -- resolved here, while this block still runs as the owner, because the app schema is closed to authenticated.
  perform set_config('test.vi_today', app.tunis_today()::text, true);
  perform set_config('test.vi_ok', (app.tunis_today() + 3)::text, true);
  perform set_config('test.vi_ok2', (app.tunis_today() + 5)::text, true);
  perform set_config('test.vi_far', (app.tunis_today() + 60)::text, true);
  perform set_config('test.vi_past', (app.tunis_today() - 1)::text, true);
  perform set_config('test.vi_ok_dow', extract(isodow from app.tunis_today() + 3)::integer::text, true);
  -- Read back from settings here, where the app schema is reachable, so the assertions later compare the
  -- payload against the CONFIGURED value and never against a number typed into this file.
  perform set_config('test.vi_max_people', app.setting_int('visits.max_people', 0)::text, true);
  perform set_config('test.vi_lead_days', app.setting_int('visits.min_lead_days', 0)::text, true);
  perform set_config('test.vi_label_confirmed', app.setting_text('visits.status_confirmed', ''), true);
  -- The client pipeline of §27 is a field the team curates by hand. Counted before the module touches anything,
  -- so section 7 can prove the number did not move.
  perform set_config('test.vi_hist',
    (select count(*)::text from public.person_status_history h
     where h.person_id = current_setting('test.vi_p1')::uuid), true);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · Permissions first: a visitor, a signed-in stranger, the stock keeper, and one commercial's own files
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

do $$
begin
  -- A visitor reads no visit: not the table (it carries a client's name, phone and appointment), and not one
  -- of the Back Office functions.
  perform pg_temp.vi_denied('select 1 from public.visits');
  perform pg_temp.vi_denied('select public.staff_visit_board(''{}''::jsonb)');
  perform pg_temp.vi_denied(format('select public.staff_person_visits(%L::uuid)', current_setting('test.vi_p1')));
  perform pg_temp.vi_denied('select public.staff_book_visit(''{}''::jsonb, null)');
  perform pg_temp.vi_denied(format('select public.staff_set_visit_status(%L::uuid, ''confirmed'')', gen_random_uuid()));
  perform pg_temp.vi_denied(format('select public.staff_update_visit(%L::uuid, ''{}''::jsonb)', gen_random_uuid()));
  -- The client's own door is a service-role door, like every public intake: the browser never reaches it.
  perform pg_temp.vi_denied('select public.submit_visit_request(''{}''::jsonb)');
end $$;

reset role;

-- A signed-in user with no role at all is not staff.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.vi_plain'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.vi_expect('select public.staff_visit_board(''{}''::jsonb)', 'forbidden');
  perform pg_temp.vi_expect(
    format('select public.staff_person_visits(%L::uuid)', current_setting('test.vi_p1')), 'forbidden');
  perform pg_temp.vi_expect(
    format('select public.staff_book_visit(jsonb_build_object(''person_id'', %L, ''project_id'', %L, ''visit_date'', %L, ''slot_option_id'', %L, ''people_count'', 2))',
           current_setting('test.vi_p1'), current_setting('test.vi_a'),
           current_setting('test.vi_ok'), current_setting('test.vi_slot')), 'forbidden');
  assert not exists (select 1 from public.visits), 'and they read no visit row either';
end $$;

reset role;

-- The agricultural manager keeps stock and reads no client file (app.can_see_person): they are staff, so the
-- board opens, and they may not book a visit for anybody.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.vi_agri'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.staff_visit_board('{}'::jsonb);
begin
  assert v is not null, 'the agricultural manager is staff, so the board answers';
  assert jsonb_array_length(v->'waiting') = 0,
    'but no client file is theirs, so no waiting demand is either, got ' || (v->'waiting')::text;
  perform pg_temp.vi_expect(
    format('select public.staff_book_visit(jsonb_build_object(''person_id'', %L, ''project_id'', %L, ''visit_date'', %L, ''slot_option_id'', %L, ''people_count'', 2))',
           current_setting('test.vi_p1'), current_setting('test.vi_a'),
           current_setting('test.vi_ok'), current_setting('test.vi_slot')), 'forbidden');
  perform pg_temp.vi_expect(
    format('select public.staff_person_visits(%L::uuid)', current_setting('test.vi_p1')), 'forbidden');
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 2 · The flag closes the visitor's door and leaves the Back Office open
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
begin
  -- This block used to OPEN by asserting that `visits` was live-state 'disabled', on the reasoning that
  -- applying the migration must leave the module off for the owner to switch on himself. That reasoning is
  -- right about the migration and wrong about this test. The flag belongs to the owner from the moment the
  -- migration lands: he set `visits` to 'public' on 2026-09-21, which is exactly what the product is for, and
  -- the suite went red on a correct state. A test that fails when the owner uses the product is not testing
  -- the product.
  --
  -- So the door is SET shut here and SET open below, the way every other flag in this file is already handled
  -- twelve lines down. What the migration ships is a property of the migration and is asserted where it can
  -- mean something — at apply time — not against a live database months later.
  --
  -- Nothing here escapes: scripts/db-test.mjs wraps the whole run in begin/rollback, so the owner's own flag
  -- state is untouched by this file. Verified before changing it, because a test that quietly turned his
  -- module off would be a far worse bug than the one it was fixing.
  update public.feature_flags set state = 'disabled' where key = 'visits';

  -- Shut: a visitor cannot ask for a visit, whatever else is valid about the request.
  perform pg_temp.vi_expect(
    format('select public.submit_visit_request(jsonb_build_object(''request_id'', %L, ''visit_date'', %L, ''slot_option_id'', %L, ''people_count'', 2))',
           current_setting('test.vi_r1'), current_setting('test.vi_ok'), current_setting('test.vi_slot')),
    'visits_disabled');

  -- Open: the same call goes through, and the visit opens as «Requested» with the client as its source.
  update public.feature_flags set state = 'public' where key = 'visits';
  v := public.submit_visit_request(jsonb_build_object(
         'request_id', current_setting('test.vi_r1'),
         'visit_date', current_setting('test.vi_ok'),
         'slot_option_id', current_setting('test.vi_slot'),
         'people_count', 2));
  assert v->>'status' = 'requested' and v->>'visit_no' <> '',
    'a visitor''s request opens at «Requested» with its own number, got ' || v::text;
  assert (select count(*) from public.visits x
          where x.request_id = current_setting('test.vi_r1')::uuid and x.source = 'client') = 1,
    'and it is recorded as the client''s own, not the team''s';
  -- The meeting point is copied from the offer but never handed back: a meeting point is agreed, not announced.
  assert not (v ? 'meeting_point'), 'the visitor is not told where to meet before the team confirms';
  assert (select x.meeting_point from public.visits x where x.request_id = current_setting('test.vi_r1')::uuid)
         = 'قدّام جامع أولاد سالم',
    'while the Back Office sees the offer''s own meeting point on the row';

  -- A demand that names no offer cannot become a visit on its own (decision 1 of the migration).
  perform pg_temp.vi_expect(
    format('select public.submit_visit_request(jsonb_build_object(''request_id'', %L, ''visit_date'', %L, ''slot_option_id'', %L, ''people_count'', 2))',
           current_setting('test.vi_r4'), current_setting('test.vi_ok2'), current_setting('test.vi_slot')),
    'visit_offer_required');

  -- Back to how the owner left it, and the Back Office is unaffected by any of it.
  update public.feature_flags set state = 'disabled' where key = 'visits';
  delete from public.visits where request_id = current_setting('test.vi_r1')::uuid;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.vi_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- The whole point of the two different gates: with `visits` disabled the team still prepares the module.
  v := public.staff_visit_board('{}'::jsonb);
  assert v is not null, 'a disabled module does not close the Back Office screen';
  v := public.staff_book_visit(jsonb_build_object(
         'person_id', current_setting('test.vi_p1'), 'project_id', current_setting('test.vi_a'),
         'request_id', current_setting('test.vi_r1'),
         'visit_date', current_setting('test.vi_ok'), 'slot_option_id', current_setting('test.vi_slot'),
         'people_count', 2, 'contact_channel', 'phone'));
  assert v->>'status' = 'requested', 'and a commercial can book while it is off, got ' || v::text;
  perform set_config('test.vi_v1', v->>'id', true);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3 · Every delay, ceiling and list comes from settings — none of them from SQL
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.vi_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_book text := format(
    'select public.staff_book_visit(jsonb_build_object(''person_id'', %L, ''project_id'', %L, ''visit_date'', %%L, ''slot_option_id'', %%L, ''people_count'', %%s))',
    current_setting('test.vi_p1'), current_setting('test.vi_a'));
begin
  perform pg_temp.vi_expect(format(v_book, current_setting('test.vi_past'), current_setting('test.vi_slot'), 2),
                            'visit_date_in_past');
  perform pg_temp.vi_expect(format(v_book, current_setting('test.vi_today'), current_setting('test.vi_slot'), 2),
                            'visit_date_too_soon');
  perform pg_temp.vi_expect(format(v_book, current_setting('test.vi_far'), current_setting('test.vi_slot'), 2),
                            'visit_date_too_far');
  perform pg_temp.vi_expect(format(v_book, current_setting('test.vi_ok'), current_setting('test.vi_slot'), 9),
                            'invalid_visit_people');
  perform pg_temp.vi_expect(format(v_book, current_setting('test.vi_ok'), current_setting('test.vi_slot'), 0),
                            'invalid_visit_people');
  perform pg_temp.vi_expect(format(v_book, current_setting('test.vi_ok'), gen_random_uuid(), 2),
                            'invalid_visit_slot');
  perform set_config('test.vi_book_sql', v_book, true);
end $$;

reset role;

-- The proof that none of the three numbers is written in the code: move the setting, and the same call changes
-- its answer. A ceiling of 2 refuses three people; a ceiling of 4 accepts them.
update public.settings set value = to_jsonb(2) where key = 'visits.max_people';
set local role authenticated;
do $$
begin
  perform pg_temp.vi_expect(format(current_setting('test.vi_book_sql'),
                                   current_setting('test.vi_ok2'), current_setting('test.vi_slot'), 3),
                            'invalid_visit_people');
end $$;
reset role;

update public.settings set value = to_jsonb(4) where key = 'visits.max_people';
-- And the closed day is a list the owner writes, not a weekday someone hard-coded.
update public.settings set value = jsonb_build_array(current_setting('test.vi_ok_dow')::integer)
where key = 'visits.closed_weekdays';

set local role authenticated;
do $$
begin
  perform pg_temp.vi_expect(format(current_setting('test.vi_book_sql'),
                                   current_setting('test.vi_ok'), current_setting('test.vi_slot'), 3),
                            'visit_day_closed');
end $$;
reset role;

update public.settings set value = '[]'::jsonb where key = 'visits.closed_weekdays';

-- ---------------------------------------------------------------------------
-- 4 · The five statuses of §25, and the only moves between them
-- ---------------------------------------------------------------------------

do $$
begin
  assert (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.visit_status'::regtype)
         = array['requested', 'confirmed', 'completed', 'no_show', 'cancelled'],
    'the five statuses are the ones §25 names, in its order';
  -- Their Arabic is editable, so no screen ever writes it in a .tsx file.
  assert (select count(*) from public.settings s
          where s.key in ('visits.status_requested', 'visits.status_confirmed', 'visits.status_completed',
                          'visits.status_no_show', 'visits.status_cancelled')
            and s.label_ar <> '') = 5,
    'and each one''s Arabic word is a setting the Back Office can edit';
end $$;

set local role authenticated;

do $$
declare
  v      jsonb;
  v_id   uuid := current_setting('test.vi_v1')::uuid;
  v_cancel uuid;
begin
  -- A visit is opened, never concluded: booking straight into a terminal status is refused.
  perform pg_temp.vi_expect(format(
    'select public.staff_book_visit(jsonb_build_object(''person_id'', %L, ''project_id'', %L, ''visit_date'', %L, ''slot_option_id'', %L, ''people_count'', 2, ''status'', ''completed''))',
    current_setting('test.vi_p1'), current_setting('test.vi_a'),
    current_setting('test.vi_ok2'), current_setting('test.vi_slot')), 'invalid_visit_status');

  -- Requested → completed skips the appointment nobody agreed to.
  perform pg_temp.vi_expect(
    format('select public.staff_set_visit_status(%L::uuid, ''completed'')', v_id), 'invalid_visit_transition');

  v := public.staff_set_visit_status(v_id, 'confirmed',
         jsonb_build_object('assigned_to', current_setting('test.vi_com_a')));
  assert v->>'status' = 'confirmed' and v->'assigned'->>'id' = current_setting('test.vi_com_a'),
    'confirming names the commercial who will be there, got ' || v::text;
  assert v->>'status_label' = current_setting('test.vi_label_confirmed'),
    'and the payload carries the Arabic word from settings, never a word from the code';

  -- Completed carries what came out of the visit (cahier v2 §30).
  v := public.staff_set_visit_status(v_id, 'completed', jsonb_build_object(
         'outcome_liked', true,
         'outcome_project_id', current_setting('test.vi_a'),
         'outcome_next_step', 'يحجز 10 زيتونات'));
  assert v->>'status' = 'completed'
     and (v->'outcome'->>'liked')::boolean
     and v->'outcome'->>'project_id' = current_setting('test.vi_a')
     and v->'outcome'->>'next_step' = 'يحجز 10 زيتونات',
    'a completed visit says whether the client liked it, which offer and what happens next, got ' || v::text;

  -- And then it is a fact about a day that passed: nothing moves it, and nothing reschedules it.
  perform pg_temp.vi_expect(
    format('select public.staff_set_visit_status(%L::uuid, ''cancelled'')', v_id), 'invalid_visit_transition');
  perform pg_temp.vi_expect(
    format('select public.staff_update_visit(%L::uuid, jsonb_build_object(''people_count'', 3))', v_id),
    'visit_not_open');

  -- «ما حضرش» belongs to an appointment that was agreed: a merely requested visit is cancelled instead.
  v := public.staff_book_visit(jsonb_build_object(
         'person_id', current_setting('test.vi_p1'), 'project_id', current_setting('test.vi_a'),
         'visit_date', current_setting('test.vi_ok2'), 'slot_option_id', current_setting('test.vi_slot'),
         'people_count', 1));
  v_cancel := (v->>'id')::uuid;
  perform pg_temp.vi_expect(
    format('select public.staff_set_visit_status(%L::uuid, ''no_show'')', v_cancel), 'invalid_visit_transition');
  v := public.staff_set_visit_status(v_cancel, 'cancelled', jsonb_build_object('cancel_reason', 'الحريف أجّل'));
  assert v->>'status' = 'cancelled' and v->>'cancel_reason' = 'الحريف أجّل',
    'cancelling keeps the reason it was cancelled for, got ' || v::text;
  -- jsonb_build_object keeps the key with a JSON null in it, so this is «->>» and not «is null» on the jsonb.
  assert v->>'outcome' is null, 'and a visit that did not happen carries no outcome';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5 · One commercial's board is their own files, and the waiting demands are the open loop
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.vi_com_b'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.staff_visit_board(jsonb_build_object('limit', 500));
  v_ids text[] := (select coalesce(array_agg(w->>'request_id'), '{}')
                   from jsonb_array_elements(v->'waiting') w);
begin
  -- Commercial B holds P2 and nothing else: P1's and P3's visits and wishes are not theirs to see.
  assert current_setting('test.vi_r2') = any (v_ids),
    'commercial B sees their own client''s visit wish';
  assert not (current_setting('test.vi_r1') = any (v_ids))
     and not (current_setting('test.vi_r4') = any (v_ids)),
    'and never another commercial''s';
  assert (v->'days')::text not like '%' || current_setting('test.vi_p1') || '%',
    'nor their visits';
  perform pg_temp.vi_expect(
    format('select public.staff_person_visits(%L::uuid)', current_setting('test.vi_p1')), 'forbidden');
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.vi_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v        jsonb := public.staff_visit_board(jsonb_build_object('limit', 500));
  v_ids    text[];
  v_person jsonb;
begin
  v_ids := (select coalesce(array_agg(w->>'request_id'), '{}') from jsonb_array_elements(v->'waiting') w);

  -- THE OPEN LOOP THIS MODULE CLOSES: a demand that ticked «نحب نزور الأرض» and has no visit is on the worklist,
  -- whether or not it names an offer — and a demand that never asked for one is not.
  assert current_setting('test.vi_r2') = any (v_ids) and current_setting('test.vi_r4') = any (v_ids),
    'every unanswered visit wish is on the board';
  assert not (current_setting('test.vi_r3') = any (v_ids)),
    'and a demand that asked for no visit never is';
  -- P1 has a visit now, so their wish is answered and leaves the list. This is the whole point of the loop.
  assert not (current_setting('test.vi_r1') = any (v_ids)),
    'a wish with a visit behind it leaves the worklist';
  -- The live database is in this list too, and that is the point: on the day this was written 25 of the 36
  -- demands carried the wish and not one had a visit behind it.
  assert array_length(v_ids, 1) >= 3, 'the worklist is not empty while people are waiting';

  -- The offer-less wish says so, instead of pretending to name land: the commercial picks the offer when booking.
  assert (select bool_and((w->>'project_id') is null)
          from jsonb_array_elements(v->'waiting') w
          where w->>'request_id' = current_setting('test.vi_r4')),
    'the 22-out-of-25 case — a visit wish with no offer — is shown as exactly that';

  -- The board is grouped by day and counted by status, in SQL: the page groups nothing and counts nothing.
  assert jsonb_typeof(v->'days') = 'array' and jsonb_array_length(v->'days') >= 1,
    'the calendar arrives grouped by day, got ' || (v->'days')::text;
  assert (select bool_and(jsonb_typeof(d->'visits') = 'array') from jsonb_array_elements(v->'days') d),
    'and every day carries its own visits';
  assert (v->'counts'->>'total')::integer >= 2 and (v->'counts'->>'completed')::integer >= 1,
    'with the counts per status beside them, got ' || (v->'counts')::text;
  assert (v->'terms'->>'max_people')::integer = current_setting('test.vi_max_people')::integer
     and (v->'terms'->>'min_date')::date
         = current_setting('test.vi_today')::date + current_setting('test.vi_lead_days')::integer,
    'and the booking rules the form obeys, resolved here and not in the page, got ' || (v->'terms')::text;
  assert jsonb_array_length(v->'statuses') = 5, 'and the five status words, from settings';

  -- What the staff needs before driving: the client, the phone, the offer and where the land is.
  v_person := (select d->'visits'->0 from jsonb_array_elements(v->'days') d limit 1);
  assert v_person->'person'->>'phone_e164' is not null
     and v_person->'offer'->>'code' is not null
     and v_person ? 'meeting_point',
    'a row carries the phone, the offer and the meeting point, got ' || coalesce(v_person::text, 'null');

  -- The client file's own reader, for the card that hangs under the held trees.
  v := public.staff_person_visits(current_setting('test.vi_p1')::uuid);
  assert jsonb_array_length(v->'visits') = 2, 'the file shows this person''s visits, got ' || (v->'visits')::text;
  assert (v->'offers')::text like '%' || current_setting('test.vi_a') || '%',
    'and the offers a visit can be booked on, got ' || (v->'offers')::text;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 6 · What was agreed stays agreed: snapshots, and one audit story
-- ---------------------------------------------------------------------------

update public.option_items set label_ar = 'توقيت تبدّل بعد الحجز'
where id = current_setting('test.vi_slot')::uuid;
update public.projects set visit_meeting_point = 'بلاصة أخرى'
where id = current_setting('test.vi_a')::uuid;

do $$
declare
  v_visit public.visits;
begin
  select * into v_visit from public.visits x where x.id = current_setting('test.vi_v1')::uuid;
  assert v_visit.slot_label_ar <> 'توقيت تبدّل بعد الحجز',
    'renaming the slot later never rewrites the appointment a client was given, got ' || v_visit.slot_label_ar;
  assert v_visit.meeting_point = 'قدّام جامع أولاد سالم',
    'and neither does moving the offer''s meeting point, got ' || coalesce(v_visit.meeting_point, 'null');

  -- One story, written by the row trigger: the booking, the confirmation and the completion are all in the log.
  assert (select count(*) from public.audit_logs a
          where a.entity = 'visits' and a.entity_id = current_setting('test.vi_v1')) >= 3,
    'every move of a visit is in the audit log, got '
    || (select count(*)::text from public.audit_logs a
        where a.entity = 'visits' and a.entity_id = current_setting('test.vi_v1'));
  assert exists (select 1 from public.audit_logs a
                 where a.entity = 'visits' and a.entity_id = current_setting('test.vi_v1')
                   and a.action = 'insert' and a.actor_id = current_setting('test.vi_admin')::uuid),
    'and it says who booked it';
end $$;

-- ---------------------------------------------------------------------------
-- 7 · The configuration this module promised the owner
-- ---------------------------------------------------------------------------

do $$
declare
  v_key text;
begin
  foreach v_key in array array['visits.min_lead_days', 'visits.max_ahead_days', 'visits.max_people',
                               'visits.closed_weekdays', 'visits.meeting_point_default',
                               'visits.expiry_reminders_days', 'visit_no.prefix',
                               'antispam.max_visits_per_ip_per_day'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.label_ar <> ''),
      'the Back Office can edit ' || v_key;
  end loop;
  -- The RULES stay off the public payload: how far ahead a visit may be booked is an internal rule, not site
  -- copy. The five `visits.status_*` WORDS are not a rule and became public in 0107, because فضاء «زيتونتي»
  -- is a public page and a private label meant the buyer's screen printed a TypeScript copy of «ما حضرش»
  -- instead of whatever the owner had renamed it to. A state's Arabic name is not a threshold.
  assert (select bool_and(not s.is_public) from public.settings s
          where s.group_key = 'visits' and s.key not like 'visits.status\_%'),
    'the visit RULES stay off the public configuration payload — only the status words may be public';

  -- «التوقيت المتوفر» is a list AgriZed decides, with its hours, exactly like the contact_time list.
  assert exists (select 1 from public.option_lists l where l.key = 'visit_slot' and l.value_kind = 'time_range'),
    'the available times are an option list, so a visitor can never book 03:00';
  assert (select count(*) from public.option_items o where o.list_key = 'visit_slot' and o.is_active) >= 1,
    'and it has at least one time to offer';
  assert (select bool_and(o.time_from is not null and o.time_to is not null)
          from public.option_items o where o.list_key = 'visit_slot'),
    'each slot states its hours';

  -- The meeting point is per offer, because it is a place on that land.
  assert exists (select 1 from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = 'projects'
                   and c.column_name = 'visit_meeting_point'),
    'the meeting point lives on the offer';

  -- Two templates, as rows, so the copy is editable — and no worker sends them yet (see the migration's §11).
  assert (select count(*) from public.message_templates t
          where t.key in ('visit.confirmed', 'visit.reminder')) = 2,
    'the two visit messages are database rows, not strings in the code';

  -- This module touches no other module's inventory.
  assert not exists (select 1 from pg_constraint c
                     where c.conrelid = 'public.visits'::regclass and c.contype = 'f'
                       and c.confrelid in ('public.trees'::regclass, 'public.parcels'::regclass)),
    'a visit points at a person, an offer and a demand — never at a tree or a parcel';
  -- §27's client pipeline stays a human act: nothing here moves a person's status.
  assert (select count(*) from public.person_status_history h
          where h.person_id = current_setting('test.vi_p1')::uuid) = current_setting('test.vi_hist')::integer,
    'booking, confirming and completing a visit never moves the client''s status by itself';
end $$;
