-- 0100 · A client may ask for a login code ten times an hour, not five.
--
-- WHAT HAPPENED. The owner could not receive a code and retried. Each attempt answered «إذا النمرة مسجّلة
-- عندنا، الرمز وصل بالSMS» and sent nothing, because `auth.client_code_max_per_hour` was 5 and he was past
-- it. The ceiling worked exactly as 0096 designed it — silently, so that being throttled cannot tell an
-- attacker the number belongs to a client — and the cost of that silence landed on the one person it was
-- never aimed at.
--
-- FIVE IS TOO LOW FOR A REAL PERSON, and this is the part that was wrong rather than merely unlucky. Count
-- an ordinary bad morning: a code that arrives slowly and is requested twice, a mistyped number, a phone
-- that was in a lift. Three of those and the hour is spent. The limit exists to stop a script sending
-- thousands of messages, and ten stops that just as well as five — the cooldown of sixty seconds between
-- requests is what actually caps the rate, and it is untouched.
--
-- WHAT IS *NOT* CHANGED, and why the silence stays. Saying «you have asked too many times» would only ever
-- be said to a number that HAS rows in public.client_login_codes, and only a real client has those — so the
-- friendly message is an oracle for whether a phone belongs to an AgriZed buyer, which is the one thing
-- this endpoint must never answer. Making it sayable needs per-phone request counting for numbers that do
-- not exist either, which is a table and a decision, not a number. Until then the screen carries the
-- honest hint instead: ask again in a minute, and if you have asked several times, wait a little.
--
-- It is a setting, so الإعدادات can move it again without a migration.

do $guard$
declare
  v_before integer;
  v_after  integer;
begin
  select (value #>> '{}')::integer into v_before from public.settings where key = 'auth.client_code_max_per_hour';
  if v_before is null then
    raise exception 'auth.client_code_max_per_hour is missing; apply 0096_client_login.sql first.';
  end if;

  update public.settings set value = to_jsonb(10) where key = 'auth.client_code_max_per_hour';

  select (value #>> '{}')::integer into v_after from public.settings where key = 'auth.client_code_max_per_hour';
  -- A ceiling below the cooldown's own rate is a ceiling nobody can reach honestly; one in the hundreds is
  -- not a ceiling at all. Both ends are refused rather than trusted.
  if v_after < 3 or v_after > 60 then
    raise exception 'auth.client_code_max_per_hour should be between 3 and 60; got %', v_after;
  end if;

  raise notice 'auth.client_code_max_per_hour: % -> %', v_before, v_after;
end $guard$;
