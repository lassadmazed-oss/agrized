-- 0020 · PUB-01 public projects & parcels surface.
-- Anon never touches projects/parcels/project_costs (PRJ-03); four whitelisted security-definer RPCs
-- gated on the projects flag. Every new public object gets revoke-before-grant because Supabase default
-- privileges hand anon/authenticated ALL on new tables and PUBLIC execute on new functions.
-- References: PRN-01/02, PARC-01/02/04/11, PRJ-02/03, LEAD-02, SIM-05/08, FLAG-01..03, COM-01, clause 25.6.
--
-- Scope: predicates, listing/offer/coverage RPCs, privileges, interest snapshot columns, settings copy.
-- The intake (submit_interest_request) and the CRM view are NOT touched here: they are rebuilt by a
-- later migration once the public intake carries a parcel id. The snapshot columns are harmless until then.

-- ---------------------------------------------------------------------------
-- S1 · Back Office write path (the live catalog had no insert/update grant) and TRUNCATE hygiene
-- ---------------------------------------------------------------------------

grant insert, update on public.projects, public.parcels, public.project_costs to authenticated;
-- delete stays revoked (no delete policy). TRUNCATE bypasses RLS and was left by the default ACL.
revoke truncate on public.projects, public.parcels, public.project_costs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- S2 · The calculator is only reachable through the offer RPCs from now on
-- ---------------------------------------------------------------------------

revoke execute on function public.compute_installment_plan(bigint, bigint, bigint, jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- S3 · Gate predicates (unexposed app schema; callers of the public RPCs never reach them)
-- ---------------------------------------------------------------------------

create or replace function app.flag_state(p_key text) returns public.flag_state
language sql stable security definer set search_path = '' as $$
  select coalesce((select f.state from public.feature_flags f where f.key = p_key), 'disabled'::public.flag_state)
$$;
revoke execute on function app.flag_state(text) from public, anon, authenticated;

create or replace function app.module_open(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case app.flag_state(p_key)
           when 'public'   then true
           when 'internal' then app.is_staff()
           else false
         end
$$;
revoke execute on function app.module_open(text) from public, anon, authenticated;

create or replace function app.project_public_statuses() returns public.project_status[]
language sql stable security definer set search_path = '' as $$
  select array['published'::public.project_status]
         || case when app.setting_bool('projects.list_closed', true)
                 then array['sold_out', 'operating']::public.project_status[]
                 else '{}'::public.project_status[] end
$$;
revoke execute on function app.project_public_statuses() from public, anon, authenticated;

create or replace function app.project_visible(p_status public.project_status) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.module_open('projects')
     and (p_status = any (app.project_public_statuses())
          or (p_status = 'internal' and app.is_staff()))
$$;
revoke execute on function app.project_visible(public.project_status) from public, anon, authenticated;

create or replace function app.parcel_offer_statuses() returns public.parcel_status[]
language sql stable security definer set search_path = '' as $$
  select array['available'::public.parcel_status]
         || case when app.setting_bool('projects.offer_includes_interested', false)
                 then array['interested']::public.parcel_status[]
                 else '{}'::public.parcel_status[] end
$$;
revoke execute on function app.parcel_offer_statuses() from public, anon, authenticated;

-- THE single definition of "offered": closed (sold_out/operating) projects never price a parcel.
create or replace function app.parcel_offered(p_project public.project_status, p_parcel public.parcel_status) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_project = 'published' and p_parcel = any (app.parcel_offer_statuses())
$$;
revoke execute on function app.parcel_offered(public.project_status, public.parcel_status) from public, anon, authenticated;

create or replace function app.parcel_visible_status(p_status public.parcel_status) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_status <> 'withdrawn'
     and (p_status = any (app.parcel_offer_statuses())
          or app.setting_bool('projects.show_taken_parcels', true))
$$;
revoke execute on function app.parcel_visible_status(public.parcel_status) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- S4 · Offer payload builder (no status/flag checks: the callers gate).
-- p_force_price = true (staff card) computes plans whenever cash > 0 regardless of status.
-- Never returns the pricing JSON, model, markup_pct, brackets, rates, max_months or min_down_pct.
-- ---------------------------------------------------------------------------

create or replace function app.parcel_offer_payload(
  p_parcel uuid, p_down_option uuid, p_installment_option uuid, p_force_price boolean
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pa        public.parcels;
  v_pj        public.projects;
  v_offered   boolean;
  v_priced    boolean;
  v_pricing   jsonb;
  v_max       integer;
  v_downs     jsonb;
  v_insts     jsonb;
  v_plans     jsonb := '[]'::jsonb;
  v_examples  jsonb := '[]'::jsonb;
  v_entry     jsonb;
  v_chosen    jsonb;
  v_d         public.option_items;
  v_i         public.option_items;
  v_tree      uuid;
  v_scen      uuid;
  v_scen_n    integer;
begin
  if p_parcel is null then
    return null;
  end if;
  select * into v_pa from public.parcels where id = p_parcel;
  if not found then
    return null;
  end if;
  select * into v_pj from public.projects where id = v_pa.project_id;

  v_offered := app.parcel_offered(v_pj.status, v_pa.status);
  v_priced  := (v_offered or coalesce(p_force_price, false)) and v_pa.cash_price_millimes > 0;
  v_pricing := app.parcel_pricing(p_parcel);
  v_max     := greatest(1, least(5, app.setting_int('projects.installment_examples', 3)));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'code', o.code, 'label_ar', o.label_ar, 'min_millimes', o.min_millimes
         ) order by o.min_millimes, o.sort_order), '[]'::jsonb)
  into v_downs
  from (
    select oi.id, oi.code, oi.label_ar, oi.min_millimes, oi.sort_order
    from public.option_items oi
    where oi.list_key = 'down_payment' and oi.is_active and oi.min_millimes is not null
    order by oi.min_millimes, oi.sort_order
    limit 10
  ) o;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'code', o.code, 'label_ar', o.label_ar, 'min_millimes', o.min_millimes
         ) order by o.min_millimes, o.sort_order), '[]'::jsonb)
  into v_insts
  from (
    select oi.id, oi.code, oi.label_ar, oi.min_millimes, oi.sort_order
    from public.option_items oi
    where oi.list_key = 'monthly_installment' and oi.is_active and oi.min_millimes is not null
    order by oi.min_millimes, oi.sort_order
    limit 10
  ) o;

  if v_priced then
    -- Full down × installment matrix; every element strips the pricing parameters.
    select coalesce(jsonb_agg(x.plan order by x.down_millimes, x.installment_millimes), '[]'::jsonb)
    into v_plans
    from (
      select d.min_millimes as down_millimes,
             i.min_millimes as installment_millimes,
             (public.compute_installment_plan(v_pa.cash_price_millimes, d.min_millimes, i.min_millimes, v_pricing)
                - 'model' - 'markup_pct' - 'max_months')
             || jsonb_build_object(
                  'down_option_id', d.id, 'installment_option_id', i.id,
                  'down_millimes', d.min_millimes, 'installment_millimes', i.min_millimes
                ) as plan
      from jsonb_to_recordset(v_downs) as d(id uuid, min_millimes bigint)
      cross join jsonb_to_recordset(v_insts) as i(id uuid, min_millimes bigint)
    ) x;

    -- Worked examples: the smallest down payment, installments ascending, ok plans only.
    select coalesce(jsonb_agg(s.e order by (s.e->>'installment_millimes')::bigint), '[]'::jsonb)
    into v_examples
    from (
      select e
      from jsonb_array_elements(v_plans) e
      where (e->>'ok')::boolean
        and (e->>'down_option_id')::uuid = (v_downs->0->>'id')::uuid
      order by (e->>'installment_millimes')::bigint
      limit v_max
    ) s;

    v_entry := v_examples->0;
  end if;

  -- The visitor's own choice (option ids only, never free amounts) with SIM-05 nearest hints.
  if p_down_option is not null or p_installment_option is not null then
    v_d := app.active_option('down_payment', p_down_option::text);
    v_i := app.active_option('monthly_installment', p_installment_option::text);
    if v_d.id is null or v_i.id is null then
      raise exception 'invalid_choice' using errcode = 'P0001';
    end if;
    if v_priced then
      select e into v_chosen
      from jsonb_array_elements(v_plans) e
      where (e->>'down_option_id')::uuid = v_d.id
        and (e->>'installment_option_id')::uuid = v_i.id
      limit 1;
      v_chosen := coalesce(v_chosen, jsonb_build_object(
                    'ok', false, 'reason', 'invalid_input',
                    'down_option_id', v_d.id, 'installment_option_id', v_i.id,
                    'down_millimes', v_d.min_millimes, 'installment_millimes', v_i.min_millimes))
                  || jsonb_build_object(
                    'nearest_installment_option_id', (
                      select (e->>'installment_option_id')::uuid
                      from jsonb_array_elements(v_plans) e
                      where (e->>'ok')::boolean and (e->>'down_option_id')::uuid = v_d.id
                      order by (e->>'installment_millimes')::bigint
                      limit 1),
                    'nearest_down_option_id', (
                      select (e->>'down_option_id')::uuid
                      from jsonb_array_elements(v_plans) e
                      where (e->>'ok')::boolean and (e->>'installment_option_id')::uuid = v_i.id
                      order by (e->>'down_millimes')::bigint
                      limit 1));
    end if;
  end if;

  -- Continuity with the home chooser: the parcel's own tree count (never derived from area, PARC-02).
  if v_pa.property_type <> 'bare_land' then
    select oi.id into v_tree
    from public.option_items oi
    where oi.list_key = 'tree_count' and oi.is_active and oi.min_number is not null
      and coalesce(v_pa.olive_tree_count, 0) between oi.min_number and coalesce(oi.max_number, 2147483647)
    order by oi.min_number
    limit 1;
  end if;

  select count(*), min(s.id::text)::uuid into v_scen_n, v_scen
  from public.ownership_scenarios s
  where s.is_active and not s.is_any
    and (s.project_type_id is null or s.project_type_id = v_pj.project_type_id)
    and (s.plantation_system is null or s.plantation_system = v_pa.plantation_system)
    and (s.production_status is null or s.production_status = v_pa.production_status)
    and (s.project_type_id is not null or s.plantation_system is not null or s.production_status is not null);
  if v_scen_n <> 1 then
    v_scen := null;
  end if;

  return jsonb_build_object(
    'parcel_id', v_pa.id,
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'project_name', v_pj.name,
    'parcel_code', v_pa.code,
    'parcel_status', v_pa.status,
    'project_status', v_pj.status,
    'offered', v_offered,
    'priced', v_priced,
    'cash_price_millimes', case when v_priced then v_pa.cash_price_millimes end,
    'annual_costs_millimes', case when v_offered or coalesce(p_force_price, false) then v_pa.annual_costs_millimes end,
    'down_from_millimes', case when v_priced then (v_downs->0->>'min_millimes')::bigint end,
    'down_options', v_downs,
    'installment_options', v_insts,
    'plans', v_plans,
    'examples', v_examples,
    'examples_max', v_max,
    'entry', v_entry,
    'chosen', v_chosen,
    'suggested_tree_count_option_id', v_tree,
    'suggested_scenario_id', v_scen
  );
end $$;
revoke execute on function app.parcel_offer_payload(uuid, uuid, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- S5 · Public project listing (whitelisted columns; cover_* reserved for project media, null now)
-- ---------------------------------------------------------------------------

create or replace function public.public_projects()
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
  parcels_total integer,
  parcels_offered integer,
  min_cash_price_millimes bigint,
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
    (pj.status = 'published') as offered,
    a.parcels_total, a.parcels_offered, a.min_cash, a.min_area, a.max_area, a.parcel_trees,
    null::text as cover_url, null::text as cover_alt_ar, null::text as cover_aspect
  from public.projects pj
  left join lateral (
    select
      (count(*) filter (where pa.status <> 'withdrawn'))::integer as parcels_total,
      (count(*) filter (where app.parcel_offered(pj.status, pa.status) and pa.cash_price_millimes > 0))::integer as parcels_offered,
      min(pa.cash_price_millimes) filter (where app.parcel_offered(pj.status, pa.status) and pa.cash_price_millimes > 0) as min_cash,
      min(pa.area_m2) filter (where pa.status <> 'withdrawn') as min_area,
      max(pa.area_m2) filter (where pa.status <> 'withdrawn') as max_area,
      (sum(pa.olive_tree_count) filter (where pa.status <> 'withdrawn'))::integer as parcel_trees
    from public.parcels pa
    where pa.project_id = pj.id
  ) a on true
  where app.project_visible(pj.status)
  order by (pj.status = 'published') desc, pj.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- S6 · Public parcel listing (bounded in SQL, no plan computation here)
-- ---------------------------------------------------------------------------

create or replace function public.public_parcels()
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

-- ---------------------------------------------------------------------------
-- S7 · Offer RPCs: one anon-callable (gated), one staff-only (ungated, for the Back Office card)
-- ---------------------------------------------------------------------------

create or replace function public.public_parcel_offer(
  p_parcel uuid, p_down_option uuid default null, p_installment_option uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pj_status public.project_status;
  v_pa_status public.parcel_status;
begin
  if p_parcel is null then
    return null;
  end if;
  select pj.status, pa.status into v_pj_status, v_pa_status
  from public.parcels pa
  join public.projects pj on pj.id = pa.project_id
  where pa.id = p_parcel;
  if not found or not app.project_visible(v_pj_status) or not app.parcel_visible_status(v_pa_status) then
    return null;
  end if;
  -- Taken parcels return offered = false with empty plans so shared links never 404.
  return app.parcel_offer_payload(p_parcel, p_down_option, p_installment_option, false);
end $$;

create or replace function public.staff_parcel_offer(
  p_parcel uuid, p_down_option uuid default null, p_installment_option uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app.parcel_offer_payload(p_parcel, p_down_option, p_installment_option, true);
end $$;

-- ---------------------------------------------------------------------------
-- S8 · Coverage per governorate (counts only, no money)
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
    (count(distinct pj.id))::integer as projects_count,
    (count(pa.id) filter (where pa.status <> 'withdrawn'))::integer as parcels_total,
    (count(pa.id) filter (where app.parcel_offered(pj.status, pa.status) and pa.cash_price_millimes > 0))::integer as parcels_offered
  from public.projects pj
  left join public.parcels pa on pa.project_id = pj.id
  where app.project_visible(pj.status)
  group by pj.governorate_id
  order by pj.governorate_id
$$;

-- ---------------------------------------------------------------------------
-- S9 · Privileges: revoke before grant (default privileges hand PUBLIC execute to new functions)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.public_projects(),
  public.public_parcels(),
  public.public_parcel_offer(uuid, uuid, uuid),
  public.public_coverage()
from public;
grant execute on function
  public.public_projects(),
  public.public_parcels(),
  public.public_parcel_offer(uuid, uuid, uuid),
  public.public_coverage()
to anon, authenticated;

revoke execute on function public.staff_parcel_offer(uuid, uuid, uuid) from public, anon;
grant execute on function public.staff_parcel_offer(uuid, uuid, uuid) to authenticated;

comment on function public.public_projects() is
  'Public listing surface (PUB-01): whitelisted columns, gated on the projects flag and app.project_visible(). Never pricing formulas, project_costs, legal_notes, notes, land_offer_id, plan_storage_path, coordinates, staff ids (PRJ-03).';
comment on function public.public_parcels() is
  'Public listing surface (PUB-01): whitelisted columns, gated on the projects flag and app.project_visible(). Never pricing formulas, project_costs, legal_notes, notes, land_offer_id, plan_storage_path, coordinates, staff ids (PRJ-03).';
comment on function public.public_parcel_offer(uuid, uuid, uuid) is
  'Public listing surface (PUB-01): whitelisted columns, gated on the projects flag and app.project_visible(). Never pricing formulas, project_costs, legal_notes, notes, land_offer_id, plan_storage_path, coordinates, staff ids (PRJ-03).';
comment on function public.public_coverage() is
  'Public listing surface (PUB-01): whitelisted columns, gated on the projects flag and app.project_visible(). Never pricing formulas, project_costs, legal_notes, notes, land_offer_id, plan_storage_path, coordinates, staff ids (PRJ-03).';
comment on function public.staff_parcel_offer(uuid, uuid, uuid) is
  'Back Office offer card: same payload builder as public_parcel_offer(), staff only (app.is_staff()), no flag or status gate, plans computed whenever the parcel has a cash price.';

-- ---------------------------------------------------------------------------
-- S10 · Interest snapshot columns (LEAD-02 typed-column convention + SIM-08 plan figures).
-- Filled by the public intake in a later migration; harmless until then.
-- ---------------------------------------------------------------------------

alter table public.interest_requests
  add column if not exists parcel_id uuid references public.parcels (id) on delete set null,
  add column if not exists project_id uuid references public.projects (id) on delete set null,
  add column if not exists project_code text,
  add column if not exists project_name text,
  add column if not exists parcel_code text,
  add column if not exists parcel_area_m2 numeric(12, 2),
  add column if not exists parcel_property_type text,
  add column if not exists parcel_plantation_system text,
  add column if not exists parcel_olive_tree_count integer,
  add column if not exists parcel_production_status text,
  add column if not exists parcel_cash_price_millimes bigint,
  add column if not exists parcel_plan_months integer,
  add column if not exists parcel_plan_total_millimes bigint,
  add column if not exists parcel_plan_last_millimes bigint,
  add column if not exists parcel_captured_at timestamptz;

create index if not exists interest_requests_parcel_idx
  on public.interest_requests (parcel_id) where parcel_id is not null;

comment on column public.interest_requests.parcel_id is
  'Parcel the citizen named on the public site; snapshot columns keep what was shown (LEAD-02). Never the pricing formula.';

-- ---------------------------------------------------------------------------
-- S13 · Settings: page copy, limits and the two owner decisions (D-15 / clause 11.1)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('projects.title', to_jsonb('اختر قطعتك'::text), 'text', 'projects', 'عنوان صفحة المشاريع',
   'عنوان صفحة /projects وعنوان شاشة «قريباً». (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 10),
  ('projects.intro', to_jsonb('كل قطعة عندها مساحتها وعدد زيتوناتها ونوع غراستها وحالة إنتاجها. معطيات مستقلّة، ما نحسبوش وحدة من الأخرى. اختار اللي يشبهك.'::text), 'text', 'projects', 'مقدّمة صفحة المشاريع',
   'النص تحت العنوان (PARC-01/02). (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 20),
  ('projects.filters_hint', to_jsonb('صفّي حسب الولاية أو نمط التملك أو المساحة أو عدد الزيتونات. الأراضي البيضاء تظهر دايماً مهما كان عدد الزيتونات المختار.'::text), 'text', 'projects', 'تلميح الفلاتر',
   'النص فوق صف الفلاتر؛ يشرح قاعدة الأراضي البيضاء. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 30),
  ('projects.empty_text', to_jsonb('ما فماش قطع متاحة بهذه المعايير توّا. سجّل مطلبك ونعلموك أول ما تتوفر قطعة تشبه اللي تحب.'::text), 'text', 'projects', 'نص القائمة الفارغة',
   'يظهر عندما لا تطابق أي قطعة الفلاتر. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 40),
  ('projects.open_title', to_jsonb('المشاريع المفتوحة'::text), 'text', 'projects', 'عنوان المشاريع المفتوحة',
   'عنوان شريط المشاريع المنشورة. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 50),
  ('projects.closed_title', to_jsonb('مشاريع مكتملة'::text), 'text', 'projects', 'عنوان المشاريع المكتملة',
   'عنوان القائمة الفرعية للمشاريع المكتملة أو في طور الاستغلال. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 60),
  ('projects.detail_parcels_title', to_jsonb('القطع في هذا المشروع'::text), 'text', 'projects', 'عنوان قطع المشروع',
   'عنوان قائمة القطع في صفحة المشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 70),
  ('projects.taken_hint', to_jsonb('القطع المحجوزة أو المتعاقد عليها تظهر للمعلومة فقط، بلا سعر.'::text), 'text', 'projects', 'تلميح القطع غير المعروضة',
   'فوق صفوف القطع المحجوزة في صفحة المشروع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 80),
  ('projects.taken_text', to_jsonb('هذه القطعة ما عادش معروضة. تنجم تسجّل اهتمامك بقطعة مشابهة ونعلموك أول ما تتوفر.'::text), 'text', 'projects', 'نص القطعة غير المعروضة',
   'صفحة القطعة عندما لا تكون معروضة. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 90),
  ('projects.taken_cta', to_jsonb('سجّل اهتمامك بقطعة مشابهة'::text), 'text', 'projects', 'زر القطعة غير المعروضة',
   'نص الزر على القطع غير المعروضة (رابط بلا معرّف القطعة). (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 100),
  ('projects.price_pending', to_jsonb('السعر يُعلن لاحقاً.'::text), 'text', 'projects', 'نص السعر غير المحدّد',
   'يظهر عندما تكون القطعة معروضة بلا سعر حاضر. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 110),
  ('projects.examples_title', to_jsonb('أمثلة على الدفع بالتقسيط'::text), 'text', 'projects', 'عنوان أمثلة التقسيط',
   'عنوان كتلة الأمثلة. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 120),
  ('projects.examples_note', to_jsonb('هذه أمثلة محسوبة بالتسبقة الأصغر من القائمة وبصيغة التسعير الحالية، وهي إرشادية وقابلة للتغيير. السعر الجملي يشمل كل شيء ولا توجد مصاريف خفية. المبلغ النهائي والمدة يُضبطان في وعد البيع.'::text), 'text', 'projects', 'ملاحظة أمثلة التقسيط',
   'تحت الأمثلة، وتُختم بها كل كتلة مال. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 130),
  ('projects.picker_title', to_jsonb('احسب حسب إمكانياتك'::text), 'text', 'projects', 'عنوان اختيار الخطة',
   'عنوان اختيار التسبقة والقسط في صفحة القطعة. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 140),
  ('projects.picker_nearest', to_jsonb('بهذه القيم ما يتحسبش قسط. اختر قسطاً من {installment} أو تسبقة من {down}.'::text), 'text', 'projects', 'جملة أقرب اختيار',
   'SIM-05: {installment} و{down} يُستبدلان بتسميات الخيارات. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 150),
  ('projects.parcel_cta', to_jsonb('أنا مهتم بهذه القطعة'::text), 'text', 'projects', 'زر الاهتمام بالقطعة',
   'نص الزر على القطع المعروضة. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 160),
  ('projects.interest_banner', to_jsonb('طلبك مرتبط بالقطعة {parcel} من مشروع {project}. تنجم تبدّل أي اختيار أو تحذف القطعة.'::text), 'text', 'projects', 'لافتة الطلب المرتبط بقطعة',
   'أعلى فورمولير التسجيل عندما يكون ?parcel صالحاً. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 170),
  ('projects.browse_cta', to_jsonb('شوف القطع اللي تناسبك'::text), 'text', 'projects', 'زر تصفّح القطع',
   'الزر الرئيسي في الصفحة الرئيسية عندما يكون قسم المشاريع منشوراً للعموم. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 180),
  ('projects.map_title', to_jsonb('وين تلقى قطعتك؟'::text), 'text', 'projects', 'عنوان صفحة الخريطة',
   'عنوان /projects/map. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 190),
  ('projects.map_text', to_jsonb('الأرقام هي عدد المشاريع والقطع المعروضة فعلاً في كل ولاية اليوم. الولايات بلا رقم مفتوحة للتسجيل، والطلبات هي اللي تقرّر وين نلوّجو بعد.'::text), 'text', 'projects', 'مقدّمة صفحة الخريطة',
   'النص تحت عنوان /projects/map. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 200),
  ('projects.map_empty_governorate', to_jsonb('ما عندناش مشروع في هذه الولاية توّا. سجّل مطلبك باش نعرفو وين نلوّجو.'::text), 'text', 'projects', 'نص الولاية بلا مشروع',
   'نص البطاقة للولايات بلا مشاريع. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 210),
  ('projects.meta_description', to_jsonb('قطع زيتون حقيقية بمساحتها وعدد زيتوناتها وسعرها حاضر أو بالتقسيط. بلا وعود.'::text), 'text', 'projects', 'وصف صفحة المشاريع لمحرّكات البحث',
   '<meta description> لصفحة /projects. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 220),
  ('legal.plan_notice', to_jsonb('مخطط تقسيم مبدئي، لا يمثل قسمة نهائية قبل استكمال الإجراءات القانونية اللازمة.'::text), 'text', 'legal', 'تنبيه مخطط التقسيم',
   'يُطبع تحت كل صورة مخطط (PRJ-02). (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)', true, 50),
  ('projects.installment_examples', to_jsonb(3), 'integer', 'projects', 'عدد أمثلة التقسيط',
   'عدد الأمثلة المحسوبة التي تُرجعها خدمة العرض (من 1 إلى 5).', true, 300),
  ('projects.listing_limit', to_jsonb(300), 'integer', 'projects', 'الحد الأقصى لقائمة القطع',
   'أقصى عدد صفوف تُرجعها public_parcels() (من 20 إلى 1000، يُفرض في قاعدة البيانات).', true, 310),
  ('projects.list_closed', to_jsonb(true), 'boolean', 'projects', 'عرض المشاريع المكتملة',
   'عرض المشاريع المكتملة أو في طور الاستغلال كمشاريع مغلقة (شارات فقط، بلا سعر أبداً).', true, 320),
  ('projects.show_taken_parcels', to_jsonb(true), 'boolean', 'projects', 'عرض القطع غير المعروضة',
   'عرض القطع المحجوزة أو في طور التعاقد أو المتعاقد عليها (والمهتم بها عندما لا تكون معروضة) بشارة وبلا سعر.', true, 330),
  ('projects.offer_includes_interested', to_jsonb(false), 'boolean', 'projects', 'القطع «مهتم بها» تبقى معروضة',
   'القرار D-15: عندما يكون مفعّلاً تبقى القطع «مهتم بها» بسعر ورابط وقابلة للربط بطلب اهتمام.', false, 340),
  ('projects.interest_marks_parcel', to_jsonb(false), 'boolean', 'projects', 'طلب الاهتمام يغيّر حالة القطعة',
   'البند 11.1: عندما يكون مفعّلاً ينقل طلب اهتمام عمومي قطعة «متاحة» إلى «مهتم بها» في نفس المعاملة.', false, 350)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- S14 · Documentation on the base tables (no table, view, bucket or index touched)
-- ---------------------------------------------------------------------------

comment on policy projects_select on public.projects is
  'Staff read the tables; visitors read only through public_projects()/public_parcels() (0020).';
comment on policy parcels_select on public.parcels is
  'Staff read the tables; visitors read only through public_projects()/public_parcels() (0020).';
comment on column public.projects.location_description is
  'Public text on the project page — no internal remarks.';
