-- The numbers on the chips above the client list (0084 · crm_list_people).
--
-- WHY A CHIP WITHOUT A NUMBER IS WORSE THAN NO CHIP. «بلا مسؤول» tells a commercial that unowned files are a
-- category. «بلا مسؤول ١٢» tells them there is work waiting, and «بلا مسؤول» with nothing behind it makes them
-- press it to find out — which is the one thing a working queue must never charge for. crm_search_requests
-- counts only the set it was handed, so the old list could not put a number on any chip: each one cost its own
-- round trip, and ten stages meant ten searches to draw one strip.
--
-- SO ALL OF THEM ARE COUNTED ONCE, in a single pass over the files the reader is allowed to see. Security
-- invoker: a commercial's «١٢» counts their own files and nobody else's, for the same reason their list does
-- (persons_select, 0002). auth.uid() is what makes «عليّ» mean the person reading the screen rather than a
-- parameter a caller could point at someone else.
--
-- IT COUNTS FILES, NOT DEMANDS, so the total agrees with the list it sits above. A screen whose header says 26
-- and whose chips add up to 31 teaches its reader to trust neither.

create or replace function public.crm_people_counts() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with v as (
    select
      ps.id,
      ps.assigned_to,
      ps.cin,
      s.stage,
      not exists (select 1 from public.interest_requests r where r.person_id = ps.id) as no_demand
    from public.persons ps
    join public.lead_statuses s on s.id = ps.status_id
  )
  select jsonb_build_object(
    'total',      (select count(*) from v),
    'unassigned', (select count(*) from v where v.assigned_to is null),
    'mine',       (select count(*) from v where v.assigned_to = auth.uid()),
    'no_cin',     (select count(*) from v where v.cin is null),
    'no_demand',  (select count(*) from v where v.no_demand),
    -- One entry per stage that actually has files. A stage with none is absent rather than zero: the strip
    -- draws what exists, and «مغلق ٠» is a chip that can only disappoint whoever presses it.
    'stages', coalesce((
      select jsonb_object_agg(t.stage, t.n)
        from (select v.stage, count(*) as n from v group by v.stage) t
    ), '{}'::jsonb)
  )
$$;

revoke execute on function public.crm_people_counts() from public, anon;
grant execute on function public.crm_people_counts() to authenticated;

comment on function public.crm_people_counts() is
  'أعداد الحرفاء للشرائط فوق قائمة الملفات: المجموع، بلا مسؤول، عليّ (auth.uid)، بلا بطاقة تعريف، بلا طلب، وعدد لكل مرحلة. باستدعاء واحد، وبنفس صلاحيات القارئ.';
