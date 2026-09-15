-- Project quote and parcel price on tree pricing (docs/plan-zitouna.md P5-2, Q-9, Q-13; addendum
-- docs/tree-area-and-cost.md; report v3 §12). A project sells trees with their area in the classes it lists
-- (project_spacing_classes, 0031), and a parcel is a group of those trees priced at trees × price per tree (Q-9).
-- Agreed with the projects session: public_project_quote / staff_project_quote serve the pages and the Back Office card,
-- app.parcel_price is the one definition of a parcel's price for listings, matching and snapshots, and their next
-- migration rebuilds the public listings on top of it. 0020's rule stays: only a published project prices publicly.

-- ---------------------------------------------------------------------------
-- S1 · The class of a parcel
-- ---------------------------------------------------------------------------

alter table public.parcels
  add column spacing_class_id uuid references public.tree_spacing_classes (id) on delete restrict;

create index parcels_spacing_class_idx on public.parcels (spacing_class_id) where spacing_class_id is not null;

comment on column public.parcels.spacing_class_id is
  'Spacing class of the parcel trees (plan Q-9), one of its project''s classes. Null means the project''s only class; a project with several classes needs it set. Unused while the project lists no class (legacy pricing).';

-- A parcel may only use a class its project sells. The shared lock on the project row waits for a concurrent
-- staff_save_project_spacing_classes, which holds that row «for no key update», so the two checks cannot cross.
create or replace function app.check_parcel_spacing_class() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.spacing_class_id is not null then
    perform 1 from public.projects pj where pj.id = new.project_id for share;
    if not exists (select 1 from public.project_spacing_classes pc
                   where pc.project_id = new.project_id and pc.spacing_class_id = new.spacing_class_id) then
      raise exception 'parcel_spacing_not_in_project' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function app.check_parcel_spacing_class() from public, anon, authenticated;

create trigger parcels_spacing_class_check before insert or update of spacing_class_id, project_id on public.parcels
  for each row execute function app.check_parcel_spacing_class();

-- A project cannot drop a class one of its parcels uses: the parcel must change class first.
create or replace function app.check_project_class_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.project_id = old.project_id and new.spacing_class_id = old.spacing_class_id then
    return new;
  end if;
  if exists (select 1 from public.parcels pa
             where pa.project_id = old.project_id and pa.spacing_class_id = old.spacing_class_id) then
    raise exception 'spacing_used_by_parcels' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
revoke execute on function app.check_project_class_in_use() from public, anon, authenticated;

create trigger project_spacing_classes_in_use before update or delete on public.project_spacing_classes
  for each row execute function app.check_project_class_in_use();

-- 0031 rebuilt: only the classes left out are deleted and only new ones inserted, so saving a list that keeps a
-- class in use passes the guard above. An empty array still clears the list (every active class again).
create or replace function public.staff_save_project_spacing_classes(p_project uuid, p_class_ids uuid[], p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
  v_ids     uuid[];
  v_old     jsonb;
  v_new     jsonb;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- The project row lock serialises concurrent saves; «no key update» leaves foreign-key checks free.
  select pj.id into v_project from public.projects pj where pj.id = p_project for no key update;
  if v_project is null then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;
  if p_class_ids is null or array_position(p_class_ids, null) is not null then
    raise exception 'invalid_spacing_class' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_class_ids) x;
  if (select count(*) from public.tree_spacing_classes c where c.id = any (v_ids) and c.is_active) <> cardinality(v_ids) then
    raise exception 'invalid_spacing_class' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('spacing_class_id', c.id, 'code', c.code, 'area_m2', c.area_m2)
                            order by c.sort_order, c.code), '[]'::jsonb)
  into v_old
  from public.project_spacing_classes pc
  join public.tree_spacing_classes c on c.id = pc.spacing_class_id
  where pc.project_id = p_project;

  delete from public.project_spacing_classes pc where pc.project_id = p_project and pc.spacing_class_id <> all (v_ids);
  insert into public.project_spacing_classes (project_id, spacing_class_id, created_by)
  select p_project, x, auth.uid() from unnest(v_ids) x
  on conflict (project_id, spacing_class_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object('spacing_class_id', c.id, 'code', c.code, 'area_m2', c.area_m2)
                            order by c.sort_order, c.code), '[]'::jsonb)
  into v_new
  from public.tree_spacing_classes c
  where c.id = any (v_ids);

  perform app.write_audit('pricing.project_classes_save', 'project_spacing_classes', p_project::text,
                          jsonb_build_object('project_id', p_project, 'classes', v_old),
                          jsonb_build_object('project_id', p_project, 'classes', v_new), null);
end $$;

-- ---------------------------------------------------------------------------
-- S2 · Which class a project prices, and the price of a parcel
-- ---------------------------------------------------------------------------

create or replace function app.project_on_tree_pricing(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_spacing_classes pc where pc.project_id = p_project)
$$;
revoke execute on function app.project_on_tree_pricing(uuid) from public, anon, authenticated;

-- The given class when the project sells it, otherwise the project's only class. status: 'ok', 'required' (several
-- classes and none given), 'not_allowed' (not one of them) or 'legacy' (the project lists no class).
create or replace function app.project_spacing_choice(
  p_project uuid, p_spacing_class uuid, out spacing_class_id uuid, out status text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(pc.spacing_class_id), '{}') into v_ids
  from public.project_spacing_classes pc
  where pc.project_id = p_project;

  if cardinality(v_ids) = 0 then
    status := 'legacy';
  elsif p_spacing_class is not null then
    if p_spacing_class = any (v_ids) then
      spacing_class_id := p_spacing_class;
      status := 'ok';
    else
      status := 'not_allowed';
    end if;
  elsif cardinality(v_ids) = 1 then
    spacing_class_id := v_ids[1];
    status := 'ok';
  else
    status := 'required';
  end if;
end $$;
revoke execute on function app.project_spacing_choice(uuid, uuid) from public, anon, authenticated;

-- Plan Q-9: trees × price per tree of the parcel class in its project. A project without classes keeps the typed
-- cash price ('legacy'). reason says why a tree-priced parcel has no total: 'spacing_required', 'spacing_not_allowed',
-- 'spacing_not_found' (class retired), 'margin_not_set' or 'trees_missing'. No flag or status gate: callers gate.
create or replace function app.parcel_price(p_parcel uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pa     public.parcels;
  v_class  uuid;
  v_status text;
  v_area   numeric;
  v_trees  integer;
  v_price  jsonb;
  v_per    bigint;
  v_reason text;
begin
  select * into v_pa from public.parcels pa where pa.id = p_parcel;
  if not found then
    return null;
  end if;

  select c.spacing_class_id, c.status into v_class, v_status
  from app.project_spacing_choice(v_pa.project_id, v_pa.spacing_class_id) c;

  if v_status = 'legacy' then
    return jsonb_build_object(
      'on_tree_pricing', false,
      'spacing_class_id', null,
      'area_per_tree_m2', null,
      'trees', v_pa.olive_tree_count,
      'total_area_m2', v_pa.area_m2,
      'price_per_tree_millimes', null,
      -- A parcel saved under tree pricing stores 0, which is never a price.
      'cash_total_millimes', nullif(v_pa.cash_price_millimes, 0),
      'pricing', 'legacy',
      'reason', null);
  end if;

  select sc.area_m2 into v_area from public.tree_spacing_classes sc where sc.id = v_class;
  v_trees := case when v_pa.olive_tree_count >= 1 then v_pa.olive_tree_count end;

  if v_status <> 'ok' then
    v_reason := case v_status when 'required' then 'spacing_required' else 'spacing_not_allowed' end;
  else
    v_price := app.tree_price(v_class, v_pa.project_id);
    if coalesce((v_price->>'ok')::boolean, false) then
      v_per := (v_price->>'price_per_tree_millimes')::bigint;
    else
      v_reason := v_price->>'reason';
    end if;
    if v_reason is null and v_trees is null then
      v_reason := 'trees_missing';
    end if;
  end if;

  return jsonb_build_object(
    'on_tree_pricing', true,
    'spacing_class_id', v_class,
    'area_per_tree_m2', v_area,
    'trees', v_pa.olive_tree_count,
    'total_area_m2', v_area * v_trees,
    'price_per_tree_millimes', v_per,
    'cash_total_millimes', v_per * v_trees,
    -- 'ok' is exactly «both totals are known», which the listings built on this function rely on.
    'pricing', case when v_per is not null and v_trees is not null then 'ok' else 'unavailable' end,
    'reason', v_reason);
end $$;
revoke execute on function app.parcel_price(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- S3 · Project quote: one builder, a public and a staff entry point
-- ---------------------------------------------------------------------------

-- p_staff = true (Back Office card) skips the pricing flag and the published-only rule; the tree_price breakdown
-- and the markup are added only for Finance and Admin. The callers check visibility and roles.
create or replace function app.project_quote_payload(
  p_project uuid, p_spacing_class uuid, p_trees integer, p_payment_mode text,
  p_down_percent_option_id uuid, p_duration_option_id uuid, p_staff boolean
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pj        public.projects;
  v_class_id  uuid;
  v_spacing   text;
  v_class     public.tree_spacing_classes;
  v_max       integer;
  v_trees     integer;
  v_breakdown boolean := p_staff and app.can_price();
  v_pricing   text;
  v_priceable boolean;
  v_price     jsonb;
  v_per_tree  bigint;
  v_total     bigint;
  v_percent   public.option_items;
  v_duration  public.option_items;
  v_down      bigint;
  v_quote     jsonb;
  v_status    text;
  v_ok        boolean;
  v_inst      jsonb;
  v_choices   jsonb;
begin
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    return null;
  end if;

  select c.spacing_class_id, c.status into v_class_id, v_spacing
  from app.project_spacing_choice(v_pj.id, p_spacing_class) c;
  select * into v_class from public.tree_spacing_classes sc where sc.id = v_class_id;

  -- The /start limit, or the project's own tree count when it has one
  select greatest(app.setting_int('million.custom_trees_max', 5000), coalesce(max(o.min_number), 0)::integer)
  into v_max
  from public.option_items o
  where o.list_key = 'tree_count' and o.is_active;
  v_max   := coalesce(nullif(v_pj.tree_count, 0), v_max);
  v_trees := case when p_trees between 1 and v_max then p_trees end;

  -- 0020: sold out, operating and internal projects never price publicly.
  v_pricing := case
                 when not p_staff and not app.module_open('pricing') then 'closed'
                 when not p_staff and v_pj.status <> 'published' then 'not_offered'
                 when v_spacing = 'legacy' then 'legacy'
               end;
  v_priceable := v_pricing is null;

  if v_priceable then
    if v_spacing = 'ok' then
      v_price := app.tree_price(v_class_id, v_pj.id);
    end if;
    if coalesce((v_price->>'ok')::boolean, false) then
      v_pricing  := 'ok';
      v_per_tree := (v_price->>'price_per_tree_millimes')::bigint;
      v_total    := v_per_tree * v_trees;
    else
      v_pricing := 'unavailable';
    end if;
  end if;

  if v_pricing = 'ok' and p_payment_mode = 'installments' and v_trees is not null then
    if p_down_percent_option_id is null or p_duration_option_id is null then
      v_status := 'incomplete';
    else
      -- Plan P1-2: only a percentage this project offers
      select * into v_percent from app.project_down_percent_items(v_pj.id) o where o.id = p_down_percent_option_id;
      v_duration := app.active_option('duration', p_duration_option_id::text);
      v_down     := app.down_payment_from_percent(v_total, v_percent.min_number, v_pj.id);
      if v_percent.id is null or v_duration.id is null or v_down is null or v_duration.min_number is null then
        v_status := 'invalid_choice';
      else
        v_quote  := app.financed_quote(v_total, v_down, v_duration.min_number::integer, v_pj.id);
        v_status := case when (v_quote->>'ok')::boolean then 'ok' else v_quote->>'reason' end;
      end if;
    end if;
    v_ok := v_status = 'ok';
    v_inst := jsonb_build_object(
      'status', v_status,
      'down_payment_percent', case when v_ok then v_percent.min_number end,
      'down_payment_millimes', case when v_ok then (v_quote->>'down_payment_millimes')::bigint end,
      'months', case when v_ok then (v_quote->>'months')::integer end,
      'total_financed_millimes', case when v_ok then (v_quote->>'total_financed_millimes')::bigint end,
      'remaining_millimes', case when v_ok then (v_quote->>'remaining_millimes')::bigint end,
      'monthly_millimes', case when v_ok then (v_quote->>'monthly_millimes')::bigint end,
      'last_installment_millimes', case when v_ok then (v_quote->>'last_installment_millimes')::bigint end,
      'installments_count', case when v_ok then (v_quote->>'installments_count')::integer end,
      'shortened', case when v_ok then (v_quote->>'shortened')::boolean end
    );
    if v_breakdown then
      v_inst := v_inst || jsonb_build_object('markup_bp', case when v_ok then (v_quote->>'markup_bp')::integer end);
    end if;
  end if;

  -- What a page offers for this project: its active classes (with their price when the caller may see prices), its
  -- percentages, and the durations that have a markup within the months cap.
  select jsonb_build_object(
    'spacing_classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sc.id, 'label_ar', sc.label_ar, 'label_fr', sc.label_fr,
               'row_spacing_m', sc.row_spacing_m, 'tree_spacing_m', sc.tree_spacing_m, 'area_m2', sc.area_m2,
               'price_per_tree_millimes',
                 case when coalesce((tp.price->>'ok')::boolean, false) then (tp.price->>'price_per_tree_millimes')::bigint end)
             order by sc.sort_order, sc.code)
      from public.project_spacing_classes pc
      join public.tree_spacing_classes sc on sc.id = pc.spacing_class_id and sc.is_active
      cross join lateral (select case when v_priceable then app.tree_price(sc.id, v_pj.id) end as price) tp
      where pc.project_id = v_pj.id), '[]'::jsonb),
    'down_percents', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar, 'label_fr', o.label_fr, 'percent', o.min_number)
             order by o.min_number, o.sort_order)
      from app.project_down_percent_items(v_pj.id) o), '[]'::jsonb),
    'durations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar, 'label_fr', o.label_fr,
                                          'months', o.min_number::integer)
             order by o.min_number, o.sort_order)
      from public.option_items o
      where o.list_key = 'duration' and o.is_active
        and o.min_number between 1 and app.setting_int('pricing.max_months', 84)
        and exists (select 1 from public.financing_markups m
                    where m.months = o.min_number and (m.project_id is null or m.project_id = v_pj.id))), '[]'::jsonb))
  into v_choices;

  return jsonb_build_object(
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'on_tree_pricing', v_spacing <> 'legacy',
    'spacing_status', case when v_spacing <> 'legacy' then v_spacing end,
    'spacing_class_id', v_class.id,
    'label_ar', v_class.label_ar,
    'label_fr', v_class.label_fr,
    'row_spacing_m', v_class.row_spacing_m,
    'tree_spacing_m', v_class.tree_spacing_m,
    'area_per_tree_m2', v_class.area_m2,
    'trees', v_trees,
    'trees_max', v_max,
    'total_area_m2', v_class.area_m2 * v_trees,
    'pricing', v_pricing,
    'price_per_tree_millimes', case when v_pricing = 'ok' then v_per_tree end,
    'total_price_millimes', case when v_pricing = 'ok' then v_total end,
    'installments', v_inst,
    'choices', v_choices
  ) || case when v_breakdown then jsonb_build_object('price', v_price) else '{}'::jsonb end;
end $$;
revoke execute on function app.project_quote_payload(uuid, uuid, integer, text, uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.public_project_quote(
  p_project uuid, p_spacing_class uuid default null, p_trees integer default null, p_payment_mode text default null,
  p_down_percent_option_id uuid default null, p_duration_option_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status public.project_status;
begin
  select pj.status into v_status from public.projects pj where pj.id = p_project;
  if not found or not app.project_visible(v_status) then
    return null;
  end if;
  return app.project_quote_payload(p_project, p_spacing_class, p_trees, p_payment_mode,
                                   p_down_percent_option_id, p_duration_option_id, false);
end $$;

create or replace function public.staff_project_quote(
  p_project uuid, p_spacing_class uuid default null, p_trees integer default null, p_payment_mode text default null,
  p_down_percent_option_id uuid default null, p_duration_option_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app.project_quote_payload(p_project, p_spacing_class, p_trees, p_payment_mode,
                                   p_down_percent_option_id, p_duration_option_id, true);
end $$;

revoke execute on function public.public_project_quote(uuid, uuid, integer, text, uuid, uuid) from public;
grant execute on function public.public_project_quote(uuid, uuid, integer, text, uuid, uuid) to anon, authenticated;
revoke execute on function public.staff_project_quote(uuid, uuid, integer, text, uuid, uuid) from public, anon;
grant execute on function public.staff_project_quote(uuid, uuid, integer, text, uuid, uuid) to authenticated;

comment on function public.public_project_quote(uuid, uuid, integer, text, uuid, uuid) is
  'Project quote for the public pages (plan P5-2): the public_tree_quote figures with the project''s classes, rules, markups and percentages, plus its choices. Null unless app.project_visible(). pricing: ''closed'' (flag), ''not_offered'' (not published), ''legacy'' (no classes), ''unavailable'' or ''ok''. Never the land price, planting cost, extra costs, cost, margin, markup or notes.';
comment on function public.staff_project_quote(uuid, uuid, integer, text, uuid, uuid) is
  'Back Office twin of public_project_quote for any staff, without the pricing flag or the published-only rule. The tree_price breakdown (price) and installments.markup_bp only for Finance and Admin (app.can_price()).';
comment on function app.parcel_price(uuid) is
  'The price of a parcel (plan Q-9): trees × price per tree of its class in its project, or the stored cash price when the project lists no class (''legacy''). No flag or status gate: callers gate.';
