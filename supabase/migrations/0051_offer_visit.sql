-- Pending · «نحب نزور الأرض» records something (owner, 2026-09-18: «the button doesn't work, it shows a popup»).
--
-- The offer page has two doors: «سجّل اهتمامك بهذا العرض» and «نحب نزور الأرض». The second one opened a card that
-- repeated the visit text and then pointed back at the first door, so a visitor who wanted to see the land before
-- deciding could click it, read a paragraph, and leave without AgriZed ever knowing they asked.
--
-- The column has existed since 0030 and the CRM already filters and exports on it: search_requests takes
-- wants_visit, and submit_interest_request (the calculator's intake) fills it. Only this function ignored the key.
--
-- Nothing else changes. The body below is 0049's, with one local declared and one column written.

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
  v_channel     public.contact_channel;
  v_time        public.option_items;
  v_project     public.projects;
  v_trees       integer;
  v_trees_label text;
  v_quote       jsonb;
  v_pricing     text;
  v_class_id    uuid;
  v_class_label text;
  v_area_tree   numeric;
  v_area_total  numeric;
  v_per_tree    bigint;
  v_total       bigint;
  v_annual      bigint;
  v_annual_all  bigint;
  v_status_id   uuid;
  v_person_id   uuid;
  v_inserted    boolean;
  v_assignee    uuid;
  v_year        text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_request_no  text;
  v_request_id  uuid;
  v_visit       boolean := case when jsonb_typeof(p->'wants_visit') = 'boolean' then (p->>'wants_visit')::boolean end;
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

  -- Priced by the builder the offer page itself prices with (0034, 0048), so a request never carries a figure
  -- the visitor could not see. When prices are closed the request is still taken, without money.
  v_quote       := app.project_quote_payload(v_project.id, null, v_trees, 'cash', null, null, false);
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

  -- The offer columns say which offer and what it cost that day; the shared columns keep the CRM lists,
  -- filters, exports and the tree counter working without a second set of screens.
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
    contact_channel, contact_time_option_id, contact_time_label_ar,
    wants_visit,
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
    v_channel, v_time.id, v_time.label_ar,
    v_visit,
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
  'Intake of one offer page (0049, visit intent added here): identity like submit_interest_request, a visible offer, '
  '1..tree_count trees, the offer''s price and yearly fee snapshotted from app.project_quote_payload, and whether '
  'the visitor asked to see the land first. Server-side only.';
