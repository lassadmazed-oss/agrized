-- 043 · THE CROSS-MODULE TEST FOR STAGE 4 — the gates, then the privacy.
--
-- Written by the reconciliation pass rather than by the three module agents, so it does not inherit any of
-- their assumptions: it names their functions from the outside and checks what a reader can actually reach.
-- 040, 041 and 042 each test one module; this file tests the seams between them, which is where the three
-- agents could not see each other.
--
-- Run inside the always-rolled-back dry-run harness, after all three drafts:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_40_agri_services.sql \
--        supabase/pending/bb_41_harvest.sql supabase/pending/bb_42_zitounti.sql \
--        supabase/pending/tests/043_stage4_gates_and_privacy.sql
--
-- PART 1 — THE GATE. With all four flags 'disabled' (their live state, and the state the owner keeps them in
-- until he presses the switch himself), no stage-4 WRITER may run, for anybody, including super_admin. The
-- three modules do not have the same reader contract and this file asserts each one as it actually is:
--   · bb_40 gates its seven writers and deliberately does NOT gate its four readers — they answer with a
--     module_state so the screen can say «معطّلة» instead of erroring.
--   · bb_41 gates all eight of its RPCs, readers included.
--   · bb_42 gates both of its RPCs.
-- Asserting a uniform rule the code does not have would be a test that passes by being wrong.
--
-- PART 2 — THE PRIVACY. A staff user who may not see a person cannot reach that person's trees, operations,
-- subscription or harvest share through ANY function stage 4 adds. Tested as queries, not as a claim, and
-- every negative has a positive control: Finance is shown reading exactly what the commercial could not, so an
-- empty result is proved to be a refusal rather than an empty table.

create or replace function pg_temp.pp_denied(p_sql text, p_expected text) returns void language plpgsql as $$
declare v_ran boolean := false;
begin
  begin
    execute p_sql;
    v_ran := true;
  exception when others then
    if sqlerrm <> p_expected then
      raise exception 'PRIVACY: expected "%" but got "%" for %', p_expected, sqlerrm, p_sql;
    end if;
  end;
  if v_ran then
    raise exception 'PRIVACY BREACH: % went through; it must raise %', p_sql, p_expected;
  end if;
end $$;

create or replace function pg_temp.pp_as(p_sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- ===========================================================================
-- PART 1 · THE GATE — every flag disabled, which is the live state
-- ===========================================================================
do $$
declare
  su uuid := '00000000-0000-0000-0000-0000000090b1';
  n  integer;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (su, 'authenticated', 'authenticated', 'pp-su@test.local', '{"full_name":"PP Super"}');
  insert into public.user_roles (user_id, role) values (su, 'super_admin');

  -- The precondition is SET, not assumed: a sibling test file opening its own flag in the same transaction
  -- must not decide what this block proves.
  update public.feature_flags set state = 'disabled'
   where key in ('agri_backoffice', 'subscriptions', 'harvest', 'zitounti');

  select count(*) into n from public.feature_flags
   where key in ('agri_backoffice', 'subscriptions', 'harvest', 'zitounti') and state <> 'disabled';
  assert n = 0, 'all four stage-4 flags must be disabled before the gate is tested';

  -- The highest role there is. If the switch holds against super_admin it holds against everyone.
  perform pg_temp.pp_as(su::text);

  -- bb_40's seven writers.
  perform pg_temp.pp_denied('select public.staff_save_offer_service(''{}''::jsonb, null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_delete_offer_service(gen_random_uuid(), null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_save_agri_operation(''{}''::jsonb, null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_approve_agri_operation(gen_random_uuid(), null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_create_subscription(''{}''::jsonb, null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_set_subscription_status(gen_random_uuid(), ''active'', null, null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_request_subscription_service(gen_random_uuid(), gen_random_uuid(), null)', 'module_closed');

  -- bb_41 gates its readers too.
  perform pg_temp.pp_denied('select public.staff_save_harvest_season(''{}''::jsonb, null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_set_harvest_money(gen_random_uuid(), 0, 0, null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_set_harvest_status(gen_random_uuid(), ''closed'', null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_save_offer_harvest_options(gen_random_uuid(), null, null, null, null, null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_set_harvest_choice(gen_random_uuid(), gen_random_uuid(), null, null, null, null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_settle_harvest_season(gen_random_uuid(), null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_harvest_overview(null)', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_harvest_season(gen_random_uuid())', 'module_closed');

  -- bb_42's two.
  perform pg_temp.pp_denied('select public.staff_zitounti_file(gen_random_uuid())', 'module_closed');
  perform pg_temp.pp_denied('select public.staff_zitounti_holders()', 'module_closed');

  -- bb_40's four readers are the deliberate exception: they answer, and they say the module is shut, so the
  -- Back Office can render «معطّلة» rather than an error page. Asserting they raise would be asserting a
  -- contract the module does not have.
  -- The contract is that they RETURN rather than raise; what they return for a null offer is the module's own
  -- business (staff_offer_services answers null when no offer is named). A raise here would fail the block.
  perform public.staff_offer_services(null);
  assert public.staff_agri_operations(null, 'all', null) ? 'module_state',
    'the operations list answers, and names the module state so the screen can say «معطّلة»';
  assert public.staff_subscriptions('all', null, null) ? 'module_state',
    'and so does the subscriptions list';
  reset role;

  -- anon holds no EXECUTE on any of them: refused by the grant, before any flag or role is consulted.
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
  begin
    perform public.staff_harvest_overview(null);
    raise exception 'GATE BREACH: anon executed staff_harvest_overview';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.staff_agri_operations(null, 'all', null);
    raise exception 'GATE BREACH: anon executed staff_agri_operations';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise notice 'GATE PROOF PASSED — every stage-4 writer refuses while its module is disabled';
end $$;

-- ===========================================================================
-- PART 2 · THE PRIVACY — now the flags are opened, so nothing is denied
--          merely because a module is off. A closed module proves nothing.
-- ===========================================================================
do $$
declare
  c1  uuid := '00000000-0000-0000-0000-0000000090a1';  -- commercial who owns P1
  c2  uuid := '00000000-0000-0000-0000-0000000090a2';  -- commercial who owns P2
  ag  uuid := '00000000-0000-0000-0000-0000000090a3';  -- agri manager: runs the grove, reads no client
  fi  uuid := '00000000-0000-0000-0000-0000000090a4';  -- finance: sees both
  p1  uuid;
  p2  uuid;
  pj  uuid;
  st  uuid;
  sea uuid;
  v   jsonb;
  n   integer;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (c1, 'authenticated', 'authenticated', 'pp-c1@test.local', '{"full_name":"PP C1"}'),
    (c2, 'authenticated', 'authenticated', 'pp-c2@test.local', '{"full_name":"PP C2"}'),
    (ag, 'authenticated', 'authenticated', 'pp-ag@test.local', '{"full_name":"PP Agri"}'),
    (fi, 'authenticated', 'authenticated', 'pp-fi@test.local', '{"full_name":"PP Fin"}');
  insert into public.user_roles (user_id, role) values
    (c1, 'commercial'), (c2, 'commercial'), (ag, 'agri_manager'), (fi, 'finance');

  -- Two clients of two different commercials, each holding trees in the SAME offer, so nothing separates them
  -- except app.can_see_person. If the offer separated them the test would prove nothing.
  select id into st from public.lead_statuses order by sort_order limit 1;

  insert into public.persons (full_name, phone_e164, assigned_to, status_id)
       values ('حريف الأول', '+21690000091', c1, st) returning id into p1;
  insert into public.persons (full_name, phone_e164, assigned_to, status_id)
       values ('حريف الثاني', '+21690000092', c2, st) returning id into p2;

  insert into public.projects (code, name, governorate_id, status, tree_count)
       values ('PP-' || gen_random_uuid(), 'ضيعة الاختبار', 34, 'published', 10) returning id into pj;

  -- A held tree must say who holds it AND since when (0054 trees_holder_check).
  insert into public.trees (project_id, seq, code, state, held_by, allocated_at)
  select pj, g, 'PP-' || lpad(g::text, 4, '0'), 'sold', case when g <= 3 then p1 else p2 end, now()
    from generate_series(1, 6) g;

  -- One act on the whole grove, one subscription for P2, one settled season with a share for P2.
  insert into public.agri_operations (project_id, service_option_id, label_ar, scope, status, executed_on, cost_millimes)
  select pj, oi.id, oi.label_ar, 'offer', 'done', current_date, 900000
    from public.option_items oi where oi.list_key = 'agrized_service' and oi.is_active
    order by oi.sort_order limit 1;

  insert into public.subscriptions (person_id, project_id, season_label, season_starts_on, season_ends_on,
                                    tree_count, fee_per_tree_millimes, fee_source, status)
  values (p2, pj, 'موسم اختبار', current_date, current_date + 365, 3, 12000, 'global', 'active');

  insert into public.harvest_seasons (project_id, season_year, label_ar, status, trees_harvested,
                                      olives_kg, oil_litres, settled_at)
  values (pj, 2026, 'موسم 2026/2027', 'settled', 6, 1200, 200, now()) returning id into sea;

  insert into public.harvest_shares (season_id, person_id, trees_held, trees_harvested, olives_kg, oil_litres)
  values (sea, p2, 3, 6, 600, 100);

  -- Everything open, so nothing is denied merely because a module is off. A closed module proves nothing
  -- about privacy.
  update public.feature_flags set state = 'public'
   where key in ('zitounti', 'agri_backoffice', 'subscriptions', 'harvest');

  -- =========================================================================
  -- 1 · THE COMMERCIAL WHO DOES NOT OWN THE FILE
  -- =========================================================================
  perform pg_temp.pp_as(c1::text);

  -- His own file opens.
  v := public.staff_zitounti_file(p1);
  assert (v->'totals'->>'trees')::int = 3, 'C1 reads his own client''s three trees';

  -- The one next door does not, by name.
  perform pg_temp.pp_denied(format('select public.staff_zitounti_file(%L)', p2), 'forbidden');

  -- And the index does not list the person he cannot open.
  v := public.staff_zitounti_holders();
  assert v::text not like '%' || p2::text || '%', 'the holders index must not name a person C1 cannot open';
  assert v::text like '%' || p1::text || '%', 'but it does name his own';

  -- Nor can he reach that person's money sideways, through the subscription list.
  v := public.staff_subscriptions('all', null, 500);
  assert v::text not like '%' || p2::text || '%',
    'P2''s subscription must not appear to a commercial who may not see P2';

  -- Nor that person's harvest share, through the season screen.
  v := public.staff_harvest_season(sea);
  assert v::text not like '%' || p2::text || '%',
    'P2''s harvest share must not appear to a commercial who may not see P2';

  -- The grove log is the agricultural desk's, not his.
  perform pg_temp.pp_denied('select public.staff_agri_operations(null, ''all'', null)', 'forbidden');
  reset role;

  -- =========================================================================
  -- 2 · THE AGRI MANAGER — runs the grove, reads no client file
  -- =========================================================================
  perform pg_temp.pp_as(ag::text);
  perform pg_temp.pp_denied(format('select public.staff_zitounti_file(%L)', p1), 'forbidden');
  perform pg_temp.pp_denied(format('select public.staff_zitounti_file(%L)', p2), 'forbidden');

  -- He sees the grove's own season figures, and not one owner.
  v := public.staff_harvest_season(sea);
  assert v::text not like '%' || p1::text || '%' and v::text not like '%' || p2::text || '%',
    'the agri manager reads the grove, never the owners behind it';
  reset role;

  -- =========================================================================
  -- 3 · A SIGNED-IN USER WITH NO STAFF ROLE, AND ANON
  -- =========================================================================
  perform pg_temp.pp_as('00000000-0000-0000-0000-0000000090ff');  -- no row in user_roles at all
  perform pg_temp.pp_denied(format('select public.staff_zitounti_file(%L)', p1), 'forbidden');
  perform pg_temp.pp_denied('select public.staff_zitounti_holders()', 'forbidden');
  perform pg_temp.pp_denied('select public.staff_harvest_season(' || quote_literal(sea) || '::uuid)', 'forbidden');
  reset role;

  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
  -- anon has no EXECUTE at all: PostgreSQL refuses before any role check runs.
  begin
    perform public.staff_zitounti_file(p1);
    raise exception 'PRIVACY BREACH: anon executed staff_zitounti_file';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.staff_zitounti_holders();
    raise exception 'PRIVACY BREACH: anon executed staff_zitounti_holders';
  exception when insufficient_privilege then null;
  end;
  -- The direct tables, too: no policy may let anon read a tree holder or a share.
  begin
    perform count(*) from public.harvest_shares;
    raise exception 'PRIVACY BREACH: anon selected harvest_shares';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.subscriptions;
    raise exception 'PRIVACY BREACH: anon selected subscriptions';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- =========================================================================
  -- 4 · FINANCE — the control. If nobody could read it, the proof above would be vacuous.
  -- =========================================================================
  perform pg_temp.pp_as(fi::text);
  v := public.staff_zitounti_file(p2);
  assert (v->'totals'->>'trees')::int = 3, 'Finance reads the file the commercial could not';
  v := public.staff_harvest_season(sea);
  assert v::text like '%' || p2::text || '%', 'and Finance does see the share that was hidden from C1';
  -- The control for the subscription negative above: without this, «C1 does not see P2's subscription» could
  -- be true merely because the payload never carries a person id at all, and would prove nothing.
  v := public.staff_subscriptions('all', null, 500);
  assert v::text like '%' || p2::text || '%',
    'Finance does see P2''s subscription — so the commercial''s empty result was a refusal, not an empty table';
  reset role;

  raise notice 'PRIVACY PROOF PASSED — all four readers behaved';
end $$;

-- ===========================================================================
-- PART 3 · THE SEAM ITSELF — the keys زيتونتي reads are the keys bb_40 and
--          bb_41 emit, checked one by one.
-- ===========================================================================
-- This is the check the three agents could not run: زيتونتي was written against tables the other two were
-- still designing, and its payload types in src/app/admin/(panel)/persons/read.ts are hand-written, so nothing
-- in TypeScript can catch a drifted key — tsc type-checks the shape it was TOLD, not the shape that arrives.
-- A renamed column would be swallowed by app.zitounti_probe and reported forever as «not built», which is the
-- one failure this module could hide. So the key sets are asserted literally, and the values with them: keys
-- that are present but null would pass a key check and still mean the join found nothing.
--
-- WHEN A KEY CHANGES ON PURPOSE, change it in three places together: the SQL that builds it, the `want` string
-- below, and the TypeScript type. That is the point of the test — the three cannot drift apart quietly.

do $$
declare
  c1 uuid := '00000000-0000-0000-0000-0000000091a1';
  p1 uuid; pj uuid; st uuid; sea uuid; v jsonb; item jsonb; got text; want text;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (c1, 'authenticated', 'authenticated', 'kc@test.local', '{"full_name":"KC"}');
  insert into public.user_roles (user_id, role) values (c1, 'finance');

  select id into st from public.lead_statuses order by sort_order limit 1;
  insert into public.persons (full_name, phone_e164, status_id)
       values ('حريف', '+21690000191', st) returning id into p1;
  insert into public.projects (code, name, governorate_id, status, tree_count)
       values ('KC-' || gen_random_uuid(), 'ضيعة', 34, 'published', 10) returning id into pj;
  insert into public.trees (project_id, seq, code, state, held_by, allocated_at)
  select pj, g, 'KC-' || lpad(g::text, 4, '0'), 'sold', p1, now() from generate_series(1, 4) g;

  insert into public.agri_operations (project_id, service_option_id, label_ar, scope, status, executed_on, cost_millimes)
  select pj, oi.id, oi.label_ar, 'offer', 'done', current_date, 5000
    from public.option_items oi where oi.list_key = 'agrized_service' and oi.is_active order by oi.sort_order limit 1;

  insert into public.subscriptions (person_id, project_id, season_label, season_starts_on, season_ends_on,
                                    tree_count, fee_per_tree_millimes, fee_source, status)
  values (p1, pj, 'موسم', current_date, current_date + 365, 4, 12000, 'global', 'active');

  insert into public.subscription_lines (subscription_id, service_option_id, label_ar, in_package, basis, amount_millimes)
  select s.id, oi.id, oi.label_ar, true, 'per_tree', 0
    from public.subscriptions s, public.option_items oi
   where s.person_id = p1 and oi.list_key = 'agrized_service' and oi.is_active
   order by oi.sort_order limit 1;

  insert into public.harvest_seasons (project_id, season_year, label_ar, status, trees_harvested, olives_kg, oil_litres, settled_at)
  values (pj, 2026, 'موسم 2026/2027', 'settled', 8, 1600, 300, now()) returning id into sea;
  insert into public.harvest_shares (season_id, person_id, trees_held, trees_harvested, olives_kg, oil_litres)
  values (sea, p1, 4, 8, 800, 150);

  update public.feature_flags set state = 'public'
   where key in ('zitounti', 'agri_backoffice', 'subscriptions', 'harvest');

  perform set_config('request.jwt.claims', json_build_object('sub', c1::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.staff_zitounti_file(p1);
  reset role;

  -- OPERATIONS
  item := v->'operations'->'items'->0;
  assert item is not null, 'operations produced no row — the key check would be vacuous';
  select string_agg(k, ',' order by k) into got from jsonb_object_keys(item) k;
  want := 'executed_on,id,planned_on,project_code,project_id,scope,service_ar,status';
  assert got = want, format('OPERATION KEYS drifted. got=[%s] want=[%s]', got, want);

  -- SUBSCRIPTION
  item := v->'subscription'->'items'->0;
  assert item is not null, 'subscription produced no row';
  select string_agg(k, ',' order by k) into got from jsonb_object_keys(item) k;
  want := 'amount_millimes,fee_per_tree_millimes,id,lines,payment_status,project_code,project_id,season_label,season_starts_on,status,trees';
  assert got = want, format('SUBSCRIPTION KEYS drifted. got=[%s] want=[%s]', got, want);

  item := v->'subscription'->'items'->0->'lines'->0;
  assert item is not null, 'subscription line produced no row';
  select string_agg(k, ',' order by k) into got from jsonb_object_keys(item) k;
  want := 'amount_millimes,in_package,label_ar,status';
  assert got = want, format('SUBSCRIPTION LINE KEYS drifted. got=[%s] want=[%s]', got, want);

  -- HARVEST
  item := v->'harvest'->'items'->0;
  assert item is not null, 'harvest produced no row';
  select string_agg(k, ',' order by k) into got from jsonb_object_keys(item) k;
  want := 'choice_deadline,choice_source,my_oil_litres,my_olives_kg,my_trees,outcome_label_ar,pick_label_ar,project_code,project_id,season_id,season_label,season_oil_litres,season_olives_kg,season_year,settled,status,trees_harvested';
  assert got = want, format('HARVEST KEYS drifted. got=[%s] want=[%s]', got, want);

  -- And the values actually arrived, so the keys are not merely present and null.
  assert (v->'harvest'->'items'->0->>'my_olives_kg')::numeric = 800, 'my share came through';
  assert (v->'subscription'->'items'->0->>'amount_millimes')::bigint = 48000, '4 trees x 12 000 millimes';
  assert (v->'operations'->'items'->0->>'status') = 'done', 'the operation came through';
  -- The two columns the client file must NEVER carry.
  assert not (v->'operations'->'items'->0 ? 'cost_millimes'), 'AgriZed cost must not reach a client file';
  assert not (v->'operations'->'items'->0 ? 'provider_note'), 'the supplier must not reach a client file';

  raise notice 'KEY CHECK PASSED';
end $$;
