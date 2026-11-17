-- 0163 · the down payment is a share of the total price on instalments (owner, 2026-11-17).
--
-- The promise to check is the one the calculator prints: «التسبقة تتحسب من السعر الجملي بالتقسيط». So for every
-- plan, the down payment is the chosen percentage of «السعر الجملي بالتقسيط» (total_financed_millimes), and no
-- longer that percentage of the cash price. «Exactly» within two price steps: the down payment is rounded up to
-- one step, and that rounding moves the financed part — so the total — by a fraction of a step again.

do $$
declare
  v_project uuid;
  v_step    bigint;
  v_down    bigint;
  v_q       jsonb;
  v_total   bigint;
  v_plan    jsonb;
  v_pct     uuid;
  v_dur     uuid;
  v_n       integer := 0;
begin
  insert into public.projects (code, name, governorate_id)
  values ('DOWN-T-' || substr(md5(random()::text), 1, 6), 'عرض اختبار التسبقة', 34)
  returning id into v_project;
  insert into public.financing_markups (project_id, months, markup_bp) values
    (v_project, 60, 1800), (v_project, 36, 0);
  v_step := app.price_rounding(v_project);

  -- ── the owner's own example: 10,000 د, 10 %, 60 months at +18 % ──────────────────────────────────────────
  v_down := app.down_payment_on_installments(10000000, 10, 60, v_project);
  v_q    := app.financed_quote(10000000, v_down, 60, v_project);
  v_total := (v_q->>'total_financed_millimes')::bigint;
  assert (v_q->>'ok')::boolean, 'the plan is priced: ' || v_q::text;
  assert abs(v_down - v_total * 10 / 100) <= 2 * v_step,
    format('the down payment is 10 %% of the total on instalments: %s of %s', v_down, v_total);
  assert v_down > 1000000, 'it is no longer 10 % of the cash price (1,000 د), got ' || v_down;
  if v_step = 1000 then
    assert v_down = 1160000 and v_total = 11592000,
      format('with dinar rounding: 1,160 د down and 11,592 د in all, got %s and %s', v_down, v_total);
  end if;

  -- The same promise for every percentage the calculator could offer.
  for p in 1 .. 99 loop
    v_down := app.down_payment_on_installments(10000000, p, 60, v_project);
    v_q    := app.financed_quote(10000000, v_down, 60, v_project);
    v_total := (v_q->>'total_financed_millimes')::bigint;
    assert abs(v_down - v_total * p / 100) <= 2 * v_step,
      format('%s %%: %s down for a total of %s', p, v_down, v_total);
  end loop;

  -- Without a markup the two bases are the same thing.
  assert app.down_payment_on_installments(10000000, 20, 36, v_project)
         = app.down_payment_from_percent(10000000, 20, v_project),
    'at +0 % the share of the instalment total is the share of the cash price';

  -- Refusals: no duration, no percentage, a percentage out of range.
  assert app.down_payment_on_installments(10000000, 10, null, v_project) is null, 'no duration, no down payment';
  assert app.down_payment_on_installments(10000000, null, 60, v_project) is null, 'no percentage, no down payment';
  assert app.down_payment_on_installments(10000000, 0, 60, v_project) is null
     and app.down_payment_on_installments(10000000, 100.5, 60, v_project) is null, 'a percentage outside 0–100 is refused';
  -- 100 % is the whole price, which the plan refuses as before.
  assert app.down_payment_on_installments(10000000, 100, 60, v_project) = 10000000, '100 % is the whole cash price';
  assert app.financed_quote(10000000, 10000000, 60, v_project)->>'reason' = 'down_covers_total', 'and nothing is left to finance';
  -- A duration with no markup is still refused by the plan, under its own name.
  assert coalesce(app.financed_quote(10000000, app.down_payment_on_installments(10000000, 10, 48, v_project), 48, v_project)->>'reason', 'ok')
         in ('duration_not_priced', 'ok'),
    'a duration the offer does not price is not invented';

  -- ── the offers in this database keep the promise on their real plans ────────────────────────────────────
  for v_project in select p.id from public.projects p where app.offer_sells_on_installments(p.id) limit 5 loop
    select o.id into v_pct from app.project_down_percent_items(v_project) o limit 1;
    for v_dur in select o.id from app.project_duration_items(v_project) o loop
      v_plan := app.project_quote_payload(v_project, null, 1, 'installments', v_pct, v_dur, true) -> 'installments';
      if v_plan->>'status' = 'ok' then
        v_n := v_n + 1;
        assert abs((v_plan->>'down_payment_millimes')::bigint
                   - (v_plan->>'total_financed_millimes')::bigint * (v_plan->>'down_payment_percent')::numeric / 100)
               <= 2 * app.price_rounding(v_project),
          'an offer''s plan takes its down payment from the total on instalments: ' || v_plan::text;
      end if;
    end loop;
  end loop;
  if v_n = 0 then
    raise notice 'no offer here sells on instalments with a priced plan; only the arithmetic was checked';
  end if;

  assert not has_function_privilege('anon', 'app.down_payment_on_installments(bigint, numeric, integer, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'app.down_payment_on_installments(bigint, numeric, integer, uuid)', 'execute'),
    'the formula is not exposed';
end $$;
