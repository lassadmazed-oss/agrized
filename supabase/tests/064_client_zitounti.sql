-- «زيتونتي» للحريف نفسه — the client's own door onto their own file.
-- Migration supabase/migrations/0102_client_zitounti.sql.
--
-- Runs against the live database inside a rolled-back transaction: one fresh offer with an unused code, fresh
-- auth users, unused phone numbers, and every flag and setting it measures pinned inside the transaction.
--
-- WHAT THIS FILE IS FOR. public.my_zitounti_file() is the second thing in AgriZed a non-staff session may
-- call (the first being the login of 0096), and it hands over a file full of a named person's phone number,
-- money and contracts. So the assertions that matter are not «does it return the trees» — that is four lines
-- of section 2 — but the four ways it could hand the wrong file to the wrong person:
--
--   · there is no parameter, so the identity cannot be chosen        → section 3
--   · anon is refused by the GRANT, before the body runs             → section 4
--   · the module gate still closes it, INCLUDING on `internal`       → section 5
--   · what a buyer may see is an allowlist, and the CRM's opinion of
--     the lead is not on it, while the payload is otherwise the SAME
--     object staff read — one component, two doors                   → section 6
--
-- Sections 3 and 6 are the ones to read first; they are the reason the function has the shape it has.

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'my_zitounti_file') then
    raise exception
      'supabase/migrations/0102_client_zitounti.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0102_client_zitounti.sql supabase/tests/064_client_zitounti.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers and fixtures
-- ---------------------------------------------------------------------------

create function pg_temp.cz_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

/** The keys of a jsonb object, sorted — for comparing two payloads' SHAPES rather than their contents. */
create function pg_temp.cz_keys(p_obj jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(p_obj) k
$$;

do $$
declare
  v_phone text;
  i       integer;
  v_used  text[] := '{}';
begin
  for i in 1..2 loop
    loop
      v_phone := '+21696' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.cz_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);
select set_config('test.cz_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 0)), '.'), true)
from (values ('اختبار فضاء زيتونتي للحريف')) as t (s);

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_com   uuid := gen_random_uuid();
  v_ua    uuid := gen_random_uuid();
  v_ub    uuid := gen_random_uuid();
  v_class uuid;
  v_proj  uuid;
  v_code  text;
  v_pid   uuid;
begin
  -- EVERY FLAG THE FILE READS IS PINNED TO 'public', and section 6 depends on that: on `internal`,
  -- app.module_open answers app.is_staff(), so a section would legitimately read 'ok' for the admin and
  -- 'closed' for the buyer and the two payloads would differ for a correct reason. Section 5 measures that
  -- deliberately, on one flag, after the comparison is done.
  update public.feature_flags set state = 'public'
   where key in ('projects', 'pricing', 'reservations', 'visits', 'contracts', 'installments', 'zitounti',
                 'agri_backoffice', 'subscriptions', 'harvest');
  update public.settings set value = to_jsonb(1) where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4) where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(9) where key = 'antispam.max_requests_per_phone_per_day';

  -- Two staff accounts and two BUYER accounts. The commercial's name is deliberately Latin and distinctive:
  -- section 6 scans the client's whole payload for it, and an Arabic name could collide with real copy.
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'cz-admin-' || v_admin || '@test.local', '{"full_name":"Admin Zitounti"}'),
    (v_com,   'authenticated', 'authenticated', 'cz-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Zitounti Only"}'),
    (v_ua,    'authenticated', 'authenticated', 'cz-a-'     || v_ua    || '@test.local', '{"full_name":"حريف أ"}'),
    (v_ub,    'authenticated', 'authenticated', 'cz-b-'     || v_ub    || '@test.local', '{"full_name":"حريف ب"}');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin'), (v_com, 'commercial');
  perform set_config('test.cz_admin', v_admin::text, true);
  perform set_config('test.cz_com',   v_com::text,   true);
  perform set_config('test.cz_ua',    v_ua::text,    true);
  perform set_config('test.cz_ub',    v_ub::text,    true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  v_code := 'ZCL-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days, reservation_conditions_ar,
                               plan_storage_path)
  values (v_code, 'عرض زيتونتي للحريف', 34, 'published', 40, 75000, 30, 'شروط عرض الاختبار.',
          'plans/' || v_code || '.pdf')
  returning id into v_proj;
  perform set_config('test.cz_project', v_proj::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_proj, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_proj, 7000, 50000, 150000, 'percent', 1000, 1000);

  -- TWO buyers, through the real intake. Client B exists so that «a client cannot reach another client's
  -- file» is measured against a real second file and not against a missing row.
  perform set_config('test.cz_req_no',
    (public.submit_offer_request(jsonb_build_object(
       'full_name', 'حريف زيتونتي أ', 'phone_e164', current_setting('test.cz_phone_1'),
       'residence_governorate_id', '34', 'contact_channel', 'phone',
       'consent_text', 'موافقة تجريبية', 'project_id', v_proj::text, 'trees', '3'))->>'request_no'), true);
  select r.person_id into v_pid
  from public.interest_requests r where r.request_no = current_setting('test.cz_req_no');
  perform set_config('test.cz_person_a', v_pid::text, true);
  select r.id into v_pid
  from public.interest_requests r where r.request_no = current_setting('test.cz_req_no');
  perform set_config('test.cz_req_a', v_pid::text, true);

  perform set_config('test.cz_req_no_b',
    (public.submit_offer_request(jsonb_build_object(
       'full_name', 'حريف زيتونتي ب', 'phone_e164', current_setting('test.cz_phone_2'),
       'residence_governorate_id', '34', 'contact_channel', 'phone',
       'consent_text', 'موافقة تجريبية', 'project_id', v_proj::text, 'trees', '1'))->>'request_no'), true);
  select r.person_id into v_pid
  from public.interest_requests r where r.request_no = current_setting('test.cz_req_no_b');
  perform set_config('test.cz_person_b', v_pid::text, true);
end $$;

-- The trees, and three of them held by client A — so «my file» has something in it that «their file» has not.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_generate_trees(current_setting('test.cz_project')::uuid, current_setting('test.cz_reason'));
select public.staff_create_reservation(
  p_project => current_setting('test.cz_project')::uuid,
  p_person  => current_setting('test.cz_person_a')::uuid,
  p_request => current_setting('test.cz_req_a')::uuid,
  p_trees   => 3,
  p_note    => 'حجز تجريبي.',
  p_reason  => current_setting('test.cz_reason'));
reset role;

-- THE LINK 0096 WRITES, which is the whole identity of the client door. Done here through the real function,
-- as the service role does after a code is verified, so this test exercises the same column the product does.
select set_config('request.jwt.claims', '', true);
do $$
begin
  -- A commercial on client A's file: something the CRM knows and the client must not read (section 6).
  update public.persons set assigned_to = current_setting('test.cz_com')::uuid
   where id = current_setting('test.cz_person_a')::uuid;

  -- AND A LEAD STATUS THIS FILE CAN RECOGNISE ANYWHERE. Section 6 scans the buyer's whole payload for the
  -- label, so it must not be a word that could honestly appear in it for another reason («جديد» would).
  -- Renaming the status this person already carries changes no other fixture and is rolled back with
  -- everything else.
  update public.lead_statuses set label_ar = 'CRM Opinion Only'
   where id = (select p.status_id from public.persons p
                where p.id = current_setting('test.cz_person_a')::uuid);

  perform public.link_client_profile(current_setting('test.cz_person_a')::uuid, current_setting('test.cz_ua')::uuid);
  perform public.link_client_profile(current_setting('test.cz_person_b')::uuid, current_setting('test.cz_ub')::uuid);

  assert (select p.profile_id from public.persons p
           where p.id = current_setting('test.cz_person_a')::uuid) = current_setting('test.cz_ua')::uuid,
    'client A''s person now points at their auth user — that link is the only identity this module has';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · Before anything else: the signature IS the security model
-- ---------------------------------------------------------------------------

-- THE ASSERTION THIS WHOLE FILE RESTS ON. A client entry point that took a person id would need a check
-- comparing it to the session, and a check can be dropped in a later edit without breaking a test. There is
-- no parameter, so there is nothing to tamper with and nothing to forget. If somebody ever adds one, this
-- line turns red before any screen ships.
do $$
begin
  assert (select pg_get_function_arguments(p.oid) from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'my_zitounti_file') = '',
    'public.my_zitounti_file() takes NO argument, so a client session cannot ask for another person''s file; it now takes: '
      || (select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'my_zitounti_file');
end $$;

-- ---------------------------------------------------------------------------
-- 2 · A signed-in client reads their own file
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_ua'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_f jsonb := public.my_zitounti_file();
begin
  assert v_f->'person'->>'id' = current_setting('test.cz_person_a'),
    'the file belongs to the person linked to this session, got ' || coalesce(v_f->'person'->>'id', 'null');
  assert v_f->'person'->>'full_name' = 'حريف زيتونتي أ', 'and carries their own name';
  assert v_f->'person'->>'phone_e164' = current_setting('test.cz_phone_1'),
    'and their own phone — their record, read by themselves';
  assert (v_f->'person'->>'has_account')::boolean,
    'has_account is true: they are reading this THROUGH the account';

  -- The content, which is 0068's and 0095's and is only being reached from a new direction.
  assert (v_f->'totals'->>'trees')::integer = 3,
    'their three reserved trees are on the file, got ' || coalesce(v_f->'totals'->>'trees', 'null');
  assert (v_f->'totals'->>'trees_reserved')::integer = 3, 'counted as reserved, not sold';
  assert (v_f->'trees'->>'status') = 'ok' and (v_f->'trees'->>'count')::integer = 1,
    'one offer holds them all';
  assert (v_f->'requests'->>'count')::integer >= 1,
    'and the demand they submitted is theirs to re-read, with the figures they were quoted';
  assert v_f->'requests'->'items'->0->>'request_no' = current_setting('test.cz_req_no'),
    'the same request number the intake gave them';
  assert v_f->>'read_at' is not null, 'the payload says when it was read';

  -- «ok + zero rows» is «you have no contract yet»; 'closed' is «the owner switched the module off». The
  -- client screen prints different sentences for them, so both must arrive named.
  assert v_f->'contracts'->>'status' = 'ok' and (v_f->'contracts'->>'count')::integer = 0,
    'no contract yet is an ANSWER, not a placeholder';
  assert (v_f->'totals'->'money'->>'left_millimes')::bigint = 0,
    'and nobody owes anything before they sign';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · A client cannot reach another client's file — by any route they have
-- ---------------------------------------------------------------------------

-- Still client A's session. There is no call that returns B's file: the client door takes no id, and the
-- staff door refuses a session that is not staff. Both are asserted, because «there is no way in» is only
-- true while BOTH remain true.
select pg_temp.cz_expect(
  format('select public.staff_zitounti_file(%L::uuid)', current_setting('test.cz_person_b')),
  'forbidden');

-- Nor their own file through the staff door: a buyer is not staff, whoever the file belongs to.
select pg_temp.cz_expect(
  format('select public.staff_zitounti_file(%L::uuid)', current_setting('test.cz_person_a')),
  'forbidden');

do $$
begin
  -- AND THEY CANNOT EVEN LEARN THE ID. public.persons is narrowed to staff since 0002, so a client session
  -- reads no rows at all — not their own, and certainly not another buyer's. The uuid a parameter would need
  -- is not obtainable from this session in the first place.
  assert (select count(*) from public.persons) = 0,
    'a client session reads no row of public.persons — RLS narrows it to staff';
  assert (select count(*) from public.interest_requests) = 0,
    'nor any interest request; the file is reached through the function, never the tables';
end $$;

reset role;

-- The proof from the other side: signed in as client B, the SAME call with the SAME text returns B's file.
-- Identity comes from the session and from nothing else.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_ub'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_f jsonb := public.my_zitounti_file();
begin
  assert v_f->'person'->>'id' = current_setting('test.cz_person_b'),
    'the identical statement returns a DIFFERENT file for a different session, got '
      || coalesce(v_f->'person'->>'id', 'null');
  assert v_f->'person'->>'id' <> current_setting('test.cz_person_a'),
    'and it is emphatically not client A''s';
  assert (v_f->'totals'->>'trees')::integer = 0,
    'B holds no trees, so B''s file shows none — A''s three did not leak into it, got '
      || coalesce(v_f->'totals'->>'trees', 'null');
  assert v_f->'person'->>'phone_e164' = current_setting('test.cz_phone_2'),
    'and B reads B''s phone number';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 4 · A visitor is refused by the GRANT, before a line of the body runs
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.cz_expect(
  $q$select public.my_zitounti_file()$q$,
  'permission denied for function my_zitounti_file');
reset role;

-- An `authenticated` role whose token carries no subject is a broken caller, not an attacker — and it is
-- still told which of the three things went wrong, because the screen redirects to the login for this one and
-- prints «اتصل بينا» for the next.
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.cz_expect($q$select public.my_zitounti_file()$q$, 'not_signed_in');
reset role;

-- A signed-in session with no person behind it — which is every STAFF session — gets `no_file` and not an
-- empty file. «You have nothing yet» and «there is no file under your account» are different sentences.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.cz_expect($q$select public.my_zitounti_file()$q$, 'no_file');
reset role;

-- ---------------------------------------------------------------------------
-- 5 · The module gate still closes it — and `internal` is the staging state
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'disabled' where key = 'zitounti';

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_ua'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.cz_expect($q$select public.my_zitounti_file()$q$, 'module_closed');
reset role;

-- THE THREE-STATE FLAG, DOING REAL WORK. app.module_open answers app.is_staff() for 'internal', so on that
-- state the Back Office reads client files and NO BUYER CAN OPEN THEIRS. That is how the owner checks a few
-- real files before the door opens to everybody, and it costs nothing because it is the flag's own semantics.
update public.feature_flags set state = 'internal' where key = 'zitounti';

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_ua'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.cz_expect($q$select public.my_zitounti_file()$q$, 'module_closed');
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert public.staff_zitounti_file(current_setting('test.cz_person_a')::uuid)->'person'->>'id'
         = current_setting('test.cz_person_a'),
    'on `internal` the staff door is open while the client door is shut — that is the staging state';
end $$;
reset role;

update public.feature_flags set state = 'public' where key = 'zitounti';

-- ---------------------------------------------------------------------------
-- 6 · ONE PAYLOAD, TWO DOORS — and the two fields that do not cross
-- ---------------------------------------------------------------------------

-- The client UI is being written against «the same payload shape as staff_zitounti_file, so one component
-- draws both». That promise is only worth anything if a test holds it, so this section reads the SAME person
-- through BOTH doors and compares the objects.

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.cz_staff_file',
  public.staff_zitounti_file(current_setting('test.cz_person_a')::uuid)::text, true);
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cz_ua'), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('test.cz_my_file', public.my_zitounti_file()::text, true);
reset role;

do $$
declare
  v_staff jsonb := current_setting('test.cz_staff_file')::jsonb;
  v_mine  jsonb := current_setting('test.cz_my_file')::jsonb;
begin
  -- THE SHAPE. Every section, named the same, in both files.
  assert pg_temp.cz_keys(v_staff) = pg_temp.cz_keys(v_mine),
    'the two doors return the same set of sections, so one component draws both. staff='
      || pg_temp.cz_keys(v_staff)::text || ' mine=' || pg_temp.cz_keys(v_mine)::text;

  -- THE CONTENT, stronger than the shape and only assertable because `now()` is fixed for the transaction:
  -- outside `person`, the two payloads are the SAME OBJECT. Not «the same fields» — identical. That is what
  -- «there is one assembly» means, and if somebody ever forks the body again, this line goes red.
  assert (v_staff - 'person') = (v_mine - 'person'),
    'outside the person block the client''s file and the Back Office''s file are byte for byte the same object — there is one assembly, not two';

  -- WHAT DOES NOT CROSS. Both fields exist on the staff side with real values, so the assertions below prove
  -- something is being withheld rather than that it was never there.
  assert (v_staff->'person' ? 'status_ar') and v_staff->'person'->>'status_ar' = 'CRM Opinion Only',
    'staff read the CRM lead status, which is what makes the next assertion mean anything (got '
      || coalesce(v_staff->'person'->>'status_ar', 'null') || ')';
  assert v_staff->'person'->>'assigned_to' = 'Commercial Zitounti Only',
    'and staff read who holds the file, got ' || coalesce(v_staff->'person'->>'assigned_to', 'null');

  assert not (v_mine->'person' ? 'status_ar'),
    'THE CLIENT IS NOT SHOWN THE CRM''S OPINION OF THEM. A lead status like «غير مهتم حالياً» is written by a commercial for a commercial; on the buyer''s own screen it is a harm.';
  assert not (v_mine->'person' ? 'assigned_to'),
    'nor the commercial''s name: the assignment changes without telling the client, and it is another person''s data inside a payload keyed by the buyer';

  -- Not just absent from `person` — absent from the WHOLE payload. A field can be dropped in one place and
  -- still ride along in another, and only a scan of everything catches that.
  assert v_mine::text not like '%Commercial Zitounti Only%',
    'the commercial''s name appears NOWHERE in what the buyer receives';
  assert v_mine::text not like '%CRM Opinion Only%',
    'and neither does the lead status label, anywhere in the payload';

  -- The allowlist, stated once so a reader can see what a buyer does get.
  assert pg_temp.cz_keys(v_mine->'person') = array[
           'archived', 'created_at', 'delegation', 'email', 'full_name',
           'governorate', 'has_account', 'id', 'phone_e164', 'whatsapp_e164'],
    'the buyer reads exactly their own record and nothing else, got ' || pg_temp.cz_keys(v_mine->'person')::text;

  -- And it really is the staff object minus exactly those two — no third field quietly missing from the
  -- client's screen, which would be a bug in the other direction.
  assert pg_temp.cz_keys(v_mine->'person')
         = (select coalesce(array_agg(k order by k), '{}')
              from jsonb_object_keys(v_staff->'person') k
             where k <> all (array['status_ar', 'assigned_to'])),
    'the client''s person block is the staff''s MINUS exactly status_ar and assigned_to — nothing else was lost';
end $$;

-- The projection itself, as a unit: an ALLOWLIST, so a thirteenth field added to app.zitounti_person
-- tomorrow does not reach a buyer's screen because it happened to be in the object.
do $$
declare
  v_in  jsonb := jsonb_build_object(
           'id', gen_random_uuid(), 'full_name', 'فلان', 'phone_e164', '+21600000000',
           'status_ar', 'غير مهتم حالياً', 'assigned_to', 'Commercial',
           'internal_score', 92, 'do_not_call', true);
  v_out jsonb := app.zitounti_person_client(v_in);
begin
  assert v_out ? 'full_name' and v_out ? 'phone_e164', 'the client''s own record crosses';
  assert not (v_out ? 'status_ar') and not (v_out ? 'assigned_to'), 'the two staff fields do not';
  assert not (v_out ? 'internal_score') and not (v_out ? 'do_not_call'),
    'AND NEITHER DOES A FIELD NOBODY HAS THOUGHT ABOUT YET. That is the difference between an allowlist and a delete list, and it is why this function is written the way it is.';
end $$;
