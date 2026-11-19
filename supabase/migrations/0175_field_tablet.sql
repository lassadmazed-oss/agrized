-- 0175 · «الميدان» — the field commercial's tablet: his people, the appointment, the visit, the result.
--
-- Its test is supabase/tests/120_field_tablet.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0175_field_tablet.sql supabase/tests/120_field_tablet.sql
--
-- THE OWNER, 2026-11-18: «احنا الادمين نقولوا له راهو انت عندك 10 من الناس مش يشوفوا، ونحدد شكون هو
-- الكوميرسيال اللي مش يمشي … هو يبدا عنده ليستا، يكلمهم يعمل لهم RDV، يمشي معاهم يوريهم ويرجع لنا. اللي خذا
-- يقول خذا، اللي ما خذاش يقول ما خذاش، واللي ما عجبوش يقول ما عجبوش، واللي دفع عربون يقول دفع عربون، ويكتب
-- قداش دفع عربون ويعطيه توصيل.» And on the amount: «50 دينار، ولا 100 دينار ولا 1000 دينار، مش مشكلة».
--
-- WHAT EXISTS AND IS REUSED, NOT COPIED. A visit is public.visits (0064); a hold is public.reservations and
-- its trees (0063, 0101); money is public.payments. persons.assigned_to already decides who may work a file
-- (app.can_edit_person) and public.admin_assign_persons already moves files with a trail. Nothing here is a
-- second visits engine: every act below writes those same tables, so the Back Office calendar, «زياراتي»,
-- the reservations desk and the client's file all see what the tablet did, the moment it did it.
--
-- WHAT IS NEW, in four pieces:
--   1. public.field_list — «عندك 10 ناس»: which people the administrator handed to which commercial, and
--      when. Separate from persons.assigned_to on purpose: a commercial who also works the phones owns many
--      files, and the tablet shows only the ones he was sent to SHOW.
--   2. Two columns on a visit: the hour agreed on the phone (the slot stays the owner's morning/afternoon
--      list; the hour is picked inside it) and the result in the owner's own five words.
--   3. One act for the result. «دفع عربون» opens the hold on N trees AND records the money AND makes the
--      receipt, in one transaction, so a deposit is never recorded against trees that were not held.
--   4. The commercial records that deposit himself. Until today money was Finance's alone
--      (app.can_record_money); the owner's process is that the commercial takes the cash on the land and
--      hands a receipt. It is allowed HERE ONLY: a deposit, on the hold this same call opens, from a visit on
--      a file he may edit. The payment carries recorded_by, the audit says «field», and Finance can void it
--      with staff_void_payment like any other.
--
-- THE DEPOSIT IS WHAT WAS PAID. reservations.deposit_due_millimes is normally the offer's terms (settings
-- reservations.deposit_millimes_default). On the land the client pays what he pays — 50, 100 or 1000 — and
-- that IS the agreed deposit, so the hold opened by «دفع عربون» takes the amount received as its due and is
-- «deposit_paid» at once. «خذا» without money keeps the terms' deposit, still to be paid.
--
-- NO MESSAGE IS SENT by default. The commercial agrees the appointment on the phone; the owner does not want
-- SMS («ما نحبش SMS»). settings field.sms_on_booking (false) sends the existing visit.confirmed message when
-- he switches it on.
--
-- THE 10 DAYS. The owner: «ياخو عربون، العربون هذاك يقعد 10 أيام». reservations.valid_days_default was 14;
-- it becomes 10 unless somebody already changed it from 14 in الإعدادات.

-- ---------------------------------------------------------------------------
-- 1 · The list the administrator hands out
-- ---------------------------------------------------------------------------

create table if not exists public.field_list (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.persons (id) on delete cascade,
  commercial_id uuid not null references public.profiles (id),
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references public.profiles (id),
  removed_at    timestamptz,
  removed_by    uuid references public.profiles (id)
);

comment on table public.field_list is
  '«الميدان» (0175): the people an administrator sent one field commercial to show the land to. One open row per person (removed_at null).';

create unique index if not exists field_list_one_open on public.field_list (person_id) where removed_at is null;
create index if not exists field_list_commercial on public.field_list (commercial_id) where removed_at is null;

alter table public.field_list enable row level security;

drop policy if exists field_list_read on public.field_list;
create policy field_list_read on public.field_list for select to authenticated
  using (app.is_admin() or commercial_id = auth.uid());

revoke all on public.field_list from anon;
grant select on public.field_list to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · The hour and the result on a visit
-- ---------------------------------------------------------------------------

alter table public.visits
  add column if not exists meeting_time time,
  add column if not exists field_result text,
  add column if not exists field_reservation_id uuid references public.reservations (id);

alter table public.visits drop constraint if exists visits_field_result_check;
alter table public.visits add constraint visits_field_result_check check (
  field_result is null
  or (status = 'completed' and field_result in ('took', 'deposit', 'not_now', 'disliked')));

comment on column public.visits.meeting_time is
  '0175: the hour agreed with the client, inside the slot (slot_from–slot_to). Null when only the slot was agreed.';
comment on column public.visits.field_result is
  '0175: the field commercial''s result — took · deposit · not_now · disliked. Labels: settings field.result_labels.';

-- ---------------------------------------------------------------------------
-- 3 · The owner's words and figures
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('field.result_labels',
   '{"took": "خذا", "deposit": "دفع عربون", "not_now": "ما خذاش", "disliked": "ما عجبوش", "no_show": "ما جاش"}'::jsonb,
   'json', 'field', 'الميدان: أسماء نتيجة الزيارة',
   'الكلمات اللي يشوفها الكوميرسيال على التابلات وتبان في الملف.', false, 10),
  ('field.deposit_quick_millimes', '[50000, 100000, 1000000]'::jsonb, 'json', 'field',
   'الميدان: مبالغ العربون السريعة (بالمليم)',
   'أزرار جاهزة كي يكتب الكوميرسيال قدّاش خلّص الحريف. ينجم ديما يكتب مبلغ آخر.', false, 20),
  ('field.receipt_title', to_jsonb('وصل استلام عربون'::text), 'text', 'field', 'الميدان: عنوان الوصل', null, false, 30),
  ('field.receipt_note',
   to_jsonb('استلمنا منك المبلغ هذا كعربون حجز للزيتونات المذكورة في الوصل. الزيتونات محجوزة باسمك حتى {date}.'::text),
   'text', 'field', 'الميدان: نص الوصل ({date} = آخر نهار في الحجز)', null, false, 31),
  ('field.sms_on_booking', 'false'::jsonb, 'boolean', 'field', 'الميدان: نبعثو SMS كي يتثبّت الموعد',
   'موش مشعول: الكوميرسيال يتّفق مع الحريف بالتلفون.', false, 40)
on conflict (key) do nothing;

update public.settings
   set value = to_jsonb(10), updated_at = now()
 where key = 'reservations.valid_days_default' and value = to_jsonb(14);

-- ---------------------------------------------------------------------------
-- 4 · Reads
-- ---------------------------------------------------------------------------

/** The step a listed person stands at, from the facts: a result, a visit, or nothing yet. */
create or replace function app.field_step(p_person uuid, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_open  public.visits;
  v_done  public.visits;
  v_today date := app.tunis_today();
  v_step  text;
begin
  select * into v_open from public.visits v
   where v.person_id = p_person and v.status in ('requested', 'confirmed')
   order by v.visit_date, v.slot_from nulls last limit 1;

  select * into v_done from public.visits v
   where v.person_id = p_person and v.status in ('completed', 'no_show')
     and coalesce(v.status_changed_at, v.updated_at) >= p_since
   order by coalesce(v.status_changed_at, v.updated_at) desc limit 1;

  v_step := case
    when v_open.id is not null and v_open.visit_date < v_today then 'report'
    when v_open.id is not null and v_open.visit_date = v_today then 'today'
    when v_open.id is not null then 'planned'
    when v_done.id is not null and v_done.status = 'completed' then 'done'
    else 'call'
  end;

  return jsonb_build_object(
    'step', v_step,
    'visit', case when v_open.id is not null then app.field_visit(v_open.id) end,
    'last', case when v_done.id is not null then app.field_visit(v_done.id) end);
end $fn$;
revoke execute on function app.field_step(uuid, timestamptz) from public, anon, authenticated;

/** One visit as the tablet reads it: the shared payload plus the hour and the result. */
create or replace function app.field_visit(p_visit uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select app.visit_payload(v.id) || jsonb_build_object(
           'meeting_time', to_char(v.meeting_time, 'HH24:MI'),
           'project_id', v.project_id,
           'field_result', case when v.status = 'no_show' then 'no_show' else v.field_result end,
           'field_reservation_id', v.field_reservation_id,
           'map_url', case when pj.latitude is not null and pj.longitude is not null
                           then 'https://www.google.com/maps/search/?api=1&query=' || pj.latitude || ',' || pj.longitude end)
  from public.visits v
  join public.projects pj on pj.id = v.project_id
  where v.id = p_visit
$fn$;
revoke execute on function app.field_visit(uuid) from public, anon, authenticated;

/** The demand a field card is about: the newest one asking for a visit, else the newest of all. */
create or replace function app.field_request(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
           'id', r.id, 'request_no', r.request_no, 'project_id', r.project_id,
           'offer_name', pj.name, 'offer_code', pj.code,
           'trees', coalesce(r.offer_trees, r.tree_count_min),
           'trees_label', r.tree_count_label_ar,
           'budget_label', r.budget_label_ar,
           'payment_mode', r.payment_mode,
           'monthly_millimes', r.monthly_millimes,
           'total_millimes', r.offer_total_price_millimes,
           'contact_time_label', r.contact_time_label_ar,
           'wants_visit', r.wants_visit,
           'created_at', r.created_at)
  from public.interest_requests r
  left join public.projects pj on pj.id = r.project_id
  where r.person_id = p_person
  order by coalesce(r.wants_visit, false) desc, r.created_at desc
  limit 1
$fn$;
revoke execute on function app.field_request(uuid) from public, anon, authenticated;

/**
 * «الميدان»: one commercial's people, each at its step. An administrator may read anybody's (p_user);
 * anybody else reads their own, whatever they pass.
 */
create or replace function public.field_board(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_user   uuid := case when app.is_admin() then coalesce(p_user, auth.uid()) else auth.uid() end;
  v_people jsonb;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Today's visits by the hour, then the ones still waiting for their result, then the people to call (the
  -- longest waiting first), then the appointments to come by date, and last what is finished, newest first.
  select coalesce(jsonb_agg(x.item order by x.rank, x.sort_key, x.done_at desc nulls last), '[]'::jsonb) into v_people
  from (
    select s.item,
           case s.item->>'step' when 'today' then 1 when 'report' then 2 when 'call' then 3
                                when 'planned' then 4 else 5 end as rank,
           case s.item->>'step'
             when 'today'   then coalesce(s.item->'visit'->>'meeting_time', s.item->'visit'->>'slot_from', '')
             when 'report'  then s.item->'visit'->>'visit_date'
             when 'planned' then (s.item->'visit'->>'visit_date') || coalesce(s.item->'visit'->>'meeting_time', '')
             when 'done'    then ''
             else to_char(s.assigned_at at time zone 'UTC', 'YYYYMMDDHH24MISS')
           end as sort_key,
           case when s.item->>'step' = 'done' then (s.item->'last'->>'status_changed_at')::timestamptz end as done_at
    from (
      select fl.assigned_at,
             jsonb_build_object(
               'person', jsonb_build_object('id', p.id, 'full_name', p.full_name,
                                            'phone_e164', p.phone_e164, 'whatsapp_e164', p.whatsapp_e164,
                                            'governorate', g.name_ar),
               'assigned_at', fl.assigned_at,
               'request', app.field_request(p.id),
               'last_call', (select jsonb_build_object('at', ca.created_at, 'outcome', ca.outcome::text, 'note', ca.note)
                               from public.contact_attempts ca where ca.person_id = p.id
                               order by ca.created_at desc limit 1),
               'calls', (select count(*) from public.contact_attempts ca
                          where ca.person_id = p.id and ca.created_at >= fl.assigned_at)
             ) || app.field_step(p.id, fl.assigned_at) as item
      from public.field_list fl
      join public.persons p on p.id = fl.person_id
      left join public.governorates g on g.id = p.governorate_id
      where fl.commercial_id = v_user and fl.removed_at is null and p.archived_at is null
    ) s
  ) x;

  return jsonb_build_object(
    'user', (select jsonb_build_object('id', pr.id, 'full_name', pr.full_name) from public.profiles pr where pr.id = v_user),
    'today', app.tunis_today(),
    'labels', coalesce(app.setting('field.result_labels'), '{}'::jsonb),
    'people', v_people,
    'commercials', case when app.is_admin() then app.field_commercials() end);
end $fn$;
revoke execute on function public.field_board(uuid) from public, anon;
grant execute on function public.field_board(uuid) to authenticated;

/** Who can be sent to the land, with what each one already holds. Read by administrators only. */
create or replace function app.field_commercials() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id, 'full_name', pr.full_name,
           'open', (select count(*) from public.field_list fl where fl.commercial_id = pr.id and fl.removed_at is null))
         order by pr.full_name), '[]'::jsonb)
  from public.profiles pr
  where pr.is_active
    and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'commercial')
$fn$;
revoke execute on function app.field_commercials() from public, anon, authenticated;

/** One person's whole field file: who they are, what they asked, the visits, the hold, the calls. */
create or replace function public.field_person(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_person public.persons;
  v_list   public.field_list;
  v_res    uuid;
begin
  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_person from public.persons p where p.id = p_person;
  if not found then
    raise exception 'person_not_found' using errcode = 'P0001';
  end if;
  select * into v_list from public.field_list fl where fl.person_id = p_person and fl.removed_at is null;

  select r.id into v_res from public.reservations r
   where r.person_id = p_person
   order by (r.status in ('awaiting_deposit', 'deposit_paid')) desc, r.created_at desc limit 1;

  return jsonb_build_object(
    'person', jsonb_build_object('id', v_person.id, 'full_name', v_person.full_name,
                                 'phone_e164', v_person.phone_e164, 'whatsapp_e164', v_person.whatsapp_e164,
                                 'governorate', (select g.name_ar from public.governorates g where g.id = v_person.governorate_id)),
    'can_edit', app.can_edit_person(p_person),
    'listed', case when v_list.id is null then null else jsonb_build_object(
                'commercial', (select jsonb_build_object('id', pr.id, 'full_name', pr.full_name)
                                 from public.profiles pr where pr.id = v_list.commercial_id),
                'assigned_at', v_list.assigned_at) end,
    'request', app.field_request(p_person),
    'state', app.field_step(p_person, coalesce(v_list.assigned_at, '-infinity'::timestamptz)),
    'visits', (select coalesce(jsonb_agg(app.field_visit(v.id) order by v.visit_date desc, v.created_at desc), '[]'::jsonb)
                 from (select * from public.visits x where x.person_id = p_person
                       order by x.visit_date desc, x.created_at desc limit 5) v),
    'reservation', case when v_res is null then null else app.reservation_payload(v_res) end,
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('at', c.created_at, 'outcome', c.outcome::text, 'note', c.note,
                                                           'by', (select pr.full_name from public.profiles pr where pr.id = c.created_by))
                                        order by c.created_at desc), '[]'::jsonb)
                from (select * from public.contact_attempts x where x.person_id = p_person
                      order by x.created_at desc limit 6) c),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', pj.id, 'code', pj.code, 'name', pj.name,
                         'meeting_point', app.visit_terms(pj.id)->>'meeting_point',
                         'available', (select count(*) from public.trees t where t.project_id = pj.id and t.state = 'available'),
                         'deposit_millimes', (app.offer_reservation_terms(pj.id)->>'deposit_millimes')::bigint,
                         'valid_days', (app.offer_reservation_terms(pj.id)->>'valid_days')::integer)
                       order by pj.name), '[]'::jsonb)
                 from public.projects pj where pj.status = 'published'),
    'terms', app.visit_terms(null),
    'labels', coalesce(app.setting('field.result_labels'), '{}'::jsonb),
    'quick_amounts', coalesce(app.setting('field.deposit_quick_millimes'), '[]'::jsonb),
    'methods', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'label_ar', o.label_ar)
                                          order by o.sort_order), '[]'::jsonb)
                  from public.option_items o where o.list_key = 'payment_method' and o.is_active));
end $fn$;
revoke execute on function public.field_person(uuid) from public, anon;
grant execute on function public.field_person(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · The appointment
-- ---------------------------------------------------------------------------

/**
 * «حدّد الموعد»: the day and hour agreed on the phone. The hour picks the slot it falls in (the owner's
 * visit_slot list); a person with an open visit has it moved, never a second one opened. The visit is
 * confirmed and is the caller's — or, for an administrator booking on someone's behalf, the listed
 * commercial's.
 */
create or replace function public.field_book(p_person uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_project uuid := nullif(p->>'project_id', '')::uuid;
  v_request uuid := nullif(p->>'request_id', '')::uuid;
  v_date    date := nullif(p->>'visit_date', '')::date;
  v_time    time;
  v_people  integer := coalesce(nullif(p->>'people_count', '')::integer, 1);
  v_point   text := nullif(btrim(coalesce(p->>'meeting_point', '')), '');
  v_note    text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_slot    public.option_items;
  v_open    public.visits;
  v_who     uuid;
  v_id      uuid;
  v_no      text;
  v_year    text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
begin
  if not (app.is_staff() and app.can_edit_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects pj where pj.id = v_project) then
    raise exception 'invalid_visit_project' using errcode = 'P0001';
  end if;
  if v_request is not null and not exists (
    select 1 from public.interest_requests r
     where r.id = v_request and r.person_id = p_person and (r.project_id is null or r.project_id = v_project)) then
    v_request := null;
  end if;

  begin
    v_time := nullif(btrim(coalesce(p->>'time', '')), '')::time;
  exception when others then
    raise exception 'invalid_visit_time' using errcode = 'P0001';
  end;
  if v_time is null then
    raise exception 'invalid_visit_time' using errcode = 'P0001';
  end if;

  select * into v_slot from public.option_items o
   where o.list_key = 'visit_slot' and o.is_active
     and o.time_from is not null and o.time_to is not null
     and v_time >= o.time_from and v_time < o.time_to
   order by o.sort_order limit 1;
  if v_slot.id is null then
    raise exception 'visit_time_outside_slots' using errcode = 'P0001';
  end if;
  perform app.assert_visit_booking(v_date, v_slot.id, v_people);

  v_who := case when app.has_role('commercial') then auth.uid()
                else coalesce((select fl.commercial_id from public.field_list fl
                                where fl.person_id = p_person and fl.removed_at is null), auth.uid()) end;
  v_point := coalesce(v_point, app.visit_terms(v_project)->>'meeting_point');

  perform app.set_reason('الميدان: موعد زيارة');

  select * into v_open from public.visits v
   where v.person_id = p_person and v.status in ('requested', 'confirmed')
   order by v.visit_date limit 1
   for update;

  if v_open.id is not null then
    update public.visits v
       set project_id = v_project,
           request_id = coalesce(v_request, v.request_id),
           status = 'confirmed',
           visit_date = v_date,
           slot_option_id = v_slot.id, slot_label_ar = v_slot.label_ar,
           slot_from = v_slot.time_from, slot_to = v_slot.time_to,
           meeting_time = v_time,
           people_count = v_people,
           meeting_point = v_point,
           assigned_to = v_who,
           staff_note = coalesce(v_note, v.staff_note),
           status_changed_at = case when v.status <> 'confirmed' then now() else v.status_changed_at end,
           status_changed_by = case when v.status <> 'confirmed' then auth.uid() else v.status_changed_by end,
           updated_by = auth.uid()
     where v.id = v_open.id;
    v_id := v_open.id;
  else
    v_no := app.setting_text('visit_no.prefix', 'AGZ-VIS') || '-' || v_year || '-'
            || lpad(app.next_number('visit:' || v_year)::text, 5, '0');
    insert into public.visits (
      visit_no, person_id, project_id, request_id, status,
      visit_date, slot_option_id, slot_label_ar, slot_from, slot_to, meeting_time,
      people_count, contact_channel, meeting_point, assigned_to, staff_note,
      source, status_changed_at, status_changed_by, created_by, updated_by
    ) values (
      v_no, p_person, v_project, v_request, 'confirmed',
      v_date, v_slot.id, v_slot.label_ar, v_slot.time_from, v_slot.time_to, v_time,
      v_people, 'phone', v_point, v_who, v_note,
      'staff', now(), auth.uid(), auth.uid(), auth.uid()
    ) returning id into v_id;
  end if;

  if app.setting_bool('field.sms_on_booking', false) then
    perform app.visit_notify(v_id, 'visit.confirmed');
  end if;

  return app.field_visit(v_id);
end $fn$;
revoke execute on function public.field_book(uuid, jsonb) from public, anon;
grant execute on function public.field_book(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · The result — and the deposit with its receipt
-- ---------------------------------------------------------------------------

/**
 * «رجع لنا»: one of the owner's five words, written in one act.
 *   no_show   the visit becomes «ما حضرش»; the person goes back to «كلّمهم».
 *   disliked  completed, did not like it.
 *   not_now   completed, did not take (yet).
 *   took      completed, and N trees of the visited offer are held for the offer's days; deposit still due.
 *   deposit   the same, and the money received is recorded now: it becomes the agreed deposit, the hold is
 *             «العربون تخلّص», and the payment's id is returned for the receipt.
 */
create or replace function public.field_report(p_visit uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_visit   public.visits;
  v_result  text := btrim(coalesce(p->>'result', ''));
  v_note    text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_trees   integer := nullif(p->>'trees', '')::integer;
  v_amount  bigint := nullif(p->>'amount_millimes', '')::bigint;
  v_method  public.option_items;
  v_res     jsonb;
  v_res_id  uuid;
  v_ref     text;
  v_year    text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_pay_id  uuid;
begin
  select * into v_visit from public.visits v where v.id = p_visit for update;
  if not found then
    raise exception 'visit_not_found' using errcode = 'P0001';
  end if;
  if not (app.is_staff() and app.can_edit_person(v_visit.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_visit.status not in ('requested', 'confirmed') then
    raise exception 'visit_already_reported' using errcode = 'P0001';
  end if;
  if v_result not in ('took', 'deposit', 'not_now', 'disliked', 'no_show') then
    raise exception 'invalid_field_result' using errcode = 'P0001';
  end if;
  if v_result in ('took', 'deposit') and (v_trees is null or v_trees < 1) then
    raise exception 'invalid_tree_count' using errcode = 'P0001';
  end if;
  if v_result = 'deposit' and (v_amount is null or v_amount <= 0) then
    raise exception 'invalid_deposit_amount' using errcode = 'P0001';
  end if;
  if v_result = 'deposit' then
    v_method := app.active_option('payment_method', coalesce(nullif(p->>'method_id', ''),
                  (select o.id::text from public.option_items o
                    where o.list_key = 'payment_method' and o.code = 'cash' and o.is_active limit 1)));
    if v_method.id is null then
      raise exception 'invalid_payment_method' using errcode = 'P0001';
    end if;
  end if;

  perform app.set_reason('الميدان: نتيجة الزيارة ' || v_visit.visit_no);

  if v_result = 'no_show' then
    update public.visits v
       set status = 'no_show', status_changed_at = now(), status_changed_by = auth.uid(),
           outcome_note = coalesce(v_note, v.outcome_note), updated_by = auth.uid()
     where v.id = p_visit;
    return jsonb_build_object('visit', app.field_visit(p_visit));
  end if;

  -- The hold first: if the offer cannot hold N trees, nothing is written and the visit stays open.
  if v_result in ('took', 'deposit') then
    v_res := public.staff_create_reservation(v_visit.project_id, v_visit.person_id, v_visit.request_id, v_trees,
                                             coalesce(v_note, 'الميدان · ' || v_visit.visit_no),
                                             'الميدان: نتيجة الزيارة ' || v_visit.visit_no);
    v_res_id := (v_res->>'id')::uuid;
  end if;

  if v_result = 'deposit' then
    v_ref := app.setting_text('payment_no.prefix', 'AGZ-PAY') || '-' || v_year || '-'
             || lpad(app.next_number('payment:' || v_year)::text, 6, '0');

    insert into public.payments (
      reference_no, reservation_id, person_id, project_id, kind, amount_millimes,
      method_option_id, method_label_ar, received_at, note, recorded_by, updated_by
    ) values (
      v_ref, v_res_id, v_visit.person_id, v_visit.project_id, 'deposit', v_amount,
      v_method.id, v_method.label_ar, now(), v_note, auth.uid(), auth.uid()
    ) returning id into v_pay_id;

    update public.reservations r
       set deposit_due_millimes = v_amount,
           status = 'deposit_paid',
           deposit_paid_at = now(),
           updated_by = auth.uid()
     where r.id = v_res_id;

    perform app.write_audit('payments.record', 'payments', v_pay_id::text, null,
                            jsonb_build_object('reference_no', v_ref, 'reservation_id', v_res_id,
                                               'person_id', v_visit.person_id, 'kind', 'deposit',
                                               'amount_millimes', v_amount, 'method', v_method.label_ar,
                                               'by', 'field', 'visit_no', v_visit.visit_no),
                            null);
  end if;

  update public.visits v
     set status = 'completed',
         status_changed_at = now(),
         status_changed_by = auth.uid(),
         outcome_liked = case v_result when 'disliked' then false when 'not_now' then null else true end,
         outcome_project_id = v.project_id,
         outcome_note = v_note,
         field_result = v_result,
         field_reservation_id = v_res_id,
         updated_by = auth.uid()
   where v.id = p_visit;

  return jsonb_build_object(
    'visit', app.field_visit(p_visit),
    'reservation', case when v_res_id is null then null else app.reservation_payload(v_res_id) end,
    'payment_id', v_pay_id);
end $fn$;
revoke execute on function public.field_report(uuid, jsonb) from public, anon;
grant execute on function public.field_report(uuid, jsonb) to authenticated;

/** The receipt: everything printed on it, read from the payment and nothing retyped. */
create or replace function public.field_receipt(p_payment uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_pay public.payments;
begin
  select * into v_pay from public.payments x where x.id = p_payment;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  if not (app.is_staff() and (v_pay.recorded_by = auth.uid() or app.can_see_person(v_pay.person_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_pay.id,
    'reference_no', v_pay.reference_no,
    'kind', v_pay.kind::text,
    'amount_millimes', v_pay.amount_millimes,
    'method_label', v_pay.method_label_ar,
    'received_at', v_pay.received_at,
    'voided', v_pay.voided_at is not null,
    'recorded_by', (select pr.full_name from public.profiles pr where pr.id = v_pay.recorded_by),
    'person', (select jsonb_build_object('full_name', p.full_name, 'phone_e164', p.phone_e164,
                                         'whatsapp_e164', p.whatsapp_e164)
                 from public.persons p where p.id = v_pay.person_id),
    'reservation', case when v_pay.reservation_id is null then null else app.reservation_payload(v_pay.reservation_id) end,
    'offer', (select jsonb_build_object('name', pj.name, 'code', pj.code,
                                        'governorate', (select g.name_ar from public.governorates g where g.id = pj.governorate_id),
                                        'delegation', (select d.name_ar from public.delegations d where d.id = pj.delegation_id))
                from public.projects pj where pj.id = v_pay.project_id),
    'title', app.setting_text('field.receipt_title', ''),
    'note', app.setting_text('field.receipt_note', ''),
    'contact_phone', app.setting_text('site.contact_phone', ''));
end $fn$;
revoke execute on function public.field_receipt(uuid) from public, anon;
grant execute on function public.field_receipt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7 · The administrator hands out the list
-- ---------------------------------------------------------------------------

/**
 * Who is waiting to be shown the land and is on nobody's list yet: a demand asking for a visit (or a visit
 * the client asked for himself), no visit done, no hold open. With the commercials and what each holds.
 */
create or replace function public.admin_field_candidates() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'commercials', app.field_commercials(),
    'candidates', (
      select coalesce(jsonb_agg(c.item order by c.at desc), '[]'::jsonb)
      from (
        select greatest(coalesce(r.created_at, '-infinity'), coalesce(v.created_at, '-infinity')) as at,
               jsonb_build_object(
                 'person', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone_e164', p.phone_e164,
                                              'governorate', g.name_ar),
                 'owner', (select pr.full_name from public.profiles pr where pr.id = p.assigned_to),
                 'request', app.field_request(p.id),
                 'client_asked', v.id is not null) as item
        from public.persons p
        left join public.governorates g on g.id = p.governorate_id
        left join lateral (select x.created_at from public.interest_requests x
                            where x.person_id = p.id and x.wants_visit order by x.created_at desc limit 1) r on true
        left join lateral (select x.id, x.created_at from public.visits x
                            where x.person_id = p.id and x.status = 'requested' order by x.created_at desc limit 1) v on true
        where p.archived_at is null
          and (r.created_at is not null or v.id is not null)
          and not exists (select 1 from public.field_list fl where fl.person_id = p.id and fl.removed_at is null)
          and not exists (select 1 from public.visits x where x.person_id = p.id and x.status = 'completed')
          and not exists (select 1 from public.reservations x
                           where x.person_id = p.id and x.status in ('awaiting_deposit', 'deposit_paid', 'converted'))
        order by 1 desc
        limit 300
      ) c),
    'listed', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'person', jsonb_build_object('id', p.id, 'full_name', p.full_name),
               'commercial_id', fl.commercial_id,
               'assigned_at', fl.assigned_at,
               'step', app.field_step(p.id, fl.assigned_at)->>'step')
             order by fl.assigned_at desc), '[]'::jsonb)
      from public.field_list fl join public.persons p on p.id = fl.person_id
      where fl.removed_at is null));
end $fn$;
revoke execute on function public.admin_field_candidates() from public, anon;
grant execute on function public.admin_field_candidates() to authenticated;

/**
 * «اعطيهم لـ…»: the files move to the commercial (public.admin_assign_persons, with its trail), they join his
 * list, and any visit still open on them becomes his.
 */
create or replace function public.admin_field_assign(p_people uuid[], p_commercial uuid) returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  v_count integer := 0;
  v_id    uuid;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_commercial is null or not exists (
    select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
     where ur.user_id = p_commercial and ur.role = 'commercial' and pr.is_active) then
    raise exception 'target_not_active_commercial' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_people), 0) = 0 then
    return 0;
  end if;

  perform public.admin_assign_persons(p_people, p_commercial, 'الميدان: زيارة الأرض');

  for v_id in select distinct x from unnest(p_people) x
              where exists (select 1 from public.persons p where p.id = x and p.archived_at is null) loop
    update public.field_list fl
       set removed_at = now(), removed_by = auth.uid()
     where fl.person_id = v_id and fl.removed_at is null and fl.commercial_id <> p_commercial;
    if not exists (select 1 from public.field_list fl where fl.person_id = v_id and fl.removed_at is null) then
      insert into public.field_list (person_id, commercial_id, assigned_by) values (v_id, p_commercial, auth.uid());
      v_count := v_count + 1;
    end if;
    update public.visits v
       set assigned_to = p_commercial, updated_by = auth.uid()
     where v.person_id = v_id and v.status in ('requested', 'confirmed')
       and v.assigned_to is distinct from p_commercial;
  end loop;

  perform app.write_audit('field_list.assign', 'field_list', p_commercial::text, null,
                          jsonb_build_object('people', to_jsonb(p_people), 'added', v_count), null);
  return v_count;
end $fn$;
revoke execute on function public.admin_field_assign(uuid[], uuid) from public, anon;
grant execute on function public.admin_field_assign(uuid[], uuid) to authenticated;

/** «نحّيه من الليستا»: the person leaves the tablet; his file, visits and holds stay as they are. */
create or replace function public.admin_field_remove(p_person uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.field_list fl
     set removed_at = now(), removed_by = auth.uid()
   where fl.person_id = p_person and fl.removed_at is null;
end $fn$;
revoke execute on function public.admin_field_remove(uuid) from public, anon;
grant execute on function public.admin_field_remove(uuid) to authenticated;
