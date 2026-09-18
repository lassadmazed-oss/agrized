-- The offer quote says what the trees cost each year (owner, 2026-09-18).
--
-- 0045 carried the yearly care into app.tree_price, the /start quote and app.parcel_price, but not into the offer
-- payload: an offer page could price ten trees without ever saying what they cost to keep. Same builder and the
-- same two keys as the other quotes, shown only while prices are open to the caller.

create or replace function app.project_quote_payload(
  p_project uuid, p_spacing_class uuid, p_trees integer, p_payment_mode text,
  p_down_percent_option_id uuid, p_duration_option_id uuid, p_staff boolean
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pj        public.projects;
  v_class_id  uuid;
  v_spacing   text;
  v_class     public.tree_spacing_classes;
  v_max       integer;
  v_trees     integer;
  v_breakdown boolean := p_staff and app.can_price();
  v_pricing   text;
  v_priceable boolean;
  v_price     jsonb;
  v_per_tree  bigint;
  v_annual    bigint;
  v_total     bigint;
  v_percent   public.option_items;
  v_duration  public.option_items;
  v_down      bigint;
  v_quote     jsonb;
  v_status    text;
  v_ok        boolean;
  v_inst      jsonb;
  v_choices   jsonb;
begin
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    return null;
  end if;

  select c.spacing_class_id, c.status into v_class_id, v_spacing
  from app.project_spacing_choice(v_pj.id, p_spacing_class) c;
  select * into v_class from public.tree_spacing_classes sc where sc.id = v_class_id;

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
                 when v_spacing = 'legacy' then 'legacy'
               end;
  v_priceable := v_pricing is null;

  if v_priceable then
    if v_spacing = 'ok' then
      v_price := app.tree_price(v_class_id, v_pj.id);
    end if;
    if coalesce((v_price->>'ok')::boolean, false) then
      v_pricing  := 'ok';
      v_per_tree := (v_price->>'price_per_tree_millimes')::bigint;
      v_annual   := (v_price->>'annual_fee_per_tree_millimes')::bigint;
      v_total    := v_per_tree * v_trees;
    else
      v_pricing := 'unavailable';
    end if;
  end if;

  if v_pricing = 'ok' and p_payment_mode = 'installments' and v_trees is not null then
    if p_down_percent_option_id is null or p_duration_option_id is null then
      v_status := 'incomplete';
    else
      -- Plan P1-2: only a percentage this project offers
      select * into v_percent from app.project_down_percent_items(v_pj.id) o where o.id = p_down_percent_option_id;
      v_duration := app.active_option('duration', p_duration_option_id::text);
      v_down     := app.down_payment_from_percent(v_total, v_percent.min_number, v_pj.id);
      if v_percent.id is null or v_duration.id is null or v_down is null or v_duration.min_number is null then
        v_status := 'invalid_choice';
      else
        v_quote  := app.financed_quote(v_total, v_down, v_duration.min_number::integer, v_pj.id);
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
    if v_breakdown then
      v_inst := v_inst || jsonb_build_object('markup_bp', case when v_ok then (v_quote->>'markup_bp')::integer end);
    end if;
  end if;

  -- What a page offers for this project: its active classes (with their price when the caller may see prices), its
  -- percentages, and the durations that have a markup within the months cap.
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
    'down_percents', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar, 'label_fr', o.label_fr, 'percent', o.min_number)
             order by o.min_number, o.sort_order)
      from app.project_down_percent_items(v_pj.id) o), '[]'::jsonb),
    'durations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar, 'label_fr', o.label_fr,
                                          'months', o.min_number::integer)
             order by o.min_number, o.sort_order)
      from public.option_items o
      where o.list_key = 'duration' and o.is_active
        and o.min_number between 1 and app.setting_int('pricing.max_months', 84)
        and exists (select 1 from public.financing_markups m
                    where m.months = o.min_number and (m.project_id is null or m.project_id = v_pj.id))), '[]'::jsonb))
  into v_choices;

  return jsonb_build_object(
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'on_tree_pricing', v_spacing <> 'legacy',
    'spacing_status', case when v_spacing <> 'legacy' then v_spacing end,
    'spacing_class_id', v_class.id,
    'label_ar', v_class.label_ar,
    'label_fr', v_class.label_fr,
    'row_spacing_m', v_class.row_spacing_m,
    'tree_spacing_m', v_class.tree_spacing_m,
    'area_per_tree_m2', v_class.area_m2,
    'trees', v_trees,
    'trees_max', v_max,
    'total_area_m2', v_class.area_m2 * v_trees,
    'pricing', v_pricing,
    'price_per_tree_millimes', case when v_pricing = 'ok' then v_per_tree end,
    'total_price_millimes', case when v_pricing = 'ok' then v_total end,
    -- Paid every year for the trees chosen, never inside the price above (0045).
    'annual_fee_per_tree_millimes', case when v_pricing = 'ok' then v_annual end,
    'annual_fee_total_millimes', case when v_pricing = 'ok' then v_annual * v_trees end,
    'installments', v_inst,
    'choices', v_choices
  ) || case when v_breakdown then jsonb_build_object('price', v_price) else '{}'::jsonb end;
end $$;
