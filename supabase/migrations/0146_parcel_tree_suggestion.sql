-- 0146 · which card answers for a parcel: the one that describes it, not the one that merely contains it.
--
-- Its test is supabase/tests/093_parcel_tree_suggestion.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0146_parcel_tree_suggestion.sql supabase/tests/093_parcel_tree_suggestion.sql
--
-- app.parcel_offer_payload picks the tree-count card a parcel's own count falls into, so that a reader who
-- walks from the home chooser into an offer finds the same card already chosen. It picked it with
-- «order by oi.min_number limit 1» — the LOWEST floor — which was right only as long as the open-ended card
-- sat above every exact one. 0145 moved it from «أكثر من 500» to «أكثر من 50», and that assumption died:
--
--   · a parcel of exactly 50 olive trees matched «50 زيتونة» and «أكثر من 50» at the same floor of 50, and
--     the winner was whichever row came back first — not a wrong answer every time, which is worse;
--   · and should the owner ever put a 100 card back, every parcel over fifty would still answer «أكثر من 50»,
--     because fifty is a smaller number than a hundred.
--
-- Ordering by the WIDTH of the band first says what was meant all along: the card that describes the parcel
-- wins, and an open-ended card is the fallback for a count no exact card claims. Nothing else in the
-- function changes — this is its live definition with that one ORDER BY rewritten.

CREATE OR REPLACE FUNCTION app.parcel_offer_payload(p_parcel uuid, p_down_option uuid, p_installment_option uuid, p_force_price boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pa        public.parcels;
  v_pj        public.projects;
  v_offered   boolean;
  v_priced    boolean;
  v_pricing   jsonb;
  v_max       integer;
  v_downs     jsonb;
  v_insts     jsonb;
  v_plans     jsonb := '[]'::jsonb;
  v_examples  jsonb := '[]'::jsonb;
  v_entry     jsonb;
  v_chosen    jsonb;
  v_d         public.option_items;
  v_i         public.option_items;
  v_tree      uuid;
  v_scen      uuid;
  v_scen_n    integer;
begin
  if p_parcel is null then
    return null;
  end if;
  select * into v_pa from public.parcels where id = p_parcel;
  if not found then
    return null;
  end if;
  select * into v_pj from public.projects where id = v_pa.project_id;

  v_offered := app.parcel_offered(v_pj.status, v_pa.status);
  v_priced  := (v_offered or coalesce(p_force_price, false)) and v_pa.cash_price_millimes > 0;
  v_pricing := app.parcel_pricing(p_parcel);
  v_max     := greatest(1, least(5, app.setting_int('projects.installment_examples', 3)));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'code', o.code, 'label_ar', o.label_ar, 'min_millimes', o.min_millimes
         ) order by o.min_millimes, o.sort_order), '[]'::jsonb)
  into v_downs
  from (
    select oi.id, oi.code, oi.label_ar, oi.min_millimes, oi.sort_order
    from public.option_items oi
    where oi.list_key = 'down_payment' and oi.is_active and oi.min_millimes is not null
    order by oi.min_millimes, oi.sort_order
    limit 10
  ) o;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'code', o.code, 'label_ar', o.label_ar, 'min_millimes', o.min_millimes
         ) order by o.min_millimes, o.sort_order), '[]'::jsonb)
  into v_insts
  from (
    select oi.id, oi.code, oi.label_ar, oi.min_millimes, oi.sort_order
    from public.option_items oi
    where oi.list_key = 'monthly_installment' and oi.is_active and oi.min_millimes is not null
    order by oi.min_millimes, oi.sort_order
    limit 10
  ) o;

  if v_priced then
    -- Full down × installment matrix; every element strips the pricing parameters.
    select coalesce(jsonb_agg(x.plan order by x.down_millimes, x.installment_millimes), '[]'::jsonb)
    into v_plans
    from (
      select d.min_millimes as down_millimes,
             i.min_millimes as installment_millimes,
             (public.compute_installment_plan(v_pa.cash_price_millimes, d.min_millimes, i.min_millimes, v_pricing)
                - 'model' - 'markup_pct' - 'max_months')
             || jsonb_build_object(
                  'down_option_id', d.id, 'installment_option_id', i.id,
                  'down_millimes', d.min_millimes, 'installment_millimes', i.min_millimes
                ) as plan
      from jsonb_to_recordset(v_downs) as d(id uuid, min_millimes bigint)
      cross join jsonb_to_recordset(v_insts) as i(id uuid, min_millimes bigint)
    ) x;

    -- Worked examples: the smallest down payment, installments ascending, ok plans only.
    select coalesce(jsonb_agg(s.e order by (s.e->>'installment_millimes')::bigint), '[]'::jsonb)
    into v_examples
    from (
      select e
      from jsonb_array_elements(v_plans) e
      where (e->>'ok')::boolean
        and (e->>'down_option_id')::uuid = (v_downs->0->>'id')::uuid
      order by (e->>'installment_millimes')::bigint
      limit v_max
    ) s;

    v_entry := v_examples->0;
  end if;

  -- The visitor's own choice (option ids only, never free amounts) with SIM-05 nearest hints.
  if p_down_option is not null or p_installment_option is not null then
    v_d := app.active_option('down_payment', p_down_option::text);
    v_i := app.active_option('monthly_installment', p_installment_option::text);
    if v_d.id is null or v_i.id is null then
      raise exception 'invalid_choice' using errcode = 'P0001';
    end if;
    if v_priced then
      select e into v_chosen
      from jsonb_array_elements(v_plans) e
      where (e->>'down_option_id')::uuid = v_d.id
        and (e->>'installment_option_id')::uuid = v_i.id
      limit 1;
      v_chosen := coalesce(v_chosen, jsonb_build_object(
                    'ok', false, 'reason', 'invalid_input',
                    'down_option_id', v_d.id, 'installment_option_id', v_i.id,
                    'down_millimes', v_d.min_millimes, 'installment_millimes', v_i.min_millimes))
                  || jsonb_build_object(
                    'nearest_installment_option_id', (
                      select (e->>'installment_option_id')::uuid
                      from jsonb_array_elements(v_plans) e
                      where (e->>'ok')::boolean and (e->>'down_option_id')::uuid = v_d.id
                      order by (e->>'installment_millimes')::bigint
                      limit 1),
                    'nearest_down_option_id', (
                      select (e->>'down_option_id')::uuid
                      from jsonb_array_elements(v_plans) e
                      where (e->>'ok')::boolean and (e->>'installment_option_id')::uuid = v_i.id
                      order by (e->>'down_millimes')::bigint
                      limit 1));
    end if;
  end if;

  -- Continuity with the home chooser: the parcel's own tree count (never derived from area, PARC-02).
  if v_pa.property_type <> 'bare_land' then
    select oi.id into v_tree
    from public.option_items oi
    where oi.list_key = 'tree_count' and oi.is_active and oi.min_number is not null
      and coalesce(v_pa.olive_tree_count, 0) between oi.min_number and coalesce(oi.max_number, 2147483647)
    -- The NARROWEST band that holds the count, not the one with the lowest floor. An open-ended card holds
    -- every parcel above its floor, so ordering by the floor alone lets «أكثر من 50» answer for a parcel
    -- that an exact card describes — and at exactly fifty «50 زيتونة» and «أكثر من 50» share a floor, so the
    -- winner was whichever row the planner handed back first. sort_order settles anything still tied.
    order by coalesce(oi.max_number, 2147483647) - oi.min_number, oi.min_number, oi.sort_order
    limit 1;
  end if;

  select count(*), min(s.id::text)::uuid into v_scen_n, v_scen
  from public.ownership_scenarios s
  where s.is_active and not s.is_any
    and (s.project_type_id is null or s.project_type_id = v_pj.project_type_id)
    and (s.plantation_system is null or s.plantation_system = v_pa.plantation_system)
    and (s.production_status is null or s.production_status = v_pa.production_status)
    and (s.project_type_id is not null or s.plantation_system is not null or s.production_status is not null);
  if v_scen_n <> 1 then
    v_scen := null;
  end if;

  return jsonb_build_object(
    'parcel_id', v_pa.id,
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'project_name', v_pj.name,
    'parcel_code', v_pa.code,
    'parcel_status', v_pa.status,
    'project_status', v_pj.status,
    'offered', v_offered,
    'priced', v_priced,
    'cash_price_millimes', case when v_priced then v_pa.cash_price_millimes end,
    'annual_costs_millimes', case when v_offered or coalesce(p_force_price, false) then v_pa.annual_costs_millimes end,
    'down_from_millimes', case when v_priced then (v_downs->0->>'min_millimes')::bigint end,
    'down_options', v_downs,
    'installment_options', v_insts,
    'plans', v_plans,
    'examples', v_examples,
    'examples_max', v_max,
    'entry', v_entry,
    'chosen', v_chosen,
    'suggested_tree_count_option_id', v_tree,
    'suggested_scenario_id', v_scen
  );
end $function$;
