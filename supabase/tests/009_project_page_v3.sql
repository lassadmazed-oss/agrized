-- Report v3 §20 · the full project page: gallery, video, location, documents, services.
-- Migration 0023_project_page_v3.sql.
-- Live data caveat: the catalog may hold other projects, so every assertion is relative to the PG-* fixtures.

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'fin-page@test.local', '{"full_name":"Finance Page"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'com-page@test.local', '{"full_name":"Commercial Page"}');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'finance'),
  ('00000000-0000-0000-0000-0000000000f2', 'commercial');

update public.feature_flags set state = 'public' where key = 'projects';

insert into public.projects (code, name, governorate_id, plantation_system, production_status, status, description_ar,
                             water_available, water_note, access_note, video_url, latitude, longitude, show_location,
                             document_option_ids, service_option_ids, legal_notes, annual_costs_millimes, pricing)
values
  ('PG-P', 'مشروع الصفحة', 34, 'traditional', 'producing', 'published', 'PUBLIC-DESC', true, 'بئر', 'طريق معبّدة',
   'https://www.youtube.com/watch?v=abc123', 34.5, 10.3, false,
   array[(select id from public.option_items where list_key = 'land_document' and code = 'land_title')],
   array[(select id from public.option_items where list_key = 'agrized_service' and code = 'harvest')],
   'SECRET-LEGAL', 999000, '{"model":"monthly_rate","monthly_rate_pct":1}'::jsonb),
  ('PG-I', 'مشروع داخلي للصفحة', 34, 'traditional', 'producing', 'internal', 'INTERNAL-DESC', null, null, null, null, null, null, false,
   '{}', '{}', null, null, '{}'::jsonb),
  ('PG-D', 'مسودة الصفحة', 34, 'traditional', 'producing', 'draft', 'DRAFT-DESC', null, null, null, null, null, null, false,
   '{}', '{}', null, null, '{}'::jsonb);

insert into public.project_media (project_id, url, storage_path, alt_ar, sort_order, is_cover) values
  ((select id from public.projects where code = 'PG-P'), 'https://example.supabase.co/storage/v1/object/public/project-media/pg/a.jpg', 'pg/a.jpg', 'صورة أولى', 10, false),
  ((select id from public.projects where code = 'PG-P'), 'https://example.supabase.co/storage/v1/object/public/project-media/pg/b.jpg', 'pg/b.jpg', 'صورة الغلاف', 20, true),
  ((select id from public.projects where code = 'PG-D'), 'https://example.supabase.co/storage/v1/object/public/project-media/pg/d.jpg', null, 'مسودة', 10, false);

-- ---------------------------------------------------------------------------
-- T1 · Shapes the database refuses
-- ---------------------------------------------------------------------------

do $$
declare
  v_project uuid := (select id from public.projects where code = 'PG-P');
begin
  begin
    update public.projects set video_url = 'http://insecure.example/v' where id = v_project;
    raise exception 'a non-https video address was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.project_media (project_id, url, alt_ar) values (v_project, 'https://example.com/x.jpg', '   ');
    raise exception 'a picture without alternative text was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.project_media (project_id, url, alt_ar, is_cover) values (v_project, 'https://example.com/y.jpg', 'غلاف ثاني', true);
    raise exception 'a second cover was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- T2 · A visitor
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
declare
  v_page jsonb;
  r record;
begin
  begin
    perform 1 from public.project_media;
    raise exception 'anon must not read project_media';
  exception when insufficient_privilege then null;
  end;

  v_page := public.public_project_page('PG-P');
  assert v_page is not null, 'a published project has a page';
  assert v_page->>'description_ar' = 'PUBLIC-DESC', 'the description is on the page';
  assert (v_page->>'water_available')::boolean and v_page->>'access_note' = 'طريق معبّدة', 'water and access are on the page';
  assert v_page->>'video_url' = 'https://www.youtube.com/watch?v=abc123', 'the video address is on the page';
  assert v_page->'latitude' = 'null'::jsonb and v_page->'longitude' = 'null'::jsonb, 'no coordinates until the team shows the location';
  assert jsonb_array_length(v_page->'media') = 2, 'both pictures of the project, got ' || jsonb_array_length(v_page->'media');
  assert v_page->'media'->0->>'alt_ar' = 'صورة الغلاف', 'the cover comes first';
  assert jsonb_array_length(v_page->'document_option_ids') = 1 and jsonb_array_length(v_page->'service_option_ids') = 1,
    'document and service ids are on the page';

  -- PRJ-03: nothing internal leaves Postgres
  assert not (v_page ?| array['pricing', 'legal_notes', 'annual_costs_millimes', 'notes', 'land_offer_id', 'plan_storage_path', 'updated_by']),
    'the page payload stays whitelisted';
  assert not exists (select 1 from jsonb_array_elements(v_page->'media') e where e ? 'storage_path' or e ? 'created_by'),
    'pictures carry no storage path or staff id';
  assert v_page::text !~ 'SECRET-LEGAL', 'legal notes never reach the page';

  assert public.public_project_page('PG-D') is null, 'a draft has no page';
  assert public.public_project_page('PG-I') is null, 'an internal project has no page for a visitor';
  assert public.public_project_page('NOPE-404') is null, 'an unknown code has no page';

  select * into r from public.public_projects() where code = 'PG-P';
  assert r.cover_url like '%/pg/b.jpg' and r.cover_alt_ar = 'صورة الغلاف', 'the listing shows the cover picture';

  assert has_function_privilege('anon', 'public.public_project_page(text)', 'execute'), 'visitors can open a project page';
  assert not has_function_privilege('anon', 'app.project_media_limit()', 'execute'), 'the gallery trigger is closed to visitors';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- T3 · Coordinates appear only when the team shows the location
-- ---------------------------------------------------------------------------

update public.projects set show_location = true where code = 'PG-P';

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
declare
  v_page jsonb := public.public_project_page('PG-P');
begin
  assert (v_page->>'latitude')::numeric = 34.5 and (v_page->>'longitude')::numeric = 10.3, 'coordinates are shown once allowed';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- T4 · Staff: commercials read, Finance writes
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated"}';
set local role authenticated;

do $$
begin
  assert (select count(*) from public.project_media where project_id = (select id from public.projects where code = 'PG-P')) = 2,
    'a commercial reads the gallery';
  assert public.public_project_page('PG-I') is not null, 'staff preview an internal project page';
  begin
    insert into public.project_media (project_id, url, alt_ar)
    values ((select id from public.projects where code = 'PG-P'), 'https://example.com/c.jpg', 'صورة من commercial');
    raise exception 'a commercial must not add pictures';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
set local role authenticated;

do $$
declare
  v_project uuid := (select id from public.projects where code = 'PG-P');
  v_id uuid;
begin
  insert into public.project_media (project_id, url, alt_ar, sort_order)
  values (v_project, 'https://example.com/f.jpg', 'صورة من Finance', 30)
  returning id into v_id;
  update public.project_media set sort_order = 5, caption_ar = 'مدخل الضيعة' where id = v_id;
  assert (select sort_order from public.project_media where id = v_id) = 5, 'Finance reorders a picture';
  delete from public.project_media where id = v_id;
  assert not exists (select 1 from public.project_media where id = v_id), 'Finance removes a picture';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- T5 · The module flag closes the page
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'disabled' where key = 'projects';

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert public.public_project_page('PG-P') is null, 'no page while the module is disabled';
end $$;

reset role;

update public.feature_flags set state = 'public' where key = 'projects';

-- ---------------------------------------------------------------------------
-- T6 · Storage, services list and the gallery limit
-- ---------------------------------------------------------------------------

do $$
declare
  v_project uuid := (select id from public.projects where code = 'PG-P');
begin
  assert exists (select 1 from storage.buckets where id = 'project-media' and public and file_size_limit = 5242880
                 and 'image/webp' = any (allowed_mime_types)),
    'the project-media bucket is public, 5 MB, pictures only';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname like 'project_media_objects_%') = 4,
    'the bucket has its four write policies';
  assert (select count(*) from public.option_items where list_key = 'agrized_service' and is_active) >= 10,
    'the ten services of report v3 §36 are seeded';

  update public.settings set value = to_jsonb(3) where key = 'projects.gallery_max';
  insert into public.project_media (project_id, url, alt_ar) values (v_project, 'https://example.com/3.jpg', 'ثالثة');
  begin
    insert into public.project_media (project_id, url, alt_ar) values (v_project, 'https://example.com/4.jpg', 'رابعة');
    raise exception 'the gallery limit was not enforced';
  exception when check_violation then null;
  end;
end $$;
