-- «I want to be able to see the unclicked ones, to know which one has been seen or clicked on or not»
-- (owner, 2026-09-23).
--
-- WHAT THIS ANSWERS. A list of twenty-six files all look alike, and the only way to know whether anybody has
-- looked at the one that came in an hour ago is to remember. A commercial coming back after a day off cannot
-- tell a lead nobody touched from one that was called twice. The database knows when a status changed and
-- when a demand arrived; it has never known whether a human READ the file.
--
-- ONE ROW PER PERSON PER READER, not a flag on the person. «Seen» is not a property of the client — it is a
-- fact about a reader, and a file seen by Ahmed is still unread for Salma. A boolean on persons would make the
-- second commercial's queue disappear the moment the first one opened it.
--
-- IT IS NOT AN AUDIT LOG. The row is upserted, so it holds the LAST time this reader opened the file and not
-- every time they did: the question is «is there anything here I have not looked at», which one timestamp
-- answers. person_status_history and person_assignments are where the trail of what CHANGED lives; opening a
-- file changes nothing, and a hundred thousand rows recording that somebody looked would bury them.
--
-- WRITES GO THROUGH THE FUNCTION. `authenticated` gets select on its own rows and nothing else, so a reader
-- can never mark a file as seen for somebody ELSE — which would empty a colleague's queue — and can never
-- backdate their own.

create table public.person_views (
  person_id uuid        not null references public.persons (id) on delete cascade,
  user_id   uuid        not null references public.profiles (id) on delete cascade,
  seen_at   timestamptz not null default now(),
  primary key (person_id, user_id)
);

create index person_views_user_idx on public.person_views (user_id, seen_at desc);

alter table public.person_views enable row level security;

-- A reader sees their own reading history. Nobody else's, not even an admin's: the only purpose of this table
-- is to draw one dot on one person's screen, and «who read what» is not a management report we were asked for.
create policy person_views_select on public.person_views for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.person_views from authenticated;
grant select on public.person_views to authenticated;

/**
 * Marks a file as read by whoever is reading it. Called when the file's own screen renders.
 */
create or replace function public.staff_mark_person_seen(p_person uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- The same visibility rule as the file itself: a commercial cannot mark a file they are not allowed to open,
  -- which is also what stops this being a way to probe whether an id exists.
  if not app.can_see_person(p_person) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.person_views (person_id, user_id)
  values (p_person, auth.uid())
  on conflict (person_id, user_id) do update set seen_at = now();
end $$;

revoke execute on function public.staff_mark_person_seen(uuid) from public, anon;
grant execute on function public.staff_mark_person_seen(uuid) to authenticated;

comment on table public.person_views is
  'آخر مرّة قرا فيها موظّف ملف حريف. سطر لكل (حريف، قارئ): الملف اللي شافو زميلك يبقى ما تشافش عندك.';

-- ---------------------------------------------------------------------------
-- The list learns to say «not seen»
-- ---------------------------------------------------------------------------
-- The return type gains a column, and Postgres will not let `create or replace` change one, so the function is
-- dropped and written again. Its body is 0084's, plus seen_at and the filter that reads it.

drop function if exists public.crm_list_people(jsonb, integer, integer);

create function public.crm_list_people(
  p        jsonb   default '{}'::jsonb,
  p_limit  integer default 100,
  p_offset integer default 0
) returns table (
  person_id           uuid,
  full_name           text,
  phone_e164          text,
  cin                 text,
  governorate_name_ar text,
  status_id           uuid,
  stage               public.lead_stage,
  status_label_ar     text,
  assigned_to         uuid,
  assigned_to_name    text,
  last_activity_at    timestamptz,
  created_at          timestamptz,
  requests_count      bigint,
  request_kind        text,
  project_id          uuid,
  project_name        text,
  offer_trees         integer,
  tree_count_label_ar text,
  seen_at             timestamptz,
  persons_total       bigint
)
language sql stable security invoker set search_path = '' as $$
  with f as (
    select
      nullif(btrim(p->>'q'), '')                   as q,
      nullif(p->>'stage', '')::public.lead_stage   as stage,
      nullif(p->>'status_id', '')::uuid            as status_id,
      nullif(p->>'assigned_to', '')                as assigned_to,
      nullif(p->>'request_kind', '')               as request_kind,
      nullif(p->>'project_id', '')::uuid           as project_id,
      nullif(p->>'from', '')::date                 as from_date,
      nullif(p->>'to', '')::date                   as to_date,
      coalesce((p->>'no_demand')::boolean, false)  as no_demand,
      coalesce((p->>'no_cin')::boolean, false)     as no_cin,
      coalesce((p->>'unseen_only')::boolean, false) as unseen_only
  ),
  matched as (
    select
      ps.id,
      ps.full_name,
      ps.phone_e164,
      ps.cin,
      g.name_ar                                   as governorate_name_ar,
      ps.status_id,
      s.stage,
      s.label_ar                                  as status_label_ar,
      ps.assigned_to,
      pr.full_name                                as assigned_to_name,
      coalesce(ps.last_request_at, ps.created_at) as last_activity_at,
      ps.created_at,
      (select count(*) from public.interest_requests r where r.person_id = ps.id) as requests_count,
      d.request_kind,
      d.project_id,
      d.project_name,
      d.offer_trees,
      d.tree_count_label_ar,
      v.seen_at
    from public.persons ps
    cross join f
    join public.lead_statuses s on s.id = ps.status_id
    left join public.profiles pr on pr.id = ps.assigned_to
    left join public.governorates g on g.id = ps.governorate_id
    -- The reader's own reading mark. RLS on person_views already limits it to them; naming auth.uid() here as
    -- well keeps the join honest when the function is read on its own.
    left join public.person_views v on v.person_id = ps.id and v.user_id = auth.uid()
    left join lateral (
      select c.request_kind, c.project_id, c.project_name, c.offer_trees, c.tree_count_label_ar
        from public.crm_requests c
       where c.person_id = ps.id
       order by c.created_at desc, c.id desc
       limit 1
    ) d on true
    where (
        f.q is null
        or ps.full_name ilike '%' || f.q || '%'
        or regexp_replace(ps.phone_e164, '[^0-9]', '', 'g') like '%' || regexp_replace(f.q, '[^0-9]', '', 'g')
        or (ps.cin is not null and ps.cin like f.q || '%')
      )
      and (f.stage is null or s.stage = f.stage)
      and (f.status_id is null or ps.status_id = f.status_id)
      and (
        f.assigned_to is null
        or (f.assigned_to = 'none' and ps.assigned_to is null)
        or (f.assigned_to <> 'none' and ps.assigned_to = f.assigned_to::uuid)
      )
      and (f.from_date is null
           or coalesce(ps.last_request_at, ps.created_at) >= (f.from_date::timestamp at time zone 'Africa/Tunis'))
      and (f.to_date is null
           or coalesce(ps.last_request_at, ps.created_at) < ((f.to_date + 1)::timestamp at time zone 'Africa/Tunis'))
      and (f.request_kind is null or exists (
             select 1 from public.crm_requests c2
              where c2.person_id = ps.id and c2.request_kind = f.request_kind))
      and (f.project_id is null or exists (
             select 1 from public.crm_requests c3
              where c3.person_id = ps.id and c3.project_id = f.project_id))
      and (not f.no_demand or not exists (
             select 1 from public.interest_requests r2 where r2.person_id = ps.id))
      and (not f.no_cin or ps.cin is null)
      -- «Not seen» means never opened, or opened before the file last moved: a client who wrote again after
      -- you read their file is unread again, which is the whole point of the mark.
      and (not f.unseen_only or v.seen_at is null
           or v.seen_at < coalesce(ps.last_request_at, ps.created_at))
  )
  select
    m.id, m.full_name, m.phone_e164, m.cin, m.governorate_name_ar,
    m.status_id, m.stage, m.status_label_ar, m.assigned_to, m.assigned_to_name,
    m.last_activity_at, m.created_at, m.requests_count,
    m.request_kind, m.project_id, m.project_name, m.offer_trees, m.tree_count_label_ar,
    m.seen_at,
    count(*) over () as persons_total
  from matched m
  order by m.last_activity_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.crm_list_people(jsonb, integer, integer) from public, anon;
grant execute on function public.crm_list_people(jsonb, integer, integer) to authenticated;

comment on function public.crm_list_people(jsonb, integer, integer) is
  'قائمة الحرفاء (سطر لكل حريف، موش لكل طلب): تبدا من public.persons، فما فيها حتى الحريف اللي تفتح ملفو من الباك أوفيس بلا فورمولير (0083). الفلاتر: q (اسم/تلفون/بطاقة)، stage، status_id، assigned_to (uuid ولا none)، request_kind، project_id، from/to (بتوقيت تونس)، no_demand، no_cin، unseen_only. seen_at هي آخر مرّة قرا فيها القارئ الحالي الملف. persons_total يعطي المجموع الكامل قبل الصفحة.';

-- ---------------------------------------------------------------------------
-- And the chips learn to count it
-- ---------------------------------------------------------------------------

create or replace function public.crm_people_counts() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with v as (
    select
      ps.id,
      ps.assigned_to,
      ps.cin,
      s.stage,
      coalesce(ps.last_request_at, ps.created_at) as last_activity_at,
      pv.seen_at,
      not exists (select 1 from public.interest_requests r where r.person_id = ps.id) as no_demand
    from public.persons ps
    join public.lead_statuses s on s.id = ps.status_id
    left join public.person_views pv on pv.person_id = ps.id and pv.user_id = auth.uid()
  )
  select jsonb_build_object(
    'total',      (select count(*) from v),
    'unassigned', (select count(*) from v where v.assigned_to is null),
    'mine',       (select count(*) from v where v.assigned_to = auth.uid()),
    'no_cin',     (select count(*) from v where v.cin is null),
    'no_demand',  (select count(*) from v where v.no_demand),
    'unseen',     (select count(*) from v where v.seen_at is null or v.seen_at < v.last_activity_at),
    'stages', coalesce((
      select jsonb_object_agg(t.stage, t.n)
        from (select v.stage, count(*) as n from v group by v.stage) t
    ), '{}'::jsonb)
  )
$$;

comment on function public.crm_people_counts() is
  'أعداد الحرفاء للشرائط فوق قائمة الملفات: المجموع، بلا مسؤول، عليّ (auth.uid)، بلا بطاقة تعريف، بلا طلب، ما تشافوش، وعدد لكل مرحلة. باستدعاء واحد، وبنفس صلاحيات القارئ.';
