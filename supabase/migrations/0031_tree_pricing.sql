-- 0031 · Tree pricing: one olive tree together with its area is the sale unit
--
-- Addendum docs/tree-area-and-cost.md (owner, 2026-09-15): spacing classes give the area per tree; the cash price
-- per tree = area × land price per m² + planting cost per tree + extra cost lines + AgriZed margin (percent or
-- fixed amount). Every value is a Back Office parameter, globally with optional per-project overrides
-- («حسب قواعد المشروع»). The visitor sees trees, area per tree, total area, price per tree and total price only.
-- Report v3 §8: 84 months at most. §10-§11: the financed price is not the cash price; the admin sets it.
-- §12: what the client sees. §51-§53: cash price, down payment, total financed and monthly amount are four
-- different figures; Remaining = total financed − down payment; Monthly = Remaining ÷ months.
-- §54: bank financing is never computed here.
-- Plan docs/plan-zitouna.md, every recommendation approved by the owner on 2026-09-15:
--   Q-1/Q-2  the down payment is a percentage of the cash total, from a Back Office list a project may narrow;
--   Q-3      a markup percentage per duration; the monthly amount rounded up and a smaller last installment;
--            a duration without a markup is not priced;
--   Q-4      durations 36 / 48 / 60 / 84 months, capped by pricing.max_months;
--   Q-10     the pricing module starts internal (staff preview);
--   Q-13     each project may keep a subset of the global spacing classes (P1-7);
--   P1-8     default values: the owner's example (35 m² × 10 د + 50 د = 400 د → «السعر النهائي 500 د», a 25% margin)
--            and the owner's initial markups per duration, both flagged for review with Finance.

-- ---------------------------------------------------------------------------
-- System cap on durations (report v3 §8), enforced on the duration list, the markups and the setting itself
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('pricing.max_months', to_jsonb(84), 'integer', 'pricing', 'أقصى مدة للتقسيط بالأشهر',
   'أقصى مدة تقسيط يقبلها النظام. ما تنجمش تكون أقل من أطول مدة مفعّلة في قائمة المدد.', true, 20)
on conflict (key) do nothing;

create or replace function app.check_duration_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.min_number is null
     or new.min_number <> trunc(new.min_number)
     or new.min_number < 1
     or new.min_number > app.setting_int('pricing.max_months', 84) then
    raise exception 'duration_over_cap' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.check_duration_item() from public, anon, authenticated;

create trigger option_items_duration_cap before insert or update on public.option_items
  for each row when (new.list_key = 'duration') execute function app.check_duration_item();

-- Plan Q-4: four years joins the three durations seeded by 0030; sort_order equals the months.
insert into public.option_items (list_key, code, label_ar, label_fr, min_number, max_number, sort_order) values
  ('duration', 'd_48', '4 سنوات', '4 ans', 48, 48, 48)
on conflict (list_key, code) do nothing;

-- Lowering the cap below a live duration or markup would leave offers the system itself refuses.
create or replace function app.check_max_months_setting() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_text  text := new.value #>> '{}';
  v_cap   integer;
  v_floor integer;
begin
  if v_text is null or v_text !~ '^[0-9]{1,9}$' then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;
  v_cap := v_text::integer;
  if v_cap < 1 then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;
  select greatest(
           coalesce((select max(o.min_number) from public.option_items o where o.list_key = 'duration' and o.is_active), 0),
           coalesce((select max(m.months) from public.financing_markups m), 0))::integer
  into v_floor;
  if v_cap < v_floor then
    raise exception 'cap_below_durations' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.check_max_months_setting() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Down payment percentages (plan Q-1, Q-2, P1-2): a Back Office list, applied to the cash total
-- ---------------------------------------------------------------------------

insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('down_payment_percent', 'نسبة التسبقة', 'number_range',
   'نِسَب التسبقة اللي يختار منها الحريف كي يخلّص بالتقسيط، بالمئة في min_number وmax_number (أكثر من 0 وحتى 100). التسبقة تتحسب من السعر الجملي بالحاضر، مقرّبة لخطوة تقريب السعر، وكل مشروع ينجم يحصرها في جزء منها. القيم 10% و20% و30% أمثلة من المالك، تُراجع مع المالية قبل نشر الأسعار.')
on conflict (key) do nothing;

create or replace function app.check_down_percent_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.min_number is null or new.min_number <= 0 or new.min_number > 100
     or (new.max_number is not null and new.max_number <> new.min_number) then
    raise exception 'invalid_down_payment_percent' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.check_down_percent_item() from public, anon, authenticated;

create trigger option_items_down_percent_range before insert or update on public.option_items
  for each row when (new.list_key = 'down_payment_percent') execute function app.check_down_percent_item();

-- The owner's example values (plan §1: «مثلاً 10% ولا 20% ولا 30%»); sort_order equals the percentage.
insert into public.option_items (list_key, code, label_ar, label_fr, min_number, max_number, sort_order) values
  ('down_payment_percent', 'dpp_10', '10%', '10 %', 10, 10, 10),
  ('down_payment_percent', 'dpp_20', '20%', '20 %', 20, 20, 20),
  ('down_payment_percent', 'dpp_30', '30%', '30 %', 30, 30, 30)
on conflict (list_key, code) do nothing;

-- ---------------------------------------------------------------------------
-- Module flag: internal until the owner publishes it from the modules page
-- ---------------------------------------------------------------------------

insert into public.feature_flags (key, state, phase, label_ar, description_ar, sort_order) values
  ('pricing', 'internal', 1, 'التسعير',
   'يعرض في صفحة /start سعر الزيتونة والسعر الجملي للطلب وأرقام التقسيط (إضافة «مساحة وتكلفة الزيتونة»، التقرير v3 البند 12). «داخلي فقط»: يراها فريق AgriZed وحده للمعاينة قبل النشر للعموم.',
   36)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Who may read and change pricing parameters (PRJ-03: costs and margins stay with Finance and Admin)
-- ---------------------------------------------------------------------------

create or replace function app.can_price() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])
$$;
revoke execute on function app.can_price() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spacing classes: the area attached to one tree (addendum table)
-- ---------------------------------------------------------------------------

create table public.tree_spacing_classes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  label_ar        text not null check (char_length(btrim(label_ar)) >= 1 and char_length(label_ar) <= 120),
  label_fr        text check (label_fr is null or char_length(label_fr) <= 120),
  row_spacing_m   numeric(6, 2) not null check (row_spacing_m > 0),
  tree_spacing_m  numeric(6, 2) not null check (tree_spacing_m > 0),
  area_m2         numeric(10, 2) generated always as (row_spacing_m * tree_spacing_m) stored,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);

create index tree_spacing_classes_sort_idx on public.tree_spacing_classes (sort_order, code);
create trigger tree_spacing_classes_stamp before update on public.tree_spacing_classes
  for each row execute function app.stamp_updated();
create trigger tree_spacing_classes_audit after insert or update or delete on public.tree_spacing_classes
  for each row execute function app.audit_row_change();

comment on table public.tree_spacing_classes is
  'Spacing classes and the area attached to one olive tree (addendum docs/tree-area-and-cost.md). Visitors read active classes; changes go through staff_save_spacing_class / staff_delete_spacing_class.';

insert into public.tree_spacing_classes (code, label_ar, label_fr, row_spacing_m, tree_spacing_m, sort_order) values
  ('trad_wide_24x24', 'تقليدي واسع',        'Traditionnel large',           24, 24,  10),
  ('trad_14x14',      'تقليدي',             'Traditionnel',                 14, 14,  20),
  ('semi_10x10',      'تقليدي / شبه مكثّف', 'Traditionnel / semi-intensif', 10, 10,  30),
  ('int_7x7',         'مكثّف',              'Intensif',                      7,  7,  40),
  ('int_7x5',         'مكثّف',              'Intensif',                      7,  5,  50),
  ('int_5x5',         'مكثّف',              'Intensif',                      5,  5,  60),
  ('super_4x2',       'مكثّف جداً',         'Super intensif',                4,  2,  70),
  ('super_4x1_5',     'مكثّف جداً',         'Super intensif',                4,  1.5, 80)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Pricing rules: one global row, optional per-project overrides (null field = inherit the global value)
-- ---------------------------------------------------------------------------

create table public.tree_pricing_rules (
  id                               uuid primary key default gen_random_uuid(),
  project_id                       uuid unique references public.projects (id),
  land_price_per_m2_millimes       bigint check (land_price_per_m2_millimes >= 0),
  planting_cost_per_tree_millimes  bigint check (planting_cost_per_tree_millimes >= 0),
  margin_mode                      text check (margin_mode in ('percent', 'fixed')),
  margin_percent_bp                integer check (margin_percent_bp between 0 and 100000),
  margin_fixed_millimes            bigint check (margin_fixed_millimes >= 0),
  price_rounding_millimes          bigint check (price_rounding_millimes >= 1),
  monthly_rounding_millimes        bigint check (monthly_rounding_millimes >= 1),
  use_global_cost_items            boolean not null default true,
  note_ar                          text check (note_ar is null or char_length(note_ar) <= 1000),
  markups_note_ar                  text check (markups_note_ar is null or char_length(markups_note_ar) <= 1000),
  updated_at                       timestamptz not null default now(),
  updated_by                       uuid references public.profiles (id),
  constraint tree_pricing_rules_margin_check check (
    margin_mode is null
    or (margin_mode = 'percent' and margin_percent_bp is not null)
    or (margin_mode = 'fixed' and margin_fixed_millimes is not null)),
  constraint tree_pricing_rules_global_check check (
    project_id is not null
    or (land_price_per_m2_millimes is not null and planting_cost_per_tree_millimes is not null
        and price_rounding_millimes is not null and monthly_rounding_millimes is not null))
);

create unique index tree_pricing_rules_one_global on public.tree_pricing_rules ((project_id is null))
  where project_id is null;
create trigger tree_pricing_rules_stamp before update on public.tree_pricing_rules
  for each row execute function app.stamp_updated();
create trigger tree_pricing_rules_audit after insert or update or delete on public.tree_pricing_rules
  for each row execute function app.audit_row_change();

comment on table public.tree_pricing_rules is
  'Tree pricing parameters (addendum): land price per m², planting cost per tree, AgriZed margin, rounding. project_id null is the global rule; in a project row a null field inherits the global value. Finance and Admin only (PRJ-03).';
comment on column public.tree_pricing_rules.note_ar is
  'Internal note on where the rule values come from and what still needs Finance review. Never shown to visitors.';
comment on column public.tree_pricing_rules.markups_note_ar is
  'Internal note on the markups per duration of this scope (report v3 §10-§11). Never shown to visitors.';

-- Plan P1-8 defaults: 10 د/م² and 50 د per tree (addendum), and the 25% margin of the owner's own example.
insert into public.tree_pricing_rules
  (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes, margin_mode, margin_percent_bp,
   price_rounding_millimes, monthly_rounding_millimes, note_ar, markups_note_ar)
select null, 10000, 50000, 'percent', 2500, 1000, 1000,
       'هامش 25% مأخوذ من مثال المالك (زيتونة 35 م² ← 500 د). يُراجع مع المالية قبل نشر الأسعار.',
       'نِسَب الزيادة حسب المدة (36 شهر +10%، 48 +14%، 60 +18%، 84 +25%) أمثلة مبدئية من المالك. تُراجع مع المالية قبل نشر الأسعار.'
where not exists (select 1 from public.tree_pricing_rules where project_id is null);

-- ---------------------------------------------------------------------------
-- Extra cost lines (addendum «المصاريف الإضافية»), per tree or per m²
-- ---------------------------------------------------------------------------

create table public.tree_cost_items (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references public.projects (id),
  label_ar         text not null check (char_length(btrim(label_ar)) >= 1 and char_length(label_ar) <= 120),
  label_fr         text check (label_fr is null or char_length(label_fr) <= 120),
  basis            text not null check (basis in ('per_tree', 'per_m2')),
  amount_millimes  bigint not null check (amount_millimes >= 0),
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id)
);

create index tree_cost_items_project_idx on public.tree_cost_items (project_id, sort_order);
create trigger tree_cost_items_stamp before update on public.tree_cost_items
  for each row execute function app.stamp_updated();
create trigger tree_cost_items_audit after insert or update or delete on public.tree_cost_items
  for each row execute function app.audit_row_change();

comment on table public.tree_cost_items is
  'Extra cost lines added to the cost of one tree (addendum). project_id null is a global line; a project adds its own lines and may drop the global ones (tree_pricing_rules.use_global_cost_items).';

-- ---------------------------------------------------------------------------
-- Financing markup per duration (report v3 §10-§11, §53)
-- ---------------------------------------------------------------------------

create table public.financing_markups (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects (id),
  months      integer not null check (months > 0),
  markup_bp   integer not null check (markup_bp between 0 and 100000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id),
  constraint financing_markups_scope_months_key unique nulls not distinct (project_id, months)
);

create or replace function app.check_markup_months() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.months > app.setting_int('pricing.max_months', 84) then
    raise exception 'duration_over_cap' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function app.check_markup_months() from public, anon, authenticated;

create trigger financing_markups_cap before insert or update on public.financing_markups
  for each row execute function app.check_markup_months();
create trigger financing_markups_stamp before update on public.financing_markups
  for each row execute function app.stamp_updated();
create trigger financing_markups_audit after insert or update or delete on public.financing_markups
  for each row execute function app.audit_row_change();

comment on table public.financing_markups is
  'Markup on the cash price per payment duration (report v3 §10-§11). A project row wins over the global row for the same months; a duration with no row is not priced.';

-- The owner's initial examples for the global scope (answer of 2026-09-15), noted on the global rule for Finance.
insert into public.financing_markups (project_id, months, markup_bp) values
  (null, 36, 1000),
  (null, 48, 1400),
  (null, 60, 1800),
  (null, 84, 2500)
on conflict on constraint financing_markups_scope_months_key do nothing;

create trigger settings_max_months_floor before update on public.settings
  for each row when (new.key = 'pricing.max_months') execute function app.check_max_months_setting();

-- ---------------------------------------------------------------------------
-- Per-project choices (plan Q-13 / P1-7, Q-1 / P1-2): no row means every active entry of the global list
-- ---------------------------------------------------------------------------

create table public.project_spacing_classes (
  project_id        uuid not null references public.projects (id),
  spacing_class_id  uuid not null references public.tree_spacing_classes (id),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id),
  primary key (project_id, spacing_class_id)
);

create index project_spacing_classes_class_idx on public.project_spacing_classes (spacing_class_id);
create trigger project_spacing_classes_audit after insert or update or delete on public.project_spacing_classes
  for each row execute function app.audit_row_change();

comment on table public.project_spacing_classes is
  'Spacing classes a project sells (plan Q-13). A project with rows prices only those classes; a project without rows offers every active class. Written through staff_save_project_spacing_classes.';

create table public.project_down_payment_percents (
  project_id      uuid not null references public.projects (id),
  option_item_id  uuid not null references public.option_items (id),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id),
  primary key (project_id, option_item_id)
);

create index project_down_payment_percents_item_idx on public.project_down_payment_percents (option_item_id);
create trigger project_down_payment_percents_audit after insert or update or delete on public.project_down_payment_percents
  for each row execute function app.audit_row_change();

comment on table public.project_down_payment_percents is
  'Down payment percentages a project offers (plan Q-1, P1-2): items of the ''down_payment_percent'' list. A project with rows offers only those; a project without rows offers every active item. Written through staff_save_project_down_percents.';

-- ---------------------------------------------------------------------------
-- Privileges: visitors read active classes only; pricing tables are for Finance and Admin; writes go through RPCs
-- ---------------------------------------------------------------------------

alter table public.tree_spacing_classes enable row level security;
alter table public.tree_pricing_rules enable row level security;
alter table public.tree_cost_items enable row level security;
alter table public.financing_markups enable row level security;
alter table public.project_spacing_classes enable row level security;
alter table public.project_down_payment_percents enable row level security;

revoke all on public.tree_spacing_classes, public.tree_pricing_rules, public.tree_cost_items, public.financing_markups,
              public.project_spacing_classes, public.project_down_payment_percents
  from anon, authenticated;
grant select on public.tree_spacing_classes to anon, authenticated;
grant select on public.tree_pricing_rules, public.tree_cost_items, public.financing_markups,
                public.project_spacing_classes, public.project_down_payment_percents
  to authenticated;

-- Policies run with the caller's rights and app.can_price() is not executable by API roles, so the role list is inlined.
create policy tree_spacing_classes_select on public.tree_spacing_classes for select to anon, authenticated
  using (is_active or (select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy tree_pricing_rules_select on public.tree_pricing_rules for select to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy tree_cost_items_select on public.tree_cost_items for select to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy financing_markups_select on public.financing_markups for select to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy project_spacing_classes_select on public.project_spacing_classes for select to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));
create policy project_down_payment_percents_select on public.project_down_payment_percents for select to authenticated
  using ((select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])));

-- ---------------------------------------------------------------------------
-- Engine helpers: rounding step of a scope, down payment from a percentage, the percentages a project offers
-- ---------------------------------------------------------------------------

create or replace function app.price_rounding(p_project uuid default null) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.price_rounding_millimes from public.tree_pricing_rules r where p_project is not null and r.project_id = p_project),
    (select r.price_rounding_millimes from public.tree_pricing_rules r where r.project_id is null),
    1)
$$;
revoke execute on function app.price_rounding(uuid) from public, anon, authenticated;

-- Plan Q-2: a share of the cash total (10% of 10,000 د = 1,000 د), rounded up to the price step of the scope.
-- Null when the percentage is outside 0 < p ≤ 100.
create or replace function app.down_payment_from_percent(
  p_cash_total_millimes bigint, p_percent numeric, p_project uuid default null
) returns bigint
language sql stable security definer set search_path = '' as $$
  select case
           when p_cash_total_millimes >= 0 and p_percent > 0 and p_percent <= 100
           then (ceil(p_cash_total_millimes::numeric * p_percent / 100 / app.price_rounding(p_project))
                 * app.price_rounding(p_project))::bigint
         end
$$;
revoke execute on function app.down_payment_from_percent(bigint, numeric, uuid) from public, anon, authenticated;

-- Plan P1-2: a project's own rows when it has any, otherwise every active percentage (also for p_project null).
create or replace function app.project_down_percent_items(p_project uuid default null) returns setof public.option_items
language sql stable security definer set search_path = '' as $$
  select o.*
  from public.option_items o
  where o.list_key = 'down_payment_percent' and o.is_active
    and (p_project is null
         or not exists (select 1 from public.project_down_payment_percents d where d.project_id = p_project)
         or exists (select 1 from public.project_down_payment_percents d
                    where d.project_id = p_project and d.option_item_id = o.id))
  order by o.min_number, o.sort_order
$$;
revoke execute on function app.project_down_percent_items(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Engine: price of one tree (addendum formula)
-- ---------------------------------------------------------------------------

create or replace function app.tree_price(p_spacing_class uuid, p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class        public.tree_spacing_classes;
  v_global       public.tree_pricing_rules;
  v_rule         public.tree_pricing_rules;
  v_area         numeric;
  v_land_rate    bigint;
  v_planting     bigint;
  v_mode         text;
  v_bp           integer;
  v_fixed        bigint;
  v_rounding     bigint;
  v_use_global   boolean;
  v_land         numeric;
  v_extras       jsonb;
  v_extras_total numeric;
  v_cost         numeric;
  v_margin       numeric;
  v_price        bigint;
begin
  select * into v_class from public.tree_spacing_classes c where c.id = p_spacing_class and c.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'spacing_not_found');
  end if;
  v_area := v_class.area_m2;

  -- Plan Q-13 / P1-7: a project that lists its classes sells only those.
  if p_project is not null
     and exists (select 1 from public.project_spacing_classes pc where pc.project_id = p_project)
     and not exists (select 1 from public.project_spacing_classes pc
                     where pc.project_id = p_project and pc.spacing_class_id = p_spacing_class) then
    return jsonb_build_object('ok', false, 'reason', 'spacing_not_allowed', 'area_m2', v_area);
  end if;

  select * into v_global from public.tree_pricing_rules r where r.project_id is null;
  if p_project is not null then
    select * into v_rule from public.tree_pricing_rules r where r.project_id = p_project;
  end if;

  v_land_rate  := coalesce(v_rule.land_price_per_m2_millimes, v_global.land_price_per_m2_millimes);
  v_planting   := coalesce(v_rule.planting_cost_per_tree_millimes, v_global.planting_cost_per_tree_millimes);
  v_rounding   := coalesce(v_rule.price_rounding_millimes, v_global.price_rounding_millimes);
  v_use_global := coalesce(v_rule.use_global_cost_items, true);
  if v_rule.margin_mode is not null then
    v_mode := v_rule.margin_mode;  v_bp := v_rule.margin_percent_bp;  v_fixed := v_rule.margin_fixed_millimes;
  else
    v_mode := v_global.margin_mode;  v_bp := v_global.margin_percent_bp;  v_fixed := v_global.margin_fixed_millimes;
  end if;

  if v_mode is null or v_land_rate is null or v_planting is null or v_rounding is null then
    return jsonb_build_object('ok', false, 'reason', 'margin_not_set', 'area_m2', v_area);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'label_ar', x.label_ar, 'basis', x.basis, 'amount_millimes', x.amount_millimes,
           'cost_millimes', round(x.cost)::bigint)
           order by x.scope_rank, x.sort_order, x.label_ar), '[]'::jsonb),
         coalesce(sum(x.cost), 0)
  into v_extras, v_extras_total
  from (
    select ci.label_ar, ci.basis, ci.amount_millimes, ci.sort_order,
           case when ci.project_id is null then 0 else 1 end as scope_rank,
           case ci.basis when 'per_m2' then v_area * ci.amount_millimes else ci.amount_millimes::numeric end as cost
    from public.tree_cost_items ci
    where ci.is_active
      and ((ci.project_id is null and (p_project is null or v_use_global))
           or (p_project is not null and ci.project_id = p_project))
  ) x;

  v_land   := v_area * v_land_rate;
  v_cost   := v_land + v_planting + v_extras_total;
  v_margin := case v_mode when 'percent' then v_cost * v_bp / 10000 else v_fixed::numeric end;
  -- Rounded once, up, from the unrounded sum: the displayed parts are indicative, the price is exact.
  v_price  := (ceil((v_cost + v_margin) / v_rounding) * v_rounding)::bigint;

  return jsonb_build_object(
    'ok', true,
    'area_m2', v_area,
    'land_price_per_m2_millimes', v_land_rate,
    'land_cost_millimes', round(v_land)::bigint,
    'planting_cost_millimes', v_planting,
    'extras', v_extras,
    'extras_total_millimes', round(v_extras_total)::bigint,
    'cost_per_tree_millimes', round(v_cost)::bigint,
    'margin_mode', v_mode,
    'margin_percent_bp', case when v_mode = 'percent' then v_bp end,
    'margin_fixed_millimes', case when v_mode = 'fixed' then v_fixed end,
    'margin_millimes', round(v_margin)::bigint,
    'price_per_tree_millimes', v_price,
    'sources', jsonb_build_object(
      'land', case when v_rule.land_price_per_m2_millimes is not null then 'project' else 'global' end,
      'planting', case when v_rule.planting_cost_per_tree_millimes is not null then 'project' else 'global' end,
      'margin', case when v_rule.margin_mode is not null then 'project' else 'global' end,
      'rounding', case when v_rule.price_rounding_millimes is not null then 'project' else 'global' end)
  );
end $$;
revoke execute on function app.tree_price(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Engine: financed quote (report v3 §11, §52: Remaining = total financed − down payment; Monthly = Remaining ÷ months)
-- ---------------------------------------------------------------------------

create or replace function app.financed_quote(
  p_cash_total_millimes bigint, p_down_millimes bigint, p_months integer, p_project uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_bp        integer;
  v_price_r   bigint;
  v_monthly_r bigint;
  v_total     bigint;
  v_remaining bigint;
  v_monthly   bigint;
  v_count     integer;
begin
  if p_cash_total_millimes is null or p_cash_total_millimes <= 0
     or p_down_millimes is null or p_down_millimes < 0
     or p_months is null or p_months < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;
  if p_months > app.setting_int('pricing.max_months', 84) then
    return jsonb_build_object('ok', false, 'reason', 'too_many_months');
  end if;

  select m.markup_bp into v_bp
  from public.financing_markups m
  where m.months = p_months and (m.project_id is null or m.project_id = p_project)
  order by (m.project_id is null)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'duration_not_priced');
  end if;

  select coalesce(pr.price_rounding_millimes, g.price_rounding_millimes),
         coalesce(pr.monthly_rounding_millimes, g.monthly_rounding_millimes)
  into v_price_r, v_monthly_r
  from public.tree_pricing_rules g
  left join public.tree_pricing_rules pr on pr.project_id = p_project
  where g.project_id is null;
  v_price_r   := coalesce(v_price_r, 1);
  v_monthly_r := coalesce(v_monthly_r, 1);

  v_total := (ceil(p_cash_total_millimes::numeric * (10000 + v_bp) / 10000 / v_price_r) * v_price_r)::bigint;
  if p_down_millimes >= v_total then
    return jsonb_build_object('ok', false, 'reason', 'down_covers_total', 'total_financed_millimes', v_total);
  end if;

  v_remaining := v_total - p_down_millimes;
  -- Rounded up so no installment is below the exact share; the last one absorbs the difference (owner choice).
  v_monthly := (ceil(v_remaining::numeric / p_months / v_monthly_r) * v_monthly_r)::bigint;
  v_count   := ceil(v_remaining::numeric / v_monthly)::integer;

  return jsonb_build_object(
    'ok', true,
    'markup_bp', v_bp,
    'total_financed_millimes', v_total,
    'down_payment_millimes', p_down_millimes,
    'months', p_months,
    'remaining_millimes', v_remaining,
    'monthly_millimes', v_monthly,
    'last_installment_millimes', v_remaining - v_monthly * (v_count - 1),
    'installments_count', v_count,
    'shortened', v_count < p_months
  );
end $$;
revoke execute on function app.financed_quote(bigint, bigint, integer, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public quote for /start: final commercial figures only, never the internal formula (addendum «ما يظهر للـVisitor»)
-- ---------------------------------------------------------------------------

create or replace function public.public_tree_quote(
  p_spacing_class uuid, p_trees integer default null, p_payment_mode text default null,
  p_down_percent_option_id uuid default null, p_duration_option_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class    public.tree_spacing_classes;
  v_max      integer;
  v_trees    integer;
  v_pricing  text;
  v_price    jsonb;
  v_per_tree bigint;
  v_total    bigint;
  v_percent  public.option_items;
  v_duration public.option_items;
  v_down     bigint;
  v_quote    jsonb;
  v_status   text;
  v_ok       boolean;
  v_inst     jsonb;
begin
  select * into v_class from public.tree_spacing_classes c where c.id = p_spacing_class and c.is_active;
  if not found then
    return null;
  end if;

  select greatest(app.setting_int('million.custom_trees_max', 5000), coalesce(max(o.min_number), 0)::integer)
  into v_max
  from public.option_items o
  where o.list_key = 'tree_count' and o.is_active;
  v_trees := case when p_trees between 1 and v_max then p_trees end;

  if not app.module_open('pricing') then
    v_pricing := 'closed';
  else
    v_price := app.tree_price(v_class.id, null);
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
      v_percent  := app.active_option('down_payment_percent', p_down_percent_option_id::text);
      v_duration := app.active_option('duration', p_duration_option_id::text);
      -- Plan Q-2: the percentage applies to the cash total the visitor has just seen.
      v_down     := app.down_payment_from_percent(v_total, v_percent.min_number, null);
      if v_percent.id is null or v_duration.id is null or v_down is null or v_duration.min_number is null then
        v_status := 'invalid_choice';
      else
        v_quote  := app.financed_quote(v_total, v_down, v_duration.min_number::integer, null);
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
  end if;

  return jsonb_build_object(
    'spacing_class_id', v_class.id,
    'label_ar', v_class.label_ar,
    'label_fr', v_class.label_fr,
    'row_spacing_m', v_class.row_spacing_m,
    'tree_spacing_m', v_class.tree_spacing_m,
    'area_per_tree_m2', v_class.area_m2,
    'trees', v_trees,
    'total_area_m2', v_class.area_m2 * v_trees,
    'pricing', v_pricing,
    'price_per_tree_millimes', case when v_pricing = 'ok' then v_per_tree end,
    'total_price_millimes', case when v_pricing = 'ok' then v_total end,
    'installments', v_inst
  );
end $$;

revoke execute on function public.public_tree_quote(uuid, integer, text, uuid, uuid) from public;
grant execute on function public.public_tree_quote(uuid, integer, text, uuid, uuid) to anon, authenticated;

comment on function public.public_tree_quote(uuid, integer, text, uuid, uuid) is
  'Public /start quote (addendum «ما يظهر للـVisitor», report v3 §12): area per tree, total area, price per tree, total price and installment figures for a down payment percentage (''down_payment_percent'' item, plan Q-1/Q-2) and a duration (''duration'' item), gated on the pricing flag. Never the land price, planting cost, extra costs, cost, margin, markup or internal notes.';

-- ---------------------------------------------------------------------------
-- Staff quote for the Back Office preview: the full breakdown, not flag-gated
-- ---------------------------------------------------------------------------

create or replace function public.staff_tree_quote(
  p_spacing_class uuid, p_trees integer default null, p_project uuid default null,
  p_down_percent numeric default null, p_months integer default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_area  numeric;
  v_trees integer := case when p_trees >= 1 then p_trees end;
  v_price jsonb;
  v_total bigint;
  v_inst  jsonb;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.area_m2 into v_area from public.tree_spacing_classes c where c.id = p_spacing_class;
  v_price := app.tree_price(p_spacing_class, p_project);
  if coalesce((v_price->>'ok')::boolean, false) then
    v_total := (v_price->>'price_per_tree_millimes')::bigint * v_trees;
  end if;

  if v_total is not null and p_down_percent is not null and p_months is not null then
    if not (p_down_percent > 0 and p_down_percent <= 100) then
      v_inst := jsonb_build_object('ok', false, 'reason', 'invalid_input');
    else
      v_inst := app.financed_quote(v_total, app.down_payment_from_percent(v_total, p_down_percent, p_project),
                                   p_months, p_project);
    end if;
    v_inst := v_inst || jsonb_build_object('down_payment_percent', p_down_percent);
  end if;

  return jsonb_build_object(
    'area_per_tree_m2', v_area,
    'trees', v_trees,
    'total_area_m2', v_area * v_trees,
    'price', v_price,
    'total_price_millimes', v_total,
    'installments', v_inst
  );
end $$;

revoke execute on function public.staff_tree_quote(uuid, integer, uuid, numeric, integer) from public, anon;
grant execute on function public.staff_tree_quote(uuid, integer, uuid, numeric, integer) to authenticated;

comment on function public.staff_tree_quote(uuid, integer, uuid, numeric, integer) is
  'Back Office preview for Finance and Admin: tree_price breakdown for a class (and project), totals, and the financed quote for a down payment percentage (0 < p ≤ 100 of the cash total) over p_months, with the markup applied.';

-- ---------------------------------------------------------------------------
-- Back Office writes (0024 convention: role, reason, validation, DML, named audit event)
-- ---------------------------------------------------------------------------

create or replace function public.staff_save_spacing_class(p jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old      public.tree_spacing_classes;
  v_new      public.tree_spacing_classes;
  v_id       uuid;
  v_code     text := btrim(coalesce(p->>'code', ''));
  v_label_ar text := btrim(coalesce(p->>'label_ar', ''));
  v_label_fr text := nullif(btrim(coalesce(p->>'label_fr', '')), '');
  v_row      numeric;
  v_tree     numeric;
  v_sort     integer;
  v_active   boolean;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  begin
    v_id     := nullif(p->>'id', '')::uuid;
    v_row    := nullif(p->>'row_spacing_m', '')::numeric;
    v_tree   := nullif(p->>'tree_spacing_m', '')::numeric;
    v_sort   := nullif(p->>'sort_order', '')::integer;
    v_active := nullif(p->>'is_active', '')::boolean;
  exception when others then
    raise exception 'invalid_spacing_class' using errcode = 'P0001';
  end;

  if v_id is not null then
    select * into v_old from public.tree_spacing_classes c where c.id = v_id for update;
    if not found then
      raise exception 'invalid_spacing_class' using errcode = 'P0001';
    end if;
  end if;

  if v_code !~ '^[a-z0-9_]{2,40}$'
     or char_length(v_label_ar) not between 1 and 120
     or char_length(coalesce(v_label_fr, '')) > 120
     or v_row is null or v_row <= 0 or v_row >= 10000
     or v_tree is null or v_tree <= 0 or v_tree >= 10000 then
    raise exception 'invalid_spacing_class' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tree_spacing_classes c where c.code = v_code and c.id is distinct from v_id) then
    raise exception 'duplicate_code' using errcode = 'P0001';
  end if;

  begin
    if v_id is null then
      insert into public.tree_spacing_classes
        (code, label_ar, label_fr, row_spacing_m, tree_spacing_m, sort_order, is_active, updated_by)
      values (v_code, v_label_ar, v_label_fr, v_row, v_tree, coalesce(v_sort, 0), coalesce(v_active, true), auth.uid())
      returning * into v_new;
    else
      update public.tree_spacing_classes
      set code = v_code, label_ar = v_label_ar, label_fr = v_label_fr,
          row_spacing_m = v_row, tree_spacing_m = v_tree,
          sort_order = coalesce(v_sort, v_old.sort_order), is_active = coalesce(v_active, v_old.is_active)
      where id = v_id
      returning * into v_new;
    end if;
  exception when unique_violation then
    raise exception 'duplicate_code' using errcode = 'P0001';
  end;

  perform app.write_audit('pricing.spacing_class_save', 'tree_spacing_classes', v_new.id::text,
                          case when v_old.id is not null then to_jsonb(v_old) end, to_jsonb(v_new), null);
  return v_new.id;
end $$;

create or replace function public.staff_delete_spacing_class(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old  public.tree_spacing_classes;
  v_used boolean := false;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  select * into v_old from public.tree_spacing_classes c where c.id = p_id for update;
  if not found then
    raise exception 'invalid_spacing_class' using errcode = 'P0001';
  end if;

  -- interest_requests.spacing_class_id arrives with the intake migration, so this function must compile without it.
  if exists (select 1 from pg_catalog.pg_attribute a
             where a.attrelid = 'public.interest_requests'::regclass and a.attname = 'spacing_class_id' and not a.attisdropped) then
    execute 'select exists (select 1 from public.interest_requests where spacing_class_id = $1)' into v_used using p_id;
  end if;
  -- A class a project sells is in use as well: the project must drop it first.
  if v_used or exists (select 1 from public.project_spacing_classes pc where pc.spacing_class_id = p_id) then
    raise exception 'spacing_in_use' using errcode = 'P0001';
  end if;

  delete from public.tree_spacing_classes where id = p_id;
  perform app.write_audit('pricing.spacing_class_delete', 'tree_spacing_classes', p_id::text, to_jsonb(v_old), null, null);
end $$;

create or replace function public.staff_save_pricing_rule(p_project uuid, p jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old          public.tree_pricing_rules;
  v_new          public.tree_pricing_rules;
  v_land         bigint;
  v_plant        bigint;
  v_mode         text := nullif(btrim(coalesce(p->>'margin_mode', '')), '');
  v_bp           integer;
  v_fixed        bigint;
  v_pr           bigint;
  v_mr           bigint;
  v_use          boolean;
  v_note         text := nullif(btrim(coalesce(p->>'note_ar', '')), '');
  v_markups_note text := nullif(btrim(coalesce(p->>'markups_note_ar', '')), '');
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if p_project is not null and not exists (select 1 from public.projects pj where pj.id = p_project) then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;

  begin
    v_land  := nullif(p->>'land_price_per_m2_millimes', '')::bigint;
    v_plant := nullif(p->>'planting_cost_per_tree_millimes', '')::bigint;
    v_bp    := nullif(p->>'margin_percent_bp', '')::integer;
    v_fixed := nullif(p->>'margin_fixed_millimes', '')::bigint;
    v_pr    := nullif(p->>'price_rounding_millimes', '')::bigint;
    v_mr    := nullif(p->>'monthly_rounding_millimes', '')::bigint;
    v_use   := coalesce(nullif(p->>'use_global_cost_items', '')::boolean, true);
  exception when others then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end;

  select * into v_old from public.tree_pricing_rules r where r.project_id is not distinct from p_project for update;

  if coalesce(v_land, 0) < 0 or coalesce(v_plant, 0) < 0 or coalesce(v_fixed, 0) < 0
     or coalesce(v_pr, 1) < 1 or coalesce(v_mr, 1) < 1
     or (v_bp is not null and v_bp not between 0 and 100000)
     or (v_mode is not null and v_mode not in ('percent', 'fixed'))
     or (v_mode = 'percent' and v_bp is null)
     or (v_mode = 'fixed' and v_fixed is null)
     or char_length(coalesce(v_note, '')) > 1000
     or char_length(coalesce(v_markups_note, '')) > 1000
     or (p_project is null and (v_land is null or v_plant is null or v_pr is null or v_mr is null))
     -- Once the global margin is set it can be changed but never unset: prices on the site would vanish.
     or (p_project is null and v_mode is null and v_old.margin_mode is not null) then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;

  if v_mode is distinct from 'percent' then v_bp := null; end if;
  if v_mode is distinct from 'fixed' then v_fixed := null; end if;
  if p_project is null then v_use := true; end if;

  if v_old.id is null then
    insert into public.tree_pricing_rules
      (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes, margin_mode, margin_percent_bp,
       margin_fixed_millimes, price_rounding_millimes, monthly_rounding_millimes, use_global_cost_items,
       note_ar, markups_note_ar, updated_by)
    values (p_project, v_land, v_plant, v_mode, v_bp, v_fixed, v_pr, v_mr, v_use, v_note, v_markups_note, auth.uid())
    returning * into v_new;
  else
    update public.tree_pricing_rules
    set land_price_per_m2_millimes = v_land, planting_cost_per_tree_millimes = v_plant,
        margin_mode = v_mode, margin_percent_bp = v_bp, margin_fixed_millimes = v_fixed,
        price_rounding_millimes = v_pr, monthly_rounding_millimes = v_mr, use_global_cost_items = v_use,
        note_ar = v_note, markups_note_ar = v_markups_note
    where id = v_old.id
    returning * into v_new;
  end if;

  perform app.write_audit('pricing.rule_save', 'tree_pricing_rules', v_new.id::text,
                          case when v_old.id is not null then to_jsonb(v_old) end, to_jsonb(v_new), null);
end $$;

create or replace function public.staff_delete_pricing_rule(p_project uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rule    public.tree_pricing_rules;
  v_items   jsonb;
  v_markups jsonb;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if p_project is null or not exists (select 1 from public.projects pj where pj.id = p_project) then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;

  select * into v_rule from public.tree_pricing_rules r where r.project_id = p_project for update;
  select coalesce(jsonb_agg(to_jsonb(ci) order by ci.sort_order), '[]'::jsonb) into v_items
  from public.tree_cost_items ci where ci.project_id = p_project;
  select coalesce(jsonb_agg(jsonb_build_object('months', m.months, 'markup_bp', m.markup_bp) order by m.months), '[]'::jsonb)
  into v_markups
  from public.financing_markups m where m.project_id = p_project;

  delete from public.tree_cost_items where project_id = p_project;
  delete from public.financing_markups where project_id = p_project;
  delete from public.tree_pricing_rules where project_id = p_project;

  perform app.write_audit('pricing.rule_delete', 'tree_pricing_rules', coalesce(v_rule.id, p_project)::text,
                          jsonb_build_object('project_id', p_project,
                                             'rule', case when v_rule.id is not null then to_jsonb(v_rule) end,
                                             'cost_items', v_items, 'markups', v_markups),
                          null, null);
end $$;

create or replace function public.staff_save_cost_item(p jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old      public.tree_cost_items;
  v_new      public.tree_cost_items;
  v_id       uuid;
  v_project  uuid;
  v_label_ar text := btrim(coalesce(p->>'label_ar', ''));
  v_label_fr text := nullif(btrim(coalesce(p->>'label_fr', '')), '');
  v_basis    text := btrim(coalesce(p->>'basis', ''));
  v_amount   bigint;
  v_sort     integer;
  v_active   boolean;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  begin
    v_id      := nullif(p->>'id', '')::uuid;
    v_project := nullif(p->>'project_id', '')::uuid;
    v_amount  := nullif(p->>'amount_millimes', '')::bigint;
    v_sort    := nullif(p->>'sort_order', '')::integer;
    v_active  := nullif(p->>'is_active', '')::boolean;
  exception when others then
    raise exception 'invalid_cost_item' using errcode = 'P0001';
  end;

  if v_id is not null then
    select * into v_old from public.tree_cost_items ci where ci.id = v_id for update;
    if not found then
      raise exception 'invalid_cost_item' using errcode = 'P0001';
    end if;
    -- An update that does not name the scope keeps it, so a partial payload never turns a project line global.
    if not (p ? 'project_id') then
      v_project := v_old.project_id;
    end if;
  end if;

  if char_length(v_label_ar) not between 1 and 120
     or char_length(coalesce(v_label_fr, '')) > 120
     or v_basis not in ('per_tree', 'per_m2')
     or v_amount is null or v_amount < 0
     or (v_project is not null and not exists (select 1 from public.projects pj where pj.id = v_project)) then
    raise exception 'invalid_cost_item' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.tree_cost_items
      (project_id, label_ar, label_fr, basis, amount_millimes, sort_order, is_active, updated_by)
    values (v_project, v_label_ar, v_label_fr, v_basis, v_amount, coalesce(v_sort, 0), coalesce(v_active, true), auth.uid())
    returning * into v_new;
  else
    update public.tree_cost_items
    set project_id = v_project, label_ar = v_label_ar, label_fr = v_label_fr, basis = v_basis,
        amount_millimes = v_amount, sort_order = coalesce(v_sort, v_old.sort_order),
        is_active = coalesce(v_active, v_old.is_active)
    where id = v_id
    returning * into v_new;
  end if;

  perform app.write_audit('pricing.cost_item_save', 'tree_cost_items', v_new.id::text,
                          case when v_old.id is not null then to_jsonb(v_old) end, to_jsonb(v_new), null);
  return v_new.id;
end $$;

create or replace function public.staff_delete_cost_item(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.tree_cost_items;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  select * into v_old from public.tree_cost_items ci where ci.id = p_id for update;
  if not found then
    raise exception 'invalid_cost_item' using errcode = 'P0001';
  end if;

  delete from public.tree_cost_items where id = p_id;
  perform app.write_audit('pricing.cost_item_delete', 'tree_cost_items', p_id::text, to_jsonb(v_old), null, null);
end $$;

create or replace function public.staff_save_financing_markups(p_project uuid, p_rows jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cap    integer := app.setting_int('pricing.max_months', 84);
  v_old    jsonb;
  v_new    jsonb;
  v_months integer[];
  v_bps    integer[];
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if (p_project is not null and not exists (select 1 from public.projects pj where pj.id = p_project))
     or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_markup' using errcode = 'P0001';
  end if;

  begin
    select coalesce(array_agg((e->>'months')::integer order by ord), '{}'),
           coalesce(array_agg((e->>'markup_bp')::integer order by ord), '{}')
    into v_months, v_bps
    from jsonb_array_elements(p_rows) with ordinality as x(e, ord);
  exception when others then
    raise exception 'invalid_markup' using errcode = 'P0001';
  end;

  if exists (select 1 from unnest(v_months, v_bps) as r(months, bp)
             where r.months is null or r.months < 1 or r.bp is null or r.bp not between 0 and 100000)
     or (select count(distinct m) from unnest(v_months) m) <> cardinality(v_months) then
    raise exception 'invalid_markup' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_months) m where m > v_cap) then
    raise exception 'duration_over_cap' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('months', m.months, 'markup_bp', m.markup_bp) order by m.months), '[]'::jsonb)
  into v_old
  from public.financing_markups m where m.project_id is not distinct from p_project;

  delete from public.financing_markups where project_id is not distinct from p_project;
  insert into public.financing_markups (project_id, months, markup_bp, updated_by)
  select p_project, r.months, r.bp, auth.uid()
  from unnest(v_months, v_bps) as r(months, bp);

  select coalesce(jsonb_agg(jsonb_build_object('months', r.months, 'markup_bp', r.bp) order by r.months), '[]'::jsonb)
  into v_new
  from unnest(v_months, v_bps) as r(months, bp);

  perform app.write_audit('pricing.markups_save', 'financing_markups', p_project::text,
                          jsonb_build_object('project_id', p_project, 'rows', v_old),
                          jsonb_build_object('project_id', p_project, 'rows', v_new), null);
end $$;

-- Plan Q-13 / P1-7: the classes a project sells. An empty array clears the list (every active class again).
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

  delete from public.project_spacing_classes where project_id = p_project;
  insert into public.project_spacing_classes (project_id, spacing_class_id, created_by)
  select p_project, x, auth.uid() from unnest(v_ids) x;

  select coalesce(jsonb_agg(jsonb_build_object('spacing_class_id', c.id, 'code', c.code, 'area_m2', c.area_m2)
                            order by c.sort_order, c.code), '[]'::jsonb)
  into v_new
  from public.tree_spacing_classes c
  where c.id = any (v_ids);

  perform app.write_audit('pricing.project_classes_save', 'project_spacing_classes', p_project::text,
                          jsonb_build_object('project_id', p_project, 'classes', v_old),
                          jsonb_build_object('project_id', p_project, 'classes', v_new), null);
end $$;

-- Plan Q-1 / P1-2: the down payment percentages a project offers. An empty array clears the list.
create or replace function public.staff_save_project_down_percents(p_project uuid, p_option_item_ids uuid[], p_reason text)
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

  select pj.id into v_project from public.projects pj where pj.id = p_project for no key update;
  if v_project is null then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;
  if p_option_item_ids is null or array_position(p_option_item_ids, null) is not null then
    raise exception 'invalid_down_payment_percent' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_option_item_ids) x;
  if (select count(*) from public.option_items o
      where o.id = any (v_ids) and o.list_key = 'down_payment_percent' and o.is_active) <> cardinality(v_ids) then
    raise exception 'invalid_down_payment_percent' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('option_item_id', o.id, 'code', o.code, 'percent', o.min_number)
                            order by o.min_number, o.sort_order), '[]'::jsonb)
  into v_old
  from public.project_down_payment_percents d
  join public.option_items o on o.id = d.option_item_id
  where d.project_id = p_project;

  delete from public.project_down_payment_percents where project_id = p_project;
  insert into public.project_down_payment_percents (project_id, option_item_id, created_by)
  select p_project, x, auth.uid() from unnest(v_ids) x;

  select coalesce(jsonb_agg(jsonb_build_object('option_item_id', o.id, 'code', o.code, 'percent', o.min_number)
                            order by o.min_number, o.sort_order), '[]'::jsonb)
  into v_new
  from public.option_items o
  where o.id = any (v_ids);

  perform app.write_audit('pricing.project_down_percents_save', 'project_down_payment_percents', p_project::text,
                          jsonb_build_object('project_id', p_project, 'percents', v_old),
                          jsonb_build_object('project_id', p_project, 'percents', v_new), null);
end $$;

revoke execute on function
  public.staff_save_spacing_class(jsonb, text),
  public.staff_delete_spacing_class(uuid, text),
  public.staff_save_pricing_rule(uuid, jsonb, text),
  public.staff_delete_pricing_rule(uuid, text),
  public.staff_save_cost_item(jsonb, text),
  public.staff_delete_cost_item(uuid, text),
  public.staff_save_financing_markups(uuid, jsonb, text),
  public.staff_save_project_spacing_classes(uuid, uuid[], text),
  public.staff_save_project_down_percents(uuid, uuid[], text)
from public, anon;
grant execute on function
  public.staff_save_spacing_class(jsonb, text),
  public.staff_delete_spacing_class(uuid, text),
  public.staff_save_pricing_rule(uuid, jsonb, text),
  public.staff_delete_pricing_rule(uuid, text),
  public.staff_save_cost_item(jsonb, text),
  public.staff_delete_cost_item(uuid, text),
  public.staff_save_financing_markups(uuid, jsonb, text),
  public.staff_save_project_spacing_classes(uuid, uuid[], text),
  public.staff_save_project_down_percents(uuid, uuid[], text)
to authenticated;
