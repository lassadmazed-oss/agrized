-- كلمة السرّ متاع الحريف — the SMS becomes a one-time event.
-- Migration supabase/migrations/0108_client_password.sql.
--
-- Runs against the live database inside a rolled-back transaction: two persons on unused phone numbers,
-- three more unused numbers as targets, and every setting it measures pinned inside the transaction. Every
-- assertion is scoped to those fixtures, so real traffic can neither hide a failure nor cause one.
--
-- WHAT THIS FILE IS FOR. 0108 changes the shape of two functions and adds five; the interesting assertions
-- are the ones about what must NOT be possible:
--
--   1 · IS THERE EXACTLY ONE OF EACH?     the one-arg overloads are gone — two overloads broke reservations once.
--   2 · CAN A CODE CROSS PURPOSES?        a login code must not reset a password, a reset code must not log in,
--                                         a phone-change code must do neither, and confirm must not take a login code.
--   3 · IS THE RESET AN ORACLE?           a number with no password is answered ok and gets nothing — and IS THE
--                                         LOGIN ONE: a number WITH a password is answered ok and gets nothing either
--                                         (the SMS is sent once); and «no live code» is the same answer as «wrong».
--   4 · IS THE PHONE CHANGE AN ORACLE?    a number another person holds is answered ok and gets nothing; and when
--                                         it is free, confirm moves the number and the old one no longer resolves;
--                                         and the SMS cannon is shut on both sides — per new number AND per person.
--   5 · IS THE PASSWORD BRUTE-FORCEABLE?  the limit trips at the ceiling, names retry_after_seconds, and prunes.
--   6 · DOES EVERY SMS FIT?               both new templates in one segment at the worst case.
--   7 · IS IT ON THE INTERNET?            anon and authenticated refused by the GRANT on every new function.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'persons' and column_name = 'password_set_at') then
    raise exception
      'supabase/migrations/0108_client_password.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0108_client_password.sql supabase/tests/066_client_password.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers and fixtures
-- ---------------------------------------------------------------------------

create function pg_temp.cp_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- The code as the CLIENT receives it, dug out of the SMS that went to p_phone and matched against the live
-- hash of that purpose — 063's helper, with the purpose added. `now()` is fixed for the transaction, so
-- «the newest row» is not a question this file can ask; «which message carries a code that works now» is.
create function pg_temp.cp_code(p_phone text, p_purpose text) returns text language sql as $$
  select (regexp_match(o.body, '([0-9]{6})'))[1]
  from public.notification_outbox o
  join public.client_login_codes c
    on coalesce(c.target_phone, c.phone_e164) = o.to_phone_e164
   and c.purpose = p_purpose
   and c.consumed_at is null
   and extensions.crypt((regexp_match(o.body, '([0-9]{6})'))[1], c.code_hash) = c.code_hash
  where o.to_phone_e164 = p_phone
  limit 1
$$;

-- Messages queued to a number, by what they are about.
create function pg_temp.cp_sent(p_phone text, p_entity text) returns integer language sql as $$
  select count(*)::integer from public.notification_outbox o
  where o.to_phone_e164 = p_phone and o.related_entity = p_entity
$$;

do $$
declare
  v_phone text;
  i       integer;
  v_used  text[] := '{}';
begin
  for i in 1..5 loop
    loop
      v_phone := '+21694' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not (v_phone = any (v_used))
        and not exists (select 1 from public.persons p where p.phone_e164 = v_phone)
        and not exists (select 1 from public.notification_outbox o where o.to_phone_e164 = v_phone)
        and not exists (select 1 from public.client_login_codes c where coalesce(c.target_phone, c.phone_e164) = v_phone);
    end loop;
    v_used := v_used || v_phone;
    perform set_config('test.cp_phone_' || i, v_phone, true);
  end loop;
end $$;

do $$
declare
  v_status uuid;
  v_id     uuid;
begin
  -- Pinned so the file reads its own inputs.
  update public.settings set value = to_jsonb(300) where key = 'auth.client_code_ttl_seconds';
  update public.settings set value = to_jsonb(3)   where key = 'auth.client_code_max_attempts';
  update public.settings set value = to_jsonb(0)   where key = 'auth.client_code_cooldown_seconds';
  update public.settings set value = to_jsonb(50)  where key = 'auth.client_code_max_per_hour';
  update public.settings set value = to_jsonb(3)   where key = 'auth.client_password_max_per_15min';
  update public.settings set value = to_jsonb(8)   where key = 'auth.client_password_min_length';

  select s.id into v_status from public.lead_statuses s
  where s.is_active order by s.is_stage_default desc, s.sort_order limit 1;

  -- Person A: the one who signs up, chooses a password, forgets it, and changes their number.
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at)
  values ('حريف كلمة السرّ', current_setting('test.cp_phone_1'), 34, v_status, now())
  returning id into v_id;
  perform set_config('test.cp_person', v_id::text, true);

  -- Person B: holds phone_2, and never does anything. Their number is the one A must not be able to take.
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at)
  values ('حريف ثاني', current_setting('test.cp_phone_2'), 34, v_status, now())
  returning id into v_id;
  perform set_config('test.cp_other', v_id::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · EXACTLY ONE OVERLOAD OF EACH — the old signatures are gone
-- ---------------------------------------------------------------------------

do $$
declare
  v_name text;
  v_n    integer;
  v_args text;
begin
  foreach v_name in array array['request_client_login_code', 'verify_client_login_code'] loop
    select count(*), string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
      into v_n, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    assert v_n = 1,
      format('public.%s must have exactly ONE overload (PostgREST refuses an ambiguous call; two overloads broke reservations once), found %s: %s', v_name, v_n, v_args);
  end loop;

  -- pg_get_function_ARGUMENTS, not _identity_arguments: only the former prints the DEFAULT.
  select pg_get_function_arguments(p.oid) into v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'request_client_login_code';
  assert v_args like '%p_purpose text DEFAULT%',
    'request_client_login_code takes p_purpose with a default, so the existing named-parameter callers keep working: ' || v_args;

  select pg_get_function_arguments(p.oid) into v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'verify_client_login_code';
  assert v_args like '%p_purpose text DEFAULT%',
    'verify_client_login_code takes p_purpose with a default: ' || v_args;

  -- And 0096's callers, positional and one-arg, still resolve.
  assert (public.request_client_login_code(current_setting('test.cp_phone_4'))->>'ok')::boolean,
    'a one-arg positional call still resolves to the login purpose';
  assert public.verify_client_login_code(current_setting('test.cp_phone_4'), '123456')->>'reason' = 'invalid_code',
    'a two-arg positional verify still resolves';
end $$;

-- The schema the rest of this file relies on.
do $$
begin
  assert (select count(*) from public.client_login_codes c where c.purpose is null) = 0,
    'every existing code row is a login code — the default filled the column';
  assert exists (select 1 from pg_constraint where conname = 'client_login_codes_purpose_check'),
    'purpose is constrained to login | reset | phone_change';
  assert exists (select 1 from pg_constraint where conname = 'client_login_codes_target_check'),
    'target_phone is present exactly when the purpose is phone_change';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'client_login_codes_recipient_idx'),
    'the cooldown and the ceiling probe an index on the recipient, not a sequential scan';

  -- The settings, with the shape the Back Office page expects.
  assert (select count(*) from public.settings
          where key in ('auth.client_password_min_length', 'auth.client_password_max_per_15min',
                        'auth.client_reset_sms', 'auth.client_phone_change_sms')
            and group_key = 'auth' and is_public = false and label_ar <> '' and description_ar <> '') = 4,
    'the four new settings are seeded under auth, private, labelled and described';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · A CODE IS FOR ONE PURPOSE
-- ---------------------------------------------------------------------------

-- First, person A becomes an account the way the first-time flow does it: a login code, verified, linked,
-- and a password chosen. Every later section stands on this.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_code text;
  v_out  jsonb;
begin
  v_out := public.request_client_login_code(current_setting('test.cp_phone_1'), 'login');
  assert (v_out->>'ok')::boolean and (v_out->>'ttl_seconds')::integer = 300, 'a login code is issued: ' || v_out::text;
  assert pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_login') = 1, 'and one login SMS is queued';

  v_code := pg_temp.cp_code(current_setting('test.cp_phone_1'), 'login');
  assert v_code ~ '^[0-9]{6}$', 'the message carries a six digit code';

  -- CROSS-PURPOSE, the first way: a login code offered to the reset flow.
  v_out := public.verify_client_login_code(current_setting('test.cp_phone_1'), v_code, 'reset');
  assert v_out->>'reason' = 'invalid_code' and not (v_out ? 'attempts_left'),
    'a LOGIN code cannot verify as a RESET code — the reset flow sees no code at all and says nothing more than «wrong», got ' || v_out::text;
  assert v_out = public.verify_client_login_code(current_setting('test.cp_phone_5'), '000000', 'reset'),
    'and «no live code for this number» is BYTE-IDENTICAL to the answer a number nobody holds gets — otherwise verify tells a stranger which numbers just asked for a code';
  -- And the failed cross-purpose check cost the login code nothing: it was never looked at.
  assert (select c.attempts from public.client_login_codes c
          where c.person_id = current_setting('test.cp_person')::uuid and c.purpose = 'login' and c.consumed_at is null) = 0,
    'the login code was not even touched by the reset flow';

  -- CROSS-PURPOSE, the second way: a login code offered to confirm_phone_change.
  v_out := public.confirm_phone_change(current_setting('test.cp_person')::uuid, v_code);
  assert v_out->>'reason' = 'invalid_code' and not (v_out ? 'attempts_left'),
    'a LOGIN code cannot confirm a PHONE CHANGE, got ' || v_out::text;

  -- The right purpose works.
  v_out := public.verify_client_login_code(current_setting('test.cp_phone_1'), v_code, 'login');
  assert (v_out->>'ok')::boolean and (v_out->>'person_id')::uuid = current_setting('test.cp_person')::uuid,
    'the login code verifies as a login code: ' || v_out::text;

  -- Linked, as signInWithCode does it, then the password is recorded — but NOT before the link.
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (v_user, 'authenticated', 'authenticated', v_user || '@client.agrized.invalid', '{"full_name":"حريف"}');
  perform set_config('test.cp_user', v_user::text, true);

  perform pg_temp.cp_expect(
    format('select public.mark_password_set(%L::uuid)', current_setting('test.cp_person')),
    'person_not_linked');

  perform public.link_client_profile(current_setting('test.cp_person')::uuid, v_user);

  assert (select p.password_set_at from public.persons p where p.id = current_setting('test.cp_person')::uuid) is null,
    'linking by code does NOT mean a password exists — the screen must still insist on one';

  v_out := public.mark_password_set(current_setting('test.cp_person')::uuid);
  assert (v_out->>'ok')::boolean and (v_out->>'password_set_at') is not null, 'the password is recorded: ' || v_out::text;
  assert (select p.password_set_at from public.persons p where p.id = current_setting('test.cp_person')::uuid) is not null,
    'and persons.password_set_at is now set';

  -- Idempotent: a second call (a later password change) is not an error.
  v_out := public.mark_password_set(current_setting('test.cp_person')::uuid);
  assert (v_out->>'ok')::boolean, 'marking again is a no-op, not an error';

  -- Nobody who is not a person.
  perform pg_temp.cp_expect(format('select public.mark_password_set(%L::uuid)', gen_random_uuid()), 'invalid_person');
end $$;

-- A reset code cannot log anybody in, and only verifies as a reset.
do $$
declare
  v_code text;
  v_out  jsonb;
begin
  v_out := public.request_client_login_code(current_setting('test.cp_phone_1'), 'reset');
  assert (v_out->>'ok')::boolean, 'a reset code is issued to a client with a password: ' || v_out::text;
  assert pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_reset') = 1, 'one reset SMS is queued';

  v_code := pg_temp.cp_code(current_setting('test.cp_phone_1'), 'reset');
  assert v_code ~ '^[0-9]{6}$', 'the reset message carries a six digit code';

  v_out := public.verify_client_login_code(current_setting('test.cp_phone_1'), v_code, 'login');
  assert v_out->>'reason' = 'invalid_code' and not (v_out ? 'attempts_left'),
    'a RESET code cannot verify as a LOGIN code, got ' || v_out::text;
  v_out := public.verify_client_login_code(current_setting('test.cp_phone_1'), v_code);
  assert v_out->>'reason' = 'invalid_code' and not (v_out ? 'attempts_left'),
    'nor through the default purpose, which is login, got ' || v_out::text;

  v_out := public.verify_client_login_code(current_setting('test.cp_phone_1'), v_code, 'reset');
  assert (v_out->>'ok')::boolean, 'the reset code verifies as a reset: ' || v_out::text;
  v_out := public.verify_client_login_code(current_setting('test.cp_phone_1'), v_code, 'reset');
  assert (v_out->>'ok')::boolean is false, 'and only once';

  -- A purpose that is not a purpose is a caller bug, said loudly, on both functions.
  perform pg_temp.cp_expect(
    format('select public.request_client_login_code(%L, %L)', current_setting('test.cp_phone_1'), 'phone_change'),
    'invalid_purpose');
  perform pg_temp.cp_expect(
    format('select public.verify_client_login_code(%L, %L, %L)', current_setting('test.cp_phone_1'), '123456', 'phone_change'),
    'invalid_purpose');
end $$;

-- Each purpose keeps its own live code: asking for a reset retires the previous RESET code and nothing else.
-- (A live login code cannot sit beside a live reset code any more — a login code goes only to a person with
-- no password and a reset code only to one with a password — so the neighbour that must survive is the
-- phone-change code.)
do $$
begin
  perform public.request_client_login_code(current_setting('test.cp_phone_1'), 'reset');
  perform public.request_phone_change_code(current_setting('test.cp_person')::uuid, current_setting('test.cp_phone_4'));
  assert (select count(*) from public.client_login_codes c
          where c.person_id = current_setting('test.cp_person')::uuid and c.consumed_at is null and c.purpose = 'reset') = 1
     and (select count(*) from public.client_login_codes c
          where c.person_id = current_setting('test.cp_person')::uuid and c.consumed_at is null and c.purpose = 'phone_change') = 1,
    'one live reset code and one live phone-change code coexist';

  perform public.request_client_login_code(current_setting('test.cp_phone_1'), 'reset');
  assert (select count(*) from public.client_login_codes c
          where c.person_id = current_setting('test.cp_person')::uuid and c.consumed_at is null and c.purpose = 'reset') = 1,
    'asking for a second reset retires the first — still exactly one live';
  assert (select count(*) from public.client_login_codes c
          where c.person_id = current_setting('test.cp_person')::uuid and c.consumed_at is null and c.purpose = 'phone_change') = 1,
    'and the live phone-change code was left alone';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · THE RESET IS NOT AN ORACLE — no password, same answer, nothing sent — AND NEITHER IS THE LOGIN
-- ---------------------------------------------------------------------------

do $$
declare
  v_with    jsonb;
  v_without jsonb;
  v_unknown jsonb;
begin
  -- Person B has no profile_id and no password.
  v_without := public.request_client_login_code(current_setting('test.cp_phone_2'), 'reset');
  v_with    := public.request_client_login_code(current_setting('test.cp_phone_1'), 'reset');
  v_unknown := public.request_client_login_code(current_setting('test.cp_phone_3'), 'reset');

  assert v_without = v_with and v_with = v_unknown,
    'a reset for a client with a password, one without, and a number nobody holds are answered IDENTICALLY — otherwise «forgot password» tells a stranger who finished signing up. with=' || v_with::text || ' without=' || v_without::text || ' unknown=' || v_unknown::text;

  assert pg_temp.cp_sent(current_setting('test.cp_phone_2'), 'client_reset') = 0,
    'no reset SMS goes to a client who has no password to reset';
  assert (select count(*) from public.client_login_codes c where c.person_id = current_setting('test.cp_other')::uuid) = 0,
    'and no code row is written for them';
  assert pg_temp.cp_sent(current_setting('test.cp_phone_3'), 'client_reset') = 0,
    'nor to a number that belongs to nobody';
end $$;

-- «SMS ONCE». Person A has a password now: a LOGIN code asked for their number is answered exactly like one
-- asked for a number nobody holds, and nothing is queued — their door is the password, and a forgotten one
-- is the reset flow. Otherwise the login code would be a second door beside the password, open to anybody
-- who could read the SMS.
do $$
declare
  v_with    jsonb;
  v_unknown jsonb;
  v_before  integer := pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_login');
  v_live    integer := (select count(*) from public.client_login_codes c
                        where c.person_id = current_setting('test.cp_person')::uuid and c.consumed_at is null);
begin
  v_with    := public.request_client_login_code(current_setting('test.cp_phone_1'), 'login');
  v_unknown := public.request_client_login_code(current_setting('test.cp_phone_3'), 'login');

  assert v_with = v_unknown,
    'a login code asked for a client WITH a password and for a number nobody holds are answered IDENTICALLY. with=' || v_with::text || ' unknown=' || v_unknown::text;
  assert (v_with->>'ok')::boolean and (v_with->>'ttl_seconds')::integer = 300, 'and the answer is the usual one';
  assert pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_login') = v_before,
    'NO login SMS goes to a client who already has a password — the SMS is sent once';
  assert (select count(*) from public.client_login_codes c
          where c.person_id = current_setting('test.cp_person')::uuid and c.purpose = 'login' and c.consumed_at is null) = 0,
    'and no login code row is written for them';
  assert (select count(*) from public.client_login_codes c
          where c.person_id = current_setting('test.cp_person')::uuid and c.consumed_at is null) = v_live,
    'and their live reset and phone-change codes were not touched by the refused login request';
end $$;

-- ---------------------------------------------------------------------------
-- 4 · THE PHONE CHANGE — not an oracle; and when free, the number moves
-- ---------------------------------------------------------------------------

do $$
declare
  v_taken jsonb;
  v_free  jsonb;
  v_out   jsonb;
begin
  -- Named, because they are about the caller's own typing.
  v_out := public.request_phone_change_code(current_setting('test.cp_person')::uuid, '0612345');
  assert v_out->>'reason' = 'invalid_phone', 'a malformed new number is named, got ' || v_out::text;
  v_out := public.request_phone_change_code(current_setting('test.cp_person')::uuid, current_setting('test.cp_phone_1'));
  assert v_out->>'reason' = 'same_phone', 'the number the client already has is named, got ' || v_out::text;
  perform pg_temp.cp_expect(
    format('select public.request_phone_change_code(%L::uuid, %L)', gen_random_uuid(), current_setting('test.cp_phone_3')),
    'invalid_person');

  -- THE ORACLE TEST: B's number versus a free one.
  v_taken := public.request_phone_change_code(current_setting('test.cp_person')::uuid, current_setting('test.cp_phone_2'));
  v_free  := public.request_phone_change_code(current_setting('test.cp_person')::uuid, current_setting('test.cp_phone_3'));

  assert v_taken = v_free,
    'a number another person holds and a free one are answered IDENTICALLY — otherwise a signed-in client can walk the phone book. taken=' || v_taken::text || ' free=' || v_free::text;
  assert (v_free->>'ok')::boolean and (v_free->>'ttl_seconds')::integer = 300, 'and the answer is the usual one';

  assert pg_temp.cp_sent(current_setting('test.cp_phone_2'), 'client_phone_change') = 0,
    'NOTHING is sent to the number somebody else holds';
  assert (select count(*) from public.client_login_codes c where c.target_phone = current_setting('test.cp_phone_2')) = 0,
    'and no code row names it';

  assert pg_temp.cp_sent(current_setting('test.cp_phone_3'), 'client_phone_change') = 1,
    'one change SMS went to the FREE new number';
  assert (select count(*) from public.client_login_codes c
          where c.person_id = current_setting('test.cp_person')::uuid and c.purpose = 'phone_change' and c.consumed_at is null
            and c.target_phone = current_setting('test.cp_phone_3') and c.phone_e164 = current_setting('test.cp_phone_1')) = 1,
    'the row says who asked (phone_e164 = the current number) and where the code went (target_phone)';
end $$;

-- A phone-change code cannot log in or reset — and the wrong code, then the right one, then confirm moves
-- the number.
do $$
declare
  v_code text := pg_temp.cp_code(current_setting('test.cp_phone_3'), 'phone_change');
  v_out  jsonb;
begin
  assert v_code ~ '^[0-9]{6}$', 'the change message carries a six digit code';

  -- CROSS-PURPOSE, the third way. The change code went to phone_3; try it there and on the old number.
  v_out := public.verify_client_login_code(current_setting('test.cp_phone_3'), v_code, 'login');
  assert v_out->>'reason' = 'invalid_code' and not (v_out ? 'attempts_left'),
    'a PHONE-CHANGE code cannot log in from the new number, got ' || v_out::text;
  v_out := public.verify_client_login_code(current_setting('test.cp_phone_1'), v_code, 'login');
  assert (v_out->>'ok')::boolean is false, 'nor from the old one, got ' || v_out::text;
  v_out := public.verify_client_login_code(current_setting('test.cp_phone_1'), v_code, 'reset');
  assert (v_out->>'ok')::boolean is false, 'and it cannot reset a password, got ' || v_out::text;

  -- Attempts are counted on the change code too (max pinned at 3).
  v_out := public.confirm_phone_change(current_setting('test.cp_person')::uuid, '000000');
  assert v_out->>'reason' = 'invalid_code' and (v_out->>'attempts_left')::integer = 2,
    'a wrong change code is refused and counted, got ' || v_out::text;

  -- The right one: the number moves.
  v_out := public.confirm_phone_change(current_setting('test.cp_person')::uuid, v_code);
  assert (v_out->>'ok')::boolean and v_out->>'phone_e164' = current_setting('test.cp_phone_3'),
    'the right code moves the number, got ' || v_out::text;
  assert (select p.phone_e164 from public.persons p where p.id = current_setting('test.cp_person')::uuid)
         = current_setting('test.cp_phone_3'),
    'persons.phone_e164 is now the new number';

  -- One-time.
  v_out := public.confirm_phone_change(current_setting('test.cp_person')::uuid, v_code);
  assert v_out->>'reason' = 'invalid_code' and not (v_out ? 'attempts_left'),
    'the change code is spent, and «spent» is the same answer as «wrong», got ' || v_out::text;
end $$;

-- THE OLD NUMBER NO LONGER RESOLVES, and the new one does.
do $$
declare
  v_before integer := pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_login');
  v_out    jsonb;
begin
  v_out := public.request_client_login_code(current_setting('test.cp_phone_1'), 'login');
  assert (v_out->>'ok')::boolean, 'the old number is still answered ok (the identical answer)';
  assert pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_login') = v_before,
    'but nothing is sent to it any more — it belongs to nobody';

  -- A has a password, so the code that proves the new number resolves is a RESET code (a login code would be
  -- refused silently — «SMS once», section 3).
  perform public.request_client_login_code(current_setting('test.cp_phone_3'), 'reset');
  assert pg_temp.cp_sent(current_setting('test.cp_phone_3'), 'client_reset') = 1,
    'and a reset code now goes to the new number';
  assert (public.verify_client_login_code(current_setting('test.cp_phone_3'),
            pg_temp.cp_code(current_setting('test.cp_phone_3'), 'reset'), 'reset')->>'person_id')::uuid
         = current_setting('test.cp_person')::uuid,
    'which resolves to the same person';

  -- The password survives the move: it belongs to the auth user, not to the number.
  assert (select p.password_set_at from public.persons p where p.id = current_setting('test.cp_person')::uuid) is not null,
    'password_set_at is untouched by a phone change';
end $$;

-- THE ONE ACCEPTED LEAK: the number was free when asked, taken by the time of confirming.
do $$
declare
  v_status uuid;
  v_code   text;
  v_out    jsonb;
begin
  perform public.request_phone_change_code(current_setting('test.cp_person')::uuid, current_setting('test.cp_phone_4'));
  v_code := pg_temp.cp_code(current_setting('test.cp_phone_4'), 'phone_change');
  assert v_code ~ '^[0-9]{6}$', 'a change code went to the free phone_4';

  -- Meanwhile, an intake registers phone_4 to somebody else.
  select s.id into v_status from public.lead_statuses s
  where s.is_active order by s.is_stage_default desc, s.sort_order limit 1;
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at)
  values ('حريف سبق', current_setting('test.cp_phone_4'), 34, v_status, now());

  v_out := public.confirm_phone_change(current_setting('test.cp_person')::uuid, v_code);
  assert v_out->>'reason' = 'phone_taken', 'the race is named phone_taken, got ' || v_out::text;
  assert (select p.phone_e164 from public.persons p where p.id = current_setting('test.cp_person')::uuid)
         = current_setting('test.cp_phone_3'),
    'and the number did not move';
  -- The code was spent by the attempt: the answer cannot be polled on the same code.
  v_out := public.confirm_phone_change(current_setting('test.cp_person')::uuid, v_code);
  assert v_out->>'reason' = 'invalid_code' and not (v_out ? 'attempts_left'),
    'the code that met phone_taken is spent, got ' || v_out::text;
end $$;

-- The change code's hourly ceiling is counted TWICE: on the NEW number — the one that would receive the SMS —
-- and on the PERSON asking, so that a signed-in client cannot make AgriZed message a different number every
-- minute. A moves BACK to phone_1, which is free again since the move, with the ceiling pinned at one.
do $$
declare
  v_before integer;
  v_first  jsonb;
  v_second jsonb;
  v_third  jsonb;
  v_other  jsonb;
begin
  -- AGE EVERYTHING ALREADY SENT TO phone_1 AND EVERYTHING A ALREADY ASKED FOR (063's trick): `now()` is fixed
  -- for the transaction, so every code issued above reads as «this instant» and would fill both ceilings
  -- before the test starts.
  update public.client_login_codes set created_at = now() - interval '1 hour'
   where coalesce(target_phone, phone_e164) = current_setting('test.cp_phone_1')
      or (person_id = current_setting('test.cp_person')::uuid and purpose = 'phone_change');
  update public.settings set value = to_jsonb(1) where key = 'auth.client_code_max_per_hour';

  v_before := pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_phone_change');
  v_first  := public.request_phone_change_code(current_setting('test.cp_person')::uuid, current_setting('test.cp_phone_1'));
  v_second := public.request_phone_change_code(current_setting('test.cp_person')::uuid, current_setting('test.cp_phone_1'));

  assert v_first = v_second,
    'the request over the ceiling is answered exactly like the one that sent';
  assert pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_phone_change') - v_before = 1,
    'but only ONE change SMS went to the new number, got ' ||
    (pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_phone_change') - v_before);

  -- PER PERSON: phone_5 has never received anything, so the number's own ceiling is not the reason — A is.
  v_third := public.request_phone_change_code(current_setting('test.cp_person')::uuid, current_setting('test.cp_phone_5'));
  assert v_third = v_first,
    'a person over THEIR ceiling is answered exactly like one who just sent, got ' || v_third::text;
  assert pg_temp.cp_sent(current_setting('test.cp_phone_5'), 'client_phone_change') = 0,
    'and NOTHING goes to the third number — one signed-in client is not an SMS cannon aimed at the phone book';
  assert (select count(*) from public.client_login_codes c where c.target_phone = current_setting('test.cp_phone_5')) = 0,
    'and no code row names it';

  -- PER NUMBER, on its own: B has asked for nothing this hour, but phone_1 has just received a code, so B is
  -- refused on the number's ceiling alone.
  v_other := public.request_phone_change_code(current_setting('test.cp_other')::uuid, current_setting('test.cp_phone_1'));
  assert v_other = v_first, 'the number''s own ceiling still holds for a different person, got ' || v_other::text;
  assert pg_temp.cp_sent(current_setting('test.cp_phone_1'), 'client_phone_change') - v_before = 1,
    'and phone_1 still received exactly one change SMS this hour';
  assert (select count(*) from public.client_login_codes c where c.person_id = current_setting('test.cp_other')::uuid) = 0,
    'and no code row was written for B';

  update public.settings set value = to_jsonb(50) where key = 'auth.client_code_max_per_hour';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · THE PASSWORD LIMIT — charged on every attempt, trips at the ceiling, prunes
-- ---------------------------------------------------------------------------

do $$
declare
  v_phone text := current_setting('test.cp_phone_3');
  v_key   text := md5(v_phone);
  v_out   jsonb;
  i       integer;
begin
  -- A row from long ago, to be pruned by the first charge.
  insert into app.submission_throttle (kind, key_hash, created_at)
  values ('client:password', v_key, now() - interval '2 hours');

  -- Blank: charged nothing, answered ok.
  v_out := public.client_password_attempt('');
  assert (v_out->>'ok')::boolean, 'a blank phone is answered ok and keys nothing';
  v_out := public.client_password_attempt(null);
  assert (v_out->>'ok')::boolean, 'null too';

  -- The ceiling is pinned at 3. Three attempts pass — and NOTHING about whether a password was right or wrong
  -- enters into it: this function is called before any credential is checked.
  for i in 1..3 loop
    v_out := public.client_password_attempt(v_phone);
    assert (v_out->>'ok')::boolean, format('attempt %s of 3 is allowed, got %s', i, v_out::text);
  end loop;

  assert (select count(*) from app.submission_throttle t
          where t.kind = 'client:password' and t.key_hash = v_key and t.created_at < now() - interval '1 hour') = 0,
    'the two-hour-old row was pruned by the first charge';
  assert (select count(*) from app.submission_throttle t
          where t.kind = 'client:password' and t.key_hash = v_key) = 3,
    'three charges stand';
  assert not exists (select 1 from app.submission_throttle t where t.kind = 'client:password' and t.key_hash = v_phone),
    'the number itself is never written to the throttle — only its md5';

  -- The fourth trips it and says when to come back.
  v_out := public.client_password_attempt(v_phone);
  assert (v_out->>'ok')::boolean is false and v_out->>'reason' = 'too_many',
    'the attempt over the ceiling is refused as too_many, got ' || v_out::text;
  assert (v_out->>'retry_after_seconds')::integer between 1 and 900,
    'and tells the caller how long to wait, within the fifteen-minute window, got ' || v_out::text;

  -- Refused attempts are not charged: the count does not grow past the ceiling.
  assert (select count(*) from app.submission_throttle t
          where t.kind = 'client:password' and t.key_hash = v_key) = 3,
    'a refused attempt adds no row';

  -- Another number is unaffected: the limit is per number.
  v_out := public.client_password_attempt(current_setting('test.cp_phone_2'));
  assert (v_out->>'ok')::boolean, 'a different number has its own budget';

  -- Sixteen minutes later, the budget is back.
  update app.submission_throttle set created_at = now() - interval '16 minutes'
   where kind = 'client:password' and key_hash = v_key;
  v_out := public.client_password_attempt(v_phone);
  assert (v_out->>'ok')::boolean, 'after the window the number may try again, got ' || v_out::text;
end $$;

-- The policy reads the setting.
do $$
begin
  assert (public.client_password_policy()->>'min_length')::integer = 8, 'min_length comes from the setting';
  update public.settings set value = to_jsonb(12) where key = 'auth.client_password_min_length';
  assert (public.client_password_policy()->>'min_length')::integer = 12, 'and follows it when it changes';
  update public.settings set value = to_jsonb(2) where key = 'auth.client_password_min_length';
  assert (public.client_password_policy()->>'min_length')::integer = 6,
    'but never below Supabase Auth''s own minimum, or the screen would accept what Auth refuses';
end $$;

-- ---------------------------------------------------------------------------
-- 6 · ONE SMS, NOT TWO — every template this file introduced, at the worst case
-- ---------------------------------------------------------------------------

do $$
declare
  v_key  text;
  v_body text;
begin
  foreach v_key in array array['auth.client_login_sms', 'auth.client_reset_sms', 'auth.client_phone_change_sms'] loop
    v_body := replace(replace(app.setting_text(v_key, ''), '{code}', '516548'), '{minutes}', '120');
    assert v_body <> '', v_key || ' is seeded';
    assert char_length(v_body) <= 70,
      format('%s renders to %s characters; an Arabic SMS is UCS-2 and holds 70, so this is sent as %s messages: «%s»',
             v_key, char_length(v_body), ceil(char_length(v_body) / 67.0)::integer, v_body);
    assert v_body !~ '\{[a-z_]+\}',
      format('%s leaves a placeholder unfilled: «%s»', v_key, v_body);
    assert v_body like '%516548%', v_key || ' actually prints the code';
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7 · THE DOOR IS NOT OPEN TO THE INTERNET
-- ---------------------------------------------------------------------------

-- Every function this file created or re-created is server-only: the Server Actions call them with the
-- service-role key and carry the per-IP throttle. Both anon and a signed-in session are refused by the GRANT.
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.cp_expect($q$select public.request_client_login_code('+21694000000', 'login')$q$,
  'permission denied for function request_client_login_code');
select pg_temp.cp_expect($q$select public.verify_client_login_code('+21694000000', '123456', 'login')$q$,
  'permission denied for function verify_client_login_code');
select pg_temp.cp_expect($q$select public.request_phone_change_code(gen_random_uuid(), '+21694000000')$q$,
  'permission denied for function request_phone_change_code');
select pg_temp.cp_expect($q$select public.confirm_phone_change(gen_random_uuid(), '123456')$q$,
  'permission denied for function confirm_phone_change');
select pg_temp.cp_expect($q$select public.mark_password_set(gen_random_uuid())$q$,
  'permission denied for function mark_password_set');
select pg_temp.cp_expect($q$select public.client_password_attempt('+21694000000')$q$,
  'permission denied for function client_password_attempt');
select pg_temp.cp_expect($q$select public.client_password_policy()$q$,
  'permission denied for function client_password_policy');
reset role;

-- A signed-in client — the very person — cannot call them either; the Server Action does, on their behalf.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.cp_user'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.cp_expect($q$select public.request_client_login_code('+21694000000', 'reset')$q$,
  'permission denied for function request_client_login_code');
select pg_temp.cp_expect($q$select public.verify_client_login_code('+21694000000', '123456', 'reset')$q$,
  'permission denied for function verify_client_login_code');
select pg_temp.cp_expect(format($q$select public.request_phone_change_code(%L::uuid, '+21694000000')$q$, current_setting('test.cp_person')),
  'permission denied for function request_phone_change_code');
select pg_temp.cp_expect(format($q$select public.confirm_phone_change(%L::uuid, '123456')$q$, current_setting('test.cp_person')),
  'permission denied for function confirm_phone_change');
select pg_temp.cp_expect(format($q$select public.mark_password_set(%L::uuid)$q$, current_setting('test.cp_person')),
  'permission denied for function mark_password_set');
select pg_temp.cp_expect($q$select public.client_password_attempt('+21694000000')$q$,
  'permission denied for function client_password_attempt');
select pg_temp.cp_expect($q$select public.client_password_policy()$q$,
  'permission denied for function client_password_policy');

do $$
begin
  -- And the codes table stays unreadable: RLS on, no policy, even for the person whose codes they are.
  assert (select count(*) from public.client_login_codes) = 0,
    'a signed-in client cannot read the live codes — RLS is on and there is no policy, on purpose';
end $$;

reset role;
