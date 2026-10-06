-- 0133 · التخفيض يدخل التسعيرة — the quantity tier reaches the price the page prints.
--
-- Its test is supabase/tests/081_promotion_quote.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0133_promotion_quote.sql supabase/tests/081_promotion_quote.sql
--
-- 0132 built the tiers and the two functions that choose and apply one. This is the only change that makes
-- them visible to anybody: app.project_quote_payload is the one place in the product where a price is worked
-- out, and every screen that shows money reads it.
--
-- REGENERATED FROM THE LIVE DEFINITION, not retyped: the body below is what the database is running today
-- with six edits in it, so nothing else in a 193-line function can drift while this one rule is added.
--
-- WHAT CHANGES, and nothing else does:
--   · the cash total becomes the discounted one, and the price BEFORE the tier is published beside it;
--   · the instalment plan is financed on the instalment tier's total — which may be a different tier —
--     because a client given 10%% off and then charged interest on the full amount has not been given 10%% off;
--   · both objects carry their own `promotion`, so a page prints the discount lines on one condition.
--
-- An offer with no tier prices exactly as it did yesterday: apply_promotion returns the total untouched and
-- publishes no promotion key, so `promotion` is null and every existing reader is unaffected.

CREATE OR REPLACE FUNCTION app.project_quote_payload(p_project uuid, p_spacing_class uuid DEFAULT NULL::uuid, p_trees integer DEFAULT NULL::integer, p_payment_mode text DEFAULT NULL::text, p_down_percent_option_id uuid DEFAULT NULL::uuid, p_duration_option_id uuid DEFAULT NULL::uuid, p_staff boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- 0132 · quantity promotions. v_base_total is the price before any tier, kept so the three figures the
  -- client reads — before, discount, after — add up on screen instead of being recomputed on the page.
  v_base_total bigint;
  v_inst_total bigint;
  v_promo_cash jsonb;
  v_promo_inst jsonb;
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
      -- The tier this basket falls in, for each way of paying — they may differ (owner: «Cash: 15%,
      -- تقسيط: 10%»), so the cash figure and the figure the plan is built on are worked out separately
      -- from the SAME base. The instalment plan is then financed on the discounted total, not on the
      -- list price: a client who is given 10% off and then charged interest on the full amount has not
      -- been given 10% off.
      v_base_total := v_total;
      v_promo_cash := app.apply_promotion(v_base_total, v_trees, app.promotion_for(v_pj.id, v_trees, 'cash'));
      v_total      := (v_promo_cash->>'total_millimes')::bigint;
      v_promo_inst := app.apply_promotion(v_base_total, v_trees, app.promotion_for(v_pj.id, v_trees, 'installments'));
      v_inst_total := (v_promo_inst->>'total_millimes')::bigint;
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
      v_down     := app.down_payment_from_percent(v_inst_total, v_percent.min_number, v_pj.id);
      if v_percent.id is null or v_duration.id is null or v_down is null or v_duration.min_number is null then
        v_inst_st := 'invalid_choice';
      else
        v_quote   := app.financed_quote(v_inst_total, v_down, v_duration.min_number::integer, v_pj.id);
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
    -- The tier the PLAN was built on, which is not always the one the cash price got.
    v_inst := v_inst || jsonb_build_object(
      'total_before_promotion_millimes', case when v_promo_inst ? 'promotion' then v_base_total end,
      'promotion', v_promo_inst->'promotion');
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
    -- What the basket cost before its tier, and the tier itself. Both null when no promotion applied, so a
    -- page can print the discount lines on the one condition «promotion is not null».
    'total_before_promotion_millimes', case when v_pricing = 'ok' and v_promo_cash ? 'promotion' then v_base_total end,
    'promotion', case when v_pricing = 'ok' then v_promo_cash->'promotion' end,
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
end $function$

