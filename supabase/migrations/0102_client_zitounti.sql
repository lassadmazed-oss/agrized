-- 0102 · «زيتونتي» للحريف نفسه — the same file, opened by the person it is about.
--
-- Its test is supabase/tests/064_client_zitounti.sql. Dry-run both together before applying:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0102_client_zitounti.sql \
--     supabase/tests/064_client_zitounti.sql
--
-- ---------------------------------------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------------------------------------
-- 0068 built the CONTENT of زيتونتي and refused to invent its door, because in September the door did not
-- exist: no auth user carried the role 'client', public.persons.profile_id was null on every row, and a
-- policy for a client who cannot sign in is a policy no test can prove. It wrote the day out instead, at the
-- end of its own file, section 6: «THE DAY A CLIENT CAN SIGN IN — the three things that change».
--
-- 0096 was that day. It issues a one-time code by SMS, checks it, and writes persons.profile_id for the first
-- time in this schema's life. src/lib/client-auth.ts turns the proven phone number into a Supabase session
-- and currentClient() reads the person back out of the table by that link.
--
-- So today a buyer can sign in and has no file to open. public.staff_zitounti_file is gated on app.is_staff()
-- AND app.can_see_person(), which is exactly right for the Back Office and exactly wrong for the client: a
-- signed-in buyer holds neither. That is the one thing this file fixes, and it is item 3 of 0068's list,
-- written the way 0068 sketched it.
--
-- ---------------------------------------------------------------------------------------------------------
-- WHY IT TAKES NO ARGUMENT — the whole security design in one sentence
-- ---------------------------------------------------------------------------------------------------------
-- public.my_zitounti_file() has no parameter, so there is no id for a buyer to tamper with. The identity
-- comes from auth.uid() and is resolved through public.persons.profile_id, which is `unique`, so one auth
-- user is one person and one person is one file. An attacker holding a valid client session cannot ask for
-- somebody else's file because THERE IS NOWHERE TO PUT THE REQUEST. This is stronger than checking a
-- parameter against the session, because a check can be forgotten in a later edit and a missing parameter
-- cannot.
--
-- ---------------------------------------------------------------------------------------------------------
-- ONE ASSEMBLY, TWO DOORS — what this file actually restructures, and why that is not a rewrite
-- ---------------------------------------------------------------------------------------------------------
-- The naive way to add a client entry point is to copy staff_zitounti_file's body and delete two gates. That
-- copy is precisely the mistake this repository already paid for once: 0072 created app.zitounti_contracts
-- and app.zitounti_installments and could not rewire 0068's function, so the client file said «يُبنى في دفعة
-- قادمة» over money that existed for three months, until 0095 plugged it in. Two bodies assembling one
-- payload drift, and they drift silently, because the screen keeps rendering.
--
-- So the twelve sections and the money totals move ONCE into app.zitounti_file(person, for_client), and both
-- doors call it:
--
--   public.staff_zitounti_file(uuid)  → module gate · is_staff · can_see_person  → app.zitounti_file(p, false)
--   public.my_zitounti_file()         → module gate · auth.uid() → person        → app.zitounti_file(p, true)
--
-- staff_zitounti_file keeps its name, its signature, its three gates and its payload to the key — nothing in
-- src/ or in supabase/tests changes, `npm run db:types` produces the same types — and the guarantee the
-- parallel client UI needs («one component draws both») becomes structural instead of a promise: the two
-- payloads cannot differ, because there is one jsonb_build_object.
--
-- The section readers themselves are untouched. app.zitounti_person, _trees, _requests, _reservations,
-- _visits, _payments, _operations, _subscription, _harvest (0068), _contracts, _installments (0072) and
-- _documents (0095) are CALLED, never copied — including app.contract_money, so the client's «المدفوع
-- والمتبقي» is the same arithmetic Finance reads and the two cannot disagree by a millime.
--
-- WHAT IT DOES NOT TOUCH: no table, no column, no enum, no trigger, no policy, no flag state. The `zitounti`
-- flag stays exactly as the owner left it — this file opens a door and does not walk through it.


-- ===========================================================================
-- 0 · REFUSE RATHER THAN HALF-RUN
-- ===========================================================================

do $guard$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'staff_zitounti_file') then
    raise exception
      'public.staff_zitounti_file is missing. This file re-points it at a shared builder and adds the client door beside it; apply 0068_zitounti.sql first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'zitounti_documents') then
    raise exception
      'app.zitounti_documents is missing, so staff_zitounti_file is still 0068''s version with three unplugged sockets. Re-emitting it from here would quietly undo 0095; apply 0095_zitounti_after_sale.sql first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'contract_money') then
    raise exception
      'app.contract_money is missing. The client''s «المدفوع والمتبقي» is read from it and is never re-derived; apply 0072_contracts_installments.sql first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'link_client_profile') then
    raise exception
      'public.link_client_profile is missing, so nothing in this schema ever writes public.persons.profile_id and my_zitounti_file() could never resolve a person. Apply 0096_client_login.sql first.';
  end if;
  -- The link itself. Named explicitly because the ENTIRE identity of the client door rests on this one column
  -- being unique: without the unique constraint, two persons could point at one auth user and «my file» would
  -- be whichever row the planner returned first.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'persons' and column_name = 'profile_id') then
    raise exception
      'public.persons.profile_id is missing. It is how a session becomes a person; apply 0002_reference_and_crm.sql first.';
  end if;
end $guard$;


-- ===========================================================================
-- 1 · WHAT A BUYER MAY SEE OF THEMSELVES — the two fields that must not cross
-- ===========================================================================

-- app.zitounti_person returns twelve fields, and TEN of them are the client's own record: their name, their
-- phone, their WhatsApp, their e-mail, where they live, when they joined, whether the file is archived and
-- whether an account is linked to it. A client reading those reads themselves.
--
-- TWO ARE NOT ABOUT THE CLIENT AT ALL, and both would do real damage on a client's screen:
--
--   status_ar — the CRM lead status (public.lead_statuses.label_ar). It is AgriZed's own judgement of a lead,
--     written by a commercial for a commercial: «غير مهتم حالياً», «رقم غالط», «مشكوك فيه». It is not a fact
--     about the buyer, it is an opinion about them, and a buyer who opens their file and reads «غير مهتم
--     حالياً» has been told something nobody chose to tell them. This is the field this section exists for.
--
--   assigned_to — the name of the commercial who holds the file. It looks harmless and even friendly, and it
--     is still wrong HERE: the assignment changes without anybody telling the client (0087 widened who may
--     be assigned; 0084/0085 move files between desks routinely), the value is a staff member's internal
--     profile name rather than a contact anybody chose to publish, and it is a second person's personal data
--     riding inside a payload keyed by the buyer. If the owner wants «مسؤول متابعتك» on the client's screen
--     that is a deliberate feature with a name and a number the owner controls in `settings` — not a CRM
--     column that leaked because it was already in the object.
--
-- AN ALLOWLIST, NOT A DELETE LIST, and that choice is the point. `v_person - 'status_ar' - 'assigned_to'`
-- would work today and would fail the day somebody adds a thirteenth field to app.zitounti_person: a new
-- staff-only column would reach every buyer's screen with no edit to this file and no test turning red.
-- Naming what may cross means the failure mode is a missing field on a screen, which somebody notices in a
-- minute, instead of a leak, which nobody notices at all.
create or replace function app.zitounti_person_client(p_person jsonb) returns jsonb
language sql immutable set search_path = '' as $fn$
  select jsonb_object_agg(e.key, e.value)
    from jsonb_each(p_person) e
   where e.key = any (array[
           -- Their own identity, as the intake recorded it.
           'id', 'full_name', 'phone_e164', 'whatsapp_e164', 'email',
           'governorate', 'delegation', 'created_at',
           -- Kept for shape parity with the staff payload so one component draws both. `archived` is always
           -- false on this path (section 3 refuses an archived file before it is built) and `has_account` is
           -- always true (they are reading it through an account), but a screen that reads the same keys in
           -- both places is a screen with one code path.
           'archived', 'has_account'])
$fn$;
revoke execute on function app.zitounti_person_client(jsonb) from public, anon, authenticated;

comment on function app.zitounti_person_client(jsonb) is
  'Projects app.zitounti_person''s object down to the fields a buyer may read about themselves. An allowlist on purpose: status_ar (the CRM lead status — AgriZed''s opinion of a lead, never shown to the lead) and assigned_to (another person''s name, and an assignment that changes without telling the client) must not cross, and a field added to app.zitounti_person tomorrow must not cross either until somebody names it here.';


-- ===========================================================================
-- 2 · THE FILE ITSELF — assembled once, for both doors
-- ===========================================================================

-- 0095's body, moved here verbatim. The only additions are the two lines that trim the person for a client,
-- and the `invalid_person` raise that used to sit in the entry point.
--
-- IT ASSERTS NOTHING ABOUT WHO IS ASKING, on purpose: the gates belong at the doors, because the two doors
-- have different rules (staff: is_staff + can_see_person; client: this session's own person and nothing
-- else). This function is the builder, and it is revoked from every caller a request can run as, so it can
-- only ever be reached through a door that has already decided.
--
-- THE MODULE GATES INSIDE EACH SECTION STAY EXACTLY AS THEY WERE. A section whose module is off answers
-- 'closed' and not an empty list, because «the owner has not switched this on» and «you have none» are
-- different answers and the screen prints different sentences for them.
create or replace function app.zitounti_file(p_person uuid, p_for_client boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_person jsonb;
  v_money  jsonb;
begin
  v_person := app.zitounti_person(p_person);
  if v_person is null then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;

  -- Section 1. Nothing else in the payload differs between the two doors.
  if p_for_client then
    v_person := app.zitounti_person_client(v_person);
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
           where c.person_id = p_person and c.status in ('signed', 'completed')) m;

  return jsonb_build_object(
    'person', v_person,
    'trees', app.zitounti_section('ok', app.zitounti_trees(p_person)),
    'requests', app.zitounti_section('ok', app.zitounti_requests(p_person)),
    'reservations', case when app.module_open('reservations')
                         then app.zitounti_section('ok', app.zitounti_reservations(p_person))
                         else app.zitounti_section('closed', null) end,
    'visits', case when app.module_open('visits')
                   then app.zitounti_section('ok', app.zitounti_visits(p_person))
                   else app.zitounti_section('closed', null) end,
    'payments', case when app.module_open('reservations') or app.module_open('installments')
                     then app.zitounti_section('ok', app.zitounti_payments(p_person))
                     else app.zitounti_section('closed', null) end,
    'operations', case when not app.module_open('agri_backoffice') then app.zitounti_section('closed', null)
                       when app.zitounti_operations(p_person) is null then app.zitounti_section('not_built', null)
                       else app.zitounti_section('ok', app.zitounti_operations(p_person)) end,
    'subscription', case when not app.module_open('subscriptions') then app.zitounti_section('closed', null)
                         when app.zitounti_subscription(p_person) is null then app.zitounti_section('not_built', null)
                         else app.zitounti_section('ok', app.zitounti_subscription(p_person)) end,
    'harvest', case when not app.module_open('harvest') then app.zitounti_section('closed', null)
                    when app.zitounti_harvest(p_person) is null then app.zitounti_section('not_built', null)
                    else app.zitounti_section('ok', app.zitounti_harvest(p_person)) end,
    'contracts', case when app.module_open('contracts')
                      then app.zitounti_section('ok', app.zitounti_contracts(p_person))
                      else app.zitounti_section('closed', null) end,
    'installments', case when app.module_open('installments')
                         then app.zitounti_section('ok', app.zitounti_installments(p_person))
                         else app.zitounti_section('closed', null) end,
    -- Not module-gated: a signed contract and an offer plan are documents the client has whatever switch is
    -- on, and there is no `documents` module to gate it on.
    'documents', app.zitounti_section('ok', app.zitounti_documents(p_person)),

    'totals', jsonb_build_object(
      'trees', (select count(*) from public.trees t where t.held_by = p_person),
      'trees_sold', (select count(*) from public.trees t where t.held_by = p_person and t.state = 'sold'),
      'trees_reserved', (select count(*) from public.trees t where t.held_by = p_person and t.state = 'reserved'),
      'offers', (select count(distinct t.project_id) from public.trees t where t.held_by = p_person),
      'paid_millimes', case when app.module_open('reservations') or app.module_open('installments')
                            then (select coalesce(sum(pm.amount_millimes), 0) from public.payments pm
                                   where pm.person_id = p_person and pm.voided_at is null) end,
      -- «المدفوع والمتبقي» proper: what the contracts say, beside the receipts above. The two answer
      -- different questions — `paid_millimes` is every millime this person ever handed over, including a
      -- عربون on a hold that never became a contract; `money` is what their live contracts account for.
      'money', case when app.module_open('contracts') or app.module_open('installments') then v_money end),
    'read_at', now());
end $fn$;

revoke execute on function app.zitounti_file(uuid, boolean) from public, anon, authenticated;

comment on function app.zitounti_file(uuid, boolean) is
  'Builds the فضاء «زيتونتي» payload for one person by calling the app.zitounti_* readers — the single assembly behind public.staff_zitounti_file (for_client = false) and public.my_zitounti_file (true). Decides nothing about who may read it: the two entry points carry their own gates and this one is revoked from anon and authenticated. With for_client it drops the CRM lead status and the assigned commercial through app.zitounti_person_client; everything else is identical, so one screen component can draw either payload.';


-- ===========================================================================
-- 3 · THE STAFF DOOR — the same function, now calling the shared builder
-- ===========================================================================

-- Byte-for-byte the same three gates in the same order as 0095, and the same signature, so every caller in
-- src/ and every existing test is untouched. Only the body's tail changed: the payload it used to assemble
-- itself is now assembled by section 2.
create or replace function public.staff_zitounti_file(p_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not app.module_open('zitounti') then
    raise exception 'module_closed' using errcode = 'P0001';
  end if;
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- A commercial reads their own clients; Finance, Legal and Admin read every one; the agricultural manager
  -- runs the grove and does not read client identities at all — the same rule the CRM has enforced since
  -- 0002, applied here rather than restated.
  if not app.can_see_person(p_person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return app.zitounti_file(p_person_id, false);
end $fn$;

revoke execute on function public.staff_zitounti_file(uuid) from public, anon;
grant execute on function public.staff_zitounti_file(uuid) to authenticated;

comment on function public.staff_zitounti_file(uuid) is
  'فضاء «زيتونتي» for one person, read by staff: their numbered trees per offer, what they asked for and were quoted, their reservations, visits and receipts, their contracts, instalment schedule and documents, and the agricultural operations, subscription and harvest share once those records exist (v3 §38, §39). Reads only; writes nothing. Gated on the `zitounti` flag, on app.is_staff and on app.can_see_person. The payload is built by app.zitounti_file, the same assembly public.my_zitounti_file uses, so the file the client sees and the file the commercial reads to them down the phone cannot drift apart. Money comes from app.contract_money, the same function Finance reads.';


-- ===========================================================================
-- 4 · THE CLIENT DOOR — no parameter, because there is nothing to choose
-- ===========================================================================

-- The three refusals, each with its own named sentence, because the screen prints a different thing for each
-- and «something went wrong» is not one of them:
--
--   module_closed   the owner has not opened the module to buyers yet. The `zitounti` flag is THREE-STATE
--                   (0020: public · internal · disabled) and that middle state is doing real work here:
--                   app.module_open returns app.is_staff() for 'internal', so on 'internal' the Back Office
--                   reads client files and NO BUYER CAN OPEN THEIRS. That is the staging state — the owner
--                   checks a few real files before the door opens to everybody — and it costs nothing to
--                   support because it is the flag's own semantics. The screen says
--                   settings['zitounti.closed_note'], which is written for exactly this moment.
--   not_signed_in   there is no session. Reachable through PostgREST only for an `authenticated` role with a
--                   token that carries no `sub`, which is a broken caller rather than an attacker — but it
--                   is named rather than returned as a null payload, because a screen that receives an empty
--                   file draws an empty file and a screen that receives an error redirects to the login.
--   no_file         signed in, and no person is linked to this auth user. This is NOT «you have nothing yet»
--                   — a buyer with no trees still has a file, with honest empty sections. It means the link
--                   0096 writes is absent, which after a normal sign-in cannot happen, so the screen must
--                   say «اتصل بينا» and not «ما عندكش زيتونات».
--
-- ARCHIVED FILES ANSWER `no_file` TOO, and that is a deliberate reading of the contract rather than a third
-- reason. public.persons.archived_at has no writer in this schema yet (nothing has ever set it), and 0096
-- already refuses to send a login code to an archived person — so the door closes before the file does and
-- the only way to reach this branch is an old session on a file archived under it. To that client the honest
-- sentence is the same one `no_file` prints: we have nothing to show you here, please call us. Inventing a
-- third error name for a state nothing writes would put a branch in the client UI that no screen would ever
-- draw, and the UI is being written against this contract in parallel.
--
-- WHAT IT DOES NOT CHECK, and why. Not the `client` role. link_client_profile grants it, but the role is
-- bookkeeping and persons.profile_id is the proof: requiring both would mean a buyer whose role row was lost
-- reads nothing while the link says plainly whose file this is. One proof, the strongest one, checked once.
create or replace function public.my_zitounti_file() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_person uuid;
begin
  if not app.module_open('zitounti') then
    raise exception 'module_closed' using errcode = 'P0001';
  end if;
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- THE ONLY LOOKUP IN THIS FUNCTION, and the reason it needs no parameter. profile_id is unique, so this is
  -- one row or none; `archived_at is null` is argued above.
  select p.id into v_person
  from public.persons p
  where p.profile_id = v_uid and p.archived_at is null;

  if v_person is null then
    raise exception 'no_file' using errcode = 'P0001';
  end if;

  return app.zitounti_file(v_person, true);
end $fn$;

-- THE GRANT IS THE SECURITY BOUNDARY, together with the missing parameter. A visitor gets nothing: `anon` is
-- revoked, so a buyer who has not signed in is refused by Postgres before a line of this body runs.
revoke execute on function public.my_zitounti_file() from public, anon;
grant execute on function public.my_zitounti_file() to authenticated;

comment on function public.my_zitounti_file() is
  'فضاء «زيتونتي» as the buyer reading it sees it. Takes NO argument on purpose: the person is resolved from auth.uid() through public.persons.profile_id (unique), so a client session can only ever reach its own file and there is no id to tamper with. Same payload as public.staff_zitounti_file — one shared assembly, app.zitounti_file — minus the CRM lead status and the assigned commercial, which are staff facts about a lead and not facts about the buyer. Gated on the `zitounti` module: on state `internal` staff read client files and no buyer can open theirs, which is the staging state. Raises module_closed, not_signed_in or no_file, each a sentence the screen prints differently. Granted to authenticated, revoked from anon.';
