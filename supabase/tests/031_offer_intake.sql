-- An offer takes its own requests, and only an offer that is on sale takes any.
-- Owner 2026-09-18 («in the offers it's a separate form»); migration 0049.
--
-- Runs against the live database inside a rolled-back transaction: fixtures use unused codes and unused
-- phone numbers, and nothing is written outside it.

create function pg_temp.oi_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- A request payload with everything valid; each test overrides the part it is about.
create function pg_temp.oi_payload(p_project text, p_trees text, p_phone text) returns jsonb
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
-- Fixtures: one offer on sale with its own prices, one still internal
-- ---------------------------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  update public.feature_flags set state = 'public' where key = 'pricing';

  update public.tree_spacing_classes set row_spacing_m = 24, tree_spacing_m = 24, is_active = true
  where code = 'trad_wide_24x24';
  perform set_config('test.oi_class', (select id::text from public.tree_spacing_classes where code = 'trad_wide_24x24'), true);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('offer-intake-test-' || gen_random_uuid(), 'عرض معروض', 34, 'published', 100) returning id into v_id;
  perform set_config('test.oi_open', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, current_setting('test.oi_class')::uuid);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp, price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);

  insert into public.projects (code, name, governorate_id, status, tree_count)
  values ('offer-intake-test-' || gen_random_uuid(), 'عرض مازال داخلي', 34, 'internal', 500) returning id into v_id;
  perform set_config('test.oi_hidden', v_id::text, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, current_setting('test.oi_class')::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- 1 · A request for an offer is recorded as one, with the offer's own figures
-- ---------------------------------------------------------------------------

do $$
declare
  v_quote   jsonb := app.project_quote_payload(current_setting('test.oi_open')::uuid, null, 10, 'cash', null, null, false);
  v_result  jsonb;
  v_request public.interest_requests;
begin
  v_result := public.submit_offer_request(pg_temp.oi_payload(current_setting('test.oi_open'), '10', '+21698000101'));
  select * into v_request from public.interest_requests where request_no = v_result->>'request_no';

  if v_request.request_kind <> 'offer' then
    raise exception 'an offer request must be marked as one, got %', v_request.request_kind;
  end if;
  if v_request.project_id::text <> current_setting('test.oi_open')
     or v_request.project_code is null or v_request.project_name <> 'عرض معروض' then
    raise exception 'the offer was not snapshotted: % / %', v_request.project_code, v_request.project_name;
  end if;
  if v_request.offer_trees <> 10 then
    raise exception 'expected 10 trees, got %', v_request.offer_trees;
  end if;
  -- The price and the yearly fee are the ones the offer page shows for the same ten trees.
  if v_request.offer_price_per_tree_millimes is distinct from (v_quote->>'price_per_tree_millimes')::bigint
     or v_request.offer_total_price_millimes is distinct from (v_quote->>'total_price_millimes')::bigint then
    raise exception 'the price does not match the offer page: % / %',
      v_request.offer_price_per_tree_millimes, v_request.offer_total_price_millimes;
  end if;
  if v_request.offer_annual_fee_per_tree_millimes <> 150000
     or v_request.offer_annual_fee_total_millimes <> 1500000 then
    raise exception 'the yearly care was not snapshotted: % / %',
      v_request.offer_annual_fee_per_tree_millimes, v_request.offer_annual_fee_total_millimes;
  end if;
  -- The shared columns keep the CRM lists, exports and the tree counter working with no new screen.
  if v_request.tree_count_min <> 10 or v_request.tree_count_max <> 10 or v_request.tree_count_code <> 'offer' then
    raise exception 'the CRM tree columns were not filled: % .. % (%)',
      v_request.tree_count_min, v_request.tree_count_max, v_request.tree_count_code;
  end if;
  if v_request.total_price_millimes is distinct from v_request.offer_total_price_millimes
     or v_request.price_per_tree_millimes is distinct from v_request.offer_price_per_tree_millimes then
    raise exception 'the shared money columns disagree with the offer columns';
  end if;
  if v_request.total_area_m2 is distinct from (v_quote->>'total_area_m2')::numeric then
    raise exception 'the area does not match the offer page: %', v_request.total_area_m2;
  end if;
  -- An offer buyer is never asked a goal, and the request is valid without one.
  if v_request.goal_option_id is not null then
    raise exception 'an offer request must not invent a goal';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · An offer that is not on sale takes nothing, whatever the form sends
-- ---------------------------------------------------------------------------

do $$
begin
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.oi_payload(current_setting('test.oi_hidden'), '10', '+21698000102')),
    'offer_not_available');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.oi_payload(gen_random_uuid()::text, '10', '+21698000103')),
    'offer_not_available');
end $$;

-- ---------------------------------------------------------------------------
-- 3 · From one tree to the whole offer, and nothing outside it
-- ---------------------------------------------------------------------------

do $$
declare
  v_result jsonb;
begin
  -- The two ends of the range are accepted.
  v_result := public.submit_offer_request(pg_temp.oi_payload(current_setting('test.oi_open'), '1', '+21698000104'));
  if (select offer_trees from public.interest_requests where request_no = v_result->>'request_no') <> 1 then
    raise exception 'one tree must be enough to ask for an offer';
  end if;
  v_result := public.submit_offer_request(pg_temp.oi_payload(current_setting('test.oi_open'), '100', '+21698000105'));
  if (select offer_trees from public.interest_requests where request_no = v_result->>'request_no') <> 100 then
    raise exception 'the whole offer must be askable';
  end if;

  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.oi_payload(current_setting('test.oi_open'), '101', '+21698000106')),
    'invalid_offer_trees');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.oi_payload(current_setting('test.oi_open'), '0', '+21698000107')),
    'invalid_offer_trees');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.oi_payload(current_setting('test.oi_open'), 'عشرة', '+21698000108')),
    'invalid_offer_trees');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)',
           pg_temp.oi_payload(current_setting('test.oi_open'), '', '+21698000109')),
    'invalid_offer_trees');
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Identity is checked exactly like the calculator form
-- ---------------------------------------------------------------------------

do $$
declare
  v_base jsonb := pg_temp.oi_payload(current_setting('test.oi_open'), '5', '+21698000110');
begin
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)', v_base - 'consent_text'), 'consent_required');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)', v_base - 'contact_channel'), 'contact_channel_required');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)', jsonb_set(v_base, '{full_name}', '"أ"')), 'invalid_full_name');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)', jsonb_set(v_base, '{phone_e164}', '"12345"')), 'invalid_phone');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)', jsonb_set(v_base, '{residence_governorate_id}', '"999"')),
    'invalid_governorate');
  perform pg_temp.oi_expect(
    format('select public.submit_offer_request(%L::jsonb)', jsonb_set(v_base, '{email}', '"pas-un-email"')), 'invalid_email');
end $$;

-- ---------------------------------------------------------------------------
-- 5 · The calculator flow stays strict about its own answers
-- ---------------------------------------------------------------------------

do $$
declare
  v_person uuid := (select person_id from public.interest_requests where request_kind = 'offer' limit 1);
begin
  -- Dropping the NOT NULL on the goal is for offers only: a calculator request without one is still refused.
  begin
    insert into public.interest_requests (request_no, person_id, full_name, phone_e164, whatsapp_e164,
                                          residence_governorate_id, contact_channel, consent_text)
    values ('AGZ-TEST-GOAL', v_person, 'حريف تجريبي', '+21698000111', '+21698000111', 34, 'phone', 'موافقة');
    raise exception 'a calculator request without a goal must be refused';
  exception when check_violation then
    null;
  end;

  -- And an unknown flow name is refused outright.
  begin
    insert into public.interest_requests (request_no, person_id, full_name, phone_e164, whatsapp_e164,
                                          residence_governorate_id, contact_channel, consent_text, request_kind)
    values ('AGZ-TEST-KIND', v_person, 'حريف تجريبي', '+21698000112', '+21698000112', 34, 'phone', 'موافقة', 'whatever');
    raise exception 'an unknown request_kind must be refused';
  exception when check_violation then
    null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6 · The intake is server-side only, like the calculator one
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('anon', 'public.submit_offer_request(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.submit_offer_request(jsonb)', 'execute') then
    raise exception 'submit_offer_request must not be callable from the browser';
  end if;
  if not has_function_privilege('service_role', 'public.submit_offer_request(jsonb)', 'execute') then
    raise exception 'the server must be able to take an offer request';
  end if;
end $$;
