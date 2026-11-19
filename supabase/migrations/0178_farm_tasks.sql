-- 0178 · «الخدمة في الضيعة» — a task, the workers who do it, their daily report with photos, and the supervisor
-- who goes, photographs and approves.
--
-- Its test is supabase/tests/122_farm_tasks.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0178_farm_tasks.sql supabase/tests/122_farm_tasks.sql
--
-- THE OWNER, 2026-11-19: «نعطي تاش … توزيع ادوار للي مش يخدموا الفلاحة ولا مش يقلموا … يعطيني رابور يصور لي شنو
-- عمل وشنو خدم كل نهار … ولا مش يراقبهم نعطيه دور مراقب، يمشي ويصور ويشوف ويبروفي الخدمة اللي خدمها. بروسيس
-- مقسم لتاشات يوصلنا النتيجة مزيانة».
--
-- THE PATH OF ONE TASK
--   planned      the farm manager writes it: which offer, which work (the owner's agrized_service list), what
--                exactly, where in the grove, which day, which workers, which supervisor.
--   in_progress  a worker says «بديت», or sends his first day's report.
--   reported     a worker's report says «كمّلت».
--   approved     the supervisor's check says «مقبولة», with his own photos. The work then becomes a done
--                public.agri_operations row (0066) — the record the clients' grove pages already read — so
--                «what was done» is written once, by the approval, and never retyped.
--   redo         the check says «عاود», with what is wrong. The workers see it and start again.
--   cancelled    the manager's.
--
-- EVERY REPORT AND EVERY CHECK CARRIES PHOTOS (settings farm.min_photos_work / _check). They go from the phone
-- straight into the private bucket farm-photos with one-time tokens, and a report counts only once the server
-- has seen them arrive.
--
-- WHO SEES WHAT. A worker sees the tasks he is on; a supervisor the ones he supervises; the farm managers
-- (app.can_manage_operations: agri_manager, finance, admin) all of them. Nothing here reads a client, a price or
-- a payment — which is why 0177's two roles were kept out of app.is_staff().

-- ---------------------------------------------------------------------------
-- 1 · Where the photos go, and the figures
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('farm-photos', 'farm-photos', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('farm.min_photos_work', to_jsonb(1), 'integer', 'farm', 'الخدمة: أقل عدد تصاور في رابور العامل', null, false, 10),
  ('farm.min_photos_check', to_jsonb(1), 'integer', 'farm', 'الخدمة: أقل عدد تصاور في مراقبة المراقب', null, false, 11),
  ('farm.max_photos', to_jsonb(12), 'integer', 'farm', 'الخدمة: أكثر عدد تصاور في رابور واحد', null, false, 12),
  ('farm_task_no.prefix', to_jsonb('AGZ-TSK'::text), 'text', 'farm', 'الخدمة: بادئة رقم التاسك', null, false, 13)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Tables
-- ---------------------------------------------------------------------------

create table if not exists public.farm_tasks (
  id                uuid primary key default gen_random_uuid(),
  task_no           text not null unique,
  project_id        uuid not null references public.projects (id),
  service_option_id uuid not null references public.option_items (id),
  service_label_ar  text not null,
  title             text not null check (char_length(btrim(title)) between 2 and 120),
  instructions      text check (char_length(instructions) <= 2000),
  scope_note        text check (char_length(scope_note) <= 300),
  target_trees      integer check (target_trees is null or target_trees > 0),
  planned_on        date not null,
  status            text not null default 'planned'
                    check (status in ('planned', 'in_progress', 'reported', 'approved', 'redo', 'cancelled')),
  supervisor_id     uuid references public.profiles (id),
  operation_id      uuid references public.agri_operations (id),
  approved_at       timestamptz,
  approved_by       uuid references public.profiles (id),
  cancel_reason     text check (char_length(cancel_reason) <= 300),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id),
  constraint farm_tasks_approved_pair check ((status = 'approved') = (approved_at is not null))
);

create table if not exists public.farm_task_workers (
  task_id   uuid not null references public.farm_tasks (id) on delete cascade,
  worker_id uuid not null references public.profiles (id),
  primary key (task_id, worker_id)
);

create table if not exists public.farm_reports (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.farm_tasks (id) on delete cascade,
  author_id  uuid not null references public.profiles (id),
  kind       text not null check (kind in ('work', 'check')),
  verdict    text check (verdict in ('approved', 'redo')),
  trees_done integer check (trees_done is null or trees_done >= 0),
  finished   boolean not null default false,
  note       text check (char_length(note) <= 1000),
  status     text not null default 'sending' check (status in ('sending', 'sent')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  constraint farm_reports_check_verdict check ((kind = 'check') = (verdict is not null))
);

create table if not exists public.farm_photos (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.farm_reports (id) on delete cascade,
  task_id    uuid not null references public.farm_tasks (id) on delete cascade,
  path       text not null unique,
  mime       text not null,
  size_bytes bigint not null check (size_bytes > 0),
  arrived    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists farm_tasks_day on public.farm_tasks (planned_on, status);
create index if not exists farm_task_workers_worker on public.farm_task_workers (worker_id);
create index if not exists farm_reports_task on public.farm_reports (task_id, created_at);

alter table public.farm_tasks        enable row level security;
alter table public.farm_task_workers enable row level security;
alter table public.farm_reports      enable row level security;
alter table public.farm_photos       enable row level security;
revoke all on public.farm_tasks, public.farm_task_workers, public.farm_reports, public.farm_photos from anon, authenticated;

comment on table public.farm_tasks is
  '0178: one piece of work in a grove — planned, done by its workers with daily photo reports, approved by its supervisor; approval writes the done agri_operations row.';

-- ---------------------------------------------------------------------------
-- 3 · Who stands where
-- ---------------------------------------------------------------------------

/** manager · supervisor · worker · null — the reader's place on one task. */
create or replace function app.farm_access(p_task uuid) returns text
language sql stable security definer set search_path = '' as $fn$
  select case
    when app.can_manage_operations() then 'manager'
    when app.has_role('supervisor') and exists (select 1 from public.farm_tasks t where t.id = p_task and t.supervisor_id = auth.uid()) then 'supervisor'
    when app.has_role('worker') and exists (select 1 from public.farm_task_workers w where w.task_id = p_task and w.worker_id = auth.uid()) then 'worker'
  end
$fn$;
revoke execute on function app.farm_access(uuid) from public, anon, authenticated;

create or replace function app.farm_status_label(p_status text) returns text
language sql immutable set search_path = '' as $fn$
  select case p_status
    when 'planned' then 'مبرمجة' when 'in_progress' then 'تخدم' when 'reported' then 'تستنّى المراقبة'
    when 'approved' then 'مقبولة' when 'redo' then 'لازم تتعاود' when 'cancelled' then 'ملغاة' else p_status end
$fn$;

/** One task as a card reads it. */
create or replace function app.farm_task_card(p_task uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'id', t.id, 'task_no', t.task_no, 'title', t.title, 'service', t.service_label_ar,
    'service_option_id', t.service_option_id,
    'project', jsonb_build_object('id', pj.id, 'name', pj.name, 'code', pj.code,
                                  'map_url', case when pj.latitude is not null and pj.longitude is not null
                                                  then 'https://www.google.com/maps/search/?api=1&query=' || pj.latitude || ',' || pj.longitude end),
    'planned_on', t.planned_on, 'status', t.status, 'status_label', app.farm_status_label(t.status),
    'instructions', t.instructions, 'scope_note', t.scope_note, 'target_trees', t.target_trees,
    'supervisor', (select jsonb_build_object('id', pr.id, 'full_name', pr.full_name) from public.profiles pr where pr.id = t.supervisor_id),
    'workers', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name) order by pr.full_name), '[]'::jsonb)
                  from public.farm_task_workers w join public.profiles pr on pr.id = w.worker_id where w.task_id = t.id),
    'reports', (select count(*) from public.farm_reports r where r.task_id = t.id and r.kind = 'work' and r.status = 'sent'),
    'photos', (select count(*) from public.farm_photos ph join public.farm_reports r on r.id = ph.report_id
                where ph.task_id = t.id and ph.arrived and r.status = 'sent'),
    'trees_done', (select coalesce(sum(r.trees_done), 0) from public.farm_reports r
                    where r.task_id = t.id and r.kind = 'work' and r.status = 'sent'),
    'last_report_at', (select max(r.sent_at) from public.farm_reports r where r.task_id = t.id and r.status = 'sent'),
    'last_check', (select jsonb_build_object('verdict', r.verdict, 'note', r.note, 'at', r.sent_at)
                     from public.farm_reports r where r.task_id = t.id and r.kind = 'check' and r.status = 'sent'
                    order by r.sent_at desc limit 1),
    'approved_at', t.approved_at, 'operation_id', t.operation_id, 'cancel_reason', t.cancel_reason)
  from public.farm_tasks t
  join public.projects pj on pj.id = t.project_id
  where t.id = p_task
$fn$;
revoke execute on function app.farm_task_card(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · The manager plans
-- ---------------------------------------------------------------------------

/** The people a task can be given to: workers and supervisors, with what each already holds. */
create or replace function public.staff_farm_people() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'workers', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name,
                  'open', (select count(*) from public.farm_task_workers w join public.farm_tasks t on t.id = w.task_id
                            where w.worker_id = pr.id and t.status in ('planned', 'in_progress', 'redo')))
                  order by pr.full_name), '[]'::jsonb)
                from public.profiles pr
                where pr.is_active and exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role = 'worker')),
    'supervisors', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name,
                      'open', (select count(*) from public.farm_tasks t where t.supervisor_id = pr.id and t.status in ('reported', 'in_progress')))
                      order by pr.full_name), '[]'::jsonb)
                    from public.profiles pr
                    where pr.is_active and exists (select 1 from public.user_roles ur where ur.user_id = pr.id
                                                     and ur.role in ('supervisor', 'agri_manager'))),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'label_ar', o.label_ar) order by o.sort_order), '[]'::jsonb)
                   from public.option_items o where o.list_key = 'agrized_service' and o.is_active),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('id', pj.id, 'name', pj.name, 'code', pj.code) order by pj.name), '[]'::jsonb)
                 from public.projects pj where pj.status = 'published'),
    'today', app.tunis_today());
end $fn$;
revoke execute on function public.staff_farm_people() from public, anon;
grant execute on function public.staff_farm_people() to authenticated;

/** Write a task, or change one that is not finished. Workers must be workers; the supervisor a supervisor. */
create or replace function public.staff_farm_task_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_id       uuid := nullif(p->>'id', '')::uuid;
  v_project  uuid := nullif(p->>'project_id', '')::uuid;
  v_service  public.option_items;
  v_title    text := nullif(btrim(coalesce(p->>'title', '')), '');
  v_date     date := nullif(p->>'planned_on', '')::date;
  v_sup      uuid := nullif(p->>'supervisor_id', '')::uuid;
  v_workers  uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(p->'worker_ids', '[]'::jsonb)) x), '{}');
  v_year     text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_task     public.farm_tasks;
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects pj where pj.id = v_project) then
    raise exception 'farm_project_required' using errcode = 'P0001';
  end if;
  v_service := app.active_option('agrized_service', nullif(p->>'service_option_id', ''));
  if v_service.id is null then
    raise exception 'farm_service_required' using errcode = 'P0001';
  end if;
  if v_date is null then
    raise exception 'farm_date_required' using errcode = 'P0001';
  end if;
  if cardinality(v_workers) = 0 then
    raise exception 'farm_workers_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_workers) w
              where not exists (select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
                                 where ur.user_id = w and ur.role = 'worker' and pr.is_active)) then
    raise exception 'farm_not_a_worker' using errcode = 'P0001';
  end if;
  if v_sup is not null and not exists (select 1 from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
                                        where ur.user_id = v_sup and ur.role in ('supervisor', 'agri_manager') and pr.is_active) then
    raise exception 'farm_not_a_supervisor' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.farm_tasks (task_no, project_id, service_option_id, service_label_ar, title, instructions,
                                   scope_note, target_trees, planned_on, supervisor_id, created_by, updated_by)
    values (app.setting_text('farm_task_no.prefix', 'AGZ-TSK') || '-' || v_year || '-'
              || lpad(app.next_number('farm_task:' || v_year)::text, 5, '0'),
            v_project, v_service.id, v_service.label_ar, coalesce(v_title, v_service.label_ar),
            left(nullif(btrim(coalesce(p->>'instructions', '')), ''), 2000),
            left(nullif(btrim(coalesce(p->>'scope_note', '')), ''), 300),
            nullif(p->>'target_trees', '')::integer, v_date, v_sup, auth.uid(), auth.uid())
    returning * into v_task;
  else
    select * into v_task from public.farm_tasks t where t.id = v_id for update;
    if not found then
      raise exception 'farm_task_not_found' using errcode = 'P0001';
    end if;
    if v_task.status in ('approved', 'cancelled') then
      raise exception 'farm_task_closed' using errcode = 'P0001';
    end if;
    update public.farm_tasks t
       set project_id = v_project, service_option_id = v_service.id, service_label_ar = v_service.label_ar,
           title = coalesce(v_title, v_service.label_ar),
           instructions = left(nullif(btrim(coalesce(p->>'instructions', '')), ''), 2000),
           scope_note = left(nullif(btrim(coalesce(p->>'scope_note', '')), ''), 300),
           target_trees = nullif(p->>'target_trees', '')::integer,
           planned_on = v_date, supervisor_id = v_sup, updated_at = now(), updated_by = auth.uid()
     where t.id = v_id returning * into v_task;
    delete from public.farm_task_workers w where w.task_id = v_id and not (w.worker_id = any (v_workers));
  end if;

  insert into public.farm_task_workers (task_id, worker_id)
  select v_task.id, w from unnest(v_workers) w
  on conflict do nothing;

  perform app.write_audit(case when v_id is null then 'farm_tasks.create' else 'farm_tasks.update' end,
                          'farm_tasks', v_task.id::text, null,
                          jsonb_build_object('task_no', v_task.task_no, 'workers', to_jsonb(v_workers), 'supervisor', v_sup), null);
  return app.farm_task_card(v_task.id);
end $fn$;
revoke execute on function public.staff_farm_task_save(jsonb) from public, anon;
grant execute on function public.staff_farm_task_save(jsonb) to authenticated;

create or replace function public.staff_farm_task_cancel(p_task uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if not app.can_manage_operations() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.farm_tasks t
     set status = 'cancelled', cancel_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300),
         updated_at = now(), updated_by = auth.uid()
   where t.id = p_task and t.status not in ('approved', 'cancelled');
  if not found then
    raise exception 'farm_task_closed' using errcode = 'P0001';
  end if;
  return app.farm_task_card(p_task);
end $fn$;
revoke execute on function public.staff_farm_task_cancel(uuid, text) from public, anon;
grant execute on function public.staff_farm_task_cancel(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · Everyone's list, and one task
-- ---------------------------------------------------------------------------

/**
 * «خدمتي»: the reader's tasks — a worker's own, a supervisor's, or every one for a manager — open ones first by
 * day, then what was finished in the last week.
 */
create or replace function public.farm_board() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_role text := case when app.can_manage_operations() then 'manager'
                      when app.has_role('supervisor') then 'supervisor'
                      when app.has_role('worker') then 'worker' end;
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'role', v_role,
    'today', app.tunis_today(),
    'tasks', (
      select coalesce(jsonb_agg(app.farm_task_card(t.id)
               order by case t.status when 'redo' then 0 when 'reported' then 1 when 'in_progress' then 2
                                      when 'planned' then 3 else 4 end,
                        t.planned_on, t.task_no), '[]'::jsonb)
      from public.farm_tasks t
      where (t.status not in ('approved', 'cancelled') or t.updated_at > now() - interval '7 days')
        and (v_role = 'manager'
             or (v_role = 'supervisor' and t.supervisor_id = auth.uid())
             or (v_role = 'worker' and exists (select 1 from public.farm_task_workers w where w.task_id = t.id and w.worker_id = auth.uid())))));
end $fn$;
revoke execute on function public.farm_board() from public, anon;
grant execute on function public.farm_board() to authenticated;

/** One task with every report and check, oldest first, and the photo paths the server will sign. */
create or replace function public.farm_task(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_access text := app.farm_access(p_task);
  v_status text;
begin
  if v_access is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select t.status into v_status from public.farm_tasks t where t.id = p_task;
  return jsonb_build_object(
    'task', app.farm_task_card(p_task),
    'access', v_access,
    'can_work', v_access in ('worker', 'manager') and v_status in ('planned', 'in_progress', 'redo'),
    'can_check', v_access in ('supervisor', 'manager') and v_status in ('in_progress', 'reported', 'redo')
                 and exists (select 1 from public.farm_reports r where r.task_id = p_task and r.kind = 'work' and r.status = 'sent'),
    'min_photos', jsonb_build_object('work', app.setting_int('farm.min_photos_work', 1),
                                     'check', app.setting_int('farm.min_photos_check', 1),
                                     'max', app.setting_int('farm.max_photos', 12)),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', r.id, 'kind', r.kind, 'verdict', r.verdict, 'trees_done', r.trees_done, 'finished', r.finished,
                  'note', r.note, 'at', r.sent_at,
                  'author', (select pr.full_name from public.profiles pr where pr.id = r.author_id),
                  'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.path) order by ph.created_at), '[]'::jsonb)
                               from public.farm_photos ph where ph.report_id = r.id and ph.arrived))
                  order by r.sent_at), '[]'::jsonb)
                from public.farm_reports r where r.task_id = p_task and r.status = 'sent'));
end $fn$;
revoke execute on function public.farm_task(uuid) from public, anon;
grant execute on function public.farm_task(uuid) to authenticated;

/** «بديت الخدمة». */
create or replace function public.farm_task_start(p_task uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if app.farm_access(p_task) not in ('worker', 'manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.farm_tasks t set status = 'in_progress', updated_at = now(), updated_by = auth.uid()
   where t.id = p_task and t.status in ('planned', 'redo');
  return app.farm_task_card(p_task);
end $fn$;
revoke execute on function public.farm_task_start(uuid) from public, anon;
grant execute on function public.farm_task_start(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · A report, or a check — opened with its photos, closed when they arrived
-- ---------------------------------------------------------------------------

create or replace function public.farm_report_open(p_task uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_access  text := app.farm_access(p_task);
  v_kind    text := coalesce(nullif(p->>'kind', ''), 'work');
  v_verdict text := nullif(p->>'verdict', '');
  v_task    public.farm_tasks;
  v_photos  jsonb := coalesce(p->'photos', '[]'::jsonb);
  v_report  uuid := gen_random_uuid();
  v_out     jsonb := '[]'::jsonb;
  v_ph      jsonb;
  v_id      uuid;
  v_mime    text;
  v_size    bigint;
  v_min     integer;
begin
  select * into v_task from public.farm_tasks t where t.id = p_task;
  if not found then
    raise exception 'farm_task_not_found' using errcode = 'P0001';
  end if;
  if v_kind = 'work' and (v_access is null or v_access not in ('worker', 'manager')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_kind = 'check' and (v_access is null or v_access not in ('supervisor', 'manager')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_kind not in ('work', 'check') or (v_kind = 'check' and coalesce(v_verdict, '') not in ('approved', 'redo')) then
    raise exception 'farm_bad_report' using errcode = 'P0001';
  end if;
  if v_kind = 'work' and v_task.status not in ('planned', 'in_progress', 'redo') then
    raise exception 'farm_task_closed' using errcode = 'P0001';
  end if;
  if v_kind = 'check' and v_task.status not in ('in_progress', 'reported', 'redo') then
    raise exception 'farm_task_closed' using errcode = 'P0001';
  end if;
  if v_kind = 'check' and v_verdict = 'redo' and char_length(btrim(coalesce(p->>'note', ''))) < 3 then
    raise exception 'farm_redo_needs_note' using errcode = 'P0001';
  end if;

  v_min := case v_kind when 'work' then app.setting_int('farm.min_photos_work', 1) else app.setting_int('farm.min_photos_check', 1) end;
  if jsonb_array_length(v_photos) < v_min then
    raise exception 'farm_photos_required' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_photos) > app.setting_int('farm.max_photos', 12) then
    raise exception 'farm_too_many_photos' using errcode = 'P0001';
  end if;

  insert into public.farm_reports (id, task_id, author_id, kind, verdict, trees_done, finished, note)
  values (v_report, p_task, auth.uid(), v_kind, case when v_kind = 'check' then v_verdict end,
          case when v_kind = 'work' then nullif(p->>'trees_done', '')::integer end,
          v_kind = 'work' and coalesce((p->>'finished')::boolean, false),
          left(nullif(btrim(coalesce(p->>'note', '')), ''), 1000));

  for v_ph in select * from jsonb_array_elements(v_photos) loop
    v_mime := lower(coalesce(v_ph->>'mime', ''));
    v_size := nullif(v_ph->>'size_bytes', '')::bigint;
    if not (v_mime = any (array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])) then
      raise exception 'farm_bad_photo' using errcode = 'P0001';
    end if;
    if v_size is null or v_size <= 0 or v_size > 20971520 then
      raise exception 'farm_photo_too_big' using errcode = 'P0001';
    end if;
    v_id := gen_random_uuid();
    insert into public.farm_photos (id, report_id, task_id, path, mime, size_bytes)
    values (v_id, v_report, p_task, p_task::text || '/' || v_report::text || '/' || v_id::text, v_mime, v_size);
    v_out := v_out || jsonb_build_object('id', v_id, 'path', p_task::text || '/' || v_report::text || '/' || v_id::text);
  end loop;

  return jsonb_build_object('report_id', v_report, 'photos', v_out);
end $fn$;
revoke execute on function public.farm_report_open(uuid, jsonb) from public, anon;
grant execute on function public.farm_report_open(uuid, jsonb) to authenticated;

/**
 * The server counted which photos reached storage (p_arrived: their ids). The report counts if enough of them
 * did; then the task moves: a worker's report starts it or, «كمّلت», hands it to the supervisor; a check
 * approves it — writing the done farm operation — or sends it back.
 */
create or replace function public.farm_report_close(p_report uuid, p_arrived uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_r     public.farm_reports;
  v_task  public.farm_tasks;
  v_count integer;
  v_min   integer;
  v_op    uuid;
begin
  select * into v_r from public.farm_reports r where r.id = p_report for update;
  if not found or v_r.author_id is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_r.status = 'sent' then
    return app.farm_task_card(v_r.task_id);
  end if;

  update public.farm_photos ph set arrived = true
   where ph.report_id = p_report and ph.id = any (coalesce(p_arrived, '{}'::uuid[]));
  select count(*) into v_count from public.farm_photos ph where ph.report_id = p_report and ph.arrived;
  v_min := case v_r.kind when 'work' then app.setting_int('farm.min_photos_work', 1) else app.setting_int('farm.min_photos_check', 1) end;
  if v_count < v_min then
    raise exception 'farm_photos_missing' using errcode = 'P0001';
  end if;

  update public.farm_reports r set status = 'sent', sent_at = now() where r.id = p_report;
  select * into v_task from public.farm_tasks t where t.id = v_r.task_id for update;

  if v_r.kind = 'work' then
    update public.farm_tasks t
       set status = case when v_r.finished then 'reported'
                         when t.status in ('planned', 'redo') then 'in_progress' else t.status end,
           updated_at = now(), updated_by = auth.uid()
     where t.id = v_task.id and t.status in ('planned', 'in_progress', 'redo');
  elsif v_r.verdict = 'approved' then
    insert into public.agri_operations (project_id, service_option_id, label_ar, scope, status, planned_on, executed_on,
                                        note, approved_by, approved_at, created_by, updated_by)
    values (v_task.project_id, v_task.service_option_id, left(v_task.title, 120), 'offer', 'done', v_task.planned_on,
            app.tunis_today(),
            left(concat_ws(' · ', v_task.task_no, v_task.scope_note, nullif(v_r.note, '')), 2000),
            auth.uid(), now(), auth.uid(), auth.uid())
    returning id into v_op;
    update public.farm_tasks t
       set status = 'approved', approved_at = now(), approved_by = auth.uid(), operation_id = v_op,
           updated_at = now(), updated_by = auth.uid()
     where t.id = v_task.id;
  else
    update public.farm_tasks t set status = 'redo', updated_at = now(), updated_by = auth.uid() where t.id = v_task.id;
  end if;

  perform app.write_audit('farm_reports.send', 'farm_reports', p_report::text, null,
                          jsonb_build_object('task_no', v_task.task_no, 'kind', v_r.kind, 'verdict', v_r.verdict,
                                             'photos', v_count, 'operation_id', v_op), null);
  return app.farm_task_card(v_task.id);
end $fn$;
revoke execute on function public.farm_report_close(uuid, uuid[]) from public, anon;
grant execute on function public.farm_report_close(uuid, uuid[]) to authenticated;
