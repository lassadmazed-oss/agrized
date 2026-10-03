-- bb_80 · An offer prices from its own area per tree (owner, 2026-10-03: «there is no need for the space
-- surface», on /admin/projects/<id>?tab=card).
--
-- ███ DRAFT. NOT APPLIED. Dry-run it with its test and read §0 before you apply it:
-- ███   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_80_area_pricing.sql supabase/tests/071_area_pricing.sql
-- ███ supabase/tests/071_area_pricing.sql FAILS under `npm run db:test` until this file is applied, the same
-- ███ way 012 §5 depends on bb_02. That is expected and it is written at the top of the test.
--
-- MEASURED AGAINST THE WHOLE SUITE, 2026-10-03, the way bb_03's note asks for: every supabase/tests/*.sql
-- file run with this file applied first, each inside its own rolled-back transaction. 69 of 69 green, plus
-- 071 green. (005_start_custom_trees.sql cannot be measured that way at all — its line 7 is `set transaction
-- isolation level repeatable read`, which fails after ANY earlier statement in the same transaction; it is
-- green on its own and fails the same way when paired with an unrelated test file.)
--   ONE TEST DID GO RED AND THE FIX WENT HERE, NOT THERE. 020_project_quote.sql:318 asserts the VISITOR
--   payload against a whitelist of keys — a PRJ-03 guard — and the three keys this file adds were reaching
--   visitors. They are staff-only now (see the end of §5). A visitor gets the area and the price; the route
--   the price came by, and «this offer's area per tree does not believe itself», are Back Office business.
--
-- WHAT THE SCREEN DOES TODAY. src/app/admin/(panel)/projects/[id]/page.tsx:390 refuses the price with
-- «ما فمّاش فئة مساحة لهذا العرض: علّم التباعد باش يتحسب سعر الزيتونة.» — and three lines earlier, at :143, the
-- same screen has ALREADY computed total_area_m2 / tree_count and prints it as «المساحة لكل زيتونة» with
-- source "declared". The number the engine says it needs is on the page. It just was not allowed to price
-- from it.
--
-- WHY THE CLASS CANNOT DO THE JOB. public.tree_spacing_classes holds eight fixed densities — 6, 8, 25, 35,
-- 49, 100, 196 and 576 m² per tree (verified live, 8 rows, all active). Fourteen of the eighteen offers list
-- no class at all, and the two the owner named land between two classes:
--     DEMO-15  52,000 m² / 208 trees = 250.00 m²   (between 196 and 576)
--     DEMO-14  25,000 m² / 571 trees =  43.78 m²   (between  35 and  49)
-- No value of p_spacing_class describes that land. It is a taxonomy that cannot express his groves, not a
-- field he forgot to fill.
--
-- AND THE CLASS IS ONLY EVER USED FOR ONE NUMBER. In the live app.tree_price the class contributes exactly
-- `v_area := v_class.area_m2`. Land rate per m², planting cost per tree, cost lines (per_m2 or per_tree),
-- margin mode, rounding and the annual fee are all read from public.tree_pricing_rules and
-- public.tree_cost_items and never look at the class again. So the body is split at that one line.
--
-- DRIFT, CHECKED BEFORE COPYING ANYTHING. The new body is generated from pg_get_functiondef of the LIVE
-- app.tree_price, and it HAD drifted from supabase/migrations/0031_tree_pricing.sql:401: migration
-- 0045_annual_fee.sql:27 redefined the function and is what runs today. 0031's body has no v_annual at all —
-- no annual_fee_per_tree_millimes in the ok payload, none in the margin_not_set refusal, no 'annual_fee' in
-- `sources`. Copying 0031 would have silently dropped the yearly fee out of every quote, which is read by the
-- offer card, the public offer page and /start.
--
-- ███ §0 · WHO STARTS SEEING A PRICE. public.public_projects() feeds the live site. This file changes WHAT a
-- ███ price is computed from and never WHO may see it: `pricing` module open, pj.status = 'published',
-- ███ app.project_visible, app.module_open, PRJ-03 and the staff/visitor split are copied through byte for
-- ███ byte. But a price that did not exist now exists, so it reaches whoever was already allowed to see one.
-- ███
-- ███ Measured against the live rows at the default bounds below, TEN published offers would start showing a
-- ███ price per tree and an area per tree on the public site the moment this is applied:
-- ███   DEMO-01 157.61 m²   DEMO-02  22.08 m²   DEMO-03 771.43 m²   DEMO-05  74.27 m²   DEMO-06 68.28 m²
-- ███   DEMO-07 192.66 m²   DEMO-09 106.47 m²   DEMO-10  16.82 m²   DEMO-11 188.72 m²   DEMO-13 36.53 m²
-- ███ Every one of them is a seeded demo offer: scripts/seed-demo-projects.mjs names them «… (تجريبي)» and
-- ███ draws the area and the tree count at random, which is also why none of them lands on a class. The
-- ███ owner's three real offers — OFF-AIRPORT, OFF-TNAYEUR, TX-00215 — each already list one class and keep
-- ███ pricing from it, unchanged, to the millime.
-- ███
-- ███ DEMO-14 and DEMO-15, the two he complained about, are status = 'internal'. They start pricing in the
-- ███ BACK OFFICE, which is the complaint; they stay invisible to visitors because they are not published.
-- ███ So: unpublish or re-check the ten demo offers BEFORE applying, or apply it and accept that the demo
-- ███ offers quote a price.
--
-- WHAT IS DELIBERATELY NOT TOUCHED, and why — public.parcels has 69 live rows, so the parcel layer is not the
-- empty shell bb_03's note describes:
--   app.project_on_tree_pricing(uuid)   stays `exists(project_spacing_classes)`. public.public_coverage()
--       branches on it: `case when app.project_on_tree_pricing(pj.id) then app.parcel_price(..)->>'pricing' =
--       'ok' else pa.cash_price_millimes > 0 end`. All 69 parcels carry a cash price and no class, so
--       widening this predicate would flip 56 parcels of 13 classless offers out of the `else` branch and
--       drop parcels_offered to zero on the public coverage map. The offer layer gets its own predicate,
--       app.project_sells_by_tree, instead.
--   app.parcel_price, public.public_parcels()   a parcel's price, and its 'legacy' branch, are about
--       parcels.cash_price_millimes, not about an offer's area. bb_03 retires this layer; touching it here
--       would collide with that file for no gain.
--   public.public_tree_quote, public.submit_interest_request   /start, where the visitor picks a class and
--       there is no offer (both call app.tree_price(class, null)). No project, so no own area to fall back on.
--   public.staff_tree_quote   the /admin/pricing calculator, driven by a class the user picks on purpose.
--   app.project_spacing_choice   unchanged, signature and all four statuses; the new basis wraps it.

-- ---------------------------------------------------------------------------
-- 1 · The bounds and the words, in settings, because they are business values
-- ---------------------------------------------------------------------------
--
-- Whole square metres, read through app.setting_int. The floor is what separates a grove from a typo: the
-- densest planting that exists anywhere is super-intensive 4 × 1.5 m = 6 m² per tree, so 2 m² is already
-- below the physically possible — an area per tree of 0.4 m² is hectares typed into a m² box, or a tree count
-- a hundred times too big, and never a super-intensive grove. The ceiling catches the mirror mistake
-- (tree_count = 1 on 5.2 ha reads as 52,000 m² per tree): the widest traditional Tunisian spacing in the
-- class table is 24 × 24 = 576 m², and 2,000 m² leaves an offer like DEMO-03's 771 m² of scattered old trees
-- well inside while still refusing an order-of-magnitude slip. Both are the owner's to move.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values
  ('pricing.area_per_tree_min_m2', to_jsonb(2), 'integer', 'pricing',
   'أصغر مساحة مقبولة لكل زيتونة (م²)',
   'كي العرض ما عندوش فئة مساحة، المساحة لكل زيتونة تتحسب من المساحة الجملية ÷ عدد الزيتونات. إذا طلع الناتج أصغر من هذا الحدّ، النظام ما يحسبش السعر ويقول علاش: أكثف غراسة موجودة في العالم هي 4 × 1.5 م = 6 م² للزيتونة، إذن ناتج أصغر من هكا يعني غلطة في كتبة الأرقام موش غراسة مكثّفة.',
   false, 40),
  ('pricing.area_per_tree_max_m2', to_jsonb(2000), 'integer', 'pricing',
   'أكبر مساحة مقبولة لكل زيتونة (م²)',
   'نفس الحساب في الجهة الأخرى: إذا طلعت المساحة لكل زيتونة أكبر من هذا الحدّ، النظام ما يحسبش السعر. أوسع تباعد في قائمة الفئات هو 24 × 24 م = 576 م²، و2000 م² يخلّي مجال واسع للضيعات القديمة ويلقط في نفس الوقت الغلطات الكبيرة (مثلاً عدد زيتونات مكتوب 1).',
   false, 41),
  ('pricing.area_per_tree_decimals', to_jsonb(2), 'integer', 'pricing',
   'عدد الفاصلات في المساحة لكل زيتونة',
   'المساحة الجملية ÷ عدد الزيتونات تعطي عدد طويل (25,000 ÷ 571 = 43.782837…). النظام يقرّبه لهذا العدد من الفاصلات قبل ما يحسب بيه، باش الرقم اللي يتعرض في الـBack Office هو بالضبط الرقم اللي تحسب بيه السعر. السعر في الآخر يتقرّب مرّة وحدة حسب «تقريب السعر» في قواعد التسعير.',
   false, 42),
  ('pricing.area_blocked_trees_missing', to_jsonb('عدد الزيتونات في هذا العرض فارغ ولا صفر، وبلا عدد ما نجّمناش نقسّمو المساحة ونعرفو المساحة لكل زيتونة. اكتب عدد الزيتونات في بطاقة العرض باش يتحسب سعر الزيتونة.'::text), 'text', 'pricing',
   'نصّ: عدد الزيتونات ناقص',
   'يتعرض في الـBack Office كي العرض ما عندوش فئة مساحة وما عندوش عدد زيتونات، عوض سعر ما يتصدّقش.',
   false, 43),
  ('pricing.area_blocked_area_missing', to_jsonb('المساحة الجملية لهذا العرض فارغة. اكتبها بالمتر المربع في بطاقة العرض باش تتحسب المساحة لكل زيتونة وسعرها معاها.'::text), 'text', 'pricing',
   'نصّ: المساحة الجملية ناقصة',
   'يتعرض في الـBack Office كي العرض ما عندوش فئة مساحة وما عندوش مساحة جملية.',
   false, 44),
  ('pricing.area_blocked_out_of_range', to_jsonb('المساحة لكل زيتونة في هذا العرض {area} م²، وهاذي برّا الحدود المقبولة (من {min} م² إلى {max} م²). تثبّت من المساحة الجملية ومن عدد الزيتونات في بطاقة العرض؛ وكان الزوز صحيحين، بدّل الحدود في الإعدادات.'::text), 'text', 'pricing',
   'نصّ: المساحة لكل زيتونة برّا الحدود',
   'يتعرض في الـBack Office كي الناتج يطلع أصغر من الحدّ الأدنى ولا أكبر من الحدّ الأقصى. {area} و{min} و{max} يتعمّروا بالأرقام الحقيقية.',
   false, 45)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · The division, guarded, in one place
-- ---------------------------------------------------------------------------
--
-- Null when the offer cannot be divided at all: a tree count of zero or null, an area of zero or null. The
-- guard is here, where the division is, and not inside app.tree_price_for_area — the bounds exist to catch a
-- DERIVED number, and must never veto a density a human picked from the class table on purpose.
--
-- Rounded to pricing.area_per_tree_decimals before it is used, so the figure the Back Office prints is exactly
-- the figure the price was computed from. 25,000 / 571 = 43.782837… becomes 43.78; the 28 millimes of land
-- cost that costs are erased anyway by the ceil to price_rounding_millimes at the end of app.tree_price.

create or replace function app.project_area_per_tree(p_project uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(pj.total_area_m2 / pj.tree_count, greatest(0, least(6, app.setting_int('pricing.area_per_tree_decimals', 2))))
  from public.projects pj
  where pj.id = p_project
    and coalesce(pj.tree_count, 0) >= 1
    and coalesce(pj.total_area_m2, 0) > 0
$$;
revoke execute on function app.project_area_per_tree(uuid) from public, anon, authenticated;
comment on function app.project_area_per_tree(uuid) is
  'bb_80: total_area_m2 / tree_count, rounded to pricing.area_per_tree_decimals. Null when the offer carries no tree count or no area, so no caller can divide by zero. Says nothing about whether the result is believable — that is app.project_price_basis, against pricing.area_per_tree_min_m2 / _max_m2.';

-- Whether this offer is sold by the tree AT ALL: it lists densities, or it carries the two numbers a per-tree
-- offer is made of. An area per tree outside the bounds still counts as sold by the tree — the offer is the
-- right shape and one of its two numbers is wrong, which is a data problem to name, not a different kind of
-- offer. Deliberately NOT app.project_on_tree_pricing: see the header: that one is the parcel layer's.
create or replace function app.project_sells_by_tree(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_spacing_classes pc where pc.project_id = p_project)
      or exists (select 1 from public.projects pj
                 where pj.id = p_project
                   and coalesce(pj.tree_count, 0) >= 1
                   and coalesce(pj.total_area_m2, 0) > 0)
$$;
revoke execute on function app.project_sells_by_tree(uuid) from public, anon, authenticated;
comment on function app.project_sells_by_tree(uuid) is
  'bb_80: the OFFER layer''s «sold by the tree» — a listed spacing class, or the offer''s own tree count and area. app.project_on_tree_pricing stays narrower (a listed class only) because public.public_coverage() and the two parcels triggers read it for the parcel layer, which still holds 69 rows.';

-- ---------------------------------------------------------------------------
-- 3 · app.tree_price splits in two; the signature does not move
-- ---------------------------------------------------------------------------
--
-- app.tree_price(p_spacing_class uuid, p_project uuid) keeps its exact signature because eight live callers
-- depend on it: app.contract_price_per_tree, app.parcel_price, app.project_quote_payload,
-- public.public_parcels(), public.public_projects(), public.public_tree_quote, public.staff_tree_quote and
-- public.submit_interest_request. It keeps both of its own refusals — a class that does not exist or is
-- disabled, and a class this offer does not sell — and then hands the area over.
--
-- The body below is the live 0045 body from `v_area :=` onward, unchanged line for line, with one guard added
-- at the top: an area that is null or not positive now refuses instead of returning ok with a null price.
-- That case was reachable — tree_spacing_classes.area_m2 is nullable — and it used to return
-- `'ok', true, 'price_per_tree_millimes', null`, which every caller reads as a price.

create or replace function app.tree_price_for_area(p_area_m2 numeric, p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_global       public.tree_pricing_rules;
  v_rule         public.tree_pricing_rules;
  v_area         numeric := p_area_m2;
  v_land_rate    bigint;
  v_planting     bigint;
  v_mode         text;
  v_bp           integer;
  v_fixed        bigint;
  v_rounding     bigint;
  v_use_global   boolean;
  v_annual       bigint;
  v_land         numeric;
  v_extras       jsonb;
  v_extras_total numeric;
  v_cost         numeric;
  v_margin       numeric;
  v_price        bigint;
begin
  if v_area is null or v_area <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'area_not_set');
  end if;

  select * into v_global from public.tree_pricing_rules r where r.project_id is null;
  if p_project is not null then
    select * into v_rule from public.tree_pricing_rules r where r.project_id = p_project;
  end if;

  v_land_rate  := coalesce(v_rule.land_price_per_m2_millimes, v_global.land_price_per_m2_millimes);
  v_planting   := coalesce(v_rule.planting_cost_per_tree_millimes, v_global.planting_cost_per_tree_millimes);
  v_rounding   := coalesce(v_rule.price_rounding_millimes, v_global.price_rounding_millimes);
  v_use_global := coalesce(v_rule.use_global_cost_items, true);
  -- The yearly care follows the same inheritance as the price itself.
  v_annual     := coalesce(v_rule.annual_fee_per_tree_millimes, v_global.annual_fee_per_tree_millimes);
  if v_rule.margin_mode is not null then
    v_mode := v_rule.margin_mode;  v_bp := v_rule.margin_percent_bp;  v_fixed := v_rule.margin_fixed_millimes;
  else
    v_mode := v_global.margin_mode;  v_bp := v_global.margin_percent_bp;  v_fixed := v_global.margin_fixed_millimes;
  end if;

  if v_mode is null or v_land_rate is null or v_planting is null or v_rounding is null then
    return jsonb_build_object('ok', false, 'reason', 'margin_not_set', 'area_m2', v_area,
                              'annual_fee_per_tree_millimes', v_annual);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'label_ar', x.label_ar, 'basis', x.basis, 'amount_millimes', x.amount_millimes,
           'cost_millimes', round(x.cost)::bigint)
           order by x.scope_rank, x.sort_order, x.label_ar), '[]'::jsonb),
         coalesce(sum(x.cost), 0)
  into v_extras, v_extras_total
  from (
    select ci.label_ar, ci.basis, ci.amount_millimes, ci.sort_order,
           case when ci.project_id is null then 0 else 1 end as scope_rank,
           case ci.basis when 'per_m2' then v_area * ci.amount_millimes else ci.amount_millimes::numeric end as cost
    from public.tree_cost_items ci
    where ci.is_active
      and ((ci.project_id is null and (p_project is null or v_use_global))
           or (p_project is not null and ci.project_id = p_project))
  ) x;

  v_land   := v_area * v_land_rate;
  v_cost   := v_land + v_planting + v_extras_total;
  v_margin := case v_mode when 'percent' then v_cost * v_bp / 10000 else v_fixed::numeric end;
  -- Rounded once, up, from the unrounded sum: the displayed parts are indicative, the price is exact.
  v_price  := (ceil((v_cost + v_margin) / v_rounding) * v_rounding)::bigint;

  return jsonb_build_object(
    'ok', true,
    'area_m2', v_area,
    'land_price_per_m2_millimes', v_land_rate,
    'land_cost_millimes', round(v_land)::bigint,
    'planting_cost_millimes', v_planting,
    'extras', v_extras,
    'extras_total_millimes', round(v_extras_total)::bigint,
    'cost_per_tree_millimes', round(v_cost)::bigint,
    'margin_mode', v_mode,
    'margin_percent_bp', case when v_mode = 'percent' then v_bp end,
    'margin_fixed_millimes', case when v_mode = 'fixed' then v_fixed end,
    'margin_millimes', round(v_margin)::bigint,
    'price_per_tree_millimes', v_price,
    -- Paid every year, not part of the price above.
    'annual_fee_per_tree_millimes', v_annual,
    'sources', jsonb_build_object(
      'land', case when v_rule.land_price_per_m2_millimes is not null then 'project' else 'global' end,
      'planting', case when v_rule.planting_cost_per_tree_millimes is not null then 'project' else 'global' end,
      'margin', case when v_rule.margin_mode is not null then 'project' else 'global' end,
      'rounding', case when v_rule.price_rounding_millimes is not null then 'project' else 'global' end,
      'annual_fee', case when v_rule.annual_fee_per_tree_millimes is not null then 'project' else 'global' end)
  );
end $$;
revoke execute on function app.tree_price_for_area(numeric, uuid) from public, anon, authenticated;
comment on function app.tree_price_for_area(numeric, uuid) is
  'bb_80: what one tree covering p_area_m2 costs, by the offer''s rules then the global ones (0031, 0045). The body app.tree_price used to hold; app.tree_price now resolves a class to its area_m2 and delegates here. Prices any positive area: the sanity bounds belong to the derived area, in app.project_price_basis.';

create or replace function app.tree_price(p_spacing_class uuid, p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class public.tree_spacing_classes;
begin
  select * into v_class from public.tree_spacing_classes c where c.id = p_spacing_class and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'spacing_not_found');
  end if;

  -- Plan Q-13 / P1-7: a project that lists its classes sells only those.
  if p_project is not null
     and exists (select 1 from public.project_spacing_classes pc where pc.project_id = p_project)
     and not exists (select 1 from public.project_spacing_classes pc
                     where pc.project_id = p_project and pc.spacing_class_id = p_spacing_class) then
    return jsonb_build_object('ok', false, 'reason', 'spacing_not_allowed', 'area_m2', v_class.area_m2);
  end if;

  -- The class contributed one number, and this was always the only one: `v_area := v_class.area_m2`.
  return app.tree_price_for_area(v_class.area_m2, p_project);
end $$;
revoke execute on function app.tree_price(uuid, uuid) from public, anon, authenticated;
comment on function app.tree_price(uuid, uuid) is
  'bb_80: resolves a spacing class to its area_m2 — refusing ''spacing_not_found'' for a missing or disabled class and ''spacing_not_allowed'' for one this offer does not sell — then delegates to app.tree_price_for_area. Same signature and same payload as 0031/0045, because eight callers read it.';

-- ---------------------------------------------------------------------------
-- 4 · PRECEDENCE: a class a human chose wins; the offer's own area is the fallback
-- ---------------------------------------------------------------------------
--
-- An offer can hold both: a listed spacing class AND a total area with a tree count. Which wins?
--
-- THE CLASS. Not because it is more accurate — on DEMO-14 the class would be a worse description of the land
-- than 43.78 m² is — but because somebody opened «التسعير ← فئات المساحة» and attached it. Attaching a class
-- is a decision; total_area_m2 and tree_count are two facts typed into بطاقة العرض for a dozen other reasons,
-- and a surveyor's correction to the area would silently reprice every tree of the offer. A measurement must
-- never outvote a decision without anyone being told. So the computed area is the fallback for an offer that
-- never had a class, and only that.
--
-- The rule is read, not restated, by app.project_quote_payload, public.public_projects() and
-- app.contract_price_per_tree. It wraps app.project_spacing_choice rather than replacing it: an offer that
-- lists classes keeps all four of that function's answers, including 'required' (several classes, none
-- chosen) and 'not_allowed' — those offers do NOT fall back either, because listing classes is itself the
-- decision that this offer is sold by density.
--
-- status: 'ok' with basis 'class' or 'project_area'; or 'required' / 'not_allowed' from the class choice; or
-- 'trees_missing' / 'area_missing' / 'area_out_of_range' from the offer's own numbers, each with blocked_ar,
-- a finished Arabic sentence the Back Office can print as it stands.

create or replace function app.project_price_basis(
  p_project uuid, p_spacing_class uuid,
  out spacing_class_id uuid, out area_m2 numeric, out basis text, out status text, out blocked_ar text
) returns record
language plpgsql stable security definer set search_path = '' as $$
declare
  v_choice_class uuid;
  v_choice       text;
  v_min          integer := app.setting_int('pricing.area_per_tree_min_m2', 2);
  v_max          integer := app.setting_int('pricing.area_per_tree_max_m2', 2000);
  v_trees        integer;
  v_area         numeric;
begin
  select c.spacing_class_id, c.status into v_choice_class, v_choice
  from app.project_spacing_choice(p_project, p_spacing_class) c;

  -- The offer lists densities: the decision stands, whatever its own two numbers say.
  if v_choice <> 'legacy' then
    spacing_class_id := v_choice_class;
    status           := v_choice;
    if v_choice = 'ok' then
      select sc.area_m2 into area_m2 from public.tree_spacing_classes sc where sc.id = v_choice_class;
      basis := 'class';
    end if;
    return;
  end if;

  -- No class was ever attached. The offer's own area per tree, if it has one.
  select pj.tree_count into v_trees from public.projects pj where pj.id = p_project;
  v_area := app.project_area_per_tree(p_project);

  if v_area is null then
    status     := case when coalesce(v_trees, 0) < 1 then 'trees_missing' else 'area_missing' end;
    blocked_ar := app.setting_text('pricing.area_blocked_' || status, null);
    return;
  end if;

  if v_area < v_min or v_area > v_max then
    area_m2    := v_area;
    status     := 'area_out_of_range';
    -- trim_scale, not a trailing-zero trim: 250.00 must print «250» and, if the owner sets the decimals to 0,
    -- 250 must not print «25».
    blocked_ar := replace(replace(replace(
                    app.setting_text('pricing.area_blocked_out_of_range', null),
                    '{area}', trim_scale(v_area)::text),
                    '{min}', v_min::text),
                    '{max}', v_max::text);
    return;
  end if;

  area_m2 := v_area;
  basis   := 'project_area';
  status  := 'ok';
end $$;
revoke execute on function app.project_price_basis(uuid, uuid) from public, anon, authenticated;
comment on function app.project_price_basis(uuid, uuid) is
  'bb_80: the one place that decides what an offer''s price is computed from. A listed spacing class wins, because someone attached it on purpose; total_area_m2 / tree_count is the fallback for an offer that never had a class. Guards the division (tree count, area) and the result (pricing.area_per_tree_min_m2 / _max_m2), and carries blocked_ar — the Arabic sentence for a refusal — rather than a price nobody should trust.';

-- ---------------------------------------------------------------------------
-- 5 · The offer quote reads the basis (0034, 0045, 0048, 0061)
-- ---------------------------------------------------------------------------
--
-- Live body, with four changes and nothing else:
--   · app.project_spacing_choice → app.project_price_basis, so the fallback applies;
--   · v_class.area_m2 → v_area, which is the class's area or the offer's own;
--   · 'legacy' now means «this offer is not sold by the tree under any reading» (no class list AND no
--     tree count or no area) instead of «no class list». An offer whose own area is merely out of bounds
--     reads 'unavailable' with a reason, not 'legacy', because the fix is one number in بطاقة العرض;
--   · three new keys — price_basis, basis_status, blocked_ar — added FOR STAFF ONLY and none removed, so
--     the visitor payload keeps exactly the keys 020_project_quote.sql:318 whitelists, and
--     src/.../offer-quote.ts keeps reading pricing, spacing_status, area_per_tree_m2 and
--     price_per_tree_millimes exactly as it does today.
--
-- Every gate is untouched: 'closed' while the pricing module is shut to a visitor, 'not_offered' while the
-- offer is not published, v_breakdown = p_staff and app.can_price() for the breakdown (PRJ-03).

create or replace function app.project_quote_payload(
  p_project uuid, p_spacing_class uuid default null, p_trees integer default null,
  p_payment_mode text default null, p_down_percent_option_id uuid default null,
  p_duration_option_id uuid default null, p_staff boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pj        public.projects;
  v_class_id  uuid;
  v_area      numeric;
  v_basis     text;
  v_status    text;
  v_blocked   text;
  v_spacing   text;
  v_class     public.tree_spacing_classes;
  v_max       integer;
  v_trees     integer;
  v_breakdown boolean := p_staff and app.can_price();
  v_pricing   text;
  v_priceable boolean;
  v_plans     boolean;
  v_price     jsonb;
  v_per_tree  bigint;
  v_annual    bigint;
  v_total     bigint;
  v_percent   public.option_items;
  v_duration  public.option_items;
  v_down      bigint;
  v_quote     jsonb;
  v_inst_st   text;
  v_ok        boolean;
  v_inst      jsonb;
  v_choices   jsonb;
begin
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    return null;
  end if;

  select b.spacing_class_id, b.area_m2, b.basis, b.status, b.blocked_ar
  into v_class_id, v_area, v_basis, v_status, v_blocked
  from app.project_price_basis(v_pj.id, p_spacing_class) b;
  select * into v_class from public.tree_spacing_classes sc where sc.id = v_class_id;

  -- What the class choice said, for the screens that read it: only ever 'ok', 'required' or 'not_allowed',
  -- and null for an offer that lists no class — exactly the three values offer-quote.ts accepts.
  v_spacing := case when v_status in ('ok', 'required', 'not_allowed') and v_basis is distinct from 'project_area'
                    then v_status end;

  -- The /start limit, or the project's own tree count when it has one
  select greatest(app.setting_int('million.custom_trees_max', 5000), coalesce(max(o.min_number), 0)::integer)
  into v_max
  from public.option_items o
  where o.list_key = 'tree_count' and o.is_active;
  v_max   := coalesce(nullif(v_pj.tree_count, 0), v_max);
  v_trees := case when p_trees between 1 and v_max then p_trees end;

  -- 0020: sold out, operating and internal projects never price publicly.
  v_pricing := case
                 when not p_staff and not app.module_open('pricing') then 'closed'
                 when not p_staff and v_pj.status <> 'published' then 'not_offered'
                 when not app.project_sells_by_tree(v_pj.id) then 'legacy'
               end;
  v_priceable := v_pricing is null;

  if v_priceable then
    if v_basis = 'class' then
      v_price := app.tree_price(v_class_id, v_pj.id);
    elsif v_basis = 'project_area' then
      v_price := app.tree_price_for_area(v_area, v_pj.id);
    elsif v_status in ('trees_missing', 'area_missing', 'area_out_of_range') then
      -- The same shape app.tree_price refuses with, so `reason` reaches offer-quote.ts the way
      -- 'margin_not_set' does, under the same app.can_price() gate as the rest of the breakdown.
      v_price := jsonb_build_object('ok', false, 'reason', v_status, 'area_m2', v_area, 'reason_ar', v_blocked);
    end if;
    -- 'required' and 'not_allowed' leave v_price null on purpose: those offers answer through spacing_status,
    -- as they did before this file.
    if coalesce((v_price->>'ok')::boolean, false) then
      v_pricing  := 'ok';
      v_per_tree := (v_price->>'price_per_tree_millimes')::bigint;
      v_annual   := (v_price->>'annual_fee_per_tree_millimes')::bigint;
      v_total    := v_per_tree * v_trees;
    else
      v_pricing := 'unavailable';
    end if;
  end if;

  -- What this offer sells on instalments (§3), and — for a visitor — only while this offer has a price to
  -- spread at all: v_priceable, the permission, not v_pricing = 'ok', the availability. A project with two
  -- classes and none chosen yet prices 'unavailable' and still publishes its menu, because the visitor is
  -- about to pick a class; 'closed', 'not_offered' and 'legacy' publish nothing.
  v_plans := app.offer_sells_on_installments(v_pj.id) and (p_staff or v_priceable);

  if v_pricing = 'ok' and p_payment_mode = 'installments' and v_trees is not null then
    if not v_plans then
      -- The offer is cash only, or it lists no percentage or no priced duration. Not an error: an answer.
      v_inst_st := 'not_offered';
    elsif p_down_percent_option_id is null or p_duration_option_id is null then
      v_inst_st := 'incomplete';
    else
      -- Plan P1-2: only a percentage and a duration this project offers
      select * into v_percent from app.project_down_percent_items(v_pj.id) o where o.id = p_down_percent_option_id;
      select * into v_duration from app.project_duration_items(v_pj.id) o where o.id = p_duration_option_id;
      v_down     := app.down_payment_from_percent(v_total, v_percent.min_number, v_pj.id);
      if v_percent.id is null or v_duration.id is null or v_down is null or v_duration.min_number is null then
        v_inst_st := 'invalid_choice';
      else
        v_quote   := app.financed_quote(v_total, v_down, v_duration.min_number::integer, v_pj.id);
        v_inst_st := case when (v_quote->>'ok')::boolean then 'ok' else v_quote->>'reason' end;
      end if;
    end if;
    v_ok := v_inst_st = 'ok';
    v_inst := jsonb_build_object(
      'status', v_inst_st,
      'down_payment_percent', case when v_ok then v_percent.min_number end,
      'down_payment_millimes', case when v_ok then (v_quote->>'down_payment_millimes')::bigint end,
      'months', case when v_ok then (v_quote->>'months')::integer end,
      'total_financed_millimes', case when v_ok then (v_quote->>'total_financed_millimes')::bigint end,
      'remaining_millimes', case when v_ok then (v_quote->>'remaining_millimes')::bigint end,
      'monthly_millimes', case when v_ok then (v_quote->>'monthly_millimes')::bigint end,
      'last_installment_millimes', case when v_ok then (v_quote->>'last_installment_millimes')::bigint end,
      'installments_count', case when v_ok then (v_quote->>'installments_count')::integer end,
      'shortened', case when v_ok then (v_quote->>'shortened')::boolean end
    );
    if v_breakdown then
      v_inst := v_inst || jsonb_build_object('markup_bp', case when v_ok then (v_quote->>'markup_bp')::integer end);
    end if;
  end if;

  -- What a page offers for this project: its active classes (with their price when the caller may see prices),
  -- and — only while the offer actually sells a plan — its percentages and its priced durations. An offer that
  -- lists no class publishes an empty list, as it always has: there is nothing for the visitor to pick, and
  -- the one area it prices from is already at the top of this payload.
  select jsonb_build_object(
    'spacing_classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sc.id, 'label_ar', sc.label_ar, 'label_fr', sc.label_fr,
               'row_spacing_m', sc.row_spacing_m, 'tree_spacing_m', sc.tree_spacing_m, 'area_m2', sc.area_m2,
               'price_per_tree_millimes',
                 case when coalesce((tp.price->>'ok')::boolean, false) then (tp.price->>'price_per_tree_millimes')::bigint end)
             order by sc.sort_order, sc.code)
      from public.project_spacing_classes pc
      join public.tree_spacing_classes sc on sc.id = pc.spacing_class_id and sc.is_active
      cross join lateral (select case when v_priceable then app.tree_price(sc.id, v_pj.id) end as price) tp
      where pc.project_id = v_pj.id), '[]'::jsonb),
    'down_percents', case when v_plans then coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar, 'label_fr', o.label_fr, 'percent', o.min_number)
             order by o.min_number, o.sort_order)
      from app.project_down_percent_items(v_pj.id) o), '[]'::jsonb) else '[]'::jsonb end,
    'durations', case when v_plans then coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar, 'label_fr', o.label_fr,
                                          'months', o.min_number::integer)
             order by o.min_number, o.sort_order)
      from app.project_duration_items(v_pj.id) o), '[]'::jsonb) else '[]'::jsonb end)
  into v_choices;

  return jsonb_build_object(
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'on_tree_pricing', app.project_sells_by_tree(v_pj.id),
    'spacing_status', v_spacing,
    'spacing_class_id', v_class.id,
    'label_ar', v_class.label_ar,
    'label_fr', v_class.label_fr,
    'row_spacing_m', v_class.row_spacing_m,
    'tree_spacing_m', v_class.tree_spacing_m,
    'area_per_tree_m2', v_area,
    'trees', v_trees,
    'trees_max', v_max,
    'total_area_m2', v_area * v_trees,
    'pricing', v_pricing,
    'price_per_tree_millimes', case when v_pricing = 'ok' then v_per_tree end,
    'total_price_millimes', case when v_pricing = 'ok' then v_total end,
    -- Paid every year for the trees chosen, never inside the price above (0045).
    'annual_fee_per_tree_millimes', case when v_pricing = 'ok' then v_annual end,
    'annual_fee_total_millimes', case when v_pricing = 'ok' then v_annual * v_trees end,
    'installments', v_inst,
    'choices', v_choices
  )
  -- bb_80, STAFF ONLY. 020_project_quote.sql asserts the visitor payload against a whitelist of keys — a
  -- PRJ-03 guard, and it is right: a visitor needs the area and the price, never the route they came by, and
  -- «this offer's area per tree does not believe itself» is an internal judgement about the offer.
  --   price_basis   'class' when a density was attached on purpose, 'project_area' when area_per_tree_m2
  --                 above is the offer's own total_area_m2 / tree_count, null when neither resolved.
  --   basis_status  'ok', 'required', 'not_allowed', 'trees_missing', 'area_missing', 'area_out_of_range'.
  --   blocked_ar    the finished Arabic sentence for the last three; null whenever there is a price.
  -- p_staff, not v_breakdown: a commercial reads why an offer will not price, without reading the money.
  || case when p_staff
            then jsonb_build_object('price_basis', v_basis, 'basis_status', v_status, 'blocked_ar', v_blocked)
            else '{}'::jsonb end
  || case when v_breakdown then jsonb_build_object('price', v_price) else '{}'::jsonb end;
end $$;
revoke execute on function app.project_quote_payload(uuid, uuid, integer, text, uuid, uuid, boolean)
  from public, anon, authenticated;
comment on function app.project_quote_payload(uuid, uuid, integer, text, uuid, uuid, boolean) is
  'The quote behind public_project_quote and staff_project_quote (0034, 0045, 0048, bb_10, bb_80). choices.down_percents and choices.durations are the offer''s own payment menu; both are empty — and installments.status is ''not_offered'' — when the offer sells cash only, lists no percentage or no priced duration, or, for a visitor, when its price is not shown (PRJ-03). price_basis says whether the price came from an attached spacing class or from the offer''s own total_area_m2 / tree_count; blocked_ar is the staff-only Arabic sentence when neither could be used. Never the markup, the cost breakdown or the notes.';

-- ---------------------------------------------------------------------------
-- 6 · A contract on a classless offer can price (0045 §28)
-- ---------------------------------------------------------------------------
--
-- Step 1 is untouched: what the client was told is what the client agreed to. Step 2 stays «the offer's own
-- price today», and now an offer with no class answers it from its own area instead of returning null. The
-- demand's own class still wins when it has one — the same precedence, one level up: the class on the demand
-- is what a human wrote down for this client, and it priced that way before this file too, even on an offer
-- that lists no class.

create or replace function app.contract_price_per_tree(p_project uuid, p_request uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_price bigint;
  v_class uuid;
  v_basis text;
  v_area  numeric;
  v_quote jsonb;
begin
  -- 1 · the snapshot on the demand: what this client was told, which is what they agreed to.
  select r.price_per_tree_millimes, r.spacing_class_id into v_price, v_class
  from public.interest_requests r where r.id = p_request;
  if v_price is not null and v_price > 0 then
    return v_price;
  end if;

  -- 2 · no demand, or a demand taken before the offer was priced: the offer's own price today, computed by
  -- app.tree_price / app.tree_price_for_area — the same functions the offer page and submit_offer_request read.
  if v_class is not null then
    v_quote := app.tree_price(v_class, p_project);
  else
    select b.spacing_class_id, b.area_m2, b.basis into v_class, v_area, v_basis
    from app.project_price_basis(p_project, null) b;
    -- More than one planting density and no demand naming which: the price is genuinely ambiguous and the
    -- caller is told so rather than handed one of them. Nothing resolved at all: likewise null.
    if v_basis = 'class' then
      v_quote := app.tree_price(v_class, p_project);
    elsif v_basis = 'project_area' then
      v_quote := app.tree_price_for_area(v_area, p_project);
    else
      return null;
    end if;
  end if;

  if coalesce((v_quote->>'ok')::boolean, false) then
    return (v_quote->>'price_per_tree_millimes')::bigint;
  end if;
  return null;
end $$;
revoke execute on function app.contract_price_per_tree(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7 · The public listing (0035, 0114) — same gates, a wider source for the figure
-- ---------------------------------------------------------------------------
--
-- READ §0 BEFORE APPLYING. Two changes, nothing else; the RETURNS TABLE list is identical, so `create or
-- replace` keeps the anon / authenticated / service_role grants 0035 gave it.
--   · on_tree_pricing comes from app.project_sells_by_tree instead of app.project_on_tree_pricing. It is a
--     shape flag, not a permission — src/components/site/offers.tsx:235 and register/page.tsx:76 read it to
--     decide whether an offer is sold per tree — and the predicate it used is also read by
--     public.public_coverage() for the parcel layer, which must not move (see the header).
--   · min_price_per_tree_millimes / area_per_tree_min_m2 / area_per_tree_max_m2 come from the offer's own
--     area when it lists no class. The gate on the price is copied letter for letter:
--     `case when pj.status = 'published' and app.module_open('pricing') then … end`.
-- The parcel half of the function — the `a` lateral, min_cash_price_millimes, parcels_offered, which read
-- app.parcel_price — is byte-for-byte what 0035 wrote.

create or replace function public.public_projects()
returns table (
  id uuid, code text, name text, project_type_id uuid, governorate_id smallint, delegation_id integer,
  location_description text, total_area_m2 numeric, olive_variety text, tree_count integer,
  tree_age_years numeric, plantation_system text, production_status text, irrigation public.irrigation_type,
  status public.project_status, offered boolean, on_tree_pricing boolean, parcels_total integer,
  parcels_offered integer, min_cash_price_millimes bigint, min_price_per_tree_millimes bigint,
  area_per_tree_min_m2 numeric, area_per_tree_max_m2 numeric, min_area_m2 numeric, max_area_m2 numeric,
  parcel_trees integer, cover_url text, cover_alt_ar text, cover_aspect text
)
language sql stable security definer set search_path = '' as $$
  select
    pj.id, pj.code, pj.name, pj.project_type_id, pj.governorate_id, pj.delegation_id,
    pj.location_description, pj.total_area_m2, pj.olive_variety, pj.tree_count, pj.tree_age_years,
    pj.plantation_system, pj.production_status, pj.irrigation, pj.status,
    (pj.status = 'published'),
    app.project_sells_by_tree(pj.id),
    a.parcels_total, a.parcels_offered, a.min_cash,
    case when pj.status = 'published' and app.module_open('pricing') then t.min_price_per_tree end,
    t.min_area_per_tree, t.max_area_per_tree,
    a.min_area, a.max_area, a.parcel_trees,
    c.url, c.alt_ar, null::text
  from public.projects pj
  left join lateral (
    select
      (count(*) filter (where pa.status <> 'withdrawn'))::integer as parcels_total,
      (count(*) filter (where x.priced))::integer as parcels_offered,
      min(x.cash) filter (where x.priced) as min_cash,
      min(x.area) filter (where pa.status <> 'withdrawn') as min_area,
      max(x.area) filter (where pa.status <> 'withdrawn') as max_area,
      (sum(pa.olive_tree_count) filter (where pa.status <> 'withdrawn'))::integer as parcel_trees
    from public.parcels pa
    cross join lateral (select app.parcel_price(pa.id) as p) pr
    cross join lateral (
      select
        coalesce((pr.p->>'total_area_m2')::numeric, pa.area_m2) as area,
        case when coalesce((pr.p->>'on_tree_pricing')::boolean, false)
             then (pr.p->>'cash_total_millimes')::bigint else pa.cash_price_millimes end as cash,
        app.parcel_offered(pj.status, pa.status)
          and case when coalesce((pr.p->>'on_tree_pricing')::boolean, false)
                   then pr.p->>'pricing' = 'ok' and app.module_open('pricing')
                   else pa.cash_price_millimes > 0 end as priced
    ) x
    where pa.project_id = pj.id
  ) a on true
  left join lateral (
    -- bb_80: the attached classes when there are any, otherwise this offer's own area per tree. The basis
    -- decides, in app.project_price_basis, and is not restated here.
    select
      case when b.basis = 'project_area' then b.area_m2 else k.min_area_per_tree end as min_area_per_tree,
      case when b.basis = 'project_area' then b.area_m2 else k.max_area_per_tree end as max_area_per_tree,
      case when b.basis = 'project_area'
             then (app.tree_price_for_area(b.area_m2, pj.id)->>'price_per_tree_millimes')::bigint
           else k.min_price_per_tree end as min_price_per_tree
    from app.project_price_basis(pj.id, null) b
    left join lateral (
      select
        min(cl.area_m2) as min_area_per_tree,
        max(cl.area_m2) as max_area_per_tree,
        min((app.tree_price(cl.id, pj.id)->>'price_per_tree_millimes')::bigint) as min_price_per_tree
      from public.project_spacing_classes psc
      join public.tree_spacing_classes cl on cl.id = psc.spacing_class_id
      where psc.project_id = pj.id
    ) k on true
  ) t on true
  left join lateral (
    select m.url, m.alt_ar
    from public.project_media m
    where m.project_id = pj.id
    order by m.is_cover desc, m.sort_order, m.created_at
    limit 1
  ) c on true
  where app.project_visible(pj.status)
  order by (pj.status = 'published') desc, pj.created_at desc
$$;

comment on function public.public_projects() is
  'Public listing surface (PUB-01). min_price_per_tree_millimes (plan P5-4) only for published projects while pricing is open; area_per_tree_min/max_m2 from the project''s spacing classes, or — bb_80 — from its own total_area_m2 / tree_count when it lists none, within pricing.area_per_tree_min_m2 / _max_m2. on_tree_pricing is app.project_sells_by_tree. Never pricing formulas, land price, planting cost, extras, margin, project_costs, legal_notes, coordinates, staff ids (PRJ-03).';

-- ---------------------------------------------------------------------------
-- 8 · Complaint 2: the field says what its unit is (owner, 2026-10-03)
-- ---------------------------------------------------------------------------
--
-- «المصاريف السنوية التقديرية للعرض (د.ت) is it for tree or per m 3iek what???» — and nothing in the database
-- could answer him. projects.annual_costs_millimes (0012:32) carries no comment, enters no calculation and is
-- rendered on no screen; 0020:250 puts it in a payload nobody reads. Seventeen of the eighteen offers hold a
-- value he typed, 9,382,000 millimes in all, so the column stays and only the SILENCE is fixed: the screen
-- states the unit (card-tab.tsx:218, «لكامل العرض (د.ت في العام)») and the column now says the same thing to
-- anyone reading the schema, plus where the costs that DO price a tree live.
--
-- One thing for the owner, written here because the data says it and the label cannot: the seventeen values
-- are NOT all in one unit, so the label alone cannot make them true. Measured against the live rows on
-- 2026-10-03, with the global tree_pricing_rules.annual_fee_per_tree_millimes at 12,000 (12 د per tree):
--   TX-00215     stored 12,000 = 12 د. Identical to the per-tree yearly fee, and absurd as a whole-offer
--                figure: 12 د a year for 8,000 trees. This row reads as PER TREE.
--   OFF-TNAYEUR  stored 150,000 = 150 د over 100 trees. Matches nothing: not the 12 د per-tree fee, and
--                1.5 د per tree a year as a whole-offer figure. Genuinely ambiguous — ask, do not guess.
--   the other 15 160,000 … 860,000 millimes (160–860 د) from scripts/seed-demo-projects.mjs, drawn at
--                random, so they are noise and say nothing about the unit either way.
-- CORRECTION, recorded because an earlier draft of this comment got it wrong and the owner would have acted
-- on it: 150,000 is NOT the global per-tree fee. It is the fixture value set by supabase/tests/050 line 37
-- (annual_fee_per_tree_millimes = 150000) — a test's own number, read back as if it were production. The live
-- global is 12,000. Nothing in this file depends on the figure; only this sentence did.

comment on column public.projects.annual_costs_millimes is
  'The owner''s own estimate of running THIS WHOLE OFFER for ONE YEAR, in millimes — not per tree and not per m². A reference figure only: it enters no formula, is shown to no client, and nothing computes from it (0012, bb_80). The yearly fee a client actually pays is tree_pricing_rules.annual_fee_per_tree_millimes, per tree; the costs that enter the price of a tree are public.tree_cost_items, where every line declares its own basis (per_m2 or per_tree) and app.tree_price reads them. 2026-10-03, measured: the 17 stored values are not all in this unit. TX-00215 holds 12,000 millimes, which is exactly the per-tree yearly fee and absurd as a whole-offer figure (12 د a year for 8,000 trees), so that row reads as per-tree; OFF-TNAYEUR holds 150,000 over 100 trees, which matches neither reading; the other 15 are random seed values from scripts/seed-demo-projects.mjs. Ask the owner what he meant before any screen or report treats these as offer totals — the data is his and nothing here changes it.';

-- ---------------------------------------------------------------------------
-- 9 · The file proves itself
-- ---------------------------------------------------------------------------

do $$
declare
  v_n integer;
begin
  -- The split did not move the signature eight callers depend on.
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname = 'tree_price'
            and pg_get_function_identity_arguments(p.oid) = 'p_spacing_class uuid, p_project uuid') = 1,
    'app.tree_price(uuid, uuid) still exists exactly once with its original arguments';

  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosrc like '%tree_price%'
    and (n.nspname || '.' || p.proname) in (
      'app.contract_price_per_tree', 'app.parcel_price', 'app.project_quote_payload',
      'public.public_parcels', 'public.public_projects', 'public.public_tree_quote',
      'public.staff_tree_quote', 'public.submit_interest_request');
  assert v_n = 8, 'all eight app.tree_price call sites are still compiled, got ' || v_n;

  -- The parcel layer's predicate did NOT move: public.public_coverage() branches on it for 69 live parcels.
  assert (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname = 'project_on_tree_pricing')
         like '%project_spacing_classes%',
    'app.project_on_tree_pricing still reads project_spacing_classes and nothing else';
  assert (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname = 'project_on_tree_pricing')
         not like '%total_area_m2%',
    'app.project_on_tree_pricing was not widened by this file — public_coverage() reads it';

  -- The public listing kept its grants, so `create or replace` did not reset the surface.
  assert has_function_privilege('anon', 'public.public_projects()', 'execute')
     and has_function_privilege('authenticated', 'public.public_projects()', 'execute'),
    'visitors can still read the public listing';
  assert not has_function_privilege('anon', 'app.tree_price_for_area(numeric, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.tree_price_for_area(numeric, uuid)', 'execute')
     and not has_function_privilege('anon', 'app.project_price_basis(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_price_basis(uuid, uuid)', 'execute')
     and not has_function_privilege('anon', 'app.project_area_per_tree(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.project_sells_by_tree(uuid)', 'execute'),
    'the new engine is closed to visitors and to signed-in clients';

  -- The bounds and the words exist, typed, and out of the public payload.
  assert (select count(*) from public.settings s
          where s.key in ('pricing.area_per_tree_min_m2', 'pricing.area_per_tree_max_m2',
                          'pricing.area_per_tree_decimals')
            and s.value_type = 'integer' and s.group_key = 'pricing' and not s.is_public) = 3,
    'the three numeric guards are integer pricing settings kept off the public site';
  assert (select count(*) from public.settings s
          where s.key in ('pricing.area_blocked_trees_missing', 'pricing.area_blocked_area_missing',
                          'pricing.area_blocked_out_of_range')
            and s.value_type = 'text' and not s.is_public) = 3,
    'the three Arabic refusals are text settings kept off the public site';
  assert app.setting_int('pricing.area_per_tree_min_m2', 0) < app.setting_int('pricing.area_per_tree_max_m2', 0),
    'the floor is below the ceiling';

  -- Every class in the table still prices: the bounds guard the derived area, never a curated density.
  assert not exists (
    select 1 from public.tree_spacing_classes c
    where c.is_active
      and (c.area_m2 < app.setting_int('pricing.area_per_tree_min_m2', 2)
           or c.area_m2 > app.setting_int('pricing.area_per_tree_max_m2', 2000))),
    'the default bounds contain all eight spacing classes, so no attached class starts refusing';

  -- The column now answers the question the owner asked.
  assert col_description('public.projects'::regclass,
           (select ordinal_position from information_schema.columns
            where table_schema = 'public' and table_name = 'projects'
              and column_name = 'annual_costs_millimes')::integer) is not null,
    'projects.annual_costs_millimes carries its unit in a comment';
end $$;
