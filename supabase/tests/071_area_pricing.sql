-- An offer prices from its own area per tree (owner, 2026-10-03: «there is no need for the space surface»).
-- app.tree_price_for_area / app.tree_price, app.project_area_per_tree, app.project_sells_by_tree,
-- app.project_price_basis, app.project_quote_payload, app.contract_price_per_tree, public.public_projects().
-- Plan docs/plan-zitouna.md Q-13, P1-7; report v3 §8, §10-§12; 0031, 0045, 0034, 0035; PRJ-03.
--
-- ███ THIS FILE REQUIRES supabase/pending/bb_80_area_pricing.sql TO BE APPLIED.
-- ███ Until then it fails under `npm run db:test` with «function app.tree_price_for_area(...) does not
-- ███ exist», the same way 012 §5 depends on bb_02. To run it against the draft without applying anything:
-- ███   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_80_area_pricing.sql supabase/tests/071_area_pricing.sql
--
-- One thing NOT to chase while measuring this: pairing bb_80 with supabase/tests/005_start_custom_trees.sql
-- in a single dry run fails on «SET TRANSACTION ISOLATION LEVEL must be called before any query». That is
-- 005's line 7, not this change — 005 fails the same way when paired with any other test file, and passes on
-- its own. Measure one test per dry run.
--
-- Runs against the live database inside the runner's rolled-back transaction. Every rule this file measures —
-- the global pricing row, the two bounds, the `pricing` and `projects` flags — is set explicitly here, because
-- the Back Office may have changed any of them and a price test that reads live settings proves nothing.
--
-- Sections 1, 2, 5 and 6 run as the migration owner, because the app.* engine is revoked from anon and
-- authenticated and asserting that is part of §6. Section 3 is a finance user going through the Back Office
-- RPC; section 4 is a visitor.

-- ---------------------------------------------------------------------------
-- 0 · Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'public' where key in ('projects', 'pricing');

-- The owner's example from the addendum: 35 m² × 10 د = 350 د, + 50 د planting = 400 د, + 25% = 500 د.
-- The live database may hold global cost lines; this file measures its own.
delete from public.tree_cost_items where project_id is null;
update public.tree_pricing_rules
set land_price_per_m2_millimes = 10000, planting_cost_per_tree_millimes = 50000,
    margin_mode = 'percent', margin_percent_bp = 2500, margin_fixed_millimes = null,
    price_rounding_millimes = 1000, monthly_rounding_millimes = 1000,
    annual_fee_per_tree_millimes = 150000, use_global_cost_items = true
where project_id is null;

update public.settings set value = to_jsonb(2)    where key = 'pricing.area_per_tree_min_m2';
update public.settings set value = to_jsonb(2000) where key = 'pricing.area_per_tree_max_m2';
update public.settings set value = to_jsonb(2)    where key = 'pricing.area_per_tree_decimals';

do $$
declare
  v_fin uuid := gen_random_uuid();
  v_id  uuid;
begin
  insert into auth.users (id, email) values (v_fin, 'area-pricing-finance-' || v_fin || '@test.local');
  update public.profiles set full_name = 'Area Pricing Test', is_active = true where id = v_fin;
  insert into public.user_roles (user_id, role) values (v_fin, 'finance');
  perform set_config('test.ap_fin', v_fin::text, true);

  perform set_config('test.ap_5x5', (select id::text from public.tree_spacing_classes where code = 'int_5x5'), true);
  perform set_config('test.ap_7x5', (select id::text from public.tree_spacing_classes where code = 'int_7x5'), true);
  perform set_config('test.ap_24x24', (select id::text from public.tree_spacing_classes where code = 'trad_wide_24x24'), true);

  -- AREA · no class; 25,000 m² over 1,000 trees = exactly 25 m², the area of int_5x5.
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-AREA', 'عرض اختبار بالمساحة', 34, 25000, 1000, 'published') returning id into v_id;
  perform set_config('test.ap_area', v_id::text, true);

  -- TWIN · the same two numbers AND the 25 m² class attached: the figure the AREA offer must match.
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-TWIN', 'عرض اختبار بالفئة', 34, 25000, 1000, 'published') returning id into v_id;
  insert into public.project_spacing_classes (project_id, spacing_class_id)
  values (v_id, current_setting('test.ap_5x5')::uuid);
  perform set_config('test.ap_twin', v_id::text, true);

  -- CLASS · lists the 25 m² class, but its own two numbers say 576 m². Precedence: the class wins.
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-CLASS', 'عرض اختبار الأولوية', 34, 57600, 100, 'published') returning id into v_id;
  insert into public.project_spacing_classes (project_id, spacing_class_id)
  values (v_id, current_setting('test.ap_5x5')::uuid);
  perform set_config('test.ap_class', v_id::text, true);

  -- TWOCLASS · two classes and none chosen: 'required', and no fallback to its own 100 m² either.
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-TWOCLASS', 'عرض اختبار فئتين', 34, 50000, 500, 'published') returning id into v_id;
  insert into public.project_spacing_classes (project_id, spacing_class_id)
  values (v_id, current_setting('test.ap_5x5')::uuid), (v_id, current_setting('test.ap_7x5')::uuid);
  perform set_config('test.ap_twoclass', v_id::text, true);

  -- ZERO · an area and a tree count of zero. NULLTREES · an area and no tree count at all.
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-ZERO', 'عرض اختبار بلا زيتونات', 34, 30000, 0, 'published') returning id into v_id;
  perform set_config('test.ap_zero', v_id::text, true);
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-NULLTREES', 'عرض اختبار عدد فارغ', 34, 30000, null, 'published') returning id into v_id;
  perform set_config('test.ap_nulltrees', v_id::text, true);

  -- NOAREA · trees but no area (projects_total_area_m2_check forbids 0, so the column is left null).
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-NOAREA', 'عرض اختبار بلا مساحة', 34, null, 500, 'published') returning id into v_id;
  perform set_config('test.ap_noarea', v_id::text, true);

  -- TINY · 200 m² over 1,000 trees = 0.2 m² per tree. HUGE · 52,000 m² over one tree.
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-TINY', 'عرض اختبار مساحة صغيرة', 34, 200, 1000, 'published') returning id into v_id;
  perform set_config('test.ap_tiny', v_id::text, true);
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-HUGE', 'عرض اختبار مساحة كبيرة', 34, 52000, 1, 'published') returning id into v_id;
  perform set_config('test.ap_huge', v_id::text, true);

  -- INTERNAL · priceable, not published: the Back Office prices it, a visitor sees nothing. This is DEMO-14.
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-INTERNAL', 'عرض اختبار داخلي', 34, 25000, 571, 'internal') returning id into v_id;
  perform set_config('test.ap_internal', v_id::text, true);

  -- SOLDOUT · visible to a visitor (projects.list_closed) but not 'published', which is the status the
  -- payload's own 'not_offered' gate turns on. Priceable from its own area, and still not offered.
  insert into public.projects (code, name, governorate_id, total_area_m2, tree_count, status)
  values ('AP80-SOLDOUT', 'عرض اختبار مباع', 34, 25000, 1000, 'sold_out') returning id into v_id;
  perform set_config('test.ap_soldout', v_id::text, true);
end $$;

-- The 'not_offered' gate is only reachable while closed offers stay listed; pin it, the Back Office may differ.
update public.settings set value = to_jsonb(true) where key = 'projects.list_closed';

-- ---------------------------------------------------------------------------
-- 1 · The split kept the signature, the payload and the 0045 annual fee
-- ---------------------------------------------------------------------------

do $$
declare
  v_by_class jsonb;
  v_by_area  jsonb;
begin
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname = 'tree_price'
            and pg_get_function_identity_arguments(p.oid) = 'p_spacing_class uuid, p_project uuid') = 1,
    'app.tree_price(uuid, uuid) still exists once, with its original arguments';

  -- The owner's example, through the class and through the bare area: the same jsonb, key for key.
  v_by_class := app.tree_price(current_setting('test.ap_7x5')::uuid);
  v_by_area  := app.tree_price_for_area(35);
  assert (v_by_class->>'ok')::boolean and (v_by_class->>'price_per_tree_millimes')::bigint = 500000
     and (v_by_class->>'land_cost_millimes')::bigint = 350000
     and (v_by_class->>'cost_per_tree_millimes')::bigint = 400000,
    'the owner example still prices at 500 د through the class, got ' || v_by_class::text;
  assert v_by_class = v_by_area,
    'a class and its own area_m2 give the identical payload; class ' || v_by_class::text || ' area ' || v_by_area::text;

  -- 0045, not 0031: copying the older source would have dropped the yearly fee out of every quote.
  assert (v_by_area->>'annual_fee_per_tree_millimes')::bigint = 150000
     and v_by_area->'sources' ? 'annual_fee',
    'the payload still carries the annual fee and its source (0045), got ' || v_by_area::text;

  -- The two refusals app.tree_price keeps for itself.
  assert app.tree_price(gen_random_uuid())->>'reason' = 'spacing_not_found', 'an unknown class is not priced';
  assert app.tree_price(current_setting('test.ap_24x24')::uuid, current_setting('test.ap_class')::uuid)->>'reason'
         = 'spacing_not_allowed',
    'a class this offer does not sell is still refused';

  -- The structural guard the area function owns: it used to return ok with a null price.
  assert app.tree_price_for_area(null)->>'reason' = 'area_not_set', 'a null area is refused, not priced';
  assert app.tree_price_for_area(0)->>'reason' = 'area_not_set', 'an area of zero is refused, not priced';
  assert app.tree_price_for_area(-5)->>'reason' = 'area_not_set', 'a negative area is refused, not priced';

  -- A per_m2 cost line still multiplies by the area, which is the only thing the class ever supplied.
  insert into public.tree_cost_items (project_id, label_ar, basis, amount_millimes)
  values (current_setting('test.ap_area')::uuid, 'سطر اختبار للمتر المربع', 'per_m2', 4000);
  assert (app.tree_price_for_area(25, current_setting('test.ap_area')::uuid)->>'price_per_tree_millimes')::bigint
         > (app.tree_price_for_area(25)->>'price_per_tree_millimes')::bigint,
    'an offer cost line per m² moves a price computed from an area, exactly as it moves one from a class';
  delete from public.tree_cost_items where project_id = current_setting('test.ap_area')::uuid;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · The basis: the division, the precedence and the bounds
-- ---------------------------------------------------------------------------

do $$
declare
  v_b record;
begin
  -- An offer with an area and no class prices from total_area_m2 / tree_count.
  select * into v_b from app.project_price_basis(current_setting('test.ap_area')::uuid, null);
  assert v_b.status = 'ok' and v_b.basis = 'project_area'
     and v_b.area_m2 = 25 and v_b.spacing_class_id is null and v_b.blocked_ar is null,
    'an offer with no class prices from its own area, got ' || to_jsonb(v_b)::text;
  assert app.project_area_per_tree(current_setting('test.ap_area')::uuid) = 25,
    '25,000 m² over 1,000 trees is 25 m² per tree';
  assert app.project_sells_by_tree(current_setting('test.ap_area')::uuid), 'and the offer is sold by the tree';

  -- PRECEDENCE · AP80-CLASS lists the 25 m² class and measures 576 m² per tree. The class wins.
  assert app.project_area_per_tree(current_setting('test.ap_class')::uuid) = 576,
    'the offer really does measure 576 m² per tree — the class is overriding something, not nothing';
  select * into v_b from app.project_price_basis(current_setting('test.ap_class')::uuid, null);
  assert v_b.basis = 'class' and v_b.area_m2 = 25
     and v_b.spacing_class_id = current_setting('test.ap_5x5')::uuid,
    'the attached class wins over the offer''s own 576 m², got ' || to_jsonb(v_b)::text;

  -- A class the offer does not sell is refused outright — it does NOT quietly fall back to the offer's own
  -- 576 m², even though that is the very area of the class being refused.
  select * into v_b from app.project_price_basis(current_setting('test.ap_class')::uuid,
                                                 current_setting('test.ap_24x24')::uuid);
  assert v_b.status = 'not_allowed' and v_b.basis is null and v_b.area_m2 is null,
    'a class outside the offer''s list refuses and never falls back, got ' || to_jsonb(v_b)::text;

  -- Two classes and none chosen: still 'required', still no fallback. Listing classes IS the decision.
  select * into v_b from app.project_price_basis(current_setting('test.ap_twoclass')::uuid, null);
  assert v_b.status = 'required' and v_b.basis is null and v_b.area_m2 is null,
    'two classes and none chosen stays «choose one», got ' || to_jsonb(v_b)::text;

  -- THE DIVISION · null, never a 22012.
  assert app.project_area_per_tree(current_setting('test.ap_zero')::uuid) is null,
    'a tree count of zero divides nothing and raises nothing';
  assert app.project_area_per_tree(current_setting('test.ap_nulltrees')::uuid) is null,
    'a null tree count divides nothing and raises nothing';
  assert app.project_area_per_tree(current_setting('test.ap_noarea')::uuid) is null, 'a null area divides nothing';
  assert app.project_area_per_tree(gen_random_uuid()) is null, 'an offer that does not exist divides nothing';

  select * into v_b from app.project_price_basis(current_setting('test.ap_zero')::uuid, null);
  assert v_b.status = 'trees_missing' and v_b.basis is null and v_b.area_m2 is null
     and v_b.blocked_ar like '%عدد الزيتونات%',
    'a tree count of zero is named, in Arabic the Back Office can print, got ' || to_jsonb(v_b)::text;
  select * into v_b from app.project_price_basis(current_setting('test.ap_nulltrees')::uuid, null);
  assert v_b.status = 'trees_missing' and v_b.blocked_ar is not null,
    'and so is a null tree count, got ' || to_jsonb(v_b)::text;
  select * into v_b from app.project_price_basis(current_setting('test.ap_noarea')::uuid, null);
  assert v_b.status = 'area_missing' and v_b.blocked_ar like '%المساحة الجملية%',
    'a missing area is named separately from a missing tree count, got ' || to_jsonb(v_b)::text;
  assert not app.project_sells_by_tree(current_setting('test.ap_zero')::uuid)
     and not app.project_sells_by_tree(current_setting('test.ap_noarea')::uuid),
    'an offer with no class and no measurable pair is not sold by the tree at all';

  -- THE BOUNDS · an absurd result refuses and says the figure out loud.
  select * into v_b from app.project_price_basis(current_setting('test.ap_tiny')::uuid, null);
  assert v_b.status = 'area_out_of_range' and v_b.basis is null and v_b.area_m2 = 0.2,
    '0.2 m² per tree is a typo, not a grove, got ' || to_jsonb(v_b)::text;
  assert v_b.blocked_ar like '%0.2%' and v_b.blocked_ar like '%2000%',
    'the refusal prints the offending figure and the bounds, got ' || coalesce(v_b.blocked_ar, 'none');
  select * into v_b from app.project_price_basis(current_setting('test.ap_huge')::uuid, null);
  assert v_b.status = 'area_out_of_range' and v_b.basis is null and v_b.area_m2 = 52000,
    '52,000 m² per tree is a tree count of 1, got ' || to_jsonb(v_b)::text;
  -- An out-of-bounds offer is still the right SHAPE: one number is wrong, it is not a legacy offer.
  assert app.project_sells_by_tree(current_setting('test.ap_tiny')::uuid),
    'an out-of-bounds offer is a data problem to fix, not a different kind of offer';

  -- Nothing is hard-coded: move the ceiling and the same offer prices.
  update public.settings set value = to_jsonb(60000) where key = 'pricing.area_per_tree_max_m2';
  select * into v_b from app.project_price_basis(current_setting('test.ap_huge')::uuid, null);
  assert v_b.status = 'ok' and v_b.basis = 'project_area' and v_b.area_m2 = 52000,
    'the ceiling is read from settings, got ' || to_jsonb(v_b)::text;
  update public.settings set value = to_jsonb(2000) where key = 'pricing.area_per_tree_max_m2';

  update public.settings set value = to_jsonb(30) where key = 'pricing.area_per_tree_min_m2';
  select * into v_b from app.project_price_basis(current_setting('test.ap_area')::uuid, null);
  assert v_b.status = 'area_out_of_range', 'the floor is read from settings too, got ' || to_jsonb(v_b)::text;
  -- …and a bound on a DERIVED area never vetoes a density a human picked from the table.
  select * into v_b from app.project_price_basis(current_setting('test.ap_twin')::uuid, null);
  assert v_b.status = 'ok' and v_b.basis = 'class' and v_b.area_m2 = 25,
    'a floor of 30 m² does not refuse an attached 25 m² class, got ' || to_jsonb(v_b)::text;
  assert (app.tree_price(current_setting('test.ap_5x5')::uuid, current_setting('test.ap_twin')::uuid)
          ->>'price_per_tree_millimes')::bigint = 375000,
    'and the class still prices while the floor sits above it';
  update public.settings set value = to_jsonb(2) where key = 'pricing.area_per_tree_min_m2';

  -- The shipped defaults contain every class, so applying bb_80 refuses no offer that prices today.
  assert not exists (select 1 from public.tree_spacing_classes c
                     where c.is_active and (c.area_m2 < 2 or c.area_m2 > 2000)),
    'the default bounds contain all eight spacing classes';

  -- A contract on a classless offer can price (0045 §28); an ambiguous one still cannot.
  assert app.contract_price_per_tree(current_setting('test.ap_area')::uuid, null) = 375000,
    'a contract on an offer with no class prices from its own area';
  assert app.contract_price_per_tree(current_setting('test.ap_twin')::uuid, null) = 375000,
    'a contract on the class offer is unchanged';
  assert app.contract_price_per_tree(current_setting('test.ap_twoclass')::uuid, null) is null,
    'two classes and no demand naming one is still genuinely ambiguous';
  assert app.contract_price_per_tree(current_setting('test.ap_zero')::uuid, null) is null,
    'an offer with no tree count still prices nothing';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · The Back Office card: /admin/projects/<id>?tab=card, as Finance
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ap_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_area jsonb;
  v_twin jsonb;
  v_q    jsonb;
  v_576  bigint;
begin
  v_area := public.staff_project_quote(current_setting('test.ap_area')::uuid, p_trees => 10);
  v_twin := public.staff_project_quote(current_setting('test.ap_twin')::uuid, p_trees => 10);

  -- The complaint: the card refused to compute a price until a spacing class was marked.
  assert v_area->>'pricing' = 'ok' and (v_area->>'price_per_tree_millimes')::bigint > 0,
    'the offer with no class now has a price on the card, got ' || v_area::text;
  assert v_area->>'price_basis' = 'project_area' and v_twin->>'price_basis' = 'class',
    'the two offers reach the same area by different routes, got '
    || coalesce(v_area->>'price_basis', 'null') || ' / ' || coalesce(v_twin->>'price_basis', 'null');

  -- THE FIGURE IS THE SAME FIGURE. Priced from its own 25 m², the offer costs what the 25 m² class costs.
  assert (v_area->>'price_per_tree_millimes')::bigint = (v_twin->>'price_per_tree_millimes')::bigint
     and (v_area->>'total_price_millimes')::bigint = (v_twin->>'total_price_millimes')::bigint
     and (v_area->>'annual_fee_per_tree_millimes')::bigint = (v_twin->>'annual_fee_per_tree_millimes')::bigint
     and (v_area->>'annual_fee_total_millimes')::bigint = (v_twin->>'annual_fee_total_millimes')::bigint
     and (v_area->>'area_per_tree_m2')::numeric = (v_twin->>'area_per_tree_m2')::numeric
     and (v_area->>'total_area_m2')::numeric = (v_twin->>'total_area_m2')::numeric,
    'area and class must agree to the millime; area ' || v_area::text || ' class ' || v_twin::text;

  -- 25 m² × 10 د = 250 د, + 50 د = 300 د, + 25% = 375 د, and the total is multiplied in Postgres.
  assert (v_area->>'price_per_tree_millimes')::bigint = 375000
     and (v_area->>'total_price_millimes')::bigint = 3750000
     and (v_area->>'total_area_m2')::numeric = 250,
    'the figures are the rule applied to 25 m², got ' || v_area::text;

  -- What the screens read: a class status only when there is a class; sold by the tree either way.
  assert v_area->>'spacing_status' is null and v_area->>'spacing_class_id' is null
     and (v_area->>'on_tree_pricing')::boolean,
    'no class means no class status, and the offer is still sold by the tree, got ' || v_area::text;
  assert v_twin->>'spacing_status' = 'ok' and (v_twin->>'on_tree_pricing')::boolean,
    'the class offer keeps its status, got ' || v_twin::text;
  -- An offer that lists no class publishes no class menu: there is nothing for a visitor to pick.
  assert v_area->'choices'->'spacing_classes' = '[]'::jsonb,
    'the class picker stays empty for an offer with no class, got ' || (v_area->'choices')::text;
  -- Finance sees the breakdown (app.can_price), and it is the area's breakdown.
  assert (v_area->'price'->>'ok')::boolean and (v_area->'price'->>'area_m2')::numeric = 25,
    'Finance reads the breakdown the price was built from, got ' || coalesce((v_area->'price')::text, 'null');

  -- PRECEDENCE on the card: the class price is charged, not the measured one.
  v_q   := public.staff_project_quote(current_setting('test.ap_class')::uuid, p_trees => 10);
  v_576 := (v_q->>'price_per_tree_millimes')::bigint;
  assert (v_q->>'area_per_tree_m2')::numeric = 25 and v_576 = 375000,
    'the card prices AP80-CLASS from its 25 m² class, not its 576 m² of land, got ' || v_q::text;

  -- Two classes and none chosen: unchanged, «choose one».
  v_q := public.staff_project_quote(current_setting('test.ap_twoclass')::uuid, p_trees => 10);
  assert v_q->>'pricing' = 'unavailable' and v_q->>'spacing_status' = 'required'
     and v_q->>'price_per_tree_millimes' is null,
    'the two-class offer prices nothing until a class is chosen, got ' || v_q::text;

  -- A refusal in words, not a price nobody should trust.
  v_q := public.staff_project_quote(current_setting('test.ap_tiny')::uuid, p_trees => 10);
  assert v_q->>'pricing' = 'unavailable' and v_q->>'price_per_tree_millimes' is null
     and v_q->>'basis_status' = 'area_out_of_range' and v_q->>'blocked_ar' like '%0.2%'
     and v_q->'price'->>'reason' = 'area_out_of_range',
    'an out-of-bounds offer is refused with the figure and the fix, got ' || v_q::text;

  v_q := public.staff_project_quote(current_setting('test.ap_zero')::uuid, p_trees => 10);
  assert v_q->>'pricing' = 'legacy' and v_q->>'price_per_tree_millimes' is null
     and v_q->>'total_price_millimes' is null and v_q->>'basis_status' = 'trees_missing'
     and v_q->>'blocked_ar' is not null,
    'an offer with neither a class nor a tree count is still «not sold by the tree», and says why, got ' || v_q::text;

  -- The internal offer prices in the Back Office — this is the DEMO-14 / DEMO-15 case.
  v_q := public.staff_project_quote(current_setting('test.ap_internal')::uuid, p_trees => 10);
  assert v_q->>'pricing' = 'ok' and v_q->>'price_basis' = 'project_area'
     and (v_q->>'area_per_tree_m2')::numeric = 43.78,
    'an unpublished offer prices for staff, from 25,000 / 571 = 43.78 m², got ' || v_q::text;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 4 · The public side: the same gates, a wider source for the figure
-- ---------------------------------------------------------------------------

do $$
declare
  v_p    record;
  v_code jsonb;
  v_q    jsonb;
begin
  set local role anon;

  select * into v_p from public.public_projects() r where r.code = 'AP80-AREA';
  assert v_p.on_tree_pricing and v_p.min_price_per_tree_millimes = 375000
     and v_p.area_per_tree_min_m2 = 25 and v_p.area_per_tree_max_m2 = 25,
    'the published offer with no class now lists its area and its price, got ' || to_jsonb(v_p)::text;

  select * into v_p from public.public_projects() r where r.code = 'AP80-TWIN';
  assert v_p.on_tree_pricing and v_p.min_price_per_tree_millimes = 375000 and v_p.area_per_tree_min_m2 = 25,
    'the class offer is unchanged, to the millime, got ' || to_jsonb(v_p)::text;

  select * into v_p from public.public_projects() r where r.code = 'AP80-CLASS';
  assert v_p.min_price_per_tree_millimes = 375000 and v_p.area_per_tree_min_m2 = 25,
    'the public listing obeys the same precedence as the Back Office, got ' || to_jsonb(v_p)::text;

  select * into v_p from public.public_projects() r where r.code = 'AP80-TWOCLASS';
  assert v_p.min_price_per_tree_millimes = 375000 and v_p.area_per_tree_min_m2 = 25
     and v_p.area_per_tree_max_m2 = 35,
    'an offer listing two classes still publishes the cheapest of them and the range, got ' || to_jsonb(v_p)::text;

  foreach v_code in array array['"AP80-TINY"'::jsonb, '"AP80-HUGE"', '"AP80-ZERO"', '"AP80-NOAREA"', '"AP80-NULLTREES"'] loop
    select * into v_p from public.public_projects() r where r.code = v_code #>> '{}';
    assert v_p.min_price_per_tree_millimes is null,
      'an offer whose own numbers are unusable publishes no price: ' || (v_code #>> '{}') || ' ' || to_jsonb(v_p)::text;
  end loop;
  assert not (select r.on_tree_pricing from public.public_projects() r where r.code = 'AP80-ZERO'),
    'an offer with no class and no tree count is not sold by the tree';

  -- PRJ-03: the breakdown, the route and the staff refusal text never reach a visitor. 020_project_quote.sql
  -- asserts the whole visitor payload against a key whitelist; these are the three keys bb_80 adds, and they
  -- must not be among them — a visitor needs the area and the price, not an internal judgement of the offer.
  v_q := public.public_project_quote(current_setting('test.ap_area')::uuid, p_trees => 10);
  assert v_q->>'pricing' = 'ok' and (v_q->>'price_per_tree_millimes')::bigint = 375000
     and (v_q->>'area_per_tree_m2')::numeric = 25,
    'a visitor on a published priced offer sees the area and the price, got ' || v_q::text;
  assert not (v_q ? 'price') and not (v_q ? 'blocked_ar')
     and not (v_q ? 'price_basis') and not (v_q ? 'basis_status'),
    'and never the cost breakdown, the route or the staff refusal text, got ' || v_q::text;
  v_q := public.public_project_quote(current_setting('test.ap_tiny')::uuid, p_trees => 10);
  assert not (v_q ? 'blocked_ar') and not (v_q ? 'basis_status') and not (v_q ? 'price'),
    'nor on a refused offer — «0.2 م² للزيتونة» is a Back Office sentence, got ' || v_q::text;

  -- An internal offer prices in the Back Office and shows a visitor nothing (DEMO-14, DEMO-15): it never
  -- gets as far as the payload, because public_project_quote refuses an invisible offer outright.
  assert public.public_project_quote(current_setting('test.ap_internal')::uuid, p_trees => 10) is null,
    'an internal offer answers a visitor with nothing at all, whatever its area says';
  assert not exists (select 1 from public.public_projects() r where r.code = 'AP80-INTERNAL'),
    'and it is not in the public listing at all';

  -- A closed offer IS listed, and the payload's own gate still refuses to price it for a visitor.
  v_q := public.public_project_quote(current_setting('test.ap_soldout')::uuid, p_trees => 10);
  assert v_q->>'pricing' = 'not_offered' and v_q->>'price_per_tree_millimes' is null
     and v_q->>'total_price_millimes' is null,
    'only a published offer prices for a visitor — PRJ-03, unchanged by bb_80, got ' || v_q::text;
  select * into v_p from public.public_projects() r where r.code = 'AP80-SOLDOUT';
  assert v_p.code = 'AP80-SOLDOUT' and not v_p.offered and v_p.min_price_per_tree_millimes is null,
    'and the listing shows it without a price, got ' || to_jsonb(v_p)::text;

  reset role;
end $$;

-- A visitor gets nothing while the pricing module is closed — this file did not touch that gate.
do $$
begin
  update public.feature_flags set state = 'disabled' where key = 'pricing';
  set local role anon;

  assert not exists (select 1 from public.public_projects() r
                     where r.code like 'AP80-%' and r.min_price_per_tree_millimes is not null),
    'with pricing closed no offer publishes a price, computed area or not';
  assert public.public_project_quote(current_setting('test.ap_area')::uuid, p_trees => 10)->>'pricing' = 'closed',
    'and the quote says the module is closed';
  -- The count is not a price: the offer is still listed, with its area.
  assert exists (select 1 from public.public_projects() r where r.code = 'AP80-AREA'),
    'the offer itself stays listed while its price is hidden (PRJ-03)';

  reset role;
  update public.feature_flags set state = 'public' where key = 'pricing';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · What this file must NOT have moved
-- ---------------------------------------------------------------------------

do $$
declare
  v_offered integer;
  v_parcel  uuid;
begin
  -- The parcel layer's predicate is narrower on purpose: public.public_coverage() branches on it, and the
  -- live parcels carry a cash price and no spacing class. Widening it would drop them out of «المتوفّرة».
  assert not app.project_on_tree_pricing(current_setting('test.ap_area')::uuid),
    'app.project_on_tree_pricing still means «lists a spacing class»';
  assert app.project_sells_by_tree(current_setting('test.ap_area')::uuid),
    'while the offer layer reads app.project_sells_by_tree';

  insert into public.parcels (project_id, code, area_m2, property_type, cash_price_millimes, status)
  values (current_setting('test.ap_area')::uuid, 'AP80-P1', 2500, 'planted', 90000000, 'available')
  returning id into v_parcel;
  select c.parcels_offered into v_offered from public.public_coverage() c where c.governorate_id = 34;
  assert coalesce(v_offered, 0) >= 1,
    'a cash-priced parcel of a classless offer still counts as offered on the coverage map, got ' || coalesce(v_offered, -1);
  assert app.parcel_price(v_parcel)->>'pricing' = 'legacy',
    'and app.parcel_price was not touched: a parcel with no class is still a legacy cash parcel';

  -- The engine stays closed to everyone outside the server.
  assert not has_function_privilege('anon', 'app.tree_price(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.tree_price(uuid, uuid)', 'execute')
     and not has_function_privilege('anon', 'app.tree_price_for_area(numeric, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.tree_price_for_area(numeric, uuid)', 'execute')
     and not has_function_privilege('anon', 'app.project_price_basis(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_price_basis(uuid, uuid)', 'execute')
     and not has_function_privilege('anon', 'app.project_area_per_tree(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_area_per_tree(uuid)', 'execute')
     and not has_function_privilege('anon', 'app.project_sells_by_tree(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_sells_by_tree(uuid)', 'execute'),
    'the new engine is closed to visitors and to signed-in clients';
  assert has_function_privilege('anon', 'public.public_projects()', 'execute')
     and has_function_privilege('authenticated', 'public.public_projects()', 'execute')
     and has_function_privilege('anon', 'public.public_project_quote(uuid, uuid, integer, text, uuid, uuid)', 'execute'),
    'and the two public surfaces kept the grants 0034/0035 gave them';
  assert not has_function_privilege('anon', 'public.staff_project_quote(uuid, uuid, integer, text, uuid, uuid)', 'execute'),
    'the staff quote is not a public surface';

  -- The public listing's shape did not change, so no client type had to move.
  assert pg_get_function_result('public.public_projects()'::regprocedure) like '%min_price_per_tree_millimes bigint%'
     and pg_get_function_result('public.public_projects()'::regprocedure) like '%cover_aspect text%',
    'public_projects() returns the same columns it did before bb_80';

  -- The bounds and the words are configuration, typed, and out of the public payload.
  assert (select count(*) from public.settings s
          where s.key in ('pricing.area_per_tree_min_m2', 'pricing.area_per_tree_max_m2',
                          'pricing.area_per_tree_decimals')
            and s.value_type = 'integer' and s.group_key = 'pricing' and not s.is_public) = 3,
    'the three guards are integer pricing settings kept off the public site';
  assert (select count(*) from public.settings s
          where s.key in ('pricing.area_blocked_trees_missing', 'pricing.area_blocked_area_missing',
                          'pricing.area_blocked_out_of_range')
            and s.value_type = 'text' and s.group_key = 'pricing' and not s.is_public) = 3,
    'the three Arabic refusals are text settings kept off the public site';
  assert app.setting_int('pricing.area_per_tree_min_m2', 0) < app.setting_int('pricing.area_per_tree_max_m2', 0),
    'the floor is below the ceiling';

  -- Complaint 2 · the column answers for itself now, and no formula reads it.
  assert col_description('public.projects'::regclass,
           (select ordinal_position from information_schema.columns
            where table_schema = 'public' and table_name = 'projects'
              and column_name = 'annual_costs_millimes')::integer) like '%ONE YEAR%',
    'projects.annual_costs_millimes states its unit in a comment';
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public')
      and p.proname in ('tree_price', 'tree_price_for_area', 'project_price_basis', 'project_area_per_tree',
                        'project_quote_payload', 'contract_price_per_tree')
      and p.prosrc like '%annual_costs_millimes%'),
    'and no pricing function reads it: the yearly fee a client pays is tree_pricing_rules.annual_fee_per_tree_millimes';
end $$;
