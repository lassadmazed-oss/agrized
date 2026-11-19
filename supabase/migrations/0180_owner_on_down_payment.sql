-- 0180 · The deposit, the down payment, and ownership that follows the down payment.
--
-- Its test is supabase/tests/124_owner_on_down_payment.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0180_owner_on_down_payment.sql supabase/tests/124_owner_on_down_payment.sql
--
-- THE OWNER, 2026-11-19: «فما فرق ما بين العربون وما بين التسبقة … العربون نحنا ناخذو 50، التسبقة هي 30% … كل عرض
-- فيه كذا كذا … احنا في التيران ناخذو عربون، ومن بعد كيف يجي للإدارة باش ياخذ الكونترا ويدفع 30% ويكمل الفونت
-- متاعو، ويولّي بعد ما يدفع 30% وياخذ ليشيونس متاعو، يولّي مالك أوتوماتيكمون».
--
-- THREE THINGS, NOW SAID IN THE DATA:
--   1. العربون is the small sum taken on the land (0175 lets the commercial record any amount). Its default for an
--      offer that sets none goes from 1 000 DT to 50 DT (settings reservations.deposit_millimes_default, only
--      while it still holds the old figure). It still counts toward the down payment
--      (contracts.deposit_counts_toward_down_payment, unchanged).
--   2. التسبقة is a percentage of the price, paid at the office with the contract: 30% by default
--      (contracts.down_payment_percent_default) and each offer may set its own (projects.down_payment_percent).
--      A contract whose form and demand give no down payment takes the offer's percentage of its total.
--   3. OWNERSHIP FOLLOWS THE DOWN PAYMENT. Until now «مالك» was a separate legal act pressed by hand
--      (staff_set_contract_owned, v2 §38). The owner's rule replaces it: the client becomes the owner by
--      himself once the contract is signed, the down payment is paid in full (the deposit credited included)
--      and, on instalments, his schedule (les échéances) exists. app.contract_auto_own checks it after every
--      receipt, at the signature and when a schedule is generated. settings contracts.owner_on_down_payment
--      switches the rule off; the hand-pressed act remains for any case it does not cover.
--      0091's legal gate still holds: while a mandatory paper «قبل تسجيل التملّك» is open, the receipt is kept
--      and ownership waits — the tick (or waiver) of that paper calls the rule again.

-- ---------------------------------------------------------------------------
-- 1 · Figures
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('contracts.down_payment_percent_default', to_jsonb(30), 'integer', 'contracts', 'نسبة التسبقة بالمائة (كي العرض ما يحدّدهاش)',
   'التسبقة تتخلّص في الإدارة مع العقد. كل عرض ينجم يحطّ نسبتو.', false, 20),
  ('contracts.owner_on_down_payment', 'true'::jsonb, 'boolean', 'contracts', 'الحريف يولّي مالك وحدو كي يخلّص التسبقة',
   'كي العقد يتمضى، التسبقة تتخلّص كاملة (العربون محسوب فيها) وجدول الأقساط يتعمل، الحريف يولّي مالك من غير زرّ.', false, 21)
on conflict (key) do nothing;

update public.settings set value = to_jsonb(50000), updated_at = now()
 where key = 'reservations.deposit_millimes_default' and value = to_jsonb(1000000);

alter table public.projects
  add column if not exists down_payment_percent numeric(5, 2);
alter table public.projects drop constraint if exists projects_down_payment_percent_check;
alter table public.projects add constraint projects_down_payment_percent_check
  check (down_payment_percent is null or (down_payment_percent > 0 and down_payment_percent < 100));
comment on column public.projects.down_payment_percent is
  '0180: this offer''s down payment (التسبقة) as a percentage of the price. Null = settings contracts.down_payment_percent_default.';

/** The offer's down payment percentage, else the default. */
create or replace function app.offer_down_payment_percent(p_project uuid) returns numeric
language sql stable security definer set search_path = '' as $fn$
  select coalesce((select pj.down_payment_percent from public.projects pj where pj.id = p_project),
                  app.setting_int('contracts.down_payment_percent_default', 30)::numeric)
$fn$;
revoke execute on function app.offer_down_payment_percent(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Ownership follows the down payment
-- ---------------------------------------------------------------------------

create or replace function app.contract_auto_own(p_contract uuid) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare
  v_c     public.contracts;
  v_money jsonb;
begin
  if not app.setting_bool('contracts.owner_on_down_payment', true) then
    return false;
  end if;
  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found or v_c.owned_at is not null or v_c.status not in ('signed', 'completed') then
    return false;
  end if;
  v_money := app.contract_money(p_contract);
  if coalesce((v_money->>'down_payment_left_millimes')::bigint, 1) > 0 then
    return false;
  end if;
  if v_c.payment_mode = 'installments' and v_c.schedule_generated_at is null then
    return false;
  end if;

  begin
    update public.contracts c set owned_at = now(), owned_by = auth.uid(), updated_by = auth.uid()
     where c.id = p_contract;
  exception when sqlstate 'P0001' then
    -- 0091's trigger: a mandatory paper «قبل تسجيل التملّك» is still open on this sale's legal file. The receipt
    -- (or the signature) stands; ownership waits for the paper, and ticking or waiving it calls this again.
    if sqlerrm in ('legal_checklist_incomplete', 'legal_file_required') then
      return false;
    end if;
    raise;
  end;
  perform app.write_audit('contracts.owned', 'contracts', p_contract::text,
                          jsonb_build_object('owned_at', null),
                          jsonb_build_object('owned_at', now(), 'auto', true, 'rule', 'down_payment_paid'), null);
  return true;
end $fn$;
revoke execute on function app.contract_auto_own(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · The offer's sale terms, read and written from its page (التسعير)
-- ---------------------------------------------------------------------------

create or replace function public.staff_offer_sale_terms(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_pj public.projects;
begin
  if not app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'deposit_millimes', v_pj.reservation_deposit_millimes,
    'valid_days', v_pj.reservation_valid_days,
    'down_payment_percent', v_pj.down_payment_percent,
    'default_deposit_millimes', app.setting_millimes('reservations.deposit_millimes_default', 0),
    'default_valid_days', app.setting_int('reservations.valid_days_default', 0),
    'default_down_payment_percent', app.setting_int('contracts.down_payment_percent_default', 30),
    'owner_on_down_payment', app.setting_bool('contracts.owner_on_down_payment', true));
end $fn$;
revoke execute on function public.staff_offer_sale_terms(uuid) from public, anon;
grant execute on function public.staff_offer_sale_terms(uuid) to authenticated;

/** Empty means «the default». The figures already written on a reservation or a contract are never touched. */
create or replace function public.staff_save_offer_sale_terms(p_project uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_deposit bigint := nullif(p->>'deposit_millimes', '')::bigint;
  v_days    integer := nullif(p->>'valid_days', '')::integer;
  v_pct     numeric := nullif(p->>'down_payment_percent', '')::numeric;
begin
  if not app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_deposit is not null and v_deposit < 0 then
    raise exception 'invalid_deposit_amount' using errcode = 'P0001';
  end if;
  if v_days is not null and (v_days < 0 or v_days > 365) then
    raise exception 'invalid_valid_days' using errcode = 'P0001';
  end if;
  if v_pct is not null and (v_pct <= 0 or v_pct >= 100) then
    raise exception 'invalid_down_payment_percent' using errcode = 'P0001';
  end if;
  update public.projects pj
     set reservation_deposit_millimes = v_deposit, reservation_valid_days = v_days, down_payment_percent = v_pct
   where pj.id = p_project;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  perform app.write_audit('projects.sale_terms', 'projects', p_project::text, null,
                          jsonb_build_object('deposit_millimes', v_deposit, 'valid_days', v_days, 'down_payment_percent', v_pct), null);
  return public.staff_offer_sale_terms(p_project);
end $fn$;
revoke execute on function public.staff_save_offer_sale_terms(uuid, jsonb) from public, anon;
grant execute on function public.staff_save_offer_sale_terms(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · The four places that call it: their live bodies, each with one addition marked «0180»
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_create_contract(p_reservation uuid, p_kind uuid, p_payment_mode text, p_down_payment_millimes bigint, p_duration_months integer, p_method uuid, p_note text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r        public.reservations;
  v_req      public.interest_requests;
  v_kind     public.option_items;
  v_method   public.option_items;
  v_mode     text;
  v_trees    integer;
  v_per_tree bigint;
  v_total    bigint;
  v_down     bigint;
  v_pct      numeric;
  v_months   integer;
  v_quote    jsonb;
  v_credit   bigint := 0;
  v_deposit  bigint;
  v_ref      text;
  v_year     text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_id       uuid;
  v_sold     integer;
begin
  perform app.assert_contracts_open();

  select * into v_r from public.reservations r where r.id = p_reservation for no key update;
  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  -- 0054: «Marking a tree sold is the contract moment», so Legal, Finance and Admin — intersected with the
  -- files the caller may read. The commercial who sold the deal cannot sign it; that is the rule, not a bug.
  if not (app.can_contract_trees() and app.can_see_person(v_r.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- 'converted' is written here and nowhere else in the database. staff_close_reservation refuses that value
  -- by name and points at this module.
  if v_r.status not in ('awaiting_deposit', 'deposit_paid') then
    raise exception 'reservation_not_convertible' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.contracts c where c.reservation_id = v_r.id) then
    raise exception 'reservation_already_contracted' using errcode = 'P0001';
  end if;
  if app.setting_bool('contracts.require_deposit_paid', true) and v_r.status = 'awaiting_deposit' then
    raise exception 'deposit_not_paid' using errcode = 'P0001';
  end if;

  -- The trees actually held right now, not the number the reservation remembers taking: if some were released
  -- from the offer's own screen in the meantime, the contract is written for what is really there (§46).
  select count(*)::integer into v_trees
  from public.trees t where t.reservation_id = v_r.id and t.state = 'reserved';
  if coalesce(v_trees, 0) < 1 then
    raise exception 'no_trees_to_contract' using errcode = 'P0001';
  end if;

  if v_r.request_id is not null then
    select * into v_req from public.interest_requests r where r.id = v_r.request_id;
  end if;

  if p_kind is not null then
    v_kind := app.active_option('contract_kind', p_kind::text);
    if v_kind.id is null then
      raise exception 'invalid_contract_kind' using errcode = 'P0001';
    end if;
  else
    -- v3 §28's «عقد وعد بالبيع» is the first row of the list, and the owner may reorder or add to it.
    select * into v_kind from public.option_items o
    where o.list_key = 'contract_kind' and o.is_active order by o.sort_order, o.code limit 1;
  end if;

  if p_method is not null then
    v_method := app.active_option('payment_method', p_method::text);
    if v_method.id is null then
      raise exception 'invalid_payment_method' using errcode = 'P0001';
    end if;
  end if;

  -- §34 «Total Price», from the price this client was quoted times the trees they are actually taking.
  v_per_tree := app.contract_price_per_tree(v_r.project_id, v_r.request_id);
  if v_per_tree is null or v_per_tree <= 0 then
    raise exception 'contract_price_unavailable' using errcode = 'P0001';
  end if;
  v_total := v_per_tree * v_trees;

  -- «Not answering is an answer» — 0061's own rule. Nothing defaults to cash silently.
  v_mode := lower(nullif(btrim(coalesce(p_payment_mode, coalesce(v_req.payment_mode, ''))), ''));
  if v_mode is null then
    raise exception 'payment_mode_required' using errcode = 'P0001';
  end if;
  if v_mode not in ('cash', 'installments') then
    raise exception 'invalid_payment_mode' using errcode = 'P0001';
  end if;

  if v_mode = 'cash' then
    -- A cash contract: a total, a down payment of the whole amount, and zero schedule rows.
    v_down := v_total;
  else
    -- 0180: when neither the form nor the demand says, the offer's own down payment percentage (التسبقة, 30% by
    -- default) of the total — the owner, 2026-11-19: «التسبقة هي 30% … كل عرض فيه كذا كذا».
    v_down := coalesce(p_down_payment_millimes, v_req.down_payment_amount_millimes,
                       round(v_total::numeric * app.offer_down_payment_percent(v_r.project_id) / 100)::bigint);
    if v_down is null then
      raise exception 'down_payment_required' using errcode = 'P0001';
    end if;
    v_months := coalesce(p_duration_months, v_req.duration_months);
    if v_months is null then
      raise exception 'duration_required' using errcode = 'P0001';
    end if;

    -- ONCE. Ten keys in, ten keys frozen onto the row. app.financed_quote is never called for this contract
    -- again: it reads financing_markups and tree_pricing_rules, which the owner edits.
    v_quote := app.financed_quote(v_total, v_down, v_months, v_r.project_id);
    if not coalesce((v_quote->>'ok')::boolean, false) then
      -- duration_not_priced · down_covers_total · too_many_months · invalid_input, each with its own sentence.
      raise exception '%', coalesce(v_quote->>'reason', 'invalid_input') using errcode = 'P0001';
    end if;
    v_pct := case when v_total > 0 then round(v_down::numeric * 100 / v_total, 3) end;
  end if;

  -- The owner's open question, resolved once and frozen: if he says the عربون counts, what was actually paid
  -- on this reservation is credited against the down payment, capped by it. If he says it does not (today's
  -- answer), the credit is zero and both figures stay visible side by side, never summed.
  if app.setting_bool('contracts.deposit_counts_toward_down_payment', false) then
    select coalesce(sum(p.amount_millimes), 0)::bigint into v_deposit
    from public.payments p
    where p.reservation_id = v_r.id and p.kind = 'deposit' and p.voided_at is null;
    v_credit := least(coalesce(v_deposit, 0), v_down);
  end if;

  v_ref := app.setting_text('contract_no.prefix', 'AGZ-CTR') || '-' || v_year || '-'
           || lpad(app.next_number('contract:' || v_year)::text, 6, '0');

  insert into public.contracts (
    reference_no, reservation_id, person_id, project_id, request_id,
    kind_option_id, kind_label_ar, status, trees_count,
    method_option_id, method_label_ar,
    payment_mode, price_per_tree_millimes, total_price_millimes,
    down_payment_millimes, down_payment_percent, deposit_credited_millimes,
    markup_bp, duration_months, total_financed_millimes, remaining_millimes,
    monthly_millimes, last_installment_millimes, installments_count, plan_shortened,
    note, created_by, updated_by
  ) values (
    v_ref, v_r.id, v_r.person_id, v_r.project_id, v_r.request_id,
    v_kind.id, v_kind.label_ar, 'draft', v_trees,
    v_method.id, v_method.label_ar,
    v_mode, v_per_tree, v_total,
    v_down, v_pct, v_credit,
    (v_quote->>'markup_bp')::integer,
    case when v_mode = 'installments' then v_months end,
    (v_quote->>'total_financed_millimes')::bigint,
    (v_quote->>'remaining_millimes')::bigint,
    (v_quote->>'monthly_millimes')::bigint,
    (v_quote->>'last_installment_millimes')::bigint,
    (v_quote->>'installments_count')::integer,
    (v_quote->>'shortened')::boolean,
    nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), auth.uid()
  ) returning id into v_id;

  -- (b) The doorway. reservations_closed_check is a biconditional, so status and closed_at move together or
  -- the transaction fails at commit with an error nobody has an Arabic sentence for. trees_released stays
  -- FALSE: conversion does not release trees, it sells them.
  update public.reservations r
     set status = 'converted',
         closed_at = now(),
         closed_by = auth.uid(),
         close_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_by = auth.uid()
   where r.id = v_r.id;

  -- (c) The inventory. Same transaction: a contract whose trees were never sold cannot exist, and neither can
  -- trees sold for a contract that was not written.
  v_sold := app.sell_reservation_trees(v_r.id);

  perform app.write_audit('contracts.create', 'contracts', v_id::text, null,
                          jsonb_build_object('reference_no', v_ref, 'reservation_id', v_r.id,
                                             'person_id', v_r.person_id, 'project_id', v_r.project_id,
                                             'payment_mode', v_mode, 'trees', v_trees,
                                             'price_per_tree_millimes', v_per_tree,
                                             'total_price_millimes', v_total,
                                             'down_payment_millimes', v_down,
                                             'deposit_credited_millimes', v_credit,
                                             'quote', v_quote, 'trees_sold', v_sold),
                          null);

  -- §32 «العقد جاهز». Enqueued only; there is no sending worker, so no screen may claim it was delivered.
  perform app.enqueue_message('contract.ready',
            (select ps.phone_e164 from public.persons ps where ps.id = v_r.person_id),
            jsonb_build_object('name', (select ps.full_name from public.persons ps where ps.id = v_r.person_id),
                               'contract_no', v_ref),
            'contracts', v_id);

  return app.contract_payload(v_id);
end $function$;


CREATE OR REPLACE FUNCTION public.staff_sign_contract(p_contract uuid, p_signed_on date, p_legal_ref text, p_first_due_on date, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c     public.contracts;
  v_day   date;
  v_first date;
  v_n     integer := 0;
begin
  perform app.assert_contracts_open();

  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_c.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_c.status <> 'draft' then
    raise exception 'contract_not_draft' using errcode = 'P0001';
  end if;

  v_day := coalesce(p_signed_on, (now() at time zone 'Africa/Tunis')::date);

  if v_c.payment_mode = 'installments' then
    v_first := app.contract_first_due(v_day, p_first_due_on);
    if v_first is null then
      -- «ask», not «guess»: installments.first_due_rule is 'manual' until the owner chooses a rule, and every
      -- stage of §31 counts from this date.
      raise exception 'first_due_date_required' using errcode = 'P0001';
    end if;
    if v_first < v_day then
      raise exception 'first_due_before_signature' using errcode = 'P0001';
    end if;
  end if;

  update public.contracts c
     set status = 'signed',
         signed_on = v_day,
         signed_by = auth.uid(),
         legal_document_ref = nullif(btrim(coalesce(p_legal_ref, '')), ''),
         first_due_on = v_first,
         updated_by = auth.uid()
   where c.id = v_c.id;

  -- §29 «بعد العقد، يتولد Schedule كامل» — in the same transaction, when the instalments module is open. When
  -- it is not, the contract is signed anyway and the payload says schedule_pending, so the owner can switch
  -- `installments` on later and staff_generate_schedule fills it without touching the signature.
  if v_c.payment_mode = 'installments' and app.module_open('installments') then
    v_n := app.generate_contract_schedule(v_c.id);
  end if;

  -- 0180: a down payment already settled (the عربون credited, or paid at the desk before the signature) makes
  -- the client the owner the moment the signature and the schedule exist.
  perform app.contract_auto_own(v_c.id);

  perform app.write_audit('contracts.sign', 'contracts', v_c.id::text,
                          jsonb_build_object('status', v_c.status::text),
                          jsonb_build_object('status', 'signed', 'signed_on', v_day,
                                             'legal_document_ref', nullif(btrim(coalesce(p_legal_ref, '')), ''),
                                             'first_due_on', v_first, 'installments_written', v_n),
                          null);

  perform app.enqueue_message('contract.signed',
            (select ps.phone_e164 from public.persons ps where ps.id = v_c.person_id),
            jsonb_build_object('name', (select ps.full_name from public.persons ps where ps.id = v_c.person_id),
                               'contract_no', v_c.reference_no,
                               'signed_on', to_char(v_day, 'YYYY-MM-DD'),
                               'trees', v_c.trees_count::text),
            'contracts', v_c.id);

  return app.contract_payload(v_c.id);
end $function$;


CREATE OR REPLACE FUNCTION app.contract_settle_state(p_contract uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c     public.contracts;
  v_money jsonb := app.contract_money(p_contract);
begin
  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found or v_c.status in ('draft', 'cancelled') then
    return;
  end if;
  if coalesce((v_money->>'is_settled')::boolean, false) and v_c.status = 'signed' then
    update public.contracts c set status = 'completed', settled_at = coalesce(c.settled_at, now()),
                                  updated_by = auth.uid()
    where c.id = p_contract;
  elsif not coalesce((v_money->>'is_settled')::boolean, false) and v_c.status = 'completed' then
    -- Voiding a receipt takes «تخلّص كامل» back with it, the way voiding a عربون takes «Deposit Paid» back.
    -- Ownership is NOT touched: v2 §38 makes it a legal act, and a payment problem is not a legal decision.
    update public.contracts c set status = 'signed', settled_at = null, updated_by = auth.uid()
    where c.id = p_contract;
  end if;
  -- 0180: every receipt passes here; the one that completes the down payment makes the client the owner.
  perform app.contract_auto_own(p_contract);
end $function$;


CREATE OR REPLACE FUNCTION public.staff_generate_schedule(p_contract uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c public.contracts;
  v_n integer;
begin
  perform app.assert_installments_open();

  select * into v_c from public.contracts c where c.id = p_contract for no key update;
  if not found then
    raise exception 'contract_not_found' using errcode = 'P0001';
  end if;
  if not (app.can_contract_trees() and app.can_see_person(v_c.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_c.status not in ('signed', 'completed') then
    raise exception 'contract_not_signed' using errcode = 'P0001';
  end if;
  if v_c.payment_mode <> 'installments' then
    raise exception 'contract_is_cash' using errcode = 'P0001';
  end if;

  v_n := app.generate_contract_schedule(v_c.id);

  perform app.write_audit('installments.generate', 'contracts', v_c.id::text, null,
                          jsonb_build_object('installments_written', v_n,
                                             'first_due_on', v_c.first_due_on,
                                             'installments_count', v_c.installments_count), null);

  -- 0180: the schedule was the last thing missing when the down payment is already paid.
  perform app.contract_auto_own(v_c.id);
  return app.contract_payload(v_c.id);
end $function$;
CREATE OR REPLACE FUNCTION public.staff_set_legal_check(p_check uuid, p_done boolean, p_note text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k public.legal_file_checks;
  v_f public.legal_files;
begin
  select * into v_k from public.legal_file_checks k where k.id = p_check for update;
  if not found then
    raise exception 'legal_check_not_found' using errcode = 'P0001';
  end if;
  select * into v_f from public.legal_files f where f.id = v_k.legal_file_id;
  if not (app.can_contract_trees() and app.can_see_person(v_f.person_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if v_k.waived_at is not null then
    raise exception 'legal_check_waived' using errcode = 'P0001';
  end if;
  -- Un-ticking an item whose gate has already been passed would claim a contract was signed without a paper
  -- that was, at the time, verified. The history is what it is; add a note instead.
  if not p_done and app.legal_gate_passed(v_f.reservation_id, v_k.required_at) then
    raise exception 'legal_check_locked' using errcode = 'P0001';
  end if;

  update public.legal_file_checks k
     set done_at = case when p_done then coalesce(k.done_at, now()) end,
         done_by = case when p_done then coalesce(k.done_by, auth.uid()) end,
         note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_by = auth.uid()
   where k.id = p_check;

  -- 0180: the last paper «قبل تسجيل التملّك» may be the only thing a paid-up client was still waiting for.
  if v_k.required_at = 'ownership' then
    perform app.contract_auto_own(c.id) from public.contracts c
     where c.reservation_id = v_f.reservation_id and c.status in ('signed', 'completed');
  end if;

  return app.legal_checklist_state(v_k.legal_file_id);
end $function$;


CREATE OR REPLACE FUNCTION public.staff_waive_legal_check(p_check uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k public.legal_file_checks;
  v_f public.legal_files;
begin
  select * into v_k from public.legal_file_checks k where k.id = p_check for update;
  if not found then
    raise exception 'legal_check_not_found' using errcode = 'P0001';
  end if;
  select * into v_f from public.legal_files f where f.id = v_k.legal_file_id;
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.setting_bool('legal.allow_waiver', true) then
    raise exception 'legal_waiver_closed' using errcode = 'P0001';
  end if;
  -- A waiver is the one act in this file whose whole value is the sentence written on it, so it demands one
  -- of its own even when audit.reason_min_length is zero.
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'legal_waive_reason_required' using errcode = 'P0001';
  end if;
  perform app.set_reason(p_reason);

  if v_k.done_at is not null then
    raise exception 'legal_check_done' using errcode = 'P0001';
  end if;
  if app.legal_gate_passed(v_f.reservation_id, v_k.required_at) then
    raise exception 'legal_check_locked' using errcode = 'P0001';
  end if;

  update public.legal_file_checks k
     set waived_at = now(), waived_by = auth.uid(),
         waive_reason = btrim(p_reason), updated_by = auth.uid()
   where k.id = p_check;

  -- 0180: the last paper «قبل تسجيل التملّك» may be the only thing a paid-up client was still waiting for.
  if v_k.required_at = 'ownership' then
    perform app.contract_auto_own(c.id) from public.contracts c
     where c.reservation_id = v_f.reservation_id and c.status in ('signed', 'completed');
  end if;

  return app.legal_checklist_state(v_k.legal_file_id);
end $function$;
