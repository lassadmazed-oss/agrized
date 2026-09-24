-- الملفات has to be able to show a client who never filled a form (0084).
--
-- THE REGRESSION THIS EXISTS FOR. crm_search_requests reads public.interest_requests, so its `people` mode can
-- only ever list clients who sent a demand. A walk-in opened with staff_create_person (0083) sends none — and
-- was invisible in the client list while having a reservation, a contract and a schedule. Assertion 2 is that
-- test, and it fails against the old function by construction, not by accident.
--
-- The rest are the things a list must not get wrong: a total that describes the filtered set rather than the
-- page, a phone search that works on the number as a human types it, and «بلا مسؤول» meaning unowned.

do $$
declare
  v_admin   uuid;
  v_person  uuid;
  v_out     jsonb;
  v_phone   text := '+21699000953';
  v_rows    bigint;
  v_total   bigint;
  v_stage   public.lead_stage;
  v_listed  boolean;
begin
  select ur.user_id into v_admin
    from public.user_roles ur
   where ur.role = 'super_admin'
   limit 1;
  assert v_admin is not null, 'no super_admin to test with';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- A client met without a form: a file, and deliberately no demand.
  v_out := public.staff_create_person('حريف بلا فورمولير', v_phone);
  v_person := (v_out->>'person_id')::uuid;
  assert not exists (select 1 from public.interest_requests r where r.person_id = v_person),
    'the fixture is wrong: staff_create_person should write no demand';

  -- 1 · The list is a list of people: one row each, and the total is the whole filtered set.
  select count(*), max(l.persons_total) into v_rows, v_total
    from public.crm_list_people('{}'::jsonb, 200, 0) l;
  assert v_rows = v_total,
    format('persons_total (%s) should equal the rows returned when they all fit on one page (%s)', v_total, v_rows);
  assert v_total = (select count(*) from public.persons),
    format('an unfiltered list should count every visible file, got %s', v_total);

  -- 2 · THE POINT: the demand-less client is in it.
  select exists (
    select 1 from public.crm_list_people('{}'::jsonb, 200, 0) l where l.person_id = v_person
  ) into v_listed;
  assert v_listed, 'a client with no demand is missing from the client list';

  -- 3 · And their row says so, instead of inventing a demand for them.
  assert (select l.requests_count from public.crm_list_people('{}'::jsonb, 200, 0) l
           where l.person_id = v_person) = 0,
    'a client with no demand should report zero demands';
  assert (select exists (select 1 from public.crm_list_people(jsonb_build_object('no_demand', true), 200, 0) l
           where l.person_id = v_person)),
    'the «no demand» filter should find a client who has none';

  -- 4 · A total that survives paging: one row asked for, the same total reported.
  select max(l.persons_total) into v_total from public.crm_list_people('{}'::jsonb, 1, 0) l;
  assert v_total = (select count(*) from public.persons),
    format('persons_total changed when only one row was asked for: %s', v_total);

  -- 5 · The stage filter narrows, and it narrows to that stage only.
  select s.stage into v_stage from public.persons ps join public.lead_statuses s on s.id = ps.status_id
   where ps.id = v_person;
  assert v_stage = 'new', format('a new file should be on the new stage, got %s', v_stage);
  assert not exists (
    select 1 from public.crm_list_people(jsonb_build_object('stage', 'owner'), 200, 0) l
     where l.person_id = v_person
  ), 'a file on the new stage came back from a filter for owners';
  assert exists (
    select 1 from public.crm_list_people(jsonb_build_object('stage', 'new'), 200, 0) l
     where l.person_id = v_person
  ), 'the stage filter dropped a file that is on that stage';

  -- 6 · The phone as a human types it. Stored +21699000953, searched «99 000 953» and «99000953».
  assert exists (
    select 1 from public.crm_list_people(jsonb_build_object('q', '99 000 953'), 200, 0) l
     where l.person_id = v_person
  ), 'searching a phone number with spaces in it found nothing';
  assert exists (
    select 1 from public.crm_list_people(jsonb_build_object('q', '99000953'), 200, 0) l
     where l.person_id = v_person
  ), 'searching a local phone number found nothing';
  assert exists (
    select 1 from public.crm_list_people(jsonb_build_object('q', 'بلا فورمولير'), 200, 0) l
     where l.person_id = v_person
  ), 'searching part of the name found nothing';

  -- 7 · «بلا مسؤول» means unowned, and a new file is unowned.
  assert exists (
    select 1 from public.crm_list_people(jsonb_build_object('assigned_to', 'none'), 200, 0) l
     where l.person_id = v_person
  ), 'a file with no owner is missing from the unassigned filter';

  -- 8 · No CIN yet, so it is in the queue of files that cannot be contracted.
  assert exists (
    select 1 from public.crm_list_people(jsonb_build_object('no_cin', true), 200, 0) l
     where l.person_id = v_person
  ), 'a file with no CIN is missing from the «no identity card» filter';

  perform set_config('request.jwt.claims', '', true);
  delete from public.person_status_history where person_id = v_person;
  delete from public.persons where id = v_person;
end $$;

-- 9 · The public never reads the client list.
do $$
begin
  assert not has_function_privilege('anon', 'public.crm_list_people(jsonb, integer, integer)', 'execute'),
    'anon can execute crm_list_people';
  assert has_function_privilege('authenticated', 'public.crm_list_people(jsonb, integer, integer)', 'execute'),
    'signed-in staff cannot execute crm_list_people';
end $$;
