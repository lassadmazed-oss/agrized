-- العقود ووعد البيع + الأقساط: a reservation becomes a contract, and a contract becomes a schedule that
-- money is recorded against. Report v3 §28-§31, cahier v2 §34-§36 and §38.
-- Migration supabase/pending/bb_60_contracts_installments.sql (rename this file's first line when it is
-- numbered). The task asked for 044; 044_offers_filter_copy.sql already exists, so this file is 045.
--
-- Runs against the live database inside a rolled-back transaction: offers with unused codes, fresh staff
-- accounts, unused phone numbers, and every setting and flag it measures pinned INSIDE the transaction. Every
-- count is scoped to the fixtures, so real traffic can neither hide a failure nor cause one.
--
-- PERMISSIONS FIRST, because this module sells inventory and takes money. Sections 1-3 answer: who may call
-- what, what a visitor gets (nothing), whether a commercial can sign or collect (no, not even on their own
-- file), and whether «معطّل» actually closes the acts rather than only hiding a link.
--
-- THEN THE ARITHMETIC THE SNAPSHOT EXISTS FOR. Section 6 asserts, on real numbers, that a schedule built as
-- monthly × duration_months would overcharge the client — which is the reason the contract freezes all ten
-- keys of app.financed_quote instead of storing a monthly and a duration.

do $$
begin
  if to_regclass('public.contracts') is null then
    raise exception
      'supabase/pending/bb_60_contracts_installments.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_60_contracts_installments.sql supabase/tests/045_contracts_installments.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.ct_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

create function pg_temp.ct_payload(p_project text, p_trees text, p_phone text) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف العقد',
    'phone_e164', p_phone,
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', p_project,
    'trees', p_trees)
$$;

create function pg_temp.ct_state(p_project uuid, p_state text) returns integer language sql as $$
  select count(*)::integer from public.trees t where t.project_id = p_project and t.state::text = p_state
$$;

-- The money picture of one contract, read straight from the deriving function rather than through a screen.
-- security definer because app.contract_money is revoked from everybody: the RPCs are the only public door,
-- and this file looks behind it on purpose.
create function pg_temp.ct_money(p_contract uuid) returns jsonb
language sql security definer as $$
  select app.contract_money(p_contract)
$$;

-- The offer's own computed price for one tree, the same figure app.tree_price hands the offer page.
-- security definer for the same reason ct_money is.
create function pg_temp.ct_tree_price(p_project uuid) returns bigint
language sql security definer as $$
  select (app.tree_price((select pc.spacing_class_id from public.project_spacing_classes pc
                          where pc.project_id = p_project limit 1),
                         p_project)->>'price_per_tree_millimes')::bigint
$$;

create function pg_temp.ct_method() returns uuid language sql as $$
  select o.id from public.option_items o where o.list_key = 'payment_method' and o.is_active
  order by o.sort_order limit 1
$$;

do $$
declare
  v_phone text;
  i       integer;
  v_used  text[] := '{}';
begin
  for i in 1..4 loop
    loop
      v_phone := '+21697' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.ct_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);
select set_config('test.ct_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 0)), '.'), true)
from (values ('تحويل حجز لعقد بعد موافقة الحريف')) as t (s);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_com   uuid := gen_random_uuid();
  v_fin   uuid := gen_random_uuid();
  v_legal uuid := gen_random_uuid();
  v_agri  uuid := gen_random_uuid();
  v_plain uuid := gen_random_uuid();
  v_class uuid;
  v_id    uuid;
  v_code  text;
  v_st    uuid;
begin
  -- Pinned here so the file measures its own inputs and never the live configuration.
  update public.feature_flags set state = 'public'
   where key in ('projects', 'pricing', 'reservations', 'contracts', 'installments');
  update public.settings set value = to_jsonb(1)      where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4)      where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(3)      where key = 'antispam.max_requests_per_phone_per_day';
  update public.settings set value = to_jsonb(0)      where key = 'reservations.deposit_millimes_default';
  update public.settings set value = to_jsonb(0)      where key = 'reservations.valid_days_default';
  -- The stage-3 rules the spec refuses to fix. Set HERE, never read from a literal in the code under test.
  update public.settings set value = to_jsonb(true)   where key = 'contracts.require_deposit_paid';
  update public.settings set value = to_jsonb(false)  where key = 'contracts.deposit_counts_toward_down_payment';
  update public.settings set value = to_jsonb('manual'::text) where key = 'installments.first_due_rule';
  update public.settings set value = to_jsonb(0)      where key = 'installments.first_due_offset_days';
  update public.settings set value = to_jsonb(0)      where key = 'installments.grace_days_after';
  update public.settings set value = to_jsonb(3)      where key = 'installments.reminder_days_before';
  update public.settings set value = to_jsonb(1)      where key = 'installments.late_stage1_missed';
  update public.settings set value = to_jsonb(2)      where key = 'installments.late_stage2_missed';

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'ctr-admin-' || v_admin || '@test.local', '{"full_name":"Admin Aqd"}'),
    (v_com,   'authenticated', 'authenticated', 'ctr-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Aqd"}'),
    (v_fin,   'authenticated', 'authenticated', 'ctr-fin-'   || v_fin   || '@test.local', '{"full_name":"Finance Aqd"}'),
    (v_legal, 'authenticated', 'authenticated', 'ctr-leg-'   || v_legal || '@test.local', '{"full_name":"Qanouni Aqd"}'),
    (v_agri,  'authenticated', 'authenticated', 'ctr-agri-'  || v_agri  || '@test.local', '{"full_name":"Masoul Falahi"}'),
    (v_plain, 'authenticated', 'authenticated', 'ctr-plain-' || v_plain || '@test.local', '{"full_name":"Bla Dawr"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_com, 'commercial'), (v_fin, 'finance'),
    (v_legal, 'legal'), (v_agri, 'agri_manager');
  perform set_config('test.ct_admin', v_admin::text, true);
  perform set_config('test.ct_com',   v_com::text,   true);
  perform set_config('test.ct_fin',   v_fin::text,   true);
  perform set_config('test.ct_legal', v_legal::text, true);
  perform set_config('test.ct_agri',  v_agri::text,  true);
  perform set_config('test.ct_plain', v_plain::text, true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  -- A · the financed offer. It asks for a عربون, so the contract cannot be written before the money arrives.
  v_code := 'CTR-A-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days)
  values (v_code, 'عرض بالتقسيط', 34, 'published', 30, 25000, 10) returning id into v_id;
  perform set_config('test.ct_a', v_id::text, true);
  perform set_config('test.ct_a_code', v_code, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  -- The roundings app.financed_quote reads are pinned on the offer itself, so the arithmetic asserted in §6
  -- is this file's own and never the live global rule's.
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes, monthly_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000, 1000);
  -- A 12-month markup for THIS offer: the global table has none, so nothing here leans on live pricing data.
  insert into public.financing_markups (project_id, months, markup_bp) values (v_id, 12, 1000);

  -- B · the cash offer. No deposit, no deadline: a reservation on it opens already settled.
  v_code := 'CTR-B-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days)
  values (v_code, 'عرض بالحاضر', 34, 'published', 20, 0, 0) returning id into v_id;
  perform set_config('test.ct_b', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes, monthly_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000, 1000);

  -- A second client, inside the commercial's file, so «a commercial may read their own and still may not
  -- sign it» is tested as a refusal and not as an empty result.
  select s.id into v_st from public.lead_statuses s
  where s.stage = 'new' and s.is_active order by s.is_stage_default desc, s.sort_order limit 1;
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at, last_request_at, assigned_to)
  values ('حريفة الكوميرسيال', current_setting('test.ct_phone_2'), 34, v_st, now(), now(), v_com)
  returning id into v_id;
  perform set_config('test.ct_p2', v_id::text, true);
end $$;

-- The stock has to exist before anything can be held.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_generate_trees(current_setting('test.ct_a')::uuid, current_setting('test.ct_reason'));
select public.staff_generate_trees(current_setting('test.ct_b')::uuid, current_setting('test.ct_reason'));
reset role;

-- The demand behind the reservation, taken by the real offer intake, then given the plan snapshot the offer
-- form writes. A contract COPIES these; it never reads them back afterwards.
do $$
declare
  v jsonb;
  v_id uuid;
  v_person uuid;
begin
  v := public.submit_offer_request(
         pg_temp.ct_payload(current_setting('test.ct_a'), '3', current_setting('test.ct_phone_1')));
  select r.id, r.person_id into v_id, v_person
  from public.interest_requests r where r.request_no = v->>'request_no';
  perform set_config('test.ct_request', v_id::text, true);
  perform set_config('test.ct_p1', v_person::text, true);

  update public.interest_requests r
     set price_per_tree_millimes = 100000,
         payment_mode = 'installments',
         down_payment_amount_millimes = 140000,
         down_payment_percent = 20,
         duration_months = 12
   where r.id = v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · Every business value is a setting, not a constant
-- ---------------------------------------------------------------------------

do $$
declare
  v_key text;
begin
  foreach v_key in array array['contract_no.prefix', 'contracts.require_deposit_paid',
                               'contracts.deposit_counts_toward_down_payment', 'contracts.status_labels',
                               'installments.first_due_rule', 'installments.first_due_offset_days',
                               'installments.grace_days_after', 'installments.reminder_days_before',
                               'installments.late_stage1_missed', 'installments.late_stage2_missed',
                               'installments.line_status_labels', 'installments.stage_labels'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.label_ar <> ''),
      'every threshold §31 names is a setting, not a constant: ' || v_key || ' is missing';
  end loop;

  -- None of them is public: what a client owes is said on their own file, not shipped in the site config.
  assert not exists (select 1 from public.settings s
                     where (s.key like 'contracts.%' or s.key like 'installments.%') and s.is_public),
    'contract and instalment settings are internal';

  -- The «شهرين» of §31 is a discussion the report itself replaced. Nothing may carry it as a value.
  assert (select (value #>> '{}')::integer from public.settings where key = 'installments.late_stage1_missed') = 1
     and (select (value #>> '{}')::integer from public.settings where key = 'installments.late_stage2_missed') = 2,
    'the two stages of §31 are seeded as counts of missed instalments, not as days';

  -- The first due date is «ask», not «guess»: the shipped answer is the one that refuses to assume.
  assert (select value #>> '{}' from public.settings where key = 'installments.first_due_rule') = 'manual',
    'installments.first_due_rule ships as «manual» so the software never invents a due date';

  -- v3 §28 names two documents and never says how one becomes the other, so the kind is the owner's list.
  assert exists (select 1 from public.option_lists l where l.key = 'contract_kind'),
    'the kind of contract is an option list the owner extends';
  assert (select count(*) from public.option_items o where o.list_key = 'contract_kind' and o.is_active) >= 2,
    'seeded with «عقد وعد بالبيع» and «العقد النهائي»';
  -- §30's channels stay the list 0063 already seeded; no second list of payment methods was created.
  assert (select count(*) from public.option_lists l where l.key like '%payment%method%') = 1,
    'there is exactly one list of payment methods, and stage 3 reuses it';

  -- §32's five moments have templates; none of them may claim delivery, because nothing sends.
  assert (select count(*) from public.message_templates t
          where t.key in ('contract.ready', 'contract.signed', 'installment.due_soon',
                          'installment.late', 'payment.received')) = 5,
    '§32''s five stage-3 notifications have templates to be enqueued with';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Who may call what
-- ---------------------------------------------------------------------------

-- 2a · A visitor gets nothing at all.
set local role anon;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
      'select public.staff_contracts()',
      'select public.staff_contract(gen_random_uuid())',
      'select public.staff_person_contracts(gen_random_uuid())',
      'select public.staff_installments()',
      'select public.staff_create_contract(gen_random_uuid(), null, null, null, null, null, null, ''x'')',
      'select public.staff_sign_contract(gen_random_uuid(), null, null, null, ''x'')',
      'select public.staff_generate_schedule(gen_random_uuid(), ''x'')',
      'select public.staff_record_installment(gen_random_uuid(), null, ''installment'', 1000, null, null, null, null, ''x'')',
      'select public.staff_update_installment(gen_random_uuid(), null, null, null, ''x'')',
      'select public.staff_cancel_contract(gen_random_uuid(), true, ''x'')',
      'select public.staff_set_contract_owned(gen_random_uuid(), null, ''x'')'] loop
    begin
      execute v_fn;
      raise exception 'a visitor reached %', v_fn;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    perform 1 from public.contracts;
    raise exception 'a visitor read public.contracts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.contract_installments;
    raise exception 'a visitor read public.contract_installments';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- 2b · A signed-in user with no staff role is not staff.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_plain'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.ct_expect('select public.staff_contracts()', 'forbidden');
  perform pg_temp.ct_expect('select public.staff_installments()', 'forbidden');
  perform pg_temp.ct_expect(
    format('select public.staff_person_contracts(%L)', current_setting('test.ct_p1')), 'forbidden');
  assert (select count(*) from public.contracts) = 0, 'RLS shows a role-less user no contract';
  assert (select count(*) from public.contract_installments) = 0, 'and no schedule either';
end $$;

reset role;

-- 2c · The agricultural manager keeps stock and reads no client file, so they reach no contract at all.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_agri'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  assert (public.staff_contracts()->>'matched')::integer = 0,
    'the agri manager reads no client file, so the contract list is empty for them';
  perform pg_temp.ct_expect(
    format('select public.staff_person_contracts(%L)', current_setting('test.ct_p1')), 'forbidden');
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3 · «معطّل» closes the acts, not just the link
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'disabled' where key in ('contracts', 'installments');

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.ct_expect(
    format('select public.staff_create_contract(%L, null, null, null, null, null, null, %L)',
           gen_random_uuid(), current_setting('test.ct_reason')), 'module_closed');
  perform pg_temp.ct_expect(
    format('select public.staff_sign_contract(%L, null, null, null, %L)',
           gen_random_uuid(), current_setting('test.ct_reason')), 'module_closed');
  perform pg_temp.ct_expect(
    format('select public.staff_cancel_contract(%L, true, %L)',
           gen_random_uuid(), current_setting('test.ct_reason')), 'module_closed');
  perform pg_temp.ct_expect(
    format('select public.staff_set_contract_owned(%L, null, %L)',
           gen_random_uuid(), current_setting('test.ct_reason')), 'module_closed');
  perform pg_temp.ct_expect(
    format('select public.staff_generate_schedule(%L, %L)',
           gen_random_uuid(), current_setting('test.ct_reason')), 'module_closed');
  perform pg_temp.ct_expect(
    format('select public.staff_record_installment(%L, null, ''installment'', 1000, null, null, null, null, %L)',
           gen_random_uuid(), current_setting('test.ct_reason')), 'module_closed');
  perform pg_temp.ct_expect(
    format('select public.staff_update_installment(%L, null, null, null, %L)',
           gen_random_uuid(), current_setting('test.ct_reason')), 'module_closed');

  -- The READERS keep answering and say which state the flag is in: the Back Office is where a module is
  -- prepared before it is published.
  assert public.staff_contracts()->>'module_state' = 'disabled',
    'the contract list still answers while the module is off, and says it is off';
  assert public.staff_installments()->>'module_state' = 'disabled',
    'and so does the instalment queue';
  assert public.staff_person_contracts(current_setting('test.ct_p1')::uuid)->>'module_state' = 'disabled',
    'and so does the client file reader';
end $$;

reset role;

update public.feature_flags set state = 'public' where key in ('contracts', 'installments');

-- ---------------------------------------------------------------------------
-- 4 · §23 → §34 · The hold, the عربون, and the contract that converts it
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_create_reservation(
         current_setting('test.ct_a')::uuid, current_setting('test.ct_p1')::uuid,
         current_setting('test.ct_request')::uuid, 7, 'حجز سبع زيتونات', current_setting('test.ct_reason'));
  perform set_config('test.ct_res_a', v->>'id', true);
  assert v->>'status' = 'awaiting_deposit' and (v->>'trees_held')::integer = 7,
    'the hold opens awaiting its عربون, holding seven trees, got ' || v::text;
end $$;

reset role;

-- 4a · contracts.require_deposit_paid is a setting, and while it is on the money has to arrive first.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.ct_expect(
    format('select public.staff_create_contract(%L, null, null, null, null, null, null, %L)',
           current_setting('test.ct_res_a'), current_setting('test.ct_reason')), 'deposit_not_paid');
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_record_deposit(current_setting('test.ct_res_a')::uuid, 25000, pg_temp.ct_method(),
                                   null, 'REC-001', null, current_setting('test.ct_reason'));
reset role;

-- 4b · The act itself, by an Admin.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- Every plan input left null: they are taken from the demand behind the reservation, which is what
  -- «snapshot what was agreed» means when the client answered the offer form.
  v := public.staff_create_contract(
         current_setting('test.ct_res_a')::uuid, null, null, null, null, pg_temp.ct_method(),
         'عقد بعد موافقة', current_setting('test.ct_reason'));
  perform set_config('test.ct_c_a', v->>'id', true);

  assert v->>'reference_no' like 'AGZ-CTR-%',
    'a contract carries its own number from its own prefix setting, got ' || coalesce(v->>'reference_no', 'null');
  assert v->>'status' = 'draft' and v->>'signed_on' is null,
    'it starts as a draft: the signature is a date a human enters, never inferred, got ' || v::text;
  assert v->>'status_label' <> 'draft', 'and its Arabic comes from settings, not from the code';
  assert v->>'kind_label' = 'عقد وعد بالبيع',
    'v3 §28''s document, taken from the option list, got ' || coalesce(v->>'kind_label', 'null');

  -- THE SNAPSHOT. 100,000 per tree × 7 trees, 20 % down, 12 months at 10 % on the financed part.
  assert (v->>'price_per_tree_millimes')::bigint = 100000
     and (v->>'total_price_millimes')::bigint = 700000,
    'the total is the quoted price per tree times the trees actually taken, got ' || v::text;
  assert (v->>'payment_mode') = 'installments' and (v->>'duration_months')::integer = 12,
    'the mode and the duration come from the demand when the form is not asked again, got ' || v::text;
  assert (v->>'markup_bp')::integer = 1000
     and (v->>'remaining_millimes')::bigint = 616000
     and (v->>'total_financed_millimes')::bigint = 756000
     and (v->>'monthly_millimes')::bigint = 52000
     and (v->>'last_installment_millimes')::bigint = 44000
     and (v->>'plan_installments_count')::integer = 12,
    'all ten keys of app.financed_quote are frozen onto the contract, got ' || v::text;

  -- The عربون stays beside the down payment and is never folded into it while the owner has not said so.
  assert (v->'money'->>'deposit_credited_millimes')::bigint = 0
     and (v->'money'->>'down_payment_due_millimes')::bigint = 140000
     and (v->>'reservation_deposit_millimes')::bigint = 25000,
    'with contracts.deposit_counts_toward_down_payment off, the two amounts stay separate, got ' || v::text;

  -- §29: no schedule before the contract is signed, and the screen is told so rather than shown an empty table.
  assert (v->'money'->>'installments_count')::integer = 0 and (v->>'schedule_pending')::boolean = true,
    'the schedule comes after the signature, got ' || v::text;
  assert (v->'money'->>'stage') = 'idle', 'and a contract with no schedule has no lateness stage';
end $$;

reset role;

-- 4c · The three facts one transaction had to write together.
do $$
declare
  v_res uuid := current_setting('test.ct_res_a')::uuid;
  v_c   uuid := current_setting('test.ct_c_a')::uuid;
  v_r   public.reservations;
begin
  select * into v_r from public.reservations r where r.id = v_res;

  -- (b) the doorway 0063 left, and the constraint it is bound by.
  assert v_r.status = 'converted', 'the reservation became a contract, got ' || v_r.status::text;
  assert v_r.closed_at is not null,
    'reservations_closed_check is a biconditional: converted and closed_at move together';
  assert v_r.trees_released = false,
    'converting does not release trees, it sells them';

  -- (c) the inventory, in the same transaction.
  assert (select count(*) from public.trees t where t.reservation_id = v_res and t.state = 'sold') = 7,
    'the seven held trees became sold';
  assert (select count(*) from public.trees t where t.reservation_id = v_res and t.state = 'reserved') = 0,
    'and none is still merely reserved';
  assert pg_temp.ct_state(current_setting('test.ct_a')::uuid, 'available') = 23,
    'the offer''s stock moved by exactly seven, got '
    || pg_temp.ct_state(current_setting('test.ct_a')::uuid, 'available') || ' available';
  -- The link survives the sale, so a contract can read its own trees (the unlink trigger fires on
  -- 'available' only).
  assert not exists (select 1 from public.trees t
                     where t.reservation_id = v_res
                       and (t.held_by is null or t.request_id is null or t.allocated_at is null)),
    'selling keeps the holder, the demand and the date the allocation wrote';

  -- §58/§51: the act is named in the log, with who, why, and the quote it froze inside it.
  assert exists (select 1 from public.audit_logs a
                 where a.action = 'contracts.create' and a.entity_id = v_c::text
                   and a.actor_id = current_setting('test.ct_admin')::uuid
                   and a.reason = current_setting('test.ct_reason')
                   and (a.new_data->'quote'->>'installments_count')::integer = 12
                   and (a.new_data->>'trees_sold')::integer = 7),
    'writing a contract leaves one named audit event carrying the quote it snapshotted';

  -- §32 «العقد جاهز» was enqueued and nothing claims it was delivered.
  assert exists (select 1 from public.notification_outbox n
                 where n.related_entity = 'contracts' and n.related_id = v_c
                   and n.template_key = 'contract.ready' and n.status = 'pending'),
    'the «العقد جاهز» notification is enqueued, pending, and never reported as sent';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · A reservation converts once, and only from a live hold
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- v2 §49 is singular: the same hold cannot produce a second contract.
  perform pg_temp.ct_expect(
    format('select public.staff_create_contract(%L, null, null, null, null, null, null, %L)',
           current_setting('test.ct_res_a'), current_setting('test.ct_reason')),
    'reservation_not_convertible');

  -- A cancelled hold is not a contract in waiting.
  v := public.staff_create_reservation(
         current_setting('test.ct_b')::uuid, current_setting('test.ct_p1')::uuid, null, 2, null,
         current_setting('test.ct_reason'));
  perform set_config('test.ct_res_dead', v->>'id', true);
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_close_reservation(current_setting('test.ct_res_dead')::uuid, 'cancelled', true,
                                      current_setting('test.ct_reason'));
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.ct_expect(
    format('select public.staff_create_contract(%L, null, null, null, null, null, null, %L)',
           current_setting('test.ct_res_dead'), current_setting('test.ct_reason')),
    'reservation_not_convertible');
end $$;

reset role;

-- 5b · A commercial may read their own file and may neither sign it nor take money for it (0054/0063).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_create_reservation(
         current_setting('test.ct_b')::uuid, current_setting('test.ct_p2')::uuid, null, 3, null,
         current_setting('test.ct_reason'));
  perform set_config('test.ct_res_com', v->>'id', true);

  -- Their own client, their own hold — and still not their desk.
  perform pg_temp.ct_expect(
    format('select public.staff_create_contract(%L, null, ''cash'', null, null, null, null, %L)',
           current_setting('test.ct_res_com'), current_setting('test.ct_reason')), 'forbidden');
  perform pg_temp.ct_expect(
    format('select public.staff_record_installment(%L, null, ''down_payment'', 1000, null, null, null, null, %L)',
           current_setting('test.ct_c_a'), current_setting('test.ct_reason')), 'forbidden');

  -- And another commercial's file is invisible, not merely unwritable.
  perform pg_temp.ct_expect(
    format('select public.staff_person_contracts(%L)', current_setting('test.ct_p1')), 'forbidden');
  assert public.staff_contract(current_setting('test.ct_c_a')::uuid) is null,
    'a commercial cannot read a contract on a file that is not theirs';
  assert (public.staff_contracts()->>'matched')::integer = 0,
    'and the list shows them none of it';
end $$;

reset role;

-- 5c · A legal user signs and never collects (0063: «two different desks»).
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_legal'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.ct_expect(
    format('select public.staff_record_installment(%L, null, ''down_payment'', 1000, null, null, null, null, %L)',
           current_setting('test.ct_c_a'), current_setting('test.ct_reason')), 'forbidden');
  -- Cancelling puts inventory back, which is stock keeping: Legal is not in that list either.
  perform pg_temp.ct_expect(
    format('select public.staff_cancel_contract(%L, true, %L)',
           current_setting('test.ct_c_a'), current_setting('test.ct_reason')), 'forbidden');
  -- But reading the file they may see, and signing, is theirs.
  assert public.staff_contract(current_setting('test.ct_c_a')::uuid) is not null,
    'a legal user reads any client file (app.can_see_person)';
end $$;

reset role;

-- 5d · The readers answer POSITIVELY for someone who may see the file. Every refusal above is only worth
-- something if the same call returns rows for the right reader; an empty result must be proved to be a
-- refusal and not an empty table.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.staff_contracts('all', null, 100);
  w jsonb := public.staff_person_contracts(current_setting('test.ct_p1')::uuid);
begin
  assert (v->>'matched')::integer >= 1 and jsonb_array_length(v->'rows') >= 1,
    'the list shows an Admin the contracts they may see, got ' || coalesce(v->>'matched', 'null');
  assert v->'counts' ? 'draft' and v->'counts' ? 'late' and v->'counts' ? 'owned',
    'with the counts the screen''s filter bar is built from, got ' || (v->'counts')::text;
  assert exists (select 1 from jsonb_array_elements(v->'rows') r
                 where r->>'id' = current_setting('test.ct_c_a')),
    'including the one just written';
  assert v->>'installments_state' is not null,
    'and it reports BOTH flag states, because one screen shows both modules';

  assert jsonb_array_length(w->'contracts') >= 1,
    'the client file reader answers with that client''s contracts, got ' || w::text;
  assert (w->>'require_deposit_paid')::boolean is not null,
    'and says which rule the «اعمل عقد» button will be judged by';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 6 · §29 · The schedule: generated once, from the snapshot, never from a division
-- ---------------------------------------------------------------------------

-- 6a · The date the whole ladder counts from is asked for, not assumed.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_legal'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.ct_expect(
    format('select public.staff_sign_contract(%L, null, null, null, %L)',
           current_setting('test.ct_c_a'), current_setting('test.ct_reason')), 'first_due_date_required');
end $$;

reset role;

-- The owner chooses a rule instead: the same signature then needs no date at all. This is the setting doing
-- the work the code refuses to do on its own.
update public.settings set value = to_jsonb('signature_plus_month'::text) where key = 'installments.first_due_rule';

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_legal'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_sign_contract(current_setting('test.ct_c_a')::uuid,
                                  (now() at time zone 'Africa/Tunis')::date, 'ACTE 2026/114', null,
                                  current_setting('test.ct_reason'));

  assert v->>'status' = 'signed' and v->>'signed_on' is not null,
    'the signature is recorded as a date a human gave, got ' || v::text;
  assert v->>'legal_document_ref' = 'ACTE 2026/114',
    'v2 §34''s «Legal document reference» is the paper''s number, separate from our own AGZ-CTR number';
  assert (v->>'first_due_on')::date
         = ((now() at time zone 'Africa/Tunis')::date + interval '1 month')::date,
    'the rule the owner chose decided the first due date, got ' || coalesce(v->>'first_due_on', 'null');
  assert (v->>'schedule_pending')::boolean = false,
    '§29: the schedule is generated in the same transaction as the signature';
end $$;

reset role;

-- 6b · THE ARITHMETIC THE SNAPSHOT EXISTS FOR.
do $$
declare
  v_c     public.contracts;
  v_sum   bigint;
  v_n     integer;
  v_first bigint;
  v_last  bigint;
begin
  select * into v_c from public.contracts c where c.id = current_setting('test.ct_c_a')::uuid;
  select count(*)::integer, coalesce(sum(i.amount_millimes), 0)::bigint
  into v_n, v_sum from public.contract_installments i where i.contract_id = v_c.id;

  assert v_n = 12, 'one row per instalment, from the snapshot''s own count, got ' || v_n;
  assert v_sum = v_c.remaining_millimes,
    'the schedule sums to exactly what the contract froze: ' || v_sum || ' vs ' || v_c.remaining_millimes;

  select i.amount_millimes into v_first from public.contract_installments i
  where i.contract_id = v_c.id and i.seq = 1;
  select i.amount_millimes into v_last from public.contract_installments i
  where i.contract_id = v_c.id and i.seq = v_n;

  assert v_first = v_c.monthly_millimes, 'every line but the last is the monthly amount';
  assert v_last = v_c.last_installment_millimes and v_last <> v_first,
    'and the last one absorbs the rounding, which is why it is snapshotted: ' || v_last || ' vs ' || v_first;

  -- The whole point, stated as the failure it prevents: a schedule of monthly × duration_months would bill
  -- 624,000 against a financed remainder of 616,000 — eight dinars of overcharge on a seven-tree contract.
  assert v_c.monthly_millimes * v_c.duration_months > v_c.remaining_millimes,
    'this fixture must exercise the rounding, or §6 proves nothing';
  assert v_c.monthly_millimes * v_c.duration_months - v_sum = 8000,
    'a naive monthly × duration schedule would overcharge this client by exactly 8,000 millimes';

  -- Counted from one anchor, so a month never drifts.
  assert (select i.due_on from public.contract_installments i where i.contract_id = v_c.id and i.seq = 3)
         = (v_c.first_due_on + interval '2 months')::date,
    'due dates are the first due date plus n months, computed in Postgres';
end $$;

-- 6b-bis · RLS on the schedule, from the reader's side: Finance sees the twelve rows through the policy, and
-- the commercial whose file this is not sees none. Both halves, so neither result is an accident.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  assert (select count(*) from public.contract_installments i
          where i.contract_id = current_setting('test.ct_c_a')::uuid) = 12,
    'Finance reads the schedule of a file they may see';
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  assert (select count(*) from public.contract_installments i
          where i.contract_id = current_setting('test.ct_c_a')::uuid) = 0,
    'and a commercial reads nothing of a schedule on a file that is not theirs';
end $$;

reset role;

-- 6c · Generating is idempotent, the way staff_generate_trees is.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_generate_schedule(current_setting('test.ct_c_a')::uuid, current_setting('test.ct_reason'));
select public.staff_generate_schedule(current_setting('test.ct_c_a')::uuid, current_setting('test.ct_reason'));
reset role;

do $$
begin
  assert (select count(*) from public.contract_installments i
          where i.contract_id = current_setting('test.ct_c_a')::uuid) = 12,
    'running the generator three times produces one schedule';
end $$;

-- ---------------------------------------------------------------------------
-- 7 · §30 · Money reduces what is outstanding, and voiding gives it back
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v     jsonb;
  v_m   jsonb;
  v_i1  uuid;
begin
  v_m := pg_temp.ct_money(current_setting('test.ct_c_a')::uuid);
  assert (v_m->>'total_due_millimes')::bigint = 140000 + 616000
     and (v_m->>'total_paid_millimes')::bigint = 0,
    'before any money, the client owes the down payment plus the whole schedule, got ' || v_m::text;
  assert (v_m->'lines'->0->>'status') = 'unpaid', 'and the first line is unpaid';

  -- §34's «Down Payment», recorded as its own kind so §59's three receipts stay three receipts.
  v := public.staff_record_installment(current_setting('test.ct_c_a')::uuid, null, 'down_payment', 140000,
                                       pg_temp.ct_method(), null, 'VIR-77', null,
                                       current_setting('test.ct_reason'));
  assert (v->'money'->>'down_payment_left_millimes')::bigint = 0,
    'the down payment is settled, got ' || (v->'money')::text;
  assert (v->'money'->>'installments_paid_millimes')::bigint = 0,
    'and the down payment never leaks into the schedule';

  -- More than is owed is a keying mistake, not a credit.
  perform pg_temp.ct_expect(
    format('select public.staff_record_installment(%L, null, ''down_payment'', 1000, null, null, null, null, %L)',
           current_setting('test.ct_c_a'), current_setting('test.ct_reason')), 'amount_over_due');

  select i.id into v_i1 from public.contract_installments i
  where i.contract_id = current_setting('test.ct_c_a')::uuid and i.seq = 1;

  -- One month, tagged to the line Finance was collecting.
  v := public.staff_record_installment(current_setting('test.ct_c_a')::uuid, v_i1, 'installment', 52000,
                                       pg_temp.ct_method(), null, 'CHQ-12', null,
                                       current_setting('test.ct_reason'));
  perform set_config('test.ct_pay1', (
    select p.id::text from public.payments p
    where p.contract_id = current_setting('test.ct_c_a')::uuid and p.kind = 'installment'
    order by p.created_at desc limit 1), true);

  assert (v->'money'->'lines'->0->>'status') = 'paid'
     and (v->'money'->'lines'->0->>'paid_millimes')::bigint = 52000,
    'the first line is settled, got ' || (v->'money'->'lines'->0)::text;
  assert (v->'money'->'lines'->1->>'status') = 'unpaid', 'and the second is untouched';
  assert (v->'money'->>'installments_left_millimes')::bigint = 616000 - 52000,
    'what is left is a figure the database returned, never a sum a screen worked out, got ' || (v->'money')::text;
  -- §29 asks the line for a payment date, a method, a receipt and a bank reference: all four are the
  -- payments row, read through it rather than copied onto the line.
  assert (v->'money'->'lines'->0->'receipts'->0->>'reference') = 'CHQ-12'
     and (v->'money'->'lines'->0->'receipts'->0->>'reference_no') like 'AGZ-PAY-%',
    'the line shows its receipt without storing one, got ' || (v->'money'->'lines'->0->'receipts')::text;

  -- A client hands over two months in one transfer: the waterfall settles two lines, with no allocation table.
  v := public.staff_record_installment(current_setting('test.ct_c_a')::uuid, null, 'installment', 104000,
                                       pg_temp.ct_method(), null, 'VIR-78', null,
                                       current_setting('test.ct_reason'));
  assert (v->'money'->'lines'->1->>'status') = 'paid' and (v->'money'->'lines'->2->>'status') = 'paid'
     and (v->'money'->'lines'->3->>'status') = 'unpaid',
    'one payment covering two months settles exactly two lines, got ' || (v->'money'->'lines')::text;
  assert (v->'money'->>'installments_paid_count')::integer = 3,
    'three of twelve are paid';
end $$;

reset role;

-- 7b · Voiding reverses cleanly, with nothing to repair.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_void_payment(current_setting('test.ct_pay1')::uuid, current_setting('test.ct_reason'));

  -- The waterfall simply stops seeing the voided row: the money that remains still fills from the oldest line
  -- forward, so 104,000 now covers lines 1 and 2 and line 3 goes back to unpaid.
  assert (v->'money'->>'installments_paid_millimes')::bigint = 104000,
    'a voided receipt has never been paid, got ' || (v->'money')::text;
  assert (v->'money'->>'installments_paid_count')::integer = 2,
    'and the line it had settled goes back on its own, with no repair step';
  assert (v->'money'->'lines'->2->>'status') = 'unpaid',
    'the third line is open again, got ' || (v->'money'->'lines'->2)::text;

  perform pg_temp.ct_expect(
    format('select public.staff_void_payment(%L, %L)',
           current_setting('test.ct_pay1'), current_setting('test.ct_reason')), 'payment_already_void');

  -- The row is kept, never deleted (§59).
  assert exists (select 1 from public.payments p
                 where p.id = current_setting('test.ct_pay1')::uuid and p.voided_at is not null
                   and p.void_reason = current_setting('test.ct_reason')),
    'a mistake is voided and kept, so the audit trail holds both the mistake and the correction';
end $$;

reset role;

-- 7c · «تخلّص كامل» is derived: paying everything sets it, voiding one receipt takes it back.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v      jsonb;
  v_left bigint;
  v_last uuid;
begin
  v_left := (pg_temp.ct_money(current_setting('test.ct_c_a')::uuid)->>'installments_left_millimes')::bigint;
  v := public.staff_record_installment(current_setting('test.ct_c_a')::uuid, null, 'installment', v_left,
                                       pg_temp.ct_method(), null, 'VIR-99', null,
                                       current_setting('test.ct_reason'));
  assert v->>'status' = 'completed' and v->>'settled_at' is not null,
    'when the down payment and every line have arrived the contract settles, got ' || v::text;
  assert (v->'money'->>'stage') = 'settled' and (v->'money'->>'total_left_millimes')::bigint = 0,
    'and the stage says so, got ' || (v->'money')::text;
  -- Settlement is NOT ownership: v2 §38 separates them, and nothing here touched owned_at.
  assert v->>'owned_at' is null,
    'paying in full is not owning: v2 §38 puts ownership after the legal conditions, as its own act';

  select p.id into v_last from public.payments p
  where p.contract_id = current_setting('test.ct_c_a')::uuid and p.voided_at is null and p.kind = 'installment'
  order by p.created_at desc limit 1;

  v := public.staff_void_payment(v_last, current_setting('test.ct_reason'));
  assert v->>'status' = 'signed' and v->>'settled_at' is null,
    'voiding a receipt takes «تخلّص كامل» back with it, got ' || v::text;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 8 · §31 · Lateness is derived from the settings, and nothing is stored
-- ---------------------------------------------------------------------------

-- A second financed contract, signed in the past, so real lines are genuinely overdue. Nothing here moves the
-- clock and nothing writes a «late» flag: the stage is computed from due dates and live money every time.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_create_reservation(
         current_setting('test.ct_a')::uuid, current_setting('test.ct_p1')::uuid, null, 7, null,
         current_setting('test.ct_reason'));
  perform set_config('test.ct_res_late', v->>'id', true);
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_record_deposit(current_setting('test.ct_res_late')::uuid, 25000, pg_temp.ct_method(),
                                   null, 'REC-002', null, current_setting('test.ct_reason'));
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- No demand behind this hold, so the three plan answers are given explicitly — the walk-in path.
  v := public.staff_create_contract(current_setting('test.ct_res_late')::uuid, null, 'installments', 140000, 12,
                                    pg_temp.ct_method(), null, current_setting('test.ct_reason'));
  perform set_config('test.ct_c_late', v->>'id', true);
  -- No demand behind this hold, so the price is the offer's OWN live price — app.tree_price, the same
  -- function the offer page reads — times the trees taken. Never a figure typed by staff.
  assert (v->>'price_per_tree_millimes')::bigint = pg_temp.ct_tree_price(current_setting('test.ct_a')::uuid)
     and (v->>'total_price_millimes')::bigint = (v->>'price_per_tree_millimes')::bigint * 7,
    'with no demand, the price comes from the offer''s own app.tree_price, got ' || v::text;

  -- Signed 100 days ago with the first instalment 70 days ago: lines 1, 2 and 3 are past their dates.
  v := public.staff_sign_contract(current_setting('test.ct_c_late')::uuid,
                                  (now() at time zone 'Africa/Tunis')::date - 100, 'ACTE 2026/115',
                                  (now() at time zone 'Africa/Tunis')::date - 70,
                                  current_setting('test.ct_reason'));
  assert (v->'money'->>'installments_count')::integer = 12, 'its schedule exists';
end $$;

reset role;

do $$
declare
  v_m jsonb;
begin
  v_m := pg_temp.ct_money(current_setting('test.ct_c_late')::uuid);
  assert (v_m->>'missed_count')::integer = 3,
    'three due dates have passed with nothing paid, got ' || v_m::text;
  -- With late_stage2_missed = 2, three misses is «Critical / Contract Review».
  assert (v_m->>'stage') = 'critical',
    'v3 §31: after the second missed instalment the contract goes up for review, got ' || (v_m->>'stage');
  assert (v_m->>'stage_label') <> 'critical', 'and its Arabic comes from settings';
  assert (v_m->'lines'->0->>'is_late')::boolean = true
     and (v_m->'lines'->0->>'days_late')::integer = 70,
    'the line says how late it is, counted from its date plus the tolerance, got ' || (v_m->'lines'->0)::text;
end $$;

-- The thresholds are the owner's. Moving them moves the stage, with no migration and no stored column.
update public.settings set value = to_jsonb(3) where key = 'installments.late_stage1_missed';
update public.settings set value = to_jsonb(4) where key = 'installments.late_stage2_missed';

do $$
begin
  assert (pg_temp.ct_money(current_setting('test.ct_c_late')::uuid)->>'stage') = 'late1',
    'raising the thresholds moves the same contract down a rung, because the rung is computed';
end $$;

-- And the tolerance nobody wrote down. 100 days of grace and the same three lines are not late at all.
update public.settings set value = to_jsonb(100) where key = 'installments.grace_days_after';

do $$
declare
  v_m jsonb;
begin
  v_m := pg_temp.ct_money(current_setting('test.ct_c_late')::uuid);
  assert (v_m->>'missed_count')::integer = 0,
    'a grace period the owner grants is a grace period the queue honours, got ' || v_m::text;
  assert (v_m->>'grace_days')::integer = 100,
    'and it is handed back with the answer, so a screen can print it instead of assuming it';
end $$;

update public.settings set value = to_jsonb(0) where key = 'installments.grace_days_after';
update public.settings set value = to_jsonb(1) where key = 'installments.late_stage1_missed';
update public.settings set value = to_jsonb(2) where key = 'installments.late_stage2_missed';

-- The Finance queue §31 exists for: it finds those three lines and says what judged them.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.staff_installments('overdue', 500);
begin
  assert (v->>'matched')::integer >= 3,
    'the overdue queue finds the three lines, got ' || coalesce(v->>'matched', 'null');
  assert (v->>'grace_days') is not null and (v->>'late1_missed') is not null,
    'and returns the thresholds it judged by, got ' || v::text;
  assert exists (select 1 from jsonb_array_elements(v->'rows') r
                 where r->>'contract_id' = current_setting('test.ct_c_late')
                   and (r->'installment'->>'is_late')::boolean),
    'the late contract is in it, line by line';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 9 · §58 · A schedule line may be moved, and may never quietly re-price the contract
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_i4 uuid;
  v_c  public.contracts;
  v    jsonb;
begin
  select * into v_c from public.contracts c where c.id = current_setting('test.ct_c_late')::uuid;
  select i.id into v_i4 from public.contract_installments i
  where i.contract_id = v_c.id and i.seq = 4;
  perform set_config('test.ct_line4', v_i4::text, true);

  -- Moving a date is free.
  v := public.staff_update_installment(v_i4, (now() at time zone 'Africa/Tunis')::date + 30, null, null,
                                       current_setting('test.ct_reason'));
  assert exists (select 1 from public.contract_installments i
                 where i.id = v_i4 and i.due_on = (now() at time zone 'Africa/Tunis')::date + 30),
    'Finance may move an instalment''s date';

  -- Changing an amount without changing another is re-pricing the contract, and is refused.
  perform pg_temp.ct_expect(
    format('select public.staff_update_installment(%L, null, 99000, null, %L)',
           v_i4, current_setting('test.ct_reason')), 'schedule_total_mismatch');
end $$;

reset role;

-- Read outside the role on purpose: public.audit_logs is not a table Finance queries, and asserting from
-- inside the role would be testing who may read the log rather than what the log says.
do $$
begin
  -- §58 «من عدل القسط؟» — with who, why, and both values.
  assert exists (select 1 from public.audit_logs a
                 where a.action = 'installments.update'
                   and a.entity_id = current_setting('test.ct_line4')
                   and a.actor_id = current_setting('test.ct_fin')::uuid
                   and a.reason = current_setting('test.ct_reason')
                   and a.old_data ? 'due_on' and a.new_data ? 'due_on'),
    'editing a line writes the audit row §58 asks for, with the old and the new value';
end $$;

-- ---------------------------------------------------------------------------
-- 10 · §31 / v2 §36 · Ending a contract is a human act, and it puts the trees back
-- ---------------------------------------------------------------------------

do $$
begin
  -- The clearest statement of «لا يوجد فسخ آلي» a test can make: nothing in this module runs on a clock.
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public')
      and p.proname in ('contract_money', 'contract_payload', 'generate_contract_schedule',
                        'contract_settle_state', 'sell_reservation_trees', 'contract_first_due')
      and (p.prosrc ilike '%pg_cron%' or p.prosrc ilike '%pg_sleep%')),
    'no part of this module schedules anything';
  assert not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('contracts', 'contract_installments')
      and not t.tgisinternal
      and t.tgname not in ('contracts_stamp', 'contracts_audit',
                           'contract_installments_stamp', 'contract_installments_audit')),
    'the only triggers on these two tables are the stamp and the audit ones';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_cancel_contract(current_setting('test.ct_c_late')::uuid, true,
                                    current_setting('test.ct_reason'));
  assert v->>'status' = 'cancelled' and v->>'cancelled_at' is not null
     and (v->>'trees_released')::boolean = true,
    'cancelling and freeing the trees are one act, got ' || v::text;
  assert (v->'money'->>'stage') = 'idle',
    'and a dead contract has no lateness stage to chase';

  perform pg_temp.ct_expect(
    format('select public.staff_cancel_contract(%L, true, %L)',
           current_setting('test.ct_c_late'), current_setting('test.ct_reason')), 'contract_closed');
  perform pg_temp.ct_expect(
    format('select public.staff_record_installment(%L, null, ''installment'', 1000, null, null, null, null, %L)',
           current_setting('test.ct_c_late'), current_setting('test.ct_reason')), 'contract_cancelled');
end $$;

reset role;

do $$
declare
  v_res uuid := current_setting('test.ct_res_late')::uuid;
begin
  assert (select count(*) from public.trees t where t.reservation_id = v_res) = 0,
    'the freed trees let go of the reservation, because the unlink trigger fires on «available»';
  assert pg_temp.ct_state(current_setting('test.ct_a')::uuid, 'available') = 23,
    'and the seven went back on sale, got '
    || pg_temp.ct_state(current_setting('test.ct_a')::uuid, 'available') || ' available';
  -- The reservation is NOT resurrected: it became a contract, and the contract died.
  assert (select r.status from public.reservations r where r.id = v_res) = 'converted',
    'a cancelled contract does not reopen its hold; a new hold is a new reservation';
end $$;

-- ---------------------------------------------------------------------------
-- 11 · v3 §51 · The cash contract, which has a total and zero schedule rows
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- The commercial's own hold, contracted by someone whose desk it is.
  v := public.staff_create_contract(current_setting('test.ct_res_com')::uuid, null, 'cash', null, null,
                                    pg_temp.ct_method(), null, current_setting('test.ct_reason'));
  perform set_config('test.ct_c_cash', v->>'id', true);

  assert v->>'payment_mode' = 'cash',
    'an offer bought outright still produces a contract, got ' || v::text;
  assert (v->>'down_payment_millimes')::bigint = (v->>'total_price_millimes')::bigint,
    'a cash contract''s down payment is the whole price';
  assert v->>'monthly_millimes' is null and v->>'duration_months' is null
     and v->>'plan_installments_count' is null,
    'and it carries no plan at all, got ' || v::text;
  assert (v->>'schedule_pending')::boolean = false,
    'nothing is pending: a cash contract is not waiting for a schedule';

  v := public.staff_sign_contract(current_setting('test.ct_c_cash')::uuid, null, 'ACTE 2026/116', null,
                                  current_setting('test.ct_reason'));
  assert v->>'status' = 'signed',
    'it signs without a first due date, because it has no instalments to date';
  assert (v->'money'->>'installments_count')::integer = 0,
    'and the presence of rows — not a flag — is what distinguishes the two modes';
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  perform pg_temp.ct_expect(
    format('select public.staff_generate_schedule(%L, %L)',
           current_setting('test.ct_c_cash'), current_setting('test.ct_reason')), 'contract_is_cash');
  perform pg_temp.ct_expect(
    format('select public.staff_record_installment(%L, null, ''installment'', 1000, null, null, null, null, %L)',
           current_setting('test.ct_c_cash'), current_setting('test.ct_reason')), 'schedule_not_generated');

  -- v2 §38: the client owns the trees only after the legal conditions, as its own act with its own date.
  v := public.staff_record_installment(current_setting('test.ct_c_cash')::uuid, null, 'down_payment',
                                       (select c.total_price_millimes from public.contracts c
                                        where c.id = current_setting('test.ct_c_cash')::uuid),
                                       pg_temp.ct_method(), null, 'CASH-1', null,
                                       current_setting('test.ct_reason'));
  assert v->>'status' = 'completed' and v->>'owned_at' is null,
    'paid in full is not owned, got ' || v::text;
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_legal'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_set_contract_owned(current_setting('test.ct_c_cash')::uuid, null,
                                       current_setting('test.ct_reason'));
  assert v->>'owned_at' is not null,
    'ownership is recorded by Legal after the conditions complete (v2 §38), got ' || v::text;
  perform pg_temp.ct_expect(
    format('select public.staff_set_contract_owned(%L, null, %L)',
           current_setting('test.ct_c_cash'), current_setting('test.ct_reason')), 'contract_already_owned');
end $$;

reset role;

-- A contract whose ownership completed cannot be unwound by a button: that is a legal act, not a click.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.ct_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.ct_expect(
    format('select public.staff_cancel_contract(%L, true, %L)',
           current_setting('test.ct_c_cash'), current_setting('test.ct_reason')), 'contract_owned');
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 12 · The shape itself: what this module is and is not
-- ---------------------------------------------------------------------------

do $$
begin
  -- The four states, and no fifth. Ownership is a date, not a status.
  assert (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.contract_status'::regtype)
         = array['draft', 'signed', 'completed', 'cancelled'],
    'the contract has its own small enum and does not borrow the person''s or the parcel''s vocabulary';

  -- tree_state was not widened: 0054 considered a fourth value and left it out.
  assert (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.tree_state'::regtype)
         = array['available', 'reserved', 'sold'],
    'a tree is still available, reserved or sold; the three moments v2 §38 separates live on the contract';

  -- No second money table, and no second answer to «how much has this client paid».
  assert not exists (select 1 from information_schema.tables t
                     where t.table_schema = 'public'
                       and t.table_name in ('contract_payments', 'installment_payments', 'receipts')),
    'money is public.payments and nothing else';
  assert exists (select 1 from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = 'payments'
                   and c.column_name = 'contract_id'),
    'the contract link lives on the payment, where the money already is';

  -- Nothing a void could falsify is stored on a schedule line.
  assert not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = 'contract_installments'
                       and c.column_name in ('paid_millimes', 'paid_at', 'is_paid', 'status',
                                             'payment_status', 'is_late', 'late_stage', 'remaining_millimes',
                                             'reference_no', 'method_option_id', 'reference')),
    'a schedule line stores what is owed and when, and nothing a void or a clock could make false';
  assert not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = 'contracts'
                       and c.column_name in ('paid_millimes', 'is_late', 'late_stage', 'missed_count')),
    'and neither does the contract';

  -- The plan is frozen on the row, all of it, or none of it.
  assert (select count(*) from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = 'contracts'
            and c.column_name in ('markup_bp', 'total_financed_millimes', 'remaining_millimes',
                                  'monthly_millimes', 'last_installment_millimes', 'installments_count',
                                  'duration_months', 'plan_shortened')) = 8,
    'all of app.financed_quote''s plan keys are snapshotted, including the two interest_requests never stored';

  -- v2 §34's eight fields, each with a home.
  assert (select count(*) from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = 'contracts'
            and c.column_name in ('person_id', 'project_id', 'total_price_millimes', 'down_payment_millimes',
                                  'method_option_id', 'legal_document_ref', 'signed_on', 'monthly_millimes')) = 8,
    'v2 §34 lists eight things a «وعد بالبيع» holds, and all eight are columns';

  -- v2 §49 is singular, enforced by the database and not by a screen.
  assert exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.contracts'::regclass and k.contype = 'u'
                   and (select array_agg(a.attname::text order by a.attname)
                        from unnest(k.conkey) ck join pg_attribute a
                          on a.attrelid = k.conrelid and a.attnum = ck) = array['reservation_id']),
    'one contract per reservation, enforced in the database';

  -- Both tables are append-through-RPC only: nobody holds a write grant.
  assert not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name in ('contracts', 'contract_installments')
      and g.grantee in ('anon', 'authenticated')
      and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
    'nothing writes a contract or an instalment except the security-definer RPCs';

  -- And the module rows still exist with their own descriptions; building never publishes.
  assert (select f.description_ar from public.feature_flags f where f.key = 'contracts') not like '%البند 14%',
    'the modules screen no longer cites a dead clause numbering for العقود';
  assert (select f.description_ar from public.feature_flags f where f.key = 'installments') not like '%البند 15%',
    'nor for الأقساط';
end $$;

-- 12b · The seam stage 4 already cut. 0068's «زيتونتي» file can be filled now, from the same readers the
-- Back Office uses, so the client screen and the staff screen cannot drift apart.
do $$
declare
  v jsonb := app.zitounti_installments(current_setting('test.ct_p1')::uuid);
begin
  assert jsonb_typeof(app.zitounti_contracts(current_setting('test.ct_p1')::uuid)) = 'array',
    'app.zitounti_contracts answers, so 0068''s socket can be swapped in a two-line edit';
  assert jsonb_typeof(v) = 'array' and jsonb_array_length(v) >= 1,
    'and app.zitounti_installments shows the client their own schedule, got ' || v::text;
  assert (v->0->'money'->>'installments_count')::integer = 12,
    'read through app.contract_money, so «زيتونتي» and the Back Office cannot disagree';
end $$;
