-- 0159 · the token never leaves, the campaign button is safe to press twice, and approving is recorded.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_out     jsonb;
  v_again   jsonb;
  v_id      uuid;
  v_ok      boolean;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1 · THE TOKEN DOES NOT LEAVE, which is the whole reason this reader exists rather than a plain SELECT.
  --     Asserted on a real token so the test fails if the column is ever added back to the payload.
  insert into public.social_accounts (network, external_id, display_name, access_token, is_enabled)
  values ('facebook', 'test-page-id', 'صفحة اختبار', 'SECRET-PAGE-TOKEN', true)
  on conflict (network, external_id) do update set access_token = 'SECRET-PAGE-TOKEN';

  v_out := public.staff_social_accounts();
  assert v_out::text not like '%SECRET-PAGE-TOKEN%',
    'the page access token reached a payload a browser is given';
  assert v_out::text like '%has_token%', 'the screen cannot tell a connected account from a disconnected one';

  -- 2 · A campaign, on an offer that may be advertised at all.
  select p.id into v_project from public.projects p where p.status = 'published' order by p.created_at limit 1;
  if v_project is null then
    raise notice 'no published offer; the campaign button is untested here';
    return;
  end if;

  delete from public.social_posts where project_id = v_project;

  v_out := public.staff_social_campaign(v_project, array['facebook', 'instagram'], 'ar');
  assert jsonb_array_length(v_out->'made') >= 1,
    format('the campaign made nothing: %s', v_out::text);

  -- 3 · IT WAITS. While social.require_approval is on, nothing may land anywhere but pending_approval —
  --     this is the first stage the owner asked for, and it is the difference between a tool and an
  --     accident.
  if (select (s.value)::boolean from public.settings s where s.key = 'social.require_approval') then
    assert (v_out->>'status') = 'pending_approval',
      format('a campaign landed as «%s» while approval is required', v_out->>'status');
    assert not exists (
      select 1 from public.social_posts s
       where s.project_id = v_project and s.status not in ('pending_approval', 'cancelled')),
      'a post skipped the approval queue';
  end if;

  -- 4 · SAFE TO PRESS TWICE. A second press makes nothing and says so, rather than refusing or duplicating.
  v_again := public.staff_social_campaign(v_project, array['facebook', 'instagram'], 'ar');
  assert jsonb_array_length(v_again->'made') = 0,
    'pressing «Créer une campagne» twice made a second set of posts';
  assert jsonb_array_length(v_again->'already') >= 1,
    'the second press did not say that the posts already existed';

  -- 5 · The queue reads back, with the offer's name on it so a human knows what they are approving.
  v_out := public.staff_social_queue('pending_approval', 50);
  assert jsonb_array_length(v_out) >= 1, 'the queue shows nothing that is waiting';
  assert (v_out->0->>'project_code') is not null, 'a queued post does not say which offer it advertises';
  assert (v_out->0->>'caption') is not null, 'a queued post has no caption to approve';

  select s.id into v_id from public.social_posts s
   where s.project_id = v_project and s.status = 'pending_approval' limit 1;

  -- 6 · §7: approval is protected AND recorded. A commercial may read the queue and may not let anything out.
  perform set_config('role', 'authenticated', true);
  assert not has_function_privilege('anon', 'public.staff_social_decide(uuid, text, text)', 'execute'),
    'a visitor can approve a post for the company page';

  v_out := public.staff_social_decide(v_id, 'approve', 'اختبار');
  assert (v_out->>'status') = 'scheduled', 'approving did not move the post out of the queue';
  assert (select s.approved_by from public.social_posts s where s.id = v_id) = v_admin,
    'the post was approved by nobody, so no one can be asked about it later';
  assert (select s.approved_at from public.social_posts s where s.id = v_id) is not null,
    'the approval has no moment attached to it';
  assert exists (select 1 from public.social_post_logs l where l.post_id = v_id),
    'nothing was written to the log, so §7''s trail is missing';

  -- 7 · A post that has gone out is not decided again here: cancelling a row whose permalink is on Facebook
  --     would make this table disagree with the page, and the table is what the owner reads.
  update public.social_posts set status = 'published', permalink = 'https://example.invalid/p/1' where id = v_id;
  v_ok := false;
  begin
    perform public.staff_social_decide(v_id, 'cancel', 'late');
  exception when others then
    v_ok := (sqlerrm = 'already_published');
  end;
  assert v_ok, 'a post that is already on the page was cancelled in the queue';

  -- 8 · And an offer nobody published cannot be campaigned, whatever the button says (§7, again — the rule
  --     is in the database so that no screen has to remember it).
  declare
    v_draft uuid;
  begin
    insert into public.projects (code, name, governorate_id, status)
    values ('SOC-BO-DRAFT', 'عرض ما ينشرش', 34, 'draft') returning id into v_draft;
    v_ok := false;
    begin
      perform public.staff_social_campaign(v_draft, array['facebook'], 'ar');
    exception when others then
      v_ok := (sqlerrm = 'offer_not_publishable');
    end;
    assert v_ok, 'a campaign was created for an offer that was never published';
  end;

  raise notice 'social back office: no token in the payload, one campaign however many presses, and approval that is recorded';
end $$;
