## 1. PROJECT OVERVIEW

> Scope of this section: what AgriZed is **according to the code in this repository**, who uses it, which
> business objects exist, and how the major parts connect. Sections 31 (FILE MAP) and 32 (FINAL SYSTEM MAP)
> follow below.
>
> **Working-tree caveat.** Another process was editing files under `src/app/(public)/` while this audit was
> read. Every `(public)` file quoted here was read once and was syntactically complete at that moment (each
> ended on a closing `}` / `);`), but the `(public)` route bodies may have moved since. Nothing under
> `supabase/`, `src/lib/`, `src/components/` or `src/app/admin/` was being edited, and those readings are firm.

---

### 1.1 What the platform does

AgriZed is a single Next.js application serving **two audiences from one database**:

1. **A public, Arabic-first (RTL) marketing-and-intake site** that explains a product whose sale unit is
   *one olive tree together with the ground area that comes with it*, lets a visitor price a hypothetical
   purchase, and collects their contact details as a lead.
2. **A staff Back Office** (`/admin`) that receives those leads, tracks them through a CRM pipeline, holds the
   catalogue of real properties ("offers": projects and their plots), sets the pricing parameters that the
   public quotes are computed from, and administers users, lists, texts, pictures and module visibility.

There is **no customer account area**. `public.app_role` contains `'client'`, and `src/lib/auth.ts` defines
`StaffRole = Exclude<AppRole, "client">`, but `getStaffSession()` returns `null` for anyone whose roles reduce
to `client` only, and there is no route a client could sign into. The `zitounti` feature flag (the planned
customer space) is seeded `disabled` and **no `/zitounti` route exists** — see Observations.

Two things are structurally true of the whole codebase and explain most of its shape:

| Principle | Where it is enforced |
|---|---|
| **No business value in code.** Amounts, lists, labels, limits, copy and module visibility live in the database. | `public.settings`, `public.option_lists`/`option_items`, `public.project_types`, `public.ownership_scenarios`, `public.lead_statuses`, `public.feature_flags`, `public.site_media`, all read through `src/lib/config.ts` |
| **No pricing formula in code.** Every dinar figure a page prints was computed inside Postgres. | `app.tree_price`, `app.parcel_price`, `app.financed_quote`, `app.project_quote_payload`, `public.compute_installment_plan`, surfaced by `public_tree_quote` / `public_project_quote` / `public_parcel_offer` |

Money is stored everywhere as **integer millimes** (1 TND = 1000 millimes) and rendered by
`formatMillimes()` in `src/lib/format.ts` (`«4,491 د.ت»`). Dates render in the `Africa/Tunis` time zone
(`formatDate`, `formatDateTime`, same file).

### 1.2 Stack, as declared

From `package.json`:

| Piece | Version / note |
|---|---|
| `next` | `16.3.5` — App Router. **No `middleware.ts`**; the request hook is `src/proxy.ts` exporting `proxy()` |
| `react` / `react-dom` | `19.2.8` |
| `@supabase/ssr` | `^0.12.7` (cookie-bound server client) |
| `@supabase/supabase-js` | `^2.116.0` (anon client, service-role client) |
| `zod` | `^4.6.2` — validates every Server Action input |
| `libphonenumber-js` | `^1.13.13` — `src/lib/phone.ts`, numbers normalised to E.164, default region `TN` |
| `server-only` | guards `src/lib/auth.ts`, `config.ts`, `million.ts`, `modules.ts`, `tree-pricing.ts`, `public-projects.ts`, `parcel-prices.ts`, `request-context.ts`, `auth-events.ts`, `site-media-upload.ts`, all three Supabase client factories, and the `/start` server helpers |
| `tailwindcss` 4 + `@tailwindcss/postcss` | brand tokens declared with `@theme` in `src/app/globals.css` (388 lines) |
| `pg` (devDependency) | used only by the `scripts/db-*.mjs` Node scripts, never by the app |

`npm` scripts: `dev`, `build`, `start`, `lint` (`eslint`), `typecheck` (`next typegen && tsc --noEmit`),
`db:migrate`, `db:test`, `db:types`, `admin:create`, `admin:password`, `demo:projects`.

`next.config.ts` sets: `turbopack.root = process.cwd()`; `devIndicators: false`; `poweredByHeader: false`;
`images.remotePatterns` built from the hostname of `NEXT_PUBLIC_SUPABASE_URL` restricted to
`/storage/v1/object/public/**`; `experimental.serverActions.bodySizeLimit: "6mb"` (picture uploads go through
Server Actions); and a `headers()` block applying to `/:path*`: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(self)` (geolocation is kept for the landowner
form), plus `X-Frame-Options: DENY` in production only.

### 1.3 The three shells

| Shell | File | What it establishes |
|---|---|---|
| Root | `src/app/layout.tsx` | `<html lang="ar" dir="rtl">`; fonts `IBM_Plex_Sans_Arabic` (`--font-plex-arabic`) and `Markazi_Text` (`--font-markazi`); `generateMetadata()` reads `site.meta_title` / `site.meta_description` from settings, wrapped in `.catch(() => null)` so a configuration outage cannot take the Back Office down; `viewport.themeColor = "#1f4a2c"` |
| Public | `src/app/(public)/layout.tsx` | `<SourceCapture />`, `<SiteHeader>`, `<main>`, `<SiteFooter>`, and `<StickyCta>` **only when `flagState(config, "interest_form") === "public"`**. Header link visibility is driven by `projects` and `zitounti` flag states; footer prints `legal.no_guarantee_notice`, contact settings and every CC-BY media credit via `mediaCredits(config)` |
| Back Office | `src/app/admin/(panel)/layout.tsx` | calls `requireStaff()` first; builds the sidebar from **role gate + module flag**; sticky header with breadcrumbs (`AdminBreadcrumbs`), the signed-in name linking to `/admin/account`, and a `signOut` form; `metadata.robots = { index: false, follow: false }` |

The Back Office sidebar (`navFor()` in the panel layout) is **four top-level sections**, each with children:

```
/admin                      لوحة القيادة        (no role gate, no flag)
/admin/leads                الطلبات             CRM_READ_ROLES
  └ /admin/analytics        التحليلات وخريطة الطلب   CRM_READ_ROLES
/admin/projects             العروض              flag: projects
  ├ /admin/projects/parcels القطع               flag: projects
  ├ /admin/land-offers      أراضٍ معروضة علينا     LAND_OFFER_ROLES, flag: land_offers
  └ /admin/pricing          التسعير             PRICE_ROLES, flag: pricing
/admin/settings             الإعدادات            ADMIN_ROLES
  ├ /admin/settings/modules الموديولات
  ├ /admin/settings/lists   القوائم
  ├ /admin/settings/media   صور الموقع
  ├ /admin/users            المستخدمون
  └ /admin/audit            سجل العمليات
```

A row whose module is not `public` carries a badge — `«داخلي»` or `«معطّل»` (`NAV_STATE_LABELS` in
`src/components/admin/nav-model.ts`) — and is drawn quiet, **but still opens**: the layout's own comment states
that the flag governs what visitors see and is never an access rule for staff. Five sections
(الحجوزات، الزيارات، العقود، الدفوعات، الخدمات الفلاحية) were removed from the nav and have no pages.

### 1.4 Who uses it

**Public visitors (anonymous).** Reach `/`, `/start`, `/register`, `/projects`, `/projects/[code]`,
`/projects/[code]/[parcel]`, `/projects/map`, `/land`. They are never authenticated. Their data reaches
Postgres through **service-role Server Actions calling security-definer RPCs**, never through direct table
writes.

**Leads / customers.** A lead is a row in `public.persons` (identified by normalised phone) plus one or more
rows in `public.interest_requests`. Since migration `0049` a request carries `request_kind`, which is
`'calculator'` (a simulation from `/start` → `/register`) or `'offer'` (a demand raised on a real offer page).
`src/app/admin/(panel)/leads/filters.ts` labels them `«محاكي»` and `«عرض»`. There is **no login for a lead**.

**Staff.** `public.app_role` is
`('client', 'commercial', 'agri_manager', 'finance', 'legal', 'admin', 'super_admin')`.
`src/lib/auth.ts` labels them and groups them:

| Constant | Members | Used for |
|---|---|---|
| `ADMIN_ROLES` | `admin`, `super_admin` | settings, lists, media, modules, users, audit, assignment |
| `CRM_READ_ROLES` | `commercial`, `finance`, `legal`, `admin`, `super_admin` | `/admin/leads`, `/admin/analytics`, CSV export |
| `PRICE_ROLES` | `finance`, `admin`, `super_admin` | `/admin/pricing`, project costs tab, spacing-class saves |
| `LAND_OFFER_ROLES` | `agri_manager`, `legal`, `finance`, `admin`, `super_admin` | `/admin/land-offers` and the signed file route |

`ROLE_LABELS`: `client → «حريف»`, `commercial → «Commercial»`, `agri_manager → «مسؤول فلاحي»`,
`finance → «Finance»`, `legal → «Legal»`, `admin → «Admin»`, `super_admin → «Super Admin»`.

Access is checked **three times** on the staff side: (a) `src/proxy.ts` redirects any unauthenticated
`/admin/*` request to `/admin/login?next=…` — its own comment calls this "optimistic … Every Back Office page
and action checks roles on the server"; (b) every page and Server Action starts with
`requireStaff(ROLES)`, which `redirect("/admin/login")` on no session and `redirect("/admin?denied=1")` on a
wrong role; (c) the database itself, through RLS policies and `security definer` RPCs that re-check with
`app.has_any_role` / `app.is_staff` / `app.is_admin` / `app.can_price` / `app.can_edit_person`.

### 1.5 Main business objects

36 tables are created across `supabase/migrations/0001` → `0050` (34 in `public`, 2 in the private `app`
schema), plus one view, `public.crm_requests`, recreated five times.

**Identity, configuration, audit** (`0001`, `0002`, `0004`, `0015`)

| Object | Purpose in code |
|---|---|
| `public.profiles` | one row per `auth.users` row: `full_name`, `phone_e164`, `locale` (`ar`/`fr`), `is_active`. `getStaffSession()` refuses an inactive profile |
| `public.user_roles` | `(user_id, role)` — a staff member may hold several roles |
| `public.settings` | every business value and every public string; `is_public` decides what the anonymous config loader may read |
| `public.feature_flags` | `key → state ∈ ('disabled','internal','public')` — the module system |
| `public.audit_logs` | append-only; written by `app.write_audit` / `app.audit_row_change` triggers and by `public.log_action`; `app.block_audit_mutation` guards it |
| `public.site_media` | one row per photo slot: `url`, `alt_ar`, `aspect`, `credit_text`, `credit_url` (MED-01) |
| `app.counters`, `app.submission_throttle` | reference numbering (`app.next_number`) and anti-spam (`app.check_throttle`) |

**Reference lists** (`0002`, `0005`, `0010`, `0023`, `0027`, `0030`, `0031`)

`public.governorates` (24, INS ids, with `map_row`/`map_col` for the demand cartogram) · `public.delegations`
(279) · `public.project_types` · `public.option_lists` + `public.option_items` · `public.ownership_scenarios`
(the "كيفاش تحب مشروعك يكون؟" cards) · `public.lead_statuses`.

Option list keys inserted by migrations: `down_payment`, `monthly_installment`, `goal`, `contact_time`,
`property_type`, `tree_age`, `land_document`, `desired_area`, `priority`, `plantation_system`, `tree_count`,
`agrized_service`, `duration`, `budget`, `down_payment_percent`. The code reads eleven of them through
`optionsFor(config, key)`: `tree_count`, `down_payment_percent`, `duration`, `goal`, `contact_time`,
`desired_area`, `plantation_system`, `property_type`, `tree_age`, `land_document`, `agrized_service`.

**Demand / CRM** (`0002`, `0007`, `0008`, `0011`, `0028`, `0030`, `0032`, `0049`)

`public.persons` · `public.interest_requests` (the snapshot of one demand: chosen options, tree count,
spacing class, payment mode, prices, and since `0049` the offer columns `request_kind`, `project_id`,
`project_code`, `project_name`, `offer_trees`, `offer_price_per_tree_millimes`, `offer_total_price_millimes`
and the annual-fee pair) · `public.person_status_history` · `public.contact_attempts` · `public.person_notes` ·
`public.person_assignments` · view `public.crm_requests`.

**Landowner intake** (`0003`)

`public.land_offers` · `public.land_offer_files` (private bucket) · `public.land_offer_reviews`.
Statuses `under_study, legal_review, technical_review, field_visit, accepted, rejected, postponed, converted`
(`src/lib/land.ts` labels them: `«قيد الدراسة»`, `«مراجعة قانونية»`, `«مراجعة فنية»`, `«زيارة ميدانية»`,
`«مقبول»`, `«مرفوض»`, `«مؤجّل»`, `«محوّل إلى مشروع»`).

**Offer side: projects and parcels** (`0012`, `0014`, `0020`, `0021`, `0022`, `0023`, `0034`, `0035`)

`public.projects` · `public.parcels` · `public.project_costs` (internal, Finance/Admin only) ·
`public.project_media` (gallery).
`project_status`: `draft, preparing, internal, published, sold_out, operating, archived`
(`«مسودة»`, `«قيد التحضير»`, `«جاهز (داخلي)»`, `«منشور»`, `«مكتمل البيع»`, `«في طور الاستغلال»`, `«مؤرشف»`).
`parcel_status`: `available, interested, reserved, contracting, sold, owned, withdrawn`
(`«متاحة»`, `«مهتم بها»`, `«محجوزة»`, `«في طور التعاقد»`, `«متعاقد عليها»`, `«مملوكة»`, `«موقوفة»`) —
`owned` was added by `alter type … add value` in `0021`.
`src/lib/projects.ts` also derives the four offer families of report v3 §3 from a parcel's own fields, in
`offerTypeOf()`: `productive «زيتون منتج»`, `new_planting «غراسة جديدة»`, `intensive «زيتون مكثّف»`,
`bare_land «أرض بيضاء»`.

**Tree pricing** (`0031`, `0034`, `0036`, `0045`, `0046`, `0048`)

`public.tree_spacing_classes` (row spacing × tree spacing → `area_m2` per tree) ·
`public.tree_pricing_rules` (global row plus optional per-project override: land price per m², planting cost,
margin as percent or fixed, and since `0045` the yearly care fee per tree) ·
`public.tree_cost_items` (extra cost lines, `basis` per tree or per m²) ·
`public.financing_markups` (`months → markup_bp`) ·
`public.project_spacing_classes` and `public.project_down_payment_percents` (which global choices a project
narrows to).

**Messaging** (`0003`, `0037`)

`public.message_templates` (rendered by `app.render_template`) and `public.notification_outbox`
(`notification_status ∈ pending, sending, sent, failed, skipped`), enqueued by `app.enqueue_message`.
**Nothing in `src/` sends them** — see Observations.

### 1.6 The module system (feature flags) is the spine

`public.feature_flags` holds 15 rows across the migrations:

| Seeded in | Keys |
|---|---|
| `0004` | `interest_form` (public), `simulator_basic` (public), `land_offers` (public), `projects` (disabled), `matching` (disabled), `visits`, `reservations`, `contracts`, `installments`, `zitounti`, `subscriptions`, `agri_backoffice`, `harvest` (all disabled) |
| `0025` | `public_statistics` (public) |
| `0031` | `pricing` (**internal**) |

`src/lib/modules-catalog.ts` names the six the code actually implements —
`IMPLEMENTED_MODULES = ["interest_form", "simulator_basic", "land_offers", "projects", "public_statistics", "pricing"]` —
and `/admin/settings/modules` refuses to publish anything else. State labels:
`disabled → «معطّل»`, `internal → «داخلي فقط»`, `public → «منشور للعموم»`.

Two different readers of a flag exist, and the difference matters:

- `flagState(config, key)` (`src/lib/config.ts`) — pure, no session. The home page uses **only** this, because
  it is prerendered with `export const revalidate = 60` and must never read a staff session.
- `moduleAccess(config, key)` (`src/lib/modules.ts`) — returns `"open"` when the flag is `public`,
  `"preview"` when it is `internal` **and** `getStaffSession()` returns a staff member, `"closed"` otherwise.
  Used by `/start`, `/register`, `/projects*`, `/land`. A `closed` page renders `<ComingSoon>` (`«قريباً»` +
  `«هذا القسم غير متاح حالياً. سنفتحه قريباً.»`); a `preview` page renders `<PreviewBanner>`
  (`«معاينة داخلية: هذا القسم غير منشور للعموم، ويراه فريق AgriZed فقط.»`) above the real content.

`publicMode(access)` in `src/lib/public-projects.ts` turns that into the data path: `"preview"` reads with the
staff cookie client and is **never cached**, so a staff-only row cannot land in the shared anonymous cache;
anything else reads with the anon client through `unstable_cache`.

### 1.7 How the major parts connect

Four data paths exist, and every page uses exactly one of them per query:

| Client factory | File | Used by |
|---|---|---|
| `createPublicClient()` — anon, no cookies | `src/lib/supabase/public.ts` | the cached loaders: `loadPublicConfig`, `loadMillionProgress`, `loadSpacingClasses`, and `callRpc("anon", …)` in `public-projects.ts` |
| `createClient()` — cookie-bound, RLS as the caller | `src/lib/supabase/server.ts` | every Back Office page and action; `publicTreeQuote()`; `callRpc("preview", …)`. Forwards `auditHeaders()` (`x-client-ip`, `x-client-ua`) so database triggers can record them |
| `createAdminClient()` — service role, bypasses RLS | `src/lib/supabase/admin.ts` | **only** `register/actions.ts`, `land/actions.ts`, `projects/[code]/offer-actions.ts`, `users/actions.ts` (Supabase Auth admin API), `setup/actions.ts`, `auth-events.ts` |
| `updateSession()` — refreshes auth cookies | `src/lib/supabase/proxy.ts`, called by `src/proxy.ts` | `/admin/:path*` only |

**Caching and invalidation.**

| Cache | Key / tag | TTL |
|---|---|---|
| `loadPublicConfig` | `["public-config-v6"]`, tag `PUBLIC_CONFIG_TAG` = `"public-config"` | 300 s |
| `loadSpacingClasses` | `["spacing-classes-v1"]`, tag `PUBLIC_CONFIG_TAG` | 300 s |
| `cachedAnonRpc` (public project RPCs) | `["public-projects-v1"]`, tag `PUBLIC_PROJECTS_TAG` = `"public-projects"` | 60 s |
| `loadMillionProgress` | `["million-progress-v2"]`, **no tag** | 60 s |

Back Office actions call `updateTag(PUBLIC_CONFIG_TAG)` (settings, lists, media, modules, pricing) and
`updateTag(PUBLIC_PROJECTS_TAG)` (projects/parcels, `pricing.default` setting, the `projects` module flag),
plus targeted `revalidatePath`. `loadPublicConfig` wraps its query in `withRetry(…, 3)` with 800 ms/1600 ms
backoff because the home page is prerendered at build time.

Route segment config: `/` is `revalidate = 60`; `/projects`, `/projects/[code]`,
`/projects/[code]/[parcel]`, `/projects/map`, `/land` and `/admin/setup` are `dynamic = "force-dynamic"`.

**Error boundaries.** `src/app/(public)/error.tsx` covers the public tree; `src/app/global-error.tsx` renders
its own `<html lang="ar" dir="rtl">` document for a crash in the root layout.

### 1.8 OBSERVATIONS (section 1)

- **Dead files.** `src/components/site/project-card.tsx` is imported by nothing (it imports `site-photo`, so it
  is not orphaned in the other direction). `src/app/(public)/simulator/capacity-simulator.tsx` is imported by
  nothing — `src/app/(public)/simulator/page.tsx` is five lines that `redirect("/start")`.
  `src/components/admin/section-not-open.tsx` exports `SectionNotOpen`, and the only occurrences of that name
  in `src/` are its own declaration and type; the five Back Office sections it was written for were removed
  from `nav-model.ts`.
- **A link that can point at a missing route.** `SiteHeader` adds `{ href: "/zitounti", label: "زيتونتي" }`
  when `flagState(config, "zitounti") === "public"`. There is no `src/app/(public)/zitounti` directory, so
  publishing that flag produces a 404 link. The `zitounti` module is not in `IMPLEMENTED_MODULES`, so
  `/admin/settings/modules` should refuse to publish it — the guard is in the Back Office, not in the header.
- **Cross-route imports between pages.** `src/app/(public)/page.tsx` imports `areaPerTree` and `offerStock`
  **from `./projects/page`**; `src/app/(public)/projects/[code]/page.tsx` imports
  `areaPerTree, LegalNotes, longestDuration, offerStock, offersTitle, StockCell` from `../page`; and
  `src/app/(public)/projects/[code]/[parcel]/page.tsx` imports `offerStock, StockStrip` from `../../page`. A
  route module is doing duty as a shared library. The home page's own comment says this is deliberate ("so the
  home page counts an offer exactly as `/projects` does instead of keeping a second definition"), but it means
  `/projects/page.tsx` cannot be changed without touching three other routes, and `force-dynamic` on that file
  sits next to `revalidate = 60` on its importer.
- **Two `PAYMENT_MODES` constants.** `src/lib/tree-pricing.ts` exports `PAYMENT_MODES` /`PaymentMode`, and
  `src/app/admin/(panel)/leads/filters.ts` declares its own identical pair. `filters.ts` is imported by the
  client bulk-assign component, and `tree-pricing.ts` is `server-only`, which explains it; the duplication is
  real nonetheless.
- **The SMS path stops at the queue.** `public.notification_outbox`, `public.message_templates`,
  `app.enqueue_message` and `app.render_template` exist, and `0037_sms_sender.sql` adds the sender identity
  settings. No file in `src/` reads `notification_outbox` other than through RLS-readable Back Office pages,
  and there is no worker, cron route or provider client anywhere in the repository.
- **A drafted migration is sitting outside the applied set.** `supabase/pending/bb_crm_offer_columns.sql`
  (16 614 bytes, untracked) and `supabase/pending/tests/bb_crm_offer_columns.sql` rebuild `public.crm_requests`
  and `public.crm_search_requests` so the CRM can see the `0049` offer columns. The header of
  `src/app/admin/(panel)/leads/offer-snapshot.ts` states the consequence of it not being applied: "a client who
  asked for 25 trees of a named offer is indistinguishable in the leads list from someone who moved a slider on
  `/start`", and that module works around it by reading the offer side "where it actually lives today".
- **README drift (doc vs code).** `README.md` says "Lot 0 (foundation) and Lot 1 (phase 1, demand collection)
  are implemented. Phases 2 to 4 exist as disabled feature flags only" and its Project-structure block lists
  `src/app/(public)/` as "home, /register (step-by-step form), /simulator, /land". The code has a full
  `/start` calculator, a `/projects` catalogue with offer and parcel pages and a coverage map, a tree-pricing
  Back Office, and `/simulator` is a redirect. The README also describes `src/proxy.ts` correctly but the
  "Not done yet" section's SMS entry is the only accurate status line in that area.
- **`million.ts` caches without a tag.** `loadMillionProgress` passes `{ revalidate: 60 }` and no `tags`, so no
  Back Office action can flush it; the other three cached loaders are all tagged.
- **`million_progress()` returning `null` is overloaded.** `src/lib/million.ts` returns `null` both when the
  database cannot be reached and when the `public_statistics` module is not public (the RPC answers `null`),
  and the home page hides the whole section in both cases.
- **`getStaffSession()` is reached from a public path.** `moduleAccess()` calls it, so `/start`, `/register`,
  `/projects*` and `/land` all read cookies. That is what makes `preview` work, and it is also why those routes
  cannot be statically prerendered the way `/` is.

---

## 31. FILE MAP

Generated files (`src/lib/supabase/database.types.ts`, 3 020 lines, produced by `npm run db:types`) and
`node_modules` are noted but not expanded. Line counts are from the working tree at audit time.

```
agrized/
├── AGENTS.md                         Next-16 warning block re-written by `next dev`
├── CLAUDE.md                         Project rules for agents (@AGENTS.md + AgriZed rules)
├── README.md                         Setup, scripts, structure — partly stale (see 1.8)
├── package.json                      Next 16.3.5 / React 19.2.8 / Supabase / zod / Tailwind 4
├── next.config.ts                    Security headers, Supabase image host, 6 MB Server Action body
├── postcss.config.mjs                @tailwindcss/postcss
├── eslint.config.mjs                 eslint-config-next
├── tsconfig.json                     strict, `@/*` → `./src/*`, Next plugin
├── .env.example                      Required env: Supabase URL/keys, DIRECT_URL, IP_HASH_SALT, …
├── .claude/launch.json               Dev-server entries (port 3000; a second one on 3100)
│
├── public/
│   └── favicon.ico                   Drawn by scripts/make-favicon.mjs from src/app/icon.svg
│
├── docs/
│   ├── cahier-des-charges-v2.md      Spec v2 (Arabic) — the «كراس الشروط»
│   ├── rapport-developpement-v3.md   Report v3; owner ruled it wins over v2 on conflicts
│   ├── gap-rapport-v3.md             v3 vs what exists / what was planned
│   ├── plan-zitouna.md               Plan for the tree-with-its-area unit (Q-1…Q-13, P0…P6)
│   ├── plan-rebuild.md               2026-09-18 rebuild plan; P6 is where the five dropped nav rows return
│   ├── tree-area-and-cost.md         Owner addendum: spacing class → area → cost → margin
│   ├── design-direction.md           Visual spec for the client-facing pages
│   └── site-photos.md                How the site_media photo slots are filled
│
├── scripts/
│   ├── db-migrate.mjs                Applies supabase/migrations/*.sql once each, tracked in app.schema_migrations
│   ├── db-test.mjs                   Runs supabase/tests/*.sql in transactions that are always rolled back
│   ├── db-dry-run.mjs                Runs a pending migration + its test in ONE rolled-back transaction
│   ├── db-types.mjs                  Regenerates src/lib/supabase/database.types.ts via the Management API
│   ├── create-super-admin.mjs        Creates the first Super Admin; refuses if one exists
│   ├── reset-admin-password.mjs      Sets a new password for an existing staff account
│   ├── seed-demo-projects.mjs        15 `DEMO-` projects, all `internal`; `-- --purge` removes them
│   └── make-favicon.mjs              Redraws public/favicon.ico from src/app/icon.svg
│
├── supabase/
│   ├── data/tunisia_admin.json       24 governorates / 279 delegations (INS 2024)
│   ├── migrations/                   0001 → 0050, applied in filename order; later files override earlier
│   │   ├── 0001_foundation.sql       app schema, app_role, profiles, user_roles, settings, feature_flags, audit_logs, RLS
│   │   ├── 0002_reference_and_crm.sql   counters, governorates/delegations, project_types, option lists, lead_statuses, persons, interest_requests, contact_attempts, notes, assignments
│   │   ├── 0003_land_offers_and_intake.sql  message_templates, notification_outbox, throttle, land_offers(+files, reviews), public intake RPCs
│   │   ├── 0004_seed_configuration.sql  First settings, 13 feature flags, first option lists/items
│   │   ├── 0005_seed_governorates.sql   The 24/279 rows
│   │   ├── 0006_home_content.sql        Home copy as JSON settings
│   │   ├── 0007_crm_queries.sql         crm_search_requests, crm_demand_stats, demand_indicator, WhatsApp templates
│   │   ├── 0008_crm_edit_rights.sql     Finance/Legal read the CRM, do not write to it
│   │   ├── 0009_optional_delegation.sql Delegation becomes optional in the signup form
│   │   ├── 0010_ownership_area_priority.sql  ownership_scenarios, desired_area, priority, plantation_system
│   │   ├── 0011_intake_and_search_v2.sql     Intake + search for the clause-25 answers
│   │   ├── 0012_projects_and_parcels.sql     projects, project_costs, parcels
│   │   ├── 0013_pricing_and_matching.sql     compute_installment_plan, match_requests_for_parcel
│   │   ├── 0014_parcel_card_note.sql         legal.parcel_card_note under every offer card
│   │   ├── 0015_site_media.sql               site_media table + public `site-media` bucket
│   │   ├── 0016_million_trees.sql            The olive tree becomes the unit; million_progress()
│   │   ├── 0017_tree_count_500.sql           tree_count cards 25/50/100/250/500 + open choice
│   │   ├── 0018_site_media_credit.sql        CC-BY credits on photo slots
│   │   ├── 0019_start_page.sql               The /start page and its typed tree count
│   │   ├── 0020_public_projects.sql          public_projects / public_parcels / public_coverage / public_parcel_offer, app.project_visible
│   │   ├── 0021_parcel_statuses_v2.sql       adds parcel_status 'owned'
│   │   ├── 0022_cards_and_costs_v3.sql       «ابتداءً من X د تسبقة» (app.parcel_down_from) + project cost categories
│   │   ├── 0023_project_page_v3.sql          project_media, public_project_page (gallery, video, water, access, documents, services)
│   │   ├── 0024_audit_reason.sql             app.require_reason / app.set_reason for sensitive RPCs (§51)
│   │   ├── 0025_million_counter_split.sql    4-way counter + the `public_statistics` module
│   │   ├── 0026_wording_v2_v3.sql            v2/v3 vocabulary, hero, CTAs, metadata
│   │   ├── 0027_offer_type_cards.sql         The four offer types as ownership_scenarios rows
│   │   ├── 0028_crm_trees.sql                Tree counts in crm_demand_stats / crm_search_requests, people mode
│   │   ├── 0029_demand_map.sql               governorates.map_row / map_col for the cartogram
│   │   ├── 0030_intake_v3.sql                Down payment + duration replace the monthly amount; `duration` list
│   │   ├── 0031_tree_pricing.sql             tree_spacing_classes, tree_pricing_rules, tree_cost_items, financing_markups, project_spacing_classes, project_down_payment_percents, app.tree_price, `pricing` flag, app.can_price
│   │   ├── 0032_intake_pricing.sql           Intake snapshots the class, mode and prices; crm_requests rebuilt
│   │   ├── 0033_home_unit.sql                Home copy for «الزيتونة مع مساحتها»
│   │   ├── 0034_project_quote.sql            app.parcel_price, app.project_quote_payload, public/staff_project_quote
│   │   ├── 0035_projects_tree.sql            Projects/parcels on tree pricing; staff_project_parcel_prices; listings rebuilt
│   │   ├── 0036_markup_on_remaining.sql      Markup applies to (cash − down), not to the whole price
│   │   ├── 0037_sms_sender.sql               sms.sender_id / sms.provider settings
│   │   ├── 0038_success_welcome.sql          Confirmation-screen welcome copy
│   │   ├── 0039_message_asset.sql            «زيتونتك هي مشروعك» positioning copy
│   │   ├── 0040_message_people.sql           Second positioning pass: people, not the number
│   │   ├── 0041_payment_hint.sql             Instalment sentence moved onto a key the calculator renders
│   │   ├── 0042_million_leftovers.sql        Removes the last places that sold the million
│   │   ├── 0043_people_counter.sql           «وين وصلنا؟» counts people; people bands
│   │   ├── 0044_goal_line.sql                The goal stops being announced (keys emptied, not dropped)
│   │   ├── 0045_annual_fee.sql               Yearly per-tree care fee on the pricing rules and in every quote
│   │   ├── 0046_annual_fee_save.sql          Lets the pricing page actually save that fee
│   │   ├── 0047_annual_fee_copy.sql          The two settings that carry the fee's label and note
│   │   ├── 0048_offer_annual_fee.sql         Carries the fee into the offer payload
│   │   ├── 0049_offer_intake.sql             submit_offer_request + interest_requests.request_kind and offer columns
│   │   └── 0050_offer_copy.sql               The words of «عروضنا»
│   ├── tests/                        001 → 031, run inside rolled-back transactions
│   │   ├── 001_interest_intake.sql … 004_million_counter.sql   intake rules, RLS, pricing/matching, counter
│   │   ├── 005_start_custom_trees.sql … 012_vocabulary_guard.sql
│   │   ├── 013_offer_type_cards.sql … 021_projects_tree.sql
│   │   └── 022_sms_sender.sql … 031_offer_intake.sql
│   └── pending/                      NOT applied, untracked
│       ├── bb_crm_offer_columns.sql        Rebuilds crm_requests + crm_search_requests for the 0049 offer columns
│       └── tests/bb_crm_offer_columns.sql  Its test
│
└── src/
    ├── proxy.ts                      Next 16 request hook. Refreshes the Supabase session; redirects
    │                                 unauthenticated /admin/* to /admin/login?next=…  matcher: /admin/:path*
    │
    ├── app/
    │   ├── layout.tsx                <html lang="ar" dir="rtl">, Arabic fonts, metadata from settings
    │   ├── globals.css               388 lines: @theme brand tokens, .btn/.card/.panel/.pill/.stat classes
    │   ├── icon.svg                  App icon
    │   ├── global-error.tsx          Own <html> document for a root-layout crash
    │   │
    │   ├── (public)/
    │   │   ├── layout.tsx            SourceCapture + SiteHeader + SiteFooter + StickyCta (flag-gated)
    │   │   ├── error.tsx             Public error boundary
    │   │   ├── page.tsx              (500) Home: two doors, live offers, unit explainer, counter, services, FAQ
    │   │   ├── start/
    │   │   │   ├── page.tsx          The calculator page; module `simulator_basic`
    │   │   │   ├── start-chooser.tsx (1160) Client: trees → offer type → spacing → payment → down % → duration
    │   │   │   ├── calculator.ts     Lists from config, URL choices, quote call, summary input (server-only)
    │   │   │   ├── calculator-summary.ts (354) Turns choices + quote into the recap rows and the /register query
    │   │   │   ├── copy.ts           Every calculator string, read from settings (AR + optional FR)
    │   │   │   └── actions.ts        `quoteStart()` → publicTreeQuote() → public_tree_quote RPC
    │   │   ├── register/
    │   │   │   ├── page.tsx          The lead form; module `interest_form`; shows live offers after success
    │   │   │   ├── register-wizard.tsx (1078) Client: 6 steps, recap, success screen
    │   │   │   └── actions.ts        `submitInterest()` → service role → public.submit_interest_request
    │   │   ├── projects/
    │   │   │   ├── page.tsx          (457) Offer catalogue + filters; also exports offerStock/areaPerTree/…
    │   │   │   ├── map/page.tsx      Governorate coverage from public_coverage
    │   │   │   └── [code]/
    │   │   │       ├── page.tsx      (511) One offer: identity, gallery, video, facts, quote, parcels
    │   │   │       ├── offer-interest-form.tsx (412) Client: the offer's own intake form
    │   │   │       ├── offer-actions.ts  `submitOfferInterest()` → public.submit_offer_request
    │   │   │       └── [parcel]/page.tsx (230) One plot: figures, offer block, link to /register
    │   │   ├── land/
    │   │   │   ├── page.tsx          Landowner intake; module `land_offers`
    │   │   │   ├── land-offer-form.tsx (646) Client: multi-step form with geolocation and file picks
    │   │   │   └── actions.ts        `submitLandOffer()` → public.submit_land_offer; `finalizeLandOfferFiles()`
    │   │   └── simulator/
    │   │       ├── page.tsx          redirect("/start")
    │   │       └── capacity-simulator.tsx  (141) UNUSED — imported by nothing
    │   │
    │   └── admin/
    │       ├── login/{page,login-form,actions}.tsx|ts   Sign-in; logs auth.login / auth.login_failed / auth.login_denied
    │       ├── setup/{page,actions}.tsx|ts             Token-gated first-password screen for a Super Admin
    │       └── (panel)/
    │           ├── layout.tsx        requireStaff(); sidebar from roles + flags; breadcrumbs; sign-out
    │           ├── admin-nav.tsx     Client sidebar: current row and current branch, from the pathname
    │           ├── page.tsx          (340) Dashboard: pipeline, overdue callbacks, stock, land offers
    │           ├── leads/
    │           │   ├── page.tsx      (760) CRM list: filters, totals, per-demand or per-person rows
    │           │   ├── filters.ts    (175) URL ⇄ crm_search_requests parameters; request-kind and payment labels
    │           │   ├── offer-snapshot.ts  Reads the 0049 offer columns where they live today (view is stale)
    │           │   ├── bulk-assign.tsx    Client: transfer many files to one commercial
    │           │   ├── actions.ts    `assignPersons()` (ADMIN_ROLES) → admin_assign_persons
    │           │   ├── export/route.ts (206) CSV export, batched 500, capped 100 000 rows
    │           │   └── [personId]/{page,actions}.tsx|ts  (515) One file: history, attempts, notes, status, WhatsApp template
    │           ├── analytics/
    │           │   ├── page.tsx      (317) crm_demand_stats charts + the governorate cartogram
    │           │   └── demand-stats.ts    Shape of crm_demand_stats + the shared period picker
    │           ├── projects/
    │           │   ├── page.tsx      (173) The offers list with tree stock per offer
    │           │   ├── actions.ts    (491) saveProject/saveParcel/costs/pictures/spacing; updateTag(public-projects)
    │           │   ├── stock.ts      Tree stock per parcel status → available / reserved / sold / withdrawn
    │           │   ├── stock-strip.tsx    The four stock tiles with the statuses each one summed
    │           │   ├── lots-table.tsx     One lots table, reused by the offer tab and /admin/projects/parcels
    │           │   ├── parcel-fields.tsx  The fields of one lot, shared by the add form and the edit page
    │           │   ├── parcels/page.tsx   (166) Every lot across every offer
    │           │   └── [id]/
    │           │       ├── page.tsx       (316) One offer: identity above, five tabs below
    │           │       ├── identity.tsx   What the offer IS (code, place, area, trees, price per tree)
    │           │       ├── offer-tabs.tsx Tab bar; the tab lives in the query string
    │           │       ├── card-tab.tsx   (252) «البطاقة» — one form, guarded by the `page_fields` marker
    │           │       ├── lots-tab.tsx   «القطع» — plan, table, add form
    │           │       ├── pictures-tab.tsx «الصور» — gallery, cover, order
    │           │       ├── pricing-tab.tsx (163) «التسعير» — is this offer priced by the tree?
    │           │       ├── costs-tab.tsx  «التكاليف» — internal budget, Finance/Admin only
    │           │       └── parcels/[parcelId]/page.tsx (320) One lot: fields, staff_parcel_offer, matching
    │           ├── land-offers/
    │           │   ├── page.tsx      (156) Queue of landowner offers
    │           │   └── [id]/
    │           │       ├── page.tsx  (260) One offer + demand_indicator for its governorate
    │           │       ├── actions.ts     `reviewLandOffer()` → public.review_land_offer
    │           │       └── files/[fileId]/route.ts  5-minute signed URL + log_action('document.open')
    │           ├── pricing/          PRICE_ROLES only — the tree-pricing Back Office
    │           │   ├── page.tsx      (244) Global rules + per-project overrides + a live simulator
    │           │   ├── actions.ts    (349) 9 actions, each → a staff_* RPC with p_reason
    │           │   ├── types.ts      Row shapes of the pricing tables
    │           │   ├── form-values.ts   Dinars → millimes and percent → basis points, scaled as text
    │           │   ├── rule-form.tsx / markups-form.tsx / cost-items.tsx / allowed-choices-form.tsx
    │           │   ├── rates-section.tsx / spacing-section.tsx / project-section.tsx / simulator-section.tsx
    │           │   ├── fields.tsx / note-callout.tsx
    │           ├── settings/
    │           │   ├── page.tsx      (227) Settings by group_key, with the last editor's name
    │           │   ├── actions.ts    `updateSetting()`; updateTag(public-config) (+ public-projects for pricing.default)
    │           │   ├── ranges.ts     Accepted range per integer setting
    │           │   ├── pair-list-editor.tsx  Client editor for JSON pair lists
    │           │   ├── lists/{page,actions}.tsx|ts  (558/289) option_items, project_types, scenarios, lead_statuses
    │           │   ├── media/{page,actions}.tsx|ts  site_media slots → the public `site-media` bucket
    │           │   └── modules/{page,actions}.tsx|ts  feature_flags; refuses keys outside IMPLEMENTED_MODULES
    │           ├── users/{page,actions}.tsx|ts   (158/132) Staff accounts, roles, activation, password reset
    │           ├── audit/page.tsx    (258) audit_logs viewer with filters
    │           └── account/{page,actions}.tsx|ts Change your own password; logs auth.password_changed
    │
    ├── components/
    │   ├── ui/                       The shared server-component layer
    │   │   ├── index.ts              Re-exports everything below
    │   │   ├── data-row.tsx / data-table.tsx / stat-tile.tsx / status-pill.tsx
    │   │   ├── form-field.tsx / section-header.tsx / empty-state.tsx
    │   ├── brand/wordmark.tsx        "Agri" forest green + "Zed" gold, serif
    │   ├── site/
    │   │   ├── site-header.tsx       Sticky header; `primaryCta(config)` decides /start vs /register
    │   │   ├── site-footer.tsx       Legal notice, contacts, photo credits
    │   │   ├── sticky-cta.tsx        Client: phone-only bottom bar; suppressed on pages with their own action
    │   │   ├── module-gate.tsx       <ComingSoon> «قريباً» and <PreviewBanner> «معاينة داخلية…»
    │   │   ├── source-capture.tsx    Client: remembers campaign/referrer per browser tab (HOME-04)
    │   │   ├── home-paths.tsx        The two home doors: estimate (dashed card) vs stock (panel)
    │   │   ├── million-counter.tsx   (207) «وين وصلنا؟» — the four figures and the people bands
    │   │   ├── million-start.tsx     The tree-count card row on the home page
    │   │   ├── tree-card.tsx         A tree drawing that grows with the number on the card
    │   │   ├── offer-card.tsx        (192) One offer in the catalogue
    │   │   ├── parcel-card.tsx       One plot in a list
    │   │   ├── parcel-plan.tsx       The plan of an offer's plots (also used in the Back Office lots tab)
    │   │   ├── offer-block.tsx       Legacy money block (cash + installment plans + examples)
    │   │   ├── tree-offer-block.tsx  (207) Tree-pricing money block
    │   │   ├── project-gallery.tsx / project-video.tsx  Report v3 §20 gallery and privacy-mode player
    │   │   ├── site-photo.tsx        A `site_media` slot, or a branded placeholder
    │   │   ├── breadcrumb.tsx / bilingual.tsx / growth-icon.tsx
    │   │   └── project-card.tsx      UNUSED — imported by nothing
    │   └── admin/
    │       ├── nav-model.ts          ADMIN_LABELS, NavItem/NavGroup, trailFor() — no @/lib/auth import
    │       ├── nav-icons.tsx         (174) 18 inline SVG icons on one 24×24 grid
    │       ├── admin-breadcrumbs.tsx Client: the trail for the current pathname
    │       ├── action-form.tsx       Client wrapper around useActionState for every Back Office form
    │       ├── reason-field.tsx      The required «سبب التغيير» field (§51) forwarded as p_reason
    │       ├── pricing-editor.tsx    (282) Plain fields ⇄ the pricing jsonb
    │       ├── legacy-pricing-notice.tsx  Shown only once the tree pricing exists
    │       ├── tree-pricing-inputs.tsx / -margin-fields / -spacing-fields / -quote.tsx (280)
    │       ├── charts.tsx (176) / demand-map.tsx (168)  Server-rendered HTML/CSS charts and cartogram
    │       └── section-not-open.tsx  UNUSED — the five sections it served were removed from the nav
    │
    └── lib/
        ├── supabase/
        │   ├── server.ts             Cookie-bound client (RLS as the caller) + auditHeaders
        │   ├── public.ts             Anonymous cookieless client for cached public data
        │   ├── admin.ts              Service-role client; server only, never from a Client Component
        │   ├── proxy.ts              updateSession() for src/proxy.ts
        │   ├── storage-upload.ts     LAND_OFFER_BUCKET + upload helper for the private bucket
        │   └── database.types.ts     GENERATED (3 020 lines) — npm run db:types
        ├── config.ts                 getPublicConfig() + settingText/Bool/Int/Json, optionsFor, mediaFor, flagState
        ├── modules.ts                moduleAccess(): open / preview / closed
        ├── modules-catalog.ts        IMPLEMENTED_MODULES, FLAG_STATE_LABELS, PHASE_LABELS
        ├── auth.ts                   Roles, role groups, getStaffSession(), hasRole(), requireStaff()
        ├── auth-events.ts            Writes auth.* rows to audit_logs with the service-role client
        ├── crm.ts                    Stage / channel / outcome / plantation / production labels and tones
        ├── projects.ts               (184) Project and parcel status labels+tones, offer types, cost kinds, offer/plan types
        ├── public-projects.ts        (358) The public project RPC layer: anon cache vs staff preview
        ├── tree-pricing.ts           (191) SpacingClass, TreeQuote, publicTreeQuote(), getSpacingClasses()
        ├── parcel-prices.ts          staff_project_parcel_prices → per-parcel computed area and price
        ├── pricing-form.ts           (312) Back Office fields ⇄ the pricing jsonb; no imports, so both sides agree
        ├── million.ts                million_progress() → the home counter
        ├── land.ts                   Land-offer statuses, review outcomes, capacity and irrigation labels
        ├── public-hrefs.ts           /projects, /projects/[code], /projects/[code]/[parcel], /register?… builders
        ├── format.ts                 Millimes, dates (Africa/Tunis), counts, areas, spacing
        ├── phone.ts                  normalizePhone() → E.164 (TN default), formatPhone()
        ├── digits.ts                 Arabic-Indic and Persian digits → 0-9
        ├── errors.ts                 Arabic message per intake error code; the fallback message
        ├── request-context.ts        clientIp(), auditHeaders(), hashIp() (salted with IP_HASH_SALT)
        ├── site-media-upload.ts      5 MB / jpg-png-webp-avif upload into the public `site-media` bucket
        └── env.ts                    Reads and asserts NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
```

### OBSERVATIONS (section 31)

- `src/lib/supabase/database.types.ts` is 3 020 of the 4 988 lines under `src/lib/` — the hand-written library
  is under 2 000 lines.
- The two largest hand-written files in the repository are both public client components:
  `src/app/(public)/start/start-chooser.tsx` (1 160 lines) and
  `src/app/(public)/register/register-wizard.tsx` (1 078 lines). The largest Back Office file is
  `src/app/admin/(panel)/leads/page.tsx` (760 lines).
- `src/app/admin/(panel)/projects/[id]/` was recently split: `offer-tabs.tsx` says the page "used to be one
  833-line scroll of six unrelated sections"; the current `page.tsx` is 316 lines with five tab files beside it.
  `parcel-fields.tsx` and `lots-table.tsx` were lifted one directory up because two routes use them.
- `src/components/ui/index.ts` documents two shapes deliberately **not** folded in: the leads filter form's
  `FilterField` and `tree-pricing-quote`'s `Row`.

---

## 32. FINAL SYSTEM MAP

Only connections that exist in the code today. `RPC` means a Postgres function called by name;
`SD` marks a `security definer` function.

### 32.1 Request entry

```
browser
  │
  ├── /admin/*  ──► src/proxy.ts  (matcher: /admin/:path*)
  │                  └─ updateSession()  →  supabase.auth.getClaims()
  │                       ├─ no user  → 302 /admin/login?next=<path>
  │                       └─ user     → pass through with refreshed cookies
  │                                      (still re-checked by requireStaff() on every page/action)
  │
  └── everything else ──► no proxy at all (public pages never touch Supabase auth in the proxy)
```

### 32.2 Public side — the calculator journey

```
/  (src/app/(public)/page.tsx, revalidate = 60, flagState only — never reads the staff session)
│   reads: getPublicConfig()          → settings, feature_flags, governorates, delegations,
│                                       project_types, ownership_scenarios, option_items, site_media
│          getMillionProgress()       → RPC public.million_progress()      [only if public_statistics = public]
│          getSpacingClasses()        → table public.tree_spacing_classes  [only if site.unit_title is set]
│          liveOffers()               → RPC public_projects + public_parcels (anon, cached 60 s)
│                                       [only if flagState("projects") === "public"]
│   renders: HomePath ×2 («احسب مشروعك» → /start, «عروضنا» → /projects),
│            MillionStart tree cards → /start?trees=…, MillionCounter, OfferCard ×3,
│            unit explainer from tree_spacing_classes, agrized_service list, FAQ/steps/facts from settings
│
└─► /start  (module `simulator_basic` via moduleAccess → open | preview | closed)
    │   getCalculatorLists(config) → tree_count, ownership_scenarios, tree_spacing_classes,
    │                                down_payment_percent, duration, million.custom_trees_min/max
    │   readCalculatorChoices(lists, searchParams) — every URL value re-checked against the live list
    │   quoteChoices(...) → publicTreeQuote() → RPC public.public_tree_quote
    │                       (cookie-bound client, so staff see an `internal` pricing flag; visitors get "closed")
    │   StartChooser (client) → server action quoteStart() → the same RPC on each change
    │   copy from settings via startCopy(config)
    │
    └─► «سجّل اهتمامك» → interestHref(...) → /register?trees=…&trees_custom=…&scenario=…&spacing=…
                                              &payment=…&down_pct=…&duration=…&visit=1
        │
        /register  (module `interest_form`)
        │   re-reads the same calculator lists; calculatorGap() says which answer is still missing
        │   RegisterWizard (client, 6 steps) → server action submitInterest()
        │        zod → normalizePhone() → hashIp() → createAdminClient(auditHeaders)
        │        → RPC public.submit_interest_request(p jsonb)   [SD, redefined 7×, last in 0032]
        │             it was NOT touched by 0049: its rows get request_kind = 'calculator' from the
        │             column default added by `alter table … add column request_kind text not null
        │             default 'calculator'`
        │             writes public.persons (+ public.interest_requests snapshot),
        │             validates every option id against its list, throttles on app.submission_throttle,
        │             enqueues a message through app.enqueue_message → public.notification_outbox
        │        errors come back as codes → intakeErrorMessage() → Arabic text,
        │        routed to a wizard step (ERROR_STEP) or back to /start (CALCULATOR_ERRORS)
        └── success screen: request number, welcome copy (0038), and the live offers
            (getPublicProjects(publicMode(moduleAccess(config,"projects"))))
```

### 32.3 Public side — the offer journey

```
/projects  (force-dynamic, module `projects`)
│   getPublicProjects(mode) → RPC public.public_projects   ┐ anon → cached under tag "public-projects"
│   getPublicParcels(mode)  → RPC public.public_parcels    ┘ preview → staff cookie client, uncached
│   offerStock(project, parcels) splits the trees into available / held / sold from parcel statuses
│   filters (governorate, offer type, trees, price…) applied in TypeScript over the returned rows
│
├─► /projects/map  → RPC public.public_coverage  (projects and parcels per governorate)
│
└─► /projects/[code]
    │   findProject() over public_projects; getProjectPage(code, mode) → RPC public.public_project_page
    │        (description, water, access, video, lat/long only when the team ticked «show location»,
    │         document_option_ids + service_option_ids resolved against option_items, media[])
    │   getProjectQuote(projectId, mode, {...}) → RPC public.public_project_quote
    │        → app.project_quote_payload → app.tree_price / app.financed_quote
    │        `pricing` comes back as closed | not_offered | legacy | unavailable | ok;
    │         toProjectQuote() drops every figure unless it is "ok"
    │   OfferInterestForm (client) → server action submitOfferInterest()
    │        refuses when moduleAccess(config,"projects") === "closed"
    │        → createAdminClient → RPC public.submit_offer_request(p jsonb)  [SD, 0049]
    │             writes public.interest_requests with request_kind = 'offer', the project's identity,
    │             offer_trees, and the price / annual-fee snapshot the database itself computed
    │
    └─► /projects/[code]/[parcel]
            findParcel() over public_parcels
            tree-priced parcel → getProjectQuote(...) → <TreeOfferBlock>
            legacy parcel      → getParcelOffer(parcelId, mode, {down, installment})
                                  → RPC public.public_parcel_offer → compute_installment_plan → <OfferBlock>
            CTA → interestHref({ parcelId, trees, spacing, payment, downPercent, duration, visit })
                  → /register?parcel=…
```

### 32.4 Public side — the landowner journey

```
/land  (force-dynamic, module `land_offers`)
   LandOfferForm (client; uses the geolocation permission kept open in next.config.ts)
   → server action submitLandOffer()
        zod → normalizePhone → hashIp → createAdminClient
        → RPC public.submit_land_offer(p jsonb)  [SD]  → public.land_offers (+ throttle, + outbox message)
   → server action finalizeLandOfferFiles()
        createAdminClient → rows in public.land_offer_files pointing at the private land-offer bucket
```

### 32.5 Admin side

```
requireStaff(ROLES)  ← every page and every Server Action, after src/proxy.ts has already redirected
│
/admin  (dashboard)                      persons, lead_statuses, contact_attempts, land_offers,
│                                        parcels, projects + RPC crm_demand_stats
├── /admin/leads            CRM_READ     RPC crm_search_requests (security invoker → the caller's RLS)
│   ├── filters.ts                       URL ⇄ RPC parameters, incl. request_kind, payment_mode, spacing_class_id
│   ├── offer-snapshot.ts                reads the 0049 offer columns directly, because crm_requests is stale
│   ├── export/route.ts                  the same RPC in 500-row batches → CSV (Arabic headers, formula-escaped)
│   ├── bulk-assign.tsx → actions.ts     ADMIN_ROLES → RPC admin_assign_persons(uuid[], uuid, text)
│   └── [personId]                       persons, interest_requests, contact_attempts, person_notes,
│        └── actions.ts                  person_status_history, person_assignments, message_templates
│                                        updateStatus / assignPerson / addContactAttempt / addNote
├── /admin/analytics        CRM_READ     RPC crm_demand_stats(p_from, p_people) + governorates.map_row/map_col
│                                        → charts.tsx and demand-map.tsx, both server-rendered HTML
├── /admin/projects         (flag)       projects + parcels; treeStock() per offer
│   ├── /[id]                            five tabs: card / lots / pictures / pricing / costs
│   │     ├── saveProject, saveParcel, addProjectCost, addProjectPicture,
│   │     │   setProjectCover, moveProjectPicture, removeProjectPicture      (WRITE_ROLES)
│   │     ├── saveOfferSpacingClasses → RPC staff_save_project_spacing_classes  (PRICE_ROLES)
│   │     ├── getStaffParcelPrices() → RPC staff_project_parcel_prices → app.parcel_price
│   │     └── costs tab reads project_costs — Finance/Admin only, never rendered for anyone else
│   ├── /[id]/parcels/[parcelId]         RPC staff_parcel_offer + RPC match_requests_for_parcel(p_limit 25)
│   └── /parcels                         every lot across every offer (same LotsTable component)
├── /admin/land-offers      LAND_OFFER   land_offers, land_offer_files, land_offer_reviews,
│   ├── [id]/actions.ts                  RPC demand_indicator(p_governorate)
│   │                                    reviewLandOffer → RPC public.review_land_offer
│   └── [id]/files/[fileId]/route.ts     role re-checked in the route → 5-min signed URL
│                                        + RPC log_action('document.open')
├── /admin/pricing          PRICE        tree_spacing_classes, tree_pricing_rules, tree_cost_items,
│                                        financing_markups, project_spacing_classes,
│                                        project_down_payment_percents, settings(pricing.max_months,
│                                        audit.reason_min_length)
│                                        9 actions → staff_save_spacing_class / staff_delete_spacing_class /
│                                        staff_save_pricing_rule / staff_delete_pricing_rule /
│                                        staff_save_cost_item / staff_delete_cost_item /
│                                        staff_save_financing_markups / staff_save_project_down_percents /
│                                        staff_save_project_spacing_classes  — each with p_reason (§51)
│                                        simulator section → RPC staff_tree_quote
├── /admin/settings         ADMIN        settings by group_key → updateSetting → updateTag(public-config)
│   ├── /lists                           option_items, project_types, ownership_scenarios, lead_statuses
│   ├── /media                           site_media ⇄ the public `site-media` bucket (uploadSiteImage)
│   └── /modules                         feature_flags; rejects keys outside IMPLEMENTED_MODULES;
│                                        publishing `projects` also updateTag(public-projects)
├── /admin/users            ADMIN        profiles + user_roles; createStaffUser / updateUserRoles /
│                                        setUserActive / resetUserPassword
│                                        → RPC admin_set_role, RPC admin_set_user_active,
│                                          Supabase auth.admin.createUser / updateUserById (service role)
├── /admin/audit            ADMIN        audit_logs + profiles (actor names)
└── /admin/account          any staff    password change → RPC log_action('auth.password_changed')
```

### 32.6 The write-back loop: Back Office → public pages

```
Back Office action                        cache tag flushed            public surface that changes
────────────────────────────────────────────────────────────────────────────────────────────────────
settings/actions.updateSetting            public-config                every page (copy, limits, CTAs)
   key === "pricing.default"              + public-projects            listings and offer prices
settings/lists/actions.*                  public-config                calculator lists, scenarios, statuses
settings/media/actions.*                  public-config (+ path "/")   every SitePhoto slot and the credits
settings/modules/actions.setModuleState   public-config                which pages exist for a visitor
   key === "projects"                     + public-projects            /projects and everything under it
pricing/actions.saveSpacingClass          public-config                spacing classes on / and /start
pricing/actions.deleteSpacingClass        public-config                idem
projects/actions.* (via one helper)       public-projects              /, /projects, offer and parcel pages
```

`projects/actions.ts` additionally calls `revalidatePath("/projects", "layout")`, as does
`settings/modules/actions.ts` when the `projects` flag changes.

### 32.7 Audit and identity, end to end

```
sign-in (admin/login/actions.signIn)
   Supabase password grant → logAuthEvent("auth.login" | "auth.login_failed" | "auth.login_denied")
   → createAdminClient().from("audit_logs").insert(...)  with ip and user_agent from auditHeaders()

any staff page/action
   createClient()  attaches  x-client-ip / x-client-ua  (auditHeaders)
   → app.request_header() reads them inside Postgres
   → app.write_audit / app.audit_row_change triggers write public.audit_logs
   → app.block_audit_mutation keeps the log append-only
   sensitive RPCs call app.set_reason(p_reason) first; app.require_reason refuses a missing or short
   reason and raises `reason_required`, which src/lib/errors.ts renders as
   «سبب التغيير ناقص أو قصير جداً. اكتب في خانة «سبب التغيير» جملة توضّح لماذا تقوم بهذا التغيير، ثم أعد الحفظ.»
```

### 32.8 What the map does NOT contain (absent from the code today)

These are named in flags, docs or comments but have **no table, no route and no module** in this repository:
reservations (`reservations`), visits (`visits`), contracts (`contracts`), instalment collection
(`installments`), the customer space (`zitounti`), the yearly subscription (`subscriptions`), the agricultural
Back Office (`agri_backoffice`), the harvest (`harvest`), and matching as a public feature (`matching` — the
RPC `match_requests_for_parcel` exists and is called from the Back Office lot page, but the flag is
`disabled` and nothing public reads it). `src/app/admin/(panel)/projects/stock.ts` states the consequence in
its own words: `«المحجوزة»` is only what staff marked on the lots themselves, "Reservations, visits, contracts
and payments have no tables yet".

### OBSERVATIONS (section 32)

- **The offer form and the calculator form are two separate intakes writing to one table.** Both land in
  `public.interest_requests`; only `request_kind` tells them apart, and the CRM view that should surface it
  has not been rebuilt (see the `supabase/pending/` note in 1.8). `offer-snapshot.ts` compensates in
  TypeScript.
- **Three different quote RPCs serve three surfaces.** `public_tree_quote` (`/start`),
  `public_project_quote` (offer and parcel pages), `public_parcel_offer` (legacy, non-tree-priced parcels),
  plus `staff_tree_quote`, `staff_project_quote` and `staff_parcel_offer` for the Back Office. They share
  `app.tree_price`, `app.parcel_price` and `app.financed_quote` underneath, but each has its own TypeScript
  normaliser (`toTreeQuote`, `toProjectQuote`, the `ParcelOffer` type in `src/lib/projects.ts`).
- **Failure modes are deliberately silent on the public side.** `getProjectQuote`, `getSpacingClasses`,
  `getStaffParcelPrices` and `liveOffers` all `console.error` and return `null` / `[]` / an empty `Map`, so a
  missing migration or a broken RPC degrades the page instead of breaking it. The consequence is that a
  missing price and a failed query look identical to a reader of the page.
- **Several core functions are redefined by later migrations, so only the last definition is live.** Any
  reading must start from the highest-numbered file that defines the function:

  | Function / view | Times defined | Last defined in |
  |---|---|---|
  | `public.submit_interest_request` | 7 | `0032_intake_pricing.sql` |
  | `public.crm_search_requests` | 6 | `0032_intake_pricing.sql` |
  | `public.crm_demand_stats` | 5 | `0032_intake_pricing.sql` |
  | `public.crm_requests` (view) | 5 | `0032_intake_pricing.sql` |
  | `public.public_projects` / `public.public_parcels` | 3 each | `0035_projects_tree.sql` |
  | `app.tree_price` | 2 | `0045_annual_fee.sql` |
  | `app.parcel_price` | 2 | `0045_annual_fee.sql` |
  | `app.project_quote_payload` | 2 | `0048_offer_annual_fee.sql` |
  | `app.financed_quote` | 2 | `0036_markup_on_remaining.sql` |
  | `public.public_tree_quote` | 2 | `0045_annual_fee.sql` |
  | `public.million_progress` | 2 | `0025_million_counter_split.sql` |
  | `public.public_coverage` | 2 | `0035_projects_tree.sql` |

- **`public.crm_requests` is `select r.*` recreated five times**, and a Postgres view freezes its column list
  at creation time — which is exactly the stale-view problem the pending migration documents. The last four
  CRM objects in the table above all stop at `0032`, while `interest_requests` gained columns in `0049`.
