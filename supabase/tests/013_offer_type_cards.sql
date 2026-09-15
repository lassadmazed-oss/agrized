-- Offer-type cards as data: the report's four offer types and the open choice are rows in its order,
-- carrying their drawing, picture and French copy; visitors read them, only an admin changes them, and a
-- demand snapshots the chosen card. Spec: report v3 §3, §40; v2 §8; PARC-04, LEAD-01, LEAD-02, MED-01.
--
-- This runs against the live database: codes and their relative order are checked rather than the
-- owner's wording, and the demand uses a phone nobody has.

-- 0032 retires these lists (plan Q-7) but this file submits their items: active again inside this rolled-back test only.
update public.option_items set is_active = true where list_key in ('down_payment', 'monthly_installment');

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
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios where code = 'young_trees')),
    'tree_count_option_id', null,
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and code = 'both'),
    'down_payment_option_id', (select id from public.option_items where list_key = 'down_payment' and code = 'dp_1000'),
    'installment_option_id', (select id from public.option_items where list_key = 'monthly_installment' and code = 'mi_80'),
    'contact_channel', 'whatsapp',
    'consent_text', 'أوافق',
    'ip_hash', 'test-scenarios-v2-hash'
  ) || p_overrides
$$;

-- 1 · The four offer types in the report's order, then the open choice, each with its drawing ---
do $$
declare
  v_spec   text[] := array['big_productive', 'young_trees', 'intensive_grove', 'bare_land', 'any'];
  v_order  text[];
begin
  select array_agg(s.code order by s.sort_order, s.code) into v_order
  from public.ownership_scenarios s
  where s.is_active and s.code = any (v_spec);
  assert v_order = v_spec, 'the four offer types and the open choice are active and in order, got ' || coalesce(v_order::text, 'none');

  assert (select s.is_any from public.ownership_scenarios s where s.code = 'any'), '«اقترحولي الأنسب» stays the open choice';
  assert not exists (select 1 from public.ownership_scenarios s where s.code = any (v_spec) and s.is_any and s.code <> 'any'),
    'the four offer types are real types, not open choices';

  assert not exists (select 1 from public.ownership_scenarios s where s.code = any (v_spec) and s.icon_code is null),
    'every card carries a drawing code, so no icon map is needed in the code';

  assert not exists (
    select 1 from public.ownership_scenarios s
    where (s.code, s.label_ar) in (
      ('big_productive', 'قطعة فيها زيتون كبير ومنتج'),
      ('intensive_grove', 'قطعة فيها غراسة مكثفة'),
      ('young_trees', 'زيتون صغير يكبر مع الوقت'),
      ('bare_land', 'أرض بيضاء نغرسوها'),
      ('any', 'ما يهمنيش النوع، نحب العرض الأنسب حسب ميزانيتي'))
  ), 'no card keeps its pre-report seeded label';
end $$;

-- 2 · A picture is an https address with alternative text; a drawing is a plain code (MED-01)
do $$
begin
  begin
    update public.ownership_scenarios set image_url = 'http://example.com/card.jpg', image_alt_ar = 'أرض بيضاء'
    where code = 'bare_land';
    raise exception 'expected a non-https picture to be refused but the update succeeded';
  exception when check_violation then
    null;
  end;

  begin
    update public.ownership_scenarios set image_url = 'https://example.com/card.jpg', image_alt_ar = '   '
    where code = 'bare_land';
    raise exception 'expected a picture without alternative text to be refused but the update succeeded';
  exception when check_violation then
    null;
  end;

  begin
    update public.ownership_scenarios set icon_code = 'Big Tree' where code = 'bare_land';
    raise exception 'expected a malformed drawing code to be refused but the update succeeded';
  exception when check_violation then
    null;
  end;
end $$;

-- 3 · Visitors read every card field and change none (PARC-04) ------------------
do $$
declare
  v_cards  bigint;
  v_drawn  bigint;
begin
  set local role anon;

  select count(*), count(x.icon_code) into v_cards, v_drawn
  from (
    select s.icon_code, s.image_url, s.image_alt_ar, s.image_alt_fr, s.description_fr
    from public.ownership_scenarios s
    where s.is_active
  ) x;
  assert v_cards >= 5 and v_drawn >= 5,
    'a visitor reads the card fields, got ' || v_cards || ' cards and ' || v_drawn || ' drawing codes';

  begin
    update public.ownership_scenarios set image_url = null where code = 'any';
    raise exception 'expected a visitor update to be refused but it ran';
  exception when insufficient_privilege then
    null;
  end;

  reset role;
end $$;

-- 4 · A «غراسة جديدة» demand snapshots the card as chosen (LEAD-02) --------------
do $$
declare
  v_card  public.ownership_scenarios;
  v_res   jsonb;
  v_req   public.interest_requests;
begin
  select * into v_card from public.ownership_scenarios s where s.code = 'young_trees';

  v_res := public.submit_interest_request(pg_temp.payload('{}'));
  select * into v_req from public.interest_requests r where r.request_no = v_res->>'request_no';

  assert not v_req.is_duplicate, 'the test phone belongs to nobody, so the demand is not a duplicate';
  assert v_req.scenario_ids = array[v_card.id], 'the chosen card is kept on the demand';
  assert v_req.scenario_labels = array[v_card.label_ar],
    'the card label is kept as displayed, got ' || v_req.scenario_labels::text;
  assert v_req.project_type_ids = array_remove(array[v_card.project_type_id], null),
    'the card project type is snapshotted, got ' || v_req.project_type_ids::text;
  assert not v_req.project_type_unsure or v_card.project_type_id is null, 'a typed card is not recorded as an open choice';
  assert v_req.plantation_systems = array_remove(array[v_card.plantation_system], null)
     and v_req.production_statuses = array_remove(array[v_card.production_status], null),
    'the plantation and production constraints are copied from the card, got '
    || v_req.plantation_systems::text || ' / ' || v_req.production_statuses::text;
end $$;

-- 5 · Only an admin sets a card picture (PARC-04, MED-01) -----------------------
do $$
declare
  v_admin  uuid := gen_random_uuid();
  v_sales  uuid := gen_random_uuid();
  v_rows   bigint;
begin
  insert into auth.users (id, email) values
    (v_admin, 'scenarios-admin-' || v_admin || '@test.local'),
    (v_sales, 'scenarios-sales-' || v_sales || '@test.local');
  update public.profiles set full_name = 'Admin Scenarios', is_active = true where id = v_admin;
  update public.profiles set full_name = 'Sales Scenarios', is_active = true where id = v_sales;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin'), (v_sales, 'commercial');

  perform set_config('request.jwt.claims', json_build_object('sub', v_sales)::text, true);
  set local role authenticated;
  update public.ownership_scenarios set image_url = 'https://example.com/card.jpg', image_alt_ar = 'زيتون مكثّف'
  where code = 'intensive_grove';
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'a sales user cannot change a card, updated ' || v_rows;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  update public.ownership_scenarios
  set image_url = 'https://example.com/card.jpg', image_alt_ar = 'زيتون مكثّف', image_alt_fr = 'Oliviers en intensif'
  where code = 'intensive_grove';
  get diagnostics v_rows = row_count;
  assert v_rows = 1, 'an admin sets a card picture with its alternative text, updated ' || v_rows;
  reset role;

  assert (select s.image_url from public.ownership_scenarios s where s.code = 'intensive_grove') = 'https://example.com/card.jpg',
    'the picture address is stored as given';
end $$;
