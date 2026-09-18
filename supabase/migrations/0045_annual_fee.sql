-- The yearly care of one olive tree belongs to its offer (owner, 2026-09-18: «المعاليم السنوية (150 د) للزيتونة
-- الوحدة متغيرة حسب الزيتونة»).
--
-- Pruning, upkeep and follow-up are paid every year, per tree, and the amount depends on the grove: a forty-year
-- productive tree is not cared for like a young intensive one. So the fee sits with the other per-offer rules
-- (0031): one global default that every offer inherits, and any offer may carry its own.
--
-- It is never part of the purchase price. The visitor reads what a tree costs once, and what it costs every year,
-- as two separate figures — and neither is a promise of income (PRN-01). app.financed_quote is untouched: the fee
-- is not financed and carries no markup (0036).

alter table public.tree_pricing_rules
  add column annual_fee_per_tree_millimes bigint check (annual_fee_per_tree_millimes >= 0);

comment on column public.tree_pricing_rules.annual_fee_per_tree_millimes is
  'Yearly care of one tree (pruning, upkeep, follow-up) in millimes. Null on an offer inherits the global row; null on the global row means no fee is shown.';

-- The owner''s figure, on the global row so every offer starts from it.
update public.tree_pricing_rules
set annual_fee_per_tree_millimes = 150000
where project_id is null and annual_fee_per_tree_millimes is null;

-- ---------------------------------------------------------------------------
-- The engine carries the fee beside the price, resolved the same way (offer first, then global)
-- ---------------------------------------------------------------------------

create or replace function app.tree_price(p_spacing_class uuid, p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class        public.tree_spacing_classes;
  v_global       public.tree_pricing_rules;
  v_rule         public.tree_pricing_rules;
  v_area         numeric;
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
  select * into v_class from public.tree_spacing_classes c where c.id = p_spacing_class and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'spacing_not_found');
  end if;
  v_area := v_class.area_m2;

  -- Plan Q-13 / P1-7: a project that lists its classes sells only those.
  if p_project is not null
     and exists (select 1 from public.project_spacing_classes pc where pc.project_id = p_project)
     and not exists (select 1 from public.project_spacing_classes pc
                     where pc.project_id = p_project and pc.spacing_class_id = p_spacing_class) then
    return jsonb_build_object('ok', false, 'reason', 'spacing_not_allowed', 'area_m2', v_area);
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
revoke execute on function app.tree_price(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The public quotes show the yearly figure beside the price, under the same flag
-- ---------------------------------------------------------------------------

create or replace function public.public_tree_quote(
  p_spacing_class uuid, p_trees integer default null, p_payment_mode text default null,
  p_down_percent_option_id uuid default null, p_duration_option_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
      -- Plan Q-2: the percentage applies to the cash total the visitor has just seen.
      v_down     := app.down_payment_from_percent(v_total, v_percent.min_number, null);
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
end $$;

revoke execute on function public.public_tree_quote(uuid, integer, text, uuid, uuid) from public;
grant execute on function public.public_tree_quote(uuid, integer, text, uuid, uuid) to anon, authenticated;

comment on function public.public_tree_quote(uuid, integer, text, uuid, uuid) is
  'Public /start quote (addendum «ما يظهر للـVisitor», report v3 §12): area per tree, total area, price per tree, total price, the yearly care per tree and for the trees chosen, and installment figures for a down payment percentage and a duration, gated on the pricing flag. Never the land price, planting cost, extra costs, cost, margin, markup or internal notes.';

-- ---------------------------------------------------------------------------
-- An offer quote and a parcel price carry the same yearly figure
-- ---------------------------------------------------------------------------

create or replace function app.parcel_price(p_parcel uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pa     public.parcels;
  v_class  uuid;
  v_status text;
  v_area   numeric;
  v_trees  integer;
  v_price  jsonb;
  v_per    bigint;
  v_annual bigint;
  v_reason text;
begin
  select * into v_pa from public.parcels pa where pa.id = p_parcel;
  if not found then
    return null;
  end if;

  select c.spacing_class_id, c.status into v_class, v_status
  from app.project_spacing_choice(v_pa.project_id, v_pa.spacing_class_id) c;

  if v_status = 'legacy' then
    return jsonb_build_object(
      'on_tree_pricing', false,
      'spacing_class_id', null,
      'area_per_tree_m2', null,
      'trees', v_pa.olive_tree_count,
      'total_area_m2', v_pa.area_m2,
      'price_per_tree_millimes', null,
      -- A parcel saved under tree pricing stores 0, which is never a price.
      'cash_total_millimes', nullif(v_pa.cash_price_millimes, 0),
      'annual_fee_per_tree_millimes', null,
      'annual_fee_total_millimes', nullif(v_pa.annual_costs_millimes, 0),
      'pricing', 'legacy',
      'reason', null);
  end if;

  select sc.area_m2 into v_area from public.tree_spacing_classes sc where sc.id = v_class;
  v_trees := case when v_pa.olive_tree_count >= 1 then v_pa.olive_tree_count end;

  if v_status <> 'ok' then
    v_reason := case v_status when 'required' then 'spacing_required' else 'spacing_not_allowed' end;
  else
    v_price := app.tree_price(v_class, v_pa.project_id);
    if coalesce((v_price->>'ok')::boolean, false) then
      v_per    := (v_price->>'price_per_tree_millimes')::bigint;
      v_annual := (v_price->>'annual_fee_per_tree_millimes')::bigint;
    else
      v_reason := v_price->>'reason';
    end if;
    if v_reason is null and v_trees is null then
      v_reason := 'trees_missing';
    end if;
  end if;

  return jsonb_build_object(
    'on_tree_pricing', true,
    'spacing_class_id', v_class,
    'area_per_tree_m2', v_area,
    'trees', v_pa.olive_tree_count,
    'total_area_m2', v_area * v_trees,
    'price_per_tree_millimes', v_per,
    'cash_total_millimes', v_per * v_trees,
    'annual_fee_per_tree_millimes', v_annual,
    'annual_fee_total_millimes', v_annual * v_trees,
    -- 'ok' is exactly «both totals are known», which the listings built on this function rely on.
    'pricing', case when v_per is not null and v_trees is not null then 'ok' else 'unavailable' end,
    'reason', v_reason);
end $$;
revoke execute on function app.parcel_price(uuid) from public, anon, authenticated;

comment on function app.parcel_price(uuid) is
  'The price of a parcel (plan Q-9): trees × price per tree of its class in its project, the yearly care for those trees, or the stored cash price when the project lists no class (''legacy''). No flag or status gate: callers gate.';
