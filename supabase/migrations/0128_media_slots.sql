-- 0128 · مواضع صور جديدة — the owner can add his own picture slots, and take them back out.
--
-- Its test is supabase/tests/078_media_slots.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0128_media_slots.sql supabase/tests/078_media_slots.sql
--
-- THE OWNER'S REQUEST (2026-10-05, on /admin/settings/media): «i want more option to add».
--
-- The six slots he was looking at are rows of public.site_media, so «more» has always been one INSERT away —
-- except that site_media carries a read policy and an UPDATE policy and nothing else, so no admin could ever
-- add or remove one. That is the whole reason the page has no «add» button.
--
-- WHY TWO RPCs AND NOT TWO RLS POLICIES. Three of the rules below cannot be seen from the row being written:
--   · the slot KEY has to be unique and safe for a storage path, and the owner writes Arabic labels, which do
--     not slugify — so the key is generated here rather than typed;
--   · a seeded slot must never be deletable. home.hero and start.side are rendered by name in the code
--     (SitePhoto slot="…"), and deleting one would quietly empty a section of the site. Only slots the owner
--     added himself may go, which is what `is_custom` marks;
--   · the sliding cover may not be emptied — the home page would open on a blank frame. That rule already
--     lives in staff_set_media_cover (0123) and is only knowable by counting the OTHER rows, so a delete has
--     to answer it too.
-- A checkbox that is merely disabled is not a rule, and neither is a policy that cannot count.

alter table public.site_media
  add column if not exists is_custom boolean not null default false;

comment on column public.site_media.is_custom is
  'True for a slot the owner added from the Back Office. Only these may be deleted: the seeded ones are rendered by name in the code.';

-- A picture the owner adds is for the sliding cover, which is the one place that shows a slot nothing names.
create or replace function public.staff_create_media_slot(
  p_label       text,
  p_description text default null,
  p_aspect      text default '4/3'
) returns public.site_media
language plpgsql security definer set search_path = '' as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_slot  text;
  v_next  integer;
  v_row   public.site_media;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if length(v_label) < 2 then
    raise exception 'label_required' using errcode = 'P0001',
      hint = 'Give the slot a name so it can be told apart on the pictures screen.';
  end if;
  if length(v_label) > 80 then
    raise exception 'label_too_long' using errcode = 'P0001';
  end if;

  -- The aspect list is the table's own CHECK; naming it again here would be the same rule in two places.
  if p_aspect is null or p_aspect not in ('16/9', '3/2', '4/3', '1/1', '3/4', '2/3') then
    raise exception 'invalid_aspect' using errcode = 'P0001';
  end if;

  -- `custom.N`, counted over the ones that already exist. The key becomes a folder in the storage bucket, so
  -- it stays ASCII whatever the label says.
  select coalesce(max(substring(m.slot from '^custom\.(\d+)$')::integer), 0) + 1
    into v_next
    from public.site_media m
   where m.slot ~ '^custom\.\d+$';
  v_slot := 'custom.' || v_next;

  insert into public.site_media (slot, label_ar, description_ar, aspect, group_key, sort_order, is_custom, updated_by)
  values (v_slot, v_label, nullif(btrim(coalesce(p_description, '')), ''), p_aspect, 'home',
          1000 + v_next, true, auth.uid())
  returning * into v_row;

  return v_row;
end $$;

revoke execute on function public.staff_create_media_slot(text, text, text) from public, anon;
grant execute on function public.staff_create_media_slot(text, text, text) to authenticated;

-- Removing one. The caller deletes the picture FILE afterwards: this only owns the row.
create or replace function public.staff_delete_media_slot(p_slot text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row       public.site_media;
  v_in_cover  integer;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_row from public.site_media m where m.slot = p_slot for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not v_row.is_custom then
    raise exception 'slot_is_builtin' using errcode = 'P0001',
      hint = 'This slot is rendered by name on the site. Empty its picture instead of deleting it.';
  end if;

  -- The same rule staff_set_media_cover enforces, checked under the row lock: the slider may not be emptied.
  if v_row.in_cover then
    select count(*) into v_in_cover
      from public.site_media m
     where m.in_cover and m.url is not null and m.slot <> p_slot;
    if v_in_cover = 0 then
      raise exception 'cover_would_be_empty' using errcode = 'P0001',
        hint = 'Take this slot out of the cover and put another one in first.';
    end if;
  end if;

  delete from public.site_media m where m.slot = p_slot;
  return jsonb_build_object('ok', true, 'slot', v_row.slot, 'url', v_row.url);
end $$;

revoke execute on function public.staff_delete_media_slot(text) from public, anon;
grant execute on function public.staff_delete_media_slot(text) to authenticated;
