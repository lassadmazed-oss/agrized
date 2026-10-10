-- 0136 · Parrainage: a code and a link for every client, six generations above a buyer, and a commission that
-- exists only because a real sale was made — and is owed only once that sale is paid in full.
--
-- Test: supabase/tests/083_referrals.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0136_referrals.sql supabase/tests/083_referrals.sql
--
-- THE OWNER'S SPEC (2026-10-10, «Système de Parrainage & Commissions»), and where each rule lives:
--
--   §4A  the relation is fixed at registration and the user cannot change it
--        → persons.referred_by, written only by app.attach_referral (at the request that CREATED the person) and
--          by public.staff_set_referrer (admin, with a reason). app.persons_referral_guard refuses every other
--          writer, a self-referral and a cycle.
--   §4B  commissions are recorded Pending at the purchase
--        → public.contracts is the purchase (0072). An AFTER INSERT trigger computes them from the rule in force.
--   §4C  validated only after the sale is fully paid; cancelled with the sale; nothing for a sign-up alone
--        → the same trigger follows contracts.settled_at (app.contract_settle_state's «fully paid», 0072) and
--          contracts.status = 'cancelled'. A commission already paid when its sale is cancelled is not erased:
--          it becomes 'reversed', the amount AgriZed has to recover.
--   §6   levels, amounts, per tree or per order, per offer, a cap and the minimum margin are Back Office values
--        → public.commission_rules (a new row per change, never edited) and projects.referral_enabled.
--   §8.1 the total never exceeds the cap → a CHECK on every rule row, and the per-sale budget below.
--   §8.4 AgriZed keeps its minimum margin after commissions → the budget per unit is
--          least(cap, price − cost − cost × min_margin) and the deeper generations lose first.
--   §8.5 rules are snapshotted at the sale → every commission row carries its rule_id, amounts and the price and
--          cost it was computed from; a new rule never touches an older sale.
--   §7   one commission per sale and generation → unique (contract_id, generation); history kept → rows are
--          never deleted, and every table here is audited (app.audit_row_change).
--   §8.6 legal review before opening → the module starts 'disabled'. While disabled nothing is captured and
--          nothing is created; commissions that already exist keep following their sale either way.

-- ---------------------------------------------------------------------------
-- 1 · The module and its settings
-- ---------------------------------------------------------------------------

insert into public.feature_flags (key, state, phase, label_ar, description_ar, sort_order) values
  ('referrals', 'disabled', 2, 'التوصية (Parrainage)',
   'كود ورابط لكل حريف، وكوميسيون على 6 أجيال كي يتخلّص بيع حقيقي بالكامل. يلزم مراجعة قانونية في تونس قبل ما يتفتح للعموم.',
   130)
on conflict (key) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('referral.cookie_days', to_jsonb(90), 'integer', 'referral', 'مدّة حفظ رابط التوصية (بالأيام)',
   'كي يحلّ الزائر رابط /ref/CODE، الكود يتحفظ في المتصفّح هذا العدد من الأيام، ويتسجّل كي يعمّر طلبه.', true, 10),
  ('referral.alert_burst_count', to_jsonb(5), 'integer', 'referral', 'تنبيه: عدد التسجيلات في نهار واحد',
   'كي حريف يجيب هذا العدد أو أكثر من التسجيلات في نهار واحد، يظهر تنبيه في صفحة التوصية.', false, 20)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Who brought whom
-- ---------------------------------------------------------------------------

alter table public.persons
  add column if not exists referral_code text,
  add column if not exists referred_by   uuid references public.persons (id),
  add column if not exists referred_at   timestamptz,
  add column if not exists referral_meta jsonb;

-- Six characters with no 0/O, 1/I/L: read aloud on the phone and typed from a screenshot without a doubt.
alter table public.persons drop constraint if exists persons_referral_code_check;
alter table public.persons add constraint persons_referral_code_check
  check (referral_code is null or referral_code ~ '^[2-9A-HJKMNP-Z]{6,12}$');
alter table public.persons drop constraint if exists persons_not_own_referrer;
alter table public.persons add constraint persons_not_own_referrer
  check (referred_by is null or referred_by <> id);

create unique index if not exists persons_referral_code_key on public.persons (referral_code) where referral_code is not null;
create index if not exists persons_referred_by_idx on public.persons (referred_by) where referred_by is not null;

comment on column public.persons.referral_code is
  'The client''s own referral code (0136), made the first time it is needed (app.ensure_referral_code). Their link is /ref/<code>.';
comment on column public.persons.referred_by is
  'The parrain (0136): set once, by the request that created this person through a referral link, or by an admin with a reason. Never by the client.';
comment on column public.persons.referral_meta is
  'How the referral was captured: the code, the request it came with, the hashed IP of that request.';

/** Every generation above a person, nearest first, at most p_depth of them. Cycles cannot exist (the guard
    refuses them) but the path check keeps this function finite even if one ever did. */
create or replace function app.referral_upline(p_person uuid, p_depth integer)
returns table (generation integer, person_id uuid)
language sql stable security definer set search_path = '' as $$
  with recursive up (generation, person_id, path) as (
    select 1, p.referred_by, array[p.id, p.referred_by]
    from public.persons p
    where p.id = p_person and p.referred_by is not null and p_depth >= 1
    union all
    select u.generation + 1, p.referred_by, u.path || p.referred_by
    from up u
    join public.persons p on p.id = u.person_id
    where p.referred_by is not null and u.generation < p_depth and not (p.referred_by = any (u.path))
  )
  select up.generation, up.person_id from up
$$;
revoke execute on function app.referral_upline(uuid, integer) from public, anon, authenticated;

/** The only writers of referred_by, referral_code and referral_meta are the functions of this file, which say
    so with app.referral_write. A staff member's direct update of a person (allowed by RLS for their other
    fields) cannot move a referral. */
create or replace function app.persons_referral_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.referred_by is null and new.referral_code is null and new.referral_meta is null then
      return new;
    end if;
  elsif new.referred_by is not distinct from old.referred_by
        and new.referral_code is not distinct from old.referral_code
        and new.referral_meta is not distinct from old.referral_meta then
    return new;
  end if;

  if coalesce(current_setting('app.referral_write', true), '') <> 'on' then
    raise exception 'referrer_locked' using errcode = 'P0001';
  end if;

  if new.referred_by is not null and (tg_op = 'INSERT' or new.referred_by is distinct from old.referred_by) then
    if new.referred_by = new.id then
      raise exception 'referral_self' using errcode = 'P0001';
    end if;
    if exists (select 1 from app.referral_upline(new.referred_by, 1000) u where u.person_id = new.id) then
      raise exception 'referral_cycle' using errcode = 'P0001';
    end if;
    new.referred_at := now();
  elsif new.referred_by is null then
    new.referred_at := null;
  end if;
  return new;
end $$;

drop trigger if exists persons_referral_guard on public.persons;
create trigger persons_referral_guard before insert or update of referred_by, referral_code, referral_meta on public.persons
  for each row execute function app.persons_referral_guard();

create or replace function app.new_referral_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text := '';
begin
  for i in 1 .. 6 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
  end loop;
  return v_code;
end $$;
revoke execute on function app.new_referral_code() from public, anon, authenticated;

/** The person's code, made on first need. Null for a person that does not exist. */
create or replace function app.ensure_referral_code(p_person uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
  v_try  integer := 0;
begin
  select p.referral_code into v_code from public.persons p where p.id = p_person;
  if not found then
    return null;
  end if;
  if v_code is not null then
    return v_code;
  end if;

  perform set_config('app.referral_write', 'on', true);
  loop
    v_try := v_try + 1;
    begin
      update public.persons set referral_code = app.new_referral_code()
      where id = p_person and referral_code is null
      returning referral_code into v_code;
      exit;
    exception when unique_violation then
      if v_try >= 8 then
        perform set_config('app.referral_write', 'off', true);
        raise;
      end if;
    end;
  end loop;
  perform set_config('app.referral_write', 'off', true);

  if v_code is null then
    select p.referral_code into v_code from public.persons p where p.id = p_person;
  end if;
  return v_code;
end $$;
revoke execute on function app.ensure_referral_code(uuid) from public, anon, authenticated;

/**
 * §4A. A referral is attached to a person ONLY in the transaction that created them — a person who already
 * existed registered before the link and keeps their history (`created_at = now()` is true exactly for a row
 * inserted by this transaction). Returns what happened, for the audit and the test; never raises on a bad code.
 */
create or replace function app.attach_referral(p_person uuid, p_code text, p_meta jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_person   public.persons;
  v_referrer uuid;
begin
  if app.flag_state('referrals') = 'disabled' then
    return 'closed';
  end if;
  if v_code !~ '^[2-9A-HJKMNP-Z]{6,12}$' then
    return 'invalid_code';
  end if;

  select * into v_person from public.persons p where p.id = p_person for update;
  if not found then
    return 'no_person';
  end if;
  if v_person.referred_by is not null then
    return 'already_referred';
  end if;
  if v_person.created_at <> now() then
    return 'existing_person';
  end if;

  select p.id into v_referrer from public.persons p where p.referral_code = v_code and p.archived_at is null;
  if v_referrer is null then
    return 'unknown_code';
  end if;
  if v_referrer = p_person then
    return 'self';
  end if;

  perform set_config('app.referral_write', 'on', true);
  update public.persons
     set referred_by = v_referrer,
         referral_meta = coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('code', v_code, 'channel', 'link')
   where id = p_person;
  perform set_config('app.referral_write', 'off', true);
  return 'attached';
end $$;
revoke execute on function app.attach_referral(uuid, text, jsonb) from public, anon, authenticated;

-- The intake forms keep `referral` (the code read from the visitor's cookie by the server) and `referral_ip`
-- (the request's hashed IP, for the duplicate-account alerts). Every other key is unchanged from 0003.
create or replace function app.clean_source(p_source jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'utm_source',   left(p_source->>'utm_source', 100),
    'utm_medium',   left(p_source->>'utm_medium', 100),
    'utm_campaign', left(p_source->>'utm_campaign', 150),
    'utm_content',  left(p_source->>'utm_content', 150),
    'ref',          left(p_source->>'ref', 100),
    'referrer',     left(p_source->>'referrer', 300),
    'landing_path', left(p_source->>'landing_path', 300),
    'referral',     left(upper(p_source->>'referral'), 12),
    'referral_ip',  left(p_source->>'referral_ip', 128)
  ))
$$;

/** A demand or a video visit arrived with a referral code. Never lets the intake fail: a refusal is audited. */
create or replace function app.referral_capture() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_outcome text;
begin
  if new.source is null or not (new.source ? 'referral') then
    return new;
  end if;
  begin
    v_outcome := app.attach_referral(
      new.person_id, new.source->>'referral',
      jsonb_strip_nulls(jsonb_build_object('entity', tg_table_name, 'entity_id', new.id, 'ip', new.source->>'referral_ip')));
    if v_outcome not in ('attached', 'closed', 'already_referred', 'existing_person') then
      perform app.write_audit('referral.refused', tg_table_name, new.id::text, null,
                              jsonb_build_object('outcome', v_outcome, 'code', new.source->>'referral'), null);
    end if;
  exception when others then
    perform app.write_audit('referral.capture_error', tg_table_name, new.id::text, null,
                            jsonb_build_object('error', sqlerrm, 'state', sqlstate), null);
  end;
  return new;
end $$;

drop trigger if exists interest_requests_referral on public.interest_requests;
create trigger interest_requests_referral after insert on public.interest_requests
  for each row execute function app.referral_capture();
drop trigger if exists video_visit_requests_referral on public.video_visit_requests;
create trigger video_visit_requests_referral after insert on public.video_visit_requests
  for each row execute function app.referral_capture();

-- ---------------------------------------------------------------------------
-- 3 · The rule: how much per generation, per tree or per order, the cap and the margin AgriZed keeps
-- ---------------------------------------------------------------------------

create or replace function app.referral_amounts_ok(p bigint[]) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and cardinality(p) between 1 and 10 and array_position(p, null) is null
     and coalesce((select min(x) from unnest(p) x), -1) >= 0
$$;

create or replace function app.referral_amounts_sum(p bigint[]) returns bigint
language sql immutable set search_path = '' as $$
  select coalesce(sum(x), 0)::bigint from unnest(p) x
$$;

create table if not exists public.commission_rules (
  id               uuid primary key default gen_random_uuid(),
  version          integer generated always as identity,
  -- One amount per generation, nearest first: its length IS the number of generations.
  amounts_millimes bigint[] not null check (app.referral_amounts_ok(amounts_millimes)),
  basis            text not null check (basis in ('tree', 'order')),
  cap_millimes     bigint not null check (cap_millimes > 0),
  -- What AgriZed keeps at least, after commissions, as a share of the full cost (the owner's «marge sur le coût
  -- complet»). 1500 = 15 %.
  min_margin_bp    integer not null check (min_margin_bp between 0 and 10000),
  note             text check (note is null or char_length(note) <= 1000),
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  constraint commission_rules_cap_check check (app.referral_amounts_sum(amounts_millimes) <= cap_millimes)
);

comment on table public.commission_rules is
  'The referral rule (0136). Append-only: a change in the Back Office is a new row, the newest row is the rule in force, and each commission names the row it was computed from (§8.5).';

create or replace function app.commission_rules_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'commission_rule_frozen' using errcode = 'P0001';
end $$;

drop trigger if exists commission_rules_frozen on public.commission_rules;
create trigger commission_rules_frozen before update or delete on public.commission_rules
  for each row execute function app.commission_rules_frozen();
drop trigger if exists commission_rules_audit on public.commission_rules;
create trigger commission_rules_audit after insert on public.commission_rules
  for each row execute function app.audit_row_change();

-- The owner's proposal (§2): 100 · 40 · 25 · 15 · 10 · 10 = 200 TND per tree, cap 200 TND.
insert into public.commission_rules (amounts_millimes, basis, cap_millimes, min_margin_bp, note)
select array[100000, 40000, 25000, 15000, 10000, 10000]::bigint[], 'tree', 200000, 1500,
       'التوزيع المقترح في كراس الشروط (0136)'
where not exists (select 1 from public.commission_rules);

create or replace function app.current_commission_rule() returns public.commission_rules
language sql stable security definer set search_path = '' as $$
  select * from public.commission_rules r order by r.version desc limit 1
$$;
revoke execute on function app.current_commission_rule() from public, anon, authenticated;

-- §6 «يفعّل أو يوقّف الكوميسيون حسب العرض». On by default: the module switch is the one that opens the system.
alter table public.projects add column if not exists referral_enabled boolean not null default true;
comment on column public.projects.referral_enabled is
  'Whether a sale of this offer earns referral commissions (0136). The referrals module must be on as well.';

-- ---------------------------------------------------------------------------
-- 4 · Commissions and their payouts
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.commission_status as enum ('pending', 'validated', 'paid', 'cancelled', 'reversed');
exception when duplicate_object then null;
end $$;

comment on type public.commission_status is
  'pending: the sale exists, not fully paid · validated: fully paid, owed · paid: in a payout · cancelled: the sale was cancelled (or staff cancelled it) before payment · reversed: the sale was cancelled after the commission was paid — AgriZed recovers it.';

create table if not exists public.commission_payouts (
  id              uuid primary key default gen_random_uuid(),
  reference_no    text not null unique,
  person_id       uuid not null references public.persons (id),
  total_millimes  bigint not null check (total_millimes > 0),
  paid_on         date not null,
  method_label    text check (method_label is null or char_length(method_label) <= 120),
  reference       text check (reference is null or char_length(reference) <= 200),
  note            text check (note is null or char_length(note) <= 1000),
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index if not exists commission_payouts_person_idx on public.commission_payouts (person_id, paid_on desc);

create table if not exists public.commission_transactions (
  id                      uuid primary key default gen_random_uuid(),
  contract_id             uuid not null references public.contracts (id),
  project_id              uuid not null references public.projects (id),
  buyer_person_id         uuid not null references public.persons (id),
  beneficiary_person_id   uuid not null references public.persons (id),
  generation              smallint not null check (generation between 1 and 10),
  -- THE SNAPSHOT (§8.5): the rule and the figures it was applied to, never recomputed.
  rule_id                 uuid not null references public.commission_rules (id),
  basis                   text not null check (basis in ('tree', 'order')),
  units                   integer not null check (units >= 1),
  rule_unit_millimes      bigint not null check (rule_unit_millimes >= 0),
  unit_millimes           bigint not null check (unit_millimes >= 0 and unit_millimes <= rule_unit_millimes),
  amount_millimes         bigint not null check (amount_millimes > 0),
  price_per_tree_millimes bigint not null,
  cost_per_tree_millimes  bigint,
  status                  public.commission_status not null default 'pending',
  validated_at            timestamptz,
  paid_at                 timestamptz,
  payout_id               uuid references public.commission_payouts (id),
  cancelled_at            timestamptz,
  reversed_at             timestamptz,
  cancel_reason           text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.profiles (id),
  constraint commission_transactions_once unique (contract_id, generation),
  constraint commission_transactions_not_buyer check (beneficiary_person_id <> buyer_person_id),
  constraint commission_transactions_paid_check
    check ((status in ('paid', 'reversed')) = (payout_id is not null and paid_at is not null)),
  constraint commission_transactions_validated_check
    check ((status in ('validated', 'paid')) <= (validated_at is not null)),
  constraint commission_transactions_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint commission_transactions_reversed_check check ((status = 'reversed') = (reversed_at is not null))
);
create index if not exists commission_transactions_beneficiary_idx
  on public.commission_transactions (beneficiary_person_id, status);
create index if not exists commission_transactions_status_idx on public.commission_transactions (status, created_at desc);
create index if not exists commission_transactions_payout_idx
  on public.commission_transactions (payout_id) where payout_id is not null;

comment on table public.commission_transactions is
  'One referral commission: one sale (contract), one generation above its buyer (0136). Created by the contract trigger, moved by the sale''s payments and cancellation, paid through public.staff_pay_commissions. Never deleted.';

drop trigger if exists commission_transactions_stamp on public.commission_transactions;
create trigger commission_transactions_stamp before update on public.commission_transactions
  for each row execute function app.stamp_updated();
drop trigger if exists commission_transactions_audit on public.commission_transactions;
create trigger commission_transactions_audit after insert or update or delete on public.commission_transactions
  for each row execute function app.audit_row_change();
drop trigger if exists commission_payouts_audit on public.commission_payouts;
create trigger commission_payouts_audit after insert or update or delete on public.commission_payouts
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------
-- 5 · The engine, driven by the contract
-- ---------------------------------------------------------------------------

/** The full cost of one tree of this sale, resolved the way app.contract_price_per_tree resolves its price
    (0118): the demand's spacing class, else the offer's own basis. Null when the offer has no cost rules. */
create or replace function app.referral_cost_per_tree(p_project uuid, p_request uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class uuid;
  v_basis text;
  v_area  numeric;
  v_quote jsonb;
begin
  if p_request is not null then
    select r.spacing_class_id into v_class from public.interest_requests r where r.id = p_request;
  end if;
  if v_class is not null then
    v_quote := app.tree_price(v_class, p_project);
  else
    select b.spacing_class_id, b.area_m2, b.basis into v_class, v_area, v_basis
    from app.project_price_basis(p_project, null) b;
    if v_basis = 'class' then
      v_quote := app.tree_price(v_class, p_project);
    elsif v_basis = 'project_area' then
      v_quote := app.tree_price_for_area(v_area, p_project);
    else
      return null;
    end if;
  end if;
  if coalesce((v_quote->>'ok')::boolean, false) then
    return (v_quote->>'cost_per_tree_millimes')::bigint;
  end if;
  return null;
exception when others then
  return null;
end $$;
revoke execute on function app.referral_cost_per_tree(uuid, uuid) from public, anon, authenticated;

/** §4B. The commissions of one sale, from the rule in force. Returns how many rows it wrote. */
create or replace function app.referral_create_commissions(p_contract uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c            public.contracts;
  v_rule       public.commission_rules;
  v_enabled    boolean;
  v_upline     uuid[];
  v_units      integer;
  v_unit_price bigint;
  v_cost_tree  bigint;
  v_unit_cost  bigint;
  v_left       bigint;
  v_alloc      bigint;
  v_ben        uuid;
  v_n          integer := 0;
begin
  if app.flag_state('referrals') = 'disabled' then
    return 0;
  end if;
  select * into c from public.contracts k where k.id = p_contract;
  if not found or c.status = 'cancelled' then
    return 0;
  end if;
  select p.referral_enabled into v_enabled from public.projects p where p.id = c.project_id;
  if not coalesce(v_enabled, false) then
    return 0;
  end if;
  v_rule := app.current_commission_rule();
  if v_rule.id is null then
    return 0;
  end if;

  select coalesce(array_agg(u.person_id order by u.generation), '{}') into v_upline
  from app.referral_upline(c.person_id, cardinality(v_rule.amounts_millimes)) u;
  if cardinality(v_upline) = 0 then
    return 0;
  end if;

  v_units      := case v_rule.basis when 'tree' then c.trees_count else 1 end;
  v_unit_price := case v_rule.basis when 'tree' then c.price_per_tree_millimes else c.total_price_millimes end;
  v_cost_tree  := app.referral_cost_per_tree(c.project_id, c.request_id);
  v_unit_cost  := case when v_cost_tree is null then null
                       when v_rule.basis = 'tree' then v_cost_tree
                       else v_cost_tree * c.trees_count end;

  -- §8.1 and §8.4: what this sale can pay per unit, all generations together.
  v_left := v_rule.cap_millimes;
  if v_unit_cost is not null then
    v_left := least(v_left, greatest(0,
      v_unit_price - v_unit_cost - ceil(v_unit_cost::numeric * v_rule.min_margin_bp / 10000)::bigint));
  end if;

  -- Nearest generation first. A missing or archived ancestor is simply not paid: its share is not handed to
  -- anyone else (§3 «الباقي ما يتوزّعش»).
  for g in 1 .. cardinality(v_rule.amounts_millimes) loop
    v_alloc := least(v_rule.amounts_millimes[g], v_left);
    v_left  := v_left - v_alloc;
    v_ben   := case when g <= cardinality(v_upline) then v_upline[g] end;
    if v_ben is not null and v_alloc > 0
       and exists (select 1 from public.persons p where p.id = v_ben and p.archived_at is null) then
      insert into public.commission_transactions (
        contract_id, project_id, buyer_person_id, beneficiary_person_id, generation, rule_id, basis, units,
        rule_unit_millimes, unit_millimes, amount_millimes, price_per_tree_millimes, cost_per_tree_millimes,
        status, validated_at)
      values (
        c.id, c.project_id, c.person_id, v_ben, g, v_rule.id, v_rule.basis, v_units,
        v_rule.amounts_millimes[g], v_alloc, v_alloc * v_units, c.price_per_tree_millimes, v_cost_tree,
        case when c.settled_at is not null then 'validated'::public.commission_status else 'pending' end,
        case when c.settled_at is not null then now() end)
      on conflict (contract_id, generation) do nothing;
      if found then
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  if v_n > 0 then
    perform app.write_audit('referral.commissions_created', 'contracts', c.id::text, null,
      jsonb_build_object('rows', v_n, 'rule_id', v_rule.id, 'unit_cost_millimes', v_unit_cost,
                         'unit_price_millimes', v_unit_price), null);
  end if;
  return v_n;
end $$;
revoke execute on function app.referral_create_commissions(uuid) from public, anon, authenticated;

create or replace function app.referral_on_contract() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform app.referral_create_commissions(new.id);
    elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      update public.commission_transactions
         set status = 'cancelled', cancelled_at = now(),
             cancel_reason = left(coalesce(new.cancel_reason, 'العقد تلغى'), 1000)
       where contract_id = new.id and status in ('pending', 'validated');
      update public.commission_transactions
         set status = 'reversed', reversed_at = now(),
             cancel_reason = left(coalesce(new.cancel_reason, 'العقد تلغى'), 1000)
       where contract_id = new.id and status = 'paid';
    elsif new.settled_at is not null and old.settled_at is null then
      update public.commission_transactions set status = 'validated', validated_at = now()
       where contract_id = new.id and status = 'pending';
    elsif new.settled_at is null and old.settled_at is not null then
      -- A voided receipt took the sale back below «fully paid». What was not paid yet waits again.
      update public.commission_transactions set status = 'pending', validated_at = null
       where contract_id = new.id and status = 'validated';
    end if;
  exception when others then
    -- A sale is never refused because of a commission. The failure is in the audit log, named.
    perform app.write_audit('referral.error', 'contracts', new.id::text, null,
                            jsonb_build_object('error', sqlerrm, 'state', sqlstate, 'op', tg_op), null);
  end;
  return null;
end $$;

drop trigger if exists contracts_referral on public.contracts;
create trigger contracts_referral after insert or update of status, settled_at on public.contracts
  for each row execute function app.referral_on_contract();

-- ---------------------------------------------------------------------------
-- 6 · Row security: everything is read through the functions below; Finance and Admin may read the tables
-- ---------------------------------------------------------------------------

alter table public.commission_rules enable row level security;
alter table public.commission_transactions enable row level security;
alter table public.commission_payouts enable row level security;

revoke all on public.commission_rules, public.commission_transactions, public.commission_payouts from anon;
grant select on public.commission_rules, public.commission_transactions, public.commission_payouts to authenticated;

drop policy if exists commission_rules_read on public.commission_rules;
create policy commission_rules_read on public.commission_rules for select to authenticated using (app.is_staff());
drop policy if exists commission_transactions_read on public.commission_transactions;
create policy commission_transactions_read on public.commission_transactions for select to authenticated
  using (app.can_record_money());
drop policy if exists commission_payouts_read on public.commission_payouts;
create policy commission_payouts_read on public.commission_payouts for select to authenticated
  using (app.can_record_money());

-- ---------------------------------------------------------------------------
-- 7 · The client's own page (§5)
-- ---------------------------------------------------------------------------

/** Whether a code belongs to somebody — the /ref/<code> route asks before keeping it. False while closed. */
create or replace function public.referral_code_exists(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.flag_state('referrals') <> 'disabled'
     and exists (select 1 from public.persons p
                 where p.referral_code = upper(btrim(coalesce(p_code, ''))) and p.archived_at is null)
$$;
revoke execute on function public.referral_code_exists(text) from public;
grant execute on function public.referral_code_exists(text) to anon, authenticated;

/**
 * The signed-in client's referral page. Counts of the people they brought, never their names (§5); their own
 * commissions by generation and by state; their payouts; and the rule in force, so the page can say how it is
 * computed. Volatile: the code is made on the first visit.
 */
create or replace function public.my_referral() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_me    uuid;
  v_rule  public.commission_rules;
  v_code  text;
  v_depth integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;
  select p.id into v_me from public.persons p where p.profile_id = auth.uid() and p.archived_at is null;
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'no_person');
  end if;
  if not app.module_open('referrals') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  v_rule  := app.current_commission_rule();
  v_depth := coalesce(cardinality(v_rule.amounts_millimes), 0);
  v_code  := app.ensure_referral_code(v_me);

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'rule', jsonb_build_object('amounts_millimes', to_jsonb(v_rule.amounts_millimes), 'basis', v_rule.basis,
                               'generations', v_depth),
    'people', (
      with recursive down (generation, person_id) as (
        select 1, p.id from public.persons p where p.referred_by = v_me
        union all
        select d.generation + 1, p.id from down d join public.persons p on p.referred_by = d.person_id
        where d.generation < v_depth
      )
      select coalesce(jsonb_agg(jsonb_build_object('generation', g.n, 'count', coalesce(x.cnt, 0)) order by g.n), '[]')
      from generate_series(1, greatest(v_depth, 1)) g(n)
      left join (select d.generation, count(*) as cnt from down d group by d.generation) x on x.generation = g.n
    ),
    'sales_count', (select count(distinct t.contract_id) from public.commission_transactions t
                    where t.beneficiary_person_id = v_me and t.status in ('pending', 'validated', 'paid')),
    'by_generation', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'generation', s.generation, 'pending_millimes', s.pending, 'validated_millimes', s.validated,
               'paid_millimes', s.paid) order by s.generation), '[]')
      from (select t.generation,
                   coalesce(sum(t.amount_millimes) filter (where t.status = 'pending'), 0)   as pending,
                   coalesce(sum(t.amount_millimes) filter (where t.status = 'validated'), 0) as validated,
                   coalesce(sum(t.amount_millimes) filter (where t.status = 'paid'), 0)      as paid
            from public.commission_transactions t
            where t.beneficiary_person_id = v_me and t.status in ('pending', 'validated', 'paid')
            group by t.generation) s
    ),
    'totals', (
      select jsonb_build_object(
        'pending_millimes',   coalesce(sum(t.amount_millimes) filter (where t.status = 'pending'), 0),
        'validated_millimes', coalesce(sum(t.amount_millimes) filter (where t.status = 'validated'), 0),
        'paid_millimes',      coalesce(sum(t.amount_millimes) filter (where t.status = 'paid'), 0))
      from public.commission_transactions t where t.beneficiary_person_id = v_me
    ),
    'payouts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'reference_no', o.reference_no, 'paid_on', o.paid_on, 'total_millimes', o.total_millimes,
               'method_label', o.method_label) order by o.paid_on desc, o.created_at desc), '[]')
      from public.commission_payouts o where o.person_id = v_me
    )
  );
end $$;
revoke execute on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

-- ---------------------------------------------------------------------------
-- 8 · The Back Office: read (Finance and Admin)
-- ---------------------------------------------------------------------------

create or replace function app.referral_person_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone_e164', p.phone_e164,
                            'referral_code', p.referral_code, 'archived', p.archived_at is not null)
  from public.persons p where p.id = p_id
$$;
revoke execute on function app.referral_person_json(uuid) from public, anon, authenticated;

create or replace function public.staff_referral_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rule public.commission_rules;
begin
  if not app.can_record_money() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_rule := app.current_commission_rule();

  return jsonb_build_object(
    'flag', app.flag_state('referrals'),
    'rule', to_jsonb(v_rule),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', r.id, 'version', r.version, 'amounts_millimes', to_jsonb(r.amounts_millimes), 'basis', r.basis,
                'cap_millimes', r.cap_millimes, 'min_margin_bp', r.min_margin_bp, 'note', r.note,
                'created_at', r.created_at, 'created_by', pr.full_name) order by r.version desc), '[]')
              from (select * from public.commission_rules order by version desc limit 10) r
              left join public.profiles pr on pr.id = r.created_by),
    'totals', (select coalesce(jsonb_object_agg(s.status, jsonb_build_object('count', s.n, 'millimes', s.total)), '{}')
               from (select t.status::text as status, count(*) as n, sum(t.amount_millimes) as total
                     from public.commission_transactions t group by t.status) s),
    'months', (select coalesce(jsonb_agg(jsonb_build_object(
                 'month', m.month, 'created_millimes', m.created, 'validated_millimes', m.validated,
                 'paid_millimes', m.paid) order by m.month desc), '[]')
               from (
                 select to_char(date_trunc('month', t.created_at at time zone 'Africa/Tunis'), 'YYYY-MM') as month,
                        sum(t.amount_millimes) as created,
                        sum(t.amount_millimes) filter (where t.status in ('validated', 'paid')) as validated,
                        sum(t.amount_millimes) filter (where t.status = 'paid') as paid
                 from public.commission_transactions t
                 where t.created_at > now() - interval '12 months'
                 group by 1
               ) m),
    'referred_people', (select count(*) from public.persons p where p.referred_by is not null),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', p.id, 'code', p.code, 'name', p.name, 'status', p.status,
                 'referral_enabled', p.referral_enabled) order by p.created_at desc), '[]')
               from public.projects p),
    'to_pay', (select coalesce(jsonb_agg(x order by (x->>'validated_millimes')::bigint desc), '[]')
               from (select jsonb_build_object(
                        'person', app.referral_person_json(t.beneficiary_person_id),
                        'validated_millimes', sum(t.amount_millimes), 'count', count(*),
                        'ids', jsonb_agg(t.id order by t.created_at)) as x
                     from public.commission_transactions t
                     where t.status = 'validated'
                     group by t.beneficiary_person_id) q),
    'top', (select coalesce(jsonb_agg(x order by (x->>'direct')::integer desc), '[]')
            from (select jsonb_build_object(
                     'person', app.referral_person_json(p.referred_by), 'direct', count(*),
                     'earned_millimes', (select coalesce(sum(t.amount_millimes), 0) from public.commission_transactions t
                                         where t.beneficiary_person_id = p.referred_by
                                           and t.status in ('validated', 'paid'))) as x
                  from public.persons p where p.referred_by is not null
                  group by p.referred_by
                  order by count(*) desc limit 20) q)
  );
end $$;
revoke execute on function public.staff_referral_overview() from public, anon;
grant execute on function public.staff_referral_overview() to authenticated;

create or replace function public.staff_referral_commissions(
  p_status text default null, p_person uuid default null, p_limit integer default 100, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_record_money() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    with rows as (
      select t.*
      from public.commission_transactions t
      where (p_status is null or t.status::text = p_status)
        and (p_person is null or t.beneficiary_person_id = p_person or t.buyer_person_id = p_person)
    )
    select jsonb_build_object(
      'total', (select count(*) from rows),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', r.id, 'status', r.status, 'generation', r.generation, 'basis', r.basis, 'units', r.units,
                 'unit_millimes', r.unit_millimes, 'rule_unit_millimes', r.rule_unit_millimes,
                 'amount_millimes', r.amount_millimes, 'price_per_tree_millimes', r.price_per_tree_millimes,
                 'cost_per_tree_millimes', r.cost_per_tree_millimes, 'rule_id', r.rule_id,
                 'created_at', r.created_at, 'validated_at', r.validated_at, 'paid_at', r.paid_at,
                 'cancelled_at', r.cancelled_at, 'reversed_at', r.reversed_at, 'cancel_reason', r.cancel_reason,
                 'beneficiary', app.referral_person_json(r.beneficiary_person_id),
                 'buyer', app.referral_person_json(r.buyer_person_id),
                 'contract', jsonb_build_object('id', k.id, 'reference_no', k.reference_no, 'status', k.status,
                                                'trees_count', k.trees_count),
                 'project', jsonb_build_object('id', pj.id, 'code', pj.code, 'name', pj.name),
                 'payout', case when o.id is not null then jsonb_build_object('id', o.id, 'reference_no', o.reference_no,
                                                                             'paid_on', o.paid_on) end)
               order by r.created_at desc, r.generation), '[]')
               from (select * from rows order by created_at desc, generation
                     limit greatest(1, least(coalesce(p_limit, 100), 5000)) offset greatest(0, coalesce(p_offset, 0))) r
               join public.contracts k on k.id = r.contract_id
               join public.projects pj on pj.id = r.project_id
               left join public.commission_payouts o on o.id = r.payout_id)
    )
  );
end $$;
revoke execute on function public.staff_referral_commissions(text, uuid, integer, integer) from public, anon;
grant execute on function public.staff_referral_commissions(text, uuid, integer, integer) to authenticated;

create or replace function public.staff_referral_payouts(p_limit integer default 100, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_record_money() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.commission_payouts),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'reference_no', o.reference_no, 'paid_on', o.paid_on, 'total_millimes', o.total_millimes,
               'method_label', o.method_label, 'reference', o.reference, 'note', o.note, 'created_at', o.created_at,
               'created_by', pr.full_name, 'person', app.referral_person_json(o.person_id),
               'count', (select count(*) from public.commission_transactions t where t.payout_id = o.id))
             order by o.paid_on desc, o.created_at desc), '[]')
             from (select * from public.commission_payouts order by paid_on desc, created_at desc
                   limit greatest(1, least(coalesce(p_limit, 100), 5000)) offset greatest(0, coalesce(p_offset, 0))) o
             left join public.profiles pr on pr.id = o.created_by)
  );
end $$;
revoke execute on function public.staff_referral_payouts(integer, integer) from public, anon;
grant execute on function public.staff_referral_payouts(integer, integer) to authenticated;

/** Clients by name, phone or code, with how many they brought — the way into a tree. */
create or replace function public.staff_referral_find(p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  if not app.can_record_money() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(app.referral_person_json(p.id)
             || jsonb_build_object('direct', (select count(*) from public.persons d where d.referred_by = p.id),
                                   'has_referrer', p.referred_by is not null)
             order by p.full_name), '[]')
    from (select * from public.persons p
          where p.full_name ilike '%' || v_q || '%'
             or p.phone_e164 like '%' || regexp_replace(v_q, '[^0-9]', '', 'g') || '%' and regexp_replace(v_q, '[^0-9]', '', 'g') <> ''
             or p.referral_code = upper(v_q)
          order by p.full_name limit 30) p
  );
end $$;
revoke execute on function public.staff_referral_find(text) from public, anon;
grant execute on function public.staff_referral_find(text) to authenticated;

/** One client's place in the network: who is above them, who is below (up to the rule's depth), what they earned. */
create or replace function public.staff_referral_tree(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_depth integer;
begin
  if not app.can_record_money() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.persons p where p.id = p_person) then
    return null;
  end if;
  v_depth := greatest(coalesce(cardinality((app.current_commission_rule()).amounts_millimes), 6), 1);

  return jsonb_build_object(
    'person', app.referral_person_json(p_person)
              || (select jsonb_build_object('referred_at', p.referred_at, 'referral_meta', p.referral_meta)
                  from public.persons p where p.id = p_person),
    'depth', v_depth,
    'upline', (select coalesce(jsonb_agg(app.referral_person_json(u.person_id) || jsonb_build_object('generation', u.generation)
                 order by u.generation), '[]')
               from app.referral_upline(p_person, v_depth) u),
    'downline', (
      with recursive down (generation, person_id, parent_id) as (
        select 1, p.id, p.referred_by from public.persons p where p.referred_by = p_person
        union all
        select d.generation + 1, p.id, p.referred_by from down d join public.persons p on p.referred_by = d.person_id
        where d.generation < v_depth
      )
      select coalesce(jsonb_agg(app.referral_person_json(d.person_id) || jsonb_build_object(
               'generation', d.generation, 'parent_id', d.parent_id,
               'referred_at', (select p.referred_at from public.persons p where p.id = d.person_id),
               'contracts', (select count(*) from public.contracts k where k.person_id = d.person_id and k.status <> 'cancelled'))
             order by d.generation, d.person_id), '[]')
      from (select * from down limit 2000) d
    ),
    'earnings', (
      select jsonb_build_object(
        'pending_millimes',   coalesce(sum(t.amount_millimes) filter (where t.status = 'pending'), 0),
        'validated_millimes', coalesce(sum(t.amount_millimes) filter (where t.status = 'validated'), 0),
        'paid_millimes',      coalesce(sum(t.amount_millimes) filter (where t.status = 'paid'), 0),
        'reversed_millimes',  coalesce(sum(t.amount_millimes) filter (where t.status = 'reversed'), 0))
      from public.commission_transactions t where t.beneficiary_person_id = p_person)
  );
end $$;
revoke execute on function public.staff_referral_tree(uuid) from public, anon;
grant execute on function public.staff_referral_tree(uuid) to authenticated;

/**
 * §6 «يكشف الحسابات المكرّرة والإحالات الوهمية وعمليات التحايل». Signals, not verdicts: each line names what was
 * seen and who, and a human decides (staff_cancel_commission, staff_set_referrer).
 *   shared_contact   the referee shares an e-mail, a WhatsApp number or a CIN with their parrain
 *   shared_ip        two or more referees of one parrain registered from the same (hashed) address
 *   burst            a parrain brought referral.alert_burst_count people or more in one day
 *   reversed         a commission was paid and its sale cancelled afterwards: money to recover
 *   no_cost          a commission was computed without a known cost, so the margin was not checked
 */
create or replace function public.staff_referral_alerts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_burst integer := greatest(app.setting_int('referral.alert_burst_count', 5), 2);
begin
  if not app.can_record_money() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(a.x order by a.at desc nulls last), '[]')
    from (
      select jsonb_build_object('kind', 'shared_contact', 'referrer', app.referral_person_json(p.id),
               'person', app.referral_person_json(r.id),
               'detail', concat_ws('، ',
                 case when r.email is not null and lower(r.email) = lower(p.email) then 'نفس الإيميل' end,
                 case when r.whatsapp_e164 is not null and r.whatsapp_e164 in (p.phone_e164, p.whatsapp_e164) then 'نفس الواتساب' end,
                 case when p.whatsapp_e164 is not null and p.whatsapp_e164 = r.phone_e164 then 'نفس الواتساب' end,
                 case when r.cin is not null and r.cin = p.cin then 'نفس بطاقة التعريف' end),
               'at', r.referred_at) as x, r.referred_at as at
      from public.persons r join public.persons p on p.id = r.referred_by
      where (r.email is not null and lower(r.email) = lower(p.email))
         or (r.whatsapp_e164 is not null and r.whatsapp_e164 in (p.phone_e164, p.whatsapp_e164))
         or (p.whatsapp_e164 is not null and p.whatsapp_e164 = r.phone_e164)
         or (r.cin is not null and r.cin = p.cin)

      union all
      select jsonb_build_object('kind', 'shared_ip', 'referrer', app.referral_person_json(q.referred_by),
               'detail', q.n || ' تسجيلات من نفس العنوان', 'people', q.people, 'at', q.last_at), q.last_at
      from (select r.referred_by, count(*) as n, max(r.referred_at) as last_at,
                   jsonb_agg(app.referral_person_json(r.id)) as people
            from public.persons r
            where r.referred_by is not null and r.referral_meta ? 'ip'
            group by r.referred_by, r.referral_meta->>'ip' having count(*) >= 2) q

      union all
      select jsonb_build_object('kind', 'burst', 'referrer', app.referral_person_json(q.referred_by),
               'detail', q.n || ' تسجيلات في ' || q.day, 'at', q.last_at), q.last_at
      from (select r.referred_by, (r.referred_at at time zone 'Africa/Tunis')::date as day, count(*) as n,
                   max(r.referred_at) as last_at
            from public.persons r where r.referred_by is not null and r.referred_at is not null
            group by 1, 2 having count(*) >= v_burst) q

      union all
      select jsonb_build_object('kind', 'reversed', 'referrer', app.referral_person_json(t.beneficiary_person_id),
               'person', app.referral_person_json(t.buyer_person_id), 'amount_millimes', t.amount_millimes,
               'detail', t.cancel_reason, 'at', t.reversed_at), t.reversed_at
      from public.commission_transactions t where t.status = 'reversed'

      union all
      select jsonb_build_object('kind', 'no_cost', 'referrer', app.referral_person_json(t.beneficiary_person_id),
               'person', app.referral_person_json(t.buyer_person_id), 'amount_millimes', t.amount_millimes,
               'at', t.created_at), t.created_at
      from public.commission_transactions t
      where t.cost_per_tree_millimes is null and t.status in ('pending', 'validated')
    ) a
  );
end $$;
revoke execute on function public.staff_referral_alerts() from public, anon;
grant execute on function public.staff_referral_alerts() to authenticated;

-- ---------------------------------------------------------------------------
-- 9 · The Back Office: write
-- ---------------------------------------------------------------------------

/** §6: levels, amounts, per tree or per order, cap, minimum margin. Admin only. A new row; older sales keep theirs. */
create or replace function public.staff_save_commission_rule(p jsonb) returns public.commission_rules
language plpgsql security definer set search_path = '' as $$
declare
  v_amounts bigint[];
  v_cap     bigint;
  v_margin  integer;
  v_row     public.commission_rules;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p->>'reason');

  begin
    select array_agg(x::bigint order by o) into v_amounts
    from jsonb_array_elements_text(p->'amounts_millimes') with ordinality e(x, o);
  exception when others then
    raise exception 'invalid_commission_amounts' using errcode = 'P0001';
  end;
  if not app.referral_amounts_ok(v_amounts) then
    raise exception 'invalid_commission_amounts' using errcode = 'P0001';
  end if;
  if coalesce(p->>'basis', '') not in ('tree', 'order') then
    raise exception 'invalid_commission_basis' using errcode = 'P0001';
  end if;
  begin
    v_cap := (p->>'cap_millimes')::bigint;
  exception when others then
    v_cap := null;
  end;
  if coalesce(v_cap, 0) <= 0 then
    raise exception 'invalid_commission_cap' using errcode = 'P0001';
  end if;
  if app.referral_amounts_sum(v_amounts) > v_cap then
    raise exception 'commission_over_cap' using errcode = 'P0001';
  end if;
  begin
    v_margin := (p->>'min_margin_bp')::integer;
  exception when others then
    v_margin := null;
  end;
  if v_margin is null or v_margin not between 0 and 10000 then
    raise exception 'invalid_min_margin' using errcode = 'P0001';
  end if;

  insert into public.commission_rules (amounts_millimes, basis, cap_millimes, min_margin_bp, note, created_by)
  values (v_amounts, p->>'basis', v_cap, v_margin, nullif(left(btrim(coalesce(p->>'note', '')), 1000), ''), auth.uid())
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.staff_save_commission_rule(jsonb) from public, anon;
grant execute on function public.staff_save_commission_rule(jsonb) to authenticated;

create or replace function public.staff_set_offer_referral(p_project uuid, p_enabled boolean, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);
  update public.projects set referral_enabled = coalesce(p_enabled, false) where id = p_project;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.staff_set_offer_referral(uuid, boolean, text) from public, anon;
grant execute on function public.staff_set_offer_referral(uuid, boolean, text) to authenticated;

/** Pays some of one person's validated commissions in one payout. Every id must be theirs and validated. */
create or replace function public.staff_pay_commissions(
  p_person uuid, p_ids uuid[], p_paid_on date, p_method text, p_reference text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids    uuid[] := (select array_agg(distinct x) from unnest(coalesce(p_ids, '{}')) x where x is not null);
  v_total  bigint;
  v_n      integer;
  v_year   text := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
  v_payout public.commission_payouts;
begin
  if not app.can_record_money() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'no_commission_selected' using errcode = 'P0001';
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'Africa/Tunis')::date then
    raise exception 'invalid_paid_on' using errcode = 'P0001';
  end if;

  perform 1 from public.commission_transactions t where t.id = any (v_ids) for update;
  select count(*), sum(t.amount_millimes) into v_n, v_total
  from public.commission_transactions t
  where t.id = any (v_ids) and t.beneficiary_person_id = p_person and t.status = 'validated';
  if v_n <> cardinality(v_ids) then
    raise exception 'commission_not_payable' using errcode = 'P0001';
  end if;

  insert into public.commission_payouts (reference_no, person_id, total_millimes, paid_on, method_label, reference,
                                         note, created_by)
  values (app.setting_text('request_no.prefix', 'AGZ') || '-COM-' || v_year || '-'
            || lpad(app.next_number('commission_payout:' || v_year)::text, 6, '0'),
          p_person, v_total, p_paid_on, nullif(left(btrim(coalesce(p_method, '')), 120), ''),
          nullif(left(btrim(coalesce(p_reference, '')), 200), ''), nullif(left(btrim(coalesce(p_reason, '')), 1000), ''),
          auth.uid())
  returning * into v_payout;

  update public.commission_transactions
     set status = 'paid', paid_at = now(), payout_id = v_payout.id
   where id = any (v_ids);

  return jsonb_build_object('id', v_payout.id, 'reference_no', v_payout.reference_no,
                            'total_millimes', v_payout.total_millimes, 'count', v_n);
end $$;
revoke execute on function public.staff_pay_commissions(uuid, uuid[], date, text, text, text) from public, anon;
grant execute on function public.staff_pay_commissions(uuid, uuid[], date, text, text, text) to authenticated;

/** A human stops a commission that was not paid yet (a fake referral, a duplicate account). A reason is required. */
create or replace function public.staff_cancel_commission(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := app.require_reason(p_reason, 3);
begin
  if not app.can_record_money() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('app.reason', v_reason, true);
  update public.commission_transactions
     set status = 'cancelled', cancelled_at = now(), cancel_reason = left(v_reason, 1000)
   where id = p_id and status in ('pending', 'validated');
  if not found then
    raise exception 'commission_not_cancellable' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.staff_cancel_commission(uuid, text) from public, anon;
grant execute on function public.staff_cancel_commission(uuid, text) to authenticated;

/** An admin's correction of who brought a client (or null to remove it). Commissions already computed keep theirs. */
create or replace function public.staff_set_referrer(p_person uuid, p_referrer uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := app.require_reason(p_reason, 3);
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('app.reason', v_reason, true);
  if not exists (select 1 from public.persons p where p.id = p_person) then
    raise exception 'person_not_found' using errcode = 'P0001';
  end if;
  if p_referrer is not null and not exists (select 1 from public.persons p where p.id = p_referrer and p.archived_at is null) then
    raise exception 'person_not_found' using errcode = 'P0001';
  end if;

  perform set_config('app.referral_write', 'on', true);
  update public.persons
     set referred_by = p_referrer,
         referral_meta = case when p_referrer is null then null
                              else jsonb_build_object('channel', 'staff', 'by', auth.uid(), 'reason', v_reason) end
   where id = p_person;
  perform set_config('app.referral_write', 'off', true);
end $$;
revoke execute on function public.staff_set_referrer(uuid, uuid, text) from public, anon;
grant execute on function public.staff_set_referrer(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10 · The client page's words (ui.referral.*), Arabic here, the four other languages as drafts
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('ui.referral.title',        to_jsonb('برنامج التوصية'::text), 'text', 'ui', 'التوصية: العنوان', null, true, 5400),
  ('ui.referral.entry',        to_jsonb('ادعُ أصحابك واربح'::text), 'text', 'ui', 'التوصية: زرّ فضاء الحريف', null, true, 5401),
  ('ui.referral.intro',        to_jsonb('ابعث الرابط متاعك لأصحابك وعايلتك. كي واحد منهم يسجّل بالرابط ويشري زيتونة ويكمّل خلاصها، تاخذ كوميسيون.'::text), 'text', 'ui', 'التوصية: المقدّمة', null, true, 5402),
  ('ui.referral.code_label',   to_jsonb('الكود متاعك'::text), 'text', 'ui', 'التوصية: الكود', null, true, 5403),
  ('ui.referral.link_label',   to_jsonb('الرابط متاعك'::text), 'text', 'ui', 'التوصية: الرابط', null, true, 5404),
  ('ui.referral.copy',         to_jsonb('انسخ الرابط'::text), 'text', 'ui', 'التوصية: نسخ', null, true, 5405),
  ('ui.referral.copied',       to_jsonb('تنسخ الرابط'::text), 'text', 'ui', 'التوصية: تنسخ', null, true, 5406),
  ('ui.referral.share',        to_jsonb('ابعث الرابط'::text), 'text', 'ui', 'التوصية: إرسال', null, true, 5407),
  ('ui.referral.share_text',   to_jsonb('اكتشف AgriZed: زيتونة حقيقية بأرضها. سجّل من هذا الرابط:'::text), 'text', 'ui', 'التوصية: نصّ الرسالة', null, true, 5408),
  ('ui.referral.people_title', to_jsonb('الناس اللي جاو عن طريقك'::text), 'text', 'ui', 'التوصية: الأشخاص', null, true, 5409),
  ('ui.referral.generation',   to_jsonb('الجيل {n}'::text), 'text', 'ui', 'التوصية: الجيل', null, true, 5410),
  ('ui.referral.direct_note',  to_jsonb('الجيل 1 هوما اللي سجّلو بالرابط متاعك مباشرة.'::text), 'text', 'ui', 'التوصية: شرح الجيل 1', null, true, 5411),
  ('ui.referral.sales_label',  to_jsonb('مبيعات جابت كوميسيون'::text), 'text', 'ui', 'التوصية: المبيعات', null, true, 5412),
  ('ui.referral.commissions_title', to_jsonb('الكوميسيونات متاعك'::text), 'text', 'ui', 'التوصية: الكوميسيونات', null, true, 5413),
  ('ui.referral.status_pending',   to_jsonb('في الانتظار'::text), 'text', 'ui', 'التوصية: في الانتظار', null, true, 5414),
  ('ui.referral.status_validated', to_jsonb('مؤكّدة'::text), 'text', 'ui', 'التوصية: مؤكّدة', null, true, 5415),
  ('ui.referral.status_paid',      to_jsonb('مخلّصة'::text), 'text', 'ui', 'التوصية: مخلّصة', null, true, 5416),
  ('ui.referral.pending_note', to_jsonb('الكوميسيون تتأكّد كي الشاري يكمّل خلاص الزيتونة الكل، وتتخلّص بعد مراجعة الإدارة.'::text), 'text', 'ui', 'التوصية: متى تتأكّد', null, true, 5417),
  ('ui.referral.rule_title',   to_jsonb('كيفاش تتحسب'::text), 'text', 'ui', 'التوصية: القاعدة', null, true, 5418),
  ('ui.referral.rule_line',    to_jsonb('الجيل {n}: {amount} على كل {unit}'::text), 'text', 'ui', 'التوصية: سطر القاعدة', null, true, 5419),
  ('ui.referral.unit_tree',    to_jsonb('زيتونة'::text), 'text', 'ui', 'التوصية: زيتونة', null, true, 5420),
  ('ui.referral.unit_order',   to_jsonb('طلبية'::text), 'text', 'ui', 'التوصية: طلبية', null, true, 5421),
  ('ui.referral.legal_note',   to_jsonb('ما فماش كوميسيون على التسجيل ولا على جلب الناس، كان على بيع حقيقي تخلّص بالكامل.'::text), 'text', 'ui', 'التوصية: القاعدة الأساسية', null, true, 5422),
  ('ui.referral.payouts_title', to_jsonb('الخلاصات'::text), 'text', 'ui', 'التوصية: الخلاصات', null, true, 5423),
  ('ui.referral.payouts_empty', to_jsonb('مازال ما تخلّصت حتى كوميسيون.'::text), 'text', 'ui', 'التوصية: ما فماش خلاصات', null, true, 5424),
  ('ui.referral.privacy_note', to_jsonb('ما نوريوكش أسماء ولا معطيات الناس اللي جاو عن طريقك، كان العدد.'::text), 'text', 'ui', 'التوصية: الخصوصية', null, true, 5425),
  ('ui.referral.closed',       to_jsonb('برنامج التوصية مازال ما تفتحش.'::text), 'text', 'ui', 'التوصية: مسكّر', null, true, 5426),
  ('ui.referral.error',        to_jsonb('ما نجمناش نقراو معطيات التوصية توّا. عاود حلّ الصفحة بعد شوية.'::text), 'text', 'ui', 'التوصية: خطأ', null, true, 5427)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'ui.referral.title', 'value', 'fr', to_jsonb('Programme de parrainage'::text), true),
  ('setting', 'ui.referral.title', 'value', 'de', to_jsonb('Empfehlungsprogramm'::text), true),
  ('setting', 'ui.referral.title', 'value', 'it', to_jsonb('Programma di referral'::text), true),
  ('setting', 'ui.referral.title', 'value', 'en', to_jsonb('Referral programme'::text), true),
  ('setting', 'ui.referral.entry', 'value', 'fr', to_jsonb('Parrainez vos proches'::text), true),
  ('setting', 'ui.referral.entry', 'value', 'de', to_jsonb('Freunde einladen'::text), true),
  ('setting', 'ui.referral.entry', 'value', 'it', to_jsonb('Invita i tuoi amici'::text), true),
  ('setting', 'ui.referral.entry', 'value', 'en', to_jsonb('Invite your friends'::text), true),
  ('setting', 'ui.referral.intro', 'value', 'fr', to_jsonb('Envoyez votre lien à vos amis et à votre famille. Quand l''un d''eux s''inscrit avec ce lien, achète un olivier et le paie entièrement, vous recevez une commission.'::text), true),
  ('setting', 'ui.referral.intro', 'value', 'de', to_jsonb('Schicken Sie Ihren Link an Freunde und Familie. Wenn sich jemand darüber anmeldet, einen Olivenbaum kauft und vollständig bezahlt, erhalten Sie eine Provision.'::text), true),
  ('setting', 'ui.referral.intro', 'value', 'it', to_jsonb('Invia il tuo link ad amici e familiari. Quando uno di loro si registra con il link, acquista un olivo e lo paga per intero, ricevi una commissione.'::text), true),
  ('setting', 'ui.referral.intro', 'value', 'en', to_jsonb('Send your link to friends and family. When one of them signs up with it, buys an olive tree and pays it in full, you earn a commission.'::text), true),
  ('setting', 'ui.referral.code_label', 'value', 'fr', to_jsonb('Votre code'::text), true),
  ('setting', 'ui.referral.code_label', 'value', 'de', to_jsonb('Ihr Code'::text), true),
  ('setting', 'ui.referral.code_label', 'value', 'it', to_jsonb('Il tuo codice'::text), true),
  ('setting', 'ui.referral.code_label', 'value', 'en', to_jsonb('Your code'::text), true),
  ('setting', 'ui.referral.link_label', 'value', 'fr', to_jsonb('Votre lien'::text), true),
  ('setting', 'ui.referral.link_label', 'value', 'de', to_jsonb('Ihr Link'::text), true),
  ('setting', 'ui.referral.link_label', 'value', 'it', to_jsonb('Il tuo link'::text), true),
  ('setting', 'ui.referral.link_label', 'value', 'en', to_jsonb('Your link'::text), true),
  ('setting', 'ui.referral.copy', 'value', 'fr', to_jsonb('Copier le lien'::text), true),
  ('setting', 'ui.referral.copy', 'value', 'de', to_jsonb('Link kopieren'::text), true),
  ('setting', 'ui.referral.copy', 'value', 'it', to_jsonb('Copia il link'::text), true),
  ('setting', 'ui.referral.copy', 'value', 'en', to_jsonb('Copy link'::text), true),
  ('setting', 'ui.referral.copied', 'value', 'fr', to_jsonb('Lien copié'::text), true),
  ('setting', 'ui.referral.copied', 'value', 'de', to_jsonb('Link kopiert'::text), true),
  ('setting', 'ui.referral.copied', 'value', 'it', to_jsonb('Link copiato'::text), true),
  ('setting', 'ui.referral.copied', 'value', 'en', to_jsonb('Link copied'::text), true),
  ('setting', 'ui.referral.share', 'value', 'fr', to_jsonb('Envoyer le lien'::text), true),
  ('setting', 'ui.referral.share', 'value', 'de', to_jsonb('Link senden'::text), true),
  ('setting', 'ui.referral.share', 'value', 'it', to_jsonb('Invia il link'::text), true),
  ('setting', 'ui.referral.share', 'value', 'en', to_jsonb('Send the link'::text), true),
  ('setting', 'ui.referral.share_text', 'value', 'fr', to_jsonb('Découvrez AgriZed : un vrai olivier avec sa terre. Inscrivez-vous avec ce lien :'::text), true),
  ('setting', 'ui.referral.share_text', 'value', 'de', to_jsonb('Entdecken Sie AgriZed: ein echter Olivenbaum mit eigenem Land. Melden Sie sich über diesen Link an:'::text), true),
  ('setting', 'ui.referral.share_text', 'value', 'it', to_jsonb('Scopri AgriZed: un vero olivo con la sua terra. Registrati con questo link:'::text), true),
  ('setting', 'ui.referral.share_text', 'value', 'en', to_jsonb('Discover AgriZed: a real olive tree with its own land. Sign up with this link:'::text), true),
  ('setting', 'ui.referral.people_title', 'value', 'fr', to_jsonb('Les personnes venues par vous'::text), true),
  ('setting', 'ui.referral.people_title', 'value', 'de', to_jsonb('Über Sie gekommene Personen'::text), true),
  ('setting', 'ui.referral.people_title', 'value', 'it', to_jsonb('Le persone arrivate tramite te'::text), true),
  ('setting', 'ui.referral.people_title', 'value', 'en', to_jsonb('People who came through you'::text), true),
  ('setting', 'ui.referral.generation', 'value', 'fr', to_jsonb('Génération {n}'::text), true),
  ('setting', 'ui.referral.generation', 'value', 'de', to_jsonb('Generation {n}'::text), true),
  ('setting', 'ui.referral.generation', 'value', 'it', to_jsonb('Generazione {n}'::text), true),
  ('setting', 'ui.referral.generation', 'value', 'en', to_jsonb('Generation {n}'::text), true),
  ('setting', 'ui.referral.direct_note', 'value', 'fr', to_jsonb('La génération 1, ce sont les personnes inscrites directement avec votre lien.'::text), true),
  ('setting', 'ui.referral.direct_note', 'value', 'de', to_jsonb('Generation 1 sind die Personen, die sich direkt über Ihren Link angemeldet haben.'::text), true),
  ('setting', 'ui.referral.direct_note', 'value', 'it', to_jsonb('La generazione 1 sono le persone registrate direttamente con il tuo link.'::text), true),
  ('setting', 'ui.referral.direct_note', 'value', 'en', to_jsonb('Generation 1 are the people who signed up directly with your link.'::text), true),
  ('setting', 'ui.referral.sales_label', 'value', 'fr', to_jsonb('Ventes ayant généré une commission'::text), true),
  ('setting', 'ui.referral.sales_label', 'value', 'de', to_jsonb('Verkäufe mit Provision'::text), true),
  ('setting', 'ui.referral.sales_label', 'value', 'it', to_jsonb('Vendite con commissione'::text), true),
  ('setting', 'ui.referral.sales_label', 'value', 'en', to_jsonb('Sales that earned a commission'::text), true),
  ('setting', 'ui.referral.commissions_title', 'value', 'fr', to_jsonb('Vos commissions'::text), true),
  ('setting', 'ui.referral.commissions_title', 'value', 'de', to_jsonb('Ihre Provisionen'::text), true),
  ('setting', 'ui.referral.commissions_title', 'value', 'it', to_jsonb('Le tue commissioni'::text), true),
  ('setting', 'ui.referral.commissions_title', 'value', 'en', to_jsonb('Your commissions'::text), true),
  ('setting', 'ui.referral.status_pending', 'value', 'fr', to_jsonb('En attente'::text), true),
  ('setting', 'ui.referral.status_pending', 'value', 'de', to_jsonb('Ausstehend'::text), true),
  ('setting', 'ui.referral.status_pending', 'value', 'it', to_jsonb('In attesa'::text), true),
  ('setting', 'ui.referral.status_pending', 'value', 'en', to_jsonb('Pending'::text), true),
  ('setting', 'ui.referral.status_validated', 'value', 'fr', to_jsonb('Validées'::text), true),
  ('setting', 'ui.referral.status_validated', 'value', 'de', to_jsonb('Bestätigt'::text), true),
  ('setting', 'ui.referral.status_validated', 'value', 'it', to_jsonb('Confermate'::text), true),
  ('setting', 'ui.referral.status_validated', 'value', 'en', to_jsonb('Confirmed'::text), true),
  ('setting', 'ui.referral.status_paid', 'value', 'fr', to_jsonb('Payées'::text), true),
  ('setting', 'ui.referral.status_paid', 'value', 'de', to_jsonb('Ausgezahlt'::text), true),
  ('setting', 'ui.referral.status_paid', 'value', 'it', to_jsonb('Pagate'::text), true),
  ('setting', 'ui.referral.status_paid', 'value', 'en', to_jsonb('Paid'::text), true),
  ('setting', 'ui.referral.pending_note', 'value', 'fr', to_jsonb('Une commission est validée quand l''acheteur a payé tout son olivier, puis versée après vérification par l''équipe.'::text), true),
  ('setting', 'ui.referral.pending_note', 'value', 'de', to_jsonb('Eine Provision wird bestätigt, sobald der Käufer den Baum vollständig bezahlt hat, und nach Prüfung durch das Team ausgezahlt.'::text), true),
  ('setting', 'ui.referral.pending_note', 'value', 'it', to_jsonb('Una commissione è confermata quando l''acquirente ha pagato tutto l''olivo, poi versata dopo la verifica del team.'::text), true),
  ('setting', 'ui.referral.pending_note', 'value', 'en', to_jsonb('A commission is confirmed once the buyer has paid the whole tree, then paid out after the team has checked it.'::text), true),
  ('setting', 'ui.referral.rule_title', 'value', 'fr', to_jsonb('Comment elle est calculée'::text), true),
  ('setting', 'ui.referral.rule_title', 'value', 'de', to_jsonb('So wird sie berechnet'::text), true),
  ('setting', 'ui.referral.rule_title', 'value', 'it', to_jsonb('Come viene calcolata'::text), true),
  ('setting', 'ui.referral.rule_title', 'value', 'en', to_jsonb('How it is calculated'::text), true),
  ('setting', 'ui.referral.rule_line', 'value', 'fr', to_jsonb('Génération {n} : {amount} par {unit}'::text), true),
  ('setting', 'ui.referral.rule_line', 'value', 'de', to_jsonb('Generation {n}: {amount} pro {unit}'::text), true),
  ('setting', 'ui.referral.rule_line', 'value', 'it', to_jsonb('Generazione {n}: {amount} per {unit}'::text), true),
  ('setting', 'ui.referral.rule_line', 'value', 'en', to_jsonb('Generation {n}: {amount} per {unit}'::text), true),
  ('setting', 'ui.referral.unit_tree', 'value', 'fr', to_jsonb('olivier'::text), true),
  ('setting', 'ui.referral.unit_tree', 'value', 'de', to_jsonb('Olivenbaum'::text), true),
  ('setting', 'ui.referral.unit_tree', 'value', 'it', to_jsonb('olivo'::text), true),
  ('setting', 'ui.referral.unit_tree', 'value', 'en', to_jsonb('olive tree'::text), true),
  ('setting', 'ui.referral.unit_order', 'value', 'fr', to_jsonb('commande'::text), true),
  ('setting', 'ui.referral.unit_order', 'value', 'de', to_jsonb('Bestellung'::text), true),
  ('setting', 'ui.referral.unit_order', 'value', 'it', to_jsonb('ordine'::text), true),
  ('setting', 'ui.referral.unit_order', 'value', 'en', to_jsonb('order'::text), true),
  ('setting', 'ui.referral.legal_note', 'value', 'fr', to_jsonb('Aucune commission pour une inscription ou pour le recrutement : seulement pour une vraie vente payée en totalité.'::text), true),
  ('setting', 'ui.referral.legal_note', 'value', 'de', to_jsonb('Keine Provision für eine Anmeldung oder das Werben von Personen – nur für einen echten, vollständig bezahlten Verkauf.'::text), true),
  ('setting', 'ui.referral.legal_note', 'value', 'it', to_jsonb('Nessuna commissione per una registrazione o per il reclutamento: solo per una vendita reale pagata per intero.'::text), true),
  ('setting', 'ui.referral.legal_note', 'value', 'en', to_jsonb('No commission for a sign-up or for recruiting people — only for a real sale paid in full.'::text), true),
  ('setting', 'ui.referral.payouts_title', 'value', 'fr', to_jsonb('Versements'::text), true),
  ('setting', 'ui.referral.payouts_title', 'value', 'de', to_jsonb('Auszahlungen'::text), true),
  ('setting', 'ui.referral.payouts_title', 'value', 'it', to_jsonb('Pagamenti'::text), true),
  ('setting', 'ui.referral.payouts_title', 'value', 'en', to_jsonb('Payouts'::text), true),
  ('setting', 'ui.referral.payouts_empty', 'value', 'fr', to_jsonb('Aucune commission versée pour l''instant.'::text), true),
  ('setting', 'ui.referral.payouts_empty', 'value', 'de', to_jsonb('Noch keine Provision ausgezahlt.'::text), true),
  ('setting', 'ui.referral.payouts_empty', 'value', 'it', to_jsonb('Nessuna commissione pagata finora.'::text), true),
  ('setting', 'ui.referral.payouts_empty', 'value', 'en', to_jsonb('No commission paid out yet.'::text), true),
  ('setting', 'ui.referral.privacy_note', 'value', 'fr', to_jsonb('Nous ne montrons ni les noms ni les données des personnes venues par vous, seulement leur nombre.'::text), true),
  ('setting', 'ui.referral.privacy_note', 'value', 'de', to_jsonb('Wir zeigen weder Namen noch Daten der Personen, die über Sie gekommen sind – nur ihre Anzahl.'::text), true),
  ('setting', 'ui.referral.privacy_note', 'value', 'it', to_jsonb('Non mostriamo nomi né dati delle persone arrivate tramite te, solo il loro numero.'::text), true),
  ('setting', 'ui.referral.privacy_note', 'value', 'en', to_jsonb('We never show the names or details of the people who came through you, only how many they are.'::text), true),
  ('setting', 'ui.referral.closed', 'value', 'fr', to_jsonb('Le programme de parrainage n''est pas encore ouvert.'::text), true),
  ('setting', 'ui.referral.closed', 'value', 'de', to_jsonb('Das Empfehlungsprogramm ist noch nicht geöffnet.'::text), true),
  ('setting', 'ui.referral.closed', 'value', 'it', to_jsonb('Il programma di referral non è ancora aperto.'::text), true),
  ('setting', 'ui.referral.closed', 'value', 'en', to_jsonb('The referral programme is not open yet.'::text), true),
  ('setting', 'ui.referral.error', 'value', 'fr', to_jsonb('Impossible de lire vos données de parrainage pour le moment. Rechargez la page dans quelques instants.'::text), true),
  ('setting', 'ui.referral.error', 'value', 'de', to_jsonb('Ihre Empfehlungsdaten können gerade nicht gelesen werden. Laden Sie die Seite gleich erneut.'::text), true),
  ('setting', 'ui.referral.error', 'value', 'it', to_jsonb('Al momento non riusciamo a leggere i tuoi dati di referral. Ricarica la pagina tra poco.'::text), true),
  ('setting', 'ui.referral.error', 'value', 'en', to_jsonb('We cannot read your referral data right now. Reload the page in a moment.'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;
