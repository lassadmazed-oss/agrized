-- 0003 · Landowner offers, SMS outbox, public intake RPCs
-- Spec: LEAD-02..06, LEAD-11..12, LAND-01..05, RES-04 (templates), NFR-04.

-- ---------------------------------------------------------------------------
-- Message templates and outbox
-- ---------------------------------------------------------------------------

create table public.message_templates (
  key             text primary key,
  channel         text not null check (channel in ('sms', 'whatsapp')),
  body_ar         text not null,
  body_fr         text,
  description_ar  text,
  variables       text[] not null default '{}',
  is_active       boolean not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);
create trigger message_templates_stamp before update on public.message_templates
  for each row execute function app.stamp_updated();

create type public.notification_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped');

create table public.notification_outbox (
  id                   uuid primary key default gen_random_uuid(),
  channel              text not null check (channel in ('sms', 'whatsapp')),
  to_phone_e164        text not null,
  template_key         text references public.message_templates (key),
  body                 text not null,
  related_entity       text,
  related_id           uuid,
  status               public.notification_status not null default 'pending',
  attempts             integer not null default 0,
  last_error           text,
  provider             text,
  provider_message_id  text,
  scheduled_at         timestamptz not null default now(),
  sent_at              timestamptz,
  created_at           timestamptz not null default now()
);
create index notification_outbox_queue_idx on public.notification_outbox (scheduled_at)
  where status in ('pending', 'failed');
create index notification_outbox_related_idx on public.notification_outbox (related_entity, related_id);

create or replace function app.render_template(p_body text, p_vars jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_key text;
  v_value text;
  v_result text := p_body;
begin
  for v_key, v_value in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_result := replace(v_result, '{' || v_key || '}', coalesce(v_value, ''));
  end loop;
  return v_result;
end $$;

create or replace function app.enqueue_message(
  p_template text, p_to text, p_vars jsonb, p_entity text, p_entity_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_template public.message_templates;
begin
  select * into v_template from public.message_templates where key = p_template and is_active;
  if not found then
    return;
  end if;
  insert into public.notification_outbox (channel, to_phone_e164, template_key, body, related_entity, related_id)
  values (v_template.channel, p_to, p_template, app.render_template(v_template.body_ar, p_vars), p_entity, p_entity_id);
end $$;
revoke execute on function app.enqueue_message(text, text, jsonb, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anti-abuse throttle (LEAD-06)
-- ---------------------------------------------------------------------------

create table app.submission_throttle (
  id          bigint generated always as identity primary key,
  kind        text not null,
  key_hash    text not null,
  created_at  timestamptz not null default now()
);
create index submission_throttle_lookup_idx on app.submission_throttle (kind, key_hash, created_at desc);
revoke all on app.submission_throttle from public, anon, authenticated;

create or replace function app.check_throttle(p_kind text, p_key_hash text, p_window interval, p_max integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_key_hash is null then
    return;
  end if;
  if (select count(*) from app.submission_throttle t
      where t.kind = p_kind and t.key_hash = p_key_hash and t.created_at > now() - p_window) >= p_max then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into app.submission_throttle (kind, key_hash) values (p_kind, p_key_hash);
end $$;
revoke execute on function app.check_throttle(text, text, interval, integer) from public, anon, authenticated;

create or replace function app.active_option(p_list text, p_id text) returns public.option_items
language sql stable security definer set search_path = '' as $$
  select * from public.option_items
  where list_key = p_list and is_active and id::text = nullif(p_id, '')
$$;

create or replace function app.assert_phone(p_phone text, p_error text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception '%', p_error using errcode = 'P0001';
  end if;
  if not app.setting_bool('lead.allow_international_phone', false) and p_phone !~ '^\+216[0-9]{8}$' then
    raise exception 'phone_not_tunisian' using errcode = 'P0001';
  end if;
end $$;

create or replace function app.clean_source(p_source jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'utm_source',   left(p_source->>'utm_source', 100),
    'utm_medium',   left(p_source->>'utm_medium', 100),
    'utm_campaign', left(p_source->>'utm_campaign', 150),
    'utm_content',  left(p_source->>'utm_content', 150),
    'ref',          left(p_source->>'ref', 100),
    'referrer',     left(p_source->>'referrer', 300),
    'landing_path', left(p_source->>'landing_path', 300)
  ))
$$;

-- ---------------------------------------------------------------------------
-- Public intake: interest request (called by the Next.js server only)
-- ---------------------------------------------------------------------------

create or replace function public.submit_interest_request(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name         text := btrim(coalesce(p->>'full_name', ''));
  v_phone        text := p->>'phone_e164';
  v_whatsapp     text := nullif(p->>'whatsapp_e164', '');
  v_email        text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_gov          smallint := nullif(p->>'residence_governorate_id', '')::smallint;
  v_del          integer := nullif(p->>'residence_delegation_id', '')::integer;
  v_anywhere     boolean := coalesce((p->>'invest_anywhere')::boolean, false);
  v_unsure       boolean := coalesce((p->>'project_type_unsure')::boolean, false);
  v_consent      text := nullif(btrim(coalesce(p->>'consent_text', '')), '');
  v_invest_govs  smallint[];
  v_types        uuid[];
  v_channel      public.contact_channel;
  v_goal         public.option_items;
  v_down         public.option_items;
  v_inst         public.option_items;
  v_time         public.option_items;
  v_status_id    uuid;
  v_person_id    uuid;
  v_inserted     boolean;
  v_assignee     uuid;
  v_year         text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_request_no   text;
  v_request_id   uuid;
begin
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
  if not exists (select 1 from public.delegations d
                 where d.id = v_del and d.governorate_id = v_gov and d.is_active) then
    raise exception 'invalid_delegation' using errcode = 'P0001';
  end if;

  -- Where to invest
  select coalesce(array_agg(distinct x::smallint), '{}') into v_invest_govs
  from jsonb_array_elements_text(coalesce(p->'invest_governorate_ids', '[]'::jsonb)) x;
  if v_anywhere then
    v_invest_govs := '{}';
  elsif cardinality(v_invest_govs) = 0 then
    raise exception 'invest_location_required' using errcode = 'P0001';
  elsif (select count(*) from public.governorates g where g.id = any (v_invest_govs) and g.is_active)
        <> cardinality(v_invest_govs) then
    raise exception 'invalid_invest_governorate' using errcode = 'P0001';
  end if;

  -- Project types
  select coalesce(array_agg(distinct x::uuid), '{}') into v_types
  from jsonb_array_elements_text(coalesce(p->'project_type_ids', '[]'::jsonb)) x;
  if v_unsure then
    v_types := '{}';
  elsif cardinality(v_types) = 0 then
    raise exception 'project_type_required' using errcode = 'P0001';
  elsif not app.setting_bool('lead.project_types_multi', true) and cardinality(v_types) > 1 then
    raise exception 'single_project_type_only' using errcode = 'P0001';
  elsif (select count(*) from public.project_types t where t.id = any (v_types) and t.is_active)
        <> cardinality(v_types) then
    raise exception 'invalid_project_type' using errcode = 'P0001';
  end if;

  -- Options from Back Office lists (LEAD-01), snapshotted below (LEAD-02)
  v_goal := app.active_option('goal', p->>'goal_option_id');
  if v_goal.id is null then raise exception 'invalid_goal' using errcode = 'P0001'; end if;
  v_down := app.active_option('down_payment', p->>'down_payment_option_id');
  if v_down.id is null then raise exception 'invalid_down_payment' using errcode = 'P0001'; end if;
  v_inst := app.active_option('monthly_installment', p->>'installment_option_id');
  if v_inst.id is null then raise exception 'invalid_installment' using errcode = 'P0001'; end if;
  if nullif(p->>'contact_time_option_id', '') is not null then
    v_time := app.active_option('contact_time', p->>'contact_time_option_id');
    if v_time.id is null then raise exception 'invalid_contact_time' using errcode = 'P0001'; end if;
  end if;
  begin
    v_channel := (p->>'contact_channel')::public.contact_channel;
  exception when invalid_text_representation then
    v_channel := null;
  end;
  if v_channel is null then
    raise exception 'contact_channel_required' using errcode = 'P0001';
  end if;

  -- Throttling (LEAD-06)
  perform app.check_throttle('interest:ip', nullif(p->>'ip_hash', ''), interval '1 hour',
                             app.setting_int('antispam.max_requests_per_ip_per_hour', 10));
  if (select count(*) from public.interest_requests r
      where r.phone_e164 = v_phone and r.created_at > now() - interval '1 day')
     >= app.setting_int('antispam.max_requests_per_phone_per_day', 3) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- One person per phone (LEAD-04). Existing person data is never overwritten from the public form.
  select id into v_status_id from public.lead_statuses
  where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;

  insert into public.persons as ps
    (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, status_id, consent_at, last_request_at)
  values
    (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del, v_status_id, now(), now())
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at
  returning ps.id, (ps.xmax = 0) into v_person_id, v_inserted;

  -- Optional automatic assignment (LEAD-12)
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

  v_request_no := app.setting_text('request_no.prefix', 'AGZ') || '-' || v_year || '-'
                  || lpad(app.next_number('interest_request:' || v_year)::text, 6, '0');

  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, email,
    residence_governorate_id, residence_delegation_id,
    invest_anywhere, invest_governorate_ids, project_type_unsure, project_type_ids,
    goal_option_id, goal_code, goal_label_ar,
    down_payment_option_id, down_payment_label_ar, down_payment_min_millimes, down_payment_max_millimes,
    installment_option_id, installment_label_ar, installment_min_millimes, installment_max_millimes,
    contact_channel, contact_time_option_id, contact_time_label_ar,
    is_duplicate, source, consent_text
  ) values (
    v_request_no, v_person_id, v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email,
    v_gov, v_del,
    v_anywhere, v_invest_govs, v_unsure, v_types,
    v_goal.id, v_goal.code, v_goal.label_ar,
    v_down.id, v_down.label_ar, v_down.min_millimes, v_down.max_millimes,
    v_inst.id, v_inst.label_ar, v_inst.min_millimes, v_inst.max_millimes,
    v_channel, v_time.id, v_time.label_ar,
    not v_inserted, app.clean_source(coalesce(p->'source', '{}'::jsonb)), v_consent
  ) returning id into v_request_id;

  perform app.enqueue_message(
    'lead.confirmation', v_phone,
    jsonb_build_object('name', split_part(v_name, ' ', 1), 'request_no', v_request_no),
    'interest_requests', v_request_id
  );

  return jsonb_build_object('request_no', v_request_no);
end $$;

revoke execute on function public.submit_interest_request(jsonb) from public, anon, authenticated;
grant execute on function public.submit_interest_request(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Landowner offers (spec 9)
-- ---------------------------------------------------------------------------

create type public.land_offer_status as enum (
  'under_study', 'legal_review', 'technical_review', 'field_visit',
  'accepted', 'rejected', 'postponed', 'converted'
);
create type public.irrigation_type as enum ('rainfed', 'irrigated');
create type public.contact_capacity as enum ('owner', 'agent', 'broker');

create table public.land_offers (
  id                       uuid primary key default gen_random_uuid(),
  reference_no             text not null unique,
  governorate_id           smallint not null references public.governorates (id),
  delegation_id            integer not null references public.delegations (id),
  location_description     text check (length(location_description) <= 1000),
  latitude                 numeric(9, 6) check (latitude between -90 and 90),
  longitude                numeric(9, 6) check (longitude between -180 and 180),
  area_value               numeric(12, 2) not null check (area_value > 0),
  area_unit                text not null check (area_unit in ('ha', 'm2')),
  property_type_option_id  uuid not null references public.option_items (id),
  property_type_label_ar   text not null,
  olive_tree_count         integer check (olive_tree_count >= 0),
  tree_age_option_id       uuid references public.option_items (id),
  tree_age_label_ar        text,
  irrigation               public.irrigation_type not null,
  water_source             text check (length(water_source) <= 200),
  asking_price_millimes    bigint check (asking_price_millimes >= 0),
  price_negotiable         boolean not null default false,
  contact_name             text not null,
  contact_phone_e164       text not null,
  contact_capacity         public.contact_capacity not null,
  available_documents      jsonb not null default '[]'::jsonb,
  status                   public.land_offer_status not null default 'under_study',
  source                   jsonb not null default '{}'::jsonb,
  consent_text             text not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index land_offers_status_idx on public.land_offers (status, created_at desc);
create index land_offers_location_idx on public.land_offers (governorate_id, delegation_id);
create trigger land_offers_stamp before update on public.land_offers
  for each row execute function app.stamp_updated();

create table public.land_offer_files (
  id             uuid primary key default gen_random_uuid(),
  land_offer_id  uuid not null references public.land_offers (id),
  storage_path   text not null unique,
  file_name      text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0),
  uploaded_at    timestamptz not null default now()
);
create index land_offer_files_offer_idx on public.land_offer_files (land_offer_id);

create table public.land_offer_reviews (
  id             uuid primary key default gen_random_uuid(),
  land_offer_id  uuid not null references public.land_offers (id),
  stage          public.land_offer_status not null,
  outcome        text not null check (outcome in ('passed', 'failed', 'needs_info', 'note')),
  notes          text check (length(notes) <= 5000),
  reviewer_id    uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index land_offer_reviews_offer_idx on public.land_offer_reviews (land_offer_id, created_at desc);

create or replace function public.submit_land_offer(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name       text := btrim(coalesce(p->>'contact_name', ''));
  v_phone      text := p->>'contact_phone_e164';
  v_gov        smallint := nullif(p->>'governorate_id', '')::smallint;
  v_del        integer := nullif(p->>'delegation_id', '')::integer;
  v_area       numeric := nullif(p->>'area_value', '')::numeric;
  v_unit       text := p->>'area_unit';
  v_trees      integer := nullif(p->>'olive_tree_count', '')::integer;
  v_price      bigint := nullif(p->>'asking_price_millimes', '')::bigint;
  v_consent    text := nullif(btrim(coalesce(p->>'consent_text', '')), '');
  v_type       public.option_items;
  v_age        public.option_items;
  v_irrigation public.irrigation_type;
  v_capacity   public.contact_capacity;
  v_docs       jsonb;
  v_year       text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_ref        text;
  v_id         uuid;
begin
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'invalid_full_name' using errcode = 'P0001';
  end if;
  perform app.assert_phone(v_phone, 'invalid_phone');
  if v_consent is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.delegations d
                 where d.id = v_del and d.governorate_id = v_gov and d.is_active) then
    raise exception 'invalid_delegation' using errcode = 'P0001';
  end if;
  if v_area is null or v_area <= 0 or v_unit not in ('ha', 'm2') then
    raise exception 'invalid_area' using errcode = 'P0001';
  end if;
  if v_trees is not null and v_trees < 0 then
    raise exception 'invalid_tree_count' using errcode = 'P0001';
  end if;
  if v_price is not null and v_price < 0 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;

  v_type := app.active_option('property_type', p->>'property_type_option_id');
  if v_type.id is null then raise exception 'invalid_property_type' using errcode = 'P0001'; end if;
  if nullif(p->>'tree_age_option_id', '') is not null then
    v_age := app.active_option('tree_age', p->>'tree_age_option_id');
    if v_age.id is null then raise exception 'invalid_tree_age' using errcode = 'P0001'; end if;
  end if;

  begin
    v_irrigation := (p->>'irrigation')::public.irrigation_type;
    v_capacity := (p->>'contact_capacity')::public.contact_capacity;
  exception when invalid_text_representation then
    raise exception 'invalid_choice' using errcode = 'P0001';
  end;
  if v_irrigation is null or v_capacity is null then
    raise exception 'invalid_choice' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label_ar', o.label_ar) order by o.sort_order), '[]'::jsonb)
  into v_docs
  from public.option_items o
  where o.list_key = 'land_document' and o.is_active
    and o.id::text in (select jsonb_array_elements_text(coalesce(p->'document_option_ids', '[]'::jsonb)));

  perform app.check_throttle('land_offer:ip', nullif(p->>'ip_hash', ''), interval '1 day',
                             app.setting_int('antispam.max_land_offers_per_ip_per_day', 5));

  v_ref := app.setting_text('land_offer_no.prefix', 'AGZ-LND') || '-' || v_year || '-'
           || lpad(app.next_number('land_offer:' || v_year)::text, 6, '0');

  insert into public.land_offers (
    reference_no, governorate_id, delegation_id, location_description, latitude, longitude,
    area_value, area_unit, property_type_option_id, property_type_label_ar,
    olive_tree_count, tree_age_option_id, tree_age_label_ar, irrigation, water_source,
    asking_price_millimes, price_negotiable, contact_name, contact_phone_e164, contact_capacity,
    available_documents, source, consent_text
  ) values (
    v_ref, v_gov, v_del, nullif(btrim(coalesce(p->>'location_description', '')), ''),
    nullif(p->>'latitude', '')::numeric, nullif(p->>'longitude', '')::numeric,
    v_area, v_unit, v_type.id, v_type.label_ar,
    v_trees, v_age.id, v_age.label_ar, v_irrigation, nullif(btrim(coalesce(p->>'water_source', '')), ''),
    v_price, coalesce((p->>'price_negotiable')::boolean, false), v_name, v_phone, v_capacity,
    v_docs, app.clean_source(coalesce(p->'source', '{}'::jsonb)), v_consent
  ) returning id into v_id;

  perform app.enqueue_message(
    'land_offer.confirmation', v_phone,
    jsonb_build_object('name', split_part(v_name, ' ', 1), 'reference_no', v_ref),
    'land_offers', v_id
  );

  return jsonb_build_object('id', v_id, 'reference_no', v_ref);
end $$;

revoke execute on function public.submit_land_offer(jsonb) from public, anon, authenticated;
grant execute on function public.submit_land_offer(jsonb) to service_role;

-- LAND-02: each review stage records reviewer, date, outcome and notes; stage permissions by role.
create or replace function public.review_land_offer(
  p_offer uuid, p_stage public.land_offer_status, p_outcome text, p_notes text,
  p_next_status public.land_offer_status default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_stage = 'legal_review'
     and not app.has_any_role(array['legal', 'admin', 'super_admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_stage in ('technical_review', 'field_visit')
     and not app.has_any_role(array['agri_manager', 'admin', 'super_admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_stage in ('under_study', 'accepted', 'rejected', 'postponed', 'converted') and not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_next_status in ('accepted', 'rejected', 'postponed', 'converted') and not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.land_offers where id = p_offer) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.land_offer_reviews (land_offer_id, stage, outcome, notes, reviewer_id)
  values (p_offer, p_stage, p_outcome, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid());

  if p_next_status is not null then
    update public.land_offers set status = p_next_status where id = p_offer;
  end if;
end $$;

revoke execute on function public.review_land_offer(uuid, public.land_offer_status, text, text, public.land_offer_status) from public, anon;
grant execute on function public.review_land_offer(uuid, public.land_offer_status, text, text, public.land_offer_status) to authenticated;

-- Private storage for landowner documents (LAND-03). Uploads go through the server with size/type checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('land-offer-files', 'land-offer-files', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy land_offer_files_read on storage.objects for select to authenticated
  using (bucket_id = 'land-offer-files'
         and app.has_any_role(array['agri_manager', 'legal', 'finance', 'admin', 'super_admin']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------

create trigger message_templates_audit after insert or update or delete on public.message_templates
  for each row execute function app.audit_row_change();
create trigger land_offers_audit after insert or update or delete on public.land_offers
  for each row execute function app.audit_row_change();
create trigger land_offer_reviews_audit after insert or update or delete on public.land_offer_reviews
  for each row execute function app.audit_row_change();
create trigger land_offer_files_audit after insert or update or delete on public.land_offer_files
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.message_templates enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.land_offers enable row level security;
alter table public.land_offer_files enable row level security;
alter table public.land_offer_reviews enable row level security;

revoke all on public.message_templates, public.notification_outbox, public.land_offers,
  public.land_offer_files, public.land_offer_reviews from anon;

revoke insert, delete on public.message_templates from authenticated;
create policy message_templates_select on public.message_templates for select to authenticated
  using ((select app.is_admin()));
create policy message_templates_update on public.message_templates for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

revoke insert, update, delete on public.notification_outbox from authenticated;
create policy notification_outbox_select on public.notification_outbox for select to authenticated
  using ((select app.is_admin()));

-- LAND-01: never readable by visitors; staff roles per matrix 22.1.
revoke insert, update, delete on public.land_offers, public.land_offer_files, public.land_offer_reviews from authenticated;
create policy land_offers_select on public.land_offers for select to authenticated
  using ((select app.has_any_role(array['agri_manager', 'legal', 'finance', 'admin', 'super_admin']::public.app_role[])));
create policy land_offer_files_select on public.land_offer_files for select to authenticated
  using ((select app.has_any_role(array['agri_manager', 'legal', 'finance', 'admin', 'super_admin']::public.app_role[])));
create policy land_offer_reviews_select on public.land_offer_reviews for select to authenticated
  using ((select app.has_any_role(array['agri_manager', 'legal', 'finance', 'admin', 'super_admin']::public.app_role[])));
