-- 0151 · «قديش خذا، قديش خلّص، وقديش باقي» — the money on a sale that is waiting to be confirmed.
--
-- Its test is supabase/tests/098_reservation_money.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0151_reservation_money.sql supabase/tests/098_reservation_money.sql
--
-- THE OWNER, 2026-10-23, describing the التأكيد screen: «يخرج لنا مثلاً مريم المساوي خذت زيتونة بأربعة آلاف
-- وخمسمائة … ودفعت عربون خمسين دينار … يخرج لنا فيها تفاصيل الحساب متاع اللي خذيت، وقديش دفعت، وقديش
-- عربنت، وسعر القطعة، والمتبقي».
--
-- WHAT THE SCREEN COULD SAY BEFORE THIS, and it is less than it sounds: the عربون. public.reservations
-- carries deposit_due_millimes and nothing else about money — no price per tree, no total. The price of
-- what the client took first appears on public.contracts, which does not exist yet at this point, because
-- the whole purpose of this screen is to make it. So a row read «عربون 50 د باقي» beside a sale whose
-- value nobody on the screen knew.
--
-- WHERE THE PRICE COMES FROM, in order, and WHY IT IS SAID OUT LOUD WHICH. There are two sources and they
-- are not equally good:
--
--   · THE REQUEST — when the sale came from one and it is for the same number of trees, its snapshot is the
--     price the client was SHOWN and agreed to, frozen the day he sent it. That is the right figure, and
--     the only one that stays right when the offer is repriced tomorrow.
--
--   · THE OFFER, quoted live, for a walk-in sale registered on صفحة البيع — which passes no request and no
--     price, so nothing was ever frozen. This is today's price for that many trees, and if the owner has
--     moved the offer since, it is NOT what was agreed.
--
-- `price_source` says which of the two it is, so the screen can mark the second as an estimate rather than
-- print both with the same confidence. A figure whose provenance the reader cannot see is worse here than
-- no figure: this is the screen where a contract is signed.
--
-- THE REQUEST'S TOTAL IS ONLY USED WHEN THE COUNTS MATCH. A client who asked for ten and was sold five has
-- a snapshot total for ten; quantity tiers (0132) mean five is not half of it. When they differ the offer
-- is quoted for what is actually held, and price_source says «offer», which is the truth.
--
-- PAID IS EVERY PAYMENT, NOT ONLY THE عربون. deposit_paid_millimes above counts `kind = 'deposit'`, which is
-- right for «is the deposit settled». «قديش دفعت» is a different question and takes every payment on the
-- reservation that has not been voided — if a client pays something else before the contract, it is money
-- he has handed over and the remainder must account for it.

create or replace function app.reservation_money(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_r     public.reservations;
  v_held  integer;
  v_req   public.interest_requests;
  v_unit  bigint;
  v_total bigint;
  v_src   text;
  v_paid  bigint;
  v_quote jsonb;
begin
  select * into v_r from public.reservations r where r.id = p_reservation;
  if not found then
    return null;
  end if;

  -- The live inventory, like the payload above: a stored count can be behind what the trees say.
  select count(*)::integer into v_held
  from public.trees t
  where t.reservation_id = v_r.id and t.state in ('reserved', 'sold');
  if coalesce(v_held, 0) = 0 then
    v_held := coalesce(v_r.trees_count, 0);
  end if;

  -- 1 · the price the client was shown, when there is one and it is for this many trees.
  if v_r.request_id is not null then
    select * into v_req from public.interest_requests ir where ir.id = v_r.request_id;
    if found and coalesce(v_req.offer_trees, 0) = v_held then
      v_unit  := coalesce(v_req.offer_price_per_tree_millimes, v_req.price_per_tree_millimes);
      v_total := coalesce(v_req.offer_total_price_millimes, v_req.total_price_millimes);
      if v_unit is not null or v_total is not null then
        v_src := 'request';
      end if;
    end if;
  end if;

  -- 2 · otherwise the offer's own price today, for the trees actually held. p_staff is true: this runs
  --     behind app.reservation_payload, which is already staff-gated, and a sale being confirmed must show
  --     its value even while public pricing is closed.
  if v_src is null and v_held > 0 then
    v_quote := app.project_quote_payload(v_r.project_id, null, v_held, null, null, null, true);
    if (v_quote->>'pricing') = 'ok' then
      v_unit  := (v_quote->>'price_per_tree_millimes')::bigint;
      v_total := (v_quote->>'total_price_millimes')::bigint;
      if v_unit is not null or v_total is not null then
        v_src := 'offer';
      end if;
    end if;
  end if;

  -- One of the two figures implies the other; neither is invented when both are missing.
  if v_total is null and v_unit is not null and v_held > 0 then
    v_total := v_unit * v_held;
  end if;
  if v_unit is null and v_total is not null and v_held > 0 then
    v_unit := v_total / v_held;
  end if;

  select coalesce(sum(p.amount_millimes), 0)::bigint into v_paid
  from public.payments p
  where p.reservation_id = v_r.id and p.voided_at is null;

  return jsonb_build_object(
    'trees', v_held,
    'price_source', v_src,
    'price_per_tree_millimes', v_unit,
    'total_millimes', v_total,
    'paid_millimes', v_paid,
    -- Never negative: a client who has paid more than the price owes nothing, and «-50 د باقي» on a
    -- confirmation screen reads as a bug rather than as credit.
    'left_millimes', case when v_total is null then null else greatest(v_total - v_paid, 0) end
  );
end $fn$;

-- Called only from app.reservation_payload, which is itself reached through the staff doors. Nothing in the
-- browser may ask this directly: it prices a sale, and pricing is a permission (PRJ-03).
revoke execute on function app.reservation_money(uuid) from public, anon, authenticated;

comment on function app.reservation_money(uuid) is
  'The money on one reservation: what the trees it holds are worth, everything paid against it, and what is left. price_source says whether the price is the snapshot the client agreed to (request) or the offer''s price today (offer) — a walk-in sale freezes nothing, and the screen must not print the two with the same confidence. Paid counts EVERY payment that is not voided, not only the deposit.';

CREATE OR REPLACE FUNCTION app.reservation_payload(p_reservation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r        public.reservations;
  v_pj       public.projects;
  v_person   public.persons;
  v_labels   jsonb := coalesce(app.setting('reservations.status_labels'), '{}'::jsonb);
  v_kinds    jsonb := coalesce(app.setting('payments.kind_labels'), '{}'::jsonb);
  v_held     integer;
  v_sold     integer;
  v_first    text;
  v_last     text;
  v_paid     bigint;
  v_payments jsonb;
  v_req_no   text;
  -- settings reservations.expiry_soon_days: what «قربت تنتهي» means today. Read here so the list screen and
  -- one client file agree about the same reservation without either of them deciding it.
  v_soon     integer := greatest(app.setting_int('reservations.expiry_soon_days', 0), 0);
begin
  select * into v_r from public.reservations r where r.id = p_reservation;
  if not found then
    return null;
  end if;
  select * into v_pj from public.projects pj where pj.id = v_r.project_id;
  select * into v_person from public.persons ps where ps.id = v_r.person_id;

  -- The live inventory, never a stored count (§46).
  select (count(*) filter (where t.state = 'reserved'))::integer,
         (count(*) filter (where t.state = 'sold'))::integer
  into v_held, v_sold
  from public.trees t
  where t.reservation_id = v_r.id;

  select t.code into v_first from public.trees t where t.reservation_id = v_r.id order by t.seq limit 1;
  select t.code into v_last  from public.trees t where t.reservation_id = v_r.id order by t.seq desc limit 1;

  select coalesce(sum(p.amount_millimes), 0)::bigint into v_paid
  from public.payments p
  where p.reservation_id = v_r.id and p.kind = 'deposit' and p.voided_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'reference_no', p.reference_no,
           'kind', p.kind::text,
           'kind_label', coalesce(v_kinds->>p.kind::text, p.kind::text),
           'amount_millimes', p.amount_millimes,
           'method_label', p.method_label_ar,
           'reference', p.reference,
           'received_at', p.received_at,
           'note', p.note,
           'voided', p.voided_at is not null,
           'void_reason', p.void_reason,
           'recorded_by', (select pr.full_name from public.profiles pr where pr.id = p.recorded_by))
         -- Newest first, and deterministic inside one transaction: created_at is identical for two rows
         -- written by the same call chain, so the sequence in the reference number breaks the tie.
         order by p.received_at desc, p.reference_no desc), '[]'::jsonb)
  into v_payments
  from public.payments p
  where p.reservation_id = v_r.id;

  select r.request_no into v_req_no from public.interest_requests r where r.id = v_r.request_id;

  return jsonb_build_object(
    'id', v_r.id,
    'reference_no', v_r.reference_no,
    'status', v_r.status::text,
    'status_label', coalesce(v_labels->>v_r.status::text, v_r.status::text),
    'person_id', v_r.person_id,
    'person_name', v_person.full_name,
    'person_phone', v_person.phone_e164,
    'project_id', v_r.project_id,
    'offer_name', v_pj.name,
    'offer_code', v_pj.code,
    'request_id', v_r.request_id,
    'request_no', v_req_no,

    'trees_count', v_r.trees_count,
    'trees_held', coalesce(v_held, 0),
    'trees_sold', coalesce(v_sold, 0),
    'first_code', v_first,
    'last_code', v_last,

    'deposit_due_millimes', v_r.deposit_due_millimes,
    'deposit_paid_millimes', v_paid,
    'deposit_left_millimes', greatest(v_r.deposit_due_millimes - v_paid, 0),
    'deposit_paid_at', v_r.deposit_paid_at,
    'payments', v_payments,
    -- 0151 · what the sale is worth, what has come in, and what is left. One key, computed next door,
    -- so every screen that already reads a reservation gets the money picture without a second query.
    'money', app.reservation_money(v_r.id),

    'valid_days', v_r.valid_days,
    'reserved_at', v_r.reserved_at,
    'expires_at', v_r.expires_at,
    -- §24, computed here and nowhere else. A closed reservation is never «overdue»: it is finished.
    'is_open', v_r.status in ('awaiting_deposit', 'deposit_paid'),
    'is_overdue', v_r.expires_at is not null and v_r.expires_at < now()
                  and v_r.status in ('awaiting_deposit', 'deposit_paid'),
    'days_left', case when v_r.expires_at is null or v_r.status not in ('awaiting_deposit', 'deposit_paid')
                      then null
                      else floor(extract(epoch from (v_r.expires_at - now())) / 86400)::integer end,
    'is_soon', v_r.expires_at is not null and v_r.expires_at >= now()
               and v_r.status in ('awaiting_deposit', 'deposit_paid')
               and floor(extract(epoch from (v_r.expires_at - now())) / 86400)::integer <= v_soon,
    'conditions_ar', v_r.conditions_ar,
    'note', v_r.note,

    'extended_count', v_r.extended_count,
    'extended_at', v_r.extended_at,
    'closed_at', v_r.closed_at,
    'close_reason', v_r.close_reason,
    'trees_released', v_r.trees_released,
    'created_by', (select pr.full_name from public.profiles pr where pr.id = v_r.created_by));
end $function$;
