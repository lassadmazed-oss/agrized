-- الملفات is a list of CLIENTS. Until now it was a list of DEMANDS grouped by person: crm_search_requests in
-- `people` mode (0052) keeps `row_number() over (partition by person_id order by created_at desc) = 1`, and its
-- FROM clause is public.interest_requests. A client with no demand is therefore not merely absent from that
-- list, they are unreachable through it — no filter and no search term can produce a row that the query has no
-- source for.
--
-- WHO HAS NO DEMAND. Everybody the company meets without a form. 0083 opens a file for a walk-in, a phone call
-- or a client met at the grove, and it deliberately writes NO interest_request («a demand is something a
-- customer asked for, and inventing one would put words in their mouth»). So the first sale to such a client
-- produces a person, a reservation, a contract and a payment schedule — and nothing at all in the one screen a
-- commercial looks a client up in. Zero clients are in that state today, which is why this is the moment: the
-- hole is one walk-in old, not a migration of history.
--
-- SO THIS STARTS FROM public.persons and REACHES for the newest demand, instead of being built out of demands.
-- A demand is context on the row (which offer, how many trees) rather than the reason the row exists.
--
-- FILTERS THAT NAME A DEMAND USE `exists`, NOT the newest one. «The clients who came from offer TX-00215» must
-- not skip a client whose most recent demand happens to be a calculator run — the newest demand is for
-- READING, any matching demand is for FILTERING. Conflating the two silently drops real clients from a list
-- whose whole job is to be complete.
--
-- THE DATE RANGE IS THE PERSON'S, not a demand's: on a list of clients «من / إلى» can only honestly mean «last
-- heard from between these two days», and the days are Africa/Tunis ones, so «اليوم» ends at midnight in Tunis
-- and not at 01:00 (CLAUDE.md: dates are shown in Africa/Tunis).
--
-- COUNT BEFORE THE PAGE. `count(*) over ()` is evaluated before limit/offset, so persons_total describes the
-- whole filtered set while the rows are one page of it — the same contract 0052 exposes, so the pagination the
-- Back Office already writes needs no second shape.
--
-- SECURITY INVOKER, like public.crm_requests: an admin, finance or legal sees every file, a commercial sees the
-- files assigned to them (persons_select, 0002). This function adds no visibility of its own — and the demand
-- context it reads comes through crm_requests, which is invoker too, so a row can never show a demand its
-- reader is not allowed to see.

create or replace function public.crm_list_people(
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
  persons_total       bigint
)
language sql stable security invoker set search_path = '' as $$
  with f as (
    select
      nullif(btrim(p->>'q'), '')                  as q,
      nullif(p->>'stage', '')::public.lead_stage  as stage,
      nullif(p->>'status_id', '')::uuid           as status_id,
      -- Text, not uuid: «none» is a value here (files nobody owns), and casting it would throw.
      nullif(p->>'assigned_to', '')               as assigned_to,
      nullif(p->>'request_kind', '')              as request_kind,
      nullif(p->>'project_id', '')::uuid          as project_id,
      nullif(p->>'from', '')::date                as from_date,
      nullif(p->>'to', '')::date                  as to_date,
      coalesce((p->>'no_demand')::boolean, false) as no_demand,
      coalesce((p->>'no_cin')::boolean, false)    as no_cin
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
      -- A file opened by staff has no last_request_at until the client asks for something, and a client who
      -- never asks is not a client from the bottom of the list — the day the file was opened IS the activity.
      coalesce(ps.last_request_at, ps.created_at) as last_activity_at,
      ps.created_at,
      (select count(*) from public.interest_requests r where r.person_id = ps.id) as requests_count,
      d.request_kind,
      d.project_id,
      d.project_name,
      d.offer_trees,
      d.tree_count_label_ar
    from public.persons ps
    cross join f
    join public.lead_statuses s on s.id = ps.status_id
    left join public.profiles pr on pr.id = ps.assigned_to
    left join public.governorates g on g.id = ps.governorate_id
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
        -- The number as it was typed: «98 123 456» is stored +21698123456, so the search strips everything
        -- that is not a digit from both sides and matches the tail. A CIN is matched from its start.
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
  )
  select
    m.id, m.full_name, m.phone_e164, m.cin, m.governorate_name_ar,
    m.status_id, m.stage, m.status_label_ar, m.assigned_to, m.assigned_to_name,
    m.last_activity_at, m.created_at, m.requests_count,
    m.request_kind, m.project_id, m.project_name, m.offer_trees, m.tree_count_label_ar,
    count(*) over () as persons_total
  from matched m
  -- Newest first, because the list is a working queue and not an archive. The id breaks ties so that two files
  -- opened in the same second do not swap places between one page and the next.
  order by m.last_activity_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.crm_list_people(jsonb, integer, integer) from public, anon;
grant execute on function public.crm_list_people(jsonb, integer, integer) to authenticated;

comment on function public.crm_list_people(jsonb, integer, integer) is
  'قائمة الحرفاء (سطر لكل حريف، موش لكل طلب): تبدا من public.persons، فما فيها حتى الحريف اللي تفتح ملفو من الباك أوفيس بلا فورمولير (0083). الفلاتر: q (اسم/تلفون/بطاقة)، stage، status_id، assigned_to (uuid ولا none)، request_kind، project_id، from/to (بتوقيت تونس)، no_demand، no_cin. persons_total يعطي المجموع الكامل قبل الصفحة.';
