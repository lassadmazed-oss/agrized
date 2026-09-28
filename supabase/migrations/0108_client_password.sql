-- 0108 · كلمة السرّ متاع الحريف — THE SMS BECOMES A ONE-TIME EVENT, AND A PASSWORD TAKES ITS PLACE.
--
-- Its test is supabase/tests/066_client_password.sql, which can be re-run at any time against the live
-- schema (it always rolls back):
--   node --env-file=.env scripts/db-dry-run.mjs \
--     supabase/migrations/0108_client_password.sql supabase/tests/066_client_password.sql
--
-- THE DECISION THIS IMPLEMENTS (owner, 2026-09-28). 0096 opened the client's door with a six digit code by
-- SMS on every visit. The owner now wants the SMS ONCE — at account creation, to prove the phone — and a
-- password of the client's own choosing after that; later sign-ins are phone + password with no message at
-- all; SMS is reserved for the three moments that deserve it: forgetting the password, changing the phone
-- number, and other sensitive actions; and every other device can be logged out from one.
--
-- WHAT THIS FILE IS AND IS NOT, in 0096's terms. The PASSWORD ITSELF IS NOT HERE. Supabase Auth stores it
-- (hashed, on auth.users) and checks it (signInWithPassword); nothing in public.* ever sees it, and this
-- file adds no column that could hold one. What has to be in the database is the part a caller must not be
-- able to skip: which code was issued for WHICH PURPOSE so a login code cannot double as a reset code, the
-- rate at which one phone number may be tried against a password, the fact that a person has chosen a
-- password at all (so the screen knows whether to insist on one), and the phone change — which is the one
-- write on public.persons.phone_e164 a client may ever cause, and so is gated on a code sent to the NEW
-- number and nothing else.
--
-- WHAT IT ADDS
--   · persons.password_set_at                    null = this client has not chosen a password yet
--   · client_login_codes.purpose, .target_phone  login | reset | phone_change; the new number, for the last
--   · request_client_login_code(text, text)      SAME function, now with a purpose — the one-arg overload is
--                                                DROPPED first, so exactly one signature exists
--   · verify_client_login_code(text, text, text) idem; a code only verifies for the purpose it was issued
--   · request_phone_change_code(uuid, text)      a code to the NEW phone, for a signed-in person
--   · confirm_phone_change(uuid, text)           the code, then the one write on persons.phone_e164
--   · mark_password_set(uuid)                    the fact, recorded after Auth has stored the password
--   · client_password_attempt(text)              the per-number limit on password sign-in, charged first
--   · client_password_policy()                   the minimum length, so the screen and the action agree
--   · four settings under auth.*, is_public false
--   · the zitounti.* words the client space reads and no migration had seeded yet (section 8)
--
-- ---------------------------------------------------------------------------------------------------------
-- THE RULES 0096 MADE STILL HOLD, AND TWO NEW ONES ARE NAMED
-- ---------------------------------------------------------------------------------------------------------
-- 1 · THE IDENTICAL ANSWER. request_client_login_code still says exactly one thing — ok, and how long a code
--     lives — to a number we know, a number we have never seen, a number over its limits, and now also to a
--     reset asked for a number that has no password to reset AND to a login asked for a number that already
--     has one (the SMS is sent once; a forgotten password is the reset flow). request_phone_change_code says
--     the same one thing to a new number that is free, to one another client already holds, and to a person
--     over their own hourly ceiling. Neither is a lookup service for whether a phone belongs to an AgriZed
--     buyer, and the interface pays for that as before: «إذا النمرة مسجّلة عندنا، الرمز وصل». And the two
--     verifiers answer «no live code», «expired» and «wrong» with one and the same object, invalid_code, so a
--     probe cannot tell a number holding a code from one holding none.
-- 2 · A CODE IS FOR ONE PURPOSE. A login code cannot reset a password and a reset code cannot log anybody
--     in, because the purpose is on the row and every reader filters on it. Without that, «forgot password»
--     would be the same thing as «log in», and a code somebody phished for one would serve for the other.
-- 3 · THE PASSWORD LIMIT IS CHARGED BEFORE THE PASSWORD IS CHECKED, on every attempt, whatever the outcome —
--     0103's ordering, for 0103's reason. A limit charged only on failure lets a script measure the timing;
--     a limit charged only for phones that exist is itself the oracle. And the Server Action prints ONE
--     sentence for a wrong phone, a phone with no password yet, and a wrong password: this function gives
--     it no second sentence to print, except «too many», which is a fact about the caller.
-- 4 · THE ONE ACCEPTED LEAK is confirm_phone_change's `phone_taken`, argued at the function.
-- 5 · SERVICE ROLE ONLY, all of it. The Server Actions add the per-IP layer SQL cannot have.


-- ===========================================================================
-- 0 · REFUSE RATHER THAN HALF-RUN
-- ===========================================================================

do $guard$
begin
  if to_regclass('public.client_login_codes') is null then
    raise exception
      'public.client_login_codes is missing. This file extends 0096''s door, it does not build one; apply supabase/migrations/0096_client_login.sql first.';
  end if;
  if to_regclass('app.submission_throttle') is null then
    raise exception
      'app.submission_throttle is missing. The password limit is counted in it and this file will not publish an unthrottled sign-in; apply supabase/migrations/0003_land_offers_and_intake.sql first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'link_client_profile') then
    raise exception
      'public.link_client_profile is missing (0096). mark_password_set records a fact about a linked person and nothing links one without it.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'extensions' and p.proname = 'crypt') then
    raise exception
      'extensions.crypt is missing (pgcrypto). The codes are stored as bcrypt hashes and this file will not store them in clear.';
  end if;
end $guard$;


-- ===========================================================================
-- 1 · THE TWO COLUMNS, AND THE FOUR NEW NUMBERS
-- ===========================================================================

-- NULL MEANS «HAS NOT CHOSEN A PASSWORD YET», and that is the whole reason the column exists: profile_id
-- says the phone was proved once by a code, and until this is set the screen must insist on «أنشئ كلمة
-- سرّ» before it shows anything. It is written by mark_password_set and by nothing else; it is NOT the
-- password and it is not a hash of it — Supabase Auth holds that, out of reach of public.*.
alter table public.persons add column if not exists password_set_at timestamptz;

comment on column public.persons.password_set_at is
  'When this client last chose a password (0108). Null = the phone may have been proved by SMS but no password exists yet, so the client space must insist on creating one. Written only by public.mark_password_set; the password itself lives in Supabase Auth, never here.';

-- A CODE IS FOR ONE PURPOSE. Every row 0096 already wrote is a login code, which is what the default says.
alter table public.client_login_codes
  add column if not exists purpose text not null default 'login';
alter table public.client_login_codes
  add column if not exists target_phone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_login_codes_purpose_check') then
    alter table public.client_login_codes
      add constraint client_login_codes_purpose_check
      check (purpose in ('login', 'reset', 'phone_change'));
  end if;
  -- target_phone is meaningful for a phone change and meaningless otherwise, and the check says so, so a
  -- row can never claim to move a number it was not issued to move.
  if not exists (select 1 from pg_constraint where conname = 'client_login_codes_target_check') then
    alter table public.client_login_codes
      add constraint client_login_codes_target_check
      check ((purpose = 'phone_change') = (target_phone is not null));
  end if;
end $$;

comment on column public.client_login_codes.purpose is
  'What the code may be used for: login (0096''s door and the first-time confirmation), reset (a forgotten password), phone_change (moving persons.phone_e164). A code verifies only for its own purpose.';
comment on column public.client_login_codes.target_phone is
  'phone_change only: the NEW number the code was sent to and that confirm_phone_change will write. phone_e164 on such a row is still the person''s number at the time of asking, so the row says who asked and where the code went.';

-- THE RECIPIENT, indexed. 0096's cooldown and hourly ceiling are rules about the number an SMS WENT TO, and
-- for a phone change that is target_phone, not phone_e164. One expression index on «where did it go» and
-- both limits, for all three purposes, cost an index probe.
create index if not exists client_login_codes_recipient_idx
  on public.client_login_codes ((coalesce(target_phone, phone_e164)), created_at desc);

-- The new numbers, the owner's. is_public false like 0096's: a visitor who knows a ceiling knows exactly how
-- many guesses they get.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('auth.client_password_min_length', to_jsonb(8), 'integer', 'auth', 'كلمة سرّ الحريف · أقلّ طول',
   'أقلّ عدد حروف في كلمة سرّ الحريف. الشاشة والخدمة يقراوه من هنا. Supabase Auth عندو حدّ أدنى خاص بيه (6 افتراضيًا)، وهذا لازم يكون أكبر منّو ولا يساويه.', false, 60),
  ('auth.client_password_max_per_15min', to_jsonb(10), 'integer', 'auth', 'كلمة سرّ الحريف · أقصى محاولات دخول في ربع ساعة',
   'قدّاش مرّة تنجّم نفس النمرة تجرّب تدخل بكلمة السرّ في 15 دقيقة، صحيحة ولا غالطة. كي يتفوّت العدد، الخدمة ترجّع «too_many» وقدّاش يستنّى.', false, 70),
  ('auth.client_reset_sms', to_jsonb('AgriZed: رمز تبديل كلمة السر {code}. صالح {minutes} دقايق. ما تعطيه لحد.'::text),
   'text', 'auth', 'كلمة سرّ الحريف · نصّ رسالة نسيان كلمة السرّ',
   'الرسالة اللي توصل للحريف كي ينسى كلمة السرّ. {code} = الرمز، {minutes} = عمر الرمز بالدقايق. لازم ما تفوتش 70 حرف.', false, 80),
  ('auth.client_phone_change_sms', to_jsonb('AgriZed: رمز تبديل النمرة {code}. صالح {minutes} دقايق. ما تعطيه لحد.'::text),
   'text', 'auth', 'دخول الحريف · نصّ رسالة تبديل النمرة',
   'الرسالة اللي توصل للنمرة الجديدة كي الحريف يبدّل نمرتو. {code} = الرمز، {minutes} = عمر الرمز بالدقايق. لازم ما تفوتش 70 حرف.', false, 90)
on conflict (key) do nothing;

-- ONE SMS, NOT TWO — 0097's rule, checked here for the two templates this file seeds, against the worst
-- case they can be asked to render (a six digit code, a three digit number of minutes). If a future edit to
-- this file breaks it, it breaks HERE and not on a client's phone bill.
do $$
declare
  v_key  text;
  v_body text;
begin
  foreach v_key in array array['auth.client_reset_sms', 'auth.client_phone_change_sms'] loop
    v_body := replace(replace(app.setting_text(v_key, ''), '{code}', '516548'), '{minutes}', '120');
    if char_length(v_body) > 70 then
      raise exception
        '% renders to % characters; an Arabic SMS holds 70 and this would be sent as two: «%»',
        v_key, char_length(v_body), v_body;
    end if;
  end loop;
end $$;


-- ===========================================================================
-- 2 · اطلب رمز — the same door, now told what the code is for
-- ===========================================================================

-- DROP FIRST, THEN CREATE. `create or replace` with a new parameter list does not replace anything: it adds a
-- second overload beside the first, and PostgREST then refuses the call as ambiguous — this repository broke
-- reservations exactly that way once. Named-parameter callers ({p_phone}) keep working because the new
-- parameter has a default; positional one-arg calls do too.
drop function if exists public.request_client_login_code(text);

-- THE RETURN VALUE IS DELIBERATELY UNINFORMATIVE, still. `ok` is true and the payload is always the same
-- shape whether the number belongs to a client, belongs to nobody, has already asked too often this hour —
-- or, for a reset, belongs to a client who has never chosen a password. That last one is new and follows the
-- same rule: a reset that answered «no password to reset» would tell a stranger which clients have finished
-- signing up.
--
-- WHY A RESET SENDS NOTHING TO A CLIENT WITHOUT A PASSWORD: there is nothing to reset. That client's road in
-- is the first-time flow — a LOGIN code, then «أنشئ كلمة سرّ» — and the screen sends them there.
create or replace function public.request_client_login_code(p_phone text, p_purpose text default 'login') returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_ttl      integer := greatest(app.setting_int('auth.client_code_ttl_seconds', 300), 30);
  v_cooldown integer := greatest(app.setting_int('auth.client_code_cooldown_seconds', 60), 0);
  v_max_hour integer := greatest(app.setting_int('auth.client_code_max_per_hour', 5), 1);
  v_phone    text := btrim(p_phone);
  v_person   public.persons;
  v_code     text;
  v_recent   timestamptz;
  v_hour     integer;
  v_body     text;
begin
  -- The purpose is the CALLER's (a Server Action), never the client's input. A wrong one is a bug, said
  -- loudly. phone_change has its own function because it needs the person and the new number, not a phone.
  if p_purpose is null or p_purpose not in ('login', 'reset') then
    raise exception 'invalid_purpose' using errcode = 'P0001',
      hint = 'request_client_login_code issues login and reset codes only; use request_phone_change_code for a phone change.';
  end if;

  -- A malformed number is the one thing worth saying, because it is about what the CALLER typed and
  -- reveals nothing about who exists.
  if p_phone is null or v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  select p.* into v_person
  from public.persons p
  where p.phone_e164 = v_phone and p.archived_at is null;

  -- No such client: answer as if a code went out, send nothing, and take the same amount of work doing it.
  if v_person.id is null then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- No password to reset: the identical answer, and nothing sent.
  if p_purpose = 'reset' and (v_person.profile_id is null or v_person.password_set_at is null) then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- «SMS ONCE» — the owner's rule, enforced where it cannot be skipped. A person who is linked AND has chosen
  -- a password has left the first-time flow for good: their door is phone + password, and a forgotten
  -- password is the RESET flow, which sends its own code. A login code to them would be a second SMS door
  -- beside the password — a way to sign in without ever typing it — and the answer is the identical one, so
  -- «you already have a password» is never said to a stranger probing the number.
  if p_purpose = 'login' and v_person.profile_id is not null and v_person.password_set_at is not null then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- COOLDOWN, then the hourly ceiling, both counted on the number the message would GO TO — which for these
  -- two purposes is the person's own phone, and for a phone change is the new one (so a change code to this
  -- number counts here too). Both silent: over either limit this returns the same object and queues no
  -- message, so hammering the endpoint neither reveals anything nor sends anything.
  select max(c.created_at) into v_recent
  from public.client_login_codes c where coalesce(c.target_phone, c.phone_e164) = v_phone;
  if v_recent is not null and v_recent > now() - make_interval(secs => v_cooldown) then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  select count(*) into v_hour
  from public.client_login_codes c
  where coalesce(c.target_phone, c.phone_e164) = v_phone and c.created_at > now() - interval '1 hour';
  if v_hour >= v_max_hour then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- ASKING AGAIN RETIRES THE OLD CODE — of the SAME purpose. A live reset code must not be killed by a login
  -- request from another tab, nor the other way round; each purpose keeps at most one live code.
  update public.client_login_codes
     set consumed_at = now()
   where person_id = v_person.id and purpose = p_purpose and consumed_at is null;

  -- Six digits, zero-padded, from the same CSPRNG Postgres uses for gen_random_uuid.
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');

  insert into public.client_login_codes (person_id, phone_e164, code_hash, expires_at, purpose)
  values (v_person.id, v_phone,
          extensions.crypt(v_code, extensions.gen_salt('bf')),
          now() + make_interval(secs => v_ttl),
          p_purpose);

  -- Each purpose has its own text, because «رمز دخولك» on a message that resets a password would send the
  -- client looking for a login screen.
  v_body := case p_purpose
              when 'reset' then app.setting_text('auth.client_reset_sms',
                                  'AgriZed: رمز تبديل كلمة السر {code}. صالح {minutes} دقايق. ما تعطيه لحد.')
              else app.setting_text('auth.client_login_sms',
                                  'AgriZed: رمز دخولك {code}. صالح {minutes} دقايق. ما تعطيه لحد.')
            end;
  v_body := replace(replace(v_body, '{code}', v_code),
                    '{minutes}', greatest(round(v_ttl / 60.0)::integer, 1)::text);

  -- Out through the queue everything else uses. related_entity names the purpose and related_id the person,
  -- never the code.
  insert into public.notification_outbox (channel, to_phone_e164, body, related_entity, related_id)
  values ('sms', v_phone, v_body,
          case p_purpose when 'reset' then 'client_reset' else 'client_login' end,
          v_person.id);

  return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
end $fn$;

revoke execute on function public.request_client_login_code(text, text) from public, anon, authenticated;
grant  execute on function public.request_client_login_code(text, text) to service_role;

comment on function public.request_client_login_code(text, text) is
  'Issues a one-time SMS code for the buyer holding this phone number — purpose login (0096''s door, and the first-time confirmation) or reset (a forgotten password) — and queues it on public.notification_outbox. Answers identically for a number that exists, one that does not, one over its cooldown or hourly ceiling, a reset for a client who has no password yet, and a login for a client who already has one (nothing is sent in the last four cases: the SMS is sent once, and a forgotten password is the reset flow) — so it cannot be used to discover whether a phone belongs to an AgriZed client or whether that client finished signing up. Stores only a bcrypt hash of the code. Service role only.';


-- ===========================================================================
-- 3 · تثبّت من الرمز — a code verifies only for what it was issued for
-- ===========================================================================

drop function if exists public.verify_client_login_code(text, text);

-- Unchanged from 0096 but for one predicate: the newest live code OF THIS PURPOSE. A login code offered to
-- the reset flow is simply «invalid_code», which is what the reset flow would say to anybody holding nothing.
--
-- ONE ANSWER FOR «NO CODE», «EXPIRED» AND «WRONG». 0096 named the first two. But a code is only ever issued
-- to a number that belongs to a client, so «no live code for this number» told a stranger, for free and
-- without a guess, that the number is NOT one that just asked — and its opposite, a counter of attempts
-- left, that it IS. The three now return the same object, `{ok:false, reason:'invalid_code'}`; a wrong guess
-- against a live code adds `attempts_left` for the row's own bookkeeping, and the Server Action prints ONE
-- sentence for all of them and never the counter. `too_many_attempts` stays, because it is only ever said
-- to somebody who has already burned a live code with guesses.
create or replace function public.verify_client_login_code(p_phone text, p_code text, p_purpose text default 'login') returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_max  integer := greatest(app.setting_int('auth.client_code_max_attempts', 5), 1);
  v_row  public.client_login_codes;
  v_name text;
begin
  if p_purpose is null or p_purpose not in ('login', 'reset') then
    raise exception 'invalid_purpose' using errcode = 'P0001',
      hint = 'verify_client_login_code checks login and reset codes only; a phone change is confirmed by confirm_phone_change.';
  end if;
  if p_phone is null or p_code is null or btrim(p_code) !~ '^[0-9]{4,8}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  -- The newest live code for this number and purpose. FOR UPDATE: two requests racing on the same code must
  -- not each read attempts = 4 and both be allowed a guess.
  select * into v_row
  from public.client_login_codes c
  where c.phone_e164 = btrim(p_phone) and c.purpose = p_purpose and c.consumed_at is null
  order by c.created_at desc limit 1
  for update;

  -- No live code, or a dead one: the same answer a wrong guess gets, without the counter (see above). The
  -- expired row is still retired so it stops being «the newest live code».
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if v_row.expires_at <= now() then
    update public.client_login_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if v_row.attempts >= v_max then
    update public.client_login_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  -- COUNT THE ATTEMPT BEFORE CHECKING IT.
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

revoke execute on function public.verify_client_login_code(text, text, text) from public, anon, authenticated;
grant  execute on function public.verify_client_login_code(text, text, text) to service_role;

comment on function public.verify_client_login_code(text, text, text) is
  'Checks a one-time code against the newest live code for that phone AND purpose (login or reset), counting the attempt first and burning the code on success. Returns the person on success, or invalid_code (which also covers «no live code» and «expired», so that a probe cannot tell a number holding a code from one holding none) or too_many_attempts. A code issued for one purpose is invalid_code for the other. Writes no session and grants no role. Service role only.';


-- ===========================================================================
-- 4 · بدّل النمرة — a code to the NEW number, then the one write on persons.phone_e164
-- ===========================================================================

-- THE CALLER IS SIGNED IN. p_person is the person behind the session (currentClient()), so this is not a
-- door a stranger knocks on — but the NEW number is a stranger's input, and the same three rules hold on it:
-- the identical answer whether it is free or somebody else's, a cooldown and an hourly ceiling on the number
-- the SMS goes to, and a bcrypt hash only.
--
-- WHY A CODE TO THE NEW NUMBER AND NOT TO THE OLD ONE: the old number is what the client is trying to leave
-- — perhaps because it is lost — and the thing that must be proved is that the client can RECEIVE on the
-- new one, or the file ends up pointing at a number nobody holds. The owner's spec names this as one of the
-- three moments SMS is for, and this is why.
--
-- «SAME ANSWER AND SEND NOTHING» WHEN THE NUMBER IS HELD BY ANOTHER PERSON — any person, archived included,
-- because persons.phone_e164 is unique across all of them and confirm could never write it. Sending a code
-- that cannot be confirmed would be an SMS to a third party for nothing, and refusing out loud would let a
-- signed-in client walk the phone book. The interface says «إذا النمرة متاحة، الرمز وصل».
create or replace function public.request_phone_change_code(p_person uuid, p_new_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_ttl      integer := greatest(app.setting_int('auth.client_code_ttl_seconds', 300), 30);
  v_cooldown integer := greatest(app.setting_int('auth.client_code_cooldown_seconds', 60), 0);
  v_max_hour integer := greatest(app.setting_int('auth.client_code_max_per_hour', 5), 1);
  v_new      text := btrim(p_new_phone);
  v_person   public.persons;
  v_code     text;
  v_recent   timestamptz;
  v_hour     integer;
  v_body     text;
begin
  select p.* into v_person from public.persons p where p.id = p_person and p.archived_at is null;
  if v_person.id is null then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;

  -- About the caller's own typing, so it may be named.
  if p_new_phone is null or v_new !~ '^\+[1-9][0-9]{6,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;
  if v_new = v_person.phone_e164 then
    return jsonb_build_object('ok', false, 'reason', 'same_phone');
  end if;

  -- Somebody else's number: the identical answer, and nothing sent.
  if exists (select 1 from public.persons p where p.phone_e164 = v_new and p.id <> v_person.id) then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- Cooldown and hourly ceiling on the NEW number — the one that would receive the message.
  select max(c.created_at) into v_recent
  from public.client_login_codes c where coalesce(c.target_phone, c.phone_e164) = v_new;
  if v_recent is not null and v_recent > now() - make_interval(secs => v_cooldown) then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  select count(*) into v_hour
  from public.client_login_codes c
  where coalesce(c.target_phone, c.phone_e164) = v_new and c.created_at > now() - interval '1 hour';
  if v_hour >= v_max_hour then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- AND THE SAME CEILING PER PERSON. The two limits above are about the number that would RECEIVE the
  -- message, so a signed-in client typing a different new number every minute would never meet them — and
  -- each of those numbers would get a paid SMS from AgriZed, to whoever holds it. One person may ask for at
  -- most auth.client_code_max_per_hour change codes an hour, to any numbers; over it, the identical answer
  -- and nothing queued.
  select count(*) into v_hour
  from public.client_login_codes c
  where c.person_id = v_person.id and c.purpose = 'phone_change' and c.created_at > now() - interval '1 hour';
  if v_hour >= v_max_hour then
    return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
  end if;

  -- One live change code per person. Asking for a second number retires the first.
  update public.client_login_codes
     set consumed_at = now()
   where person_id = v_person.id and purpose = 'phone_change' and consumed_at is null;

  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');

  -- phone_e164 = the number the person holds NOW (who asked); target_phone = where the code went and what
  -- confirm will write.
  insert into public.client_login_codes (person_id, phone_e164, code_hash, expires_at, purpose, target_phone)
  values (v_person.id, v_person.phone_e164,
          extensions.crypt(v_code, extensions.gen_salt('bf')),
          now() + make_interval(secs => v_ttl),
          'phone_change', v_new);

  v_body := replace(
              replace(app.setting_text('auth.client_phone_change_sms',
                        'AgriZed: رمز تبديل النمرة {code}. صالح {minutes} دقايق. ما تعطيه لحد.'),
                      '{code}', v_code),
              '{minutes}', greatest(round(v_ttl / 60.0)::integer, 1)::text);

  insert into public.notification_outbox (channel, to_phone_e164, body, related_entity, related_id)
  values ('sms', v_new, v_body, 'client_phone_change', v_person.id);

  return jsonb_build_object('ok', true, 'ttl_seconds', v_ttl);
end $fn$;

revoke execute on function public.request_phone_change_code(uuid, text) from public, anon, authenticated;
grant  execute on function public.request_phone_change_code(uuid, text) to service_role;

comment on function public.request_phone_change_code(uuid, text) is
  'For a signed-in client who wants a new phone number: queues a one-time code to the NEW number (purpose phone_change) so that confirm_phone_change can prove they receive on it. Answers identically whether the new number is free or already held by another person (nothing is sent then), with the cooldown and hourly ceiling counted on the new number AND the same hourly ceiling counted per asking person, so one signed-in client cannot have AgriZed message a different number every minute. Names only what is about the caller''s own input: invalid_phone, same_phone. Service role only — the Server Action supplies the person from the session.';

-- THE ONE ACCEPTED LEAK, ARGUED. `phone_taken` here tells the caller that the number they are moving to was
-- registered by somebody else. It is accepted because of WHO can reach this line and HOW OFTEN:
--   · the caller is signed in as a person (so not anonymous, and named in the file the office can read);
--   · they hold a valid, unexpired phone_change code — which was only ever sent when the number was FREE at
--     the time of asking (request_phone_change_code sends nothing to a number somebody holds) — so they are
--     also, physically, holding the new phone. What they learn is that a number they themselves hold was
--     taken by an intake in the few minutes between asking and confirming: one bit, about one number, that
--     they had to own a code for;
--   · and getting to ask again costs the cooldown, the hourly ceiling on that number, and the action's
--     per-IP limit. There is no loop to run.
-- The alternative — writing nothing and answering «invalid_code» — would send a client who typed the right
-- code hunting for a typo, and the office would have no idea why their number never moved.
create or replace function public.confirm_phone_change(p_person uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_max integer := greatest(app.setting_int('auth.client_code_max_attempts', 5), 1);
  v_row public.client_login_codes;
begin
  if p_person is null or p_code is null or btrim(p_code) !~ '^[0-9]{4,8}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  -- The newest live change code for THIS PERSON — keyed on the person, not on a phone, because the phone is
  -- the thing in flight. FOR UPDATE for 0096's reason.
  select * into v_row
  from public.client_login_codes c
  where c.person_id = p_person and c.purpose = 'phone_change' and c.consumed_at is null
  order by c.created_at desc limit 1
  for update;

  -- No live code, or a dead one: invalid_code without a counter, for verify_client_login_code's reason. The
  -- caller here is signed in, so the leak is smaller — but the Server Action prints one sentence either way.
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if v_row.expires_at <= now() then
    update public.client_login_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if v_row.attempts >= v_max then
    update public.client_login_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  update public.client_login_codes set attempts = attempts + 1 where id = v_row.id;

  if extensions.crypt(btrim(p_code), v_row.code_hash) <> v_row.code_hash then
    return jsonb_build_object(
      'ok', false, 'reason', 'invalid_code',
      'attempts_left', greatest(v_max - (v_row.attempts + 1), 0));
  end if;

  -- The code is right: it is spent whatever happens next, so a taken number cannot be retried on the same
  -- code either.
  update public.client_login_codes set consumed_at = now() where id = v_row.id;

  if exists (select 1 from public.persons p where p.phone_e164 = v_row.target_phone and p.id <> p_person) then
    return jsonb_build_object('ok', false, 'reason', 'phone_taken');
  end if;

  -- THE WRITE. persons_stamp keeps updated_at. Nothing else on the file moves: the codes already issued to
  -- the old number keep their phone_e164 (0096 kept it beside person_id for exactly this moment), and the
  -- demands keep the number the visitor typed (0002: «kept as submitted»).
  --
  -- THE RACE THE CHECK ABOVE CANNOT CLOSE: an intake inserting this very number in the same instant, after
  -- the exists() read and before this write, meets persons' unique index here and not up there. That is the
  -- same fact — the number was taken between asking and confirming — and it gets the same argued answer,
  -- phone_taken, instead of an uncaught unique_violation the Server Action would print as «تعذّر».
  begin
    update public.persons
       set phone_e164 = v_row.target_phone
     where id = p_person and archived_at is null;
    if not found then
      raise exception 'invalid_person' using errcode = 'P0001';
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'phone_taken');
  end;

  return jsonb_build_object('ok', true, 'phone_e164', v_row.target_phone);
end $fn$;

revoke execute on function public.confirm_phone_change(uuid, text) from public, anon, authenticated;
grant  execute on function public.confirm_phone_change(uuid, text) to service_role;

comment on function public.confirm_phone_change(uuid, text) is
  'Checks the newest live phone_change code for this person (attempt counted first, code burned on success) and then writes persons.phone_e164 = the number the code was sent to. Returns {ok, phone_e164}, or invalid_code (also for «no live code» and «expired») · too_many_attempts, or phone_taken when the number was registered by somebody else between asking and confirming — checked before the write and caught on the unique index during it — the one named leak, accepted because the caller is signed in, holds a code that only ever went to a free number, and is rate-limited. Service role only.';


-- ===========================================================================
-- 5 · كلمة السرّ موجودة — the fact, recorded after Auth has stored it
-- ===========================================================================

-- CALLED AFTER admin.updateUserById(userId, {password}) SUCCEEDED, never before: the column says «this client
-- has a password», and saying it about a client for whom Auth refused the write would lock them out of the
-- first-time flow with nothing to sign in with. Requires the person to be linked (profile_id) for the same
-- reason — a password belongs to an auth user, and an unlinked person has none.
--
-- IDEMPOTENT AND RE-STAMPING: every call sets now(), so the column is «when the password was LAST chosen»,
-- which is what a security page wants to print, and a second call is never an error.
create or replace function public.mark_password_set(p_person uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_profile uuid;
  v_at      timestamptz;
begin
  select p.profile_id into v_profile from public.persons p where p.id = p_person;
  if not found then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;
  if v_profile is null then
    raise exception 'person_not_linked' using errcode = 'P0001',
      hint = 'Call link_client_profile first: a password belongs to an auth user and this person has none.';
  end if;

  update public.persons set password_set_at = now() where id = p_person
  returning password_set_at into v_at;

  return jsonb_build_object('ok', true, 'person_id', p_person, 'password_set_at', v_at);
end $fn$;

revoke execute on function public.mark_password_set(uuid) from public, anon, authenticated;
grant  execute on function public.mark_password_set(uuid) to service_role;

comment on function public.mark_password_set(uuid) is
  'Records on public.persons that this client has chosen a password (password_set_at = now()), to be called only after Supabase Auth has accepted the password. Idempotent; refuses a person that is not linked to an auth user. Service role only.';


-- ===========================================================================
-- 6 · THE PASSWORD LIMIT — charged before anything is checked
-- ===========================================================================

-- VOLATILE, and it writes: the throttle row is what makes the limit real.
--
-- THE ORDER, written out as 0103 writes it:
--   1 · a blank phone is answered ok and charged nothing — there is nothing to key on, and the action's
--       signInWithPassword will fail on it by itself without telling anybody anything.
--   2 · THE LIMIT IS CHARGED NEXT, on every well-formed attempt, BEFORE the action resolves the phone to a
--       person and before Auth sees the password. A wrong phone, a phone with no password, a wrong password
--       and a right one all cost exactly one of the fifteen-minute budget: charging only failures would let
--       the count itself say which attempts succeeded, and charging only phones that exist would make the
--       limit the oracle — hammer a number eleven times, get too_many and you know it is a client.
--   3 · too_many is the ONE named answer, and it is safe because it is about the caller's own behaviour.
--       retry_after_seconds is when the oldest charge in the window falls out of it, so the screen can say
--       «عاود بعد N دقايق» instead of «غالطة» to a client who typed correctly.
--
-- md5 AND NOT THE PHONE, for 0103's reason: app.submission_throttle is long-lived and must not become a log
-- of which numbers were tried against passwords. The hash counts exactly as well.
create or replace function public.client_password_attempt(p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_max    integer := greatest(app.setting_int('auth.client_password_max_per_15min', 10), 1);
  v_phone  text := btrim(coalesce(p_phone, ''));
  v_key    text;
  v_used   integer;
  v_oldest timestamptz;
begin
  -- 1 · Nothing typed.
  if v_phone = '' or char_length(v_phone) > 32 then
    return jsonb_build_object('ok', true);
  end if;

  v_key := md5(v_phone);

  -- 2 · The limit, on this number, over the last fifteen minutes.
  select count(*), min(t.created_at) into v_used, v_oldest
  from app.submission_throttle t
  where t.kind = 'client:password' and t.key_hash = v_key and t.created_at > now() - interval '15 minutes';

  if v_used >= v_max then
    -- 3 · The one named failure. The oldest charge leaves the window fifteen minutes after it was made.
    return jsonb_build_object(
      'ok', false, 'reason', 'too_many',
      'retry_after_seconds',
        greatest(ceil(extract(epoch from (v_oldest + interval '15 minutes' - now())))::integer, 1));
  end if;

  insert into app.submission_throttle (kind, key_hash) values ('client:password', v_key);

  -- AND IT CLEANS UP AFTER ITSELF, from the statement that dirties the table, as 0103 does: one hour is four
  -- times the window, so nothing still being counted is ever removed, and the cleaning scales with the abuse.
  delete from app.submission_throttle t
   where t.kind = 'client:password' and t.created_at < now() - interval '1 hour';

  return jsonb_build_object('ok', true);
end $fn$;

revoke execute on function public.client_password_attempt(text) from public, anon, authenticated;
grant  execute on function public.client_password_attempt(text) to service_role;

comment on function public.client_password_attempt(text) is
  'Charges one password sign-in attempt against this phone number in app.submission_throttle (kind client:password, key md5 of the number), BEFORE any credential is checked, so a wrong phone, a missing password and a wrong password all cost the same. At most auth.client_password_max_per_15min in fifteen minutes; over it, {ok:false, reason:''too_many'', retry_after_seconds}. Prunes its own rows older than an hour. Service role only — the Server Action calls it first and adds the per-IP limit.';


-- ===========================================================================
-- 7 · THE POLICY — one number, read by the screen and the action alike
-- ===========================================================================

-- The floor of 6 is not a business value: it is Supabase Auth's own default minimum, and a setting below it
-- would let the screen accept a password Auth then refuses, with an error the client cannot act on.
create or replace function public.client_password_policy() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('min_length', greatest(app.setting_int('auth.client_password_min_length', 8), 6))
$fn$;

revoke execute on function public.client_password_policy() from public, anon, authenticated;
grant  execute on function public.client_password_policy() to service_role;

comment on function public.client_password_policy() is
  'The rules a client password must meet — today {min_length}, from auth.client_password_min_length — so the create-password screen and the Server Action that validates it read one source. Service role only.';


-- ===========================================================================
-- 8 · THE WORDS THE CLIENT SPACE READS AND NOBODY HAD SEEDED
-- ===========================================================================

-- Every sentence on /zitounti, /zitounti/<section> and /zitounti/security is read through settingText with a
-- fallback in the code; the fallback is what the screen prints until the owner writes a row, but a key with
-- no row is a key the owner cannot FIND in الإعدادات to write. These are the keys those screens read that
-- 0068, 0104, 0105 and 0106 did not seed, each with the code's own fallback as its value, character for
-- character, so seeding changes nothing on screen. `on conflict do nothing`: a value the owner already wrote
-- wins.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('zitounti.password_login_note',
   to_jsonb('ادخل بنمرة التلفون وكلمة السرّ متاعك. أوّل مرّة؟ نبعثولك رمز بالSMS باش تثبّت النمرة وتختار كلمة سرّ.'::text),
   'text', 'zitounti', 'زيتونتي · جملة الدخول بكلمة السرّ',
   'الجملة اللي تحت العنوان في صفحة الدخول من وقت ما ولّى الدخول بالنمرة وكلمة السرّ. (zitounti.login_note هي جملة الدخول القديمة بالرمز.)', true, 21),
  ('zitounti.set_password_note',
   to_jsonb('قبل ما تشوف حسابك، أنشئ كلمة سرّ خاصة بيك. المرّة الجاية تدخل بالنمرة وكلمة السرّ، بلا SMS.'::text),
   'text', 'zitounti', 'زيتونتي · جملة إنشاء كلمة السرّ',
   'الجملة اللي تحت العنوان كي يدخل الحريف أوّل مرّة بالرمز ولازمو يختار كلمة سرّ قبل ما يشوف حسابو.', true, 22),
  ('zitounti.empty_client_note',
   to_jsonb('مازال ما عندكش زيتونات مسجّلة باسمك. كي تتسجّل، تلقاها هوني برموزها.'::text),
   'text', 'zitounti', 'زيتونتي · جملة الحساب الفارغ',
   'تتكتب في بطاقة الحساب كي يكون ملفّ الحريف مفتوح أما ما فيه حتى زيتونة.', true, 75),
  ('zitounti.section_not_built_note',
   to_jsonb('الجزء هذا مازال ما تركّبش. كي يولّي جاهز تلقاه هوني.'::text),
   'text', 'zitounti', 'زيتونتي · جملة الجزء اللي ما تبناش',
   'تتكتب كي يفتح الحريف قسم الجدول اللي وراه مازال ما تعملش. (zitounti.section_not_built هي الكلمة القصيرة في القائمة.)', true, 91),
  ('zitounti.security_label', to_jsonb('الأمان وكلمة السرّ'::text), 'text', 'zitounti',
   'زيتونتي · زرّ الأمان', 'كلمة الزرّ اللي يفتح صفحة الأمان من آخر الحساب، وعنوان الصفحة.', true, 100),
  ('zitounti.security_password_title', to_jsonb('بدّل كلمة السرّ'::text), 'text', 'zitounti',
   'الأمان · عنوان تبديل كلمة السرّ', 'عنوان الجزء الأوّل من صفحة الأمان.', true, 110),
  ('zitounti.security_password_note',
   to_jsonb('اكتب كلمة السرّ الحالية، وبعد الجديدة مرّتين. الدخول القادم يكون بالجديدة.'::text),
   'text', 'zitounti', 'الأمان · شرح تبديل كلمة السرّ', 'الجملة الصغيرة تحت عنوان تبديل كلمة السرّ.', true, 120),
  ('zitounti.security_phone_title', to_jsonb('بدّل نمرة التلفون'::text), 'text', 'zitounti',
   'الأمان · عنوان تبديل النمرة', 'عنوان الجزء الثاني من صفحة الأمان.', true, 130),
  ('zitounti.security_phone_note',
   to_jsonb('نبعثو رمز بالSMS للنمرة الجديدة. كي تأكّدو، تولّي هي النمرة اللي تدخل بيها.'::text),
   'text', 'zitounti', 'الأمان · شرح تبديل النمرة', 'الجملة الصغيرة تحت عنوان تبديل النمرة.', true, 140),
  ('zitounti.security_devices_title', to_jsonb('الأجهزة الأخرى'::text), 'text', 'zitounti',
   'الأمان · عنوان الأجهزة الأخرى', 'عنوان الجزء الثالث من صفحة الأمان.', true, 150),
  ('zitounti.security_devices_note',
   to_jsonb('إذا دخلت من تلفون ولا حاسوب موش متاعك، اخرج منهم الكل من هوني. الجهاز هذا يبقى داخل.'::text),
   'text', 'zitounti', 'الأمان · شرح الأجهزة الأخرى', 'الجملة الصغيرة تحت عنوان الأجهزة الأخرى.', true, 160),
  ('zitounti.sign_out_others_label', to_jsonb('اخرج من الأجهزة الأخرى'::text), 'text', 'zitounti',
   'الأمان · زرّ الخروج من الأجهزة الأخرى', 'كلمة الزرّ اللي يخرّج الحريف من كل جهاز ما عدا هذا.', true, 170)
on conflict (key) do nothing;
