-- 0104 · The client's space opens, and the sections stop claiming they are unbuilt.
--
-- WHAT THE OWNER WAS LOOKING AT. A screenshot of فضاء «زيتونتي» where almost every row carried
-- «يُبنى في دفعة قادمة» — «to be built in a later batch». For most of those rows that sentence was FALSE.
-- The code is written, the readers exist and the tables are live; the row greys out because
-- src/app/(public)/zitounti/page.tsx marks a section «later» whenever its flag is not 'public', and the
-- flags had never been turned on. A screen telling the owner his own finished work does not exist is worse
-- than a screen with nothing on it.
--
-- SO THE TEST APPLIED TO EVERY FLAG BELOW IS THE SAME ONE: is the thing behind it built? Not «does it have
-- rows» — an empty section that says «ما فماش عمليات مسجّلة بعد» is honest and useful, and it is a different
-- sentence from «we have not built this». Only where the module is genuinely not a product yet does the
-- «later» badge stay.

do $guard$
declare
  v_missing text;
begin
  select string_agg(k, ', ') into v_missing
  from unnest(array['zitounti', 'contracts', 'installments', 'agri_backoffice', 'harvest']) k
  where not exists (select 1 from public.feature_flags f where f.key = k);
  if v_missing is not null then
    raise exception 'these feature flags do not exist: %. Apply the migrations that create them first.', v_missing;
  end if;
end $guard$;

-- ---------------------------------------------------------------------------------------------------------
-- OPENED — every one of these has its reader, its RLS and its rows-or-honest-emptiness
-- ---------------------------------------------------------------------------------------------------------
--
--   zitounti        the space itself. While it was 'disabled', public.my_zitounti_file and every section
--                   behind it answered 'closed' — the buyer could sign in and then be told their own file
--                   was switched off. Nothing else in this file matters until this one is open.
--   contracts       0072 built them, 0095 wired them into the client file, and the database holds a real
--                   signed contract today. «المدفوع والمتبقي» is computed by app.contract_money, the same
--                   function Finance reads, so opening this cannot make the two disagree.
--   installments    the schedule of that same contract, line by line, from the same function.
--   agri_backoffice 0066 built the operations, and 0068's app.zitounti_operations already narrows them to
--                   what a client may see — their own offers, no cost, no supplier. Zero rows today, so the
--                   section will say so; that is the truth and «يُبنى في دفعة قادمة» was not.
--   harvest         0067 built the seasons and the client's share. Same argument, same emptiness.
--
-- Role checks are UNAFFECTED. A flag says what a module may DO; app.is_staff(), app.can_see_person() and
-- every RLS policy still decide WHO. Opening `contracts` does not let a visitor read one — public.staff_*
-- refuses them exactly as before.
update public.feature_flags set state = 'public'
 where key in ('zitounti', 'contracts', 'installments', 'agri_backoffice', 'harvest');

-- ---------------------------------------------------------------------------------------------------------
-- LEFT CLOSED, ON PURPOSE — and this is the one place «later» is the true word
-- ---------------------------------------------------------------------------------------------------------
--
-- `subscriptions` is not a switched-off feature, it is an undecided product: no subscription row exists, no
-- annual price has been agreed, and opening it would put a «اشترك» door on a public site for a service that
-- has no terms. On a site whose whole argument is «بلا وعود», advertising a product we have not defined is
-- the one failure that costs more than a grey row. It moves to 'internal' so the team can prepare it and see
-- it in the Back Office, while the client's own section keeps saying «يُبنى في دفعة قادمة» — which, for this
-- module alone, is exactly what is true.
update public.feature_flags set state = 'internal' where key = 'subscriptions';

do $verify$
declare
  v_bad text;
begin
  select string_agg(f.key || '=' || f.state, ', ') into v_bad
  from public.feature_flags f
  where f.key in ('zitounti', 'contracts', 'installments', 'agri_backoffice', 'harvest')
    and f.state <> 'public';
  if v_bad is not null then
    raise exception 'these were meant to be open and are not: %', v_bad;
  end if;
  raise notice 'zitounti, contracts, installments, agri_backoffice and harvest are public; subscriptions is internal';
end $verify$;
