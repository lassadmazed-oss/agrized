-- حذف العرض — an offer can be deleted, but never from under a client.
-- Migration supabase/migrations/0120_offer_removal.sql. Rolled back; fixtures are offers this file creates.

do $$
begin
  if to_regprocedure('public.staff_delete_project(uuid, text)') is null then
    raise exception
      'supabase/migrations/0120_offer_removal.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0120_offer_removal.sql supabase/tests/072_offer_removal.sql';
  end if;
end $$;

create function pg_temp.or_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm not like '%' || p_expected || '%' then
    raise exception 'expected error "%" but got "%" from: %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

update public.settings set value = to_jsonb(0) where key = 'audit.reason_min_length';

do $$
declare
  v_admin   uuid := gen_random_uuid();
  v_finance uuid := gen_random_uuid();
  v_clean   uuid;
  v_used    uuid;
begin
  insert into auth.users (id, aud, role, email) values
    (v_admin,   'authenticated', 'authenticated', 'or-admin-'   || v_admin   || '@test.local'),
    (v_finance, 'authenticated', 'authenticated', 'or-finance-' || v_finance || '@test.local');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin'), (v_finance, 'finance');
  perform set_config('test.or_admin', v_admin::text, true);
  perform set_config('test.or_finance', v_finance::text, true);

  -- An untouched offer, with trees, a picture, a translation and an internal cost of its own.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('ORM-' || substr(gen_random_uuid()::text, 1, 8), 'عرض للحذف', 34, 'internal', 3)
  returning id into v_clean;
  insert into public.trees (project_id, seq, code, state)
  select v_clean, s, 'ORM-' || s, 'available' from generate_series(1, 3) s;
  insert into public.project_media (project_id, url, alt_ar, sort_order) values (v_clean, 'https://example.test/a.jpg', 'صورة', 1);
  insert into public.translations (entity, entity_key, field, locale, value)
  values ('project', v_clean::text, 'name', 'fr', '"Offre à supprimer"');
  perform set_config('test.or_clean', v_clean::text, true);

  -- An offer a client has asked for: an existing request is pointed at it — inside this rolled-back
  -- transaction only — which is a real request row with every column a real one has.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('ORU-' || substr(gen_random_uuid()::text, 1, 8), 'عرض فيه مطلب', 34, 'internal', 3)
  returning id into v_used;
  update public.interest_requests set project_id = v_used
   where id = (select r.id from public.interest_requests r order by r.created_at limit 1);
  perform set_config('test.or_used', v_used::text, true);
end $$;

-- 1 · Who may.
select set_config('request.jwt.claims', '', true);
set local role anon;
select pg_temp.or_expect(format('select public.staff_delete_project(%L)', current_setting('test.or_clean')), 'permission denied');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.or_finance'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.or_expect(format('select public.staff_delete_project(%L)', current_setting('test.or_clean')), 'forbidden');
do $$
begin
  -- Finance may read what an offer carries (it archives), not delete.
  assert (select history from public.staff_offer_history(array[current_setting('test.or_used')::uuid])) ? 'requests',
    'the history names the request';
  assert (select history from public.staff_offer_history(array[current_setting('test.or_clean')::uuid])) = '{}'::jsonb,
    'an untouched offer carries nothing';
end $$;
reset role;

-- 2 · An offer with history is refused; an untouched one is deleted with its own setup.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.or_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.or_expect(format('select public.staff_delete_project(%L)', current_setting('test.or_used')), 'offer_has_history');
select public.staff_delete_project(current_setting('test.or_clean')::uuid, null);
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  v_clean uuid := current_setting('test.or_clean')::uuid;
begin
  assert not exists (select 1 from public.projects where id = v_clean), 'the offer is gone';
  assert not exists (select 1 from public.trees where project_id = v_clean), 'its unsold trees went with it';
  assert not exists (select 1 from public.project_media where project_id = v_clean), 'its pictures went with it';
  assert not exists (select 1 from public.translations where entity = 'project' and entity_key = v_clean::text),
    'its translations went with it';
  assert exists (select 1 from public.audit_logs where entity = 'projects' and entity_id = v_clean::text and action = 'delete'),
    'the deletion is in the audit log';
  assert exists (select 1 from public.projects where id = current_setting('test.or_used')::uuid),
    'the offer a client asked for is still there';
end $$;
