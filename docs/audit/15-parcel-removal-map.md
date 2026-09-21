## 15. PARCEL REMOVAL MAP

### What this file is

A map of everything that holds the parcel/lot layer up, so that the phase which retires it is **mechanical
rather than exploratory**. It changes nothing. It proposes no migration, and the removal it describes belongs
to a later phase with its own drafts and its own tests.

The owner's decision, in his words:

> «the unit is a tree not m carre» · «with each tree comes the space of it» · «remove the pieces thing, its
> simply selling the trees, but legally yes there is a piece — for our system it is not necessary» · «we just
> give each tree a number or an id and associate it with the client» · «there is a minimum of trees to buy, it
> depends on the offer».

So the target is: **an offer holds N trees; a tree has a code, a state and an owner; a client buys a number of
trees and the system assigns which ones.** The parcel is the layer standing between the offer and the tree, and
it has to go.

Wherever this file says *«what answers instead»*, it is describing the shape the later phase has to build, not
a migration anyone has agreed to. Object names written as `tree_units`, `tree_status` and `app.offer_price()`
are **placeholders for the reader**, chosen so the same idea has the same name on every page below. The owner
has not named them.

### Ground truth, 2026-09-18

| Fact | Value |
|---|---|
| `public.parcels` | **0 rows.** Every demo project and its 69 lots were deleted. |
| Rows pointing at a parcel | none — `interest_requests.parcel_id` has never been written by any intake (§A6) |
| Offers (`public.projects`, published) | 2 — `OFF-TNAYEUR` (100 trees, `trad_wide_24x24`, 576 m²/tree, 4,491 د per tree) and `OFF-AIRPORT` (500 trees, `int_7x7`, 49 m²/tree) |
| `app.project_on_tree_pricing` | true for both |
| Functions referencing parcels | **19** (§A4) |
| Triggers on `public.parcels` | **4** (§A3), plus 2 elsewhere that reach into the table |
| `parcel_status` values | **7** — available · interested · reserved · contracting · sold · owned · withdrawn |
| Source files mentioning a parcel | **44** — 43 hand-written + `src/lib/supabase/database.types.ts` (generated) |
| SQL test files pinning parcel behaviour | **12** (§C) |
| Migrations / tests on disk | `0050` / `031`. Numbers are claimed at apply time — a draft is not numbered. |

**The parcel layer is already empty and already bypassed.** Both live offers sell whole (§E2, §B1), every public
page falls through its no-parcel branch, and the only thing the layer still does in production is *cost nothing
and return zero*. That is what makes the removal tractable; it is also why every zero below has to be checked
against a real fixture, not against the live figures.

---

### A · THE DATABASE

#### A1 · `public.parcels` — the table

Created in `0012_projects_and_parcels.sql:63`. Twenty columns, four indexes, one unique constraint.

| Column | Type | Written by | What answers instead |
|---|---|---|---|
| `id` | uuid pk | default | `tree_units.id` — one row per tree, not per group |
| `project_id` | uuid → projects | `saveParcel()` | `tree_units.project_id` (the offer) |
| `code` | text, unique per project | `saveParcel()` | `tree_units.code` — «we just give each tree a number or an id» |
| `area_m2` | numeric(12,2) > 0 | typed on legacy; **computed** by `parcels_tree_unit_sync` on tree pricing | nothing. Area is a property of the *class* (`tree_spacing_classes.area_m2`), and «with each tree comes the space of it» — an offer's area is trees × area per tree, already computed by `app.tree_price` / `app.parcel_price` |
| `property_type` | `bare_land` \| `planted` | `saveParcel()` | moves to the offer. It is an offer-level fact, not a per-tree one |
| `plantation_system` | traditional \| intensive \| other | `saveParcel()` | already on `projects.plantation_system`; also implied by the spacing class |
| `olive_tree_count` | integer ≥ 0 | `saveParcel()` | **`count(*)` over `tree_units`.** This single column is the source of all four million-counter figures (§E) and of the whole Back-Office stock strip (§B3) |
| `tree_age_years` | numeric(4,1) | `saveParcel()` | offer-level (`projects.tree_age_years`), or per-tree if the owner ever wants it |
| `production_status` | none \| starting \| producing | `saveParcel()` | offer-level (`projects.production_status`) |
| `irrigation` | `irrigation_type` | `saveParcel()` | offer-level (`projects.irrigation`) |
| `cash_price_millimes` | bigint ≥ 0 | typed on legacy; stored as `0` on tree pricing | nothing. Price is trees × price per tree; `app.tree_price` already owns it |
| `annual_costs_millimes` | bigint ≥ 0 | typed on legacy | `annual_fee_per_tree_millimes` × trees — `app.parcel_price` already returns both (0045) |
| `pricing` | jsonb, nullable | `saveParcel()` — `null` on tree pricing | nothing. The legacy jsonb formula dies with the legacy path |
| `status` | `parcel_status`, default `available` | `saveParcel()` | **`tree_units.status`** — see A2 |
| `notes` | text ≤ 2000 | `saveParcel()` | offer-level note, or per-tree note if ever needed. Never public (PRJ-03) |
| `sort_order` | integer, default 0 | `saveParcel()` | ordering by `code` is enough for trees |
| `created_at` / `updated_at` / `updated_by` | timestamps + profile | defaults, `parcels_stamp` | same three columns on `tree_units` |
| `spacing_class_id` | uuid → `tree_spacing_classes`, `on delete restrict` | `saveParcel()`, or filled by `parcels_tree_unit_sync` | `tree_units.spacing_class_id`, or the offer's class when an offer has exactly one |

Indexes: `parcels_project_idx (project_id, sort_order)`, `parcels_status_idx (status)`, `parcels_area_idx
(area_m2)`, `parcels_spacing_class_idx (spacing_class_id) where not null`. Constraint: `unique (project_id,
code)` — the exact constraint a tree code needs too, so the later phase should keep its shape.

**RLS and grants** (`0012:100-133`). `revoke all … from anon`; `revoke insert, update, delete … from
authenticated`. Four policies: `parcels_select` (any staff, via `app.is_staff()`), `parcels_write` /
`parcels_update` (finance, admin, super_admin). No delete policy exists — **a parcel has never been deletable
through the API**, only by the migration owner. `tests/006:113,117` pins exactly this (`TRUNCATE` revoked,
`UPDATE` granted to authenticated). Any `tree_units` table needs the same revoke-before-grant opening or
Supabase hands anon full write access by default.

#### A2 · `public.parcel_status` — the enum

Created in `0012:9` with six values; `'owned'` added after `'sold'` by `0021_parcel_statuses_v2.sql:17`.
Spec v2 §28 order, pinned exactly by `tests/007:7-9`:

| # | Code | Arabic label lives in | Offered? | Visible? | Counter bucket (§E) | Stock strip bucket (§B3) |
|---|---|---|---|---|---|---|
| 1 | `available` | `src/lib/projects.ts` | yes | yes | — | `available` |
| 2 | `interested` | idem | only if `projects.offer_includes_interested` | yes | — | `available` |
| 3 | `reserved` | idem | no | if `projects.show_taken_parcels` | **trees_reserved** | `reserved` |
| 4 | `contracting` | idem | no | idem | **trees_contracted** | `reserved` |
| 5 | `sold` | idem | no | idem | **trees_contracted** | `sold` |
| 6 | `owned` | idem | no | idem | **trees_contracted** | `sold` |
| 7 | `withdrawn` | idem | no | **never** | excluded everywhere | `withdrawn` (outside the total) |

**What answers instead.** A new enum — `tree_status` — with the same seven meanings and its own name. Two
reasons it must be a new type rather than a reuse or an extension of `parcel_status`: (1) Postgres cannot use a
value added to an enum inside the transaction that adds it (`0021` hit this and says so in its header), and (2)
the `withdrawn`/`owned` distinctions are parcel vocabulary the owner has never used about a tree. The labels are
in TypeScript today (`PARCEL_STATUS_LABELS`), which the later phase should move to `option_items` or `settings`
rather than copy — Arabic copy a visitor reads must not sit in a `.ts` literal any more than in a SQL literal.

#### A3 · The triggers

**Four on `public.parcels`.** BEFORE triggers fire in name order, which is load-bearing here.

| Trigger | When | Function | What it does | What answers instead |
|---|---|---|---|---|
| `parcels_spacing_class_check` | BEFORE INSERT OR UPDATE OF `spacing_class_id`, `project_id` | `app.check_parcel_spacing_class()` (0034:22) | Takes `for share` on the project row, then refuses a class the project does not list — `parcel_spacing_not_in_project`. The share lock is what makes it safe against a concurrent `staff_save_project_spacing_classes`, which holds the project `for no key update` | the same guard on `tree_units`, same lock, same error code. Do not lose the `for share` — it is the only thing serialising the two writers |
| `parcels_stamp` | BEFORE UPDATE | `app.stamp_updated()` | `updated_at` / `updated_by` | same on `tree_units` |
| `parcels_tree_unit_sync` | BEFORE INSERT OR UPDATE | `app.parcel_tree_unit_sync()` (0035:15) | On a tree-priced project: fills `spacing_class_id` from the project's single class, then **overwrites `area_m2` with `olive_tree_count × class.area_m2`** | **nothing.** This trigger exists only to keep a derived area on a row that should not have one. One tree carries one class area; there is no group area to maintain |
| `parcels_audit` | AFTER INSERT OR UPDATE OR DELETE | `app.audit_row_change()` | Writes every change to `audit_logs` with old and new values (§51, AUD-01/02) | the same trigger on `tree_units`. **Historic `audit_logs` rows with `table_name = 'parcels'` must survive the removal** — the log is append-only and `src/app/admin/(panel)/audit/page.tsx:22` already has its Arabic label |

**Two elsewhere that reach into `parcels`:**

| Trigger | On | Function | What it does | After removal |
|---|---|---|---|---|
| `tree_spacing_classes_area_fanout` | AFTER UPDATE OF `row_spacing_m`, `tree_spacing_m` ON `tree_spacing_classes` | `app.spacing_area_fanout()` (0035:50) | When a class's spacing is edited, re-multiplies `area_m2` on every parcel of that class in a tree-priced project | **drops entirely.** With no stored group area there is nothing to fan out; `tree_spacing_classes.area_m2` is a generated column and every reader multiplies live |
| `project_spacing_classes_in_use` | BEFORE UPDATE OR DELETE ON `project_spacing_classes` | `app.check_project_class_in_use()` (0034:40) | Refuses dropping a class a parcel uses — `spacing_used_by_parcels` | **stays, retargeted** at `tree_units`. The error code and its Arabic message (`src/lib/errors.ts:55`) both name «القطع» and must be rewritten to name trees |

#### A4 · The 19 functions

Ordered by the migration that holds their **last** definition. A later migration can silently redefine a
function with `drop function if exists … ; create function …`, so the "last defined" column is the last
definition, not the first.

| # | Function | Last defined | Callable by | What it does | What answers instead |
|---|---|---|---|---|---|
| 1 | `app.parcel_pricing(uuid)` | 0013:137 | internal | Effective legacy jsonb formula: the parcel's own, else the project's, else `pricing.default` | **nothing.** Dies with the legacy path. `financing_markups` has been the single source of the markup per duration since 0031 |
| 2 | `public.match_requests_for_parcel(uuid, int)` | 0013:154 | authenticated, staff-gated | Scores registered people against one parcel on seven weights (location, project type, plantation, area, down payment, installment, priority). Raises `forbidden` for non-staff; a commercial sees their own files only | `match_requests_for_offer(project_id, …)`. Every weight already reads from the **project** (`governorate_id`, `project_type_id`) except `plantation_system` and `area`, which the offer and the spacing class carry. The «area» weight is the only one that has to be re-expressed: it should score on *trees requested vs. trees left*, not on m² |
| 3 | `public.million_progress()` | 0025:12 | anon, authenticated | The public counter. Three of its eight figures are sums over `parcels.olive_tree_count` | **§E — the most delicate object in this file** |
| 4 | `app.parcel_offer_statuses()` | 0020:62 | internal | `{available}`, plus `interested` when `projects.offer_includes_interested` | same helper over `tree_status` |
| 5 | `app.parcel_offered(project_status, parcel_status)` | 0020:72 | internal | **The single definition of «offered»**: a published project *and* an offerable parcel status. A closed project (`sold_out`, `operating`) never prices anything | the same one-line definition over `tree_status`. Keep it as one function — five callers depend on it agreeing with itself |
| 6 | `app.parcel_visible_status(parcel_status)` | 0020:78 | internal | Not `withdrawn`, and either offerable or `projects.show_taken_parcels` | same over `tree_status`. Note that with hundreds of tree rows, «show taken» becomes a *stock figure*, not a list of rows to render (§B1) |
| 7 | `app.parcel_offer_payload(uuid, uuid, uuid, boolean)` | 0020:92 | internal | Builds the whole offer card in one call: 21 keys — price, `down_from_millimes`, `down_options`, `installment_options`, `plans`, `examples`, `entry`, `chosen`, `suggested_tree_count_option_id`, `suggested_scenario_id`. `p_force_price = true` is the staff card: it prices whenever cash > 0, regardless of status. Never returns the jsonb formula, `model`, `markup_pct`, brackets, rates, `max_months` or `min_down_pct` | `app.offer_quote_payload(project_id, trees, …)`. Most of it already exists: `app.project_quote_payload` (0048:7) answers the same question for an offer. The genuinely parcel-shaped parts are `parcel_code`, `parcel_status` and the ownership-scenario match on `plantation_system` / `production_status`, which are offer fields anyway |
| 8 | `public.public_projects()` | 0035:157 | **anon** | The public offer listing. 28 columns. Six of them are parcel aggregates: `parcels_total`, `parcels_offered`, `min_cash_price_millimes`, `min_area_m2`, `max_area_m2`, `parcel_trees` | The six become tree figures: `trees_total`, `trees_available`, `trees_reserved`, `trees_sold`, plus `min_price_per_tree_millimes` and `area_per_tree_min/max_m2`, which **already exist and already answer without parcels**. This is the function whose shape changes most, and every change is a `RETURNS TABLE` change → forced drop → regenerated types → §B |
| 9 | `public.public_parcels()` | 0035:73 | **anon** | The public lot grid. 30 columns, limit `projects.listing_limit` (default 300, clamped 20–1000) | **disappears.** Nothing replaces a per-tree public listing: nobody wants 500 tree cards. Its one irreplaceable output is the per-offer stock split, which belongs on `public_projects()` (see #8) |
| 10 | `public.public_parcel_offer(uuid, uuid, uuid)` | 0020:376 | **anon** | The public offer card for one parcel. Gates on `app.project_visible` + `app.parcel_visible_status`, then delegates to #7 with `p_force_price = false` | **disappears.** §D says what a shared link must do |
| 11 | `public.staff_parcel_offer(uuid, uuid, uuid)` | 0020:398 | authenticated, staff-gated | Same payload, `p_force_price = true`, no flag or status gate | **disappears**, its job already done by `staff_project_quote` for an offer |
| 12 | `public.public_coverage()` | 0035:248 | **anon** | Per-governorate: `projects_count`, `parcels_total`, `parcels_offered`. Counts only, no money | keeps its shape, swaps its two parcel counts for `trees_total` / `trees_available`. Feeds `/projects/map` (§B1) |
| 13 | `app.parcel_down_from(uuid, bigint)` | 0022:35 | internal | Smallest `down_payment` option item that is below the cash price and at or above `min_down_pct` of it (report v3 §19) | superseded by `app.down_payment_from_percent(...)`, which `public_parcels()` **already** calls on the tree path (0035:117). The legacy helper dies with the legacy path |
| 14 | `app.check_parcel_spacing_class()` | 0034:22 | internal (trigger) | see A3 | retargeted at `tree_units` |
| 15 | `app.check_project_class_in_use()` | 0034:40 | internal (trigger) | see A3 | retargeted at `tree_units` |
| 16 | `app.parcel_price(uuid)` | 0045:243 | internal | **The one definition of a parcel's price.** On tree pricing: `trees × app.tree_price(class, project)`, plus `total_area_m2`, `annual_fee_per_tree_millimes`, `annual_fee_total_millimes`, and `pricing` ∈ `ok` / `unavailable` / `legacy` with a `reason` (`spacing_required`, `spacing_not_allowed`, `trees_missing`). Legacy: the typed area and cash price, `nullif(…, 0)` so a stored `0` is never a price | `app.offer_price(project_id, trees)` — the same body with `v_trees` as an **argument** instead of `v_pa.olive_tree_count`, and no legacy branch. This is the cleanest lift in the whole removal: the function is already about trees, and only three of its lines read the parcel row |
| 17 | `app.parcel_tree_unit_sync()` | 0035:15 | internal (trigger) | see A3 | nothing |
| 18 | `app.spacing_area_fanout()` | 0035:50 | internal (trigger) | see A3 | nothing |
| 19 | `public.staff_project_parcel_prices(uuid)` | 0035:276 | authenticated, staff-gated | `app.parcel_price` for every parcel of a project, in one call. No module gate | disappears; an offer has **one** price (`staff_project_quote`), so the N-row call has no subject |

**Grants worth writing down**, because a new object silently gets the opposite by default: every `app.*`
function above is revoked from `public, anon, authenticated`; the four `public.public_*` are revoked from
`public` then granted to `anon, authenticated`; the two staff functions are revoked from `public, anon` then
granted to `authenticated` and check `app.is_staff()` *inside the body* as well. `tests/006:170-198` and
`tests/021:101-107` assert this whole posture, function by function.

#### A5 · No views over parcels

There is no `parcels` view. `public.crm_requests` is a view (`select r.*` over `interest_requests`) and it
exposes the parcel snapshot columns of A6 — that is the only view in the system carrying parcel data, and it
carries it as frozen column names, not as a join.

#### A6 · The snapshot columns on `interest_requests` — dead weight that tests pin

`0020:469-490` added fourteen columns and an index:

`parcel_id` (→ parcels, `on delete set null`), `project_id`, `project_code`, `project_name`, `parcel_code`,
`parcel_area_m2`, `parcel_property_type`, `parcel_plantation_system`, `parcel_olive_tree_count`,
`parcel_production_status`, `parcel_cash_price_millimes`, `parcel_plan_months`, `parcel_plan_total_millimes`,
`parcel_plan_last_millimes`, `parcel_captured_at`; plus `interest_requests_parcel_idx (parcel_id) where not
null`.

**No intake has ever written any of them.** `grep -n parcel_id supabase/migrations/*.sql` outside 0020 returns
exactly one hit, and it is the unrelated `RETURNS TABLE` column of `staff_project_parcel_prices`. `0049`
introduced the offer intake and gave it its **own** columns (`request_kind`, `offer_trees`,
`offer_price_per_tree_millimes`, `offer_total_price_millimes`, the annual-fee pair) rather than filling these.

Two consequences for the removal:

1. `public.crm_requests` is `select r.*` and freezes its column list at creation time. Dropping a column forces
   the view to be dropped and recreated — the same mechanic `supabase/pending/bb_crm_offer_columns.sql`
   documents at length, and the same TypeScript fallout (`db:types`, then `filters.ts`, `leads/page.tsx`,
   `leads/export/route.ts`, `leads/actions.ts`).
2. `tests/016:204-207` and `tests/018:284-289` both assert that `crm_requests` **exposes** `parcel_id`,
   `project_code`, `parcel_code`, `parcel_plan_months` and `parcel_captured_at` by name. Those two assertions
   have to be rewritten in the same commit that drops the columns, or `npm run db:test` fails on a green
   database.

`parcel_id`'s `on delete set null` means dropping the `parcels` table needs the FK gone first — but with zero
rows and zero writers, nothing is lost by dropping the columns outright.

#### A7 · Settings, media and copy

| Key | Group | Read by | After removal |
|---|---|---|---|
| `legal.parcel_card_note` | legal | `offer-block.tsx:14`, `tree-offer-block.tsx:31`, `(public)/page.tsx:227`, `projects/page.tsx:461`, `settings/actions.ts:23` | **keep the row, rename nothing.** It is the mandatory notice under every offer card (PARC-11 / clause 25.6), it already talks about trees and spacing, and it is printed on five surfaces. Its *key* names a parcel; its *text* does not |
| `projects.detail_parcels_title` | projects | `projects/[code]/page.tsx:364` | dies with the lot grid |
| `projects.parcel_cta` | projects | the parcel page CTA | folds into the offer CTA |
| `projects.show_taken_parcels` | projects | `app.parcel_visible_status` | becomes «show the taken figure», not «list taken rows» |
| `projects.offer_includes_interested` | projects | `app.parcel_offer_statuses` | same meaning over `tree_status` |
| `projects.interest_marks_parcel` | projects | **nothing reads it** — seeded `false` in 0020 and never wired | delete |
| `projects.listing_limit` | projects | `public_parcels()` only | dies with #9 |
| `site.parcels_title`, `site.parcels_text`, `site.parcel_examples` | site | **nothing reads them.** `0033_home_unit.sql:42` deleted the three `home.parcel_*` media slots they went with, but left the settings rows | delete. `tests/019:36` already asserts the media slots are gone |

---

### B · THE SOURCE FILES

44 files mention a parcel: 43 hand-written, plus the generated `src/lib/supabase/database.types.ts`. Grouped by
what they actually do with one. **«Names a type» files cost nothing to leave behind for a release; «renders» and
«counts» files are the work.**

#### B1 · Public pages (5)

| File | Mentions | What it does | Work |
|---|---|---|---|
| `src/app/(public)/projects/[code]/[parcel]/page.tsx` | 51 | **Renders one parcel.** Reads `findParcel`, `getParcelOffer` (→ `public_parcel_offer`) or `getProjectQuote`; `notFound()` on a bad code (`:41`), an unknown parcel (`:53`) or a null offer (`:71`). Imports `offerStock` and `StockStrip` from `../../page` | **the route is deleted.** §D says what its URL must do afterwards |
| `src/app/(public)/projects/page.tsx` | 47 | **Renders the lot grid and owns the stock arithmetic.** `offerStock()` (`:71`) and `matches()` (`:299`) live here; also exports `StockStrip`, `StockCell`, `offersTitle`, `areaPerTree`, `offerTreePrice`, `offerCardLabels`, `longestDuration`, `LegalNotes`, all imported by the offer page and the home page | the grid (`:212-245`) and `matches()` go. `offerStock()` **moves into Postgres** — its filters on `status` are exactly `public_projects()`'s job, and money must not be arithmetic in TypeScript |
| `src/app/(public)/projects/[code]/page.tsx` | 31 | **Renders one offer.** Filters `parcels` to `own` (`:78`), calls `offerStock` (`:79`), computes `hasTaken` (`:84`), renders `<ParcelPlan>` tiles (`:373-384`) and a `<ParcelCard>` per lot (`:386-393`). `:96` gates payment and visits on «a project that still sells parcels» | the two grids go; the offer's own quote (`getProjectQuote`) already carries everything the page prints |
| `src/app/(public)/page.tsx` | 11 | **Counts.** `liveOffers()` (`:43`) fetches `getPublicParcels` alongside `getPublicProjects` purely to feed `offerStock(offer, parcels)` (`:218`); also prints `legal.parcel_card_note` (`:227`) | drop the second fetch. The card keeps its stock figures, now from `public_projects()` |
| `src/app/(public)/projects/map/page.tsx` | 2 | **Counts.** Prints `parcels_total` and `parcels_offered` per governorate from `public_coverage()` | two field renames once #12 changes |

#### B2 · Public components (9)

| File | Mentions | Role |
|---|---|---|
| `src/components/site/parcel-card.tsx` | 31 | **Renders a parcel.** Deleted with the grid |
| `src/components/site/parcel-plan.tsx` | 8 | **Renders parcels** as status-coloured tiles (report v3 §21). Deleted — or kept and retargeted if the owner ever wants a *tree* plan, which he has not asked for |
| `src/components/site/offer-block.tsx` | 6 | Legacy money block; prints `legal.parcel_card_note` (`:14`). `:46` reasons about «this parcel's minimum» | dies with the legacy path |
| `src/components/site/tree-offer-block.tsx` | 3 | The tree money block. Already tree-shaped; only its comments and the note key mention a parcel | comments only |
| `src/components/site/home-paths.tsx` | 3 | A **decorative SVG** named `ParcelMark()` (`:74`) | rename at leisure, or never |
| `src/components/site/offer-card.tsx` | 2 | Two doc comments referencing `PARCEL_STATUS_LABELS` | comments only |
| `src/components/site/sticky-cta.tsx` | 1 | Comment naming the parcel page as a caller | comment only |
| `src/components/site/site-photo.tsx` | 1 | Comment: «a record (project, parcel)» | comment only |
| `src/components/ui/*` — `data-row`, `data-table`, `empty-state`, `stat-tile`, `status-pill` | 1–4 each | **Doc comments citing parcel call sites by file and line.** They document *where each variant is used*, so they go stale the moment the routes move, and they are the easiest thing in this list to forget |

#### B3 · Admin pages and helpers (14)

| File | Mentions | What it does | Work |
|---|---|---|---|
| `src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx` | 40 | **The lot page.** Calls `staff_parcel_offer` (`:94`, `:97`) and `match_requests_for_parcel` (`:106`) | route deleted |
| `src/app/admin/(panel)/projects/[id]/page.tsx` | 35 | The offer page; owns the lots tab's data | the tab goes |
| `src/app/admin/(panel)/projects/parcels/page.tsx` | 29 | **`/admin/projects/parcels`** — every lot of every offer, filtered by status and offer | replaced by a **tree inventory** screen, which is the screen «we give each tree a number and associate it with the client» actually needs |
| `src/app/admin/(panel)/projects/parcel-fields.tsx` | 26 | The lot form (shared by «add» and «edit»). `saveParcel()` reads exactly these field names | deleted |
| `src/app/admin/(panel)/projects/actions.ts` | 21 | **`saveParcel()`** (`:204-300`) — the only write path into `parcels`; `parcelError()` (`:194`) maps `parcel_spacing_not_in_project` and the duplicate-code error to Arabic | replaced by an offer-level «set the tree count» action plus per-tree status writes |
| `src/app/admin/(panel)/page.tsx` | 11 | **The dashboard.** Reads `.from("parcels")` directly (`:62`) for the «القطع المهتم بيها» list, prices them through `staff_project_parcel_prices` (`:131`), links to lot pages (`:217`, `:237`), and links to `/admin/projects/parcels?status=interested` (`:212`) | retargeted at trees |
| `src/app/admin/(panel)/projects/stock.ts` | 8 | **The stock model.** `STOCK_BUCKET_OF` maps all seven statuses to four buckets; `treeStock()` sums `olive_tree_count` per bucket in TypeScript, tracks `lotsWithoutTrees` and `hasHeldLots` | **the most valuable file to read before designing the tree table.** Its four buckets, its «الموقوفة sits outside the total» rule and its refusal to invent reservations are the owner's stock vocabulary, already written down. The arithmetic moves to Postgres; the vocabulary stays |
| `src/app/admin/(panel)/projects/[id]/lots-tab.tsx` | 7 | The «القطع» tab: plan + table + add form | deleted |
| `src/app/admin/(panel)/projects/page.tsx` | 7 | **Counts.** `.from("parcels").select("project_id, status, olive_tree_count")` (`:37`) grouped per project, plus the link to `/admin/projects/parcels` (`:67`) | retargeted at trees |
| `src/app/admin/(panel)/projects/lots-table.tsx` | 4 | One lots table, used by the offer tab and by `/admin/projects/parcels` | deleted or retargeted |
| `src/app/admin/(panel)/projects/stock-strip.tsx` | 4 | Renders `treeStock()`; prints `parcelStatusLabel` / `parcelStatusTone` per row | label source changes |
| `src/app/admin/(panel)/audit/page.tsx` | 2 | Maps `parcels` → «القطع» (`:22`) | **keep.** Historic audit rows still name the table |
| `src/app/admin/(panel)/projects/[id]/identity.tsx`, `pricing-tab.tsx` | 1 each | Comments naming `app.parcel_price` | comments only |
| `src/app/admin/(panel)/admin-nav.tsx`, `settings/actions.ts` | 1 each | A nav comment; the `legal.parcel_card_note` key in the settings allow-list | nav comment dies with the route; the settings key **stays** |

#### B4 · Admin components (3)

`src/components/admin/nav-model.ts` (2 — the `"parcels"` nav key and the `/admin/projects/parcels` → «القطع»
label), `nav-icons.tsx` (1 — the `parcels:` icon), `legacy-pricing-notice.tsx` (2 — comments about the jsonb
editors on «project, parcel, pricing.default»). All three move with the routes.

#### B5 · `src/lib` (7)

| File | Mentions | Role |
|---|---|---|
| `src/lib/public-projects.ts` | 26 | **The public data layer.** `getPublicParcels()` (`:176`), `getParcelOffer()` (`:225-237`), `findParcel()` (`:356`), the `PublicParcel` type, and `parcels_total` / `parcels_offered` / `parcel_trees` on both `PublicProject` and the coverage row | the three parcel functions go; the types follow `public_projects()` |
| `src/lib/parcel-prices.ts` | 22 | **Whole file is the parcel price bridge**: `getStaffParcelPrices()` (`:58` → `staff_project_parcel_prices`), `effectiveParcelFigures()` (`:70`), `PARCEL_PRICE_REASONS` | deleted; the offer quote already answers for an offer |
| `src/lib/projects.ts` | 18 | `ParcelStatus` type, `PARCEL_STATUS_LABELS`, `parcelStatusLabel()`, `parcelStatusTone()`, `offerTypeOf(parcel)` (`:76` — the four offer families of report v3 §3/§18, read off `property_type` / `plantation_system` / `production_status`), and the `ParcelOffer` payload type (`:152`) | `offerTypeOf` already reads only fields the **offer** carries, so it lifts unchanged. The status helpers become tree-status helpers |
| `src/lib/public-hrefs.ts` | 4 | `parcelHref()` (`:20`), and `interestHref({ parcelId })` (`:42`) which writes a `parcel=` query parameter onto `/register`. **Nothing under `src/app/(public)/register/` reads that parameter** — it is a dangling thread, harmless and already dead | `parcelHref` goes; drop the `parcel` param at the same time |
| `src/lib/errors.ts` | 2 | Arabic messages for `parcel_spacing_not_in_project` and `spacing_used_by_parcels` (`:54-55`) — both name «القطع» to the user | rewritten to name trees when the guards are retargeted |
| `src/lib/pricing-form.ts` | 1 | Comment about the jsonb fallback chain | comment only |
| `src/lib/supabase/database.types.ts` | 78 | **Generated.** Every `RETURNS TABLE` change forces `npm run db:types`, and nothing typed from it compiles until that is run | mechanical, but it gates every other file in B |

**Not in the 44, but affected:** `src/lib/million.ts:29` calls `million_progress()` and reads its keys. It never
says «parcel», so a grep for the word misses it — and it is the one consumer of §E.

---

### C · THE TESTS

Twelve SQL test files pin parcel behaviour. Named assertions are the ones that must be rewritten, not merely
re-run.

| Test | Parcel lines | Assertions that would have to change |
|---|---|---|
| `003_pricing_matching.sql` | 21 | PARC-01/02 as such: «both parcels share the same area» then «the tree count does not follow the area» / «the price does not follow the area» (`:82-90`) — the whole independence rule is stated on parcels. `match_requests_for_parcel` is exercised four times (`:139-160`), including «a productive parcel serves the "productive" priority (PARC-09)» and the RLS check «a commercial can read parcels» (`:176`) |
| `006_public_projects.sql` | 108 | The largest. anon cannot read `public.parcels` (`:96`); `TRUNCATE` revoked / `UPDATE` granted (`:113,117`); finance inserts and a commercial cannot (`:133-149`); the four anon-callable RPCs and the four internal `app.parcel_*` helpers by exact signature (`:173-197`); **`pg_get_function_result('public.public_parcels()')` must not match an internal-column regex (`:222-224`)**; `parcels_total = 5` / `parcels_offered = 1` (`:246-247`); the exact code array `['P01','P02','P03','P04','P06']` (`:257`); taken parcels show no price (`:264-266`); `projects.show_taken_parcels = false` hides taken rows (`:275`) |
| `007_parcel_statuses_v2.sql` | 14 | **The whole file is about `parcel_status`.** `:7-9` pins the seven labels in `enumsortorder`. Then: an owned parcel is listed as taken, never offered, never priced (`:39-43`); **«a shared link to an owned parcel still resolves»** with zero plans (`:48-51`) — the sentence §D turns on; `parcels_total = 2 and parcels_offered = 1` (`:54`); coverage still counts the available one (`:57`) |
| `008_cards_and_costs_v3.sql` | 12 | Report v3 §19: `down_from_millimes` = 500000 on a 5,000 د parcel, 1,500000 on a 15,000 د one (`:54-58`); a reserved parcel shows no money (`:66`); the whitelist regex on `public_parcels()` (`:70`); `app.parcel_down_from` closed to visitors (`:72`) |
| `010_audit_reason.sql` | 1 | A comment only: «stands in for a real sensitive RPC (a price or parcel-status change)». No assertion moves |
| `011_million_counter_split.sql` | 8 | **§E. The exact deltas.** Rewritten wholesale |
| `016_intake_v3.sql` | 2 | `crm_requests` exposes `parcel_id`, `project_code`, `parcel_code`, `parcel_plan_months`, `parcel_captured_at` (`:204-207`) |
| `018_intake_pricing.sql` | 3 | The same column-presence assertion (`:284-289`) |
| `019_home_unit.sql` | 2 | Asserts the `home.parcel_%` media slots are **gone** (`:36-37`). This one **stays true** after the removal and needs no change |
| `020_project_quote.sql` | 31 | `app.parcel_price` closed to anon and authenticated (`:160-161`); six priced cases by exact millimes — «a parcel of 20 trees at 938 د each costs 18,760 د on 700 m²» (`:176`), «the only class of a project prices a parcel without one: 25 × 500 د = 12,500 د» (`:187`), a parcel without a tree count (`:192`), the legacy pair (`:194-200`), `app.parcel_price(unknown) is null` (`:203`); the two guards raising `parcel_spacing_not_in_project` and `spacing_used_by_parcels` (`:212-237`) |
| `021_projects_tree.sql` | 38 | The tree-unit sync: «the only class of the project is stored on the parcel» (`:51`), «more trees, more area (25 × 35 = 875 m²)» (`:55`), a legacy parcel keeps its typed area (`:60`); `public_parcels()` area and area-per-tree (`:77`), a reserved tree parcel shows no money (`:85`), a legacy parcel keeps its typed price (`:90`); `parcels_offered = 1 and min_cash_price_millimes = 20 × price` (`:95`); coverage ≥ 2 (`:97`); **the whitelist regex `!~ '(margin\|land\|planting\|extras\|markup\|cost_per)'` on `public_parcels()` (`:101`)**; `staff_project_parcel_prices` closed to anon (`:105`) and returning 2 rows including a reserved parcel (`:169-175`); **T5 — editing a class area moves parcel areas, legacy ones untouched (`:181-193`)** |
| `030_annual_fee.sql` | 7 | «A parcel carries the fee for its own trees» (`:116-129`) and `app.parcel_price` closed to anon/authenticated (`:142`) |

Two patterns to carry forward rather than delete:

- **The whitelist regexes.** `tests/006:222` and `tests/021:101` assert that a public function's `RETURNS TABLE`
  signature contains no word matching `margin|land|planting|extras|markup|cost_per` (and
  `pricing|notes|updated_by|legal|land_offer|latitude|longitude` in `tests/008:70`). Any replacement public
  function needs the identical assertion written against **its** name, or PRJ-03 loses its automatic guard.
- **The delta discipline.** `006`, `011` and `021` all say «runs on the live database» and measure their own
  fixtures relatively, because the catalog may hold other rows. Replacements must keep that.

---

### D · THE PUBLIC SURFACE THAT DISAPPEARS

**The route.** `/projects/[code]/[parcel]` — `src/app/(public)/projects/[code]/[parcel]/page.tsx`. Links to it
are generated by `parcelHref()` from three places: the lot grid on `/projects` (`:238`), and the offer page's
plan tiles and cards (`:380`, `:390`).

**The RPCs.** `public.public_parcel_offer(uuid, uuid, uuid)` (anon) and `public.staff_parcel_offer(uuid, uuid,
uuid)` (staff). Both delegate to `app.parcel_offer_payload`; the only difference is `p_force_price`.

**What a shared link must do afterwards.** Today the behaviour is deliberate and documented in the migration
itself (`0020:394`): *«Taken parcels return offered = false with empty plans so shared links never 404.»* A link
to a reserved, sold or owned parcel resolves, shows the parcel as taken, and shows no price. `tests/007:48-51`
asserts it in as many words — «a shared link to an owned parcel still resolves», with `jsonb_array_length(o →
plans) = 0`. The page 404s only for a malformed code, an unknown parcel, or a parcel whose project is not
visible.

That intent has to survive the removal, and it cannot survive as-is, because after it there is no parcel for the
URL to resolve to. The behaviour that keeps the promise:

1. **`/projects/[code]/[parcel]` redirects (308) to `/projects/[code]`.** The offer still exists, it is what the
   sharer was talking about, and the visitor lands on a real page rather than a 404 — the same instinct 0020
   had, one level up.
2. **404 only when the offer code itself is unknown or not visible**, exactly as `/projects/[code]` already
   does. No new 404 surface is created.
3. **Do not silently drop the parcel segment into a query parameter.** Nothing would read it — `/register`
   already ignores the `parcel=` parameter `interestHref()` writes (§B5) — and a parameter nobody reads is how
   the dangling thread got there the first time.

The redirect is a public-surface change and should land **before** the RPCs are dropped, so that a shared link
never has a window where it resolves to a page whose data call has already gone.

---

### E · `million_progress()` — THE FOUR TREE FIGURES

`public.million_progress()` (last defined `0025_million_counter_split.sql:12`) returns eight keys. The module
gate is unusual and must be preserved: it returns `null` to API callers while `public_statistics` is closed,
**but a direct database session with no JWT — migrations, tests, scripts — always reads**, which is the only
reason `tests/011` can measure it at all.

Read by `src/lib/million.ts:29` and rendered on the home page.

#### E1 · How each figure is computed today

All three parcel figures come from one subquery:

```
from public.parcels pa
join public.projects pj on pj.id = pa.project_id
```

| Key | Today, exactly | Note |
|---|---|---|
| `trees_requested` | `coalesce(sum(r.tree_count_min), 0)` over `interest_requests r where not r.is_duplicate` | **not a parcel figure.** The lower bound of every stated choice, «so the figure is never larger than what people asked for». Untouched by the removal |
| `trees_reserved` | `coalesce(sum(pa.olive_tree_count) filter (where pa.status::text = 'reserved'), 0)` | `reserved` only. `contracting` is **not** here |
| `trees_contracted` | `coalesce(sum(pa.olive_tree_count) filter (where pa.status::text in ('contracting','sold','owned')), 0)` | «`contracting` counts here **by agreement**; the tile label says so in settings» (`0025:35`). The Arabic hint `million.tile_contracted_hint` carries that promise: «عقود فعلية أو في طور الإمضاء» |
| `trees_planted` | `coalesce(sum(pa.olive_tree_count) filter (where pa.status::text <> 'withdrawn' and pj.status = 'operating'), 0)` | **Project-driven, not parcel-driven.** Every non-withdrawn parcel of an `operating` project, whatever its own status. A published project contributes nothing here even if all its trees are sold |

Three details that are easy to lose:

- **Statuses are compared as `::text`**, on purpose — the body had to compile before `'owned'` existed (0021).
- **A parcel with `olive_tree_count` null adds 0**, silently. `tests/011:68` builds a `bare_land` parcel with no
  tree count precisely to prove this, and `stock.ts` counts the same case as `lotsWithoutTrees` so a figure is
  never quietly short. With tree rows, this whole class of bug ceases to exist — you cannot have a tree row that
  is not one tree.
- The other four keys — `participants`, `requests`, `projects_under_study`, `goal` — touch no parcel.

#### E2 · What the same four figures count over trees

| Key | Over `tree_units` | Equivalent? |
|---|---|---|
| `trees_requested` | unchanged | yes, exactly |
| `trees_reserved` | `count(*) where status = 'reserved'` | yes, **given one tree row per tree**. `sum(olive_tree_count) filter (…)` and `count(*) filter (…)` agree only when every tree is a row |
| `trees_contracted` | `count(*) where status in ('contracting','sold','owned')` | yes — same three states, same agreement to include `contracting`, same Arabic hint |
| `trees_planted` | `count(*) where status <> 'withdrawn' and project.status = 'operating'` | yes — and the join to `projects` **stays**, because the condition is about the project, not the tree |

The shape is preserved: one join, four `filter` clauses, all counts, no money, no personal data (MIL-01). And it
must stay ungated by the `pricing` flag: **stock is a fact, price is a permission.**

#### E3 · Why this is the delicate part

`tests/011:66-89` inserts eleven parcels with **prime tree counts** (11, 13, 17, 19, 23, 29, 31, 37, 41, 7, and
43 for `owned`) across three projects, then asserts three **exact deltas**:

| Assertion | Value | Why that number |
|---|---|---|
| `trees_reserved` delta | `= 18` | 11 (published, reserved) + 7 (preparing, reserved). The `bare_land` parcel with a null tree count adds 0, and the message says so |
| `trees_contracted` delta | `= 13 + 17 + 41 + (43 if 'owned' exists)` | contracting + sold in the published project, sold in the operating project, owned when 0021 has run |
| `trees_planted` delta | `= 31 + 41` | the operating project's available and sold parcels; its withdrawn 37 excluded, and every published-project parcel excluded |

Primes were chosen so that no wrong grouping can coincidentally produce the right total. The `'owned'` row is
inserted through **dynamic SQL** (`execute $sql$ … $sql$ using v_pub`) because a literal of a value added in the
same transaction would not parse.

**Three things the replacement test has to keep:**

1. **Deltas, not totals.** `v_before := million_progress()` before the fixtures, `v_after` after. The file runs
   against the live database and says so on line 2.
2. **Distinct primes**, so a miscount cannot land on the right answer.
3. **The recount-in-one-statement** for the demand figures (`:108-119`), which reads `million_progress()` and
   the three raw counts in a single `select` so live traffic cannot race them.

And one it has to drop: the `bare_land`-with-no-tree-count case has no analogue when a tree is a row, so its 0
becomes meaningless rather than wrong. Replace it with the case that *does* exist — a tree whose offer is
`draft` or `archived` — so the test still proves that something is excluded.

**Order matters here.** `million_progress()` must be rewritten to read tree rows **while `parcels` still
exists**, in a migration of its own, with `tests/011` rewritten in the same file. Both sums are zero today, so
the figures on the live home page do not move at that moment — which is exactly why it is the safe moment to do
it.

---

### F · AN ORDERED REMOVAL SEQUENCE

Each step leaves the site working and `npm run db:test` green. No step is a migration anyone has agreed to;
each is a draft under `supabase/pending/`, unnumbered, applied by the owner.

**Step 0 — the tree inventory exists and nothing reads it yet.**
New `tree_status` enum (its own type — never a value added to `parcel_status`, per 0021's own warning). New
`tree_units` table: `id`, `project_id`, `code`, `status`, `owner_person_id`, `spacing_class_id`, the three stamp
columns, `unique (project_id, code)`. `revoke all … from anon`, `revoke insert, update, delete … from
authenticated`, then the `app.is_staff()` select policy and the finance/admin write policies of `0012:110-133`.
`app.stamp_updated` and `app.audit_row_change` triggers. The `for share` class guard of `0034:22`, retargeted.
Tests: the grant posture, the guard, the audit row. **Nothing reads the table. The site is untouched.**

**Step 1 — one offer-level price function.**
`app.offer_price(project_id, trees)`: the body of `app.parcel_price` (0045:243) with `v_trees` as an argument
and no legacy branch. `app.parcel_price` stays where it is, unchanged, still serving every current caller. Tests
port the six exact-millime cases of `tests/020:171-203`. **Nothing changes on screen.**

**Step 2 — the counter moves to trees, while parcels still exist.**
Rewrite `million_progress()` per §E2. Rewrite `tests/011` per §E3. Both sums read zero before and after, because
`parcels` has no rows and `tree_units` has none either — this is the one step whose safety comes from the empty
database, and it is why it comes early rather than late.

**Step 3 — the public listing answers in trees.**
`public_projects()` gains `trees_total` / `trees_available` / `trees_reserved` / `trees_sold`, computed over
`tree_units` in SQL, **beside** the six parcel aggregates rather than replacing them. A `RETURNS TABLE` change
forces a drop and recreate, so `npm run db:types` and every file in §B5 move in the same commit. `offerStock()`
in `projects/page.tsx:71` starts reading the new columns and keeps its parcel fallback. **None of the four is
gated on the `pricing` flag** — only the `projects` module decides whether the offer is visible at all. Tests
assert the four figures and re-assert the whitelist regex against the new signature.

**Step 4 — the Back Office manages trees.**
The tree inventory screen replaces `/admin/projects/parcels`; the offer page gets a «trees» tab instead of
«القطع»; `saveParcel()` is joined (not yet replaced) by the actions that create a run of tree codes for an offer
and set a tree's status and owner. The dashboard's `.from("parcels")` list (`admin/page.tsx:62`) gains its tree
equivalent. `stock.ts`'s four buckets and its «الموقوفة sits outside the total» rule carry over verbatim — that
file is the owner's stock vocabulary and should be re-read before the new screen is designed, not after.

**Step 5 — the public parcel surface closes.**
`/projects/[code]/[parcel]` becomes the 308 redirect of §D. The lot grid on `/projects`, the lot grid and plan
on `/projects/[code]`, `ParcelCard` and `ParcelPlan` are deleted. `getPublicParcels` / `getParcelOffer` /
`findParcel` / `parcelHref` go, and `interestHref` stops writing the dead `parcel=` parameter. The RPCs
`public_parcels()`, `public_parcel_offer()` and `staff_parcel_offer()` are **still there** — nothing calls them
any more, and that is the point: the surface closes one release before the objects drop, so a shared link is
never served by a page whose data call has gone.

**Step 6 — the unused database objects drop.**
`public_parcels()`, `public_parcel_offer()`, `staff_parcel_offer()`, `staff_project_parcel_prices()`,
`app.parcel_offer_payload()`, `app.parcel_pricing()`, `app.parcel_down_from()`, `app.parcel_price()`,
`app.parcel_tree_unit_sync()` and its trigger, `app.spacing_area_fanout()` and its trigger;
`match_requests_for_parcel()` recreated as `match_requests_for_offer()`. `app.parcel_offered` /
`app.parcel_offer_statuses` / `app.parcel_visible_status` are recreated over `tree_status`.
`public_coverage()` swaps its two counts. `tests/006`, `007`, `008`, `020`, `021`, `030` are rewritten in the
same commit; `tests/003`'s PARC-01/02 independence assertions are restated about the offer, whose area and tree
count are still independent typed facts.

**Step 7 — the table, the enum and the snapshot columns drop.**
Drop the four `parcels` triggers, the four policies, `public.parcels`, then `public.parcel_status`. Drop the
fourteen `interest_requests.parcel_*` columns and `interest_requests_parcel_idx`; drop and recreate
`public.crm_requests` so `select r.*` re-expands, and re-issue `crm_search_requests` — the exact mechanic
`supabase/pending/bb_crm_offer_columns.sql` documents, with the same five TypeScript files following. Rewrite
`tests/016:204` and `tests/018:284`. Delete the orphan settings `projects.interest_marks_parcel`,
`site.parcels_title`, `site.parcels_text`, `site.parcel_examples`; delete `projects.detail_parcels_title`,
`projects.parcel_cta`, `projects.listing_limit`. **Keep `legal.parcel_card_note`** — its key names a parcel, its
Arabic text does not, and five surfaces print it. **Keep the `parcels` → «القطع» row in
`admin/(panel)/audit/page.tsx:22`**: `audit_logs` is append-only and still holds rows naming the table.

**Step 8 — the comments.**
The `src/components/ui/*` doc comments cite parcel routes by file and line (§B2); `ParcelMark()` in
`home-paths.tsx`; the comment trail through `pricing-form.ts`, `site-photo.tsx`, `sticky-cta.tsx`,
`identity.tsx`, `pricing-tab.tsx`, `legacy-pricing-notice.tsx`, `admin-nav.tsx`. None of it affects behaviour and
all of it will mislead the next reader. It is a step, not an afterthought.

---

### Could not determine from the current codebase

- **What a tree's «state» is, in the owner's words.** Seven parcel statuses exist; the owner has said a tree has
  «a code, a state and an owner» without naming the states. §A2 assumes the seven carry over.
- **Where the minimum lives.** «there is a minimum of trees to buy, it depends on the offer» implies a per-offer
  column or a `project_spacing_classes` field. No such column exists today, and `/start`'s tree-count options
  (`option_items`, list `tree_count`) are global, not per-offer.
- **Whether a tree code is global or per-offer.** `parcels` used `unique (project_id, code)`; «we just give each
  tree a number or an id» could mean either.
- **Whether the owner wants a per-tree public surface at all** (a «my trees» page for a client). Nothing in the
  repo assumes one, and §F does not build one.
- **The live values of every flag and setting.** The Back Office can change `projects`, `pricing`,
  `public_statistics`, `projects.show_taken_parcels` and `projects.offer_includes_interested` without a deploy;
  this file records only what the migrations seed.
