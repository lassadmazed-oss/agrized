## 08. INVENTORY, MATCHING, RESERVATIONS AND CONTRACTS

Scope: sections 9 (lots / parcels / inventory), 10 (matching), 17 (reservations), 18 (contracts and
ownership). Everything below was read from `supabase/migrations/0001…0050`, `supabase/tests/001…031`,
`src/lib`, `src/components`, `src/app/admin` and `src/app/(public)`.

**Working-tree caveat.** Another process was editing files under `src/app/(public)/` while this was
written. `src/app/(public)/projects/page.tsx` (457 lines), `src/app/(public)/projects/[code]/page.tsx`
(511 lines) and `src/app/(public)/projects/[code]/[parcel]/page.tsx` (230 lines) all read as complete,
balanced files and are described as read. Nothing under `supabase/`, `src/lib/`, `src/components/` or
`src/app/admin/` was being edited.

---

### THE FOUR PLAIN ANSWERS

| Question | Answer in the code |
|---|---|
| Does a project contain parcels? | Yes. `public.parcels.project_id` → `public.projects.id`, `unique (project_id, code)`. A project may also have **zero** parcels and still be sold — several screens handle that case explicitly. |
| Can a parcel hold several trees? | Yes, as an **integer column**: `public.parcels.olive_tree_count`. On a project that lists spacing classes the parcel's area is *derived* from that count (`area_m2 = olive_tree_count × class area`). |
| Can a customer reserve one? | **No.** There is no reservation anywhere in the repository — no table, no RPC, no server action, no route, no column. A customer can only send an interest request, which changes nothing about any parcel. |
| Is availability tracked? | Only as `public.parcels.status` (an enum on the parcel row), summed on the fly. There is no stock ledger, no quantity counter, no hold, no decrement. |
| Are trees individual rows or only counts? | **Only counts.** `parcels.olive_tree_count integer` and `projects.tree_count integer`. There is no per-tree table anywhere in `supabase/migrations`. |
| How are available / reserved / sold represented? | Values of the `public.parcel_status` enum on the parcel row, mapped to three buckets in TypeScript and summed over `olive_tree_count`. |

---

## 9. LOTS / PARCELS / INVENTORY

### 9.1 The two tables

**`public.projects`** — created in `supabase/migrations/0012_projects_and_parcels.sql`, extended by
`0023_project_page_v3.sql`. In the Back Office and on the site it is now called **«العرض»** (the offer);
the table name never changed. Columns that matter for inventory:

| Column | Type / rule | Note |
|---|---|---|
| `code` | `text not null unique` | e.g. `SFX-01`, validated in the Server Action against `/^[A-Z0-9][A-Z0-9-]{1,20}$/` |
| `governorate_id` | `smallint not null` | |
| `total_area_m2` | `numeric(12,2) check (> 0)` | typed by staff |
| `tree_count` | `integer check (>= 0)` | the offer's declared tree total, typed by staff |
| `status` | `public.project_status not null default 'draft'` | |
| `pricing` | `jsonb not null default '{}'` | legacy installment formula |
| `annual_costs_millimes` | `bigint` | |
| `plan_storage_path`, `legal_notes` | `text` | never public |
| `land_offer_id` | `uuid references public.land_offers(id)` | link back to the landowner intake |
| `description_ar`, `water_available`, `water_note`, `access_note`, `video_url`, `show_location`, `document_option_ids uuid[]`, `service_option_ids uuid[]` | added by `0023` | the public project page |

`public.project_status` (0012): `'draft'`, `'preparing'`, `'internal'`, `'published'`, `'sold_out'`,
`'operating'`, `'archived'`. Arabic labels are in `src/lib/projects.ts` `PROJECT_STATUS_LABELS`:
`مسودة`, `قيد التحضير`, `جاهز (داخلي)`, `منشور`, `مكتمل البيع`, `في طور الاستغلال`, `مؤرشف`.

**`public.parcels`** — the lot. Created in `0012`, one column added by `0034_project_quote.sql`.

| Column | Type / rule |
|---|---|
| `project_id` | `uuid not null references public.projects (id)` |
| `code` | `text not null`, `unique (project_id, code)` |
| `area_m2` | `numeric(12,2) not null check (> 0)` |
| `property_type` | `text not null check (in ('bare_land','planted'))` |
| `plantation_system` | `text check (in ('traditional','intensive','other'))` |
| `olive_tree_count` | `integer check (>= 0)` — **nullable** |
| `tree_age_years` | `numeric(4,1)` |
| `production_status` | `text check (in ('none','starting','producing'))` |
| `irrigation` | `public.irrigation_type` |
| `cash_price_millimes` | `bigint not null check (>= 0)` |
| `annual_costs_millimes` | `bigint` |
| `pricing` | `jsonb` (null = inherit the project's) |
| `status` | `public.parcel_status not null default 'available'` |
| `notes` | `text check (length <= 2000)` — internal only |
| `sort_order` | `integer not null default 0` |
| `spacing_class_id` | `uuid references public.tree_spacing_classes(id) on delete restrict` (added `0034`) |

Migration `0012` carries the intent verbatim:

> `comment on column public.parcels.olive_tree_count is 'Actual number of olive trees entered by the
> administration. Never computed from area_m2 (PARC-02).'`

That comment is now **contradicted by `0035_projects_tree.sql`** for tree-priced projects — see 9.4.

### 9.2 The seven parcel statuses

`public.parcel_status` was created in `0012` with six values; `0021_parcel_statuses_v2.sql` adds
`'owned'` after `'sold'` (`alter type … add value if not exists 'owned' after 'sold'`). Order is asserted
by `supabase/tests/007_parcel_statuses_v2.sql`:

```
available,interested,reserved,contracting,sold,owned,withdrawn
```

Arabic labels, `src/lib/projects.ts` `PARCEL_STATUS_LABELS`:

| Code | Arabic label | Tone class (`PARCEL_STATUS_TONES`) |
|---|---|---|
| `available` | `متاحة` | emerald |
| `interested` | `مهتم بها` | sky |
| `reserved` | `محجوزة` | orange |
| `contracting` | `في طور التعاقد` | violet |
| `sold` | `متعاقد عليها` | stone |
| `owned` | `مملوكة` | leaf/forest |
| `withdrawn` | `موقوفة` | danger |

`parcelStatusLabel(status)` / `parcelStatusTone(status)` fall back to the raw code and a neutral tone for
an unknown value, so a status added by a later migration never breaks a page.

The comment on the type, set by `0021`, is the documentation of record:

> `'Spec v2 §28: available, interested, reserved, contracting (contract in progress), sold (contracted),
> owned, withdrawn (suspended). Codes are stable; labels live in the app.'`

### 9.3 Who may read and write a parcel

From `0012` and `0020_public_projects.sql`:

- RLS is on for `projects`, `parcels`, `project_costs`. `anon` has **all privileges revoked** on the three
  tables; `supabase/tests/006_public_projects.sql` T1 asserts anon cannot `select` any of them.
- `projects_select` / `parcels_select`: `to authenticated using (app.is_staff())` — every staff role reads.
- `project_costs_select`: `finance`, `admin`, `super_admin` only (PRJ-03).
- Insert/update policies on `projects`, `parcels`, `project_costs`: `finance`, `admin`, `super_admin`.
- `0020` S1 adds the missing grants: `grant insert, update on public.projects, public.parcels,
  public.project_costs to authenticated`, and revokes `truncate` from `anon, authenticated`.
- **`delete` is revoked and there is no delete policy.** A parcel, a project or a cost row can never be
  deleted through the application. `supabase/tests/006` asserts `not has_table_privilege('authenticated',
  'public.projects', 'delete')`. The only path that removes rows is the demo seeder
  (`scripts/seed-demo-projects.mjs --purge`), which connects with its own credentials.

Triggers on `public.parcels`, in name order (BEFORE triggers fire alphabetically):

| Trigger | Migration | What it does |
|---|---|---|
| `parcels_spacing_class_check` | `0034` | refuses `spacing_class_id` that is not one of the project's classes (`parcel_spacing_not_in_project`), taking `for share` on the project row |
| `parcels_stamp` | `0012` | `app.stamp_updated()` |
| `parcels_tree_unit_sync` | `0035` | fills `spacing_class_id` from the project's single class and recomputes `area_m2` |
| `parcels_audit` | `0012` | `app.audit_row_change()` after insert/update/delete |

`project_spacing_classes` carries `project_spacing_classes_in_use` (`0034`): a class cannot be removed
from a project while a parcel uses it (`spacing_used_by_parcels`).

### 9.4 Tree pricing: the area of a lot is derived from its trees

`0035_projects_tree.sql` inverts the `0012` rule for any project that lists spacing classes
(`public.project_spacing_classes`, introduced in `0031_tree_pricing.sql`):

```sql
create or replace function app.parcel_tree_unit_sync() returns trigger …
  if not app.project_on_tree_pricing(new.project_id) then return new; end if;
  if new.spacing_class_id is null then  -- the project's only class, stored explicitly
    select case when count(*) = 1 then min(psc.spacing_class_id::text)::uuid end into v_class …
    new.spacing_class_id := v_class;
  end if;
  if new.spacing_class_id is not null and coalesce(new.olive_tree_count, 0) > 0 then
    select c.area_m2 into v_area from public.tree_spacing_classes c where c.id = new.spacing_class_id;
    if v_area > 0 then new.area_m2 := new.olive_tree_count * v_area; end if;
  end if;
```

A second trigger, `tree_spacing_classes_area_fanout` → `app.spacing_area_fanout()`, rewrites
`parcels.area_m2` for every parcel of that class when the class's row/tree spacing is edited.

`app.parcel_price(p_parcel uuid) returns jsonb` is **the single definition of a lot's price**. It was
created in `0034_project_quote.sql` and **redefined in `0045_annual_fee.sql`** (the later body is the live
one; it adds `annual_fee_per_tree_millimes` and `annual_fee_total_millimes`). It routes on
`app.project_spacing_choice(project_id, spacing_class_id)`, which returns a status of `'legacy'`
(project lists no class), `'ok'`, `'required'` (several classes, none chosen) or `'not_allowed'`.

| `pricing` returned | Meaning |
|---|---|
| `'legacy'` | project lists no spacing class → `cash_total_millimes = nullif(parcels.cash_price_millimes, 0)`, `total_area_m2 = parcels.area_m2` |
| `'ok'` | `price_per_tree_millimes` and `trees` both known → `cash_total_millimes = per × trees`, `total_area_m2 = area_per_tree × trees` |
| `'unavailable'` | with `reason` in `spacing_required`, `spacing_not_allowed`, `margin_not_set`, `trees_missing` |

Arabic renderings of those reasons live in `src/lib/parcel-prices.ts` `PARCEL_PRICE_REASONS`, e.g.
`trees_missing` → `اكتب عدد الزيتونات باش تتحسب المساحة والسعر.`

A tree-priced lot stores `cash_price_millimes = 0` on purpose. `src/app/admin/(panel)/projects/actions.ts`
`saveParcel()`:

```ts
// 0 on a tree-priced parcel: app.parcel_price computes its price and never shows a stored 0 (0034).
cash_price_millimes: onTree ? 0 : (dinarsToMillimes(price) as number),
```

### 9.5 Which lots the public sees, and which carry a price

Three gate predicates in the unexposed `app` schema (`0020`, all `revoke execute … from public, anon,
authenticated`):

```sql
app.project_public_statuses()  -- ['published'] (+ 'sold_out','operating' when projects.list_closed)
app.project_visible(status)    -- app.module_open('projects') and (status in public statuses
                               --                                  or (status='internal' and app.is_staff()))
app.parcel_offer_statuses()    -- ['available'] (+ 'interested' when projects.offer_includes_interested)
app.parcel_offered(pj, pa)     -- pj = 'published' and pa = any(app.parcel_offer_statuses())
app.parcel_visible_status(pa)  -- pa <> 'withdrawn'
                               --   and (pa in offer statuses or projects.show_taken_parcels)
```

`app.parcel_offered` is commented in `0020` as *"THE single definition of 'offered': closed
(sold_out/operating) projects never price a parcel."*

Settings that steer this (all seeded in `0020` S13, asserted by `supabase/tests/006`):

| Key | Default | Public? | Effect |
|---|---|---|---|
| `projects.listing_limit` | `300` | yes | row cap on `public_parcels()`, clamped in SQL to 20…1000 |
| `projects.list_closed` | `true` | yes | show `sold_out` / `operating` projects as closed, never priced |
| `projects.show_taken_parcels` | `true` | yes | list reserved/contracting/sold/owned lots with a badge and no price |
| `projects.offer_includes_interested` | `false` | no | decision D-15: keep `interested` lots priced and linkable |
| `projects.interest_marks_parcel` | `false` | no | clause 11.1: an interest request would move `available → interested` |
| `projects.installment_examples` | `3` | yes | clamped 1…5 in `app.parcel_offer_payload` |
| `projects.gallery_max` | `24` | yes | enforced by `app.project_media_limit()` trigger |

`projects.interest_marks_parcel` is **read by no code at all** in this repository — the only hits are the
`0020` seed and the two assertions in `supabase/tests/006_public_projects.sql`.

### 9.6 The public read surface

Four security-definer RPCs, `revoke execute … from public` then `grant … to anon, authenticated`. All were
redefined by later migrations; the live bodies are:

| RPC | Live definition | Returns |
|---|---|---|
| `public.public_projects()` | `0035` (after `0020`, `0023`) | one row per visible project + `on_tree_pricing`, `parcels_total`, `parcels_offered`, `min_cash_price_millimes`, `min_price_per_tree_millimes`, `area_per_tree_min_m2/max_m2`, `min_area_m2`, `max_area_m2`, `parcel_trees`, `cover_url`, `cover_alt_ar` |
| `public.public_parcels()` | `0035` (after `0020`, `0022`) | one row per visible lot + `offered`, `on_tree_pricing`, `spacing_class_id`, `spacing_label_ar`, `area_per_tree_m2`, `price_per_tree_millimes`, `cash_price_millimes`, `down_from_millimes`, `annual_costs_millimes` |
| `public.public_coverage()` | `0035` | `governorate_id`, `projects_count`, `parcels_total`, `parcels_offered` |
| `public.public_project_page(p_code text)` | `0023` | description, water, access, video, coordinates only when `show_location`, document/service option ids, gallery |

Aggregates inside `public_projects()` (0035):

```sql
parcels_total   = count(*) filter (where pa.status <> 'withdrawn')
parcels_offered = count(*) filter (where x.priced)
min_area / max_area = min/max(area) filter (where pa.status <> 'withdrawn')
parcel_trees    = sum(pa.olive_tree_count) filter (where pa.status <> 'withdrawn')
```

where `x.priced` is `app.parcel_offered(pj.status, pa.status)` AND, for a tree-priced project,
`app.parcel_price(pa.id)->>'pricing' = 'ok'` AND `app.module_open('pricing')`; for a legacy project simply
`pa.cash_price_millimes > 0`.

Two offer-card RPCs share one builder, `app.parcel_offer_payload(p_parcel, p_down_option,
p_installment_option, p_force_price)`:

- `public.public_parcel_offer(uuid, uuid, uuid)` — anon-callable, returns `null` unless the project is
  visible and the lot's status is visible. *"Taken parcels return offered = false with empty plans so shared
  links never 404."* Asserted by `supabase/tests/007`.
- `public.staff_parcel_offer(uuid, uuid, uuid)` — staff only, no flag or status gate,
  `p_force_price = true`, so the Back Office always sees the numbers a visitor would.

`public.staff_project_parcel_prices(p_project uuid) returns table (parcel_id uuid, price jsonb)` (`0035`)
returns `app.parcel_price` for every lot of a project in one call; it is the only way the Back Office reads
prices (`src/lib/parcel-prices.ts` `getStaffParcelPrices`).

### 9.7 How available / reserved / sold are counted — three independent implementations

There is **no stock table and no counter column**. Every figure is a sum of `parcels.olive_tree_count`
grouped by `parcels.status`. Three different pieces of code do that grouping, with three different maps.

**(a) Back Office — `src/app/admin/(panel)/projects/stock.ts`**

```ts
export const STOCK_BUCKET_OF: Record<ParcelStatus, StockBucket> = {
  available:   "available",
  interested:  "available",   // "Still on the market: someone asked about it, nothing is held."
  reserved:    "reserved",
  contracting: "reserved",
  sold:        "sold",
  owned:       "sold",
  withdrawn:   "withdrawn",
};
```

`STOCK_BUCKET_LABELS` = `المتاحة` / `المحجوزة` / `المباعة` / `الموقوفة`. `treeStock(lots)` returns
`total = available + reserved + sold` (withdrawn sits outside the total), per-bucket tree and lot counts,
a `byStatus` breakdown, `lotCount`, `lotsWithoutTrees` (lots whose `olive_tree_count` is null/0) and
`hasHeldLots`. An unknown status falls into `available` rather than being dropped.

The file's own header states the ground truth:

> "Reservations, visits, contracts and payments have no tables yet, so «المحجوزة» is exactly what staff
> have marked محجوزة or في طور التعاقد on the lots themselves, and the strip says so in words."

**(b) Public site — `src/app/(public)/projects/page.tsx` `offerStock()`**

```ts
const HELD_STATUSES = new Set(["interested", "reserved", "contracting"]);
const SOLD_STATUSES = new Set(["sold", "owned"]);
```

Note `interested` is **held** here and **available** in the Back Office. When no parcel of the project
carries trees (`counted === 0`), the function falls back to the offer's own `tree_count`:

```ts
const sold = project.status === "sold_out" ? total : 0;
const selling = project.status === "published" || project.status === "internal";
return { total, available: selling ? total - sold : 0, held: 0, sold, fromParcels: false };
```

**(c) The public counter — `public.million_progress()`, `0025_million_counter_split.sql`**

```sql
reserved   = sum(olive_tree_count) filter (where pa.status::text = 'reserved')
contracted = sum(olive_tree_count) filter (where pa.status::text in ('contracting','sold','owned'))
planted    = sum(olive_tree_count) filter (where pa.status::text <> 'withdrawn' and pj.status = 'operating')
```

plus `trees_requested = sum(interest_requests.tree_count_min) where not is_duplicate`, `participants`,
`requests`, and `projects_under_study = count(projects where status in ('draft','preparing','internal'))`.
The function returns `null` outright while the `public_statistics` module is closed to the caller (a
direct database session with no JWT always reads). Tile labels are settings: `زيتونات محجوزة` /
`مرتبطة بحجوزات فعلية.`, `زيتونات تم التعاقد عليها` / `عقود فعلية أو في طور الإمضاء.`,
`زيتونات مغروسة / موجودة فعلياً`. Read in TypeScript by `src/lib/million.ts` and rendered by
`src/components/site/million-counter.tsx`.

`supabase/tests/011_million_counter_split.sql` exercises this with fixture parcels of every status and
checks the three figures as deltas.

### 9.8 Where inventory is edited

`src/app/admin/(panel)/projects/actions.ts`:

- `saveProject(projectId | null, …)` — `requireStaff(['finance','admin','super_admin'])`, then a plain
  `update`/`insert` on `public.projects`. Expires the public cache via `updateTag(PUBLIC_PROJECTS_TAG)` and
  `revalidatePath("/projects", "layout")`.
- `saveParcel(projectId, parcelId | null, …)` — same roles. It first reads
  `project_spacing_classes` to decide `onTree`:
  - `onTree === true`: `area_m2` and `cash_price_dinars` are **not read from the form**; trees are required
    (`اكتب عدد الزيتونات: مساحة القطعة وسعرها يتحسبو منو.`), a class must be chosen or inferred,
    `area_m2` is computed as `trees × class.area_m2` and `cash_price_millimes` is written as `0`.
  - `onTree === false`: `area_m2` and `cash_price_dinars` are required and typed.
  - `status` is a free `z.enum(["available","interested","reserved","contracting","sold","owned","withdrawn"])`
    parse of the form value, default `available`.
- `saveOfferSpacingClasses(projectId, …)` — `requireStaff(PRICE_ROLES)`, calls
  `staff_save_project_spacing_classes(p_project, p_class_ids, p_reason)`; **a written reason is mandatory**
  (`app.set_reason` → `app.require_reason`). This is the switch that puts an offer on tree pricing at all.
- `addProjectCost`, `addProjectPicture`, `setProjectCover`, `moveProjectPicture`, `removeProjectPicture`.

`src/app/admin/(panel)/projects/parcel-fields.tsx` renders the shared field set: `رمز القطعة`,
`عدد الزيتونات` (leads, required when tree-priced), `فئة المساحة` (select of the project's classes),
area/price (hidden on tree pricing, with the computed values shown read-only), `نوع العقار`,
`نوع الغراسة`, `عمر الزيتونات`, `حالة الإنتاج`, `الري`, `المصاريف السنوية`, `الحالة`, `ملاحظات`,
`الترتيب`, and the legacy `PricingEditor`.

### 9.9 Inventory screens

**Back Office**

| Route | File | What it shows |
|---|---|---|
| `/admin/projects` | `projects/page.tsx` | «العروض». Four totals across all offers (`إجمالي الزيتونات` / `المتاحة` / `المحجوزة` (note `من حالة القطع`) / `المباعة`), then one card per offer with `StockLine` |
| `/admin/projects/parcels` | `projects/parcels/page.tsx` | «القطع» — every lot of every offer, filterable by `status` and by `offer` (query params `status`, `offer`), four tree tiles, `LotsTable` |
| `/admin/projects/[id]?tab=lots` | `projects/[id]/lots-tab.tsx` | the plan (`ParcelPlan`), the lots table, the add-lot form |
| `/admin/projects/[id]/parcels/[parcelId]` | `projects/[id]/parcels/[parcelId]/page.tsx` | the lot card, the installment simulator (legacy) or a link to the pricing simulator (tree), **the matching list**, the edit form |
| `/admin` | `(panel)/page.tsx` | two queues: **«قطع تستنّى قرار»** = lots with `status === 'interested'`, linking to `/admin/projects/parcels?status=interested`; **«قطع بلا سعر»** = lots not withdrawn whose `effectiveParcelFigures(...).cash` is falsy |

`src/app/admin/(panel)/projects/stock-strip.tsx` prints, under every strip, the constant
`RESERVATIONS_NOTE`:

> `«المحجوزة» تتحسب من القطع اللي حالتها «محجوزة» أو «في طور التعاقد». وحدة الحجوزات مازالت ما تفتحتش، فما فماش مصدر آخر للرقم.`

and `/admin/projects/parcels` ends with:

> `الحجوزات والزيارات والعقود والدفوعات مازالت ما تفتحتش كوحدات. «محجوزة» و«في طور التعاقد» و«متعاقد عليها» هي حالة مكتوبة على القطعة نفسها، وهي المصدر الوحيد لهذه الأرقام اليوم.`

Each `StatTile` for `المحجوزة` carries `note="من حالة القطع"` / `"من حالة القطعة"`, and
`bucketSourceText(bucket)` writes out which statuses were summed (`متاحة + مهتم بها`, …).

**Public site**

| Route | File | Inventory content |
|---|---|---|
| `/projects` | `(public)/projects/page.tsx` | offer cards (`OfferCard`) leading with available trees, then the filtered parcel grid (`ParcelCard`). Filters: `gov`, `del`, `type` (the four `OFFER_TYPE_LABELS`), `price` (max cash, dinars, ≤ 10,000,000), `area`, `trees`, `available=1`. Filtering is done **in TypeScript** over the full `public_parcels()` result |
| `/projects/[code]` | `(public)/projects/[code]/page.tsx` | hero figures (price per tree or total area, and `stock.available`), a `restStock` row that prints `محجوزة` / `متعاقد عليها` only when non-zero, `ParcelPlan`, the parcel grid, the offer's own interest form |
| `/projects/[code]/[parcel]` | `(public)/projects/[code]/[parcel]/page.tsx` | the lot card, `TreeOfferBlock` or `OfferBlock`, the offer's stock strip, and the CTA |
| `/projects/map` | `(public)/projects/map/page.tsx` | `public_coverage()` per governorate: `N مشروع · M قطعة` |

`src/components/site/parcel-plan.tsx` implements report v3 §21: one coloured tile per lot with its code and
area, counts per status in the header, status written in an `sr-only` span so colour is never the only
signal.

`ParcelCard` prints a price block **only when `parcel.offered`**; otherwise nothing but the status pill.
`projects.taken_hint` (`القطع المحجوزة أو المتعاقد عليها تظهر للمعلومة فقط، بلا سعر.`) is shown above the
grid when any lot of the project is not offered.

### 9.10 Demo data

`scripts/seed-demo-projects.mjs` (`npm run demo:projects`) creates 15 `DEMO-` projects, all `internal`,
each with 3–8 parcels. Parcel status is drawn at random:

```js
const parcelStatus = pick(["available", "available", "available", "available", "interested", "reserved", "sold"]);
```

Areas, tree counts and prices are drawn independently ("never a function of the tree count"). `--purge`
deletes the parcels, the costs and the projects.

### OBSERVATIONS — inventory

1. **Two different bucket maps for the same statuses.** `interested` is counted as *available* by the Back
   Office (`STOCK_BUCKET_OF` in `src/app/admin/(panel)/projects/stock.ts`) and as *held* by the public site
   (`HELD_STATUSES` in `src/app/(public)/projects/page.tsx`). The same offer therefore reports different
   «متاحة» figures on `/admin/projects` and on `/projects`. `public.million_progress()` uses a third map
   again: `reserved` alone is reserved, and `interested` is in no bucket at all.
2. **`app.parcel_price` is duplicated in two migrations.** `0034_project_quote.sql` lines 157–219 and
   `0045_annual_fee.sql` lines 243–310 are the same function with the annual-fee keys added. Only `0045`'s
   body is live.
3. **Parcel status changes carry no reason.** `app.require_reason` / `app.set_reason` exist since
   `0024_audit_reason.sql`, whose own setting description names *«حالات القطع والحجوزات والدفعات والعقود»*,
   but `saveParcel()` writes `public.parcels` directly through PostgREST. `parcels_audit` records the old
   and new row; `current_setting('app.reason')` is unset, so the audit row's reason is null. The only
   inventory-side writer that sets a reason is `staff_save_project_spacing_classes`.
4. **No transition rules.** Any status may be set from any other status by anyone with a write role; there
   is no state machine, no `parcel_status_history` table, and no check that a `sold` lot is not returned to
   `available`.
5. **`projects.interest_marks_parcel` is a dead setting.** Seeded by `0020`, asserted by
   `supabase/tests/006`, read by nothing.
6. **`cash_price_millimes` is `not null` and a tree-priced lot stores `0` in it.** Every reader must know to
   call `nullif(cash_price_millimes, 0)` or go through `app.parcel_price`; `src/lib/parcel-prices.ts`
   `effectiveParcelFigures()` is the single TypeScript helper that does.
7. **`public_parcels()` has no filter parameters.** The whole visible catalogue (up to
   `projects.listing_limit`, default 300) is fetched and filtered in `src/app/(public)/projects/page.tsx`
   `matches()`. The anon result is cached for 60 s under the tag `public-projects`.
8. **`photo_url`, `photo_alt_ar`, `photo_aspect` in `public_parcels()` are hard-coded `null::text`** in
   every version from `0020` through `0035`. `ParcelCard` and the public parcel page pass them to
   `RemotePhoto`, which always falls back to its drawn grove. Parcels have no gallery table; only projects
   do (`public.project_media`).
9. **`cover_aspect` is likewise always `null::text`** in `public_projects()`.
10. **Lots cannot be deleted.** A mistyped lot can only be set to `withdrawn` (`موقوفة`), which keeps it in
    `parcels_total`-adjacent queries that filter on `<> 'withdrawn'` but out of the totals.

---

## 10. MATCHING

### 10.1 What exists

One function, `public.match_requests_for_parcel(p_parcel uuid, p_limit integer default 50)`, defined in
`supabase/migrations/0013_pricing_and_matching.sql` (lines 154–244) and **never redefined** by any later
migration.

Direction: **parcel → people**. Given one lot, it scores and ranks `public.interest_requests`.

**There is no matching in the other direction.** No function, view or TypeScript helper suggests parcels
for a person or for a demand. `/admin/leads/[personId]` shows the person's own requests and, for an
offer-kind request, a link to that offer — nothing computed.

### 10.2 Criteria and weights

Weights are a setting, not code — `matching.weights`, seeded in `0013`, group `matching`, `is_public =
false`, Arabic label `أوزان الـMatching`, description
*«مجموع الأوزان الأساسية 100. «priority_bonus» نقاط إضافية عندما تخدم القطعة أولوية الحريف (PARC-09).»*

| Weight key | Default | Criterion | Full score when | Partial | Zero |
|---|---|---|---|---|---|
| `location` | 25 | `interest_requests.invest_governorate_ids` vs the project's `governorate_id` | array contains it | `× 0.6` when `invest_anywhere` | otherwise |
| `project_type` | 20 | `project_type_ids` vs `projects.project_type_id` | array contains it | `× 0.5` when `project_type_unsure` | otherwise |
| `plantation` | 10 | `plantation_systems` vs `parcels.plantation_system` | array contains it | `× 0.5` when the parcel has no system **or** the request stated none | otherwise |
| `area` | 15 | `parcels.area_m2` vs `desired_area_min_m2 … desired_area_max_m2` | inside the range | `× 0.6` when `desired_area_min_m2 is null`; `× 0.5` when inside `min×0.8 … max×1.2` | otherwise |
| `down_payment` | 15 | `down_payment_min_millimes` vs `min_down_pct × cash_price / 100` from `app.parcel_pricing(parcel)` | ≥ the required minimum | `× 0.5` when below | 0 when `down_payment_min_millimes is null` |
| `installment` | 15 | `public.compute_installment_plan(cash, down_min, installment_min, app.parcel_pricing(parcel))` | the plan returns `ok = true` | — | otherwise |
| `priority_bonus` | 5 | `interest_requests.priority_code` | `productive` + parcel `production_status = 'producing'`; or `area_max` + `area_m2 >= coalesce(desired_area_max_m2, desired_area_min_m2, 0)`; or `trees_max` + `coalesce(olive_tree_count,0) > 1` | — | otherwise |

`matching.min_score` (default `40`, Arabic label `أدنى نتيجة لعرض الحريف`) drops every row below it.
Result columns: `request_id`, `request_no`, `person_id`, `full_name`, `phone_e164`, `created_at`,
`assigned_to`, `score` (rounded to 1 decimal), `breakdown` (a `jsonb` object with the seven components).

Ordering: `order by score desc, scored.created_at asc` — the comment names it *"Seniority decides ties
(MATCH-01)"*. Limit: `least(greatest(p_limit, 1), 200)`.

### 10.3 Who sees what

```sql
v_all := app.has_any_role(array['finance','legal','admin','super_admin']::public.app_role[]);
if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
…
where (v_all or p.assigned_to = auth.uid())
  and p.archived_at is null
```

So a `commercial` sees only the people assigned to them; `finance`, `legal`, `admin`, `super_admin` see
everyone. Archived persons are excluded. `execute` is revoked from `public, anon` and granted to
`authenticated`.

`supabase/tests/003_pricing_matching.sql` asserts: at least one match on the fixture parcel; the closest
request first (`+21655000011`); `score >= 100` for a full match; `location`, `area` and `installment`
components all > 0; `priority_bonus` > 0 for a productive parcel and a `productive` priority; the ranking
is stable across two calls (MATCH-04); and *"a commercial with no assigned files gets no matches"*.

### 10.4 Where it is called from

Exactly one call site in the whole repository:

`src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx`, line 106:

```ts
const { data: matches, error: matchError } = await supabase.rpc("match_requests_for_parcel", { p_parcel: parcelId, p_limit: 25 });
```

Rendered as a section headed **«الحرفاء الأقرب لهذه القطعة»** with the note
*«النتيجة أداة ترتيب داخلية، لا تُعرض للحريف.»*. Each row links to `/admin/leads/{person_id}`, prints the
formatted phone, the `request_no`, `مسجّل منذ {date}`, the score as `{Math.round(match.score)}%`, and one
chip per non-zero breakdown component using `BREAKDOWN_LABELS`:

```ts
{ location: "الولاية", project_type: "نوع المشروع", plantation: "الغراسة", area: "المساحة",
  down_payment: "التسبقة", installment: "القسط", priority_bonus: "الأولوية" }
```

Empty result renders `لا يوجد حرفاء مطابقون بالحد الأدنى الحالي للنتيجة.`

### OBSERVATIONS — matching

1. **The `matching` feature flag is never checked.** `0004_seed_configuration.sql` registers
   `('matching', 'disabled', 2, 'الـMatching', 'اقتراح الحرفاء المطابقين (البند 8.3).', 50)`, and
   `src/lib/modules-catalog.ts` does not list `matching` in `IMPLEMENTED_MODULES`
   (`["interest_form","simulator_basic","land_offers","projects","public_statistics","pricing"]`), so the
   Back Office modules page refuses to publish it. The RPC checks only `app.is_staff()`, and the parcel
   page calls it unconditionally. The matching block therefore renders for every staff member while the
   module reads «معطّل».
2. **Matching runs on the legacy pricing path only.** It calls `app.parcel_pricing()` (the jsonb formula,
   `0013`) and `public.compute_installment_plan()`, not `app.parcel_price()` / `app.tree_price()`. On a
   tree-priced lot `parcels.cash_price_millimes` is `0`, so `compute_installment_plan` returns
   `{"ok": false, "reason": "missing_price"}` and `s_installment` is always 0; and the down-payment
   threshold `min_down_pct × 0 / 100` is 0, so `s_down` is the full 15 for any request that stated a down
   payment. The ceiling for a tree-priced lot is therefore 25 + 20 + 10 + 15 + 15 + 5 = 90, never 105.
3. **Four of the seven criteria read columns that new demands no longer fill.**
   `0032_intake_pricing.sql` line 70 deactivates the option lists the criteria depend on:
   ```sql
   update public.option_items set is_active = false
   where list_key in ('desired_area','priority','monthly_installment','down_payment','budget') and is_active;
   ```
   `app.active_option()` requires `is_active`, so `submit_interest_request` (0032, the live body) leaves
   `desired_area_min_m2`, `priority_option_id`/`priority_code`, `down_payment_min_millimes` and
   `installment_min_millimes` null for every demand taken after that migration. For such a demand
   `s_area = 15 × 0.6 = 9`, `s_down = 0`, `s_installment = 0`, `s_priority = 0`, so the maximum
   attainable score is 25 + 20 + 10 + 9 = **64**, against a `matching.min_score` of 40.
4. **Offer-kind requests (`0049`) score on two criteria only.** `submit_offer_request` writes
   `invest_anywhere = false`, `invest_governorate_ids = array[v_project.governorate_id]`,
   `project_type_unsure = true`, and none of the area/down/installment/priority columns. Such a request
   scores 25 (same governorate) + 10 (unsure × 0.5) + 5 (plantation × 0.5) + 9 (area × 0.6) = 49 on a
   lot of the same governorate, and 24 elsewhere — i.e. it drops below `min_score` for every lot outside
   its own governorate regardless of what the person actually asked for.
5. **`score` is rendered with a `%` sign** (`{Math.round(match.score)}%`) although it is a point total over
   a 100-point base plus a 5-point bonus; `supabase/tests/003` asserts `score >= 100` for a full match.
6. **`app.parcel_pricing` and `compute_installment_plan` are called once per candidate row** inside the
   scored CTE (twice for `s_down` and `s_installment`), i.e. per request × per call.
7. **`0013` also seeds `pricing.default`**, the markup-bracket formula (`10 % ≤ 36m`, `18 % ≤ 60m`,
   `25 % ≤ 84m`, `min_down_pct 10`, `min_installment_millimes 50000`), described in its own Arabic text as
   *«الأرقام أمثلة تحتاج مصادقة Finance (القرار D-06)»*.

---

## 17. RESERVATIONS

### 17.1 There is no reservation

Flat statement: **no customer can reserve a parcel, a tree or anything else.** Searching the whole
repository for `reservation`, `booking`, `deposit`, `عربون`, `حجز` returns:

- one `feature_flags` row,
- the `parcel_status` values `reserved` / `contracting`,
- the `lead_stage` values `reserved` / `contracting`,
- Arabic copy in `settings`,
- UI text that says the module does not exist.

No table. The complete table list of `supabase/migrations/0001…0050` is: `app.counters`,
`app.submission_throttle`, `public.settings`, `public.lead_statuses`, `public.feature_flags`,
`public.persons`, `public.profiles`, `public.user_roles`, `public.audit_logs`,
`public.interest_requests`, `public.person_status_history`, `public.contact_attempts`,
`public.person_notes`, `public.person_assignments`, `public.land_offers`, `public.land_offer_files`,
`public.land_offer_reviews`, `public.governorates`, `public.delegations`, `public.option_lists`,
`public.option_items`, `public.ownership_scenarios`, `public.project_types`, `public.projects`,
`public.parcels`, `public.project_costs`, `public.project_media`, `public.message_templates`,
`public.notification_outbox`, `public.site_media`, `public.tree_spacing_classes`,
`public.tree_pricing_rules`, `public.tree_cost_items`, `public.financing_markups`,
`public.project_spacing_classes`, `public.project_down_payment_percents`.

There is no `reservations`, `holds`, `deposits`, `visits`, `contracts`, `payments` or `installments`
table. There is no column anywhere that records a person against a parcel.

### 17.2 What exists instead

**The flag.** `0004_seed_configuration.sql`:

```sql
('reservations', 'disabled', 2, 'العربون والحجز', 'البند 13.', 70),
```

It is not in `IMPLEMENTED_MODULES` (`src/lib/modules-catalog.ts`), so the Back Office modules page will
not publish it. `PHASE_LABELS[2]` is `المرحلة 2 · المشاريع والحجز`.

**The parcel status.** `parcels.status = 'reserved'` (`محجوزة`) and `'contracting'`
(`في طور التعاقد`) are set by hand in the lot form, by any user with `finance`, `admin` or `super_admin`.
They carry no date, no customer, no amount, no expiry.

**The CRM file status.** `public.lead_statuses`, seeded in `0004`, contains
`('reserved', 'حجز', 'Réservé', 80, true)` and `('contracting', 'في طور التعاقد', 'En
contractualisation', 90, true)`. These are stages of a *person's file* in the CRM
(`src/lib/crm.ts` `LEAD_STAGE_LABELS` maps `reserved → حجز`), set on `persons.status_id`. They are
unrelated to any parcel: nothing joins a `lead_status` to a `parcel`.

**The copy that says so.** Three places in the UI state the absence in Arabic:
`src/app/admin/(panel)/projects/stock-strip.tsx` (`RESERVATIONS_NOTE`),
`src/app/admin/(panel)/projects/parcels/page.tsx` (the closing `hint`), and the comment in
`src/components/admin/nav-model.ts`:

> `الحجوزات · الزيارات · العقود · الدفوعات · الخدمات الفلاحية are deliberately absent. They had a row each
> and a page each, and every one of those pages said the same thing: the domain is not built yet.`

`src/components/admin/section-not-open.tsx` is the component those five pages used
(`مازال ما تفتحش`, `القسم موجود، الدومان مازال ما تفتحش.`). It is exported and **imported by nothing** —
dead code since the nav rows were removed (`layout.tsx` now builds four sections:
`/admin`, `/admin/leads`, `/admin/projects`, `/admin/settings`). `src/components/admin/nav-icons.tsx`
still defines the `reservations`, `visits`, `contracts`, `payments` and `services` icon paths, also unused.

### 17.3 What a customer can actually do

Two intakes, both ending in `public.interest_requests`, told apart by `request_kind`:

| Flow | Entry | Server Action | RPC |
|---|---|---|---|
| Calculator | `/start` → `/register` | `(public)/register/actions.ts` | `public.submit_interest_request(jsonb)` (live body: `0032`) |
| Offer | `/projects/[code]`, the form under `#offer-form` | `(public)/projects/[code]/offer-actions.ts` `submitOfferInterest` | `public.submit_offer_request(jsonb)` (`0049`) |

Both RPCs are `security definer`, `revoke execute … from public, anon, authenticated`, `grant … to
service_role`; the Server Actions reach them through `createAdminClient(auditHeaders(...))`.

`submit_offer_request` (`0049_offer_intake.sql`) is the closest thing to "asking for stock". It:

- validates identity exactly as the calculator does,
- requires `v_project.status = any (app.project_public_statuses())`, else `offer_not_available`,
- requires `1 <= trees <= projects.tree_count` when `tree_count > 0`, else `invalid_offer_trees`
  (the comment quotes the owner: *«الحريف يشري من 1 الي 100»*),
- prices the request with `app.project_quote_payload(project, null, trees, 'cash', null, null, false)` and
  snapshots `offer_price_per_tree_millimes`, `offer_total_price_millimes`,
  `offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes`,
- throttles by IP and by phone (`antispam.max_requests_per_ip_per_hour` 10,
  `antispam.max_requests_per_phone_per_day` 3),
- upserts `public.persons` on `phone_e164`, optionally auto-assigns a commercial round-robin,
- inserts the request and enqueues the `lead.confirmation` message.

**It does not touch `public.parcels`, `public.projects` or any counter.** Ten people can ask for all 100
trees of the same offer and the offer's stock figures do not move.

### 17.4 The parcel link that is thrown away

`src/lib/public-hrefs.ts` `interestHref({ parcelId, trees, treesCustom, scenario, spacing, payment,
downPercent, duration, visit })` builds `/register?parcel=<uuid>&…`. The public parcel page uses it for
both CTAs:

```ts
const cta = canAsk ? { href: interestHref(asked), label: settingText(config, "projects.parcel_cta", "أنا مهتم بهذه القطعة") } : …
const visitCta = canAsk ? { href: interestHref({ ...asked, visit: true }), label: settingText(config, "projects.visit_cta", "نحب نزور الأرض") } : null;
```

`/register` never reads `parcel`. `src/app/(public)/register/page.tsx` reads `params` and passes them to
`readCalculatorChoices(lists, params)` (`(public)/start/calculator.ts`), which reads only `trees`,
`trees_custom`, `down_pct`, `duration`, `scenario`, `spacing`, `payment`; `visit` is read separately. A
repository-wide grep for `parcel` under `src/app/(public)/register/` and `src/app/(public)/start/` returns
nothing.

The database side matches: `0020_public_projects.sql` S10 added fifteen snapshot columns to
`public.interest_requests` — `parcel_id`, `project_id`, `project_code`, `project_name`, `parcel_code`,
`parcel_area_m2`, `parcel_property_type`, `parcel_plantation_system`, `parcel_olive_tree_count`,
`parcel_production_status`, `parcel_cash_price_millimes`, `parcel_plan_months`,
`parcel_plan_total_millimes`, `parcel_plan_last_millimes`, `parcel_captured_at` — with the note:

> `Filled by the public intake in a later migration; harmless until then.`

No migration ever filled them. `submit_interest_request` as redefined in `0032` inserts 60 columns and
**none of the `parcel_*` ones**. `submit_offer_request` (`0049`) fills `project_id`, `project_code` and
`project_name` but never `parcel_id` or any `parcel_*` column.

### OBSERVATIONS — reservations

1. **`interest_requests.parcel_id` and the twelve `parcel_*` snapshot columns are write-never.** The FK,
   the index `interest_requests_parcel_idx` and the column comment exist since `0020`; no writer exists.
2. **The parcel a visitor clicked is lost at `/register`.** The link carries `?parcel=<uuid>`; the page
   drops it. The Back Office therefore cannot tell which lot a calculator lead was looking at.
3. **No double-booking guard is possible today**, because no row associates a person with a parcel. The
   only representation of "this one is taken" is a status a staff member types.
4. **`src/components/admin/section-not-open.tsx` and five entries of `nav-icons.tsx` are unreferenced.**
5. **`docs/plan-rebuild.md` names the gap explicitly** (line 52): *«الحجز هو حجر الزاوية: بلاهُ العدّادات
   تبقى ديكور و`parcel_status` يبقى المخزون ودفتر البيع في نفس الوقت»*. `docs/gap-rapport-v3.md` P-8/P-9
   describes reservation statuses (`active/converted/expired/cancelled`, `awaiting_deposit`,
   `deposit_paid`), a 50 DT deposit and a ~10-day validity **as a design to be built**. None of it exists in
   `supabase/migrations`. `README.md` line 83 lists reservations under "Phases 2 to 4" — consistent with
   the code.

---

## 18. CONTRACTS AND OWNERSHIP

### 18.1 There is no contract

Flat statement: **no contract is created, stored, generated, signed or tracked.** There is no contracts
table, no `promesse de vente` / `وعد بالبيع` document, no signature field, no PDF generation, no e-sign
integration, no installment schedule rows, and no payment record.

`0004_seed_configuration.sql` registers the flags and nothing implements them:

```sql
('visits',        'disabled', 2, 'الزيارات الميدانية', 'البند 12.',           60),
('reservations',  'disabled', 2, 'العربون والحجز',      'البند 13.',           70),
('contracts',     'disabled', 3, 'العقود ووعد البيع',   'البند 14.',           80),
('installments',  'disabled', 3, 'الأقساط',             'البند 15.',           90),
('zitounti',      'disabled', 4, 'فضاء «زيتونتي»',      'البند 17.',          100),
('subscriptions', 'disabled', 4, 'الاشتراك السنوي',     'البند 18.',          110),
('agri_backoffice','disabled',4, 'الـBack Office الفلاحي','البند 20.',        120),
('harvest',       'disabled', 4, 'الصابة والجني',        'البند 19.',          130),
```

None of these keys appears in `IMPLEMENTED_MODULES`. `PHASE_LABELS[3]` is
`المرحلة 3 · التعاقد والأقساط`, `PHASE_LABELS[4]` is `المرحلة 4 · ما بعد التملّك`.

### 18.2 Where «العقد» appears

Only as copy, in `public.settings`, and as two enum values:

| Surface | Text |
|---|---|
| `projects.payment_text` (`0023`, rewritten by `0039`/`0040`) | `حاضر، أو تسبقة ثم أقساط شهرية تسهّل البداية… التفاصيل تتحسب لكل قطعة، والمبلغ النهائي والمدة يُضبطان في وعد البيع.` |
| `projects.examples_note` (`0020`) | `…المبلغ النهائي والمدة يُضبطان في وعد البيع.` |
| `projects.services_text` (`0023`) | `خدمات تنجم تطلبها بعد التملّك. شروطها وأسعارها تتوضّح قبل الإمضاء.` |
| `site.unit_note` (`0033`) | `…المساحة والسعر النهائيين يتثبّتو في وعد البيع.` |
| `site.services_note` (`0039`) | `الخدمات اختيارية، وشروطها وأسعارها تتوضّح قبل الإمضاء.` |
| `start.estimate_note` (`0032`) | `هذا تقدير أولي حسب الإعدادات الحالية. التفاصيل النهائية في بطاقة المشروع والعقد.` |
| `million.tile_contracted_hint` (`0025`) | `عقود فعلية أو في طور الإمضاء.` |

The only screen text that names contracts as a process is the legacy simulator caption on the admin parcel
page: *«نفس دالة الحساب المستعملة في الموقع والحجز والعقود وجدول الأقساط.»* — `compute_installment_plan`
is indeed one function, but the reservation, the contract and the schedule it names do not exist.

`land_document` option `ownership_deed` / `عقد ملكية` (`0004`) is a document *type* on the landowner
intake, unrelated.

### 18.3 Ownership

Three unrelated representations, none of which records an owner:

1. **`parcel_status = 'owned'`** (`مملوكة`), added by `0021`. It is a state on the *lot*, with no owner
   column and no link to a person. `0021`'s header explains it needs no other change because
   `app.parcel_offered()` offers `'available'` only and `app.parcel_visible_status()` hides `'withdrawn'`
   only — *"so an owned parcel is shown as taken, never priced"*. `supabase/tests/007` asserts exactly
   that: an `owned` parcel is listed, `offered = false`, `cash_price_millimes is null`, its offer resolves
   with zero plans, and it counts as taken in `parcels_offered`.
2. **`lead_statuses` stage `'owner'`** = `مالك` / `Propriétaire` (`0004`, sort 100). A CRM file status on
   `persons.status_id`.
3. **`public.ownership_scenarios`** (`0010_ownership_area_priority.sql`, extended by `0027`). Despite the
   name this is **not ownership of anything** — it is the intake question *«شنوّة تحب تملك؟»*, a list of
   cards (`productive`, `bare_land`, …) each mapping the citizen's words to a `project_type_id`,
   `plantation_system` and `production_status`. `0027_offer_type_cards.sql` gives each card an icon,
   picture and French copy.

`src/lib/projects.ts` also derives four **offer families** from a parcel's own fields, used for the
`/projects` type filter — `OFFER_TYPE_LABELS`: `productive` → `زيتون منتج`, `new_planting` →
`غراسة جديدة`, `intensive` → `زيتون مكثّف`, `bare_land` → `أرض بيضاء`:

```ts
export function offerTypeOf(parcel) {
  if (parcel.property_type === "bare_land") return "bare_land";
  if (parcel.plantation_system === "intensive") return "intensive";
  return parcel.production_status === "producing" ? "productive" : "new_planting";
}
```

### 18.4 Installments: computed, never stored

`public.compute_installment_plan(p_cash_millimes, p_down_millimes, p_installment_millimes, p_pricing)`
(`0013`, `immutable`) supports three models — `markup_brackets` (default), `scenarios`, `monthly_rate` —
and returns `{ok, model, months, total_millimes, financed_millimes, last_installment_millimes,
markup_pct}` or `{ok: false, reason}` with reasons `missing_price`, `invalid_input`,
`down_payment_too_low`, `installment_too_low`, `too_many_months`, `no_matching_scenario`. Arabic
renderings are in `src/lib/projects.ts` `PLAN_REASON_LABELS`. `0020` S2 revokes `execute` from
`public, anon`: it is reachable only through the offer RPCs.

No schedule is persisted. The only durable figures are the snapshot columns a demand carries
(`0032`): `payment_mode`, `down_payment_percent_option_id`, `down_payment_percent`,
`down_payment_amount_millimes`, `total_financed_millimes`, `monthly_millimes`, `price_per_tree_millimes`,
`total_price_millimes`, `total_area_m2`, `area_per_tree_m2`, `spacing_class_id`, `spacing_label_ar`.
These describe what the visitor was shown, not an obligation.

### OBSERVATIONS — contracts and ownership

1. **`parcel_status = 'owned'` is a status with no owner.** Nothing records who owns the lot; the
   million counter folds `owned` into `trees_contracted` together with `contracting` and `sold`.
2. **`sold` is labelled `متعاقد عليها` (contracted), not "sold".** So the Back Office's `المباعة` stock
   bucket sums `sold` + `owned`, i.e. «contracted» + «owned», under the word "sold".
3. **`0024_audit_reason.sql` documents a reason convention for contracts and payments that has no
   subject.** Its setting text reads *«عدد الأحرف الأدنى لسبب تغيير الأسعار وحالات القطع والحجوزات
   والدفعات والعقود»*; the only RPCs that call `app.set_reason` are the pricing ones
   (`staff_save_project_spacing_classes` and the `0031`/`0045` pricing writers).
4. **`docs/gap-rapport-v3.md` and `docs/plan-rebuild.md` describe the contract chain as future work**
   (`P6` in `plan-rebuild.md`: *«حجوزات ← زيارات ← عقود ← دفوعات ← خدمات، وتاريخ حالات القطعة»*). The
   code agrees: nothing of it is built.
5. **The public copy promises a `وعد البيع` that the system cannot produce.** Five settings tell the
   visitor the final amount and duration are fixed «في وعد البيع»; there is no code path that creates,
   stores or prints such a document.

---

### CROSS-CUTTING NOTE ON THE VOCABULARY

The database keeps the v1 names (`projects`, `parcels`) while the product now speaks of **«العرض»** (the
offer) and **«القطعة»** / *lot*. `src/components/admin/nav-model.ts` fixes the mapping:
`"/admin/projects": "العروض"`, `"/admin/projects/parcels": "القطع"`, and
`"/admin/land-offers": "أراضٍ معروضة علينا"` — the landowner intake keeps its own name *"so the two stop
colliding on the word عرض"*. `src/app/admin/(panel)/projects/lots-table.tsx` and `…/stock.ts` use "lot"
throughout in code and `قطعة` in copy. `public.parcels` is the one table behind all of it.
