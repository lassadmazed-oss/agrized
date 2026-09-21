-- bb_41 · الصابة والجني — the season, what came out of it, and every owner's share.
-- Report v3 §37 (خدمة الجني) and §36 (الجني is one of the ten post-sale services); cahier v2 §43 (الصابة) and
-- §44 (اختيارات المالك).
--
-- ███ ITS TEST LIVES IN supabase/pending/tests/041_harvest.sql, NOT in supabase/tests/ — a file in
-- ███ supabase/tests/ is run by `npm run db:test` against the LIVE database, where none of these tables
-- ███ exists, so it would stand permanently red. WHOEVER APPLIES THIS FILE MOVES ITS TEST BACK:
-- ███   git mv supabase/pending/tests/041_harvest.sql supabase/tests/041_harvest.sql
--
-- DRAFT. Not applied, not numbered. Migration numbers are claimed at apply time: the applied files ran to 0062
-- when this was started and run to 0065 now — reservations, visits and matching were numbered by another team
-- while it was being written, which is exactly why this file claims no number of its own. Dry run, which always
-- rolls back (it passes on its own, and it passes again after supabase/pending/bb_40_agri_services.sql):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_41_harvest.sql supabase/pending/tests/041_harvest.sql
--
-- ---------------------------------------------------------------------------
-- WHAT THE SPEC DECIDED, AND WHAT IT ONLY GAVE AS AN EXAMPLE
-- ---------------------------------------------------------------------------
-- v3 §37 opens with «الحريف ينجم يختار **مثلاً**» and closes with one flat sentence: «النظام لازم يبقى
-- Configurable حسب المشروع». The three wordings are therefore an EXAMPLE and the configurability is the RULE,
-- so not one of them is written into an enum here: they are rows of two new option lists that the owner edits,
-- and each offer declares which of them it actually offers. v2 §44 adds a fourth wording (التخزين) and the
-- decided sentence «كل اختيار عنده تكلفته وشروطه» — the price of a choice is a per-offer service tariff, which
-- belongs to the subscriptions draft, not here; this file records WHICH choice was taken and never a dinar of it.
--
-- TWO LISTS, NOT ONE. §37's three wordings answer two different questions in one breath: «AgriZed تتكفل بالجني»
-- and «الحريف يحضر بنفسه» say WHO PICKS the olives; «يتم بيع المحصول / تحويله إلى زيت» and v2 §44's four say
-- WHAT BECOMES OF THE CROP. Folding them into one list would force an owner who comes to pick his own olives to
-- give up saying whether he wants them pressed, and an owner who wants oil to give up saying who climbs the
-- ladder. So: public list `harvest_pick` (من يجني) and `harvest_outcome` (مصير المحصول), both allow-listed per
-- offer, both with a default the offer names for whoever never answered.
--
-- ---------------------------------------------------------------------------
-- THE SEASON IS THE RECORD, AND THE SHARE IS DERIVED FROM IT
-- ---------------------------------------------------------------------------
-- Every one of v2 §43's nine facts is a single measured fact about a whole grove in one year: you weigh a
-- truck, you meter a press run, you do not weigh a tree. Writing them per tree would fabricate 8,000
-- measurements out of one, and writing them per client would let two owners of the same grove disagree about
-- how much oil came out of one press. So the record is (offer × season), and one owner's figure is an
-- ALLOCATION of it:
--
--     حصّتك = صابة الموسم × عدد زيتوناتك ÷ عدد الزيتونات اللي تجنّات
--
-- The denominator is `trees_harvested`, a figure a human records on the season — NOT the number of SOLD trees.
-- If it were the sold ones, an owner of 10 trees in a grove where only 20 are sold would be handed half the
-- crop of 8,000 trees. The trees AgriZed still holds were harvested too, and their share stays with AgriZed.
-- Whatever this rule produces, the screen says the rule out loud in Arabic (setting harvest.share_note) and
-- calls the figure «حصّتك من صابة الضيعة», never «وزن زيتونتك»: the product must not claim a precision nobody
-- measured. PRN-01 (no promised production) is untouched — nothing here estimates a future crop. The one
-- estimate this file stores, `estimated_olives_kg`, is §43's own «Estimated harvest», a staff working figure,
-- and it is never allocated to an owner.
--
-- WHEN THE SHARE IS FROZEN. public.trees carries no history, so «who held this tree on the harvest day» is not
-- a question the database can answer after the fact. Settling a season therefore WRITES the answer down:
-- public.harvest_shares stores the tree count, the denominator, the quantities and the choice as they stood at
-- the moment of settlement, with counted_at beside them, and nothing recomputes them afterwards. Before
-- settlement the same arithmetic is shown live and labelled «تقديري» (harvest.share_estimate_note). A season
-- settled in error is corrected by re-opening it (settled → harvesting is refused; see §7) — deliberately, so
-- that a figure a client has already been told is never quietly rewritten.
--
-- ---------------------------------------------------------------------------
-- QUANTITIES ARE NOT MONEY
-- ---------------------------------------------------------------------------
-- Every *_millimes column in this schema is money. A crop is not money: olives are weighed in kilograms and oil
-- is metered in litres, and both are stored as numeric with the unit IN THE COLUMN NAME so a figure can never
-- be read in the wrong unit. The two money facts §43 does name (Harvesting cost, Sale) are the only bigint
-- millimes columns here, they live behind app.can_price() — column-level SELECT is not granted on them and the
-- payload attaches them only for Finance and Admin (PRJ-03, the rule the matcher of 0065 follows for its quotes) — and they
-- are written by a separate RPC from the one that records what came in. The displayed unit words («كغ»، «لتر»)
-- are settings; the stored unit is fixed, because a number whose unit is editable is a number nobody can read.
--
-- ---------------------------------------------------------------------------
-- WHO MAY DO WHAT — every predicate already exists, none is invented
-- ---------------------------------------------------------------------------
--   record a season, its dates and its quantities   app.can_manage_trees()  {agri_manager, finance, admin,
--                                                   super_admin} — the grove manager runs the grove, which is
--                                                   exactly what this function was written to say (0054 §1).
--   the harvesting cost and the sale amount         app.can_price()         {finance, admin, super_admin} (§53).
--   record one client's choice                      app.can_edit_person()   the commercial who holds that file.
--   read one client's choice or share               app.can_see_person()    the CRM rule, unchanged. The agri
--                                                   manager is deliberately NOT in it: he runs the grove and
--                                                   does not read client files. He sees the season; he does not
--                                                   see who owns what.
--   settle a season                                 app.can_price()         settling turns a weighed quantity
--                                                   into what each owner is owed, is followed by a sale or a
--                                                   handover, and is the accounting close of the crop.
-- No new role, no new helper. A test asserting a gap is what would justify one.
--
-- ---------------------------------------------------------------------------
-- THE GATE, BOTH HALVES
-- ---------------------------------------------------------------------------
-- The `harvest` flag is 'disabled' and STAYS disabled — the owner turns a module on himself. Every RPC below
-- opens with app.module_open('harvest'), so the feature is inert in the database and not merely hidden by a
-- screen, and every page opens with moduleAccess(config, "harvest"). «داخلي فقط» is the right first state for a
-- Back Office-only module.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
--  · It never references public.parcels, public.parcel_status or app.parcel_price. The parcel layer is retiring
--    (supabase/pending/bb_03) and a new dependency on it would block that draft. The grain is the offer and the
--    tree, nothing else.
--  · It prices nothing. §44's «كل اختيار عنده تكلفته» is a per-offer service tariff and belongs with
--    الاشتراك السنوي; this file stores the choice, not its price, so the two cannot disagree about one dinar.
--  · It sends nothing. A «باب الاختيار يسكّر قريباً» reminder to a client is a message the owner has not
--    approved, so no row is written to public.notification_outbox and no template is seeded. It is written up
--    in the report as a proposal instead.
--  · It holds nothing per tree. 8,600 trees × a photo × a weighing is a table describing measurements nobody
--    took (v3 §48: «ما يلزمش كل زيتونة تكون Entity مستقلة دائماً»).
--  · It touches no client login. Every read here is staff-side; فضاء «زيتونتي» is its own draft.
--
-- ---------------------------------------------------------------------------
-- TypeScript that must move in the same commit as this file
-- ---------------------------------------------------------------------------
--   1. npm run db:types          public.harvest_seasons, harvest_choices, harvest_shares and the seven
--                                staff_harvest_* / staff_*_harvest_* RPCs appear. Until it is run, the screens
--                                in src/app/admin/(panel)/harvest call them through one narrow local cast,
--                                which that folder names and tells the next reader to delete.
--   2. src/lib/errors.ts         the codes raised below, each with the sentence that says how to fix it:
--                                harvest_season_exists, harvest_season_settled, harvest_not_closed,
--                                harvest_quantity_missing, harvest_denominator_missing, invalid_harvest_status,
--                                invalid_harvest_season, invalid_harvest_facts, harvest_choice_not_offered,
--                                harvest_choice_closed, not_a_tree_holder, offer_has_no_harvest_choices.
--                                Until then they are carried by HARVEST_MESSAGES in the harvest folder, which
--                                is consulted first exactly as RESERVATION_MESSAGES is.
--   3. src/lib/modules-catalog.ts   add "harvest" to IMPLEMENTED_MODULES, or the owner physically cannot switch
--                                it on: the three-state control is not drawn for a module missing from that
--                                array. That file belongs to another team this hour; it is in the report.
--   4. src/components/admin/nav-model.ts + nav-icons.tsx   a row «الصابة» → /admin/harvest, gated on the flag.
--                                Same team, same report.

-- ---------------------------------------------------------------------------
-- 1 · The two choices §37 and §44 name, as data
-- ---------------------------------------------------------------------------

insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('harvest_pick', 'من يتكفّل بالجني', 'code',
   'شكون يجني الزيتون في وقت الصابة (التقرير v3 §37). القائمة تتبدّل من هنا، وكل عرض يختار منها الاختيارات اللي يوفّرها.'),
  ('harvest_outcome', 'مصير المحصول', 'code',
   'شنوّة يصير في الزيتون بعد الجني: يتسلّمه المالك، ولا يتعصر، ولا AgriZed تبيعه، ولا يتخزّن (كراس الشروط v2 §44، التقرير v3 §37). كل عرض يختار منها الاختيارات اللي يوفّرها.')
on conflict (key) do nothing;

-- The wordings are the spec's own, kept letter for letter so the owner recognises them on the screen. They are
-- rows, so adding a fifth one is an edit in الإعدادات ← القوائم and not a migration.
insert into public.option_items (list_key, code, label_ar, sort_order, is_active) values
  ('harvest_pick', 'agrized_picks',  'AgriZed تتكفل بالجني', 10, true),
  ('harvest_pick', 'client_attends', 'الحريف يحضر بنفسه',    20, true),
  ('harvest_outcome', 'take_olives',   'ناخذ الزيتون',            10, true),
  ('harvest_outcome', 'press_oil',     'نعصره ونأخذ الزيت',       20, true),
  ('harvest_outcome', 'agrized_sells', 'AgriZed تتكفل بالبيع',    30, true),
  ('harvest_outcome', 'storage',       'التخزين',                 40, true)
on conflict (list_key, code) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · «Configurable حسب المشروع»: what each offer offers, and what stands by default
-- ---------------------------------------------------------------------------

-- The same shape public.projects.service_option_ids already uses (0023): an array of option_items ids, capped,
-- default empty. Empty means «this offer has not said», and the module refuses to record a choice against it
-- rather than inventing one.
alter table public.projects
  add column if not exists harvest_pick_option_ids       uuid[] not null default '{}',
  add column if not exists harvest_pick_default_id       uuid references public.option_items (id),
  add column if not exists harvest_outcome_option_ids    uuid[] not null default '{}',
  add column if not exists harvest_outcome_default_id    uuid references public.option_items (id);

alter table public.projects drop constraint if exists projects_harvest_pick_ids_check;
alter table public.projects
  add constraint projects_harvest_pick_ids_check check (cardinality(harvest_pick_option_ids) <= 20);
alter table public.projects drop constraint if exists projects_harvest_outcome_ids_check;
alter table public.projects
  add constraint projects_harvest_outcome_ids_check check (cardinality(harvest_outcome_option_ids) <= 20);

comment on column public.projects.harvest_pick_option_ids is
  'Who may pick this offer''s olives, from the option list harvest_pick (report v3 §37 «النظام لازم يبقى Configurable حسب المشروع»). Empty = this offer has not declared any, and no choice may be recorded against it.';
comment on column public.projects.harvest_pick_default_id is
  'The picking choice that stands for an owner who never answered before the season''s choice_deadline. Must be one of harvest_pick_option_ids. Null = nothing stands, and settlement records no picking choice for the silent owner.';
comment on column public.projects.harvest_outcome_option_ids is
  'What may become of this offer''s crop, from the option list harvest_outcome (v2 §44, v3 §37). Empty = this offer has not declared any.';
comment on column public.projects.harvest_outcome_default_id is
  'The outcome that stands after the choice deadline for an owner who never answered. Must be one of harvest_outcome_option_ids.';

-- ---------------------------------------------------------------------------
-- 3 · The season
-- ---------------------------------------------------------------------------

-- A state the database enforces, so it is an enum and not an option list: the other lists in this file are the
-- owner's vocabulary, this one is a rule (§7 refuses every transition that is not below). Its ARABIC is still
-- data — the five labels are settings, exactly as public.lead_statuses maps editable labels onto fixed stages.
--   planned     مبرمج        the season is declared, nothing picked yet
--   harvesting  في الجني     picking is under way, quantities are being entered and may still change
--   closed      تكمّل الجني  the quantities are final; nothing is allocated yet
--   settled     توزّعت الحصص each owner's share is written down and frozen
--   cancelled   ملغى         the season did not happen
create type public.harvest_season_status as enum ('planned', 'harvesting', 'closed', 'settled', 'cancelled');

comment on type public.harvest_season_status is
  'Lifecycle of one offer''s harvest season. Codes are stable and the transitions are enforced by public.staff_set_harvest_status; the Arabic labels live in settings (harvest.status_*).';

create table public.harvest_seasons (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id),
  -- The agricultural year the season belongs to. A Tunisian olive harvest runs roughly October to February, so
  -- it straddles two calendar years: season_year is the year it STARTS in and label_ar is what a human reads
  -- («موسم 2026/2027»), rendered from the setting harvest.season_label_pattern when nobody types one.
  season_year          integer not null check (season_year between 2000 and 2100),
  label_ar             text not null check (char_length(btrim(label_ar)) between 1 and 80),
  status               public.harvest_season_status not null default 'planned',

  started_on           date,
  ended_on             date,
  -- §37's choice is made «وقت الصابة», so the door closes on a date this season names. After it, the offer's
  -- default stands and settlement records it as «تلقائي».
  choice_deadline      date,

  -- THE DENOMINATOR OF EVERY SHARE. How many trees of this offer were actually picked this season — not how
  -- many were sold, and not necessarily the whole offer: a tree too young or dead is not harvested.
  trees_harvested      integer check (trees_harvested > 0),

  -- v2 §43's nine facts. Quantities, never money.
  estimated_olives_kg  numeric(14, 2) check (estimated_olives_kg >= 0),
  olives_kg            numeric(14, 2) check (olives_kg >= 0),
  pressed_olives_kg    numeric(14, 2) check (pressed_olives_kg >= 0),
  oil_litres           numeric(14, 2) check (oil_litres >= 0),
  stored_oil_litres    numeric(14, 2) check (stored_oil_litres >= 0),
  sold_olives_kg       numeric(14, 2) check (sold_olives_kg >= 0),
  sold_oil_litres      numeric(14, 2) check (sold_oil_litres >= 0),

  -- The two money facts §43 names. Behind app.can_price(): no column grant, and the payload attaches them only
  -- for Finance and Admin.
  harvest_cost_millimes bigint check (harvest_cost_millimes >= 0),
  sale_amount_millimes  bigint check (sale_amount_millimes >= 0),

  note                 text check (note is null or char_length(note) <= 2000),
  settled_at           timestamptz,
  settled_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.profiles (id),

  -- A season that ended before it started is a typo, not a record.
  constraint harvest_seasons_dates_check check (started_on is null or ended_on is null or ended_on >= started_on),
  -- More oil than olives, or more pressed than picked, is a slip of the finger that would travel straight into
  -- every owner's share.
  constraint harvest_seasons_pressed_check check (pressed_olives_kg is null or olives_kg is null or pressed_olives_kg <= olives_kg),
  constraint harvest_seasons_sold_kg_check check (sold_olives_kg is null or olives_kg is null or sold_olives_kg <= olives_kg),
  constraint harvest_seasons_sold_oil_check check (sold_oil_litres is null or oil_litres is null or sold_oil_litres <= oil_litres),
  constraint harvest_seasons_stored_oil_check check (stored_oil_litres is null or oil_litres is null or stored_oil_litres <= oil_litres),
  constraint harvest_seasons_settled_check check ((status = 'settled') = (settled_at is not null))
);

-- One live season per offer per year. A cancelled one is left out of the index so the year can be declared
-- again after a season that did not happen.
create unique index harvest_seasons_year_idx on public.harvest_seasons (project_id, season_year)
  where status <> 'cancelled';
create index harvest_seasons_project_idx on public.harvest_seasons (project_id, season_year desc);
create index harvest_seasons_status_idx on public.harvest_seasons (status, season_year desc);

create trigger harvest_seasons_stamp before update on public.harvest_seasons
  for each row execute function app.stamp_updated();
create trigger harvest_seasons_audit after insert or update or delete on public.harvest_seasons
  for each row execute function app.audit_row_change();

comment on table public.harvest_seasons is
  'One harvest of one offer in one year (cahier v2 §43, report v3 §37). Holds the nine measured facts of the whole grove; an owner''s figure is an allocation of them (public.harvest_shares), never a row of its own. Written only through staff_save_harvest_season, staff_set_harvest_money, staff_set_harvest_status and staff_settle_harvest_season.';
comment on column public.harvest_seasons.trees_harvested is
  'How many of this offer''s trees were actually picked this season. THE DENOMINATOR of every owner''s share, and deliberately not the number of sold trees: the trees AgriZed still holds were harvested too and their share stays with AgriZed.';
comment on column public.harvest_seasons.estimated_olives_kg is
  '§43''s «Estimated harvest»: a staff working figure before the season. Never allocated to an owner and never shown as a promise (PRN-01).';
comment on column public.harvest_seasons.olives_kg is
  'What actually came in, in kilograms, for the whole grove. The numerator of every owner''s share.';
comment on column public.harvest_seasons.harvest_cost_millimes is
  '§43''s «Harvesting cost», in millimes, for the whole season. Finance and Admin only: no column grant, and app.harvest_season_payload attaches it only when app.can_price().';
comment on column public.harvest_seasons.sale_amount_millimes is
  '§43''s «Sale»: what the crop sold for, in millimes, when AgriZed sold it. Finance and Admin only, like the cost above.';
comment on column public.harvest_seasons.choice_deadline is
  'The day the owner''s §37 choice closes. After it the offer''s default stands and settlement records it as «تلقائي». Null = the door never closes on its own.';

alter table public.harvest_seasons enable row level security;
revoke all on public.harvest_seasons from anon, authenticated;
-- Column-level: every staff member reads the season and its quantities; nobody reads its two money columns
-- except through the payload, which asks app.can_price() first. PRJ-03 enforced in the database, not on a page.
grant select (id, project_id, season_year, label_ar, status, started_on, ended_on, choice_deadline,
              trees_harvested, estimated_olives_kg, olives_kg, pressed_olives_kg, oil_litres,
              stored_oil_litres, sold_olives_kg, sold_oil_litres, note, settled_at, settled_by,
              created_at, updated_at, updated_by)
  on public.harvest_seasons to authenticated;

create policy harvest_seasons_select on public.harvest_seasons for select to authenticated
  using ((select app.is_staff()));

-- ---------------------------------------------------------------------------
-- 4 · What one owner chose for one season (§37, §44)
-- ---------------------------------------------------------------------------

-- How the answer reached the system. 'client' is unreachable until فضاء «زيتونتي» has a door — no person
-- carries a profile_id today — and it is written here anyway so that the day it opens, a client's own answer is
-- not filed as if a commercial had typed it.
create type public.harvest_choice_source as enum ('client', 'staff', 'auto');

comment on type public.harvest_choice_source is
  'Who answered: the owner himself (client — not reachable until the client area exists), the team on his behalf (staff), or nobody, in which case the offer''s default stood at the deadline (auto, shown as «تلقائي»).';

create table public.harvest_choices (
  id                  uuid primary key default gen_random_uuid(),
  season_id           uuid not null references public.harvest_seasons (id) on delete cascade,
  person_id           uuid not null references public.persons (id),
  -- Both are nullable: an offer may declare only one of the two questions, and an owner may answer one and not
  -- the other. A row with neither is refused, because it records nothing.
  pick_option_id      uuid references public.option_items (id),
  outcome_option_id   uuid references public.option_items (id),
  source              public.harvest_choice_source not null default 'staff',
  note                text check (note is null or char_length(note) <= 1000),
  decided_at          timestamptz not null default now(),
  decided_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id),
  unique (season_id, person_id),
  constraint harvest_choices_any_check check (pick_option_id is not null or outcome_option_id is not null)
);

create index harvest_choices_person_idx on public.harvest_choices (person_id, season_id);

create trigger harvest_choices_stamp before update on public.harvest_choices
  for each row execute function app.stamp_updated();
create trigger harvest_choices_audit after insert or update or delete on public.harvest_choices
  for each row execute function app.audit_row_change();

comment on table public.harvest_choices is
  'What one owner chose for one season: who picks his olives and what becomes of them (report v3 §37, cahier v2 §44). One row per owner per season. The options are option_items, allow-listed per offer, so the list is the owner''s data and never an enum.';

alter table public.harvest_choices enable row level security;
revoke all on public.harvest_choices from anon, authenticated;
grant select on public.harvest_choices to authenticated;

-- A choice is part of a client's file, so it is read by the CRM rule and nothing looser: Admin, Finance and
-- Legal see every file, a commercial sees their own. The agricultural manager runs the grove and does not read
-- client files — he sees the season's quantities, not who owns them.
create policy harvest_choices_select on public.harvest_choices for select to authenticated
  using ((select app.can_see_person(person_id)));

-- ---------------------------------------------------------------------------
-- 5 · The share: the season's quantity as one owner's number
-- ---------------------------------------------------------------------------

create table public.harvest_shares (
  id                  uuid primary key default gen_random_uuid(),
  season_id           uuid not null references public.harvest_seasons (id) on delete cascade,
  person_id           uuid not null references public.persons (id),
  -- Frozen at settlement, all four: the count, the denominator, and the two quantities they produced. Nothing
  -- recomputes them, so a figure an owner has been told cannot change under him.
  trees_held          integer not null check (trees_held > 0),
  trees_harvested     integer not null check (trees_harvested > 0),
  olives_kg           numeric(14, 3) not null check (olives_kg >= 0),
  oil_litres          numeric(14, 3) check (oil_litres >= 0),
  -- The choice as it stood, id AND wording: an option the owner later renames must not rewrite what a client
  -- was told he chose (the snapshot discipline interest_requests already uses for its quotes).
  pick_option_id      uuid references public.option_items (id),
  pick_label_ar       text,
  outcome_option_id   uuid references public.option_items (id),
  outcome_label_ar    text,
  choice_source       public.harvest_choice_source,
  counted_at          timestamptz not null default now(),
  settled_by          uuid references public.profiles (id),
  note                text check (note is null or char_length(note) <= 1000),
  created_at          timestamptz not null default now(),
  unique (season_id, person_id),
  constraint harvest_shares_denominator_check check (trees_held <= trees_harvested)
);

create index harvest_shares_person_idx on public.harvest_shares (person_id, season_id);

-- A share is written once by settlement and never edited: no RPC updates one, and §9 refuses to settle a season
-- twice. The update branch of the trigger is there so that an update nobody planned still leaves a trace.
create trigger harvest_shares_audit after insert or update or delete on public.harvest_shares
  for each row execute function app.audit_row_change();

comment on table public.harvest_shares is
  'One owner''s share of one season, frozen at settlement: his tree count, the number of trees harvested, and the quantities the two produce. public.trees keeps no history, so «who held this tree on the harvest day» is answered by writing the answer down rather than by recomputing it later. The screen must say in Arabic that this is a share of the grove''s season (setting harvest.share_note), not a weighing of one tree.';
comment on column public.harvest_shares.trees_harvested is
  'The season''s denominator as it stood at settlement. Stored on the share, not read from the season, so a later correction of the season cannot silently restate what an owner was told.';

alter table public.harvest_shares enable row level security;
revoke all on public.harvest_shares from anon, authenticated;
grant select on public.harvest_shares to authenticated;

create policy harvest_shares_select on public.harvest_shares for select to authenticated
  using ((select app.can_see_person(person_id)));

-- ---------------------------------------------------------------------------
-- 6 · The arithmetic, in one place
-- ---------------------------------------------------------------------------

-- How many trees of this offer this person owns TODAY. 'sold' is what ownership means for stage 4: it is the
-- state staff_set_tree_state can already reach and it already carries held_by (0054 §4). A reserved tree is not
-- owned and takes no share.
create or replace function app.harvest_trees_held(p_project uuid, p_person uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.trees t
  where t.project_id = p_project and t.state = 'sold' and t.held_by = p_person
$$;
revoke execute on function app.harvest_trees_held(uuid, uuid) from public, anon, authenticated;

comment on function app.harvest_trees_held(uuid, uuid) is
  'How many trees of one offer one person owns right now. «Owned» is tree_state ''sold'': it is reachable today through staff_set_tree_state and it carries held_by, so the harvest does not wait on the contracts module.';

-- One owner's slice of a season quantity. Every figure the screen shows comes from here, so the estimate before
-- settlement and the frozen share after it can never be computed two different ways.
create or replace function app.harvest_allocate(p_quantity numeric, p_trees integer, p_harvested integer)
returns numeric
-- STABLE, not IMMUTABLE: app.setting_int reads a table, and PostgreSQL would otherwise be free to fold a
-- rounding the owner has since changed into a plan built before he changed it.
language sql stable security definer set search_path = '' as $$
  select case
           when p_quantity is null or coalesce(p_harvested, 0) <= 0 or coalesce(p_trees, 0) <= 0 then null
           else round(p_quantity * p_trees::numeric / p_harvested::numeric,
                      greatest(0, least(app.setting_int('harvest.share_decimals', 2), 6)))
         end
$$;
revoke execute on function app.harvest_allocate(numeric, integer, integer) from public, anon, authenticated;

comment on function app.harvest_allocate(numeric, integer, integer) is
  'حصّة = الكمية × عدد الزيتونات ÷ عدد الزيتونات اللي تجنّات, rounded to harvest.share_decimals. Null whenever the denominator or the count is missing, so a screen shows «—» instead of a fabricated number.';

-- The Arabic sentence that explains the figure, rendered from the setting with this owner's own numbers. A
-- share shown without it is a number claiming a precision nobody measured.
create or replace function app.harvest_share_note(p_trees integer, p_harvested integer, p_settled boolean)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tpl     text := app.setting_text(case when p_settled then 'harvest.share_note' else 'harvest.share_estimate_note' end, '');
  v_percent text := '—';
begin
  if v_tpl is null or btrim(v_tpl) = '' then
    return null;
  end if;
  if coalesce(p_harvested, 0) > 0 and coalesce(p_trees, 0) > 0 then
    v_percent := to_char(round(100 * p_trees::numeric / p_harvested::numeric, 2), 'FM999990.00') || '%';
  end if;
  return replace(replace(replace(v_tpl,
           '{trees}',    coalesce(p_trees::text, '—')),
           '{harvested}', coalesce(p_harvested::text, '—')),
           '{percent}',  v_percent);
end $$;
revoke execute on function app.harvest_share_note(integer, integer, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7 · Writing a season
-- ---------------------------------------------------------------------------

-- Reads the season and refuses on the two things every writer must be stopped by: a module the owner has not
-- switched on, and a season whose figures a client has already been told.
create or replace function app.harvest_writable(p_season uuid) returns public.harvest_seasons
language plpgsql stable security definer set search_path = '' as $$
declare
  v_season public.harvest_seasons;
begin
  select * into v_season from public.harvest_seasons s where s.id = p_season;
  if not found then
    raise exception 'invalid_harvest_season' using errcode = 'P0001';
  end if;
  if v_season.status = 'settled' then
    raise exception 'harvest_season_settled' using errcode = 'P0001';
  end if;
  return v_season;
end $$;
revoke execute on function app.harvest_writable(uuid) from public, anon, authenticated;

-- The season, its dates and its quantities. Money is NOT here: it has its own RPC and its own role (§53), so a
-- grove manager records what came in without ever touching a dinar.
--
-- p is a jsonb object: id (absent = a new season), project_id, season_year, label_ar, started_on, ended_on,
-- choice_deadline, trees_harvested, estimated_olives_kg, olives_kg, pressed_olives_kg, oil_litres,
-- stored_oil_litres, sold_olives_kg, sold_oil_litres, note. A key that is absent leaves the stored value alone;
-- a key present and null clears it. That distinction is what lets one form save one section without wiping the
-- rest of the row.
create or replace function public.staff_save_harvest_season(p jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_season  public.harvest_seasons;
  v_project uuid;
  v_year    integer;
  v_label   text;
  v_pattern text;
begin
  if not app.can_manage_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.module_open('harvest') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_id is null then
    v_project := nullif(p->>'project_id', '')::uuid;
    v_year    := nullif(p->>'season_year', '')::integer;
    if v_project is null or v_year is null or v_year < 2000 or v_year > 2100 then
      raise exception 'invalid_harvest_facts' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.projects pj where pj.id = v_project) then
      raise exception 'offer_not_available' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.harvest_seasons s
               where s.project_id = v_project and s.season_year = v_year and s.status <> 'cancelled') then
      raise exception 'harvest_season_exists' using errcode = 'P0001';
    end if;

    -- «موسم 2026/2027» by default, from the setting, so the owner renames every season at once by editing one
    -- line instead of typing a label on each.
    v_label := nullif(btrim(coalesce(p->>'label_ar', '')), '');
    if v_label is null then
      v_pattern := app.setting_text('harvest.season_label_pattern', 'موسم {year}/{next}');
      v_label := replace(replace(v_pattern, '{year}', v_year::text), '{next}', (v_year + 1)::text);
    end if;

    insert into public.harvest_seasons (project_id, season_year, label_ar, updated_by)
    values (v_project, v_year, left(v_label, 80), auth.uid())
    returning * into v_season;
    v_id := v_season.id;
  else
    v_season := app.harvest_writable(v_id);
  end if;

  update public.harvest_seasons s set
    label_ar            = case when p ? 'label_ar' and nullif(btrim(p->>'label_ar'), '') is not null
                               then left(btrim(p->>'label_ar'), 80) else s.label_ar end,
    started_on          = case when p ? 'started_on'          then nullif(p->>'started_on', '')::date          else s.started_on end,
    ended_on            = case when p ? 'ended_on'            then nullif(p->>'ended_on', '')::date            else s.ended_on end,
    choice_deadline     = case when p ? 'choice_deadline'     then nullif(p->>'choice_deadline', '')::date     else s.choice_deadline end,
    trees_harvested     = case when p ? 'trees_harvested'     then nullif(p->>'trees_harvested', '')::integer  else s.trees_harvested end,
    estimated_olives_kg = case when p ? 'estimated_olives_kg' then nullif(p->>'estimated_olives_kg', '')::numeric else s.estimated_olives_kg end,
    olives_kg           = case when p ? 'olives_kg'           then nullif(p->>'olives_kg', '')::numeric        else s.olives_kg end,
    pressed_olives_kg   = case when p ? 'pressed_olives_kg'   then nullif(p->>'pressed_olives_kg', '')::numeric else s.pressed_olives_kg end,
    oil_litres          = case when p ? 'oil_litres'          then nullif(p->>'oil_litres', '')::numeric       else s.oil_litres end,
    stored_oil_litres   = case when p ? 'stored_oil_litres'   then nullif(p->>'stored_oil_litres', '')::numeric else s.stored_oil_litres end,
    sold_olives_kg      = case when p ? 'sold_olives_kg'      then nullif(p->>'sold_olives_kg', '')::numeric    else s.sold_olives_kg end,
    sold_oil_litres     = case when p ? 'sold_oil_litres'     then nullif(p->>'sold_oil_litres', '')::numeric   else s.sold_oil_litres end,
    note                = case when p ? 'note'                then nullif(btrim(p->>'note'), '')                else s.note end,
    updated_by          = auth.uid()
  where s.id = v_id
  returning * into v_season;

  return jsonb_build_object('id', v_season.id, 'label_ar', v_season.label_ar, 'status', v_season.status);
end $$;
revoke execute on function public.staff_save_harvest_season(jsonb, text) from public, anon;
grant execute on function public.staff_save_harvest_season(jsonb, text) to authenticated;

comment on function public.staff_save_harvest_season(jsonb, text) is
  'Creates or edits one season and its measured quantities (cahier v2 §43). An absent key leaves the stored value alone; a key present and null clears it. Money is not here — staff_set_harvest_money owns it, behind app.can_price().';

-- §43's two money facts, alone, behind Finance and Admin. Separate from the quantities on purpose: the agri
-- manager records that eleven tonnes came in without seeing, or being able to change, what the picking cost.
create or replace function public.staff_set_harvest_money(
  p_season uuid, p_harvest_cost_millimes bigint, p_sale_amount_millimes bigint, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_season public.harvest_seasons;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.module_open('harvest') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  v_season := app.harvest_writable(p_season);
  if coalesce(p_harvest_cost_millimes, 0) < 0 or coalesce(p_sale_amount_millimes, 0) < 0 then
    raise exception 'invalid_harvest_facts' using errcode = 'P0001';
  end if;

  update public.harvest_seasons s
  set harvest_cost_millimes = p_harvest_cost_millimes,
      sale_amount_millimes  = p_sale_amount_millimes,
      updated_by            = auth.uid()
  where s.id = p_season
  returning * into v_season;

  return jsonb_build_object('id', v_season.id, 'harvest_cost_millimes', v_season.harvest_cost_millimes,
                            'sale_amount_millimes', v_season.sale_amount_millimes);
end $$;
revoke execute on function public.staff_set_harvest_money(uuid, bigint, bigint, text) from public, anon;
grant execute on function public.staff_set_harvest_money(uuid, bigint, bigint, text) to authenticated;

-- The state machine. Every transition that is not named here is refused, and 'settled' is reached only through
-- staff_settle_harvest_season — a season does not become settled by someone choosing the word.
create or replace function public.staff_set_harvest_status(p_season uuid, p_status text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_season public.harvest_seasons;
  v_next   public.harvest_season_status;
  v_ok     boolean;
begin
  if not app.can_manage_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.module_open('harvest') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  begin
    v_next := p_status::public.harvest_season_status;
  exception when others then
    raise exception 'invalid_harvest_status' using errcode = 'P0001';
  end;
  if v_next = 'settled' then
    raise exception 'invalid_harvest_status' using errcode = 'P0001';
  end if;

  v_season := app.harvest_writable(p_season);

  -- planned ⇄ harvesting → closed → settled, and cancelled from anywhere before the close. A settled season is
  -- terminal: app.harvest_writable has already refused it, which is why 'settled' appears in no row below.
  v_ok := case v_season.status
            when 'planned'    then v_next in ('harvesting', 'cancelled')
            when 'harvesting' then v_next in ('planned', 'closed', 'cancelled')
            when 'closed'     then v_next in ('harvesting', 'cancelled')
            when 'cancelled'  then v_next in ('planned')
            else false
          end;
  if not v_ok then
    raise exception 'invalid_harvest_status' using errcode = 'P0001';
  end if;

  update public.harvest_seasons s set status = v_next, updated_by = auth.uid()
  where s.id = p_season returning * into v_season;

  return jsonb_build_object('id', v_season.id, 'status', v_season.status);
end $$;
revoke execute on function public.staff_set_harvest_status(uuid, text, text) from public, anon;
grant execute on function public.staff_set_harvest_status(uuid, text, text) to authenticated;

-- What each offer offers, and what stands by default (§37 «Configurable حسب المشروع»). Stock keeping of the
-- grove's own rules, so the agricultural manager owns it, like every other offer-level agricultural setting.
create or replace function public.staff_save_offer_harvest_options(
  p_project uuid, p_pick_ids uuid[], p_pick_default uuid, p_outcome_ids uuid[], p_outcome_default uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pick    uuid[] := coalesce(p_pick_ids, '{}');
  v_outcome uuid[] := coalesce(p_outcome_ids, '{}');
begin
  if not app.can_manage_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.module_open('harvest') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if not exists (select 1 from public.projects pj where pj.id = p_project) then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;

  -- Every id must be an ACTIVE row of its own list: an offer cannot offer a choice the owner has retired, and a
  -- pick option smuggled into the outcome column would show an owner «الحريف يحضر بنفسه» as the fate of his oil.
  -- The unnested column is named opt_id and is always qualified. An alias called `id` would be shadowed by
  -- public.option_items.id inside the inner subquery — `o.id = id` would read as `o.id = o.id`, which is true
  -- for every row, and the whole guard would silently pass everything. Its test caught exactly that.
  if exists (select 1 from unnest(v_pick) as u(opt_id)
             where not exists (select 1 from public.option_items o
                               where o.id = u.opt_id and o.list_key = 'harvest_pick' and o.is_active)) then
    raise exception 'invalid_choice' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_outcome) as u(opt_id)
             where not exists (select 1 from public.option_items o
                               where o.id = u.opt_id and o.list_key = 'harvest_outcome' and o.is_active)) then
    raise exception 'invalid_choice' using errcode = 'P0001';
  end if;
  -- A default nobody may choose is a default that can never be applied.
  if p_pick_default is not null and not (p_pick_default = any (v_pick)) then
    raise exception 'invalid_choice' using errcode = 'P0001';
  end if;
  if p_outcome_default is not null and not (p_outcome_default = any (v_outcome)) then
    raise exception 'invalid_choice' using errcode = 'P0001';
  end if;

  update public.projects pj set
    harvest_pick_option_ids    = v_pick,
    harvest_pick_default_id    = p_pick_default,
    harvest_outcome_option_ids = v_outcome,
    harvest_outcome_default_id = p_outcome_default,
    updated_by                 = auth.uid()
  where pj.id = p_project;

  return jsonb_build_object('project_id', p_project,
                            'pick', cardinality(v_pick), 'outcome', cardinality(v_outcome));
end $$;
revoke execute on function public.staff_save_offer_harvest_options(uuid, uuid[], uuid, uuid[], uuid, text) from public, anon;
grant execute on function public.staff_save_offer_harvest_options(uuid, uuid[], uuid, uuid[], uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8 · Recording one owner's choice (§37, §44)
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_harvest_choice(
  p_season uuid, p_person uuid, p_pick_option_id uuid, p_outcome_option_id uuid, p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_season public.harvest_seasons;
  v_pj     public.projects;
  v_held   integer;
begin
  if not app.module_open('harvest') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
  -- The file's own commercial, or Admin. A choice is a sentence said by a client, and the person who took the
  -- call is the person who writes it down (COM-05).
  if not app.can_edit_person(p_person) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  v_season := app.harvest_writable(p_season);
  -- A cancelled season decides nothing, so nothing is decided about it.
  if v_season.status = 'cancelled' then
    raise exception 'invalid_harvest_season' using errcode = 'P0001';
  end if;
  select * into v_pj from public.projects pj where pj.id = v_season.project_id;

  if cardinality(v_pj.harvest_pick_option_ids) = 0 and cardinality(v_pj.harvest_outcome_option_ids) = 0 then
    raise exception 'offer_has_no_harvest_choices' using errcode = 'P0001';
  end if;
  if p_pick_option_id is null and p_outcome_option_id is null then
    raise exception 'invalid_choice' using errcode = 'P0001';
  end if;
  -- Only an owner has something to decide about.
  v_held := app.harvest_trees_held(v_season.project_id, p_person);
  if v_held <= 0 then
    raise exception 'not_a_tree_holder' using errcode = 'P0001';
  end if;
  -- «وقت الصابة»: the door closes on the day the season names. Admin may still record a late answer — a client
  -- who phoned on the deadline is not a data-entry error — and the audit row says who did it and when.
  if v_season.choice_deadline is not null and current_date > v_season.choice_deadline and not app.is_admin() then
    raise exception 'harvest_choice_closed' using errcode = 'P0001';
  end if;
  if p_pick_option_id is not null and not (p_pick_option_id = any (v_pj.harvest_pick_option_ids)) then
    raise exception 'harvest_choice_not_offered' using errcode = 'P0001';
  end if;
  if p_outcome_option_id is not null and not (p_outcome_option_id = any (v_pj.harvest_outcome_option_ids)) then
    raise exception 'harvest_choice_not_offered' using errcode = 'P0001';
  end if;

  insert into public.harvest_choices
    (season_id, person_id, pick_option_id, outcome_option_id, source, note, decided_at, decided_by, updated_by)
  values
    (p_season, p_person, p_pick_option_id, p_outcome_option_id, 'staff',
     nullif(btrim(coalesce(p_note, '')), ''), now(), auth.uid(), auth.uid())
  on conflict (season_id, person_id) do update set
    pick_option_id    = excluded.pick_option_id,
    outcome_option_id = excluded.outcome_option_id,
    source            = 'staff',
    note              = excluded.note,
    decided_at        = now(),
    decided_by        = auth.uid(),
    updated_by        = auth.uid();

  return jsonb_build_object('season_id', p_season, 'person_id', p_person, 'trees_held', v_held);
end $$;
revoke execute on function public.staff_set_harvest_choice(uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.staff_set_harvest_choice(uuid, uuid, uuid, uuid, text, text) to authenticated;

comment on function public.staff_set_harvest_choice(uuid, uuid, uuid, uuid, text, text) is
  'Records what one owner chose for one season (report v3 §37, cahier v2 §44): who picks, and what becomes of the crop. Refuses a choice this offer does not offer, a person who owns no tree in it, and an answer after the season''s choice_deadline (Admin excepted, and audited).';

-- ---------------------------------------------------------------------------
-- 9 · Settling: the season's quantity becomes every owner's number
-- ---------------------------------------------------------------------------

-- The accounting close of the crop: after it, every owner's figure is written down and frozen, and the season
-- can no longer be edited. Finance and Admin, because what follows it is a sale, a handover or an invoice.
--
-- Whoever never answered gets the offer's default, filed as 'auto' — «تلقائي» — which is exactly what v3 §37's
-- «Configurable حسب المشروع» leaves the offer to decide. An offer with no default simply records no choice for
-- the silent owner; it does not invent one.
create or replace function public.staff_settle_harvest_season(p_season uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_season   public.harvest_seasons;
  v_pj       public.projects;
  v_holder   record;
  v_choice   public.harvest_choices;
  v_pick     uuid;
  v_outcome  uuid;
  v_source   public.harvest_choice_source;
  v_written  integer := 0;
  v_defaults integer := 0;
  v_trees    integer := 0;
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.module_open('harvest') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- The row lock serialises two settlements of the same season; the unique index on harvest_shares would catch
  -- the second one anyway, but it would catch it halfway through.
  select * into v_season from public.harvest_seasons s where s.id = p_season for no key update;
  if not found then
    raise exception 'invalid_harvest_season' using errcode = 'P0001';
  end if;
  if v_season.status = 'settled' then
    raise exception 'harvest_season_settled' using errcode = 'P0001';
  end if;
  -- Only a closed season is settled: while it is being picked the quantities still move, and a share written
  -- from a moving figure is a number a client is told twice.
  if v_season.status <> 'closed' then
    raise exception 'harvest_not_closed' using errcode = 'P0001';
  end if;
  if v_season.olives_kg is null then
    raise exception 'harvest_quantity_missing' using errcode = 'P0001';
  end if;
  if coalesce(v_season.trees_harvested, 0) <= 0 then
    raise exception 'harvest_denominator_missing' using errcode = 'P0001';
  end if;

  select * into v_pj from public.projects pj where pj.id = v_season.project_id;

  for v_holder in
    select t.held_by as person_id, count(*)::integer as trees
    from public.trees t
    where t.project_id = v_season.project_id and t.state = 'sold' and t.held_by is not null
    group by t.held_by
    order by t.held_by
  loop
    -- An owner holding more trees than the season says were harvested means the denominator is wrong, not that
    -- he owns 120% of the crop. Refuse, name it, and change nothing.
    if v_holder.trees > v_season.trees_harvested then
      raise exception 'harvest_denominator_missing' using errcode = 'P0001';
    end if;

    select * into v_choice from public.harvest_choices c
    where c.season_id = p_season and c.person_id = v_holder.person_id;

    if found then
      v_pick    := v_choice.pick_option_id;
      v_outcome := v_choice.outcome_option_id;
      v_source  := v_choice.source;
    else
      v_pick    := v_pj.harvest_pick_default_id;
      v_outcome := v_pj.harvest_outcome_default_id;
      v_source  := 'auto';
      if v_pick is not null or v_outcome is not null then
        -- Written down, not merely applied: «تلقائي» must be a row an owner can be shown, with its date.
        insert into public.harvest_choices
          (season_id, person_id, pick_option_id, outcome_option_id, source, decided_at, decided_by, updated_by)
        values (p_season, v_holder.person_id, v_pick, v_outcome, 'auto', now(), auth.uid(), auth.uid())
        on conflict (season_id, person_id) do nothing;
        v_defaults := v_defaults + 1;
      end if;
    end if;

    insert into public.harvest_shares
      (season_id, person_id, trees_held, trees_harvested, olives_kg, oil_litres,
       pick_option_id, pick_label_ar, outcome_option_id, outcome_label_ar, choice_source, counted_at, settled_by)
    values (
      p_season, v_holder.person_id, v_holder.trees, v_season.trees_harvested,
      coalesce(app.harvest_allocate(v_season.olives_kg, v_holder.trees, v_season.trees_harvested), 0),
      app.harvest_allocate(v_season.oil_litres, v_holder.trees, v_season.trees_harvested),
      v_pick,    (select o.label_ar from public.option_items o where o.id = v_pick),
      v_outcome, (select o.label_ar from public.option_items o where o.id = v_outcome),
      v_source, now(), auth.uid());

    v_written := v_written + 1;
    v_trees   := v_trees + v_holder.trees;
  end loop;

  update public.harvest_seasons s
  set status = 'settled', settled_at = now(), settled_by = auth.uid(), updated_by = auth.uid()
  where s.id = p_season;

  -- A season with no owner yet is settled all the same: zero shares is the true answer while every tree of the
  -- grove still belongs to AgriZed, and refusing would leave the season open for ever.
  perform app.write_audit('harvest.settle', 'harvest_seasons', p_season::text, null,
    jsonb_build_object('shares', v_written, 'trees_allocated', v_trees,
                       'trees_harvested', v_season.trees_harvested, 'defaults_applied', v_defaults),
    p_reason);

  return jsonb_build_object('season_id', p_season, 'shares', v_written, 'trees_allocated', v_trees,
                            'defaults_applied', v_defaults, 'trees_harvested', v_season.trees_harvested);
end $$;
revoke execute on function public.staff_settle_harvest_season(uuid, text) from public, anon;
grant execute on function public.staff_settle_harvest_season(uuid, text) to authenticated;

comment on function public.staff_settle_harvest_season(uuid, text) is
  'Turns one closed season''s measured quantity into one frozen row per owner (public.harvest_shares), applying the offer''s default choice, filed as «تلقائي», to whoever never answered. Finance and Admin: it is the accounting close of the crop. Refuses a season that is not closed, has no quantity, or has no trees_harvested to divide by.';

-- ---------------------------------------------------------------------------
-- 10 · Reading
-- ---------------------------------------------------------------------------

-- One season, as a screen needs it. Money keys are attached only for app.can_price(), exactly as the matcher of
-- 0065 does for its quotes, so a commercial reads the same season with no dinar in it. The keys are ABSENT, not
-- null, for a reader without the right: «you may not see this» and «it is zero» must not look the same.
create or replace function app.harvest_season_payload(p_season uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s       public.harvest_seasons;
  v_pj      public.projects;
  v_out     jsonb;
  v_holders integer;
  v_owned   integer;
begin
  select * into v_s from public.harvest_seasons s where s.id = p_season;
  if not found then
    return null;
  end if;
  select * into v_pj from public.projects pj where pj.id = v_s.project_id;

  select count(distinct t.held_by)::integer, count(*)::integer into v_holders, v_owned
  from public.trees t
  where t.project_id = v_s.project_id and t.state = 'sold' and t.held_by is not null;

  v_out := jsonb_build_object(
    'id', v_s.id,
    'project_id', v_s.project_id,
    'project_code', v_pj.code,
    'project_name', v_pj.name,
    'season_year', v_s.season_year,
    'label_ar', v_s.label_ar,
    'status', v_s.status,
    'status_label_ar', app.setting_text('harvest.status_' || v_s.status::text, v_s.status::text),
    'started_on', v_s.started_on,
    'ended_on', v_s.ended_on,
    'choice_deadline', v_s.choice_deadline,
    'choice_closed', v_s.choice_deadline is not null and current_date > v_s.choice_deadline,
    'trees_harvested', v_s.trees_harvested,
    'trees_declared', v_pj.tree_count,
    'trees_owned', coalesce(v_owned, 0),
    'holders', coalesce(v_holders, 0),
    'estimated_olives_kg', v_s.estimated_olives_kg,
    'olives_kg', v_s.olives_kg,
    'pressed_olives_kg', v_s.pressed_olives_kg,
    'oil_litres', v_s.oil_litres,
    'stored_oil_litres', v_s.stored_oil_litres,
    'sold_olives_kg', v_s.sold_olives_kg,
    'sold_oil_litres', v_s.sold_oil_litres,
    'note', v_s.note,
    'settled_at', v_s.settled_at,
    'can_settle', v_s.status = 'closed' and v_s.olives_kg is not null and coalesce(v_s.trees_harvested, 0) > 0,
    'shares_written', (select count(*)::integer from public.harvest_shares h where h.season_id = v_s.id),
    'choices_recorded', (select count(*)::integer from public.harvest_choices c where c.season_id = v_s.id));

  if app.can_price() then
    v_out := v_out || jsonb_build_object(
      'harvest_cost_millimes', v_s.harvest_cost_millimes,
      'sale_amount_millimes', v_s.sale_amount_millimes);
  end if;
  return v_out;
end $$;
revoke execute on function app.harvest_season_payload(uuid) from public, anon, authenticated;

-- The screen: the season being picked now, the seasons before it, and the offers with their declared choices.
create or replace function public.staff_harvest_overview(p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_seasons jsonb;
  v_offers  jsonb;
  v_current jsonb;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.module_open('harvest') then
    raise exception 'module_closed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(app.harvest_season_payload(s.id) order by s.season_year desc, s.created_at desc), '[]'::jsonb)
  into v_seasons
  from public.harvest_seasons s
  where p_project is null or s.project_id = p_project;

  -- «The season being harvested now» is the one that is open, newest first. Not a date window: a season that is
  -- still being picked in March is still the current one, and a calendar rule would hide it.
  select app.harvest_season_payload(s.id) into v_current
  from public.harvest_seasons s
  where (p_project is null or s.project_id = p_project)
    and s.status in ('harvesting', 'closed')
  order by case s.status when 'harvesting' then 0 else 1 end, s.season_year desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pj.id, 'code', pj.code, 'name', pj.name, 'status', pj.status,
           'tree_count', pj.tree_count,
           'trees_owned', (select count(*)::integer from public.trees t
                           where t.project_id = pj.id and t.state = 'sold'),
           'pick_option_ids', to_jsonb(pj.harvest_pick_option_ids),
           'pick_default_id', pj.harvest_pick_default_id,
           'outcome_option_ids', to_jsonb(pj.harvest_outcome_option_ids),
           'outcome_default_id', pj.harvest_outcome_default_id,
           'seasons', (select count(*)::integer from public.harvest_seasons s where s.project_id = pj.id)
         ) order by pj.code), '[]'::jsonb)
  into v_offers
  from public.projects pj
  where pj.status <> 'archived' and (p_project is null or pj.id = p_project);

  return jsonb_build_object('current', v_current, 'seasons', v_seasons, 'offers', v_offers,
                            'can_price', app.can_price(), 'can_manage', app.can_manage_trees());
end $$;
revoke execute on function public.staff_harvest_overview(uuid) from public, anon;
grant execute on function public.staff_harvest_overview(uuid) to authenticated;

-- One season in full, with the owners this reader is allowed to see. The list is filtered by
-- app.can_see_person INSIDE the function because a security-definer function bypasses the RLS policy that
-- would otherwise do it: a commercial sees their own clients' shares and no others, and the agricultural
-- manager — who is in none of the CRM roles — sees the season's quantities and an empty list of owners.
create or replace function public.staff_harvest_season(p_season uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s      public.harvest_seasons;
  v_out    jsonb;
  v_shares jsonb;
  v_live   jsonb;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.module_open('harvest') then
    raise exception 'module_closed' using errcode = '42501';
  end if;

  select * into v_s from public.harvest_seasons s where s.id = p_season;
  if not found then
    raise exception 'invalid_harvest_season' using errcode = 'P0001';
  end if;
  v_out := app.harvest_season_payload(p_season);

  -- After settlement: what was written down, exactly as it was written.
  select coalesce(jsonb_agg(jsonb_build_object(
           'person_id', h.person_id, 'person_name', p.full_name,
           'trees_held', h.trees_held, 'trees_harvested', h.trees_harvested,
           'olives_kg', h.olives_kg, 'oil_litres', h.oil_litres,
           'pick_label_ar', h.pick_label_ar, 'outcome_label_ar', h.outcome_label_ar,
           'choice_source', h.choice_source, 'counted_at', h.counted_at,
           'note_ar', app.harvest_share_note(h.trees_held, h.trees_harvested, true)
         ) order by h.olives_kg desc), '[]'::jsonb)
  into v_shares
  from public.harvest_shares h
  join public.persons p on p.id = h.person_id
  where h.season_id = p_season and app.can_see_person(h.person_id);

  -- Before it: the same arithmetic, live, and labelled an estimate by its own sentence.
  select coalesce(jsonb_agg(x.payload order by (x.payload->>'trees_held')::integer desc), '[]'::jsonb)
  into v_live
  from (
    select jsonb_build_object(
             'person_id', g.person_id, 'person_name', p.full_name,
             'trees_held', g.trees, 'trees_harvested', v_s.trees_harvested,
             'olives_kg', app.harvest_allocate(v_s.olives_kg, g.trees, v_s.trees_harvested),
             'oil_litres', app.harvest_allocate(v_s.oil_litres, g.trees, v_s.trees_harvested),
             'pick_label_ar', (select o.label_ar from public.option_items o where o.id = c.pick_option_id),
             'outcome_label_ar', (select o.label_ar from public.option_items o where o.id = c.outcome_option_id),
             'choice_source', c.source,
             'note_ar', app.harvest_share_note(g.trees, v_s.trees_harvested, false)) as payload
    from (
      select t.held_by as person_id, count(*)::integer as trees
      from public.trees t
      where t.project_id = v_s.project_id and t.state = 'sold' and t.held_by is not null
      group by t.held_by
    ) g
    join public.persons p on p.id = g.person_id
    left join public.harvest_choices c on c.season_id = p_season and c.person_id = g.person_id
    where app.can_see_person(g.person_id)
  ) x;

  return v_out || jsonb_build_object('shares', v_shares, 'estimates', v_live,
                                     'settled', v_s.status = 'settled');
end $$;
revoke execute on function public.staff_harvest_season(uuid) from public, anon;
grant execute on function public.staff_harvest_season(uuid) to authenticated;

comment on function public.staff_harvest_season(uuid) is
  'One season in full: its measured facts, and one row per owner — frozen shares once it is settled, the same arithmetic live and labelled an estimate before that. The owner list is filtered by app.can_see_person inside the function, because a security-definer function bypasses the RLS policy that would otherwise do it.';

-- ---------------------------------------------------------------------------
-- 11 · The copy and the one number, all editable
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('harvest.page_title', to_jsonb('الصابة والجني'::text), 'text', 'harvest',
   'عنوان صفحة الصابة', 'العنوان في أعلى صفحة /admin/harvest.', false, 10),
  ('harvest.page_intro', to_jsonb('كل موسم صابة في عرض واحد: وقتاش بدا، شنوّة خرج منه، وشنوّة صار في المحصول. حصّة كل مالك تتحسب من هنا.'::text), 'text', 'harvest',
   'الجملة تحت العنوان', 'تشرح للفريق شنوّة تعمل الصفحة. فارغة = ما تظهرش.', false, 11),

  ('harvest.season_label_pattern', to_jsonb('موسم {year}/{next}'::text), 'text', 'harvest',
   'صيغة اسم الموسم',
   'كيفاش يتسمّى الموسم كي ما يكتبش الفريق اسم. {year} = السنة اللي يبدا فيها، {next} = اللي بعدها. مثال: موسم 2026/2027.',
   false, 12),

  ('harvest.status_planned',    to_jsonb('مبرمج'::text),        'text', 'harvest', 'حالة: مبرمج',        'الموسم تسجّل وما بداش الجني.', false, 20),
  ('harvest.status_harvesting', to_jsonb('في الجني'::text),     'text', 'harvest', 'حالة: في الجني',     'الجني ماشي، والكميات مازالت تتبدّل.', false, 21),
  ('harvest.status_closed',     to_jsonb('تكمّل الجني'::text),  'text', 'harvest', 'حالة: تكمّل الجني',  'الكميات نهائية، وما توزّعتش الحصص بعد.', false, 22),
  ('harvest.status_settled',    to_jsonb('توزّعت الحصص'::text), 'text', 'harvest', 'حالة: توزّعت الحصص', 'حصّة كل مالك تكتبت وما عادتش تتبدّل.', false, 23),
  ('harvest.status_cancelled',  to_jsonb('ملغى'::text),         'text', 'harvest', 'حالة: ملغى',         'الموسم ما صارش.', false, 24),

  ('harvest.unit_olives', to_jsonb('كغ'::text), 'text', 'harvest',
   'وحدة الزيتون', 'الكلمة اللي تظهر بعد كميات الزيتون. الكمية محفوظة بالكيلوغرام دايماً.', false, 30),
  ('harvest.unit_oil', to_jsonb('لتر'::text), 'text', 'harvest',
   'وحدة الزيت', 'الكلمة اللي تظهر بعد كميات الزيت. الكمية محفوظة باللتر دايماً.', false, 31),

  ('harvest.share_decimals', to_jsonb(2), 'integer', 'harvest',
   'عدد الفواصل في الحصّة',
   'قدّاش من رقم بعد الفاصلة في حصّة المالك (0 إلى 6). 2 تعطي 128.45 كغ.', false, 32),

  ('harvest.share_note',
   to_jsonb('حصّتك محسوبة بعدد زيتوناتك من جملة الزيتونات اللي تجنّات في الضيعة: {trees} من {harvested}، يعني {percent} من صابة الموسم. هذا موش وزن زيتونة بزيتونة، بل حصّتك من صابة الضيعة.'::text),
   'text', 'harvest',
   'جملة شرح الحصّة (بعد التوزيع)',
   'الجملة اللي تفسّر كيفاش تحسبت الحصّة. تظهر تحت كل رقم. الرموز: {trees} عدد زيتونات المالك · {harvested} عدد الزيتونات اللي تجنّات · {percent} النسبة. فارغة = الجملة ما تظهرش، والرقم يبقى بلا شرح.',
   false, 33),
  ('harvest.share_estimate_note',
   to_jsonb('رقم تقديري حسب الوضع اليوم: {trees} زيتونة من {harvested} ({percent} من صابة الموسم). يتثبّت كي تتوزّع الحصص.'::text),
   'text', 'harvest',
   'جملة شرح الحصّة (قبل التوزيع)',
   'نفس الجملة قبل ما تتوزّع الحصص، باش يفهم القارئ إلّي الرقم مازال يتبدّل. نفس الرموز.', false, 34),

  ('harvest.empty_seasons', to_jsonb('مازال ما فما حتى موسم صابة مسجّل. زيد موسم من فوق باش تبدا تسجّل شنوّة خرج من الضيعة.'::text),
   'text', 'harvest', 'جملة «ما فماش مواسم»', 'تظهر في صفحة الصابة كي ما يكونش فما مواسم.', false, 40),
  ('harvest.empty_owners', to_jsonb('حتى زيتونة في هذا العرض ما تباعتش بعد، فما حتى حصّة تتحسب. كي يتباعوا الزيتونات، الحصص تظهر هنا.'::text),
   'text', 'harvest', 'جملة «ما فماش ملّاك»', 'تظهر في بطاقة الموسم كي ما يكونش فما زيتونات مباعة.', false, 41),
  ('harvest.no_choice_label', to_jsonb('ما اختارش بعد'::text), 'text', 'harvest',
   'عبارة «بلا اختيار»', 'تظهر مكان اختيار المالك كي ما يجاوبش.', false, 42),
  ('harvest.auto_choice_label', to_jsonb('تلقائي'::text), 'text', 'harvest',
   'عبارة الاختيار التلقائي', 'تظهر حذا اختيار تطبّق من العرض لأنّ المالك ما جاوبش قبل آخر أجل.', false, 43),
  ('harvest.choice_closed_note', to_jsonb('باب الاختيار تسكّر. الاختيار الافتراضي متاع العرض هو اللي يمشي.'::text),
   'text', 'harvest', 'جملة «باب الاختيار تسكّر»', 'تظهر في بطاقة الموسم بعد آخر أجل الاختيار.', false, 44)
on conflict (key) do nothing;

-- WHAT THE MODULE DOES, where the Back Office reads it (src/lib/modules-catalog.ts: «WHAT EACH MODULE DOES … is
-- public.feature_flags.description_ar»). The state is not touched: it stays 'disabled' and the owner switches it.
update public.feature_flags
set label_ar = 'الصابة والجني',
    description_ar = 'موسم الصابة في كل عرض: الكمية المقدّرة والحقيقية، تاريخ الجني وتكلفته، العصر والزيت، التخزين ولا البيع. وكل مالك يختار شكون يجني زيتونه وشنوّة يصير فيه (التقرير v3 §37، كراس الشروط v2 §43 و§44)، وحصّته تتحسب بعدد زيتوناته من جملة الزيتونات اللي تجنّات. يخدم في الـBack Office برك: «داخلي فقط» تكفي.'
where key = 'harvest';
