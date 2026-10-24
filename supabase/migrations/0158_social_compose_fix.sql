-- 0158 · the call to action and the hashtags come back, and the link inside them is filled in.
--
-- Its test is the one 0157 already has, grown: supabase/tests/104_social_posts.sql.
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0158_social_compose_fix.sql supabase/tests/104_social_posts.sql
--
-- WHAT 0157 SHIPPED, AND HOW IT GOT THERE. app.social_compose substituted the template's BODY and then
-- appended the call to action and the hashtags, so «{link}» written in the CTA — which is the one place a
-- link belongs — reached the page as four literal characters. The test caught that. The fix for it did not
-- land cleanly: the append was removed and the assembly that was meant to replace it was not written, so
-- the function went out composing captions with no call to action and no hashtags at all. The test did not
-- catch THAT, because every assertion it made was about what must not be in a caption and none about what
-- must.
--
-- Both halves are now true: the text is assembled first and substituted once, and 104 asserts that a
-- template with a CTA and hashtags produces a caption carrying both.
--
-- The function below is 0157's, unchanged except for those three lines.

create or replace function app.social_compose(
  p_project uuid,
  p_network text,
  p_event   text,
  p_locale  text
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_pj     public.projects;
  v_tpl    public.social_templates;
  v_quote  jsonb;
  v_body   text;
  v_link   text;
  v_origin text := app.setting_text('site.origin', 'https://www.agrized.site');
begin
  select * into v_pj from public.projects p where p.id = p_project;
  if not found or not app.social_publishable(p_project) then
    return null;
  end if;

  -- The offer's own template wins over a network-agnostic one; a missing language falls back to Arabic,
  -- which is the site's source language everywhere else too.
  select * into v_tpl from public.social_templates t
   where t.is_active and t.event = p_event
     and (t.network = p_network or t.network is null)
     and t.locale in (p_locale, 'ar')
   order by (t.network = p_network) desc, (t.locale = p_locale) desc, t.sort_order
   limit 1;
  if not found then
    return null;
  end if;

  v_quote := app.project_quote_payload(p_project, null, greatest(coalesce(v_pj.min_trees_per_order, 1), 1),
                                       null, null, null, false);

  v_link := v_origin || '/' || p_locale || '/projects/' || v_pj.code
         || '?utm_source=' || p_network
         || '&utm_medium=social&utm_campaign=' || v_pj.code;

  -- THE WHOLE TEXT IS ASSEMBLED FIRST AND SUBSTITUTED AFTER, which is the bug 0157 shipped: the body was
  -- substituted and the call to action appended afterwards, so a «{link}» written in the CTA — which is
  -- exactly where a link belongs — went out as four literal characters. 104 caught the placeholder; what
  -- it did not catch was the fix that followed, which dropped the CTA and the hashtags altogether. Both
  -- are asserted now.
  v_body := v_tpl.body
         || case when v_tpl.cta is not null then E'

' || v_tpl.cta else '' end
         || case when v_tpl.hashtags is not null then E'

' || v_tpl.hashtags else '' end;

  v_body := replace(v_body, '{offer}', coalesce(v_pj.name, v_pj.code));
  v_body := replace(v_body, '{code}', v_pj.code);
  v_body := replace(v_body, '{trees}', coalesce(v_pj.tree_count::text, ''));
  -- The price only when the offer actually publishes one. A template that asks for {price} on an offer
  -- whose pricing is closed gets an empty string, never a number nobody agreed to.
  v_body := replace(v_body, '{price}',
    case when (v_quote->>'pricing') = 'ok'
         then app.money_ar((v_quote->>'price_per_tree_millimes')::bigint) else '' end);
  -- Instagram does not make a link in a caption clickable, so it is not pasted into one: the post carries
  -- the link beside the caption and the Back Office puts it where that network can use it.
  v_body := replace(v_body, '{link}', case when p_network = 'facebook' then v_link else '' end);

  return jsonb_build_object(
    'project_id', p_project,
    'project_code', v_pj.code,
    'network', p_network,
    'event', p_event,
    'locale', p_locale,
    'caption', btrim(v_body),
    'link_url', v_link,
    -- The offer's cover, read from project_media the way every other screen reads it. A post with no
    -- picture is still a post on Facebook; on Instagram it is nothing at all, which is the dispatcher's
    -- problem to refuse rather than this one's to invent an image for.
    'image_url', (select m.url from public.project_media m
                   where m.project_id = p_project and m.is_cover
                   order by m.sort_order limit 1),
    'dedupe_key', p_project::text || ':' || p_event || ':' || p_network);
end $fn$;

