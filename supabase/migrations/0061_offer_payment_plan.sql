-- bb · An offer request carries its payment plan, and the offer publishes what it allows
-- (owner, 2026-09-19, looking at TX-00215: «in the form its missing the payment method like the main form …
--  finally I told you each offer has its own stuff so take that into consideration»).
--
-- ███ DO NOT APPLY. This is a draft: the session owner reads it and applies it. Dry-run, read-only:
-- ███   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_10_offer_payment_plan.sql \
-- ███                                               supabase/tests/035_offer_payment_plan.sql
-- ███ It sorts after bb_01, bb_02 and bb_03 and is independent of all three: it touches no parcel object.
--
-- WHAT IS BROKEN TODAY, verified on the live database (2026-09-19).
--   select request_kind, count(*), count(payment_mode), count(duration_months), count(monthly_millimes)
--   from public.interest_requests group by 1;
--     offer       4 rows · 0 · 0 · 0
--     calculator 28 rows · 20 · 20 · 15
-- Thirteen plan columns have existed on public.interest_requests since 0032 and public.submit_interest_request
-- fills them. public.submit_offer_request does not, for one reason, at 0054_trees.sql:811:
--     v_quote := app.project_quote_payload(v_project.id, null, v_trees, 'cash', null, null, false);
-- 'cash' is a literal and both option ids are null, so an offer demand is priced as a cash demand whatever the
-- visitor wanted, and the INSERT lists none of the plan columns. A commercial calling back «200 زيتونة على
-- TX-00215» cannot know the caller asked to pay over seven years — nobody ever asked, and nothing was recorded.
--
-- WHAT THIS FILE DOES, in one sentence per section:
--   §1  public.projects gains allows_installments — the one state an offer could not express: «cash only».
--   §2  app.project_duration_items(project) — the durations an offer offers, in ONE place instead of inline.
--   §3  app.offer_sells_on_installments(project) — one definition of «this offer sells on instalments».
--   §4  app.project_quote_payload publishes empty choices for an offer that sells no plan, and answers
--       installments.status = 'not_offered' instead of quoting one.
--   §5  public.submit_offer_request reads the payment mode, the percentage and the duration, refuses a plan
--       this offer does not allow, and snapshots the nine columns from the same builder that priced the page.
--   §6  public.public_project_quote — unchanged body, restated grants, and a comment that names the contract:
--       its `choices` ARE the public answer to «what does this offer allow», and they are empty when it allows
--       nothing. No second reader was added; see «WHY NO NEW PUBLIC RPC» below.
--
-- WHY NO NEW PUBLIC RPC. public.public_project_quote (0034, security definer, granted to anon and
-- authenticated, gated on app.project_visible) already returns choices.down_percents and choices.durations,
-- already resolved per offer: app.project_down_percent_items falls back to the global list when the offer has
-- no rows of its own, and the durations are the active ones that have a markup for this offer. Verified live
-- for TX-00215: {20%, 30%, 40%} × {36, 48, 60, 72, 84}. The public offer page fetches that payload for the
-- price it already shows, so the smallest honest reader is the one that exists — a second RPC would be a
-- second source of truth and a second round trip. What was missing is honesty, not a function: the choices
-- were published even when `pricing` was 'closed', 'not_offered' or 'legacy', i.e. a menu of percentages of a
-- price the visitor is not allowed to see (PRJ-03). §4 closes that.
--
-- WHAT IS NEVER PUBLISHED, before and after: financing_markups.markup_bp (live: 2000…6000 bp), the tree_price
-- breakdown (land, planting, extras, margin, rounding), cost items and markups_note_ar. All stay behind
-- p_staff and app.can_price(); public.project_down_payment_percents and public.financing_markups keep their
-- RLS and have no grant to anon. A visitor sees a percentage, a number of months, and the plan those two
-- produce for the basket he asked for — every one of which /start already shows him.
--
-- ERROR CODES RAISED HERE THAT src/lib/errors.ts DOES NOT KNOW YET (that file is not mine; whoever owns it
-- adds the Arabic line — it must say what went wrong AND how to fix it, and must NOT say «ارجع للحاسبة»,
-- because on an offer page the choices are in the form itself):
--   offer_installments_not_offered         «هذا العرض يتباع بالحاضر فقط. اختر الدفع بالحاضر باش تكمّل.»
--   offer_down_payment_percent_required    «اختر نسبة التسبقة من النِّسَب المعروضة في هذا العرض.»
--   offer_duration_required                «اختر مدة الدفع من المدد المعروضة في هذا العرض.»
--   offer_down_payment_percent_not_allowed «النسبة هذي ما تنجمش تتباع في هذا العرض. اختر وحدة من النِّسَب المعروضة.»
--   offer_duration_not_allowed             «المدة هذي ما تنجمش تتباع في هذا العرض. اختر وحدة من المدد المعروضة.»
--   offer_plan_unavailable                 «ما نجمناش نحسبو التقسيط بهذي الاختيارات. بدّل النسبة ولا المدة ولا اختر الدفع بالحاضر.»
-- invalid_payment_mode is already in errors.ts and already reads correctly on both pages, so it is reused.
--
-- WHAT MUST FOLLOW IN TYPESCRIPT (none of it is in this agent's files):
--   1. npm run db:types                     public.projects gains allows_installments.
--   2. src/lib/errors.ts                    the six codes above.
--   3. src/app/(public)/projects/[code]/    the form asks the three questions and sends payment_mode,
--        offer-actions.ts + the form        down_payment_percent_option_id and duration_option_id; it offers
--                                           «بالتقسيط» only while quote.choices.down_percents and
--                                           quote.choices.durations are both non-empty — after §4 that is the
--                                           whole gate, including «this offer is cash only» and «no price».
--   4. src/app/admin/(panel)/projects/[id]/ the switch: allows_installments beside min_trees_per_order
--        card-tab.tsx + projects/actions.ts (saveProject must accept and write it, with requireStaff() and the
--                                           screen's usual ReasonField). Until it exists every offer keeps
--                                           today's behaviour, because the column defaults to true.
--   5. src/app/admin/(panel)/leads/…        nothing: the CRM list, the client file and the CSV already render
--                                           these nine columns for calculator demands and light up on their
--                                           own — except the duration row on the client file, which is still
--                                           wrapped in `{isOffer ? null : …}` and must lose that guard.

-- ---------------------------------------------------------------------------
-- §1 · «each offer has its own stuff» includes the offer that has none
-- ---------------------------------------------------------------------------
-- Until now an offer's own payment options could only ever be a SUBSET of the general rule, or everything:
-- app.project_down_percent_items returns the whole active list when the offer has no rows of its own, and a
-- duration counts as offered when a GLOBAL markup exists for it. So deleting an offer's five markups, meaning
-- «this one is cash only», silently restores the general ones. There was no way to publish a cash-only offer.
--
-- The switch is a column and not a setting because it is a property of one offer, and it is `not null default
-- true` so that applying this file changes nothing that is on sale today: all four live offers keep the plans
-- they publish this morning. What the offer ALLOWS stays where it already lives — public.option_items,
-- public.project_down_payment_percents and public.financing_markups — and is never written into code.

alter table public.projects
  add column if not exists allows_installments boolean not null default true;

comment on column public.projects.allows_installments is
  'Whether this offer sells on instalments at all (owner 2026-09-19, «each offer has its own stuff»). false: '
  'the offer is cash only — public_project_quote publishes no percentage and no duration for it and '
  'submit_offer_request refuses payment_mode = ''installments''. true (the default, and every offer before '
  'this column existed): the offer sells the percentages of public.project_down_payment_percents (or the whole '
  'active list when it has none) over the durations that have a markup in public.financing_markups.';

-- ---------------------------------------------------------------------------
-- §2 · The durations one offer offers, said once
-- ---------------------------------------------------------------------------
-- The same rule as app.project_down_percent_items (0031) and the same shape, for the other half of the menu.
-- It was written inline inside app.project_quote_payload (0048:125-133) and nowhere else, so the intake had no
-- way to ask «does this offer sell 84 months?» without copying it — and two copies of a rule is how the form
-- and the database come to disagree. It publishes the EXISTENCE of a markup, never its value.

create or replace function app.project_duration_items(p_project uuid default null) returns setof public.option_items
language sql stable security definer set search_path = '' as $$
  select o.*
  from public.option_items o
  where o.list_key = 'duration' and o.is_active
    and o.min_number between 1 and app.setting_int('pricing.max_months', 84)
    and exists (select 1 from public.financing_markups m
                where m.months = o.min_number and (m.project_id is null or m.project_id = p_project))
  order by o.min_number, o.sort_order
$$;
revoke execute on function app.project_duration_items(uuid) from public, anon, authenticated;

comment on function app.project_duration_items(uuid) is
  'The payment durations one offer offers (report v3 §8): active ''duration'' items within pricing.max_months '
  'that have a markup, the offer''s own row or the global one. Same shape as app.project_down_percent_items. '
  'Never returns the markup itself.';

-- ---------------------------------------------------------------------------
-- §3 · One definition of «this offer sells on instalments»
-- ---------------------------------------------------------------------------
-- Three things must all be true, and the form, the quote and the intake must agree on all three: the owner has
-- not closed instalments on this offer, the offer has at least one percentage to ask for, and at least one
-- duration that is priced. Anything less strands the visitor: the form would offer «بالتقسيط», the quote would
-- answer `incomplete` forever and the intake would refuse at the end of a filled form.

create or replace function app.offer_sells_on_installments(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select pj.allows_installments from public.projects pj where pj.id = p_project), false)
     and exists (select 1 from app.project_down_percent_items(p_project))
     and exists (select 1 from app.project_duration_items(p_project))
$$;
revoke execute on function app.offer_sells_on_installments(uuid) from public, anon, authenticated;

comment on function app.offer_sells_on_installments(uuid) is
  'Whether one offer sells on instalments: projects.allows_installments, and at least one percentage '
  '(app.project_down_percent_items) and one priced duration (app.project_duration_items). The single rule the '
  'public form, app.project_quote_payload and public.submit_offer_request all read.';

-- ---------------------------------------------------------------------------
-- §4 · The quote publishes what the offer allows, and nothing it does not
-- ---------------------------------------------------------------------------
-- Same signature, same keys, same figures. Two changes, both about honesty:
--   (a) choices.down_percents and choices.durations are '[]' when the offer sells no plan — because the owner
--       closed instalments on it, because it lists no percentage or no priced duration, or, for a public
--       caller, because this offer has no price to spread: `pricing` 'closed' (the flag), 'not_offered' (not
--       published) or 'legacy' (no class at all). A percentage of an amount the visitor may not see is a
--       commercial term leaking past the price gate (PRJ-03). Not 'unavailable': a project with several
--       classes and none chosen yet has a price, the visitor simply has not picked a class, and
--       supabase/tests/020_project_quote.sql pins that its menu stays published. Staff keep the menu whatever
--       the price does: the Back Office must be able to read what an offer allows before its price is set.
--   (b) installments.status answers 'not_offered' when the offer sells no plan, instead of quoting one. The
--       page can then say «هذا العرض يتباع بالحاضر فقط» with the same branch it already has for an empty list.
-- No new key was added to the payload. «This offer sells on instalments» is exactly «both choices lists are
-- non-empty» — app.offer_sells_on_installments requires one of each, and (a) empties both when it is false —
-- so a boolean beside them would be a second way to say the same thing, and the whitelist that guards this
-- payload against leaks (supabase/tests/020_project_quote.sql) would have to be widened to let it through.

create or replace function app.project_quote_payload(
  p_project uuid, p_spacing_class uuid, p_trees integer, p_payment_mode text,
  p_down_percent_option_id uuid, p_duration_option_id uuid, p_staff boolean
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pj        public.projects;
  v_class_id  uuid;
  v_spacing   text;
  v_class     public.tree_spacing_classes;
  v_max       integer;
  v_trees     integer;
  v_breakdown boolean := p_staff and app.can_price();
  v_pricing   text;
  v_priceable boolean;
  v_plans     boolean;
  v_price     jsonb;
  v_per_tree  bigint;
  v_annual    bigint;
  v_total     bigint;
  v_percent   public.option_items;
  v_duration  public.option_items;
  v_down      bigint;
  v_quote     jsonb;
  v_status    text;
  v_ok        boolean;
  v_inst      jsonb;
  v_choices   jsonb;
begin
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    return null;
  end if;

  select c.spacing_class_id, c.status into v_class_id, v_spacing
  from app.project_spacing_choice(v_pj.id, p_spacing_class) c;
  select * into v_class from public.tree_spacing_classes sc where sc.id = v_class_id;

  -- The /start limit, or the project's own tree count when it has one
  select greatest(app.setting_int('million.custom_trees_max', 5000), coalesce(max(o.min_number), 0)::integer)
  into v_max
  from public.option_items o
  where o.list_key = 'tree_count' and o.is_active;
  v_max   := coalesce(nullif(v_pj.tree_count, 0), v_max);
  v_trees := case when p_trees between 1 and v_max then p_trees end;

  -- 0020: sold out, operating and internal projects never price publicly.
  v_pricing := case
                 when not p_staff and not app.module_open('pricing') then 'closed'
                 when not p_staff and v_pj.status <> 'published' then 'not_offered'
                 when v_spacing = 'legacy' then 'legacy'
               end;
  v_priceable := v_pricing is null;

  if v_priceable then
    if v_spacing = 'ok' then
      v_price := app.tree_price(v_class_id, v_pj.id);
    end if;
    if coalesce((v_price->>'ok')::boolean, false) then
      v_pricing  := 'ok';
      v_per_tree := (v_price->>'price_per_tree_millimes')::bigint;
      v_annual   := (v_price->>'annual_fee_per_tree_millimes')::bigint;
      v_total    := v_per_tree * v_trees;
    else
      v_pricing := 'unavailable';
    end if;
  end if;

  -- What this offer sells on instalments (§3), and — for a visitor — only while this offer has a price to
  -- spread at all: v_priceable, the permission, not v_pricing = 'ok', the availability. A project with two
  -- classes and none chosen yet prices 'unavailable' and still publishes its menu, because the visitor is
  -- about to pick a class; 'closed', 'not_offered' and 'legacy' publish nothing.
  v_plans := app.offer_sells_on_installments(v_pj.id) and (p_staff or v_priceable);

  if v_pricing = 'ok' and p_payment_mode = 'installments' and v_trees is not null then
    if not v_plans then
      -- The offer is cash only, or it lists no percentage or no priced duration. Not an error: an answer.
      v_status := 'not_offered';
    elsif p_down_percent_option_id is null or p_duration_option_id is null then
      v_status := 'incomplete';
    else
      -- Plan P1-2: only a percentage and a duration this project offers
      select * into v_percent from app.project_down_percent_items(v_pj.id) o where o.id = p_down_percent_option_id;
      select * into v_duration from app.project_duration_items(v_pj.id) o where o.id = p_duration_option_id;
      v_down     := app.down_payment_from_percent(v_total, v_percent.min_number, v_pj.id);
      if v_percent.id is null or v_duration.id is null or v_down is null or v_duration.min_number is null then
        v_status := 'invalid_choice';
      else
        v_quote  := app.financed_quote(v_total, v_down, v_duration.min_number::integer, v_pj.id);
        v_status := case when (v_quote->>'ok')::boolean then 'ok' else v_quote->>'reason' end;
      end if;
    end if;
    v_ok := v_status = 'ok';
    v_inst := jsonb_build_object(
      'status', v_status,
      'down_payment_percent', case when v_ok then v_percent.min_number end,
      'down_payment_millimes', case when v_ok then (v_quote->>'down_payment_millimes')::bigint end,
      'months', case when v_ok then (v_quote->>'months')::integer end,
      'total_financed_millimes', case when v_ok then (v_quote->>'total_financed_millimes')::bigint end,
      'remaining_millimes', case when v_ok then (v_quote->>'remaining_millimes')::bigint end,
      'monthly_millimes', case when v_ok then (v_quote->>'monthly_millimes')::bigint end,
      'last_installment_millimes', case when v_ok then (v_quote->>'last_installment_millimes')::bigint end,
      'installments_count', case when v_ok then (v_quote->>'installments_count')::integer end,
      'shortened', case when v_ok then (v_quote->>'shortened')::boolean end
    );
    if v_breakdown then
      v_inst := v_inst || jsonb_build_object('markup_bp', case when v_ok then (v_quote->>'markup_bp')::integer end);
    end if;
  end if;

  -- What a page offers for this project: its active classes (with their price when the caller may see prices),
  -- and — only while the offer actually sells a plan — its percentages and its priced durations.
  select jsonb_build_object(
    'spacing_classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sc.id, 'label_ar', sc.label_ar, 'label_fr', sc.label_fr,
               'row_spacing_m', sc.row_spacing_m, 'tree_spacing_m', sc.tree_spacing_m, 'area_m2', sc.area_m2,
               'price_per_tree_millimes',
                 case when coalesce((tp.price->>'ok')::boolean, false) then (tp.price->>'price_per_tree_millimes')::bigint end)
             order by sc.sort_order, sc.code)
      from public.project_spacing_classes pc
      join public.tree_spacing_classes sc on sc.id = pc.spacing_class_id and sc.is_active
      cross join lateral (select case when v_priceable then app.tree_price(sc.id, v_pj.id) end as price) tp
      where pc.project_id = v_pj.id), '[]'::jsonb),
    'down_percents', case when v_plans then coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar, 'label_fr', o.label_fr, 'percent', o.min_number)
             order by o.min_number, o.sort_order)
      from app.project_down_percent_items(v_pj.id) o), '[]'::jsonb) else '[]'::jsonb end,
    'durations', case when v_plans then coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar, 'label_fr', o.label_fr,
                                          'months', o.min_number::integer)
             order by o.min_number, o.sort_order)
      from app.project_duration_items(v_pj.id) o), '[]'::jsonb) else '[]'::jsonb end)
  into v_choices;

  return jsonb_build_object(
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    'on_tree_pricing', v_spacing <> 'legacy',
    'spacing_status', case when v_spacing <> 'legacy' then v_spacing end,
    'spacing_class_id', v_class.id,
    'label_ar', v_class.label_ar,
    'label_fr', v_class.label_fr,
    'row_spacing_m', v_class.row_spacing_m,
    'tree_spacing_m', v_class.tree_spacing_m,
    'area_per_tree_m2', v_class.area_m2,
    'trees', v_trees,
    'trees_max', v_max,
    'total_area_m2', v_class.area_m2 * v_trees,
    'pricing', v_pricing,
    'price_per_tree_millimes', case when v_pricing = 'ok' then v_per_tree end,
    'total_price_millimes', case when v_pricing = 'ok' then v_total end,
    -- Paid every year for the trees chosen, never inside the price above (0045).
    'annual_fee_per_tree_millimes', case when v_pricing = 'ok' then v_annual end,
    'annual_fee_total_millimes', case when v_pricing = 'ok' then v_annual * v_trees end,
    'installments', v_inst,
    'choices', v_choices
  ) || case when v_breakdown then jsonb_build_object('price', v_price) else '{}'::jsonb end;
end $$;

revoke execute on function app.project_quote_payload(uuid, uuid, integer, text, uuid, uuid, boolean) from public, anon, authenticated;

comment on function app.project_quote_payload(uuid, uuid, integer, text, uuid, uuid, boolean) is
  'The quote behind public_project_quote and staff_project_quote (0034, 0045, 0048, bb_10). choices.down_percents '
  'and choices.durations are the offer''s own payment menu; both are empty — and installments.status is '
  '''not_offered'' — when the offer sells cash only, lists no percentage or no priced duration, or, for a '
  'visitor, when its price is not shown (PRJ-03). Never the markup, the cost breakdown or the notes.';

-- ---------------------------------------------------------------------------
-- §5 · The intake asks the three questions and records the answers
-- ---------------------------------------------------------------------------
-- Copied from the LIVE definition (0049 → 0051 wants_visit → 0054 minimum; verified with pg_get_functiondef on
-- 2026-09-19) and changed only where this task needs it. Everything else — identity, the offer's status, the
-- minimum, the throttle, the person, the round robin, the confirmation message — is byte-for-byte 0054.
--
-- HOW THE FIGURES ARE OBTAINED, and why not otherwise. The function computes nothing. It asks
-- app.project_quote_payload for the SAME offer, the SAME basket and the SAME two options the visitor chose,
-- with p_staff false so it can never snapshot a figure the visitor was not allowed to see, and copies what
-- comes back. That is how the price and the yearly fee were already snapshotted; the plan now travels the same
-- road, so a demand and the page that produced it can never disagree, and (cash − down) × (1 + markup) stays
-- inside app.financed_quote where it belongs.
--
-- WHICH COLUMNS. The same nine public.submit_interest_request fills for the same questions:
--   payment_mode, down_payment_percent_option_id, down_payment_percent, down_payment_amount_millimes,
--   total_financed_millimes, monthly_millimes, duration_option_id, duration_label_ar, duration_months.
-- The four down_payment_option_id / down_payment_label_ar / down_payment_min_millimes /
-- down_payment_max_millimes columns stay NULL on purpose: they belong to the retired 'down_payment' AMOUNT
-- list (plan Q-7), which no page asks any more. remaining_millimes, last_installment_millimes,
-- installments_count and shortened have no column on public.interest_requests at all — the calculator shows
-- them and stores none of them either. No column was invented for them here.
--
-- NOT ANSWERING IS AN ANSWER. payment_mode stays NULL when the form sends nothing, exactly as it does for a
-- calculator demand: the CRM filter has a «بدون إجابة» bucket and an offer demand taken before this change
-- must keep reading the same way as one taken after it and left unanswered.

create or replace function public.submit_offer_request(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name        text := btrim(coalesce(p->>'full_name', ''));
  v_phone       text := p->>'phone_e164';
  v_whatsapp    text := nullif(p->>'whatsapp_e164', '');
  v_email       text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_gov         smallint := nullif(p->>'residence_governorate_id', '')::smallint;
  v_del         integer := nullif(p->>'residence_delegation_id', '')::integer;
  v_consent     text := nullif(btrim(coalesce(p->>'consent_text', '')), '');
  -- Read exactly as submit_interest_request reads it (0030): a real JSON boolean, or empty for «did not answer».
  v_wants_visit boolean := case when jsonb_typeof(p->'wants_visit') = 'boolean' then (p->>'wants_visit')::boolean end;
  -- The three answers the offer form now asks, read as text so a malformed id is a refusal and never a crash.
  v_mode        text := nullif(btrim(coalesce(p->>'payment_mode', '')), '');
  v_down_txt    text := nullif(btrim(coalesce(p->>'down_payment_percent_option_id', '')), '');
  v_dur_txt     text := nullif(btrim(coalesce(p->>'duration_option_id', '')), '');
  v_percent     public.option_items;
  v_duration    public.option_items;
  v_channel     public.contact_channel;
  v_time        public.option_items;
  v_project     public.projects;
  v_trees       integer;
  v_min_trees   integer;
  v_trees_label text;
  v_quote       jsonb;
  v_inst        jsonb;
  v_inst_status text;
  v_pricing     text;
  v_class_id    uuid;
  v_class_label text;
  v_area_tree   numeric;
  v_area_total  numeric;
  v_per_tree    bigint;
  v_total       bigint;
  v_annual      bigint;
  v_annual_all  bigint;
  v_down_pct    numeric;
  v_down_amount bigint;
  v_financed    bigint;
  v_monthly     bigint;
  v_months      integer;
  v_status_id   uuid;
  v_person_id   uuid;
  v_inserted    boolean;
  v_assignee    uuid;
  v_year        text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_request_no  text;
  v_request_id  uuid;
begin
  -- Identity: the same rules as the calculator form, so one person is one person in both flows (LEAD-04).
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'invalid_full_name' using errcode = 'P0001';
  end if;
  perform app.assert_phone(v_phone, 'invalid_phone');
  if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_whatsapp' using errcode = 'P0001';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if v_consent is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.governorates g where g.id = v_gov and g.is_active) then
    raise exception 'invalid_governorate' using errcode = 'P0001';
  end if;
  if v_del is not null and not exists (
    select 1 from public.delegations d where d.id = v_del and d.governorate_id = v_gov and d.is_active
  ) then
    raise exception 'invalid_delegation' using errcode = 'P0001';
  end if;
  begin
    v_channel := (p->>'contact_channel')::public.contact_channel;
  exception when invalid_text_representation then
    v_channel := null;
  end;
  if v_channel is null then
    raise exception 'contact_channel_required' using errcode = 'P0001';
  end if;
  if nullif(p->>'contact_time_option_id', '') is not null then
    v_time := app.active_option('contact_time', p->>'contact_time_option_id');
    if v_time.id is null then raise exception 'invalid_contact_time' using errcode = 'P0001'; end if;
  end if;

  -- The offer must be one that is actually on sale on its own page. The `projects` module flag decides whether
  -- the page is shown at all and is checked by the server action; here only the offer's own status counts, so a
  -- draft or an internal offer can never take a request even if a form reached it.
  select * into v_project from public.projects pj where pj.id = nullif(p->>'project_id', '')::uuid;
  if v_project.id is null or not (v_project.status = any (app.project_public_statuses())) then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;

  -- Owner: «الحريف يشري من 1 الي 100» — at least one tree, never more than the offer holds.
  begin
    v_trees := nullif(btrim(coalesce(p->>'trees', '')), '')::integer;
  exception when others then
    raise exception 'invalid_offer_trees' using errcode = 'P0001';
  end;
  if v_trees is null or v_trees < 1
     or (coalesce(v_project.tree_count, 0) > 0 and v_trees > v_project.tree_count) then
    raise exception 'invalid_offer_trees' using errcode = 'P0001';
  end if;
  -- «there is a minimum of trees to buy, it depends on the offer»: the same floor public_offer_stock shows the
  -- form, so the page and the database can never disagree. Its own error code, because «اكتب عدد الزيتونات»
  -- would be wrong advice for someone who typed a perfectly good number that is simply too small.
  v_min_trees := app.offer_min_trees(v_project.id);
  if v_trees < v_min_trees then
    raise exception 'below_min_trees' using errcode = 'P0001';
  end if;

  -- «طريقة الدفع» (owner 2026-09-19). The same two answers as the calculator, and not answering is a real
  -- state, so only a word that is neither is refused.
  if v_mode is not null and v_mode not in ('cash', 'installments') then
    raise exception 'invalid_payment_mode' using errcode = 'P0001';
  end if;

  -- What THIS offer allows, checked against the offer and not against the general lists. Each refusal has its
  -- own code because each one is a different thing for the visitor to do: pick a plan, pick another percentage,
  -- pick another duration, or pay cash. A cash buyer picks no percentage and no duration; ids sent anyway are
  -- ignored, exactly as submit_interest_request ignores them (0032).
  if v_mode = 'installments' then
    if not app.offer_sells_on_installments(v_project.id) then
      raise exception 'offer_installments_not_offered' using errcode = 'P0001';
    end if;
    if v_down_txt is null then
      raise exception 'offer_down_payment_percent_required' using errcode = 'P0001';
    end if;
    select * into v_percent from app.project_down_percent_items(v_project.id) o where o.id::text = v_down_txt;
    if v_percent.id is null then
      raise exception 'offer_down_payment_percent_not_allowed' using errcode = 'P0001';
    end if;
    if v_dur_txt is null then
      raise exception 'offer_duration_required' using errcode = 'P0001';
    end if;
    select * into v_duration from app.project_duration_items(v_project.id) o where o.id::text = v_dur_txt;
    if v_duration.id is null then
      raise exception 'offer_duration_not_allowed' using errcode = 'P0001';
    end if;
  end if;

  -- Priced by the builder the offer page itself prices with (0034, 0048, bb_10), so a request never carries a
  -- figure the visitor could not see — the price, the yearly fee and now the whole plan. When prices are closed
  -- the request is still taken, without money.
  v_quote       := app.project_quote_payload(v_project.id, null, v_trees, v_mode, v_percent.id, v_duration.id, false);
  v_pricing     := v_quote->>'pricing';
  v_class_id    := nullif(v_quote->>'spacing_class_id', '')::uuid;
  v_class_label := v_quote->>'label_ar';
  v_area_tree   := nullif(v_quote->>'area_per_tree_m2', '')::numeric;
  v_area_total  := nullif(v_quote->>'total_area_m2', '')::numeric;
  if v_pricing = 'ok' then
    v_per_tree   := nullif(v_quote->>'price_per_tree_millimes', '')::bigint;
    v_total      := nullif(v_quote->>'total_price_millimes', '')::bigint;
    v_annual     := nullif(v_quote->>'annual_fee_per_tree_millimes', '')::bigint;
    v_annual_all := nullif(v_quote->>'annual_fee_total_millimes', '')::bigint;
  end if;

  -- The plan, copied from the quote, never recomputed here.
  if v_mode = 'installments' then
    v_inst        := v_quote->'installments';
    v_inst_status := v_inst->>'status';
    if v_inst_status is null or v_inst_status = 'not_offered' then
      -- No installments key at all means the offer has no visible price to spread over months.
      raise exception 'offer_installments_not_offered' using errcode = 'P0001';
    end if;
    if v_inst_status <> 'ok' then
      -- What is left after the checks above: 'down_covers_total' (a percentage that pays the whole basket) and
      -- 'invalid_input'. 'incomplete', 'invalid_choice', 'duration_not_priced' and 'too_many_months' cannot
      -- reach here — they were refused above with a code that tells the visitor what to change.
      raise exception 'offer_plan_unavailable' using errcode = 'P0001';
    end if;
    v_down_pct    := nullif(v_inst->>'down_payment_percent', '')::numeric;
    v_down_amount := nullif(v_inst->>'down_payment_millimes', '')::bigint;
    v_financed    := nullif(v_inst->>'total_financed_millimes', '')::bigint;
    v_monthly     := nullif(v_inst->>'monthly_millimes', '')::bigint;
    v_months      := nullif(v_inst->>'months', '')::integer;
  end if;

  -- Throttling (LEAD-06), shared with the calculator form: one person cannot flood both.
  perform app.check_throttle('interest:ip', nullif(p->>'ip_hash', ''), interval '1 hour',
                             app.setting_int('antispam.max_requests_per_ip_per_hour', 10));
  if (select count(*) from public.interest_requests r
      where r.phone_e164 = v_phone and r.created_at > now() - interval '1 day')
     >= app.setting_int('antispam.max_requests_per_phone_per_day', 3) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select id into v_status_id from public.lead_statuses
  where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;

  insert into public.persons as ps
    (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, status_id, consent_at, last_request_at)
  values
    (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del, v_status_id, now(), now())
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at
  returning ps.id, (ps.xmax = 0) into v_person_id, v_inserted;

  -- Optional automatic assignment (LEAD-12), same rule as the calculator form.
  if v_inserted and app.setting_text('crm.auto_assign_mode', 'manual') = 'round_robin' then
    select ur.user_id into v_assignee
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id
    left join lateral (
      select max(pa.created_at) as last_at from public.person_assignments pa where pa.to_user = ur.user_id
    ) la on true
    where ur.role = 'commercial' and pr.is_active
    order by la.last_at nulls first, ur.granted_at
    limit 1;
    if v_assignee is not null then
      update public.persons set assigned_to = v_assignee where id = v_person_id;
      insert into public.person_assignments (person_id, from_user, to_user, reason)
      values (v_person_id, null, v_assignee, 'auto:round_robin');
    end if;
  end if;

  v_trees_label := v_trees::text || ' ' || app.setting_text('start.trees_unit', 'زيتونة');
  v_request_no  := app.setting_text('request_no.prefix', 'AGZ') || '-' || v_year || '-'
                   || lpad(app.next_number('interest_request:' || v_year)::text, 6, '0');

  -- The offer columns say which offer and what it cost that day; the plan columns say how the visitor asked to
  -- pay for it; the shared columns keep the CRM lists, filters, exports and the tree counter working without a
  -- second set of screens.
  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, email,
    residence_governorate_id, residence_delegation_id,
    request_kind, project_id, project_code, project_name,
    offer_trees, offer_price_per_tree_millimes, offer_total_price_millimes,
    offer_annual_fee_per_tree_millimes, offer_annual_fee_total_millimes,
    -- An offer answers the two questions the calculator asks: the place is the offer's own governorate, and
    -- no project type was asked (interest_requests_location_chk, interest_requests_type_chk).
    invest_anywhere, invest_governorate_ids, project_type_unsure,
    tree_count_code, tree_count_label_ar, tree_count_min, tree_count_max,
    spacing_class_id, spacing_label_ar, area_per_tree_m2, total_area_m2,
    price_per_tree_millimes, total_price_millimes,
    -- The payment plan the visitor chose on the offer page (owner 2026-09-19). The same nine columns
    -- submit_interest_request fills for the same three questions, filled from the same builder.
    payment_mode,
    down_payment_percent_option_id, down_payment_percent, down_payment_amount_millimes,
    total_financed_millimes, monthly_millimes,
    duration_option_id, duration_label_ar, duration_months,
    -- The visit the offer page asked about (report v3 §40). The column, its CRM filter, its lead page row and
    -- its CSV cell have existed since 0030; only this intake never wrote it.
    wants_visit,
    contact_channel, contact_time_option_id, contact_time_label_ar,
    is_duplicate, source, consent_text
  ) values (
    v_request_no, v_person_id, v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email,
    v_gov, v_del,
    'offer', v_project.id, v_project.code, v_project.name,
    v_trees, v_per_tree, v_total,
    v_annual, v_annual_all,
    false, array[v_project.governorate_id], true,
    'offer', v_trees_label, v_trees, v_trees,
    v_class_id, v_class_label, v_area_tree, v_area_total,
    v_per_tree, v_total,
    v_mode,
    v_percent.id, v_down_pct, v_down_amount,
    v_financed, v_monthly,
    v_duration.id, v_duration.label_ar, v_months,
    v_wants_visit,
    v_channel, v_time.id, v_time.label_ar,
    not v_inserted, app.clean_source(coalesce(p->'source', '{}'::jsonb)), v_consent
  ) returning id into v_request_id;

  perform app.enqueue_message(
    'lead.confirmation', v_phone,
    jsonb_build_object('name', split_part(v_name, ' ', 1), 'request_no', v_request_no,
                       'trees', v_trees_label, 'offer', v_project.name,
                       'total_area_m2', v_area_total, 'total_price_millimes', v_total),
    'interest_requests', v_request_id
  );

  return jsonb_build_object('request_no', v_request_no, 'project_code', v_project.code);
end $$;

revoke execute on function public.submit_offer_request(jsonb) from public, anon, authenticated;
grant execute on function public.submit_offer_request(jsonb) to service_role;

comment on function public.submit_offer_request(jsonb) is
  'Intake of one offer page (0049, bb_10): identity like submit_interest_request, a visible offer, trees between '
  'the offer''s minimum (app.offer_min_trees) and its tree_count, the visit intent, and the offer''s own price, '
  'yearly fee and payment plan snapshotted from app.project_quote_payload — never recomputed here. The plan is '
  'refused when this offer does not sell it: offer_installments_not_offered, offer_down_payment_percent_required, '
  'offer_down_payment_percent_not_allowed, offer_duration_required, offer_duration_not_allowed, '
  'offer_plan_unavailable. Records the demand only: it allocates no tree, because an interest request is not a '
  'sale — reserving is staff_allocate_trees. Server-side only.';

-- ---------------------------------------------------------------------------
-- §6 · The public reader, named as such
-- ---------------------------------------------------------------------------
-- Same body as 0034. What changes is that it is now documented as the answer to «what does this offer allow»,
-- and its grants are restated so the file that publishes the menu is also the file that says who may read it.

create or replace function public.public_project_quote(
  p_project uuid, p_spacing_class uuid default null, p_trees integer default null, p_payment_mode text default null,
  p_down_percent_option_id uuid default null, p_duration_option_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status public.project_status;
begin
  select pj.status into v_status from public.projects pj where pj.id = p_project;
  if not found or not app.project_visible(v_status) then
    return null;
  end if;
  return app.project_quote_payload(p_project, p_spacing_class, p_trees, p_payment_mode,
                                   p_down_percent_option_id, p_duration_option_id, false);
end $$;

revoke execute on function public.public_project_quote(uuid, uuid, integer, text, uuid, uuid) from public;
grant execute on function public.public_project_quote(uuid, uuid, integer, text, uuid, uuid) to anon, authenticated;

comment on function public.public_project_quote(uuid, uuid, integer, text, uuid, uuid) is
  'Project quote for the public pages (plan P5-2, bb_10): the public_tree_quote figures with the project''s '
  'classes, rules, markups and percentages, plus its choices. It is also what an offer publishes about its own '
  'payment plans: choices.down_percents (id, labels, percent) and choices.durations (id, labels, months) are the '
  'percentages and durations THIS offer allows, and both are empty when it sells cash only or while its price '
  'is not shown. Null unless app.project_visible(). pricing: ''closed'' (flag), ''not_offered'' '
  '(not published), ''legacy'' (no classes), ''unavailable'' or ''ok''. Never the land price, planting cost, '
  'extra costs, cost, margin, markup or notes.';

