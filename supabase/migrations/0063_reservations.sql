-- bb · العربون والحجز — the reservation and the first money the product ever records.
-- Report v3 §23 (العربون) and §24 (مدة إتمام البيع). Module flag: `reservations`, which stays `disabled`.
--
-- ███ DRAFT — NOT APPLIED, NOT NUMBERED. The session owner applies it after reading. When it is applied,
-- ███ rename it to supabase/migrations/00NN_reservations.sql and supabase/tests/036_reservations.sql keeps
-- ███ its number, with the new migration number written into the first line of each. Until then
-- ███ supabase/tests/036_reservations.sql is RED on a live database and its message names this file.
-- ███ Dry-run:  node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_20_reservations.sql \
-- ███                                                        supabase/tests/036_reservations.sql
--
-- WHAT A RESERVATION IS HERE, AND WHAT IT IS NOT. 0054 already hands olive trees out: staff_allocate_trees
-- picks the lowest-numbered available ones, all of them or none (FOR UPDATE SKIP LOCKED), sets state
-- 'reserved', writes the holder and the demand, and audits it. That act is the INVENTORY half and nothing
-- below re-implements it — a second table holding its own tree counts would be a second inventory, and the
-- day the two disagree the four-way counter (requested/reserved/contracted/planted) stops being a fact.
-- A reservation is the CONTRACT AROUND that act: the money owed, the deadline, the conditions the client was
-- told, the paperwork number, and who decided what when the deadline passed. public.staff_create_reservation
-- calls app.allocate_offer_trees inside its own transaction, so the SKIP LOCKED guarantee and the
-- all-or-none rollback are inherited, not copied. Nothing in this file counts or picks a tree.
--
-- THE TWO NUMBERS THE SPEC REFUSES TO FIX. §23: «سبق اعتماد مثال: 50 د عربون حجز — لكن يجب أن يكون
-- Configurable. الـAdmin يحدد لكل Project: Montant réservation · مدة صلاحية الحجز · Conditions.» §24:
-- «حوالي 10 أيام بين الحجز وإتمام عملية البيع — لكن نخليها Parameter.» So neither 50 nor 10 appears anywhere
-- in this file as an operative value, not even as a coalesce() fallback. Both live exactly where
-- projects.min_trees_per_order already lives (0054 §2-§3): a nullable column on public.projects, a global
-- default in public.settings, and ONE SQL reader — app.offer_reservation_terms — that resolves the two.
-- The two global defaults are seeded at ZERO, which means «ما تحدّدش» and not «صفر دينار عربون»: the owner
-- sets his own figures in the Back Office, and until he does, an offer with no deposit asks for none and a
-- reservation with no validity period carries no expiry date. Seeding 50 or 10 here would be adopting the
-- spec's example as the product's rule, which is the one thing §23 and §24 each say twice not to do.
--
-- SNAPSHOT, NEVER RECOMPUTE. The deposit, the validity in days and the conditions text are COPIED onto the
-- reservation row when it is created, the way public.interest_requests already snapshots the price of the
-- day. Editing an offer's deposit afterwards must not rewrite what a client was told on the phone last week.
-- The expiry is computed once, in Postgres (reserved_at + make_interval(days => …)), and stored; no
-- TypeScript anywhere works out an amount or a deadline.
--
-- THE FIRST MONEY. Nothing in the 35 live public tables records money RECEIVED — every *_millimes column
-- today is a price, a plan or a cost. public.payments below is that table, and it is deliberately a movement
-- table and not two columns on the reservation: §29 (الأقساط) and §59 (Arabon Receipt · Down Payment Receipt
-- · Monthly Payment Receipt — «كل عملية مالية يلزمها أثر») both read from this shape, and a paid_at/
-- paid_millimes pair on the reservation could carry neither an instalment nor a receipt. A payment carries a
-- kind (deposit today, down_payment and installment in stage 3 — an enum value, not a new table), a method
-- from public.option_items (so نقداً · تحويل بنكي · شيك are the owner's list and never a TypeScript union),
-- a reference, when it was received, and who recorded it. The reservation's «Deposit Paid» status is DERIVED
-- from the sum of its live deposit rows, in SQL, so there is never a second truth about whether it was paid.
-- A payment is never deleted: staff_void_payment marks it void, keeps the row, and recomputes the status.
--
-- WHO. Reserving is a CRM act — app.can_see_person, exactly as staff_allocate_trees gates it, so a commercial
-- reserves inside their own file and the agricultural manager (who is in no can_see_person list) never does.
-- Money is Finance's: app.can_record_money() below mirrors PRICE_ROLES in src/lib/auth.ts and report v3 §33.
-- Releasing trees is stock keeping ∩ file visibility = Finance and Admin (0054 §1 read from both sides), and
-- §24 gives «يمدد · يلغي · يرجع القطعة Available» to the Admin, so the two agree — but it means the commercial
-- who created a reservation cannot unwind it. That is why cancelling and releasing are ONE function with ONE
-- role check: TypeScript sequencing «cancel the paperwork» then «free the trees» would leave a cancelled
-- reservation whose trees are still reserved the first time a commercial pressed the button.
--
-- NO SCHEDULER. §24 lists three things «الـAdmin ينجم» do when the date passes — extend, cancel, put the trees
-- back — and names no automatic one. Expiry is therefore a FACT OF THE CLOCK that the readers compute
-- (is_overdue, days_left) and never a state a cron writes. The status becomes 'expired' only when a human
-- closes it as expired, with a reason and an audit row.
--
-- THE MODULE GATE, BOTH HALVES. Every WRITER starts with app.module_open('reservations') and raises
-- module_closed — so «معطّل» genuinely closes the act, which is not true of staff_allocate_trees today (it
-- carries no module gate at all; that is a wiring decision, noted and not taken here). The READERS do NOT
-- gate: src/app/admin/(panel)/layout.tsx:47-54 is explicit that the flag says what VISITORS see and is not an
-- access rule for the team, and the Back Office is precisely where a module is prepared before it is
-- published. Each reader returns the flag's state in `module_state` instead, so the screen can say the module
-- is off, and can keep showing rows the day the owner switches it back off.
--
-- TYPESCRIPT THAT MUST FOLLOW (npm run db:types first; none of it is in this file's author's hands except
-- the four files listed under «mine»):
--   1. npm run db:types                       public.reservations, public.payments and the eight staff_*
--                                             functions below appear.
--   2. src/lib/errors.ts                      Arabic lines for module_closed, reservation_not_found,
--                                             reservation_not_active, reservation_closed, deposit_not_due,
--                                             invalid_deposit_amount, invalid_payment_method,
--                                             invalid_extend_days, extend_over_cap, payment_already_void.
--                                             The exact sentences are in the handover note; without them a
--                                             business refusal is reported as «تحقق من اتصالك», which blames
--                                             the connection for a rule.
--   3. src/lib/modules-catalog.ts             add "reservations" to IMPLEMENTED_MODULES, or the owner cannot
--                                             switch the module on at all — /admin/settings/modules draws no
--                                             control for a key that is not in that array. It publishes
--                                             nothing: the flag row below stays 'disabled'.
--   4. src/components/admin/nav-model.ts       "/admin/reservations": "الحجوزات" in ADMIN_LABELS (the icon key
--                                             "reservations" already exists), and one row in
--                                             src/app/admin/(panel)/layout.tsx with flag: "reservations".
--   mine: src/app/admin/(panel)/reservations/* and leads/[personId]/reservation-card.tsx.

-- ---------------------------------------------------------------------------
-- 1 · Who may record money
-- ---------------------------------------------------------------------------

-- Report v3 §33 puts collections under Finance, and src/lib/auth.ts:25 already spells the same three roles as
-- PRICE_ROLES. Written as its own predicate rather than reusing app.can_contract_trees() (which includes
-- Legal): signing the contract and taking the cash are two different desks.
create or replace function app.can_record_money() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[])
$$;
revoke execute on function app.can_record_money() from public, anon, authenticated;

comment on function app.can_record_money() is
  'Who may record or void money received (report v3 §33): Finance, Admin, Super Admin. A commercial may reserve inside their own file (app.can_see_person) but never records a dinar.';

-- Money is stored in integer millimes everywhere, and a bigint holds it; app.setting_int would cap a global
-- default at 2.1 million dinars and silently overflow above it.
create or replace function app.setting_millimes(p_key text, p_default bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::bigint from public.settings s where s.key = p_key), p_default)
$$;
revoke execute on function app.setting_millimes(text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · §23 + §24 · What each offer asks for, and for how long
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists reservation_deposit_millimes bigint,
  add column if not exists reservation_valid_days       integer,
  add column if not exists reservation_conditions_ar    text;

alter table public.projects drop constraint if exists projects_reservation_terms_check;
alter table public.projects
  add constraint projects_reservation_terms_check check (
    (reservation_deposit_millimes is null or reservation_deposit_millimes >= 0)
    and (reservation_valid_days is null or reservation_valid_days between 0 and 3650)
    and (reservation_conditions_ar is null or char_length(reservation_conditions_ar) <= 4000));

comment on column public.projects.reservation_deposit_millimes is
  'Montant réservation for THIS offer, in millimes (§23: «الـAdmin يحدد لكل Project: Montant réservation»). Null inherits the setting reservations.deposit_millimes_default. 0 means this offer asks for no deposit, which is a different answer from null.';
comment on column public.projects.reservation_valid_days is
  'How many days a hold on this offer stays valid (§24: «نخليها Parameter»). Null inherits reservations.valid_days_default. 0 means no deadline at all — the reservation carries no expiry date. Snapshot onto the reservation at creation, so editing this never moves a deadline a client was already given.';
comment on column public.projects.reservation_conditions_ar is
  'The conditions of the hold, as the client is told them (§23 «Conditions»). Null inherits reservations.conditions_ar. Copied onto every reservation created, so it is a record of what was said, not of what the offer says today.';

-- The three global defaults. BOTH numbers are seeded at 0 on purpose — see the header. 0 deposit = this
-- product asks for no عربون until the owner sets one; 0 days = no deadline until he sets one. The examples
-- from the spec are quoted in description_ar, where they are documentation, never a value the code uses.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('reservations.deposit_millimes_default', to_jsonb(0), 'money', 'reservations',
   'العربون الافتراضي (بالمليم)',
   'قدّاش يخلّص الحريف باش يحجز، كي العرض ما يحدّدش مبلغه الخاص. بالمليم: 50000 = 50 د.ت. صفر معناها «العروض ما تطلبش عربون» حتى تحدّد مبلغاً. كراس الشروط (البند 23) يعطي 50 د.ت كمثال برك، والمبلغ الحقيقي قرارك إنت. كل عرض ينجم يحدّد مبلغه في بطاقته.',
   false, 700),

  ('reservations.valid_days_default', to_jsonb(0), 'integer', 'reservations',
   'مدة صلاحية الحجز الافتراضية (بالأيام)',
   'قدّاش من يوم يبقى الحجز صالح قبل ما تنتهي مدّته، كي العرض ما يحدّدش مدّته الخاصة. صفر معناها «بلا أجل» — الحجز ما عندوش تاريخ انتهاء. كراس الشروط (البند 24) يحكي على حوالي 10 أيام كمثال برك، والمدة الحقيقية قرارك إنت.',
   false, 701),

  ('reservations.conditions_ar', to_jsonb(''::text), 'text', 'reservations',
   'شروط الحجز (النص الافتراضي)',
   'الشروط اللي يتقالوا للحريف وقت الحجز (البند 23 «Conditions»): واش يرجع العربون، شنوّة يصير كي تنتهي المدة… النص يتنسخ في كل حجز جديد، فتبديلو ما يمسّش الحجوزات القديمة. كل عرض ينجم يكتب شروطه الخاصة في بطاقته.',
   false, 702),

  ('reservations.max_extend_days', to_jsonb(0), 'integer', 'reservations',
   'أقصى تمديد في المرة الواحدة (بالأيام)',
   'كي تنتهي مدة الحجز، الأدمين ينجم يمدّد (البند 24). هذا هو أقصى عدد أيام يتزادوا في المرة الواحدة. صفر معناها بلا سقف.',
   false, 703),

  ('reservations.expiry_soon_days', to_jsonb(3), 'integer', 'reservations',
   'شنوّة معناها «قربت تنتهي» (بالأيام)',
   'حجز باقيلو أقلّ من هذا العدد من الأيام يتحسب «قربت تنتهي» في صفحة الحجوزات. رقم عرض برك، ما يبدّل حتى قاعدة.',
   false, 704),

  ('reservation_no.prefix', to_jsonb('AGZ-RES'::text), 'text', 'reservations',
   'بادئة رقم الحجز',
   'مثال: AGZ-RES-2026-000123. نفس طريقة رقم المطلب ورقم عرض العقار.',
   false, 705),

  ('payment_no.prefix', to_jsonb('AGZ-PAY'::text), 'text', 'reservations',
   'بادئة رقم الدفعة',
   'كل مبلغ يتسجّل ياخذ رقماً خاص بيه، مثال: AGZ-PAY-2026-000123. هو الرقم اللي يتكتب في الوصل.',
   false, 706),

  -- The five status names are fixed by §23/§24 and the code branches on them; their Arabic is not, so it
  -- lives here. One jsonb row rather than five keys, the shape settings matching.weights already uses.
  ('reservations.status_labels',
   jsonb_build_object(
     'awaiting_deposit', 'محجوزة — في انتظار العربون',
     'deposit_paid',     'العربون تخلّص',
     'expired',          'انتهت مدّتها',
     'cancelled',        'ملغاة',
     'converted',        'ولّات عقد'),
   'json', 'reservations',
   'أسماء حالات الحجز بالعربي',
   'الحالات نفسها ثابتة (كراس الشروط، البندان 23 و24) لأنّ البرنامج يشتغل عليها، أما الكلام اللي يتقرا في الشاشة يتبدّل من هنا.',
   false, 707),

  -- Same reasoning for the kinds of money. 'deposit' is the only one this batch writes; the other three are
  -- named now so stage 3 (§15 الأقساط) adds an enum value and a label, not a table and not a screen rewrite.
  ('payments.kind_labels',
   jsonb_build_object(
     'deposit',      'عربون',
     'down_payment', 'تسبقة',
     'installment',  'قسط',
     'other',        'دفعة أخرى'),
   'json', 'reservations',
   'أسماء أنواع الدفوعات بالعربي',
   'الأنواع ثابتة في قاعدة البيانات، والأسماء اللي تتقرا يتبدّلوا من هنا.',
   false, 708)
on conflict (key) do nothing;

-- ONE reader for the pair, so the Back Office card, the reservation RPC and the tests can never disagree
-- about what an offer asks for. Exactly app.offer_min_trees (0054 §3): the offer's own value, then the
-- global default, and the payload says which of the two answered so the screen can show «موروث» honestly.
create or replace function app.offer_reservation_terms(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pj         public.projects;
  v_deposit    bigint;
  v_days       integer;
  v_conditions text;
begin
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    return null;
  end if;

  v_deposit    := coalesce(v_pj.reservation_deposit_millimes,
                           greatest(app.setting_millimes('reservations.deposit_millimes_default', 0), 0));
  v_days       := greatest(coalesce(v_pj.reservation_valid_days,
                                    app.setting_int('reservations.valid_days_default', 0)), 0);
  v_conditions := nullif(btrim(coalesce(v_pj.reservation_conditions_ar,
                                        app.setting_text('reservations.conditions_ar', ''))), '');

  return jsonb_build_object(
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'project_name', v_pj.name,
    'deposit_millimes', v_deposit,
    'deposit_source', case when v_pj.reservation_deposit_millimes is not null then 'project' else 'default' end,
    'valid_days', v_days,
    'valid_days_source', case when v_pj.reservation_valid_days is not null then 'project' else 'default' end,
    'conditions_ar', v_conditions,
    'conditions_source', case when nullif(btrim(coalesce(v_pj.reservation_conditions_ar, '')), '') is not null
                              then 'project' else 'default' end);
end $$;
revoke execute on function app.offer_reservation_terms(uuid) from public, anon, authenticated;

comment on function app.offer_reservation_terms(uuid) is
  'What one offer asks for a hold (§23) and for how long (§24): the offer''s own three values, each falling back to its global setting. The only place that resolution happens — the Back Office card and staff_create_reservation both read it, and neither computes a deposit or a deadline of its own.';

create or replace function public.staff_reservation_terms(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app.offer_reservation_terms(p_project);
end $$;
revoke execute on function public.staff_reservation_terms(uuid) from public, anon;
grant execute on function public.staff_reservation_terms(uuid) to authenticated;

comment on function public.staff_reservation_terms(uuid) is
  'Back Office reader for an offer''s reservation terms. No module gate: the flag says what visitors see, and the Back Office is where a module is prepared before it is published.';

-- ---------------------------------------------------------------------------
-- 3 · The five statuses
-- ---------------------------------------------------------------------------

-- Fixed by the spec and branched on by code, so an enum and not a configurable table: lead_statuses lets the
-- owner delete a row, and deleting 'deposit_paid' would break staff_record_deposit. The Arabic labels are
-- configurable instead (settings reservations.status_labels above) — the same split tree_state already uses.
--   awaiting_deposit  §23 «Reserved – Awaiting Deposit»
--   deposit_paid      §23 «Deposit Paid» — DERIVED from public.payments, never written by hand
--   expired           §24, set by a human closing an overdue hold, never by a scheduler
--   cancelled         §24 «يلغي»
--   converted         stage 3: the contract (§14/§28) takes it over. Nothing here sets it.
create type public.reservation_status as enum
  ('awaiting_deposit', 'deposit_paid', 'expired', 'cancelled', 'converted');

comment on type public.reservation_status is
  'State of one reservation (report v3 §23-§24). Codes are stable because the code branches on them; the Arabic labels live in settings reservations.status_labels. Not public.lead_statuses: that is the person''s pipeline stage (§27), one per file, and a file may hold two reservations.';

-- ---------------------------------------------------------------------------
-- 4 · The reservation
-- ---------------------------------------------------------------------------

create table public.reservations (
  id             uuid primary key default gen_random_uuid(),
  -- AGZ-RES-2026-000123 — what a receipt and a contract name (v2 §32 «Reservation ID»).
  reference_no   text not null unique,
  person_id      uuid not null references public.persons (id),
  project_id     uuid not null references public.projects (id),
  -- The demand this came from, when there was one. A client the commercial met on the phone has none.
  request_id     uuid references public.interest_requests (id),
  status         public.reservation_status not null default 'awaiting_deposit',

  -- How many trees were handed out by app.allocate_offer_trees for THIS reservation. A record of the act, not
  -- the inventory: which trees, and how many are still held, is read from public.trees.reservation_id, so the
  -- two can be compared and a divergence shown rather than hidden (§46: the system must never sell 501 of 500).
  trees_count    integer not null check (trees_count >= 1),

  -- §23 · SNAPSHOTS. Editing the offer afterwards must not rewrite what this client was told.
  deposit_due_millimes bigint  not null check (deposit_due_millimes >= 0),
  valid_days           integer not null check (valid_days between 0 and 3650),
  conditions_ar        text    check (conditions_ar is null or char_length(conditions_ar) <= 4000),

  reserved_at     timestamptz not null default now(),
  -- §24 «Reservation expiry date». Null when valid_days is 0: no deadline was set, which is not the same as
  -- a deadline that has passed. Computed in Postgres at creation and at every extension, never in TypeScript.
  expires_at      timestamptz,
  -- When the deposit was completed. Derived with the status from public.payments; never set by hand.
  deposit_paid_at timestamptz,

  extended_count  integer not null default 0 check (extended_count >= 0),
  extended_at     timestamptz,

  closed_at       timestamptz,
  closed_by       uuid references public.profiles (id),
  close_reason    text check (close_reason is null or char_length(close_reason) <= 1000),
  -- True when closing also put the trees back to available (§24 «يرجع القطعة Available»), so the record says
  -- which of the two admin choices was taken.
  trees_released  boolean not null default false,

  note            text check (note is null or char_length(note) <= 1000),
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id),

  -- A finished reservation says when it finished; a live one does not pretend to.
  constraint reservations_closed_check check (
    (status in ('expired', 'cancelled', 'converted')) = (closed_at is not null)),
  constraint reservations_paid_check check (
    (status = 'deposit_paid') <= (deposit_paid_at is not null)),
  constraint reservations_expiry_check check (
    (valid_days = 0) = (expires_at is null))
);

create index reservations_person_idx  on public.reservations (person_id, reserved_at desc);
create index reservations_project_idx on public.reservations (project_id, reserved_at desc);
create index reservations_request_idx on public.reservations (request_id) where request_id is not null;
-- The list screen's first question: what is still open, soonest deadline first.
create index reservations_open_idx on public.reservations (expires_at)
  where status in ('awaiting_deposit', 'deposit_paid');

create trigger reservations_stamp before update on public.reservations
  for each row execute function app.stamp_updated();
create trigger reservations_audit after update or delete on public.reservations
  for each row execute function app.audit_row_change();

comment on table public.reservations is
  'One hold on an offer for one client: the money owed, the deadline, the conditions the client was told, and how it ended (report v3 §23-§24). The trees themselves are public.trees — this table never counts or picks one. Written only through staff_create_reservation, staff_record_deposit, staff_void_payment, staff_extend_reservation and staff_close_reservation.';
comment on column public.reservations.deposit_due_millimes is
  'The عربون asked for, in millimes, COPIED from app.offer_reservation_terms at creation. 0 = this offer asked for none, and the reservation starts at deposit_paid because nothing is owed.';
comment on column public.reservations.valid_days is
  'The validity period in days, copied at creation (§24). 0 = no deadline was set, and expires_at is null.';
comment on column public.reservations.expires_at is
  'reserved_at + valid_days, computed in Postgres. When it passes the reservation does NOT change state: §24 gives the admin three choices and names no automatic one, so the readers report is_overdue and a human decides.';
comment on column public.reservations.trees_count is
  'How many trees this reservation took. The live figure is counted from public.trees.reservation_id; when the two differ, trees were released elsewhere and the screen says so rather than trusting either number silently.';

alter table public.reservations enable row level security;
revoke all on public.reservations from anon, authenticated;
grant select on public.reservations to authenticated;

-- Staff read the files they may see: Admin, Finance and Legal read every one, a commercial reads their own
-- (app.can_see_person, 0002). Visitors read nothing — there is no client area yet (persons.profile_id is
-- written nowhere), so a self-read policy would be one that can never match.
create policy reservations_select on public.reservations for select to authenticated
  using ((select app.is_staff()) and (select app.can_see_person(person_id)));

-- ---------------------------------------------------------------------------
-- 5 · The link to the trees, and the one way it can go stale
-- ---------------------------------------------------------------------------

alter table public.trees add column if not exists reservation_id uuid references public.reservations (id);
create index if not exists trees_reservation_idx on public.trees (reservation_id) where reservation_id is not null;

comment on column public.trees.reservation_id is
  'The reservation this tree is held under, when it was taken through staff_create_reservation. Null for a tree held by the older staff_allocate_trees path, which records no money and no deadline. Cleared automatically the moment the tree goes back to available.';

-- 0054's staff_set_tree_state can free a tree from the offer''s الزيتونات tab without knowing this column
-- exists, which would leave an available tree pointing at a reservation. A trigger keeps the link honest from
-- the other side, so nothing has to redefine a shipped function and no caller has to remember.
create or replace function app.trees_clear_reservation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.state = 'available' then
    new.reservation_id := null;
  end if;
  return new;
end $$;

create trigger trees_reservation_unlink before insert or update on public.trees
  for each row execute function app.trees_clear_reservation();

-- ---------------------------------------------------------------------------
-- 6 · Money received — the first table in this product that records a dinar arriving
-- ---------------------------------------------------------------------------

create type public.payment_kind as enum ('deposit', 'down_payment', 'installment', 'other');

comment on type public.payment_kind is
  'What a received payment is. Only ''deposit'' is written in this phase (§23). ''down_payment'' and ''installment'' are named now so stage 3 (§15 الأقساط) adds a value and a contract_id column, not another table. Arabic labels live in settings payments.kind_labels.';

-- How the money arrived. An option list, like every other list the owner edits, so cash/virement/chèque are
-- his and a fourth method is a row in the Back Office rather than a migration (report v3 §30 «طرق الدفع»).
insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('payment_method', 'طرق الدفع المقبولة', 'plain', 'كيفاش وصلت الفلوس: نقداً، تحويل بنكي، شيك… تتقرا في تسجيل العربون والدفوعات.')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order) values
  ('payment_method', 'cash',     'نقداً',         'Espèces',  10),
  ('payment_method', 'transfer', 'تحويل بنكي',   'Virement', 20),
  ('payment_method', 'cheque',   'شيك',           'Chèque',   30),
  ('payment_method', 'postal',   'حوالة بريدية', 'Mandat',   40)
on conflict (list_key, code) do nothing;

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  reference_no    text not null unique,
  -- Nullable because stage 3 records a payment against a contract that has no reservation behind it. Today
  -- every row carries one.
  reservation_id  uuid references public.reservations (id),
  person_id       uuid not null references public.persons (id),
  project_id      uuid references public.projects (id),
  kind            public.payment_kind not null,

  amount_millimes bigint not null check (amount_millimes > 0),
  -- The method chosen from public.option_items, plus the label AS IT READ that day: a receipt printed in two
  -- years must say what the client was given, not what the list says then. Same reasoning as the offer
  -- intake's label snapshots.
  method_option_id uuid references public.option_items (id),
  method_label_ar  text check (method_label_ar is null or char_length(method_label_ar) <= 120),
  -- Cheque number, transfer reference, receipt number from the book…
  reference        text check (reference is null or char_length(reference) <= 120),
  received_at     timestamptz not null default now(),
  note            text check (note is null or char_length(note) <= 1000),

  -- A payment is never deleted. Recording 500 د instead of 50 د is corrected by voiding the row and recording
  -- the right one, so the audit trail keeps the mistake and the correction (§59 «كل عملية مالية يلزمها أثر»).
  voided_at       timestamptz,
  voided_by       uuid references public.profiles (id),
  void_reason     text check (void_reason is null or char_length(void_reason) <= 1000),

  recorded_by     uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id),

  constraint payments_void_check check ((voided_at is null) = (voided_by is null))
);

create index payments_reservation_idx on public.payments (reservation_id) where reservation_id is not null;
create index payments_person_idx      on public.payments (person_id, received_at desc);
create index payments_kind_idx        on public.payments (kind, received_at desc);

create trigger payments_stamp before update on public.payments
  for each row execute function app.stamp_updated();
create trigger payments_audit after update or delete on public.payments
  for each row execute function app.audit_row_change();

comment on table public.payments is
  'Money actually received, in integer millimes (report v3 §23 العربون, and the shape §15 الأقساط and §59 الوصولات read from). Every other *_millimes column in this schema is a price, a plan or a cost; this is the only receipt. Rows are never deleted — a mistake is voided and re-recorded. Written only through staff_record_deposit and staff_void_payment.';
comment on column public.payments.method_label_ar is
  'The payment method as it read on the day, copied from public.option_items. A receipt reprinted later must repeat what the client was told, not what the list says now.';

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- Reading that a client's deposit arrived is CRM information their commercial needs before phoning them;
-- RECORDING or VOIDING one is Finance's and is gated in the RPCs by app.can_record_money().
create policy payments_select on public.payments for select to authenticated
  using ((select app.is_staff()) and (select app.can_see_person(person_id)));

-- ---------------------------------------------------------------------------
-- 7 · Readers
-- ---------------------------------------------------------------------------

-- Everything a screen shows about one reservation, computed here: the labels from settings, the live tree
-- counts from public.trees, the money from public.payments, and the two figures §24 needs — whether the
-- deadline has passed and how many days are left. A page renders these; it works none of them out.
create or replace function app.reservation_payload(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r        public.reservations;
  v_pj       public.projects;
  v_person   public.persons;
  v_labels   jsonb := coalesce(app.setting('reservations.status_labels'), '{}'::jsonb);
  v_kinds    jsonb := coalesce(app.setting('payments.kind_labels'), '{}'::jsonb);
  v_held     integer;
  v_sold     integer;
  v_first    text;
  v_last     text;
  v_paid     bigint;
  v_payments jsonb;
  v_req_no   text;
  -- settings reservations.expiry_soon_days: what «قربت تنتهي» means today. Read here so the list screen and
  -- one client file agree about the same reservation without either of them deciding it.
  v_soon     integer := greatest(app.setting_int('reservations.expiry_soon_days', 0), 0);
begin
  select * into v_r from public.reservations r where r.id = p_reservation;
  if not found then
    return null;
  end if;
  select * into v_pj from public.projects pj where pj.id = v_r.project_id;
  select * into v_person from public.persons ps where ps.id = v_r.person_id;

  -- The live inventory, never a stored count (§46).
  select (count(*) filter (where t.state = 'reserved'))::integer,
         (count(*) filter (where t.state = 'sold'))::integer
  into v_held, v_sold
  from public.trees t
  where t.reservation_id = v_r.id;

  select t.code into v_first from public.trees t where t.reservation_id = v_r.id order by t.seq limit 1;
  select t.code into v_last  from public.trees t where t.reservation_id = v_r.id order by t.seq desc limit 1;

  select coalesce(sum(p.amount_millimes), 0)::bigint into v_paid
  from public.payments p
  where p.reservation_id = v_r.id and p.kind = 'deposit' and p.voided_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'reference_no', p.reference_no,
           'kind', p.kind::text,
           'kind_label', coalesce(v_kinds->>p.kind::text, p.kind::text),
           'amount_millimes', p.amount_millimes,
           'method_label', p.method_label_ar,
           'reference', p.reference,
           'received_at', p.received_at,
           'note', p.note,
           'voided', p.voided_at is not null,
           'void_reason', p.void_reason,
           'recorded_by', (select pr.full_name from public.profiles pr where pr.id = p.recorded_by))
         -- Newest first, and deterministic inside one transaction: created_at is identical for two rows
         -- written by the same call chain, so the sequence in the reference number breaks the tie.
         order by p.received_at desc, p.reference_no desc), '[]'::jsonb)
  into v_payments
  from public.payments p
  where p.reservation_id = v_r.id;

  select r.request_no into v_req_no from public.interest_requests r where r.id = v_r.request_id;

  return jsonb_build_object(
    'id', v_r.id,
    'reference_no', v_r.reference_no,
    'status', v_r.status::text,
    'status_label', coalesce(v_labels->>v_r.status::text, v_r.status::text),
    'person_id', v_r.person_id,
    'person_name', v_person.full_name,
    'person_phone', v_person.phone_e164,
    'project_id', v_r.project_id,
    'offer_name', v_pj.name,
    'offer_code', v_pj.code,
    'request_id', v_r.request_id,
    'request_no', v_req_no,

    'trees_count', v_r.trees_count,
    'trees_held', coalesce(v_held, 0),
    'trees_sold', coalesce(v_sold, 0),
    'first_code', v_first,
    'last_code', v_last,

    'deposit_due_millimes', v_r.deposit_due_millimes,
    'deposit_paid_millimes', v_paid,
    'deposit_left_millimes', greatest(v_r.deposit_due_millimes - v_paid, 0),
    'deposit_paid_at', v_r.deposit_paid_at,
    'payments', v_payments,

    'valid_days', v_r.valid_days,
    'reserved_at', v_r.reserved_at,
    'expires_at', v_r.expires_at,
    -- §24, computed here and nowhere else. A closed reservation is never «overdue»: it is finished.
    'is_open', v_r.status in ('awaiting_deposit', 'deposit_paid'),
    'is_overdue', v_r.expires_at is not null and v_r.expires_at < now()
                  and v_r.status in ('awaiting_deposit', 'deposit_paid'),
    'days_left', case when v_r.expires_at is null or v_r.status not in ('awaiting_deposit', 'deposit_paid')
                      then null
                      else floor(extract(epoch from (v_r.expires_at - now())) / 86400)::integer end,
    'is_soon', v_r.expires_at is not null and v_r.expires_at >= now()
               and v_r.status in ('awaiting_deposit', 'deposit_paid')
               and floor(extract(epoch from (v_r.expires_at - now())) / 86400)::integer <= v_soon,
    'conditions_ar', v_r.conditions_ar,
    'note', v_r.note,

    'extended_count', v_r.extended_count,
    'extended_at', v_r.extended_at,
    'closed_at', v_r.closed_at,
    'close_reason', v_r.close_reason,
    'trees_released', v_r.trees_released,
    'created_by', (select pr.full_name from public.profiles pr where pr.id = v_r.created_by));
end $$;
revoke execute on function app.reservation_payload(uuid) from public, anon, authenticated;

-- The list screen. «What needs attention first» is the default, because §24's whole point is that somebody
-- has to look before a deadline passes.
create or replace function public.staff_reservations(
  p_filter text default 'open', p_project uuid default null, p_limit integer default 100
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_filter text := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'open');
  v_limit  integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_soon   integer := greatest(app.setting_int('reservations.expiry_soon_days', 0), 0);
  v_rows   jsonb;
  v_counts jsonb;
  v_total  integer;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_filter not in ('open', 'awaiting', 'soon', 'overdue', 'paid', 'closed', 'all') then
    raise exception 'invalid_reservation_filter' using errcode = 'P0001';
  end if;

  -- One pass, so the counts and the rows can never describe two different sets. A commercial sees only the
  -- files assigned to them, exactly as every other CRM read does.
  with visible as (
    select r.*,
           r.status in ('awaiting_deposit', 'deposit_paid') as is_open,
           r.expires_at is not null and r.expires_at < now()
             and r.status in ('awaiting_deposit', 'deposit_paid') as is_overdue,
           case when r.expires_at is null or r.status not in ('awaiting_deposit', 'deposit_paid') then null
                else floor(extract(epoch from (r.expires_at - now())) / 86400)::integer end as days_left
    from public.reservations r
    where app.can_see_person(r.person_id)
      and (p_project is null or r.project_id = p_project)
  ), tagged as (
    select v.*,
           (v.is_open and not v.is_overdue and v.days_left is not null and v.days_left <= v_soon) as is_soon
    from visible v
  ), kept as (
    select t.*
    from tagged t
    where case v_filter
            when 'open'     then t.is_open
            when 'awaiting' then t.status = 'awaiting_deposit'
            when 'soon'     then t.is_soon
            when 'overdue'  then t.is_overdue
            when 'paid'     then t.status = 'deposit_paid'
            when 'closed'   then not t.is_open
            else true
          end
  )
  select (select count(*)::integer from kept),
         -- FULL payloads, not a thinner summary. A list row and a client file would otherwise be two
         -- definitions of «a reservation» on two screens, and the day one of them gains a field the other
         -- starts lying by omission. The cap bounds the work; app.reservation_payload is the one definition.
         (select coalesce(jsonb_agg(app.reservation_payload(x.id)
                          order by x.rank, x.expires_at nulls last, x.reserved_at desc), '[]'::jsonb)
          from (
            select k.id, k.expires_at, k.reserved_at,
                   -- What the list sorts by: overdue first, then closing in, then the rest.
                   case when k.is_overdue then 0 when k.is_soon then 1 when k.is_open then 2 else 3 end as rank
            from kept k
            order by rank, k.expires_at nulls last, k.reserved_at desc
            limit v_limit) x),
         (select jsonb_build_object(
                   'open',     count(*) filter (where t.is_open),
                   'awaiting', count(*) filter (where t.status = 'awaiting_deposit'),
                   'soon',     count(*) filter (where t.is_soon),
                   'overdue',  count(*) filter (where t.is_overdue),
                   'paid',     count(*) filter (where t.status = 'deposit_paid'),
                   'closed',   count(*) filter (where not t.is_open),
                   'all',      count(*))
          from tagged t)
  into v_total, v_rows, v_counts;

  return jsonb_build_object(
    'module_state', app.flag_state('reservations')::text,
    'filter', v_filter,
    'limit', v_limit,
    'soon_days', v_soon,
    'matched', v_total,
    'capped', v_total > v_limit,
    'counts', v_counts,
    'rows', v_rows);
end $$;
revoke execute on function public.staff_reservations(text, uuid, integer) from public, anon;
grant execute on function public.staff_reservations(text, uuid, integer) to authenticated;

comment on function public.staff_reservations(text, uuid, integer) is
  'The Back Office list of reservations, with its counts, ordered by what needs attention first: overdue (§24), then closing in, then the rest. Filters: open · awaiting · soon · overdue · paid · closed · all. A commercial sees only the files assigned to them (app.can_see_person). No module gate — the flag governs visitors, not the team; its state is returned as module_state so the screen can say the module is off.';

create or replace function public.staff_reservation(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_person uuid;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select r.person_id into v_person from public.reservations r where r.id = p_reservation;
  if v_person is null or not app.can_see_person(v_person) then
    return null;
  end if;
  return app.reservation_payload(p_reservation);
end $$;
revoke execute on function public.staff_reservation(uuid) from public, anon;
grant execute on function public.staff_reservation(uuid) to authenticated;

-- Everything one client file needs in a single read: their reservations in full, and — for the «احجز» form —
-- the terms of each offer they have an open demand on. §45's screen is built from this.
create or replace function public.staff_person_reservations(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rows  jsonb;
  v_terms jsonb;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.can_see_person(p_person) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(app.reservation_payload(r.id) order by r.reserved_at desc), '[]'::jsonb)
  into v_rows
  from public.reservations r
  where r.person_id = p_person;

  -- One entry per offer this person has a demand on, so the form can show what a hold on it would cost and
  -- how long it would last BEFORE the commercial presses the button — the deposit is a sentence said on the
  -- phone, not a surprise afterwards.
  select coalesce(jsonb_agg(distinct app.offer_reservation_terms(ir.project_id)), '[]'::jsonb)
  into v_terms
  from public.interest_requests ir
  where ir.person_id = p_person and ir.project_id is not null;

  return jsonb_build_object(
    'module_state', app.flag_state('reservations')::text,
    'person_id', p_person,
    'reservations', v_rows,
    'offer_terms', v_terms);
end $$;
revoke execute on function public.staff_person_reservations(uuid) from public, anon;
grant execute on function public.staff_person_reservations(uuid) to authenticated;

comment on function public.staff_person_reservations(uuid) is
  'One client file''s reservations in full, plus the reservation terms of every offer they have a demand on. Staff, limited to the files they may see.';

-- ---------------------------------------------------------------------------
-- 8 · Writers · every one of them module-gated, role-gated, reasoned and audited
-- ---------------------------------------------------------------------------

create or replace function app.assert_reservations_open() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.module_open('reservations') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.assert_reservations_open() from public, anon, authenticated;

-- §23, the whole act: hold N trees of an offer for a person, and write down what it costs, until when, and
-- under which conditions.
--
-- The allocation is NOT re-implemented. app.allocate_offer_trees does the picking, the locking and the
-- refusals (below_min_trees · not_enough_trees · offer_not_available · invalid_person · invalid_request), and
-- because this runs in one transaction, a failure there rolls the reservation row back with it: a reservation
-- whose trees were never taken cannot exist, and neither can trees taken for a reservation that was not
-- written.
create or replace function public.staff_create_reservation(
  p_project uuid, p_person uuid, p_request uuid, p_trees integer, p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_terms   jsonb;
  v_deposit bigint;
  v_days    integer;
  v_cond    text;
  v_id      uuid;
  v_ref     text;
  v_year    text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_alloc   jsonb;
  v_ids     uuid[];
  v_status  public.reservation_status;
  v_expires timestamptz;
begin
  perform app.assert_reservations_open();

  -- The same gate staff_allocate_trees applies (0054 §7): a commercial reserves inside their own file, and
  -- the agricultural manager — who reads no client file — never reserves.
  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  v_terms := app.offer_reservation_terms(p_project);
  if v_terms is null then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;
  v_deposit := (v_terms->>'deposit_millimes')::bigint;
  v_days    := (v_terms->>'valid_days')::integer;
  v_cond    := v_terms->>'conditions_ar';

  -- §24, in Postgres and only here. valid_days = 0 means the owner set no deadline, so there is none — not a
  -- deadline of today.
  v_expires := case when v_days > 0 then now() + make_interval(days => v_days) end;
  -- §23's first status. An offer that asks for nothing has nothing to await; the reservation is open and
  -- settled from the start, and the audit row says the deposit due was zero.
  v_status  := case when v_deposit > 0 then 'awaiting_deposit' else 'deposit_paid' end::public.reservation_status;

  v_ref := app.setting_text('reservation_no.prefix', 'AGZ-RES') || '-' || v_year || '-'
           || lpad(app.next_number('reservation:' || v_year)::text, 6, '0');

  insert into public.reservations (
    reference_no, person_id, project_id, request_id, status, trees_count,
    deposit_due_millimes, valid_days, conditions_ar, expires_at, deposit_paid_at,
    note, created_by, updated_by
  ) values (
    v_ref, p_person, p_project, p_request, v_status, greatest(coalesce(p_trees, 0), 1),
    v_deposit, v_days, v_cond, v_expires,
    case when v_status = 'deposit_paid' then now() end,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), auth.uid()
  ) returning id into v_id;

  -- The inventory half. Everything it refuses, it refuses for the whole call.
  v_alloc := app.allocate_offer_trees(p_project, p_person, p_request, p_trees, 'reserved');

  select array_agg(x::uuid) into v_ids
  from jsonb_array_elements_text(coalesce(v_alloc->'tree_ids', '[]'::jsonb)) x;

  update public.trees t set reservation_id = v_id where t.id = any (coalesce(v_ids, '{}'::uuid[]));
  update public.reservations r
     set trees_count = coalesce(cardinality(v_ids), r.trees_count)
   where r.id = v_id;

  perform app.write_audit('reservations.create', 'reservations', v_id::text, null,
                          jsonb_build_object('reference_no', v_ref, 'person_id', p_person,
                                             'project_id', p_project, 'request_id', p_request,
                                             'status', v_status::text,
                                             'deposit_due_millimes', v_deposit,
                                             'valid_days', v_days, 'expires_at', v_expires,
                                             'allocation', v_alloc),
                          null);

  return app.reservation_payload(v_id);
end $$;
revoke execute on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text) to authenticated;

comment on function public.staff_create_reservation(uuid, uuid, uuid, integer, text, text) is
  'Opens a reservation (§23): takes p_trees trees of the offer through app.allocate_offer_trees — all of them or none — and records what the hold costs, how long it is valid and under which conditions, each copied from app.offer_reservation_terms so a later edit of the offer cannot rewrite it. Status starts at «Reserved – Awaiting Deposit», or at «Deposit Paid» when the offer asks for no deposit. Staff, limited to the files they may see. Refused while the `reservations` module is disabled (module_closed).';

-- §23's second status, and §59's evidence. The amount is whatever was actually handed over — a client may pay
-- the عربون in two goes — and the status is recomputed from the sum, never set by the caller.
create or replace function public.staff_record_deposit(
  p_reservation uuid, p_amount_millimes bigint, p_method uuid, p_received_at timestamptz,
  p_reference text, p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r      public.reservations;
  v_method public.option_items;
  v_ref    text;
  v_year   text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_paid   bigint;
  v_id     uuid;
begin
  perform app.assert_reservations_open();

  select * into v_r from public.reservations r where r.id = p_reservation for no key update;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  -- Money is Finance's desk (§33); seeing the file is still required, so a Finance user cannot record against
  -- a person they may not read.
  if not (app.can_record_money() and app.can_see_person(v_r.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_r.status not in ('awaiting_deposit', 'deposit_paid') then
    raise exception 'reservation_closed' using errcode = 'P0001';
  end if;
  if v_r.deposit_due_millimes = 0 then
    raise exception 'deposit_not_due' using errcode = 'P0001';
  end if;
  if p_amount_millimes is null or p_amount_millimes <= 0 then
    raise exception 'invalid_deposit_amount' using errcode = 'P0001';
  end if;

  if p_method is not null then
    v_method := app.active_option('payment_method', p_method::text);
    if v_method.id is null then
      raise exception 'invalid_payment_method' using errcode = 'P0001';
    end if;
  end if;

  v_ref := app.setting_text('payment_no.prefix', 'AGZ-PAY') || '-' || v_year || '-'
           || lpad(app.next_number('payment:' || v_year)::text, 6, '0');

  insert into public.payments (
    reference_no, reservation_id, person_id, project_id, kind, amount_millimes,
    method_option_id, method_label_ar, reference, received_at, note, recorded_by, updated_by
  ) values (
    v_ref, v_r.id, v_r.person_id, v_r.project_id, 'deposit', p_amount_millimes,
    v_method.id, v_method.label_ar, nullif(btrim(coalesce(p_reference, '')), ''),
    coalesce(p_received_at, now()), nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), auth.uid()
  ) returning id into v_id;

  -- «Deposit Paid» is derived, here, from the live rows — so voiding a payment takes the status back with it
  -- and there is never a second truth about whether the عربون arrived.
  select coalesce(sum(p.amount_millimes), 0)::bigint into v_paid
  from public.payments p
  where p.reservation_id = v_r.id and p.kind = 'deposit' and p.voided_at is null;

  update public.reservations r
     set status = (case when v_paid >= r.deposit_due_millimes then 'deposit_paid' else 'awaiting_deposit' end)::public.reservation_status,
         deposit_paid_at = case when v_paid >= r.deposit_due_millimes then coalesce(r.deposit_paid_at, now()) end,
         updated_by = auth.uid()
   where r.id = v_r.id;

  perform app.write_audit('payments.record', 'payments', v_id::text, null,
                          jsonb_build_object('reference_no', v_ref, 'reservation_id', v_r.id,
                                             'person_id', v_r.person_id, 'kind', 'deposit',
                                             'amount_millimes', p_amount_millimes,
                                             'method', v_method.label_ar,
                                             'received_at', coalesce(p_received_at, now()),
                                             'deposit_paid_millimes', v_paid,
                                             'deposit_due_millimes', v_r.deposit_due_millimes),
                          null);

  return app.reservation_payload(v_r.id);
end $$;
revoke execute on function public.staff_record_deposit(uuid, bigint, uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.staff_record_deposit(uuid, bigint, uuid, timestamptz, text, text, text) to authenticated;

comment on function public.staff_record_deposit(uuid, bigint, uuid, timestamptz, text, text, text) is
  'Records money received against a reservation (§23 «Deposit Paid»): amount in millimes, method from the option list payment_method, when it arrived and its reference. The reservation''s status is recomputed from the sum of its live deposit rows, never set by the caller. Finance, Admin and Super Admin, on a file they may see. Refused while the module is disabled.';

-- Correcting a receipt without erasing it (§59: every movement leaves a trace).
create or replace function public.staff_void_payment(p_payment uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_p    public.payments;
  v_r    public.reservations;
  v_paid bigint;
begin
  perform app.assert_reservations_open();

  select * into v_p from public.payments p where p.id = p_payment for no key update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_record_money() and app.can_see_person(v_p.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_p.voided_at is not null then
    raise exception 'payment_already_void' using errcode = 'P0001';
  end if;

  update public.payments p
     set voided_at = now(), voided_by = auth.uid(),
         void_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_by = auth.uid()
   where p.id = v_p.id;

  if v_p.reservation_id is not null then
    select * into v_r from public.reservations r where r.id = v_p.reservation_id for no key update;
    select coalesce(sum(p.amount_millimes), 0)::bigint into v_paid
    from public.payments p
    where p.reservation_id = v_r.id and p.kind = 'deposit' and p.voided_at is null;

    -- A closed reservation keeps its closing status: voiding a receipt does not reopen a cancelled hold.
    if v_r.status in ('awaiting_deposit', 'deposit_paid') then
      update public.reservations r
         set status = (case when v_paid >= r.deposit_due_millimes and r.deposit_due_millimes > 0
                              then 'deposit_paid'
                            when r.deposit_due_millimes = 0 then 'deposit_paid'
                            else 'awaiting_deposit' end)::public.reservation_status,
             deposit_paid_at = case when v_paid >= r.deposit_due_millimes then r.deposit_paid_at end,
             updated_by = auth.uid()
       where r.id = v_r.id;
    end if;
  end if;

  perform app.write_audit('payments.void', 'payments', v_p.id::text,
                          to_jsonb(v_p),
                          jsonb_build_object('voided_at', now(), 'deposit_paid_millimes', v_paid),
                          null);

  return case when v_p.reservation_id is null then jsonb_build_object('payment_id', v_p.id, 'voided', true)
              else app.reservation_payload(v_p.reservation_id) end;
end $$;
revoke execute on function public.staff_void_payment(uuid, text) from public, anon;
grant execute on function public.staff_void_payment(uuid, text) to authenticated;

comment on function public.staff_void_payment(uuid, text) is
  'Marks a recorded payment void, keeping the row, and recomputes the reservation''s deposit status. The way a wrong amount is corrected: void it and record the right one, so the audit trail keeps both. Finance, Admin and Super Admin.';

-- §24, first choice: «يمدد». The new date is computed in Postgres from the day it would have ended, or from
-- today when it already has, so extending an overdue hold gives the client the days promised and not the days
-- they were already past.
create or replace function public.staff_extend_reservation(
  p_reservation uuid, p_days integer, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r    public.reservations;
  v_days integer;
  v_cap  integer := greatest(app.setting_int('reservations.max_extend_days', 0), 0);
  v_from timestamptz;
  v_new  timestamptz;
begin
  perform app.assert_reservations_open();

  select * into v_r from public.reservations r where r.id = p_reservation for no key update;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  -- §24 gives the three choices to الأدمن; Finance holds the same line everywhere else in this file.
  if not (app.can_record_money() and app.can_see_person(v_r.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_r.status not in ('awaiting_deposit', 'deposit_paid') then
    raise exception 'reservation_closed' using errcode = 'P0001';
  end if;

  -- No p_days means «give it the offer's period again», which is what an extension usually is.
  v_days := coalesce(nullif(p_days, 0), v_r.valid_days);
  if v_days is null or v_days < 1 then
    raise exception 'invalid_extend_days' using errcode = 'P0001';
  end if;
  if v_cap > 0 and v_days > v_cap then
    raise exception 'extend_over_cap' using errcode = 'P0001';
  end if;

  v_from := greatest(coalesce(v_r.expires_at, now()), now());
  v_new  := v_from + make_interval(days => v_days);

  update public.reservations r
     set expires_at = v_new,
         -- A hold that had no deadline now has one, so the snapshot has to say so or the check constraint
         -- (valid_days = 0) = (expires_at is null) would be a lie about this row.
         valid_days = case when r.valid_days = 0 then v_days else r.valid_days end,
         extended_count = r.extended_count + 1,
         extended_at = now(),
         updated_by = auth.uid()
   where r.id = v_r.id;

  perform app.write_audit('reservations.extend', 'reservations', v_r.id::text,
                          jsonb_build_object('expires_at', v_r.expires_at),
                          jsonb_build_object('expires_at', v_new, 'days', v_days), null);

  return app.reservation_payload(v_r.id);
end $$;
revoke execute on function public.staff_extend_reservation(uuid, integer, text) from public, anon;
grant execute on function public.staff_extend_reservation(uuid, integer, text) to authenticated;

comment on function public.staff_extend_reservation(uuid, integer, text) is
  'Pushes a reservation''s expiry date out (§24 «يمدد»). p_days null or 0 repeats the offer''s own period. Counted from the old deadline, or from now when it has already passed. Capped by the setting reservations.max_extend_days (0 = no cap). Finance, Admin and Super Admin, on a file they may see.';

-- §24, the other two choices, in ONE function on purpose: «يلغي» closes the paperwork and «يرجع القطعة
-- Available» frees the trees, and doing them as two RPCs from TypeScript is how you get a cancelled
-- reservation whose 40 trees are still marked reserved. Releasing meets app.can_manage_trees ∩
-- app.can_see_person = Finance and Admin, which is exactly who §24 names, so one role check covers both acts.
create or replace function public.staff_close_reservation(
  p_reservation uuid, p_outcome text, p_release boolean, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r       public.reservations;
  v_status  public.reservation_status;
  v_release boolean := coalesce(p_release, true);
  v_ids     uuid[];
  v_freed   integer := 0;
begin
  perform app.assert_reservations_open();

  select * into v_r from public.reservations r where r.id = p_reservation for no key update;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_record_money() and app.can_see_person(v_r.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_r.status not in ('awaiting_deposit', 'deposit_paid') then
    raise exception 'reservation_closed' using errcode = 'P0001';
  end if;

  begin
    v_status := nullif(btrim(coalesce(p_outcome, '')), '')::public.reservation_status;
  exception when invalid_text_representation then
    raise exception 'invalid_reservation_outcome' using errcode = 'P0001';
  end;
  -- 'converted' belongs to the contract (§14/§28) and is set by stage 3, not from this screen.
  if v_status is null or v_status not in ('cancelled', 'expired') then
    raise exception 'invalid_reservation_outcome' using errcode = 'P0001';
  end if;

  -- Only this reservation's own trees, and only the ones still held: a tree already sold is a client's tree
  -- and closing a hold never touches it (0054's own rule, read from this side).
  select array_agg(t.id order by t.id) into v_ids
  from public.trees t
  where t.reservation_id = v_r.id and t.state = 'reserved';

  if v_release and v_ids is not null then
    -- Locked in id order, exactly as staff_set_tree_state does, so two staff closing overlapping work queue
    -- instead of deadlocking. reservation_id is cleared by the trees_reservation_unlink trigger.
    perform 1 from public.trees t where t.id = any (v_ids) order by t.id for update;
    update public.trees t
       set state = 'available', held_by = null, request_id = null, allocated_at = null
     where t.id = any (v_ids);
    get diagnostics v_freed = row_count;
  end if;

  update public.reservations r
     set status = v_status,
         closed_at = now(),
         closed_by = auth.uid(),
         close_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         trees_released = v_release and v_freed > 0,
         updated_by = auth.uid()
   where r.id = v_r.id;

  perform app.write_audit('reservations.close', 'reservations', v_r.id::text,
                          jsonb_build_object('status', v_r.status::text, 'expires_at', v_r.expires_at),
                          jsonb_build_object('status', v_status::text, 'released', v_release,
                                             'trees_freed', v_freed, 'tree_ids', to_jsonb(v_ids)), null);

  return app.reservation_payload(v_r.id);
end $$;
revoke execute on function public.staff_close_reservation(uuid, text, boolean, text) from public, anon;
grant execute on function public.staff_close_reservation(uuid, text, boolean, text) to authenticated;

comment on function public.staff_close_reservation(uuid, text, boolean, text) is
  'Ends a reservation (§24): p_outcome ''cancelled'' or ''expired'', and p_release true also puts its trees back to available in the SAME transaction, so a closed hold can never leave its stock frozen. Only that reservation''s own still-reserved trees; a sold tree is never touched. Finance, Admin and Super Admin — the intersection of app.can_manage_trees and app.can_see_person, which is who §24 names.';

-- ---------------------------------------------------------------------------
-- 9 · What the modules screen says about this module
-- ---------------------------------------------------------------------------

-- The row still cites «البند 13» of the first كراس الشروط. The build follows report v3, where the deposit is
-- §23 and the validity period is §24. The STATE is untouched: it stays 'disabled' until the owner presses the
-- button himself.
update public.feature_flags
   set label_ar = 'العربون والحجز',
       description_ar = 'حجز الزيتونات لحريف مع عربون ومدّة صلاحية وشروط (التقرير v3، البندان 23 و24). كل عرض يحدّد مبلغ العربون ومدّة الحجز وشروطه، وإلا يورث الإعدادات العامة. «معطّل» يوقّف الحجز وتسجيل العربون على الفريق أيضاً؛ «داخلي فقط» يخلّي الفريق يخدم بيه قبل النشر.'
 where key = 'reservations';
