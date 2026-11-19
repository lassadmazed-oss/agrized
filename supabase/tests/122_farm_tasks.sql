-- 0178 · «الخدمة في الضيعة»: a task planned, worked with photo reports, checked and approved by its supervisor.

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000f0a1', 'authenticated', 'authenticated', 'farm-mgr@test.local', '{"full_name":"مسؤول الضيعة"}'),
  ('00000000-0000-0000-0000-00000000f0b1', 'authenticated', 'authenticated', 'farm-w1@test.local',  '{"full_name":"عامل واحد"}'),
  ('00000000-0000-0000-0000-00000000f0b2', 'authenticated', 'authenticated', 'farm-w2@test.local',  '{"full_name":"عامل ثاني"}'),
  ('00000000-0000-0000-0000-00000000f0c1', 'authenticated', 'authenticated', 'farm-sup@test.local', '{"full_name":"المراقب"}');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-00000000f0a1', 'agri_manager'),
  ('00000000-0000-0000-0000-00000000f0b1', 'worker'),
  ('00000000-0000-0000-0000-00000000f0b2', 'worker'),
  ('00000000-0000-0000-0000-00000000f0c1', 'supervisor')
on conflict do nothing;

do $$
declare
  v_mgr     uuid := '00000000-0000-0000-0000-00000000f0a1';
  v_w1      uuid := '00000000-0000-0000-0000-00000000f0b1';
  v_w2      uuid := '00000000-0000-0000-0000-00000000f0b2';
  v_sup     uuid := '00000000-0000-0000-0000-00000000f0c1';
  v_project uuid;
  v_service uuid := (select id from public.option_items where list_key = 'agrized_service' and is_active order by sort_order limit 1);
  v_task    jsonb;
  v_id      uuid;
  v_open    jsonb;
  v_out     jsonb;
  v_failed  boolean;
  v_ops     integer;
begin
  -- ── the doors: the two new roles are not CRM staff ────────────────────────────────────────────────────────
  assert not has_function_privilege('anon', 'public.farm_board()', 'execute'), 'a visitor sees no task';
  assert exists (select 1 from storage.buckets where id = 'farm-photos' and not public), 'farm photos are private';

  insert into public.projects (code, name, governorate_id, status)
  values ('FARM-' || substr(md5(random()::text), 1, 6), 'ضيعة التجربة', 34, 'published') returning id into v_project;

  perform set_config('request.jwt.claims', json_build_object('sub', v_w1, 'role', 'authenticated')::text, true);
  assert not app.is_staff(), 'a worker is not CRM staff';
  assert not app.can_see_person((select id from public.persons limit 1)), 'and reads no client file';
  v_failed := false;
  begin
    perform public.staff_farm_task_save(jsonb_build_object('project_id', v_project));
  exception when others then v_failed := sqlstate = '42501';
  end;
  assert v_failed, 'a worker does not plan tasks';

  -- ── the manager plans ─────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  assert jsonb_array_length(public.staff_farm_people()->'workers') >= 2, 'the manager sees the workers';
  v_failed := false;
  begin
    perform public.staff_farm_task_save(jsonb_build_object('project_id', v_project, 'service_option_id', v_service,
                                        'planned_on', app.tunis_today(), 'worker_ids', jsonb_build_array(v_sup)));
  exception when others then v_failed := sqlerrm = 'farm_not_a_worker';
  end;
  assert v_failed, 'only workers do the work';

  v_task := public.staff_farm_task_save(jsonb_build_object(
    'project_id', v_project, 'service_option_id', v_service, 'title', 'تقليم الصفوف 1 حتى 12',
    'instructions', 'قلّم الفروع اليابسة برك', 'scope_note', 'الصفوف 1-12', 'target_trees', 120,
    'planned_on', app.tunis_today(), 'worker_ids', jsonb_build_array(v_w1, v_w2), 'supervisor_id', v_sup));
  v_id := (v_task->>'id')::uuid;
  assert v_task->>'status' = 'planned' and jsonb_array_length(v_task->'workers') = 2, 'planned, for two workers';

  -- ── a worker: his list, the start, a day's report with photos ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_w1, 'role', 'authenticated')::text, true);
  assert public.farm_board()->>'role' = 'worker', 'he reads his own list';
  assert (public.farm_board()->'tasks') @> jsonb_build_array(jsonb_build_object('id', v_id)), 'with the task on it';
  assert (public.farm_task(v_id)->>'can_work')::boolean, 'he can work it';
  perform public.farm_task_start(v_id);
  assert (select status from public.farm_tasks where id = v_id) = 'in_progress', 'started';

  v_failed := false;
  begin
    perform public.farm_report_open(v_id, jsonb_build_object('trees_done', 40, 'photos', '[]'::jsonb));
  exception when others then v_failed := sqlerrm = 'farm_photos_required';
  end;
  assert v_failed, 'a report without photos is refused';

  v_open := public.farm_report_open(v_id, jsonb_build_object('trees_done', 60, 'note', 'نهار أوّل',
              'photos', jsonb_build_array(jsonb_build_object('mime', 'image/jpeg', 'size_bytes', 900000),
                                          jsonb_build_object('mime', 'image/jpeg', 'size_bytes', 800000))));
  v_failed := false;
  begin
    perform public.farm_report_close((v_open->>'report_id')::uuid, '{}'::uuid[]);
  exception when others then v_failed := sqlerrm = 'farm_photos_missing';
  end;
  assert v_failed, 'a report whose photos never arrived does not count';
  perform public.farm_report_close((v_open->>'report_id')::uuid,
                                   array[((v_open->'photos'->0)->>'id')::uuid, ((v_open->'photos'->1)->>'id')::uuid]);

  -- The second worker finishes the next day.
  perform set_config('request.jwt.claims', json_build_object('sub', v_w2, 'role', 'authenticated')::text, true);
  v_open := public.farm_report_open(v_id, jsonb_build_object('trees_done', 60, 'finished', true,
              'photos', jsonb_build_array(jsonb_build_object('mime', 'image/jpeg', 'size_bytes', 700000))));
  v_out := public.farm_report_close((v_open->>'report_id')::uuid, array[((v_open->'photos'->0)->>'id')::uuid]);
  assert v_out->>'status' = 'reported' and (v_out->>'trees_done')::integer = 120, 'done: 120 trees, waiting for the check';

  v_failed := false;
  begin
    perform public.farm_report_open(v_id, jsonb_build_object('kind', 'check', 'verdict', 'approved',
              'photos', jsonb_build_array(jsonb_build_object('mime', 'image/jpeg', 'size_bytes', 1000))));
  exception when others then v_failed := sqlstate = '42501';
  end;
  assert v_failed, 'a worker does not approve his own work';

  -- ── the supervisor: «عاود», then «مقبولة» ─────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  assert public.farm_board()->>'role' = 'supervisor', 'the supervisor reads the tasks he supervises';
  assert (public.farm_task(v_id)->>'can_check')::boolean, 'he can check this one';
  assert jsonb_array_length(public.farm_task(v_id)->'reports') = 2, 'and sees both reports';

  v_failed := false;
  begin
    perform public.farm_report_open(v_id, jsonb_build_object('kind', 'check', 'verdict', 'redo',
              'photos', jsonb_build_array(jsonb_build_object('mime', 'image/jpeg', 'size_bytes', 1000))));
  exception when others then v_failed := sqlerrm = 'farm_redo_needs_note';
  end;
  assert v_failed, '«عاود» says what is wrong';

  v_open := public.farm_report_open(v_id, jsonb_build_object('kind', 'check', 'verdict', 'redo', 'note', 'الصف 7 ما تقلّمش',
              'photos', jsonb_build_array(jsonb_build_object('mime', 'image/jpeg', 'size_bytes', 1000))));
  v_out := public.farm_report_close((v_open->>'report_id')::uuid, array[((v_open->'photos'->0)->>'id')::uuid]);
  assert v_out->>'status' = 'redo' and v_out->'last_check'->>'note' = 'الصف 7 ما تقلّمش', 'sent back, with why';

  perform set_config('request.jwt.claims', json_build_object('sub', v_w1, 'role', 'authenticated')::text, true);
  v_open := public.farm_report_open(v_id, jsonb_build_object('trees_done', 10, 'finished', true, 'note', 'الصف 7 تقلّم',
              'photos', jsonb_build_array(jsonb_build_object('mime', 'image/png', 'size_bytes', 5000))));
  perform public.farm_report_close((v_open->>'report_id')::uuid, array[((v_open->'photos'->0)->>'id')::uuid]);

  perform set_config('request.jwt.claims', json_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  select count(*) into v_ops from public.agri_operations where project_id = v_project;
  v_open := public.farm_report_open(v_id, jsonb_build_object('kind', 'check', 'verdict', 'approved', 'note', 'مزيانة',
              'photos', jsonb_build_array(jsonb_build_object('mime', 'image/jpeg', 'size_bytes', 2000))));
  v_out := public.farm_report_close((v_open->>'report_id')::uuid, array[((v_open->'photos'->0)->>'id')::uuid]);
  assert v_out->>'status' = 'approved' and v_out->>'operation_id' is not null, 'approved';
  assert (select count(*) from public.agri_operations where project_id = v_project) = v_ops + 1, 'the done operation is written once';
  assert (select status from public.agri_operations where id = (v_out->>'operation_id')::uuid) = 'done', 'as done';

  v_failed := false;
  begin
    perform public.farm_report_open(v_id, jsonb_build_object('kind', 'check', 'verdict', 'redo', 'note', 'xxx',
              'photos', jsonb_build_array(jsonb_build_object('mime', 'image/jpeg', 'size_bytes', 2000))));
  exception when others then v_failed := sqlerrm = 'farm_task_closed';
  end;
  assert v_failed, 'an approved task is closed';

  -- ── a stranger ────────────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  v_failed := false;
  begin
    perform public.farm_task(v_id);
  exception when others then v_failed := sqlstate = '42501';
  end;
  assert v_failed, 'nobody else reads the task';
  perform set_config('request.jwt.claims', '', true);
end $$;
