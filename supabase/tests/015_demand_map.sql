-- WP-12 · Demand map: every active governorate has one tile, laid out north to south, coast to the east.
-- Spec v2: §55 (Analytics, Demand map), §47 («شنو أكثر ولاية مطلوبة؟»).

do $$
declare
  v_missing text;
  v_clash   bigint;
  v_admin   uuid := gen_random_uuid();
  v_com     uuid := gen_random_uuid();
begin
  select string_agg(g.name_fr, ', ' order by g.id) into v_missing
  from public.governorates g
  where g.is_active and (g.map_row is null or g.map_col is null);
  assert v_missing is null, 'every active governorate has a tile, missing: ' || coalesce(v_missing, '');

  assert (select count(*) from public.governorates
          where id in (11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 31, 32, 33, 34, 41, 42, 43, 51, 52, 53, 61, 62, 63)
            and map_row is not null) = 24,
    'the 24 INS governorates are all placed';

  select count(*) into v_clash from (
    select map_row, map_col from public.governorates where map_row is not null group by 1, 2 having count(*) > 1
  ) x;
  assert v_clash = 0, 'no two governorates share a tile';

  -- Rough geography: north above south, the coast east of the interior
  assert (select map_row from public.governorates where id = 17) < (select map_row from public.governorates where id = 53),
    'Bizerte is north of Tataouine';
  assert (select map_row from public.governorates where id = 11) < (select map_row from public.governorates where id = 34),
    'Tunis is north of Sfax';
  assert (select map_col from public.governorates where id = 22) < (select map_col from public.governorates where id = 15),
    'Jendouba is west of Nabeul';
  assert (select map_col from public.governorates where id = 42) < (select map_col from public.governorates where id = 31),
    'Kasserine is west of Sousse';

  -- The database refuses a second governorate on an occupied tile
  begin
    update public.governorates
    set map_row = (select map_row from public.governorates where id = 11),
        map_col = (select map_col from public.governorates where id = 11)
    where id = 12;
    raise exception 'expected a unique violation when two governorates share a tile';
  exception when unique_violation then null;
  end;

  -- A row without a column is not a tile
  begin
    update public.governorates set map_col = null where id = 12;
    raise exception 'expected a check violation for a row without a column';
  exception when check_violation then null;
  end;

  assert has_column_privilege('authenticated', 'public.governorates', 'map_row', 'select')
     and has_column_privilege('authenticated', 'public.governorates', 'map_col', 'select'),
    'staff read the tile positions';

  -- Only an admin moves a tile (governorates_admin_update)
  insert into auth.users (id, email) values
    (v_admin, 'map-admin-' || v_admin || '@test.local'),
    (v_com, 'map-com-' || v_com || '@test.local');
  update public.profiles set is_active = true where id in (v_admin, v_com);
  insert into public.user_roles (user_id, role) values (v_admin, 'admin'), (v_com, 'commercial');
  perform set_config('test.map_admin', v_admin::text, true);
  perform set_config('test.map_com', v_com::text, true);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.map_com'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  update public.governorates set map_row = 30, map_col = 30 where id = 53;
  assert not found, 'a commercial cannot move a tile';
  assert (select count(*) from public.governorates where map_row is not null) >= 24, 'staff see the tiles';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.map_admin'), 'role', 'authenticated')::text, true);

do $$
declare
  v_s jsonb := public.crm_demand_stats();
begin
  update public.governorates set map_row = 30, map_col = 30 where id = 53;
  assert found, 'an admin can move a tile';

  -- The map and the bar list read the same array, one entry per governorate
  assert jsonb_array_length(v_s->'by_invest_governorate') = (select count(*) from public.governorates),
    'the report has one entry per governorate for the map';
  assert jsonb_array_length(v_s->'by_governorate_trees') = jsonb_array_length(v_s->'by_invest_governorate'),
    'demands and trees by governorate cover the same governorates';
end $$;

reset role;
