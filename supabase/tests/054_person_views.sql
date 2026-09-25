-- Knowing which files nobody has opened (0086).
--
-- The four things that make the mark worth drawing: a file starts unread, opening it stops it being unread,
-- the chip's number and the filter's list agree, and — the one that decides whether the whole idea works — a
-- colleague reading a file does NOT empty it out of your queue.

do $$
declare
  v_admin  uuid;
  v_other  uuid;
  v_person uuid;
  v_seen   timestamptz;
  v_counts jsonb;
  v_listed bigint;
begin
  select ur.user_id into v_admin
    from public.user_roles ur where ur.role = 'super_admin' limit 1;
  assert v_admin is not null, 'no super_admin to test with';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select ps.id into v_person from public.persons ps order by ps.created_at desc limit 1;
  assert v_person is not null, 'no client file to test with';
  delete from public.person_views where person_id = v_person;

  -- 1 · Nobody has opened it, so it carries no mark and it is in the unread queue.
  assert (select l.seen_at from public.crm_list_people('{}'::jsonb, 200, 0) l
           where l.person_id = v_person) is null,
    'a file nobody opened already has a reading mark';
  assert exists (
    select 1 from public.crm_list_people(jsonb_build_object('unseen_only', true), 200, 0) l
     where l.person_id = v_person
  ), 'an unopened file is missing from the unread filter';

  -- 2 · Opening it takes it out of the queue.
  perform public.staff_mark_person_seen(v_person);
  select l.seen_at into v_seen from public.crm_list_people('{}'::jsonb, 200, 0) l
   where l.person_id = v_person;
  assert v_seen is not null, 'opening a file left no reading mark';
  assert not exists (
    select 1 from public.crm_list_people(jsonb_build_object('unseen_only', true), 200, 0) l
     where l.person_id = v_person
  ), 'a file that was just opened is still listed as unread';

  -- 3 · The chip and the list are the same number. A header that disagrees with its own list teaches its
  --     reader to trust neither.
  v_counts := public.crm_people_counts();
  select count(*) into v_listed
    from public.crm_list_people(jsonb_build_object('unseen_only', true), 200, 0);
  assert (v_counts->>'unseen')::bigint = v_listed,
    format('the unread chip says %s and the unread list holds %s', v_counts->>'unseen', v_listed);

  -- 4 · THE POINT: reading is personal. A second staff member still has it unread.
  select ur.user_id into v_other
    from public.user_roles ur
   where ur.user_id <> v_admin and ur.role in ('admin', 'super_admin')
   limit 1;
  if v_other is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    assert (select l.seen_at from public.crm_list_people('{}'::jsonb, 200, 0) l
             where l.person_id = v_person) is null,
      'a file read by one colleague is showing as read for everybody';
  end if;

  perform set_config('request.jwt.claims', '', true);
end $$;

-- 5 · Nobody marks a file read on somebody else's behalf, and the public reads none of it.
do $$
begin
  assert not has_function_privilege('anon', 'public.staff_mark_person_seen(uuid)', 'execute'),
    'anon can mark client files as read';
  assert not has_table_privilege('authenticated', 'public.person_views', 'insert'),
    'staff can write reading marks directly, bypassing the function';
  assert not has_table_privilege('authenticated', 'public.person_views', 'update'),
    'staff can rewrite reading marks directly';
end $$;
