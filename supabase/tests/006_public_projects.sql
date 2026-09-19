-- Public offers surface (PUB-01): visitors read only through whitelisted RPCs gated on the projects flag;
-- the pricing formula, internal costs and notes never leave Postgres.
-- Spec: PRN-01, PRJ-02/03, PARC-01/02/11, SIM-05/08, FLAG-01..03, LEAD-02, clause 25.6.
-- Live data caveat: the catalog may hold other projects, so every assertion is relative to the PUB-* fixtures.
-- Migration 0032 retires the old amount lists (docs/plan-zitouna.md Q-7) that this offer card still reads; they are
-- switched back on inside this rolled-back test until plan P5-4 moves the card to tree pricing.
--
-- 2026-09-19 · THE FILE NOW READS TWO WORLDS, ON PURPOSE.
-- The olive tree is the unit of inventory (0054) and the parcel layer is being retired
-- (supabase/pending/bb_03_parcel_layer_retires.sql). Every parcel section below is gated on the table still
-- existing, so this file is green before that draft is applied AND after it — and no guard on an
-- anon-callable function is dropped while that function is still anon-callable. T11 and T13 are the
-- unconditional half: the offer surface the product actually sells through, and the copy it prints.
-- T13 REQUIRES supabase/pending/bb_02_parcel_copy_retires.sql to be applied.
update public.option_items set is_active = true
where list_key in ('desired_area', 'priority', 'down_payment', 'monthly_installment');

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'fin-pub@test.local', '{"full_name":"Finance Pub"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'com-pub@test.local', '{"full_name":"Commercial Pub"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'cli-pub@test.local', '{"full_name":"Client Pub"}');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'finance'),
  ('00000000-0000-0000-0000-0000000000e2', 'commercial'),
  ('00000000-0000-0000-0000-0000000000e3', 'client');

update public.feature_flags set state = 'public' where key = 'projects';

insert into public.projects (code, name, governorate_id, project_type_id, plantation_system, production_status, pricing,
                             legal_notes, annual_costs_millimes, location_description, status)
values
  ('PUB-P', 'مشروع منشور', 34, (select id from public.project_types where code = 'productive'), 'traditional', 'producing',
   '{"model":"markup_brackets","max_months":84,"brackets":[{"max_months":36,"markup_pct":10},{"max_months":60,"markup_pct":18},{"max_months":84,"markup_pct":25}]}'::jsonb,
   'SECRET-LEGAL', 999000, 'PUBLIC-LOC', 'published'),
  ('PUB-E', 'مشروع بصيغة افتراضية', 34, (select id from public.project_types where code = 'productive'), 'traditional', 'producing',
   '{}'::jsonb, null, null, null, 'published'),
  ('PUB-S', 'مشروع مكتمل', 34, (select id from public.project_types where code = 'productive'), 'traditional', 'producing',
   '{}'::jsonb, null, null, null, 'sold_out'),
  ('PUB-I', 'مشروع داخلي', 34, (select id from public.project_types where code = 'productive'), 'traditional', 'producing',
   '{}'::jsonb, null, null, null, 'internal'),
  ('PUB-D', 'مسودة مشروع', 34, (select id from public.project_types where code = 'productive'), 'traditional', 'producing',
   '{}'::jsonb, null, null, null, 'draft'),
  ('PUB-A', 'مشروع مؤرشف', 34, (select id from public.project_types where code = 'productive'), 'traditional', 'producing',
   '{}'::jsonb, null, null, null, 'archived');

insert into public.project_costs (project_id, kind, label, amount_millimes)
values ((select id from public.projects where code = 'PUB-P'), 'purchase', 'SECRET-COST', 40000000);

-- Is the parcel layer still in the database? Everything about it below is gated on this one answer, so the
-- file keeps its guards for as long as the objects are there and stops asserting them the day they go.
create function pg_temp.parcels_live() returns boolean language sql stable as $$
  select to_regclass('public.parcels') is not null
$$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
end $$;

create function pg_temp.as_user(p_sub text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- Fixture ids are kept in settings rather than looked up, so the helper works under any role:
-- anon cannot read public.parcels, which is exactly what these tests assert.
create function pg_temp.parcel(p_code text) returns uuid language sql stable as $$
  select nullif(current_setting('test.parcel.' || p_code, true), '')::uuid
$$;

-- The parcel fixtures. PL/pgSQL plans a statement the first time it runs, so nothing inside the branch is
-- resolved when the table is gone.
do $$
begin
  if not pg_temp.parcels_live() then return; end if;

  insert into public.parcels (project_id, code, area_m2, property_type, plantation_system, olive_tree_count, tree_age_years,
                              production_status, irrigation, cash_price_millimes, annual_costs_millimes, status, notes, sort_order)
  values
    ((select id from public.projects where code = 'PUB-P'), 'P01', 500, 'planted', 'traditional', 100, 40, 'producing', 'rainfed', 5000000, 120000, 'available', 'SECRET-NOTE', 10),
    ((select id from public.projects where code = 'PUB-P'), 'P02', 600, 'planted', 'traditional', 120, 40, 'producing', 'rainfed', 6000000, 130000, 'interested', null, 20),
    ((select id from public.projects where code = 'PUB-P'), 'P03', 700, 'planted', 'traditional', 140, 40, 'producing', 'rainfed', 7000000, 140000, 'reserved', null, 30),
    ((select id from public.projects where code = 'PUB-P'), 'P04', 800, 'planted', 'traditional', 160, 40, 'producing', 'rainfed', 8000000, 150000, 'sold', null, 40),
    ((select id from public.projects where code = 'PUB-P'), 'P05', 900, 'planted', 'traditional', 180, 40, 'producing', 'rainfed', 9000000, 160000, 'withdrawn', null, 50),
    ((select id from public.projects where code = 'PUB-P'), 'P06', 400, 'bare_land', null, 0, null, 'none', 'rainfed', 0, 50000, 'available', null, 60),
    ((select id from public.projects where code = 'PUB-E'), 'E01', 500, 'planted', 'traditional', 100, 30, 'producing', 'rainfed', 3000000, 100000, 'available', null, 10),
    ((select id from public.projects where code = 'PUB-S'), 'S01', 500, 'planted', 'traditional', 100, 30, 'producing', 'rainfed', 4000000, 100000, 'available', null, 10),
    ((select id from public.projects where code = 'PUB-I'), 'I01', 500, 'planted', 'traditional', 100, 30, 'producing', 'rainfed', 4500000, 100000, 'available', null, 10),
    ((select id from public.projects where code = 'PUB-D'), 'D01', 500, 'planted', 'traditional', 100, 30, 'producing', 'rainfed', 4200000, 100000, 'available', null, 10);

  perform set_config('test.parcel.' || pa.code, pa.id::text, false)
  from public.parcels pa
  join public.projects pj on pj.id = pa.project_id
  where pj.code like 'PUB-%';
end $$;

-- ---------------------------------------------------------------------------
-- T1 · Direct access to the base tables is unchanged (PRJ-03)
-- ---------------------------------------------------------------------------

do $$
declare
  v_parcels boolean := pg_temp.parcels_live();
begin
  perform pg_temp.as_anon();
  begin
    perform 1 from public.projects;
    raise exception 'anon must not read projects';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.trees;
    raise exception 'anon must not read trees';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.project_costs;
    raise exception 'anon must not read project costs';
  exception when insufficient_privilege then null;
  end;
  if v_parcels then
    begin
      perform 1 from public.parcels;
      raise exception 'anon must not read parcels';
    exception when insufficient_privilege then null;
    end;
  end if;
  reset role;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  assert (select count(*) from public.project_costs) = 0, 'a commercial cannot read internal project costs';
  assert (select count(*) from public.projects) > 0, 'a commercial reads projects through RLS';
  reset role;

  assert not has_table_privilege('authenticated', 'public.projects', 'truncate'), 'TRUNCATE revoked on projects';
  assert not has_table_privilege('authenticated', 'public.project_costs', 'truncate'), 'TRUNCATE revoked on project_costs';
  assert not has_table_privilege('anon', 'public.projects', 'truncate'), 'TRUNCATE revoked from anon';
  assert has_table_privilege('authenticated', 'public.projects', 'insert'), 'the Back Office can insert projects';
  assert not has_table_privilege('authenticated', 'public.projects', 'delete'), 'delete stays revoked';

  -- The inventory: staff read the rows, nobody writes except through the security-definer RPCs (0054).
  assert not has_table_privilege('anon', 'public.trees', 'select'), 'a visitor never reads a tree row';
  assert has_table_privilege('authenticated', 'public.trees', 'select'), 'staff read the tree rows';
  assert not has_table_privilege('authenticated', 'public.trees', 'insert')
     and not has_table_privilege('authenticated', 'public.trees', 'update')
     and not has_table_privilege('authenticated', 'public.trees', 'delete')
     and not has_table_privilege('authenticated', 'public.trees', 'truncate'),
    'a tree is written only through staff_generate_trees, staff_allocate_trees and staff_set_tree_state';

  if v_parcels then
    assert not has_table_privilege('authenticated', 'public.parcels', 'truncate'), 'TRUNCATE revoked on parcels';
    assert has_table_privilege('authenticated', 'public.parcels', 'update'), 'the Back Office can update parcels';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- T2 · The write grant works with RLS: Finance writes, a commercial and a visitor do not
-- ---------------------------------------------------------------------------

do $$
declare
  v_parcels boolean := pg_temp.parcels_live();
  v_project uuid;
  v_parcel  uuid;
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  insert into public.projects (code, name, governorate_id) values ('PUB-F', 'مشروع المالية', 34) returning id into v_project;
  assert v_project is not null, 'finance inserts a project';
  if v_parcels then
    insert into public.parcels (project_id, code, area_m2, property_type, cash_price_millimes)
    values (v_project, 'F01', 500, 'bare_land', 1000000) returning id into v_parcel;
    assert v_parcel is not null, 'finance inserts a parcel';
    update public.parcels set cash_price_millimes = 1500000 where id = v_parcel;
    assert found, 'finance updates the cash price';
  end if;
  reset role;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  begin
    insert into public.projects (code, name, governorate_id) values ('PUB-X', 'x', 34);
    raise exception 'a commercial must not insert projects';
  exception when insufficient_privilege then null;
  end;
  if v_parcels then
    begin
      insert into public.parcels (project_id, code, area_m2, property_type, cash_price_millimes)
      values (v_project, 'X01', 500, 'bare_land', 1000000);
      raise exception 'a commercial must not insert parcels';
    exception when insufficient_privilege then null;
    end;
  end if;
  reset role;

  perform pg_temp.as_anon();
  begin
    insert into public.projects (code, name, governorate_id) values ('PUB-Y', 'y', 34);
    raise exception 'anon must not insert projects';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T3 · Function privileges: public RPCs open, helpers and the calculator closed
-- ---------------------------------------------------------------------------

do $$
declare
  v_parcels boolean := pg_temp.parcels_live();
  v_sig  text;
  v_acl  text;
begin
  -- The surface that survives the parcel layer: the listing and the offer's stock.
  foreach v_sig in array array['public.public_projects()', 'public.public_offer_stock(uuid)'] loop
    assert has_function_privilege('anon', v_sig, 'execute'), v_sig || ' is callable by anon';
    assert has_function_privilege('authenticated', v_sig, 'execute'), v_sig || ' is callable by authenticated';
    v_acl := coalesce((select proacl::text from pg_proc where oid = v_sig::regprocedure), '');
    assert v_acl not like '{=X/%' and v_acl not like '%,=X/%', v_sig || ' carries no PUBLIC execute: ' || v_acl;
  end loop;

  if v_parcels then
    foreach v_sig in array array[
      'public.public_parcels()', 'public.public_parcel_offer(uuid, uuid, uuid)', 'public.public_coverage()'
    ] loop
      assert has_function_privilege('anon', v_sig, 'execute'), v_sig || ' is callable by anon';
      assert has_function_privilege('authenticated', v_sig, 'execute'), v_sig || ' is callable by authenticated';
      v_acl := coalesce((select proacl::text from pg_proc where oid = v_sig::regprocedure), '');
      assert v_acl not like '{=X/%' and v_acl not like '%,=X/%', v_sig || ' carries no PUBLIC execute: ' || v_acl;
    end loop;
    assert not has_function_privilege('anon', 'public.staff_parcel_offer(uuid,uuid,uuid)', 'execute'), 'anon cannot call the staff offer';
    assert has_function_privilege('authenticated', 'public.staff_parcel_offer(uuid,uuid,uuid)', 'execute'), 'authenticated can call the staff offer';
  end if;

  assert not has_function_privilege('anon', 'public.compute_installment_plan(bigint,bigint,bigint,jsonb)', 'execute'),
    'anon cannot call the calculator';
  assert has_function_privilege('authenticated', 'public.compute_installment_plan(bigint,bigint,bigint,jsonb)', 'execute'),
    'authenticated still calls the calculator';
  v_acl := coalesce((select proacl::text from pg_proc where oid = 'public.compute_installment_plan(bigint,bigint,bigint,jsonb)'::regprocedure), '');
  assert v_acl not like '{=X/%' and v_acl not like '%,=X/%', 'the calculator carries no PUBLIC execute: ' || v_acl;

  -- The staff reads of the inventory are staff-only, never anon.
  assert not has_function_privilege('anon', 'public.staff_offer_stock(uuid)', 'execute'), 'anon cannot call the staff stock';
  assert not has_function_privilege('anon', 'public.staff_generate_trees(uuid,text)', 'execute'), 'anon cannot number trees';
  assert not has_function_privilege('anon', 'public.staff_allocate_trees(uuid,uuid,uuid,integer,text,text)', 'execute'),
    'anon cannot allocate trees';
  assert not has_function_privilege('anon', 'public.staff_set_tree_state(uuid[],text,text)', 'execute'),
    'anon cannot move a tree between states';

  foreach v_sig in array array[
    'app.flag_state(text)', 'app.module_open(text)', 'app.project_public_statuses()',
    'app.project_visible(public.project_status)', 'app.offer_stock_payload(uuid)'
  ] loop
    assert not has_function_privilege('anon', v_sig, 'execute'), v_sig || ' is closed to anon';
    assert not has_function_privilege('authenticated', v_sig, 'execute'), v_sig || ' is closed to authenticated';
  end loop;

  if v_parcels then
    foreach v_sig in array array[
      'app.parcel_offer_statuses()',
      'app.parcel_offered(public.project_status, public.parcel_status)',
      'app.parcel_visible_status(public.parcel_status)',
      'app.parcel_offer_payload(uuid, uuid, uuid, boolean)'
    ] loop
      assert not has_function_privilege('anon', v_sig, 'execute'), v_sig || ' is closed to anon';
      assert not has_function_privilege('authenticated', v_sig, 'execute'), v_sig || ' is closed to authenticated';
    end loop;
  end if;

  perform pg_temp.as_anon();
  begin
    perform public.compute_installment_plan(1000000, 100000, 50000, '{}'::jsonb);
    raise exception 'anon must not run the calculator';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T4 · The whitelist is in the signature itself
-- ---------------------------------------------------------------------------

do $$
declare
  v_parcels boolean := pg_temp.parcels_live();
begin
  -- Whole words only (\m…\M): «on_tree_pricing» (0035) is a flag, not the pricing formula.
  assert pg_get_function_result('public.public_projects()'::regprocedure)
         !~ '\m(pricing|legal_notes|land_offer|plan_storage|latitude|longitude|updated_by|annual_costs|notes)\M',
    'public_projects() exposes no internal column';

  -- PRJ-03, stated on the signature: the listing publishes one price and one only, the lowest per tree.
  assert (select count(*) from unnest(string_to_array(
            pg_get_function_result('public.public_projects()'::regprocedure), ',')) c
          where c ~ '(millimes|price_)')
         = (case when v_parcels then 2 else 1 end),
    'the listing carries only the per-tree price (and, while parcels live, min_cash_price_millimes): '
    || pg_get_function_result('public.public_projects()'::regprocedure);

  if v_parcels then
    assert pg_get_function_result('public.public_parcels()'::regprocedure)
           !~ '\m(pricing|notes|updated_by|legal|land_offer|latitude|longitude)\M',
      'public_parcels() exposes no internal column';
    assert pg_get_function_result('public.public_coverage()'::regprocedure) !~ 'millimes|price',
      'public_coverage() carries no money';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- T5 · Visibility as a visitor, and the three owner settings
-- ---------------------------------------------------------------------------

do $$
declare
  v_parcels boolean := pg_temp.parcels_live();
  v_codes text[];
  v_p     record;
  v_row   record;
begin
  perform pg_temp.as_anon();

  select array_agg(r.code order by r.code) into v_codes from public.public_projects() r where r.code like 'PUB-%';
  assert v_codes = array['PUB-E', 'PUB-P', 'PUB-S'], 'anon sees exactly the published and closed projects, got ' || coalesce(v_codes::text, 'null');

  select * into v_p from public.public_projects() r where r.code = 'PUB-P';
  assert v_p.offered, 'a published project is offered';
  assert v_p.location_description = 'PUBLIC-LOC', 'the public location text is exposed';

  select * into v_p from public.public_projects() r where r.code = 'PUB-S';
  assert not v_p.offered, 'a closed project is never offered';

  if v_parcels then
    select * into v_p from public.public_projects() r where r.code = 'PUB-P';
    assert v_p.parcels_total = 5, 'withdrawn parcels are not counted, got ' || v_p.parcels_total;
    assert v_p.parcels_offered = 1, 'only priced available parcels are offered by default, got ' || v_p.parcels_offered;
    assert v_p.min_cash_price_millimes = 5000000, 'the lowest offered price, got ' || coalesce(v_p.min_cash_price_millimes::text, 'null');

    select * into v_p from public.public_projects() r where r.code = 'PUB-S';
    assert v_p.parcels_offered = 0 and v_p.min_cash_price_millimes is null,
      'a closed project never prices its parcels even when one is still available';

    select array_agg(r.code order by r.code) into v_codes from public.public_parcels() r where r.project_code = 'PUB-P';
    assert v_codes = array['P01', 'P02', 'P03', 'P04', 'P06'], 'anon sees every non-withdrawn parcel of PUB-P, got ' || coalesce(v_codes::text, 'null');
    assert not exists (select 1 from public.public_parcels() r where r.project_code in ('PUB-D', 'PUB-I', 'PUB-A')),
      'draft, internal and archived parcels are hidden from anon';

    select * into v_row from public.public_parcels() r where r.project_code = 'PUB-P' and r.code = 'P01';
    assert v_row.offered and v_row.cash_price_millimes = 5000000 and v_row.annual_costs_millimes = 120000,
      'an available priced parcel carries its price and yearly costs';
    for v_row in select * from public.public_parcels() r where r.project_code = 'PUB-P' and r.code in ('P02', 'P03', 'P04') loop
      assert not v_row.offered and v_row.cash_price_millimes is null and v_row.annual_costs_millimes is null,
        'taken parcel ' || v_row.code || ' shows no price';
    end loop;
    select * into v_row from public.public_parcels() r where r.project_code = 'PUB-P' and r.code = 'P06';
    assert v_row.offered and v_row.cash_price_millimes is null, 'an unpriced available parcel is offered without a price';
    select * into v_row from public.public_parcels() r where r.project_code = 'PUB-S';
    assert not v_row.offered and v_row.cash_price_millimes is null, 'a parcel of a closed project is listed without a price';
  end if;

  reset role;

  if v_parcels then
    -- projects.show_taken_parcels = false hides the taken rows only
    update public.settings set value = to_jsonb(false) where key = 'projects.show_taken_parcels';
    perform pg_temp.as_anon();
    select array_agg(r.code order by r.code) into v_codes from public.public_parcels() r where r.project_code = 'PUB-P';
    assert v_codes = array['P01', 'P06'], 'without show_taken_parcels only offered parcels remain, got ' || coalesce(v_codes::text, 'null');
    reset role;
    update public.settings set value = to_jsonb(true) where key = 'projects.show_taken_parcels';
  end if;

  -- projects.list_closed = false hides closed projects (and, while they exist, their parcels)
  update public.settings set value = to_jsonb(false) where key = 'projects.list_closed';
  perform pg_temp.as_anon();
  select array_agg(r.code order by r.code) into v_codes from public.public_projects() r where r.code like 'PUB-%';
  assert v_codes = array['PUB-E', 'PUB-P'], 'without list_closed the sold-out project disappears, got ' || coalesce(v_codes::text, 'null');
  if v_parcels then
    assert not exists (select 1 from public.public_parcels() r where r.project_code = 'PUB-S'), 'and so do its parcels';
  end if;
  reset role;
  update public.settings set value = to_jsonb(true) where key = 'projects.list_closed';

  if v_parcels then
    -- projects.offer_includes_interested = true (D-15) prices the interested parcel again
    update public.settings set value = to_jsonb(true) where key = 'projects.offer_includes_interested';
    perform pg_temp.as_anon();
    select * into v_row from public.public_parcels() r where r.project_code = 'PUB-P' and r.code = 'P02';
    assert v_row.offered and v_row.cash_price_millimes = 6000000, 'with D-15 on, an interested parcel is offered';
    select * into v_p from public.public_projects() r where r.code = 'PUB-P';
    assert v_p.parcels_offered = 2, 'with D-15 on, PUB-P offers two parcels, got ' || v_p.parcels_offered;
    reset role;
    update public.settings set value = to_jsonb(false) where key = 'projects.offer_includes_interested';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- T6 · Listing bound and text scan of every public row
-- ---------------------------------------------------------------------------

do $$
declare
  v_parcels boolean := pg_temp.parcels_live();
  v_text text;
  v_bad  text[] := array['SECRET-LEGAL', 'SECRET-COST', 'SECRET-NOTE', 'markup', 'brackets', 'monthly_rate', 'min_down_pct'];
  v_keys text[] := array['pricing', 'legal_notes', 'notes', 'land_offer_id', 'plan_storage_path', 'latitude', 'longitude', 'updated_by'];
  v_word text;
begin
  if v_parcels then
    update public.settings set value = to_jsonb(20) where key = 'projects.listing_limit';
    perform pg_temp.as_anon();
    assert (select count(*) from public.public_parcels()) <= 20, 'the listing limit is enforced in SQL';
    reset role;
    update public.settings set value = to_jsonb(300) where key = 'projects.listing_limit';
  end if;

  perform pg_temp.as_anon();
  v_text := coalesce((select string_agg(to_jsonb(r)::text, '') from public.public_projects() r), '');
  if v_parcels then
    v_text := v_text || coalesce((select string_agg(to_jsonb(r)::text, '') from public.public_parcels() r), '');
    v_text := v_text || coalesce((select string_agg(to_jsonb(r)::text, '') from public.public_coverage() r), '');
  end if;
  assert length(v_text) > 0, 'the listings return rows';
  foreach v_word in array v_bad loop
    assert position(v_word in v_text) = 0, 'public rows must not contain ' || v_word;
  end loop;
  assert not exists (select 1 from public.public_projects() r where to_jsonb(r) ?| v_keys), 'public_projects() has no internal key';
  if v_parcels then
    assert not exists (select 1 from public.public_parcels() r where to_jsonb(r) ?| v_keys), 'public_parcels() has no internal key';
    assert not exists (select 1 from public.public_coverage() r where to_jsonb(r) ?| v_keys), 'public_coverage() has no internal key';
  end if;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T7 · The projects flag gates everything (FLAG-01..03)
-- ---------------------------------------------------------------------------

do $$
declare
  v_parcels boolean := pg_temp.parcels_live();
  v_pub     uuid := (select id from public.projects where code = 'PUB-P');
  v_int     uuid := (select id from public.projects where code = 'PUB-I');
  v_codes   text[];
begin
  -- disabled: nobody sees anything
  update public.feature_flags set state = 'disabled' where key = 'projects';
  perform pg_temp.as_anon();
  assert (select count(*) from public.public_projects()) = 0, 'disabled: anon gets no project';
  assert public.public_offer_stock(v_pub) is null, 'disabled: anon gets no stock';
  if v_parcels then
    assert (select count(*) from public.public_parcels()) = 0, 'disabled: anon gets no parcel';
    assert (select count(*) from public.public_coverage()) = 0, 'disabled: anon gets no coverage';
    assert public.public_parcel_offer(pg_temp.parcel('P01')) is null, 'disabled: anon gets no offer';
  end if;
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  assert (select count(*) from public.public_projects()) = 0, 'disabled: staff get no project';
  assert public.public_offer_stock(v_pub) is null, 'disabled: staff get no stock';
  if v_parcels then
    assert (select count(*) from public.public_parcels()) = 0, 'disabled: staff get no parcel';
    assert (select count(*) from public.public_coverage()) = 0, 'disabled: staff get no coverage';
    assert public.public_parcel_offer(pg_temp.parcel('P01')) is null, 'disabled: staff get no offer';
  end if;
  reset role;

  -- internal: staff preview, visitors nothing
  update public.feature_flags set state = 'internal' where key = 'projects';
  perform pg_temp.as_anon();
  assert (select count(*) from public.public_projects()) = 0, 'internal: anon gets no project';
  assert public.public_offer_stock(v_pub) is null, 'internal: anon gets no stock';
  if v_parcels then
    assert (select count(*) from public.public_parcels()) = 0, 'internal: anon gets no parcel';
    assert public.public_parcel_offer(pg_temp.parcel('P01')) is null, 'internal: anon gets no offer';
    assert public.public_parcel_offer(pg_temp.parcel('I01')) is null, 'internal: anon gets no offer on an internal project';
  end if;
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  select array_agg(r.code order by r.code) into v_codes from public.public_projects() r where r.code like 'PUB-%';
  assert v_codes = array['PUB-E', 'PUB-I', 'PUB-P', 'PUB-S'], 'internal: staff preview adds the internal project, got ' || coalesce(v_codes::text, 'null');
  assert public.public_offer_stock(v_int) is not null, 'internal: staff preview the stock of an internal offer';
  if v_parcels then
    assert public.public_parcel_offer(pg_temp.parcel('I01')) is not null, 'internal: staff get the offer of an internal parcel';
    assert public.public_parcel_offer(pg_temp.parcel('D01')) is null, 'internal: a draft parcel stays hidden even from staff';
  end if;
  reset role;

  -- public: visitors see the public set, staff additionally the internal project
  update public.feature_flags set state = 'public' where key = 'projects';
  perform pg_temp.as_anon();
  select array_agg(r.code order by r.code) into v_codes from public.public_projects() r where r.code like 'PUB-%';
  assert v_codes = array['PUB-E', 'PUB-P', 'PUB-S'], 'public: anon sees the three, got ' || coalesce(v_codes::text, 'null');
  assert public.public_offer_stock(v_int) is null, 'public: anon never reads the stock of an internal offer';
  if v_parcels then
    assert public.public_parcel_offer(pg_temp.parcel('I01')) is null, 'public: anon never sees an internal parcel';
  end if;
  reset role;
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
  select array_agg(r.code order by r.code) into v_codes from public.public_projects() r where r.code like 'PUB-%';
  assert v_codes = array['PUB-E', 'PUB-I', 'PUB-P', 'PUB-S'], 'public: staff additionally see the internal project, got ' || coalesce(v_codes::text, 'null');
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T8 · The parcel offer payload as a visitor (SIM-05, SIM-08, PRN-01, PRJ-03)
-- ---------------------------------------------------------------------------

do $$
begin
  if not pg_temp.parcels_live() then return; end if;
  perform set_config('test.dp_1000', (select id::text from public.option_items where list_key = 'down_payment' and code = 'dp_1000'), true);
  perform set_config('test.mi_80', (select id::text from public.option_items where list_key = 'monthly_installment' and code = 'mi_80'), true);
  perform set_config('test.expected_plan',
    public.compute_installment_plan(5000000, 1000000, 80000, app.parcel_pricing(pg_temp.parcel('P01')))::text, true);
  perform set_config('test.n_down', (select count(*)::text from public.option_items where list_key = 'down_payment' and is_active and min_millimes is not null), true);
  perform set_config('test.n_inst', (select count(*)::text from public.option_items where list_key = 'monthly_installment' and is_active and min_millimes is not null), true);
  perform set_config('test.min_down', (select min(min_millimes)::text from public.option_items where list_key = 'down_payment' and is_active and min_millimes is not null), true);
  perform set_config('test.first_down', (select id::text from public.option_items where list_key = 'down_payment' and is_active and min_millimes is not null order by min_millimes, sort_order limit 1), true);
  perform set_config('test.examples_max', app.setting_int('projects.installment_examples', 3)::text, true);
  perform set_config('test.trees_100', (select id::text from public.option_items where list_key = 'tree_count' and code = 'trees_100'), true);
  perform set_config('test.big_productive', (select id::text from public.ownership_scenarios where code = 'big_productive'), true);
end $$;

do $$
declare
  o        jsonb;
  e        jsonb;
  v_plan   jsonb;
  v_exp    jsonb;
  v_word   text;
  v_first  uuid;
  v_nearest uuid;
begin
  if not pg_temp.parcels_live() then return; end if;
  v_exp   := current_setting('test.expected_plan')::jsonb;
  v_first := current_setting('test.first_down')::uuid;

  perform pg_temp.as_anon();

  o := public.public_parcel_offer(pg_temp.parcel('P01'));
  assert o is not null, 'the offer of an available parcel exists';
  assert (o->>'offered')::boolean and (o->>'priced')::boolean, 'P01 is offered and priced: ' || o::text;
  assert (o->>'cash_price_millimes')::bigint = 5000000, 'the cash price is the parcel price';
  assert (o->>'annual_costs_millimes')::bigint = 120000, 'the yearly costs are exposed (a cost, never a return)';
  assert (o->>'down_from_millimes')::bigint = current_setting('test.min_down')::bigint, 'the down payment starts at the smallest option';
  assert jsonb_array_length(o->'down_options') = current_setting('test.n_down')::integer, 'every priced down option is listed';
  assert jsonb_array_length(o->'installment_options') = current_setting('test.n_inst')::integer, 'every priced installment option is listed';
  assert jsonb_array_length(o->'plans') = current_setting('test.n_down')::integer * current_setting('test.n_inst')::integer,
    'the plan matrix covers every down × installment pair';
  assert jsonb_array_length(o->'examples') between 1 and current_setting('test.examples_max')::integer,
    'between one and projects.installment_examples worked examples, got ' || jsonb_array_length(o->'examples');
  assert (o->>'examples_max')::integer = current_setting('test.examples_max')::integer, 'examples_max mirrors the setting';
  assert o->'entry' = o->'examples'->0, 'the entry line is the first example';

  for e in select * from jsonb_array_elements(o->'examples') loop
    assert (e->>'ok')::boolean, 'every example is a valid plan: ' || e::text;
    assert (e->>'months')::integer > 0, 'every example has months';
    assert (e->>'total_millimes')::bigint >= 5000000, 'the total is never below the cash price';
    assert (e->>'last_installment_millimes')::bigint > 0
       and (e->>'last_installment_millimes')::bigint <= (e->>'installment_millimes')::bigint,
      'the last installment is within one installment: ' || e::text;
    assert (e->>'down_option_id')::uuid = v_first, 'examples use the smallest down payment';
  end loop;

  -- Nothing about the formula leaves Postgres, and no promise of return (PRN-01)
  foreach v_word in array array['markup_pct', 'max_months', '"model"', 'brackets', 'monthly_rate', 'pricing', 'SECRET',
                                'min_down_pct', 'مردود', 'ربح', 'عائد', 'yield', 'return'] loop
    assert position(v_word in o::text) = 0, 'the offer must not contain ' || v_word;
  end loop;

  -- The matrix element equals the calculator run by the owner
  select p into v_plan from jsonb_array_elements(o->'plans') p
  where (p->>'down_option_id')::uuid = current_setting('test.dp_1000')::uuid
    and (p->>'installment_option_id')::uuid = current_setting('test.mi_80')::uuid;
  assert v_plan is not null, 'the (dp_1000, mi_80) element exists';
  assert (v_exp->>'ok')::boolean, 'the reference plan is valid: ' || v_exp::text;
  assert v_plan->>'months' = v_exp->>'months'
     and v_plan->>'total_millimes' = v_exp->>'total_millimes'
     and v_plan->>'last_installment_millimes' = v_exp->>'last_installment_millimes',
    'the matrix mirrors compute_installment_plan: ' || v_plan::text || ' vs ' || v_exp::text;

  -- The visitor's own choice (SIM-05 nearest hints)
  o := public.public_parcel_offer(pg_temp.parcel('P01'), current_setting('test.dp_1000')::uuid, current_setting('test.mi_80')::uuid);
  assert o->'chosen' is not null and o->'chosen' <> 'null'::jsonb, 'a chosen pair returns a plan';
  assert o->'chosen'->>'months' = v_exp->>'months'
     and o->'chosen'->>'total_millimes' = v_exp->>'total_millimes'
     and o->'chosen'->>'last_installment_millimes' = v_exp->>'last_installment_millimes', 'chosen carries the plan figures';
  assert o->'chosen' ? 'nearest_installment_option_id' and o->'chosen' ? 'nearest_down_option_id', 'chosen carries the nearest hints';
  assert (o->'chosen'->>'nearest_installment_option_id')::uuid = current_setting('test.mi_80')::uuid
      or (o->'chosen'->>'nearest_installment_option_id')::uuid is not null, 'a nearest installment exists for a valid down payment';

  begin
    perform public.public_parcel_offer(pg_temp.parcel('P01'), gen_random_uuid(), current_setting('test.mi_80')::uuid);
    raise exception 'an unknown option must be refused';
  exception when others then
    if sqlerrm <> 'invalid_choice' then raise exception 'expected invalid_choice but got "%"', sqlerrm; end if;
  end;

  -- A failing pair carries a reason and the smallest ok installment for that down payment
  o := public.public_parcel_offer(pg_temp.parcel('P01'));
  select p into v_plan from jsonb_array_elements(o->'plans') p where not (p->>'ok')::boolean
  order by (p->>'down_millimes')::bigint, (p->>'installment_millimes')::bigint limit 1;
  if v_plan is not null then
    assert v_plan ? 'reason', 'a failed plan explains why: ' || v_plan::text;
    select (p->>'installment_option_id')::uuid into v_nearest from jsonb_array_elements(o->'plans') p
    where (p->>'ok')::boolean and p->>'down_option_id' = v_plan->>'down_option_id'
    order by (p->>'installment_millimes')::bigint limit 1;
    e := (public.public_parcel_offer(pg_temp.parcel('P01'), (v_plan->>'down_option_id')::uuid, (v_plan->>'installment_option_id')::uuid))->'chosen';
    assert not (e->>'ok')::boolean and e ? 'reason', 'the chosen failing pair carries its reason: ' || e::text;
    assert (e->>'nearest_installment_option_id')::uuid is not distinct from v_nearest,
      'the nearest installment is the smallest ok one for that down payment: ' || e::text;
  end if;

  -- Taken, unpriced, withdrawn and hidden parcels
  o := public.public_parcel_offer(pg_temp.parcel('P03'));
  assert o is not null and not (o->>'offered')::boolean and o->'cash_price_millimes' = 'null'::jsonb
     and o->'plans' = '[]'::jsonb and o->'examples' = '[]'::jsonb, 'a reserved parcel answers without a price: ' || o::text;
  o := public.public_parcel_offer(pg_temp.parcel('P06'));
  assert (o->>'offered')::boolean and not (o->>'priced')::boolean and o->'cash_price_millimes' = 'null'::jsonb
     and o->'examples' = '[]'::jsonb, 'an unpriced parcel is offered without figures: ' || o::text;
  assert o->'suggested_tree_count_option_id' = 'null'::jsonb, 'bare land suggests no tree count';
  assert public.public_parcel_offer(pg_temp.parcel('P05')) is null, 'a withdrawn parcel is not found';
  assert public.public_parcel_offer(pg_temp.parcel('D01')) is null, 'a draft project parcel is not found';
  assert public.public_parcel_offer(gen_random_uuid()) is null, 'an unknown parcel is not found';

  -- pricing.default fallback
  o := public.public_parcel_offer(pg_temp.parcel('E01'));
  assert jsonb_array_length(o->'examples') >= 1, 'a project without its own formula falls back to pricing.default: ' || o::text;

  -- Continuity with the home chooser
  o := public.public_parcel_offer(pg_temp.parcel('P01'));
  assert (o->>'suggested_tree_count_option_id')::uuid = current_setting('test.trees_100')::uuid,
    'the suggested tree count is the option containing the parcel''s own tree count';
  assert (o->>'suggested_scenario_id')::uuid = current_setting('test.big_productive')::uuid,
    'the suggested scenario matches the parcel''s type, plantation and production';

  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T9 · The staff parcel offer: no flag or status gate, staff only
-- ---------------------------------------------------------------------------

do $$
declare
  o jsonb;
begin
  if not pg_temp.parcels_live() then return; end if;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  o := public.staff_parcel_offer(pg_temp.parcel('D01'));
  assert o is not null, 'finance gets the offer of a draft parcel';
  assert not (o->>'offered')::boolean, 'a draft parcel is not offered';
  assert (o->>'priced')::boolean and jsonb_array_length(o->'plans') > 0, 'but the admin card still gets its numbers: ' || o::text;
  assert position('markup_pct' in o::text) = 0 and position('"model"' in o::text) = 0, 'the staff payload strips the formula too';
  reset role;

  perform pg_temp.as_anon();
  begin
    perform public.staff_parcel_offer(pg_temp.parcel('D01'));
    raise exception 'anon must not call the staff offer';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
  begin
    perform public.staff_parcel_offer(pg_temp.parcel('D01'));
    raise exception 'a client must not call the staff offer';
  exception when insufficient_privilege then
    if sqlerrm <> 'forbidden' then raise exception 'expected forbidden but got "%"', sqlerrm; end if;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T10 · Coverage per governorate: counts only
-- ---------------------------------------------------------------------------

do $$
declare
  v_row record;
  v_projects integer;
  v_offered  integer;
  v_exp_projects integer;
  v_exp_offered  integer;
begin
  if not pg_temp.parcels_live() then return; end if;

  select count(*) into v_exp_projects from public.projects pj
  where pj.governorate_id = 34 and pj.status in ('published', 'sold_out', 'operating');
  select count(*) into v_exp_offered from public.parcels pa join public.projects pj on pj.id = pa.project_id
  where pj.governorate_id = 34 and pj.status = 'published' and pa.status = 'available' and pa.cash_price_millimes > 0;

  perform pg_temp.as_anon();
  select * into v_row from public.public_coverage() r where r.governorate_id = 34;
  assert v_row is not null, 'governorate 34 has coverage';
  assert v_row.projects_count = v_exp_projects,
    'projects_count counts the public projects of the governorate, got ' || v_row.projects_count;
  assert v_row.projects_count >= 3, 'the three fixture projects are counted';
  assert v_row.parcels_offered = v_exp_offered,
    'parcels_offered counts priced available parcels of published projects, got ' || v_row.parcels_offered;
  assert v_row.parcels_offered >= 2, 'P01 and E01 are offered';
  assert (to_jsonb(v_row) - 'governorate_id' - 'projects_count' - 'parcels_total' - 'parcels_offered') = '{}'::jsonb,
    'the coverage row carries the four counters only: ' || to_jsonb(v_row)::text;
  v_projects := v_row.projects_count;
  v_offered  := v_row.parcels_offered;
  reset role;

  update public.projects set status = 'draft' where code = 'PUB-P';
  perform pg_temp.as_anon();
  select * into v_row from public.public_coverage() r where r.governorate_id = 34;
  assert v_row.projects_count = v_projects - 1, 'a project taken off the public set leaves the count';
  assert v_row.parcels_offered = v_offered - 1, 'and its offered parcel leaves the count';
  reset role;
  update public.projects set status = 'published' where code = 'PUB-P';
end $$;

-- ---------------------------------------------------------------------------
-- T11 · The offer's stock: PRJ-03, stock is a fact and price is a permission
-- ---------------------------------------------------------------------------
-- The figure the catalogue and the offer page came for — how many زيتونة are still متاحة — is a count of
-- public.trees rows. It is gated on the `projects` module alone (T7), never on `pricing`: a visitor is
-- allowed to know an offer is sold out while prices are closed. This section is what carries PRJ-03 for the
-- surface that survives the parcel layer.

do $$
declare
  v_id     uuid;
  v_bare   uuid := (select id from public.projects where code = 'PUB-E');
  v_reason text := 'اختبار السطح العمومي: ترقيم زيتونات عرض التجربة';
  v_stock  jsonb;
  v_p      record;
  v_key    text;
begin
  -- An offer that sells three trees at a time, numbered.
  insert into public.projects (code, name, governorate_id, status, tree_count, min_trees_per_order)
  values ('PUB-T', 'عرض اختبار المخزون', 34, 'published', 12, 3) returning id into v_id;
  perform set_config('test.pub_t', v_id::text, true);

  update public.settings set value = to_jsonb('{offer}-{seq}'::text) where key = 'offers.tree_code_pattern';
  update public.settings set value = to_jsonb(4)                     where key = 'offers.tree_code_digits';

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
  perform public.staff_generate_trees(v_id, v_reason);
  reset role;

  update public.trees set state = 'reserved', held_by = null, allocated_at = now()
  where false;  -- states are moved only through the RPCs; the raw update stays unreachable on purpose

  perform pg_temp.as_anon();
  v_stock := public.public_offer_stock(v_id);
  assert v_stock is not null, 'a visitor reads the stock of a published offer';
  assert (v_stock->>'trees_total')::integer = 12
     and (v_stock->>'trees_available')::integer = 12
     and (v_stock->>'trees_reserved')::integer = 0
     and (v_stock->>'trees_sold')::integer = 0,
    'the four counts are counts of rows: ' || v_stock::text;
  assert (v_stock->>'trees_declared')::integer = 12 and v_stock->>'status' = 'ok',
    'the declared number and the rows agree: ' || v_stock::text;
  assert (v_stock->>'min_trees')::integer = 3, 'the offer''s own minimum is published with its stock';

  -- PRJ-03: not one key of the stock names money, and no amount is anywhere in the payload.
  foreach v_key in array array(select jsonb_object_keys(v_stock)) loop
    assert v_key !~* '(millime|price|cost|amount|dinar|prix|montant)',
      'the stock payload carries a money key: ' || v_key;
  end loop;
  assert v_stock::text !~ '\m(pricing|markup|brackets|cash_price|annual_costs)\M',
    'the stock payload carries no formula and no cost: ' || v_stock::text;
  reset role;

  -- Price is a permission: close `pricing` and the listing's per-tree price disappears while the count stays.
  update public.feature_flags set state = 'disabled' where key = 'pricing';
  perform pg_temp.as_anon();
  select * into v_p from public.public_projects() r where r.code = 'PUB-T';
  assert v_p.min_price_per_tree_millimes is null, 'with pricing closed the listing publishes no price';
  v_stock := public.public_offer_stock(v_id);
  assert v_stock is not null and (v_stock->>'trees_available')::integer = 12,
    'but the stock is still readable: a count is not a price (PRJ-03)';
  reset role;
  update public.feature_flags set state = 'public' where key = 'pricing';

  -- An offer whose trees were never numbered says so, instead of claiming it is sold out.
  perform pg_temp.as_anon();
  v_stock := public.public_offer_stock(v_bare);
  assert v_stock->>'status' = 'not_generated' and (v_stock->>'trees_total')::integer = 0,
    'an offer with no numbered trees reports «not_generated», never «0 متاحة»: ' || v_stock::text;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- T13 · Settings are seeded with the expected type and visibility
-- ---------------------------------------------------------------------------
-- The list is the copy the public pages actually read today. The eleven parcel rows that used to be here
-- went with supabase/pending/bb_02_parcel_copy_retires.sql, and the second block is what keeps them gone.

do $$
declare
  v_public_text text[] := array[
    'projects.title', 'projects.intro', 'projects.filters_hint', 'projects.empty_text', 'projects.open_title',
    'projects.closed_title', 'projects.price_pending', 'projects.map_title', 'projects.map_text',
    'projects.map_empty_governorate', 'projects.meta_description', 'legal.plan_notice',
    -- The offer surface (0049, 0054): its form, its stock and the smallest basket it sells.
    'offers.title', 'offers.form_title', 'offers.trees_label', 'offers.submit_label',
    'offers.success_title', 'offers.success_text', 'offers.min_trees_hint',
    'offers.stock_title', 'offers.stock_total_label', 'offers.stock_available_label',
    'offers.stock_reserved_label', 'offers.stock_sold_label'
  ];
  v_retired text[] := array[
    'projects.detail_parcels_title', 'projects.taken_hint', 'projects.taken_text', 'projects.taken_cta',
    'projects.examples_title', 'projects.examples_note', 'projects.picker_title', 'projects.picker_nearest',
    'projects.parcel_cta', 'projects.interest_banner', 'projects.browse_cta', 'projects.interest_marks_parcel',
    'site.parcel_examples', 'site.parcels_text', 'site.parcels_title'
  ];
  v_found bigint;
  v_left  text;
begin
  select count(*) into v_found from public.settings s
  where s.key = any (v_public_text) and s.value_type = 'text' and s.is_public;
  assert v_found = cardinality(v_public_text),
    'every public copy setting exists as public text: expected ' || cardinality(v_public_text) || ', got ' || v_found;
  assert (select group_key from public.settings where key = 'legal.plan_notice') = 'legal', 'legal.plan_notice is in the legal group';

  select string_agg(s.key, ', ' order by s.key) into v_left
  from public.settings s where s.key = any (v_retired);
  assert v_left is null,
    'the Back Office still offers knobs for the retired parcel screens — apply '
    'supabase/pending/bb_02_parcel_copy_retires.sql: ' || coalesce(v_left, '');

  assert exists (select 1 from public.settings where key = 'projects.installment_examples' and value_type = 'integer' and is_public),
    'projects.installment_examples is a public integer';
  assert exists (select 1 from public.settings where key = 'projects.list_closed' and value_type = 'boolean' and is_public),
    'projects.list_closed is a public boolean';
  assert app.setting_int('projects.installment_examples', 0) between 1 and 5, 'the examples count is within range';

  -- The smallest basket an offer sells is a setting, never a number in the code (0054).
  assert exists (select 1 from public.settings where key = 'offers.min_trees_default' and value_type = 'integer' and is_public),
    'offers.min_trees_default is a public integer';
  assert app.setting_int('offers.min_trees_default', 0) >= 1, 'the default minimum is at least one olive tree';
  -- How a tree is numbered is internal: a visitor has no business reading the pattern.
  assert (select count(*) from public.settings s
          where s.key in ('offers.tree_code_pattern', 'offers.tree_code_digits') and not s.is_public) = 2,
    'the numbering pattern stays off the public site';

  if pg_temp.parcels_live() then
    assert exists (select 1 from public.settings where key = 'projects.listing_limit' and value_type = 'integer' and is_public),
      'projects.listing_limit is a public integer while public_parcels() still reads it';
    assert exists (select 1 from public.settings where key = 'projects.show_taken_parcels' and value_type = 'boolean' and is_public),
      'projects.show_taken_parcels is a public boolean while app.parcel_visible_status() still reads it';
    assert exists (select 1 from public.settings where key = 'projects.offer_includes_interested' and value_type = 'boolean' and not is_public),
      'projects.offer_includes_interested is a private boolean while app.parcel_offer_statuses() still reads it';
    assert app.setting_bool('projects.offer_includes_interested', true) = false, 'interested parcels are not offered by default';
    assert app.setting_int('projects.listing_limit', 0) between 20 and 1000, 'the listing limit is within range';
  else
    select string_agg(s.key, ', ' order by s.key) into v_left
    from public.settings s
    where s.key in ('projects.listing_limit', 'projects.show_taken_parcels', 'projects.offer_includes_interested');
    assert v_left is null, 'these rows lost their readers with the parcel layer and go with it: ' || coalesce(v_left, '');
  end if;
end $$;
