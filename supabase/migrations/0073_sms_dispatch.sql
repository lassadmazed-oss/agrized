-- SMS dispatch (owner, 2026-09-22): the queue has been filling since 0003 and nothing has ever drained it.
-- 0037 registered the sender («AGRIZED») and the provider (WinSMS); this migration adds the three calls the
-- sender needs, plus the switch that turns sending on and the retry budget. Spec: LEAD-11..12, D-05.
--
-- Why claim-then-mark instead of "select pending, send, update": two runs that overlap would otherwise read the
-- same row and send the same message twice. `for update skip locked` hands each row to exactly one run, and the
-- row is already marked 'sending' before the request leaves the server.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('sms.enabled', to_jsonb(false), 'boolean', 'sms', 'تفعيل إرسال الرسائل',
   'كي يكون مطفي، الرسائل تتسجّل في الصف وما تخرجش. ما يتشعّلش قبل ما يكون مفتاح المزوّد موجود في البيئة واسم المرسل مقبول عندو.',
   false, 30),
  ('sms.max_attempts', to_jsonb(5), 'integer', 'sms', 'عدد المحاولات القصوى',
   'قدّاش من مرّة نعاودو نبعثو رسالة قبل ما نعتبروها فاشلة. بين كل محاولة والأخرى الانتظار يطول (3، 9، 27… دقيقة).',
   false, 40),
  ('sms.batch_size', to_jsonb(20), 'integer', 'sms', 'عدد الرسائل في الدفعة',
   'قدّاش من رسالة ناخذو في كل تشغيلة. نخلّيوه صغير باش التشغيلة ما تطوّلش.',
   false, 50)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Claim: hand a batch of due messages to one runner, already marked 'sending'.
-- ---------------------------------------------------------------------------

create or replace function public.claim_notifications(p_limit integer default null)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := coalesce((select (s.value #>> '{}')::boolean from public.settings s where s.key = 'sms.enabled'), false);
  v_max     integer := coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = 'sms.max_attempts'), 5);
  v_batch   integer := coalesce(p_limit, (select (s.value #>> '{}')::integer from public.settings s where s.key = 'sms.batch_size'), 20);
begin
  -- The switch is a business value, so it lives in settings and is read here rather than in the code.
  if not v_enabled then
    return;
  end if;

  return query
  with due as (
    select o.id
      from public.notification_outbox o
     where o.status in ('pending', 'failed')
       and o.scheduled_at <= now()
       and o.attempts < v_max
     order by o.scheduled_at
     limit greatest(1, least(v_batch, 100))
       for update skip locked
  )
  update public.notification_outbox o
     set status       = 'sending',
         attempts     = o.attempts + 1,
         -- scheduled_at doubles as "picked up at" while a row is in flight, so a run that dies can be spotted.
         scheduled_at = now()
    from due
   where o.id = due.id
  returning o.*;
end $$;

revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Mark sent
-- ---------------------------------------------------------------------------

create or replace function public.mark_notification_sent(
  p_id uuid,
  p_provider text,
  p_provider_message_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox
     set status              = 'sent',
         sent_at             = now(),
         provider            = p_provider,
         provider_message_id = p_provider_message_id,
         last_error          = null
   where id = p_id
     and status = 'sending';
end $$;

revoke execute on function public.mark_notification_sent(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_notification_sent(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Mark failed: back to the queue with a longer wait, or given up on once the budget is spent.
-- ---------------------------------------------------------------------------

create or replace function public.mark_notification_failed(
  p_id uuid,
  p_error text,
  p_provider text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer := coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = 'sms.max_attempts'), 5);
begin
  update public.notification_outbox o
     set status       = case when o.attempts >= v_max then 'failed'::public.notification_status
                             else 'pending'::public.notification_status end,
         last_error   = left(coalesce(p_error, 'unknown error'), 500),
         provider     = coalesce(p_provider, o.provider),
         scheduled_at = case when o.attempts >= v_max then o.scheduled_at
                             else now() + make_interval(mins => least(power(3, o.attempts)::integer, 1440)) end
   where o.id = p_id
     and o.status = 'sending';
end $$;

revoke execute on function public.mark_notification_failed(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_notification_failed(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Release: a runner that dies mid-flight leaves rows stuck on 'sending'. Anything older than 15 minutes
-- never got an answer from the provider, so it goes back in the queue.
-- ---------------------------------------------------------------------------

create or replace function public.release_stuck_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notification_outbox
     set status     = 'pending',
         last_error = 'تشغيلة سابقة ما كمّلتش. رجّعنا الرسالة للصف.'
   where status = 'sending'
     and scheduled_at < now() - interval '15 minutes'
     and sent_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.release_stuck_notifications() from public, anon, authenticated;
grant execute on function public.release_stuck_notifications() to service_role;
