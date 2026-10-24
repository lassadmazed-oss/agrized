-- 0153 · the three things §7 forbids, each asserted rather than described, on a study this file owns.
--
-- IT BUILDS ITS OWN OFFER, ITS OWN BANDS AND ITS OWN CHARGES. A study read off the owner's live offers would
-- make every number below a statement about what he last typed into the Back Office, and the arithmetic
-- would be untested the day he changed a price. Rolled back with the rest.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_out     jsonb;
  v_rows    jsonb;
  v_y1      jsonb;
  v_y2      jsonb;
  v_cash    jsonb;
  v_plan    jsonb;
  v_prudent jsonb;
  v_opt     jsonb;
  v_sum     bigint;
  v_i       integer;
  v_fee     bigint;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- AN OFFER THAT ALREADY PRICES, and everything else about the study made up here.
  --
  -- Building a priceable offer from nothing means reproducing whatever app.project_quote_payload needs
  -- today — a spacing class, a pricing basis, the settings behind them — which is a second definition of
  -- «what a sellable offer is» that would go stale the first time pricing changed. The price is the one
  -- input this file does not own, and it does not need to: not one assertion below is about its value.
  -- Everything that IS asserted — the kilos, the revenue, the charges, the schedule — is seeded here.
  select p.id into v_project
    from public.projects p
   where p.status = 'published'
     and (app.project_quote_payload(p.id, null, 10, null, null, null, true) ->> 'pricing') = 'ok'
   order by p.created_at
   limit 1;
  if v_project is null then
    raise notice 'no offer in this database prices publicly; the engine is untested here';
    return;
  end if;
  update public.projects set tree_age_years = 10 where id = v_project;

  -- This offer's own band wins over the default, and it is open at the top so the age never falls off it.
  insert into public.study_yield_bands (project_id, age_from, age_to, kg_per_tree, source_ar)
  values (v_project, 0, null, 50.00, 'اختبار');

  -- One charge, flat and annual, so «charges» is a number this file can predict: 1 د per tree per year.
  delete from public.study_charges where project_id is null;
  insert into public.study_charges (project_id, code, label_ar, per_tree_millimes, per_year_millimes)
  values (v_project, 'test_line', 'خدمة اختبار', 1000, 0);

  -- Prices with no drift and no scenario movement, so year 1 and year 5 must be identical.
  update public.settings set value = to_jsonb(2000)  where key = 'study.olive_price_millimes_per_kg';
  update public.settings set value = to_jsonb(0)     where key = 'study.price_growth_bp';
  update public.settings set value = to_jsonb(false) where key = 'study.resale_enabled';

  insert into public.project_study (project_id, is_enabled, tree_age_years) values (v_project, true, 10)
  on conflict (project_id) do update set is_enabled = true, tree_age_years = 10;

  -- ── 1 · the ordinary cash study ─────────────────────────────────────────────────────────────────────
  v_cash := app.study_payload(v_project, 10, 5, 'central', 'olives', 'cash', null, null);
  assert (v_cash->>'status') = 'ok', format('a complete offer did not price: %s', v_cash->>'missing');
  v_rows := v_cash->'rows';

  -- Year 0 is the signature and nothing else: no season, no charges, and the whole price out.
  v_y1 := v_rows->0;
  assert (v_y1->>'year')::integer = 0, 'the table does not start at the signature';
  assert (v_y1->>'revenue_millimes')::bigint = 0 and (v_y1->>'charges_millimes')::bigint = 0,
    'the signature year invented a season';
  assert (v_y1->>'finance_millimes')::bigint = (v_cash->'investment'->>'total_price_millimes')::bigint,
    'a cash buyer did not pay the whole price at the signature';

  -- 10 trees × 50 kg × 2.000 د = 1 000.000 د of revenue; charges 10 × 1.000 د = 10.000 د.
  v_y2 := v_rows->1;
  assert (v_y2->>'kg_total')::numeric = 500, format('500 kg expected, got %s', v_y2->>'kg_total');
  assert (v_y2->>'revenue_millimes')::bigint = 1000000,
    format('1 000.000 د expected, got %s', v_y2->>'revenue_millimes');
  -- THE OFFER'S OWN ANNUAL FEE IS IN THERE EXACTLY ONCE, beside this file's line and never twice. 0153
  -- deleted the seeded «معاليم المتابعة» for precisely this reason: the offer already bills it, and a
  -- second row for it in study_charges would have charged the client for the same service twice.
  v_fee := coalesce((app.project_quote_payload(v_project, null, 10, null, null, null, true)
                     ->>'annual_fee_per_tree_millimes')::bigint, 0);
  assert (v_y2->>'charges_millimes')::bigint = (1000 + v_fee) * 10,
    format('charges should be (1.000 د + the offer fee %s) × 10 trees, got %s', v_fee, v_y2->>'charges_millimes');

  -- 2 · THE PRICE OF THE TREES IS NOT A CHARGE (§7). If it leaked in, the charges of a season would carry
  --     the purchase and the client would be told the trees cost him money every year.
  for v_i in 1..5 loop
    assert (v_rows->v_i->>'charges_millimes')::bigint < (v_cash->'investment'->>'total_price_millimes')::bigint,
      format('year %s charges look like they contain the purchase', v_i);
    assert (v_rows->v_i->>'finance_millimes')::bigint = 0,
      format('a cash buyer is still paying in year %s', v_i);
  end loop;

  -- 3 · THE CUMULATIVE IS A RUNNING SUM, and every row's net is revenue − charges − finance. A table whose
  --     cumulative is computed any other way is the one that produces a wrong payback year.
  v_sum := 0;
  for v_i in 0..5 loop
    assert (v_rows->v_i->>'net_millimes')::bigint
           = (v_rows->v_i->>'revenue_millimes')::bigint
           - (v_rows->v_i->>'charges_millimes')::bigint
           - (v_rows->v_i->>'finance_millimes')::bigint,
      format('year %s: net ≠ revenue − charges − finance', v_i);
    v_sum := v_sum + (v_rows->v_i->>'net_millimes')::bigint;
    assert (v_rows->v_i->>'cumulative_millimes')::bigint = v_sum,
      format('year %s: the cumulative is not the running sum of the nets', v_i);
  end loop;

  -- 4 · THE PAYBACK YEAR IS THE FIRST YEAR THE CUMULATIVE TURNS POSITIVE (§7: «موش بضرب نسبة ثابتة»).
  --     Asserted against the table itself, so a later edit that reaches for an average is caught here.
  if (v_cash->'totals'->>'payback_year') is not null then
    v_i := (v_cash->'totals'->>'payback_year')::integer;
    assert (v_rows->v_i->>'cumulative_millimes')::bigint >= 0,
      'the payback year is a year whose cumulative is still negative';
    assert v_i = 0 or (v_rows->(v_i - 1)->>'cumulative_millimes')::bigint < 0,
      'an earlier year had already paid back, so this is not the FIRST one';
  end if;

  -- ── 5 · instalments: the price arrives on its schedule, and ONCE ─────────────────────────────────────
  declare
    v_down_id uuid;
    v_dur_id  uuid;
    v_paid    bigint := 0;
  begin
    select o.id into v_down_id from app.project_down_percent_items(v_project) o limit 1;
    select o.id into v_dur_id  from app.project_duration_items(v_project) o limit 1;
    if v_down_id is not null and v_dur_id is not null then
      v_plan := app.study_payload(v_project, 10, 10, 'central', 'olives', 'installments', v_down_id, v_dur_id);
      if (v_plan->>'status') = 'ok' and (v_plan->'investment'->>'monthly_millimes')::bigint > 0 then
        for v_i in 0..10 loop
          v_paid := v_paid + (v_plan->'rows'->v_i->>'finance_millimes')::bigint;
        end loop;
        -- Everything paid across the table is the down payment plus the instalments, and the engine reports
        -- exactly that as «invested». A second copy of the price anywhere would show up here as a gap.
        assert v_paid = (v_plan->'investment'->>'invested_millimes')::bigint,
          format('the schedule paid %s but the study says %s was invested',
                 v_paid, v_plan->'investment'->>'invested_millimes');
        assert v_paid >= (v_plan->'investment'->>'down_payment_millimes')::bigint,
          'the schedule paid less than the down payment';
        -- And the purchase never reached the agricultural charges.
        assert (v_plan->'rows'->1->>'charges_millimes')::bigint
             = (v_cash->'rows'->1->>'charges_millimes')::bigint,
          'paying by instalments changed the cost of farming the trees';
      end if;
    end if;
  end;

  -- ── 6 · the scenarios actually differ, and in the right direction ───────────────────────────────────
  v_prudent := app.study_payload(v_project, 10, 5, 'prudent', 'olives', 'cash', null, null);
  v_opt     := app.study_payload(v_project, 10, 5, 'optimiste', 'olives', 'cash', null, null);
  assert (v_prudent->'totals'->>'revenue_millimes')::bigint < (v_cash->'totals'->>'revenue_millimes')::bigint,
    'the prudent scenario earns as much as the central one';
  assert (v_opt->'totals'->>'revenue_millimes')::bigint > (v_cash->'totals'->>'revenue_millimes')::bigint,
    'the optimistic scenario earns no more than the central one';
  assert (v_prudent->'totals'->>'charges_millimes')::bigint > (v_cash->'totals'->>'charges_millimes')::bigint,
    'the prudent scenario costs no more than the central one';

  -- ── 7 · resale is not counted while it is switched off (§7) ─────────────────────────────────────────
  assert not (v_cash->>'resale_counted')::boolean, 'a study credited a resale nobody asked for';
  assert (v_cash->'totals'->>'cumulative_millimes')::bigint
         = (v_rows->5->>'cumulative_millimes')::bigint,
    'the headline cumulative is not the last row of the table, so something was added after it';

  -- ── 8 · it refuses rather than guesses (§10) ─────────────────────────────────────────────────────────
  -- An age no band covers: the figures must not appear at all, and the gap must be named.
  delete from public.study_yield_bands where project_id = v_project;
  delete from public.study_yield_bands where project_id is null;
  v_out := app.study_payload(v_project, 10, 5, 'central', 'olives', 'cash', null, null);
  assert (v_out->>'status') = 'incomplete', 'a study with no yield band still produced figures';
  assert v_out->'missing' @> '["yield_band"]'::jsonb,
    format('the missing yield band was not named: %s', v_out->>'missing');
  assert (v_out->'totals') is null and (v_out->'rows') is null,
    'an incomplete study still printed a table — zeros read as a conclusion';
  assert coalesce(v_out->>'legal_note', '') <> '', 'even the refusal must carry the warning';

  -- The age itself missing is its own answer, named separately.
  update public.projects set tree_age_years = null where id = v_project;
  update public.project_study set tree_age_years = null where project_id = v_project;
  v_out := app.study_payload(v_project, 10, 5, 'central', 'olives', 'cash', null, null);
  assert v_out->'missing' @> '["tree_age"]'::jsonb,
    format('an offer with no tree age did not say so: %s', v_out->>'missing');

  -- ── 9 · a switched-off offer says so instead of pricing ──────────────────────────────────────────────
  update public.project_study set is_enabled = false where project_id = v_project;
  assert (app.study_payload(v_project, 10, 5, 'central', 'olives', 'cash', null, null)->>'status') = 'closed',
    'the simulator answered for an offer it is switched off on';

  -- ── 10 · nothing in a browser may run it: it reads yields, charges and the pricing basis (§10) ───────
  assert not has_function_privilege('anon', 'app.study_payload(uuid, integer, integer, text, text, text, uuid, uuid)', 'execute'),
    'a visitor can run the study engine directly';
  assert not has_function_privilege('authenticated', 'app.study_payload(uuid, integer, integer, text, text, text, uuid, uuid)', 'execute'),
    'any signed-in account can run the study engine directly';

  raise notice 'study engine: the price is counted once, the payback comes from the cumulative, and a missing figure refuses';
end $$;
