-- 0152 · the notifications the owner writes by hand: who may write one, what is refused, who a campaign goes to,
-- and that the dispatcher's three calls move a campaign through its states.
--
-- THIS FILE OWNS ITS DEVICES. Reading the owner's live push_tokens would turn every assertion below into a
-- statement about whoever installed the app last. Four devices are inserted here, one of them dated a day ahead
-- so that «the device seen most recently» is certainly ours; everything is rolled back with the rest, like every
-- file here.
do $$
declare
  v_admin    uuid;
  v_stranger uuid := gen_random_uuid();
  v_row      public.push_campaigns;
  v_all      uuid;
  v_phone    uuid;
  v_latest   uuid;
  v_ios      uuid;
  v_android  uuid;
  v_n        integer;
  v_status   text;
  v_devices  jsonb;
  v_later    text := (now() + interval '1 hour')::text;
  v_cases    text[][];
  i          integer;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;

  insert into public.push_tokens (token, phone_e164, platform, app_version, last_seen_at) values
    ('ExponentPushToken[test099a]', '+21690000991', 'android', '1.1.0', now() + interval '1 day'),
    ('ExponentPushToken[test099b]', '+21690000991', 'ios',     '1.1.0', now() - interval '1 hour'),
    ('ExponentPushToken[test099c]', null,           'android', '1.0.0', now() - interval '2 hours'),
    ('ExponentPushToken[test099d]', null,           'ios',     '1.0.0', now() - interval '3 days');

  -- 1 · A STRANGER CANNOT WRITE ONE, AND NEITHER CAN SOMEBODY WHO HOLDS NO STAFF ROLE. A message to every phone
  --     with the app reaches the buyers; the refusal is the database's own, not the page's.
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  begin
    perform public.staff_create_push_campaign('{"title":"t","body":"b","audience":"all"}'::jsonb);
    assert false, 'a user with no staff role wrote a campaign';
  exception when sqlstate '42501' then
    null;
  end;
  begin
    perform public.staff_push_devices();
    assert false, 'a user with no staff role read the device list';
  exception when sqlstate '42501' then
    null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 2 · EVERY REFUSAL HAS ITS OWN CODE, which is what the page turns into a sentence.
  v_cases := array[
    ['{"title":"","body":"b","audience":"all"}',                                              'push_title_required'],
    ['{"title":"x","body":"","audience":"all"}',                                              'push_body_required'],
    [format('{"title":"%s","body":"b","audience":"all"}', repeat('ا', 61)),                   'push_title_too_long'],
    [format('{"title":"t","body":"%s","audience":"all"}', repeat('ا', 241)),                  'push_body_too_long'],
    ['{"title":"t","body":"b","audience":"all","route":"/admin"}',                            'push_route_invalid'],
    ['{"title":"t","body":"b","audience":"all","route":"/offer/a b"}',                        'push_route_invalid'],
    ['{"title":"t","body":"b","audience":"everyone"}',                                        'push_audience_invalid'],
    ['{"title":"t","body":"b","audience":"phone"}',                                           'push_phone_required'],
    ['{"title":"t","body":"b","audience":"phone","phone":"98123456"}',                        'push_phone_invalid'],
    ['{"title":"t","body":"b","audience":"all","scheduled_at":"not a date"}',                 'push_schedule_invalid'],
    [format('{"title":"t","body":"b","audience":"all","scheduled_at":"%s"}', (now() + interval '100 days')::text), 'push_schedule_invalid'],
    ['{"title":"t","body":"b","audience":"phone","phone":"+21699999999"}',                    'push_no_devices']
  ];
  for i in 1 .. array_length(v_cases, 1) loop
    begin
      perform public.staff_create_push_campaign(v_cases[i][1]::jsonb);
      assert false, format('«%s» was accepted but should be refused with %s', v_cases[i][1], v_cases[i][2]);
    exception when sqlstate 'P0001' then
      assert sqlerrm = v_cases[i][2], format('expected %s, got %s', v_cases[i][2], sqlerrm);
    end;
  end loop;

  -- 3 · THE FIVE AUDIENCES RESOLVE TO THE DEVICES THEY SAY. Scheduled an hour ahead so nothing below claims them
  --     by accident.
  v_row := public.staff_create_push_campaign(jsonb_build_object(
    'title', 'تجربة', 'body', 'هذا إشعار تجريبي', 'audience', 'all', 'route', '/offers', 'scheduled_at', v_later));
  v_all := v_row.id;
  assert v_row.status = 'scheduled' and v_row.created_by = v_admin and v_row.route = '/offers',
    'a campaign is not written as scheduled, by its author, with its route';

  v_phone   := (public.staff_create_push_campaign(jsonb_build_object('title', 't', 'body', 'b', 'audience', 'phone', 'phone', '+21690000991', 'scheduled_at', v_later))).id;
  v_latest  := (public.staff_create_push_campaign(jsonb_build_object('title', 't', 'body', 'b', 'audience', 'latest', 'scheduled_at', v_later))).id;
  v_ios     := (public.staff_create_push_campaign(jsonb_build_object('title', 't', 'body', 'b', 'audience', 'ios', 'scheduled_at', v_later))).id;
  v_android := (public.staff_create_push_campaign(jsonb_build_object('title', 't', 'body', 'b', 'audience', 'android', 'scheduled_at', v_later))).id;

  -- phone: exactly the two devices registered against that number.
  select count(*) into v_n from public.push_campaign_targets(v_phone);
  assert v_n = 2, format('a number with two devices has %s targets', v_n);

  -- latest: ONE device, and it is the one seen most recently.
  select count(*) into v_n from public.push_campaign_targets(v_latest);
  assert v_n = 1, format('«latest» went to %s devices', v_n);
  assert exists (select 1 from public.push_campaign_targets(v_latest) t where t.token = 'ExponentPushToken[test099a]'),
    '«latest» did not pick the device seen most recently';

  -- android and ios each hold their own and not the other's.
  assert exists (select 1 from public.push_campaign_targets(v_android) t where t.token = 'ExponentPushToken[test099c]'), 'android lost its device';
  assert not exists (select 1 from public.push_campaign_targets(v_android) t where t.token = 'ExponentPushToken[test099b]'), 'android reached an ios device';
  assert exists (select 1 from public.push_campaign_targets(v_ios) t where t.token = 'ExponentPushToken[test099d]'), 'ios lost its device';
  assert not exists (select 1 from public.push_campaign_targets(v_ios) t where t.token = 'ExponentPushToken[test099a]'), 'ios reached an android device';

  -- all: every active device, and a RETIRED token is never retried.
  assert exists (select 1 from public.push_campaign_targets(v_all) t where t.token = 'ExponentPushToken[test099c]'), '«all» missed a device';
  update public.push_tokens set disabled_at = now(), disabled_reason = 'DeviceNotRegistered' where token = 'ExponentPushToken[test099c]';
  assert not exists (select 1 from public.push_campaign_targets(v_all) t where t.token = 'ExponentPushToken[test099c]'),
    'a retired device was still a target';

  -- 4 · THE DISPATCHER'S THREE CALLS. push.enabled off: nothing is handed out, however due.
  update public.settings set value = to_jsonb(false) where key = 'push.enabled';
  v_row := public.staff_create_push_campaign('{"title":"t","body":"b","audience":"phone","phone":"+21690000991"}'::jsonb);
  assert (select count(*) from public.claim_push_campaigns(20) c where c.id = v_row.id) = 0,
    'a campaign was claimed while push.enabled is off';

  update public.settings set value = to_jsonb(true) where key = 'push.enabled';
  assert (select count(*) from public.claim_push_campaigns(20) c where c.id = v_row.id) = 1, 'a due campaign was not claimed';
  select c.status into v_status from public.push_campaigns c where c.id = v_row.id;
  assert v_status = 'sending', format('a claimed campaign is %s', v_status);
  assert (select c.attempts from public.push_campaigns c where c.id = v_row.id) = 1, 'a claim did not count an attempt';
  assert (select count(*) from public.claim_push_campaigns(20) c where c.id = v_row.id) = 0, 'a campaign in flight was claimed twice';

  perform public.finish_push_campaign(v_row.id, 2, 0, null);
  select c.status into v_status from public.push_campaigns c where c.id = v_row.id;
  assert v_status = 'sent', format('a campaign two devices accepted is %s', v_status);
  assert (select c.sent_at from public.push_campaigns c where c.id = v_row.id) is not null, 'a sent campaign has no sent_at';

  -- none accepted → failed, with the reason kept.
  v_row := public.staff_create_push_campaign('{"title":"t","body":"b","audience":"phone","phone":"+21690000991"}'::jsonb);
  perform public.claim_push_campaigns(20);
  perform public.finish_push_campaign(v_row.id, 0, 2, 'DeviceNotRegistered');
  select c.status into v_status from public.push_campaigns c where c.id = v_row.id;
  assert v_status = 'failed', format('a campaign no device accepted is %s', v_status);
  assert (select c.error from public.push_campaigns c where c.id = v_row.id) = 'DeviceNotRegistered', 'the reason was lost';

  -- A RUN THAT DIED: a campaign `sending` for ten minutes goes back and is claimed again.
  v_row := public.staff_create_push_campaign('{"title":"t","body":"b","audience":"phone","phone":"+21690000991"}'::jsonb);
  perform public.claim_push_campaigns(20);
  update public.push_campaigns set scheduled_at = now() - interval '11 minutes' where id = v_row.id;
  assert (select count(*) from public.claim_push_campaigns(20) c where c.id = v_row.id) = 1, 'a stuck campaign was never handed out again';
  assert (select c.attempts from public.push_campaigns c where c.id = v_row.id) = 2, 'the second claim did not count';

  -- 5 · CANCEL: only what has not left yet.
  v_row := public.staff_create_push_campaign(jsonb_build_object('title', 't', 'body', 'b', 'audience', 'all',
    'scheduled_at', (now() + interval '2 hours')::text));
  v_row := public.staff_cancel_push_campaign(v_row.id, 'test');
  assert v_row.status = 'cancelled', 'a scheduled campaign was not cancelled';
  begin
    perform public.staff_cancel_push_campaign(v_row.id, 'again');
    assert false, 'a cancelled campaign was cancelled twice';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'push_not_cancellable', sqlerrm;
  end;
  assert (select count(*) from public.claim_push_campaigns(20) c where c.id = v_row.id) = 0, 'a cancelled campaign was sent';

  -- 6 · THE DEVICE LIST SHOWS NO TOKEN AND NO FULL NUMBER.
  v_devices := public.staff_push_devices();
  assert (v_devices->>'active')::integer >= 3, 'the device count lost the active devices';
  assert position('ExponentPushToken' in v_devices::text) = 0, 'the device list carries a push token';
  assert position('21690000991' in v_devices::text) = 0, 'the device list carries a whole phone number';
  assert position('•••991' in v_devices::text) > 0, 'the device list does not hint at the number';
end $$;
