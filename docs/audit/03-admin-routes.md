## 3. ADMIN ROUTES (audit sections 2 «ADMIN HALF» and 11 «ADMIN DASHBOARD»)

Scope: every route under `src/app/admin/`, the navigation model that exposes them, the role and
feature-flag gates on each, and every list, filter, form, action and dialog they contain. Section 11
(the dashboard) is §3.5 below; everything else is section 2.

Method: files were read in the working tree (they are the source of truth). Nothing under
`src/app/admin/`, `src/components/admin/`, `src/lib/` or `supabase/` was being edited during the read.
Where a fact could not be established from the repository, the text says so verbatim.

---

### 3.1 Route inventory

Two route groups exist: `src/app/admin/(panel)/` (everything behind the Back Office chrome) and two
bare routes outside it, `src/app/admin/login/` and `src/app/admin/setup/`.

| URL | File | Kind | Guard at the top of the file | Metadata `title` |
|---|---|---|---|---|
| `/admin` | `src/app/admin/(panel)/page.tsx` | page | `requireStaff()` | `لوحة القيادة` |
| `/admin/leads` | `src/app/admin/(panel)/leads/page.tsx` | page | `requireStaff(CRM_READ_ROLES)` | `مطالب الاستثمار` |
| `/admin/leads/[personId]` | `src/app/admin/(panel)/leads/[personId]/page.tsx` | page | `requireStaff(CRM_READ_ROLES)` | `ملف حريف` |
| `/admin/leads/export` | `src/app/admin/(panel)/leads/export/route.ts` | GET route handler | `getStaffSession()` + `hasRole(session, ADMIN_ROLES)` → `403` | — |
| `/admin/analytics` | `src/app/admin/(panel)/analytics/page.tsx` | page | `requireStaff(CRM_READ_ROLES)` | `التحليلات وخريطة الطلب` |
| `/admin/projects` | `src/app/admin/(panel)/projects/page.tsx` | page | `requireStaff()` (no role) | `العروض` |
| `/admin/projects/parcels` | `src/app/admin/(panel)/projects/parcels/page.tsx` | page | `requireStaff()` (no role) | `القطع` |
| `/admin/projects/[id]` | `src/app/admin/(panel)/projects/[id]/page.tsx` | page (5 tabs via `?tab=`) | `requireStaff()` (no role) | `العرض` |
| `/admin/projects/[id]/parcels/[parcelId]` | `src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx` | page | `requireStaff()` (no role) | `قطعة` |
| `/admin/land-offers` | `src/app/admin/(panel)/land-offers/page.tsx` | page | `requireStaff(LAND_OFFER_ROLES)` | `عروض الأراضي` |
| `/admin/land-offers/[id]` | `src/app/admin/(panel)/land-offers/[id]/page.tsx` | page | `requireStaff(LAND_OFFER_ROLES)` | `عرض أرض` |
| `/admin/land-offers/[id]/files/[fileId]` | `src/app/admin/(panel)/land-offers/[id]/files/[fileId]/route.ts` | GET route handler | `getStaffSession()` + `hasRole(session, LAND_OFFER_ROLES)` → `403` | — |
| `/admin/pricing` | `src/app/admin/(panel)/pricing/page.tsx` | page | `requireStaff(PRICE_ROLES)` | `التسعير` |
| `/admin/settings` | `src/app/admin/(panel)/settings/page.tsx` | page | `requireStaff(ADMIN_ROLES)` | `الإعدادات والنصوص` |
| `/admin/settings/modules` | `src/app/admin/(panel)/settings/modules/page.tsx` | page | `requireStaff(ADMIN_ROLES)` | `الموديولات` |
| `/admin/settings/lists` | `src/app/admin/(panel)/settings/lists/page.tsx` | page | `requireStaff(ADMIN_ROLES)` | `القوائم` |
| `/admin/settings/media` | `src/app/admin/(panel)/settings/media/page.tsx` | page | `requireStaff(ADMIN_ROLES)` | `صور الموقع` |
| `/admin/users` | `src/app/admin/(panel)/users/page.tsx` | page | `requireStaff(ADMIN_ROLES)` | `المستخدمون` |
| `/admin/audit` | `src/app/admin/(panel)/audit/page.tsx` | page | `requireStaff(ADMIN_ROLES)` | `سجل العمليات` |
| `/admin/account` | `src/app/admin/(panel)/account/page.tsx` | page | `requireStaff()` (no role) | `كلمة السر` |
| `/admin/login` | `src/app/admin/login/page.tsx` | page (outside the panel) | `getStaffSession()` → redirect `/admin` when signed in | `دخول الفريق` |
| `/admin/setup` | `src/app/admin/setup/page.tsx` | page (outside the panel), `export const dynamic = "force-dynamic"` | `setupAllowed(token)` → `notFound()` | `ضبط كلمة السر` |

The panel layout `src/app/admin/(panel)/layout.tsx` sets
`metadata = { title: { default: "Back Office", template: "%s · Back Office AgriZed" }, robots: { index: false, follow: false } }`.
`/admin/login` and `/admin/setup` set `robots: { index: false, follow: false }` themselves because they are
outside that layout.

**No route file exists** for reservations, visits, contracts, payments, agricultural services, messages,
or any `/admin/messages` screen.

---

### 3.2 The real navigation tree

The tree is built server-side in `navFor(session, config)` in `src/app/admin/(panel)/layout.tsx`
(lines 55–110) and rendered by the client component `AdminNav` in
`src/app/admin/(panel)/admin-nav.tsx`. Labels and the path→label map live in
`src/components/admin/nav-model.ts`; icons in `src/components/admin/nav-icons.tsx`.

#### 3.2.1 How a row is decided

`row(href, icon, { roles, flag, children })`:

1. `if (roles && !hasRole(session, roles)) return null;` — the row (and its whole subtree, since the
   children are constructed inside the parent's options object) disappears.
2. `const state = flag ? flagState(config, flag) : "public";` — `flagState` is
   `config.flags[key] ?? "disabled"` (`src/lib/config.ts:131`).
3. `badge` = `NAV_STATE_LABELS.off` (`"معطّل"`) when `state === "disabled"`, `NAV_STATE_LABELS.internal`
   (`"داخلي"`) when `state === "internal"`, otherwise `undefined`.
4. `off = state === "disabled"`.
5. Null children are filtered out; `children` is `undefined` when none survive.

A flag-gated row **still opens**. The layout comment states the rule explicitly: the flag says what
visitors see, it is not a staff access rule. Only `roles` removes a row. The row is drawn "quiet" — in
`AdminNav`, `off` dims only the icon (`text-leaf`), never the label; the state is carried by the badge word.

#### 3.2.2 The tree, exactly as coded

There is exactly **one** nav group (`return [{ items: sections }]`), with no group title, and **four**
top-level rows.

| # | Row (`href`) | Label (`ADMIN_LABELS`) | Icon key | Role gate | Flag gate |
|---|---|---|---|---|---|
| 1 | `/admin` | `لوحة القيادة` | `dashboard` | none | none |
| 2 | `/admin/leads` | `الطلبات` | `requests` | `CRM_READ_ROLES` | none |
| 2.1 | `/admin/analytics` | `التحليلات وخريطة الطلب` | `analytics` | `CRM_READ_ROLES` | none |
| 3 | `/admin/projects` | `العروض` | `offers` | **none** | `projects` |
| 3.1 | `/admin/projects/parcels` | `القطع` | `parcels` | **none** | `projects` |
| 3.2 | `/admin/land-offers` | `أراضٍ معروضة علينا` | `land` | `LAND_OFFER_ROLES` | `land_offers` |
| 3.3 | `/admin/pricing` | `التسعير` | `pricing` | `PRICE_ROLES` | `pricing` |
| 4 | `/admin/settings` | `الإعدادات` | `settings` | `ADMIN_ROLES` | none |
| 4.1 | `/admin/settings/modules` | `الموديولات` | `modules` | `ADMIN_ROLES` | none |
| 4.2 | `/admin/settings/lists` | `القوائم` | `lists` | `ADMIN_ROLES` | none |
| 4.3 | `/admin/settings/media` | `صور الموقع` | `media` | `ADMIN_ROLES` | none |
| 4.4 | `/admin/users` | `المستخدمون` | `users` | `ADMIN_ROLES` | none |
| 4.5 | `/admin/audit` | `سجل العمليات` | `audit` | `ADMIN_ROLES` | none |

So: **three rows are flag-gated** (`/admin/projects` and `/admin/projects/parcels` on `projects`,
`/admin/land-offers` on `land_offers`, `/admin/pricing` on `pricing`) — four rows if counted
individually. **Nine rows are role-gated.** `/admin` is the only row with neither gate.

`/admin/projects` and `/admin/projects/parcels` carry a flag but **no role gate**: every signed-in staff
member, `agri_manager` included, sees العروض and القطع.

#### 3.2.3 What is reachable but not in the nav

| Path | How it is reached |
|---|---|
| `/admin/account` | The signed-in user's name in the page header (`layout.tsx` lines 158–165), `title={ADMIN_LABELS["/admin/account"]}` = `كلمة السر`. Visible at every width; the layout comment says it "is the only way to reach it". |
| `/admin/leads/[personId]` | Row link / row href on `/admin/leads`, the dashboard follow-up queue, and the match list on a lot page. |
| `/admin/projects/[id]` | Offer card on `/admin/projects`; the offer link on an offer-kind demand; `صفحة المشروع` on `/admin/pricing`. |
| `/admin/projects/[id]/parcels/[parcelId]` | Lots table (`البطاقة` link and row href), the lot plan tiles, and the two dashboard lot queues. |
| `/admin/land-offers/[id]` | Card on `/admin/land-offers`. |
| `/admin/leads/export` | `تصدير CSV (كل المطالب المطابقة)` button on `/admin/leads`, admins only. |
| `/admin/land-offers/[id]/files/[fileId]` | `فتح` beside each attached document on a land offer. |
| `/admin/login`, `/admin/setup` | Sign-out / redirect; the setup page by secret link on localhost only. |

#### 3.2.4 Current-row logic (`AdminNav`)

`covers(href)` = `href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/")`.
Every item and child is tested and the **longest** covering href wins (`best`), so exactly one row is
`aria-current="page"`. A parent whose child is current gets `onBranch` styling
(`border-transparent font-semibold text-paper`) without `aria-current`. Consequence: on
`/admin/projects/<uuid>` the current row is `العروض`; on `/admin/projects/parcels` it is `القطع` with
`العروض` on-branch.

Colour tokens: sidebar ground `bg-forest-700`, current row `border-gold-bright bg-forest-600 font-semibold text-paper`,
inactive `text-leaf-soft`, hover `hover:bg-forest hover:text-paper`, badge `pill ms-auto flex-none bg-forest text-gold-bright`.

#### 3.2.5 Layout chrome

- Desktop: `lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]`, sticky full-height sidebar with the `Wordmark`
  and the LTR label `Back Office`.
- Below `lg`: the sidebar is replaced by a `<details>` disclosure in the header with `MenuIcon`, summary
  `aria-label="أقسام الـBack Office"`, opening the same `<AdminNav groups={groups} />` over `bg-forest-700`.
- Header right side (`ms-auto`): a link to `/admin/account` showing `session.fullName || session.email`
  and, from `sm` up, the roles joined with `«، »` via `ROLE_LABELS`; then a `<form action={signOut}>`
  with the button `خروج`.
- Breadcrumbs: `<AdminBreadcrumbs />` twice — `hidden lg:block` inside the header row, and a second copy
  in a bordered strip `lg:hidden`.

#### 3.2.6 Breadcrumbs (`src/components/admin/admin-breadcrumbs.tsx`, `trailFor` in `nav-model.ts`)

`trailFor(pathname)` starts at `{ href: "/admin", label: "لوحة القيادة" }` and then walks the path
segments, appending a crumb for every prefix that exists in `ADMIN_LABELS`. A record id contributes no
crumb (`/admin/leads/<uuid>` → `لوحة القيادة · الطلبات`). The separator is a middle dot, not a chevron
(the file says a chevron would point the wrong way in RTL). The last crumb renders as
`<span aria-current="page">` instead of a link; `nav aria-label="مسار الصفحة"`.

`nav-model.ts` explicitly does **not** import `@/lib/auth` (that module is `server-only`), which is why
role and flag resolution happens in the layout and a `NavItem` reaching the client is plain serializable data.

---

### 3.3 Access control

#### 3.3.1 Edge/proxy

`src/proxy.ts` (`export const config = { matcher: ["/admin/:path*"] }`) refreshes the Supabase session and,
when there is no `userId` and the path is neither `/admin/login` nor `/admin/setup`, redirects to
`/admin/login?next=<pathname>`. Its own comment calls this "Optimistic redirect only. Every Back Office
page and action checks roles on the server."

#### 3.3.2 Role constants (`src/lib/auth.ts`)

| Constant | Members |
|---|---|
| `ADMIN_ROLES` | `admin`, `super_admin` |
| `CRM_READ_ROLES` | `commercial`, `finance`, `legal`, `admin`, `super_admin` |
| `PRICE_ROLES` | `finance`, `admin`, `super_admin` (comment: report v3 §53, V2-D9) |
| `LAND_OFFER_ROLES` | `agri_manager`, `legal`, `finance`, `admin`, `super_admin` |

`ROLE_LABELS`: `client: حريف`, `commercial: Commercial`, `agri_manager: مسؤول فلاحي`, `finance: Finance`,
`legal: Legal`, `admin: Admin`, `super_admin: Super Admin`.

`getStaffSession()` is `cache`d per request: it reads `auth.getClaims()`, then `profiles.full_name,
is_active` and `user_roles.role`; returns `null` when the profile is inactive or when the only role is
`client`. `requireStaff(roles?)` redirects to `/admin/login` with no session, and to **`/admin?denied=1`**
when the role gate fails — the dashboard renders that as a red `role="alert"` banner reading
`لا تملك صلاحية الوصول إلى تلك الصفحة.`

Several pages also define local write-role constants that are *not* in `auth.ts`:

- `WRITE_ROLES = ["finance","admin","super_admin"]` in `projects/page.tsx`, `projects/actions.ts`,
  `projects/[id]/page.tsx` and `projects/[id]/parcels/[parcelId]/page.tsx`.
- `FINANCE_ROLES = ["finance","admin","super_admin"]` in `projects/[id]/page.tsx` (identical membership
  to `WRITE_ROLES` in the same file; used for the `التكاليف` tab, PRJ-03).
- `EDIT_ROLES = ["commercial","admin","super_admin"]` in `leads/[personId]/actions.ts`.
- `canFollowUp = hasRole(session, ["commercial","admin","super_admin"])` and
  `ownFilesOnly = hasRole(session,["commercial"]) && !hasRole(session,["admin","super_admin","finance","legal"])`
  in the dashboard; the same `ownFilesOnly` expression is repeated in `/admin/leads` and `/admin/analytics`.

#### 3.3.3 Effective visibility per role (nav rows)

| Role | Nav rows shown |
|---|---|
| `commercial` | لوحة القيادة, الطلبات + التحليلات, العروض + القطع |
| `agri_manager` | لوحة القيادة, العروض + القطع, أراضٍ معروضة علينا |
| `finance` | لوحة القيادة, الطلبات + التحليلات, العروض + القطع + أراضٍ معروضة علينا + التسعير |
| `legal` | لوحة القيادة, الطلبات + التحليلات, العروض + القطع + أراضٍ معروضة علينا |
| `admin` / `super_admin` | everything, including الإعدادات and its five children |

`super_admin` differs from `admin` only inside `/admin/users` (granting/revoking `super_admin`,
resetting a super admin's password), never in the nav.

---

### 3.4 Page-by-page (section 2)

#### 3.4.1 `/admin/leads` — «مطالب الاستثمار» (nav label: `الطلبات`)

**Purpose.** One list of every recorded demand, with the two intakes distinguished: a demand written on
a real offer page (`request_kind = "offer"`) and a simulation run on `/start` (`"calculator"`).
Header copy: for a pure commercial, `المطالب المسندة إليك.`; otherwise
`كل المطالب المسجّلة: طلبات على عروض حقيقية، ومحاكاة تقديرية من الموقع.`

**Data.** `PAGE_SIZE = 50`. Four parallel reads:

1. `supabase.rpc("crm_search_requests", { p: filtersToRpc(filters, { withPeople: true }), p_limit: PAGE_SIZE, p_offset: (page-1)*PAGE_SIZE })` — throws `CRM search failed: …` on error.
2. `lead_statuses` (`id, stage, label_ar`, `is_active`, ordered by `sort_order`).
3. `user_roles` joined to `profiles!user_roles_user_id_fkey(full_name, is_active)` where `role = 'commercial'` — **admins only**, otherwise an empty array.
4. `tree_spacing_classes` (`id, label_ar, area_m2, is_active`) — retired classes stay listed "because older demands still carry them".

Then `offerSnapshots(supabase, rows.map(r => r.id))` reads `interest_requests` directly, in chunks of
100 ids, for the columns `request_kind, project_id, project_code, project_name, offer_trees,
offer_price_per_tree_millimes, offer_total_price_millimes, offer_annual_fee_per_tree_millimes,
offer_annual_fee_total_millimes` (`src/app/admin/(panel)/leads/offer-snapshot.ts`).

**Totals.** From the first row of the RPC: `total_count`, `requests_total`, `persons_total`, `trees_total`.
Three `StatTile`s: `مطلب مطابق` / `شخص مطابق` (swaps with the view mode), the converse count, and
`زيتونة مطلوبة` with the note `الحد الأدنى لكل اختيار، دون المطالب المكرّرة.` The first tile's note counts
the current page: `في هذه الصفحة: N عرض · M محاكي`.

**Intake tabs** (`nav aria-label="نوع الطلب"`, rendered as `chip` links):
`كل الطلبات` · `عروض حقيقية` (`request_kind=offer`) · `محاكي (تقديري)` (`request_kind=calculator`),
from `REQUEST_KIND_FILTER_LABELS`.

**The unapplied-migration fallback.** `public.crm_search_requests` (last defined in
`supabase/migrations/0032_intake_pricing.sql:452`) does not return `request_kind`; the migration that
would add it is drafted and **not applied** (`supabase/pending/bb_crm_offer_columns.sql`). The page
therefore:

- `kindServerFiltered = !filters.request_kind || searchReturnsKind(rows)` where `searchReturnsKind` tests
  `"request_kind" in rows[0]`;
- when false, filters the current page's rows in JavaScript (`visibleRows`) and prints a gold callout:
  `فلتر «…» مطبَّق على الصفحة المعروضة فقط، لأن بحث قاعدة البيانات ما زال ما يميّزش بين المحاكي والعروض. الأعداد فوق والتصدير CSV يحسبوا المطالب الأخرى معها.`
- passes `matchingIsUpperBound={!kindServerFiltered}` to the bulk bar.

**Search & filter panel** — `<details open={hasActiveFilters(filters)}>`, summary `البحث والفلاتر`, a
`method="get" action="/admin/leads"` form on a 4-column grid. `people` and `request_kind` ride along as
hidden inputs.

| Control | `name` | Type / source |
|---|---|---|
| `بحث` | `q` | text, placeholder `الاسم، الهاتف أو رقم المطلب`; the SQL matches `full_name ILIKE`, `request_no ILIKE`, or phone digits when ≥3 digits |
| `عدد الزيتونات` | `trees_min`, `trees_max` | two numbers + `<datalist id="tree-count-values">` built from the `tree_count` option list bounds |
| — | `include_trees_any` | checkbox, label `مع «…» والمطالب بدون عدد` (the open-ended option's own `label_ar`) |
| `ولاية الاستثمار` | `invest_governorate_id` | select over `config.governorates` |
| — | `include_anywhere` | checkbox `مع «المكان غير مهم»` |
| `نوع المشروع` | `project_type_id` | select over `config.projectTypes` |
| — | `include_unsure` | checkbox `مع «ما يهمنيش النوع»` |
| `فئة المساحة` | `spacing_class_id` | select over `tree_spacing_classes`, label `… · <area>` and ` (معطّلة)` when inactive |
| `نظام الغراسة` | `plantation_system` | select over the `plantation_system` option list |
| `حالة الإنتاج` | `production_status` | select over `PRODUCTION_LABELS` (`غير منتج` / `بداية إنتاج` / `منتج`) |
| `نسبة التسبقة` | `down_payment_percent` | select over the `down_payment_percent` list; a value not in the list is appended as `… (معطّلة)` |
| `مدة الدفع` | `duration_min`, `duration_max` | two selects over the `duration` list (`min_number` = months) |
| `طريقة الدفع` | `payment_mode` | select `بالحاضر` / `بالتقسيط` |
| `يحب يزور الأرض` | `wants_visit` | `نعم` / `لا، مازال` |
| `يحب حل تمويل بنكي` | `wants_bank_financing` | `نعم` / `لا` |
| `الهدف` | `goal_code` | select over the `goal` list |
| `ولاية الإقامة` | `residence_governorate_id` | select over governorates |
| `حالة الملف` | `status_id` | select over active `lead_statuses` |
| `المسؤول` | `assigned_to` | **admins only**; `بدون مسؤول` = `none`, then active/suspended commercials (` (موقوف)` suffix) |
| `من تاريخ` / `إلى تاريخ` | `from`, `to` | `<input type="date">` |
| `المصدر (utm_source)` | `source` | text, LTR |
| — | `duplicates_only` | checkbox `المطالب المكرّرة فقط` |
| — | — | `مسح الفلاتر` link to `/admin/leads`, submit `بحث` |

Parsing and re-serialisation are in `src/app/admin/(panel)/leads/filters.ts`. Every value is regex-validated
(`UUID`, `INTEGER`, `TREES` = up to 7 digits, `MONTHS` = up to 3, `PERCENT` = `\d{1,3}(\.\d{1,2})?`,
`DATE`, `CODE`); `q` and `source` are `slice(0,100)`. `percentValue` normalises `"10.50"` → `"10.5"`.
`filtersToRpc` drops `undefined` and `false` and drops `people` unless `withPeople`.
`hasActiveFilters` ignores `people`. `filtersToQuery` rebuilds the query string with `true` → `"1"`.

**View mode** (`nav aria-label="طريقة العرض"`, two chips): `مطلب في كل سطر` (`people` absent) and
`شخص في كل سطر` (`people=1`). In people mode the RPC returns one row per person (their latest matching
demand) and `total_count` counts persons.

**Table.** `DataTable` with `caption="مطالب الاستثمار"`, `minWidth="88rem"`,
`rowHref = /admin/leads/<person_id>#request-<request_id>` (the row opens the file *scrolled to that
demand*), `rowKey = row.id`.

| Column key | Header | Notes |
|---|---|---|
| `select` | header is `SelectAllCheckbox` | admins only; `mobile: "hidden"`; checkbox `name="person_ids"` bound to the bulk form via `form="bulk-assign"` |
| `request` | `المطلب` | `mobile: "hidden"`; intake badge + `request_no` link + `formatDateTime(created_at)` + `مكرّر` chip when `is_duplicate` |
| `kind` | `النوع` | phone card only (`desktop: false`, `mobile: "aside"`) |
| `full_name` | `الاسم` | `mobile: "title"` |
| `phone` | `الهاتف` | `formatPhone(phone_e164)` + `CHANNEL_LABELS[contact_channel]` (`هاتف` / `WhatsApp` / `هاتف وWhatsApp`) |
| `offer` | `العرض` | offer name + code + `N زيتونة من العرض`; for a calculator demand `محاكاة، بلا عرض`; otherwise `—` |
| `trees` | `الزيتونات` | `tree_count_label_ar` |
| `spacing` | `الفئة والسعر` | spacing label, `formatArea(area_per_tree_m2) للزيتونة`, payment mode, then `سعر العرض: …` (bold, from the snapshot) or `مقدّر: …` (from `total_price_millimes`) |
| `invest` | `يدوّر على` | governorate names or `المكان غير مهم`; scenario labels are suppressed for an offer demand |
| `down_payment` | `التسبقة والمدة` | `downPaymentSummary()` → `تسبقة 10% · 1,000 د.ت`, plus `duration_label_ar` |
| `residence` | `الإقامة` | governorate + delegation |
| `status` | `الحالة` | `StatusPill` with `STAGE_TONES[stage]` and `status_label_ar` |
| `assigned_to` | `المسؤول` | `assigned_to_name ?? "—"` |
| `ref` | `رقم المطلب` | phone card only, `mobile: "meta"` |

Empty state: `لا توجد مطالب مطابقة.` with a `مسح الفلاتر` action when filters are active.

**Pagination.** `pageCount = ceil(total / 50)`; a `nav aria-label="الصفحات"` with `السابق` / `الصفحة X من Y` / `التالي`,
each link rebuilt through `filtersToQuery(filters, { page })`.

**Bulk assign** (`BulkAssignBar`, `src/app/admin/(panel)/leads/bulk-assign.tsx`, admins only).
A client component rendered `hidden … md:flex` (so it does not appear on phones). It carries
`id="bulk-assign"`, a hidden `filters` input holding the current query, a radio `scope`
(`المحدّدة في الجدول (N)` vs `كل الملفات المطابقة للبحث (N شخص)`), a `to_user` select
(`بدون مسؤول` + active commercials), an optional `reason` (max 500, placeholder
`مثال: توزيع ملفات ولاية جديدة`) and a submit reading `تحويل N ملف`. It recounts ticked boxes on every
`change` event on `window`. **Dialog:** submitting with `scope=all` calls `window.confirm` with
`سيتم تحويل N ملف مطابق للبحث. هل تريد المواصلة؟`, or, when `matchingIsUpperBound`,
`سيتم تحويل ما لا يزيد عن N ملف مطابق للبحث، بعد استثناء الملفات من النوع الآخر.`

`assignPersons` (`leads/actions.ts`): `requireStaff(ADMIN_ROLES)`; `to_user` must be `none` or a uuid;
with `scope=all` it re-runs `crm_search_requests` in batches of `BATCH = 500` up to `MAX_ROWS = 100_000`,
sending `people: !byKind` so that when an intake filter is active it pages demands and filters them with
`requestKindOf`; then one call to `admin_assign_persons(p_person_ids, p_to_user, p_reason)`
(`supabase/migrations/0002_reference_and_crm.sql:292`). Error mapping:
`target_not_active_commercial` → `هذا المستخدم ليس Commercial نشطاً. اختر Commercial نشطاً من القائمة.`;
`42501` → `لا تملك صلاحية تحويل الملفات.`; otherwise
`تعذّر تحويل الملفات. لم يتغيّر أي ملف، حاول مرة أخرى.` Success revalidates `/admin/leads` and `/admin`
and reports `تم تحويل N ملف.` / `تم إلغاء إسناد N ملف.` / `كل الملفات المحدّدة مسندة من قبل لهذا الاختيار، لم يتغيّر شيء.`

**CSV export** (`/admin/leads/export`, `ADMIN_ROLES`, `403 Forbidden` otherwise). Pages the same RPC in
batches of 500 up to 100 000 rows, applies the intake filter itself over *every* matching demand (not one
page), and builds a header of 34 fixed Arabic columns plus three conditional blocks:
`نوع الطلب` when any row's intake is known; six offer columns (`العرض`, `رمز العرض`, `زيتونات العرض`,
`سعر الزيتونة في العرض (د.ت)`, `السعر الجملي للعرض (د.ت)`, `معاليم الصيانة والتقليم في العام (د.ت)`)
when at least one offer demand is present; and five `إجابات قديمة: …` columns when any retired answer is
present. Money is emitted as dinars with three decimals; every cell is quoted and a leading
`= + - @ tab CR` is prefixed with `'` to neutralise spreadsheet formulas; the body is prefixed with a BOM.
The handler then calls `log_action` with `p_action: "crm.export"`, `p_entity: "interest_requests"`,
`p_data: { filters, rows }`. Response headers: `text/csv; charset=utf-8`,
`attachment; filename="agrized-leads-YYYYMMDD.csv"`, `Cache-Control: no-store`.

#### 3.4.2 `/admin/leads/[personId]` — one client file

`requireStaff(CRM_READ_ROLES)`; `notFound()` when the id is not a uuid or the person does not exist.

`canEdit = isAdmin || (hasRole(session, ["commercial"]) && person.assigned_to === session.id)` — a
commercial may only write on files assigned to them.

Eight parallel reads: `interest_requests.select("*")` for the person (newest first);
`contact_attempts` with `author:profiles!contact_attempts_created_by_fkey`; `person_notes` with its
author; `person_status_history` with `from`/`to` `lead_statuses` and its author; `person_assignments`
with `from`/`to`/`author` profiles; active `lead_statuses`; commercials (admins only); and
`message_templates` where `key = 'lead.whatsapp_first_contact'` and `is_active`.

**Header card.** Name + status pill; delegation/governorate + email; `المسؤول: …` and `ملف منذ <datetime>`;
a `tel:` button showing the formatted phone, and a WhatsApp button whose href is
`https://wa.me/<digits>?text=<template>` with `{name}`, `{agent}` and `{request_no}` substituted from the
template body.

**Demands section.** `المطالب (N)` with a split line `N على عروض حقيقية · M محاكاة تقديرية` (this page
reads `interest_requests` directly, so it *does* see `request_kind`). Each demand is an `<article
id="request-<id>">` with `scroll-mt-24 target:border-forest`; a calculator demand additionally carries the
`card-estimate` class. Inside:

- intake pill (`عرض` / `محاكي`), `request_no`, `مكرّر` chip, timestamp;
- for an offer demand, a green `العرض المطلوب` block: linked project name (`/admin/projects/<project_id>`),
  project code, and up to four figures — `الزيتونات المطلوبة`, `سعر الزيتونة`, `السعر الجملي`,
  `معاليم الصيانة والتقليم في العام` (with a per-tree sub-line) — closing with
  `أسعار العرض كيما كانت وقت إرسال المطلب.`;
- for a calculator demand, the line
  `محاكاة تقديرية من الموقع: أرقام تتبع اختيارات الحريف، موش عرض عقاري.`;
- a `<dl>` of the snapshot: `عدد الزيتونات` (calculator only), `مكان الاستثمار`/`ولاية العرض`,
  `يحب يملك` (calculator only), `فئة المساحة`, `المساحة لكل زيتونة`, `المساحة الجملية`, `طريقة الدفع`,
  `سعر الزيتونة المقدّر` and `السعر الجملي المقدّر` (calculator only), `نسبة التسبقة`,
  `مبلغ التسبقة المقدّر`, `مدة الدفع` (calculator only), `السعر بالتقسيط`, `القسط الشهري المقدّر`,
  `الهدف`, `يحب يزور الأرض`, `يحب حل تمويل بنكي`, `التواصل`, `الإقامة المصرّح بها`,
  `الاسم في هذا المطلب` (only when it differs), `المصدر`;
- a bordered `إجابات قديمة` block listing only the retired answers the demand actually carries
  (`المساحة المطلوبة`, `الأهم بالنسبة إليه`, `التسبقة (مبلغ)`, `القسط الشهري`, `الميزانية`), with the
  note `أسئلة ما عادتش في الاستمارة. القيم محفوظة كيما سجّلها الحريف.`

**Timeline.** `سجل الملف`: contact attempts, notes, status history and assignments merged and sorted by
`at` descending. Kinds are labelled `محاولة تواصل`, `ملاحظة`, `الحالة`, `الإسناد`; a system row shows
`النظام` as the author; `auto:round_robin` renders as `إسناد آلي بالتناوب`. Empty: `لا توجد عمليات بعد.`

**Aside forms.** When `canEdit`:

| Card | Action | Fields |
|---|---|---|
| `تسجيل محاولة تواصل` | `addContactAttempt(personId, …)` | `channel` (`مكالمة`/`WhatsApp`/`SMS`/`أخرى`), `outcome` (required: `تم الرد`, `لم يرد`, `رقم خاطئ`, `طلب إعادة الاتصال`, `غير مهتم حالياً`), `note` (≤5000), `next_follow_up_at` (`datetime-local`) |
| `الحالة` | `updateStatus(personId, …)` | `status_id` over active statuses |
| `ملاحظة` | `addNote(personId, …)` | `body` textarea, required, ≤5000 |

Otherwise a single card reads `اطلاع فقط: لا يمكنك تعديل هذا الملف.` Admins additionally get
`تحويل الملف` with `to_user` (`بدون مسؤول` + active commercials) and a free `reason` (≤500).

`leads/[personId]/actions.ts`: all three editing actions call `requireStaff(EDIT_ROLES)` and rely on RLS
for the per-file check (`if (!data?.length) return DENIED` where `DENIED` is
`لا تملك صلاحية تعديل هذا الملف.`; `error.code === "42501"` maps to the same message).
`tunisLocalToIso` interprets the typed `datetime-local` as `+01:00` (Africa/Tunis, no DST).
`assignPerson` calls the same `admin_assign_persons` RPC with a single id.

#### 3.4.3 `/admin/analytics` — «التحليلات وخريطة الطلب»

`requireStaff(CRM_READ_ROLES)`. Query parameters: `range` (`all` | `7d` | `30d` | `90d`, from `RANGES`),
`color` (`demands` | `trees`), `mode` (`requests` | `people`). Three `Segmented` navs:
`الفترة`, `لون الخريطة` (`حسب الطلب` / `حسب الزيتونات`), `طريقة العدّ` (`نعدّ المطالب` / `نعدّ الأشخاص`).
Default values are omitted from the rebuilt href.

Data: `crm_demand_stats(p_from, p_people)` (last defined in `0032_intake_pricing.sql:663`) and
`governorates` with `map_row, map_col`. Both throw on error
(`Demand report failed: …`, `Governorates failed: …`).

Four `StatTile`s: `مطالب` (with `N منها مكرّرة`), `أشخاص`, `زيتونات مطلوبة`, and
`أكثر ولاية مطلوبة (بالمطالب|بالأشخاص|بالزيتونات)` naming every tied leader.

Charts (`ChartCard` + `BarList` from `src/components/admin/charts.tsx`, `DemandMap` from
`src/components/admin/demand-map.tsx`):

1. `خريطة الطلب` — a tile grid positioned by `map_row`/`map_col`; each tile links to
   `/admin/leads?invest_governorate_id=<id>[&from=…][&people=1]`. Subtitle states how many
   `المكان غير مهم` demands are *not* on the map and that a multi-governorate demand counts in each.
2. `<valueLabel> حسب الولاية` — the same figures as a ranked bar list.
3. `عدد الزيتونات في المطالب` and `الزيتونات المطلوبة حسب الاختيار`.
4. `شنوّة يحبوا يملكوا` (by scenario, with the `ما يهمنيش النوع` count) and `فئات المساحة`.
5. `طريقة الدفع` and `نسبة التسبقة`.
6. `مدة الدفع` and `الزيارة والتمويل البنكي`.
7. `شرائح السعر الجملي` — rendered only when `by_total_price_band` is non-empty; the subtitle names the
   setting `analytics.total_price_bands_millimes`.
8. A `قديم` section rebuilding retired breakdowns (`القسط الشهري`, `التسبقة بالمبلغ`, `المساحة المطلوبة`,
   `الأهم بالنسبة للحريف`), each shown only when it has a non-`بدون إجابة` answer in the period.

Footer line links back to `/admin/leads` for cross-cutting questions.

The RPC's shape is declared in `src/app/admin/(panel)/analytics/demand-stats.ts` (`DemandStats`), which
also exports `tunisToday()`, `daysAgo()` and `resolveRange()` — all three are reused by the dashboard.

#### 3.4.4 `/admin/projects` — «العروض»

`requireStaff()` (any staff). `canWrite = hasRole(session, ["finance","admin","super_admin"])`.

Reads all `projects` (`id, code, name, governorate_id, location_description, status, total_area_m2,
tree_count, created_at`, newest first) and all `parcels` (`project_id, status, olive_tree_count`), then
groups the lots per project and computes `treeStock()`.

**Stock model** (`src/app/admin/(panel)/projects/stock.ts`). Four buckets with fixed sources:

| Bucket | Label | Parcel statuses summed |
|---|---|---|
| `available` | `المتاحة` | `available`, `interested` |
| `reserved` | `المحجوزة` | `reserved`, `contracting` |
| `sold` | `المباعة` | `sold`, `owned` |
| `withdrawn` | `الموقوفة` | `withdrawn` |

`total = available + reserved + sold` (withdrawn sits outside the total). An unknown status is counted
as `available`. Lots with no tree count are counted in the lot counts, add zero trees and are reported
separately as `lotsWithoutTrees`.

Page body: a 4-tile header strip (`إجمالي الزيتونات` with `N عرض`, `المتاحة`, `المحجوزة` with the note
`من حالة القطع`, `المباعة`); an action link `كل القطع` → `/admin/projects/parcels`; for writers a
`<details>` disclosure `+ عرض جديد` whose form (`saveProject.bind(null, null)`) has
`رمز العرض` (placeholder `OFF-TNAYEUR`), `الاسم`, `الولاية`, `نوع المشروع`, `المساحة الجملية (م²)` and
`الحالة` (default `draft`), submitting `إنشاء العرض`. Then a two-column card grid, each card linking to
`/admin/projects/<id>` and showing name, code, `location_description · governorate`, the project status
pill, a `StockLine` (`إجمالي · المتاحة · المحجوزة · المباعة`, or a `مصرّح به · ما تقسّمش لقطع بعد` line
when the offer has no lots), the total area and `N قطعة بلا عدد زيتونات` when applicable.

Empty state: title `ما فماش عروض بعد`, body
`العرض هو أرض موجودة بقطعها وزيتوناتها. أنشئ أول عرض من فوق، ثم قسّمه لقطع.`

Project statuses (`src/lib/projects.ts`): `مسودة`, `قيد التحضير`, `جاهز (داخلي)`, `منشور`, `مكتمل البيع`,
`في طور الاستغلال`, `مؤرشف`.

#### 3.4.5 `/admin/projects/parcels` — «القطع» (every lot of every offer)

`requireStaff()`. Query parameters: `status` (must be one of the seven `PARCEL_STATUS_LABELS` keys) and
`offer` (uuid). Reads all projects (`id, code, name, status` ordered by code) and `parcels.select("*")`
ordered by `code` with the two filters applied in SQL; rows whose project is not visible are dropped.
Prices come from `getStaffParcelPrices()` — one `staff_project_parcel_prices` RPC per offer present
(`supabase/migrations/0035_projects_tree.sql:276`).

Four tiles over the filtered set (`إجمالي الزيتونات` with `N قطعة`, `المتاحة`, `المحجوزة` with
`من حالة القطعة`, `المباعة`). A `method="get"` filter card with `الحالة` (`كل الحالات` + the seven
labels), `العرض` (`كل العروض` + `<code> · <name> · <status label>`), submit `تصفية`, and
`إلغاء التصفية` when either filter is set.

Shared table `LotsTable` (`src/app/admin/(panel)/projects/lots-table.tsx`), `caption="قطع كل العروض"`,
`minWidth="58rem"` when the offer column is present (`48rem` otherwise), `rowHref` to the lot page:

| Column | Header | Content |
|---|---|---|
| `code` | `القطعة` | LTR code, `mobile: "title"` |
| `offer` | `العرض` | only in the cross-offer list; code + name |
| `trees` | `الزيتونات` | `formatCount(trees)`, or the red `ما تكتبش` when null |
| `status` | `الحالة` | `StatusPill` with `parcelStatusTone` |
| `area` | `المساحة` | total area + `<x> للزيتونة` when known |
| `trees-state` | `العمر والإنتاج` | `N سنة` · production label |
| `price` | `السعر` | cash price + per-tree price, or the red blocked reason / `بلا سعر` |
| `open` | (blank) | `البطاقة` link, desktop only |

Empty state: `ما فماش قطع بهذه التصفية` / `ما فماش قطع بعد` with a matching action, and the body
`القطع تتزاد من داخل العرض، في تبويب «القطع».`

Closing hint: `الحجوزات والزيارات والعقود والدفوعات مازالت ما تفتحتش كوحدات. «محجوزة» و«في طور التعاقد» و«متعاقد عليها» هي حالة مكتوبة على القطعة نفسها، وهي المصدر الوحيد لهذه الأرقام اليوم.`

Parcel statuses: `available: متاحة`, `interested: مهتم بها`, `reserved: محجوزة`,
`contracting: في طور التعاقد`, `sold: متعاقد عليها`, `owned: مملوكة`, `withdrawn: موقوفة`.

#### 3.4.6 `/admin/projects/[id]` — one offer, five tabs

`requireStaff()`; `notFound()` on a non-uuid id or a missing project.
`canWrite` / `canSeeCosts` = `finance`, `admin`, `super_admin`.
`tabs = canSeeCosts ? ["card","lots","pictures","pricing","costs"] : ["card","lots","pictures","pricing"]`
and `readOfferTab(searchParams.tab, tabs)` falls back to `"card"` for an unknown or forbidden tab.
Tab labels (`OFFER_TAB_LABELS`): `البطاقة`, `القطع`, `الصور`, `التسعير`, `التكاليف`. Each tab is its own
address `?tab=…`; the nav is a `chip` list with counts for `lots` and `pictures`.

Reads: the project row (`select("*")`), the settings `pricing.default` and `audit.reason_min_length`
(default `1`), `project_spacing_classes` joined to `tree_spacing_classes`, all `parcels` of the project
ordered by `sort_order` then `code`, and `project_media` ordered by `sort_order` then `created_at`.
`project_costs` is read **only** when `canSeeCosts && tab === "costs"`; the full `tree_spacing_classes`
list **only** when `tab === "pricing"`.

Above the tabs, always:

- a back link `→ العروض`;
- `SectionHeader` with the project name, status pill, LTR `code · governorate`, and two action links:
  `معاينة في الموقع ↗` to `/projects/<code>` when the status is in
  `ON_SITE = ["internal","published","sold_out","operating"]`, and `قواعد التسعير` to
  `/admin/pricing?project=<id>` when `treePricingReady(config) && canWrite`;
- `OfferIdentity` — a 4-column data grid: `الموقع`, `المساحة الجملية`, `عدد الزيتونات`, `الصنف`,
  `عمر الزيتونات`, `حالة الإنتاج`, `الغراسة والري`, `المساحة لكل زيتونة` (with its provenance:
  `من فئة المساحة` / `محسوبة في القطع` / `تقديرية: المساحة ÷ الزيتونات`), `السعر للزيتونة`
  (`من …` when lots span several classes; the blocked reason in red; or
  `يتحدّد بعد اعتماد فئة المساحة`), and `الوثائق` as pills (else
  `ما تحدّدتش — علّمها في تبويب «البطاقة»`);
- `StockStrip` — the same four figures, each with the statuses it summed, plus the standing note
  `«المحجوزة» تتحسب من القطع اللي حالتها «محجوزة» أو «في طور التعاقد». وحدة الحجوزات مازالت ما تفتحتش، فما فماش مصدر آخر للرقم.`
  When the offer has no lot at all, the strip is replaced by a dashed card showing only the declared tree
  count and the sentence `هذا العرض مازال ما تقسّمش لقطع…`;
- a warnings list (gold): lot areas exceeding the offer area; lot trees exceeding `tree_count`;
  `فيه قطع متاحة بلا سعر (N). ما تتعرضش بسعر على الموقع.`; and, when tree pricing exists but no spacing
  class is attached, `هذا العرض بلا فئة مساحة…` with the action link `اعتماد فئة المساحة` →
  `?tab=pricing`.

**Tab `البطاقة`** (`card-tab.tsx`). For a non-writer it renders one sentence:
`بطاقة العرض تتبدّل من طرف المالية أو الإدارة فقط…`. For a writer it is **one** `ActionForm`
(`saveProject.bind(null, project.id)`, submit `حفظ العرض`) containing: `الاسم`, `الولاية`,
`نوع المشروع`, `وصف الموقع`, `المساحة الجملية (م²)`, `عدد الأشجار`, `عمر الأشجار (سنوات)`, `الصنف`,
`نظام الغراسة`, `حالة الإنتاج`, `الري` (`بعلية`/`مروية`), `المصاريف السنوية التقديرية للقطعة (د.ت)`,
`الحالة`; then `<input type="hidden" name="page_fields" value="1">` followed by the public-page fields —
`وصف المشروع`, `الماء`, `مصدر الماء`, `النفاذ والطريق`, `رابط الفيديو`, `خط العرض`, `خط الطول`,
the checkbox `إظهار الموقع على الخريطة في صفحة المشروع`, and two `OptionChecks` fieldsets over the
`land_document` and `agrized_service` option lists — and finally the jsonb `PricingEditor`
(preceded by `LegacyPricingNotice` once tree pricing exists). The file's own header explains why it must
stay one form: `saveProject` writes the page fields only when the `page_fields` marker is present, and a
missing `PricingEditor` would make the save fail with `اختر طريقة التسعير`.

**Tab `القطع`** (`lots-tab.tsx`). A header line counting lots and trees; `ParcelPlan` (`مخطط القطع`),
each tile opening its lot and showing `N زيتونة`; the shared `LotsTable` (`caption="قطع هذا العرض"`);
and, for writers, a `<details>` `+ إضافة قطعة` holding `ParcelFields` with `nextCode = P<NN>` and
`nextOrder = (last sort_order) + 10`, submitting `إضافة القطعة`.

**Tab `الصور`** (`pictures-tab.tsx`). A gallery grid; the cover is `is_cover`, or the first picture when
none is chosen, marked with the `الغلاف` pill. Per picture, writers get four single-button forms:
`اجعلها الغلاف` (`setProjectCover`), `تقديم` / `تأخير` (`moveProjectPicture` with `-1` / `+1`, hidden at
the ends) and `حذف` (`removeProjectPicture`). Below, an upload `ActionForm` (`addProjectPicture`) with
`ملف الصورة` (`accept="image/jpeg,image/png,image/webp,image/avif"`), a required `النص البديل` (≤160) and
an optional `تعليق` (≤200), submit `رفع الصورة` / pending `جارٍ الرفع…`.
Empty: `ما فماش صور بعد. ما دام العرض بلا صورة يظهر رسم بألوان العلامة.`

**Tab `التسعير`** (`pricing-tab.tsx`). A verdict card: pill `يتسعّر بالزيتونة` (success) or
`المسار القديم` (warning), a one-line explanation, and three figures — `السعر للزيتونة`,
`فئات المساحة المعتمدة`, `قطع بسعر مكتوب باليد` (out of N lots) — then the attached classes as pills
(`<label> · <spacing> · <area> للزيتونة`, plus ` · معطّلة` for an inactive one). Below it, exactly one of
four states: `التسعير بالزيتونة مازال ما تفعّلش في هذه النسخة…` (no `pricing` flag);
`فئة المساحة تتعتمد من طرف المالية أو الإدارة فقط.` (no write role);
`ما فماش فئات مساحة نشطة…` with a link to `/admin/pricing`; or the form
`saveOfferSpacingClasses.bind(null, projectId)` — checkboxes `name="ids"` over active classes plus a
required `ReasonField` — submitting `اعتماد فئة المساحة` / `حفظ فئات المساحة`. Header action link:
`قواعد التسعير والمحاكاة` → `/admin/pricing?project=<id>`.

**Tab `التكاليف`** (`costs-tab.tsx`, Finance/Admin only). Three tiles: `مجموع التكاليف`,
`المداخيل المتوقّعة` (cash price of the non-withdrawn lots, note `سعر الحاضر للقطع غير الموقوفة`) and
`الهامش المتوقّع` (bordered in danger when negative). A `DataList` of the recorded costs
(`<label> · <kind label>`), or `ما فماش تكاليف مسجّلة لهذا العرض.` Then an add form
(`addProjectCost`): `البيان`, `النوع` (`COST_KINDS_OFFERED` — the eleven v3 kinds, excluding the legacy
`development` and `fees`), `المبلغ (د.ت)`, submit `إضافة`. There is **no edit and no delete** for a cost row.

#### 3.4.7 `/admin/projects/[id]/parcels/[parcelId]` — one lot

`requireStaff()`; `notFound()` unless both ids are uuids and `parcel.project_id === id`.
`canWrite` = finance/admin/super_admin.

Left column, `بطاقة القطعة`: the lot code, its status pill, then `عدد الزيتونات`, `المساحة`,
`نوع العقار`, `نوع الغراسة`, `عمر الزيتونات`, `حالة الإنتاج`, `الري`. On a tree-priced lot it continues
with `مساحة كل زيتونة`, `المساحة الجملية`, `السعر للزيتونة` and `السعر الجملي` (or the blocked reason).
On a legacy lot it shows `السعر حاضر` (or the setting `projects.price_pending`, default
`السعر يُعلن لاحقاً.`), `التسبقة` (`من …`) and `القسط`. Both paths end with
`المصاريف السنوية التقديرية` and the two legal settings `legal.parcel_card_note` and
`legal.no_guarantee_notice`.

Right column:

- **Tree-priced lot:** a card `التسعير بالزيتونة` explaining that area and price follow from the tree
  count and the spacing class, with the button `محاكي التسعير لهذا المشروع` → `/admin/pricing?project=<id>`.
- **Legacy lot:** `محاكي التقسيط` — a `method="get"` form with `التسبقة` (`down`) and `القسط الشهري`
  (`installment`) selects populated from `staff_parcel_offer` (`supabase/migrations/0020_public_projects.sql:398`),
  submit `احسب`. A successful plan shows `عدد الأشهر`, `السعر الجملي`, `آخر قسط`, `الفارق عن الحاضر`;
  a refused plan prints `PLAN_REASON_LABELS[reason]` plus, when present, the minimum installment, the
  minimum down payment and the nearest possible option of each. If the RPC errors with a choice, it is
  retried without the choice ("An option retired since the link was made").
- **`الحرفاء الأقرب لهذه القطعة`** — `match_requests_for_parcel(p_parcel, p_limit: 25)`
  (`supabase/migrations/0013_pricing_and_matching.sql:154`). Each row links to the person's file, shows the
  formatted phone, the request number, the registration date, a large percentage score, and the positive
  score components as chips (`BREAKDOWN_LABELS`: `الولاية`, `نوع المشروع`, `الغراسة`, `المساحة`,
  `التسبقة`, `القسط`, `الأولوية`). Caption: `النتيجة أداة ترتيب داخلية، لا تُعرض للحريف.`
  Empty: `لا يوجد حرفاء مطابقون بالحد الأدنى الحالي للنتيجة.`
- **`تعديل القطعة`** (writers only) — `ParcelFields` inside `saveParcel.bind(null, id, parcelId)`,
  submit `حفظ القطعة`.

`ParcelFields` (`src/app/admin/(panel)/projects/parcel-fields.tsx`) switches on whether the project lists
spacing classes: tree-priced lots get a required `عدد الزيتونات`, a `فئة المساحة` select and a read-only
`المساحة والسعر` box; legacy lots get `المساحة (م²)` and `سعر الحاضر (د.ت)` plus the jsonb
`PricingEditor`. Common fields: `رمز القطعة`, `الحالة`, `نوع العقار` (`أرض بيضاء` / `زيتون موجود`),
`نظام الغراسة`, `عمر الزيتونات (سنوات)`, `حالة الإنتاج`, `الري`, `المصاريف السنوية (د.ت)`, `الترتيب`,
`ملاحظات`. There is **no delete** for a lot anywhere in the Back Office — the only way to retire one is
the status `موقوفة`.

#### 3.4.8 `/admin/land-offers` and `/admin/land-offers/[id]` — «أراضٍ معروضة علينا»

List (`requireStaff(LAND_OFFER_ROLES)`, `PAGE_SIZE = 50`): `land_offers` with `{ count: "exact" }`,
newest first, `range((page-1)*50, page*50-1)`, plus a `files:land_offer_files(count)` aggregate.
Filters: `status` (validated against `LAND_STATUS_LABELS`) and `governorate` (1–3 digits). H1
`عروض الأراضي` — note that the nav names the same page `أراضٍ معروضة علينا`. Sub-line:
`عروض أصحاب الأراضي والضيعات. لا يُنشر أي عرض، وكل عرض يمر بالمراجعة القانونية والفنية والميدانية.`
Cards show the property-type label, delegation + governorate, the reference number and date, the status
pill, then `المساحة`, `الزيتون`, `الري`, `السعر` (` · قابل للتفاوض`), and a footer
`<contact_name> · N ملفات`. Empty: `لا توجد عروض مطابقة.` Pagination `السابق` / `X / Y` / `التالي`.

Detail: header card with the property type, status pill, location, reference + date, the contact's name
and capacity (`مالك` / `وكيل` / `وسيط`) and a `tel:` button. Then `العقار` (area, tree count, tree-age
label, irrigation + water source, asking price, a Google Maps link when coordinates exist, and the free
`وصف المكان`); `الوثائق` (declared document names, the attached files with size in MB and a `فتح` link,
and the note `فتح أي ملف يُسجَّل في سجل العمليات.`); and `سجل المراجعة` (stage + outcome, date, reviewer
name and notes), empty `لم تبدأ المراجعة بعد.`

Aside: `الطلب في <governorate>` from `demand_indicator(p_governorate)`
(`supabase/migrations/0007_crm_queries.sql:188`) — the count of people who chose this governorate, the
`المكان غير مهم` count and a per-project-type breakdown, captioned
`عدد الأشخاص المسجّلين، دون بيانات شخصية.` Then `تسجيل مراجعة` with `المرحلة`, `النتيجة`
(`مطابق` / `غير مطابق` / `يحتاج معلومات` / `ملاحظة`), `الملاحظات` (≤5000) and
`تغيير الحالة (اختياري)`, submit `تسجيل`.

The stage options offered depend on the role, in the page itself:
an admin sees all of `REVIEW_STAGES` (`قيد الدراسة`, `مراجعة قانونية`, `مراجعة فنية`, `زيارة ميدانية`);
a `legal` user sees only `legal_review`; an `agri_manager` sees `technical_review` and `field_visit`.
`next_status` offers `REVIEW_STAGES + FINAL_STATUSES` for an admin and only the three review stages for
others, always excluding the current status. When no stage is available the aside shows
`اطلاع فقط: المراجعة من اختصاص Legal وAgricultural Manager وAdmin.`
`reviewLandOffer` calls `review_land_offer` (`supabase/migrations/0003_land_offers_and_intake.sql:467`),
mapping `42501` to `لا تملك صلاحية هذه المرحلة أو هذا القرار.`

The file route `/admin/land-offers/[id]/files/[fileId]` verifies the file belongs to the offer, mints a
**300-second** signed URL on the `LAND_OFFER_BUCKET`, writes an audit row
(`log_action`, `p_action: "document.open"`, `p_entity: "land_offer_files"`) and returns a 302 redirect.

#### 3.4.9 `/admin/pricing` — «التسعير»

`requireStaff(PRICE_ROLES)`. One long page (`max-w-5xl`) with an in-page table of contents linking to
seven anchors: `فئات المساحة` (`#spacing`), `القواعد العامة` (`#global-rules`), `المصاريف الإضافية`
(`#extra-costs`), `نِسَب التسبقة والمدد` (`#rates`), `الزيادة حسب المدة` (`#markups`), `قواعد مشروع`
(`#project-rules`), `محاكاة السعر` (`#simulator`). Query parameters: `project` (uuid, selects the project
section) and the simulator's `class`, `trees`, `sim_project`, `down`, `duration`.

Reads: the public config, `tree_spacing_classes`, `tree_pricing_rules`, `tree_cost_items`,
`financing_markups`, `projects`, the settings `audit.reason_min_length` and `pricing.max_months`,
`profiles` (to name who last edited a rule), and — only when a project is selected —
`project_down_payment_percents` and `project_spacing_classes`. Any failed read throws
`Pricing page failed: …`.

Header formula, stated in the page: `سعر الزيتونة = قيمة الأرض (مساحة الزيتونة × ثمن المتر) + تكلفة الغراسة + المصاريف الإضافية، ثم يُضاف هامش AgriZed.`
When no global rule exists or its `margin_mode` is null, a gold warning appears twice — in the header
(`هامش AgriZed غير مضبوط بعد.`) and inside the global-rules section
(`الأسعار ما تنحسبش وما تبانش في الموقع حتى يتضبط هامش AgriZed.`).

| Section | Contents | Actions |
|---|---|---|
| `فئات المساحة` | A table of classes: name + French/code, `التباعد`, `المساحة لكل زيتونة`, `الترتيب`, `نشط`/`معطّل`. Each row has a `تعديل أو حذف` disclosure. | `saveSpacingClass(id)`, `deleteSpacingClass(id)`, plus an `إضافة فئة` form with `nextOrder = last + 10` |
| `قواعد التسعير العامة` | `RuleForm` with `projectId = null`; the note line prints the last edit time and editor | `savePricingRule(null)` |
| `المصاريف الإضافية` | `CostItemsList` over items with `project_id === null`; each row shows amount + basis (`per_tree` / `per_m2`), sort order and active badge | `saveCostItem(id, null)`, `deleteCostItem(id)`, add form |
| `نِسَب التسبقة والمدد` | **Read-only.** Two tables listing the active `down_payment_percent` and `duration` items, each with a link `تعديل … في «القوائم»` → `/admin/settings/lists`. A duration longer than `pricing.max_months` is flagged `أطول من الحدّ الأقصى (N شهراً)، لذلك ما تتسعّرش.` | none |
| `الزيادة حسب مدة التقسيط` | `MarkupsForm` — one percentage field per duration (`markup_<months>`), including durations that left the active list (marked `مدة ما عادتش في قائمة المدد النشطة`). A duration over the cap is disabled and warns that its stored markup will be removed on save. A status line counts durations that are `غير معروضة للزائر حتى تتحدّد نسبة الزيادة` | `saveMarkups(null)` |
| `قواعد خاصة بمشروع` | A `method="get"` project picker (options suffixed ` · عنده قواعد خاصة`), then five subsections for the chosen project: its rule form, its cost items, its markups (empty field = inherits the global percentage, shown as the placeholder `العامة: …`), `نِسَب التسبقة المسموحة لهذا المشروع` and `فئات المساحة المسموحة لهذا المشروع` (both `AllowedChoicesForm`: no box ticked = the whole active list), and `حذف القواعد الخاصة` when the project has any own values | `savePricingRule(id)`, `saveCostItem`, `saveMarkups(id)`, `saveProjectDownPercents`, `saveProjectSpacingClasses`, `deletePricingRule` |
| `محاكاة السعر` | A `method="get"` form: `فئة المساحة` (required), `عدد الزيتونات`, `المشروع (اختياري)`, `نسبة التسبقة (للتقسيط)`, `مدة التقسيط`, submit `احسب` + `مسح`. Calls `staff_tree_quote` and renders `QuoteBreakdown`. Choosing only one of the two installment answers shows `باش تتحسب الأقساط، اختر نسبة التسبقة ومدة التقسيط الاثنين.` | read-only RPC |

**Every write on this page requires a written reason.** `ReasonField` is a required textarea whose
`minLength` comes from the setting `audit.reason_min_length`, and the Server Action forwards it as
`p_reason`; `app.require_reason` in the database refuses the write without one. Deletions use a
visually distinct `DeleteForm` (danger border) with its own `سبب الحذف` field and a hint explaining that
deactivating is usually preferable.

`pricing/actions.ts` maps RPC failures through `rpcFailure()`: known intake errors go through
`intakeErrorMessage`, `42501` → `forbidden`, `23505` → `duplicate_code`, otherwise
`تعذّر الحفظ ولم يتغيّر شيء. حدّث الصفحة وتحقّق من القيم، ثم حاول مرة أخرى.`
`saveSpacingClass` and `deleteSpacingClass` additionally `updateTag(PUBLIC_CONFIG_TAG)` because `/start`
caches the classes.

#### 3.4.10 `/admin/settings` — «الإعدادات والنصوص»

`requireStaff(ADMIN_ROLES)`. Reads every `settings` row with its `value_type, group_key, label_ar,
description_ar, is_public, updated_at` and the editor's name, ordered by `group_key` then `sort_order`.
Rows are grouped into eight fixed sections, and a group with no rows is skipped:

`site` — `نصوص الموقع` · `legal` — `النصوص القانونية` · `lead` — `التسجيل والملفات` · `sms` —
`الرسائل القصيرة` · `simulator` — `المحاكي` · `projects` — `المشاريع والقطع` · `pricing` — `التسعير` ·
`antispam` — `الحماية والملفات المرفقة`.

Each setting is one card with its label, description, last-edit stamp and a one-field `ActionForm`
(`updateSetting(key)`, submit `حفظ`). The control is chosen by `value_type` and by key:
`boolean` → a checkbox labelled `مفعّل`; `integer` → a number input bounded by `INTEGER_RANGES`
(`src/app/admin/(panel)/settings/ranges.ts`: `million.goal` 1–10 000 000,
`projects.installment_examples` 1–5, `projects.listing_limit` 20–1000, `projects.gallery_max` 1–60,
`pricing.max_months` 12–120, three `antispam.*` bounds, `land_offer.max_file_size_mb` 1–20,
`land_offer.max_files` 0–50; anything else 0–1 000 000), with `pricing.max_months` suffixed `شهراً`;
`crm.auto_assign_mode` → a select (`يدوياً من Admin` / `بالتناوب على الـCommercials النشطين`);
`simulator.durations_months` → a comma-separated text field; `pricing.default` → the jsonb
`PricingEditor` (preceded by `LegacyPricingNotice`); `site.how_it_works` and `site.faq` → the
`PairListEditor` (max 10 steps / 30 questions); a short list of keys
(`request_no.prefix`, `land_offer_no.prefix`, `site.contact_phone`, `site.contact_whatsapp`,
`site.contact_email`, `brand.tagline_fr`) → a single-line LTR input; everything else → a textarea.

`updateSetting` re-reads the row's `value_type` from the database before parsing. Validation highlights:
nine keys are in `REQUIRED_TEXT` and cannot be emptied (`هذا النص إلزامي ولا يمكن تركه فارغاً.`);
text is capped at 2000 characters; the two number prefixes must match `^[A-Z0-9-]{2,12}$`;
`sms.sender_id` must match `^[A-Z0-9]{2,11}$`; the two phone settings must be `^\+[1-9]\d{6,14}$`;
`site.contact_email` is validated by zod. Lowering `pricing.max_months` below the longest active duration
is refused in the action, and the database's own `cap_below_durations` error is translated to
`فمّا زيادة محدّدة على مدة أطول من هالرقم في صفحة التسعير…`. Success calls
`updateTag(PUBLIC_CONFIG_TAG)` and, for `pricing.default`, also `updateTag(PUBLIC_PROJECTS_TAG)`.

There is **no create and no delete** for a setting.

#### 3.4.11 `/admin/settings/modules` — «الموديولات»

`requireStaff(ADMIN_ROLES)`. Reads `feature_flags` (`key, state, phase, label_ar, description_ar,
updated_at`) ordered by `phase` then `sort_order`, and renders them under four fixed phase headings
(`PHASE_LABELS`: `المرحلة 1 · جمع الطلب`, `المرحلة 2 · المشاريع والحجز`, `المرحلة 3 · التعاقد والأقساط`,
`المرحلة 4 · ما بعد التملّك`). A three-card legend explains the states:
`معطّل` = `مخفي عن الجميع. روابطه تعرض «قريباً».`, `داخلي فقط` = `يراه فريق AgriZed المسجّل فقط، للتجربة قبل النشر.`,
`منشور للعموم` = `ظاهر لكل الزوار.`

Each implemented flag gets a three-way radio segmented control inside an `ActionForm`
(`setModuleState(key)`, submit `حفظ`). A flag that is not in `IMPLEMENTED_MODULES`
(`interest_form`, `simulator_basic`, `land_offers`, `projects`, `public_statistics`, `pricing` —
`src/lib/modules-catalog.ts`) shows the static text `يُبنى في دفعة قادمة` instead of a control.

`setModuleState` refuses two things beyond the role check: setting a non-implemented module to anything
other than `disabled` (`هذا الموديول لم يُبنَ بعد في هذه النسخة، ولا يمكن تفعيله.`) and setting
`projects` to `public` — hard-coded:
`المشاريع تبقى «داخلي فقط» حتى تُضبط جداول الأسعار الخاصة بكل عرض. يمكن معاينتها من الفريق فقط.`
It then `updateTag(PUBLIC_CONFIG_TAG)`, and for `projects` also `updateTag(PUBLIC_PROJECTS_TAG)` plus
`revalidatePath("/projects", "layout")`.

#### 3.4.12 `/admin/settings/lists` — «القوائم»

`requireStaff(ADMIN_ROLES)`. The widest editing screen in the Back Office. Five reads:
`option_lists`, `option_items`, `project_types`, `ownership_scenarios`, `lead_statuses`.
Intro copy: `تعديل قيمة لا يغيّر المطالب المسجّلة سابقاً، لأن كل مطلب يحتفظ بالقيمة كما كانت. لإخفاء قيمة، ألغِ «نشط» بدل حذفها.`
**Nothing on this page deletes**; the only removal is unticking `نشط` (and, for a scenario picture, `إزالة الصورة`).

1. **`كيفاش تحب مشروعك يكون؟ (بطاقات نوع المشروع)`** — one card per `ownership_scenarios` row, with a
   live preview (the uploaded picture, else the `GrowthIcon` for its `icon_code`), the technical code,
   and an `إزالة الصورة` form (`clearScenarioImage`). `ScenarioFields` holds `النص للمواطن`,
   `بالفرنسية`, `شرح قصير (اختياري)` + its French twin, `نوع المشروع`, `نظام الغراسة`, `حالة الإنتاج`,
   `الترتيب`, `الرمز التقني` (creation only), the checkbox `ما يهمنيش النوع (اقترحولي)`, `نشط`, a radio
   set of five drawings (`زيتونة منتجة`, `قريبة للإنتاج`, `زيتونة صغيرة`, `أرض تتغرس`, `رسم عام`), a file
   input `صورة البطاقة (اختيارية)` and the alt-text pair. Actions: `saveScenario(id)` / `saveScenario(null)`.
2. **The option lists**, in a fixed display order: `desired_area`, `priority`, `down_payment`,
   `monthly_installment`, `goal`, `contact_time`, `plantation_system`, `property_type`, `tree_age`,
   `land_document`. Each item is its own inline `ActionForm` (`saveOptionItem(itemId, listKey)`) whose
   extra fields depend on `value_kind`: `money` → `المبلغ (د.ت)` + `حد أقصى (اختياري)`;
   `number_range` → `من (م²)` / `إلى (م²)`; `time_range` → `من` / `إلى` (`HH:MM`). A list whose
   `value_kind` is `code` gets **no add form** — the action also refuses creation with
   `قيم هذه القائمة ثابتة في النظام. يمكن تعديل نصوصها فقط.`
3. **`أنواع المشاريع`** — name, French name, sort order, `نشط`, description; creation additionally
   requires a `الرمز التقني` matching `^[a-z][a-z0-9_]{2,40}$`.
4. **`حالات الملفات`** — the system `stage` is shown read-only for an existing status and chosen from
   `STAGE_LABELS` when creating; editable fields are `الاسم`, `بالفرنسية`, `الترتيب`, `نشط`.
   `saveLeadStatus` refuses to deactivate the last active `new` status:
   `يجب أن تبقى حالة «جديد» واحدة نشطة على الأقل لتسجيل المطالب.`

Every successful write calls `done()`, which does `updateTag(PUBLIC_CONFIG_TAG)` and
`revalidatePath("/admin/settings/lists")`.

A new option item gets a generated code `${listKey}_${Date.now().toString(36)}`. Scenario picture uploads
go through `uploadSiteImage(supabase, "scenarios/<code>", file)`, and a picture without Arabic alt text is
refused (`اكتب وصفاً مختصراً للصورة (نص بديل بالعربية). إلزامي ما دامت للبطاقة صورة.`).

#### 3.4.13 `/admin/settings/media` — «صور الموقع»

`requireStaff(ADMIN_ROLES)`. Lists every `site_media` slot ordered by `group_key`, `sort_order`, with a
preview box using the slot's declared `aspect`, the slot key and aspect in LTR monospace, the label,
description and last-edit stamp. A counter reads `N من M مواضع فيها صورة.` Each slot has an
`ActionForm` (`saveSlotImage(slot)`, submit `رفع الصورة` or `حفظ`, pending `جارٍ الرفع…`) with a file
input (JPEG/PNG/WEBP/AVIF, `5 ميغا كحد أقصى`, `اتركه فارغاً لتغيير النص فقط`) and the alt text (≤160),
plus a separate `إزالة الصورة` form (`clearSlotImage`) when the slot is filled.
Uploads go to the public `site-media` bucket under `<slot>/<Date.now()>.<ext>` ("A fresh name on every
upload, so a replaced picture is never served from a cache"); only the URL is stored on the row. Alt text
is mandatory whenever a picture exists. Both actions `updateTag(PUBLIC_CONFIG_TAG)` and
`revalidatePath("/")`.

#### 3.4.14 `/admin/users` — «المستخدمون»

`requireStaff(ADMIN_ROLES)`; `isSuper = hasRole(session, ["super_admin"])`. Reads `profiles` with their
`user_roles` (oldest first) **and** `createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 })`
— the service-role client, used here for emails and `last_sign_in_at`. Profiles are filtered to staff:
no roles at all, or at least one role other than `client`.

`إضافة موظف` — `createStaffUser`: `الاسم الكامل` (3–120) and `البريد الإلكتروني`, plus the role
checkboxes; at least one role is required. The account is created with
`auth.admin.createUser({ email_confirm: true })` and a random `randomBytes(12).toString("base64url")`
password, then each role is granted through `admin_set_role` **as the signed-in admin** so the audit log
records who did it. The success message prints the temporary password in full:
`تم إنشاء حساب <email>. كلمة السر المؤقتة: <password> — سلّمها للموظف بطريقة آمنة، وسيغيّرها من صفحة «كلمة السر».`

Account list: name, `أنت` chip on your own row, `موقوف` chip when inactive, email, `آخر دخول: …` (or
`لم يدخل بعد`), and the role pills (`بدون دور` when none). `canManage = isSuper || !targetIsSuper`, so a
plain admin cannot manage a super admin's row at all. Managing opens a `<details>` `إدارة الحساب` with:

- `updateUserRoles` — the same checkbox set (`super_admin` is `disabled` for a non-super admin); it
  diffs against the current roles and calls `admin_set_role` once per changed role. It refuses
  `لا يمكنك سحب صلاحية الإدارة من حسابك.` when you would remove your own admin rights.
- `setUserActive` — `إيقاف الحساب` / `تفعيل الحساب` (hidden on your own row). Calls
  `admin_set_user_active`, then bans/unbans at the auth layer with
  `ban_duration: active ? "none" : "876000h"` (COM-10). A failed ban is only `console.error`-ed.
- `resetUserPassword` — `كلمة سر مؤقتة جديدة`; refuses a super admin's reset for a non-super admin,
  sets a fresh random password and writes `log_action` with `auth.password_reset`. The new password is
  returned in the success message.

Role errors are translated by `roleError()`: `لا يمكن سحب الدور من آخر Super Admin.`,
`دور Super Admin يمنحه أو يسحبه Super Admin فقط.`, `لا تملك صلاحية تعديل هذا الدور.`

There is **no account deletion**. The intro says so: `إيقاف حساب يقطع الوصول فوراً ولا يحذف أي ملف أو عملية.`

#### 3.4.15 `/admin/audit` — «سجل العمليات»

`requireStaff(ADMIN_ROLES)`, `PAGE_SIZE = 50`. Reads `audit_logs` (`id, occurred_at, actor_id, action,
entity, entity_id, old_data, new_data, reason, ip`) with `{ count: "exact" }`, newest first, plus all
`profiles` for the actor select. Filters (`method="get"`): `entity` (only accepted when the value is a
key of the 30-entry `ENTITY_LABELS` map), `action` (same for the 21-entry `ACTION_LABELS` map), `actor`
(36-char uuid shape), `from` / `to` (dates, compared at `+01:00` day bounds), `page`. Buttons `بحث` and
`مسح`. Total line: `N عملية`.

Each entry renders the action label, the entity label, the first eight characters of the entity id, the
timestamp, the actor's name (`مستخدم` when unknown, `زائر / النظام` when there is no actor) and the IP.
A `reason` is shown in its own highlighted paragraph prefixed `السبب:`. When both `old_data` and
`new_data` exist, `changedFields()` diffs them (ignoring `updated_at`) into a `الحقل / قبل / بعد` table;
otherwise the raw payload is offered behind a `التفاصيل` disclosure as pretty-printed JSON.
Sub-line: `من قام بالعملية، متى، ماذا تغيّر، ولماذا. السجل لا يُعدَّل ولا يُحذف.`
The page is read-only: no action, no export.

#### 3.4.16 `/admin/account` — «كلمة السر»

`requireStaff()` (any staff). Shows `fullName · email · roles`. One form (`changePassword`) with
`كلمة السر الحالية`, `كلمة السر الجديدة` (`minLength={10}`, hint `10 أحرف على الأقل.`) and
`تأكيد كلمة السر الجديدة`. The action re-verifies the current password with
`auth.signInWithPassword({ email: session.email, password: current })` before calling
`auth.updateUser({ password })`, then writes `log_action` with `auth.password_changed`. It refuses a new
password equal to the current one and translates Supabase's "weak" error to
`كلمة السر ضعيفة. استعمل أحرفاً وأرقاماً ورموزاً.`

#### 3.4.17 `/admin/login` and `/admin/setup`

`/admin/login` redirects to `/admin` when a staff session already exists. `LoginForm` is a client
component with `next` as a hidden field, `البريد الإلكتروني`, `كلمة السر` and the button `دخول` /
`جارٍ الدخول…`. `signIn` logs `auth.login_failed` on bad credentials, and on a valid sign-in that is not
staff (inactive profile or only the `client` role) it signs the user back out, logs `auth.login_denied`
and returns `هذا الحساب لا يملك صلاحية الدخول إلى الـBack Office، أو تم إيقافه.` Success logs
`auth.login` and redirects through `safeNext()`, which only accepts a path starting with `/admin`, not
`//`, and not `/admin/login`. `signOut` logs `auth.logout` and redirects to `/admin/login`.

`/admin/setup` is a local bootstrap screen. `setupAllowed(token)` returns false in production, false
without `ADMIN_SETUP_TOKEN` in the environment or without a token in the URL, false when the `Host`
header is not `localhost` / `127.0.0.1` / `[::1]`, and otherwise compares the token with
`timingSafeEqual`. When it returns false the page calls `notFound()`. It lists the emails that already
hold `super_admin` and lets the owner set that account's password (minimum 8), unbanning it at the same
time and inserting an `auth.password_reset` audit row with `{ email, via: "setup_page" }`. When no super
admin exists it prints the `npm run admin:create` command instead of a form.

---

### 3.5 THE ADMIN DASHBOARD (`/admin`) — audit section 11

`src/app/admin/(panel)/page.tsx`, `requireStaff()` with no role gate, `metadata.title = "لوحة القيادة"`.

The file's own header states what it is: *"a work queue, not a second analytics page"*, replacing a
former screen of "eighteen charts, every one of them already on /admin/analytics". And: *"Every count is
a query against a table that exists. Reservations, visits, contracts and payments have no table yet, so
they are not counted here and no number stands in for them."*

#### 3.5.1 Role flags computed at the top

| Flag | Expression |
|---|---|
| `canSeeCrm` | `hasRole(session, CRM_READ_ROLES)` |
| `canSeeLand` | `hasRole(session, LAND_OFFER_ROLES)` |
| `isAdmin` | `hasRole(session, ADMIN_ROLES)` |
| `canFollowUp` | `hasRole(session, ["commercial","admin","super_admin"])` |
| `ownFilesOnly` | `hasRole(session,["commercial"]) && !hasRole(session,["admin","super_admin","finance","legal"])` |

#### 3.5.2 Reads

`today = tunisToday()` (Africa/Tunis), `endOfToday = "<today>T23:59:59+01:00"`. Seven parallel reads,
five of them conditional:

| Read | Condition | Purpose |
|---|---|---|
| `lead_statuses` (`id, stage, label_ar, is_stage_default`) | `canSeeCrm` | find the default `new` status |
| `rpc("crm_demand_stats", {})` | `canSeeCrm` | the four figures at the bottom |
| `persons` count where `assigned_to is null` | `isAdmin` | `ملفات بلا مسؤول` |
| `land_offers` count where `status = 'under_study'` | `canSeeLand` | `أراضٍ معروضة علينا قيد الدراسة` |
| `contact_attempts` (`person_id, next_follow_up_at`) where `created_by = session.id`, `next_follow_up_at` not null, `<= endOfToday` and `>= daysAgo(today, 30)`, ascending, `limit(100)` | `canFollowUp` | my due follow-ups |
| `parcels` (`id, project_id, code, status, olive_tree_count, area_m2, cash_price_millimes, updated_at`) ordered by `updated_at` ascending | always | both lot queues |
| `projects` (`id, code, name`) | always | naming the lots' offers |

A follow-up read is then made for the default `new` status: `persons` count where `status_id = <that id>`.
Persons named by the due attempts are fetched with `.in("id", [...])`, and the earliest due date per
person wins. Prices for the lot queues come from one `staff_project_parcel_prices` call per distinct
offer id, merged into a single map.

#### 3.5.3 What is on the screen, in order

1. **`?denied=1` banner** — `لا تملك صلاحية الوصول إلى تلك الصفحة.` (`role="alert"`, danger). This is
   where `requireStaff(roles)` sends a user who lacks a role.
2. **`SectionHeader`** — title `لوحة القيادة`, description
   `مرحباً <name>. هذي الحاجات اللي تستنّى فيك اليوم.` with ` الأرقام تخص الملفات المسندة إليك.` appended
   for `ownFilesOnly`. Action link `التحليلات وخريطة الطلب` → `/admin/analytics`, shown only when `canSeeCrm`.
3. **`يحتاج تدخّل`** — up to three `StatTile`s, each carrying its own filter into the list it counts
   (`emphasis` when non-zero, `quiet` when zero). The section is omitted when all three are gated away.

   | Tile | Value | Note | Link |
   |---|---|---|---|
   | `ملفات في «<default new status label>»` | persons with that status | `ما تكلّمنا معاهم حتى مرة.` | `/admin/leads?status_id=<id>&people=1` |
   | `ملفات بلا مسؤول` (admins) | persons with `assigned_to is null` | `لازم تتسند لكوميرسيال.` | `/admin/leads?assigned_to=none&people=1` |
   | `أراضٍ معروضة علينا قيد الدراسة` (land roles) | `land_offers` in `under_study` | `تستنّى قرار قانوني وفني.` | `/admin/land-offers?status=under_study` |

   Both lead tiles append `people=1` on purpose: "the number on the tile and the number on the page it
   opens are then the same number."
4. **`متابعاتي المستحقة`** (`canFollowUp` only) — subtitle
   `مواعيد اللي حطّيتها أنت، أقدم واحد الأول.` One row per person, earliest first; each row opens
   `/admin/leads/<personId>` and carries a pill reading `متأخرة` (danger) or `اليوم` (warning) with the
   due date, plus the person's status label. Empty: `ما عندك حتى متابعة مستحقة اليوم.`
5. **`قطع تستنّى قرار`** — lots whose `status === "interested"`, subtitle
   `حريف مهتم بالقطعة والقرار مازال ما تاخذش. أقدم واحدة الأول.` Each row opens
   `/admin/projects/<projectId>/parcels/<lotId>` titled `<offer name> · <lot code>`, with the status pill
   and `N زيتونة`. It is the only queue with a "more" link:
   `كل القطع المهتم بيها` → `/admin/projects/parcels?status=interested`. Empty text differs by cause —
   `ما فماش قطع بعد: العرض يتقسّم لقطع من صفحة العرض.` when there are no lots at all, otherwise
   `ما فماش قطعة تستنّى قرار.`
6. **`قطع بلا سعر`** — lots that are not `withdrawn` and whose `effectiveParcelFigures().cash` is falsy,
   subtitle `القطعة ما ينجّمش يتحسبلها سعر، والعرض ما يتباعش قبل ما يتحدّد. كل سطر يحلّ القطعة نفسها.`
   Each row carries a warning pill `بلا سعر` and the tree count. The comment is explicit that whether a
   lot has a price is "the database's answer, never a sum done here".
7. **`الأرقام`** (`canSeeCrm` only) — four small tiles from `crm_demand_stats` over the whole period:
   `مطالب الاستثمار` (with `N منها مكرّرة`), `زيتونات مطلوبة` (`الحد الأدنى لكل اختيار`), `أشخاص`
   (`رقم هاتف واحد لكل شخص`), `اليوم` (`N في آخر 7 أيام`). Description:
   `المجموع من يوم ما فتحنا. التفصيل والخريطة في «التحليلات».` Action link `التفصيل ←` → `/admin/analytics`.

#### 3.5.4 Queue mechanics

`PREVIEW = 6`. The local `Queue` component takes the full `count` and the number actually rendered
(`shown`), prints the count as a pill beside the title, renders the rows in a `panel` list and, when
`count > shown`, a trailing line `و<N> أخرى.` — so the overflow number is never a guess. A zero count
renders the `EmptyState` instead of the list, and the "more" link is hidden. `QueueRow` is one `<Link>`
per row that opens the record itself, never a list to be searched again.

The dashboard has **no filters, no search, no sorting controls, no pagination, and no write action of
any kind.** Every interactive element is a link into another screen.

---

### 3.6 Sections that exist but hold no data, and routes that are not there

| Section named in the code | Route file | Nav row | Evidence |
|---|---|---|---|
| `الحجوزات` (reservations) | none | none | `nav-model.ts` lines 77–80 and `layout.tsx` lines 76–80 name it as deliberately removed |
| `الزيارات` (visits) | none | none | same |
| `العقود` (contracts) | none | none | same |
| `الدفوعات` (payments) | none | none | same |
| `الخدمات الفلاحية` (services) | none | none | same |

The layout comment records both the count and the reason: *"It briefly had eleven rows, five of which —
الحجوزات، الزيارات، العقود، الدفوعات، الخدمات الفلاحية — opened onto a page that said the domain was not
built yet… those five are out of the nav until they have tables behind them; the plan in
docs/plan-rebuild.md (P6) is where they come back, and restoring a row is one line here."*

Checked rather than assumed:

- `ls src/app/admin/(panel)/` returns exactly `account, admin-nav.tsx, analytics, audit, land-offers,
  layout.tsx, leads, page.tsx, pricing, projects, settings, users` — no such directories.
- `git log --all --name-only -- "src/app/admin/(panel)/reservations" …` (all five paths) returns nothing:
  **those route files were never committed in this repository's history**, so "recently removed" is
  accurate only for the *nav rows*, not for tracked route files.
- `git diff --name-status HEAD -- src/app/admin src/components/admin` shows only `M` and untracked `??`
  entries — **no deletion is pending in the working tree either**.
- `src/components/admin/section-not-open.tsx` (44 lines, untracked) is the page body those five sections
  used, and it is **imported nowhere**: `grep -rn "SectionNotOpen|section-not-open" src/` matches only its
  own definition. It still carries the copy `مازال ما تفتحش`,
  `القسم موجود، الدومان مازال ما تفتحش.` and
  `ما ثمّة حتى جدول في قاعدة البيانات لهذا القسم إلى حدّ الآن، وما نعرضوش أرقاماً مخترعة.`
- `src/components/admin/nav-icons.tsx` still defines the five icons `reservations`, `visits`,
  `contracts`, `payments`, `services`, and `AdminIconKey` in `nav-model.ts` still lists them; no row uses
  them. 18 icon keys are defined, 13 are reachable.

`docs/plan-rebuild.md` line 75 still describes a ten-section Back Office including
**الحجوزات · الزيارات · العقود · الدفوعات · الخدمات الفلاحية** and **الرسائل** ("21 رسالة راقدة ما
يشوفهم حتى شاشة"). Line 69 puts the rebuild at **P7** and the operational tables at **P6**. The code
disagrees with that document today: four nav sections, no messages screen, and no route for any of the
five domains.

`README.md` line 50 describes `src/app/admin/(panel)/` as "dashboard, leads (CRM), land offers, modules,
settings, lists, users, audit" — it omits `analytics`, `projects`, `projects/parcels`, `pricing`,
`settings/media` and `account`, all of which exist as routes.

---

### 3.7 Server Action inventory

| Action | File | Role gate | Writes through |
|---|---|---|---|
| `assignPersons` | `leads/actions.ts` | `ADMIN_ROLES` | RPC `admin_assign_persons` |
| `updateStatus` | `leads/[personId]/actions.ts` | `commercial`, `admin`, `super_admin` | `persons.update` (RLS decides) |
| `assignPerson` | same | `ADMIN_ROLES` | RPC `admin_assign_persons` |
| `addContactAttempt` | same | `commercial`, `admin`, `super_admin` | `contact_attempts.insert` |
| `addNote` | same | same | `person_notes.insert` |
| `saveProject` | `projects/actions.ts` | `finance`, `admin`, `super_admin` | `projects.insert/update` |
| `saveParcel` | same | same | `parcels.insert/update` |
| `saveOfferSpacingClasses` | same | `PRICE_ROLES` + written reason | RPC `staff_save_project_spacing_classes` |
| `addProjectCost` | same | `finance`, `admin`, `super_admin` | `project_costs.insert` |
| `addProjectPicture` / `setProjectCover` / `moveProjectPicture` / `removeProjectPicture` | same | same | `project_media` + the `project-media` bucket |
| `reviewLandOffer` | `land-offers/[id]/actions.ts` | `LAND_OFFER_ROLES` | RPC `review_land_offer` |
| `saveSpacingClass` / `deleteSpacingClass` | `pricing/actions.ts` | `PRICE_ROLES` + reason | RPCs `staff_save_spacing_class`, `staff_delete_spacing_class` |
| `savePricingRule` / `deletePricingRule` | same | same | `staff_save_pricing_rule` (redefined in `0046_annual_fee_save.sql`), `staff_delete_pricing_rule` |
| `saveCostItem` / `deleteCostItem` | same | same | `staff_save_cost_item`, `staff_delete_cost_item` |
| `saveMarkups` | same | same | `staff_save_financing_markups` |
| `saveProjectDownPercents` / `saveProjectSpacingClasses` | same | same | `staff_save_project_down_percents`, `staff_save_project_spacing_classes` |
| `updateSetting` | `settings/actions.ts` | `ADMIN_ROLES` | `settings.update` |
| `setModuleState` | `settings/modules/actions.ts` | `ADMIN_ROLES` | `feature_flags.update` |
| `saveOptionItem` / `saveProjectType` / `saveScenario` / `clearScenarioImage` / `saveLeadStatus` | `settings/lists/actions.ts` | `ADMIN_ROLES` | direct table writes + `site-media` uploads |
| `saveSlotImage` / `clearSlotImage` | `settings/media/actions.ts` | `ADMIN_ROLES` | `site_media` + the `site-media` bucket |
| `createStaffUser` / `updateUserRoles` / `setUserActive` / `resetUserPassword` | `users/actions.ts` | `ADMIN_ROLES` (+ `super_admin` for super-admin targets) | service-role `auth.admin.*` and RPCs `admin_set_role`, `admin_set_user_active` |
| `changePassword` | `account/actions.ts` | `requireStaff()` | `auth.updateUser` |
| `signIn` / `signOut` | `login/actions.ts` | none (that is the point) | `auth.signInWithPassword` / `signOut` |
| `setSuperAdminPassword` | `setup/actions.ts` | token + localhost + non-production | service-role `auth.admin.updateUserById` |

Every action returns the shared `ActionResult = { ok, message } | null` consumed by
`src/components/admin/action-form.tsx`, which renders the message as `role="status"` or `role="alert"`
under the fields and disables the submit button while pending. `setProjectCover`, `moveProjectPicture`,
`removeProjectPicture`, `clearScenarioImage`, `clearSlotImage` and `setUserActive`'s sibling one-button
forms return `void` or are used as bare `<form action={…}>` — they surface no message at all.

**Cache invalidation used by admin writes:** `PUBLIC_CONFIG_TAG` (`"public-config"`, `src/lib/config.ts`)
for settings, lists, modules, media and spacing classes; `PUBLIC_PROJECTS_TAG` plus
`revalidatePath("/projects", "layout")` (`expirePublicProjects()` in `projects/actions.ts`) for any
project, parcel, picture or spacing-class change, and for `pricing.default` and the `projects` flag.
Internal costs deliberately skip it (`PRJ-03`).

---

## OBSERVATIONS

These are factual remarks about the code as it stands. None of them is a proposal.

1. **Nav label and page title disagree on three routes.** `/admin/leads` is `الطلبات` in the nav and
   `مطالب الاستثمار` in `metadata.title` and in its `<h1>`; `/admin/land-offers` is
   `أراضٍ معروضة علينا` in the nav and `عروض الأراضي` in both its title and `<h1>`; `/admin/settings` is
   `الإعدادات` in the nav and `الإعدادات والنصوص` in its title and `<h1>`. The breadcrumb uses the nav
   label, so a reader on `/admin/leads` sees `الطلبات` in the trail and `مطالب الاستثمار` as the heading.

2. **`/admin/users` and `/admin/audit` are nested under `الإعدادات` in the nav but are not under
   `/admin/settings` as URLs.** `trailFor()` walks path prefixes, so their breadcrumb reads
   `لوحة القيادة · المستخدمون` with no `الإعدادات` crumb, and the sidebar's parent-child relationship is
   not reproduced in the trail.

3. **`SectionNotOpen` is dead code.** 44 lines, untracked, imported nowhere. The five icon shapes
   `reservations`, `visits`, `contracts`, `payments`, `services` in `nav-icons.tsx` and their keys in
   `AdminIconKey` are likewise unreachable.

4. **The leads list has a filter the database cannot apply.** `request_kind` is parsed, put in the URL,
   forwarded to `crm_search_requests` (which ignores unknown keys) and then re-applied in JavaScript over
   the 50 rows of the current page. The page's totals, its `pageCount` and its "N سطر في هذه الصفحة"
   line therefore describe different sets while that filter is on; the page says so in a callout, the
   bulk bar says "حتى N", and the CSV export avoids the problem by applying the filter over every batch.
   The fix is drafted at `supabase/pending/bb_crm_offer_columns.sql` and is not applied.

5. **Offer columns are read twice, by two different paths.** `/admin/leads` re-reads
   `interest_requests` through `offerSnapshots()` in chunks of 100 for rows the RPC already returned,
   while `/admin/leads/[personId]` gets the same columns from its own `select("*")`. Both exist because
   `public.crm_requests` is a view frozen before `0049_offer_intake.sql`.

6. **Three pages repeat the same role expression verbatim.** `ownFilesOnly` —
   `hasRole(session,["commercial"]) && !hasRole(session,["admin","super_admin","finance","legal"])` — is
   written out in `(panel)/page.tsx:39`, `leads/page.tsx:329` and `analytics/page.tsx:75`, and it is not
   in `src/lib/auth.ts`. Similarly `WRITE_ROLES = ["finance","admin","super_admin"]` is declared
   separately in four files, and `projects/[id]/page.tsx` declares `WRITE_ROLES` and `FINANCE_ROLES` with
   identical membership.

7. **The same UUID regex literal is declared in six admin files** (`leads/page.tsx` via `filters.ts`,
   `leads/[personId]/page.tsx`, `projects/actions.ts`, `projects/parcels/page.tsx`,
   `projects/[id]/page.tsx`, `projects/[id]/parcels/[parcelId]/page.tsx`, `pricing/page.tsx`), and
   `audit/page.tsx` uses a looser one (`/^[0-9a-f-]{36}$/i`).

8. **`/admin/projects`, `/admin/projects/parcels`, `/admin/projects/[id]` and the lot page use
   `requireStaff()` with no role argument.** Read access to offers, lots, their prices and the
   matching list is therefore governed entirely by RLS, not by an application-level role check — unlike
   the CRM, land and pricing pages, which name their roles. The `costs` tab is the one place under
   `/admin/projects` that names a role.

9. **The dashboard reads every parcel of every project on every page load**
   (`supabase.from("parcels").select(...)` with no filter and no limit) and then issues one
   `staff_project_parcel_prices` RPC per distinct project id before rendering. `/admin/projects` reads all
   parcels too, and `/admin/projects/parcels` reads `parcels.select("*")` for the whole filtered set with
   no pagination.

10. **`/admin/projects/parcels` filters in SQL but then drops rows in JavaScript**
    (`rows = parcels.data.filter(p => offerById.has(p.project_id))`), so its four stock tiles and its
    table describe the visible rows, while nothing on the page indicates that rows were dropped.

11. **Temporary passwords are returned in an action result and rendered into the page.**
    `createStaffUser` and `resetUserPassword` put the generated password in the success `message`, which
    `ActionForm` renders as ordinary text on `/admin/users`.

12. **`/admin/users` calls the service-role client from a page component**
    (`createAdminClient().auth.admin.listUsers({ perPage: 1000 })`). It is the only read path in the panel
    that bypasses RLS, and it is hard-capped at 1000 accounts; `listSuperAdminEmails()` in the setup
    action caps at 200.

13. **`setModuleState` hard-codes one product rule.** The `projects` flag can never be set to `public`
    from the Back Office, and the refusal message is a string in `settings/modules/actions.ts` rather
    than a value in `settings` or `feature_flags`.

14. **Deletion is almost absent from the Back Office.** There is no delete for a project, a parcel, a
    project cost, a setting, an option item, a project type, a scenario, a lead status or a user account.
    The only delete actions are `deleteSpacingClass`, `deleteCostItem` and `deletePricingRule` on
    `/admin/pricing` (each behind a written reason) and `removeProjectPicture` /
    `clearScenarioImage` / `clearSlotImage` for media. Retirement elsewhere is a status or an `is_active`
    flag.

15. **The written-reason discipline is not uniform.** `/admin/pricing` and the offer's `التسعير` tab
    require a `ReasonField` on every write; `/admin/settings`, `/admin/settings/lists`,
    `/admin/settings/modules`, `/admin/users` and the offer's `البطاقة` tab do not, although
    `/admin/audit` renders a `السبب:` block for any row that carries one.

16. **The bulk-assign bar is `hidden … md:flex` and the selection checkbox column is
    `mobile: "hidden"`,** so on a phone an admin sees the leads list but has no way to select or transfer
    files. The confirmation is a native `window.confirm`, the only such dialog in the admin half.

17. **`parseLeadFilters` accepts `assigned_to` for every role** even though the control is rendered only
    for admins; a non-admin who edits the URL gets the parameter forwarded to the RPC, which is
    `security invoker`, so RLS is the only thing narrowing the result.

18. **`/admin/pricing`'s `نِسَب التسبقة والمدد` section is read-only and points at another role's
    screen.** The values live in `option_items` and are edited at `/admin/settings/lists`, which requires
    `ADMIN_ROLES`; a `finance` user can open `/admin/pricing`, read the link `تعديل نِسَب التسبقة في
    «القوائم»`, and be redirected to `/admin?denied=1` on following it.

19. **The `القطع` cross-offer page and the offer's `القطع` tab share `LotsTable` but not their stock
    strip.** `/admin/projects/parcels` renders four bare `StatTile`s, while `/admin/projects/[id]` renders
    `StockStrip`, which additionally names the statuses each figure summed and prints the reservations
    caveat. The same four numbers therefore carry their provenance on one screen and not on the other.

20. **`projects/stock.ts` builds `STOCK_BUCKET_SOURCES` by mutating four empty arrays at module load**
    (lines 37–45), deriving them from `STOCK_BUCKET_OF`; `bucketSourceText()` then joins the Arabic
    status labels. An unknown status added by a later migration is silently counted as `available`
    (line 80) and appears in `byStatus` under its raw code via `parcelStatusLabel()`.
