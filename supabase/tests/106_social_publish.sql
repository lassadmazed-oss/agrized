-- 0160 · the token goes in and does not come back, and only an approved post is ever claimed.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_id      uuid;
  v_out     jsonb;
  v_ok      boolean;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1 · THE TOKEN READER IS GRANTED TO NOBODY. It is reached only from inside the claim, which is a definer
  --     function; there is no door a browser can ask for a page token through, not even an administrator's.
  assert not has_function_privilege('anon', 'app.social_token(text)', 'execute'),
    'a visitor can read the page token';
  assert not has_function_privilege('authenticated', 'app.social_token(text)', 'execute'),
    'any signed-in account can read the page token';

  -- 2 · Setting one. The answer must say that it worked and NOT what was stored: an echo would put the
  --     token in a server log, a network tab and an error report, three places it did not need to be.
  v_out := public.staff_social_set_token('facebook', 'test-page', 'SECRET-TOKEN-VALUE', 'صفحة اختبار', null, true);
  assert v_out::text not like '%SECRET-TOKEN-VALUE%', 'setting a token echoed it back to the caller';
  assert (v_out->>'is_enabled')::boolean, 'the account was not enabled by the token that connected it';

  -- An empty token is refused rather than stored: a row that looks connected and is not is worse than one
  -- that says it is not.
  v_ok := false;
  begin
    perform public.staff_social_set_token('facebook', 'test-page', '   ', null, null, true);
  exception when others then
    v_ok := (sqlerrm = 'empty_token');
  end;
  assert v_ok, 'an empty token was accepted, so an account can look connected while it is not';

  -- 3 · A post to publish, approved the way §7 requires.
  select p.id into v_project from public.projects p where p.status = 'published' order by p.created_at limit 1;
  if v_project is null then
    raise notice 'no published offer; publishing is untested here';
    return;
  end if;
  delete from public.social_posts where project_id = v_project;

  insert into public.social_posts (project_id, network, event, locale, dedupe_key, status, caption, link_url)
  values (v_project, 'facebook', 'offer_published', 'ar', 'pub:test:facebook', 'pending_approval', 'نصّ', 'https://x.invalid')
  returning id into v_id;

  -- 4 · AN UNAPPROVED POST IS NEVER CLAIMED. This is the whole of §7's approval rule at the moment it
  --     matters: the one place where something leaves the building.
  v_ok := false;
  begin
    perform public.staff_social_publish_claim(v_id);
  exception when others then
    v_ok := (sqlerrm = 'not_publishable');
  end;
  assert v_ok, 'a post that nobody approved was handed a token and sent to Facebook';

  -- 5 · Approved, it is claimed — once. A second claim on a row already `publishing` must not go out twice,
  --     which is how a page ends up with the same post on it two or three times.
  perform public.staff_social_decide(v_id, 'approve', 'اختبار');
  v_out := public.staff_social_publish_claim(v_id);
  assert (v_out->>'access_token') = 'SECRET-TOKEN-VALUE', 'the claim did not carry the token to the server';
  assert (v_out->>'page_id') = 'test-page', 'the claim did not say which page to post to';
  assert (select s.status from public.social_posts s where s.id = v_id) = 'publishing',
    'the claimed post was left looking unclaimed';
  assert (select s.attempts from public.social_posts s where s.id = v_id) = 1, 'the attempt was not counted';

  v_ok := false;
  begin
    perform public.staff_social_publish_claim(v_id);
  exception when others then
    v_ok := (sqlerrm = 'not_publishable');
  end;
  assert v_ok, 'a post already being published was claimed a second time';

  -- 6 · Writing back what Meta said, both ways.
  v_out := public.staff_social_publish_result(v_id, true, '123_456', 'https://facebook.com/123_456', null);
  assert (v_out->>'status') = 'published', 'a successful publish did not mark the post published';
  assert (select s.permalink from public.social_posts s where s.id = v_id) = 'https://facebook.com/123_456',
    'the permalink was not kept, so nobody can open what went out';
  assert (select s.published_at from public.social_posts s where s.id = v_id) is not null,
    'a published post has no moment attached to it';
  assert exists (select 1 from public.social_post_logs l where l.post_id = v_id and l.status = 'published'),
    '§7 asks for logs and the success was not written to one';

  -- A failure keeps its reason, and the reason is what somebody reads at 3am.
  update public.social_posts set status = 'scheduled' where id = v_id;
  perform public.staff_social_publish_claim(v_id);
  v_out := public.staff_social_publish_result(v_id, false, null, null, 'OAuthException: (#200) permissions');
  assert (v_out->>'status') = 'failed', 'a failed publish was not marked failed';
  assert (select s.last_error from public.social_posts s where s.id = v_id) like '%permissions%',
    'the failure kept no reason';

  -- 7 · social.max_attempts is a wall, not a suggestion: a post that has used them up stops asking Meta.
  update public.social_posts
     set status = 'failed', attempts = app.setting_int('social.max_attempts', 3)
   where id = v_id;
  v_ok := false;
  begin
    perform public.staff_social_publish_claim(v_id);
  exception when others then
    v_ok := (sqlerrm = 'not_publishable');
  end;
  assert v_ok, 'a post that had used up every attempt was sent to Meta again';

  -- 8 · And with no token connected at all, a claim fails loudly and the post says why — rather than
  --     sitting in «publishing» forever with nobody able to tell what it is waiting for.
  update public.social_accounts set is_enabled = false where network = 'facebook';
  update public.social_posts set status = 'scheduled', attempts = 0, last_error = null where id = v_id;
  -- It must ANSWER rather than raise: a raise would abort the statement and undo the «failed» it had just
  -- written, leaving the row in «publishing» with nothing on it to say what it was waiting for.
  v_out := public.staff_social_publish_claim(v_id);
  assert (v_out->>'error') = 'no_token',
    format('a post was claimed with no account connected: %s', v_out::text);
  assert (v_out->>'access_token') is null, 'a claim with no account still handed out a token';
  assert (select s.status from public.social_posts s where s.id = v_id) = 'failed',
    'the post was left in «publishing» with no token and no explanation';
  assert (select s.last_error from public.social_posts s where s.id = v_id) = 'no_token',
    'the post does not say that there was no token';

  raise notice 'social publish: the token never comes back, only an approved post is claimed, once, and every answer is written down';
end $$;
