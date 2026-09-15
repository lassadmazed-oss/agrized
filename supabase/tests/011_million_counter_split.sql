-- Counter split (spec v2 §6) and the public_statistics module (§54) · WP-01
-- Runs on the live database: parcel figures are checked as deltas around this file's own fixtures,
-- demand figures against a recount taken in the same statement, never against fixed totals.

-- 1 · The module and every counter text exist -----------------------------------------------------
do $$
declare
  v_keys  text[] := array[
    'million.tile_requested_label', 'million.tile_requested_label_fr', 'million.tile_requested_hint', 'million.tile_requested_hint_fr',
    'million.tile_reserved_label', 'million.tile_reserved_label_fr', 'million.tile_reserved_hint', 'million.tile_reserved_hint_fr',
    'million.tile_contracted_label', 'million.tile_contracted_label_fr', 'million.tile_contracted_hint', 'million.tile_contracted_hint_fr',
    'million.tile_planted_label', 'million.tile_planted_label_fr', 'million.tile_planted_hint', 'million.tile_planted_hint_fr',
    'million.tile_participants_label', 'million.tile_participants_label_fr', 'million.tile_participants_hint', 'million.tile_participants_hint_fr',
    'million.tile_projects_label', 'million.tile_projects_label_fr', 'million.tile_projects_hint', 'million.tile_projects_hint_fr',
    'million.goal_label', 'million.goal_label_fr', 'million.bar_caption', 'million.bar_caption_fr',
    'million.bar_empty', 'million.bar_empty_fr', 'million.share_below', 'million.share_below_fr'
  ];
  v_found bigint;
begin
  assert exists (select 1 from public.feature_flags where key = 'public_statistics' and phase = 1),
    'the public_statistics module is registered in phase 1';

  select count(*) into v_found from public.settings s
  where s.key = any (v_keys) and s.is_public and s.value_type = 'text' and s.group_key = 'site';
  assert v_found = cardinality(v_keys),
    'every counter text is a public site text setting: expected ' || cardinality(v_keys) || ', got ' || v_found;

  assert not exists (
    select 1 from unnest(v_keys) k where k not like '%\_fr' and not (k || '_fr' = any (v_keys))
  ), 'every counter text has a French twin';
end $$;

-- 2 · Each stage counts its own parcels and nothing else (§6) -------------------------------------
do $$
declare
  v_owned    boolean := exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'parcel_status' and e.enumlabel = 'owned'
  );
  v_tag      text := 'MCS-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_before   jsonb;
  v_after    jsonb;
  v_pub      uuid;
  v_ops      uuid;
  v_study    uuid;
  v_trees    bigint;
  v_people   bigint;
  v_requests bigint;
begin
  perform set_config('request.jwt.claims', '', true);
  v_before := public.million_progress();

  assert v_before ?& array['goal', 'trees_requested', 'participants', 'requests', 'projects_under_study',
                           'trees_reserved', 'trees_contracted', 'trees_planted'],
    'every key is present, the old ones and the three new ones: got ' || v_before::text;

  insert into public.projects (code, name, governorate_id, status)
  values (v_tag || '-PUB', 'مشروع اختبار العدّاد (منشور)', 34, 'published') returning id into v_pub;
  insert into public.projects (code, name, governorate_id, status)
  values (v_tag || '-OPS', 'مشروع اختبار العدّاد (في الاستغلال)', 34, 'operating') returning id into v_ops;
  insert into public.projects (code, name, governorate_id, status)
  values (v_tag || '-STD', 'مشروع اختبار العدّاد (قيد الدراسة)', 34, 'preparing') returning id into v_study;

  insert into public.parcels (project_id, code, area_m2, property_type, olive_tree_count, cash_price_millimes, status) values
    (v_pub,   'R1', 500, 'planted',   11,   1000000, 'reserved'),
    (v_pub,   'R2', 500, 'bare_land', null, 1000000, 'reserved'),
    (v_pub,   'C1', 500, 'planted',   13,   1000000, 'contracting'),
    (v_pub,   'S1', 500, 'planted',   17,   1000000, 'sold'),
    (v_pub,   'W1', 500, 'planted',   19,   1000000, 'withdrawn'),
    (v_pub,   'A1', 500, 'planted',   23,   1000000, 'available'),
    (v_pub,   'I1', 500, 'planted',   29,   1000000, 'interested'),
    (v_ops,   'A1', 500, 'planted',   31,   1000000, 'available'),
    (v_ops,   'W1', 500, 'planted',   37,   1000000, 'withdrawn'),
    (v_ops,   'S1', 500, 'planted',   41,   1000000, 'sold'),
    (v_study, 'R1', 500, 'planted',   7,    1000000, 'reserved');

  -- 'owned' arrives with 0021; the literal would not even parse before it, hence dynamic SQL.
  if v_owned then
    execute $sql$
      insert into public.parcels (project_id, code, area_m2, property_type, olive_tree_count, cash_price_millimes, status)
      values ($1, 'O1', 500, 'planted', 43, 1000000, 'owned')
    $sql$ using v_pub;
  end if;

  v_after := public.million_progress();

  assert (v_after->>'trees_reserved')::bigint - (v_before->>'trees_reserved')::bigint = 18,
    'reserved counts reserved parcels only (11 + 7; bare land without trees adds 0), got +'
    || ((v_after->>'trees_reserved')::bigint - (v_before->>'trees_reserved')::bigint);

  assert (v_after->>'trees_contracted')::bigint - (v_before->>'trees_contracted')::bigint
         = 13 + 17 + 41 + case when v_owned then 43 else 0 end,
    'contracted counts contracting, sold and owned parcels in any project, got +'
    || ((v_after->>'trees_contracted')::bigint - (v_before->>'trees_contracted')::bigint);

  assert (v_after->>'trees_planted')::bigint - (v_before->>'trees_planted')::bigint = 31 + 41,
    'planted counts every non-withdrawn parcel of operating projects only, got +'
    || ((v_after->>'trees_planted')::bigint - (v_before->>'trees_planted')::bigint);

  assert (v_after->>'projects_under_study')::bigint - (v_before->>'projects_under_study')::bigint = 1,
    'a preparing project is still counted under study; published and operating ones are not';

  assert (v_after->>'goal')::bigint = app.setting_int('million.goal', 0),
    'the goal is still read from the million.goal setting';

  -- The demand figures are unchanged in meaning; recounted in the same statement so live traffic cannot race them.
  select p, trees, people, requests into v_after, v_trees, v_people, v_requests
  from (
    select
      public.million_progress() as p,
      (select coalesce(sum(r.tree_count_min), 0) from public.interest_requests r where not r.is_duplicate) as trees,
      (select count(distinct r.person_id) from public.interest_requests r) as people,
      (select count(*) from public.interest_requests r where not r.is_duplicate) as requests
  ) s;

  assert (v_after->>'trees_requested')::bigint = v_trees,
    'trees_requested is still the lower bound of non-duplicate demands, got ' || (v_after->>'trees_requested') || ' for ' || v_trees;
  assert (v_after->>'participants')::bigint = v_people, 'participants still counts distinct persons';
  assert (v_after->>'requests')::bigint = v_requests, 'requests still counts non-duplicate demands';
end $$;

-- 3 · Visitors may call it, and it carries no personal data (MIL-01) -------------------------------
do $$
declare
  v jsonb;
begin
  assert has_function_privilege('anon', 'public.million_progress()', 'execute'), 'anon can execute million_progress';
  assert has_function_privilege('authenticated', 'public.million_progress()', 'execute'),
    'authenticated can execute million_progress';

  perform set_config('request.jwt.claims', '', true);
  update public.feature_flags set state = 'public' where key = 'public_statistics';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  v := public.million_progress();
  reset role;

  assert v is not null, 'a visitor reads the counter while the module is public';
  assert v::text !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'the counter carries no uuid';
  assert v::text !~ '\+[1-9][0-9]{6,14}', 'the counter carries no phone number';
  assert (select bool_and(jsonb_typeof(e.value) = 'number') from jsonb_each(v) e), 'every value is a plain number';
end $$;

-- 4 · The module decides who reads it through the API (§54, FLAG-01) ------------------------------
do $$
declare
  v_staff uuid := gen_random_uuid();
  v       jsonb;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users (id, email) values (v_staff, 'mcs-' || v_staff || '@test.local');
  update public.profiles set full_name = 'Staff Counter', is_active = true where id = v_staff;
  insert into public.user_roles (user_id, role) values (v_staff, 'commercial');

  -- disabled: nobody reads it through the API
  update public.feature_flags set state = 'disabled' where key = 'public_statistics';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  v := public.million_progress();
  reset role;
  assert v is null, 'a visitor gets nothing while the module is disabled';

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.million_progress();
  reset role;
  assert v is null, 'staff get nothing either while the module is disabled';

  -- internal: staff only
  perform set_config('request.jwt.claims', '', true);
  update public.feature_flags set state = 'internal' where key = 'public_statistics';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  v := public.million_progress();
  reset role;
  assert v is null, 'a visitor gets nothing while the module is internal';

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.million_progress();
  reset role;
  assert v is not null and v ? 'trees_planted', 'signed-in staff read the counter while the module is internal';

  -- A direct database session (no JWT) always reads, so migrations and tests do not depend on the flag
  perform set_config('request.jwt.claims', '', true);
  update public.feature_flags set state = 'disabled' where key = 'public_statistics';
  assert public.million_progress() is not null, 'a direct database session reads the counter whatever the flag';
end $$;
