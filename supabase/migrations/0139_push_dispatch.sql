-- 0139 · The SMS dispatcher must not claim a push, and the push dispatcher needs the devices to send to.
--
-- Test: supabase/tests/086_push_dispatch.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0139_push_dispatch.sql supabase/tests/086_push_dispatch.sql
--
-- THE FAULT THIS CLOSES, FOUND BEFORE IT SHIPPED. 0138 put push into public.notification_outbox, which is
-- right — one queue, one history, one definition of «sent». But public.claim_notifications (0073) takes the
-- oldest due rows with no regard for the channel, and src/lib/sms.ts hands everything it is given to WinSMS.
-- So the first push ever queued would have been sent as a text message: the body, with no title, to the
-- client's phone, off the SMS credit, and marked sent. The queue was shared before the dispatchers were.
--
-- So the claim is split by channel. `claim_notifications` keeps its name and its signature — src/lib/sms.ts
-- and three tests call it — and simply stops seeing push. `claim_push_notifications` is its twin, with its
-- own switch, its own batch size and its own retry ceiling, because a notification that fails is not an SMS
-- that fails: it costs nothing, it can be retried sooner, and «the device is gone» is an answer rather than
-- an error.

-- ---------------------------------------------------------------------------
-- The switch, the ceiling and the batch — the owner's, like the SMS ones
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('push.enabled', to_jsonb(true), 'boolean', 'sms', 'تفعيل الإشعارات',
   'كي يكون مطفي، الإشعارات تتسجّل في الصف وما تخرجش للتلفونات. الإشعارات ما عندهاش تكلفة ولا رصيد، على خلاف الرسائل القصيرة.',
   false, 60),
  ('push.max_attempts', to_jsonb(3), 'integer', 'sms', 'عدد محاولات الإشعار',
   'قدّاش من مرّة نعاودو نبعثو إشعار قبل ما نعتبروه فاشل. أقل من الرسائل: كي التلفون يكون مطفي، Expo تحتفظ بالإشعار وتوصلو كي يولّي يخدم.',
   false, 70),
  ('push.batch_size', to_jsonb(50), 'integer', 'sms', 'عدد الإشعارات في الدفعة',
   'قدّاش من إشعار ناخذو في كل تشغيلة. أكبر من دفعة الرسائل: Expo تقبل مية إشعار في طلب واحد.',
   false, 80)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The SMS claim stops seeing push
-- ---------------------------------------------------------------------------

/*
 * The body of 0073's function, with one line added. It is repeated in full rather than patched because a
 * `create or replace` has to carry the whole definition, and because the next reader should be able to read
 * what runs without opening two files.
 */
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
       -- 0139: a notification is not a text message and this dispatcher only speaks to WinSMS.
       and o.channel <> 'push'
     order by o.scheduled_at
     limit greatest(1, least(v_batch, 100))
       for update skip locked
  )
  update public.notification_outbox o
     set status       = 'sending',
         attempts     = o.attempts + 1,
         scheduled_at = now()
    from due
   where o.id = due.id
  returning o.*;
end $$;

revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

-- ---------------------------------------------------------------------------
-- The push claim
-- ---------------------------------------------------------------------------

create or replace function public.claim_push_notifications(p_limit integer default null)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := coalesce((select (s.value #>> '{}')::boolean from public.settings s where s.key = 'push.enabled'), false);
  v_max     integer := coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = 'push.max_attempts'), 3);
  v_batch   integer := coalesce(p_limit, (select (s.value #>> '{}')::integer from public.settings s where s.key = 'push.batch_size'), 50);
begin
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
       and o.channel = 'push'
     order by o.scheduled_at
     limit greatest(1, least(v_batch, 100))
       for update skip locked
  )
  update public.notification_outbox o
     set status       = 'sending',
         attempts     = o.attempts + 1,
         scheduled_at = now()
    from due
   where o.id = due.id
  returning o.*;
end $$;

revoke execute on function public.claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

comment on function public.claim_push_notifications(integer) is
  'Hands the dispatcher the push notifications that are due, marking them in flight. The twin of claim_notifications, which since 0139 leaves push alone.';

-- ---------------------------------------------------------------------------
-- Who to send it to, and with what title
-- ---------------------------------------------------------------------------

/*
 * An outbox row says «tell this person»; this turns that into the devices to speak to, and carries the
 * template's title with them so the dispatcher makes one call rather than one per row.
 *
 * THE TITLE COMES FROM THE TEMPLATE AND NOT FROM THE ROW because the outbox keeps a rendered body and not
 * the values that rendered it — 0138 says so where the column is declared. A title with a {variable} in it
 * could not be filled here, which is exactly why the constraint there keeps titles constant.
 */
create or replace function public.push_delivery(p_id uuid)
returns table (token text, title text, body text)
language sql
security definer
set search_path = ''
as $$
  select d.token,
         coalesce(nullif(btrim(mt.title_ar), ''), 'AgriZed'),
         o.body
    from public.notification_outbox o
    join public.push_tokens d
      on d.phone_e164 = o.to_phone_e164 and d.disabled_at is null
    left join public.message_templates mt on mt.key = o.template_key
   where o.id = p_id and o.channel = 'push';
$$;

revoke execute on function public.push_delivery(uuid) from public, anon, authenticated;
grant execute on function public.push_delivery(uuid) to service_role;

comment on function public.push_delivery(uuid) is
  'Every device one queued push has to reach, with the title from its template. service_role only: these are device addresses.';
