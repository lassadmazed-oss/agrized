-- 0012 · Projects and parcels (clause 10 and clause 25.2).
-- Every parcel field is independent: area, plantation system, tree count, production status and price
-- are entered by the administration and never derived from one another (PARC-01, PARC-02).

create type public.project_status as enum (
  'draft', 'preparing', 'internal', 'published', 'sold_out', 'operating', 'archived'
);

create type public.parcel_status as enum (
  'available', 'interested', 'reserved', 'contracting', 'sold', 'withdrawn'
);

create table public.projects (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique,
  name                   text not null,
  project_type_id        uuid references public.project_types (id),
  governorate_id         smallint not null references public.governorates (id),
  delegation_id          integer references public.delegations (id),
  location_description   text check (length(location_description) <= 1000),
  latitude               numeric(9, 6) check (latitude between -90 and 90),
  longitude              numeric(9, 6) check (longitude between -180 and 180),
  total_area_m2          numeric(12, 2) check (total_area_m2 > 0),
  olive_variety          text,
  tree_count             integer check (tree_count >= 0),
  tree_age_years         numeric(4, 1) check (tree_age_years >= 0),
  plantation_system      text check (plantation_system in ('traditional', 'intensive', 'other')),
  production_status      text check (production_status in ('none', 'starting', 'producing')),
  irrigation             public.irrigation_type,
  -- Pricing formula for the whole project (SIM-06 / 7.3). A parcel may override it.
  pricing                jsonb not null default '{}'::jsonb,
  annual_costs_millimes  bigint check (annual_costs_millimes >= 0),
  plan_storage_path      text,
  legal_notes            text,
  status                 public.project_status not null default 'draft',
  land_offer_id          uuid references public.land_offers (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references public.profiles (id)
);
create index projects_status_idx on public.projects (status, created_at desc);
create index projects_location_idx on public.projects (governorate_id, delegation_id);
create trigger projects_stamp before update on public.projects
  for each row execute function app.stamp_updated();
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function app.audit_row_change();

-- Internal financials, never exposed to clients or commercials (PRJ-03).
create table public.project_costs (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id),
  kind             text not null check (kind in ('purchase', 'development', 'fees', 'other')),
  label            text not null,
  amount_millimes  bigint not null check (amount_millimes >= 0),
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) default auth.uid()
);
create index project_costs_project_idx on public.project_costs (project_id);
create trigger project_costs_audit after insert or update or delete on public.project_costs
  for each row execute function app.audit_row_change();

create table public.parcels (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references public.projects (id),
  code                   text not null,
  area_m2                numeric(12, 2) not null check (area_m2 > 0),
  property_type          text not null check (property_type in ('bare_land', 'planted')),
  plantation_system      text check (plantation_system in ('traditional', 'intensive', 'other')),
  olive_tree_count       integer check (olive_tree_count >= 0),
  tree_age_years         numeric(4, 1) check (tree_age_years >= 0),
  production_status      text check (production_status in ('none', 'starting', 'producing')),
  irrigation             public.irrigation_type,
  cash_price_millimes    bigint not null check (cash_price_millimes >= 0),
  annual_costs_millimes  bigint check (annual_costs_millimes >= 0),
  pricing                jsonb,
  status                 public.parcel_status not null default 'available',
  notes                  text check (length(notes) <= 2000),
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references public.profiles (id),
  unique (project_id, code)
);
create index parcels_project_idx on public.parcels (project_id, sort_order);
create index parcels_status_idx on public.parcels (status);
create index parcels_area_idx on public.parcels (area_m2);
create trigger parcels_stamp before update on public.parcels
  for each row execute function app.stamp_updated();
create trigger parcels_audit after insert or update or delete on public.parcels
  for each row execute function app.audit_row_change();

comment on column public.parcels.olive_tree_count is
  'Actual number of olive trees entered by the administration. Never computed from area_m2 (PARC-02).';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_costs enable row level security;
alter table public.parcels enable row level security;

revoke all on public.projects, public.project_costs, public.parcels from anon;
revoke insert, update, delete on public.projects, public.project_costs, public.parcels from authenticated;

-- Staff see projects and parcels; clients and visitors do not (the public module is not built yet).
create policy projects_select on public.projects for select to authenticated
  using ((select app.is_staff()));
create policy parcels_select on public.parcels for select to authenticated
  using ((select app.is_staff()));

-- Purchase price, development costs and margins stay with Finance and Admin (PRJ-03).
create policy project_costs_select on public.project_costs for select to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));

create policy projects_write on public.projects for insert to authenticated
  with check ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy projects_update on public.projects for update to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])))
  with check ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));

create policy parcels_write on public.parcels for insert to authenticated
  with check ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy parcels_update on public.parcels for update to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])))
  with check ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));

create policy project_costs_write on public.project_costs for insert to authenticated
  with check ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy project_costs_update on public.project_costs for update to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])))
  with check ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
