-- مسار الحريف — THE SPINE. One funnel stage per customer, DERIVED from the facts the product already
-- records, plus the one timeline §25 asks for and the §5 callback queue.
--
-- Applied 2026-09-25 (was a draft under supabase/pending). Its test re-runs against the live schema:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0090_journey.sql supabase/tests/058_journey.sql
--
-- WHY THIS FILE EXISTS, IN ONE PARAGRAPH. public.persons.status_id is written by exactly one thing in the
-- whole product: a human choosing from a dropdown. Nothing else moves it — not booking a visit (0064 says so
-- in its own comment: «It never moves public.lead_statuses»), not allocating ten numbered trees, not the
-- عربون arriving, not signing a contract. So every screen reads a field somebody forgot to change, and the
-- Back Office feels like separate interfaces because THE STAGE IS THE ONLY THING THAT COULD JOIN THEM AND
-- NOTHING WRITES IT. This file does not add a twelfth writer. It adds a READER: one function that looks at
-- what already happened and says where the customer is.
--
-- THE ONE RULE THIS FILE OBEYS: IT WRITES NOTHING. No trigger, no column, no update. A derived stage cannot
-- drift, cannot be forgotten and cannot be wrong in a way a dropdown can. And because it writes nothing,
-- public.person_status_history keeps holding only the moves a HUMAN made, which is what it is for.
--
-- WHAT IT ADDS
--   · app.journey_spine()            the thirteen stages of §29, their Arabic labels and their proof
--   · app.person_stage(uuid)         ONE stage for one person, derived, with the row that proves it
--   · app.journey_timeline(uuid)     §25's timeline, every source joined, in order
--   · public.staff_customer_journey  «وين وصل هذا الحريف، وكيفاش وصل» — §26's «Enter Once» made true
--   · public.staff_person_stage      the same stage for a LIST of people (a queue, §28's dashboard)
--   · public.staff_journey_spine     the catalogue, for a header band and for a dashboard's empty columns
--   · public.staff_callbacks         §5's «شنوّة مستحق عليّ توّا»
--
-- DEPENDS ON 0072_contracts_installments.sql, which is applied (public.contracts and
-- public.contract_installments exist live, 0 rows). Stages 11, 12 and 13 have no other fact behind them. If
-- 0072 is ever rolled back, app.person_stage raises at runtime rather than lying, and test 046 guards on it.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   · It does not touch public.persons, public.lead_statuses or any existing function. persons.status_id
--     stays exactly where it is, as THE HUMAN OVERRIDE — the owner needs «غير مهتم حالياً» and «مغلق», and
--     no fact in the database can ever prove either. The readers below return both and say whether they
--     agree, instead of silently letting one win.
--   · It does not gate on a feature flag. A flag says what a module may DO; a fact that happened, happened.
--     A customer who owns 200 trees must not read as «Lead» because the contracts switch was turned off.
--   · It adds no settings section to /admin/settings: the page builds its sections from key prefixes and a
--     prefix it does not claim falls into «إعدادات أخرى». A `journey` section there is a follow-up for
--     whoever owns that file, not a reason to hold this one.


-- ===========================================================================
-- 1 · THE THIRTEEN KEYS — the one place this run argues for code over data
-- ===========================================================================

-- RULE 3 OF THIS WORK SAYS: never hard-code a business value — an amount, a list, a label, a threshold, a
-- status name the owner might rename. The funnel stage KEYS are the single exception, and here is the
-- argument rather than the assumption.
--
-- A key here is not a label and not a list item. It is the name of a FACT, and the fact is what the code
-- branches on: «a non-voided عربون has arrived against a live reservation» is `deposit_paid`, and if the
-- owner deleted that row the function that computes it would still have to answer something. lead_statuses
-- proves the point from the other side: it is the owner's table, he may delete any row in it, and 0063
-- refused to put reservation states there for exactly this reason — «deleting 'deposit_paid' would break
-- staff_record_deposit». tree_state, visit_status, reservation_status and contract_status all took the same
-- split, four times, in four migrations. This is the fifth, and it is the same split:
--
--   THE KEY IS CODE.    thirteen names, fixed, in rank order, because a screen branches on them.
--   THE LABEL IS DATA.  thirteen text settings, journey.stage_<key>, each editable in الإعدادات like any
--                       other sentence, exactly as 0064 did with visits.status_<status>.
--   THE ORDER IS CODE.  the owner renames a stage; he does not reorder the journey, because the order IS
--                       the derivation — «العربون مدفوع» comes after «حجز» because money follows a hold.
--
-- AND THE MAPPING ONTO HIS OWN TABLE IS KEPT. Every stage names the public.lead_stage it belongs to, so the
-- derived spine sits ON TOP of lead_statuses and never replaces it. Thirteen stages map onto ten enum
-- values; the three collapses are named in the table below, and they are the reason the derived stage is
-- worth having: lead_stage cannot tell «زيارة مبرمجة» from «تمت الزيارة» in a count, and it cannot tell a
-- completed sale from an owner at all.

create or replace function app.journey_stage_label(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  -- One text setting per stage — a plain box in الإعدادات, not a json blob nobody can edit there.
  select app.setting_text('journey.stage_' || p_key, p_key)
$$;
revoke execute on function app.journey_stage_label(text) from public, anon, authenticated;

comment on function app.journey_stage_label(text) is
  'The Arabic name of one funnel stage, read from settings journey.stage_<key>. Same shape as app.visit_status_label (0064): the code is stable, the word the owner reads is his.';

-- THE SPINE ITSELF. §29's thirteen, in rank order, with the fact that proves each one.
--
--   #  key                 lead_stage    the fact, today
--   1  lead                new           public.persons + its first public.interest_requests row
--   2  contacted           contacting    any public.contact_attempts row
--   3  qualified           qualified     NO FACT — see below
--   4  visit_scheduled     visit         public.visits status requested|confirmed
--   5  visit_completed     visit         public.visits status completed          ← lead_stage collapses 4+5
--   6  trees_selected      reserved      public.trees held by this person with NO reservation behind them
--   7  reservation         reserved      public.reservations, still open         ← lead_stage collapses 6+7+8
--   8  deposit_paid        reserved      public.reservations.deposit_paid_at
--   9  legal_processing    contracting   public.contracts status draft
--  10  contract_scheduled  contracting   NO FACT — see below
--  11  contract_signed     contracting   public.contracts status signed          ← lead_stage collapses 9..11
--  12  sale_completed      owner         public.contracts status completed
--  13  owner               owner         public.contracts.owned_at               ← lead_stage collapses 12+13
--
-- THE TWO STAGES WITH NO FACT, named rather than guessed. This run's rule: where no fact exists, say so.
--   3 «مؤهَّل»  public.contact_outcome is a hard enum of five — answered, no_answer, wrong_number,
--     callback, not_interested — and none of them means «مؤهل للزيارة». The owner's §5 names six outcomes
--     and three of his have no code at all. Until a call outcome can CARRY that meaning (an option_items
--     list the owner edits, which is another file's work), nothing in the database proves qualification, and
--     this function will not invent it. It stays in the spine because a dashboard must be able to show the
--     column as «غير معروف» rather than as zero — and because the owner's own lead_statuses already holds
--     «مؤهَّل», so the HUMAN can place a file there today and the readers below will show that he did.
--   10 «موعد العقد محدد»  §19's closing appointment — date, hour, place, the lawyer or notary, the
--     documents — has no table anywhere, in neither the migrations nor 0072. Same treatment.
-- Both are `has_fact: false`. When either fact lands, ONE `create or replace` of app.person_stage fills its
-- block and every screen in the product moves with it.
create or replace function app.journey_spine() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank',       s.rank,
           'key',        s.key,
           'label',      app.journey_stage_label(s.key),
           'lead_stage', s.lead_stage,
           'has_fact',   s.has_fact,
           -- What proves this stage, or what would. NOT a setting: it describes how the code decides, so an
           -- owner who edited it would only make the screen lie about the database.
           'fact_ar',    s.fact_ar)
         order by s.rank), '[]'::jsonb)
  from (values
    ( 1, 'lead',               'new',         true,  'مطلب مسجّل باسم الحريف.'),
    ( 2, 'contacted',          'contacting',  true,  'فمّا على الأقل محاولة تواصل مسجّلة.'),
    ( 3, 'qualified',          'qualified',   false, 'ما فمّاش حقيقة تثبتها اليوم: نتائج المكالمة ما فيهاش «مؤهل للزيارة». تتحطّ باليد من حالة الملف.'),
    ( 4, 'visit_scheduled',    'visit',       true,  'زيارة ميدانية مطلوبة ولا مؤكّدة.'),
    ( 5, 'visit_completed',    'visit',       true,  'زيارة ميدانية تمّت.'),
    ( 6, 'trees_selected',     'reserved',    true,  'زيتونات مرقّمة محجوزة باسم الحريف بلا حجز رسمي وراها.'),
    ( 7, 'reservation',        'reserved',    true,  'حجز مفتوح بزيتوناته وشروطه.'),
    ( 8, 'deposit_paid',       'reserved',    true,  'العربون وصل ومسجّل في الحجز.'),
    ( 9, 'legal_processing',   'contracting', true,  'عقد في طور الإعداد (مسوّدة).'),
    (10, 'contract_scheduled', 'contracting', false, 'ما فمّاش حقيقة تثبتها اليوم: موعد إمضاء العقد ما عندوش جدول. تتحطّ باليد من حالة الملف.'),
    (11, 'contract_signed',    'contracting', true,  'العقد ممضي وتاريخ الإمضاء مسجّل.'),
    (12, 'sale_completed',     'owner',       true,  'تخلّص كامل: التسبقة وكل الأقساط وصلوا.'),
    (13, 'owner',              'owner',       true,  'الملكية سُجّلت بعد استكمال الشروط القانونية.')
  ) as s (rank, key, lead_stage, has_fact, fact_ar)
$$;
revoke execute on function app.journey_spine() from public, anon, authenticated;

comment on function app.journey_spine() is
  'The thirteen funnel stages of the owner''s §29, in rank order: the stable key the code branches on, the Arabic label he edits (settings journey.stage_<key>), the public.lead_stage each one maps onto, and whether a fact in this database can prove it. Two cannot today and say so.';

-- The labels, one plain text setting each, so الإعدادات can edit them in a box rather than in a json blob.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('journey.stage_lead',               to_jsonb('مطلب جديد'::text),        'text', 'journey', 'مسار الحريف · مطلب جديد',        'اسم المرحلة الأولى في مسار الحريف.', false, 10),
  ('journey.stage_contacted',          to_jsonb('تم الاتصال'::text),       'text', 'journey', 'مسار الحريف · تم الاتصال',       'اسم المرحلة بعد أول محاولة تواصل.', false, 20),
  ('journey.stage_qualified',          to_jsonb('مؤهَّل'::text),           'text', 'journey', 'مسار الحريف · مؤهَّل',           'اسم مرحلة التأهيل. ما فمّاش حقيقة تثبتها آلياً اليوم.', false, 30),
  ('journey.stage_visit_scheduled',    to_jsonb('موعد زيارة محدد'::text),  'text', 'journey', 'مسار الحريف · موعد زيارة',       'اسم المرحلة كي تتبرمج زيارة ميدانية.', false, 40),
  ('journey.stage_visit_completed',    to_jsonb('تمت الزيارة'::text),      'text', 'journey', 'مسار الحريف · تمت الزيارة',      'اسم المرحلة بعد ما تتعمل الزيارة.', false, 50),
  ('journey.stage_trees_selected',     to_jsonb('اختيار الزيتونات'::text), 'text', 'journey', 'مسار الحريف · اختيار الزيتونات', 'اسم المرحلة كي تتحجز زيتونات مرقّمة بلا حجز رسمي.', false, 60),
  ('journey.stage_reservation',        to_jsonb('حجز'::text),              'text', 'journey', 'مسار الحريف · حجز',              'اسم مرحلة الحجز المفتوح.', false, 70),
  ('journey.stage_deposit_paid',       to_jsonb('العربون مدفوع'::text),    'text', 'journey', 'مسار الحريف · العربون مدفوع',    'اسم المرحلة كي يوصل العربون.', false, 80),
  ('journey.stage_legal_processing',   to_jsonb('في القسم القانوني'::text),'text', 'journey', 'مسار الحريف · القسم القانوني',   'اسم المرحلة كي يولّي الملف عند القانوني والعقد مسوّدة.', false, 90),
  ('journey.stage_contract_scheduled', to_jsonb('موعد العقد محدد'::text),  'text', 'journey', 'مسار الحريف · موعد العقد',       'اسم مرحلة موعد الإمضاء. ما فمّاش حقيقة تثبتها آلياً اليوم.', false, 100),
  ('journey.stage_contract_signed',    to_jsonb('العقد ممضي'::text),       'text', 'journey', 'مسار الحريف · العقد ممضي',       'اسم المرحلة بعد إمضاء العقد.', false, 110),
  ('journey.stage_sale_completed',     to_jsonb('تم إتمام البيع'::text),   'text', 'journey', 'مسار الحريف · إتمام البيع',      'اسم المرحلة كي يتخلّص العقد كامل.', false, 120),
  ('journey.stage_owner',              to_jsonb('مالك'::text),             'text', 'journey', 'مسار الحريف · مالك',             'اسم المرحلة الأخيرة، بعد تسجيل الملكية.', false, 130),
  ('journey.unknown_label',            to_jsonb('غير معروف'::text),        'text', 'journey', 'مسار الحريف · غير معروف',        'الكلمة اللي تتكتب كي ما تكونش فمّا حقيقة تحدّد المرحلة.', false, 140),
  ('journey.timeline_max',             to_jsonb(300),                      'integer', 'journey', 'مسار الحريف · أقصى عدد أحداث', 'أقصى عدد أحداث في مسار ملف واحد. كي يفوت العدد، يتعرضوا الأحدث ويتقال إنو فمّا أكثر.', false, 150),
  ('journey.callback_horizon_days',    to_jsonb(0),                        'integer', 'journey', 'مسار الحريف · أفق المتابعات',  'شحال من يوم قدّام تتعرض المتابعات المبرمجة. 0 = بلا حدّ.', false, 160)
on conflict (key) do nothing;

-- Two json maps, for the same reason payments.kind_labels and reservations.status_labels are json maps:
-- one row instead of twenty, read by one function, and editable the same way those four already are.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('journey.event_labels', jsonb_build_object(
      'request',            'بعث مطلب من الموقع',
      'call',               'محاولة تواصل',
      'note',               'ملاحظة',
      'status',             'تغيير حالة الملف',
      'assignment',         'إسناد الملف',
      'visit_booked',       'برمجة زيارة ميدانية',
      'visit_completed',    'تمت الزيارة',
      'visit_no_show',      'ما حضرش للزيارة',
      'visit_cancelled',    'إلغاء الزيارة',
      'trees',              'حجز زيتونات مرقّمة',
      'reservation',        'فتح حجز',
      'deposit',            'دفع العربون',
      'reservation_closed', 'غلق الحجز',
      'payment',            'دفعة وصلت',
      'payment_void',       'إلغاء دفعة',
      'contract',           'إنشاء العقد',
      'contract_signed',    'إمضاء العقد',
      'contract_settled',   'تم إتمام البيع',
      'contract_owned',     'تسجيل الملكية',
      'contract_cancelled', 'إلغاء العقد'),
    'json', 'journey', 'مسار الحريف · أسماء الأحداث',
    'الكلمات اللي تتكتب على كل حدث في مسار الحريف. مفتاح ثابت، والكلمة متاعك.', false, 170),
  ('journey.call_outcome_labels', jsonb_build_object(
      'answered',       'تم الرد',
      'no_answer',      'لم يرد',
      'wrong_number',   'رقم خاطئ',
      'callback',       'طلب إعادة الاتصال',
      'not_interested', 'غير مهتم حالياً'),
    'json', 'journey', 'مسار الحريف · نتائج المكالمة',
    'أسماء نتائج المكالمة كيما تتقرا في المسار. هذي جسر مؤقت: نتائج المكالمة مازالت نوع ثابت في قاعدة البيانات (public.contact_outcome)، والحلّ النهائي هو قائمة تتعدّل من «القوائم» — البند 5.', false, 180)
on conflict (key) do nothing;


-- ===========================================================================
-- 2 · THE DERIVATION — one stage, proven, never two
-- ===========================================================================

create or replace function app.journey_proof(
  p_key text, p_kind text, p_id uuid, p_ref text, p_at timestamptz
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select s || jsonb_build_object(
           'proof', jsonb_build_object('kind', p_kind, 'id', p_id, 'ref', p_ref, 'at', p_at),
           'at', p_at)
  from jsonb_array_elements(app.journey_spine()) s
  where s->>'key' = p_key
$$;
revoke execute on function app.journey_proof(text, text, uuid, text, timestamptz) from public, anon, authenticated;

-- WHERE IS THIS CUSTOMER. Read in rank order from the top; the first fact that answers wins, and the
-- function returns it and stops. That is what makes «a customer cannot appear in two stages» a property of
-- the code and not a rule somebody has to remember: there is one return value and it carries one key.
--
-- NO ROLE CHECK HERE, ON PURPOSE. This is app., revoked from everybody, and every public.* entry point below
-- checks app.is_staff() and app.can_see_person() before it calls this. Putting the check here too would make
-- a list of 200 people run 200 role lookups for an answer its caller already has.
--
-- WHAT A CLOSED RECORD DOES. A cancelled contract, an expired hold and a cancelled hold are all IGNORED, and
-- the customer falls back to the highest stage still proven. That is deliberate and it is the useful
-- behaviour: a client whose hold lapsed should reappear at «تمت الزيارة» so somebody calls them, not sit at
-- «حجز» forever holding a place in a funnel count. The rows are still on the timeline, which is where the
-- history belongs.
create or replace function app.person_stage(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_at    timestamptz;
  v_ref   text;
  v_first timestamptz;
begin
  if p_person is null or not exists (select 1 from public.persons ps where ps.id = p_person) then
    return null;
  end if;

  -- 13 · مالك. v2 §38: ownership is a legal act after the signature, not the last instalment.
  select c.id, c.owned_at, c.reference_no into v_id, v_at, v_ref
  from public.contracts c
  where c.person_id = p_person and c.status <> 'cancelled' and c.owned_at is not null
  order by c.owned_at desc limit 1;
  if found then return app.journey_proof('owner', 'contract', v_id, v_ref, v_at); end if;

  -- 12 · تم إتمام البيع. contracts.status 'completed' means every millime arrived; 0072 sets and unsets it
  -- from the payments themselves, so voiding a receipt walks this stage back with it.
  select c.id, coalesce(c.settled_at, c.updated_at), c.reference_no into v_id, v_at, v_ref
  from public.contracts c
  where c.person_id = p_person and c.status = 'completed'
  order by c.settled_at desc nulls last limit 1;
  if found then return app.journey_proof('sale_completed', 'contract', v_id, v_ref, v_at); end if;

  -- 11 · العقد ممضي.
  select c.id, coalesce(c.signed_on::timestamptz, c.updated_at), c.reference_no into v_id, v_at, v_ref
  from public.contracts c
  where c.person_id = p_person and c.status = 'signed'
  order by c.signed_on desc nulls last limit 1;
  if found then return app.journey_proof('contract_signed', 'contract', v_id, v_ref, v_at); end if;

  -- 10 · موعد العقد محدد — NO FACT. §19's appointment (date, hour, place, the notary, the documents) has no
  -- table in this database. When it lands, this is the block it fills, and nothing else in the product has to
  -- change. Until then the stage is skipped here and reported has_fact:false by app.journey_spine().

  -- 9 · في القسم القانوني. A contract exists as a draft: the reservation is already 'converted' and its trees
  -- already 'sold' (0072 does all three in one transaction), which is why stages 6-8 cannot also match.
  select c.id, c.created_at, c.reference_no into v_id, v_at, v_ref
  from public.contracts c
  where c.person_id = p_person and c.status = 'draft'
  order by c.created_at desc limit 1;
  if found then return app.journey_proof('legal_processing', 'contract', v_id, v_ref, v_at); end if;

  -- 8 · العربون مدفوع. deposit_paid_at and not status='deposit_paid': the timestamp survives the reservation
  -- being converted by a contract that was later cancelled, and the money did arrive. 0063 derives both from
  -- public.payments and never writes either by hand, so this reads the same fact the receipts prove.
  select r.id, r.deposit_paid_at, r.reference_no into v_id, v_at, v_ref
  from public.reservations r
  where r.person_id = p_person and r.status not in ('expired', 'cancelled') and r.deposit_paid_at is not null
  order by r.deposit_paid_at desc limit 1;
  if found then return app.journey_proof('deposit_paid', 'reservation', v_id, v_ref, v_at); end if;

  -- 7 · حجز.
  select r.id, r.reserved_at, r.reference_no into v_id, v_at, v_ref
  from public.reservations r
  where r.person_id = p_person and r.status not in ('expired', 'cancelled')
  order by r.reserved_at desc limit 1;
  if found then return app.journey_proof('reservation', 'reservation', v_id, v_ref, v_at); end if;

  -- 6 · اختيار الزيتونات. Trees held with NO reservation behind them — the older staff_allocate_trees path,
  -- which records no money and no deadline. This is the closest thing the database has to §11's «the client
  -- chose these ten», and it will become exact the day an allocate-by-id RPC exists. A tree whose
  -- reservation_id is set is already counted by stage 7.
  select max(t.allocated_at), count(*)::text into v_at, v_ref
  from public.trees t
  where t.held_by = p_person and t.state <> 'available' and t.reservation_id is null;
  if v_at is not null then
    return app.journey_proof('trees_selected', 'trees', null, v_ref, v_at);
  end if;

  -- 5 · تمت الزيارة.
  select v.id, coalesce(v.status_changed_at, v.updated_at), v.visit_no into v_id, v_at, v_ref
  from public.visits v
  where v.person_id = p_person and v.status = 'completed'
  order by v.visit_date desc, v.status_changed_at desc limit 1;
  if found then return app.journey_proof('visit_completed', 'visit', v_id, v_ref, v_at); end if;

  -- 4 · موعد زيارة محدد. 'requested' and 'confirmed' both count: the owner's §6 says the file passes to the
  -- next stage «on confirmation», and a requested visit is a booked visit waiting for a yes, not nothing.
  select v.id, v.created_at, v.visit_no into v_id, v_at, v_ref
  from public.visits v
  where v.person_id = p_person and v.status in ('requested', 'confirmed')
  order by v.visit_date, v.slot_from nulls last limit 1;
  if found then return app.journey_proof('visit_scheduled', 'visit', v_id, v_ref, v_at); end if;

  -- 3 · مؤهَّل — NO FACT. public.contact_outcome has no value meaning «مؤهل للزيارة» (§5 names three the
  -- enum does not carry). When a call outcome can hold that meaning as an owner-edited list, this is the
  -- block it fills. Skipped, and reported has_fact:false.

  -- 2 · تم الاتصال.
  select a.id, a.created_at into v_id, v_at
  from public.contact_attempts a
  where a.person_id = p_person
  order by a.created_at desc limit 1;
  if found then return app.journey_proof('contacted', 'contact_attempt', v_id, null, v_at); end if;

  -- 1 · مطلب جديد. The floor: a person exists. Their first demand dates it when there is one — a client the
  -- commercial met on the phone has none, and then the file's own creation is the date.
  select r.id, r.created_at, r.request_no into v_id, v_first, v_ref
  from public.interest_requests r
  where r.person_id = p_person
  order by r.created_at limit 1;
  if not found then
    select ps.created_at into v_first from public.persons ps where ps.id = p_person;
    v_id := null; v_ref := null;
  end if;
  return app.journey_proof('lead', case when v_id is null then 'person' else 'request' end,
                           v_id, v_ref, v_first);
end $$;
revoke execute on function app.person_stage(uuid) from public, anon, authenticated;

comment on function app.person_stage(uuid) is
  'WHERE one customer is, derived from the facts already recorded: contract > reservation + عربون > held trees > visit > call > demand, read in rank order, first answer wins. Returns exactly one stage with the row that proves it, or null when the person does not exist. Writes nothing and reads no feature flag. Cancelled contracts and closed holds are ignored, so a lapsed file falls back to where it really is.';

-- The human's answer, beside the derived one. persons.status_id is not going away and must not: the owner
-- needs «غير مهتم حالياً» and «مغلق», and no fact can ever prove either. This returns what a human last set,
-- when, and by whom, plus ONE boolean the screens need — whether the two agree. They agree when the human's
-- lead_stage is the same as the derived stage's lead_stage; anything else is a disagreement worth SHOWING,
-- not a reason to overwrite either side.
create or replace function app.person_human_status(p_person uuid, p_derived_lead_stage text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status_id',   s.id,
    'label',       s.label_ar,
    'lead_stage',  s.stage,
    'is_active',   s.is_active,
    -- The two stages the facts can never reach. A file parked here is a decision, not a gap.
    'is_parked',   s.stage in ('paused', 'closed'),
    'agrees',      s.stage::text = p_derived_lead_stage,
    'set_at',      h.created_at,
    'set_by',      pr.full_name)
  from public.persons p
  join public.lead_statuses s on s.id = p.status_id
  left join lateral (
    select ph.created_at, ph.changed_by from public.person_status_history ph
    where ph.person_id = p.id and ph.to_status_id = p.status_id
    order by ph.created_at desc limit 1) h on true
  left join public.profiles pr on pr.id = h.changed_by
  where p.id = p_person
$$;
revoke execute on function app.person_human_status(uuid, text) from public, anon, authenticated;


-- ===========================================================================
-- 3 · THE TIMELINE — §25, every source, one order
-- ===========================================================================

-- «ONE TIMELINE per client, from the first web request to the completed sale.» The timeline that exists on
-- the client file today is built from four sources — contact_attempts, person_notes, person_status_history
-- and person_assignments — so the file's single most important event, «دفع العربون», is not on the timeline
-- that is supposed to run through to «تم البيع». This joins the other seven.
--
-- ORDERED ASCENDING, because that is the owner's own reading: his example runs from «بعث مطلب من الموقع»
-- down to «تم البيع». A screen that wants newest-first reverses an array; a screen that wants the story reads
-- it as it is.
--
-- THE TREES ARE GROUPED, and this is not a detail. TX-00215 holds 8,000 trees and one contract can take all
-- of them; one row per tree would make the timeline unreadable and the payload enormous. Allocation happens
-- in one statement, so every tree of one act shares an allocated_at: grouping by (allocated_at, reservation,
-- offer) reproduces the ACT — «حجز 10 زيتونات، من OFF-AIRPORT-0125 إلى OFF-AIRPORT-0134».
--
-- NO INSTALMENT LINES. A schedule line is an expectation, not an event; 0072 says the same thing about why
-- it carries no reference_no. When money actually arrives it is a public.payments row and it is here.
--
-- MONEY IS RAW. Every amount is an integer millime and nothing here formats one: src/lib/format.ts is the
-- only formatter in this product and a receipt printed by SQL would be a second one.
create or replace function app.journey_timeline(p_person uuid, p_limit integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_max     integer := greatest(coalesce(p_limit, app.setting_int('journey.timeline_max', 300)), 1);
  v_labels  jsonb   := coalesce(app.setting('journey.event_labels'), '{}'::jsonb);
  v_calls   jsonb   := coalesce(app.setting('journey.call_outcome_labels'), '{}'::jsonb);
  v_res     jsonb   := coalesce(app.setting('reservations.status_labels'), '{}'::jsonb);
  v_kinds   jsonb   := coalesce(app.setting('payments.kind_labels'), '{}'::jsonb);
  v_ctr     jsonb   := coalesce(app.setting('contracts.status_labels'), '{}'::jsonb);
  v_total   integer;
  v_rows    jsonb;
begin
  with raw as (
    -- 1 · the web demand itself — the event the four-source timeline never had
    select r.created_at as at, 'request'::text as kind, r.request_no as ref,
           nullif(concat_ws(' · ',
             nullif(r.goal_label_ar, ''),
             case when r.offer_trees is not null then r.offer_trees::text || ' زيتونة' end), '') as detail,
           null::uuid as by_id, null::bigint as amount, null::integer as qty, r.id as row_id
    from public.interest_requests r where r.person_id = p_person

    union all
    -- 2 · the calls, with the promise each one made
    select a.created_at, 'call', null,
           nullif(concat_ws(' · ',
             coalesce(v_calls->>a.outcome::text, a.outcome::text),
             nullif(a.note, ''),
             case when a.next_follow_up_at is not null
                  then 'متابعة: ' || to_char(a.next_follow_up_at at time zone 'Africa/Tunis', 'DD/MM/YYYY HH24:MI') end), ''),
           a.created_by, null, null, a.id
    from public.contact_attempts a where a.person_id = p_person

    union all
    select n.created_at, 'note', null, n.body, n.created_by, null, null, n.id
    from public.person_notes n where n.person_id = p_person

    union all
    select h.created_at, 'status', null,
           case when f.id is null then h2.label_ar else f.label_ar || ' ← ' || h2.label_ar end,
           h.changed_by, null, null, h.id
    from public.person_status_history h
    join public.lead_statuses h2 on h2.id = h.to_status_id
    left join public.lead_statuses f on f.id = h.from_status_id
    where h.person_id = p_person

    union all
    select g.created_at, 'assignment', null,
           coalesce(fu.full_name, 'بلا مسؤول') || ' ← ' || coalesce(tu.full_name, 'بلا مسؤول'),
           g.created_by, null, null, g.id
    from public.person_assignments g
    left join public.profiles fu on fu.id = g.from_user
    left join public.profiles tu on tu.id = g.to_user
    where g.person_id = p_person

    union all
    -- 6 · the visit, booked
    select v.created_at, 'visit_booked', v.visit_no,
           nullif(concat_ws(' · ', pj.name, v.slot_label_ar,
                  to_char(v.visit_date, 'DD/MM/YYYY'), nullif(v.meeting_point, '')), ''),
           v.created_by, null, v.people_count, v.id
    from public.visits v
    left join public.projects pj on pj.id = v.project_id
    where v.person_id = p_person

    union all
    -- 7 · and how it ended. The outcome the field commercial wrote, on the SAME timeline the phone agent
    -- reads — §26's «what the commercial chose, Legal finds».
    select coalesce(v.status_changed_at, v.updated_at), 'visit_' || v.status::text, v.visit_no,
           nullif(concat_ws(' · ',
             case when v.outcome_liked is true then 'عجبو' when v.outcome_liked is false then 'ما عجبوش' end,
             nullif(v.outcome_next_step, ''), nullif(v.outcome_note, ''), nullif(v.cancel_reason, '')), ''),
           v.status_changed_by, null, null, v.id
    from public.visits v
    where v.person_id = p_person and v.status in ('completed', 'no_show', 'cancelled')

    union all
    -- 8 · the trees, as ACTS and not as 8,000 rows
    select t.allocated_at, 'trees', null,
           nullif(concat_ws(' · ', pj.name,
             case when min(t.seq) = max(t.seq)
                  then (array_agg(t.code order by t.seq))[1]
                  else (array_agg(t.code order by t.seq))[1] || ' → ' || (array_agg(t.code order by t.seq desc))[1]
             end), ''),
           null, null, count(*)::integer, null
    from public.trees t
    left join public.projects pj on pj.id = t.project_id
    where t.held_by = p_person and t.allocated_at is not null
    group by t.allocated_at, t.reservation_id, t.project_id, pj.name

    union all
    select r.reserved_at, 'reservation', r.reference_no,
           nullif(concat_ws(' · ', pj.name, r.trees_count::text || ' زيتونة', nullif(r.note, '')), ''),
           r.created_by, nullif(r.deposit_due_millimes, 0), r.trees_count, r.id
    from public.reservations r
    left join public.projects pj on pj.id = r.project_id
    where r.person_id = p_person

    union all
    select r.deposit_paid_at, 'deposit', r.reference_no, pj.name,
           null, r.deposit_due_millimes, null, r.id
    from public.reservations r
    left join public.projects pj on pj.id = r.project_id
    where r.person_id = p_person and r.deposit_paid_at is not null

    union all
    select r.closed_at, 'reservation_closed', r.reference_no,
           nullif(concat_ws(' · ', coalesce(v_res->>r.status::text, r.status::text),
                  nullif(r.close_reason, ''),
                  case when r.trees_released then 'الزيتونات رجعت متاحة' end), ''),
           r.closed_by, null, null, r.id
    from public.reservations r
    where r.person_id = p_person and r.closed_at is not null

    union all
    -- 12 · every receipt. §25's timeline must carry the money or it is not the file's story.
    select p.received_at, 'payment', p.reference_no,
           nullif(concat_ws(' · ', coalesce(v_kinds->>p.kind::text, p.kind::text),
                  nullif(p.method_label_ar, ''), nullif(p.reference, ''), nullif(p.note, '')), ''),
           p.recorded_by, p.amount_millimes, null, p.id
    from public.payments p where p.person_id = p_person and p.voided_at is null

    union all
    select p.voided_at, 'payment_void', p.reference_no, nullif(p.void_reason, ''),
           p.voided_by, p.amount_millimes, null, p.id
    from public.payments p where p.person_id = p_person and p.voided_at is not null

    union all
    select c.created_at, 'contract', c.reference_no,
           nullif(concat_ws(' · ', pj.name, c.trees_count::text || ' زيتونة',
                  nullif(c.kind_label_ar, ''), coalesce(v_ctr->>'draft', 'draft')), ''),
           c.created_by, c.total_price_millimes, c.trees_count, c.id
    from public.contracts c
    left join public.projects pj on pj.id = c.project_id
    where c.person_id = p_person

    union all
    -- greatest(), because signed_on is a DATE — the legal fact — and casting it lands at midnight, which
    -- would sort the signature before the contract that carries it on the day both happened.
    select greatest(c.signed_on::timestamptz, c.created_at), 'contract_signed', c.reference_no,
           nullif(concat_ws(' · ', to_char(c.signed_on, 'DD/MM/YYYY'), nullif(c.legal_document_ref, '')), ''),
           c.signed_by, null, null, c.id
    from public.contracts c where c.person_id = p_person and c.signed_on is not null

    union all
    select c.settled_at, 'contract_settled', c.reference_no, null, null, c.total_price_millimes, null, c.id
    from public.contracts c where c.person_id = p_person and c.settled_at is not null

    union all
    -- greatest() again: staff_set_contract_owned stores the DAY the legal conditions completed, and a day
    -- cast to a timestamp lands at midnight — earlier than the demand that started the file.
    select greatest(c.owned_at, c.created_at), 'contract_owned', c.reference_no,
           to_char(c.owned_at at time zone 'Africa/Tunis', 'DD/MM/YYYY'),
           c.owned_by, null, c.trees_count, c.id
    from public.contracts c where c.person_id = p_person and c.owned_at is not null

    union all
    select c.cancelled_at, 'contract_cancelled', c.reference_no,
           nullif(concat_ws(' · ', nullif(c.cancel_reason, ''),
                  case when c.trees_released then 'الزيتونات رجعت متاحة' end), ''),
           c.cancelled_by, null, null, c.id
    from public.contracts c where c.person_id = p_person and c.cancelled_at is not null
  ),
  -- Which stage of the journey each event belongs to. This is what turns a log into a JOURNEY: the header
  -- band and the timeline agree about the same thirteen names. It is also THE TIEBREAK — several acts of one
  -- transaction share a timestamp to the microsecond (creating a contract converts the hold and sells the
  -- trees in one statement), and sorting those by the stage they belong to is the only order that reads like
  -- the story. Without it the tiebreak is alphabetical, and «تسجيل الملكية» sorts above «بعث مطلب».
  events as (
    select r.*,
           s.key as stage,
           (select (x->>'rank')::integer from jsonb_array_elements(app.journey_spine()) x
            where x->>'key' = s.key) as srank
    from raw r
    left join lateral (select case r.kind
                                when 'request'          then 'lead'
                                when 'call'             then 'contacted'
                                when 'visit_booked'     then 'visit_scheduled'
                                when 'visit_completed'  then 'visit_completed'
                                when 'trees'            then 'trees_selected'
                                when 'reservation'      then 'reservation'
                                when 'deposit'          then 'deposit_paid'
                                when 'contract'         then 'legal_processing'
                                when 'contract_signed'  then 'contract_signed'
                                when 'contract_settled' then 'sale_completed'
                                when 'contract_owned'   then 'owner'
                              end as key) s on true
  ),
  counted as (select count(*)::integer as n from events where at is not null),
  -- When a file has more events than the ceiling, the MOST RECENT survive: that is the half somebody is
  -- working on. The reader is told there are more rather than being handed a story with a missing middle.
  kept as (
    select e.* from events e where e.at is not null
    order by e.at desc, e.srank desc nulls first, e.kind desc limit v_max
  )
  select c.n,
         coalesce(jsonb_agg(jsonb_build_object(
           'at',     k.at,
           'kind',   k.kind,
           'title',  coalesce(v_labels->>k.kind, k.kind),
           'detail', k.detail,
           'ref',    k.ref,
           'by',     pr.full_name,
           'amount_millimes', k.amount,
           'count',  k.qty,
           'row_id', k.row_id,
           'stage',  k.stage)
         order by k.at, k.srank nulls last, k.kind), '[]'::jsonb)
  into v_total, v_rows
  from kept k
  left join public.profiles pr on pr.id = k.by_id
  cross join counted c
  group by c.n;

  return jsonb_build_object(
    'total',     coalesce(v_total, 0),
    'shown',     jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
    'truncated', coalesce(v_total, 0) > jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
    'events',    coalesce(v_rows, '[]'::jsonb));
end $$;
revoke execute on function app.journey_timeline(uuid, integer) from public, anon, authenticated;

comment on function app.journey_timeline(uuid, integer) is
  'One client''s whole story (report v3 §25 / the owner''s §25), ascending: the web demand, the calls and the promise each made, the notes, the status and owner moves, the visit and how it ended, the tree allocations as ACTS not as rows, the hold, the عربون, every receipt and every void, and the contract through to ownership. Amounts are raw millimes — nothing here formats money.';


-- ===========================================================================
-- 4 · THE ENTRY POINTS
-- ===========================================================================

-- THE CATALOGUE. What a header band draws and what §28's dashboard uses for its columns — including the two
-- columns that must read «غير معروف» rather than «0», because no fact can fill them yet.
create or replace function public.staff_journey_spine() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'stages',  app.journey_spine(),
    'unknown', app.setting_text('journey.unknown_label', 'غير معروف'));
end $$;
revoke execute on function public.staff_journey_spine() from public, anon;
grant execute on function public.staff_journey_spine() to authenticated;

comment on function public.staff_journey_spine() is
  'The thirteen funnel stages with their Arabic labels, their public.lead_stage and whether a fact can prove each one. Read by any screen that draws the path; no client file is touched, so every staff role may call it.';

-- THE ONE FUNCTION THE BRIEF ASKS FOR: «وين وصل هذا الحريف، وكيفاش وصل».
--
-- One call, one payload: the derived stage with its proof, the human status beside it and whether they
-- agree, the whole path with what has been reached, the live callback, §26's identifiers threaded end to end
-- (Customer · Request · Project · Reservation · Contract), and the full timeline. That is what makes «ENTER
-- ONCE — REUSE EVERYWHERE» true rather than aspirational: the phone agent, the field commercial and Legal
-- all read this, and none of them retypes anything.
create or replace function public.staff_customer_journey(p_person uuid, p_timeline_limit integer default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_p       public.persons;
  v_stage   jsonb;
  v_rank    integer;
  v_human   jsonb;
  v_spine   jsonb;
  v_cb      jsonb;
  v_ids     jsonb;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- §27 is a SECURITY requirement, not a layout preference. A commercial reads their own files; Admin,
  -- Finance and Legal read every one. The same line every other CRM reader in this product draws.
  if not app.can_see_person(p_person) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_p from public.persons ps where ps.id = p_person;
  if not found then
    return null;
  end if;

  v_stage := app.person_stage(p_person);
  v_rank  := (v_stage->>'rank')::integer;
  v_human := app.person_human_status(p_person, v_stage->>'lead_stage');

  -- The path, with what has been reached. `reached` is rank <= current, which is how a band is drawn — but a
  -- stage with has_fact:false was never PROVEN even when it is behind the current one, so it is marked and a
  -- screen draws it hollow instead of claiming something nobody recorded.
  select coalesce(jsonb_agg(s || jsonb_build_object(
           'reached', (s->>'rank')::integer <= v_rank,
           'current', (s->>'rank')::integer = v_rank)
         order by (s->>'rank')::integer), '[]'::jsonb)
  into v_spine
  from jsonb_array_elements(app.journey_spine()) s;

  -- §5 · the live promise: the latest call on this file, if it asked for a callback and nothing later
  -- discharged it. Being the LATEST attempt is the whole test — a later call is the discharge.
  select jsonb_build_object(
           'due_at', a.next_follow_up_at,
           'by',     pr.full_name,
           'note',   a.note,
           'overdue', a.next_follow_up_at < now())
  into v_cb
  from public.contact_attempts a
  left join public.profiles pr on pr.id = a.created_by
  where a.person_id = p_person
  order by a.created_at desc limit 1;
  if v_cb is null or v_cb->>'due_at' is null then v_cb := null; end if;

  -- §26 · ONE Customer ID and one Deal ID travelling the whole way, read back in one place so a screen never
  -- has to join five tables to print a reference number.
  select jsonb_build_object(
    'person_id',  v_p.id,
    'request_no', (select r.request_no from public.interest_requests r
                   where r.person_id = p_person order by r.created_at desc limit 1),
    'request_id', (select r.id from public.interest_requests r
                   where r.person_id = p_person order by r.created_at desc limit 1),
    'visit_no',   (select v.visit_no from public.visits v
                   where v.person_id = p_person order by v.visit_date desc limit 1),
    'reservation_no', (select r.reference_no from public.reservations r
                       where r.person_id = p_person order by r.reserved_at desc limit 1),
    'contract_no',(select c.reference_no from public.contracts c
                   where c.person_id = p_person order by c.created_at desc limit 1),
    'project_id', (select coalesce(
                     (select c.project_id from public.contracts c where c.person_id = p_person
                      order by c.created_at desc limit 1),
                     (select r.project_id from public.reservations r where r.person_id = p_person
                      order by r.reserved_at desc limit 1),
                     (select v.project_id from public.visits v where v.person_id = p_person
                      order by v.visit_date desc limit 1))),
    'trees_held', (select count(*)::integer from public.trees t
                   where t.held_by = p_person and t.state <> 'available'))
  into v_ids;

  return jsonb_build_object(
    'person', jsonb_build_object(
      'id', v_p.id, 'full_name', v_p.full_name, 'phone_e164', v_p.phone_e164,
      'whatsapp_e164', v_p.whatsapp_e164, 'created_at', v_p.created_at,
      'assigned_to', v_p.assigned_to,
      'assigned_to_name', (select pr.full_name from public.profiles pr where pr.id = v_p.assigned_to)),
    'stage',    v_stage,
    'human',    v_human,
    'spine',    v_spine,
    'callback', v_cb,
    'ids',      v_ids,
    'timeline', app.journey_timeline(p_person, p_timeline_limit),
    'unknown',  app.setting_text('journey.unknown_label', 'غير معروف'));
end $$;
revoke execute on function public.staff_customer_journey(uuid, integer) from public, anon;
grant execute on function public.staff_customer_journey(uuid, integer) to authenticated;

comment on function public.staff_customer_journey(uuid, integer) is
  'WHERE this customer is and HOW THEY GOT HERE, in one read (the owner''s §1, §25 and §26): the derived stage with the row that proves it, the human status beside it and whether the two agree, the thirteen-stage path, the live callback, the identifiers that travel the journey, and the whole timeline. Gated twice — app.is_staff() and app.can_see_person() — before anything is read.';

-- THE SAME ANSWER FOR A LIST. A queue screen and §28's dashboard need the stage of many people at once;
-- without this they would call the single reader in a loop, which is the shape that makes a screen slow and
-- a dashboard disagree with itself. Row by row on app.can_see_person, exactly as staff_visit_board does.
create or replace function public.staff_person_stage(p_person_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  -- The same ceiling staff_set_tree_state uses, for the same reason: one call must not walk an inventory.
  v_cap integer := 500;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_person_ids is null or cardinality(p_person_ids) = 0 then
    return '[]'::jsonb;
  end if;
  if cardinality(p_person_ids) > v_cap then
    raise exception 'too_many_persons' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('person_id', x.id, 'stage', app.person_stage(x.id)))
    from (select distinct ps.id from public.persons ps
          where ps.id = any (p_person_ids) and app.can_see_person(ps.id)) x), '[]'::jsonb);
end $$;
revoke execute on function public.staff_person_stage(uuid[]) from public, anon;
grant execute on function public.staff_person_stage(uuid[]) to authenticated;

comment on function public.staff_person_stage(uuid[]) is
  'The derived funnel stage for up to 500 people in one call, for a queue screen or the §28 funnel dashboard. Files the caller may not see are simply absent from the answer — never nulled, never counted.';


-- ===========================================================================
-- 5 · §5 · THE CALLBACK — a column, and why not a table
-- ===========================================================================

-- «لم يتم الرد ⇒ يتحدد تاريخ ووقت لإعادة الاتصال، والـLead يرجع للموظف في الوقت المحدد.»
--
-- THE DECISION: public.contact_attempts.next_follow_up_at, the column that already exists, indexed on
-- (created_by, next_follow_up_at) since 0002. NOT a new table. The argument, because the task asks for one:
--
--   · A callback is not an object. It is an attribute of the call that failed — one person, one time, one
--     agent who promised it. A table would carry person_id, created_by, due_at, done_at, cancelled_at and
--     would immediately be able to disagree with the attempt row that caused it. Two records of one promise
--     is the same mistake 0063 refused when it kept the tree counts in public.trees and nowhere else.
--   · «Done» is not a status anybody would tick. A callback is discharged by the NEXT call, which is a row
--     somebody writes anyway. A table would need a second act — mark it done — and it would rot on the first
--     busy morning, and then the queue would be lying, which is worse than having no queue.
--   · Two promises on one file is not a case: the latest call is the promise that stands. That is a query,
--     not a schema.
--   · And a table would need its own RLS, its own audit trigger and its own can_see_person, all of which
--     contact_attempts already has and already passes.
--
-- WHAT WAS ACTUALLY BROKEN WAS THE QUERY, AND THAT IS WHAT THIS FIXES. The dashboard's «متابعاتي المستحقة»
-- reads only the last 30 days, so a callback promised five weeks ago silently disappears — the lead does NOT
-- «come back at that moment», it falls out of the product. This reader has no window at all by default, and
-- it separates متأخرة from اليوم so the oldest broken promise is the first thing on the screen.
create or replace function public.staff_callbacks(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope   text    := lower(coalesce(nullif(btrim(p->>'scope'), ''), 'mine'));
  v_limit   integer := least(greatest(coalesce(nullif(p->>'limit', '')::integer, 100), 1), 300);
  -- 0 = no ceiling, which is the seeded default: a promise made for next month is still a promise.
  v_horizon integer := greatest(app.setting_int('journey.callback_horizon_days', 0), 0);
  v_owner   uuid    := nullif(p->>'assigned_to', '')::uuid;
  v_today   date    := app.tunis_today();
  v_calls   jsonb   := coalesce(app.setting('journey.call_outcome_labels'), '{}'::jsonb);
  v_rows    jsonb;
  v_counts  jsonb;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_scope not in ('mine', 'all') then
    raise exception 'invalid_callback_scope' using errcode = 'P0001';
  end if;

  with candidates as (
    -- Only files that ever carried a promise. Served by contact_attempts_follow_up_idx (0002), and it keeps
    -- app.can_see_person from being called once per call ever logged in the product.
    select distinct a.person_id from public.contact_attempts a where a.next_follow_up_at is not null
  ),
  latest as (
    -- The LATEST attempt per file, WHATEVER IT SAID. Taking the latest attempt that HAS a date instead would
    -- resurrect a promise a later call already discharged, which is the whole reason this needs no «done»
    -- button: the next call is the discharge, and somebody makes that call anyway.
    select distinct on (a.person_id)
           a.id, a.person_id, a.created_by, a.created_at, a.channel, a.outcome, a.note, a.next_follow_up_at
    from public.contact_attempts a
    where a.person_id in (select c.person_id from candidates c)
      and app.can_see_person(a.person_id)
    order by a.person_id, a.created_at desc, a.id
  ),
  due as (
    select l.*,
           case when l.next_follow_up_at < now() then 'overdue'
                when (l.next_follow_up_at at time zone 'Africa/Tunis')::date = v_today then 'today'
                else 'upcoming' end as bucket
    from latest l
    where l.next_follow_up_at is not null
      and (v_scope = 'all' or l.created_by = auth.uid())
      and (v_owner is null or l.created_by = v_owner)
      and (v_horizon = 0 or l.next_follow_up_at < now() + make_interval(days => v_horizon))
  ),
  capped as (select d.* from due d order by d.next_follow_up_at limit v_limit)
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'person_id',   c.person_id,
      'full_name',   ps.full_name,
      'phone_e164',  ps.phone_e164,
      'whatsapp_e164', ps.whatsapp_e164,
      'due_at',      c.next_follow_up_at,
      'bucket',      c.bucket,
      'channel',     c.channel,
      'outcome',     coalesce(v_calls->>c.outcome::text, c.outcome::text),
      'note',        c.note,
      'promised_at', c.created_at,
      'promised_by', pr.full_name,
      'assigned_to_name', own.full_name,
      'status_label', st.label_ar,
      -- The stage the file is REALLY at, so an agent ringing back knows whether the answer is «وقتاش نزورو»
      -- or «العربون وصل». One call, not a second round trip per row.
      'stage',       app.person_stage(c.person_id))
    order by c.next_follow_up_at), '[]'::jsonb),
    jsonb_build_object(
      'total',    count(*),
      'overdue',  count(*) filter (where c.bucket = 'overdue'),
      'today',    count(*) filter (where c.bucket = 'today'),
      'upcoming', count(*) filter (where c.bucket = 'upcoming'))
  into v_rows, v_counts
  from capped c
  join public.persons ps on ps.id = c.person_id
  left join public.lead_statuses st on st.id = ps.status_id
  left join public.profiles pr on pr.id = c.created_by
  left join public.profiles own on own.id = ps.assigned_to;

  return jsonb_build_object(
    'scope',   v_scope,
    'today',   v_today,
    'horizon_days', v_horizon,
    'counts',  v_counts,
    'rows',    coalesce(v_rows, '[]'::jsonb));
end $$;
revoke execute on function public.staff_callbacks(jsonb) from public, anon;
grant execute on function public.staff_callbacks(jsonb) to authenticated;

comment on function public.staff_callbacks(jsonb) is
  'WHAT IS DUE TO ME NOW (report v3 §5): every file whose LATEST call promised a callback that nothing has discharged, split into متأخرة · اليوم · قادمة, earliest first, with the file''s derived stage on the row. scope=mine (default) is the caller''s own promises; scope=all is every file they may see. No 30-day window: a promise made five weeks ago is still a broken promise, and the old dashboard query simply dropped it.';
