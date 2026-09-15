-- 0035 · Projects and parcels on the tree with its area (docs/plan-zitouna.md P5-3, P5-4; owner decisions Q-9, Q-13).
--
-- A project lists its spacing classes (0031); a parcel of such a project is a number of olive trees of one class.
-- Its area and its price follow from the trees: area = trees × area per tree, price = trees × price per tree
-- (app.parcel_price, 0034, the single definition every reader uses). Legacy projects without classes keep their typed
-- area and cash price. Money reaches visitors only when both the projects and the pricing modules are open to them;
-- a legacy parcel keeps the 0020 rule (projects module only). Never the land price, planting cost, extras or margin.

-- ---------------------------------------------------------------------------
-- S1 · A tree-priced parcel stores its class and the area its trees cover
-- ---------------------------------------------------------------------------

-- Fires after parcels_spacing_class_check (0034; BEFORE triggers run in name order), so a class set here is the
-- project's only class and needs no second check.
create or replace function app.parcel_tree_unit_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid;
  v_area  numeric;
begin
  if not app.project_on_tree_pricing(new.project_id) then
    return new;
  end if;

  -- Stored explicitly: a second class added to the project later must not change which trees this parcel holds.
  if new.spacing_class_id is null then
    select case when count(*) = 1 then min(psc.spacing_class_id::text)::uuid end
    into v_class
    from public.project_spacing_classes psc
    where psc.project_id = new.project_id;
    new.spacing_class_id := v_class;
  end if;

  if new.spacing_class_id is not null and coalesce(new.olive_tree_count, 0) > 0 then
    select c.area_m2 into v_area from public.tree_spacing_classes c where c.id = new.spacing_class_id;
    if v_area > 0 then
      new.area_m2 := new.olive_tree_count * v_area;
    end if;
  end if;

  return new;
end $$;
revoke execute on function app.parcel_tree_unit_sync() from public, anon, authenticated;

create trigger parcels_tree_unit_sync before insert or update on public.parcels
  for each row execute function app.parcel_tree_unit_sync();

-- Editing the spacing of a class in the Back Office moves the area of every parcel planted with it. area_m2 is a
-- generated column (row × tree spacing), so the trigger watches the two spacings and compares the generated areas.
create or replace function app.spacing_area_fanout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.area_m2 is distinct from old.area_m2 and new.area_m2 > 0 then
    update public.parcels pa
    set area_m2 = pa.olive_tree_count * new.area_m2
    where pa.spacing_class_id = new.id
      and coalesce(pa.olive_tree_count, 0) > 0
      and app.project_on_tree_pricing(pa.project_id);
  end if;
  return null;
end $$;
revoke execute on function app.spacing_area_fanout() from public, anon, authenticated;

create trigger tree_spacing_classes_area_fanout after update of row_spacing_m, tree_spacing_m on public.tree_spacing_classes
  for each row execute function app.spacing_area_fanout();

-- ---------------------------------------------------------------------------
-- S2 · Public listing of parcels
-- ---------------------------------------------------------------------------

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
  on_tree_pricing boolean,
  spacing_class_id uuid,
  spacing_label_ar text,
  area_per_tree_m2 numeric,
  price_per_tree_millimes bigint,
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
    pa.id, pa.project_id, pj.code, pj.name, pj.status,
    pj.project_type_id, pj.governorate_id, pj.delegation_id,
    pa.code,
    coalesce((pr.p->>'total_area_m2')::numeric, pa.area_m2),
    pa.property_type, pa.plantation_system, pa.olive_tree_count, pa.tree_age_years,
    pa.production_status, pa.irrigation, pa.status,
    app.parcel_offered(pj.status, pa.status),
    coalesce((pr.p->>'on_tree_pricing')::boolean, false),
    sc.id,
    sc.label_ar,
    (pr.p->>'area_per_tree_m2')::numeric,
    case when m.tree_priced then (pr.p->>'price_per_tree_millimes')::bigint end,
    case when m.tree_priced then (pr.p->>'cash_total_millimes')::bigint
         when m.legacy_priced then pa.cash_price_millimes end,
    case when m.tree_priced
           then app.down_payment_from_percent(
                  (pr.p->>'cash_total_millimes')::bigint,
                  (select min(o.min_number) from app.project_down_percent_items(pa.project_id) o),
                  pa.project_id)
         when m.legacy_priced then app.parcel_down_from(pa.id, pa.cash_price_millimes) end,
    case when app.parcel_offered(pj.status, pa.status) then pa.annual_costs_millimes end,
    pa.sort_order,
    null::text, null::text, null::text
  from public.parcels pa
  join public.projects pj on pj.id = pa.project_id
  cross join lateral (select app.parcel_price(pa.id) as p) pr
  left join public.tree_spacing_classes sc on sc.id = (pr.p->>'spacing_class_id')::uuid
  cross join lateral (
    select
      app.parcel_offered(pj.status, pa.status)
        and coalesce((pr.p->>'on_tree_pricing')::boolean, false)
        and pr.p->>'pricing' = 'ok'
        and app.module_open('pricing') as tree_priced,
      app.parcel_offered(pj.status, pa.status)
        and not coalesce((pr.p->>'on_tree_pricing')::boolean, false)
        and pa.cash_price_millimes > 0 as legacy_priced
  ) m
  where app.project_visible(pj.status)
    and app.parcel_visible_status(pa.status)
  order by (pj.status = 'published') desc, pj.code, pa.sort_order, pa.code
  limit greatest(20, least(1000, app.setting_int('projects.listing_limit', 300)))
$$;

-- ---------------------------------------------------------------------------
-- S3 · Public listing of projects
-- ---------------------------------------------------------------------------

drop function if exists public.public_projects();

create function public.public_projects()
returns table (
  id uuid,
  code text,
  name text,
  project_type_id uuid,
  governorate_id smallint,
  delegation_id integer,
  location_description text,
  total_area_m2 numeric,
  olive_variety text,
  tree_count integer,
  tree_age_years numeric,
  plantation_system text,
  production_status text,
  irrigation public.irrigation_type,
  status public.project_status,
  offered boolean,
  on_tree_pricing boolean,
  parcels_total integer,
  parcels_offered integer,
  min_cash_price_millimes bigint,
  min_price_per_tree_millimes bigint,
  area_per_tree_min_m2 numeric,
  area_per_tree_max_m2 numeric,
  min_area_m2 numeric,
  max_area_m2 numeric,
  parcel_trees integer,
  cover_url text,
  cover_alt_ar text,
  cover_aspect text
)
language sql stable security definer set search_path = '' as $$
  select
    pj.id, pj.code, pj.name, pj.project_type_id, pj.governorate_id, pj.delegation_id,
    pj.location_description, pj.total_area_m2, pj.olive_variety, pj.tree_count, pj.tree_age_years,
    pj.plantation_system, pj.production_status, pj.irrigation, pj.status,
    (pj.status = 'published'),
    app.project_on_tree_pricing(pj.id),
    a.parcels_total, a.parcels_offered, a.min_cash,
    case when pj.status = 'published' and app.module_open('pricing') then t.min_price_per_tree end,
    t.min_area_per_tree, t.max_area_per_tree,
    a.min_area, a.max_area, a.parcel_trees,
    c.url, c.alt_ar, null::text
  from public.projects pj
  left join lateral (
    select
      (count(*) filter (where pa.status <> 'withdrawn'))::integer as parcels_total,
      (count(*) filter (where x.priced))::integer as parcels_offered,
      min(x.cash) filter (where x.priced) as min_cash,
      min(x.area) filter (where pa.status <> 'withdrawn') as min_area,
      max(x.area) filter (where pa.status <> 'withdrawn') as max_area,
      (sum(pa.olive_tree_count) filter (where pa.status <> 'withdrawn'))::integer as parcel_trees
    from public.parcels pa
    cross join lateral (select app.parcel_price(pa.id) as p) pr
    cross join lateral (
      select
        coalesce((pr.p->>'total_area_m2')::numeric, pa.area_m2) as area,
        case when coalesce((pr.p->>'on_tree_pricing')::boolean, false)
             then (pr.p->>'cash_total_millimes')::bigint else pa.cash_price_millimes end as cash,
        app.parcel_offered(pj.status, pa.status)
          and case when coalesce((pr.p->>'on_tree_pricing')::boolean, false)
                   then pr.p->>'pricing' = 'ok' and app.module_open('pricing')
                   else pa.cash_price_millimes > 0 end as priced
    ) x
    where pa.project_id = pj.id
  ) a on true
  left join lateral (
    select
      min(cl.area_m2) as min_area_per_tree,
      max(cl.area_m2) as max_area_per_tree,
      min((app.tree_price(cl.id, pj.id)->>'price_per_tree_millimes')::bigint) as min_price_per_tree
    from public.project_spacing_classes psc
    join public.tree_spacing_classes cl on cl.id = psc.spacing_class_id
    where psc.project_id = pj.id
  ) t on true
  left join lateral (
    select m.url, m.alt_ar
    from public.project_media m
    where m.project_id = pj.id
    order by m.is_cover desc, m.sort_order, m.created_at
    limit 1
  ) c on true
  where app.project_visible(pj.status)
  order by (pj.status = 'published') desc, pj.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- S4 · Coverage per governorate (counts only)
-- ---------------------------------------------------------------------------

create or replace function public.public_coverage()
returns table (
  governorate_id smallint,
  projects_count integer,
  parcels_total integer,
  parcels_offered integer
)
language sql stable security definer set search_path = '' as $$
  select
    pj.governorate_id,
    (count(distinct pj.id))::integer,
    (count(pa.id) filter (where pa.status <> 'withdrawn'))::integer,
    (count(pa.id) filter (
      where app.parcel_offered(pj.status, pa.status)
        and case when app.project_on_tree_pricing(pj.id)
                 then app.parcel_price(pa.id)->>'pricing' = 'ok'
                 else pa.cash_price_millimes > 0 end))::integer
  from public.projects pj
  left join public.parcels pa on pa.project_id = pj.id
  where app.project_visible(pj.status)
  group by pj.governorate_id
  order by pj.governorate_id
$$;

-- ---------------------------------------------------------------------------
-- S5 · Back Office: the price of every parcel of a project in one call
-- ---------------------------------------------------------------------------

create or replace function public.staff_project_parcel_prices(p_project uuid)
returns table (parcel_id uuid, price jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select pa.id, app.parcel_price(pa.id)
    from public.parcels pa
    where pa.project_id = p_project
    order by pa.sort_order, pa.code;
end $$;

-- ---------------------------------------------------------------------------
-- S6 · Privileges and documentation
-- ---------------------------------------------------------------------------

revoke execute on function public.public_parcels(), public.public_projects(), public.public_coverage() from public;
grant execute on function public.public_parcels(), public.public_projects(), public.public_coverage() to anon, authenticated;

revoke execute on function public.staff_project_parcel_prices(uuid) from public, anon;
grant execute on function public.staff_project_parcel_prices(uuid) to authenticated;

comment on function public.public_parcels() is
  'Public listing surface (PUB-01). Tree-priced parcels (plan P5-3): area = trees × area per tree, price = trees × price per tree from app.parcel_price, money only when the projects and pricing modules are open and the parcel is offered. Legacy parcels keep the 0020 rule. Never pricing formulas, land price, planting cost, extras, margin, project_costs, notes, coordinates, staff ids (PRJ-03).';
comment on function public.public_projects() is
  'Public listing surface (PUB-01). min_price_per_tree_millimes (plan P5-4) only for published projects while pricing is open; area_per_tree_min/max_m2 from the project''s spacing classes. Never pricing formulas, land price, planting cost, extras, margin, project_costs, legal_notes, coordinates, staff ids (PRJ-03).';
comment on function public.staff_project_parcel_prices(uuid) is
  'Back Office project page: app.parcel_price for every parcel of a project (staff only, no module gate).';
