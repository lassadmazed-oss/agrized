-- 0153 · the arithmetic of «احسب مردودية مشروعك», in one place, where it can be tested.
--
-- Its test is supabase/tests/100_study_engine.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0153_study_engine.sql supabase/tests/100_study_engine.sql
--
-- 0152 put every commercial number in the Back Office. This turns them into a year-by-year cash flow and the
-- six figures §4 asks for. One engine, in SQL, for the reason §10 ends on — «جميع الحسابات والنتائج قابلة
-- للاختبار والمراجعة». Arithmetic in a React component is arithmetic nobody can run a test against.
--
-- ---------------------------------------------------------------------------------------------------------
-- THE THREE THINGS §7 SAYS NOT TO DO, AND WHAT IS DONE INSTEAD
-- ---------------------------------------------------------------------------------------------------------
--
-- 1 · «مدّة استرجاع الاستثمار تتحسب من التدفقات النقدية المتراكمة، موش بضرب نسبة ثابتة على عدد السنوات».
--     So there is a row per year, each with its own yield, its own prices and its own charges, a running
--     cumulative beside it, and the payback year is simply THE FIRST YEAR THE CUMULATIVE TURNS POSITIVE.
--     Nothing is divided by an average. A study whose production rises as the trees age cannot be answered
--     by a ratio, and answering it with one is how a simulator promises four years and delivers nine.
--
-- 2 · «التقسيط والتمويل يلزم يتحسبوا بجدول تدفقات نقدية صحيح، من غير احتساب ثمن الزيتونات مرتين». The price
--     of the trees is NOT a charge. It is money leaving the client's hand on a schedule: all of it at
--     signature when he pays cash, or the down payment at signature and the monthly instalments across the
--     years of the plan. It appears once, in `finance_out`, and never again in `charges` — which hold the
--     agricultural year and nothing else.
--
-- 3 · «قيمة إعادة البيع لا تدخل إلا كفرضية اختيارية ومعلنة». study.resale_enabled ships off (0152), and
--     while it is off no study credits a client with the value of trees he has not sold.
--
-- ---------------------------------------------------------------------------------------------------------
-- WHAT «INVESTED» MEANS HERE, because §7 divides by it twice and the word is ambiguous under instalments
-- ---------------------------------------------------------------------------------------------------------
-- For a cash buyer it is the price of the trees, which is uncontroversial. For an instalment buyer the
-- honest denominator is every dinar he will have handed over by the end of the horizon — the down payment
-- plus the instalments that fall inside it — because that is what the project costs HIM, financing and all.
-- Dividing by the down payment alone would print a magnificent «rendement» for a client who has paid 10% of
-- the price and still owes the rest, which is the most flattering lie this screen could tell.
--
-- ---------------------------------------------------------------------------------------------------------
-- IT REFUSES RATHER THAN GUESSES
-- ---------------------------------------------------------------------------------------------------------
-- §10: «إذا بيانات العرض ناقصة، السيستام يوضح النقص ولا يعطي نتائج مضلّلة». Four things can be missing — the
-- offer's price, the age of its trees, a yield band covering that age, and a selling price — and each comes
-- back by name in `missing` with status «incomplete» and NO figures at all. Not zeros: a study reading
-- «0 د.ت ربح» is a conclusion, and the screen would print it as one.

-- The seeded «معاليم المتابعة» line goes. The offer already carries that fee — projects.annual_fee, which
-- the quote publishes as annual_fee_per_tree_millimes and which the client is actually billed — so a second
-- line for it in study_charges would charge him twice for the same thing. The engine reads the offer's own.
delete from public.study_charges where project_id is null and code = 'follow_up';

create or replace function app.study_payload(
  p_project   uuid,
  p_trees     integer,
  p_years     integer,
  p_scenario  text,
  p_mode      text,     -- 'olives' (sell the fruit) or 'oil' (press it first)
  p_payment   text,     -- null, 'cash' or 'installments'
  p_down      uuid,
  p_duration  uuid
) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_pj        public.projects;
  v_st        public.project_study;
  v_sc        public.study_scenarios;
  v_quote     jsonb;
  v_missing   text[] := '{}';
  v_trees     integer;
  v_years     integer;
  v_mode      text;
  v_age       integer;
  v_unit      bigint;
  v_total     bigint;
  v_fee_tree  bigint;
  v_olive     bigint;
  v_oil       bigint;
  v_oil_bp    integer;
  v_growth    integer;
  v_inst      jsonb;
  v_down      bigint := 0;
  v_monthly   bigint := 0;
  v_months    integer := 0;
  v_rows      jsonb := '[]'::jsonb;
  v_y         integer;
  v_kg_tree   numeric;
  v_kg        numeric;
  v_litres    numeric;
  v_price     numeric;
  v_revenue   bigint;
  v_charges   bigint;
  v_finance   bigint;
  v_net       bigint;
  v_cum       bigint := 0;
  v_payback   integer := null;
  v_invested  bigint := 0;
  v_rev_sum   bigint := 0;
  v_chg_sum   bigint := 0;
begin
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    return null;
  end if;
  select * into v_st from public.project_study s where s.project_id = p_project;

  if not coalesce(v_st.is_enabled, app.setting_bool('study.enabled_default', true)) then
    return jsonb_build_object('status', 'closed', 'project_id', p_project);
  end if;

  -- ── the shape of the question ───────────────────────────────────────────────────────────────────────
  v_trees := greatest(coalesce(p_trees, 1), app.setting_int('study.min_trees', 1));
  v_years := greatest(coalesce(p_years, 10), 1);
  v_mode  := case when p_mode = 'oil' then 'oil' else 'olives' end;

  select * into v_sc from public.study_scenarios s
   where s.is_active and (s.code = p_scenario or (p_scenario is null and s.is_reference))
   order by (s.code = p_scenario) desc, s.is_reference desc, s.sort_order
   limit 1;
  if v_sc.id is null then
    select * into v_sc from public.study_scenarios s where s.is_active order by s.sort_order limit 1;
  end if;

  -- ── what the trees cost, from the one function that prices anything ─────────────────────────────────
  v_quote := app.project_quote_payload(p_project, null, v_trees, p_payment, p_down, p_duration, true);
  if (v_quote->>'pricing') = 'ok' then
    v_unit     := (v_quote->>'price_per_tree_millimes')::bigint;
    v_total    := (v_quote->>'total_price_millimes')::bigint;
    v_fee_tree := coalesce((v_quote->>'annual_fee_per_tree_millimes')::bigint, 0);
    v_inst     := v_quote->'installments';
  else
    v_missing := v_missing || 'offer_price'::text;
  end if;

  -- ── the age of the trees, and the band that covers it ───────────────────────────────────────────────
  v_age := coalesce(v_st.tree_age_years, v_pj.tree_age_years);
  if v_age is null then
    v_missing := v_missing || 'tree_age'::text;
  elsif not exists (
    select 1 from public.study_yield_bands b
     where b.is_active and coalesce(b.project_id, p_project) = p_project
       and v_age between b.age_from and coalesce(b.age_to, 2147483647)
  ) then
    v_missing := v_missing || 'yield_band'::text;
  end if;

  -- ── the prices, the offer's own first ───────────────────────────────────────────────────────────────
  v_olive  := coalesce(v_st.olive_price_millimes_per_kg,  app.setting_int('study.olive_price_millimes_per_kg', 0));
  v_oil    := coalesce(v_st.oil_price_millimes_per_litre, app.setting_int('study.oil_price_millimes_per_litre', 0));
  v_oil_bp := coalesce(v_st.oil_yield_bp,                 app.setting_int('study.oil_yield_bp', 0));
  v_growth := coalesce(v_st.price_growth_bp,              app.setting_int('study.price_growth_bp', 0));

  if v_mode = 'oil' and (v_oil <= 0 or v_oil_bp <= 0) then
    v_missing := v_missing || 'oil_price'::text;
  elsif v_mode = 'olives' and v_olive <= 0 then
    v_missing := v_missing || 'olive_price'::text;
  end if;

  if array_length(v_missing, 1) > 0 then
    -- NO FIGURES AT ALL. §10: the system says what is missing and gives no misleading result.
    return jsonb_build_object(
      'status', 'incomplete',
      'missing', to_jsonb(v_missing),
      'project_id', p_project,
      'project_code', v_pj.code,
      'legal_note', app.setting_text('study.legal_note', ''));
  end if;

  -- ── the money that leaves his hand, once ────────────────────────────────────────────────────────────
  if p_payment = 'installments' and (v_inst->>'status') = 'ok' then
    v_down    := coalesce((v_inst->>'down_payment_millimes')::bigint, 0);
    v_monthly := coalesce((v_inst->>'monthly_millimes')::bigint, 0);
    v_months  := coalesce((v_inst->>'duration_months')::integer, 0);
  else
    v_down    := v_total;   -- cash: all of it at signature, and nothing after
    v_monthly := 0;
    v_months  := 0;
  end if;

  -- Year 0 is the signature: no season, no charges, only what he puts down.
  v_cum      := -v_down;
  v_invested := v_down;
  v_rows := v_rows || jsonb_build_object(
    'year', 0, 'age', v_age, 'kg_per_tree', 0, 'kg_total', 0, 'litres', 0,
    'revenue_millimes', 0, 'charges_millimes', 0, 'finance_millimes', v_down,
    'net_millimes', -v_down, 'cumulative_millimes', v_cum);

  for v_y in 1..v_years loop
    -- Production: the band for the age the trees HAVE REACHED, moved by the scenario. An age past the last
    -- band keeps the open-ended one, which is why 0152 leaves its top open.
    select b.kg_per_tree into v_kg_tree
      from public.study_yield_bands b
     where b.is_active and coalesce(b.project_id, p_project) = p_project
       and (v_age + v_y) between b.age_from and coalesce(b.age_to, 2147483647)
     order by (b.project_id is not null) desc, b.age_from desc
     limit 1;
    v_kg_tree := coalesce(v_kg_tree, 0) * v_sc.yield_factor_bp / 10000.0;
    v_kg      := v_kg_tree * v_trees;
    v_litres  := case when v_mode = 'oil' then v_kg * v_oil_bp / 10000.0 else 0 end;

    -- Prices: the scenario's factor, then the yearly drift compounded from the first season.
    v_price := (case when v_mode = 'oil' then v_oil else v_olive end)
               * v_sc.price_factor_bp / 10000.0
               * power(1 + v_growth / 10000.0, v_y - 1);
    v_revenue := round(case when v_mode = 'oil' then v_litres else v_kg end * v_price)::bigint;

    -- Charges: the offer's own annual fee, plus the Back Office's lines for a year this one applies to.
    select coalesce(sum(
             (c.per_tree_millimes * v_trees + c.per_year_millimes)
           ), 0)::bigint into v_charges
      from public.study_charges c
     where c.is_active
       and coalesce(c.project_id, p_project) = p_project
       and (not c.oil_only or v_mode = 'oil')
       and v_y >= c.from_year
       and ((v_y - c.from_year) % c.every_years) = 0;
    v_charges := round((v_charges + v_fee_tree * v_trees) * v_sc.charge_factor_bp / 10000.0)::bigint;

    -- The instalments that fall in this year — the price of the trees, arriving on its schedule and never
    -- a second time.
    v_finance := v_monthly * greatest(least(v_months - (v_y - 1) * 12, 12), 0);
    v_invested := v_invested + v_finance;

    v_net := v_revenue - v_charges - v_finance;
    v_cum := v_cum + v_net;
    v_rev_sum := v_rev_sum + v_revenue;
    v_chg_sum := v_chg_sum + v_charges;
    if v_payback is null and v_cum >= 0 then
      v_payback := v_y;
    end if;

    v_rows := v_rows || jsonb_build_object(
      'year', v_y, 'age', v_age + v_y,
      'kg_per_tree', round(v_kg_tree, 2), 'kg_total', round(v_kg, 2), 'litres', round(v_litres, 2),
      'revenue_millimes', v_revenue, 'charges_millimes', v_charges, 'finance_millimes', v_finance,
      'net_millimes', v_net, 'cumulative_millimes', v_cum);
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'project_id', p_project,
    'project_code', v_pj.code,
    'project_name', v_pj.name,
    'trees', v_trees,
    'tree_age_years', v_age,
    'years', v_years,
    'mode', v_mode,
    'scenario', jsonb_build_object(
      'code', v_sc.code, 'label_ar', v_sc.label_ar,
      'yield_factor_bp', v_sc.yield_factor_bp, 'price_factor_bp', v_sc.price_factor_bp,
      'charge_factor_bp', v_sc.charge_factor_bp),
    'investment', jsonb_build_object(
      'price_per_tree_millimes', v_unit,
      'total_price_millimes', v_total,
      'payment_mode', case when v_monthly > 0 then 'installments' else 'cash' end,
      'down_payment_millimes', v_down,
      'monthly_millimes', v_monthly,
      'duration_months', v_months,
      -- Everything he will have handed over by the end of the horizon. See the header on why this, and not
      -- the down payment, is what the percentages below are divided by.
      'invested_millimes', v_invested),
    'rows', v_rows,
    'totals', jsonb_build_object(
      'revenue_millimes', v_rev_sum,
      'charges_millimes', v_chg_sum,
      'net_millimes', v_rev_sum - v_chg_sum,
      'cumulative_millimes', v_cum,
      'payback_year', v_payback,
      'roi_bp', case when v_invested > 0 then round(v_cum * 10000.0 / v_invested)::integer end,
      'yearly_bp', case when v_invested > 0 and v_years > 0
                        then round((v_rev_sum - v_chg_sum) * 10000.0 / v_invested / v_years)::integer end),
    'resale_counted', false,
    'legal_note', app.setting_text('study.legal_note', ''));
end $fn$;

-- The workings are the company's. A visitor reaches the RESULTS through the public door in a later batch,
-- never this function: it reads yields, charges and the offer's margin basis, and §10 keeps those inside.
revoke execute on function app.study_payload(uuid, integer, integer, text, text, text, uuid, uuid)
  from public, anon, authenticated;

comment on function app.study_payload(uuid, integer, integer, text, text, text, uuid, uuid) is
  'One year-by-year cash flow for «احسب مردودية مشروعك» (0152 holds every figure it reads). The price of the trees is money leaving on a schedule and never a charge, so it is counted once; the payback year is the first year the cumulative flow turns positive and is never derived from an average; resale is not counted while study.resale_enabled is off. Missing data returns status «incomplete» naming what is missing, and no figures at all.';
