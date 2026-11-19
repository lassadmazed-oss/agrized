-- 0176 · «قصص النجاح»: the client's photos and videos, his permission, and the team's work on the story.

do $$
declare
  v_admin  uuid;
  v_com    uuid;
  v_person uuid;
  v_other  uuid;
  v_photo  jsonb;
  v_video  jsonb;
  v_out    jsonb;
  v_failed boolean;
  v_status uuid := (select id from public.lead_statuses order by sort_order limit 1);
begin
  -- ── the doors ───────────────────────────────────────────────────────────────────────────────────────────
  assert not has_function_privilege('anon', 'public.client_story(uuid)', 'execute'), 'a visitor reads no story';
  assert not has_function_privilege('authenticated', 'public.client_story_start(uuid, jsonb)', 'execute'),
    'nobody uploads in someone else''s name from a browser';
  assert has_function_privilege('service_role', 'public.client_story_start(uuid, jsonb)', 'execute'), 'the server can';
  assert not has_function_privilege('anon', 'public.staff_success_stories()', 'execute'), 'nor lists the stories';
  assert exists (select 1 from storage.buckets where id = 'story-media' and not public), 'the files are private';
  assert exists (select 1 from public.settings s, jsonb_array_elements(s.value) e
                  where s.key = 'legal.privacy_sections' and e->>'title' = 'تصاورك وفيديواتك وقصص النجاح'),
    'the privacy page says it';
  assert (select count(*) from public.translations where entity = 'setting' and entity_key = 'ui.story.consent_label') = 4,
    'the permission sentence speaks the four other languages';

  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف عندو قصة', '+21693' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'), v_status, 34)
  returning id into v_person;
  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف آخر', '+21692' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'), v_status, 34)
  returning id into v_other;

  -- ── the client sends a photo, with his permission, and a long video ───────────────────────────────────────
  v_photo := public.client_story_start(v_person, jsonb_build_object(
    'kind', 'photo', 'mime', 'image/jpeg', 'size_bytes', 1048576, 'file_name', 'ana.jpg', 'caption', 'أنا في الأرض',
    'consent', true, 'consent_text', 'نقبل AgriZed تنشر قصّتي'));
  assert (v_photo->>'parts')::integer = 1, 'a photo is one part';
  assert (select consent from public.success_stories where person_id = v_person) = 'granted', 'the box he ticked is his permission';
  assert (select consent_text from public.success_stories where person_id = v_person) like 'نقبل%', 'with the sentence he read';

  v_video := public.client_story_start(v_person, jsonb_build_object(
    'kind', 'video', 'mime', 'video/mp4', 'size_bytes', 100 * 1024 * 1024, 'role', 'final'));
  assert (v_video->>'parts')::integer = ceil(100.0 / app.setting_int('story.part_mb', 45))::integer, 'a long video is cut in parts';
  assert (select role from public.story_media where id = (v_video->>'id')::uuid) = 'raw', 'a client never sends the montage';

  v_failed := false;
  begin
    perform public.client_story_start(v_person, jsonb_build_object('kind', 'video', 'mime', 'video/mp4',
                                      'size_bytes', (app.setting_int('story.max_video_mb', 600) + 1)::bigint * 1024 * 1024));
  exception when others then v_failed := sqlerrm = 'story_too_big';
  end;
  assert v_failed, 'too big is refused before a byte is sent';

  v_failed := false;
  begin
    perform public.client_story_start(v_person, jsonb_build_object('kind', 'photo', 'mime', 'application/pdf', 'size_bytes', 1000));
  exception when others then v_failed := sqlerrm = 'story_bad_type';
  end;
  assert v_failed, 'only photos and videos';

  -- ── arrival is counted by the server ──────────────────────────────────────────────────────────────────────
  v_failed := false;
  begin
    perform public.client_story_arrived(v_person, (v_video->>'id')::uuid, 100 * 1024 * 1024, 1);
  exception when others then v_failed := sqlerrm = 'story_upload_incomplete';
  end;
  assert v_failed, 'a video missing parts has not arrived';
  perform public.client_story_arrived(v_person, (v_photo->>'id')::uuid, 1048576, 1);
  perform public.client_story_arrived(v_person, (v_video->>'id')::uuid, 100 * 1024 * 1024, (v_video->>'parts')::integer);

  v_failed := false;
  begin
    perform public.client_story_arrived(v_other, (v_photo->>'id')::uuid, 1048576, 1);
  exception when others then v_failed := sqlerrm = 'story_media_not_found';
  end;
  assert v_failed, 'nobody finishes someone else''s upload';

  v_out := public.client_story(v_person);
  assert jsonb_array_length(v_out->'media') = 2, 'he sees what he sent';
  assert (v_out->'milestones') @> '[{"key": "media"}]'::jsonb, 'and it is a moment of his story';

  -- ── the team ──────────────────────────────────────────────────────────────────────────────────────────────
  select ur.user_id into v_admin from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
   where ur.role in ('admin', 'super_admin') and pr.is_active limit 1;
  select ur.user_id into v_com from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
   where ur.role = 'commercial' and pr.is_active
     and not exists (select 1 from public.user_roles x where x.user_id = ur.user_id and x.role in ('admin', 'super_admin'))
   limit 1;
  if v_admin is null then
    raise notice 'no admin here; the team''s side is not exercised';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  assert (public.staff_success_stories()->'stories') @> jsonb_build_array(jsonb_build_object('person', jsonb_build_object('id', v_person))),
    'the story is on the team''s list';
  v_out := public.staff_success_story(v_person);
  assert jsonb_array_length(v_out->'media') = 2 and v_out->'timeline' ? 'events', 'with its media and its whole road';

  v_out := public.staff_story_save(v_person, jsonb_build_object('title', 'من تونس لزيتونتو', 'status', 'published',
                                                                'published_url', 'https://www.facebook.com/x'));
  assert v_out->>'status' = 'published' and v_out->>'published_at' is not null, 'with permission, it is published';

  -- He takes it back: the story leaves publication, and cannot be put back without a new permission.
  perform public.client_story_consent(v_person, false, null);
  assert (select status from public.success_stories where person_id = v_person) = 'withdrawn', 'withdrawing unpublishes';
  v_failed := false;
  begin
    perform public.staff_story_save(v_person, jsonb_build_object('status', 'ready'));
  exception when others then v_failed := sqlerrm = 'story_needs_consent';
  end;
  assert v_failed, 'no permission, no publication';

  v_failed := false;
  begin
    perform public.staff_story_consent(v_person, true, '');
  exception when others then v_failed := sqlerrm = 'story_consent_note';
  end;
  assert v_failed, 'a permission recorded by the team says how it was given';
  v_out := public.staff_story_consent(v_person, true, 'ورقة ممضية نهار الزيارة');
  assert v_out->>'consent' = 'granted' and v_out->>'consent_source' = 'staff', 'recorded, with its note';

  v_out := public.staff_story_media_start(v_person, jsonb_build_object('kind', 'video', 'mime', 'video/mp4',
                                                                        'size_bytes', 30 * 1024 * 1024, 'role', 'final'));
  perform public.staff_story_media_arrived((v_out->>'id')::uuid, 30 * 1024 * 1024, 1);
  assert (select status from public.success_stories where person_id = v_person) in ('editing', 'withdrawn'),
    'a montage moves a collecting story into editing';
  v_out := public.staff_story_media_set((v_photo->>'id')::uuid, jsonb_build_object('status', 'kept', 'caption', 'أحلى تصويرة'));
  assert v_out->>'status' = 'kept', 'the team keeps the good ones';

  if v_com is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_com, 'role', 'authenticated')::text, true);
    v_failed := false;
    begin
      perform public.staff_story_save(v_other, jsonb_build_object('title', 'x'));
    exception when others then v_failed := sqlstate = '42501';
    end;
    assert v_failed, 'a commercial writes only on his own files';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- ── he removes a file ─────────────────────────────────────────────────────────────────────────────────────
  v_out := public.client_story_remove(v_person, (v_video->>'id')::uuid);
  assert v_out->>'path' like 'raw/%', 'the server learns which parts to delete';
  assert jsonb_array_length(public.client_story(v_person)->'media') = 1, 'and it is gone from his page';
end $$;
