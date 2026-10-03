-- صورة الغلاف بلغة الزائر. Migration supabase/migrations/0114_public_project_covers.sql. Rolled back.

do $$
begin
  if to_regprocedure('public.public_project_covers()') is null then
    raise exception
      'supabase/migrations/0114_public_project_covers.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0114_public_project_covers.sql supabase/tests/070_public_project_covers.sql';
  end if;
end $$;

-- The cover it names is the picture public_projects() draws: same url, for every visible offer.
update public.feature_flags set state = 'public' where key = 'projects';
-- Run as the migration owner with no signed-in user: app.is_staff() is false, so visibility is the public one.
do $$
begin
  assert not exists (
    select 1
    from public.public_projects() p
    join public.public_project_covers() c on c.project_id = p.id
    where p.cover_url is distinct from (select m.url from public.project_media m where m.id = c.media_id)),
    'the cover named is the cover drawn';
  assert (select count(*) from public.public_project_covers())
         = (select count(*) from public.public_projects() p where p.cover_url is not null),
    'one cover per visible offer that has one';
end $$;
