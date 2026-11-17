-- 0164 · «لمن الزيتونة؟» and the tree's name: the list, its lines, and both answers kept with the demand.

update public.option_items set is_active = true where list_key in ('desired_area', 'priority', 'down_payment', 'monthly_installment');

create function pg_temp.story_payload(p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'اختبار الحكاية',
    'phone_e164', '+21699' || lpad((floor(random() * 1000000))::bigint::text, 6, '0'),
    'residence_governorate_id', 34,
    'invest_governorate_ids', jsonb_build_array(34),
    'scenario_ids', jsonb_build_array((select id from public.ownership_scenarios where code = 'big_productive')),
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and code = 'both'),
    'contact_channel', 'whatsapp',
    'contact_time_option_id', (select id from public.option_items where list_key = 'contact_time' and code = 'evening'),
    'consent_text', 'أوافق',
    'ip_hash', 'story-' || md5(random()::text)
  ) || p_overrides
$$;

do $$
declare
  v_child  public.option_items;
  v_codes  text[];
  v_lines  jsonb;
  v_out    jsonb;
  v_req    public.interest_requests;
begin
  -- ── the list, in the Back Office's own lists, with a line for every answer ──────────────────────────────
  assert exists (select 1 from public.option_lists where key = 'tree_for'), 'tree_for is a list the owner edits';
  select array_agg(code order by sort_order) into v_codes from public.option_items where list_key = 'tree_for' and is_active;
  assert v_codes @> array['self', 'child', 'parent', 'gift', 'abroad'], 'the five stories are offered, got ' || v_codes::text;
  select value into v_lines from public.settings where key = 'start.for_lines';
  assert (select bool_and(v_lines ? c and coalesce(v_lines->c->>'ar', '') <> '') from unnest(v_codes) c),
    'every answer has its line: ' || v_lines::text;
  assert (select count(*) from public.translations t join public.option_items o on o.id::text = t.entity_key
          where o.list_key = 'tree_for' and t.entity = 'option_item') >= 20, 'each answer is drafted in the four other languages';
  assert (select count(*) from public.settings where key in ('start.for_title', 'start.for_title_fr', 'start.cert_title',
          'start.cert_name_label', 'start.cert_pending', 'home.for_title')) = 6, 'the page''s words exist';

  -- ── both answers travel with the demand ─────────────────────────────────────────────────────────────────
  select * into v_child from public.option_items where list_key = 'tree_for' and code = 'child';
  v_out := public.submit_interest_request(pg_temp.story_payload(jsonb_build_object(
             'tree_for_option_id', v_child.id, 'tree_name', '  زيتونة ياسمين  ')));
  select * into v_req from public.interest_requests where request_no = v_out->>'request_no';
  assert v_req.tree_for_option_id = v_child.id and v_req.tree_for_label_ar = v_child.label_ar,
    'who the tree is for is kept, with its label as it read that day';
  assert v_req.tree_name = 'زيتونة ياسمين', 'the name is kept, trimmed, got ' || coalesce(v_req.tree_name, 'null');

  -- A name is cut to 40 characters, control characters dropped; an unknown or absent answer is simply not kept.
  v_out := public.submit_interest_request(pg_temp.story_payload(jsonb_build_object(
             'tree_for_option_id', gen_random_uuid(), 'tree_name', repeat('ز', 60) || chr(7))));
  select * into v_req from public.interest_requests where request_no = v_out->>'request_no';
  assert v_req.tree_for_option_id is null and v_req.tree_for_label_ar is null, 'an unknown answer is not kept';
  assert char_length(v_req.tree_name) = 40 and position(chr(7) in v_req.tree_name) = 0, 'the name is cut to 40';

  v_out := public.submit_interest_request(pg_temp.story_payload('{"tree_name": "   "}'));
  select * into v_req from public.interest_requests where request_no = v_out->>'request_no';
  assert v_req.tree_for_option_id is null and v_req.tree_name is null, 'nothing answered, nothing kept';
end $$;
