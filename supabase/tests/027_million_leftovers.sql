-- Test for the sweep: nothing public sells the number any more, and /start's copy lives in settings.

-- 1 · The guard that would have caught this: no public copy names the million ------------------------
-- The counter's own texts (million.*) are what the section is, and they carry figures through {goal}
-- tokens rather than the word, so they are held to the same rule.
do $$
declare
  v_hit text;
begin
  select string_agg(s.key, ', ' order by s.key) into v_hit
  from public.settings s
  where s.is_public and (s.value::text ilike '%مليون%' or s.value::text ilike '%million%');
  assert v_hit is null, 'public copy still sells the number, in: ' || coalesce(v_hit, '');

  select string_agg(t.key, ', ' order by t.key) into v_hit
  from public.message_templates t
  where t.is_active and (t.body_ar ilike '%مليون%' or coalesce(t.body_fr, '') ilike '%million%');
  assert v_hit is null, 'a message we send still sells the number, in: ' || coalesce(v_hit, '');

  select string_agg(o.list_key || '/' || coalesce(o.code, o.id::text), ', ') into v_hit
  from public.option_items o
  where o.is_active and (o.label_ar ilike '%مليون%' or coalesce(o.label_fr, '') ilike '%million%');
  assert v_hit is null, 'an option we offer still sells the number, in: ' || coalesce(v_hit, '');
end $$;

-- 2 · The calculator's first screen says what a tree is ---------------------------------------------
do $$
begin
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.trees_subtitle') like '%أصل باسمك%',
    'the first screen calls the tree an asset in the visitor''s name';
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.trees_subtitle_fr') like '%actif à votre nom%',
    'the French twin says the same thing';

  -- The counter itself is untouched: real counts, its own copy, its goal.
  assert exists (select 1 from public.settings where key = 'million.goal'), 'the counter keeps its goal';
  assert exists (select 1 from public.settings where key = 'site.progress_title' and is_public),
    'the counter keeps its title';
end $$;

-- 3 · The first WhatsApp keeps its three variables while dropping the pitch --------------------------
do $$
declare
  v_body text := (select body_ar from public.message_templates where key = 'lead.whatsapp_first_contact');
begin
  assert v_body not like '%مليون%', 'the first WhatsApp no longer names the million';
  assert v_body like '%{name}%' and v_body like '%{agent}%' and v_body like '%{request_no}%',
    'the first WhatsApp still fills the name, the agent and the request number';
end $$;

-- 4 · /start's page copy is a setting now, like every other page ------------------------------------
do $$
declare
  v_keys text[] := array['site.start_meta_title', 'site.start_meta_title_fr',
                         'site.start_meta_description', 'site.start_meta_description_fr'];
  v_found bigint;
begin
  select count(*) into v_found from public.settings s
  where s.key = any (v_keys) and s.is_public and s.value_type = 'text' and s.group_key = 'site';
  assert v_found = cardinality(v_keys),
    'every /start meta text is a public site setting: expected ' || cardinality(v_keys) || ', got ' || v_found;

  assert (select length(btrim(s.value #>> '{}')) > 0 from public.settings s where s.key = 'site.start_meta_description'),
    'the /start description is not empty, because search results show it';
end $$;

-- 5 · A visitor reads the new page copy --------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings where key like 'site.start_meta_%') = 4,
    'visitors read the four /start meta texts';
end $$;

reset role;
