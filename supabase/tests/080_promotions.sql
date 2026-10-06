-- 0132 · quantity promotions: which tier a basket falls in, and what it does to a total.
--
-- The arithmetic matters more than usual here because the owner asked for FOUR figures to be shown to the
-- client — before, percent, amount, after — and a client who subtracts the two he can see must not get a
-- third. So «before − amount = after» is asserted on every shape, not just computed.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_other   uuid;
  v_promo   public.tree_promotions;
  v_out     jsonb;
  v_ten     uuid;
  v_hundred uuid;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select p.id into v_project from public.projects p order by p.created_at limit 1;
  select p.id into v_other   from public.projects p where p.id <> v_project order by p.created_at limit 1;
  if v_project is null then
    raise notice 'no offer to hang a promotion on; nothing to prove here';
    return;
  end if;

  -- ── the ladder the owner described: 10 → 10%, 25 → 15%, 100 → 20% ──────────────────────────────────────
  v_promo := public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'من 10 زيتونات', 'min_trees', 10, 'discount_percent_bp', 1000));
  v_ten := v_promo.id;
  perform public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'من 25 زيتونة', 'min_trees', 25, 'discount_percent_bp', 1500));
  v_promo := public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'من 100 زيتونة', 'min_trees', 100, 'discount_percent_bp', 2000));
  v_hundred := v_promo.id;

  -- 1 · Under the first floor there is no tier at all.
  assert (app.promotion_for(v_project, 9, 'cash')).id is null, 'nine trees took a tier that starts at ten';

  -- 2 · The highest floor the quantity REACHES wins, not the first and not the last.
  assert (app.promotion_for(v_project, 10,  'cash')).id = v_ten, 'ten trees did not take the ten tier';
  assert (app.promotion_for(v_project, 24,  'cash')).min_trees = 10, 'twenty-four trees skipped past the ten tier';
  assert (app.promotion_for(v_project, 25,  'cash')).min_trees = 25, 'twenty-five trees did not reach the 25 tier';
  assert (app.promotion_for(v_project, 999, 'cash')).id = v_hundred, 'a big basket did not take the top tier';

  -- 3 · The four figures, and «before − amount = after» on a percentage.
  --     20 trees × 5.000 د = 100.000 د, 10% off = 10.000 د, final 90.000 د — the owner's own example.
  v_out := app.apply_promotion(100000, 20, app.promotion_for(v_project, 20, 'cash'));
  assert (v_out->>'total_millimes')::bigint = 90000,
    format('100.000 د less 10%% should be 90.000 د, got %s', v_out->>'total_millimes');
  assert (v_out->'promotion'->>'before_millimes')::bigint = 100000, 'the price before the discount was not published';
  assert (v_out->'promotion'->>'amount_millimes')::bigint = 10000, 'the discount amount was not published';
  assert (v_out->'promotion'->>'before_millimes')::bigint - (v_out->'promotion'->>'amount_millimes')::bigint
         = (v_out->>'total_millimes')::bigint,
    'before − amount ≠ after: the three figures on screen do not agree';

  -- 4 · A special price per tree replaces the computed one, and still reports what it saved.
  perform public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'سعر خاص', 'project_id', v_project, 'min_trees', 50, 'unit_price_millimes', 4000));
  v_out := app.apply_promotion(100000, 20, app.promotion_for(v_project, 50, 'cash'));
  assert (v_out->>'total_millimes')::bigint = 4000 * 20, 'a special unit price did not replace the total';
  assert (v_out->'promotion'->>'before_millimes')::bigint - (v_out->'promotion'->>'amount_millimes')::bigint
         = (v_out->>'total_millimes')::bigint, 'before − amount ≠ after on a special price';

  -- 5 · An offer's own tier beats one that applies to everything, at the same floor.
  perform public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'خاص بهذا العرض', 'project_id', v_project, 'min_trees', 10, 'discount_percent_bp', 3000));
  assert (app.promotion_for(v_project, 10, 'cash')).discount_percent_bp = 3000,
    'the offer''s own tier lost to the one that applies to everything';
  assert (app.promotion_for(v_project, 10, 'cash')).project_id = v_project, 'the wrong tier was chosen';
  if v_other is not null then
    assert (app.promotion_for(v_other, 10, 'cash')).project_id is null,
      'another offer was given a tier that belongs to this one';
  end if;

  -- 6 · The way of paying can carry its own tier (owner: «Cash: 15%, تقسيط: 10%»).
  perform public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'بالتقسيط فقط', 'project_id', v_project, 'min_trees', 200,
    'payment_mode', 'installments', 'discount_percent_bp', 500));
  assert (app.promotion_for(v_project, 200, 'installments')).payment_mode = 'installments',
    'the instalment tier was not chosen for an instalment quote';
  assert coalesce((app.promotion_for(v_project, 200, 'cash')).payment_mode, '') <> 'installments',
    'a cash quote was given a tier marked for instalments';

  -- 7 · Dates and the switch.
  perform public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'انتهى', 'project_id', v_project, 'min_trees', 300, 'discount_percent_bp', 5000,
    'ends_on', to_char((now() at time zone 'Africa/Tunis')::date - 1, 'YYYY-MM-DD')));
  assert coalesce((app.promotion_for(v_project, 300, 'cash')).min_trees, 0) <> 300,
    'a promotion whose last day has passed was still applied';

  v_promo := public.staff_save_promotion(jsonb_build_object(
    'label_ar', 'مطفي', 'project_id', v_project, 'min_trees', 400, 'discount_percent_bp', 5000,
    'is_active', false));
  assert coalesce((app.promotion_for(v_project, 400, 'cash')).min_trees, 0) <> 400,
    'a promotion that is switched off was still applied';

  -- 8 · A row must be a percentage or a price, never both and never neither.
  declare v_ok boolean := true;
  begin
    begin
      perform public.staff_save_promotion(jsonb_build_object('label_ar', 'الزوز', 'min_trees', 5,
        'discount_percent_bp', 1000, 'unit_price_millimes', 4000));
    exception when others then v_ok := false;
    end;
    assert not v_ok, 'a tier with both a percentage and a price was accepted';

    v_ok := true;
    begin
      perform public.staff_save_promotion(jsonb_build_object('label_ar', 'حتّى حاجة', 'min_trees', 5));
    exception when others then v_ok := false;
    end;
    assert not v_ok, 'a tier with neither a percentage nor a price was accepted';
  end;

  -- 9 · Nobody but an administrator writes them, and no visitor reads the ladder at all.
  assert not has_function_privilege('anon', 'public.staff_save_promotion(jsonb)', 'execute'),
    'a visitor can write promotions';
  assert not has_function_privilege('anon', 'public.staff_delete_promotion(uuid, text)', 'execute'),
    'a visitor can delete promotions';
  -- The GRANT and the POLICY are two different doors, and a visitor must be stopped by both: a policy is a
  -- filter on rows, and this schema hands `anon` a blanket SELECT that a loosened policy would walk through.
  assert not has_table_privilege('anon', 'public.tree_promotions', 'select'),
    'a visitor still holds the SELECT grant on the discount ladder';

  -- 10 · Deleting one.
  v_out := public.staff_delete_promotion(v_ten);
  assert (v_out->>'ok')::boolean, 'the delete did not report success';
  assert not exists (select 1 from public.tree_promotions t where t.id = v_ten), 'the tier is still there';

  raise notice 'promotions: tiers chosen by the floor reached, four figures that add up, scope and mode honoured';
end $$;
