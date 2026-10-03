-- 074 — the home page's sliding cover is the owner's choice, not a constant (0123).
--
-- ███ This file FAILS under `npm run db:test` until supabase/migrations/0123_cover_slots.sql is applied, the
-- ███ same way 071 did before 0118 landed. To run the two together without applying anything:
-- ███   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0123_cover_slots.sql supabase/tests/074_cover_slots.sql
--
-- What matters here is not that a boolean can be flipped. It is that the two states which would open the
-- home page on a blank frame are refused BY THE DATABASE — an empty slot cannot join the slider, and the
-- slider cannot be emptied — because the Back Office draws a control, and a control is not a rule.

do $$
begin
  if to_regprocedure('public.staff_set_media_cover(text, boolean)') is null then
    raise exception
      '0123 is not applied. Run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0123_cover_slots.sql supabase/tests/074_cover_slots.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1 · The seed reproduces today's slider exactly, so applying it changes nothing on screen
-- ---------------------------------------------------------------------------

do $$
declare
  v_in_cover text[];
  v_expected text[] := array['home.hero', 'home.journey', 'home.coverage', 'home.land', 'home.closing'];
begin
  select array_agg(m.slot order by m.sort_order) into v_in_cover
  from public.site_media m where m.in_cover;

  assert v_in_cover @> v_expected and v_expected @> v_in_cover,
    '0123 must seed exactly the five slots HERO_SLOTS named in code, got ' || coalesce(v_in_cover::text, '{}');

  -- The order the slider rotates in is sort_order, and it must be the one the Back Office lists by.
  assert (select array_agg(m.slot order by m.sort_order) from public.site_media m where m.in_cover)
         = array['home.hero', 'home.journey', 'home.coverage', 'home.land', 'home.closing'],
    'the cover must rotate in sort_order, which is the order الإعدادات ← صور الموقع shows';
end $$;

-- ---------------------------------------------------------------------------
-- 2 · Permissions: this is an administrator's screen, and anon cannot reach it at all
-- ---------------------------------------------------------------------------

do $$
begin
  assert not has_function_privilege('anon', 'public.staff_set_media_cover(text, boolean)', 'execute'),
    'a visitor must not be able to change what the home page shows';
end $$;

-- ---------------------------------------------------------------------------
-- 3 · The two refusals that protect the front page
-- ---------------------------------------------------------------------------
--
-- AS A REAL ADMINISTRATOR, and that is the point. Written first with `forbidden` accepted beside each
-- expected code, which made every assertion below pass without the function ever reaching its own rules:
-- the runner holds no JWT, app.has_any_role answers false, and the role check refuses before anything
-- interesting happens. A test that passes for the wrong reason is worse than no test. Now it signs in.

do $$
declare v_admin uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_admin, 'cover-admin@test.local');
  update public.profiles set full_name = 'Admin Cover', is_active = true where id = v_admin;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  perform set_config('test.cover_admin', v_admin::text, true);
end $$;

set local role authenticated;

do $$
declare
  v_empty text;
  v_err   text;
  v_count integer;
begin
  -- A slot with no picture. `start.side` ships empty; if someone has filled it, make a throwaway one.
  select m.slot into v_empty from public.site_media m where m.url is null limit 1;
  if v_empty is null then
    insert into public.site_media (slot, label_ar, aspect, group_key, sort_order)
    values ('test.empty_slot', 'موضع فارغ للاختبار', '16/9', 'test', 999)
    returning slot into v_empty;
  end if;

  -- ... cannot join the slider: mid-rotation it would draw the brand placeholder and read as a broken image.
  begin
    perform public.staff_set_media_cover(v_empty, true);
    raise exception 'a slot with no picture was allowed into the cover';
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      assert v_err = 'media_slot_empty',
        'an empty slot must be refused with media_slot_empty, got ' || v_err
        || ' (forbidden here means the test is not signed in and is proving nothing)';
  end;

  -- ... and the slider cannot be emptied. Take four of the five out, then prove the fifth refuses.
  select count(*)::integer into v_count from public.site_media m where m.in_cover and m.url is not null;
  assert v_count = 5, 'expected the five seeded slots, got ' || v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · The last picture cannot be removed
-- ---------------------------------------------------------------------------

-- Emptied directly rather than through the function, because the function is what we are testing: this sets
-- up the «one left» state the way a run of successful removals would, then asks the function for one more.
update public.site_media set in_cover = (slot = 'home.hero');

do $$
declare
  v_err   text;
  v_left  integer;
begin
  select count(*)::integer into v_left from public.site_media m where m.in_cover and m.url is not null;
  assert v_left = 1, 'setup: exactly one picture should be left in the cover, got ' || v_left;

  begin
    perform public.staff_set_media_cover('home.hero', false);
    raise exception 'the cover was emptied — the home page would open on a blank frame';
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      assert v_err = 'media_cover_empty',
        'removing the last picture must raise media_cover_empty, got ' || v_err
        || ' (forbidden here means the test is not signed in and is proving nothing)';
  end;

  -- It is still there: a refused act changes nothing.
  select count(*)::integer into v_left from public.site_media m where m.in_cover and m.url is not null;
  assert v_left = 1, 'a refused removal must leave the row alone, got ' || v_left;
end $$;

-- ---------------------------------------------------------------------------
-- 5 · An unknown slot is a named refusal, not a silent no-op
-- ---------------------------------------------------------------------------

do $$
declare v_err text;
begin
  begin
    perform public.staff_set_media_cover('no.such.slot', true);
    raise exception 'an unknown slot was accepted';
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      assert v_err = 'media_slot_not_found',
        'an unknown slot must raise media_slot_not_found, got ' || v_err
        || ' (forbidden here means the test is not signed in and is proving nothing)';
  end;
end $$;
