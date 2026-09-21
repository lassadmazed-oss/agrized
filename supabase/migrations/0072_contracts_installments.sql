-- 0072 · العقود ووعد البيع + الأقساط — the two modules that turn a hold into a sale and a sale into a schedule.
-- Report v3 §28 (العقود), §29 (الأقساط), §30 (طرق الدفع), §31 (التأخير في الدفع); cahier v2 §34 (Promise to
-- Sell), §35 (الأقساط), §36 (التأخير), §38 (التملّك). Module flags: `contracts` and `installments`, BOTH left
-- 'disabled' — the owner presses the switch himself.
--
-- ███ DRAFT — NOT APPLIED, NOT NUMBERED. The session owner applies it after reading. When it is applied,
-- ███ rename it to supabase/migrations/00NN_contracts_installments.sql and write the new number into the first
-- ███ line of this file and of supabase/tests/045_contracts_installments.sql, which keeps its number.
-- ███ Until then that test file is RED on a live database and its message names this draft.
-- ███ Dry-run:  node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_60_contracts_installments.sql \
-- ███                                                        supabase/tests/045_contracts_installments.sql
--
-- WHAT THIS IS WIRING AND NOT INVENTION. 0063 left exactly one door and closed every other: reservation_status
-- carries 'converted', nothing in the database writes it, and staff_close_reservation refuses it by name above
-- the comment «'converted' belongs to the contract (§14/§28) and is set by stage 3, not from this screen». The
-- Back Office already tells staff «تحويلو لعقد يصير من وحدة العقود كي تتبنى». public.payments was shaped for
-- this: reservation_id is already nullable «because stage 3 records a payment against a contract that has no
-- reservation behind it», and payment_kind already carries 'down_payment' and 'installment' with their Arabic
-- already seeded in settings payments.kind_labels. This file keeps those promises and adds no second answer to
-- any question 0054 or 0063 already answers.
--
-- ONE TRANSACTION, THREE FACTS. Writing a contract (a) creates the contract, (b) sets its reservation to
-- 'converted' with closed_at — reservations_closed_check is a biconditional, so forgetting closed_at fails at
-- commit with a raw constraint error nobody has an Arabic sentence for — and (c) moves that reservation's
-- still-held trees from 'reserved' to 'sold'. Doing (a) and (c) as two RPCs from TypeScript is exactly the
-- split 0063 warns about for cancel/release: the first call succeeds, the second is refused, and a contract
-- exists whose trees were never sold. public.staff_set_tree_state is deliberately NOT called — it takes an
-- explicit uuid[] capped at 1000, and one live offer holds 8,000 trees. app.sell_reservation_trees below
-- selects the reservation's own trees, locks them in id order (the same ordering staff_close_reservation uses,
-- so the two queue instead of deadlocking) and updates them in place. The app.trees_clear_reservation trigger
-- only nulls reservation_id on state 'available', so the tree → reservation → contract chain survives the sale.
--
-- THE SNAPSHOT, AND WHY IT IS NOT A RE-READ. public.interest_requests stores payment_mode,
-- down_payment_amount_millimes, duration_months, monthly_millimes and total_financed_millimes — but NOT
-- remaining_millimes, installments_count or last_installment_millimes (0061 says so in its own comment). And
-- app.financed_quote rounds the monthly UP, then recomputes installments_count = ceil(remaining / monthly), so
-- the count can be SHORTER than the duration and the last instalment differs from the others. A schedule built
-- as monthly × duration_months overcharges: on this database's own rows, AGZ-2026-000033 (remaining 6,528,000
-- over 84 months) would bill 78,000 × 84 = 6,552,000 — 24,000 millimes too much — when its true last
-- instalment is 54,000. Four of the five live instalment plans are affected. So the contract calls
-- app.financed_quote ONCE, at creation, snapshots all ten keys, and the schedule is generated from those
-- stored columns. It is never called again: financed_quote reads public.financing_markups and
-- public.tree_pricing_rules, which the owner edits, and re-reading it would let a client's agreed monthly move
-- between the offer and the signature. Nothing in this file divides, rounds or multiplies a plan figure.
--
-- WHAT IS DERIVED AND WHAT IS STORED. A schedule row stores WHAT IS OWED AND WHEN — seq, due_on,
-- amount_millimes — and nothing else. Paid / partial / unpaid, the remaining balance (v2 §35), lateness and
-- the §31 stage are all COMPUTED, in Postgres, from the live non-voided rows of public.payments, exactly as
-- 0063 derives «Deposit Paid». 0066 shows the other road: public.subscriptions carries its own payment_status
-- text set by a human and records no dinar in public.payments, and that migration's own comment admits the
-- intended fix. A paid flag on a schedule row is a column a void can falsify and a column a midnight job has
-- to maintain; §31 is emphatic twice, in both documents, that nothing may act on a timer: «لا يوجد فسخ آلي»
-- and «ما نخليوش النظام يلغي الملكية أو العقد قانونياً وحده». There is no cron, no trigger and no scheduled
-- job in this file. Every state change is a human act through a security-definer RPC with a reason and an
-- audit row, which is also what v3 §58 asks for by name: «من عدل القسط؟ من حمل العقد؟ من سجل الدفعة؟»
--
-- WHAT THE SPEC DECIDES, AND WHAT IS ONLY AN EXAMPLE.
--   DECIDED — v2 §34 lists the eight things a «وعد بالبيع» holds, without «مثلاً»: Customer · Parcel · Total
--     Price · Down Payment · Payment Plan · Payment Method · Legal document reference · Signature Date. All
--     eight are columns below. v2 §49 states the cardinality flatly — «Contract → Reservation», «PaymentPlan →
--     Contract» — so reservation_id is NOT NULL and unique: one contract per reservation, and a client holding
--     two reservations gets two contracts.
--   DECIDED — v3 §29: the schedule is generated AFTER the contract, and each line carries seven fields. Four
--     of the seven (payment date, method, receipt, reference bancaire) are properties of a PAYMENT, not of a
--     line, and are read through public.payments rather than copied onto the line.
--   DECIDED — v3 §31: two named stages, «Late Payment 1» after the first missed instalment and «Critical /
--     Contract Review» after the second, then a human legal decision outside the automation.
--   EXAMPLE, NOT LAW — the «شهرين» rule of §31 is introduced as «ناقشنا قاعدة تجارية» and immediately replaced
--     by the staged design the spec itself calls «الصحيح تقنياً». Both thresholds are settings below and no
--     number from that passage appears as a constant. The «1,000 د / 60 شهر» schedule of §29 is «مثال». The
--     whole client pipeline of §27 is «مثلاً». The reference format AZ-2026-001854 of v2 §19 is «مثلاً» and the
--     owner has already departed from it — the live setting is request_no.prefix = 'AGZ', not 'AZ' — which is
--     direct evidence the prefix is a setting and the example was never law.
--   NOT IN EITHER DOCUMENT — who signs, and whether the platform signs anything. v2 §34 asks only for a DATE
--     and a TEXT reference, and v3 §45 gives the commercial «Generate Contract Request» — a request, not an
--     issuance. So there is no e-signature here: signed_on is a date a human enters and legal_document_ref is
--     the notary or registry number they type. The database never infers a signature from anything.
--   NOT IN EITHER DOCUMENT — a grace period. v2 §36 says «بعده: Overdue» with no delay. A virement in Tunisia
--     commonly takes a day, so zero grace would make a client who paid on the due date Overdue the next
--     morning. installments.grace_days_after exists, defaults to 0, and is returned on every payload so the
--     screen can print it beside the late queue rather than leave it assumed.
--
-- ███ TWO QUESTIONS ONLY THE OWNER CAN ANSWER. Both are seeded so the software cannot guess:
-- ███ 1. ON WHAT DATE IS THE FIRST INSTALMENT DUE? Neither document says, and every stage of §31 counts from
-- ███    it. installments.first_due_rule is seeded 'manual', which means Finance types the date on each
-- ███    contract and nothing is assumed. The three choices are named in the setting's description:
-- ███    'signature_plus_month' (signature + one month, rolling) · 'first_of_next_month' (the 1st of the month
-- ███    after signature) · 'manual'. Changing the answer is a Back Office edit, not a migration.
-- ███ 2. DOES THE عربون COUNT TOWARD THE DOWN PAYMENT? §23 makes the عربون a reservation fee; v2 §34 asks the
-- ███    contract for a Down Payment. Neither says whether the one is deducted from the other.
-- ███    contracts.deposit_counts_toward_down_payment is seeded FALSE — the عربون stays a separate fee — and
-- ███    both figures are shown side by side on every payload, never summed silently. payment_kind already
-- ███    separates 'deposit' from 'down_payment', so either answer costs one setting and no migration.
--
-- ███ A LIVE PUBLIC SIDE EFFECT THE OWNER MUST KNOW BEFORE THE FIRST REAL CONTRACT. public.million_progress()
-- ███ counts trees_contracted as «count(*) filter (where tr.state = 'sold')» (0059, unchanged in 0071), and
-- ███ settings million.tile_contracted_label reads «زيتونات تم التعاقد عليها». That tile is gated by the flag
-- ███ `public_statistics`, NOT by `contracts`, so the first contract ever written moves the public home-page
-- ███ counter even while this module is switched off. That is correct — v2 §6 says the counter counts stages —
-- ███ but it is not obvious, and it is not something this file should decouple silently. Today all 8,600 trees
-- ███ are 'available' and the tile reads 0.
--
-- TYPESCRIPT THAT MUST FOLLOW (npm run db:types first; none of it is in this file's hands):
--   1. npm run db:types                    public.contracts, public.contract_installments and the RPCs appear.
--   2. src/lib/auth.ts                     export CONTRACT_ROLES = ["legal","finance","admin","super_admin"],
--                                          the mirror of app.can_contract_trees() (0054:85). It is TODAY a
--                                          private const duplicated in leads/[personId]/page.tsx and
--                                          projects/actions.ts — a third copy is how the screen and the
--                                          database end up disagreeing about who may sign. PRICE_ROLES is
--                                          already exactly app.can_record_money() and is reused unchanged.
--   3. the module's own actions.ts         a local CONTRACT_MESSAGES / INSTALMENT_MESSAGES map, NOT
--                                          src/lib/errors.ts — reservations/actions.ts documents why (three
--                                          sessions share that file, and module_closed is deliberately
--                                          module-neutral there so a module that can name itself does). Every
--                                          code raised below needs a sentence saying what went wrong AND what
--                                          to do; they are all listed in §11 at the foot of this file.
--   4. src/lib/modules-catalog.ts          add "contracts" and "installments" to IMPLEMENTED_MODULES — and
--                                          ONLY after this draft is applied. That file's own comment records
--                                          the stage-4 lesson in both directions: a key missing from the array
--                                          draws no switch at all, and a key present before its tables exist
--                                          gives the owner a switch that breaks the screens.
--   5. src/components/admin/nav-model.ts   "/admin/contracts": "العقود ووعد البيع" in ADMIN_LABELS (the icon
--                                          keys "contracts" and "payments" already exist), plus one row in
--                                          src/app/admin/(panel)/layout.tsx with flag: "contracts".
--   6. 0068's two labelled sockets         staff_zitounti_file still says
--                                          app.zitounti_section(case when app.module_open('contracts') then
--                                          'not_built' else 'phase_later' end, null) for 'contracts' and again
--                                          for 'installments'. app.zitounti_contracts and
--                                          app.zitounti_installments below fill them; the two-line swap
--                                          belongs to whoever owns 0068, because replacing that whole function
--                                          from here would collide with another session.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT BUILD.
--   · No documents table and no storage bucket. v3 §28 opens «لازم يكون لكل حريف Documents section» and v2 §45
--     lists eight kinds the system must store — a real, spec-required gap that the signed «وعد بالبيع» makes
--     visible first. But a general document shelf is the whole product's, not this module's, and a public
--     bucket is the wrong home for a legal paper. v2 §34's own field — legal_document_ref — records where the
--     paper is, which is what the spec asks the contract for. The shelf is separate work; land_offer_files
--     (0003) and its signed-read route handler are the pattern it should follow.
--   · No online payment. v3 §30 says «Payment gateway لاحقاً» and v3 §63 puts online payments in Phase 3.
--     A recorded instalment is a human recording money that already arrived, exactly as staff_record_deposit.
--     The existing option list `payment_method` is reused unchanged — it is the owner's list, and §30's own
--     four channels are his to edit into it.
--   · No fourth tree state. 0054 considered 'contracting' and left it out on purpose. A tree goes to 'sold' at
--     the contract moment, which is what 0054 already says that state means. The three moments v2 §38
--     separates — signed, fully paid, legally owned — live on the CONTRACT (signed_on, settled_at, owned_at),
--     never on the tree.
--   · No app.compute_installment_plan. That is the older inverse simulator (pick a monthly, get a duration,
--     v2 §15). Report v3 wins on conflicts and fixes the direction as down payment + duration → monthly, which
--     is what financed_quote and every stored column implement. The question is closed; it is named here so
--     the next reader does not re-open it.
--   · No sending worker. §32 names five stage-3 moments and this file ENQUEUES them into
--     public.notification_outbox with five new message_templates rows. Nothing in the repository sends yet, so
--     no screen may say «تم الإرسال» — the row sits at status 'pending' and the outbox screen says so.

-- ---------------------------------------------------------------------------
-- 1 · Who may do what — no new predicate
-- ---------------------------------------------------------------------------

-- The three that already decide everything here, read from the other side:
--   app.can_contract_trees()  legal · finance · admin · super_admin   → create, sign, mark owned
--                             (0054, «Marking a tree sold is the contract moment»)
--   app.can_record_money()    finance · admin · super_admin           → record, void, edit a schedule line
--                             (0063, «signing the contract and taking the cash are two different desks»)
--   app.can_see_person()      admin · super_admin · finance · legal on any file, commercial on their own,
--                             agri_manager on none                    → intersected with both of the above
-- Two consequences worth stating because they will be the first two complaints:
--   · a LEGAL user may sign a contract and may not record a millime of it;
--   · the COMMERCIAL who sold the deal cannot sign it, and can never reach a contract screen for a file that
--     is not theirs. That is 0054's rule read from this side, not a new one.
-- Cancelling a contract has to put trees back, so it additionally needs app.can_manage_trees(); the three-way
-- intersection is finance · admin · super_admin, written as ONE check below the way staff_close_reservation
-- writes its two-way intersection — sequencing «cancel the paperwork» then «free the trees» from TypeScript is
-- how you get a cancelled contract whose trees are still sold.

-- ---------------------------------------------------------------------------
-- 2 · Every business value the two modules read
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('contract_no.prefix', to_jsonb('AGZ-CTR'::text), 'text', 'contracts',
   'بادئة رقم العقد',
   'مثال: AGZ-CTR-2026-000123. نفس طريقة رقم المطلب ورقم الحجز ورقم الدفعة. هذا رقمنا الداخلي للعقد، ماهوش «مرجع الوثيقة القانونية» اللي يكتبه الموظّف بيدو (عدد العقد عند الموثّق ولا في السجل) — زوز حقائق، زوز خانات.',
   false, 740),

  ('contracts.require_deposit_paid', to_jsonb(true), 'boolean', 'contracts',
   'ما يتعملش عقد قبل ما يخلّص العربون',
   'كي تكون «نعم»، الحجز لازم يكون في حالة «العربون تخلّص» قبل ما يتحوّل لعقد. عرض ما يطلبش عربون يبدا حجزه «تخلّص» من الأول، فما يتعطّلش. حطّها «لا» كان تحبّ الفريق ينجم يكتب العقد قبل ما توصل الفلوس.',
   false, 741),

  ('contracts.deposit_counts_toward_down_payment', to_jsonb(false), 'boolean', 'contracts',
   'العربون يتحسب من التسبقة؟',
   'قرار للمالك، ما ينجمش البرنامج يخمّنو: كي الحريف يخلّص عربون 50 د باش يحجز، وقت العقد التسبقة تنقص بـ50 د، ولاّ العربون معلوم حجز زايد؟ كراس الشروط ما يقولش. اليوم «لا»: العربون معلوم وحدو، والتسبقة كاملة. الزوز مبالغ يتبانوا جنب بعضهم في كل شاشة وما يتجمّعوش وحدهم. بدّل هنا برك كي تقرّر، والعقود اللي تكتبت قبل ما تتبدّلش.',
   false, 742),

  ('contracts.status_labels',
   jsonb_build_object(
     'draft',     'عقد في طور الإمضاء',
     'signed',    'ممضى',
     'completed', 'تخلّص كامل',
     'cancelled', 'ملغى'),
   'json', 'contracts',
   'أسماء حالات العقد بالعربي',
   'الحالات نفسها ثابتة لأنّ البرنامج يشتغل عليها، أما الكلام اللي يتقرا في الشاشة يتبدّل من هنا. «التملّك» ماهوش حالة: هو تاريخ يتزاد على العقد كي تكمل الشروط القانونية (كراس الشروط v2، البند 38).',
   false, 743),

  ('installments.first_due_rule', to_jsonb('manual'::text), 'text', 'installments',
   'وقتاش يحلّ أول قسط؟',
   'قرار للمالك، ما ينجمش البرنامج يخمّنو، وكل مراحل التأخير تتحسب منّو. ثلاث اختيارات: «manual» = الموظّف يكتب تاريخ أول قسط في كل عقد (هذا اللي محطوط اليوم، وما فماش حتى فرضية) · «signature_plus_month» = تاريخ الإمضاء + شهر · «first_of_next_month» = غرّة الشهر اللي بعد الإمضاء. في كل الحالات الموظّف ينجم يكتب تاريخاً خاصاً بالعقد ويغلب القاعدة.',
   false, 750),

  ('installments.first_due_offset_days', to_jsonb(0), 'integer', 'installments',
   'أيام تتزاد على تاريخ أول قسط',
   'كي تختار قاعدة أوتوماتيكية فوق، هذا العدد يتزاد على التاريخ اللي يتحسب. صفر معناها بلا زيادة.',
   false, 751),

  ('installments.grace_days_after', to_jsonb(0), 'integer', 'installments',
   'أيام تسامح بعد تاريخ القسط',
   'قدّاش من يوم بعد تاريخ القسط قبل ما يتحسب متأخّراً. كراس الشروط ما يعطي حتى مهلة (v2، البند 36: «بعده: Overdue»)، وعلى هالخاطر محطوطة صفر. أما التحويل البنكي في تونس يوصل بعد نهار ولا زوز، فإذا ما حطّيتش مهلة، حريف خلّص نهار الميعاد يولّي «متأخّر» غدوة. الرقم يرجع مع كل قراءة باش يتكتب في شاشة الأقساط ويتبان.',
   false, 752),

  ('installments.reminder_days_before', to_jsonb(3), 'integer', 'installments',
   'التذكير قبل القسط بـ (أيام)',
   'قسط باقيلو أقلّ من هذا العدد من الأيام يتبان «قربو» في شاشة الأقساط (كراس الشروط v2، البند 36: «قبل القسط: Reminder»). رقم عرض وتذكير، ما يبدّل حتى قاعدة.',
   false, 753),

  ('installments.late_stage1_missed', to_jsonb(1), 'integer', 'installments',
   'قدّاش من قسط متأخّر باش تولّي «تأخير 1»',
   'التقرير v3، البند 31: «بعد أول قسط متأخر: Late Payment 1». عدد الأقساط المتأخرة اللي يوصّل العقد للمرحلة الأولى. الكلام على «شهرين» اللي في نفس البند مذكور على أنّه نقاش تجاري والتقرير بدّلو بالمراحل هذي، فما ثمّة حتى رقم مكتوب في البرنامج.',
   false, 754),

  ('installments.late_stage2_missed', to_jsonb(2), 'integer', 'installments',
   'قدّاش من قسط متأخّر باش تولّي «مراجعة العقد»',
   'التقرير v3، البند 31: «بعد القسط الثاني: Critical / Contract Review». العقد يطلع قدّام الإدارة والقانوني. البرنامج ما يلغي شيء وحدو — «لا يوجد فسخ آلي» (كراس الشروط v2، البند 36) — الإجراء يتاخذ بيد بشرية حسب العقد والقانون.',
   false, 755),

  ('installments.line_status_labels',
   jsonb_build_object(
     'unpaid',  'ما تخلّصش',
     'partial', 'تخلّص جزء منّو',
     'paid',    'تخلّص'),
   'json', 'installments',
   'أسماء حالات القسط بالعربي',
   'حالة القسط ما تتسجّلش في قاعدة البيانات: تتحسب من الدفوعات الحيّة وقت ما تتقرا، فكي تُلغى دفعة ترجع الحالة وحدها. هنا الأسماء برك.',
   false, 756),

  ('installments.stage_labels',
   jsonb_build_object(
     'idle',     'ما فماش تقسيط جاري',
     'ok',       'ماشي مليح',
     'reminder', 'قسط قريب',
     'overdue',  'قسط فات ميعادو',
     'late1',    'تأخير 1',
     'critical', 'مراجعة العقد',
     'settled',  'الأقساط تكمّلت'),
   'json', 'installments',
   'أسماء مراحل التأخير بالعربي',
   'المراحل هي اللي يسمّيهم التقرير v3 في البند 31 وكراس الشروط v2 في البند 36. تتحسب وقت ما تتقرا من تواريخ الأقساط ومن الفلوس اللي وصلت، وما تتسجّلش في حتى خانة — خانة كيف هذي تولّي كذّابة في نصّ الليل.',
   false, 757)
on conflict (key) do nothing;

-- v3 §28 names «عقد وعد بالبيع» AND «Contract final» separately and never says how one becomes the other, so
-- the kind is an option list the owner extends rather than an enum a migration has to widen.
insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('contract_kind', 'أنواع العقود', 'plain',
   'شنوّة نوع الوثيقة: وعد بالبيع، العقد النهائي… (التقرير v3، البند 28). تتقرا وقت إنشاء العقد، واسمها يتنسخ على العقد كيما كان مكتوباً نهارتها.')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order) values
  ('contract_kind', 'promise_to_sell', 'عقد وعد بالبيع', 'Promesse de vente', 10),
  ('contract_kind', 'final_contract',  'العقد النهائي',   'Contrat final',     20)
on conflict (list_key, code) do nothing;

-- §32's five stage-3 moments. Enqueued, never claimed as sent: there is no sending worker in this repository,
-- so every row sits at status 'pending' and no screen may say «تم الإرسال».
insert into public.message_templates (key, channel, body_ar, description_ar, variables, is_active) values
  ('contract.ready', 'sms',
   'أهلا {name}، عقدك رقم {contract_no} ولّى حاضر للإمضاء. نتصلو بيك على الموعد. AgriZed',
   'تتبعث كي يتكتب العقد (التقرير v3، البند 32 «العقد جاهز»). ما تتبعثش لتوّ: ما فماش عامل إرسال.',
   array['name', 'contract_no'], true),
  ('contract.signed', 'sms',
   'مبروك {name}، عقدك رقم {contract_no} تمضى يوم {signed_on} على {trees} زيتونة. AgriZed',
   'تتبعث كي يتسجّل الإمضاء (التقرير v3، البند 32). ما تتبعثش لتوّ.',
   array['name', 'contract_no', 'signed_on', 'trees'], true),
  ('installment.due_soon', 'sms',
   'تذكير {name}: القسط {seq} من {count} يحلّ يوم {due_on} بمبلغ {amount}. AgriZed',
   'تذكير قبل القسط (التقرير v3، البند 32 «القسط قريب»؛ كراس الشروط v2، البند 36 «قبل القسط: Reminder»). ما تتبعثش لتوّ وما تتجدولش: ما فماش عامل إرسال ولا جدولة.',
   array['name', 'seq', 'count', 'due_on', 'amount'], true),
  ('installment.late', 'sms',
   '{name}، عندك {missed} قسط فات ميعادو في العقد {contract_no}. تعيّطلنا باش نلقاو حلّ. AgriZed',
   'إشعار التأخير (التقرير v3، البند 32 «تأخير»، والبند 31). ما تتبعثش لتوّ.',
   array['name', 'missed', 'contract_no'], true),
  ('payment.received', 'sms',
   'وصلتنا {amount} في العقد {contract_no}. وصلك رقم {payment_no}. شكراً {name}. AgriZed',
   'تأكيد وصول الدفعة (التقرير v3، البند 32 «تأكيد وصول الدفعة»، والبند 30 اللي يفرض Reference وReceipt لكل دفع). ما تتبعثش لتوّ.',
   array['name', 'amount', 'contract_no', 'payment_no'], true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3 · The contract's own four states
-- ---------------------------------------------------------------------------

-- Its OWN small enum, and not one of the three vocabularies the spec mixes. v3 §27's client pipeline is
-- prefixed «مثلاً» and is about the PERSON — public.lead_statuses already holds «في طور التعاقد» and «مالك»
-- for that. v3 §21 and v2 §28 are about the PARCEL, which public.tree_state already carries. 0063 refused the
-- same merge for reservations: «Not public.lead_statuses: that is the person's pipeline stage». Three layers,
-- three records, none pretending to be the others.
--   draft      the paperwork exists, the trees are the client's, nobody has signed yet (v3 §27 «Contract pending»)
--   signed     v2 §34's «Signature Date» is filled
--   completed  every scheduled instalment and the whole down payment have arrived. NOT ownership: v2 §38 puts
--              ownership «بعد اكتمال الشروط القانونية», which is a separate act and a separate column
--   cancelled  a human ended it. §31 and v2 §36 forbid the system doing this on its own, ever
create type public.contract_status as enum ('draft', 'signed', 'completed', 'cancelled');

comment on type public.contract_status is
  'State of one contract. Codes are stable because the code branches on them; the Arabic labels live in settings contracts.status_labels. Ownership is not a state: v2 §38 makes it a later act, recorded as contracts.owned_at.';

-- ---------------------------------------------------------------------------
-- 4 · The contract — v2 §34's eight fields, plus the plan it froze
-- ---------------------------------------------------------------------------

create table public.contracts (
  id             uuid primary key default gen_random_uuid(),
  -- AGZ-CTR-2026-000123, our number. legal_document_ref below is the paper's number, which a human types.
  reference_no   text not null unique,

  -- v2 §49: «Contract → Reservation», in the singular. One contract per reservation, and nothing else may
  -- create one: the reservation is where the trees, the client and the offer already agree with each other.
  reservation_id uuid not null unique references public.reservations (id),
  person_id      uuid not null references public.persons (id),   -- §34 «Customer»
  project_id     uuid not null references public.projects (id),  -- §34 «Parcel»
  -- Provenance only. reservations.request_id is nullable by design (a walk-in has no demand) and a demand is
  -- editable CRM data, so nothing below is ever read back from it after creation.
  request_id     uuid references public.interest_requests (id),

  -- v3 §28 names «عقد وعد بالبيع» and «Contract final» separately. An option list, plus its label snapshot.
  kind_option_id uuid references public.option_items (id),
  kind_label_ar  text check (kind_label_ar is null or char_length(kind_label_ar) <= 120),

  status         public.contract_status not null default 'draft',
  trees_count    integer not null check (trees_count >= 1),

  -- §34 «Payment Method» — the owner's list, plus the label as it read that day, exactly as payments does.
  method_option_id uuid references public.option_items (id),
  method_label_ar  text check (method_label_ar is null or char_length(method_label_ar) <= 120),

  -- THE SNAPSHOT. Copied once, at creation, and never recomputed from the offer or from the demand.
  payment_mode   text not null check (payment_mode in ('cash', 'installments')),
  price_per_tree_millimes bigint not null check (price_per_tree_millimes > 0),
  total_price_millimes    bigint not null check (total_price_millimes > 0),   -- §34 «Total Price»
  down_payment_millimes   bigint not null check (down_payment_millimes >= 0), -- §34 «Down Payment»
  down_payment_percent    numeric(6, 3),
  -- What the عربون already paid contributes to the down payment. 0 unless the owner switches
  -- contracts.deposit_counts_toward_down_payment on. Stored rather than recomputed, so flipping that setting
  -- can never change what an already-signed client owes.
  deposit_credited_millimes bigint not null default 0 check (deposit_credited_millimes >= 0),

  -- THE PLAN, all of app.financed_quote's keys, or all null for a cash contract (§34 «Payment Plan»).
  markup_bp               integer,
  duration_months         integer check (duration_months is null or duration_months >= 1),
  total_financed_millimes bigint,
  remaining_millimes      bigint,
  monthly_millimes        bigint,
  last_installment_millimes bigint,
  installments_count      integer check (installments_count is null or installments_count >= 1),
  plan_shortened          boolean,

  -- §34 «Legal document reference» and «Signature Date». A date and a text, which is all the spec grants the
  -- software: v3 §45 gives the commercial «Generate Contract Request» — a request, not an issuance.
  legal_document_ref text check (legal_document_ref is null or char_length(legal_document_ref) <= 200),
  signed_on          date,
  signed_by          uuid references public.profiles (id),

  -- §29: the schedule is generated after the contract, and it needs a day to count from. See the header —
  -- the rule is a setting and this column is the answer for THIS contract, whichever rule the owner chooses.
  first_due_on          date,
  schedule_generated_at timestamptz,

  -- Every instalment and the whole down payment have arrived. Set inside the payment RPC (a human act) and
  -- unset by voiding one. Never by a timer.
  settled_at timestamptz,
  -- v2 §38: «بعد اكتمال الشروط القانونية: Parcel status: Owned ويتفتح للحريف: زيتونتي». A LATER act by
  -- Legal/Admin — not the signature and not the last instalment — and the key «زيتونتي» should open on.
  owned_at   timestamptz,
  owned_by   uuid references public.profiles (id),

  cancelled_at   timestamptz,
  cancelled_by   uuid references public.profiles (id),
  cancel_reason  text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  trees_released boolean not null default false,

  note       text check (note is null or char_length(note) <= 1000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- A cash contract has no plan and a financed one has all of it. v3 §51 insists «Prix cash» is a real answer
  -- and interest_requests.payment_mode already carries 'cash'; making the plan mandatory would dead-end every
  -- cash buyer at a reservation and leave them unable to reach ownership at all.
  constraint contracts_plan_check check (
    case when payment_mode = 'installments'
      then markup_bp is not null and duration_months is not null and total_financed_millimes is not null
       and remaining_millimes is not null and monthly_millimes is not null
       and last_installment_millimes is not null and installments_count is not null
      else markup_bp is null and duration_months is null and total_financed_millimes is null
       and remaining_millimes is null and monthly_millimes is null
       and last_installment_millimes is null and installments_count is null
    end),
  -- The signature is a fact: a signed or completed contract has its date, and a draft does not pretend to.
  constraint contracts_signed_check    check ((status in ('signed', 'completed')) <= (signed_on is not null)),
  constraint contracts_draft_check     check ((status = 'draft') <= (signed_on is null)),
  constraint contracts_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint contracts_settled_check   check ((status = 'completed') <= (settled_at is not null)),
  -- v2 §38 again: ownership comes after the legal conditions, which come after a signature.
  constraint contracts_owned_check     check ((owned_at is not null) <= (signed_on is not null)),
  constraint contracts_deposit_credit_check check (deposit_credited_millimes <= down_payment_millimes)
);

create index contracts_person_idx  on public.contracts (person_id, created_at desc);
create index contracts_project_idx on public.contracts (project_id, created_at desc);
create index contracts_status_idx  on public.contracts (status, created_at desc);
create index contracts_request_idx on public.contracts (request_id) where request_id is not null;

create trigger contracts_stamp before update on public.contracts
  for each row execute function app.stamp_updated();
create trigger contracts_audit after update or delete on public.contracts
  for each row execute function app.audit_row_change();

comment on table public.contracts is
  'One «عقد وعد بالبيع» made from one reservation (v2 §34 and §49; report v3 §28). Holds the eight fields §34 names and a frozen copy of the plan that was agreed — never a formula, and never a re-read of the offer or the demand. Written only through staff_create_contract, staff_sign_contract, staff_generate_schedule, staff_record_installment, staff_void_payment, staff_cancel_contract and staff_set_contract_owned.';
comment on column public.contracts.reservation_id is
  'The hold this contract came from (v2 §49 «Contract → Reservation», singular). Unique: a client holding two reservations gets two contracts, which the screen says out loud so staff are not surprised. Creating the contract sets that reservation to ''converted'' — the only writer of that value in the whole database.';
comment on column public.contracts.remaining_millimes is
  'What is financed after the down payment, from app.financed_quote at creation. The schedule''s rows sum to exactly this. Never recomputed: financed_quote reads financing_markups and tree_pricing_rules, which the owner edits, so a re-read could move an agreed monthly between the offer and the signature.';
comment on column public.contracts.last_installment_millimes is
  'The final instalment, which differs from the others because the monthly is rounded UP (0036). Snapshotting it is the difference between billing a client correctly and overcharging them — on this database''s own rows, four of five live plans would be overcharged by a monthly × duration_months schedule.';
comment on column public.contracts.deposit_credited_millimes is
  'How much of the عربون already paid counts toward the down payment. 0 unless the owner switches contracts.deposit_counts_toward_down_payment on — a question neither document answers. Frozen at creation so flipping the setting never changes what a signed client owes.';
comment on column public.contracts.owned_at is
  'When the legal conditions completed and the client became the owner (v2 §38). NOT the signature and NOT the last instalment: the spec separates all three. This is the date «زيتونتي» should open on, not the tree''s state.';
comment on column public.contracts.first_due_on is
  'The day the first instalment falls due. Neither document says how it is chosen, so the rule is the setting installments.first_due_rule (seeded ''manual'' = Finance types it) and this column is the answer for THIS contract. Every stage of §31 counts from it.';

alter table public.contracts enable row level security;
revoke all on public.contracts from anon, authenticated;
grant select on public.contracts to authenticated;

-- Staff read the files they may see, exactly as public.reservations does. Visitors read nothing: there is no
-- client area yet (persons.profile_id is written nowhere), so a self-read policy could never match.
create policy contracts_select on public.contracts for select to authenticated
  using ((select app.is_staff()) and (select app.can_see_person(person_id)));

-- ---------------------------------------------------------------------------
-- 5 · The schedule — what is owed and when, and nothing else
-- ---------------------------------------------------------------------------

create table public.contract_installments (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id),
  -- v2 §35 «Installment number». No reference_no of its own: a schedule line is an expectation, not money, and
  -- a generated number on it would be quoted by clients as if it were a receipt. When money arrives it is a
  -- public.payments row, which carries both its own AGZ-PAY number and the bank's reference.
  seq         integer not null check (seq >= 1),
  due_on      date   not null,
  amount_millimes bigint not null check (amount_millimes > 0),

  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  constraint contract_installments_seq_key unique (contract_id, seq)
);

create index contract_installments_due_idx on public.contract_installments (due_on, contract_id);

create trigger contract_installments_stamp before update on public.contract_installments
  for each row execute function app.stamp_updated();
create trigger contract_installments_audit after update or delete on public.contract_installments
  for each row execute function app.audit_row_change();

comment on table public.contract_installments is
  'One row per instalment of one contract (report v3 §29, v2 §35): which number it is, when it is due and how much. Paid / unpaid and the remaining balance are NOT here — they are derived from public.payments; and the payment date, the method, the receipt and the bank reference ARE a payments row. Generated from the contract''s frozen plan; nothing is divided or rounded here.';
comment on column public.contract_installments.amount_millimes is
  'Copied from the contract''s snapshot: monthly_millimes for every line but the last, last_installment_millimes for the last. The rows of one schedule sum to exactly contracts.remaining_millimes, which the SQL test asserts.';

alter table public.contract_installments enable row level security;
revoke all on public.contract_installments from anon, authenticated;
grant select on public.contract_installments to authenticated;

create policy contract_installments_select on public.contract_installments for select to authenticated
  using ((select app.is_staff())
         and exists (select 1 from public.contracts c
                     where c.id = contract_id and (select app.can_see_person(c.person_id))));

-- ---------------------------------------------------------------------------
-- 6 · public.payments gains its contract side — there is no second money table
-- ---------------------------------------------------------------------------

-- 0063 shaped that row for stage 3 and said so in its own comment. A second money table would mean two answers
-- to «how much has this client paid», and 0068's app.zitounti_payments — which already reads every payments
-- row for a person and feeds the client's «زيتونتي» file — would show the عربون and none of the 84
-- instalments, silently, because it would still return rows.
alter table public.payments
  add column if not exists contract_id    uuid references public.contracts (id),
  add column if not exists installment_id uuid references public.contract_installments (id);

create index if not exists payments_contract_idx    on public.payments (contract_id)    where contract_id is not null;
create index if not exists payments_installment_idx on public.payments (installment_id) where installment_id is not null;

alter table public.payments drop constraint if exists payments_installment_needs_contract;
alter table public.payments
  add constraint payments_installment_needs_contract check (installment_id is null or contract_id is not null);

comment on column public.payments.contract_id is
  'The contract this money belongs to, for kind ''down_payment'' and ''installment''. Null for a عربون, which belongs to a reservation. This column is what keeps «how much has this client paid» one question with one answer.';
comment on column public.payments.installment_id is
  'Which instalment Finance was collecting when this money arrived — it goes on the receipt and into the audit row. It is NOT the allocation: each line''s balance is a waterfall over the contract''s live money, oldest line first, so voiding a receipt reverses everything it touched with no allocation table to repair. See app.contract_money.';

-- ---------------------------------------------------------------------------
-- 7 · Derivation — everything a screen shows about money, computed here
-- ---------------------------------------------------------------------------

-- THE ALLOCATION RULE, stated once. Money recorded against a contract with kind='installment' fills the
-- schedule from the oldest line forward. A line's paid amount is
--     least(greatest(pool − sum of the amounts before it, 0), its own amount)
-- which is one window function over the ordered schedule and touches no stored column. Consequences, all of
-- them wanted: voiding a receipt un-pays exactly what it paid, with no repair step; a client who hands over
-- three months in one transfer settles three lines; a payment tagged to instalment 5 while 1..4 are open still
-- settles 1 first, which is how a debt is actually paid, and the audit row keeps what Finance intended.
create or replace function app.contract_money(p_contract uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c       public.contracts;
  v_today   date    := (now() at time zone 'Africa/Tunis')::date;
  v_grace   integer := greatest(app.setting_int('installments.grace_days_after', 0), 0);
  v_remind  integer := greatest(app.setting_int('installments.reminder_days_before', 0), 0);
  v_late1   integer := greatest(app.setting_int('installments.late_stage1_missed', 1), 1);
  v_late2   integer := greatest(app.setting_int('installments.late_stage2_missed', 2), 1);
  v_labels  jsonb   := coalesce(app.setting('installments.line_status_labels'), '{}'::jsonb);
  v_stages  jsonb   := coalesce(app.setting('installments.stage_labels'), '{}'::jsonb);
  v_kinds   jsonb   := coalesce(app.setting('payments.kind_labels'), '{}'::jsonb);
  v_down    bigint;
  v_pool    bigint;
  v_sched   bigint;
  v_count   integer;
  v_lines   jsonb;
  v_missed  integer := 0;
  v_paid_n  integer := 0;
  v_soon    boolean := false;
  v_next    date;
  v_next_am bigint;
  v_stage   text;
  v_down_due  bigint;
  v_down_left bigint;
begin
  select * into v_c from public.contracts c where c.id = p_contract;
  if not found then
    return null;
  end if;

  -- Live money only: a voided receipt has never been paid.
  select coalesce(sum(p.amount_millimes) filter (where p.kind = 'down_payment'), 0)::bigint,
         coalesce(sum(p.amount_millimes) filter (where p.kind = 'installment'), 0)::bigint
  into v_down, v_pool
  from public.payments p
  where p.contract_id = p_contract and p.voided_at is null;

  select count(*)::integer, coalesce(sum(i.amount_millimes), 0)::bigint
  into v_count, v_sched
  from public.contract_installments i
  where i.contract_id = p_contract;

  with ordered as (
    select i.id, i.seq, i.due_on, i.amount_millimes, i.note,
           coalesce(sum(i.amount_millimes) over (order by i.seq
                      rows between unbounded preceding and 1 preceding), 0)::bigint as before_millimes
    from public.contract_installments i
    where i.contract_id = p_contract
  ), allocated as (
    select o.*, least(greatest(v_pool - o.before_millimes, 0), o.amount_millimes)::bigint as paid_millimes
    from ordered o
  ), stated as (
    select a.*,
           (a.amount_millimes - a.paid_millimes)::bigint as left_millimes,
           case when a.paid_millimes >= a.amount_millimes then 'paid'
                when a.paid_millimes > 0 then 'partial'
                else 'unpaid' end as line_status,
           (a.paid_millimes < a.amount_millimes and a.due_on + v_grace < v_today) as is_late
    from allocated a
  )
  select jsonb_agg(jsonb_build_object(
           'id', s.id,
           'seq', s.seq,
           'due_on', s.due_on,
           'amount_millimes', s.amount_millimes,
           'paid_millimes', s.paid_millimes,
           'left_millimes', s.left_millimes,
           'status', s.line_status,
           'status_label', coalesce(v_labels->>s.line_status, s.line_status),
           'is_late', s.is_late,
           -- Days past the due date INCLUDING the tolerance the owner granted, so a screen and the late queue
           -- never disagree about what «late» counts from.
           'days_late', case when s.is_late then (v_today - (s.due_on + v_grace)) end,
           'note', s.note,
           -- v3 §29's «Payment date · Payment method · Receipt · Reference bancaire» are properties of money,
           -- so they are read from public.payments and never copied onto the line.
           'receipts', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', p.id, 'reference_no', p.reference_no, 'amount_millimes', p.amount_millimes,
                      'method_label', p.method_label_ar, 'reference', p.reference,
                      'received_at', p.received_at, 'voided', p.voided_at is not null)
                    order by p.received_at desc, p.reference_no desc)
             from public.payments p where p.installment_id = s.id), '[]'::jsonb))
         order by s.seq),
         count(*) filter (where s.is_late)::integer,
         count(*) filter (where s.line_status = 'paid')::integer,
         bool_or(s.line_status <> 'paid' and not s.is_late and s.due_on - v_remind <= v_today),
         min(s.due_on) filter (where s.line_status <> 'paid')
  into v_lines, v_missed, v_paid_n, v_soon, v_next
  from stated s;

  select i.amount_millimes into v_next_am
  from public.contract_installments i
  where i.contract_id = p_contract and i.due_on = v_next
  order by i.seq limit 1;

  v_down_due  := greatest(v_c.down_payment_millimes - v_c.deposit_credited_millimes, 0);
  v_down_left := greatest(v_down_due - v_down, 0);

  -- §31's ladder, computed here and nowhere else, from the four settings above. It is never stored: it changes
  -- with the clock, and a stored copy would be a column a midnight job has to maintain — which is the one
  -- thing both documents forbid, twice each.
  if v_c.status = 'cancelled' or coalesce(v_count, 0) = 0 then
    v_stage := 'idle';
  elsif v_missed >= v_late2 then
    v_stage := 'critical';                                   -- v3 §31 «Critical / Contract Review»
  elsif v_missed >= v_late1 then
    v_stage := 'late1';                                      -- v3 §31 «Late Payment 1»
  elsif v_missed > 0 then
    v_stage := 'overdue';                                    -- v2 §36 «بعده: Overdue», below stage 1
  elsif v_paid_n = v_count then
    v_stage := 'settled';
  elsif coalesce(v_soon, false) then
    v_stage := 'reminder';                                   -- v2 §36 «قبل القسط: Reminder»
  else
    v_stage := 'ok';
  end if;

  return jsonb_build_object(
    'contract_id', p_contract,
    -- Returned so the screen prints the tolerance beside the queue instead of the reader assuming it.
    'grace_days', v_grace,
    'reminder_days', v_remind,
    'late1_missed', v_late1,
    'late2_missed', v_late2,

    'down_payment_millimes', v_c.down_payment_millimes,
    'deposit_credited_millimes', v_c.deposit_credited_millimes,
    'down_payment_due_millimes', v_down_due,
    'down_payment_paid_millimes', v_down,
    'down_payment_left_millimes', v_down_left,
    'down_payment_kind_label', coalesce(v_kinds->>'down_payment', 'down_payment'),

    'installments_count', coalesce(v_count, 0),
    'scheduled_millimes', coalesce(v_sched, 0),
    'installments_paid_millimes', v_pool,
    'installments_left_millimes', greatest(coalesce(v_sched, 0) - v_pool, 0),
    'installments_paid_count', coalesce(v_paid_n, 0),
    'missed_count', coalesce(v_missed, 0),
    'next_due_on', v_next,
    'next_due_millimes', v_next_am,
    'stage', v_stage,
    'stage_label', coalesce(v_stages->>v_stage, v_stage),
    -- Everything the client owes and everything that has arrived, in one pair the screen prints as it is.
    'total_due_millimes', v_down_due + coalesce(v_sched, 0),
    'total_paid_millimes', v_down + v_pool,
    'total_left_millimes', greatest(v_down_due + coalesce(v_sched, 0) - v_down - v_pool, 0),
    -- A cash contract settles on its down payment alone, because it has no schedule and never will (v3 §51).
    -- A financed one needs its schedule to exist AND to be fully paid, so signing while `installments` is off
    -- can never mark a contract «تخلّص كامل» on the strength of an apport.
    'is_settled', v_down_left = 0
                  and (case when v_c.payment_mode = 'installments'
                            then coalesce(v_count, 0) > 0 and coalesce(v_paid_n, 0) = v_count
                            else true end),
    'lines', coalesce(v_lines, '[]'::jsonb));
end $$;
revoke execute on function app.contract_money(uuid) from public, anon, authenticated;

comment on function app.contract_money(uuid) is
  'Everything about one contract''s money, derived: what each instalment has been paid (a waterfall over the live non-voided payments, oldest line first), what is left, which lines are late, and the §31 stage. Nothing here is stored, so voiding a receipt takes the whole picture back with it and no job has to run at midnight.';

-- Everything one screen shows about one contract, in one read: the labels from settings, the live tree counts
-- from public.trees, the money from app.contract_money, and the reservation it came from. A page renders these;
-- it works none of them out.
create or replace function app.contract_payload(p_contract uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c      public.contracts;
  v_pj     public.projects;
  v_person public.persons;
  v_res    public.reservations;
  v_labels jsonb := coalesce(app.setting('contracts.status_labels'), '{}'::jsonb);
  v_kinds  jsonb := coalesce(app.setting('payments.kind_labels'), '{}'::jsonb);
  v_sold   integer;
  v_held   integer;
  v_first  text;
  v_last   text;
  v_pays   jsonb;
  v_req_no text;
begin
  select * into v_c from public.contracts c where c.id = p_contract;
  if not found then
    return null;
  end if;
  select * into v_pj     from public.projects pj    where pj.id = v_c.project_id;
  select * into v_person from public.persons ps     where ps.id = v_c.person_id;
  select * into v_res    from public.reservations r where r.id  = v_c.reservation_id;

  -- The live inventory, never a stored count (§46). A contract's trees are its reservation's trees, and the
  -- link survives the sale because app.trees_clear_reservation only clears it on state 'available'.
  select (count(*) filter (where t.state = 'sold'))::integer,
         (count(*) filter (where t.state = 'reserved'))::integer
  into v_sold, v_held
  from public.trees t where t.reservation_id = v_c.reservation_id;

  select t.code into v_first from public.trees t where t.reservation_id = v_c.reservation_id order by t.seq limit 1;
  select t.code into v_last  from public.trees t where t.reservation_id = v_c.reservation_id order by t.seq desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'reference_no', p.reference_no,
           'kind', p.kind::text, 'kind_label', coalesce(v_kinds->>p.kind::text, p.kind::text),
           'amount_millimes', p.amount_millimes,
           'method_label', p.method_label_ar, 'reference', p.reference,
           'received_at', p.received_at, 'note', p.note,
           'installment_id', p.installment_id,
           'voided', p.voided_at is not null, 'void_reason', p.void_reason,
           'recorded_by', (select pr.full_name from public.profiles pr where pr.id = p.recorded_by))
         order by p.received_at desc, p.reference_no desc), '[]'::jsonb)
  into v_pays
  from public.payments p where p.contract_id = p_contract;

  select r.request_no into v_req_no from public.interest_requests r where r.id = v_c.request_id;

  return jsonb_build_object(
    'id', v_c.id,
    'reference_no', v_c.reference_no,
    'status', v_c.status::text,
    'status_label', coalesce(v_labels->>v_c.status::text, v_c.status::text),
    'kind_label', v_c.kind_label_ar,

    'person_id', v_c.person_id,
    'person_name', v_person.full_name,
    'person_phone', v_person.phone_e164,
    'project_id', v_c.project_id,
    'offer_name', v_pj.name,
    'offer_code', v_pj.code,
    'request_id', v_c.request_id,
    'request_no', v_req_no,
    'reservation_id', v_c.reservation_id,
    'reservation_no', v_res.reference_no,
    -- Shown BESIDE the down payment and never added to it: whether the one counts toward the other is the
    -- owner's open question (contracts.deposit_counts_toward_down_payment), and money.deposit_credited_millimes
    -- is the frozen answer this contract was written under.
    'reservation_deposit_millimes', v_res.deposit_due_millimes,

    'trees_count', v_c.trees_count,
    'trees_sold', coalesce(v_sold, 0),
    'trees_still_reserved', coalesce(v_held, 0),
    'first_code', v_first,
    'last_code', v_last,

    'payment_mode', v_c.payment_mode,
    'price_per_tree_millimes', v_c.price_per_tree_millimes,
    'total_price_millimes', v_c.total_price_millimes,
    -- v2 §34's «Down Payment» as the contract froze it. money.down_payment_due_millimes below is the same
    -- figure minus whatever the عربون was credited with, which is the one the client still owes.
    'down_payment_millimes', v_c.down_payment_millimes,
    'down_payment_percent', v_c.down_payment_percent,
    'markup_bp', v_c.markup_bp,
    'duration_months', v_c.duration_months,
    'total_financed_millimes', v_c.total_financed_millimes,
    'remaining_millimes', v_c.remaining_millimes,
    'monthly_millimes', v_c.monthly_millimes,
    'last_installment_millimes', v_c.last_installment_millimes,
    'plan_installments_count', v_c.installments_count,
    -- app.financed_quote returns true when the rounded-up monthly clears the balance in fewer months than were
    -- chosen. The screen should say so: the client pays for fewer months than the duration they picked.
    'plan_shortened', v_c.plan_shortened,

    'method_label', v_c.method_label_ar)
  -- Split in two only because jsonb_build_object takes at most 100 arguments; the object is one object.
  || jsonb_build_object(
    'legal_document_ref', v_c.legal_document_ref,
    'signed_on', v_c.signed_on,
    'signed_by', (select pr.full_name from public.profiles pr where pr.id = v_c.signed_by),
    'first_due_on', v_c.first_due_on,
    'schedule_generated_at', v_c.schedule_generated_at,
    -- True when the plan exists but its schedule does not yet: signing while `installments` is still disabled
    -- is allowed, and the screen has to be able to say so instead of drawing an empty table.
    'schedule_pending', v_c.payment_mode = 'installments' and v_c.schedule_generated_at is null,
    'settled_at', v_c.settled_at,
    'owned_at', v_c.owned_at,
    'owned_by', (select pr.full_name from public.profiles pr where pr.id = v_c.owned_by),
    'cancelled_at', v_c.cancelled_at,
    'cancel_reason', v_c.cancel_reason,
    'trees_released', v_c.trees_released,
    'note', v_c.note,
    'created_at', v_c.created_at,
    'created_by', (select pr.full_name from public.profiles pr where pr.id = v_c.created_by),

    'money', app.contract_money(p_contract),
    'payments', v_pays);
end $$;
revoke execute on function app.contract_payload(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8 · Readers — no module gate, and each says which state its flag is in
-- ---------------------------------------------------------------------------

-- The rule this product settled on and 0063 states outright: the flag says what VISITORS see and is not an
-- access rule for the team, because the Back Office is exactly where a module is prepared before it is
-- published. So the readers answer while the module is off and return module_state, and only the WRITERS below
-- raise module_closed.

create or replace function public.staff_contracts(
  p_filter text default 'open', p_project uuid default null, p_limit integer default 100
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_filter text    := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'open');
  v_limit  integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_rows   jsonb;
  v_counts jsonb;
  v_total  integer;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_filter not in ('open', 'draft', 'signed', 'late', 'owned', 'closed', 'all') then
    raise exception 'invalid_contract_filter' using errcode = 'P0001';
  end if;

  -- One pass, so the counts and the rows can never describe two different sets. A commercial sees only the
  -- files assigned to them, exactly as every other CRM read does.
  with visible as (
    select c.*,
           c.status in ('draft', 'signed') as is_open,
           app.contract_money(c.id)->>'stage' as stage
    from public.contracts c
    where app.can_see_person(c.person_id)
      and (p_project is null or c.project_id = p_project)
  ), tagged as (
    select v.*, v.stage in ('overdue', 'late1', 'critical') as is_late from visible v
  ), kept as (
    select t.* from tagged t
    where case v_filter
            when 'open'   then t.is_open
            when 'draft'  then t.status = 'draft'
            when 'signed' then t.status = 'signed'
            when 'late'   then t.is_late
            when 'owned'  then t.owned_at is not null
            when 'closed' then t.status in ('completed', 'cancelled')
            else true
          end
  )
  select (select count(*)::integer from kept),
         -- FULL payloads, not a thinner summary: a list row and a client file would otherwise be two
         -- definitions of «a contract» on two screens, and the day one gains a field the other starts lying by
         -- omission. The cap bounds the work; app.contract_payload is the one definition.
         (select coalesce(jsonb_agg(app.contract_payload(x.id) order by x.rank, x.created_at desc), '[]'::jsonb)
          from (
            select k.id, k.created_at,
                   -- What needs a human first: §31's critical files, then the merely late, then the drafts
                   -- waiting for a signature, then the rest.
                   case when k.stage = 'critical' then 0
                        when k.is_late then 1
                        when k.status = 'draft' then 2
                        when k.is_open then 3
                        else 4 end as rank
            from kept k
            order by rank, k.created_at desc
            limit v_limit) x),
         (select jsonb_build_object(
                   'open',   count(*) filter (where t.is_open),
                   'draft',  count(*) filter (where t.status = 'draft'),
                   'signed', count(*) filter (where t.status = 'signed'),
                   'late',   count(*) filter (where t.is_late),
                   'owned',  count(*) filter (where t.owned_at is not null),
                   'closed', count(*) filter (where t.status in ('completed', 'cancelled')),
                   'all',    count(*))
          from tagged t)
  into v_total, v_rows, v_counts;

  return jsonb_build_object(
    'module_state', app.flag_state('contracts')::text,
    'installments_state', app.flag_state('installments')::text,
    'filter', v_filter,
    'limit', v_limit,
    'matched', v_total,
    'capped', v_total > v_limit,
    'counts', v_counts,
    'rows', v_rows);
end $$;
revoke execute on function public.staff_contracts(text, uuid, integer) from public, anon;
grant execute on function public.staff_contracts(text, uuid, integer) to authenticated;

comment on function public.staff_contracts(text, uuid, integer) is
  'The Back Office list of contracts with its counts, ordered by what needs a human first: §31''s Critical files, then the late, then drafts awaiting a signature. Filters: open · draft · signed · late · owned · closed · all. A commercial sees only the files assigned to them. No module gate — the flag governs visitors, not the team; both flag states are returned so the screen can say the module is off.';

create or replace function public.staff_contract(p_contract uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_person uuid;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.person_id into v_person from public.contracts c where c.id = p_contract;
  if v_person is null or not app.can_see_person(v_person) then
    return null;
  end if;
  return app.contract_payload(p_contract);
end $$;
revoke execute on function public.staff_contract(uuid) from public, anon;
grant execute on function public.staff_contract(uuid) to authenticated;

-- Everything one client file needs in a single read: their contracts in full, and the reservations that could
-- still become one — so the «اعمل عقد» button knows what it may act on before it is pressed, the way
-- staff_person_reservations hands the «احجز» form each offer's terms.
create or replace function public.staff_person_contracts(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rows     jsonb;
  v_ready    jsonb;
  v_need_dep boolean := app.setting_bool('contracts.require_deposit_paid', true);
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.can_see_person(p_person) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(app.contract_payload(c.id) order by c.created_at desc), '[]'::jsonb)
  into v_rows
  from public.contracts c where c.person_id = p_person;

  select coalesce(jsonb_agg(jsonb_build_object(
           'reservation_id', r.id,
           'reference_no', r.reference_no,
           'status', r.status::text,
           'project_id', r.project_id,
           'offer_code', (select pj.code from public.projects pj where pj.id = r.project_id),
           'trees_held', (select count(*)::integer from public.trees t
                          where t.reservation_id = r.id and t.state = 'reserved'),
           'request_id', r.request_id,
           -- Why this hold is not offered, in one word the screen turns into a sentence. The two live offers
           -- ask for no deposit at all today, so most holds open already settled and are ready at once.
           'blocked_by', case when v_need_dep and r.status = 'awaiting_deposit' then 'deposit' end)
         order by r.reserved_at desc), '[]'::jsonb)
  into v_ready
  from public.reservations r
  where r.person_id = p_person
    and r.status in ('awaiting_deposit', 'deposit_paid')
    and not exists (select 1 from public.contracts c where c.reservation_id = r.id);

  return jsonb_build_object(
    'module_state', app.flag_state('contracts')::text,
    'installments_state', app.flag_state('installments')::text,
    'person_id', p_person,
    'require_deposit_paid', v_need_dep,
    'contracts', v_rows,
    -- v2 §49 is singular, so a client with two reservations gets two contracts. The screen says so from here
    -- rather than surprising a commercial who expected one.
    'convertible_reservations', v_ready);
end $$;
revoke execute on function public.staff_person_contracts(uuid) from public, anon;
grant execute on function public.staff_person_contracts(uuid) to authenticated;

comment on function public.staff_person_contracts(uuid) is
  'One client file''s contracts in full, plus the reservations that could still become one and why any of them cannot. Staff, limited to the files they may see.';

-- §31's whole point: somebody has to LOOK. This is the Finance and Legal queue — one row per instalment that
-- needs attention, newest trouble first, with the thresholds it was judged by printed alongside.
create or replace function public.staff_installments(
  p_filter text default 'attention', p_limit integer default 200
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_filter text    := coalesce(nullif(btrim(coalesce(p_filter, '')), ''), 'attention');
  v_limit  integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_grace  integer := greatest(app.setting_int('installments.grace_days_after', 0), 0);
  v_remind integer := greatest(app.setting_int('installments.reminder_days_before', 0), 0);
  v_rows   jsonb;
  v_counts jsonb;
  v_total  integer;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_filter not in ('attention', 'due_soon', 'overdue', 'critical', 'unpaid', 'all') then
    raise exception 'invalid_installment_filter' using errcode = 'P0001';
  end if;

  with live as (
    select c.id as contract_id, c.reference_no, c.person_id, c.project_id, c.status,
           app.contract_money(c.id) as money
    from public.contracts c
    where app.can_see_person(c.person_id) and c.status in ('draft', 'signed')
  ), lines as (
    select l.contract_id, l.reference_no, l.person_id, l.project_id,
           l.money->>'stage' as stage,
           (l.money->>'stage_label') as stage_label,
           line
    from live l, lateral jsonb_array_elements(coalesce(l.money->'lines', '[]'::jsonb)) as line
  ), tagged as (
    select x.*,
           (x.line->>'status') <> 'paid' as is_unpaid,
           (x.line->>'is_late')::boolean as is_late,
           (x.line->>'status') <> 'paid' and not (x.line->>'is_late')::boolean
             and (x.line->>'due_on')::date - v_remind <= (now() at time zone 'Africa/Tunis')::date as is_soon
    from lines x
  ), kept as (
    select t.* from tagged t
    where case v_filter
            when 'attention' then t.is_late or t.is_soon
            when 'due_soon'  then t.is_soon
            when 'overdue'   then t.is_late
            when 'critical'  then t.stage = 'critical'
            when 'unpaid'    then t.is_unpaid
            else true
          end
  )
  select (select count(*)::integer from kept),
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'contract_id', k.contract_id, 'contract_no', k.reference_no,
                   'person_id', k.person_id,
                   'person_name', (select ps.full_name from public.persons ps where ps.id = k.person_id),
                   'person_phone', (select ps.phone_e164 from public.persons ps where ps.id = k.person_id),
                   'offer_code', (select pj.code from public.projects pj where pj.id = k.project_id),
                   'stage', k.stage, 'stage_label', k.stage_label,
                   'installment', k.line)
                 order by (k.line->>'is_late')::boolean desc, (k.line->>'due_on')::date), '[]'::jsonb)
          from (select * from kept order by (line->>'is_late')::boolean desc, (line->>'due_on')::date
                limit v_limit) k),
         (select jsonb_build_object(
                   'attention', count(*) filter (where t.is_late or t.is_soon),
                   'due_soon',  count(*) filter (where t.is_soon),
                   'overdue',   count(*) filter (where t.is_late),
                   'critical',  count(*) filter (where t.stage = 'critical'),
                   'unpaid',    count(*) filter (where t.is_unpaid),
                   'all',       count(*))
          from tagged t)
  into v_total, v_rows, v_counts;

  return jsonb_build_object(
    'module_state', app.flag_state('installments')::text,
    'filter', v_filter,
    'limit', v_limit,
    -- Printed beside the queue on purpose: a tolerance nobody can see is a rule nobody agreed to.
    'grace_days', v_grace,
    'reminder_days', v_remind,
    'late1_missed', greatest(app.setting_int('installments.late_stage1_missed', 1), 1),
    'late2_missed', greatest(app.setting_int('installments.late_stage2_missed', 2), 1),
    'matched', v_total,
    'capped', v_total > v_limit,
    'counts', v_counts,
    'rows', v_rows);
end $$;
revoke execute on function public.staff_installments(text, integer) from public, anon;
grant execute on function public.staff_installments(text, integer) to authenticated;

comment on function public.staff_installments(text, integer) is
  'The Finance and Legal queue of instalments needing attention (report v3 §31, v2 §36), late first. Filters: attention · due_soon · overdue · critical · unpaid · all. Every threshold it judged by is returned with it, because a tolerance nobody can see is a rule nobody agreed to. No module gate; a commercial sees only their own files.';

-- The two sockets 0068 already cut. staff_zitounti_file today says
--   'contracts', app.zitounti_section(case when app.module_open('contracts') then 'not_built' else 'phase_later' end, null)
-- and the same for 'installments'. Swapping those two lines for these two readers is a two-line edit in
-- whoever owns 0068 — replacing that whole function from here would collide with another session.
create or replace function app.zitounti_contracts(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'reference_no', c.reference_no,
           'kind_label', c.kind_label_ar,
           'status', c.status::text,
           'status_label', coalesce(coalesce(app.setting('contracts.status_labels'), '{}'::jsonb)->>c.status::text,
                                    c.status::text),
           'offer_code', (select pj.code from public.projects pj where pj.id = c.project_id),
           'trees_count', c.trees_count,
           'total_price_millimes', c.total_price_millimes,
           'signed_on', c.signed_on,
           'owned_at', c.owned_at)
         order by c.created_at desc), '[]'::jsonb)
  from public.contracts c
  where c.person_id = p_person and c.status <> 'cancelled'
$$;
revoke execute on function app.zitounti_contracts(uuid) from public, anon, authenticated;

create or replace function app.zitounti_installments(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'contract_no', c.reference_no,
           'money', app.contract_money(c.id))
         order by c.created_at desc), '[]'::jsonb)
  from public.contracts c
  where c.person_id = p_person
    and c.payment_mode = 'installments' and c.status in ('signed', 'completed')
$$;
revoke execute on function app.zitounti_installments(uuid) from public, anon, authenticated;

comment on function app.zitounti_installments(uuid) is
  'The client''s own schedule for «زيتونتي» (0068''s labelled socket). Reads app.contract_money, so it shows exactly what the Back Office shows and cannot drift from it.';

-- ---------------------------------------------------------------------------
-- 9 · Writers — every one module-gated, role-gated, reasoned and audited
-- ---------------------------------------------------------------------------

create or replace function app.assert_contracts_open() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.module_open('contracts') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.assert_contracts_open() from public, anon, authenticated;

create or replace function app.assert_installments_open() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.module_open('installments') then
    raise exception 'module_closed' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.assert_installments_open() from public, anon, authenticated;

-- The inventory half of the contract moment. NOT public.staff_set_tree_state: that takes an explicit uuid[]
-- capped at 1000 ids, and TX-00215 holds 8,000 trees, so a contract for a whole offer could not be written at
-- all. Called only from staff_create_contract, which has already done the role check — which is why this lives
-- in app and is revoked from everybody.
create or replace function app.sell_reservation_trees(p_reservation uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_n   integer := 0;
begin
  select array_agg(t.id order by t.id) into v_ids
  from public.trees t
  where t.reservation_id = p_reservation and t.state = 'reserved';

  if v_ids is null then
    return 0;
  end if;

  -- Locked in id order, exactly as staff_set_tree_state and staff_close_reservation do, so two staff acting
  -- on overlapping work queue instead of deadlocking.
  perform 1 from public.trees t where t.id = any (v_ids) order by t.id for update;

  -- held_by, request_id and allocated_at are kept: the trigger app.trees_clear_reservation only clears the
  -- reservation link on state 'available', so the tree → reservation → contract chain survives the sale and
  -- app.contract_payload can read a contract's own trees.
  update public.trees t set state = 'sold', updated_by = auth.uid()
  where t.id = any (v_ids) and t.state = 'reserved';
  get diagnostics v_n = row_count;

  return v_n;
end $$;
revoke execute on function app.sell_reservation_trees(uuid) from public, anon, authenticated;

-- What one tree of this offer costs, for a contract. First the price the client was actually quoted, which is
-- on their demand; then the offer's own live price when there was no demand (a walk-in). Never a figure typed
-- by staff, and never a number this file works out.
create or replace function app.contract_price_per_tree(p_project uuid, p_request uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_price bigint;
  v_class uuid;
  v_n     integer;
  v_quote jsonb;
begin
  -- 1 · the snapshot on the demand: what this client was told, which is what they agreed to.
  select r.price_per_tree_millimes, r.spacing_class_id into v_price, v_class
  from public.interest_requests r where r.id = p_request;
  if v_price is not null and v_price > 0 then
    return v_price;
  end if;

  -- 2 · no demand, or a demand taken before the offer was priced: the offer's own price today, computed by
  -- app.tree_price — the same function the offer page and submit_offer_request read.
  if v_class is null then
    select count(*)::integer into v_n
    from public.project_spacing_classes pc
    join public.tree_spacing_classes sc on sc.id = pc.spacing_class_id and sc.is_active
    where pc.project_id = p_project;
    -- More than one planting density and no demand naming which: the price is genuinely ambiguous and the
    -- caller is told so rather than handed one of them.
    if coalesce(v_n, 0) <> 1 then
      return null;
    end if;
    select pc.spacing_class_id into v_class
    from public.project_spacing_classes pc
    join public.tree_spacing_classes sc on sc.id = pc.spacing_class_id and sc.is_active
    where pc.project_id = p_project limit 1;
  end if;

  v_quote := app.tree_price(v_class, p_project);
  if coalesce((v_quote->>'ok')::boolean, false) then
    return (v_quote->>'price_per_tree_millimes')::bigint;
  end if;
  return null;
end $$;
revoke execute on function app.contract_price_per_tree(uuid, uuid) from public, anon, authenticated;

-- §29's anchor. The RULE is a setting because neither document names one; this resolves it for ONE contract,
-- and an explicit date always wins so Finance can answer per file whatever the rule says.
create or replace function app.contract_first_due(p_signed_on date, p_override date) returns date
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rule   text    := lower(btrim(coalesce(app.setting_text('installments.first_due_rule', 'manual'), 'manual')));
  v_offset integer := greatest(app.setting_int('installments.first_due_offset_days', 0), 0);
  v_base   date;
begin
  if p_override is not null then
    return p_override;
  end if;
  if p_signed_on is null then
    return null;
  end if;
  v_base := case v_rule
              when 'signature_plus_month' then (p_signed_on + interval '1 month')::date
              when 'first_of_next_month'  then (date_trunc('month', p_signed_on::timestamp)
                                                + interval '1 month')::date
            end;
  -- 'manual' — and anything the owner has not chosen — returns null on purpose. The caller raises
  -- first_due_date_required, which is «ask» and not «guess».
  if v_base is null then
    return null;
  end if;
  return v_base + v_offset;
end $$;
revoke execute on function app.contract_first_due(date, date) from public, anon, authenticated;

-- §29, generated from the contract's own frozen columns and from nothing else. Idempotent the way
-- staff_generate_trees is: running it twice produces one schedule.
create or replace function app.generate_contract_schedule(p_contract uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.contracts;
  v_n integer := 0;
begin
  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;
  -- A cash contract has a total, a down payment of the whole amount and ZERO schedule rows. The presence of
  -- rows — not a flag — is what distinguishes the two modes (v3 §51: «Prix cash» is a real answer).
  if v_c.payment_mode <> 'installments' then
    return 0;
  end if;
  if exists (select 1 from public.contract_installments i where i.contract_id = p_contract) then
    return 0;
  end if;
  if v_c.first_due_on is null then
    raise exception 'first_due_date_required' using errcode = 'P0001';
  end if;

  -- Not one division, not one rounding: the count, the monthly and the last instalment are all read from the
  -- snapshot app.financed_quote wrote at creation. A schedule of monthly × duration_months would overcharge
  -- four of the five live plans on this database.
  insert into public.contract_installments (contract_id, seq, due_on, amount_millimes)
  select p_contract,
         n,
         -- Counted from one fixed anchor rather than month by month, so a 31st never drifts to the 28th and
         -- stay there. Africa/Tunis is the product's clock everywhere.
         (v_c.first_due_on + make_interval(months => n - 1))::date,
         case when n < v_c.installments_count then v_c.monthly_millimes
              else v_c.last_installment_millimes end
  from generate_series(1, v_c.installments_count) as n;
  get diagnostics v_n = row_count;

  update public.contracts c set schedule_generated_at = now(), updated_by = auth.uid()
  where c.id = p_contract;

  return v_n;
end $$;
revoke execute on function app.generate_contract_schedule(uuid) from public, anon, authenticated;

-- Recomputes what the money says and moves the contract between 'signed' and 'completed' accordingly. Called
-- from the payment RPCs — a HUMAN act every time — and never from a trigger or a job.
create or replace function app.contract_settle_state(p_contract uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c     public.contracts;
  v_money jsonb := app.contract_money(p_contract);
begin
  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found or v_c.status in ('draft', 'cancelled') then
    return;
  end if;
  if coalesce((v_money->>'is_settled')::boolean, false) and v_c.status = 'signed' then
    update public.contracts c set status = 'completed', settled_at = coalesce(c.settled_at, now()),
                                  updated_by = auth.uid()
    where c.id = p_contract;
  elsif not coalesce((v_money->>'is_settled')::boolean, false) and v_c.status = 'completed' then
    -- Voiding a receipt takes «تخلّص كامل» back with it, the way voiding a عربون takes «Deposit Paid» back.
    -- Ownership is NOT touched: v2 §38 makes it a legal act, and a payment problem is not a legal decision.
    update public.contracts c set status = 'signed', settled_at = null, updated_by = auth.uid()
    where c.id = p_contract;
  end if;
end $$;
revoke execute on function app.contract_settle_state(uuid) from public, anon, authenticated;

-- ─── The act itself: a reservation becomes a contract, its trees become the client's, in ONE transaction ───
create or replace function public.staff_create_contract(
  p_reservation uuid, p_kind uuid, p_payment_mode text, p_down_payment_millimes bigint,
  p_duration_months integer, p_method uuid, p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_r        public.reservations;
  v_req      public.interest_requests;
  v_kind     public.option_items;
  v_method   public.option_items;
  v_mode     text;
  v_trees    integer;
  v_per_tree bigint;
  v_total    bigint;
  v_down     bigint;
  v_pct      numeric;
  v_months   integer;
  v_quote    jsonb;
  v_credit   bigint := 0;
  v_deposit  bigint;
  v_ref      text;
  v_year     text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_id       uuid;
  v_sold     integer;
begin
  perform app.assert_contracts_open();

  select * into v_r from public.reservations r where r.id = p_reservation for no key update;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  -- 0054: «Marking a tree sold is the contract moment», so Legal, Finance and Admin — intersected with the
  -- files the caller may read. The commercial who sold the deal cannot sign it; that is the rule, not a bug.
  if not (app.can_contract_trees() and app.can_see_person(v_r.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- 'converted' is written here and nowhere else in the database. staff_close_reservation refuses that value
  -- by name and points at this module.
  if v_r.status not in ('awaiting_deposit', 'deposit_paid') then
    raise exception 'reservation_not_convertible' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.contracts c where c.reservation_id = v_r.id) then
    raise exception 'reservation_already_contracted' using errcode = 'P0001';
  end if;
  if app.setting_bool('contracts.require_deposit_paid', true) and v_r.status = 'awaiting_deposit' then
    raise exception 'deposit_not_paid' using errcode = 'P0001';
  end if;

  -- The trees actually held right now, not the number the reservation remembers taking: if some were released
  -- from the offer's own screen in the meantime, the contract is written for what is really there (§46).
  select count(*)::integer into v_trees
  from public.trees t where t.reservation_id = v_r.id and t.state = 'reserved';
  if coalesce(v_trees, 0) < 1 then
    raise exception 'no_trees_to_contract' using errcode = 'P0001';
  end if;

  if v_r.request_id is not null then
    select * into v_req from public.interest_requests r where r.id = v_r.request_id;
  end if;

  if p_kind is not null then
    v_kind := app.active_option('contract_kind', p_kind::text);
    if v_kind.id is null then
      raise exception 'invalid_contract_kind' using errcode = 'P0001';
    end if;
  else
    -- v3 §28's «عقد وعد بالبيع» is the first row of the list, and the owner may reorder or add to it.
    select * into v_kind from public.option_items o
    where o.list_key = 'contract_kind' and o.is_active order by o.sort_order, o.code limit 1;
  end if;

  if p_method is not null then
    v_method := app.active_option('payment_method', p_method::text);
    if v_method.id is null then
      raise exception 'invalid_payment_method' using errcode = 'P0001';
    end if;
  end if;

  -- §34 «Total Price», from the price this client was quoted times the trees they are actually taking.
  v_per_tree := app.contract_price_per_tree(v_r.project_id, v_r.request_id);
  if v_per_tree is null or v_per_tree <= 0 then
    raise exception 'contract_price_unavailable' using errcode = 'P0001';
  end if;
  v_total := v_per_tree * v_trees;

  -- «Not answering is an answer» — 0061's own rule. Nothing defaults to cash silently.
  v_mode := lower(nullif(btrim(coalesce(p_payment_mode, coalesce(v_req.payment_mode, ''))), ''));
  if v_mode is null then
    raise exception 'payment_mode_required' using errcode = 'P0001';
  end if;
  if v_mode not in ('cash', 'installments') then
    raise exception 'invalid_payment_mode' using errcode = 'P0001';
  end if;

  if v_mode = 'cash' then
    -- A cash contract: a total, a down payment of the whole amount, and zero schedule rows.
    v_down := v_total;
  else
    v_down := coalesce(p_down_payment_millimes, v_req.down_payment_amount_millimes);
    if v_down is null then
      raise exception 'down_payment_required' using errcode = 'P0001';
    end if;
    v_months := coalesce(p_duration_months, v_req.duration_months);
    if v_months is null then
      raise exception 'duration_required' using errcode = 'P0001';
    end if;

    -- ONCE. Ten keys in, ten keys frozen onto the row. app.financed_quote is never called for this contract
    -- again: it reads financing_markups and tree_pricing_rules, which the owner edits.
    v_quote := app.financed_quote(v_total, v_down, v_months, v_r.project_id);
    if not coalesce((v_quote->>'ok')::boolean, false) then
      -- duration_not_priced · down_covers_total · too_many_months · invalid_input, each with its own sentence.
      raise exception '%', coalesce(v_quote->>'reason', 'invalid_input') using errcode = 'P0001';
    end if;
    v_pct := case when v_total > 0 then round(v_down::numeric * 100 / v_total, 3) end;
  end if;

  -- The owner's open question, resolved once and frozen: if he says the عربون counts, what was actually paid
  -- on this reservation is credited against the down payment, capped by it. If he says it does not (today's
  -- answer), the credit is zero and both figures stay visible side by side, never summed.
  if app.setting_bool('contracts.deposit_counts_toward_down_payment', false) then
    select coalesce(sum(p.amount_millimes), 0)::bigint into v_deposit
    from public.payments p
    where p.reservation_id = v_r.id and p.kind = 'deposit' and p.voided_at is null;
    v_credit := least(coalesce(v_deposit, 0), v_down);
  end if;

  v_ref := app.setting_text('contract_no.prefix', 'AGZ-CTR') || '-' || v_year || '-'
           || lpad(app.next_number('contract:' || v_year)::text, 6, '0');

  insert into public.contracts (
    reference_no, reservation_id, person_id, project_id, request_id,
    kind_option_id, kind_label_ar, status, trees_count,
    method_option_id, method_label_ar,
    payment_mode, price_per_tree_millimes, total_price_millimes,
    down_payment_millimes, down_payment_percent, deposit_credited_millimes,
    markup_bp, duration_months, total_financed_millimes, remaining_millimes,
    monthly_millimes, last_installment_millimes, installments_count, plan_shortened,
    note, created_by, updated_by
  ) values (
    v_ref, v_r.id, v_r.person_id, v_r.project_id, v_r.request_id,
    v_kind.id, v_kind.label_ar, 'draft', v_trees,
    v_method.id, v_method.label_ar,
    v_mode, v_per_tree, v_total,
    v_down, v_pct, v_credit,
    (v_quote->>'markup_bp')::integer,
    case when v_mode = 'installments' then v_months end,
    (v_quote->>'total_financed_millimes')::bigint,
    (v_quote->>'remaining_millimes')::bigint,
    (v_quote->>'monthly_millimes')::bigint,
    (v_quote->>'last_installment_millimes')::bigint,
    (v_quote->>'installments_count')::integer,
    (v_quote->>'shortened')::boolean,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), auth.uid()
  ) returning id into v_id;

  -- (b) The doorway. reservations_closed_check is a biconditional, so status and closed_at move together or
  -- the transaction fails at commit with an error nobody has an Arabic sentence for. trees_released stays
  -- FALSE: conversion does not release trees, it sells them.
  update public.reservations r
     set status = 'converted',
         closed_at = now(),
         closed_by = auth.uid(),
         close_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by = auth.uid()
   where r.id = v_r.id;

  -- (c) The inventory. Same transaction: a contract whose trees were never sold cannot exist, and neither can
  -- trees sold for a contract that was not written.
  v_sold := app.sell_reservation_trees(v_r.id);

  perform app.write_audit('contracts.create', 'contracts', v_id::text, null,
                          jsonb_build_object('reference_no', v_ref, 'reservation_id', v_r.id,
                                             'person_id', v_r.person_id, 'project_id', v_r.project_id,
                                             'payment_mode', v_mode, 'trees', v_trees,
                                             'price_per_tree_millimes', v_per_tree,
                                             'total_price_millimes', v_total,
                                             'down_payment_millimes', v_down,
                                             'deposit_credited_millimes', v_credit,
                                             'quote', v_quote, 'trees_sold', v_sold),
                          null);

  -- §32 «العقد جاهز». Enqueued only; there is no sending worker, so no screen may claim it was delivered.
  perform app.enqueue_message('contract.ready',
            (select ps.phone_e164 from public.persons ps where ps.id = v_r.person_id),
            jsonb_build_object('name', (select ps.full_name from public.persons ps where ps.id = v_r.person_id),
                               'contract_no', v_ref),
            'contracts', v_id);

  return app.contract_payload(v_id);
end $$;
revoke execute on function public.staff_create_contract(uuid, uuid, text, bigint, integer, uuid, text, text) from public, anon;
grant execute on function public.staff_create_contract(uuid, uuid, text, bigint, integer, uuid, text, text) to authenticated;

comment on function public.staff_create_contract(uuid, uuid, text, bigint, integer, uuid, text, text) is
  'Turns one reservation into one contract (v2 §34, §49): snapshots the price and — for an instalment plan — all ten keys of app.financed_quote, sets that reservation to ''converted'' with its closed_at, and sells its still-held trees, all in ONE transaction. p_payment_mode, p_down_payment_millimes and p_duration_months default to the demand behind the reservation when it has them. Legal, Finance, Admin and Super Admin, on a file they may see. Refused while the `contracts` module is disabled (module_closed).';

-- §34 «Signature Date» and «Legal document reference». A date and a text — no e-signature: v2 §34 asks for
-- nothing more, and v3 §45 gives the commercial «Generate Contract Request», a request rather than an
-- issuance. The database never infers a signature from anything.
create or replace function public.staff_sign_contract(
  p_contract uuid, p_signed_on date, p_legal_ref text, p_first_due_on date, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c     public.contracts;
  v_day   date;
  v_first date;
  v_n     integer := 0;
begin
  perform app.assert_contracts_open();

  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_c.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_c.status <> 'draft' then
    raise exception 'contract_not_draft' using errcode = 'P0001';
  end if;

  v_day := coalesce(p_signed_on, (now() at time zone 'Africa/Tunis')::date);

  if v_c.payment_mode = 'installments' then
    v_first := app.contract_first_due(v_day, p_first_due_on);
    if v_first is null then
      -- «ask», not «guess»: installments.first_due_rule is 'manual' until the owner chooses a rule, and every
      -- stage of §31 counts from this date.
      raise exception 'first_due_date_required' using errcode = 'P0001';
    end if;
    if v_first < v_day then
      raise exception 'first_due_before_signature' using errcode = 'P0001';
    end if;
  end if;

  update public.contracts c
     set status = 'signed',
         signed_on = v_day,
         signed_by = auth.uid(),
         legal_document_ref = nullif(btrim(coalesce(p_legal_ref, '')), ''),
         first_due_on = v_first,
         updated_by = auth.uid()
   where c.id = v_c.id;

  -- §29 «بعد العقد، يتولد Schedule كامل» — in the same transaction, when the instalments module is open. When
  -- it is not, the contract is signed anyway and the payload says schedule_pending, so the owner can switch
  -- `installments` on later and staff_generate_schedule fills it without touching the signature.
  if v_c.payment_mode = 'installments' and app.module_open('installments') then
    v_n := app.generate_contract_schedule(v_c.id);
  end if;

  perform app.write_audit('contracts.sign', 'contracts', v_c.id::text,
                          jsonb_build_object('status', v_c.status::text),
                          jsonb_build_object('status', 'signed', 'signed_on', v_day,
                                             'legal_document_ref', nullif(btrim(coalesce(p_legal_ref, '')), ''),
                                             'first_due_on', v_first, 'installments_written', v_n),
                          null);

  perform app.enqueue_message('contract.signed',
            (select ps.phone_e164 from public.persons ps where ps.id = v_c.person_id),
            jsonb_build_object('name', (select ps.full_name from public.persons ps where ps.id = v_c.person_id),
                               'contract_no', v_c.reference_no,
                               'signed_on', to_char(v_day, 'YYYY-MM-DD'),
                               'trees', v_c.trees_count::text),
            'contracts', v_c.id);

  return app.contract_payload(v_c.id);
end $$;
revoke execute on function public.staff_sign_contract(uuid, date, text, date, text) from public, anon;
grant execute on function public.staff_sign_contract(uuid, date, text, date, text) to authenticated;

comment on function public.staff_sign_contract(uuid, date, text, date, text) is
  'Records that a contract was signed (v2 §34): the date, the notary or registry reference a human types, and the day the first instalment falls due. Generates the schedule in the same transaction when the `installments` module is open. No e-signature — the spec grants the software a date and a text and nothing more. Legal, Finance, Admin and Super Admin.';

-- §29 again, as its own act, for the case where `installments` was switched on after a contract was signed.
-- Idempotent: running it twice produces one schedule.
create or replace function public.staff_generate_schedule(p_contract uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.contracts;
  v_n integer;
begin
  perform app.assert_installments_open();

  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_c.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_c.status not in ('signed', 'completed') then
    raise exception 'contract_not_signed' using errcode = 'P0001';
  end if;
  if v_c.payment_mode <> 'installments' then
    raise exception 'contract_is_cash' using errcode = 'P0001';
  end if;

  v_n := app.generate_contract_schedule(v_c.id);

  perform app.write_audit('installments.generate', 'contracts', v_c.id::text, null,
                          jsonb_build_object('installments_written', v_n,
                                             'first_due_on', v_c.first_due_on,
                                             'installments_count', v_c.installments_count), null);

  return app.contract_payload(v_c.id);
end $$;
revoke execute on function public.staff_generate_schedule(uuid, text) from public, anon;
grant execute on function public.staff_generate_schedule(uuid, text) to authenticated;

comment on function public.staff_generate_schedule(uuid, text) is
  'Writes the instalment schedule of a signed contract from its own frozen snapshot (report v3 §29). Idempotent — a second call writes nothing and returns the same contract. Nothing is divided or rounded here: the count, the monthly and the different last instalment all come from app.financed_quote''s output, stored at creation.';

-- §30 «لازم كل دفع يكون عنده Reference و Receipt», and §59's three receipt kinds — عربون · تسبقة · قسط — which
-- are already public.payment_kind values with their Arabic already in settings. The receipt IS the payments
-- row: neither document asks for a rendered document, only for a traceable record.
create or replace function public.staff_record_installment(
  p_contract uuid, p_installment uuid, p_kind text, p_amount_millimes bigint, p_method uuid,
  p_received_at timestamptz, p_reference text, p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c      public.contracts;
  v_i      public.contract_installments;
  v_method public.option_items;
  v_kind   public.payment_kind;
  v_money  jsonb;
  v_paid   bigint;
  v_cap    bigint;
  v_ref    text;
  v_year   text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_id     uuid;
begin
  perform app.assert_installments_open();

  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;
  -- 0063: «signing the contract and taking the cash are two different desks». A legal user may sign this
  -- contract and may not record a millime of it.
  if not (app.can_record_money() and app.can_see_person(v_c.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_c.status = 'cancelled' then
    raise exception 'contract_cancelled' using errcode = 'P0001';
  end if;

  begin
    v_kind := nullif(btrim(coalesce(p_kind, '')), '')::public.payment_kind;
  exception when invalid_text_representation then
    raise exception 'invalid_payment_kind' using errcode = 'P0001';
  end;
  -- The عربون belongs to a reservation and is recorded by staff_record_deposit; this function is the contract
  -- side and takes only the two kinds a contract knows.
  if v_kind is null or v_kind not in ('down_payment', 'installment') then
    raise exception 'invalid_payment_kind' using errcode = 'P0001';
  end if;
  if p_amount_millimes is null or p_amount_millimes <= 0 then
    raise exception 'invalid_payment_amount' using errcode = 'P0001';
  end if;

  if p_method is not null then
    v_method := app.active_option('payment_method', p_method::text);
    if v_method.id is null then
      raise exception 'invalid_payment_method' using errcode = 'P0001';
    end if;
  end if;

  if p_installment is not null then
    select * into v_i from public.contract_installments i
    where i.id = p_installment and i.contract_id = v_c.id;
    if not found then
      raise exception 'installment_not_found' using errcode = 'P0001';
    end if;
  end if;

  v_money := app.contract_money(v_c.id);
  if v_kind = 'installment' then
    if coalesce((v_money->>'installments_count')::integer, 0) = 0 then
      raise exception 'schedule_not_generated' using errcode = 'P0001';
    end if;
    v_paid := (v_money->>'installments_paid_millimes')::bigint;
    v_cap  := (v_money->>'scheduled_millimes')::bigint;
  else
    v_paid := (v_money->>'down_payment_paid_millimes')::bigint;
    v_cap  := (v_money->>'down_payment_due_millimes')::bigint;
  end if;
  -- Taking more than is owed would leave a negative balance the waterfall cannot express, and would hide a
  -- keying mistake as a credit. The fix is to correct the amount, not to absorb it.
  if v_paid + p_amount_millimes > v_cap then
    raise exception 'amount_over_due' using errcode = 'P0001';
  end if;

  v_ref := app.setting_text('payment_no.prefix', 'AGZ-PAY') || '-' || v_year || '-'
           || lpad(app.next_number('payment:' || v_year)::text, 6, '0');

  insert into public.payments (
    reference_no, reservation_id, contract_id, installment_id, person_id, project_id, kind, amount_millimes,
    method_option_id, method_label_ar, reference, received_at, note, recorded_by, updated_by
  ) values (
    -- reservation_id stays null: 0063 left it nullable for exactly this row, and the contract is the link.
    v_ref, null, v_c.id, v_i.id, v_c.person_id, v_c.project_id, v_kind, p_amount_millimes,
    v_method.id, v_method.label_ar, nullif(btrim(coalesce(p_reference, '')), ''),
    coalesce(p_received_at, now()), nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), auth.uid()
  ) returning id into v_id;

  -- Derived, here, from the live rows — so voiding this receipt takes «تخلّص كامل» back with it and there is
  -- never a second truth about what a client has paid.
  perform app.contract_settle_state(v_c.id);

  perform app.write_audit('payments.record', 'payments', v_id::text, null,
                          jsonb_build_object('reference_no', v_ref, 'contract_id', v_c.id,
                                             'installment_id', v_i.id, 'person_id', v_c.person_id,
                                             'kind', v_kind::text, 'amount_millimes', p_amount_millimes,
                                             'method', v_method.label_ar,
                                             'received_at', coalesce(p_received_at, now()),
                                             'paid_before_millimes', v_paid, 'cap_millimes', v_cap),
                          null);

  perform app.enqueue_message('payment.received',
            (select ps.phone_e164 from public.persons ps where ps.id = v_c.person_id),
            jsonb_build_object('name', (select ps.full_name from public.persons ps where ps.id = v_c.person_id),
                               'amount', p_amount_millimes::text,
                               'contract_no', v_c.reference_no, 'payment_no', v_ref),
            'installments', v_id);

  return app.contract_payload(v_c.id);
end $$;
revoke execute on function public.staff_record_installment(uuid, uuid, text, bigint, uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.staff_record_installment(uuid, uuid, text, bigint, uuid, timestamptz, text, text, text) to authenticated;

comment on function public.staff_record_installment(uuid, uuid, text, bigint, uuid, timestamptz, text, text, text) is
  'Records money received against a contract (report v3 §30, §59): kind ''down_payment'' or ''installment'', amount in millimes, method from the option list payment_method, when it arrived and its bank reference. p_installment names which line Finance was collecting — it goes on the receipt and into the audit row, while the balances themselves stay a waterfall over the live payments. Refuses more than is owed (amount_over_due). Finance, Admin and Super Admin, on a file they may see.';

-- Correcting a receipt without erasing it (§59: every movement leaves a trace). This REPLACES 0063's function
-- and keeps its reservation branch exactly as it was, adding the contract branch beside it. The module gate
-- now follows the row: a عربون is refused while `reservations` is off, a contract payment while `installments`
-- is off, so switching one module off never blocks a correction in the other.
create or replace function public.staff_void_payment(p_payment uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_p    public.payments;
  v_r    public.reservations;
  v_paid bigint;
begin
  select * into v_p from public.payments p where p.id = p_payment for no key update;
  if not found then
    -- The gate cannot follow a row that does not exist. `reservations` is the module this function shipped in
    -- and is checked here so an unknown id behaves exactly as it did before stage 3.
    perform app.assert_reservations_open();
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  if v_p.contract_id is not null then
    perform app.assert_installments_open();
  else
    perform app.assert_reservations_open();
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

  -- 0063's branch, unchanged.
  if v_p.reservation_id is not null then
    select * into v_r from public.reservations r where r.id = v_p.reservation_id for no key update;
    select coalesce(sum(p.amount_millimes), 0)::bigint into v_paid
    from public.payments p
    where p.reservation_id = v_r.id and p.kind = 'deposit' and p.voided_at is null;

    -- A closed reservation keeps its closing status: voiding a receipt does not reopen a cancelled hold.
    -- (0063's own comment, restored. The code below was carried across verbatim but this line was not, and
    -- without it the status filter reads like a narrowing somebody could safely widen. It is not.)
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

  -- The contract branch. Nothing is repaired and nothing is reallocated: the waterfall in app.contract_money
  -- simply stops seeing this row, so every line it touched goes back on its own. All that can change is
  -- whether the contract is still «تخلّص كامل».
  if v_p.contract_id is not null then
    perform app.contract_settle_state(v_p.contract_id);
  end if;

  perform app.write_audit('payments.void', 'payments', v_p.id::text,
                          to_jsonb(v_p),
                          jsonb_build_object('voided_at', now(), 'deposit_paid_millimes', v_paid), null);

  return case when v_p.contract_id is not null then app.contract_payload(v_p.contract_id)
              when v_p.reservation_id is not null then app.reservation_payload(v_p.reservation_id)
              else jsonb_build_object('payment_id', v_p.id, 'voided', true) end;
end $$;
revoke execute on function public.staff_void_payment(uuid, text) from public, anon;
grant execute on function public.staff_void_payment(uuid, text) to authenticated;

comment on function public.staff_void_payment(uuid, text) is
  'Marks a recorded payment void, keeping the row, and lets every derived figure fall back on its own — the reservation''s deposit status (0063''s branch, unchanged) or the contract''s settlement. The way a wrong amount is corrected: void it and record the right one, so the audit trail keeps both (§59). Gated by the module the payment belongs to. Finance, Admin and Super Admin.';

-- v3 §58 asks «من عدل القسط؟» by name, which presumes a schedule line can be edited after it exists. It can —
-- a client asks to move a date, or Finance agrees a different amount — but never quietly: the schedule's rows
-- must still sum to exactly what the contract froze, so an edit can rearrange a plan and can never change what
-- was agreed.
create or replace function public.staff_update_installment(
  p_installment uuid, p_due_on date, p_amount_millimes bigint, p_note text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_i      public.contract_installments;
  v_c      public.contracts;
  v_money  jsonb;
  v_line   jsonb;
  v_amount bigint;
  v_due    date;
  v_total  bigint;
begin
  perform app.assert_installments_open();

  select * into v_i from public.contract_installments i where i.id = p_installment for no key update;
  if not found then
    raise exception 'installment_not_found' using errcode = 'P0001';
  end if;
  select * into v_c from public.contracts c where c.id = v_i.contract_id for no key update;
  if not (app.can_record_money() and app.can_see_person(v_c.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_c.status = 'cancelled' then
    raise exception 'contract_cancelled' using errcode = 'P0001';
  end if;

  v_amount := coalesce(p_amount_millimes, v_i.amount_millimes);
  v_due    := coalesce(p_due_on, v_i.due_on);
  if v_amount <= 0 then
    raise exception 'invalid_payment_amount' using errcode = 'P0001';
  end if;

  -- Money already allocated to this line cannot be un-allocated by shrinking it.
  v_money := app.contract_money(v_c.id);
  select line into v_line
  from jsonb_array_elements(coalesce(v_money->'lines', '[]'::jsonb)) as line
  where (line->>'id')::uuid = v_i.id;
  if coalesce((v_line->>'paid_millimes')::bigint, 0) > v_amount then
    raise exception 'amount_below_paid' using errcode = 'P0001';
  end if;

  -- The frozen total is the ceiling and the floor. An edit redistributes; it never re-prices.
  select coalesce(sum(case when i.id = v_i.id then v_amount else i.amount_millimes end), 0)::bigint
  into v_total
  from public.contract_installments i where i.contract_id = v_c.id;
  if v_total <> v_c.remaining_millimes then
    raise exception 'schedule_total_mismatch' using errcode = 'P0001';
  end if;

  update public.contract_installments i
     set due_on = v_due, amount_millimes = v_amount,
         note = nullif(btrim(coalesce(p_note, i.note)), ''), updated_by = auth.uid()
   where i.id = v_i.id;

  perform app.write_audit('installments.update', 'contract_installments', v_i.id::text,
                          jsonb_build_object('due_on', v_i.due_on, 'amount_millimes', v_i.amount_millimes),
                          jsonb_build_object('due_on', v_due, 'amount_millimes', v_amount,
                                             'schedule_total_millimes', v_total), null);

  return app.contract_payload(v_c.id);
end $$;
revoke execute on function public.staff_update_installment(uuid, date, bigint, text, text) from public, anon;
grant execute on function public.staff_update_installment(uuid, date, bigint, text, text) to authenticated;

comment on function public.staff_update_installment(uuid, date, bigint, text, text) is
  'Moves one instalment''s date or amount (report v3 §58 «من عدل القسط؟»), with a reason and an audit row carrying the old and new values. Refuses to drop a line below what has already been paid against it, and refuses any edit that would make the schedule stop summing to the contract''s frozen remaining_millimes — an edit redistributes a plan, it never re-prices one. Finance, Admin and Super Admin.';

-- §31 and v2 §36, twice each: «لا يوجد فسخ آلي», «ما نخليوش النظام يلغي الملكية أو العقد قانونياً وحده». So
-- ending a contract is a HUMAN act with a reason, and there is no scheduler anywhere in this file that could
-- do it. Releasing the trees is part of the same act and the same transaction, for the reason 0063 gives: two
-- RPCs from TypeScript is how you get a cancelled contract whose trees are still sold.
--
-- The reservation is NOT resurrected. It became a contract, and the contract died; a new hold is a new
-- reservation. reservations_closed_check would also refuse to reopen it without contradicting its own record.
create or replace function public.staff_cancel_contract(
  p_contract uuid, p_release boolean, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c       public.contracts;
  v_release boolean := coalesce(p_release, true);
  v_ids     uuid[];
  v_freed   integer := 0;
begin
  perform app.assert_contracts_open();

  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;
  -- Signing ∩ taking money ∩ stock keeping ∩ file visibility = Finance, Admin, Super Admin. Written as one
  -- check with this comment, the way staff_close_reservation writes its own intersection: a Legal user may
  -- sign a contract and may not unwind one, because unwinding puts inventory back.
  if not (app.can_contract_trees() and app.can_record_money() and app.can_manage_trees()
          and app.can_see_person(v_c.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_c.status = 'cancelled' then
    raise exception 'contract_closed' using errcode = 'P0001';
  end if;
  if v_c.owned_at is not null then
    -- The client already owns these trees (v2 §38). Undoing that is a legal act outside this software, and a
    -- button that pretended otherwise would be the «Auto-delete» §31 rejects, with a human finger on it.
    raise exception 'contract_owned' using errcode = 'P0001';
  end if;

  -- Only this contract's own trees, and only the ones it actually sold.
  select array_agg(t.id order by t.id) into v_ids
  from public.trees t where t.reservation_id = v_c.reservation_id and t.state = 'sold';

  if v_release and v_ids is not null then
    perform 1 from public.trees t where t.id = any (v_ids) order by t.id for update;
    -- reservation_id is cleared by the trees_reservation_unlink trigger the moment the state is 'available'.
    update public.trees t
       set state = 'available', held_by = null, request_id = null, allocated_at = null, updated_by = auth.uid()
     where t.id = any (v_ids);
    get diagnostics v_freed = row_count;
  end if;

  update public.contracts c
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         trees_released = v_release and v_freed > 0,
         updated_by = auth.uid()
   where c.id = v_c.id;

  perform app.write_audit('contracts.cancel', 'contracts', v_c.id::text,
                          jsonb_build_object('status', v_c.status::text),
                          jsonb_build_object('status', 'cancelled', 'released', v_release,
                                             'trees_freed', v_freed, 'tree_ids', to_jsonb(v_ids)), null);

  return app.contract_payload(v_c.id);
end $$;
revoke execute on function public.staff_cancel_contract(uuid, boolean, text) from public, anon;
grant execute on function public.staff_cancel_contract(uuid, boolean, text) to authenticated;

comment on function public.staff_cancel_contract(uuid, boolean, text) is
  'Ends a contract (report v3 §31, v2 §36 — a human act, never the system''s: «لا يوجد فسخ آلي»). p_release true also puts its sold trees back to available in the SAME transaction, so a dead contract can never leave stock frozen. Refuses a contract whose ownership has already completed. The reservation is not reopened: it became a contract, and a new hold is a new reservation. Finance, Admin and Super Admin.';

-- v2 §38: «بعد اكتمال الشروط القانونية: Parcel status: Owned ويتفتح للحريف: زيتونتي». A LATER act, separate
-- from the signature and from the last instalment — the spec separates all three — and the key «زيتونتي»
-- should open on. No fourth tree state: 0054 considered 'contracting' and left it out.
create or replace function public.staff_set_contract_owned(
  p_contract uuid, p_owned_on date, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c   public.contracts;
  v_day timestamptz;
begin
  perform app.assert_contracts_open();

  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_c.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_c.status not in ('signed', 'completed') then
    raise exception 'contract_not_signed' using errcode = 'P0001';
  end if;
  if v_c.owned_at is not null then
    raise exception 'contract_already_owned' using errcode = 'P0001';
  end if;

  v_day := coalesce(p_owned_on::timestamptz, now());
  update public.contracts c set owned_at = v_day, owned_by = auth.uid(), updated_by = auth.uid()
  where c.id = v_c.id;

  perform app.write_audit('contracts.owned', 'contracts', v_c.id::text,
                          jsonb_build_object('owned_at', v_c.owned_at),
                          jsonb_build_object('owned_at', v_day), null);

  return app.contract_payload(v_c.id);
end $$;
revoke execute on function public.staff_set_contract_owned(uuid, date, text) from public, anon;
grant execute on function public.staff_set_contract_owned(uuid, date, text) to authenticated;

comment on function public.staff_set_contract_owned(uuid, date, text) is
  'Records that the legal conditions completed and the client is the owner (v2 §38). Not the signature and not the last instalment — the spec separates all three — and this is the date «زيتونتي» should open on. Legal, Finance, Admin and Super Admin, with a reason and an audit row.';

-- ---------------------------------------------------------------------------
-- 10 · What the modules screen says about these two modules
-- ---------------------------------------------------------------------------

-- Both rows still cite «البند 14» and «البند 15» of the FIRST كراس الشروط, whose numbering no longer matches
-- anything — and the owner reads those two sentences right above the switch to decide whether to press it.
-- 0063 set the pattern: rewrite label_ar and description_ar, leave `state` alone. Both stay 'disabled'.
update public.feature_flags
   set label_ar = 'العقود ووعد البيع',
       description_ar = 'تحويل الحجز لعقد: الحريف، العرض، الزيتونات بأرقامها، الثمن الجملي والتسبقة وخطّة الخلاص وطريقة الدفع، ومرجع الوثيقة القانونية وتاريخ الإمضاء (التقرير v3، البند 28؛ كراس الشروط v2، البند 34). كي يتكتب العقد، الحجز يولّي «ولّات عقد» والزيتونات يولّيوا «مباعة» في نفس اللحظة. البرنامج ما يمضيش ولا يلغي وحدو: الإمضاء تاريخ يكتبه الموظّف، والفسخ قرار بشري. «معطّل» يوقّف كتابة العقود والإمضاء والفسخ على الفريق أيضاً — أما الشاشات تبقى تتقرا؛ «داخلي فقط» يخلّي الفريق يخدم بيه قبل النشر.'
 where key = 'contracts';

update public.feature_flags
   set label_ar = 'الأقساط',
       description_ar = 'جدول الأقساط اللي يتولّد بعد العقد من الخطّة اللي تجمّدت وقت الإمضاء، وتسجيل الفلوس اللي توصل عليه (التقرير v3، البنود 29 و30 و31). كل قسط: نمرتو، ميعادو، مبلغو — والخلاص والباقي والتأخير يتحسبوا وقت ما تتقرا الشاشة من الدفوعات الحيّة، فما فماش خانة «تخلّص» تولّي كذّابة كي تتلغى دفعة. التأخير عندو مرحلتين («تأخير 1» ثمّ «مراجعة العقد») والعتبات إعدادات تبدّلها إنت. البرنامج ما يلغي حتى عقد وحدو — «لا يوجد فسخ آلي». «معطّل» يوقّف توليد الجدول وتسجيل الأقساط؛ «داخلي فقط» يخلّي الفريق يخدم بيه قبل النشر.'
 where key = 'installments';

-- ---------------------------------------------------------------------------
-- 11 · Every code this file raises, for the module's own Arabic map
-- ---------------------------------------------------------------------------
--
-- These belong in a local CONTRACT_MESSAGES / INSTALMENT_MESSAGES map in the module's own actions.ts, NOT in
-- src/lib/errors.ts — reservations/actions.ts documents why (three sessions share that file, and its
-- module_closed line is deliberately module-neutral so a module that can name itself does so in its own map).
-- Every sentence has to say what went wrong AND what to do, as the twelve existing ones do.
--
--   module_closed                  «وحدة العقود (ولا الأقساط) مطفية. حلّها من الإعدادات ← الوحدات.»
--   forbidden                      who may do what — §1 above names the three predicates.
--   reservation_not_found          the hold disappeared under the screen; reload the client file.
--   reservation_not_convertible    it is already expired, cancelled or a contract.
--   reservation_already_contracted one contract per reservation (v2 §49); open the existing one.
--   deposit_not_paid               contracts.require_deposit_paid is on; record the عربون first, or switch
--                                  that setting off.
--   no_trees_to_contract           its trees were released from the offer's screen; make a new hold.
--   contract_price_unavailable     this offer has no price for a tree yet, or more than one planting density
--                                  and no demand naming which; price the offer first.
--   payment_mode_required          nobody said cash or instalments — neither the demand nor the form.
--   invalid_payment_mode           only 'cash' and 'installments' exist.
--   down_payment_required          an instalment plan needs a down payment.
--   duration_required              an instalment plan needs a duration.
--   duration_not_priced            app.financed_quote: this duration has no markup row.
--   down_covers_total              app.financed_quote: the down payment is the whole price — that is a cash
--                                  contract.
--   too_many_months                app.financed_quote: above settings pricing.max_months.
--   invalid_input                  app.financed_quote: a figure was missing or not positive.
--   invalid_contract_kind          the kind is not an active row of the option list contract_kind.
--   invalid_payment_method         the method is not an active row of payment_method.
--   contract_not_found             reload.
--   contract_not_draft             it is already signed, completed or cancelled.
--   contract_not_signed            sign it first.
--   contract_is_cash               a cash contract has no schedule, by design.
--   first_due_date_required        installments.first_due_rule is 'manual'; type the first due date, or
--                                  choose a rule in Settings.
--   first_due_before_signature     the first instalment cannot fall due before the signature.
--   schedule_not_generated         generate the schedule before recording an instalment.
--   invalid_payment_kind           a contract takes 'down_payment' or 'installment'; a عربون is recorded on
--                                  its reservation.
--   invalid_payment_amount         an amount must be above zero.
--   amount_over_due                more than is owed; correct the figure.
--   installment_not_found          that line does not belong to this contract.
--   amount_below_paid              a line cannot drop below what has already been paid against it.
--   schedule_total_mismatch        the schedule must still sum to the contract's frozen remaining_millimes.
--   contract_cancelled             a cancelled contract takes no money and no edits.
--   contract_closed                already cancelled.
--   contract_owned                 ownership has completed (v2 §38); undoing it is a legal act outside here.
--   contract_already_owned         it is already marked owned.
--   payment_not_found / payment_already_void   from 0063, unchanged.
--   invalid_contract_filter / invalid_installment_filter   a filter the reader does not know.
--   reason_required                app.set_reason — every act here is audited (§58, v2 §51).
