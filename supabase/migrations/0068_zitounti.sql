-- bb_42 · فضاء «زيتونتي» — the client's file after the sale (v3 §38 ممتلكاتي, §39 Citizen Dashboard, v2 §39).
--
-- ███ ITS TEST LIVES IN supabase/pending/tests/042_zitounti.sql, NOT in supabase/tests/ — a file in
-- ███ supabase/tests/ is run by `npm run db:test` against the LIVE database, where public.staff_zitounti_file
-- ███ does not exist, so it would stand permanently red. WHOEVER APPLIES THIS FILE MOVES ITS TEST BACK:
-- ███   git mv supabase/pending/tests/042_zitounti.sql supabase/tests/042_zitounti.sql
--
-- DRAFT. Never applied by the session that wrote it. Dry-run only:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_42_zitounti.sql supabase/pending/tests/042_zitounti.sql
--
-- ---------------------------------------------------------------------------
-- THE DECISION THIS FILE IS BUILT ON: THERE IS NO CLIENT LOGIN, SO THERE IS NO CLIENT ROUTE
-- ---------------------------------------------------------------------------
-- Verified on the live database on 2026-09-19, four ways over:
--   · auth.users holds two rows, both staff; public.user_roles is {commercial: 1, super_admin: 1} and not one
--     row carries 'client'.
--   · public.persons.profile_id exists and is NULL on all 20 rows; nothing in the codebase writes it.
--   · src/lib/auth.ts strips 'client' from every session (StaffRole = Exclude<AppRole,'client'>) and
--     src/app/admin/login/actions.ts signs a client straight back out. /admin/login is the only sign-in route.
--   · No RLS policy in schema public reads profile_id, and 0054_trees.sql says so in its own words: «a self-read
--     policy today would be a policy that can never match».
--
-- So this file builds the CONTENT of زيتونتي and not its door. It adds NO authentication, NO client RLS policy,
-- NO public read, and it does not write persons.profile_id. How a buyer signs in (phone OTP? e-mail? a link sent
-- by SMS?) is a decision the owner has not made, it touches every client record, and inventing it inside a
-- feature batch would give AgriZed a second front door nobody reviewed.
--
-- What it builds instead is one read: a staff member opens a client and sees the file the client will one day
-- see of themselves — their numbered trees, what was done to them, what they asked for, what they paid, what
-- came out of the season. A commercial can read it down the phone today, and the day a client login exists the
-- SAME function answers the client, because the payload is already keyed by person and nothing in it is staff
-- prose. The three lines that open that day are written out at the end of this file, commented, so the next
-- reader does not have to rediscover them.
--
-- ---------------------------------------------------------------------------
-- IT READS. IT WRITES NOTHING.
-- ---------------------------------------------------------------------------
-- No table, no enum, no trigger, no sequence. زيتونتي owns no business record: every figure in it was written by
-- a module that owns it — trees (0054), interest_requests (0049), reservations/payments (0063), visits (0064),
-- and the three stage-4 records being drafted in this same phase (agricultural operations, the annual
-- subscription, the harvest season). This file is the join, and the join is the whole module.
--
-- Consequence, deliberately: if a row is not written anywhere, زيتونتي shows «مازال ما تسجّلش» and does not
-- invent it. Five of v3 §38's twelve rows are in that state today (العقد · المبلغ المدفوع كاملاً · المبلغ
-- المتبقي · القسط القادم belong to stage 3; مخطط القطعة belongs to the retiring parcel layer and is answered
-- here by projects.plan_storage_path instead).
--
-- ---------------------------------------------------------------------------
-- WHAT IT DOES NOT SHOW, ON PURPOSE
-- ---------------------------------------------------------------------------
-- · AgriZed's own cost of anything. An agricultural operation carries a Cost (v2 §41); that is what AgriZed paid
--   a supplier, not what the client owes, and it is a margin figure (v3 §53 — Finance and Admin only). The
--   operations section reads the service, the dates and the offer, and never the cost column.
-- · Any price this file computed itself. The money it shows is money someone already wrote down: the quotation
--   snapshotted on interest_requests at the moment the client asked (offer_price_per_tree_millimes,
--   offer_annual_fee_per_tree_millimes — three different annual fees are live on that table already, 150 000,
--   25 000 and 12 000 millimes, which is exactly why the snapshot is read and app.tree_price is not), and the
--   receipts on public.payments. Nothing here calls a pricing function.
-- · Another person's anything. Every read is filtered to one person id, and the entry point refuses unless
--   app.can_see_person() says this reader may open that file — the same predicate that already gates
--   interest_requests, contact_attempts, person_notes, reservations, visits and payments.
--
-- ---------------------------------------------------------------------------
-- GATING, BOTH HALVES
-- ---------------------------------------------------------------------------
-- public.staff_zitounti_file() refuses with module_closed while the `zitounti` flag is 'disabled', which it is
-- and must stay — the owner switches a module on himself, from الإعدادات ← الموديولات. The pages check
-- moduleAccess(config, 'zitounti') as well, so a closed module never renders a shell that then errors.
--
-- Each SECTION of the file carries its own gate as well, because each belongs to a different module:
--   حجوزاتي → app.module_open('reservations')      زياراتي → app.module_open('visits')
--   دفعاتي  → 'reservations' or 'installments'      الخدمات → 'agri_backoffice' / 'subscriptions'
--   الصابة  → 'harvest'                             عقودي/أقساطي → 'contracts' / 'installments' (stage 3)
-- A closed section answers status='closed' and an empty list, so the screen says «الوحدة معطّلة» rather than
-- «ما فمّاش حجوزات», which would be a lie about the data.
--
-- ---------------------------------------------------------------------------
-- THE THREE SECTIONS WHOSE TABLES ARE DRAFTED BESIDE THIS ONE
-- ---------------------------------------------------------------------------
-- العمليات الفلاحية, الاشتراك السنوي and الصابة are written by the two other stage-4 drafts, in this same phase:
--   supabase/pending/bb_40_agri_services.sql → public.project_service_terms, public.agri_operations,
--                                              public.agri_operation_trees, public.subscriptions,
--                                              public.subscription_lines
--   supabase/pending/bb_41_harvest.sql       → public.harvest_seasons, public.harvest_choices,
--                                              public.harvest_shares
-- Neither is applied. A static reference to a table that does not exist yet would make this file impossible to
-- apply OR to dry-run, and would tie the order the three are applied in to the order they were written.
--
-- So each of those three questions is one named function holding one query, run through app.zitounti_probe(),
-- which answers NULL instead of raising when the table is not there. The section then reports
-- status='not_built' and the screen says «هذا الجزء مازال ما تركّبش» — the truth today, and the truth again for
-- anyone who applies this file before the other two.
--
-- The three queries were reconciled against the real column lists of bb_40 and bb_41 once those drafts landed
-- (verified by dry-running all three files in one transaction). What each one reads, and nothing else knows
-- these names:
--   agri_operations      id, project_id, label_ar, status, scope, planned_on, executed_on — never cost_millimes
--   agri_operation_trees operation_id, tree_id
--   subscriptions        id, person_id, project_id, season_label, season_starts_on, tree_count,
--                        fee_per_tree_millimes, total_millimes, status, payment_status
--   subscription_lines   subscription_id, label_ar, in_package, amount_millimes, status
--   harvest_seasons      id, project_id, label_ar, season_year, status, choice_deadline, olives_kg, oil_litres,
--                        trees_harvested
--   harvest_shares       season_id, person_id, trees_held, trees_harvested, olives_kg, oil_litres,
--                        pick_label_ar, outcome_label_ar, choice_source
--   harvest_choices      season_id, person_id, pick_option_id, outcome_option_id, source
--
-- ---------------------------------------------------------------------------
-- TypeScript that moves with this file when it is applied
-- ---------------------------------------------------------------------------
--   1. npm run db:types                                  — staff_zitounti_file and staff_zitounti_holders appear.
--   2. src/app/admin/(panel)/persons/read.ts             — delete the one documented cast at the top; the two
--                                                          calls then typecheck against the generated types.
--   3. Nothing else. The pages already read the payload's own shape.
--
-- When it is applied, rename it to supabase/migrations/00NN_zitounti.sql and its test to
-- supabase/tests/0NN_zitounti.sql, with the number in the first line of each.

-- ---------------------------------------------------------------------------
-- 1 · What the module says, in the owner's words
-- ---------------------------------------------------------------------------

-- WHAT THE MODULE DOES, for the modules screen. It says plainly that it is the staff reading today, so the
-- owner is not told a client-facing space exists when it does not.
update public.feature_flags
   set description_ar = 'فضاء «زيتونتي»: ملف الحريف بعد التملّك — زيتوناته بأرقامها، شنوّة تعمل فيهم، شنوّة طلب، شنوّة خلّص، وشنوّة خرجت الصابة. اليوم يقراه فريق AgriZed من ملف الحريف؛ باش يفتح للحريف بنفسه يلزم أول قرار كيفاش يدخل الحريف لحسابه.'
 where key = 'zitounti';

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('zitounti.title', to_jsonb('فضاء «زيتونتي»'::text), 'text', 'zitounti',
   'اسم الفضاء', 'الاسم اللي يظهر في الصفحة العمومية وفوق ملف الحريف.', true, 10),
  ('zitounti.intro',
   to_jsonb('هوني تتبّع زيتوناتك: أرقامها، وين هي، شنوّة تعمل فيها، وشنوّة خرجت من صابة العام.'::text),
   'text', 'zitounti', 'جملة التعريف', 'الجملة اللي تشرح الفضاء للزائر وللحريف.', true, 20),
  ('zitounti.closed_note',
   to_jsonb('الفضاء مازال ما تفتحش للحرفاء. فريق AgriZed يقرالك ملفك ويعطيك أخبار زيتوناتك في التيليفون، وكي يفتح نعلموك.'::text),
   'text', 'zitounti', 'جملة «مازال ما فتحش»',
   'تظهر للزائر باش يعرف كيفاش يوصل لمعلوماته اليوم. بدّلها كي يولّي للحريف حساب خاص بيه.', true, 30),
  ('zitounti.staff_note',
   to_jsonb('هذا الملف كيما باش يشوفه الحريف في فضائه. كل رقم فيه مكتوب في مكان آخر — ما فمّاش شيء يتحسب هوني.'::text),
   'text', 'zitounti', 'جملة فوق ملف الحريف', 'تفكّر الفريق إنّ الصفحة هذي قراية برك.', false, 40),
  ('zitounti.empty_trees',
   to_jsonb('هذا الحريف مازال ما عندوش زيتونات مسجّلة باسمه. الزيتونة تولّي متاعه كي تتسجّل «مباعة» باسمه في بطاقة العرض.'::text),
   'text', 'zitounti', 'كي ما عندوش زيتونات', 'الجملة اللي تظهر في ملف حريف ما يملك حتى زيتونة.', false, 50),
  ('zitounti.not_built_note',
   to_jsonb('هذا الجزء مازال ما تركّبش في قاعدة البيانات. يُبنى في دفعة قادمة.'::text),
   'text', 'zitounti', 'كي الجزء مازال ما تبناش', 'تظهر في الأجزاء اللي جداولها مازالت ما تعملتش.', false, 60),
  ('zitounti.closed_section_note',
   to_jsonb('الوحدة اللي تكتب هذا الجزء معطّلة. شغّلها من الإعدادات ← الموديولات باش يبان.'::text),
   'text', 'zitounti', 'كي وحدة الجزء معطّلة', 'تفرّق بين «ما فمّاش معطيات» و«الوحدة مطفية».', false, 70),
  ('zitounti.share_note',
   to_jsonb('هذا الرقم حصّتك من صابة الضيعة الكل، محسوبة بعدد زيتوناتك — موش وزن زيتونة زيتونة.'::text),
   'text', 'zitounti', 'شرح حصّة الصابة',
   'ضروري: الصابة تتوزن للضيعة الكل مرة وحدة، والحصّة تتحسب بعدد الزيتونات.', true, 80),
  ('zitounti.max_codes', to_jsonb(200), 'integer', 'zitounti',
   'أقصى عدد رموز تتعرض', 'ملف فيه آلاف الزيتونات ما ينجمش يعرضهم الكل. الباقي يتعدّ برك.', false, 90),

  -- The sections of the file, in the order v3 §39 names them. The ORDER and the module each one belongs to are
  -- in the code, because they are structure; every word on the screen is here, because the owner owns the words.
  ('zitounti.section_trees', to_jsonb('زيتوناتي'::text), 'text', 'zitounti',
   'عنوان جزء الزيتونات', 'أهم جزء: زيتونات الحريف برموزها، عرض بعرض.', true, 100),
  ('zitounti.section_requests', to_jsonb('مطالبي'::text), 'text', 'zitounti',
   'عنوان جزء المطالب', 'شنوّة طلب الحريف، وشنوّة قلنالو وقتها.', true, 110),
  ('zitounti.section_reservations', to_jsonb('حجوزاتي'::text), 'text', 'zitounti',
   'عنوان جزء الحجوزات', '', true, 120),
  ('zitounti.section_visits', to_jsonb('زياراتي'::text), 'text', 'zitounti',
   'عنوان جزء الزيارات', '', true, 130),
  ('zitounti.section_payments', to_jsonb('دفعاتي'::text), 'text', 'zitounti',
   'عنوان جزء الدفعات', 'الفلوس اللي خلّصها الحريف فعلاً.', true, 140),
  ('zitounti.section_operations', to_jsonb('الخدمات الفلاحية'::text), 'text', 'zitounti',
   'عنوان جزء العمليات الفلاحية', 'شنوّة تعمل في الغراسة ووقتاش.', true, 150),
  ('zitounti.section_subscription', to_jsonb('الاشتراك السنوي'::text), 'text', 'zitounti',
   'عنوان جزء الاشتراك', '', true, 160),
  ('zitounti.section_harvest', to_jsonb('الصابة'::text), 'text', 'zitounti',
   'عنوان جزء الصابة', '', true, 170),
  ('zitounti.section_contracts', to_jsonb('العقود والأقساط'::text), 'text', 'zitounti',
   'عنوان جزء العقود والأقساط', 'مازال ما تبناش — يظهر مكتوب «يُبنى في دفعة قادمة».', true, 180),
  ('zitounti.section_documents', to_jsonb('الوثائق'::text), 'text', 'zitounti',
   'عنوان جزء الوثائق', '', true, 190),
  ('zitounti.section_later', to_jsonb('يُبنى في دفعة قادمة'::text), 'text', 'zitounti',
   'كلمة «مازال ما تبناش» في الصفحة العمومية',
   'نفس الكلمة اللي في شاشة الموديولات، باش الزائر يقرا نفس اللغة.', true, 195),
  ('zitounti.row_area', to_jsonb('المساحة'::text), 'text', 'zitounti',
   'اسم سطر المساحة', 'مساحة زيتونات الحريف في هذا العرض، محسوبة من فئة التباعد.', true, 200),
  ('zitounti.row_area_unknown',
   to_jsonb('العرض عندو أكثر من فئة تباعد، والزيتونة ما تقولش في أنهي فئة هي. المساحة تتحسب كي تتسجّل الفئة على كل زيتونة.'::text),
   'text', 'zitounti', 'كي المساحة ما تتحسبش',
   'ما نكذبوش على الحريف بمساحة مقدّرة: نقولو علاش ما عندناش الرقم.', true, 210)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Reading a record another module has not written yet
-- ---------------------------------------------------------------------------

-- Runs one read-only query that takes exactly one uuid, and answers NULL — not an error — when the table or a
-- column it names does not exist. That is what lets زيتونتي ship before the three stage-4 records it joins, and
-- what makes the difference between «ما عندك حتى خدمة» and «السجلّ مازال ما تركّبش» visible on the screen.
--
-- SECURITY INVOKER on purpose. It is called only from inside the security-definer functions below, where it
-- therefore runs with the owner's rights anyway; but it is not itself a way for an authenticated caller to run
-- SQL as the owner. Execute is revoked from everyone regardless, and every p_sql it is ever passed is a literal
-- written in this file — no caller composes one.
create or replace function app.zitounti_probe(p_sql text, p_person uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_out jsonb;
begin
  execute p_sql into v_out using p_person;
  return coalesce(v_out, '[]'::jsonb);
exception
  when undefined_table or undefined_column or undefined_function or undefined_object or invalid_schema_name then
    return null;
end $$;
revoke execute on function app.zitounti_probe(text, uuid) from public, anon, authenticated;

comment on function app.zitounti_probe(text, uuid) is
  'Runs one read-only query for one person and returns NULL when the table it names is not there yet. The three stage-4 records زيتونتي joins (agricultural operations, the annual subscription, the harvest season) are drafted in parallel by other files; this is what lets this one apply, dry-run and render before them.';

-- A section of the file: what it holds, and why it holds nothing when it does.
--   ok         read, with rows or without
--   closed     the module that writes this record is switched off
--   not_built  its table does not exist yet
--   phase_later a stage that is deliberately not built (contracts, instalments)
create or replace function app.zitounti_section(p_status text, p_items jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('status', p_status, 'items', coalesce(p_items, '[]'::jsonb),
                            'count', coalesce(jsonb_array_length(p_items), 0))
$$;
revoke execute on function app.zitounti_section(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · One named function per question
-- ---------------------------------------------------------------------------

-- WHO. The identity half, and only the fields a client file needs; the CRM keeps the rest.
create or replace function app.zitounti_person(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'id', p.id,
           'full_name', p.full_name,
           'phone_e164', p.phone_e164,
           'whatsapp_e164', p.whatsapp_e164,
           'email', p.email,
           'governorate', g.name_ar,
           'delegation', d.name_ar,
           'created_at', p.created_at,
           'archived', p.archived_at is not null,
           -- Written nowhere today. It is the one column that turns this staff read into a client read, so the
           -- screen states plainly whether this person could sign in if the door existed.
           'has_account', p.profile_id is not null,
           'status_ar', ls.label_ar,
           'assigned_to', pr.full_name)
    from public.persons p
    left join public.governorates g on g.id = p.governorate_id
    left join public.delegations   d on d.id = p.delegation_id
    left join public.lead_statuses ls on ls.id = p.status_id
    left join public.profiles      pr on pr.id = p.assigned_to
   where p.id = p_person
$$;
revoke execute on function app.zitounti_person(uuid) from public, anon, authenticated;

-- WHICH TREES ARE MINE — the first thing a buyer wants, by the codes they were given (OFF-AIRPORT-0042).
-- Grouped per offer, because that is the grain of everything else in the file: the offer is where the trees
-- stand, what was done to them, and whose season they belong to.
--
-- AREA. A tree carries no area of its own: the offer's spacing class does (0031). When an offer declares one
-- class the area per tree is that class's; when it declares several, nothing on the tree says which one it
-- stands in, so this answers null rather than picking one. That gap is real and belongs in a later migration
-- (a spacing_class_id on public.trees), not in a guess here.
create or replace function app.zitounti_trees(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'project_code'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'project_id',       pj.id,
             'project_code',     pj.code,
             'project_name',     pj.name,
             'project_status',   pj.status,
             'governorate',      g.name_ar,
             'delegation',       d.name_ar,
             'olive_variety',    pj.olive_variety,
             'plantation_system', pj.plantation_system,
             'production_status', pj.production_status,
             -- v3 §38 «مخطط القطعة»: the offer's plan, not a parcel's — public.parcels holds no rows and is
             -- being retired by bb_03.
             'plan_storage_path', pj.plan_storage_path,
             'photos',           (select count(*) from public.project_media m where m.project_id = pj.id),
             'area_per_tree_m2', sp.area_m2,
             'area_m2',          case when sp.area_m2 is not null then round(sp.area_m2 * count(*)) end,
             'trees',            count(*),
             'trees_sold',       count(*) filter (where t.state = 'sold'),
             'trees_reserved',   count(*) filter (where t.state = 'reserved'),
             -- In tree order, never alphabetical: a pattern edited between two generations would make the
             -- alphabetically first code a different tree from tree number one (0054 §5).
             'first_code',       (array_agg(t.code order by t.seq))[1],
             'last_code',        (array_agg(t.code order by t.seq desc))[1],
             'codes',            (array_agg(t.code order by t.seq))[1:greatest(app.setting_int('zitounti.max_codes', 200), 1)],
             -- Names only, no price (0023). What this offer promises to do; what was actually done is the
             -- operations section.
             'services',         (select coalesce(array_agg(oi.label_ar order by oi.sort_order), '{}')
                                    from public.option_items oi
                                   where oi.id = any (pj.service_option_ids) and oi.is_active)
           ) as x
      from public.trees t
      join public.projects pj on pj.id = t.project_id
      left join public.governorates g on g.id = pj.governorate_id
      left join public.delegations  d on d.id = pj.delegation_id
      left join lateral (
             select case when count(*) = 1 then max(tsc.area_m2) end as area_m2
               from public.project_spacing_classes psc
               join public.tree_spacing_classes tsc on tsc.id = psc.spacing_class_id
              where psc.project_id = pj.id
           ) sp on true
     where t.held_by = p_person
     group by pj.id, g.name_ar, d.name_ar, sp.area_m2
  ) s
$$;
revoke execute on function app.zitounti_trees(uuid) from public, anon, authenticated;

-- WHAT I ASKED FOR, and what I was quoted on the day I asked. The figures are the snapshot the request itself
-- carries (0049) — never recomputed, because the annual fee has already changed three times under four live
-- requests (150 000 · 25 000 · 12 000 millimes per tree per year) and a client is owed the number they were
-- shown, not today's.
create or replace function app.zitounti_requests(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'request_no', r.request_no,
           'created_at', r.created_at,
           'kind', r.request_kind,
           'project_id', r.project_id,
           'project_code', pj.code,
           'project_name', pj.name,
           'trees', r.offer_trees,
           'price_per_tree_millimes', r.offer_price_per_tree_millimes,
           'total_price_millimes', r.offer_total_price_millimes,
           'annual_fee_per_tree_millimes', r.offer_annual_fee_per_tree_millimes,
           'annual_fee_total_millimes', r.offer_annual_fee_total_millimes)
         order by r.created_at desc), '[]'::jsonb)
    from public.interest_requests r
    left join public.projects pj on pj.id = r.project_id
   where r.person_id = p_person
$$;
revoke execute on function app.zitounti_requests(uuid) from public, anon, authenticated;

-- MY RESERVATIONS (0063).
create or replace function app.zitounti_reservations(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', rs.id,
           'reference_no', rs.reference_no,
           'status', rs.status,
           'project_id', rs.project_id,
           'project_code', pj.code,
           'trees', rs.trees_count,
           'deposit_due_millimes', rs.deposit_due_millimes,
           'reserved_at', rs.reserved_at,
           'expires_at', rs.expires_at,
           'deposit_paid_at', rs.deposit_paid_at)
         order by rs.reserved_at desc), '[]'::jsonb)
    from public.reservations rs
    left join public.projects pj on pj.id = rs.project_id
   where rs.person_id = p_person
$$;
revoke execute on function app.zitounti_reservations(uuid) from public, anon, authenticated;

-- MY VISITS (0064).
create or replace function app.zitounti_visits(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id,
           'visit_no', v.visit_no,
           'status', v.status,
           'project_id', v.project_id,
           'project_code', pj.code,
           'visit_date', v.visit_date,
           'slot_label_ar', v.slot_label_ar,
           'meeting_point', v.meeting_point)
         order by v.visit_date desc nulls last), '[]'::jsonb)
    from public.visits v
    left join public.projects pj on pj.id = v.project_id
   where v.person_id = p_person
$$;
revoke execute on function app.zitounti_visits(uuid) from public, anon, authenticated;

-- WHAT I PAID (0063). The only receipt in the schema. A voided receipt is kept and marked, never dropped: a
-- client who was told «خلّصت» and then sees the line disappear has no way to ask what happened to it.
create or replace function app.zitounti_payments(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pm.id,
           'reference_no', pm.reference_no,
           'kind', pm.kind,
           'project_id', pm.project_id,
           'project_code', pj.code,
           'amount_millimes', pm.amount_millimes,
           'method_label_ar', pm.method_label_ar,
           'received_at', pm.received_at,
           'voided', pm.voided_at is not null)
         order by pm.received_at desc), '[]'::jsonb)
    from public.payments pm
    left join public.projects pj on pj.id = pm.project_id
   where pm.person_id = p_person
$$;
revoke execute on function app.zitounti_payments(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · The three records another stage-4 file is writing in this same phase
-- ---------------------------------------------------------------------------

-- العمليات الفلاحية (flag agri_backoffice, draft bb_40_agri_services.sql). An operation is recorded once at
-- offer grain — ploughing a grove is one act, not 8 000 — with scope='trees' and public.agri_operation_trees
-- naming trees only when it touched some and not others. A client therefore sees every whole-offer act on their
-- offer, plus the ones that named their own trees, and never a cancelled one.
--
-- TWO COLUMNS ARE DELIBERATELY NOT READ. cost_millimes is what AgriZed paid a supplier — a margin figure, Finance
-- and Admin only (v3 §53) — and provider_note names the contractor, which is AgriZed's commercial relationship,
-- not the client's. The client is owed «شنوّة تعمل في زيتوناتي ووقتاش», and that is what this returns.
--
-- IT CROSSES THE AGRI DESK'S RLS ON PURPOSE, and narrowly. public.agri_operations is readable only by
-- app.can_manage_operations() (agri_manager, Finance, Admin), which excludes the commercial who reads this file.
-- The read below runs as the definer, so it passes that policy — which is correct, because these three fields
-- are exactly what the client themselves will see of their own trees, and a commercial reading them to their own
-- client is the module's whole purpose. The narrowing is what keeps it honest: one person's offers, no cost, no
-- supplier. Widen either and this becomes a way around a policy the agricultural desk set on purpose.
create or replace function app.zitounti_operations(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select app.zitounti_probe($q$
    select jsonb_agg(jsonb_build_object(
             'id', o.id,
             'project_id', o.project_id,
             'project_code', pj.code,
             -- The label frozen on the operation, not today's option list: a service the owner renames must not
             -- rewrite what a client was told was done to his trees.
             'service_ar', o.label_ar,
             'status', o.status,
             'scope', o.scope,
             'planned_on', o.planned_on,
             'executed_on', o.executed_on)
           order by coalesce(o.executed_on, o.planned_on) desc nulls last)
      from public.agri_operations o
      left join public.projects pj on pj.id = o.project_id
     where o.project_id in (select distinct t.project_id from public.trees t where t.held_by = $1)
       and o.status <> 'cancelled'
       and (o.scope = 'offer'
            or exists (select 1 from public.agri_operation_trees ot
                         join public.trees t on t.id = ot.tree_id
                        where ot.operation_id = o.id and t.held_by = $1))
  $q$, p_person)
$fn$;
revoke execute on function app.zitounti_operations(uuid) from public, anon, authenticated;

-- الاشتراك السنوي (flag subscriptions, draft bb_40_agri_services.sql). §36 names Status and Payment as two
-- separate attributes and bb_40 stores them as two columns, so they are read as two and never merged into one
-- label. The amount is the subscription's own frozen figure (tree_count × the fee snapshotted at signature),
-- never recomputed from today's pricing rule.
--
-- The package lines come with it: «شنو داخل وشنو خارج الباقة» (v2 §40) is the one question a client actually
-- asks about a subscription, and a row with a total and no contents does not answer it.
create or replace function app.zitounti_subscription(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select app.zitounti_probe($q$
    select jsonb_agg(jsonb_build_object(
             'id', s.id,
             'project_id', s.project_id,
             'project_code', pj.code,
             'season_label', s.season_label,
             'season_starts_on', s.season_starts_on,
             'trees', s.tree_count,
             'fee_per_tree_millimes', s.fee_per_tree_millimes,
             'amount_millimes', s.total_millimes,
             'status', s.status,
             'payment_status', s.payment_status,
             'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'label_ar', l.label_ar,
                                 'in_package', l.in_package,
                                 'amount_millimes', l.amount_millimes,
                                 'status', l.status)
                               order by l.in_package desc, l.label_ar), '[]'::jsonb)
                         from public.subscription_lines l where l.subscription_id = s.id))
           order by s.season_starts_on desc)
      from public.subscriptions s
      left join public.projects pj on pj.id = s.project_id
     where s.person_id = $1
  $q$, p_person)
$fn$;
revoke execute on function app.zitounti_subscription(uuid) from public, anon, authenticated;

-- الصابة (flag harvest, draft bb_41_harvest.sql). NOTHING IS COMPUTED HERE. A season is measured once for a
-- whole grove — you weigh a truck, not a tree — and bb_41 freezes each owner's allocation into
-- public.harvest_shares at settlement, with the tree count, the denominator and the choice as they stood. This
-- reads that row. Recomputing the share here would let a later correction of the season silently restate a
-- figure an owner has already been told.
--
-- Seasons of the client's offers that are not settled yet come back too, with a null share and the season's own
-- status, so the screen can say «الصابة مازالت» and show the choice deadline instead of an empty list.
create or replace function app.zitounti_harvest(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select app.zitounti_probe($q$
    select jsonb_agg(jsonb_build_object(
             'season_id', h.id,
             'project_id', h.project_id,
             'project_code', pj.code,
             'season_label', h.label_ar,
             'season_year', h.season_year,
             'status', h.status,
             'choice_deadline', h.choice_deadline,
             'settled', sh.id is not null,
             -- The grove's season, for the sentence that explains where the share comes from.
             'season_olives_kg', h.olives_kg,
             'season_oil_litres', h.oil_litres,
             'trees_harvested', coalesce(sh.trees_harvested, h.trees_harvested),
             -- Mine, frozen at settlement.
             'my_trees', sh.trees_held,
             'my_olives_kg', sh.olives_kg,
             'my_oil_litres', sh.oil_litres,
             -- The choice: the frozen wording once settled, the live one before that (v2 §44, v3 §37).
             'pick_label_ar', coalesce(sh.pick_label_ar, pick.label_ar),
             'outcome_label_ar', coalesce(sh.outcome_label_ar, outcome.label_ar),
             'choice_source', coalesce(sh.choice_source, hc.source))
           order by h.season_year desc)
      from public.harvest_seasons h
      left join public.projects pj on pj.id = h.project_id
      left join public.harvest_shares  sh on sh.season_id = h.id and sh.person_id = $1
      left join public.harvest_choices hc on hc.season_id = h.id and hc.person_id = $1
      left join public.option_items pick    on pick.id = hc.pick_option_id
      left join public.option_items outcome on outcome.id = hc.outcome_option_id
     where h.project_id in (select distinct t.project_id from public.trees t where t.held_by = $1)
  $q$, p_person)
$fn$;
revoke execute on function app.zitounti_harvest(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5 · The one entry point
-- ---------------------------------------------------------------------------

create or replace function public.staff_zitounti_file(p_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_person jsonb;
begin
  -- The module first: a closed module answers the same way to everyone and leaks nothing about who exists.
  if not app.module_open('zitounti') then
    raise exception 'module_closed' using errcode = 'P0001';
  end if;
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Then this file in particular. A commercial reads their own clients; Finance, Legal and Admin read every
  -- one; the agricultural manager runs the grove and does not read client identities at all — the same rule the
  -- CRM has enforced since 0002, applied here rather than restated.
  if not app.can_see_person(p_person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_person := app.zitounti_person(p_person_id);
  if v_person is null then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'person', v_person,
    -- The trees are this module's own answer; nothing gates them but زيتونتي itself.
    'trees', app.zitounti_section('ok', app.zitounti_trees(p_person_id)),
    'requests', app.zitounti_section('ok', app.zitounti_requests(p_person_id)),
    'reservations', case when app.module_open('reservations')
                         then app.zitounti_section('ok', app.zitounti_reservations(p_person_id))
                         else app.zitounti_section('closed', null) end,
    'visits', case when app.module_open('visits')
                   then app.zitounti_section('ok', app.zitounti_visits(p_person_id))
                   else app.zitounti_section('closed', null) end,
    -- A receipt is money the client actually handed over. It is visible while either money module is open: the
    -- deposit belongs to الحجز, an instalment to الأقساط, and hiding one because the other is off would make the
    -- «المبلغ المدفوع» line wrong rather than absent.
    'payments', case when app.module_open('reservations') or app.module_open('installments')
                     then app.zitounti_section('ok', app.zitounti_payments(p_person_id))
                     else app.zitounti_section('closed', null) end,
    'operations', case when not app.module_open('agri_backoffice') then app.zitounti_section('closed', null)
                       when app.zitounti_operations(p_person_id) is null then app.zitounti_section('not_built', null)
                       else app.zitounti_section('ok', app.zitounti_operations(p_person_id)) end,
    'subscription', case when not app.module_open('subscriptions') then app.zitounti_section('closed', null)
                         when app.zitounti_subscription(p_person_id) is null then app.zitounti_section('not_built', null)
                         else app.zitounti_section('ok', app.zitounti_subscription(p_person_id)) end,
    'harvest', case when not app.module_open('harvest') then app.zitounti_section('closed', null)
                    when app.zitounti_harvest(p_person_id) is null then app.zitounti_section('not_built', null)
                    else app.zitounti_section('ok', app.zitounti_harvest(p_person_id)) end,
    -- v3 §38's four money rows and §39's عقودي: made from a contract, and the contract module is stage 3.
    -- They are named rather than dropped, so the screen says «يُبنى في دفعة قادمة» instead of looking finished.
    'contracts', app.zitounti_section(case when app.module_open('contracts') then 'not_built' else 'phase_later' end, null),
    'installments', app.zitounti_section(case when app.module_open('installments') then 'not_built' else 'phase_later' end, null),
    -- v3 §45 lists the documents the system keeps for a client. None is stored against a person today; the
    -- offer's own plan and photos travel with each tree group above.
    'documents', app.zitounti_section('not_built', null),
    'totals', jsonb_build_object(
      'trees', (select count(*) from public.trees t where t.held_by = p_person_id),
      'trees_sold', (select count(*) from public.trees t where t.held_by = p_person_id and t.state = 'sold'),
      'trees_reserved', (select count(*) from public.trees t where t.held_by = p_person_id and t.state = 'reserved'),
      'offers', (select count(distinct t.project_id) from public.trees t where t.held_by = p_person_id),
      'paid_millimes', case when app.module_open('reservations') or app.module_open('installments')
                            then (select coalesce(sum(pm.amount_millimes), 0) from public.payments pm
                                   where pm.person_id = p_person_id and pm.voided_at is null) end),
    'read_at', now());
end $$;

revoke execute on function public.staff_zitounti_file(uuid) from public, anon;
grant execute on function public.staff_zitounti_file(uuid) to authenticated;

comment on function public.staff_zitounti_file(uuid) is
  'فضاء «زيتونتي» for one person: their numbered trees per offer, what they asked for and were quoted, their reservations, visits and receipts, and the agricultural operations, subscription and harvest share once those records exist (v3 §38, §39). Reads only; writes nothing. Gated on the `zitounti` flag and on app.can_see_person, so a commercial reads their own files and no other. Each section carries its own status — ok, closed (its module is off), not_built (its table does not exist yet) or phase_later — so a screen never presents «no data» for «not built».';

-- The list behind it: who holds trees at all. Empty today — all 8 600 trees are available — which is itself the
-- answer the screen must give («مازال حتى حريف ما عندوش زيتونات باسمه»), not a blank page.
create or replace function public.staff_zitounti_holders() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.module_open('zitounti') then
    raise exception 'module_closed' using errcode = 'P0001';
  end if;
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'person_id', p.id,
             'full_name', p.full_name,
             'phone_e164', p.phone_e164,
             'governorate', g.name_ar,
             'trees', h.trees,
             'trees_sold', h.trees_sold,
             'trees_reserved', h.trees_reserved,
             'offers', h.offers,
             'offer_codes', h.offer_codes)
           order by h.trees_sold desc, h.trees desc), '[]'::jsonb)
      from (select t.held_by as person_id,
                   count(*) as trees,
                   count(*) filter (where t.state = 'sold') as trees_sold,
                   count(*) filter (where t.state = 'reserved') as trees_reserved,
                   count(distinct t.project_id) as offers,
                   array_agg(distinct pj.code) as offer_codes
              from public.trees t
              join public.projects pj on pj.id = t.project_id
             where t.held_by is not null
             group by t.held_by) h
      join public.persons p on p.id = h.person_id
      left join public.governorates g on g.id = p.governorate_id
     -- Row by row, not once for the caller: a commercial sees the holders in their own files and no others.
     where app.can_see_person(p.id));
end $$;

revoke execute on function public.staff_zitounti_holders() from public, anon;
grant execute on function public.staff_zitounti_holders() to authenticated;

comment on function public.staff_zitounti_holders() is
  'Every person who holds at least one tree, with their counts — the index in front of staff_zitounti_file. Filtered row by row through app.can_see_person, so a commercial sees only their own files. Empty while no tree has been sold.';

-- ---------------------------------------------------------------------------
-- 6 · THE DAY A CLIENT CAN SIGN IN — the three things that change, and nothing else
-- ---------------------------------------------------------------------------
-- Left commented because none of it can be exercised today: no user carries the role 'client', no person
-- carries a profile_id, and a policy that can never match is a policy no test can prove. It is written out so
-- that the day the owner decides how a buyer signs in, the work is these three lines and not a redesign.
--
--   1. The link. persons.profile_id := the new auth user, written by the sign-up path the owner chooses, and
--      the role 'client' granted. src/lib/auth.ts must then stop stripping 'client' for that route only —
--      the Back Office keeps refusing it.
--
--   2. The self-read. One predicate, used by every client policy, so «this person is me» is written once:
--        create or replace function app.is_my_person(p_person uuid) returns boolean
--        language sql stable security definer set search_path = '' as $$
--          select exists (select 1 from public.persons p
--                          where p.id = p_person and p.profile_id = (select auth.uid()))
--        $$;
--        create policy trees_select_own on public.trees for select to authenticated
--          using (held_by is not null and app.is_my_person(held_by));
--      and the same `using` on reservations, visits, payments and interest_requests, added beside the staff
--      policies, never replacing them.
--
--   3. The entry point. public.my_zitounti_file() — no argument, so a client cannot ask for someone else's
--      file — resolving the person from auth.uid() and returning the SAME payload as staff_zitounti_file by
--      calling the same app.zitounti_* functions. The screen does not change; only who may open it does.
--
--      create or replace function public.my_zitounti_file() returns jsonb ... as $$
--        declare v_person uuid;
--        begin
--          if not app.module_open('zitounti') then raise exception 'module_closed' using errcode = 'P0001'; end if;
--          select p.id into v_person from public.persons p where p.profile_id = (select auth.uid());
--          if v_person is null then raise exception 'invalid_person' using errcode = 'P0001'; end if;
--          ...same jsonb_build_object as above...
--        end $$;
