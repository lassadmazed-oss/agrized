-- Test for the pending message copy: the asset the visitor builds leads, the million no longer does.

-- 1 · The three new service texts exist as public site copy -----------------------------------------
do $$
declare
  v_keys text[] := array['site.services_title', 'site.services_text', 'site.services_note'];
  v_found bigint;
begin
  select count(*) into v_found from public.settings s
  where s.key = any (v_keys) and s.is_public and s.value_type = 'text' and s.group_key = 'site';
  assert v_found = cardinality(v_keys),
    'every services text is a public site setting: expected ' || cardinality(v_keys) || ', got ' || v_found;

  -- The section renders the names of the agrized_service list, so the list has to be there.
  assert (select count(*) from public.option_items where list_key = 'agrized_service' and is_active) > 0,
    'the services section has names to show';
end $$;

-- 2 · The copy the owner asked for is the copy that renders ----------------------------------------
do $$
begin
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.home_headline') = 'زيتونتك هي مشروعك',
    'the hero leads with the visitor''s own project';

  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.home_subheadline') like '%على قدّ إمكانياتك%',
    'the hero says the asset is built to the visitor''s means';

  -- §53 and PRN-01: the asset «can» strengthen an income; nothing is ever owed to anyone.
  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.home_subheadline') like '%ينجم%',
    'the income line stays conditional';

  assert (select s.value #>> '{}' from public.settings s where s.key = 'site.services_text') like '%بمقابل معلوم%',
    'the follow-up is sold at a known fee, not given';
end $$;

-- 3 · The million is no longer what the pages lead with ---------------------------------------------
do $$
declare
  v_lead text[] := array['site.home_headline', 'site.home_subheadline', 'site.meta_title', 'site.meta_description',
                         'site.start_title', 'site.start_text', 'site.final_cta_title',
                         'register.success_welcome_title', 'register.success_motivation'];
  v_hit text;
begin
  select string_agg(s.key, ', ') into v_hit from public.settings s
  where s.key = any (v_lead) and s.value #>> '{}' like '%المليون%';
  assert v_hit is null, 'no leading copy sells the million any more, found in: ' || coalesce(v_hit, '');

  -- The counter itself stays: it is a real figure, it is simply not the headline.
  assert exists (select 1 from public.settings where key = 'million.goal'), 'the counter keeps its goal';
  assert exists (select 1 from public.settings where key = 'site.progress_title' and is_public),
    'the «وين وصلنا؟» section keeps its title';
end $$;

-- 4 · The §53 vocabulary guard still passes on every public surface ---------------------------------
do $$
declare
  v_rule    jsonb := (select s.value from public.settings s where s.key = 'legal.forbidden_phrases');
  v_allowed text[] := array(select jsonb_array_elements_text(v_rule->'allowed_keys'));
  v_hits    text;
begin
  select string_agg(s.key || ' «' || ph.phrase || '»', '; ') into v_hits
  from public.settings s
  join jsonb_array_elements_text(v_rule->'phrases') ph(phrase) on position(ph.phrase in s.value::text) > 0
  where s.is_public and not (s.key = any (v_allowed));
  assert v_hits is null, 'the new copy uses a phrase §53 forbids: ' || coalesce(v_hits, '');
end $$;

-- 5 · A visitor reads the new copy through the public policy ----------------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings where key like 'site.services_%') = 3,
    'visitors read the three services texts';
  assert (select count(*) from public.settings where key = 'site.home_headline') = 1,
    'visitors read the headline';
end $$;

reset role;
