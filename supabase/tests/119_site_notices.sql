-- 0174 · «إشعارات الموقع»: who sees what when they open the site, and that nothing is shown before it is published.

do $$
declare
  v_admin   uuid;
  v_person  uuid;
  v_holder  uuid;
  v_project uuid;
  v_news    public.site_notices;
  v_journey uuid;
  v_out     jsonb;
begin
  -- ── the doors ───────────────────────────────────────────────────────────────────────────────────────────
  assert not has_function_privilege('anon', 'public.site_notices_for(uuid, text)', 'execute'), 'a browser cannot list notices itself';
  assert not has_function_privilege('authenticated', 'public.site_visitor_link(text, text)', 'execute'), 'nor link itself to a person';
  assert has_function_privilege('service_role', 'public.site_notices_for(uuid, text)', 'execute'), 'the server can';
  assert not has_function_privilege('anon', 'public.staff_save_site_notice(jsonb)', 'execute'), 'a visitor writes nothing';

  -- ── the drafts the migration left: four follow-up steps, nothing published by the migration itself ───────
  -- (the owner published them on 2026-11-18, so they are counted whatever their status now)
  assert (select count(*) from public.site_notices where kind = 'journey' and status in ('draft', 'published')) >= 4,
    'the follow-up is drafted';
  assert not exists (select 1 from public.site_notices where status = 'published' and published_at is null),
    'whatever is published says when';
  assert not exists (select 1 from public.site_notices
                      where kind = 'journey' and (body ~ '(ربح|مضمون|مردود)' or title ~ '(ربح|مضمون|مردود)')), 'no promise of gain';

  -- ── a person registered 5 days ago, a tree holder, and a new offer ─────────────────────────────────────────
  insert into public.persons (full_name, phone_e164, status_id, governorate_id, created_at)
  values ('زائر مسجّل', '+21698' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'),
          (select id from public.lead_statuses order by sort_order limit 1), 34, now() - interval '5 days')
  returning id into v_person;
  insert into public.persons (full_name, phone_e164, status_id, governorate_id, created_at)
  values ('صاحب زيتونة', '+21697' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'),
          (select id from public.lead_statuses order by sort_order limit 1), 34, now() - interval '5 days')
  returning id into v_holder;
  insert into public.projects (code, name, governorate_id, status) values ('NOTICE-' || substr(md5(random()::text), 1, 6), 'عرض الإشعار', 34, 'published')
  returning id into v_project;
  insert into public.trees (project_id, seq, code, state, held_by, allocated_at) values (v_project, 1, 'NOTICE-T-1', 'sold', v_holder, now());

  assert exists (select 1 from public.site_notices where kind = 'offer' and project_id = v_project and status = 'draft'),
    'publishing an offer drafts its «عرض جديد»';
  assert app.site_notice_for_offer(v_project) is null, 'and only once';

  -- ── publishing, as an administrator ────────────────────────────────────────────────────────────────────
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin here; publishing is not exercised';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_news := public.staff_save_site_notice(jsonb_build_object('title', 'خبر للجميع', 'body', 'نص', 'link', '/projects', 'audience', 'everyone'));
  assert (public.staff_site_notices()->'notices') @> jsonb_build_array(jsonb_build_object('id', v_news.id)), 'the Back Office lists it';
  -- A draft is invisible.
  assert not (public.site_notices_for(null, 'ar') @> jsonb_build_array(jsonb_build_object('id', v_news.id))), 'a draft is not shown';
  perform public.staff_site_notice_status(v_news.id, 'published');
  perform public.staff_site_notice_status((select id from public.site_notices where kind = 'offer' and project_id = v_project), 'published');
  select id into v_journey from public.site_notices where kind = 'journey' and after_days = 4 limit 1;
  perform public.staff_site_notice_status(v_journey, 'published');
  perform public.staff_site_notice_status((select id from public.site_notices where kind = 'journey' and after_days = 10 limit 1), 'published');
  perform set_config('request.jwt.claims', '', true);

  -- ── who sees what ─────────────────────────────────────────────────────────────────────────────────────
  v_out := public.site_notices_for(null, 'ar');
  assert v_out @> jsonb_build_array(jsonb_build_object('id', v_news.id)), 'a visitor sees what is for everyone';
  assert not (v_out @> jsonb_build_array(jsonb_build_object('id', v_journey))), 'but no follow-up';
  assert not (public.site_notices_for(null, 'fr') @> jsonb_build_array(jsonb_build_object('id', v_news.id))), 'an Arabic notice stays on the Arabic site';

  v_out := public.site_notices_for(v_person, 'ar');
  assert v_out @> jsonb_build_array(jsonb_build_object('id', v_journey)), 'five days after registering, the day-4 step shows';
  assert not (v_out @> jsonb_build_array(jsonb_build_object('id', (select id from public.site_notices where kind = 'journey' and after_days = 10 limit 1)))),
    'the day-10 step waits its day';
  assert not (public.site_notices_for(v_holder, 'ar') @> jsonb_build_array(jsonb_build_object('id', v_journey))),
    'the follow-up stops once someone holds trees';

  -- ── read, then dismissed ──────────────────────────────────────────────────────────────────────────────
  perform public.site_notice_mark(v_person, v_news.id, 'read');
  assert (select (e->>'read')::boolean from jsonb_array_elements(public.site_notices_for(v_person, 'ar')) e where (e->>'id')::uuid = v_news.id),
    'a read notice is marked read';
  perform public.site_notice_mark(v_person, v_news.id, 'dismiss');
  assert not (public.site_notices_for(v_person, 'ar') @> jsonb_build_array(jsonb_build_object('id', v_news.id))), 'a dismissed one is gone';

end $$;

do $$
declare
  v_req   record;
  v_hash  text := repeat('cd', 32);
begin
  select request_no, person_id into v_req from public.interest_requests where person_id is not null limit 1;
  if v_req.request_no is null then
    raise notice 'no request to link; skipped';
    return;
  end if;
  assert public.site_visitor_link(v_hash, v_req.request_no) = v_req.person_id, 'a browser is linked by its request number';
  assert public.site_visitor_person(v_hash) = v_req.person_id, 'and found again by its token';
  assert public.site_visitor_link(v_hash, 'NO-SUCH-REQUEST') is null, 'an unknown request links nothing';
  assert public.site_visitor_person(repeat('ef', 32)) is null, 'an unknown token is nobody';
end $$;
