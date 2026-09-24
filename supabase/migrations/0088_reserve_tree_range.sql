-- «In the sell I want to be able to assign the from–to, not just the number, so I can be precise and track
-- which trees each one has, and which for which» (owner, 2026-09-23).
--
-- WHAT SELLING DID UNTIL NOW. app.allocate_offer_trees (0054) takes a COUNT and hands out the first N
-- available trees by seq — «any twenty-five of them». That is right for a client who only wants twenty-five
-- trees and wrong for every conversation that names ground: the two rows by the road, the block the client
-- walked through on the visit, the trees next to the ones their brother bought. The staff could not express
-- it, so it lived in somebody's head, and the contract named codes nobody had chosen.
--
-- SO THE RANGE BECOMES AN INPUT. من tree 120 إلى tree 144 is twenty-five trees AND it is those twenty-five.
-- The count is derived from the range rather than given beside it, because two numbers that must agree are two
-- numbers that will eventually disagree, and the sale would then be right in one field and wrong in another.
--
-- ALL OF THEM OR NONE, exactly as the count path already guarantees. If one tree inside the chosen range was
-- sold this morning, the whole call is refused with range_not_available rather than quietly handing over
-- twenty-four — a client promised a block and given a block with a hole in it is a phone call, not a sale.
--
-- THE COUNT PATH IS NOT REMOVED. Most sales genuinely are «twenty-five, any of them», and a form that forces a
-- range on somebody who does not care is a worse form. Both paths land in the same reservation, with the same
-- deposit, the same deadline and the same audit row; only the picking differs.

-- ---------------------------------------------------------------------------
-- 1 · Picking a named stretch of the offer
-- ---------------------------------------------------------------------------

create or replace function app.allocate_offer_trees_range(
  p_project uuid, p_person uuid, p_request uuid,
  p_from_seq integer, p_to_seq integer, p_state public.tree_state
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pj    public.projects;
  v_min   integer;
  v_want  integer;
  v_ids   uuid[];
  v_codes text[];
  v_n     integer;
begin
  if p_state = 'available' then
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end if;
  if p_from_seq is null or p_to_seq is null or p_from_seq < 1 or p_to_seq < p_from_seq then
    raise exception 'invalid_tree_range' using errcode = 'P0001';
  end if;
  v_want := p_to_seq - p_from_seq + 1;

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

  -- The offer's minimum still applies: a range is a way of CHOOSING trees, not of buying fewer than the owner
  -- allows.
  v_min := app.offer_min_trees(p_project);
  if v_want < v_min then
    raise exception 'below_min_trees' using errcode = 'P0001';
  end if;

  with picked as (
    select t.id
    from public.trees t
    where t.project_id = p_project
      and t.seq between p_from_seq and p_to_seq
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
  select array_agg(d.id order by d.seq), array_agg(d.code order by d.seq)
  into v_ids, v_codes
  from done d;

  v_n := coalesce(cardinality(v_ids), 0);
  if v_n < v_want then
    -- Something inside the stretch is no longer free. Raising undoes the update, so the offer is left exactly
    -- as it was and the seller is told to pick again rather than discovering the hole on the contract.
    raise exception 'range_not_available' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'project_id', p_project, 'offer_code', v_pj.code, 'person_id', p_person, 'request_id', p_request,
    'state', p_state::text, 'trees', v_n,
    'first_code', v_codes[1], 'last_code', v_codes[v_n], 'tree_ids', to_jsonb(v_ids));
end $$;

revoke execute on function app.allocate_offer_trees_range(uuid, uuid, uuid, integer, integer, public.tree_state)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · What the seller can choose from
-- ---------------------------------------------------------------------------
-- The free stretches of an offer, largest-first inside the offer's own order. A sold tree in the middle splits
-- one run into two, and the seller has to SEE that: «متاح ١ إلى ٣٧٩» is a different sentence from «متاح ١ إلى
-- ١١٩ و ١٤٥ إلى ٣٧٩», and only the second one explains why 120–144 is refused.

create or replace function public.staff_offer_tree_runs(p_project uuid, p_limit integer default 20)
returns table (from_seq integer, to_seq integer, from_code text, to_code text, trees integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_any_role(array['admin', 'super_admin', 'commercial']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with t as (
    select tr.seq, tr.code, tr.seq - row_number() over (order by tr.seq) as grp
    from public.trees tr
    where tr.project_id = p_project and tr.state = 'available'
  )
  select min(t.seq)::integer,
         max(t.seq)::integer,
         (array_agg(t.code order by t.seq))[1],
         (array_agg(t.code order by t.seq desc))[1],
         count(*)::integer
  from t
  group by t.grp
  order by min(t.seq)
  limit greatest(coalesce(p_limit, 20), 1);
end $$;

revoke execute on function public.staff_offer_tree_runs(uuid, integer) from public, anon;
grant execute on function public.staff_offer_tree_runs(uuid, integer) to authenticated;

comment on function public.staff_offer_tree_runs(uuid, integer) is
  'الزيتونات الخاوية في عرض، مجمّعة في مقاطع متتالية (من–إلى). تخدم صفحة البيع باش البائع يختار زيتونات بعينها.';

-- ---------------------------------------------------------------------------
-- 3 · The reservation learns to take a range
-- ---------------------------------------------------------------------------
-- Two parameters are added with defaults, and the six-argument version is dropped rather than left beside it:
-- PostgREST chooses an overload by the keys in the request body, and two candidates that both accept
-- {project, person, request, trees, note, reason} is an ambiguity it reports instead of resolving. Callers
-- that pass the old six keys are unaffected — the new ones default to null and the count path runs.

drop function if exists public.staff_create_reservation(uuid, uuid, uuid, integer, text, text);

create function public.staff_create_reservation(
  p_project uuid, p_person uuid, p_request uuid, p_trees integer, p_note text, p_reason text,
  p_from_seq integer default null, p_to_seq integer default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_terms   jsonb;
  v_deposit bigint;
  v_days    integer;
  v_cond    text;
  v_id      uuid;
  v_ref     text;
  v_year    text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_alloc   jsonb;
  v_ids     uuid[];
  v_status  public.reservation_status;
  v_expires timestamptz;
  v_range   boolean := p_from_seq is not null and p_to_seq is not null;
  v_count   integer;
begin
  perform app.assert_reservations_open();

  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- When a stretch is named, IT decides how many trees this is. p_trees is not consulted, so a form that sends
  -- both cannot produce a reservation whose count disagrees with its own trees.
  v_count := case when v_range then p_to_seq - p_from_seq + 1 else p_trees end;
  if v_range and (p_from_seq < 1 or p_to_seq < p_from_seq) then
    raise exception 'invalid_tree_range' using errcode = 'P0001';
  end if;

  v_terms := app.offer_reservation_terms(p_project);
  if v_terms is null then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;
  v_deposit := (v_terms->>'deposit_millimes')::bigint;
  v_days    := (v_terms->>'valid_days')::integer;
  v_cond    := v_terms->>'conditions_ar';

  v_expires := case when v_days > 0 then now() + make_interval(days => v_days) end;
  v_status  := case when v_deposit > 0 then 'awaiting_deposit' else 'deposit_paid' end::public.reservation_status;

  v_ref := app.setting_text('reservation_no.prefix', 'AGZ-RES') || '-' || v_year || '-'
           || lpad(app.next_number('reservation:' || v_year)::text, 6, '0');

  insert into public.reservations (
    reference_no, person_id, project_id, request_id, status, trees_count,
    deposit_due_millimes, valid_days, conditions_ar, expires_at, deposit_paid_at,
    note, created_by, updated_by
  ) values (
    v_ref, p_person, p_project, p_request, v_status, greatest(coalesce(v_count, 0), 1),
    v_deposit, v_days, v_cond, v_expires,
    case when v_status = 'deposit_paid' then now() end,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), auth.uid()
  ) returning id into v_id;

  v_alloc := case
    when v_range then app.allocate_offer_trees_range(p_project, p_person, p_request, p_from_seq, p_to_seq, 'reserved')
    else              app.allocate_offer_trees(p_project, p_person, p_request, p_trees, 'reserved')
  end;

  select array_agg(x::uuid) into v_ids
  from jsonb_array_elements_text(coalesce(v_alloc->'tree_ids', '[]'::jsonb)) x;

  update public.trees t set reservation_id = v_id where t.id = any (coalesce(v_ids, '{}'::uuid[]));
  update public.reservations r
     set trees_count = coalesce(cardinality(v_ids), r.trees_count)
   where r.id = v_id;

  perform app.write_audit('reservations.create', 'reservations', v_id::text, null,
                          jsonb_build_object('reference_no', v_ref, 'person_id', p_person,
                                             'project_id', p_project, 'request_id', p_request,
                                             'status', v_status::text,
                                             'deposit_due_millimes', v_deposit,
                                             'valid_days', v_days, 'expires_at', v_expires,
                                             'picked', case when v_range then 'range' else 'count' end,
                                             'allocation', v_alloc),
                          null);

  return app.reservation_payload(v_id);
end $$;

revoke execute on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text, integer, integer)
  from public, anon;
grant execute on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text, integer, integer)
  to authenticated;

comment on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text, integer, integer) is
  'يفتح حجز (§23): ياخو زيتونات العرض — يا الكل يا والو — ويسجّل قدّاش يسوى العربون، قدّاش يدوم الحجز وبأي شروط، الكل منقول من app.offer_reservation_terms. كان تعطى p_from_seq/p_to_seq ياخو الزيتونات هذوكم بالذات (وعددها هو اللي يحسب)، وإلّا ياخو أوّل p_trees زيتونة خاوية.';
