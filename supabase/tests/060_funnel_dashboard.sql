-- لوحة القيادة: الأرقام حسب المراحل (§28, §24). Migration supabase/migrations/0093_funnel_dashboard.sql,
-- which depends on supabase/migrations/0090_journey.sql.
--
-- THIS FILE IS RED UNTIL BOTH DRAFTS ARE APPLIED, and that is not a bug in it: `npm run db:test` runs every
-- file against the live schema and public.admin_funnel_stats() does not exist there yet. Check the chain in
-- one rolled-back transaction, which is how this file was written:
--
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0090_journey.sql supabase/migrations/0093_funnel_dashboard.sql supabase/tests/060_funnel_dashboard.sql
--
-- WHAT THIS FILE IS NOT FOR. It does not test WHERE a customer stands — that is bb_70's derivation and
-- supabase/tests/058_journey.sql's job. It tests the COUNTING on top of it: that each file lands in exactly
-- one stage, that `reached` is the suffix sum and narrows, that the bar and its tail add up, that a stage
-- with no fact answers null and never 0, that exactly one blockage is named and ties break to the earlier
-- stage, that parked files sit outside the funnel and their contradictions are counted, and that §24's
-- three tree figures come from the trees' own status. The fixtures below exist only to make those counts
-- move; where a fixture lands is bb_70's business.
--
-- EVERY ASSERTION IS A DELTA OR AN INVARIANT, NEVER AN ABSOLUTE. The function counts every person and every
-- tree in the database on purpose — it is the company's funnel — so a test pinning «lead = 3» would pass
-- today and fail the next time somebody fills in the site form. Live traffic can neither hide a failure
-- here nor cause one.

do $$
begin
  if to_regprocedure('public.admin_funnel_stats()') is null then
    raise exception 'supabase/migrations/0093_funnel_dashboard.sql is not applied yet, and this test file belongs to it. Dry-run the chain: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0090_journey.sql supabase/migrations/0093_funnel_dashboard.sql supabase/tests/060_funnel_dashboard.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

-- A refusal that may come from the GRANT or from the role check inside the function: both are 42501, and
-- from the caller's side both mean «not for you».
create function pg_temp.fn_denied(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected a permission denial but the call succeeded: %', p_sql;
exception when insufficient_privilege then
  return;
end $$;

create function pg_temp.fn_stage(p_payload jsonb, p_key text) returns jsonb language sql immutable as $$
  select s from jsonb_array_elements(p_payload -> 'stages') s where s ->> 'key' = p_key
$$;

-- Null survives; it is never turned into a zero. That distinction is the point of section 5.
create function pg_temp.fn_at(p_payload jsonb, p_key text) returns integer language sql immutable as $$
  select (pg_temp.fn_stage(p_payload, p_key) ->> 'at')::integer
$$;

create function pg_temp.fn_reached(p_payload jsonb, p_key text) returns integer language sql immutable as $$
  select (pg_temp.fn_stage(p_payload, p_key) ->> 'reached')::integer
$$;

select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures: four callers, one offer, nine files, and the labels this file measures
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin uuid := gen_random_uuid();
  v_com   uuid := gen_random_uuid();
  v_agri  uuid := gen_random_uuid();
  v_plain uuid := gen_random_uuid();
  v_proj  uuid;
  v_gov   smallint;
  i       integer;
  v_phone text;
  v_used  text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'fun-admin-' || v_admin || '@test.local', '{"full_name":"Admin Funnel"}'),
    (v_com,   'authenticated', 'authenticated', 'fun-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Funnel"}'),
    (v_agri,  'authenticated', 'authenticated', 'fun-agri-'  || v_agri  || '@test.local', '{"full_name":"Masoul Falahi"}'),
    (v_plain, 'authenticated', 'authenticated', 'fun-plain-' || v_plain || '@test.local', '{"full_name":"Bla Dawr"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_com, 'commercial'), (v_agri, 'agri_manager');

  perform set_config('test.fn_admin', v_admin::text, true);
  perform set_config('test.fn_com',   v_com::text,   true);
  perform set_config('test.fn_agri',  v_agri::text,  true);
  perform set_config('test.fn_plain', v_plain::text, true);

  -- Nine unused phone numbers: public.persons is one row per phone.
  for i in 1..9 loop
    loop
      v_phone := '+21694' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used)) and not exists (select 1 from public.persons p where p.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.fn_phone_' || i, v_phone, true);
  end loop;

  select g.id into v_gov from public.governorates g order by g.id limit 1;
  insert into public.projects (code, name, governorate_id)
  values ('FUN-' || substr(gen_random_uuid()::text, 1, 8), 'عرض قياس المسار', v_gov)
  returning id into v_proj;
  perform set_config('test.fn_proj', v_proj::text, true);

  -- Two stage names and two tree labels, pinned here so section 4 measures this file's inputs and never a
  -- live edit. Both are ordinary settings the owner types into الإعدادات.
  update public.settings set value = to_jsonb('راهو جا من الموقع'::text) where key = 'journey.stage_lead';
  update public.settings set value = to_jsonb('ولّى مالك'::text)          where key = 'journey.stage_owner';
  update public.settings set value = to_jsonb('زيتونات سايبة'::text)      where key = 'offers.stock_available_label';
  update public.settings set value = to_jsonb('زيتونات مسكّرة'::text)     where key = 'offers.stock_reserved_label';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · §27 — who may ask the company's funnel
-- ---------------------------------------------------------------------------
-- This is the whole reason the function does not ride on app.can_see_person like the list screens do: it
-- aggregates every file in the company, so narrowing the ROWS would not narrow the ANSWER. Anyone below
-- admin is refused at the door — including a commercial, who reads their own files all day.

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
do $$ begin perform pg_temp.fn_denied('select public.admin_funnel_stats()'); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.fn_plain'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform pg_temp.fn_denied('select public.admin_funnel_stats()'); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.fn_com'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform pg_temp.fn_denied('select public.admin_funnel_stats()'); end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.fn_agri'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform pg_temp.fn_denied('select public.admin_funnel_stats()'); end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2 · The spine is bb_70's, unchanged and in its order
-- ---------------------------------------------------------------------------
-- This file counts; it does not define. If the two spines ever drift apart, the dashboard and the client
-- file start disagreeing again, which is the failure the whole screen exists to end — so the payload is
-- compared against bb_70's own catalogue rather than against a list written out here. It is read through
-- public.staff_journey_spine(), because app.journey_spine() is revoked from authenticated on purpose and
-- this section is deliberately run as the caller, not as the owner of the database.

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.fn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.admin_funnel_stats();
begin
  assert v is not null, 'an admin gets an answer';

  assert (select array_agg(s ->> 'key' order by ord) from jsonb_array_elements(v -> 'stages') with ordinality as t(s, ord))
       = (select array_agg(s ->> 'key' order by (s ->> 'rank')::integer) from jsonb_array_elements(public.staff_journey_spine() -> 'stages') s),
    'the dashboard draws bb_70''s thirteen stages, in bb_70''s order, and defines none of its own';

  assert not exists (
    select 1
    from jsonb_array_elements(v -> 'stages') a
    join jsonb_array_elements(public.staff_journey_spine() -> 'stages') b on b ->> 'key' = a ->> 'key'
    where a ->> 'label' is distinct from b ->> 'label'
       or a ->> 'lead_stage' is distinct from b ->> 'lead_stage'
       or a ->> 'has_fact' is distinct from b ->> 'has_fact'
  ), 'every label and mapping is bb_70''s own, copied and not restated';

  -- The label is the owner's setting, all the way through to the screen.
  assert pg_temp.fn_stage(v, 'lead')  ->> 'label' = 'راهو جا من الموقع', 'the stage label is the owner''s';
  assert pg_temp.fn_stage(v, 'owner') ->> 'label' = 'ولّى مالك',        'and so is the last one';
  assert v #>> '{trees,available_label}' = 'زيتونات سايبة',  'the tree labels are his offers.stock_* settings';
  assert v #>> '{trees,reserved_label}'  = 'زيتونات مسكّرة', 'and this screen writes none of them itself';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3 · Nine files, eight of them carrying a different fact
-- ---------------------------------------------------------------------------
-- Every fixture is left at «جديد» on purpose, exactly as the live book is, so the only thing that can move
-- one is the fact. The ninth is parked by a human while holding a live hold: §29's two truths, in one file.

do $$
declare
  v_new   uuid;
  v_proj  uuid := current_setting('test.fn_proj')::uuid;
  v_admin uuid := current_setting('test.fn_admin')::uuid;
  v_p     uuid[] := '{}';
  v_id    uuid;
  i       integer;
begin
  select id into v_new from public.lead_statuses where stage = 'new' and is_stage_default;

  for i in 1..9 loop
    insert into public.persons (full_name, phone_e164, status_id)
    values ('حريف مسار ' || i, current_setting('test.fn_phone_' || i), v_new)
    returning id into v_id;
    v_p := v_p || v_id;
  end loop;
  perform set_config('test.fn_p9', v_p[9]::text, true);

  -- 1 stays a bare lead. 2 has been called.
  insert into public.contact_attempts (person_id, channel, outcome, created_by) values (v_p[2], 'phone', 'answered', v_admin);

  -- 3 is «مؤهَّل» by the dropdown only. bb_70 cannot prove that stage, so 3 must NOT appear there — see
  -- section 5: an unprovable stage answers null and the file falls back to the fact it does have.
  update public.persons set status_id = (select id from public.lead_statuses where stage = 'qualified' and is_stage_default)
   where id = v_p[3];

  -- 4 has a visit booked, 5 has one done. Both were called too: the visit must win.
  insert into public.contact_attempts (person_id, channel, outcome, created_by) values
    (v_p[4], 'phone', 'answered', v_admin), (v_p[5], 'phone', 'answered', v_admin);
  insert into public.visits (visit_no, person_id, project_id, status, visit_date, slot_label_ar, people_count, contact_channel) values
    ('FUN-VIS-1', v_p[4], v_proj, 'confirmed', current_date + 3, 'صباح', 2, 'phone'),
    ('FUN-VIS-2', v_p[5], v_proj, 'completed', current_date - 3, 'صباح', 2, 'phone');

  -- 6 holds numbered trees with no reservation behind them.
  insert into public.trees (project_id, seq, code, state, held_by, allocated_at) values
    (v_proj, 1, 'FUN-0001', 'reserved', v_p[6], now()),
    (v_proj, 2, 'FUN-0002', 'reserved', v_p[6], now());

  -- 7 has a hold waiting for its عربون, 8 has paid it (deposit_paid_at is required by
  -- reservations_paid_check: a hold that says it is paid says when). 7 was also called and visited: the
  -- money must win.
  insert into public.contact_attempts (person_id, channel, outcome, created_by) values (v_p[7], 'phone', 'answered', v_admin);
  insert into public.visits (visit_no, person_id, project_id, status, visit_date, slot_label_ar, people_count, contact_channel)
  values ('FUN-VIS-3', v_p[7], v_proj, 'completed', current_date - 5, 'صباح', 1, 'phone');
  insert into public.reservations (reference_no, person_id, project_id, status, trees_count, deposit_due_millimes, valid_days, deposit_paid_at) values
    ('FUN-RES-1', v_p[7], v_proj, 'awaiting_deposit', 5, 0, 0, null),
    ('FUN-RES-2', v_p[8], v_proj, 'deposit_paid',     5, 0, 0, now());

  -- 9 is parked by hand while holding a live hold.
  update public.persons set status_id = (select id from public.lead_statuses where stage = 'closed' and is_stage_default)
   where id = v_p[9];
  insert into public.reservations (reference_no, person_id, project_id, status, trees_count, deposit_due_millimes, valid_days)
  values ('FUN-RES-3', v_p[9], v_proj, 'awaiting_deposit', 5, 0, 0);
end $$;

-- ---------------------------------------------------------------------------
-- 4 · The two figures, the three shares, and the one blockage
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.fn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.admin_funnel_stats();
begin
  -- Eight of the nine entered the funnel, each carrying a different fact.
  assert pg_temp.fn_at(v, 'lead')             >= 2, 'the bare lead and the dropdown-only «مؤهَّل» are both leads';
  assert pg_temp.fn_at(v, 'contacted')        >= 1, 'one contact attempt is «تم الاتصال»';
  assert pg_temp.fn_at(v, 'visit_scheduled')  >= 1, 'a booked visit outranks the call that booked it';
  assert pg_temp.fn_at(v, 'visit_completed')  >= 1, 'a completed visit outranks a booked one';
  assert pg_temp.fn_at(v, 'trees_selected')   >= 1, 'trees held with no reservation are «اختيار الزيتونات»';
  assert pg_temp.fn_at(v, 'reservation')      >= 1, 'a hold outranks the visit and the call before it';
  assert pg_temp.fn_at(v, 'deposit_paid')     >= 1, 'a paid عربون is the furthest fact of all here';

  -- ONE FILE, ONE STAGE. The counts must account for everyone in the funnel and for nobody twice.
  assert (select sum((s ->> 'at')::integer) from jsonb_array_elements(v -> 'stages') s where (s ->> 'at') is not null)
       = (v ->> 'in_funnel')::integer,
    'the stage counts add up to the funnel and no file is counted in two stages';

  -- reached is the suffix sum: at-or-beyond, computed in the window and never added up by a screen.
  assert pg_temp.fn_reached(v, 'lead') = (v ->> 'in_funnel')::integer,
    'everyone in the funnel has reached its first stage';
  assert not exists (
    select 1 from jsonb_array_elements(v -> 'stages') s
    where (s ->> 'reached') is not null and (s ->> 'reached')::integer > (v ->> 'in_funnel')::integer
  ), 'no stage can have been reached by more people than are in the funnel';

  -- A funnel narrows. Any two stages that can both answer must be in order.
  assert not exists (
    with ranked as (
      select (s ->> 'reached')::integer as reached, ord
      from jsonb_array_elements(v -> 'stages') with ordinality as t(s, ord)
      where (s ->> 'reached') is not null
    )
    select 1 from ranked a join ranked b on b.ord > a.ord where b.reached > a.reached
  ), 'reached never grows further down the journey';

  -- The bar, its tail and the rest are one scale and add up, so the drawing computes none of it and the
  -- pass segment of one bar is exactly the bar below it — even across a stage that answers null.
  assert not exists (
    select 1 from jsonb_array_elements(v -> 'stages') s
    where (s ->> 'share') is not null
      and (s ->> 'at_share')::integer + (s ->> 'pass_share')::integer <> (s ->> 'share')::integer
  ), 'the tail and the rest of a bar add up to the bar';

  -- THE BLOCKAGE IS EXACTLY ONE ROW. The heading names one stage, so two flagged rows would be the screen
  -- disagreeing with itself — and two stages holding the same number of files is the normal case on a small
  -- book, not a rare one.
  assert (select count(*) from jsonb_array_elements(v -> 'stages') s where (s ->> 'is_block')::boolean) = 1,
    'exactly one stage is named as the blockage';
  assert not exists (
    select 1 from jsonb_array_elements(v -> 'stages') s
    where (s ->> 'is_block')::boolean and ((s ->> 'is_win')::boolean or not (s ->> 'has_fact')::boolean)
  ), 'a stage where standing still is success, or one nobody can be at, is never the blockage';
  assert not exists (
    with eligible as (
      select (s ->> 'at')::integer as at_count, ord, (s ->> 'is_block')::boolean as flagged
      from jsonb_array_elements(v -> 'stages') with ordinality as t(s, ord)
      where not (s ->> 'is_win')::boolean and (s ->> 'has_fact')::boolean
    )
    select 1 from eligible a join eligible b on a.flagged
     where b.at_count > a.at_count or (b.at_count = a.at_count and b.ord < a.ord)
  ), 'the blockage holds the most files, and an earlier stage wins a tie';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5 · ABSENT IS NOT ZERO
-- ---------------------------------------------------------------------------
-- bb_70 marks two stages has_fact:false — «مؤهَّل» (public.contact_outcome carries no «مؤهل للزيارة») and
-- «موعد العقد محدد» (§19's appointment has no table). Counting them would print 0, and 0 reads as a
-- statement about the business — «nobody is qualified» — when it is a statement about a missing column.

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.fn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.admin_funnel_stats();
begin
  assert not exists (
    select 1 from jsonb_array_elements(v -> 'stages') s
    where not (s ->> 'has_fact')::boolean
      and not (s -> 'at' = 'null'::jsonb and s -> 'reached' = 'null'::jsonb
               and s -> 'share' = 'null'::jsonb and s -> 'at_share' = 'null'::jsonb
               and s -> 'pass_share' = 'null'::jsonb and s -> 'stuck' = 'null'::jsonb)
  ), 'a stage no fact can prove answers null for every figure, never 0';

  -- And it carries the reason, in the owner's Arabic, from bb_70 — so the screen explains the gap without
  -- writing a sentence of its own about it.
  assert not exists (
    select 1 from jsonb_array_elements(v -> 'stages') s where coalesce(s ->> 'fact_ar', '') = ''
  ), 'every stage says what proves it, or what would';

  -- The file whose only claim to «مؤهَّل» is the dropdown is NOT counted there: it fell back to the fact it
  -- has. That is the rule «a stage with no fact is shown as غير معروف, never guessed».
  assert pg_temp.fn_stage(v, 'qualified') -> 'at' = 'null'::jsonb,
    'the dropdown alone never fills a stage the database cannot prove';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 6 · Leaving the funnel, and the two truths that disagree
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.fn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.admin_funnel_stats();
begin
  assert (v #>> '{left_funnel,total}')::integer >= 1, 'the parked file is counted as having left';
  assert (v #>> '{left_funnel,conflicts}')::integer >= 1,
    'a file marked «مغلق» that still holds a live hold is a contradiction worth one number';
  assert (select sum(value::text::integer) from jsonb_each(v #> '{left_funnel,by_status}'))
       = (v #>> '{left_funnel,total}')::integer,
    'the parked files are broken down by the owner''s own status names and the parts equal the whole';
  assert (v ->> 'in_funnel')::integer + (v #>> '{left_funnel,total}')::integer = (v ->> 'people_total')::integer,
    'everybody is either in the funnel or has left it, and nobody is counted twice';

  -- §29: the dropdown and the facts are shown side by side, never silently reconciled. Six fixtures sit at
  -- «جديد» while their facts say otherwise, so this can only have grown.
  assert (v ->> 'mismatch')::integer >= 5,
    'files whose status disagrees with their facts are counted, not overruled';

  -- The parked file is not one of them: parking is a decision, not a drift.
  assert (v ->> 'mismatch')::integer <= (v ->> 'in_funnel')::integer,
    'only files inside the funnel can be counted as disagreeing';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 7 · §24 — the trees are counted from their own status
-- ---------------------------------------------------------------------------
-- «Stock updates per TREE, not by subtracting from a counter.» Moving one tree must move exactly two of the
-- four figures, and the total must not move at all.

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.fn_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_before jsonb := public.admin_funnel_stats();
  v_after  jsonb;
begin
  assert (v_before #>> '{trees,total}')::integer =
         (v_before #>> '{trees,available}')::integer + (v_before #>> '{trees,reserved}')::integer
         + (v_before #>> '{trees,sold}')::integer,
    'the three states account for every tree row';

  set local role postgres;
  update public.trees set state = 'sold' where code = 'FUN-0001';
  set local role authenticated;

  v_after := public.admin_funnel_stats();
  assert (v_after #>> '{trees,sold}')::integer = (v_before #>> '{trees,sold}')::integer + 1,
    'selling one tree adds exactly one to المباعة';
  assert (v_after #>> '{trees,reserved}')::integer = (v_before #>> '{trees,reserved}')::integer - 1,
    'and takes exactly one off المحجوزة';
  assert (v_after #>> '{trees,total}')::integer = (v_before #>> '{trees,total}')::integer,
    'the total is a count of rows and does not move when a state does';
  assert (v_after #>> '{trees,available}')::integer = (v_before #>> '{trees,available}')::integer,
    'and المتاحة is untouched by a move between the other two';
end $$;

reset role;
