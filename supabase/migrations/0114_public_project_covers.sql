-- 0114 · صورة الغلاف بلغة الزائر — WHICH PICTURE IS EACH OFFER'S COVER.
--
-- Its test is supabase/tests/070_public_project_covers.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0114_public_project_covers.sql supabase/tests/070_public_project_covers.sql
--
-- WHY. public_projects() returns each offer's cover as a url and its Arabic description (alt_ar), but not
-- WHICH picture it is — and a picture's translated description lives under its id (translations, entity
-- project_media, 0109). So on the French catalogue the cover's description stayed Arabic: the one text of the
-- card a screen reader reads first. Changing public_projects()' return type would mean dropping it under every
-- page that reads it; this small companion names the cover instead, chosen by the SAME rule (is_cover first,
-- then the gallery order) and shown under the SAME visibility.

create or replace function public.public_project_covers()
returns table (project_id uuid, media_id uuid)
language sql stable security definer set search_path = '' as $$
  select pj.id, c.id
  from public.projects pj
  join lateral (
    select m.id
    from public.project_media m
    where m.project_id = pj.id
    order by m.is_cover desc, m.sort_order, m.created_at
    limit 1
  ) c on true
  where app.project_visible(pj.status)
$$;

revoke execute on function public.public_project_covers() from public;
grant execute on function public.public_project_covers() to anon, authenticated;
