-- 0139 · the two dispatchers share a queue and not each other's messages: the SMS claim never takes a push,
-- the push claim never takes an SMS, and a queued push knows every device it has to reach.

do $$
declare
  v_status   uuid;
  v_sms_id   uuid;
  v_push_id  uuid;
  v_claimed  uuid[];
  v_rows     integer;
begin
  -- Both switches on, so the claims are actually exercised rather than returning early.
  update public.settings set value = to_jsonb(true) where key in ('sms.enabled', 'push.enabled');

  select id into v_status from public.lead_statuses order by sort_order limit 1;
  insert into public.persons (full_name, phone_e164, status_id)
  values ('صاحب إشعارات', '+21655000186', v_status);

  perform public.register_push_token('ExponentPushToken[cccccccccccccccccccccc]', 'android', '+21655000186');
  perform public.register_push_token('ExponentPushToken[dddddddddddddddddddddd]', 'ios', '+21655000186');
  -- A device that is gone must not be sent to, and must not count.
  perform public.register_push_token('ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]', 'ios', '+21655000186');
  perform public.disable_push_token('ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]', 'DeviceNotRegistered');

  insert into public.notification_outbox (channel, to_phone_e164, template_key, body)
  values ('sms', '+21655000186', 'lead.confirmation', 'رسالة قصيرة') returning id into v_sms_id;

  perform app.enqueue_push('push.test', '+21655000186', '{}'::jsonb, 'push_test', null);
  select id into v_push_id from public.notification_outbox
   where to_phone_e164 = '+21655000186' and channel = 'push' order by created_at desc limit 1;
  assert v_push_id is not null, 'the push was not queued, so nothing below is being tested';

  -- ---------------------------------------------------------------------
  -- THE REGRESSION THIS FILE EXISTS FOR
  -- ---------------------------------------------------------------------
  -- Before 0139 this claim took the oldest due rows whatever their channel, and src/lib/sms.ts hands
  -- whatever it is given to WinSMS. The first push ever queued would have gone out as a text message.
  select array_agg(id) into v_claimed from public.claim_notifications(100);
  assert v_claimed is null or not (v_push_id = any (v_claimed)),
    'the SMS dispatcher claimed a push notification — it would have been sent as a text message';
  assert v_claimed is not null and v_sms_id = any (v_claimed),
    'the SMS claim stopped taking SMS as well, which is a worse fix than the fault';

  -- And the push claim is the mirror of that.
  select array_agg(id) into v_claimed from public.claim_push_notifications(100);
  assert v_claimed is not null and v_push_id = any (v_claimed), 'the push claim did not take the push';
  assert not (v_sms_id = any (v_claimed)), 'the push dispatcher claimed a text message';

  raise notice 'claims: each dispatcher takes its own channel and leaves the other alone';
end $$;

-- ---------------------------------------------------------------------------
-- The switches
-- ---------------------------------------------------------------------------

do $$
declare
  v_status uuid;
  v_rows   integer;
begin
  select id into v_status from public.lead_statuses order by sort_order limit 1;
  insert into public.persons (full_name, phone_e164, status_id)
  values ('صاحب إشعارات مطفية', '+21655000187', v_status);
  perform public.register_push_token('ExponentPushToken[ffffffffffffffffffffff]', 'ios', '+21655000187');
  perform app.enqueue_push('push.test', '+21655000187', '{}'::jsonb, null, null);

  -- Off means queued and not sent — the same promise sms.enabled makes, so a staff member can stop the
  -- phones buzzing without losing what was about to be said.
  update public.settings set value = to_jsonb(false) where key = 'push.enabled';
  select count(*)::integer into v_rows from public.claim_push_notifications(100);
  assert v_rows = 0, format('push.enabled is off and %s notifications were claimed anyway', v_rows);

  update public.settings set value = to_jsonb(true) where key = 'push.enabled';
  select count(*)::integer into v_rows from public.claim_push_notifications(100);
  assert v_rows > 0, 'push.enabled is on and nothing was claimed';

  raise notice 'the switch holds: off queues without sending, on releases';
end $$;

-- ---------------------------------------------------------------------------
-- Who a queued push reaches
-- ---------------------------------------------------------------------------

do $$
declare
  v_id    uuid;
  v_rows  integer;
  v_title text;
  v_body  text;
begin
  select id into v_id from public.notification_outbox
   where to_phone_e164 = '+21655000186' and channel = 'push' order by created_at desc limit 1;

  select count(*)::integer into v_rows from public.push_delivery(v_id);
  assert v_rows = 2, format('expected the two live devices on that number, got %s', v_rows);

  select title, body into v_title, v_body from public.push_delivery(v_id) limit 1;
  assert v_title = 'AgriZed', format('the title did not come from the template, got %s', v_title);
  assert v_body like '%تجربة%', 'the body is not the one the outbox holds';

  -- A disabled device is not an address.
  assert not exists (select 1 from public.push_delivery(v_id) d
                      where d.token = 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]'),
    'a device that told us it was gone is still being sent to';

  -- An SMS row has no devices, whatever is registered against the number.
  select count(*)::integer into v_rows
    from public.push_delivery((select id from public.notification_outbox
                                where to_phone_e164 = '+21655000186' and channel = 'sms' limit 1));
  assert v_rows = 0, 'push_delivery answered for a text message';

  raise notice 'delivery: both live devices, the template title, and nothing for a dead device or an sms';
end $$;

-- ---------------------------------------------------------------------------
-- Who may run any of it
-- ---------------------------------------------------------------------------

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    assert not has_function_privilege(v_role, 'public.claim_push_notifications(integer)', 'execute'),
      v_role || ' can claim notifications';
    assert not has_function_privilege(v_role, 'public.push_delivery(uuid)', 'execute'),
      v_role || ' can read the device addresses of a queued notification';
  end loop;

  assert has_function_privilege('service_role', 'public.claim_push_notifications(integer)', 'execute'),
    'the dispatcher cannot claim, so nothing would ever be sent';
  assert has_function_privilege('service_role', 'public.push_delivery(uuid)', 'execute'),
    'the dispatcher cannot resolve devices, so nothing would ever arrive';

  raise notice 'privileges: claiming and resolving devices are the dispatcher''s alone';
end $$;
