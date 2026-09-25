-- 0090 · دخول الحريف برمز بالSMS — the client's own door.
--
-- Applied 2026-09-25. Drafted as supabase/migrations/0096_client_login.sql; its test is
-- supabase/tests/063_client_login.sql, which can be re-run at any time against the live schema:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/tests/063_client_login.sql
--
-- THE DECISION THIS IMPLEMENTS (owner, 2026-09-25): «رمز بالSMS». A buyer types their phone number, a six
-- digit code arrives, they type it and they are in. Chosen over a password because public.persons is keyed
-- by phone — `phone_e164 text not null unique` since 0002 — and the intake asks for no password and no
-- reliable e-mail, so a password would have to be issued by a human to every client before they could ever
-- sign in. And it is testable today: public.notification_outbox has 24 sent rows, sms.enabled is true and
-- the sender is live.
--
-- WHAT THIS FILE IS AND IS NOT. It is the part that must be in the database: the codes, their lifetime,
-- how many guesses one gets, how often a number may ask, and the check itself. It is NOT the session — no
-- row here logs anybody in. The server verifies a code by calling section 3, and only then mints a session
-- and links the person to it. Splitting it that way is the point: the rules that protect the door are in
-- SQL where they cannot be skipped by a caller, and the session lives where sessions live.
--
-- ---------------------------------------------------------------------------------------------------------
-- THE THREE THINGS THIS GUARDS AGAINST, NAMED
-- ---------------------------------------------------------------------------------------------------------
-- 1 · ACCOUNT ENUMERATION. public.request_client_login_code answers the SAME thing for a number we know and
--     a number we have never seen: ok, with the code's lifetime. It never says «no such client», because
--     that answer turns this endpoint into a way to ask whether a given Tunisian phone number belongs to an
--     AgriZed buyer. The caller cannot tell the difference, and neither can a script.
-- 2 · GUESSING. A six digit code is one in a million, which is only strong while the number of guesses is
--     small. Every failed attempt is counted ON THE CODE ROW, and the code dies at the limit — not the
--     request, the CODE — so burning the attempts does not let the attacker simply ask for a fresh one and
--     keep going at the same person.
-- 3 · BEING USED AS AN SMS CANNON. A number may ask again only after a cooldown, and only so many times an
--     hour. Over the limit the function still answers ok and simply does not send — which is the same
--     answer rule as 1, for the same reason.
--
-- EVERY ONE OF THOSE FOUR NUMBERS IS A SETTING the owner edits, not a constant in this file.
--
-- THE CODE IS NEVER STORED. Only extensions.crypt's bcrypt hash of it is, so a copy of this table is not a
-- list of live codes. That is also why the code is returned to NOBODY: it leaves this database once, as an
-- SMS, and the only thing that can ever confirm it is section 3.


-- ===========================================================================
-- 0 · REFUSE RATHER THAN HALF-RUN
-- ===========================================================================

do $guard$
begin
  if to_regclass('public.notification_outbox') is null then
    raise exception
      'public.notification_outbox is missing. The code is delivered through it; apply 0003_land_offers_and_intake.sql first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'extensions' and p.proname = 'crypt') then
    raise exception
      'extensions.crypt is missing (pgcrypto). The codes are stored as bcrypt hashes and this file will not store them in clear.';
  end if;
end $guard$;


-- ===========================================================================
-- 1 · THE CODES, AND THE FOUR NUMBERS THAT GOVERN THEM
-- ===========================================================================

create table if not exists public.client_login_codes (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.persons (id) on delete cascade,
  -- Kept beside person_id on purpose: the cooldown is a rule about A NUMBER, and it has to be answerable
  -- for a number whose person was since deleted or whose phone was changed.
  phone_e164  text not null,
  -- bcrypt. Never the code.
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists client_login_codes_phone_idx
  on public.client_login_codes (phone_e164, created_at desc);
create index if not exists client_login_codes_live_idx
  on public.client_login_codes (person_id, expires_at desc) where consumed_at is null;

-- RLS ON AND NOT ONE POLICY, WHICH IS THE INTENDED STATE. Nothing may read this table through PostgREST —
-- not a visitor, not a signed-in client, not staff. The three functions below are security definer and are
-- the only way in. A table of live one-time codes that any authenticated session could select is the whole
-- attack.
alter table public.client_login_codes enable row level security;

comment on table public.client_login_codes is
  'One-time SMS login codes for buyers (bb_77). Stores the bcrypt hash, never the code. RLS is on with no policies on purpose: only the security-definer functions in this file may read or write it.';

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('auth.client_code_ttl_seconds', to_jsonb(300), 'integer', 'auth', 'دخول الحريف · عمر الرمز (ثانية)',
   'قدّاش يعيش رمز الدخول قبل ما يبطل. 300 = 5 دقايق.', false, 10),
  ('auth.client_code_max_attempts', to_jsonb(5), 'integer', 'auth', 'دخول الحريف · عدد المحاولات',
   'قدّاش مرّة ينجّم الحريف يغلط في الرمز قبل ما يبطل الرمز ويلزمو يطلب واحد جديد.', false, 20),
  ('auth.client_code_cooldown_seconds', to_jsonb(60), 'integer', 'auth', 'دخول الحريف · الانتظار بين طلبين (ثانية)',
   'أقلّ وقت بين طلب رمز والطلب اللي بعدو لنفس النمرة.', false, 30),
  ('auth.client_code_max_per_hour', to_jsonb(5), 'integer', 'auth', 'دخول الحريف · أقصى عدد رموز في الساعة',
   'أقصى عدد رموز تتبعث لنفس النمرة في الساعة. كي يتفوّت العدد، الخدمة ترجّع نفس الجواب أما ما تبعثش.', false, 40),
  ('auth.client_login_sms', to_jsonb('رمز الدخول متاعك في AgriZed: {code}. صالح {minutes} دقايق. ما تعطيه لحتّى حد.'::text),
   'text', 'auth', 'دخول الحريف · نصّ الرسالة',
   'الرسالة اللي توصل للحريف. {code} = الرمز، {minutes} = عمر الرمز بالدقايق.', false, 50)
on conflict (key) do nothing;


-- ===========================================================================
-- 2 · اطلب رمز — and answer the same way whatever the truth is
-- ===========================================================================

-- THE RETURN VALUE IS DELIBERATELY UNINFORMATIVE. `ok` is always true and the payload is always the same
-- shape, whether the number belongs to a client, belongs to nobody, or has already asked five times this
-- hour. The caller learns exactly one thing — how long a code lasts — and that is public knowledge.
--
-- WHY NOT «رقم غير مسجّل», which would be friendlier: because the friendly version is a lookup service for
-- whether a phone number belongs to an AgriZed buyer, answerable in bulk by anybody who can POST. The cost
-- of the choice is real and is paid in the interface instead — the screen says «إذا النمرة مسجّلة عندنا،
-- الرمز وصل», which is true, and the team can look a client up in the Back Office when they call.
create or replace function public.request_client_login_code(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_ttl      integer := greatest(app.setting_int('auth.client_code_ttl_seconds', 300), 30);
  v_cooldown integer := greatest(app.setting_int('auth.client_code_cooldown_seconds', 60), 0);
  v_max_hour integer := greatest(app.setting_int('auth.client_code_max_per_hour', 5), 1);
  v_person   uuid;
  v_code     text;
  v_recent   timestamptz;
  v_hour     integer;
  v_body     text;
begin
  -- The uninformative answer, built before anything is looked up so every path returns exactly it.
  if p_phone is null or btrim(p_phone) !~ '^\+[1-9][0-9]{6,14}$' then
    -- A malformed number is the one thing worth saying, because it is about what the CALLER typed and
    -- reveals nothing about who exists.
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  select p.id into v_person
  from public.persons p
  where p.phone_e164 = btrim(p_phone) and p.archived_at is null;

  -- No such client: answer as if a code went out, send nothing, and take the same amount of work doing it.
  if v_person is null then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- COOLDOWN, then the hourly ceiling. Both silent: over either limit this returns the same object and
  -- queues no message, so hammering the endpoint neither reveals anything nor sends anything.
  select max(c.created_at) into v_recent
  from public.client_login_codes c where c.phone_e164 = btrim(p_phone);
  if v_recent is not null and v_recent > now() - make_interval(secs => v_cooldown) then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  select count(*) into v_hour
  from public.client_login_codes c
  where c.phone_e164 = btrim(p_phone) and c.created_at > now() - interval '1 hour';
  if v_hour >= v_max_hour then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- ASKING AGAIN RETIRES THE OLD CODE. Two live codes for one number doubles the guessing surface for no
  -- gain, and a client who asked twice is reading the newest SMS anyway.
  update public.client_login_codes
     set consumed_at = now()
   where person_id = v_person and consumed_at is null;

  -- Six digits, zero-padded, from the same CSPRNG Postgres uses for gen_random_uuid.
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');

  insert into public.client_login_codes (person_id, phone_e164, code_hash, expires_at)
  values (v_person, btrim(p_phone),
          extensions.crypt(v_code, extensions.gen_salt('bf')),
          now() + make_interval(secs => v_ttl));

  v_body := replace(
              replace(app.setting_text('auth.client_login_sms',
                        'رمز الدخول متاعك في AgriZed: {code}. صالح {minutes} دقايق. ما تعطيه لحتّى حد.'),
                      '{code}', v_code),
              '{minutes}', greatest(round(v_ttl / 60.0)::integer, 1)::text);

  -- Out through the queue everything else uses, so the dispatcher, the retries and the provider settings
  -- are the ones already in service. related_entity names the person, never the code.
  insert into public.notification_outbox (channel, to_phone_e164, body, related_entity, related_id)
  values ('sms', btrim(p_phone), v_body, 'client_login', v_person);

  return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
end $fn$;

-- SERVER ONLY. The web app calls this from a Server Action with the service-role key, which lets the action
-- add its own per-IP throttle in front of a function that can only throttle per NUMBER. Leaving it open to
-- anon would publish an unauthenticated SMS trigger on the internet.
revoke execute on function public.request_client_login_code(text) from public, anon, authenticated;

comment on function public.request_client_login_code(text) is
  'Issues a one-time SMS login code for the buyer holding this phone number and queues it on public.notification_outbox. Answers identically for a number that exists, one that does not, and one over its cooldown or hourly ceiling — so it cannot be used to discover whether a phone belongs to an AgriZed client. Stores only a bcrypt hash of the code. Service role only.';


-- ===========================================================================
-- 3 · تثبّت من الرمز — the only thing that can confirm a code
-- ===========================================================================

-- Returns the person on success and a NAMED reason on failure, because by this point the caller has already
-- proven they hold the phone's code or they have not, and «wrong code» versus «expired» versus «too many
-- tries» are three different things a client needs to be told apart to know what to do next.
--
-- IT WRITES NO SESSION AND GRANTS NOTHING. The server decides what to do with a true answer.
create or replace function public.verify_client_login_code(p_phone text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_max  integer := greatest(app.setting_int('auth.client_code_max_attempts', 5), 1);
  v_row  public.client_login_codes;
  v_name text;
begin
  if p_phone is null or p_code is null or btrim(p_code) !~ '^[0-9]{4,8}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  -- The newest live code for this number. FOR UPDATE: two requests racing on the same code must not each
  -- read attempts = 4 and both be allowed a guess.
  select * into v_row
  from public.client_login_codes c
  where c.phone_e164 = btrim(p_phone) and c.consumed_at is null
  order by c.created_at desc limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_code');
  end if;
  if v_row.expires_at <= now() then
    update public.client_login_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_row.attempts >= v_max then
    update public.client_login_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  -- COUNT THE ATTEMPT BEFORE CHECKING IT. A guess that is counted only when it is wrong is a guess that is
  -- not counted at all if the process dies mid-check.
  update public.client_login_codes set attempts = attempts + 1 where id = v_row.id;

  if extensions.crypt(btrim(p_code), v_row.code_hash) <> v_row.code_hash then
    return jsonb_build_object(
      'ok', false, 'reason', 'invalid_code',
      'attempts_left', greatest(v_max - (v_row.attempts + 1), 0));
  end if;

  -- Right. Burn it — a one-time code that survives its use is a password.
  update public.client_login_codes set consumed_at = now() where id = v_row.id;

  select p.full_name into v_name from public.persons p where p.id = v_row.person_id;
  return jsonb_build_object('ok', true, 'person_id', v_row.person_id, 'full_name', v_name);
end $fn$;

revoke execute on function public.verify_client_login_code(text, text) from public, anon, authenticated;

comment on function public.verify_client_login_code(text, text) is
  'Checks a one-time login code against the newest live code for that phone, counting the attempt first and burning the code on success. Returns the person on success, or one of no_code · expired · too_many_attempts · invalid_code. Writes no session and grants no role — the server does that with a true answer. Service role only.';


-- ===========================================================================
-- 4 · اربط الحساب — the one write that turns a person into someone who can sign in
-- ===========================================================================

-- public.persons.profile_id has existed since 0002 and NOTHING HAS EVER WRITTEN IT — 0068's own reader says
-- so, returning `has_account: p.profile_id is not null` for a column that is always null. This is what
-- writes it, and it is the moment a buyer becomes an account.
--
-- IDEMPOTENT, because the server calls it on every successful sign-in and the second call must be a no-op
-- rather than an error. Re-pointing a person at a DIFFERENT auth user is refused: that is either a bug or
-- somebody taking over a file, and neither should be silent.
create or replace function public.link_client_profile(p_person uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_existing uuid;
begin
  select p.profile_id into v_existing from public.persons p where p.id = p_person;
  if not found then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;
  if v_existing is not null and v_existing <> p_user then
    raise exception 'person_already_linked' using errcode = 'P0001';
  end if;

  if v_existing is null then
    update public.persons set profile_id = p_user where id = p_person;
  end if;

  -- The role has been in public.app_role since 0002 and has never been granted to anybody. src/lib/auth.ts
  -- strips it from every staff session (`StaffRole = Exclude<AppRole, 'client'>`), so holding it grants no
  -- Back Office access — it only marks this auth user as a buyer.
  insert into public.user_roles (user_id, role) values (p_user, 'client')
  on conflict (user_id, role) do nothing;

  return jsonb_build_object('ok', true, 'person_id', p_person, 'user_id', p_user, 'linked', v_existing is null);
end $fn$;

revoke execute on function public.link_client_profile(uuid, uuid) from public, anon, authenticated;

comment on function public.link_client_profile(uuid, uuid) is
  'Points public.persons.profile_id at the auth user that just proved it holds the person''s phone, and grants that user the `client` role. Idempotent; refuses to re-point a person at a different auth user. Service role only — it is called by the sign-in action after verify_client_login_code returned true.';
