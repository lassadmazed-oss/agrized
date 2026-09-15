-- 0032 · Intake with tree pricing: the demand snapshots the area per tree, the payment mode and the prices shown
--
-- Addendum docs/tree-area-and-cost.md: after the tree count and the spacing class the visitor sees area per tree,
-- total area, price per tree and total price, then chooses the down payment, the duration and the payment mode.
-- Report v3 §12 (what the client sees), §44 (CRM filters), §49 (analytics), §51-§52 (four different figures).
-- Plan docs/plan-zitouna.md, approved 2026-09-15:
--   Q-1/Q-2  the down payment is a percentage of the cash total ('down_payment_percent' list, 0031);
--   Q-6      the offer type stays one optional question;
--   Q-7      the old lists are retired by deactivating them, never by deleting: demands keep their values;
--   P2-3     prices are recomputed at submission and snapshotted; P2-4 the confirmation carries the summary;
--   P2-6     every question is asked once: /start asks the calculator, /register sends those answers.
-- LEAD-02: every figure is copied onto the demand as displayed; later price edits never change it.

-- ---------------------------------------------------------------------------
-- Snapshot columns (LEAD-02)
-- ---------------------------------------------------------------------------

alter table public.interest_requests
  -- A cash buyer chooses no down payment (addendum: «التسبقة والمدة وطريقة الدفع» come after the price).
  alter column down_payment_option_id drop not null,
  alter column down_payment_label_ar drop not null,
  add column if not exists spacing_class_id               uuid references public.tree_spacing_classes (id),
  add column if not exists spacing_label_ar               text,
  add column if not exists area_per_tree_m2               numeric(10, 2),
  add column if not exists total_area_m2                  numeric(14, 2),
  add column if not exists payment_mode                   text check (payment_mode in ('cash', 'installments')),
  add column if not exists price_per_tree_millimes        bigint,
  add column if not exists total_price_millimes           bigint,
  add column if not exists down_payment_percent_option_id uuid references public.option_items (id),
  add column if not exists down_payment_percent           numeric(5, 2),
  add column if not exists down_payment_amount_millimes   bigint,
  add column if not exists total_financed_millimes        bigint,
  add column if not exists monthly_millimes               bigint;

create index if not exists interest_requests_spacing_idx
  on public.interest_requests (spacing_class_id) where spacing_class_id is not null;

comment on column public.interest_requests.down_payment_option_id is
  'Down payment amount chosen from the retired ''down_payment'' list (plan Q-1, Q-7). Kept on older demands as snapshotted; new demands carry down_payment_percent instead.';
comment on column public.interest_requests.spacing_class_id is
  'Spacing class chosen on /start (addendum): the area attached to one olive tree. Empty when the client did not choose.';
comment on column public.interest_requests.spacing_label_ar is
  'Label of the spacing class as displayed when chosen (LEAD-02).';
comment on column public.interest_requests.area_per_tree_m2 is
  'Area per tree of the chosen class when the demand was made (LEAD-02); later class edits never change it.';
comment on column public.interest_requests.total_area_m2 is
  'Area per tree × tree_count_min, as displayed (addendum «المساحة الجملية»). Empty without a tree count.';
comment on column public.interest_requests.payment_mode is
  'cash or installments, as chosen on /start (addendum «طريقة الدفع»). Empty on older demands and when not answered.';
comment on column public.interest_requests.price_per_tree_millimes is
  'Price per tree shown to the client (addendum «سعر الزيتونة»). Filled only while the pricing module was open to the caller.';
comment on column public.interest_requests.total_price_millimes is
  'Price per tree × tree_count_min shown to the client (addendum «السعر الجملي للطلب»). Never the cost or the margin.';
comment on column public.interest_requests.down_payment_percent_option_id is
  'Down payment percentage chosen on /start from the ''down_payment_percent'' list (plan Q-1). Empty for cash and when not answered.';
comment on column public.interest_requests.down_payment_percent is
  'The chosen percentage of the cash total, copied from the list item (LEAD-02); later edits of the list never change it.';
comment on column public.interest_requests.down_payment_amount_millimes is
  'Down payment shown to the client: the percentage of the cash total, rounded up to the price step (plan Q-2). Filled only with the financed figures.';
comment on column public.interest_requests.total_financed_millimes is
  'Total financed price shown for the chosen down payment and duration (report v3 §51 «Prix total financé»).';
comment on column public.interest_requests.monthly_millimes is
  'Monthly installment shown for the chosen down payment and duration (report v3 §51 «Mensualité»).';

-- ---------------------------------------------------------------------------
-- Plan Q-7 / P4-3: the old questions leave the form. Their lists are deactivated, never deleted: LEAD-02 keeps every
-- demand's snapshot (label, bounds) and the option ids those demands point to, and the Back Office can still read them.
-- ---------------------------------------------------------------------------

update public.option_items
set is_active = false
where list_key in ('desired_area', 'priority', 'monthly_installment', 'down_payment', 'budget')
  and is_active;

-- ---------------------------------------------------------------------------
-- Intake: spacing class, payment mode, down payment percentage and the figures shown
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
    residence_governorate_id, residence_delegation_id,
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
    v_gov, v_del,
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
end $$;

-- ---------------------------------------------------------------------------
-- CRM view and search: area, payment mode and prices are listed and filtered (report v3 §44)
-- ---------------------------------------------------------------------------

-- The return type grows, so the function is dropped; the arguments and every existing column stay.
drop function if exists public.crm_search_requests(jsonb, integer, integer);

-- A view freezes its column list at creation time, so it is rebuilt to expose the new columns.
drop view if exists public.crm_requests;
create view public.crm_requests with (security_invoker = on) as
select
  r.*,
  p.status_id,
  s.stage,
  s.label_ar as status_label_ar,
  p.assigned_to,
  pr.full_name as assigned_to_name,
  p.archived_at as person_archived_at
from public.interest_requests r
join public.persons p on p.id = r.person_id
join public.lead_statuses s on s.id = p.status_id
left join public.profiles pr on pr.id = p.assigned_to;

revoke all on public.crm_requests from anon;

create function public.crm_search_requests(p jsonb, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  request_no text,
  created_at timestamptz,
  person_id uuid,
  full_name text,
  phone_e164 text,
  residence_governorate_id smallint,
  residence_delegation_id integer,
  invest_anywhere boolean,
  invest_governorate_ids smallint[],
  project_type_unsure boolean,
  project_type_ids uuid[],
  scenario_labels text[],
  plantation_systems text[],
  production_statuses text[],
  tree_count_code text,
  tree_count_label_ar text,
  tree_count_min integer,
  tree_count_max integer,
  desired_area_label_ar text,
  desired_area_min_m2 numeric,
  desired_area_max_m2 numeric,
  priority_code text,
  priority_label_ar text,
  goal_code text,
  goal_label_ar text,
  down_payment_label_ar text,
  down_payment_min_millimes bigint,
  installment_label_ar text,
  installment_min_millimes bigint,
  duration_months integer,
  duration_label_ar text,
  budget_label_ar text,
  budget_min_millimes bigint,
  wants_visit boolean,
  wants_bank_financing boolean,
  spacing_class_id uuid,
  spacing_label_ar text,
  area_per_tree_m2 numeric,
  total_area_m2 numeric,
  payment_mode text,
  total_price_millimes bigint,
  down_payment_percent numeric,
  down_payment_amount_millimes bigint,
  total_financed_millimes bigint,
  monthly_millimes bigint,
  contact_channel public.contact_channel,
  contact_time_label_ar text,
  is_duplicate boolean,
  source jsonb,
  status_id uuid,
  stage public.lead_stage,
  status_label_ar text,
  assigned_to uuid,
  assigned_to_name text,
  total_count bigint,
  requests_total bigint,
  persons_total bigint,
  trees_total bigint
)
language sql stable security invoker set search_path = '' as $$
  with f as (
    select
      nullif(btrim(p->>'q'), '') as q,
      nullif(regexp_replace(coalesce(p->>'q', ''), '\D', '', 'g'), '') as q_digits,
      nullif(p->>'residence_governorate_id', '')::smallint as residence_governorate_id,
      nullif(p->>'residence_delegation_id', '')::integer as residence_delegation_id,
      nullif(p->>'invest_governorate_id', '')::smallint as invest_governorate_id,
      coalesce((p->>'include_anywhere')::boolean, false) as include_anywhere,
      nullif(p->>'project_type_id', '')::uuid as project_type_id,
      coalesce((p->>'include_unsure')::boolean, false) as include_unsure,
      nullif(p->>'plantation_system', '') as plantation_system,
      nullif(p->>'production_status', '') as production_status,
      nullif(p->>'priority_code', '') as priority_code,
      nullif(p->>'area_min', '')::numeric as area_min,
      nullif(p->>'area_max', '')::numeric as area_max,
      coalesce((p->>'include_area_any')::boolean, false) as include_area_any,
      nullif(p->>'trees_min', '')::integer as trees_min,
      nullif(p->>'trees_max', '')::integer as trees_max,
      coalesce((p->>'include_trees_any')::boolean, false) as include_trees_any,
      nullif(p->>'down_min', '')::bigint as down_min,
      nullif(p->>'down_max', '')::bigint as down_max,
      nullif(p->>'installment_min', '')::bigint as installment_min,
      nullif(p->>'installment_max', '')::bigint as installment_max,
      nullif(p->>'duration_min', '')::integer as duration_min,
      nullif(p->>'duration_max', '')::integer as duration_max,
      -- Absent means «any answer»; true or false keeps only the demands that gave that answer.
      nullif(p->>'wants_visit', '')::boolean as wants_visit,
      nullif(p->>'wants_bank_financing', '')::boolean as wants_bank_financing,
      nullif(p->>'spacing_class_id', '')::uuid as spacing_class_id,
      nullif(p->>'payment_mode', '') as payment_mode,
      nullif(p->>'down_payment_percent', '')::numeric as down_payment_percent,
      nullif(p->>'goal_code', '') as goal_code,
      nullif(p->>'stage', '')::public.lead_stage as stage,
      nullif(p->>'status_id', '')::uuid as status_id,
      nullif(p->>'assigned_to', '') as assigned_to,
      nullif(p->>'from', '')::date as date_from,
      nullif(p->>'to', '')::date as date_to,
      nullif(p->>'source', '') as source,
      coalesce((p->>'duplicates_only')::boolean, false) as duplicates_only,
      -- §47 asks «how many people»: one row per person, their latest matching demand
      coalesce((p->>'people')::boolean, false) as people
  ),
  m as (
    select
      c.*,
      row_number() over (partition by c.person_id order by c.created_at desc, c.id desc) as person_rank
    from public.crm_requests c, f
    where (f.q is null
           or c.full_name ilike '%' || app.like_escape(f.q) || '%'
           or c.request_no ilike '%' || app.like_escape(f.q) || '%'
           or (f.q_digits is not null and length(f.q_digits) >= 3 and c.phone_e164 like '%' || f.q_digits || '%'))
      and (f.residence_governorate_id is null or c.residence_governorate_id = f.residence_governorate_id)
      and (f.residence_delegation_id is null or c.residence_delegation_id = f.residence_delegation_id)
      and (f.invest_governorate_id is null
           or c.invest_governorate_ids @> array[f.invest_governorate_id]
           or (f.include_anywhere and c.invest_anywhere))
      and (f.project_type_id is null
           or c.project_type_ids @> array[f.project_type_id]
           or (f.include_unsure and c.project_type_unsure))
      and (f.plantation_system is null or c.plantation_systems @> array[f.plantation_system])
      and (f.production_status is null or c.production_statuses @> array[f.production_status])
      and (f.priority_code is null or c.priority_code = f.priority_code)
      -- Area overlap: the citizen's range meets the searched range (PARC-12)
      and ((f.area_min is null and f.area_max is null)
           or (f.include_area_any and c.desired_area_min_m2 is null and c.desired_area_max_m2 is null)
           or (c.desired_area_min_m2 is not null
               and (f.area_max is null or c.desired_area_min_m2 <= f.area_max)
               and (f.area_min is null or coalesce(c.desired_area_max_m2, c.desired_area_min_m2) >= f.area_min)))
      -- Tree count overlap, read exactly like the area filter and never derived from it (PARC-02)
      and ((f.trees_min is null and f.trees_max is null)
           or (f.include_trees_any and c.tree_count_min is null and c.tree_count_max is null)
           or (c.tree_count_min is not null
               and (f.trees_max is null or c.tree_count_min <= f.trees_max)
               and (f.trees_min is null or coalesce(c.tree_count_max, c.tree_count_min) >= f.trees_min)))
      and (f.down_min is null or c.down_payment_min_millimes >= f.down_min)
      and (f.down_max is null or c.down_payment_min_millimes <= f.down_max)
      and (f.installment_min is null or c.installment_min_millimes >= f.installment_min)
      and (f.installment_max is null or c.installment_min_millimes <= f.installment_max)
      and (f.duration_min is null or c.duration_months >= f.duration_min)
      and (f.duration_max is null or c.duration_months <= f.duration_max)
      and (f.wants_visit is null or c.wants_visit = f.wants_visit)
      and (f.wants_bank_financing is null or c.wants_bank_financing = f.wants_bank_financing)
      and (f.spacing_class_id is null or c.spacing_class_id = f.spacing_class_id)
      and (f.payment_mode is null or c.payment_mode = f.payment_mode)
      and (f.down_payment_percent is null or c.down_payment_percent = f.down_payment_percent)
      and (f.goal_code is null or c.goal_code = f.goal_code)
      and (f.stage is null or c.stage = f.stage)
      and (f.status_id is null or c.status_id = f.status_id)
      and (f.assigned_to is null
           or (f.assigned_to = 'none' and c.assigned_to is null)
           or c.assigned_to::text = f.assigned_to)
      and (f.date_from is null or c.created_at >= (f.date_from::timestamp at time zone 'Africa/Tunis'))
      and (f.date_to is null or c.created_at < ((f.date_to + 1)::timestamp at time zone 'Africa/Tunis'))
      and (f.source is null or coalesce(c.source->>'utm_source', 'direct') = f.source)
      and (not f.duplicates_only or c.is_duplicate)
  ),
  -- Totals cover the whole filtered set, not the page, and trees skip duplicates (MIL-01)
  t as (
    select
      count(*) as requests,
      count(distinct m.person_id) as persons,
      coalesce(sum(m.tree_count_min) filter (where not m.is_duplicate), 0) as trees
    from m
  )
  select
    m.id, m.request_no, m.created_at, m.person_id, m.full_name, m.phone_e164,
    m.residence_governorate_id, m.residence_delegation_id,
    m.invest_anywhere, m.invest_governorate_ids, m.project_type_unsure, m.project_type_ids,
    m.scenario_labels, m.plantation_systems, m.production_statuses,
    m.tree_count_code, m.tree_count_label_ar, m.tree_count_min, m.tree_count_max,
    m.desired_area_label_ar, m.desired_area_min_m2, m.desired_area_max_m2,
    m.priority_code, m.priority_label_ar,
    m.goal_code, m.goal_label_ar,
    m.down_payment_label_ar, m.down_payment_min_millimes,
    m.installment_label_ar, m.installment_min_millimes,
    m.duration_months, m.duration_label_ar,
    m.budget_label_ar, m.budget_min_millimes,
    m.wants_visit, m.wants_bank_financing,
    m.spacing_class_id, m.spacing_label_ar, m.area_per_tree_m2, m.total_area_m2, m.payment_mode,
    m.total_price_millimes, m.down_payment_percent, m.down_payment_amount_millimes,
    m.total_financed_millimes, m.monthly_millimes,
    m.contact_channel, m.contact_time_label_ar, m.is_duplicate, m.source,
    m.status_id, m.stage, m.status_label_ar, m.assigned_to, m.assigned_to_name,
    count(*) over () as total_count,
    t.requests, t.persons, t.trees
  from m, t, f
  where not f.people or m.person_rank = 1
  order by m.created_at desc, m.id desc
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0)
$$;

comment on function public.crm_search_requests(jsonb, integer, integer) is
  'CRM list and export (CRM-01..03, spec v2 §47, report v3 §44). Security invoker over crm_requests. total_count counts the rows being paged (persons when p.people is true); requests_total, persons_total and trees_total describe the whole filtered set. duration_min/duration_max are months; wants_visit and wants_bank_financing keep only the demands that gave that answer; spacing_class_id, payment_mode (cash | installments) and down_payment_percent (exact percentage) filter the calculator answers.';

revoke execute on function public.crm_search_requests(jsonb, integer, integer) from public, anon;
grant execute on function public.crm_search_requests(jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Demand report: spacing classes, payment modes, down payment percentages and total price bands (report v3 §49)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('analytics.total_price_bands_millimes', '[]'::jsonb, 'json', 'pricing', 'شرائح السعر الجملي في التحليلات',
   'الحدود العليا لشرائح السعر الجملي للطلبات، بالمليم وبترتيب تصاعدي. مثلاً [5000000, 10000000] يعني ثلاث شرائح: حتى 5,000 د، من 5,000 د حتى 10,000 د، وأكثر من 10,000 د. المالية تحدّد الشرائح؛ ما دامت القائمة فارغة، التحليلات ما تعرضش توزيع الطلبات حسب السعر الجملي.',
   false, 30)
on conflict (key) do nothing;

create or replace function public.crm_demand_stats(p_from date default null, p_to date default null, p_people boolean default false)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with r as (
    select
      ir.*,
      case when ir.is_duplicate then 0 else coalesce(ir.tree_count_min, 0) end as trees
    from public.interest_requests ir
    where (p_from is null or ir.created_at >= (p_from::timestamp at time zone 'Africa/Tunis'))
      and (p_to is null or ir.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Tunis'))
  ),
  today as (
    select date_trunc('day', now() at time zone 'Africa/Tunis') as day
  ),
  tc as (
    select
      coalesce(r.tree_count_code, '') as code,
      case when p_people then count(distinct r.person_id) else count(*) end as n,
      sum(r.trees) as trees,
      min(r.tree_count_min) as min_number,
      max(r.tree_count_label_ar) as snapshot_label
    from r
    group by 1
  ),
  -- Every active card, then retired cards, typed numbers and blank answers that demands still carry
  tb as (
    select o.code, o.label_ar as label, o.min_number::integer as min_number,
           case when o.min_number is null then 2 else 0 end as rank, o.sort_order
    from public.option_items o
    where o.list_key = 'tree_count' and o.code is not null
      and (o.is_active or exists (select 1 from tc where tc.code = o.code))
    union all
    select tc.code,
           case tc.code
             when 'custom' then app.setting_text('start.custom_label', 'عدد مخصّص')
             when '' then 'بدون إجابة'
             else tc.snapshot_label
           end,
           tc.min_number,
           case tc.code when '' then 3 else 1 end,
           0
    from tc
    where not exists (select 1 from public.option_items o where o.list_key = 'tree_count' and o.code = tc.code)
  ),
  gov as (
    select gid,
           case when p_people then count(distinct r.person_id) else count(*) end as n,
           sum(r.trees) as trees
    from r, unnest(r.invest_governorate_ids) as gid
    group by gid
  ),
  dc as (
    select r.duration_option_id as id,
           case when p_people then count(distinct r.person_id) else count(*) end as n
    from r
    group by 1
  ),
  -- Every active duration, retired durations that demands still carry, then the demands with no answer
  db as (
    select o.id, o.label_ar as label, o.min_number::integer as months, 0 as rank, o.sort_order
    from public.option_items o
    where o.list_key = 'duration'
      and (o.is_active or exists (select 1 from dc where dc.id = o.id))
    union all
    select null::uuid, 'بدون إجابة', null::integer, 1, 0
  ),
  sc as (
    select r.spacing_class_id as id,
           max(r.spacing_label_ar) as snapshot_label,
           max(r.area_per_tree_m2) as snapshot_area,
           case when p_people then count(distinct r.person_id) else count(*) end as n
    from r
    group by 1
  ),
  -- Every active class, then retired classes that demands still carry (named as snapshotted, since RLS hides
  -- retired classes from non-pricing staff), then the demands with no answer
  sb as (
    select c.id, c.label_ar as label, c.area_m2, 0 as rank, c.sort_order
    from public.tree_spacing_classes c
    where c.is_active
    union all
    select sc.id, sc.snapshot_label, sc.snapshot_area, 1, 0
    from sc
    where sc.id is not null
      and not exists (select 1 from public.tree_spacing_classes c where c.id = sc.id and c.is_active)
    union all
    select null::uuid, 'بدون إجابة', null::numeric, 2, 0
  ),
  pc as (
    select r.down_payment_percent as percent,
           case when p_people then count(distinct r.person_id) else count(*) end as n
    from r
    group by 1
  ),
  -- Every active percentage, then percentages demands still carry (snapshotted values, LEAD-02), then no answer
  pb as (
    select o.min_number as percent, min(o.label_ar) as label, 0 as rank, min(o.sort_order) as sort_order
    from public.option_items o
    where o.list_key = 'down_payment_percent' and o.is_active and o.min_number is not null
    group by o.min_number
    union all
    select pc.percent, trim_scale(pc.percent)::text || '%', 1, 0
    from pc
    where pc.percent is not null
      and not exists (select 1 from public.option_items o
                      where o.list_key = 'down_payment_percent' and o.is_active and o.min_number = pc.percent)
    union all
    select null::numeric, 'بدون إجابة', 2, 0
  ),
  -- Finance's upper bounds (analytics.total_price_bands_millimes); anything but whole millimes is ignored
  bounds as (
    select distinct e::bigint as hi
    from jsonb_array_elements_text(
           case when jsonb_typeof(app.setting('analytics.total_price_bands_millimes')) = 'array'
                then app.setting('analytics.total_price_bands_millimes') else '[]'::jsonb end) as e
    where e ~ '^[0-9]{1,18}$'
  ),
  -- A band holds the totals above min and up to max; the last band has no max
  bands as (
    select lag(b.hi) over (order by b.hi) as lo, b.hi, row_number() over (order by b.hi) as rank
    from bounds b
    union all
    select max(b.hi), null::bigint, count(*) + 1
    from bounds b
    having count(*) > 0
  )
  select jsonb_build_object(
    'people_mode', p_people,
    'requests', (select count(*) from r),
    'persons', (select count(distinct person_id) from r),
    'duplicates', (select count(*) from r where is_duplicate),
    'trees_total', (select coalesce(sum(trees), 0) from r),
    'today', (select case when p_people then count(distinct person_id) else count(*) end
              from r, today where r.created_at >= (today.day at time zone 'Africa/Tunis')),
    'last_7_days', (select case when p_people then count(distinct person_id) else count(*) end
                    from r where created_at >= now() - interval '7 days'),
    'anywhere', (select case when p_people then count(distinct person_id) else count(*) end from r where invest_anywhere),
    'anywhere_trees', (select coalesce(sum(trees), 0) from r where invest_anywhere),
    'unsure_type', (select case when p_people then count(distinct person_id) else count(*) end from r where project_type_unsure),
    'visit_yes', (select case when p_people then count(distinct person_id) else count(*) end from r where wants_visit),
    'bank_financing_yes', (select case when p_people then count(distinct person_id) else count(*) end
                           from r where wants_bank_financing),
    'by_tree_count', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', nullif(tb.code, ''), 'label', tb.label, 'min', tb.min_number,
               'count', coalesce(tc.n, 0), 'trees', coalesce(tc.trees, 0))
             order by tb.rank, tb.sort_order, tb.min_number nulls last, tb.code)
      from tb
      left join tc on tc.code = tb.code
    ), '[]'::jsonb),
    'by_duration', coalesce((
      select jsonb_agg(jsonb_build_object('id', db.id, 'label', db.label, 'months', db.months, 'count', coalesce(dc.n, 0))
             order by db.rank, db.months nulls last, db.sort_order)
      from db
      left join dc on dc.id is not distinct from db.id
    ), '[]'::jsonb),
    'by_spacing_class', coalesce((
      select jsonb_agg(jsonb_build_object('id', sb.id, 'label', sb.label, 'area_m2', sb.area_m2, 'count', coalesce(sc.n, 0))
             order by sb.rank, sb.sort_order, sb.area_m2 desc nulls last, sb.label)
      from sb
      left join sc on sc.id is not distinct from sb.id
    ), '[]'::jsonb),
    'by_payment_mode', coalesce((
      select jsonb_agg(jsonb_build_object('code', pm.code, 'count', coalesce(x.n, 0)) order by pm.rank)
      from (values ('cash'::text, 0), ('installments'::text, 1), (null::text, 2)) as pm(code, rank)
      left join (
        select payment_mode as code, case when p_people then count(distinct person_id) else count(*) end as n
        from r group by 1
      ) x on x.code is not distinct from pm.code
    ), '[]'::jsonb),
    'by_down_payment_percent', coalesce((
      select jsonb_agg(jsonb_build_object('percent', trim_scale(pb.percent), 'label', pb.label, 'count', coalesce(pc.n, 0))
             order by pb.rank, pb.percent nulls last, pb.sort_order)
      from pb
      left join pc on pc.percent is not distinct from pb.percent
    ), '[]'::jsonb),
    -- Empty until Finance sets the bounds, so the page hides the breakdown; «بدون إجابة» holds demands with no total.
    'by_total_price_band', coalesce((
      select jsonb_agg(jsonb_build_object('min', x.lo, 'max', x.hi, 'label', x.label, 'count', x.n) order by x.rank)
      from (
        select bd.lo, bd.hi, null::text as label, bd.rank,
               (select case when p_people then count(distinct r.person_id) else count(*) end
                from r
                where r.total_price_millimes is not null
                  and (bd.lo is null or r.total_price_millimes > bd.lo)
                  and (bd.hi is null or r.total_price_millimes <= bd.hi)) as n
        from bands bd
        union all
        select null::bigint, null::bigint, 'بدون إجابة', (select count(*) + 2 from bounds),
               (select case when p_people then count(distinct r.person_id) else count(*) end
                from r where r.total_price_millimes is null)
        where exists (select 1 from bounds)
      ) x
    ), '[]'::jsonb),
    -- A demand naming several governorates counts in each of them: nothing is split or invented.
    'by_invest_governorate', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name_ar, 'count', coalesce(gov.n, 0), 'trees', coalesce(gov.trees, 0))
                       order by coalesce(gov.n, 0) desc, g.sort_order)
      from public.governorates g
      left join gov on gov.gid = g.id
    ), '[]'::jsonb),
    'by_governorate_trees', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name_ar, 'trees', coalesce(gov.trees, 0), 'count', coalesce(gov.n, 0))
                       order by coalesce(gov.trees, 0) desc, coalesce(gov.n, 0) desc, g.sort_order)
      from public.governorates g
      left join gov on gov.gid = g.id
    ), '[]'::jsonb),
    'by_project_type', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.label_ar, 'count', coalesce(c.n, 0)) order by t.sort_order)
      from public.project_types t
      left join (
        select tid, case when p_people then count(distinct r.person_id) else count(*) end as n
        from r, unnest(r.project_type_ids) as tid group by tid
      ) c on c.tid = t.id
    ), '[]'::jsonb),
    'by_scenario', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.label_ar, 'count', coalesce(c.n, 0)) order by s.sort_order)
      from public.ownership_scenarios s
      left join (
        select sid, case when p_people then count(distinct r.person_id) else count(*) end as n
        from r, unnest(r.scenario_ids) as sid group by sid
      ) c on c.sid = s.id
    ), '[]'::jsonb),
    'by_desired_area', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select coalesce(desired_area_label_ar, 'بدون إجابة') as label, desired_area_min_m2 as min,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    'by_priority', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc)
      from (select coalesce(priority_label_ar, 'بدون إجابة') as label,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1) x
    ), '[]'::jsonb),
    'by_plantation_system', coalesce((
      select jsonb_agg(jsonb_build_object('code', o.code, 'name', o.label_ar, 'count', coalesce(c.n, 0)) order by o.sort_order)
      from public.option_items o
      left join (
        select ps, case when p_people then count(distinct r.person_id) else count(*) end as n
        from r, unnest(r.plantation_systems) as ps group by ps
      ) c on c.ps = o.code
      where o.list_key = 'plantation_system'
    ), '[]'::jsonb),
    -- Cash demands carry no down payment and land in «بدون إجابة», like installments after report v3 §6.
    'by_down_payment', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select coalesce(down_payment_label_ar, 'بدون إجابة') as label, down_payment_min_millimes as min,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    -- Demands made after report v3 §6 carry no installment and land in «بدون إجابة».
    'by_installment', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'min', x.min, 'count', x.n) order by x.min nulls last)
      from (select coalesce(installment_label_ar, 'بدون إجابة') as label, installment_min_millimes as min,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1, 2) x
    ), '[]'::jsonb),
    'by_goal', coalesce((
      select jsonb_agg(jsonb_build_object('label', x.label, 'count', x.n) order by x.n desc)
      from (select goal_label_ar as label,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1) x
    ), '[]'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'count', x.n) order by x.n desc)
      from (select coalesce(source->>'utm_source', 'direct') as source,
                   case when p_people then count(distinct person_id) else count(*) end as n
            from r group by 1) x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0)) order by d.day)
      from today,
           generate_series(today.day - interval '29 days', today.day, interval '1 day') as d(day)
      left join (
        select date_trunc('day', created_at at time zone 'Africa/Tunis') as day,
               case when p_people then count(distinct person_id) else count(*) end as n
        from r group by 1
      ) c on c.day = d.day
    ), '[]'::jsonb)
  )
$$;

comment on function public.crm_demand_stats(date, date, boolean) is
  'Demand report for the dashboard and analytics (spec v2 §46, §47, §55, report v3 §49). Security invoker: figures cover only the files the caller may see. p_people counts distinct persons in every breakdown; trees never count duplicates (MIL-01). by_duration and by_spacing_class list active entries, retired ones still carried by demands, then «no answer»; by_down_payment_percent lists {percent, label, count} for active percentages, percentages demands still carry, then «no answer»; by_total_price_band lists {min, max, label, count} bands from analytics.total_price_bands_millimes (a band holds totals above min and up to max, then «no answer»), or [] while no bound is set; by_payment_mode lists cash, installments and no answer; visit_yes and bank_financing_yes count the «yes» answers.';

revoke execute on function public.crm_demand_stats(date, date, boolean) from public, anon;
grant execute on function public.crm_demand_stats(date, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Copy for /start and /register (MIL-02, PRN-02): rows named in the addendum or report v3 §12/§51 carry no draft flag
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('start.spacing_title', to_jsonb('المساحة لكل زيتونة'::text), 'text', 'site', 'عنوان اختيار المساحة لكل زيتونة',
   'عنوان خيارات فئات التباعد في صفحة /start (الإضافة «مساحة وتكلفة الزيتونة»).', true, 300),
  ('start.spacing_title_fr', to_jsonb('Surface par olivier'::text), 'text', 'site', 'عنوان اختيار المساحة لكل زيتونة (فرنسي)',
   'السطر الفرنسي تحت عنوان فئات التباعد. مسودة، تُراجع من الإدارة.', true, 301),
  ('start.spacing_hint', to_jsonb('كل فئة تعني تباعداً بين الزيتونات ومساحة مرتبطة بكل زيتونة.'::text), 'text', 'site', 'تلميح اختيار المساحة',
   'النص تحت عنوان فئات التباعد. مسودة، تُراجع من الإدارة.', true, 302),
  ('start.spacing_hint_fr', to_jsonb('Chaque catégorie correspond à un espacement et à une surface par olivier.'::text), 'text', 'site', 'تلميح اختيار المساحة (فرنسي)',
   'السطر الفرنسي تحت تلميح فئات التباعد. مسودة، تُراجع من الإدارة.', true, 303),
  ('start.spacing_any', to_jsonb('ما نعرفش، اقترحولي'::text), 'text', 'site', 'خيار «ما نعرفش» في المساحة',
   'الخيار المفتوح في آخر فئات التباعد: الطلب يُسجَّل بلا فئة. مسودة، تُراجع من الإدارة.', true, 304),
  ('start.spacing_any_fr', to_jsonb('Je ne sais pas, proposez-moi'::text), 'text', 'site', 'خيار «ما نعرفش» في المساحة (فرنسي)',
   'السطر الفرنسي تحت الخيار المفتوح. مسودة، تُراجع من الإدارة.', true, 305),
  ('start.payment_title', to_jsonb('كيفاش تحب تخلّص؟'::text), 'text', 'site', 'سؤال طريقة الدفع',
   'عنوان اختيار طريقة الدفع في صفحة /start. مسودة، تُراجع من الإدارة.', true, 306),
  ('start.payment_title_fr', to_jsonb('Comment souhaitez-vous payer ?'::text), 'text', 'site', 'سؤال طريقة الدفع (فرنسي)',
   'السطر الفرنسي تحت سؤال طريقة الدفع. مسودة، تُراجع من الإدارة.', true, 307),
  ('start.payment_cash', to_jsonb('بالحاضر'::text), 'text', 'site', 'خيار الدفع بالحاضر',
   'زر الدفع بالحاضر (التقرير v3 البند 51: «إذا خلص الحريف بالحاضر»).', true, 308),
  ('start.payment_cash_fr', to_jsonb('Au comptant'::text), 'text', 'site', 'خيار الدفع بالحاضر (فرنسي)',
   'السطر الفرنسي تحت زر الدفع بالحاضر. مسودة، تُراجع من الإدارة.', true, 309),
  ('start.payment_installments', to_jsonb('بالتقسيط'::text), 'text', 'site', 'خيار الدفع بالتقسيط',
   'زر الدفع بالتقسيط (التقرير v3 البند 51).', true, 310),
  ('start.payment_installments_fr', to_jsonb('Par mensualités'::text), 'text', 'site', 'خيار الدفع بالتقسيط (فرنسي)',
   'السطر الفرنسي تحت زر الدفع بالتقسيط. مسودة، تُراجع من الإدارة.', true, 311),
  ('start.row_area_per_tree', to_jsonb('المساحة لكل زيتونة'::text), 'text', 'site', 'صف المساحة لكل زيتونة في الملخّص',
   'صف في بطاقة الملخّص (الإضافة «ما يظهر للـVisitor»).', true, 312),
  ('start.row_area_per_tree_fr', to_jsonb('Surface par olivier'::text), 'text', 'site', 'صف المساحة لكل زيتونة (فرنسي)',
   'السطر الفرنسي تحت الصف. مسودة، تُراجع من الإدارة.', true, 313),
  ('start.row_total_area', to_jsonb('المساحة الجملية'::text), 'text', 'site', 'صف المساحة الجملية في الملخّص',
   'صف في بطاقة الملخّص (الإضافة «ما يظهر للـVisitor»).', true, 314),
  ('start.row_total_area_fr', to_jsonb('Surface totale'::text), 'text', 'site', 'صف المساحة الجملية (فرنسي)',
   'السطر الفرنسي تحت الصف. مسودة، تُراجع من الإدارة.', true, 315),
  ('start.row_price_per_tree', to_jsonb('سعر الزيتونة'::text), 'text', 'site', 'صف سعر الزيتونة في الملخّص',
   'صف في بطاقة الملخّص (الإضافة «ما يظهر للـVisitor»).', true, 316),
  ('start.row_price_per_tree_fr', to_jsonb('Prix par olivier'::text), 'text', 'site', 'صف سعر الزيتونة (فرنسي)',
   'السطر الفرنسي تحت الصف. مسودة، تُراجع من الإدارة.', true, 317),
  ('start.row_total_price', to_jsonb('السعر الجملي للطلب'::text), 'text', 'site', 'صف السعر الجملي في الملخّص',
   'صف في بطاقة الملخّص (الإضافة «ما يظهر للـVisitor»).', true, 318),
  ('start.row_total_price_fr', to_jsonb('Prix total de la demande'::text), 'text', 'site', 'صف السعر الجملي (فرنسي)',
   'السطر الفرنسي تحت الصف. مسودة، تُراجع من الإدارة.', true, 319),
  ('start.row_payment', to_jsonb('طريقة الدفع'::text), 'text', 'site', 'صف طريقة الدفع في الملخّص',
   'صف في بطاقة الملخّص (الإضافة: «التسبقة والمدة وطريقة الدفع»).', true, 320),
  ('start.row_payment_fr', to_jsonb('Mode de paiement'::text), 'text', 'site', 'صف طريقة الدفع (فرنسي)',
   'السطر الفرنسي تحت الصف. مسودة، تُراجع من الإدارة.', true, 321),
  ('start.row_total_financed', to_jsonb('السعر الجملي بالتقسيط'::text), 'text', 'site', 'صف السعر الجملي بالتقسيط في الملخّص',
   'صف في بطاقة الملخّص (التقرير v3 البند 51 «Prix total financé»).', true, 322),
  ('start.row_total_financed_fr', to_jsonb('Prix total financé'::text), 'text', 'site', 'صف السعر الجملي بالتقسيط (فرنسي)',
   'السطر الفرنسي تحت الصف (التقرير v3 البند 51).', true, 323),
  ('start.row_remaining', to_jsonb('المبلغ المتبقي'::text), 'text', 'site', 'صف المبلغ المتبقي في الملخّص',
   'صف في بطاقة الملخّص (التقرير v3 البند 12).', true, 324),
  ('start.row_remaining_fr', to_jsonb('Montant restant'::text), 'text', 'site', 'صف المبلغ المتبقي (فرنسي)',
   'السطر الفرنسي تحت الصف. مسودة، تُراجع من الإدارة.', true, 325),
  ('start.row_monthly', to_jsonb('القسط الشهري'::text), 'text', 'site', 'صف القسط الشهري في الملخّص',
   'صف في بطاقة الملخّص (التقرير v3 البند 12).', true, 326),
  ('start.row_monthly_fr', to_jsonb('Mensualité'::text), 'text', 'site', 'صف القسط الشهري (فرنسي)',
   'السطر الفرنسي تحت الصف (التقرير v3 البند 51 «Mensualité»).', true, 327),
  ('start.last_installment', to_jsonb('آخر قسط: {amount}'::text), 'text', 'site', 'جملة آخر قسط',
   'تظهر عندما يكون آخر قسط أصغر من القسط الشهري. {amount} يُستبدل بالمبلغ. مسودة، تُراجع من الإدارة.', true, 328),
  ('start.last_installment_fr', to_jsonb('Dernière mensualité : {amount}'::text), 'text', 'site', 'جملة آخر قسط (فرنسي)',
   'السطر الفرنسي؛ {amount} يُستبدل بالمبلغ. مسودة، تُراجع من الإدارة.', true, 329),
  ('start.installments_count', to_jsonb('{count} قسطاً'::text), 'text', 'site', 'عدد الأقساط',
   'تظهر عندما يكون عدد الأقساط أقل من أشهر المدة. {count} يُستبدل بالعدد. مسودة، تُراجع من الإدارة.', true, 330),
  ('start.installments_count_fr', to_jsonb('{count} mensualités'::text), 'text', 'site', 'عدد الأقساط (فرنسي)',
   'السطر الفرنسي؛ {count} يُستبدل بالعدد. مسودة، تُراجع من الإدارة.', true, 331),
  ('start.from_prefix', to_jsonb('ابتداءً من'::text), 'text', 'site', 'بادئة «ابتداءً من»',
   'قبل السعر عندما يكون عدد الزيتونات مجالاً مفتوحاً مثل «أكثر من 500». مسودة، تُراجع من الإدارة.', true, 332),
  ('start.from_prefix_fr', to_jsonb('À partir de'::text), 'text', 'site', 'بادئة «ابتداءً من» (فرنسي)',
   'السطر الفرنسي للبادئة. مسودة، تُراجع من الإدارة.', true, 333),
  ('start.estimate_note', to_jsonb('هذا تقدير أولي حسب الإعدادات الحالية. التفاصيل النهائية في بطاقة المشروع والعقد.'::text), 'text', 'site', 'ملاحظة تحت الأسعار',
   'تحت أرقام الملخّص. مسودة، تُراجع من الإدارة.', true, 334),
  ('start.estimate_note_fr', to_jsonb('Estimation initiale selon les paramètres actuels. Les détails définitifs figurent dans la fiche du projet et le contrat.'::text), 'text', 'site', 'ملاحظة تحت الأسعار (فرنسي)',
   'السطر الفرنسي للملاحظة. مسودة، تُراجع من الإدارة.', true, 335),
  ('start.price_unavailable', to_jsonb('السعر يتحدّد قريباً.'::text), 'text', 'site', 'نص السعر غير المتوفّر',
   'مكان السعر عندما لا تكتمل إعدادات التسعير. مسودة، تُراجع من الإدارة.', true, 336),
  ('start.price_unavailable_fr', to_jsonb('Prix bientôt disponible.'::text), 'text', 'site', 'نص السعر غير المتوفّر (فرنسي)',
   'السطر الفرنسي. مسودة، تُراجع من الإدارة.', true, 337),
  ('start.duration_not_priced', to_jsonb('التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى.'::text), 'text', 'site', 'نص المدة غير المسعّرة',
   'يظهر عندما لا توجد نسبة زيادة للمدة المختارة. مسودة، تُراجع من الإدارة.', true, 338),
  ('start.duration_not_priced_fr', to_jsonb('Cette durée n''est pas encore proposée. Choisissez-en une autre.'::text), 'text', 'site', 'نص المدة غير المسعّرة (فرنسي)',
   'السطر الفرنسي. مسودة، تُراجع من الإدارة.', true, 339),
  ('start.down_covers_total', to_jsonb('التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر.'::text), 'text', 'site', 'نص التسبقة الأكبر من السعر',
   'يظهر عندما تغطي التسبقة السعر الجملي بالتقسيط. مسودة، تُراجع من الإدارة.', true, 340),
  ('start.down_covers_total_fr', to_jsonb('L''apport dépasse le prix total. Choisissez un apport plus petit ou payez au comptant.'::text), 'text', 'site', 'نص التسبقة الأكبر من السعر (فرنسي)',
   'السطر الفرنسي. مسودة، تُراجع من الإدارة.', true, 341),
  ('start.down_percent_title', to_jsonb('نسبة التسبقة'::text), 'text', 'site', 'عنوان اختيار نسبة التسبقة',
   'عنوان خيارات نسبة التسبقة في صفحة /start (الخطة Q-1). مسودة، تُراجع من الإدارة.', true, 342),
  ('start.down_percent_title_fr', to_jsonb('Apport (en %)'::text), 'text', 'site', 'عنوان اختيار نسبة التسبقة (فرنسي)',
   'السطر الفرنسي تحت عنوان نسبة التسبقة. مسودة، تُراجع من الإدارة.', true, 343),
  ('start.down_percent_hint', to_jsonb('التسبقة تتحسب من السعر الجملي بالحاضر.'::text), 'text', 'site', 'تلميح نسبة التسبقة',
   'النص تحت خيارات نسبة التسبقة (الخطة Q-2). مسودة، تُراجع من الإدارة.', true, 344),
  ('start.down_percent_hint_fr', to_jsonb('L''apport est calculé sur le prix total au comptant.'::text), 'text', 'site', 'تلميح نسبة التسبقة (فرنسي)',
   'السطر الفرنسي تحت تلميح نسبة التسبقة. مسودة، تُراجع من الإدارة.', true, 345),
  ('start.edit_choices', to_jsonb('بدّل اختياراتك'::text), 'text', 'site', 'رابط تبديل الاختيارات',
   'الرابط اللي يرجّع الزائر لصفحة /start باختياراته (الخطة P2-6). مسودة، تُراجع من الإدارة.', true, 346),
  ('start.edit_choices_fr', to_jsonb('Modifier vos choix'::text), 'text', 'site', 'رابط تبديل الاختيارات (فرنسي)',
   'السطر الفرنسي تحت رابط تبديل الاختيارات. مسودة، تُراجع من الإدارة.', true, 347),
  ('register.summary_title', to_jsonb('اختياراتك في الحاسبة'::text), 'text', 'site', 'عنوان ملخّص الحاسبة في التسجيل',
   'عنوان خطوة ملخّص إجابات الحاسبة في صفحة /register (الخطة P2-2 وP2-6). مسودة، تُراجع من الإدارة.', true, 348),
  ('start.continue_hint_payment', to_jsonb('اختر طريقة الدفع باش تكمّل.'::text), 'text', 'site', 'ملاحظة: طريقة الدفع ناقصة',
   'تظهر تحت زر «سجّل اهتمامك» في صفحة /start ما دامت طريقة الدفع لم تُختر بعد. مسودة، تُراجع من الإدارة.', true, 349),
  ('start.continue_hint_payment_fr', to_jsonb('Choisissez un mode de paiement pour continuer.'::text), 'text', 'site', 'ملاحظة: طريقة الدفع ناقصة (فرنسي)',
   'السطر الفرنسي تحت الملاحظة. مسودة، تُراجع من الإدارة.', true, 350),
  ('start.continue_hint_installments', to_jsonb('اختر نسبة التسبقة ومدة الدفع باش تكمّل.'::text), 'text', 'site', 'ملاحظة: التسبقة أو المدة ناقصة',
   'تظهر تحت زر «سجّل اهتمامك» في صفحة /start عند اختيار التقسيط بلا نسبة تسبقة أو بلا مدة. مسودة، تُراجع من الإدارة.', true, 351),
  ('start.continue_hint_installments_fr', to_jsonb('Choisissez le pourcentage d''apport et la durée pour continuer.'::text), 'text', 'site', 'ملاحظة: التسبقة أو المدة ناقصة (فرنسي)',
   'السطر الفرنسي تحت الملاحظة. مسودة، تُراجع من الإدارة.', true, 352),
  ('register.success_note', to_jsonb('التسجيل مجاني ولا يلزمك بالشراء.'::text), 'text', 'site', 'ملاحظة بعد التسجيل',
   'تظهر في صفحة /register بعد نجاح التسجيل. مسودة، تُراجع من الإدارة.', true, 353)
on conflict (key) do nothing;

-- The /start button now leads straight to the demand once the payment is chosen (plan P2-6). Only while the 0019
-- seeds are untouched, so a text the owner already edited is kept.
update public.settings
set value = to_jsonb('سجّل اهتمامك'::text),
    description_ar = concat_ws(' ', description_ar, 'مسودة، تُراجع من الإدارة: «متابعة» عُوّضت بـ«سجّل اهتمامك» (الخطة P2-6).')
where key = 'start.continue' and value = to_jsonb('متابعة'::text);

update public.settings
set value = to_jsonb('Enregistrer votre intérêt'::text),
    description_ar = concat_ws(' ', description_ar, 'مسودة، تُراجع من الإدارة.')
where key = 'start.continue_fr' and value = to_jsonb('Continuer'::text);

-- The payment is no longer optional on /start, so «الباقي اختياري» leaves the hint.
update public.settings
set value = to_jsonb('اختر عدد الزيتونات باش تكمّل.'::text),
    description_ar = concat_ws(' ', description_ar, 'مسودة، تُراجع من الإدارة: حُذفت «الباقي اختياري» (الخطة P2-6).')
where key = 'start.continue_hint' and value = to_jsonb('اختر عدد الزيتونات باش تكمّل. الباقي اختياري.'::text);

update public.settings
set value = to_jsonb('Choisissez un nombre d''oliviers pour continuer.'::text),
    description_ar = concat_ws(' ', description_ar, 'مسودة، تُراجع من الإدارة.')
where key = 'start.continue_hint_fr'
  and value = to_jsonb('Choisissez un nombre d''oliviers pour continuer. Le reste est facultatif.'::text);
