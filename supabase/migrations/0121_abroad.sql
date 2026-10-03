-- A visitor can say they are a Tunisian living abroad (owner, 2026-10-03: «add the option if you are
-- من المواطنين بالخارج»).
--
-- It is a COLUMN, not a label. The diaspora is a segment the plan is built around — consular power of
-- attorney, signing in the summer, payment in euro, the May–June webinars — and a commercial cannot work any
-- of that from a question whose answer was never written down. It sits on the person (that is a fact about
-- them) and is snapshotted on the request (that is what they said at the time), the same way the residence
-- governorate already is.
--
-- The governorate stays required and keeps its column: someone abroad still names the governorate they are
-- from, which is what the matching reads. The forms relabel the question when the box is ticked.

alter table public.persons
  add column if not exists lives_abroad boolean not null default false;
alter table public.interest_requests
  add column if not exists lives_abroad boolean not null default false;

comment on column public.persons.lives_abroad is
  'The person told us they are a Tunisian living abroad (0121). Drives the diaspora follow-up: consular power of attorney, summer signing, euro payment.';
comment on column public.interest_requests.lives_abroad is
  'What the visitor answered on this request (0121), kept beside residence_governorate_id as a snapshot.';

create index if not exists persons_abroad_idx on public.persons (lives_abroad) where lives_abroad;

-- ---------------------------------------------------------------------------
-- The two intakes carry the answer. Both bodies are the LIVE ones with the field threaded through; nothing
-- else in them changed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_interest_request(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- «من المواطنين بالخارج» (owner, 2026-10-03). Absent means no, never unknown: the question is a
  -- checkbox, so a payload without it is a visitor who did not tick it.
  v_abroad boolean := coalesce((p->>'lives_abroad')::boolean, false);
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
  v_scenarios    uuid[];
  v_scn_labels   text[] := '{}';
  v_plantation   text[] := '{}';
  v_production   text[] := '{}';
  v_any_scenario boolean := false;
  v_channel      public.contact_channel;
  v_goal         public.option_items;
  v_down         public.option_items;
  v_percent      public.option_items;
  v_inst         public.option_items;
  v_duration     public.option_items;
  v_budget       public.option_items;
  v_time         public.option_items;
  v_area         public.option_items;
  v_trees        public.option_items;
  v_custom       integer;
  v_priority     public.option_items;
  -- Optional yes/no answers: only a JSON boolean counts, anything else is «no answer», never an error.
  v_wants_visit  boolean := case when jsonb_typeof(p->'wants_visit') = 'boolean' then (p->>'wants_visit')::boolean end;
  v_wants_bank   boolean := case when jsonb_typeof(p->'wants_bank_financing') = 'boolean'
                                 then (p->>'wants_bank_financing')::boolean end;
  v_payment_mode text := nullif(btrim(coalesce(p->>'payment_mode', '')), '');
  v_spacing      public.tree_spacing_classes;
  v_tree_n       integer;
  v_trees_label  text;
  v_total_area   numeric;
  v_price        jsonb;
  v_quote        jsonb;
  v_price_tree   bigint;
  v_price_total  bigint;
  v_down_amount  bigint;
  v_financed     bigint;
  v_monthly      bigint;
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

  -- Residence: governorate required, delegation optional but checked when given.
  if not exists (select 1 from public.governorates g where g.id = v_gov and g.is_active) then
    raise exception 'invalid_governorate' using errcode = 'P0001';
  end if;
  if v_del is not null and not exists (
    select 1 from public.delegations d where d.id = v_del and d.governorate_id = v_gov and d.is_active
  ) then
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

  -- What the citizen wants to own (clause 25.3). Scenarios decide the project types.
  select coalesce(array_agg(distinct x::uuid), '{}') into v_scenarios
  from jsonb_array_elements_text(coalesce(p->'scenario_ids', '[]'::jsonb)) x;

  if cardinality(v_scenarios) > 0 then
    if (select count(*) from public.ownership_scenarios s where s.id = any (v_scenarios) and s.is_active)
       <> cardinality(v_scenarios) then
      raise exception 'invalid_scenario' using errcode = 'P0001';
    end if;
    if not app.setting_bool('lead.project_types_multi', true) and cardinality(v_scenarios) > 1 then
      raise exception 'single_scenario_only' using errcode = 'P0001';
    end if;

    select
      coalesce(array_agg(distinct s.project_type_id) filter (where s.project_type_id is not null), '{}'),
      coalesce(array_agg(s.label_ar order by s.sort_order), '{}'),
      coalesce(array_agg(distinct s.plantation_system) filter (where s.plantation_system is not null), '{}'),
      coalesce(array_agg(distinct s.production_status) filter (where s.production_status is not null), '{}'),
      bool_or(s.is_any)
    into v_types, v_scn_labels, v_plantation, v_production, v_any_scenario
    from public.ownership_scenarios s
    where s.id = any (v_scenarios);

    if v_any_scenario then
      v_types := '{}';
    end if;
    v_unsure := v_any_scenario or cardinality(v_types) = 0;
  else
    -- Fallback for callers that still send project types directly.
    select coalesce(array_agg(distinct x::uuid), '{}') into v_types
    from jsonb_array_elements_text(coalesce(p->'project_type_ids', '[]'::jsonb)) x;
    if v_unsure then
      v_types := '{}';
    elsif cardinality(v_types) = 0 then
      -- Plan Q-6: the offer type is an optional question; no answer is recorded as «no specific type».
      v_unsure := true;
    elsif not app.setting_bool('lead.project_types_multi', true) and cardinality(v_types) > 1 then
      raise exception 'single_project_type_only' using errcode = 'P0001';
    elsif (select count(*) from public.project_types t where t.id = any (v_types) and t.is_active)
          <> cardinality(v_types) then
      raise exception 'invalid_project_type' using errcode = 'P0001';
    end if;
  end if;

  -- Options from Back Office lists (LEAD-01), snapshotted below (LEAD-02)
  v_goal := app.active_option('goal', p->>'goal_option_id');
  if v_goal.id is null then raise exception 'invalid_goal' using errcode = 'P0001'; end if;
  -- Addendum «طريقة الدفع»: a cash buyer picks no down payment, duration or installment; ids sent anyway are ignored.
  if v_payment_mode is not null and v_payment_mode not in ('cash', 'installments') then
    raise exception 'invalid_payment_mode' using errcode = 'P0001';
  end if;
  -- Plan Q-1/Q-2: the down payment is a percentage of the cash total, chosen once on /start.
  if nullif(p->>'down_payment_percent_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_percent := app.active_option('down_payment_percent', p->>'down_payment_percent_option_id');
    if v_percent.id is null then raise exception 'invalid_down_payment_percent' using errcode = 'P0001'; end if;
  end if;
  -- Plan Q-7: the amount list is retired; a legacy caller that still sends an amount is checked and snapshotted.
  if nullif(p->>'down_payment_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_down := app.active_option('down_payment', p->>'down_payment_option_id');
    if v_down.id is null then raise exception 'invalid_down_payment' using errcode = 'P0001'; end if;
  end if;
  -- Report v3 §6: the client no longer picks a monthly amount; older callers may still send one.
  if nullif(p->>'installment_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_inst := app.active_option('monthly_installment', p->>'installment_option_id');
    if v_inst.id is null then raise exception 'invalid_installment' using errcode = 'P0001'; end if;
  end if;
  -- Report v3 §8: the payment duration, in months
  if nullif(p->>'duration_option_id', '') is not null and v_payment_mode is distinct from 'cash' then
    v_duration := app.active_option('duration', p->>'duration_option_id');
    if v_duration.id is null then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  end if;
  -- Installments need a percentage and a duration, as long as the Back Office offers any.
  if v_payment_mode = 'installments' then
    if v_percent.id is null
       and exists (select 1 from public.option_items o where o.list_key = 'down_payment_percent' and o.is_active) then
      raise exception 'down_payment_percent_required' using errcode = 'P0001';
    end if;
    if v_duration.id is null
       and exists (select 1 from public.option_items o where o.list_key = 'duration' and o.is_active) then
      raise exception 'duration_required' using errcode = 'P0001';
    end if;
  end if;
  -- Report v3 §40: the overall budget
  if nullif(p->>'budget_option_id', '') is not null then
    v_budget := app.active_option('budget', p->>'budget_option_id');
    if v_budget.id is null then raise exception 'invalid_budget' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'contact_time_option_id', '') is not null then
    v_time := app.active_option('contact_time', p->>'contact_time_option_id');
    if v_time.id is null then raise exception 'invalid_contact_time' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'desired_area_option_id', '') is not null then
    v_area := app.active_option('desired_area', p->>'desired_area_option_id');
    if v_area.id is null then raise exception 'invalid_desired_area' using errcode = 'P0001'; end if;
  end if;
  -- MIL-01 · how many olive trees the citizen wants to start with
  if nullif(p->>'tree_count_option_id', '') is not null then
    v_trees := app.active_option('tree_count', p->>'tree_count_option_id');
    if v_trees.id is null then raise exception 'invalid_tree_choice' using errcode = 'P0001'; end if;
  end if;
  -- ... or a number typed on /start. The database stays strict: Western digits only, the page converts.
  begin
    v_custom := nullif(btrim(coalesce(p->>'tree_count_custom', '')), '')::integer;
  exception when others then
    raise exception 'invalid_tree_custom' using errcode = 'P0001';
  end;
  if v_custom is not null then
    if nullif(p->>'tree_count_option_id', '') is not null then
      raise exception 'invalid_tree_choice' using errcode = 'P0001';
    end if;
    if v_custom < app.setting_int('million.custom_trees_min', 1)
       or v_custom > app.setting_int('million.custom_trees_max', 5000) then
      raise exception 'invalid_tree_custom' using errcode = 'P0001';
    end if;
  end if;
  -- Addendum: the spacing class sets the area attached to each tree
  if nullif(p->>'spacing_class_id', '') is not null then
    select * into v_spacing from public.tree_spacing_classes c
    where c.id::text = p->>'spacing_class_id' and c.is_active;
    if v_spacing.id is null then raise exception 'invalid_spacing' using errcode = 'P0001'; end if;
  end if;
  if nullif(p->>'priority_option_id', '') is not null then
    v_priority := app.active_option('priority', p->>'priority_option_id');
    if v_priority.id is null then raise exception 'invalid_priority' using errcode = 'P0001'; end if;
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
    (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, status_id, consent_at, last_request_at, lives_abroad)
  values
    (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del, v_status_id, now(), now(), v_abroad)
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at,
        lives_abroad = excluded.lives_abroad
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

  -- The figures shown on /start, recomputed here so a demand never carries a price the client could not see.
  v_tree_n      := case when v_custom is null then v_trees.min_number::integer else v_custom end;
  v_trees_label := case when v_custom is null then v_trees.label_ar
                        else v_custom::text || ' ' || app.setting_text('start.trees_unit', 'زيتونة') end;
  v_total_area  := v_spacing.area_m2 * v_tree_n;
  if v_spacing.id is not null and v_tree_n is not null and app.module_open('pricing') then
    v_price := app.tree_price(v_spacing.id, null);
    if coalesce((v_price->>'ok')::boolean, false) then
      v_price_tree  := (v_price->>'price_per_tree_millimes')::bigint;
      v_price_total := v_price_tree * v_tree_n;
      if v_payment_mode = 'installments' and v_percent.id is not null and v_duration.id is not null then
        -- Plan Q-2: the same percentage of the same cash total as public_tree_quote, so the figures match /start.
        v_quote := app.financed_quote(v_price_total,
                                      app.down_payment_from_percent(v_price_total, v_percent.min_number, null),
                                      v_duration.min_number::integer, null);
        if coalesce((v_quote->>'ok')::boolean, false) then
          v_down_amount := (v_quote->>'down_payment_millimes')::bigint;
          v_financed    := (v_quote->>'total_financed_millimes')::bigint;
          v_monthly     := (v_quote->>'monthly_millimes')::bigint;
        end if;
      end if;
    end if;
  end if;

  v_request_no := app.setting_text('request_no.prefix', 'AGZ') || '-' || v_year || '-'
                  || lpad(app.next_number('interest_request:' || v_year)::text, 6, '0');

  insert into public.interest_requests (
    request_no, person_id, full_name, phone_e164, whatsapp_e164, email,
    residence_governorate_id, residence_delegation_id, lives_abroad,
    invest_anywhere, invest_governorate_ids, project_type_unsure, project_type_ids,
    scenario_ids, scenario_labels, plantation_systems, production_statuses,
    tree_count_option_id, tree_count_code, tree_count_label_ar, tree_count_min, tree_count_max,
    desired_area_option_id, desired_area_label_ar, desired_area_min_m2, desired_area_max_m2,
    priority_option_id, priority_code, priority_label_ar,
    goal_option_id, goal_code, goal_label_ar,
    down_payment_option_id, down_payment_label_ar, down_payment_min_millimes, down_payment_max_millimes,
    installment_option_id, installment_label_ar, installment_min_millimes, installment_max_millimes,
    duration_option_id, duration_label_ar, duration_months,
    budget_option_id, budget_label_ar, budget_min_millimes, budget_max_millimes,
    wants_visit, wants_bank_financing,
    spacing_class_id, spacing_label_ar, area_per_tree_m2, total_area_m2, payment_mode,
    price_per_tree_millimes, total_price_millimes,
    down_payment_percent_option_id, down_payment_percent, down_payment_amount_millimes,
    total_financed_millimes, monthly_millimes,
    contact_channel, contact_time_option_id, contact_time_label_ar,
    is_duplicate, source, consent_text
  ) values (
    v_request_no, v_person_id, v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email,
    v_gov, v_del, v_abroad,
    v_anywhere, v_invest_govs, v_unsure, v_types,
    v_scenarios, v_scn_labels, v_plantation, v_production,
    case when v_custom is null then v_trees.id end,
    case when v_custom is null then v_trees.code else 'custom' end,
    v_trees_label,
    v_tree_n,
    case when v_custom is null then v_trees.max_number::integer else v_custom end,
    v_area.id, v_area.label_ar, v_area.min_number, v_area.max_number,
    v_priority.id, v_priority.code, v_priority.label_ar,
    v_goal.id, v_goal.code, v_goal.label_ar,
    v_down.id, v_down.label_ar, v_down.min_millimes, v_down.max_millimes,
    v_inst.id, v_inst.label_ar, v_inst.min_millimes, v_inst.max_millimes,
    v_duration.id, v_duration.label_ar, v_duration.min_number::integer,
    v_budget.id, v_budget.label_ar, v_budget.min_millimes, v_budget.max_millimes,
    v_wants_visit, v_wants_bank,
    v_spacing.id, v_spacing.label_ar, v_spacing.area_m2, v_total_area, v_payment_mode,
    v_price_tree, v_price_total,
    v_percent.id, v_percent.min_number, v_down_amount,
    v_financed, v_monthly,
    v_channel, v_time.id, v_time.label_ar,
    not v_inserted, app.clean_source(coalesce(p->'source', '{}'::jsonb)), v_consent
  ) returning id into v_request_id;

  -- Plan P2-4: the summary figures travel with the message, ready for a template that names them.
  perform app.enqueue_message(
    'lead.confirmation', v_phone,
    jsonb_build_object('name', split_part(v_name, ' ', 1), 'request_no', v_request_no,
                       'trees', v_trees_label, 'total_area_m2', v_total_area, 'total_price_millimes', v_price_total),
    'interest_requests', v_request_id
  );

  return jsonb_build_object('request_no', v_request_no);
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_offer_request(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- «من المواطنين بالخارج» (owner, 2026-10-03). Absent means no, never unknown: the question is a
  -- checkbox, so a payload without it is a visitor who did not tick it.
  v_abroad boolean := coalesce((p->>'lives_abroad')::boolean, false);
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
    (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, status_id, consent_at, last_request_at, lives_abroad)
  values
    (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del, v_status_id, now(), now(), v_abroad)
  on conflict (phone_e164) do update
    set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at,
        lives_abroad = excluded.lives_abroad
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
    residence_governorate_id, residence_delegation_id, lives_abroad,
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
    v_gov, v_del, v_abroad,
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
end $function$
;

-- ---------------------------------------------------------------------------
-- What the question says, in the ui.* shape the rest of the site uses
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('ui.register.abroad_label', to_jsonb('من المواطنين بالخارج'::text), 'text', 'ui',
   'سؤال: من المواطنين بالخارج',
   'خانة يأشّر عليها التونسي المقيم بالخارج في استمارة التسجيل. فارغة = السؤال ما يظهرش.', true, 2410),
  ('ui.register.abroad_hint', to_jsonb('نعرفو كيفاش نرتّبولك الإمضاء والمكالمة من بلاصتك.'::text), 'text', 'ui',
   'شرح تحت سؤال المقيمين بالخارج', 'سطر صغير تحت الخانة. فارغ = ما يظهرش.', true, 2411),
  ('ui.register.abroad_governorate_label', to_jsonb('ولايتك الأصلية'::text), 'text', 'ui',
   'عنوان سؤال الولاية للمقيم بالخارج',
   'كي يأشّر «من المواطنين بالخارج»، سؤال «ولاية إقامتك» يولّي بهذا العنوان.', true, 2412),
  ('ui.offer.form_abroad_label', to_jsonb('من المواطنين بالخارج'::text), 'text', 'ui',
   'سؤال المقيمين بالخارج في استمارة العرض', 'نفس السؤال في استمارة العرض.', true, 2413)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.register.abroad_label', 'value', 'fr', to_jsonb('Je suis un Tunisien résidant à l''étranger'::text), true),
  ('setting', 'ui.register.abroad_label', 'value', 'de', to_jsonb('Ich bin Tunesier und lebe im Ausland'::text), true),
  ('setting', 'ui.register.abroad_label', 'value', 'it', to_jsonb('Sono un tunisino residente all''estero'::text), true),
  ('setting', 'ui.register.abroad_label', 'value', 'en', to_jsonb('I am a Tunisian living abroad'::text), true),

  ('setting', 'ui.register.abroad_hint', 'value', 'fr', to_jsonb('Nous adaptons l''appel et la signature à votre pays.'::text), true),
  ('setting', 'ui.register.abroad_hint', 'value', 'de', to_jsonb('Wir richten Anruf und Unterschrift nach Ihrem Land.'::text), true),
  ('setting', 'ui.register.abroad_hint', 'value', 'it', to_jsonb('Adattiamo la chiamata e la firma al suo Paese.'::text), true),
  ('setting', 'ui.register.abroad_hint', 'value', 'en', to_jsonb('We fit the call and the signing around your country.'::text), true),

  ('setting', 'ui.register.abroad_governorate_label', 'value', 'fr', to_jsonb('Votre gouvernorat d''origine'::text), true),
  ('setting', 'ui.register.abroad_governorate_label', 'value', 'de', to_jsonb('Ihr Herkunftsgouvernement'::text), true),
  ('setting', 'ui.register.abroad_governorate_label', 'value', 'it', to_jsonb('Il suo governatorato d''origine'::text), true),
  ('setting', 'ui.register.abroad_governorate_label', 'value', 'en', to_jsonb('The governorate you are from'::text), true),

  ('setting', 'ui.offer.form_abroad_label', 'value', 'fr', to_jsonb('Je suis un Tunisien résidant à l''étranger'::text), true),
  ('setting', 'ui.offer.form_abroad_label', 'value', 'de', to_jsonb('Ich bin Tunesier und lebe im Ausland'::text), true),
  ('setting', 'ui.offer.form_abroad_label', 'value', 'it', to_jsonb('Sono un tunisino residente all''estero'::text), true),
  ('setting', 'ui.offer.form_abroad_label', 'value', 'en', to_jsonb('I am a Tunisian living abroad'::text), true)
on conflict do nothing;
