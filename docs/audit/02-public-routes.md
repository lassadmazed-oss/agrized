## 2. PUBLIC ROUTES

Scope: every route under `src/app/(public)/` plus the root layout `src/app/layout.tsx`, the global error
boundary `src/app/global-error.tsx`, and the shared shell components and libraries those routes call.
Everything below is read from the code as committed; where a document and the code disagree, the code is
reported and the disagreement is named.

**Working-tree caveat.** The task warned that another process is editing files under `src/app/(public)/`.
Every file listed in this section was read end to end and each one was syntactically complete (balanced
braces, closing tags, a default export where a route requires one). No file was found mid-edit. Files under
`supabase/`, `src/lib/`, `src/components/` and `src/app/admin/` were stated to be stable and were read as such.

---

### 2.1 Route inventory

| Route | File | Public? | Rendering | Gate (feature flag) |
|---|---|---|---|---|
| `/` | `src/app/(public)/page.tsx` | public | prerendered, `export const revalidate = 60` | none for the page; sections gated by `public_statistics`, `interest_form`, `projects`, `pricing`, `land_offers` |
| `/start` | `src/app/(public)/start/page.tsx` | public | dynamic (reads staff session via `moduleAccess`) | `interest_form` |
| `/register` | `src/app/(public)/register/page.tsx` | public | dynamic (reads staff session via `moduleAccess`) | `interest_form` |
| `/projects` | `src/app/(public)/projects/page.tsx` | public | `export const dynamic = "force-dynamic"` | `projects` |
| `/projects/map` | `src/app/(public)/projects/map/page.tsx` | public | `export const dynamic = "force-dynamic"` | `projects` |
| `/projects/[code]` | `src/app/(public)/projects/[code]/page.tsx` | public | `export const dynamic = "force-dynamic"` | `projects` |
| `/projects/[code]/[parcel]` | `src/app/(public)/projects/[code]/[parcel]/page.tsx` | public | `export const dynamic = "force-dynamic"` | `projects` |
| `/land` | `src/app/(public)/land/page.tsx` | public | `export const dynamic = "force-dynamic"` | `land_offers` |
| `/simulator` | `src/app/(public)/simulator/page.tsx` | public | server component that only calls `redirect("/start")` | none |
| `/zitounti` | — **no file exists** | — | — | linked from `SiteHeader` when flag `zitounti` is `public` |

Server Actions reachable from these routes: `src/app/(public)/start/actions.ts` (`quoteStart`),
`src/app/(public)/register/actions.ts` (`submitInterest`), `src/app/(public)/projects/[code]/offer-actions.ts`
(`submitOfferInterest`), `src/app/(public)/land/actions.ts` (`submitLandOffer`, `finalizeLandOfferFiles`).

There is **no** `not-found.tsx`, `loading.tsx`, `sitemap.ts`, `robots.ts` or `opengraph-image` anywhere under
`src/app`. `notFound()` therefore renders the App Router's built-in 404 (LTR, English, unstyled by this
project). `src/proxy.ts` matches `/admin/:path*` only, so no middleware runs on any public route.

---

### 2.2 The shell

#### 2.2.1 Root layout — `src/app/layout.tsx`

* **`generateMetadata()`** calls `getPublicConfig().catch(() => null)`; on failure every value falls back to the
  hard-coded default, so a configuration outage cannot take the Back Office down with the site.
  * `title.default` = `site.meta_title`, default `"AgriZed · زيتونتك هي مشروعك"`; `title.template` = `"%s · AgriZed"`.
  * `description` = `site.meta_description`, default
    `"أصل حيّ على قدّ إمكانياتك: زيتونة مرتبطة بأرض، تكبر وتثمر مع الوقت، وAgriZed تتلهى بالمتابعة."`.
  * `applicationName: "AgriZed"`; `openGraph`: `type: "website"`, `locale: "ar_TN"`, `siteName: "AgriZed"`.
* **`viewport`**: `themeColor: "#1f4a2c"`, `width: "device-width"`, `initialScale: 1`.
* **`RootLayout`** renders `<html lang="ar" dir="rtl">` with two `next/font/google` families —
  `IBM_Plex_Sans_Arabic` (`--font-plex-arabic`, weights 400/500/600/700, subsets `arabic`+`latin`) and
  `Markazi_Text` (`--font-markazi`) — and `<body className="min-h-dvh bg-paper font-sans text-ink antialiased">`.
* Favicon: `src/app/icon.svg` (a green rounded square, gold sun, olive leaves). `public/favicon.ico` and
  `scripts/make-favicon.mjs` exist in the working tree but are untracked.

#### 2.2.2 Global error boundary — `src/app/global-error.tsx`

Client component. Renders its own `<html lang="ar" dir="rtl">` with inline styles (no Tailwind, because the app
shell has crashed). Copy: heading `صارت مشكلة في الموقع`, body
`الصفحة ما كمّلتش كيما لازم. جرّب مرّة أخرى، وكان عاودت ابعثلنا رمز المشكلة اللي تحت.`, the digest as
`رمز المشكلة: <digest>` when present, a `جرّب مرّة أخرى` button calling `reset()`, and a plain `<a href="/">`
`العودة للصفحة الرئيسية` (a full page load on purpose). `console.error("global error", error)` in an effect.

#### 2.2.3 Public layout — `src/app/(public)/layout.tsx`

Async server component. One call to `getPublicConfig()`, then:

| Piece | Source |
|---|---|
| `interestOpen` | `flagState(config, "interest_form") === "public"` |
| `<SourceCapture />` | always rendered |
| `<SiteHeader tagline={brand.tagline_ar} showInterestCta={interestOpen} showProjects={flagState("projects")==="public"} showZitounti={flagState("zitounti")==="public"} />` | |
| `<main className="flex-1">{children}</main>` | |
| `<SiteFooter legalNotice={legal.no_guarantee_notice} taglineFr={brand.tagline_fr} phone={site.contact_phone} whatsapp={site.contact_whatsapp} email={site.contact_email} credits={mediaCredits(config)} />` | |
| `<StickyCta {...primaryCta(config)} note={site.final_cta_note} />` | only when `interestOpen` |

Note that the layout uses **`flagState`, not `moduleAccess`**: signed-in staff previewing an `internal` module
do *not* get the header CTA, the projects link or the sticky bar.

#### 2.2.4 Public error boundary — `src/app/(public)/error.tsx`

Client component wrapping every public page. Heading `صارت مشكلة في هذه الصفحة`; body
`ما كمّلتش كيما لازم. جرّب مرّة أخرى، واختياراتك تقعد كيما هي. كان عاودت، اتصل بينا ونحلّوها.`; the digest as
`رمز المشكلة:`; a `جرّب مرّة أخرى` button (`reset()`) and a `Link href="/"` `العودة للصفحة الرئيسية`.
Logs `console.error("public page error", error)`.

#### 2.2.5 `SiteHeader` — `src/components/site/site-header.tsx`

Async server component; calls `getPublicConfig()` again (second read of the cached config in the same request).

* `primaryCta(config)` (exported and reused by `/` and `StickyCta`): `label = site.cta_primary_label`
  (default `سجّل اهتمامك`), `href = site.cta_primary_target === "register" ? "/register" : "/start"`.
* Links, in order: `/#million` → `وين وصلنا`; `/#how` → `كيفاش تخدم`; `/projects` → `settingText("offers.title", "المشاريع")`
  (only when `showProjects`); `/zitounti` → `زيتونتي` (only when `showZitounti`).
* Layout: `sticky top-0 z-30`, wordmark + `brand.tagline_ar` (from `xl` up), centred nav from `md` up, the CTA
  button from `md` up, and below `md` a second `<nav>` of horizontally scrolling chips with the same links.

#### 2.2.6 `SiteFooter` — `src/components/site/site-footer.tsx`

Wordmark, `brand.tagline_fr` (LTR), `legal.no_guarantee_notice`. Contact block `تواصل معنا` shows only the
values that exist: `tel:<phone>` (displayed through `formatPhone`), `https://wa.me/<digits>`, `mailto:<email>`.
Photo credits render inside a `<details>` labelled `مصادر الصور` (from `mediaCredits`, i.e. every `site_media`
row with a `credit_text`). Bottom strip: `© AgriZed` and `Link href="/admin/login"` labelled `دخول الفريق`.

#### 2.2.7 `StickyCta` — `src/components/site/sticky-cta.tsx`

Client component using `usePathname()`. Returns `null` when the label is empty or the path matches any of
`OWN_ACTION`: `^/start/?$`, `^/register/?$`, `^/land/?$`, `^/projects/(?!map(?:/|$))[^/]+/?$`,
`^/projects/[^/]+/[^/]+/?$`. Otherwise it renders a `h-28 md:hidden` spacer plus a fixed bottom bar
(`md:hidden`, `z-40`) with the primary CTA link and `site.final_cta_note` under it. Both nodes carry
`data-sticky-cta=""`.

#### 2.2.8 `SourceCapture` / `readVisitSource` — `src/components/site/source-capture.tsx`

Client. On mount, if `sessionStorage["agrized:source"]` is empty it writes
`{ landing_path, utm_source?, utm_medium?, utm_campaign?, utm_content?, ref?, referrer? }` — UTM values sliced
to 150 chars, `document.referrer` to 300 chars and only when it is cross-origin. Every read/write is inside
`try/catch`. `readVisitSource()` is called by all three intake forms and passed to the database as `source`.

---

### 2.3 Shared machinery all public pages depend on

#### 2.3.1 `getPublicConfig()` — `src/lib/config.ts`

One `unstable_cache` entry keyed `"public-config-v6"`, tag `PUBLIC_CONFIG_TAG = "public-config"`,
`revalidate: 300`, wrapped in `withRetry` (3 attempts, 800 ms × attempt back-off). It reads, through the
anonymous client `createPublicClient()` (`src/lib/supabase/public.ts`, no cookies):

| Table | Columns / filter |
|---|---|
| `public.settings` | `key, value` where `is_public = true` |
| `public.feature_flags` | `key, state` |
| `public.governorates` | `id, name_ar, name_fr` where `is_active`, ordered by `sort_order` |
| `public.delegations` | `id, governorate_id, name_ar, name_fr` where `is_active` |
| `public.project_types` | `id, code, label_ar, description_ar, image_url, image_alt_ar` where `is_active` |
| `public.ownership_scenarios` | `id, code, label_ar, label_fr, description_ar, description_fr, project_type_id, plantation_system, production_status, is_any, icon_code, image_url, image_alt_ar, image_alt_fr` where `is_active` |
| `public.option_items` | `id, list_key, code, label_ar, label_fr, min_millimes, max_millimes, min_number, max_number, time_from, time_to` where `is_active` |
| `public.site_media` | `slot, url, alt_ar, aspect, credit_text, credit_url` |

Accessors: `settingText`, `settingBool`, `settingInt`, `settingJson`, `optionsFor(listKey)`, `mediaFor(slot)`,
`mediaCredits()`, `flagState(key)` (defaults to `"disabled"` for an unknown key).

#### 2.3.2 Module gating — `src/lib/modules.ts`

```
moduleAccess(config, key) -> "open" | "preview" | "closed"
  "public"   -> open
  "internal" -> preview when getStaffSession() returns a staff row, else closed
  anything else -> closed
```

`publicMode(access)` (in `src/lib/public-projects.ts`) maps `preview → "preview"` and everything else to
`"anon"`. In `"anon"` mode the RPC result is shared through `unstable_cache` (`"public-projects-v1"`, tag
`PUBLIC_PROJECTS_TAG = "public-projects"`, `revalidate: 60`); in `"preview"` mode the request-scoped cookie
client (`src/lib/supabase/server.ts`) is used and nothing is cached, so a staff-only row can never reach the
shared cache.

The same three-state gate exists in SQL: `app.flag_state(key)` and `app.module_open(key)` (migration 0020),
where `internal` resolves through `app.is_staff()`.

#### 2.3.3 Database surface used by public routes

| RPC | Defined / last redefined | Called from |
|---|---|---|
| `public.public_projects()` | 0020 → 0023 → **0035** | `/`, `/projects`, `/projects/[code]`, `/projects/[code]/[parcel]`, `/register` |
| `public.public_parcels()` | 0020 → 0022 → **0035** | `/`, `/projects`, `/projects/[code]`, `/projects/[code]/[parcel]` |
| `public.public_coverage()` | 0020 → **0035** | `/projects/map` |
| `public.public_project_page(p_code text)` | **0023** | `/projects/[code]` |
| `public.public_parcel_offer(uuid, uuid, uuid)` | **0020** | `/projects/[code]/[parcel]` (legacy parcels only) |
| `public.public_project_quote(uuid, uuid, int, text, uuid, uuid)` | **0034** | `/projects/[code]`, `/projects/[code]/[parcel]` |
| `public.public_tree_quote(uuid, int, text, uuid, uuid)` | 0031 → **0045** | `/start` (Server Action), `/register` |
| `public.million_progress()` | 0016 → **0025** | `/` |
| `public.submit_interest_request(jsonb)` | 0003 → 0009 → 0011 → 0016 → 0019 → 0030 → **0032** | `/register` |
| `public.submit_offer_request(jsonb)` | **0049** | `/projects/[code]` |
| `public.submit_land_offer(jsonb)` | **0003** | `/land` |

Grants: the read RPCs are `revoke … from public; grant … to anon, authenticated`. The three `submit_*`
functions are **service-role only** (`grant execute … to service_role`), which is why every intake Server
Action builds `createAdminClient(auditHeaders(headers))`.

Visibility predicates (0020, `app` schema, revoked from `anon`/`authenticated`):

* `app.project_visible(status)` = `app.module_open('projects')` **and** (`status = any app.project_public_statuses()`
  — `published`, plus `sold_out` and `operating` when setting `projects.list_closed` is true — **or**
  `status = 'internal'` and `app.is_staff()`).
* `app.parcel_offered(projectStatus, parcelStatus)` = project is `published` **and** parcel status is in
  `app.parcel_offer_statuses()` (`available`, plus `interested` when `projects.offer_includes_interested`).
* `app.parcel_visible_status(status)` = not `withdrawn` **and** (offered status **or** setting
  `projects.show_taken_parcels`, default true).
* `public_parcels()` is capped by `limit greatest(20, least(1000, app.setting_int('projects.listing_limit', 300)))`.

#### 2.3.4 Shared TypeScript vocabulary (`src/lib/projects.ts`)

* `PARCEL_STATUS_LABELS`: `available` → `متاحة`, `interested` → `مهتم بها`, `reserved` → `محجوزة`,
  `contracting` → `في طور التعاقد`, `sold` → `متعاقد عليها`, `owned` → `مملوكة`, `withdrawn` → `موقوفة`.
* `PROJECT_STATUS_LABELS`: `draft` → `مسودة`, `preparing` → `قيد التحضير`, `internal` → `جاهز (داخلي)`,
  `published` → `منشور`, `sold_out` → `مكتمل البيع`, `operating` → `في طور الاستغلال`, `archived` → `مؤرشف`.
* `OFFER_TYPE_LABELS` (the `/projects` type filter and the `ParcelCard` eyebrow): `productive` → `زيتون منتج`,
  `new_planting` → `غراسة جديدة`, `intensive` → `زيتون مكثّف`, `bare_land` → `أرض بيضاء`; derived by
  `offerTypeOf(parcel)` from `property_type`, `plantation_system`, `production_status`.
* `PROPERTY_TYPE_LABELS`: `bare_land` → `أرض بيضاء`, `planted` → `زيتون موجود`.
* `durationLabel(months)` → `«N سنوات»` when divisible by 12, else `«N شهراً»`.
* `IRRIGATION_LABELS` (`src/lib/land.ts`): `rainfed` → `بعلية`, `irrigated` → `مروية`.
* Formatting (`src/lib/format.ts`): `formatMillimes` prints `en-US` grouping + `د.ت` (3 decimals only when
  `withMillimes`), `formatArea` → `«35 م²»`, `formatSpacing` → `«7 × 5 م»`, dates use `Africa/Tunis`.

---

### 2.4 `/` — Home

* **Route**: `/` · **File**: `src/app/(public)/page.tsx` · **Component**: `HomePage`
* **Public/private**: public, prerendered. `export const revalidate = 60`.
* **Purpose**: present the two ways in — the estimate calculator and the real offers — plus the live counter,
  the tree question, how it works, the unit, the services, the coverage, the landowner invitation and the FAQ.
* **How reached**: the site root; the wordmark in the header; `العودة للصفحة الرئيسية` on both error boundaries,
  the `/register` success screen and the `/land` success screen.

**Data loaded**

| Call | Condition |
|---|---|
| `getPublicConfig()` | always |
| `getMillionProgress()` → `public.million_progress()` | only when `flagState("public_statistics") === "public"` |
| `liveOffers()` → `getPublicProjects("anon")` + `getPublicParcels("anon")` in `Promise.all` | only when `offersOpen` (`flagState("projects") === "public"`) |
| `getSpacingClasses()` → `public.tree_spacing_classes` (cached, `"spacing-classes-v1"`) | only when `site.unit_title` is non-empty |

`liveOffers()` is wrapped in `try/catch`: a failing RPC logs and returns `{ offers: [], parcels: [] }` so the
page still renders. It keeps only projects where `offered === true` **and** `(tree_count ?? 0) > 0`.
Both RPC calls go through the **anon** cache path explicitly, because the page is prerendered for everyone and
must never read the staff session (`§54` is quoted in the file).

**Settings read**: `site.hero_eyebrow`, `site.home_headline`, `site.home_subheadline`, `site.free_interest_notice`,
`site.how_it_works` (JSON `{title,text}[]`), `site.faq` (JSON `{q,a}[]`), `site.facts` (JSON `{value,label}[]`),
`site.unit_title`, `site.unit_text`, `site.unit_cta`, `site.unit_note`, `site.services_title`, `site.services_text`,
`site.services_note`, `site.coverage_title`, `site.coverage_text`, `site.land_section_text`, `site.start_text`,
`site.cta_offers_label` (default `شوف العروض`), `site.cta_secondary_label` (default `اكتشف كيفاش تخدم AgriZed`),
`site.final_cta_title` (default `ابدا أصلك اليوم، على قدّ إمكانياتك`), `site.final_cta_note`, `site.closing_title`
(falling back to `site.vision_title`), `site.vision_text`, `brand.tagline_fr`, `site.trees_question`,
`site.trees_subtitle`, `site.trees_other_card_label`, `site.trees_other_link`, `start.tier_taglines` (JSON),
`start.estimate_note`, `start.trees_unit`, `start.row_area_per_tree`, `start.row_price_per_tree`,
`start.from_prefix`, `offers.title` (falling back to `projects.title`), `projects.intro`, `projects.price_pending`,
`projects.empty_text`, `legal.parcel_card_note`. Option lists: `tree_count`, `agrized_service`.

**Sections, in DOM order**

1. **Hero** — `SitePhoto slot="home.hero"` (`fill`, `priority`, `sizes="100vw"`) under a
   `from-forest-700/80 via-forest-700/45 to-forest-700/15` gradient. Eyebrow pill (`site.hero_eyebrow`), `<h1>`
   (`site.home_headline`), subheadline, then `site.free_interest_notice`. No buttons — they are the doors below.
2. **The two doors** (`HomePath`, `src/components/site/home-paths.tsx`), lifted `-mt-14` over the photo.
   * `variant="estimate"` on `.card .card-estimate` (dashed, no elevation): title = `site.unit_cta` (default
     `احسب مشروعك`) or the primary CTA label; text `site.start_text`; button = the primary CTA label **only when
     `interest_form` is public**, href `primaryCta(config).href`; note `start.estimate_note`. When `offersOpen`
     is false and `site.cta_secondary_label` exists, an extra link to `/#how` is rendered as a child.
   * `variant="stock"` on `.panel` (elevated) — rendered only when `offersOpen`: title `offers.title`, text
     `projects.intro`, gold button `site.cta_offers_label` → `/projects`, children = one pill per distinct
     governorate that actually has a live offer (`[...new Set(offers.map(place))]`).
   * With `offersOpen` false the grid collapses to a single `max-w-3xl` column.
   * Under the doors: the `site.facts` strip (2 columns on phone, a wrapping row from `sm`).
3. **`#offers`** — rendered only when `offersOpen`. Heading = `offers.title`; the `شوف العروض` button appears
   only when `offers.length > HOME_OFFERS` (`HOME_OFFERS = 3`). Cards are the catalogue's own `OfferCard`, fed
   `offerStock(offer, parcels)` and `areaPerTree(offer)` **imported from `./projects/page`**, `projectHref(code)`,
   the governorate name, and `treePrice(offer)` = `pricingOpen && offer.offered && offer.on_tree_pricing ?
   offer.min_price_per_tree_millimes : null` where `pricingOpen = flagState("pricing") === "public"`.
   Labels: `available` = `` `${start.trees_unit} ${PARCEL_STATUS_LABELS.available}` `` (i.e. `زيتونة متاحة`),
   `held` = `محجوزة`, `sold` = `متعاقد عليها`, `areaPerTree`, `pricePerTree`, `from`, `pricePending`.
   `legal.parcel_card_note` is printed under the grid.
   * **Empty state**: `EmptyState` with `projects.empty_text` (default
     `ما فماش قطع متاحة بهذه المعايير توّا. سجّل مطلبك ونعلموك أول ما تتوفر قطعة تشبه اللي تحب.`) and, when the
     interest form is public, the primary CTA button.
4. **`#million`** — `MillionCounter` when `progress` is non-null (see 2.4.1).
5. **`#start`** — `MillionStart`, only when `interestOpen && optionsFor("tree_count").length > 0`. Each tier card
   links to `/start?trees=<option.id>`; the `عدد آخر` card links to `/start#custom`.
6. **How it works / the unit** — rendered when `site.how_it_works` is non-empty **or** (`site.unit_title` and at
   least one spacing class). `#how` heading is the **hard-coded** `كيفاش تخدم AgriZed؟`; steps are numbered
   `01`, `02`, … as a decorative background glyph; four steps take four columns, any other count three.
   `#unit` lists every active `tree_spacing_classes` row as `label_ar` / `formatArea(area_m2)` /
   `formatSpacing(row_spacing_m, tree_spacing_m)`, then `site.unit_cta` → `/start` (only when `interestOpen`),
   `site.unit_note`, and `SitePhoto slot="home.journey"`.
7. **`#services` / `#where`** — services render only when `site.services_title` is set, and then list the
   `agrized_service` option items as pills; coverage lists **every** active governorate as a pill.
8. **Landowner band** — only when `flagState("land_offers") === "public"`. Hard-coded `<h2>`
   `عندك أرض أو ضيعة زيتون؟`, `site.land_section_text`, hard-coded button `ابعث معلومات عقارك` → `/land`,
   `SitePhoto slot="home.land"`.
9. **FAQ + final CTA** — rendered when `site.faq` is non-empty or `interestOpen`. FAQ items are native
   `<details>/<summary>` with a `+` that rotates on open; the heading is the hard-coded `أسئلة شائعة`. The final
   card repeats the primary CTA, adds `شوف العروض` → `/projects` when `offersOpen`, and prints `site.final_cta_note`.
10. **Closing band** — `SitePhoto slot="home.closing"` with a brightness filter and a `forest-700/45` scrim,
    the `Wordmark onDark`, `site.closing_title` (fallback `site.vision_title`), `site.vision_text`, `brand.tagline_fr`.

**Calculations on this page**: none of its own. `offerStock` and `areaPerTree` are imported from
`src/app/(public)/projects/page.tsx` (see 2.6). The price is the figure the database published.

**Conditions summary**: `public_statistics` public → counter; `interest_form` public → estimate button, tree
question, final CTA, unit CTA and the empty-state button; `projects` public → stock door, `#offers`, the
`/projects` links; `pricing` public → a price on the offer cards; `land_offers` public → the landowner band.

#### 2.4.1 `MillionCounter` — `src/components/site/million-counter.tsx`

Copy comes from `millionCounterCopy(config)`: `site.progress_title` (default `وين وصلنا؟`), `site.progress_note`,
`million.people_lead` (default `{people} بدات تبني أصل زيتوني مع AgriZed`), `million.people_bands` (JSON
`[{min,text}]`, seeded `أوّل المشاركين` / `عشرات الأشخاص` / `مئات الأشخاص` / `آلاف الأشخاص`),
`million.people_encourage`, `million.goal_label` (`الهدف: {goal} زيتونة`), `million.bar_caption`
(`{count} زيتونة مطلوبة من {goal} · {share}`), `million.bar_empty`, `million.share_below` (`أقل من {share}`),
and six tile pairs `million.tile_<key>_label` / `_hint` for `requested`, `reserved`, `contracted`, `planted`,
`participants`, `projects`. **An empty label hides its tile**; an empty hint hides the hint line.

Computation in the component:
* `share = goal > 0 ? min(treesRequested / goal, 1) : 0`; `barWidth = treesRequested > 0 ? max(share*100, 0.8) : 0`
  (a real but tiny share still marks the bar).
* `formatShare`: below 0.1 % it prints `أقل من 0.1%`; otherwise one decimal under 10 %, none above.
* The people band is the largest `min` the live `participants` count reaches; with no band the lead line is empty.
* The progress bar renders **only when `goal > 0`** (otherwise its ARIA range would be invalid).
* Stage tiles (`requested`, `reserved`, `contracted`, `planted`) sit in one `.panel` split by hairlines;
  `participants` and `projects` render as a quiet inline list.

`million_progress()` (0025) returns `null` to an API caller while `public_statistics` is closed, and computes:
`goal` = `million.goal` (default 1 000 000); `trees_requested` = `sum(tree_count_min)` over non-duplicate
`interest_requests`; `participants` = `count(distinct person_id)`; `requests` = non-duplicate count;
`projects_under_study` = projects in `draft`/`preparing`/`internal`; `trees_reserved` = trees on `reserved`
parcels; `trees_contracted` = trees on `contracting`/`sold`/`owned` parcels; `trees_planted` = trees on
non-withdrawn parcels of `operating` projects. `getMillionProgress()` caches for 60 s (`"million-progress-v2"`)
and returns `null` on any error.

---

### 2.5 `/start` — the calculator

* **Route**: `/start` · **Files**: `page.tsx` (server), `start-chooser.tsx` (client, 1 160 lines),
  `calculator.ts` (server helpers), `calculator-summary.ts` (pure, shared with `/register`), `copy.ts`,
  `actions.ts` (Server Action).
* **Public/private**: public, gated on `interest_form`. `moduleAccess === "closed"` → `<ComingSoon title={copy.title} />`;
  `"preview"` → `<PreviewBanner />` above the chooser.
* **Purpose**: the only place the tree count, the area per tree, the offer type and the payment plan are asked.
  The answers travel to `/register` in the URL; the page itself writes nothing to the database.
* **Reached from**: `primaryCta` (header, sticky bar, home doors, final CTA) when `site.cta_primary_target` is not
  `register`; `/start?trees=<id>` and `/start#custom` from `MillionStart`; `site.unit_cta` on the home page;
  `بدّل اختياراتك` on `/register` (`/start?<calculatorQuery>`); `/simulator` redirects here; `/register` redirects
  here when no usable tree count is in the URL.
* **Metadata**: `site.start_meta_title` (default `اختيار عدد الزيتونات`), `site.start_meta_description`.

**Data loaded** (`getCalculatorLists`, `src/app/(public)/start/calculator.ts`):

| List | Source |
|---|---|
| `treeCounts` | `optionsFor(config, "tree_count")` |
| `scenarios` | `config.scenarios` (`public.ownership_scenarios`) |
| `spacingClasses` | `getSpacingClasses()` → `public.tree_spacing_classes` where `is_active`, ordered by `sort_order` |
| `downPercents` | `optionsFor(config, "down_payment_percent")` |
| `durations` | `optionsFor(config, "duration")` |
| `customMin` / `customMax` | `million.custom_trees_min` (1) / `million.custom_trees_max` (5000) |

`offersOpen` = `(await moduleAccess(config, "projects")) !== "closed"` — here staff preview **does** count,
unlike the layout.

**URL contract** (`readCalculatorChoices`): `trees` (a `tree_count` option id), `trees_custom` (1–9 digits,
kept only when within `customMin..customMax` and no `trees`), `scenario` (an `ownership_scenarios` id),
`spacing` (a `tree_spacing_classes` id), `payment` (`cash` | `installments`), `down_pct`, `duration`,
`visit=1`. Every id is validated against the current list; unknown or retired values are silently dropped.
A `down_pct` or `duration` without a `payment` implies `installments`.

**Steps** (`StepKey`): `trees` → `spacing` (only when spacing classes exist) → `type` (only when scenarios exist)
→ `payment` → `down` (installments + a non-empty `down_payment_percent` list) → `duration` (installments + a
non-empty `duration` list) → `summary`. An empty Back Office list removes its screen entirely, so it can never
be required. The opening step is computed from the URL: complete answers land straight on `summary`.

**Controls per step**

| Step | Control | Notes |
|---|---|---|
| `trees` | radio cards, one per `tree_count` item (`TreeCardBody` + `OliveMark` sized by `min_number`), plus a free-number card (`id="custom"`, `inputMode="numeric"`, `maxLength=9`, digits normalised by `toWesternDigits`) | picking a tier clears the custom number and auto-advances after `ADVANCE_MS = 220`; a typed number needs the `التالي` button or Enter |
| `spacing` | radio per spacing class showing `label_ar`, `formatSpacing`, `formatArea(area_m2)`, plus a `start.spacing_any` card (`ما نعرفش، اقترحولي`) that sets `spacingId = null` and clears the quote | |
| `type` | radio per ownership scenario; picture from `image_url` or the drawn `GrowthIcon(icon_code)` | optional question (Q-6); `is_any` scenarios exist as a card |
| `payment` | two chips built from `start.payment_cash` (`بالحاضر`) and `start.payment_installments` (`بالتقسيط`) | choosing `installments` adds the next two steps |
| `down` | one chip per `down_payment_percent` item | |
| `duration` | one chip per `duration` item | |
| `summary` | the `.panel` with `سجّل اهتمامك` → `/register?<query>`, plus a `/projects` button when `offersOpen` | |

**Live quote.** A `useEffect` debounced by `QUOTE_DEBOUNCE_MS = 250` calls the Server Action
`quoteStart({ spacingClassId, trees, paymentMode, downPercentOptionId, durationOptionId })`. It runs only when
a spacing class is chosen; `quoteTrees` is the tier's `min_number`, or the typed number, or `null`. A sequence
counter (`quoteSeq`) drops answers that arrive out of order. While a newer quote loads the card dims
(`opacity-60`, `aria-busy`).

`quoteStart` (`actions.ts`) validates with Zod (`spacingClassId` uuid, `trees` int 1..2 147 483 647 or null,
`paymentMode` enum, two nullable uuids) and calls `publicTreeQuote` → `public.public_tree_quote`, using the
**request-scoped** client so staff carry their JWT (a staff member previewing an `internal` `pricing` flag sees
prices; a visitor gets `pricing: "closed"`). Any error returns `null`.

`public_tree_quote` (0045) returns: `spacing_class_id`, `label_ar/label_fr`, `row_spacing_m`, `tree_spacing_m`,
`area_per_tree_m2`, `trees` (null unless `1 ≤ trees ≤ max(million.custom_trees_max, max tree_count.min_number)`),
`total_area_m2`, `pricing` (`closed` | `unavailable` | `ok`), `price_per_tree_millimes`, `total_price_millimes`,
`annual_fee_per_tree_millimes`, `annual_fee_total_millimes`, and an `installments` object
(`status`, `down_payment_percent`, `down_payment_millimes`, `months`, `total_financed_millimes`,
`remaining_millimes`, `monthly_millimes`, `last_installment_millimes`, `installments_count`, `shortened`).
`InstallmentStatus` values: `ok`, `incomplete`, `invalid_choice`, `duration_not_priced`, `down_covers_total`,
`too_many_months`. `toTreeQuote` nulls every money figure unless `pricing === "ok"`.

**The estimate card** (`calculatorSummary`, `calculator-summary.ts`) builds rows in this order and shows only
those whose value exists:

| key | label setting | value |
|---|---|---|
| `trees` | `start.row_trees` | the tier's `label_ar`, or `«N زيتونة»` for a typed number |
| `type` | `start.row_type` | the scenario label |
| `area_per_tree` | `start.row_area_per_tree` | `formatArea(class.area_m2)` (only when spacing classes exist) |
| `total_area` | `start.row_total_area` | `formatArea(quote.total_area_m2)` |
| `price_per_tree` | `start.row_price_per_tree` | `«ابتداءً من» + formatMillimes(...)` |
| `total_price` | `start.row_total_price` | `«ابتداءً من» + formatMillimes(...)` |
| `annual_fee` | `start.row_annual_fee` | the yearly total, with the note `start.annual_fee_per_tree` (`{amount} للزيتونة في العام`) |
| `payment` | `start.row_payment` | `بالحاضر` / `بالتقسيط` |
| `down` | `start.row_down` | `«10% · 1,000 د.ت»` (percentage label + amount) |
| `duration` | `start.row_duration` | the duration label |
| `total_financed` | `start.row_total_financed` | |
| `remaining` | `start.row_remaining` | prefixed by the share of the **cash** total still owed, e.g. `83% · …` |
| `monthly` | `start.row_monthly` | with notes `start.last_installment` (`آخر قسط: {amount}`) and `start.installments_count` (`{count} قسطاً`) when the plan was shortened |

Rules encoded there: an **open-ended tier** (`max_number` null or greater than `min_number`) prefixes its derived
figures with `start.from_prefix`; `price_per_tree` and `total_price` are *always* prefixed with `ابتداءً من`;
`remainingShare = round((cashTotal − down) / cashTotal × 100)`. The notice line is
`start.price_unavailable` when `pricing === "unavailable"`, `start.duration_not_priced` when the plan status is
`duration_not_priced`, `start.down_covers_total` when it is `down_covers_total`.

The card itself is `.card .card-estimate` (warm, dashed, never elevated), stamped across its head with
`start.estimate_note` and an `≈` icon. The leading figure is the monthly instalment when one exists, otherwise
the total price; that row is removed from the list underneath so no amount prints twice. Every listed row that
has a value carries a `تبديل` button jumping back to the step that answers it (`rowStep`: `trees`, `type`,
`area_per_tree`→`spacing`, `payment`, `down`, `duration` — `total_area` deliberately has none); after answering,
`editingRef` returns the visitor straight to the summary.

**Other UI facts**: a `Progress` bar reads `الخطوة N من M`; the `<h1>` takes focus on every step change with
`outline: none` set inline and the window scrolls to the top; a debounced `role="status"` announcement (900 ms)
reads the summary aloud once the visitor reaches it, limited to the `ANNOUNCED` rows; the address bar is kept in
sync with `window.history.replaceState(window.history.state, "", "/start?<query>")` — the existing history state
is preserved on purpose, because replacing it with `null` broke the next `Link` click; `رجوع` appears from step 2;
the bottom bar is sticky on a phone only on the first step; a bilingual second line (`Bi`) is rendered wherever a
`*_fr` setting exists — `/start` is the one page with a French twin.

**Blocking / hints.** `calculatorGap(choices, listSizes)` returns the first missing answer:
`invalid_tree_choice` → `invalid_payment_mode` → `down_payment_percent_required` → `duration_required`
(the last two only when the corresponding list is non-empty). While a gap exists the continue control is a
disabled `<span aria-disabled="true">` and the hint is `start.continue_hint_payment` or
`start.continue_hint_installments`. On the first screen without a tree count, `start.continue_hint`
(`اختر عدد الزيتونات باش تكمّل.`) is printed above the bar.

**After the action**: no submission happens here. `سجّل اهتمامك` is a `Link` to `/register?<calculatorQuery>`;
`calculatorQuery` emits `trees` **or** `trees_custom`, then `scenario`, `spacing`, `payment`, and — only for
instalments — `down_pct` and `duration`, plus `visit=1` when it arrived.

**States**: `ComingSoon` (module closed), preview banner (staff + internal), any of the seven steps, quote
loading (dimmed card), quote unavailable (notice), quote closed (no price rows at all), summary with or without
the offers block. **Errors**: a failed Server Action resolves to `null` and simply leaves the previous figures;
an invalid typed number shows `start.custom_hint` (`اكتب عدداً بين {min} و{max}.`) as an error. **Redirects**: none.

---

### 2.6 `/register` — the request form

* **Route**: `/register` · **Files**: `page.tsx` (server), `register-wizard.tsx` (client, 1 078 lines),
  `actions.ts` (Server Action `submitInterest`).
* **Public/private**: public, gated on `interest_form`. `closed` → `<ComingSoon title="سجّل اهتمامك" />`;
  `preview` → `<PreviewBanner />`.
* **Purpose**: collect identity, where the person wants to invest, their goal, two optional questions, how to
  contact them and their consent — then write one row through `submit_interest_request`.
* **Reached from**: the `سجّل اهتمامك` button on the `/start` summary; `primaryCta` when
  `site.cta_primary_target === "register"`; `interestHref(...)` from a parcel page; the `سجّل مطلبك` button in the
  `/projects` empty state; `CapacitySimulator` (dead code, see 2.11).
* **Metadata**: `site.register_meta_title` (default `سجّل مطلبك`), `site.register_meta_description`.

**Redirect**: if `readCalculatorChoices` yields neither `treeId` nor `treesCustom`, the page calls
`redirect("/start" + forwardedQuery(params))` — every parameter that arrived is forwarded verbatim, including
repeated keys.

**Data loaded**: `getPublicConfig()`; `getCalculatorLists(config)`; `moduleAccess("projects")` and, when not
closed, `getPublicProjects(publicMode(access))` filtered to `offered && on_tree_pricing && (tree_count ?? 0) > 0`
for the success screen; `quoteChoices(lists, choices)` → `publicTreeQuote` (server-side this time), which returns
`null` without a spacing class; `calculatorSummary(summaryInput(...))`.

**Props handed to the wizard**: `governorates`, `goals` (`optionsFor("goal")`), `contactTimes`
(`optionsFor("contact_time")`), `allowInternationalPhone` (`lead.allow_international_phone`),
`notice` (`site.free_interest_notice`), `consentText` (`legal.consent_text`), `initialWantsVisit` (`visit=1`),
`choices`, and a `recap` object: `register.summary_title` (default `اختياراتك في الحاسبة`), the Arabic-only rows,
the notice, `estimateNote` (only when `summary.priced`), `error` = `intakeErrorMessage(gap)` when the calculator
answers are incomplete, `editLabel` = `start.edit_choices` (default `بدّل اختياراتك`), and
`editHref = "/start?" + calculatorQuery(choices, wantsVisit)`. Success copy: `register.success_note`,
`register.success_welcome_title` (`مرحباً بيك، زيتونتك بدات`), `register.success_welcome_text`,
`register.success_motivation`, `register.success_progress_label` (`شوف وين وصل المشروع`),
`register.offers_title` (`عروضنا الحالية`), `register.offers_text`.

**The six steps** (`STEPS`): `بياناتك`, `أين ترغب في الاستثمار؟`, `ما هو هدفك؟`, `الزيارة والتمويل`,
`كيف تحب نتصلوا بيك؟`, `راجع طلبك`.

| Step | Fields | Client validation (`validateStep`) |
|---|---|---|
| 1 | `fullName` (`autoComplete="name"`), `phone` (`type=tel`, LTR, hint `8 أرقام، مثال: 98 123 456`), checkbox `رقم WhatsApp هو نفس رقم الهاتف`, conditional `whatsapp`, optional `email`, `<select>` governorate | name ≥ 3 chars → `اكتب الاسم واللقب كاملين.`; `phoneError()` accepts `^[2-9]\d{7}$` after stripping `+216`/`00216`, or `^(\+|00)[1-9]\d{6,14}$` when `allowInternationalPhone`; email regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`; governorate required |
| 2 | checkbox `المكان غير مهم` (auto-advances) + a chip grid of all governorates (multi-select) | at least one governorate unless `investAnywhere` |
| 3 | radio list of `goal` options | required |
| 4 | `تحب تزور الأرض؟` (`نعم` / `لا، مازال`) and `تحب حل تمويل بنكي؟` (`نعم` / `لا`) | both optional; hint `سؤالين اختياريين: تنجم تعدّي للخطوة الموالية بلا ما تجاوب.` |
| 5 | `طريقة التواصل` radio (`مكالمة هاتفية` / `WhatsApp` / `الاثنين`) and optional `الوقت المفضل` radio incl. `أي وقت` | contact channel required |
| 6 | a review `<dl>` with a `تعديل` button per row jumping to its step, plus the consent checkbox showing `legal.consent_text` | consent required |

**Behaviour**: `advanceWith(patch)` moves on 220 ms (`AUTO_NEXT_MS`) after a single-click answer (goal,
`المكان غير مهم`); a multi-select still waits for `التالي`. `returnStep` sends the visitor back to step 6 after
an edit. `focusFirstError()` focuses `[aria-invalid="true"], [data-error-anchor]` on a failed step. The heading
takes focus and the page scrolls to top on every step change.

**Draft persistence**: `localStorage["agrized:register-draft-v4"]`, falling back once to
`"agrized:register-draft-v3"`; the older keys `"agrized:register-draft"` and `-v3` are removed on load. The draft
is re-validated field by field through `sanitize()` (ids that no longer exist in the Back Office lists are
dropped), `consent` is never stored, `visit=1` in the URL overrides a stored `wantsVisit`, and the draft is
deleted on success. Every access is inside `try/catch`.

**Honeypot**: a visually hidden `Website` input (`clipPath: inset(50%)`, never a negative offset — the file for
the offer form states that a `-10000px` offset widens an RTL document).

**Submission** — `submitInterest` (`"use server"`):

1. Re-reads the flag: `disabled`, or `internal` without a staff session → `التسجيل غير متاح حالياً. حاول لاحقاً.`
2. Zod schema over ~20 fields, including `consent: z.literal(true)`, `website` (honeypot), `source` as a record
   of strings ≤ 300 chars, and a refinement that `treeCountOptionId` and `treeCountCustom` are mutually exclusive.
3. A filled honeypot returns the generic failure message.
4. `calculatorGap(...)` is re-run server-side; a gap returns `{ ok:false, calculator:true }`.
5. `normalizePhone` (libphonenumber-js, default region `TN`) for the phone and, when different, the WhatsApp
   number (always allowed international). Failures map to `invalid_phone` / `phone_not_tunisian` / `invalid_whatsapp`
   and re-open step 1.
6. `createAdminClient(auditHeaders(headers))` (service role) calls `public.submit_interest_request(p jsonb)` with
   `full_name`, `phone_e164`, `whatsapp_e164`, `email`, `residence_governorate_id`, `invest_anywhere`,
   `invest_governorate_ids`, `scenario_ids` (0 or 1), `project_type_unsure`, either `tree_count_option_id` or
   `tree_count_custom`, `spacing_class_id`, `payment_mode`, (only for instalments) `down_payment_percent_option_id`
   and `duration_option_id`, `goal_option_id`, `wants_visit`, `wants_bank_financing`, `contact_channel`,
   `contact_time_option_id`, `consent_text` (`legal.consent_text`), `ip_hash` (`sha256(IP_HASH_SALT:ip)`), `source`.
7. Errors are mapped by `intakeErrorMessage` and routed: the codes in `CALCULATOR_ERRORS`
   (`invalid_tree_choice`, `invalid_tree_custom`, `invalid_spacing`, `invalid_payment_mode`,
   `invalid_down_payment_percent`, `down_payment_percent_required`, `invalid_duration`, `duration_required`,
   `invalid_scenario`, `single_scenario_only`, `scenario_required`, `invalid_project_type`) set
   `calculator: true`, which renders the error with a link back to `/start`; everything else uses `ERROR_STEP`
   to reopen the right step (1 for identity, 2 for location, 3 for goal, 5 for contact, 6 for consent).
   Unknown codes are `console.error`-ed; known ones are not.
8. Success returns `{ ok: true, requestNo }`.

**What `submit_interest_request` (0032) does**: validates name/phone/WhatsApp/e-mail/consent, the residence
governorate and optional delegation, the invest governorates, the ownership scenarios (deriving
`project_type_ids`, `scenario_labels`, `plantation_systems`, `production_statuses`, and `project_type_unsure`
when `is_any`), every option id against its active list, the tree count (option **or** a custom integer within
`million.custom_trees_min..max`), the spacing class, and the payment mode; enforces
`down_payment_percent_required` / `duration_required` when the corresponding list exists; throttles on
`app.check_throttle('interest:ip', …, interval '1 hour', antispam.max_requests_per_ip_per_hour = 10)` and on
`antispam.max_requests_per_phone_per_day = 3`; upserts `public.persons` on `phone_e164` (existing rows are never
overwritten from the public form — only `last_request_at` and `consent_at`); optionally round-robin-assigns a
`commercial` when `crm.auto_assign_mode = 'round_robin'`; recomputes the money with `app.tree_price` +
`app.financed_quote` **only when `app.module_open('pricing')`**, so a stored request never carries a figure the
visitor could not see; mints `request_no` = `request_no.prefix` (`AGZ`) + `-YYYY-` + a 6-digit counter in
`Africa/Tunis`; inserts the full snapshot into `public.interest_requests`; and enqueues a `lead.confirmation`
message with `{name, request_no, trees, total_area_m2, total_price_millimes}`.

**Success screen** (`<Success>`): a check mark, `تم تسجيل مطلبك`, `register.success_welcome_title` and text,
`رقم مطلبك` with the request number in LTR tabular digits and a `نسخ الرقم` button (`navigator.clipboard`,
switching to `تم نسخ الرقم`), a recap `<dl>` restricted to `SUCCESS_ROWS = ["trees","area_per_tree","total_area","payment","total_price"]`,
the line `احتفظ بهذا الرقم. سيتصل بك فريق AgriZed عبر <channel> (<time>) عند دراسة طلبك.`,
`register.success_note`, `register.success_motivation`, then `شوف وين وصل المشروع` → `/#million` and
`العودة للصفحة الرئيسية` → `/`. Finally, when `offers.length > 0 && offersTitle`, a grid of current offers, each
card linking to `projectHref(code)` and showing the cover (`<img>`, not `next/image`), name, governorate,
`عدد الزيتونات`, `مساحة كل زيتونة` and `ابتداءً من <price> للزيتونة` — all formatted on the server.

**Error surfaces**: the calculator-gap banner at the top (`role="alert"`, `bg-danger-soft`) with the
`بدّل اختياراتك` link; the submit error banner with the same link when `calculator` is true; a network failure
yields `تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.`.

---

### 2.7 `/projects` — the catalogue

* **Route**: `/projects` · **File**: `src/app/(public)/projects/page.tsx` · **Component**: `ProjectsPage`
* **Public/private**: public, gated on `projects`; `force-dynamic` because the `internal` state reads the staff
  session cookie. `closed` → `<ComingSoon title={offersTitle(config)} />`; `preview` → `<PreviewBanner />`.
* **Metadata**: title = `offersTitle(config)` = `offers.title` **or** `projects.title` (default
  `المشاريع المتوفّرة`); description = `projects.meta_description`.
* **Reached from**: the header link, the home stock door and `#offers`, the `/start` summary, the `/register`
  success screen, `/projects/map` tiles (with `?gov=`), the `→ كل المشاريع` breadcrumbs on the detail pages.

**Data loaded**: `getPublicProjects(mode)` and `getPublicParcels(mode)` in one `Promise.all`;
`moduleAccess("pricing")` for `pricingOpen`; the filters from `searchParams`.

**Partitioning**: `open` = projects with status `published` or `internal`; `closed` = `sold_out` or `operating`.
Note this reuses the variable name for the array, distinct from the access value.

**`offerStock(project, parcels)`** (exported; used by `/`, `/projects/[code]` and the parcel page):

* `own` = the project's parcels excluding `withdrawn`.
* `counted` = sum of `olive_tree_count` over `own`; `total` = `project.tree_count` when positive, else `counted`.
* When `counted > 0` the split comes from the parcels: `available` = trees on `available` parcels;
  `held` = trees on `interested`/`reserved`/`contracting`; `sold` = trees on `sold`/`owned`; `fromParcels = true`.
* Otherwise the offer is sold whole: `sold = total` when `status === "sold_out"` else 0;
  `available = total − sold` when the status is `published` or `internal`, else 0; `held = 0`.

**`areaPerTree(project)`**: `area_per_tree_min_m2` when present, else `total_area_m2 / tree_count`, else `null`.

**`offerTreePrice(project, pricingOpen)`**: `null` unless `pricingOpen && project.offered && project.on_tree_pricing`;
then `min_price_per_tree_millimes`. The legacy `min_cash_price_millimes` is deliberately not shown on a tree card.

**`longestDuration(config)`** (exported, also used by the detail page): the largest `min_number` in the `duration`
option list, or `null`.

**Page layout**

1. **Header band**: `<h1>` = `offersTitle`, `projects.intro` (with a long Arabic default in the file), and — only
   when `treesAvailable > 0` — a `.panel .stat` showing `formatCount(treesAvailable)` under the label
   `زيتونة متاحة`. `treesAvailable` sums `available` across the `open` projects only.
2. **`projects.open_title`** (default `المشاريع المفتوحة`) — a 1/2/3-column grid of `OfferCard`.
3. **A `bg-surface` band** holding the filter form, the parcel grid (or the empty state) and `LegalNotes`.
4. **`projects.closed_title`** (default `مشاريع مكتملة`) — the same `OfferCard` for closed projects, rendered only
   when that array is non-empty.

**Filters** — a plain `<form method="get" action="/projects">`, so every filter is a URL parameter and there is
no JavaScript:

| Param | Control | Validation (`readFilters`) |
|---|---|---|
| `gov` | `<select>` over active governorates | must be an existing governorate id |
| `del` | `<select>` over the delegations of `gov`; **disabled when no governorate is selected** (placeholder `اختر الولاية أولاً`) | must belong to the chosen governorate |
| `type` | `<select>` over `OFFER_TYPE_LABELS` | must be one of the four keys |
| `price` | `<input type="number" min=1 max=10000000 step=500>` labelled `أقصى سعر حاضر (د.ت)` | finite, `> 0`, `≤ MAX_PRICE_DINARS = 10_000_000` |
| `area` | `<select>` over `optionsFor("desired_area")` | must be an id in that list |
| `trees` | `<select>` over `optionsFor("tree_count")` | must be an id in that list |
| `available` | checkbox `المتوفّر فقط` (`value="1"`) | `=== "1"` |

Buttons: `صفّي` (submit) and `مسح` (a `Link` to `/projects`). Above the grid sit `projects.filters_hint` and a
`شوف الولايات ←` link to `/projects/map`.

**`matches(parcel, filters, config)`**: governorate, delegation, `offerTypeOf(parcel) === filters.type`,
`parcel.offered` when `available`, `cash_price_millimes !== null && ≤ price × 1000`, `inRange(area_m2, …)`
for the area band, and `inRange(olive_tree_count ?? 0, …)` for the tree band **except for `bare_land` parcels,
which are never hidden by a tree count**. `inRange` treats an option with a null `min_number` as "filters nothing".

**Empty state**: when no parcel matches, an `EmptyState` with `projects.empty_text` and a `سجّل مطلبك` button
to `/register` (this link carries no calculator answers, so `/register` immediately redirects to `/start`).

**`LegalNotes`** (exported, reused by the detail page): `legal.parcel_card_note` on a gold-tinted panel and
`legal.no_guarantee_notice` under it.

**`StockCell` / `StockStrip`** are exported here but no longer used by this page: `StockStrip` is used by the
parcel page and `StockCell` by the detail page.

#### 2.7.1 `OfferCard` — `src/components/site/offer-card.tsx`

A `<li>` wrapping one `Link`. Cover = `RemotePhoto(project.cover_url, project.cover_alt_ar, seed=project.id)`
in a fixed `aspect-16/9` frame with a forest scrim (denser when there is no photo), the project status pill when
the status is not `published`, and the project name set over the bottom. Body: `«CODE · governorate»`, up to three
fact pills (`olive_variety`, `PLANTATION_LABELS[plantation_system]`, `PRODUCTION_LABELS[production_status]`), the
available-trees figure (grey rather than forest when it is 0) with its label, the area per tree, pills for `held`
and `sold` **only when non-zero**, and finally either `«سعر الزيتونة · ابتداءً من» + formatMillimes(price)` or —
when the project is still `offered` but unpriced — `projects.price_pending`. A closed offer prints nothing there.

#### 2.7.2 `ParcelCard` — `src/components/site/parcel-card.tsx`

Photo (`RemotePhoto(parcel.photo_url, …)`), the offer-type eyebrow, `القطعة <code>`, the place line, the status
pill, then a `<dl>`: `المساحة` (`formatCount(area_m2) م²`), `عدد الزيتونات` (or `أرض بيضاء`), `مساحة كل زيتونة`
(only when `on_tree_pricing` and an area exists), `نوع الغراسة`, `حالة الإنتاج` — dashes where a value is missing.
Money appears only when `parcel.offered`:
* tree-priced and priced → `السعر للزيتونة`, `السعر الجملي`, `ابتداءً من <down> تسبقة`, `التقسيط حتى <durationLabel(maxMonths)>`;
* tree-priced and unpriced → `projects.price_pending`;
* legacy with a cash price → `السعر حاضر`, the down payment, the duration line;
* legacy without → `projects.price_pending`.

---

### 2.8 `/projects/map` — coverage by governorate

* **Route**: `/projects/map` · **File**: `src/app/(public)/projects/map/page.tsx` · **Component**: `CoveragePage`
* **Public/private**: public, gated on `projects`, `force-dynamic`. `closed` → `ComingSoon` titled
  `projects.map_title`; `preview` → `PreviewBanner`.
* **Metadata**: static `{ title: "وين تلقى قطعتك؟" }` (the on-page heading is `projects.map_title`, so the two can
  drift apart).
* **Reached from**: the `شوف الولايات ←` link in the `/projects` filter form. Nothing else links here, and
  `StickyCta`'s offer pattern explicitly excludes `/projects/map`.
* **Data**: `getCoverage(publicMode(access))` → `public.public_coverage()` (0035), which returns per governorate
  `projects_count` (distinct visible projects), `parcels_total` (non-withdrawn parcels) and `parcels_offered`
  (offered parcels that are priced — by `app.parcel_price(...)->>'pricing' = 'ok'` for tree-priced projects, or
  `cash_price_millimes > 0` otherwise).
* **Display**: a `→ كل المشاريع` link, the `projects.map_title` heading, `projects.map_text`, then two lists:
  * governorates that have rows — a card each, linking to `projectsHref({ gov: String(id) })` i.e.
    `/projects?gov=<id>`, showing `«N مشروع · M قطعة»` and, large, `parcels_offered`;
  * governorates with no row — `projects.map_empty_governorate` above a list of plain pills.
* **Empty states**: each list is skipped when its array is empty. There is no "no coverage at all" message —
  with an empty `public_coverage()` the page renders the heading, the text and the full pill list of every
  governorate.
* **Calculations, forms, errors, redirects**: none. It is a read-only tile list; the file's own comment calls it
  "the accessible source of truth until a real map exists".

---

### 2.9 `/projects/[code]` — one offer

* **Route**: `/projects/[code]` · **File**: `src/app/(public)/projects/[code]/page.tsx` · **Component**: `ProjectPage`
* **Public/private**: public, gated on `projects`, `force-dynamic`. Static metadata `{ title: "مشروع" }` — the
  project's own name is **not** in the page title.
* **Dynamic segment**: `code`, `decodeURIComponent`-ed and matched against `CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/`;
  a mismatch calls `notFound()`. A code that passes the regex but has no visible project also calls `notFound()`.
* **Reached from**: `OfferCard` links on `/` and `/projects`, the `/register` success offers, the
  `→ <project name>` link on a parcel page, and the "similar parcel" CTA of a taken parcel.

**Data loaded**

| Call | Notes |
|---|---|
| `getPublicProjects(mode)`, `getPublicParcels(mode)`, `getProjectPage(code, mode)` | one `Promise.all` |
| `getProjectQuote(project.id, mode, { trees: 1 })` | only when `offerTrees > 0 && project.on_tree_pricing`; returns `null` on any error |

`public_project_page(p_code)` (0023) returns `description_ar`, `water_available`, `water_note`, `access_note`,
`video_url`, `latitude`/`longitude` **only when `projects.show_location` is true on the row**,
`document_option_ids`, `service_option_ids`, and up to `projects.gallery_max` (24) `project_media` rows ordered
`is_cover desc, sort_order, created_at`. It is `null` unless `app.project_visible(status)` and `length(p_code) ≤ 40`.

**Derived values**

* `offerTrees = project.tree_count ?? 0`. The file documents that the count must not depend on a price: an earlier
  version used `project.on_tree_pricing ? tree_count : 0`, which hid the form on every offer.
* `stock = offerStock(project, parcels)`; `perTree = areaPerTree(project)`; `own` = this project's parcels;
  `hasTaken = own.some(p => !p.offered)`; `maxMonths = longestDuration(config)`.
* `selling = status === "published" || status === "internal"`; `interestOpen = flagState("interest_form") === "public"`;
  `formOpen = selling && interestOpen && offerTrees > 0`; `visitOpen = selling && interestOpen`.
* `mapHref` = `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` when both coordinates came back.
* `priceFigure = offerPrice(project, …)`: `null` unless `project.offered`; then `min_price_per_tree_millimes`
  labelled `start.row_price_per_tree`, else `min_cash_price_millimes` labelled `السعر حاضر`; both prefixed with
  `start.from_prefix`. `areaFigure` = `formatArea(total_area_m2)`. `leadFigure = priceFigure ?? areaFigure`, and
  `areaInHero` records whether the area was consumed by the hero so the land group does not repeat it.
* `restStock`: `total` (labelled `start.row_trees`) only when it differs from `available`; `held` and `sold` only
  when greater than zero.
* `documents` / `services` = `chosenLabels(config, "land_document" | "agrized_service", ids)` — the labels of the
  active option items the project picked, in list order.
* `hasLand`, `hasTrees`, `documents.length > 0` decide how many fact groups exist; three groups use a
  3-column grid, fewer use 2.

**Sections, in order**

1. `→ كل المشاريع` link; the code pill (LTR); the status pill when the status is not `published`; `<h1>` the
   project name; `«governorate · delegation»`; `location_description`; the map link labelled
   `projects.location_cta` (default `شوف الموقع على الخريطة`), opened with `target="_blank" rel="noopener noreferrer"`.
2. A `.panel` with two big `Figure`s — the lead figure (price or area, with its `ابتداءً من` prefix on its own
   line) and `formatCount(stock.available)` under `متاحة` — plus the `restStock` row.
3. The cover photo (`RemotePhoto`, first gallery picture or `project.cover_url`).
4. `projects.about_title` (default `على المشروع`) + `description_ar` (`whitespace-pre-line`); the gallery
   (`ProjectGallery`, pictures 2..n, title `projects.gallery_title`); the video (`ProjectVideo`, title
   `projects.video_title`). The whole band renders only when at least one of the three exists.
5. Fact groups: **الأرض** (`projects.facts_land_title`) — total area (unless in the hero), `الماء`
   (`متوفّر`/`غير متوفّر` joined with the note by ` · `), `الري`, `النفاذ`; **الزيتون** (`projects.facts_trees_title`) —
   area per tree (a range `«min – max م²»` when `area_per_tree_max_m2` differs), `الصنف`, `عمر الأشجار`,
   `نظام الغراسة`, `حالة الإنتاج`; **`projects.documents_title`** (default `الوثائق المتوفّرة`) — document pills
   plus `projects.documents_text`.
6. Two anchor buttons when applicable: `offers.submit_label` (default `سجّل اهتمامك بهذا العرض`) → `#offer-form`,
   and `projects.visit_cta` (default `نحب نزور الأرض`) → `#offer-visit`.
7. `OfferInterestForm` (see 2.9.1) when `formOpen`.
8. The parcels band, rendered **only when `own.length > 0`**: `projects.detail_parcels_title`, the
   `projects.taken_hint` line when any parcel is taken, the `ParcelPlan` schematic (`مخطط القطع` — one status-tinted
   square per parcel with its code, an `sr-only` status label and `«N م²»` from `sm` up, each linking to the parcel),
   then a `ParcelCard` grid. `LegalNotes` always closes the band.
9. `projects.payment_title` / `projects.payment_text` (when `selling`); `projects.services_title` /
   `projects.services_text` with service pills; and, when `visitOpen`, the `#offer-visit` card
   (`projects.visit_title`, `projects.visit_text`) whose button jumps back to `#offer-form` rather than to
   `/register`, because `/register` knows nothing about which land the visitor wants to see.

#### 2.9.1 `OfferInterestForm` — `src/app/(public)/projects/[code]/offer-interest-form.tsx`

Client component. Props include `projectId`, `projectName`, `maxTrees` (= `offerTrees`), `figures`
(`pricePerTreeMillimes`, `annualFeePerTreeMillimes`, `areaPerTreeM2` — all from the one-tree
`public_project_quote`, all possibly `null`), the governorate list, `contact_time` options, and the copy keys
`offers.form_title`, `offers.form_intro`, `offers.trees_label` (`قدّاش زيتونة تحب من هذا العرض؟`),
`offers.trees_hint` (`من زيتونة وحدة إلى {max} زيتونة.`), `offers.submit_label`, `offers.success_title`
(`وصلنا طلبك على هذا العرض`), `offers.success_text`, `legal.consent_text`, `start.estimate_note`, the four row
labels and `projects.price_pending`.

* **Tree picker**: quick chips from `QUICK_PICKS = [1, 5, 10, 25, 50]` filtered to `≤ maxTrees`, a
  `الكل (N)` chip when `maxTrees > 1`, and a numeric text field. `trees` is parsed through `toWesternDigits`;
  `valid = trees >= 1 && trees <= maxTrees`.
* **Live figures**: `total = pricePerTree × trees`, `annualTotal = annualFeePerTree × trees`,
  `area = areaPerTree × trees` — multiplication only, justified in the file by
  `v_total := v_per_tree * v_trees` in migration 0034, with the database recomputing on submit. When
  `pricePerTreeMillimes` is null the whole block is replaced by `projects.price_pending`; `start.estimate_note`
  prints only when a price is shown.
* **Fields**: `fullName`, `phone`, `رقم WhatsApp هو نفس رقم الهاتف` checkbox + conditional `whatsapp`, `email`
  (declared in state but **no input is rendered for it**), `governorateId` (`ولاية إقامتك`), contact channel
  radios (`مكالمة` / `WhatsApp` / `الزوز` — note these labels differ from `/register`'s
  `مكالمة هاتفية` / `WhatsApp` / `الاثنين`), optional `الوقت المفضّل للمكالمة (اختياري)` select, the consent
  checkbox, and the hidden honeypot.
* **Client validation**: trees in range (error = the hint with `{max}` filled), name ≥ 3, phone ≥ 8 digits,
  WhatsApp ≥ 8 digits when not the same, governorate, channel, consent.
* **Submission**: `submitOfferInterest` re-checks `moduleAccess("projects") !== "closed"` (staff previewing an
  internal module may still submit), Zod-validates, rejects a filled honeypot, normalises both phone numbers,
  then calls `public.submit_offer_request(p)` through the service-role client with `project_id`, `trees` (as a
  string), identity, `contact_channel`, `contact_time_option_id`, `consent_text`, `ip_hash` and `source`.
* **`submit_offer_request` (0049)**: same identity rules as the calculator intake; requires the project's status
  to be in `app.project_public_statuses()` (so a draft or internal offer refuses even if a form reached it) →
  `offer_not_available`; requires `1 ≤ trees ≤ project.tree_count` → `invalid_offer_trees`; prices the request
  with `app.project_quote_payload(project, null, trees, 'cash', null, null, false)` and stores the snapshot in
  the new columns `request_kind = 'offer'`, `offer_trees`, `offer_price_per_tree_millimes`,
  `offer_total_price_millimes`, `offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes`, while
  also filling the shared CRM columns (`tree_count_code = 'offer'`, `tree_count_label_ar = "<n> زيتونة"`,
  `spacing_class_id`, `area_per_tree_m2`, `total_area_m2`, `price_per_tree_millimes`, `total_price_millimes`,
  `invest_governorate_ids = [project.governorate_id]`, `project_type_unsure = true`); shares the same IP and
  phone throttles as the calculator intake; mints the same `AGZ-YYYY-NNNNNN` number; enqueues the same
  `lead.confirmation` message with `offer` = the project name.
* **After success**: the form is replaced in place (no navigation) by a green panel with `offers.success_title`,
  `offers.success_text`, `رقم مطلبك` + the number, and
  `طلبك على «<project name>» بـ <N> زيتونة.`. **Errors**: a single `role="alert"` banner with the mapped message,
  or `تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.` on a thrown exception.

#### 2.9.2 `ProjectVideo` — `src/components/site/project-video.tsx`

`videoEmbedUrl(url)` accepts only `https:` YouTube (`youtube.com`, `youtu.be`, incl. `/shorts/`, `/embed/`,
`/live/`, id matched by `/^[A-Za-z0-9_-]{6,20}$/`) → `https://www.youtube-nocookie.com/embed/<id>`, and Vimeo
(`vimeo.com`, `player.vimeo.com`, 6–12 digit id) → `https://player.vimeo.com/video/<id>?dnt=1`. Anything else
renders a plain `شوف الفيديو ↗` link. The iframe is `loading="lazy"`, `referrerPolicy="strict-origin-when-cross-origin"`.

---

### 2.10 `/projects/[code]/[parcel]` — one parcel

* **Route**: `/projects/[code]/[parcel]` · **File**: `.../[parcel]/page.tsx` · **Component**: `ParcelPage`
* **Public/private**: public, gated on `projects`, `force-dynamic`. Static metadata `{ title: "قطعة" }`.
  `closed` → `ComingSoon` titled `projects.title` (**not** `offersTitle`, so this one page keeps the older key).
* **Segments**: both `code` and `parcel` are decoded and matched against the same `CODE` regex; a mismatch, an
  unknown project or an unknown parcel calls `notFound()`.
* **Query parameters**: `payment` (`parsePaymentMode`), and — only when `payment === "installments"` —
  `down_pct` and `duration`, each accepted only if it matches `UUID`. For legacy parcels: `down`, `installment`,
  `trees`, `scenario`, same UUID check.

**What changes dynamically.** The parcel page has two mutually exclusive money blocks:

* `parcel.on_tree_pricing === true` → `getProjectQuote(parcel.project_id, mode, { spacingClassId: parcel.spacing_class_id,
  trees: parcel.olive_tree_count, paymentMode, downPercentOptionId, durationOptionId })` →
  `TreeOfferBlock`. The payment mode, the down-payment percentage and the duration are chosen with **links**
  (`Chip` → `<baseHref>?payment=…&down_pct=…&duration=…#offer`, `scroll={false}`), so the page stays fully
  server-rendered and every choice is a new request.
* otherwise → `getParcelOffer(parcel.id, mode, { down, installment })` → `public.public_parcel_offer` → `OfferBlock`.
  `getParcelOffer` retries without the chosen pair when the call with choices fails, so a stale option id falls
  back to the plain offer instead of breaking the page.
* If **both** come back null, `notFound()`.

**Displayed information** (left column): `RemotePhoto(parcel.photo_url, …)`; a card with `القطعة <code>`,
`«project · governorate»`, the status pill, and a `<dl>` of `المساحة`, `نوع العقار`, `نوع الغراسة`,
`عدد الزيتونات` (`—` for bare land), `المساحة لكل زيتونة` (computed as `area_per_tree_m2`, else
`area_m2 / olive_tree_count`, and never for bare land), `عمر الزيتونات`, `حالة الإنتاج`, `الري`. Below it, when
`stock.total > 0`, a `.panel` linking back to the project and showing `StockStrip` — the four-bucket split
(`عدد الزيتونات`, `متاحة`, `محجوزة`, `متعاقد عليها`), zeros included, because on this page every bucket is part
of the answer.

**`TreeOfferBlock`** (`src/components/site/tree-offer-block.tsx`): when `quote.pricing === "not_offered"` it
prints `projects.taken_text`; when the quote is not `ok` it prints the facts (`عدد الزيتونات`,
`مساحة كل زيتونة`, `المساحة الجملية`) and `projects.price_pending` (falling back to `start.price_unavailable`);
otherwise it prints `start.row_price_per_tree` as a 3xl figure, the facts, `start.row_total_price`, then the
`طريقة الدفع` chips (`حاضر` / `بالتقسيط`), and for instalments the `down_payment_percent` and `duration` chips,
followed by `التسبقة` (amount + percent), `start.row_total_financed`, `start.row_remaining` (prefixed by the
share of the **cash** total still owed), `start.row_monthly` (with `«N قسطاً»`) and the
`start.last_installment` line. When the plan status is not `ok`, a `role="status"` panel explains why:
`start.duration_not_priced`, `start.down_covers_total`, `الاختيار هذا ما عادش متوفّر لهذا المشروع. اختر التسبقة والمدة من جديد.`,
`المدة أطول من المسموح. اختر مدة أقصر.`, or the default
`اختر نسبة التسبقة ومدة الدفع باش نحسبولك القسط الشهري.`. Every branch ends with `legal.parcel_card_note` and
`legal.no_guarantee_notice`.

**`OfferBlock`** (legacy path, `src/components/site/offer-block.tsx`): `projects.taken_text` when not offered;
`projects.price_pending` when not priced; otherwise `السعر حاضر`, `التسبقة` (`من <smallest down that produces a
valid plan>`), `القسط` (`من X في الشهر · N شهراً`, or `غير متاح بالقيم الحالية`), `المصاريف السنوية التقديرية`,
then up to three worked examples (`مثال` cards with `عدد الأشهر`, `السعر الجملي`, `آخر قسط`,
`الفارق عن الحاضر`) under `projects.examples_title` and `projects.examples_note`, and the same two legal notes.

**CTAs**

* `canAsk` = `interest_form` is `public` **and** (tree path: `parcel.offered`; legacy path:
  `offer.offered && offer.priced`).
* `canAsk` → `projects.parcel_cta` (default `أنا مهتم بهذه القطعة`) → `interestHref(asked)`, plus
  `projects.visit_cta` → `interestHref({ ...asked, visit: true })`.
* not `canAsk` but the form is open → `projects.taken_cta` (default `سجّل اهتمامك بقطعة مشابهة`) →
  `projectHref(project.code)`, i.e. back to the offer rather than to a bare `/register`.
* Otherwise no CTA at all.
* `asked` for a tree parcel = `{ parcelId, treesCustom: olive_tree_count, spacing: spacing_class_id, payment,
  downPercent, duration }`; for a legacy parcel = `{ parcelId, trees: query.trees ?? offer.suggested_tree_count_option_id,
  scenario: query.scenario ?? offer.suggested_scenario_id }`.
* `interestHref` (`src/lib/public-hrefs.ts`) builds `/register?parcel=…&trees=…&trees_custom=…&scenario=…&spacing=…&payment=…&down_pct=…&duration=…&visit=1`,
  dropping `down_pct`/`duration` unless the mode is instalments.
* On a phone the two CTAs are repeated in a fixed bottom bar (`md:hidden`, `z-40`) preceded by an
  `aria-hidden` `h-24` spacer; `StickyCta` hides the site-wide bar on this route.

---

### 2.11 `/land` — the landowner offer form

* **Route**: `/land` · **Files**: `page.tsx`, `land-offer-form.tsx` (646 lines, client), `actions.ts`.
* **Public/private**: public, gated on `land_offers`, `force-dynamic`. `closed` → `ComingSoon` titled
  `عندك أرض أو ضيعة؟` (hard-coded); `preview` → `PreviewBanner`.
* **Metadata**: hard-coded `{ title: "عندك أرض أو ضيعة؟", description: "ابعث معلومات أرضك أو ضيعة الزيتون إلى AgriZed. كل عرض يُدرس قبل أي قرار." }`.
* **Reached from**: the landowner band on the home page (`ابعث معلومات عقارك`). Nothing in the header or footer
  links to it.
* **Props from settings**: `site.land_section_text` (intro), `legal.land_offer_notice` (notice),
  `legal.consent_text`, `lead.allow_international_phone`, `land_offer.max_files` (default 10),
  `land_offer.max_file_size_mb` (default 10, hard-capped at 20 by `Math.min`). Option lists: `property_type`,
  `tree_age`, `land_document`.

**Form sections and fields**

| Section | Fields |
|---|---|
| `الموقع` | `الولاية` select (required), `المعتمدية` select (disabled until a governorate is chosen, options filtered by it, required), `وصف المكان (اختياري)` textarea (`maxLength 1000`), and a geolocation button `أنا في العقار الآن: حدّد موقعي` using `navigator.geolocation.getCurrentPosition` (`enableHighAccuracy`, 15 s timeout, coordinates rounded to 6 decimals, an `إزالة` button to clear them) |
| `العقار` | `نوع العقار` radios from `property_type`; `المساحة` + a `هكتار`/`م²` unit radio; when the chosen type's `code !== "bare_land"`: `عدد الزيتونات (تقريبي)` and `عمر الأشجار` (with `لا أعرف`); `الري` radios `بعلية`/`مروية`; `مصدر الماء (اختياري)` only when irrigated |
| `السعر المطلوب` | `السعر بالدينار (اختياري)` and a `السعر قابل للتفاوض` checkbox |
| `الوثائق` | checkboxes from `land_document`; a file picker accepting `.pdf,.jpg,.jpeg,.png` with a per-file size cap, a list of chosen files showing the size in MB and a `حذف` button |
| `معلومات الاتصال` | `الاسم واللقب`, `رقم الهاتف`, `صفتك` radios `مالك` / `وكيل` / `وسيط` |
| — | consent checkbox with `legal.consent_text`, the notice, the honeypot, and a sticky-on-phone `أرسل العرض` button |

**Client validation** (`validate()`): governorate, delegation, a positive numeric area (`parseNumber` normalises
Arabic-Indic digits and a comma decimal separator), property type, an integer tree count when given, irrigation,
a non-negative price when given, name ≥ 3, a Tunisian 8-digit phone (or international when allowed), capacity,
consent. Errors are Arabic sentences that say what to do (`اكتب المساحة بالأرقام، مثال: 2.5`, …), and the first
invalid control is focused.

**File rules in the browser**: `ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"]`; anything else,
or a file above `maxFileSizeMb`, is rejected with
`بعض الملفات لم تُضف: الأنواع المقبولة PDF وJPG وPNG، بحجم أقصى N ميغابايت للملف.`; the list is truncated to
`maxFiles` with `يمكنك إرفاق N ملفات كحد أقصى.`.

**Submission flow**

1. `submitLandOffer(input)` re-checks the flag (`disabled`, or `internal` without a staff session →
   `إرسال العروض غير متاح حالياً. حاول لاحقاً.`), Zod-validates (including `latitude ∈ [-90,90]`,
   `longitude ∈ [-180,180]`, `areaValue ≤ 10_000_000`, `askingPriceDinars ≤ 10_000_000_000`, up to 30 document
   ids, up to 50 file descriptors), rejects a filled honeypot, re-applies the file count and size limits from
   settings, and normalises the phone.
2. It calls `public.submit_land_offer(p)` through the service-role client, converting the price with
   `Math.round(dinars × 1000)` and blanking `water_source` unless irrigated.
3. For each accepted file it creates a **signed upload URL** at
   `<offer.id>/<randomUUID()>.<pdf|jpg|png>` in the `LAND_OFFER_BUCKET` and returns `{ path, token, index }`;
   a failure to sign is logged and that file is skipped.
4. The browser uploads each file directly with `storage.uploadToSignedUrl(...)`, showing
   `جارٍ رفع الملفات (i من n)…` in the button.
5. `finalizeLandOfferFiles({ offerId, files })` re-lists the bucket folder, accepts only paths under
   `<offerId>/` that really exist, refuses offers older than **two hours**, and upserts `land_offer_files`
   (`onConflict: "storage_path", ignoreDuplicates: true`) with the real `mime_type` and `size_bytes`.

**Success screen**: replaces the form — a check mark, `استلمنا عرضك`, `الرقم المرجعي` + the reference number
(LTR), `عرضك الآن قيد الدراسة ولن يُنشر. سيتصل بك فريق AgriZed بعد المراجعة الأولى.`, a gold warning
`تعذّر رفع N من الملفات. يمكنك تقديمها للفريق عند التواصل معك.` when `files.length − saved > 0`, the notice, and
`العودة للصفحة الرئيسية`. The page also scrolls to the top.

**Errors**: a `role="alert"` banner at the top of the form carrying either the mapped intake message or
`تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.`. Geolocation failures set
`تعذّر تحديد موقعك. اسمح بالوصول للموقع أو اكتب وصف المكان.` or, with no geolocation API,
`المتصفح لا يسمح بتحديد الموقع. اكتب وصف المكان.`.

**Related header**: `next.config.ts` sets `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
precisely for this form.

---

### 2.12 `/simulator` — a redirect

`src/app/(public)/simulator/page.tsx` is seven lines: a server component that calls `redirect("/start")`, with a
comment citing `docs/plan-zitouna.md P6-1` — the capacity simulator asked for a monthly instalment, which tree
pricing no longer uses.

`src/app/(public)/simulator/capacity-simulator.tsx` (141 lines) still exists and is **never imported**. It is the
old `SIM-01..03` component: two chip groups (`التسبقة`, `القسط الشهري`), a per-duration total
(`down + installment × months`) with a bar, the sentence
`هذا مجموع ما يمكنك دفعه، وليس سعر مشروع. أسعار المشاريع تختلف حسب العقار، والتقسيط يُحسب بصيغة خاصة بكل مشروع.`,
and a link to `/register?down=<id>&installment=<id>` — a query shape `/register` no longer reads. The
`simulator_basic` feature flag is still seeded `public` and still listed in `IMPLEMENTED_MODULES`.

---

### 2.13 Cross-cutting facts

**The `/start ⇄ /register` URL contract** is defined once in `calculatorQuery` / `readCalculatorChoices`
(`start/calculator-summary.ts`, `start/calculator.ts`) and produced from the other direction by `interestHref`
(`src/lib/public-hrefs.ts`). Parameters: `trees`, `trees_custom`, `scenario`, `spacing`, `payment`, `down_pct`,
`duration`, `visit`, and — from `interestHref` only — `parcel`.

**Shared gate summary**

| Flag | Public routes it controls | Seeded state |
|---|---|---|
| `interest_form` | `/start`, `/register`, the home CTAs and tree question, the sticky bar, both parcel/offer CTAs | `public` |
| `projects` | `/projects`, `/projects/map`, `/projects/[code]`, `/projects/[code]/[parcel]`, the home stock door and `#offers`, the header link, the `/start` and `/register` offer blocks | `disabled` |
| `pricing` | whether any price appears (in SQL via `app.module_open('pricing')`, and again in TS) | `internal` |
| `public_statistics` | the home counter | `public` |
| `land_offers` | `/land` and the home landowner band | `public` |
| `simulator_basic` | nothing any more | `public` |
| `zitounti` | a header link to a route that does not exist | `disabled` |

**Module-gate components** (`src/components/site/module-gate.tsx`): `ComingSoon` renders `قريباً`, the passed
title, `هذا القسم غير متاح حالياً. سنفتحه قريباً.` and a `العودة للصفحة الرئيسية` button; `PreviewBanner` renders
`معاينة داخلية: هذا القسم غير منشور للعموم، ويراه فريق AgriZed فقط.` as a gold `role="status"` strip.

**Bilingual rendering**: only `/start` renders French (`Bi` in `src/components/site/bilingual.tsx`, fed by the
`*_fr` keys resolved in `start/copy.ts`). `/register` receives Arabic-only strings (`row.label.ar`,
`row.value.ar`) by construction.

**Image handling**: `SitePhoto` (site slots from `site_media`) and `RemotePhoto` (project/parcel pictures) both
fall back to `GrovePlaceholder`, a deterministic SVG grove seeded by the slot key or the row id. `next.config.ts`
allows remote images only from the Supabase host under `/storage/v1/object/public/**`; the two places that use a
raw `<img>` instead of `next/image` are the scenario pictures on `/start` and the offer covers on the `/register`
success screen, both with an ESLint disable comment explaining that the host is not known at build time.

**Security headers** (`next.config.ts`, applied to `/:path*`): `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`,
and `X-Frame-Options: DENY` in production only. `poweredByHeader: false`.
`experimental.serverActions.bodySizeLimit = "6mb"`.

---

## OBSERVATIONS

These are factual remarks about the code as it stands. They are not proposals.

1. **`/zitounti` has no route.** `src/app/(public)/layout.tsx:18` passes
   `showZitounti={flagState(config, "zitounti") === "public"}` and `site-header.tsx:33` then renders
   `<Link href="/zitounti">زيتونتي</Link>`. No file under `src/app` serves that path. The flag is seeded
   `disabled` (0004) and is absent from `IMPLEMENTED_MODULES` (`src/lib/modules-catalog.ts`), so the Back Office
   refuses to publish it; publishing it directly in the database would produce a header link to a 404.

2. **Two different gate readings coexist.** `(public)/layout.tsx`, `/projects/[code]/page.tsx` and
   `/projects/[code]/[parcel]/page.tsx` use `flagState(...) === "public"`, while `/start`, `/register`,
   `/projects`, `/projects/map`, `/land` and the two offer Server Actions use `moduleAccess(...)`. The visible
   consequence: a signed-in staff member previewing an `internal` `interest_form` sees `/start` and `/register`
   with a preview banner, but no header CTA, no sticky bar and no CTA on an offer or parcel page.

3. **The home page never previews.** `liveOffers()` pins the mode to `"anon"` and `offersOpen` reads
   `flagState`, both on purpose (`§54` is cited in the file) because the page is prerendered with
   `revalidate = 60`. Staff can therefore never see an `internal` projects module on `/`.

4. **`public_parcels()` returns a null photo.** Since 0020, through 0022 and 0035, the last three columns are
   literally `null::text, null::text, null::text` for `photo_url`, `photo_alt_ar`, `photo_aspect`. Every
   `ParcelCard` and the parcel page's `RemotePhoto` therefore always render `GrovePlaceholder`. Only projects
   have a real cover (`public_projects()` reads `project_media`).

5. **The `المساحة` filter on `/projects` can never match.** Migration 0032 deactivates the `desired_area` list
   (`update public.option_items set is_active = false where list_key in ('desired_area', 'priority',
   'monthly_installment', 'down_payment', 'budget')`), `getPublicConfig()` loads only active items, so
   `optionsFor(config, "desired_area")` is empty: the `<select>` renders with `الكل` alone and
   `filters.area` is always `null`.

6. **The legacy `OfferBlock` path is effectively unpriced.** `app.parcel_offer_payload` (0020) builds its
   `down_options`, `installment_options`, `plans` and `examples` from the `down_payment` and
   `monthly_installment` option lists, which 0032 also deactivated. A parcel that is not `on_tree_pricing`
   therefore reaches `OfferBlock` with no plan options; the `القسط` row falls back to
   `غير متاح بالقيم الحالية` and the examples section does not render. `supabase/tests/006_public_projects.sql`
   reactivates those lists inside its own rolled-back transaction and says so in a comment.

7. **`interestHref` sends a `parcel` id that nothing reads.** The parcel page builds
   `/register?parcel=<uuid>&…`, but `readCalculatorChoices` never looks at `params.parcel` and
   `submitInterest` never sends a `parcel_id` to `submit_interest_request`, although migration 0020 added
   `interest_requests.parcel_id`. The parcel id travels in the URL and is discarded.

8. **A tree parcel with many trees can bounce out of the flow.** `asked.treesCustom = parcel.olive_tree_count`
   becomes `trees_custom`, which `/register` re-validates against `million.custom_trees_min/max` (1..5000 by
   default). A parcel with more trees than `custom_trees_max` produces a dropped value, no tree count, and the
   immediate `redirect("/start" + forwardedQuery(params))`.

9. **Cross-route module imports.** `src/app/(public)/page.tsx` imports `areaPerTree` and `offerStock` from
   `./projects/page`, and `src/app/(public)/projects/[code]/page.tsx` imports `areaPerTree`, `LegalNotes`,
   `longestDuration`, `offerStock`, `offersTitle` and `StockCell` from `../page`; the parcel page imports
   `offerStock` and `StockStrip` from `../../page`. The exporting module also declares
   `export const dynamic = "force-dynamic"`, which applies to its own segment only, but the home page pulls the
   whole `/projects` page module (and its imports) into its own graph.

10. **Hard-coded user-facing Arabic.** `CLAUDE.md` requires business values and texts to come from
    `settings`. Strings written directly in the components include, on `/`: `كيفاش تخدم AgriZed؟`,
    `أسئلة شائعة`, `عندك أرض أو ضيعة زيتون؟`, `ابعث معلومات عقارك`; on `/projects`: `الولاية`, `المعتمدية`,
    `نوع العرض`, `أقصى سعر حاضر (د.ت)`, `المساحة`, `عدد الزيتونات`, `المتوفّر فقط`, `صفّي`, `مسح`,
    `شوف الولايات`, `سجّل مطلبك`; on `/projects/[code]`: `→ كل المشاريع`, `الماء`, `الري`, `النفاذ`, `الصنف`,
    `عمر الأشجار`, `نظام الغراسة`, `حالة الإنتاج`, `مخطط القطع`; on `/start`: `رجوع`, `التالي`, `تبديل`,
    `الخطوة N من M`, `التقدم في الحاسبة`; on `/register`: all six step titles, every field label, every
    validation message, `أرسل الطلب`, `تم تسجيل مطلبك`, `رقم مطلبك`, `نسخ الرقم`; the whole of `/land`; and the
    header links `وين وصلنا` and `كيفاش تخدم`, the footer's `تواصل معنا` / `مصادر الصور` / `دخول الفريق`.

11. **Two missing settings keys with code fallbacks.** Of the 115 `setting*` keys read by public pages and site
    components, `projects.facts_land_title` and `projects.facts_trees_title` are the only two that are not
    inserted by any migration; both have hard-coded fallbacks (`الأرض`, `الزيتون`), so they render but cannot be
    edited from the Back Office. Every other key, including all 90 read by `start/copy.ts`, exists.

12. **Two contact-channel vocabularies.** `/register` uses `مكالمة هاتفية` / `WhatsApp` / `الاثنين`
    (`register-wizard.tsx`), the offer form uses `مكالمة` / `WhatsApp` / `الزوز`
    (`offer-interest-form.tsx`). Both map to the same `contact_channel` enum values `phone`/`whatsapp`/`both`.

13. **Dead state in the offer form.** `OfferInterestForm`'s `FormState.email` is initialised, validated as part
    of the payload and sent to `submitOfferInterest`, but no `<input>` for it is rendered, so it is always `""`.

14. **Duplicated instalment-summary logic.** The "share of the cash price still owed" is computed twice, in
    `remainingShare` (`start/calculator-summary.ts`) and in `remainingPercent`
    (`src/components/site/tree-offer-block.tsx`), with identical formulas. The `start.duration_not_priced` /
    `start.down_covers_total` messages are likewise resolved in both files.

15. **Page titles on the two dynamic routes are constants.** `/projects/[code]` exports
    `metadata = { title: "مشروع" }` and `/projects/[code]/[parcel]` exports `{ title: "قطعة" }`; neither uses
    `generateMetadata`, so every offer and every parcel shares one browser-tab title and one OG title.
    `/projects/map` has the static title `وين تلقى قطعتك؟` while its `<h1>` is the editable `projects.map_title`.

16. **The `ComingSoon` title on the parcel page uses a different key.** `/projects` and `/projects/[code]` call
    `offersTitle(config)` (`offers.title` → `projects.title`); `/projects/[code]/[parcel]` calls
    `settingText(config, "projects.title", "المشاريع المتوفّرة")` directly, so renaming the section from the
    Back Office leaves that one closed-module page on the old name.

17. **`/projects`' empty-state CTA loses the flow.** The `سجّل مطلبك` button points at a bare `/register`, which
    then redirects to `/start` because no tree count is in the URL. The same is true of the `سجّل مطلبك` label in
    the code — the visitor lands on the calculator, not on the form.

18. **The delegation filter needs a round trip.** The `/projects` filter form is a plain GET form: the
    `المعتمدية` select is `disabled` (`اختر الولاية أولاً`) until `filters.gov` is set from the URL, so the
    visitor must submit the governorate first and then submit again with the delegation.

19. **No 404 page.** `notFound()` is called from `/projects/[code]` and `/projects/[code]/[parcel]`, and there is
    no `not-found.tsx` anywhere under `src/app`. The resulting page is Next's built-in one — LTR, English and
    outside the public shell (no header, no footer, no Arabic).

20. **Two reads of the cached config per request.** `(public)/layout.tsx` calls `getPublicConfig()` and so does
    `SiteHeader` (plus each page). All calls hit the same `unstable_cache` entry, so there is no extra database
    round trip, but the config is resolved several times per render.

21. **README disagreement.** `README.md:48` describes the public tree as
    `"Public site: home, /register (step-by-step form), /simulator, /land"`. In the code `/simulator` is a
    redirect to `/start`, and `/start`, `/projects`, `/projects/map`, `/projects/[code]` and
    `/projects/[code]/[parcel]` are not mentioned at all. The code is the newer state.

22. **`million_progress()` reads for direct sessions.** The 0025 body returns the payload when
    `app.module_open('public_statistics')` **or** when `current_setting('request.jwt.claims', true)` is empty —
    i.e. a direct database session (migration, test, script) always reads it. Through PostgREST with the anon
    key a JWT is always present, so the flag decides; `getMillionProgress()` turns a `null` into a hidden section.

23. **`down_from_millimes` is documented as possibly absent.** `src/lib/public-projects.ts` comments it as
    "null until the listing returns it"; 0035's `public_parcels()` does return it, computed by
    `app.down_payment_from_percent(...)` for tree-priced parcels and `app.parcel_down_from(...)` for legacy ones.

24. **The `interested` status is counted as "held", not "available".** `offerStock`'s
    `HELD_STATUSES = {interested, reserved, contracting}`, while the SQL setting
    `projects.offer_includes_interested` (default false) can make an `interested` parcel count as *offered*. With
    that setting on, a parcel would be sellable in SQL and displayed as `محجوزة` in the stock split.
