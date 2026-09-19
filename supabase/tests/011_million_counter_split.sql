-- Counter split (spec v2 §6) and the public_statistics module (§54) · WP-01
-- Runs on the live database: stock figures are checked as deltas around this file's own fixtures,
-- demand figures against a recount taken in the same statement, never against fixed totals.
--
-- 2026-09-19: section 2 moved off public.parcels. The counter reads public.trees, the unit of inventory
-- since 0054, so the fixtures are offers whose trees are numbered and allocated through the real RPCs
-- (staff_generate_trees, staff_allocate_trees) instead of parcel rows inserted by hand. The three
-- properties the section had are kept: deltas and not totals, distinct primes so a miscount cannot land on
-- the right answer, and the demand recount in one statement so live traffic cannot race it.
-- REQUIRES supabase/pending/bb_01_counter_counts_trees.sql: this file is red before it and green after it.

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

  -- The contracted tile counts one tree state, so its hint may not promise contracts in progress: over
  -- public.tree_state a tree is sold or it is not (0054 left 'contracting' out on purpose).
  assert (select s.value #>> '{}' from public.settings s where s.key = 'million.tile_contracted_hint')
         not like '%طور الإمضاء%',
    'the contracted tile no longer promises «عقود … في طور الإمضاء»: apply supabase/pending/bb_01_counter_counts_trees.sql';
end $$;

-- 2 · Each stage counts its own olive trees and nothing else (§6) ---------------------------------
-- reserved and contracted are counts of public.trees rows, whatever the offer's status; planted is decided
-- by the offer («مغروسة / موجودة فعلياً»), so only trees of an offer in 'operating' count. The fixtures use
-- distinct primes, and the fourth offer — 29 trees declared, none ever numbered — is what replaces the old
-- «bare land with no tree count adds 0» case: a declaration is not an inventory.
do $$
declare
  v_tag      text := 'MCS-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_staff    uuid := gen_random_uuid();
  v_reason   text := 'اختبار العدّاد: ترقيم وحجز زيتونات عروض التجربة';
  v_before   jsonb;
  v_after    jsonb;
  v_pub      uuid;
  v_ops      uuid;
  v_study    uuid;
  v_person   uuid;
  v_status   uuid;
  v_trees    bigint;
  v_people   bigint;
  v_requests bigint;
begin
  perform set_config('request.jwt.claims', '', true);
  v_before := public.million_progress();

  assert v_before ?& array['goal', 'trees_requested', 'participants', 'requests', 'projects_under_study',
                           'trees_reserved', 'trees_contracted', 'trees_planted'],
    'every key is present, the demand ones and the three stock ones: got ' || v_before::text;

  -- Finance keeps stock (app.can_manage_trees), reads every file (app.can_see_person) and may contract
  -- (app.can_contract_trees), so one account exercises all three acts the counter reports.
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (v_staff, 'authenticated', 'authenticated', 'mcs-' || v_staff || '@test.local',
          '{"full_name":"Finance Counter"}');
  insert into public.user_roles (user_id, role) values (v_staff, 'finance');

  -- Pinned so the numbering below does not depend on what the Back Office holds today.
  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4)                     where key = 'offers.tree_code_digits';
  update public.settings set value = to_jsonb(1)                     where key = 'offers.min_trees_default';

  select id into v_status from public.lead_statuses where stage = 'new' and is_active
  order by is_stage_default desc, sort_order limit 1;
  insert into public.persons (full_name, phone_e164, status_id, governorate_id)
  values ('حريف عدّاد الزيتونات', '+21655' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'), v_status, 34)
  returning id into v_person;

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_tag || '-PUB', 'عرض اختبار العدّاد (منشور)', 34, 'published', 37) returning id into v_pub;
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_tag || '-OPS', 'عرض اختبار العدّاد (في الاستغلال)', 34, 'operating', 19) returning id into v_ops;
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_tag || '-STD', 'عرض اختبار العدّاد (قيد الدراسة)', 34, 'preparing', 7) returning id into v_study;
  -- Operating, declares 29 trees, and not one of them is ever numbered.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values (v_tag || '-NUM', 'عرض اختبار العدّاد (بلا ترقيم)', 34, 'operating', 29);

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  perform public.staff_generate_trees(v_pub,   v_reason);
  perform public.staff_generate_trees(v_ops,   v_reason);
  perform public.staff_generate_trees(v_study, v_reason);

  perform public.staff_allocate_trees(v_pub,   v_person, null, 11, 'reserved', v_reason);
  perform public.staff_allocate_trees(v_pub,   v_person, null, 17, 'sold',     v_reason);
  perform public.staff_allocate_trees(v_study, v_person, null,  7, 'reserved', v_reason);
  perform public.staff_allocate_trees(v_ops,   v_person, null,  5, 'sold',     v_reason);

  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_after := public.million_progress();

  assert (v_after->>'trees_reserved')::bigint - (v_before->>'trees_reserved')::bigint = 11 + 7,
    'reserved counts reserved trees in any offer (11 + 7), got +'
    || ((v_after->>'trees_reserved')::bigint - (v_before->>'trees_reserved')::bigint);

  assert (v_after->>'trees_contracted')::bigint - (v_before->>'trees_contracted')::bigint = 17 + 5,
    'contracted counts sold trees in any offer (17 + 5) and nothing else, got +'
    || ((v_after->>'trees_contracted')::bigint - (v_before->>'trees_contracted')::bigint);

  assert (v_after->>'trees_planted')::bigint - (v_before->>'trees_planted')::bigint = 19,
    'planted counts every numbered tree of an operating offer, sold or not, and an offer that only declares '
    || '29 trees without numbering them adds none of them, got +'
    || ((v_after->>'trees_planted')::bigint - (v_before->>'trees_planted')::bigint);

  assert (v_after->>'projects_under_study')::bigint - (v_before->>'projects_under_study')::bigint = 1,
    'a preparing project is still counted under study; published and operating ones are not';

  assert (v_after->>'goal')::bigint = app.setting_int('million.goal', 0),
    'the goal is still read from the million.goal setting';

  -- Counts of rows, never a sum of declared numbers: the whole reason the counter moved off parcels.
  assert (v_after->>'trees_reserved')::bigint = (select count(*) from public.trees t where t.state = 'reserved')
     and (v_after->>'trees_contracted')::bigint = (select count(*) from public.trees t where t.state = 'sold'),
    'reserved and contracted are the tree row counts themselves';

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

-- 2b · The counter reads the inventory, and nothing that was retired -------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.million_progress()'::regprocedure);
begin
  assert position('public.trees' in v_def) > 0,
    'million_progress() counts public.trees: apply supabase/pending/bb_01_counter_counts_trees.sql';
  assert position('parcel' in v_def) = 0,
    'million_progress() names no parcel: apply supabase/pending/bb_01_counter_counts_trees.sql';
end $$;

-- 3 · Visitors may call it, and it carries no personal data and no money (MIL-01, PRJ-03) ----------
do $$
declare
  v jsonb;
begin
  assert has_function_privilege('anon', 'public.million_progress()', 'execute'), 'anon can execute million_progress';
  assert has_function_privilege('authenticated', 'public.million_progress()', 'execute'),
    'authenticated can execute million_progress';
  assert coalesce((select p.proacl::text from pg_proc p where p.oid = 'public.million_progress()'::regprocedure), '')
         not like '{=X/%' and
         coalesce((select p.proacl::text from pg_proc p where p.oid = 'public.million_progress()'::regprocedure), '')
         not like '%,=X/%',
    'million_progress carries no PUBLIC execute';
  assert (select p.prosecdef and array_to_string(p.proconfig, ',') like 'search_path=%'
          from pg_proc p where p.oid = 'public.million_progress()'::regprocedure),
    'million_progress stays security definer with a pinned search_path';

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

  -- PRJ-03: stock is a fact, price is a permission. The counter states counts and never a dinar, so no key
  -- of it may name money — the `pricing` module has no say over what this function returns.
  assert not exists (
    select 1 from jsonb_object_keys(v) k
    where k ~* '(millime|price|cost|amount|dinar|montant|prix)'
  ), 'the counter carries no money key: ' || v::text;
  assert pg_get_functiondef('public.million_progress()'::regprocedure) !~* '\mmillimes\M',
    'the counter reads no money column either';
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
