-- 0159 · the Back Office side of the social module: see it, make it, approve it.
--
-- Its test is supabase/tests/105_social_backoffice.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0159_social_backoffice.sql supabase/tests/105_social_backoffice.sql
--
-- The owner, 2026-10-24: «خلينا نبدأ ونهبطوا حاجات نشوفوا الأوتوماتيزاسيون كيفاش قاعدة تخدم» — he wants to
-- watch it work. Meta cannot answer yet (0157's header says why at length), so what he can watch is
-- everything up to the last step: an offer goes in, the copy comes out for each network with the real
-- figures and the UTM link in it, it waits for his approval, and it sits in a queue that says what it is
-- waiting for. The day the permissions arrive, the dispatcher drains that queue and nothing else changes.
--
-- FOUR FUNCTIONS, AND THE FIRST ONE IS THE REASON THE OTHERS CAN EXIST. public.social_accounts holds a Page
-- access token, so the table is administrator-only — the Back Office cannot simply SELECT it the way it
-- lists everything else. staff_social_accounts returns every column EXCEPT that one, which is what lets the
-- screen show «Agrized · connected · expires in 40 days» without the token ever being in a page a browser
-- could be asked to hand over.

create or replace function public.staff_social_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not app.is_staff() then
    raise exception 'not_staff' using errcode = 'P0001';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id,
             'network', a.network,
             'external_id', a.external_id,
             'display_name', a.display_name,
             'is_enabled', a.is_enabled,
             'connected_at', a.connected_at,
             'token_expires_at', a.token_expires_at,
             -- WHETHER there is a token, never the token. The screen needs «connected or not» and nothing
             -- it could leak: a page that holds the value is a page that can be made to give it up.
             'has_token', a.access_token is not null
           ) order by a.network), '[]'::jsonb)
      from public.social_accounts a);
end $fn$;

revoke execute on function public.staff_social_accounts() from public, anon;
grant execute on function public.staff_social_accounts() to authenticated;

comment on function public.staff_social_accounts() is
  'The connected accounts as the Back Office draws them: every column except access_token, and a has_token flag in its place. The table itself is administrator-only because it holds that token; this is how a staff screen shows the connection without the secret ever reaching a browser.';

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------

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
          join public.projects p on p.id = s.project_id
         where p_status is null or s.status = p_status
         order by s.created_at desc
         limit greatest(least(coalesce(p_limit, 100), 500), 1)
      ) q);
end $fn$;

revoke execute on function public.staff_social_queue(text, integer) from public, anon;
grant execute on function public.staff_social_queue(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- «Créer une campagne»
-- ---------------------------------------------------------------------------
--
-- The owner's own addition to the brief: «تختار العرض، والسيستام يجهّزلك 3 نسخ… مع إمكانية مراجعتهم قبل
-- النشر». One offer in, one post per enabled network out, each composed from that offer's real data.
--
-- IT COMPOSES, IT DOES NOT PUBLISH. Every row lands in `pending_approval` while social.require_approval is
-- on — which is the first stage the owner asked for — and in `scheduled` when he turns it off. Nothing in
-- this function talks to anybody.
--
-- IT IS SAFE TO PRESS TWICE. §7's unique dedupe_key means the second press cannot make a second post; the
-- insert simply does nothing for a network that already has one, and the answer says which were made and
-- which were already there. A button that punishes a double tap is a button people are afraid of.

create or replace function public.staff_social_campaign(
  p_project  uuid,
  p_networks text[] default null,
  p_locale   text default 'ar'
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_nets    text[];
  v_net     text;
  v_post    jsonb;
  v_status  text;
  v_made    jsonb := '[]'::jsonb;
  v_already jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_id      uuid;
  v_today   integer;
  v_max     integer := app.setting_int('social.max_per_day', 3);
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if not app.social_publishable(p_project) then
    raise exception 'offer_not_publishable' using errcode = 'P0001';
  end if;

  v_nets := coalesce(p_networks, array(select jsonb_array_elements_text(
    coalesce(app.setting('social.networks'), '["facebook","instagram"]'::jsonb))));

  v_status := case when app.setting_bool('social.require_approval', true) then 'pending_approval' else 'scheduled' end;

  foreach v_net in array v_nets loop
    v_post := app.social_compose(p_project, v_net, 'offer_published', p_locale);

    if v_post is null then
      -- No template for this network and language. Named rather than skipped in silence: a campaign that
      -- quietly produces one post instead of two is a campaign nobody notices is half missing.
      v_skipped := v_skipped || jsonb_build_object('network', v_net, 'reason', 'no_template');
      continue;
    end if;

    -- §3's «عدد المنشورات الأقصى في اليوم». Counted over what was actually made today, so a campaign that
    -- would cross the line stops at it instead of being refused whole.
    select count(*)::integer into v_today
      from public.social_posts s
     where s.created_at >= date_trunc('day', now() at time zone 'Africa/Tunis') at time zone 'Africa/Tunis'
       and s.status <> 'cancelled';
    if v_today >= v_max then
      v_skipped := v_skipped || jsonb_build_object('network', v_net, 'reason', 'daily_limit');
      continue;
    end if;

    insert into public.social_posts (project_id, network, event, locale, dedupe_key, status,
                                     caption, image_url, link_url, created_by)
    values (p_project, v_net, 'offer_published', p_locale, v_post->>'dedupe_key', v_status,
            v_post->>'caption', v_post->>'image_url', v_post->>'link_url', (select auth.uid()))
    on conflict (dedupe_key) do nothing
    returning id into v_id;

    if v_id is null then
      v_already := v_already || jsonb_build_object('network', v_net);
    else
      v_made := v_made || jsonb_build_object('network', v_net, 'id', v_id);
      insert into public.social_post_logs (post_id, status, detail)
      values (v_id, v_status, 'composed by staff_social_campaign');
    end if;
    v_id := null;
  end loop;

  return jsonb_build_object('made', v_made, 'already', v_already, 'skipped', v_skipped, 'status', v_status);
end $fn$;

revoke execute on function public.staff_social_campaign(uuid, text[], text) from public, anon;
grant execute on function public.staff_social_campaign(uuid, text[], text) to authenticated;

comment on function public.staff_social_campaign(uuid, text[], text) is
  'One offer in, one reviewable post per enabled network out — the owner''s «Créer une campagne». It composes and never publishes; rows land in pending_approval while social.require_approval is on. Safe to press twice: §7''s dedupe_key means a second press makes nothing, and the answer says which posts were made, which already existed and which network had no template.';

-- ---------------------------------------------------------------------------
-- Approving, or not
-- ---------------------------------------------------------------------------
--
-- §7: «صلاحيات الإدارة والموافقة تكون محمية». Approving is what lets something go out under the company's
-- name, so it is administrator-only and it is RECORDED — who, and when, together, which the table's own
-- check constraint already refuses to let drift apart.
--
-- A POST THAT HAS GONE OUT CANNOT BE APPROVED OR CANCELLED HERE. Cancelling a row whose permalink is on
-- Facebook would make this table disagree with the page, and the table is what the owner reads.

create or replace function public.staff_social_decide(p_post uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_post public.social_posts;
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_action not in ('approve', 'cancel') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;

  select * into v_post from public.social_posts s where s.id = p_post;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if v_post.status = 'published' then
    raise exception 'already_published' using errcode = 'P0001';
  end if;

  update public.social_posts s
     set status      = case when p_action = 'approve' then 'scheduled' else 'cancelled' end,
         approved_at = case when p_action = 'approve' then now() else s.approved_at end,
         approved_by = case when p_action = 'approve' then (select auth.uid()) else s.approved_by end,
         last_error  = case when p_action = 'approve' then null else s.last_error end
   where s.id = p_post
  returning * into v_post;

  insert into public.social_post_logs (post_id, status, detail)
  values (p_post, v_post.status, coalesce(p_reason, p_action));

  return jsonb_build_object('id', v_post.id, 'status', v_post.status);
end $fn$;

revoke execute on function public.staff_social_decide(uuid, text, text) from public, anon;
grant execute on function public.staff_social_decide(uuid, text, text) to authenticated;

comment on function public.staff_social_decide(uuid, text, text) is
  'Approve a queued post or cancel it (§7: approval is protected). Administrator-only, and recorded — who and when, which the table''s own constraint keeps together. A post already published is refused: cancelling a row whose permalink is on Facebook would make this table disagree with the page.';
