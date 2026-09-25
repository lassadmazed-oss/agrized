-- «زيتونتي» بعد الشراء — the three sockets, plugged.
-- Migration supabase/migrations/0095_zitounti_after_sale.sql (rename this file's first line when it is numbered).
--
-- Runs against the live database inside a rolled-back transaction: one fresh offer with an unused code, fresh
-- staff accounts, unused phone numbers, and every flag and setting it measures pinned inside the transaction.
--
-- WHAT THIS FILE IS FOR. Before bb_76, a client who had signed a contract and paid three instalments opened a
-- file that said «يُبنى في دفعة قادمة» where the money should be. The figures existed — app.contract_money had
-- them all along — and nothing handed them over. So section 3 walks one client all the way to a signed
-- contract with money against it, and asserts the client's own file now shows: the contract, the schedule, the
-- documents, and a المدفوع/المتبقي that AGREES WITH FINANCE to the millime. Section 4 is §27.

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'zitounti_documents') then
    raise exception
      'supabase/migrations/0095_zitounti_after_sale.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0095_zitounti_after_sale.sql supabase/tests/062_zitounti_after_sale.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers and fixtures
-- ---------------------------------------------------------------------------

create function pg_temp.za_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

/** One section of the client's own file, as the screen reads it. */
create function pg_temp.za_section(p_person uuid, p_key text) returns jsonb language sql as $$
  select public.staff_zitounti_file(p_person)->p_key
$$;

do $$
declare
  v_phone text;
  i       integer;
  v_used  text[] := '{}';
begin
  for i in 1..2 loop
    loop
      v_phone := '+21695' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.za_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);
select set_config('test.za_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 0)), '.'), true)
from (values ('اختبار ملف زيتونتي بعد الشراء')) as t (s);

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_com   uuid := gen_random_uuid();
  v_class uuid;
  v_proj  uuid;
  v_code  text;
  v_pid   uuid;
  v_rid   uuid;
begin
  -- Every switch this file measures, pinned here so it reads its own inputs.
  update public.feature_flags set state = 'public'
   where key in ('projects', 'pricing', 'reservations', 'visits', 'contracts', 'installments', 'zitounti');
  update public.settings set value = to_jsonb(1) where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4) where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(9) where key = 'antispam.max_requests_per_phone_per_day';
  update public.settings set value = to_jsonb(false) where key = 'contracts.deposit_counts_toward_down_payment';
  update public.settings set value = to_jsonb(true)  where key = 'contracts.require_deposit_paid';

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'za-admin-' || v_admin || '@test.local', '{"full_name":"Admin Zitounti"}'),
    (v_com,   'authenticated', 'authenticated', 'za-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Okhra"}');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin'), (v_com, 'commercial');
  perform set_config('test.za_admin', v_admin::text, true);
  perform set_config('test.za_com',   v_com::text,   true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  v_code := 'ZTA-' || substr(gen_random_uuid()::text, 1, 8);
  -- plan_storage_path is set: الوثائق must return the offer's plan for a holder, and a null path would make
  -- the assertion pass for the wrong reason.
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days, reservation_conditions_ar,
                               plan_storage_path)
  values (v_code, 'عرض زيتونتي', 34, 'published', 40, 75000, 30, 'شروط عرض الاختبار.',
          'plans/' || v_code || '.pdf')
  returning id into v_proj;
  perform set_config('test.za_project', v_proj::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_proj, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_proj, 7000, 50000, 150000, 'percent', 1000, 1000);

  perform set_config('test.za_req_no',
    (public.submit_offer_request(jsonb_build_object(
       'full_name', 'حريف زيتونتي', 'phone_e164', current_setting('test.za_phone_1'),
       'residence_governorate_id', '34', 'contact_channel', 'phone',
       'consent_text', 'موافقة تجريبية', 'project_id', v_proj::text, 'trees', '3'))->>'request_no'), true);
  select r.id, r.person_id into v_rid, v_pid
  from public.interest_requests r where r.request_no = current_setting('test.za_req_no');
  perform set_config('test.za_req', v_rid::text, true);
  perform set_config('test.za_person', v_pid::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.za_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_generate_trees(current_setting('test.za_project')::uuid, current_setting('test.za_reason'));

-- ---------------------------------------------------------------------------
-- 1 · Before the sale: the sections are open and honestly empty
-- ---------------------------------------------------------------------------

-- THE DISTINCTION THIS WHOLE MODULE IS BUILT ON. «ok + zero rows» is «you have no contract yet»; «not_built»
-- is «we never built this». Before bb_76 these three said the second thing while the first was true.
do $$
declare
  v_f jsonb := public.staff_zitounti_file(current_setting('test.za_person')::uuid);
begin
  assert v_f->'contracts'->>'status' = 'ok',
    'عقودي is answered, not «not_built», got ' || coalesce(v_f->'contracts'->>'status', 'null');
  assert v_f->'installments'->>'status' = 'ok',
    'الأقساط is answered, got ' || coalesce(v_f->'installments'->>'status', 'null');
  assert v_f->'documents'->>'status' = 'ok',
    'الوثائق is answered, got ' || coalesce(v_f->'documents'->>'status', 'null');
  assert (v_f->'contracts'->>'count')::integer = 0,
    'and a client with no contract has zero of them, not a placeholder';
  assert (v_f->'totals'->'money'->>'contracts')::integer = 0,
    'the money block exists and counts nothing yet';
  assert (v_f->'totals'->'money'->>'left_millimes')::bigint = 0,
    'nobody owes anything before they sign';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · The sale, through the real RPCs
-- ---------------------------------------------------------------------------

select set_config('test.za_res',
  (public.staff_create_reservation(
     p_project => current_setting('test.za_project')::uuid,
     p_person  => current_setting('test.za_person')::uuid,
     p_request => current_setting('test.za_req')::uuid,
     p_trees   => 3,
     p_note    => 'حجز تجريبي.',
     p_reason  => current_setting('test.za_reason'))->>'id'), true);

select public.staff_record_deposit(current_setting('test.za_res')::uuid, 75000,
  (select o.id from public.option_items o where o.list_key = 'payment_method' and o.code = 'cash'),
  now(), 'REC-062', 'عربون نقداً.', current_setting('test.za_reason'));

-- Instalments, so the schedule and «المتبقي» have something to say.
select set_config('test.za_contract',
  (public.staff_create_contract(
     p_reservation           => current_setting('test.za_res')::uuid,
     p_kind                  => null,
     p_payment_mode          => 'installments',
     p_down_payment_millimes => 1000000,
     p_duration_months       => 36,
     p_method                => (select o.id from public.option_items o
                                 where o.list_key = 'payment_method' and o.code = 'cash'),
     p_note                  => 'عقد تجريبي.',
     p_reason                => current_setting('test.za_reason'))->>'id'), true);

select public.staff_sign_contract(current_setting('test.za_contract')::uuid,
  (now() at time zone 'Africa/Tunis')::date, 'NOT-2026-0062', null, current_setting('test.za_reason'));

-- ---------------------------------------------------------------------------
-- 3 · After the sale: the client's own file carries the money
-- ---------------------------------------------------------------------------

do $$
declare
  v_f    jsonb := public.staff_zitounti_file(current_setting('test.za_person')::uuid);
  v_ctr  jsonb := v_f->'contracts';
  v_docs jsonb := v_f->'documents';
  v_m    jsonb := v_f->'totals'->'money';
  -- Read through the PUBLIC reader the Back Office's own contract screen calls, not app.contract_money:
  -- this block runs as `authenticated`, which is the role a screen runs as, and app.* is revoked from it.
  -- It also makes the assertion the stronger one — client screen versus Back Office screen, both as a user.
  v_fin  jsonb := public.staff_contract(current_setting('test.za_contract')::uuid)->'money';
begin
  -- عقودي
  assert (v_ctr->>'count')::integer = 1,
    'the signed contract is on the client''s own file, got ' || coalesce(v_ctr->>'count', 'null');
  assert v_ctr->'items'->0->>'status' = 'signed',
    'and it says it is signed';
  assert (v_ctr->'items'->0->>'trees_count')::integer = 3,
    'with the three trees it was written for';

  -- الأقساط
  assert (v_f->'installments'->>'count')::integer = 1,
    'the schedule is on the file too';
  assert jsonb_array_length(v_f->'installments'->'items'->0->'money'->'lines') = 36,
    'and it is the full 36 lines, got '
      || jsonb_array_length(v_f->'installments'->'items'->0->'money'->'lines');

  -- THE ASSERTION THIS FILE EXISTS FOR: the client's screen and Finance's screen are the same numbers,
  -- because they are the same function. If these ever diverge, two places are computing one balance.
  assert (v_m->>'due_millimes')::bigint  = (v_fin->>'total_due_millimes')::bigint,
    'المستحق on the client file equals Finance''s: ' || (v_m->>'due_millimes') || ' vs ' || (v_fin->>'total_due_millimes');
  assert (v_m->>'paid_millimes')::bigint = (v_fin->>'total_paid_millimes')::bigint,
    'المدفوع agrees: ' || (v_m->>'paid_millimes') || ' vs ' || (v_fin->>'total_paid_millimes');
  assert (v_m->>'left_millimes')::bigint = (v_fin->>'total_left_millimes')::bigint,
    'المتبقي agrees: ' || (v_m->>'left_millimes') || ' vs ' || (v_fin->>'total_left_millimes');
  assert (v_m->>'left_millimes')::bigint > 0,
    'and a client who has just signed a 36-month plan still owes something';
  assert (v_m->>'contracts')::integer = 1, 'one live contract is counted';

  -- الوثائق: the contract (signed, with the notary's reference) and the offer's plan.
  assert (v_docs->>'count')::integer = 2,
    'الوثائق holds the contract and the offer plan, got ' || coalesce(v_docs->>'count', 'null');
  assert (select bool_or(d->>'kind' = 'contract' and d->>'legal_ref' = 'NOT-2026-0062')
          from jsonb_array_elements(v_docs->'items') d),
    'the contract carries the reference Legal recorded';
  assert (select bool_or(d->>'kind' = 'offer_plan' and d->>'storage_path' is not null)
          from jsonb_array_elements(v_docs->'items') d),
    'and the offer plan carries a path, because it is a file and not only a record';
end $$;

-- Paying an instalment moves المدفوع and المتبقي on the client's own screen — nobody retypes a figure.
do $$
declare
  v_line uuid;
  v_before bigint;
  v_after  bigint;
begin
  select (v_f->'totals'->'money'->>'paid_millimes')::bigint into v_before
  from (select public.staff_zitounti_file(current_setting('test.za_person')::uuid) as v_f) x;

  select i.id into v_line
  from public.contract_installments i
  where i.contract_id = current_setting('test.za_contract')::uuid
  order by i.seq limit 1;

  perform public.staff_record_installment(
    current_setting('test.za_contract')::uuid, v_line, 'installment', 200000,
    (select o.id from public.option_items o where o.list_key = 'payment_method' and o.code = 'cash'),
    now(), 'REC-062-1', 'قسط أوّل.', current_setting('test.za_reason'));

  select (v_f->'totals'->'money'->>'paid_millimes')::bigint into v_after
  from (select public.staff_zitounti_file(current_setting('test.za_person')::uuid) as v_f) x;

  assert v_after = v_before + 200000,
    'a receipt recorded by Finance shows up on the client''s file immediately: ' || v_before || ' → ' || v_after;
end $$;

-- A switched-off module says «closed», not an empty list: «the owner has not switched this on» and «you have
-- none» are different answers and the screen prints different sentences for them.
update public.feature_flags set state = 'disabled' where key = 'contracts';

do $$
declare
  v_f jsonb := public.staff_zitounti_file(current_setting('test.za_person')::uuid);
begin
  assert v_f->'contracts'->>'status' = 'closed',
    'عقودي closes with its module, got ' || coalesce(v_f->'contracts'->>'status', 'null');
  assert v_f->'documents'->>'status' = 'ok',
    'but الوثائق does not: a signed contract is a document whatever switch is on';
end $$;

update public.feature_flags set state = 'public' where key = 'contracts';

reset role;

-- ---------------------------------------------------------------------------
-- 4 · §27 · Who may read a client's file
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.za_expect(
  format('select public.staff_zitounti_file(%L::uuid)', current_setting('test.za_person')),
  'permission denied for function staff_zitounti_file');
reset role;

-- A commercial assigned nothing reads no file at all.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.za_com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.za_expect(
  format('select public.staff_zitounti_file(%L::uuid)', current_setting('test.za_person')), 'forbidden');
reset role;
