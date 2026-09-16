-- The markup applies to what is financed, not to the whole price (owner, 2026-09-16).
--
-- Until now: total financed = cash × (1 + markup), and the down payment was subtracted afterwards. A client paying
-- 10 %, 20 % or 40 % down therefore carried exactly the same markup in dinars, which is not how a credit works.
-- The owner: «الحاجة هذي تتكلف مثلا 50 مليون، شيدفع 10% خمسة مليون، خذوا الخمسة وأربعين plus le pourcentage».
--   remaining      = (cash − down) × (1 + markup of the chosen duration)
--   total financed = down + remaining
-- So the down payment is always paid at the cash price and only the financed part carries the markup: the bigger the
-- down payment, the smaller the markup in dinars.
--
-- Unchanged: the down payment is a percentage of the cash price (plan Q-2), the monthly amount is rounded up with a
-- smaller last installment (N-4 B), a duration without a markup is not priced, and the formula never leaves Postgres.
-- Same signature and same keys, so public_tree_quote (0031), submit_interest_request (0032) and
-- public/staff_project_quote (0034) keep calling it unchanged.

create or replace function app.financed_quote(
  p_cash_total_millimes bigint, p_down_millimes bigint, p_months integer, p_project uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_bp        integer;
  v_price_r   bigint;
  v_monthly_r bigint;
  v_base      bigint;
  v_total     bigint;
  v_remaining bigint;
  v_monthly   bigint;
  v_count     integer;
begin
  if p_cash_total_millimes is null or p_cash_total_millimes <= 0
     or p_down_millimes is null or p_down_millimes < 0
     or p_months is null or p_months < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;
  if p_months > app.setting_int('pricing.max_months', 84) then
    return jsonb_build_object('ok', false, 'reason', 'too_many_months');
  end if;

  select m.markup_bp into v_bp
  from public.financing_markups m
  where m.months = p_months and (m.project_id is null or m.project_id = p_project)
  order by (m.project_id is null)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'duration_not_priced');
  end if;

  select coalesce(pr.price_rounding_millimes, g.price_rounding_millimes),
         coalesce(pr.monthly_rounding_millimes, g.monthly_rounding_millimes)
  into v_price_r, v_monthly_r
  from public.tree_pricing_rules g
  left join public.tree_pricing_rules pr on pr.project_id = p_project
  where g.project_id is null;
  v_price_r   := coalesce(v_price_r, 1);
  v_monthly_r := coalesce(v_monthly_r, 1);

  -- The down payment is paid at the cash price, so it can never be more than that price.
  if p_down_millimes >= p_cash_total_millimes then
    return jsonb_build_object('ok', false, 'reason', 'down_covers_total',
                              'total_financed_millimes', p_cash_total_millimes);
  end if;

  v_base      := p_cash_total_millimes - p_down_millimes;
  v_remaining := (ceil(v_base::numeric * (10000 + v_bp) / 10000 / v_price_r) * v_price_r)::bigint;
  v_total     := p_down_millimes + v_remaining;
  -- Rounded up so no installment is below the exact share; the last one absorbs the difference (owner choice).
  v_monthly   := (ceil(v_remaining::numeric / p_months / v_monthly_r) * v_monthly_r)::bigint;
  v_count     := ceil(v_remaining::numeric / v_monthly)::integer;

  return jsonb_build_object(
    'ok', true,
    'markup_bp', v_bp,
    'total_financed_millimes', v_total,
    'down_payment_millimes', p_down_millimes,
    'months', p_months,
    'remaining_millimes', v_remaining,
    'monthly_millimes', v_monthly,
    'last_installment_millimes', v_remaining - v_monthly * (v_count - 1),
    'installments_count', v_count,
    'shortened', v_count < p_months
  );
end $$;
revoke execute on function app.financed_quote(bigint, bigint, integer, uuid) from public, anon, authenticated;

comment on function app.financed_quote(bigint, bigint, integer, uuid) is
  'Report v3 §12 / owner 2026-09-16: the down payment is paid at the cash price and the markup of the chosen duration applies to the remaining part only. remaining = (cash − down) × (1 + markup); total financed = down + remaining; the monthly amount is rounded up and the last installment absorbs the difference.';
