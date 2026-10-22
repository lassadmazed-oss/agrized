-- «مشروع المليون زيتونة»: the tree count is snapshotted, and the public counter shows real rows only.
-- Spec: MIL-01, MIL-02, PARC-02, LEAD-02, LEAD-04.

-- 0032 retires these lists (plan Q-7) but this file submits their items: active again inside this rolled-back test only.
update public.option_items set is_active = true where list_key in ('desired_area', 'down_payment', 'monthly_installment');

create function pg_temp.payload(p_overrides jsonb) returns jsonb language sql as $$
-- THE TWO COUNTS THIS FILE USES ARE ITS OWN (added 2026-10-13).
-- It used to name trees_100 and trees_250 out of the owner's live list, and every assertion below — the
-- label «100 زيتونة», the range 100..100, the +100 on the counter, the 50..250 CRM search — was really an
-- assertion about his Back Office. He retired the 100, 250 and 500 cards on 2026-10-13 and the file went
-- red, twice over: the intake refuses a retired choice (invalid_tree_choice), which is correct behaviour
-- and not a bug to work around. A test that counts trees owns the counts it counts.
--
-- THE OPEN END, THE OPEN CHOICE AND THE RETIRED ONE ARE ITS OWN TOO (2026-10-22), for the same reason and
-- after the same lesson: the file still reached for trees_500p, trees_any and trees_250p, and when 0145
-- moved the open-ended card from «أكثر من 500» down to «أكثر من 50» the fifth block went red. None of the
-- three was a fact about this code — each was a fact about which cards the owner happened to be offering.
insert into public.option_items (list_key, code, label_ar, label_fr, min_number, max_number, sort_order, is_active)
values ('tree_count', 'test_trees_100',  '100 زيتونة',   '100 oliviers', 100,  100,  9001, true),
       ('tree_count', 'test_trees_250',  '250 زيتونة',   '250 oliviers', 250,  250,  9002, true),
       ('tree_count', 'test_trees_open', 'أكثر من 500',  'Plus de 500',  500,  null, 9003, true),
       ('tree_count', 'test_trees_any',  'اقترحولي',     'Proposez-moi', null, null, 9004, true),
       ('tree_count', 'test_trees_gone', 'بطّلناها',     'Retirée',      250,  250,  9005, false)
on conflict (list_key, code) do update set
  min_number = excluded.min_number, max_number = excluded.max_number, is_active = excluded.is_active;

  select jsonb_build_object(
    'full_name', 'سامي الزيتوني',
    'phone_e164', '+21697111222',
    'residence_governorate_id', 34,
    'invest_governorate_ids', jsonb_build_array(34),
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios where code = 'big_productive')),
    'tree_count_option_id', (select id from public.option_items where list_key = 'tree_count' and code = 'test_trees_100'),
    'desired_area_option_id', (select id from public.option_items where list_key = 'desired_area' and code = 'area_500'),
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and code = 'both'),
    'down_payment_option_id', (select id from public.option_items where list_key = 'down_payment' and code = 'dp_1000'),
    'installment_option_id', (select id from public.option_items where list_key = 'monthly_installment' and code = 'mi_80'),
    'contact_channel', 'whatsapp',
    'consent_text', 'أوافق',
    'ip_hash', 'test-million-hash'
  ) || p_overrides
$$;

do $$
declare
  v_before   jsonb := public.million_progress();
  v_after    jsonb;
  v_req      public.interest_requests;
  v_res      jsonb;
  v_trees0   bigint := (v_before->>'trees_requested')::bigint;
  v_people0  bigint := (v_before->>'participants')::bigint;
begin
  -- The goal comes from settings, never from the code (MIL-02)
  assert (v_before->>'goal')::bigint = app.setting_int('million.goal', 0),
    'the goal is read from the million.goal setting';

  -- 1 · A stated choice is snapshotted on the request (LEAD-02) --------------
  v_res := public.submit_interest_request(pg_temp.payload('{}'));
  select * into v_req from public.interest_requests where request_no = v_res->>'request_no';

  assert v_req.tree_count_code = 'test_trees_100', 'the tree count code is kept, got ' || coalesce(v_req.tree_count_code, 'null');
  assert v_req.tree_count_label_ar = '100 زيتونة', 'the tree count label is kept as displayed';
  assert v_req.tree_count_min = 100 and v_req.tree_count_max = 100, 'the tree count range is kept';

  -- PARC-02: asking for 100 trees says nothing about the surface, and the reverse
  assert v_req.desired_area_min_m2 = 500, 'the surface is stored as chosen';
  assert v_req.tree_count_min <> v_req.desired_area_min_m2::integer,
    'the tree count is never copied from the surface';

  -- 2 · The counter moves by exactly what was asked (MIL-01) -----------------
  v_after := public.million_progress();
  assert (v_after->>'trees_requested')::bigint = v_trees0 + 100,
    'the counter adds the 100 trees that were asked for, got ' || (v_after->>'trees_requested');
  assert (v_after->>'participants')::bigint = v_people0 + 1, 'the new person is counted once';

  -- 3 · A second request from the same phone is a duplicate and is not counted twice (LEAD-04)
  perform public.submit_interest_request(pg_temp.payload(jsonb_build_object(
    'tree_count_option_id', (select id from public.option_items where list_key = 'tree_count' and code = 'test_trees_250')
  )));
  v_after := public.million_progress();
  assert (v_after->>'trees_requested')::bigint = v_trees0 + 100,
    'a duplicate request does not inflate the counter, got ' || (v_after->>'trees_requested');
  assert (v_after->>'participants')::bigint = v_people0 + 1, 'the same person is still one participant';

  -- 4 · "اقترحولي" states no number, so it adds nothing rather than a guess (MIL-01)
  perform public.submit_interest_request(pg_temp.payload(jsonb_build_object(
    'phone_e164', '+21697111333',
    'tree_count_option_id', (select id from public.option_items where list_key = 'tree_count' and code = 'test_trees_any')
  )));
  v_after := public.million_progress();
  assert (v_after->>'trees_requested')::bigint = v_trees0 + 100,
    'an open choice adds no invented trees, got ' || (v_after->>'trees_requested');
  assert (v_after->>'participants')::bigint = v_people0 + 2, 'but the person is a participant';

  -- 5 · "أكثر من 500" counts its lower bound only, never more than was said
  perform public.submit_interest_request(pg_temp.payload(jsonb_build_object(
    'phone_e164', '+21697111444',
    'tree_count_option_id', (select id from public.option_items where list_key = 'tree_count' and code = 'test_trees_open')
  )));
  v_after := public.million_progress();
  assert (v_after->>'trees_requested')::bigint = v_trees0 + 600,
    'an open-ended range counts its lower bound, got ' || (v_after->>'trees_requested');

  -- 6 · A choice AgriZed retired from the list is refused, even though the row still exists (LEAD-01)
  begin
    perform public.submit_interest_request(pg_temp.payload(jsonb_build_object(
      'phone_e164', '+21697111777',
      'tree_count_option_id', (select id from public.option_items where list_key = 'tree_count' and code = 'test_trees_gone')
    )));
    raise exception 'expected a retired option to be refused but the call succeeded';
  exception when others then
    if sqlerrm <> 'invalid_tree_choice' then
      raise exception 'expected invalid_tree_choice for a retired option but got "%"', sqlerrm;
    end if;
  end;

  -- 7 · The tree count is a wrong value like any other
  begin
    perform public.submit_interest_request(pg_temp.payload(jsonb_build_object(
      'phone_e164', '+21697111555',
      'tree_count_option_id', '00000000-0000-0000-0000-000000000000'
    )));
    raise exception 'expected invalid_tree_choice but the call succeeded';
  exception when others then
    if sqlerrm <> 'invalid_tree_choice' then
      raise exception 'expected invalid_tree_choice but got "%"', sqlerrm;
    end if;
  end;

  -- 8 · The tree count is missing when it was not asked, and that is allowed
  perform public.submit_interest_request(pg_temp.payload(jsonb_build_object(
    'phone_e164', '+21697111666',
    'tree_count_option_id', null
  )));
  select * into v_req from public.interest_requests where phone_e164 = '+21697111666';
  assert v_req.tree_count_option_id is null, 'a request without a tree count is accepted';
end $$;

-- 9 · The Back Office can search by tree count, independently of the surface (PARC-02)
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_found bigint;
begin
  insert into auth.users (id, email) values (v_admin, 'million-admin@test.local');
  update public.profiles set full_name = 'Admin Million', is_active = true where id = v_admin;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;

  -- 100 trees is inside 50..250
  select count(*) into v_found
  from public.crm_search_requests(jsonb_build_object('trees_min', 50, 'trees_max', 250))
  where tree_count_code = 'test_trees_100';
  assert v_found >= 1, 'the 100-tree request is found in the 50..250 range';

  -- ... and outside 10..40
  select count(*) into v_found
  from public.crm_search_requests(jsonb_build_object('trees_min', 10, 'trees_max', 40))
  where tree_count_code = 'test_trees_100';
  assert v_found = 0, 'the 100-tree request is not returned for a 10..40 search';

  -- Requests with no stated number are only included when asked for
  select count(*) into v_found
  from public.crm_search_requests(jsonb_build_object('trees_min', 10, 'trees_max', 40, 'include_trees_any', true))
  where tree_count_code = 'test_trees_any';
  assert v_found >= 1, 'open choices appear when include_trees_any is set';

  reset role;
end $$;
