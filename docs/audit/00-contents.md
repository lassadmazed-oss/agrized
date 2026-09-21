## 0. CONTENTS

### What this audit is

Fourteen read-only reports describing **what the AgriZed codebase does today**, section by section. No file
in the audit proposes a feature, a redesign or a fix. Where a report says something *should* be different, it
is quoting a comment, a migration header or a doc — not recommending.

The implementation is the source of truth throughout. `README.md`, `docs/plan-rebuild.md`,
`docs/plan-zitouna.md`, `docs/gap-rapport-v3.md` and `docs/rapport-developpement-v3.md` are older than the code
in many places; every report records the code and names the disagreement separately.

Two mechanical rules the reports follow, which the reader must keep in mind:

1. **Migrations override each other.** `supabase/migrations/` runs `0001` → `0050` in order. A later file can
   redefine a function silently, and many do it with `drop function if exists …; create function …` rather
   than `create or replace`, so grepping for `create or replace` alone **misses redefinitions**. The
   last-definition table is in [01 §32](01-overview-and-map.md) and again in [13 §27.0](13-business-rules-and-hardcoded.md);
   both were re-verified for this contents page and one row is corrected below (C3).
2. **The live database is not in the repository.** Every report stops at the *seeded* value of a setting or a
   feature flag, because the Back Office can change any of them without a deploy. Twelve of the fourteen
   reports say so under «Could not determine from current codebase», and they are right to.

**Working-tree caveat.** While the audit ran, another process was editing files under `src/app/(public)/`.
Sections 2, 3 (public flow), 4 and 26 cite line numbers in that directory that may have shifted. Content was
verified as present in every case; three concrete drifts are recorded under *Drift during the audit* below.
Nothing under `supabase/`, `src/lib/`, `src/components/` or `src/app/admin/` was being edited.

---

### Reading order

Read 01 first and 14 last. Everything between is reference and can be read in any order, but the order below
is the one that builds the fewest unexplained terms.

| # | File | One line |
|---|---|---|
| 1 | [01-overview-and-map.md](01-overview-and-map.md) | What the product is, the stack, the three layout shells, the module system, and the two maps (file tree, request-to-database) that orient everything else. |
| 2 | [02-public-routes.md](02-public-routes.md) | Every public route, screen by screen: the shell, the home page, `/start`, `/register`, `/projects`, the offer and parcel pages, `/land`, `/simulator`. |
| 3 | [04-public-flow.md](04-public-flow.md) | The same surface told as a journey instead of a route list: the three doors a visitor can enter by, and where they converge. |
| 4 | [05-configurator.md](05-configurator.md) | The `/start` calculator in isolation — its six questions, its live quote, and every URL parameter in the system. |
| 5 | [06-registration-and-leads.md](06-registration-and-leads.md) | What a visitor is asked, what is stored, and the request/person model behind the CRM. |
| 6 | [09-payment-engine.md](09-payment-engine.md) | Money: units, the tree price, the instalment engine, every rounding step and every stored percentage. |
| 7 | [07-offers-and-project-page.md](07-offers-and-project-page.md) | The offer entity, its public page, and the Back Office screens that create and edit it. |
| 8 | [08-inventory-matching-reservations.md](08-inventory-matching-reservations.md) | Lots and stock, the matching function, and the flat statement that reservations and contracts do not exist. |
| 9 | [03-admin-routes.md](03-admin-routes.md) | Every Back Office route, the real navigation tree, the role gates, and the dashboard. |
| 10 | [10-admin-settings-services-visits.md](10-admin-settings-services-visits.md) | What an admin can actually change, plus the two thinnest domains: AgriZed services and visits. |
| 11 | [11-database-and-supabase.md](11-database-and-supabase.md) | Schemas, tables, enums, functions, RLS, the four Supabase clients, storage, and authentication. |
| 12 | [12-api-functions-components.md](12-api-functions-components.md) | The server surface (47 Server Actions, 2 route handlers, ~30 RPCs), the `src/lib` helpers, the component map, and five end-to-end data flows. |
| 13 | [13-business-rules-and-hardcoded.md](13-business-rules-and-hardcoded.md) | Every enforced rule, in the layer that enforces it — and every value written in TypeScript instead of read from the database. |
| 14 | [14-inconsistencies-and-state.md](14-inconsistencies-and-state.md) | Where the system contradicts itself, what is finished versus displayed-only, and the open questions the code cannot answer. |

---

### The 33 sections, mapped

All 33 are covered. None is missing.

| § | Title | File | Where inside it |
|---|---|---|---|
| 1 | Project overview | 01 | `## 1.` |
| 2 | Routes — public half | 02 | whole file |
| 2 | Routes — admin half | 03 | `### 3.1` – `### 3.4` |
| 3 | Public user flow | 04 | whole file |
| 4 | Configurator | 05 | `## 4.` |
| 5 | Customer / lead registration | 06 | `## A.1` – `## A.14` |
| 6 | The request model | 06 | `## B.1` – `## B.9` |
| 7 | Projects / offers (the entity) | 07 | `## 7.1` – `## 7.7` |
| 8 | The public offer page | 07 | `## 8.1` – `## 8.6` |
| 9 | Lots / parcels / inventory | 08 | `## 9.` |
| 10 | Matching | 08 | `## 10.` |
| 11 | The admin dashboard | 03 | `### 3.5` |
| 12 | Admin offer creation / editing | 07 | `## 12.1` – `## 12.10` |
| 13 | Admin configurator settings | 10 | `## 13.1` – `## 13.10` |
| 14 | Payment / instalment engine | 09 | whole file |
| 15 | AgriZed services | 10 | `## 15.1` – `## 15.6` |
| 16 | Visits | 10 | `## 16.1` – `## 16.5` |
| 17 | Reservations | 08 | `## 17.` |
| 18 | Contracts and ownership | 08 | `## 18.` |
| 19 | Database map | 11 | `## 19.1` – `## 19.14` |
| 20 | Supabase | 11 | `## 20.1` – `## 20.6` |
| 21 | Authentication & permissions | 11 | `## 21.1` – `## 21.7` |
| 22 | API / Server Actions | 12 | `## 22.` |
| 23 | Important functions — money half | 09 | `### 14.2` – `### 14.12` |
| 23 | Important functions — everything else | 12 | `## 23.` |
| 24 | Component map | 12 | `## 24.` |
| 25 | Data flow, UI → database | 12 | `## 25.` |
| 26 | URL parameters | 05 | `## 26.` |
| 27 | Business rules | 13 | `## 27.` |
| 28 | Hardcoded values | 13 | `## 28.` |
| 29 | Inconsistencies / possible confusion | 14 | `## 29.` |
| 30 | Implemented vs partial vs missing | 14 | `## 30.` |
| 31 | File map | 01 | `## 31.` |
| 32 | Final system map | 01 | `## 32.` |
| 33 | Questions / unknown areas | 14 | `## 33.` |

**Sections split across two files.** Two sections are not in one place, and a reader who stops at the first
hit will get half the answer:

- **§2** — public routes are in **02**, admin routes in **03**. Neither file says so in its own title.
- **§23** — the money functions (`app.tree_price`, `app.financed_quote`, `app.parcel_price`,
  `app.down_payment_from_percent`, the rounding table) are in **09**; `src/lib/config`, `format`, `phone`,
  `modules`, `crm`, `projects`, `public-projects`, `auth` and the rest are in **12**.

**Thin sections.** All are factually complete for what they claim; these are the shortest relative to their
scope, and a reader wanting depth on them will have to go to the code:

| § | File | Lines | Note |
|---|---|---|---|
| 30 | 14 | ~80 | Four dense tables covering 14 + 12 + 21 + 10 items. Correct, but it is an index, not an account. |
| 33 | 14 | ~80 | 21 open questions, one line each. |
| 11 | 03 `### 3.5` | ~90 | The dashboard is a small screen, so this is proportionate. |
| 26 | 05 | ~111 | Complete for the public contract; the Back Office parameters are listed without their validation. |
| 24 | 12 | ~120 | Names 41 component files and their call sites; props are given only "of note". |

**Numbering hazard.** The `## <n>.` heading at the top of a file is sometimes the *file* number and sometimes
the *section* number, and they collide:

- `02` opens `## 2. PUBLIC ROUTES` (section 2) and `04` opens `## 3. PUBLIC USER FLOW` (section 3) — correct.
- `03` opens `## 3. ADMIN ROUTES` but contains sections **2** and **11**; its own subtitle says so.
- `09` opens `## 14.` — which *is* its section. `10`, `11`, `12`, `13` and `14` open with their **file**
  numbers (10, 11, 12, 13, 14) while containing sections 13/15/16, 19/20/21, 22–25, 27/28 and 29/30/33.
- So `## 14.` appears twice in the audit meaning two different things: section 14 (the payment engine, file
  09) and file 14 (inconsistencies). Use the table above, not the heading.

---

### Contradictions between sections, resolved

Each of these is a case where two reports describe the same object differently. I read the code for every one;
the verdict line gives the file and line that settles it.

#### C1 · `staff_project_quote` — called, or never called?

- **11 §20/§21 (line 741)** groups `staff_parcel_offer(...)`, `staff_project_quote(...)`,
  `staff_project_parcel_prices(uuid)` and `staff_tree_quote(...)` into one row whose call-site column reads
  `/admin/projects/[id]/parcels/[parcelId]`, `src/lib/parcel-prices.ts`, `/admin/pricing` — implying all four
  are called.
- **12 §22 (lines 317, 530)** says `public.staff_project_quote` is *"fully implemented and granted, and
  nothing in `src/` calls it"*.

**12 is right.** `staff_project_quote` appears in `src/` in exactly one file, the generated
`src/lib/supabase/database.types.ts:2721`. The other three do have call sites, one each:
`src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx:94` (`staff_parcel_offer`),
`src/lib/parcel-prices.ts:58` (`staff_project_parcel_prices`),
`src/app/admin/(panel)/pricing/simulator-section.tsx:82` (`staff_tree_quote`). Read 11's row as three call
sites for three functions and a fourth with none.

#### C2 · How many `unstable_cache` layers sit in front of Supabase — three or four?

- **11 §20.5** tabulates three: `loadPublicConfig` (`src/lib/config.ts`), `cachedAnonRpc`
  (`src/lib/public-projects.ts`), `loadMillionProgress` (`src/lib/million.ts`).
- **01 §1** says four.

**01 is right.** The fourth is `loadSpacingClasses` at **`src/lib/tree-pricing.ts:159`** — key
`["spacing-classes-v1"]`, tag `PUBLIC_CONFIG_TAG`, `revalidate: 300`. It is the only one of the four that
reads a table directly (`tree_spacing_classes`, `is_active = true`, ordered by `sort_order`) instead of
calling an RPC, and it is what puts the spacing options on `/start`. A reader using 11 §20.5 as the complete
cache inventory will not know that editing a spacing class takes up to 300 s to show, or that
`PUBLIC_CONFIG_TAG` clears it.

#### C3 · Which migration holds the live body of `public.public_projects()`?

- **13 §27.0** hedges: *"0020, **0023** (+ rebuilt in 0035 chain) → `0023_project_page_v3.sql` / `0035`"*.
- **01, 02, 07, 08, 12** all say `0035`.

**The majority is right, and 13's row should read `0035` alone.**
`supabase/migrations/0035_projects_tree.sql:155-157` does
`drop function if exists public.public_projects();` then `create function public.public_projects()`. Nothing
after 0035 touches it. The same file also holds the live `public_parcels()` (line 71-73) and
`public_coverage()`. This is exactly the `drop`+`create` pattern that hides redefinitions from a
`create or replace` grep.

#### C4 · `app.parcel_price` — is `0034` its definition?

- **07 §7.2 (line 147)** introduces it as *"`app.parcel_price(uuid)` (`0034`) is the one definition of a lot's
  price"*.
- **08 §9 (line 404)**, **09 §14.4 (line 143)**, **11 §19.11** and **01 §32** say the live body is `0045`.

**The live body is `supabase/migrations/0045_annual_fee.sql:243-311`**, not 0034's. 07's claim about
*uniqueness* is correct — there is one definition in force and every caller goes through it — but its citation
points at the superseded body. The 0045 version is the one that returns `annual_fee_total_millimes`, so
anyone reading 0034 to learn what the function returns will come up a key short.

#### C5 · Which public pages read `flagState` and which read `moduleAccess`?

- **02 Observation 2 (line 1020)**: *"`(public)/layout.tsx`, `/projects/[code]/page.tsx` and
  `/projects/[code]/[parcel]/page.tsx` use `flagState(...) === "public"`, while `/start`, `/register`,
  `/projects`, `/projects/map`, `/land` and the two offer Server Actions use `moduleAccess(...)`."*
- **01 §1** puts it as: the home page uses `flagState()` only, *"every other public page uses `moduleAccess()`"*.
- **04 §3.1** repeats 02's split.

**Both are half-stated; the consequence they draw is correct.** What the code actually does:

| File | `moduleAccess` | `flagState` |
|---|---|---|
| `src/app/(public)/layout.tsx` | — | `interest_form` (line 9), `projects` (line 17) |
| `src/app/(public)/page.tsx` (home) | — | `public_statistics`, `interest_form`, `land_offers`, `projects`, `pricing` |
| `src/app/(public)/start/page.tsx` | `interest_form`, `projects` | — |
| `src/app/(public)/register/page.tsx` | `interest_form`, `projects` | — |
| `src/app/(public)/projects/page.tsx` | `projects`, `pricing` | — |
| `src/app/(public)/projects/map/page.tsx` | `projects` | — |
| `src/app/(public)/projects/[code]/page.tsx` | **`projects`** | **`interest_form`** (line 98) |
| `src/app/(public)/projects/[code]/[parcel]/page.tsx` | **`projects`** | **`interest_form`** |
| `src/app/(public)/land/page.tsx` | `land_offers` | — |
| `src/app/(public)/projects/[code]/offer-actions.ts` | `projects` (line 43) | — |
| `src/app/(public)/register/actions.ts` | — | `interest_form` (line 90) |
| `src/app/(public)/land/actions.ts` | — | `land_offers` (line 61) |

So the two offer pages use **both**: `moduleAccess` for the `projects` module gate (which is what lets staff
preview them at all) and `flagState` for `interest_form` (which is what hides the CTA from that same staff
member). And `register/actions.ts:90-93` is not a `moduleAccess` caller — it hand-rolls the identical rule
`state === "disabled" || (state === "internal" && !(await getStaffSession()))`, so it behaves the same while
reading differently. `land/actions.ts:61` does the same for `land_offers`. The visible consequence 02 and 04
both describe — staff previewing an `internal` `interest_form` see the pages but get no CTA, no sticky bar and
no header button — is accurate; `src/lib/modules.ts:13-18` is the three-line function the whole thing turns on.

#### C6 · `/zitounti` — is there a header link to a missing route?

- **01 (lines 273-275)**, **02 (lines 28, 73, 95, 1013-1015)**, **04 (lines 842, 888)** and **12 (line 887)**
  all describe `SiteHeader` rendering `<Link href="/zitounti">زيتونتي</Link>` when the flag is `public`, with
  no route behind it.
- **13 (lines 452-453)** notes the `showZitounti` prop and the link *"were removed from both files by the
  concurrent edit"* while the audit was running.

**13 is right about the current tree.** `grep -rn "zitounti" src/` now returns **nothing** — not the prop, not
the link, not the label. `src/app/(public)/layout.tsx` passes only `showInterestCta` and `showProjects`. The
feature-flag row survives in the database seed, `supabase/migrations/0004_seed_configuration.sql:73`
(`('zitounti', 'disabled', 4, 'فضاء «زيتونتي»', 'البند 17.', 100)`), and `zitounti` is still absent from
`IMPLEMENTED_MODULES`, so `/admin/settings/modules` still refuses to switch it on. The four reports describe a
state that was true when they read it and is no longer true; nothing else in them depends on it.

#### C7 · The three dead files

**01, 02, 04, 12 and 13** name `src/components/site/project-card.tsx`,
`src/app/(public)/simulator/capacity-simulator.tsx` and `src/components/admin/section-not-open.tsx` as
imported by nothing.

**Two of the three no longer exist.** `project-card.tsx` and `capacity-simulator.tsx` have been deleted from
the working tree (they were already staged as deletions when this audit started). `src/components/admin/section-not-open.tsx`
**still exists and is still imported by nothing** — `grep -rn "section-not-open\|SectionNotOpen" src/` matches
only the file itself. It is the last of the three. `src/app/(public)/simulator/page.tsx` is unaffected: it is
still the redirect, and the `simulator_basic` flag is still seeded `public` and still listed in
`IMPLEMENTED_MODULES`.

#### C8 · How long is `src/app/(public)/simulator/page.tsx`?

**01 (line 269)** says five lines; **12 (line 543)** says 7-line; **02** says a 7-line server component.
**It is 7 lines** — two import/comment lines, a two-line comment citing `docs/plan-zitouna.md P6-1`, and
`export default function SimulatorPage() { redirect("/start"); }`. Trivial, but it is the kind of number a
reader checks first.

#### C9 · `/start` — six steps or seven?

**02 (line 451)** says *"any of the seven steps"*; **05 §4.3** is titled *"the six questions"*; **04 §3.3**
says *"at most seven screens"*.

**All three are right about different things.** `StepKey` at
`src/app/(public)/start/start-chooser.tsx:135` has seven values —
`"trees" | "spacing" | "type" | "payment" | "down" | "duration" | "summary"` — so **six questions plus one
summary screen**. The `steps` memo at lines 243-252 builds the list at run time: `trees` and `payment` and
`summary` always; `spacing` only if `tree_spacing_classes` has active rows; `type` only if
`ownership_scenarios` does; `down` and `duration` only when the mode is `installments` **and** their
`option_items` lists are non-empty. **Minimum three screens, maximum seven.** Both `/register` step counts in
the audit (six) refer to a different wizard and do not conflict.

#### C10 · Does the CSV export apply the `request_kind` filter?

- **03 §3.4.1** says the export *"applies it over every batch instead"*.
- **14 §29.2** says the leads page prints a banner claiming it does not, and that the banner is wrong.

**Both are right, and the disagreement is inside the product, not between the reports.**
`src/app/admin/(panel)/leads/export/route.ts:103` reads
`if (filters.request_kind && kind !== filters.request_kind) continue;` — the export filters, row by row.
`src/app/admin/(panel)/leads/page.tsx:611-612` tells the user
«الأعداد فوق والتصدير CSV يحسبوا المطالب الأخرى معها» — *the counts above and the CSV export count the other
requests too*. The sentence is **true of the `StatTile` totals and false of the CSV**. Use 14's framing and
03's mechanism together.

#### C11 · The offer form is shown where the database refuses it

- **04 §3.10** puts it as: `submit_offer_request` accepts `sold_out`/`operating` offers while the page's
  `formOpen` only allows `published`/`internal`.
- **14 §29.9** puts it as: the form is shown for `internal` and every such submission fails.

**Both halves are true and they are the same fact seen from each end.**
`src/app/(public)/projects/[code]/page.tsx:97-99` sets `selling = status === "published" || status === "internal"`
and `formOpen = selling && interestOpen && offerTrees > 0`.
`supabase/migrations/0049_offer_intake.sql:125-127` refuses anything not in `app.project_public_statuses()`,
which is `['published']` plus `['sold_out','operating']` when the setting `projects.list_closed` is true
(`0020_public_projects.sql:45-51`) — and **never** `internal`. 0049's own comment (lines 121-123) states the
intent: *"a draft or an internal offer can never take a request even if a form reached it."* So the two sets
differ in both directions: the page shows a form for `internal` that the database will reject with
`offer_not_available`, and the database would accept `sold_out`/`operating` requests that the page never
offers a form for.

#### C12 · Figures I re-counted rather than trusted

| Figure | Verified value | Evidence |
|---|---|---|
| Tables created across `0001`–`0050` | **36** — 34 in `public`, 2 in `app` (`app.counters`, `app.submission_throttle`); no `drop table` anywhere | matches 01 line 134 exactly |
| `"use server"` files / Server Actions | **17 files, 47 exported actions** | matches 12 §22 |
| Component files under `src/components/` | **41** `.tsx` | 12 §24 names them all |
| Seeded `feature_flags` keys | **15** — 13 in `0004`, `public_statistics` in `0025`, `pricing` in `0031` | matches 01 and 10 §13.7 |
| Settings `group_key`s seeded vs rendered | **12 seeded, 8 rendered.** `GROUPS` in `src/app/admin/(panel)/settings/page.tsx:17-29` lists site, legal, lead, sms, simulator, projects, pricing, antispam. The database also holds `million` (6 rows), `start` (4), `matching` (2), `audit` (1) | confirms 10 §13.4 down to the counts |

---

### Drift during the audit

Three changes landed in `src/app/(public)/` and `src/components/site/` while the reports were being written.
None of them changes a conclusion; all of them change a citation.

1. `src/components/site/project-card.tsx` — **deleted**. Cited as dead code by 01, 12.
2. `src/app/(public)/simulator/capacity-simulator.tsx` — **deleted**. Cited as dead code by 01, 02, 04, 12, 13.
3. `showZitounti` / the `/zitounti` link — **removed** from `(public)/layout.tsx` and
   `src/components/site/site-header.tsx`. Cited as a live dangling link by 01, 02, 04, 12; flagged as removed
   by 13.

One thing **no** section mentions: the unapplied CRM fix ships with its own test.
`supabase/pending/` contains **two** files — `bb_crm_offer_columns.sql` and
`supabase/pending/tests/bb_crm_offer_columns.sql`. Every report that discusses the pending migration names
only the first.

---

### Read this first — the ten facts

Ten things that, once known, make the rest of the audit legible. Each names the section that tells it whole.

1. **Two public intakes write to one table, and the CRM cannot tell them apart.**
   `public.submit_interest_request` (calculator: `/start` → `/register`, live body in
   `0032_intake_pricing.sql`) and `public.submit_offer_request` (an offer page, `0049_offer_intake.sql`) both
   insert into `public.interest_requests`. `0049` line 15 adds `request_kind text not null default 'calculator'`,
   so calculator rows get their kind from the column default. But `public.crm_requests` is
   `select r.*, …` created at `0032_intake_pricing.sql:436`, and a Postgres view freezes its column list at
   creation — so it does not expose `request_kind` or any `offer_*` column. `public.crm_search_requests`
   (`0032:452`) names its columns one by one and cannot either. The fix exists, unapplied and unnumbered, at
   `supabase/pending/bb_crm_offer_columns.sql`; `src/app/admin/(panel)/leads/offer-snapshot.ts` works around
   it in TypeScript. → **§6** (file 06), **§29.2** (file 14).

2. **No price is computed in JavaScript, and `/start` prices from a different rate card than an offer page
   does.** `public.public_tree_quote` (live body `0045_annual_fee.sql`) calls `app.tree_price(v_class.id, null)`
   — a hard-coded `null` project — and passes `null` again to `app.down_payment_from_percent` and
   `app.financed_quote`. `app.parcel_price` in the same file calls `app.tree_price(v_class, v_pa.project_id)`.
   So the calculator always quotes the **global** rate card while an offer quotes **its own**, and the two can
   disagree for the same spacing class. → **§4** (file 05), **§14** (file 09).

3. **The instalment markup applies to what is financed, not to the price.**
   `app.financed_quote`, last defined in `supabase/migrations/0036_markup_on_remaining.sql`:
   `base = cash − down`; `remaining = ceil(base × (10000 + markup_bp) / 10000 / price_rounding) × price_rounding`;
   `total_financed = down + remaining`; `monthly = ceil(remaining / months / monthly_rounding) × monthly_rounding`;
   `count = ceil(remaining / monthly)`; the **last instalment is the remainder**, so a plan can end before the
   chosen duration (`shortened`). The superseded `0031` version marked up the whole cash price; its header
   comment is still in the repository and still describes the old behaviour. → **§14** (file 09).

4. **The module system is the spine, and it is read two ways.** `public.feature_flags` holds 15 keys;
   `src/lib/modules-catalog.ts` implements 6 (`interest_form`, `simulator_basic`, `land_offers`, `projects`,
   `public_statistics`, `pricing`) and the Back Office refuses to switch on any other. `moduleAccess()`
   (`src/lib/modules.ts:13`) returns `open | preview | closed` and lets signed-in staff preview an `internal`
   module; `flagState() === "public"` does not. Which one a page uses decides whether staff see it — see C5
   above for the per-file table. And `setModuleState` hard-refuses one state:
   `src/app/admin/(panel)/settings/modules/actions.ts:24-29` rejects `projects = public` with
   «المشاريع تبقى «داخلي فقط» حتى تُضبط جداول الأسعار الخاصة بكل عرض.» → **§1** (file 01), **§13.7** (file 10).

5. **There is no `middleware.ts`, and the request hook does almost nothing.** `src/proxy.ts` exports `proxy()`
   with `matcher: ["/admin/:path*"]`, and its own comment calls the redirect *"Optimistic redirect only. Every
   Back Office page and action checks roles on the server."* Real enforcement is `requireStaff()` in each page
   and Server Action, RLS, and an explicit `raise exception 'forbidden'` inside every security-definer RPC.
   One visible gap: all four read pages under `/admin/projects` call `requireStaff()` **with no role argument**
   (`projects/page.tsx:27`, `projects/parcels/page.tsx:34`, `projects/[id]/page.tsx:48`,
   `projects/[id]/parcels/[parcelId]/page.tsx:56`), so read access there rests on RLS alone; only the
   التكاليف tab names roles (`FINANCE_ROLES` at `projects/[id]/page.tsx:41,53`). → **§21** (file 11),
   **§2 admin half** (file 03).

6. **Five whole domains have no tables.** Across all 50 migrations there is no reservations, visits,
   contracts, payments or services table. Availability is `public.parcels.status`, a 7-value enum set from a
   free `<select>`, summed on the fly over `olive_tree_count`. There is no stock ledger, no hold, no expiry
   and no customer on a lot. «وعد البيع» exists only as settings copy. → **§17**, **§18** (file 08),
   **§30** (file 14).

7. **`available` / `reserved` / `sold` are computed three times and the three disagree.**
   `src/app/admin/(panel)/projects/stock.ts:21` puts `interested` in **available**
   (*"Still on the market: someone asked about it, nothing is held"*);
   `src/app/(public)/projects/page.tsx:68` puts it in **held**;
   `public.million_progress()` (`0025_million_counter_split.sql:41-43`) puts it in **no bucket at all** — and
   its `planted` filter (`status <> 'withdrawn' and pj.status = 'operating'`) overlaps its `contracted` filter
   (`status in ('contracting','sold','owned')`), so a sold lot in an operating project is counted **twice**.
   → **§9** (file 08), **§29.7** (file 14).

8. **The parcel a visitor clicked is thrown away on the way to the form.**
   `src/lib/public-hrefs.ts:42` writes `parcel: params.parcelId` into the `/register` query. Nothing under
   `src/app/(public)/register/` mentions `parcel` — not the parser, not the wizard, not `submitInterest` — and
   `submit_interest_request` writes no `project_id`. The fifteen parcel-snapshot columns `0020` added to
   `interest_requests` for exactly this are written by no migration and no action; only
   `submit_offer_request` fills the project columns. → **§26** (file 05), **§29** (file 14).

9. **SMS is a write-only queue.** All three intakes call `app.enqueue_message` and fill
   `public.notification_outbox`; nothing in `src/`, `scripts/` or `package.json` ever reads it. The settings
   `sms.sender_id` and `sms.provider` are stored and asserted by tests and consumed by nothing in this
   repository. → **§15/§16** (file 10), **§33** (file 14).

10. **Read the highest-numbered migration, always.** Several core objects are redefined by later files, often
    via `drop function`+`create function`, which a `create or replace` grep misses. The live definitions, all
    re-verified:

    | Object | Defined in | Live body |
    |---|---|---|
    | `public.submit_interest_request` | 0003, 0009, 0011, 0016, 0019, 0030, **0032** | `0032_intake_pricing.sql` |
    | `public.crm_search_requests` | 0007, 0011, 0016, 0028, 0030, **0032** | `0032_intake_pricing.sql:452` |
    | `public.crm_requests` (view) | 0002, 0011, 0016, 0030, **0032** | `0032_intake_pricing.sql:436` |
    | `public.public_projects` / `public_parcels` / `public_coverage` | 0020, 0022/0023, **0035** | `0035_projects_tree.sql` |
    | `public.million_progress` | 0016, **0025** | `0025_million_counter_split.sql:12` |
    | `app.tree_price` · `app.parcel_price` · `public.public_tree_quote` | 0031/0034, **0045** | `0045_annual_fee.sql` |
    | `app.financed_quote` | 0031, **0036** | `0036_markup_on_remaining.sql` |
    | `app.project_quote_payload` | 0034, **0048** | `0048_offer_annual_fee.sql` |
    | `public.staff_save_pricing_rule` | 0031, **0046** | `0046_annual_fee_save.sql` |

    Defined exactly once, and therefore easy to trust: `public.submit_offer_request` (0049),
    `public.submit_land_offer` (0003), `public.compute_installment_plan` and
    `public.match_requests_for_parcel` (both 0013), `public.public_parcel_offer`, `app.parcel_offer_payload`,
    `app.module_open`, `app.project_visible`, `app.parcel_offered` (all 0020),
    `public.public_project_page` (0023), `app.down_payment_from_percent`, `public.staff_tree_quote` (0031),
    `public.public_project_quote`, `public.staff_project_quote` (0034),
    `public.staff_project_parcel_prices` (0035). → **§32** (file 01), **§27.0** (file 13).
