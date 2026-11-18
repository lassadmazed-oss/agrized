-- 0170 · «البرنامج اليومي»: a post on a day, approved by an administrator, claimed by the cron once its day has
-- come — and never before, never unapproved, never without a token.

do $$
declare
  v_admin  uuid;
  v_out    jsonb;
  v_fb     uuid;
  v_ig     uuid;
  v_ok     boolean;
  v_claim  jsonb;
  v_day    date := (now() at time zone 'Africa/Tunis')::date + 2;
begin
  assert exists (select 1 from storage.buckets where id = 'social-media' and public), 'the photos have a public bucket';
  assert not has_function_privilege('authenticated', 'public.cron_social_claim_due(integer)', 'execute'),
    'a signed-in browser cannot claim posts';
  assert not has_function_privilege('anon', 'public.cron_social_result(uuid, boolean, text, text, text)', 'execute'),
    'nor write their result';
  assert has_function_privilege('service_role', 'public.cron_social_claim_due(integer)', 'execute'), 'the cron can';
  assert not has_function_privilege('anon', 'public.staff_social_plan(jsonb)', 'execute'), 'a visitor plans nothing';

  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin here; planning is not exercised';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  -- The test controls the rules it depends on.
  update public.settings set value = 'true'::jsonb where key = 'social.require_approval';
  update public.settings set value = '["facebook","instagram"]'::jsonb where key = 'social.networks';

  -- ── refusals ────────────────────────────────────────────────────────────────────────────────────────────
  v_ok := true;
  begin
    perform public.staff_social_plan(jsonb_build_object('date', '2020-01-01', 'caption', 'زيتونة باسمك في أرض تونسية.'));
  exception when others then
    v_ok := false;
    assert sqlerrm = 'date_in_past', 'a day already gone is refused by name, got ' || sqlerrm;
  end;
  assert not v_ok, 'nothing is planned in the past';

  v_ok := true;
  begin
    perform public.staff_social_plan(jsonb_build_object('date', v_day, 'caption', 'قصير'));
  exception when others then
    v_ok := false;
    assert sqlerrm = 'invalid_caption', 'a caption too short is refused, got ' || sqlerrm;
  end;
  assert not v_ok, 'a post says something';

  -- ── without a photo, Instagram is skipped and Facebook is planned ──────────────────────────────────────
  v_out := public.staff_social_plan(jsonb_build_object('date', v_day, 'caption', 'زيتونة باسمك في أرض تونسية حقيقية.',
                                                       'story_code', 'self'));
  assert jsonb_array_length(v_out->'made') = 1 and v_out->'skipped'->0->>'reason' = 'instagram_needs_image',
    'Instagram needs a photograph: ' || v_out::text;

  -- ── with one, both; each network's caption fits it ──────────────────────────────────────────────────────
  v_out := public.staff_social_plan(jsonb_build_object('date', v_day, 'time', '19:30',
                                                       'caption', 'زيتونة باسمك في أرض تونسية حقيقية.',
                                                       'image_url', 'https://example.org/tree.jpg', 'story_code', 'gift'));
  assert jsonb_array_length(v_out->'made') = 2, 'one post per network: ' || v_out::text;
  select (e->>'id')::uuid into v_fb from jsonb_array_elements(v_out->'made') e where e->>'network' = 'facebook';
  select (e->>'id')::uuid into v_ig from jsonb_array_elements(v_out->'made') e where e->>'network' = 'instagram';

  assert (select status = 'pending_approval' and project_id is null and event = 'calendar'
                 and (scheduled_for at time zone 'Africa/Tunis') = (v_day + time '19:30')
            from public.social_posts where id = v_fb), 'a planned post waits for approval, on its Tunis day and hour';
  assert (select caption like '%/story/gift?utm_source=facebook&utm_medium=social&utm_campaign=story_gift%'
            from public.social_posts where id = v_fb), 'the Facebook text carries its story link';
  assert (select caption not like '%https://%' from public.social_posts where id = v_ig), 'the Instagram text carries none';
  assert exists (select 1 from jsonb_array_elements(public.staff_social_queue(null, 500)) q where (q->>'id')::uuid = v_fb),
    'the Back Office lists a post with no offer';

  -- ── the cron: nothing unapproved, nothing early, nothing without a token ───────────────────────────────
  perform set_config('request.jwt.claims', '', true);
  -- The module ships off (104); the owner switches it on. Here it is on, so every «not claimed» below means
  -- something.
  update public.feature_flags set state = 'internal' where key = 'social';
  v_claim := public.cron_social_claim_due(20);
  assert not exists (select 1 from jsonb_array_elements(v_claim) c where (c->>'id')::uuid in (v_fb, v_ig)),
    'a post waiting for approval is not claimed';

  update public.social_posts set status = 'scheduled', approved_at = now(), approved_by = v_admin where id in (v_fb, v_ig);
  v_claim := public.cron_social_claim_due(20);
  assert not exists (select 1 from jsonb_array_elements(v_claim) c where (c->>'id')::uuid = v_fb),
    'an approved post is not claimed before its day';

  update public.social_posts set scheduled_for = now() - interval '1 minute' where id in (v_fb, v_ig);
  delete from public.social_accounts where network = 'instagram';
  insert into public.social_accounts (network, external_id, access_token, is_enabled, connected_at)
  values ('facebook', 'TEST-PAGE-116', 'test-token-116', true, now() + interval '1 day');

  update public.feature_flags set state = 'disabled' where key = 'social';
  assert jsonb_array_length(public.cron_social_claim_due(20)) = 0, 'the module switched off, nothing leaves';
  update public.feature_flags set state = 'internal' where key = 'social';

  v_claim := public.cron_social_claim_due(20);
  assert exists (select 1 from jsonb_array_elements(v_claim) c
                  where (c->>'id')::uuid = v_fb and c->>'page_id' = 'TEST-PAGE-116'), 'its day come, Facebook goes';
  assert not exists (select 1 from jsonb_array_elements(v_claim) c where (c->>'id')::uuid = v_ig),
    'Instagram, with no token, waits';
  assert (select attempts = 0 and status = 'scheduled' from public.social_posts where id = v_ig), 'and spends no attempt';

  v_out := public.cron_social_result(v_fb, true, '123_456', 'https://www.facebook.com/123_456', null);
  assert (select status = 'published' and published_at is not null from public.social_posts where id = v_fb),
    'what Meta answered is written back';
end $$;
