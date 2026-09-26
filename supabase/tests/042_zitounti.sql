-- 042 · فضاء «زيتونتي» — the client's file after the sale (supabase/pending/bb_42_zitounti.sql).
--
-- Runs against the live database inside a rolled-back transaction, after the draft itself:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_42_zitounti.sql supabase/pending/tests/042_zitounti.sql
--
-- PERMISSIONS FIRST, and the closed module before anything else — the flag is 'disabled' on the live database
-- and must stay that way, so the refusal is the only state the live database can prove without the file first
-- opening it inside its own transaction.
--
-- The whole risk of this module is privacy: it is one client's file, and no reader may reach another's. So half
-- of what follows is two people, two staff members, and the assertion that each sees exactly one of them.
--
-- Every fixture carries ids, codes and phone numbers of its own and nothing survives the file. public.parcels is
-- never read and never written.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function pg_temp.tt_expect(p_sql text, p_expected text) returns void language plpgsql as $$
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

create or replace function pg_temp.tt_denied(p_sql text) returns void language plpgsql as $$
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

create or replace function pg_temp.tt_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
end $$;

create or replace function pg_temp.tt_as_user(p_sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function pg_temp.zz(p_key text) returns uuid language sql stable as $$
  select nullif(current_setting('test.zz_' || p_key, true), '')::uuid
$$;

-- The file of one person, read the way the Back Office reads it.
create function pg_temp.zz_file(p_key text) returns jsonb language sql stable as $$
  select public.staff_zitounti_file(pg_temp.zz(p_key))
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

do $$
declare
  v_id      uuid;
  v_status  uuid;
  v_spacing uuid;
begin
  -- Staff. A commercial who owns exactly one of the two files, Finance who owns both, the agricultural manager
  -- who runs the grove and reads no client identity at all, and a 'client' user with no staff role.
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000004201', 'authenticated', 'authenticated', 'fin-zit@test.local',  '{"full_name":"Finance Zitounti"}'),
    ('00000000-0000-0000-0000-000000004202', 'authenticated', 'authenticated', 'com-zit@test.local',  '{"full_name":"Commercial Zitounti"}'),
    ('00000000-0000-0000-0000-000000004203', 'authenticated', 'authenticated', 'agri-zit@test.local', '{"full_name":"Agri Zitounti"}'),
    ('00000000-0000-0000-0000-000000004204', 'authenticated', 'authenticated', 'cli-zit@test.local',  '{"full_name":"Client Zitounti"}');

  insert into public.user_roles (user_id, role) values
    ('00000000-0000-0000-0000-000000004201', 'finance'),
    ('00000000-0000-0000-0000-000000004202', 'commercial'),
    ('00000000-0000-0000-0000-000000004203', 'agri_manager'),
    ('00000000-0000-0000-0000-000000004204', 'client');

  -- One offer, one spacing class, so the area per tree is answerable.
  select id into v_spacing from public.tree_spacing_classes where is_active order by sort_order limit 1;

  insert into public.projects (code, name, governorate_id, status, tree_count,
                               olive_variety, plan_storage_path, service_option_ids)
  values ('ZZ-A-' || gen_random_uuid(), 'ضيعة زيتونتي', 34, 'published', 20,
          'شملالي', 'plans/zz-a.pdf',
          (select coalesce(array_agg(oi.id), '{}'::uuid[])
             from public.option_items oi where oi.list_key = 'agrized_service' and oi.is_active))
  returning id into v_id;
  perform set_config('test.zz_a', v_id::text, true);

  insert into public.project_spacing_classes (project_id, spacing_class_id) values (pg_temp.zz('a'), v_spacing);

  -- A second offer, so «my trees» is grouped and not merged.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('ZZ-B-' || gen_random_uuid(), 'ضيعة ثانية', 34, 'published', 10) returning id into v_id;
  perform set_config('test.zz_b', v_id::text, true);

  -- Two clients: the first is the commercial's file, the second is nobody's.
  select id into v_status from public.lead_statuses where stage = 'new' and is_active
   order by is_stage_default desc, sort_order limit 1;

  insert into public.persons (full_name, phone_e164, status_id, governorate_id, assigned_to)
  values ('مالك زيتونات', '+21655542001', v_status, 34, '00000000-0000-0000-0000-000000004202')
  returning id into v_id;
  perform set_config('test.zz_p1', v_id::text, true);

  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('مالك آخر', '+21655542002', v_status, 34) returning id into v_id;
  perform set_config('test.zz_p2', v_id::text, true);

  -- P1 holds five trees on offer A — three sold, two reserved — and one sold tree on offer B.
  -- P2 holds two sold trees on offer A, which P1 must never see.
  insert into public.trees (project_id, seq, code, state, held_by, allocated_at) values
    (pg_temp.zz('a'), 1, 'ZZ-A-0001', 'sold',     pg_temp.zz('p1'), now()),
    (pg_temp.zz('a'), 2, 'ZZ-A-0002', 'sold',     pg_temp.zz('p1'), now()),
    (pg_temp.zz('a'), 3, 'ZZ-A-0003', 'sold',     pg_temp.zz('p1'), now()),
    (pg_temp.zz('a'), 4, 'ZZ-A-0004', 'reserved', pg_temp.zz('p1'), now()),
    (pg_temp.zz('a'), 5, 'ZZ-A-0005', 'reserved', pg_temp.zz('p1'), now()),
    (pg_temp.zz('a'), 6, 'ZZ-A-0006', 'sold',     pg_temp.zz('p2'), now()),
    (pg_temp.zz('a'), 7, 'ZZ-A-0007', 'sold',     pg_temp.zz('p2'), now()),
    (pg_temp.zz('a'), 8, 'ZZ-A-0008', 'available', null, null),
    (pg_temp.zz('b'), 1, 'ZZ-B-0001', 'sold',     pg_temp.zz('p1'), now());

  -- What P1 asked for, with the figures frozen on the day they asked (0049).
  insert into public.interest_requests (request_no, person_id, full_name, phone_e164, whatsapp_e164,
                                        residence_governorate_id, contact_channel, consent_text,
                                        request_kind, project_id, offer_trees,
                                        offer_price_per_tree_millimes, offer_total_price_millimes,
                                        offer_annual_fee_per_tree_millimes, offer_annual_fee_total_millimes,
                                        invest_anywhere, project_type_unsure)
  values ('AGZ-ZZ-0001', pg_temp.zz('p1'), 'مالك زيتونات', '+21655542001', '+21655542001',
          34, 'phone', 'موافقة تجريبية', 'offer', pg_temp.zz('a'), 5,
          4491000, 22455000, 150000, 750000, true, true);

  -- A reservation, a visit and a receipt, each belonging to a module with a flag of its own.
  insert into public.reservations (reference_no, person_id, project_id, trees_count,
                                   deposit_due_millimes, valid_days, reserved_at, expires_at)
  values ('RES-ZZ-0001', pg_temp.zz('p1'), pg_temp.zz('a'), 5, 1000000, 15, now(), now() + interval '15 days');

  insert into public.visits (visit_no, person_id, project_id, visit_date, slot_label_ar,
                             people_count, contact_channel)
  values ('VIS-ZZ-0001', pg_temp.zz('p1'), pg_temp.zz('a'), current_date, 'صباح', 2, 'phone');

  insert into public.payments (reference_no, person_id, project_id, kind, amount_millimes, received_at)
  values ('PAY-ZZ-0001', pg_temp.zz('p1'), pg_temp.zz('a'), 'deposit', 1000000, now());

  -- A voided receipt: it stays in the file, marked, and never counts toward the total.
  insert into public.payments (reference_no, person_id, project_id, kind, amount_millimes, received_at,
                               voided_at, voided_by)
  values ('PAY-ZZ-0002', pg_temp.zz('p1'), pg_temp.zz('a'), 'other', 500000, now(),
          now(), '00000000-0000-0000-0000-000000004201');
end $$;

-- ---------------------------------------------------------------------------
-- T1 · The closed module, which is the live state — asserted before anything is opened
-- ---------------------------------------------------------------------------

-- THIS SECTION SETS THE STATE IT MEASURES, AND USED TO ASSERT IT INSTEAD.
--
-- It read «the zitounti flag must still be «معطّل» on the live database — the owner switches a module on
-- himself». That sentence was true as a project rule and wrong as a test: it made a file about whether a
-- CLOSED module refuses depend on where a switch happened to be left, so the day the owner opened the space
-- — 2026-09-26, by instruction, in 0104 — this file went red without anything it tests having changed.
--
-- The behaviour under test is «closed ⇒ refuses», so the transaction closes it and rolls back. The rule
-- about who presses the switch is a rule about migrations; it is not a fact this file can pin, and pinning
-- it here only made the suite brittle.
update public.feature_flags set state = 'disabled' where key = 'zitounti';

do $$
begin
  assert (select state from public.feature_flags where key = 'zitounti') = 'disabled',
    'the transaction just closed the module; if this fails, something re-opened it mid-test';

  -- Staff, module closed: the business refusal, not a privilege error and not an empty payload.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  perform pg_temp.tt_expect(
    'select public.staff_zitounti_file(' || quote_literal(pg_temp.zz('p1')::text) || '::uuid)', 'module_closed');
  perform pg_temp.tt_expect('select public.staff_zitounti_holders()', 'module_closed');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T2 · Who may call it at all
-- ---------------------------------------------------------------------------

do $$
begin
  -- A visitor never reaches a client file, open module or not.
  perform pg_temp.tt_as_anon();
  perform pg_temp.tt_denied(
    'select public.staff_zitounti_file(' || quote_literal(pg_temp.zz('p1')::text) || '::uuid)');
  perform pg_temp.tt_denied('select public.staff_zitounti_holders()');
  reset role;

  -- The reading functions live in the app schema and are nobody's to call directly: the gate is the one
  -- public entry point, so a signed-in session cannot step around app.can_see_person.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  perform pg_temp.tt_denied(
    'select app.zitounti_trees(' || quote_literal(pg_temp.zz('p1')::text) || '::uuid)');
  perform pg_temp.tt_denied(
    'select app.zitounti_payments(' || quote_literal(pg_temp.zz('p1')::text) || '::uuid)');
  perform pg_temp.tt_denied('select app.zitounti_probe(''select null::jsonb'', null::uuid)');
  reset role;
end $$;

-- Open the module for the rest of the file. Rolled back with everything else; the live flag never moves.
update public.feature_flags set state = 'public' where key = 'zitounti';

-- ---------------------------------------------------------------------------
-- T3 · One client's file reaches exactly one client's readers
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
begin
  -- The commercial the file is assigned to.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004202');
  v := pg_temp.zz_file('p1');
  assert v->'person'->>'full_name' = 'مالك زيتونات', 'the assigned commercial reads their own client file';
  -- And not the file next door.
  perform pg_temp.tt_expect(
    'select public.staff_zitounti_file(' || quote_literal(pg_temp.zz('p2')::text) || '::uuid)', 'forbidden');
  reset role;

  -- Finance reads every file (app.can_see_person, since 0002).
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  assert pg_temp.zz_file('p1')->'person'->>'full_name' = 'مالك زيتونات', 'Finance reads any client file';
  assert pg_temp.zz_file('p2')->'person'->>'full_name' = 'مالك آخر',     'Finance reads any client file';
  -- An id that is not a person is named as such, not answered with an empty file.
  perform pg_temp.tt_expect(
    'select public.staff_zitounti_file(''00000000-0000-0000-0000-0000000042ff''::uuid)', 'invalid_person');
  reset role;

  -- The agricultural manager runs the grove and does not read client identities — the CRM rule of 0002,
  -- unchanged here. If this ever has to change it is a change to app.can_see_person, not a second door.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004203');
  perform pg_temp.tt_expect(
    'select public.staff_zitounti_file(' || quote_literal(pg_temp.zz('p1')::text) || '::uuid)', 'forbidden');
  reset role;

  -- A user carrying the role 'client' is not staff: this module is the staff reading, and until a client login
  -- exists (see §6 of the draft) nobody signs in as one.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004204');
  perform pg_temp.tt_expect(
    'select public.staff_zitounti_file(' || quote_literal(pg_temp.zz('p1')::text) || '::uuid)', 'forbidden');
  perform pg_temp.tt_expect('select public.staff_zitounti_holders()', 'forbidden');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T4 · Which trees are mine — the first thing a buyer asks
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
  a jsonb;
  b jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  v := pg_temp.zz_file('p1');

  assert (v->'totals'->>'trees')::int = 6,          'P1 holds six trees in all';
  assert (v->'totals'->>'trees_sold')::int = 4,     'four of them are sold';
  assert (v->'totals'->>'trees_reserved')::int = 2, 'two of them are reserved';
  assert (v->'totals'->>'offers')::int = 2,         'across two offers';
  assert (v->'trees'->>'status') = 'ok' and (v->'trees'->>'count')::int = 2,
    'the trees are grouped per offer, because that is the grain of everything else in the file';

  select x into a from jsonb_array_elements(v->'trees'->'items') x where x->>'project_code' like 'ZZ-A-%';
  select x into b from jsonb_array_elements(v->'trees'->'items') x where x->>'project_code' like 'ZZ-B-%';

  assert (a->>'trees')::int = 5 and (a->>'trees_sold')::int = 3 and (a->>'trees_reserved')::int = 2,
    'offer A holds five of P1''s trees';
  assert (b->>'trees')::int = 1, 'offer B holds the sixth';

  -- The codes, in tree order, because the code is the thing the buyer was told.
  assert a->'codes' = '["ZZ-A-0001","ZZ-A-0002","ZZ-A-0003","ZZ-A-0004","ZZ-A-0005"]'::jsonb,
    'the codes come back in tree order, not alphabetical order';
  assert a->>'first_code' = 'ZZ-A-0001' and a->>'last_code' = 'ZZ-A-0005',
    'first and last are read by seq (0054 §5), never by sorting the text';

  -- Nobody else's tree is in this file. This is the assertion the module exists to keep.
  assert not (a->'codes' @> '["ZZ-A-0006"]'::jsonb) and not (a->'codes' @> '["ZZ-A-0007"]'::jsonb),
    'P2''s trees must never appear in P1''s file';
  assert not (a->'codes' @> '["ZZ-A-0008"]'::jsonb),
    'a tree nobody holds belongs to no file';

  -- The area follows the offer's spacing class; the offer carries exactly one, so it is answerable.
  assert (a->>'area_per_tree_m2') is not null, 'one spacing class on the offer gives an area per tree';
  assert (a->>'area_m2')::numeric = round((a->>'area_per_tree_m2')::numeric * 5),
    'the area of my trees is the class area times how many I hold';

  -- What the offer promises, by name, with no price attached (0023).
  -- The count is the OFFER'S OWN, never a constant: the offer above is seeded with every active row of
  -- option_items('agrized_service'), and bb_40_agri_services.sql adds التسميد and المداواة to that list, so a
  -- literal 10 here would pass alone and fail the moment the two drafts meet. Reading the offer's own
  -- cardinality asserts the real rule — every service the offer declares travels with the trees — and keeps
  -- holding when the owner adds an eleventh service from the Back Office.
  assert jsonb_array_length(a->'services')
         = (select cardinality(service_option_ids) from public.projects where id = pg_temp.zz('a')),
    'every service the offer declares travels with the trees, names only';
  assert a->>'plan_storage_path' = 'plans/zz-a.pdf',
    'v3 §38 «مخطط القطعة» is answered by the offer''s plan — public.parcels is empty and is being retired';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T5 · An offer with more trees than a screen can print
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
  a jsonb;
begin
  update public.settings set value = to_jsonb(2) where key = 'zitounti.max_codes';

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  v := pg_temp.zz_file('p1');
  select x into a from jsonb_array_elements(v->'trees'->'items') x where x->>'project_code' like 'ZZ-A-%';

  assert jsonb_array_length(a->'codes') = 2, 'the printed codes stop at the setting';
  assert (a->>'trees')::int = 5, 'the count is still the truth — a client holding 8 000 trees holds 8 000';
  reset role;

  update public.settings set value = to_jsonb(200) where key = 'zitounti.max_codes';
end $$;

-- ---------------------------------------------------------------------------
-- T6 · A section says why it is empty, and never says «nothing» for «not built»
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
begin
  -- Every neighbouring module is 'disabled' on the live database, which is the interesting case: the file must
  -- distinguish «معطّلة» from «ما فمّاش».
  --
  -- The precondition is SET here, not inherited. npm run db:test gives every file its own rolled-back
  -- transaction, so nothing leaks between them; but a sibling file opening its own flag — 040 opens
  -- agri_backoffice and subscriptions, 041 opens harvest — would otherwise decide what this block tests the
  -- moment the files share one transaction (a combined dry-run). Asserting a closed module means closing it.
  update public.feature_flags set state = 'disabled'
   where key in ('reservations', 'visits', 'payments', 'installments', 'contracts',
                 'agri_backoffice', 'subscriptions', 'harvest');

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  v := pg_temp.zz_file('p1');
  assert v->'reservations'->>'status' = 'closed', 'a closed module says so rather than reporting no rows';
  assert v->'visits'->>'status'       = 'closed', 'same for visits';
  assert v->'payments'->>'status'     = 'closed', 'same for the receipts';
  assert v->'operations'->>'status'   = 'closed', 'same for the agricultural record';
  assert v->'subscription'->>'status' = 'closed', 'same for the annual subscription';
  assert v->'harvest'->>'status'      = 'closed', 'same for the season';
  -- «closed» AND NOT «phase_later» SINCE 0095. When 0068 wrote this, `phase_later` was the honest answer:
  -- there were no contracts in the database at all, so «switched off» would have been a lie about a thing
  -- that did not exist. 0072 built them and 0095 plugged the two readers in, so a disabled module now means
  -- what it means everywhere else on this payload — the owner has not switched it on — and the four lines
  -- above assert exactly that for the other six. A status that said «later» for a module that is finished
  -- would send the screen looking for a feature nobody is still waiting for.
  assert v->'contracts'->>'status'    = 'closed',
    'the contract rows are switched off, not unbuilt — they exist since 0072';
  assert v->'installments'->>'status' = 'closed', 'and so are the instalments';
  assert v->'totals'->'paid_millimes' = 'null'::jsonb,
    'no money total is stated while the modules that record money are off';
  reset role;

  -- Open them, and the same file answers with the rows.
  update public.feature_flags set state = 'public' where key in ('reservations', 'visits');

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  v := pg_temp.zz_file('p1');
  assert v->'reservations'->>'status' = 'ok' and (v->'reservations'->>'count')::int = 1,
    'the reservation of this client, and only this client';
  assert v->'visits'->>'status' = 'ok' and (v->'visits'->>'count')::int = 1, 'and the visit';
  assert v->'payments'->>'status' = 'ok' and (v->'payments'->>'count')::int = 2,
    'both receipts, the good one and the voided one';
  assert (v->'totals'->>'paid_millimes')::bigint = 1000000,
    'a voided receipt stays on the screen, marked, and counts for nothing';
  assert (select bool_or((x->>'voided')::boolean) from jsonb_array_elements(v->'payments'->'items') x),
    'the voided receipt is marked rather than hidden — a client told «خلّصت» must be able to ask what happened';
  assert v->'requests'->>'status' = 'ok' and (v->'requests'->>'count')::int = 1, 'and what they asked for';
  assert (v->'requests'->'items'->0->>'annual_fee_per_tree_millimes')::bigint = 150000,
    'the annual fee shown is the one frozen on the request, not today''s global value';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T7 · The three records another stage-4 file is writing right now
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
begin
  update public.feature_flags set state = 'public'
   where key in ('agri_backoffice', 'subscriptions', 'harvest');

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  v := pg_temp.zz_file('p1');

  -- WHICH WORLD THIS FILE IS IN, asserted both ways rather than one.
  --
  -- Applied alone — the state of the live database, and of anyone who applies bb_42 before its siblings — the
  -- three tables are absent and each section must SAY «not built» and must not fail: زيتونتي is a join, and a
  -- join whose other side has not landed is a missing section, not an error page.
  --
  -- Dry-run all three drafts in one transaction and the SAME assertions must flip to a real section:
  --   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_40_agri_services.sql \
  --        supabase/pending/bb_41_harvest.sql supabase/pending/bb_42_zitounti.sql \
  --        supabase/pending/tests/040_agri_services.sql supabase/pending/tests/041_harvest.sql supabase/pending/tests/042_zitounti.sql
  -- That flip is what proves the three cross-module queries actually MATCH the columns bb_40 and bb_41 build,
  -- rather than merely being guarded — a query naming a column that does not exist would be swallowed by the
  -- probe and reported as «not built» forever, which is the one failure this module could hide.
  --
  -- Asserting only the 'not_built' branch would pass in both worlds for the wrong reason.
  if to_regclass('public.agri_operations') is null then
    assert v->'operations'->>'status' = 'not_built', 'the agricultural record is not there yet, and says so';
  else
    assert v->'operations'->>'status' = 'ok',
      'once bb_40 lands, the same query answers a real section instead of «not built»';
  end if;

  if to_regclass('public.subscriptions') is null then
    assert v->'subscription'->>'status' = 'not_built', 'nor the subscription';
  else
    assert v->'subscription'->>'status' = 'ok', 'and the subscription query matches bb_40''s columns';
  end if;

  if to_regclass('public.harvest_seasons') is null then
    assert v->'harvest'->>'status' = 'not_built', 'nor the season';
  else
    assert v->'harvest'->>'status' = 'ok', 'and the harvest query matches bb_41''s columns';
  end if;
  assert v->'trees'->>'status' = 'ok' and (v->'totals'->>'trees')::int = 6,
    'and the rest of the file is unaffected by their absence';
  reset role;

  -- The guard itself: a query naming a table that is not there answers null, and one that is there answers rows.
  assert app.zitounti_probe('select jsonb_agg(x) from public.not_a_table_42 x where x.id = $1', null) is null,
    'a missing table is «not built», not an exception';
  assert app.zitounti_probe(
           'select jsonb_agg(t.code) from public.trees t where t.held_by = $1', pg_temp.zz('p1'))
         @> '["ZZ-A-0001"]'::jsonb,
    'and a table that exists is read normally';
end $$;

-- ---------------------------------------------------------------------------
-- T8 · The list in front of the file
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  v := public.staff_zitounti_holders();
  assert (select count(*) from jsonb_array_elements(v) x
           where x->>'person_id' in (pg_temp.zz('p1')::text, pg_temp.zz('p2')::text)) = 2,
    'Finance sees both holders';
  assert (select (x->>'trees')::int from jsonb_array_elements(v) x
           where x->>'person_id' = pg_temp.zz('p1')::text) = 6,
    'with the count of what each one holds';
  reset role;

  -- The commercial sees the holder in their own file and not the other — the list is filtered row by row,
  -- so it cannot become a directory of every buyer AgriZed has.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004202');
  v := public.staff_zitounti_holders();
  assert (select count(*) from jsonb_array_elements(v) x where x->>'person_id' = pg_temp.zz('p1')::text) = 1,
    'the commercial sees their own client';
  assert (select count(*) from jsonb_array_elements(v) x where x->>'person_id' = pg_temp.zz('p2')::text) = 0,
    'and not the file next door';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T9 · The module writes nothing
-- ---------------------------------------------------------------------------

do $$
declare
  v_audit bigint;
  v_trees bigint;
begin
  select count(*) into v_audit from public.audit_logs;
  select count(*) into v_trees from public.trees where held_by = pg_temp.zz('p1');

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004201');
  perform pg_temp.zz_file('p1');
  perform pg_temp.zz_file('p2');
  perform public.staff_zitounti_holders();
  reset role;

  assert (select count(*) from public.audit_logs) = v_audit,
    'reading a client file changes nothing — this module owns no business record';
  assert (select count(*) from public.trees where held_by = pg_temp.zz('p1')) = v_trees,
    'and it holds no tree of its own';

  -- The function is declared STABLE, which is what says so to PostgreSQL as well as to the next reader.
  assert (select p.provolatile from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'staff_zitounti_file') = 's',
    'staff_zitounti_file is STABLE: it cannot write even by accident';
end $$;
