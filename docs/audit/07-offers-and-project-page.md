## 07. OFFERS, THE PUBLIC OFFER PAGE, AND ADMIN OFFER CREATION / EDITING

Covers sections **7 (PROJECTS / OFFERS)**, **8 (PROJECT PAGE)** and **12 (ADMIN PROJECT CREATION / EDITING)**.

Vocabulary note, because the code uses two words for one thing: the database, the RPCs and every route
still say **project** / **parcel** (`public.projects`, `public.parcels`, `/projects/[code]`,
`/admin/projects/[id]`). The Arabic user interface — public and Back Office — says **عرض** (offer) and
**قطعة / لوط** (lot). `src/app/admin/(panel)/projects/page.tsx` is titled `العروض`, its component is
`OffersPage()`, and the public section is named from the setting `offers.title` = «عروضنا». Nothing was
renamed in the schema. This report uses "offer" and "project" interchangeably and always cites the real
identifier.

**Working-tree caveat.** Another process was editing files under `src/app/(public)/` during this audit.
Every public file cited below was read whole and was syntactically complete at read time:
`src/app/(public)/projects/page.tsx` (458 lines), `src/app/(public)/projects/[code]/page.tsx` (512 lines),
`src/app/(public)/projects/[code]/[parcel]/page.tsx` (231 lines),
`src/app/(public)/projects/[code]/offer-interest-form.tsx` (413 lines),
`src/app/(public)/projects/[code]/offer-actions.ts` (104 lines). None of them was truncated or mid-edit.

---

# SECTION 7 · PROJECTS / OFFERS

## 7.1 · CURRENT IMPLEMENTATION — the entity, table by table

An "offer" is not one row. It is a `public.projects` row plus, optionally:

| Table | Introduced | Cardinality | What it holds |
|---|---|---|---|
| `public.projects` | `0012_projects_and_parcels.sql`, extended by `0023_project_page_v3.sql` | 1 | Identity, location, land facts, publication status, page copy, formula |
| `public.parcels` | `0012`, extended by `0034_project_quote.sql` | 0..n | The lots the offer is cut into |
| `public.project_costs` | `0012`, `kind` widened by `0022_cards_and_costs_v3.sql` | 0..n | Internal budget (Finance/Admin only) |
| `public.project_media` | `0023` | 0..`projects.gallery_max` (24) | Gallery pictures + cover |
| `public.project_spacing_classes` | `0031_tree_pricing.sql` | 0..n | Which planting classes the offer sells (the switch to tree pricing) |
| `public.project_down_payment_percents` | `0031` | 0..n | Down-payment percentages this offer allows |
| `public.tree_pricing_rules` | `0031`, `annual_fee_per_tree_millimes` added by `0045_annual_fee.sql` | 0..1 per project + 1 global | Land price, planting cost, annual fee, margin |

### 7.1.1 `public.projects` — every column

Base definition, `supabase/migrations/0012_projects_and_parcels.sql`:

| Column | Type / constraint | Written from | Public? |
|---|---|---|---|
| `id` | `uuid` PK, `gen_random_uuid()` | database | yes (as `id`) |
| `code` | `text not null unique` | typed once on create | yes |
| `name` | `text not null` | admin form | yes |
| `project_type_id` | `uuid → project_types(id)` | admin select | yes (id only) |
| `governorate_id` | `smallint not null → governorates(id)` | admin select | yes |
| `delegation_id` | `integer → delegations(id)` | admin form (conditional write) | yes |
| `location_description` | `text`, `length ≤ 1000` | admin form | yes |
| `latitude` | `numeric(9,6)`, between −90 and 90 | admin form | **only when `show_location`** |
| `longitude` | `numeric(9,6)`, between −180 and 180 | admin form | **only when `show_location`** |
| `total_area_m2` | `numeric(12,2) > 0` | admin form | yes |
| `olive_variety` | `text` | admin form | yes |
| `tree_count` | `integer ≥ 0` | admin form | yes |
| `tree_age_years` | `numeric(4,1) ≥ 0` | admin form | yes |
| `plantation_system` | `text in ('traditional','intensive','other')` | admin select | yes |
| `production_status` | `text in ('none','starting','producing')` | admin select | yes |
| `irrigation` | `public.irrigation_type` | admin select | yes |
| `pricing` | `jsonb not null default '{}'` | `PricingEditor` | **never** |
| `annual_costs_millimes` | `bigint ≥ 0` | admin form (dinars ×1000) | **never** (not in any public RPC signature) |
| `plan_storage_path` | `text` | — no writer in the codebase | **never** |
| `legal_notes` | `text` | — no writer in the codebase | **never** |
| `status` | `public.project_status not null default 'draft'` | admin select | yes |
| `land_offer_id` | `uuid → land_offers(id)` | — no writer in the projects admin | **never** |
| `created_at` / `updated_at` / `updated_by` | timestamps + actor | triggers | never |

Added by `0023_project_page_v3.sql` (the "project page" fields):

| Column | Type / constraint | Public? |
|---|---|---|
| `description_ar` | `text`, `projects_description_length` ≤ 4000 | yes |
| `water_available` | `boolean` (null = "not stated") | yes |
| `water_note` | `text` ≤ 300 | yes |
| `access_note` | `text` ≤ 300 | yes |
| `video_url` | `text`, `projects_video_shape`: `^https://[^ ]+$` and ≤ 500 | yes |
| `show_location` | `boolean not null default false` | gate only |
| `document_option_ids` | `uuid[] not null default '{}'`, `cardinality ≤ 30` | yes (ids) |
| `service_option_ids` | `uuid[] not null default '{}'`, `cardinality ≤ 30` | yes (ids) |

Triggers on `projects`: `projects_stamp` (BEFORE UPDATE → `app.stamp_updated()`), `projects_audit`
(AFTER INSERT/UPDATE/DELETE → `app.audit_row_change()`).

Indexes: `projects_status_idx (status, created_at desc)`, `projects_location_idx (governorate_id, delegation_id)`.

### 7.1.2 `public.parcels` — every column

| Column | Type / constraint | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `project_id` | `uuid not null → projects(id)` | |
| `code` | `text not null`, `unique (project_id, code)` | typed |
| `area_m2` | `numeric(12,2) not null > 0` | **typed on legacy offers, overwritten by a trigger on tree-priced ones** |
| `property_type` | `text not null in ('bare_land','planted')` | |
| `plantation_system` | `in ('traditional','intensive','other')` | |
| `olive_tree_count` | `integer ≥ 0` | commented in 0012: *"Actual number of olive trees entered by the administration. Never computed from area_m2 (PARC-02)."* |
| `tree_age_years` | `numeric(4,1) ≥ 0` | |
| `production_status` | `in ('none','starting','producing')` | |
| `irrigation` | `public.irrigation_type` | |
| `cash_price_millimes` | `bigint not null ≥ 0` | typed on legacy; written as literal `0` on tree-priced parcels |
| `annual_costs_millimes` | `bigint ≥ 0` | |
| `pricing` | `jsonb` (nullable = inherit project's) | never public |
| `status` | `public.parcel_status not null default 'available'` | |
| `notes` | `text ≤ 2000` | never public |
| `sort_order` | `integer not null default 0` | |
| `spacing_class_id` | `uuid → tree_spacing_classes(id) on delete restrict` (added `0034`) | |
| `created_at` / `updated_at` / `updated_by` | | |

Triggers on `parcels`, in name order (BEFORE triggers fire alphabetically, which `0035` relies on):
1. `parcels_spacing_class_check` (`0034`, BEFORE INSERT OR UPDATE OF `spacing_class_id`, `project_id`) →
   `app.check_parcel_spacing_class()`: takes `for share` on the project row and raises
   `parcel_spacing_not_in_project` if the class is not one the project lists.
2. `parcels_stamp` → `app.stamp_updated()`.
3. `parcels_tree_unit_sync` (`0035`, BEFORE INSERT OR UPDATE) → `app.parcel_tree_unit_sync()`: on a
   project that lists spacing classes, fills `spacing_class_id` from the project's single class when
   null, then **overwrites `new.area_m2 := new.olive_tree_count * class.area_m2`**.
4. `parcels_audit` → `app.audit_row_change()`.

Plus a fan-out on the class itself: `tree_spacing_classes_area_fanout` (`0035`, AFTER UPDATE OF
`row_spacing_m`, `tree_spacing_m`) re-computes `parcels.area_m2` for every parcel of every tree-priced
project using that class.

### 7.1.3 `public.project_media`

`id`, `project_id` (`on delete cascade`), `url` (`^https://[^ ]+$`, ≤1000), `storage_path` (≤300, null for
an external address), `alt_ar` (`not null`, trimmed length between 1 and 160), `caption_ar` (≤200),
`is_cover` (`boolean default false`), `sort_order`, `created_at`, `created_by`.

- `project_media_one_cover`: `create unique index … on (project_id) where is_cover` — **one cover per project, enforced in the database**.
- `project_media_limit` (BEFORE INSERT) → `app.project_media_limit()`: raises `gallery_full` (SQLSTATE 23514) when the project already has `app.setting_int('projects.gallery_max', 24)` pictures.
- RLS: staff select; insert/update/delete restricted to `finance`, `admin`, `super_admin`.

### 7.1.4 `public.project_costs`

`kind` was redefined by `0022_cards_and_costs_v3.sql` from `('purchase','development','fees','other')` to
13 values: `purchase`, `notary`, `commission`, `plantation`, `irrigation`, `fencing`, `access`,
`marketing`, `sales_commission`, `management`, `development` (kept for pre-v3 rows), `fees` (idem),
`other`. Arabic labels live in `src/lib/projects.ts` → `COST_KIND_LABELS`; `COST_KINDS_OFFERED` filters
out `development` and `fees` so the form offers only the v3 categories.

RLS on `project_costs` is narrower than on `projects`: `project_costs_select` requires
`app.has_any_role(['finance','admin','super_admin'])` — a `commercial` reads zero rows (asserted in
`supabase/tests/006_public_projects.sql` T1).

## 7.2 · CURRENT IMPLEMENTATION — stored vs computed, field by field

The single most important split in this area. `app.parcel_price(uuid)` (`0034`) is the one definition of
a parcel's price; `app.tree_price(spacing_class, project)` (`0031`, redefined by `0045`) is the one
definition of a tree's price.

| Figure | Stored | Computed | Where computed |
|---|---|---|---|
| Project `code`, `name`, `tree_count`, `total_area_m2`, `olive_variety`, `tree_age_years`, `plantation_system`, `production_status`, `irrigation`, coordinates | **stored** | — | admin form |
| `description_ar`, `water_*`, `access_note`, `video_url`, `show_location`, document/service id arrays | **stored** | — | admin form |
| Parcel `olive_tree_count`, `code`, `property_type`, `status`, `sort_order`, `notes`, `annual_costs_millimes` | **stored** | — | admin form |
| Parcel `area_m2`, **legacy offer** | **stored** (typed by staff) | — | admin form |
| Parcel `area_m2`, **tree-priced offer** | stored, but overwritten | `trees × tree_spacing_classes.area_m2` | trigger `app.parcel_tree_unit_sync()` (0035) and again server-side in `saveParcel()` |
| Parcel `cash_price_millimes`, **legacy** | **stored** (typed in dinars, ×1000) | — | admin form |
| Parcel `cash_price_millimes`, **tree-priced** | stored as literal `0` | `trees × price_per_tree` | `app.parcel_price()` — `nullif(cash_price_millimes, 0)` makes the stored 0 invisible |
| `price_per_tree_millimes` | never stored on a project or parcel | from `tree_pricing_rules` (land price × area per tree + planting cost + extras + margin + rounding) | `app.tree_price()` |
| `annual_fee_per_tree_millimes` | stored on `tree_pricing_rules` (project row, else global row) | per-request multiplication by trees | `app.tree_price()` → `app.project_quote_payload()` |
| Project `parcels_total`, `parcels_offered`, `min_cash_price_millimes`, `min_area_m2`, `max_area_m2`, `parcel_trees` | never stored | aggregate over `parcels` | `public.public_projects()` lateral |
| `min_price_per_tree_millimes`, `area_per_tree_min_m2`, `area_per_tree_max_m2` | never stored | aggregate over the project's spacing classes | `public.public_projects()` lateral |
| `down_from_millimes` | never stored | smallest accepted down-payment option | `app.parcel_down_from()` (0022) or `app.down_payment_from_percent()` (0035) |
| Offer stock in trees (`total`/`available`/`held`/`sold`) | never stored | sum of `parcels.olive_tree_count` grouped by `parcels.status` | TypeScript: `offerStock()` (public) / `treeStock()` (admin) |
| "Area per tree" on the offer page | never stored | class area, else `total_area_m2 ÷ tree_count` | `areaPerTree()` in `src/app/(public)/projects/page.tsx` |

**Explicitly never computed from one another, by written rule:** area and tree count on a *legacy* parcel
(comment on `public.parcels.olive_tree_count`, spec PARC-02). The v3 tree model reverses that for
tree-priced offers only, and `0035`'s header says so in as many words.

## 7.3 · CURRENT IMPLEMENTATION — how `OFF-TNAYEUR` is produced

**It is typed by a human, once, and never changes afterwards.**

1. The only place a project code is entered is the "+ عرض جديد" form in
   `src/app/admin/(panel)/projects/page.tsx` (lines 92–94):
   `<input name="code" required placeholder="OFF-TNAYEUR" dir="ltr" …>`. The placeholder is where the
   example in this assignment comes from; it is a placeholder, not a template, and nothing derives a code
   from the name or the governorate.
2. `saveProject()` in `src/app/admin/(panel)/projects/actions.ts` validates it **only on insert**:
   ```ts
   const code = z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,20}$/)
     .safeParse(text(formData, "code", 21).toUpperCase());
   ```
   So: uppercased first, then 2–21 characters, Latin capitals, digits and `-`, first character not `-`.
   Failure message: «رمز المشروع بأحرف لاتينية كبيرة وأرقام و«-»، مثال: SFX-01».
3. Uniqueness is the database's: `projects.code text not null unique`. A duplicate returns PostgreSQL
   `23505`, which the action turns into «هذا الرمز مستعمل.».
4. **On update, `code` is not in the `row` object at all** — `saveProject()` builds `row` without it and
   only appends `code: code.data` on the insert branch. The edit form (`CardTab`) has no code input.
   There is no rename path anywhere in the codebase.
5. The code is the public URL segment: `projectHref()` in `src/lib/public-hrefs.ts` returns
   `/projects/${encodeURIComponent(projectCode)}`, and `/projects/[code]/page.tsx` re-validates it with
   `const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/` before touching the database.
6. `public.public_project_page(p_code text)` also guards `length(p_code) <= 40` in SQL.

Parcel codes work the same way but are per-project unique (`unique (project_id, code)`) and the "add a
lot" form pre-fills a suggestion rather than generating one:
`nextCode={`P${String(rows.length + 1).padStart(2, "0")}`}` in
`src/app/admin/(panel)/projects/[id]/page.tsx` — so `P01`, `P02`, … but a human can overwrite it, and the
suggestion is derived from the *count* of existing lots, not from the highest code.

## 7.4 · CURRENT IMPLEMENTATION — the two status enums

`public.project_status` (`0012`), seven values, Arabic labels in `src/lib/projects.ts`:

| Value | `PROJECT_STATUS_LABELS` | Listed publicly? | Prices publicly? |
|---|---|---|---|
| `draft` | مسودة | no | no |
| `preparing` | قيد التحضير | no | no |
| `internal` | جاهز (داخلي) | only to signed-in staff (`app.project_visible`) | no |
| `published` | منشور | yes | **yes — the only status that does** |
| `sold_out` | مكتمل البيع | yes, when `projects.list_closed` | no |
| `operating` | في طور الاستغلال | yes, when `projects.list_closed` | no |
| `archived` | مؤرشف | no | no |

`public.parcel_status` (`0012`, `owned` added by `0021_parcel_statuses_v2.sql` "after 'sold'"), seven values:

| Value | `PARCEL_STATUS_LABELS` | Offered? | Visible? |
|---|---|---|---|
| `available` | متاحة | yes | yes |
| `interested` | مهتم بها | only when `projects.offer_includes_interested` (decision D-15) | yes when `projects.show_taken_parcels` |
| `reserved` | محجوزة | no | yes when `show_taken_parcels` |
| `contracting` | في طور التعاقد | no | idem |
| `sold` | متعاقد عليها | no | idem |
| `owned` | مملوكة | no | idem |
| `withdrawn` | موقوفة | no | **never** (`app.parcel_visible_status` excludes it unconditionally) |

`0021` is a migration that adds the enum value and deliberately never references it (Postgres cannot use a
new enum value in the transaction that adds it); `supabase/tests/007_parcel_statuses_v2.sql` exercises it
afterwards.

## 7.5 · CURRENT IMPLEMENTATION — the public read surface

Visitors never read `public.projects`, `public.parcels`, `public.project_costs` or `public.project_media`.
`0020_public_projects.sql` revokes everything from `anon` and exposes five `security definer` functions;
`0023`, `0034` and `0035` add two more and rebuild three of them.

| Function | Last definition | Granted to | Returns |
|---|---|---|---|
| `public.public_projects()` | `0035` | `anon`, `authenticated` | 28 whitelisted columns per visible project, incl. cover picture and tree-price aggregates |
| `public.public_parcels()` | `0035` | `anon`, `authenticated` | 30 columns per visible parcel, bounded by `projects.listing_limit` (20..1000, default 300) |
| `public.public_project_page(text)` | `0023` | `anon`, `authenticated` | jsonb: description, water, access, video, coords (gated), document/service ids, gallery |
| `public.public_parcel_offer(uuid, uuid, uuid)` | `0020` | `anon`, `authenticated` | legacy installment matrix for one parcel |
| `public.public_project_quote(uuid, uuid, int, text, uuid, uuid)` | `0034` | `anon`, `authenticated` | tree-priced quote for one project |
| `public.public_coverage()` | `0035` | `anon`, `authenticated` | counts per governorate, no money |
| `public.staff_parcel_offer(uuid, uuid, uuid)` | `0020` | `authenticated` only, guarded by `app.is_staff()` | same payload, ungated, prices whenever cash > 0 |
| `public.staff_project_quote(…)` | `0034` | `authenticated`, `app.is_staff()` | twin of `public_project_quote`, no flag/status gate; breakdown only for `app.can_price()` |
| `public.staff_project_parcel_prices(uuid)` | `0035` | `authenticated`, `app.is_staff()` | `app.parcel_price()` for every parcel of one project |

Private gate predicates, all in the unexposed `app` schema and revoked from `public, anon, authenticated`:

```
app.flag_state(key)            → feature_flags.state, default 'disabled'
app.module_open(key)           → 'public' → true | 'internal' → app.is_staff() | else false
app.project_public_statuses()  → ['published'] (+ 'sold_out','operating' when projects.list_closed)
app.project_visible(status)    → app.module_open('projects')
                                 AND (status in public statuses OR (status='internal' AND app.is_staff()))
app.parcel_offer_statuses()    → ['available'] (+ 'interested' when projects.offer_includes_interested)
app.parcel_offered(pj, pa)     → pj = 'published' AND pa in offer statuses
app.parcel_visible_status(pa)  → pa <> 'withdrawn' AND (pa in offer statuses OR projects.show_taken_parcels)
```

`supabase/tests/006_public_projects.sql` T3 asserts that each of these carries **no** execute privilege
for `anon` or `authenticated`, that the five public RPCs carry no `PUBLIC` execute, and that
`compute_installment_plan` is closed to `anon`. T4 asserts the whitelist is in the *signature*: the result
type of `public_projects()` must not match `\m(pricing|legal_notes|land_offer|plan_storage|latitude|longitude|updated_by|annual_costs|notes)\M`.

Money leaves Postgres only under a double gate. In `public_parcels()` (0035):

```sql
tree_priced  := parcel_offered AND on_tree_pricing AND pricing='ok' AND app.module_open('pricing')
legacy_priced:= parcel_offered AND NOT on_tree_pricing AND cash_price_millimes > 0
```

and `min_price_per_tree_millimes` in `public_projects()` is
`case when pj.status = 'published' and app.module_open('pricing') then …`.

Feature flags involved (`public.feature_flags`, seeded in `0004_seed_configuration.sql` and `0031`):
`projects` (seeded **`disabled`**, phase 2), `pricing` (seeded **`internal`**, `0031`),
`interest_form` (seeded `public`), `public_statistics` (`0025`, seeded `public`).

## 7.6 · CURRENT IMPLEMENTATION — the offer intake (`request_kind = 'offer'`)

`0049_offer_intake.sql` adds to `public.interest_requests`:
`request_kind text not null default 'calculator'` (check: `in ('calculator','offer')`), `offer_trees`
(check `> 0`), `offer_price_per_tree_millimes`, `offer_total_price_millimes`,
`offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes`. It also drops `not null` from
`goal_option_id` / `goal_label_ar` and replaces it with
`check (request_kind <> 'calculator' or (goal_option_id is not null and goal_label_ar is not null))`.

`public.submit_offer_request(p jsonb)` — `security definer`, **revoked from `public, anon, authenticated`,
granted to `service_role` only**, so it is reachable only through the server action using the admin client.
Order of checks:

1. Identity: name 3..120, `app.assert_phone`, WhatsApp `^\+[1-9][0-9]{6,14}$`, email regex + ≤200,
   consent text required, active governorate, delegation must belong to the governorate, contact channel
   required, optional `contact_time` option must be active.
2. Offer: `projects` row must exist **and** `status = any (app.project_public_statuses())`. Note this is
   the *public statuses* helper, not `= 'published'` — so with `projects.list_closed` on (the default), a
   `sold_out` or `operating` offer will still accept a request. An `internal` or `draft` offer raises
   `offer_not_available`. Asserted by `supabase/tests/031_offer_intake.sql` §2.
3. Trees: `1 ≤ trees ≤ projects.tree_count` (when `tree_count > 0`), else `invalid_offer_trees`. Tested at
   both ends (1 and 100) and beyond (101, 0, `'عشرة'`, empty) in test 031 §3.
4. Price: `app.project_quote_payload(project, null, trees, 'cash', null, null, false)` — the same builder
   the page prices with, so a request can never carry a figure the visitor could not see. When
   `pricing <> 'ok'` the request is still recorded, without money.
5. Throttling shared with the calculator form: `app.check_throttle('interest:ip', …)` and a per-phone
   count against `antispam.max_requests_per_phone_per_day`.
6. Person upsert on `phone_e164`; optional round-robin assignment when `crm.auto_assign_mode = 'round_robin'`.
7. Request number `<request_no.prefix>-<YYYY>-<6 digits>`, year in `Africa/Tunis`.
8. Insert. Shared CRM columns are filled so no new Back Office screen is needed: `tree_count_code = 'offer'`,
   `tree_count_label_ar = '<n> ' || start.trees_unit`, `tree_count_min = tree_count_max = trees`,
   `invest_anywhere = false`, `invest_governorate_ids = array[project.governorate_id]`,
   `project_type_unsure = true`, plus `spacing_class_id`, `spacing_label_ar`, `area_per_tree_m2`,
   `total_area_m2`, `price_per_tree_millimes`, `total_price_millimes`.
9. `app.enqueue_message('lead.confirmation', …)` with `offer` = project name.

Returns `jsonb_build_object('request_no', …, 'project_code', …)`.

## 7.7 · OBSERVATIONS — section 7

- **Two parallel pricing worlds coexist in the same tables.** A project with at least one row in
  `project_spacing_classes` is "on tree pricing"; one without is "legacy". `app.project_on_tree_pricing()`
  is just `exists (select 1 from project_spacing_classes …)`. Every public function, the ParcelCard, the
  parcel page, the admin lots table and the parcel form branch on this one boolean. The legacy branch
  (`app.parcel_offer_payload`, `compute_installment_plan`, the `down_payment` / `monthly_installment`
  option lists) is still fully wired and reachable.
- `supabase/tests/006_public_projects.sql` opens by re-activating four option lists with the comment
  *"Migration 0032 retires the old amount lists … they are switched back on inside this rolled-back test
  until plan P5-4 moves the card to tree pricing"* — i.e. the legacy offer path is tested against option
  lists that are inactive in the live database.
- `projects.plan_storage_path`, `projects.legal_notes` and `projects.land_offer_id` have **no writer** in
  `src/`. Nothing in the admin forms sets them; `0020` seeded a setting `legal.plan_notice` («مخطط تقسيم
  مبدئي…») described as printed under every plan image, and that setting is referenced only by
  `src/app/admin/(panel)/settings/actions.ts`, never rendered on a public page.
- `projects.annual_costs_millimes` is editable in the admin card («المصاريف السنوية التقديرية للقطعة») but
  appears in no public RPC. Only `parcels.annual_costs_millimes` is exposed, and only when the parcel is
  offered.
- `app.parcel_price()` returns `'cash_total_millimes', v_per * v_trees` unconditionally, while `'pricing'`
  is `'ok'` only when both `v_per` and `v_trees` are non-null. When one is null the product is null, so the
  two agree; the value is nevertheless computed outside the guard that protects the sibling fields.
- `submit_offer_request` uses `app.project_public_statuses()` while `app.parcel_offered()` and
  `project_quote_payload` use the stricter `status = 'published'`. Consequence: with the default
  `projects.list_closed = true`, a `sold_out` offer still accepts interest requests, and the quote it
  snapshots comes back `pricing = 'not_offered'`, so the request is stored with null money.
- Five settings seeded for this area are referenced nowhere in `src/`: `projects.picker_title`,
  `projects.picker_nearest`, `projects.interest_banner`, `projects.browse_cta`, and `legal.plan_notice`
  (settings screen only).

---

# SECTION 8 · THE PUBLIC OFFER PAGE

Route: `src/app/(public)/projects/[code]/page.tsx`. `export const dynamic = "force-dynamic"` (the
`internal` module state reads the staff session cookie, so nothing may be cached at build).
`export const metadata: Metadata = { title: "مشروع" }` — a **static, non-Arabic-branded, non-per-offer**
title; there is no `generateMetadata` on this route (the *listing* route has one).

## 8.1 · CURRENT IMPLEMENTATION — what the page loads, in order

```
code = decodeURIComponent(params.code)        → 404 unless /^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/
config = getPublicConfig()                     (cached 300 s, tag public-config)
access = moduleAccess(config, "projects")      → "open" | "preview" | "closed"
  closed  → <ComingSoon title={offersTitle(config)} />   and nothing else renders
mode   = publicMode(access)                    → "anon" (cached 60 s, tag public-projects) | "preview" (uncached, staff session)
Promise.all[ getPublicProjects(mode), getPublicParcels(mode), getProjectPage(code, mode) ]
project = findProject(projects, code)          → notFound() when absent
offerTrees = project.tree_count ?? 0
offerQuote = offerTrees > 0 && project.on_tree_pricing
             ? getProjectQuote(project.id, mode, { trees: 1 })
             : null
own    = parcels.filter(p => p.project_id === project.id)
stock  = offerStock(project, parcels)
```

`offerStock()` (exported from `src/app/(public)/projects/page.tsx`) drops `withdrawn` parcels, then:
if any parcel carries trees, the four buckets are sums of `olive_tree_count` by status —
`available` = `available` only; `held` = `interested|reserved|contracting`; `sold` = `sold|owned`;
`total` = `project.tree_count` when > 0 else the counted sum. If **no** parcel carries trees the offer is
"sold whole": `sold = total` when `status = 'sold_out'` else 0, and `available = total - sold` only when
the status is `published` or `internal`, otherwise 0.

## 8.2 · CURRENT IMPLEMENTATION — the blocks, in display order

The file's own header comment states the order deliberately: *"who and where → the two figures he came
for → the picture → the facts, in named groups → the two doors → this offer's own form"*.

**Block 1 — preview banner.** `{access === "preview" ? <PreviewBanner /> : null}` —
«معاينة داخلية: هذا القسم غير منشور للعموم، ويراه فريق AgriZed فقط.»

**Block 2 — header (left column on `lg`).**
- `← كل المشاريع` link to `/projects` (hard-coded Arabic, hard-coded path).
- `project.code` in an LTR pill.
- A `StatusPill` with `projectStatusLabel(project.status)` **only when `status !== 'published'`** — so a
  published offer shows no badge, an `internal` one shows «جاهز (داخلي)», a `sold_out` one «مكتمل البيع».
- `<h1>` = `project.name`.
- `[governorate, delegation].filter(Boolean).join(" · ")`, resolved from `config.governorates` /
  `config.delegations`.
- `project.location_description` when set.
- Map link when `page.latitude !== null && page.longitude !== null` →
  `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`, labelled
  `projects.location_cta` («شوف الموقع على الخريطة»), `target="_blank" rel="noopener noreferrer"`.
  Because `public_project_page()` nulls the coordinates unless `show_location`, the link is the
  *only* surface of `show_location`.

**Block 3 — the two figures (`.panel`, 2-column grid).**
- Lead figure = `priceFigure ?? areaFigure`:
  - `offerPrice(project, fromPrefix, perTreeLabel)` returns null when `!project.offered`; else
    `min_price_per_tree_millimes` formatted, labelled `start.row_price_per_tree` («سعر الزيتونة»), with
    prefix `start.from_prefix` («ابتداءً من»); else `min_cash_price_millimes`, labelled with the
    **hard-coded** string `"السعر حاضر"`; else null.
  - Fallback `areaFigure` = `formatArea(project.total_area_m2)` labelled `start.row_total_area`
    («المساحة الجملية»). When the area leads here it is not repeated in the facts group (`areaInHero`).
- Second figure = `formatCount(stock.available)` labelled `PARCEL_STATUS_LABELS.available` («متاحة»).
- Below a divider, `restStock` — only non-redundant, non-zero cells:
  `treesLabel` (`start.row_trees`, «عدد الزيتونات») with `stock.total` **only when `total !== available`**;
  «محجوزة» when `held > 0`; «متعاقد عليها» when `sold > 0`.

**Block 4 — the cover photograph (second column from `lg`).**
`<RemotePhoto url={cover?.url ?? project.cover_url} alt={cover?.alt_ar ?? project.cover_alt_ar}
seed={project.id} className="aspect-3/2 max-h-[26rem] rounded-3xl" />`. `cover` is `page.media[0]`, and
`public_project_page()` orders the gallery `is_cover desc, sort_order, created_at`, so the cover is the
flagged picture else the first in order — the same rule `public_projects().cover_url` uses.

**Block 5 — description / gallery / video.** Rendered only when
`page && (page.description_ar || pictures.length > 1 || page.video_url)`.
- `projects.about_title` («على المشروع») + `description_ar` with `whitespace-pre-line`.
- `<ProjectGallery pictures={pictures.slice(1)} title={projects.gallery_title} />` — **the first picture is
  skipped because it is already the cover**, so the gallery appears only from 2 pictures up. Each tile is
  an `<a target="_blank">` to the full-size URL with `caption_ar` under it.
- `projects.video_title` + `<ProjectVideo>`: `videoEmbedUrl()` accepts only https YouTube
  (`youtube.com`/`youtu.be`, id `^[A-Za-z0-9_-]{6,20}$`, played from `youtube-nocookie.com/embed/`) and
  Vimeo (id `\d{6,12}`, `player.vimeo.com/video/<id>?dnt=1`). **Any other https address renders as a
  plain button** «شوف الفيديو ↗».

**Block 6 — the facts, in up to three named cards.**
- «الأرض» (`projects.facts_land_title`, fallback hard-coded): total area when not already in the hero,
  «الماء» = `waterText()` → «متوفّر»/«غير متوفّر» joined with `water_note` by `·`, «الري» from
  `IRRIGATION_LABELS`, «النفاذ» = `access_note` (stacked layout).
- «الزيتون» (`projects.facts_trees_title`): area per tree (a range `min – max` when the offer has several
  classes), «الصنف», «عمر الأشجار» + «سنوات», «نظام الغراسة», «حالة الإنتاج».
- «الوثائق المتوفّرة» (`projects.documents_title`): `chosenLabels(config, "land_document", page.document_option_ids)`
  rendered as pills, then `projects.documents_text` («هذه الوثائق موجودة في ملف المشروع. اطلب الاطلاع
  عليها كي نتصلو بيك.»). **Names only — no file is ever linked or served.**
- The grid is `sm:grid-cols-2 lg:grid-cols-3` when all three groups exist, `sm:grid-cols-2` otherwise; the
  whole block disappears when `groupCount === 0`.

**Block 7 — the two doors.** Anchors, not links away:
`#offer-form` labelled `offers.submit_label`, and `#offer-visit` labelled `projects.visit_cta`.
- `selling = status === 'published' || status === 'internal'`
- `interestOpen = flagState(config, 'interest_form') === 'public'`
- `formOpen = selling && interestOpen && offerTrees > 0`
- `visitOpen = selling && interestOpen`

**Block 8 — the offer's own interest form** (`<OfferInterestForm>`, only when `formOpen`). Client
component `offer-interest-form.tsx`:
- Quick-pick chips from `QUICK_PICKS = [1, 5, 10, 25, 50]` filtered to `≤ maxTrees`, plus «الكل (n)» when
  `maxTrees > 1`; a free numeric field defaulting to `"1"`, parsed through `toWesternDigits()`.
- A live figures list: `start.row_price_per_tree` (per tree), `start.row_area_per_tree` (× trees),
  `start.row_total_price` (per tree × trees), `start.row_annual_fee` (annual fee × trees), then
  `start.estimate_note`. When `figures.pricePerTreeMillimes` is falsy the whole list is replaced by
  `projects.price_pending` («السعر يُعلن لاحقاً.»).
- Identity: name, phone (8 digits hint), a «رقم WhatsApp هو نفس رقم الهاتف» checkbox, governorate select,
  contact channel radio group (`مكالمة` / `WhatsApp` / `الزوز`), optional contact time,
  `legal.consent_text` checkbox, and a visually-clipped honeypot named `Website` (explicitly **not**
  offset by `-10000px`, per the RTL note in the code).
- Submit → `submitOfferInterest()` (`offer-actions.ts`): re-checks `moduleAccess(config,"projects") !== "closed"`,
  zod-parses, rejects on honeypot, normalises the phone through `normalizePhone()` with
  `lead.allow_international_phone`, then calls `submit_offer_request` with `createAdminClient(auditHeaders(...))`
  and `hashIp(clientIp(...))`.
- On success the form is replaced in place by a confirmation card: `offers.success_title`,
  `offers.success_text`, «رقم مطلبك» + the request number, and
  «طلبك على «{projectName}» بـ {n} زيتونة.»

**Block 9 — the lots band** (`border-y bg-surface`). Rendered **only when `own.length > 0`**:
- `projects.detail_parcels_title` («القطع في هذا المشروع»), plus `projects.taken_hint` when any lot is
  not offered.
- `<ParcelPlan>` — one square tile per lot, coloured by `parcelStatusTone()`, the status also in an
  `sr-only` span so colour is never the only signal, `detail` = `«<area> م²»`, each tile linking to
  `parcelHref(project.code, parcel.code)`. Above the tiles, a legend of per-status counts.
- A grid of `<ParcelCard>`s.
- `<LegalNotes config>` — `legal.parcel_card_note` and `legal.no_guarantee_notice`. **This is outside the
  `own.length > 0` branch, so the notes render even on an offer with no lots.**

**Block 10 — payment / services / visit** (`md:grid-cols-2`), rendered when `selling || services.length > 0`:
- «طريقة الدفع» (`projects.payment_title` / `projects.payment_text`) when `selling`.
- «خدمات AgriZed في هذا المشروع» (`projects.services_title`) — pills from the `agrized_service` option
  list (seeded in `0023` with 10 items: الحرث، السقي، المراقبة، التقليم، الحراسة، الجني، النقل، العصر،
  متابعة الزيتونة، تقارير الإنتاج), then `projects.services_text` («خدمات تنجم تطلبها بعد التملّك. شروطها
  وأسعارها تتوضّح قبل الإمضاء.») — **names, never prices**.
- «زيارة الأرض» (`id="offer-visit"`) when `visitOpen`, whose button is another `#offer-form` anchor.

## 8.3 · CURRENT IMPLEMENTATION — the page in each edge state

| State | What the page does |
|---|---|
| **`projects` flag `disabled`** (the seeded default) | `moduleAccess` → `closed` → `<ComingSoon title={offersTitle(config)} />` and an early `return`. No database call for the offer is made. |
| **`projects` flag `internal`, visitor** | `moduleAccess` → `closed` (no staff session) → same ComingSoon. `app.project_visible()` would also refuse in SQL. |
| **`projects` flag `internal`, signed-in staff** | `moduleAccess` → `preview`; every RPC is called with the staff session and **never cached**; `<PreviewBanner />` renders first. |
| **Offer status `internal` (module public)** | `app.project_visible()` returns true only for staff, so a visitor gets `notFound()`; staff see the page with the «جاهز (داخلي)» status pill. `selling` is true, so payment, visit and the form are all offered — but `submit_offer_request` will refuse the request with `offer_not_available`. |
| **Offer status `draft`, `preparing` or `archived`** | Never in `public_projects()` → `findProject` returns undefined → `notFound()` (404). `public_project_page()` returns null for the same codes (`supabase/tests/009_project_page_v3.sql` T2). |
| **Offer `sold_out` / `operating`** | Listed while `projects.list_closed` is true. `offered = false`, so `offerPrice()` returns null and the hero leads with the area. `selling` is false → no payment card, no visit card, no form, no doors. `offerStock` sets `available = 0`, and `sold = total` for `sold_out`. |
| **Zero availability** | `stock.available = 0` is still printed as a figure («0» under «متاحة») — the code treats zero as an answer. On the *listing* card, `OfferCard` greys the figure (`text-muted`) instead of hiding it. The form is **not** closed by zero availability: `formOpen` depends on `project.tree_count`, not on stock. |
| **Offer with lots** | Block 9 renders the title, the `ParcelPlan` and one `ParcelCard` per lot. `hasTaken` adds `projects.taken_hint`. Withdrawn lots never appear (filtered in SQL). |
| **Offer with no lots ("sold whole")** | Block 9 collapses to just `<LegalNotes>`; the explicit comment says the old «ما فماش قطع متاحة» contradicted the stock strip. `offerStock` then derives the four buckets from the project status alone. |
| **No pictures at all** | `pictures = []`, `cover = null`, `project.cover_url` is null → `RemotePhoto` renders `<GrovePlaceholder seed={project.id}>`, a deterministic drawn olive grove in brand colours. Block 5 does not render at all unless there is a description or a video. |
| **Exactly one picture** | It is the cover; `pictures.slice(1)` is empty so `<ProjectGallery>` is not rendered (it also self-returns null on an empty list). |
| **No documents** | The «الوثائق» card is simply absent (`documents.length > 0` guard), and it does not count toward `groupCount`. |
| **No services** | The services card is absent. If `selling` is also false, the whole Block 10 section is skipped. |
| **Price closed (`pricing` flag not open to this visitor)** | `public_projects()` returns `min_price_per_tree_millimes = null` → `offerPrice()` falls through to `min_cash_price_millimes` (legacy offers only) and then to the area. The form's figures are all null → it prints `projects.price_pending`. The request is still accepted, without money. |
| **Offer priced by tree but `on_tree_pricing` false** | `offerQuote` is skipped entirely (`offerTrees > 0 && project.on_tree_pricing`), so the form shows `pricePending`. The in-code comment records that an earlier version gated the *form itself* on `on_tree_pricing` and thereby hid it on every offer. |
| **Unknown / malformed code** | Regex failure → `notFound()` before any query; unknown code → `notFound()` after. |

## 8.4 · CURRENT IMPLEMENTATION — the child parcel page

`src/app/(public)/projects/[code]/[parcel]/page.tsx`. Same `projects` module gate, but its ComingSoon uses
`projects.title` (not `offersTitle()`), so a closed module shows «المشاريع المتوفّرة» here and «عروضنا» on
the two other routes.

It branches on `parcel.on_tree_pricing`:
- **tree-priced** → `getProjectQuote(parcel.project_id, mode, { spacingClassId, trees: olive_tree_count,
  paymentMode, downPercentOptionId, durationOptionId })` → `<TreeOfferBlock>`, which renders price per
  tree, trees, area per tree, total area, total price, then chip rows for payment mode
  (`حاضر` / `بالتقسيط`), `start.down_percent_title` and `start.row_duration`. Chips are plain links
  carrying `?payment=…&down_pct=…&duration=…#offer`, so the page stays server-rendered.
- **legacy** → `getParcelOffer(parcel.id, mode, { down, installment })` → `<OfferBlock>`, which renders
  «السعر حاضر», «التسبقة من …», «القسط من …», the worked examples (`projects.examples_title` /
  `projects.examples_note`) and a down × installment matrix.
- Both blocks end with `legal.parcel_card_note` + `legal.no_guarantee_notice`, and both replace themselves
  with `projects.taken_text` when the parcel is not offered.
- `canAsk = interestOpen && (treeQuote ? parcel.offered : offer.offered && offer.priced)`. When true, the
  CTA is `interestHref(asked)` → `/register?parcel=…&trees_custom=…&spacing=…&payment=…&down_pct=…&duration=…`;
  a second CTA adds `&visit=1`. When false but `interestOpen`, the CTA becomes `projects.taken_cta`
  pointing at the **offer page**, not at a bare `/register`.
- A sticky bottom bar duplicates the CTAs below `md`.
- `metadata` is the static `{ title: "قطعة" }`.

## 8.5 · CURRENT IMPLEMENTATION — the listing the offer page belongs to

`src/app/(public)/projects/page.tsx` has the only `generateMetadata()` in this area (title =
`offersTitle(config)`, description = `projects.meta_description`). It splits `public_projects()` into
`open` (`published` + `internal`) and `closed` (`sold_out` + `operating`), renders `<OfferCard>` for each,
and in a separate dense band renders **parcel** cards filtered client-side by seven query parameters
(`gov`, `del`, `type`, `trees`, `area`, `price`, `available`) via `readFilters()` + `matches()`. Bare land
is never hidden by a tree-count filter. `MAX_PRICE_DINARS = 10_000_000` caps the price input.
`offerTreePrice()` re-checks `moduleAccess(config, "pricing") !== "closed"` in TypeScript on top of the SQL
gate.

## 8.6 · OBSERVATIONS — section 8

- `/projects/[code]/page.tsx` imports six symbols **from the sibling route module** `../page`:
  `areaPerTree`, `LegalNotes`, `longestDuration`, `offerStock`, `offersTitle`, `StockCell`. The parcel page
  imports `offerStock` and `StockStrip` from `../../page`. Page modules are being used as a shared library;
  none of these live in `src/lib/` or `src/components/`.
- `projects.facts_land_title` and `projects.facts_trees_title` are read by `settingText()` but **are not
  seeded by any migration** (`0001`–`0050`) and are not in `supabase/pending/`. Both always fall back to
  the hard-coded «الأرض» and «الزيتون». The Back Office therefore cannot rename those two headings,
  unlike every other heading on the page.
- Other hard-coded Arabic on this page, not settings: `«→ كل المشاريع»`, `«السعر حاضر»` (the legacy price
  label in `offerPrice()`), `«الماء»`, `«الري»`, `«النفاذ»`, `«الصنف»`, `«عمر الأشجار»` + `«سنوات»`,
  `«نظام الغراسة»`, `«حالة الإنتاج»`, `«مخطط القطع»`, and in `ParcelCard` `«المساحة»`, `«عدد الزيتونات»`,
  `«السعر للزيتونة»`, `«السعر الجملي»`, `«ابتداءً من … تسبقة»`, `«التقسيط حتى …»`.
- `metadata` on both `[code]` and `[code]/[parcel]` is static («مشروع» / «قطعة»). Every offer shares one
  browser-tab title and one (absent) description; the listing route does it properly with
  `generateMetadata`.
- The offer page never calls `public_parcel_offer` or the installment matrix. It shows a *starting* price
  and delegates all payment detail to the parcel page or to the form. The setting
  `projects.payment_text` explicitly says the figures live on the parcel card.
- `formOpen` requires `offerTrees > 0`, i.e. `projects.tree_count` must be filled. An offer that is fully
  described by its lots but has an empty `tree_count` shows no interest form at all, and `offerStock`
  falls back to the counted sum for the stock figures — so the page can display «100 متاحة» while the
  form is hidden.
- `visitOpen` can be true while `formOpen` is false (offer with `tree_count` null). The visit card then
  renders with no button inside it, because the button is guarded by `formOpen`.
- The Google Maps link is the only consumer of `show_location`; nothing renders an embedded map.
- `getProjectQuote()` swallows every error (`catch { console.error; return null }`), so a failing quote
  degrades the form to `pricePending` rather than failing the page.
- `OfferInterestForm` multiplies the per-tree figures client-side (`pricePerTree * trees`). The comment
  cites `v_total := v_per_tree * v_trees` from `0034` as the justification, and `submit_offer_request`
  recomputes server-side, so a tampered client cannot store a wrong figure.

---

# SECTION 12 · ADMIN OFFER CREATION AND EDITING

All routes under `src/app/admin/(panel)/projects/`. Every page begins with `await requireStaff()`; writes
additionally require `WRITE_ROLES = ["finance","admin","super_admin"]` (and `PRICE_ROLES` for the spacing
classes). The database re-enforces the same thing through RLS and role-checked RPCs, so each rule is
stated twice, as `CLAUDE.md` requires.

## 12.1 · CURRENT IMPLEMENTATION — the list page and the creation form

`src/app/admin/(panel)/projects/page.tsx` (`OffersPage`, title «العروض»):
reads `projects` (`id, code, name, governorate_id, location_description, status, total_area_m2, tree_count,
created_at`, ordered `created_at desc`) and all `parcels` (`project_id, status, olive_tree_count`),
computes `treeStock()` per offer, and prints four `StatTile`s across all offers
(«إجمالي الزيتونات» / «المتاحة» / «المحجوزة» / «المباعة»). Each card links to `/admin/projects/<id>` and
carries a `StockLine`. A link «كل القطع» goes to `/admin/projects/parcels`.

The creation form is a `<details>` block labelled «+ عرض جديد», visible only when `canWrite`. It is
**short on purpose** — `saveProject()` writes the page fields only when the hidden `page_fields` marker is
present, which this form omits.

| Field name | Label | Control | Required | Default | Validation in `saveProject()` | DB column | Public surface |
|---|---|---|---|---|---|---|---|
| `code` | رمز العرض | text, `dir="ltr"`, placeholder `OFF-TNAYEUR` | yes (HTML + server) | — | `.toUpperCase()`, `/^[A-Z0-9][A-Z0-9-]{1,20}$/`, sliced to 21 chars; `23505` → «هذا الرمز مستعمل.» | `projects.code` | URL segment + pill on every card/page |
| `name` | الاسم | text | yes | — | trimmed, ≤160; empty → «اكتب اسم المشروع.» | `projects.name` | `<h1>`, card titles, lead snapshot |
| `governorate_id` | الولاية | select from `config.governorates` | yes | none (`disabled` placeholder) | `Number.isInteger && > 0`, else «اختر الولاية.» | `projects.governorate_id` | subtitle, map/coverage, filters |
| `project_type_id` | نوع المشروع | select from `config.projectTypes` | no | `""` → null | `text(...,40) || null` (no uuid check) | `projects.project_type_id` | id only, used by matching/filters |
| `total_area_m2` | المساحة الجملية (م²) | text `inputMode="decimal"` | no | — | `optionalNumber` (comma→dot, finite, ≥0) | `projects.total_area_m2` | hero/facts «المساحة الجملية» |
| `status` | الحالة | select over `PROJECT_STATUS_LABELS` | no | `draft` | zod enum of the 7 values | `projects.status` | visibility gate |

Fields **not** on the create form but written by `saveProject()` as `null`/defaults because
`optionalNumber` returns `null` for an empty value: `location_description`, `olive_variety`, `tree_count`,
`tree_age_years`, `plantation_system`, `production_status`, `irrigation`, `annual_costs_millimes`.
`pricing` is written as `{}` when the `PricingEditor` is absent. `delegation_id` is only written when the
form carries the field (`formData.has("delegation_id")`), which neither form currently does — the create
form has no delegation control at all.

## 12.2 · CURRENT IMPLEMENTATION — the offer page and its five tabs

`src/app/admin/(panel)/projects/[id]/page.tsx`. `?tab=` selects one of
`card` («البطاقة») · `lots` («القطع») · `pictures` («الصور») · `pricing` («التسعير») · `costs` («التكاليف»);
`costs` is offered only to `FINANCE_ROLES`, and `readOfferTab()` falls back to `card` for anything else, so
a hand-typed `?tab=costs` cannot open the tab for a commercial. Queries are conditional on the active tab
(`project_costs` and the full `tree_spacing_classes` list are fetched only when their tab is open).

Above the tabs, always:
- `SectionHeader` with the name, a status pill, the code + governorate, and two actions.
- `<OfferIdentity>` — a 4-column read-only card: الموقع، المساحة الجملية، عدد الزيتونات، الصنف، عمر
  الزيتونات، حالة الإنتاج، الغراسة والري، المساحة لكل زيتونة (with its **source** stated:
  «من فئة المساحة» / «محسوبة في القطع» / «تقديرية: المساحة ÷ الزيتونات»), السعر للزيتونة (or
  «يتحدّد بعد اعتماد فئة المساحة» / a blocked reason), الوثائق.
- `<StockStrip>` — four tiles in trees, each captioned with the statuses it sums
  (`bucketSourceText()`), plus a note that reservations have no module yet and that
  «المحجوزة» is only what staff marked on the lots.
- Warnings (PRJ-04), computed in TypeScript:
  - lots' area sum > `total_area_m2 + 0.5`
  - lots' trees (including withdrawn) > `tree_count`
  - count of `available` lots with no cash price → «ما تتعرضش بسعر على الموقع»
  - tree pricing ready + no spacing class + at least one lot → a warning with a link to `?tab=pricing`
    and the action «اعتماد فئة المساحة»

## 12.3 · CURRENT IMPLEMENTATION — tab «البطاقة», field by field

`src/app/admin/(panel)/projects/[id]/card-tab.tsx`, one `<ActionForm action={saveProject.bind(null, project.id)}>`.
Non-writers see only «بطاقة العرض تتبدّل من طرف المالية أو الإدارة فقط…».

| Field name | Label (Arabic) | Control | Required | Default shown | Server validation | DB column | Where it appears publicly |
|---|---|---|---|---|---|---|---|
| `name` | الاسم | text | yes | current | ≤160, non-empty | `name` | `<h1>`, cards, lead snapshot |
| `governorate_id` | الولاية | select | — | current | integer > 0 | `governorate_id` | subtitle, filters, coverage |
| `project_type_id` | نوع المشروع | select + «بدون» | no | current | `|| null` | `project_type_id` | id only |
| `location_description` | وصف الموقع (يظهر مع الولاية في رأس العرض، مثال: طريق تنيور كم 27) | text | no | current | ≤1000 | `location_description` | header paragraph |
| `total_area_m2` | المساحة الجملية (م²) | decimal | no | current | ≥0 finite | `total_area_m2` | hero or «الأرض» group |
| `tree_count` | عدد الأشجار | numeric | no | current | ≥0, `Math.round` | `tree_count` | stock total, **the form's `maxTrees`**, area-per-tree fallback |
| `tree_age_years` | عمر الأشجار (سنوات) | decimal | no | current | ≥0 | `tree_age_years` | «الزيتون» group |
| `olive_variety` | الصنف | text | no | current | ≤120 | `olive_variety` | «الزيتون» group, OfferCard pill |
| `plantation_system` | نظام الغراسة | select («غير محدّد» + `PLANTATION_LABELS`) | no | current | zod `['', traditional, intensive, other]` | `plantation_system` | «الزيتون» group, OfferCard pill, offer-type derivation |
| `production_status` | حالة الإنتاج | select («غير محدّدة» + `PRODUCTION_LABELS`) | no | current | zod `['', none, starting, producing]` | `production_status` | idem |
| `irrigation` | الري | select: غير محدّد / بعلية (`rainfed`) / مروية (`irrigated`) | no | current | zod | `irrigation` | «الأرض» group |
| `annual_costs_dinars` | المصاريف السنوية التقديرية للقطعة (د.ت) | decimal | no | `annual_costs_millimes / 1000` | ≥0, ×1000 rounded | `annual_costs_millimes` | **nowhere public** |
| `status` | الحالة | select over the 7 statuses | — | current | zod enum | `status` | the publication gate |
| `page_fields` | — | `<input type="hidden" value="1">` | — | — | presence flips on the whole block below | — | — |
| `description_ar` | وصف المشروع (يظهر في صفحة المشروع) | textarea rows 5 `maxLength 4000` | no | current | `text(...,4000) || null`; DB check ≤4000 | `description_ar` | Block 5 «على المشروع» |
| `water_available` | الماء | select: غير محدّد / متوفّر (`yes`) / غير متوفّر (`no`) | no | current | `'yes'→true, 'no'→false, else null` | `water_available` | «الأرض» → «الماء» |
| `water_note` | مصدر الماء (placeholder «مثال: بئر عميقة داخل الضيعة») | text `maxLength 300` | no | current | ≤300 | `water_note` | appended after «متوفّر · » |
| `access_note` | النفاذ والطريق (placeholder «مثال: طريق معبّدة حتى مدخل الضيعة») | text `maxLength 300` | no | current | ≤300 | `access_note` | «الأرض» → «النفاذ» |
| `video_url` | رابط الفيديو (YouTube أو Vimeo يظهر داخل الصفحة، غيرهما يظهر كرابط) | `type=url maxLength 500` | no | current | `/^https:\/\/[^ ]+$/` else «رابط الفيديو يبدأ بـ https://…»; DB check repeats it | `video_url` | Block 5 embed or link |
| `latitude` | خط العرض (placeholder 34.55) | decimal | no | current | `|value| ≤ 90`, rounded to 6 dp | `latitude` | only via the map link |
| `longitude` | خط الطول (placeholder 10.30) | decimal | no | current | `|value| ≤ 180`, 6 dp | `longitude` | idem |
| `show_location` | إظهار الموقع على الخريطة في صفحة المشروع | checkbox | no | current | requires both coordinates, else «اكتب خط العرض وخط الطول قبل إظهار الموقع…» | `show_location` | gates the two above |
| `document_option_ids` | الوثائق المتوفّرة (تظهر أسماؤها فقط، الملفات لا تُنشر) | checkbox set over `land_document` | no | current | `optionIds()`: UUID regex, de-duplicated, **sliced to 30** | `document_option_ids` | «الوثائق المتوفّرة» pills |
| `service_option_ids` | خدمات AgriZed في هذا المشروع (أسماء بلا أسعار) | checkbox set over `agrized_service` | no | current | idem | `service_option_ids` | services pills |
| (PricingEditor fields) | — | `readPricingForm(formData, { allowInherit: true })` | — | `project.pricing` | on failure the whole save is refused | `pricing` | **never** |

Coordinate pairing is enforced: `latitude === null !== (longitude === null)` → «اكتب خط العرض وخط الطول
معاً بالأرقام، مثال: 34.55 و 10.30.»

Both `land_document` and `agrized_service` are option lists, so their values are data
(`0004_seed_configuration.sql` seeds land_document with رسم عقاري / عقد ملكية / حجة / شهادة حوز / مثال
هندسي / وثائق أخرى; `0023` seeds the 10 services). An empty list renders «القائمة فارغة. أضف قيماً من
الإعدادات ← القوائم.»

On success: `revalidatePath('/admin/projects/<id>')`, `revalidatePath('/admin/projects')`, then
`expirePublicProjects()` = `updateTag(PUBLIC_PROJECTS_TAG)` + `revalidatePath('/projects','layout')`.

## 12.4 · CURRENT IMPLEMENTATION — tab «القطع» and the lot form

`LotsTab` renders a `<ParcelPlan>` (reusing the **public** component from `@/components/site/parcel-plan`),
a `<LotsTable>` (code / offer / trees / status / area + area-per-tree / age + production / price +
price-per-tree / «البطاقة» link), and a `<details>` "+ إضافة قطعة" form for writers.
`/admin/projects/[id]/parcels/[parcelId]/page.tsx` reuses the same `<ParcelFields>` for editing.

`ParcelFields` (`src/app/admin/(panel)/projects/parcel-fields.tsx`) switches on
`onTree = treeClasses.length > 0`:

| Field name | Label | Shown | Required | Default | DB column |
|---|---|---|---|---|---|
| `code` | رمز القطعة | always | yes | `nextCode` (`P01`…) | `parcels.code` |
| `olive_tree_count` | عدد الزيتونات | always | yes **when `onTree`** | current | `parcels.olive_tree_count` |
| `spacing_class_id` | فئة المساحة | `onTree` only | yes | current, else first class | `parcels.spacing_class_id` |
| `area_m2` | المساحة (م²) | legacy only | yes | current | `parcels.area_m2` |
| `status` | الحالة | always | — | `available` | `parcels.status` |
| `property_type` | نوع العقار (أرض بيضاء / زيتون موجود) | always | — | `planted` | `parcels.property_type` |
| `plantation_system` | نظام الغراسة | always | no | current | `parcels.plantation_system` |
| `tree_age_years` | عمر الزيتونات (سنوات) | always | no | current | `parcels.tree_age_years` |
| `production_status` | حالة الإنتاج | always | no | current | `parcels.production_status` |
| `irrigation` | الري | always | no | current | `parcels.irrigation` |
| — | المساحة والسعر (read-only «تتحسب من عدد الزيتونات» + the computed figures) | `onTree` only | — | from `app.parcel_price` | — |
| `cash_price_dinars` | سعر الحاضر (د.ت) | legacy only | yes | `cash_price_millimes / 1000` | `parcels.cash_price_millimes` |
| `annual_costs_dinars` | المصاريف السنوية (د.ت) | always | no | `/1000` | `parcels.annual_costs_millimes` |
| `sort_order` | الترتيب | always | no | `nextOrder` = last + 10 | `parcels.sort_order` |
| `notes` | ملاحظات | always | no | current | `parcels.notes` (never public) |
| (PricingEditor) | — | legacy only | — | `parcel.pricing` | `parcels.pricing` |

`saveParcel()` re-reads `project_spacing_classes` server-side before deciding the branch — it does not
trust the form. On a tree-priced offer it refuses an empty tree count («اكتب عدد الزيتونات: مساحة القطعة
وسعرها يتحسبو منو.»), picks the class (the submitted one if it belongs to the project, else the single
class), computes `treeArea = round(trees) × class.area_m2` and writes `cash_price_millimes: 0`. On a legacy
offer it requires both area and price. `parcelError()` maps `23505` → «رمز القطعة مستعمل في هذا المشروع.»
and `parcel_spacing_not_in_project` through `intakeErrorMessage()`.

There is a second, cross-offer lots screen at `/admin/projects/parcels` (`OffersPage` links to it as
«كل القطع»): the same `LotsTable` across every offer, filtered by `status` and `offer`, with the same four
tree tiles, and a closing note that reservations/visits/contracts/payments are not modules yet.

## 12.5 · CURRENT IMPLEMENTATION — media upload and storage

Bucket: `project-media`, created by `0023` with `public = true`, `file_size_limit = 5242880` and
`allowed_mime_types = {image/jpeg, image/png, image/webp, image/avif}`. Four storage policies restrict
select/insert/update/delete on that bucket to `finance`, `admin`, `super_admin`.

`addProjectPicture()` (`actions.ts`):
1. `requireStaff(WRITE_ROLES)`.
2. `file` must be a non-empty `File`; `alt` is **mandatory** — «اكتب وصفاً مختصراً للصورة (نص بديل). إلزامي
   حتى تبقى الصفحة مقروءة للجميع.»
3. MIME must be one of the four (`PICTURE_TYPES` map, which also supplies the extension); size ≤ 5 MiB.
   Both mirror the bucket's own limits, and are described in a comment as mirroring them.
4. Reads `projects.code` and the existing `sort_order`s, plus `getPublicConfig()`; refuses when the count
   already reached `settingInt(config,'projects.gallery_max',24)`.
5. Path: `` `${code.toLowerCase()}/${Date.now()}.${extension}` `` — a fresh name on every upload, *"so a
   replaced picture is never served from a cache"*. `upsert: false`.
6. Inserts the `project_media` row with `bucket.getPublicUrl(path).data.publicUrl`, the storage path, the
   alt text, optional `caption` (≤200), `sort_order = max(existing) + 10`.
7. **If the row insert fails, the uploaded object is removed** (`bucket.remove([path])`) — *"Never leave a
   file in the public bucket that no row points to."* A `23514` (the gallery-limit trigger) is reported as
   the limit message.

Other media actions, all `requireStaff(WRITE_ROLES)` and all calling `pictureChanged()` (which revalidates
the admin page and expires the public cache):
- `setProjectCover(projectId, pictureId)` — clears the current cover first, then sets the new one, because
  the unique partial index allows only one.
- `moveProjectPicture(projectId, pictureId, ±1)` — swaps two rows and renumbers every `sort_order` to
  `(index + 1) * 10`.
- `removeProjectPicture(projectId, pictureId)` — deletes the row `returning storage_path`, then removes the
  object from the bucket.

`PicturesTab` shows a grid of thumbnails (plain `<img>` with an eslint-disable comment: *"admin preview of
an uploaded file"*), marks the cover — the stored one, or the first in order when none is flagged, matching
the SQL rule — and offers «اجعلها الغلاف» / «تقديم» / «تأخير» / «حذف» to writers. Empty state:
«ما فماش صور بعد. ما دام العرض بلا صورة يظهر رسم بألوان العلامة.»

**Documents are not uploaded.** `document_option_ids` is a set of `land_document` option ids; the public
page prints their labels and the copy `projects.documents_text` invites the visitor to ask to see them.
Nothing in this module stores or serves a document file. (`projects.plan_storage_path` exists in the
schema and has no writer and no reader.)

## 12.6 · CURRENT IMPLEMENTATION — tab «التسعير» (the tree-pricing switch)

`PricingTab` states the verdict in one pill: «يتسعّر بالزيتونة» (success) or «المسار القديم» (warning),
with the consequence spelled out — *"ما دام العرض بلا فئة مساحة، ما يتحسب حتى سعر للزيتونة: الموقع ما
يعرض سعر وما يفتحش استمارة الاهتمام."* It then shows three figures (price per tree, number of attached
classes, lots still on a hand-typed price out of the total) and the attached classes as pills, marking an
inactive one «معطّلة».

The switch is a checkbox set over the **active** `tree_spacing_classes` plus a mandatory `<ReasonField>`.
It submits `saveOfferSpacingClasses(projectId, …)` → `requireStaff(PRICE_ROLES)` →
`supabase.rpc("staff_save_project_spacing_classes", { p_project, p_class_ids, p_reason })`. That RPC
(`0034`, rebuilt from `0031`) checks `app.can_price()`, calls `app.set_reason()`, locks the project row
`for no key update`, rejects null/unknown/inactive classes (`invalid_spacing_class`), then deletes only the
classes left out and inserts only the new ones — so a class still used by a lot survives the guard
`app.check_project_class_in_use()` (`spacing_used_by_parcels`). It writes an audit row
`pricing.project_classes_save` with the before/after class lists.

Success messages state the consequence: «تم حفظ فئات المساحة. العرض يتسعّر بالزيتونة.» or, for an empty
selection, «تم الحفظ: العرض رجع للمسار القديم — سعر مكتوب لكل قطعة.» The action revalidates
`/admin/projects/<id>`, `/admin/pricing`, and expires the public cache.

Three empty states guard the form: tree pricing not enabled at all (`treePricingReady(config)` false), not
a price role, or no active classes exist (with a link to «فتح فئات المساحة»).

## 12.7 · CURRENT IMPLEMENTATION — tab «التكاليف»

Finance/Admin only, both in the tab list and in the render guard (`tab === "costs" && canSeeCosts`). Three
tiles: «مجموع التكاليف», «المداخيل المتوقّعة» (sum of `effectiveParcelFigures(...).cash` over lots that are
not `withdrawn`), «الهامش المتوقّع» (revenue − costs, bordered in danger when negative). A list of the
recorded costs and an add form (`label` / `kind` from `COST_KINDS_OFFERED` / `amount_dinars` / `note`).
`addProjectCost()` deliberately does **not** expire the public cache: *"Internal costs never reach the
public pages (PRJ-03), so this action leaves their cache alone."* Costs can be **added but never edited or
deleted** — there is no update or delete action for `project_costs`.

## 12.8 · CURRENT IMPLEMENTATION — publication workflow and preview

**Publication is a single `status` select.** There is no separate publish button, no draft/published pair of
rows, no scheduled publication, no approval step and no publication audit beyond the generic
`projects_audit` trigger. Changing «الحالة» from «مسودة» to «منشور» in the card tab and saving is the whole
workflow, and `expirePublicProjects()` makes it visible on the next request.

What each status change actually does is decided in SQL, not in the app: `app.project_visible()` and
`app.parcel_offered()` (§7.5). The Back Office does not warn that publishing an offer with no price, no
picture or no spacing class will produce a bare page — except through the four warnings listed in §12.2.

**Preview** exists in two forms:
1. *Link preview.* `ON_SITE = ["internal","published","sold_out","operating"]`; when the offer's status is
   one of them, the header shows «معاينة في الموقع ↗» → `/projects/<code>` in a new tab. It is an ordinary
   public URL — it works only if the visitor also passes the module gate, i.e. `projects` is `public`, or
   `internal` **and** the viewer has a staff session.
2. *Module preview.* `moduleAccess()` returns `"preview"` when the `projects` flag is `internal` and
   `getStaffSession()` succeeds. In that mode `src/lib/public-projects.ts` bypasses `unstable_cache`
   entirely (`callRpc("preview", …)` with the staff client) *"so a staff-only row can never land in the
   shared cache"*, and every public page renders `<PreviewBanner />`.

There is **no draft preview of an unsaved edit** and no preview token for a `draft` offer: a `draft`
project is invisible to `app.project_visible()` for everyone, staff included, so its public page 404s even
for an admin, and the «معاينة في الموقع» link is not rendered for it.

## 12.9 · CURRENT IMPLEMENTATION — clone, archive, delete

| Operation | Exists? | Detail |
|---|---|---|
| **Clone / duplicate** | **No.** | No action, route, button or RPC anywhere in `src/` or `supabase/` duplicates a project, a parcel or a gallery. A second offer is created from scratch through «+ عرض جديد». |
| **Archive** | **Yes, as a status only.** | `status = 'archived'` («مؤرشف») is selectable in both the create and the edit form. `app.project_visible()` excludes it from every public RPC, and `public_project_page()` returns null. It remains fully visible and editable in the Back Office, is still counted in the list-page totals and in `/admin/projects/parcels`, and its lots keep their statuses. There is no dedicated "archive" button, no archived filter, and no `archived_at`. |
| **Delete — project** | **No.** | `0012` revokes `delete` on `projects`, `parcels` and `project_costs` from `authenticated` and creates no delete policy; `0020` re-states *"delete stays revoked (no delete policy)"* and revokes `truncate`. `supabase/tests/006_public_projects.sql` asserts `not has_table_privilege('authenticated','public.projects','delete')`. No UI offers it. |
| **Delete — parcel** | **No.** | Same revoke. A lot is retired by setting `status = 'withdrawn'` («موقوفة»), which `app.parcel_visible_status()` hides from the public and `treeStock()` counts outside the total. |
| **Delete — cost** | **No.** | Insert-only. |
| **Delete — picture** | **Yes.** | The one delete in this module: `removeProjectPicture()`, backed by the `project_media_delete` RLS policy and the bucket policy, both restricted to Finance/Admin. `project_media` also cascades on project delete (`on delete cascade`) — a path nothing can currently reach. |

## 12.10 · OBSERVATIONS — section 12

- The `page_fields` hidden marker is load-bearing and fragile by design: `saveProject()` spreads the page
  fields into the update row only when it is present. `CardTab`'s own header comment explains that this is
  why the tab must remain **one** form — splitting it would silently blank `description_ar`, the water and
  access notes, the video, the coordinates and both option-id arrays. The same pattern guards
  `delegation_id`, which no form currently submits, so the column can only ever be set outside the app.
- `project_type_id` is taken with `text(formData, "project_type_id", 40) || null` and is not UUID-checked
  in the action (unlike `document_option_ids` / `service_option_ids`, which go through `optionIds()` and a
  UUID regex). The foreign key is the only check.
- `optionIds()` silently truncates to 30 ids; the database constraint is also 30
  (`projects_documents_bounded`, `projects_services_bounded`), so a 31st checkbox is dropped without a
  message.
- The admin offer page issues `staff_project_parcel_prices` once per offer; `/admin/projects/parcels`
  issues one call **per distinct offer present in the filtered list** (`offerIds.map(getStaffParcelPrices)`),
  so an unfiltered list on N offers makes N RPC round-trips.
- `/admin/projects/[id]/parcels/[parcelId]/page.tsx` calls `getStaffParcelPrices(supabase, id)` — the price
  map of the **whole offer** — and then takes one entry from it.
- `WRITE_ROLES` and `FINANCE_ROLES` in `[id]/page.tsx` are declared separately but hold the same three
  roles, so `canWrite` and `canSeeCosts` are always equal today; the costs tab is nevertheless gated twice.
- The admin lots tab imports `ParcelPlan` from `@/components/site/parcel-plan`, i.e. the public site
  component, and the public `[code]` page and the admin page both render it with the title «مخطط القطع»
  hard-coded at each call site.
- `saveParcel()` computes `treeArea` in TypeScript *and* the trigger `app.parcel_tree_unit_sync()` computes
  it again in SQL; the comment says this is deliberate — *"computing it here keeps the row valid on its
  own."*
- The "expected revenue" on the costs tab sums `effectiveParcelFigures(...).cash` over non-withdrawn lots.
  On an offer sold whole (no lots) it is therefore always 0, and the margin tile shows the negative of the
  recorded costs.
- `treeStock()` maps an unknown future parcel status to the `available` bucket rather than dropping it
  (*"A status a later migration adds is counted as stock on offer rather than dropped from the total"*),
  whereas the public `offerStock()` counts only the exact status strings it knows, so a new status would be
  counted in the admin total and in neither public bucket.
- The public `offerStock()` and the admin `treeStock()` disagree on `interested`: the public one puts it in
  `held`, the admin one puts it in `available` (`STOCK_BUCKET_OF.interested = "available"`, commented
  *"Still on the market: someone asked about it, nothing is held"*).
- `supabase/pending/bb_crm_offer_columns.sql` (untracked, not in `supabase/migrations/`) documents that
  `public.crm_requests` and `public.crm_search_requests` were last defined in `0032_intake_pricing.sql`,
  **before** `0049` added the offer columns, and that the CRM therefore cannot currently tell an offer lead
  from a calculator lead. That file is a pending fix, not applied schema; the migration series in
  `supabase/migrations/` ends at `0050`.

---

## Could not determine from current codebase

- Whether the `projects` feature flag is `public`, `internal` or `disabled` in the live database. The only
  value in the repository is the seed `disabled` (`0004_seed_configuration.sql`); `supabase/tests/` flips
  it to `public` inside rolled-back transactions, and `docs/` notes it as "flag disabled" at the time of
  0020. Runtime state was not inspected. *Could not determine from current codebase.*
- Likewise for the `pricing` flag, seeded `internal` by `0031`.
- Whether `projects.facts_land_title` / `projects.facts_trees_title` were added to the live `settings`
  table outside the migration series. *Could not determine from current codebase.*
- Which migrations of `0001`–`0050` have actually been applied to the live database.
  *Could not determine from current codebase.*
