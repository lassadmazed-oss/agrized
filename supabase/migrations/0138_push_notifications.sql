-- 0138 · Push notifications: a device is a row, the message is the same outbox, and `push` is a third channel.
--
-- Test: supabase/tests/085_push_notifications.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0138_push_notifications.sql supabase/tests/085_push_notifications.sql
--
-- WHY THIS IS NOT A NEW SYSTEM. There is already a queue that holds a message, who it is for, what rendered
-- it, how many times it has been tried and what went wrong — public.notification_outbox, since 0003 — and a
-- table of the owner's wordings beside it. `whatsapp` is already a second channel in both. A separate
-- «push_queue» would mean two places to look when a client says they were not told, two retry policies, and
-- two definitions of «sent». So push is a third value in the same two checks.
--
-- WHAT A PUSH NEEDS THAT AN SMS DOES NOT. A title. An SMS is one run of text; a notification is a bold line
-- and a quieter one under it, and a notification with no title shows the app's name, which says nothing about
-- why the phone buzzed. So `title_ar` joins the templates, and a push template without one is refused by a
-- constraint rather than by a reviewer.
--
-- A TITLE CARRIES NO VARIABLES, deliberately. The outbox stores the rendered body and not the variables that
-- made it, so a title rendered later could not be filled. Keeping titles constant means the dispatcher can
-- read the template at send time and never needs the vars again. «قسطك قرّب» is a good title; «قسطك 3/12 بـ
-- 420 د» is a body.
--
-- ADDRESSED BY PHONE, NOT BY DEVICE. An outbox row says «tell this person», and a person is a phone number
-- here as everywhere else in this schema. One row goes out, and the dispatcher fans it to every device that
-- phone has registered — two phones, a phone and a tablet, or none, in which case the row is skipped rather
-- than failed: having no app installed is not an error.

-- ---------------------------------------------------------------------------
-- The channel
-- ---------------------------------------------------------------------------

alter table public.message_templates drop constraint if exists message_templates_channel_check;
alter table public.message_templates add constraint message_templates_channel_check
  check (channel in ('sms', 'whatsapp', 'push'));

alter table public.notification_outbox drop constraint if exists notification_outbox_channel_check;
alter table public.notification_outbox add constraint notification_outbox_channel_check
  check (channel in ('sms', 'whatsapp', 'push'));

alter table public.message_templates add column if not exists title_ar text;
alter table public.message_templates add column if not exists title_fr text;

comment on column public.message_templates.title_ar is
  'The bold first line of a push notification. Required for a push template, unused by sms and whatsapp. It carries no {variables}: the outbox keeps the rendered body and not the values, so a title is read straight from here when the message is sent.';

alter table public.message_templates drop constraint if exists message_templates_push_needs_title;
alter table public.message_templates add constraint message_templates_push_needs_title
  check (channel <> 'push' or nullif(btrim(coalesce(title_ar, '')), '') is not null);

-- ---------------------------------------------------------------------------
-- The devices
-- ---------------------------------------------------------------------------

/*
 * One row per installation, keyed by the token Expo hands the app.
 *
 * `person_id` IS A CONVENIENCE AND NOT THE ADDRESS. It is filled when the phone already belongs to somebody
 * in public.persons, so the Back Office can answer «does this client have the app?». The dispatcher still
 * matches on the phone, because a token can be registered before the person exists — a visitor installs the
 * app, allows notifications and only later sends a demand — and that device must still receive what is sent
 * to their number the moment they do.
 *
 * `disabled_at` RATHER THAN DELETE. Expo answers DeviceNotRegistered when an app has been uninstalled or the
 * token rotated; the row is kept with the reason so the same token is not retried forever and so the history
 * of what was sent still resolves.
 */
create table if not exists public.push_tokens (
  token            text primary key,
  person_id        uuid references public.persons (id) on delete set null,
  phone_e164       text,
  platform         text not null check (platform in ('ios', 'android')),
  app_version      text,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  disabled_at      timestamptz,
  disabled_reason  text
);

create index if not exists push_tokens_phone_idx on public.push_tokens (phone_e164) where disabled_at is null;
create index if not exists push_tokens_person_idx on public.push_tokens (person_id) where disabled_at is null;

comment on table public.push_tokens is
  'The devices that have the app installed and have allowed notifications. Written only through register_push_token (service_role). A token is a device address, so nothing in the browser may read this table.';

/*
 * NOTHING READS THIS FROM A BROWSER. A push token is enough to send a notification to somebody's phone, so
 * it is treated like a phone number and not like a preference: RLS on, no policy for anon or authenticated,
 * and the grants taken away. The two functions below are the only way in, and the website calls them with
 * the service role from the server — never the app, which holds the anon key and is readable by whoever
 * installs it.
 */
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registering a device
-- ---------------------------------------------------------------------------

/*
 * The app asks the operating system, the operating system gives Expo a token, and the app POSTs it to the
 * website, which calls this with the service role.
 *
 * THE TOKEN SHAPE IS CHECKED because it is the one field a client fully controls, and an unchecked string
 * here would let anyone fill this table with rubbish the dispatcher then tries to send to. Expo issues
 * `ExponentPushToken[...]` and `ExpoPushToken[...]`; nothing else is accepted.
 *
 * THE PHONE IS TAKEN AS GIVEN. It arrives already in E.164 from the endpoint, which runs it through the same
 * normalizePhone() the public forms use. Normalising again here, in SQL, would be a second implementation of
 * a rule that has one home.
 */
create or replace function public.register_push_token(
  p_token       text,
  p_platform    text,
  p_phone       text default null,
  p_app_version text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token  text := btrim(coalesce(p_token, ''));
  v_phone  text := nullif(btrim(coalesce(p_phone, '')), '');
  v_person uuid;
begin
  if v_token !~ '^Exp(o|onent)PushToken\[[A-Za-z0-9_\-]+\]$' then
    raise exception 'push_token_invalid' using hint = 'Expo issues ExponentPushToken[…]; nothing else is stored.';
  end if;

  if coalesce(p_platform, '') not in ('ios', 'android') then
    raise exception 'push_platform_invalid' using hint = 'ios or android.';
  end if;

  -- The newest person on that number, the same tie-break the rest of the intake uses.
  if v_phone is not null then
    select p.id into v_person from public.persons p
     where p.phone_e164 = v_phone and p.archived_at is null
     order by p.created_at desc limit 1;
  end if;

  insert into public.push_tokens (token, person_id, phone_e164, platform, app_version)
  values (v_token, v_person, v_phone, p_platform, nullif(btrim(coalesce(p_app_version, '')), ''))
  on conflict (token) do update
     set person_id       = coalesce(excluded.person_id, public.push_tokens.person_id),
         -- A device that signs in as somebody else must stop receiving the previous person's messages.
         phone_e164      = coalesce(excluded.phone_e164, public.push_tokens.phone_e164),
         platform        = excluded.platform,
         app_version     = coalesce(excluded.app_version, public.push_tokens.app_version),
         last_seen_at    = now(),
         disabled_at     = null,
         disabled_reason = null;

  return jsonb_build_object('ok', true, 'linked', v_person is not null);
end $$;

revoke execute on function public.register_push_token(text, text, text, text) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text, text, text) to service_role;

comment on function public.register_push_token(text, text, text, text) is
  'Stores the Expo push token of one installation, linking it to a person when the phone is already known. service_role only: the app reaches it through /api/mobile/push/register on the website.';

/*
 * Expo answers DeviceNotRegistered for an app that has been uninstalled, and that answer is the only
 * reliable signal a token is dead. The dispatcher calls this so the next run skips it instead of spending a
 * request and a failure on it every few minutes, forever.
 */
create or replace function public.disable_push_token(p_token text, p_reason text default null)
returns void
language sql security definer set search_path = '' as $$
  update public.push_tokens
     set disabled_at = now(), disabled_reason = left(coalesce(p_reason, 'disabled'), 200)
   where token = p_token and disabled_at is null;
$$;

revoke execute on function public.disable_push_token(text, text) from public, anon, authenticated;
grant execute on function public.disable_push_token(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Sending one
-- ---------------------------------------------------------------------------

/*
 * The twin of app.enqueue_message (0003, rewritten in 0109), for push.
 *
 * It is a separate function rather than a branch inside that one because the two differ in what they refuse:
 * enqueue_message writes a row for any phone, because an SMS reaches a phone that has never heard of this
 * app. A push can only reach a device that registered, so this answers how many devices it found — 0 is a
 * normal answer and the caller may want to fall back to SMS.
 */
create or replace function app.enqueue_push(
  p_template  text,
  p_to        text,
  p_vars      jsonb,
  p_entity    text default null,
  p_entity_id uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_template public.message_templates;
  v_devices  integer;
begin
  select * into v_template from public.message_templates
   where key = p_template and channel = 'push' and is_active;
  if not found then
    return 0;
  end if;

  select count(*)::integer into v_devices from public.push_tokens
   where phone_e164 = p_to and disabled_at is null;
  if v_devices = 0 then
    return 0;
  end if;

  -- One row for the person, not one per device: the dispatcher fans out. Two devices are not two messages
  -- in the history of what this client was told.
  insert into public.notification_outbox (channel, to_phone_e164, template_key, body, related_entity, related_id)
  values ('push', p_to, p_template, app.render_template(v_template.body_ar, coalesce(p_vars, '{}'::jsonb)),
          p_entity, p_entity_id);

  return v_devices;
end $$;

revoke execute on function app.enqueue_push(text, text, jsonb, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Proving the pipe
-- ---------------------------------------------------------------------------

insert into public.message_templates (key, channel, title_ar, body_ar, description_ar, variables, is_active) values
  ('push.test', 'push', 'AgriZed',
   'تجربة إشعار. إذا وصلك هذا، الإشعارات تخدم على هذا التلفون.',
   'إشعار تجريبي يبعثو الفريق من الباك أوفيس باش يتثبّت إلي الإشعارات توصل. ما يتبعثش للحرفاء وحدو.',
   '{}', true)
on conflict (key) do nothing;

/*
 * A staff member sends one to a number and watches it arrive, which is the only honest way to know the chain
 * works end to end: the operating system's permission, the token, this table, the outbox, the dispatcher and
 * Expo. Everything else is a test of one link.
 */
create or replace function public.staff_send_push_test(p_phone text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
  v_devices integer;
begin
  if not app.is_staff() then
    raise exception 'forbidden';
  end if;
  if v_phone is null then
    raise exception 'phone_required' using hint = 'الرقم فارغ.';
  end if;

  v_devices := app.enqueue_push('push.test', v_phone, '{}'::jsonb, 'push_test', null);
  return jsonb_build_object('ok', v_devices > 0, 'devices', v_devices);
end $$;

revoke execute on function public.staff_send_push_test(text) from public, anon;
grant execute on function public.staff_send_push_test(text) to authenticated;

comment on function public.staff_send_push_test(text) is
  'Queues the push.test notification to every device registered against one phone number, so staff can prove notifications arrive. Returns how many devices it found; 0 means that number has not installed the app or did not allow notifications.';
