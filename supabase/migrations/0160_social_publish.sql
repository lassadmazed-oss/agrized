-- 0160 · putting a token in, taking a token out, and writing down what Meta answered.
--
-- Its test is supabase/tests/106_social_publish.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0160_social_publish.sql supabase/tests/106_social_publish.sql
--
-- The owner, 2026-10-24: «شنو نجمو نعملو تو باش نهبطو على الفيسبوك حاجة؟» — what can we do TODAY.
--
-- ---------------------------------------------------------------------------------------------------------
-- THE ANSWER, AND IT IS BETTER THAN THE LAST ONE I GAVE
-- ---------------------------------------------------------------------------------------------------------
-- 0157's header said publishing waits on App Review. That is true for an app acting for OTHER people's
-- pages. It is NOT true for a page you administer yourself: a Meta app in Development mode may use
-- `pages_manage_posts` on behalf of anyone who holds a role on that app, and the owner holds every role on
-- both. So a token can be issued today, from Graph API Explorer, with no review and no business
-- verification — and this company only ever needs to post to its OWN page.
--
-- App Review is still what is needed to post for somebody else, or to have the app public. Neither is this.
--
-- ---------------------------------------------------------------------------------------------------------
-- THE TOKEN IS TYPED IN BY A HUMAN AND READ BY THE SERVER
-- ---------------------------------------------------------------------------------------------------------
-- staff_social_set_token takes it from an administrator who pastes it into the Back Office; app.social_token
-- hands it to the server that is about to call Meta. The second is NOT granted to anybody — it is reached
-- only from inside the definer function below it, so there is no door through which a browser can ask for
-- the token, not even an administrator's browser. An administrator can already replace it and post as the
-- page; being able to READ it back adds nothing but a way for it to leak.

create or replace function public.staff_social_set_token(
  p_network     text,
  p_external_id text,
  p_token       text,
  p_display_name text default null,
  p_expires_at  timestamptz default null,
  p_enable      boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_row public.social_accounts;
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_network not in ('facebook', 'instagram') then
    raise exception 'invalid_network' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_token), '') = '' then
    raise exception 'empty_token' using errcode = 'P0001';
  end if;

  insert into public.social_accounts (network, external_id, display_name, access_token,
                                      token_expires_at, is_enabled, connected_at, connected_by)
  values (p_network, p_external_id, nullif(btrim(coalesce(p_display_name, '')), ''), btrim(p_token),
          p_expires_at, p_enable, now(), (select auth.uid()))
  on conflict (network, external_id) do update
    set access_token     = excluded.access_token,
        display_name     = coalesce(excluded.display_name, public.social_accounts.display_name),
        token_expires_at = excluded.token_expires_at,
        is_enabled       = excluded.is_enabled,
        connected_at     = now(),
        connected_by     = (select auth.uid())
  returning * into v_row;

  -- The answer says that it worked and NOT what was stored. A function that echoed the token back would put
  -- it in a server log, a network tab and an error report, which is three places it did not need to be.
  return jsonb_build_object('id', v_row.id, 'network', v_row.network, 'external_id', v_row.external_id,
                            'is_enabled', v_row.is_enabled);
end $fn$;

revoke execute on function public.staff_social_set_token(text, text, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.staff_social_set_token(text, text, text, text, timestamptz, boolean) to authenticated;

comment on function public.staff_social_set_token(text, text, text, text, timestamptz, boolean) is
  'An administrator pastes a Page access token in. It answers that it worked and never echoes the token: a function that returned it would put it in a log, a network tab and an error report, none of which needed it.';

-- ---------------------------------------------------------------------------
-- What the server reads just before it calls Meta
-- ---------------------------------------------------------------------------

create or replace function app.social_token(p_network text)
returns table (external_id text, access_token text)
language sql stable security definer set search_path = '' as $$
  select a.external_id, a.access_token
    from public.social_accounts a
   where a.network = p_network and a.is_enabled and a.access_token is not null
   order by a.connected_at desc nulls last
   limit 1;
$$;

-- Granted to NOBODY. It is called from inside public.staff_social_publish_claim below, which is a definer
-- function and therefore runs as the owner: there is no door a browser can reach this through.
revoke execute on function app.social_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Taking one post out of the queue, and writing back what Meta said
-- ---------------------------------------------------------------------------
--
-- TWO FUNCTIONS AND NOT ONE, because the thing between them is a network call that can hang, fail or
-- succeed without answering. The claim marks the row `publishing` and hands over everything needed to make
-- the call; the result writes back what happened. A single function holding a transaction open across an
-- HTTP request to Meta would be a lock held for as long as Facebook felt like taking.
--
-- ONLY AN APPROVED POST IS CLAIMED. `scheduled` is what approval produces (§7), and nothing else is
-- publishable: a draft, a cancelled row and one already on the page are all refused by the same filter.

create or replace function public.staff_social_publish_claim(p_post uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_post  public.social_posts;
  v_acc   record;
  v_max   integer := app.setting_int('social.max_attempts', 3);
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;

  update public.social_posts s
     set status = 'publishing', attempts = s.attempts + 1
   where s.id = p_post
     and s.status in ('scheduled', 'failed')
     and s.attempts < v_max
  returning * into v_post;

  if not found then
    raise exception 'not_publishable' using errcode = 'P0001';
  end if;

  select * into v_acc from app.social_token(v_post.network);
  if v_acc.access_token is null then
    -- RETURNED, NOT RAISED, and the difference is the whole point of these four lines. A raise aborts the
    -- statement and takes the two writes above it with it, leaving the row in «publishing» forever with
    -- nothing on it to say what it is waiting for. The caller reads `error` and stops.
    update public.social_posts set status = 'failed', last_error = 'no_token' where id = p_post;
    insert into public.social_post_logs (post_id, status, detail) values (p_post, 'failed', 'no_token');
    return jsonb_build_object('error', 'no_token', 'id', p_post);
  end if;

  insert into public.social_post_logs (post_id, status, detail) values (p_post, 'publishing', 'claimed');

  return jsonb_build_object(
    'id', v_post.id,
    'network', v_post.network,
    'caption', v_post.caption,
    'image_url', v_post.image_url,
    'link_url', v_post.link_url,
    'page_id', v_acc.external_id,
    'access_token', v_acc.access_token);
end $fn$;

revoke execute on function public.staff_social_publish_claim(uuid) from public, anon;
grant execute on function public.staff_social_publish_claim(uuid) to authenticated;

comment on function public.staff_social_publish_claim(uuid) is
  'Takes one approved post out of the queue, marks it `publishing`, counts the attempt and hands the server what it needs to call Meta — including the token, which reaches the Node process and never a browser. Refuses anything that is not approved, and anything that has already used up social.max_attempts. With no account connected it RETURNS {"error":"no_token"} rather than raising, so the row it just marked failed keeps saying so.';

create or replace function public.staff_social_publish_result(
  p_post     uuid,
  p_ok       boolean,
  p_post_id  text default null,
  p_permalink text default null,
  p_error    text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_post public.social_posts;
begin
  if not app.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;

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

  return jsonb_build_object('id', v_post.id, 'status', v_post.status, 'permalink', v_post.permalink);
end $fn$;

revoke execute on function public.staff_social_publish_result(uuid, boolean, text, text, text) from public, anon;
grant execute on function public.staff_social_publish_result(uuid, boolean, text, text, text) to authenticated;

comment on function public.staff_social_publish_result(uuid, boolean, text, text, text) is
  'Writes back what Meta answered: the post id and its permalink, or the error. Every attempt lands in social_post_logs — §7 asks for logs, and the reason a post failed at 3am is the one thing nobody can reconstruct afterwards.';
