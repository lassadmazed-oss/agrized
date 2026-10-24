-- 0155 · a saved study is a photograph, not a window: it does not change when the settings behind it do.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_saved   jsonb;
  v_again   jsonb;
  v_before  jsonb;
  v_after   jsonb;
  v_state   text;
  v_person  uuid;
  v_request uuid;
  v_ok      boolean;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select f.state into v_state from public.feature_flags f where f.key = 'study';

  -- 1 · THE DOORS. A saved study holds a client's own figures: staff read them, and a visitor reads none.
  assert not has_table_privilege('anon', 'public.study_records', 'select'),
    'a visitor can read other people''s studies';
  assert not has_table_privilege('anon', 'public.study_records', 'insert'),
    'a visitor can write a study row by hand, bypassing the engine';
  -- But a visitor MUST be able to save one: §8 offers the three buttons before any account exists.
  assert has_function_privilege('anon',
    'public.save_study(uuid, integer, integer, text, text, text, uuid, uuid, text)', 'execute'),
    'a visitor cannot save the study he has just read';
  assert not has_function_privilege('anon', 'public.claim_study(uuid, uuid)', 'execute'),
    'a visitor can attach a study to somebody else''s request';
  assert not has_function_privilege('anon', 'public.staff_person_studies(uuid)', 'execute'),
    'a visitor can read a client''s file of studies';

  -- 2 · THERE IS NO UPDATE PATH AT ALL, which is how §10's rule is kept rather than remembered. A policy
  --     that allowed an update would be the first step to a saved study drifting.
  assert not exists (
    select 1 from pg_policies p
     where p.schemaname = 'public' and p.tablename = 'study_records'
       and p.cmd in ('UPDATE', 'ALL')),
    'public.study_records has an update policy: a saved study can be rewritten';

  select p.id into v_project
    from public.projects p
   where p.status = 'published'
     and (app.study_payload(p.id, 10, 10, null, 'olives', null, null, null) ->> 'status') = 'ok'
   order by p.created_at
   limit 1;

  if v_project is null or v_state = 'disabled' then
    raise notice 'no offer completes a study here (or the module is off); saving is untested';
    return;
  end if;

  -- 3 · Saving: a reference comes back, and the row carries the figures the ENGINE produced.
  v_saved := public.save_study(v_project, 10, 10, null, 'olives', null, null, null, 'test-ip-hash');
  assert (v_saved->>'id') is not null and (v_saved->>'reference_no') is not null,
    'saving a study answered with no reference a client could read down the phone';

  select s.payload into v_before from public.study_records s where s.id = (v_saved->>'id')::uuid;
  assert (v_before->>'status') = 'ok', 'a study was saved in a state that is not a study';
  assert (v_before->'totals'->>'revenue_millimes') is not null, 'the saved study has no figures in it';
  assert (select s.settings from public.study_records s where s.id = (v_saved->>'id')::uuid) ? 'study.olive_price_millimes_per_kg',
    'the settings copy §8 asks for is missing the price the study was built on';

  -- 4 · ONE PRESS, ONE ROW. Three taps on «حمّل الدراسة» are not three studies.
  v_again := public.save_study(v_project, 10, 10, null, 'olives', null, null, null, 'test-ip-hash');
  assert (v_again->>'id') = (v_saved->>'id'),
    'the same question from the same place within the hour made a second row';

  -- 5 · THE RULE OF §10, ASSERTED. Move the price the study was built on, hard, and read it back: it must
  --     not have moved with it. This is the one thing this table exists for.
  update public.settings set value = to_jsonb(99999) where key = 'study.olive_price_millimes_per_kg';
  select s.payload into v_after from public.study_records s where s.id = (v_saved->>'id')::uuid;
  assert (v_after->'totals'->>'revenue_millimes') = (v_before->'totals'->>'revenue_millimes'),
    'correcting a price changed a study that had already been saved and shown to somebody';
  -- And a NEW study does see the new price, so the storage is what is frozen, not the engine.
  assert (public.public_project_study(v_project, 10, 10, null, 'olives', null, null, null)
            ->'totals'->>'revenue_millimes')
       <> (v_before->'totals'->>'revenue_millimes'),
    'a fresh study ignored the corrected price, so the engine is reading something stale';

  -- 6 · Claiming: the person comes off the REQUEST and is never taken from the caller, and a study already
  --     claimed is not re-pointed at somebody else.
  select r.id, r.person_id into v_request, v_person
    from public.interest_requests r
   where r.person_id is not null
   order by r.created_at desc
   limit 1;

  if v_request is not null then
    assert public.claim_study((v_saved->>'id')::uuid, v_request), 'an unclaimed study refused its first claim';
    assert (select s.person_id from public.study_records s where s.id = (v_saved->>'id')::uuid) = v_person,
      'the claim attached the study to a different person than the request''s';

    v_ok := public.claim_study((v_saved->>'id')::uuid, v_request);
    assert not v_ok, 'a study that was already claimed accepted a second claim';

    -- 7 · And the commercial can read it out of the file, which is §8's last line.
    assert jsonb_array_length(public.staff_person_studies(v_person)) >= 1,
      'the client''s file shows none of the studies attached to it';
    assert (public.staff_person_studies(v_person)->0->'totals'->>'net_millimes') is not null,
      'the file lists a study with no figures on it';
  end if;

  -- 8 · A study cannot be saved for an offer the module is closed on, and the refusal is a sentence.
  update public.feature_flags set state = 'disabled' where key = 'study';
  declare
    v_refused boolean := false;
  begin
    begin
      perform public.save_study(v_project, 10, 10, null, 'olives', null, null, null, 'another-hash');
    exception when others then
      v_refused := (sqlerrm = 'module_closed');
    end;
    assert v_refused, 'a study was saved while the module was switched off';
  end;

  raise notice 'study records: computed not accepted, one press one row, claimed from the request, and frozen against later corrections';
end $$;
