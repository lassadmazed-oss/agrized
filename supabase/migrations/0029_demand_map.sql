-- WP-12 · Demand map (spec v2 §55): every governorate gets a tile in a cartogram of Tunisia.
--
-- A tile grid needs no outside geometry, so nothing is downloaded and nothing leaves the Back Office.
-- Rows run north to south and columns west to east, so the coast sits on the east side of the grid.
-- The figures on the map come from public.crm_demand_stats, the same numbers as the bar list beside it.

alter table public.governorates
  add column if not exists map_row smallint,
  add column if not exists map_col smallint;

alter table public.governorates
  add constraint governorates_map_tile_range
    check ((map_row is null or map_row between 1 and 30) and (map_col is null or map_col between 1 and 30)),
  add constraint governorates_map_tile_pair
    check ((map_row is null) = (map_col is null));

-- Two governorates on one tile would hide one of them.
create unique index if not exists governorates_map_tile_idx
  on public.governorates (map_row, map_col) where map_row is not null;

comment on column public.governorates.map_row is
  'Row of the tile on the Back Office demand map, 1 = north. A layout position, not a coordinate.';
comment on column public.governorates.map_col is
  'Column of the tile on the Back Office demand map, 1 = west. A layout position, not a coordinate.';

update public.governorates g
set map_row = v.map_row, map_col = v.map_col
from (values
  (17, 1, 4),  -- Bizerte
  (12, 1, 5),  -- Ariana
  (22, 2, 2),  -- Jendouba
  (21, 2, 3),  -- Béja
  (14, 2, 4),  -- Manouba
  (11, 2, 5),  -- Tunis
  (23, 3, 2),  -- Le Kef
  (24, 3, 3),  -- Siliana
  (16, 3, 4),  -- Zaghouan
  (13, 3, 5),  -- Ben Arous
  (15, 3, 6),  -- Nabeul
  (42, 4, 2),  -- Kasserine
  (43, 4, 3),  -- Sidi Bouzid
  (41, 4, 4),  -- Kairouan
  (31, 4, 5),  -- Sousse
  (32, 4, 6),  -- Monastir
  (61, 5, 2),  -- Gafsa
  (34, 5, 5),  -- Sfax
  (33, 5, 6),  -- Mahdia
  (62, 6, 1),  -- Tozeur
  (63, 6, 2),  -- Kébili
  (51, 6, 4),  -- Gabès
  (52, 7, 5),  -- Médenine
  (53, 8, 4)   -- Tataouine
) as v (id, map_row, map_col)
where g.id = v.id;
