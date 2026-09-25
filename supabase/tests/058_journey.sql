-- مسار الحريف — the derived funnel stage, the timeline and the callback queue.
-- Migration supabase/pending/bb_70_journey.sql (rename this file's first line when it is numbered).
--
-- Runs against the live database inside a rolled-back transaction: one fresh offer with an unused code, five
-- fresh staff accounts, unused phone numbers, and every setting and flag it measures pinned inside the
-- transaction. Every count is scoped to the fixtures, so real traffic can neither hide a failure nor cause one.
--
-- WHAT THIS FILE IS FOR. The stage is the one thing every screen in the Back Office agrees on, so it has to be
-- right at every point of the journey and it has to be right for ONE reason. Section 2 walks a single client
-- from «بعث مطلب من الموقع» to «مالك», act by act, through the real RPCs — no hand-written rows — and asserts
-- the stage after each one. Section 3 asserts it can never be two stages at once. Section 4 asserts the
-- timeline holds every source and runs forward. Section 5 is §27: a visitor gets nothing and a commercial gets
-- their own files only.

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'staff_customer_journey') then
    raise exception
      'supabase/pending/bb_70_journey.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_70_journey.sql supabase/tests/058_journey.sql';
  end if;
  if to_regclass('public.contracts') is null then
    raise exception
      'public.contracts is missing. bb_70 derives stages 11-13 from it; apply 0072_contracts_installments.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.jn_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- The stage key for one person, straight from the reader a screen would call.
create function pg_temp.jn_stage(p_person uuid) returns text language sql as $$
  select public.staff_customer_journey(p_person)->'stage'->>'key'
$$;

create function pg_temp.jn_rank(p_person uuid) returns integer language sql as $$
  select (public.staff_customer_journey(p_person)->'stage'->>'rank')::integer
$$;

-- Which kinds of event the timeline holds for one person.
create function pg_temp.jn_kinds(p_person uuid) returns text[] language sql as $$
  select coalesce(array_agg(distinct e->>'kind'), '{}')
  from jsonb_array_elements(public.staff_customer_journey(p_person)->'timeline'->'events') e
$$;

create function pg_temp.jn_payload(p_project text, p_trees text, p_phone text) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف المسار',
    'phone_e164', p_phone,
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', p_project,
    'trees', p_trees)
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
    perform set_config('test.jn_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);
select set_config('test.jn_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 0)), '.'), true)
from (values ('اختبار مسار الحريف من المطلب حتى الملكية')) as t (s);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_com   uuid := gen_random_uuid();
  v_com2  uuid := gen_random_uuid();
  v_fin   uuid := gen_random_uuid();
  v_plain uuid := gen_random_uuid();
  v_class uuid;
  v_id    uuid;
  v_code  text;
  v_status uuid;
begin
  -- Every switch and number this file measures, pinned here so it reads its own inputs.
  update public.feature_flags set state = 'public'
   where key in ('projects', 'pricing', 'reservations', 'visits', 'contracts', 'installments');
  update public.settings set value = to_jsonb(1) where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4) where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(9) where key = 'antispam.max_requests_per_phone_per_day';
  update public.settings set value = to_jsonb(1)  where key = 'visits.min_lead_days';
  update public.settings set value = to_jsonb(90) where key = 'visits.max_ahead_days';
  update public.settings set value = '[]'::jsonb  where key = 'visits.closed_weekdays';
  update public.settings set value = to_jsonb(6)  where key = 'visits.max_people';
  update public.settings set value = to_jsonb(false) where key = 'contracts.deposit_counts_toward_down_payment';
  update public.settings set value = to_jsonb(true)  where key = 'contracts.require_deposit_paid';
  -- bb_70's own two numbers, measured and not assumed.
  update public.settings set value = to_jsonb(300) where key = 'journey.timeline_max';
  update public.settings set value = to_jsonb(0)   where key = 'journey.callback_horizon_days';

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'jn-admin-' || v_admin || '@test.local', '{"full_name":"Admin Masar"}'),
    (v_com,   'authenticated', 'authenticated', 'jn-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Masar"}'),
    (v_com2,  'authenticated', 'authenticated', 'jn-com2-'  || v_com2  || '@test.local', '{"full_name":"Commercial Okhra"}'),
    (v_fin,   'authenticated', 'authenticated', 'jn-fin-'   || v_fin   || '@test.local', '{"full_name":"Finance Masar"}'),
    (v_plain, 'authenticated', 'authenticated', 'jn-plain-' || v_plain || '@test.local', '{"full_name":"Bla Dawr"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_com, 'commercial'), (v_com2, 'commercial'), (v_fin, 'finance');
  perform set_config('test.jn_admin', v_admin::text, true);
  perform set_config('test.jn_com',   v_com::text,   true);
  perform set_config('test.jn_com2',  v_com2::text,  true);
  perform set_config('test.jn_fin',   v_fin::text,   true);
  perform set_config('test.jn_plain', v_plain::text, true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  -- One published offer with its own deposit, its own validity and a real price per tree.
  v_code := 'JRN-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days, reservation_conditions_ar)
  values (v_code, 'عرض المسار', 34, 'published', 40, 75000, 30, 'شروط عرض المسار.')
  returning id into v_id;
  perform set_config('test.jn_project', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);

  -- P1 · the client who walks the whole journey, through the real RPCs.
  perform set_config('test.jn_req',
    (public.submit_offer_request(pg_temp.jn_payload(v_id::text, '3', current_setting('test.jn_phone_1')))->>'request_no'),
    true);
  select r.id, r.person_id into v_id, v_status
  from public.interest_requests r where r.request_no = current_setting('test.jn_req');
  perform set_config('test.jn_req_id', v_id::text, true);
  perform set_config('test.jn_p1', v_status::text, true);

  select s.id into v_status from public.lead_statuses s
  where s.stage = 'new' and s.is_active order by s.is_stage_default desc, s.sort_order limit 1;

  -- P2 · the commercial's own file (§27: a commercial reads this one and no other).
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at, assigned_to)
  values ('حريفة الكوميرسيال', current_setting('test.jn_phone_2'), 34, v_status, now(), current_setting('test.jn_com')::uuid)
  returning id into v_id;
  perform set_config('test.jn_p2', v_id::text, true);

  -- P3 · trees held with no reservation behind them — the only proof of «اختيار الزيتونات» today.
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at)
  values ('حريف الزيتونات', current_setting('test.jn_phone_3'), 34, v_status, now())
  returning id into v_id;
  perform set_config('test.jn_p3', v_id::text, true);

  -- P4 · the file whose callback was promised and then discharged by a later call.
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at)
  values ('حريف المتابعة', current_setting('test.jn_phone_4'), 34, v_status, now())
  returning id into v_id;
  perform set_config('test.jn_p4', v_id::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.jn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_generate_trees(current_setting('test.jn_project')::uuid, current_setting('test.jn_reason'));
reset role;

-- ---------------------------------------------------------------------------
-- 1 · §29 · The spine: thirteen keys, the owner's words, and two stages that
--     admit they have no fact
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.jn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_spine jsonb := public.staff_journey_spine();
  v_st    jsonb := v_spine->'stages';
  v_keys  text[];
  v_ranks integer[];
begin
  assert jsonb_array_length(v_st) = 13,
    '§29 names thirteen stages, got ' || jsonb_array_length(v_st);

  select array_agg(s->>'key' order by (s->>'rank')::integer),
         array_agg((s->>'rank')::integer order by (s->>'rank')::integer)
  into v_keys, v_ranks
  from jsonb_array_elements(v_st) s;

  assert v_ranks = array[1,2,3,4,5,6,7,8,9,10,11,12,13],
    'the ranks are 1..13 in order, got ' || v_ranks::text;
  assert v_keys = array['lead','contacted','qualified','visit_scheduled','visit_completed','trees_selected',
                        'reservation','deposit_paid','legal_processing','contract_scheduled','contract_signed',
                        'sale_completed','owner'],
    'the spine is the owner''s §29 in his order, got ' || v_keys::text;

  -- THE TWO HOLES, named in the data rather than guessed at in a screen.
  assert (select count(*) from jsonb_array_elements(v_st) s where (s->>'has_fact')::boolean is false) = 2,
    'exactly two stages have no fact behind them today';
  assert (select array_agg(s->>'key' order by (s->>'rank')::integer)
          from jsonb_array_elements(v_st) s where (s->>'has_fact')::boolean is false)
         = array['qualified', 'contract_scheduled'],
    'the two are مؤهَّل (no call outcome carries it) and موعد العقد محدد (no appointment table)';
  assert (select bool_and(nullif(btrim(s->>'fact_ar'), '') is not null) from jsonb_array_elements(v_st) s),
    'every stage says in Arabic what proves it';

  -- Every stage maps onto the owner's own public.lead_stage, so the derived spine sits on top of
  -- lead_statuses and never replaces it.
  assert (select bool_and(exists (select 1 from public.lead_statuses ls where ls.stage::text = s->>'lead_stage'))
          from jsonb_array_elements(v_st) s),
    'every derived stage maps onto a public.lead_stage the owner already has a label for';

  assert v_spine->>'unknown' = app.setting_text('journey.unknown_label', 'غير معروف'),
    'the word for «no fact» comes from settings, not from the code';
end $$;

-- The labels are DATA. Rename one and the reader says the new word.
update public.settings set value = to_jsonb('العربون وصل'::text) where key = 'journey.stage_deposit_paid';

do $$
declare
  v_label text;
begin
  select s->>'label' into v_label
  from jsonb_array_elements(public.staff_journey_spine()->'stages') s
  where s->>'key' = 'deposit_paid';
  assert v_label = 'العربون وصل',
    'renaming journey.stage_deposit_paid renames the stage everywhere, got ' || coalesce(v_label, 'null');
end $$;

update public.settings set value = to_jsonb('العربون مدفوع'::text) where key = 'journey.stage_deposit_paid';

reset role;

-- ---------------------------------------------------------------------------
-- 2 · THE JOURNEY, ACT BY ACT. The stage is right at each point, and it moves
--     because the FACT moved — nobody touches public.persons.status_id.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.jn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 2.1 · مطلب جديد — the demand alone
do $$
declare
  v_j jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid);
begin
  assert v_j->'stage'->>'key' = 'lead',
    'a file with only a web demand is at «مطلب جديد», got ' || coalesce(v_j->'stage'->>'key', 'null');
  assert v_j->'stage'->'proof'->>'kind' = 'request'
     and v_j->'stage'->'proof'->>'ref' = current_setting('test.jn_req'),
    'and the proof is the demand itself, with its number: ' || (v_j->'stage'->'proof')::text;
  assert v_j->'ids'->>'request_no' = current_setting('test.jn_req'),
    '§26: the Request ID travels on the payload';
  -- The human side is read but never written by this module.
  assert v_j->'human'->>'lead_stage' = 'new' and (v_j->'human'->>'agrees')::boolean,
    'the dropdown and the facts agree at the start of a file';
end $$;

-- 2.2 · تم الاتصال — one call, and the file moves without anyone touching a dropdown
insert into public.contact_attempts (person_id, channel, outcome, note, created_by)
values (current_setting('test.jn_p1')::uuid, 'phone', 'answered', 'تكلمنا معاه وشرحنا العرض.',
        current_setting('test.jn_admin')::uuid);

do $$
declare
  v_before uuid;
  v_after  uuid;
begin
  assert pg_temp.jn_stage(current_setting('test.jn_p1')::uuid) = 'contacted',
    'one logged call puts the file at «تم الاتصال», got ' || pg_temp.jn_stage(current_setting('test.jn_p1')::uuid);
  -- THE WHOLE POINT OF THIS MODULE: status_id did not move, and it did not have to.
  select p.status_id into v_after from public.persons p where p.id = current_setting('test.jn_p1')::uuid;
  select s.id into v_before from public.lead_statuses s
  where s.stage = 'new' and s.is_active order by s.is_stage_default desc, s.sort_order limit 1;
  assert v_after = v_before,
    'the derived stage moves without writing public.persons.status_id — nothing here is a second writer';
end $$;

-- 2.3 · موعد زيارة محدد
select set_config('test.jn_visit',
  (public.staff_book_visit(jsonb_build_object(
     'person_id', current_setting('test.jn_p1'),
     'project_id', current_setting('test.jn_project'),
     'request_id', current_setting('test.jn_req_id'),
     'status', 'confirmed',
     'visit_date', ((now() at time zone 'Africa/Tunis')::date + 3)::text,
     'slot_option_id', (select o.id::text from public.option_items o
                        where o.list_key = 'visit_slot' and o.is_active order by o.sort_order limit 1),
     'people_count', '2',
     'contact_channel', 'phone',
     'staff_note', 'يحب يشوف الأرض قبل ما يقرر.'),
   current_setting('test.jn_reason'))->>'id'), true);

do $$
begin
  assert pg_temp.jn_stage(current_setting('test.jn_p1')::uuid) = 'visit_scheduled',
    'a confirmed visit puts the file at «موعد زيارة محدد», got ' || pg_temp.jn_stage(current_setting('test.jn_p1')::uuid);
  assert (public.staff_customer_journey(current_setting('test.jn_p1')::uuid)->'ids'->>'visit_no') is not null,
    'and the visit number travels with the file';
end $$;

-- 2.4 · تمت الزيارة
select public.staff_set_visit_status(current_setting('test.jn_visit')::uuid, 'completed',
  jsonb_build_object('outcome_liked', 'true', 'outcome_next_step', 'يحب يحجز 3 زيتونات'),
  current_setting('test.jn_reason'));

do $$
begin
  assert pg_temp.jn_stage(current_setting('test.jn_p1')::uuid) = 'visit_completed',
    'a completed visit puts the file at «تمت الزيارة», got ' || pg_temp.jn_stage(current_setting('test.jn_p1')::uuid);
end $$;

-- 2.5 · اختيار الزيتونات — on its own file, because trees held WITHOUT a reservation are the only proof
select public.staff_allocate_trees(current_setting('test.jn_project')::uuid,
  current_setting('test.jn_p3')::uuid, null, 4, 'reserved', current_setting('test.jn_reason'));

do $$
declare
  v_j jsonb := public.staff_customer_journey(current_setting('test.jn_p3')::uuid);
begin
  assert v_j->'stage'->>'key' = 'trees_selected',
    'trees held with no reservation behind them are «اختيار الزيتونات», got ' || coalesce(v_j->'stage'->>'key', 'null');
  assert v_j->'stage'->'proof'->>'ref' = '4',
    'and the proof counts them: ' || (v_j->'stage'->'proof')::text;
  assert (v_j->'ids'->>'trees_held')::integer = 4,
    '§26: how many trees this file holds is on the payload';
end $$;

-- 2.6 · حجز
select set_config('test.jn_res',
  (public.staff_create_reservation(current_setting('test.jn_project')::uuid,
     current_setting('test.jn_p1')::uuid, current_setting('test.jn_req_id')::uuid, 3,
     'حجز بعد الزيارة.', current_setting('test.jn_reason'))->>'id'), true);

do $$
declare
  v_j jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid);
begin
  assert v_j->'stage'->>'key' = 'reservation',
    'an open hold puts the file at «حجز», got ' || coalesce(v_j->'stage'->>'key', 'null');
  assert v_j->'stage'->'proof'->>'kind' = 'reservation'
     and v_j->'stage'->'proof'->>'ref' = v_j->'ids'->>'reservation_no',
    'and the proof is the reservation, named by its own number';
  -- The trees this file now holds carry a reservation, so «اختيار الزيتونات» must NOT also match.
  assert v_j->'stage'->>'key' <> 'trees_selected',
    'a reserved file is not also at «اختيار الزيتونات»';
end $$;

-- 2.7 · العربون مدفوع
select public.staff_record_deposit(current_setting('test.jn_res')::uuid, 75000,
  (select o.id from public.option_items o where o.list_key = 'payment_method' and o.code = 'cash'),
  now(), 'REC-046', 'عربون نقداً.', current_setting('test.jn_reason'));

do $$
declare
  v_j jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid);
begin
  assert v_j->'stage'->>'key' = 'deposit_paid',
    'the عربون arriving puts the file at «العربون مدفوع», got ' || coalesce(v_j->'stage'->>'key', 'null');
  assert (v_j->'stage'->'proof'->>'at') is not null,
    'and the stage carries the day the money landed';
  -- §29's own example, and the sentence the owner wrote the brief around.
  assert (select (p.status_id = s.id) from public.persons p, public.lead_statuses s
          where p.id = current_setting('test.jn_p1')::uuid
            and s.stage = 'new' and s.is_active and s.is_stage_default),
    'the dropdown still says «جديد» — which is exactly why the stage may not be read from it';
  assert (v_j->'human'->>'agrees')::boolean is false,
    'and the payload SAYS the two disagree instead of letting one of them win silently';
end $$;

-- 2.8 · في القسم القانوني — the contract exists as a draft
select set_config('test.jn_ctr',
  (public.staff_create_contract(current_setting('test.jn_res')::uuid, null, 'cash', null, null,
     (select o.id from public.option_items o where o.list_key = 'payment_method' and o.code = 'cash'),
     'عقد نقداً.', current_setting('test.jn_reason'))->>'id'), true);

do $$
declare
  v_j jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid);
begin
  assert v_j->'stage'->>'key' = 'legal_processing',
    'a draft contract puts the file at «في القسم القانوني», got ' || coalesce(v_j->'stage'->>'key', 'null');
  assert v_j->'ids'->>'contract_no' is not null,
    '§26: the Contract ID joins the identifiers that travel the journey';
  -- 0072 converts the reservation and sells the trees in the same transaction, so the two stages behind this
  -- one can no longer match. That is what keeps one file in one stage.
  assert (select r.status::text from public.reservations r where r.id = current_setting('test.jn_res')::uuid) = 'converted',
    'the hold was converted by the contract';
end $$;

-- 2.9 · العقد ممضي
select public.staff_sign_contract(current_setting('test.jn_ctr')::uuid, (now() at time zone 'Africa/Tunis')::date,
  'سجل عقاري 2026/46', null, current_setting('test.jn_reason'));

do $$
begin
  assert pg_temp.jn_stage(current_setting('test.jn_p1')::uuid) = 'contract_signed',
    'a signed contract puts the file at «العقد ممضي», got ' || pg_temp.jn_stage(current_setting('test.jn_p1')::uuid);
end $$;

-- 2.10 · تم إتمام البيع — the money finishes, and 0072 moves the contract by itself
select public.staff_record_installment(current_setting('test.jn_ctr')::uuid, null, 'down_payment',
  (select c.down_payment_millimes from public.contracts c where c.id = current_setting('test.jn_ctr')::uuid),
  (select o.id from public.option_items o where o.list_key = 'payment_method' and o.code = 'transfer'),
  now(), 'VIR-046', 'خلاص كامل.', current_setting('test.jn_reason'));

do $$
declare
  v_j jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid);
begin
  assert (select c.status::text from public.contracts c where c.id = current_setting('test.jn_ctr')::uuid) = 'completed',
    'a cash contract settles on its down payment (0072)';
  assert v_j->'stage'->>'key' = 'sale_completed',
    'a settled contract puts the file at «تم إتمام البيع», got ' || coalesce(v_j->'stage'->>'key', 'null');
end $$;

-- 2.11 · مالك
select public.staff_set_contract_owned(current_setting('test.jn_ctr')::uuid, (now() at time zone 'Africa/Tunis')::date,
  current_setting('test.jn_reason'));

do $$
declare
  v_j jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid);
begin
  assert v_j->'stage'->>'key' = 'owner' and (v_j->'stage'->>'rank')::integer = 13,
    'registering ownership puts the file at «مالك», the last stage, got ' || coalesce(v_j->'stage'->>'key', 'null');
  -- §30: the file does not close. It reads as an owner, and every earlier act is still on it.
  assert (v_j->'ids'->>'trees_held')::integer = 3,
    'and the owner still holds their three numbered trees';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · ONE STAGE, NEVER TWO — the property, not the habit
-- ---------------------------------------------------------------------------

do $$
declare
  v_j     jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid);
  v_spine jsonb := v_j->'spine';
  v_rank  integer := (v_j->'stage'->>'rank')::integer;
begin
  assert (select count(*) from jsonb_array_elements(v_spine) s where (s->>'current')::boolean) = 1,
    'exactly one stage of the thirteen is «current»';
  assert (select count(*) from jsonb_array_elements(v_spine) s where (s->>'reached')::boolean) = v_rank,
    'and everything up to it reads as reached — the band is drawn from one number';
  assert (select bool_and(((s->>'rank')::integer <= v_rank) = (s->>'reached')::boolean)
          from jsonb_array_elements(v_spine) s),
    'reached is rank <= current for every stage, with no gaps and no jumps';
  -- A stage behind the current one that no fact can prove still says so, so a screen draws it hollow.
  assert (select bool_and((s->>'has_fact')::boolean) is false
          from jsonb_array_elements(v_spine) s where s->>'key' in ('qualified', 'contract_scheduled')),
    'the two factless stages stay factless even when the file has walked past them';
end $$;

-- The batch reader answers the same thing as the single one, for a queue or the §28 dashboard.
do $$
declare
  v_rows jsonb := public.staff_person_stage(array[current_setting('test.jn_p1')::uuid,
                                                  current_setting('test.jn_p3')::uuid]);
begin
  assert jsonb_array_length(v_rows) = 2, 'two files in, two answers out';
  assert (select r->'stage'->>'key' from jsonb_array_elements(v_rows) r
          where r->>'person_id' = current_setting('test.jn_p1')) = 'owner',
    'the list reader and the file reader cannot disagree about the same person';
  assert (select r->'stage'->>'key' from jsonb_array_elements(v_rows) r
          where r->>'person_id' = current_setting('test.jn_p3')) = 'trees_selected',
    'and each file gets its own stage';
end $$;

-- ---------------------------------------------------------------------------
-- 4 · §25 · ONE TIMELINE, complete and in order
-- ---------------------------------------------------------------------------

do $$
declare
  v_t     jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid)->'timeline';
  v_e     jsonb := v_t->'events';
  v_kinds text[] := pg_temp.jn_kinds(current_setting('test.jn_p1')::uuid);
  v_prev  timestamptz;
  v_at    timestamptz;
  r       jsonb;
begin
  -- THE SEVEN SOURCES THE FILE'S TIMELINE NEVER HAD.
  assert 'request' = any (v_kinds),            'the web demand is on the timeline';
  assert 'call' = any (v_kinds),               'the call is on the timeline';
  assert 'visit_booked' = any (v_kinds),       'booking the visit is on the timeline';
  assert 'visit_completed' = any (v_kinds),    'the visit''s outcome is on the timeline';
  assert 'trees' = any (v_kinds),              'the tree allocation is on the timeline';
  assert 'reservation' = any (v_kinds),        'the hold is on the timeline';
  assert 'deposit' = any (v_kinds),            'the عربون is on the timeline';
  assert 'payment' = any (v_kinds),            'every receipt is on the timeline';
  assert 'contract' = any (v_kinds),           'the contract is on the timeline';
  assert 'contract_signed' = any (v_kinds),    'the signature is on the timeline';
  assert 'contract_owned' = any (v_kinds),     'and ownership closes it';

  -- ASCENDING, because the owner reads it from «بعث مطلب» to «تم البيع».
  for r in select * from jsonb_array_elements(v_e) loop
    v_at := (r->>'at')::timestamptz;
    assert v_prev is null or v_at >= v_prev,
      'the timeline runs forward; ' || v_at::text || ' came after ' || v_prev::text;
    v_prev := v_at;
  end loop;

  assert (v_e->0->>'kind') = 'request',
    'and it starts where the owner says it starts: «بعث مطلب من الموقع», got ' || coalesce(v_e->0->>'kind', 'null');

  -- Every event is titled from settings journey.event_labels, never from a literal in a screen.
  assert (select bool_and(e->>'title' = coalesce(app.setting('journey.event_labels')->>(e->>'kind'), e->>'kind'))
          from jsonb_array_elements(v_e) e),
    'every event''s Arabic name comes from the owner''s settings';

  -- MONEY IS RAW. src/lib/format.ts is the only formatter in this product.
  assert (select (e->>'amount_millimes')::bigint = 75000
          from jsonb_array_elements(v_e) e where e->>'kind' = 'deposit' limit 1),
    'the عربون is on the timeline as integer millimes, unformatted';

  -- The allocation is ONE act, not three rows — TX-00215 holds 8,000 trees and a list of them is not a story.
  assert (select count(*) from jsonb_array_elements(v_e) e where e->>'kind' = 'trees') = 1,
    'three trees taken in one act are one timeline entry';
  assert (select (e->>'count')::integer = 3 from jsonb_array_elements(v_e) e where e->>'kind' = 'trees'),
    'and that entry says how many';

  assert (v_t->>'total')::integer = jsonb_array_length(v_e) and (v_t->>'truncated')::boolean is false,
    'nothing was dropped from a file this small';
end $$;

-- The ceiling is a setting, and when it bites the reader says so instead of pretending.
update public.settings set value = to_jsonb(3) where key = 'journey.timeline_max';

do $$
declare
  v_t jsonb := public.staff_customer_journey(current_setting('test.jn_p1')::uuid)->'timeline';
begin
  assert jsonb_array_length(v_t->'events') = 3, 'the ceiling is journey.timeline_max, not a literal';
  assert (v_t->>'truncated')::boolean, 'and a truncated timeline says it is truncated';
  assert (v_t->>'total')::integer > 3, 'while still reporting how many events there really are';
end $$;

update public.settings set value = to_jsonb(300) where key = 'journey.timeline_max';
reset role;

-- ---------------------------------------------------------------------------
-- 5 · §27 · A visitor gets nothing, a commercial gets their own files only
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;

-- A visitor is stopped by the GRANT, one layer before the role check inside the function even runs. That is
-- the stronger refusal and the one worth pinning: execute is revoked from anon on all four readers.
do $$
begin
  perform pg_temp.jn_expect(
    format('select public.staff_customer_journey(%L::uuid)', current_setting('test.jn_p1')),
    'permission denied for function staff_customer_journey');
  perform pg_temp.jn_expect(
    format('select public.staff_person_stage(array[%L::uuid])', current_setting('test.jn_p1')),
    'permission denied for function staff_person_stage');
  perform pg_temp.jn_expect('select public.staff_journey_spine()',
    'permission denied for function staff_journey_spine');
  perform pg_temp.jn_expect('select public.staff_callbacks()',
    'permission denied for function staff_callbacks');
end $$;

reset role;

-- A signed-in account with no staff role is a visitor as far as these readers are concerned.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.jn_plain'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.jn_expect(
    format('select public.staff_customer_journey(%L::uuid)', current_setting('test.jn_p1')), 'forbidden');
  perform pg_temp.jn_expect('select public.staff_callbacks()', 'forbidden');
end $$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.jn_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_rows jsonb;
begin
  -- Their own file: readable.
  assert pg_temp.jn_stage(current_setting('test.jn_p2')::uuid) = 'lead',
    'a commercial reads the journey of a file assigned to them';
  -- Somebody else's: refused by name, not silently emptied.
  perform pg_temp.jn_expect(
    format('select public.staff_customer_journey(%L::uuid)', current_setting('test.jn_p1')), 'forbidden');
  -- And the list reader drops what they may not see rather than returning a null row.
  v_rows := public.staff_person_stage(array[current_setting('test.jn_p1')::uuid,
                                            current_setting('test.jn_p2')::uuid]);
  assert jsonb_array_length(v_rows) = 1,
    'the batch reader returns only the files this commercial may see, got ' || v_rows::text;
  assert v_rows->0->>'person_id' = current_setting('test.jn_p2'),
    'and it is theirs';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 6 · §5 · «شنوّة مستحق عليّ توّا» — the callback queue
-- ---------------------------------------------------------------------------

-- Two promises by the admin: one already broken, one for later. Plus a third on a file where a LATER call
-- was made, which is how a callback is discharged in this product.
insert into public.contact_attempts (person_id, channel, outcome, note, next_follow_up_at, created_by, created_at)
values
  (current_setting('test.jn_p3')::uuid, 'phone', 'no_answer', 'ما ردّش.',
   now() - interval '5 weeks', current_setting('test.jn_admin')::uuid, now() - interval '5 weeks 1 day'),
  (current_setting('test.jn_p2')::uuid, 'phone', 'callback', 'طلب نعاودوا نتصلوا بيه.',
   now() + interval '10 days', current_setting('test.jn_com')::uuid, now() - interval '1 day'),
  (current_setting('test.jn_p4')::uuid, 'phone', 'no_answer', 'ما ردّش.',
   now() - interval '2 days', current_setting('test.jn_admin')::uuid, now() - interval '3 days'),
  (current_setting('test.jn_p4')::uuid, 'phone', 'answered', 'عاودنا وتكلمنا معاه.',
   null, current_setting('test.jn_admin')::uuid, now() - interval '1 hour');

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.jn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_q    jsonb := public.staff_callbacks(jsonb_build_object('scope', 'mine'));
  v_ids  text[];
begin
  select coalesce(array_agg(r->>'person_id'), '{}') into v_ids from jsonb_array_elements(v_q->'rows') r;

  -- THE FIVE-WEEK-OLD PROMISE IS STILL THERE. The dashboard query it replaces caps at 30 days and simply
  -- drops it, so «الـLead يرجع للموظف في الوقت المحدد» quietly stopped being true after a month.
  assert current_setting('test.jn_p3') = any (v_ids),
    'a callback promised five weeks ago is still due — no 30-day window';
  assert (select r->>'bucket' from jsonb_array_elements(v_q->'rows') r
          where r->>'person_id' = current_setting('test.jn_p3')) = 'overdue',
    'and it reads as متأخرة';

  -- DISCHARGED BY THE NEXT CALL, which is the act somebody performs anyway. No «mark as done» button, and
  -- therefore no button anyone can forget.
  assert not (current_setting('test.jn_p4') = any (v_ids)),
    'a later call discharges the promise; P4 must not still be in the queue';

  -- scope=mine is the caller's own promises. The commercial's promise is not the admin's work.
  assert not (current_setting('test.jn_p2') = any (v_ids)),
    'scope=mine returns what I promised, not what a colleague promised';

  -- The row carries the file's real stage, so an agent ringing back knows what to say before they dial.
  assert (select r->'stage'->>'key' from jsonb_array_elements(v_q->'rows') r
          where r->>'person_id' = current_setting('test.jn_p3')) = 'trees_selected',
    'the queue row says where the file actually is';

  assert (v_q->'counts'->>'overdue')::integer >= 1 and (v_q->>'scope') = 'mine',
    'the buckets are counted in Postgres, not on the screen';
end $$;

-- scope=all is every file the reader may see, which for an admin includes the commercial's promise.
do $$
declare
  v_q   jsonb := public.staff_callbacks(jsonb_build_object('scope', 'all'));
  v_ids text[];
begin
  select coalesce(array_agg(r->>'person_id'), '{}') into v_ids from jsonb_array_elements(v_q->'rows') r;
  assert current_setting('test.jn_p2') = any (v_ids),
    'scope=all shows an admin the whole team''s promises';
  assert (select r->>'bucket' from jsonb_array_elements(v_q->'rows') r
          where r->>'person_id' = current_setting('test.jn_p2')) = 'upcoming',
    'a promise ten days out is قادمة, not متأخرة';
  perform pg_temp.jn_expect('select public.staff_callbacks(''{"scope":"sideways"}''::jsonb)',
                            'invalid_callback_scope');
end $$;

reset role;

-- And a commercial's queue is theirs alone, in both directions: they see their own promise and none of the
-- admin's, because app.can_see_person never let them read those files in the first place.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.jn_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_q   jsonb := public.staff_callbacks(jsonb_build_object('scope', 'all'));
  v_ids text[];
begin
  select coalesce(array_agg(r->>'person_id'), '{}') into v_ids from jsonb_array_elements(v_q->'rows') r;
  assert current_setting('test.jn_p2') = any (v_ids),
    'the commercial sees the promise they made on their own file';
  assert not (current_setting('test.jn_p3') = any (v_ids)),
    'and never a promise on a file that is not theirs, even asking for scope=all';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
