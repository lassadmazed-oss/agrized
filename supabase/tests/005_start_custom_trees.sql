-- /start: the page copy lives in settings, and a typed number of olive trees is validated by the
-- database, snapshotted like a chosen option and counted through tree_count_min.
-- Spec: MIL-01, MIL-02, PRN-02, LEAD-01, LEAD-02, PARC-02.
--
-- This runs against the live database: one snapshot for the whole file, a phone nobody uses, and
-- limits read from settings, so real traffic or a Back Office edit cannot make it fail.
set transaction isolation level repeatable read;

do $$
declare
  v_phone text;
begin
  loop
    v_phone := '+21697' || lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.persons where phone_e164 = v_phone)
      and not exists (select 1 from public.interest_requests where phone_e164 = v_phone);
  end loop;
  perform set_config('test.phone', v_phone, true);
end $$;

create function pg_temp.payload(p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'سامي الزيتوني',
    'phone_e164', current_setting('test.phone'),
    'residence_governorate_id', 34,
    'invest_governorate_ids', jsonb_build_array(34),
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios where code = 'big_productive')),
    'tree_count_option_id', null,
    'desired_area_option_id', (select id from public.option_items where list_key = 'desired_area' and code = 'area_500'),
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and code = 'both'),
    'down_payment_option_id', (select id from public.option_items where list_key = 'down_payment' and code = 'dp_1000'),
    'installment_option_id', (select id from public.option_items where list_key = 'monthly_installment' and code = 'mi_80'),
    'contact_channel', 'whatsapp',
    'consent_text', 'أوافق',
    'ip_hash', 'test-start-hash'
  ) || p_overrides
$$;

-- 1 · Every text of the page is a public setting (MIL-02, PRN-02) ---------------
do $$
declare
  v_keys  text[] := array[
    'site.trees_question_fr', 'site.trees_subtitle', 'site.trees_subtitle_fr', 'site.style_question_fr',
    'site.trees_other_link',
    'start.capacity_title', 'start.capacity_title_fr', 'start.capacity_hint', 'start.capacity_hint_fr',
    'start.summary_title', 'start.summary_title_fr',
    'start.row_trees', 'start.row_trees_fr', 'start.row_type', 'start.row_type_fr',
    'start.row_down', 'start.row_down_fr', 'start.row_installment', 'start.row_installment_fr',
    'start.continue', 'start.continue_fr', 'start.continue_hint', 'start.continue_hint_fr',
    'start.secure_note', 'start.secure_note_fr',
    'start.home_label', 'start.home_label_fr', 'start.breadcrumb', 'start.breadcrumb_fr',
    'start.custom_label', 'start.custom_label_fr', 'start.custom_placeholder', 'start.custom_placeholder_fr',
    'start.custom_hint', 'start.custom_hint_fr',
    'start.trees_unit', 'start.trees_unit_fr', 'start.per_month', 'start.per_month_fr',
    'start.tier_taglines', 'start.values',
    'million.custom_trees_min', 'million.custom_trees_max'
  ];
  v_found bigint;
begin
  select count(*) into v_found from public.settings s where s.key = any (v_keys) and s.is_public;
  assert v_found = cardinality(v_keys),
    'every /start setting exists and is public: expected ' || cardinality(v_keys) || ', got ' || v_found;

  -- The limits of the typed number come from settings, never from the code
  assert app.setting_int('million.custom_trees_min', 0) >= 1, 'the custom minimum is a positive setting';
  assert app.setting_int('million.custom_trees_max', 0) >= app.setting_int('million.custom_trees_min', 0),
    'the custom maximum is a setting no smaller than the minimum';

  -- The taglines cover the typed number and the open choice
  assert (select value ? 'custom' and value ? 'trees_any' from public.settings where key = 'start.tier_taglines'),
    'the taglines carry an entry for the typed number and the open choice';

  assert exists (select 1 from public.site_media where slot = 'start.side'),
    'the /start photo slot exists';
end $$;

-- 2 · A typed number is snapshotted like an option and counted exactly (MIL-01, LEAD-02)
do $$
declare
  v_before  jsonb := public.million_progress();
  v_after   jsonb;
  v_req     public.interest_requests;
  v_res     jsonb;
  v_trees0  bigint := (v_before->>'trees_requested')::bigint;
  v_min     integer := app.setting_int('million.custom_trees_min', 1);
  v_max     integer := app.setting_int('million.custom_trees_max', 5000);
  v_n       integer := least(greatest(37, v_min), v_max);
  v_unit    text := app.setting_text('start.trees_unit', 'زيتونة');
begin
  v_res := public.submit_interest_request(pg_temp.payload(jsonb_build_object('tree_count_custom', v_n::text)));
  select * into v_req from public.interest_requests where request_no = v_res->>'request_no';

  assert v_req.tree_count_option_id is null, 'a typed number points to no option row';
  assert v_req.tree_count_code = 'custom', 'a typed number is marked custom, got ' || coalesce(v_req.tree_count_code, 'null');
  assert v_req.tree_count_label_ar = v_n::text || ' ' || v_unit,
    'the label is the number and the unit setting, got ' || coalesce(v_req.tree_count_label_ar, 'null');
  assert v_req.tree_count_min = v_n and v_req.tree_count_max = v_n, 'the typed number is both bounds';
  assert not v_req.is_duplicate, 'the test phone belongs to nobody, so the request is not a duplicate';

  -- PARC-02: the typed number says nothing about the surface
  assert v_req.desired_area_min_m2 = 500, 'the surface is stored as chosen, not derived from the number';

  v_after := public.million_progress();
  assert (v_after->>'trees_requested')::bigint = v_trees0 + v_n,
    'the counter adds exactly the typed trees, got ' || (v_after->>'trees_requested');

  -- 3 · The database stays strict: the page converts digits, the function does not
  begin
    perform public.submit_interest_request(pg_temp.payload(jsonb_build_object('tree_count_custom', '٣٧')));
    raise exception 'expected invalid_tree_custom for Arabic-Indic digits but the call succeeded';
  exception when others then
    if sqlerrm <> 'invalid_tree_custom' then
      raise exception 'expected invalid_tree_custom for Arabic-Indic digits but got "%"', sqlerrm;
    end if;
  end;

  -- 4 · Below the minimum
  begin
    perform public.submit_interest_request(pg_temp.payload(jsonb_build_object('tree_count_custom', (v_min - 1)::text)));
    raise exception 'expected invalid_tree_custom below the minimum but the call succeeded';
  exception when others then
    if sqlerrm <> 'invalid_tree_custom' then
      raise exception 'expected invalid_tree_custom below the minimum but got "%"', sqlerrm;
    end if;
  end;

  -- 5 · Above the maximum
  begin
    perform public.submit_interest_request(pg_temp.payload(jsonb_build_object('tree_count_custom', (v_max + 1)::text)));
    raise exception 'expected invalid_tree_custom above the maximum but the call succeeded';
  exception when others then
    if sqlerrm <> 'invalid_tree_custom' then
      raise exception 'expected invalid_tree_custom above the maximum but got "%"', sqlerrm;
    end if;
  end;

  -- 6 · Not a whole number
  begin
    perform public.submit_interest_request(pg_temp.payload(jsonb_build_object('tree_count_custom', 'abc')));
    raise exception 'expected invalid_tree_custom for text but the call succeeded';
  exception when others then
    if sqlerrm <> 'invalid_tree_custom' then
      raise exception 'expected invalid_tree_custom for text but got "%"', sqlerrm;
    end if;
  end;

  begin
    perform public.submit_interest_request(pg_temp.payload(jsonb_build_object('tree_count_custom', '37.5')));
    raise exception 'expected invalid_tree_custom for a decimal but the call succeeded';
  exception when others then
    if sqlerrm <> 'invalid_tree_custom' then
      raise exception 'expected invalid_tree_custom for a decimal but got "%"', sqlerrm;
    end if;
  end;

  -- 7 · A card and a typed number together is not a choice
  begin
    perform public.submit_interest_request(pg_temp.payload(jsonb_build_object(
      'tree_count_option_id', (select id from public.option_items where list_key = 'tree_count' and code = 'trees_100'),
      'tree_count_custom', v_n::text
    )));
    raise exception 'expected invalid_tree_choice for option + custom but the call succeeded';
  exception when others then
    if sqlerrm <> 'invalid_tree_choice' then
      raise exception 'expected invalid_tree_choice for option + custom but got "%"', sqlerrm;
    end if;
  end;

  -- Nothing refused above leaked into the counter
  v_after := public.million_progress();
  assert (v_after->>'trees_requested')::bigint = v_trees0 + v_n,
    'refused requests add nothing, got ' || (v_after->>'trees_requested');
end $$;

-- 8 · The Back Office finds a typed number by range, exactly like a card (PARC-02)
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_n     integer;
  v_found bigint;
begin
  select r.tree_count_min into v_n from public.interest_requests r
  where r.phone_e164 = current_setting('test.phone') and r.tree_count_code = 'custom';

  insert into auth.users (id, email) values (v_admin, 'start-admin@test.local');
  update public.profiles set full_name = 'Admin Start', is_active = true where id = v_admin;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  set local role authenticated;

  select count(*) into v_found
  from public.crm_search_requests(jsonb_build_object('trees_min', v_n - 3, 'trees_max', v_n + 3), 500)
  where tree_count_code = 'custom' and phone_e164 = current_setting('test.phone');
  assert v_found = 1, 'the typed number is found in a range around it, got ' || v_found;

  select count(*) into v_found
  from public.crm_search_requests(jsonb_build_object('trees_min', v_n + 50, 'trees_max', v_n + 100), 500)
  where tree_count_code = 'custom' and phone_e164 = current_setting('test.phone');
  assert v_found = 0, 'the typed number is not returned for a range above it, got ' || v_found;

  reset role;
end $$;
