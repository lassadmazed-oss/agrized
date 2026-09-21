-- bb_40 · Stage 4, first half: what a service COSTS, what a client SUBSCRIBES to, and what was DONE.
--
-- ███ DRAFT. NOT APPLIED. Its test lives in supabase/pending/tests/040_agri_services.sql, NOT in
-- ███ supabase/tests/ — a file in supabase/tests/ is run by `npm run db:test` against the LIVE database, where
-- ███ none of these tables exists, so it would stand permanently red and destroy the suite's signal for the
-- ███ two other teams working in this repository. WHOEVER APPLIES THIS FILE MOVES ITS TEST BACK:
-- ███   git mv supabase/pending/tests/040_agri_services.sql supabase/tests/040_agri_services.sql
-- ███ Until then it is run by dry-run, which always rolls back:
-- ███   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_40_agri_services.sql \
-- ███        supabase/pending/tests/040_agri_services.sql
--
-- Owner, 2026-09-19: «continue working, dont stop», walking down the disabled modules. This file is the
-- database half of الـBack Office الفلاحي (flag agri_backoffice) and الاشتراك السنوي (flag subscriptions).
-- Report v3 §35 · §36 · §37, cahier v2 §40 · §41 · §42 · §43 · §44.
--
-- ===========================================================================
-- THE THREE RECORDS, AND WHY THEY ARE THREE
-- ===========================================================================
-- v3 §36 names five attributes of a service — Price, Frequency, Provider, Status, Payment — and says nothing
-- about at what level each one is set. Read as one flat table it produces a row that is at the same time a
-- catalogue entry, a bill and a work order: three different lifetimes in one row, and correcting it later
-- means rewriting money a client has already been quoted. So it is three records:
--
--   1 · WHAT AN OFFER OFFERS.   public.projects.service_option_ids (0023) × option_items('agrized_service').
--       ALREADY EXISTS, ALREADY DATA, and its column comment says it plainly: «Names only, no price».
--       This file does not duplicate it, does not replace it, and adds no second service list.
--
--   2 · WHAT ONE SERVICE COSTS IN ONE OFFER.  public.project_service_terms below — §36's Price + Frequency
--       + Provider. They are NOT properties of the name: التقليم on a 576 m² traditional tree is not التقليم
--       on a 25 m² intensive one. One row per (offer, service), plus a global row (project_id is null) every
--       offer inherits from — the same inheritance app.tree_price has used since 0031.
--
--   3 · WHAT WAS ACTUALLY DONE.  public.agri_operations below — v2 §41's field list, verbatim: Operation
--       type · Project · (Parcel →) scope · Supplier · Planned date · Execution date · Cost · Notes ·
--       Approved by. It needs no client, no contract and no money owed, which is why it is the only part of
--       stage 4 that is useful TODAY: all 8,600 trees are still 'available' and the grove still has to be
--       ploughed.
--
--   and the commitment that binds 2 to a person:  public.subscriptions + public.subscription_lines —
--   v2 §40 «الحريف يدفع Annual fixed package» and «الإدارة تحدد شنو داخل وشنو خارج الباقة». §36's Status and
--   Payment live here and nowhere else, in TWO columns, never one.
--
-- ===========================================================================
-- THE ANNUAL FEE IS QUOTED ONCE. THIS FILE MAKES A SECOND FIGURE IMPOSSIBLE.
-- ===========================================================================
-- public.tree_pricing_rules.annual_fee_per_tree_millimes (0045) is shown to every visitor on the offer page
-- as «معاليم الصيانة والتقليم في العام», snapshotted into public.interest_requests at request time (0049),
-- and the site promises «بمقابل معلوم ومتّفق عليه قبل». It is live today at 12,000 millimes on the global
-- row, with TX-00215 repeating the same 12,000 and the other two offers inheriting it.
--
-- THE RULE, in one sentence: THE ANNUAL FEE IS THE SUBSCRIPTION PRICE — not a subset of it, not money on top
-- of it. Three consequences, each enforced below and not left to a screen:
--
--   a · public.subscriptions has NO annual-amount column of its own. It stores a SNAPSHOT,
--       fee_per_tree_millimes, copied at creation from app.tree_price's resolution (offer, then global), with
--       fee_source recording which row it came from. It never re-reads the current value afterwards. Three
--       different annual fees have already been quoted to three different people in three days (150,000 ·
--       25,000 · 12,000 millimes, live in interest_requests), so a subscription that recomputed from today's
--       global row would bill the 150 د client 12 د, and the promise above would be false in writing.
--
--   b · A service that is INSIDE the package carries no price. `check (not in_annual_package or
--       amount_millimes = 0)`. Its price is the annual fee. Two numbers that could disagree cannot both
--       exist, so nobody has to decide which one wins.
--
--   c · Everything outside the package — الجني، النقل، العصر، الحراسة، بيع المحصول — is an extra and carries
--       its own price on its own tariff row (v2 §44: «كل اختيار عنده تكلفته وشروطه»).
--
-- ===========================================================================
-- THE GRAIN OF AN OPERATION (the decision the task asked to be justified)
-- ===========================================================================
-- An operation is recorded ONCE, at OFFER grain, with an OPTIONAL explicit subset of trees.
--
-- Not per tree: «we ploughed the grove» on TX-00215 would be 8,000 rows for one act, 8,000 audit rows through
-- app.audit_row_change, and a screen that is a pagination problem on its first day — 8,000 records of a
-- measurement nobody took. Not offer-only either: the whole premise is «زيتونتك هي مشروعك», and §38 promises
-- a buyer sees what was done to THEIR numbered trees. So: public.agri_operations is one row per act, and
-- public.agri_operation_trees names trees only when the act genuinely touched some and not others (a replaced
-- tree, one client's pruning). A client's view then reads: the operations of my offer, plus the operations
-- that name my trees. That is v3 §48's «ما يلزمش كل زيتونة تكون Entity مستقلة دائماً» applied after the sale.
--
-- ===========================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ===========================================================================
--   · NO PAYMENTS TABLE, AND NO RECEIPT. public.payments exists — the reservations team applied it as
--     supabase/migrations/0063_reservations.sql WHILE this file was being written (verified live: the table
--     is there and public.payment_kind holds deposit · down_payment · installment · other). Its own comment
--     says it is «the only receipt» and that later stages add A VALUE AND A COLUMN, «not another table». So
--     a subscription here records WHAT IS OWED and a payment_status a human sets; it records no dinar
--     received, and it creates no second money ledger.
--     THE FOLLOW-UP IS NOW UNBLOCKED AND IS EXACTLY TWO LINES, in a draft of its own (bb_43) that belongs to
--     whoever owns money next — not to this file, because 0063 is another team's and was applied an hour ago:
--         alter type public.payment_kind add value 'subscription';
--         alter table public.payments add column subscription_id uuid references public.subscriptions (id);
--     plus a `create or replace` of public.staff_subscriptions returning paid and remaining per row, after
--     which subscriptions.payment_status is derived from the receipts instead of set by hand. The enum value
--     must land in its own transaction before anything uses it, so it cannot be folded in here even if this
--     file owned it.
--   · NO public.parcels, no app.parcel_price, no public.parcel_status, anywhere: bb_03 retires that layer and
--     nothing here may block it. v2 §41's «Parcel» is read as «scope», per v3.
--   · NO SUPPLIER PORTAL, no supplier account, no supplier-facing route (v2 §42: «في النسخة الأولى لا يوجد
--     Supplier Portal»). The provider is a row of an option list the owner edits, plus a free-text note for a
--     supplier not worth a row. When the portal arrives it is a table keyed on the same uuid, so it is an
--     added policy then, not a data migration.
--   · NO PHOTOS YET. v2 §41 lists Photos and §45 lists Documents. Both need a PRIVATE storage bucket (a
--     client's grove photos must never land in the public `project-media` bucket) plus an upload screen and a
--     signed-download route. That is its own draft, bb_44, and is named in the handover rather than
--     half-built here.
--   · NO HARVEST, NO ZITOUNTI. flags `harvest` and `zitounti` are another agent's half of stage 4; this file
--     creates nothing they would collide with.
--   · NO SCHEDULER, NO MESSAGE SENT. Nothing writes to public.notification_outbox: every new agricultural
--     moment («الجني قرب» · «اشتراكك يتجدد») would be a message to a client that the owner has not approved.
--     Being overdue is a FACT OF THE CLOCK the readers compute, never a state a cron writes.
--
-- ===========================================================================
-- THE MODULE GATE, BOTH HALVES
-- ===========================================================================
-- Every WRITER starts with app.module_open('agri_backoffice') / ('subscriptions') and raises module_closed,
-- so «معطّل» genuinely closes the act. The READERS do not gate: src/app/admin/(panel)/layout.tsx:47-54 is
-- explicit that a flag says what VISITORS see and is not an access rule for the team, and the Back Office is
-- where a module is prepared before it is published. Each reader returns the flag's state in `module_state`
-- instead, so the screen can say the module is off. Both flags STAY 'disabled' — the owner presses the
-- switch himself.
--
-- ===========================================================================
-- STATUSES ARE CHECKED TEXT, NOT ENUMS, AND THEIR ARABIC IS A LIST
-- ===========================================================================
-- Every status column below is `text` with a check constraint, and its Arabic label is a row of an
-- option_list joined by code. Codes are closed and the database enforces them; the words are the owner's and
-- he edits them at الإعدادات ← القوائم without a deploy. (A `code` list draws no «add» control on that
-- screen, which is exactly right for a set the check constraint closes.) Two reasons not to use an enum here:
-- adding a value to an enum cannot be used in the transaction that adds it — 0021 already hit that — and
-- v3 §37's «مثلاً» is proof that this owner's examples get mistaken for law.
--
-- ===========================================================================
-- TYPESCRIPT THAT MUST FOLLOW (npm run db:types FIRST; nothing below is in the generated types yet)
-- ===========================================================================
--   1. npm run db:types            public.project_service_terms, public.agri_operations,
--                                  public.agri_operation_trees, public.subscriptions,
--                                  public.subscription_lines and the ten staff_* functions appear. The two
--                                  screens then drop their `callPending` helper and call supabase.rpc()
--                                  directly — a mechanical change with the compiler as the guide.
--   2. src/lib/errors.ts           the Arabic lines listed in
--                                  src/app/admin/(panel)/agri/pending-errors.ts, verbatim. Without them a
--                                  business refusal is reported as a connection problem.
--   3. src/lib/modules-catalog.ts  add "agri_backoffice" and "subscriptions" to IMPLEMENTED_MODULES, or the
--                                  owner cannot switch either module on at all. It publishes nothing: both
--                                  flag rows stay 'disabled'.
--   4. src/components/admin/nav-model.ts + layout.tsx   "/admin/agri": «العمليات الفلاحية» and
--                                  "/admin/subscriptions": «الاشتراكات», each with its flag.
--   mine: src/app/admin/(panel)/agri/* and src/app/admin/(panel)/subscriptions/*.
--
-- DRAFT. Not applied, not numbered. Dry-run with:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_40_agri_services.sql supabase/pending/tests/040_agri_services.sql
-- When it is applied, rename to supabase/migrations/00NN_agri_services.sql and its test to 0NN, with the
-- number in the first line of each.

-- ---------------------------------------------------------------------------
-- 1 · Who may do what
-- ---------------------------------------------------------------------------

-- Running the grove. Exactly the roles app.can_manage_trees() already carries (0054 §1) — the agricultural
-- manager keeps the grove, Finance and Admin may too — written as its own predicate because keeping stock and
-- performing work are two different desks, and the day the owner adds a field agent this is the one function
-- that changes. No new role: report v3's app_role set is untouched.
create or replace function app.can_manage_operations() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_any_role(array['agri_manager', 'finance', 'admin', 'super_admin']::public.app_role[])
$$;
revoke execute on function app.can_manage_operations() from public, anon, authenticated;

comment on function app.can_manage_operations() is
  'Who may record agricultural work (v2 §41): agri manager, Finance, Admin, Super Admin — the same desk app.can_manage_trees() names. A commercial never writes an operation, and never reads one: an operation names a tree code, never the person who holds it.';

create or replace function app.assert_agri_open() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.module_open('agri_backoffice') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.assert_agri_open() from public, anon, authenticated;

create or replace function app.assert_subscriptions_open() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.module_open('subscriptions') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.assert_subscriptions_open() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · The vocabulary — every list below is DATA the owner edits, never a constant
-- ---------------------------------------------------------------------------

-- v2 §40's package names سماد and مداواة, which the v3 §36 list of ten does not carry; seeding either list
-- as «the services» would lose items from the other. option_items('agrized_service') stays the SINGLE
-- vocabulary and gains the two. This is a seed line, not a schema change: the list already exists.
insert into public.option_items (list_key, code, label_ar, label_fr, sort_order, is_active) values
  ('agrized_service', 'fertilising', 'التسميد',  'Fertilisation', 110, true),
  ('agrized_service', 'treatment',   'المداواة', 'Traitement',    120, true)
on conflict (list_key, code) do nothing;

-- §36's «Frequency». A number_range list, because a frequency has to be COMPUTED with, not only displayed:
-- min_number is the number of days between one time and the next, and the readers below use it to answer
-- «what is overdue». An empty min_number means «عند الحاجة» — no schedule, never overdue.
insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('service_frequency', 'دورية الخدمة', 'number_range',
   'كل قدّاش تتعاود الخدمة الفلاحية (التقرير v3 §36). اكتب في «من» عدد الأيام بين مرة وأخرى: 365 = مرة في العام، 180 = كل 6 أشهر، 30 = كل شهر. خلّيها فارغة معناها «عند الحاجة» — ما فماش موعد، وما تتحسبش متأخرة أبداً.')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, min_number, sort_order, is_active) values
  ('service_frequency', 'yearly',     'مرة في العام',  'Annuelle',    365, 10, true),
  ('service_frequency', 'half_year',  'كل 6 أشهر',     'Semestrielle', 180, 20, true),
  ('service_frequency', 'quarterly',  'كل 3 أشهر',     'Trimestrielle', 90, 30, true),
  ('service_frequency', 'monthly',    'كل شهر',        'Mensuelle',     30, 40, true),
  ('service_frequency', 'weekly',     'كل جمعة',       'Hebdomadaire',   7, 50, true),
  ('service_frequency', 'on_demand',  'عند الحاجة',    'À la demande', null, 60, true)
on conflict (list_key, code) do nothing;

-- §36's «Provider», under v2 §42's hard scope decision: «في النسخة الأولى لا يوجد Supplier Portal. AgriZed
-- تتعامل معهم خارج النظام. وفريق AgriZed يسجل النتائج داخله. Architecture لازم تبقى قابلة لإضافة Portal
-- لاحقاً.» A list the owner edits carries that today with no screen to build; the operation also keeps a
-- free-text provider_note for a supplier not worth a row, and for the phone number a list row has nowhere to
-- put. The day the portal arrives, public.suppliers is keyed on this same uuid and the columns below do not
-- move.
insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('service_provider', 'منفّذ الخدمة', 'plain',
   'شكون ينفّذ الخدمة الفلاحية: فريق AgriZed، ولا شركة من برّة، ولا الحريف بروحو. زيد الشركات اللي تخدم معاك. رقم الهاتف والتفاصيل يتكتبوا في خانة «ملاحظة المنفّذ» في العملية روحها. ما فماش حساب ولا دخول للشركات في هذه النسخة (كراس الشروط v2 §42).')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order, is_active) values
  ('service_provider', 'agrized',  'فريق AgriZed',   'Équipe AgriZed',  10, true),
  ('service_provider', 'external', 'شركة متعاقدة',   'Prestataire',     20, true),
  ('service_provider', 'owner',    'الحريف بنفسه',   'Le client',       30, true)
on conflict (list_key, code) do nothing;

-- The Arabic of the three status sets. `code` lists: the owner renames and reorders them, the check
-- constraints below decide which codes exist.
insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('operation_status', 'حالة العملية الفلاحية', 'code',
   'الكلمات اللي تظهر لحالة كل عملية فلاحية. تنجّم تبدّل الصياغة، أما الرموز ثابتة في قاعدة البيانات.'),
  ('subscription_status', 'حالة الاشتراك', 'code',
   'الكلمات اللي تظهر لحالة الاشتراك السنوي. «مرفوض» معناها الحريف ما قبلش الباقة — نخلّيوها مسجّلة باش نعرفو علاش زيتوناتو ما تتخدمش.'),
  ('subscription_payment', 'خلاص الاشتراك', 'code',
   'الكلمات اللي تظهر لخلاص الاشتراك. هذي حقيقة مستقلة على حالة الاشتراك: اشتراك نشيط ينجم يكون ما تخلّصش. الوصولات الحقيقية تجي مع موديول الدفوعات.')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order, is_active) values
  ('operation_status', 'planned',   'مخطّطة', 'Planifiée', 10, true),
  ('operation_status', 'done',      'منجزة',  'Réalisée',  20, true),
  ('operation_status', 'cancelled', 'ملغاة',  'Annulée',   30, true),

  ('subscription_status', 'draft',     'مسوّدة',  'Brouillon', 10, true),
  ('subscription_status', 'active',    'نشيط',    'Actif',     20, true),
  ('subscription_status', 'declined',  'مرفوض',   'Refusé',    30, true),
  ('subscription_status', 'ended',     'منتهي',   'Terminé',   40, true),
  ('subscription_status', 'cancelled', 'ملغى',    'Annulé',    50, true),

  ('subscription_payment', 'unpaid',  'ما تخلّصش',  'Impayé',  10, true),
  ('subscription_payment', 'partial', 'خلاص جزئي',  'Partiel', 20, true),
  ('subscription_payment', 'paid',    'مخلّص',      'Payé',    30, true)
on conflict (list_key, code) do nothing;

-- The label of one code, in Arabic, from the list. Falls back to the code so a deactivated row never makes a
-- screen print nothing at all.
create or replace function app.option_label(p_list text, p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select oi.label_ar from public.option_items oi
                   where oi.list_key = p_list and oi.code = p_code limit 1), p_code)
$$;
revoke execute on function app.option_label(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · The numbers and the sentences that belong to the owner
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('agri.season_start_month', to_jsonb(10), 'integer', 'agri',
   'الشهر اللي يبدا بيه الموسم الفلاحي',
   'الموسم الفلاحي في تونس يبدا مع الصابة، تقريباً في أكتوبر، ويعدّي على رأس العام. حطّينا 10 = أكتوبر. الاشتراك السنوي يمشي مع الموسم، موش مع السنة الميلادية، باش الصابة والباقة يكونوا في نفس المدة. حطّ 1 إذا تحب الاشتراك يبدا مع جانفي.',
   false, 900),

  ('agri.season_label', to_jsonb('موسم {y1}/{y2}'::text), 'text', 'agri',
   'صيغة اسم الموسم',
   'كيفاش يتسمّى الموسم في الشاشات. {y1} = عام البداية، {y2} = عام النهاية. مثال: موسم 2026/2027. كان الموسم يبدا في جانفي، اكتب «موسم {y1}» برك.',
   false, 901),

  ('agri.overdue_grace_days', to_jsonb(7), 'integer', 'agri',
   'أيام التسامح قبل ما العملية تتحسب متأخرة',
   'عدد الأيام بعد الموعد قبل ما الخدمة تولّي «متأخرة» في الشاشة. 7 معناها جمعة تسامح. حطّ 0 إذا تحب الموعد يكون صارم.',
   false, 902),

  ('agri.list_limit', to_jsonb(100), 'integer', 'agri',
   'عدد الأسطر في قائمة العمليات والاشتراكات',
   'أقصى عدد أسطر تظهر في شاشة العمليات الفلاحية وشاشة الاشتراكات في المرة الوحدة. من 10 إلى 500.',
   false, 903),

  ('agri.empty_note', to_jsonb('مازال ما تسجّلت حتى عملية فلاحية. كل خدمة تتعمل في الضيعة — حرث، تقليم، سقي، جني — تتسجّل هنا: شنوّة تعمل، وقتاش، شكون عملها، وبشحال.'::text), 'text', 'agri',
   'الجملة اللي تظهر كي ما فماش عمليات',
   'تظهر في شاشة العمليات الفلاحية كي القائمة فارغة.', false, 904),

  ('agri.services_empty_note', to_jsonb('هذا العرض ما عندو حتى خدمة في بطاقتو. زيد الخدمات في بطاقة العرض قبل ما تحدّد أثمانها.'::text), 'text', 'agri',
   'الجملة اللي تظهر كي العرض ما عندو خدمات',
   'تظهر تحت عرض ما اخترتلوش خدمات في بطاقتو. العرض OFF-AIRPORT اليوم في هذه الحالة، ومع ذلك يعرض معاليم سنوية للزائر.',
   false, 905),

  ('subscriptions.empty_note', to_jsonb('مازال ما فماش اشتراكات. الاشتراك يتعمل بعد ما الحريف يولّي صاحب زيتونات: يغطّي باقة الخدمات السنوية لموسم واحد.'::text), 'text', 'agri',
   'الجملة اللي تظهر كي ما فماش اشتراكات',
   'تظهر في شاشة الاشتراكات كي القائمة فارغة.', false, 906),

  ('subscriptions.package_note', to_jsonb('الاشتراك السنوي هو نفسو معاليم الصيانة والتقليم اللي تتعرض على الزائر في صفحة العرض. ما فماش مبلغ سنوي ثاني: الخدمات اللي جوّة الباقة ما عندهاش ثمن مستقل، واللي برّة الباقة كل وحدة عندها ثمنها.'::text), 'text', 'agri',
   'شرح الباقة السنوية',
   'يظهر في شاشة الاشتراكات فوق القائمة. هذي هي القاعدة اللي تمنع يتعرض مبلغ سنوي مرّتين بزوز أرقام مختلفة.',
   false, 907)
on conflict (key) do nothing;

-- The agricultural season that holds a date: a label, a start and an end, all decided here so no screen
-- invents a year of its own. v2 §43/§44 put the owner's harvest choice «وقت الصابة», which in Tunisia runs
-- from about October to February and therefore straddles a calendar year — so the SUBSCRIPTION PERIOD IS THE
-- SEASON, and the package and the harvest share one boundary by construction. A calendar year is just a
-- season whose start month is 1.
create or replace function app.agri_season(p_on date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month integer := greatest(1, least(app.setting_int('agri.season_start_month', 10), 12));
  v_on    date    := coalesce(p_on, (now() at time zone 'Africa/Tunis')::date);
  v_y1    integer;
  v_start date;
  v_end   date;
begin
  v_y1    := case when extract(month from v_on)::integer >= v_month then extract(year from v_on)::integer
                  else extract(year from v_on)::integer - 1 end;
  v_start := make_date(v_y1, v_month, 1);
  v_end   := (v_start + interval '1 year' - interval '1 day')::date;

  return jsonb_build_object(
    'label', replace(replace(app.setting_text('agri.season_label', 'موسم {y1}/{y2}'),
                             '{y1}', v_y1::text), '{y2}', (v_y1 + 1)::text),
    'starts_on', v_start,
    'ends_on', v_end);
end $$;
revoke execute on function app.agri_season(date) from public, anon, authenticated;

comment on function app.agri_season(date) is
  'The agricultural season a date falls in: its Arabic label, its first day and its last. The start month and the label template are settings (agri.season_start_month, agri.season_label), never constants. The subscription period IS the season, so a client''s package and their harvest never straddle two records.';

-- ---------------------------------------------------------------------------
-- 4 · What one service costs in one offer  (§36 Price · Frequency · Provider)
-- ---------------------------------------------------------------------------

create table public.project_service_terms (
  id                  uuid primary key default gen_random_uuid(),
  -- Null = the global default every offer inherits, exactly as public.tree_pricing_rules does (0031).
  project_id          uuid references public.projects (id) on delete cascade,
  service_option_id   uuid not null references public.option_items (id),
  -- The service's Arabic at the moment the tariff was written, so a renamed list item never rewrites what a
  -- client was told. The id stays the link; this is the snapshot, the way public.payments keeps method_label_ar.
  label_ar            text not null check (char_length(btrim(label_ar)) between 1 and 120),
  -- per_tree     × the number of trees (the normal case, and the only one a subscription can multiply)
  -- per_season   a flat amount for the season whatever the count
  -- per_operation a price each time it is performed
  -- per_m2 is deliberately absent: an offer may list several spacing classes, so «per m²» has no single area
  -- at offer grain, and price per tree already carries the area through the class (0031).
  basis               text not null check (basis in ('per_tree', 'per_season', 'per_operation')),
  amount_millimes     bigint not null default 0 check (amount_millimes >= 0),
  frequency_option_id uuid references public.option_items (id),
  provider_option_id  uuid references public.option_items (id),
  provider_note       text check (provider_note is null or char_length(provider_note) <= 300),
  -- v2 §40: «الإدارة تحدد شنو داخل وشنو خارج الباقة».
  in_annual_package   boolean not null default false,
  note                text check (note is null or char_length(note) <= 500),
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id),
  -- THE RULE OF ONE ANNUAL FIGURE (see the header). A service inside the package has no price of its own:
  -- its price IS tree_pricing_rules.annual_fee_per_tree_millimes. Two numbers that could disagree cannot
  -- both exist.
  constraint project_service_terms_package_is_free check (not in_annual_package or amount_millimes = 0)
);

-- One tariff per service per offer, and one global default per service. Two partial indexes rather than
-- `nulls not distinct`, so the intent is readable in \d.
create unique index project_service_terms_offer_uniq on public.project_service_terms (project_id, service_option_id)
  where project_id is not null;
create unique index project_service_terms_global_uniq on public.project_service_terms (service_option_id)
  where project_id is null;
create index project_service_terms_project_idx on public.project_service_terms (project_id, sort_order);

create trigger project_service_terms_stamp before update on public.project_service_terms
  for each row execute function app.stamp_updated();
create trigger project_service_terms_audit after insert or update or delete on public.project_service_terms
  for each row execute function app.audit_row_change();

comment on table public.project_service_terms is
  'What one AgriZed service costs in one offer (report v3 §36: Price · Frequency · Provider). The service itself is option_items(agrized_service) and what an offer OFFERS is projects.service_option_ids — this table adds only the three attributes that list deliberately omits. A row with project_id null is the global default every offer inherits; an offer row overrides it. A service inside the annual package carries amount_millimes = 0 by constraint: its price is the annual fee and there is never a second annual figure.';
comment on column public.project_service_terms.basis is
  'per_tree (× the number of trees), per_season (flat for the season), per_operation (each time it is done).';
comment on column public.project_service_terms.frequency_option_id is
  'option_items(service_frequency). Its min_number is the number of days between one time and the next; empty means «عند الحاجة» and the service is never counted late.';
comment on column public.project_service_terms.in_annual_package is
  'v2 §40 «الإدارة تحدد شنو داخل وشنو خارج الباقة». True: this service is covered by the annual fee and carries no price of its own. False: it is an extra, priced here (v2 §44 «كل اختيار عنده تكلفته وشروطه»).';

alter table public.project_service_terms enable row level security;
revoke all on public.project_service_terms from anon, authenticated;
grant select on public.project_service_terms to authenticated;

-- A tariff is a SALE price, not a cost or a margin (PRJ-03 restricts those), and the offer page already
-- quotes the annual fee to any visitor — so any staff member may read it. Writing is Finance's and Admin's
-- through the RPC, which is the only writer: report v3 §53 puts every price with them.
create policy project_service_terms_select on public.project_service_terms for select to authenticated
  using ((select app.is_staff()));

-- The resolved terms of one service in one offer: the offer's own row, else the global one, else nothing.
-- Same inheritance as app.tree_price, and it says which row it came from, the way tree_price carries `source`.
create or replace function app.service_terms(p_project uuid, p_service uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_row    public.project_service_terms;
  v_source text := 'project';
begin
  select * into v_row from public.project_service_terms t
  where t.project_id = p_project and t.service_option_id = p_service and t.is_active;

  if not found then
    v_source := 'global';
    select * into v_row from public.project_service_terms t
    where t.project_id is null and t.service_option_id = p_service and t.is_active;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_terms', 'service_option_id', p_service);
  end if;

  return jsonb_build_object(
    'ok', true,
    'terms_id', v_row.id,
    'source', v_source,
    'service_option_id', v_row.service_option_id,
    'label_ar', v_row.label_ar,
    'basis', v_row.basis,
    'amount_millimes', v_row.amount_millimes,
    'in_annual_package', v_row.in_annual_package,
    'frequency_option_id', v_row.frequency_option_id,
    'frequency_label', (select oi.label_ar from public.option_items oi where oi.id = v_row.frequency_option_id),
    'frequency_days', (select oi.min_number::integer from public.option_items oi where oi.id = v_row.frequency_option_id),
    'provider_option_id', v_row.provider_option_id,
    'provider_label', (select oi.label_ar from public.option_items oi where oi.id = v_row.provider_option_id),
    'provider_note', v_row.provider_note,
    'note', v_row.note);
end $$;
revoke execute on function app.service_terms(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5 · What was actually done  (v2 §41, field for field)
-- ---------------------------------------------------------------------------

create table public.agri_operations (
  id                  uuid primary key default gen_random_uuid(),
  -- v2 §41 «Project». The grain: one row per act. See the header for why it is not one row per tree.
  project_id          uuid not null references public.projects (id),
  -- v2 §41 «Operation type» — the same vocabulary the offer advertises, never a second list.
  service_option_id   uuid not null references public.option_items (id),
  label_ar            text not null check (char_length(btrim(label_ar)) between 1 and 120),
  -- v2 §41 «Parcel», read as scope (public.parcels is retiring and holds no rows).
  --   offer → the whole grove; trees → the rows named in public.agri_operation_trees.
  scope               text not null default 'offer' check (scope in ('offer', 'trees')),
  status              text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  -- v2 §41 «Supplier», under §42: no portal, no account. A list row, plus free text for the rest.
  provider_option_id  uuid references public.option_items (id),
  provider_note       text check (provider_note is null or char_length(provider_note) <= 300),
  planned_on          date,
  executed_on         date,
  -- v2 §41 «Cost». It lives here and NOWHERE else: writing it into public.project_costs as well would count
  -- the same dinar twice and silently double the project's expenses in §35's Expected Margin. §35 reads it
  -- with a sum, never a copy.
  cost_millimes       bigint check (cost_millimes is null or cost_millimes >= 0),
  note                text check (note is null or char_length(note) <= 2000),
  -- v2 §41 «Approved by».
  approved_by         uuid references public.profiles (id),
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id),
  -- A finished job says when it was done; a planned one says when it is meant to happen.
  constraint agri_operations_done_has_date check (status <> 'done' or executed_on is not null),
  constraint agri_operations_approved_pair check ((approved_by is null) = (approved_at is null))
);

-- The list reads one offer's work most recent first; the second index answers «what is planned and late».
create index agri_operations_project_idx on public.agri_operations (project_id, executed_on desc nulls last, planned_on desc nulls last);
create index agri_operations_service_idx on public.agri_operations (project_id, service_option_id, executed_on desc nulls last);
create index agri_operations_planned_idx on public.agri_operations (planned_on) where status = 'planned';

create trigger agri_operations_stamp before update on public.agri_operations
  for each row execute function app.stamp_updated();
create trigger agri_operations_audit after insert or update or delete on public.agri_operations
  for each row execute function app.audit_row_change();

comment on table public.agri_operations is
  'One agricultural act on one offer (cahier v2 §41): what was done, when it was planned, when it was executed, by which provider, what it cost, who approved it. Recorded ONCE at offer grain — «we ploughed the grove» is one row, not 8,000 — with public.agri_operation_trees naming trees only when the act touched some and not others. It carries no client and no money owed: that is public.subscriptions.';
comment on column public.agri_operations.cost_millimes is
  'What this act cost AgriZed, in millimes. The only place an operation cost is stored: public.project_costs must never receive a copy, or report v3 §35 counts the same dinar twice. Masked from readers who are not Finance or Admin (PRJ-03).';
comment on column public.agri_operations.scope is
  '«offer»: the whole grove, the normal case (ploughing, irrigation, guarding). «trees»: only the trees listed in public.agri_operation_trees.';

create table public.agri_operation_trees (
  operation_id uuid not null references public.agri_operations (id) on delete cascade,
  tree_id      uuid not null references public.trees (id) on delete cascade,
  primary key (operation_id, tree_id)
);

-- «what was done to MY tree» reads this way round, so the tree leads.
create index agri_operation_trees_tree_idx on public.agri_operation_trees (tree_id, operation_id);

comment on table public.agri_operation_trees is
  'The trees one operation touched, written ONLY when it did not touch the whole offer (a replaced tree, one client''s pruning). An operation with scope «offer» has no row here at all: 8,000 rows saying «the grove was ploughed» would be 8,000 records of one measurement.';

alter table public.agri_operations enable row level security;
alter table public.agri_operation_trees enable row level security;
revoke all on public.agri_operations, public.agri_operation_trees from anon, authenticated;
grant select on public.agri_operations, public.agri_operation_trees to authenticated;

-- The grove log is the agricultural desk's, and it carries a cost: app.can_manage_operations() is the reader
-- as well as the writer. A commercial and Legal are out — they read client files, and an operation names a
-- tree code, never a person. Policies run with the caller's rights and app.can_manage_operations() is not
-- executable by the API roles, so the role list is inlined, as 0031 does for the same reason.
create policy agri_operations_select on public.agri_operations for select to authenticated
  using ((select app.has_any_role(array['agri_manager', 'finance', 'admin', 'super_admin']::public.app_role[])));
create policy agri_operation_trees_select on public.agri_operation_trees for select to authenticated
  using ((select app.has_any_role(array['agri_manager', 'finance', 'admin', 'super_admin']::public.app_role[])));

-- ---------------------------------------------------------------------------
-- 6 · What a client subscribes to  (v2 §40, §36's Status and Payment)
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  person_id              uuid not null references public.persons (id),
  project_id             uuid not null references public.projects (id),
  -- The period is the agricultural season (app.agri_season), stored so a later edit of the start month never
  -- moves a subscription that is already signed.
  season_label           text not null check (char_length(btrim(season_label)) between 1 and 60),
  season_starts_on       date not null,
  season_ends_on         date not null,
  tree_count             integer not null check (tree_count >= 1),
  -- THE SNAPSHOT. Copied at creation from app.tree_price's resolution of
  -- tree_pricing_rules.annual_fee_per_tree_millimes, and never re-read. See the header: three different
  -- annual fees are already live in interest_requests, and a subscription that recomputed would bill a
  -- client a figure they were never shown.
  fee_per_tree_millimes  bigint not null check (fee_per_tree_millimes >= 0),
  fee_source             text not null check (fee_source in ('project', 'global', 'manual')),
  total_millimes         bigint generated always as (tree_count::bigint * fee_per_tree_millimes) stored,
  -- §36 names Status AND Payment as two attributes. TWO COLUMNS, never one: folding them into
  -- 'active_unpaid' would make either fact answerable only by parsing a label, and a third payment state
  -- would multiply the set — the same error the four-way million counter exists to avoid.
  status                 text not null default 'draft'
                         check (status in ('draft', 'active', 'declined', 'ended', 'cancelled')),
  payment_status         text not null default 'unpaid'
                         check (payment_status in ('unpaid', 'partial', 'paid')),
  note                   text check (note is null or char_length(note) <= 2000),
  created_at             timestamptz not null default now(),
  created_by             uuid references public.profiles (id),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references public.profiles (id),
  constraint subscriptions_season_ordered check (season_ends_on > season_starts_on),
  -- One subscription per client per offer per season. A second one would be two annual fees again.
  unique (person_id, project_id, season_starts_on)
);

create index subscriptions_person_idx on public.subscriptions (person_id, season_starts_on desc);
create index subscriptions_project_idx on public.subscriptions (project_id, season_starts_on desc);
create index subscriptions_unpaid_idx on public.subscriptions (payment_status, season_starts_on desc)
  where status = 'active';

create trigger subscriptions_stamp before update on public.subscriptions
  for each row execute function app.stamp_updated();
create trigger subscriptions_audit after insert or update or delete on public.subscriptions
  for each row execute function app.audit_row_change();

comment on table public.subscriptions is
  'One client''s annual package on one offer, for one agricultural season (cahier v2 §40: «الحريف يدفع Annual fixed package»). The amount is NOT a new annual figure: it is tree_count × a snapshot of tree_pricing_rules.annual_fee_per_tree_millimes taken at creation, which is the very figure the offer page quotes the visitor. Status and Payment are two independent columns (report v3 §36). No dinar RECEIVED is stored here — public.payments (0063) is the only receipt, and it gains a subscription_id in a draft of its own.';
comment on column public.subscriptions.fee_per_tree_millimes is
  'The annual fee per tree AS AGREED WITH THIS CLIENT, frozen. Never recomputed from the current pricing rule: three different annual fees have already been quoted in three days (150,000 · 25,000 · 12,000 millimes, live in interest_requests).';
comment on column public.subscriptions.fee_source is
  'Where the frozen figure came from: the offer''s own pricing rule, the global rule, or a figure a human typed. So the number is always traceable to what the client was shown.';
comment on column public.subscriptions.payment_status is
  'Set by hand by Finance until public.payments carries a subscription_id (one small draft away, 0063 having landed). It says whether anything is owed, never how much has been received: a second money ledger beside public.payments is exactly what that table''s own comment forbids.';

create table public.subscription_lines (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid not null references public.subscriptions (id) on delete cascade,
  service_option_id   uuid not null references public.option_items (id),
  -- Frozen at signature, the way interest_requests freezes a quote: a tariff edited next month must not
  -- rewrite what this client agreed to.
  label_ar            text not null check (char_length(btrim(label_ar)) between 1 and 120),
  in_package          boolean not null default true,
  basis               text not null check (basis in ('per_tree', 'per_season', 'per_operation')),
  amount_millimes     bigint not null default 0 check (amount_millimes >= 0),
  frequency_label     text check (frequency_label is null or char_length(frequency_label) <= 60),
  provider_label      text check (provider_label is null or char_length(provider_label) <= 120),
  -- report v3 §33's «الخدمات المطلوبة» is this, and only this: a line the client asked for that nobody has
  -- priced or scheduled yet. Not a fifth table — one list, filtered.
  status              text not null default 'agreed' check (status in ('requested', 'agreed', 'declined')),
  note                text check (note is null or char_length(note) <= 500),
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id),
  unique (subscription_id, service_option_id),
  -- The same rule as the tariff: what is inside the annual fee has no price of its own.
  constraint subscription_lines_package_is_free check (not in_package or amount_millimes = 0)
);

create index subscription_lines_status_idx on public.subscription_lines (status, created_at desc);

create trigger subscription_lines_stamp before update on public.subscription_lines
  for each row execute function app.stamp_updated();
create trigger subscription_lines_audit after insert or update or delete on public.subscription_lines
  for each row execute function app.audit_row_change();

comment on table public.subscription_lines is
  'What is inside one client''s package, and what they asked for on top of it (v2 §40 «الإدارة تحدد شنو داخل وشنو خارج الباقة»). Every line is a frozen copy of public.project_service_terms at the moment the subscription was created. status = ''requested'' is report v3 §33''s «الخدمات المطلوبة»: asked for, not yet agreed.';

alter table public.subscriptions enable row level security;
alter table public.subscription_lines enable row level security;
revoke all on public.subscriptions, public.subscription_lines from anon, authenticated;
grant select on public.subscriptions, public.subscription_lines to authenticated;

-- A subscription is part of a client's file, so it follows the file's rule: Admin, Finance and Legal read
-- every one, a commercial reads their own. app.can_see_person() already encodes exactly that and gates every
-- other person-scoped table (contact_attempts, interest_requests, person_notes…). The agricultural manager is
-- NOT in it and does not need to be: he runs the grove and never reads who owns it.
create policy subscriptions_select on public.subscriptions for select to authenticated
  using ((select app.can_see_person(person_id)));
create policy subscription_lines_select on public.subscription_lines for select to authenticated
  using (exists (select 1 from public.subscriptions s
                 where s.id = subscription_id and (select app.can_see_person(s.person_id))));

-- ---------------------------------------------------------------------------
-- 7 · Readers · no module gate, every figure decided here
-- ---------------------------------------------------------------------------

-- The one annual fee, resolved the way 0045 resolves it: the offer's rule, then the global one. Written as
-- its own function so the subscription and the screen can never resolve it two different ways.
create or replace function app.offer_annual_fee(p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(
           (select r.annual_fee_per_tree_millimes from public.tree_pricing_rules r
            where r.project_id = p_project and r.annual_fee_per_tree_millimes is not null),
           (select r.annual_fee_per_tree_millimes from public.tree_pricing_rules r where r.project_id is null))
$$;
revoke execute on function app.offer_annual_fee(uuid) from public, anon, authenticated;

comment on function app.offer_annual_fee(uuid) is
  'The annual care fee of one tree in one offer, in millimes, resolved offer-first-then-global exactly as app.tree_price does (0045). The single source of the subscription price: «معاليم الصيانة والتقليم في العام» on the offer page and the annual package are the same figure, quoted once.';

-- The services of one offer, each with its resolved terms, when it was last done, and when it is next due.
-- Everything a screen prints about a service comes from here: no page computes a date or a total.
create or replace function app.offer_services_payload(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pj      public.projects;
  v_today   date := (now() at time zone 'Africa/Tunis')::date;
  v_grace   integer := greatest(0, app.setting_int('agri.overdue_grace_days', 7));
  v_rows    jsonb;
begin
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(x.payload order by x.sort_order, x.label_ar), '[]'::jsonb)
  into v_rows
  from (
    select oi.sort_order,
           oi.label_ar,
           jsonb_build_object(
             'service_option_id', oi.id,
             'code', oi.code,
             'label_ar', oi.label_ar,
             'terms', t.terms,
             'last_done_on', d.last_done_on,
             'operations_done', coalesce(d.done_count, 0),
             'next_due_on', d.next_due_on,
             -- «متأخرة» is a fact of the clock, never a stored state and never a cron's doing. A service
             -- with no frequency (عند الحاجة) has no due date and is never late.
             'is_overdue', d.next_due_on is not null and d.next_due_on + v_grace < v_today,
             'planned_late', coalesce(d.planned_late, 0)
           ) as payload
    from public.option_items oi
    cross join lateral (select app.service_terms(p_project, oi.id) as terms) t
    cross join lateral (
      select max(op.executed_on) filter (where op.status = 'done')                      as last_done_on,
             count(*) filter (where op.status = 'done')::integer                         as done_count,
             count(*) filter (where op.status = 'planned'
                                and op.planned_on is not null
                                and op.planned_on + v_grace < v_today)::integer          as planned_late,
             case when (t.terms->>'frequency_days') is not null
                  then max(op.executed_on) filter (where op.status = 'done')
                       + (t.terms->>'frequency_days')::integer
             end                                                                         as next_due_on
      from public.agri_operations op
      where op.project_id = p_project and op.service_option_id = oi.id
    ) d
    where oi.id = any (v_pj.service_option_ids)
      and oi.list_key = 'agrized_service' and oi.is_active
  ) x;

  return jsonb_build_object(
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'project_name', v_pj.name,
    'declares_services', cardinality(v_pj.service_option_ids),
    'annual_fee_per_tree_millimes', app.offer_annual_fee(p_project),
    'services', v_rows);
end $$;
revoke execute on function app.offer_services_payload(uuid) from public, anon, authenticated;

create or replace function public.staff_offer_services(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app.offer_services_payload(p_project);
end $$;
revoke execute on function public.staff_offer_services(uuid) from public, anon;
grant execute on function public.staff_offer_services(uuid) to authenticated;

comment on function public.staff_offer_services(uuid) is
  'The services one offer advertises, each with its resolved price, frequency and provider, when it was last performed and when it is next due. Agricultural desk only.';

-- The work log. `p_filter`: all · planned · done · late. Costs are masked from a reader who is not Finance or
-- Admin (PRJ-03), and the payload says so with `costs_visible` rather than printing a silent null.
create or replace function public.staff_agri_operations(
  p_project uuid default null, p_filter text default 'all', p_limit integer default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today   date := (now() at time zone 'Africa/Tunis')::date;
  v_grace   integer := greatest(0, app.setting_int('agri.overdue_grace_days', 7));
  v_limit   integer := least(greatest(coalesce(p_limit, app.setting_int('agri.list_limit', 100)), 10), 500);
  v_filter  text := coalesce(nullif(btrim(p_filter), ''), 'all');
  v_money   boolean := app.can_price();
  v_season  jsonb := app.agri_season(null);
  v_rows    jsonb;
  v_planned integer;
  v_done    integer;
  v_late    integer;
  v_cost    bigint;
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_filter not in ('all', 'planned', 'done', 'late') then
    v_filter := 'all';
  end if;

  select count(*) filter (where op.status = 'planned')::integer,
         count(*) filter (where op.status = 'done')::integer,
         count(*) filter (where op.status = 'planned' and op.planned_on is not null
                            and op.planned_on + v_grace < v_today)::integer,
         coalesce(sum(op.cost_millimes) filter (
           where op.status = 'done'
             and op.executed_on >= (v_season->>'starts_on')::date
             and op.executed_on <= (v_season->>'ends_on')::date), 0)
  into v_planned, v_done, v_late, v_cost
  from public.agri_operations op
  where p_project is null or op.project_id = p_project;

  select coalesce(jsonb_agg(r.payload order by r.ord), '[]'::jsonb)
  into v_rows
  from (
    select coalesce(op.executed_on, op.planned_on, op.created_at::date) as ord_date,
           row_number() over (order by coalesce(op.executed_on, op.planned_on, op.created_at::date) desc,
                                       op.created_at desc) as ord,
           jsonb_build_object(
             'id', op.id,
             'project_id', op.project_id,
             'project_code', pj.code,
             'project_name', pj.name,
             'service_option_id', op.service_option_id,
             'label_ar', op.label_ar,
             'status', op.status,
             'status_label', app.option_label('operation_status', op.status),
             'scope', op.scope,
             'trees_touched', (select count(*)::integer from public.agri_operation_trees ot
                               where ot.operation_id = op.id),
             'provider_label', (select oi.label_ar from public.option_items oi where oi.id = op.provider_option_id),
             'provider_note', op.provider_note,
             'planned_on', op.planned_on,
             'executed_on', op.executed_on,
             'is_late', op.status = 'planned' and op.planned_on is not null and op.planned_on + v_grace < v_today,
             'cost_millimes', case when v_money then op.cost_millimes end,
             'note', op.note,
             'approved_by_name', (select p.full_name from public.profiles p where p.id = op.approved_by),
             'approved_at', op.approved_at,
             'created_at', op.created_at
           ) as payload
    from public.agri_operations op
    join public.projects pj on pj.id = op.project_id
    where (p_project is null or op.project_id = p_project)
      and (v_filter = 'all'
           or (v_filter = 'planned' and op.status = 'planned')
           or (v_filter = 'done' and op.status = 'done')
           or (v_filter = 'late' and op.status = 'planned' and op.planned_on is not null
               and op.planned_on + v_grace < v_today))
    order by ord_date desc, op.created_at desc
    limit v_limit
  ) r;

  return jsonb_build_object(
    'module_state', app.flag_state('agri_backoffice'),
    'filter', v_filter,
    'season', v_season,
    'costs_visible', v_money,
    'counts', jsonb_build_object('planned', v_planned, 'done', v_done, 'late', v_late),
    'season_cost_millimes', case when v_money then v_cost end,
    'rows', v_rows);
end $$;
revoke execute on function public.staff_agri_operations(uuid, text, integer) from public, anon;
grant execute on function public.staff_agri_operations(uuid, text, integer) to authenticated;

comment on function public.staff_agri_operations(uuid, text, integer) is
  'The grove work log, most recent first, with the three counts above it and what the season has cost. Being late is computed from planned_on and the setting agri.overdue_grace_days, never stored. Costs are null for a reader who is not Finance or Admin, and costs_visible says which reader this is.';

-- Who pays for what this season, and who has not paid. `p_filter`: all · active · unpaid · requested · draft.
create or replace function public.staff_subscriptions(
  p_filter text default 'all', p_project uuid default null, p_limit integer default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit     integer := least(greatest(coalesce(p_limit, app.setting_int('agri.list_limit', 100)), 10), 500);
  v_filter    text := coalesce(nullif(btrim(p_filter), ''), 'all');
  v_season    jsonb := app.agri_season(null);
  v_rows      jsonb;
  v_active    integer;
  v_unpaid    integer;
  v_requested integer;
  v_due       bigint;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_filter not in ('all', 'active', 'unpaid', 'requested', 'draft') then
    v_filter := 'all';
  end if;

  -- Counted over the files this reader may see, so a commercial's tiles and their list can never disagree.
  select count(*) filter (where s.status = 'active')::integer,
         count(*) filter (where s.status = 'active' and s.payment_status <> 'paid')::integer,
         coalesce(sum(s.total_millimes) filter (where s.status = 'active' and s.payment_status <> 'paid'), 0)
  into v_active, v_unpaid, v_due
  from public.subscriptions s
  where app.can_see_person(s.person_id)
    and (p_project is null or s.project_id = p_project);

  select count(*)::integer into v_requested
  from public.subscription_lines l
  join public.subscriptions s on s.id = l.subscription_id
  where l.status = 'requested' and app.can_see_person(s.person_id)
    and (p_project is null or s.project_id = p_project);

  select coalesce(jsonb_agg(r.payload order by r.ord), '[]'::jsonb)
  into v_rows
  from (
    select row_number() over (order by s.season_starts_on desc, s.created_at desc) as ord,
           jsonb_build_object(
             'id', s.id,
             'person_id', s.person_id,
             'person_name', ps.full_name,
             'person_phone', ps.phone_e164,
             'project_id', s.project_id,
             'project_code', pj.code,
             'project_name', pj.name,
             'season_label', s.season_label,
             'season_starts_on', s.season_starts_on,
             'season_ends_on', s.season_ends_on,
             'tree_count', s.tree_count,
             'fee_per_tree_millimes', s.fee_per_tree_millimes,
             'fee_source', s.fee_source,
             'total_millimes', s.total_millimes,
             'status', s.status,
             'status_label', app.option_label('subscription_status', s.status),
             'payment_status', s.payment_status,
             'payment_label', app.option_label('subscription_payment', s.payment_status),
             'note', s.note,
             'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'id', l.id,
                                 'service_option_id', l.service_option_id,
                                 'label_ar', l.label_ar,
                                 'in_package', l.in_package,
                                 'basis', l.basis,
                                 'amount_millimes', l.amount_millimes,
                                 'frequency_label', l.frequency_label,
                                 'provider_label', l.provider_label,
                                 'status', l.status)
                                 order by l.in_package desc, l.label_ar), '[]'::jsonb)
                       from public.subscription_lines l where l.subscription_id = s.id),
             'created_at', s.created_at
           ) as payload
    from public.subscriptions s
    join public.persons ps on ps.id = s.person_id
    join public.projects pj on pj.id = s.project_id
    where app.can_see_person(s.person_id)
      and (p_project is null or s.project_id = p_project)
      and (v_filter = 'all'
           or (v_filter = 'active' and s.status = 'active')
           or (v_filter = 'draft' and s.status = 'draft')
           or (v_filter = 'unpaid' and s.status = 'active' and s.payment_status <> 'paid')
           or (v_filter = 'requested' and exists (select 1 from public.subscription_lines l
                                                  where l.subscription_id = s.id and l.status = 'requested')))
    order by s.season_starts_on desc, s.created_at desc
    limit v_limit
  ) r;

  return jsonb_build_object(
    'module_state', app.flag_state('subscriptions'),
    'filter', v_filter,
    'season', v_season,
    'counts', jsonb_build_object('active', v_active, 'unpaid', v_unpaid, 'requested', v_requested),
    'due_millimes', v_due,
    'rows', v_rows);
end $$;
revoke execute on function public.staff_subscriptions(text, uuid, integer) from public, anon;
grant execute on function public.staff_subscriptions(text, uuid, integer) to authenticated;

comment on function public.staff_subscriptions(text, uuid, integer) is
  'Who pays for what this season and who has not paid, limited to the client files the reader may see (app.can_see_person) — so the counts above the list and the list itself can never disagree. Every amount is tree_count × the frozen fee; nothing is recomputed from today''s pricing rule.';

-- What a subscription WOULD cost this person on this offer, before anyone writes one: the trees they hold,
-- the annual fee that would be frozen, and the package that would be copied. The screen shows this and the
-- writer below recomputes it, so the form can never promise a figure the write would not honour.
create or replace function public.staff_subscription_preview(p_project uuid, p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_trees  integer;
  v_fee    bigint;
  v_source text;
  v_season jsonb := app.agri_season(null);
begin
  if not app.is_staff() or not app.can_see_person(p_person) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::integer into v_trees
  from public.trees t
  where t.project_id = p_project and t.held_by = p_person and t.state = 'sold';

  select case when r.annual_fee_per_tree_millimes is not null then 'project' else 'global' end
  into v_source
  from public.tree_pricing_rules r where r.project_id = p_project;
  v_source := coalesce(v_source, 'global');
  v_fee := app.offer_annual_fee(p_project);

  return jsonb_build_object(
    'project_id', p_project,
    'person_id', p_person,
    'season', v_season,
    'trees_sold', v_trees,
    'fee_per_tree_millimes', v_fee,
    'fee_source', v_source,
    'total_millimes', case when v_fee is null then null else v_trees::bigint * v_fee end,
    'package', (select coalesce(jsonb_agg(jsonb_build_object(
                          'service_option_id', t.service_option_id,
                          'label_ar', t.label_ar,
                          'in_package', t.in_annual_package,
                          'amount_millimes', t.amount_millimes)
                          order by t.in_annual_package desc, t.sort_order, t.label_ar), '[]'::jsonb)
                from public.project_service_terms t
                where t.is_active and t.project_id = p_project));
end $$;
revoke execute on function public.staff_subscription_preview(uuid, uuid) from public, anon;
grant execute on function public.staff_subscription_preview(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8 · Writers · module-gated, role-gated, reasoned and audited, every one
-- ---------------------------------------------------------------------------

-- The tariff of one service in one offer, or the global default (p->>'project_id' absent or null).
-- Finance and Admin: report v3 §53 puts every price with them, and app.can_price() is the predicate 0031
-- already uses for exactly that.
create or replace function public.staff_save_offer_service(p jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id       uuid    := nullif(p->>'id', '')::uuid;
  v_project  uuid    := nullif(p->>'project_id', '')::uuid;
  v_service  uuid    := nullif(p->>'service_option_id', '')::uuid;
  v_basis    text    := btrim(coalesce(p->>'basis', 'per_tree'));
  v_amount   bigint  := coalesce(nullif(p->>'amount_millimes', '')::bigint, 0);
  v_in_pkg   boolean := coalesce((p->>'in_annual_package')::boolean, false);
  v_freq     uuid    := nullif(p->>'frequency_option_id', '')::uuid;
  v_provider uuid    := nullif(p->>'provider_option_id', '')::uuid;
  v_label    text;
  v_old      jsonb;
  v_row      public.project_service_terms;
begin
  perform app.assert_agri_open();
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  select oi.label_ar into v_label
  from public.option_items oi
  where oi.id = v_service and oi.list_key = 'agrized_service' and oi.is_active;
  if not found then
    raise exception 'invalid_service' using errcode = 'P0001';
  end if;

  -- An offer may not charge for a service it never advertised. The global default (no project) is exempt:
  -- it is the catalogue's own price list, not a promise on any one offer.
  if v_project is not null then
    if not exists (select 1 from public.projects pj
                   where pj.id = v_project and v_service = any (pj.service_option_ids)) then
      raise exception 'service_not_in_offer' using errcode = 'P0001';
    end if;
  end if;

  if v_basis not in ('per_tree', 'per_season', 'per_operation') then
    raise exception 'invalid_service_basis' using errcode = 'P0001';
  end if;
  if v_amount < 0 then
    raise exception 'invalid_service_amount' using errcode = 'P0001';
  end if;
  -- The header's rule (b), refused by name rather than by a constraint violation, so the screen can say why.
  if v_in_pkg and v_amount <> 0 then
    raise exception 'package_service_has_price' using errcode = 'P0001';
  end if;
  if v_freq is not null and not exists (select 1 from public.option_items oi
                                        where oi.id = v_freq and oi.list_key = 'service_frequency') then
    raise exception 'invalid_frequency' using errcode = 'P0001';
  end if;
  if v_provider is not null and not exists (select 1 from public.option_items oi
                                            where oi.id = v_provider and oi.list_key = 'service_provider') then
    raise exception 'invalid_provider' using errcode = 'P0001';
  end if;

  if v_id is not null then
    select to_jsonb(t) into v_old from public.project_service_terms t where t.id = v_id;
    if v_old is null then
      raise exception 'service_terms_not_found' using errcode = 'P0001';
    end if;
  end if;

  insert into public.project_service_terms
    (id, project_id, service_option_id, label_ar, basis, amount_millimes, frequency_option_id,
     provider_option_id, provider_note, in_annual_package, note, is_active, sort_order, updated_by)
  values
    (coalesce(v_id, gen_random_uuid()), v_project, v_service, v_label, v_basis, v_amount, v_freq,
     v_provider, nullif(btrim(coalesce(p->>'provider_note', '')), ''), v_in_pkg,
     nullif(btrim(coalesce(p->>'note', '')), ''),
     coalesce((p->>'is_active')::boolean, true),
     coalesce(nullif(p->>'sort_order', '')::integer, 0), auth.uid())
  on conflict (id) do update set
    project_id = excluded.project_id, service_option_id = excluded.service_option_id,
    label_ar = excluded.label_ar, basis = excluded.basis, amount_millimes = excluded.amount_millimes,
    frequency_option_id = excluded.frequency_option_id, provider_option_id = excluded.provider_option_id,
    provider_note = excluded.provider_note, in_annual_package = excluded.in_annual_package,
    note = excluded.note, is_active = excluded.is_active, sort_order = excluded.sort_order,
    updated_by = auth.uid()
  returning * into v_row;

  perform app.write_audit('offer_service.save', 'project_service_terms', v_row.id::text,
                          v_old, to_jsonb(v_row), null);
  return to_jsonb(v_row);
exception when unique_violation then
  raise exception 'service_terms_exists' using errcode = 'P0001';
end $$;
revoke execute on function public.staff_save_offer_service(jsonb, text) from public, anon;
grant execute on function public.staff_save_offer_service(jsonb, text) to authenticated;

comment on function public.staff_save_offer_service(jsonb, text) is
  'Writes the price, frequency and provider of one service in one offer (report v3 §36), or the global default when project_id is absent. Refuses a service the offer does not advertise (service_not_in_offer) and a package service carrying a price (package_service_has_price). Finance and Admin, with a reason.';

create or replace function public.staff_delete_offer_service(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
begin
  perform app.assert_agri_open();
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  select to_jsonb(t) into v_old from public.project_service_terms t where t.id = p_id;
  if v_old is null then
    raise exception 'service_terms_not_found' using errcode = 'P0001';
  end if;

  delete from public.project_service_terms where id = p_id;
  perform app.write_audit('offer_service.delete', 'project_service_terms', p_id::text, v_old, null, null);
end $$;
revoke execute on function public.staff_delete_offer_service(uuid, text) from public, anon;
grant execute on function public.staff_delete_offer_service(uuid, text) to authenticated;

-- One agricultural act. v2 §41, and nothing beyond it.
create or replace function public.staff_save_agri_operation(p jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id        uuid   := nullif(p->>'id', '')::uuid;
  v_project   uuid   := nullif(p->>'project_id', '')::uuid;
  v_service   uuid   := nullif(p->>'service_option_id', '')::uuid;
  v_status    text   := btrim(coalesce(p->>'status', 'planned'));
  v_planned   date   := nullif(p->>'planned_on', '')::date;
  v_executed  date   := nullif(p->>'executed_on', '')::date;
  v_cost      bigint := nullif(p->>'cost_millimes', '')::bigint;
  v_provider  uuid   := nullif(p->>'provider_option_id', '')::uuid;
  v_trees     uuid[] := case when p ? 'tree_ids'
                             then array(select jsonb_array_elements_text(p->'tree_ids')::uuid) end;
  v_scope     text;
  v_label     text;
  v_old       jsonb;
  v_row       public.agri_operations;
  v_bad       integer;
begin
  perform app.assert_agri_open();
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if not exists (select 1 from public.projects pj where pj.id = v_project) then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;

  select oi.label_ar into v_label
  from public.option_items oi
  where oi.id = v_service and oi.list_key = 'agrized_service' and oi.is_active;
  if not found then
    raise exception 'invalid_service' using errcode = 'P0001';
  end if;

  if v_status not in ('planned', 'done', 'cancelled') then
    raise exception 'invalid_operation_status' using errcode = 'P0001';
  end if;
  -- «منجزة» without a date would be a claim with no day attached, and every «what is overdue» figure below
  -- reads executed_on. Refused by name so the screen can say which field is missing.
  if v_status = 'done' and v_executed is null then
    raise exception 'operation_date_required' using errcode = 'P0001';
  end if;
  if v_cost is not null and v_cost < 0 then
    raise exception 'invalid_operation_cost' using errcode = 'P0001';
  end if;
  if v_provider is not null and not exists (select 1 from public.option_items oi
                                            where oi.id = v_provider and oi.list_key = 'service_provider') then
    raise exception 'invalid_provider' using errcode = 'P0001';
  end if;

  -- Named trees must belong to the offer the operation names, or the log would say a tree of another grove
  -- was pruned here.
  if v_trees is not null and cardinality(v_trees) > 0 then
    select count(*)::integer into v_bad
    from unnest(v_trees) as u(tree_id)
    where not exists (select 1 from public.trees t where t.id = u.tree_id and t.project_id = v_project);
    if v_bad > 0 then
      raise exception 'invalid_tree_selection' using errcode = 'P0001';
    end if;
    v_scope := 'trees';
  else
    v_scope := 'offer';
  end if;

  if v_id is not null then
    select to_jsonb(op) into v_old from public.agri_operations op where op.id = v_id;
    if v_old is null then
      raise exception 'operation_not_found' using errcode = 'P0001';
    end if;
  end if;

  insert into public.agri_operations
    (id, project_id, service_option_id, label_ar, scope, status, provider_option_id, provider_note,
     planned_on, executed_on, cost_millimes, note, created_by, updated_by)
  values
    (coalesce(v_id, gen_random_uuid()), v_project, v_service, v_label, v_scope, v_status, v_provider,
     nullif(btrim(coalesce(p->>'provider_note', '')), ''), v_planned, v_executed, v_cost,
     nullif(btrim(coalesce(p->>'note', '')), ''), auth.uid(), auth.uid())
  on conflict (id) do update set
    project_id = excluded.project_id, service_option_id = excluded.service_option_id,
    label_ar = excluded.label_ar, scope = excluded.scope, status = excluded.status,
    provider_option_id = excluded.provider_option_id, provider_note = excluded.provider_note,
    planned_on = excluded.planned_on, executed_on = excluded.executed_on,
    cost_millimes = excluded.cost_millimes, note = excluded.note, updated_by = auth.uid()
  returning * into v_row;

  -- The subset is rewritten wholesale: an edit that drops a tree must drop it here too.
  delete from public.agri_operation_trees where operation_id = v_row.id;
  if v_scope = 'trees' then
    insert into public.agri_operation_trees (operation_id, tree_id)
    select v_row.id, u.tree_id from unnest(v_trees) as u(tree_id)
    on conflict do nothing;
  end if;

  perform app.write_audit('agri_operation.save', 'agri_operations', v_row.id::text, v_old, to_jsonb(v_row), null);
  return to_jsonb(v_row);
end $$;
revoke execute on function public.staff_save_agri_operation(jsonb, text) from public, anon;
grant execute on function public.staff_save_agri_operation(jsonb, text) to authenticated;

comment on function public.staff_save_agri_operation(jsonb, text) is
  'Records or edits one agricultural act (cahier v2 §41): type, offer, provider, planned and executed dates, cost, note. tree_ids names a subset of the offer''s trees and sets scope to «trees»; leaving it out means the whole grove. Agricultural desk, with a reason.';

-- v2 §41's «Approved by», as its own act: approving is not editing, and a screen must not be able to approve
-- by accident while changing a date.
create or replace function public.staff_approve_agri_operation(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_row public.agri_operations;
begin
  perform app.assert_agri_open();
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  select to_jsonb(op) into v_old from public.agri_operations op where op.id = p_id;
  if v_old is null then
    raise exception 'operation_not_found' using errcode = 'P0001';
  end if;

  update public.agri_operations
  set approved_by = auth.uid(), approved_at = now(), updated_by = auth.uid()
  where id = p_id
  returning * into v_row;

  perform app.write_audit('agri_operation.approve', 'agri_operations', p_id::text, v_old, to_jsonb(v_row), null);
  return to_jsonb(v_row);
end $$;
revoke execute on function public.staff_approve_agri_operation(uuid, text) from public, anon;
grant execute on function public.staff_approve_agri_operation(uuid, text) to authenticated;

-- The annual package of one client on one offer, for one season. Everything about the money is computed
-- HERE, from the offer's own resolution, and frozen.
create or replace function public.staff_create_subscription(p jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid    := nullif(p->>'project_id', '')::uuid;
  v_person  uuid    := nullif(p->>'person_id', '')::uuid;
  v_trees   integer := nullif(p->>'tree_count', '')::integer;
  v_season  jsonb   := app.agri_season(nullif(p->>'season_on', '')::date);
  v_fee     bigint;
  v_source  text;
  v_id      uuid;
  v_row     public.subscriptions;
  v_lines   integer := 0;
begin
  perform app.assert_subscriptions_open();
  -- Money is Finance's and Admin's (report v3 §53), and a subscription is part of a client's file, so the
  -- reader rule applies on top of it: nobody writes into a file they may not see.
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.can_see_person(v_person) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if not exists (select 1 from public.projects pj where pj.id = v_project) then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.persons ps where ps.id = v_person and ps.archived_at is null) then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;

  -- The trees this person actually owns in this offer, unless Finance states a number itself (a client who
  -- signed on paper before the rows were marked sold).
  if v_trees is null then
    select count(*)::integer into v_trees
    from public.trees t
    where t.project_id = v_project and t.held_by = v_person and t.state = 'sold';
  end if;
  if v_trees is null or v_trees < 1 then
    raise exception 'no_trees_held' using errcode = 'P0001';
  end if;

  -- THE SNAPSHOT (header, rule a). Read once, stored, never read again.
  select case when r.annual_fee_per_tree_millimes is not null then 'project' end into v_source
  from public.tree_pricing_rules r where r.project_id = v_project;
  v_source := coalesce(v_source, 'global');
  v_fee := app.offer_annual_fee(v_project);
  if (p ? 'fee_per_tree_millimes') and nullif(p->>'fee_per_tree_millimes', '') is not null then
    v_fee := (p->>'fee_per_tree_millimes')::bigint;
    v_source := 'manual';
  end if;
  if v_fee is null then
    raise exception 'annual_fee_not_set' using errcode = 'P0001';
  end if;

  -- An offer with nothing in its package cannot produce one, and the package is read through the SAME
  -- resolver the screen uses (offer row, then global row) so the two can never list different services.
  -- OFF-AIRPORT is in exactly this state today: it advertises no service at all and still quotes an annual
  -- fee to visitors.
  if not exists (
       select 1
       from public.projects pj
       cross join lateral unnest(pj.service_option_ids) as u(service_id)
       cross join lateral (select app.service_terms(pj.id, u.service_id) as terms) t
       where pj.id = v_project
         and (t.terms->>'ok')::boolean
         and (t.terms->>'in_annual_package')::boolean) then
    raise exception 'offer_has_no_package' using errcode = 'P0001';
  end if;

  insert into public.subscriptions
    (person_id, project_id, season_label, season_starts_on, season_ends_on, tree_count,
     fee_per_tree_millimes, fee_source, status, payment_status, note, created_by, updated_by)
  values
    (v_person, v_project, v_season->>'label', (v_season->>'starts_on')::date, (v_season->>'ends_on')::date,
     v_trees, v_fee, v_source, 'draft', 'unpaid',
     nullif(btrim(coalesce(p->>'note', '')), ''), auth.uid(), auth.uid())
  returning * into v_row;
  v_id := v_row.id;

  -- The package, frozen. A tariff edited next month must not rewrite what this client agreed to — the same
  -- discipline interest_requests already applies to a quote.
  --
  -- ONLY WHAT IS INSIDE THE PACKAGE becomes a line here. An extra (الجني، النقل، العصر…) is not something a
  -- client owes because their offer happens to sell it: it becomes a line the day they ask for it, through
  -- staff_request_subscription_service, with status «requested» — which is also report v3 §33's
  -- «الخدمات المطلوبة». One list, filtered, not two.
  insert into public.subscription_lines
    (subscription_id, service_option_id, label_ar, in_package, basis, amount_millimes,
     frequency_label, provider_label, status, created_by, updated_by)
  select v_id,
         (t.terms->>'service_option_id')::uuid,
         t.terms->>'label_ar',
         true,
         t.terms->>'basis',
         0,
         t.terms->>'frequency_label',
         t.terms->>'provider_label',
         'agreed',
         auth.uid(), auth.uid()
  from public.projects pj
  cross join lateral unnest(pj.service_option_ids) as u(service_id)
  cross join lateral (select app.service_terms(pj.id, u.service_id) as terms) t
  where pj.id = v_project
    and (t.terms->>'ok')::boolean
    and (t.terms->>'in_annual_package')::boolean
  on conflict (subscription_id, service_option_id) do nothing;
  get diagnostics v_lines = row_count;

  perform app.write_audit('subscription.create', 'subscriptions', v_id::text, null,
                          to_jsonb(v_row) || jsonb_build_object('lines', v_lines), null);
  return to_jsonb(v_row) || jsonb_build_object('lines', v_lines);
exception when unique_violation then
  raise exception 'subscription_exists' using errcode = 'P0001';
end $$;
revoke execute on function public.staff_create_subscription(jsonb, text) from public, anon;
grant execute on function public.staff_create_subscription(jsonb, text) to authenticated;

comment on function public.staff_create_subscription(jsonb, text) is
  'Creates one client''s annual package on one offer for one season. tree_count defaults to the trees they actually own (state «sold»); the fee is the offer''s own annual fee, FROZEN with its source; the lines are a frozen copy of the services INSIDE the package (an extra becomes a line only when the client asks for it). Refuses an offer with nothing in its package (offer_has_no_package) and a client who owns no tree (no_trees_held). Finance and Admin, inside a file they may see.';

-- §36's Status and Payment, moved separately because they are two independent facts.
create or replace function public.staff_set_subscription_status(
  p_id uuid, p_status text, p_payment text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old  jsonb;
  v_row  public.subscriptions;
  v_s    text := nullif(btrim(coalesce(p_status, '')), '');
  v_p    text := nullif(btrim(coalesce(p_payment, '')), '');
  v_pers uuid;
begin
  perform app.assert_subscriptions_open();
  perform app.set_reason(p_reason);

  select s.person_id, to_jsonb(s) into v_pers, v_old from public.subscriptions s where s.id = p_id;
  if v_old is null then
    raise exception 'subscription_not_found' using errcode = 'P0001';
  end if;
  if not app.can_price() or not app.can_see_person(v_pers) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_s is not null and v_s not in ('draft', 'active', 'declined', 'ended', 'cancelled') then
    raise exception 'invalid_subscription_status' using errcode = 'P0001';
  end if;
  if v_p is not null and v_p not in ('unpaid', 'partial', 'paid') then
    raise exception 'invalid_payment_status' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set status = coalesce(v_s, status), payment_status = coalesce(v_p, payment_status), updated_by = auth.uid()
  where id = p_id
  returning * into v_row;

  perform app.write_audit('subscription.status', 'subscriptions', p_id::text, v_old, to_jsonb(v_row), null);
  return to_jsonb(v_row);
end $$;
revoke execute on function public.staff_set_subscription_status(uuid, text, text, text) from public, anon;
grant execute on function public.staff_set_subscription_status(uuid, text, text, text) to authenticated;

-- «الخدمات المطلوبة» (report v3 §33): a service this client has asked for on top of their package, which
-- nobody has priced or scheduled yet. A line, not a fifth table.
create or replace function public.staff_request_subscription_service(
  p_subscription uuid, p_service uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub   public.subscriptions;
  v_terms jsonb;
  v_label text;
  v_row   public.subscription_lines;
begin
  perform app.assert_subscriptions_open();
  perform app.set_reason(p_reason);

  select * into v_sub from public.subscriptions s where s.id = p_subscription;
  if not found then
    raise exception 'subscription_not_found' using errcode = 'P0001';
  end if;
  if not app.is_staff() or not app.can_see_person(v_sub.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select oi.label_ar into v_label
  from public.option_items oi
  where oi.id = p_service and oi.list_key = 'agrized_service' and oi.is_active;
  if not found then
    raise exception 'invalid_service' using errcode = 'P0001';
  end if;

  v_terms := app.service_terms(v_sub.project_id, p_service);

  insert into public.subscription_lines
    (subscription_id, service_option_id, label_ar, in_package, basis, amount_millimes,
     frequency_label, provider_label, status, created_by, updated_by)
  values
    (p_subscription, p_service, v_label, false,
     coalesce(v_terms->>'basis', 'per_operation'),
     case when (v_terms->>'ok')::boolean and not (v_terms->>'in_annual_package')::boolean
          then coalesce((v_terms->>'amount_millimes')::bigint, 0) else 0 end,
     v_terms->>'frequency_label', v_terms->>'provider_label', 'requested', auth.uid(), auth.uid())
  on conflict (subscription_id, service_option_id) do update set
    status = 'requested', updated_by = auth.uid()
  returning * into v_row;

  perform app.write_audit('subscription_line.request', 'subscription_lines', v_row.id::text,
                          null, to_jsonb(v_row), null);
  return to_jsonb(v_row);
end $$;
revoke execute on function public.staff_request_subscription_service(uuid, uuid, text) from public, anon;
grant execute on function public.staff_request_subscription_service(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9 · What each module DOES, in the owner's own screen
-- ---------------------------------------------------------------------------
-- /admin/settings/modules prints feature_flags.description_ar under each switch, and today both of these read
-- «البند 18.» / «البند 20.» — a spec reference, not a description. THE STATE IS NOT TOUCHED: both stay
-- 'disabled' and the owner presses the switch himself.

update public.feature_flags set description_ar =
  'سجلّ العمليات الفلاحية: شنوّة تعمل في الغراسة، وقتاش، شكون عملها وبشحال. كل خدمة في العرض عندها ثمنها ودوريتها ومنفّذها، والشاشة تقولك شنوّة تأخّر على موعدو. يقراه ويكتب فيه المسؤول الفلاحي والمالية والإدارة، والكلفة ما تبانش كان للمالية والإدارة.'
where key = 'agri_backoffice';

update public.feature_flags set description_ar =
  'الاشتراك السنوي: الباقة اللي يخلّص فيها الحريف كل موسم على زيتوناتو. مبلغها هو نفسو معاليم الصيانة والتقليم اللي تتعرض في صفحة العرض — ما فماش مبلغ ثاني — ويتجمّد كيما تفاهمنا عليه نهار الإمضاء. الإدارة تحدّد شنوّة داخل الباقة وشنوّة خارجها.'
where key = 'subscriptions';
