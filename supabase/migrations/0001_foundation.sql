-- 0001 · Foundation
-- Private helper schema, roles and profiles, settings, feature flags, append-only audit log.
-- Spec: PRN-02, PRN-06, FLAG-01..03, AUD-01..04, PERM-01..05, CFG-01..02.

create extension if not exists pg_trgm with schema extensions;

-- Helpers that must not be exposed through the REST API live in "app".
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------

create or replace function app.stamp_updated() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'updated_by' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_by', coalesce(auth.uid(), (to_jsonb(new)->>'updated_by')::uuid)));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Roles and profiles
-- ---------------------------------------------------------------------------

create type public.app_role as enum (
  'client', 'commercial', 'agri_manager', 'finance', 'legal', 'admin', 'super_admin'
);

create table public.profiles (
  id          uuid primary key references auth.users (id),
  full_name   text not null default '',
  phone_e164  text,
  locale      text not null default 'ar' check (locale in ('ar', 'fr')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_stamp before update on public.profiles
  for each row execute function app.stamp_updated();

create table public.user_roles (
  user_id     uuid not null references public.profiles (id),
  role        public.app_role not null,
  granted_by  uuid references public.profiles (id),
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone_e164)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when coalesce(new.phone, '') = '' then null else '+' || ltrim(new.phone, '+') end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

create or replace function app.current_roles() returns public.app_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(ur.role), '{}')
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid() and p.is_active
$$;

create or replace function app.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_role = any (app.current_roles())
$$;

create or replace function app.has_any_role(p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_roles() && p_roles
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_roles() && array['commercial', 'agri_manager', 'finance', 'legal', 'admin', 'super_admin']::public.app_role[]
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_roles() && array['admin', 'super_admin']::public.app_role[]
$$;

-- ---------------------------------------------------------------------------
-- Settings (every business value lives here, never in code)
-- ---------------------------------------------------------------------------

create table public.settings (
  key             text primary key,
  value           jsonb not null,
  value_type      text not null check (value_type in ('boolean', 'integer', 'money', 'text', 'json')),
  group_key       text not null,
  label_ar        text not null,
  description_ar  text,
  is_public       boolean not null default false,
  sort_order      integer not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);

create trigger settings_stamp before update on public.settings
  for each row execute function app.stamp_updated();

-- ---------------------------------------------------------------------------
-- Feature flags (module visibility per phase)
-- ---------------------------------------------------------------------------

create type public.flag_state as enum ('disabled', 'internal', 'public');

create table public.feature_flags (
  key             text primary key,
  state           public.flag_state not null default 'disabled',
  phase           smallint not null check (phase between 1 and 4),
  label_ar        text not null,
  description_ar  text,
  sort_order      integer not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);

create trigger feature_flags_stamp before update on public.feature_flags
  for each row execute function app.stamp_updated();

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  action       text not null,
  entity       text not null,
  entity_id    text,
  old_data     jsonb,
  new_data     jsonb,
  reason       text,
  ip           text,
  user_agent   text
);

create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

create or replace function app.block_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;

create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function app.block_audit_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function app.block_audit_mutation();

-- Request context forwarded by the Next.js server as headers (see src/lib/supabase).
create or replace function app.request_header(p_name text) returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('request.headers', true), '')::json ->> p_name
$$;

create or replace function app.write_audit(
  p_action text, p_entity text, p_entity_id text,
  p_old jsonb, p_new jsonb, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, old_data, new_data, reason, ip, user_agent)
  values (
    auth.uid(), p_action, p_entity, p_entity_id, p_old, p_new,
    coalesce(p_reason, nullif(current_setting('app.reason', true), '')),
    app.request_header('x-client-ip'),
    app.request_header('x-client-ua')
  );
end $$;

create or replace function app.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;
  perform app.write_audit(
    lower(tg_op), tg_table_name, coalesce(v_row->>'id', v_row->>'key', v_row->>'user_id'),
    v_old, v_new, null
  );
  return coalesce(new, old);
end $$;

revoke execute on function app.write_audit(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- Explicit business actions (exports, document downloads…) logged from the app.
create or replace function public.log_action(
  p_action text, p_entity text, p_entity_id text default null,
  p_data jsonb default null, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.write_audit(p_action, p_entity, p_entity_id, null, p_data, p_reason);
end $$;

revoke execute on function public.log_action(text, text, text, jsonb, text) from public, anon;
grant execute on function public.log_action(text, text, text, jsonb, text) to authenticated;

create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function app.audit_row_change();
create trigger user_roles_audit after insert or update or delete on public.user_roles
  for each row execute function app.audit_row_change();
create trigger settings_audit after insert or update or delete on public.settings
  for each row execute function app.audit_row_change();
create trigger feature_flags_audit after insert or update or delete on public.feature_flags
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------
-- Admin RPCs (role checks inside; the caller's identity is kept for the audit log)
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_role(p_user uuid, p_role public.app_role, p_grant boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'super_admin' and not app.has_role('super_admin') then
    raise exception 'only a super admin can manage the super_admin role' using errcode = '42501';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user, p_role, auth.uid())
    on conflict do nothing;
  else
    if p_role = 'super_admin'
       and (select count(*) from public.user_roles where role = 'super_admin') <= 1 then
      raise exception 'cannot remove the last super admin';
    end if;
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
end $$;

create or replace function public.admin_set_user_active(p_user uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() and not p_active then
    raise exception 'you cannot deactivate your own account';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin')
     and not app.has_role('super_admin') then
    raise exception 'only a super admin can change a super admin account' using errcode = '42501';
  end if;
  update public.profiles set is_active = p_active where id = p_user;
end $$;

revoke execute on function public.admin_set_role(uuid, public.app_role, boolean) from public, anon;
revoke execute on function public.admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_role(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.settings enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select app.is_staff()));

-- Users may only edit their display fields; is_active goes through admin_set_user_active.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, locale) on public.profiles to authenticated;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_admin()));
revoke insert, update, delete on public.user_roles from anon, authenticated;

create policy settings_select on public.settings
  for select to anon, authenticated
  using (is_public or (select app.is_staff()));
revoke insert, delete on public.settings from anon, authenticated;
revoke update on public.settings from anon;
create policy settings_update on public.settings
  for update to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));

create policy feature_flags_select on public.feature_flags
  for select to anon, authenticated
  using (true);
revoke insert, delete on public.feature_flags from anon, authenticated;
revoke update on public.feature_flags from anon;
create policy feature_flags_update on public.feature_flags
  for update to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select app.is_admin()));
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;
