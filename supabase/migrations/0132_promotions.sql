-- 0132 · تخفيض حسب الكمية — quantity promotions, and which offers and which way of paying they apply to.
--
-- Its test is supabase/tests/080_promotions.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0132_promotions.sql supabase/tests/080_promotions.sql
--
-- THE OWNER'S REQUEST (2026-10-06): «كل ما الحريف ياخو كمية أكبر، ينجم يتحصل على تخفيض أكبر… الأرقام هاذي
-- أمثلة فقط، والإدارة لازم تنجم تبدّلهم في أي وقت… ما نحبوش المطور يكتب 10 زيتونات = 10% مباشرة في الكود».
--
-- So not one number is written here. The table holds the tiers; this file creates it empty and the Back Office
-- fills it. An offer with no promotion prices exactly as it does today.
--
-- WHAT A ROW IS. One tier: «from N trees, take X off». It carries its own floor and optional ceiling, its own
-- dates, its own on/off switch, the offers it applies to, and the way of paying it applies to — every field
-- the owner listed, and nothing the code decides.
--
-- TWO KINDS OF REDUCTION, and exactly one per row (tree_promotions_one_kind): a PERCENTAGE off the price the
-- offer already computes, or a SPECIAL PRICE PER TREE that replaces it. The owner asked for both («نسبة
-- التخفيض % أو سعر خاص للوحدة»), and a row that tried to be both would be two rules fighting over one total.
--
-- PERCENTAGES ARE BASIS POINTS, like financing_markups.margin_percent_bp beside it: 1000 = 10%. A percentage
-- stored as a float is a rounding argument waiting to happen on money.
--
-- SCOPE IS ONE NULLABLE COLUMN, not a join table. `project_id` null means every offer; a project id means
-- that offer alone. «Those three offers» is three rows, which is a sentence the owner can read in a list —
-- where a join table is a second screen to understand before he can answer «why did this client get 15%».

create table public.tree_promotions (
  id                  uuid primary key default gen_random_uuid(),
  label_ar            text not null check (length(btrim(label_ar)) between 2 and 120),
  /** Null = every offer. A project id = that offer alone. */
  project_id          uuid references public.projects (id) on delete cascade,

  min_trees           integer not null check (min_trees >= 1),
  /** Null = no ceiling: the tier runs from min_trees upwards. */
  max_trees           integer check (max_trees is null or max_trees >= min_trees),

  /** Basis points off the computed price. 1000 = 10%. */
  discount_percent_bp integer check (discount_percent_bp between 1 and 10000),
  /** Or a price per tree that replaces the computed one, in millimes. */
  unit_price_millimes bigint check (unit_price_millimes >= 0),

  /** Null = both ways of paying. Otherwise 'cash' or 'installments'. */
  payment_mode        text check (payment_mode in ('cash', 'installments')),

  starts_on           date,
  ends_on             date,
  is_active           boolean not null default true,
  note_ar             text check (note_ar is null or length(note_ar) <= 500),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id),

  constraint tree_promotions_one_kind check (
    (discount_percent_bp is not null and unit_price_millimes is null)
    or (discount_percent_bp is null and unit_price_millimes is not null)
  ),
  constraint tree_promotions_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

comment on table public.tree_promotions is
  'Quantity tiers: from N trees, a percentage off or a special price per tree. Owned by the Back Office (0132).';

create index tree_promotions_lookup_idx on public.tree_promotions (project_id, min_trees desc) where is_active;

-- Only staff read this table at all: every public read goes through a security-definer function, which is
-- also the only thing that knows how to CHOOSE between two tiers. A visitor reading the tiers directly could
-- work out the margin ladder of the business.
alter table public.tree_promotions enable row level security;

create policy tree_promotions_staff_read on public.tree_promotions for select to authenticated
  using ((select app.is_staff()));
create policy tree_promotions_admin_write on public.tree_promotions for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- The same stamp every other owned table carries (profiles, settings, feature_flags…).
-- RLS already answers «which rows», but a visitor has a blanket SELECT grant on this schema and a policy is
-- a filter, not a door. The grant goes too, so the ladder is unreachable even if a policy is ever loosened by
-- mistake. `authenticated` keeps it: the Back Office lists these rows through PostgREST, under the policy above.
revoke all on public.tree_promotions from anon;

create trigger tree_promotions_stamp before update on public.tree_promotions
  for each row execute function app.stamp_updated();

-- ---------------------------------------------------------------------------
-- Which tier a basket falls in
-- ---------------------------------------------------------------------------
--
-- THE RULE, in one sentence, because a discount nobody can explain is a discount that gets argued about:
-- the tier with the HIGHEST floor the quantity actually reaches wins, and an offer's own tier beats a tier
-- that applies to everything.
--
-- It is deliberately not «the biggest discount wins». With a percentage and a special unit price in the same
-- table those are not comparable without pricing both, and a ladder that can be read off the list — 10 trees,
-- 25, 100 — is one the owner can reason about before a client ever asks.
create or replace function app.promotion_for(
  p_project uuid,
  p_trees   integer,
  p_mode    text default null,
  p_on      date default null
) returns public.tree_promotions
language sql stable security definer set search_path = '' as $$
  select pr.*
    from public.tree_promotions pr
   where pr.is_active
     and p_trees is not null
     and p_trees >= pr.min_trees
     and (pr.max_trees is null or p_trees <= pr.max_trees)
     and (pr.project_id is null or pr.project_id = p_project)
     and (pr.payment_mode is null or pr.payment_mode = p_mode)
     and (pr.starts_on is null or coalesce(p_on, (now() at time zone 'Africa/Tunis')::date) >= pr.starts_on)
     and (pr.ends_on   is null or coalesce(p_on, (now() at time zone 'Africa/Tunis')::date) <= pr.ends_on)
   order by pr.min_trees desc, (pr.project_id is not null) desc, pr.created_at
   limit 1
$$;

revoke execute on function app.promotion_for(uuid, integer, text, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What a tier does to a total
-- ---------------------------------------------------------------------------
--
-- Returns the four figures the owner asked the client to be shown — «السعر قبل التخفيض، نسبة التخفيض، قيمة
-- التخفيض، السعر النهائي» — and nothing is computed twice anywhere else. A null promotion returns the total
-- unchanged with no promotion key, so every caller can use it without asking whether one applied.
--
-- ROUNDING: the discount is rounded, not the final price, so «before − discount = after» always holds on
-- screen. A client who subtracts the two numbers printed to him must not get a third.
create or replace function app.apply_promotion(p_total bigint, p_trees integer, p_promo public.tree_promotions)
returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_total is null or p_promo.id is null then jsonb_build_object('total_millimes', p_total)
    when p_promo.unit_price_millimes is not null then
      jsonb_build_object(
        'total_millimes', p_promo.unit_price_millimes * p_trees,
        'promotion', jsonb_build_object(
          'id', p_promo.id, 'label_ar', p_promo.label_ar, 'min_trees', p_promo.min_trees,
          'unit_price_millimes', p_promo.unit_price_millimes,
          'before_millimes', p_total,
          'amount_millimes', p_total - p_promo.unit_price_millimes * p_trees))
    else
      jsonb_build_object(
        'total_millimes', p_total - round(p_total::numeric * p_promo.discount_percent_bp / 10000)::bigint,
        'promotion', jsonb_build_object(
          'id', p_promo.id, 'label_ar', p_promo.label_ar, 'min_trees', p_promo.min_trees,
          'percent_bp', p_promo.discount_percent_bp,
          'before_millimes', p_total,
          'amount_millimes', round(p_total::numeric * p_promo.discount_percent_bp / 10000)::bigint))
  end
$$;

revoke execute on function app.apply_promotion(bigint, integer, public.tree_promotions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The Back Office's own doors
-- ---------------------------------------------------------------------------

create or replace function public.staff_save_promotion(p jsonb) returns public.tree_promotions
language plpgsql security definer set search_path = '' as $$
declare
  v_id   uuid := nullif(p->>'id', '')::uuid;
  v_row  public.tree_promotions;
  v_pct  integer := nullif(p->>'discount_percent_bp', '')::integer;
  v_unit bigint  := nullif(p->>'unit_price_millimes', '')::bigint;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(nullif(p->>'reason', ''));

  if (v_pct is null) = (v_unit is null) then
    raise exception 'promotion_needs_one_kind' using errcode = 'P0001',
      hint = 'Give the tier a percentage OR a price per tree, not both and not neither.';
  end if;

  insert into public.tree_promotions as t (
    id, label_ar, project_id, min_trees, max_trees, discount_percent_bp, unit_price_millimes,
    payment_mode, starts_on, ends_on, is_active, note_ar, updated_by
  ) values (
    coalesce(v_id, gen_random_uuid()),
    btrim(p->>'label_ar'),
    nullif(p->>'project_id', '')::uuid,
    (p->>'min_trees')::integer,
    nullif(p->>'max_trees', '')::integer,
    v_pct,
    v_unit,
    nullif(p->>'payment_mode', ''),
    nullif(p->>'starts_on', '')::date,
    nullif(p->>'ends_on', '')::date,
    coalesce((p->>'is_active')::boolean, true),
    nullif(btrim(coalesce(p->>'note_ar', '')), ''),
    auth.uid()
  )
  on conflict (id) do update set
    label_ar = excluded.label_ar,
    project_id = excluded.project_id,
    min_trees = excluded.min_trees,
    max_trees = excluded.max_trees,
    discount_percent_bp = excluded.discount_percent_bp,
    unit_price_millimes = excluded.unit_price_millimes,
    payment_mode = excluded.payment_mode,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    is_active = excluded.is_active,
    note_ar = excluded.note_ar,
    updated_by = auth.uid()
  returning * into v_row;

  return v_row;
end $$;

revoke execute on function public.staff_save_promotion(jsonb) from public, anon;
grant execute on function public.staff_save_promotion(jsonb) to authenticated;

create or replace function public.staff_delete_promotion(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.tree_promotions;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  delete from public.tree_promotions t where t.id = p_id returning * into v_row;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'label_ar', v_row.label_ar);
end $$;

revoke execute on function public.staff_delete_promotion(uuid, text) from public, anon;
grant execute on function public.staff_delete_promotion(uuid, text) to authenticated;
