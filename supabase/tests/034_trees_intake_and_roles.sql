-- The olive tree is the unit of inventory: it is generated once, counted in four figures, handed out in
-- lowest-numbered blocks, and never sold below the offer's minimum.
-- Migration bb_trees.sql (numbered supabase/migrations/0054_trees.sql while this test was being written).
--
-- Owner, 2026-09-18: «the unit is a tree not m carre» · «we just give each tree a number or an id and associate
-- it with the client» · «there is a minimum of trees to buy, it depends on the offer».
--
-- Runs against the live database inside a rolled-back transaction: four offers with unused codes, three fresh
-- staff accounts, unused phone numbers, and every setting and flag it measures pinned inside the transaction.
-- Every count is scoped to the fixtures, so real traffic can neither hide a failure nor cause one.
--
-- Nothing below reads or writes a parcel. This phase adds the tree layer and retires nothing; section 10 holds
-- that line, and would fail the day someone starts removing the parcel layer without its own migration.

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

-- The reason guard is a setting since 0058 and the owner turned it off (audit.reason_min_length = 0). This file
-- asserts that allocating and releasing trees refuse a blank reason, which is the guard's behaviour WHILE IT IS
-- ON, so it turns it on inside its own transaction. The runner rolls this back; the live value is untouched.
update public.settings set value = to_jsonb(5) where key = 'audit.reason_min_length';

create function pg_temp.tr_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- An offer request with everything valid; each test overrides the part it is about (as test 031 does).
create function pg_temp.tr_payload(p_project text, p_trees text, p_phone text, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف الزيتونات',
    'phone_e164', p_phone,
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', p_project,
    'trees', p_trees
  ) || p_extra
$$;

-- Identity of an offer's trees, up to a given number: the ids as well as the codes, because «idempotent» means
-- the second run leaves the very same rows, not rows that merely count the same.
create function pg_temp.tr_fingerprint(p_project uuid, p_max_seq integer default 1000000) returns text
language sql as $$
  select coalesce(md5(string_agg(t.id::text || ':' || t.seq::text || ':' || t.code, ',' order by t.seq)), '')
  from public.trees t
  where t.project_id = p_project and t.seq <= p_max_seq
$$;

-- Which trees of an offer are in a given state, in tree order: the shape allocation is supposed to produce.
create function pg_temp.tr_seqs(p_project uuid, p_state text) returns integer[] language sql as $$
  select coalesce(array_agg(t.seq order by t.seq), '{}')
  from public.trees t
  where t.project_id = p_project and t.state::text = p_state
$$;

-- Unused phone numbers: this file takes real intakes, and an intake is throttled per phone (LEAD-06).
do $$
declare
  v_used  text[] := '{}';
  v_phone text;
  i       integer;
begin
  for i in 1..12 loop
    loop
      v_phone := '+21697' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.tr_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);

-- Padded so the file still passes if the owner raised the live minimum (§51).
select set_config('test.tr_reason',
  rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 5)), '.'), true)
from (values ('حجز زيتونات لحريف بعد مكالمة')) as t (s);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures: the staff, four offers and the demand that will become a reservation
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin   uuid := gen_random_uuid();
  v_com     uuid := gen_random_uuid();
  v_plain   uuid := gen_random_uuid();
  v_class   uuid;
  v_id      uuid;
  v_code    text;
  v_status  uuid;
  v_request uuid;
  v_person  uuid;
  v_result  jsonb;
begin
  -- Pinned inside this transaction, so the file measures its own inputs and never the live configuration.
  update public.feature_flags set state = 'public' where key in ('projects', 'pricing');
  update public.settings set value = to_jsonb(1) where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4) where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(3) where key = 'antispam.max_requests_per_phone_per_day';

  -- One admin (inventory and contracts), one commercial (their own file and no more), one signed-in user with
  -- no role at all — the three callers the migration's role split talks about.
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'trees-admin-' || v_admin || '@test.local', '{"full_name":"Admin Zitouna"}'),
    (v_com,   'authenticated', 'authenticated', 'trees-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Zitouna"}'),
    (v_plain, 'authenticated', 'authenticated', 'trees-plain-' || v_plain || '@test.local', '{"full_name":"Bla Dawr"}');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin'), (v_com, 'commercial');
  perform set_config('test.tr_admin', v_admin::text, true);
  perform set_config('test.tr_com', v_com::text, true);
  perform set_config('test.tr_plain', v_plain::text, true);

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  -- A · the offer this file generates, counts and empties. No minimum and no pattern of its own: it inherits.
  v_code := 'TRZ-A-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_code, 'عرض الزيتونات', 34, 'published', 12) returning id into v_id;
  perform set_config('test.tr_a', v_id::text, true);
  perform set_config('test.tr_a_code', v_code, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);

  -- B · an offer that sells five trees at a time and numbers them its own way.
  v_code := 'TRZ-B-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count, min_trees_per_order, tree_code_pattern)
  values (v_code, 'عرض بأقلّ عدد', 34, 'published', 20, 5, 'ZT-{seq}') returning id into v_id;
  perform set_config('test.tr_b', v_id::text, true);
  perform set_config('test.tr_b_code', v_code, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);

  -- C · an offer smaller than a raised global minimum, for the cap.
  v_code := 'TRZ-C-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_code, 'عرض صغير', 34, 'published', 2) returning id into v_id;
  perform set_config('test.tr_c', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);

  -- D · an offer that is not on sale: a visitor must not learn its stock either.
  v_code := 'TRZ-D-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_code, 'عرض مازال داخلي', 34, 'internal', 5) returning id into v_id;
  perform set_config('test.tr_d', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);

  -- The demand the reservation will point back at, taken by the real intake (0049 + §8 of this migration).
  v_result := public.submit_offer_request(
    pg_temp.tr_payload(current_setting('test.tr_a'), '3', current_setting('test.tr_phone_1')));
  select r.id, r.person_id into v_request, v_person
  from public.interest_requests r where r.request_no = v_result->>'request_no';
  perform set_config('test.tr_request', v_request::text, true);
  perform set_config('test.tr_p1', v_person::text, true);

  -- A second client, this one in the commercial's file (COM-05).
  select s.id into v_status from public.lead_statuses s
  where s.stage = 'new' and s.is_active order by s.is_stage_default desc, s.sort_order limit 1;
  insert into public.persons (full_name, phone_e164, whatsapp_e164, governorate_id, status_id,
                              consent_at, last_request_at, assigned_to)
  values ('حريفة الكوميرسيال', current_setting('test.tr_phone_2'), current_setting('test.tr_phone_2'), 34,
          v_status, now(), now(), v_com)
  returning id into v_id;
  perform set_config('test.tr_p2', v_id::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · An offer's trees are materialised once, numbered 1..tree_count, each with its own code
-- ---------------------------------------------------------------------------

select set_config('test.tr_log_gen',
  (select count(*)::text from public.audit_logs a
   where a.action = 'trees.generate' and a.entity_id = current_setting('test.tr_a')), true);

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.tr_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.staff_generate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 12 and (v->>'added')::integer = 12 and (v->>'removed')::integer = 0,
    'the first generation materialises the whole offer and nothing else, got ' || v::text;
  assert (v->>'tree_count')::integer = 12 and v->>'offer_code' = current_setting('test.tr_a_code'),
    'and says which offer it filled, got ' || v::text;
  -- The pattern is inherited from the setting: {offer} first, then {seq} padded to offers.tree_code_digits.
  assert v->>'first_code' = current_setting('test.tr_a_code') || '-0001'
     and v->>'last_code'  = current_setting('test.tr_a_code') || '-0012',
    'the codes are rendered from {offer}-{seq}, got ' || coalesce(v->>'first_code', 'null')
    || ' .. ' || coalesce(v->>'last_code', 'null');
end $$;

reset role;

do $$
declare
  v_a uuid := current_setting('test.tr_a')::uuid;
  v_n integer;
begin
  select count(*) into v_n from public.trees t where t.project_id = v_a;
  assert v_n = 12, 'the offer holds exactly its tree_count, got ' || v_n;
  assert (select min(t.seq) from public.trees t where t.project_id = v_a) = 1
     and (select max(t.seq) from public.trees t where t.project_id = v_a) = 12
     and (select count(distinct t.seq) from public.trees t where t.project_id = v_a) = 12,
    'the numbering is dense, 1..12';
  assert (select count(distinct t.code) from public.trees t where t.project_id = v_a) = 12,
    'every code is unique inside the offer';
  assert not exists (select 1 from public.trees t
                     where t.project_id = v_a
                       and (t.state <> 'available' or t.held_by is not null
                            or t.allocated_at is not null or t.request_id is not null)),
    'a freshly generated tree is available and belongs to nobody';

  -- Generation is per offer: the others were not touched.
  assert (select count(*) from public.trees t where t.project_id = current_setting('test.tr_b')::uuid) = 0,
    'generating one offer generates no other';

  -- §51: one act, one event. Five hundred identical blank rows are not five hundred decisions.
  assert (select count(*) from public.audit_logs a
          where a.action = 'trees.generate' and a.entity_id = current_setting('test.tr_a'))
         = current_setting('test.tr_log_gen')::integer + 1,
    'the generation wrote exactly one named event';
  assert (select a.reason = current_setting('test.tr_reason')
            and a.actor_id = current_setting('test.tr_admin')::uuid
            and a.new_data->>'added' = '12' and a.new_data->>'trees' = '12'
          from public.audit_logs a
          where a.action = 'trees.generate' and a.entity_id = current_setting('test.tr_a')
          order by a.id desc limit 1),
    'and it carries who, what and why';
  assert not exists (select 1 from public.audit_logs a where a.entity = 'trees' and a.action = 'insert'),
    'the row trigger stays on update and delete: creating stock is logged once, not once per tree';

  -- The table's own rules, straight from the constraints.
  begin
    insert into public.trees (project_id, seq, code)
    values (v_a, 1, 'DOUBLON-0001');
    raise exception 'two trees of one offer must not share a number';
  exception when unique_violation then null;
  end;
  begin
    insert into public.trees (project_id, seq, code)
    values (v_a, 99, current_setting('test.tr_a_code') || '-0001');
    raise exception 'two trees of one offer must not share a code';
  exception when unique_violation then null;
  end;
  begin
    insert into public.trees (project_id, seq, code, state)
    values (v_a, 98, 'SANS-PROPRIO-0098', 'reserved');
    raise exception 'a held tree must say who holds it';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Running it again changes nothing; growing adds; shrinking refuses to take a client's tree
-- ---------------------------------------------------------------------------

select set_config('test.tr_fp', pg_temp.tr_fingerprint(current_setting('test.tr_a')::uuid), true);
select set_config('test.tr_log_del',
  (select count(*)::text from public.audit_logs a where a.entity = 'trees' and a.action = 'delete'), true);

set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- a · the same button, pressed twice
  v := public.staff_generate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_reason'));
  assert (v->>'added')::integer = 0 and (v->>'removed')::integer = 0 and (v->>'trees')::integer = 12,
    'the second generation adds nothing and removes nothing, got ' || v::text;

  -- b · the offer grows: only the missing numbers are inserted
  update public.projects set tree_count = 15 where id = current_setting('test.tr_a')::uuid;
  v := public.staff_generate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_reason'));
  assert (v->>'added')::integer = 3 and (v->>'removed')::integer = 0 and (v->>'trees')::integer = 15,
    'growing tree_count adds exactly the new numbers, got ' || v::text;
  assert v->>'last_code' = current_setting('test.tr_a_code') || '-0015',
    'and numbers them on from the last one, got ' || coalesce(v->>'last_code', 'null');

  -- c · the offer shrinks while every surplus tree is still free
  update public.projects set tree_count = 12 where id = current_setting('test.tr_a')::uuid;
  v := public.staff_generate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_reason'));
  assert (v->>'added')::integer = 0 and (v->>'removed')::integer = 3 and (v->>'trees')::integer = 12,
    'lowering tree_count removes the surplus free trees, got ' || v::text;
end $$;

reset role;

do $$
begin
  assert pg_temp.tr_fingerprint(current_setting('test.tr_a')::uuid) = current_setting('test.tr_fp'),
    'twelve trees grown to fifteen and back are the very same twelve rows, ids and codes included';
  assert (select count(*) from public.audit_logs a where a.entity = 'trees' and a.action = 'delete')
         = current_setting('test.tr_log_del')::integer + 3,
    'the three trees that were removed were logged one by one';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.tr_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v       jsonb;
  v_last  uuid;
  v_free  uuid[];
begin
  -- d · a tree that belongs to someone is never deleted by a Back Office edit
  v := public.staff_allocate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_p1')::uuid,
                                   null, 12, 'reserved', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 12, 'the whole offer can be taken at once, got ' || v::text;

  select array_agg(t.id order by t.seq) into v_free
  from public.trees t where t.project_id = current_setting('test.tr_a')::uuid and t.seq <= 11;
  select t.id into v_last
  from public.trees t where t.project_id = current_setting('test.tr_a')::uuid and t.seq = 12;

  v := public.staff_set_tree_state(v_free, 'available', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 11, 'eleven trees go back on sale in one act, got ' || v::text;

  update public.projects set tree_count = 11 where id = current_setting('test.tr_a')::uuid;
  perform pg_temp.tr_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_reason')),
    'trees_taken_below_count');

  -- e · back to a clean twelve
  update public.projects set tree_count = 12 where id = current_setting('test.tr_a')::uuid;
  v := public.staff_set_tree_state(array[v_last], 'available', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 1, 'the last tree is released too';

  -- f · an offer that declares no tree has nothing to materialise
  update public.projects set tree_count = 0 where id = current_setting('test.tr_a')::uuid;
  perform pg_temp.tr_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_reason')),
    'offer_has_no_trees');
  update public.projects set tree_count = 12 where id = current_setting('test.tr_a')::uuid;
end $$;

reset role;

do $$
begin
  assert (select count(*) from public.trees t where t.project_id = current_setting('test.tr_a')::uuid) = 12,
    'the refusals changed nothing: the twelve trees are still there';
  assert pg_temp.tr_fingerprint(current_setting('test.tr_a')::uuid) = current_setting('test.tr_fp'),
    'and they are still the same rows';
  assert pg_temp.tr_seqs(current_setting('test.tr_a')::uuid, 'available') = array(select generate_series(1, 12)),
    'all twelve are back on sale, got ' || pg_temp.tr_seqs(current_setting('test.tr_a')::uuid, 'available')::text;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · The four figures the owner named: إجمالي · المتاحة · المحجوزة · المباعة
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb := app.offer_stock_payload(current_setting('test.tr_a')::uuid);
begin
  assert (v->>'trees_declared')::integer = 12 and (v->>'trees_total')::integer = 12
     and (v->>'trees_available')::integer = 12 and (v->>'trees_reserved')::integer = 0
     and (v->>'trees_sold')::integer = 0,
    'a generated, untouched offer is twelve trees, all available, got ' || v::text;
  assert v->>'status' = 'ok', 'and it says so, got ' || coalesce(v->>'status', 'null');
  assert (v->>'min_trees')::integer = 1, 'with the inherited minimum beside them, got ' || v::text;

  -- An offer whose trees were never materialised says «unknown», not «none»: «0 متاحة» on a live offer is a lie.
  v := app.offer_stock_payload(current_setting('test.tr_c')::uuid);
  assert v->>'status' = 'not_generated' and (v->>'trees_total')::integer = 0
     and (v->>'trees_declared')::integer = 2,
    'an offer with no tree row yet is «not_generated», got ' || v::text;
end $$;

select set_config('test.tr_log_alloc',
  (select count(*)::text from public.audit_logs a
   where a.action = 'trees.allocate' and a.entity_id = current_setting('test.tr_a')), true);
select set_config('test.tr_log_upd',
  (select count(*)::text from public.audit_logs a where a.entity = 'trees' and a.action = 'update'), true);

set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- Two trees reserved for the client whose demand opened this file, then one of them contracted.
  v := public.staff_allocate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_p1')::uuid,
                                   current_setting('test.tr_request')::uuid, 2, 'reserved',
                                   current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 2 and v->>'state' = 'reserved',
    'two trees are reserved for the client, got ' || v::text;

  v := public.staff_set_tree_state(
         (select array_agg(t.id) from public.trees t
          where t.project_id = current_setting('test.tr_a')::uuid and t.seq = 1),
         'sold', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 1 and v->>'state' = 'sold', 'one of them is contracted, got ' || v::text;

  -- The Back Office twin reads the same four figures.
  v := public.staff_offer_stock(current_setting('test.tr_a')::uuid);
  assert (v->>'trees_total')::integer = 12 and (v->>'trees_available')::integer = 10
     and (v->>'trees_reserved')::integer = 1 and (v->>'trees_sold')::integer = 1,
    'the figures followed the two moves, got ' || v::text;
  assert (v->>'trees_available')::integer + (v->>'trees_reserved')::integer + (v->>'trees_sold')::integer
         = (v->>'trees_total')::integer,
    'and the three states still add up to the total, got ' || v::text;
end $$;

reset role;

do $$
declare
  v_a uuid := current_setting('test.tr_a')::uuid;
begin
  assert pg_temp.tr_seqs(v_a, 'sold') = array[1] and pg_temp.tr_seqs(v_a, 'reserved') = array[2],
    'the two lowest trees are the ones that moved, got ' || pg_temp.tr_seqs(v_a, 'sold')::text
    || ' / ' || pg_temp.tr_seqs(v_a, 'reserved')::text;
  assert (select t.held_by = current_setting('test.tr_p1')::uuid
            and t.request_id = current_setting('test.tr_request')::uuid
            and t.allocated_at is not null
          from public.trees t where t.project_id = v_a and t.seq = 2),
    'a reserved tree names its client, the demand that asked for it, and when';
  assert (select t.held_by = current_setting('test.tr_p1')::uuid and t.allocated_at is not null
          from public.trees t where t.project_id = v_a and t.seq = 1),
    'and contracting it keeps the client it was held for';

  -- §51 again, on the named event and on the rows it moved.
  assert (select count(*) from public.audit_logs a
          where a.action = 'trees.allocate' and a.entity_id = current_setting('test.tr_a'))
         = current_setting('test.tr_log_alloc')::integer + 1,
    'the allocation wrote one named event';
  assert (select a.reason = current_setting('test.tr_reason')
            and a.actor_id = current_setting('test.tr_admin')::uuid
            and a.new_data->>'trees' = '2'
          from public.audit_logs a
          where a.action = 'trees.allocate' and a.entity_id = current_setting('test.tr_a')
          order by a.id desc limit 1),
    'with who, how many and why';
  assert (select count(*) from public.audit_logs a where a.entity = 'trees' and a.action = 'update')
         >= current_setting('test.tr_log_upd')::integer + 3,
    'and every tree that changed hands was logged on its own row';
  assert (select a.reason = current_setting('test.tr_reason')
          from public.audit_logs a
          where a.entity = 'trees' and a.action = 'update' order by a.id desc limit 1),
    'the row log carries the written reason too';
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Allocation: the lowest free trees, all of them or none
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.tr_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v      jsonb;
  v_code text := current_setting('test.tr_a_code');
begin
  -- Three trees: the lowest three that are free, in order, as a contiguous block.
  v := public.staff_allocate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_p1')::uuid,
                                   null, 3, 'reserved', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 3, 'three trees were taken, got ' || v::text;
  assert v->>'first_code' = v_code || '-0003' and v->>'last_code' = v_code || '-0005',
    'and they are the lowest free ones, 3 to 5, got ' || coalesce(v->>'first_code', 'null')
    || ' .. ' || coalesce(v->>'last_code', 'null');
  assert jsonb_array_length(v->'tree_ids') = 3, 'the caller is told exactly which trees, got ' || v::text;

  -- What the engine refuses before it touches a single tree.
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 2, %L, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_p1'), 'available',
           current_setting('test.tr_reason')),
    'invalid_tree_state');
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 2, %L, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_p1'), 'loué',
           current_setting('test.tr_reason')),
    'invalid_tree_state');
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 2, %L, %L)',
           current_setting('test.tr_a'), gen_random_uuid(), 'reserved', current_setting('test.tr_reason')),
    'invalid_person');
  -- A demand may only be attached to the person who made it.
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, %L::uuid, 2, %L, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_p2'), current_setting('test.tr_request'),
           'reserved', current_setting('test.tr_reason')),
    'invalid_request');
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 0, %L, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_p1'), 'reserved',
           current_setting('test.tr_reason')),
    'below_min_trees');
end $$;

reset role;

do $$
begin
  assert pg_temp.tr_seqs(current_setting('test.tr_a')::uuid, 'reserved') = array[2, 3, 4, 5],
    'the refusals took nothing: still the same four reserved trees, got '
    || pg_temp.tr_seqs(current_setting('test.tr_a')::uuid, 'reserved')::text;
end $$;

set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- A released tree goes back to the front of the queue: allocation reads the stock, not a counter.
  v := public.staff_set_tree_state(
         (select array_agg(t.id) from public.trees t
          where t.project_id = current_setting('test.tr_a')::uuid and t.seq = 4),
         'available', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 1, 'tree number four is back on sale';

  v := public.staff_allocate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_p1')::uuid,
                                   null, 1, 'reserved', current_setting('test.tr_reason'));
  assert v->>'first_code' = current_setting('test.tr_a_code') || '-0004',
    'the next client gets the tree that came back, not the next number, got '
    || coalesce(v->>'first_code', 'null');

  -- Seven are free (6..12). Asking for eight takes none at all.
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 8, %L, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_p1'), 'reserved',
           current_setting('test.tr_reason')),
    'not_enough_trees');
end $$;

reset role;

do $$
declare
  v jsonb := app.offer_stock_payload(current_setting('test.tr_a')::uuid);
begin
  -- The whole point of raising instead of returning fewer: the offer is exactly as it was.
  assert (v->>'trees_available')::integer = 7 and (v->>'trees_reserved')::integer = 4
     and (v->>'trees_sold')::integer = 1 and (v->>'trees_total')::integer = 12,
    'a refused allocation is a rolled-back allocation, got ' || v::text;
  assert pg_temp.tr_seqs(current_setting('test.tr_a')::uuid, 'available') = array[6, 7, 8, 9, 10, 11, 12],
    'no tree was half-taken, got ' || pg_temp.tr_seqs(current_setting('test.tr_a')::uuid, 'available')::text;

  -- The guard that makes «all or none» hold against a second session too. One transaction cannot prove a race,
  -- so the lock itself is the assertion: plain FOR UPDATE would let the second session wait and then take the
  -- rows the first has just allocated.
  assert (select pg_get_functiondef(p.oid)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname = 'allocate_offer_trees') ~* 'for\s+update\s+skip\s+locked',
    'the allocation still picks its trees with FOR UPDATE SKIP LOCKED';
  assert (select pg_get_functiondef(p.oid)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname = 'allocate_offer_trees') ~* 'not_enough_trees',
    'and still refuses rather than returning fewer trees than the client asked for';
end $$;

set local role authenticated;

do $$
declare
  v jsonb;
begin
  -- The rest of the offer, then nothing left at all.
  v := public.staff_allocate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_p1')::uuid,
                                   null, 7, 'reserved', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 7
     and v->>'first_code' = current_setting('test.tr_a_code') || '-0006'
     and v->>'last_code' = current_setting('test.tr_a_code') || '-0012',
    'the last seven go out as one block, got ' || v::text;

  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 1, %L, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_p1'), 'reserved',
           current_setting('test.tr_reason')),
    'not_enough_trees');
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5 · «there is a minimum of trees to buy, it depends on the offer»
-- ---------------------------------------------------------------------------

do $$
declare
  v_min_b integer := app.offer_min_trees(current_setting('test.tr_b')::uuid);
  v_min_a integer := app.offer_min_trees(current_setting('test.tr_a')::uuid);
  v_no    text;
begin
  assert v_min_b = 5, 'the offer''s own minimum wins, got ' || coalesce(v_min_b::text, 'null');
  assert v_min_a = 1, 'an offer without one inherits the setting, got ' || coalesce(v_min_a::text, 'null');
  assert (app.offer_stock_payload(current_setting('test.tr_b')::uuid)->>'min_trees')::integer = 5,
    'and the form reads the same figure from the stock payload, so the page and the database cannot disagree';

  -- The intake refuses under the minimum, with its own error: «اكتب عدد الزيتونات» would be wrong advice for
  -- someone who typed a perfectly good number that is simply too small.
  perform pg_temp.tr_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.tr_payload(current_setting('test.tr_b'), '4', current_setting('test.tr_phone_10'))),
    'below_min_trees');

  v_no := public.submit_offer_request(
    pg_temp.tr_payload(current_setting('test.tr_b'), '5', current_setting('test.tr_phone_3')))->>'request_no';
  assert (select r.offer_trees from public.interest_requests r where r.request_no = v_no) = 5,
    'and takes the request at exactly the minimum';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.tr_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 4, %L, %L)',
           current_setting('test.tr_b'), current_setting('test.tr_p1'), 'reserved',
           current_setting('test.tr_reason')),
    'below_min_trees');

  -- This offer numbers its trees its own way (the offer's pattern wins over the setting).
  v := public.staff_generate_trees(current_setting('test.tr_b')::uuid, current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 20 and v->>'first_code' = 'ZT-0001' and v->>'last_code' = 'ZT-0020',
    'the offer''s own pattern numbers its trees, got ' || v::text;

  v := public.staff_allocate_trees(current_setting('test.tr_b')::uuid, current_setting('test.tr_p1')::uuid,
                                   null, 5, 'reserved', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 5 and v->>'first_code' = 'ZT-0001' and v->>'last_code' = 'ZT-0005',
    'a basket of exactly the minimum is allowed, got ' || v::text;
end $$;

reset role;

do $$
declare
  v     jsonb;
  v_min integer;
  v_no  text;
  v_req uuid;
begin
  -- Rows and tree_count disagreeing is a third answer, not a count: the Back Office has to regenerate.
  update public.projects set tree_count = 25 where id = current_setting('test.tr_b')::uuid;
  v := app.offer_stock_payload(current_setting('test.tr_b')::uuid);
  assert v->>'status' = 'partial' and (v->>'trees_total')::integer = 20 and (v->>'trees_declared')::integer = 25,
    'twenty rows under an offer that claims twenty-five is «partial», got ' || v::text;
  update public.projects set tree_count = 20 where id = current_setting('test.tr_b')::uuid;

  -- The global default, inherited by an offer that sets none.
  update public.settings set value = to_jsonb(4) where key = 'offers.min_trees_default';
  v_min := app.offer_min_trees(current_setting('test.tr_a')::uuid);
  assert v_min = 4, 'raising the default raises the floor of every offer without its own, got '
    || coalesce(v_min::text, 'null');
  perform pg_temp.tr_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.tr_payload(current_setting('test.tr_a'), '3', current_setting('test.tr_phone_10'))),
    'below_min_trees');
  v_no := public.submit_offer_request(
    pg_temp.tr_payload(current_setting('test.tr_a'), '4', current_setting('test.tr_phone_4')))->>'request_no';
  assert v_no is not null, 'and four trees are enough once the default says four';

  -- Capped by the offer itself, so a global minimum can never make a small offer unsellable.
  v_min := app.offer_min_trees(current_setting('test.tr_c')::uuid);
  assert v_min = 2, 'an offer of two trees asks for two, not four, got ' || coalesce(v_min::text, 'null');
  perform pg_temp.tr_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.tr_payload(current_setting('test.tr_c'), '1', current_setting('test.tr_phone_10'))),
    'below_min_trees');
  v_no := public.submit_offer_request(
    pg_temp.tr_payload(current_setting('test.tr_c'), '2', current_setting('test.tr_phone_5')))->>'request_no';
  assert v_no is not null, 'and the whole small offer can still be asked for';

  update public.settings set value = to_jsonb(1) where key = 'offers.min_trees_default';

  -- A demand is not a sale, so an ask larger than what is left is still a lead (the offer is fully taken).
  assert (app.offer_stock_payload(current_setting('test.tr_a')::uuid)->>'trees_available')::integer = 0,
    'the offer has nothing left at this point';
  v_no := public.submit_offer_request(
    pg_temp.tr_payload(current_setting('test.tr_a'), '10', current_setting('test.tr_phone_6')))->>'request_no';
  assert v_no is not null, 'a request for ten trees of a sold-out offer is a lead, not an error';
  select r.id into v_req from public.interest_requests r where r.request_no = v_no;
  assert not exists (select 1 from public.trees t where t.request_id = v_req),
    'and the intake allocated nothing: reserving is a decision a human takes, with a role and a reason';
end $$;

-- The two columns refuse a minimum that would make the offer unsellable, and a pattern that would name every
-- tree the same.
do $$
begin
  begin
    update public.projects set min_trees_per_order = 13 where id = current_setting('test.tr_a')::uuid;
    raise exception 'an offer must not ask for more trees than it holds';
  exception when check_violation then null;
  end;
  begin
    update public.projects set min_trees_per_order = 0 where id = current_setting('test.tr_a')::uuid;
    raise exception 'a minimum below one is not a minimum';
  exception when check_violation then null;
  end;
  begin
    update public.projects set tree_code_pattern = 'ZTX' where id = current_setting('test.tr_a')::uuid;
    raise exception 'a code pattern without {seq} would number every tree the same';
  exception when check_violation then null;
  end;
  assert (select pj.min_trees_per_order is null and pj.tree_code_pattern is null
          from public.projects pj where pj.id = current_setting('test.tr_a')::uuid),
    'and none of the refused edits stuck';
end $$;

-- ---------------------------------------------------------------------------
-- 6 · The offer page finally records the visit the visitor asked for (report v3 §40)
-- ---------------------------------------------------------------------------

do $$
declare
  v_yes  text;
  v_no   text;
  v_none text;
  v_junk text;
begin
  v_yes := public.submit_offer_request(pg_temp.tr_payload(
    current_setting('test.tr_b'), '5', current_setting('test.tr_phone_7'), '{"wants_visit": true}'::jsonb))->>'request_no';
  v_no := public.submit_offer_request(pg_temp.tr_payload(
    current_setting('test.tr_b'), '5', current_setting('test.tr_phone_8'), '{"wants_visit": false}'::jsonb))->>'request_no';
  v_none := public.submit_offer_request(pg_temp.tr_payload(
    current_setting('test.tr_b'), '5', current_setting('test.tr_phone_9')))->>'request_no';
  v_junk := public.submit_offer_request(pg_temp.tr_payload(
    current_setting('test.tr_b'), '5', current_setting('test.tr_phone_11'), '{"wants_visit": "أكيد"}'::jsonb))->>'request_no';

  assert (select r.wants_visit from public.interest_requests r where r.request_no = v_yes) is true,
    '«نحب نزور الأرض» is recorded';
  assert (select r.wants_visit from public.interest_requests r where r.request_no = v_no) is false,
    'and so is «لا»';
  assert (select r.wants_visit from public.interest_requests r where r.request_no = v_none) is null,
    'a visitor who was not asked answered nothing, which is not «no»';
  assert (select r.wants_visit from public.interest_requests r where r.request_no = v_junk) is null,
    'and anything that is not a JSON boolean stays empty rather than becoming «yes»';
end $$;

-- ---------------------------------------------------------------------------
-- 7 · A visitor reads the stock and nothing else
-- ---------------------------------------------------------------------------

select set_config('test.tr_stock_open',
  public.public_offer_stock(current_setting('test.tr_a')::uuid)::text, true);

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

do $$
declare
  v jsonb;
begin
  v := public.public_offer_stock(current_setting('test.tr_a')::uuid);
  assert v is not null, 'a visitor reads the stock of an offer that is on sale';
  assert (v->>'trees_total')::integer = 12 and (v->>'trees_available')::integer = 0
     and (v->>'trees_reserved')::integer = 11 and (v->>'trees_sold')::integer = 1,
    'the four figures, as the page will print them, got ' || v::text;
  assert (v->>'trees_available')::integer + (v->>'trees_reserved')::integer + (v->>'trees_sold')::integer
         = (v->>'trees_total')::integer,
    'and they add up to the total';

  -- PRJ-03: counts only. Not the land price, the planting cost, the margin or any formula.
  assert (select bool_and(k !~* '(price|millime|land|margin|cost|planting|markup|extra|rule)')
          from jsonb_object_keys(v) as k),
    'the stock payload carries no money key, got ' || v::text;
  assert v::text !~* '(millimes|margin|land_price)', 'and no money anywhere inside it, got ' || v::text;

  -- An offer that is not on sale has no stock to state either.
  assert public.public_offer_stock(current_setting('test.tr_d')::uuid) is null,
    'an internal offer stays invisible to a visitor, stock included';
  assert public.public_offer_stock(gen_random_uuid()) is null, 'and an unknown offer answers nothing';

  -- The trees themselves are never read from the browser (they carry a client''s id).
  begin
    perform 1 from public.trees;
    raise exception 'a visitor must not read the trees table';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.trees (project_id, seq, code)
    values (current_setting('test.tr_a')::uuid, 500, 'ANON-0500');
    raise exception 'a visitor must not create a tree';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.trees set state = 'available';
    raise exception 'a visitor must not release a tree';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.trees;
    raise exception 'a visitor must not delete a tree';
  exception when insufficient_privilege then null;
  end;

  -- Nor reach anything that writes stock.
  begin
    perform public.staff_generate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_reason'));
    raise exception 'a visitor must not generate trees';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.staff_allocate_trees(current_setting('test.tr_a')::uuid, current_setting('test.tr_p1')::uuid,
                                        null, 1, 'reserved', current_setting('test.tr_reason'));
    raise exception 'a visitor must not reserve a tree';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.staff_set_tree_state(array[gen_random_uuid()], 'available', current_setting('test.tr_reason'));
    raise exception 'a visitor must not move a tree between states';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.staff_offer_stock(current_setting('test.tr_a')::uuid);
    raise exception 'a visitor must not call the Back Office stock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_offer_request('{}'::jsonb);
    raise exception 'the intake stays server-side';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 8 · Stock is a fact, price is a permission
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'internal' where key = 'pricing';

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;

do $$
declare
  v_quote jsonb := public.public_project_quote(current_setting('test.tr_a')::uuid, null, 5, 'cash');
  v_stock jsonb := public.public_offer_stock(current_setting('test.tr_a')::uuid);
begin
  assert v_quote->>'pricing' = 'closed' and v_quote->>'price_per_tree_millimes' is null,
    'with prices closed a visitor sees no money, got ' || v_quote::text;
  assert v_stock is not null and v_stock::text = current_setting('test.tr_stock_open'),
    'but the stock is unchanged: a visitor may know an offer is sold out while prices are closed, got '
    || coalesce(v_stock::text, 'null');
  assert (v_stock->>'trees_available')::integer = 0,
    'and «sold out» is exactly what these figures say';
end $$;

reset role;
update public.feature_flags set state = 'public' where key = 'pricing';

-- The module flag still decides whether the offer exists for a visitor at all.
update public.feature_flags set state = 'disabled' where key = 'projects';

set local role anon;

do $$
begin
  assert public.public_offer_stock(current_setting('test.tr_a')::uuid) is null,
    'with the offers module closed a visitor reads no stock either';
end $$;

reset role;
update public.feature_flags set state = 'public' where key = 'projects';

-- ---------------------------------------------------------------------------
-- 9 · Who may do what: inventory, contracts and one commercial's own file
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.tr_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v      jsonb;
  v_tree uuid;
begin
  -- A commercial never creates or destroys inventory.
  perform pg_temp.tr_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)',
           current_setting('test.tr_c'), current_setting('test.tr_reason')),
    'forbidden');
  -- Nor contracts: «sold» is the contract moment (§51).
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
           current_setting('test.tr_b'), current_setting('test.tr_p2'), 'sold',
           current_setting('test.tr_reason')),
    'forbidden');
  -- Nor touches a file that is not theirs (COM-05).
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
           current_setting('test.tr_b'), current_setting('test.tr_p1'), 'reserved',
           current_setting('test.tr_reason')),
    'forbidden');

  -- But reserves for their own client.
  v := public.staff_allocate_trees(current_setting('test.tr_b')::uuid, current_setting('test.tr_p2')::uuid,
                                   null, 5, 'reserved', current_setting('test.tr_reason'));
  assert (v->>'trees')::integer = 5 and v->>'first_code' = 'ZT-0006',
    'the commercial takes the next five for their own client, got ' || v::text;

  -- Releasing is stock keeping, and that is not theirs either.
  select t.id into v_tree from public.trees t
  where t.project_id = current_setting('test.tr_b')::uuid and t.seq = 6;
  perform pg_temp.tr_expect(
    format('select public.staff_set_tree_state(array[%L]::uuid[], %L, %L)',
           v_tree, 'available', current_setting('test.tr_reason')),
    'forbidden');

  -- A sensitive write without a written reason is refused whoever asks (§51).
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
           current_setting('test.tr_b'), current_setting('test.tr_p2'), 'reserved', '  '),
    'reason_required');
end $$;

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.tr_plain'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  assert (select count(*) from public.trees) = 0,
    'a signed-in user who is not staff reads no tree at all (RLS), got '
    || (select count(*) from public.trees)::text;
  perform pg_temp.tr_expect(
    format('select public.staff_offer_stock(%L::uuid)', current_setting('test.tr_a')), 'forbidden');
  perform pg_temp.tr_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)',
           current_setting('test.tr_a'), current_setting('test.tr_reason')), 'forbidden');
  perform pg_temp.tr_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 1, %L, %L)',
           current_setting('test.tr_b'), current_setting('test.tr_p2'), 'reserved',
           current_setting('test.tr_reason')), 'forbidden');
  perform pg_temp.tr_expect(
    format('select public.staff_set_tree_state(array[%L]::uuid[], %L, %L)',
           gen_random_uuid(), 'available', current_setting('test.tr_reason')), 'forbidden');
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 10 · The shape of the thing: grants, RLS, the copy the page reads, and the parcel layer left alone
-- ---------------------------------------------------------------------------

do $$
declare
  v_key text;
begin
  -- Supabase hands anon and authenticated ALL on a new table, so this is the assertion that the revoke happened.
  assert not has_table_privilege('anon', 'public.trees', 'select')
     and not has_table_privilege('anon', 'public.trees', 'insert')
     and not has_table_privilege('anon', 'public.trees', 'update')
     and not has_table_privilege('anon', 'public.trees', 'delete'),
    'the trees table is closed to visitors at the grant level, not only by RLS';
  assert has_table_privilege('authenticated', 'public.trees', 'select')
     and not has_table_privilege('authenticated', 'public.trees', 'insert')
     and not has_table_privilege('authenticated', 'public.trees', 'update')
     and not has_table_privilege('authenticated', 'public.trees', 'delete'),
    'staff read the rows and write them only through the RPCs';
  assert (select c.relrowsecurity from pg_class c where c.oid = 'public.trees'::regclass),
    'row level security is on';
  assert exists (select 1 from pg_policies p
                 where p.schemaname = 'public' and p.tablename = 'trees' and p.cmd = 'SELECT'),
    'and a select policy decides who sees a tree';

  assert has_function_privilege('anon', 'public.public_offer_stock(uuid)', 'execute'),
    'the stock RPC is the one door a visitor has';
  assert not has_function_privilege('anon', 'public.staff_offer_stock(uuid)', 'execute')
     and not has_function_privilege('anon', 'public.staff_generate_trees(uuid, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_allocate_trees(uuid, uuid, uuid, integer, text, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_set_tree_state(uuid[], text, text)', 'execute'),
    'and none of the staff ones';
  assert not has_function_privilege('anon', 'public.submit_offer_request(jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'public.submit_offer_request(jsonb)', 'execute')
     and has_function_privilege('service_role', 'public.submit_offer_request(jsonb)', 'execute'),
    'the intake is still server-side only (0049)';

  -- The engine stays in the app schema, where the API roles cannot reach it.
  assert not has_function_privilege('authenticated', 'app.allocate_offer_trees(uuid, uuid, uuid, integer, public.tree_state)', 'execute')
     and not has_function_privilege('anon', 'app.offer_stock_payload(uuid)', 'execute')
     and not has_function_privilege('anon', 'app.offer_min_trees(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.can_manage_trees()', 'execute')
     and not has_function_privilege('authenticated', 'app.can_contract_trees()', 'execute'),
    'the internals are closed to the API roles';

  -- Three states, and no value was added to the parcel enum to get them.
  assert (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.tree_state'::regtype)
         = array['available', 'reserved', 'sold'],
    'a tree is available, reserved or sold';

  -- Every Arabic word a page shows lives in settings, never in a SQL literal in the page.
  foreach v_key in array array['offers.min_trees_default', 'offers.min_trees_hint', 'offers.stock_title',
                               'offers.stock_total_label', 'offers.stock_available_label',
                               'offers.stock_reserved_label', 'offers.stock_sold_label'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.is_public and s.label_ar <> ''),
      'the offer page reads ' || v_key || ' from settings, and the Back Office can edit it';
  end loop;
  assert (select count(*) from public.settings s
          where s.key in ('offers.tree_code_pattern', 'offers.tree_code_digits') and not s.is_public) = 2,
    'how a tree is numbered is internal, so it stays off the public site';

  -- This phase is additive. The day someone starts retiring the parcel layer, it gets its own migration.
  assert to_regclass('public.parcels') is not null
     and to_regprocedure('public.million_progress()') is not null
     and to_regprocedure('public.public_parcels()') is not null,
    'the parcel layer is untouched by this migration';
  assert (select count(*) from pg_enum e where e.enumtypid = 'public.parcel_status'::regtype) = 7,
    'its seven statuses are unchanged, got '
    || (select count(*)::text from pg_enum e where e.enumtypid = 'public.parcel_status'::regtype);
  assert not exists (select 1 from pg_constraint c
                     where c.conrelid = 'public.trees'::regclass and c.contype = 'f'
                       and c.confrelid = 'public.parcels'::regclass),
    'and a tree points at an offer and a person, never at a parcel';
end $$;
