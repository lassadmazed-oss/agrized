-- Interest intake: request numbers, snapshots, duplicates, validation, throttling.
-- Spec: LEAD-02, LEAD-04, LEAD-05, LEAD-06, LEAD-11, PARC-01..PARC-06.

-- 0032 retires these lists (plan Q-7) but this file submits their items: active again inside this rolled-back test only.
update public.option_items set is_active = true where list_key in ('desired_area', 'priority', 'down_payment', 'monthly_installment');

create function pg_temp.payload(p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'محمد التونسي',
    'phone_e164', '+21698123456',
    'residence_governorate_id', 34,
    'invest_governorate_ids', jsonb_build_array(34, 31),
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios where code = 'big_productive')),
    'desired_area_option_id', (select id from public.option_items where list_key = 'desired_area' and code = 'area_500'),
    'priority_option_id', (select id from public.option_items where list_key = 'priority' and code = 'productive'),
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and code = 'both'),
    'down_payment_option_id', (select id from public.option_items where list_key = 'down_payment' and code = 'dp_1000'),
    'installment_option_id', (select id from public.option_items where list_key = 'monthly_installment' and code = 'mi_80'),
    'contact_channel', 'whatsapp',
    'contact_time_option_id', (select id from public.option_items where list_key = 'contact_time' and code = 'evening'),
    'consent_text', 'أوافق',
    'ip_hash', 'test-ip-hash',
    'source', jsonb_build_object('utm_source', 'facebook', 'injected', 'drop me')
  ) || p_overrides
$$;

create function pg_temp.expect_error(p jsonb, p_expected text) returns void language plpgsql as $$
begin
  perform public.submit_interest_request(p);
  raise exception 'expected error "%" but the call succeeded', p_expected;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%"', p_expected, sqlerrm;
  end if;
end $$;

do $$
declare
  v_first   jsonb;
  v_second  jsonb;
  v_req     public.interest_requests;
  v_down    uuid := (select id from public.option_items where list_key = 'down_payment' and code = 'dp_1000');
begin
  -- First request
  v_first := public.submit_interest_request(pg_temp.payload('{}'));
  assert v_first->>'request_no' ~ ('^AGZ-' || to_char(now() at time zone 'Africa/Tunis', 'YYYY') || '-[0-9]{6}$'),
    'request number format, got ' || coalesce(v_first->>'request_no', 'null');

  select * into v_req from public.interest_requests where request_no = v_first->>'request_no';
  assert v_req.down_payment_min_millimes = 1000000, 'down payment snapshot in millimes';
  assert v_req.down_payment_label_ar = '1,000 د.ت', 'down payment label snapshot';
  assert v_req.whatsapp_e164 = '+21698123456', 'WhatsApp defaults to the phone number';
  assert v_req.residence_delegation_id is null, 'the delegation is optional in the public form';
  assert not v_req.is_duplicate, 'first request is not a duplicate';
  assert v_req.source = '{"utm_source": "facebook"}'::jsonb, 'source keeps known keys only, got ' || v_req.source::text;

  -- Clause 25: the scenario decides the project type, and area and priority are stored as chosen
  assert cardinality(v_req.scenario_ids) = 1, 'the chosen scenario is kept';
  -- The label is whatever the Back Office shows today (0027 renamed the seed), snapshotted as displayed.
  assert v_req.scenario_labels = array[(select s.label_ar from public.ownership_scenarios s where s.code = 'big_productive')],
    'scenario label snapshot, got ' || v_req.scenario_labels::text;
  assert v_req.project_type_ids = array[(select id from public.project_types where code = 'productive')],
    'the project type is derived from the scenario';
  assert not v_req.project_type_unsure, 'a mapped scenario is not "unsure"';
  assert v_req.plantation_systems = array['traditional'], 'plantation system from the scenario';
  assert v_req.production_statuses = array['producing'], 'production status from the scenario';
  assert v_req.desired_area_min_m2 = 500 and v_req.desired_area_max_m2 = 500, 'desired area snapshot in m²';
  assert v_req.desired_area_label_ar = '500 م²', 'desired area label snapshot';
  assert v_req.priority_code = 'productive', 'priority code snapshot';

  assert exists (select 1 from public.notification_outbox o
                 where o.related_id = v_req.id and o.template_key = 'lead.confirmation'
                   and o.body like '%' || v_req.request_no || '%'), 'confirmation SMS enqueued with the request number';
  assert exists (select 1 from public.audit_logs a where a.entity = 'interest_requests' and a.entity_id = v_req.id::text),
    'request creation is audited';

  -- "ما يهمنيش النوع" clears the project types
  v_second := public.submit_interest_request(pg_temp.payload(jsonb_build_object(
    'phone_e164', '+21622000009', 'ip_hash', 'any-scn',
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios where code = 'any')))));
  assert (select project_type_unsure and project_type_ids = '{}'
          from public.interest_requests where request_no = v_second->>'request_no'),
    '"any" scenario means no specific project type';

  -- Same phone: one person, second request flagged, person data untouched (LEAD-04, LEAD-05)
  v_second := public.submit_interest_request(pg_temp.payload(
    '{"full_name": "شخص آخر", "invest_anywhere": true, "ip_hash": "other-ip"}'));
  assert (select count(*) from public.persons where phone_e164 = '+21698123456') = 1, 'one person per phone';
  assert (select full_name from public.persons where phone_e164 = '+21698123456') = 'محمد التونسي',
    'existing person is not overwritten from the public form';
  assert (select is_duplicate from public.interest_requests where request_no = v_second->>'request_no'),
    'second request is flagged as duplicate';
  assert (select invest_governorate_ids = '{}' from public.interest_requests where request_no = v_second->>'request_no'),
    '"anywhere" clears the governorate list';
  assert v_second->>'request_no' > v_first->>'request_no', 'request numbers increase';

  -- Editing an option later does not change existing requests (LEAD-02)
  update public.option_items set label_ar = '1,200 د.ت', min_millimes = 1200000 where id = v_down;
  assert (select down_payment_min_millimes from public.interest_requests where id = v_req.id) = 1000000,
    'snapshot survives option edits';

  -- Validation
  perform pg_temp.expect_error(pg_temp.payload('{"phone_e164": "+33612345678", "ip_hash": "v1"}'), 'phone_not_tunisian');
  perform pg_temp.expect_error(pg_temp.payload('{"phone_e164": "98123456", "ip_hash": "v2"}'), 'invalid_phone');
  perform pg_temp.expect_error(pg_temp.payload('{"full_name": "م", "ip_hash": "v3"}'), 'invalid_full_name');
  perform pg_temp.expect_error(pg_temp.payload(
    jsonb_build_object('residence_delegation_id', (select id from public.delegations where governorate_id = 11 limit 1), 'ip_hash', 'v4')),
    'invalid_delegation');
  perform pg_temp.expect_error(pg_temp.payload('{"residence_governorate_id": 99, "ip_hash": "v4b"}'), 'invalid_governorate');
  perform pg_temp.expect_error(pg_temp.payload('{"invest_governorate_ids": [], "ip_hash": "v5"}'), 'invest_location_required');
  perform pg_temp.expect_error(pg_temp.payload('{"invest_governorate_ids": [99], "ip_hash": "v6"}'), 'invalid_invest_governorate');
  -- No offer type: refused before 0032, recorded as «no specific type» since (plan Q-6). A spare phone keeps the throttle count.
  begin
    v_second := public.submit_interest_request(pg_temp.payload('{"scenario_ids": [], "phone_e164": "+21622000010", "ip_hash": "v7"}'));
    assert (select project_type_unsure from public.interest_requests where request_no = v_second->>'request_no'),
      'a demand without an offer type is recorded as unsure';
  exception when others then
    if sqlerrm <> 'scenario_required' then
      raise;
    end if;
  end;
  perform pg_temp.expect_error(pg_temp.payload(
    jsonb_build_object('scenario_ids', jsonb_build_array(gen_random_uuid()), 'ip_hash', 'v7b')), 'invalid_scenario');
  perform pg_temp.expect_error(pg_temp.payload(
    jsonb_build_object('desired_area_option_id', (select id from public.option_items where list_key = 'goal' limit 1), 'ip_hash', 'v7c')),
    'invalid_desired_area');
  perform pg_temp.expect_error(pg_temp.payload(
    jsonb_build_object('priority_option_id', (select id from public.option_items where list_key = 'goal' limit 1), 'ip_hash', 'v7d')),
    'invalid_priority');
  perform pg_temp.expect_error(pg_temp.payload(
    jsonb_build_object('down_payment_option_id', (select id from public.option_items where list_key = 'monthly_installment' limit 1), 'ip_hash', 'v8')),
    'invalid_down_payment');
  perform pg_temp.expect_error(pg_temp.payload('{"contact_channel": "fax", "ip_hash": "v9"}'), 'contact_channel_required');
  perform pg_temp.expect_error(pg_temp.payload('{"consent_text": "  ", "ip_hash": "v10"}'), 'consent_required');

  -- Inactive options are refused
  update public.option_items set is_active = false where list_key = 'goal' and code = 'both';
  perform pg_temp.expect_error(pg_temp.payload('{"ip_hash": "v11"}'), 'invalid_goal');
  update public.option_items set is_active = true where list_key = 'goal' and code = 'both';

  -- International numbers once the setting is enabled (D-02)
  update public.settings set value = 'true' where key = 'lead.allow_international_phone';
  perform public.submit_interest_request(pg_temp.payload('{"phone_e164": "+33612345678", "ip_hash": "v12"}'));
  update public.settings set value = 'false' where key = 'lead.allow_international_phone';

  -- One scenario only when multi-select is disabled (D-01)
  update public.settings set value = 'false' where key = 'lead.project_types_multi';
  perform pg_temp.expect_error(pg_temp.payload(jsonb_build_object(
    'phone_e164', '+21622000001', 'ip_hash', 'v13',
    'scenario_ids', (select jsonb_agg(id) from public.ownership_scenarios where is_active))), 'single_scenario_only');
  update public.settings set value = 'true' where key = 'lead.project_types_multi';

  -- Throttling per phone: third request of the day passes, fourth is refused (LEAD-06)
  perform public.submit_interest_request(pg_temp.payload('{"ip_hash": "t1"}'));
  perform pg_temp.expect_error(pg_temp.payload('{"ip_hash": "t2"}'), 'rate_limited');

  -- Throttling per IP
  update public.settings set value = '2' where key = 'antispam.max_requests_per_ip_per_hour';
  perform public.submit_interest_request(pg_temp.payload('{"phone_e164": "+21622000002", "ip_hash": "same-ip"}'));
  perform public.submit_interest_request(pg_temp.payload('{"phone_e164": "+21622000003", "ip_hash": "same-ip"}'));
  perform pg_temp.expect_error(pg_temp.payload('{"phone_e164": "+21622000004", "ip_hash": "same-ip"}'), 'rate_limited');
end $$;
