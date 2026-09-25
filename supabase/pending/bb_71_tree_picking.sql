-- bb_71 · PICKING TREES BY NUMBER, AND THE FIELD COMMERCIAL'S OWN READ OF A VISIT
-- =============================================================================================================
-- DRAFT. NOT APPLIED. Dry-run only:
--     node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_71_tree_picking.sql
--
-- Owner's brief, 2026-09-21. Two of his sections have no path through the database today:
--
--   §7  «زياراتي» — the Commercial Terrain's own list. The data exists; the READ is wrong (section 1).
--   §11 «ما نحجزوش عشر زيتونات، نحجزو عشر زيتونات بأرقامها» — the commercial picks #125 to #134 on a plan and
--       the system confirms IN THAT MOMENT that they are still free. There is no function that can express a
--       chosen set: public.staff_allocate_trees and public.staff_create_reservation both take a COUNT and
--       app.allocate_offer_trees hands out «the lowest-numbered available ones» (sections 2-6).
--
-- WHAT THIS FILE DOES NOT DO, and why:
--
--   IT DOES NOT ADD A POSITION, A ZONE OR A PHOTO TO A TREE. §10 lists fourteen facts a tree should carry and
--   only three are on it (number, project, state); §11's «P1/P2/P3» has nowhere to live, because public.parcels
--   holds zero rows and supabase/pending/bb_03_parcel_layer_retires.sql deletes it. Those columns are a
--   DECISION, not a gap: whether variety, age and area are per-tree, per-zone or per-offer changes whether this
--   is three columns or nine, and copying an offer-wide value onto 8,000 rows is the one answer that is
--   certainly wrong. The owner is owed one question — «هل كل زيتونة عندها موقعها ونوعها وعمرها، ولاّ هذا كلّو
--   على مستوى العرض؟» — and the picker ships without waiting for it, drawing the offer's number line instead
--   of its geography and saying so on screen. Every function below is written so that adding zone_id and a
--   position later changes the ORDER of the plan and nothing about the picking.
--
--   IT DOES NOT ADD A TREE STATE. §24 also names «Temporarily Held» and «Blocked». The first already exists as
--   a reservation with status 'awaiting_deposit' and an expires_at, and adding an enum value for it would put
--   one fact in two places — which 0063 argues against at length. The second is genuinely missing, and it is
--   its own file: `alter type ... add value` cannot be used in the transaction that adds it, trees_holder_check
--   would refuse a blocked tree (it tests state <> 'available' ⇒ held_by not null), app.trees_clear_reservation
--   would leave a stale reservation_id, and app.offer_stock_payload's four counts would stop summing to the
--   total. Four changes in order, none of them belonging to a picker.
--
--   IT DOES NOT TOUCH bb_60_contracts_installments.sql, which is the owner's finished draft.
--
-- WHY public.staff_create_reservation IS REWRITTEN HERE, and why that is not a break. Its signature, its
-- grants, its comment, its refusals, its audit row and its return value are identical after this file; only its
-- BODY changes, and only to move the half that writes the reservation row — the deposit copied from the offer's
-- terms, the validity period, the conditions, the expiry, the first status, the reference number — into
-- app.open_reservation, so the chosen-set twin uses the same one. The alternative is two copies of the money
-- rules, and the day the owner changes the deposit rule one path changes and the other does not. The body below
-- is lifted verbatim from 0063 lines 760-840; a diff against that file is the intended way to check it.
-- =============================================================================================================


-- =============================================================================================================
-- 1 · §7 — A FIELD COMMERCIAL MUST BE ABLE TO READ THEIR OWN VISIT
-- =============================================================================================================
--
-- THIS IS A BUG, NOT A LAYOUT WISH. public.visits carries assigned_to — «المسؤول على الزيارة» — and 0064 reads
-- it, writes it and returns it. But visits_select asks app.can_see_person(person_id): who owns the LEAD. In the
-- owner's own flow the call centre owns the lead (§3) and a DIFFERENT person drives to the land (§7), so a
-- field commercial assigned to a visit on a colleague's file cannot read that visit at all — not the row, not
-- the board, and «زياراتي» is unbuildable for anyone except the lead's owner.
--
-- THE FIX IS THE VISIT'S OWN KEY, NOT A WIDER can_see_person. Widening app.can_see_person would hand that
-- commercial the whole file — the demand, the budget, the payment plan, the notes, the reservations — which is
-- exactly what §27 forbids. Widening the VISIT's read hands them the appointment and nothing else: the client's
-- name and phone, the land, the hour, the meeting point. public.interest_requests, public.person_notes,
-- public.contact_attempts and public.reservations all stay on app.can_see_person and are unchanged by this
-- file, so an assigned-but-not-owning commercial sees the visit and is told, on the screen, that the budget
-- belongs to the file's owner.
--
-- public.staff_person_visits is deliberately NOT widened: it is the CLIENT FILE's reader, and the file is still
-- not theirs.

drop policy if exists visits_select on public.visits;
create policy visits_select on public.visits for select to authenticated
  using (
    app.is_staff()
    and (app.can_see_person(person_id) or assigned_to = (select auth.uid()))
  );

comment on column public.visits.assigned_to is
  'The Commercial Terrain responsible for this visit (§7). Since bb_71 it is also a READ key: whoever is named here may read this visit row even when the lead belongs to another commercial — the appointment, never the file.';

-- The board, with the same widening. Everything else is 0064's body unchanged: the same window, the same
-- counts, the same day grouping, the same waiting list (which stays on can_see_person — an unanswered visit
-- wish is a demand, and demands are the file's).
create or replace function public.staff_visit_board(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from    date := coalesce(nullif(p->>'from', '')::date, app.tunis_today());
  v_to      date := coalesce(nullif(p->>'to', '')::date, app.tunis_today() + app.setting_int('visits.max_ahead_days', 60));
  v_status  public.visit_status;
  v_project uuid := nullif(p->>'project_id', '')::uuid;
  v_owner   uuid := nullif(p->>'assigned_to', '')::uuid;
  v_limit   integer := least(greatest(coalesce(nullif(p->>'limit', '')::integer, 200), 1), 500);
  v_rows    jsonb;
  v_days    jsonb;
  v_counts  jsonb;
  v_wait    jsonb;
  v_wait_n  integer;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p->>'status', '')), '') is not null then
    begin
      v_status := (p->>'status')::public.visit_status;
    exception when invalid_text_representation then
      raise exception 'invalid_visit_status' using errcode = 'P0001';
    end;
  end if;

  with visible as (
    select v.id, v.visit_date, v.slot_from, v.status
    from public.visits v
    where (app.can_see_person(v.person_id) or v.assigned_to = auth.uid())
      and v.visit_date between v_from and v_to
      and (v_status is null or v.status = v_status)
      and (v_project is null or v.project_id = v_project)
      and (v_owner is null or v.assigned_to = v_owner)
    order by v.visit_date, v.slot_from nulls last, v.id
    limit v_limit
  )
  select
    coalesce(jsonb_agg(app.visit_payload(x.id) order by x.visit_date, x.slot_from nulls last), '[]'::jsonb),
    jsonb_build_object(
      'total',     count(*),
      'requested', count(*) filter (where x.status = 'requested'),
      'confirmed', count(*) filter (where x.status = 'confirmed'),
      'completed', count(*) filter (where x.status = 'completed'),
      'no_show',   count(*) filter (where x.status = 'no_show'),
      'cancelled', count(*) filter (where x.status = 'cancelled'),
      'today',     count(*) filter (where x.visit_date = app.tunis_today()))
  into v_rows, v_counts
  from visible x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date', d.day,
           'visits', (select jsonb_agg(r order by (r->>'slot_from') nulls last, r->>'visit_no')
                      from jsonb_array_elements(v_rows) r
                      where (r->>'visit_date')::date = d.day))
         order by d.day), '[]'::jsonb)
  into v_days
  from (select distinct (r->>'visit_date')::date as day from jsonb_array_elements(v_rows) r) d;

  select coalesce(jsonb_agg(w order by w->>'created_at' desc), '[]'::jsonb), count(*)::integer
  into v_wait, v_wait_n
  from (
    select jsonb_build_object(
             'request_id', r.id,
             'request_no', r.request_no,
             'created_at', r.created_at,
             'request_kind', r.request_kind,
             'person_id', r.person_id,
             'person_name', pe.full_name,
             'phone_e164', pe.phone_e164,
             'contact_channel', r.contact_channel::text,
             'contact_time', r.contact_time_label_ar,
             'trees', coalesce(r.offer_trees, r.tree_count_min),
             'project_id', r.project_id,
             'project_code', r.project_code,
             'project_name', r.project_name) as w,
           r.created_at
    from public.interest_requests r
    join public.persons pe on pe.id = r.person_id
    where coalesce(r.wants_visit, false)
      and app.can_see_person(r.person_id)
      and not exists (
        select 1 from public.visits v
        where v.person_id = r.person_id
          and v.status in ('requested', 'confirmed', 'completed')
          and (r.project_id is null or v.project_id = r.project_id))
    order by r.created_at desc
    limit v_limit
  ) q;

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'today', app.tunis_today()),
    'terms', app.visit_terms(v_project),
    'statuses', app.visit_status_list(),
    'counts', v_counts,
    'days', v_days,
    'waiting', v_wait,
    'waiting_total', v_wait_n);
end $$;

revoke execute on function public.staff_visit_board(jsonb) from public, anon;
grant execute on function public.staff_visit_board(jsonb) to authenticated;

comment on function public.staff_visit_board(jsonb) is
  'The Back Office calendar of report v3 §25, as a day-grouped list, and since bb_71 also «زياراتي» of §7: every visit the reader may see between two dates — the ones on files they may see AND the ones they are named on as assigned_to — with the client, the phone, the offer, its coordinates and the meeting point, plus the counts per status, and the demands that ticked «نحب نزور الأرض» and still have no visit. Filters: from, to, status, project_id, assigned_to, limit.';


-- =============================================================================================================
-- 2 · §11 — THE ENGINE: ALLOCATE A CHOSEN SET
-- =============================================================================================================
--
-- THE SET IS NUMBERS, NOT IDS, and that is a decision. public.staff_set_tree_state takes uuid[]; this takes the
-- offer plus seq[] because (project_id, seq) is unique on public.trees, because the NUMBER is what the client
-- chose — it is painted on the tag the two of them are standing in front of — because it makes «a tree from
-- another offer» structurally impossible rather than a runtime refusal, and because the refusal has to be a
-- sentence: «زيتونة 125 تحجزت توّا» is one, a uuid is not.
--
-- FOUR PROPERTIES ARE LOAD-BEARING AND ARE COPIED DELIBERATELY FROM app.allocate_offer_trees (0054 §7). One of
-- them is pinned by supabase/tests/034_trees_intake_and_roles.sql, which asserts on pg_get_functiondef that the
-- count engine still matches /for\s+update\s+skip\s+locked/i — and that assertion is the only thing standing
-- between this product and a double sale. The same test is owed to this function.
--
--   (a) FOR UPDATE SKIP LOCKED, not plain FOR UPDATE. Plain FOR UPDATE makes session B WAIT for A, then re-read
--       the row after A committed, and B would take rows A has just allocated.
--   (b) THE UPDATE RUNS FIRST AND THE RAISE UNDOES IT. A check-then-update would open a time-of-check to
--       time-of-use window exactly where the money is.
--   (c) ONE STATEMENT, ONE TRANSACTION. PostgREST wraps each RPC in its own, so a half-allocation cannot exist.
--   (d) DETERMINISTIC LOCK ORDER (order by t.seq), so two overlapping picks queue instead of deadlocking.
--
-- AND ONE PROPERTY THAT IS NEW, AND IS THE WHOLE FEATURE:
--
--   (e) THE GUARD IS AN EXACT-SET CHECK, NOT A COUNT. Under a COUNT, SKIP LOCKED SUBSTITUTES: session B skips
--       what A holds and takes the next free numbers, which is correct and invisible — the client asked for ten
--       trees and got ten trees. Under a CHOSEN SET there is nothing to substitute. Copying `if v_n < p_trees`
--       across would catch the simple case for the WRONG REASON and would stop being sufficient the moment the
--       array holds a duplicate, a number of another offer or a number that is already reserved: all three can
--       make the arithmetic line up while the caller is handed trees they did not choose. So the numbers
--       actually locked and updated are compared, element by element, against the distinct numbers requested,
--       and anything other than equality is a refusal.
--
-- AND THE REFUSAL IS NEVER BARE (§11: «النظام يأكّد في نفس اللحظة أنها مازالت متاحة»). `trees_taken` carries,
-- in its DETAIL — which PostgREST hands back to the client as `details` — the numbers that went and a few that
-- were free at that instant. The second list is a HINT and is documented as one: under READ COMMITTED a row
-- another session has locked but not committed still reads as available, so «مازال فاضي» means «كان فاضي وقت
-- الرفض», and the screen re-reads the plan rather than trusting it.

create or replace function app.allocate_chosen_trees(
  p_project uuid, p_person uuid, p_request uuid, p_seqs integer[], p_state public.tree_state
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pj      public.projects;
  v_min     integer;
  v_want    integer[];
  v_missing integer[];
  v_ids     uuid[];
  v_got     integer[];
  v_codes   text[];
  v_taken   integer[];
  v_free    integer[];
  v_n       integer;
begin
  if p_state = 'available' then
    -- This function hands trees OUT. Putting one back on sale is stock keeping and stays
    -- public.staff_set_tree_state, which checks app.can_manage_trees.
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end if;

  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.persons ps where ps.id = p_person and ps.archived_at is null) then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;
  if p_request is not null and not exists (
       select 1 from public.interest_requests r
       where r.id = p_request and r.person_id = p_person
         and (r.project_id is null or r.project_id = p_project)) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  -- Distinct, whole, positive, ascending. Ascending matters twice: it is the lock order of (d), and it is what
  -- makes the array comparison in (e) a set comparison.
  select coalesce(array_agg(distinct x order by x), '{}') into v_want
  from unnest(coalesce(p_seqs, '{}'::integer[])) x
  where x is not null and x >= 1;

  -- Bounded exactly as public.staff_set_tree_state is, and for the same reason: one call must not lock a whole
  -- inventory (TX-00215 holds 8,000 trees). A bigger basket is several calls, each with its own reason.
  if cardinality(v_want) < 1 or cardinality(v_want) > 1000 then
    raise exception 'invalid_tree_selection' using errcode = 'P0001';
  end if;

  v_min := app.offer_min_trees(p_project);
  if cardinality(v_want) < v_min then
    raise exception 'below_min_trees' using errcode = 'P0001';
  end if;

  -- A number that is not in this offer at all is a different mistake from a number that was taken, and it gets
  -- its own code: the reader mistyped a tag, or is standing in the wrong grove. Checked before the update so
  -- the answer names every bad number, not the first one.
  select array_agg(x order by x) into v_missing
  from unnest(v_want) x
  where not exists (select 1 from public.trees t where t.project_id = p_project and t.seq = x);

  if v_missing is not null then
    raise exception 'tree_not_in_offer' using errcode = 'P0001',
      detail = jsonb_build_object('missing', to_jsonb(v_missing))::text;
  end if;

  with picked as (
    select t.id, t.seq
    from public.trees t
    where t.project_id = p_project
      and t.seq = any (v_want)
      and t.state = 'available'
    order by t.seq
    for update skip locked
  ), done as (
    update public.trees t
    set state = p_state, held_by = p_person, request_id = p_request, allocated_at = now()
    from picked
    where t.id = picked.id
    returning t.id, t.seq, t.code
  )
  select array_agg(d.id order by d.seq), array_agg(d.seq order by d.seq), array_agg(d.code order by d.seq)
  into v_ids, v_got, v_codes
  from done d;

  v_got := coalesce(v_got, '{}'::integer[]);

  -- (e). Both arrays are distinct and ascending, so equality here is set equality.
  if v_got <> v_want then
    select array_agg(x order by x) into v_taken
    from unnest(v_want) x
    where not (x = any (v_got));

    -- A hint, not a promise: see the header. Nearest free numbers to the first one that was asked for, so the
    -- commercial standing in that row is offered trees a few steps away rather than at the other end of the
    -- field.
    select array_agg(q.seq order by q.seq) into v_free
    from (
      select t.seq
      from public.trees t
      where t.project_id = p_project
        and t.state = 'available'
        and not (t.seq = any (v_want))
      order by abs(t.seq - v_want[1]), t.seq
      limit 12
    ) q;

    -- Raising undoes the update above: the offer is left exactly as it was, and the caller is told WHICH
    -- numbers moved under them instead of being handed a set they did not choose.
    raise exception 'trees_taken' using errcode = 'P0001',
      detail = jsonb_build_object(
                 'taken', to_jsonb(v_taken),
                 'free', to_jsonb(coalesce(v_free, '{}'::integer[])))::text;
  end if;

  v_n := cardinality(v_ids);

  return jsonb_build_object(
    'project_id', p_project, 'offer_code', v_pj.code, 'person_id', p_person, 'request_id', p_request,
    'state', p_state::text, 'trees', v_n,
    'first_code', v_codes[1], 'last_code', v_codes[v_n],
    'tree_ids', to_jsonb(v_ids),
    'tree_seqs', to_jsonb(v_got),
    'tree_codes', to_jsonb(v_codes));
end $$;

revoke execute on function app.allocate_chosen_trees(uuid, uuid, uuid, integer[], public.tree_state)
  from public, anon, authenticated;

comment on function app.allocate_chosen_trees(uuid, uuid, uuid, integer[], public.tree_state) is
  'The §11 engine: takes the NAMED trees of an offer for a person — all of them or none — under FOR UPDATE SKIP LOCKED, and refuses with trees_taken (DETAIL: which went, which were free) unless the set actually locked equals the set asked for. No role check: the callers gate. The count engine app.allocate_offer_trees is unchanged and still serves anyone who does not care which trees.';


-- =============================================================================================================
-- 3 · §11 — THE GATED ENTRY POINT: HOLD THE CHOSEN TREES
-- =============================================================================================================
--
-- The same gates public.staff_allocate_trees applies, word for word: a commercial acts inside their own file
-- (app.can_see_person, COM-05), the agricultural manager — who reads no client file — never allocates, and
-- 'sold' additionally needs app.can_contract_trees (Legal, Finance, Admin).

create or replace function public.staff_allocate_chosen_trees(
  p_project uuid, p_person uuid, p_request uuid, p_seqs integer[], p_state text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_state public.tree_state;
  v_out   jsonb;
begin
  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    v_state := coalesce(nullif(btrim(coalesce(p_state, '')), ''), 'reserved')::public.tree_state;
  exception when invalid_text_representation then
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end;

  if v_state = 'sold' and not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  v_out := app.allocate_chosen_trees(p_project, p_person, p_request, p_seqs, v_state);

  perform app.write_audit('trees.allocate_chosen', 'trees', p_project::text, null, v_out, null);
  return v_out;
end $$;

revoke execute on function public.staff_allocate_chosen_trees(uuid, uuid, uuid, integer[], text, text) from public, anon;
grant execute on function public.staff_allocate_chosen_trees(uuid, uuid, uuid, integer[], text, text) to authenticated;

comment on function public.staff_allocate_chosen_trees(uuid, uuid, uuid, integer[], text, text) is
  'Takes the trees a client actually chose, by their numbers in the offer (§9, §11): all of them or none. Refuses below the offer''s minimum (below_min_trees), on a number that is not in this offer (tree_not_in_offer) and when any chosen tree has just gone (trees_taken, with the numbers in DETAIL). Staff, limited to files they may see; ''sold'' needs Legal, Finance or Admin. Reason required (§51). The count version is public.staff_allocate_trees and is unchanged.';


-- =============================================================================================================
-- 4 · THE RESERVATION ROW, IN ONE PLACE
-- =============================================================================================================
--
-- Lifted verbatim from public.staff_create_reservation (0063 §8) so the two entry points below cannot drift.
-- Everything §23 and §24 decide is here and nowhere else: the deposit and the validity period copied from
-- app.offer_reservation_terms at this instant, the conditions the client is being told, the expiry computed in
-- Postgres, the first status, and the reference number. No allocation, no role check, no audit — the callers do
-- those, exactly as they did before.

create or replace function app.open_reservation(
  p_project uuid, p_person uuid, p_request uuid, p_trees integer, p_note text
) returns public.reservations
language plpgsql security definer set search_path = '' as $$
declare
  v_terms   jsonb;
  v_deposit bigint;
  v_days    integer;
  v_cond    text;
  v_year    text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_ref     text;
  v_status  public.reservation_status;
  v_expires timestamptz;
  v_row     public.reservations;
begin
  v_terms := app.offer_reservation_terms(p_project);
  if v_terms is null then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;
  v_deposit := (v_terms->>'deposit_millimes')::bigint;
  v_days    := (v_terms->>'valid_days')::integer;
  v_cond    := v_terms->>'conditions_ar';

  -- valid_days = 0 means the owner set no deadline, so there is none — not a deadline of today.
  v_expires := case when v_days > 0 then now() + make_interval(days => v_days) end;
  -- An offer that asks for nothing has nothing to await: the hold is open and settled from the start.
  v_status  := case when v_deposit > 0 then 'awaiting_deposit' else 'deposit_paid' end::public.reservation_status;

  v_ref := app.setting_text('reservation_no.prefix', 'AGZ-RES') || '-' || v_year || '-'
           || lpad(app.next_number('reservation:' || v_year)::text, 6, '0');

  insert into public.reservations (
    reference_no, person_id, project_id, request_id, status, trees_count,
    deposit_due_millimes, valid_days, conditions_ar, expires_at, deposit_paid_at,
    note, created_by, updated_by
  ) values (
    v_ref, p_person, p_project, p_request, v_status, greatest(coalesce(p_trees, 0), 1),
    v_deposit, v_days, v_cond, v_expires,
    case when v_status = 'deposit_paid' then now() end,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), auth.uid()
  ) returning * into v_row;

  return v_row;
end $$;

revoke execute on function app.open_reservation(uuid, uuid, uuid, integer, text) from public, anon, authenticated;

comment on function app.open_reservation(uuid, uuid, uuid, integer, text) is
  'Writes the reservation ROW of §23/§24 — deposit, validity, conditions, expiry, first status, reference number — all copied from app.offer_reservation_terms at this instant so a later edit of the offer cannot rewrite what a client was told. It allocates no tree, checks no role and writes no audit row: public.staff_create_reservation and public.staff_create_reservation_from_trees do those, and share this so the money rules exist once.';

-- Stamps the reservation onto the trees the allocation just took, and corrects trees_count to what was actually
-- handed out. Shared by both entry points for the same reason as above.
create or replace function app.bind_reservation_trees(p_reservation uuid, p_alloc jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_n   integer;
begin
  select array_agg(x::uuid) into v_ids
  from jsonb_array_elements_text(coalesce(p_alloc->'tree_ids', '[]'::jsonb)) x;

  update public.trees t set reservation_id = p_reservation where t.id = any (coalesce(v_ids, '{}'::uuid[]));
  v_n := coalesce(cardinality(v_ids), 0);

  update public.reservations r set trees_count = greatest(v_n, 1) where r.id = p_reservation and v_n > 0;
  return v_n;
end $$;

revoke execute on function app.bind_reservation_trees(uuid, jsonb) from public, anon, authenticated;


-- =============================================================================================================
-- 5 · public.staff_create_reservation — SAME SIGNATURE, SAME BEHAVIOUR, SHARED BODY
-- =============================================================================================================
--
-- The live count path. It is rewritten only to sit on app.open_reservation; every refusal, the audit row, the
-- return value and the grants are what 0063 wrote. Two live screens call it
-- (src/app/admin/(panel)/reservations/reserve-form.tsx and the client file's reservation card) and neither
-- changes.

create or replace function public.staff_create_reservation(
  p_project uuid, p_person uuid, p_request uuid, p_trees integer, p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_res   public.reservations;
  v_alloc jsonb;
begin
  perform app.assert_reservations_open();

  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  v_res := app.open_reservation(p_project, p_person, p_request, p_trees, p_note);

  -- The inventory half. Everything it refuses, it refuses for the whole call: raising here rolls the
  -- reservation row back with it, so a reservation whose trees were never taken cannot exist.
  v_alloc := app.allocate_offer_trees(p_project, p_person, p_request, p_trees, 'reserved');
  perform app.bind_reservation_trees(v_res.id, v_alloc);

  perform app.write_audit('reservations.create', 'reservations', v_res.id::text, null,
                          jsonb_build_object('reference_no', v_res.reference_no, 'person_id', p_person,
                                             'project_id', p_project, 'request_id', p_request,
                                             'status', v_res.status::text,
                                             'deposit_due_millimes', v_res.deposit_due_millimes,
                                             'valid_days', v_res.valid_days, 'expires_at', v_res.expires_at,
                                             'allocation', v_alloc),
                          null);

  return app.reservation_payload(v_res.id);
end $$;

revoke execute on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text) to authenticated;

comment on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text) is
  'Opens a reservation (§23): takes p_trees trees of the offer through app.allocate_offer_trees — the lowest-numbered available ones, all of them or none — and records what the hold costs, how long it is valid and under which conditions, each copied from app.offer_reservation_terms so a later edit of the offer cannot rewrite it. Status starts at «Reserved – Awaiting Deposit», or at «Deposit Paid» when the offer asks for no deposit. Staff, limited to the files they may see. Refused while the `reservations` module is disabled (module_closed). To reserve NAMED trees instead, public.staff_create_reservation_from_trees.';


-- =============================================================================================================
-- 6 · §12 — «احجز وادفع العربون» ON THE TREES THE CLIENT CHOSE
-- =============================================================================================================
--
-- The twin. Identical in every respect except which trees it takes, so the screen that follows it — the client
-- file's reservation card, where the عربون is recorded — needs no change at all and nothing is retyped (§26).
--
-- THE TWO ACTS ARE ONE CALL, ON PURPOSE. «هل مازالوا فاضيين؟» and «خوذهم» must never be two round trips from
-- TypeScript: between the answer and the act, the other phone in the other row of the same grove takes them.

create or replace function public.staff_create_reservation_from_trees(
  p_project uuid, p_person uuid, p_request uuid, p_seqs integer[], p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_res   public.reservations;
  v_alloc jsonb;
begin
  perform app.assert_reservations_open();

  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  v_res := app.open_reservation(p_project, p_person, p_request,
                                cardinality(coalesce(p_seqs, '{}'::integer[])), p_note);

  v_alloc := app.allocate_chosen_trees(p_project, p_person, p_request, p_seqs, 'reserved');
  perform app.bind_reservation_trees(v_res.id, v_alloc);

  perform app.write_audit('reservations.create_chosen', 'reservations', v_res.id::text, null,
                          jsonb_build_object('reference_no', v_res.reference_no, 'person_id', p_person,
                                             'project_id', p_project, 'request_id', p_request,
                                             'status', v_res.status::text,
                                             'deposit_due_millimes', v_res.deposit_due_millimes,
                                             'valid_days', v_res.valid_days, 'expires_at', v_res.expires_at,
                                             'allocation', v_alloc),
                          null);

  return app.reservation_payload(v_res.id);
end $$;

revoke execute on function public.staff_create_reservation_from_trees(uuid, uuid, uuid, integer[], text, text) from public, anon;
grant execute on function public.staff_create_reservation_from_trees(uuid, uuid, uuid, integer[], text, text) to authenticated;

comment on function public.staff_create_reservation_from_trees(uuid, uuid, uuid, integer[], text, text) is
  'Opens a reservation on the trees the client actually chose, by their numbers (§11 → §12). Same terms, same statuses, same audit and the same return value as public.staff_create_reservation; only the allocation differs (app.allocate_chosen_trees, exact set or nothing). Refuses with trees_taken when any chosen tree went between the tap and the press, naming which in DETAIL.';


-- =============================================================================================================
-- 7 · THE PICKER'S READ
-- =============================================================================================================
--
-- No function lists an offer's trees for picking. app.offer_stock_payload returns four counts; the الزيتونات
-- tab deliberately lists only HELD trees, saying so in its own header («an available tree is never listed: five
-- hundred identical rows reading «متاحة · بلا صاحب» tell nobody anything») — and that is exactly the set a
-- picker needs. Staff CAN read these rows today with a direct select, because trees_select is a plain
-- app.is_staff(); this function exists so the paging, the bounds and the ONE thing that must not be returned
-- are decided in Postgres instead of in a screen.
--
-- IT NEVER RETURNS held_by. §27: a reader must not learn WHO owns a tree by opening a plan. The plan needs to
-- know a tree is taken; whose it is belongs on that client's file, behind app.can_see_person. If a future
-- screen needs the holder, it gets a second function with that gate, not a column added here.
--
-- WHEN A TREE GAINS A POSITION, this is where it surfaces: add zone and x/y to the row object and the block
-- window becomes a zone window. The picking functions above do not change.

create or replace function public.staff_offer_tree_plan(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_project uuid := nullif(p->>'project_id', '')::uuid;
  v_size    integer := least(greatest(coalesce(nullif(p->>'block_size', '')::integer,
                                               app.setting_int('trees.plan_block_size', 120)), 20), 600);
  v_start   integer := greatest(coalesce(nullif(p->>'from', '')::integer, 1), 1);
  v_pj      public.projects;
  v_max     integer;
  v_from    integer;
  v_to      integer;
  v_rows    jsonb;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_pj from public.projects pj where pj.id = v_project;
  if not found then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;

  select max(t.seq) into v_max from public.trees t where t.project_id = v_project;
  v_max := coalesce(v_max, 0);

  -- The block that contains the number asked for, never past the last block of the offer.
  v_from := ((least(v_start, greatest(v_max, 1)) - 1) / v_size) * v_size + 1;
  v_to   := v_from + v_size - 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'seq', t.seq, 'code', t.code, 'state', t.state::text)
         order by t.seq), '[]'::jsonb)
  into v_rows
  from public.trees t
  where t.project_id = v_project and t.seq between v_from and v_to;

  return jsonb_build_object(
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'project_name', v_pj.name,
    'block', jsonb_build_object('from', v_from, 'to', least(v_to, greatest(v_max, v_from))),
    'block_size', v_size,
    'max_seq', v_max,
    'trees', v_rows,
    'stock', app.offer_stock_payload(v_project));
end $$;

revoke execute on function public.staff_offer_tree_plan(jsonb) from public, anon;
grant execute on function public.staff_offer_tree_plan(jsonb) to authenticated;

comment on function public.staff_offer_tree_plan(jsonb) is
  'One window of an offer''s plan for the field picker (§11): the trees between two numbers as id, number, code and state, plus the offer''s four counts from app.offer_stock_payload. Never returns held_by — a plan says a tree is taken, never by whom (§27). Filters: project_id, from, block_size.';


-- =============================================================================================================
-- 8 · THE ONE SETTING THIS ADDS
-- =============================================================================================================
--
-- How many numbers one screen of the plan holds. A rendering budget, not a business rule — the same kind of
-- figure as the «fifty at a time» the الزيتونات tab already uses — but it is the owner who stands in the grove,
-- and a shorter or longer run is his call, so it is a row he can edit and not a constant in a .ts file.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
select 'trees.plan_block_size', to_jsonb(120), 'integer', 'offers',
       'عدد الزيتونات في صفحة المخطط',
       'قدّاش من زيتونة تتعرض في المرة الواحدة في مخطط اختيار الزيتونات. العرض الكبير فيه آلاف الزيتونات وما ينجموش يتعرضو الكل في تليفون، فالمخطط يقسّمهم لبلوكات. 120 يعطي حوالي 24 سطر في تليفون. المسموح: من 20 إلى 600.',
       false, 760
where not exists (select 1 from public.settings s where s.key = 'trees.plan_block_size');


-- =============================================================================================================
-- 9 · WHAT IS OWED BEFORE THIS IS APPLIED
-- =============================================================================================================
--
--  · A TEST FILE, supabase/tests/0xx_tree_picking.sql, with at minimum:
--      – the pg_get_functiondef assertion 034 already makes on the count engine, repeated for
--        app.allocate_chosen_trees: /for\s+update\s+skip\s+locked/i AND the string 'trees_taken'. Without it a
--        later tidy-up can quietly turn this into a double sale.
--      – the exact-set refusal: reserve #1..#5, then ask for #3..#7 and assert trees_taken, assert nothing
--        moved, and assert DETAIL names 3, 4 and 5.
--      – tree_not_in_offer for a number above tree_count and for a number of another offer.
--      – below_min_trees against TX-00215's min_trees_per_order of 20.
--      – that public.staff_create_reservation still behaves exactly as 034/0xx assert today, since §5 replaces
--        its body.
--  · THE ARABIC of the three new codes, moved into src/lib/errors.ts from
--    src/app/admin/(panel)/desk/field/actions.ts, where they sit locally for the same reason the reservations
--    module's do: that file is shared and three sessions are writing in it at once. The codes are
--    trees_taken · tree_not_in_offer · invalid_tree_numbers.
--  · `npm run db:types` after applying, so staff_allocate_chosen_trees, staff_create_reservation_from_trees and
--    staff_offer_tree_plan enter src/lib/supabase/database.types.ts and the two `as unknown as` casts in the
--    desk's actions can be deleted.
--  · ONE ANSWER FROM THE OWNER, before any of §10/§11's remaining columns are designed:
--    «هل كل زيتونة عندها موقعها ونوعها وعمرها، ولاّ هذا كلّو على مستوى العرض؟»
