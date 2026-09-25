-- bb_76 · «زيتونتي» بعد الشراء — plugging the three sockets 0068 cut and left labelled.
--
-- Applied 2026-09-25 (was a draft under supabase/pending). Its test re-runs against the live schema:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0095_zitounti_after_sale.sql \
--     supabase/tests/062_zitounti_after_sale.sql
--
-- WHY THIS FILE EXISTS. public.staff_zitounti_file answers nine of the client file's twelve sections with real
-- rows and the other three with a placeholder:
--
--   'contracts',    app.zitounti_section(case when app.module_open('contracts')    then 'not_built' ... )
--   'installments', app.zitounti_section(case when app.module_open('installments') then 'not_built' ... )
--   'documents',    app.zitounti_section('not_built', null)
--
-- That was true when 0068 was written: there were no contracts. 0072 then created public.contracts,
-- public.contract_installments AND the two readers those first two sockets were cut for —
-- app.zitounti_contracts and app.zitounti_installments — but deliberately did NOT rewire this function,
-- saying so in its own comment at line 1078: «replacing that whole function from here would collide with
-- another session». This is that session. The swap it describes is below, plus the third socket.
--
-- SO THE OWNER'S «المدفوع والمتبقي · الأقساط · الوثائق والعقود» ARE NOT NEW FEATURES. Every figure already
-- exists and is already computed — app.contract_money returns the schedule line by line with what each one
-- was, what was paid against it, what is left, whether it is late and by how many days, and the receipts
-- behind it. It was simply never handed to the client's own screen.
--
-- WHAT IT CHANGES, EXACTLY
--   · app.zitounti_documents(uuid)   NEW — the documents this client actually has
--   · public.staff_zitounti_file     REPLACED — three sockets plugged, money totals added
--
-- WHAT IT DOES NOT TOUCH. app.zitounti_contracts and app.zitounti_installments are 0072's and are called
-- unchanged, not copied. The nine working sections are re-emitted byte for byte. No table, no column, no
-- trigger, no setting, and no policy: this file is one new reader and one function body.


-- ===========================================================================
-- 0 · REFUSE RATHER THAN HALF-RUN
-- ===========================================================================

do $guard$
begin
  if to_regclass('public.contracts') is null then
    raise exception
      'public.contracts is missing. This file hands the contract money to the client file; apply 0072_contracts_installments.sql first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'zitounti_contracts') then
    raise exception
      'app.zitounti_contracts is missing. It is 0072''s reader and this file only plugs it in; apply 0072_contracts_installments.sql first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'staff_zitounti_file') then
    raise exception
      'public.staff_zitounti_file is missing. This file replaces it; apply 0068_zitounti.sql first.';
  end if;
end $guard$;


-- ===========================================================================
-- 1 · الوثائق — the documents this client actually has
-- ===========================================================================

-- v3 §45 lists what the system keeps for a client. 0068 answered 'not_built' because nothing was stored
-- against a person; that is no longer true, but it is still ONLY PARTLY true, and this function is careful
-- about the difference:
--
--   THE CONTRACT ITSELF is a document the moment it is signed — public.contracts.reference_no names it and
--   signed_on dates it. legal_document_ref is the notary's or the lawyer's own reference when Legal recorded
--   one, and is null until they do.
--   THE OFFER'S PLAN (projects.plan_storage_path, v3 §38 «مخطط القطعة») is a document about the ground the
--   client's trees stand in, and it is the one file that already has a storage path.
--
-- WHAT IS NOT HERE, AND SAYS SO BY BEING ABSENT: there is no per-client document store — no uploaded CIN, no
-- signed PDF, no receipt file. A row is returned only when the record behind it exists, so the section is
-- honestly short rather than padded with rows that link to nothing.
--
-- `storage_path` is null for a document that exists as a RECORD but not as a FILE. A screen draws those as a
-- reference to quote, not as something to open, and that distinction is the whole reason the column is here.
create or replace function app.zitounti_documents(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  with docs as (
    -- The contract, once signed. A draft is not a document the client has; it is one being written.
    select 1 as sort_group,
           c.signed_on::timestamptz as at,
           'contract'               as kind,
           c.reference_no           as ref,
           (select pj.code from public.projects pj where pj.id = c.project_id) as offer_code,
           c.legal_document_ref     as legal_ref,
           null::text               as storage_path
      from public.contracts c
     where c.person_id = p_person and c.status in ('signed', 'completed') and c.signed_on is not null

    union all

    -- The plan of every offer this client holds trees in, once. DISTINCT on the offer, not on the tree:
    -- one plan is one document however many trees stand on it.
    select 2, null::timestamptz, 'offer_plan', pj.code, pj.code, null::text, pj.plan_storage_path
      from (select distinct t.project_id from public.trees t where t.held_by = p_person) held
      join public.projects pj on pj.id = held.project_id
     where pj.plan_storage_path is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind',         d.kind,
           'reference_no', d.ref,
           'offer_code',   d.offer_code,
           'legal_ref',    d.legal_ref,
           -- Null means «this exists as a record, not as a file». Never draw it as a broken link.
           'storage_path', d.storage_path,
           'at',           d.at)
         order by d.sort_group, d.at desc nulls last), '[]'::jsonb)
    from docs d
$fn$;
revoke execute on function app.zitounti_documents(uuid) from public, anon, authenticated;

comment on function app.zitounti_documents(uuid) is
  'الوثائق for one client: their signed contracts (with the notary''s reference when Legal recorded one) and the plan of every offer they hold trees in. storage_path is null for a document that exists as a record but not yet as a file, so a screen can tell a reference to quote from a file to open. Returns only documents whose record exists — the section is short rather than padded.';


-- ===========================================================================
-- 2 · THE FILE — the same function, three sockets plugged
-- ===========================================================================

-- Everything down to 'contracts' is 0068's, re-emitted unchanged so the diff is readable and so a reader can
-- see that the nine working sections were not touched. The changes are:
--
--   'contracts'     → app.zitounti_contracts     (0072's reader, the swap its comment asked for)
--   'installments'  → app.zitounti_installments  (likewise)
--   'documents'     → app.zitounti_documents     (this file's, above)
--   'totals'        → gains due / paid / left across the client's live contracts
--
-- THE MODULE GATES STAY EXACTLY AS THEY WERE. A section whose module is off still answers 'closed' and not
-- an empty list, because «the owner has not switched this on» and «this client has none» are different
-- answers and the screen prints different sentences for them. The only thing that changed is what an OPEN
-- module returns: rows instead of 'not_built'.
create or replace function public.staff_zitounti_file(p_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_person jsonb;
  v_money  jsonb;
begin
  if not app.module_open('zitounti') then
    raise exception 'module_closed' using errcode = 'P0001';
  end if;
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.can_see_person(p_person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_person := app.zitounti_person(p_person_id);
  if v_person is null then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;

  -- «المدفوع والمتبقي», summed across this client's live contracts from the SAME function the Back Office
  -- and the instalments queue read (app.contract_money). Not re-derived here: two places computing one
  -- balance is how a client file and a finance screen come to disagree about what somebody owes.
  --
  -- Cancelled contracts are excluded — money owed under a cancelled contract is not owed. A draft is
  -- excluded too: nothing is due until it is signed.
  select jsonb_build_object(
           'contracts',          count(*),
           'due_millimes',       coalesce(sum((m.money->>'total_due_millimes')::bigint), 0),
           'paid_millimes',      coalesce(sum((m.money->>'total_paid_millimes')::bigint), 0),
           'left_millimes',      coalesce(sum((m.money->>'total_left_millimes')::bigint), 0),
           'missed_count',       coalesce(sum((m.money->>'missed_count')::integer), 0),
           -- The nearest instalment still owed across every contract: what «شنوّة يلزمني نخلّص توّا» means
           -- to a client who bought twice.
           'next_due_on',        min((m.money->>'next_due_on')::date))
    into v_money
    from (select app.contract_money(c.id) as money
            from public.contracts c
           where c.person_id = p_person_id and c.status in ('signed', 'completed')) m;

  return jsonb_build_object(
    'person', v_person,
    'trees', app.zitounti_section('ok', app.zitounti_trees(p_person_id)),
    'requests', app.zitounti_section('ok', app.zitounti_requests(p_person_id)),
    'reservations', case when app.module_open('reservations')
                         then app.zitounti_section('ok', app.zitounti_reservations(p_person_id))
                         else app.zitounti_section('closed', null) end,
    'visits', case when app.module_open('visits')
                   then app.zitounti_section('ok', app.zitounti_visits(p_person_id))
                   else app.zitounti_section('closed', null) end,
    'payments', case when app.module_open('reservations') or app.module_open('installments')
                     then app.zitounti_section('ok', app.zitounti_payments(p_person_id))
                     else app.zitounti_section('closed', null) end,
    'operations', case when not app.module_open('agri_backoffice') then app.zitounti_section('closed', null)
                       when app.zitounti_operations(p_person_id) is null then app.zitounti_section('not_built', null)
                       else app.zitounti_section('ok', app.zitounti_operations(p_person_id)) end,
    'subscription', case when not app.module_open('subscriptions') then app.zitounti_section('closed', null)
                         when app.zitounti_subscription(p_person_id) is null then app.zitounti_section('not_built', null)
                         else app.zitounti_section('ok', app.zitounti_subscription(p_person_id)) end,
    'harvest', case when not app.module_open('harvest') then app.zitounti_section('closed', null)
                    when app.zitounti_harvest(p_person_id) is null then app.zitounti_section('not_built', null)
                    else app.zitounti_section('ok', app.zitounti_harvest(p_person_id)) end,

    -- ---- THE THREE SOCKETS, PLUGGED ------------------------------------------------------------------
    'contracts', case when app.module_open('contracts')
                      then app.zitounti_section('ok', app.zitounti_contracts(p_person_id))
                      else app.zitounti_section('closed', null) end,
    'installments', case when app.module_open('installments')
                         then app.zitounti_section('ok', app.zitounti_installments(p_person_id))
                         else app.zitounti_section('closed', null) end,
    -- Not module-gated: a signed contract and an offer plan are documents the client has whatever switch is
    -- on, and there is no `documents` module to gate it on.
    'documents', app.zitounti_section('ok', app.zitounti_documents(p_person_id)),

    'totals', jsonb_build_object(
      'trees', (select count(*) from public.trees t where t.held_by = p_person_id),
      'trees_sold', (select count(*) from public.trees t where t.held_by = p_person_id and t.state = 'sold'),
      'trees_reserved', (select count(*) from public.trees t where t.held_by = p_person_id and t.state = 'reserved'),
      'offers', (select count(distinct t.project_id) from public.trees t where t.held_by = p_person_id),
      'paid_millimes', case when app.module_open('reservations') or app.module_open('installments')
                            then (select coalesce(sum(pm.amount_millimes), 0) from public.payments pm
                                   where pm.person_id = p_person_id and pm.voided_at is null) end,
      -- «المدفوع والمتبقي» proper: what the contracts say, beside the receipts above. The two answer
      -- different questions — `paid_millimes` is every millime this person ever handed over, including a
      -- عربون on a hold that never became a contract; `money` is what their live contracts account for.
      'money', case when app.module_open('contracts') or app.module_open('installments') then v_money end),
    'read_at', now());
end $fn$;

comment on function public.staff_zitounti_file(uuid) is
  'فضاء «زيتونتي» for one person: their numbered trees per offer, what they asked for and were quoted, their reservations, visits and receipts, their contracts, instalment schedule and documents, and the agricultural operations, subscription and harvest share once those records exist (v3 §38, §39). Reads only; writes nothing. Gated on the `zitounti` flag and on app.can_see_person. Each section carries its own status — ok, closed (its module is off) or not_built (its table does not exist yet) — so a screen never presents «no data» for «not built». Money is read from app.contract_money, the same function Finance reads, so the client file and the instalments queue cannot disagree.';
