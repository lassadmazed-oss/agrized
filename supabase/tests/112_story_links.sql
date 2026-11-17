-- 0166 · the stories' landing pages, their ad links and their counts.

do $$
declare
  v_admin uuid;
  v_out   jsonb;
  v_codes text[];
begin
  select array_agg(code order by sort_order) into v_codes from public.option_items where list_key = 'tree_for' and is_active;

  -- Every story has a picture slot and a title.
  assert (select bool_and(exists (select 1 from public.site_media m where m.slot = 'story.' || c)) from unnest(v_codes) c),
    'every story has its picture slot';
  assert (select bool_and(coalesce((select value from public.settings where key = 'story.titles')->c->>'ar', '') <> '')
          from unnest(v_codes) c), 'every story has its title';
  assert jsonb_typeof((select value from public.settings where key = 'story.ad_channels')) = 'array', 'the ad channels are a list';
  assert (select is_public from public.settings where key = 'story.ad_channels') = false, 'the ad channels are not published';
  assert (select count(*) from public.settings where key like 'story.resume_%') >= 5, 'the reminder has its words';

  -- The counts: staff only, counts only.
  assert not has_function_privilege('anon', 'public.staff_story_stats(integer)', 'execute'), 'a visitor reads no count';
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin here; the counts are not read';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_out := public.staff_story_stats(30);
  assert jsonb_array_length(v_out) = cardinality(v_codes), 'one line per story: ' || v_out::text;
  assert (select bool_and(e ? 'requests' and e ? 'from_ads' and e ? 'sources') from jsonb_array_elements(v_out) e),
    'each line counts requests, ad requests and networks';
  assert not (v_out::text ~ '"(full_name|phone_e164)"'), 'no person in the counts';
end $$;
