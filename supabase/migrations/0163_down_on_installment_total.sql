-- The down payment is a share of the TOTAL PRICE ON INSTALMENTS, not of the cash price (owner, 2026-11-17:
-- «نحب التسبقة تتحسب من السعر الجملي بالتقسيط، بدلها مش بالحاضر»).
--
-- Test: supabase/tests/109_down_on_installment_total.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0163_down_on_installment_total.sql supabase/tests/109_down_on_installment_total.sql
--
-- WHAT DOES NOT CHANGE. The markup of the chosen duration still applies to what is financed only (0036, owner
-- 2026-09-16): remaining = (cash − down) × (1 + markup), and «السعر الجملي بالتقسيط» = down + remaining. The
-- monthly amount, its rounding and the shorter last instalment are app.financed_quote's, untouched.
--
-- WHAT CHANGES is the base of the percentage. With p the percentage and m the markup:
--   total = down + (cash − down)(1 + m)   and   down = p × total
--   ⇒ total = cash (1 + m) / (1 + p m)     and   down = cash · p (1 + m) / (1 + p m)
-- so the down payment printed beside «السعر الجملي بالتقسيط» is exactly that percentage of it (to the price step,
-- rounded up as before). 10 % of 10,000 د over 60 months at +18 %: 1,160 د down, 11,592 د in all — it was
-- 1,000 د of the cash price, beside a total of 11,620 د.
--
-- The markup depends on the duration, so the down payment now does too: every place that turned a percentage
-- into dinars passes the duration as well. app.down_payment_from_percent stays (a legacy parcel's «ابتداءً من»
-- still reads it when an offer lists no duration).


create or replace function app.down_payment_on_installments(
  p_cash_total_millimes bigint, p_percent numeric, p_months integer, p_project uuid default null
) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_bp integer;
begin
  if p_cash_total_millimes is null or p_cash_total_millimes < 0 or p_percent is null
     or not (p_percent > 0 and p_percent <= 100) or p_months is null then
    return null;
  end if;
  -- The same markup app.financed_quote will apply: the offer's own row first, then the global one. A duration
  -- with no markup is priced at 0 here and refused by app.financed_quote as duration_not_priced, as before.
  select m.markup_bp into v_bp
  from public.financing_markups m
  where m.months = p_months and (m.project_id is null or m.project_id = p_project)
  order by (m.project_id is null)
  limit 1;
  v_bp := coalesce(v_bp, 0);
  -- down = cash · p (1 + m) / (1 + p m), with p in percent and m in basis points.
  return (ceil(p_cash_total_millimes::numeric * p_percent * (10000 + v_bp)
               / (1000000 + p_percent * v_bp) / app.price_rounding(p_project))
          * app.price_rounding(p_project))::bigint;
end $$;
revoke execute on function app.down_payment_on_installments(bigint, numeric, integer, uuid) from public, anon, authenticated;
comment on function app.down_payment_on_installments(bigint, numeric, integer, uuid) is
  'Owner 2026-11-17: the down payment is p % of the total price on instalments (down + (cash − down)(1 + markup of the duration)), rounded up to the price step. Null outside 0 < p ≤ 100 or without a duration.';

comment on function app.financed_quote(bigint, bigint, integer, uuid) is
  'Report v3 §12 / owner 2026-09-16: the markup of the chosen duration applies to the financed part only. remaining = (cash − down) × (1 + markup); total financed = down + remaining; the monthly amount is rounded up and the last installment absorbs the difference. Since 2026-11-17 the down payment it is handed is a share of that total (app.down_payment_on_installments).';

-- ---------------------------------------------------------------------------
-- The five places a percentage became dinars, as production runs them, with that one line changed
-- ---------------------------------------------------------------------------

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
      v_down     := app.down_payment_on_installments(v_inst_total, v_percent.min_number, v_duration.min_number::integer, v_pj.id);
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
end $function$;

CREATE OR REPLACE FUNCTION public.public_tree_quote(p_spacing_class uuid, p_trees integer DEFAULT NULL::integer, p_payment_mode text DEFAULT NULL::text, p_down_percent_option_id uuid DEFAULT NULL::uuid, p_duration_option_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_class    public.tree_spacing_classes;
  v_max      integer;
  v_trees    integer;
  v_pricing  text;
  v_price    jsonb;
  v_per_tree bigint;
  v_total    bigint;
  v_annual   bigint;
  v_percent  public.option_items;
  v_duration public.option_items;
  v_down     bigint;
  v_quote    jsonb;
  v_status   text;
  v_ok       boolean;
  v_inst     jsonb;
begin
  select * into v_class from public.tree_spacing_classes c where c.id = p_spacing_class and c.is_active;
  if not found then
    return null;
  end if;

  select greatest(app.setting_int('million.custom_trees_max', 5000), coalesce(max(o.min_number), 0)::integer)
  into v_max
  from public.option_items o
  where o.list_key = 'tree_count' and o.is_active;
  v_trees := case when p_trees between 1 and v_max then p_trees end;

  if not app.module_open('pricing') then
    v_pricing := 'closed';
  else
    v_price := app.tree_price(v_class.id, null);
    if coalesce((v_price->>'ok')::boolean, false) then
      v_pricing  := 'ok';
      v_per_tree := (v_price->>'price_per_tree_millimes')::bigint;
      v_total    := v_per_tree * v_trees;
      v_annual   := (v_price->>'annual_fee_per_tree_millimes')::bigint;
    else
      v_pricing := 'unavailable';
    end if;
  end if;

  if v_pricing = 'ok' and p_payment_mode = 'installments' and v_trees is not null then
    if p_down_percent_option_id is null or p_duration_option_id is null then
      v_status := 'incomplete';
    else
      v_percent  := app.active_option('down_payment_percent', p_down_percent_option_id::text);
      v_duration := app.active_option('duration', p_duration_option_id::text);
      -- 0163: the percentage is a share of the total on instalments, which depends on the duration.
      v_down     := app.down_payment_on_installments(v_total, v_percent.min_number, v_duration.min_number::integer, null);
      if v_percent.id is null or v_duration.id is null or v_down is null or v_duration.min_number is null then
        v_status := 'invalid_choice';
      else
        v_quote  := app.financed_quote(v_total, v_down, v_duration.min_number::integer, null);
        v_status := case when (v_quote->>'ok')::boolean then 'ok' else v_quote->>'reason' end;
      end if;
    end if;
    v_ok := v_status = 'ok';
    v_inst := jsonb_build_object(
      'status', v_status,
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
  end if;

  return jsonb_build_object(
    'spacing_class_id', v_class.id,
    'label_ar', v_class.label_ar,
    'label_fr', v_class.label_fr,
    'row_spacing_m', v_class.row_spacing_m,
    'tree_spacing_m', v_class.tree_spacing_m,
    'area_per_tree_m2', v_class.area_m2,
    'trees', v_trees,
    'total_area_m2', v_class.area_m2 * v_trees,
    'pricing', v_pricing,
    'price_per_tree_millimes', case when v_pricing = 'ok' then v_per_tree end,
    'total_price_millimes', case when v_pricing = 'ok' then v_total end,
    -- Every year, for the trees chosen; never added to the price above.
    'annual_fee_per_tree_millimes', case when v_pricing = 'ok' then v_annual end,
    'annual_fee_total_millimes', case when v_pricing = 'ok' then v_annual * v_trees end,
    'installments', v_inst
  );
end $function$;

CREATE OR REPLACE FUNCTION public.staff_tree_quote(p_spacing_class uuid, p_trees integer DEFAULT NULL::integer, p_project uuid DEFAULT NULL::uuid, p_down_percent numeric DEFAULT NULL::numeric, p_months integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_area  numeric;
  v_trees integer := case when p_trees >= 1 then p_trees end;
  v_price jsonb;
  v_total bigint;
  v_inst  jsonb;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.area_m2 into v_area from public.tree_spacing_classes c where c.id = p_spacing_class;
  v_price := app.tree_price(p_spacing_class, p_project);
  if coalesce((v_price->>'ok')::boolean, false) then
    v_total := (v_price->>'price_per_tree_millimes')::bigint * v_trees;
  end if;

  if v_total is not null and p_down_percent is not null and p_months is not null then
    if not (p_down_percent > 0 and p_down_percent <= 100) then
      v_inst := jsonb_build_object('ok', false, 'reason', 'invalid_input');
    else
      v_inst := app.financed_quote(v_total, app.down_payment_on_installments(v_total, p_down_percent, p_months, p_project),
                                   p_months, p_project);
    end if;
    v_inst := v_inst || jsonb_build_object('down_payment_percent', p_down_percent);
  end if;

  return jsonb_build_object(
    'area_per_tree_m2', v_area,
    'trees', v_trees,
    'total_area_m2', v_area * v_trees,
    'price', v_price,
    'total_price_millimes', v_total,
    'installments', v_inst
  );
end $function$;

CREATE OR REPLACE FUNCTION public.submit_interest_request(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- «من المواطنين بالخارج» (owner, 2026-10-03). Absent means no, never unknown: the question is a
  -- checkbox, so a payload without it is a visitor who did not tick it.
  v_abroad boolean := coalesce((p->>'lives_abroad')::boolean, false);
  v_name         text := btrim(coalesce(p->>'full_name', ''));
  v_phone        text := p->>'phone_e164';
  v_whatsapp     text := nullif(p->>'whatsapp_e164', '');
  v_email        text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_gov          smallint := nullif(p->>'residence_governorate_id', '')::smallint;
  v_del          integer := nullif(p->>'residence_delegation_id', '')::integer;
  v_anywhere     boolean := coalesce((p->>'invest_anywhere')::boolean, false);
  v_unsure       boolean := coalesce((p->>'project_type_unsure')::boolean, false);
  v_consent      text := nullif(btrim(coalesce(p->>'consent_text', '')), '');
  v_invest_govs  smallint[];
  v_types        uuid[];
  v_scenarios    uuid[];
  v_scn_labels   text[] := '{}';
  v_plantation   text[] := '{}';
  v_production   text[] := '{}';
  v_any_scenario boolean := false;
  v_channel      public.contact_channel;
  v_goal         public.option_items;
  v_down         public.option_items;
  v_percent      public.option_items;
  v_inst         public.option_items;
  v_duration     public.option_items;
  v_budget       public.option_items;
  v_time         public.option_items;
  v_area         public.option_items;
  v_trees        public.option_items;
  v_custom       integer;
  v_priority     public.option_items;
  -- Optional yes/no answers: only a JSON boolean counts, anything else is «no answer», never an error.
  v_wants_visit  boolean := case when jsonb_typeof(p->'wants_visit') = 'boolean' then (p->>'wants_visit')::boolean end;
  v_wants_bank   boolean := case when jsonb_typeof(p->'wants_bank_financing') = 'boolean'
                                 then (p->>'wants_bank_financing')::boolean end;
  v_payment_mode text := nullif(btrim(coalesce(p->>'payment_mode', '')), '');
  v_spacing      public.tree_spacing_classes;
  v_tree_n       integer;
  v_trees_label  text;
  v_total_area   numeric;
  v_price        jsonb;
  v_quote        jsonb;
  v_price_tree   bigint;
  v_price_total  bigint;
  v_down_amount  bigint;
  v_financed     bigint;
  v_monthly      bigint;
  v_status_id    uuid;
  v_person_id    uuid;
  v_inserted     boolean;
  v_assignee     uuid;
  v_year         text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_request_no   text;
  v_request_id   uuid;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'invalid_full_name' using errcode = 'P0001';
  end if;
  perform app.assert_phone(v_phone, 'invalid_phone');
  if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_whatsapp' using errcode = 'P0001';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_consent is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  -- Residence: governorate required, delegation optional but checked when given.
  if not exists (select 1 from public.governorates g where g.id = v_gov and g.is_active) then
    raise exception 'invalid_governorate' using errcode = 'P0001';
  end if;
  if v_del is not null and not exists (
    select 1 from public.delegations d where d.id = v_del and d.governorate_id = v_gov and d.is_active
  ) then
    raise exception 'invalid_delegation' using errcode = 'P0001';
  end if;

  -- Where to invest
  select coalesce(array_agg(distinct x::smallint), '{}') into v_invest_govs
  from jsonb_array_elements_text(coalesce(p->'invest_governorate_ids', '[]'::jsonb)) x;
  if v_anywhere then
    v_invest_govs := '{}';
  elsif cardinality(v_invest_govs) = 0 then
    raise exception 'invest_location_required' using errcode = 'P0001';
  elsif (select count(*) from public.governorates g where g.id = any (v_invest_govs) and g.is_active)
        <> cardinality(v_invest_govs) then
    raise exception 'invalid_invest_governorate' using errcode = 'P0001';
  end if;

  -- What the citizen wants to own (clause 25.3). Scenarios decide the project types.
  select coalesce(array_agg(distinct x::uuid), '{}') into v_scenarios
  from jsonb_array_elements_text(coalesce(p->'scenario_ids', '[]'::jsonb)) x;

  if cardinality(v_scenarios) > 0 then
    if (select count(*) from public.ownership_scenarios s where s.id = any (v_scenarios) and s.is_active)
       <> cardinality(v_scenarios) then
      raise exception 'invalid_scenario' using errcode = 'P0001';
    end if;
    if not app.setting_bool('lead.project_types_multi', true) and cardinality(v_scenarios) > 1 then
      raise exception 'single_scenario_only' using errcode = 'P0001';
    end if;

    select
      coalesce(array_agg(distinct s.project_type_id) filter (where s.project_type_id is not null), '{}'),
      coalesce(array_agg(s.label_ar order by s.sort_order), '{}'),
      coalesce(array_agg(distinct s.plantation_system) filter (where s.plantation_system is not null), '{}'),
      coalesce(array_agg(distinct s.production_status) filter (where s.production_status is not null), '{}'),
      bool_or(s.is_any)
    into v_types, v_scn_labels, v_plantation, v_production, v_any_scenario
    from public.ownership_scenarios s
    where s.id = any (v_scenarios);

    if v_any_scenario then
      v_types := '{}';
    end if;
    v_unsure := v_any_scenario or cardinality(v_types) = 0;
  else
    -- Fallback for callers that still send project types directly.
    select coalesce(array_agg(distinct x::uuid), '{}') into v_types
    from jsonb_array_elements_text(coalesce(p->'project_type_ids', '[]'::jsonb)) x;
    if v_unsure then
      v_types := '{}';
    elsif cardinality(v_types) = 0 then
      -- Plan Q-6: the offer type is an optional question; no answer is recorded as «no specific type».
      v_unsure := true;
    elsif not app.setting_bool('lead.project_types_multi', true) and cardinality(v_types) > 1 then
      raise exception 'single_project_type_only' using errcode = 'P0001';
    elsif (select count(*) from public.project_types t where t.id = any (v_types) and t.is_active)
          <> cardinality(v_types) then
      raise exception 'invalid_project_type' using errcode = 'P0001';
    end if;
  end if;

  -- Options from Back Office lists (LEAD-01), snapshotted below (LEAD-02)
  v_goal := app.active_option('goal', p->>'goal_option_id');
  if v_goal.id is null then raise exception 'invalid_goal' using errcode = 'P0001'; end if;
  -- Addendum «طريقة الدفع»: a cash buyer picks no down payment, duration or installment; ids sent anyway are ignored.
  if v_payment_mode is not null and v_payment_mode not in ('cash', 'installments') then
    raise exception 'invalid_payment_mode' using errcode = 'P0001';
  end if;
  -- Plan Q-1/Q-2: the down payment is a percentage of the cash total, chosen once on /start.
  if nullif(p->>'down_payment_percent_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_percent := app.active_option('down_payment_percent', p->>'down_payment_percent_option_id');
    if v_percent.id is null then raise exception 'invalid_down_payment_percent' using errcode = 'P0001'; end if;
  end if;
  -- Plan Q-7: the amount list is retired; a legacy caller that still sends an amount is checked and snapshotted.
  if nullif(p->>'down_payment_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_down := app.active_option('down_payment', p->>'down_payment_option_id');
    if v_down.id is null then raise exception 'invalid_down_payment' using errcode = 'P0001'; end if;
  end if;
  -- Report v3 §6: the client no longer picks a monthly amount; older callers may still send one.
  if nullif(p->>'installment_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_inst := app.active_option('monthly_installment', p->>'installment_option_id');
    if v_inst.id is null then raise exception 'invalid_installment' using errcode = 'P0001'; end if;
  end if;
  -- Report v3 §8: the payment duration, in months
  if nullif(p->>'duration_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_duration := app.active_option('duration', p->>'duration_option_id');
    if v_duration.id is null then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  end if;
  -- Installments need a percentage and a duration, as long as the Back Office offers any.
  if v_payment_mode = 'installments' then
    if v_percent.id is null
       and exists (select 1 from public.option_items o where o.list_key = 'down_payment_percent' and o.is_active) then
      raise exception 'down_payment_percent_required' using errcode = 'P0001';
    end if;
    if v_duration.id is null
       and exists (select 1 from public.option_items o where o.list_key = 'duration' and o.is_active) then
      raise exception 'duration_required' using errcode = 'P0001';
    end if;
  end if;
  -- Report v3 §40: the overall budget
  if nullif(p->>'budget_option_id', '') is not null then
    v_budget := app.active_option('budget', p->>'budget_option_id');
    if v_budget.id is null then raise exception 'invalid_budget' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'contact_time_option_id', '') is not null then
    v_time := app.active_option('contact_time', p->>'contact_time_option_id');
    if v_time.id is null then raise exception 'invalid_contact_time' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'desired_area_option_id', '') is not null then
    v_area := app.active_option('desired_area', p->>'desired_area_option_id');
    if v_area.id is null then raise exception 'invalid_desired_area' using errcode = 'P0001'; end if;
  end if;
  -- MIL-01 · how many olive trees the citizen wants to start with
  if nullif(p->>'tree_count_option_id', '') is not null then
    v_trees := app.active_option('tree_count', p->>'tree_count_option_id');
    if v_trees.id is null then raise exception 'invalid_tree_choice' using errcode = 'P0001'; end if;
  end if;
  -- ... or a number typed on /start. The database stays strict: Western digits only, the page converts.
  begin
    v_custom := nullif(btrim(coalesce(p->>'tree_count_custom', '')), '')::integer;
  exception when others then
    raise exception 'invalid_tree_custom' using errcode = 'P0001';
  end;
  if v_custom is not null then
    if nullif(p->>'tree_count_option_id', '') is not null then
      raise exception 'invalid_tree_choice' using errcode = 'P0001';
    end if;
    if v_custom < app.setting_int('million.custom_trees_min', 1)
       or v_custom > app.setting_int('million.custom_trees_max', 5000) then
      raise exception 'invalid_tree_custom' using errcode = 'P0001';
    end if;
  end if;
  -- Addendum: the spacing class sets the area attached to each tree
  if nullif(p->>'spacing_class_id', '') is not null then
    select * into v_spacing from public.tree_spacing_classes c
    where c.id::text = p->>'spacing_class_id' and c.is_active;
    if v_spacing.id is null then raise exception 'invalid_spacing' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'priority_option_id', '') is not null then
    v_priority := app.active_option('priority', p->>'priority_option_id');
    if v_priority.id is null then raise exception 'invalid_priority' using errcode = 'P0001'; end if;
  end if;
  begin
    v_channel := (p->>'contact_channel')::public.contact_channel;
  exception when invalid_text_representation then
    v_channel := null;
  end;
  if v_channel is null then
    raise exception 'contact_channel_required' using errcode = 'P0001';
  end if;

  -- Throttling (LEAD-06)
  perform app.check_throttle('interest:ip', nullif(p->>'ip_hash', ''), interval '1 hour',
                             app.setting_int('antispam.max_requests_per_ip_per_hour', 10));
  if (select count(*) from public.interest_requests r
      where r.phone_e164 = v_phone and r.created_at > now() - interval '1 day')
     >= app.setting_int('antispam.max_requests_per_phone_per_day', 3) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- One person per phone (LEAD-04). Existing person data is never overwritten from the public form.
  select id into v_status_id from public.lead_statuses
  where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;

  insert into public.persons as ps
    (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, status_id, consent_at, last_request_at, lives_abroad)
  values
    (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del, v_status_id, now(), now(), v_abroad)
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at,
        lives_abroad = excluded.lives_abroad
  returning ps.id, (ps.xmax = 0) into v_person_id, v_inserted;

  -- Optional automatic assignment (LEAD-12)
  if v_inserted and app.setting_text('crm.auto_assign_mode', 'manual') = 'round_robin' then
    select ur.user_id into v_assignee
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    left join lateral (
      select max(pa.created_at) as last_at from public.person_assignments pa where pa.to_user = ur.user_id
    ) la on true
    where ur.role = 'commercial' and pr.is_active
    order by la.last_at nulls first, ur.granted_at
    limit 1;
    if v_assignee is not null then
      update public.persons set assigned_to = v_assignee where id = v_person_id;
      insert into public.person_assignments (person_id, from_user, to_user, reason)
      values (v_person_id, null, v_assignee, 'auto:round_robin');
    end if;
  end if;

  -- The figures shown on /start, recomputed here so a demand never carries a price the client could not see.
  v_tree_n      := case when v_custom is null then v_trees.min_number::integer else v_custom end;
  v_trees_label := case when v_custom is null then v_trees.label_ar
                        else v_custom::text || ' ' || app.setting_text('start.trees_unit', 'زيتونة') end;
  v_total_area  := v_spacing.area_m2 * v_tree_n;
  if v_spacing.id is not null and v_tree_n is not null and app.module_open('pricing') then
    v_price := app.tree_price(v_spacing.id, null);
    if coalesce((v_price->>'ok')::boolean, false) then
      v_price_tree  := (v_price->>'price_per_tree_millimes')::bigint;
      v_price_total := v_price_tree * v_tree_n;
      if v_payment_mode = 'installments' and v_percent.id is not null and v_duration.id is not null then
        -- 0163: the same share of the same total on instalments as public_tree_quote, so the figures match /start.
        v_quote := app.financed_quote(v_price_total,
                                      app.down_payment_on_installments(v_price_total, v_percent.min_number, v_duration.min_number::integer, null),
                                      v_duration.min_number::integer, null);
        if coalesce((v_quote->>'ok')::boolean, false) then
          v_down_amount := (v_quote->>'down_payment_millimes')::bigint;
          v_financed    := (v_quote->>'total_financed_millimes')::bigint;
          v_monthly     := (v_quote->>'monthly_millimes')::bigint;
        end if;
      end if;
    end if;
  end if;

  v_request_no := app.setting_text('request_no.prefix', 'AGZ') || '-' || v_year || '-'
                  || lpad(app.next_number('interest_request:' || v_year)::text, 6, '0');

  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, email,
    residence_governorate_id, residence_delegation_id, lives_abroad,
    invest_anywhere, invest_governorate_ids, project_type_unsure, project_type_ids,
    scenario_ids, scenario_labels, plantation_systems, production_statuses,
    tree_count_option_id, tree_count_code, tree_count_label_ar, tree_count_min, tree_count_max,
    desired_area_option_id, desired_area_label_ar, desired_area_min_m2, desired_area_max_m2,
    priority_option_id, priority_code, priority_label_ar,
    goal_option_id, goal_code, goal_label_ar,
    down_payment_option_id, down_payment_label_ar, down_payment_min_millimes, down_payment_max_millimes,
    installment_option_id, installment_label_ar, installment_min_millimes, installment_max_millimes,
    duration_option_id, duration_label_ar, duration_months,
    budget_option_id, budget_label_ar, budget_min_millimes, budget_max_millimes,
    wants_visit, wants_bank_financing,
    spacing_class_id, spacing_label_ar, area_per_tree_m2, total_area_m2, payment_mode,
    price_per_tree_millimes, total_price_millimes,
    down_payment_percent_option_id, down_payment_percent, down_payment_amount_millimes,
    total_financed_millimes, monthly_millimes,
    contact_channel, contact_time_option_id, contact_time_label_ar,
    is_duplicate, source, consent_text
  ) values (
    v_request_no, v_person_id, v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email,
    v_gov, v_del, v_abroad,
    v_anywhere, v_invest_govs, v_unsure, v_types,
    v_scenarios, v_scn_labels, v_plantation, v_production,
    case when v_custom is null then v_trees.id end,
    case when v_custom is null then v_trees.code else 'custom' end,
    v_trees_label,
    v_tree_n,
    case when v_custom is null then v_trees.max_number::integer else v_custom end,
    v_area.id, v_area.label_ar, v_area.min_number, v_area.max_number,
    v_priority.id, v_priority.code, v_priority.label_ar,
    v_goal.id, v_goal.code, v_goal.label_ar,
    v_down.id, v_down.label_ar, v_down.min_millimes, v_down.max_millimes,
    v_inst.id, v_inst.label_ar, v_inst.min_millimes, v_inst.max_millimes,
    v_duration.id, v_duration.label_ar, v_duration.min_number::integer,
    v_budget.id, v_budget.label_ar, v_budget.min_millimes, v_budget.max_millimes,
    v_wants_visit, v_wants_bank,
    v_spacing.id, v_spacing.label_ar, v_spacing.area_m2, v_total_area, v_payment_mode,
    v_price_tree, v_price_total,
    v_percent.id, v_percent.min_number, v_down_amount,
    v_financed, v_monthly,
    v_channel, v_time.id, v_time.label_ar,
    not v_inserted, app.clean_source(coalesce(p->'source', '{}'::jsonb)), v_consent
  ) returning id into v_request_id;

  -- Plan P2-4: the summary figures travel with the message, ready for a template that names them.
  perform app.enqueue_message(
    'lead.confirmation', v_phone,
    jsonb_build_object('name', split_part(v_name, ' ', 1), 'request_no', v_request_no,
                       'trees', v_trees_label, 'total_area_m2', v_total_area, 'total_price_millimes', v_price_total),
    'interest_requests', v_request_id
  );

  return jsonb_build_object('request_no', v_request_no);
end $function$;

CREATE OR REPLACE FUNCTION public.public_parcels()
 RETURNS TABLE(id uuid, project_id uuid, project_code text, project_name text, project_status project_status, project_type_id uuid, governorate_id smallint, delegation_id integer, code text, area_m2 numeric, property_type text, plantation_system text, olive_tree_count integer, tree_age_years numeric, production_status text, irrigation irrigation_type, status parcel_status, offered boolean, on_tree_pricing boolean, spacing_class_id uuid, spacing_label_ar text, area_per_tree_m2 numeric, price_per_tree_millimes bigint, cash_price_millimes bigint, down_from_millimes bigint, annual_costs_millimes bigint, sort_order integer, photo_url text, photo_alt_ar text, photo_aspect text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    pa.id, pa.project_id, pj.code, pj.name, pj.status,
    pj.project_type_id, pj.governorate_id, pj.delegation_id,
    pa.code,
    coalesce((pr.p->>'total_area_m2')::numeric, pa.area_m2),
    pa.property_type, pa.plantation_system, pa.olive_tree_count, pa.tree_age_years,
    pa.production_status, pa.irrigation, pa.status,
    app.parcel_offered(pj.status, pa.status),
    coalesce((pr.p->>'on_tree_pricing')::boolean, false),
    sc.id,
    sc.label_ar,
    (pr.p->>'area_per_tree_m2')::numeric,
    case when m.tree_priced then (pr.p->>'price_per_tree_millimes')::bigint end,
    case when m.tree_priced then (pr.p->>'cash_total_millimes')::bigint
         when m.legacy_priced then pa.cash_price_millimes end,
    case when m.tree_priced
           -- 0163: the smallest down payment the offer can be bought with — its smallest percentage of the total
           -- on instalments over its cheapest duration; the old cash share only when it lists no duration.
           then coalesce(
                  (select min(app.down_payment_on_installments(
                            (pr.p->>'cash_total_millimes')::bigint,
                            (select min(o.min_number) from app.project_down_percent_items(pa.project_id) o),
                            d.min_number::integer, pa.project_id))
                   from app.project_duration_items(pa.project_id) d),
                  app.down_payment_from_percent(
                    (pr.p->>'cash_total_millimes')::bigint,
                    (select min(o.min_number) from app.project_down_percent_items(pa.project_id) o),
                    pa.project_id))
         when m.legacy_priced then app.parcel_down_from(pa.id, pa.cash_price_millimes) end,
    case when app.parcel_offered(pj.status, pa.status) then pa.annual_costs_millimes end,
    pa.sort_order,
    null::text, null::text, null::text
  from public.parcels pa
  join public.projects pj on pj.id = pa.project_id
  cross join lateral (select app.parcel_price(pa.id) as p) pr
  left join public.tree_spacing_classes sc on sc.id = (pr.p->>'spacing_class_id')::uuid
  cross join lateral (
    select
      app.parcel_offered(pj.status, pa.status)
        and coalesce((pr.p->>'on_tree_pricing')::boolean, false)
        and pr.p->>'pricing' = 'ok'
        and app.module_open('pricing') as tree_priced,
      app.parcel_offered(pj.status, pa.status)
        and not coalesce((pr.p->>'on_tree_pricing')::boolean, false)
        and pa.cash_price_millimes > 0 as legacy_priced
  ) m
  where app.project_visible(pj.status)
    and app.parcel_visible_status(pa.status)
  order by (pj.status = 'published') desc, pj.code, pa.sort_order, pa.code
  limit greatest(20, least(1000, app.setting_int('projects.listing_limit', 300)))
$function$;

-- The calculator's own sentence, and its four drafts.
update public.settings set value = to_jsonb('التسبقة تتحسب من السعر الجملي بالتقسيط.'::text)
where key = 'start.down_percent_hint';
-- The French line the bilingual /start page prints under the Arabic one.
update public.settings set value = to_jsonb('L''apport est calculé sur le prix total à crédit.'::text)
where key = 'start.down_percent_hint_fr';

update public.translations t set value = to_jsonb(v.value), is_draft = true
from (values
  ('fr', 'L''apport est calculé sur le prix total à crédit.'),
  ('de', 'Die Anzahlung wird vom Gesamtpreis bei Ratenzahlung berechnet.'),
  ('it', 'L''anticipo è calcolato sul prezzo totale a rate.'),
  ('en', 'The down payment is calculated on the total instalment price.')
) as v(locale, value)
where t.entity = 'setting' and t.entity_key = 'start.down_percent_hint' and t.field = 'value' and t.locale = v.locale;
