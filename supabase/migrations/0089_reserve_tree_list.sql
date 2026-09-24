-- «the trees are numbered right — or trees like from 5-11, these are the trees going to get sold for him, or
-- 5-10-15, these are the trees» (owner, 2026-09-23).
--
-- 0088 taught the sale to take a STRETCH (من ١٢٠ إلى ١٤٤). This teaches it to take a LIST — any set of tree
-- numbers at all, contiguous or not. A client buys the four trees beside their cousin's, or the row along the
-- road plus the two at the gate; that is a set, and a set is not expressible as a range without selling them
-- everything in between.
--
-- ONE PRIMITIVE, NOT TWO. A range is a list whose numbers happen to be consecutive, so the range path from
-- 0088 stays only because callers already speak it — both end up here. What the seller types («5-11, 20, 25»)
-- is expanded to a set of numbers before it ever reaches Postgres, so this function has one job: take exactly
-- these trees, all of them, or none.
--
-- THE SET IS DEDUPLICATED AND COUNTED IN SQL. «5, 5, 6» is two trees, not three, and the reservation's count
-- comes from what was actually taken rather than from what was typed — the same rule as the range: two numbers
-- that must agree are two numbers that will eventually disagree.
--
-- ALL OF THEM OR NONE. If one number in the list is already sold, the whole call is refused (trees_not_free)
-- rather than quietly handing over the rest. A client promised fifteen named trees and given thirteen is a
-- phone call on the day of signing.

create or replace function app.allocate_offer_trees_at(
  p_project uuid, p_person uuid, p_request uuid, p_seqs integer[], p_state public.tree_state
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pj    public.projects;
  v_min   integer;
  v_want  integer;
  v_seqs  integer[];
  v_ids   uuid[];
  v_codes text[];
  v_n     integer;
begin
  if p_state = 'available' then
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end if;

  -- The set, cleaned: no nulls, no duplicates, nothing below the first tree, and in the offer's own order.
  select array_agg(distinct s order by s) into v_seqs
  from unnest(coalesce(p_seqs, '{}'::integer[])) as s
  where s is not null and s >= 1;

  v_want := coalesce(cardinality(v_seqs), 0);
  if v_want = 0 then
    raise exception 'invalid_tree_list' using errcode = 'P0001';
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

  -- The offer's minimum still applies: naming the trees is a way of CHOOSING, not of buying fewer.
  v_min := app.offer_min_trees(p_project);
  if v_want < v_min then
    raise exception 'below_min_trees' using errcode = 'P0001';
  end if;

  with picked as (
    select t.id
    from public.trees t
    where t.project_id = p_project
      and t.seq = any (v_seqs)
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
    -- One of the numbers is gone (or never existed in this offer). Raising undoes the update above, so the
    -- offer is left exactly as it was and the seller picks again instead of discovering the gap on a contract.
    raise exception 'trees_not_free' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'project_id', p_project, 'offer_code', v_pj.code, 'person_id', p_person, 'request_id', p_request,
    'state', p_state::text, 'trees', v_n,
    'first_code', v_codes[1], 'last_code', v_codes[v_n], 'tree_ids', to_jsonb(v_ids));
end $$;

revoke execute on function app.allocate_offer_trees_at(uuid, uuid, uuid, integer[], public.tree_state)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The reservation learns to take a list
-- ---------------------------------------------------------------------------
-- Same reason as 0088 for dropping rather than overloading: PostgREST picks a function by the keys in the body,
-- and two candidates accepting the same keys is an ambiguity it reports instead of resolving.

drop function if exists public.staff_create_reservation(uuid, uuid, uuid, integer, text, text, integer, integer);

create function public.staff_create_reservation(
  p_project uuid, p_person uuid, p_request uuid, p_trees integer, p_note text, p_reason text,
  p_from_seq integer default null, p_to_seq integer default null,
  p_seqs integer[] default null
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
  v_list    boolean := p_seqs is not null and coalesce(cardinality(p_seqs), 0) > 0;
  v_range   boolean := p_from_seq is not null and p_to_seq is not null;
  v_count   integer;
begin
  perform app.assert_reservations_open();

  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- Whichever way the trees were named, THEY decide how many this is. p_trees is consulted only when nothing
  -- was named, so a form that sends both cannot produce a reservation whose count disagrees with its trees.
  v_count := case
    when v_list  then (select count(distinct s)::integer from unnest(p_seqs) s where s is not null and s >= 1)
    when v_range then p_to_seq - p_from_seq + 1
    else p_trees
  end;
  if v_range and not v_list and (p_from_seq < 1 or p_to_seq < p_from_seq) then
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
    when v_list  then app.allocate_offer_trees_at(p_project, p_person, p_request, p_seqs, 'reserved')
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
                                             'picked', case when v_list then 'list'
                                                            when v_range then 'range' else 'count' end,
                                             'allocation', v_alloc),
                          null);

  return app.reservation_payload(v_id);
end $$;

revoke execute on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text, integer, integer, integer[])
  from public, anon;
grant execute on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text, integer, integer, integer[])
  to authenticated;

comment on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text, integer, integer, integer[]) is
  'يفتح حجز: ياخو زيتونات العرض — يا الكل يا والو. تنجم تسمّي الزيتونات بالضبط (p_seqs: 5،10،15)، ولا مقطع (p_from_seq/p_to_seq: من 5 لـ 11)، ولا تعطي عدد برك (p_trees) وياخو أوّل الخاويات. العدد ديما يتحسب من الزيتونات اللي تسمّت.';
