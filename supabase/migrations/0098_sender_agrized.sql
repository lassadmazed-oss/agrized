-- 0098 · The sender name on every SMS is AGRIZED, not MAZED.
--
-- Owner, 2026-09-25: «its sending from mazed a big mistake it should be agrized».
--
-- WHAT WAS WRONG AND WHY IT MATTERED. `sms.sender_id` held «MAZED» — the company name on the WinSMS
-- account (the provider's own reply says «Mr LASSAD EUCHI (SOCIETE MAZED)»). So every message the platform
-- has ever sent arrived from a name no client has seen anywhere: not on the site, not in the contract, not
-- on the offer. A login code is the worst case of it — an unexpected six digit code from an unknown sender
-- is exactly the shape of a scam, and the safest thing a careful person can do with one is ignore it.
--
-- CHECKED WITH THE PROVIDER BEFORE CHANGING IT, because a sender id is not ours to choose: WinSMS has to
-- have approved the name, and an unapproved one is refused or silently replaced. A live send with
-- from=AGRIZED on 2026-09-25 returned {"code":"ok", reference 5046199}, so the name is accepted on this
-- account. It is still worth reading the handset once after this is applied: a gateway that substitutes an
-- approved sender answers «ok» just the same, and only the phone shows the truth.
--
-- IT IS A SETTING, so the owner can change it back from الإعدادات without a migration. This file exists so
-- that a database rebuilt from migrations arrives at the right name rather than back at MAZED.

do $guard$
declare
  v_before text;
  v_after  text;
begin
  select value #>> '{}' into v_before from public.settings where key = 'sms.sender_id';
  if v_before is null then
    raise exception
      'sms.sender_id is missing. It is seeded with the SMS settings; apply the earlier migrations first.';
  end if;

  update public.settings set value = to_jsonb('AGRIZED'::text) where key = 'sms.sender_id';

  select value #>> '{}' into v_after from public.settings where key = 'sms.sender_id';

  -- Most gateways cap an alphanumeric sender at eleven characters and reject anything else. AGRIZED is
  -- seven; the assertion is here so a future rename cannot quietly ship a name the network will refuse.
  if v_after !~ '^[A-Za-z0-9]{1,11}$' then
    raise exception
      'sms.sender_id must be 1-11 letters or digits for an alphanumeric sender; got «%»', v_after;
  end if;

  raise notice 'sms.sender_id: % -> %', v_before, v_after;
end $guard$;
