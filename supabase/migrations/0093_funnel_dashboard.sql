-- bb_74 · لوحة القيادة: الأرقام حسب المراحل — the funnel dashboard (§28) and the tree counts (§24).
--
-- Applied 2026-09-25 (was a draft under supabase/pending). It needs 0090_journey.sql, applied before it.
-- Its test re-runs against the live schema:
--   node --env-file=.env scripts/db-dry-run.mjs \
--     supabase/migrations/0090_journey.sql supabase/migrations/0093_funnel_dashboard.sql \
--     supabase/tests/060_funnel_dashboard.sql
-- Nothing in this file writes a row, moves a tree or changes a person's status. It is one read, and it
-- seeds no setting of its own: every word it returns is already the owner's, in a setting somebody else
-- created.
--
-- ---------------------------------------------------------------------------------------------------------
-- DEPENDS ON supabase/migrations/0090_journey.sql — AND THAT DEPENDENCY IS THE POINT
-- ---------------------------------------------------------------------------------------------------------
-- app.journey_spine() and app.person_stage() live in that draft. This file calls them and derives NOTHING
-- of its own, deliberately.
--
-- An earlier version of this file had its own thirteen-stage spine and its own CASE deciding where each
-- customer stands. It was deleted rather than merged. Two functions deriving the same stage is the exact
-- failure this whole screen exists to fix: today the dashboard and the client file disagree because one
-- reads a dropdown nobody updated, and shipping a second derivation would recreate that disagreement a
-- level up, where it would be harder to see — the funnel would say «8 at العربون مدفوع» and the client
-- file would say something else, both computed, both defensible, and nobody able to say which is the
-- product. So: one derivation, one spine, one set of labels. This file COUNTS. That is all it does.
--
-- If 0090_journey.sql is not applied, this file fails to create with «function app.person_stage(uuid) does
-- not exist», which is the right way to fail: loudly, at install time, not as a screen full of zeros.
--
-- ---------------------------------------------------------------------------------------------------------
-- WHY THIS FILE EXISTS AT ALL
-- ---------------------------------------------------------------------------------------------------------
-- §28 asks for nine counts side by side — new requests · contacted · interested · visits scheduled · visits
-- done · reservations · deposits paid · in contract · completed sales — plus the trees available / reserved
-- / sold. bb_70 answers «where is THIS customer». Nothing anywhere answers «where is the BOOK», and the two
-- are different questions: one is a lookup, the other is a shape.
--
-- §28'S NINE, AGAINST THE THIRTEEN STAGES OF bb_70, so the owner's list can be checked off:
--   new requests → lead · contacted → contacted · interested → qualified · visits scheduled →
--   visit_scheduled · visits done → visit_completed · reservations → reservation · deposits paid →
--   deposit_paid · in contract → legal_processing + contract_scheduled + contract_signed · completed sales
--   → sale_completed. The thirteenth, `owner`, is §30's after-sales, which §28 does not ask for and the file
--   does not close without.
--
-- ---------------------------------------------------------------------------------------------------------
-- THE TWO FIGURES, AND WHY THE SECOND ONE IS THE WHOLE FEATURE
-- ---------------------------------------------------------------------------------------------------------
-- `at`      — how many files stand at this stage right now.
-- `reached` — how many stand at it OR BEYOND it: the suffix sum of `at` down the spine.
--
-- Nine numbers in a row answer «how many are at each stage» and hide the only question worth asking of a
-- pipeline: WHERE DOES IT STOP. With `reached` the drop between two stages IS the `at` of the upper one —
-- the people sitting at a stage are exactly the people who did not go further — so one honest figure
-- carries both readings, and a screen can draw the narrowing instead of describing it.
--
-- Three shares come out of the same window so that no screen ever multiplies two percentages: `share` is
-- the whole bar (reached, against the top of the funnel), `at_share` is its tail (the loss), and
-- `pass_share` is the rest — near enough the next stage's bar, and drawn as the part of this one that
-- moved on. `pass_share` is `share - at_share` and not a third rounding, so that the two pieces always
-- FILL the bar exactly; the reason is spelled out where it is computed.
--
-- THIS IS A SNAPSHOT FUNNEL, NOT A COHORT FUNNEL. It says where the book stands today. It cannot say «of
-- the 100 leads that arrived in March, 12 reached a deposit»: that needs a per-stage timestamp for every
-- file, and public.person_status_history records only the dropdown, which is the thing this screen exists
-- to stop trusting. Do not add a date filter to this function and present the result as a conversion rate.
--
-- ---------------------------------------------------------------------------------------------------------
-- ABSENT IS NOT ZERO
-- ---------------------------------------------------------------------------------------------------------
-- bb_70's spine marks two of the thirteen `has_fact: false` — «مؤهَّل», because public.contact_outcome
-- carries no value meaning «مؤهل للزيارة», and «موعد العقد محدد», because §19's closing appointment has no
-- table anywhere. app.person_stage() never returns either key, so counting them would report 0.
--
-- 0 WOULD BE A LIE OF THE WORST KIND: it reads as a statement about the business — «nobody is qualified»,
-- «no contract appointments this month» — when it is a statement about a missing column. Both stages return
-- null for `at`, `reached` and all three shares, and the screen draws «—» with the spine's own `fact_ar`
-- underneath saying what is missing, in the owner's Arabic, from bb_70 and not from a .tsx file.
--
-- Nobody is lost by this: a file the human marked «مؤهَّل» is derived at whatever fact it does have, and a
-- file waiting for its signing appointment is counted at «في القسم القانوني». The suffix sums below are
-- computed over all thirteen and only the DISPLAY of the two is withheld, so `reached` on the stage above
-- an absent one still equals the bar of the stage below it and the funnel's chain is unbroken.
--
-- ---------------------------------------------------------------------------------------------------------
-- WHAT IS COUNTED, AND WHAT IS NOT
-- ---------------------------------------------------------------------------------------------------------
-- PEOPLE and TREES, both as rows. Not one millime is read here. The deposit, the plan and the arrears
-- ladder are Finance's screens and they already exist; a second definition of «المدفوع» on a dashboard is
-- how two screens start disagreeing.
--
-- Files a human PARKED are not in the funnel. «غير مهتم حالياً» and «مغلق» are the two things a person says
-- that no fact can say, and bb_70's app.person_human_status already names them `is_parked`. Leaving them at
-- the top of the funnel would inflate «مطلب جديد» with files nobody intends to work. They are counted
-- separately, and where a parked file still holds trees or a contract that contradiction gets its own
-- number rather than being quietly dropped.
--
-- Where the dropdown and the facts disagree, that too is COUNTED AND NOT RESOLVED — `agrees` comes from
-- bb_70. persons.status_id stays the human override; nothing here writes it and no trigger is added that
-- would, because a trigger would fill person_status_history with changes nobody performed.
--
-- ---------------------------------------------------------------------------------------------------------
-- ACCESS (§27)
-- ---------------------------------------------------------------------------------------------------------
-- app.is_admin() and nothing else. This function counts EVERY file in the company, so it must not ride on
-- app.can_see_person the way the list screens do: narrowing the ROWS would not narrow the ANSWER, and a
-- security definer aggregating rows a commercial may not read would hand them the company's pipeline. §28
-- calls it the ADMIN dashboard. The page above it checks ADMIN_ROLES again before calling.
--
-- A commercial's own funnel is a real want and is deliberately not here: it needs a p_owner argument pinned
-- to auth.uid(), and it belongs with the call-centre role split, not before it — today one `commercial`
-- role is both the phone agent and the field commercial, so «my funnel» has no team to belong to.
--
-- COST, MEASURED AND NOT GUESSED. app.person_stage() is called once per person and reads in rank order
-- until a fact answers, so a new lead costs the whole ladder of nine lookups and an owner costs one. On the
-- live book — 20 people, all but one of them a bare lead, 8,600 trees — the whole call takes about 300ms.
-- That is fine for an admin screen loaded once and it is NOT fine at ten thousand files: this is O(n) in
-- people, with the worst case on exactly the population that grows fastest.
--
-- WHEN IT GETS SLOW, THE FIX IS IN bb_70 AND NOT HERE. Making app.person_stage set-returning — one pass
-- that places every person — would speed this up and every list screen with it, and it would keep ONE
-- derivation. Re-deriving the stage set-wise in this file would be fast and would recreate the exact
-- disagreement this screen exists to end. Do not do it.

-- ---------------------------------------------------------------------------
-- public.admin_funnel_stats() — the whole screen in one answer
-- ---------------------------------------------------------------------------
-- ONE call on purpose. /admin assembles its tiles from six separate reads, so no two numbers on it are
-- guaranteed to come from the same moment. A funnel whose stage 7 was counted after stage 6 can show more
-- people further down than exist further up, which is the one thing a funnel must never do.
create or replace function public.admin_funnel_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  -- §27. Two layers: the page checks ADMIN_ROLES, and this refuses anyone else even by direct RPC.
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with
  -- THE SPINE, as bb_70 publishes it: rank, key, the owner's label, the lead_stage it maps onto, whether a
  -- fact can prove it, and the Arabic sentence describing that fact. Nothing is redefined here.
  spine as (
    select
      (s ->> 'rank')::integer      as rank,
      s ->> 'key'                  as stage_key,
      s ->> 'label'                as label,
      s ->> 'lead_stage'           as lead_stage,
      (s ->> 'has_fact')::boolean  as has_fact,
      s ->> 'fact_ar'              as fact_ar
    from jsonb_array_elements(app.journey_spine()) s
  ),

  -- EVERY PERSON, PLACED BY bb_70 AND BY NOTHING ELSE. app.person_stage returns the one stage its facts
  -- prove; app.person_human_status returns what the dropdown says and whether the two agree.
  placed as (
    select
      p.id,
      j.stage ->> 'key'                   as stage_key,
      j.stage ->> 'lead_stage'            as derived_lead_stage,
      (h.human ->> 'is_parked')::boolean  as is_parked,
      (h.human ->> 'agrees')::boolean     as agrees
    from public.persons p
    cross join lateral (select app.person_stage(p.id) as stage) j
    cross join lateral (select app.person_human_status(p.id, j.stage ->> 'lead_stage') as human) h
  ),

  tallied as (
    select s.*, coalesce(c.n, 0)::integer as at_count
    from spine s
    left join (
      -- Parked files are out of the funnel, so they are out of every stage count too.
      select pl.stage_key, count(*) as n from placed pl where not pl.is_parked group by 1
    ) c on c.stage_key = s.stage_key
  ),

  -- reached = at-or-beyond, the suffix sum down the spine. Computed over ALL thirteen, including the two
  -- with no fact (which contribute 0), so that the stage above an absent one still passes exactly the bar
  -- of the stage below it and the chain of bars is unbroken. Summed HERE and nowhere above it.
  windowed as (
    select
      t.*,
      sum(t.at_count) over (order by t.rank desc rows between unbounded preceding and current row)::integer as reached
    from tallied t
  ),

  shaped as (
    select
      w.*,
      max(w.reached) over () as top_reached,
      -- THE BLOCKAGE: the stage holding the most files, among the stages people are supposed to leave.
      -- Ranked rather than compared against a maximum, because two stages can hold the same number and an
      -- `at_count = max(at_count)` test would flag both — the screen names one blockage in its heading and
      -- would then mark two rows, which is how a dashboard stops being believed. A tie goes to the EARLIER
      -- stage: the pipeline breaks at the first place it breaks. Ineligible rows — the last two, where
      -- standing still is the right answer, the two with no fact, and anything holding nobody — are sorted
      -- to the end so none of them can take rank 1.
      row_number() over (
        order by case when w.rank >= 12 or not w.has_fact or w.at_count = 0 then 1 else 0 end,
                 w.at_count desc,
                 w.rank
      ) as block_rank
    from windowed w
  ),

  -- The files a human took out of the funnel, and the ones where that decision contradicts the facts: a
  -- file marked «مغلق» whose derived stage is already at trees, a hold or a contract is somebody's mistake
  -- and is worth one number. Read off the derivation rather than by querying the tables again, so there is
  -- no second opinion about what «still committed» means.
  departed as (
    select
      count(*) filter (where pl.is_parked and pl.derived_lead_stage in ('reserved', 'contracting', 'owner'))::integer as conflicts,
      count(*) filter (where pl.is_parked)::integer     as parked,
      count(*) filter (where not pl.is_parked
                         and not pl.agrees)::integer    as mismatch
    from placed pl
  ),

  -- «غير مهتم حالياً» and «مغلق» told apart, in the owner's own words from his own table, because those two
  -- are a very different piece of news and lead_statuses is where their names live.
  parked_by_stage as (
    select coalesce(jsonb_object_agg(x.label, x.n), '{}'::jsonb) as rows
    from (
      select ls.label_ar as label, count(*)::integer as n
      from public.persons p
      join public.lead_statuses ls on ls.id = p.status_id
      where ls.stage in ('paused', 'closed')
      group by 1
    ) x
  ),

  -- §24. The three counts, from the trees' own status and from nothing else. Their Arabic is the owner's
  -- (offers.stock_*_label), the same settings the offer page and the public stock card already read, so a
  -- rename lands on every screen at once. No label is invented here.
  stock as (
    select
      count(*)::integer                                      as total,
      count(*) filter (where t.state = 'available')::integer as available,
      count(*) filter (where t.state = 'reserved')::integer  as reserved,
      count(*) filter (where t.state = 'sold')::integer      as sold
    from public.trees t
  )

  select jsonb_build_object(
    'generated_at', now(),
    'people_total', (select count(*)::integer from public.persons),
    'in_funnel',    (select coalesce(max(reached), 0) from shaped),
    'mismatch',     (select mismatch from departed),
    'left_funnel', jsonb_build_object(
      'total',     (select parked from departed),
      'conflicts', (select conflicts from departed),
      'by_status', (select rows from parked_by_stage)
    ),
    'stages', (
      select jsonb_agg(
        jsonb_build_object(
          'key',        sh.stage_key,
          'label',      sh.label,
          'lead_stage', sh.lead_stage,
          'has_fact',   sh.has_fact,
          'fact_ar',    sh.fact_ar,
          -- The last two stages of §29/§30: the file arriving there is the point, so standing still is not
          -- a loss and the screen must not paint one.
          'is_win',     sh.rank >= 12,
          -- ABSENT IS NOT ZERO — see the header. A stage no fact can prove answers null for every figure.
          'at',         case when sh.has_fact then sh.at_count else null end,
          'reached',    case when sh.has_fact then sh.reached  else null end,
          'share',      case
                          when not sh.has_fact or sh.top_reached = 0 then null
                          else round(100.0 * sh.reached / sh.top_reached)::integer
                        end,
          -- The tail of that bar: the part that went no further.
          'at_share',   case
                          when not sh.has_fact or sh.top_reached = 0 then null
                          else round(100.0 * sh.at_count / sh.top_reached)::integer
                        end,
          -- And the rest of it — the people who did go further, which is what the next drawn bar shows.
          -- SUBTRACTED FROM THE BAR, NOT ROUNDED SEPARATELY. Rounding all three independently is wrong and
          -- it is wrong in a way that shows: round(x) + round(y) can be round(x+y) ± 1, so the two pieces
          -- would sometimes be one percent wider or narrower than the bar they are supposed to fill, and
          -- the reader would see a hairline gap or a segment spilling past the end. Subtracting two
          -- integers makes «the pieces fill the bar» true by construction, at the cost of pass_share being
          -- up to one percent off the bar below it, which nothing can see. It is still given here rather
          -- than left to the screen, so no component does arithmetic to draw one.
          'pass_share', case
                          when not sh.has_fact or sh.top_reached = 0 then null
                          else round(100.0 * sh.reached / sh.top_reached)::integer
                               - round(100.0 * sh.at_count / sh.top_reached)::integer
                        end,
          -- Of everyone who got this far, the share sitting here and going no further.
          'stuck',      case
                          when not sh.has_fact or sh.reached = 0 then null
                          else round(100.0 * sh.at_count / sh.reached)::integer
                        end,
          'is_block',   sh.block_rank = 1 and sh.has_fact and sh.rank < 12 and sh.at_count > 0
        )
        order by sh.rank
      )
      from shaped sh
    ),
    'trees', (
      select jsonb_build_object(
        'total',           st.total,
        'total_label',     app.setting_text('offers.stock_total_label', 'إجمالي الزيتونات'),
        'available',       st.available,
        'available_label', app.setting_text('offers.stock_available_label', 'المتاحة'),
        'reserved',        st.reserved,
        'reserved_label',  app.setting_text('offers.stock_reserved_label', 'المحجوزة'),
        'sold',            st.sold,
        'sold_label',      app.setting_text('offers.stock_sold_label', 'المباعة')
      )
      from stock st
    )
  ) into v_payload;

  return v_payload;
end
$$;

revoke execute on function public.admin_funnel_stats() from public, anon;
grant execute on function public.admin_funnel_stats() to authenticated;

comment on function public.admin_funnel_stats() is
  'لوحة القيادة: الأرقام حسب المراحل (§28) + عدّ الزيتونات (§24). COUNTS the thirteen stages of bb_70_journey — it derives nothing itself and calls app.person_stage() per person so the dashboard and the client file can never disagree. `at` is who stands at a stage, `reached` who stands at it or beyond (the suffix sum), and share/at_share/pass_share are the bar, its tail and the rest, all rounded from the counts here so no screen multiplies percentages. The two stages bb_70 marks has_fact:false answer null, never 0. Files a human parked are outside the funnel and counted apart, with the contradictions named. Tree counts come from public.trees.state with the owner''s own offers.stock_* labels. Admin and Super Admin only: it counts every file in the company and so cannot ride on app.can_see_person.';
