-- لغة الحريف — an explicit choice is never overwritten by the page it was made from.
-- Migration supabase/migrations/0110_i18n_explicit_locale.sql. Rolled back; fixtures on unused numbers.

do $$
begin
  if position('locale_explicit' in pg_get_functiondef('app.persons_capture_locale()'::regprocedure)) = 0 then
    raise exception
      'supabase/migrations/0110_i18n_explicit_locale.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0110_i18n_explicit_locale.sql supabase/tests/068_i18n_explicit_locale.sql';
  end if;
end $$;

create function pg_temp.el_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm not like '%' || p_expected || '%' then
    raise exception 'expected error "%" but got "%" from: %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

update public.locales set is_enabled = true where code in ('fr', 'de');

do $$
declare
  v_client uuid := gen_random_uuid();
  v_com    uuid := gen_random_uuid();
  v_other  uuid := gen_random_uuid();
  v_phone  text;
  v_phone2 text;
  v_status uuid := (select id from public.lead_statuses order by sort_order limit 1);
begin
  loop
    v_phone := '+2169' || lpad((floor(random() * 10000000))::text, 7, '0');
    v_phone2 := '+2169' || lpad((floor(random() * 10000000))::text, 7, '0');
    exit when v_phone <> v_phone2
      and not exists (select 1 from public.persons p where p.phone_e164 in (v_phone, v_phone2));
  end loop;
  insert into auth.users (id, aud, role, email) values
    (v_client, 'authenticated', 'authenticated', 'el-client-' || v_client || '@test.local'),
    (v_com,    'authenticated', 'authenticated', 'el-com-'    || v_com    || '@test.local'),
    (v_other,  'authenticated', 'authenticated', 'el-other-'  || v_other  || '@test.local');
  insert into public.user_roles (user_id, role) values (v_com, 'commercial'), (v_other, 'commercial');
  insert into public.persons (full_name, phone_e164, status_id, profile_id, preferred_locale, assigned_to)
  values ('Client Explicite', v_phone, v_status, v_client, 'fr', v_com);
  insert into public.persons (full_name, phone_e164, status_id) values ('Autre', v_phone2, v_status);
  perform set_config('test.el_client', v_client::text, true);
  perform set_config('test.el_com', v_com::text, true);
  perform set_config('test.el_other', v_other::text, true);
  perform set_config('test.el_phone', v_phone, true);
  perform set_config('test.el_phone2', v_phone2, true);
end $$;

-- The client stands on the GERMAN page and chooses FRENCH — the language their file already says.
select set_config('request.headers', '{"x-agrized-locale": "de"}', true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.el_client'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.set_my_locale('fr');
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '{}', true);

do $$
begin
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.el_phone')) = 'fr',
    'choosing the language the file already holds, from another language''s page, keeps the choice';
end $$;

-- The flag is per transaction: in the same transaction a later public write still captures the page's
-- language — on another person, so the explicit choice above is not what is being measured.
select set_config('app.locale_explicit', '', true);
select set_config('request.headers', '{"x-agrized-locale": "de"}', true);
update public.persons set full_name = 'Autre Personne' where phone_e164 = current_setting('test.el_phone2');
select set_config('request.headers', '{}', true);
do $$
begin
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.el_phone2')) = 'de',
    'without the explicit flag the page''s language is still captured';
end $$;

-- staff_set_person_locale follows the file's own rule: the assigned commercial may, another commercial may not.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.el_other'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.el_expect(
  format($q$select public.staff_set_person_locale((select id from public.persons where phone_e164 = %L), 'de')$q$, current_setting('test.el_phone')),
  'forbidden');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.el_com'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.staff_set_person_locale((select id from public.persons where phone_e164 = current_setting('test.el_phone')), 'de');
reset role;
select set_config('request.jwt.claims', '', true);
do $$
begin
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.el_phone')) = 'de',
    'the assigned commercial sets the client''s language';
end $$;
