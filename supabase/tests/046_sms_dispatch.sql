-- Tests for the SMS dispatch calls (0073).

do $$
declare
  v_id       uuid;
  v_claimed  integer;
  v_status   public.notification_status;
  v_attempts integer;
begin
  -- The switch and the budget are business values in settings, internal, in the sms group.
  assert exists (
    select 1 from public.settings s
    where s.key = 'sms.enabled' and s.value_type = 'boolean' and s.group_key = 'sms' and not s.is_public
  ), 'sms.enabled is an internal boolean setting in the sms group';

  assert exists (
    select 1 from public.settings s
    where s.key = 'sms.max_attempts' and s.value_type = 'integer' and s.group_key = 'sms' and not s.is_public
  ), 'sms.max_attempts is an internal integer setting in the sms group';

  insert into public.notification_outbox (channel, to_phone_e164, body)
  values ('sms', '+21698000001', 'رسالة اختبار')
  returning id into v_id;

  -- Switch off: the queue holds, nothing is handed out.
  update public.settings set value = to_jsonb(false) where key = 'sms.enabled';
  select count(*) into v_claimed from public.claim_notifications(50);
  assert v_claimed = 0, 'nothing is claimed while sms.enabled is false';

  select o.status into v_status from public.notification_outbox o where o.id = v_id;
  assert v_status = 'pending', 'the message is still waiting in the queue';

  -- Switch on: the row is handed out exactly once, already marked sending.
  update public.settings set value = to_jsonb(true) where key = 'sms.enabled';
  select count(*) into v_claimed from public.claim_notifications(50) c where c.id = v_id;
  assert v_claimed = 1, 'the due message is claimed once the switch is on';

  select o.status, o.attempts into v_status, v_attempts from public.notification_outbox o where o.id = v_id;
  assert v_status = 'sending', 'a claimed message is marked sending before the request leaves';
  assert v_attempts = 1, 'claiming counts an attempt';

  -- A second run must not see a row that is already in flight.
  select count(*) into v_claimed from public.claim_notifications(50) c where c.id = v_id;
  assert v_claimed = 0, 'a message in flight is never handed to a second run';

  -- A failure goes back to the queue with a later time, not straight to failed.
  perform public.mark_notification_failed(v_id, 'provider refused', 'winsms');
  select o.status into v_status from public.notification_outbox o where o.id = v_id;
  assert v_status = 'pending', 'a failure inside the budget returns the message to the queue';

  assert (select o.last_error from public.notification_outbox o where o.id = v_id) = 'provider refused',
    'the failure reason is kept';
  assert (select o.scheduled_at from public.notification_outbox o where o.id = v_id) > now(),
    'a returned message waits before the next attempt';

  -- Budget spent: the message is given up on.
  update public.notification_outbox set attempts = 99, status = 'sending', scheduled_at = now() where id = v_id;
  perform public.mark_notification_failed(v_id, 'provider refused again', 'winsms');
  select o.status into v_status from public.notification_outbox o where o.id = v_id;
  assert v_status = 'failed', 'a message past the attempt budget is marked failed';

  -- Success stamps the provider and the time.
  update public.notification_outbox set status = 'sending' where id = v_id;
  perform public.mark_notification_sent(v_id, 'winsms', 'MSG-1');
  select o.status into v_status from public.notification_outbox o where o.id = v_id;
  assert v_status = 'sent', 'a sent message is marked sent';
  assert (select o.provider from public.notification_outbox o where o.id = v_id) = 'winsms',
    'the provider that carried the message is recorded';
  assert (select o.provider_message_id from public.notification_outbox o where o.id = v_id) = 'MSG-1',
    'the provider message id is recorded';
  assert (select o.sent_at from public.notification_outbox o where o.id = v_id) is not null,
    'the send time is recorded';
  assert (select o.last_error from public.notification_outbox o where o.id = v_id) is null,
    'a success clears the previous error';

  -- A run that dies mid-flight leaves nothing stuck for ever.
  update public.notification_outbox
     set status = 'sending', sent_at = null, scheduled_at = now() - interval '30 minutes'
   where id = v_id;
  assert public.release_stuck_notifications() >= 1, 'an abandoned in-flight message goes back to the queue';
  select o.status into v_status from public.notification_outbox o where o.id = v_id;
  assert v_status = 'pending', 'the released message waits in the queue again';

  delete from public.notification_outbox where id = v_id;
  update public.settings set value = to_jsonb(false) where key = 'sms.enabled';
end $$;

-- The dispatch calls belong to the server alone: no visitor and no signed-in account may run them.
do $$
begin
  assert not has_function_privilege('anon', 'public.claim_notifications(integer)', 'execute'),
    'anon cannot claim messages';
  assert not has_function_privilege('authenticated', 'public.claim_notifications(integer)', 'execute'),
    'a signed-in account cannot claim messages';
  assert not has_function_privilege('authenticated', 'public.mark_notification_sent(uuid, text, text)', 'execute'),
    'a signed-in account cannot mark messages sent';
  assert has_function_privilege('service_role', 'public.claim_notifications(integer)', 'execute'),
    'the server can claim messages';
end $$;
