-- 0152 · إشعارات التطبيق — what the owner writes by hand and sends to the phones that have the app.
--
-- Its test is supabase/tests/099_push_campaigns.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0152_push_campaigns.sql supabase/tests/099_push_campaigns.sql
--
-- THE OWNER'S REQUEST (2026-10-24): «add in the admin a page to manage the app notifications for the users, so I
-- can test and program and do a lot in between». 0138 and 0139 built the pipe for the notifications the SYSTEM
-- writes — a visit confirmed, an instalment due — and they address a PERSON: one outbox row, one phone number,
-- the devices that number has registered. That is the wrong shape for what is asked here, for two reasons.
--
--   1 · A VISITOR HAS NO NUMBER. A phone that installed the app and allowed notifications before sending a
--       demand sits in push_tokens with `phone_e164` null (0138 says so on purpose). A message to «everyone who
--       has the app» has to reach it, and the outbox cannot name it.
--   2 · A TEST HAS NO PERSON. The owner wants to press a button and see his own phone buzz. «The device that
--       opened the app a minute ago» is a perfectly good address for that and no outbox row can say it.
--
-- So a notification written by hand is its own thing — a CAMPAIGN — with its own table, and the dispatcher
-- (src/lib/push.ts, dispatchCampaigns) sends it by DEVICE. The outbox is untouched: nothing here changes what
-- the system sends or to whom.
--
-- WHO MAY WRITE ONE: admin and super_admin only (app.is_admin()). A message to every phone with the app is not
-- a desk's job, and the people a mistake would reach are the buyers.
--
-- NOTHING IS SENT FROM SQL. A row says «send this, to these, then»; the website reads due rows with the service
-- role and talks to Expo. `push.enabled` (0139) is honoured exactly as it is for the outbox: while it is off
-- a campaign stays scheduled and nothing leaves, so one switch stops every notification the product can send.

create table if not exists public.push_campaigns (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,

  -- What the phone shows. A lock screen is read by whoever holds the phone, so these are short on purpose, and
  -- the owner is told as much on the screen that writes them.
  title         text not null check (char_length(btrim(title)) between 1 and 60),
  body          text not null check (char_length(btrim(body)) between 1 and 240),

  -- Where a tap lands. NULL means «just open the app». The set is the one the app itself accepts
  -- (mobile/src/push.ts routeForNotification): the four tabs, the tracking screen, and one offer by its code.
  -- It is checked HERE as well, because a value the app would ignore is a tap that goes nowhere and a typo that
  -- nobody would ever see.
  route         text check (route is null or route ~ '^(/|/offers|/calculator|/account|/track|/offer/[A-Za-z0-9_-]{1,64})$'),

  -- Who it goes to.
  --   latest   the one device that was seen most recently — the owner's own phone, a minute after he opened the app
  --   phone    the devices registered against one number (phone_e164, below)
  --   all      every active device
  --   android | ios   every active device of one system
  audience      text not null check (audience in ('latest', 'phone', 'all', 'android', 'ios')),
  phone_e164    text check (phone_e164 is null or phone_e164 ~ '^\+[0-9]{8,15}$'),

  scheduled_at  timestamptz not null default now(),
  status        text not null default 'scheduled'
                  check (status in ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  attempts      integer not null default 0,
  sent_count    integer not null default 0,
  failed_count  integer not null default 0,
  error         text,
  sent_at       timestamptz,

  constraint push_campaigns_phone_audience check ((audience = 'phone') = (phone_e164 is not null))
);

create index if not exists push_campaigns_due_idx on public.push_campaigns (scheduled_at) where status = 'scheduled';
create index if not exists push_campaigns_recent_idx on public.push_campaigns (created_at desc);

comment on table public.push_campaigns is
  'Notifications the owner writes by hand and sends to devices (0152). Written only through staff_create_push_campaign and staff_cancel_push_campaign; sent by src/lib/push.ts dispatchCampaigns with the service role. Separate from notification_outbox, which addresses a person by phone number.';

drop trigger if exists push_campaigns_audit on public.push_campaigns;
create trigger push_campaigns_audit after insert or update or delete on public.push_campaigns
  for each row execute function app.audit_row_change();

-- Read by admins through RLS; nobody writes through a table grant. Every change is one of the functions below.
alter table public.push_campaigns enable row level security;
revoke all on public.push_campaigns from public, anon, authenticated;
grant select on public.push_campaigns to authenticated;

drop policy if exists push_campaigns_read on public.push_campaigns;
create policy push_campaigns_read on public.push_campaigns for select to authenticated using (app.is_admin());


-- ---------------------------------------------------------------------------
-- 1 · What the owner can do
-- ---------------------------------------------------------------------------

/**
 * Writes one campaign. `p` carries title, body, route, audience, phone, scheduled_at and a reason; each refusal
 * is a stable code the page turns into a sentence (src/lib/backoffice/push-campaigns.ts).
 *
 * IT REFUSES AN AUDIENCE OF NOBODY (`push_no_devices`) at the moment it is written, rather than accepting it and
 * failing later in a log nobody reads: the owner pressing «ابعث» to a number with no app on it should hear that
 * now, while he is looking at the screen.
 *
 * A TIME IN THE PAST is accepted up to a minute back (a clock a few seconds behind the server's is not a mistake)
 * and read as «now». Further than 90 days ahead is refused: nobody schedules a notification a year out and
 * means it.
 */
create or replace function public.staff_create_push_campaign(p jsonb) returns public.push_campaigns
language plpgsql security definer set search_path = '' as $$
declare
  v_title    text := btrim(coalesce(p->>'title', ''));
  v_body     text := btrim(coalesce(p->>'body', ''));
  v_route    text := nullif(btrim(coalesce(p->>'route', '')), '');
  v_audience text := coalesce(p->>'audience', '');
  v_phone    text := nullif(btrim(coalesce(p->>'phone', '')), '');
  v_when     timestamptz;
  v_devices  integer;
  v_row      public.push_campaigns;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(coalesce(nullif(btrim(coalesce(p->>'reason', '')), ''), 'إشعار من الإدارة'));

  if v_title = '' then raise exception 'push_title_required' using errcode = 'P0001'; end if;
  if char_length(v_title) > 60 then raise exception 'push_title_too_long' using errcode = 'P0001'; end if;
  if v_body = '' then raise exception 'push_body_required' using errcode = 'P0001'; end if;
  if char_length(v_body) > 240 then raise exception 'push_body_too_long' using errcode = 'P0001'; end if;

  if v_route is not null and v_route !~ '^(/|/offers|/calculator|/account|/track|/offer/[A-Za-z0-9_-]{1,64})$' then
    raise exception 'push_route_invalid' using errcode = 'P0001';
  end if;

  if v_audience not in ('latest', 'phone', 'all', 'android', 'ios') then
    raise exception 'push_audience_invalid' using errcode = 'P0001';
  end if;
  if v_audience = 'phone' then
    if v_phone is null then raise exception 'push_phone_required' using errcode = 'P0001'; end if;
    if v_phone !~ '^\+[0-9]{8,15}$' then raise exception 'push_phone_invalid' using errcode = 'P0001'; end if;
  else
    v_phone := null;
  end if;

  begin
    v_when := coalesce(nullif(p->>'scheduled_at', '')::timestamptz, now());
  exception when others then
    raise exception 'push_schedule_invalid' using errcode = 'P0001';
  end;
  if v_when < now() - interval '1 minute' then
    v_when := now();
  elsif v_when > now() + interval '90 days' then
    raise exception 'push_schedule_invalid' using errcode = 'P0001';
  end if;

  select count(*) into v_devices
  from public.push_tokens d
  where d.disabled_at is null
    and case v_audience
          when 'phone'   then d.phone_e164 = v_phone
          when 'android' then d.platform = 'android'
          when 'ios'     then d.platform = 'ios'
          else true
        end;
  if v_devices = 0 then
    raise exception 'push_no_devices' using errcode = 'P0001';
  end if;

  insert into public.push_campaigns (created_by, title, body, route, audience, phone_e164, scheduled_at)
  values (auth.uid(), v_title, v_body, v_route, v_audience, v_phone, v_when)
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.staff_create_push_campaign(jsonb) from public, anon;
grant execute on function public.staff_create_push_campaign(jsonb) to authenticated;

comment on function public.staff_create_push_campaign(jsonb) is
  'Queues one hand-written notification for sending (0152). Admin only. Refuses an empty or over-long text, a route the app would ignore, a number that is not E.164, a time out of range, and an audience with no device in it.';

/** Stops a campaign that has not left yet. One that is sending or already sent cannot be taken back. */
create or replace function public.staff_cancel_push_campaign(p_id uuid, p_reason text default null)
returns public.push_campaigns
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.push_campaigns;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'إشعار ملغى'));

  update public.push_campaigns c set status = 'cancelled'
   where c.id = p_id and c.status = 'scheduled'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'push_not_cancellable' using errcode = 'P0001';
  end if;
  return v_row;
end $$;
revoke execute on function public.staff_cancel_push_campaign(uuid, text) from public, anon;
grant execute on function public.staff_cancel_push_campaign(uuid, text) to authenticated;

/**
 * The devices, for the page that sends to them: how many, of what, and the latest few.
 *
 * `push_tokens` is closed to every browser (0138), so this is the one door the Back Office has — and it hands
 * back no token. A device is identified by the last six characters of its token, enough to tell two phones
 * apart on a screen and useless for sending anything. The phone number is cut to its last three digits for the
 * same reason a lock screen carries no amounts: whoever is looking over a shoulder learns nothing they can use.
 */
create or replace function public.staff_push_devices() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_summary jsonb;
  v_recent  jsonb;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'active',   count(*) filter (where d.disabled_at is null),
           'android',  count(*) filter (where d.disabled_at is null and d.platform = 'android'),
           'ios',      count(*) filter (where d.disabled_at is null and d.platform = 'ios'),
           'linked',   count(*) filter (where d.disabled_at is null and d.phone_e164 is not null),
           'retired',  count(*) filter (where d.disabled_at is not null),
           'last_seen_at', max(d.last_seen_at) filter (where d.disabled_at is null))
    into v_summary
  from public.push_tokens d;

  select coalesce(jsonb_agg(r order by r.last_seen_at desc), '[]'::jsonb) into v_recent
  from (
    select right(d.token, 7) as ref,
           d.platform,
           d.app_version,
           d.last_seen_at,
           d.created_at,
           case when d.phone_e164 is null then null else '•••' || right(d.phone_e164, 3) end as phone_hint
      from public.push_tokens d
     where d.disabled_at is null
     order by d.last_seen_at desc
     limit 20
  ) r;

  return v_summary || jsonb_build_object('recent', v_recent);
end $$;
revoke execute on function public.staff_push_devices() from public, anon;
grant execute on function public.staff_push_devices() to authenticated;


-- ---------------------------------------------------------------------------
-- 2 · What the dispatcher does (service_role only)
-- ---------------------------------------------------------------------------

/**
 * Hands the dispatcher the campaigns that are due, marking them in flight — the twin of claim_push_notifications.
 *
 * A run that died after claiming leaves a row `sending` for ever, so a campaign stuck for ten minutes goes back
 * to `scheduled` before the claim (or to `failed` once it has used its three attempts). Without it one crashed
 * request would silently swallow a notification, and the owner would learn it from a customer.
 */
create or replace function public.claim_push_campaigns(p_limit integer default 5)
returns setof public.push_campaigns
language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean := coalesce((select (s.value #>> '{}')::boolean from public.settings s where s.key = 'push.enabled'), false);
  v_max     integer := coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = 'push.max_attempts'), 3);
begin
  if not v_enabled then
    return;
  end if;

  update public.push_campaigns c
     set status = case when c.attempts >= v_max then 'failed' else 'scheduled' end,
         error  = case when c.attempts >= v_max then coalesce(c.error, 'توقّف الإرسال قبل ما يكمل.') else c.error end
   where c.status = 'sending' and c.scheduled_at < now() - interval '10 minutes';

  return query
  with due as (
    select c.id
      from public.push_campaigns c
     where c.status = 'scheduled' and c.scheduled_at <= now() and c.attempts < v_max
     order by c.scheduled_at
     limit greatest(1, least(coalesce(p_limit, 5), 20))
       for update skip locked
  )
  update public.push_campaigns c
     set status = 'sending', attempts = c.attempts + 1, scheduled_at = now()
    from due
   where c.id = due.id
  returning c.*;
end $$;
revoke execute on function public.claim_push_campaigns(integer) from public, anon, authenticated;
grant execute on function public.claim_push_campaigns(integer) to service_role;

/** The tokens one campaign goes to, by its audience. Active devices only; a retired token is never retried. */
create or replace function public.push_campaign_targets(p_id uuid) returns table (token text)
language sql stable security definer set search_path = '' as $$
  with c as (select * from public.push_campaigns where id = p_id)
  select d.token
    from c
    join lateral (
      select t.token
        from public.push_tokens t
       where t.disabled_at is null
         and case c.audience
               when 'phone'   then t.phone_e164 = c.phone_e164
               when 'android' then t.platform = 'android'
               when 'ios'     then t.platform = 'ios'
               else true
             end
       order by t.last_seen_at desc
       limit case when c.audience = 'latest' then 1 else 100000 end
    ) d on true;
$$;
revoke execute on function public.push_campaign_targets(uuid) from public, anon, authenticated;
grant execute on function public.push_campaign_targets(uuid) to service_role;

/** Closes a campaign with what Expo said. `sent` if any device accepted it, `failed` if none did. */
create or replace function public.finish_push_campaign(p_id uuid, p_sent integer, p_failed integer, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.push_campaigns c
     set status       = case when coalesce(p_sent, 0) > 0 then 'sent' else 'failed' end,
         sent_count   = greatest(coalesce(p_sent, 0), 0),
         failed_count = greatest(coalesce(p_failed, 0), 0),
         error        = nullif(left(btrim(coalesce(p_error, '')), 500), ''),
         sent_at      = case when coalesce(p_sent, 0) > 0 then now() else null end
   where c.id = p_id and c.status = 'sending';
end $$;
revoke execute on function public.finish_push_campaign(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.finish_push_campaign(uuid, integer, integer, text) to service_role;
