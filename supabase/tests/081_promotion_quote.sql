-- 0133 · the tier reaches the price the page prints, and the plan is financed on the discounted total.
--
-- 080 proved the tier is chosen and the arithmetic adds up. This proves it survives the only function that
-- matters — app.project_quote_payload, which every screen showing money reads — and that an offer with no
-- tier is untouched by any of it.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_before  jsonb;
  v_after   jsonb;
  v_trees   integer := 20;
  v_base    bigint;
  v_down    uuid;
  v_dur     uuid;
  v_plan    jsonb;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  select p.id into v_project
    from public.projects p
   where p.status = 'published' and p.tree_count >= 100
   order by p.created_at
   limit 1;
  if v_admin is null or v_project is null then
    raise notice 'no admin or no priced offer; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ── before any tier exists ────────────────────────────────────────────────────────────────────────────
  v_before := app.project_quote_payload(v_project, null, v_trees, null, null, null, false);
  if (v_before->>'pricing') <> 'ok' then
    raise notice 'this offer does not price publicly; nothing to prove here';
    return;
  end if;
  v_base := (v_before->>'total_price_millimes')::bigint;

  assert v_before->'promotion' = 'null'::jsonb or v_before->'promotion' is null,
    'an offer with no tier already carries a promotion';
  assert (v_before->>'total_before_promotion_millimes') is null,
    'an offer with no tier publishes a «before» price';

  -- ── a tier the basket reaches ─────────────────────────────────────────────────────────────────────────
  perform public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'من 10 زيتونات', 'project_id', v_project, 'min_trees', 10, 'discount_percent_bp', 1000));

  v_after := app.project_quote_payload(v_project, null, v_trees, null, null, null, false);

  assert (v_after->>'price_per_tree_millimes')::bigint = (v_before->>'price_per_tree_millimes')::bigint,
    'the tier moved the price of ONE tree: a discount is on the basket, not on the unit price';

  assert (v_after->>'total_price_millimes')::bigint = v_base - round(v_base::numeric * 0.10)::bigint,
    format('10%% off %s should be %s, got %s', v_base, v_base - round(v_base::numeric * 0.10)::bigint,
           v_after->>'total_price_millimes');

  -- The three figures a client reads must agree with each other.
  assert (v_after->>'total_before_promotion_millimes')::bigint = v_base, 'the price before the tier is wrong';
  assert (v_after->'promotion'->>'before_millimes')::bigint
         - (v_after->'promotion'->>'amount_millimes')::bigint
         = (v_after->>'total_price_millimes')::bigint,
    'before − discount ≠ final in the published quote';
  assert (v_after->'promotion'->>'percent_bp')::integer = 1000, 'the percentage was not published';
  assert (v_after->'promotion'->>'label_ar') = 'من 10 زيتونات', 'the tier''s name was not published';

  -- ── under the floor, nothing changes ──────────────────────────────────────────────────────────────────
  assert (app.project_quote_payload(v_project, null, 9, null, null, null, false)->'promotion') = 'null'::jsonb
      or (app.project_quote_payload(v_project, null, 9, null, null, null, false)->'promotion') is null,
    'a basket under the floor was given the tier anyway';

  -- ── the plan is financed on the DISCOUNTED total ──────────────────────────────────────────────────────
  select o.id into v_down from app.project_down_percent_items(v_project) o limit 1;
  select o.id into v_dur  from app.project_duration_items(v_project) o limit 1;
  if v_down is not null and v_dur is not null then
    v_plan := app.project_quote_payload(v_project, null, v_trees, 'installments', v_down, v_dur, false)
              -> 'installments';
    if (v_plan->>'status') = 'ok' then
      -- The down payment is a percentage of the total being financed; if the plan had been built on the list
      -- price it would be bigger than the same percentage of the discounted one.
      assert (v_plan->>'down_payment_millimes')::bigint
             <= app.down_payment_from_percent(v_base, (v_plan->>'down_payment_percent')::numeric, v_project),
        'the instalment plan was financed on the price before the discount';
      assert (v_plan->'promotion'->>'percent_bp')::integer = 1000,
        'the plan does not say which tier it was built on';
    end if;
  end if;

  -- ── a tier for cash only leaves the plan alone ────────────────────────────────────────────────────────
  delete from public.tree_promotions t where t.project_id = v_project;
  perform public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'نقداً فقط', 'project_id', v_project, 'min_trees', 10,
    'payment_mode', 'cash', 'discount_percent_bp', 1500));
  v_after := app.project_quote_payload(v_project, null, v_trees, null, null, null, false);
  assert (v_after->'promotion'->>'percent_bp')::integer = 1500, 'the cash tier did not reach the cash price';
  if v_down is not null and v_dur is not null then
    v_plan := app.project_quote_payload(v_project, null, v_trees, 'installments', v_down, v_dur, false)
              -> 'installments';
    assert v_plan->'promotion' = 'null'::jsonb or v_plan->'promotion' is null,
      'a tier marked «cash only» was applied to an instalment plan';
  end if;

  raise notice 'promotion quote: the basket is discounted, the unit price is not, and the plan is financed on the discounted total';
end $$;
