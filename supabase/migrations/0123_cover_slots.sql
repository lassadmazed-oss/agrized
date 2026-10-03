-- 0123 — the cover slider stops being a constant in the code.
--
-- Owner, 2026-10-03: «in the cover giv me in the admin some acsess to manige the imges of the cover thing
-- that is auto sliding».
--
-- WHAT IT IS TODAY. The sliding cover on the home page runs over five slots named in a TypeScript array:
--
--     src/components/site/landing/hero.tsx
--     export const HERO_SLOTS = ["home.hero", "home.journey", "home.coverage", "home.land", "home.closing"]
--
-- The owner can already REPLACE any of those five pictures from الإعدادات ← صور الموقع. What he cannot do is
-- decide WHICH pictures are in the slider at all, or in what order — that needs a developer and a deploy,
-- which is exactly what this project's first rule says must never be true of a business decision:
-- «Never hard-code business values … Read them from settings». A list of photographs on the front page is
-- about as business a decision as this product has.
--
-- WHAT THIS CHANGES. One boolean on public.site_media. A slot with in_cover = true is in the slider; the
-- order is the sort_order the table already carries and the Back Office already sorts by, so there is no
-- second ordering to keep in step with the first.
--
-- WHY NOT A SETTING HOLDING A LIST. `site.hero_slots` as a JSON array would have been fewer lines and it
-- would rot: a slot deleted from site_media would stay in the array, pointing at nothing, and the slider
-- would render a gap that no screen in the Back Office could explain. A column on the row itself cannot
-- outlive its row.

alter table public.site_media
  add column if not exists in_cover boolean not null default false;

comment on column public.site_media.in_cover is
  'Does this picture appear in the home page''s sliding cover? The order is sort_order, the same one the Back Office lists by. Seeded true for exactly the five slots HERO_SLOTS named in code, so applying this changes nothing a visitor sees — it only moves the decision out of the source and onto a checkbox.';

-- The five that are in the slider today, named here so applying this file is a no-op on screen. Matched on
-- the slot key rather than on group_key: `home` also holds pictures that were never in the slider, and
-- widening it would silently add them the moment this is applied.
update public.site_media
   set in_cover = true
 where slot in ('home.hero', 'home.journey', 'home.coverage', 'home.land', 'home.closing');

-- ---------------------------------------------------------------------------
-- The act: a staff member turns a picture on or off in the cover
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_media_cover(p_slot text, p_in_cover boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_slot public.site_media;
  v_url  text;
begin
  -- Same gate as every other act on this table: صور الموقع is an administrator's screen.
  if not app.has_any_role(array['admin', 'super_admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_slot from public.site_media m where m.slot = p_slot for no key update;
  if not found then
    raise exception 'media_slot_not_found' using errcode = 'P0001';
  end if;

  -- A slot with no picture cannot be in the slider: it would render the brand drawing mid-rotation, which
  -- reads as a broken image rather than as a deliberate placeholder. Upload first, then add it.
  if coalesce(p_in_cover, false) and nullif(btrim(coalesce(v_slot.url, '')), '') is null then
    raise exception 'media_slot_empty' using errcode = 'P0001';
  end if;

  update public.site_media m
     set in_cover = coalesce(p_in_cover, false), updated_at = now(), updated_by = auth.uid()
   where m.slot = p_slot;

  -- The slider needs at least one picture. Emptying it entirely would leave the home page opening on a
  -- blank frame, so the last one cannot be removed — the way out is to put another one in first.
  if not exists (select 1 from public.site_media m where m.in_cover and m.url is not null) then
    raise exception 'media_cover_empty' using errcode = 'P0001';
  end if;

  perform app.write_audit('site_media.cover', 'site_media', p_slot,
                          to_jsonb(v_slot),
                          jsonb_build_object('in_cover', coalesce(p_in_cover, false)), null);

  select count(*)::text into v_url from public.site_media m where m.in_cover and m.url is not null;
  return jsonb_build_object('ok', true, 'slot', p_slot, 'in_cover', coalesce(p_in_cover, false), 'in_cover_count', v_url::integer);
end $$;

revoke execute on function public.staff_set_media_cover(text, boolean) from public, anon;
grant execute on function public.staff_set_media_cover(text, boolean) to authenticated;

comment on function public.staff_set_media_cover(text, boolean) is
  'Adds a picture to the home page''s sliding cover or takes it out. Administrators only. Refuses a slot with no image (media_slot_empty) and refuses to empty the slider (media_cover_empty), because both leave the home page opening on a blank frame.';
