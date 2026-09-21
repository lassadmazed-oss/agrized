## 12. API, SERVER ACTIONS, FUNCTIONS, COMPONENTS AND DATA FLOW

Scope of this file: sections **22** (API / Server Actions / RPCs), **23** (important reusable functions, non-money
half), **24** (component map) and **25** (data flow UI → database).

Reading conventions used below:

- Every path is repository-relative. Route groups are written as the filesystem spells them:
  `src/app/(public)/…`, `src/app/admin/(panel)/…`.
- "RPC" means a PostgreSQL function called by name through PostgREST (`supabase.rpc("name", …)`).
- Arabic copy and enum values are quoted verbatim.
- Migrations are cited by their number; when a function was redefined later, the **latest** definition is the
  one described and the earlier ones are named.

**Working-tree caveat.** The brief warns that another process was editing `src/app/(public)/` while this audit
ran. Every file under that directory was read in full or in large contiguous ranges and each one parsed as a
complete module (matching braces, terminating `}` on the last component/function). No file under
`src/app/(public)/` appeared truncated or mid-edit at read time. Nothing was observed that suggests the state
described here is a partial edit, but the public pages are the one area where that risk exists.

---

## 22. API / SERVER ACTIONS

There is **no REST/JSON API surface of its own**. The application exposes exactly three kinds of server entry
points:

1. **Server Actions** (`"use server"` modules) — 17 files, 46 exported actions.
2. **Route Handlers** (`route.ts`) — 2, both `GET`, both Back Office only.
3. **Database RPCs** — called from Server Actions, Route Handlers and Server Components.

No `POST`/`PUT`/`DELETE` route handler exists anywhere in `src/app`. No `/api` directory exists.

### 22.1 Server Action inventory

| # | Action | File | Roles / gate | Writes through |
|---|---|---|---|---|
| 1 | `quoteStart` | `src/app/(public)/start/actions.ts` | none (public) | RPC `public_tree_quote` (read-only) |
| 2 | `submitInterest` | `src/app/(public)/register/actions.ts` | `interest_form` flag | RPC `submit_interest_request` (service-role) |
| 3 | `submitOfferInterest` | `src/app/(public)/projects/[code]/offer-actions.ts` | `projects` flag ≠ closed | RPC `submit_offer_request` (service-role) |
| 4 | `submitLandOffer` | `src/app/(public)/land/actions.ts` | `land_offers` flag | RPC `submit_land_offer` (service-role) + storage signed upload URLs |
| 5 | `finalizeLandOfferFiles` | `src/app/(public)/land/actions.ts` | **none** (2-hour window on the offer row) | direct `land_offer_files` upsert (service-role) |
| 6 | `signIn` | `src/app/admin/login/actions.ts` | none | `auth.signInWithPassword` + `audit_logs` |
| 7 | `signOut` | `src/app/admin/login/actions.ts` | none | `auth.signOut` + `audit_logs` |
| 8 | `setupAllowed` | `src/app/admin/setup/actions.ts` | dev + localhost + `ADMIN_SETUP_TOKEN` | read only |
| 9 | `listSuperAdminEmails` | `src/app/admin/setup/actions.ts` | **none of its own** | read `user_roles` + `auth.admin.listUsers` |
| 10 | `setSuperAdminPassword` | `src/app/admin/setup/actions.ts` | `setupAllowed()` | `auth.admin.updateUserById` + `audit_logs` |
| 11 | `changePassword` | `src/app/admin/(panel)/account/actions.ts` | `requireStaff()` | `auth.updateUser` + RPC `log_action` |
| 12 | `assignPersons` | `src/app/admin/(panel)/leads/actions.ts` | `ADMIN_ROLES` | RPC `crm_search_requests` + RPC `admin_assign_persons` |
| 13 | `updateStatus` | `src/app/admin/(panel)/leads/[personId]/actions.ts` | `["commercial","admin","super_admin"]` | `persons` update (RLS) |
| 14 | `assignPerson` | same file | `ADMIN_ROLES` | RPC `admin_assign_persons` |
| 15 | `addContactAttempt` | same file | `["commercial","admin","super_admin"]` | `contact_attempts` insert |
| 16 | `addNote` | same file | `["commercial","admin","super_admin"]` | `person_notes` insert |
| 17 | `reviewLandOffer` | `src/app/admin/(panel)/land-offers/[id]/actions.ts` | `LAND_OFFER_ROLES` | RPC `review_land_offer` |
| 18 | `saveProject` | `src/app/admin/(panel)/projects/actions.ts` | `["finance","admin","super_admin"]` | `projects` insert/update |
| 19 | `saveParcel` | same file | same | `parcels` insert/update |
| 20 | `saveOfferSpacingClasses` | same file | `PRICE_ROLES` + written reason | RPC `staff_save_project_spacing_classes` |
| 21 | `addProjectCost` | same file | `["finance","admin","super_admin"]` | `project_costs` insert |
| 22 | `addProjectPicture` | same file | same | storage `project-media` + `project_media` insert |
| 23 | `setProjectCover` | same file | same | `project_media` update ×2 |
| 24 | `moveProjectPicture` | same file | same | `project_media` update (re-sequence) |
| 25 | `removeProjectPicture` | same file | same | `project_media` delete + storage remove |
| 26 | `saveSpacingClass` | `src/app/admin/(panel)/pricing/actions.ts` | `PRICE_ROLES` + reason | RPC `staff_save_spacing_class` |
| 27 | `deleteSpacingClass` | same file | same | RPC `staff_delete_spacing_class` |
| 28 | `savePricingRule` | same file | same | RPC `staff_save_pricing_rule` |
| 29 | `deletePricingRule` | same file | same | RPC `staff_delete_pricing_rule` |
| 30 | `saveCostItem` | same file | same | RPC `staff_save_cost_item` |
| 31 | `deleteCostItem` | same file | same | RPC `staff_delete_cost_item` |
| 32 | `saveMarkups` | same file | same | RPC `staff_save_financing_markups` |
| 33 | `saveProjectDownPercents` | same file | same | RPC `staff_save_project_down_percents` |
| 34 | `saveProjectSpacingClasses` | same file | same | RPC `staff_save_project_spacing_classes` |
| 35 | `updateSetting` | `src/app/admin/(panel)/settings/actions.ts` | `ADMIN_ROLES` | `settings` update |
| 36 | `setModuleState` | `src/app/admin/(panel)/settings/modules/actions.ts` | `ADMIN_ROLES` | `feature_flags` update |
| 37 | `saveSlotImage` | `src/app/admin/(panel)/settings/media/actions.ts` | `ADMIN_ROLES` | storage `site-media` + `site_media` update |
| 38 | `clearSlotImage` | same file | `ADMIN_ROLES` | `site_media` update |
| 39 | `saveOptionItem` | `src/app/admin/(panel)/settings/lists/actions.ts` | `ADMIN_ROLES` | `option_items` insert/update |
| 40 | `saveProjectType` | same file | `ADMIN_ROLES` | `project_types` insert/update |
| 41 | `saveScenario` | same file | `ADMIN_ROLES` | `ownership_scenarios` insert/update + storage |
| 42 | `clearScenarioImage` | same file | `ADMIN_ROLES` | `ownership_scenarios` update |
| 43 | `saveLeadStatus` | same file | `ADMIN_ROLES` | `lead_statuses` insert/update |
| 44 | `createStaffUser` | `src/app/admin/(panel)/users/actions.ts` | `ADMIN_ROLES` (+ super for `super_admin`) | `auth.admin.createUser` + RPC `admin_set_role` |
| 45 | `updateUserRoles` | same file | `ADMIN_ROLES` | RPC `admin_set_role` per changed role |
| 46 | `setUserActive` | same file | `ADMIN_ROLES` | RPC `admin_set_user_active` + `auth.admin.updateUserById` ban |
| 47 | `resetUserPassword` | same file | `ADMIN_ROLES` (+ super for a super target) | `auth.admin.updateUserById` + RPC `log_action` |

The shared return type of the Back Office forms is
`ActionResult = { ok: boolean; message: string } | null`, declared in
`src/components/admin/action-form.tsx` and consumed by `useActionState` inside `<ActionForm>`.

---

### 22.2 Public Server Actions, in detail

#### `quoteStart(input)` — `src/app/(public)/start/actions.ts`

| | |
|---|---|
| **Called from** | `src/app/(public)/start/start-chooser.tsx` (client), inside a 250 ms debounced `useEffect` (`QUOTE_DEBOUNCE_MS`) keyed on spacing class, tree count, payment mode, down-percent id and duration id |
| **Input** | `{ spacingClassId: uuid; trees: int ∈ [1, 2_147_483_647] \| null; paymentMode: "cash" \| "installments" \| null; downPercentOptionId: uuid \| null; durationOptionId: uuid \| null }` |
| **Validation** | Zod `quoteSchema`. Failure returns `null` — the caller shows the previous figures, never an error |
| **Database** | `publicTreeQuote()` → RPC `public_tree_quote(p_spacing_class, p_trees, p_payment_mode, p_down_percent_option_id, p_duration_option_id)` through the **request-scoped** client (`createClient()`), so the caller's JWT reaches the RPC and `app.module_open('pricing')` can answer `true` for signed-in staff on an `internal` flag |
| **Output** | `TreeQuote \| null` |
| **Errors** | Any thrown error is caught in `publicTreeQuote`, logged with `console.error("public_tree_quote failed", …)`, and `null` is returned |
| **Side effects** | None. Read-only, writes nothing, revalidates nothing |

Race handling lives in the caller, not the action: `quoteSeq` in `start-chooser.tsx` increments per request and
a stale answer is dropped.

#### `submitInterest(input)` — `src/app/(public)/register/actions.ts`

| | |
|---|---|
| **Called from** | `src/app/(public)/register/register-wizard.tsx`, `submit()` inside `startTransition` |
| **Gate** | `flagState(config, "interest_form")`; `disabled`, or `internal` without a staff session → `{ ok:false, message:"التسجيل غير متاح حالياً. حاول لاحقاً." }` |
| **Input** | 22 fields — identity (`fullName`, `phone`, `whatsappSame`, `whatsapp`, `email`), place (`governorateId`, `investAnywhere`, `investGovernorateIds[≤30]`), calculator answers carried from `/start` (`treeCountOptionId`, `treeCountCustom`, `scenarioId`, `spacingClassId`, `paymentMode`, `downPercentOptionId`, `durationOptionId`), `goalOptionId`, `wantsVisit`, `wantsBankFinancing`, `contactChannel`, `contactTimeOptionId`, `consent: literal(true)`, `website` (honeypot), `source` |
| **Validation, in order** | ① module flag ② Zod `interestSchema`, including a `.refine()` that `treeCountOptionId` and `treeCountCustom` are mutually exclusive ③ honeypot `website` non-empty → generic failure ④ `calculatorGap()` — the same pure function `/start` uses to decide whether the continue button is enabled ⑤ `normalizePhone()` for the phone and, when `whatsappSame` is false, for WhatsApp |
| **Database** | service-role client `createAdminClient(auditHeaders(requestHeaders))` → RPC `submit_interest_request(p jsonb)` |
| **Output** | `{ ok:true; requestNo }` or `{ ok:false; message; step?; calculator? }` |
| **Error mapping** | `ERROR_STEP` maps 12 intake codes to a wizard step (1…6) so the wizard reopens the offending screen; `CALCULATOR_ERRORS` (12 codes: `invalid_tree_choice`, `invalid_tree_custom`, `invalid_spacing`, `invalid_payment_mode`, `invalid_down_payment_percent`, `down_payment_percent_required`, `invalid_duration`, `duration_required`, `invalid_scenario`, `single_scenario_only`, `scenario_required`, `invalid_project_type`) instead set `calculator: true`, which makes the wizard link back to `/start` rather than reopen a step. Unknown codes are `console.error`-ed; the Arabic text always comes from `intakeErrorMessage()` |
| **Side effects** | One `persons` row (upserted on `phone_e164`), one `interest_requests` row, possibly one `person_assignments` row (round-robin), one `notification_outbox` row (`lead.confirmation`), one `app.submission_throttle` row |

The `consent_text` sent to the RPC is `settingText(config, "legal.consent_text", …)` — the text the visitor
actually saw is snapshotted, not a constant.

#### `submitOfferInterest(input)` — `src/app/(public)/projects/[code]/offer-actions.ts`

| | |
|---|---|
| **Called from** | `src/app/(public)/projects/[code]/offer-interest-form.tsx` |
| **Gate** | `(await moduleAccess(config, "projects")) === "closed"` → `intakeErrorMessage("offer_not_available")` = «هذا العرض ما عادش متوفّر. شوف بقية العروض أو سجّل مطلبك من الحاسبة.» Staff previewing an `internal` module **may** submit |
| **Input** | `{ projectId: uuid; trees: positive int; fullName; phone; whatsappSame; whatsapp; email; governorateId; contactChannel; contactTimeOptionId; consent: literal(true); website; source }` — **no calculator answer travels here at all** |
| **Database** | service-role client → RPC `submit_offer_request(p jsonb)`, with `trees` passed as a **string** (`String(data.trees)`) |
| **Output** | `{ ok:true; requestNo }` or `{ ok:false; message }` — no step, no calculator flag |
| **Side effects** | Same as `submitInterest` plus the offer snapshot columns (see 22.5) |

#### `submitLandOffer(input)` — `src/app/(public)/land/actions.ts`

| | |
|---|---|
| **Called from** | `src/app/(public)/land/land-offer-form.tsx` |
| **Gate** | `land_offers` flag, same pattern as `interest_form` |
| **Input** | Location (`governorateId`, `delegationId`, `locationDescription≤1000`, `latitude`, `longitude`), land (`areaValue ≤ 10_000_000`, `areaUnit ∈ {"ha","m2"}`, `propertyTypeOptionId`, `oliveTreeCount`, `treeAgeOptionId`, `irrigation ∈ {"rainfed","irrigated"}`, `waterSource`), price (`askingPriceDinars`, `priceNegotiable`), `documentOptionIds[≤30]`, contact (`contactName`, `contactPhone`, `contactCapacity ∈ {"owner","agent","broker"}`), `consent`, `website`, `source`, `files[≤50]` of `{name,size,type}` with `type ∈ {application/pdf, image/jpeg, image/png}` |
| **Extra validation** | File count against `land_offer.max_files` (default 10) and per-file size against `min(land_offer.max_file_size_mb, 20) × 1 MiB` — both read from `settings`, with the Arabic message naming the actual limit |
| **Database** | RPC `submit_land_offer(p jsonb)`; `asking_price_millimes = Math.round(dinars × 1000)`; `water_source` is blanked unless `irrigation === "irrigated"` |
| **Then** | For each accepted file, `supabase.storage.from("land-offer-files").createSignedUploadUrl(\`${offer.id}/${randomUUID()}.${ext}\`)`. A failed signature is logged and skipped, not fatal |
| **Output** | `{ ok:true; offerId; referenceNo; uploads: {path, token, index}[] }` |

#### `finalizeLandOfferFiles(input)` — same file

| | |
|---|---|
| **Called from** | `land-offer-form.tsx`, after the browser has pushed each file with `uploadToSignedUrl` |
| **Input** | `{ offerId: uuid; files: {path ≤300, name 1..200}[≤50] }` |
| **Validation** | Reads `land_offers.created_at`; refuses (returns `{saved:0}`) when the offer is older than **two hours**. Lists the bucket folder and keeps only paths that both start with `${offerId}/` and exist in storage |
| **Database** | `land_offer_files` upsert `onConflict: "storage_path", ignoreDuplicates: true`; `mime_type`/`size_bytes` are read from the storage object's metadata, never from the client |
| **Output** | `{ saved: number }` |
| **Gate** | **None** beyond the age window — this action has no feature-flag check and no session check |

---

### 22.3 Back Office Server Actions, in detail

All of them begin with `await requireStaff(<roles>)` from `src/lib/auth.ts`, which redirects to
`/admin/login` when there is no staff session and to `/admin?denied=1` when the roles do not match.

**Projects / offers — `src/app/admin/(panel)/projects/actions.ts`**

- `saveProject(projectId | null, prev, formData)`
  - Requires `name`, a positive integer `governorate_id`; numeric fields go through `optionalNumber()` which
    accepts `""` → `null`, a comma decimal separator, and rejects negatives by returning `undefined`.
  - `status` is a Zod enum over the seven `project_status` values; `plantation_system`, `production_status`,
    `irrigation` are enums that include `""`.
  - Page fields (`description_ar ≤4000`, `water_available` as `"yes"/"no"/other`, `water_note`, `access_note`,
    `video_url` which must match `^https://[^ ]+$`, `latitude`/`longitude` which must be given **together** and
    are rounded to 6 decimals, `show_location`, `document_option_ids`, `service_option_ids`) are written only
    when the form carries a `page_fields` marker, so the short "new project" form cannot erase them. Same trick
    for `delegation_id` (`formData.has("delegation_id")`).
  - Pricing jsonb comes from `readPricingForm(formData, { allowInherit: true })`; an empty formula is stored as
    `{}` so `app.parcel_pricing()` falls back to the default setting.
  - On create, `code` must match `/^[A-Z0-9][A-Z0-9-]{1,20}$/` after upper-casing; PostgREST `23505` becomes
    «هذا الرمز مستعمل.»
  - Revalidates `/admin/projects`, `/admin/projects/${id}` and calls `expirePublicProjects()`
    (`updateTag(PUBLIC_PROJECTS_TAG)` + `revalidatePath("/projects", "layout")`).
- `saveParcel(projectId, parcelId | null, prev, formData)` — the branchiest action in the repo. It first reads
  `project_spacing_classes` for the project; `onTree = projectClasses.length > 0`.
  - **Tree-priced branch**: `area_m2` and `cash_price_dinars` are ignored (forced to `null`), `olive_tree_count`
    is required, a `spacing_class_id` must be one of the project's classes (or is defaulted when the project has
    exactly one), and the row is written with `area_m2 = round(trees) × class.area_m2` and
    `cash_price_millimes = 0` — the comment states `app.parcel_price` computes the real price and never shows a
    stored 0.
  - **Legacy branch**: `area_m2 > 0` and `cash_price_dinars` are both required; the jsonb `pricing` formula is
    read and stored, or `null` when empty.
  - `parcelError()` turns `23505` into «رمز القطعة مستعمل في هذا المشروع.» and forwards any known intake code
    (e.g. `parcel_spacing_not_in_project`) through `intakeErrorMessage`.
- `saveOfferSpacingClasses(projectId, prev, formData)` — the switch that puts an offer on tree pricing. Requires
  `PRICE_ROLES`, a UUID project, every `ids` entry to be a UUID, and a non-empty `reason`. Calls
  `staff_save_project_spacing_classes(p_project, p_class_ids, p_reason)`. Handles `invalid_spacing_class` with
  its own message, `42501` with `intakeErrorMessage("forbidden")`. Success message differs for an empty list
  («تم الحفظ: العرض رجع للمسار القديم — سعر مكتوب لكل قطعة.») and a non-empty one («تم حفظ فئات المساحة. العرض
  يتسعّر بالزيتونة.»). Expires the public projects cache because every lot's area and price follow the classes.
- `addProjectCost` — internal costs; deliberately does **not** expire the public cache (comment: costs never
  reach public pages, PRJ-03).
- Gallery actions (`addProjectPicture`, `setProjectCover`, `moveProjectPicture`, `removeProjectPicture`) work on
  bucket `project-media`, cap the file at 5 MiB and `image/{jpeg,png,webp,avif}`, enforce
  `settings["projects.gallery_max"]` (default 24) in the app *and* catch the database's own `23514`, require a
  non-empty `alt`, name files `${code.toLowerCase()}/${Date.now()}.${ext}`, and delete the uploaded file when the
  row insert fails. `setProjectCover` clears the previous cover first because only one is allowed.
  `moveProjectPicture` re-sequences every row to `(index+1)*10`, skipping rows already at that value.

**Pricing — `src/app/admin/(panel)/pricing/actions.ts`**

Nine actions, one shape: `requireStaff(PRICE_ROLES)` → UUID check (`STALE` message otherwise) → field parsing
through `src/app/admin/(panel)/pricing/form-values.ts` (`dinarsToMillimes`, `percentToBp`, `metres`,
`wholeNumber`, `textValue`) → **mandatory `reason`** (`REASON_MISSING` = `intakeErrorMessage("reason_required")`)
→ RPC → `revalidatePath("/admin/pricing")`. `saveSpacingClass`/`deleteSpacingClass` additionally
`updateTag(PUBLIC_CONFIG_TAG)` because `/start` caches the classes there.
`rpcFailure()` is the shared error translator: known intake code → Arabic message; `42501` → `forbidden`;
`23505` → `duplicate_code`; anything else → «تعذّر الحفظ ولم يتغيّر شيء. حدّث الصفحة وتحقّق من القيم، ثم حاول مرة أخرى.»
`saveMarkups` scans `formData.entries()` for `markup_<months>` keys and sends `[{months, markup_bp}]`; an empty
field means "no markup for that duration" and is skipped, a malformed one is an error naming the month count.

**Settings — `src/app/admin/(panel)/settings/actions.ts`**

`updateSetting(key, …)` reads `settings.value_type` from the database first, then dispatches:

| `value_type` | Handling |
|---|---|
| `boolean` | `raw === "on"` |
| `integer` | range from `INTEGER_RANGES` in `src/app/admin/(panel)/settings/ranges.ts`, default `[0, 1_000_000]` |
| `text` / `money` | `parseText()` — `REQUIRED_TEXT` set of 9 keys may not be emptied; ≤2000 chars; `request_no.prefix`/`land_offer_no.prefix` must match `/^[A-Z0-9-]{2,12}$/`; `sms.sender_id` must match `/^[A-Z0-9]{2,11}$/`; `crm.auto_assign_mode ∈ {manual, round_robin}`; `site.contact_phone`/`site.contact_whatsapp` must be `+…` E.164-ish; `site.contact_email` through `z.email()` |
| `json` | `simulator.durations_months` → 1..8 integers 1..600, de-duplicated and sorted; `pricing.default` → `readPricingForm(formData, { allowInherit: false })`; `site.how_it_works` and `site.faq` → their own Zod schemas; any other json key → «هذا الإعداد لا يُعدَّل من هذه الصفحة.» |

`pricing.max_months` has an extra pre-check: the action reads active `duration` option items and refuses a cap
below the longest one. The database has its own guard (`cap_below_durations`), whose error text is caught and
translated.

**Modules — `setModuleState`**

Refuses to publish a module that is not in `IMPLEMENTED_MODULES`, and hard-codes one product rule: the
`projects` module may never be set to `public` — «المشاريع تبقى «داخلي فقط» حتى تُضبط جداول الأسعار الخاصة بكل
عرض. يمكن معاينتها من الفريق فقط.» On success it expires `PUBLIC_CONFIG_TAG`, and for `projects` also
`PUBLIC_PROJECTS_TAG` and `/projects` (layout).

**Users — `src/app/admin/(panel)/users/actions.ts`**

`createStaffUser` generates a 12-byte base64url temporary password, creates the auth user with
`email_confirm: true`, then grants each role through `admin_set_role` **as the signed-in admin** so the audit
log records who did it; the temporary password is returned in the success message.
`setUserActive` calls `admin_set_user_active` and then bans/unbans in Supabase Auth (`ban_duration: "876000h"`);
a failing ban is only logged. `resetUserPassword` refuses a `super_admin` target unless the caller is one, and
records `auth.password_reset` through `log_action`.

**Login / setup**

`signIn` validates with Zod, signs in, then re-reads `profiles.is_active` and `user_roles` and signs the user
straight back out when they are not staff, logging `auth.login_denied`. `safeNext()` only accepts a `next` that
starts with `/admin`, is not `//…` and is not `/admin/login`. `setupAllowed()` requires
`NODE_ENV !== "production"`, an `ADMIN_SETUP_TOKEN`, a localhost `Host` header and a `timingSafeEqual` match.

---

### 22.4 Route Handlers

#### `GET /admin/leads/export` — `src/app/admin/(panel)/leads/export/route.ts`

| | |
|---|---|
| **Auth** | `getStaffSession()` + `hasRole(session, ADMIN_ROLES)`; otherwise `new Response("Forbidden", { status: 403 })` |
| **Input** | The whole query string, parsed by `parseLeadFilters()` |
| **Database** | RPC `crm_search_requests({ p: filtersToRpc(filters), p_limit: 500, p_offset })` in a loop, up to `MAX_ROWS = 100_000`; for each page, `offerSnapshots(supabase, ids)` reads the offer columns straight from `interest_requests` |
| **Output** | `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="agrized-leads-YYYYMMDD.csv"`, `Cache-Control: no-store`, CRLF line endings, prefixed with a UTF-8 BOM so Excel opens the Arabic correctly |
| **Columns** | 34 fixed Arabic headers, plus «نوع الطلب» when any row has a known `request_kind`, plus 6 offer columns when any row is an offer demand, plus 5 «إجابات قديمة: …» columns when any exported demand carries a retired answer. The header set is decided **after** all rows are collected |
| **Safety** | `csvCell()` quotes every cell, doubles `"`, and prefixes `'` to any value starting with `= + - @ \t \r` (spreadsheet-formula neutralisation) |
| **Side effect** | RPC `log_action("crm.export", "interest_requests", null, { filters, rows })` |
| **Errors** | An RPC error returns `Export failed: <message>` with status 500 |

#### `GET /admin/land-offers/[id]/files/[fileId]` — `src/app/admin/(panel)/land-offers/[id]/files/[fileId]/route.ts`

Auth `LAND_OFFER_ROLES` → 403. Looks the file up by **both** `id` and `land_offer_id` → 404 when absent.
Creates a 300-second signed URL on `land-offer-files`, logs `document.open` through `log_action` with
`{ file_name, land_offer_id }`, and answers `Response.redirect(signedUrl, 302)`.

---

### 22.5 Database RPCs called by the application

`src/lib/supabase/database.types.ts` lists more functions than the app calls. The table below is the set
actually invoked from `src/`, with the migration holding the **current** definition.

| RPC | Current definition | Grants | Called from |
|---|---|---|---|
| `submit_interest_request(p jsonb)` | 0032 (earlier: 0003, 0009, 0011, 0016, 0019, 0030) | `service_role` only | `submitInterest` |
| `submit_offer_request(p jsonb)` | 0049 | `service_role` only | `submitOfferInterest` |
| `submit_land_offer(p jsonb)` | 0003 | `service_role` only | `submitLandOffer` |
| `public_tree_quote(...)` | 0045 (earlier 0031) | `anon`, `authenticated` | `publicTreeQuote` |
| `public_project_quote(...)` | 0034 | `anon`, `authenticated` | `getProjectQuote` |
| `public_projects()` | 0035 (earlier 0020, 0023) | `anon`, `authenticated` | `getPublicProjects` |
| `public_parcels()` | 0035 (earlier 0020, 0022) | `anon`, `authenticated` | `getPublicParcels` |
| `public_parcel_offer(...)` | 0020 | `anon`, `authenticated` | `getParcelOffer` |
| `public_project_page(p_code)` | 0023 | `anon`, `authenticated` | `getProjectPage` |
| `public_coverage()` | 0035 (earlier 0020) | `anon`, `authenticated` | `getCoverage` |
| `million_progress()` | 0025 (earlier 0016) | `anon`, `authenticated` | `getMillionProgress` |
| `crm_search_requests(p, p_limit, p_offset)` | 0032 (earlier 0007, 0011, 0016, 0028, 0030) | `authenticated` | leads page, export route, bulk assign |
| `crm_demand_stats(p_from, p_to, p_people)` | 0032 (earlier 0007, 0011, 0028, 0030) | `authenticated` | dashboard, analytics |
| `demand_indicator(p_governorate)` | 0007 | `authenticated` | land-offer detail page |
| `match_requests_for_parcel(p_parcel, p_limit)` | 0013 | (security definer, `app.is_staff()` inside) | admin parcel page |
| `staff_parcel_offer(...)` | 0020 | `authenticated` | admin parcel page |
| `staff_project_parcel_prices(p_project)` | 0035 | `authenticated` | `getStaffParcelPrices` |
| `staff_tree_quote(...)` | 0031 | `authenticated` | pricing simulator section |
| `staff_save_spacing_class`, `staff_delete_spacing_class`, `staff_save_pricing_rule` (0046), `staff_delete_pricing_rule`, `staff_save_cost_item`, `staff_delete_cost_item`, `staff_save_financing_markups`, `staff_save_project_down_percents`, `staff_save_project_spacing_classes` (0034) | 0031 / 0034 / 0046 | `authenticated` | pricing + project actions |
| `admin_assign_persons(ids, to_user, reason)` | 0002 | `authenticated` | leads actions |
| `admin_set_role(user, role, grant)` | 0001 | `authenticated` | users actions |
| `admin_set_user_active(user, active)` | 0001 | `authenticated` | users actions |
| `review_land_offer(...)` | 0003 | `authenticated` | land-offer action |
| `log_action(action, entity, entity_id, data, reason)` | 0001 | `authenticated` | export route, file route, account, users |

**Defined but never called from `src/`:** `public.staff_project_quote(...)` (0034) and
`public.compute_installment_plan(...)` (0013, reached only from inside `app.parcel_offer_payload`).

#### `submit_interest_request(p jsonb)` — the calculator intake (0032)

Validation order inside the function: name length 3..120 (`invalid_full_name`) → `app.assert_phone`
(`invalid_phone`, and `phone_not_tunisian` unless `lead.allow_international_phone`) → WhatsApp regex
(`invalid_whatsapp`) → e-mail length/regex (`invalid_email`) → consent text present (`consent_required`) →
active governorate (`invalid_governorate`) → delegation belongs to it (`invalid_delegation`) → invest
governorates (`invest_location_required`, `invalid_invest_governorate`) → scenarios (`invalid_scenario`,
`single_scenario_only`; scenarios decide `project_type_ids`, `plantation_systems`, `production_statuses`,
`project_type_unsure`) → `goal` (`invalid_goal`) → `payment_mode ∈ {cash, installments}`
(`invalid_payment_mode`) → down-payment percent / legacy amount / legacy monthly / duration items, each only
when `payment_mode <> 'cash'` → when `installments`, a percentage and a duration are **required as long as the
lists are non-empty** (`down_payment_percent_required`, `duration_required`) → budget, contact time, desired
area → tree count option (`invalid_tree_choice`) or a typed number bounded by `million.custom_trees_min` /
`million.custom_trees_max` (`invalid_tree_custom`) → active spacing class (`invalid_spacing`) → priority →
contact channel (`contact_channel_required`).

Then throttling: `app.check_throttle('interest:ip', ip_hash, 1 hour, antispam.max_requests_per_ip_per_hour)`
and a per-phone count over 24 h against `antispam.max_requests_per_phone_per_day`, both raising `rate_limited`.

Then the person upsert `on conflict (phone_e164) do update set last_request_at, consent_at` — existing person
data is never overwritten — with `xmax = 0` telling insert from update, which is also what sets
`is_duplicate = not v_inserted` on the request. When the person is new and
`crm.auto_assign_mode = 'round_robin'`, the least recently assigned active `commercial` is picked and a
`person_assignments` row with reason `auto:round_robin` is written.

Prices are recomputed here so a demand never stores a figure the visitor could not see: when a spacing class and
a tree count exist **and** `app.module_open('pricing')`, `app.tree_price(class, null)` gives
`price_per_tree_millimes`, `total = per_tree × trees`, and for installments
`app.financed_quote(total, app.down_payment_from_percent(total, percent, null), months, null)` gives
`down_payment_amount_millimes`, `total_financed_millimes`, `monthly_millimes`.

`request_no` is `settings["request_no.prefix"]-YYYY-NNNNNN` via `app.next_number('interest_request:'||year)`.
Finally `app.enqueue_message('lead.confirmation', phone, {name, request_no, trees, total_area_m2,
total_price_millimes}, 'interest_requests', id)`. Returns `{ "request_no": … }`.

#### `submit_offer_request(p jsonb)` — the offer intake (0049)

Same identity rules (comment: «so one person is one person in both flows»). Differences:

- The project must exist and its status must be in `app.project_public_statuses()` — otherwise
  `offer_not_available`. The module flag is **not** checked here; the Server Action does that. A `draft` or
  `internal` offer therefore cannot take a request even if a form reached it.
- `trees` is parsed from text; `null`, `< 1`, or `> projects.tree_count` (when that is `> 0`) raises
  `invalid_offer_trees`.
- The price snapshot comes from `app.project_quote_payload(project, null, trees, 'cash', null, null, false)` —
  the same builder the offer page prices with. When `pricing <> 'ok'` the request is still taken, without money.
- It writes the new 0049 columns `request_kind = 'offer'`, `project_id`, `project_code`, `project_name`,
  `offer_trees`, `offer_price_per_tree_millimes`, `offer_total_price_millimes`,
  `offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes`, **and** fills the shared columns so
  the existing CRM lists, filters, exports and the tree counter keep working: `tree_count_code = 'offer'`,
  `tree_count_label_ar = "<n> <start.trees_unit>"`, `tree_count_min = tree_count_max = trees`,
  `invest_governorate_ids = [project.governorate_id]`, `project_type_unsure = true`,
  `price_per_tree_millimes`, `total_price_millimes`, plus the spacing snapshot.
- 0049 also drops `NOT NULL` from `goal_option_id`/`goal_label_ar` and re-adds it as a check that only applies
  to `request_kind = 'calculator'`.

`supabase/tests/031_offer_intake.sql` asserts exactly this: the request is marked `'offer'`, the offer is
snapshotted, `offer_trees` is what was asked, and an `internal` project is refused.

#### `submit_land_offer(p jsonb)` (0003)

Validates name, phone, consent, delegation-within-governorate, `area_value > 0`, `area_unit ∈ {ha, m2}`,
non-negative tree count and price, `property_type` and optional `tree_age` option items, and casts
`irrigation`/`contact_capacity` enums (`invalid_choice` on failure). Snapshots the chosen documents as a jsonb
array of `{id, label_ar}`. Throttles on `land_offer:ip` over one day against
`antispam.max_land_offers_per_ip_per_day`. Reference is `land_offer_no.prefix-YYYY-NNNNNN`. Enqueues
`land_offer.confirmation`. Returns `{ id, reference_no }`.

#### `public_tree_quote(...)` (0045)

Returns `null` for an inactive/unknown class. Clamps `p_trees` to `[1, max]` where
`max = greatest(million.custom_trees_max, max(tree_count.min_number))` — anything outside gives `trees = null`,
so the per-tree figures still render. `pricing` is `'closed'` when `app.module_open('pricing')` is false,
`'ok'`/`'unavailable'` otherwise. Installments are computed only for `payment_mode = 'installments'` with a tree
count, and the `installments.status` is one of `incomplete`, `invalid_choice`, or whatever
`app.financed_quote` returns (`ok`, `duration_not_priced`, `down_covers_total`, `too_many_months`,
`invalid_input`). Money keys are `null` unless `pricing = 'ok'`. The function's own `comment on` states it never
returns the land price, planting cost, extra costs, cost, margin, markup or internal notes.

#### `public_project_quote(...)` / `app.project_quote_payload(...)` (0034, redefined 0048)

`public_project_quote` gates on `app.project_visible(status)` and returns `null` otherwise, then delegates to
`app.project_quote_payload(..., p_staff := false)`. `staff_project_quote` is the same with `app.is_staff()` and
`p_staff := true` (it exists but nothing in `src/` calls it).

The payload's `pricing` ladder: `'closed'` (non-staff, pricing module shut) → `'not_offered'` (non-staff,
status ≠ `published`) → `'legacy'` (project lists no spacing class) → `'ok'`/`'unavailable'`. `trees_max` is the
project's own `tree_count` when set, else the `/start` limit. `choices` carries the project's spacing classes
(with a per-tree price only when the caller may see prices), `app.project_down_percent_items(project)` and the
durations that both sit within `pricing.max_months` and have a `financing_markups` row. The `price` breakdown
and `installments.markup_bp` are appended **only** when `p_staff and app.can_price()`.

#### `public_projects()` / `public_parcels()` / `public_coverage()` (0035)

All three are `security definer`, `stable`, `set search_path = ''`, gated by `app.project_visible(pj.status)`
which is `app.module_open('projects') and (status ∈ public statuses or (status = 'internal' and
app.is_staff()))`. `public_projects()` returns a fixed 28-column whitelist; `min_price_per_tree_millimes` is
emitted only when `status = 'published' and app.module_open('pricing')`. `public_parcels()` computes each row's
area and money through `app.parcel_price(pa.id)`: a tree-priced parcel reports `total_area_m2` and
`cash_total_millimes`, a legacy one its stored values, and money appears only when the parcel is
`app.parcel_offered(...)` and (for tree pricing) `pricing = 'ok'` and the pricing module is open. It is bounded
by `least(1000, greatest(20, settings["projects.listing_limit"]))` rows.

#### `public_parcel_offer(...)` / `staff_parcel_offer(...)` (0020)

`public_parcel_offer` returns `null` when the parcel or project is not visible; a taken parcel returns
`offered = false` with empty plans "so shared links never 404". The payload
(`app.parcel_offer_payload(parcel, down_option, installment_option, force_price)`) builds `down_options`,
`installment_options`, a `plans` matrix through `public.compute_installment_plan(cash, down, installment,
pricing_jsonb)`, up to `least(5, settings["projects.installment_examples"])` worked `examples` (smallest down
payment, installments ascending, `ok` plans only), an `entry` (`examples[0]`), a `chosen` plan, and
`suggested_tree_count_option_id` / `suggested_scenario_id`. `staff_parcel_offer` raises `forbidden` (`42501`)
for non-staff and passes `p_force_price := true`, so the Back Office sees the numbers a visitor would even for a
taken parcel.

#### `crm_search_requests(p, p_limit, p_offset)` (0032)

`security invoker` over the `public.crm_requests` view, so the caller's RLS applies. Returns 59 columns plus
`total_count` (rows being paged), `requests_total`, `persons_total`, `trees_total` (the whole filtered set;
trees skip duplicates). Filters read out of the jsonb: `q` (name, request number, or ≥3 digits of the phone,
escaped with `app.like_escape`), residence/invest governorate with `include_anywhere`, project type with
`include_unsure`, plantation/production, `priority_code`, desired-area overlap, tree-count overlap,
down/installment min-max, `duration_min/max`, `wants_visit`, `wants_bank_financing`, `spacing_class_id`,
`payment_mode`, `down_payment_percent` (exact), `goal_code`, `stage`, `status_id`, `assigned_to` (with the
literal `'none'` for unassigned), `from`/`to` interpreted in `Africa/Tunis`, `source` (`utm_source`, defaulting
to `'direct'`), `duplicates_only`, and `people` which collapses to one row per person (the latest matching
demand). `p_limit` is clamped to `[1, 500]`.

**It does not know `request_kind`.** The view was last created before 0049 and a view freezes its column list,
so neither `crm_requests` nor `crm_search_requests` returns the offer columns. The fix is drafted and
**not applied**: `supabase/pending/bb_crm_offer_columns.sql`.

#### `million_progress()` (0025)

Returns `null` unless `app.module_open('public_statistics')` **or** the session carries no JWT at all (a direct
database session — migrations, tests, scripts — always reads). Keys: `goal` (`settings["million.goal"]`),
`trees_requested` (`sum(tree_count_min)` over non-duplicate requests), `participants`
(`count(distinct person_id)`), `requests`, `projects_under_study` (projects in `draft`/`preparing`/`internal`),
`trees_reserved` (parcels `reserved`), `trees_contracted` (`contracting`, `sold`, `owned`), `trees_planted`
(non-withdrawn parcels of `operating` projects).

#### Administration RPCs

- `admin_assign_persons(uuid[], uuid, text) → integer`: `app.is_admin()` or `42501`; the target must be an
  active `commercial` or `target_not_active_commercial`; iterates `for update` over persons whose assignee
  actually changes, updates `persons.assigned_to` and writes a `person_assignments` history row with
  `created_by = auth.uid()`; returns how many moved.
- `admin_set_role(uuid, app_role, boolean)`: `app.is_admin()`; only a super admin may grant/revoke
  `super_admin`; refuses to remove the last `super_admin`.
- `admin_set_user_active(uuid, boolean)`: `app.is_admin()`; you cannot deactivate your own account; only a super
  admin may touch a super admin.
- `review_land_offer(offer, stage, outcome, notes, next_status)`: stage-by-stage role gate —
  `legal_review` needs `legal`/admin, `technical_review`/`field_visit` need `agri_manager`/admin, and
  `under_study` plus the four final statuses need admin; `not_found` (`P0002`) for an unknown offer; inserts a
  `land_offer_reviews` row and optionally moves `land_offers.status`.
- `log_action(action, entity, entity_id, data, reason)`: `app.is_staff()` or `42501`; delegates to
  `app.write_audit`.

### 22.6 `app.*` helpers behind the RPCs

Not callable by `anon`/`authenticated` (every one is explicitly revoked). They are the shared vocabulary the
RPCs are written in.

| Function | Migration | What it decides |
|---|---|---|
| `app.flag_state(key)` | 0020 | the flag, defaulting to `disabled` |
| `app.module_open(key)` | 0020 | `public` → true; `internal` → `app.is_staff()`; else false |
| `app.project_public_statuses()` | 0020 | `['published']` plus `sold_out`/`operating` when `projects.list_closed` |
| `app.project_visible(status)` | 0020 | the single gate of every public projects RPC |
| `app.parcel_offer_statuses()` | 0020 | `['available']` plus `interested` when `projects.offer_includes_interested` |
| `app.parcel_offered(project, parcel)` | 0020 | "the single definition of offered": project must be `published` |
| `app.parcel_visible_status(status)` | 0020 | not `withdrawn`, and offered or `projects.show_taken_parcels` |
| `app.project_on_tree_pricing(project)` | 0034 | does the project list any spacing class |
| `app.project_spacing_choice(project, class)` | 0034 | `'ok'` / `'required'` / `'not_allowed'` / `'legacy'` |
| `app.parcel_price(parcel)` | 0045 (0034) | trees × per-tree price, or the legacy stored price |
| `app.tree_price(class, project)` | 0045 (0031) | land + planting + extras → cost → margin → rounded price, plus `annual_fee_per_tree_millimes` |
| `app.financed_quote(cash, down, months, project)` | 0036 (0031) | remaining = (cash − down) × (1 + markup); total = down + remaining |
| `app.down_payment_from_percent(cash, percent, project)` | 0031 | percentage of the cash total, rounded up to the price step; `null` outside `0 < p ≤ 100` |
| `app.price_rounding(project)` | 0031 | project step, else global, else 1 |
| `app.project_down_percent_items(project)` | 0031 | the project's own percentages, else every active one |
| `app.can_price()` | 0031 | `finance`, `admin`, `super_admin` |
| `app.is_staff()`, `app.is_admin()`, `app.has_role()`, `app.has_any_role()`, `app.current_roles()` | 0001 | role predicates |
| `app.can_see_person()`, `app.can_edit_person()` | 0002, 0008 | CRM row visibility |
| `app.require_reason(reason, min)` / `app.set_reason(reason)` | 0024 | raises `reason_required`; stores the reason transaction-locally for the audit triggers |
| `app.write_audit(...)`, `app.audit_row_change()`, `app.block_audit_mutation()` | 0001 | the append-only audit trail |
| `app.check_throttle(kind, hash, window, max)` | 0003 | raises `rate_limited`, writes `app.submission_throttle` |
| `app.active_option(list, id)` | 0003 | one active `option_items` row, or nothing |
| `app.assert_phone(phone, error)` | 0003 | E.164 shape, plus the Tunisian-only rule |
| `app.clean_source(jsonb)` | 0003 | whitelists and truncates the 7 UTM/referrer keys |
| `app.enqueue_message(template, to, vars, entity, id)` | 0003 | renders an active `message_templates` row into `notification_outbox` |
| `app.setting/_text/_int/_bool(key)` | 0002 | reads `settings` |
| `app.next_number(scope)` | 0002 | the request/offer counter |
| `app.like_escape(value)` | 0007 | escapes `\ % _` for the CRM search |
| `app.parcel_tree_unit_sync()`, `app.spacing_area_fanout()` | 0035 | triggers keeping a parcel's `area_m2` in step with trees × class area |
| `app.check_parcel_spacing_class()`, `app.check_project_class_in_use()` | 0034 | triggers raising `parcel_spacing_not_in_project` / `spacing_used_by_parcels` |

### 22.7 OBSERVATIONS — API layer

- **Two gates, always.** Every public read path is gated in SQL (`app.module_open`, `app.project_visible`) and
  again in TypeScript (`moduleAccess`, `flagState`). `src/app/(public)/projects/page.tsx:115` and
  `src/app/(public)/page.tsx` both re-check `pricing` before passing a price to `OfferCard`, even though
  `public_projects()` already withheld it.
- `finalizeLandOfferFiles` is the only public Server Action with no feature-flag check and no rate limit. Its
  only guard is the two-hour age of the `land_offers` row and the requirement that the storage object exists
  under `${offerId}/`.
- `submitOfferInterest` passes `trees` to the RPC as a string (`String(data.trees)`), matching the RPC's
  `nullif(btrim(...))::integer` parse; `submitInterest` does the same for `tree_count_custom`.
- `saveOfferSpacingClasses` (projects actions) and `saveProjectSpacingClasses` (pricing actions) call the same
  RPC with the same arguments and differ only in their success and `invalid_spacing_class` messages. Two
  entry points, one write.
- `public.staff_project_quote` (0034) is fully implemented and granted, and nothing in `src/` calls it. The
  Back Office prices with `staff_tree_quote` and `staff_project_parcel_prices` instead.
- The CRM cannot filter on `request_kind` in SQL. `src/app/admin/(panel)/leads/offer-snapshot.ts` compensates by
  re-reading `interest_requests` for the ids already on screen, and both the export route and `assignPersons`
  apply the filter in TypeScript over every matching page. The file documents this and names the unapplied
  migration.
- `assignPersons` with `scope = "all"` pages through up to 100 000 rows in batches of 500 in a single Server
  Action, and for a kind-filtered search issues one extra `interest_requests` read per batch.
- `updateSetting` reads `value_type` from the database on every call, so a setting's kind is data, not code —
  but `JSON_SCHEMAS` and the `simulator.durations_months` / `pricing.default` special cases hard-code which json
  keys are editable at all.
- `setModuleState` hard-codes the refusal to publish `projects`. That is the one business rule in the action
  layer that is not read from `settings` or `feature_flags`.
- `src/app/(public)/simulator/page.tsx` is a 7-line permanent `redirect("/start")`; the `simulator_basic` flag
  still exists in `IMPLEMENTED_MODULES` and `src/app/(public)/simulator/capacity-simulator.tsx` (141 lines) is
  no longer imported by any route.

---

## 23. IMPORTANT FUNCTIONS (`src/lib/`)

### 23.1 `src/lib/config.ts` — the configuration reader

`import "server-only"`. Everything the public site is allowed to vary without a deploy comes through here.

| Export | Signature | Notes |
|---|---|---|
| `PUBLIC_CONFIG_TAG` | `"public-config"` | the cache tag every Back Office action that touches settings, lists, flags, media or spacing classes expires |
| `getPublicConfig()` | `() => Promise<PublicConfig>` | the only entry point |
| `settingText(config, key, fallback = "")` | `string` | non-string values fall back |
| `settingBool(config, key, fallback = false)` | `boolean` | |
| `settingInt(config, key, fallback)` | `number` | requires a finite number |
| `settingJson<T>(config, key, fallback)` | `T` | `undefined`/`null` fall back; no shape check |
| `optionsFor(config, listKey)` | `OptionItem[]` | filters the pre-loaded list |
| `mediaFor(config, slot)` | `MediaSlot \| undefined` | `undefined` when no picture is uploaded |
| `mediaCredits(config)` | `{text, url}[]` | only slots with a `credit_text` (CC BY) |
| `flagState(config, key)` | `FlagState` | defaults to `"disabled"` |

`loadPublicConfig` is an `unstable_cache` keyed `["public-config-v6"]`, tagged `PUBLIC_CONFIG_TAG`,
`revalidate: 300`. It issues **eight** parallel anon queries — `settings` (only `is_public = true`),
`feature_flags`, `governorates`, `delegations`, `project_types`, `ownership_scenarios`, `option_items`,
`site_media` — and throws `Could not load public configuration: …` if any errors. `withRetry` wraps the whole
load in 3 attempts with 800 ms / 1600 ms back-off, because the home page is prerendered at build time and a
momentary Supabase hiccup would otherwise fail the deploy.

**Callers:** every public page and layout, `src/app/admin/(panel)/layout.tsx`, the leads export route, and all
of the admin pages that need governorate/list labels.

### 23.2 `src/lib/format.ts` — display

| Function | Output |
|---|---|
| `formatMillimes(millimes, { withMillimes = false })` | `"12,500 د.ت"`, or 3 decimals when asked. Divides by 1000, formats with `en-US` grouping |
| `formatDate(value)` | `en-GB` `dd/MM/yyyy` in `Africa/Tunis` |
| `formatDateTime(value)` | the same plus `HH:mm`, `hour12: false` |
| `formatCount(value)` | `en-US` grouping |
| `formatArea(m2, unit = "م²")` | `"35 م²"`, max 2 decimals; the French twin passes `"m²"` |
| `formatSpacing(row, tree, unit = "م")` | `"7 × 5 م"` |

`TIME_ZONE = "Africa/Tunis"` is declared once, at the top of this file, and every date in the product goes
through it. Note the deliberate mix: Arabic currency and unit words, Western digits and `en-US`/`en-GB` number
and date shapes.

**Callers:** 30+ files across public pages, site components, admin pages and admin components.

### 23.3 `src/lib/phone.ts` and `src/lib/digits.ts`

`toWesternDigits(input)` maps Arabic-Indic (`٠-٩`, U+0660) and Persian (`۰-۹`, U+06F0) digits to `0-9` by code
point arithmetic. It is used by `phone.ts`, by the `/start` free-number field, by the register wizard, by the
offer form and by `src/lib/pricing-form.ts` and `src/components/admin/tree-pricing-spacing-fields.tsx` (both of
which re-implement the mapping inline against a local `ARABIC_DIGITS` string rather than importing it).

`normalizePhone(input, allowInternational)` strips spaces, dots, dashes and parentheses, rewrites a leading
`00` as `+`, parses with `libphonenumber-js/min` defaulting to region `"TN"`, and returns
`{ok:true, e164}` or `{ok:false, reason:"invalid" | "not_tunisian"}`. The `allowInternational` argument is
always `settingBool(config, "lead.allow_international_phone")` at the call sites — except for the WhatsApp
number, which all three intakes normalise with `allowInternational = true` unconditionally.

`formatPhone(e164)` renders a Tunisian number as `"98 123 456"` and anything else through
`formatInternational()`. Used by `src/components/site/site-footer.tsx` and the leads list.

### 23.4 `src/lib/errors.ts` — the Arabic error dictionary

`MESSAGES` is a flat `Record<string, string>` of **56** intake/RPC error codes, each mapped to an Arabic
sentence that says what went wrong *and* what to do. `FALLBACK` is «تعذّر إرسال الطلب. تحقق من اتصالك وحاول مرة
أخرى.»

- `intakeErrorMessage(code)` → the message or the fallback.
- `isKnownIntakeError(code)` → whether the code is in the map. Every Server Action uses it to decide whether to
  `console.error` (unknown = a real bug) or stay quiet (known = a validation answer).

Codes cover the whole product: intake fields (`invalid_full_name` … `invalid_contact_time`), throttling
(`rate_limited`), land offers (`invalid_area`, `invalid_property_type`, `invalid_tree_age`), the audit reason
(`reason_required`), authorisation (`forbidden`), pricing (`invalid_spacing_class`, `spacing_in_use`,
`invalid_pricing_rule`, `invalid_cost_item`, `invalid_markup`, `duration_over_cap`,
`parcel_spacing_not_in_project`, `spacing_used_by_parcels`, `duplicate_code`) and the 0049 offer form
(`offer_not_available`, `invalid_offer_trees`).

**Callers:** all five public intake actions, the pricing actions, the projects actions, the register page (for
the calculator-gap message) and `src/components/admin/tree-pricing-quote.tsx`.

### 23.5 `src/lib/public-hrefs.ts` — the link contract

Client-safe by construction: "ids and codes only, never amounts".

| Function | Produces |
|---|---|
| `projectsHref({gov, trees, type})` | `/projects?…` |
| `projectHref(code)` | `/projects/<encoded code>` |
| `parcelHref(projectCode, parcelCode)` | `/projects/<code>/<parcel>` |
| `interestHref({parcelId, trees, treesCustom, scenario, spacing, payment, downPercent, duration, visit})` | `/register?parcel=…&trees=…&trees_custom=…&scenario=…&spacing=…&payment=…&down_pct=…&duration=…&visit=1` |

`interestHref` encodes two rules: `trees_custom` is dropped when a listed tier `trees` is present, and
`down_pct`/`duration` are dropped unless `payment === "installments"`. `withQuery` skips falsy values, so an
unanswered question simply does not appear.

**Callers:** `src/app/(public)/projects/[code]/[parcel]/page.tsx` (both the "مهتم" and "نحب نزور" buttons),
`src/app/(public)/projects/page.tsx`, `src/app/(public)/projects/[code]/page.tsx`,
`src/app/(public)/register/page.tsx`, `src/app/(public)/projects/map/page.tsx`.

The **other half** of the same contract lives in `src/app/(public)/start/calculator-summary.ts` as
`calculatorQuery(choices, wantsVisit)`, which writes the same parameter names from `/start`'s side.

### 23.6 `src/lib/modules.ts` + `src/lib/modules-catalog.ts`

```
type ModuleAccess = "open" | "preview" | "closed"
moduleAccess(config, key): Promise<ModuleAccess>
```
`public` → `"open"`; `internal` **and** a staff session → `"preview"`; everything else → `"closed"`.
It is the only place `getStaffSession()` is consulted from the public site, which is why every page that calls
it also declares `export const dynamic = "force-dynamic"` (`/projects`, `/projects/[code]`,
`/projects/[code]/[parcel]`, `/projects/map`, `/land`).

`modules-catalog.ts` is pure data with no server dependency:
`IMPLEMENTED_MODULES = ["interest_form", "simulator_basic", "land_offers", "projects", "public_statistics",
"pricing"]`, `isImplementedModule(key)`, `FLAG_STATE_LABELS` (`disabled` → «معطّل», `internal` → «داخلي فقط»,
`public` → «منشور للعموم») and `PHASE_LABELS` for the four spec phases.

**Note the asymmetry:** the home page (`src/app/(public)/page.tsx`) is prerendered with `revalidate = 60` and
therefore uses `flagState(config, …) === "public"` directly — it must never read the staff session — while the
dynamic pages use `moduleAccess`. `src/app/(public)/layout.tsx` also uses `flagState` for the header/CTA.

### 23.7 `src/lib/crm.ts` — CRM vocabulary

No functions, six label/tone maps, all typed against the generated database enums:

- `STAGE_LABELS` / `STAGE_TONES` over `lead_stage`: `new` «جديد», `contacting` «قيد الاتصال», `qualified`
  «مؤهَّل», `proposed` «تم اقتراح مشروع», `visit` «زيارة», `reserved` «حجز», `contracting` «في طور التعاقد»,
  `owner` «مالك», `paused` «غير مهتم حالياً», `closed` «مغلق».
- `CHANNEL_LABELS` over `contact_channel`: `phone` «هاتف», `whatsapp` «WhatsApp», `both` «هاتف وWhatsApp».
- `OUTCOME_LABELS` over `contact_outcome`: `answered` «تم الرد», `no_answer` «لم يرد», `wrong_number` «رقم
  خاطئ», `callback` «طلب إعادة الاتصال», `not_interested` «غير مهتم حالياً».
- `PLANTATION_LABELS`: `traditional` «تقليدية», `intensive` «مكثفة», `other` «نظام آخر».
- `PRODUCTION_LABELS`: `none` «غير منتج», `starting` «بداية إنتاج», `producing` «منتج».
- `ATTEMPT_CHANNEL_LABELS`: `phone` «مكالمة», `whatsapp` «WhatsApp», `sms` «SMS», `other` «أخرى».

The comment on `STAGE_LABELS` records that these are the fixed system stages and that the labels staff actually
see come from the `lead_statuses` table — the map is the fallback vocabulary, not the source.

`PLANTATION_LABELS` and `PRODUCTION_LABELS` are the two maps that cross into the public site
(`project-card.tsx`, `parcel-card.tsx`, `offer-card.tsx`, `/projects/[code]`, `/projects/[code]/[parcel]`, the
leads export route).

### 23.8 `src/lib/projects.ts` — project/parcel vocabulary and the offer type

| Export | Kind | Content |
|---|---|---|
| `PROJECT_STATUS_LABELS` / `_TONES` | maps over `project_status` | `draft` «مسودة», `preparing` «قيد التحضير», `internal` «جاهز (داخلي)», `published` «منشور», `sold_out` «مكتمل البيع», `operating` «في طور الاستغلال», `archived` «مؤرشف» |
| `PARCEL_STATUS_LABELS` / `_TONES` | maps over `parcel_status` | `available` «متاحة», `interested` «مهتم بها», `reserved` «محجوزة», `contracting` «في طور التعاقد», `sold` «متعاقد عليها», `owned` «مملوكة», `withdrawn` «موقوفة» |
| `parcelStatusLabel(status)` / `parcelStatusTone(status)` | functions | tolerate a status a later migration adds; unknown → the status string and a neutral tone |
| `projectStatusLabel` / `projectStatusTone` | functions | same |
| `OFFER_TYPE_LABELS` | map | `productive` «زيتون منتج», `new_planting` «غراسة جديدة», `intensive` «زيتون مكثّف», `bare_land` «أرض بيضاء» |
| `offerTypeOf(parcel)` | function | `bare_land` if `property_type === "bare_land"`; else `intensive` if `plantation_system === "intensive"`; else `productive` when `production_status === "producing"`, otherwise `new_planting` |
| `durationLabel(months)` | function | `"7 سنوات"` for whole years, `"30 شهراً"` otherwise |
| `PROPERTY_TYPE_LABELS` | map | `bare_land` «أرض بيضاء», `planted` «زيتون موجود» |
| `COST_KIND_LABELS`, `COST_KINDS`, `COST_KINDS_OFFERED` | data | 13 cost categories; `development` and `fees` stay accepted for pre-v3 rows but are not offered in the form |
| `InstallmentPlan`, `PlanOption`, `OfferPlan`, `ParcelOffer` | types | the shape of `public_parcel_offer()` |
| `PLAN_REASON_LABELS` | map | 6 plan-failure reasons in Arabic |

`offerTypeOf` is the classifier behind the `/projects` "نوع العرض" filter and the type badge on every
`ParcelCard`; `parcelStatusLabel`/`parcelStatusTone` are what `ParcelPlan` colours its tiles with.

### 23.9 `src/lib/million.ts` — the public counter

`import "server-only"`. `getMillionProgress(): Promise<MillionProgress | null>` wraps an `unstable_cache`
keyed `["million-progress-v2"]` with `revalidate: 60` and **no tag** — it expires only by time.
It calls RPC `million_progress()` with the anon client and coerces each key through
`Number(row[key] ?? 0) || 0`, because PostgREST returns bigint as a string above 2^53.

`MillionProgress = { goal, treesRequested, treesReserved, treesContracted, treesPlanted, participants,
requests, projectsUnderStudy }`.

It returns `null` when the database cannot be reached **or** when the module is closed (the RPC answers `null`
to visitors then). The comment is explicit about why: "the section disappears rather than showing a zero that
would read as a statement about the project". One caller: `src/app/(public)/page.tsx`, itself guarded by
`flagState(config, "public_statistics") === "public"`.

### 23.10 `src/lib/public-projects.ts` — the public projects data layer

`import "server-only"`. The widest module in `src/lib`.

**Cache model.**
```
PublicMode = "anon" | "preview"
publicMode(access: ModuleAccess): PublicMode      // "preview" only when the module is internal and staff
callRpc(mode, fn, args)                            // preview → createClient() (the visitor's JWT); anon → createPublicClient()
cachedAnonRpc = unstable_cache(callRpc("anon",…), ["public-projects-v1"], { tags: [PUBLIC_PROJECTS_TAG], revalidate: 60 })
load(mode, fn, args) = mode === "anon" ? cachedAnonRpc(fn, JSON.stringify(args)) : callRpc(mode, fn, args)
```
The rule the comment states: a staff-only row must never land in the shared cache, so `preview` reads are never
cached. `PUBLIC_PROJECTS_TAG = "public-projects"` is expired by `expirePublicProjects()` in the projects
actions, by `setModuleState` for the `projects` key, and by `updateSetting` for `pricing.default`.

**Types:** `PublicProject` (28 fields), `PublicParcel` (28 fields), `ProjectPicture`, `ProjectPage`,
`CoverageRow`, `ProjectQuote`, `ProjectQuoteRequest`, `ProjectQuotePricing`.

**Loaders:**

| Function | RPC | Notes |
|---|---|---|
| `getPublicProjects(mode)` | `public_projects` | maps every field through `num`/`numOrNull` (bigint-as-string) and `row.on_tree_pricing === true` |
| `getPublicParcels(mode)` | `public_parcels` | same |
| `getCoverage(mode)` | `public_coverage` | four counts per governorate |
| `getParcelOffer(parcelId, mode, {down, installment})` | `public_parcel_offer` | when a `down`+`installment` pair is given and the call throws, it **retries without the choice** so a retired option cannot break the page |
| `getProjectPage(code, mode)` | `public_project_page` | normalises text/ids/media; `null` when the project is not visible |
| `getProjectQuote(projectId, mode, request)` | `public_project_quote` | builds `args` by omitting empty keys; catches every error, `console.error`s and returns `null`, "so pages fall back to what they showed before" |
| `toProjectQuote(data)` | — | pure; extends `toTreeQuote` with `project_id`, `project_code`, `on_tree_pricing`, `spacing_status`, `trees_max`, `pricing` and `choices`, and re-nulls money whenever `pricing !== "ok"` |
| `findProject(projects, code)` / `findParcel(parcels, projectCode, parcelCode)` | — | pure array lookups |

**Callers:** `/projects`, `/projects/[code]`, `/projects/[code]/[parcel]`, `/projects/map`, the home page
(`getPublicProjects("anon")`, `getPublicParcels("anon")` inside a try/catch), and `/register` (for the
confirmation-screen offer list).

### 23.11 `src/lib/tree-pricing.ts` — the quote reader

`import "server-only"`.

| Export | Purpose |
|---|---|
| `PAYMENT_MODES = ["cash","installments"]`, `PaymentMode` | the only two modes |
| `parsePaymentMode(value)` | `PaymentMode \| undefined`; used by `/start`'s URL reader and the parcel page |
| `QuotePricing = "closed" \| "unavailable" \| "ok"` | |
| `InstallmentStatus` | `ok`, `incomplete`, `invalid_choice`, `duration_not_priced`, `down_covers_total`, `too_many_months` |
| `TreeInstallments`, `TreeQuote` | the shape of `public_tree_quote` |
| `toTreeQuote(data)` | **pure** normaliser. Unknown `pricing` collapses to `"closed"`; unknown `installments.status` collapses to `"incomplete"`; the four money keys are forced to `null` unless `pricing === "ok"` |
| `publicTreeQuote(request)` | the RPC call through `createClient()` (request-scoped, carries the JWT); logs and returns `null` on error |
| `SpacingClass`, `getSpacingClasses()` | active `tree_spacing_classes` ordered by `sort_order`, via `unstable_cache(["spacing-classes-v1"], { tags: [PUBLIC_CONFIG_TAG], revalidate: 300 })`; a failure is logged and returns `[]` "so intake keeps working" |

`toTreeQuote` is the single place the "money only when priced" rule is enforced on the TypeScript side, and
`toProjectQuote` in `public-projects.ts` applies it a second time for the project quote.

### 23.12 Supporting modules in `src/lib/`

| File | Exports | Role |
|---|---|---|
| `auth.ts` | `ROLE_LABELS`, `ADMIN_ROLES`, `CRM_READ_ROLES`, `PRICE_ROLES`, `LAND_OFFER_ROLES`, `getStaffSession` (React `cache`d), `hasRole`, `requireStaff` | `getStaffSession` reads `auth.getClaims()`, then `profiles.is_active` and `user_roles` in parallel, and returns `null` unless the profile is active and at least one non-`client` role exists. `requireStaff` redirects rather than throwing |
| `auth-events.ts` | `logAuthEvent(action, headers, {userId, email})` | writes `auth.login`, `auth.login_failed`, `auth.login_denied`, `auth.logout` to `audit_logs` with the **service-role** client, because a failed sign-in has no session |
| `env.ts` | `publicEnv` | throws `Missing environment variable NAME. Add it to .env.` at import time; reads the two `NEXT_PUBLIC_*` literals so Next can inline them |
| `request-context.ts` | `clientIp(headers)`, `auditHeaders(headers)`, `hashIp(ip)` | `auditHeaders` forwards `x-client-ip` (≤64 chars) and `x-client-ua` (ASCII-filtered, ≤300) to Supabase for `app.write_audit`; `hashIp` is `sha256(IP_HASH_SALT + ":" + ip)` and **throws** when the salt is missing, so a misconfigured deploy fails loudly instead of storing raw IPs |
| `land.ts` | `LAND_STATUS_LABELS`/`_TONES` (8 statuses), `REVIEW_OUTCOME_LABELS`, `CAPACITY_LABELS`, `IRRIGATION_LABELS` (`rainfed` «بعلية», `irrigated` «مروية»), `REVIEW_STAGES`, `FINAL_STATUSES` | `IRRIGATION_LABELS` is also used on the two public project pages |
| `parcel-prices.ts` | `ParcelPrice`, `PARCEL_PRICE_REASONS`, `getStaffParcelPrices(supabase, projectId)`, `effectiveParcelFigures(parcel, prices)` | wraps `staff_project_parcel_prices`; an unreadable result returns an **empty Map** so admin pages keep showing typed values. `PARCEL_PRICE_REASONS` turns `spacing_required`, `spacing_not_allowed`, `trees_missing`, `margin_not_set` into instructions |
| `pricing-form.ts` | `PRICING_MODELS`, `PRICING_FIELDS`, `readPricingForm(source, {allowInherit})`, `draftFromPricing`, `draftSource`, `describePricing`, `formatAmount` | **no imports at all**, so the client editor and the Server Actions validate with identical rules; `PricingSource` is the minimal `{get, getAll}` interface satisfied by both `FormData` and the editor's draft |
| `site-media-upload.ts` | `SITE_MEDIA_BUCKET`, `isPickedFile`, `uploadSiteImage(supabase, folder, file)` | 5 MiB, four image types, `${folder}/${Date.now()}.${ext}` so a replaced picture is never cached |
| `supabase/public.ts` | `createPublicClient()` | anon, cookie-less — safe inside `unstable_cache` |
| `supabase/server.ts` | `createClient()` | `@supabase/ssr` with the request's cookies **and** `auditHeaders` |
| `supabase/admin.ts` | `createAdminClient(extraHeaders)` | service role; throws without `SUPABASE_SERVICE_ROLE_KEY`; "never import this from a Client Component" |
| `supabase/storage-upload.ts` | `getStorageUploadClient()`, `LAND_OFFER_BUCKET` | a memoised **browser** client that holds no session, used only with signed upload tokens |
| `supabase/proxy.ts` + `src/proxy.ts` | `updateSession(request)`, `proxy(request)`, `config.matcher = ["/admin/:path*"]` | refreshes the auth cookies and does an **optimistic** redirect to `/admin/login?next=…`; the comment states every page and action re-checks roles on the server |

### 23.13 Route-local shared functions

Not in `src/lib/`, but imported across route boundaries and therefore part of the shared surface:

| Function | File | Imported by |
|---|---|---|
| `calculatorQuery`, `calculatorGap`, `calculatorSummary`, `areaLine`, `moneyLine` | `src/app/(public)/start/calculator-summary.ts` | `/start` (client), `/register` (page + wizard types), `register/actions.ts` |
| `getCalculatorLists`, `readCalculatorChoices`, `quoteChoices`, `summaryInput` | `src/app/(public)/start/calculator.ts` | `/start`, `/register` |
| `startCopy(config)` | `src/app/(public)/start/copy.ts` | `/start`, `/register` |
| `offersTitle`, `offerStock`, `areaPerTree`, `longestDuration`, `StockCell`, `StockStrip`, `LegalNotes` | `src/app/(public)/projects/page.tsx` | `/projects/[code]`, `/projects/[code]/[parcel]`, `/` (home) |
| `parseLeadFilters`, `filtersToRpc`, `filtersToQuery`, `hasActiveFilters`, `downPaymentSummary`, `PAYMENT_MODE_LABELS`, `REQUEST_KIND*` | `src/app/admin/(panel)/leads/filters.ts` | leads page, export route, bulk-assign action |
| `offerSnapshots`, `requestKindOf`, `offerOf`, `searchReturnsKind` | `src/app/admin/(panel)/leads/offer-snapshot.ts` | leads page, export route, bulk-assign action |
| `treeStock`, `STOCK_BUCKET_OF`, `STOCK_BUCKET_LABELS`, `bucketSourceText` | `src/app/admin/(panel)/projects/stock.ts` | admin projects list, admin offer page, `stock-strip.tsx` |
| `resolveRange`, `tunisToday`, `daysAgo`, `RANGES`, `DemandStats` | `src/app/admin/(panel)/analytics/demand-stats.ts` | dashboard, analytics page |
| `readSimulation`, `simulationQuery` | `src/app/admin/(panel)/pricing/simulator-section.tsx` | pricing page |
| `readOfferTab`, `OFFER_TAB_LABELS` | `src/app/admin/(panel)/projects/[id]/offer-tabs.tsx` | admin offer page |
| `videoEmbedUrl` | `src/components/site/project-video.tsx` | its own component |
| `trailFor`, `ADMIN_LABELS`, `NAV_STATE_LABELS` | `src/components/admin/nav-model.ts` | admin layout, admin nav, admin breadcrumbs |
| `treePricingReady(config)` | `src/components/admin/legacy-pricing-notice.tsx` | admin offer page, admin parcel page |
| `millionCounterCopy(config)` | `src/components/site/million-counter.tsx` | home page |
| `primaryCta(config)` | `src/components/site/site-header.tsx` | public layout, home page |

Two pure formatting helpers worth naming because they live where nobody would look for them:
`millimesToInput`, `bpToInput`, `formatPercent`, `formatBp`, `formatMoney` in
`src/components/admin/tree-pricing-inputs.tsx` — `formatPercent` and `formatMoney` are imported by
`src/app/admin/(panel)/leads/filters.ts` and the leads page.

### 23.14 OBSERVATIONS — functions

- `src/lib/` splits cleanly into **server-only** modules (`config`, `modules`, `million`, `public-projects`,
  `tree-pricing`, `auth`, `auth-events`, `request-context`, `parcel-prices`, `site-media-upload`, the three
  Supabase server clients) and **isomorphic** ones (`format`, `digits`, `phone`, `errors`, `crm`, `projects`,
  `land`, `public-hrefs`, `pricing-form`, `modules-catalog`). Nothing crosses the line: no client component
  imports a `server-only` module.
- `toWesternDigits` exists in `src/lib/digits.ts` and is re-implemented inline in two other places
  (`src/lib/pricing-form.ts:83`, `src/components/admin/tree-pricing-spacing-fields.tsx:14`), each with its own
  `ARABIC_DIGITS` constant. `pricing-form.ts` does it deliberately — the file has no imports at all so the
  client editor and the Server Action share one validator.
- Three separate "money only when priced" checks exist: in SQL (`case when v_pricing = 'ok' then …`), in
  `toTreeQuote`, and again in `toProjectQuote`. The third is explicitly redundant and says so in a comment.
- `calculatorSummary()` is ~155 lines of pure formatting with no I/O, run on the client for `/start` and on the
  server for `/register`. It computes exactly one thing itself — `remainingShare()`, the percentage of the cash
  price left after the down payment — and the comment ties it to an owner decision of 2026-09-16.
- `offerStock()` and `areaPerTree()` are exported from a **page module**
  (`src/app/(public)/projects/page.tsx`), and both `/` and the two project pages import them from there. The
  home page's comment explains the choice: one definition of "how an offer is counted" rather than two.
- `getMillionProgress` is the only cached loader with no cache tag; it can be up to 60 s stale and no Back
  Office action can expire it.
- `hashIp` throws when `IP_HASH_SALT` is absent, which would make every public intake fail rather than store a
  raw IP. `env.ts` throws at import time for the two Supabase public variables.
- `src/lib/land.ts` declares `REVIEW_STAGES` and `FINAL_STATUSES`; the same eight statuses are re-declared as a
  Zod enum inside `src/app/admin/(panel)/land-offers/[id]/actions.ts` rather than derived from them.

---

## 24. COMPONENT MAP

### 24.1 `src/components/ui/` — the shared primitives

All server components, all styled through the class names in `globals.css` (`.card`, `.panel`, `.pill`,
`.stat`, `.section-title`, `.field`), all re-exported from `src/components/ui/index.ts`.

| Component | File | Props of note | Used by |
|---|---|---|---|
| `DataRow` | `data-row.tsx` | `label`, `children`, `layout: "inline" \| "stacked"`, `size: sm/md/lg`, `numeric`, `padded` | `offer-block`, `tree-offer-block`, `project-card`, `parcel-card`, `data-table`, `/projects/[code]`, `/projects/[code]/[parcel]`, admin parcel page, `pricing-tab`, `tree-pricing-quote`, `offer-interest-form` |
| `DataList` | `data-row.tsx` | `variant: "divided" \| "grid" \| "plain"`, `columns: 2\|3\|4` | `/projects/[code]`, `pricing-tab` |
| `StatTile` | `stat-tile.tsx` | `label`, `value` (a raw number is passed through `formatCount`), `note`, `href`, `emphasis`, `quiet`, `size` | dashboard, analytics, admin projects list, `stock-strip` |
| `StatusPill` | `status-pill.tsx` | `tone` (9 semantic tones) **or** `toneClass` (the ready-made strings from `src/lib`); `toneClass` wins | every page that shows a status, public and admin |
| `DataTable` | `data-table.tsx` | `caption`, `columns: Column<Row>[]`, `rows`, `rowKey`, `rowHref`, `minWidth`, `empty` | the leads list |
| `TableHeadCell` / `TableCell` | `data-table.tsx` | the `<th>`/`<td>` of hand-written tables | audit page, `tree-pricing-quote` |
| `FormField` | `form-field.tsx` | `label`, `id`, `hint`, `error`, `size` | admin forms, register wizard, offer interest form |
| `SectionHeader` | `section-header.tsx` | `title`, `description`, `level`, `badge`, `actions`, `as`, `id` | nearly every admin page, `/projects`, `/projects/[code]` |
| `EmptyState` | `empty-state.tsx` | `children`, `title`, `action`, `size`, `variant: "dashed" \| "plain"` | `/projects`, admin lists, pricing sub-sections |

`DataTable` is the one non-trivial primitive: each `Column` declares a `mobile` slot
(`"title" \| "aside" \| "body" \| "meta" \| "hidden"`) and an optional `desktop: false`, and the component
renders the table from md up **and** a card list below it from the same column description — so the phone view
is derived, not written twice. `rowHref` turns each phone card into a single `<Link>`, which is why columns
carrying their own `<Link>` set `desktop: false`.

Each file's header comment names the private copies it was written to replace and their exact line numbers; the
comments state the migration is a later, separate step, and several of those private copies are still in place.

### 24.2 `src/components/site/` — the public site

| Component | File | What it is | Used by |
|---|---|---|---|
| `SiteHeader` (+ `primaryCta`) | `site-header.tsx` | async server component; sticky bar, centred nav from md, a sideways-scrolling chip nav below md; links are `/#million`, `/#how`, `/projects` (only when `projects` is public, named from `settings["offers.title"]`), `/zitounti` (only when its flag is public) | public layout |
| `SiteFooter` | `site-footer.tsx` | legal notice, French tagline, phone/WhatsApp/e-mail (all from settings, rendered `dir="ltr"`), photo credits folded into a `<details>`, and the staff door `/admin/login` in a quiet strip | public layout |
| `StickyCta` | `sticky-cta.tsx` | `"use client"` — reads `usePathname()`; renders nothing when the label is empty or when the path matches `OWN_ACTION` (`/start`, `/register`, `/land`, `/projects/<code>` excluding `map`, `/projects/<code>/<parcel>`) | public layout |
| `SourceCapture` / `readVisitSource` | `source-capture.tsx` | `"use client"`; stores the first-touch `utm_*`, `ref`, `referrer` and `landing_path` in `sessionStorage["agrized:source"]`; every try/catch is silent | public layout writes it; the three intake forms read it |
| `ComingSoon`, `PreviewBanner` | `module-gate.tsx` | the «قريباً» page and the internal-preview banner «معاينة داخلية: هذا القسم غير منشور للعموم، ويراه فريق AgriZed فقط.» | `/start`, `/register`, `/land`, `/projects`, `/projects/[code]`, `/projects/[code]/[parcel]`, `/projects/map` |
| `Bi` | `bilingual.tsx` | Arabic first, French beneath; the page-scoped bilingual exception for `/start` | `Breadcrumb`, `TreeCardBody`, `start-chooser` |
| `Breadcrumb` | `breadcrumb.tsx` | `Crumb[]` with `aria-current="page"` on the last item | `/start` |
| `SitePhoto`, `RemotePhoto`, `GrovePlaceholder` | `site-photo.tsx` | a `site_media` slot (`SitePhoto`) or an arbitrary URL (`RemotePhoto`), falling back to a seeded drawn grove | home, `/start`, `project-card`, `parcel-card`, `offer-card`, `/projects/[code]`, `/projects/[code]/[parcel]` |
| `GrowthIcon` (+ `GROWTH_ICON_CODES`) | `growth-icon.tsx` | five inline SVGs: `bare_land`, `young_olive`, `near_production`, `productive`, default leaf | `start-chooser` scenario cards; the code list is validated by `saveScenario` |
| `OliveMark`, `treeCardClass`, `TreeCardBody` | `tree-card.tsx` | the olive mark scales with the tree count (24→46 px); `treeCardClass(selected, tone)` gives the light/dark variants | `million-start`, `home-paths`, `start-chooser` |
| `MillionStart` | `million-start.tsx` | the tree-count cards on the home page; each links to `/start?trees=<id>`, plus an «عدد آخر» card to `/start#custom` | home |
| `MillionCounter` (+ `millionCounterCopy`) | `million-counter.tsx` | «وين وصلنا؟»: a people line resolved from `million.people_bands`, a progress bar (hidden when `goal ≤ 0`, with `role="progressbar"` and real aria values), four stage tiles on one surface, two context counts as a quiet line; `formatShare` prints «أقل من 0.1%» rather than rounding up | home |
| `HomePath` | `home-paths.tsx` | the two doors: `variant="estimate"` on `.card-estimate` (dashed, no elevation) and `variant="stock"` on `.panel` | home |
| `OfferCard` (+ `OfferCardLabels`, `OfferCardStock`) | `offer-card.tsx` | the catalogue card: 16:9 cover with a forest scrim and the offer name over it, code · place, fact pills, the available-trees hero figure, area per tree, non-zero taken buckets, and the per-tree price or `projects.price_pending` | `/projects` (open and closed sections), home |
| `ProjectCard` | `project-card.tsx` | the older project card: area, tree count, area per tree, plantation, production, an «ابتداءً من» price and «N قطعة متبقية» | **no importer found in `src/`** |
| `ParcelCard` | `parcel-card.tsx` | one parcel: offer-type label, code, place, five facts, then either the tree-priced block (per-tree price, total, «ابتداءً من … تسبقة», «التقسيط حتى …») or the legacy cash block, or `pricePending` | `/projects`, `/projects/[code]` |
| `ParcelPlan` | `parcel-plan.tsx` | the schematic plan: one square tile per parcel coloured by status, with a status-count legend and an `sr-only` status on every tile | `/projects/[code]`, `lots-tab` |
| `OfferBlock` | `offer-block.tsx` | the legacy money block for `public_parcel_offer`: cash price, «التسبقة من …», the entry instalment, annual costs, worked examples, then the two legal notes | `/projects/[code]/[parcel]` |
| `TreeOfferBlock` | `tree-offer-block.tsx` | the tree-pricing money block for `public_project_quote`: per-tree price, trees, area per tree, total area, total price, then payment/down-percent/duration **chips that are links** (so the page stays server-rendered), then the instalment rows or an Arabic explanation of the failing status | `/projects/[code]/[parcel]` |
| `ProjectGallery` | `project-gallery.tsx` | a `<figure>` grid, each picture opening full size in a new tab | `/projects/[code]` |
| `ProjectVideo` (+ `videoEmbedUrl`) | `project-video.tsx` | accepts only https YouTube/Vimeo, embeds through `youtube-nocookie.com` and `player.vimeo.com/…?dnt=1`; anything else becomes a plain link «شوف الفيديو ↗» | `/projects/[code]` |

`src/components/brand/wordmark.tsx` holds the single `Wordmark` used by the header, footer, admin sidebar and
admin mobile header.

### 24.3 `src/components/admin/`

| Component | File | Role |
|---|---|---|
| `ActionForm` (+ `ActionResult`) | `action-form.tsx` | `"use client"`; `useActionState`, a `role="status"`/`role="alert"` message line and a disabled-while-pending submit. The wrapper behind every Back Office form |
| `ReasonField` | `reason-field.tsx` | the mandatory «سبب التغيير» textarea, `minLength` from `settings["audit.reason_min_length"]`, with the hint that the reason is stored and cannot be edited later |
| `AdminNav` | `../app/admin/(panel)/admin-nav.tsx` | `"use client"`; picks the current row as the **longest** covering href so a parent and child never both look current |
| `AdminBreadcrumbs` | `admin-breadcrumbs.tsx` | `"use client"`; renders `trailFor(pathname)`, separator is a middle dot ("a chevron would point the wrong way in RTL") |
| `nav-model.ts` | — | `ADMIN_LABELS` (15 named paths), `NAV_STATE_LABELS`, `NavItem`/`NavGroup` types, `trailFor`. Deliberately imports nothing from `@/lib/auth`, so it is safe on the client |
| `nav-icons.tsx` | — | 18 inline decorative SVGs on one 24×24 grid, plus `MenuIcon` |
| `SectionNotOpen` | `section-not-open.tsx` | the "this domain has no tables yet" page shape. **No importer found in `src/`** — the five sections it was written for were removed from the nav |
| `LegacyPricingNotice`, `treePricingReady` | `legacy-pricing-notice.tsx` | the notice on the jsonb pricing editors; `treePricingReady(config)` is `Object.hasOwn(config.flags, "pricing")` |
| `PricingEditor` | `pricing-editor.tsx` | `"use client"`; edits the jsonb formula with plain fields and validates live with `readPricingForm(draftSource(draft), …)` — the same function the Server Action runs |
| `DinarInput`, `PercentInput`, `millimesToInput`, `bpToInput`, `formatPercent`, `formatBp`, `formatMoney` | `tree-pricing-inputs.tsx` | no client state, so server and client forms share them |
| `MarginFields` | `tree-pricing-margin-fields.tsx` | `"use client"`; the margin mode select and the field it reveals; the empty option names the inherited global margin |
| `SpacingClassFields` | `tree-pricing-spacing-fields.tsx` | `"use client"`; row/tree spacing with a live area preview, and a `reset` listener so the preview follows the form back to its defaults after a successful action |
| `QuoteBreakdown` | `tree-pricing-quote.tsx` | the readable breakdown of `staff_tree_quote`: land, planting, extras, cost, margin, price, and the instalment figures, with Arabic reasons for a refused quote |
| `BarList`, `DailyColumns`, `ChartCard` | `charts.tsx` | server-rendered charts in plain HTML/CSS, one mark colour `#5f7f2f`, current period emphasised `#1f4a2c`, with a table view for the columns |
| `DemandMap` | `demand-map.tsx` | a tile cartogram of the governorates (`map_row`/`map_col`), a 5-step olive ramp whose two darkest steps carry white text, the value printed on every tile and an equivalent table for screen readers |

### 24.4 Route-local components

| Component | File | Notes |
|---|---|---|
| `StartChooser` | `src/app/(public)/start/start-chooser.tsx` (1162 lines) | the configurator; see 25.1 |
| `RegisterWizard` (+ `IdentityStep`, `LocationStep`, `VisitStep`, `ContactStep`, `ReviewStep`, `Progress`, `SingleChoice`, `YesNoGroup`, `Success`) | `src/app/(public)/register/register-wizard.tsx` (1078 lines) | six steps; see 25.2 |
| `OfferInterestForm` | `src/app/(public)/projects/[code]/offer-interest-form.tsx` (412 lines) | the offer's own form; see 25.3 |
| `LandOfferForm` | `src/app/(public)/land/land-offer-form.tsx` (646 lines) | the landowner intake with browser-side uploads |
| `CapacitySimulator` | `src/app/(public)/simulator/capacity-simulator.tsx` | **orphaned**: its page is now a redirect to `/start` |
| `OfferTabs`, `CardTab`, `LotsTab`, `PicturesTab`, `PricingTab`, `CostsTab`, `OfferIdentity` | `src/app/admin/(panel)/projects/[id]/*` | the five tabs of an offer, each addressable as `?tab=…`; server components, so switching needs no JavaScript |
| `LotsTable`, `ParcelFields`, `StockStrip`, `StockLine` | `src/app/admin/(panel)/projects/*` | the lot table and the tree-stock strip |
| `BulkAssignBar`, `SelectAllCheckbox` | `src/app/admin/(panel)/leads/bulk-assign.tsx` | the bulk transfer bar |
| `Section`, `RuleForm`, `RatesSection`, `SpacingSection`, `CostItems`, `MarkupsForm`, `ProjectSection`, `AllowedChoicesForm`, `SimulatorSection`, `NoteCallout` | `src/app/admin/(panel)/pricing/*` | the pricing page, split by concern |
| `PairListEditor` | `src/app/admin/(panel)/settings/pair-list-editor.tsx` | edits a json list of two-field items (steps, FAQ) and submits it as one hidden value |
| `PublicError`, `GlobalError` | `src/app/(public)/error.tsx`, `src/app/global-error.tsx` | Arabic error boundaries; `PublicError` shows `error.digest` as «رمز المشكلة» and offers `reset()` |

### 24.5 OBSERVATIONS — components

- **Two card components for the same thing.** `OfferCard` (192 lines, written 2026-09-18) is what `/projects`
  and the home page render. `ProjectCard` (86 lines) renders the same `PublicProject` with a different layout
  and is imported by nothing in `src/`. Likewise `SectionNotOpen` has no importer since the five unbuilt
  sections left `nav-model.ts`.
- **Two money blocks on one page.** `/projects/[code]/[parcel]` chooses `TreeOfferBlock` when
  `parcel.on_tree_pricing` and `OfferBlock` otherwise. They format different payloads (`ProjectQuote` vs
  `ParcelOffer`), carry independent copies of the same legal-note footer, and each declares its own private row
  helper although `DataRow` exists and both import it.
- The `src/components/ui/` files each carry a header comment listing, by file and line, the private copies they
  were meant to replace. Several of those call sites still hold their own copy — the migration is described in
  the comments as a later, separate step.
- Client boundaries are narrow and deliberate. The only `"use client"` components on the public site are
  `StartChooser`, `RegisterWizard`, `OfferInterestForm`, `LandOfferForm`, `StickyCta` and `SourceCapture`.
  `TreeOfferBlock` keeps its payment/duration pickers as `<Link>` chips specifically to stay a server
  component, and `OfferTabs` does the same with `?tab=`.
- Every component that renders money takes it as a pre-computed integer and formats it. The only arithmetic in
  a component is `OfferInterestForm`'s `pricePerTreeMillimes × trees` (justified in a comment by
  `v_total := v_per_tree * v_trees` in migration 0034, and recomputed by the database on submit) and the
  `remainingPercent` line in `TreeOfferBlock`.
- Arabic copy is split three ways: public user-facing text comes from `settings` through `settingText`; status
  vocabulary comes from the maps in `src/lib/{crm,projects,land}.ts`; Back Office staff labels are written
  directly in the component files (`nav-model.ts` states this precedent explicitly).

---

## 25. DATA FLOW, UI → DATABASE

### 25.1 The configurator — `/start`

```
GET /start?trees=…&trees_custom=…&scenario=…&spacing=…&payment=…&down_pct=…&duration=…&visit=1
  └ src/app/(public)/start/page.tsx  (server)
      getPublicConfig()                     → settings, flags, lists, scenarios, media   [cached 300 s]
      moduleAccess(config, "interest_form") → "closed" ⇒ <ComingSoon title={copy.title}/>
      startCopy(config)                     → ~90 copy keys, each settings-backed
      getCalculatorLists(config)            → tree_count, scenarios, getSpacingClasses(),
                                              down_payment_percent, duration,
                                              million.custom_trees_min/max
      readCalculatorChoices(lists, params)  → every URL value checked against the current list; unknown → null
      moduleAccess(config, "projects")      → offersOpen, for the last screen's link
  └ <StartChooser …/>  (client)
```

Inside `StartChooser` the visitor answers one question per screen. `steps` is computed from the data —
`["trees", ("spacing" if classes), ("type" if scenarios), "payment", ("down" if installments && percents),
("duration" if installments && durations), "summary"]` — so an empty Back Office list removes its screen. The
initial step is derived from `calculatorGap(initial, …)`: a complete URL opens straight on `summary`.

Every answer change fires the quote:

```
useEffect (debounced 250 ms, sequence-guarded by quoteSeq)
  → quoteStart({ spacingClassId, trees, paymentMode, downPercentOptionId, durationOptionId })   [Server Action]
      → publicTreeQuote()  → createClient()   (carries the visitor's / staff JWT)
          → RPC public.public_tree_quote(...)
              app.module_open('pricing')                   → 'closed' | continue
              app.tree_price(class, null)                  → price_per_tree_millimes,
                                                             annual_fee_per_tree_millimes
              total = per_tree × trees
              app.down_payment_from_percent(total, %, null)
              app.financed_quote(total, down, months, null)  ← markup from financing_markups
      ← jsonb → toTreeQuote() → TreeQuote | null
  → calculatorSummary({copy, tree, treesCustom, scenario, withSpacing, areaPerTreeM2,
                       paymentMode, downPercent, duration, quote})
      → rows (trees, type, area_per_tree, total_area, price_per_tree, total_price, annual_fee,
              payment, down, duration, total_financed, remaining, monthly), notice, priced
```

`quoteTrees` is `chosenTree.min_number` for a tier or the typed number for a custom count; when the visitor
answered «اقترحولي» (no spacing class) the effect returns early and the card shows no figures.

Two things travel out of the component:

- `window.history.replaceState(window.history.state, "", "/start?" + calculatorQuery(choices, wantsVisit))` on
  every change, so a reload, a shared link and the browser's back button all keep the answers. The comment
  records that replacing the router's own history state with `null` breaks the next link click.
- The continue button's `href` is `/register?${calculatorQuery(choices, wantsVisit)}`, and it is only offered
  once `calculatorGap(choices, {downPercents, durations}) === null`.

**Never leaves the database:** the land price, the planting cost, the extra cost items, the cost, the margin,
the markup and the rounding steps. `public_tree_quote`'s `comment on` states this and `app.tree_price` is
revoked from `anon`/`authenticated`.

### 25.2 Registration — `/register`

```
GET /register?<the same query>
  └ src/app/(public)/register/page.tsx  (server)
      moduleAccess("interest_form")                  → closed ⇒ <ComingSoon/>
      getCalculatorLists + readCalculatorChoices
      if no treeId and no treesCustom → redirect(`/start${forwardedQuery(params)}`)   (P2-6: /start owns those questions)
      moduleAccess("projects") ⇒ getPublicProjects(publicMode(access))
            .filter(offered && on_tree_pricing && tree_count > 0)
            → SuccessOffer[]  (code, name, place, href, cover, trees, areaPerTree, pricePerTree — all pre-formatted)
      quoteChoices(lists, choices) → publicTreeQuote(...)        [same RPC as /start]
      calculatorSummary(summaryInput(...)) → RecapRow[] (Arabic only) + notice + priced
      calculatorGap(...) → recap.error
  └ <RegisterWizard …/>  (client, 6 steps)
```

The wizard asks only what `/start` did not: identity, invest locations, goal, visit/bank questions, contact
channel and time, consent. A draft of those answers lives in `localStorage["agrized:register-draft-v4"]` and is
rebuilt field-by-field by `sanitize()` so retired list values are dropped. `validateStep` runs per step and
again for all six on submit.

```
submit()
  → every step revalidated; recap.error ⇒ a calculator-scoped error, no call is made
  → submitInterest({identity, place, calculator answers from `choices`, goal, visit, bank,
                    contact, consent:true, website:honeypot, source: readVisitSource()})
      ① flagState("interest_form")
      ② Zod interestSchema  (+ mutual exclusion of treeCountOptionId / treeCountCustom)
      ③ honeypot
      ④ calculatorGap(..., {downPercents: optionsFor(config,"down_payment_percent").length,
                             durations: optionsFor(config,"duration").length})
      ⑤ normalizePhone(phone, settings["lead.allow_international_phone"]) ; WhatsApp with allowInternational=true
      ⑥ createAdminClient(auditHeaders(headers))            ← service role, forwards x-client-ip / x-client-ua
         RPC submit_interest_request(p)
              validate ~20 fields against the live lists   → P0001 codes
              app.check_throttle('interest:ip', hashIp(clientIp), 1h, antispam.max_requests_per_ip_per_hour)
              per-phone 24 h count            → 'rate_limited'
              upsert persons on phone_e164    → v_inserted decides is_duplicate
              crm.auto_assign_mode = 'round_robin' ⇒ persons.assigned_to + person_assignments
              recompute prices via app.tree_price / app.financed_quote  (only while pricing is open)
              request_no = request_no.prefix-YYYY-NNNNNN   via app.next_number
              insert interest_requests (≈60 columns, every label and bound snapshotted)
              app.enqueue_message('lead.confirmation', …)  → notification_outbox
         ← { request_no }
  ← { ok:true, requestNo }  → localStorage draft cleared → <Success …/>
```

The success screen recaps `SUCCESS_ROWS = ["trees","area_per_tree","total_area","payment","total_price"]`, the
welcome/motivation copy from `register.success_*` settings, and the live `offers` list the page prepared.

### 25.3 Offer request submission — `/projects/[code]`

This is a **second, separate intake** (migration 0049, owner 2026-09-18: «in the offers it's a separate form»).
No calculator answer reaches it and it carries no `goal`.

```
GET /projects/<code>  (server, dynamic = "force-dynamic")
  moduleAccess("projects") → closed ⇒ <ComingSoon/>
  getPublicProjects(mode), getPublicParcels(mode), getProjectPage(code, mode)
  offerTrees = project.tree_count ?? 0
  offerQuote = offerTrees > 0 && project.on_tree_pricing
               ? await getProjectQuote(project.id, mode, { trees: 1 })   ← ONE tree prices the offer
               : null
  formOpen = selling && flagState("interest_form") === "public" && offerTrees > 0
  <OfferInterestForm projectId maxTrees={offerTrees}
      figures={{ pricePerTreeMillimes, annualFeePerTreeMillimes, areaPerTreeM2 }}   ← all from offerQuote, or null
      … 15 copy props, each settingText(...) />
```

The comment above `offerTrees` records a fixed bug: the count must not depend on a price. It used to be
`project.on_tree_pricing ? tree_count : 0`, which hid the form on every offer because `on_tree_pricing` is
false until the offer lists a spacing class. The form is now offered on the offer's own trees, and the price
rows fall back to `projects.price_pending`.

```
OfferInterestForm (client)
  trees = parseInt(toWesternDigits(input)); valid = 1 ≤ trees ≤ maxTrees ; QUICK_PICKS = [1,5,10,25,50]
  total       = pricePerTreeMillimes × trees        (comment cites v_total := v_per_tree * v_trees, 0034)
  annualTotal = annualFeePerTreeMillimes × trees
  area        = areaPerTreeM2 × trees
  submit → submitOfferInterest({projectId, trees, identity, contact, consent, website, source})
      ① moduleAccess("projects") ≠ "closed"       else 'offer_not_available'
      ② Zod offerSchema        ③ honeypot        ④ normalizePhone ×2
      ⑤ createAdminClient(auditHeaders) → RPC submit_offer_request(p)
            identity rules identical to submit_interest_request
            project must exist and be in app.project_public_statuses()   else 'offer_not_available'
            1 ≤ trees ≤ projects.tree_count                              else 'invalid_offer_trees'
            app.project_quote_payload(project, null, trees, 'cash', null, null, false)
                → pricing, spacing_class_id, label_ar, area_per_tree_m2, total_area_m2,
                  price_per_tree_millimes, total_price_millimes,
                  annual_fee_per_tree_millimes, annual_fee_total_millimes
            app.check_throttle + per-phone limit (shared with the calculator intake)
            upsert persons ; optional round-robin assignment
            insert interest_requests with request_kind='offer', the five offer_* columns,
                   AND the shared columns (tree_count_code='offer', tree_count_min/max=trees,
                   invest_governorate_ids=[project.governorate_id], project_type_unsure=true, …)
            app.enqueue_message('lead.confirmation', …, {offer: project.name})
      ← { request_no, project_code }
```

The price is therefore snapshotted **twice through the same builder**: once for display (one tree, multiplied in
the browser) and once authoritatively at submit time (the real tree count, computed in Postgres).

In the Back Office, that request appears in the ordinary leads list — but `crm_search_requests` does not return
`request_kind`, so `src/app/admin/(panel)/leads/offer-snapshot.ts` re-reads `interest_requests` by id for the
rows on screen, and `requestKindOf`/`offerOf` decide the «نوع الطلب» chip and the offer columns.

### 25.4 Admin offer creation

```
/admin/projects  (requireStaff())
  reads projects + parcels(project_id, status, olive_tree_count) directly, under RLS
  treeStock(lots) → total / available / reserved / sold, per offer and summed
  «+ عرض جديد» → <ActionForm action={saveProject.bind(null, null)}>  (code, name, governorate,
        project type, total area, status)
      → saveProject → projects insert → revalidatePath("/admin/projects") + expirePublicProjects()

/admin/projects/[id]?tab=…   (requireStaff(); WRITE_ROLES to change; FINANCE_ROLES for التكاليف)
  reads projects.*, settings["pricing.default","audit.reason_min_length"],
        project_spacing_classes → tree_spacing_classes, parcels.*, project_media
  getStaffParcelPrices(supabase, id) → RPC staff_project_parcel_prices → Map<parcelId, ParcelPrice>
  effectiveParcelFigures(parcel, prices) → the area and cash to show per lot
  warnings: lots' area > offer area; lots' trees > offer tree_count; available lots with no price;
            «هذا العرض بلا فئة مساحة: …» with a link to ?tab=pricing
  tabs:
    card     → CardTab     → saveProject.bind(null, id)               (full form, page_fields present)
    lots     → LotsTab     → saveParcel.bind(null, id, null|parcelId) (+ ParcelPlan, LotsTable)
    pictures → PicturesTab → addProjectPicture / setProjectCover / moveProjectPicture / removeProjectPicture
    pricing  → PricingTab  → saveOfferSpacingClasses.bind(null, id)   (+ <ReasonField minLength={reasonMin}/>)
    costs    → CostsTab    → addProjectCost.bind(null, id)
```

The chain that makes an offer priceable:

```
PricingTab  → saveOfferSpacingClasses(projectId, formData{ids[], reason})
            → requireStaff(PRICE_ROLES)
            → RPC staff_save_project_spacing_classes(p_project, p_class_ids, p_reason)
                  app.can_price()               → 42501 otherwise
                  app.set_reason(p_reason)      → 'reason_required' otherwise; stored transaction-locally
                  lock projects row FOR NO KEY UPDATE
                  every id must be an ACTIVE tree_spacing_classes row   → 'invalid_spacing_class'
                  delete the classes left out (trigger app.check_project_class_in_use may raise
                        'spacing_used_by_parcels'), insert the new ones ON CONFLICT DO NOTHING
                  app.write_audit('pricing.project_classes_save', …, old, new)
            → revalidatePath("/admin/projects/<id>"), revalidatePath("/admin/pricing"), expirePublicProjects()
```

From that moment `app.project_on_tree_pricing(project)` is true, `app.parcel_price(parcel)` computes
`trees × app.tree_price(class, project)` instead of reading the stored cash price, `saveParcel` switches to its
tree branch (area derived, `cash_price_millimes = 0`), and `/projects` starts publishing
`min_price_per_tree_millimes`.

The rates themselves live on `/admin/pricing` (`requireStaff(PRICE_ROLES)`), which reads
`tree_spacing_classes`, `tree_pricing_rules`, `tree_cost_items`, `financing_markups`, `projects`,
`settings["audit.reason_min_length","pricing.max_months"]` and `profiles`, and writes through the nine
`staff_*` RPCs — each one gated by `app.can_price()`, each one requiring a written reason, each one ending in
an `app.write_audit` line naming the event (`pricing.rule_save`, `pricing.cost_item_delete`,
`pricing.project_classes_save`, …). Its «محاكاة السعر» section calls `staff_tree_quote` and renders
`QuoteBreakdown`, which is the only screen in the product that shows land price, planting cost, extras, cost,
margin and markup.

### 25.5 Publication

Publication is two independent switches, and both must be on.

**① The module flag.**

```
/admin/settings/modules  (requireStaff(ADMIN_ROLES))
  → setModuleState(key, formData{state ∈ disabled|internal|public})
      isImplementedModule(key) || state === "disabled"
      key === "projects" && state === "public"  ⇒ REFUSED («المشاريع تبقى «داخلي فقط» …»)
      feature_flags update  → audit trigger records it
      updateTag(PUBLIC_CONFIG_TAG)
      key === "projects" ⇒ updateTag(PUBLIC_PROJECTS_TAG) + revalidatePath("/projects", "layout")
```

The flag is then read in two places for the same request: in SQL by `app.module_open(key)` inside every public
RPC, and in TypeScript by `flagState`/`moduleAccess`. `internal` means "staff only": `app.is_staff()` in SQL,
`getStaffSession()` in `moduleAccess`, and the visitor-facing pages render `<PreviewBanner/>` above the content.

**② The project status.** `saveProject` writes `projects.status`; `app.project_visible(status)` gates every
public read:

| status | `/projects` listing | parcels priced |
|---|---|---|
| `draft`, `preparing`, `archived` | never | — |
| `internal` | staff only (`app.is_staff()`) | no (`app.parcel_offered` requires `published`) |
| `published` | yes | yes |
| `sold_out`, `operating` | only when `settings["projects.list_closed"]` | no |

A third gate applies to money alone: `public_projects().min_price_per_tree_millimes` and every priced column of
`public_parcels()` also require `app.module_open('pricing')`.

Cache invalidation on publication: `expirePublicProjects()` → `updateTag(PUBLIC_PROJECTS_TAG)` (the 60 s
`cachedAnonRpc`) + `revalidatePath("/projects", "layout")`. The home page is separate — it is
`export const revalidate = 60` and reads `getPublicProjects("anon")` through the same tagged cache.

### 25.6 Public display

```
/  (prerendered, revalidate = 60)
   getPublicConfig()
   flagState("public_statistics") === "public" ⇒ getMillionProgress() → RPC million_progress()  → <MillionCounter/>
   flagState("projects")          === "public" ⇒ liveOffers() → getPublicProjects("anon") + getPublicParcels("anon")
                                                   (try/catch: a failing RPC leaves the section empty)
   offerStock(offer, parcels) per offer ; areaPerTree(offer) ; price only when flagState("pricing") === "public"
   → <HomePath variant="estimate" href=/start>  |  <HomePath variant="stock" href=/projects>
   → <OfferCard …/> × 3   → <MillionStart/>  (tree cards → /start?trees=<id>)

/projects  (force-dynamic)
   moduleAccess("projects") ; publicMode(access)
   getPublicProjects(mode) + getPublicParcels(mode)
   open = published|internal ; closed = sold_out|operating
   readFilters(searchParams, config) → gov, del, type, trees, area, price, available   (each validated against config)
   matches(parcel, filters, config) → the parcel grid
   pricingOpen = moduleAccess("pricing") ≠ "closed"  → offerTreePrice(project, pricingOpen)
   → <OfferCard/> grids + <FilterForm/> (plain GET form) + <ParcelCard/> grid + <LegalNotes/>

/projects/[code]  (force-dynamic)
   + getProjectPage(code, mode) → description, water, access, video, lat/lng (only when show_location),
                                  document/service option ids, gallery
   + getProjectQuote(project.id, mode, {trees: 1}) when the offer is tree-priced
   layout: identity → the two hero figures (price or area, and available trees) → cover →
           three fact groups (land / trees / paperwork) → two doors → <OfferInterestForm/> →
           <ParcelPlan/> + <ParcelCard/> grid → <LegalNotes/> → payment / services / visit cards

/projects/[code]/[parcel]  (force-dynamic)
   parcel.on_tree_pricing
     ? getProjectQuote(parcel.project_id, mode, {spacingClassId, trees: olive_tree_count,
                                                 paymentMode, downPercentOptionId, durationOptionId})  → <TreeOfferBlock/>
     : getParcelOffer(parcel.id, mode, {down, installment})                                             → <OfferBlock/>
   neither ⇒ notFound()
   canAsk → interestHref({parcelId, treesCustom|trees, spacing|scenario, payment, downPercent, duration})
            and the same href with visit:true for «نحب نزور الأرض»

/projects/map  (force-dynamic)
   getCoverage(mode) → RPC public_coverage() → counts per governorate, no money at all
```

Every money block on the public site ends with the same two texts, read from `settings`:
`legal.parcel_card_note` and `legal.no_guarantee_notice` (`LegalNotes`, `OfferBlock`, `TreeOfferBlock`), and
`start.estimate_note` accompanies every amount on `/start`, `/register` and the offer form.

### 25.7 OBSERVATIONS — data flow

- **One shared identity, two intakes.** `submit_interest_request` and `submit_offer_request` both upsert
  `persons` on `phone_e164`, share `app.check_throttle('interest:ip', …)` and the same per-phone daily limit,
  and both enqueue `lead.confirmation`. They differ in what they snapshot and in `request_kind`. The comment in
  0049 states the intent: "one person is one person in both flows".
- **The offer form is the only place where a number is multiplied in the browser.** The component computes
  `pricePerTreeMillimes × trees` for display; `submit_offer_request` recomputes the same total in Postgres and
  stores that one. If a rate changes between page render and submit, the stored figure is the database's.
- **Three price paths coexist.** `/start` quotes with `app.tree_price(class, null)` — no project, the one
  global rate card. An offer page quotes with `app.project_quote_payload(project, …)` — the project's own rules.
  A legacy parcel quotes with `app.parcel_offer_payload` → `compute_installment_plan` on the jsonb formula of
  migration 0013. All three can be reached in the same session.
- **The `/start` ⇄ `/register` URL contract is written in two files.** `calculatorQuery()` in
  `src/app/(public)/start/calculator-summary.ts` writes it; `interestHref()` in `src/lib/public-hrefs.ts`
  writes the same parameter names from the parcel page; `readCalculatorChoices()` in
  `src/app/(public)/start/calculator.ts` reads it. The three agree today on `trees`, `trees_custom`, `scenario`,
  `spacing`, `payment`, `down_pct`, `duration`, `visit`. `interestHref` additionally emits `parcel`, which
  `readCalculatorChoices` does not read and `submitInterest` does not send — a parcel chosen on a parcel page
  does not reach `interest_requests` through the calculator flow.
- **`calculatorGap` runs three times** for one submission: in `StartChooser` (to enable the continue button),
  in `RegisterPage` (to render `recap.error`), and in `submitInterest` (to refuse the call). The database
  raises the same conditions a fourth time as `invalid_tree_choice` / `invalid_payment_mode` /
  `down_payment_percent_required` / `duration_required`.
- **Publication cannot currently reach the public.** `setModuleState` refuses `projects: "public"`
  unconditionally, so `/projects`, `/projects/[code]`, `/projects/[code]/[parcel]` and `/projects/map` are
  reachable only by signed-in staff (module state `internal` → `moduleAccess` returns `"preview"`), and the
  home page — which reads `flagState(...) === "public"` and never the staff session — shows no offers at all.
- **The home page reads the public projects RPCs with `"anon"` explicitly**, not through `publicMode`, because
  it is prerendered; a staff member browsing `/` therefore sees exactly what a visitor sees, while `/projects`
  shows them the internal rows.
- `getProjectQuote` swallows every error and returns `null`, and `getStaffParcelPrices` returns an empty Map on
  failure. Both are documented as deliberate fallbacks to the pre-migration behaviour, which means a broken RPC
  degrades into "no price shown" rather than an error the reader can see.

---

### Could not determine from current codebase

- Whether `supabase/pending/bb_crm_offer_columns.sql` has been applied to any environment. The code is written
  for both cases (`requestKindOf` reads the row first and falls back to the snapshot map), and
  `src/app/admin/(panel)/leads/offer-snapshot.ts` states it is "drafted and NOT applied".
- Whether any worker consumes `public.notification_outbox`. Nothing in `src/` reads or updates that table; the
  only writer is `app.enqueue_message` inside the three intake RPCs.
- The runtime state of every `feature_flags` row (which modules are `public`, `internal` or `disabled` today).
  Migrations seed initial states, later migrations and the Back Office can change them, and the live values are
  not in the repository.
