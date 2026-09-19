-- bb · The olive tree becomes the unit of inventory (owner, 2026-09-18).
--
-- «the unit is a tree not m carre» · «with each tree comes the space of it» · «remove the pieces thing, its simply
-- selling the trees, but legally yes there is a piece — for our system it is not necessary» · «we just give each
-- tree a number or an id and associate it with the client» · «there is a minimum of trees to buy, it depends on
-- the offer».
--
-- So an offer holds N olive trees; every tree carries a number, a state and the person who holds it; a client asks
-- for a number of trees and the system says which ones. The area keeps following the tree, as it has since 0031:
-- one tree = one spacing class = area_m2, and app.tree_price prices it. Nothing here re-prices anything.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It is purely additive. public.parcels, public.parcel_status,
-- app.parcel_price, app.parcel_offered, public.public_parcels, public.public_coverage and public.million_progress
-- are not dropped, altered, renamed or read. Retiring the parcel layer is a later phase with its own tests; a
-- half-removed parcel layer would break the live site. Two facts make the two layers safe to hold at once today:
-- public.parcels has no rows at all, and nothing below joins to it, so trees and parcels cannot disagree about
-- a single figure. The counter keeps counting parcels (zero) until that later phase moves it to trees.
--
-- The two offers that exist today, for whoever applies this: OFF-TNAYEUR (tree_count 100, spacing
-- trad_wide_24x24 = 576 m²/tree) and OFF-AIRPORT (tree_count 500, spacing int_7x7 = 49 m²/tree), both published,
-- both on tree pricing. Applying this file changes neither of them: no tree row exists until someone runs
-- public.staff_generate_trees, and the stock RPC says so in as many words ('not_generated'), so an offer page
-- can tell «not materialised yet» apart from «sold out». That difference is the whole reason the payload carries
-- both trees_declared (the offer's tree_count) and trees_total (rows that exist).
--
-- STOCK IS A FACT, PRICE IS A PERMISSION. public.public_offer_stock is gated on the `projects` module alone,
-- through the same app.project_visible() every other public read uses. It never touches the `pricing` flag and
-- carries no money key at all — not the land price, the planting cost, the margin, project_costs, nor any
-- formula (PRJ-03). The four figures the owner named — إجمالي · المتاحة · المحجوزة · المباعة — are counts of rows.
--
-- TypeScript callers that MUST move in the same commit as this migration («npm run db:types» first; nothing
-- below compiles against the new names until it is run):
--   1. src/lib/supabase/database.types.ts        regenerate. projects gains min_trees_per_order and
--                                                tree_code_pattern; public.trees, public_offer_stock,
--                                                staff_offer_stock, staff_generate_trees, staff_allocate_trees
--                                                and staff_set_tree_state appear.
--   2. src/lib/errors.ts                         Arabic messages for the new codes, each saying how to fix it:
--                                                below_min_trees, not_enough_trees, offer_has_no_trees,
--                                                trees_taken_below_count, duplicate_tree_code, invalid_tree_state,
--                                                invalid_tree_selection, invalid_person, invalid_request.
--                                                Without them intakeErrorMessage() falls back to «تعذّر إرسال
--                                                الطلب», which tells a visitor who asked for 3 trees of a 10-tree
--                                                minimum nothing at all.
--   3. src/app/(public)/projects/[code]/offer-actions.ts   send wants_visit in the RPC payload (it sends none
--                                                today, which is the whole reason §8 below exists), and pass the
--                                                minimum to the form.
--   4. src/app/(public)/projects/[code]/offer-interest-form.tsx  the «نحب نزور الأرض» answer, and min= on the
--                                                tree input from public_offer_stock.min_trees with the
--                                                offers.min_trees_hint copy.
--   5. src/app/(public)/projects/[code]/page.tsx  read public_offer_stock and show the four counts under the
--                                                offers.stock_* labels. Show nothing when status is
--                                                'not_generated' — an offer whose trees are not materialised has
--                                                no stock to state, and «0 متاحة» would be a lie.
--   6. src/app/admin/(panel)/projects/[id]/…      Back Office: min_trees_per_order and tree_code_pattern on the
--                                                offer card, a «توليد الزيتونات» button on staff_generate_trees
--                                                with its reason field, and the allocation screen.
--
-- Deliberately not applied and not numbered: migration numbers are claimed at apply time. When it is applied,
-- rename this file to supabase/migrations/00NN_trees.sql and its test to supabase/tests/0NN_trees.sql, with the
-- number in the first line of each, the way 0038 was.
--
-- COLLISION TO SETTLE BEFORE EITHER IS APPLIED. An uncommitted supabase/migrations/0051_offer_visit.sql exists in
-- this working tree and redefines public.submit_offer_request for the same reason §8 below does: to record
-- wants_visit. It does not carry the minimum. Both files are a full `create or replace` of the one function, so
-- the last one applied wins outright — and if 0051 runs after this file, below_min_trees silently disappears and
-- an offer that sells ten trees at a time starts taking requests for one again, with nothing failing to say so.
-- Settle it one of two ways: apply 0051 first and this file after it (this body is 0049's plus both changes, so
-- nothing of 0051 is lost), or drop §8 from this file and add the four lines of the minimum to 0051 instead.
-- What must not happen is applying them in the other order, or applying both and assuming they merged.

-- ---------------------------------------------------------------------------
-- 1 · Who may touch the tree inventory
-- ---------------------------------------------------------------------------

-- Materialising, renumbering or releasing trees is stock keeping, not a sale: the agricultural manager does it,
-- Finance and Admin may too. A commercial never creates or destroys inventory.
create or replace function app.can_manage_trees() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_any_role(array['agri_manager', 'finance', 'admin', 'super_admin']::public.app_role[])
$$;
revoke execute on function app.can_manage_trees() from public, anon, authenticated;

-- Marking a tree sold is the contract moment (§51), so it stays with Legal, Finance and Admin. A commercial may
-- reserve for their own file and no more.
create or replace function app.can_contract_trees() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_any_role(array['legal', 'finance', 'admin', 'super_admin']::public.app_role[])
$$;
revoke execute on function app.can_contract_trees() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · The smallest basket an offer sells, and how its trees are numbered
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists min_trees_per_order integer,
  add column if not exists tree_code_pattern   text;

-- A minimum larger than the offer itself would make it unsellable, so the two columns are checked together.
alter table public.projects drop constraint if exists projects_min_trees_check;
alter table public.projects
  add constraint projects_min_trees_check check (
    min_trees_per_order is null
    or (min_trees_per_order >= 1
        and (tree_count is null or tree_count = 0 or min_trees_per_order <= tree_count)));

-- {seq} is what makes a code unique inside an offer; a pattern without it would number every tree the same.
alter table public.projects drop constraint if exists projects_tree_code_pattern_check;
alter table public.projects
  add constraint projects_tree_code_pattern_check check (
    tree_code_pattern is null
    or (tree_code_pattern like '%{seq}%' and char_length(tree_code_pattern) between 5 and 60));

comment on column public.projects.min_trees_per_order is
  'Smallest number of trees this offer sells in one order (owner: «there is a minimum of trees to buy, it depends on the offer»). Null inherits the setting offers.min_trees_default. Never above tree_count.';
comment on column public.projects.tree_code_pattern is
  'How this offer numbers its trees, e.g. «{offer}-{seq}» → OFF-TNAYEUR-0042. {offer} is the offer code, {seq} the sequence padded to offers.tree_code_digits. Null inherits the setting offers.tree_code_pattern. A tree keeps the code it was given, so editing this never renames a tree that is already allocated.';

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('offers.min_trees_default', to_jsonb(1), 'integer', 'projects',
   'أقلّ عدد زيتونات في الطلب (الافتراضي)',
   'أصغر عدد زيتونات ينجم الحريف يطلبهم من عرض ما عندوش عدد خاص بيه. كل عرض ينجم يحدّد عدده في صفحته وهو اللي يغلب. أقل قيمة مقبولة: 1.',
   true, 560),

  ('offers.min_trees_hint', to_jsonb('أقلّ عدد في هذا العرض: {min} زيتونة.'::text), 'text', 'projects',
   'ملاحظة أقلّ عدد زيتونات',
   'تظهر تحت خانة عدد الزيتونات في استمارة العرض. {min} تتبدّل بأقلّ عدد في العرض. فارغة = ما تظهرش.', true, 561),
  ('offers.min_trees_hint_fr', to_jsonb('Minimum pour cette offre : {min} oliviers.'::text), 'text', 'projects',
   'ملاحظة أقلّ عدد زيتونات بالفرنسية', 'نفس الملاحظة بالفرنسية.', true, 562),

  ('offers.stock_title', to_jsonb('الزيتونات في هذا العرض'::text), 'text', 'projects',
   'عنوان خانة الزيتونات المتوفّرة',
   'العنوان فوق أرقام الزيتونات في صفحة العرض. فارغ = تتخبّى الأرقام الكل.', true, 563),
  ('offers.stock_title_fr', to_jsonb('Les oliviers de cette offre'::text), 'text', 'projects',
   'عنوان خانة الزيتونات بالفرنسية', 'نفس العنوان بالفرنسية.', true, 564),

  ('offers.stock_total_label', to_jsonb('إجمالي الزيتونات'::text), 'text', 'projects',
   'عنوان رقم «إجمالي الزيتونات»', 'عدد زيتونات العرض الكل. فارغ = يتخبّى الرقم.', true, 565),
  ('offers.stock_total_label_fr', to_jsonb('Total des oliviers'::text), 'text', 'projects',
   'عنوان «إجمالي الزيتونات» بالفرنسية', 'نفس العنوان بالفرنسية.', true, 566),

  ('offers.stock_available_label', to_jsonb('المتاحة'::text), 'text', 'projects',
   'عنوان رقم «الزيتونات المتاحة»', 'الزيتونات اللي مازالت ما حجزهاش حد. فارغ = يتخبّى الرقم.', true, 567),
  ('offers.stock_available_label_fr', to_jsonb('Disponibles'::text), 'text', 'projects',
   'عنوان «المتاحة» بالفرنسية', 'نفس العنوان بالفرنسية.', true, 568),

  ('offers.stock_reserved_label', to_jsonb('المحجوزة'::text), 'text', 'projects',
   'عنوان رقم «الزيتونات المحجوزة»', 'الزيتونات المحجوزة لحرفاء قبل إمضاء العقد. فارغ = يتخبّى الرقم.', true, 569),
  ('offers.stock_reserved_label_fr', to_jsonb('Réservés'::text), 'text', 'projects',
   'عنوان «المحجوزة» بالفرنسية', 'نفس العنوان بالفرنسية.', true, 570),

  ('offers.stock_sold_label', to_jsonb('المباعة'::text), 'text', 'projects',
   'عنوان رقم «الزيتونات المباعة»', 'الزيتونات اللي تعاقدنا عليها. فارغ = يتخبّى الرقم.', true, 571),
  ('offers.stock_sold_label_fr', to_jsonb('Vendus'::text), 'text', 'projects',
   'عنوان «المباعة» بالفرنسية', 'نفس العنوان بالفرنسية.', true, 572),

  ('offers.tree_code_pattern', to_jsonb('{offer}-{seq}'::text), 'text', 'projects',
   'صيغة رقم الزيتونة (الافتراضية)',
   'كيفاش يتسمّى رقم كل زيتونة. {offer} = رمز العرض، {seq} = ترتيب الزيتونة بأصفار على اليسار. لازم تحتوي على {seq}. مثال: {offer}-{seq} تعطي OFF-TNAYEUR-0042. كل عرض ينجم يحدّد صيغته الخاصة.',
   false, 573),
  ('offers.tree_code_digits', to_jsonb(4), 'integer', 'projects',
   'عدد خانات رقم الزيتونة',
   'قدّاش من رقم في {seq}. 4 تعطي 0042. من 1 إلى 9. تبديلها يمسّ الزيتونات الجداد برك: الزيتونة تحتفظ برقمها.',
   false, 574)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3 · Resolving the minimum and the code, offer first then the global setting (the 0031 inheritance)
-- ---------------------------------------------------------------------------

-- Capped by the offer's own tree_count so a global minimum can never exceed a small offer: the column check
-- guards the offer's own value, this guards the inherited one.
create or replace function app.offer_min_trees(p_project uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when coalesce(pj.tree_count, 0) > 0 then least(m.v, pj.tree_count) else m.v end
  from public.projects pj
  cross join lateral (
    select greatest(1, coalesce(pj.min_trees_per_order, app.setting_int('offers.min_trees_default', 1))) as v
  ) m
  where pj.id = p_project
$$;
revoke execute on function app.offer_min_trees(uuid) from public, anon, authenticated;

-- The offer's pattern, then the setting, then the built-in shape. A stored pattern that lost its {seq} (the
-- setting has no column check to lean on) falls back rather than numbering every tree the same.
create or replace function app.offer_tree_code_pattern(p_project uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p like '%{seq}%' then p else '{offer}-{seq}' end
  from (
    select coalesce(
             (select pj.tree_code_pattern from public.projects pj where pj.id = p_project),
             app.setting_text('offers.tree_code_pattern', '{offer}-{seq}')) as p
  ) x
$$;
revoke execute on function app.offer_tree_code_pattern(uuid) from public, anon, authenticated;

-- {offer} is replaced before {seq}, so an offer code is never scanned for placeholders of its own.
create or replace function app.tree_code(p_offer_code text, p_seq integer, p_pattern text, p_digits integer)
returns text
language sql immutable set search_path = '' as $$
  select replace(
           replace(p_pattern, '{offer}', coalesce(p_offer_code, '')),
           '{seq}', lpad(p_seq::text, greatest(1, least(coalesce(p_digits, 4), 9)), '0'))
$$;
revoke execute on function app.tree_code(text, integer, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · The tree
-- ---------------------------------------------------------------------------

-- Its own type, not a value added to public.parcel_status: 0021 hit the rule that a value added to an existing
-- enum cannot be used in the transaction that adds it, and a tree is not a parcel — it has no area of its own to
-- state, no card, no price column. Three states are all that exists today:
--   available  nobody holds it — it is what public_offer_stock counts as «المتاحة»
--   reserved   held for a person before the contract («المحجوزة»)
--   sold       contracted to a person («المباعة»)
-- A fourth state was considered and left out. 'contracting' (the parcel layer's «في طور التعاقد») would split
-- «المباعة» in two and the owner named four figures, not five; 'planted' belongs to the offer, not to one tree,
-- and public.million_progress already reads it from the project status ('operating'); 'withdrawn' would say a
-- tree is out of the inventory, which in a phase where an offer's trees are generated from tree_count means
-- lowering tree_count and regenerating. Add one when a screen needs it, with the reason in the migration.
create type public.tree_state as enum ('available', 'reserved', 'sold');

comment on type public.tree_state is
  'State of one olive tree: available, reserved (held for a person), sold (contracted). Codes are stable; labels live in settings (offers.stock_*). Not public.parcel_status: the parcel layer keeps its own seven states.';

create table public.trees (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id),
  -- The tree's number inside its offer: 1..tree_count, dense, and the order allocation hands them out in.
  seq           integer not null check (seq >= 1),
  -- What a human reads and what a contract names, e.g. OFF-TNAYEUR-0042. Written once at generation from the
  -- offer's pattern and never recomputed: a tree already promised to a client must not change its name.
  code          text not null check (char_length(btrim(code)) between 1 and 80),
  state         public.tree_state not null default 'available',
  held_by       uuid references public.persons (id),
  request_id    uuid references public.interest_requests (id),
  allocated_at  timestamptz,
  note          text check (note is null or char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id),
  unique (project_id, seq),
  unique (project_id, code),
  -- A held tree always says who holds it and since when; a free tree holds nothing. The request is optional:
  -- a client the commercial met without any form has no interest_request to point at.
  constraint trees_holder_check check (
    (state = 'available' and held_by is null and request_id is null and allocated_at is null)
    or (state <> 'available' and held_by is not null and allocated_at is not null))
);

-- One index serves both readers: the stock counts per offer and state, and the allocation picks the lowest
-- available seq of one offer.
create index trees_project_state_seq_idx on public.trees (project_id, state, seq);
create index trees_holder_idx on public.trees (held_by) where held_by is not null;
create index trees_request_idx on public.trees (request_id) where request_id is not null;

create trigger trees_stamp before update on public.trees
  for each row execute function app.stamp_updated();

-- Update and delete only, on purpose (§51 asks who changed what, when and why). Generating 500 identical blank
-- trees is one act, not 500, and is logged once as 'trees.generate' with its counts; an allocation or a release
-- changes a named tree's holder and is worth a row each.
create trigger trees_audit after update or delete on public.trees
  for each row execute function app.audit_row_change();

comment on table public.trees is
  'One olive tree of an offer (owner, 2026-09-18: «we just give each tree a number or an id and associate it with the client»). The unit of inventory: an offer holds tree_count of them, a client buys a number and the system assigns which. Area and price stay with the offer''s spacing class (0031); this table holds no money. Written only through staff_generate_trees, staff_allocate_trees and staff_set_tree_state.';
comment on column public.trees.seq is
  'The tree''s number inside its offer, 1..projects.tree_count. Allocation always takes the lowest available one, so a client gets a contiguous block whenever the offer has not been fragmented.';
comment on column public.trees.code is
  'Human code, unique inside the offer, rendered at generation from the offer''s tree_code_pattern. Never recomputed afterwards.';
comment on column public.trees.held_by is
  'The person who holds this tree (reserved) or owns it (sold). Empty while it is available.';
comment on column public.trees.request_id is
  'The demand that led to this allocation, when there was one. Empty for a client who never filled a form.';

-- Supabase hands anon and authenticated ALL on a new table, so the revoke comes first and the grant is the
-- narrow one: visitors never read trees (they read counts through public_offer_stock), staff read the rows,
-- and nobody writes except through the security-definer RPCs below, which run as the owner and bypass RLS.
-- A client reading their own trees belongs to the client area, which does not exist yet: persons.profile_id is
-- written nowhere, so a self-read policy today would be a policy that can never match.
alter table public.trees enable row level security;
revoke all on public.trees from anon, authenticated;
grant select on public.trees to authenticated;

create policy trees_select on public.trees for select to authenticated
  using ((select app.is_staff()));

-- ---------------------------------------------------------------------------
-- 5 · Generation: materialise an offer's trees, idempotently
-- ---------------------------------------------------------------------------

-- Running it twice adds nothing: it inserts only the sequence numbers that are missing, so it is equally the
-- «create the trees» button and the «tree_count grew from 100 to 150» button.
--
-- WHEN tree_count IS REDUCED. Trees numbered above the new count are surplus. If any of them is reserved or
-- sold, the function refuses with trees_taken_below_count and changes nothing: a sold tree is a client's tree
-- and no Back Office edit may delete it — lower the count to at least that tree's number, or release it first.
-- If every surplus tree is still available, they are deleted, because a tree nobody was ever promised is not a
-- record of anything and leaving it would make the stock contradict the offer. Both paths are audited.
create or replace function public.staff_generate_trees(p_project uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pj      public.projects;
  v_pattern text;
  v_digits  integer := greatest(1, least(app.setting_int('offers.tree_code_digits', 4), 9));
  v_target  integer;
  v_before  integer;
  v_taken   integer;
  v_removed integer := 0;
  v_added   integer := 0;
  v_after   integer;
  v_first   text;
  v_last    text;
begin
  if not app.can_manage_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- The offer row lock serialises two generators and any concurrent edit of tree_count; «no key update» leaves
  -- the foreign keys of other tables free.
  select * into v_pj from public.projects pj where pj.id = p_project for no key update;
  if not found then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;

  -- Resolved once, under the lock: every tree generated by this call is numbered the same way.
  v_pattern := app.offer_tree_code_pattern(p_project);
  v_target  := coalesce(v_pj.tree_count, 0);
  if v_target < 1 then
    raise exception 'offer_has_no_trees' using errcode = 'P0001';
  end if;

  select count(*)::integer, (count(*) filter (where t.state <> 'available'))::integer
  into v_before, v_taken
  from public.trees t
  where t.project_id = p_project;

  if v_target < v_before then
    if exists (select 1 from public.trees t
               where t.project_id = p_project and t.seq > v_target and t.state <> 'available') then
      raise exception 'trees_taken_below_count' using errcode = 'P0001';
    end if;
    delete from public.trees t where t.project_id = p_project and t.seq > v_target;
    get diagnostics v_removed = row_count;
  end if;

  begin
    insert into public.trees (project_id, seq, code)
    select p_project, s.seq, app.tree_code(v_pj.code, s.seq, v_pattern, v_digits)
    from generate_series(1, v_target) as s(seq)
    where not exists (select 1 from public.trees t where t.project_id = p_project and t.seq = s.seq)
    on conflict (project_id, seq) do nothing;
    get diagnostics v_added = row_count;
  exception when unique_violation then
    -- Only (project_id, code) is left: the pattern was edited into codes that collide with trees already there.
    raise exception 'duplicate_tree_code' using errcode = 'P0001';
  end;

  -- Read back in tree order, not in code order: a pattern edited between two generations would make the
  -- alphabetical first code a different tree from tree number one.
  select count(*)::integer into v_after from public.trees t where t.project_id = p_project;
  select t.code into v_first from public.trees t where t.project_id = p_project order by t.seq limit 1;
  select t.code into v_last from public.trees t where t.project_id = p_project order by t.seq desc limit 1;

  perform app.write_audit('trees.generate', 'trees', p_project::text,
                          jsonb_build_object('offer_code', v_pj.code, 'trees', v_before, 'trees_taken', v_taken),
                          jsonb_build_object('offer_code', v_pj.code, 'tree_count', v_target, 'trees', v_after,
                                             'added', v_added, 'removed', v_removed, 'pattern', v_pattern),
                          null);

  return jsonb_build_object(
    'project_id', p_project, 'offer_code', v_pj.code, 'tree_count', v_target,
    'trees', v_after, 'added', v_added, 'removed', v_removed,
    'first_code', v_first, 'last_code', v_last, 'pattern', v_pattern);
end $$;

revoke execute on function public.staff_generate_trees(uuid, text) from public, anon;
grant execute on function public.staff_generate_trees(uuid, text) to authenticated;

comment on function public.staff_generate_trees(uuid, text) is
  'Materialises an offer''s trees up to projects.tree_count, numbered 1..tree_count with the offer''s code pattern. Idempotent: it inserts only the missing numbers, so it also grows an offer. Refuses to remove a reserved or sold tree when tree_count is lowered (trees_taken_below_count); deletes surplus available ones. Agri manager, Finance and Admin, with a reason (§51).';

-- ---------------------------------------------------------------------------
-- 6 · Stock: the four figures the owner named, counted from trees
-- ---------------------------------------------------------------------------

-- Counts only. No price, no formula, no internal figure, so this is safe under the `projects` module alone and
-- must never be put behind `pricing`: a visitor is allowed to know an offer is sold out while prices are closed.
create or replace function app.offer_stock_payload(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pj       public.projects;
  v_total    integer;
  v_free     integer;
  v_held     integer;
  v_sold     integer;
  v_declared integer;
begin
  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    return null;
  end if;

  select count(*)::integer,
         (count(*) filter (where t.state = 'available'))::integer,
         (count(*) filter (where t.state = 'reserved'))::integer,
         (count(*) filter (where t.state = 'sold'))::integer
  into v_total, v_free, v_held, v_sold
  from public.trees t
  where t.project_id = p_project;

  v_declared := nullif(coalesce(v_pj.tree_count, 0), 0);

  return jsonb_build_object(
    'project_id', v_pj.id,
    'project_code', v_pj.code,
    -- What the offer says it holds, and what actually exists as rows. A page shows the four counts only when
    -- status is 'ok'; 'not_generated' means nobody has run staff_generate_trees yet and the stock is unknown,
    -- not empty. 'partial' means the two disagree — the Back Office has to regenerate.
    'trees_declared', v_declared,
    'trees_total', v_total,
    'trees_available', v_free,
    'trees_reserved', v_held,
    'trees_sold', v_sold,
    'min_trees', app.offer_min_trees(p_project),
    'status', case
                when v_total = 0 then 'not_generated'
                when v_declared is not null and v_total <> v_declared then 'partial'
                else 'ok'
              end);
end $$;
revoke execute on function app.offer_stock_payload(uuid) from public, anon, authenticated;

create or replace function public.public_offer_stock(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status public.project_status;
begin
  -- The same gate as public_project_quote: the `projects` module and the offer's own status decide, and staff
  -- previewing an internal module still read. The `pricing` flag has no say here — a count is not a price.
  select pj.status into v_status from public.projects pj where pj.id = p_project;
  if not found or not app.project_visible(v_status) then
    return null;
  end if;
  return app.offer_stock_payload(p_project);
end $$;

create or replace function public.staff_offer_stock(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app.offer_stock_payload(p_project);
end $$;

revoke execute on function public.public_offer_stock(uuid) from public;
grant execute on function public.public_offer_stock(uuid) to anon, authenticated;
revoke execute on function public.staff_offer_stock(uuid) from public, anon;
grant execute on function public.staff_offer_stock(uuid) to authenticated;

comment on function public.public_offer_stock(uuid) is
  'The olive trees of one offer as four counts (owner: إجمالي · المتاحة · المحجوزة · المباعة), plus the smallest basket it sells. Counts only: never a price, a cost, a margin or any formula (PRJ-03), so it is gated on the `projects` module alone and never on `pricing` — stock is a fact. Null unless app.project_visible(). status: ''not_generated'' (no tree row yet, the stock is unknown), ''partial'' (rows disagree with tree_count) or ''ok''.';
comment on function public.staff_offer_stock(uuid) is
  'Back Office twin of public_offer_stock, for any staff, without the module gate or the published-only rule.';

-- ---------------------------------------------------------------------------
-- 7 · Allocation: N trees of an offer to a person, atomically
-- ---------------------------------------------------------------------------

-- The engine. No role check: the callers gate (staff_allocate_trees does).
--
-- CONCURRENCY. The picked rows are locked with FOR UPDATE SKIP LOCKED, so two sessions asking for the last
-- trees at the same moment never see the same row: the second session skips what the first holds and takes the
-- next ones, or finds fewer than it asked for and the whole call is rolled back by the exception below. Plain
-- FOR UPDATE would make the second session wait and then take rows the first has just allocated (it re-reads
-- the row after the lock), so SKIP LOCKED is the correctness requirement here, not an optimisation. Everything
-- happens in one statement inside one transaction: PostgREST wraps each RPC call in its own, so either every
-- tree asked for is allocated or none is — a half-allocation cannot exist.
create or replace function app.allocate_offer_trees(
  p_project uuid, p_person uuid, p_request uuid, p_trees integer, p_state public.tree_state
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pj    public.projects;
  v_min   integer;
  v_ids   uuid[];
  v_codes text[];
  v_n     integer;
begin
  if p_state = 'available' then
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end if;

  select * into v_pj from public.projects pj where pj.id = p_project;
  if not found then
    raise exception 'offer_not_available' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.persons ps where ps.id = p_person and ps.archived_at is null) then
    raise exception 'invalid_person' using errcode = 'P0001';
  end if;
  -- A demand may only be attached to trees of the offer it named, and to its own person.
  if p_request is not null and not exists (
       select 1 from public.interest_requests r
       where r.id = p_request and r.person_id = p_person
         and (r.project_id is null or r.project_id = p_project)) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  v_min := app.offer_min_trees(p_project);
  if p_trees is null or p_trees < 1 or p_trees < v_min then
    raise exception 'below_min_trees' using errcode = 'P0001';
  end if;

  with picked as (
    select t.id
    from public.trees t
    where t.project_id = p_project and t.state = 'available'
    order by t.seq
    limit p_trees
    for update skip locked
  ), done as (
    update public.trees t
    set state = p_state, held_by = p_person, request_id = p_request, allocated_at = now()
    from picked
    where t.id = picked.id
    returning t.id, t.seq, t.code
  )
  select array_agg(d.id order by d.seq), array_agg(d.code order by d.seq)
  into v_ids, v_codes
  from done d;

  v_n := coalesce(cardinality(v_ids), 0);
  if v_n < p_trees then
    -- Raising undoes the update above: the offer is left exactly as it was, and the caller is told the stock
    -- moved under them rather than silently given fewer trees than the client asked for.
    raise exception 'not_enough_trees' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'project_id', p_project, 'offer_code', v_pj.code, 'person_id', p_person, 'request_id', p_request,
    'state', p_state::text, 'trees', v_n,
    'first_code', v_codes[1], 'last_code', v_codes[v_n], 'tree_ids', to_jsonb(v_ids));
end $$;
revoke execute on function app.allocate_offer_trees(uuid, uuid, uuid, integer, public.tree_state)
  from public, anon, authenticated;

create or replace function public.staff_allocate_trees(
  p_project uuid, p_person uuid, p_request uuid, p_trees integer, p_state text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_state public.tree_state;
  v_out   jsonb;
begin
  -- A commercial allocates only inside their own file (COM-05, app.can_see_person); contracting is Legal,
  -- Finance and Admin (§51).
  if not (app.is_staff() and app.can_see_person(p_person)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    v_state := coalesce(nullif(btrim(coalesce(p_state, '')), ''), 'reserved')::public.tree_state;
  exception when invalid_text_representation then
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end;

  if v_state = 'sold' and not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  v_out := app.allocate_offer_trees(p_project, p_person, p_request, p_trees, v_state);

  perform app.write_audit('trees.allocate', 'trees', p_project::text, null, v_out, null);
  return v_out;
end $$;

revoke execute on function public.staff_allocate_trees(uuid, uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.staff_allocate_trees(uuid, uuid, uuid, integer, text, text) to authenticated;

comment on function public.staff_allocate_trees(uuid, uuid, uuid, integer, text, text) is
  'Takes p_trees trees of an offer for a person and, optionally, the demand that asked for them: the lowest-numbered available ones, all of them or none (FOR UPDATE SKIP LOCKED). p_state is ''reserved'' (default) or ''sold''. Refuses below the offer''s minimum (below_min_trees) and when fewer are available (not_enough_trees). Staff, limited to files they may see; ''sold'' needs Legal, Finance or Admin. Reason required (§51).';

-- Beyond the six items of the task, and on purpose: without it a reservation is a one-way door. authenticated
-- holds no update grant on public.trees, so a reserved tree could never go back on sale, and a wrong click
-- would be permanent. Same role rules read from the other side.
create or replace function public.staff_set_tree_state(p_tree_ids uuid[], p_state text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_state public.tree_state;
  v_ids   uuid[];
  v_old   jsonb;
  v_new   jsonb;
  v_n     integer;
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    v_state := nullif(btrim(coalesce(p_state, '')), '')::public.tree_state;
  exception when invalid_text_representation then
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end;
  if v_state is null then
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_tree_ids, '{}'::uuid[])) x
  where x is not null;
  -- Bounded so one call cannot lock the whole inventory; a bigger correction is several calls, each with a reason.
  if cardinality(v_ids) < 1 or cardinality(v_ids) > 1000 then
    raise exception 'invalid_tree_selection' using errcode = 'P0001';
  end if;

  -- Releasing is stock keeping; contracting is the contract moment.
  if v_state = 'available' and not app.can_manage_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_state = 'sold' and not app.can_contract_trees() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  -- Locked in id order so two staff acting on overlapping selections queue instead of deadlocking.
  perform 1 from public.trees t where t.id = any (v_ids) order by t.id for update;

  select jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'state', t.state,
                                      'held_by', t.held_by, 'request_id', t.request_id)
                   order by t.project_id, t.seq)
  into v_old
  from public.trees t
  where t.id = any (v_ids);

  -- Every id must exist, or the caller is acting on a set other than the one they chose and the reason they
  -- wrote describes something else.
  if v_old is null or jsonb_array_length(v_old) <> cardinality(v_ids) then
    raise exception 'invalid_tree_selection' using errcode = 'P0001';
  end if;
  -- The caller must be allowed to see every file involved, exactly as in staff_allocate_trees.
  if exists (select 1 from public.trees t
             where t.id = any (v_ids) and t.held_by is not null and not app.can_see_person(t.held_by)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Reserving or selling needs a holder, and this function moves states, it does not hand out trees.
  if v_state <> 'available' and exists (
       select 1 from public.trees t where t.id = any (v_ids) and t.held_by is null) then
    raise exception 'invalid_tree_state' using errcode = 'P0001';
  end if;

  update public.trees t
  set state = v_state,
      held_by = case when v_state = 'available' then null else t.held_by end,
      request_id = case when v_state = 'available' then null else t.request_id end,
      allocated_at = case when v_state = 'available' then null
                          when t.allocated_at is null then now() else t.allocated_at end
  where t.id = any (v_ids);
  get diagnostics v_n = row_count;

  select jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'state', t.state,
                                      'held_by', t.held_by, 'request_id', t.request_id)
                   order by t.project_id, t.seq)
  into v_new
  from public.trees t
  where t.id = any (v_ids);

  perform app.write_audit('trees.set_state', 'trees', null, v_old, v_new, null);
  return jsonb_build_object('trees', v_n, 'state', v_state::text);
end $$;

revoke execute on function public.staff_set_tree_state(uuid[], text, text) from public, anon;
grant execute on function public.staff_set_tree_state(uuid[], text, text) to authenticated;

comment on function public.staff_set_tree_state(uuid[], text, text) is
  'Moves named trees to another state: ''available'' releases them and clears the holder, the demand and the date; ''reserved'' and ''sold'' keep the holder they already have. Staff, limited to the files they may see; releasing needs Agri manager, Finance or Admin, contracting needs Legal, Finance or Admin. Reason required (§51). Handing trees out is staff_allocate_trees, not this.';

-- ---------------------------------------------------------------------------
-- 8 · The offer intake: the minimum it sells, and the visit the visitor asked for
-- ---------------------------------------------------------------------------

-- The body below is 0049's, copied as it stands. Three things change and nothing else:
--
--   (a) THE MINIMUM. 0049 accepts «1..tree_count». An offer that sells trees ten at a time would take a request
--       for one tree and the commercial would find out on the phone. app.offer_min_trees now sets the floor, and
--       the same function the form reads through public_offer_stock.min_trees enforces it, so the page and the
--       database can never disagree about the smallest basket.
--
--   (b) THE VISIT. `wants_visit` was parsed nowhere and written nowhere in this intake, so «نحب نزور الأرض» on
--       an offer page recorded nothing — the column has existed since 0030 and the CRM already filters, shows
--       and exports it. It is read exactly as submit_interest_request reads it (a real JSON boolean; anything
--       else stays empty, which means «did not answer», not «no»).
--
--   (c) NOT ALLOCATING. The intake deliberately does NOT call app.allocate_offer_trees, and this is the whole
--       argument for it. An interest request is not a sale: the offer form says so in the copy the owner
--       approved («التسجيل مجاني ولا يلزمك بالشراء», offers.form_intro). The form is anonymous, service-role,
--       rate-limited to three requests per phone per day and ten per IP per hour — that is a door wide enough
--       for one curious visitor to reserve an entire hundred-tree offer in three submissions and leave the real
--       clients looking at «0 متاحة». Reserving is a decision a human takes after speaking to the person, and it
--       has a name: staff_allocate_trees, with a role, a reason and an audit row. What the intake does record is
--       the ask — offer_trees, with the offer, the price of the day and now the visit — and the commercial turns
--       it into a reservation from the CRM, passing this request's id so the trees point back at the demand
--       that asked for them. For the same reason the intake still accepts an ask larger than what is left in
--       stock: a lead for 100 trees when 95 are sold is a lead, not an error, and the commercial sells what
--       remains. Should the owner later want the form itself to hold the trees for, say, 48 hours, the engine
--       is already here and the change is one call plus a release job — not a redesign.

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
  -- Read exactly as submit_interest_request reads it (0030): a real JSON boolean, or empty for «did not answer».
  v_wants_visit boolean := case when jsonb_typeof(p->'wants_visit') = 'boolean' then (p->>'wants_visit')::boolean end;
  v_channel     public.contact_channel;
  v_time        public.option_items;
  v_project     public.projects;
  v_trees       integer;
  v_min_trees   integer;
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
    -- The visit the offer page asked about (report v3 §40). The column, its CRM filter, its lead page row and
    -- its CSV cell have existed since 0030; only this intake never wrote it.
    wants_visit,
    contact_channel, contact_time_option_id, contact_time_label_ar,
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
end $$;

revoke execute on function public.submit_offer_request(jsonb) from public, anon, authenticated;
grant execute on function public.submit_offer_request(jsonb) to service_role;

comment on function public.submit_offer_request(jsonb) is
  'Intake of one offer page (0049): identity like submit_interest_request, a visible offer, trees between the '
  'offer''s minimum (app.offer_min_trees) and its tree_count, the visitor''s answer about visiting the land, '
  'and the offer''s own price and yearly fee snapshotted from app.project_quote_payload. Records the demand '
  'only: it allocates no tree, because an interest request is not a sale — reserving is staff_allocate_trees. '
  'Server-side only.';
