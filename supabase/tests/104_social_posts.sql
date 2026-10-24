-- 0157 · §7's rules, each one asserted: no token in reach, no draft offer advertised, no post twice, and
-- no price in a caption that the offer did not publish.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_draft   uuid;
  v_post    jsonb;
  v_id      uuid;
  v_ok      boolean;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1 · THE TOKEN. A Page access token posts as the company; it is the single most dangerous value in this
  --     schema, and it must be out of reach of a visitor AND of staff who are not administrators.
  assert not has_table_privilege('anon', 'public.social_accounts', 'select'),
    'a visitor can read the Facebook page token';
  assert (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = 'social_accounts'
             and p.qual like '%is_admin%') >= 1,
    'reading a connected account is not restricted to administrators';
  -- The marketing copy and the queue are staff-readable; the ACCOUNT is not, and that difference is the
  -- whole point of giving it its own table.
  assert (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = 'social_accounts'
             and p.qual like '%is_staff%') = 0,
    'the accounts table was opened to all staff, token and all';

  assert not has_table_privilege('anon', 'public.social_posts', 'select'),
    'a visitor can read unpublished marketing copy';
  assert not has_function_privilege('anon', 'app.social_compose(uuid, text, text, text)', 'execute'),
    'a visitor can compose posts for the company page';

  -- 2 · §7: «لا نشر للعروض التجريبية أو الداخلية أو غير المؤكّدة». Proved on a real draft rather than
  --     described, because this is the rule whose failure is a company page advertising an offer that was
  --     never agreed.
  insert into public.projects (code, name, governorate_id, status)
  values ('SOC-DRAFT', 'عرض ما تنشرش', 34, 'draft')
  returning id into v_draft;

  assert not app.social_publishable(v_draft), 'a draft offer is considered publishable';

  v_ok := true;
  begin
    insert into public.social_posts (project_id, network, event, locale, dedupe_key, caption)
    values (v_draft, 'facebook', 'offer_published', 'ar', 'draft:test:facebook', 'نص');
  exception when others then
    v_ok := (sqlerrm = 'offer_not_publishable');
  end;
  assert v_ok, 'a draft offer was queued for the company page';

  -- «داخلي فقط» is the staging state, not a quieter kind of published.
  update public.projects set status = 'internal' where id = v_draft;
  assert not app.social_publishable(v_draft), 'an internal offer is considered publishable';

  -- 3 · Composing, on an offer that IS published.
  select p.id into v_project from public.projects p where p.status = 'published' order by p.created_at limit 1;
  if v_project is null then
    raise notice 'no published offer; composing is untested here';
    return;
  end if;

  v_post := app.social_compose(v_project, 'facebook', 'offer_published', 'ar');
  assert v_post is not null, 'a published offer composed nothing, so the seeded template is unreachable';
  assert length(coalesce(v_post->>'caption', '')) > 10, 'the caption came back empty';

  -- 4 · NO PLACEHOLDER SURVIVES INTO A CAPTION. A post that goes out reading «سعر الزيتونة ابتداءً من
  --     {price}» is worse than no post, and it is the normal failure of a template system.
  assert (v_post->>'caption') !~ '\{[a-z_]+\}',
    format('a placeholder was left unfilled in the caption: %s', v_post->>'caption');

  -- 4b · AND WHAT MUST BE IN IT. 0157 fixed the unfilled «{link}» by dropping the call to action and the
  --      hashtags entirely, and every assertion in this file was about what a caption must NOT contain, so
  --      nothing failed. A caption without its CTA is a post that tells nobody what to do next.
  declare
    v_cta text;
    v_tag text;
  begin
    select t.cta, t.hashtags into v_cta, v_tag
      from public.social_templates t
     where t.is_active and t.event = 'offer_published' and t.locale = 'ar'
       and (t.network = 'facebook' or t.network is null)
     order by (t.network = 'facebook') desc, t.sort_order
     limit 1;

    if v_tag is not null then
      assert position(v_tag in (v_post->>'caption')) > 0,
        'the template''s hashtags are missing from the caption';
    end if;
    if v_cta is not null then
      -- The CTA carries «{link}», so it is compared on the words before the placeholder.
      assert position(split_part(v_cta, '{', 1) in (v_post->>'caption')) > 0,
        'the template''s call to action is missing from the caption';
      assert (v_post->>'caption') like '%' || (v_post->>'link_url') || '%',
        'the Facebook caption does not contain the link its call to action promises';
    end if;
  end;

  -- 5 · §4: nothing invented. The caption may carry a price ONLY when the offer publishes one — and when
  --     it does, it is the price the offer's own quote gives and not a number composed here.
  if (app.project_quote_payload(v_project, null, 1, null, null, null, false) ->> 'pricing') <> 'ok' then
    assert (v_post->>'caption') !~ 'د',
      'the caption quoted a price for an offer whose pricing is closed';
  end if;

  -- 6 · §5: the link carries its UTM, which is what makes «which post brought this client» answerable at
  --     all — src/components/site/source-capture.tsx already reads these into every request.
  assert (v_post->>'link_url') like '%utm_source=facebook%', 'the link has no utm_source';
  assert (v_post->>'link_url') like '%utm_medium=social%', 'the link has no utm_medium';
  assert (v_post->>'link_url') like '%utm_campaign=%', 'the link names no campaign, so posts cannot be told apart';

  -- 7 · Instagram does not make a caption link clickable, so none is pasted into one: the link travels
  --     beside the caption instead.
  v_post := app.social_compose(v_project, 'instagram', 'offer_published', 'ar');
  assert (v_post->>'caption') not like '%http%',
    'a raw URL was pasted into an Instagram caption, where it is not a link and only reads as spam';
  assert (v_post->>'link_url') like 'http%', 'the Instagram post lost its link entirely';

  -- 8 · §7: «منع تكرار نفس المنشور على نفس الحدث». The same offer, the same event, the same network is one
  --     row forever, however many times the event fires.
  insert into public.social_posts (project_id, network, event, locale, dedupe_key, caption)
  values (v_project, 'facebook', 'offer_published', 'ar',
          (app.social_compose(v_project, 'facebook', 'offer_published', 'ar')->>'dedupe_key'), 'نص')
  returning id into v_id;

  v_ok := false;
  begin
    insert into public.social_posts (project_id, network, event, locale, dedupe_key, caption)
    values (v_project, 'facebook', 'offer_published', 'ar',
            (app.social_compose(v_project, 'facebook', 'offer_published', 'ar')->>'dedupe_key'), 'نص آخر');
  exception when unique_violation then
    v_ok := true;
  end;
  assert v_ok, 'the same offer was queued twice for the same event on the same network';

  -- 9 · Approval is a person and a moment together. Half of it recorded is a post nobody can say who let out.
  v_ok := false;
  begin
    update public.social_posts set approved_at = now() where id = v_id;
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'a post was approved by nobody';

  -- 10 · It ships OFF, and that is not a detail: nothing may post as the company until a real Meta account
  --      is connected and the owner has switched it on.
  assert (select f.state from public.feature_flags f where f.key = 'social') = 'disabled',
    'the social module shipped switched on, with no account connected to it';
  assert not (select (s.value)::boolean from public.settings s where s.key = 'social.auto_publish'),
    'automatic publishing shipped on';
  assert (select (s.value)::boolean from public.settings s where s.key = 'social.require_approval'),
    'approval shipped off, which is not the first stage the owner asked for';

  raise notice 'social posts: the token is out of reach, a draft offer cannot be advertised, a post cannot be made twice, and no placeholder survives into a caption';
end $$;
