-- 0167 · «أخبار زيتونتك»: a post per offer, published once, read only by the people holding trees there.

do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_other   uuid;
  v_holder  uuid;
  v_kind    uuid := (select id from public.option_items where list_key = 'tree_news_kind' and code = 'bloom');
  v_news    public.tree_news;
  v_out     jsonb;
  v_ok      boolean;
begin
  -- ── what the migration set up ───────────────────────────────────────────────────────────────────────────
  assert v_kind is not null, 'the kinds of news are a list the owner edits';
  assert exists (select 1 from storage.buckets where id = 'tree-news' and public), 'the photos have their bucket';
  assert (select title_ar from public.message_templates where key = 'tree_news.push' and channel = 'push') is not null,
    'the push has its fixed title';
  assert exists (select 1 from public.message_templates where key = 'tree_news.sms' and channel = 'sms'), 'the SMS exists';
  assert not has_function_privilege('anon', 'public.staff_save_tree_news(jsonb)', 'execute'), 'a visitor posts nothing';
  assert not has_function_privilege('anon', 'public.my_tree_news()', 'execute'), 'a visitor reads no feed';
  assert (public.my_tree_news()->>'reason') = 'no_session', 'the feed needs a session';

  -- ── an offer with one holder, another with none ─────────────────────────────────────────────────────────
  insert into public.projects (code, name, governorate_id) values ('NEWS-' || substr(md5(random()::text), 1, 6), 'عرض اختبار الأخبار', 34)
  returning id into v_project;
  insert into public.projects (code, name, governorate_id) values ('NEWS-' || substr(md5(random()::text), 1, 6), 'عرض بلا حرفاء', 34)
  returning id into v_other;
  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('صاحب زيتونة', '+21699' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'),
          (select id from public.lead_statuses order by sort_order limit 1), 34)
  returning id into v_holder;
  insert into public.trees (project_id, seq, code, state, held_by, allocated_at) values (v_project, 1, 'NEWS-T-0001', 'sold', v_holder, now());
  assert (select count(*) from app.tree_news_audience(v_project)) = 1, 'the offer has one holder';
  assert (select count(*) from app.tree_news_audience(v_other)) = 0, 'the other has none';

  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin here; posting is not exercised';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ── a draft, then its publication: the holder is told once ──────────────────────────────────────────────
  v_ok := true;
  begin
    perform public.staff_save_tree_news(jsonb_build_object('project_id', v_project, 'title', '   ', 'reason', 'تجربة'));
  exception when others then
    v_ok := false;
    assert sqlerrm = 'invalid_news_title', 'an empty title is refused by name, got ' || sqlerrm;
  end;
  assert not v_ok, 'a post needs a title';

  v_news := public.staff_save_tree_news(jsonb_build_object(
    'project_id', v_project, 'kind_option_id', v_kind, 'title', 'زيتونتك نوّرت', 'body', 'الضيعة بيضاء بالنوّار هالأسبوع.',
    'photo_path', 'NEWS/1.jpg', 'photo_alt', 'زيتونة منوّرة', 'reason', 'تجربة'));
  assert v_news.published_at is null and v_news.kind_label_ar is not null, 'a saved post is a draft, with its kind as it read';

  v_out := public.staff_publish_tree_news(v_news.id, false, true, 'تجربة');
  assert (v_out->>'holders')::integer = 1 and (v_out->>'sms')::integer = 1, 'the holder is told by SMS: ' || v_out::text;
  assert exists (select 1 from public.notification_outbox o where o.related_entity = 'tree_news' and o.related_id = v_news.id
                   and o.template_key = 'tree_news.sms'), 'the SMS is queued for the holder';
  assert (select published_at is not null and notified_at is not null and sms_sent = 1 from public.tree_news where id = v_news.id),
    'the post is published and says whom it told';

  v_out := public.staff_publish_tree_news(v_news.id, true, true, 'مرّة ثانية');
  assert (v_out->>'already_notified')::boolean and (v_out->>'sms')::integer = 0, 'nobody is told twice';
  assert (select count(*) from public.notification_outbox o where o.related_id = v_news.id) = 1, 'still one message';

  -- ── the list the Back Office reads, and archiving ───────────────────────────────────────────────────────
  v_out := public.staff_tree_news();
  assert exists (select 1 from jsonb_array_elements(v_out->'news') e where (e->>'id')::uuid = v_news.id), 'the post is listed';
  assert (select (e->>'holders')::integer from jsonb_array_elements(v_out->'offers') e where (e->>'id')::uuid = v_project) = 1,
    'each offer says how many it would reach';
  perform public.staff_archive_tree_news(v_news.id, 'تجربة');
  assert (select archived_at is not null from public.tree_news where id = v_news.id), 'the post is archived';
end $$;
