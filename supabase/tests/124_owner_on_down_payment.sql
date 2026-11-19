-- العربون والتسبقة، والحريف اللي يولّي مالك وحدو كي يخلّص التسبقة. Migration 0180_owner_on_down_payment.sql.
--
-- Runs against the live database inside a rolled-back transaction: two offers with unused codes, fresh staff
-- accounts, unused phone numbers, every setting and flag it measures pinned INSIDE the transaction.
--
--   C1 · offer A (عربون 50 DT, no percentage of its own): the down payment is 30% of the total, the عربون is
--        credited against it, and the receipt that completes it makes the client the owner — not before.
--   C2 · offer B (40%, set from its page): the offer's own percentage; ownership waits for the schedule.
--   C3 · the rule switched off: paid in full and still not owned; the hand-pressed act still works.
--   C4 · a mandatory paper «قبل تسجيل التملّك» still open: the receipt is kept, ownership waits for the tick.

do $$
begin
  if to_regprocedure('app.contract_auto_own(uuid)') is null then
    raise exception
      'supabase/migrations/0180_owner_on_down_payment.sql is not applied on this database, and this test file belongs to it. Apply it with: npm run db:migrate';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers and fixtures
-- ---------------------------------------------------------------------------

create function pg_temp.oo_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

create function pg_temp.oo_method() returns uuid language sql as $$
  select o.id from public.option_items o where o.list_key = 'payment_method' and o.is_active
  order by o.sort_order limit 1
$$;

create function pg_temp.oo_money(p_contract uuid) returns jsonb
language sql security definer as $$
  select app.contract_money(p_contract)
$$;

create function pg_temp.oo_as(p_key text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.oo_' || p_key), 'role', 'authenticated')::text, true)
$$;

select set_config('request.jwt.claims', '', true);
select set_config('test.oo_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 0)), '.'), true)
from (values ('تجربة التسبقة والتملّك')) as t (s);

-- The seeded figures exist, with their Arabic, and stay internal.
do $$
begin
  assert exists (select 1 from public.settings s where s.key = 'contracts.down_payment_percent_default'
                   and s.label_ar <> '' and not s.is_public),
    'the down payment percentage is a setting with its own label';
  assert exists (select 1 from public.settings s where s.key = 'contracts.owner_on_down_payment'
                   and s.label_ar <> '' and not s.is_public),
    'the ownership rule is a switch the owner holds';
  assert (select s.value <> to_jsonb(1000000) from public.settings s where s.key = 'reservations.deposit_millimes_default'),
    'the old 1 000 DT default deposit is gone';
end $$;

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_fin   uuid := gen_random_uuid();
  v_com   uuid := gen_random_uuid();
  v_class uuid;
  v_id    uuid;
  v_st    uuid;
  v_phone text;
  i       integer;
begin
  update public.feature_flags set state = 'public'
   where key in ('projects', 'pricing', 'reservations', 'contracts', 'installments');
  update public.settings set value = to_jsonb(1)      where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4)      where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb(0)      where key = 'reservations.deposit_millimes_default';
  update public.settings set value = to_jsonb(0)      where key = 'reservations.valid_days_default';
  update public.settings set value = to_jsonb(true)   where key = 'contracts.require_deposit_paid';
  update public.settings set value = to_jsonb(true)   where key = 'contracts.deposit_counts_toward_down_payment';
  update public.settings set value = to_jsonb(30)     where key = 'contracts.down_payment_percent_default';
  update public.settings set value = 'true'::jsonb    where key = 'contracts.owner_on_down_payment';
  update public.settings set value = to_jsonb('signature_plus_month'::text) where key = 'installments.first_due_rule';
  update public.settings set value = to_jsonb(0)      where key = 'installments.first_due_offset_days';
  update public.settings set value = to_jsonb('never'::text) where key = 'legal.require_open_file_at';

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'oo-admin-' || v_admin || '@test.local', '{"full_name":"Admin Tasbiqa"}'),
    (v_fin,   'authenticated', 'authenticated', 'oo-fin-'   || v_fin   || '@test.local', '{"full_name":"Finance Tasbiqa"}'),
    (v_com,   'authenticated', 'authenticated', 'oo-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Tasbiqa"}');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin'), (v_fin, 'finance'), (v_com, 'commercial');
  perform set_config('test.oo_admin', v_admin::text, true);
  perform set_config('test.oo_fin',   v_fin::text,   true);
  perform set_config('test.oo_com',   v_com::text,   true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  -- A · a deposit of 50 DT, no percentage of its own.
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days)
  values ('OO-A-' || substr(gen_random_uuid()::text, 1, 8), 'عرض التسبقة', 34, 'published', 30, 50000, 10)
  returning id into v_id;
  perform set_config('test.oo_a', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes, monthly_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000, 1000);
  insert into public.financing_markups (project_id, months, markup_bp) values (v_id, 12, 1000);

  -- B · its sale terms are written from its page in section 1.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('OO-B-' || substr(gen_random_uuid()::text, 1, 8), 'عرض بنسبتو', 34, 'published', 20)
  returning id into v_id;
  perform set_config('test.oo_b', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes, monthly_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000, 1000);
  insert into public.financing_markups (project_id, months, markup_bp) values (v_id, 12, 1000);

  select s.id into v_st from public.lead_statuses s
  where s.stage = 'new' and s.is_active order by s.is_stage_default desc, s.sort_order limit 1;
  for i in 1..4 loop
    loop
      v_phone := '+21698' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.persons p where p.phone_e164 = v_phone);
    end loop;
    insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at, last_request_at)
    values ('حريف التسبقة ' || i, v_phone, 34, v_st, now(), now()) returning id into v_id;
    perform set_config('test.oo_p' || i, v_id::text, true);
  end loop;
end $$;

select pg_temp.oo_as('admin');
set local role authenticated;
select public.staff_generate_trees(current_setting('test.oo_a')::uuid, current_setting('test.oo_reason'));
select public.staff_generate_trees(current_setting('test.oo_b')::uuid, current_setting('test.oo_reason'));
reset role;

-- ---------------------------------------------------------------------------
-- 1 · The offer's sale terms: Finance and Admin only, and empty means the default
-- ---------------------------------------------------------------------------

select pg_temp.oo_as('com');
set local role authenticated;
do $$
begin
  perform pg_temp.oo_expect(format('select public.staff_offer_sale_terms(%L)', current_setting('test.oo_a')), 'forbidden');
  perform pg_temp.oo_expect(format('select public.staff_save_offer_sale_terms(%L, %L)', current_setting('test.oo_a'),
                                   '{"down_payment_percent":"50"}'), 'forbidden');
end $$;
reset role;

select pg_temp.oo_as('fin');
set local role authenticated;
do $$
declare
  v jsonb;
begin
  v := public.staff_offer_sale_terms(current_setting('test.oo_a')::uuid);
  assert (v->>'deposit_millimes')::bigint = 50000 and (v->>'valid_days')::integer = 10
     and v->>'down_payment_percent' is null and (v->>'default_down_payment_percent')::integer = 30
     and (v->>'owner_on_down_payment')::boolean,
    'offer A reads as written, its percentage empty and the default beside it, got ' || v::text;

  perform pg_temp.oo_expect(format('select public.staff_save_offer_sale_terms(%L, %L)', current_setting('test.oo_b'),
                                   '{"down_payment_percent":"100"}'), 'invalid_down_payment_percent');
  perform pg_temp.oo_expect(format('select public.staff_save_offer_sale_terms(%L, %L)', current_setting('test.oo_b'),
                                   '{"down_payment_percent":"0"}'), 'invalid_down_payment_percent');
  perform pg_temp.oo_expect(format('select public.staff_save_offer_sale_terms(%L, %L)', current_setting('test.oo_b'),
                                   '{"deposit_millimes":"-1"}'), 'invalid_deposit_amount');
  perform pg_temp.oo_expect(format('select public.staff_save_offer_sale_terms(%L, %L)', gen_random_uuid(),
                                   '{}'), 'offer_not_found');

  -- B: no deposit, no deadline, 40% down.
  v := public.staff_save_offer_sale_terms(current_setting('test.oo_b')::uuid,
         '{"deposit_millimes":"0","valid_days":"0","down_payment_percent":"40"}');
  assert (v->>'deposit_millimes')::bigint = 0 and (v->>'down_payment_percent')::numeric = 40,
    'offer B now asks 40%, got ' || v::text;
end $$;
reset role;

do $$
begin
  assert exists (select 1 from public.audit_logs a where a.action = 'projects.sale_terms'
                   and a.entity_id = current_setting('test.oo_b')),
    'writing an offer''s sale terms is audited';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · C1 · 30% by default, the عربون credited, owner on the receipt that completes it
-- ---------------------------------------------------------------------------

select pg_temp.oo_as('admin');
set local role authenticated;
do $$
declare
  v jsonb;
begin
  v := public.staff_create_reservation(current_setting('test.oo_a')::uuid, current_setting('test.oo_p1')::uuid,
                                       null, 3, null, current_setting('test.oo_reason'));
  perform set_config('test.oo_r1', v->>'id', true);
  perform public.staff_record_deposit((v->>'id')::uuid, 50000, pg_temp.oo_method(), null, 'ARB-1', null,
                                      current_setting('test.oo_reason'));

  v := public.staff_create_contract((v->>'id')::uuid, null, 'installments', null, 12, pg_temp.oo_method(), null,
                                    current_setting('test.oo_reason'));
  perform set_config('test.oo_c1', v->>'id', true);
  assert (v->>'down_payment_millimes')::bigint = round((v->>'total_price_millimes')::numeric * 30 / 100)::bigint,
    'no down payment given: 30% of the total, got ' || v::text;
  assert (v->'money'->>'deposit_credited_millimes')::bigint = 50000,
    'the 50 DT عربون is credited against it, got ' || (v->'money')::text;

  v := public.staff_sign_contract(current_setting('test.oo_c1')::uuid, null, 'ACTE-OO-1', null,
                                  current_setting('test.oo_reason'));
  assert v->>'status' = 'signed' and v->>'owned_at' is null,
    'signed with its schedule, the down payment still owed: not yet the owner, got ' || v::text;
end $$;
reset role;

select pg_temp.oo_as('fin');
set local role authenticated;
do $$
declare
  v_left bigint := (pg_temp.oo_money(current_setting('test.oo_c1')::uuid)->>'down_payment_left_millimes')::bigint;
begin
  assert v_left > 1000, 'there is a down payment left to pay, got ' || v_left;
  perform public.staff_record_installment(current_setting('test.oo_c1')::uuid, null, 'down_payment', v_left - 1000,
                                          pg_temp.oo_method(), null, 'TSB-1', null, current_setting('test.oo_reason'));
  assert (select c.owned_at from public.contracts c where c.id = current_setting('test.oo_c1')::uuid) is null,
    'one dinar short of the down payment is not ownership';

  perform public.staff_record_installment(current_setting('test.oo_c1')::uuid, null, 'down_payment', 1000,
                                          pg_temp.oo_method(), null, 'TSB-2', null, current_setting('test.oo_reason'));
  assert (select c.owned_at from public.contracts c where c.id = current_setting('test.oo_c1')::uuid) is not null,
    'the receipt that completes the down payment makes the client the owner';
end $$;
reset role;

do $$
begin
  assert exists (select 1 from public.audit_logs a where a.action = 'contracts.owned'
                   and a.entity_id = current_setting('test.oo_c1') and (a.new_data->>'auto')::boolean),
    'the automatic ownership is audited as automatic';
  assert (select count(*) from public.contract_installments i where i.contract_id = current_setting('test.oo_c1')::uuid) > 0
     and not coalesce((pg_temp.oo_money(current_setting('test.oo_c1')::uuid)->>'is_settled')::boolean, false),
    'and the schedule is still owed: ownership follows the down payment, not the last instalment';
end $$;

select pg_temp.oo_as('admin');
set local role authenticated;
select pg_temp.oo_expect(format('select public.staff_set_contract_owned(%L, null, %L)',
                                current_setting('test.oo_c1'), current_setting('test.oo_reason')),
                         'contract_already_owned');
reset role;

-- ---------------------------------------------------------------------------
-- 3 · C2 · the offer's own 40%, and ownership waits for the schedule
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'disabled' where key = 'installments';

select pg_temp.oo_as('admin');
set local role authenticated;
do $$
declare
  v jsonb;
begin
  v := public.staff_create_reservation(current_setting('test.oo_b')::uuid, current_setting('test.oo_p2')::uuid,
                                       null, 2, null, current_setting('test.oo_reason'));
  assert v->>'status' = 'deposit_paid', 'offer B asks no deposit: the hold opens settled, got ' || v::text;
  v := public.staff_create_contract((v->>'id')::uuid, null, 'installments', null, 12, pg_temp.oo_method(), null,
                                    current_setting('test.oo_reason'));
  perform set_config('test.oo_c2', v->>'id', true);
  assert (v->>'down_payment_millimes')::bigint = round((v->>'total_price_millimes')::numeric * 40 / 100)::bigint,
    'the offer''s own percentage wins over the default, got ' || v::text;
  perform public.staff_sign_contract(current_setting('test.oo_c2')::uuid, null, 'ACTE-OO-2', null,
                                     current_setting('test.oo_reason'));
end $$;
reset role;

update public.feature_flags set state = 'public' where key = 'installments';

select pg_temp.oo_as('fin');
set local role authenticated;
do $$
begin
  assert (select c.schedule_generated_at from public.contracts c where c.id = current_setting('test.oo_c2')::uuid) is null,
    'signed while the instalments module was off: no schedule yet';
  perform public.staff_record_installment(current_setting('test.oo_c2')::uuid, null, 'down_payment',
            (pg_temp.oo_money(current_setting('test.oo_c2')::uuid)->>'down_payment_left_millimes')::bigint,
            pg_temp.oo_method(), null, 'TSB-3', null, current_setting('test.oo_reason'));
  assert (select c.owned_at from public.contracts c where c.id = current_setting('test.oo_c2')::uuid) is null,
    'the down payment is paid but there are no échéances yet: not the owner';
end $$;
reset role;

select pg_temp.oo_as('admin');
set local role authenticated;
do $$
declare
  v jsonb;
begin
  v := public.staff_generate_schedule(current_setting('test.oo_c2')::uuid, current_setting('test.oo_reason'));
  assert v->>'owned_at' is not null, 'the schedule was the last thing missing, got ' || v::text;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4 · C3 · the switch off: paid in full, not owned; the hand-pressed act still works
-- ---------------------------------------------------------------------------

update public.settings set value = 'false'::jsonb where key = 'contracts.owner_on_down_payment';

select pg_temp.oo_as('admin');
set local role authenticated;
do $$
declare
  v jsonb;
begin
  v := public.staff_create_reservation(current_setting('test.oo_b')::uuid, current_setting('test.oo_p3')::uuid,
                                       null, 1, null, current_setting('test.oo_reason'));
  v := public.staff_create_contract((v->>'id')::uuid, null, 'cash', null, null, pg_temp.oo_method(), null,
                                    current_setting('test.oo_reason'));
  perform set_config('test.oo_c3', v->>'id', true);
  perform public.staff_sign_contract(current_setting('test.oo_c3')::uuid, null, 'ACTE-OO-3', null,
                                     current_setting('test.oo_reason'));
  perform public.staff_record_installment(current_setting('test.oo_c3')::uuid, null, 'down_payment',
            (v->>'total_price_millimes')::bigint, pg_temp.oo_method(), null, 'CASH-3', null,
            current_setting('test.oo_reason'));
  assert (select c.status::text = 'completed' and c.owned_at is null
          from public.contracts c where c.id = current_setting('test.oo_c3')::uuid),
    'with the rule off, paid in full is completed and not owned';

  v := public.staff_set_contract_owned(current_setting('test.oo_c3')::uuid, null, current_setting('test.oo_reason'));
  assert v->>'owned_at' is not null, 'and the hand-pressed act still records it';
end $$;
reset role;

update public.settings set value = 'true'::jsonb where key = 'contracts.owner_on_down_payment';

-- ---------------------------------------------------------------------------
-- 5 · C4 · a paper «قبل تسجيل التملّك» still open: the receipt is kept, ownership waits for the tick
-- ---------------------------------------------------------------------------

select pg_temp.oo_as('admin');
set local role authenticated;
do $$
declare
  v jsonb;
  v_r uuid;
begin
  v := public.staff_create_reservation(current_setting('test.oo_b')::uuid, current_setting('test.oo_p4')::uuid,
                                       null, 1, null, current_setting('test.oo_reason'));
  v_r := (v->>'id')::uuid;
  perform set_config('test.oo_r4', v_r::text, true);
  v := public.staff_create_contract(v_r, null, 'cash', null, null, pg_temp.oo_method(), null,
                                    current_setting('test.oo_reason'));
  perform set_config('test.oo_c4', v->>'id', true);
  perform set_config('test.oo_c4_total', v->>'total_price_millimes', true);
  perform public.staff_sign_contract(current_setting('test.oo_c4')::uuid, null, 'ACTE-OO-4', null,
                                     current_setting('test.oo_reason'));
  perform public.staff_open_legal_file(v_r, null, current_setting('test.oo_reason'));
end $$;
reset role;

-- The template's own ownership items are the owner's to change; this file brings one of its own.
insert into public.legal_file_checks (legal_file_id, code, label_ar, is_mandatory, required_at, sort_order)
select f.id, 'oo_ownership_paper', 'ورقة التملّك (تجربة)', true, 'ownership', 999
from public.legal_files f where f.reservation_id = current_setting('test.oo_r4')::uuid;

select pg_temp.oo_as('fin');
set local role authenticated;
do $$
begin
  perform public.staff_record_installment(current_setting('test.oo_c4')::uuid, null, 'down_payment',
            current_setting('test.oo_c4_total')::bigint, pg_temp.oo_method(), null, 'CASH-4', null,
            current_setting('test.oo_reason'));
  assert (select c.owned_at is null and c.status::text = 'completed'
          from public.contracts c where c.id = current_setting('test.oo_c4')::uuid),
    'the receipt is kept and the contract completed, but the paper is missing: not yet the owner';
end $$;
reset role;

select pg_temp.oo_as('admin');
set local role authenticated;
do $$
declare
  v_k uuid;
begin
  for v_k in select k.id from public.legal_file_checks k
             join public.legal_files f on f.id = k.legal_file_id
             where f.reservation_id = current_setting('test.oo_r4')::uuid
               and k.required_at = 'ownership' and k.is_mandatory and k.done_at is null and k.waived_at is null
             order by k.sort_order loop
    perform public.staff_set_legal_check(v_k, true, null, current_setting('test.oo_reason'));
  end loop;
end $$;
reset role;

do $$
begin
  assert (select c.owned_at from public.contracts c where c.id = current_setting('test.oo_c4')::uuid) is not null,
    'ticking the last ownership paper of a paid-up client makes them the owner';
end $$;
