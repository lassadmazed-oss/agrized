-- Selling a NAMED stretch of an offer (0088).
--
-- The count path answers «twenty-five trees». This answers «these twenty-five», which is what a client who
-- walked the ground is buying. What has to be true: the sale takes exactly the stretch it was given, a stretch
-- with a sold tree inside it is refused whole rather than filled partly, and asking by count still works.

do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_min     integer;
  v_from    integer;
  v_to      integer;
  v_span    integer;
  v_one     uuid;
  v_two     uuid;
  v_seqs    integer[];
  v_ok      boolean;
  v_held    integer;
begin
  select ur.user_id into v_admin
    from public.user_roles ur where ur.role = 'super_admin' limit 1;
  assert v_admin is not null, 'no super_admin to test with';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- An offer with a free stretch long enough to satisfy its own minimum twice over.
  select tr.project_id into v_project
    from public.trees tr
   where tr.state = 'available'
   group by tr.project_id
  having count(*) >= 4
   order by count(*) desc
   limit 1;
  if v_project is null then
    raise notice 'no offer has free trees; nothing to prove here';
    return;
  end if;

  v_min  := app.offer_min_trees(v_project);
  v_span := greatest(coalesce(v_min, 1), 1);

  select r.from_seq into v_from
    from public.staff_offer_tree_runs(v_project, 10) r
   where r.trees >= v_span
   order by r.trees desc
   limit 1;
  if v_from is null then
    raise notice 'no run long enough for this offer''s minimum; nothing to prove here';
    return;
  end if;
  v_to := v_from + v_span - 1;

  v_one := (public.staff_create_person('حريف اختبار المقطع', '+21699000956')->>'person_id')::uuid;
  v_two := (public.staff_create_person('حريف اختبار ثاني', '+21699000957')->>'person_id')::uuid;

  -- 1 · The sale takes exactly the stretch it was named, and nothing either side of it.
  perform public.staff_create_reservation(v_project, v_one, null, null, null, 'test', v_from, v_to);

  select array_agg(t.seq order by t.seq) into v_seqs
    from public.trees t where t.held_by = v_one;
  assert v_seqs[1] = v_from,
    format('the sale started at tree %s instead of %s', v_seqs[1], v_from);
  assert v_seqs[array_length(v_seqs, 1)] = v_to,
    format('the sale ran to tree %s instead of %s', v_seqs[array_length(v_seqs, 1)], v_to);
  assert array_length(v_seqs, 1) = v_span,
    format('the sale took %s trees for a stretch of %s', array_length(v_seqs, 1), v_span);
  assert not exists (
    select 1 from public.trees t
     where t.project_id = v_project and t.seq between v_from and v_to and t.state = 'available'
  ), 'trees inside the sold stretch are still on sale';

  -- 2 · The same stretch cannot be sold twice — and not partly either.
  v_ok := false;
  begin
    perform public.staff_create_reservation(v_project, v_two, null, null, null, 'test', v_from, v_to);
    v_ok := true;
  exception when others then null;
  end;
  assert not v_ok, 'a stretch whose trees were already sold was accepted a second time';
  assert not exists (select 1 from public.trees t where t.held_by = v_two),
    'the refused sale still took trees: it should leave the offer exactly as it was';

  -- 3 · Asking by count still works and is untouched by any of this.
  perform public.staff_create_reservation(v_project, v_two, null, v_span, null, 'test');
  select count(*) into v_held from public.trees t where t.held_by = v_two;
  assert v_held = v_span,
    format('the count path handed out %s trees instead of %s', v_held, v_span);

  -- 4 · A backwards stretch is not a stretch.
  v_ok := false;
  begin
    perform public.staff_create_reservation(v_project, v_two, null, null, null, 'test', v_to, v_from - 1);
    v_ok := true;
  exception when others then null;
  end;
  assert not v_ok, 'a range that ends before it starts was accepted';

  perform set_config('request.jwt.claims', '', true);
end $$;

-- 5 · The picker is staff-only, and the raw allocator stays out of reach.
do $$
begin
  assert not has_function_privilege('anon', 'public.staff_offer_tree_runs(uuid, integer)', 'execute'),
    'anon can read which trees are free';
  assert not has_function_privilege('authenticated',
    'app.allocate_offer_trees_range(uuid, uuid, uuid, integer, integer, public.tree_state)', 'execute'),
    'signed-in users can allocate trees without going through a reservation';
end $$;
