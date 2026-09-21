-- Pending · The counter can say how much land is behind it (owner, 2026-09-21, from the AgriZed phone mock-up).
--
-- The mock-up's home screen carries four tiles — زيتونة · مستثمر · هكتار · ولاية — in a 2×2 grid. Three already
-- have an honest source in public.million_progress(); «هكتار» had none, so the grid could only be drawn as three
-- tiles with one spanning the row — the exact shape the owner called ugly on the hero band an hour earlier.
--
-- The area is real and already in the database: public.projects.total_area_m2. What was missing was somewhere
-- honest to read it from. It goes in the function that already aggregates for this counter rather than being
-- summed in the page, because a figure summed in TypeScript is a figure that can quietly disagree with the one
-- the Back Office shows.
--
-- WHAT IT COUNTS: the land of the offers a VISITOR CAN SEE — published, sold out, operating. Not draft,
-- preparing or internal, which are already counted as `projects_under_study` and are land nobody has been
-- shown. In square metres, as every other area here is; the screen converts for display with formatArea, so no
-- rounding decision is taken in SQL.
--
-- THE BODY BELOW IS THE LIVE DEFINITION, read with pg_get_functiondef and changed in exactly one place. It is
-- not the one in 0059: that file's CASE returned '{}' for a closed module, and the live one returns NULL and
-- also answers a session with no JWT at all (migrations, tests, scripts). Test 011 asserts the NULL. Copying
-- the older shape by hand would have silently reverted that, which is how this file was written the first time
-- and why it is generated now.

CREATE OR REPLACE FUNCTION public.million_progress()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    -- A direct database session carries no JWT (migrations, tests, scripts) and always reads.
    when app.module_open('public_statistics')
      or coalesce(current_setting('request.jwt.claims', true), '') = ''
    then (
      select jsonb_build_object(
        'goal', app.setting_int('million.goal', 0),
        -- Lower bound of every stated choice, so the figure is never larger than what people asked for.
        'trees_requested', coalesce((
          select sum(r.tree_count_min) from public.interest_requests r where not r.is_duplicate
        ), 0),
        'participants', (
          select count(distinct r.person_id) from public.interest_requests r
        ),
        'requests', (select count(*) from public.interest_requests r where not r.is_duplicate),
        -- Land being studied before anything is offered: draft, preparing and internal projects.
        'projects_under_study', (
          select count(*) from public.projects pj
          where pj.status in ('draft', 'preparing', 'internal')
        ),
        -- The land behind the offers a visitor can actually see, in square metres (bb_50).
        'area_offered_m2', coalesce((
          select sum(pj.total_area_m2) from public.projects pj
          where pj.status in ('published', 'sold_out', 'operating')
        ), 0),
        'trees_reserved', t.reserved,
        'trees_contracted', t.contracted,
        'trees_planted', t.planted
      )
      from (
        select
          count(*) filter (where tr.state = 'reserved')  as reserved,
          -- public.tree_state holds no 'contracting': a tree is sold or it is not. The tile's hint is
          -- reworded in §2 so the word on screen says only what this counts.
          count(*) filter (where tr.state = 'sold')      as contracted,
          -- «مغروسة / موجودة فعلياً» is a fact about the land, so the offer's status decides, exactly as
          -- it did before this rewrite. An offer in 'operating' whose trees were never numbered adds 0;
          -- that gap is visible in the Back Office as «عروض ما ترقّمتش زيتوناتها», which is where it belongs.
          count(*) filter (where pj.status = 'operating') as planted
        from public.trees tr
        join public.projects pj on pj.id = tr.project_id
      ) t
    )
  end
$function$
;

revoke execute on function public.million_progress() from public;
grant execute on function public.million_progress() to anon, authenticated;

comment on function public.million_progress() is
  'The public counter (MIL-01), gated on the public_statistics module. Trees requested, people, requests, '
  'projects under study, the area of the visible offers in m² (bb_50), and the tree states counted from '
  'public.trees. Carries no money key: stock and land are facts, price is a permission (PRJ-03).';
