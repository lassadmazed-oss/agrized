-- Selling a NAMED SET of trees — «5، 10، 15» and not just «من 5 لـ 11» (0089).
--
-- What has to hold: the sale takes exactly the numbers it was given and nothing between them, a repeated
-- number is one tree, a set containing one sold tree is refused whole, and the older ways of asking (a range,
-- a bare count) still work through the same function.

do $$
declare
  v_admin uuid;
  v_project uuid;
  v_min   integer;
  v_seqs  integer[];
  v_take  integer[];
  v_got   integer[];
  v_one   uuid;
  v_two   uuid;
  v_ok    boolean;
begin
  select ur.user_id into v_admin
    from public.user_roles ur where ur.role = 'super_admin' limit 1;
  assert v_admin is not null, 'no super_admin to test with';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select tr.project_id into v_project
    from public.trees tr
   where tr.state = 'available'
   group by tr.project_id
  having count(*) >= 8
   order by count(*) desc
   limit 1;
  if v_project is null then
    raise notice 'no offer with enough free trees; nothing to prove here';
    return;
  end if;

  v_min := greatest(coalesce(app.offer_min_trees(v_project), 1), 1);

  -- Take free trees that are NOT next to each other: every other one, so a range could not express this.
  select array_agg(s order by s) into v_seqs
  from (
    select tr.seq as s, row_number() over (order by tr.seq) as rn
    from public.trees tr
    where tr.project_id = v_project and tr.state = 'available'
    order by tr.seq
    limit 40
  ) x
  where x.rn % 2 = 1;

  if coalesce(cardinality(v_seqs), 0) < v_min then
    raise notice 'not enough spread-out free trees for this offer''s minimum; nothing to prove here';
    return;
  end if;
  v_take := v_seqs[1:greatest(v_min, 3)];

  v_one := (public.staff_create_person('حريف اختبار القائمة', '+21699000958')->>'person_id')::uuid;
  v_two := (public.staff_create_person('حريف اختبار القائمة ٢', '+21699000959')->>'person_id')::uuid;

  -- 1 · Exactly those trees, and none of the ones in between.
  perform public.staff_create_reservation(v_project, v_one, null, null, null, 'test', null, null, v_take);

  select array_agg(t.seq order by t.seq) into v_got
    from public.trees t where t.held_by = v_one;
  assert v_got = v_take,
    format('the sale took %s instead of the named set %s', v_got::text, v_take::text);

  -- 2 · A number said twice is still one tree.
  v_ok := false;
  begin
    perform public.staff_create_reservation(
      v_project, v_two, null, null, null, 'test', null, null,
      array[v_seqs[cardinality(v_seqs)], v_seqs[cardinality(v_seqs)]]);
    v_ok := true;
  exception when others then null;
  end;
  -- Either it is refused for being under the minimum (when the offer asks for more than one), or it is
  -- accepted as ONE tree. What must never happen is two trees coming out of one number.
  if v_ok then
    assert (select count(*) from public.trees t where t.held_by = v_two) = 1,
      'a repeated tree number produced more than one tree';
    delete from public.reservations r where r.person_id = v_two;
    update public.trees t set state = 'available', held_by = null, reservation_id = null where t.held_by = v_two;
  end if;

  -- 3 · A set containing an already-sold tree is refused whole.
  v_ok := false;
  begin
    perform public.staff_create_reservation(
      v_project, v_two, null, null, null, 'test', null, null, v_take);
    v_ok := true;
  exception when others then null;
  end;
  assert not v_ok, 'a set whose trees were already sold was accepted a second time';
  assert not exists (select 1 from public.trees t where t.held_by = v_two),
    'the refused sale still took trees: it should leave the offer exactly as it was';

  -- 4 · The older ways still work through the same function.
  perform public.staff_create_reservation(v_project, v_two, null, v_min, null, 'test');
  assert (select count(*) from public.trees t where t.held_by = v_two) = v_min,
    'the count path stopped working when the list path was added';

  perform set_config('request.jwt.claims', '', true);
end $$;

-- 5 · The raw allocator stays out of reach of a signed-in caller.
do $$
begin
  assert not has_function_privilege('authenticated',
    'app.allocate_offer_trees_at(uuid, uuid, uuid, integer[], public.tree_state)', 'execute'),
    'signed-in users can allocate trees without going through a reservation';
end $$;
