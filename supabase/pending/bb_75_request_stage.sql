-- bb_75 · وين وصل هذا المطلب — THE STAGE OF ONE REQUEST.
--
-- DRAFT. NOT APPLIED. It needs bb_70_journey.sql applied first — see DEPENDS ON below. Dry-run the chain
-- (it always rolls back):
--   node --env-file=.env scripts/db-dry-run.mjs \
--     supabase/pending/bb_70_journey.sql supabase/pending/bb_75_request_stage.sql \
--     supabase/tests/050_request_stage.sql
--
-- WHY THIS FILE EXISTS, IN ONE PARAGRAPH. The owner, 2026-09-25: «كيف نحب نشوف المطلب متاعي أنا وين — فما
-- حاجة ناقصة في الواحد». The request file prints every answer the client typed and says NOTHING about where
-- the request stands, because a request has no stage and never had one: public.interest_requests has no
-- status column, and the only stage in the product hangs off the PERSON (public.persons.status_id, and
-- bb_70's derived app.person_stage). A person is not a request. A client who asked about تنيور in March and
-- about المطار in August is ONE person with ONE stage, and that single answer is wrong for at least one of
-- the two demands — «اختار الزيتونات» on the second says nothing about the first, and the funnel counts him
-- once at whichever is higher. This file gives the request its own answer.
--
-- IT ADDS NO COLUMN AND NO STATUS. Same rule bb_70 obeys and for the same reason: a stage that is WRITTEN
-- can drift, be forgotten, and be wrong in a way nobody can see. Everything below is DERIVED from rows that
-- already exist, and it writes nothing — no trigger, no column, no update.
--
-- AND IT DERIVES NOTHING OF ITS OWN. The thirteen stages, their ranks, their Arabic labels and their
-- lead_stage mapping all come from app.journey_spine() in bb_70. This file changes ONE thing about bb_70's
-- derivation — the column it filters on — and nothing else. Two spines is the exact failure bb_74's header
-- refused when it deleted its own copy rather than merge it: the funnel would say one thing, the request
-- file another, both computed, both defensible, and nobody able to say which is the product.
--
-- WHAT IT ADDS
--   · app.request_stage(uuid)          ONE stage for ONE request, derived, with the row that proves it
--   · public.staff_request_journey     «وين وصل هذا المطلب» — the stage, the path, and this request's own ids
--   · public.staff_request_stage       the same stage for a LIST of requests (the requests screen)
--
-- ---------------------------------------------------------------------------------------------------------
-- DEPENDS ON supabase/pending/bb_70_journey.sql
-- ---------------------------------------------------------------------------------------------------------
-- app.journey_spine(), app.journey_proof() and app.journey_stage_label() live in that draft. Section 0
-- refuses to run without them, in one sentence, rather than failing halfway with a raw «function does not
-- exist». bb_70 is not optional and is not being worked around: this file is the second reader on the same
-- spine, which is the whole design.
--
-- ---------------------------------------------------------------------------------------------------------
-- THE ONE PLACE A REQUEST CANNOT ANSWER FOR ITSELF, STATED PLAINLY
-- ---------------------------------------------------------------------------------------------------------
-- Ten of the thirteen stages are exactly as per-request as bb_70's are per-person, because the sale chain
-- already carries the demand it came from — and this was checked column by column, not assumed:
--
--   public.trees.request_id         0054:237
--   public.reservations.request_id  0063:288
--   public.visits.request_id        0064:170
--   public.contracts.request_id     0072 (create table public.contracts)
--
-- public.contact_attempts does NOT carry one, and should not: a call is placed to a PERSON on a phone
-- number, and the agent who dials is not choosing a demand. So stage 2 «تم الاتصال» cannot be proven per
-- request, and this file does the only honest thing with it: it counts a call only when the call happened
-- AT OR AFTER the request was created, because a call placed before the demand existed certainly was not
-- about it, and it MARKS that proof person_scoped:true so the screen can say so out loud instead of implying
-- somebody phoned about this particular request. Stage 3 «مؤهَّل» and stage 10 «موعد العقد» have no fact
-- anywhere in this database, per request or per person — bb_70 says so and this file inherits it unchanged.


-- ===========================================================================
-- 0 · REFUSE RATHER THAN HALF-RUN
-- ===========================================================================

do $guard$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'journey_spine') then
    raise exception
      'supabase/pending/bb_70_journey.sql is not applied, and this file derives every stage from its spine. Apply or dry-run them together: node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_70_journey.sql supabase/pending/bb_75_request_stage.sql';
  end if;
  if to_regclass('public.contracts') is null then
    raise exception
      'public.contracts is missing. Stages 9-13 are derived from it; apply 0072_contracts_installments.sql first.';
  end if;
end $guard$;


-- ===========================================================================
-- 1 · THE DERIVATION — the same thirteen, read down one request
-- ===========================================================================

-- WHERE IS THIS REQUEST. Read in rank order from the top; the first fact that answers wins, and the function
-- returns it and stops. One return value carrying one key is what makes «a request cannot be in two stages»
-- a property of the code rather than a rule somebody has to remember — the same guarantee app.person_stage
-- gives, and deliberately the same shape, so a screen can draw either one with the same component.
--
-- NO ROLE CHECK HERE, ON PURPOSE. This is app., revoked from everybody, and both public.* entry points below
-- check app.is_staff() and app.can_see_person() before they call it. Putting the check here too would make a
-- list of 200 requests run 200 role lookups for an answer its caller already has. Same argument as bb_70.
--
-- WHAT A CLOSED RECORD DOES, unchanged from bb_70: a cancelled contract, an expired hold and a cancelled
-- hold are IGNORED, and the request falls back to the highest stage still proven. A demand whose hold lapsed
-- should reappear at «تمت الزيارة» so somebody calls about it, not sit at «حجز» forever holding a place in a
-- count.
create or replace function app.request_stage(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_r     public.interest_requests;
  v_id    uuid;
  v_at    timestamptz;
  v_ref   text;
  v_n     bigint;
begin
  if p_request is null then
    return null;
  end if;
  select * into v_r from public.interest_requests r where r.id = p_request;
  if not found then
    return null;
  end if;

  -- 13 · مالك. v2 §38: ownership is a legal act after the signature, not the last instalment.
  select c.id, c.owned_at, c.reference_no into v_id, v_at, v_ref
  from public.contracts c
  where c.request_id = p_request and c.status <> 'cancelled' and c.owned_at is not null
  order by c.owned_at desc limit 1;
  if found then return app.journey_proof('owner', 'contract', v_id, v_ref, v_at); end if;

  -- 12 · تم إتمام البيع. 0072 sets and unsets 'completed' from the payments themselves, so voiding a receipt
  -- walks this stage back with it.
  select c.id, coalesce(c.settled_at, c.updated_at), c.reference_no into v_id, v_at, v_ref
  from public.contracts c
  where c.request_id = p_request and c.status = 'completed'
  order by c.settled_at desc nulls last limit 1;
  if found then return app.journey_proof('sale_completed', 'contract', v_id, v_ref, v_at); end if;

  -- 11 · العقد ممضي.
  select c.id, coalesce(c.signed_on::timestamptz, c.updated_at), c.reference_no into v_id, v_at, v_ref
  from public.contracts c
  where c.request_id = p_request and c.status = 'signed'
  order by c.signed_on desc nulls last limit 1;
  if found then return app.journey_proof('contract_signed', 'contract', v_id, v_ref, v_at); end if;

  -- 10 · موعد العقد محدد — NO FACT, inherited from bb_70. §19's appointment has no table in this database.

  -- 9 · في القسم القانوني. A contract exists as a draft: the reservation is already 'converted' and its trees
  -- already 'sold' (0072 does all three in one transaction), which is why stages 6-8 cannot also match.
  select c.id, c.created_at, c.reference_no into v_id, v_at, v_ref
  from public.contracts c
  where c.request_id = p_request and c.status = 'draft'
  order by c.created_at desc limit 1;
  if found then return app.journey_proof('legal_processing', 'contract', v_id, v_ref, v_at); end if;

  -- 8 · العربون مدفوع. deposit_paid_at and not status='deposit_paid': the timestamp survives the reservation
  -- being converted by a contract that was later cancelled, and the money did arrive.
  select r.id, r.deposit_paid_at, r.reference_no into v_id, v_at, v_ref
  from public.reservations r
  where r.request_id = p_request and r.status not in ('expired', 'cancelled') and r.deposit_paid_at is not null
  order by r.deposit_paid_at desc limit 1;
  if found then return app.journey_proof('deposit_paid', 'reservation', v_id, v_ref, v_at); end if;

  -- 7 · حجز.
  select r.id, r.reserved_at, r.reference_no into v_id, v_at, v_ref
  from public.reservations r
  where r.request_id = p_request and r.status not in ('expired', 'cancelled')
  order by r.reserved_at desc limit 1;
  if found then return app.journey_proof('reservation', 'reservation', v_id, v_ref, v_at); end if;

  -- 6 · اختيار الزيتونات. Trees held against THIS demand with no reservation behind them. A tree whose
  -- reservation_id is set is already counted by stage 7.
  select max(t.allocated_at), count(*) into v_at, v_n
  from public.trees t
  where t.request_id = p_request and t.state <> 'available' and t.reservation_id is null;
  if v_at is not null then
    return app.journey_proof('trees_selected', 'trees', null, v_n::text, v_at);
  end if;

  -- 5 · تمت الزيارة.
  select v.id, coalesce(v.status_changed_at, v.updated_at), v.visit_no into v_id, v_at, v_ref
  from public.visits v
  where v.request_id = p_request and v.status = 'completed'
  order by v.visit_date desc, v.status_changed_at desc limit 1;
  if found then return app.journey_proof('visit_completed', 'visit', v_id, v_ref, v_at); end if;

  -- 4 · موعد زيارة محدد. 'requested' and 'confirmed' both count: §6 passes the file on «at confirmation», and
  -- a requested visit is a booked visit waiting for a yes, not nothing.
  select v.id, v.created_at, v.visit_no into v_id, v_at, v_ref
  from public.visits v
  where v.request_id = p_request and v.status in ('requested', 'confirmed')
  order by v.visit_date, v.slot_from nulls last limit 1;
  if found then return app.journey_proof('visit_scheduled', 'visit', v_id, v_ref, v_at); end if;

  -- 3 · مؤهَّل — NO FACT, inherited from bb_70.

  -- 2 · تم الاتصال — THE ONE PERSON-SCOPED ANSWER, and it says so.
  --
  -- public.contact_attempts has no request_id and must not grow one: an agent dials a PERSON on a phone
  -- number and is not picking a demand while the phone rings. So the narrowest defensible rule is used —
  -- the call counts for this request only if it happened AT OR AFTER the request arrived, because a call
  -- placed before the demand existed was certainly about something else. It can still be a call about the
  -- client's OTHER demand, which is why the proof carries person_scoped:true and the screen prints the
  -- softer sentence rather than implying somebody phoned about this row.
  select a.id, a.created_at into v_id, v_at
  from public.contact_attempts a
  where a.person_id = v_r.person_id and a.created_at >= v_r.created_at
  order by a.created_at desc limit 1;
  if found then
    -- The flag goes INSIDE the proof, because it is a fact about the proof and not about the stage: the
    -- stage really is «تم الاتصال», and what is person-scoped is the row offered as evidence for it. That
    -- also keeps the stage object byte-identical in shape to app.person_stage's, so one component draws both.
    return jsonb_set(
      app.journey_proof('contacted', 'contact_attempt', v_id, null, v_at),
      '{proof,person_scoped}', 'true'::jsonb);
  end if;

  -- 1 · مطلب جديد. The floor, and unlike bb_70's it can never be anything else: a request row IS the demand,
  -- so its own created_at dates the stage and its own number proves it. bb_70 needed a fallback here for a
  -- client the commercial met on the phone with no demand at all; a request always has one, itself.
  return app.journey_proof('lead', 'request', v_r.id, v_r.request_no, v_r.created_at);
end $fn$;
revoke execute on function app.request_stage(uuid) from public, anon, authenticated;

comment on function app.request_stage(uuid) is
  'WHERE one demand is, derived from the facts recorded against THAT demand: contract > reservation + عربون > held trees > visit > call > the demand itself, read in rank order, first answer wins. Same thirteen stages as app.person_stage and the same spine; the difference is the column it filters on (request_id, not person_id), so a client with three demands has three answers instead of one. Writes nothing, reads no feature flag. Stage 2 is person-scoped and marks itself so.';


-- ===========================================================================
-- 2 · THE IDS THIS DEMAND REACHED — §26 threaded down one request
-- ===========================================================================

-- bb_70's JourneyIds answers «which visit, which hold, which contract» FOR THE PERSON, which on a client
-- with two demands is a mix: the visit from one and the contract from the other, side by side, with nothing
-- saying they belong to different deals. These are the same five identifiers read down ONE request, so the
-- request file can print «زيارة AGZ-VIS-12 · حجز AGZ-RES-7» and have both be about the row on screen.
--
-- CLOSED RECORDS ARE EXCLUDED HERE TOO, for the same reason as section 1: a cancelled contract is history,
-- and history belongs on the timeline, not in the line that says what this demand currently holds.
create or replace function app.request_ids(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_r      public.interest_requests;
  v_visit  text;
  v_res    text;
  v_ctr    text;
  v_trees  bigint;
begin
  select * into v_r from public.interest_requests r where r.id = p_request;
  if not found then
    return null;
  end if;

  select v.visit_no into v_visit
  from public.visits v
  where v.request_id = p_request and v.status <> 'cancelled'
  order by v.visit_date desc nulls last limit 1;

  select r.reference_no into v_res
  from public.reservations r
  where r.request_id = p_request and r.status not in ('expired', 'cancelled')
  order by r.reserved_at desc limit 1;

  select c.reference_no into v_ctr
  from public.contracts c
  where c.request_id = p_request and c.status <> 'cancelled'
  order by c.created_at desc limit 1;

  select count(*) into v_trees
  from public.trees t
  where t.request_id = p_request and t.state <> 'available';

  return jsonb_build_object(
    'request_id',      v_r.id,
    'request_no',      v_r.request_no,
    'person_id',       v_r.person_id,
    'project_id',      v_r.project_id,
    'project_code',    v_r.project_code,
    'project_name',    v_r.project_name,
    'request_kind',    v_r.request_kind,
    'offer_trees',     v_r.offer_trees,
    'visit_no',        v_visit,
    'reservation_no',  v_res,
    'contract_no',     v_ctr,
    'trees_held',      coalesce(v_trees, 0));
end $fn$;
revoke execute on function app.request_ids(uuid) from public, anon, authenticated;

comment on function app.request_ids(uuid) is
  'The identifiers ONE demand reached — its visit, its hold, its contract and how many olive trees it holds — so a request file can print them knowing every one belongs to the row on screen, which bb_70''s person-level version cannot promise for a client with two demands. Closed records are excluded; they stay on the timeline.';


-- ===========================================================================
-- 3 · THE ENTRY POINTS — role-checked, one request and many
-- ===========================================================================

-- «وين وصل هذا المطلب». One call, one payload: the derived stage with its proof, the whole path with what
-- this demand has reached, and the identifiers it carries. The request file draws all of it without a second
-- round trip and without computing anything itself.
--
-- WHY IT RETURNS THE SPINE TOO. A band that shows only the current stage tells you where you are and not how
-- far that is; the owner asked to SEE where the request stands, and «العربون مدفوع» means little to a reader
-- who cannot see it is the eighth of thirteen. Same payload shape as bb_70's staff_customer_journey, so the
-- same component draws both.
create or replace function public.staff_request_journey(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_r     public.interest_requests;
  v_stage jsonb;
  v_rank  integer;
  v_spine jsonb;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_r from public.interest_requests r where r.id = p_request;
  if not found then
    return null;
  end if;

  -- §27 is a SECURITY requirement, not a layout preference. A commercial reads their own files; Admin,
  -- Finance and Legal read every one. The demand is narrowed by the person it belongs to, which is the same
  -- line every other CRM reader in this product draws.
  if not app.can_see_person(v_r.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_stage := app.request_stage(p_request);
  v_rank  := (v_stage->>'rank')::integer;

  -- The path, with what has been reached. `reached` is rank <= current, which is how a band is drawn — but a
  -- stage with has_fact:false was never PROVEN even when it is behind the current one, so it is marked and a
  -- screen draws it hollow instead of claiming something nobody recorded.
  select coalesce(jsonb_agg(s || jsonb_build_object(
           'reached', (s->>'rank')::integer <= v_rank,
           'current', (s->>'rank')::integer = v_rank)
         order by (s->>'rank')::integer), '[]'::jsonb)
  into v_spine
  from jsonb_array_elements(app.journey_spine()) s;

  return jsonb_build_object(
    'stage',   v_stage,
    'spine',   v_spine,
    'ids',     app.request_ids(p_request),
    'unknown', app.setting_text('journey.unknown_label', 'غير معروف'));
end $fn$;
revoke execute on function public.staff_request_journey(uuid) from public, anon;
grant execute on function public.staff_request_journey(uuid) to authenticated;

comment on function public.staff_request_journey(uuid) is
  'وين وصل هذا المطلب — the derived stage of ONE demand with the row that proves it, the thirteen-stage path with what this demand reached, and the identifiers it carries. Null when the demand does not exist; forbidden when the caller may not see its client (§27).';


-- THE LIST VERSION. The requests screen draws a stage on every row, and 200 rows must not be 200 round
-- trips. Same cap and same shape as bb_70's staff_person_stage, for the same reason: one call must not walk
-- the whole table.
create or replace function public.staff_request_stage(p_request_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_cap integer := 500;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    return '[]'::jsonb;
  end if;
  if cardinality(p_request_ids) > v_cap then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('request_id', x.id, 'stage', app.request_stage(x.id)))
    from (select distinct r.id from public.interest_requests r
          where r.id = any (p_request_ids) and app.can_see_person(r.person_id)) x), '[]'::jsonb);
end $fn$;
revoke execute on function public.staff_request_stage(uuid[]) from public, anon;
grant execute on function public.staff_request_stage(uuid[]) to authenticated;

comment on function public.staff_request_stage(uuid[]) is
  'The derived stage for up to 500 demands in one call, so a requests list can draw where each one stands. Demands whose client the caller may not see are simply absent from the answer — never nulled, never counted.';
