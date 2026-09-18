-- The yearly care of a tree: one global figure, any offer may carry its own, and it never joins the price.
-- Owner 2026-09-18 («المعاليم السنوية للزيتونة الوحدة متغيرة حسب الزيتونة»); spec MIL-02, PRN-01, PRN-02.
--
-- Runs against the live database: fixtures with unused codes, the global pricing row pinned inside this
-- rolled-back transaction, and nothing written outside it.

create function pg_temp.af_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: a global rule with a known fee, one offer that keeps it, one that sets its own
-- ---------------------------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  update public.feature_flags set state = 'public' where key = 'pricing';

  update public.tree_pricing_rules
  set land_price_per_m2_millimes = 7000, planting_cost_per_tree_millimes = 50000,
      margin_mode = 'percent', margin_percent_bp = 1000, margin_fixed_millimes = null,
      price_rounding_millimes = 1000, monthly_rounding_millimes = 1000,
      annual_fee_per_tree_millimes = 150000
  where project_id is null;
  delete from public.tree_cost_items where project_id is null;

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true where code = 'trad_wide_24x24';
  update public.tree_spacing_classes set row_spacing_m = 7, tree_spacing_m = 7, is_active = true where code = 'int_7x7';
  perform set_config('test.af_24', (select id::text from public.tree_spacing_classes where code = 'trad_wide_24x24'), true);
  perform set_config('test.af_7', (select id::text from public.tree_spacing_classes where code = 'int_7x7'), true);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('annual-fee-test-' || gen_random_uuid(), 'عرض يرث المعاليم', 34, 'published', 100) returning id into v_id;
  perform set_config('test.af_inherits', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, current_setting('test.af_24')::uuid);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('annual-fee-test-' || gen_random_uuid(), 'عرض بمعاليمه', 34, 'published', 500) returning id into v_id;
  perform set_config('test.af_own', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id)
  values (v_id, current_setting('test.af_7')::uuid);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes, annual_fee_per_tree_millimes)
  values (v_id, 8000, 20000, 90000);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The engine resolves the fee like the rest of the rule, and says where it came from
-- ---------------------------------------------------------------------------

do $$
declare
  v_global jsonb := app.tree_price(current_setting('test.af_24')::uuid);
  v_offer  jsonb := app.tree_price(current_setting('test.af_7')::uuid, current_setting('test.af_own')::uuid);
begin
  assert (v_global->>'annual_fee_per_tree_millimes')::bigint = 150000,
    'an offer without its own fee inherits 150 د, got ' || coalesce(v_global->>'annual_fee_per_tree_millimes', 'null');
  assert v_global#>>'{sources,annual_fee}' = 'global', 'and says the figure came from the global rule';

  assert (v_offer->>'annual_fee_per_tree_millimes')::bigint = 90000,
    'an offer with its own fee keeps it, got ' || coalesce(v_offer->>'annual_fee_per_tree_millimes', 'null');
  assert v_offer#>>'{sources,annual_fee}' = 'project', 'and says the figure came from the offer';

  -- The fee is not part of what the tree costs: 576 m² × 7 د + 50 د, +10% = 4,491 د, fee excluded.
  assert (v_global->>'price_per_tree_millimes')::bigint = 4491000,
    'the yearly fee never joins the purchase price, got ' || (v_global->>'price_per_tree_millimes');
  -- 49 m² × 8 د + 20 د = 412 د, +10% = 453.2 د → 454 د
  assert (v_offer->>'price_per_tree_millimes')::bigint = 454000,
    'the offer price follows its own rates, got ' || (v_offer->>'price_per_tree_millimes');
end $$;

-- ---------------------------------------------------------------------------
-- 2 · A visitor reads the yearly figure beside the price, for the trees chosen
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
begin
  set local role anon;
  v := public.public_tree_quote(current_setting('test.af_24')::uuid, 10, 'cash');
  reset role;

  assert (v->>'annual_fee_per_tree_millimes')::bigint = 150000,
    'the quote carries the yearly fee per tree, got ' || coalesce(v->>'annual_fee_per_tree_millimes', 'null');
  assert (v->>'annual_fee_total_millimes')::bigint = 1500000,
    '10 trees cost 1,500 د a year, got ' || coalesce(v->>'annual_fee_total_millimes', 'null');
  assert (v->>'total_price_millimes')::bigint = 44910000,
    'and the purchase total stays 10 × 4,491 د, got ' || coalesce(v->>'total_price_millimes', 'null');
end $$;

-- With prices closed, the yearly figure is closed too: it is commercial information like the rest.
do $$
declare
  v jsonb;
begin
  update public.feature_flags set state = 'internal' where key = 'pricing';
  set local role anon;
  v := public.public_tree_quote(current_setting('test.af_24')::uuid, 10, 'cash');
  reset role;
  update public.feature_flags set state = 'public' where key = 'pricing';

  assert v->>'pricing' = 'closed' and v->>'annual_fee_per_tree_millimes' is null and v->>'annual_fee_total_millimes' is null,
    'a visitor who may not see prices sees no yearly fee either, got ' || v::text;
  assert (v->>'total_area_m2')::numeric = 5760, 'the areas stay visible, got ' || v::text;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · A parcel carries the fee for its own trees
-- ---------------------------------------------------------------------------

do $$
declare
  v_parcel uuid;
  v        jsonb;
begin
  insert into public.parcels (project_id, code, area_m2, property_type, olive_tree_count, cash_price_millimes, spacing_class_id)
  values (current_setting('test.af_own')::uuid, 'AF1', 490, 'planted', 10, 0, current_setting('test.af_7')::uuid)
  returning id into v_parcel;

  v := app.parcel_price(v_parcel);
  assert v->>'pricing' = 'ok', 'the parcel is priced, got ' || v::text;
  assert (v->>'annual_fee_per_tree_millimes')::bigint = 90000 and (v->>'annual_fee_total_millimes')::bigint = 900000,
    '10 trees of that offer cost 900 د a year, got ' || v::text;
  assert (v->>'cash_total_millimes')::bigint = 4540000, 'and 4,540 د once, got ' || v::text;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Privileges and limits
-- ---------------------------------------------------------------------------

do $$
begin
  assert not has_function_privilege('anon', 'app.tree_price(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.parcel_price(uuid)', 'execute'),
    'the engine stays closed to the API roles';
  assert has_function_privilege('anon', 'public.public_tree_quote(uuid, integer, text, uuid, uuid)', 'execute'),
    'visitors still read the public quote';

  -- A negative fee is refused by the column itself.
  perform pg_temp.af_expect(
    format('update public.tree_pricing_rules set annual_fee_per_tree_millimes = -1 where project_id = %L',
           current_setting('test.af_own')),
    'new row for relation "tree_pricing_rules" violates check constraint "tree_pricing_rules_annual_fee_per_tree_millimes_check"');
end $$;
