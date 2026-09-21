## 14. INCONSISTENCIES AND STATE

Scope of this section: §29 (inconsistencies / possible confusion), §30 (implemented vs partial vs
missing) and §33 (questions / unknown areas). Everything below is read off the repository at
`C:/Users/saif/Desktop/agrized`: `supabase/migrations/0001…0050`, `supabase/tests/001…031`,
`supabase/pending/`, `src/lib/`, `src/components/`, `src/app/(public)/`, `src/app/admin/`.

A note on the working tree: files under `src/app/(public)/` were being edited by another process while
this section was written. Every public file quoted below parsed as complete TSX when read
(`page.tsx`, `projects/page.tsx`, `projects/[code]/page.tsx`, `projects/[code]/[parcel]/page.tsx`,
`start/*`, `register/*`); none looked truncated. Nothing under `supabase/`, `src/lib/`,
`src/components/` or `src/app/admin/` is being edited.

---

## 29. INCONSISTENCIES / POSSIBLE CONFUSION

### 29.1 The word «عرض» carries four different meanings in one codebase

| Meaning | Where it lives | Evidence |
|---|---|---|
| **A. Land offered *to* AgriZed** by a landowner | `public.land_offers`, `public.land_offer_files`, `public.land_offer_reviews`, `public.submit_land_offer(jsonb)`, `public.review_land_offer(...)`, enum `public.land_offer_status`, route `/land`, flag `land_offers` | `supabase/migrations/0003_land_offers_and_intake.sql` |
| **B. AgriZed stock sold *to* a client** (= a row of `public.projects`) | setting `offers.title` = `'عروضنا'`, `offers.form_title`, `offers.trees_label`, `submit_offer_request`, `interest_requests.request_kind = 'offer'`, `offer_trees`, `offer_price_per_tree_millimes`, component `OfferCard`, type `OfferStock`, admin label `"/admin/projects": "العروض"` | `supabase/migrations/0050_offer_copy.sql`, `0049_offer_intake.sql`, `src/components/site/offer-card.tsx`, `src/components/admin/nav-model.ts` |
| **C. The price card of a *parcel*** | `app.parcel_offer_payload(uuid,uuid,uuid,boolean)`, `public.public_parcel_offer`, `public.staff_parcel_offer`, type `ParcelOffer`, component `OfferBlock`, `app.parcel_offered(project_status, parcel_status)`, `app.parcel_offer_statuses()` | `supabase/migrations/0020_public_projects.sql`, `src/lib/projects.ts`, `src/components/site/offer-block.tsx` |
| **D. A *kind* of thing on sale** («نوع العرض») | `OFFER_TYPE_LABELS` / `offerTypeOf()` in `src/lib/projects.ts`, filter control `<select name="type">` labelled `نوع العرض` on `/projects`; and, separately, `public.ownership_scenarios` seeded in `0027_offer_type_cards.sql` under the header “Offer-type cards as data” | `src/lib/projects.ts:78-92`, `src/app/(public)/projects/page.tsx` |

`src/components/admin/nav-model.ts` is the only place in the code that tries to separate A from B, and
it does it with a comment and two different labels:

```
"/admin/projects": "العروض",
"/admin/land-offers": "أراضٍ معروضة علينا",
```

with the note «"العروض" هو client-facing offer … so the two stop colliding on the word عرض». Nothing
enforces that separation elsewhere: `app.parcel_offered()` and `OfferBlock` keep meaning C on the same
public pages that call a project «عرض», and `submit_offer_request` writes meaning B into the same table
that `submit_land_offer` does not touch at all.

### 29.2 Simulator answers and customer requests are the same rows

`public.interest_requests` holds both intakes. `0049_offer_intake.sql` added a discriminator:

```sql
add column if not exists request_kind text not null default 'calculator',
...
add constraint interest_requests_kind_check check (request_kind in ('calculator', 'offer'));
```

* `public.submit_interest_request(jsonb)` (last redefined in `0032_intake_pricing.sql`) writes the
  **calculator** rows and never sets `request_kind`, so they take the column default.
* `public.submit_offer_request(jsonb)` (`0049`) writes `'offer'` rows.

The confusion is not in the table, it is in everything that reads it:

1. **`public.crm_requests` and `public.crm_search_requests` do not carry `request_kind`.** The view is
   `select r.*` but was last created in `0032_intake_pricing.sql`, before `0049` added the columns, and
   a view freezes its column list at creation. The search function names its columns one by one and
   also predates `0049`. This is stated in the code itself:

   `src/app/admin/(panel)/leads/offer-snapshot.ts`
   > “a client who asked for 25 trees of a named offer is indistinguishable in the leads list from
   > someone who moved a slider on /start.”

   The fix is drafted and **deliberately not applied**: `supabase/pending/bb_crm_offer_columns.sql`
   (“Deliberately not applied and not numbered”).

2. The Back Office therefore reads the discriminator from a **second query against the base table**
   (`offerSnapshots()` in `offer-snapshot.ts`, `select "id, request_kind, project_id, …" from
   interest_requests in (ids)`), and `src/app/admin/(panel)/leads/page.tsx` applies the
   `request_kind` filter **in JavaScript over one page of 50 rows**:

   ```ts
   const kindServerFiltered = !filters.request_kind || searchReturnsKind(rows);
   const visibleRows = kindServerFiltered ? rows : rows.filter((row) => kindOf(row) === filters.request_kind);
   ```

   The three `StatTile` figures above the table (`requests_total`, `persons_total`, `trees_total`) come
   from `crm_search_requests` and are **not** filtered by kind, so the tile count and the visible row
   count disagree whenever that filter is on. The page says so in a banner
   (`فلتر «…» مطبَّق على الصفحة المعروضة فقط…`), but the banner also claims
   «والتصدير CSV يحسبوا المطالب الأخرى معها» — which is **not** what the CSV does:
   `src/app/admin/(panel)/leads/export/route.ts` drops non-matching rows
   (`if (filters.request_kind && kind !== filters.request_kind) continue;`). The warning text and the
   export behaviour contradict each other.

3. **The public counter mixes the two.** `public.million_progress()` (`0025_million_counter_split.sql`)
   computes `trees_requested` as `sum(r.tree_count_min) from public.interest_requests r where not
   r.is_duplicate` with no `request_kind` filter, and `0049` writes `tree_count_min = v_trees` for an
   offer request. So «زيتونات مطلوبة» on the home page sums slider answers from `/start` together with
   real asks on a named offer. Same for `participants` and `requests`.

4. **`crm_demand_stats`** (`0032`) likewise has no `request_kind` dimension: `by_spacing_class`,
   `by_payment_mode`, `by_down_payment_percent`, `by_total_price_band` mix simulator answers (which
   have a spacing class and a payment mode) with offer requests (which have a spacing class copied from
   the offer, `payment_mode` null, and no down-payment percentage).

5. `0049` fills shared columns for an offer request so the existing CRM keeps working:

   ```sql
   false, array[v_project.governorate_id], true,       -- invest_anywhere, invest_governorate_ids, project_type_unsure
   'offer', v_trees_label, v_trees, v_trees,           -- tree_count_code/label/min/max
   ```

   The consequence is that an offer request appears in `by_invest_governorate` as if the person had
   *chosen* that governorate, and in `by_project_type` / `project_type_unsure` as «ما يهمّوش النوع»,
   which they never said. `tree_count_code = 'offer'` is a value the `tree_count` option list does not
   contain, so `crm_demand_stats.by_tree_count` puts it in its “retired card” union branch under the
   label snapshot `"<n> زيتونة"`.

### 29.3 Offer (project) vs parcel: two stock models, two price paths, two page shapes

The same visitor-facing catalogue carries two mutually exclusive models at once.

* **Sold whole (no parcels).** `src/app/(public)/projects/[code]/page.tsx` prices the offer from
  `getProjectQuote(project.id, mode, { trees: 1 })` and shows `OfferInterestForm`, gated on
  `offerTrees = project.tree_count ?? 0`. Stock comes from `offerStock()` fallback branch:

  ```ts
  const sold = project.status === "sold_out" ? total : 0;
  const selling = project.status === "published" || project.status === "internal";
  return { total, available: selling ? total - sold : 0, held: 0, sold, fromParcels: false };
  ```

* **Split into parcels.** The same page lists `ParcelCard`s and a `ParcelPlan`; each parcel has its own
  page `/projects/[code]/[parcel]` with either `TreeOfferBlock` (tree-priced) or `OfferBlock` (legacy).

Nothing prevents a project from being in both states, and when it is, the two counts are computed from
different sources: `offerStock()` prefers the parcels (`if (counted > 0)`) but `total` still prefers
`project.tree_count`, so `total` and the sum of the buckets can disagree. The admin side detects the
same disagreement as a warning rather than a rule
(`src/app/admin/(panel)/projects/[id]/page.tsx`):

```ts
if (project.tree_count !== null && stock.total + stock.trees.withdrawn > project.tree_count) {
  warnings.push({ text: `مجموع زيتونات القطع (…) أكبر من عدد أشجار العرض.` });
}
```

**The two intakes disagree about what the visitor is buying.** The offer form (`submit_offer_request`)
records `project_id` and `offer_trees`. The parcel page's CTA builds
`interestHref({ parcelId: parcel.id, … })` → `/register?parcel=<uuid>&…`, but **`/register` never reads
`parcel`**: `readCalculatorChoices()` in `src/app/(public)/start/calculator.ts` reads
`trees, trees_custom, scenario, spacing, payment, down_pct, duration` only, `RegisterWizard` contains no
`parcel` reference, and `submitInterest()` in `src/app/(public)/register/actions.ts` sends no
`parcel_id` to the RPC. The fifteen snapshot columns added for exactly this in
`0020_public_projects.sql` S10 — `parcel_id, project_id, project_code, project_name, parcel_code,
parcel_area_m2, parcel_property_type, parcel_plantation_system, parcel_olive_tree_count,
parcel_production_status, parcel_cash_price_millimes, parcel_plan_months, parcel_plan_total_millimes,
parcel_plan_last_millimes, parcel_captured_at` — are **never written by any migration or any Server
Action** (`grep -rn parcel_id src/` returns only `parcel-prices.ts` and a type alias). The migration's
own comment already anticipated this (“Filled by the public intake in a later migration; harmless until
then”), and that migration has not arrived. `0049` writes `project_id/project_code/project_name` for the
offer flow only.

Consequently the setting `projects.interest_banner`
(`'طلبك مرتبط بالقطعة {parcel} من مشروع {project}…'`, seeded `0020`) is dead copy: no file reads that
key. Same for `projects.picker_title` («احسب حسب إمكانياتك») and `projects.picker_nearest`.

### 29.4 The olive tree as the unit vs the square metre

The stated model (`0031_tree_pricing.sql`, `docs/tree-area-and-cost.md`) is “one olive tree **with its
area**”. The repository holds three different answers to “how much ground is one tree”:

1. **The spacing class** — `public.tree_spacing_classes.area_m2` is a *generated* column
   (`row_spacing_m * tree_spacing_m`). This is the authoritative one for pricing; `app.tree_price()`
   uses it.
2. **Derived from the project's two declared figures** — `areaPerTree()` in
   `src/app/(public)/projects/page.tsx`:
   ```ts
   if (project.area_per_tree_min_m2) return project.area_per_tree_min_m2;
   if (!project.total_area_m2 || !project.tree_count) return null;
   return project.total_area_m2 / project.tree_count;
   ```
3. **Derived from the parcel** — `src/app/(public)/projects/[code]/[parcel]/page.tsx`:
   ```ts
   parcel.area_per_tree_m2 ?? (parcel.olive_tree_count > 0 ? parcel.area_m2 / parcel.olive_tree_count : null)
   ```

The Back Office exposes the same three-way ambiguity explicitly, and labels the source
(`src/app/admin/(panel)/projects/[id]/page.tsx`): `source: "class" | "lots" | "declared"`.

This sits directly against `0012_projects_and_parcels.sql`, which was written for the opposite rule and
still carries the comment:

```sql
comment on column public.parcels.olive_tree_count is
  'Actual number of olive trees entered by the administration. Never computed from area_m2 (PARC-02).';
```

and against the seeded public copy `projects.intro` from `0020`:
«كل قطعة عندها مساحتها وعدد زيتوناتها … معطيات مستقلّة، ما نحسبوش وحدة من الأخرى». `0021` replaced that
text — but only «where it is still the seed» (`where key = 'projects.intro' and value = …`), so a site
whose owner had edited it keeps the contradicting sentence. Meanwhile `0035_projects_tree.sql` makes
area a *function* of trees for tree-priced projects:

```sql
if new.spacing_class_id is not null and coalesce(new.olive_tree_count, 0) > 0 then
  ...
  new.area_m2 := new.olive_tree_count * v_area;
```

and `app.spacing_area_fanout()` rewrites `parcels.area_m2` for every parcel of a class whose spacing is
edited. So for a tree-priced project “area is never computed from trees” is false in the database, while
the column comment and (possibly) the public copy still say it is true.

`public_parcels()` (0035) returns `coalesce((pr.p->>'total_area_m2')::numeric, pa.area_m2)` in the
`area_m2` slot, so the same column name means “the stored area” for a legacy parcel and “trees × area per
tree” for a tree parcel. `PublicParcel.area_m2` in `src/lib/public-projects.ts` does not distinguish them.

Residual m²-based vocabulary that is still live in code but whose backing list is switched off: the
`desired_area` option list is deactivated by `0032` (`update public.option_items set is_active = false
where list_key in ('desired_area','priority','monthly_installment','down_payment','budget')`), yet
`/projects` still renders a «المساحة» filter built from `optionsFor(config, "desired_area")` — which now
always yields an empty list, so the control shows only «الكل» and can never filter.

### 29.5 Simulated price vs offer price

Two different quote functions exist, and the difference is **which pricing scope** they use.

| | `/start` calculator | Offer / parcel pages |
|---|---|---|
| RPC | `public.public_tree_quote(spacing, trees, mode, down_pct, duration)` | `public.public_project_quote(project, spacing, trees, mode, down_pct, duration)` |
| Scope | **global rule only** — `app.tree_price(v_class.id, null)`, `app.down_payment_from_percent(v_total, …, null)`, `app.financed_quote(v_total, v_down, …, null)` | the project's rule — `app.tree_price(v_class_id, v_pj.id)`, `…, v_pj.id` |
| Down-payment percentages | every active item of `down_payment_percent` (`app.active_option`) | only the ones the project offers (`app.project_down_percent_items(v_pj.id)`) |
| Gate | `app.module_open('pricing')` | `app.module_open('pricing')` **and** `v_pj.status = 'published'` |

So the number a visitor sees on `/start` is, by construction, not the number any particular offer
charges. The code is aware of this and mitigates it with copy only — `calculatorSummary()` in
`src/app/(public)/start/calculator-summary.ts` wraps the two money rows in `start.from_prefix`
(«ابتداءً من»), with the comment «الـMain Form موش عرض», and the page prints `start.estimate_note`
(«هذا تقدير أولي حسب الإعدادات الحالية…»). There is no structural marker: `interest_requests`
stores the simulated figures in `price_per_tree_millimes` / `total_price_millimes`, and `0049` stores the
*offer's* figures in the **same two columns** as well as in `offer_price_per_tree_millimes` /
`offer_total_price_millimes`:

```sql
    spacing_class_id, spacing_label_ar, area_per_tree_m2, total_area_m2,
    price_per_tree_millimes, total_price_millimes,
...
    v_class_id, v_class_label, v_area_tree, v_area_total,
    v_per_tree, v_total,
```

A reader of `crm_search_requests.total_price_millimes` therefore cannot tell a simulated total from a
real offer total; only the un-exposed `request_kind` says which.

A second inconsistency inside the simulated price: `public_tree_quote` computes the down payment on the
*global* rounding (`app.down_payment_from_percent(v_total, v_percent.min_number, null)`), and so does
`submit_interest_request`, so the two agree with each other. `app.project_quote_payload` uses
`app.down_payment_from_percent(v_total, v_percent.min_number, v_pj.id)`. Same percentage, potentially
different dinar amount, with no wording that explains why.

### 29.6 The markup formula changed meaning without a rename

`0031` defined `app.financed_quote` as `total = cash × (1 + markup)` and `remaining = total − down`.
`0036_markup_on_remaining.sql` redefines it as:

```sql
v_base      := p_cash_total_millimes - p_down_millimes;
v_remaining := ceil(v_base * (10000 + v_bp) / 10000 / v_price_r) * v_price_r;
v_total     := p_down_millimes + v_remaining;
```

Same function name, same keys, different meaning of `total_financed_millimes`. Any snapshot taken in
`interest_requests.total_financed_millimes` before `0036` is on the old definition and is not marked as
such. Public copy for the row is `start.row_total_financed` = «السعر الجملي بالتقسيط» in both cases.

The “remaining” row on `/projects/[code]/[parcel]` compounds it: `TreeOfferBlock` computes
`remainingPercent` from `(total_price − down) / total_price` — a share of the **cash** price — and prints
it next to `remaining_millimes`, which is the **marked-up** remaining. So the line reads e.g. «80% ·
<amount larger than 80 % of the cash price>». The code comments this deliberately
(«owner 2026-09-16 … من المتبقي من الثمن بالحاضر»), but the percentage and the amount are not the same
quantity.

### 29.7 The same parcel status is counted in different buckets on the two sides of the app

| Status | Public `offerStock()` (`src/app/(public)/projects/page.tsx`) | Admin `STOCK_BUCKET_OF` (`src/app/admin/(panel)/projects/stock.ts`) | `app.parcel_offered()` (`0020`) | `million_progress()` (`0025`) |
|---|---|---|---|---|
| `available` | available | available | offered | — |
| `interested` | **held** (`HELD_STATUSES`) | **available** | offered only when `projects.offer_includes_interested` | — |
| `reserved` | held | reserved | not offered | `trees_reserved` |
| `contracting` | held | reserved | not offered | `trees_contracted` |
| `sold` | sold | sold | not offered | `trees_contracted` |
| `owned` | sold | sold | not offered | `trees_contracted` |
| `withdrawn` | excluded | withdrawn (outside total) | not offered | excluded from `planted` |

A parcel marked «مهتم بها» is “spoken for” on the public catalogue and “still available” in the Back
Office, from the same row.

`million_progress()` also double-counts: `trees_planted` is
`sum(...) filter (where pa.status <> 'withdrawn' and pj.status = 'operating')` while `trees_contracted`
is `sum(...) filter (where pa.status in ('contracting','sold','owned'))` with no project-status
condition. A sold parcel inside an `operating` project is counted in **both** tiles.

### 29.8 Module flags are read two different ways for the same module

`src/lib/modules.ts` defines `moduleAccess()` → `"open" | "preview" | "closed"`, where `internal` +
signed-in staff = `preview`. Pages disagree about which reading to use:

| Surface | Reading | File |
|---|---|---|
| `/projects`, `/projects/[code]`, `/projects/[code]/[parcel]`, `/projects/map` | `moduleAccess(config,"projects") !== "closed"` | those pages |
| `/start` (offers link), `/register` (offers after send) | `moduleAccess(config,"projects") !== "closed"` | `start/page.tsx:41`, `register/page.tsx:59` |
| **home page** offers section | `flagState(config,"projects") === "public"` | `src/app/(public)/page.tsx:60` |
| `/projects` price of a tree | `moduleAccess(config,"pricing") !== "closed"` | `projects/page.tsx:138` |
| **home page** price of a tree | `flagState(config,"pricing") === "public"` | `page.tsx:98` |
| `/register` gate | `moduleAccess(config,"interest_form")` | `register/page.tsx:41` |
| **offer page** form gate | `flagState(config,"interest_form") === "public"` | `projects/[code]/page.tsx:98` |
| **parcel page** CTA gate | `flagState(config,"interest_form") === "public"` | `[parcel]/page.tsx:75` |
| site header nav | `flagState(config,"projects") === "public"` | `src/app/(public)/layout.tsx:17` |

Result: with `projects = internal`, a signed-in staff member sees offers on `/projects` and on `/start`
but not on the home page and not in the header. With `interest_form = internal`, the same staff member
can open `/register` (preview) but sees no form on an offer page.

Server actions are inconsistent in the same way: `submitInterest()` checks `interest_form`;
`submitOfferInterest()` checks **only** `projects` and never `interest_form`, so the offer intake is not
governed by the registration flag at all.

### 29.9 The offer form can be shown where the database will refuse it

`src/app/(public)/projects/[code]/page.tsx`:

```ts
const selling = project.status === "published" || project.status === "internal";
const formOpen = selling && interestOpen && offerTrees > 0;
```

`public.submit_offer_request` (`0049`) accepts only:

```sql
if v_project.id is null or not (v_project.status = any (app.project_public_statuses())) then
  raise exception 'offer_not_available' using errcode = 'P0001';
```

and `app.project_public_statuses()` (`0020`) returns `['published']` plus `['sold_out','operating']` when
`projects.list_closed` is true — **never `internal`**. So:

* an **internal** offer previewed by staff renders a working-looking form whose every submission fails
  with «هذا العرض ما عادش متوفّر»; the action's own comment claims the opposite («Staff previewing an
  internal module may still send one, so the owner can try the flow before opening it»);
* a **sold_out** or **operating** offer would be accepted by the database but the page never shows the
  form for it.

### 29.10 Two visit concepts that do not meet

* The calculator flow records a wish: `interest_requests.wants_visit`, set from `?visit=1` →
  `RegisterWizard` → `submitInterest`. `crm_search_requests` filters on it (`wants_visit`) and
  `crm_demand_stats` reports `visit_yes`.
* The parcel page offers a second door: `visitCta = interestHref({ ...asked, visit: true })`, which
  works (it lands on `/register?…&visit=1`) but, per §29.3, loses the parcel.
* The offer page's visit door is `#offer-visit` → an `InfoCard` whose button is `href="#offer-form"`,
  i.e. the *same* offer form. `OfferInterestForm` has no visit field and `submit_offer_request` never
  writes `wants_visit`. So a visit asked from an offer page is recorded as an ordinary offer request,
  indistinguishable from one that did not ask for a visit.
* There is no `visits` table anywhere (`grep "create table" supabase/migrations/*.sql`), and the
  `visits` feature flag is `disabled` and absent from `IMPLEMENTED_MODULES`.

### 29.11 Two different “yearly” amounts, on the same screens

* `public.tree_pricing_rules.annual_fee_per_tree_millimes` (`0045_annual_fee.sql`, global default
  `150000` millimes) — “pruning, upkeep and follow-up”, per **tree**, inherited global → project.
  Surfaced as `annual_fee_per_tree_millimes` / `annual_fee_total_millimes` by `app.tree_price`,
  `public_tree_quote`, `app.parcel_price`, `app.project_quote_payload`. Copy:
  `start.row_annual_fee` = «معاليم الصيانة والتقليم في العام».
* `public.parcels.annual_costs_millimes` and `public.projects.annual_costs_millimes`
  (`0012_projects_and_parcels.sql`) — a typed figure per **parcel**. Surfaced by `public_parcels()` and
  `app.parcel_offer_payload` as `annual_costs_millimes`. Copy: hard-coded
  «المصاريف السنوية التقديرية» in `src/components/site/offer-block.tsx` and in the admin parcel page.

`app.parcel_price` (0045) makes them one field for a legacy parcel and the other for a tree parcel:

```sql
'annual_fee_per_tree_millimes', null,
'annual_fee_total_millimes', nullif(v_pa.annual_costs_millimes, 0),   -- legacy branch
...
'annual_fee_per_tree_millimes', v_annual,
'annual_fee_total_millimes', v_annual * v_trees,                       -- tree branch
```

Where each is shown is also inconsistent:

| Surface | Annual fee shown? |
|---|---|
| `/start` summary | yes (`calculator-summary.ts`, row key `annual_fee`) |
| Offer page form (`OfferInterestForm`) | yes (`annualFeePerTreeMillimes`) |
| Offer page facts / hero | no |
| **Parcel page, tree-priced (`TreeOfferBlock`)** | **no** — the component renders no annual figure at all |
| Parcel page, legacy (`OfferBlock`) | yes, but the *other* figure (`annual_costs_millimes`) |
| `ParcelCard`, `OfferCard` | neither |
| Admin parcel page | `annual_costs_millimes` only |

So on a tree-priced parcel page the yearly cost simply disappears, and on a legacy one it is a different
number under a different label.

### 29.12 Retired option lists that live code still depends on

`0032_intake_pricing.sql` deactivated five lists. Three of them are still read by code paths that remain
wired up:

| List | Still read by | Effect now |
|---|---|---|
| `down_payment` (amounts) | `app.parcel_down_from(uuid,bigint)` (0022) → `public_parcels().down_from_millimes` for legacy parcels; `app.parcel_offer_payload` `v_downs` | always empty / null → `ParcelCard` never shows «ابتداءً من … تسبقة» for a legacy parcel |
| `monthly_installment` | `app.parcel_offer_payload` `v_insts` | `v_plans`, `v_examples`, `entry` all empty → `OfferBlock` always prints «القسط: غير متاح بالقيم الحالية» and never renders the `projects.examples_title` block |
| `desired_area` | `/projects` «المساحة» filter (`optionsFor(config,"desired_area")`) | an always-empty `<select>` |

The whole legacy offer path (`public.compute_installment_plan`, `app.parcel_pricing`,
`app.parcel_offer_payload`, `public_parcel_offer`, `staff_parcel_offer`, `OfferBlock`,
`src/lib/pricing-form.ts`, `setting pricing.default`) is therefore reachable but cannot produce a plan
with the seeded data as `0032` leaves it. `src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx`
still renders a «محاكي التقسيط» form built from those two empty lists for legacy parcels.

`public.match_requests_for_parcel` (`0013`) also still scores on
`r.down_payment_min_millimes`, `r.installment_min_millimes`, `r.desired_area_min_m2`,
`r.priority_code` and `r.plantation_systems` — all of them snapshots of retired questions that new
demands no longer answer. A demand made after `0032` has `down_payment_min_millimes = null`,
`installment_min_millimes = null` and `desired_area_min_m2 = null`, so it scores
`s_down = 0`, `s_installment = 0`, `s_area = w.area * 0.6` — i.e. the matching engine systematically
scores new demands lower than old ones, and the parcel price it compares against is
`parcel.cash_price_millimes`, which is `0` for a tree-priced parcel (see `app.parcel_price`'s comment
«A parcel saved under tree pricing stores 0, which is never a price»).

### 29.13 Business values hard-coded in TypeScript, against the project rule

`CLAUDE.md`: *“Never hard-code business values (amounts, lists, texts, limits, module visibility).”*
Live counter-examples:

* `src/lib/projects.ts` — `OFFER_TYPE_LABELS` («زيتون منتج», «غراسة جديدة», «زيتون مكثّف», «أرض بيضاء»)
  and the classifier `offerTypeOf()`. The same four families exist as editable rows in
  `public.ownership_scenarios` (`0027_offer_type_cards.sql`, codes `big_productive`, `young_trees`,
  `intensive_grove`, `bare_land`, `any`). The two can drift, and the `/projects` filter uses the code
  copy while `/start` uses the database rows.
* `src/lib/projects.ts` — `PARCEL_STATUS_LABELS`, `PROJECT_STATUS_LABELS`, `PROPERTY_TYPE_LABELS`,
  `COST_KIND_LABELS`, `PLAN_REASON_LABELS`, `durationLabel()` («سنوات» / «شهراً»).
* `src/lib/parcel-prices.ts` — `PARCEL_PRICE_REASONS` (four Arabic sentences).
* `src/lib/errors.ts` — ~55 Arabic messages.
* `src/app/admin/(panel)/leads/filters.ts` — `PAYMENT_MODE_LABELS`, `REQUEST_KIND_LABELS`
  («محاكي» / «عرض»), `REQUEST_KIND_FILTER_LABELS`.
* `src/components/admin/nav-model.ts` — every Back Office section name.
* `src/lib/modules-catalog.ts` — `IMPLEMENTED_MODULES`, i.e. module visibility decided in code.
* `src/app/admin/(panel)/settings/modules/actions.ts` — a hard refusal to publish one module:
  ```ts
  if (key === "projects" && state.data === "public") { return { ok: false, message: "المشاريع تبقى «داخلي فقط» …" }; }
  ```
* `src/app/(public)/projects/page.tsx` — `const MAX_PRICE_DINARS = 10_000_000;` and the price filter
  `parcel.cash_price_millimes > filters.price * 1000`.
* `src/app/(public)/projects/[code]/offer-interest-form.tsx` — `const QUICK_PICKS = [1, 5, 10, 25, 50];`
* Several Arabic strings inline in JSX with no setting behind them: «سجّل مطلبك» (empty-state button on
  `/projects`), «شوف الولايات», «الولاية», «المعتمدية», «نوع العرض», «أقصى سعر حاضر (د.ت)»,
  «المتوفّر فقط», «صفّي», «مسح», «→ كل المشاريع», «مخطط القطع», «القطعة {code}», «المساحة»,
  «نوع العقار», «نوع الغراسة», «عمر الزيتونات», «حالة الإنتاج», «الري».

### 29.14 The public catalogue's filters act on parcels only

On `/projects`, `readFilters()` produces governorate, delegation, offer type, trees, area, max price and
“available only”; `matches()` is applied to **parcels** (`const shown = parcels.filter(...)`). The two
offer grids above and below are built from `projects` and are never filtered:

```ts
const open   = projects.filter((p) => p.status === "published" || p.status === "internal");
const closed = projects.filter((p) => p.status === "sold_out" || p.status === "operating");
```

So choosing «الولاية: صفاقس» leaves every offer card from every governorate on screen, and the
`projects.empty_text` message («ما فماش قطع متاحة بهذه المعايير توّا…») can appear under a full grid of
offers. The header figure `treesAvailable` is also unfiltered.

### 29.15 Smaller contradictions found

* **`/simulator` is dead but its module is “implemented”.** `src/app/(public)/simulator/page.tsx` is
  `redirect("/start")`; `CapacitySimulator` in the same folder is exported and referenced by nothing.
  `simulator_basic` is still seeded `public` (`0004`) and still listed in `IMPLEMENTED_MODULES`, and no
  file reads that flag.
* **`matching` is the reverse case.** The flag is `disabled` and *not* in `IMPLEMENTED_MODULES`, so the
  Back Office refuses to turn it on — yet `src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx`
  calls `match_requests_for_parcel` unconditionally and renders the results. The RPC itself gates only
  on `app.is_staff()`.
* **`projects.interest_marks_parcel`** (setting seeded `0020`, «البند 11.1: … ينقل طلب اهتمام عمومي قطعة
  «متاحة» إلى «مهتم بها» في نفس المعاملة») is read by nothing in SQL or TypeScript. No intake changes a
  parcel status.
* **`land_offer_status = 'converted'` and `projects.land_offer_id`.** The status can be set through
  `review_land_offer`, but no code ever writes `projects.land_offer_id`, so “converted” records an
  intention with no link.
* **Dead settings pairs kept alive by tests.** `0041_payment_hint.sql` states that
  `start.capacity_title`, `start.capacity_hint`, `start.capacity_title_fr`, `start.capacity_hint_fr`
  render nowhere («نقطة: 0040 put it in start.capacity_hint, which nothing reads»), yet the rows are kept
  because `supabase/tests/005_start_custom_trees.sql` asserts they exist. `0039` and `0040` both write
  into `start.capacity_hint`.
* **`million.goal` is still the bar's denominator but no longer announced.** `0044_goal_line.sql` sets
  `million.goal_label` and `million.goal_label_fr` to `''` and rewrites `million.bar_caption` to drop
  `{goal}` and `{share}` — while `0025` documents both placeholders and `MillionProgress.goal` is still
  fetched in `src/lib/million.ts`.
* **`crm_search_requests` returns `total_price_millimes` but not `price_per_tree_millimes`**, so the CRM
  list can show a total with no unit price behind it; the per-tree figure is only reachable from
  `interest_requests` directly (person page) or through `offerSnapshots()`.
* **Cross-layer import.** `src/app/(public)/page.tsx` and
  `src/app/(public)/projects/[code]/[parcel]/page.tsx` import `offerStock`, `areaPerTree`, `StockStrip`,
  `StockCell`, `LegalNotes`, `longestDuration`, `offersTitle` **from a page module**
  (`./projects/page`, `../../page`). Shared logic living in a route file.
* **Two `PAYMENT_MODES` constants** with the same values: `src/lib/tree-pricing.ts` and
  `src/app/admin/(panel)/leads/filters.ts`.
* **`formatCount` used where `formatArea` is expected**:
  `src/app/(public)/projects/[code]/page.tsx` renders
  `` `${formatCount(perTree)} – ${formatArea(project.area_per_tree_max_m2)}` `` — the low end of the
  range loses its unit.
* **`OfferCard` receives a `stock` object without `total`** when the map lookup misses
  (`?? { available: 0, held: 0, sold: 0 }`), which is valid for `OfferCardStock` but a different shape
  from the `OfferStock` the same file defines.

---

## 30. IMPLEMENTED VS PARTIAL VS MISSING

### 30.1 Fully implemented (schema + server logic + UI + role/RLS enforcement)

| Area | What exists | Key evidence |
|---|---|---|
| **Settings / copy as data** | `public.settings` with `is_public`, typed values, audit trigger, admin editor, cached loader | `0001`, `src/lib/config.ts`, `src/app/admin/(panel)/settings/` |
| **Feature flags** | `public.feature_flags` + `flag_state` enum, `app.flag_state`, `app.module_open`, `moduleAccess()`, admin toggle page with audit | `0001`, `0020`, `src/lib/modules.ts`, `settings/modules/` |
| **Audit log** | append-only `public.audit_logs`, `app.write_audit`, `app.audit_row_change` on 15+ tables, blocked UPDATE/DELETE/TRUNCATE, `public.log_action` for explicit acts, reason capture (`0024`), admin viewer | `0001`, `0024`, `/admin/audit` |
| **Roles, RLS, staff auth** | `app_role` enum, `user_roles`, `app.is_staff/is_admin/has_any_role/can_price/can_see_person`, RLS on every public table, `requireStaff()` in every Server Action, service-role client for public intake only | `0001`, `0002`, `src/lib/auth.ts`, `src/lib/supabase/admin.ts` |
| **Reference data** | governorates (INS codes, `0005`), delegations, option lists/items, lead statuses, ownership scenarios, spacing classes — all editable from `/admin/settings/lists` | `0002`, `0005`, `0010`, `0031` |
| **Calculator intake (`/start` → `/register`)** | Full loop: URL contract (`calculatorQuery` / `readCalculatorChoices`), server quote, six-step wizard, `submit_interest_request` with validation, throttling, LEAD-02 snapshots, dedup by phone, round-robin assignment, Arabic error mapping to a wizard step | `0030`, `0032`, `src/app/(public)/start/`, `src/app/(public)/register/` |
| **Landowner intake (`/land`)** | `submit_land_offer`, reference numbering, private storage bucket + signed download route, review stages with per-role gates (`review_land_offer`), admin list and detail | `0003`, `src/app/(public)/land/`, `/admin/land-offers/` |
| **Tree pricing engine** | `tree_spacing_classes`, `tree_pricing_rules` (global + per-project inheritance), `tree_cost_items`, `financing_markups`, `project_spacing_classes`, `project_down_payment_percents`, `app.tree_price`, `app.financed_quote`, `app.down_payment_from_percent`, duration cap triggers, 9 `staff_save_*` RPCs with reason + audit, full `/admin/pricing` page with a staff simulator | `0031`, `0036`, `0045`, `0046`, `src/app/admin/(panel)/pricing/` |
| **Public project/parcel read surface** | `public_projects`, `public_parcels`, `public_project_page`, `public_coverage`, `public_project_quote`, `public_parcel_offer` — all `security definer` with whitelisted columns and flag gates; anon has no table grant | `0020`, `0023`, `0034`, `0035` |
| **CRM list, filters, people mode, CSV export** | `crm_search_requests` with ~30 filters, per-person mode, whole-set totals; CSV with dynamic kind/offer/legacy column blocks, admin-only, logged | `0030`, `0032`, `src/app/admin/(panel)/leads/` |
| **Demand analytics** | `crm_demand_stats` (18 breakdowns), dashboard work queue, `/admin/analytics`, governorate tile map (`0029`) | `0028`, `0029`, `0032` |
| **Offer intake (`/projects/[code]` form)** | `submit_offer_request` + `OfferInterestForm` + `offer-actions.ts`, price snapshot from the same builder the page prices with | `0049`, `0050` |
| **Public counter** | `million_progress()`, `MillionCounter`, people bands (`0043`), all copy in settings | `0016`, `0025`, `0043`, `0044` |
| **Media** | `site_media` slots with credits (`0015`, `0018`), `project_media` gallery with cover, limit trigger and public bucket (`0023`), upload helpers | `src/lib/site-media-upload.ts`, `/admin/settings/media`, `projects/[id]/pictures-tab.tsx` |

### 30.2 Partially implemented

| Area | Working | Missing / broken |
|---|---|---|
| **Matching** | `match_requests_for_parcel(uuid,int)` with configurable weights (`matching.weights`, `matching.min_score`), staff gate, seniority tie-break, rendered on the admin parcel page; tested in `supabase/tests/003_pricing_matching.sql` | Scores on **retired** inputs (§29.12), so new demands are systematically undervalued; compares against `parcels.cash_price_millimes`, which is `0` for tree-priced parcels; no reverse direction (parcels for a person); the `matching` flag is `disabled` and unimplementable from the Back Office; no UI anywhere else; no notification when a match appears |
| **Inventory / stock** | Parcel rows with 7 statuses (`0012` + `0021`), tree counts, area sync from spacing (`0035`), admin lots table + all-lots page + plan tiles, stock strips, `staff_project_parcel_prices` | Status is a free `<select>` (`saveParcel` in `projects/actions.ts`) with no state machine, no transition history table (only the generic audit log), no reservation/hold semantics; `interested` is bucketed differently on each side (§29.7); no split/merge of a parcel; counters can exceed the project's declared tree count (warning only) |
| **The public catalogue** | Two grids, parcel cards, offer cards, detail pages, gallery, video, map page | Filters apply to parcels only (§29.14); the `projects` module **cannot be published** — `setModuleState` hard-refuses `public` for it; legacy parcels show no installment plan (§29.12) |
| **CRM ↔ offer link** | `request_kind`, offer columns, badges, filter control, CSV columns, person page rows | The filter and the totals are not server-side; the fix is written and unapplied (`supabase/pending/bb_crm_offer_columns.sql`) |
| **Visits** | `interest_requests.wants_visit`, `?visit=1` links, CRM filter, `visit_yes` in analytics, page copy `projects.visit_title` / `visit_text` / `visit_cta` | No `visits` table, no scheduling, no outcome, no assignment; the offer page's visit door submits an ordinary offer request (§29.10) |
| **Services (الخدمات الفلاحية)** | `agrized_service` option list (12 items, `0023`), `projects.service_option_ids`, home section `site.services_*`, project page «خدمات AgriZed في هذا المشروع», annual fee per tree (`0045`) | Names only — the migration says «Names only, no price»; no service table, no order, no schedule, no invoice; the annual fee is a single per-tree amount with no link to which services it covers; the `/admin` sections for services were removed (see `nav-model.ts`) |
| **SMS** | `message_templates`, `notification_outbox` with status enum, attempts, provider fields and a queue index; `app.enqueue_message` called by all three intakes; `sms.sender_id` and `sms.provider` settings with format validation | **No sender.** Nothing in `src/`, `scripts/` or `package.json` reads `notification_outbox`; there is no worker, cron, route handler or provider client. Rows accumulate in `pending` forever. No admin screen lists the outbox either |
| **Contracts** | `parcel_status` values `contracting` / `sold` / `owned`, lead stages `contracting` / `owner`, copy about «وعد البيع» | No `contracts` table, no document, no signature, no flag implemented (`contracts` is `disabled` and not in `IMPLEMENTED_MODULES`) |
| **Payments / instalments** | Full computation (`app.financed_quote`), rounding rules, markup per duration, snapshots on the demand | No `payments` table, no schedule table, no receipt, no reconciliation; `installments` flag `disabled` and unimplemented |
| **Reservations** | Nothing beyond a parcel status value | No `reservations` table, no deposit («العربون»), no expiry; `reservations` flag `disabled` and unimplemented |
| **Bank financing** | One boolean: `interest_requests.wants_bank_financing` (`0030`, “recorded to measure demand only”), a CRM filter and `bank_financing_yes` in analytics | No bank, no product, no rate, no application. `0031`'s header states «§54: bank financing is never computed here» |

### 30.3 Displayed but not operational

| What the user sees | Why it is not operational |
|---|---|
| `/projects` «المساحة» filter | built from the `desired_area` list, deactivated by `0032` → always empty |
| `/projects` «نوع العرض» filter | filters parcels only; the offer cards ignore it |
| Legacy parcel page «القسط» row and «أمثلة على الدفع بالتقسيط» block | `monthly_installment` and `down_payment` lists deactivated → `plans`/`examples` always empty → always «غير متاح بالقيم الحالية» |
| `ParcelCard` «ابتداءً من … تسبقة» on a legacy parcel | `app.parcel_down_from` reads the deactivated `down_payment` list → always null |
| Admin parcel «محاكي التقسيط» (legacy branch) | same two empty lists |
| Offer form on an `internal` offer | the DB refuses every submission (§29.9) |
| Offer page «نحب نزور الأرض» button | scrolls to the ordinary offer form; no visit is recorded |
| Parcel page «أنا مهتم بهذه القطعة» / «نحب نزور الأرض» | carries `?parcel=<uuid>` to `/register`, which ignores it (§29.3) |
| `/simulator` | `redirect("/start")`; `CapacitySimulator` unreferenced |
| Module row «المحاكي المبدئي «احسب قدرتك»» in `/admin/settings/modules` | togglable (it is in `IMPLEMENTED_MODULES`) but no code reads the flag |
| Module rows for `matching`, `visits`, `reservations`, `contracts`, `installments`, `zitounti`, `subscriptions`, `agri_backoffice`, `harvest` | shown with «يُبنى في دفعة قادمة»; `setModuleState` refuses any state but `disabled` |
| «المشاريع» module | shown as togglable, but `setModuleState` refuses `public` outright |
| Setting `projects.interest_banner` | read by nothing |
| Settings `projects.picker_title`, `projects.picker_nearest` | read by nothing |
| Setting `projects.interest_marks_parcel` | read by nothing |
| Settings `start.capacity_title/_hint/_title_fr/_hint_fr` | read by nothing (`0041` says so); kept because test 005 asserts them |
| Settings `million.goal_label`, `million.goal_label_fr` | emptied by `0044`; the counter hides the line |
| `land_offer_status = 'converted'` | no conversion writes `projects.land_offer_id` |
| `interest_requests` parcel snapshot columns (15 of them, `0020` S10) | never written |
| `notification_outbox` rows | never sent |
| `SectionNotOpen` component (`src/components/admin/section-not-open.tsx`) | exported, imported nowhere — the five sections it was written for were removed from the nav |

### 30.4 Domain summary

| Domain | Schema | Server logic | UI | Verdict |
|---|---|---|---|---|
| Matching | yes (`0013`) | yes | one admin panel | **Partial** — scores on retired inputs, blind to tree pricing |
| Reservations | **none** | none | a `parcel_status` value only | **Missing** |
| Contracts | **none** | none | statuses + copy only | **Missing** |
| Visits | one boolean column | intake + filters + stats | links and copy | **Partial (demand signal only)** |
| Payments / instalments | **none** (computation only) | `app.financed_quote` + snapshots | quote rows everywhere | **Partial (quotation only)** |
| Services | option list + per-project ids + annual fee | none | names on two pages | **Partial (catalogue only)** |
| Inventory | `projects`, `parcels`, spacing, prices | `app.parcel_price`, listings, stock helpers | full admin + public | **Partial (no events, no history table)** |
| SMS | `message_templates` + `notification_outbox` + settings | enqueue only | none | **Partial (write-only queue)** |
| WhatsApp | `channel = 'whatsapp'` on templates/outbox, `persons.whatsapp_e164`, `contact_channel` | enqueue only | one `wa.me` deep link from the person page, pre-filled from `lead.whatsapp_first_contact` | **Partial (manual deep link)** |
| Banking | one boolean column | none | one question + one CRM filter | **Missing (demand signal only)** |

---

## 33. QUESTIONS / UNKNOWN AREAS

These could not be determined from the repository. Where a partial answer exists, it is given and its
limit is named.

**Deployment and live state**

1. Which migrations are actually applied to the live database. The repo holds `0001…0050` plus
   `supabase/pending/bb_crm_offer_columns.sql`; `scripts/db-migrate.mjs` exists but no applied-migrations
   ledger is committed. *Could not determine from current codebase.*
2. The live values of `public.settings`, `public.feature_flags`, `public.option_items` and
   `public.tree_pricing_rules`. The repository contains seeds and conditional `update … where value = <seed>`
   statements only; every one of those guards implies the owner may have edited the row.
   *Could not determine from current codebase.*
3. Whether `projects`, `pricing` and `public_statistics` are currently `disabled`, `internal` or
   `public`. Seeds say `projects = 'disabled'` (`0004`), `pricing = 'internal'` (`0031`),
   `public_statistics = 'public'` (`0025`), and `setModuleState` refuses `projects = public`.
   The live state itself: *Could not determine from current codebase.*
4. Whether any real project, parcel, demand or land offer exists. `scripts/seed-demo-projects.mjs`
   exists; no fixture data is committed. *Could not determine from current codebase.*

**Intentions the code does not settle**

5. Whether the missing `?parcel=` handling in `/register` (§29.3) is a regression or a deliberate
   consequence of the “offer has its own form” decision of `0049`. `0020` S10 says the columns would be
   filled “by a later migration”; `0049` fills the *project* columns and not the parcel ones, and no
   comment states the parcel link was abandoned. *Could not determine from current codebase.*
6. Whether `interested` is meant to be “still available” (Back Office) or “spoken for” (public site).
   Both readings are written down as deliberate in their own files. *Could not determine from current codebase.*
7. Whether a project may legitimately be both sold whole (`tree_count`) and split into parcels, and which
   count then governs. The admin raises a warning when they disagree but nothing forbids it.
   *Could not determine from current codebase.*
8. What `financing_markups` should mean for a project after `0036` changed the base from the full cash
   price to the financed remainder. The seeded global rows (36→10 %, 48→14 %, 60→18 %, 84→25 %) carry an
   internal note saying they are the owner's provisional examples «تُراجع مع المالية قبل نشر الأسعار»;
   whether Finance has since confirmed them: *Could not determine from current codebase.*
9. Whether the `150000` millime annual fee is a placeholder or an approved figure. `0045` presents it as
   the owner's figure; there is no Finance sign-off in the repository.
   *Could not determine from current codebase.*
10. What `parcels.annual_costs_millimes` / `projects.annual_costs_millimes` are for now that
    `tree_pricing_rules.annual_fee_per_tree_millimes` exists, and whether the older field is meant to be
    retired. *Could not determine from current codebase.*

**Operational gaps with no design in the repository**

11. How queued SMS are meant to leave. `sms.provider = 'winsms'` and `sms.sender_id = 'AGRIZED'` are
    settings; no client, credential name, endpoint, retry policy or scheduler appears anywhere.
    *Could not determine from current codebase.*
12. Whether WhatsApp is meant to become an automated channel. The outbox accepts
    `channel = 'whatsapp'` and `app.enqueue_message` would honour a whatsapp template, but every seeded
    template is `sms` except `lead.whatsapp_first_contact`, which is used only to pre-fill a manual
    `wa.me` link. *Could not determine from current codebase.*
13. What a reservation is (deposit amount, hold duration, who may create one, what it locks).
    `docs/plan-rebuild.md` names it P6 and calls it «حجر الزاوية»; no schema or amount exists.
    *Could not determine from current codebase.*
14. Whether a parcel may be split so a client can buy 3 trees out of 10. `docs/plan-rebuild.md` lists it
    as open question 2, deferred to P6. *Could not determine from current codebase.*
15. Whether an offer request should hold stock. `docs/plan-rebuild.md` open question 3; the setting
    `projects.interest_marks_parcel` exists for the parcel case and is read by nothing.
    *Could not determine from current codebase.*
16. What the bank-financing product is. Only `wants_bank_financing` exists.
    *Could not determine from current codebase.*
17. How services are priced individually. `0023` explicitly says «Names only, no price», and the annual
    fee is one undifferentiated per-tree amount. *Could not determine from current codebase.*

**Verification gaps**

18. Migrations `0046_annual_fee_save.sql`, `0047_annual_fee_copy.sql`, `0048_offer_annual_fee.sql` and
    `0050_offer_copy.sql` have **no corresponding file in `supabase/tests/`** (the sequence stops at
    `030_annual_fee.sql` ↔ `0045` and `031_offer_intake.sql` ↔ `0049`). Whether that is intentional:
    *Could not determine from current codebase.*
19. There is no automated test of any kind for the TypeScript layer — no test runner in
    `package.json`, no `*.test.ts` anywhere. Every UI-level inconsistency listed in §29 is therefore
    unguarded.
20. Whether `supabase/pending/bb_crm_offer_columns.sql` is waiting on owner approval, on a numbering
    conflict with the parallel session, or on something else. Its header says “Deliberately not applied
    and not numbered”; the reason: *Could not determine from current codebase.*
21. The `pending` directory also holds `supabase/pending/tests/bb_crm_offer_columns.sql`. Whether other
    sessions hold further unapplied work outside this repository (the memory notes mention a second
    session `agrized-6d` sharing the repo with its own numbering range): *Could not determine from
    current codebase.*
