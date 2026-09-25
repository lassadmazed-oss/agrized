-- وين وصل هذا المطلب — the stage of ONE demand.
-- Migration supabase/pending/bb_75_request_stage.sql (rename this file's first line when it is numbered).
--
-- Runs against the live database inside a rolled-back transaction: one fresh offer with an unused code,
-- fresh staff accounts and unused phone numbers, every setting it measures pinned inside the transaction.
-- Every assertion is scoped to the fixtures, so real traffic can neither hide a failure nor cause one.
--
-- WHAT THIS FILE IS FOR. bb_75 exists because a person is not a request, and the ONE case that proves it is
-- a client with TWO demands: today he has one status, and that single answer is wrong for at least one of
-- them. So section 2 builds exactly that client — two demands on one file — walks the FIRST one from
-- «مطلب جديد» to «مالك» through the real RPCs, and after every single act asserts that the SECOND demand
-- did not move. If bb_75 ever starts reading person_id where it should read request_id, that is the section
-- that goes red, at the exact act where it broke.
--
-- Section 3 is the relationship to bb_70: the person-level answer is the HIGHEST of their demands, the two
-- readers agree on that, and neither is computed twice. Section 4 is the one honest compromise — stage 2 is
-- person-scoped and says so. Section 5 is §27.

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'staff_request_journey') then
    raise exception
      'supabase/pending/bb_75_request_stage.sql is not applied yet, and this test file belongs to it. Dry-run the chain: node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_70_journey.sql supabase/pending/bb_75_request_stage.sql supabase/tests/061_request_stage.sql';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'journey_spine') then
    raise exception
      'supabase/pending/bb_70_journey.sql is not applied. bb_75 derives every stage from its spine; dry-run both together.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.rq_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- The stage key of one demand, straight from the reader a screen would call.
create function pg_temp.rq_stage(p_request uuid) returns text language sql as $$
  select public.staff_request_journey(p_request)->'stage'->>'key'
$$;

create function pg_temp.rq_rank(p_request uuid) returns integer language sql as $$
  select (public.staff_request_journey(p_request)->'stage'->>'rank')::integer
$$;

create function pg_temp.rq_payload(p_project text, p_trees text, p_phone text) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف بزوز مطالب',
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
  for i in 1..2 loop
    loop
      v_phone := '+21696' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.rq_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);
select set_config('test.rq_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 0)), '.'), true)
from (values ('اختبار مرحلة المطلب الواحد')) as t (s);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures — ONE client, TWO demands
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_com   uuid := gen_random_uuid();
  v_com2  uuid := gen_random_uuid();
  v_class uuid;
  v_proj  uuid;
  v_code  text;
  v_pid   uuid;
  v_rid   uuid;
begin
  update public.feature_flags set state = 'public'
   where key in ('projects', 'pricing', 'reservations', 'visits', 'contracts', 'installments');
  update public.settings set value = to_jsonb(1) where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4) where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  -- Two demands from one phone on one day is the whole fixture; the anti-spam ceiling must not refuse it.
  update public.settings set value = to_jsonb(9) where key = 'antispam.max_requests_per_phone_per_day';
  update public.settings set value = to_jsonb(1)  where key = 'visits.min_lead_days';
  update public.settings set value = to_jsonb(90) where key = 'visits.max_ahead_days';
  update public.settings set value = '[]'::jsonb  where key = 'visits.closed_weekdays';
  update public.settings set value = to_jsonb(6)  where key = 'visits.max_people';
  update public.settings set value = to_jsonb(false) where key = 'contracts.deposit_counts_toward_down_payment';
  update public.settings set value = to_jsonb(true)  where key = 'contracts.require_deposit_paid';

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'rq-admin-' || v_admin || '@test.local', '{"full_name":"Admin Matlab"}'),
    (v_com,   'authenticated', 'authenticated', 'rq-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Matlab"}'),
    (v_com2,  'authenticated', 'authenticated', 'rq-com2-'  || v_com2  || '@test.local', '{"full_name":"Commercial Okhra"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_com, 'commercial'), (v_com2, 'commercial');
  perform set_config('test.rq_admin', v_admin::text, true);
  perform set_config('test.rq_com',   v_com::text,   true);
  perform set_config('test.rq_com2',  v_com2::text,  true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  v_code := 'RQS-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count,
                               reservation_deposit_millimes, reservation_valid_days, reservation_conditions_ar)
  values (v_code, 'عرض مرحلة المطلب', 34, 'published', 40, 75000, 30, 'شروط عرض الاختبار.')
  returning id into v_proj;
  perform set_config('test.rq_project', v_proj::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_proj, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_proj, 7000, 50000, 150000, 'percent', 1000, 1000);

  -- DEMAND A, then DEMAND B, from the SAME phone — which is what makes them one person with two demands.
  perform set_config('test.rq_a_no',
    (public.submit_offer_request(pg_temp.rq_payload(v_proj::text, '3', current_setting('test.rq_phone_1')))->>'request_no'),
    true);
  select r.id, r.person_id into v_rid, v_pid
  from public.interest_requests r where r.request_no = current_setting('test.rq_a_no');
  perform set_config('test.rq_a', v_rid::text, true);
  perform set_config('test.rq_person', v_pid::text, true);

  perform set_config('test.rq_b_no',
    (public.submit_offer_request(pg_temp.rq_payload(v_proj::text, '5', current_setting('test.rq_phone_1')))->>'request_no'),
    true);
  select r.id into v_rid
  from public.interest_requests r where r.request_no = current_setting('test.rq_b_no');
  perform set_config('test.rq_b', v_rid::text, true);

  -- A THIRD demand on another client entirely, assigned to one commercial — §27's fixture.
  perform set_config('test.rq_c_no',
    (public.submit_offer_request(pg_temp.rq_payload(v_proj::text, '2', current_setting('test.rq_phone_2')))->>'request_no'),
    true);
  select r.id, r.person_id into v_rid, v_pid
  from public.interest_requests r where r.request_no = current_setting('test.rq_c_no');
  perform set_config('test.rq_c', v_rid::text, true);
  update public.persons set assigned_to = current_setting('test.rq_com')::uuid where id = v_pid;
end $$;

-- THE PREMISE OF THIS WHOLE FILE, asserted rather than assumed: two demands, one client.
do $$
declare
  v_people integer;
begin
  select count(distinct r.person_id) into v_people
  from public.interest_requests r
  where r.id in (current_setting('test.rq_a')::uuid, current_setting('test.rq_b')::uuid);
  assert v_people = 1,
    'the fixture is ONE client with TWO demands; got ' || v_people || ' people. If submit_offer_request stopped matching on phone, this file is measuring the wrong thing.';
  assert current_setting('test.rq_a') <> current_setting('test.rq_b'),
    'and they are two different demands';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rq_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_generate_trees(current_setting('test.rq_project')::uuid, current_setting('test.rq_reason'));
reset role;

-- ---------------------------------------------------------------------------
-- 1 · The payload: the same thirteen stages, and this demand's own identifiers
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rq_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_j     jsonb := public.staff_request_journey(current_setting('test.rq_a')::uuid);
  v_keys  text[];
begin
  assert v_j is not null, 'a demand that exists has a journey';
  assert jsonb_array_length(v_j->'spine') = 13,
    'the path is bb_70''s thirteen stages, got ' || jsonb_array_length(v_j->'spine');

  select array_agg(s->>'key' order by (s->>'rank')::integer) into v_keys
  from jsonb_array_elements(v_j->'spine') s;
  -- Compared through bb_70's PUBLIC reader, not app.journey_spine(): this block runs as `authenticated`,
  -- which is exactly the role a screen runs as, and app.* is revoked from it. Reaching into the private
  -- schema here would assert something no caller can actually do.
  assert v_keys = (select array_agg(s->>'key' order by (s->>'rank')::integer)
                   from jsonb_array_elements(public.staff_journey_spine()->'stages') s),
    'and it IS bb_70''s spine, not a second copy of it';

  assert v_j->>'unknown' = app.setting_text('journey.unknown_label', 'غير معروف'),
    'the word for «no fact» comes from settings, like everywhere else';

  -- §26 threaded down ONE demand.
  assert v_j->'ids'->>'request_no' = current_setting('test.rq_a_no'),
    'the payload names the demand it is about';
  assert v_j->'ids'->>'person_id' = current_setting('test.rq_person'),
    'and the client it belongs to';
  assert (v_j->'ids'->>'offer_trees')::integer = 3,
    'and how many trees this demand asked for, which is the figure that differs between A and B';
  assert (public.staff_request_journey(current_setting('test.rq_b')::uuid)->'ids'->>'offer_trees')::integer = 5,
    'demand B asked for five, and the payload does not mix the two';

  assert public.staff_request_journey(gen_random_uuid()) is null,
    'a demand that does not exist is null, not an error and not an empty stage';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · THE CASE THE MODULE EXISTS FOR. Demand A walks the whole journey.
--     After every act: A moved, and B did NOT.
-- ---------------------------------------------------------------------------

-- 2.1 · Both demands start at «مطلب جديد», each proven by ITSELF.
do $$
declare
  v_a jsonb := public.staff_request_journey(current_setting('test.rq_a')::uuid);
  v_b jsonb := public.staff_request_journey(current_setting('test.rq_b')::uuid);
begin
  assert v_a->'stage'->>'key' = 'lead' and v_b->'stage'->>'key' = 'lead',
    'a demand with nothing behind it is at «مطلب جديد»';
  assert v_a->'stage'->'proof'->>'ref' = current_setting('test.rq_a_no')
     and v_b->'stage'->'proof'->>'ref' = current_setting('test.rq_b_no'),
    'and each one is proven by its OWN number, never the other''s';
  assert v_a->'stage'->'proof'->>'kind' = 'request',
    'the floor of a demand is the demand itself — bb_70''s person fallback cannot happen here';
end $$;

-- 2.2 · موعد زيارة محدد — the visit names demand A.
select set_config('test.rq_visit',
  (public.staff_book_visit(jsonb_build_object(
     'person_id', current_setting('test.rq_person'),
     'project_id', current_setting('test.rq_project'),
     'request_id', current_setting('test.rq_a'),
     'status', 'confirmed',
     'visit_date', ((now() at time zone 'Africa/Tunis')::date + 3)::text,
     'slot_option_id', (select o.id::text from public.option_items o
                        where o.list_key = 'visit_slot' and o.is_active order by o.sort_order limit 1),
     'people_count', '2',
     'contact_channel', 'phone',
     'staff_note', 'يحب يشوف الأرض قبل ما يقرر.'),
   current_setting('test.rq_reason'))->>'id'), true);

do $$
begin
  assert pg_temp.rq_stage(current_setting('test.rq_a')::uuid) = 'visit_scheduled',
    'a confirmed visit booked AGAINST demand A moves A, got ' || pg_temp.rq_stage(current_setting('test.rq_a')::uuid);
  assert pg_temp.rq_stage(current_setting('test.rq_b')::uuid) = 'lead',
    'AND B DID NOT MOVE. This is the whole file: got ' || pg_temp.rq_stage(current_setting('test.rq_b')::uuid);
  assert (public.staff_request_journey(current_setting('test.rq_a')::uuid)->'ids'->>'visit_no') is not null,
    'the visit number travels on A';
  assert (public.staff_request_journey(current_setting('test.rq_b')::uuid)->'ids'->>'visit_no') is null,
    'and not on B — B has no visit';
end $$;

-- 2.3 · تمت الزيارة
select public.staff_set_visit_status(current_setting('test.rq_visit')::uuid, 'completed',
  jsonb_build_object('outcome_liked', 'true', 'outcome_next_step', 'يحب يحجز 3 زيتونات'),
  current_setting('test.rq_reason'));

do $$
begin
  assert pg_temp.rq_stage(current_setting('test.rq_a')::uuid) = 'visit_completed',
    'a completed visit puts A at «تمت الزيارة», got ' || pg_temp.rq_stage(current_setting('test.rq_a')::uuid);
  assert pg_temp.rq_stage(current_setting('test.rq_b')::uuid) = 'lead', 'B still has not moved';
end $$;

-- 2.4 · اختيار الزيتونات — trees held against demand B this time, to prove the split runs BOTH ways.
select public.staff_allocate_trees(
  p_project => current_setting('test.rq_project')::uuid,
  p_person  => current_setting('test.rq_person')::uuid,
  p_request => current_setting('test.rq_b')::uuid,
  p_trees   => 5,
  p_state   => 'reserved',
  p_reason  => current_setting('test.rq_reason'));

do $$
declare
  v_b jsonb := public.staff_request_journey(current_setting('test.rq_b')::uuid);
begin
  assert v_b->'stage'->>'key' = 'trees_selected',
    'trees held against B with no hold behind them put B at «اختيار الزيتونات», got ' || coalesce(v_b->'stage'->>'key', 'null');
  assert v_b->'stage'->'proof'->>'ref' = '5',
    'and the proof counts THIS demand''s trees: ' || (v_b->'stage'->'proof')::text;
  assert (v_b->'ids'->>'trees_held')::integer = 5, 'B holds five';
  assert (public.staff_request_journey(current_setting('test.rq_a')::uuid)->'ids'->>'trees_held')::integer = 0,
    'and A holds none — the trees did not leak across the two demands of one client';
  assert pg_temp.rq_stage(current_setting('test.rq_a')::uuid) = 'visit_completed',
    'A did not move when B took trees, which is the same split read the other way round';
end $$;

-- 2.5 · حجز — back on A.
select set_config('test.rq_res',
  (public.staff_create_reservation(
     p_project => current_setting('test.rq_project')::uuid,
     p_person  => current_setting('test.rq_person')::uuid,
     p_request => current_setting('test.rq_a')::uuid,
     p_trees   => 3,
     p_note    => 'حجز بعد الزيارة.',
     p_reason  => current_setting('test.rq_reason'))->>'id'), true);

do $$
declare
  v_a jsonb := public.staff_request_journey(current_setting('test.rq_a')::uuid);
begin
  assert v_a->'stage'->>'key' = 'reservation',
    'an open hold on A puts A at «حجز», got ' || coalesce(v_a->'stage'->>'key', 'null');
  assert v_a->'stage'->'proof'->>'ref' = v_a->'ids'->>'reservation_no',
    'proven by the hold, named by its own number';
  assert pg_temp.rq_stage(current_setting('test.rq_b')::uuid) = 'trees_selected',
    'B stayed where its own facts put it, got ' || pg_temp.rq_stage(current_setting('test.rq_b')::uuid);
end $$;

-- 2.6 · العربون مدفوع
select public.staff_record_deposit(current_setting('test.rq_res')::uuid, 75000,
  (select o.id from public.option_items o where o.list_key = 'payment_method' and o.code = 'cash'),
  now(), 'REC-058', 'عربون نقداً.', current_setting('test.rq_reason'));

do $$
begin
  assert pg_temp.rq_stage(current_setting('test.rq_a')::uuid) = 'deposit_paid',
    'the عربون arriving puts A at «العربون مدفوع», got ' || pg_temp.rq_stage(current_setting('test.rq_a')::uuid);
  assert (public.staff_request_journey(current_setting('test.rq_a')::uuid)->'stage'->'proof'->>'at') is not null,
    'and the stage carries the day the money landed';
  assert pg_temp.rq_stage(current_setting('test.rq_b')::uuid) = 'trees_selected',
    'money against A is not money against B';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · A demand is in exactly ONE stage, and the path agrees with it
-- ---------------------------------------------------------------------------

do $$
declare
  v_j       jsonb;
  v_current integer;
  v_rid     uuid;
begin
  foreach v_rid in array array[current_setting('test.rq_a')::uuid, current_setting('test.rq_b')::uuid] loop
    v_j := public.staff_request_journey(v_rid);

    assert (select count(*) from jsonb_array_elements(v_j->'spine') s
            where (s->>'current')::boolean) = 1,
      'exactly one stage is «current» — a demand cannot be in two places';

    select (s->>'rank')::integer into v_current
    from jsonb_array_elements(v_j->'spine') s where (s->>'current')::boolean;
    assert v_current = (v_j->'stage'->>'rank')::integer,
      'and the current stage of the path IS the derived stage, never a second opinion';

    assert (select bool_and(((s->>'rank')::integer <= v_current) = (s->>'reached')::boolean)
            from jsonb_array_elements(v_j->'spine') s),
      '«reached» is rank <= current, so a band draws the path without doing arithmetic of its own';

    -- The two stages nothing can prove stay marked even when they are behind the current one.
    assert (select bool_and((s->>'has_fact')::boolean is false)
            from jsonb_array_elements(v_j->'spine') s
            where s->>'key' in ('qualified', 'contract_scheduled')),
      'the two stages with no fact are still marked so, so a screen draws them hollow rather than claiming them';
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · The relationship to bb_70, and the one person-scoped answer
-- ---------------------------------------------------------------------------

-- THE POINT, STATED AS AN ASSERTION. The person-level reader gives ONE answer; the two demands give two,
-- and they are not the same. That difference is the bug the owner reported, measured.
do $$
declare
  v_person integer := (public.staff_customer_journey(current_setting('test.rq_person')::uuid)->'stage'->>'rank')::integer;
  v_a      integer := pg_temp.rq_rank(current_setting('test.rq_a')::uuid);
  v_b      integer := pg_temp.rq_rank(current_setting('test.rq_b')::uuid);
begin
  assert v_a <> v_b,
    'the two demands of one client are at DIFFERENT stages (' || v_a || ' and ' || v_b || '), which is exactly what a single person-level status cannot say';
  assert v_person = greatest(v_a, v_b),
    'and the person-level answer is the highest of their demands (' || v_person || ' vs ' || greatest(v_a, v_b) || ') — the two readers agree, and the person one is simply coarser';
  assert v_person <> least(v_a, v_b),
    'so reading the person where the demand was meant silently promotes the quieter demand — the owner''s «حاجة ناقصة»';
end $$;

-- Stage 2 is the one answer a demand cannot prove alone, and it SAYS so rather than implying otherwise.
do $$
declare
  v_c jsonb;
begin
  -- Demand C has nothing behind it, so a call on its client is the only thing that can move it.
  assert pg_temp.rq_stage(current_setting('test.rq_c')::uuid) = 'lead',
    'demand C starts at «مطلب جديد»';

  insert into public.contact_attempts (person_id, channel, outcome, note, created_by)
  select r.person_id, 'phone', 'answered', 'تكلمنا معاه.', current_setting('test.rq_admin')::uuid
  from public.interest_requests r where r.id = current_setting('test.rq_c')::uuid;

  v_c := public.staff_request_journey(current_setting('test.rq_c')::uuid);
  assert v_c->'stage'->>'key' = 'contacted',
    'a call after the demand arrived moves it to «تم الاتصال», got ' || coalesce(v_c->'stage'->>'key', 'null');
  assert (v_c->'stage'->'proof'->>'person_scoped')::boolean,
    'AND THE PROOF ADMITS IT IS PERSON-SCOPED: public.contact_attempts carries no request_id, so the screen must say «اتصال بالحريف» and not pretend somebody phoned about this row';
end $$;

-- A call placed BEFORE a demand existed cannot be about it. This is the rule that keeps stage 2 honest:
-- without it, every past call on a returning client would silently promote their newest demand to «تم
-- الاتصال» on the day it arrived.
--
-- THE BACKDATE RUNS AS THE TABLE OWNER. `authenticated` holds no UPDATE grant on public.contact_attempts and
-- must not — a call is written once, by an RPC, and never edited. Only the fixture needs the clock moved;
-- the ASSERTION goes straight back to authenticated, because that is the role a screen reads as.
reset role;
update public.contact_attempts set created_at = now() - interval '30 days'
where person_id = (select r.person_id from public.interest_requests r
                   where r.id = current_setting('test.rq_c')::uuid);

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rq_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  assert pg_temp.rq_stage(current_setting('test.rq_c')::uuid) = 'lead',
    'a call from before the demand arrived does not count for it, got ' || pg_temp.rq_stage(current_setting('test.rq_c')::uuid);
end $$;

-- The list reader answers for many demands in one call, and agrees with the single reader.
do $$
declare
  v_rows jsonb := public.staff_request_stage(
    array[current_setting('test.rq_a')::uuid, current_setting('test.rq_b')::uuid]);
begin
  assert jsonb_array_length(v_rows) = 2, 'two demands in, two answers out';
  assert (select bool_and(
            (r->'stage'->>'key') = pg_temp.rq_stage((r->>'request_id')::uuid))
          from jsonb_array_elements(v_rows) r),
    'the list reader and the single reader are the same function, so they cannot disagree';
  assert public.staff_request_stage('{}'::uuid[]) = '[]'::jsonb,
    'no ids in, empty list out — never an error';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5 · §27 · Who may read a demand
-- ---------------------------------------------------------------------------

-- A visitor is stopped by the GRANT, one layer before the role check inside the function even runs. That is
-- the stronger refusal and the one worth pinning: execute is revoked from anon on both readers.
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.rq_expect(
  format('select public.staff_request_journey(%L::uuid)', current_setting('test.rq_a')),
  'permission denied for function staff_request_journey');
select pg_temp.rq_expect(
  format('select public.staff_request_stage(array[%L::uuid])', current_setting('test.rq_a')),
  'permission denied for function staff_request_stage');
reset role;

-- A commercial reads their own client's demand and no other.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rq_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  assert public.staff_request_journey(current_setting('test.rq_c')::uuid) is not null,
    'the commercial reads the demand of the client assigned to them';
end $$;

select pg_temp.rq_expect(
  format('select public.staff_request_journey(%L::uuid)', current_setting('test.rq_a')), 'forbidden');

-- And the list reader does not leak what the single reader refuses: a demand they may not see is ABSENT,
-- never nulled and never counted.
do $$
declare
  v_rows jsonb := public.staff_request_stage(
    array[current_setting('test.rq_a')::uuid, current_setting('test.rq_c')::uuid]);
begin
  assert jsonb_array_length(v_rows) = 1,
    'the list holds only the demand this commercial may see, got ' || jsonb_array_length(v_rows);
  assert v_rows->0->>'request_id' = current_setting('test.rq_c'),
    'and it is theirs';
end $$;

-- The second commercial, assigned nothing, sees neither.
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.rq_com2'), 'role', 'authenticated')::text, true);
set local role authenticated;

select pg_temp.rq_expect(
  format('select public.staff_request_journey(%L::uuid)', current_setting('test.rq_c')), 'forbidden');

do $$
begin
  assert public.staff_request_stage(
    array[current_setting('test.rq_a')::uuid, current_setting('test.rq_c')::uuid]) = '[]'::jsonb,
    'a commercial with no files assigned gets an empty list, not a partial one';
end $$;

reset role;
