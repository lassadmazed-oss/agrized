-- وين وصل مطلبي — the lookup for somebody who has not signed in.
-- Migration supabase/migrations/0103_request_tracking.sql.
--
-- Runs against the live database inside a rolled-back transaction: one fresh offer with an unused code,
-- three demands on three unused phone numbers, and every setting it measures pinned inside the transaction.
-- Every assertion is scoped to those fixtures, so real traffic can neither hide a failure nor cause one.
--
-- WHAT THIS FILE IS FOR. public.track_request is the second door an unauthenticated stranger may knock on,
-- and the credential behind it is half public: request numbers are SEQUENTIAL, so anybody who ever submitted
-- the form can count up and down from their own. That makes the interesting assertions the ones about what
-- the function refuses to say, not the one about the happy path — so section 1 is the happy path in a dozen
-- lines and sections 2, 3, 4 and 5 are the four ways this could be abused:
--
--   2 · IS IT AN ORACLE?      a wrong phone and a wrong code must be one indistinguishable answer.
--   3 · WHAT DOES IT LEAK?    no money, no name, no phone, and not one uuid — including the request's own,
--                             which 0094's stage carries in proof.id and which 0103 strips. Section 3 proves
--                             the strip by reading 0094's answer next to 0103's.
--   4 · CAN THE PHONE BE BRUTE-FORCED?  the limit is charged on FAILURES too, or it protects nothing.
--   5 · IS IT ON THE INTERNET?          anon and authenticated must both be refused by the GRANT.

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'track_request') then
    raise exception
      'supabase/migrations/0103_request_tracking.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0103_request_tracking.sql supabase/tests/065_request_tracking.sql';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'request_stage') then
    raise exception
      'app.request_stage is missing (0094). 0103 derives every stage from it and section 3 compares the two answers directly.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.tr_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- The offer intake payload, same shape 061 uses.
create function pg_temp.tr_payload(p_project text, p_trees text, p_phone text) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'زبير المتتبّع للمطلب',
    'phone_e164', p_phone,
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', p_project,
    'trees', p_trees)
$$;

-- How many lookups have been charged against one request number. Reaches into app.submission_throttle on
-- purpose: section 4 is about a row being written on a FAILED attempt, and the only way to see that from
-- outside is the behaviour three calls later. Both are asserted.
create function pg_temp.tr_charged(p_no text) returns integer language sql as $$
  select count(*)::integer from app.submission_throttle t
  where t.kind = 'track:request' and t.key_hash = md5(upper(btrim(p_no)))
    and t.created_at > now() - interval '1 hour'
$$;

do $$
declare
  v_phone text;
  i       integer;
  v_used  text[] := '{}';
begin
  for i in 1..4 loop
    loop
      v_phone := '+21695' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.interest_requests r where r.phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.tr_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures — one offer, four demands on four different clients
-- ---------------------------------------------------------------------------
--
-- FOUR, and each one has a job, because the assertions interfere with each other otherwise: every call to
-- public.track_request CHARGES the code it names, so a section that measures the ceiling cannot reuse a code
-- an earlier section has already spent. Demand 1 is the workhorse (sections 1 and 3), demand 2 is the other
-- real code and the other real phone that section 2 crosses over, demand 3 is the one section 4 throttles,
-- and demand 4 is the untouched one that proves the ceiling is per request number and not per platform.

do $$
declare
  v_class uuid;
  v_proj  uuid;
  v_code  text;
begin
  update public.feature_flags set state = 'public' where key in ('projects', 'pricing');
  update public.settings set value = to_jsonb(1) where key = 'offers.min_trees_default';
  update public.settings set value = to_jsonb('manual'::text) where key = 'crm.auto_assign_mode';
  update public.settings set value = to_jsonb(9) where key = 'antispam.max_requests_per_phone_per_day';
  -- Pinned high for sections 1 to 3, which call the function a dozen times against two codes and are not
  -- measuring the ceiling. Section 4 pins it to 2 against a code nothing has touched.
  update public.settings set value = to_jsonb(500) where key = 'track.max_lookups_per_hour';

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select c.id into v_class from public.tree_spacing_classes c where c.code = 'trad_wide_24x24';

  -- DIGITS, NOT HEX, in the offer code: section 3 asserts «not one uuid anywhere in the payload» with a
  -- uuid-shaped regex, and a fixture code built out of hex would be arguing with its own assertion.
  v_code := 'TRK-' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
  insert into public.projects (code, name, governorate_id, status, tree_count,
                              reservation_deposit_millimes, reservation_valid_days, reservation_conditions_ar)
  values (v_code, 'عرض تتبّع المطلب', 34, 'published', 40, 75000, 30, 'شروط عرض الاختبار.')
  returning id into v_proj;
  perform set_config('test.tr_project', v_proj::text, true);
  perform set_config('test.tr_project_code', v_code, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_proj, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_proj, 7000, 50000, 150000, 'percent', 1000, 1000);
end $$;

do $$
declare
  v_no  text;
  v_rid uuid;
  v_pid uuid;
  i     integer;
begin
  for i in 1..4 loop
    v_no := public.submit_offer_request(
      pg_temp.tr_payload(current_setting('test.tr_project'), (i + 2)::text,
                         current_setting('test.tr_phone_' || i)))->>'request_no';
    select r.id, r.person_id into v_rid, v_pid
    from public.interest_requests r where r.request_no = v_no;
    perform set_config('test.tr_no_' || i, v_no, true);
    perform set_config('test.tr_id_' || i, v_rid::text, true);
    perform set_config('test.tr_person_' || i, v_pid::text, true);
  end loop;
end $$;

-- THE PREMISE OF THE WHOLE FILE, asserted rather than assumed: request numbers are SEQUENTIAL, which is why
-- the phone has to be the credential. If the intake ever starts issuing random numbers, 0103's central
-- argument changes and this is the line that should be read again — it does not fail, it documents.
do $$
declare
  v_a integer := split_part(current_setting('test.tr_no_1'), '-', 3)::integer;
  v_b integer := split_part(current_setting('test.tr_no_2'), '-', 3)::integer;
  v_c integer := split_part(current_setting('test.tr_no_3'), '-', 3)::integer;
  v_d integer := split_part(current_setting('test.tr_no_4'), '-', 3)::integer;
begin
  assert v_b = v_a + 1 and v_c = v_b + 1 and v_d = v_c + 1,
    format('request numbers are sequential (%s, %s, %s, %s) — this is WHY 0103 requires the phone as well as the code. If they are no longer sequential, re-read 0103''s security argument; it may now be stricter than it needs to be.',
           v_a, v_b, v_c, v_d);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The right pair, and the number typed the way a client types it
-- ---------------------------------------------------------------------------

do $$
declare
  v_out   jsonb := public.track_request(current_setting('test.tr_no_1'), current_setting('test.tr_phone_1'));
  v_keys  text[];
  v_ranks integer[];
begin
  assert (v_out->>'ok')::boolean, 'the right code and the right phone answer ok, got ' || v_out::text;
  assert v_out->>'request_no' = current_setting('test.tr_no_1'), 'and name the demand asked about';
  assert v_out->>'offer_code' = current_setting('test.tr_project_code'),
    'and the offer it was about, by the code snapshotted at intake';
  assert v_out->>'offer_name' = 'عرض تتبّع المطلب', 'and the offer''s name as the visitor saw it';
  assert (v_out->>'trees')::integer = 3, 'and how many olive trees were asked for, got ' || coalesce(v_out->>'trees', 'null');
  assert (v_out->>'created_at')::timestamptz is not null, 'and when the demand was made';

  -- THE PAYLOAD IS EXACTLY THE NINE KEYS THE UI IS BEING WRITTEN AGAINST. Asserted as a set and not key by
  -- key, because the risk here is an ADDED key: money or a name arriving later by accident is the one failure
  -- this whole file exists to catch, and a key-by-key check would not see it.
  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_out) k;
  assert v_keys = array['created_at', 'offer_code', 'offer_name', 'ok', 'request_no', 'spine', 'stage', 'trees', 'unknown']::text[],
    'the payload carries exactly ok · request_no · created_at · offer_name · offer_code · trees · stage · spine · unknown, got ' || array_to_string(v_keys, ' · ');

  -- A FRESH DEMAND IS «مطلب جديد», and it is 0094's answer, not a second copy of the derivation.
  assert v_out->'stage'->>'key' = 'lead', 'a demand with nothing behind it yet is at the floor of the spine';
  assert v_out->'stage'->>'key' = app.request_stage(current_setting('test.tr_id_1')::uuid)->>'key',
    'and the stage IS 0094''s, not a second derivation living in 0103';
  assert v_out->'stage'->>'label' = app.journey_stage_label('lead'),
    'the Arabic word comes from settings through 0090, like everywhere else';

  -- The path: 0090's thirteen, in order, with reached/current computed the way staff_request_journey does.
  assert jsonb_array_length(v_out->'spine') = 13,
    'the path is the thirteen stages, got ' || jsonb_array_length(v_out->'spine');
  select array_agg((s->>'rank')::integer order by (s->>'rank')::integer) into v_ranks
  from jsonb_array_elements(v_out->'spine') s;
  assert v_ranks = array[1,2,3,4,5,6,7,8,9,10,11,12,13], 'in rank order';
  assert (select array_agg(s->>'key' order by (s->>'rank')::integer) from jsonb_array_elements(v_out->'spine') s)
       = (select array_agg(s->>'key' order by (s->>'rank')::integer) from jsonb_array_elements(app.journey_spine()) s),
    'and it IS 0090''s spine, not a copy of it';
  assert (select count(*) from jsonb_array_elements(v_out->'spine') s where (s->>'reached')::boolean) = 1,
    'exactly one stage is reached on a brand new demand';
  assert (select s->>'key' from jsonb_array_elements(v_out->'spine') s where (s->>'current')::boolean) = 'lead',
    'and the current one is it';

  assert v_out->>'unknown' = app.setting_text('journey.unknown_label', 'غير معروف'),
    'the word for «no fact» comes from settings, like everywhere else';
end $$;

-- THE CLIENT TYPES THEIR NUMBER THE WAY THEY KNOW IT. A page that only accepted '+21695123456' would be
-- useless to the people it is for; eight digits is the floor, so the suffix rule never shortens the secret.
do $$
declare
  v_full  text := current_setting('test.tr_phone_1');
  v_local text := right(current_setting('test.tr_phone_1'), 8);
begin
  assert (public.track_request(current_setting('test.tr_no_1'), v_local)->>'ok')::boolean,
    'the eight digit local form works: ' || v_local;
  assert (public.track_request(current_setting('test.tr_no_1'),
            substr(v_local,1,2) || ' ' || substr(v_local,3,3) || ' ' || substr(v_local,6,3))->>'ok')::boolean,
    'spaces and dashes are not a wrong answer';
  assert (public.track_request(current_setting('test.tr_no_1'), '00216' || v_local)->>'ok')::boolean,
    'and so is the 00216 form';
  assert (public.track_request(lower(current_setting('test.tr_no_1')) || '  ', v_full)->>'ok')::boolean,
    'the code is trimmed and case does not matter — it is read off an SMS by hand';

  -- SEVEN DIGITS IS NOT A SHORTER SECRET. The suffix rule must never let a partial number in.
  assert (public.track_request(current_setting('test.tr_no_1'), right(v_local, 7))->>'reason') = 'not_found',
    'seven digits is refused: the suffix rule may not shorten the credential';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · IT IS NOT AN ORACLE · one answer for every failure
-- ---------------------------------------------------------------------------

do $$
declare
  v_right_code_wrong_phone jsonb := public.track_request(current_setting('test.tr_no_1'), current_setting('test.tr_phone_2'));
  v_wrong_code_right_phone jsonb := public.track_request(current_setting('test.tr_no_2'), current_setting('test.tr_phone_1'));
  v_no_such_code           jsonb := public.track_request('AGZ-1999-000001', current_setting('test.tr_phone_1'));
  v_nothing_typed          jsonb := public.track_request('', '');
begin
  -- A code that is real but not yours.
  assert (v_right_code_wrong_phone->>'ok')::boolean is false and v_right_code_wrong_phone->>'reason' = 'not_found',
    'a real code with somebody else''s phone is refused, got ' || v_right_code_wrong_phone::text;

  -- A phone that is real but not for that code. Note both of these are two REAL demands crossed over, which
  -- is the sharpest version of the test: every single value involved exists.
  assert (v_wrong_code_right_phone->>'ok')::boolean is false,
    'a real phone against another demand''s code is refused, got ' || v_wrong_code_right_phone::text;

  -- THE WHOLE POINT OF THE SECTION: byte for byte the same object.
  assert v_right_code_wrong_phone = v_wrong_code_right_phone,
    'a wrong phone and a wrong code are answered IDENTICALLY, otherwise this endpoint tells an attacker which half they got right — and since request numbers are sequential, «the code is real» is the same as publishing how many demands exist. phone=' || v_right_code_wrong_phone::text || ' code=' || v_wrong_code_right_phone::text;
  assert v_no_such_code = v_right_code_wrong_phone,
    'and a code that never existed is answered identically too, got ' || v_no_such_code::text;
  assert v_nothing_typed = v_right_code_wrong_phone,
    'and so is an empty form, got ' || v_nothing_typed::text;

  -- The failure says nothing beyond «no». Two keys, and neither of them is a hint.
  assert (select array_agg(k order by k) from jsonb_object_keys(v_right_code_wrong_phone) k) = array['ok', 'reason']::text[],
    'the refusal carries nothing but ok and reason, got ' || v_right_code_wrong_phone::text;
end $$;

-- AN EMPTY CODE IS CHARGED NOTHING, because there is nothing to key a limit on and the answer cannot depend
-- on any row. Everything else is charged — that is section 4.
do $$
begin
  assert pg_temp.tr_charged('') = 0, 'a blank lookup writes no throttle row';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · WHAT IT LEAKS · nothing, and that includes the demand's own uuid
-- ---------------------------------------------------------------------------

do $$
declare
  v_out  jsonb := public.track_request(current_setting('test.tr_no_1'), current_setting('test.tr_phone_1'));
  v_text text  := v_out::text;
  v_0094 jsonb := app.request_stage(current_setting('test.tr_id_1')::uuid);
begin
  -- NOT ONE UUID, ANYWHERE, AT ANY DEPTH. Asserted on the rendered payload rather than key by key, because
  -- the identifiers that could appear are nested inside `stage.proof` and would arrive there without anybody
  -- adding a top-level key.
  assert v_text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    'the payload contains a uuid, and a stranger holding a guessed pair must get no handle into any other table: ' || v_text;

  -- AND THIS IS WHY THAT ASSERTION IS NOT FREE. 0094's own answer carries the request's uuid in proof.id and
  -- its request_no in proof.ref, because a staff screen links to the row. 0103 strips exactly those two. If
  -- somebody ever passes 0094's stage through whole, the line above goes red and this line says why.
  assert v_0094->'proof'->>'id' = current_setting('test.tr_id_1'),
    '0094 really does put the demand''s uuid in proof.id — if it stopped, 0103''s strip is no longer load-bearing and the assertion above proves less than it looks';
  assert not (v_out->'stage'->'proof' ? 'id'), 'and 0103 strips it';
  assert not (v_out->'stage'->'proof' ? 'ref'), 'and the internal reference number with it';

  -- What SURVIVES the strip is what keeps the sentence honest, so it is asserted too rather than left to
  -- chance: the kind of fact and when it happened.
  assert v_out->'stage'->'proof'->>'kind' = 'request', 'what survives is the kind of fact';
  assert (v_out->'stage'->'proof'->>'at')::timestamptz is not null, 'and when it happened';

  -- NO MONEY. Not a price, not a عربون, not an instalment, not a total. The client who needs the figures
  -- reads them in their own file behind an SMS sign-in.
  assert v_text !~* 'millime', 'the payload names no money field: ' || v_text;
  assert not exists (select 1 from jsonb_object_keys(v_out) k
                     where k ~* 'price|millime|paid|due|deposit|total|money|fee'),
    'and no key that smells of money';

  -- NO NAME. A code plus a phone identifies a DEMAND, not a person; a name here would turn a guessed pair
  -- into a phone-number-to-name directory.
  assert v_text not like '%زبير%', 'the payload does not say the client''s name back to them: ' || v_text;
  assert not exists (select 1 from jsonb_object_keys(v_out) k where k ~* 'name' and k not in ('offer_name')),
    'and the only name in it is the offer''s';

  -- NO PHONE. It was an input and never an output; echoing it back confirms the guess.
  assert position(right(current_setting('test.tr_phone_1'), 8) in v_text) = 0,
    'the payload does not echo the phone that was typed: ' || v_text;

  -- AND NO PERSON. Belt and braces over the uuid regex, by the actual value.
  assert position(current_setting('test.tr_person_1') in v_text) = 0, 'no person id';
  assert position(current_setting('test.tr_id_1') in v_text) = 0, 'no request id';
  assert position(current_setting('test.tr_project') in v_text) = 0, 'no project id';
end $$;

-- ---------------------------------------------------------------------------
-- 4 · THE PHONE CANNOT BE BRUTE-FORCED · the limit is charged on failures too
-- ---------------------------------------------------------------------------

-- Demand 3 has never been looked up, so this section measures its own calls and nothing else.
do $$
declare
  v_no   text := current_setting('test.tr_no_3');
  v_ok   text := current_setting('test.tr_phone_3');
  v_bad  text := current_setting('test.tr_phone_1');
  v_out  jsonb;
begin
  update public.settings set value = to_jsonb(2) where key = 'track.max_lookups_per_hour';
  assert pg_temp.tr_charged(v_no) = 0, 'demand 3 starts untouched';

  -- A FAILED GUESS COSTS A SLOT. If it did not, the eight digits could be walked at full speed against a
  -- code somebody holds, and the limit would protect nothing at all — this is the assertion that makes the
  -- ordering inside 0103 (charge, then look up, then compare) a property of the code.
  v_out := public.track_request(v_no, v_bad);
  assert v_out->>'reason' = 'not_found', 'the wrong phone is refused';
  assert pg_temp.tr_charged(v_no) = 1,
    'and the failed guess was CHARGED — otherwise the phone is brute-forceable and the limit is decoration';

  v_out := public.track_request(v_no, v_ok);
  assert (v_out->>'ok')::boolean, 'the second lookup, this time correct, is still inside the ceiling of two';
  assert pg_temp.tr_charged(v_no) = 2, 'and it was charged too';

  -- THE THIRD IS REFUSED EVEN THOUGH IT IS RIGHT. Being correct is not a way around the ceiling; if it were,
  -- an attacker who found the phone could then read the demand as often as they liked.
  v_out := public.track_request(v_no, v_ok);
  assert (v_out->>'ok')::boolean is false and v_out->>'reason' = 'too_many',
    'over the ceiling even the right pair is refused, and it says so, got ' || v_out::text;
  assert (select array_agg(k order by k) from jsonb_object_keys(v_out) k) = array['ok', 'reason']::text[],
    'and the refusal still carries nothing else';
  assert pg_temp.tr_charged(v_no) = 2,
    'a refused lookup does NOT extend the window — otherwise hammering the endpoint locks the client out forever';

  -- AND THE CEILING IS PER REQUEST NUMBER, not global: one client burning their twenty must not lock out
  -- every other client on the platform. Demand 4 is the untouched fixture, asked while demand 3 is blocked
  -- and while the ceiling is still pinned at two.
  assert (public.track_request(current_setting('test.tr_no_4'), current_setting('test.tr_phone_4'))->>'ok')::boolean,
    'demand 4 still answers while demand 3 is blocked: the ceiling is per request number, not per platform';

  -- IT IS THE OWNER'S NUMBER, read from settings and not frozen in the function body.
  update public.settings set value = to_jsonb(500) where key = 'track.max_lookups_per_hour';
  assert (public.track_request(v_no, v_ok)->>'ok')::boolean,
    'raising track.max_lookups_per_hour in الإعدادات lifts the ceiling immediately — the limit is data, not code';
end $$;

-- The setting itself: seeded, private, and in a group like every other.
do $$
declare
  v_s public.settings;
begin
  select * into v_s from public.settings where key = 'track.max_lookups_per_hour';
  assert found, 'the migration seeds track.max_lookups_per_hour';
  assert v_s.value_type = 'integer' and v_s.group_key = 'track', 'typed and grouped';
  assert v_s.is_public is false,
    'and it is NOT public: a visitor who can read the ceiling knows exactly how many guesses they get an hour';
  assert v_s.label_ar <> '' and v_s.description_ar is not null,
    'with an Arabic label and an explanation, because the owner is the one who edits it';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · IT IS NOT PUBLISHED ON THE INTERNET
-- ---------------------------------------------------------------------------

-- SERVER ONLY, like 0096's login functions and for the same reason: the Server Action calls it with the
-- service-role key and carries the PER-IP limit this function cannot have. Reachable by anon, it is an
-- unmetered lookup over a sequential identifier, published.
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.tr_expect(
  $q$select public.track_request('AGZ-2026-000001', '+21695000000')$q$,
  'permission denied for function track_request');
reset role;

-- And a signed-in session gains nothing either: a buyer with an account reads their own file through
-- my_zitounti_file, which resolves the person from auth.uid(); this door is for people who have no account,
-- and it stays shut to everybody but the server.
set local role authenticated;
select pg_temp.tr_expect(
  $q$select public.track_request('AGZ-2026-000001', '+21695000000')$q$,
  'permission denied for function track_request');
reset role;
