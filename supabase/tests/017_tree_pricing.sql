-- Tree pricing: spacing classes, pricing rules, cost lines, markups per duration, down payment percentages,
-- per-project classes and percentages, public and staff quotes.
-- Addendum docs/tree-area-and-cost.md; plan docs/plan-zitouna.md Q-1..Q-4, Q-11, Q-13, P1-2, P1-7, P1-8;
-- report v3 §8, §10-§12, §51-§54; 0024 reason convention; PRJ-03.
--
-- Runs against the live database: fresh staff users, fixture projects, option fixtures with unused codes, and
-- every global pricing row and seeded list item this file relies on is set explicitly inside the rolled-back
-- transaction. Seed values are asserted only while nobody has saved them from the Back Office.

select set_config('test.tp_reason', rpad(s, greatest(char_length(s), app.setting_int('audit.reason_min_length', 5)), '.'), true)
from (values ('ضبط تسعير الزيتونة في الاختبار')) as t (s);

create function pg_temp.tp_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Seeds, read before any fixture touches them (as the migration owner)
-- ---------------------------------------------------------------------------

do $$
declare
  v_got   text[];
  v_rule  public.tree_pricing_rules;
begin
  select array_agg(c.code || '=' || c.area_m2::integer order by c.code collate "C") into v_got
  from public.tree_spacing_classes c
  where c.code in ('trad_wide_24x24', 'trad_14x14', 'semi_10x10', 'int_7x7', 'int_7x5', 'int_5x5', 'super_4x2', 'super_4x1_5');
  assert v_got = array['int_5x5=25', 'int_7x5=35', 'int_7x7=49', 'semi_10x10=100', 'super_4x1_5=6', 'super_4x2=8',
                       'trad_14x14=196', 'trad_wide_24x24=576'],
    'the eight addendum classes hold 576, 196, 100, 49, 35, 25, 8 and 6 m², got ' || coalesce(v_got::text, 'none');

  assert (select s.value_type = 'integer' and s.is_public and s.group_key = 'pricing'
          from public.settings s where s.key = 'pricing.max_months'), 'pricing.max_months is a public integer setting';
  assert exists (select 1 from public.feature_flags f where f.key = 'pricing' and f.phase = 1), 'the pricing flag exists';

  -- Plan Q-1: the percentage list and the owner's three example values; Q-4: four years joins the durations
  assert (select l.value_kind = 'number_range' from public.option_lists l where l.key = 'down_payment_percent'),
    'the down payment percentage list exists and holds number ranges';
  select array_agg(o.code order by o.code) into v_got
  from public.option_items o where o.list_key = 'down_payment_percent' and o.code in ('dpp_10', 'dpp_20', 'dpp_30');
  assert v_got = array['dpp_10', 'dpp_20', 'dpp_30'], 'the three example percentages are seeded, got ' || coalesce(v_got::text, 'none');
  select array_agg(o.code order by o.code) into v_got
  from public.option_items o where o.list_key = 'duration' and o.code in ('d_36', 'd_48', 'd_60', 'd_84');
  assert v_got = array['d_36', 'd_48', 'd_60', 'd_84'], 'durations of 3, 4, 5 and 7 years exist, got ' || coalesce(v_got::text, 'none');

  -- Plan P1-8: the global rule carries the owner's example margin and the notes for Finance, until someone saves it.
  select * into v_rule from public.tree_pricing_rules r where r.project_id is null;
  assert v_rule.id is not null, 'the global rule exists';
  if not exists (select 1 from public.audit_logs a where a.action = 'pricing.rule_save' and a.entity_id = v_rule.id::text) then
    assert v_rule.land_price_per_m2_millimes = 10000 and v_rule.planting_cost_per_tree_millimes = 50000
       and v_rule.margin_mode = 'percent' and v_rule.margin_percent_bp = 2500 and v_rule.margin_fixed_millimes is null
       and v_rule.price_rounding_millimes = 1000 and v_rule.monthly_rounding_millimes = 1000,
      'the global rule is seeded with 10 د/م², 50 د per tree, a 25% margin and dinar rounding, got ' || to_jsonb(v_rule)::text;
    assert v_rule.note_ar like '%25%%' and v_rule.markups_note_ar like '%84 +25%%',
      'the seeded margin and markups carry their review notes, got ' || to_jsonb(v_rule)::text;
  end if;

  -- The owner's initial markups per duration, until a pricing admin replaces the global rows
  if not exists (select 1 from public.audit_logs a where a.action = 'pricing.markups_save' and a.new_data->>'project_id' is null) then
    select array_agg(m.months || '=' || m.markup_bp order by m.months) into v_got
    from public.financing_markups m where m.project_id is null;
    assert v_got = array['36=1000', '48=1400', '60=1800', '84=2500'],
      'the global markups are seeded as 36 +10%, 48 +14%, 60 +18%, 84 +25%, got ' || coalesce(v_got::text, 'none');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

do $$
declare
  v_fin uuid := gen_random_uuid();
  v_com uuid := gen_random_uuid();
  v_id  uuid;
  v_pct integer;
  v_mon integer;
begin
  insert into auth.users (id, email) values
    (v_fin, 'tree-pricing-finance-' || v_fin || '@test.local'),
    (v_com, 'tree-pricing-sales-' || v_com || '@test.local');
  update public.profiles set full_name = 'Tree Pricing Test', is_active = true where id in (v_fin, v_com);
  insert into public.user_roles (user_id, role) values (v_fin, 'finance'), (v_com, 'commercial');
  perform set_config('test.tp_fin', v_fin::text, true);
  perform set_config('test.tp_com', v_com::text, true);

  insert into public.projects (code, name, governorate_id)
  values ('tree-pricing-test-' || gen_random_uuid(), 'مشروع اختبار التسعير', 34)
  returning id into v_id;
  perform set_config('test.tp_project', v_id::text, true);
  insert into public.projects (code, name, governorate_id)
  values ('tree-pricing-test-' || gen_random_uuid(), 'مشروع اختبار التسعير الثاني', 34)
  returning id into v_id;
  perform set_config('test.tp_project_2', v_id::text, true);

  perform set_config('test.tp_7x5', (select id::text from public.tree_spacing_classes where code = 'int_7x5'), true);
  perform set_config('test.tp_4x15', (select id::text from public.tree_spacing_classes where code = 'super_4x1_5'), true);

  -- The seeded percentages and durations, pinned to their seed values in case the Back Office edited them
  foreach v_pct in array array[10, 20, 30] loop
    update public.option_items set min_number = v_pct, max_number = v_pct, is_active = true
    where list_key = 'down_payment_percent' and code = 'dpp_' || v_pct
    returning id into v_id;
    perform set_config('test.tp_dpp_' || v_pct, v_id::text, true);
  end loop;
  foreach v_mon in array array[36, 48, 60, 84] loop
    update public.option_items set min_number = v_mon, max_number = v_mon, is_active = true
    where list_key = 'duration' and code = 'd_' || v_mon
    returning id into v_id;
    perform set_config('test.tp_dur_' || v_mon, v_id::text, true);
  end loop;

  -- A duration nobody prices and a retired percentage, with codes nobody uses
  insert into public.option_items (list_key, code, label_ar, min_number, max_number, sort_order)
  values ('duration', 'tree_pricing_test_72', 'مدة اختبار 72', 72, 72, 9990) returning id into v_id;
  perform set_config('test.tp_dur_72', v_id::text, true);
  insert into public.option_items (list_key, code, label_ar, min_number, max_number, sort_order, is_active)
  values ('down_payment_percent', 'tree_pricing_test_15', 'نسبة اختبار 15', 15, 15, 9990, false) returning id into v_id;
  perform set_config('test.tp_dpp_retired', v_id::text, true);

  insert into public.tree_spacing_classes (code, label_ar, row_spacing_m, tree_spacing_m, is_active)
  values ('tp_test_retired', 'فئة مخفية للاختبار', 3, 3, false);
  perform set_config('test.tp_retired_class', (select id::text from public.tree_spacing_classes where code = 'tp_test_retired'), true);

  -- The live database may already hold global cost lines; this file measures its own.
  delete from public.tree_cost_items where project_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The owner's example, an unset margin and privileges
-- ---------------------------------------------------------------------------

do $$
declare
  v_price jsonb;
begin
  update public.tree_pricing_rules set margin_mode = null, margin_percent_bp = null, margin_fixed_millimes = null
  where project_id is null;
  v_price := app.tree_price(current_setting('test.tp_7x5')::uuid);
  assert v_price->>'reason' = 'margin_not_set' and (v_price->>'area_m2')::numeric = 35,
    'without a margin nothing is priced, got ' || v_price::text;
  assert app.tree_price(gen_random_uuid())->>'reason' = 'spacing_not_found', 'an unknown class is not priced';

  -- Plan §1: 35 m² × 10 د = 350 د, + 50 د planting = 400 د, + 25% = «السعر النهائي 500 د»
  update public.tree_pricing_rules
  set land_price_per_m2_millimes = 10000, planting_cost_per_tree_millimes = 50000,
      margin_mode = 'percent', margin_percent_bp = 2500, margin_fixed_millimes = null,
      price_rounding_millimes = 1000, monthly_rounding_millimes = 1000
  where project_id is null;
  v_price := app.tree_price(current_setting('test.tp_7x5')::uuid);
  assert (v_price->>'ok')::boolean and (v_price->>'land_cost_millimes')::bigint = 350000
     and (v_price->>'planting_cost_millimes')::bigint = 50000
     and (v_price->>'cost_per_tree_millimes')::bigint = 400000
     and (v_price->>'margin_millimes')::bigint = 100000
     and (v_price->>'price_per_tree_millimes')::bigint = 500000,
    'the owner example: land 350 د, planting 50 د, cost 400 د, price 500 د, got ' || v_price::text;

  -- Visitors call the public quote only
  assert has_function_privilege('anon', 'public.public_tree_quote(uuid, integer, text, uuid, uuid)', 'execute'),
    'visitors can ask for a quote';
  assert not has_function_privilege('anon', 'app.tree_price(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.tree_price(uuid, uuid)', 'execute')
     and not has_function_privilege('anon', 'app.financed_quote(bigint, bigint, integer, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.financed_quote(bigint, bigint, integer, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.down_payment_from_percent(bigint, numeric, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_down_percent_items(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.price_rounding(uuid)', 'execute')
     and not has_function_privilege('anon', 'app.can_price()', 'execute')
     and not has_function_privilege('anon', 'public.staff_tree_quote(uuid, integer, uuid, numeric, integer)', 'execute')
     and not has_function_privilege('anon', 'public.staff_save_spacing_class(jsonb, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_delete_spacing_class(uuid, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_save_pricing_rule(uuid, jsonb, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_delete_pricing_rule(uuid, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_save_cost_item(jsonb, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_delete_cost_item(uuid, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_save_financing_markups(uuid, jsonb, text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_save_project_spacing_classes(uuid, uuid[], text)', 'execute')
     and not has_function_privilege('anon', 'public.staff_save_project_down_percents(uuid, uuid[], text)', 'execute'),
    'the engine and the staff RPCs are closed to visitors';

  assert not has_table_privilege('anon', 'public.tree_pricing_rules', 'select')
     and not has_table_privilege('anon', 'public.tree_cost_items', 'select')
     and not has_table_privilege('anon', 'public.financing_markups', 'select')
     and not has_table_privilege('anon', 'public.project_spacing_classes', 'select')
     and not has_table_privilege('anon', 'public.project_down_payment_percents', 'select'),
    'visitors cannot read the pricing tables';
  assert not has_table_privilege('authenticated', 'public.tree_spacing_classes', 'insert')
     and not has_table_privilege('authenticated', 'public.tree_spacing_classes', 'update')
     and not has_table_privilege('authenticated', 'public.tree_pricing_rules', 'update')
     and not has_table_privilege('authenticated', 'public.tree_cost_items', 'insert')
     and not has_table_privilege('authenticated', 'public.financing_markups', 'delete')
     and not has_table_privilege('authenticated', 'public.project_spacing_classes', 'insert')
     and not has_table_privilege('authenticated', 'public.project_down_payment_percents', 'delete')
     and not has_table_privilege('anon', 'public.tree_spacing_classes', 'insert'),
    'nobody writes the pricing tables directly';
end $$;

do $$
declare
  v_active bigint := (select count(*) from public.tree_spacing_classes where is_active);
  v_seen   bigint;
begin
  set local role anon;
  select count(*) into v_seen from public.tree_spacing_classes;
  assert v_seen = v_active, 'a visitor reads exactly the active classes, got ' || v_seen || ' of ' || v_active;
  assert not exists (select 1 from public.tree_spacing_classes where code = 'tp_test_retired'), 'a retired class is hidden';
  begin
    perform 1 from public.tree_pricing_rules limit 1;
    raise exception 'expected a visitor to be refused the pricing rules but the query ran';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · A commercial is refused; a finance user needs a reason
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.tp_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  assert (select count(*) from public.tree_pricing_rules) = 0, 'a commercial reads no pricing rule';
  assert (select count(*) from public.financing_markups) = 0, 'a commercial reads no markup';
  assert exists (select 1 from public.tree_spacing_classes where code = 'int_7x5'), 'a commercial reads active classes';

  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(null, %L::jsonb, %L)',
    '{"land_price_per_m2_millimes": 1}', current_setting('test.tp_reason')), 'forbidden');
  perform pg_temp.tp_expect(format('select public.staff_tree_quote(%L::uuid, 25)', current_setting('test.tp_7x5')), 'forbidden');
  perform pg_temp.tp_expect(format('select public.staff_save_financing_markups(null, %L::jsonb, %L)',
    '[]', current_setting('test.tp_reason')), 'forbidden');
  perform pg_temp.tp_expect(format('select public.staff_save_project_spacing_classes(%L::uuid, %L::uuid[], %L)',
    current_setting('test.tp_project'), '{}', current_setting('test.tp_reason')), 'forbidden');
  perform pg_temp.tp_expect(format('select public.staff_save_project_down_percents(%L::uuid, %L::uuid[], %L)',
    current_setting('test.tp_project'), '{}', current_setting('test.tp_reason')), 'forbidden');
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.tp_fin'), 'role', 'authenticated')::text, true);

do $$
declare
  v_rule jsonb := '{"land_price_per_m2_millimes": 10000, "planting_cost_per_tree_millimes": 50000,
                    "margin_mode": "percent", "margin_percent_bp": 2000,
                    "price_rounding_millimes": 1000, "monthly_rounding_millimes": 1000,
                    "note_ar": "هامش اختبار", "markups_note_ar": "زيادات اختبار"}';
  v_q    jsonb;
begin
  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(null, %L::jsonb, null)', v_rule), 'reason_required');

  perform public.staff_save_pricing_rule(null, v_rule, current_setting('test.tp_reason'));
  assert (select r.note_ar = 'هامش اختبار' and r.markups_note_ar = 'زيادات اختبار'
          from public.tree_pricing_rules r where r.project_id is null), 'the rule keeps its notes for Finance';
  v_q := public.staff_tree_quote(current_setting('test.tp_7x5')::uuid, 25);
  assert (v_q->'price'->>'ok')::boolean, 'the class is priced once the margin is set, got ' || v_q::text;
  assert (v_q->'price'->>'land_cost_millimes')::bigint = 350000, 'addendum example: 35 m² × 10 د = 350 د, got ' || v_q::text;
  assert (v_q->'price'->>'planting_cost_millimes')::bigint = 50000
     and (v_q->'price'->>'cost_per_tree_millimes')::bigint = 400000
     and (v_q->'price'->>'margin_millimes')::bigint = 80000
     and (v_q->'price'->>'price_per_tree_millimes')::bigint = 480000,
    'cost 400 د, margin 20% = 80 د, price 480 د, got ' || v_q::text;
  assert (v_q->>'total_price_millimes')::bigint = 12000000 and (v_q->>'total_area_m2')::numeric = 875,
    'the staff quote multiplies by the trees, got ' || v_q::text;
  assert v_q->'price'->'sources' = '{"land": "global", "planting": "global", "margin": "global", "rounding": "global"}'::jsonb,
    'every figure comes from the global rule';

  -- Invalid values and an unset global margin are refused
  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(null, %L::jsonb, %L)',
    v_rule - 'margin_mode' - 'margin_percent_bp', current_setting('test.tp_reason')), 'invalid_pricing_rule');
  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(null, %L::jsonb, %L)',
    v_rule || '{"land_price_per_m2_millimes": -1}', current_setting('test.tp_reason')), 'invalid_pricing_rule');
  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(null, %L::jsonb, %L)',
    v_rule - 'planting_cost_per_tree_millimes', current_setting('test.tp_reason')), 'invalid_pricing_rule');
  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(null, %L::jsonb, %L)',
    v_rule || '{"margin_mode": "fixed"}', current_setting('test.tp_reason')), 'invalid_pricing_rule');
  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(null, %L::jsonb, %L)',
    v_rule || jsonb_build_object('note_ar', repeat('ن', 1001)), current_setting('test.tp_reason')), 'invalid_pricing_rule');
  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(null, %L::jsonb, %L)',
    v_rule || jsonb_build_object('markups_note_ar', repeat('ن', 1001)), current_setting('test.tp_reason')), 'invalid_pricing_rule');
  perform pg_temp.tp_expect(format('select public.staff_save_pricing_rule(%L::uuid, %L::jsonb, %L)',
    gen_random_uuid(), '{"land_price_per_m2_millimes": 15000}', current_setting('test.tp_reason')), 'invalid_pricing_rule');

  -- The audit log is for admins, so it is read as the owner.
  reset role;
  assert exists (select 1 from public.audit_logs a
                 where a.action = 'pricing.rule_save' and a.entity = 'tree_pricing_rules'
                   and a.reason = current_setting('test.tp_reason') and a.actor_id = current_setting('test.tp_fin')::uuid
                   and a.new_data->>'margin_percent_bp' = '2000' and a.new_data->>'note_ar' = 'هامش اختبار'),
    'the rule change is logged with its reason, author and note';
  set local role authenticated;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · Extra cost lines, a fixed margin and a project override (addendum «حسب قواعد المشروع»)
-- ---------------------------------------------------------------------------

do $$
declare
  v_reason  text := current_setting('test.tp_reason');
  v_class   uuid := current_setting('test.tp_7x5')::uuid;
  v_project uuid := current_setting('test.tp_project')::uuid;
  v_q       jsonb;
  v_item    uuid;
begin
  v_item := public.staff_save_cost_item('{"label_ar": "مصاريف إدارية", "basis": "per_tree", "amount_millimes": 20000}', v_reason);
  perform set_config('test.tp_item_tree', v_item::text, true);
  v_q := public.staff_tree_quote(v_class)->'price';
  assert (v_q->>'price_per_tree_millimes')::bigint = 504000, 'a 20 د line per tree gives 504 د, got ' || v_q::text;

  v_item := public.staff_save_cost_item('{"label_ar": "تهيئة الأرض", "basis": "per_m2", "amount_millimes": 1000}', v_reason);
  perform set_config('test.tp_item_m2', v_item::text, true);
  v_q := public.staff_tree_quote(v_class)->'price';
  assert (v_q->>'cost_per_tree_millimes')::bigint = 455000 and (v_q->>'extras_total_millimes')::bigint = 55000
     and (v_q->>'price_per_tree_millimes')::bigint = 546000,
    'a 1 د/م² line adds 35 د: cost 455 د, price 546 د, got ' || v_q::text;
  assert jsonb_array_length(v_q->'extras') = 2
     and exists (select 1 from jsonb_array_elements(v_q->'extras') e where e->>'basis' = 'per_m2' and (e->>'cost_millimes')::bigint = 35000),
    'each line shows its cost for one tree';

  perform pg_temp.tp_expect(format('select public.staff_save_cost_item(%L::jsonb, %L)',
    '{"label_ar": " ", "basis": "per_tree", "amount_millimes": 1}', v_reason), 'invalid_cost_item');
  perform pg_temp.tp_expect(format('select public.staff_save_cost_item(%L::jsonb, %L)',
    '{"label_ar": "بند", "basis": "per_hectare", "amount_millimes": 1}', v_reason), 'invalid_cost_item');

  perform public.staff_save_pricing_rule(null, '{"land_price_per_m2_millimes": 10000, "planting_cost_per_tree_millimes": 50000,
    "margin_mode": "fixed", "margin_fixed_millimes": 100000, "price_rounding_millimes": 1000, "monthly_rounding_millimes": 1000}', v_reason);
  v_q := public.staff_tree_quote(v_class)->'price';
  assert (v_q->>'price_per_tree_millimes')::bigint = 555000 and v_q->>'margin_mode' = 'fixed' and v_q->'margin_percent_bp' = 'null'::jsonb,
    'a fixed 100 د margin gives 555 د, got ' || v_q::text;

  -- Project P: 15 د/م², everything else inherited
  perform public.staff_save_pricing_rule(v_project, '{"land_price_per_m2_millimes": 15000}', v_reason);
  v_q := public.staff_tree_quote(v_class, 1, v_project)->'price';
  assert (v_q->>'land_cost_millimes')::bigint = 525000 and v_q->'sources'->>'land' = 'project'
     and v_q->'sources'->>'planting' = 'global' and v_q->'sources'->>'margin' = 'global'
     and (v_q->>'price_per_tree_millimes')::bigint = 730000,
    'the project land price wins and the rest is inherited, got ' || v_q::text;
  assert (public.staff_tree_quote(v_class)->'price'->>'price_per_tree_millimes')::bigint = 555000,
    'the global price is untouched by the project override';

  perform public.staff_save_pricing_rule(v_project, '{"land_price_per_m2_millimes": 15000, "use_global_cost_items": false}', v_reason);
  v_q := public.staff_tree_quote(v_class, 1, v_project)->'price';
  assert (v_q->>'extras_total_millimes')::bigint = 0 and (v_q->>'price_per_tree_millimes')::bigint = 675000,
    'the project drops the global lines, got ' || v_q::text;

  v_item := public.staff_save_cost_item(jsonb_build_object('project_id', v_project, 'label_ar', 'سقي المشروع',
    'basis', 'per_tree', 'amount_millimes', 5000), v_reason);
  perform public.staff_save_financing_markups(v_project, '[{"months": 60, "markup_bp": 500}]', v_reason);
  v_q := public.staff_tree_quote(v_class, 1, v_project)->'price';
  assert (v_q->>'extras_total_millimes')::bigint = 5000 and (v_q->>'price_per_tree_millimes')::bigint = 680000,
    'the project keeps its own line, got ' || v_q::text;

  -- Removing the override removes its lines and markups; the project falls back to the global rule
  perform pg_temp.tp_expect(format('select public.staff_delete_pricing_rule(null, %L)', v_reason), 'invalid_pricing_rule');
  perform public.staff_delete_pricing_rule(v_project, v_reason);
  assert (public.staff_tree_quote(v_class, 1, v_project)->'price'->>'price_per_tree_millimes')::bigint = 555000,
    'without its override the project is priced like the global rule';
  assert not exists (select 1 from public.tree_cost_items where project_id = v_project)
     and not exists (select 1 from public.financing_markups where project_id = v_project),
    'the project lines and markups are removed with the override';

  -- Back to the owner's 25% margin and no extra lines for the quotes below
  perform public.staff_delete_cost_item(current_setting('test.tp_item_tree')::uuid, v_reason);
  perform public.staff_delete_cost_item(current_setting('test.tp_item_m2')::uuid, v_reason);
  perform public.staff_save_pricing_rule(null, '{"land_price_per_m2_millimes": 10000, "planting_cost_per_tree_millimes": 50000,
    "margin_mode": "percent", "margin_percent_bp": 2500, "price_rounding_millimes": 1000, "monthly_rounding_millimes": 1000}', v_reason);
  assert (public.staff_tree_quote(v_class)->'price'->>'price_per_tree_millimes')::bigint = 500000, 'the global price is back to 500 د';

  reset role;
  assert exists (select 1 from public.audit_logs a where a.action = 'pricing.rule_delete'
                 and a.old_data->>'project_id' = v_project::text and jsonb_array_length(a.old_data->'markups') = 1),
    'the override removal is logged with what it removed';
  assert exists (select 1 from public.audit_logs a where a.action = 'pricing.cost_item_delete'
                 and a.entity_id = current_setting('test.tp_item_tree')), 'a removed cost line is logged';
  set local role authenticated;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Per-project classes and down payment percentages (plan Q-13 / P1-7, Q-1 / P1-2)
-- ---------------------------------------------------------------------------

do $$
declare
  v_reason   text := current_setting('test.tp_reason');
  v_project  uuid := current_setting('test.tp_project')::uuid;
  v_project2 uuid := current_setting('test.tp_project_2')::uuid;
  v_7x5      uuid := current_setting('test.tp_7x5')::uuid;
  v_4x15     uuid := current_setting('test.tp_4x15')::uuid;
  v_dpp_20   uuid := current_setting('test.tp_dpp_20')::uuid;
  v_q        jsonb;
  v_codes    text[];
  v_all      bigint;
begin
  -- Classes: the project sells 7 × 5 only; a repeated id counts once
  perform public.staff_save_project_spacing_classes(v_project, array[v_7x5, v_7x5], v_reason);
  assert (select count(*) from public.project_spacing_classes where project_id = v_project) = 1,
    'a pricing user reads the project classes, and a repeated id is saved once';
  v_q := public.staff_tree_quote(v_4x15, 1, v_project);
  assert v_q->'price'->>'reason' = 'spacing_not_allowed' and v_q->'total_price_millimes' = 'null'::jsonb,
    'a class the project does not sell is not priced for it, got ' || v_q::text;
  assert (public.staff_tree_quote(v_7x5, 1, v_project)->'price'->>'price_per_tree_millimes')::bigint = 500000,
    'the class the project sells is priced';
  assert (public.staff_tree_quote(v_4x15, 1, v_project2)->'price'->>'ok')::boolean
     and (public.staff_tree_quote(v_4x15, 1)->'price'->>'ok')::boolean,
    'another project and the global scope still price every active class';

  perform pg_temp.tp_expect(format('select public.staff_save_project_spacing_classes(%L::uuid, %L::uuid[], %L)',
    v_project, array[current_setting('test.tp_retired_class')::uuid], v_reason), 'invalid_spacing_class');
  perform pg_temp.tp_expect(format('select public.staff_save_project_spacing_classes(%L::uuid, %L::uuid[], %L)',
    v_project, array[gen_random_uuid()], v_reason), 'invalid_spacing_class');
  perform pg_temp.tp_expect(format('select public.staff_save_project_spacing_classes(%L::uuid, array[null]::uuid[], %L)',
    v_project, v_reason), 'invalid_spacing_class');
  perform pg_temp.tp_expect(format('select public.staff_save_project_spacing_classes(%L::uuid, %L::uuid[], %L)',
    gen_random_uuid(), array[v_7x5], v_reason), 'invalid_pricing_rule');
  perform pg_temp.tp_expect(format('select public.staff_save_project_spacing_classes(%L::uuid, %L::uuid[], null)',
    v_project, array[v_7x5]), 'reason_required');
  assert (select count(*) from public.project_spacing_classes where project_id = v_project) = 1,
    'a refused save leaves the project classes as they were';

  -- Percentages: the project offers 20% only
  perform public.staff_save_project_down_percents(v_project, array[v_dpp_20], v_reason);
  perform pg_temp.tp_expect(format('select public.staff_save_project_down_percents(%L::uuid, %L::uuid[], %L)',
    v_project, array[current_setting('test.tp_dpp_retired')::uuid], v_reason), 'invalid_down_payment_percent');
  perform pg_temp.tp_expect(format('select public.staff_save_project_down_percents(%L::uuid, %L::uuid[], %L)',
    v_project, array[current_setting('test.tp_dur_60')::uuid], v_reason), 'invalid_down_payment_percent');
  perform pg_temp.tp_expect(format('select public.staff_save_project_down_percents(%L::uuid, array[null]::uuid[], %L)',
    v_project, v_reason), 'invalid_down_payment_percent');
  perform pg_temp.tp_expect(format('select public.staff_save_project_down_percents(%L::uuid, null, %L)',
    v_project, v_reason), 'invalid_down_payment_percent');

  reset role;
  v_all := (select count(*) from public.option_items where list_key = 'down_payment_percent' and is_active);
  select array_agg(o.code) into v_codes from app.project_down_percent_items(v_project) o;
  assert v_codes = array['dpp_20'], 'the narrowed project offers 20% only, got ' || coalesce(v_codes::text, 'none');
  assert (select count(*) from app.project_down_percent_items(v_project2)) = v_all
     and (select count(*) from app.project_down_percent_items(null)) = v_all,
    'a project without rows, and the global scope, offer every active percentage';

  assert exists (select 1 from public.audit_logs a where a.action = 'pricing.project_classes_save'
                 and a.entity_id = v_project::text and a.reason = v_reason
                 and jsonb_array_length(a.new_data->'classes') = 1 and a.old_data->'classes' = '[]'::jsonb),
    'the project classes are logged with the old and the new list';
  assert exists (select 1 from public.audit_logs a where a.action = 'pricing.project_down_percents_save'
                 and a.entity_id = v_project::text and a.reason = v_reason
                 and a.new_data->'percents'->0->>'code' = 'dpp_20'),
    'the project percentages are logged with the new list';
  set local role authenticated;

  -- An empty list gives the project every active entry again
  perform public.staff_save_project_spacing_classes(v_project, '{}', v_reason);
  perform public.staff_save_project_down_percents(v_project, '{}', v_reason);
  assert (public.staff_tree_quote(v_4x15, 1, v_project)->'price'->>'ok')::boolean, 'a cleared project sells every class again';

  reset role;
  assert (select count(*) from app.project_down_percent_items(v_project)) = v_all, 'a cleared project offers every percentage again';
  set local role authenticated;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 5 · The public quote: closed while the flag is internal, final figures only once public (addendum, §12)
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'internal' where key = 'pricing';
select set_config('request.jwt.claims', '', true);

do $$
declare
  v_q jsonb;
begin
  set local role anon;
  v_q := public.public_tree_quote(current_setting('test.tp_7x5')::uuid, 20);
  reset role;
  assert v_q->>'pricing' = 'closed', 'an internal module shows no price to a visitor, got ' || v_q::text;
  assert (v_q->>'area_per_tree_m2')::numeric = 35 and (v_q->>'trees')::integer = 20 and (v_q->>'total_area_m2')::numeric = 700,
    'the area is shown even while prices are closed, got ' || v_q::text;
  assert v_q->'price_per_tree_millimes' = 'null'::jsonb and v_q->'total_price_millimes' = 'null'::jsonb
     and v_q->'installments' = 'null'::jsonb, 'no price key is set while closed';
  assert v_q ?& array['spacing_class_id', 'label_ar', 'label_fr', 'row_spacing_m', 'tree_spacing_m', 'area_per_tree_m2',
                      'trees', 'total_area_m2', 'pricing', 'price_per_tree_millimes', 'total_price_millimes', 'installments'],
    'every key is always present';
  assert public.public_tree_quote((select id from public.tree_spacing_classes where code = 'tp_test_retired')) is null,
    'a retired class has no quote';
end $$;

update public.feature_flags set state = 'public' where key = 'pricing';

-- Markups from the Back Office (report v3 §11), set to the owner's examples whatever the live database holds
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.tp_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_reason text := current_setting('test.tp_reason');
  v_rows   jsonb := '[{"months": 36, "markup_bp": 1000}, {"months": 48, "markup_bp": 1400},
                      {"months": 60, "markup_bp": 1800}, {"months": 84, "markup_bp": 2500}]';
begin
  perform public.staff_save_financing_markups(null, v_rows, v_reason);

  perform pg_temp.tp_expect(format('select public.staff_save_financing_markups(null, %L::jsonb, %L)',
    '[{"months": 60, "markup_bp": 1800}, {"months": 60, "markup_bp": 900}]', v_reason), 'invalid_markup');
  perform pg_temp.tp_expect(format('select public.staff_save_financing_markups(null, %L::jsonb, %L)',
    '[{"months": 60, "markup_bp": -1}]', v_reason), 'invalid_markup');
  perform pg_temp.tp_expect(format('select public.staff_save_financing_markups(null, %L::jsonb, %L)',
    '[{"months": 96, "markup_bp": 1000}]', v_reason), 'duration_over_cap');
  assert (select count(*) from public.financing_markups where project_id is null) = 4, 'a refused save leaves the markups as they were';

  reset role;
  assert exists (select 1 from public.audit_logs a where a.action = 'pricing.markups_save' and a.reason = v_reason
                 and a.new_data->'rows' = v_rows and a.old_data ? 'rows'),
    'the markups are logged with the old and the new rows';
  set local role authenticated;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  v_class   uuid := current_setting('test.tp_7x5')::uuid;
  v_dpp_10  uuid := current_setting('test.tp_dpp_10')::uuid;
  v_dpp_30  uuid := current_setting('test.tp_dpp_30')::uuid;
  v_q       jsonb;
  v_i       jsonb;
  v_quotes  text := '';
  v_word    text;
begin
  set local role anon;

  -- Plan §1: 20 trees × 35 m² = 700 m², 20 × 500 د = 10,000 د
  v_q := public.public_tree_quote(v_class, 20);
  v_quotes := v_quotes || v_q::text;
  assert v_q->>'pricing' = 'ok' and (v_q->>'price_per_tree_millimes')::bigint = 500000
     and (v_q->>'total_price_millimes')::bigint = 10000000 and (v_q->>'total_area_m2')::numeric = 700
     and v_q->'installments' = 'null'::jsonb,
    'a public module shows 500 د per tree, 700 m² and 10,000 د for 20 trees, got ' || v_q::text;

  assert public.public_tree_quote(v_class, 0)->'trees' = 'null'::jsonb
     and public.public_tree_quote(v_class, 0)->'total_price_millimes' = 'null'::jsonb,
    'a tree count below one is ignored';

  -- Plan §5 phase 2: 10% over 5 years
  v_q := public.public_tree_quote(v_class, 20, 'installments', v_dpp_10, current_setting('test.tp_dur_60')::uuid);
  v_quotes := v_quotes || v_q::text;
  v_i := v_q->'installments';
  assert v_i->>'status' = 'ok'
     and (v_i->>'down_payment_percent')::numeric = 10
     and (v_i->>'down_payment_millimes')::bigint = 1000000
     and (v_i->>'total_financed_millimes')::bigint = 11620000
     and (v_i->>'remaining_millimes')::bigint = 10620000
     and (v_i->>'monthly_millimes')::bigint = 177000
     and (v_i->>'months')::integer = 60
     and (v_i->>'installments_count')::integer = 60
     and (v_i->>'last_installment_millimes')::bigint = 177000
     and (v_i->>'shortened')::boolean = false,
    '10% of 10,000 د over 60 months: 1,000 د down, the 9,000 د left at +18% = 10,620 د, 177 د × 60, got ' || v_q::text;

  v_q := public.public_tree_quote(v_class, 20, 'installments', v_dpp_10, current_setting('test.tp_dur_48')::uuid);
  v_quotes := v_quotes || v_q::text;
  v_i := v_q->'installments';
  assert (v_i->>'total_financed_millimes')::bigint = 11260000
     and (v_i->>'remaining_millimes')::bigint = 10260000
     and (v_i->>'monthly_millimes')::bigint = 214000
     and (v_i->>'installments_count')::integer = 48
     and (v_i->>'last_installment_millimes')::bigint = 202000,
    '10% over 48 months at +14%: the 9,000 د left become 10,260 د, 214 د × 47 then 202 د, got ' || v_q::text;

  v_q := public.public_tree_quote(v_class, 20, 'installments', v_dpp_30, current_setting('test.tp_dur_84')::uuid);
  v_quotes := v_quotes || v_q::text;
  v_i := v_q->'installments';
  assert (v_i->>'down_payment_percent')::numeric = 30
     and (v_i->>'down_payment_millimes')::bigint = 3000000
     and (v_i->>'total_financed_millimes')::bigint = 11750000
     and (v_i->>'remaining_millimes')::bigint = 8750000
     and (v_i->>'monthly_millimes')::bigint = 105000
     and (v_i->>'installments_count')::integer = 84
     and (v_i->>'last_installment_millimes')::bigint = 35000,
    '30% over 84 months at +25%: 3,000 د down, the 7,000 د left become 8,750 د, 105 د × 83 then 35 د, got ' || v_q::text;

  -- Plan Q-11: rounding the monthly amount up can shorten the plan
  v_i := public.public_tree_quote(v_class, 1, 'installments', v_dpp_10, current_setting('test.tp_dur_84')::uuid)->'installments';
  assert (v_i->>'down_payment_millimes')::bigint = 50000 and (v_i->>'remaining_millimes')::bigint = 563000
     and (v_i->>'monthly_millimes')::bigint = 7000 and (v_i->>'installments_count')::integer = 81
     and (v_i->>'last_installment_millimes')::bigint = 3000 and (v_i->>'shortened')::boolean,
    'one tree over 84 months: 7 د × 80 then 3 د, 81 installments, got ' || v_i::text;

  -- The down payment is rounded up to the price step: 10% of 414 د = 41.4 د → 42 د
  v_i := public.public_tree_quote(current_setting('test.tp_4x15')::uuid, 3, 'installments', v_dpp_10,
                                  current_setting('test.tp_dur_60')::uuid)->'installments';
  assert (v_i->>'down_payment_millimes')::bigint = 42000 and (v_i->>'total_financed_millimes')::bigint = 481000,
    '3 trees of 6 m² cost 414 د: 42 د down, the 372 د left become 439 د, 481 د in all, got ' || v_i::text;

  v_q := public.public_tree_quote(v_class, 20, 'installments', v_dpp_10, current_setting('test.tp_dur_72')::uuid);
  v_quotes := v_quotes || v_q::text;
  assert v_q->'installments'->>'status' = 'duration_not_priced' and v_q->'installments'->'monthly_millimes' = 'null'::jsonb
     and v_q->'installments'->'down_payment_percent' = 'null'::jsonb and v_q->'installments'->'down_payment_millimes' = 'null'::jsonb,
    'a duration without a markup is not priced and shows no figure, got ' || v_q::text;

  v_q := public.public_tree_quote(v_class, 20, 'installments', v_dpp_10, null);
  v_quotes := v_quotes || v_q::text;
  assert v_q->'installments'->>'status' = 'incomplete', 'a missing duration is incomplete, got ' || v_q::text;

  v_q := public.public_tree_quote(v_class, 20, 'installments',
                                  current_setting('test.tp_dur_60')::uuid, current_setting('test.tp_dur_60')::uuid);
  assert v_q->'installments'->>'status' = 'invalid_choice', 'a duration sent as the percentage is refused, got ' || v_q::text;
  v_q := public.public_tree_quote(v_class, 20, 'installments', v_dpp_10, v_dpp_10);
  assert v_q->'installments'->>'status' = 'invalid_choice', 'a percentage sent as the duration is refused, got ' || v_q::text;
  v_q := public.public_tree_quote(v_class, 20, 'installments',
                                  current_setting('test.tp_dpp_retired')::uuid, current_setting('test.tp_dur_60')::uuid);
  assert v_q->'installments'->>'status' = 'invalid_choice', 'a retired percentage is refused, got ' || v_q::text;

  v_q := public.public_tree_quote(v_class, 20, 'cash', v_dpp_10, current_setting('test.tp_dur_60')::uuid);
  assert v_q->'installments' = 'null'::jsonb, 'a cash quote has no installments';

  reset role;

  foreach v_word in array array['land_price', 'planting', 'extras', 'cost_per_tree', 'margin', 'markup', 'note_ar', 'markups_note_ar'] loop
    assert position(v_word in v_quotes) = 0, 'the public quote never shows «' || v_word || '»';
  end loop;

  -- The down payment is paid at the cash price, so one at or above it leaves nothing to finance
  v_q := app.financed_quote(1000000, 2000000, 60, null);
  assert v_q->>'reason' = 'down_covers_total' and (v_q->>'total_financed_millimes')::bigint = 1000000,
    'a down payment at or above the cash price is reported, got ' || v_q::text;
end $$;

-- ---------------------------------------------------------------------------
-- 6 · The duration cap (report v3 §8) and the percentage range hold on the lists, the markups and the setting
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.tp_expect($q$insert into public.option_items (list_key, code, label_ar, min_number, max_number)
    values ('duration', 'tree_pricing_test_96', 'مدة اختبار 96', 96, 96)$q$, 'duration_over_cap');
  perform pg_temp.tp_expect(format('update public.option_items set min_number = 60.5 where id = %L::uuid',
    current_setting('test.tp_dur_60')), 'duration_over_cap');
  perform pg_temp.tp_expect($q$insert into public.financing_markups (project_id, months, markup_bp) values (null, 96, 1000)$q$,
    'duration_over_cap');
  assert (select count(*) from public.option_items where list_key = 'duration' and code in ('d_36', 'd_48', 'd_60', 'd_84')
          and min_number <= app.setting_int('pricing.max_months', 84)) = 4, 'the seeded durations sit within the cap';

  perform pg_temp.tp_expect($q$insert into public.option_items (list_key, code, label_ar, min_number, max_number)
    values ('down_payment_percent', 'tree_pricing_test_0', 'نسبة 0', 0, 0)$q$, 'invalid_down_payment_percent');
  perform pg_temp.tp_expect($q$insert into public.option_items (list_key, code, label_ar, min_number, max_number)
    values ('down_payment_percent', 'tree_pricing_test_150', 'نسبة 150', 150, 150)$q$, 'invalid_down_payment_percent');
  perform pg_temp.tp_expect($q$insert into public.option_items (list_key, code, label_ar, min_number, max_number)
    values ('down_payment_percent', 'tree_pricing_test_range', 'نسبة 10 إلى 20', 10, 20)$q$, 'invalid_down_payment_percent');
  perform pg_temp.tp_expect(format('update public.option_items set min_number = 101, max_number = 101 where id = %L::uuid',
    current_setting('test.tp_dpp_10')), 'invalid_down_payment_percent');

  -- The 84-month items are active, so the cap cannot drop to 60
  perform pg_temp.tp_expect($q$update public.settings set value = to_jsonb(60) where key = 'pricing.max_months'$q$,
    'cap_below_durations');
  update public.option_items set is_active = false
  where list_key = 'duration' and is_active and min_number > 60;
  assert exists (select 1 from public.financing_markups where months = 84), 'an 84-month markup is still saved';
  perform pg_temp.tp_expect($q$update public.settings set value = to_jsonb(60) where key = 'pricing.max_months'$q$,
    'cap_below_durations');
  perform pg_temp.tp_expect($q$update public.settings set value = to_jsonb(0) where key = 'pricing.max_months'$q$,
    'invalid_pricing_rule');
  perform pg_temp.tp_expect($q$update public.settings set value = to_jsonb('sixty'::text) where key = 'pricing.max_months'$q$,
    'invalid_pricing_rule');
end $$;

-- ---------------------------------------------------------------------------
-- 7 · The admin adds, edits and removes a class without a developer (addendum: 9 × 9 = 81 m²)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.tp_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_reason  text := current_setting('test.tp_reason');
  v_project uuid := current_setting('test.tp_project')::uuid;
  v_class   uuid := current_setting('test.tp_7x5')::uuid;
  v_id      uuid;
  v_i       jsonb;
begin
  v_id := public.staff_save_spacing_class('{"code": "tp_test_9x9", "label_ar": "مكثّف 9×9", "label_fr": "Intensif 9×9",
                                            "row_spacing_m": 9, "tree_spacing_m": 9, "sort_order": 45}', v_reason);
  perform set_config('test.tp_9x9', v_id::text, true);
  assert (select area_m2 from public.tree_spacing_classes where id = v_id) = 81, 'a 9 × 9 class holds 81 m² per tree';

  perform public.staff_save_spacing_class(jsonb_build_object('id', v_id, 'code', 'tp_test_9x9', 'label_ar', 'مكثّف 9×8',
                                                             'row_spacing_m', 9, 'tree_spacing_m', 8), v_reason);
  assert (select area_m2 = 72 and sort_order = 45 and is_active from public.tree_spacing_classes where id = v_id),
    'an edit recomputes the area and keeps the fields it does not name';

  perform pg_temp.tp_expect(format('select public.staff_save_spacing_class(%L::jsonb, %L)',
    '{"code": "int_7x5", "label_ar": "نسخة", "row_spacing_m": 7, "tree_spacing_m": 5}', v_reason), 'duplicate_code');
  perform pg_temp.tp_expect(format('select public.staff_save_spacing_class(%L::jsonb, %L)',
    '{"code": "Bad Code", "label_ar": "فئة", "row_spacing_m": 7, "tree_spacing_m": 5}', v_reason), 'invalid_spacing_class');
  perform pg_temp.tp_expect(format('select public.staff_save_spacing_class(%L::jsonb, %L)',
    '{"code": "tp_test_zero", "label_ar": "فئة", "row_spacing_m": 0, "tree_spacing_m": 5}', v_reason), 'invalid_spacing_class');

  -- A class a project sells cannot be removed until the project drops it
  perform public.staff_save_project_spacing_classes(v_project, array[v_id], v_reason);
  perform pg_temp.tp_expect(format('select public.staff_delete_spacing_class(%L::uuid, %L)', v_id, v_reason), 'spacing_in_use');
  perform public.staff_save_project_spacing_classes(v_project, '{}', v_reason);

  perform public.staff_delete_spacing_class(v_id, v_reason);
  assert not exists (select 1 from public.tree_spacing_classes where id = v_id), 'an unused class is removed';

  -- The staff preview carries the internal breakdown and the markup, unlike the public quote
  v_i := public.staff_tree_quote(v_class, 20, null, 20, 60)->'installments';
  assert (v_i->>'markup_bp')::integer = 1800 and (v_i->>'down_payment_percent')::numeric = 20
     and (v_i->>'down_payment_millimes')::bigint = 2000000 and (v_i->>'total_financed_millimes')::bigint = 11440000
     and (v_i->>'remaining_millimes')::bigint = 9440000 and (v_i->>'monthly_millimes')::bigint = 158000,
    'the staff quote applies +18% to the 8,000 د left after 20% of 10,000 د, and shows the markup, got ' || v_i::text;
  assert public.staff_tree_quote(v_class, 20, null, 20, 120)->'installments'->>'reason' = 'too_many_months',
    'a duration above the cap is reported to staff';
  assert public.staff_tree_quote(v_class, 20, null, 0, 60)->'installments'->>'reason' = 'invalid_input'
     and public.staff_tree_quote(v_class, 20, null, 100.5, 60)->'installments'->>'reason' = 'invalid_input'
     and (public.staff_tree_quote(v_class, 20, null, 101, 60)->'installments'->>'down_payment_percent')::numeric = 101,
    'a percentage outside 0 < p ≤ 100 is refused and echoed back';

  reset role;
  assert exists (select 1 from public.audit_logs a where a.action = 'pricing.spacing_class_delete'
                 and a.entity_id = v_id::text and a.reason = v_reason and a.old_data->>'code' = 'tp_test_9x9'),
    'the removal is logged with the removed class';
  set local role authenticated;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.tp_com'), 'role', 'authenticated')::text, true);

do $$
begin
  perform pg_temp.tp_expect(format('select public.staff_tree_quote(%L::uuid)', current_setting('test.tp_7x5')), 'forbidden');
  perform pg_temp.tp_expect(format('select public.staff_delete_spacing_class(%L::uuid, %L)',
    current_setting('test.tp_4x15'), current_setting('test.tp_reason')), 'forbidden');
end $$;

reset role;
