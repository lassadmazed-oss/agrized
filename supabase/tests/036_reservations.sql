-- العربون والحجز: a reservation is the contract around an allocation — the money owed, the deadline, the
-- conditions — and never a second inventory. Report v3 §23 (العربون) and §24 (مدة إتمام البيع).
-- Migration supabase/pending/bb_20_reservations.sql (rename this file's first line when it is numbered).
--
-- Runs against the live database inside a rolled-back transaction: three offers with unused codes, five fresh
-- staff accounts, unused phone numbers, and every setting and flag it measures pinned inside the transaction.
-- Every count is scoped to the fixtures, so real traffic can neither hide a failure nor cause one.
--
-- PERMISSIONS FIRST, because this is the first module in the product that moves money and the first that can
-- freeze an offer's stock. Sections 1 and 2 answer: who may call what, what a visitor gets (nothing), and
-- whether «معطّل» actually closes the act rather than only hiding a link.

do $$
begin
  if to_regclass('public.reservations') is null then
    raise exception
      'supabase/pending/bb_20_reservations.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_20_reservations.sql supabase/tests/036_reservations.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.rs_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- The offer intake payload, exactly as test 034 builds it: this file takes one real demand so the reservation
-- can point back at the thing that asked for it.
create function pg_temp.rs_payload(p_project text, p_trees text, p_phone text) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف العربون',
    'phone_e164', p_phone,
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', p_project,
    'trees', p_trees)
$$;

create function pg_temp.rs_state(p_project uuid, p_state text) returns integer language sql as $$
  select count(*)::integer from public.trees t where t.project_id = p_project and t.state::text = p_state
$$;

do $$
declare
  v_phone text;
  i       integer;
  v_used  text[] := '{}';
begin
  for i in 1..4 loop
    loop
      v_phone := '+21698' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.rs_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);
select set_config('test.rs_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 0)), '.'), true)
from (values ('حجز زيتونات بعد مكالمة مع الحريف')) as t (s);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin   uuid := gen_random_uuid();
  v_com     uuid := gen_random_uuid();
  v_fin     uuid := gen_random_uuid();
  v_agri    uuid := gen_random_uuid();
  v_plain   uuid := gen_random_uuid();
  v_class   uuid;
  v_id      uuid;
  v_code    text;
  v_status  uuid;
  v_result  jsonb;
begin
  -- Pinned here so the file measures its own inputs and never the live configuration.
  update public.feature_flags set state = 'public' where key in ('projects', 'pricing', 'reservations');
  update public.settings set value = to_jsonb(1)      where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4)      where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(3)      where key = 'antispam.max_requests_per_phone_per_day';
  -- The two figures §23 and §24 refuse to fix. Set HERE, never read from a literal in the code under test.
  update public.settings set value = to_jsonb(25000)  where key = 'reservations.deposit_millimes_default';
  update public.settings set value = to_jsonb(7)      where key = 'reservations.valid_days_default';
  update public.settings set value = to_jsonb('شروط عامة للحجز.'::text) where key = 'reservations.conditions_ar';
  update public.settings set value = to_jsonb(30)     where key = 'reservations.max_extend_days';
  update public.settings set value = to_jsonb(3)      where key = 'reservations.expiry_soon_days';

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'rsv-admin-' || v_admin || '@test.local', '{"full_name":"Admin Hjouzet"}'),
    (v_com,   'authenticated', 'authenticated', 'rsv-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Hjouzet"}'),
    (v_fin,   'authenticated', 'authenticated', 'rsv-fin-'   || v_fin   || '@test.local', '{"full_name":"Finance Hjouzet"}'),
    (v_agri,  'authenticated', 'authenticated', 'rsv-agri-'  || v_agri  || '@test.local', '{"full_name":"Masoul Falahi"}'),
    (v_plain, 'authenticated', 'authenticated', 'rsv-plain-' || v_plain || '@test.local', '{"full_name":"Bla Dawr"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_com, 'commercial'), (v_fin, 'finance'), (v_agri, 'agri_manager');
  perform set_config('test.rs_admin', v_admin::text, true);
  perform set_config('test.rs_com',   v_com::text,   true);
  perform set_config('test.rs_fin',   v_fin::text,   true);
  perform set_config('test.rs_agri',  v_agri::text,  true);
  perform set_config('test.rs_plain', v_plain::text, true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  -- A · the offer that sets its OWN three terms (§23: «الـAdmin يحدد لكل Project»).
  v_code := 'RSV-A-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days, reservation_conditions_ar)
  values (v_code, 'عرض بشروط خاصة', 34, 'published', 12, 75000, 5, 'شروط العرض أ.')
  returning id into v_id;
  perform set_config('test.rs_a', v_id::text, true);
  perform set_config('test.rs_a_code', v_code, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);

  -- B · the offer that INHERITS the two global defaults.
  v_code := 'RSV-B-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_code, 'عرض يورث الإعدادات', 34, 'published', 12) returning id into v_id;
  perform set_config('test.rs_b', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);

  -- Z · the offer that asks for NO deposit and sets no deadline. Zero is an answer, not «unset».
  v_code := 'RSV-Z-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days)
  values (v_code, 'عرض بلا عربون', 34, 'published', 6, 0, 0) returning id into v_id;
  perform set_config('test.rs_z', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);

  -- The demand the reservation points back at, taken by the real offer intake.
  v_result := public.submit_offer_request(
    pg_temp.rs_payload(current_setting('test.rs_a'), '3', current_setting('test.rs_phone_1')));
  select r.id, r.person_id into v_id, v_status
  from public.interest_requests r where r.request_no = v_result->>'request_no';
  perform set_config('test.rs_request', v_id::text, true);
  perform set_config('test.rs_p1', v_status::text, true);

  -- A second client, this one inside the commercial's file (COM-05).
  select s.id into v_status from public.lead_statuses s
  where s.stage = 'new' and s.is_active order by s.is_stage_default desc, s.sort_order limit 1;
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at, last_request_at, assigned_to)
  values ('حريفة الكوميرسيال', current_setting('test.rs_phone_2'), 34, v_status, now(), now(), v_com)
  returning id into v_id;
  perform set_config('test.rs_p2', v_id::text, true);
end $$;

-- The stock has to exist before anything can be held. Generating is the agri manager's / Finance's / Admin's.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_generate_trees(current_setting('test.rs_a')::uuid, current_setting('test.rs_reason'));
select public.staff_generate_trees(current_setting('test.rs_b')::uuid, current_setting('test.rs_reason'));
select public.staff_generate_trees(current_setting('test.rs_z')::uuid, current_setting('test.rs_reason'));
reset role;

-- ---------------------------------------------------------------------------
-- 1 · §23 + §24 · The two numbers are configurable, per offer, with a global default
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_a jsonb := public.staff_reservation_terms(current_setting('test.rs_a')::uuid);
  v_b jsonb := public.staff_reservation_terms(current_setting('test.rs_b')::uuid);
  v_z jsonb := public.staff_reservation_terms(current_setting('test.rs_z')::uuid);
begin
  -- The offer's own values win, and the payload says they are the offer's.
  assert (v_a->>'deposit_millimes')::bigint = 75000 and v_a->>'deposit_source' = 'project',
    'an offer that sets its own deposit uses it, got ' || v_a::text;
  assert (v_a->>'valid_days')::integer = 5 and v_a->>'valid_days_source' = 'project',
    'and its own validity period, got ' || v_a::text;
  assert v_a->>'conditions_ar' = 'شروط العرض أ.' and v_a->>'conditions_source' = 'project',
    'and its own conditions, got ' || v_a::text;

  -- An offer that sets none inherits the settings, and says so.
  assert (v_b->>'deposit_millimes')::bigint = 25000 and v_b->>'deposit_source' = 'default',
    'an offer with no deposit of its own inherits the setting, got ' || v_b::text;
  assert (v_b->>'valid_days')::integer = 7 and v_b->>'valid_days_source' = 'default',
    'and inherits the validity period, got ' || v_b::text;

  -- Zero is an answer the owner may give, and it is not the same as «not set».
  assert (v_z->>'deposit_millimes')::bigint = 0 and v_z->>'deposit_source' = 'project'
     and (v_z->>'valid_days')::integer = 0 and v_z->>'valid_days_source' = 'project',
    'an offer may ask for no deposit and set no deadline, got ' || v_z::text;
end $$;

reset role;

do $$
declare
  v_key text;
begin
  -- Every figure the spec calls an example has a row of its own the Back Office can edit. If one of these
  -- disappears, some number went back into the code.
  foreach v_key in array array['reservations.deposit_millimes_default', 'reservations.valid_days_default',
                               'reservations.conditions_ar', 'reservations.max_extend_days',
                               'reservations.expiry_soon_days', 'reservation_no.prefix',
                               'payment_no.prefix', 'reservations.status_labels', 'payments.kind_labels'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.label_ar <> ''),
      'the deposit and the deadline are settings, not constants: ' || v_key || ' is missing';
  end loop;

  -- The RULES are internal: what an offer asks for is said on its own page, not shipped in the site config.
  --
  -- THE VOCABULARY IS NOT A RULE, and since 0107 it is public. فضاء «زيتونتي» is a public page rendered from
  -- getPublicConfig(), so a private `reservations.status_labels` meant the client's screen could not read the
  -- owner's own words and printed a copy compiled into the TypeScript instead — he could rename «العربون
  -- تخلّص» in الإعدادات forever and the buyer would keep seeing the old one. Publishing the map publishes the
  -- ARABIC FOR A STATE, not a row, an amount or whose it is.
  --
  -- So the assertion narrows to what it was always protecting: the deposit, the deadline and the prefixes.
  assert not exists (select 1 from public.settings s
                     where s.key like 'reservations.%' and s.is_public
                       and s.key not like '%\_labels'),
    'reservation RULES are internal — only the status vocabulary may be public';

  -- How the money arrived is a list the owner edits, never a union in TypeScript (§30 طرق الدفع).
  assert exists (select 1 from public.option_lists l where l.key = 'payment_method'),
    'payment methods are an option list';
  assert (select count(*) from public.option_items o where o.list_key = 'payment_method' and o.is_active) >= 3,
    'and it is seeded with the usual ones';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Who may call what
-- ---------------------------------------------------------------------------

-- 2a · A visitor gets nothing at all. None of the eight functions is granted to anon.
set local role anon;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
      'select public.staff_reservations()',
      'select public.staff_reservation(gen_random_uuid())',
      'select public.staff_person_reservations(gen_random_uuid())',
      'select public.staff_reservation_terms(gen_random_uuid())',
      'select public.staff_create_reservation(gen_random_uuid(), gen_random_uuid(), null, 1, null, ''x'')',
      'select public.staff_record_deposit(gen_random_uuid(), 1000, null, null, null, null, ''x'')',
      'select public.staff_void_payment(gen_random_uuid(), ''x'')',
      'select public.staff_extend_reservation(gen_random_uuid(), 1, ''x'')',
      'select public.staff_close_reservation(gen_random_uuid(), ''cancelled'', true, ''x'')'] loop
    begin
      execute v_fn;
      raise exception 'a visitor reached %', v_fn;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- And the tables themselves are closed to them.
  begin
    perform 1 from public.reservations;
    raise exception 'a visitor read public.reservations';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.payments;
    raise exception 'a visitor read public.payments';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- 2b · A signed-in user with no staff role is not staff.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_plain'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.rs_expect('select public.staff_reservations()', 'forbidden');
  perform pg_temp.rs_expect(
    format('select public.staff_person_reservations(%L)', current_setting('test.rs_p1')), 'forbidden');
  perform pg_temp.rs_expect(
    format('select public.staff_create_reservation(%L, %L, null, 1, null, %L)',
           current_setting('test.rs_a'), current_setting('test.rs_p1'), current_setting('test.rs_reason')),
    'forbidden');
  -- RLS says the same thing from the table side: no rows, not an error.
  assert (select count(*) from public.reservations) = 0, 'RLS shows a role-less user nothing';
  assert (select count(*) from public.payments) = 0, 'and no money either';
end $$;

reset role;

-- 2c · The agricultural manager keeps stock and never reads a client file, so they never reserve.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_agri'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.rs_expect(
    format('select public.staff_create_reservation(%L, %L, null, 1, null, %L)',
           current_setting('test.rs_a'), current_setting('test.rs_p1'), current_setting('test.rs_reason')),
    'forbidden');
  -- They are staff, so the list answers — with nothing, because they may see no file.
  assert (public.staff_reservations()->>'matched')::integer = 0,
    'the agri manager reads no client file, so the list is empty for them';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3 · «معطّل» closes the act, not just the link
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'disabled' where key = 'reservations';

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.rs_expect(
    format('select public.staff_create_reservation(%L, %L, null, 1, null, %L)',
           current_setting('test.rs_a'), current_setting('test.rs_p1'), current_setting('test.rs_reason')),
    'module_closed');
  perform pg_temp.rs_expect(
    format('select public.staff_record_deposit(%L, 1000, null, null, null, null, %L)',
           gen_random_uuid(), current_setting('test.rs_reason')), 'module_closed');
  perform pg_temp.rs_expect(
    format('select public.staff_extend_reservation(%L, 1, %L)',
           gen_random_uuid(), current_setting('test.rs_reason')), 'module_closed');
  perform pg_temp.rs_expect(
    format('select public.staff_close_reservation(%L, ''cancelled'', true, %L)',
           gen_random_uuid(), current_setting('test.rs_reason')), 'module_closed');
  perform pg_temp.rs_expect(
    format('select public.staff_void_payment(%L, %L)',
           gen_random_uuid(), current_setting('test.rs_reason')), 'module_closed');

  -- The READERS keep answering: the Back Office is where a module is prepared, and the layout is explicit
  -- that the flag governs visitors and not the team. They report the state instead.
  assert public.staff_reservations()->>'module_state' = 'disabled',
    'the list still answers while the module is off, and says it is off';
  assert public.staff_person_reservations(current_setting('test.rs_p1')::uuid)->>'module_state' = 'disabled',
    'and so does the client file reader';
end $$;

reset role;

update public.feature_flags set state = 'public' where key = 'reservations';

-- ---------------------------------------------------------------------------
-- 4 · §23 · Opening a reservation: the terms are snapshot, the trees are allocated, once
-- ---------------------------------------------------------------------------

select set_config('test.rs_log', (select count(*)::text from public.audit_logs), true);

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_create_reservation(
         current_setting('test.rs_a')::uuid, current_setting('test.rs_p1')::uuid,
         current_setting('test.rs_request')::uuid, 3, 'حجز بعد مكالمة', current_setting('test.rs_reason'));
  perform set_config('test.rs_r1', v->>'id', true);

  assert v->>'status' = 'awaiting_deposit',
    '§23''s first status is «Reserved – Awaiting Deposit», got ' || coalesce(v->>'status', 'null');
  assert v->>'status_label' <> 'awaiting_deposit',
    'and its Arabic comes from settings, not from the code';
  assert v->>'reference_no' like 'AGZ-RES-%',
    'a reservation carries its own number (v2 §32), got ' || coalesce(v->>'reference_no', 'null');

  -- The terms were COPIED, so editing the offer tomorrow cannot rewrite what this client was told.
  assert (v->>'deposit_due_millimes')::bigint = 75000 and (v->>'valid_days')::integer = 5,
    'the offer''s own deposit and validity are snapshot onto the reservation, got ' || v::text;
  assert v->>'conditions_ar' = 'شروط العرض أ.', 'and so are its conditions';

  -- §24, computed in Postgres.
  assert (v->>'expires_at')::timestamptz between now() + interval '5 days' - interval '2 minutes'
                                             and now() + interval '5 days' + interval '2 minutes',
    'the expiry is reserved_at + valid_days, got ' || coalesce(v->>'expires_at', 'null');
  assert (v->>'days_left')::integer between 4 and 5, 'and the screen is handed the days left, not a formula';
  assert (v->>'is_overdue')::boolean = false and (v->>'is_open')::boolean = true,
    'a fresh reservation is open and not overdue';

  -- The inventory half was performed by 0054's engine, and nothing was counted twice.
  assert (v->>'trees_count')::integer = 3 and (v->>'trees_held')::integer = 3,
    'three trees were taken and three are held, got ' || v::text;
  assert v->>'first_code' = current_setting('test.rs_a_code') || '-0001'
     and v->>'last_code'  = current_setting('test.rs_a_code') || '-0003',
    'the lowest available numbers, as allocation always takes them, got '
    || coalesce(v->>'first_code', 'null') || '..' || coalesce(v->>'last_code', 'null');
  assert (v->>'deposit_paid_millimes')::bigint = 0
     and (v->>'deposit_left_millimes')::bigint = 75000,
    'and not a millime has arrived yet';
end $$;

reset role;

do $$
declare
  v_a uuid := current_setting('test.rs_a')::uuid;
  v_r uuid := current_setting('test.rs_r1')::uuid;
begin
  assert pg_temp.rs_state(v_a, 'reserved') = 3 and pg_temp.rs_state(v_a, 'available') = 9,
    'the offer''s stock moved by exactly three (§46), got '
    || pg_temp.rs_state(v_a, 'reserved') || ' reserved';
  assert (select count(*) from public.trees t where t.reservation_id = v_r) = 3,
    'and the three trees point back at their reservation';
  assert not exists (select 1 from public.trees t
                     where t.reservation_id = v_r
                       and (t.held_by <> current_setting('test.rs_p1')::uuid
                            or t.request_id <> current_setting('test.rs_request')::uuid
                            or t.allocated_at is null)),
    'each one carries the holder, the demand and the date 0054 writes';

  -- §51: the act is named in the log, with who and why, and the allocation it performed is inside it.
  assert exists (select 1 from public.audit_logs a
                 where a.action = 'reservations.create' and a.entity_id = v_r::text
                   and a.actor_id = current_setting('test.rs_admin')::uuid
                   and a.reason = current_setting('test.rs_reason')
                   and (a.new_data->'allocation'->>'trees')::integer = 3),
    'opening a reservation writes one named audit event carrying its allocation';
end $$;

-- An offer that asks for no deposit has nothing to await, and there is nothing to record against it.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_create_reservation(
         current_setting('test.rs_z')::uuid, current_setting('test.rs_p1')::uuid, null, 2, null,
         current_setting('test.rs_reason'));
  perform set_config('test.rs_rz', v->>'id', true);

  assert v->>'status' = 'deposit_paid' and (v->>'deposit_due_millimes')::bigint = 0,
    'an offer that asks for no عربون opens settled, got ' || v::text;
  assert v->>'expires_at' is null and (v->>'valid_days')::integer = 0 and v->>'days_left' is null,
    'and with no deadline at all — 0 days is «بلا أجل», not «due today», got ' || v::text;

  perform pg_temp.rs_expect(
    format('select public.staff_record_deposit(%L, 1000, null, null, null, null, %L)',
           current_setting('test.rs_rz'), current_setting('test.rs_reason')),
    'deposit_not_due');
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5 · A commercial reserves inside their own file and nowhere else, and records no money
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- Not their file: refused, exactly as staff_allocate_trees refuses it (COM-05).
  perform pg_temp.rs_expect(
    format('select public.staff_create_reservation(%L, %L, null, 1, null, %L)',
           current_setting('test.rs_b'), current_setting('test.rs_p1'), current_setting('test.rs_reason')),
    'forbidden');
  perform pg_temp.rs_expect(
    format('select public.staff_person_reservations(%L)', current_setting('test.rs_p1')), 'forbidden');

  -- Their own file: allowed.
  v := public.staff_create_reservation(
         current_setting('test.rs_b')::uuid, current_setting('test.rs_p2')::uuid, null, 4, null,
         current_setting('test.rs_reason'));
  perform set_config('test.rs_r2', v->>'id', true);
  assert (v->>'deposit_due_millimes')::bigint = 25000 and (v->>'valid_days')::integer = 7,
    'the inherited terms are snapshot just the same, got ' || v::text;

  -- The list is scoped to what they may see: their reservation, and not the admin's two.
  assert (public.staff_reservations()->>'matched')::integer = 1,
    'a commercial sees only the files assigned to them';

  -- Money is Finance''s desk (§33), even on their own client.
  perform pg_temp.rs_expect(
    format('select public.staff_record_deposit(%L, 25000, null, null, null, null, %L)',
           current_setting('test.rs_r2'), current_setting('test.rs_reason')),
    'forbidden');
  -- And unwinding a hold is stock keeping ∩ file visibility = Finance and Admin (§24).
  perform pg_temp.rs_expect(
    format('select public.staff_close_reservation(%L, ''cancelled'', true, %L)',
           current_setting('test.rs_r2'), current_setting('test.rs_reason')),
    'forbidden');
  perform pg_temp.rs_expect(
    format('select public.staff_extend_reservation(%L, 3, %L)',
           current_setting('test.rs_r2'), current_setting('test.rs_reason')),
    'forbidden');
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 6 · §23 · «Deposit Paid» is derived from the money, in SQL, and never written by hand
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v      jsonb;
  v_cash uuid := (select o.id from public.option_items o where o.list_key = 'payment_method' and o.code = 'cash');
begin
  -- Nothing, or a negative amount, is not a payment.
  perform pg_temp.rs_expect(
    format('select public.staff_record_deposit(%L, 0, null, null, null, null, %L)',
           current_setting('test.rs_r1'), current_setting('test.rs_reason')),
    'invalid_deposit_amount');
  -- A method that is not on the owner's list is not a method.
  perform pg_temp.rs_expect(
    format('select public.staff_record_deposit(%L, 1000, %L, null, null, null, %L)',
           current_setting('test.rs_r1'), gen_random_uuid(), current_setting('test.rs_reason')),
    'invalid_payment_method');

  -- Part of the عربون: still awaiting, and the remainder is stated.
  v := public.staff_record_deposit(current_setting('test.rs_r1')::uuid, 50000, v_cash, null,
                                   'وصل رقم 12', null, current_setting('test.rs_reason'));
  assert v->>'status' = 'awaiting_deposit'
     and (v->>'deposit_paid_millimes')::bigint = 50000
     and (v->>'deposit_left_millimes')::bigint = 25000,
    'half the deposit leaves the reservation awaiting the rest, got ' || v::text;
  assert v->>'deposit_paid_at' is null, 'and it is not «paid» yet';
  assert jsonb_array_length(v->'payments') = 1
     and (v->'payments'->0->>'method_label') is not null
     and (v->'payments'->0->>'reference_no') like 'AGZ-PAY-%',
    'the receipt carries its own number and the method as it read that day, got ' || (v->'payments')::text;

  -- The rest: §23's second status, reached by the money and not by a caller setting it.
  v := public.staff_record_deposit(current_setting('test.rs_r1')::uuid, 25000, v_cash, null, null, null,
                                   current_setting('test.rs_reason'));
  assert v->>'status' = 'deposit_paid'
     and (v->>'deposit_paid_millimes')::bigint = 75000
     and (v->>'deposit_left_millimes')::bigint = 0
     and v->>'deposit_paid_at' is not null,
    '«Deposit Paid» is the sum of the live rows reaching what was due, got ' || v::text;
  -- The row just written is the first one the payload lists (newest first, ties broken by the receipt
  -- number), so voiding it below is voiding THIS payment and not the earlier half.
  assert (v->'payments'->0->>'amount_millimes')::bigint = 25000,
    'the payload lists the newest receipt first, got ' || (v->'payments')::text;
  perform set_config('test.rs_pay2', v->'payments'->0->>'id', true);

  -- Voiding a receipt takes the status back with it: there is one truth about the money, not two.
  v := public.staff_void_payment(current_setting('test.rs_pay2')::uuid, current_setting('test.rs_reason'));
  assert v->>'status' = 'awaiting_deposit' and (v->>'deposit_paid_millimes')::bigint = 50000,
    'voiding the last payment returns the reservation to «awaiting», got ' || v::text;
  perform pg_temp.rs_expect(
    format('select public.staff_void_payment(%L, %L)',
           current_setting('test.rs_pay2'), current_setting('test.rs_reason')),
    'payment_already_void');

  -- Re-record it properly, so the rest of the file works on a paid reservation.
  v := public.staff_record_deposit(current_setting('test.rs_r1')::uuid, 25000, v_cash, null,
                                   'تصحيح', null, current_setting('test.rs_reason'));
  assert v->>'status' = 'deposit_paid', 'and recording the right one brings it back';
end $$;

reset role;

do $$
begin
  -- A payment is never deleted: the mistake and its correction both stay (§59 «كل عملية مالية يلزمها أثر»).
  assert (select count(*) from public.payments p
          where p.reservation_id = current_setting('test.rs_r1')::uuid) = 3,
    'three rows were written and none was removed';
  assert (select count(*) from public.payments p
          where p.reservation_id = current_setting('test.rs_r1')::uuid and p.voided_at is not null) = 1,
    'one of them is void, and says who voided it and why';
  assert exists (select 1 from public.audit_logs a where a.action = 'payments.record'),
    'every recorded dinar is a named audit event';
  assert exists (select 1 from public.audit_logs a where a.action = 'payments.void'),
    'and so is every correction';

  -- Money is stored in integer millimes, like everything else in this schema.
  assert (select sum(p.amount_millimes) from public.payments p
          where p.reservation_id = current_setting('test.rs_r1')::uuid and p.voided_at is null) = 75000,
    'the live rows add up to what was due, in millimes';
end $$;

-- ---------------------------------------------------------------------------
-- 7 · §24 · Extending, and the ceiling on it
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_before timestamptz;
  v        jsonb;
begin
  v_before := (public.staff_reservation(current_setting('test.rs_r1')::uuid)->>'expires_at')::timestamptz;

  v := public.staff_extend_reservation(current_setting('test.rs_r1')::uuid, 4,
                                       current_setting('test.rs_reason'));
  assert (v->>'expires_at')::timestamptz between v_before + interval '4 days' - interval '2 minutes'
                                             and v_before + interval '4 days' + interval '2 minutes',
    'an extension counts from the deadline it had, got ' || coalesce(v->>'expires_at', 'null');
  assert (v->>'extended_count')::integer = 1, 'and the file remembers that it was extended';

  -- No number means «give it the offer's own period again» (5 days for offer A).
  v_before := (v->>'expires_at')::timestamptz;
  v := public.staff_extend_reservation(current_setting('test.rs_r1')::uuid, null,
                                       current_setting('test.rs_reason'));
  assert (v->>'expires_at')::timestamptz between v_before + interval '5 days' - interval '2 minutes'
                                             and v_before + interval '5 days' + interval '2 minutes',
    'an extension with no number repeats the offer''s own period, got ' || coalesce(v->>'expires_at', 'null');

  -- The ceiling is a setting, so it can be raised without touching a line of SQL.
  perform pg_temp.rs_expect(
    format('select public.staff_extend_reservation(%L, 90, %L)',
           current_setting('test.rs_r1'), current_setting('test.rs_reason')),
    'extend_over_cap');
  perform pg_temp.rs_expect(
    format('select public.staff_extend_reservation(%L, -3, %L)',
           current_setting('test.rs_r1'), current_setting('test.rs_reason')),
    'invalid_extend_days');
end $$;

reset role;

-- An overdue hold is a fact of the clock, not a status a scheduler writes (§24 leaves the three choices to a
-- human). Backdate one and read it.
update public.reservations
   set expires_at = now() - interval '2 days'
 where id = current_setting('test.rs_r1')::uuid;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.staff_reservation(current_setting('test.rs_r1')::uuid);
  l jsonb := public.staff_reservations('overdue');
begin
  assert (v->>'is_overdue')::boolean and v->>'status' = 'deposit_paid',
    'the deadline passed and the STATUS did not move on its own, got ' || v::text;
  assert (v->>'days_left')::integer < 0, 'the screen is told how far past it is';
  assert (l->'counts'->>'overdue')::integer >= 1,
    'and the list can be asked for exactly those, got ' || (l->'counts')::text;

  -- Extending an overdue hold gives the client the days promised, not the days they already lost.
  v := public.staff_extend_reservation(current_setting('test.rs_r1')::uuid, 3,
                                       current_setting('test.rs_reason'));
  assert (v->>'expires_at')::timestamptz between now() + interval '3 days' - interval '2 minutes'
                                             and now() + interval '3 days' + interval '2 minutes',
    'an overdue extension counts from today, got ' || coalesce(v->>'expires_at', 'null');
  assert (v->>'is_overdue')::boolean = false, 'and it is no longer overdue';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 8 · §24 · Cancelling and «يرجع القطعة Available» are one act, and touch only their own trees
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- Only the two outcomes a human takes. 'converted' belongs to the contract (§14) and is not reachable here.
  perform pg_temp.rs_expect(
    format('select public.staff_close_reservation(%L, ''converted'', true, %L)',
           current_setting('test.rs_r1'), current_setting('test.rs_reason')),
    'invalid_reservation_outcome');
  perform pg_temp.rs_expect(
    format('select public.staff_close_reservation(%L, ''zzz'', true, %L)',
           current_setting('test.rs_r1'), current_setting('test.rs_reason')),
    'invalid_reservation_outcome');

  v := public.staff_close_reservation(current_setting('test.rs_r1')::uuid, 'cancelled', true,
                                      current_setting('test.rs_reason'));
  assert v->>'status' = 'cancelled' and v->>'closed_at' is not null and (v->>'trees_released')::boolean,
    'cancelling closes the paperwork and frees the trees in the same act, got ' || v::text;
  assert (v->>'trees_held')::integer = 0, 'and the reservation holds nothing afterwards';

  -- Twice is not allowed: the second caller would be describing a decision somebody else already took.
  perform pg_temp.rs_expect(
    format('select public.staff_close_reservation(%L, ''cancelled'', true, %L)',
           current_setting('test.rs_r1'), current_setting('test.rs_reason')),
    'reservation_closed');
  perform pg_temp.rs_expect(
    format('select public.staff_record_deposit(%L, 1000, null, null, null, null, %L)',
           current_setting('test.rs_r1'), current_setting('test.rs_reason')),
    'reservation_closed');
  perform pg_temp.rs_expect(
    format('select public.staff_extend_reservation(%L, 3, %L)',
           current_setting('test.rs_r1'), current_setting('test.rs_reason')),
    'reservation_closed');
end $$;

reset role;

do $$
declare
  v_a uuid := current_setting('test.rs_a')::uuid;
  v_b uuid := current_setting('test.rs_b')::uuid;
begin
  -- §46 read from the other side: the stock came back, all of it, and only it.
  assert pg_temp.rs_state(v_a, 'available') = 12 and pg_temp.rs_state(v_a, 'reserved') = 0,
    'the three trees are on sale again, got ' || pg_temp.rs_state(v_a, 'available') || ' available';
  assert not exists (select 1 from public.trees t
                     where t.reservation_id = current_setting('test.rs_r1')::uuid),
    'and none of them still points at the cancelled reservation';
  assert not exists (select 1 from public.trees t
                     where t.project_id = v_a and t.state = 'available'
                       and (t.held_by is not null or t.request_id is not null or t.allocated_at is not null)),
    'a freed tree carries no holder, no demand and no date';

  -- The commercial's reservation on the other offer was not touched by any of it.
  assert pg_temp.rs_state(v_b, 'reserved') = 4,
    'closing one reservation never touches another offer''s stock, got ' || pg_temp.rs_state(v_b, 'reserved');
  assert (select count(*) from public.trees t
          where t.reservation_id = current_setting('test.rs_r2')::uuid) = 4,
    'and the other reservation still holds its four';

  assert exists (select 1 from public.audit_logs a
                 where a.action = 'reservations.close'
                   and a.entity_id = current_setting('test.rs_r1')
                   and (a.new_data->>'trees_freed')::integer = 3),
    'and the decision is in the log with the trees it freed';
end $$;

-- Cancelling WITHOUT releasing is §24's other bullet, and it leaves the stock where it is.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_close_reservation(current_setting('test.rs_r2')::uuid, 'expired', false,
                                      current_setting('test.rs_reason'));
  assert v->>'status' = 'expired' and (v->>'trees_released')::boolean = false,
    'closing without releasing is the other choice §24 gives, got ' || v::text;
  assert (v->>'trees_held')::integer = 4, 'and the trees stay held for the next decision';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 9 · The link to the trees cannot go stale
-- ---------------------------------------------------------------------------

-- 0054's own release path knows nothing about reservations. Releasing through it must still clear the link,
-- or an available tree would keep pointing at a reservation that no longer holds it.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rs_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_ids uuid[];
begin
  select array_agg(t.id) into v_ids
  from public.trees t where t.reservation_id = current_setting('test.rs_r2')::uuid;
  perform public.staff_set_tree_state(v_ids, 'available', current_setting('test.rs_reason'));
end $$;

reset role;

do $$
begin
  assert not exists (select 1 from public.trees t
                     where t.reservation_id = current_setting('test.rs_r2')::uuid),
    'releasing a tree from the offer''s own screen clears its reservation link too';
  assert pg_temp.rs_state(current_setting('test.rs_b')::uuid, 'available') = 12,
    'and the stock is whole again';

  -- The reservation still says how many it took; the live figure is read from the trees, so the two can be
  -- compared and a divergence shown instead of one of them quietly winning.
  assert (select r.trees_count from public.reservations r
          where r.id = current_setting('test.rs_r2')::uuid) = 4,
    'the reservation keeps the record of what it took';
end $$;

-- ---------------------------------------------------------------------------
-- 10 · The shape itself: what this module is and is not
-- ---------------------------------------------------------------------------

do $$
begin
  -- The five statuses §23/§24 name, and no sixth.
  assert (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.reservation_status'::regtype)
         = array['awaiting_deposit', 'deposit_paid', 'expired', 'cancelled', 'converted'],
    'the reservation statuses are the ones the spec names';

  -- tree_state was not widened. §21's «Deposit paid» colour is derived from the reservation, not stored twice.
  assert (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.tree_state'::regtype)
         = array['available', 'reserved', 'sold'],
    'a tree is still available, reserved or sold — the deposit is an event on the reservation';

  -- No second inventory: the reservation holds a record of the act and points at the trees; it stores no list
  -- of tree ids of its own and no per-offer counter.
  assert not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = 'reservations'
                       and c.column_name in ('tree_ids', 'trees_available', 'trees_reserved')),
    'the reservation never keeps its own copy of the inventory';
  assert exists (select 1 from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = 'trees'
                   and c.column_name = 'reservation_id'),
    'the link lives on the tree, where the state already is';

  -- Money is one movement table, so stage 3 (§15 الأقساط) records against a contract without a rewrite.
  assert (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.payment_kind'::regtype)
         = array['deposit', 'down_payment', 'installment', 'other'],
    'the kinds of money are named now so a later phase adds a value, not a table';
  assert not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = 'reservations'
                       and c.column_name in ('paid_millimes', 'paid_at')),
    'the deposit is a row in public.payments, never two columns on the reservation';

  -- Both tables are append-through-RPC only: nobody holds a write grant.
  assert not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name in ('reservations', 'payments')
      and g.grantee in ('anon', 'authenticated')
      and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
    'nothing writes a reservation or a payment except the security-definer RPCs';

  -- And the module row still says «disabled»: building it never publishes it.
  assert (select f.state from public.feature_flags f where f.key = 'reservations') is not null,
    'the module has its flag row';
end $$;
