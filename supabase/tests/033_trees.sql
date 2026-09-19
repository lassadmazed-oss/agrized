-- The olive tree is the unit of inventory: numbering, stock, allocation, and who may touch any of it.
-- Migration 0054_trees.sql shipped without a test of its own; this is it.
--
-- Owner, 2026-09-18: «the unit is a tree not m carre» · «we just give each tree a number or an id and associate
-- it with the client» · «there is a minimum of trees to buy, it depends on the offer».
--
-- Runs against the live database inside a rolled-back transaction: every fixture carries a code, a phone number
-- and a user id of its own, and nothing survives the file. public.parcels is never read and never written — the
-- parcel layer leaves the interface first and the database later, with tests of its own.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Asserts that a call fails with exactly the business error it should. The success case is reported outside the
-- exception block, so «it succeeded» is never mistaken for «it raised something else».
-- The reason guard is a setting since 0058 and the owner turned it off (audit.reason_min_length = 0). This file
-- asserts that generating and releasing trees refuse a blank reason, which is the guard's behaviour WHILE IT IS
-- ON, so it turns it on inside its own transaction. The runner rolls this back; the live value is untouched.
update public.settings set value = to_jsonb(5) where key = 'audit.reason_min_length';

create function pg_temp.tt_expect(p_sql text, p_expected text) returns void language plpgsql as $$
declare
  v_ran boolean := false;
begin
  begin
    execute p_sql;
    v_ran := true;
  exception when others then
    if sqlerrm <> p_expected then
      raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
    end if;
  end;
  if v_ran then
    raise exception 'expected error "%" but the call went through: %', p_expected, p_sql;
  end if;
end $$;

-- For what the grants refuse outright (no EXECUTE, no SELECT), where the message is PostgreSQL's own.
create function pg_temp.tt_denied(p_sql text) returns void language plpgsql as $$
declare
  v_ran boolean := false;
begin
  begin
    execute p_sql;
    v_ran := true;
  exception when insufficient_privilege then null;
  end;
  if v_ran then
    raise exception 'expected a privilege error, the call went through: %', p_sql;
  end if;
end $$;

create function pg_temp.tt_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
end $$;

create function pg_temp.tt_as_user(p_sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function pg_temp.tt(p_key text) returns uuid language sql stable as $$
  select nullif(current_setting('test.tt_' || p_key, true), '')::uuid
$$;

-- The stock of one offer, read as the Back Office reads it.
create function pg_temp.tt_stock(p_key text) returns jsonb language sql stable as $$
  select app.offer_stock_payload(pg_temp.tt(p_key))
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

do $$
declare
  v_id     uuid;
  v_status uuid;
begin
  update public.feature_flags set state = 'public' where key = 'projects';

  -- Pinned so the codes below are the same whatever the live settings hold today.
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4)                     where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb(1)                     where key = 'offers.min_trees_default';

  -- Staff. An agri manager keeps stock; Finance keeps stock, sees every file and may contract; a commercial only
  -- works inside their own file; a client is authenticated and is not staff at all.
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000005401', 'authenticated', 'authenticated', 'fin-tree@test.local',  '{"full_name":"Finance Trees"}'),
    ('00000000-0000-0000-0000-000000005402', 'authenticated', 'authenticated', 'agri-tree@test.local', '{"full_name":"Agri Trees"}'),
    ('00000000-0000-0000-0000-000000005403', 'authenticated', 'authenticated', 'com-tree@test.local',  '{"full_name":"Commercial Trees"}'),
    ('00000000-0000-0000-0000-000000005404', 'authenticated', 'authenticated', 'cli-tree@test.local',  '{"full_name":"Client Trees"}');

  insert into public.user_roles (user_id, role) values
    ('00000000-0000-0000-0000-000000005401', 'finance'),
    ('00000000-0000-0000-0000-000000005402', 'agri_manager'),
    ('00000000-0000-0000-0000-000000005403', 'commercial'),
    ('00000000-0000-0000-0000-000000005404', 'client');

  -- The offers. Codes are unique per run so the file can be re-run against a live catalogue.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TT-A-' || gen_random_uuid(), 'عرض الترقيم', 34, 'published', 12) returning id into v_id;
  perform set_config('test.tt_a', v_id::text, true);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TT-B-' || gen_random_uuid(), 'عرض بلا عدد زيتونات', 34, 'published', null) returning id into v_id;
  perform set_config('test.tt_b', v_id::text, true);

  insert into public.projects (code, name, governorate_id, status, tree_count, min_trees_per_order)
  values ('TT-C-' || gen_random_uuid(), 'عرض البيع', 34, 'published', 20, 5) returning id into v_id;
  perform set_config('test.tt_c', v_id::text, true);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TT-D-' || gen_random_uuid(), 'عرض مازال مسودة', 34, 'draft', 4) returning id into v_id;
  perform set_config('test.tt_d', v_id::text, true);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TT-E-' || gen_random_uuid(), 'عرض أقلّ عدد', 34, 'published', 3) returning id into v_id;
  perform set_config('test.tt_e', v_id::text, true);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TT-F-' || gen_random_uuid(), 'عرض صغير', 34, 'published', 2) returning id into v_id;
  perform set_config('test.tt_f', v_id::text, true);

  insert into public.projects (code, name, governorate_id, status, tree_count, tree_code_pattern)
  values ('TT-N-' || gen_random_uuid(), 'عرض بصيغة خاصة', 34, 'published', 2, 'ZIT-{seq}') returning id into v_id;
  perform set_config('test.tt_n', v_id::text, true);

  -- Two scratch offers for the table's own rules: nothing is ever generated on them.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TT-U-' || gen_random_uuid(), 'عرض القواعد', 34, 'published', 3) returning id into v_id;
  perform set_config('test.tt_u', v_id::text, true);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TT-V-' || gen_random_uuid(), 'عرض القواعد الثاني', 34, 'published', 3) returning id into v_id;
  perform set_config('test.tt_v', v_id::text, true);

  -- Two clients: one is the commercial's file, one is nobody's.
  select id into v_status from public.lead_statuses where stage = 'new' and is_active
  order by is_stage_default desc, sort_order limit 1;

  insert into public.persons (full_name, phone_e164, status_id, governorate_id, assigned_to)
  values ('حريف الزيتونات', '+21655540001', v_status, 34, '00000000-0000-0000-0000-000000005403')
  returning id into v_id;
  perform set_config('test.tt_p1', v_id::text, true);

  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف بلا مكلّف', '+21655540002', v_status, 34) returning id into v_id;
  perform set_config('test.tt_p2', v_id::text, true);

  -- A demand of the first client on offer C, so an allocation can point back at what asked for it.
  insert into public.interest_requests (request_no, person_id, full_name, phone_e164, whatsapp_e164,
                                        residence_governorate_id, contact_channel, consent_text,
                                        request_kind, project_id, offer_trees,
                                        invest_anywhere, project_type_unsure)
  values ('AGZ-TT-0001', pg_temp.tt('p1'), 'حريف الزيتونات', '+21655540001', '+21655540001',
          34, 'phone', 'موافقة تجريبية', 'offer', pg_temp.tt('c'), 5, true, true)
  returning id into v_id;
  perform set_config('test.tt_r1', v_id::text, true);

  -- And one of the second client, which must never be attachable to the first client's trees.
  insert into public.interest_requests (request_no, person_id, full_name, phone_e164, whatsapp_e164,
                                        residence_governorate_id, contact_channel, consent_text,
                                        request_kind, project_id, offer_trees,
                                        invest_anywhere, project_type_unsure)
  values ('AGZ-TT-0002', pg_temp.tt('p2'), 'حريف بلا مكلّف', '+21655540002', '+21655540002',
          34, 'phone', 'موافقة تجريبية', 'offer', pg_temp.tt('c'), 5, true, true)
  returning id into v_id;
  perform set_config('test.tt_r2', v_id::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- T1 · The tree row: one number and one code per offer, and three states, no more
-- ---------------------------------------------------------------------------

do $$
begin
  assert (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'tree_state' and t.typnamespace = 'public'::regnamespace)
         = array['available', 'reserved', 'sold'],
    'public.tree_state holds exactly the three states 0054 defines';

  -- A state the parcel layer has and a tree deliberately does not.
  begin
    perform 'withdrawn'::public.tree_state;
    raise exception 'a tree must not accept the parcel layer''s states';
  exception when invalid_text_representation then null;
  end;

  insert into public.trees (project_id, seq, code) values (pg_temp.tt('u'), 1, 'TT-U-0001');

  begin
    insert into public.trees (project_id, seq, code) values (pg_temp.tt('u'), 1, 'TT-U-9999');
    raise exception 'two trees of one offer must not share a number';
  exception when unique_violation then null;
  end;

  begin
    insert into public.trees (project_id, seq, code) values (pg_temp.tt('u'), 2, 'TT-U-0001');
    raise exception 'two trees of one offer must not share a code';
  exception when unique_violation then null;
  end;

  -- Uniqueness is inside the offer, not across the catalogue: another offer numbers from one as well.
  insert into public.trees (project_id, seq, code) values (pg_temp.tt('v'), 1, 'TT-U-0001');
  assert (select count(*) from public.trees where project_id = pg_temp.tt('v')) = 1,
    'another offer numbers its own trees from one';

  begin
    insert into public.trees (project_id, seq, code) values (pg_temp.tt('v'), 0, 'TT-V-0000');
    raise exception 'a tree number starts at one';
  exception when check_violation then null;
  end;

  -- A held tree always says who holds it and since when; a free tree holds nothing.
  begin
    insert into public.trees (project_id, seq, code, state) values (pg_temp.tt('v'), 2, 'TT-V-0002', 'reserved');
    raise exception 'a reserved tree must name its holder';
  exception when check_violation then null;
  end;

  begin
    insert into public.trees (project_id, seq, code, state, held_by, allocated_at)
    values (pg_temp.tt('v'), 3, 'TT-V-0003', 'available', pg_temp.tt('p1'), now());
    raise exception 'an available tree must hold nobody';
  exception when check_violation then null;
  end;

  delete from public.trees where project_id in (pg_temp.tt('u'), pg_temp.tt('v'));
end $$;

-- ---------------------------------------------------------------------------
-- T2 · Generation numbers an offer once: running it twice adds nothing
-- ---------------------------------------------------------------------------

do $$
declare
  v_code  text := (select code from public.projects where id = pg_temp.tt('a'));
  v_first jsonb;
  v_again jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005402');  -- the agri manager keeps stock
  v_first := public.staff_generate_trees(pg_temp.tt('a'), 'ترقيم أوّل للعرض');
  v_again := public.staff_generate_trees(pg_temp.tt('a'), 'إعادة الترقيم للتثبّت');
  reset role;

  assert (v_first->>'trees')::integer = 12 and (v_first->>'added')::integer = 12
         and (v_first->>'removed')::integer = 0,
    format('the first run numbers the whole offer, got %s', v_first);
  assert (v_again->>'trees')::integer = 12 and (v_again->>'added')::integer = 0
         and (v_again->>'removed')::integer = 0,
    format('running it twice must add nothing, got %s', v_again);

  assert (select count(*) from public.trees where project_id = pg_temp.tt('a')) = 12,
    'twelve rows and no more';
  assert (select count(*) from public.trees where project_id = pg_temp.tt('a') and state = 'available') = 12,
    'a freshly numbered offer is entirely available';
  assert (select array_agg(t.seq order by t.seq) from public.trees t where t.project_id = pg_temp.tt('a'))
         = array(select generate_series(1, 12)),
    'the numbers are dense, from one to tree_count';

  -- The code is rendered once from the offer's pattern and read back in tree order, not in alphabetical order.
  assert v_first->>'first_code' = v_code || '-0001' and v_first->>'last_code' = v_code || '-0012',
    format('the default pattern numbers «{offer}-{seq}» padded to four, got %s … %s',
           v_first->>'first_code', v_first->>'last_code');

  -- An offer with its own pattern uses it instead of the setting (the 0031 inheritance).
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005402');
  perform public.staff_generate_trees(pg_temp.tt('n'), 'ترقيم بصيغة العرض');
  reset role;
  assert (select array_agg(t.code order by t.seq) from public.trees t where t.project_id = pg_temp.tt('n'))
         = array['ZIT-0001', 'ZIT-0002'],
    'the offer''s own tree_code_pattern wins over the setting';

  -- §51: the act is logged once, with its reason, not once per tree.
  assert (select count(*) from public.audit_logs
          where action = 'trees.generate' and entity = 'trees' and entity_id = pg_temp.tt('a')::text
            and reason = 'ترقيم أوّل للعرض') = 1,
    'generating is audited once, with the reason the staff wrote';
end $$;

-- ---------------------------------------------------------------------------
-- T3 · It follows tree_count up and down, and never deletes a tree someone holds
-- ---------------------------------------------------------------------------

do $$
declare
  v_out jsonb;
begin
  -- Growing: only the missing numbers are inserted.
  update public.projects set tree_count = 15 where id = pg_temp.tt('a');
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005402');
  v_out := public.staff_generate_trees(pg_temp.tt('a'), 'زيادة عدد الزيتونات');
  reset role;
  assert (v_out->>'added')::integer = 3 and (v_out->>'removed')::integer = 0
         and (v_out->>'trees')::integer = 15,
    format('growing tree_count adds only what is missing, got %s', v_out);

  -- Shrinking while every surplus tree is free: the surplus is deleted.
  update public.projects set tree_count = 10 where id = pg_temp.tt('a');
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005402');
  v_out := public.staff_generate_trees(pg_temp.tt('a'), 'تنقيص عدد الزيتونات');
  reset role;
  assert (v_out->>'added')::integer = 0 and (v_out->>'removed')::integer = 5
         and (v_out->>'trees')::integer = 10,
    format('shrinking removes the free surplus, got %s', v_out);
  assert (select max(seq) from public.trees where project_id = pg_temp.tt('a')) = 10,
    'nothing is numbered above tree_count';
end $$;

do $$
declare
  v_before integer;
begin
  -- Two trees are now held by a client (the lowest numbers, as allocation always takes them).
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  perform public.staff_allocate_trees(pg_temp.tt('a'), pg_temp.tt('p1'), null, 2, 'reserved', 'حجز للتثبّت');
  reset role;

  select count(*) into v_before from public.trees where project_id = pg_temp.tt('a');

  -- Lowering tree_count under a held tree is refused outright, and changes nothing.
  update public.projects set tree_count = 1 where id = pg_temp.tt('a');
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  perform pg_temp.tt_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)', pg_temp.tt('a'), 'تنقيص تحت زيتونة محجوزة'),
    'trees_taken_below_count');
  reset role;

  assert (select count(*) from public.trees where project_id = pg_temp.tt('a')) = v_before,
    'a refused shrink deletes nothing at all';
  assert (select count(*) from public.trees
          where project_id = pg_temp.tt('a') and state = 'reserved' and held_by = pg_temp.tt('p1')) = 2,
    'the client keeps the trees they were promised';

  -- Down to the held trees themselves: the free surplus goes, the reserved ones stay.
  update public.projects set tree_count = 2 where id = pg_temp.tt('a');
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  perform public.staff_generate_trees(pg_temp.tt('a'), 'تنقيص إلى حدّ المحجوز');
  reset role;
  assert (select count(*) from public.trees where project_id = pg_temp.tt('a')) = 2,
    'the free surplus is deleted down to tree_count';
  assert (select count(*) from public.trees
          where project_id = pg_temp.tt('a') and state = 'reserved') = 2,
    'and what is left is the client''s two trees';
end $$;

-- ---------------------------------------------------------------------------
-- T4 · An offer that declares no tree numbers nothing
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005402');
  perform pg_temp.tt_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)', pg_temp.tt('b'), 'ترقيم عرض بلا عدد'),
    'offer_has_no_trees');
  reset role;

  update public.projects set tree_count = 0 where id = pg_temp.tt('b');
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005402');
  perform pg_temp.tt_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)', pg_temp.tt('b'), 'ترقيم عرض عدده صفر'),
    'offer_has_no_trees');
  -- And an offer that does not exist is not an offer.
  perform pg_temp.tt_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)', gen_random_uuid(), 'ترقيم عرض وهمي'),
    'offer_not_available');
  reset role;

  assert (select count(*) from public.trees where project_id = pg_temp.tt('b')) = 0,
    'a refused generation leaves no tree behind';

  -- A reason is not optional on a sensitive write (§51).
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005402');
  perform pg_temp.tt_expect(
    format('select public.staff_generate_trees(%L::uuid, %L)', pg_temp.tt('c'), ' '),
    'reason_required');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T5 · The stock payload: not_generated → ok → partial, and the counts add up
-- ---------------------------------------------------------------------------

do $$
declare
  v_stock jsonb;
begin
  -- Before anyone numbers them, the stock is unknown, not empty: «0 متاحة» would be a lie.
  v_stock := pg_temp.tt_stock('c');
  assert v_stock->>'status' = 'not_generated', format('an unnumbered offer says so, got %s', v_stock->>'status');
  assert (v_stock->>'trees_total')::integer = 0 and (v_stock->>'trees_declared')::integer = 20,
    format('it still declares what the offer card says, got %s', v_stock);

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  perform public.staff_generate_trees(pg_temp.tt('c'), 'ترقيم عرض البيع');
  reset role;

  v_stock := pg_temp.tt_stock('c');
  assert v_stock->>'status' = 'ok', format('rows that match tree_count are «ok», got %s', v_stock->>'status');
  assert (v_stock->>'trees_total')::integer = 20
     and (v_stock->>'trees_available')::integer = 20
     and (v_stock->>'trees_reserved')::integer = 0
     and (v_stock->>'trees_sold')::integer = 0,
    format('a numbered offer is entirely available, got %s', v_stock);
  assert (v_stock->>'trees_available')::integer + (v_stock->>'trees_reserved')::integer
         + (v_stock->>'trees_sold')::integer = (v_stock->>'trees_total')::integer,
    'the three states add up to the total';
  assert (v_stock->>'min_trees')::integer = 5, 'the offer''s own minimum travels with its stock';
  assert v_stock->>'project_code' = (select code from public.projects where id = pg_temp.tt('c')),
    'the payload names the offer it counts';

  -- The rows and the offer card disagreeing is its own answer, and the Back Office has to regenerate.
  update public.projects set tree_count = 25 where id = pg_temp.tt('c');
  v_stock := pg_temp.tt_stock('c');
  assert v_stock->>'status' = 'partial',
    format('rows that disagree with tree_count are «partial», got %s', v_stock->>'status');
  assert (v_stock->>'trees_total')::integer = 20 and (v_stock->>'trees_declared')::integer = 25,
    'partial states both figures, so a screen can name the gap';
  update public.projects set tree_count = 20 where id = pg_temp.tt('c');

  -- An offer nobody created has no stock at all.
  assert app.offer_stock_payload(gen_random_uuid()) is null, 'an unknown offer has no stock';
end $$;

-- ---------------------------------------------------------------------------
-- T6 · Allocation: the minimum, the stock, and all of it or none of it
-- ---------------------------------------------------------------------------

do $$
declare
  v_out   jsonb;
  v_code  text := (select code from public.projects where id = pg_temp.tt('c'));
  v_stock jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');  -- Finance: sees every file, may contract

  -- Under the offer's own minimum, with its own error, because «write a number» is wrong advice for someone
  -- who wrote a perfectly good one that is simply too small.
  perform pg_temp.tt_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 3, %L, %L)',
           pg_temp.tt('c'), pg_temp.tt('p1'), 'reserved', 'حجز تحت الحدّ الأدنى'),
    'below_min_trees');

  -- More than the offer holds, before anything is allocated.
  perform pg_temp.tt_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 21, %L, %L)',
           pg_temp.tt('c'), pg_temp.tt('p1'), 'reserved', 'حجز أكثر من المتوفّر'),
    'not_enough_trees');

  -- This function moves stock to a person; it never frees one.
  perform pg_temp.tt_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
           pg_temp.tt('c'), pg_temp.tt('p1'), 'available', 'حجز بحالة خاطئة'),
    'invalid_tree_state');
  perform pg_temp.tt_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
           pg_temp.tt('c'), pg_temp.tt('p1'), 'withdrawn', 'حجز بحالة ما موجودةش'),
    'invalid_tree_state');

  -- A person who is not on file, and a demand that belongs to somebody else.
  perform pg_temp.tt_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
           pg_temp.tt('c'), gen_random_uuid(), 'reserved', 'حجز لشخص ما موجودش'),
    'invalid_person');
  perform pg_temp.tt_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, %L::uuid, 5, %L, %L)',
           pg_temp.tt('c'), pg_temp.tt('p1'), pg_temp.tt('r2'), 'reserved', 'حجز بمطلب غيره'),
    'invalid_request');

  reset role;
  assert (select count(*) from public.trees where project_id = pg_temp.tt('c') and state <> 'available') = 0,
    'not one refused allocation moved a tree';

  -- The reservation itself: five trees, the lowest numbers, attached to the client and to the demand that asked.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  v_out := public.staff_allocate_trees(pg_temp.tt('c'), pg_temp.tt('p1'), pg_temp.tt('r1'), 5, 'reserved',
                                       'حجز بعد مكالمة مع الحريف');
  reset role;

  assert (v_out->>'trees')::integer = 5 and v_out->>'state' = 'reserved',
    format('five trees were asked for and five were taken, got %s', v_out);
  assert v_out->>'first_code' = v_code || '-0001' and v_out->>'last_code' = v_code || '-0005',
    format('allocation hands out the lowest numbers, got %s … %s', v_out->>'first_code', v_out->>'last_code');
  assert (select array_agg(t.seq order by t.seq) from public.trees t
          where t.project_id = pg_temp.tt('c') and t.state = 'reserved') = array[1, 2, 3, 4, 5],
    'the reserved block is the first five trees';
  assert (select count(*) from public.trees t
          where t.project_id = pg_temp.tt('c') and t.state = 'reserved'
            and t.held_by = pg_temp.tt('p1') and t.request_id = pg_temp.tt('r1')
            and t.allocated_at is not null) = 5,
    'every reserved tree names its holder, its demand and its date';

  v_stock := pg_temp.tt_stock('c');
  assert (v_stock->>'trees_available')::integer = 15 and (v_stock->>'trees_reserved')::integer = 5
     and (v_stock->>'trees_sold')::integer = 0,
    format('five trees left «المتاحة» for «المحجوزة», got %s', v_stock);

  -- The contract moment, for the other client.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  v_out := public.staff_allocate_trees(pg_temp.tt('c'), pg_temp.tt('p2'), null, 5, 'sold', 'إمضاء العقد');
  reset role;
  assert (v_out->>'trees')::integer = 5 and v_out->>'first_code' = v_code || '-0006',
    format('the sale takes the next block, got %s', v_out);

  v_stock := pg_temp.tt_stock('c');
  assert (v_stock->>'trees_total')::integer = 20 and (v_stock->>'trees_available')::integer = 10
     and (v_stock->>'trees_reserved')::integer = 5 and (v_stock->>'trees_sold')::integer = 5,
    format('the four figures the owner named, got %s', v_stock);
  assert (v_stock->>'trees_available')::integer + (v_stock->>'trees_reserved')::integer
         + (v_stock->>'trees_sold')::integer = (v_stock->>'trees_total')::integer,
    'and they still add up to the total';

  -- Eleven when ten are left: all of them or none, never a half allocation.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  perform pg_temp.tt_expect(
    format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 11, %L, %L)',
           pg_temp.tt('c'), pg_temp.tt('p1'), 'reserved', 'حجز أكثر من الباقي'),
    'not_enough_trees');
  reset role;
  v_stock := pg_temp.tt_stock('c');
  assert (v_stock->>'trees_available')::integer = 10 and (v_stock->>'trees_reserved')::integer = 5,
    format('a refused allocation leaves the stock exactly as it was, got %s', v_stock);

  -- Releasing is the way back: the holder, the demand and the date go with the state.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  v_out := public.staff_set_tree_state(
    array(select t.id from public.trees t
          where t.project_id = pg_temp.tt('c') and t.state = 'reserved' order by t.seq limit 2),
    'available', 'الحريف تراجع');
  reset role;
  assert (v_out->>'trees')::integer = 2, format('two trees were released, got %s', v_out);
  assert (select count(*) from public.trees t
          where t.project_id = pg_temp.tt('c') and t.seq in (1, 2)
            and t.state = 'available' and t.held_by is null and t.request_id is null
            and t.allocated_at is null) = 2,
    'a released tree holds nobody again';

  v_stock := pg_temp.tt_stock('c');
  assert (v_stock->>'trees_available')::integer = 12 and (v_stock->>'trees_reserved')::integer = 3
     and (v_stock->>'trees_sold')::integer = 5,
    format('the release is back in «المتاحة», got %s', v_stock);

  -- A selection that names a tree nobody created is not the selection the reason describes.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005401');
  perform pg_temp.tt_expect(
    format('select public.staff_set_tree_state(array[%L]::uuid[], %L, %L)',
           gen_random_uuid(), 'available', 'تحرير زيتونة وهمية'),
    'invalid_tree_selection');
  perform pg_temp.tt_expect(
    format('select public.staff_set_tree_state(%L::uuid[], %L, %L)',
           '{}', 'available', 'تحرير بلا اختيار'),
    'invalid_tree_selection');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T7 · Who may touch any of it
-- ---------------------------------------------------------------------------

-- T7a · The grants themselves, read from the catalogue
do $$
begin
  assert not has_table_privilege('anon', 'public.trees', 'select'), 'a visitor never reads tree rows';
  assert not has_table_privilege('anon', 'public.trees', 'insert'), 'a visitor never writes a tree';
  assert has_table_privilege('authenticated', 'public.trees', 'select'),
    'staff read tree rows (RLS then decides who)';
  assert not has_table_privilege('authenticated', 'public.trees', 'insert'), 'nobody inserts a tree by hand';
  assert not has_table_privilege('authenticated', 'public.trees', 'update'), 'nobody updates a tree by hand';
  assert not has_table_privilege('authenticated', 'public.trees', 'delete'), 'nobody deletes a tree by hand';
  assert not has_table_privilege('authenticated', 'public.trees', 'truncate'), 'TRUNCATE stays revoked';
  assert (select relrowsecurity from pg_class where oid = 'public.trees'::regclass),
    'row level security is on for trees';

  assert not has_function_privilege('anon', 'public.staff_generate_trees(uuid, text)', 'execute'),
    'a visitor cannot number an offer';
  assert not has_function_privilege('anon', 'public.staff_allocate_trees(uuid, uuid, uuid, integer, text, text)', 'execute'),
    'a visitor cannot reserve a tree';
  assert not has_function_privilege('anon', 'public.staff_set_tree_state(uuid[], text, text)', 'execute'),
    'a visitor cannot move a tree''s state';
  assert not has_function_privilege('anon', 'public.staff_offer_stock(uuid)', 'execute'),
    'the Back Office stock is not a public read';
  assert has_function_privilege('anon', 'public.public_offer_stock(uuid)', 'execute'),
    'a visitor reads the four counts of an offer';

  -- The engines stay inside the app schema, whose USAGE is granted but whose functions are not.
  assert not has_function_privilege('authenticated', 'app.offer_stock_payload(uuid)', 'execute'),
    'the stock builder is not callable from the browser';
  assert not has_function_privilege('authenticated', 'app.allocate_offer_trees(uuid, uuid, uuid, integer, public.tree_state)', 'execute'),
    'the allocation engine is not callable from the browser';
  assert not has_function_privilege('authenticated', 'app.can_manage_trees()', 'execute'),
    'the role predicates are not callable from the browser';
  assert not has_function_privilege('authenticated', 'app.offer_min_trees(uuid)', 'execute'),
    'the minimum is read through the stock payload, not directly';
end $$;

-- T7b · A visitor: nothing but the counts
do $$
declare
  v_stock jsonb;
begin
  perform pg_temp.tt_as_anon();

  perform pg_temp.tt_denied('select 1 from public.trees');
  perform pg_temp.tt_denied(format('select public.staff_generate_trees(%L::uuid, %L)', pg_temp.tt('c'), 'محاولة زائر'));
  perform pg_temp.tt_denied(format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
                                   pg_temp.tt('c'), pg_temp.tt('p1'), 'reserved', 'محاولة زائر'));
  perform pg_temp.tt_denied(format('select public.staff_set_tree_state(array[%L]::uuid[], %L, %L)',
                                   gen_random_uuid(), 'available', 'محاولة زائر'));
  perform pg_temp.tt_denied(format('select public.staff_offer_stock(%L::uuid)', pg_temp.tt('c')));

  -- What a visitor does get: the counts of a published offer, while the projects module is open.
  v_stock := public.public_offer_stock(pg_temp.tt('c'));
  assert v_stock is not null and (v_stock->>'trees_total')::integer = 20,
    format('a visitor reads the stock of a published offer, got %s', v_stock);

  -- Stock is a fact and price is a permission: the payload carries no money key at all (PRJ-03).
  assert (select array_agg(k order by k) from jsonb_object_keys(v_stock) k)
         = array['min_trees', 'project_code', 'project_id', 'status', 'trees_available',
                 'trees_declared', 'trees_reserved', 'trees_sold', 'trees_total'],
    format('the stock payload holds exactly its nine keys, got %s',
           (select array_agg(k order by k) from jsonb_object_keys(v_stock) k));
  assert not exists (select 1 from jsonb_object_keys(v_stock) k
                     where k ~ '(millime|price|cost|margin|fee|amount|dinar|pricing|money)'),
    'not one key of the stock payload is about money';

  -- An offer that is not on sale has no public stock, whoever asks.
  assert public.public_offer_stock(pg_temp.tt('d')) is null, 'a draft offer states no stock publicly';
  assert public.public_offer_stock(gen_random_uuid()) is null, 'an unknown offer states no stock';

  reset role;
end $$;

-- T7c · The module gate: a closed module closes the counts too
do $$
begin
  update public.feature_flags set state = 'disabled' where key = 'projects';
  perform pg_temp.tt_as_anon();
  assert public.public_offer_stock(pg_temp.tt('c')) is null,
    'with the projects module closed a visitor reads no stock';
  reset role;

  update public.feature_flags set state = 'internal' where key = 'projects';
  perform pg_temp.tt_as_anon();
  assert public.public_offer_stock(pg_temp.tt('c')) is null,
    'an internal module is closed to a visitor';
  reset role;
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005403');
  assert public.public_offer_stock(pg_temp.tt('c')) is not null,
    'staff previewing an internal module still read the stock';
  reset role;

  update public.feature_flags set state = 'public' where key = 'projects';
end $$;

-- T7d · Authenticated without a staff role: the same nothing, said differently
do $$
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005404');

  assert (select count(*) from public.trees) = 0, 'RLS hides every tree row from a non-staff account';
  perform pg_temp.tt_denied('insert into public.trees (project_id, seq, code) values (gen_random_uuid(), 1, ''X'')');
  perform pg_temp.tt_denied('update public.trees set state = ''available''');
  perform pg_temp.tt_denied('delete from public.trees');

  perform pg_temp.tt_expect(format('select public.staff_generate_trees(%L::uuid, %L)',
                                   pg_temp.tt('c'), 'محاولة بلا دور'), 'forbidden');
  perform pg_temp.tt_expect(format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
                                   pg_temp.tt('c'), pg_temp.tt('p1'), 'reserved', 'محاولة بلا دور'), 'forbidden');
  perform pg_temp.tt_expect(format('select public.staff_set_tree_state(array[%L]::uuid[], %L, %L)',
                                   gen_random_uuid(), 'available', 'محاولة بلا دور'), 'forbidden');
  perform pg_temp.tt_expect(format('select public.staff_offer_stock(%L::uuid)', pg_temp.tt('c')), 'forbidden');

  reset role;
end $$;

-- T7e · Staff, each to their own job
do $$
declare
  v_tree uuid := (select t.id from public.trees t
                  where t.project_id = pg_temp.tt('c') and t.state = 'reserved' order by t.seq limit 1);
begin
  -- A commercial sells; they never create or destroy inventory, and never contract.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005403');
  assert (select count(*) from public.trees) > 0, 'a commercial reads the inventory';
  assert public.staff_offer_stock(pg_temp.tt('c')) is not null, 'a commercial reads the stock of an offer';

  perform pg_temp.tt_expect(format('select public.staff_generate_trees(%L::uuid, %L)',
                                   pg_temp.tt('c'), 'ترقيم من تجاري'), 'forbidden');
  perform pg_temp.tt_expect(format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
                                   pg_temp.tt('c'), pg_temp.tt('p1'), 'sold', 'بيع من تجاري'), 'forbidden');
  -- COM-05: only inside their own file. p2 belongs to nobody.
  perform pg_temp.tt_expect(format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
                                   pg_temp.tt('c'), pg_temp.tt('p2'), 'reserved', 'حجز لملفّ غيره'), 'forbidden');
  -- Releasing is stock keeping, not selling.
  perform pg_temp.tt_expect(format('select public.staff_set_tree_state(array[%L]::uuid[], %L, %L)',
                                   v_tree, 'available', 'تحرير من تجاري'), 'forbidden');
  -- Reserving inside their own file is exactly their job.
  perform public.staff_allocate_trees(pg_temp.tt('c'), pg_temp.tt('p1'), null, 5, 'reserved', 'حجز في ملفّه');
  reset role;

  assert (select (app.offer_stock_payload(pg_temp.tt('c'))->>'trees_reserved')::integer) = 8,
    'the commercial''s five trees joined the three already reserved';

  -- An agri manager keeps stock but does not read a client file, so allocation is not theirs.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000005402');
  perform pg_temp.tt_expect(format('select public.staff_allocate_trees(%L::uuid, %L::uuid, null, 5, %L, %L)',
                                   pg_temp.tt('c'), pg_temp.tt('p1'), 'reserved', 'حجز من مسؤول فلاحي'), 'forbidden');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T8 · The smallest basket: the offer first, then the global setting
-- ---------------------------------------------------------------------------

do $$
declare
  v_stock jsonb;
begin
  -- An offer with no minimum of its own inherits the setting.
  update public.settings set value = to_jsonb(3) where key = 'offers.min_trees_default';
  assert app.offer_min_trees(pg_temp.tt('e')) = 3, 'an offer with no minimum inherits offers.min_trees_default';

  v_stock := pg_temp.tt_stock('e');
  assert (v_stock->>'min_trees')::integer = 3, 'and the form reads the same figure through the stock payload';

  -- Its own minimum wins over the setting, in both directions.
  update public.projects set min_trees_per_order = 2 where id = pg_temp.tt('e');
  assert app.offer_min_trees(pg_temp.tt('e')) = 2, 'the offer''s own minimum wins, below the default';
  update public.projects set min_trees_per_order = 3 where id = pg_temp.tt('e');
  assert app.offer_min_trees(pg_temp.tt('e')) = 3, 'and above it';

  -- An inherited minimum can never exceed the offer: a two-tree offer would be unsellable.
  update public.projects set min_trees_per_order = null where id = pg_temp.tt('f');
  assert app.offer_min_trees(pg_temp.tt('f')) = 2,
    'the inherited minimum is capped by the offer''s own tree_count';

  -- And the offer's own column is checked against tree_count by the database.
  begin
    update public.projects set min_trees_per_order = 5 where id = pg_temp.tt('f');
    raise exception 'a minimum above tree_count must be refused';
  exception when check_violation then null;
  end;
  begin
    update public.projects set min_trees_per_order = 0 where id = pg_temp.tt('f');
    raise exception 'a minimum below one must be refused';
  exception when check_violation then null;
  end;
  -- Same for a code pattern that would number every tree the same.
  begin
    update public.projects set tree_code_pattern = 'ZITOUNA' where id = pg_temp.tt('f');
    raise exception 'a code pattern without {seq} must be refused';
  exception when check_violation then null;
  end;

  update public.settings set value = to_jsonb(1) where key = 'offers.min_trees_default';
  assert app.offer_min_trees(pg_temp.tt('e')) = 3, 'an offer that states its minimum ignores the setting entirely';
  update public.projects set min_trees_per_order = null where id = pg_temp.tt('e');
  assert app.offer_min_trees(pg_temp.tt('e')) = 1, 'and with neither, one tree is the floor';
end $$;

-- The same floor the form shows is the floor the intake enforces, so the page and the database cannot disagree.
do $$
declare
  v_payload jsonb;
  v_result  jsonb;
begin
  update public.projects set tree_count = 10 where id = pg_temp.tt('e');
  update public.projects set min_trees_per_order = 5 where id = pg_temp.tt('e');

  v_payload := jsonb_build_object(
    'full_name', 'حريف تجريبي',
    'phone_e164', '+21655540003',
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', pg_temp.tt('e')::text,
    'trees', '4');

  perform pg_temp.tt_expect(format('select public.submit_offer_request(%L::jsonb)', v_payload), 'below_min_trees');

  -- At the minimum exactly, the request goes through and keeps the number that was asked for.
  v_payload := jsonb_set(jsonb_set(v_payload, '{trees}', '"5"'), '{phone_e164}', '"+21655540004"');
  v_result  := public.submit_offer_request(v_payload);
  assert (select r.offer_trees from public.interest_requests r where r.request_no = v_result->>'request_no') = 5,
    'a request at the offer''s minimum is taken as it was written';

  -- And the intake still records the ask only: reserving a tree is a decision a human takes.
  assert (select count(*) from public.trees where project_id = pg_temp.tt('e')) = 0,
    'an interest request allocates no tree';
end $$;
