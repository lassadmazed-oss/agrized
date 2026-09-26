-- 041 · الصابة والجني: the season, the owner's choice, and the share that comes out of them.
-- Tests supabase/pending/bb_41_harvest.sql (report v3 §37, §36; cahier v2 §43, §44).
--
-- Runs against the live database inside a rolled-back transaction: every fixture carries a code, a phone number
-- and a user id of its own, and nothing survives the file. public.parcels is never read and never written.
--
-- PERMISSIONS COME FIRST, and the closed module comes before them, because «معطّل» is the only state the live
-- database can prove today: the `harvest` flag is 'disabled' and the owner switches a module on himself. T1 and
-- T2 run against the flag exactly as it is; T3 onwards turn it to 'internal' INSIDE this transaction, which the
-- runner rolls back.
--
-- The world these tests describe is the world that exists: 8,600 trees, every one of them available, nobody
-- holding anything. So each fixture sells its own trees rather than hoping to find one already sold.

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

-- For what the grants refuse outright (no EXECUTE, no SELECT on a column), where the message is PostgreSQL's own.
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

create function pg_temp.tt(p_key text) returns uuid language sql stable as $$
  select nullif(current_setting('test.tt_' || p_key, true), '')::uuid
$$;

create function pg_temp.tt_opt(p_list text, p_code text) returns uuid language sql stable as $$
  select o.id from public.option_items o where o.list_key = p_list and o.code = p_code
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

do $$
declare
  v_id     uuid;
  v_status uuid;
begin
  -- Pinned so the arithmetic below is the same whatever the owner has since tuned.
  update public.settings set value = to_jsonb(2) where key = 'harvest.share_decimals';

  -- Staff. Finance may price and settle; the agricultural manager keeps the grove; a commercial works inside
  -- their own file only; an admin may do everything, including record a late choice; a client is authenticated
  -- and is not staff at all.
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000004101', 'authenticated', 'authenticated', 'fin-harv@test.local',   '{"full_name":"Finance Harvest"}'),
    ('00000000-0000-0000-0000-000000004102', 'authenticated', 'authenticated', 'agri-harv@test.local',  '{"full_name":"Agri Harvest"}'),
    ('00000000-0000-0000-0000-000000004103', 'authenticated', 'authenticated', 'com-harv@test.local',   '{"full_name":"Commercial Harvest"}'),
    ('00000000-0000-0000-0000-000000004104', 'authenticated', 'authenticated', 'cli-harv@test.local',   '{"full_name":"Client Harvest"}'),
    ('00000000-0000-0000-0000-000000004105', 'authenticated', 'authenticated', 'adm-harv@test.local',   '{"full_name":"Admin Harvest"}');

  insert into public.user_roles (user_id, role) values
    ('00000000-0000-0000-0000-000000004101', 'finance'),
    ('00000000-0000-0000-0000-000000004102', 'agri_manager'),
    ('00000000-0000-0000-0000-000000004103', 'commercial'),
    ('00000000-0000-0000-0000-000000004104', 'client'),
    ('00000000-0000-0000-0000-000000004105', 'admin');

  -- The offer being harvested: twenty trees, twelve of them sold to three owners.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TH-A-' || gen_random_uuid(), 'عرض الصابة', 34, 'published', 20) returning id into v_id;
  perform set_config('test.tt_a', v_id::text, true);

  -- A second offer, so «one season per offer per year» is tested on the offer and not on the year alone.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('TH-B-' || gen_random_uuid(), 'عرض بلا صابة', 34, 'published', 5) returning id into v_id;
  perform set_config('test.tt_b', v_id::text, true);

  select id into v_status from public.lead_statuses where stage = 'new' and is_active
  order by is_stage_default desc, sort_order limit 1;

  -- p1 is the commercial's file; p2 is nobody's (and never answers); p3 is nobody's and answers late.
  insert into public.persons (full_name, phone_e164, status_id, governorate_id, assigned_to)
  values ('مالك أربع زيتونات', '+21655541001', v_status, 34, '00000000-0000-0000-0000-000000004103')
  returning id into v_id;
  perform set_config('test.tt_p1', v_id::text, true);

  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('مالك ست زيتونات', '+21655541002', v_status, 34) returning id into v_id;
  perform set_config('test.tt_p2', v_id::text, true);

  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('مالك زيتونتين', '+21655541003', v_status, 34) returning id into v_id;
  perform set_config('test.tt_p3', v_id::text, true);

  -- A person who owns nothing at all, for the «not a tree holder» refusal.
  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف بلا زيتونات', '+21655541004', v_status, 34) returning id into v_id;
  perform set_config('test.tt_p0', v_id::text, true);

  -- Twenty trees: 1-4 to p1, 5-10 to p2, 11-12 to p3, 13-20 still AgriZed's.
  insert into public.trees (project_id, seq, code, state, held_by, allocated_at)
  select pg_temp.tt('a'), s, 'TH-A-' || lpad(s::text, 4, '0'),
         case when s <= 12 then 'sold' else 'available' end::public.tree_state,
         case when s <= 4 then pg_temp.tt('p1')
              when s <= 10 then pg_temp.tt('p2')
              when s <= 12 then pg_temp.tt('p3') end,
         case when s <= 12 then now() end
  from generate_series(1, 20) s;

  -- What this offer offers (§37 «Configurable حسب المشروع»), set as the owner would.
  update public.projects set
    harvest_pick_option_ids    = array[pg_temp.tt_opt('harvest_pick', 'agrized_picks'),
                                       pg_temp.tt_opt('harvest_pick', 'client_attends')],
    harvest_pick_default_id    = pg_temp.tt_opt('harvest_pick', 'agrized_picks'),
    harvest_outcome_option_ids = array[pg_temp.tt_opt('harvest_outcome', 'take_olives'),
                                       pg_temp.tt_opt('harvest_outcome', 'press_oil')],
    harvest_outcome_default_id = pg_temp.tt_opt('harvest_outcome', 'press_oil')
  where id = pg_temp.tt('a');
end $$;

-- ---------------------------------------------------------------------------
-- T1 · THE MODULE IS OFF, so every RPC refuses — and it refuses in the database
-- ---------------------------------------------------------------------------

-- SET, NOT ASSERTED — see the note in 042_zitounti.sql. This file tests that a CLOSED module refuses, so the
-- transaction closes it and rolls back. Asserting the live position made the file depend on where the owner
-- last left a switch, and it went red on 2026-09-26 when the module was opened by instruction (0104).
update public.feature_flags set state = 'disabled' where key = 'harvest';

do $$
begin
  assert (select state from public.feature_flags where key = 'harvest') = 'disabled',
    'the transaction just closed the module; if this fails, something re-opened it mid-test';
  assert not app.module_open('harvest'), 'a disabled module is open to nobody';

  -- The agricultural manager holds the role the write asks for, and is still refused: a screen is not the gate.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform pg_temp.tt_expect(
    format('select public.staff_save_harvest_season(%L::jsonb, %L)',
           jsonb_build_object('project_id', pg_temp.tt('a'), 'season_year', 2026)::text, 'موسم جديد'),
    'module_closed');
  perform pg_temp.tt_expect(
    format('select public.staff_save_offer_harvest_options(%L, null, null, null, null, %L)', pg_temp.tt('a'), 'ضبط'),
    'module_closed');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  perform pg_temp.tt_expect('select public.staff_harvest_overview(null)', 'module_closed');
  reset role;

  -- A commercial has no business writing a season at all, and is stopped by the role before the flag.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004103');
  perform pg_temp.tt_expect(
    format('select public.staff_save_harvest_season(%L::jsonb, %L)',
           jsonb_build_object('project_id', pg_temp.tt('a'), 'season_year', 2026)::text, 'موسم جديد'),
    'forbidden');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T2 · Grants: a visitor and a signed-in client reach nothing
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.tt_as_anon();
  perform pg_temp.tt_denied('select count(*) from public.harvest_seasons');
  perform pg_temp.tt_denied('select count(*) from public.harvest_choices');
  perform pg_temp.tt_denied('select count(*) from public.harvest_shares');
  perform pg_temp.tt_denied('select public.staff_harvest_overview(null)');
  perform pg_temp.tt_denied('select public.staff_settle_harvest_season(gen_random_uuid(), ''x'')');
  reset role;

  -- A client is authenticated, so the grant lets the statement run; RLS is what returns nothing.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004104');
  assert (select count(*) from public.harvest_seasons) = 0, 'a client reads no season';
  perform pg_temp.tt_expect('select public.staff_harvest_overview(null)', 'forbidden');
  reset role;

  -- And nobody at all may reach the internal helpers directly.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  perform pg_temp.tt_denied('select app.harvest_season_payload(gen_random_uuid())');
  perform pg_temp.tt_denied('select app.harvest_allocate(100, 1, 10)');
  perform pg_temp.tt_denied('select app.harvest_trees_held(gen_random_uuid(), gen_random_uuid())');
  reset role;
end $$;

-- From here on the module is open to staff. «داخلي فقط» is the state a Back Office module is switched to.
update public.feature_flags set state = 'internal' where key = 'harvest';

-- ---------------------------------------------------------------------------
-- T3 · Money is a permission, in the grant itself
-- ---------------------------------------------------------------------------

do $$
declare
  v_out jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  v_out := public.staff_save_harvest_season(
    jsonb_build_object('project_id', pg_temp.tt('a'), 'season_year', 2026, 'label_ar', '')::jsonb, 'فتح الموسم');
  reset role;
  perform set_config('test.tt_s1', v_out->>'id', true);

  -- The label falls back to the setting's pattern, not to a word written in the migration.
  assert v_out->>'label_ar' = replace(replace(app.setting_text('harvest.season_label_pattern', 'موسم {year}/{next}'),
                                              '{year}', '2026'), '{next}', '2027'),
    format('a season with no label takes harvest.season_label_pattern, got %s', v_out->>'label_ar');

  -- Every staff member reads the quantities…
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004103');
  assert (select count(*) from public.harvest_seasons where id = pg_temp.tt('s1')) = 1,
    'a commercial reads the season row';
  -- …and nobody reads the two money columns from the table: the grant does not carry them.
  perform pg_temp.tt_denied('select harvest_cost_millimes from public.harvest_seasons');
  perform pg_temp.tt_denied('select sale_amount_millimes from public.harvest_seasons');
  perform pg_temp.tt_denied('select * from public.harvest_seasons');
  reset role;

  -- A commercial may not write money, and neither may the agricultural manager.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_money(%L, 1000, null, %L)', pg_temp.tt('s1'), 'تكلفة'), 'forbidden');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  perform public.staff_set_harvest_money(pg_temp.tt('s1'), 4500000, 9000000, 'تكلفة الجني وثمن البيع');
  reset role;

  -- The payload carries money for Finance…
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  v_out := public.staff_harvest_season(pg_temp.tt('s1'));
  reset role;
  assert (v_out->>'harvest_cost_millimes')::bigint = 4500000,
    format('Finance reads the harvesting cost, got %s', v_out);

  -- …and not for a commercial, who still reads the same season.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004103');
  v_out := public.staff_harvest_season(pg_temp.tt('s1'));
  reset role;
  assert not (v_out ? 'harvest_cost_millimes') and not (v_out ? 'sale_amount_millimes'),
    format('a commercial reads the season with no dinar in it, got %s', v_out);
  assert v_out->>'id' = pg_temp.tt('s1')::text, 'and reads the season itself all the same';
end $$;

-- ---------------------------------------------------------------------------
-- T4 · One season per offer per year, and the figures that cannot contradict each other
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform pg_temp.tt_expect(
    format('select public.staff_save_harvest_season(%L::jsonb, %L)',
           jsonb_build_object('project_id', pg_temp.tt('a'), 'season_year', 2026)::text, 'مرّة ثانية'),
    'harvest_season_exists');

  -- The same year on another offer is a different season.
  perform public.staff_save_harvest_season(
    jsonb_build_object('project_id', pg_temp.tt('b'), 'season_year', 2026)::jsonb, 'موسم العرض الثاني');

  -- A year outside the range, and an offer that does not exist.
  perform pg_temp.tt_expect(
    format('select public.staff_save_harvest_season(%L::jsonb, %L)',
           jsonb_build_object('project_id', pg_temp.tt('a'), 'season_year', 1899)::text, 'سنة غالطة'),
    'invalid_harvest_facts');
  perform pg_temp.tt_expect(
    format('select public.staff_save_harvest_season(%L::jsonb, %L)',
           jsonb_build_object('project_id', gen_random_uuid(), 'season_year', 2027)::text, 'عرض ما يوجدش'),
    'offer_not_available');
  reset role;

  -- The row's own arithmetic: more oil than came out of the press, or a season that ended before it started.
  perform pg_temp.tt_expect(
    format('update public.harvest_seasons set olives_kg = 100, pressed_olives_kg = 120 where id = %L', pg_temp.tt('s1')),
    'new row for relation "harvest_seasons" violates check constraint "harvest_seasons_pressed_check"');
  perform pg_temp.tt_expect(
    format('update public.harvest_seasons set started_on = ''2026-11-01'', ended_on = ''2026-10-01'' where id = %L',
           pg_temp.tt('s1')),
    'new row for relation "harvest_seasons" violates check constraint "harvest_seasons_dates_check"');
end $$;

-- ---------------------------------------------------------------------------
-- T5 · The state machine: a season is never «settled» because someone typed the word
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');

  assert (select status from public.harvest_seasons where id = pg_temp.tt('s1')) = 'planned',
    'a new season is planned';

  -- planned → closed skips the picking, and is refused.
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_status(%L, ''closed'', %L)', pg_temp.tt('s1'), 'قفز'),
    'invalid_harvest_status');
  -- A word that is not a state at all.
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_status(%L, ''finished'', %L)', pg_temp.tt('s1'), 'كلمة'),
    'invalid_harvest_status');
  -- And «settled» is never a status somebody chooses: it is what settlement leaves behind.
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_status(%L, ''settled'', %L)', pg_temp.tt('s1'), 'مباشرة'),
    'invalid_harvest_status');

  perform public.staff_set_harvest_status(pg_temp.tt('s1'), 'harvesting', 'بدا الجني');
  assert (select status from public.harvest_seasons where id = pg_temp.tt('s1')) = 'harvesting',
    'planned → harvesting';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T6 · «Configurable حسب المشروع»: an offer cannot offer a choice that is not in its own list
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');

  -- A default nobody may choose is a default that can never be applied.
  perform pg_temp.tt_expect(
    format('select public.staff_save_offer_harvest_options(%L, array[%L]::uuid[], %L, null, null, %L)',
           pg_temp.tt('b'), pg_temp.tt_opt('harvest_pick', 'agrized_picks'),
           pg_temp.tt_opt('harvest_pick', 'client_attends'), 'افتراضي برّاني'),
    'invalid_choice');

  -- A picking option smuggled into the outcome column would show an owner «الحريف يحضر بنفسه» as the fate of his oil.
  perform pg_temp.tt_expect(
    format('select public.staff_save_offer_harvest_options(%L, null, null, array[%L]::uuid[], null, %L)',
           pg_temp.tt('b'), pg_temp.tt_opt('harvest_pick', 'agrized_picks'), 'خلط القوائم'),
    'invalid_choice');

  perform public.staff_save_offer_harvest_options(
    pg_temp.tt('b'),
    array[pg_temp.tt_opt('harvest_pick', 'agrized_picks')]::uuid[], pg_temp.tt_opt('harvest_pick', 'agrized_picks'),
    array[pg_temp.tt_opt('harvest_outcome', 'storage')]::uuid[], null,
    'العرض الثاني يوفّر التخزين برك');
  reset role;

  assert (select cardinality(harvest_outcome_option_ids) from public.projects where id = pg_temp.tt('b')) = 1,
    'the second offer declares one outcome and no more';

  -- The four §44 wordings and the two §37 ones are rows, not an enum: adding a fifth is an edit, not a migration.
  assert (select count(*) from public.option_items where list_key = 'harvest_outcome' and is_active) >= 4,
    'v2 §44 four outcomes exist as option rows';
  assert (select count(*) from public.option_items where list_key = 'harvest_pick' and is_active) >= 2,
    'v3 §37 two picking answers exist as option rows';
end $$;

-- ---------------------------------------------------------------------------
-- T7 · The owner's choice: who may record it, for whom, and until when
-- ---------------------------------------------------------------------------

do $$
declare
  v_pick    uuid := pg_temp.tt_opt('harvest_pick', 'client_attends');
  v_outcome uuid := pg_temp.tt_opt('harvest_outcome', 'take_olives');
  v_storage uuid := pg_temp.tt_opt('harvest_outcome', 'storage');
begin
  -- Finance sees every file and may still not speak for a client: recording a choice is the file owner's act.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_choice(%L, %L, %L, %L, null, %L)',
           pg_temp.tt('s1'), pg_temp.tt('p1'), v_pick, v_outcome, 'اختيار'),
    'forbidden');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004103');

  -- A commercial speaks for their own file and no other: p2 is nobody's.
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_choice(%L, %L, %L, %L, null, %L)',
           pg_temp.tt('s1'), pg_temp.tt('p2'), v_pick, v_outcome, 'ملف موش متاعو'),
    'forbidden');

  -- A choice this offer does not offer.
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_choice(%L, %L, null, %L, null, %L)',
           pg_temp.tt('s1'), pg_temp.tt('p1'), v_storage, 'تخزين موش معروض'),
    'harvest_choice_not_offered');

  -- An answer that answers nothing.
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_choice(%L, %L, null, null, null, %L)',
           pg_temp.tt('s1'), pg_temp.tt('p1'), 'بلا جواب'),
    'invalid_choice');

  -- The real one.
  perform public.staff_set_harvest_choice(pg_temp.tt('s1'), pg_temp.tt('p1'), v_pick, v_outcome,
                                          'الحريف قال يحضر بنفسه', 'اختيار المالك');
  reset role;

  assert (select source from public.harvest_choices
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p1')) = 'staff',
    'an answer the team wrote down is filed as staff, not as the client''s own';
  assert (select outcome_option_id from public.harvest_choices
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p1')) = v_outcome,
    'and it is the wording the client picked';

  -- A person who owns no tree in this offer has nothing to decide about.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004105');
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_choice(%L, %L, %L, null, null, %L)',
           pg_temp.tt('s1'), pg_temp.tt('p0'), v_pick, 'ما عندوش زيتونات'),
    'not_a_tree_holder');
  reset role;
end $$;

-- The door closes «وقت الصابة»: the season names the day.
update public.harvest_seasons set choice_deadline = current_date - 1 where id = pg_temp.tt('s1');

do $$
declare
  v_pick uuid := pg_temp.tt_opt('harvest_pick', 'agrized_picks');
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004103');
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_choice(%L, %L, %L, null, null, %L)',
           pg_temp.tt('s1'), pg_temp.tt('p1'), v_pick, 'بعد الأجل'),
    'harvest_choice_closed');
  reset role;

  -- Admin may still write a late answer down — a client who phoned on the day is not a data-entry error — and
  -- the audit row says who did it.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004105');
  perform public.staff_set_harvest_choice(pg_temp.tt('s1'), pg_temp.tt('p3'), v_pick,
                                          pg_temp.tt_opt('harvest_outcome', 'press_oil'),
                                          null, 'اتصل بعد الأجل');
  reset role;

  assert (select count(*) from public.harvest_choices where season_id = pg_temp.tt('s1')) = 2,
    'two owners have answered; the third has not';
end $$;

-- ---------------------------------------------------------------------------
-- T8 · Settling: the season's quantity becomes every owner's number, once
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');

  -- A season still being picked has no final figure to divide.
  perform pg_temp.tt_expect(
    format('select public.staff_settle_harvest_season(%L, %L)', pg_temp.tt('s1'), 'توزيع'),
    'harvest_not_closed');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform public.staff_set_harvest_status(pg_temp.tt('s1'), 'closed', 'تكمّل الجني');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  -- Closed, but nothing was weighed.
  perform pg_temp.tt_expect(
    format('select public.staff_settle_harvest_season(%L, %L)', pg_temp.tt('s1'), 'توزيع'),
    'harvest_quantity_missing');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform public.staff_save_harvest_season(
    jsonb_build_object('id', pg_temp.tt('s1'), 'olives_kg', 1000, 'oil_litres', 200)::jsonb, 'الكميات');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  -- Weighed, but nobody said how many trees produced it: there is no denominator, so there is no share.
  perform pg_temp.tt_expect(
    format('select public.staff_settle_harvest_season(%L, %L)', pg_temp.tt('s1'), 'توزيع'),
    'harvest_denominator_missing');
  reset role;

  -- A denominator smaller than one owner's holding means the figure is wrong, not that he owns 120% of the crop.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform public.staff_save_harvest_season(
    jsonb_build_object('id', pg_temp.tt('s1'), 'trees_harvested', 3)::jsonb, 'عدد غالط');
  reset role;
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  perform pg_temp.tt_expect(
    format('select public.staff_settle_harvest_season(%L, %L)', pg_temp.tt('s1'), 'توزيع'),
    'harvest_denominator_missing');
  reset role;
  assert (select count(*) from public.harvest_shares where season_id = pg_temp.tt('s1')) = 0,
    'a refused settlement writes not one share';

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform public.staff_save_harvest_season(
    jsonb_build_object('id', pg_temp.tt('s1'), 'trees_harvested', 20)::jsonb, 'عدد الزيتونات اللي تجنّات');
  reset role;

  -- The agricultural manager runs the grove; he does not close its books.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform pg_temp.tt_expect(
    format('select public.staff_settle_harvest_season(%L, %L)', pg_temp.tt('s1'), 'توزيع'), 'forbidden');
  reset role;
end $$;

do $$
declare
  v_out jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  v_out := public.staff_settle_harvest_season(pg_temp.tt('s1'), 'توزيع حصص الموسم');
  reset role;

  assert (v_out->>'shares')::integer = 3 and (v_out->>'trees_allocated')::integer = 12
         and (v_out->>'trees_harvested')::integer = 20,
    format('three owners, twelve of twenty trees, got %s', v_out);

  -- THE ARITHMETIC, spelled out: 1000 كغ × 4 ÷ 20 = 200, × 6 ÷ 20 = 300, × 2 ÷ 20 = 100.
  assert (select olives_kg from public.harvest_shares
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p1')) = 200,
    'four trees of twenty take a fifth of the thousand kilos';
  assert (select olives_kg from public.harvest_shares
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p2')) = 300,
    'six trees of twenty take 300';
  assert (select oil_litres from public.harvest_shares
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p3')) = 20,
    'and the oil is divided by the same rule';

  -- The eight trees AgriZed still holds keep their share: the owners do not divide the grove between them.
  assert (select sum(olives_kg) from public.harvest_shares where season_id = pg_temp.tt('s1')) = 600,
    'twelve sold trees of twenty take 600 of the 1000 kilos, and AgriZed keeps the rest';

  -- The denominator is FROZEN on the share, not read back from the season.
  assert (select count(*) from public.harvest_shares
          where season_id = pg_temp.tt('s1') and trees_harvested = 20) = 3,
    'every share stores the denominator it was computed with';

  -- Whoever never answered gets the offer's default, written down and filed as «تلقائي».
  assert (v_out->>'defaults_applied')::integer = 1, format('one silent owner, got %s', v_out);
  assert (select choice_source from public.harvest_shares
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p2')) = 'auto',
    'the silent owner''s share records that the choice was automatic';
  assert (select outcome_label_ar from public.harvest_shares
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p2'))
         = (select label_ar from public.option_items where id = pg_temp.tt_opt('harvest_outcome', 'press_oil')),
    'and it is the offer''s own default wording, snapshotted on the share';
  assert (select source from public.harvest_choices
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p2')) = 'auto',
    'the automatic answer is a row an owner can be shown, not an invisible rule';

  -- The one who answered keeps his own answer.
  assert (select outcome_label_ar from public.harvest_shares
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p1'))
         = (select label_ar from public.option_items where id = pg_temp.tt_opt('harvest_outcome', 'take_olives')),
    'an owner who answered keeps his answer';

  assert (select status from public.harvest_seasons where id = pg_temp.tt('s1')) = 'settled'
     and (select settled_at from public.harvest_seasons where id = pg_temp.tt('s1')) is not null,
    'the season is settled and says when';

  -- §51: the act is logged once, with its counts and the reason the staff wrote.
  assert (select count(*) from public.audit_logs
          where action = 'harvest.settle' and entity = 'harvest_seasons'
            and entity_id = pg_temp.tt('s1')::text and reason = 'توزيع حصص الموسم') = 1,
    'settling is audited once, with the reason';
end $$;

-- ---------------------------------------------------------------------------
-- T9 · A settled season is closed to everyone, including the person who settled it
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  perform pg_temp.tt_expect(
    format('select public.staff_settle_harvest_season(%L, %L)', pg_temp.tt('s1'), 'مرّة ثانية'),
    'harvest_season_settled');
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_money(%L, 1, 1, %L)', pg_temp.tt('s1'), 'تبديل'),
    'harvest_season_settled');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  perform pg_temp.tt_expect(
    format('select public.staff_save_harvest_season(%L::jsonb, %L)',
           jsonb_build_object('id', pg_temp.tt('s1'), 'olives_kg', 5000)::text, 'تبديل الكمية'),
    'harvest_season_settled');
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_status(%L, ''harvesting'', %L)', pg_temp.tt('s1'), 'رجوع'),
    'harvest_season_settled');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004105');
  perform pg_temp.tt_expect(
    format('select public.staff_set_harvest_choice(%L, %L, %L, null, null, %L)',
           pg_temp.tt('s1'), pg_temp.tt('p1'), pg_temp.tt_opt('harvest_pick', 'agrized_picks'), 'تبديل الاختيار'),
    'harvest_season_settled');
  reset role;

  assert (select olives_kg from public.harvest_shares
          where season_id = pg_temp.tt('s1') and person_id = pg_temp.tt('p1')) = 200,
    'and no figure an owner has been told has moved';
end $$;

-- ---------------------------------------------------------------------------
-- T10 · A share is part of a client's file: who reads which one
-- ---------------------------------------------------------------------------

do $$
declare
  v_out jsonb;
begin
  -- Finance sees every file.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  v_out := public.staff_harvest_season(pg_temp.tt('s1'));
  reset role;
  assert jsonb_array_length(v_out->'shares') = 3, format('Finance reads all three shares, got %s', v_out->'shares');
  assert (v_out->>'settled')::boolean, 'and the payload says the season is settled';
  assert (v_out->'shares'->0->>'note_ar') is not null,
    'every share carries the Arabic sentence that explains how it was computed';

  -- A commercial reads their own client and nobody else's.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004103');
  v_out := public.staff_harvest_season(pg_temp.tt('s1'));
  assert jsonb_array_length(v_out->'shares') = 1, format('a commercial reads one share, got %s', v_out->'shares');
  assert v_out->'shares'->0->>'person_id' = pg_temp.tt('p1')::text, 'and it is their own client''s';
  assert (select count(*) from public.harvest_shares where season_id = pg_temp.tt('s1')) = 1,
    'the RLS policy says the same thing as the payload';
  assert (select count(*) from public.harvest_choices where season_id = pg_temp.tt('s1')) = 1,
    'and a choice is read by the same rule';
  reset role;

  -- The agricultural manager runs the grove and reads no client file at all — by design, not by omission.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  v_out := public.staff_harvest_season(pg_temp.tt('s1'));
  assert jsonb_array_length(v_out->'shares') = 0,
    format('the grove manager sees the season and not who owns it, got %s', v_out->'shares');
  assert (v_out->>'olives_kg')::numeric = 1000, 'and he sees every kilo that came in';
  assert (v_out->>'holders')::integer = 3, 'including how many owners there are, without naming one';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T11 · Before settlement the same arithmetic is shown live, and says it is an estimate
-- ---------------------------------------------------------------------------

do $$
declare
  v_id  uuid;
  v_out jsonb;
begin
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004102');
  v_out := public.staff_save_harvest_season(
    jsonb_build_object('project_id', pg_temp.tt('a'), 'season_year', 2027,
                       'olives_kg', 500, 'trees_harvested', 20)::jsonb, 'الموسم الجاي');
  v_id := (v_out->>'id')::uuid;
  perform public.staff_set_harvest_status(v_id, 'harvesting', 'بدا الجني');
  reset role;

  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  v_out := public.staff_harvest_season(v_id);
  reset role;

  assert not (v_out->>'settled')::boolean, 'a season being picked is not settled';
  assert jsonb_array_length(v_out->'shares') = 0, 'and nothing is frozen yet';
  assert jsonb_array_length(v_out->'estimates') = 3, 'but the three owners each have a live figure';
  -- 500 × 4 ÷ 20 = 100, computed by the same function that will freeze it.
  assert (select (e->>'olives_kg')::numeric from jsonb_array_elements(v_out->'estimates') e
          where e->>'person_id' = pg_temp.tt('p1')::text) = 100,
    'the estimate uses the one allocation rule, not a second one';
  assert (select e->>'note_ar' from jsonb_array_elements(v_out->'estimates') e
          where e->>'person_id' = pg_temp.tt('p1')::text)
         = app.harvest_share_note(4, 20, false),
    'and it is labelled an estimate by the setting, in words';

  -- The overview points at the season being picked now, not at the settled one.
  perform pg_temp.tt_as_user('00000000-0000-0000-0000-000000004101');
  v_out := public.staff_harvest_overview(pg_temp.tt('a'));
  reset role;
  assert v_out->'current'->>'id' = v_id::text,
    format('«الموسم الجاري» is the one being picked, got %s', v_out->'current');
  assert jsonb_array_length(v_out->'seasons') = 2, 'and both seasons of this offer are listed';
end $$;

-- ---------------------------------------------------------------------------
-- T12 · The allocation rule itself: no denominator, no number — never a fabricated one
-- ---------------------------------------------------------------------------

do $$
begin
  assert app.harvest_allocate(1000, 4, 20) = 200, 'the rule is quantity × trees ÷ harvested';
  assert app.harvest_allocate(null, 4, 20) is null, 'nothing weighed, nothing allocated';
  assert app.harvest_allocate(1000, 4, null) is null, 'no denominator, no share';
  assert app.harvest_allocate(1000, 0, 20) is null, 'an owner with no tree has no share';
  assert app.harvest_allocate(1000, 4, 0) is null, 'and a grove where nothing was picked divides nothing';
  -- Rounded to the setting, not to a number written in the migration.
  update public.settings set value = to_jsonb(0) where key = 'harvest.share_decimals';
  assert app.harvest_allocate(1000, 3, 7) = 429, 'the rounding follows harvest.share_decimals';
  update public.settings set value = to_jsonb(3) where key = 'harvest.share_decimals';
  assert app.harvest_allocate(1000, 3, 7) = 428.571, 'and follows it again when the owner changes it';

  -- The sentence on the screen is a setting too: emptied, the figure simply carries no note.
  update public.settings set value = to_jsonb(''::text) where key = 'harvest.share_note';
  assert app.harvest_share_note(4, 20, true) is null,
    'an emptied sentence shows nothing rather than an English placeholder';
end $$;
