-- 038 · Matching: the offers that fit ONE client demand (report v3 §43, §45).
-- Migration supabase/pending/bb_22_matching.sql (draft; numbered at apply time).
--
-- RUN IT WITH THE DRAFT until that file is applied — the function does not exist in the live database yet:
--   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_22_matching.sql supabase/tests/038_matching.sql
-- After it is applied, `npm run db:test` runs it like every other file. A red run before that says
-- «function public.staff_match_offers(uuid, integer) does not exist» and names nothing else.
--
-- PERMISSIONS FIRST, because a matching list is an inventory X-ray: it says how much stock every offer has left
-- and, for Finance, what it costs. Who may ask, on whose file, and what a disabled module answers are therefore
-- the first three sections, before a single score is checked.
--
-- Runs against the live database inside a rolled-back transaction. Its first act is to take every real offer out
-- of the candidate set (status → 'draft'), so the four fixture offers below are the whole world this file
-- measures: real traffic can neither hide a failure nor cause one, and tomorrow's fifth published offer will not
-- turn this file red. Everything it measures — the flag, the weights, the floor, the row limit, the sentences —
-- is pinned inside the transaction and restored to nothing: the live configuration is untouched.

-- Said plainly, so a red run reads as «not applied yet» and not as «you broke matching».
do $$
begin
  if to_regprocedure('public.staff_match_offers(uuid, integer)') is null then
    raise exception 'supabase/pending/bb_22_matching.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/pending/bb_22_matching.sql supabase/tests/038_matching.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0 · Helpers
-- ---------------------------------------------------------------------------

create function pg_temp.mt_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm <> p_expected then
    raise exception 'expected error "%" but got "%" for %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

/** The matching payload for a demand, as the caller in force right now sees it. */
create function pg_temp.mt_match(p_request text) returns jsonb language sql as $$
  select public.staff_match_offers(p_request::uuid)
$$;

/** One offer of a payload, by its code — the rows are ranked, so never by position. */
create function pg_temp.mt_offer(p_payload jsonb, p_code text) returns jsonb language sql as $$
  select o from jsonb_array_elements(p_payload->'offers') o where o->>'project_code' = p_code
$$;

/** One reason of an offer, by its criterion key. */
create function pg_temp.mt_reason(p_offer jsonb, p_key text) returns jsonb language sql as $$
  select r from jsonb_array_elements(p_offer->'reasons') r where r->>'key' = p_key
$$;

select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 0b · Fixtures: the configuration, three staff, four offers and three demands
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin   uuid := gen_random_uuid();
  v_com     uuid := gen_random_uuid();
  v_fin     uuid := gen_random_uuid();
  v_plain   uuid := gen_random_uuid();
  v_class   uuid;
  v_type    uuid;
  v_id      uuid;
  v_code    text;
  v_status  uuid;
  v_person  uuid;
  v_dp20    uuid;
  v_dp30    uuid;
  v_d60     uuid;
  v_goal    public.option_items;
  v_phone   text;
begin
  -- The module is a Back Office one: 'internal' is the state that opens it for staff, and the file proves in §2
  -- that 'disabled' closes it again.
  update public.feature_flags set state = 'internal' where key = 'matching';

  -- Every knob this file reads, pinned to a known value. Not one of these numbers lives in the SQL of the
  -- matcher; that is the whole point of §5 and §6 below.
  update public.settings set value = $w${"location": 40, "project_type": 20, "production": 10,
                                         "plantation": 10, "trees": 30, "down_payment": 15, "duration": 15}$w$::jsonb
  where key = 'matching.weights';
  update public.settings set value = to_jsonb(0) where key = 'matching.min_score';
  update public.settings set value = to_jsonb(0) where key = 'matching.offers_limit';

  -- The candidate set is the four offers below and nothing else.
  update public.projects set status = 'draft' where status in ('published', 'internal');

  select c.id into v_class from public.tree_spacing_classes c where c.is_active order by c.sort_order, c.code limit 1;
  select t.id into v_type from public.project_types t where t.is_active order by t.sort_order limit 1;
  select o.id into v_dp20 from public.option_items o
  where o.list_key = 'down_payment_percent' and o.is_active order by o.min_number limit 1;
  select o.id into v_dp30 from public.option_items o
  where o.list_key = 'down_payment_percent' and o.is_active and o.id <> v_dp20 order by o.min_number limit 1;
  -- A duration the global markups price, so «the offer prices that duration» is a real yes for offer A.
  select o.id into v_d60 from public.option_items o
  where o.list_key = 'duration' and o.is_active
    and exists (select 1 from public.financing_markups m where m.months = o.min_number and m.project_id is null)
  order by o.min_number limit 1;
  select * into v_goal from public.option_items o
  where o.list_key = 'goal' and o.is_active order by o.sort_order limit 1;
  assert v_goal.id is not null, 'a calculator demand carries a goal (interest_requests_goal_check)';
  assert v_class is not null and v_type is not null and v_dp20 is not null and v_dp30 is not null and v_d60 is not null,
    'this file needs one spacing class, one project type, two down-payment percentages and one priced duration';
  perform set_config('test.mt_class', v_class::text, true);
  perform set_config('test.mt_type', v_type::text, true);
  perform set_config('test.mt_dp20', v_dp20::text, true);
  perform set_config('test.mt_d60', v_d60::text, true);

  insert into auth.users (id, aud, role, email, raw_user_meta_data) values
    (v_admin, 'authenticated', 'authenticated', 'mtc-admin-' || v_admin || '@test.local', '{"full_name":"Admin Matching"}'),
    (v_com,   'authenticated', 'authenticated', 'mtc-com-'   || v_com   || '@test.local', '{"full_name":"Commercial Matching"}'),
    (v_fin,   'authenticated', 'authenticated', 'mtc-fin-'   || v_fin   || '@test.local', '{"full_name":"Finance Matching"}'),
    (v_plain, 'authenticated', 'authenticated', 'mtc-plain-' || v_plain || '@test.local', '{"full_name":"Bla Dawr"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_com, 'commercial'), (v_fin, 'finance');
  perform set_config('test.mt_admin', v_admin::text, true);
  perform set_config('test.mt_com', v_com::text, true);
  perform set_config('test.mt_fin', v_fin::text, true);
  perform set_config('test.mt_plain', v_plain::text, true);

  -- Each offer is created as a draft, given its spacing class, and only then published. An offer with no class
  -- cannot be priced, and supabase/pending/bb_30_offer_publish_guard.sql refuses to let such a row enter a
  -- selling status at all — so publishing in one INSERT would tie this file's fate to whether that draft is
  -- applied. This order passes either way.
  --
  -- A · everything the demand asks for: same governorate, same type, producing, traditional, ten free trees,
  -- every percentage, installments priced.
  v_code := 'MTC-A-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, project_type_id, status, tree_count,
                               production_status, plantation_system, allows_installments)
  values (v_code, 'عرض يطابق', 34, v_type, 'draft', 10, 'producing', 'traditional', true)
  returning id into v_id;
  perform set_config('test.mt_a', v_id::text, true);
  perform set_config('test.mt_a_code', v_code, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.tree_pricing_rules (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes,
                                         annual_fee_per_tree_millimes, margin_mode, margin_percent_bp,
                                         price_rounding_millimes)
  values (v_id, 7000, 50000, 150000, 'percent', 1000, 1000);
  insert into public.trees (project_id, seq, code)
  select v_id, g, v_code || '-' || lpad(g::text, 4, '0') from generate_series(1, 10) g;
  update public.projects set status = 'published' where id = v_id;

  -- B · another governorate, no type, not producing, intensive, thirty free trees, sells twenty at a time,
  -- offers one percentage only (not the one the client chose) and refuses installments.
  v_code := 'MTC-B-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, status, tree_count, min_trees_per_order,
                               production_status, plantation_system, allows_installments)
  values (v_code, 'عرض بعيد', 31, 'draft', 30, 20, 'none', 'intensive', false)
  returning id into v_id;
  perform set_config('test.mt_b', v_id::text, true);
  perform set_config('test.mt_b_code', v_code, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.project_down_payment_percents (project_id, option_item_id) values (v_id, v_dp30);
  insert into public.trees (project_id, seq, code)
  select v_id, g, v_code || '-' || lpad(g::text, 4, '0') from generate_series(1, 30) g;
  update public.projects set status = 'published' where id = v_id;

  -- C · a perfect offer with nothing left to sell. §46: an offer that cannot be sold is never «best matching».
  v_code := 'MTC-C-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, project_type_id, status, tree_count,
                               production_status, plantation_system)
  values (v_code, 'عرض مكمّل', 34, v_type, 'draft', 3, 'producing', 'traditional')
  returning id into v_id;
  perform set_config('test.mt_c', v_id::text, true);
  perform set_config('test.mt_c_code', v_code, true);
  insert into public.project_spacing_classes (project_id, spacing_class_id) values (v_id, v_class);
  insert into public.trees (project_id, seq, code)
  select v_id, g, v_code || '-' || lpad(g::text, 4, '0') from generate_series(1, 3) g;
  update public.projects set status = 'published' where id = v_id;

  -- D · a perfect offer that is not on sale.
  v_code := 'MTC-D-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.projects (code, name, governorate_id, project_type_id, status, tree_count,
                               production_status, plantation_system)
  values (v_code, 'عرض مازال في الدرّاج', 34, v_type, 'draft', 5, 'producing', 'traditional')
  returning id into v_id;
  perform set_config('test.mt_d', v_id::text, true);
  perform set_config('test.mt_d_code', v_code, true);
  insert into public.trees (project_id, seq, code)
  select v_id, g, v_code || '-' || lpad(g::text, 4, '0') from generate_series(1, 5) g;

  select s.id into v_status from public.lead_statuses s
  where s.stage = 'new' and s.is_active order by s.is_stage_default desc, s.sort_order limit 1;

  -- P1 · the commercial's own client (COM-05), with the demand §43's example describes.
  loop
    v_phone := '+21696' || lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.persons p where p.phone_e164 = v_phone);
  end loop;
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at, last_request_at, assigned_to)
  values ('حريف المطابقة', v_phone, 34, v_status, now(), now(), v_com)
  returning id into v_person;
  perform set_config('test.mt_p1', v_person::text, true);

  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, residence_governorate_id, contact_channel, consent_text,
    request_kind, goal_option_id, goal_label_ar,
    invest_governorate_ids, project_type_ids, production_statuses, plantation_systems,
    tree_count_min, tree_count_max, payment_mode, down_payment_percent_option_id, down_payment_percent,
    duration_option_id, duration_months)
  values ('MTC-R1-' || substr(gen_random_uuid()::text, 1, 8), v_person, 'حريف المطابقة', v_phone, 34, 'phone',
          'موافقة تجريبية', 'calculator', v_goal.id, v_goal.label_ar,
          array[34]::smallint[], array[v_type], array['producing'],
          array['traditional'], 5, 5, 'installments', v_dp20,
          (select o.min_number from public.option_items o where o.id = v_dp20),
          v_d60, (select o.min_number::integer from public.option_items o where o.id = v_d60))
  returning id into v_id;
  perform set_config('test.mt_r1', v_id::text, true);

  -- R3 · the same client asking for more trees than any offer holds: §43 says nothing about partial stock, and
  -- this file pins the answer — score it, flag it, never hide it.
  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, residence_governorate_id, contact_channel, consent_text,
    request_kind, goal_option_id, goal_label_ar, invest_governorate_ids, project_type_unsure,
    tree_count_min, tree_count_max)
  values ('MTC-R3-' || substr(gen_random_uuid()::text, 1, 8), v_person, 'حريف المطابقة', v_phone, 34, 'phone',
          'موافقة تجريبية', 'calculator', v_goal.id, v_goal.label_ar, array[34]::smallint[], true, 50, 50)
  returning id into v_id;
  perform set_config('test.mt_r3', v_id::text, true);

  -- P2 · a client nobody was assigned: a commercial may not open this demand at all.
  loop
    v_phone := '+21695' || lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.persons p where p.phone_e164 = v_phone);
  end loop;
  insert into public.persons (full_name, phone_e164, governorate_id, status_id, consent_at, last_request_at)
  values ('حريف ملف آخر', v_phone, 34, v_status, now(), now())
  returning id into v_person;
  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, residence_governorate_id, contact_channel, consent_text,
    request_kind, goal_option_id, goal_label_ar, invest_governorate_ids, project_type_unsure,
    tree_count_min, tree_count_max)
  values ('MTC-R2-' || substr(gen_random_uuid()::text, 1, 8), v_person, 'حريف ملف آخر', v_phone, 34, 'phone',
          'موافقة تجريبية', 'calculator', v_goal.id, v_goal.label_ar, array[34]::smallint[], true, 5, 5)
  returning id into v_id;
  perform set_config('test.mt_r2', v_id::text, true);
end $$;

-- C's three trees are held, so it has nothing left to sell.
update public.trees
set state = 'reserved', held_by = current_setting('test.mt_p1')::uuid, allocated_at = now()
where project_id = current_setting('test.mt_c')::uuid;

-- ---------------------------------------------------------------------------
-- 1 · Who may ask, and on whose file
-- ---------------------------------------------------------------------------

set local role anon;
do $$
begin
  -- No grant at all: a visitor cannot reach the function, let alone the stock of every offer.
  perform pg_temp.mt_expect(
    'select public.staff_match_offers(' || quote_literal(current_setting('test.mt_r1')) || '::uuid)',
    'permission denied for function staff_match_offers');
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_plain'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- Signed in, no staff role: the grant is to `authenticated`, the refusal is app.is_staff().
  perform pg_temp.mt_expect(
    'select public.staff_match_offers(' || quote_literal(current_setting('test.mt_r1')) || '::uuid)', 'forbidden');
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_com'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v jsonb;
begin
  -- COM-05: their own file, and no other. The same test staff_allocate_trees uses, so the offers a commercial is
  -- shown are exactly the offers they may reserve on.
  perform pg_temp.mt_expect(
    'select public.staff_match_offers(' || quote_literal(current_setting('test.mt_r2')) || '::uuid)', 'forbidden');

  v := pg_temp.mt_match(current_setting('test.mt_r1'));
  assert jsonb_typeof(v->'offers') = 'array', 'a commercial reads the matches of their own client, got ' || coalesce(v::text, 'null');
  assert v->>'request_no' is not null and v->>'person_id' = current_setting('test.mt_p1'),
    'and the payload says which demand it answered';
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v jsonb;
begin
  v := pg_temp.mt_match(current_setting('test.mt_r1'));
  assert jsonb_typeof(v->'offers') = 'array', 'an admin reads any file';
  -- A demand that does not exist is not an empty match: the caller is told the id is wrong.
  perform pg_temp.mt_expect(
    'select public.staff_match_offers(' || quote_literal(gen_random_uuid()::text) || '::uuid)', 'invalid_request');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2 · A disabled module stays closed, in the database and not only on the screen
-- ---------------------------------------------------------------------------

update public.feature_flags set state = 'disabled' where key = 'matching';

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- «معطّل» is the owner's own switch (FLAG-01): while it is off the RPC refuses even the admin, so a caller
  -- that skipped moduleAccess() in TypeScript still gets nothing.
  perform pg_temp.mt_expect(
    'select public.staff_match_offers(' || quote_literal(current_setting('test.mt_r1')) || '::uuid)', 'module_closed');
end $$;
reset role;

update public.feature_flags set state = 'public' where key = 'matching';
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_com'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- 'public' opens it too, but it never opens it to a visitor: §1 already proved anon has no grant, and the
  -- staff check runs before the flag is read.
  assert jsonb_typeof(pg_temp.mt_match(current_setting('test.mt_r1'))->'offers') = 'array',
    'a published flag opens the module for staff';
end $$;
reset role;
update public.feature_flags set state = 'internal' where key = 'matching';

-- ---------------------------------------------------------------------------
-- 3 · The ranking, and the stock it is built on
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v  jsonb;
  va jsonb;
  vb jsonb;
begin
  v  := pg_temp.mt_match(current_setting('test.mt_r1'));
  va := pg_temp.mt_offer(v, current_setting('test.mt_a_code'));
  vb := pg_temp.mt_offer(v, current_setting('test.mt_b_code'));

  assert va is not null and vb is not null, 'both offers with free trees are returned, got ' || v->>'offers';
  assert pg_temp.mt_offer(v, current_setting('test.mt_c_code')) is null,
    'an offer whose trees are all held is never a «best matching offer» (§46)';
  assert pg_temp.mt_offer(v, current_setting('test.mt_d_code')) is null,
    'an offer that is not on sale is never proposed';
  assert (v->>'offers_no_stock')::integer = 1, 'and the payload says how many were dropped for lack of stock, got ' || v->>'offers_no_stock';
  assert (v->>'offers_considered')::integer = 2, 'two offers were scored, got ' || v->>'offers_considered';

  assert (va->>'score')::numeric > (vb->>'score')::numeric,
    'the offer that answers the demand ranks above the one that does not: '
    || coalesce(va->>'score', 'null') || ' vs ' || coalesce(vb->>'score', 'null');
  assert (va->>'score')::numeric = 100, 'an offer that answers every criterion scores 100, got ' || coalesce(va->>'score', 'null');

  -- Stock is read, never counted here: the number in the payload is the number staff_offer_stock reports.
  assert (va->>'trees_available')::integer
         = (public.staff_offer_stock(current_setting('test.mt_a')::uuid)->>'trees_available')::integer,
    'the free trees come from the one sanctioned reader';
  assert (va->>'trees_requested')::integer = 5 and (va->>'partial')::boolean = false
     and (va->>'below_min_trees')::boolean = false,
    'the demand asked for 5 of the 10 free trees, which is neither partial nor below the minimum';
  -- B sells twenty at a time; five is not a basket it has.
  assert (vb->>'below_min_trees')::boolean = true and (vb->>'min_trees')::integer = 20,
    'an offer whose smallest basket is bigger than the demand says so instead of disappearing';
  assert (va->>'is_requested_offer')::boolean = false,
    'a calculator demand names no offer, so none of them is the one being discussed';
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Every rank is explainable, in one Arabic sentence that lives in the settings
-- ---------------------------------------------------------------------------

do $$
declare
  v  jsonb;
  va jsonb;
  vb jsonb;
begin
  v  := pg_temp.mt_match(current_setting('test.mt_r1'));
  va := pg_temp.mt_offer(v, current_setting('test.mt_a_code'));
  vb := pg_temp.mt_offer(v, current_setting('test.mt_b_code'));

  -- Not one returned reason may be unreadable: a commercial has to say it on the phone.
  assert not exists (
    select 1
    from jsonb_array_elements(v->'offers') x(offer),
         lateral jsonb_array_elements(x.offer->'reasons') y(reason)
    where coalesce(btrim(y.reason->>'label_ar'), '') = ''),
    'every criterion comes back with its Arabic sentence';
  -- And not one may be weightless: a criterion the owner switched off is not shown as a reason at all.
  assert not exists (
    select 1
    from jsonb_array_elements(v->'offers') x(offer),
         lateral jsonb_array_elements(x.offer->'reasons') y(reason)
    where coalesce((y.reason->>'weight')::numeric, 0) <= 0),
    'a criterion with weight 0 is not scored and not shown';

  assert (pg_temp.mt_reason(va, 'location')->>'hit')::boolean = true,
    'offer A is in the governorate the client asked for';
  assert (pg_temp.mt_reason(vb, 'location')->>'hit')::boolean = false,
    'offer B is not, and says so rather than staying silent';
  assert (pg_temp.mt_reason(va, 'down_payment')->>'hit')::boolean = true
     and (pg_temp.mt_reason(vb, 'down_payment')->>'hit')::boolean = false,
    'the percentage the client chose is offered by A and not by B';
  assert (pg_temp.mt_reason(va, 'duration')->>'hit')::boolean = true
     and (pg_temp.mt_reason(vb, 'duration')->>'hit')::boolean = false,
    'the duration the client chose is priced by A and refused by B';
  assert pg_temp.mt_reason(vb, 'trees')->>'label_ar' like '%20%',
    'B''s sentence names its own smallest basket, got ' || coalesce(pg_temp.mt_reason(vb, 'trees')->>'label_ar', 'null');
end $$;

reset role;

-- The Arabic is a setting, not a string in the SQL: change the sentence, the answer changes.
update public.settings
set value = jsonb_set(value, '{location}', to_jsonb('علامة_اختبار {gov}'::text))
where key = 'matching.reason_labels';

set local role authenticated;
do $$
declare
  va jsonb;
begin
  va := pg_temp.mt_offer(pg_temp.mt_match(current_setting('test.mt_r1')), current_setting('test.mt_a_code'));
  assert pg_temp.mt_reason(va, 'location')->>'label_ar'
         = 'علامة_اختبار ' || (select g.name_ar from public.governorates g where g.id = 34),
    'the sentence comes from matching.reason_labels and its {gov} is filled with the offer''s own governorate, got '
    || coalesce(pg_temp.mt_reason(va, 'location')->>'label_ar', 'null');
end $$;
reset role;

update public.settings
set value = jsonb_set(value, '{location}', to_jsonb('في {gov}، كيما طلب'::text))
where key = 'matching.reason_labels';

-- ---------------------------------------------------------------------------
-- 5 · The weights are the settings, and nothing else
-- ---------------------------------------------------------------------------

update public.settings set value = '{"location": 10}'::jsonb where key = 'matching.weights';

set local role authenticated;
do $$
declare
  v  jsonb;
  va jsonb;
  vb jsonb;
begin
  v  := pg_temp.mt_match(current_setting('test.mt_r1'));
  va := pg_temp.mt_offer(v, current_setting('test.mt_a_code'));
  vb := pg_temp.mt_offer(v, current_setting('test.mt_b_code'));
  -- One weight left standing: the score is that criterion alone, which is only true if no other weight has a
  -- fallback number hidden in the SQL (the live 0013 matcher coalesces every missing weight to 25, 20, 15…).
  assert (va->>'score')::numeric = 100 and (vb->>'score')::numeric = 0,
    'with one weight the score is that criterion alone, got ' || coalesce(va->>'score', 'null')
    || ' and ' || coalesce(vb->>'score', 'null');
  assert jsonb_array_length(va->'reasons') = 1 and jsonb_array_length(vb->'reasons') = 1,
    'and the other criteria are not even shown';
end $$;
reset role;

update public.settings set value = '{}'::jsonb where key = 'matching.weights';

set local role authenticated;
do $$
declare
  va jsonb;
begin
  va := pg_temp.mt_offer(pg_temp.mt_match(current_setting('test.mt_r1')), current_setting('test.mt_a_code'));
  -- Every weight removed: there is nothing to rank on, and the honest answer is «no score», never a 0 that reads
  -- as «this offer is wrong for him».
  assert va is not null, 'the offers are still listed when nothing is weighted';
  assert jsonb_typeof(va->'score') = 'null', 'and their score is null, got ' || coalesce(va->>'score', 'null');
  assert jsonb_array_length(va->'reasons') = 0, 'with no reason attached';
end $$;
reset role;

update public.settings set value = '{"location": 10}'::jsonb where key = 'matching.weights';

-- ---------------------------------------------------------------------------
-- 6 · The floor and the row count are settings too
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb(50) where key = 'matching.min_score';

set local role authenticated;
do $$
declare
  v jsonb;
begin
  v := pg_temp.mt_match(current_setting('test.mt_r1'));
  assert pg_temp.mt_offer(v, current_setting('test.mt_b_code')) is null,
    'an offer under matching.min_score is not proposed';
  assert (v->>'offers_below_min_score')::integer = 1,
    'but the screen is told how many were held back, got ' || v->>'offers_below_min_score';
  assert (v->>'min_score')::numeric = 50, 'and which floor was applied';
end $$;
reset role;

update public.settings set value = to_jsonb(0) where key = 'matching.min_score';
update public.settings set value = to_jsonb(1) where key = 'matching.offers_limit';

set local role authenticated;
do $$
declare
  v jsonb;
begin
  v := pg_temp.mt_match(current_setting('test.mt_r1'));
  assert jsonb_array_length(v->'offers') = 1, 'matching.offers_limit decides how many rows come back';
  assert (v->'offers'->0->>'project_code') = current_setting('test.mt_a_code'),
    'and the one that comes back is the best, not the first';
end $$;
reset role;

update public.settings set value = to_jsonb(0) where key = 'matching.offers_limit';

-- ---------------------------------------------------------------------------
-- 7 · A price is a permission (PRJ-03), and removing it removes no ranking
-- ---------------------------------------------------------------------------

update public.settings set value = $w${"location": 40, "trees": 30, "down_payment": 15, "duration": 15}$w$::jsonb
where key = 'matching.weights';

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_fin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v  jsonb;
  va jsonb;
begin
  v  := pg_temp.mt_match(current_setting('test.mt_r1'));
  va := pg_temp.mt_offer(v, current_setting('test.mt_a_code'));
  assert (v->>'money')::boolean = true, 'Finance may see money';
  assert va ? 'price_per_tree_millimes' and (va->>'pricing') = 'ok',
    'and the price of a tree arrives with the match, got ' || coalesce(va->>'pricing', 'null');
  assert (va->>'total_price_millimes')::bigint
         = (va->>'price_per_tree_millimes')::bigint * (va->>'trees_requested')::integer,
    'the total is the one app.project_quote_payload computed, not a multiplication done here';
  perform set_config('test.mt_score_fin', va->>'score', true);
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_com'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v  jsonb;
  va jsonb;
begin
  v  := pg_temp.mt_match(current_setting('test.mt_r1'));
  va := pg_temp.mt_offer(v, current_setting('test.mt_a_code'));
  assert (v->>'money')::boolean = false, 'a commercial with no price role may not';
  assert not (va ? 'price_per_tree_millimes') and not (va ? 'total_price_millimes')
     and not (va ? 'monthly_millimes') and not (va ? 'pricing'),
    'so the money keys are absent, not null: ' || va::text;
  -- The ranking is built on the structure of the plan, never on its amount, so the same offer comes first for
  -- both readers with the same score.
  assert va->>'score' = current_setting('test.mt_score_fin'),
    'and the rank is identical without the prices: ' || coalesce(va->>'score', 'null')
    || ' vs ' || current_setting('test.mt_score_fin');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8 · Partial stock is scored and flagged, never hidden
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.mt_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v  jsonb;
  va jsonb;
begin
  -- R3 asks for 50 trees; A holds 10. Hiding A steals «خذ 10 توّا» from the call.
  v  := pg_temp.mt_match(current_setting('test.mt_r3'));
  va := pg_temp.mt_offer(v, current_setting('test.mt_a_code'));
  assert va is not null, 'an offer that covers part of the demand is still proposed';
  assert (va->>'partial')::boolean = true and (va->>'trees_requested')::integer = 50
     and (va->>'trees_available')::integer = 10,
    'and the screen is given both numbers, got ' || va::text;
  assert (va->>'score')::numeric < 100, 'a partial offer does not score like a full one';
  assert pg_temp.mt_reason(va, 'trees')->>'label_ar' like '%10%'
     and pg_temp.mt_reason(va, 'trees')->>'label_ar' like '%50%',
    'its sentence names both, got ' || coalesce(pg_temp.mt_reason(va, 'trees')->>'label_ar', 'null');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9 · Nothing was written: matching reads
-- ---------------------------------------------------------------------------

do $$
begin
  assert not exists (select 1 from public.audit_logs a where a.action like 'matching%'),
    'a matching call is a read and writes no audit row';
  assert (select count(*) from public.trees t where t.project_id = current_setting('test.mt_a')::uuid
          and t.state = 'available') = 10,
    'and it moves no tree';
end $$;
