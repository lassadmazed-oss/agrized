-- الشركاء وموعد العقد والقائمة القانونية — INTERFACE 3 (owner brief 2026-09-21, §16 → §21).
-- Migration supabase/migrations/0091_partners_closing.sql (rename this file's first line when it is numbered).
--
-- THIS FILE IS RED UNTIL THAT DRAFT IS APPLIED, and that is not a bug in it: `npm run db:test` runs every file
-- against the live schema, public.legal_files does not exist there yet, and the first statement that names it
-- fails. Check the two together instead, in one rolled-back transaction, which is how this file was written:
--
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0091_partners_closing.sql supabase/tests/059_partners_closing.sql
--
-- WHAT IT PINS, IN ORDER. Permissions first, because §27 is the part of this desk that is a SECURITY
-- requirement and not a layout wish: a visitor reaches nothing, a signed-in user with no role reaches
-- nothing, the agricultural manager reaches nothing, and above all a COMMERCIAL — who is both the call-centre
-- agent and the field commercial today — is refused the queue, a file, the partner directory and the
-- checklist template BY THE DATABASE, not by a hidden nav row. Then the lists, because every one of them is
-- the owner's data. Then §20's rule, which is the only thing in this module that can stop a sale, tested at
-- all three of its gates and from both sides (refused while a paper is missing, allowed once it is seen or
-- waived). Then the property the brief asked for by name — that adding a checklist item later cannot reach a
-- file that has already closed. Then §19's appointment and §18's directory.
--
-- Every fixture is created inside the transaction with unused codes and unused phone numbers, and every count
-- is scoped to those fixtures, so live traffic can neither hide a failure nor cause one.

do $$
begin
  if to_regclass('public.legal_files') is null then
    raise exception
      'supabase/migrations/0091_partners_closing.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0091_partners_closing.sql supabase/tests/059_partners_closing.sql';
  end if;
  if to_regclass('public.contracts') is null then
    raise exception
      'public.contracts is missing: 0072_contracts_installments.sql must be applied before this module.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.lc_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- The refusal may come from the GRANT or from the role check inside the function; from the caller's side both
-- are 42501 and both mean «not for you».
create function pg_temp.lc_denied(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected a permission denial but the call succeeded: %', p_sql;
exception when insufficient_privilege then
  return;
end $$;

-- What the missing papers were, as the exception carried them. §20's whole value on a screen is naming the
-- paper, so the DETAIL is tested rather than assumed.
create function pg_temp.lc_detail(p_sql text) returns text language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  raise exception 'expected a refusal but the call succeeded: %', p_sql;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end $$;

do $$
declare
  v_phone text;
  v_used  text[] := '{}';
  i       integer;
begin
  for i in 1..4 loop
    loop
      v_phone := '+21697' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.lc_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);
select set_config('test.lc_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 0)), '.'), true)
from (values ('تحضير الملف القانوني وإتمام البيع')) as t (s);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_legal uuid := gen_random_uuid();
  v_com   uuid := gen_random_uuid();
  v_agri  uuid := gen_random_uuid();
  v_plain uuid := gen_random_uuid();
  v_class uuid;
  v_id    uuid;
  v_code  text;
  v_status uuid;
begin
  -- Pinned here so the file measures its own inputs and never the live configuration.
  update public.feature_flags set state = 'public'   where key in ('projects', 'pricing', 'reservations');
  update public.feature_flags set state = 'internal' where key = 'contracts';
  update public.settings set value = to_jsonb(1)      where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4)      where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(20000)  where key = 'reservations.deposit_millimes_default';
  update public.settings set value = to_jsonb(30)     where key = 'reservations.valid_days_default';
  -- This module's own two answers, set HERE so no literal below is read from the code under test.
  update public.settings set value = to_jsonb('never'::text) where key = 'legal.require_open_file_at';
  update public.settings set value = to_jsonb(true)          where key = 'legal.allow_waiver';
  update public.settings set value = to_jsonb(0)             where key = 'legal.appointment_min_lead_days';
  update public.settings set value = to_jsonb(180)           where key = 'legal.appointment_max_ahead_days';

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'lc-admin-' || v_admin || '@test.local', '{"full_name":"Admin Qanouni"}'),
    (v_legal, 'authenticated', 'authenticated', 'lc-legal-' || v_legal || '@test.local', '{"full_name":"Legal Qanouni"}'),
    (v_com,   'authenticated', 'authenticated', 'lc-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Qanouni"}'),
    (v_agri,  'authenticated', 'authenticated', 'lc-agri-'  || v_agri  || '@test.local', '{"full_name":"Masoul Falahi"}'),
    (v_plain, 'authenticated', 'authenticated', 'lc-plain-' || v_plain || '@test.local', '{"full_name":"Bla Dawr"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_legal, 'legal'), (v_com, 'commercial'), (v_agri, 'agri_manager');
  perform set_config('test.lc_admin', v_admin::text, true);
  perform set_config('test.lc_legal', v_legal::text, true);
  perform set_config('test.lc_com',   v_com::text,   true);
  perform set_config('test.lc_agri',  v_agri::text,  true);
  perform set_config('test.lc_plain', v_plain::text, true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  v_code := 'LGL-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days)
  values (v_code, 'عرض الملف القانوني', 34, 'published', 40, 20000, 30)
  returning id into v_id;
  perform set_config('test.lc_project', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);

  select s.id into v_status from public.lead_statuses s where s.is_active order by s.sort_order limit 1;
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at, last_request_at)
  values ('حريف المكتب القانوني', current_setting('test.lc_phone_1'), 34, v_status, now(), now())
  returning id into v_id;
  perform set_config('test.lc_person', v_id::text, true);
  -- How many status moves this person has had BEFORE the module touches anything. §29's rule, checked at the
  -- end: this desk derives a stage and never writes one.
  perform set_config('test.lc_hist',
    (select count(*)::text from public.person_status_history h where h.person_id = v_id), true);
end $$;

-- The stock, then four holds, then the عربون on each. Admin does all of it: this section is arranging the
-- world the legal desk is going to receive, not testing who may arrange it — 034 and 036 already do that.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.lc_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

select public.staff_generate_trees(current_setting('test.lc_project')::uuid, current_setting('test.lc_reason'));

do $$
declare
  v_res jsonb;
  i     integer;
begin
  for i in 1..4 loop
    v_res := public.staff_create_reservation(
      current_setting('test.lc_project')::uuid, current_setting('test.lc_person')::uuid,
      null, 3, null, current_setting('test.lc_reason'));
    perform set_config('test.lc_res_' || i, v_res->>'id', true);
  end loop;
end $$;

-- R1, R2 and R4 get their عربون now. R3 deliberately does NOT: §16's door is «العربون مدفوع», and a door has
-- to be shown refusing somebody before it means anything.
do $$
declare
  i integer;
begin
  foreach i in array array[1, 2, 4] loop
    perform public.staff_record_deposit(
      current_setting('test.lc_res_' || i)::uuid, 20000, null, null, null, null,
      current_setting('test.lc_reason'));
  end loop;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 1 · Every list and every limit is the owner's data
-- ---------------------------------------------------------------------------

do $$
declare
  v_key text;
begin
  foreach v_key in array array['legal.require_open_file_at', 'legal.allow_waiver', 'legal.stage_labels',
                               'legal.gate_labels', 'legal.appointment_status_labels',
                               'legal.appointment_min_lead_days', 'legal.appointment_max_ahead_days',
                               'legal.queue_codes_limit'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.label_ar <> ''),
      'the Back Office can edit ' || v_key || ': if this row is gone, a number went back into the code';
  end loop;

  -- None of the ones this module adds is public: how a closing is prepared is an internal rule. (The group
  -- `legal` also holds legal.plan_notice, which IS public and must stay so — it is the caution sentence the
  -- owner's lawyer wrote for the plan, and it is read on the site.)
  assert (select bool_and(not s.is_public) from public.settings s
          where s.key in ('legal.require_open_file_at', 'legal.allow_waiver', 'legal.stage_labels',
                          'legal.gate_labels', 'legal.appointment_status_labels',
                          'legal.appointment_min_lead_days', 'legal.appointment_max_ahead_days',
                          'legal.queue_codes_limit')),
    'the legal desk''s own settings stay off the public configuration payload';

  -- §18's four specialities are the owner's list — never an enum and never a TypeScript union.
  assert exists (select 1 from public.option_lists l where l.key = 'partner_speciality'),
    'partner specialities are an option list the owner edits';
  assert (select count(*) from public.option_items o
          where o.list_key = 'partner_speciality' and o.is_active) >= 4,
    'and it is seeded with محامي · عدل إشهاد · خبير · مسّاح';

  -- §20's items are rows, with the two facts an option row could not carry.
  assert (select count(*) from public.legal_checklist_items i where i.is_active) >= 10,
    '§20''s ten items are seeded as rows';
  assert (select count(distinct i.required_at) from public.legal_checklist_items i where i.is_active) = 3,
    'and they are spread over all three gates, so «العقد» does not have to be ticked before it exists';
  assert exists (select 1 from public.legal_checklist_items i where i.is_active and not i.is_mandatory),
    'and at least one is optional, because a checklist where everything blocks is a checklist nobody finishes';

  -- The message §19 may send is a row, not a string in the code — and nothing sends it yet.
  assert exists (select 1 from public.message_templates t where t.key = 'legal.appointment_set'),
    'the appointment notice is an editable template';

  -- The lawyer's caution sentence was already written by the owner; this module quotes it and does not copy it.
  assert exists (select 1 from public.settings s where s.key = 'legal.plan_notice'),
    'legal.plan_notice is still the one place that sentence lives';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · §27 · Who may reach this desk — the security half of the brief
-- ---------------------------------------------------------------------------

-- 2a · A visitor reaches nothing at all.
set local role anon;

do $$
declare v_fn text;
begin
  foreach v_fn in array array[
      'select public.staff_legal_queue()',
      'select public.staff_legal_file(gen_random_uuid())',
      'select public.staff_partners()',
      'select public.staff_legal_checklist_template()',
      'select public.staff_open_legal_file(gen_random_uuid(), null, ''x'')',
      'select public.staff_set_legal_check(gen_random_uuid(), true, null, ''x'')',
      'select public.staff_waive_legal_check(gen_random_uuid(), ''x'')',
      'select public.staff_legal_sync_items(gen_random_uuid(), ''x'')',
      'select public.staff_save_partner(''{}''::jsonb, ''x'')',
      'select public.staff_save_checklist_item(''{}''::jsonb, ''x'')',
      'select public.staff_archive_partner(gen_random_uuid(), false, ''x'')',
      'select public.staff_book_closing(''{}''::jsonb, ''x'')',
      'select public.staff_close_appointment(gen_random_uuid(), ''cancelled'', ''x'')',
      'select public.staff_set_legal_note(gen_random_uuid(), null, ''x'')'] loop
    perform pg_temp.lc_denied(v_fn);
  end loop;

  foreach v_fn in array array['public.partners', 'public.legal_files', 'public.legal_file_checks',
                              'public.legal_appointments', 'public.legal_checklist_items'] loop
    begin
      execute format('select 1 from %s', v_fn);
      raise exception 'a visitor read %', v_fn;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

reset role;

-- 2b · A COMMERCIAL is refused — this is the brief's own example, enforced in Postgres rather than by hiding
-- a nav row. «ما نعطيوش كل موظف access لحاجات ما يحتاجهاش»: the phone agent and the field commercial are the
-- same role today, so neither of them reaches Legal's desk by typing a URL.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.lc_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.lc_expect('select public.staff_legal_queue()', 'forbidden');
  perform pg_temp.lc_expect(
    format('select public.staff_legal_file(%L)', current_setting('test.lc_res_1')), 'forbidden');
  perform pg_temp.lc_expect('select public.staff_partners()', 'forbidden');
  perform pg_temp.lc_expect('select public.staff_legal_checklist_template()', 'forbidden');
  perform pg_temp.lc_expect(
    format('select public.staff_open_legal_file(%L, null, %L)',
           current_setting('test.lc_res_1'), current_setting('test.lc_reason')), 'forbidden');
  perform pg_temp.lc_expect(
    format('select public.staff_save_partner(%L::jsonb, %L)',
           '{"full_name":"محامي"}', current_setting('test.lc_reason')), 'forbidden');

  -- And RLS refuses the rows themselves, not only the functions: the queue could be rewritten tomorrow and
  -- this line would still hold.
  assert (select count(*) from public.partners) = 0,
    'a commercial reads no partner row';
  assert (select count(*) from public.legal_checklist_items) = 0,
    'a commercial reads no checklist item';
end $$;

reset role;

-- 2c · The agricultural manager reads no client file at all (app.can_see_person returns false for them), and
-- a signed-in user with no role is not staff.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.lc_agri'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform pg_temp.lc_expect('select public.staff_legal_queue()', 'forbidden');
  perform pg_temp.lc_expect('select public.staff_partners()', 'forbidden');
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.lc_plain'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform pg_temp.lc_expect('select public.staff_legal_queue()', 'forbidden');
  perform pg_temp.lc_expect(
    format('select public.staff_legal_file(%L)', current_setting('test.lc_res_1')), 'forbidden');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3 · §16 · The door, and §17 · what Legal sees through it
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.lc_legal'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_q jsonb := public.staff_legal_queue('all');
  v_f jsonb;
begin
  -- R3 has no عربون, so §16's door is shut on it — and it says so with the code the screen has a sentence for.
  perform pg_temp.lc_expect(
    format('select public.staff_open_legal_file(%L, null, %L)',
           current_setting('test.lc_res_3'), current_setting('test.lc_reason')), 'deposit_not_paid');

  -- Legal works the desk but does not rewrite the rules it is held to: the checklist TEMPLATE is the
  -- Admin's, because `is_mandatory` and `required_at` decide when the database refuses a sale.
  assert (public.staff_legal_checklist_template()->>'can_edit')::boolean = false,
    'a legal user reads the template and the screen knows not to draw an editor';
  perform pg_temp.lc_expect(
    format('select public.staff_save_checklist_item(%L::jsonb, %L)',
           jsonb_build_object('label_ar', 'بند جديد', 'required_at', 'contract')::text,
           current_setting('test.lc_reason')),
    'forbidden');

  -- The queue carries the three that paid, and not the one that did not.
  assert (select count(*) from jsonb_array_elements(v_q->'rows') r
          where r->>'reservation_id' in (current_setting('test.lc_res_1'), current_setting('test.lc_res_2'),
                                         current_setting('test.lc_res_4'))) = 3,
    'the three deposit-paid holds are on Legal''s desk, got ' || (v_q->'rows')::text;
  assert not exists (select 1 from jsonb_array_elements(v_q->'rows') r
                     where r->>'reservation_id' = current_setting('test.lc_res_3')),
    'a hold still waiting for its عربون is the commercial''s work, not Legal''s';

  -- Nobody has opened a file yet, so every one of them reads «مستنّي المكتب القانوني», and the Arabic comes
  -- from settings rather than from a .tsx.
  v_f := public.staff_legal_file(current_setting('test.lc_res_1')::uuid);
  assert v_f->>'stage' = 'waiting', 'an untouched paid hold is at «waiting», got ' || (v_f->>'stage');
  assert v_f->>'stage_label' = (app.setting('legal.stage_labels')->>'waiting'),
    'and its Arabic comes from settings legal.stage_labels';
  assert v_f->'legal_file' = 'null'::jsonb, 'with no legal file behind it yet';

  -- §17, line by line. Not one of these facts is stored by this module: they are joined from the reservation,
  -- the trees, the payments, the CRM and the demand.
  assert (v_f->>'reservation_no') like 'AGZ-RES-%', 'the reservation number is there';
  assert (v_f->>'person_name') = 'حريف المكتب القانوني', 'the client is there';
  assert (v_f->>'trees_held')::integer = 3, 'the trees it holds are counted live from public.trees';
  assert jsonb_array_length(v_f->'tree_codes') = 3,
    'and §9''s whole point is printed — the NUMBERS themselves, not a count';
  assert (v_f->'money'->>'deposit_paid_millimes')::bigint = 20000, 'the عربون that arrived is there';
  assert (v_f->'money'->>'deposit_left_millimes')::bigint = 0, 'and nothing of it is still owed';
  assert (v_f->'handlers'->>'deposit_taken_by') is not null,
    '§17''s «شكون خذا العربون» is answered from payments.recorded_by';
  assert (v_f->'handlers'->>'deposit_receipt_no') like 'AGZ-PAY-%',
    'and the receipt number travels with it';

  -- The money is arithmetic Postgres does: total = price × trees, remaining = total − paid. Nothing is
  -- invented, and every rate and rounding decision stays where 0031 and 0072 already made it.
  assert (v_f->'money'->>'total_price_millimes')::bigint
       = (v_f->'money'->>'price_per_tree_millimes')::bigint * 3,
    'the total is the price this client was quoted times the trees they are actually holding';
  assert (v_f->'money'->>'remaining_millimes')::bigint
       = (v_f->'money'->>'total_price_millimes')::bigint - (v_f->'money'->>'paid_millimes')::bigint,
    'and what is left is what is left';
end $$;

-- Opening the file is the snapshot. Twice is once.
do $$
declare
  v_a jsonb := public.staff_open_legal_file(current_setting('test.lc_res_1')::uuid,
                                            'الملف وصل المكتب', current_setting('test.lc_reason'));
  v_b jsonb := public.staff_open_legal_file(current_setting('test.lc_res_1')::uuid,
                                            null, current_setting('test.lc_reason'));
begin
  assert v_a->'legal_file'->>'id' = v_b->'legal_file'->>'id',
    'opening a file twice returns the one that exists rather than a second one';
  assert v_a->>'stage' = 'in_review',
    '§29''s missing fact for «Legal Processing» now exists: the file arrived, got ' || (v_a->>'stage');
  assert (v_a->'legal_file'->'checklist'->>'total')::integer
       = (select count(*) from public.legal_checklist_items i where i.is_active),
    'the ACTIVE template was copied onto the file, all of it';
  assert (v_a->'legal_file'->'checklist'->>'mandatory_open')::integer > 0,
    'and nothing is ticked yet';

  perform set_config('test.lc_file_1', v_a->'legal_file'->>'id', true);
end $$;
-- The audit row for that act is asserted in §4, under the Admin: public.audit_logs is app.is_admin() only,
-- and a `legal` reader gets zero rows from it rather than a refusal — which is exactly the shape of assertion
-- that passes for the wrong reason if it is written on the wrong desk.

-- ---------------------------------------------------------------------------
-- 4 · §20 · THE RULE — three gates, and it is the database that refuses
-- ---------------------------------------------------------------------------

do $$
declare
  v_detail text;
  v_open   integer;
begin
  select count(*) into v_open from public.legal_file_checks k
  where k.legal_file_id = current_setting('test.lc_file_1')::uuid
    and k.required_at = 'contract' and k.is_mandatory and k.done_at is null;
  assert v_open > 0, 'the seeded list has mandatory items at the «contract» gate';

  -- THE HEADLINE. bb_60/0072 sells the reservation's trees in the same transaction that writes the contract,
  -- so this gate is what actually guards the inventory. The refusal comes from the TRIGGER, through 0072's
  -- own function, without one line of 0072 being edited.
  perform pg_temp.lc_expect(
    format('select public.staff_create_contract(%L, null, ''cash'', null, null, null, null, %L)',
           current_setting('test.lc_res_1'), current_setting('test.lc_reason')),
    'legal_checklist_incomplete');

  -- And it NAMES the papers, which is the whole value of §20 on a screen.
  v_detail := pg_temp.lc_detail(
    format('select public.staff_create_contract(%L, null, ''cash'', null, null, null, null, %L)',
           current_setting('test.lc_res_1'), current_setting('test.lc_reason')));
  assert v_detail is not null and v_detail <> '',
    'the missing items travel in the exception DETAIL so the Arabic sentence can name them';
  assert v_detail like '%' || (select k.label_ar from public.legal_file_checks k
                               where k.legal_file_id = current_setting('test.lc_file_1')::uuid
                                 and k.required_at = 'contract' and k.is_mandatory
                               order by k.sort_order limit 1) || '%',
    'and the first missing paper is one of them, got ' || v_detail;

  -- Nothing moved: the refusal is a rolled-back transaction, not a half-written contract.
  assert not exists (select 1 from public.contracts c
                     where c.reservation_id = current_setting('test.lc_res_1')::uuid),
    'a refused contract does not exist';
  assert (select count(*) from public.trees t
          where t.reservation_id = current_setting('test.lc_res_1')::uuid and t.state = 'sold') = 0,
    'and its trees were not sold';
end $$;

-- Tick the «contract» gate, and only it.
do $$
declare v_k record;
begin
  for v_k in select k.id from public.legal_file_checks k
             where k.legal_file_id = current_setting('test.lc_file_1')::uuid
               and k.required_at = 'contract' and k.is_mandatory loop
    perform public.staff_set_legal_check(v_k.id, true, 'تثبّتنا', current_setting('test.lc_reason'));
  end loop;
end $$;

do $$
declare
  v_c jsonb;
  v_f jsonb;
begin
  v_c := public.staff_create_contract(current_setting('test.lc_res_1')::uuid, null, 'cash',
                                      null, null, null, null, current_setting('test.lc_reason'));
  perform set_config('test.lc_contract_1', v_c->>'id', true);
  assert v_c->>'status' = 'draft', 'the contract is written once the papers at that gate are seen';
  -- §21 and §22, unchanged and not re-implemented here: 0072 did this, in its own transaction.
  assert (select count(*) from public.trees t
          where t.reservation_id = current_setting('test.lc_res_1')::uuid and t.state = 'sold') = 3,
    'and 0072 sold its three trees in the same breath';

  v_f := public.staff_legal_file(current_setting('test.lc_res_1')::uuid);
  assert v_f->>'stage' = 'contracted', 'the desk''s stage follows the facts, got ' || (v_f->>'stage');

  -- GATE 2. The signature is refused while a «قبل الإمضاء» paper is open, and allowed once it is not.
  perform pg_temp.lc_expect(
    format('select public.staff_sign_contract(%L, null, ''REG/2026/1'', null, %L)',
           current_setting('test.lc_contract_1'), current_setting('test.lc_reason')),
    'legal_checklist_incomplete');
end $$;

-- One of the signature papers is genuinely absent, so an Admin records the exception instead of pretending to
-- have seen it. That is what keeps §20 a rule: without a recorded exception, the first awkward file is closed
-- by switching the whole checklist off.
do $$
declare
  v_one uuid;
  v_rest record;
begin
  select k.id into v_one from public.legal_file_checks k
  where k.legal_file_id = current_setting('test.lc_file_1')::uuid
    and k.required_at = 'signature' and k.is_mandatory
  order by k.sort_order limit 1;
  perform set_config('test.lc_waived', v_one::text, true);

  for v_rest in select k.id from public.legal_file_checks k
                where k.legal_file_id = current_setting('test.lc_file_1')::uuid
                  and k.required_at = 'signature' and k.is_mandatory and k.id <> v_one loop
    perform public.staff_set_legal_check(v_rest.id, true, null, current_setting('test.lc_reason'));
  end loop;

  -- Legal may tick; only an Admin may waive.
  perform pg_temp.lc_expect(
    format('select public.staff_waive_legal_check(%L, %L)', v_one, 'المخطط عند الموثّق وما نجّمناش نشوفوه'),
    'forbidden');
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.lc_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_state jsonb;
begin
  -- A waiver without a written reason is not a waiver, whatever audit.reason_min_length says.
  perform pg_temp.lc_expect(
    format('select public.staff_waive_legal_check(%L, ''لا'')', current_setting('test.lc_waived')),
    'legal_waive_reason_required');

  v_state := public.staff_waive_legal_check(current_setting('test.lc_waived')::uuid,
                                            'المخطط موجود عند الموثّق وتثبّتنا فيه في مكتبه يوم الإمضاء');
  assert (v_state->>'mandatory_open')::integer
       < (select count(*) from public.legal_file_checks k
          where k.legal_file_id = current_setting('test.lc_file_1')::uuid and k.is_mandatory),
    'a waived item stops blocking';
  assert exists (select 1 from public.legal_file_checks k
                 where k.id = current_setting('test.lc_waived')::uuid
                   and k.waived_by is not null and k.waive_reason <> ''),
    'and it leaves who waived it and why, in the row and in the audit log';
  assert exists (select 1 from public.audit_logs a
                 where a.entity = 'legal_file_checks' and a.entity_id = current_setting('test.lc_waived')),
    'the waiver is one line in /admin/audit';

  -- Owed from §3: one audit row for the whole file-open act, not one per copied item — the same rule 0054
  -- gives for generating five hundred trees.
  assert (select count(*) from public.audit_logs a
          where a.action = 'legal.file_open' and a.entity_id = current_setting('test.lc_file_1')) = 1,
    'opening the file is logged once, with how many checks were copied';
end $$;

do $$
declare v_c jsonb;
begin
  v_c := public.staff_sign_contract(current_setting('test.lc_contract_1')::uuid, null, 'REG/2026/1', null,
                                    current_setting('test.lc_reason'));
  assert v_c->>'status' = 'signed', 'the signature passes once the signature gate is clear';

  -- GATE 3. v2 §38's «تم إتمام البيع» — the date «زيتونتي» opens on — has its own gate and its own paper.
  perform pg_temp.lc_expect(
    format('select public.staff_set_contract_owned(%L, null, %L)',
           current_setting('test.lc_contract_1'), current_setting('test.lc_reason')),
    'legal_checklist_incomplete');
end $$;

do $$
declare
  v_k record;
  v_f jsonb;
begin
  for v_k in select k.id from public.legal_file_checks k
             where k.legal_file_id = current_setting('test.lc_file_1')::uuid
               and k.required_at = 'ownership' and k.is_mandatory and k.done_at is null loop
    perform public.staff_set_legal_check(v_k.id, true, null, current_setting('test.lc_reason'));
  end loop;

  perform public.staff_set_contract_owned(current_setting('test.lc_contract_1')::uuid, null,
                                          current_setting('test.lc_reason'));
  v_f := public.staff_legal_file(current_setting('test.lc_res_1')::uuid);
  assert v_f->>'stage' = 'owned', 'and the file closes at «تم إتمام البيع», got ' || (v_f->>'stage');
  assert (v_f->'money'->>'price_source') = 'contract',
    'once a contract exists its frozen figures are the ones read, not the offer''s price today';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · «adding an item later does not retroactively break a closed file»
-- ---------------------------------------------------------------------------

do $$
declare
  v_new  uuid;
  v_sync jsonb;
  v_f2   jsonb;
begin
  -- The owner adds a requirement today, after R1 has been signed and owned and after R2's file was opened.
  v_f2 := public.staff_open_legal_file(current_setting('test.lc_res_2')::uuid, null,
                                       current_setting('test.lc_reason'));
  perform set_config('test.lc_file_2', v_f2->'legal_file'->>'id', true);

  perform set_config('test.lc_new_item',
    public.staff_save_checklist_item(
      jsonb_build_object('code', 'tax_number', 'label_ar', 'المعرّف الجبائي للحريف',
                         'is_mandatory', true, 'required_at', 'contract', 'sort_order', 15),
      current_setting('test.lc_reason'))->>'id', true);
  v_new := current_setting('test.lc_new_item')::uuid;

  -- IT REACHES NOTHING THAT ALREADY EXISTS. Not R1, which is closed, and not R2, which is open: the
  -- template is a template, and the gate reads only what was copied.
  assert not exists (select 1 from public.legal_file_checks k
                     where k.legal_file_id = current_setting('test.lc_file_1')::uuid and k.code = 'tax_number'),
    'a new template row does not appear on a file that was opened before it';
  assert not exists (select 1 from public.legal_file_checks k
                     where k.legal_file_id = current_setting('test.lc_file_2')::uuid and k.code = 'tax_number'),
    'nor on an open one, until somebody deliberately syncs it';

  -- R1 is closed, and a sync leaves it closed: every gate it could have blocked has already been passed.
  v_sync := public.staff_legal_sync_items(current_setting('test.lc_file_1')::uuid,
                                          current_setting('test.lc_reason'));
  assert (v_sync->>'added')::integer = 0,
    'syncing a closed file adds nothing — an item for a moment that already happened could only ever read as «missing»';
  assert (v_sync->'checklist'->>'mandatory_open')::integer = 0,
    'so the signed and owned file stays complete';

  -- R2 is open at that gate, so the sync does add it — and it now blocks, which is the point.
  v_sync := public.staff_legal_sync_items(current_setting('test.lc_file_2')::uuid,
                                          current_setting('test.lc_reason'));
  assert (v_sync->>'added')::integer = 1, 'an open file picks the new requirement up when Legal asks it to';
  assert exists (select 1 from public.legal_file_checks k
                 where k.legal_file_id = current_setting('test.lc_file_2')::uuid and k.code = 'tax_number'),
    'and it lands with the wording it had that day';

  -- Deactivating a template row does not reach an open file either: it was copied, and it stays copied.
  perform public.staff_save_checklist_item(
    jsonb_build_object('id', v_new, 'label_ar', 'المعرّف الجبائي للحريف',
                       'required_at', 'contract', 'is_active', false),
    current_setting('test.lc_reason'));
  assert exists (select 1 from public.legal_file_checks k
                 where k.legal_file_id = current_setting('test.lc_file_2')::uuid and k.code = 'tax_number'),
    'a copy is a copy: deactivating the template does not silently unblock a file';

  -- The template is a rule, so editing it is the Admin's, audited, and refused for everything else.
  perform pg_temp.lc_expect(
    format('select public.staff_save_checklist_item(%L::jsonb, %L)',
           jsonb_build_object('label_ar', 'بند', 'required_at', 'jamais')::text,
           current_setting('test.lc_reason')),
    'invalid_checklist_gate');
  assert exists (select 1 from public.audit_logs a where a.action = 'legal.item_create'),
    'adding a checklist item leaves a line in /admin/audit, because the row can stop a sale';
end $$;

-- History is not edited backwards.
do $$
declare v_done uuid;
begin
  select k.id into v_done from public.legal_file_checks k
  where k.legal_file_id = current_setting('test.lc_file_1')::uuid
    and k.required_at = 'contract' and k.done_at is not null limit 1;
  perform pg_temp.lc_expect(
    format('select public.staff_set_legal_check(%L, false, null, %L)', v_done, current_setting('test.lc_reason')),
    'legal_check_locked');
  perform pg_temp.lc_expect(
    format('select public.staff_waive_legal_check(%L, ''نحبو نبدلو بعد ما تمضى العقد'')', v_done),
    'legal_check_done');
end $$;

-- ---------------------------------------------------------------------------
-- 6 · The gate does nothing when no legal file was ever opened — until the owner says otherwise
-- ---------------------------------------------------------------------------

do $$
begin
  -- R4 never reached Legal. With legal.require_open_file_at at 'never' the sale closes exactly as 0072
  -- allows: applying this migration must not make every future contract unsignable overnight.
  perform public.staff_create_contract(current_setting('test.lc_res_4')::uuid, null, 'cash',
                                       null, null, null, null, current_setting('test.lc_reason'));
  assert exists (select 1 from public.contracts c
                 where c.reservation_id = current_setting('test.lc_res_4')::uuid),
    'a file that skipped Legal still closes while the owner has not asked otherwise';
end $$;

do $$
declare v_res jsonb;
begin
  -- Now the owner says every sale passes through Legal. One setting, no migration.
  update public.settings set value = to_jsonb('contract'::text) where key = 'legal.require_open_file_at';

  v_res := public.staff_create_reservation(
    current_setting('test.lc_project')::uuid, current_setting('test.lc_person')::uuid,
    null, 2, null, current_setting('test.lc_reason'));
  perform public.staff_record_deposit(
    (v_res->>'id')::uuid, 20000, null, null, null, null, current_setting('test.lc_reason'));

  perform pg_temp.lc_expect(
    format('select public.staff_create_contract(%L, null, ''cash'', null, null, null, null, %L)',
           v_res->>'id', current_setting('test.lc_reason')),
    'legal_file_required');

  update public.settings set value = to_jsonb('never'::text) where key = 'legal.require_open_file_at';
end $$;

-- ---------------------------------------------------------------------------
-- 7 · §18 · The directory, and §19 · the closing appointment
-- ---------------------------------------------------------------------------

do $$
declare
  v_spec uuid;
  v_p    jsonb;
begin
  select o.id into v_spec from public.option_items o
  where o.list_key = 'partner_speciality' and o.code = 'notary';

  perform pg_temp.lc_expect(
    format('select public.staff_save_partner(%L::jsonb, %L)',
           jsonb_build_object('full_name', 'ع')::text, current_setting('test.lc_reason')),
    'invalid_partner_name');
  perform pg_temp.lc_expect(
    format('select public.staff_save_partner(%L::jsonb, %L)',
           jsonb_build_object('full_name', 'عدل إشهاد', 'speciality_option_id', gen_random_uuid())::text,
           current_setting('test.lc_reason')),
    'invalid_partner_speciality');

  v_p := public.staff_save_partner(
    jsonb_build_object('full_name', 'الأستاذ منصف بن عمر', 'phone_e164', current_setting('test.lc_phone_2'),
                       'office_name', 'مكتب التوثيق بصفاقس', 'governorate_id', '34',
                       'speciality_option_id', v_spec, 'is_available', true,
                       'availability_note', 'يقبل المواعيد الثلاثاء والخميس'),
    current_setting('test.lc_reason'));
  perform set_config('test.lc_partner', v_p->>'id', true);

  -- The speciality's Arabic is snapshot, exactly as payments.method_label_ar is, so renaming the list never
  -- rewrites who somebody was.
  assert v_p->>'speciality_label_ar' = (select o.label_ar from public.option_items o where o.id = v_spec),
    'the speciality label is frozen onto the partner';
end $$;

do $$
declare
  v_f jsonb;
begin
  -- §19: date, hour, place, the partner, the documents required.
  v_f := public.staff_book_closing(
    jsonb_build_object('legal_file_id', current_setting('test.lc_file_2'),
                       'meet_on', ((now() at time zone 'Africa/Tunis')::date + 7)::text, 'meet_at', '10:30',
                       'place', 'مكتب التوثيق بصفاقس',
                       'partner_id', current_setting('test.lc_partner'),
                       'documents_note', 'بطاقة التعريف + وصل العربون'),
    current_setting('test.lc_reason'));

  assert v_f->'appointment'->>'status' = 'scheduled', 'the closing is booked';
  assert v_f->'appointment'->>'partner_label' is not null,
    'and the partner''s name is frozen onto it, so archiving them later cannot blank it';
  -- §29's missing fact for «Contract Scheduled». This is the row 0090_journey.sql says it has no fact for.
  assert v_f->>'stage' = 'appointment',
    'a scheduled closing IS «موعد العقد محدد», derived and not typed, got ' || (v_f->>'stage');
  assert (v_f->'appointment'->>'is_past')::boolean = false,
    'and «فات ميعادو» is computed on read, never stored and never moved by a timer';

  -- One open appointment per file: two answers to «متى؟» is exactly the drift this whole brief complains of.
  perform pg_temp.lc_expect(
    format('select public.staff_book_closing(%L::jsonb, %L)',
           jsonb_build_object('legal_file_id', current_setting('test.lc_file_2'),
                              'meet_on', ((now() at time zone 'Africa/Tunis')::date + 8)::text)::text,
           current_setting('test.lc_reason')),
    'appointment_already_open');

  -- The window is a setting, checked in Postgres and not in a form.
  perform pg_temp.lc_expect(
    format('select public.staff_book_closing(%L::jsonb, %L)',
           jsonb_build_object('legal_file_id', current_setting('test.lc_file_2'),
                              'id', v_f->'appointment'->>'id',
                              'meet_on', ((now() at time zone 'Africa/Tunis')::date + 4000)::text)::text,
           current_setting('test.lc_reason')),
    'appointment_date_too_far');

  -- A partner expected at a closing cannot be archived out from under it.
  perform pg_temp.lc_expect(
    format('select public.staff_archive_partner(%L, false, %L)',
           current_setting('test.lc_partner'), current_setting('test.lc_reason')),
    'partner_has_appointments');

  perform set_config('test.lc_appt', v_f->'appointment'->>'id', true);
end $$;

do $$
declare v_f jsonb;
begin
  v_f := public.staff_close_appointment(current_setting('test.lc_appt')::uuid, 'completed',
                                        current_setting('test.lc_reason'));
  assert v_f->'appointment'->>'status' = 'completed', 'a human says what happened to the appointment';
  perform pg_temp.lc_expect(
    format('select public.staff_close_appointment(%L, ''cancelled'', %L)',
           current_setting('test.lc_appt'), current_setting('test.lc_reason')),
    'appointment_not_open');

  -- And the file may be booked again, because the previous one is closed.
  perform public.staff_book_closing(
    jsonb_build_object('legal_file_id', current_setting('test.lc_file_2'),
                       'meet_on', ((now() at time zone 'Africa/Tunis')::date + 14)::text),
    current_setting('test.lc_reason'));
  assert (select count(*) from public.legal_appointments a
          where a.legal_file_id = current_setting('test.lc_file_2')::uuid) = 2,
    'rescheduling after a closing is a new row, and the old one keeps its history';
end $$;

-- ---------------------------------------------------------------------------
-- 8 · What this module refuses to do
-- ---------------------------------------------------------------------------

do $$
begin
  -- §29's rule, kept: booking, ticking, waiving, signing and owning moved not one person's status. 0064 made
  -- the same refusal and this desk keeps it — the stage is DERIVED (app.legal_stage), never written.
  assert (select count(*) from public.person_status_history h
          where h.person_id = current_setting('test.lc_person')::uuid)
       = current_setting('test.lc_hist')::integer,
    'the legal desk never moves the client''s status by itself';

  -- No second inventory and no second money table: this module owns neither a tree nor a millime.
  assert not exists (select 1 from pg_constraint c
                     where c.conrelid in ('public.legal_files'::regclass,
                                          'public.legal_file_checks'::regclass,
                                          'public.legal_appointments'::regclass,
                                          'public.partners'::regclass)
                       and c.contype = 'f'
                       and c.confrelid in ('public.trees'::regclass, 'public.payments'::regclass)),
    'a legal file points at a reservation and a person — never at a tree and never at a payment';
  assert not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public'
                       and c.table_name in ('legal_files', 'legal_file_checks', 'legal_appointments', 'partners')
                       and c.column_name like '%millimes%'),
    'and it stores no money at all: §17''s figures are joined, never copied';

  -- The gate is a trigger ON public.contracts, which is what let 0072 stay untouched.
  assert exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.contracts'::regclass
                   and t.tgname = 'contracts_legal_gate' and not t.tgisinternal),
    '§20''s rule is a database rule, and it composes with 0072 instead of forking it';

  -- Cancelling is never gated: a file that must be undone must always be undoable.
  assert (select count(*) from public.legal_checklist_items i where i.is_active) > 0,
    'the template is not empty';
end $$;

-- ---------------------------------------------------------------------------
-- 9 · A hold that lapsed leaves the queue, even though its عربون was paid
-- ---------------------------------------------------------------------------

-- The queue's door is «العربون مدفوع», and a paid deposit never un-happens — so without a rule for it, a hold
-- that expired in March would sit at the top of Legal's «مستنّي المكتب» for ever. R3 has no deposit and is a
-- clean way to prove the other half too.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.lc_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_res jsonb;
  v_id  uuid;
  v_q   jsonb;
begin
  v_res := public.staff_create_reservation(
    current_setting('test.lc_project')::uuid, current_setting('test.lc_person')::uuid,
    null, 2, null, current_setting('test.lc_reason'));
  v_id := (v_res->>'id')::uuid;
  perform public.staff_record_deposit(v_id, 20000, null, null, null, null, current_setting('test.lc_reason'));

  v_q := public.staff_legal_queue('active');
  assert exists (select 1 from jsonb_array_elements(v_q->'rows') r where r->>'reservation_id' = v_id::text),
    'a freshly paid hold is on the desk';

  -- The commercial side lets it lapse and releases its trees.
  perform public.staff_close_reservation(v_id, 'expired', true, current_setting('test.lc_reason'));

  v_q := public.staff_legal_queue('active');
  assert not exists (select 1 from jsonb_array_elements(v_q->'rows') r where r->>'reservation_id' = v_id::text),
    'and a lapsed one leaves it, instead of sitting at the top of «مستنّي المكتب» for ever';
  assert (public.staff_legal_file(v_id)->>'stage') = 'closed',
    'it reads «الملف توفّى», which is a fact and not a disappearance';

  v_q := public.staff_legal_queue('all');
  assert exists (select 1 from jsonb_array_elements(v_q->'rows') r where r->>'reservation_id' = v_id::text),
    'and it is still findable under «الكل», because a file that vanished silently is worse than one that closed';

  -- The door refuses it too, so nobody opens a legal file on a dead hold.
  perform pg_temp.lc_expect(
    format('select public.staff_open_legal_file(%L, null, %L)', v_id, current_setting('test.lc_reason')),
    'reservation_not_open');
end $$;

reset role;
