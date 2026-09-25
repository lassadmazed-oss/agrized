-- bb · الشركاء وموعد العقد والقائمة القانونية — INTERFACE 3, «القانوني وإتمام البيع» (owner brief 2026-09-21,
-- §16 → §21). The desk that receives a file the moment the عربون is paid, picks the lawyer or the notary,
-- books the closing, ticks the papers off, and refuses to let the sale close while a mandatory paper is
-- missing.
--
-- ███ DRAFT — NOT APPLIED, NOT NUMBERED. It needs the contracts engine, which the owner APPLIED DURING THIS
-- ███ RUN, on 2026-09-21, as supabase/migrations/0072_contracts_installments.sql — that file was
-- ███ supabase/pending/bb_60_contracts_installments.sql, and it is still called «bb_60» throughout the
-- ███ comments below because that is the name its own header and its test file use. public.contracts and
-- ███ public.contract_installments are live (0 rows), and both feature flags are still 'disabled'. §0 below
-- ███ refuses to run if that ever stops being true, in one sentence, instead of failing halfway through with
-- ███ a raw «relation does not exist». THE «72» IN THIS FILE'S NAME IS ITS DRAFT NUMBER IN supabase/pending,
-- ███ not a migration number, and the collision with 0072 is a coincidence of the same afternoon: when this
-- ███ file is applied it becomes 0073 or later.
-- ███ Dry-run (it always rolls back):
-- ███   node --env-file=.env scripts/db-dry-run.mjs \
-- ███     supabase/pending/bb_72_partners_closing.sql supabase/tests/047_partners_closing.sql
-- ███ When the owner applies it, rename it supabase/migrations/00NN_partners_closing.sql, write the number
-- ███ into the first line of this file and of supabase/tests/047_partners_closing.sql, then run
-- ███ `npm run db:types`.
-- ███ IT DOES NOT EDIT 0072. Not one function of that migration is replaced, dropped or rewritten here.
-- ███ Everything below composes with it from the outside — which is the whole reason the gate is a trigger
-- ███ and not a new copy of staff_sign_contract.
--
-- ===========================================================================
-- WHAT ALREADY EXISTS, SO THAT NONE OF IT IS REBUILT HERE
-- ===========================================================================
-- §16's queue is ALREADY A QUERY: public.staff_reservations(p_filter => 'paid') returns exactly «the files
--   that reached العربون مدفوع». 0063 wrote it. What was missing was not the question but the DESK — a
--   destination, a role gate, and somewhere for the legal work itself to be recorded. §11 below adds the
--   reader that desk uses; the reservation engine is untouched.
-- §17's facts ALL EXIST and none of them is copied onto a new row here: the reservation and its عربون
--   (0063), the trees by number (0054), the phone agent (persons.assigned_to), the field commercial
--   (visits.assigned_to, 0064), who took the money (payments.recorded_by) and the payment plan the client
--   agreed to on the site (interest_requests, 0061). app.legal_file_payload JOINS them; it stores nothing.
--   That is §26 — «ENTER ONCE, REUSE EVERYWHERE» — read from this side.
-- §21's «then everything happens automatically» IS bb_60: public.staff_create_contract writes the contract,
--   flips its reservation to 'converted' and moves that reservation's trees reserved → sold, in ONE
--   transaction. Nothing here duplicates a line of it, and nothing here sells a tree.
--
-- ===========================================================================
-- THE FOUR DECISIONS, TAKEN HERE, SO THE NEXT READER DOES NOT RE-OPEN THEM
-- ===========================================================================
--
--  1. THE LEGAL FILE HANGS ON THE RESERVATION, NOT ON THE CONTRACT. §16 hands the file over when the عربون
--     is paid; §21 is where the contract is written. Between those two moments — which is most of Legal's
--     work: choosing the notary, booking the closing, collecting the identity papers — NO CONTRACT EXISTS.
--     A checklist anchored on public.contracts could not be ticked until the thing it is supposed to guard
--     had already happened. bb_60 makes contracts.reservation_id NOT NULL and UNIQUE — «one contract per
--     reservation» (v2 §49) — so the reservation is the stable spine and the contract hangs off it.
--
--  2. THE GATE IS A TRIGGER, NOT A SECOND COPY OF bb_60'S FUNCTIONS. §20 says the file «cannot close» before
--     the mandatory items are complete, and the run's own constraint says that is a database rule rather than
--     a disabled button. The obvious way to get there — `create or replace function
--     public.staff_sign_contract(...)` with bb_60's body plus one check — would fork a 70-line function the
--     owner has not applied yet, and the day he edits his copy the fork silently wins. A BEFORE trigger on
--     public.contracts composes instead: it holds for staff_create_contract, staff_sign_contract,
--     staff_set_contract_owned, for any RPC written later, and for a hand-typed UPDATE in psql. bb_60 stays
--     exactly as its author left it.
--
--  3. THREE GATES, NOT ONE, AND THE OWNER DECIDES WHICH ITEM SITS ON WHICH. §20's own list contains «العقد»
--     and «الإمضاءات», which cannot possibly be ticked before the contract is written — so a single gate at
--     «close the sale» is circular. Each item therefore names the moment it blocks:
--       'contract'   before the contract is written — and since bb_60 sells the trees in that same
--                    transaction, this is the gate that really guards the INVENTORY (identity, proof of the
--                    عربون, the tree numbers).
--       'signature'  before status becomes 'signed' (the plan, the areas, the contract document).
--       'ownership'  before contracts.owned_at is set — v2 §38's «تم إتمام البيع» in its fullest sense, and
--                    the date «زيتونتي» opens on (the signatures, the registry copy).
--     Which item sits on which gate is a column on a row the owner edits, not a decision in this file.
--
--  4. THE LIST IS SNAPSHOT ONTO THE FILE WHEN IT OPENS. public.legal_checklist_items is the TEMPLATE the
--     owner edits; public.legal_file_checks is the copy one file was opened with, label and all — the same
--     snapshot idiom as visits.slot_label_ar, payments.method_label_ar and contracts.kind_label_ar. The gate
--     reads ONLY the snapshot, never the template. That is the direct answer to «adding an item later must
--     not retroactively break a closed file»: a new template row reaches nothing that already exists, and
--     public.staff_legal_sync_items — the deliberate act that pulls new items onto an OPEN file — refuses to
--     add an item for a gate that has already been passed. A contract signed in March cannot be made
--     retroactively unsigned by a checklist item added in June.
--
-- ===========================================================================
-- ███ WHERE THIS DRAFT AND bb_60 MUST AGREE — READ THIS BEFORE APPLYING EITHER
-- ===========================================================================
-- The owner applies the two files in order, so a disagreement between them is his to hit. There are four,
-- and all four are named rather than silently absorbed:
--
--  A. ███ «تم إتمام البيع» HAPPENS EARLIER IN bb_60 THAN IT DOES IN THE BRIEF. §21 reads as a final
--     confirmation after the paperwork; §22 then turns every tree Sold. In bb_60 the trees go Available →
--     Reserved at staff_create_reservation (0063) and Reserved → SOLD inside public.staff_create_contract —
--     that is, when the DRAFT contract is written, BEFORE anybody signs anything. So by the time
--     staff_sign_contract runs, the inventory has already moved. That ordering is bb_60's and it is
--     defensible (a contract whose trees were never sold must not be able to exist), but it means a checklist
--     that only guarded the signature would be guarding a door the stock had already walked through. It is
--     the entire reason gate 'contract' exists above. If the owner would rather the trees moved at the
--     SIGNATURE, that is a change to bb_60, not to this file, and he should make it before applying either.
--
--  B. ███ bb_60 CAN SIGN A CONTRACT WITH NO PAPER VERIFIED, AND THIS FILE CHANGES THAT ONLY WHEN A LEGAL
--     FILE EXISTS. The gate deliberately does nothing when no legal file has been opened for a reservation —
--     otherwise applying this migration would, in one silent step, make every future contract unsignable
--     until somebody discovered a screen they had never seen. Setting `legal.require_open_file_at` is the
--     switch that turns that permissiveness off; it is seeded 'never' and the owner moves it when his team
--     is actually using the desk. Until he does, a file that skips Legal closes exactly as bb_60 allows.
--
--  C. ███ THE ARABIC OF A REFUSAL RAISED HERE IS RAISED THROUGH bb_60'S CALL STACK. staff_create_contract and
--     staff_sign_contract will now be able to fail with `legal_checklist_incomplete`, a code bb_60's own §11
--     list does not contain. bb_60's handover says every code needs a sentence in the CONTRACTS module's own
--     actions.ts; this file's §12 lists the codes it adds, and whoever wires the contracts screens must copy
--     them into CONTRACT_MESSAGES too — otherwise Legal reads «تعذّر الحفظ» at the one moment the product
--     most needs to say which paper is missing. The missing items' names travel in the exception's DETAIL,
--     so the sentence can name them without a second query.
--
--  D. ███ NOTHING HERE MOVES public.lead_statuses, AND TWO NEW FACTS ARE OFFERED TO §29's FUNNEL.
--     0064 refused to move a person's stage from a module and this file keeps that refusal. But §29's funnel
--     has been missing a FACT for two of its thirteen stages, and this file creates both:
--       «Legal Processing»   = public.legal_files.opened_at exists for the reservation.
--       «Contract Scheduled» = a public.legal_appointments row with status 'scheduled'.
--     app.legal_stage(p_reservation) below returns this desk's own derived stage from those facts and is
--     written to be CALLED by the funnel rather than copied into it.
--     ███ THE CONCRETE HANDSHAKE, because the funnel is being written in the same afternoon as this file:
--     supabase/pending/bb_70_journey.sql (another session, also a draft, also unapplied) declares its stage
--     10 `contract_scheduled` as «NO FACT — ما فمّاش حقيقة تثبتها اليوم: موعد إمضاء العقد ما عندوش جدول»
--     (its line 134) and derives stage 9 `legal_processing` from `contracts.status = 'draft'` (its line 133).
--     Once BOTH files are applied, two one-line changes in THAT file make both stages honest, and neither of
--     them belongs here:
--       stage 10 becomes: exists (select 1 from public.legal_appointments a
--                                 join public.legal_files f on f.id = a.legal_file_id
--                                 join public.reservations r on r.id = f.reservation_id
--                                 where r.person_id = <person> and a.status = 'scheduled')
--       stage 9 gains the earlier and truer fact: public.legal_files.opened_at, which is an ARRIVAL, where a
--               draft contract is an act somebody performed — a file can sit on Legal's desk for a week
--               before anyone writes a contract, and today that week reads as «Deposit Paid».
--     Order does not matter between the two drafts; they share no object. If bb_70_journey is applied first,
--     nothing breaks — its stage 10 simply keeps returning nothing until this file lands.
--
-- ===========================================================================
-- ███ THREE QUESTIONS ONLY THE OWNER CAN ANSWER. All three are seeded so nothing is guessed:
-- ███ 1. MUST EVERY SALE PASS THROUGH LEGAL? `legal.require_open_file_at` is seeded 'never'. The other three
-- ███    values are 'contract' · 'signature' · 'ownership', and each means «from this moment on, a sale with
-- ███    no legal file is refused». Switching it on is a Back Office edit, not a migration.
-- ███ 2. WHICH ITEMS ARE MANDATORY, AND AT WHICH GATE? The ten rows seeded in §5 are §20's own list with a
-- ███    gate each. Every one of them — the wording, the mandatory flag, the gate, the order — is a row the
-- ███    owner edits in الإعدادات. Nothing in the TypeScript names one.
-- ███ 3. MAY AN ADMIN WAIVE A MANDATORY ITEM? Today yes, and it is recorded: app.is_admin() only, a reason is
-- ███    required, and the waiver is audited with who and when. A rule with no recorded exception is a rule
-- ███    somebody eventually switches off entirely; this way the exception is one line in /admin/audit.
-- ███    Setting `legal.allow_waiver` turns it off completely.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT BUILD.
--   · NO DOCUMENT STORE. §20's items are TICKS — «this paper was seen» — not uploads. A shelf of scanned
--     client papers is the whole product's, not this desk's: bb_60's header refuses it for the same reason,
--     v3 §28 asks for it by name, and public.land_offer_files (0003) plus its signed-read route handler is
--     the pattern it should follow when somebody owns it. Each check carries a `note` where the registry
--     number or the file reference is typed, which is what contracts.legal_document_ref already does for the
--     contract itself.
--   · NO SECOND PARTNER LINK. §18 asks for a directory and §19 for an appointment that names the lawyer or
--     the notary; the partner therefore lives on the APPOINTMENT and nowhere else. A file↔partner join table
--     — so an expert and a surveyor could also be attached — is a structure the brief never describes, and
--     inventing it would be guessing at a workflow nobody has described yet. The directory is §18's
--     phonebook, and the four specialities are equally reachable in it.
--   · NO MODULE FLAG. 0064 states the rule this product settled on: «the module flag governs the VISITOR,
--     not the staff». This desk has no visitor door at all — there is nothing for a flag to hide — and
--     gating it on `contracts` would lock Legal out of the very preparation the desk exists to do while the
--     contract engine is still switched off. The reader returns the `contracts` flag state so the screen can
--     say the engine is off; the legal work itself is never refused for it.
--   · NO SENDING WORKER. §19's «it can notify» enqueues into public.notification_outbox through
--     app.enqueue_message with one new template row. Nothing in this repository sends yet, so no screen may
--     say «تم الإرسال» — the row sits at 'pending' and the outbox screen says so.
--   · NO TIMER AND NO CRON. An appointment whose day has passed is shown as passed, computed on read. It is
--     never moved by anything but a human, which is the same refusal 0063 and bb_60 both make.
--
-- TYPESCRIPT THAT MUST FOLLOW (none of it is in this file's hands):
--   1. npm run db:types                    the five tables and the RPCs appear; then delete callPending()
--                                          from src/app/admin/(panel)/desk/legal/read.ts and call
--                                          supabase.rpc(...) directly. The compiler is the guide.
--   2. src/lib/auth.ts                     LEGAL_DESK_ROLES = ["legal","finance","admin","super_admin"] —
--                                          the mirror of app.can_contract_trees() — belongs beside
--                                          PRICE_ROLES. It is today the SIXTH private copy of those four
--                                          roles; src/app/admin/(panel)/desk/legal/roles.ts says so and
--                                          names the other five.
--   3. src/app/admin/(panel)/layout.tsx    one nav row «القانوني وإتمام البيع» → /admin/desk/legal, gated on
--      + src/components/admin/nav-model.ts those same roles. Both files belong to another session and are
--                                          untouched here; without that row the desk is reachable only by
--                                          URL, which is how /admin/harvest ended up with no role gate at
--                                          all and nobody noticing.
--   4. the contracts module's actions.ts   the four codes of §12 that bb_60's own list does not carry, so a
--                                          refused signature names the missing paper.

-- ---------------------------------------------------------------------------
-- 0 · Refuse to run out of order
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.contracts') is null then
    raise exception 'bb_72_partners_closing.sql needs public.contracts, which supabase/pending/bb_60_contracts_installments.sql creates. Apply bb_60 first, or dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_60_contracts_installments.sql supabase/pending/bb_72_partners_closing.sql';
  end if;
  if to_regclass('public.reservations') is null or to_regclass('public.trees') is null then
    raise exception 'bb_72_partners_closing.sql needs public.reservations (0063) and public.trees (0054).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · Every business value this desk reads
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('legal.require_open_file_at', to_jsonb('never'::text), 'text', 'legal',
   'وقتاش يولّي الملف القانوني إجباري؟',
   'قرار للمالك. «never» (اللي محطوط اليوم): البيع ينجم يكمّل حتى كان حتى حدّ ما فتحش ملف قانوني — هكّا العقود اللي تتكتب اليوم تبقى تخدم كيما هي. «contract» = ما يتكتبش عقد قبل ما يتفتح الملف القانوني · «signature» = ما يتمضاش قبله · «ownership» = ما يتسجّلش التملّك قبله. كي يبدا الفريق يخدم بالمكتب هذا بجدّ، حطّها على «contract».',
   false, 800),

  ('legal.allow_waiver', to_jsonb(true), 'boolean', 'legal',
   'الإدارة تنجم تتجاوز بند إجباري؟',
   'كي تكون «نعم»، الأدمين برك ينجم يعلّم بند إجباري كـ«متجاوَز» مع سبب مكتوب، والعملية تتسجّل في سجل العمليات باسمو وتاريخها. حطّها «لا» كان تحب البنود الإجبارية تكون إجبارية بلا استثناء. ملاحظة: قاعدة بلا باب استثناء مسجّل هي قاعدة اللي يجي نهار ويطفّيوها كامل.',
   false, 801),

  ('legal.stage_labels',
   jsonb_build_object(
     'waiting',     'مستنّي المكتب القانوني',
     'in_review',   'في يد القانوني',
     'appointment', 'موعد العقد محدد',
     'contracted',  'العقد تكتب',
     'signed',      'العقد تمضى',
     'owned',       'تم إتمام البيع',
     'closed',      'الملف توفّى'),
   'json', 'legal',
   'أسماء مراحل المكتب القانوني بالعربي',
   'المراحل هذي تتحسب وقت ما تتقرا الشاشة من الحقائق اللي موجودة (العربون، الملف، الموعد، العقد، التملّك) وما تتكتبش في حتى خانة. الكلام اللي يتقرا يتبدّل من هنا. هذي مراحل المكتب هذا برك — مرحلة الحريف في المسار الكامل تبقى في «حالات الملفات».',
   false, 802),

  ('legal.gate_labels',
   jsonb_build_object(
     'contract',  'قبل ما يتكتب العقد',
     'signature', 'قبل الإمضاء',
     'ownership', 'قبل تسجيل التملّك'),
   'json', 'legal',
   'أسماء مراحل التثبّت بالعربي',
   'كل بند في القائمة القانونية يقول في أنا لحظة يوقّف: قبل ما يتكتب العقد (وهي نفس اللحظة اللي فيها الزيتونات يولّيوا «مباعة»)، ولا قبل الإمضاء، ولا قبل تسجيل التملّك. الأسماء برك تتبدّل من هنا؛ اللحظات روحهم ثابتة لأنّ البرنامج يشتغل عليهم.',
   false, 803),

  ('legal.appointment_status_labels',
   jsonb_build_object(
     'scheduled', 'موعد محدد',
     'completed', 'تمّ',
     'cancelled', 'تلغى'),
   'json', 'legal',
   'أسماء حالات موعد العقد بالعربي',
   'ثلاث حالات برك: موعد محدد، تمّ، تلغى. تأجيل الموعد ماهوش حالة — بدّل التاريخ والساعة والسبب يتسجّل في سجل العمليات.',
   false, 804),

  ('legal.appointment_min_lead_days', to_jsonb(0), 'integer', 'legal',
   'أقرب موعد للعقد (بالأيام)',
   'قدّاش يلزم من يوم بين اليوم وموعد العقد. 0 يقبل موعد نفس النهار — عادةً موعد عند الموثّق يتحدّد في التيليفون ونهارو معروف قبل ما يتكتب هنا، على هالخاطر محطوط 0. كراس الشروط ما يحدّدش رقم، فهو إعداد.',
   false, 805),

  ('legal.appointment_max_ahead_days', to_jsonb(180), 'integer', 'legal',
   'أبعد موعد للعقد (بالأيام)',
   'قدّاش ينجم الموعد يكون في الأمام. فوق هذا العدد الشاشة ترفض التاريخ وتقولّك قرّبو — حاجز غلطات كتابة (2062 عوض 2026)، موش قاعدة تجارية.',
   false, 806),

  ('legal.queue_codes_limit', to_jsonb(60), 'integer', 'legal',
   'أقصى عدد أرقام زيتونات تتعرض في الملف',
   'الملف القانوني يعرض أرقام الزيتونات وحدة وحدة (البند 17). كي يكونوا أكثر من هذا العدد، الشاشة تعرض أول وآخر رقم والعدد الجملي عوض 8000 سطر. زيد الرقم كان تحب أكثر.',
   false, 807)
on conflict (key) do nothing;

-- §18's four specialities, as the owner's own list: «محامين · عدول إشهاد · خبراء · مساحين». They are data he
-- renames and extends — a مهندس طوبوغرافي is one row, not a migration — so they are never an enum and never a
-- TypeScript union. Same shape as every other list he already edits in الإعدادات ← القوائم.
insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('partner_speciality', 'اختصاصات الشركاء', 'plain',
   'اختصاص الشريك في دليل الشركاء: محامي، عدل إشهاد، خبير، مسّاح… (البند 18). زيد ولا بدّل كيما تحب؛ الاسم يتنسخ على الشريك كيما كان مكتوب نهار ما تسجّل.')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order) values
  ('partner_speciality', 'lawyer',    'محامي',       'Avocat',     10),
  ('partner_speciality', 'notary',    'عدل إشهاد',   'Notaire',    20),
  ('partner_speciality', 'expert',    'خبير',        'Expert',     30),
  ('partner_speciality', 'surveyor',  'مسّاح',       'Géomètre',   40)
on conflict (list_key, code) do nothing;

-- §19 «ويمكن إرسال إشعار». Enqueued, never claimed as sent: there is no sending worker in this repository.
insert into public.message_templates (key, channel, body_ar, description_ar, variables, is_active) values
  ('legal.appointment_set', 'sms',
   'أهلا {name}، موعد إمضاء العقد يوم {date} على {time} في {place}. AgriZed',
   'تتبعث كي يتحدّد موعد العقد (البند 19). ما تتبعثش لتوّ: ما فماش عامل إرسال في المنصة، والسطر يقعد في صندوق الإرسال في حالة «في الانتظار».',
   array['name', 'date', 'time', 'place'], true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · The two small enums the code branches on
-- ---------------------------------------------------------------------------

-- The three moments a checklist item can block. An enum because the code branches on them and because they
-- are MOMENTS IN THE CONTRACT'S OWN LIFE, not opinions: bb_60 fixes all three (the insert, status 'signed',
-- owned_at). Their Arabic is settings legal.gate_labels, so the owner renames without a deployment.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'legal_gate') then
    create type public.legal_gate as enum ('contract', 'signature', 'ownership');
  end if;
end $$;

comment on type public.legal_gate is
  'When a legal checklist item blocks: before the contract is written (which is also when bb_60 sells the trees), before the signature, or before ownership is recorded (v2 §38). Codes are fixed because the trigger branches on them; the Arabic lives in settings legal.gate_labels.';

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'legal_appointment_status') then
    create type public.legal_appointment_status as enum ('scheduled', 'completed', 'cancelled');
  end if;
end $$;

comment on type public.legal_appointment_status is
  'State of a closing appointment (§19). Three values only: rescheduling is an edit to the date, not a fourth state, and the audit row keeps the move. Arabic: settings legal.appointment_status_labels.';

-- ---------------------------------------------------------------------------
-- 3 · Who may work at this desk
-- ---------------------------------------------------------------------------

-- NO NEW PREDICATE. app.can_contract_trees() (0054:85) is legal · finance · admin · super_admin — the exact
-- set §27 puts on «Legal: paid reservations, contracts, legal appointments», and the same set bb_60 gates
-- signing on. Every read and every write below is that predicate INTERSECTED with app.can_see_person(), which
-- narrows it further if the owner ever narrows Legal's reach the way §27 asks.
--
-- THE CONSEQUENCE, STATED PLAINLY BECAUSE IT IS §27'S WHOLE POINT: a `commercial` — the call-centre agent and
-- the field commercial, who are the same role today — cannot read this desk. Not the queue, not a file, not
-- the partner directory, not by typing the URL. That is the sentence in the brief — «a call-centre agent must
-- not be able to read a contract by typing its URL» — enforced in Postgres, where a page gate cannot be
-- bypassed. The TypeScript gate in roles.ts is the second layer, not the rule.
--
-- app.is_admin() is used for exactly two things: editing the checklist TEMPLATE (it is settings-grade data)
-- and waiving a mandatory item.
--
-- ONE GRANTED ALIAS, AND WHY. app.can_contract_trees() has EXECUTE revoked from `authenticated` (0054:83), so
-- an RLS policy — which is evaluated AS the caller — cannot name it: the reader gets «permission denied for
-- function can_contract_trees» before the policy has a chance to refuse them properly. The RPCs below call it
-- directly and are unaffected, because a security-definer function runs as its owner. The policies need a
-- granted name, so this file adds ONE, and it is an alias rather than a rule: it holds no role list of its
-- own, it cannot drift from what it wraps, and changing 0054's own grants from here — the other way out —
-- would be this file reaching into a migration it does not own.
create or replace function app.can_see_legal_desk() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_contract_trees()
$$;
revoke execute on function app.can_see_legal_desk() from public, anon;
grant execute on function app.can_see_legal_desk() to authenticated;

comment on function app.can_see_legal_desk() is
  'app.can_contract_trees(), under a name an RLS policy is allowed to call. It adds no role and holds no list: legal · finance · admin · super_admin stays defined in exactly one place (0054:85).';

-- ---------------------------------------------------------------------------
-- 4 · §18 · The partner directory
-- ---------------------------------------------------------------------------

create table if not exists public.partners (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null check (char_length(btrim(full_name)) between 2 and 160),
  -- §18's «هاتف». Validated by app.assert_phone, which already honours the owner's
  -- lead.allow_international_phone setting, so this file states no phone rule of its own.
  phone_e164      text,
  office_name     text check (office_name is null or char_length(office_name) <= 200),
  -- §18's «منطقة». public.governorates is already the owner's reference table, so the region is his data
  -- with no second list to maintain.
  governorate_id  smallint references public.governorates (id),
  -- §18's «اختصاص», from the owner's list, plus the label AS IT READ the day it was chosen — the same
  -- snapshot rule as payments.method_label_ar. Renaming «عدل إشهاد» later must not rewrite who this was.
  speciality_option_id uuid references public.option_items (id),
  speciality_label_ar  text check (speciality_label_ar is null or char_length(speciality_label_ar) <= 120),
  -- §18's «توفر». A flag plus a sentence: «يخدم الثلاثاء والخميس» is the answer teams actually give, and a
  -- full availability calendar is a module nobody has asked for. When one is asked for, it hangs here.
  is_available    boolean not null default true,
  availability_note text check (availability_note is null or char_length(availability_note) <= 300),
  note            text check (note is null or char_length(note) <= 2000),
  email           text check (email is null or char_length(email) <= 200),
  -- A partner is archived, never deleted: an appointment two years old must still say who it was with.
  is_active       boolean not null default true,

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists partners_speciality_idx on public.partners (speciality_option_id, full_name);
create index if not exists partners_region_idx     on public.partners (governorate_id, full_name);
create index if not exists partners_active_idx     on public.partners (is_active, is_available, full_name);

drop trigger if exists partners_stamp on public.partners;
create trigger partners_stamp before update on public.partners
  for each row execute function app.stamp_updated();
drop trigger if exists partners_audit on public.partners;
create trigger partners_audit after update or delete on public.partners
  for each row execute function app.audit_row_change();

comment on table public.partners is
  'المحامون وعدول الإشهاد والخبراء والمسّاحون (§18): الاسم، الهاتف، المكتب، الولاية، الاختصاص، التوفر والملاحظات. The speciality is a row of the option list partner_speciality, which the owner edits; the region is public.governorates. Read by Legal, Finance and Admin (app.can_contract_trees). Written only through staff_save_partner and staff_archive_partner.';
comment on column public.partners.speciality_label_ar is
  'The speciality as the list read the day this partner was saved. A snapshot for the same reason payments.method_label_ar is one: renaming a list must not rewrite history.';

alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;
grant select on public.partners to authenticated;

-- A directory of third parties' personal phone numbers. §27 puts it on Legal's desk; nobody else reads it.
drop policy if exists partners_select on public.partners;
create policy partners_select on public.partners for select to authenticated
  using ((select app.can_see_legal_desk()));

-- ---------------------------------------------------------------------------
-- 5 · §20 · The checklist TEMPLATE — the owner's own list
-- ---------------------------------------------------------------------------

-- WHY THIS IS ITS OWN TABLE AND NOT public.option_items. An item needs two facts an option row cannot carry:
-- whether it is MANDATORY, and WHICH GATE it blocks. Bolting two columns onto option_items — shared by
-- twenty-six lists and read by the public intake — to serve one of them is the change that makes a shared
-- table nobody can reason about. public.lead_statuses and public.project_types set the precedent: an
-- owner-editable list with columns of its own gets a table of its own, with the same admin-only write policy.
create table if not exists public.legal_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  -- A stable handle for the owner's own reference and for the seed's idempotency. The CODE is never branched
  -- on anywhere in this file or in the TypeScript: the gate and the mandatory flag are what the code reads,
  -- which is what lets the owner add «شهادة ملكية» tomorrow without a deployment.
  code        text not null unique check (char_length(btrim(code)) between 2 and 60),
  label_ar    text not null check (char_length(btrim(label_ar)) between 2 and 200),
  help_ar     text check (help_ar is null or char_length(help_ar) <= 1000),
  is_mandatory boolean not null default true,
  required_at public.legal_gate not null default 'contract',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists legal_checklist_items_order_idx
  on public.legal_checklist_items (is_active, required_at, sort_order, label_ar);

drop trigger if exists legal_checklist_items_stamp on public.legal_checklist_items;
create trigger legal_checklist_items_stamp before update on public.legal_checklist_items
  for each row execute function app.stamp_updated();
drop trigger if exists legal_checklist_items_audit on public.legal_checklist_items;
create trigger legal_checklist_items_audit after insert or update or delete on public.legal_checklist_items
  for each row execute function app.audit_row_change();

comment on table public.legal_checklist_items is
  'The TEMPLATE of §20''s legal checklist: what has to be verified, whether it is mandatory, and at which moment it blocks. Owner-editable, admin-only writes, exactly like public.lead_statuses. It is copied onto a file when that file opens (public.legal_file_checks) and the blocking rule reads ONLY the copy — so adding a row here never reaches a file that already exists.';
comment on column public.legal_checklist_items.required_at is
  'Which moment this item blocks. ''contract'' also guards the INVENTORY, because bb_60 moves the trees reserved → sold in the same transaction that writes the contract.';

alter table public.legal_checklist_items enable row level security;
revoke all on public.legal_checklist_items from anon, authenticated;
grant select on public.legal_checklist_items to authenticated;

drop policy if exists legal_checklist_items_select on public.legal_checklist_items;
create policy legal_checklist_items_select on public.legal_checklist_items for select to authenticated
  using ((select app.can_see_legal_desk()));

-- WRITES GO THROUGH public.staff_save_checklist_item AND NOWHERE ELSE, which is where this table parts
-- company with public.lead_statuses and public.option_items — both of which the owner edits straight through
-- RLS from الإعدادات. The difference is what the row DOES: flipping `is_mandatory` or moving `required_at`
-- changes a rule that can stop a sale, and every act in this module that can stop a sale carries a reason and
-- an audit row. A plain UPDATE through PostgREST would carry neither. Deletion is never granted at all: an
-- item is deactivated, so a file opened with it keeps its meaning.
revoke insert, update, delete on public.legal_checklist_items from authenticated;

-- §20's ten items, each mapped to the moment it blocks. EVERY ONE OF THESE IS A ROW THE OWNER EDITS: the
-- wording, the gate, the mandatory flag and the order. They are seeded because a checklist screen with an
-- empty list on day one teaches nobody what it is for — not because any of them is law.
insert into public.legal_checklist_items (code, label_ar, help_ar, is_mandatory, required_at, sort_order) values
  ('identity', 'التثبّت من هوية الحريف',
   'بطاقة التعريف الوطنية ولا جواز السفر، والاسم فيها يقرا كيف الاسم في الملف. اكتب عدد البطاقة في الملاحظة.',
   true, 'contract', 10),
  ('reservation_details', 'التثبّت من تفاصيل الحجز',
   'رقم الحجز، العرض، عدد الزيتونات — نفسهم اللي اتفق عليهم الحريف.',
   true, 'contract', 20),
  ('deposit_proof', 'إثبات دفع العربون',
   'الوصل ولا التحويل البنكي، والمبلغ يقرا كيف المبلغ في الملف.',
   true, 'contract', 30),
  ('tree_numbers', 'أرقام الزيتونات',
   'الأرقام بالضبط اللي باش يتكتبوا في العقد. كي يتكتب العقد، الزيتونات هاذوما يولّيوا «مباعة» في نفس اللحظة.',
   true, 'contract', 40),
  ('areas', 'المساحات',
   'مساحة كل زيتونة والمساحة الجملية كيما هي في العرض.',
   true, 'signature', 50),
  ('plan', 'مخطط الأرض',
   'المخطط اللي باش يتلحق بالعقد. ذكّر الحريف أنّو مخطط تقسيم مبدئي (الإعداد legal.plan_notice).',
   true, 'signature', 60),
  ('payment_plan', 'خطّة الخلاص',
   'التسبقة، المدة، القسط الشهري — كيما تجمّدوا في العقد، موش كيما في الحاسبة اليوم.',
   true, 'signature', 70),
  ('contract_document', 'نسخة العقد',
   'العقد مكتوب وجاهز للإمضاء، ومرجع الوثيقة القانونية معروف.',
   true, 'signature', 80),
  ('other_documents', 'بقية الوثائق',
   'أي وثيقة زائدة طلبها الموثّق ولا المحامي. موش إجباري: علّمو كان ينطبق.',
   false, 'signature', 90),
  ('signatures', 'الإمضاءات',
   'العقد ممضى من الجهتين ومسجّل، والمرجع مكتوب في العقد.',
   true, 'ownership', 100)
on conflict (code) do nothing;

-- The lawyer's own caution sentence already exists as a setting (legal.plan_notice, «مخطط تقسيم مبدئي…») and
-- is quoted by the 'plan' item above rather than copied into it: one sentence, one place.

-- ---------------------------------------------------------------------------
-- 6 · §16 · The legal file — one per reservation
-- ---------------------------------------------------------------------------

create table if not exists public.legal_files (
  id             uuid primary key default gen_random_uuid(),
  -- One legal file per hold, mirroring bb_60's «one contract per reservation» (v2 §49). The reservation is
  -- the only object that already agrees about the client, the offer and the trees.
  reservation_id uuid not null unique references public.reservations (id),
  -- Copied at open so RLS and the queue never need a join to decide who may read the row. They are the
  -- reservation's own and are never editable here.
  person_id      uuid not null references public.persons (id),
  project_id     uuid not null references public.projects (id),

  -- §29's missing fact for «Legal Processing»: the moment this file arrived on Legal's desk, and the moment
  -- the checklist was snapshot.
  opened_at  timestamptz not null default now(),
  opened_by  uuid references public.profiles (id),

  note       text check (note is null or char_length(note) <= 4000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create index if not exists legal_files_person_idx  on public.legal_files (person_id, opened_at desc);
create index if not exists legal_files_project_idx on public.legal_files (project_id, opened_at desc);

drop trigger if exists legal_files_stamp on public.legal_files;
create trigger legal_files_stamp before update on public.legal_files
  for each row execute function app.stamp_updated();
drop trigger if exists legal_files_audit on public.legal_files;
create trigger legal_files_audit after update or delete on public.legal_files
  for each row execute function app.audit_row_change();

comment on table public.legal_files is
  'One legal file per reservation (§16). It holds almost nothing on purpose — every fact §17 asks for already lives on the reservation, the trees, the payments, the visit and the demand, and app.legal_file_payload joins them. What this row adds is the one thing that did not exist: WHEN the file reached Legal, which is also the moment §20''s checklist was copied onto it, and which §29 can read as the fact behind «Legal Processing».';

alter table public.legal_files enable row level security;
revoke all on public.legal_files from anon, authenticated;
grant select on public.legal_files to authenticated;

drop policy if exists legal_files_select on public.legal_files;
create policy legal_files_select on public.legal_files for select to authenticated
  using ((select app.can_see_legal_desk()) and (select app.can_see_person(person_id)));

-- ---------------------------------------------------------------------------
-- 7 · §20 · The checks this file was opened with
-- ---------------------------------------------------------------------------

create table if not exists public.legal_file_checks (
  id            uuid primary key default gen_random_uuid(),
  legal_file_id uuid not null references public.legal_files (id) on delete cascade,
  -- Where it came from. Kept for the owner's reporting; the rule below never reads through it.
  item_id       uuid references public.legal_checklist_items (id),

  -- THE SNAPSHOT. The gate reads these four columns and NOTHING from the template. That is what makes «adding
  -- an item later does not retroactively break a closed file» a property of the schema rather than a promise.
  code         text not null,
  label_ar     text not null,
  is_mandatory boolean not null,
  required_at  public.legal_gate not null,
  sort_order   integer not null default 0,

  done_at  timestamptz,
  done_by  uuid references public.profiles (id),
  -- Where the registry number, the identity-card number or the file reference is typed. There is no document
  -- store in this file; see the header.
  note     text check (note is null or char_length(note) <= 1000),

  -- The recorded exception. Admin only, a reason is required, and it is audited — see setting
  -- legal.allow_waiver.
  waived_at    timestamptz,
  waived_by    uuid references public.profiles (id),
  waive_reason text check (waive_reason is null or char_length(waive_reason) <= 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  constraint legal_file_checks_item_key unique (legal_file_id, code),
  constraint legal_file_checks_done_check  check ((done_at is null) = (done_by is null)),
  constraint legal_file_checks_waive_check check ((waived_at is null) = (waived_by is null)),
  -- A waiver says «this one does not apply here», which is not the same claim as «I saw it». Letting a row be
  -- both would leave no honest answer to «was this paper actually produced?».
  constraint legal_file_checks_exclusive_check check (done_at is null or waived_at is null)
);

create index if not exists legal_file_checks_file_idx on public.legal_file_checks (legal_file_id, sort_order, code);
-- The gate's own lookup: the open mandatory items of one file, by gate.
create index if not exists legal_file_checks_open_idx on public.legal_file_checks (legal_file_id, required_at)
  where is_mandatory and done_at is null and waived_at is null;

drop trigger if exists legal_file_checks_stamp on public.legal_file_checks;
create trigger legal_file_checks_stamp before update on public.legal_file_checks
  for each row execute function app.stamp_updated();
-- UPDATE and DELETE only. Opening a file inserts ten rows in one act, which is logged once, by the RPC, as
-- 'legal.file_open' — the same reasoning 0054 gives for not auditing the insert of five hundred trees.
drop trigger if exists legal_file_checks_audit on public.legal_file_checks;
create trigger legal_file_checks_audit after update or delete on public.legal_file_checks
  for each row execute function app.audit_row_change();

comment on table public.legal_file_checks is
  'One row per checklist item as this file was opened with it (§20) — the wording, the mandatory flag and the gate all frozen at that moment. Ticking one is an audited human act; waiving a mandatory one is an admin act with a written reason. app.assert_legal_checklist reads this table and never public.legal_checklist_items, which is why a template edited in June cannot reopen a file closed in March.';

alter table public.legal_file_checks enable row level security;
revoke all on public.legal_file_checks from anon, authenticated;
grant select on public.legal_file_checks to authenticated;

drop policy if exists legal_file_checks_select on public.legal_file_checks;
create policy legal_file_checks_select on public.legal_file_checks for select to authenticated
  using ((select app.can_see_legal_desk())
         and exists (select 1 from public.legal_files f
                     where f.id = legal_file_id and (select app.can_see_person(f.person_id))));

-- ---------------------------------------------------------------------------
-- 8 · §19 · The closing appointment
-- ---------------------------------------------------------------------------

create table if not exists public.legal_appointments (
  id            uuid primary key default gen_random_uuid(),
  legal_file_id uuid not null references public.legal_files (id),
  -- Copied for the same reason legal_files copies them: RLS and the queue decide without a join.
  person_id     uuid not null references public.persons (id),

  status public.legal_appointment_status not null default 'scheduled',

  -- §19's five: date, hour, place, the partner, the documents required. A specific hour, not a slot — a
  -- notary gives you 10:30, he does not offer «صباحاً». That is the one place this table deliberately
  -- diverges from public.visits (0064), where a slot is right because the CLIENT picks from what is offered.
  meet_on   date not null,
  meet_at   time,
  place     text check (place is null or char_length(place) <= 300),
  partner_id uuid references public.partners (id),
  -- The partner's name as it read the day the appointment was made. An archived partner must not blank an
  -- appointment that already happened.
  partner_label_ar text check (partner_label_ar is null or char_length(partner_label_ar) <= 200),
  documents_note   text check (documents_note is null or char_length(documents_note) <= 2000),
  note             text check (note is null or char_length(note) <= 2000),

  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  closed_at     timestamptz,
  closed_by     uuid references public.profiles (id),

  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- A finished appointment says when it finished; a live one does not pretend to. Same biconditional shape as
  -- reservations_closed_check, for the same reason: it cannot drift.
  constraint legal_appointments_closed_check check (
    (status in ('completed', 'cancelled')) = (closed_at is not null))
);

-- One OPEN appointment per file. A second «موعد العقد محدد» on the same file is two answers to «متى؟», and
-- §29 reads exactly this row as the fact behind «Contract Scheduled». Rescheduling edits the date.
create unique index if not exists legal_appointments_one_open_idx
  on public.legal_appointments (legal_file_id) where status = 'scheduled';
create index if not exists legal_appointments_day_idx     on public.legal_appointments (meet_on, meet_at);
create index if not exists legal_appointments_person_idx  on public.legal_appointments (person_id, meet_on desc);
create index if not exists legal_appointments_partner_idx on public.legal_appointments (partner_id) where partner_id is not null;

drop trigger if exists legal_appointments_stamp on public.legal_appointments;
create trigger legal_appointments_stamp before update on public.legal_appointments
  for each row execute function app.stamp_updated();
drop trigger if exists legal_appointments_audit on public.legal_appointments;
create trigger legal_appointments_audit after insert or update or delete on public.legal_appointments
  for each row execute function app.audit_row_change();

comment on table public.legal_appointments is
  'موعد إمضاء العقد (§19): النهار والساعة والمكان والشريك (محامي ولا عدل إشهاد) والوثائق المطلوبة. One open appointment per legal file, enforced by a partial unique index. Nothing moves it on a timer: an appointment whose day has passed is SHOWN as passed and stays ''scheduled'' until a human says what happened.';

alter table public.legal_appointments enable row level security;
revoke all on public.legal_appointments from anon, authenticated;
grant select on public.legal_appointments to authenticated;

drop policy if exists legal_appointments_select on public.legal_appointments;
create policy legal_appointments_select on public.legal_appointments for select to authenticated
  using ((select app.can_see_legal_desk()) and (select app.can_see_person(person_id)));

-- ---------------------------------------------------------------------------
-- 9 · §20 · THE RULE — a trigger on public.contracts, not a disabled button
-- ---------------------------------------------------------------------------

-- Everything a screen needs to know about one file's checklist, computed here and nowhere else.
create or replace function app.legal_checklist_state(p_file uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with c as (
    select k.*, (k.done_at is not null or k.waived_at is not null) as settled
    from public.legal_file_checks k where k.legal_file_id = p_file
  )
  select jsonb_build_object(
    'total',            (select count(*) from c),
    'settled',          (select count(*) from c where c.settled),
    'mandatory_total',  (select count(*) from c where c.is_mandatory),
    'mandatory_open',   (select count(*) from c where c.is_mandatory and not c.settled),
    -- What is still blocking, per gate. The screen prints «باقي 2 قبل الإمضاء» from this and computes nothing.
    'blocking', (select coalesce(jsonb_object_agg(g.gate, g.n), '{}'::jsonb)
                 from (select c.required_at::text as gate, count(*) as n
                       from c where c.is_mandatory and not c.settled
                       group by c.required_at) g),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', c.id,
                       'code', c.code,
                       'label_ar', c.label_ar,
                       'is_mandatory', c.is_mandatory,
                       'required_at', c.required_at::text,
                       'done_at', c.done_at,
                       'done_by', (select pr.full_name from public.profiles pr where pr.id = c.done_by),
                       'note', c.note,
                       'waived_at', c.waived_at,
                       'waived_by', (select pr.full_name from public.profiles pr where pr.id = c.waived_by),
                       'waive_reason', c.waive_reason)
                     order by c.sort_order, c.code), '[]'::jsonb) from c))
$$;
revoke execute on function app.legal_checklist_state(uuid) from public, anon, authenticated;

comment on function app.legal_checklist_state(uuid) is
  'One file''s checklist, counted and listed. Read from public.legal_file_checks only — the template is never consulted, so a screen and the gate can never disagree about what is still missing.';

-- THE RULE ITSELF. It raises, it never writes, and it reads only the snapshot. The missing items travel in the
-- exception's DETAIL — PostgREST forwards it as `details` — so the screen can name the paper instead of saying
-- «something is missing», without a second query in a transaction that is about to roll back.
create or replace function app.assert_legal_checklist(p_reservation uuid, p_gate public.legal_gate) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_file    uuid;
  v_missing text;
  v_require text := lower(coalesce(app.setting_text('legal.require_open_file_at', 'never'), 'never'));
begin
  select f.id into v_file from public.legal_files f where f.reservation_id = p_reservation;

  if v_file is null then
    -- Decision B of the header: no legal file, no gate — unless the owner has said every sale must pass
    -- through Legal from this moment on.
    if v_require = p_gate::text then
      raise exception 'legal_file_required' using errcode = 'P0001';
    end if;
    return;
  end if;

  select string_agg(k.label_ar, '، ' order by k.sort_order, k.code) into v_missing
  from public.legal_file_checks k
  where k.legal_file_id = v_file
    and k.required_at = p_gate
    and k.is_mandatory
    and k.done_at is null
    and k.waived_at is null;

  if v_missing is not null then
    raise exception 'legal_checklist_incomplete'
      using errcode = 'P0001',
            detail = v_missing,
            hint = p_gate::text;
  end if;
end $$;
revoke execute on function app.assert_legal_checklist(uuid, public.legal_gate) from public, anon, authenticated;

comment on function app.assert_legal_checklist(uuid, public.legal_gate) is
  'Refuses when a mandatory item of §20''s checklist is still open at this gate. The names of the missing items are in the exception DETAIL and the gate is in its HINT, so the Arabic sentence can say which paper is missing. Does nothing when no legal file was ever opened, unless settings legal.require_open_file_at names this gate.';

-- Has the moment this gate guards already happened? Two things read it: staff_legal_sync_items, which must
-- add nothing behind a passed gate, and staff_set_legal_check, which must not let history be edited backwards.
create or replace function app.legal_gate_passed(p_reservation uuid, p_gate public.legal_gate) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_gate
    when 'contract'  then exists (select 1 from public.contracts c where c.reservation_id = p_reservation)
    when 'signature' then exists (select 1 from public.contracts c
                                  where c.reservation_id = p_reservation and c.status in ('signed', 'completed'))
    when 'ownership' then exists (select 1 from public.contracts c
                                  where c.reservation_id = p_reservation and c.owned_at is not null)
  end
$$;
revoke execute on function app.legal_gate_passed(uuid, public.legal_gate) from public, anon, authenticated;

comment on function app.legal_gate_passed(uuid, public.legal_gate) is
  'True once the moment this gate guards has happened. It is what keeps a closed file closed: staff_legal_sync_items adds nothing behind a passed gate, and staff_set_legal_check refuses to un-tick behind one.';

-- THE GATE. A trigger, so bb_60 is not forked: see decision 2 of the header. It fires on the three moments
-- bb_60 itself defines and on nothing else, and it is deliberately blind to WHICH function made the change —
-- a hand-typed UPDATE in psql is refused for the same reason a Server Action is.
create or replace function app.contracts_legal_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- bb_60 sells the reservation's trees inside the same transaction that writes this row, so THIS is the
    -- moment that guards the inventory, not the signature.
    perform app.assert_legal_checklist(new.reservation_id, 'contract');
    return new;
  end if;

  if new.status = 'signed' and old.status is distinct from 'signed' then
    perform app.assert_legal_checklist(new.reservation_id, 'signature');
  end if;
  -- v2 §38's «تم إتمام البيع»: the date «زيتونتي» opens on. bb_60 sets it in staff_set_contract_owned.
  if new.owned_at is not null and old.owned_at is null then
    perform app.assert_legal_checklist(new.reservation_id, 'ownership');
  end if;
  return new;
end $$;
-- Deliberately NOT revoked, unlike every other function in this file: PostgreSQL does not check EXECUTE on a
-- trigger function, and app.stamp_updated / app.audit_row_change are left granted for the same reason.

comment on function app.contracts_legal_gate() is
  '§20''s rule, applied to public.contracts from the outside so that supabase/pending/bb_60_contracts_installments.sql needs no edit. Three moments: writing the contract (which is also when the trees are sold), the signature, and ownership. Cancelling is NOT gated — a file that must be undone must always be undoable.';

drop trigger if exists contracts_legal_gate on public.contracts;
-- Named to sort before contracts_stamp, so the refusal happens before anything else has bothered to run.
create trigger contracts_legal_gate before insert or update on public.contracts
  for each row execute function app.contracts_legal_gate();

-- ---------------------------------------------------------------------------
-- 10 · §29 · The desk's own derived stage, offered to the funnel
-- ---------------------------------------------------------------------------

-- DERIVED, NEVER STORED, and never written into public.lead_statuses — 0064 refused that and this file keeps
-- the refusal. It is the fact behind two of §29's thirteen stages, which have had none until now:
--   «Legal Processing»   ← 'in_review'   (public.legal_files.opened_at exists)
--   «Contract Scheduled» ← 'appointment' (a public.legal_appointments row at 'scheduled')
-- Whoever builds §29 should CALL this rather than re-derive it: two functions deciding the same stage is
-- exactly the drift the whole brief is complaining about.
create or replace function app.legal_stage(p_reservation uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.contracts c
                 where c.reservation_id = p_reservation and c.owned_at is not null)          then 'owned'
    when exists (select 1 from public.contracts c
                 where c.reservation_id = p_reservation and c.status = 'cancelled')          then 'closed'
    when exists (select 1 from public.contracts c
                 where c.reservation_id = p_reservation and c.status in ('signed', 'completed')) then 'signed'
    when exists (select 1 from public.contracts c
                 where c.reservation_id = p_reservation)                                     then 'contracted'
    -- A hold that lapsed or was cancelled and never became a contract is FINISHED, even if its عربون was
    -- once paid. Without this line such a file would read «waiting» and sit at the top of Legal's queue for
    -- ever, because the deposit is the queue's own door and a paid deposit never un-happens. It is deliberately
    -- BELOW the contract tests: once a contract exists, what became of the reservation afterwards is the
    -- contract's story to tell.
    when exists (select 1 from public.reservations r
                 where r.id = p_reservation and r.status in ('expired', 'cancelled'))        then 'closed'
    when exists (select 1 from public.legal_appointments a
                 join public.legal_files f on f.id = a.legal_file_id
                 where f.reservation_id = p_reservation and a.status = 'scheduled')          then 'appointment'
    when exists (select 1 from public.legal_files f where f.reservation_id = p_reservation)   then 'in_review'
    else 'waiting'
  end
$$;
revoke execute on function app.legal_stage(uuid) from public, anon, authenticated;

comment on function app.legal_stage(uuid) is
  'This desk''s stage for one reservation, computed from the facts that exist (§16 → §21). It writes nothing and it never touches public.lead_statuses. §29''s funnel should call it for «Legal Processing» and «Contract Scheduled», the two stages that had no fact behind them before this file.';

-- ---------------------------------------------------------------------------
-- 11 · §17 · Everything Legal sees, joined, never copied
-- ---------------------------------------------------------------------------

-- WHO HANDLED IT AT EACH STEP — §17's «أنا Commercial Terrain وأنا Agent تيليفون». Both facts already exist
-- and neither was ever joined onto a reservation before: the phone agent is persons.assigned_to, the field
-- commercial is visits.assigned_to on the client's most recent visit to this offer.
create or replace function app.legal_handlers(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r     public.reservations;
  v_visit public.visits;
  v_agent text;
  -- Scalars rather than a `record`: a RECORD variable that a SELECT INTO never populates is the one shape in
  -- PL/pgSQL that throws instead of reading NULL, and a legal file is opened for holds that have no visit and
  -- no receipt yet.
  v_dep_at   timestamptz;
  v_dep_no   text;
  v_dep_who  text;
begin
  select * into v_r from public.reservations r where r.id = p_reservation;
  if not found then return '{}'::jsonb; end if;

  select pr.full_name into v_agent
  from public.persons ps join public.profiles pr on pr.id = ps.assigned_to
  where ps.id = v_r.person_id;

  -- The visit that actually produced this sale: the client's own, on this offer, most recent first, a
  -- completed one preferred over a booked one.
  select * into v_visit
  from public.visits v
  where v.person_id = v_r.person_id and v.project_id = v_r.project_id
  order by (v.status = 'completed') desc, v.visit_date desc, v.created_at desc
  limit 1;

  select p.received_at, p.reference_no, pr.full_name into v_dep_at, v_dep_no, v_dep_who
  from public.payments p left join public.profiles pr on pr.id = p.recorded_by
  where p.reservation_id = p_reservation and p.kind = 'deposit' and p.voided_at is null
  order by p.received_at desc limit 1;

  return jsonb_build_object(
    'phone_agent', v_agent,
    'field_commercial', (select pr.full_name from public.profiles pr where pr.id = v_visit.assigned_to),
    'visit_no', v_visit.visit_no,
    'visit_date', v_visit.visit_date,
    'visit_status', v_visit.status::text,
    'visit_status_label', case when v_visit.status is not null then app.visit_status_label(v_visit.status) end,
    'visit_note', v_visit.staff_note,
    'reserved_by', (select pr.full_name from public.profiles pr where pr.id = v_r.created_by),
    'deposit_taken_by', v_dep_who,
    'deposit_receipt_no', v_dep_no,
    'deposit_received_at', v_dep_at);
end $$;
revoke execute on function app.legal_handlers(uuid) from public, anon, authenticated;

-- §17's «الثمن الجملي، المدفوع، المتبقي، خطّة الخلاص». Computed in Postgres, from the contract when one
-- exists — its figures are the frozen truth, bb_60 says so at length — and from the demand the client
-- answered on the site when one does not. NOTHING here is recomputed from a formula and nothing is rounded.
create or replace function app.legal_money(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r        public.reservations;
  v_c        public.contracts;
  v_req      public.interest_requests;
  v_trees    integer;
  v_per_tree bigint;
  v_total    bigint;
  v_paid     bigint;
  v_deposit  bigint;
  v_source   text;
begin
  select * into v_r from public.reservations r where r.id = p_reservation;
  if not found then return '{}'::jsonb; end if;
  select * into v_c from public.contracts c where c.reservation_id = p_reservation;
  if v_r.request_id is not null then
    select * into v_req from public.interest_requests q where q.id = v_r.request_id;
  end if;

  select count(*)::integer into v_trees
  from public.trees t where t.reservation_id = p_reservation and t.state in ('reserved', 'sold');

  if v_c.id is not null then
    v_source   := 'contract';
    v_per_tree := v_c.price_per_tree_millimes;
    v_total    := v_c.total_price_millimes;
  else
    v_source   := 'offer';
    -- bb_60's own reader, reused rather than re-derived: it already knows how an offer with more than one
    -- planting density is priced for THIS demand.
    v_per_tree := app.contract_price_per_tree(v_r.project_id, v_r.request_id);
    if v_per_tree is null then
      v_per_tree := v_req.price_per_tree_millimes;
      v_source   := 'request';
    end if;
    v_total := case when v_per_tree is not null and v_trees is not null then v_per_tree * v_trees end;
  end if;

  -- Every live millime on this file: the عربون on the reservation and anything recorded against the contract.
  select coalesce(sum(p.amount_millimes), 0)::bigint into v_paid
  from public.payments p
  where p.voided_at is null
    and (p.reservation_id = p_reservation or (v_c.id is not null and p.contract_id = v_c.id));

  select coalesce(sum(p.amount_millimes), 0)::bigint into v_deposit
  from public.payments p
  where p.reservation_id = p_reservation and p.kind = 'deposit' and p.voided_at is null;

  return jsonb_build_object(
    'price_source', v_source,
    'trees', coalesce(v_trees, 0),
    'price_per_tree_millimes', v_per_tree,
    'total_price_millimes', v_total,
    'paid_millimes', v_paid,
    'remaining_millimes', case when v_total is not null then greatest(v_total - v_paid, 0) end,
    'deposit_due_millimes', v_r.deposit_due_millimes,
    'deposit_paid_millimes', v_deposit,
    'deposit_left_millimes', greatest(v_r.deposit_due_millimes - v_deposit, 0),
    'deposit_paid_at', v_r.deposit_paid_at,
    -- §13/§17's plan. From the contract when it is frozen there; otherwise what the client answered on the
    -- site, which 0061 stored and which nothing has ever carried this far.
    'plan', jsonb_build_object(
      'source', case when v_c.id is not null then 'contract' else 'request' end,
      'payment_mode', coalesce(v_c.payment_mode, v_req.payment_mode),
      'down_payment_percent', coalesce(v_c.down_payment_percent, v_req.down_payment_percent),
      'down_payment_millimes', coalesce(v_c.down_payment_millimes, v_req.down_payment_amount_millimes),
      'duration_months', coalesce(v_c.duration_months, v_req.duration_months),
      'monthly_millimes', coalesce(v_c.monthly_millimes, v_req.monthly_millimes),
      'last_installment_millimes', v_c.last_installment_millimes,
      'installments_count', v_c.installments_count,
      'total_financed_millimes', coalesce(v_c.total_financed_millimes, v_req.total_financed_millimes),
      'remaining_millimes', v_c.remaining_millimes));
end $$;
revoke execute on function app.legal_money(uuid) from public, anon, authenticated;

comment on function app.legal_money(uuid) is
  '§17''s money for one legal file: the total, what has arrived, what is left, the عربون and the payment plan. Reads the contract''s frozen snapshot when a contract exists and the demand''s own answers when it does not, and says which in price_source and plan.source. Multiplies price × trees and subtracts paid from total — and does nothing else; every rate, markup and rounding decision stays where bb_60 and 0031 already made it.';

-- The whole file, §17 line by line, in one read.
create or replace function app.legal_file_payload(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_r      public.reservations;
  v_f      public.legal_files;
  v_pj     public.projects;
  v_person public.persons;
  v_c      public.contracts;
  v_appt   public.legal_appointments;
  v_gov    text;
  v_res_lb jsonb := coalesce(app.setting('reservations.status_labels'), '{}'::jsonb);
  v_ctr_lb jsonb := coalesce(app.setting('contracts.status_labels'), '{}'::jsonb);
  v_apt_lb jsonb := coalesce(app.setting('legal.appointment_status_labels'), '{}'::jsonb);
  v_stg_lb jsonb := coalesce(app.setting('legal.stage_labels'), '{}'::jsonb);
  v_cap    integer := greatest(app.setting_int('legal.queue_codes_limit', 60), 1);
  v_held   integer;
  v_sold   integer;
  v_codes  jsonb;
  v_first  text;
  v_last   text;
  v_stage  text;
  v_notes  jsonb;
begin
  select * into v_r from public.reservations r where r.id = p_reservation;
  if not found then return null; end if;
  select * into v_f      from public.legal_files f  where f.reservation_id = p_reservation;
  select * into v_pj     from public.projects pj    where pj.id = v_r.project_id;
  select * into v_person from public.persons ps     where ps.id = v_r.person_id;
  select * into v_c      from public.contracts c    where c.reservation_id = p_reservation;
  if v_f.id is not null then
    select * into v_appt from public.legal_appointments a
    where a.legal_file_id = v_f.id
    order by (a.status = 'scheduled') desc, a.meet_on desc, a.created_at desc limit 1;
  end if;

  select g.name_ar into v_gov from public.governorates g where g.id = v_person.governorate_id;
  v_stage := app.legal_stage(p_reservation);

  select (count(*) filter (where t.state = 'reserved'))::integer,
         (count(*) filter (where t.state = 'sold'))::integer
  into v_held, v_sold
  from public.trees t where t.reservation_id = p_reservation;

  select t.code into v_first from public.trees t where t.reservation_id = p_reservation order by t.seq limit 1;
  select t.code into v_last  from public.trees t where t.reservation_id = p_reservation order by t.seq desc limit 1;

  -- §9's whole point, printed: the numbers themselves, not a count. Capped by a setting, because TX-00215
  -- holds eight thousand trees and a legal file is read on a phone.
  select coalesce(jsonb_agg(x.code order by x.seq), '[]'::jsonb) into v_codes
  from (select t.code, t.seq from public.trees t
        where t.reservation_id = p_reservation order by t.seq limit v_cap) x;

  -- §17's «ملاحظات كل الفرق», merged into one feed in the order they were written. Three stores today, one
  -- list here — and no fourth store invented to hold the merge.
  select coalesce(jsonb_agg(s.n order by s.at desc), '[]'::jsonb) into v_notes
  from (
    select v_r.reserved_at as at,
           jsonb_build_object('at', v_r.reserved_at, 'team', 'الحجز', 'body', v_r.note,
                              'who', (select pr.full_name from public.profiles pr where pr.id = v_r.created_by)) as n
    where v_r.note is not null
    union all
    select v.created_at,
           jsonb_build_object('at', v.created_at, 'team', 'الزيارة الميدانية', 'body', v.staff_note,
                              'who', (select pr.full_name from public.profiles pr where pr.id = v.assigned_to))
    from public.visits v
    where v.person_id = v_r.person_id and v.project_id = v_r.project_id and v.staff_note is not null
    union all
    select pn.created_at,
           jsonb_build_object('at', pn.created_at, 'team', 'ملف الحريف', 'body', pn.body,
                              'who', (select pr.full_name from public.profiles pr where pr.id = pn.created_by))
    from public.person_notes pn where pn.person_id = v_r.person_id
    union all
    select v_f.opened_at,
           jsonb_build_object('at', v_f.opened_at, 'team', 'المكتب القانوني', 'body', v_f.note,
                              'who', (select pr.full_name from public.profiles pr where pr.id = v_f.opened_by))
    where v_f.note is not null
  ) s(at, n);

  return jsonb_build_object(
    'reservation_id', v_r.id,
    'reservation_no', v_r.reference_no,
    'reservation_status', v_r.status::text,
    'reservation_status_label', coalesce(v_res_lb->>v_r.status::text, v_r.status::text),
    'reserved_at', v_r.reserved_at,
    'expires_at', v_r.expires_at,
    'conditions_ar', v_r.conditions_ar,

    'stage', v_stage,
    'stage_label', coalesce(v_stg_lb->>v_stage, v_stage),

    'person_id', v_r.person_id,
    'person_name', v_person.full_name,
    'person_phone', v_person.phone_e164,
    'person_whatsapp', v_person.whatsapp_e164,
    'person_email', v_person.email,
    'person_governorate', v_gov,

    'project_id', v_r.project_id,
    'offer_code', v_pj.code,
    'offer_name', v_pj.name,
    'request_id', v_r.request_id,
    'request_no', (select q.request_no from public.interest_requests q where q.id = v_r.request_id),

    'trees_count', v_r.trees_count,
    'trees_held', coalesce(v_held, 0),
    'trees_sold', coalesce(v_sold, 0),
    'first_code', v_first,
    'last_code', v_last,
    'tree_codes', v_codes,
    'tree_codes_capped', coalesce(v_held, 0) + coalesce(v_sold, 0) > v_cap,

    'money', app.legal_money(p_reservation),
    'handlers', app.legal_handlers(p_reservation),
    'notes', v_notes)
  -- Split only because jsonb_build_object takes at most 100 arguments; it is one object.
  || jsonb_build_object(
    'legal_file', case when v_f.id is null then null else jsonb_build_object(
        'id', v_f.id,
        'opened_at', v_f.opened_at,
        'opened_by', (select pr.full_name from public.profiles pr where pr.id = v_f.opened_by),
        'note', v_f.note,
        'checklist', app.legal_checklist_state(v_f.id)) end,

    'appointment', case when v_appt.id is null then null else jsonb_build_object(
        'id', v_appt.id,
        'status', v_appt.status::text,
        'status_label', coalesce(v_apt_lb->>v_appt.status::text, v_appt.status::text),
        'meet_on', v_appt.meet_on,
        'meet_at', v_appt.meet_at,
        -- Computed on read, never stored and never moved by a timer.
        'is_past', v_appt.status = 'scheduled' and v_appt.meet_on < app.tunis_today(),
        'is_today', v_appt.status = 'scheduled' and v_appt.meet_on = app.tunis_today(),
        'place', v_appt.place,
        'partner_id', v_appt.partner_id,
        'partner_label', v_appt.partner_label_ar,
        'partner_phone', (select p.phone_e164 from public.partners p where p.id = v_appt.partner_id),
        'documents_note', v_appt.documents_note,
        'note', v_appt.note,
        'cancel_reason', v_appt.cancel_reason,
        'created_by', (select pr.full_name from public.profiles pr where pr.id = v_appt.created_by)) end,

    'contract', case when v_c.id is null then null else jsonb_build_object(
        'id', v_c.id,
        'reference_no', v_c.reference_no,
        'status', v_c.status::text,
        'status_label', coalesce(v_ctr_lb->>v_c.status::text, v_c.status::text),
        'kind_label', v_c.kind_label_ar,
        'legal_document_ref', v_c.legal_document_ref,
        'signed_on', v_c.signed_on,
        'signed_by', (select pr.full_name from public.profiles pr where pr.id = v_c.signed_by),
        'owned_at', v_c.owned_at,
        'trees_count', v_c.trees_count) end,

    'contracts_module_state', app.flag_state('contracts')::text,
    'require_open_file_at', lower(coalesce(app.setting_text('legal.require_open_file_at', 'never'), 'never')),
    'allow_waiver', app.setting_bool('legal.allow_waiver', true),
    'gate_labels', coalesce(app.setting('legal.gate_labels'), '{}'::jsonb),
    'appointment_min_date', app.tunis_today() + app.setting_int('legal.appointment_min_lead_days', 0),
    'appointment_max_date', app.tunis_today() + app.setting_int('legal.appointment_max_ahead_days', 180));
end $$;
revoke execute on function app.legal_file_payload(uuid) from public, anon, authenticated;

comment on function app.legal_file_payload(uuid) is
  '§17, line by line, in one read: the reservation, the client, the offer, the trees BY NUMBER, the عربون and every payment, the money and the plan, who handled it at each step, everyone''s notes merged, the legal file with its checklist, the closing appointment and the contract. It joins; it copies nothing. Every label and every limit it prints comes from settings.';

-- ---------------------------------------------------------------------------
-- 12 · Readers
-- ---------------------------------------------------------------------------

-- §16's queue: ONLY files that reached «العربون مدفوع», plus the ones that have moved on from it, so the desk
-- does not lose sight of a file the moment it writes its contract. One pass, so the counts and the rows can
-- never describe two different sets — the shape staff_reservations already uses.
create or replace function public.staff_legal_queue(
  p_filter text default 'active', p_project uuid default null, p_limit integer default 100
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_filter text := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'active');
  v_limit  integer := greatest(1, least(coalesce(p_limit, 100), 300));
  v_rows   jsonb;
  v_counts jsonb;
  v_total  integer;
begin
  -- §27, in the database: Legal, Finance and Admin. A commercial is refused here, not hidden from a nav row.
  if not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_filter not in ('active', 'waiting', 'in_review', 'appointment', 'contracted', 'signed', 'owned', 'all') then
    raise exception 'invalid_legal_filter' using errcode = 'P0001';
  end if;

  with visible as (
    select r.id, r.person_id, r.project_id, r.reserved_at, r.deposit_paid_at, r.status,
           app.legal_stage(r.id) as stage
    from public.reservations r
    where app.can_see_person(r.person_id)
      and (p_project is null or r.project_id = p_project)
      -- The door §16 describes: the deposit has been paid. A hold still waiting for its عربون is the
      -- commercial's work, not Legal's, and staff_reservations already shows it to them.
      and (r.status = 'deposit_paid' or r.deposit_paid_at is not null or r.status = 'converted')
  ), tagged as (
    select v.*,
           (v.stage in ('waiting', 'in_review', 'appointment', 'contracted', 'signed')) as is_active,
           case v.stage
             when 'appointment' then 0
             when 'waiting'     then 1
             when 'in_review'   then 2
             when 'contracted'  then 3
             when 'signed'      then 4
             else 5 end as rank
    from visible v
  ), kept as (
    select t.* from tagged t
    where case v_filter
            when 'active' then t.is_active
            when 'all'    then true
            else t.stage = v_filter
          end
  )
  select (select count(*)::integer from kept),
         (select coalesce(jsonb_agg(app.legal_file_payload(x.id)
                          order by x.rank, x.deposit_paid_at nulls last, x.reserved_at), '[]'::jsonb)
          from (select k.id, k.rank, k.deposit_paid_at, k.reserved_at from kept k
                order by k.rank, k.deposit_paid_at nulls last, k.reserved_at
                limit v_limit) x),
         (select jsonb_build_object(
                   'active',      count(*) filter (where t.is_active),
                   'waiting',     count(*) filter (where t.stage = 'waiting'),
                   'in_review',   count(*) filter (where t.stage = 'in_review'),
                   'appointment', count(*) filter (where t.stage = 'appointment'),
                   'contracted',  count(*) filter (where t.stage = 'contracted'),
                   'signed',      count(*) filter (where t.stage = 'signed'),
                   'owned',       count(*) filter (where t.stage = 'owned'),
                   'all',         count(*))
          from tagged t)
  into v_total, v_rows, v_counts;

  return jsonb_build_object(
    'filter', v_filter,
    'limit', v_limit,
    'matched', v_total,
    'capped', v_total > v_limit,
    'counts', v_counts,
    'stage_labels', coalesce(app.setting('legal.stage_labels'), '{}'::jsonb),
    'contracts_module_state', app.flag_state('contracts')::text,
    'rows', v_rows);
end $$;
revoke execute on function public.staff_legal_queue(text, uuid, integer) from public, anon;
grant execute on function public.staff_legal_queue(text, uuid, integer) to authenticated;

comment on function public.staff_legal_queue(text, uuid, integer) is
  '§16''s queue: the files that reached «العربون مدفوع» and everything that has moved on from it, ordered by what needs a human first — an appointment, then a file nobody has opened, then the rest. Legal, Finance, Admin and Super Admin only (app.can_contract_trees), intersected with app.can_see_person. No module gate: the desk has no visitor door, and Legal prepares its work before the contract engine is switched on.';

create or replace function public.staff_legal_file(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_person uuid;
begin
  if not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select r.person_id into v_person from public.reservations r where r.id = p_reservation;
  if v_person is null or not app.can_see_person(v_person) then
    return null;
  end if;
  return app.legal_file_payload(p_reservation);
end $$;
revoke execute on function public.staff_legal_file(uuid) from public, anon;
grant execute on function public.staff_legal_file(uuid) to authenticated;

comment on function public.staff_legal_file(uuid) is
  'One legal file in full (§17). Null when it does not exist or the reader may not see the client — never an empty object, so a screen can tell «not yours» from «nothing here».';

-- §18's directory, with the owner's speciality list beside it so the form and the rows can never disagree
-- about what a speciality is.
create or replace function public.staff_partners(
  p_speciality uuid default null, p_governorate smallint default null,
  p_search text default null, p_include_archived boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q    text := nullif(btrim(coalesce(p_search, '')), '');
  v_rows jsonb;
begin
  if not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'full_name', p.full_name,
           'phone_e164', p.phone_e164,
           'email', p.email,
           'office_name', p.office_name,
           'governorate_id', p.governorate_id,
           'governorate', (select g.name_ar from public.governorates g where g.id = p.governorate_id),
           'speciality_option_id', p.speciality_option_id,
           'speciality_label', p.speciality_label_ar,
           'is_available', p.is_available,
           'availability_note', p.availability_note,
           'note', p.note,
           'is_active', p.is_active,
           -- What the directory is actually asked at a glance: is this one already booked for a closing?
           'open_appointments', (select count(*)::integer from public.legal_appointments a
                                 where a.partner_id = p.id and a.status = 'scheduled'))
         order by p.is_active desc, p.is_available desc, p.full_name), '[]'::jsonb)
  into v_rows
  from public.partners p
  where (p_include_archived or p.is_active)
    and (p_speciality is null or p.speciality_option_id = p_speciality)
    and (p_governorate is null or p.governorate_id = p_governorate)
    and (v_q is null or p.full_name ilike '%' || v_q || '%' or coalesce(p.office_name, '') ilike '%' || v_q || '%'
         or coalesce(p.phone_e164, '') like '%' || v_q || '%');

  return jsonb_build_object(
    'rows', v_rows,
    'specialities', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'label_ar', o.label_ar)
             order by o.sort_order, o.label_ar)
      from public.option_items o where o.list_key = 'partner_speciality' and o.is_active), '[]'::jsonb),
    'governorates', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar) order by g.sort_order, g.name_ar)
      from public.governorates g where g.is_active), '[]'::jsonb));
end $$;
revoke execute on function public.staff_partners(uuid, smallint, text, boolean) from public, anon;
grant execute on function public.staff_partners(uuid, smallint, text, boolean) to authenticated;

comment on function public.staff_partners(uuid, smallint, text, boolean) is
  '§18''s directory: المحامون وعدول الإشهاد والخبراء والمسّاحون, with the owner''s speciality list and the governorates beside them so a form never hard-codes either. Legal, Finance and Admin only — it holds third partiesّ personal numbers.';

-- The checklist template, for the settings screen that edits it.
create or replace function public.staff_legal_checklist_template(p_include_inactive boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'can_edit', app.is_admin(),
    'gate_labels', coalesce(app.setting('legal.gate_labels'), '{}'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'code', i.code, 'label_ar', i.label_ar, 'help_ar', i.help_ar,
               'is_mandatory', i.is_mandatory, 'required_at', i.required_at::text,
               'sort_order', i.sort_order, 'is_active', i.is_active)
             order by i.required_at, i.sort_order, i.label_ar)
      from public.legal_checklist_items i
      where p_include_inactive or i.is_active), '[]'::jsonb));
end $$;
revoke execute on function public.staff_legal_checklist_template(boolean) from public, anon;
grant execute on function public.staff_legal_checklist_template(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 13 · Writers — every one audited, every one with its reason
-- ---------------------------------------------------------------------------

-- Opening the file IS the snapshot. §16 says the file moves «automatically»; the QUEUE is automatic (it is a
-- query over the deposit), and this is the first deliberate act of the desk. Idempotent: pressing it twice
-- returns the file that already exists rather than a second one, which the unique key would refuse anyway.
create or replace function public.staff_open_legal_file(p_reservation uuid, p_note text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r public.reservations;
  v_f public.legal_files;
  v_n integer := 0;
begin
  select * into v_r from public.reservations r where r.id = p_reservation for no key update;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_r.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- §16's own door, checked here and not only on the screen: Legal receives a file when the عربون is paid.
  if v_r.deposit_paid_at is null and v_r.status not in ('deposit_paid', 'converted') then
    raise exception 'deposit_not_paid' using errcode = 'P0001';
  end if;
  if v_r.status in ('expired', 'cancelled') then
    raise exception 'reservation_not_open' using errcode = 'P0001';
  end if;

  select * into v_f from public.legal_files f where f.reservation_id = p_reservation;
  if found then
    return app.legal_file_payload(p_reservation);
  end if;

  insert into public.legal_files (reservation_id, person_id, project_id, opened_by, note, updated_by)
  values (v_r.id, v_r.person_id, v_r.project_id, auth.uid(),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning * into v_f;

  -- THE SNAPSHOT (decision 4 of the header). The active template, copied wording and all. From this moment
  -- the template can be edited freely without reaching this file.
  insert into public.legal_file_checks (legal_file_id, item_id, code, label_ar, is_mandatory, required_at, sort_order)
  select v_f.id, i.id, i.code, i.label_ar, i.is_mandatory, i.required_at, i.sort_order
  from public.legal_checklist_items i where i.is_active;
  get diagnostics v_n = row_count;

  -- ONE audit row for the whole act, not one per item: the same reasoning 0054 gives for generating trees.
  perform app.write_audit('legal.file_open', 'legal_files', v_f.id::text, null,
                          jsonb_build_object('reservation_id', v_r.id, 'person_id', v_r.person_id,
                                             'project_id', v_r.project_id, 'checks_copied', v_n), null);

  return app.legal_file_payload(p_reservation);
end $$;
revoke execute on function public.staff_open_legal_file(uuid, text, text) from public, anon;
grant execute on function public.staff_open_legal_file(uuid, text, text) to authenticated;

comment on function public.staff_open_legal_file(uuid, text, text) is
  'Opens the legal file for a reservation whose عربون has been paid (§16) and copies §20''s active checklist onto it. Idempotent. The copy is what makes a later edit of the template harmless to this file.';

-- Ticking one item. The only act that moves §20's rule, and it is a human one.
create or replace function public.staff_set_legal_check(
  p_check uuid, p_done boolean, p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_k public.legal_file_checks;
  v_f public.legal_files;
begin
  select * into v_k from public.legal_file_checks k where k.id = p_check for update;
  if not found then
    raise exception 'legal_check_not_found' using errcode = 'P0001';
  end if;
  select * into v_f from public.legal_files f where f.id = v_k.legal_file_id;
  if not (app.can_contract_trees() and app.can_see_person(v_f.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_k.waived_at is not null then
    raise exception 'legal_check_waived' using errcode = 'P0001';
  end if;
  -- Un-ticking an item whose gate has already been passed would claim a contract was signed without a paper
  -- that was, at the time, verified. The history is what it is; add a note instead.
  if not p_done and app.legal_gate_passed(v_f.reservation_id, v_k.required_at) then
    raise exception 'legal_check_locked' using errcode = 'P0001';
  end if;

  update public.legal_file_checks k
     set done_at = case when p_done then coalesce(k.done_at, now()) end,
         done_by = case when p_done then coalesce(k.done_by, auth.uid()) end,
         note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_by = auth.uid()
   where k.id = p_check;

  return app.legal_checklist_state(v_k.legal_file_id);
end $$;
revoke execute on function public.staff_set_legal_check(uuid, boolean, text, text) from public, anon;
grant execute on function public.staff_set_legal_check(uuid, boolean, text, text) to authenticated;

-- The recorded exception (setting legal.allow_waiver). Admin only, with a reason, and audited.
create or replace function public.staff_waive_legal_check(p_check uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_k public.legal_file_checks;
  v_f public.legal_files;
begin
  select * into v_k from public.legal_file_checks k where k.id = p_check for update;
  if not found then
    raise exception 'legal_check_not_found' using errcode = 'P0001';
  end if;
  select * into v_f from public.legal_files f where f.id = v_k.legal_file_id;
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.setting_bool('legal.allow_waiver', true) then
    raise exception 'legal_waiver_closed' using errcode = 'P0001';
  end if;
  -- A waiver is the one act in this file whose whole value is the sentence written on it, so it demands one
  -- of its own even when audit.reason_min_length is zero.
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'legal_waive_reason_required' using errcode = 'P0001';
  end if;
  perform app.set_reason(p_reason);

  if v_k.done_at is not null then
    raise exception 'legal_check_done' using errcode = 'P0001';
  end if;
  if app.legal_gate_passed(v_f.reservation_id, v_k.required_at) then
    raise exception 'legal_check_locked' using errcode = 'P0001';
  end if;

  update public.legal_file_checks k
     set waived_at = now(), waived_by = auth.uid(),
         waive_reason = btrim(p_reason), updated_by = auth.uid()
   where k.id = p_check;

  return app.legal_checklist_state(v_k.legal_file_id);
end $$;
revoke execute on function public.staff_waive_legal_check(uuid, text) from public, anon;
grant execute on function public.staff_waive_legal_check(uuid, text) to authenticated;

comment on function public.staff_waive_legal_check(uuid, text) is
  'Marks one mandatory item as «does not apply here», with a written reason, by an Admin only. It is the recorded exception §20 needs in order to stay a rule: without one, the first awkward file is closed by switching the whole checklist off. Refused once the gate has passed, and refused entirely when settings legal.allow_waiver is off.';

-- Pulling newly added template items onto a file that is still open. Deliberate, never automatic, and never
-- behind a gate that has already been passed — decision 4 of the header, enforced.
create or replace function public.staff_legal_sync_items(p_file uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_f public.legal_files;
  v_n integer := 0;
begin
  select * into v_f from public.legal_files f where f.id = p_file for no key update;
  if not found then
    raise exception 'legal_file_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_f.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  insert into public.legal_file_checks (legal_file_id, item_id, code, label_ar, is_mandatory, required_at, sort_order)
  select v_f.id, i.id, i.code, i.label_ar, i.is_mandatory, i.required_at, i.sort_order
  from public.legal_checklist_items i
  where i.is_active
    and not exists (select 1 from public.legal_file_checks k
                    where k.legal_file_id = v_f.id and k.code = i.code)
    -- THE LINE THAT KEEPS A CLOSED FILE CLOSED. An item for a moment that has already happened is not added,
    -- because it could only ever be «missing» — retroactively, for a decision nobody can now go back and make.
    and not app.legal_gate_passed(v_f.reservation_id, i.required_at);
  get diagnostics v_n = row_count;

  perform app.write_audit('legal.file_sync', 'legal_files', v_f.id::text, null,
                          jsonb_build_object('checks_added', v_n), null);

  return jsonb_build_object('added', v_n, 'checklist', app.legal_checklist_state(v_f.id));
end $$;
revoke execute on function public.staff_legal_sync_items(uuid, text) from public, anon;
grant execute on function public.staff_legal_sync_items(uuid, text) to authenticated;

comment on function public.staff_legal_sync_items(uuid, text) is
  'Adds checklist items the owner created after this file was opened. A deliberate act, never a trigger, and never for a gate that has already been passed — which is how «adding an item later does not retroactively break a closed file» is enforced rather than promised.';

-- §20's TEMPLATE, written. Admin only, because a row here is a rule and not a label: moving an item from
-- «قبل الإمضاء» to «قبل ما يتكتب العقد» changes the moment the database refuses a sale.
--
-- EDITING A TEMPLATE ROW NEVER REACHES A FILE THAT EXISTS. Every open file already carries its own copy
-- (public.legal_file_checks), and the gate reads only the copy — so renaming an item, making it optional or
-- deactivating it changes what the NEXT file is opened with and nothing else. That is the same property from
-- the other direction: adding an item cannot break a closed file, and removing one cannot silently unblock
-- one that was already refused.
create or replace function public.staff_save_checklist_item(p jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid := nullif(btrim(coalesce(p->>'id', '')), '')::uuid;
  v_code  text := lower(nullif(btrim(coalesce(p->>'code', '')), ''));
  v_label text := nullif(btrim(coalesce(p->>'label_ar', '')), '');
  v_gate  text := lower(nullif(btrim(coalesce(p->>'required_at', '')), ''));
  v_row   public.legal_checklist_items;
  v_old   public.legal_checklist_items;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_label is null or char_length(v_label) < 2 then
    raise exception 'invalid_checklist_label' using errcode = 'P0001';
  end if;
  if v_gate is null or v_gate not in ('contract', 'signature', 'ownership') then
    raise exception 'invalid_checklist_gate' using errcode = 'P0001';
  end if;

  if v_id is null then
    -- The code is a stable handle, never branched on. Generated when the owner does not give one, so adding
    -- an item is one Arabic sentence and not a lesson in slugs.
    if v_code is null then
      v_code := 'item_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    end if;
    if exists (select 1 from public.legal_checklist_items i where i.code = v_code) then
      raise exception 'duplicate_code' using errcode = 'P0001';
    end if;
    insert into public.legal_checklist_items (code, label_ar, help_ar, is_mandatory, required_at, sort_order, is_active, updated_by)
    values (v_code, v_label,
            nullif(btrim(coalesce(p->>'help_ar', '')), ''),
            coalesce((p->>'is_mandatory')::boolean, true),
            v_gate::public.legal_gate,
            coalesce((p->>'sort_order')::integer, 0),
            coalesce((p->>'is_active')::boolean, true),
            auth.uid())
    returning * into v_row;
    perform app.write_audit('legal.item_create', 'legal_checklist_items', v_row.id::text, null, to_jsonb(v_row), null);
  else
    select * into v_old from public.legal_checklist_items i where i.id = v_id for update;
    if not found then
      raise exception 'checklist_item_not_found' using errcode = 'P0001';
    end if;
    -- The code stays as it was: it is what a file's copy points back at, and renaming it would orphan every
    -- copy ever taken. The Arabic is the part that is meant to be edited.
    update public.legal_checklist_items i
       set label_ar = v_label,
           help_ar = nullif(btrim(coalesce(p->>'help_ar', '')), ''),
           is_mandatory = coalesce((p->>'is_mandatory')::boolean, i.is_mandatory),
           required_at = v_gate::public.legal_gate,
           sort_order = coalesce((p->>'sort_order')::integer, i.sort_order),
           is_active = coalesce((p->>'is_active')::boolean, i.is_active),
           updated_by = auth.uid()
     where i.id = v_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end $$;
revoke execute on function public.staff_save_checklist_item(jsonb, text) from public, anon;
grant execute on function public.staff_save_checklist_item(jsonb, text) to authenticated;

comment on function public.staff_save_checklist_item(jsonb, text) is
  'Adds or edits one row of §20''s checklist template. Admin only, with a reason and an audit row, because the row is a rule: `is_mandatory` and `required_at` decide when the database refuses a contract, a signature or an ownership. It never reaches a file that already exists — every file carries its own copy.';

-- §18's directory, written. One function for create and edit: the fields are identical and two would drift.
create or replace function public.staff_save_partner(p jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid := nullif(btrim(coalesce(p->>'id', '')), '')::uuid;
  v_name  text := nullif(btrim(coalesce(p->>'full_name', '')), '');
  v_phone text := nullif(btrim(coalesce(p->>'phone_e164', '')), '');
  v_spec  public.option_items;
  v_gov   smallint := nullif(btrim(coalesce(p->>'governorate_id', '')), '')::smallint;
  v_old   public.partners;
  v_row   public.partners;
begin
  if not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_name is null or char_length(v_name) < 2 then
    raise exception 'invalid_partner_name' using errcode = 'P0001';
  end if;
  if v_phone is not null then
    perform app.assert_phone(v_phone, 'invalid_phone');
  end if;
  if nullif(btrim(coalesce(p->>'speciality_option_id', '')), '') is not null then
    v_spec := app.active_option('partner_speciality', p->>'speciality_option_id');
    if v_spec.id is null then
      raise exception 'invalid_partner_speciality' using errcode = 'P0001';
    end if;
  end if;
  if v_gov is not null and not exists (select 1 from public.governorates g where g.id = v_gov and g.is_active) then
    raise exception 'invalid_governorate' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.partners (
      full_name, phone_e164, email, office_name, governorate_id,
      speciality_option_id, speciality_label_ar,
      is_available, availability_note, note, created_by, updated_by)
    values (
      v_name, v_phone,
      nullif(btrim(coalesce(p->>'email', '')), ''),
      nullif(btrim(coalesce(p->>'office_name', '')), ''),
      v_gov, v_spec.id, v_spec.label_ar,
      coalesce((p->>'is_available')::boolean, true),
      nullif(btrim(coalesce(p->>'availability_note', '')), ''),
      nullif(btrim(coalesce(p->>'note', '')), ''),
      auth.uid(), auth.uid())
    returning * into v_row;

    perform app.write_audit('partners.create', 'partners', v_row.id::text, null, to_jsonb(v_row), null);
  else
    select * into v_old from public.partners x where x.id = v_id for update;
    if not found then
      raise exception 'partner_not_found' using errcode = 'P0001';
    end if;
    update public.partners x
       set full_name = v_name,
           phone_e164 = v_phone,
           email = nullif(btrim(coalesce(p->>'email', '')), ''),
           office_name = nullif(btrim(coalesce(p->>'office_name', '')), ''),
           governorate_id = v_gov,
           speciality_option_id = v_spec.id,
           -- Re-snapshotted on an edit, because an edit is a staff member looking at the row now.
           speciality_label_ar = v_spec.label_ar,
           is_available = coalesce((p->>'is_available')::boolean, x.is_available),
           availability_note = nullif(btrim(coalesce(p->>'availability_note', '')), ''),
           note = nullif(btrim(coalesce(p->>'note', '')), ''),
           updated_by = auth.uid()
     where x.id = v_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end $$;
revoke execute on function public.staff_save_partner(jsonb, text) from public, anon;
grant execute on function public.staff_save_partner(jsonb, text) to authenticated;

comment on function public.staff_save_partner(jsonb, text) is
  'Adds or edits one partner (§18). The speciality must be an active row of the owner''s option list partner_speciality and its Arabic is snapshot onto the row; the region is a governorate. The phone is checked by app.assert_phone, which already honours the owner''s lead.allow_international_phone setting.';

create or replace function public.staff_archive_partner(p_partner uuid, p_active boolean, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.partners;
begin
  if not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  select * into v_row from public.partners x where x.id = p_partner for update;
  if not found then
    raise exception 'partner_not_found' using errcode = 'P0001';
  end if;
  -- Archiving somebody who is expected at a closing next week would blank a name nobody can then look up.
  if not p_active and exists (select 1 from public.legal_appointments a
                              where a.partner_id = p_partner and a.status = 'scheduled') then
    raise exception 'partner_has_appointments' using errcode = 'P0001';
  end if;

  update public.partners x set is_active = p_active, updated_by = auth.uid() where x.id = p_partner
  returning * into v_row;
  return to_jsonb(v_row);
end $$;
revoke execute on function public.staff_archive_partner(uuid, boolean, text) from public, anon;
grant execute on function public.staff_archive_partner(uuid, boolean, text) to authenticated;

-- §19 · booking and rescheduling the closing. One function, because they are the same act with the same
-- fields, and the audit row already records which it was.
create or replace function public.staff_book_closing(p jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id      uuid := nullif(btrim(coalesce(p->>'id', '')), '')::uuid;
  v_file    uuid := nullif(btrim(coalesce(p->>'legal_file_id', '')), '')::uuid;
  v_f       public.legal_files;
  v_day     date := nullif(btrim(coalesce(p->>'meet_on', '')), '')::date;
  v_time    time := nullif(btrim(coalesce(p->>'meet_at', '')), '')::time;
  v_partner public.partners;
  v_min     date := app.tunis_today() + app.setting_int('legal.appointment_min_lead_days', 0);
  v_max     date := app.tunis_today() + app.setting_int('legal.appointment_max_ahead_days', 180);
  v_row     public.legal_appointments;
  v_person  public.persons;
begin
  if v_id is not null then
    select f.* into v_f from public.legal_appointments a join public.legal_files f on f.id = a.legal_file_id
    where a.id = v_id;
  else
    select * into v_f from public.legal_files f where f.id = v_file;
  end if;
  if v_f.id is null then
    raise exception 'legal_file_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_f.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_day is null then
    raise exception 'appointment_date_required' using errcode = 'P0001';
  end if;
  if v_day < v_min then
    raise exception 'appointment_date_too_soon' using errcode = 'P0001';
  end if;
  if v_day > v_max then
    raise exception 'appointment_date_too_far' using errcode = 'P0001';
  end if;

  if nullif(btrim(coalesce(p->>'partner_id', '')), '') is not null then
    select * into v_partner from public.partners x where x.id = (p->>'partner_id')::uuid;
    if v_partner.id is null then
      raise exception 'partner_not_found' using errcode = 'P0001';
    end if;
    if not v_partner.is_active then
      raise exception 'partner_archived' using errcode = 'P0001';
    end if;
  end if;

  if v_id is null then
    -- The partial unique index refuses a second open appointment; this names the refusal in Arabic first.
    if exists (select 1 from public.legal_appointments a
               where a.legal_file_id = v_f.id and a.status = 'scheduled') then
      raise exception 'appointment_already_open' using errcode = 'P0001';
    end if;
    insert into public.legal_appointments (
      legal_file_id, person_id, meet_on, meet_at, place, partner_id, partner_label_ar,
      documents_note, note, created_by, updated_by)
    values (
      v_f.id, v_f.person_id, v_day, v_time,
      nullif(btrim(coalesce(p->>'place', '')), ''),
      v_partner.id, v_partner.full_name,
      nullif(btrim(coalesce(p->>'documents_note', '')), ''),
      nullif(btrim(coalesce(p->>'note', '')), ''),
      auth.uid(), auth.uid())
    returning * into v_row;
  else
    select * into v_row from public.legal_appointments a where a.id = v_id for update;
    if v_row.status <> 'scheduled' then
      raise exception 'appointment_not_open' using errcode = 'P0001';
    end if;
    update public.legal_appointments a
       set meet_on = v_day, meet_at = v_time,
           place = nullif(btrim(coalesce(p->>'place', '')), ''),
           partner_id = v_partner.id,
           partner_label_ar = v_partner.full_name,
           documents_note = nullif(btrim(coalesce(p->>'documents_note', '')), ''),
           note = nullif(btrim(coalesce(p->>'note', '')), ''),
           updated_by = auth.uid()
     where a.id = v_id
    returning * into v_row;
  end if;

  -- §19's «ويمكن إرسال إشعار». Enqueued; there is no sending worker, so no screen may claim delivery.
  select * into v_person from public.persons ps where ps.id = v_f.person_id;
  perform app.enqueue_message('legal.appointment_set', v_person.phone_e164,
            jsonb_build_object('name', v_person.full_name,
                               'date', to_char(v_day, 'YYYY-MM-DD'),
                               'time', coalesce(to_char(v_time, 'HH24:MI'), '—'),
                               'place', coalesce(nullif(btrim(coalesce(p->>'place', '')), ''), '—')),
            'legal_appointments', v_row.id);

  return app.legal_file_payload(v_f.reservation_id);
end $$;
revoke execute on function public.staff_book_closing(jsonb, text) from public, anon;
grant execute on function public.staff_book_closing(jsonb, text) to authenticated;

comment on function public.staff_book_closing(jsonb, text) is
  'Books or moves the closing appointment (§19): date, hour, place, the partner and the documents required. One open appointment per file. Nothing here moves the client''s status: «موعد العقد محدد» is DERIVED from this row by app.legal_stage, which is how §29 should read it too.';

create or replace function public.staff_close_appointment(
  p_appointment uuid, p_status text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.legal_appointments;
  v_f public.legal_files;
begin
  if p_status not in ('completed', 'cancelled') then
    raise exception 'invalid_appointment_status' using errcode = 'P0001';
  end if;
  select * into v_a from public.legal_appointments a where a.id = p_appointment for update;
  if not found then
    raise exception 'appointment_not_found' using errcode = 'P0001';
  end if;
  select * into v_f from public.legal_files f where f.id = v_a.legal_file_id;
  if not (app.can_contract_trees() and app.can_see_person(v_f.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_a.status <> 'scheduled' then
    raise exception 'appointment_not_open' using errcode = 'P0001';
  end if;

  update public.legal_appointments a
     set status = p_status::public.legal_appointment_status,
         closed_at = now(), closed_by = auth.uid(),
         cancel_reason = case when p_status = 'cancelled'
                              then nullif(btrim(coalesce(p_reason, '')), '') end,
         updated_by = auth.uid()
   where a.id = p_appointment;

  return app.legal_file_payload(v_f.reservation_id);
end $$;
revoke execute on function public.staff_close_appointment(uuid, text, text) from public, anon;
grant execute on function public.staff_close_appointment(uuid, text, text) to authenticated;

comment on function public.staff_close_appointment(uuid, text, text) is
  'Records what happened to a closing appointment: it took place, or it was cancelled. A human act — nothing in this product moves an appointment because its day passed, which is the same refusal 0063 and bb_60 both make about timers.';

create or replace function public.staff_set_legal_note(p_file uuid, p_note text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_f public.legal_files;
begin
  select * into v_f from public.legal_files f where f.id = p_file for update;
  if not found then
    raise exception 'legal_file_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_f.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);
  update public.legal_files f set note = nullif(btrim(coalesce(p_note, '')), ''), updated_by = auth.uid()
  where f.id = p_file;
  return app.legal_file_payload(v_f.reservation_id);
end $$;
revoke execute on function public.staff_set_legal_note(uuid, text, text) from public, anon;
grant execute on function public.staff_set_legal_note(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 14 · Every code this file raises, for the desk's own Arabic map
-- ---------------------------------------------------------------------------
--
-- They live in a local LEGAL_MESSAGES map in src/app/admin/(panel)/desk/legal/actions.ts, NOT in
-- src/lib/errors.ts — the visits and reservations modules both document why (several sessions share that file
-- and a module that can name itself should). Every sentence says what went wrong AND what to do.
--
-- ███ THE FOUR STARRED CODES ALSO REACH THE CONTRACTS MODULE, because the trigger of §9 raises them inside
-- ███ bb_60's own staff_create_contract / staff_sign_contract / staff_set_contract_owned. Whoever owns
-- ███ src/app/admin/(panel)/contracts/actions.ts must add them to CONTRACT_MESSAGES as well, or Legal will
-- ███ read «تعذّر الحفظ» at the exact moment the product should be naming the missing paper.
--
--   ███ legal_checklist_incomplete   «ما تنجمش تكمّل: فما بنود إجبارية في القائمة القانونية مازالت ما
--                                     تثبّتناش فيهم — {details}. علّمهم في الملف القانوني ثم أعد المحاولة.»
--                                     The missing items arrive in the error's DETAIL and the gate in its HINT.
--   ███ legal_file_required          settings legal.require_open_file_at names this gate: open the legal file
--                                     first, or change that setting.
--   ███ deposit_not_paid             §16's door: Legal receives a file once the عربون is recorded.
--   ███ reservation_not_open         the hold expired or was cancelled; there is nothing to close.
--   legal_file_not_found             reload; the file was not opened, or it was opened on another reservation.
--   legal_check_not_found            the item disappeared under the screen — the owner deactivated it, or the
--                                     file was reopened; reload.
--   legal_check_waived               an admin marked it «does not apply»; lift the waiver before ticking it.
--   legal_check_done                 it is already ticked; untick it before waiving it.
--   legal_check_locked               the moment this item guarded has already happened. History is not edited
--                                     backwards; write a note instead.
--   legal_waiver_closed              settings legal.allow_waiver is off; turn it on, or produce the paper.
--   legal_waive_reason_required      a waiver needs a written reason of at least ten characters — it is the
--                                     only trace the exception leaves.
--   invalid_legal_filter             a filter the reader does not know; reload the queue.
--   invalid_checklist_label          write the item as the team will read it (two characters at least).
--   invalid_checklist_gate           an item blocks one of three moments: before the contract, before the
--                                     signature, before ownership.
--   checklist_item_not_found         reload the template.
--   duplicate_code                   already in src/lib/errors.ts, reused: that handle is taken.
--   invalid_partner_name             write the partner's full name (two characters at least).
--   invalid_partner_speciality       the speciality is not an active row of partner_speciality; add it in
--                                     الإعدادات ← القوائم first.
--   partner_not_found                reload the directory.
--   partner_archived                 an archived partner cannot be booked; reactivate them, or pick another.
--   partner_has_appointments         they are expected at a closing; move or cancel it before archiving them.
--   appointment_date_required        pick the day of the closing.
--   appointment_date_too_soon        earlier than settings legal.appointment_min_lead_days allows.
--   appointment_date_too_far         further ahead than settings legal.appointment_max_ahead_days allows.
--   appointment_already_open         this file already has an open appointment; move it instead of adding one.
--   appointment_not_open             it is already done or cancelled; book a new one.
--   appointment_not_found            reload.
--   invalid_appointment_status       only «تمّ» and «تلغى» close an appointment.
--   reservation_not_found            reload the queue.
--   invalid_phone / phone_not_tunisian / invalid_governorate / forbidden / reason_required
--                                    already in src/lib/errors.ts, unchanged, and reused on purpose.
