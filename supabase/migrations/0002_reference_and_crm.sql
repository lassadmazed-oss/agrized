-- 0002 · Reference data and demand CRM (Phase 1)
-- Spec: LEAD-01..12, CNT-01..03, CRM-01..05, COM-08..10, DATA-01..03.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create table app.counters (
  scope  text primary key,
  value  bigint not null default 0
);
revoke all on app.counters from public, anon, authenticated;

create or replace function app.next_number(p_scope text) returns bigint
language sql security definer set search_path = '' as $$
  insert into app.counters as c (scope, value) values (p_scope, 1)
  on conflict (scope) do update set value = c.value + 1
  returning value
$$;
revoke execute on function app.next_number(text) from public, anon, authenticated;

create or replace function app.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.settings where key = p_key
$$;

create or replace function app.setting_text(p_key text, p_default text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.settings where key = p_key), p_default)
$$;

create or replace function app.setting_int(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.settings where key = p_key), p_default)
$$;

create or replace function app.setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------------
-- Reference data (editable from the Back Office)
-- ---------------------------------------------------------------------------

create table public.governorates (
  id          smallint primary key,          -- INS code
  name_ar     text not null,
  name_fr     text not null,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true
);

create table public.delegations (
  id              integer generated always as identity primary key,
  governorate_id  smallint not null references public.governorates (id),
  name_ar         text not null,
  name_fr         text,
  sort_order      smallint not null default 0,
  is_active       boolean not null default true,
  unique (governorate_id, name_ar)
);
create index delegations_governorate_idx on public.delegations (governorate_id, sort_order);

create table public.project_types (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  label_ar        text not null,
  label_fr        text,
  description_ar  text,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);
create trigger project_types_stamp before update on public.project_types
  for each row execute function app.stamp_updated();

create table public.option_lists (
  key             text primary key,
  label_ar        text not null,
  value_kind      text not null check (value_kind in ('money', 'time_range', 'code', 'plain')),
  description_ar  text
);

create table public.option_items (
  id             uuid primary key default gen_random_uuid(),
  list_key       text not null references public.option_lists (key),
  code           text,
  label_ar       text not null,
  label_fr       text,
  min_millimes   bigint check (min_millimes >= 0),
  max_millimes   bigint,
  time_from      time,
  time_to        time,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id),
  unique (list_key, code),
  check (max_millimes is null or max_millimes >= coalesce(min_millimes, 0))
);
create index option_items_list_idx on public.option_items (list_key, sort_order);
create trigger option_items_stamp before update on public.option_items
  for each row execute function app.stamp_updated();

-- File status: editable labels mapped to fixed system stages (spec 8.1).
create type public.lead_stage as enum (
  'new', 'contacting', 'qualified', 'proposed', 'visit',
  'reserved', 'contracting', 'owner', 'paused', 'closed'
);

create table public.lead_statuses (
  id                uuid primary key default gen_random_uuid(),
  stage             public.lead_stage not null,
  label_ar          text not null,
  label_fr          text,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  is_stage_default  boolean not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id)
);
create unique index lead_statuses_stage_default_idx on public.lead_statuses (stage) where is_stage_default;
create trigger lead_statuses_stamp before update on public.lead_statuses
  for each row execute function app.stamp_updated();

-- ---------------------------------------------------------------------------
-- Persons (one record per phone number) and interest requests
-- ---------------------------------------------------------------------------

create table public.persons (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  phone_e164       text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp_e164    text check (whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email            text,
  governorate_id   smallint references public.governorates (id),
  delegation_id    integer references public.delegations (id),
  status_id        uuid not null references public.lead_statuses (id),
  assigned_to      uuid references public.profiles (id),
  profile_id       uuid unique references public.profiles (id),
  consent_at       timestamptz,
  last_request_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);
create index persons_assigned_idx on public.persons (assigned_to);
create index persons_status_idx on public.persons (status_id);
create index persons_created_idx on public.persons (created_at desc);
create index persons_name_trgm_idx on public.persons using gin (full_name extensions.gin_trgm_ops);
create trigger persons_stamp before update on public.persons
  for each row execute function app.stamp_updated();

create type public.contact_channel as enum ('phone', 'whatsapp', 'both');

create table public.interest_requests (
  id                         uuid primary key default gen_random_uuid(),
  request_no                 text not null unique,
  person_id                  uuid not null references public.persons (id),
  -- What the visitor typed, kept as submitted
  full_name                  text not null,
  phone_e164                 text not null,
  whatsapp_e164              text,
  email                      text,
  residence_governorate_id   smallint not null references public.governorates (id),
  residence_delegation_id    integer not null references public.delegations (id),
  invest_anywhere            boolean not null default false,
  invest_governorate_ids     smallint[] not null default '{}',
  project_type_unsure        boolean not null default false,
  project_type_ids           uuid[] not null default '{}',
  -- Option snapshots (LEAD-02)
  goal_option_id             uuid not null references public.option_items (id),
  goal_code                  text,
  goal_label_ar              text not null,
  down_payment_option_id     uuid not null references public.option_items (id),
  down_payment_label_ar      text not null,
  down_payment_min_millimes  bigint,
  down_payment_max_millimes  bigint,
  installment_option_id      uuid not null references public.option_items (id),
  installment_label_ar       text not null,
  installment_min_millimes   bigint,
  installment_max_millimes   bigint,
  contact_channel            public.contact_channel not null,
  contact_time_option_id     uuid references public.option_items (id),
  contact_time_label_ar      text,
  is_duplicate               boolean not null default false,
  source                     jsonb not null default '{}'::jsonb,
  consent_text               text not null,
  created_at                 timestamptz not null default now(),
  constraint interest_requests_location_chk check (invest_anywhere or cardinality(invest_governorate_ids) > 0),
  constraint interest_requests_type_chk check (project_type_unsure or cardinality(project_type_ids) > 0)
);
create index interest_requests_person_idx on public.interest_requests (person_id, created_at desc);
create index interest_requests_created_idx on public.interest_requests (created_at desc);
create index interest_requests_residence_idx on public.interest_requests (residence_governorate_id, residence_delegation_id);
create index interest_requests_invest_govs_idx on public.interest_requests using gin (invest_governorate_ids);
create index interest_requests_types_idx on public.interest_requests using gin (project_type_ids);
create index interest_requests_down_idx on public.interest_requests (down_payment_min_millimes);
create index interest_requests_installment_idx on public.interest_requests (installment_min_millimes);
create index interest_requests_phone_idx on public.interest_requests (phone_e164, created_at desc);

create table public.person_status_history (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.persons (id),
  from_status_id  uuid references public.lead_statuses (id),
  to_status_id    uuid not null references public.lead_statuses (id),
  changed_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index person_status_history_person_idx on public.person_status_history (person_id, created_at desc);

create or replace function app.track_person_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    insert into public.person_status_history (person_id, from_status_id, to_status_id, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status_id end, new.status_id, auth.uid());
  end if;
  return new;
end $$;
create trigger persons_status_history after insert or update of status_id on public.persons
  for each row execute function app.track_person_status();

create type public.contact_outcome as enum ('answered', 'no_answer', 'wrong_number', 'callback', 'not_interested');

create table public.contact_attempts (
  id                 uuid primary key default gen_random_uuid(),
  person_id          uuid not null references public.persons (id),
  channel            text not null check (channel in ('phone', 'whatsapp', 'sms', 'other')),
  outcome            public.contact_outcome not null,
  note               text check (length(note) <= 5000),
  next_follow_up_at  timestamptz,
  created_by         uuid not null default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now()
);
create index contact_attempts_person_idx on public.contact_attempts (person_id, created_at desc);
create index contact_attempts_follow_up_idx on public.contact_attempts (created_by, next_follow_up_at)
  where next_follow_up_at is not null;

create table public.person_notes (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.persons (id),
  body        text not null check (length(body) between 1 and 5000),
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index person_notes_person_idx on public.person_notes (person_id, created_at desc);

create table public.person_assignments (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.persons (id),
  from_user   uuid references public.profiles (id),
  to_user     uuid references public.profiles (id),
  reason      text,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index person_assignments_person_idx on public.person_assignments (person_id, created_at desc);
create index person_assignments_to_user_idx on public.person_assignments (to_user, created_at desc);

-- CRM list: requests with their person's live status and owner. RLS of the base tables applies.
create view public.crm_requests with (security_invoker = on) as
select
  r.*,
  p.status_id,
  s.stage,
  s.label_ar as status_label_ar,
  p.assigned_to,
  pr.full_name as assigned_to_name,
  p.archived_at as person_archived_at
from public.interest_requests r
join public.persons p on p.id = r.person_id
join public.lead_statuses s on s.id = p.status_id
left join public.profiles pr on pr.id = p.assigned_to;

-- ---------------------------------------------------------------------------
-- Visibility and CRM RPCs
-- ---------------------------------------------------------------------------

create or replace function app.can_see_person(p_person_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_any_role(array['admin', 'super_admin', 'finance', 'legal']::public.app_role[])
      or (app.has_role('commercial')
          and exists (select 1 from public.persons p where p.id = p_person_id and p.assigned_to = auth.uid()))
$$;

-- COM-09: Admin transfers files (one, many or all of a user's) keeping the full history.
create or replace function public.admin_assign_persons(p_person_ids uuid[], p_to_user uuid, p_reason text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer := 0;
  v_person record;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to_user is not null and not exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_to_user and ur.role = 'commercial' and p.is_active
  ) then
    raise exception 'target_not_active_commercial';
  end if;

  for v_person in
    select id, assigned_to from public.persons
    where id = any (p_person_ids) and assigned_to is distinct from p_to_user
    for update
  loop
    update public.persons set assigned_to = p_to_user where id = v_person.id;
    insert into public.person_assignments (person_id, from_user, to_user, reason, created_by)
    values (v_person.id, v_person.assigned_to, p_to_user, p_reason, auth.uid());
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function public.admin_assign_persons(uuid[], uuid, text) from public, anon;
grant execute on function public.admin_assign_persons(uuid[], uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------

create trigger governorates_audit after insert or update or delete on public.governorates
  for each row execute function app.audit_row_change();
create trigger delegations_audit after insert or update or delete on public.delegations
  for each row execute function app.audit_row_change();
create trigger project_types_audit after insert or update or delete on public.project_types
  for each row execute function app.audit_row_change();
create trigger option_items_audit after insert or update or delete on public.option_items
  for each row execute function app.audit_row_change();
create trigger lead_statuses_audit after insert or update or delete on public.lead_statuses
  for each row execute function app.audit_row_change();
create trigger persons_audit after insert or update or delete on public.persons
  for each row execute function app.audit_row_change();
create trigger interest_requests_audit after insert or update or delete on public.interest_requests
  for each row execute function app.audit_row_change();
create trigger person_assignments_audit after insert or update or delete on public.person_assignments
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.governorates enable row level security;
alter table public.delegations enable row level security;
alter table public.project_types enable row level security;
alter table public.option_lists enable row level security;
alter table public.option_items enable row level security;
alter table public.lead_statuses enable row level security;
alter table public.persons enable row level security;
alter table public.interest_requests enable row level security;
alter table public.person_status_history enable row level security;
alter table public.contact_attempts enable row level security;
alter table public.person_notes enable row level security;
alter table public.person_assignments enable row level security;

-- Reference data: public read, admin write.
create policy governorates_read on public.governorates for select to anon, authenticated using (true);
create policy delegations_read on public.delegations for select to anon, authenticated using (true);
create policy project_types_read on public.project_types for select to anon, authenticated using (true);
create policy option_lists_read on public.option_lists for select to anon, authenticated using (true);
create policy option_items_read on public.option_items for select to anon, authenticated using (true);
create policy lead_statuses_read on public.lead_statuses for select to authenticated using ((select app.is_staff()));

revoke insert, update, delete on public.governorates, public.delegations, public.project_types,
  public.option_lists, public.option_items, public.lead_statuses from anon;
revoke delete on public.governorates, public.delegations, public.project_types,
  public.option_lists, public.option_items, public.lead_statuses from authenticated;
revoke insert, update on public.option_lists from authenticated;

create policy governorates_admin_update on public.governorates for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy delegations_admin_insert on public.delegations for insert to authenticated
  with check ((select app.is_admin()));
create policy delegations_admin_update on public.delegations for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy project_types_admin_insert on public.project_types for insert to authenticated
  with check ((select app.is_admin()));
create policy project_types_admin_update on public.project_types for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy option_items_admin_insert on public.option_items for insert to authenticated
  with check ((select app.is_admin()));
create policy option_items_admin_update on public.option_items for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy lead_statuses_admin_insert on public.lead_statuses for insert to authenticated
  with check ((select app.is_admin()));
create policy lead_statuses_admin_update on public.lead_statuses for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- Persons: commercial sees own files; finance, legal, admin see all (spec 22.1).
revoke all on public.persons, public.interest_requests, public.person_status_history,
  public.contact_attempts, public.person_notes, public.person_assignments, public.crm_requests from anon;
revoke insert, delete on public.persons from authenticated;
revoke update on public.persons from authenticated;
grant update (full_name, whatsapp_e164, email, governorate_id, delegation_id, status_id) on public.persons to authenticated;

create policy persons_select on public.persons for select to authenticated
  using ((select app.has_any_role(array['admin', 'super_admin', 'finance', 'legal']::public.app_role[]))
         or (assigned_to = (select auth.uid()) and (select app.has_role('commercial'))));
create policy persons_update on public.persons for update to authenticated
  using ((select app.is_admin())
         or (assigned_to = (select auth.uid()) and (select app.has_role('commercial'))))
  with check ((select app.is_admin())
         or (assigned_to = (select auth.uid()) and (select app.has_role('commercial'))));

revoke insert, update, delete on public.interest_requests from authenticated;
create policy interest_requests_select on public.interest_requests for select to authenticated
  using (app.can_see_person(person_id));

revoke insert, update, delete on public.person_status_history from authenticated;
create policy person_status_history_select on public.person_status_history for select to authenticated
  using (app.can_see_person(person_id));

revoke update, delete on public.contact_attempts, public.person_notes from authenticated;
create policy contact_attempts_select on public.contact_attempts for select to authenticated
  using (app.can_see_person(person_id));
create policy contact_attempts_insert on public.contact_attempts for insert to authenticated
  with check (created_by = (select auth.uid()) and app.can_see_person(person_id));
create policy person_notes_select on public.person_notes for select to authenticated
  using (app.can_see_person(person_id));
create policy person_notes_insert on public.person_notes for insert to authenticated
  with check (created_by = (select auth.uid()) and app.can_see_person(person_id));

revoke insert, update, delete on public.person_assignments from authenticated;
create policy person_assignments_select on public.person_assignments for select to authenticated
  using (app.can_see_person(person_id));
