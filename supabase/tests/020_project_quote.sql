-- Project quote and parcel price on tree pricing: parcel classes, the guard on project classes, the public quote's
-- gates and key whitelist, and the staff twin. Plan docs/plan-zitouna.md P5-2, Q-9, Q-13; 0020 published-only rule.
--
-- Runs against the live database: fresh users, fixture projects with unused codes, and every pricing input this file
-- measures (global rule, cost lines, markups, percentages, durations, classes, flags) pinned inside the rolled-back
-- transaction.

select set_config('test.pq_reason', rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 5)), '.'), true)
from (values ('ضبط فئات المشروع في الاختبار')) as t (s);

create function pg_temp.pq_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- Fixture ids live in settings so the helper works under any role.
create function pg_temp.pq_id(p_name text) returns uuid language sql stable as $$
  select nullif(current_setting('test.pq.' || p_name, true), '')::uuid
$$;

-- Every key of a payload, at any depth
create function pg_temp.pq_keys(p jsonb) returns text[] language plpgsql immutable as $$
declare
  v_keys text[] := '{}';
  v_key  text;
  v_val  jsonb;
begin
  if jsonb_typeof(p) = 'object' then
    for v_key, v_val in select e.key, e.value from jsonb_each(p) e loop
      v_keys := v_keys || v_key || pg_temp.pq_keys(v_val);
    end loop;
  elsif jsonb_typeof(p) = 'array' then
    for v_val in select e.value from jsonb_array_elements(p) e loop
      v_keys := v_keys || pg_temp.pq_keys(v_val);
    end loop;
  end if;
  return v_keys;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

do $$
declare
  v_fin uuid := gen_random_uuid();
  v_com uuid := gen_random_uuid();
  v_cli uuid := gen_random_uuid();
  v_id  uuid;
  v_pct integer;
  v_mon integer;
begin
  insert into auth.users (id, email) values
    (v_fin, 'project-quote-finance-' || v_fin || '@test.local'),
    (v_com, 'project-quote-sales-' || v_com || '@test.local'),
    (v_cli, 'project-quote-client-' || v_cli || '@test.local');
  update public.profiles set full_name = 'Project Quote Test', is_active = true where id in (v_fin, v_com, v_cli);
  insert into public.user_roles (user_id, role) values (v_fin, 'finance'), (v_com, 'commercial'), (v_cli, 'client');
  perform set_config('test.pq.fin', v_fin::text, true);
  perform set_config('test.pq.com', v_com::text, true);
  perform set_config('test.pq.cli', v_cli::text, true);

  update public.feature_flags set state = 'public' where key in ('projects', 'pricing');
  update public.settings set value = 'true' where key = 'projects.list_closed';

  -- The owner's example rule: 10 د/م², 50 د per tree, 25% margin, dinar rounding; no extra cost line
  update public.tree_pricing_rules
  set land_price_per_m2_millimes = 10000, planting_cost_per_tree_millimes = 50000,
      margin_mode = 'percent', margin_percent_bp = 2500, margin_fixed_millimes = null,
      price_rounding_millimes = 1000, monthly_rounding_millimes = 1000
  where project_id is null;
  delete from public.tree_cost_items where project_id is null;
  delete from public.financing_markups where project_id is null;
  insert into public.financing_markups (project_id, months, markup_bp) values
    (null, 36, 1000), (null, 48, 1400), (null, 60, 1800), (null, 84, 2500);

  foreach v_pct in array array[10, 20, 30] loop
    update public.option_items set min_number = v_pct, max_number = v_pct, is_active = true
    where list_key = 'down_payment_percent' and code = 'dpp_' || v_pct
    returning id into v_id;
    perform set_config('test.pq.dpp_' || v_pct, v_id::text, true);
  end loop;
  foreach v_mon in array array[36, 48, 60, 84] loop
    update public.option_items set min_number = v_mon, max_number = v_mon, is_active = true
    where list_key = 'duration' and code = 'd_' || v_mon
    returning id into v_id;
    perform set_config('test.pq.dur_' || v_mon, v_id::text, true);
  end loop;
  -- A duration nobody prices, so no page may offer it
  insert into public.option_items (list_key, code, label_ar, min_number, max_number, sort_order)
  values ('duration', 'project_quote_test_72', 'مدة اختبار 72', 72, 72, 9990) returning id into v_id;
  perform set_config('test.pq.dur_72', v_id::text, true);

  update public.tree_spacing_classes set row_spacing_m = 7, tree_spacing_m = 5, is_active = true where code = 'int_7x5';
  update public.tree_spacing_classes set row_spacing_m = 4, tree_spacing_m = 1.5, is_active = true where code = 'super_4x1_5';
  update public.tree_spacing_classes set row_spacing_m = 5, tree_spacing_m = 5, is_active = true where code = 'int_5x5';
  perform set_config('test.pq.c7x5', (select id::text from public.tree_spacing_classes where code = 'int_7x5'), true);
  perform set_config('test.pq.c4x15', (select id::text from public.tree_spacing_classes where code = 'super_4x1_5'), true);
  perform set_config('test.pq.c5x5', (select id::text from public.tree_spacing_classes where code = 'int_5x5'), true);

  -- pt: two classes, 1,000 trees, its own land price, percentages and 60-month markup
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('project-quote-test-' || gen_random_uuid(), 'مشروع اختبار بفئتين', 34, 'published', 1000) returning id into v_id;
  perform set_config('test.pq.pt', v_id::text, true);
  -- po: one class; pl: no class (legacy); pi: internal; ps: sold out; pd: draft
  insert into public.projects (code, name, governorate_id, status)
  values ('project-quote-test-' || gen_random_uuid(), 'مشروع اختبار بفئة واحدة', 34, 'published') returning id into v_id;
  perform set_config('test.pq.po', v_id::text, true);
  insert into public.projects (code, name, governorate_id, status)
  values ('project-quote-test-' || gen_random_uuid(), 'مشروع اختبار بالتسعير القديم', 34, 'published') returning id into v_id;
  perform set_config('test.pq.pl', v_id::text, true);
  insert into public.projects (code, name, governorate_id, status)
  values ('project-quote-test-' || gen_random_uuid(), 'مشروع اختبار داخلي', 34, 'internal') returning id into v_id;
  perform set_config('test.pq.pi', v_id::text, true);
  insert into public.projects (code, name, governorate_id, status)
  values ('project-quote-test-' || gen_random_uuid(), 'مشروع اختبار مكتمل', 34, 'sold_out') returning id into v_id;
  perform set_config('test.pq.ps', v_id::text, true);
  insert into public.projects (code, name, governorate_id, status)
  values ('project-quote-test-' || gen_random_uuid(), 'مسودة مشروع اختبار', 34, 'draft') returning id into v_id;
  perform set_config('test.pq.pd', v_id::text, true);

  insert into public.project_spacing_classes (project_id, spacing_class_id) values
    (pg_temp.pq_id('pt'), pg_temp.pq_id('c7x5')), (pg_temp.pq_id('pt'), pg_temp.pq_id('c4x15')),
    (pg_temp.pq_id('po'), pg_temp.pq_id('c7x5')), (pg_temp.pq_id('pi'), pg_temp.pq_id('c7x5')),
    (pg_temp.pq_id('ps'), pg_temp.pq_id('c7x5')), (pg_temp.pq_id('pd'), pg_temp.pq_id('c7x5'));
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes) values (pg_temp.pq_id('pt'), 20000);
  insert into public.project_down_payment_percents (project_id, option_item_id) values
    (pg_temp.pq_id('pt'), pg_temp.pq_id('dpp_20')), (pg_temp.pq_id('pt'), pg_temp.pq_id('dpp_30'));
  insert into public.financing_markups (project_id, months, markup_bp) values (pg_temp.pq_id('pt'), 60, 2000);

  insert into public.parcels (project_id, code, area_m2, property_type, olive_tree_count, cash_price_millimes, spacing_class_id) values
    (pg_temp.pq_id('pt'), 'T01', 700, 'planted', 20, 0, pg_temp.pq_id('c7x5')),
    (pg_temp.pq_id('pt'), 'T02', 350, 'planted', 10, 0, null),
    (pg_temp.pq_id('po'), 'O01', 875, 'planted', 25, 0, null),
    (pg_temp.pq_id('po'), 'O02', 100, 'planted', null, 0, pg_temp.pq_id('c7x5')),
    (pg_temp.pq_id('pl'), 'L01', 500, 'planted', 100, 5000000, null),
    (pg_temp.pq_id('pl'), 'L02', 400, 'bare_land', 0, 0, null);
  perform set_config('test.pq.parcel_' || lower(pa.code), pa.id::text, true)
  from public.parcels pa
  where pa.project_id in (pg_temp.pq_id('pt'), pg_temp.pq_id('po'), pg_temp.pq_id('pl'));
end $$;

-- ---------------------------------------------------------------------------
-- 1 · Privileges and the price of a parcel
-- ---------------------------------------------------------------------------

do $$
declare
  v jsonb;
begin
  assert has_function_privilege('anon', 'public.public_project_quote(uuid, uuid, integer, text, uuid, uuid)', 'execute'),
    'visitors can ask for a project quote';
  assert not has_function_privilege('anon', 'public.staff_project_quote(uuid, uuid, integer, text, uuid, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.staff_project_quote(uuid, uuid, integer, text, uuid, uuid)', 'execute')
     and not has_function_privilege('anon', 'app.parcel_price(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.parcel_price(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_on_tree_pricing(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_spacing_choice(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_quote_payload(uuid, uuid, integer, text, uuid, uuid, boolean)', 'execute'),
    'the helpers stay closed and the staff quote needs a signed-in user';

  assert app.project_on_tree_pricing(pg_temp.pq_id('pt')) and app.project_on_tree_pricing(pg_temp.pq_id('po'))
     and not app.project_on_tree_pricing(pg_temp.pq_id('pl')), 'a project is on tree pricing once it lists a class';

  -- Project land price: 35 m² × 20 د = 700 د, + 50 د = 750 د, + 25% = 937.5 د, rounded up to 938 د
  v := app.parcel_price(pg_temp.pq_id('parcel_t01'));
  assert (v->>'on_tree_pricing')::boolean and (v->>'spacing_class_id')::uuid = pg_temp.pq_id('c7x5')
     and (v->>'area_per_tree_m2')::numeric = 35 and (v->>'trees')::integer = 20 and (v->>'total_area_m2')::numeric = 700
     and (v->>'price_per_tree_millimes')::bigint = 938000 and (v->>'cash_total_millimes')::bigint = 18760000
     and v->>'pricing' = 'ok' and v->>'reason' is null,
    'a parcel of 20 trees at 938 د each costs 18,760 د on 700 m², got ' || v::text;

  v := app.parcel_price(pg_temp.pq_id('parcel_t02'));
  assert v->>'pricing' = 'unavailable' and v->>'reason' = 'spacing_required'
     and v->>'spacing_class_id' is null and v->>'cash_total_millimes' is null,
    'a parcel without a class in a two-class project has no price, got ' || v::text;

  -- The owner's example: 35 m² × 10 د + 50 د = 400 د, + 25% = 500 د
  v := app.parcel_price(pg_temp.pq_id('parcel_o01'));
  assert (v->>'spacing_class_id')::uuid = pg_temp.pq_id('c7x5') and (v->>'price_per_tree_millimes')::bigint = 500000
     and (v->>'cash_total_millimes')::bigint = 12500000 and (v->>'total_area_m2')::numeric = 875 and v->>'pricing' = 'ok',
    'the only class of a project prices a parcel without one: 25 × 500 د = 12,500 د, got ' || v::text;

  v := app.parcel_price(pg_temp.pq_id('parcel_o02'));
  assert v->>'pricing' = 'unavailable' and v->>'reason' = 'trees_missing'
     and (v->>'price_per_tree_millimes')::bigint = 500000 and v->>'cash_total_millimes' is null and v->>'total_area_m2' is null,
    'a parcel without a tree count shows the tree price but no total, got ' || v::text;

  v := app.parcel_price(pg_temp.pq_id('parcel_l01'));
  assert not (v->>'on_tree_pricing')::boolean and v->>'pricing' = 'legacy' and (v->>'cash_total_millimes')::bigint = 5000000
     and (v->>'total_area_m2')::numeric = 500 and (v->>'trees')::integer = 100
     and v->>'spacing_class_id' is null and v->>'price_per_tree_millimes' is null,
    'a project without classes keeps the typed price, got ' || v::text;

  v := app.parcel_price(pg_temp.pq_id('parcel_l02'));
  assert v->>'pricing' = 'legacy' and v->>'cash_total_millimes' is null, 'a stored 0 is not a price, got ' || v::text;

  assert app.parcel_price(gen_random_uuid()) is null, 'an unknown parcel has no price';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · A parcel uses its project's classes; a used class stays in the project
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.pq_expect(format('update public.parcels set spacing_class_id = %L where id = %L',
    pg_temp.pq_id('c5x5'), pg_temp.pq_id('parcel_t02')), 'parcel_spacing_not_in_project');
  perform pg_temp.pq_expect(format('update public.parcels set spacing_class_id = %L where id = %L',
    pg_temp.pq_id('c7x5'), pg_temp.pq_id('parcel_l01')), 'parcel_spacing_not_in_project');
  perform pg_temp.pq_expect(format('update public.parcels set project_id = %L where id = %L',
    pg_temp.pq_id('pl'), pg_temp.pq_id('parcel_t01')), 'parcel_spacing_not_in_project');

  update public.parcels set spacing_class_id = pg_temp.pq_id('c4x15') where id = pg_temp.pq_id('parcel_t02');
  assert (app.parcel_price(pg_temp.pq_id('parcel_t02'))->>'pricing') = 'ok', 'a class of the project is accepted';
  update public.parcels set spacing_class_id = null where id = pg_temp.pq_id('parcel_t02');

  perform pg_temp.pq_expect(format('delete from public.project_spacing_classes where project_id = %L and spacing_class_id = %L',
    pg_temp.pq_id('pt'), pg_temp.pq_id('c7x5')), 'spacing_used_by_parcels');
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.pq.fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_reason text := current_setting('test.pq_reason');
begin
  perform pg_temp.pq_expect(format('select public.staff_save_project_spacing_classes(%L::uuid, %L::uuid[], %L)',
    pg_temp.pq_id('pt'), array[pg_temp.pq_id('c4x15')], v_reason), 'spacing_used_by_parcels');
  perform pg_temp.pq_expect(format('select public.staff_save_project_spacing_classes(%L::uuid, %L::uuid[], %L)',
    pg_temp.pq_id('po'), '{}', v_reason), 'spacing_used_by_parcels');
  assert (select count(*) from public.project_spacing_classes where project_id = pg_temp.pq_id('pt')) = 2,
    'a refused save leaves the list as it was';

  -- Saving the same list again, or a longer one, keeps the class in use
  perform public.staff_save_project_spacing_classes(pg_temp.pq_id('pt'), array[pg_temp.pq_id('c7x5'), pg_temp.pq_id('c4x15')], v_reason);
  perform public.staff_save_project_spacing_classes(pg_temp.pq_id('pt'),
    array[pg_temp.pq_id('c7x5'), pg_temp.pq_id('c4x15'), pg_temp.pq_id('c5x5')], v_reason);
  assert (select count(*) from public.project_spacing_classes where project_id = pg_temp.pq_id('pt')) = 3,
    'an added class joins the list';

  -- An unused class leaves it
  perform public.staff_save_project_spacing_classes(pg_temp.pq_id('pt'), array[pg_temp.pq_id('c7x5'), pg_temp.pq_id('c4x15')], v_reason);
  assert not exists (select 1 from public.project_spacing_classes
                     where project_id = pg_temp.pq_id('pt') and spacing_class_id = pg_temp.pq_id('c5x5')),
    'an unused class is dropped';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 3 · A visitor, with pricing public
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
declare
  v         jsonb;
  v_allowed text[] := array[
    'project_id', 'project_code', 'on_tree_pricing', 'spacing_status', 'spacing_class_id', 'label_ar', 'label_fr',
    'row_spacing_m', 'tree_spacing_m', 'area_per_tree_m2', 'trees', 'trees_max', 'total_area_m2', 'pricing',
    'price_per_tree_millimes', 'total_price_millimes', 'installments', 'status', 'down_payment_percent',
    'down_payment_millimes', 'months', 'total_financed_millimes', 'remaining_millimes', 'monthly_millimes',
    'last_installment_millimes', 'installments_count', 'shortened', 'choices', 'spacing_classes', 'down_percents',
    'durations', 'id', 'area_m2', 'percent'];
  v_extra   text[];
begin
  v := public.public_project_quote(pg_temp.pq_id('po'), null, 25, 'cash');
  assert v->>'pricing' = 'ok' and v->>'spacing_status' = 'ok' and (v->>'on_tree_pricing')::boolean
     and (v->>'spacing_class_id')::uuid = pg_temp.pq_id('c7x5') and (v->>'area_per_tree_m2')::numeric = 35
     and (v->>'trees')::integer = 25 and (v->>'total_area_m2')::numeric = 875
     and (v->>'price_per_tree_millimes')::bigint = 500000 and (v->>'total_price_millimes')::bigint = 12500000
     and v->'installments' = 'null'::jsonb,
    'the only class is implied: 25 × 500 د = 12,500 د on 875 m², got ' || v::text;

  -- 20% of 12,500 د = 2,500 د down; the 10,000 د left at +18% = 11,800 د, so 14,300 د in all = 59 × 197 د + 177 د
  v := public.public_project_quote(pg_temp.pq_id('po'), null, 25, 'installments', pg_temp.pq_id('dpp_20'), pg_temp.pq_id('dur_60'));
  assert v#>>'{installments,status}' = 'ok'
     and (v#>>'{installments,down_payment_millimes}')::bigint = 2500000
     and (v#>>'{installments,total_financed_millimes}')::bigint = 14300000
     and (v#>>'{installments,monthly_millimes}')::bigint = 197000
     and (v#>>'{installments,installments_count}')::integer = 60
     and (v#>>'{installments,last_installment_millimes}')::bigint = 177000,
    'the global markup applies to a project without its own, got ' || (v->'installments')::text;

  v := public.public_project_quote(pg_temp.pq_id('pt'), null, 20, 'cash');
  assert v->>'spacing_status' = 'required' and v->>'pricing' = 'unavailable'
     and v->>'spacing_class_id' is null and v->>'price_per_tree_millimes' is null,
    'a project with two classes needs one, got ' || v::text;
  v := public.public_project_quote(pg_temp.pq_id('pt'), pg_temp.pq_id('c5x5'), 20, 'cash');
  assert v->>'spacing_status' = 'not_allowed' and v->>'pricing' = 'unavailable',
    'a class the project does not sell is not priced, got ' || v::text;

  v := public.public_project_quote(pg_temp.pq_id('pt'), pg_temp.pq_id('c7x5'), 20, 'installments', pg_temp.pq_id('dpp_10'), pg_temp.pq_id('dur_60'));
  assert v->>'pricing' = 'ok' and (v->>'price_per_tree_millimes')::bigint = 938000
     and (v->>'total_price_millimes')::bigint = 18760000 and v#>>'{installments,status}' = 'invalid_choice',
    'the project land price applies and 10% is not one of its percentages, got ' || v::text;

  -- 20% of 18,760 د = 3,752 د; the project''s +20% applies to the 15,008 د left = 18,010 د, so 21,762 د in all
  v := public.public_project_quote(pg_temp.pq_id('pt'), pg_temp.pq_id('c7x5'), 20, 'installments', pg_temp.pq_id('dpp_20'), pg_temp.pq_id('dur_60'));
  assert v#>>'{installments,status}' = 'ok'
     and (v#>>'{installments,down_payment_millimes}')::bigint = 3752000
     and (v#>>'{installments,total_financed_millimes}')::bigint = 21762000,
    'the project markup replaces the global one, got ' || (v->'installments')::text;

  select array_agg(distinct k) into v_extra from unnest(pg_temp.pq_keys(v)) k where k <> all (v_allowed);
  assert v_extra is null, 'the public quote carries only whitelisted keys, extra: ' || coalesce(v_extra::text, '');

  v := public.public_project_quote(pg_temp.pq_id('pt'), pg_temp.pq_id('c7x5'), 1001, 'cash');
  assert v->>'trees' is null and (v->>'trees_max')::integer = 1000 and v->>'total_price_millimes' is null,
    'a project sells at most its own trees, got ' || v::text;

  v := public.public_project_quote(pg_temp.pq_id('pt'));
  assert (select array_agg(e->>'id' order by e->>'id') from jsonb_array_elements(v#>'{choices,spacing_classes}') e)
       = (select array_agg(x::text order by x::text) from unnest(array[pg_temp.pq_id('c7x5'), pg_temp.pq_id('c4x15')]) x),
    'the choices list the project classes, got ' || (v->'choices')::text;
  assert (select (e->>'price_per_tree_millimes')::bigint from jsonb_array_elements(v#>'{choices,spacing_classes}') e
          where (e->>'id')::uuid = pg_temp.pq_id('c7x5')) = 938000,
    'each class carries its project price, got ' || (v->'choices')::text;
  assert (select array_agg((e->>'percent')::numeric order by (e->>'percent')::numeric)
          from jsonb_array_elements(v#>'{choices,down_percents}') e) = array[20, 30]::numeric[],
    'the choices list the project percentages, got ' || (v->'choices')::text;
  assert (select bool_or((e->>'months')::integer = 60) and bool_and((e->>'months')::integer <> 72)
          from jsonb_array_elements(v#>'{choices,durations}') e),
    'priced durations are offered and an unpriced one is not, got ' || (v->'choices')::text;

  v := public.public_project_quote(pg_temp.pq_id('pl'), null, 10, 'cash');
  assert v->>'pricing' = 'legacy' and not (v->>'on_tree_pricing')::boolean and v->>'spacing_status' is null
     and jsonb_array_length(v#>'{choices,spacing_classes}') = 0,
    'a project without classes stays on its old pricing, got ' || v::text;

  v := public.public_project_quote(pg_temp.pq_id('ps'), null, 25, 'cash');
  assert v->>'pricing' = 'not_offered' and v->>'price_per_tree_millimes' is null
     and (select bool_and(e->'price_per_tree_millimes' = 'null'::jsonb) from jsonb_array_elements(v#>'{choices,spacing_classes}') e),
    'a sold out project is listed without a price, got ' || v::text;

  assert public.public_project_quote(pg_temp.pq_id('pi')) is null, 'a visitor gets nothing for an internal project';
  assert public.public_project_quote(pg_temp.pq_id('pd')) is null, 'a visitor gets nothing for a draft';
  assert public.public_project_quote(gen_random_uuid()) is null, 'an unknown project gives nothing';
  perform pg_temp.pq_expect(format('select public.staff_project_quote(%L::uuid)', pg_temp.pq_id('po')),
    'permission denied for function staff_project_quote');
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 4 · Pricing for the team only: visitors see areas, staff preview, the staff card is ungated
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'internal' where key = 'pricing';
set local role anon;

do $$
declare
  v jsonb := public.public_project_quote(pg_temp.pq_id('po'), null, 25, 'installments', pg_temp.pq_id('dpp_20'), pg_temp.pq_id('dur_60'));
begin
  assert v->>'pricing' = 'closed' and v->>'price_per_tree_millimes' is null and v->>'total_price_millimes' is null
     and v->'installments' = 'null'::jsonb and (v->>'total_area_m2')::numeric = 875
     and (select bool_and(e->'price_per_tree_millimes' = 'null'::jsonb) from jsonb_array_elements(v#>'{choices,spacing_classes}') e),
    'with pricing for the team only, a visitor sees the areas without any price, got ' || v::text;
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.pq.com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb;
begin
  v := public.public_project_quote(pg_temp.pq_id('po'), null, 25, 'cash');
  assert v->>'pricing' = 'ok', 'staff preview the public price while pricing is internal, got ' || v::text;

  v := public.public_project_quote(pg_temp.pq_id('pi'), null, 25, 'cash');
  assert v is not null and v->>'pricing' = 'not_offered',
    'staff see an internal project on the public page, without a price, got ' || coalesce(v::text, 'null');

  v := public.staff_project_quote(pg_temp.pq_id('pi'), null, 25, 'installments', pg_temp.pq_id('dpp_20'), pg_temp.pq_id('dur_60'));
  assert v->>'pricing' = 'ok' and (v->>'total_price_millimes')::bigint = 12500000 and v#>>'{installments,status}' = 'ok'
     and not (v ? 'price') and not (v->'installments' ? 'markup_bp'),
    'a commercial gets the figures of any project, without the breakdown, got ' || v::text;
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.pq.cli'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.pq_expect(format('select public.staff_project_quote(%L::uuid)', pg_temp.pq_id('po')), 'forbidden');
  assert (public.public_project_quote(pg_temp.pq_id('po'), null, 25, 'cash')->>'pricing') = 'closed',
    'a client is a visitor for prices';
end $$;

reset role;
update public.feature_flags set state = 'disabled' where key = 'pricing';
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.pq.fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v jsonb := public.staff_project_quote(pg_temp.pq_id('pt'), pg_temp.pq_id('c7x5'), 20, 'installments', pg_temp.pq_id('dpp_20'), pg_temp.pq_id('dur_60'));
begin
  -- 750 د cost × 25% = 187.5 د margin; the project's 60-month markup is +20%
  assert v->>'pricing' = 'ok' and (v#>>'{price,margin_millimes}')::bigint = 187500
     and (v#>>'{price,land_cost_millimes}')::bigint = 700000 and (v#>>'{installments,markup_bp}')::integer = 2000,
    'finance sees the breakdown and the markup, even with pricing switched off, got ' || v::text;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5 · The projects module closed hides every project from visitors
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'disabled' where key = 'projects';
set local role anon;

do $$
begin
  assert public.public_project_quote(pg_temp.pq_id('po')) is null, 'with the projects module closed a visitor gets nothing';
end $$;

reset role;
