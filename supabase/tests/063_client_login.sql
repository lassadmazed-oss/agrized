-- دخول الحريف برمز بالSMS.
-- Migration supabase/migrations/0096_client_login.sql (rename this file's first line when it is numbered).
--
-- Runs against the live database inside a rolled-back transaction, on a person with an unused phone number.
--
-- WHAT THIS FILE IS FOR. This is the only door into the product that an unauthenticated stranger may knock
-- on, so the things worth asserting are not «does the happy path work» — that is one line of it — but the
-- four ways it could be abused: learning who is a client, guessing a code, being used as an SMS cannon, and
-- reading the codes table directly. Sections 2 to 5 are those four, in that order.

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'request_client_login_code') then
    raise exception
      'supabase/migrations/0096_client_login.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0096_client_login.sql supabase/tests/063_client_login.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers and fixtures
-- ---------------------------------------------------------------------------

create function pg_temp.cl_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

/**
 * The code as the CLIENT receives it: dug out of the SMS, because nothing else can ever see it.
 *
 * NOT «the newest row», which is what this tried first and why it failed. `now()` is fixed for the whole
 * transaction, so every outbox row this file queues shares one created_at and «order by created_at desc»
 * picks an arbitrary one of them. That is an artefact of testing inside a transaction and NOT a fault in
 * the migration: in life each request is its own transaction, and issuing a code retires the previous one
 * so only ever one is live.
 *
 * So this asks the question that is actually meant — «which SMS carries the code that would work right
 * now» — by matching each message against the one live hash. It is also the truest model of the client:
 * they try the code they can see.
 */
create function pg_temp.cl_code(p_phone text) returns text language sql as $$
  select (regexp_match(o.body, '([0-9]{6})'))[1]
  from public.notification_outbox o
  join public.client_login_codes c
    on c.phone_e164 = o.to_phone_e164
   and c.consumed_at is null
   and extensions.crypt((regexp_match(o.body, '([0-9]{6})'))[1], c.code_hash) = c.code_hash
  where o.to_phone_e164 = p_phone and o.related_entity = 'client_login'
  limit 1
$$;

create function pg_temp.cl_sent(p_phone text) returns integer language sql as $$
  select count(*)::integer from public.notification_outbox o
  where o.to_phone_e164 = p_phone and o.related_entity = 'client_login'
$$;

do $$
declare
  v_phone text;
  i       integer;
  v_used  text[] := '{}';
begin
  for i in 1..2 loop
    loop
      v_phone := '+21694' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.notification_outbox o where o.to_phone_e164 = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.cl_phone_' || i, v_phone, true);
  end loop;
end $$;

do $$
declare
  v_status uuid;
  v_id     uuid;
begin
  -- The four numbers this file measures, pinned so it reads its own inputs.
  update public.settings set value = to_jsonb(300) where key = 'auth.client_code_ttl_seconds';
  update public.settings set value = to_jsonb(3)   where key = 'auth.client_code_max_attempts';
  update public.settings set value = to_jsonb(0)   where key = 'auth.client_code_cooldown_seconds';
  update public.settings set value = to_jsonb(50)  where key = 'auth.client_code_max_per_hour';

  select s.id into v_status from public.lead_statuses s
  where s.is_active order by s.is_stage_default desc, s.sort_order limit 1;

  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at)
  values ('حريف الدخول', current_setting('test.cl_phone_1'), 34, v_status, now())
  returning id into v_id;
  perform set_config('test.cl_person', v_id::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The happy path, and the code that is never written down
-- ---------------------------------------------------------------------------

do $$
declare
  v_out  jsonb := public.request_client_login_code(current_setting('test.cl_phone_1'));
  v_code text;
  v_hash text;
begin
  assert (v_out->>'ok')::boolean, 'a known number is answered ok';
  assert (v_out->>'ttl_seconds')::integer = 300, 'and told how long the code lives';
  assert pg_temp.cl_sent(current_setting('test.cl_phone_1')) = 1,
    'one SMS is queued on the outbox everything else uses';

  v_code := pg_temp.cl_code(current_setting('test.cl_phone_1'));
  assert v_code ~ '^[0-9]{6}$', 'the message carries a six digit code, got ' || coalesce(v_code, 'null');

  -- THE ONE THAT MATTERS MOST: a copy of this table is not a list of live codes.
  select c.code_hash into v_hash
  from public.client_login_codes c where c.phone_e164 = current_setting('test.cl_phone_1');
  assert v_hash <> v_code, 'the code is NOT stored in clear';
  assert v_hash like '$2%', 'it is stored as a bcrypt hash, got ' || left(v_hash, 4);
  assert extensions.crypt(v_code, v_hash) = v_hash, 'and the hash is of that code';

  -- The SMS is about a PERSON, never about the code.
  assert (select o.related_id from public.notification_outbox o
          where o.to_phone_e164 = current_setting('test.cl_phone_1')
          order by o.created_at desc limit 1) = current_setting('test.cl_person')::uuid,
    'the queued row names the person it is for';
end $$;

-- ONE SMS, NOT TWO — the rule 0079 made for the whole platform, applied to the one template it could not
-- see. supabase/tests/049_sms_one_segment.sql loops over public.message_templates; this template lives in
-- public.settings, so it needs its own assertion or it has none.
--
-- MEASURED AGAINST THE WORST CASE, not against today's value. `auth.client_code_ttl_seconds` is a setting:
-- at 120 minutes {minutes} is three characters, not one. A template that fits only while the TTL is small
-- is a phone bill that doubles the day somebody lengthens it, for a reason nobody would connect.
do $$
declare
  v_body text := replace(replace(app.setting_text('auth.client_login_sms', ''), '{code}', '516548'),
                         '{minutes}', '120');
begin
  assert char_length(v_body) <= 70,
    format('the login SMS renders to %s characters; an Arabic SMS is UCS-2 and holds 70, so this is sent as %s messages and charged as %s: «%s»',
           char_length(v_body), ceil(char_length(v_body) / 67.0)::integer,
           ceil(char_length(v_body) / 67.0)::integer, v_body);

  assert v_body !~ '\{[a-z_]+\}',
    format('the login SMS leaves a placeholder unfilled, and the client would read it braces and all: «%s»', v_body);
  assert v_body like '%516548%', 'and it actually prints the code';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · ENUMERATION · a stranger cannot learn who is a client
-- ---------------------------------------------------------------------------

do $$
declare
  v_known   jsonb := public.request_client_login_code(current_setting('test.cl_phone_1'));
  v_unknown jsonb := public.request_client_login_code(current_setting('test.cl_phone_2'));
begin
  -- THE WHOLE POINT: byte for byte the same answer for a number we know and one we have never seen.
  assert v_known = v_unknown,
    'a known and an unknown number are answered IDENTICALLY, otherwise this endpoint is a lookup service for whether a phone belongs to an AgriZed buyer. known=' || v_known::text || ' unknown=' || v_unknown::text;

  -- And nothing was sent to the stranger, nor any row written about them.
  assert pg_temp.cl_sent(current_setting('test.cl_phone_2')) = 0,
    'no SMS goes to a number that belongs to nobody';
  assert (select count(*) from public.client_login_codes c
          where c.phone_e164 = current_setting('test.cl_phone_2')) = 0,
    'and no code row is written for them';

  -- A malformed number is the one thing worth naming, because it is about what the caller typed.
  assert public.request_client_login_code('0612345')->>'reason' = 'invalid_phone',
    'a malformed number is named as such — it reveals nothing about who exists';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · GUESSING · the attempts are counted on the code, and it dies at the limit
-- ---------------------------------------------------------------------------

-- Asking again retires the previous code: two live codes for one number doubles the guessing surface.
do $$
begin
  assert (select count(*) from public.client_login_codes c
          where c.person_id = current_setting('test.cl_person')::uuid and c.consumed_at is null) = 1,
    'after three requests exactly ONE code is live; the older ones were retired';
end $$;

do $$
declare
  v_code text := pg_temp.cl_code(current_setting('test.cl_phone_1'));
  v_out  jsonb;
begin
  -- Wrong, twice. max_attempts is pinned at 3 above.
  v_out := public.verify_client_login_code(current_setting('test.cl_phone_1'), '000000');
  assert (v_out->>'ok')::boolean is false and v_out->>'reason' = 'invalid_code',
    'a wrong code is refused, got ' || v_out::text;
  assert (v_out->>'attempts_left')::integer = 2, 'and the client is told how many guesses are left';

  v_out := public.verify_client_login_code(current_setting('test.cl_phone_1'), '111111');
  assert (v_out->>'attempts_left')::integer = 1, 'the count goes down';

  -- The third wrong guess spends the last attempt; the code is then dead even though it has not expired.
  v_out := public.verify_client_login_code(current_setting('test.cl_phone_1'), '222222');
  assert (v_out->>'ok')::boolean is false, 'the third wrong guess fails too';

  v_out := public.verify_client_login_code(current_setting('test.cl_phone_1'), v_code);
  assert v_out->>'reason' = 'too_many_attempts',
    'AND THE RIGHT CODE NO LONGER WORKS: the code died with the attempts, got ' || v_out::text;
end $$;

-- A fresh code, and the right answer on the first try.
do $$
declare
  v_code text;
  v_out  jsonb;
begin
  perform public.request_client_login_code(current_setting('test.cl_phone_1'));
  v_code := pg_temp.cl_code(current_setting('test.cl_phone_1'));

  v_out := public.verify_client_login_code(current_setting('test.cl_phone_1'), v_code);
  assert (v_out->>'ok')::boolean, 'the right code signs the client in, got ' || v_out::text;
  assert (v_out->>'person_id')::uuid = current_setting('test.cl_person')::uuid,
    'and names the person who owns the number';

  -- One-time means one time. A code that survives its use is a password.
  v_out := public.verify_client_login_code(current_setting('test.cl_phone_1'), v_code);
  assert (v_out->>'ok')::boolean is false,
    'the SAME code cannot be used twice, got ' || v_out::text;
end $$;

-- An expired code is refused even when it is the right one and has attempts left.
do $$
declare
  v_code text;
  v_out  jsonb;
begin
  perform public.request_client_login_code(current_setting('test.cl_phone_1'));
  v_code := pg_temp.cl_code(current_setting('test.cl_phone_1'));
  update public.client_login_codes set expires_at = now() - interval '1 second'
   where person_id = current_setting('test.cl_person')::uuid and consumed_at is null;

  v_out := public.verify_client_login_code(current_setting('test.cl_phone_1'), v_code);
  assert v_out->>'reason' = 'expired', 'an expired code is refused, got ' || v_out::text;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · THE SMS CANNON · the cooldown is silent, and it still does not send
-- ---------------------------------------------------------------------------

do $$
declare
  v_before integer;
  v_first  jsonb;
  v_second jsonb;
begin
  -- AGE EVERYTHING THIS FILE HAS ALREADY WRITTEN. `now()` is fixed for the transaction, so every code row
  -- above was created at this instant and would read as «asked one second ago» — the cooldown would refuse
  -- both requests below and the test would measure nothing. Backdating puts the fixture where life would
  -- have it: a client who last asked an hour ago.
  update public.client_login_codes set created_at = now() - interval '1 hour'
   where phone_e164 = current_setting('test.cl_phone_1');

  update public.settings set value = to_jsonb(120) where key = 'auth.client_code_cooldown_seconds';
  v_before := pg_temp.cl_sent(current_setting('test.cl_phone_1'));

  v_first  := public.request_client_login_code(current_setting('test.cl_phone_1'));
  v_second := public.request_client_login_code(current_setting('test.cl_phone_1'));

  assert v_first = v_second,
    'the cooled-down request is answered exactly like the one that sent — otherwise the throttle itself tells an attacker the number is real';
  assert pg_temp.cl_sent(current_setting('test.cl_phone_1')) = v_before + 1,
    'but only ONE message went out, got ' || (pg_temp.cl_sent(current_setting('test.cl_phone_1')) - v_before);

  update public.settings set value = to_jsonb(0) where key = 'auth.client_code_cooldown_seconds';
end $$;

-- The hourly ceiling behaves the same way: same answer, no message.
do $$
declare
  v_before integer;
begin
  update public.settings set value = to_jsonb(1) where key = 'auth.client_code_max_per_hour';
  v_before := pg_temp.cl_sent(current_setting('test.cl_phone_1'));

  perform public.request_client_login_code(current_setting('test.cl_phone_1'));
  assert pg_temp.cl_sent(current_setting('test.cl_phone_1')) = v_before,
    'over the hourly ceiling nothing is sent at all';

  update public.settings set value = to_jsonb(50) where key = 'auth.client_code_max_per_hour';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · اربط الحساب — the write that has never happened before
-- ---------------------------------------------------------------------------

do $$
declare
  v_user uuid := gen_random_uuid();
  v_out  jsonb;
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (v_user, 'authenticated', 'authenticated', 'cl-' || v_user || '@test.local', '{"full_name":"حريف"}');

  assert (select p.profile_id from public.persons p where p.id = current_setting('test.cl_person')::uuid) is null,
    'public.persons.profile_id has never been written by anything — that is what this fixes';

  v_out := public.link_client_profile(current_setting('test.cl_person')::uuid, v_user);
  assert (v_out->>'ok')::boolean and (v_out->>'linked')::boolean, 'the first link reports it linked';
  assert (select p.profile_id from public.persons p where p.id = current_setting('test.cl_person')::uuid) = v_user,
    'and the person now points at the auth user';
  assert exists (select 1 from public.user_roles r where r.user_id = v_user and r.role = 'client'),
    'the auth user carries the `client` role, which grants no Back Office access (src/lib/auth.ts strips it)';

  -- Idempotent: the server calls this on every sign-in.
  v_out := public.link_client_profile(current_setting('test.cl_person')::uuid, v_user);
  assert (v_out->>'ok')::boolean and (v_out->>'linked')::boolean is false,
    'signing in again is a no-op, not an error';
end $$;

-- Re-pointing a person at a DIFFERENT auth user is somebody taking over a file. Refused loudly.
do $$
declare
  v_other uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (v_other, 'authenticated', 'authenticated', 'cl2-' || v_other || '@test.local', '{}');

  perform pg_temp.cl_expect(
    format('select public.link_client_profile(%L::uuid, %L::uuid)', current_setting('test.cl_person'), v_other),
    'person_already_linked');
end $$;

-- ---------------------------------------------------------------------------
-- 6 · THE DOOR IS NOT OPEN TO THE INTERNET
-- ---------------------------------------------------------------------------

-- All three are server-only: the web app calls them with the service-role key from a Server Action, which is
-- where the per-IP throttle lives. Reachable by anon, request_client_login_code is an unauthenticated SMS
-- trigger published on the internet.
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.cl_expect(
  $q$select public.request_client_login_code('+21694000000')$q$,
  'permission denied for function request_client_login_code');
select pg_temp.cl_expect(
  $q$select public.verify_client_login_code('+21694000000', '123456')$q$,
  'permission denied for function verify_client_login_code');
reset role;

-- And a signed-in session — staff or client — cannot read the live codes table.
do $$
declare
  v_admin uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (v_admin, 'authenticated', 'authenticated', 'cl-adm-' || v_admin || '@test.local', '{"full_name":"Admin"}');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  perform set_config('test.cl_admin', v_admin::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cl_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  -- RLS is on with no policies, so even an admin session selects nothing. A table of live one-time codes
  -- that any authenticated session could read is the whole attack.
  assert (select count(*) from public.client_login_codes) = 0,
    'not even an admin session can read the live codes — RLS is on and there is no policy, on purpose';
end $$;

reset role;
