-- Opening a client file from the Back Office (0083).
--
-- The four things worth proving: a stranger cannot call it, a bad number is refused before a row exists, a
-- second meeting with a known number returns the SAME file instead of forking one, and an existing file is
-- not overwritten by whatever the commercial typed this time.

do $$
declare
  v_admin uuid;
  v_plain uuid;
  v_first uuid;
  v_again uuid;
  v_out   jsonb;
  v_name  text;
  v_phone text := '+21699000901';
begin
  select ur.user_id into v_admin
    from public.user_roles ur
   where ur.role = 'super_admin'
   limit 1;
  assert v_admin is not null, 'no super_admin to test with';

  select p.id into v_plain
    from public.profiles p
    left join public.user_roles ur on ur.user_id = p.id
   where ur.user_id is null
   limit 1;

  -- 1 · A signed-in nobody is refused.
  if v_plain is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_plain, 'role', 'authenticated')::text, true);
    begin
      perform public.staff_create_person('حريف الاختبار', v_phone);
      assert false, 'a profile with no staff role created a client file';
    exception when insufficient_privilege then null;
    end;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 2 · A number that is not a Tunisian line never reaches the table.
  begin
    perform public.staff_create_person('حريف الاختبار', '+2160000');
    assert false, 'an impossible phone number was accepted';
  exception when others then null;
  end;

  -- 3 · It opens the file, on the «جديد» stage like every other lead.
  v_out := public.staff_create_person('حريف الاختبار', v_phone, 'walkin@example.tn');
  v_first := (v_out->>'person_id')::uuid;
  assert (v_out->>'created')::boolean, 'the first call should report a new file';
  assert exists (
    select 1 from public.persons p
      join public.lead_statuses s on s.id = p.status_id
     where p.id = v_first and s.stage = 'new'
  ), 'a client opened from the Back Office did not land on the new stage';

  -- 4 · The same number is the same human: one file, and the name already on it survives.
  v_out := public.staff_create_person('اسم مكتوب غالط', v_phone);
  v_again := (v_out->>'person_id')::uuid;
  assert v_again = v_first, 'the same phone number produced a second file';
  assert not (v_out->>'created')::boolean, 'a known number was reported as newly created';

  select full_name into v_name from public.persons where id = v_first;
  assert v_name = 'حريف الاختبار',
    format('the existing file was overwritten by the second call: «%s»', v_name);

  perform set_config('request.jwt.claims', '', true);
  delete from public.person_status_history where person_id = v_first;
  delete from public.persons where id = v_first;
end $$;
