-- bb · الزيارات الميدانية — the field visit becomes a record (report v3 §25, module flag `visits`).
--
-- WHAT THE SPEC ASKS FOR, WORD FOR WORD (§25). «الحريف ينجم يطلب زيارة الأرض. يختار: التاريخ · التوقيت المتوفر ·
-- عدد الأشخاص · وسيلة الاتصال. الـBack Office يشوف Calendar. Statuses: Requested · Confirmed · Completed ·
-- No show · Cancelled.» Every one of the four answers is stated, and none of them is marked as an example, so
-- the four are columns. The five statuses are named, so they are an enum — and their Arabic is a setting, see §2.
--
-- WHAT EXISTS TODAY AND WHY THIS FILE IS NEEDED. public.interest_requests.wants_visit — the «نحب نزور الأرض»
-- tick on the offer form — is the only trace a visit leaves in this product. On the day this was written 25 of
-- 36 live demands carry it, 3 of them naming an offer and 22 naming none, and not one screen in the Back Office
-- shows them: a visitor asks to see the land and the platform records the wish and does nothing with it. §11
-- below turns that wish into a worklist. The tick keeps its meaning — it is a wish on a demand, not a booking —
-- and the visit is the booking.
--
-- SIX DECISIONS, TAKEN HERE, SO THE NEXT READER DOES NOT RE-OPEN THEM.
--
--  1. A VISIT BELONGS TO AN OFFER (project_id not null). §25 says «زيارة الأرض», and a calendar entry that does
--     not say which land is a calendar entry nobody can drive to. 22 of the 25 wishes name no offer, and that is
--     exactly the commercial's job on the phone: pick the offer, then book. It is also what §45 does — Select,
--     then Book Visit. The wish on an offer-less demand stays a wish and shows in the waiting list with no
--     offer beside it.
--
--  2. BOTH HANDS BOOK. Report v3 §25 has the CLIENT choose; cahier v2 §29 has the COMMERCIAL press «Planifier
--     une visite» and add a meeting point, an assigned commercial and notes. v3 wins on conflict, but it is
--     silent about those three fields rather than against them, so they are staff-side columns here and are
--     never asked of a visitor. One table, two doors: public.submit_visit_request (§10, the client's, module
--     gated) and public.staff_book_visit (§7, the commercial's).
--
--  3. THE OUTCOME IS WRITTEN DOWN. v2 §30 records حضر/ما حضرش · عجبو/ما عجبوش · العرض المختار · Next Step. v3
--     names Completed and No show and says nothing about what is kept, which would make «Completed» a tick with
--     no information — and the visit's whole point in the sales flow is whether this person now reserves. The
--     attendance is the status itself; the other three are the outcome_* columns, written when the visit is
--     completed.
--
--  4. NOTHING IS AUTOMATIC. No expiry job, no status that moves itself, and above all no touching of
--     public.lead_statuses: §27's client pipeline is a field the team curates by hand, and a module that moved
--     it would take that away. A booked visit shows next to the status; it does not become it.
--
--  5. THE MODULE FLAG GOVERNS THE VISITOR, NOT THE STAFF. public.submit_visit_request refuses outright while
--     `visits` is disabled (visit_not_open). The staff RPCs are gated on app.is_staff() and app.can_see_person
--     only — exactly as public.staff_offer_stock and public.staff_allocate_trees are — because the Back Office
--     is where a module is prepared before it is published, and a flag that locked the staff out would lock the
--     owner out of the very screen the flag exists to get ready. src/app/admin/(panel)/layout.tsx:47-54 states
--     the same rule for the sidebar. The flag stays `disabled` after this file is applied; §13 only rewrites its
--     description, and turning it on is the owner's own act in /admin/settings/modules.
--
--  6. NO NUMBER, NO DELAY AND NO LABEL IS WRITTEN IN CODE. The available times are an option list, the ceiling
--     on عدد الأشخاص and the booking window are settings, the meeting point is a column on the offer, the five
--     Arabic status words are five settings, and the reminder days are a setting. Nothing below reads a literal
--     business value, and neither does the TypeScript: every figure it prints comes out of a payload built here.
--
-- APPLYING THIS FILE. It is a draft: it is not numbered and it must not be applied by an agent. Dry run with
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_21_visits.sql
-- When the owner applies it, rename it to supabase/migrations/00NN_visits.sql and its test to
-- supabase/tests/0NN_visits.sql with the number in the first line of each, then run `npm run db:types` — the
-- TypeScript of this module compiles against public.visits and the new RPCs.
--
-- IT DOES NOT TOUCH: public.trees, public.parcels, public.interest_requests, public.lead_statuses,
-- public.staff_allocate_trees or anything the reservation module owns. The only shared object it writes is
-- public.projects, one new nullable column (§3), and the feature_flags row for its own key.

-- ---------------------------------------------------------------------------
-- 1 · Today, in Tunis
-- ---------------------------------------------------------------------------

-- Every date in this product is read in Africa/Tunis (README). A visit is a date, not an instant, so the whole
-- module needs one answer to «what is today», computed once, in the database, and never in TypeScript.
create or replace function app.tunis_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone 'Africa/Tunis')::date
$$;
revoke execute on function app.tunis_today() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · The five statuses, and the Arabic of them
-- ---------------------------------------------------------------------------

-- An enum, because §25 fixes the five values by name and the code branches on them — the same reasoning that
-- made public.tree_state an enum. Their ARABIC is not fixed: it is five settings rows, read by
-- app.visit_status_label and returned with every payload, so the owner renames «ما حضرش» without a deployment
-- and no .tsx ever maps a code to a word. Do not «fix» this into a lead_statuses-style table: a row the owner
-- could delete is a value the code branches on.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'visit_status') then
    create type public.visit_status as enum ('requested', 'confirmed', 'completed', 'no_show', 'cancelled');
  end if;
end $$;

create or replace function app.visit_status_label(p_status public.visit_status) returns text
language sql stable security definer set search_path = '' as $$
  select app.setting_text('visits.status_' || p_status::text, p_status::text)
$$;
revoke execute on function app.visit_status_label(public.visit_status) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · What the owner sets: the window, the ceiling, the times, the meeting point
-- ---------------------------------------------------------------------------

-- The meeting point is per offer, because it is a place on that land — «قدّام جامع أولاد سالم» is not a global
-- default. Null inherits the setting, the same nullable-column-then-setting shape projects.min_trees_per_order
-- already uses (0054 §2).
alter table public.projects
  add column if not exists visit_meeting_point text;

comment on column public.projects.visit_meeting_point is
  'Where the team meets a visitor for a field visit on this offer (report v3 §25 / cahier v2 §29). Null inherits the setting visits.meeting_point_default. Staff-side: it is never asked of a visitor, and it is copied onto the visit when one is booked, so changing it later does not rewrite a meeting that was already agreed.';

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('visits.min_lead_days', to_jsonb(1), 'integer', 'visits',
   'أقرب موعد للزيارة (بالأيام)',
   'قدّاش يلزم من يوم بين اليوم والزيارة. 1 يعني «من غدوة». 0 يقبل زيارة نفس النهار. التقرير v3 البند 25 ما يحدّدش الرقم، فهو إعداد.', false, 10),
  ('visits.max_ahead_days', to_jsonb(60), 'integer', 'visits',
   'أبعد موعد للزيارة (بالأيام)',
   'قدّاش ينجم الحريف يبرمج في الأمام. فوق هذا العدد المنصة ترفض التاريخ وتقول للحريف يقرّبه.', false, 20),
  ('visits.max_people', to_jsonb(6), 'integer', 'visits',
   'أقصى عدد أشخاص في الزيارة',
   'عدد الأشخاص اللي ينجم الحريف يجيبهم معاه (البند 25: «عدد الأشخاص»). بدّل الرقم هنا، ما يتكتبش في الكود.', false, 30),
  ('visits.closed_weekdays', '[]'::jsonb, 'json', 'visits',
   'أيام ما فيهاش زيارات',
   'قائمة أرقام الأيام بصيغة ISO: 1 الاثنين … 7 الأحد. مثال: [7] يعني ما فماش زيارات نهار الأحد. القائمة فارغة تقبل كل الأيام.', false, 40),
  ('visits.meeting_point_default', to_jsonb(''::text), 'text', 'visits',
   'نقطة اللقاء الافتراضية',
   'تُستعمل في العروض اللي ما عندهاش نقطة لقاء خاصة بيها في بطاقة العرض. اتركها فارغة إذا كل عرض عندو نقطتو.', false, 50),
  ('visits.expiry_reminders_days', '[3, 1, 0]'::jsonb, 'json', 'visits',
   'أيام التذكير قبل الزيارة',
   'قداش يوم قبل الزيارة يتبعث التذكير (cahier v2 البند 33: 3 أيام · يوم · نهار الزيارة). القائمة تُقرأ من هنا، وما فماش عامل إرسال (worker) حتى الآن، فالرسائل تتحط في صفّ الانتظار برك.', false, 60),
  ('visits.status_requested',  to_jsonb('مطلوبة'::text),     'text', 'visits', 'اسم الحالة: Requested',  'الكلمة اللي تظهر للفريق في قائمة الزيارات وفي ملف الحريف.', false, 70),
  ('visits.status_confirmed',  to_jsonb('مؤكّدة'::text),     'text', 'visits', 'اسم الحالة: Confirmed',  'الزيارة تأكّدت مع الحريف: التاريخ والتوقيت ونقطة اللقاء معروفين.', false, 80),
  ('visits.status_completed',  to_jsonb('تمّت'::text),       'text', 'visits', 'اسم الحالة: Completed',  'الحريف حضر وشاف الأرض.', false, 90),
  ('visits.status_no_show',    to_jsonb('ما حضرش'::text),    'text', 'visits', 'اسم الحالة: No show',    'الموعد فات والحريف ما جاش.', false, 100),
  ('visits.status_cancelled',  to_jsonb('ملغاة'::text),      'text', 'visits', 'اسم الحالة: Cancelled',  'الزيارة تلغات قبل الموعد.', false, 110),
  ('visit_no.prefix', to_jsonb('AGZ-VIS'::text), 'text', 'visits',
   'بادئة رقم الزيارة',
   'رقم الزيارة يتكوّن هكذا: البادئة + السنة + رقم متسلسل، مثال AGZ-VIS-2026-00007.', false, 120),
  ('antispam.max_visits_per_ip_per_day', to_jsonb(3), 'integer', 'antispam',
   'أقصى عدد مطالب زيارة من نفس المصدر في اليوم',
   'حماية من الإرسال الآلي على فورمولير الزيارة العمومي.', false, 60)
on conflict (key) do nothing;

-- «التوقيت المتوفر» is the spec's own wording: AgriZed says which times are offerable, so it is a LIST and not a
-- free time input — a free one lets a visitor book 03:00. The list_key reuses option_lists exactly as the
-- contact_time list does, with the same time_from/time_to columns, so the Back Office edits it in القوائم with
-- no new screen.
insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('visit_slot', 'توقيت الزيارة المتوفر', 'time_range', 'الأوقات اللي ينجم فيها الحريف يزور الأرض. بتوقيت تونس.')
on conflict (key) do nothing;

insert into public.option_items (list_key, code, label_ar, label_fr, time_from, time_to, sort_order)
select v.list_key, v.code, v.label_ar, v.label_fr, v.time_from::time, v.time_to::time, v.sort_order
from (values
  ('visit_slot', 'morning',   'صباحاً (8:00 – 12:00)',       'Matin (8h – 12h)',        '08:00', '12:00', 10),
  ('visit_slot', 'afternoon', 'بعد الظهر (13:00 – 17:00)',   'Après-midi (13h – 17h)',  '13:00', '17:00', 20)
) as v (list_key, code, label_ar, label_fr, time_from, time_to, sort_order)
where not exists (select 1 from public.option_items o where o.list_key = 'visit_slot' and o.code = v.code);

-- ---------------------------------------------------------------------------
-- 4 · The record
-- ---------------------------------------------------------------------------

create table if not exists public.visits (
  id                 uuid primary key default gen_random_uuid(),
  visit_no           text not null unique,
  person_id          uuid not null references public.persons (id),
  -- Decision 1: a visit is a visit TO a piece of land.
  project_id         uuid not null references public.projects (id),
  -- The demand that asked for it, when there is one (interest_requests.wants_visit). Null for a visit agreed on
  -- the phone with no demand behind it.
  request_id         uuid references public.interest_requests (id),
  status             public.visit_status not null default 'requested',

  -- §25, the client's four answers. The labels are snapshots: renaming the slot later must not rewrite the
  -- appointment a client was given, exactly as interest_requests snapshots its option labels.
  visit_date         date not null,
  slot_option_id     uuid references public.option_items (id),
  slot_label_ar      text not null,
  slot_from          time,
  slot_to            time,
  people_count       integer not null check (people_count >= 1),
  contact_channel    public.contact_channel not null,
  client_note        text,

  -- cahier v2 §29, the Back Office's own fields. Never asked of a visitor.
  meeting_point      text,
  assigned_to        uuid references public.profiles (id),
  staff_note         text,

  -- cahier v2 §30, written when the visit is completed. Attendance is the status itself.
  outcome_liked      boolean,
  outcome_project_id uuid references public.projects (id),
  outcome_next_step  text,
  outcome_note       text,
  cancel_reason      text,

  -- Who opened it: the public form or the Back Office.
  source             text not null default 'staff' check (source in ('staff', 'client')),
  status_changed_at  timestamptz not null default now(),
  status_changed_by  uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  created_by         uuid references public.profiles (id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id)
);

-- The outcome belongs to a visit that happened. Kept as a constraint and not only as an RPC rule, because a
-- «ما حضرش» row carrying «عجبو المشروع» is a contradiction no screen could explain.
alter table public.visits drop constraint if exists visits_outcome_check;
alter table public.visits
  add constraint visits_outcome_check check (
    status = 'completed'
    or (outcome_liked is null and outcome_project_id is null and outcome_next_step is null));

create index if not exists visits_date_idx     on public.visits (visit_date, slot_from);
create index if not exists visits_person_idx   on public.visits (person_id, visit_date desc);
create index if not exists visits_project_idx  on public.visits (project_id, visit_date desc);
create index if not exists visits_status_idx   on public.visits (status, visit_date);
create index if not exists visits_request_idx  on public.visits (request_id);

drop trigger if exists visits_stamp on public.visits;
create trigger visits_stamp before update on public.visits
  for each row execute function app.stamp_updated();

-- ONE audit story, written by the generic row trigger rather than by each RPC: it keeps the old row and the new
-- row side by side, and it picks up the reason each RPC stashes with app.set_reason. audit_logs is append-only,
-- so a visit's whole life is readable in /admin/audit without any RPC writing a second, partial row.
drop trigger if exists visits_audit on public.visits;
create trigger visits_audit after insert or update or delete on public.visits
  for each row execute function app.audit_row_change();

alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;
grant select on public.visits to authenticated;

-- A commercial reads the visits of their own files and no others — the same line app.can_see_person draws
-- everywhere else in the CRM. Every write goes through the security-definer RPCs below; nothing is granted here.
drop policy if exists visits_select on public.visits;
create policy visits_select on public.visits for select to authenticated
  using (app.is_staff() and app.can_see_person(person_id));

comment on table public.visits is
  'A field visit to an offer (report v3 §25): what the client chose — date, available slot, number of people, contact channel — what the Back Office added (meeting point, assigned commercial, notes) and, once completed, what came out of it (cahier v2 §30). Five statuses, fixed by §25. It never moves public.lead_statuses and never touches the tree inventory.';

-- ---------------------------------------------------------------------------
-- 5 · The rules, resolved in one place
-- ---------------------------------------------------------------------------

-- Everything a booking form must obey and everything it must offer, as one payload: the window (computed from
-- today in Tunis and the two settings), the ceiling, the closed weekdays, the available slots, and the meeting
-- point this offer uses. The screens read these figures; they never work one out.
create or replace function app.visit_terms(p_project uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'today',          app.tunis_today(),
    'min_date',       app.tunis_today() + app.setting_int('visits.min_lead_days', 1),
    'max_date',       app.tunis_today() + app.setting_int('visits.max_ahead_days', 60),
    'max_people',     greatest(app.setting_int('visits.max_people', 6), 1),
    'closed_weekdays', coalesce(app.setting('visits.closed_weekdays'), '[]'::jsonb),
    'meeting_point',  nullif(coalesce((select pj.visit_meeting_point from public.projects pj where pj.id = p_project),
                                      app.setting_text('visits.meeting_point_default', '')), ''),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'code', o.code, 'label_ar', o.label_ar,
               'time_from', o.time_from, 'time_to', o.time_to)
             order by o.sort_order, o.label_ar)
      from public.option_items o
      where o.list_key = 'visit_slot' and o.is_active), '[]'::jsonb))
$$;
revoke execute on function app.visit_terms(uuid) from public, anon, authenticated;

-- The one gate every booking passes, wherever it came from. It returns the slot it validated so the caller can
-- snapshot its label and its hours; it raises a code src/lib has an Arabic sentence for otherwise.
create or replace function app.assert_visit_booking(p_date date, p_slot uuid, p_people integer)
returns public.option_items
language plpgsql stable security definer set search_path = '' as $$
declare
  v_terms  jsonb := app.visit_terms(null);
  v_slot   public.option_items;
  v_closed integer[];
begin
  if p_date is null then
    raise exception 'visit_date_required' using errcode = 'P0001';
  end if;
  if p_date < (v_terms->>'today')::date then
    raise exception 'visit_date_in_past' using errcode = 'P0001';
  end if;
  if p_date < (v_terms->>'min_date')::date then
    raise exception 'visit_date_too_soon' using errcode = 'P0001';
  end if;
  if p_date > (v_terms->>'max_date')::date then
    raise exception 'visit_date_too_far' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(x::integer), '{}') into v_closed
  from jsonb_array_elements_text(v_terms->'closed_weekdays') x;
  if extract(isodow from p_date)::integer = any (v_closed) then
    raise exception 'visit_day_closed' using errcode = 'P0001';
  end if;

  v_slot := app.active_option('visit_slot', p_slot::text);
  if v_slot.id is null then
    raise exception 'invalid_visit_slot' using errcode = 'P0001';
  end if;

  if p_people is null or p_people < 1 or p_people > (v_terms->>'max_people')::integer then
    raise exception 'invalid_visit_people' using errcode = 'P0001';
  end if;

  return v_slot;
end $$;
revoke execute on function app.assert_visit_booking(date, uuid, integer) from public, anon, authenticated;

-- The five statuses as the screens offer them, labels included, so a <select> is never written in Arabic in a
-- .tsx file.
create or replace function app.visit_status_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_agg(jsonb_build_object('code', s, 'label', app.visit_status_label(s::public.visit_status))
                   order by o)
  from (values ('requested', 1), ('confirmed', 2), ('completed', 3), ('no_show', 4), ('cancelled', 5)) as t (s, o)
$$;
revoke execute on function app.visit_status_list() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6 · One visit, as a screen needs it
-- ---------------------------------------------------------------------------

-- Everything the staff needs before driving: who, which phone, which offer, where the land is (the offer's own
-- coordinates, so the screen can hand the driver a map link), and how many people are coming.
create or replace function app.visit_payload(p_visit uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', v.id,
    'visit_no', v.visit_no,
    'status', v.status::text,
    'status_label', app.visit_status_label(v.status),
    'visit_date', v.visit_date,
    'slot_label', v.slot_label_ar,
    'slot_from', v.slot_from,
    'slot_to', v.slot_to,
    'people_count', v.people_count,
    'contact_channel', v.contact_channel::text,
    'client_note', v.client_note,
    'meeting_point', v.meeting_point,
    'staff_note', v.staff_note,
    'source', v.source,
    'created_at', v.created_at,
    'status_changed_at', v.status_changed_at,
    'cancel_reason', v.cancel_reason,
    'person', jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'phone_e164', p.phone_e164, 'whatsapp_e164', p.whatsapp_e164),
    'offer', jsonb_build_object(
      'id', pj.id, 'code', pj.code, 'name', pj.name,
      'latitude', pj.latitude, 'longitude', pj.longitude,
      'location_description', pj.location_description,
      'governorate', g.name_ar, 'delegation', d.name_ar),
    'assigned', case when pr.id is null then null
                     else jsonb_build_object('id', pr.id, 'full_name', pr.full_name) end,
    'request', case when r.id is null then null
                    else jsonb_build_object('id', r.id, 'request_no', r.request_no) end,
    'outcome', case when v.status <> 'completed' then null
                    else jsonb_build_object(
                      'liked', v.outcome_liked,
                      'project_id', v.outcome_project_id,
                      'project_code', op.code,
                      'project_name', op.name,
                      'next_step', v.outcome_next_step,
                      'note', v.outcome_note) end)
  from public.visits v
  join public.persons p on p.id = v.person_id
  join public.projects pj on pj.id = v.project_id
  left join public.governorates g on g.id = pj.governorate_id
  left join public.delegations d on d.id = pj.delegation_id
  left join public.profiles pr on pr.id = v.assigned_to
  left join public.interest_requests r on r.id = v.request_id
  left join public.projects op on op.id = v.outcome_project_id
  where v.id = p_visit
$$;
revoke execute on function app.visit_payload(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7 · Booking, from the Back Office
-- ---------------------------------------------------------------------------


create or replace function public.staff_book_visit(p jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_person   uuid := nullif(p->>'person_id', '')::uuid;
  v_project  uuid := nullif(p->>'project_id', '')::uuid;
  v_request  uuid := nullif(p->>'request_id', '')::uuid;
  v_status   public.visit_status;
  v_slot     public.option_items;
  v_people   integer := nullif(p->>'people_count', '')::integer;
  v_date     date := nullif(p->>'visit_date', '')::date;
  v_channel  public.contact_channel;
  v_year     text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_no       text;
  v_pj       public.projects;
  v_id       uuid;
begin
  -- The CRM line, unchanged: Admin, Finance and Legal on any file, a commercial on their own (COM-05).
  if not (app.is_staff() and app.can_see_person(v_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_pj from public.projects pj where pj.id = v_project;
  if not found then
    raise exception 'invalid_visit_project' using errcode = 'P0001';
  end if;

  -- A demand may be named, and when it is it must be this person's, and about this offer when it names one.
  if v_request is not null and not exists (
    select 1 from public.interest_requests r
    where r.id = v_request and r.person_id = v_person
      and (r.project_id is null or r.project_id = v_project)) then
    raise exception 'invalid_visit_request' using errcode = 'P0001';
  end if;

  begin
    v_status := coalesce(nullif(btrim(coalesce(p->>'status', '')), ''), 'requested')::public.visit_status;
  exception when invalid_text_representation then
    raise exception 'invalid_visit_status' using errcode = 'P0001';
  end;
  -- A visit is opened, not concluded: only the two live statuses may be the first one.
  if v_status not in ('requested', 'confirmed') then
    raise exception 'invalid_visit_status' using errcode = 'P0001';
  end if;

  begin
    v_channel := coalesce(nullif(btrim(coalesce(p->>'contact_channel', '')), ''), 'phone')::public.contact_channel;
  exception when invalid_text_representation then
    raise exception 'contact_channel_required' using errcode = 'P0001';
  end;

  v_slot := app.assert_visit_booking(v_date, nullif(p->>'slot_option_id', '')::uuid, v_people);
  perform app.set_reason(p_reason);

  v_no := app.setting_text('visit_no.prefix', 'AGZ-VIS') || '-' || v_year || '-'
          || lpad(app.next_number('visit:' || v_year)::text, 5, '0');

  insert into public.visits (
    visit_no, person_id, project_id, request_id, status,
    visit_date, slot_option_id, slot_label_ar, slot_from, slot_to,
    people_count, contact_channel, client_note,
    meeting_point, assigned_to, staff_note,
    source, status_changed_by, created_by, updated_by
  ) values (
    v_no, v_person, v_project, v_request, v_status,
    v_date, v_slot.id, v_slot.label_ar, v_slot.time_from, v_slot.time_to,
    v_people, v_channel, nullif(btrim(coalesce(p->>'client_note', '')), ''),
    -- The meeting point is copied from the offer at booking time, so editing the offer later never rewrites a
    -- meeting that was already agreed; the caller may override it outright.
    coalesce(nullif(btrim(coalesce(p->>'meeting_point', '')), ''),
             nullif(v_pj.visit_meeting_point, ''),
             nullif(app.setting_text('visits.meeting_point_default', ''), '')),
    nullif(p->>'assigned_to', '')::uuid,
    nullif(btrim(coalesce(p->>'staff_note', '')), ''),
    'staff', auth.uid(), auth.uid(), auth.uid()
  ) returning id into v_id;

  if v_status = 'confirmed' then
    perform app.visit_notify(v_id, 'visit.confirmed');
  end if;

  return app.visit_payload(v_id);
end $$;

revoke execute on function public.staff_book_visit(jsonb, text) from public, anon;
grant execute on function public.staff_book_visit(jsonb, text) to authenticated;

comment on function public.staff_book_visit(jsonb, text) is
  'Books a field visit for a client on one offer (report v3 §25): date, available slot, number of people, contact channel, plus the Back Office fields (meeting point, assigned commercial, note). Staff, limited to files they may see (app.can_see_person). Opens at ''requested'' or ''confirmed'' and no other status. Raises visit_date_in_past, visit_date_too_soon, visit_date_too_far, visit_day_closed, invalid_visit_slot, invalid_visit_people, invalid_visit_project, invalid_visit_request.';

-- ---------------------------------------------------------------------------
-- 8 · Moving a visit along
-- ---------------------------------------------------------------------------

-- The transitions §25 implies, written once. Requested and Confirmed are live; the other three are where a visit
-- ends. A visit that ended is not re-opened — it is a fact about a day that has passed — and the next
-- appointment is a new row, which is also what keeps «ما حضرش» from being quietly erased.
--
-- «ما حضرش» is reachable from Confirmed only, on purpose: a visit nobody confirmed is an appointment that was
-- never agreed, so the honest end for it is «ملغاة», not a no-show pinned on the client.
create or replace function app.visit_transition_allowed(p_from public.visit_status, p_to public.visit_status)
returns boolean
language sql immutable set search_path = '' as $$
  select case p_from
           when 'requested' then p_to in ('confirmed', 'cancelled')
           when 'confirmed' then p_to in ('completed', 'no_show', 'cancelled')
           else false
         end
$$;
revoke execute on function app.visit_transition_allowed(public.visit_status, public.visit_status)
  from public, anon, authenticated;

create or replace function public.staff_set_visit_status(
  p_visit uuid, p_status text, p jsonb default '{}'::jsonb, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_visit  public.visits;
  v_to     public.visit_status;
  v_chosen uuid := nullif(p->>'outcome_project_id', '')::uuid;
begin
  select * into v_visit from public.visits v where v.id = p_visit;
  if not found then
    raise exception 'visit_not_found' using errcode = 'P0001';
  end if;
  if not (app.is_staff() and app.can_see_person(v_visit.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    v_to := nullif(btrim(coalesce(p_status, '')), '')::public.visit_status;
  exception when invalid_text_representation then
    raise exception 'invalid_visit_status' using errcode = 'P0001';
  end;
  if v_to is null then
    raise exception 'invalid_visit_status' using errcode = 'P0001';
  end if;
  if not app.visit_transition_allowed(v_visit.status, v_to) then
    raise exception 'invalid_visit_transition' using errcode = 'P0001';
  end if;

  -- The offer the client chose during the visit must be a real one; it is the bridge to the reservation.
  if v_chosen is not null and not exists (select 1 from public.projects pj where pj.id = v_chosen) then
    raise exception 'invalid_visit_project' using errcode = 'P0001';
  end if;

  perform app.set_reason(p_reason);

  update public.visits v
  set status = v_to,
      status_changed_at = now(),
      status_changed_by = auth.uid(),
      meeting_point = case when v_to = 'confirmed'
                           then coalesce(nullif(btrim(coalesce(p->>'meeting_point', '')), ''), v.meeting_point)
                           else v.meeting_point end,
      assigned_to = case when v_to = 'confirmed'
                         then coalesce(nullif(p->>'assigned_to', '')::uuid, v.assigned_to)
                         else v.assigned_to end,
      -- cahier v2 §30: what came out of the visit, kept only on the visit that happened.
      outcome_liked = case when v_to = 'completed' then nullif(p->>'outcome_liked', '')::boolean end,
      outcome_project_id = case when v_to = 'completed' then v_chosen end,
      outcome_next_step = case when v_to = 'completed'
                               then nullif(btrim(coalesce(p->>'outcome_next_step', '')), '') end,
      outcome_note = case when v_to = 'completed'
                          then nullif(btrim(coalesce(p->>'outcome_note', '')), '')
                          else v.outcome_note end,
      cancel_reason = case when v_to = 'cancelled'
                           then nullif(btrim(coalesce(p->>'cancel_reason', '')), '')
                           else v.cancel_reason end,
      staff_note = coalesce(nullif(btrim(coalesce(p->>'staff_note', '')), ''), v.staff_note)
  where v.id = p_visit;

  if v_to = 'confirmed' then
    perform app.visit_notify(p_visit, 'visit.confirmed');
  end if;

  return app.visit_payload(p_visit);
end $$;

revoke execute on function public.staff_set_visit_status(uuid, text, jsonb, text) from public, anon;
grant execute on function public.staff_set_visit_status(uuid, text, jsonb, text) to authenticated;

comment on function public.staff_set_visit_status(uuid, text, jsonb, text) is
  'Moves a visit between the five statuses of report v3 §25. requested → confirmed · cancelled · no_show; confirmed → completed · no_show · cancelled; the last three are final (a new appointment is a new row). ''completed'' carries the outcome of cahier v2 §30 — عجبو/ما عجبوش, the offer chosen, the next step. Staff, limited to files they may see.';

-- Rescheduling and the staff-side fields, while the visit is still live.
create or replace function public.staff_update_visit(p_visit uuid, p jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_visit public.visits;
  v_slot  public.option_items;
  v_date  date;
  v_people integer;
begin
  select * into v_visit from public.visits v where v.id = p_visit;
  if not found then
    raise exception 'visit_not_found' using errcode = 'P0001';
  end if;
  if not (app.is_staff() and app.can_see_person(v_visit.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- A visit that already ended is a record of a day, not a plan.
  if v_visit.status not in ('requested', 'confirmed') then
    raise exception 'visit_not_open' using errcode = 'P0001';
  end if;

  v_date   := coalesce(nullif(p->>'visit_date', '')::date, v_visit.visit_date);
  v_people := coalesce(nullif(p->>'people_count', '')::integer, v_visit.people_count);
  v_slot   := app.assert_visit_booking(
                v_date, coalesce(nullif(p->>'slot_option_id', '')::uuid, v_visit.slot_option_id), v_people);

  perform app.set_reason(p_reason);

  update public.visits v
  set visit_date = v_date,
      slot_option_id = v_slot.id,
      slot_label_ar = v_slot.label_ar,
      slot_from = v_slot.time_from,
      slot_to = v_slot.time_to,
      people_count = v_people,
      contact_channel = coalesce(nullif(btrim(coalesce(p->>'contact_channel', '')), '')::public.contact_channel,
                                 v.contact_channel),
      meeting_point = coalesce(nullif(btrim(coalesce(p->>'meeting_point', '')), ''), v.meeting_point),
      assigned_to = coalesce(nullif(p->>'assigned_to', '')::uuid, v.assigned_to),
      staff_note = coalesce(nullif(btrim(coalesce(p->>'staff_note', '')), ''), v.staff_note),
      client_note = coalesce(nullif(btrim(coalesce(p->>'client_note', '')), ''), v.client_note)
  where v.id = p_visit;

  return app.visit_payload(p_visit);
end $$;

revoke execute on function public.staff_update_visit(uuid, jsonb, text) from public, anon;
grant execute on function public.staff_update_visit(uuid, jsonb, text) to authenticated;

comment on function public.staff_update_visit(uuid, jsonb, text) is
  'Reschedules a live visit and edits its Back Office fields (meeting point, assigned commercial, notes). Refuses on a completed, cancelled or no-show visit (visit_not_open): those are records of a day that passed, and the next appointment is a new row. Re-checks the whole booking window, so a reschedule cannot land where a booking could not.';

-- ---------------------------------------------------------------------------
-- 9 · The board the Back Office reads
-- ---------------------------------------------------------------------------

-- A DAY-GROUPED LIST, NOT A MONTH GRID, and this is the decision the task asked to be justified in a comment.
-- §25 says «الـBack Office يشوف Calendar», which names the job and not the shape. A month grid spends the whole
-- screen on empty squares for a product that will hold a handful of visits a week, it cannot show the phone
-- number, the offer and the meeting point without a second click, and at 375px — where a commercial actually
-- reads this, standing next to a car — 35 cells become unreadable. The question a visit calendar answers is
-- «شكون نشوف، وقتاش، ووين»; a list grouped by day, in slot order, with the phone and the map link on the row,
-- answers it in one screen at every width. The month grid is not built, and must not be added as a second view:
-- two calendars disagreeing is worse than one that is plain.
--
-- Everything the screen prints is computed here: the grouping, the counts, the labels, the waiting list. The
-- page maps rows to elements and nothing else.
create or replace function public.staff_visit_board(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_from    date := coalesce(nullif(p->>'from', '')::date, app.tunis_today());
  v_to      date := coalesce(nullif(p->>'to', '')::date, app.tunis_today() + app.setting_int('visits.max_ahead_days', 60));
  v_status  public.visit_status;
  v_project uuid := nullif(p->>'project_id', '')::uuid;
  v_owner   uuid := nullif(p->>'assigned_to', '')::uuid;
  v_limit   integer := least(greatest(coalesce(nullif(p->>'limit', '')::integer, 200), 1), 500);
  v_rows    jsonb;
  v_days    jsonb;
  v_counts  jsonb;
  v_wait    jsonb;
  v_wait_n  integer;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p->>'status', '')), '') is not null then
    begin
      v_status := (p->>'status')::public.visit_status;
    exception when invalid_text_representation then
      raise exception 'invalid_visit_status' using errcode = 'P0001';
    end;
  end if;

  -- app.can_see_person is applied row by row, so a commercial's board holds their own files and no others.
  with visible as (
    select v.id, v.visit_date, v.slot_from, v.status
    from public.visits v
    where app.can_see_person(v.person_id)
      and v.visit_date between v_from and v_to
      and (v_status is null or v.status = v_status)
      and (v_project is null or v.project_id = v_project)
      and (v_owner is null or v.assigned_to = v_owner)
    order by v.visit_date, v.slot_from nulls last, v.id
    limit v_limit
  )
  select
    coalesce(jsonb_agg(app.visit_payload(x.id) order by x.visit_date, x.slot_from nulls last), '[]'::jsonb),
    jsonb_build_object(
      'total',     count(*),
      'requested', count(*) filter (where x.status = 'requested'),
      'confirmed', count(*) filter (where x.status = 'confirmed'),
      'completed', count(*) filter (where x.status = 'completed'),
      'no_show',   count(*) filter (where x.status = 'no_show'),
      'cancelled', count(*) filter (where x.status = 'cancelled'),
      'today',     count(*) filter (where x.visit_date = app.tunis_today()))
  into v_rows, v_counts
  from visible x;

  -- Grouped by day, in the order the day arrives, so the page never groups anything itself.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', d.day,
           'visits', (select jsonb_agg(r order by (r->>'slot_from') nulls last, r->>'visit_no')
                      from jsonb_array_elements(v_rows) r
                      where (r->>'visit_date')::date = d.day))
         order by d.day), '[]'::jsonb)
  into v_days
  from (select distinct (r->>'visit_date')::date as day from jsonb_array_elements(v_rows) r) d;

  select coalesce(jsonb_agg(w order by w->>'created_at' desc), '[]'::jsonb), count(*)::integer
  into v_wait, v_wait_n
  from (
    select jsonb_build_object(
             'request_id', r.id,
             'request_no', r.request_no,
             'created_at', r.created_at,
             'request_kind', r.request_kind,
             'person_id', r.person_id,
             'person_name', pe.full_name,
             'phone_e164', pe.phone_e164,
             'contact_channel', r.contact_channel::text,
             'contact_time', r.contact_time_label_ar,
             'trees', coalesce(r.offer_trees, r.tree_count_min),
             'project_id', r.project_id,
             'project_code', r.project_code,
             'project_name', r.project_name) as w,
           r.created_at
    from public.interest_requests r
    join public.persons pe on pe.id = r.person_id
    where coalesce(r.wants_visit, false)
      and app.can_see_person(r.person_id)
      -- Served means: this person already has a live or completed visit on the offer they named, or — when the
      -- demand names no offer, which is 22 of the 25 live wishes — any live or completed visit at all.
      and not exists (
        select 1 from public.visits v
        where v.person_id = r.person_id
          and v.status in ('requested', 'confirmed', 'completed')
          and (r.project_id is null or v.project_id = r.project_id))
    order by r.created_at desc
    limit v_limit
  ) q;

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'today', app.tunis_today()),
    'terms', app.visit_terms(v_project),
    'statuses', app.visit_status_list(),
    'counts', v_counts,
    'days', v_days,
    'waiting', v_wait,
    'waiting_total', v_wait_n);
end $$;

revoke execute on function public.staff_visit_board(jsonb) from public, anon;
grant execute on function public.staff_visit_board(jsonb) to authenticated;

comment on function public.staff_visit_board(jsonb) is
  'The Back Office calendar of report v3 §25, as a day-grouped list: every visit the reader may see between two dates, with the client, the phone, the offer, its coordinates and the meeting point, plus the counts per status — and the demands that ticked «نحب نزور الأرض» and still have no visit (the open loop this module closes). Filters: from, to, status, project_id, assigned_to, limit.';

-- One client's visits, for their file, plus the offers a visit can be booked on: the ones they asked about and
-- the ones they already hold trees in.
create or replace function public.staff_person_visits(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_visits jsonb;
  v_offers jsonb;
  v_wish   jsonb;
begin
  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(app.visit_payload(v.id) order by v.visit_date desc, v.created_at desc), '[]'::jsonb)
  into v_visits
  from public.visits v
  where v.person_id = p_person;

  select coalesce(jsonb_agg(jsonb_build_object(
           'project_id', o.id, 'code', o.code, 'name', o.name,
           'meeting_point', nullif(coalesce(o.visit_meeting_point,
                                            app.setting_text('visits.meeting_point_default', '')), ''),
           'request_id', o.request_id, 'request_no', o.request_no)
         order by o.name), '[]'::jsonb)
  into v_offers
  from (
    select distinct on (pj.id) pj.id, pj.code, pj.name, pj.visit_meeting_point, r.id as request_id, r.request_no
    from public.projects pj
    left join public.interest_requests r
      on r.project_id = pj.id and r.person_id = p_person
    where r.id is not null
       or exists (select 1 from public.trees t where t.project_id = pj.id and t.held_by = p_person)
    order by pj.id, r.created_at desc
  ) o;

  -- The wish, as it stands on this person's demands: the reason the card exists at all.
  select coalesce(jsonb_agg(jsonb_build_object(
           'request_id', r.id, 'request_no', r.request_no, 'created_at', r.created_at,
           'project_id', r.project_id, 'project_code', r.project_code, 'project_name', r.project_name)
         order by r.created_at desc), '[]'::jsonb)
  into v_wish
  from public.interest_requests r
  where r.person_id = p_person
    and coalesce(r.wants_visit, false)
    and not exists (
      select 1 from public.visits v
      where v.person_id = r.person_id
        and v.status in ('requested', 'confirmed', 'completed')
        and (r.project_id is null or v.project_id = r.project_id));

  return jsonb_build_object(
    'visits', v_visits,
    'offers', v_offers,
    'waiting', v_wish,
    'terms', app.visit_terms(null),
    'statuses', app.visit_status_list());
end $$;

revoke execute on function public.staff_person_visits(uuid) from public, anon;
grant execute on function public.staff_person_visits(uuid) to authenticated;

comment on function public.staff_person_visits(uuid) is
  'Everything the client file needs about visits: this person''s visits newest first, the offers a visit can be booked on (the ones they asked about and the ones they hold trees in), the visit wishes still unanswered, the booking rules and the five status labels. Staff, limited to files they may see.';

-- ---------------------------------------------------------------------------
-- 10 · The client's own door (§25), closed while the module is
-- ---------------------------------------------------------------------------

-- The one function in this file the module flag governs, because it is the only one a VISITOR reaches. It is
-- called by the Next.js server with the service-role key, exactly as public.submit_offer_request is, and it
-- refuses outright while `visits` is disabled — so applying this file publishes nothing.
--
-- It takes the demand the visitor has just submitted (interest_requests), because that is where the identity,
-- the consent and the offer already are; this module does not create people and does not re-implement the
-- intake. A demand that names no offer cannot become a visit on its own (decision 1): the commercial picks the
-- land, and the wish waits in the board until they do.
create or replace function public.submit_visit_request(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.interest_requests;
  v_slot    public.option_items;
  v_people  integer := nullif(p->>'people_count', '')::integer;
  v_date    date := nullif(p->>'visit_date', '')::date;
  v_channel public.contact_channel;
  v_year    text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_no      text;
  v_id      uuid;
begin
  if not app.module_open('visits') then
    raise exception 'visits_disabled' using errcode = 'P0001';
  end if;

  select * into v_request from public.interest_requests r where r.id = nullif(p->>'request_id', '')::uuid;
  if not found then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if v_request.project_id is null then
    raise exception 'visit_offer_required' using errcode = 'P0001';
  end if;

  perform app.check_throttle('visit:ip', nullif(p->>'ip_hash', ''), interval '1 day',
                             app.setting_int('antispam.max_visits_per_ip_per_day', 3));

  begin
    v_channel := coalesce(nullif(btrim(coalesce(p->>'contact_channel', '')), ''),
                          v_request.contact_channel::text)::public.contact_channel;
  exception when invalid_text_representation then
    raise exception 'contact_channel_required' using errcode = 'P0001';
  end;

  v_slot := app.assert_visit_booking(v_date, nullif(p->>'slot_option_id', '')::uuid, v_people);

  v_no := app.setting_text('visit_no.prefix', 'AGZ-VIS') || '-' || v_year || '-'
          || lpad(app.next_number('visit:' || v_year)::text, 5, '0');

  insert into public.visits (
    visit_no, person_id, project_id, request_id, status,
    visit_date, slot_option_id, slot_label_ar, slot_from, slot_to,
    people_count, contact_channel, client_note, meeting_point, source
  ) values (
    v_no, v_request.person_id, v_request.project_id, v_request.id, 'requested',
    v_date, v_slot.id, v_slot.label_ar, v_slot.time_from, v_slot.time_to,
    v_people, v_channel, nullif(btrim(coalesce(p->>'note', '')), ''),
    -- Copied, never shown to the visitor before the team confirms: a meeting point is agreed, not announced.
    (select nullif(coalesce(pj.visit_meeting_point,
                            app.setting_text('visits.meeting_point_default', '')), '')
     from public.projects pj where pj.id = v_request.project_id),
    'client'
  ) returning id into v_id;

  -- What the visitor is told back: their number and what they asked for. Never the meeting point, never who
  -- will meet them — the visit is «مطلوبة» until the Back Office confirms it.
  return jsonb_build_object(
    'visit_no', v_no, 'visit_date', v_date, 'slot_label', v_slot.label_ar, 'status', 'requested');
end $$;

revoke execute on function public.submit_visit_request(jsonb) from public, anon, authenticated;
grant execute on function public.submit_visit_request(jsonb) to service_role;

comment on function public.submit_visit_request(jsonb) is
  'The visitor''s half of report v3 §25: from a demand they just submitted on an offer, the date, the available slot, the number of people and the contact channel. Refuses while the `visits` module is disabled (visits_disabled) and on a demand with no offer (visit_offer_required). Service role only, like every public intake. The visit opens at ''requested''; the meeting point is copied but not returned.';

-- ---------------------------------------------------------------------------
-- 11 · Telling the client — queued, not sent
-- ---------------------------------------------------------------------------

-- §32 lists «موعد الزيارة» among the notification moments. The queue exists (public.notification_outbox) and the
-- templates are rows, so the copy stays editable — but THERE IS NO SENDING WORKER in this product yet and 12 SMS
-- are already waiting in it. So this enqueues and says so; no screen in this module claims a client was told.
-- The reminder template is seeded with it, unused: app.enqueue_message writes scheduled_at = now(), so a
-- «3 days before» reminder needs either an overload carrying scheduled_at or the worker itself. Both are out of
-- this module's files — see the handover.
create or replace function app.visit_notify(p_visit uuid, p_template text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.visits;
  p public.persons;
  j public.projects;
begin
  select * into v from public.visits x where x.id = p_visit;
  if not found then return; end if;
  select * into p from public.persons x where x.id = v.person_id;
  select * into j from public.projects x where x.id = v.project_id;

  perform app.enqueue_message(
    p_template, p.phone_e164,
    jsonb_build_object(
      'name', split_part(coalesce(p.full_name, ''), ' ', 1),
      'visit_no', v.visit_no,
      'date', to_char(v.visit_date, 'DD/MM/YYYY'),
      'slot', coalesce(v.slot_label_ar, ''),
      'offer', coalesce(j.name, ''),
      'meeting_point', coalesce(v.meeting_point, '')),
    'visits', v.id);
end $$;
revoke execute on function app.visit_notify(uuid, text) from public, anon, authenticated;

insert into public.message_templates (key, channel, body_ar, description_ar, variables, is_active) values
  ('visit.confirmed', 'sms',
   'أهلا {name}، زيارتك لـ{offer} تأكّدت: {date} {slot}. نقطة اللقاء: {meeting_point}. رقم الزيارة {visit_no}. AgriZed',
   'تتبعث كي الفريق يأكّد زيارة ميدانية (التقرير v3 البند 25).',
   array['name', 'offer', 'date', 'slot', 'meeting_point', 'visit_no'], true),
  ('visit.reminder', 'sms',
   'تذكير: زيارتك لـ{offer} يوم {date} {slot}. نقطة اللقاء: {meeting_point}. AgriZed',
   'تذكير قبل الزيارة (cahier v2 البند 33). ما تتبعثش لتوّ: ما فماش عامل إرسال ولا جدولة scheduled_at.',
   array['name', 'offer', 'date', 'slot', 'meeting_point'], true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 12 · What the module row says about itself
-- ---------------------------------------------------------------------------

-- The row still cited «البند 12» of the first cahier. The build follows report v3, where the field visit is §25,
-- and the sentence now describes what exists. THE STATE IS NOT TOUCHED: it stays 'disabled' until the owner
-- turns it on himself in /admin/settings/modules.
update public.feature_flags
set description_ar =
      'طلب زيارة الأرض وتنظيمها (التقرير v3 البند 25): الحريف يختار التاريخ والتوقيت المتوفر وعدد الأشخاص ووسيلة الاتصال، '
      || 'والفريق يشوف الزيارات مجمّعة بالنهار مع الهاتف والعرض ونقطة اللقاء، ويأكّدها ويسجّل نتيجتها. '
      || 'هذا الإعداد يهمّ الزوّار برك: كي يكون «معطّل» ما ينجمش زائر يطلب زيارة من الموقع، أمّا الفريق يبرمج الزيارات في الـBack Office عادي.'
where key = 'visits';
