-- 0137 · app.money_ar, the function that writes millimes as dinars — back in git, where it was never committed.
--
-- Test: supabase/tests/084_money_ar.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0137_money_ar.sql supabase/tests/084_money_ar.sql
--
-- WHY THIS FILE EXISTS AND CREATES NOTHING NEW. The function has been in production since the money/SMS work.
-- It was applied there by a migration named 0081_money_ar_sms_amount.sql whose FILE never reached git: the
-- number 0081 was taken in the meantime by 0081_assistant_model.sql, and no commit in this repository's history
-- has ever touched the money file. app.schema_migrations still carries its row, which is the only record that
-- it ran at all.
--
-- What that cost: a database built from the migrations alone did not have app.money_ar. Two things then break
-- on it and on nothing else — supabase/tests/067_i18n.sql calls the function directly, and 0109's
-- app.enqueue_message documents {amount} as coming from it. Production was fine, so nothing failed where
-- anyone would see it; a fresh database was not, which is the half of «it works» that is checked last.
--
-- Verified before writing this (2026-10-11): 335 routines exist in production's app and public schemas, and
-- exactly one of them — this one — is created by no file in supabase/migrations.
--
-- The body below is pg_get_functiondef's output from production, unchanged, so `create or replace` on the live
-- database replaces the function with itself. The stray 0081_money_ar_sms_amount.sql row is deliberately left
-- in app.schema_migrations: that migration did run, and 3b543a6 is right that the record of an applied
-- migration is not ours to rewrite afterwards.

create or replace function app.money_ar(p_millimes bigint)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_millimes is null then ''
    else (case when p_millimes < 0 then '-' else '' end)
      -- Integer division truncates, which is what is wanted: the remainder is printed separately below.
      || replace(to_char(abs(p_millimes) / 1000, 'FM999,999,999,999'), ',', ' ')
      -- The millimes fraction only when there is one, so the ordinary whole-dinar payment stays «12 500 د»
      -- and does not carry a «.000» that says nothing. Padded to three, so 50 millimes reads «.050».
      || case when abs(p_millimes) % 1000 <> 0
           then '.' || lpad((abs(p_millimes) % 1000)::text, 3, '0')
           else '' end
      || ' د'
  end
$$;

-- The same privileges production has (app.money_ar's ACL there is {postgres=X/postgres}): it is called from
-- inside definer functions that compose messages, never by a browser. Matching this matters — a grant that
-- exists on a fresh database and not on production is drift pointing the other way.
revoke execute on function app.money_ar(bigint) from public, anon, authenticated;
