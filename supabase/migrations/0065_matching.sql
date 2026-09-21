-- bb_22 · Matching: «Best matching offers» for one client demand (report v3 §43, §45).
--
-- DRAFT. Not applied, not numbered. The session owner applies it after reading; migration numbers are claimed
-- at apply time (the applied files run to 0062). Dry run:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_22_matching.sql supabase/tests/038_matching.sql
--
-- WHAT §43 ASKS, AND IN WHICH DIRECTION. «من بعد يمكن مطابقة Demand الحريف مع Inventory AgriZed … النظام يعرض
-- للCommercial: Best matching offers.» The demand is the input, the offers are the output, and the reader is the
-- commercial with the client on the phone. That is the OPPOSITE of the matcher that exists today:
-- public.match_requests_for_parcel (0013) answers v1 §8.3 — given a PARCEL, which registered clients fit it.
-- This file does not touch, rewrite or drop that function: it is keyed on public.parcels (the retired layer, 0
-- rows) and supabase/pending/bb_03_parcel_layer_retires.sql already drops it. Two functions, two directions, and
-- the old one leaves with the layer it belongs to.
--
-- NOTHING IS FILTERED THAT COULD BE SCORED. The spec never says what «best» means when an offer fits perfectly
-- but holds 60 of the 100 trees asked for. Hiding it steals the sentence the commercial would actually say
-- («خذ 60 توّا»), and ranking it first in silence sends them into a call promising trees that do not exist. So
-- every offer that still has a free tree is scored and returned with trees_available, trees_requested and a
-- `partial` flag, and the screen says the rest out loud. The single hard exclusion is an offer with no free tree
-- at all: an offer that cannot be sold is never a «best matching offer».
--
-- EVERY NUMBER IS A SETTING. There is no weight, no threshold, no limit and no Arabic phrase written into the
-- SQL below: matching.weights carries the seven weights, matching.min_score the floor, matching.offers_limit how
-- many rows come back, and matching.reason_labels the sentence for each criterion. A weight that is missing from
-- the jsonb scores ZERO and its criterion disappears from the score — it never falls back to a number typed in
-- this file, which is how the live 0013 matcher does it (coalesce(…, 25)) and how a business value hides in code.
-- Re-weighting matching is editing one jsonb in الإعدادات، not a deploy.
--
-- THE SCORE IS A PERCENTAGE OF WHAT APPLIED, so the weights never have to sum to 100 and the owner can add or
-- zero one without recalibrating matching.min_score. A criterion the demand says nothing about (no governorate
-- because «المكان موش مهم», no type because «ما نعرفش», no plan because «بالحاضر») is NOT scored as a miss — it
-- is left out of the denominator entirely. Partial credit for a vague answer is a business number in disguise;
-- «this question does not apply» is a fact.
--
-- WHAT IT READS, AND WHAT IT REFUSES TO RECOMPUTE. Stock comes from app.offer_stock_payload — the one sanctioned
-- reader (0054 §6); this file never counts a row of public.trees. Money comes from app.project_quote_payload
-- (0034) — this file never multiplies a price. The demand is read from public.interest_requests as it was
-- stored, snapshots included.
--
-- PRICE IS A PERMISSION (PRJ-03). The money keys are attached only when app.can_price() — Finance, Admin,
-- Super Admin. A commercial without price rights gets the same ranking, the same reasons and the same stock, and
-- no dinar at all: the score is built from the STRUCTURE of the plan (does this offer offer that percentage?
-- does it price that duration?), never from its amount, so removing the money removes nothing from the ranking.
--
-- THE MODULE GATE, BOTH HALVES. The `matching` flag is 'disabled' and stays disabled — the owner turns a module
-- on himself. While it is disabled app.module_open('matching') is false and this RPC refuses with
-- `module_closed`, so the feature is inert in the database and not merely hidden by a screen. Turning the row to
-- «داخلي فقط» (internal) is what opens it for staff, which is the right state for a Back Office-only module.
--
-- TypeScript that must move with this file:
--   1. npm run db:types                                   staff_match_offers appears.
--   2. src/lib/errors.ts                                  `module_closed` (and it has no line today).
--   3. src/lib/modules-catalog.ts                         add "matching" to IMPLEMENTED_MODULES, or the owner
--                                                         cannot turn it on: the three-state control is not
--                                                         drawn for a module that is not in that array.
--   4. src/app/admin/(panel)/leads/[personId]/page.tsx    mount <MatchingOffers …/> (the integrator's file).

-- ---------------------------------------------------------------------------
-- 1 · The knobs: weights, floor, how many rows, and the Arabic of each reason
-- ---------------------------------------------------------------------------

-- The three criteria v3 §43 adds and 0013 never had: how many trees are free against how many were asked for,
-- the state of the grove (زيتون منتج in the spec's own example), and whether the offer prices the duration the
-- client chose. `value` wins over the defaults on the left, so applying this twice never overwrites a weight the
-- owner has already tuned, and the four keys 0013 seeded (area, plantation, installment, priority_bonus) are
-- left in place: `area` and `priority_bonus` describe a parcel and this matcher ignores them, but deleting a key
-- the retiring 0013 function still reads is not this file's business.
update public.settings
set value = jsonb_build_object('trees', 25, 'production', 10, 'duration', 15) || value,
    description_ar = 'أوزان المطابقة بين مطلب حريف والعروض (التقرير v3 §43). كل معيار ياخذ وزنه من هنا، والنتيجة نسبة مئوية من مجموع المعايير اللي تنطبق على المطلب — موش لازم مجموع الأوزان يساوي 100. المفاتيح اللي تُقرأ: location (الولاية) · project_type (نوع المشروع) · production (حالة الإنتاج) · plantation (نظام الغراسة) · trees (الزيتونات المتاحة مقابل المطلوبة) · down_payment (نسبة التسبقة) · duration (مدة التقسيط). مفتاح ناقص ولا وزنه 0 = المعيار ما يتحسبش أصلاً. (area و installment و priority_bonus يخدموا مع المطابقة القديمة متاع القطع.)'
where key = 'matching.weights';

update public.settings
set description_ar = 'أدنى نتيجة باش يظهر العرض في اقتراحات مطلب الحريف (من 100). العروض اللي تحت العتبة تتعدّ وما تتعرضش، والشاشة تقول قدّاش فما منهم. 0 = ورّي الكل.'
where key = 'matching.min_score';

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('matching.offers_limit', to_jsonb(4), 'integer', 'matching',
   'عدد العروض المقترحة',
   'قدّاش من عرض يظهر في «عروض تنفع لهذا الحريف» في ملف الحريف. 0 = الكل.', false, 40),

  ('matching.reason_labels', $json${
    "location": "في {gov}، كيما طلب",
    "location_no": "في {gov}، موش من الولايات اللي طلبها",
    "project_type": "نفس نوع المشروع اللي يحبّه",
    "project_type_no": "نوع المشروع مختلف على اللي طلب",
    "production": "حالة الإنتاج كيما طلبها",
    "production_no": "حالة الإنتاج موش كيما طلبها",
    "plantation": "نظام الغراسة كيما طلبه",
    "plantation_no": "نظام الغراسة مختلف على اللي طلب",
    "trees": "فيه {available} زيتونة متاحة، وهو طلب {trees}",
    "trees_partial": "فيه {available} زيتونة متاحة برك من {trees} اللي طلبهم",
    "trees_below_min": "أقلّ عدد في هذا العرض {min} زيتونة، وهو طلب {trees} برك",
    "down_payment": "يقبل تسبقة {percent}",
    "down_payment_no": "ما يقبلش تسبقة {percent} — المتوفّر: {offered}",
    "duration": "يقبل الخلاص على {duration}",
    "duration_no": "ما يقبلش الخلاص على {duration}"
  }$json$::jsonb, 'json', 'matching',
   'جمل أسباب المطابقة',
   'الجملة اللي تظهر تحت كل عرض مقترح وتفسّر علاش تقدّم ولا تأخّر. لكل معيار جملة كي يتحقق وجملة كي ما يتحققش (بـ«_no»). الرموز بين {} تتبدّل بالمعطيات: {gov} الولاية · {trees} الزيتونات المطلوبة · {available} المتاحة · {min} أقلّ عدد في العرض · {percent} نسبة التسبقة · {offered} النسب اللي يقبلها العرض · {duration} مدة الخلاص. جملة ناقصة = يظهر اسم المعيار كيما هو.',
   false, 50)
on conflict (key) do nothing;

-- The flag row described v1 §8.3 («اقتراح الحرفاء المطابقين») — the other direction, and the module the owner
-- would have been turning on is not the one that exists now.
update public.feature_flags
set label_ar = 'المطابقة',
    description_ar = 'يعرض للتجاري، من مطلب الحريف (عدد الزيتونات، الولاية، نوع المشروع، التسبقة، المدة)، العروض اللي تنفعوه مرتّبة بنتيجة وبسبب كل واحد (التقرير v3 §43 و§45). يخدم في الـBack Office برك: «داخلي فقط» تكفي باش يشعل للفريق.'
where key = 'matching';

-- ---------------------------------------------------------------------------
-- 2 · One Arabic sentence per criterion, rendered from the setting
-- ---------------------------------------------------------------------------

-- The copy lives in matching.reason_labels, like every other user-facing string in this product (the {min}
-- placeholder is the offers.min_trees_hint pattern, 0054 §2). A key with no sentence returns the key itself
-- rather than an empty line: an unlabelled criterion is a bug to see, not a row to hide.
create or replace function app.match_reason(p_key text, p_vars jsonb default '{}'::jsonb) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tpl text;
  v_out text;
  v_k   text;
  v_v   text;
begin
  v_tpl := coalesce(app.setting('matching.reason_labels'), '{}'::jsonb) ->> p_key;
  if v_tpl is null or btrim(v_tpl) = '' then
    return p_key;
  end if;
  v_out := v_tpl;
  for v_k, v_v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_out := replace(v_out, '{' || v_k || '}', coalesce(v_v, ''));
  end loop;
  return v_out;
end $$;
revoke execute on function app.match_reason(text, jsonb) from public, anon, authenticated;

comment on function app.match_reason(text, jsonb) is
  'The Arabic sentence of one matching criterion, from the setting matching.reason_labels, with {placeholders} replaced by the row''s own figures. Returns the key itself when the sentence was emptied.';

-- One scored criterion, ready to be shown: its weight (0 = the owner switched it off), how much of that weight
-- the offer earned, and the sentence that says why. `fraction` is 1, 0, or the honest ratio in between — no
-- partial-credit constant is invented here or anywhere below.
create or replace function app.match_term(
  p_weights jsonb, p_key text, p_fraction numeric, p_label_key text, p_vars jsonb default '{}'::jsonb
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'key', p_key,
    'weight', w.v,
    'fraction', round(p_fraction, 4),
    'earned', round(w.v * p_fraction, 4),
    'hit', p_fraction >= 1,
    'label_ar', app.match_reason(p_label_key, p_vars))
  from (select coalesce((p_weights->>p_key)::numeric, 0) as v) w
$$;
revoke execute on function app.match_term(jsonb, text, numeric, text, jsonb) from public, anon, authenticated;

comment on function app.match_term(jsonb, text, numeric, text, jsonb) is
  'One criterion of a match: its weight read from matching.weights (missing = 0 = off), the fraction of it earned, and its Arabic sentence. Never a number of its own.';

-- ---------------------------------------------------------------------------
-- 3 · The matcher: one demand in, the offers that fit it out
-- ---------------------------------------------------------------------------

create or replace function public.staff_match_offers(p_request uuid, p_limit integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_req        public.interest_requests;
  v_weights    jsonb := coalesce(app.setting('matching.weights'), '{}'::jsonb);
  v_min        numeric := coalesce((app.setting('matching.min_score') #>> '{}')::numeric, 0);
  v_limit      integer := coalesce(p_limit, app.setting_int('matching.offers_limit', 0));
  v_money      boolean;
  v_trees      integer;
  v_months     integer;
  v_down_label text;
  v_dur_label  text;
  v_pj         public.projects;
  v_stock      jsonb;
  v_free       integer;
  v_min_trees  integer;
  v_gov        text;
  v_frac       numeric;
  v_term       jsonb;
  v_num        numeric;
  v_den        numeric;
  v_score      numeric;
  v_reasons    jsonb;
  v_quote      jsonb;
  v_money_out  jsonb;
  v_rows       jsonb[] := '{}';
  v_offers     jsonb;
  v_considered integer := 0;
  v_no_stock   integer := 0;
  v_below      integer := 0;
  v_offered    text;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Both halves of the gate: the screen checks moduleAccess() and the database checks the flag again, so the
  -- module is closed for a caller who never opened a screen at all.
  if not app.module_open('matching') then
    raise exception 'module_closed' using errcode = '42501';
  end if;

  select * into v_req from public.interest_requests r where r.id = p_request;
  if not found then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  -- A commercial matches inside their own file and no other (COM-05, the same test staff_allocate_trees uses,
  -- so the offers they are shown are exactly the offers they may reserve on).
  if not app.can_see_person(v_req.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_money  := app.can_price();
  -- What the client asked for: the offer demand names its own number, the calculator demand carries the option
  -- it picked. Neither is recomputed here.
  v_trees  := coalesce(v_req.offer_trees, v_req.tree_count_min);
  v_months := v_req.duration_months;

  select o.label_ar into v_down_label from public.option_items o where o.id = v_req.down_payment_percent_option_id;
  select o.label_ar into v_dur_label  from public.option_items o where o.id = v_req.duration_option_id;

  -- Candidates: the offers a commercial may still sell. 'sold_out', 'operating', 'draft', 'preparing' and
  -- 'archived' are not on sale, and an offer with no free tree is dropped below — «best matching» over stock
  -- that does not exist is the one thing §46 forbids.
  for v_pj in
    select pj.* from public.projects pj
    where pj.status in ('published', 'internal')
    order by pj.code
  loop
    v_stock := app.offer_stock_payload(v_pj.id);
    v_free  := coalesce((v_stock->>'trees_available')::integer, 0);
    v_min_trees := coalesce((v_stock->>'min_trees')::integer, 1);
    if v_free < 1 then
      v_no_stock := v_no_stock + 1;
      continue;
    end if;
    v_considered := v_considered + 1;

    v_num := 0;
    v_den := 0;
    v_reasons := '[]'::jsonb;

    -- Where. «المكان موش مهم» is not a miss and not half a hit: the question does not apply, so it leaves the
    -- denominator and the offer is judged on what the client did answer.
    if not v_req.invest_anywhere and coalesce(cardinality(v_req.invest_governorate_ids), 0) > 0
       and v_pj.governorate_id is not null then
      select g.name_ar into v_gov from public.governorates g where g.id = v_pj.governorate_id;
      v_frac := case when v_pj.governorate_id = any (v_req.invest_governorate_ids) then 1 else 0 end;
      v_term := app.match_term(v_weights, 'location', v_frac,
                               case when v_frac >= 1 then 'location' else 'location_no' end,
                               jsonb_build_object('gov', coalesce(v_gov, '')));
      if (v_term->>'weight')::numeric > 0 then
        v_den := v_den + (v_term->>'weight')::numeric;
        v_num := v_num + (v_term->>'earned')::numeric;
        v_reasons := v_reasons || v_term;
      end if;
    end if;

    -- What they want to own. «ما نعرفش» (project_type_unsure) is the same kind of silence.
    if not v_req.project_type_unsure and coalesce(cardinality(v_req.project_type_ids), 0) > 0
       and v_pj.project_type_id is not null then
      v_frac := case when v_pj.project_type_id = any (v_req.project_type_ids) then 1 else 0 end;
      v_term := app.match_term(v_weights, 'project_type', v_frac,
                               case when v_frac >= 1 then 'project_type' else 'project_type_no' end);
      if (v_term->>'weight')::numeric > 0 then
        v_den := v_den + (v_term->>'weight')::numeric;
        v_num := v_num + (v_term->>'earned')::numeric;
        v_reasons := v_reasons || v_term;
      end if;
    end if;

    -- «زيتون منتج» — the second line of §43's own example.
    if coalesce(cardinality(v_req.production_statuses), 0) > 0 and v_pj.production_status is not null then
      v_frac := case when v_pj.production_status = any (v_req.production_statuses) then 1 else 0 end;
      v_term := app.match_term(v_weights, 'production', v_frac,
                               case when v_frac >= 1 then 'production' else 'production_no' end);
      if (v_term->>'weight')::numeric > 0 then
        v_den := v_den + (v_term->>'weight')::numeric;
        v_num := v_num + (v_term->>'earned')::numeric;
        v_reasons := v_reasons || v_term;
      end if;
    end if;

    if coalesce(cardinality(v_req.plantation_systems), 0) > 0 and v_pj.plantation_system is not null then
      v_frac := case when v_pj.plantation_system = any (v_req.plantation_systems) then 1 else 0 end;
      v_term := app.match_term(v_weights, 'plantation', v_frac,
                               case when v_frac >= 1 then 'plantation' else 'plantation_no' end);
      if (v_term->>'weight')::numeric > 0 then
        v_den := v_den + (v_term->>'weight')::numeric;
        v_num := v_num + (v_term->>'earned')::numeric;
        v_reasons := v_reasons || v_term;
      end if;
    end if;

    -- How many. Three different answers, and the sentence says which one it is: the offer covers the demand, it
    -- covers part of it (the ratio, not a constant), or its own smallest basket is bigger than what was asked.
    if v_trees is not null and v_trees > 0 then
      if v_trees < v_min_trees then
        v_frac := 0;
        v_term := app.match_term(v_weights, 'trees', v_frac, 'trees_below_min',
                                 jsonb_build_object('min', v_min_trees, 'trees', v_trees, 'available', v_free));
      elsif v_free >= v_trees then
        v_frac := 1;
        v_term := app.match_term(v_weights, 'trees', v_frac, 'trees',
                                 jsonb_build_object('available', v_free, 'trees', v_trees));
      else
        v_frac := v_free::numeric / v_trees;
        v_term := app.match_term(v_weights, 'trees', v_frac, 'trees_partial',
                                 jsonb_build_object('available', v_free, 'trees', v_trees));
      end if;
      if (v_term->>'weight')::numeric > 0 then
        v_den := v_den + (v_term->>'weight')::numeric;
        v_num := v_num + (v_term->>'earned')::numeric;
        v_reasons := v_reasons || v_term;
      end if;
    end if;

    -- The plan, judged on its STRUCTURE and never on its amount, so a reader with no price rights gets the same
    -- ranking: does this offer offer the percentage the client chose, and does it price the duration?
    if v_req.payment_mode = 'installments' and v_req.down_payment_percent_option_id is not null then
      v_frac := case when exists (select 1 from app.project_down_percent_items(v_pj.id) o
                                  where o.id = v_req.down_payment_percent_option_id) then 1 else 0 end;
      -- Reset first: this variable outlives one iteration of the loop, and a stale list of percentages would
      -- be attributed to the wrong offer.
      v_offered := null;
      if v_frac < 1 then
        select string_agg(o.label_ar, '، ' order by o.min_number) into v_offered
        from app.project_down_percent_items(v_pj.id) o;
      end if;
      v_term := app.match_term(v_weights, 'down_payment', v_frac,
                               case when v_frac >= 1 then 'down_payment' else 'down_payment_no' end,
                               jsonb_build_object('percent', coalesce(v_down_label, ''),
                                                  'offered', coalesce(v_offered, '—')));
      if (v_term->>'weight')::numeric > 0 then
        v_den := v_den + (v_term->>'weight')::numeric;
        v_num := v_num + (v_term->>'earned')::numeric;
        v_reasons := v_reasons || v_term;
      end if;
    end if;

    if v_req.payment_mode = 'installments' and v_months is not null then
      v_frac := case when coalesce(v_pj.allows_installments, false)
                      and v_months <= app.setting_int('pricing.max_months', 0)
                      and exists (select 1 from public.financing_markups m
                                  where m.months = v_months and (m.project_id is null or m.project_id = v_pj.id))
                     then 1 else 0 end;
      v_term := app.match_term(v_weights, 'duration', v_frac,
                               case when v_frac >= 1 then 'duration' else 'duration_no' end,
                               jsonb_build_object('duration', coalesce(v_dur_label, v_months || ' شهر')));
      if (v_term->>'weight')::numeric > 0 then
        v_den := v_den + (v_term->>'weight')::numeric;
        v_num := v_num + (v_term->>'earned')::numeric;
        v_reasons := v_reasons || v_term;
      end if;
    end if;

    -- A percentage of what applied, so the weights never have to add up to 100. No applicable criterion at all
    -- (a demand that answered nothing) leaves the score null: the screen then ranks by free stock and says it is
    -- not matching on anything, instead of printing a 0 that reads as «this offer is wrong for him».
    v_score := case when v_den > 0 then round(100 * v_num / v_den, 1) end;

    v_money_out := '{}'::jsonb;
    if v_money then
      v_quote := app.project_quote_payload(v_pj.id, null, v_trees, v_req.payment_mode,
                                           v_req.down_payment_percent_option_id, v_req.duration_option_id, true);
      -- Key by key on purpose: app.project_quote_payload hands Finance the whole cost breakdown, and a matching
      -- list needs the price of a tree and the monthly, not the land rate and the margin.
      v_money_out := jsonb_build_object(
        'pricing', v_quote->>'pricing',
        'price_per_tree_millimes', (v_quote->>'price_per_tree_millimes')::bigint,
        'total_price_millimes', (v_quote->>'total_price_millimes')::bigint,
        'plan_status', v_quote->'installments'->>'status',
        'down_payment_millimes', (v_quote->'installments'->>'down_payment_millimes')::bigint,
        'monthly_millimes', (v_quote->'installments'->>'monthly_millimes')::bigint,
        'months', (v_quote->'installments'->>'months')::integer);
    end if;

    v_rows := v_rows || (jsonb_build_object(
      'project_id', v_pj.id,
      'project_code', v_pj.code,
      'project_name', v_pj.name,
      'status', v_pj.status::text,
      'governorate_id', v_pj.governorate_id,
      'governorate_ar', (select g.name_ar from public.governorates g where g.id = v_pj.governorate_id),
      'production_status', v_pj.production_status,
      'plantation_system', v_pj.plantation_system,
      'score', v_score,
      'trees_available', v_free,
      'trees_requested', v_trees,
      'min_trees', v_min_trees,
      'partial', v_trees is not null and v_free < v_trees and v_trees >= v_min_trees,
      'below_min_trees', v_trees is not null and v_trees < v_min_trees,
      -- The demand already names this offer: it is the one being discussed, not a suggestion.
      'is_requested_offer', v_req.project_id is not null and v_req.project_id = v_pj.id,
      'reasons', v_reasons) || v_money_out);
  end loop;

  select count(*)::integer into v_below
  from unnest(v_rows) as t(item)
  where (t.item->>'score') is not null and (t.item->>'score')::numeric < v_min;

  -- Best first, then the fullest offer, then the code so two equal offers never swap places between two reads.
  select coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb) into v_offers
  from (
    select t.item,
           row_number() over (order by (t.item->>'score')::numeric desc nulls last,
                                       (t.item->>'trees_available')::integer desc,
                                       t.item->>'project_code') as ord
    from unnest(v_rows) as t(item)
    where (t.item->>'score') is null or (t.item->>'score')::numeric >= v_min
    order by ord
    limit case when v_limit > 0 then v_limit end
  ) x;

  return jsonb_build_object(
    'request_id', v_req.id,
    'request_no', v_req.request_no,
    'person_id', v_req.person_id,
    'request_kind', v_req.request_kind,
    'min_score', v_min,
    'limit', v_limit,
    -- Everything the screen needs to be honest about what it is NOT showing.
    'offers_considered', v_considered,
    'offers_no_stock', v_no_stock,
    'offers_below_min_score', v_below,
    'money', v_money,
    'wants', jsonb_build_object(
      'trees', v_trees,
      'anywhere', v_req.invest_anywhere,
      'governorates', coalesce((select jsonb_agg(g.name_ar order by g.sort_order, g.id)
                                from public.governorates g
                                where g.id = any (v_req.invest_governorate_ids)), '[]'::jsonb),
      'project_type_unsure', v_req.project_type_unsure,
      'project_types', coalesce((select jsonb_agg(pt.label_ar order by pt.sort_order, pt.label_ar)
                                 from public.project_types pt
                                 where pt.id = any (v_req.project_type_ids)), '[]'::jsonb),
      'production_statuses', to_jsonb(v_req.production_statuses),
      'plantation_systems', to_jsonb(v_req.plantation_systems),
      'payment_mode', v_req.payment_mode,
      'down_payment_label_ar', v_down_label,
      'down_payment_percent', v_req.down_payment_percent,
      'duration_label_ar', v_dur_label,
      'duration_months', v_months,
      'requested_project_id', v_req.project_id),
    'offers', v_offers);
end $$;

revoke execute on function public.staff_match_offers(uuid, integer) from public, anon;
grant execute on function public.staff_match_offers(uuid, integer) to authenticated;

comment on function public.staff_match_offers(uuid, integer) is
  'Report v3 §43/§45: the offers that fit ONE client demand, ranked, each with the Arabic reason for its rank, its free stock and — for Finance and Admin only (app.can_price) — its price and monthly. Weights, floor, row count and every sentence come from the settings matching.* ; the score is a percentage of the criteria the demand actually answered. Staff only, a commercial inside their own files (app.can_see_person), and closed while the `matching` module is disabled (module_closed). Never counts a tree (app.offer_stock_payload) and never computes a price (app.project_quote_payload).';
