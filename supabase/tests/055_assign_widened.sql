-- Assigning a file to somebody who is not a commercial (0087).
--
-- The rule used to be «the target must be an active commercial», which made «أسند ليّ» impossible for the one
-- account that runs the business: the owner is a super_admin. This proves the widening, and proves it did not
-- turn into «anybody at all».

do $$
declare
  v_admin  uuid;
  v_person uuid;
  v_plain  uuid;
  v_ok     boolean;
begin
  select ur.user_id into v_admin
    from public.user_roles ur where ur.role = 'super_admin' limit 1;
  assert v_admin is not null, 'no super_admin to test with';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select ps.id into v_person from public.persons ps limit 1;
  assert v_person is not null, 'no client file to test with';

  -- 1 · An admin may now hold a file themselves.
  perform public.admin_assign_persons(array[v_person], v_admin, 'test');
  assert (select ps.assigned_to from public.persons ps where ps.id = v_person) = v_admin,
    'a file could not be assigned to an admin';
  assert exists (
    select 1 from public.person_assignments a
     where a.person_id = v_person and a.to_user = v_admin
  ), 'assigning a file wrote no audit row';

  -- 2 · Taking the owner off again still works: null means nobody.
  perform public.admin_assign_persons(array[v_person], null, 'test');
  assert (select ps.assigned_to from public.persons ps where ps.id = v_person) is null,
    'a file could not be released back to nobody';

  -- 3 · Not «anybody at all»: a profile with no staff role is still refused.
  select p.id into v_plain
    from public.profiles p
    left join public.user_roles ur on ur.user_id = p.id
   where ur.user_id is null
   limit 1;
  if v_plain is not null then
    v_ok := false;
    begin
      perform public.admin_assign_persons(array[v_person], v_plain, 'test');
      v_ok := true;
    exception when others then null;
    end;
    assert not v_ok, 'a file was assigned to somebody with no staff role';
  end if;

  perform set_config('request.jwt.claims', '', true);
end $$;
