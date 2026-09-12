-- 0010 · Clause 25: what the citizen wants to own, the area that interests them, and their top priority.
-- Area, plantation system, tree count, production status and price stay independent fields (PARC-01).

-- Numeric ranges for option lists (used by the "desired area" list, in square metres).
alter table public.option_items add column min_number numeric(12, 2);
alter table public.option_items add column max_number numeric(12, 2);
alter table public.option_lists drop constraint option_lists_value_kind_check;
alter table public.option_lists add constraint option_lists_value_kind_check
  check (value_kind in ('money', 'time_range', 'code', 'plain', 'number_range'));
alter table public.option_items add constraint option_items_number_range_check
  check (max_number is null or min_number is null or max_number >= min_number);

-- ---------------------------------------------------------------------------
-- Ownership scenarios: "شنوّة تحب تملك؟" (PARC-04)
-- Each scenario maps the citizen's words to project type, plantation system and production status.
-- ---------------------------------------------------------------------------

create table public.ownership_scenarios (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  label_ar           text not null,
  label_fr           text,
  description_ar     text,
  project_type_id    uuid references public.project_types (id),
  plantation_system  text check (plantation_system in ('traditional', 'intensive', 'other')),
  production_status  text check (production_status in ('none', 'starting', 'producing')),
  is_any             boolean not null default false,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id)
);
create trigger ownership_scenarios_stamp before update on public.ownership_scenarios
  for each row execute function app.stamp_updated();
create trigger ownership_scenarios_audit after insert or update or delete on public.ownership_scenarios
  for each row execute function app.audit_row_change();

alter table public.ownership_scenarios enable row level security;
create policy ownership_scenarios_read on public.ownership_scenarios for select to anon, authenticated using (true);
revoke insert, update, delete on public.ownership_scenarios from anon;
revoke delete on public.ownership_scenarios from authenticated;
create policy ownership_scenarios_admin_insert on public.ownership_scenarios for insert to authenticated
  with check ((select app.is_admin()));
create policy ownership_scenarios_admin_update on public.ownership_scenarios for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- New answers kept with every request (snapshots, LEAD-02 / PARC-05)
-- ---------------------------------------------------------------------------

alter table public.interest_requests
  add column scenario_ids            uuid[] not null default '{}',
  add column scenario_labels         text[] not null default '{}',
  add column plantation_systems      text[] not null default '{}',
  add column production_statuses     text[] not null default '{}',
  add column desired_area_option_id  uuid references public.option_items (id),
  add column desired_area_label_ar   text,
  add column desired_area_min_m2     numeric(12, 2),
  add column desired_area_max_m2     numeric(12, 2),
  add column priority_option_id      uuid references public.option_items (id),
  add column priority_code           text,
  add column priority_label_ar       text;

create index interest_requests_scenarios_idx on public.interest_requests using gin (scenario_ids);
create index interest_requests_plantation_idx on public.interest_requests using gin (plantation_systems);
create index interest_requests_area_idx on public.interest_requests (desired_area_min_m2, desired_area_max_m2);
create index interest_requests_priority_idx on public.interest_requests (priority_code);

-- ---------------------------------------------------------------------------
-- Seed: lists and scenarios (all editable from the Back Office)
-- ---------------------------------------------------------------------------

insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('desired_area', 'المساحة المرغوبة', 'number_range', 'المساحة التي تهمّ الحريف، بالمتر المربع.'),
  ('priority', 'الأهم بالنسبة للحريف', 'code', 'يُستعمل في ترتيب نتائج الـMatching.'),
  ('plantation_system', 'نظام الغراسة', 'code', 'تقليدي، مكثف، أو نظام آخر. يُستعمل في القطع وفي الفلاتر.');

insert into public.option_items (list_key, code, label_ar, label_fr, min_number, max_number, sort_order) values
  ('desired_area', 'area_400',  '400 م²',            '400 m²',        400,  400,  10),
  ('desired_area', 'area_500',  '500 م²',            '500 m²',        500,  500,  20),
  ('desired_area', 'area_1000', '1,000 م²',          '1 000 m²',      1000, 1000, 30),
  ('desired_area', 'area_1000p', 'أكثر من 1,000 م²', 'Plus de 1 000 m²', 1000, null, 40),
  ('desired_area', 'area_any',  'ما عنديش تفضيل',    'Sans préférence', null, null, 50);

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order) values
  ('priority', 'area_max',            'المساحة الأكبر',      'La plus grande surface',   10),
  ('priority', 'trees_max',           'عدد زيتونات أكثر',   'Plus d''oliviers',         20),
  ('priority', 'productive',          'زيتون منتج',          'Oliviers productifs',      30),
  ('priority', 'lowest_price',        'أقل سعر ممكن',        'Le prix le plus bas',      40),
  ('priority', 'lowest_installment',  'أقل قسط ممكن',        'La mensualité la plus basse', 50),
  ('plantation_system', 'traditional', 'تقليدية', 'Traditionnelle', 10),
  ('plantation_system', 'intensive',   'مكثفة',   'Intensive',      20),
  ('plantation_system', 'other',       'نظام آخر', 'Autre',         30);

insert into public.ownership_scenarios (code, label_ar, label_fr, project_type_id, plantation_system, production_status, is_any, sort_order) values
  ('big_productive', 'قطعة فيها زيتون كبير ومنتج', 'Oliviers adultes et productifs',
   (select id from public.project_types where code = 'productive'), 'traditional', 'producing', false, 10),
  ('intensive_grove', 'قطعة فيها غراسة مكثفة', 'Plantation intensive',
   (select id from public.project_types where code = 'near_production'), 'intensive', 'starting', false, 20),
  ('bare_land', 'أرض بيضاء نغرسوها', 'Terre nue à planter',
   (select id from public.project_types where code = 'bare_land'), null, 'none', false, 30),
  ('young_trees', 'زيتون صغير يكبر مع الوقت', 'Jeunes oliviers',
   (select id from public.project_types where code = 'young_olive'), null, 'none', false, 40),
  ('any', 'ما يهمنيش النوع، نحب العرض الأنسب حسب ميزانيتي', 'Peu importe, la meilleure offre selon mon budget',
   null, null, null, true, 50);
