-- 0170 · «البرنامج اليومي» — posts on a calendar, approved one by one, published on their day by themselves.
--
-- Test: supabase/tests/116_social_calendar.sql
--
-- The owner, 2026-11-18: «نحب تهبط اوتوماتيك … نبرمجوهم … الادمين ديما يعمل ابروفي لأي بيبلي … حاجة قاعدة
-- تهبط يوم بيوم … على الانستغرام وعلى الفيسبوك». 0157–0160 built the queue, the approval and a «انشر الآن»
-- button, every post tied to an offer. This adds the three things a daily calendar needs:
--
--   1 · A POST THAT BELONGS TO NO OFFER (event 'calendar'): a photograph, a caption and a day, linking to a
--       story page (/story/<code>) or to the home page, one row per network.
--   2 · THE DAY IT GOES OUT. scheduled_for, in Africa/Tunis, set when the post is planned.
--   3 · NOBODY PRESSING ANYTHING. public.cron_social_claim_due() hands the server every APPROVED post whose day
--       has come; /api/social/publish (a Vercel cron) calls Meta and writes back with cron_social_result().
--       Both are granted to service_role only — a browser has no door to either.
--
-- WHAT DOES NOT CHANGE: §7's approval. A planned post lands in `pending_approval` while social.require_approval
-- is on, exactly like an offer's; only `scheduled` (what «وافق» produces) is ever claimed. social.max_per_day
-- still caps each network's day, and a network with no token connected is left waiting — no attempt is spent
-- on a post that could not have gone out.

-- ===========================================================================
-- 1 · A post with no offer
-- ===========================================================================

alter table public.social_posts alter column project_id drop not null;

alter table public.social_posts
  add constraint social_posts_offer_or_calendar
  check (project_id is not null or event = 'calendar');

create or replace function app.social_posts_guard() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  -- An offer's post still needs a published offer (§7). A calendar post names none, so there is nothing to check.
  if new.project_id is not null and not app.social_publishable(new.project_id) then
    raise exception 'offer_not_publishable' using errcode = 'P0001';
  end if;
  return new;
end $fn$;

-- The queue the Back Office reads: a calendar post has no offer, so the join is a LEFT one now.
create or replace function public.staff_social_queue(p_status text default null, p_limit integer default 100)
returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not app.is_staff() then
    raise exception 'not_staff' using errcode = 'P0001';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.created_at desc), '[]'::jsonb)
      from (
        select s.id, s.network, s.event, s.locale, s.status, s.caption, s.image_url, s.link_url,
               s.scheduled_for, s.attempts, s.last_error, s.permalink, s.published_at,
               s.created_at, s.approved_at,
               p.code as project_code, p.name as project_name
          from public.social_posts s
          left join public.projects p on p.id = s.project_id
         where p_status is null or s.status = p_status
         order by s.created_at desc
         limit greatest(least(coalesce(p_limit, 100), 500), 1)
      ) q);
end $fn$;

-- ===========================================================================
-- 2 · The settings and the photographs
-- ===========================================================================

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('social.default_time', to_jsonb('19:00'::text), 'text', 'social', 'ساعة النشر العادية',
   'المنشور المبرمج يخرج في الساعة هذي (توقيت تونس) كي ما تختارش ساعة أخرى.', false, 17),
  ('social.instagram_link_line', to_jsonb('الرابط في البيو متاع الصفحة 👆'::text), 'text', 'social', 'سطر الرابط في إنستغرام',
   'إنستغرام ما يقبلش رابط في النص، فيتزاد السطر هذا في بلاصتو.', false, 18),
  ('social.calendar_hashtags', to_jsonb('#AgriZed #زيتونتك #تونس'::text), 'text', 'social', 'الهاشتاغ متاع المنشورات المبرمجة',
   'يتزادو في آخر كل منشور مبرمج. فارغ = بلاش هاشتاغ.', false, 19)
on conflict (key) do nothing;

-- The photographs of planned posts. Public, because Meta fetches them by address; JPEG only, because Instagram
-- publishes nothing else (the server converts what is uploaded).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', true, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

-- ===========================================================================
-- 3 · Planning one
-- ===========================================================================

create or replace function public.staff_social_plan(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_caption  text := btrim(coalesce(p->>'caption', ''));
  v_image    text := nullif(btrim(coalesce(p->>'image_url', '')), '');
  v_story    text := nullif(btrim(coalesce(p->>'story_code', '')), '');
  v_origin   text := app.setting_text('site.origin', 'https://www.agrized.site');
  v_tags     text := btrim(app.setting_text('social.calendar_hashtags', ''));
  v_ig_line  text := btrim(app.setting_text('social.instagram_link_line', ''));
  v_enabled  jsonb := coalesce(app.setting('social.networks'), '["facebook","instagram"]'::jsonb);
  v_wanted   jsonb := coalesce(p->'networks', v_enabled);
  v_status   text := case when app.setting_bool('social.require_approval', true) then 'pending_approval' else 'scheduled' end;
  v_date     date;
  v_time     time;
  v_at       timestamptz;
  v_net      text;
  v_link     text;
  v_body     text;
  v_post     public.social_posts;
  v_made     jsonb := '[]'::jsonb;
  v_skipped  jsonb := '[]'::jsonb;
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if length(v_caption) < 10 or length(v_caption) > 1800 then
    raise exception 'invalid_caption' using errcode = 'P0001';
  end if;
  begin
    v_date := (p->>'date')::date;
    v_time := coalesce(nullif(btrim(coalesce(p->>'time', '')), ''), app.setting_text('social.default_time', '19:00'))::time;
  exception when others then
    raise exception 'invalid_date' using errcode = 'P0001';
  end;
  if v_date is null then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  v_at := (v_date + v_time) at time zone 'Africa/Tunis';
  if v_at < now() - interval '5 minutes' then
    raise exception 'date_in_past' using errcode = 'P0001';
  end if;
  if v_image is not null and v_image !~ '^https://' then
    raise exception 'invalid_image' using errcode = 'P0001';
  end if;
  if v_story is not null and not exists (
       select 1 from public.option_items o where o.list_key = 'tree_for' and o.code = v_story and o.is_active) then
    raise exception 'invalid_story' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_wanted) <> 'array' then
    raise exception 'invalid_network' using errcode = 'P0001';
  end if;

  for v_net in select jsonb_array_elements_text(v_wanted) loop
    if v_net not in ('facebook', 'instagram') or not (v_enabled ? v_net) then
      v_skipped := v_skipped || jsonb_build_object('network', v_net, 'reason', 'network_off');
      continue;
    end if;
    if v_net = 'instagram' and v_image is null then
      v_skipped := v_skipped || jsonb_build_object('network', v_net, 'reason', 'instagram_needs_image');
      continue;
    end if;

    -- The story the post tells, or the home page; the network and «calendar» in the UTM, so the requests it
    -- brings are counted on /admin/stories like the ads' (0166 reads utm_source and utm_campaign).
    v_link := v_origin || case when v_story is null then '/' else '/story/' || v_story end
           || '?utm_source=' || v_net || '&utm_medium=social&utm_campaign='
           || coalesce('story_' || v_story, 'calendar');

    -- A photo post on Facebook carries its link in the text; Instagram takes no link at all, so it gets the
    -- owner's «الرابط في البيو» line instead.
    v_body := v_caption
           || case when v_net = 'facebook' then E'\n\n' || v_link
                   when v_ig_line <> '' then E'\n\n' || v_ig_line else '' end
           || case when v_tags <> '' then E'\n\n' || v_tags else '' end;

    insert into public.social_posts (project_id, network, event, locale, dedupe_key, status, caption, image_url,
                                     link_url, scheduled_for, created_by)
    values (null, v_net, 'calendar', 'ar', 'calendar:' || gen_random_uuid()::text, v_status, v_body, v_image,
            v_link, v_at, (select auth.uid()))
    returning * into v_post;

    insert into public.social_post_logs (post_id, status, detail)
    values (v_post.id, v_post.status, 'planned for ' || to_char(v_at at time zone 'Africa/Tunis', 'YYYY-MM-DD HH24:MI'));

    v_made := v_made || jsonb_build_object('id', v_post.id, 'network', v_net);
  end loop;

  return jsonb_build_object('made', v_made, 'skipped', v_skipped, 'status', v_status, 'scheduled_for', v_at);
end $fn$;

revoke execute on function public.staff_social_plan(jsonb) from public, anon;
grant execute on function public.staff_social_plan(jsonb) to authenticated;

comment on function public.staff_social_plan(jsonb) is
  'Plans one post on the calendar: {date, time?, caption, image_url?, story_code?, networks?}. One row per enabled network, in pending_approval while social.require_approval is on. Instagram is skipped without a photograph. Administrator-only.';

-- ===========================================================================
-- 4 · The cron's two doors (service_role only)
-- ===========================================================================

create or replace function app.social_record_result(
  p_post uuid, p_ok boolean, p_post_id text, p_permalink text, p_error text
) returns public.social_posts
language plpgsql security definer set search_path = '' as $fn$
declare
  v_post public.social_posts;
begin
  update public.social_posts s
     set status           = case when p_ok then 'published' else 'failed' end,
         external_post_id = coalesce(p_post_id, s.external_post_id),
         permalink        = coalesce(p_permalink, s.permalink),
         published_at     = case when p_ok then now() else s.published_at end,
         last_error       = case when p_ok then null else left(coalesce(p_error, 'unknown'), 2000) end
   where s.id = p_post
  returning * into v_post;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  insert into public.social_post_logs (post_id, status, detail)
  values (p_post, v_post.status, coalesce(p_error, p_permalink, p_post_id));
  return v_post;
end $fn$;
revoke execute on function app.social_record_result(uuid, boolean, text, text, text) from public, anon, authenticated;

/**
 * Every approved post whose time has come, marked `publishing` and handed over with what the call needs.
 * An offer's post approved with no day goes out from its approval; a failed one is retried until
 * social.max_attempts. Each network stops at social.max_per_day for the Tunis day, and a network with no
 * token is skipped without spending an attempt.
 */
create or replace function public.cron_social_claim_due(p_limit integer default 5) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_max      integer := app.setting_int('social.max_attempts', 3);
  v_per_day  integer := app.setting_int('social.max_per_day', 3);
  v_today    date := (now() at time zone 'Africa/Tunis')::date;
  v_out      jsonb := '[]'::jsonb;
  r          record;
  v_acc      record;
begin
  -- The module's own switch (الإعدادات ← الموديولات ← «النشر على الشبكات») stops the calendar too: switched
  -- off, nothing leaves, whatever was approved.
  if app.flag_state('social') = 'disabled' then
    return '[]'::jsonb;
  end if;

  -- A run that died between its claim and its answer leaves a row in `publishing`; after a quarter of an hour it
  -- is failed, so the next run retries it instead of nobody ever touching it again.
  update public.social_posts s
     set status = 'failed', last_error = coalesce(s.last_error, 'interrupted')
   where s.status = 'publishing' and s.updated_at < now() - interval '15 minutes';

  for r in
    select s.*
      from public.social_posts s
     where s.status in ('scheduled', 'failed')
       and s.attempts < v_max
       and coalesce(s.scheduled_for, s.approved_at, s.created_at) <= now()
     order by coalesce(s.scheduled_for, s.approved_at, s.created_at)
     limit greatest(least(coalesce(p_limit, 5), 20), 1)
     for update skip locked
  loop
    select * into v_acc from app.social_token(r.network);
    continue when v_acc.access_token is null;

    continue when (select count(*) from public.social_posts x
                    where x.network = r.network and x.status = 'published'
                      and (x.published_at at time zone 'Africa/Tunis')::date = v_today) >= v_per_day;

    update public.social_posts set status = 'publishing', attempts = attempts + 1 where id = r.id;
    insert into public.social_post_logs (post_id, status, detail) values (r.id, 'publishing', 'claimed by cron');

    v_out := v_out || jsonb_build_object(
      'id', r.id, 'network', r.network, 'caption', r.caption, 'image_url', r.image_url, 'link_url', r.link_url,
      'page_id', v_acc.external_id, 'access_token', v_acc.access_token);
  end loop;

  return v_out;
end $fn$;

revoke execute on function public.cron_social_claim_due(integer) from public, anon, authenticated;
grant execute on function public.cron_social_claim_due(integer) to service_role;

create or replace function public.cron_social_result(
  p_post uuid, p_ok boolean, p_post_id text default null, p_permalink text default null, p_error text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_post public.social_posts;
begin
  v_post := app.social_record_result(p_post, p_ok, p_post_id, p_permalink, p_error);
  return jsonb_build_object('id', v_post.id, 'status', v_post.status, 'permalink', v_post.permalink);
end $fn$;

revoke execute on function public.cron_social_result(uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.cron_social_result(uuid, boolean, text, text, text) to service_role;

comment on function public.cron_social_claim_due(integer) is
  'For /api/social/publish (Vercel cron, service role): the approved posts whose time has come, marked publishing, with the page id and token the call needs. Never reachable from a browser.';
