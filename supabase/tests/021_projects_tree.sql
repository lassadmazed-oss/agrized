-- Projects and parcels on the tree with its area (docs/plan-zitouna.md P5-3, P5-4). Migration 0035_projects_tree.sql.
-- Live data caveat: the catalog may hold other projects, so every assertion is relative to the TREE-* fixtures.

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000035c1', 'authenticated', 'authenticated', 'com-tree@test.local', '{"full_name":"Commercial Tree"}'),
  ('00000000-0000-0000-0000-0000000035c2', 'authenticated', 'authenticated', 'cli-tree@test.local', '{"full_name":"Client Tree"}');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000035c1', 'commercial'),
  ('00000000-0000-0000-0000-0000000035c2', 'client');

update public.feature_flags set state = 'public' where key in ('projects', 'pricing');

insert into public.projects (code, name, governorate_id, plantation_system, production_status, status) values
  ('TREE-P', 'مشروع بالزيتونة', 34, 'intensive', 'none', 'published'),
  ('TREE-L', 'مشروع قديم', 34, 'traditional', 'producing', 'published');

-- The project plants one class: the owner's example, 35 m² per tree.
insert into public.project_spacing_classes (project_id, spacing_class_id)
select (select id from public.projects where code = 'TREE-P'), c.id
from public.tree_spacing_classes c
where c.area_m2 = 35 and c.is_active
order by c.sort_order
limit 1;

-- A tree parcel is saved with a placeholder area and no typed price; a legacy parcel keeps both.
insert into public.parcels (project_id, code, area_m2, property_type, plantation_system, olive_tree_count,
                            production_status, irrigation, cash_price_millimes, status, sort_order) values
  ((select id from public.projects where code = 'TREE-P'), 'T01', 1, 'planted', 'intensive', 20, 'none', 'irrigated', 0, 'available', 10),
  ((select id from public.projects where code = 'TREE-P'), 'T02', 1, 'planted', 'intensive', 10, 'none', 'irrigated', 0, 'reserved', 20),
  ((select id from public.projects where code = 'TREE-L'), 'L01', 500, 'planted', 'traditional', 12, 'producing', 'rainfed', 5000000, 'available', 10);

select set_config('test.tree.class', (select spacing_class_id::text from public.project_spacing_classes
  where project_id = (select id from public.projects where code = 'TREE-P')), false);
select set_config('test.tree.project', (select id::text from public.projects where code = 'TREE-P'), false);
select set_config('test.tree.legacy', (select id::text from public.projects where code = 'TREE-L'), false);
select set_config('test.tree.price', (app.tree_price(current_setting('test.tree.class')::uuid,
  current_setting('test.tree.project')::uuid)->>'price_per_tree_millimes'), false);

-- ---------------------------------------------------------------------------
-- T1 · The parcel stores its class and the area its trees cover
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  assert current_setting('test.tree.price', true) is not null, 'the seeded rules price a 35 m² tree';

  select * into r from public.parcels
  where project_id = current_setting('test.tree.project')::uuid and code = 'T01';
  assert r.spacing_class_id = current_setting('test.tree.class')::uuid, 'the only class of the project is stored on the parcel';
  assert r.area_m2 = 700, '20 trees × 35 m² = 700 m², got ' || r.area_m2;

  update public.parcels set olive_tree_count = 25 where id = r.id;
  assert (select area_m2 from public.parcels where id = r.id) = 875, 'more trees, more area (25 × 35 = 875 m²)';
  update public.parcels set olive_tree_count = 20 where id = r.id;

  select * into r from public.parcels
  where project_id = current_setting('test.tree.legacy')::uuid and code = 'L01';
  assert r.spacing_class_id is null and r.area_m2 = 500, 'a legacy parcel keeps its typed area and no class';
end $$;

-- ---------------------------------------------------------------------------
-- T2 · A visitor while pricing is public
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
declare
  r record;
  v_price bigint := current_setting('test.tree.price')::bigint;
begin
  select * into r from public.public_parcels()
  where project_id = current_setting('test.tree.project')::uuid and code = 'T01';
  assert r.on_tree_pricing and r.area_m2 = 700 and r.area_per_tree_m2 = 35, 'tree parcel: area and area per tree';
  assert r.price_per_tree_millimes = v_price, 'price per tree from the pricing rules';
  assert r.cash_price_millimes = 20 * v_price, 'price = 20 × price per tree, got ' || coalesce(r.cash_price_millimes::text, 'null');
  assert r.spacing_label_ar is not null, 'the class name is shown';

  select * into r from public.public_parcels()
  where project_id = current_setting('test.tree.project')::uuid and code = 'T02';
  assert r.cash_price_millimes is null and r.price_per_tree_millimes is null and r.down_from_millimes is null,
    'a reserved tree parcel shows no money';

  select * into r from public.public_parcels()
  where project_id = current_setting('test.tree.legacy')::uuid and code = 'L01';
  assert not r.on_tree_pricing and r.cash_price_millimes = 5000000 and r.price_per_tree_millimes is null,
    'a legacy parcel keeps its typed price';

  select * into r from public.public_projects() where id = current_setting('test.tree.project')::uuid;
  assert r.on_tree_pricing and r.min_price_per_tree_millimes = v_price, 'project card: price per tree';
  assert r.area_per_tree_min_m2 = 35 and r.area_per_tree_max_m2 = 35, 'project card: area per tree';
  assert r.parcels_offered = 1 and r.min_cash_price_millimes = 20 * v_price, 'only the available tree parcel is offered';

  assert (select parcels_offered from public.public_coverage() where governorate_id = 34) >= 2,
    'coverage counts the priced tree parcel and the legacy one';

  -- PRJ-03: the internal formula never reaches the listing signatures
  assert pg_get_function_result('public.public_parcels()'::regprocedure) !~ '(margin|land|planting|extras|markup|cost_per)',
    'public_parcels stays whitelisted';
  assert pg_get_function_result('public.public_projects()'::regprocedure) !~ '(margin|land|planting|extras|markup|cost_per)',
    'public_projects stays whitelisted';
  assert not has_function_privilege('anon', 'public.staff_project_parcel_prices(uuid)', 'execute'),
    'visitors cannot call the staff price list';
  assert not has_function_privilege('anon', 'app.parcel_tree_unit_sync()', 'execute'), 'the sync trigger is closed';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- T3 · Pricing still internal: tree prices hide, areas stay, legacy is unchanged
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'internal' where key = 'pricing';

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
declare
  r record;
begin
  select * into r from public.public_parcels()
  where project_id = current_setting('test.tree.project')::uuid and code = 'T01';
  assert r.cash_price_millimes is null and r.price_per_tree_millimes is null and r.down_from_millimes is null,
    'no tree price while pricing is not public';
  assert r.area_m2 = 700 and r.area_per_tree_m2 = 35, 'areas are not money and stay visible';

  select * into r from public.public_projects() where id = current_setting('test.tree.project')::uuid;
  assert r.min_price_per_tree_millimes is null and r.min_cash_price_millimes is null and r.parcels_offered = 0,
    'the project card shows no tree price either';

  select * into r from public.public_parcels()
  where project_id = current_setting('test.tree.legacy')::uuid and code = 'L01';
  assert r.cash_price_millimes = 5000000, 'legacy parcels follow the projects module only, as before';
end $$;

reset role;

update public.feature_flags set state = 'public' where key = 'pricing';

-- ---------------------------------------------------------------------------
-- T4 · Back Office price list
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000035c2", "role": "authenticated"}';
set local role authenticated;

do $$
begin
  begin
    perform 1 from public.staff_project_parcel_prices(current_setting('test.tree.project')::uuid);
    raise exception 'a client must not read the staff price list';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000035c1", "role": "authenticated"}';
set local role authenticated;

do $$
declare
  v_price bigint := current_setting('test.tree.price')::bigint;
begin
  assert (select count(*) from public.staff_project_parcel_prices(current_setting('test.tree.project')::uuid)) = 2,
    'staff read the price of every parcel of the project';
  assert (select (price->>'cash_total_millimes')::bigint
          from public.staff_project_parcel_prices(current_setting('test.tree.project')::uuid) s
          join public.parcels pa on pa.id = s.parcel_id
          where pa.code = 'T02') = 10 * v_price,
    'including a reserved parcel, without the module gate';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- T5 · Editing a class area moves the area of its parcels
-- ---------------------------------------------------------------------------

do $$
begin
  -- area_m2 is generated from the spacings: 6 × 6 = 36 m² per tree.
  update public.tree_spacing_classes set row_spacing_m = 6, tree_spacing_m = 6 where id = current_setting('test.tree.class')::uuid;
  assert (select area_m2 from public.parcels
          where project_id = current_setting('test.tree.project')::uuid and code = 'T01') = 720,
    '20 trees × 36 m² = 720 m² after the class changed';
  assert (select area_m2 from public.parcels
          where project_id = current_setting('test.tree.legacy')::uuid and code = 'L01') = 500,
    'legacy parcels are untouched';
end $$;
