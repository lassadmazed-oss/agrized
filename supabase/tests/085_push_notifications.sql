-- 0138 · push is a third channel on the queue that already exists, a device is a row only the service role
-- can write, and a notification that cannot reach anybody is skipped rather than failed.

-- ---------------------------------------------------------------------------
-- 1 · The channel, and the title a push cannot do without
-- ---------------------------------------------------------------------------

do $$
declare
  v_err text;
begin
  -- Both checks take the new value; neither forgot the two that were already there.
  insert into public.message_templates (key, channel, title_ar, body_ar)
  values ('zz.test.push', 'push', 'عنوان', 'نص');
  insert into public.message_templates (key, channel, body_ar) values ('zz.test.sms', 'sms', 'نص');
  insert into public.message_templates (key, channel, body_ar) values ('zz.test.wa', 'whatsapp', 'نص');

  -- A push with no title would arrive showing only the app's name, which says nothing about why the phone
  -- buzzed. The database refuses it rather than a reviewer catching it.
  begin
    insert into public.message_templates (key, channel, body_ar) values ('zz.test.untitled', 'push', 'نص');
    raise exception 'a push template with no title was accepted';
  exception
    when check_violation then null;
  end;

  -- …and an sms is not asked for one.
  assert exists (select 1 from public.message_templates where key = 'zz.test.sms' and title_ar is null),
    'the title constraint is reaching sms templates';

  assert exists (select 1 from public.message_templates where key = 'push.test' and channel = 'push'
                   and nullif(btrim(title_ar), '') is not null),
    'push.test is missing or has no title, so staff cannot prove the pipe works';

  raise notice 'channel: push accepted on both tables, a titleless push refused, sms untouched';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Registering a device
-- ---------------------------------------------------------------------------

do $$
declare
  v_status uuid;
  v_person uuid;
  v_out    jsonb;
  v_err    text;
begin
  select id into v_status from public.lead_statuses order by sort_order limit 1;
  insert into public.persons (full_name, phone_e164, status_id)
  values ('صاحب تلفون للاختبار', '+21655000185', v_status)
  returning id into v_person;

  -- The one field a client fully controls is checked, because an unchecked string here is a row the
  -- dispatcher later tries to send to.
  foreach v_err in array array['', 'nonsense', 'ExponentPushToken', 'ExponentPushToken[]', '<script>'] loop
    begin
      perform public.register_push_token(v_err, 'ios', '+21655000185');
      raise exception 'register_push_token accepted the token %', coalesce(nullif(v_err, ''), '(empty)');
    exception
      when others then
        get stacked diagnostics v_err = message_text;
        assert v_err = 'push_token_invalid', 'expected push_token_invalid, got ' || v_err;
    end;
  end loop;

  begin
    perform public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'windows', '+21655000185');
    raise exception 'register_push_token accepted a platform that does not exist';
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      assert v_err = 'push_platform_invalid', 'expected push_platform_invalid, got ' || v_err;
  end;

  -- A real one links to the person already on that number.
  v_out := public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios', '+21655000185', '1.0.0');
  assert (v_out ->> 'ok')::boolean, 'register_push_token refused a valid token';
  assert (v_out ->> 'linked')::boolean, 'the token was not linked to the person on that number';
  assert exists (select 1 from public.push_tokens
                  where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]' and person_id = v_person),
    'push_tokens did not record the person';

  -- A token with no phone is still kept: somebody installs the app and allows notifications before they
  -- ever send a demand, and that device must work the day they do.
  v_out := public.register_push_token('ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]', 'android');
  assert (v_out ->> 'ok')::boolean, 'an anonymous installation was refused';
  assert not (v_out ->> 'linked')::boolean, 'a token with no phone claimed to be linked';

  -- Registering again is the app re-opening, not a second device.
  perform public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios', '+21655000185', '1.0.1');
  assert (select count(*) from public.push_tokens
           where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') = 1,
    'registering the same token twice made two rows';
  assert (select app_version from public.push_tokens
           where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') = '1.0.1',
    'the app version did not move with the device';

  raise notice 'devices: the token shape and platform are checked, a known phone links, a re-open is one row';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · A dead token stops being retried, and comes back if the app does
-- ---------------------------------------------------------------------------

do $$
begin
  perform public.disable_push_token('ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]', 'DeviceNotRegistered');
  assert (select disabled_at is not null from public.push_tokens
           where token = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]'),
    'disable_push_token did not disable the token';
  assert (select disabled_reason from public.push_tokens
           where token = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]') = 'DeviceNotRegistered',
    'the reason was not kept, so nobody can tell why it stopped';

  -- Re-installing the app registers the same token again, and it must wake up rather than stay silent.
  perform public.register_push_token('ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]', 'android', '+21655000185');
  assert (select disabled_at is null from public.push_tokens
           where token = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]'),
    'a re-registered device stayed disabled';

  raise notice 'a dead token is kept with its reason, and a re-install revives it';
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Queueing one
-- ---------------------------------------------------------------------------

do $$
declare
  v_devices integer;
  v_row     public.notification_outbox;
begin
  -- Nobody at that number has the app: 0 devices, and NOTHING queued. A row that can reach no one would sit
  -- in the outbox failing forever and would read, to anyone looking, as a message this client was sent.
  v_devices := app.enqueue_push('push.test', '+21655000999', '{}'::jsonb, 'push_test', null);
  assert v_devices = 0, format('expected no devices for an unknown number, got %s', v_devices);
  assert not exists (select 1 from public.notification_outbox where to_phone_e164 = '+21655000999'),
    'a push was queued for a number with no device';

  -- Two devices on one number is still one message in this client's history.
  v_devices := app.enqueue_push('push.test', '+21655000185', '{}'::jsonb, 'push_test', null);
  assert v_devices = 2, format('expected both devices on that number, got %s', v_devices);
  select * into v_row from public.notification_outbox
   where to_phone_e164 = '+21655000185' and channel = 'push' order by created_at desc limit 1;
  assert found, 'nothing was queued for a number with devices';
  assert v_row.status = 'pending', 'a queued push did not start pending';
  assert v_row.template_key = 'push.test', 'the row lost which wording made it';
  assert v_row.body like '%تجربة%', 'the body was not rendered from the template';
  assert (select count(*) from public.notification_outbox
           where to_phone_e164 = '+21655000185' and channel = 'push') = 1,
    'two devices produced two outbox rows';

  -- An sms template cannot be sent as a push by naming it here.
  assert app.enqueue_push('installment.due_soon', '+21655000185', '{}'::jsonb, null, null) = 0,
    'an sms template was queued as a push';

  raise notice 'queue: no device means no row, two devices mean one row, an sms template is not a push';
end $$;

-- ---------------------------------------------------------------------------
-- 5 · Who may touch any of this
-- ---------------------------------------------------------------------------

do $$
declare
  v_err text;
begin
  -- A token is enough to send a notification to somebody's phone, so it is guarded like a phone number.
  foreach v_err in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(v_err, 'public.push_tokens', 'select'),
      v_err || ' can read the push tokens';
    assert not has_table_privilege(v_err, 'public.push_tokens', 'insert'),
      v_err || ' can write push tokens';
    assert not has_function_privilege(v_err, 'public.register_push_token(text, text, text, text)', 'execute'),
      v_err || ' can register a push token directly, bypassing the website';
    assert not has_function_privilege(v_err, 'public.disable_push_token(text, text)', 'execute'),
      v_err || ' can silence somebody else''s device';
    assert not has_function_privilege(v_err, 'app.enqueue_push(text, text, jsonb, text, uuid)', 'execute'),
      v_err || ' can queue a notification to any number';
  end loop;

  assert has_function_privilege('service_role', 'public.register_push_token(text, text, text, text)', 'execute'),
    'the website cannot register a token, so the app can never be reached';

  -- The staff test is for staff. This test is not signed in as any of them.
  begin
    perform public.staff_send_push_test('+21655000185');
    raise exception 'staff_send_push_test ran without a staff role';
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      assert v_err = 'forbidden', 'expected forbidden, got ' || v_err;
  end;

  raise notice 'privileges: the tokens are service_role only, and the staff test refuses a stranger';
end $$;
