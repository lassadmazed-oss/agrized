-- An offer request carries its payment plan, and the offer publishes only the plans it allows.
-- Owner 2026-09-19 («in the form its missing the payment method like the main form … each offer has its own
-- stuff»); draft supabase/pending/bb_10_offer_payment_plan.sql.
--
-- ███ THIS FILE IS RED UNTIL bb_10 IS APPLIED, on purpose — like 006, 011 and 012 are red until the three
-- ███ parcel drafts are applied. It asserts the world after bb_10. To see it green before that, run the draft
-- ███ and this file together inside one rolled-back transaction:
-- ███   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_10_offer_payment_plan.sql \
-- ███                                               supabase/tests/035_offer_payment_plan.sql
--
-- Runs against the live database inside a rolled-back transaction: fixtures use unused codes and unused phone
-- numbers, and nothing is written outside it.

create function pg_temp.opp_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- A request payload with everything valid; each test overrides the part it is about.
create function pg_temp.opp_payload(p_project text, p_trees text, p_phone text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'full_name', 'حريف تجريبي',
    'phone_e164', p_phone,
    'residence_governorate_id', '34',
    'contact_channel', 'phone',
    'consent_text', 'موافقة تجريبية',
    'project_id', p_project,
    'trees', p_trees
  )
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: an offer with its OWN payment menu, an offer that sells cash only, an offer with no price
-- ---------------------------------------------------------------------------
-- Nothing here is hard-coded into the functions under test: the percentages and the durations are rows, and
-- the test reads back what the offer publishes rather than what it expects it to publish.

do $$
declare
  v_id    uuid;
  v_class uuid;
begin
  update public.feature_flags set state = 'public' where key = 'pricing';

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  select id into v_class from public.tree_spacing_classes where code = 'trad_wide_24x24';
  perform set_config('test.opp_class', v_class::text, true);

  -- Two percentages of our own, so the test never depends on which ones the owner has ticked today.
  insert into public.option_items (list_key, code, label_ar, label_fr, min_number, sort_order, is_active)
  values ('down_payment_percent', 'opp_pct_25', '25%', '25 %', 25, 925, true) returning id into v_id;
  perform set_config('test.opp_pct_allowed', v_id::text, true);
  insert into public.option_items (list_key, code, label_ar, label_fr, min_number, sort_order, is_active)
  values ('down_payment_percent', 'opp_pct_35', '35%', '35 %', 35, 935, true) returning id into v_id;
  perform set_config('test.opp_pct_other', v_id::text, true);

  -- Two durations of our own: one this offer prices, one nobody prices.
  insert into public.option_items (list_key, code, label_ar, label_fr, min_number, sort_order, is_active)
  values ('duration', 'opp_dur_24', 'سنتين', '2 ans', 24, 924, true) returning id into v_id;
  perform set_config('test.opp_dur_allowed', v_id::text, true);
  insert into public.option_items (list_key, code, label_ar, label_fr, min_number, sort_order, is_active)
  values ('duration', 'opp_dur_18', 'سنة ونص', '18 mois', 18, 918, true) returning id into v_id;
  perform set_config('test.opp_dur_unpriced', v_id::text, true);

  -- 1 · The offer with its own menu: 1000 trees, at least 20 per order.
  insert into public.projects (code, name, governorate_id, status, tree_count, min_trees_per_order)
  values ('offer-plan-test-' || gen_random_uuid(), 'عرض بخطط خاصة به', 34, 'published', 1000, 20)
  returning id into v_id;
  perform set_config('test.opp_full', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp, price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);
  -- Its own percentage list: one row, so every other active percentage is refused for this offer.
  insert into public.project_down_payment_percents (project_id, option_item_id)
  values (v_id, current_setting('test.opp_pct_allowed')::uuid);
  -- Its own duration: 24 months is priced for this offer and for no other.
  insert into public.financing_markups (project_id, months, markup_bp) values (v_id, 24, 1500);

  -- 2 · The offer that sells cash only.
  insert into public.projects (code, name, governorate_id, status, tree_count, allows_installments)
  values ('offer-plan-test-' || gen_random_uuid(), 'عرض بالحاضر فقط', 34, 'published', 100, false)
  returning id into v_id;
  perform set_config('test.opp_cash', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp, price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);

  -- 3 · The offer with no price at all: no spacing class, so `pricing` is 'legacy'.
  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('offer-plan-test-' || gen_random_uuid(), 'عرض بلا سعر', 34, 'published', 100)
  returning id into v_id;
  perform set_config('test.opp_nopricing', v_id::text, true);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · A cash request says so, and carries no plan
-- ---------------------------------------------------------------------------

do $$
declare
  v_result  jsonb;
  v_request public.interest_requests;
begin
  v_result := public.submit_offer_request(
    pg_temp.opp_payload(current_setting('test.opp_full'), '50', '+21698000201') || '{"payment_mode": "cash"}'::jsonb);
  select * into v_request from public.interest_requests where request_no = v_result->>'request_no';

  if v_request.payment_mode <> 'cash' then
    raise exception 'a cash offer request must record cash, got %', v_request.payment_mode;
  end if;
  if v_request.down_payment_percent_option_id is not null or v_request.down_payment_percent is not null
     or v_request.down_payment_amount_millimes is not null or v_request.total_financed_millimes is not null
     or v_request.monthly_millimes is not null or v_request.duration_option_id is not null
     or v_request.duration_label_ar is not null or v_request.duration_months is not null then
    raise exception 'a cash request must carry no instalment figure';
  end if;
  -- Plan Q-7: the retired «down payment amount» list is never filled by this intake.
  if v_request.down_payment_option_id is not null or v_request.down_payment_label_ar is not null
     or v_request.down_payment_min_millimes is not null or v_request.down_payment_max_millimes is not null then
    raise exception 'the retired down payment amount list must stay empty on an offer request';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Not answering the payment question is a real state, not a refusal
-- ---------------------------------------------------------------------------

do $$
declare
  v_result jsonb;
  v_mode   text;
begin
  v_result := public.submit_offer_request(
    pg_temp.opp_payload(current_setting('test.opp_full'), '50', '+21698000202'));
  select payment_mode into v_mode from public.interest_requests where request_no = v_result->>'request_no';
  if v_mode is not null then
    raise exception 'a request that answered nothing must stay «بدون إجابة», got %', v_mode;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · An instalment request records the plan, figure for figure, as the offer page quoted it
-- ---------------------------------------------------------------------------

do $$
declare
  v_pct     uuid := current_setting('test.opp_pct_allowed')::uuid;
  v_dur     uuid := current_setting('test.opp_dur_allowed')::uuid;
  v_quote   jsonb := app.project_quote_payload(current_setting('test.opp_full')::uuid, null, 200,
                                               'installments', v_pct, v_dur, false);
  v_inst    jsonb := v_quote->'installments';
  v_result  jsonb;
  v_request public.interest_requests;
begin
  if v_inst->>'status' <> 'ok' then
    raise exception 'the fixture offer must quote a plan, got %', v_inst->>'status';
  end if;

  v_result := public.submit_offer_request(
    pg_temp.opp_payload(current_setting('test.opp_full'), '200', '+21698000203')
    || jsonb_build_object('payment_mode', 'installments',
                          'down_payment_percent_option_id', v_pct,
                          'duration_option_id', v_dur));
  select * into v_request from public.interest_requests where request_no = v_result->>'request_no';

  if v_request.payment_mode <> 'installments' then
    raise exception 'the payment mode was not recorded: %', v_request.payment_mode;
  end if;
  if v_request.down_payment_percent_option_id is distinct from v_pct
     or v_request.duration_option_id is distinct from v_dur then
    raise exception 'the two chosen options must be recorded: % / %',
      v_request.down_payment_percent_option_id, v_request.duration_option_id;
  end if;
  -- Every figure comes from app.project_quote_payload; none of them is computed in the intake.
  if v_request.down_payment_percent is distinct from (v_inst->>'down_payment_percent')::numeric
     or v_request.down_payment_amount_millimes is distinct from (v_inst->>'down_payment_millimes')::bigint
     or v_request.total_financed_millimes is distinct from (v_inst->>'total_financed_millimes')::bigint
     or v_request.monthly_millimes is distinct from (v_inst->>'monthly_millimes')::bigint
     or v_request.duration_months is distinct from (v_inst->>'months')::integer then
    raise exception 'the recorded plan does not match the quote: %% % / تسبقة % / جملة % / شهري % / % شهر',
      v_request.down_payment_percent, v_request.down_payment_amount_millimes,
      v_request.total_financed_millimes, v_request.monthly_millimes, v_request.duration_months;
  end if;
  if v_request.duration_label_ar is distinct from
     (select label_ar from public.option_items o where o.id = v_dur) then
    raise exception 'the duration label was not snapshotted: %', v_request.duration_label_ar;
  end if;
  if coalesce(v_request.monthly_millimes, 0) <= 0 or coalesce(v_request.total_financed_millimes, 0) <= 0 then
    raise exception 'an instalment request must carry a real monthly amount';
  end if;
  -- The cash price is still snapshotted beside the plan, and the plan never replaced it.
  if v_request.offer_total_price_millimes is distinct from (v_quote->>'total_price_millimes')::bigint
     or v_request.total_price_millimes is distinct from v_request.offer_total_price_millimes then
    raise exception 'the cash total must survive an instalment request: %', v_request.offer_total_price_millimes;
  end if;
  if v_request.total_financed_millimes <= v_request.offer_total_price_millimes then
    raise exception 'the financed total must carry the markup of the chosen duration';
  end if;
  if v_request.down_payment_option_id is not null or v_request.down_payment_min_millimes is not null then
    raise exception 'the retired down payment amount list must stay empty on an offer request';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · A plan this offer does not allow is refused, each refusal with its own code
-- ---------------------------------------------------------------------------

do $$
declare
  v_base jsonb := pg_temp.opp_payload(current_setting('test.opp_full'), '50', '+21698000204');
  v_pct  text := current_setting('test.opp_pct_allowed');
  v_dur  text := current_setting('test.opp_dur_allowed');
begin
  -- A word that is neither of the two answers.
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)', jsonb_set(v_base, '{payment_mode}', '"credit"')),
    'invalid_payment_mode');

  -- Instalments without the answers the offer asks for.
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)', jsonb_set(v_base, '{payment_mode}', '"installments"')),
    'offer_down_payment_percent_required');
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           v_base || jsonb_build_object('payment_mode', 'installments', 'down_payment_percent_option_id', v_pct)),
    'offer_duration_required');

  -- A percentage that is active in the general list but is not one this offer sells.
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           v_base || jsonb_build_object('payment_mode', 'installments',
                                        'down_payment_percent_option_id', current_setting('test.opp_pct_other'),
                                        'duration_option_id', v_dur)),
    'offer_down_payment_percent_not_allowed');
  -- A duration that is active but priced by nobody, so no offer sells it.
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           v_base || jsonb_build_object('payment_mode', 'installments',
                                        'down_payment_percent_option_id', v_pct,
                                        'duration_option_id', current_setting('test.opp_dur_unpriced'))),
    'offer_duration_not_allowed');
  -- A duration that exists and is priced, but not for this offer: 24 months belongs to opp_full alone.
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.opp_payload(current_setting('test.opp_cash'), '10', '+21698000205')
           || jsonb_build_object('payment_mode', 'installments',
                                 'down_payment_percent_option_id', v_pct, 'duration_option_id', v_dur)),
    'offer_installments_not_offered');

  -- Nonsense in place of an id is a refusal, never a crash.
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           v_base || jsonb_build_object('payment_mode', 'installments',
                                        'down_payment_percent_option_id', 'pas-un-id',
                                        'duration_option_id', v_dur)),
    'offer_down_payment_percent_not_allowed');

  -- Nothing above was recorded: a refused plan never becomes a demand.
  if exists (select 1 from public.interest_requests where phone_e164 in ('+21698000204', '+21698000205')) then
    raise exception 'a refused plan must not leave a request behind';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5 · What each offer publishes about its own plans — and the cash-only offer publishes none
-- ---------------------------------------------------------------------------

do $$
declare
  v_full  jsonb := public.public_project_quote(current_setting('test.opp_full')::uuid, null, 100);
  v_cash  jsonb := public.public_project_quote(current_setting('test.opp_cash')::uuid, null, 100);
  v_nopr  jsonb := public.public_project_quote(current_setting('test.opp_nopricing')::uuid, null, 100);
  v_asked jsonb;
  v_result jsonb;
begin
  -- The offer with its own menu publishes exactly its own percentage, and its own duration is in the list.
  -- «This offer sells on instalments» is said by the two lists themselves and by nothing else: the payload
  -- carries no boolean for it, and 020_project_quote.sql guards that it never grows one.
  if jsonb_array_length(v_full->'choices'->'durations') = 0 then
    raise exception 'an offer with a percentage and a priced duration must publish its durations';
  end if;
  if jsonb_array_length(v_full->'choices'->'down_percents') <> 1
     or (v_full->'choices'->'down_percents'->0->>'id') <> current_setting('test.opp_pct_allowed') then
    raise exception 'the offer must publish its OWN percentage list, got %', v_full->'choices'->'down_percents';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_full->'choices'->'durations') d
                 where d->>'id' = current_setting('test.opp_dur_allowed')) then
    raise exception 'the offer must publish the duration it prices itself';
  end if;
  if exists (select 1 from jsonb_array_elements(v_full->'choices'->'durations') d
             where d->>'id' = current_setting('test.opp_dur_unpriced')) then
    raise exception 'a duration nobody prices must never be published';
  end if;

  -- The cash-only offer: no menu at all, and it answers instead of quoting.
  if jsonb_array_length(v_cash->'choices'->'down_percents') <> 0
     or jsonb_array_length(v_cash->'choices'->'durations') <> 0 then
    raise exception 'a cash-only offer must publish no percentage and no duration';
  end if;
  v_asked := public.public_project_quote(current_setting('test.opp_cash')::uuid, null, 100, 'installments',
                                         current_setting('test.opp_pct_allowed')::uuid,
                                         current_setting('test.opp_dur_allowed')::uuid);
  if v_asked->'installments'->>'status' <> 'not_offered' then
    raise exception 'a cash-only offer must answer «not_offered», got %', v_asked->'installments'->>'status';
  end if;
  if v_asked->>'total_price_millimes' is null then
    raise exception 'refusing a plan must not take the cash price away';
  end if;
  -- And it still takes a cash request.
  v_result := public.submit_offer_request(
    pg_temp.opp_payload(current_setting('test.opp_cash'), '10', '+21698000206') || '{"payment_mode": "cash"}'::jsonb);
  if (select payment_mode from public.interest_requests where request_no = v_result->>'request_no') <> 'cash' then
    raise exception 'a cash-only offer must still take a cash request';
  end if;

  -- PRJ-03: an offer whose price is not shown publishes no percentage either — a percentage of an amount the
  -- visitor may not see is a commercial term with nothing to attach to.
  if v_nopr->>'pricing' = 'ok' then
    raise exception 'the fixture without a spacing class must have no price';
  end if;
  if jsonb_array_length(v_nopr->'choices'->'down_percents') <> 0
     or jsonb_array_length(v_nopr->'choices'->'durations') <> 0 then
    raise exception 'an offer with no visible price must publish no payment plan';
  end if;
  -- It still takes a request, without money and without a plan.
  v_result := public.submit_offer_request(
    pg_temp.opp_payload(current_setting('test.opp_nopricing'), '10', '+21698000207'));
  if (select total_price_millimes from public.interest_requests where request_no = v_result->>'request_no')
     is not null then
    raise exception 'an offer with no price must record no price';
  end if;
  -- Asked with a percentage and a duration this offer would otherwise allow, so the refusal can only come from
  -- the missing price itself.
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.opp_payload(current_setting('test.opp_nopricing'), '10', '+21698000208')
           || jsonb_build_object('payment_mode', 'installments',
                                 'down_payment_percent_option_id',
                                 (select o.id from app.project_down_percent_items(current_setting('test.opp_nopricing')::uuid) o
                                  order by o.min_number limit 1),
                                 'duration_option_id',
                                 coalesce((select o.id from app.project_duration_items(current_setting('test.opp_nopricing')::uuid) o
                                           order by o.min_number limit 1),
                                          current_setting('test.opp_dur_allowed')::uuid))),
    'offer_installments_not_offered');
end $$;

-- ---------------------------------------------------------------------------
-- 6 · A visitor may read what the offer allows, and not one internal figure
-- ---------------------------------------------------------------------------

do $$
declare
  v_quote jsonb := public.public_project_quote(current_setting('test.opp_full')::uuid, null, 200, 'installments',
                                               current_setting('test.opp_pct_allowed')::uuid,
                                               current_setting('test.opp_dur_allowed')::uuid);
  v_key   text;
begin
  -- The reader is the one every public page already calls, granted the way every public RPC is granted.
  if not has_function_privilege('anon', 'public.public_project_quote(uuid, uuid, integer, text, uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.public_project_quote(uuid, uuid, integer, text, uuid, uuid)', 'execute') then
    raise exception 'a visitor must be able to read what an offer allows';
  end if;
  -- The two tables behind the menu stay closed to the browser.
  if has_table_privilege('anon', 'public.project_down_payment_percents', 'select')
     or has_table_privilege('anon', 'public.financing_markups', 'select') then
    raise exception 'the percentage and markup tables must never be readable by anon';
  end if;

  if v_quote->'installments'->>'status' <> 'ok' then
    raise exception 'the visitor must get the plan he asked for, got %', v_quote->'installments'->>'status';
  end if;
  -- The markup is the internal figure: the visitor sees what it produced, never its value.
  if v_quote ? 'price' or v_quote->'installments' ? 'markup_bp' then
    raise exception 'a public quote must carry neither the cost breakdown nor the markup';
  end if;
  -- Each published choice is an id, two labels and the number the visitor chose by — nothing priced.
  for v_key in
    select k from jsonb_array_elements(v_quote->'choices'->'down_percents') c, jsonb_object_keys(c) k
    union
    select k from jsonb_array_elements(v_quote->'choices'->'durations') c, jsonb_object_keys(c) k
  loop
    if v_key not in ('id', 'label_ar', 'label_fr', 'percent', 'months') then
      raise exception 'a published choice must carry no other key, found %', v_key;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7 · Nothing the offer intake already did was lost
-- ---------------------------------------------------------------------------

do $$
declare
  v_quote   jsonb := app.project_quote_payload(current_setting('test.opp_full')::uuid, null, 20, 'cash', null, null, false);
  v_result  jsonb;
  v_request public.interest_requests;
begin
  -- The minimum per order still holds, with its own code (0054).
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.opp_payload(current_setting('test.opp_full'), '19', '+21698000209')),
    'below_min_trees');
  -- And the offer's own ceiling.
  perform pg_temp.opp_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.opp_payload(current_setting('test.opp_full'), '1001', '+21698000210')),
    'invalid_offer_trees');

  -- The visit intent, the offer snapshot and the yearly care still travel with the request (0051, 0049, 0048).
  v_result := public.submit_offer_request(
    pg_temp.opp_payload(current_setting('test.opp_full'), '20', '+21698000211')
    || '{"wants_visit": true, "payment_mode": "cash"}'::jsonb);
  select * into v_request from public.interest_requests where request_no = v_result->>'request_no';
  if v_request.wants_visit is distinct from true then
    raise exception 'the visit intent must still be recorded';
  end if;
  if v_request.request_kind <> 'offer' or v_request.project_id::text <> current_setting('test.opp_full')
     or v_request.offer_trees <> 20 then
    raise exception 'the offer snapshot must still be recorded';
  end if;
  if v_request.offer_price_per_tree_millimes is distinct from (v_quote->>'price_per_tree_millimes')::bigint
     or v_request.offer_total_price_millimes is distinct from (v_quote->>'total_price_millimes')::bigint
     or v_request.offer_annual_fee_total_millimes is distinct from (v_quote->>'annual_fee_total_millimes')::bigint
     or v_request.total_area_m2 is distinct from (v_quote->>'total_area_m2')::numeric then
    raise exception 'the price, the yearly care or the area stopped matching the offer page';
  end if;

  -- The intake is server-side only, like the calculator one.
  if has_function_privilege('anon', 'public.submit_offer_request(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.submit_offer_request(jsonb)', 'execute') then
    raise exception 'submit_offer_request must not be callable from the browser';
  end if;
  if not has_function_privilege('service_role', 'public.submit_offer_request(jsonb)', 'execute') then
    raise exception 'the server must be able to take an offer request';
  end if;
end $$;
