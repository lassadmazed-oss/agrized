-- 0152 · «احسب مردودية مشروعك» — every number the study is allowed to use, and not one of them in the code.
--
-- Its test is supabase/tests/099_study_settings.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0152_study_settings.sql supabase/tests/099_study_settings.sql
--
-- The owner's cahier des charges, 2026-10-24. This file is the FIRST of the three it needs, and deliberately
-- builds no screen: it is the ground the other two stand on, and his §10 names why — «لا توجد أسعار أو نسب
-- أو مستويات إنتاج تجارية مثبتة مباشرة في الكود». A simulator whose yields live in a .ts file is one the
-- Back Office can never correct, and the first season that disagrees with it makes a liar of the website.
--
-- WHAT IS HERE: four tables and the settings beside them — the yield of a tree at an age, the three
-- scenarios, the charges a year carries, and the per-offer overrides. WHAT IS NOT: the arithmetic (0153) and
-- the screens. Each lands on its own, tested on its own.
--
-- ---------------------------------------------------------------------------------------------------------
-- WHY A TABLE OF BANDS AND NOT A FORMULA — the one modelling decision in this file
-- ---------------------------------------------------------------------------------------------------------
-- He gives two points, 15 kg at three years and 250 kg at seventy, and then forbids the obvious thing:
-- «ما يلزمش يكون ثمّة ربط خطي ثابت بين العمر والإنتاج». He is right, and not only about olives — a curve
-- fitted through two points would print a confident 132 kg for a thirty-year-old tree that nobody measured
-- and no agronomist signed. So the age→yield relation is a TABLE OF BANDS the Back Office fills in: from
-- this age to that age, this many kilos. Between the bands there is nothing, and an age no band covers
-- returns «we do not know» rather than an interpolation. The seed below carries the owner's two points and
-- a few conservative bands between them, every one of them marked as an assumption.
--
-- ---------------------------------------------------------------------------------------------------------
-- WHY THE SCENARIOS ARE FACTORS AND NOT THREE SETS OF FIGURES
-- ---------------------------------------------------------------------------------------------------------
-- §5 asks for prudent, central and optimiste, «كل سيناريو عنده إنتاج وأسعار ومصاريف خاصة به». Three full
-- copies of the yield table, the prices and the charges would deliver that — and would be three tables to
-- keep in step, where the way they fail is silent: somebody corrects the central yield after a bad season
-- and the other two keep last year's. A scenario is therefore a set of multipliers over ONE set of
-- assumptions, which gives each scenario its own production, its own prices and its own charges with one
-- place to correct. The factors are the Back Office's, so «prudent» can be made as harsh as the owner likes.
--
-- Basis points everywhere a ratio appears, like discount_percent_bp in 0132: 10000 = ×1, 7000 = ×0.7.

-- ===========================================================================
-- 1 · The yield of one tree, by age
-- ===========================================================================

create table public.study_yield_bands (
  id          uuid primary key default gen_random_uuid(),
  /** Null = the curve every offer uses. A project id = that offer's own, which wins over the default. */
  project_id  uuid references public.projects (id) on delete cascade,

  age_from    integer not null check (age_from >= 0),
  /** Null = no ceiling: the band runs from age_from upwards, which is how the oldest one is written. */
  age_to      integer check (age_to is null or age_to >= age_from),

  /** The reference season for a tree in this band, in kilos. The scenarios move it. */
  kg_per_tree numeric(8, 2) not null check (kg_per_tree >= 0),

  /** Where the figure comes from, in the owner's words. Printed in the Back Office, never to a visitor. */
  source_ar   text check (source_ar is null or length(source_ar) <= 300),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);

comment on table public.study_yield_bands is
  'How many kilos a tree of a given age is assumed to give in a reference season. Bands, not a curve: an age no band covers has no answer, and the study says so rather than interpolating between two points nobody measured (owner, 2026-10-24: «ما يلزمش يكون ثمّة ربط خطي ثابت بين العمر والإنتاج»). project_id null = the default every offer uses.';

create index study_yield_bands_lookup_idx on public.study_yield_bands (project_id, age_from) where is_active;

-- ===========================================================================
-- 2 · The three scenarios
-- ===========================================================================

create table public.study_scenarios (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  label_ar         text not null check (length(btrim(label_ar)) between 2 and 60),

  /** Multipliers over the reference assumptions, in basis points. 10000 = ×1. */
  yield_factor_bp  integer not null default 10000 check (yield_factor_bp between 0 and 30000),
  price_factor_bp  integer not null default 10000 check (price_factor_bp between 0 and 30000),
  charge_factor_bp integer not null default 10000 check (charge_factor_bp between 0 and 30000),

  /** The one the screen opens on. Exactly one row may hold it. */
  is_reference     boolean not null default false,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id)
);

comment on table public.study_scenarios is
  'Prudent, central, optimiste — as multipliers over one set of assumptions rather than three copies of them, so a corrected yield reaches all three at once (0152''s header says why). is_reference is the one the screen opens on.';

-- Exactly one reference, enforced rather than agreed: two would make the opening figures depend on row order.
create unique index study_scenarios_one_reference_idx on public.study_scenarios ((true)) where is_reference;

-- ===========================================================================
-- 3 · What a year costs
-- ===========================================================================

create table public.study_charges (
  id                  uuid primary key default gen_random_uuid(),
  /** Null = charged on every offer. A project id = that offer's own line. */
  project_id          uuid references public.projects (id) on delete cascade,

  code                text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label_ar            text not null check (length(btrim(label_ar)) between 2 and 80),

  /** Per tree, per year. The ordinary shape: pruning, water, picking. */
  per_tree_millimes   bigint not null default 0 check (per_tree_millimes >= 0),
  /** Flat, per year, whatever the basket. Guarding a plot costs the same for ten trees or a hundred. */
  per_year_millimes   bigint not null default 0 check (per_year_millimes >= 0),

  /** The first year of the study this line applies to, counting the first season as 1. */
  from_year           integer not null default 1 check (from_year >= 1),
  /** 1 = every year. 3 = every third year, for a deep ploughing that is not annual. */
  every_years         integer not null default 1 check (every_years >= 1),

  /** True when the line only applies to a study that presses its olives into oil. */
  oil_only            boolean not null default false,

  is_active           boolean not null default true,
  sort_order          integer not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id),

  -- No «must have an amount» check on purpose: a line seeded at zero is VISIBLE in the Back Office and asks
  -- to be filled in, while a line nobody created is one nobody remembers. Zero costs the study nothing.
  constraint study_charges_one_code unique (project_id, code)
);

comment on table public.study_charges is
  'The annual charges a study subtracts, one row per line the client is told about (§4, §6C). Per tree, flat per year, or both; from_year and every_years carry the lines that are not annual. oil_only lines are skipped by a study that sells olives rather than oil.';

-- ===========================================================================
-- 4 · An offer's own assumptions
-- ===========================================================================

create table public.project_study (
  project_id                   uuid primary key references public.projects (id) on delete cascade,

  /** §6E: the simulator is opened offer by offer. An offer with no row here follows study.enabled_default. */
  is_enabled                   boolean not null default true,

  /** Each one null = «use the global setting». Only what this offer disagrees with is written here. */
  olive_price_millimes_per_kg  bigint  check (olive_price_millimes_per_kg >= 0),
  oil_price_millimes_per_litre bigint  check (oil_price_millimes_per_litre >= 0),
  /** Litres of oil per 100 kg of olives, in basis points of a ratio. 1800 = 18 litres per 100 kg. */
  oil_yield_bp                 integer check (oil_yield_bp between 0 and 10000),
  /** How much prices are assumed to move each year, in basis points. 300 = +3%. May be negative. */
  price_growth_bp              integer check (price_growth_bp between -5000 and 5000),

  /** The age of this offer's trees, when the offer itself does not record it. */
  tree_age_years               integer check (tree_age_years between 0 and 300),

  /** §6E: where the figures come from and when they were last looked at. Shown with the study. */
  source_ar                    text check (source_ar is null or length(source_ar) <= 300),
  source_date                  date,
  note_ar                      text check (note_ar is null or length(note_ar) <= 1000),

  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid references public.profiles (id)
);

comment on table public.project_study is
  'One offer''s own study assumptions. Every column but is_enabled is nullable and means «use the global setting» when it is: an offer records only what it disagrees with, so correcting a price once corrects it everywhere it was not overridden.';

-- ===========================================================================
-- 5 · The doors
-- ===========================================================================
--
-- The four tables carry AgriZed's own cost and yield assumptions, and §10 says plainly that the company's
-- internal costs and margins are never shown to a client. A visitor therefore cannot read a row of any of
-- them: the study they are shown is assembled by a security-definer function (0153) that publishes the
-- results and none of the workings. Staff read, administrators write — the same two policies 0132 uses, for
-- the same reason.

do $policies$
declare
  v_table text;
begin
  foreach v_table in array array['study_yield_bands', 'study_scenarios', 'study_charges', 'project_study'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select app.is_staff()))',
      v_table || '_staff_read', v_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()))',
      v_table || '_admin_write', v_table);
    -- A policy is a filter on rows; the blanket grant this schema hands `anon` is the door. Both close.
    execute format('revoke all on public.%I from anon', v_table);
    execute format('create trigger %I before update on public.%I for each row execute function app.stamp_updated()',
      v_table || '_stamp', v_table);
  end loop;
end $policies$;

-- ===========================================================================
-- 6 · The globals, and the words around them
-- ===========================================================================

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('study.enabled_default', to_jsonb(true), 'boolean', 'study', 'المحاكي مفتوح افتراضياً',
   'كي العرض ما عندوش إعداد خاص بيه، هل يظهر فيه «احسب مردودية مشروعك»؟', false, 10),

  ('study.olive_price_millimes_per_kg', to_jsonb(2500), 'money', 'study', 'سعر بيع كيلو الزيتون (مليم)',
   'السعر المرجعي للكيلو. السيناريوهات تحرّكو فوق وتحت. فرضية، موش ضمان.', false, 20),

  ('study.oil_price_millimes_per_litre', to_jsonb(18000), 'money', 'study', 'سعر بيع لتر زيت الزيتون (مليم)',
   'السعر المرجعي للتر. يُستعمل كان الحريف اختار يعصر زيتونو.', false, 21),

  ('study.oil_yield_bp', to_jsonb(1800), 'integer', 'study', 'مردود العصر (نقطة أساس)',
   'قدّاش لتر زيت من 100 كغ زيتون، مضروب في 100. 1800 = 18 لتر لكل 100 كغ.', false, 22),

  ('study.price_growth_bp', to_jsonb(0), 'integer', 'study', 'تطوّر الأسعار في العام (نقطة أساس)',
   'كم تتحرّك الأسعار كل عام في الدراسة. 300 = +3%. صفر = الأسعار تقعد كيما هي، وهذا الأحوط.', false, 23),

  ('study.horizons', '[5, 10, 15, 20]'::jsonb, 'json', 'study', 'مدّات الدراسة (سنوات)',
   'المدّات اللي ينجّم الحريف يختار بيناتهم.', true, 30),

  ('study.min_trees', to_jsonb(1), 'integer', 'study', 'أقلّ عدد زيتونات في الدراسة', null, true, 31),

  ('study.resale_enabled', to_jsonb(false), 'boolean', 'study', 'احتساب قيمة إعادة البيع',
   'كي يكون مطفي، الدراسة ما تحسبش حتى قيمة بيع في الآخر — وهذا الأحوط. §7 يقول إنّها فرضية اختيارية ومعلنة.',
   false, 32)
on conflict (key) do nothing;

-- The sentence under every study. §10: the figures are estimates and nothing is guaranteed.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values ('study.legal_note',
        to_jsonb('هذي دراسة تقديرية مبنيّة على فرضيات ينجّم الحريف يبدّلها. الإنتاج والأسعار والمداخيل ما همّاش مضمونين، وAgriZed ما تضمن حتى مردود.'::text),
        'text', 'study', 'التنبيه القانوني تحت الدراسة',
        'يظهر مع كل دراسة. لازم يقول بوضوح إنّ الأرقام تقديرية وموش ضمان.', true, 33)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', 'study.legal_note', 'value', l.locale, to_jsonb(l.value), true
from (values
  ('fr', 'Cette étude est une estimation fondée sur des hypothèses que vous pouvez modifier. La production, les prix et les revenus ne sont pas garantis, et AgriZed ne garantit aucun rendement.'),
  ('de', 'Diese Studie ist eine Schätzung auf Grundlage von Annahmen, die Sie ändern können. Ertrag, Preise und Einnahmen sind nicht garantiert, und AgriZed garantiert keine Rendite.'),
  ('it', 'Questo studio è una stima basata su ipotesi che puoi modificare. Produzione, prezzi e ricavi non sono garantiti e AgriZed non garantisce alcun rendimento.'),
  ('en', 'This study is an estimate based on assumptions you can change. Production, prices and revenue are not guaranteed, and AgriZed guarantees no return.')
) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;

-- The module. «داخلي فقط» until the owner has looked at the figures — a simulator that promises a return is
-- the single most expensive thing on this site to get wrong, and it opens when he says so and not before.
insert into public.feature_flags (key, state, phase, label_ar, description_ar, sort_order) values
  ('study', 'internal', 2, 'دراسة المردودية',
   'المحاكي اللي يحسب للحريف مردودية مشروعو: الإنتاج، المداخيل، المصاريف، الربح، ومدّة استرجاع رأس المال. كي يكون «داخلي فقط» يشوفو فريق AgriZed وحدو ويتثبّت من الأرقام قبل ما يتفتح للعموم.',
   140)
on conflict (key) do nothing;

-- ===========================================================================
-- 7 · The seed: the owner's two points, and the honest middle
-- ===========================================================================
--
-- Every row below is an ASSUMPTION and says so in its own source_ar, because the Back Office is where they
-- get corrected and a figure with no provenance never does. The two ends are his («عمر 3 سنين: 15 كغ»،
-- «عمر 70 سنة: 250 كغ كسيناريو مرتفع جداً»); the bands between are deliberately flat and cautious rather
-- than a line drawn between the two, which is the thing his brief refuses.

insert into public.study_yield_bands (project_id, age_from, age_to, kg_per_tree, source_ar, sort_order) values
  (null,  0,  2,   0.00, 'زيتونة صغيرة ما تنتجش — فرضية.', 10),
  (null,  3,  5,  15.00, 'نقطة المالك (2026-10-24): عمر 3 سنين = 15 كغ. فرضية.', 20),
  (null,  6, 10,  30.00, 'فرضية متحفّظة بين نقطتَي المالك. تتعدّل من الـBack Office.', 30),
  (null, 11, 20,  60.00, 'فرضية متحفّظة. تتعدّل من الـBack Office.', 40),
  (null, 21, 40, 100.00, 'فرضية متحفّظة. تتعدّل من الـBack Office.', 50),
  (null, 41, 69, 150.00, 'فرضية متحفّظة. تتعدّل من الـBack Office.', 60),
  (null, 70, null, 250.00, 'نقطة المالك (2026-10-24): عمر 70 سنة = 250 كغ، سيناريو مرتفع جداً. فرضية.', 70)
on conflict do nothing;

insert into public.study_scenarios (code, label_ar, yield_factor_bp, price_factor_bp, charge_factor_bp, is_reference, sort_order) values
  ('prudent',   'موسم ضعيف',   6500, 8500, 11500, false, 10),
  ('central',   'موسم مرجعي', 10000, 10000, 10000, true,  20),
  ('optimiste', 'موسم قوي',   13000, 11500,  9500, false, 30)
on conflict (code) do nothing;

-- The charge lines of §6C. Zero where AgriZed does not know the figure yet: a line at zero is visible in the
-- Back Office and asks to be filled, while a missing line is one nobody remembers to add.
insert into public.study_charges (project_id, code, label_ar, per_tree_millimes, per_year_millimes, oil_only, sort_order) values
  (null, 'follow_up', 'معاليم المتابعة',        15000, 0, false, 10),
  (null, 'pruning',   'الحرث والتقليم',          0,     0, false, 20),
  (null, 'water',     'السقي والأسمدة',          0,     0, false, 30),
  (null, 'harvest',   'الجني والنقل',            0,     0, false, 40),
  (null, 'pressing',  'العصر والتعليب',          0,     0, true,  50),
  (null, 'guard',     'الحراسة والتأمين',        0,     0, false, 60),
  (null, 'other',     'مصاريف ورسوم أخرى',       0,     0, false, 70)
on conflict (project_id, code) do nothing;
