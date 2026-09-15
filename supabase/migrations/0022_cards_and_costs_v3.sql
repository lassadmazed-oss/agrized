-- e3 · Report v3 §19 «ابتداءً من X د تسبقة» on listing cards, and §35 project cost categories.
-- Kept outside supabase/migrations until the owner approves; its number is taken at apply time.
--
-- §19: the listing now says the smallest down payment a parcel really accepts. It is not the smallest
-- option of the list: the pricing a parcel resolves to (parcel → project → pricing.default) may require
-- a minimum share of the cash price, so the first option at or above that share is shown. No plan is
-- computed per row (the listing stays cheap); the parcel page still computes the full plans.
-- §35: cost categories for the project's internal budget. Costs stay Finance/Admin only (PRJ-03).

-- ---------------------------------------------------------------------------
-- §35 · Cost categories
-- ---------------------------------------------------------------------------

alter table public.project_costs drop constraint if exists project_costs_kind_check;
alter table public.project_costs add constraint project_costs_kind_check check (kind in (
  'purchase',          -- Prix achat
  'notary',            -- Notaire / juridique
  'commission',        -- Commission
  'plantation',        -- Plantation
  'irrigation',        -- Irrigation
  'fencing',           -- Fencing
  'access',            -- Road / access
  'marketing',         -- Marketing
  'sales_commission',  -- Sales commission
  'management',        -- Management cost
  'development',       -- kept: rows recorded before v3
  'fees',              -- kept: rows recorded before v3
  'other'              -- Other costs
));

-- ---------------------------------------------------------------------------
-- §19 · Smallest accepted down payment in the public listing
-- ---------------------------------------------------------------------------

create or replace function app.parcel_down_from(p_parcel uuid, p_cash bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select min(oi.min_millimes)
  from public.option_items oi
  where oi.list_key = 'down_payment'
    and oi.is_active
    and oi.min_millimes is not null
    and oi.min_millimes < p_cash
    and oi.min_millimes >= ceil(p_cash * coalesce((app.parcel_pricing(p_parcel) ->> 'min_down_pct')::numeric, 0) / 100)
$$;
revoke execute on function app.parcel_down_from(uuid, bigint) from public, anon, authenticated;

-- The result columns change, so the function is dropped and created again with the 0020 body plus
-- down_from_millimes. Grants are re-issued exactly as 0020 did.
drop function if exists public.public_parcels();

create function public.public_parcels()
returns table (
  id uuid,
  project_id uuid,
  project_code text,
  project_name text,
  project_status public.project_status,
  project_type_id uuid,
  governorate_id smallint,
  delegation_id integer,
  code text,
  area_m2 numeric,
  property_type text,
  plantation_system text,
  olive_tree_count integer,
  tree_age_years numeric,
  production_status text,
  irrigation public.irrigation_type,
  status public.parcel_status,
  offered boolean,
  cash_price_millimes bigint,
  down_from_millimes bigint,
  annual_costs_millimes bigint,
  sort_order integer,
  photo_url text,
  photo_alt_ar text,
  photo_aspect text
)
language sql stable security definer set search_path = '' as $$
  select
    pa.id, pa.project_id, pj.code as project_code, pj.name as project_name, pj.status as project_status,
    pj.project_type_id, pj.governorate_id, pj.delegation_id,
    pa.code, pa.area_m2, pa.property_type, pa.plantation_system, pa.olive_tree_count, pa.tree_age_years,
    pa.production_status, pa.irrigation, pa.status,
    app.parcel_offered(pj.status, pa.status) as offered,
    case when app.parcel_offered(pj.status, pa.status) and pa.cash_price_millimes > 0
         then pa.cash_price_millimes end as cash_price_millimes,
    case when app.parcel_offered(pj.status, pa.status) and pa.cash_price_millimes > 0
         then app.parcel_down_from(pa.id, pa.cash_price_millimes) end as down_from_millimes,
    case when app.parcel_offered(pj.status, pa.status) then pa.annual_costs_millimes end as annual_costs_millimes,
    pa.sort_order,
    null::text as photo_url, null::text as photo_alt_ar, null::text as photo_aspect
  from public.parcels pa
  join public.projects pj on pj.id = pa.project_id
  where app.project_visible(pj.status)
    and app.parcel_visible_status(pa.status)
  order by (pj.status = 'published') desc, pj.code, pa.sort_order, pa.code
  limit greatest(20, least(1000, app.setting_int('projects.listing_limit', 300)))
$$;

revoke execute on function public.public_parcels() from public;
grant execute on function public.public_parcels() to anon, authenticated;

comment on function public.public_parcels() is
  'Public listing surface (PUB-01): whitelisted columns, gated on the projects flag and app.project_visible(). Never pricing formulas, project_costs, legal_notes, notes, land_offer_id, plan_storage_path, coordinates, staff ids (PRJ-03). down_from_millimes: smallest accepted down-payment option (report v3 §19).';
