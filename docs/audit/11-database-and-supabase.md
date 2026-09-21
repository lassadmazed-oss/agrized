## 11. DATABASE, SUPABASE, AUTHENTICATION & PERMISSIONS

Scope: sections **19 (DATABASE MAP)**, **20 (SUPABASE)** and **21 (AUTHENTICATION & PERMISSIONS)**.

Sources read: every file in `supabase/migrations/` (`0001_foundation.sql` → `0050_offer_copy.sql`), the SQL tests in
`supabase/tests/`, `supabase/pending/`, the generated types `src/lib/supabase/database.types.ts`, the Supabase client
wrappers in `src/lib/supabase/`, `src/lib/auth.ts`, `src/lib/config.ts`, `src/lib/modules.ts`, `src/lib/million.ts`,
`src/lib/public-projects.ts`, `src/proxy.ts`, every `page.tsx` / `actions.ts` / `route.ts` under `src/app/admin/` and
`src/app/(public)/`, and `scripts/*.mjs`.

Nothing in this report was executed against a live database. Statements about the schema are statements about what the
migration files create; whether the production database matches them is **Could not determine from current codebase.**

---

# 19. DATABASE MAP

## 19.1 Schemas

| Schema | Created in | Purpose | Exposure |
|---|---|---|---|
| `public` | Supabase default | Every business table, view and API-callable RPC. | Served by PostgREST to `anon` / `authenticated`, gated by RLS and per-function grants. |
| `app` | `0001_foundation.sql` — `create schema if not exists app; revoke all on schema app from public; grant usage on schema app to anon, authenticated, service_role` | Private helpers: predicates, setting readers, price engine, audit writer, trigger bodies, two internal tables. | **Not** exposed through PostgREST (Supabase only exposes `public` unless configured otherwise). Almost every `app.*` function additionally carries `revoke execute … from public, anon, authenticated`. |
| `auth` | Supabase | `auth.users` — the only identity store. Referenced by `public.profiles.id`. | Managed by Supabase Auth. |
| `storage` | Supabase | `storage.buckets`, `storage.objects`. Three buckets inserted by migrations; policies created on `storage.objects`. | See §20.3. |
| `extensions` | Supabase | `pg_trgm` installed here (`create extension if not exists pg_trgm with schema extensions`, 0001); used by `persons_name_trgm_idx` via `extensions.gin_trgm_ops`. | — |

`app.schema_migrations (version text primary key, applied_at timestamptz default now())` is **not** created by any
migration. It is created by the runner, `scripts/db-migrate.mjs`, on every run.

### Private tables in `app`

| Table | Columns | Purpose | Privileges |
|---|---|---|---|
| `app.counters` | `scope text pk`, `value bigint not null default 0` | Per-year sequence behind `app.next_number('interest_request:2026')` and `app.next_number('land_offer:2026')`, which produce `AGZ-2026-000123` and `AGZ-LND-2026-000045`. | `revoke all … from public, anon, authenticated` |
| `app.submission_throttle` | `id bigint identity pk`, `kind text not null`, `key_hash text not null`, `created_at timestamptz not null default now()`; index `(kind, key_hash, created_at desc)` | Anti-abuse counter behind `app.check_throttle()`. Stores a **salted SHA-256 of the IP**, never the IP (`src/lib/request-context.ts` → `hashIp()`, salt `IP_HASH_SALT`). | `revoke all … from public, anon, authenticated` |

## 19.2 Enums (all in `public`, all confirmed in `database.types.ts`)

| Enum | Values | Defined in | Used by |
|---|---|---|---|
| `app_role` | `client`, `commercial`, `agri_manager`, `finance`, `legal`, `admin`, `super_admin` | 0001 | `user_roles.role`, every `app.has_role` / `app.has_any_role` call, `public.admin_set_role` |
| `flag_state` | `disabled`, `internal`, `public` | 0001 | `feature_flags.state`, `app.flag_state()`, `app.module_open()`, `src/lib/modules.ts` |
| `lead_stage` | `new`, `contacting`, `qualified`, `proposed`, `visit`, `reserved`, `contracting`, `owner`, `paused`, `closed` | 0002 | `lead_statuses.stage`; the *system* stage behind an editable Arabic label |
| `contact_channel` | `phone`, `whatsapp`, `both` | 0002 | `interest_requests.contact_channel` |
| `contact_outcome` | `answered`, `no_answer`, `wrong_number`, `callback`, `not_interested` | 0002 | `contact_attempts.outcome` |
| `notification_status` | `pending`, `sending`, `sent`, `failed`, `skipped` | 0003 | `notification_outbox.status` |
| `land_offer_status` | `under_study`, `legal_review`, `technical_review`, `field_visit`, `accepted`, `rejected`, `postponed`, `converted` | 0003 | `land_offers.status`, `land_offer_reviews.stage`, `public.review_land_offer` |
| `irrigation_type` | `rainfed`, `irrigated` | 0003 | `land_offers.irrigation`, `projects.irrigation`, `parcels.irrigation` |
| `contact_capacity` | `owner`, `agent`, `broker` | 0003 | `land_offers.contact_capacity` |
| `project_status` | `draft`, `preparing`, `internal`, `published`, `sold_out`, `operating`, `archived` | 0012 | `projects.status`, `app.project_visible()`, `app.project_public_statuses()` |
| `parcel_status` | `available`, `interested`, `reserved`, `contracting`, `sold`, `owned`, `withdrawn` | 0012, `owned` added in 0021 | `parcels.status`, `app.parcel_offered()`, `app.parcel_visible_status()` |

`0021_parcel_statuses_v2.sql` documents the Arabic/English mapping of `parcel_status` in a `comment on type`:
`available` = Available, `interested` = Interested, `reserved` = Reserved, `contracting` = Contract in progress,
`sold` = Contracted, `owned` = Owned, `withdrawn` = Suspended.

## 19.3 Tables — foundation (0001)

### `public.profiles`

One row per `auth.users` row, created by the trigger `on_auth_user_created` → `app.handle_new_auth_user()`.

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | — | PK, FK → `auth.users(id)` |
| `full_name` | text | no | `''` | Display name; copied from `raw_user_meta_data->>'full_name'` at signup |
| `phone_e164` | text | yes | — | Copied from `auth.users.phone` if set |
| `locale` | text | no | `'ar'` | `check (locale in ('ar','fr'))` |
| `is_active` | boolean | no | `true` | Account switch; only `public.admin_set_user_active` changes it |
| `created_at`, `updated_at` | timestamptz | no | `now()` | `updated_at` maintained by trigger `profiles_stamp` |

Grants: `revoke update … from anon, authenticated; grant update (full_name, locale) on public.profiles to authenticated`.
RLS: `profiles_select` — a user sees their own row or any row if `app.is_staff()`; `profiles_update_self` — only own row.

Read by: `src/lib/auth.ts` (`getStaffSession`), `src/app/admin/login/actions.ts`, `src/app/admin/(panel)/users/page.tsx`,
`src/app/admin/(panel)/audit/page.tsx` (actor names), `src/app/admin/(panel)/pricing/page.tsx` (who last edited a rule).

### `public.user_roles`

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `user_id` | uuid | no | — | FK → `profiles(id)`, part of PK |
| `role` | `app_role` | no | — | Part of PK — a user may hold several roles |
| `granted_by` | uuid | yes | — | FK → `profiles(id)` |
| `granted_at` | timestamptz | no | `now()` | Also the round-robin tiebreaker in `submit_interest_request` |

Grants: `revoke insert, update, delete … from anon, authenticated`. All writes go through
`public.admin_set_role(uuid, app_role, boolean)`.
RLS: `user_roles_select` — own rows, or everything when `app.is_admin()`.

### `public.settings` — every business value (PRN-02)

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `key` | text | no | — | PK, e.g. `site.home_headline`, `pricing.max_months`, `antispam.max_requests_per_ip_per_hour` |
| `value` | jsonb | no | — | The value itself |
| `value_type` | text | no | — | `check in ('boolean','integer','money','text','json')` |
| `group_key` | text | no | — | Back-Office grouping. Observed groups: `site` (~195 rows), `projects` (~58), `lead` (9), `legal` (6), `million` (6), `antispam` (5), `start` (4), `pricing` (3), `sms` (2), `matching` (2), `audit` (1), `simulator` (1) |
| `label_ar` | text | no | — | Arabic label in the Back Office |
| `description_ar` | text | yes | — | Help text |
| `is_public` | boolean | no | `false` | **The read gate**: policy `settings_select` is `using (is_public or app.is_staff())` |
| `sort_order` | integer | no | `0` | Order inside the group |
| `updated_at`, `updated_by` | timestamptz / uuid | no / yes | `now()` / — | `updated_by` FK → `profiles(id)`, both set by `settings_stamp` |

Grants: `revoke insert, delete … from anon, authenticated`; `revoke update … from anon`; `settings_update` requires
`app.is_admin()`. A row trigger `settings_max_months_floor` (0031) fires only `when (new.key = 'pricing.max_months')` and
runs `app.check_max_months_setting()`, which refuses a cap below the longest active `duration` option or the longest
`financing_markups.months` (error `cap_below_durations`).

Read by: `src/lib/config.ts` (`is_public = true` only, cached), `src/app/admin/(panel)/settings/page.tsx`,
`src/app/admin/(panel)/settings/actions.ts`, plus `app.setting*()` inside the database.

### `public.feature_flags` — module visibility (FLAG-01..03)

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `key` | text | no | — | PK |
| `state` | `flag_state` | no | `'disabled'` | `disabled` / `internal` / `public` |
| `phase` | smallint | no | — | `check (phase between 1 and 4)` |
| `label_ar`, `description_ar` | text | no / yes | — | Back-Office copy |
| `sort_order` | integer | no | `0` | |
| `updated_at`, `updated_by` | | no / yes | `now()` | |

Rows seeded: `interest_form` (public), `simulator_basic` (public), `land_offers` (public), `projects` (disabled),
`matching` (disabled), `visits` (disabled), `reservations` (disabled), `contracts` (disabled), `installments` (disabled),
`zitounti` (disabled), `subscriptions` (disabled), `agri_backoffice` (disabled), `harvest` (disabled) — all 0004; then
`public_statistics` (public, phase 1, 0025) and `pricing` (**internal**, phase 1, 0031).

RLS: `feature_flags_select` is `using (true)` for `anon, authenticated` — the flag table is world-readable; only
`app.is_admin()` may update. Used in TypeScript through `src/lib/config.ts` → `flagState()` and
`src/lib/modules.ts` → `moduleAccess()`; used in SQL through `app.flag_state()` / `app.module_open()`.

### `public.audit_logs` — append-only (AUD-01..04)

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | bigint | no | `generated always as identity` | PK |
| `occurred_at` | timestamptz | no | `now()` | |
| `actor_id` | uuid | yes | — | `auth.uid()` at write time; **no FK** |
| `action` | text | no | — | `insert` / `update` / `delete` from the row trigger, or a named event (`auth.login`, `crm.export`, `document.open`, `pricing.rule_saved`, …) |
| `entity` | text | no | — | Table name, or `auth` |
| `entity_id` | text | yes | — | `id`, else `key`, else `user_id` of the row |
| `old_data`, `new_data` | jsonb | yes | — | Whole rows |
| `reason` | text | yes | — | `coalesce(p_reason, current_setting('app.reason'))` |
| `ip`, `user_agent` | text | yes | — | From request headers `x-client-ip` / `x-client-ua` |

Indexes: `(occurred_at desc)`, `(entity, entity_id, occurred_at desc)`, `(actor_id, occurred_at desc)`.
Append-only is enforced by two triggers calling `app.block_audit_mutation()`, which always raises
`audit_logs is append-only`: `audit_logs_no_update` (before update **or delete**, per row) and `audit_logs_no_truncate`
(before truncate, per statement). Grants: `revoke insert, update, delete, truncate … from anon, authenticated`.
RLS: `audit_logs_select` requires `app.is_admin()`.

Row-level auditing is attached with `create trigger <table>_audit after insert or update or delete … execute function
app.audit_row_change()` on: `profiles`, `user_roles`, `settings`, `feature_flags`, `governorates`, `delegations`,
`project_types`, `option_items`, `lead_statuses`, `persons`, `interest_requests`, `person_assignments`,
`message_templates`, `land_offers`, `land_offer_reviews`, `land_offer_files`, `ownership_scenarios`, `projects`,
`project_costs`, `parcels`, `site_media`, `project_media`, `tree_spacing_classes`, `tree_pricing_rules`,
`tree_cost_items`, `financing_markups`, `project_spacing_classes`, `project_down_payment_percents`.
`app.audit_row_change()` skips an UPDATE whose only difference is `updated_at`.

Writers from the app: `src/lib/auth-events.ts` inserts `auth.login`, `auth.login_failed`, `auth.login_denied`,
`auth.logout` **with the service-role client** (RLS bypass, since `authenticated` has no insert grant);
`src/app/admin/setup/actions.ts` inserts `auth.password_reset` the same way; everything else goes through
`public.log_action(...)`.

## 19.4 Tables — reference data (0002, 0010, 0029)

### `public.governorates`

`id smallint pk` (INS code), `name_ar text not null`, `name_fr text not null`, `sort_order smallint not null default 0`,
`is_active boolean not null default true`, plus `map_row smallint` and `map_col smallint` (0029) with a unique index
`governorates_map_tile_idx` — the cartogram tile grid used by `/admin/analytics`. Seeded by `0005_seed_governorates.sql`
(test 002 asserts **24** governorates and **279** delegations; the source data is `supabase/data/tunisia_admin.json`).
RLS: read by everyone; update by `app.is_admin()`; no insert/delete policy.

### `public.delegations`

`id integer identity pk`, `governorate_id smallint not null` FK → `governorates(id)`, `name_ar text not null`,
`name_fr text`, `sort_order`, `is_active`; `unique (governorate_id, name_ar)`; index `(governorate_id, sort_order)`.
Read by everyone; insert/update by `app.is_admin()`.

### `public.project_types`

`id uuid pk default gen_random_uuid()`, `code text not null unique`, `label_ar`, `label_fr`, `description_ar`,
`sort_order`, `is_active`, `created_at`, `updated_at`, `updated_by`; plus `image_url text` and `image_alt_ar text`
added in 0015 with `check (image_url is null or image_url ~ '^https://[^ ]+$')`.
Seeded codes: `bare_land` («أرض بيضاء للغراسة»), `young_olive` («زيتون مغروس حديثاً»),
`near_production` («زيتون قريب من الإنتاج»), `productive` («زيتون منتج»).

### `public.option_lists` / `public.option_items` — every dropdown (LEAD-01)

`option_lists`: `key text pk`, `label_ar text not null`, `value_kind text not null check in ('money','time_range',
'code','plain','number_range')` (`number_range` added by 0010), `description_ar`.

Lists created across migrations: `down_payment` (money), `monthly_installment` (money), `goal` (code),
`contact_time` (time_range), `property_type` (plain), `tree_age` (plain), `land_document` (plain) — all 0004;
`desired_area` (number_range), `priority` (code), `plantation_system` (code) — 0010; `tree_count` (number_range) — 0016;
`agrized_service` (code) — 0023; `duration` (number_range) and `budget` (money) — 0030;
`down_payment_percent` (number_range) — 0031.

`option_items`:

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `list_key` | text | no | — | FK → `option_lists(key)` |
| `code` | text | yes | — | `unique (list_key, code)` |
| `label_ar` / `label_fr` | text | no / yes | — | Shown to the visitor |
| `min_millimes` / `max_millimes` | bigint | yes | — | Money ranges; `check (min >= 0)` and `check (max is null or max >= coalesce(min,0))` |
| `min_number` / `max_number` | numeric(12,2) | yes | — | Added 0010. Non-money ranges: square metres (`desired_area`), tree counts (`tree_count`), **months** (`duration`), **percent** (`down_payment_percent`) |
| `time_from` / `time_to` | time | yes | — | `contact_time` |
| `sort_order` | integer | no | `0` | |
| `is_active` | boolean | no | `true` | Retirement switch — items are **never deleted**, so snapshots on old requests stay valid (LEAD-02) |
| `created_at`, `updated_at`, `updated_by` | | | `now()` | |

Two conditional triggers police this table (0031):
`option_items_duration_cap` → `app.check_duration_item()` fires `when (new.list_key = 'duration')` and refuses a
non-integer, a value < 1, or a value above `pricing.max_months` (default 84) with `duration_over_cap`;
`option_items_down_percent_range` → `app.check_down_percent_item()` fires `when (new.list_key = 'down_payment_percent')`
and requires `0 < min_number <= 100` and `max_number = min_number`, else `invalid_down_payment_percent`.

Deactivations recorded in migrations: 0017 retires `tree_count/trees_250p`; **0032 sets `is_active = false` for every
active item of `desired_area`, `priority`, `monthly_installment`, `down_payment` and `budget`** (plan Q-7 — the questions
left the form, the data stayed).

### `public.lead_statuses`

`id uuid pk`, `stage lead_stage not null`, `label_ar text not null`, `label_fr`, `sort_order`, `is_active`,
`is_stage_default boolean not null default false`, `updated_at`, `updated_by`. Unique partial index
`lead_statuses_stage_default_idx on (stage) where is_stage_default` — one default label per system stage.
Seeded with 12 rows (0004), including two `qualified` and two `visit` labels.
RLS: `lead_statuses_read` is **staff only** (`for select to authenticated using (app.is_staff())`) — unlike the other
reference tables, which `anon` can read. Insert/update by `app.is_admin()`.

### `public.ownership_scenarios` (0010, extended 0027)

The cards of «كيفاش تحب مشروعك يكون؟». Maps the citizen's words onto `project_type_id`, `plantation_system`
and `production_status`.

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `code` | text | no | — | unique |
| `label_ar` / `label_fr` | text | no / yes | — | Card title |
| `description_ar` / `description_fr` | text | yes | — | `description_fr` added 0027 |
| `project_type_id` | uuid | yes | — | FK → `project_types(id)` |
| `plantation_system` | text | yes | — | `check in ('traditional','intensive','other')` |
| `production_status` | text | yes | — | `check in ('none','starting','producing')` |
| `is_any` | boolean | no | `false` | The «اقترحولي» card: forces `project_type_unsure` on the request |
| `icon_code`, `image_url`, `image_alt_ar`, `image_alt_fr` | text | yes | — | Card artwork (0027) |
| `sort_order`, `is_active`, `created_at`, `updated_at`, `updated_by` | | | | |

Seeded codes: `big_productive`, `intensive_grove`, `bare_land`, `young_trees`, `any`.
RLS: readable by `anon` and `authenticated`; insert/update by `app.is_admin()`; delete revoked.

## 19.5 Tables — demand CRM (0002 → 0032, 0049)

### `public.persons` — one row per phone number (LEAD-04)

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `full_name` | text | no | — | |
| `phone_e164` | text | no | — | **unique**, `check (~ '^\+[1-9][0-9]{6,14}$')` — the identity key |
| `whatsapp_e164` | text | yes | — | Same shape check; intake defaults it to the phone |
| `email` | text | yes | — | |
| `governorate_id` | smallint | yes | — | FK → `governorates` |
| `delegation_id` | integer | yes | — | FK → `delegations` |
| `status_id` | uuid | no | — | FK → `lead_statuses(id)` — the live file status |
| `assigned_to` | uuid | yes | — | FK → `profiles(id)` — the owning commercial |
| `profile_id` | uuid | yes | — | unique FK → `profiles(id)`; a future client account. Never written by any code read here |
| `consent_at` | timestamptz | yes | — | Set/refreshed on every intake |
| `last_request_at` | timestamptz | yes | — | |
| `created_at`, `updated_at` | timestamptz | no | `now()` | |
| `archived_at` | timestamptz | yes | — | Excluded by `match_requests_for_parcel`; surfaced by the CRM view as `person_archived_at` |

Indexes: `(assigned_to)`, `(status_id)`, `(created_at desc)`, and a trigram GIN index on `full_name`.
Triggers: `persons_stamp`, `persons_audit`, and `persons_status_history` (after insert or update **of status_id**) →
`app.track_person_status()`, which writes a `person_status_history` row with `changed_by = auth.uid()`.

Grants: `revoke insert, delete … from authenticated`; `revoke update … from authenticated`; then
`grant update (full_name, whatsapp_e164, email, governorate_id, delegation_id, status_id) on public.persons to
authenticated`. So a signed-in staff member can never change `assigned_to` directly — transfers go through
`public.admin_assign_persons`.
RLS `persons_select`: `admin | super_admin | finance | legal` see all; `commercial` sees only rows where
`assigned_to = auth.uid()`. RLS `persons_update`: `app.is_admin()` or the assigned commercial.

### `public.interest_requests` — the demand itself, with its snapshots (LEAD-02)

The widest table in the schema; it grew in 0002, 0009, 0010, 0016, 0019, 0020, 0030, 0032 and 0049. Columns by family:

**Identity and provenance**

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `request_no` | text | no | — | unique, `AGZ-<year>-<6 digits>` from `app.next_number` + setting `request_no.prefix` |
| `person_id` | uuid | no | — | FK → `persons(id)` |
| `full_name`, `phone_e164` | text | no | — | As typed, never overwritten later |
| `whatsapp_e164`, `email` | text | yes | — | |
| `residence_governorate_id` | smallint | no | — | FK → `governorates` |
| `residence_delegation_id` | integer | **yes** | — | FK → `delegations`; `not null` was **dropped in 0009** (the form stopped asking) |
| `is_duplicate` | boolean | no | `false` | True when the person already existed (`not (xmax = 0)` on the upsert). Excluded from the public counter |
| `source` | jsonb | no | `'{}'` | Sanitised by `app.clean_source()`: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `ref`, `referrer`, `landing_path`, each length-capped |
| `consent_text` | text | no | — | The exact consent sentence shown, stored verbatim |
| `created_at` | timestamptz | no | `now()` | |
| `request_kind` | text | no | `'calculator'` | 0049. `check (request_kind in ('calculator','offer'))` |

**Where / what**

`invest_anywhere boolean not null default false`, `invest_governorate_ids smallint[] not null default '{}'`,
`project_type_unsure boolean not null default false`, `project_type_ids uuid[] not null default '{}'`,
`scenario_ids uuid[] not null default '{}'`, `scenario_labels text[] not null default '{}'`,
`plantation_systems text[] not null default '{}'`, `production_statuses text[] not null default '{}'`.
Table constraints from 0002: `interest_requests_location_chk check (invest_anywhere or cardinality(invest_governorate_ids) > 0)`
and `interest_requests_type_chk check (project_type_unsure or cardinality(project_type_ids) > 0)`.

**Option snapshots** — every chosen option is stored as *id + label + bounds*, so retiring the option never rewrites history:

| Family | Columns |
|---|---|
| Goal | `goal_option_id` (FK option_items), `goal_code`, `goal_label_ar` — **`not null` dropped in 0049**, replaced by `interest_requests_goal_check check (request_kind <> 'calculator' or (goal_option_id is not null and goal_label_ar is not null))` |
| Tree count | `tree_count_option_id`, `tree_count_code`, `tree_count_label_ar`, `tree_count_min`, `tree_count_max` (0016). `tree_count_code = 'custom'` marks a number the visitor typed on `/start` (0019) |
| Desired area | `desired_area_option_id`, `desired_area_label_ar`, `desired_area_min_m2`, `desired_area_max_m2` (0010) |
| Priority | `priority_option_id`, `priority_code`, `priority_label_ar` (0010) |
| Down payment (amount) | `down_payment_option_id`, `down_payment_label_ar`, `down_payment_min_millimes`, `down_payment_max_millimes`. `not null` dropped in 0032 |
| Instalment (amount) | `installment_option_id`, `installment_label_ar`, `installment_min_millimes`, `installment_max_millimes`. `not null` dropped in 0030 |
| Duration | `duration_option_id`, `duration_label_ar`, `duration_months` (0030) |
| Budget | `budget_option_id`, `budget_label_ar`, `budget_min_millimes`, `budget_max_millimes` (0030) |
| Contact | `contact_channel contact_channel not null`, `contact_time_option_id`, `contact_time_label_ar` |
| Intent | `wants_visit boolean`, `wants_bank_financing boolean` (0030) |

**Tree-pricing snapshot (0032)** — `spacing_class_id` (FK → `tree_spacing_classes`), `spacing_label_ar`,
`area_per_tree_m2 numeric(10,2)`, `total_area_m2 numeric(14,2)`,
`payment_mode text check in ('cash','installments')`, `price_per_tree_millimes`, `total_price_millimes`,
`down_payment_percent_option_id`, `down_payment_percent numeric(5,2)`, `down_payment_amount_millimes`,
`total_financed_millimes`, `monthly_millimes`.

**Parcel/project snapshot (0020)** — `parcel_id` (FK `parcels`, `on delete set null`), `project_id` (FK `projects`,
`on delete set null`), `project_code`, `project_name`, `parcel_code`, `parcel_area_m2`, `parcel_property_type`,
`parcel_plantation_system`, `parcel_olive_tree_count`, `parcel_production_status`, `parcel_cash_price_millimes`,
`parcel_plan_months`, `parcel_plan_total_millimes`, `parcel_plan_last_millimes`, `parcel_captured_at`.

**Offer snapshot (0049)** — `offer_trees integer check (offer_trees is null or offer_trees > 0)`,
`offer_price_per_tree_millimes`, `offer_total_price_millimes`, `offer_annual_fee_per_tree_millimes`,
`offer_annual_fee_total_millimes`.

Indexes: `(person_id, created_at desc)`, `(created_at desc)`, `(residence_governorate_id, residence_delegation_id)`,
GIN on `invest_governorate_ids`, GIN on `project_type_ids`, GIN on `scenario_ids`, GIN on `plantation_systems`,
`(down_payment_min_millimes)`, `(installment_min_millimes)`, `(phone_e164, created_at desc)`,
`(tree_count_min, tree_count_max)`, `(desired_area_min_m2, desired_area_max_m2)`, `(priority_code)`,
`(duration_months)`, partial `(spacing_class_id) where not null`, partial `(parcel_id) where not null`,
partial `(project_id) where not null`.

Grants: `revoke insert, update, delete … from authenticated`. The table is **write-only from the database side**:
only the three security-definer intake RPCs write it. RLS `interest_requests_select` uses `app.can_see_person(person_id)`.

### `public.person_status_history`

`id uuid pk`, `person_id` FK, `from_status_id` FK (nullable), `to_status_id` FK (not null), `changed_by` FK → profiles,
`created_at`. Index `(person_id, created_at desc)`. Written only by the trigger. `revoke insert, update, delete … from
authenticated`. RLS select via `app.can_see_person`.

### `public.contact_attempts`

`id uuid pk`, `person_id` FK, `channel text check in ('phone','whatsapp','sms','other')`,
`outcome contact_outcome not null`, `note text check (length(note) <= 5000)`, `next_follow_up_at timestamptz`,
`created_by uuid not null default auth.uid()` FK → profiles, `created_at`. Indexes `(person_id, created_at desc)` and a
partial `(created_by, next_follow_up_at) where next_follow_up_at is not null` (the follow-up list on `/admin`).
`revoke update, delete … from authenticated` — attempts are immutable once written.
RLS: select via `app.can_see_person`; insert requires `created_by = auth.uid() and app.can_edit_person(person_id)`
(0008 replaced the original 0002 policy, which used `can_see_person` — that is how Finance and Legal became read-only).

### `public.person_notes`

`id uuid pk`, `person_id` FK, `body text check (length between 1 and 5000)`, `created_by uuid not null default auth.uid()`,
`created_at`. Same immutability and the same insert rule as `contact_attempts`.

### `public.person_assignments`

`id uuid pk`, `person_id` FK, `from_user`/`to_user` FK → profiles (both nullable), `reason text`, `created_by` FK,
`created_at`. Indexes `(person_id, created_at desc)` and `(to_user, created_at desc)`.
Written only by `public.admin_assign_persons` and by the round-robin branch of `submit_interest_request`
(`reason = 'auto:round_robin'`). `revoke insert, update, delete … from authenticated`.

### View `public.crm_requests`

`create view public.crm_requests with (security_invoker = on) as select r.*, p.status_id, s.stage,
s.label_ar as status_label_ar, p.assigned_to, pr.full_name as assigned_to_name, p.archived_at as person_archived_at
from public.interest_requests r join public.persons p on p.id = r.person_id join public.lead_statuses s on
s.id = p.status_id left join public.profiles pr on pr.id = p.assigned_to;`

`security_invoker = on` means the caller's RLS on `interest_requests` and `persons` decides the rows. `revoke all …
from anon`. The view is dropped and recreated in 0016, 0030 and **0032** (a view freezes its column list at creation,
so each new snapshot family forces a rebuild). **It was not rebuilt after 0049**, so the view does not expose
`request_kind`, `offer_trees` or the four `offer_*` money columns — confirmed by the generated types, whose
`crm_requests` Row has none of them.

## 19.6 Tables — landowner offers (0003)

### `public.land_offers`

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `reference_no` | text | no | — | unique, `AGZ-LND-<year>-<6 digits>` |
| `governorate_id` / `delegation_id` | smallint / integer | no | — | FKs; the pair is validated by the RPC |
| `location_description` | text | yes | — | `check (length <= 1000)` |
| `latitude` / `longitude` | numeric(9,6) | yes | — | range checks −90..90 / −180..180 |
| `area_value` | numeric(12,2) | no | — | `check (> 0)` |
| `area_unit` | text | no | — | `check in ('ha','m2')` |
| `property_type_option_id` / `property_type_label_ar` | uuid / text | no | — | Snapshot of the `property_type` option |
| `olive_tree_count` | integer | yes | — | `check (>= 0)` |
| `tree_age_option_id` / `tree_age_label_ar` | uuid / text | yes | — | Snapshot |
| `irrigation` | `irrigation_type` | no | — | |
| `water_source` | text | yes | — | `check (length <= 200)` |
| `asking_price_millimes` | bigint | yes | — | `check (>= 0)` |
| `price_negotiable` | boolean | no | `false` | |
| `contact_name`, `contact_phone_e164` | text | no | — | |
| `contact_capacity` | `contact_capacity` | no | — | owner / agent / broker |
| `available_documents` | jsonb | no | `'[]'` | `[{id, label_ar}]` built from the `land_document` option list |
| `status` | `land_offer_status` | no | `'under_study'` | |
| `source` | jsonb | no | `'{}'` | `app.clean_source()` |
| `consent_text` | text | no | — | |
| `created_at`, `updated_at` | timestamptz | no | `now()` | |

Indexes `(status, created_at desc)` and `(governorate_id, delegation_id)`.

### `public.land_offer_files`

`id uuid pk`, `land_offer_id` FK, `storage_path text not null unique`, `file_name text not null`,
`mime_type text not null`, `size_bytes bigint not null check (> 0)`, `uploaded_at timestamptz not null default now()`.
Index `(land_offer_id)`. Rows are inserted by `finalizeLandOfferFiles()` in `src/app/(public)/land/actions.ts` using the
**service-role** client, after verifying the object really landed in storage and that the offer is less than two hours
old.

### `public.land_offer_reviews`

`id uuid pk`, `land_offer_id` FK, `stage land_offer_status not null`,
`outcome text not null check in ('passed','failed','needs_info','note')`, `notes text check (length <= 5000)`,
`reviewer_id uuid default auth.uid()` FK → profiles, `created_at`. Index `(land_offer_id, created_at desc)`.
Written only by `public.review_land_offer`.

All three tables: `revoke all … from anon`, `revoke insert, update, delete … from authenticated`, and a select policy
requiring `agri_manager | legal | finance | admin | super_admin`.

## 19.7 Tables — messaging (0003)

### `public.message_templates`

`key text pk`, `channel text check in ('sms','whatsapp')`, `body_ar text not null`, `body_fr text`,
`description_ar text`, `variables text[] not null default '{}'`, `is_active boolean not null default true`,
`updated_at`, `updated_by`. RLS: **admin only** for both select and update (0007 redefined `message_templates_select`);
`revoke insert, delete … from authenticated`.
Read in the app by `src/app/admin/(panel)/leads/[personId]/page.tsx` (the WhatsApp/SMS snippets a commercial copies).

### `public.notification_outbox`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `channel` | text | no | `check in ('sms','whatsapp')` |
| `to_phone_e164` | text | no | — |
| `template_key` | text | yes | FK → `message_templates(key)` |
| `body` | text | no | Rendered by `app.render_template()` (`{key}` substitution) |
| `related_entity`, `related_id` | text / uuid | yes | e.g. `interest_requests` + the request id |
| `status` | `notification_status` | no | `'pending'` |
| `attempts` | integer | no | `0` |
| `last_error`, `provider`, `provider_message_id` | text | yes | — |
| `scheduled_at` | timestamptz | no | `now()` |
| `sent_at` | timestamptz | yes | — |
| `created_at` | timestamptz | no | `now()` |

Partial index `(scheduled_at) where status in ('pending','failed')`, plus `(related_entity, related_id)`.
Rows are enqueued by `app.enqueue_message()` from `submit_interest_request`, `submit_land_offer` and
`submit_offer_request`. **No code in `src/` reads, updates or sends from this table** — there is no worker.
RLS: select for admins only; `revoke insert, update, delete … from authenticated`.

## 19.8 Tables — site media (0015, 0018, 0023)

### `public.site_media`

`slot text pk` (e.g. `home.hero`, `home.journey`, `home.parcel_a/b/c`, `home.coverage`, `home.land`, `home.closing`,
plus slots added by 0019), `label_ar text not null`, `description_ar`, `url text`, `alt_ar text`,
`aspect text not null default '4/3' check in ('16/9','3/2','4/3','1/1','3/4','2/3')`,
`group_key text not null default 'home'`, `sort_order`, `updated_at`, `updated_by`,
`credit_text text`, `credit_url text` (0018) with `check (credit_url is null or credit_url ~ '^https://[^ ]+$')`.
Two table constraints: `site_media_url_shape` (https or null) and `site_media_alt_needed`
(`url is null or (alt_ar is not null and length(btrim(alt_ar)) > 0)`) — a picture cannot be published without Arabic
alt text. Rows are created by migrations only: `revoke insert, delete … from authenticated`;
`site_media_admin_update` requires `app.is_admin()`; `site_media_read` is `using (true)` for everyone.
Read by `src/lib/config.ts` (`mediaFor`, `mediaCredits`) and `/admin/settings/media`.

### `public.project_media` (0023)

`id uuid pk`, `project_id` FK, `url text` (https), `storage_path text`, `alt_ar text not null`, `caption_ar text`,
`is_cover boolean`, `sort_order integer`, `created_at`, `created_by`.
Unique partial index `project_media_one_cover on (project_id) where is_cover` — at most one cover per project.
Trigger `project_media_limit` (before insert) → `app.project_media_limit()` caps the gallery.
RLS: select by staff; insert/update/delete by `finance | admin | super_admin`.
Written by `src/app/admin/(panel)/projects/actions.ts`; read publicly only through `public.public_project_page()`.

## 19.9 Tables — projects and parcels (0012, 0023, 0034, 0035)

### `public.projects`

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `code` | text | no | — | unique; the public URL segment (`/projects/[code]`) |
| `name` | text | no | — | |
| `project_type_id` | uuid | yes | — | FK → `project_types` |
| `governorate_id` | smallint | no | — | FK |
| `delegation_id` | integer | yes | — | FK |
| `location_description` | text | yes | — | `check (length <= 1000)` |
| `latitude`, `longitude` | numeric(9,6) | yes | — | Public **only** when `show_location` |
| `total_area_m2` | numeric(12,2) | yes | — | `check (> 0)` |
| `olive_variety` | text | yes | — | |
| `tree_count` | integer | yes | — | `check (>= 0)` |
| `tree_age_years` | numeric(4,1) | yes | — | `check (>= 0)` |
| `plantation_system` | text | yes | — | `check in ('traditional','intensive','other')` |
| `production_status` | text | yes | — | `check in ('none','starting','producing')` |
| `irrigation` | `irrigation_type` | yes | — | |
| `pricing` | jsonb | no | `'{}'` | Legacy per-project instalment formula consumed by `public.compute_installment_plan` |
| `annual_costs_millimes` | bigint | yes | — | `check (>= 0)` |
| `plan_storage_path` | text | yes | — | Never public |
| `legal_notes` | text | yes | — | Never public |
| `status` | `project_status` | no | `'draft'` | |
| `land_offer_id` | uuid | yes | — | FK → `land_offers(id)`; never public |
| `description_ar`, `water_available` (boolean), `water_note`, `access_note`, `video_url`, `show_location` (boolean, default false), `document_option_ids uuid[]`, `service_option_ids uuid[]` | | | | Added by 0023 for the public project page |
| `created_at`, `updated_at`, `updated_by` | | | `now()` | |

Indexes `(status, created_at desc)` and `(governorate_id, delegation_id)`.

### `public.project_costs` — internal budget, Finance/Admin only (PRJ-03)

`id uuid pk`, `project_id` FK, `kind text not null`, `label text not null`,
`amount_millimes bigint not null check (>= 0)`, `note text`, `created_at`, `created_by default auth.uid()`.
The `kind` check was replaced in 0022 (`project_costs_kind_check`) with the report-v3 §35 category list.
RLS select requires `finance | admin | super_admin`; insert/update the same; **no delete policy and no delete grant**.

### `public.parcels`

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `project_id` | uuid | no | — | FK → `projects`; `unique (project_id, code)` |
| `code` | text | no | — | |
| `area_m2` | numeric(12,2) | no | — | `check (> 0)`. **Overwritten** by `app.parcel_tree_unit_sync()` for tree-priced projects: `trees × area per tree` |
| `property_type` | text | no | — | `check in ('bare_land','planted')` |
| `plantation_system` | text | yes | — | `check in ('traditional','intensive','other')` |
| `olive_tree_count` | integer | yes | — | `check (>= 0)`. Comment: *"Actual number of olive trees entered by the administration. Never computed from area_m2 (PARC-02)"* |
| `tree_age_years` | numeric(4,1) | yes | — | |
| `production_status` | text | yes | — | `check in ('none','starting','producing')` |
| `irrigation` | `irrigation_type` | yes | — | |
| `cash_price_millimes` | bigint | no | — | `check (>= 0)`. For a tree-priced parcel the code stores `0`, and `app.parcel_price` reads `nullif(cash_price_millimes, 0)` |
| `annual_costs_millimes` | bigint | yes | — | `check (>= 0)` |
| `pricing` | jsonb | yes | — | Optional override of `projects.pricing` |
| `status` | `parcel_status` | no | `'available'` | |
| `notes` | text | yes | — | `check (length <= 2000)`; never public |
| `sort_order` | integer | no | `0` | |
| `spacing_class_id` | uuid | yes | — | 0034. FK → `tree_spacing_classes`; partial index `where not null` |
| `created_at`, `updated_at`, `updated_by` | | | `now()` | |

Indexes `(project_id, sort_order)`, `(status)`, `(area_m2)`.
Triggers in name order (BEFORE triggers fire alphabetically):
`parcels_spacing_class_check` (0034) → `app.check_parcel_spacing_class()` refuses a class the project does not sell;
`parcels_stamp`; `parcels_tree_unit_sync` (0035) → `app.parcel_tree_unit_sync()` fills `spacing_class_id` from the
project's single class and recomputes `area_m2 = olive_tree_count × class.area_m2`.
A second fan-out trigger lives on the class table: `tree_spacing_classes_area_fanout`
(after update of `row_spacing_m`, `tree_spacing_m`) → `app.spacing_area_fanout()` re-multiplies `parcels.area_m2` for
every parcel of that class in a tree-priced project.

Grants on `projects` / `parcels` / `project_costs`: 0012 revoked everything from `anon` and revoked
insert/update/delete from `authenticated`; 0020 re-granted **insert and update only** (`grant insert, update on
public.projects, public.parcels, public.project_costs to authenticated`) and revoked `truncate`. There is **no delete
path** for projects, parcels or costs anywhere in SQL or TypeScript.

## 19.10 Tables — tree pricing (0031, 0034, 0045)

The unit of sale is *one olive tree together with its area*.

### `public.tree_spacing_classes`

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `code` | text | no | — | unique, `check (~ '^[a-z0-9_]{2,40}$')` |
| `label_ar` | text | no | — | 1..120 chars |
| `label_fr` | text | yes | — | ≤ 120 |
| `row_spacing_m` | numeric(6,2) | no | — | `check (> 0)` |
| `tree_spacing_m` | numeric(6,2) | no | — | `check (> 0)` |
| `area_m2` | numeric(10,2) | — | **generated always as (`row_spacing_m * tree_spacing_m`) stored** | The area attached to one tree |
| `sort_order`, `is_active`, `created_at`, `updated_at`, `updated_by` | | | | |

Seeded: `trad_wide_24x24` (24×24), `trad_14x14`, `semi_10x10`, `int_7x7`, `int_7x5`, `int_5x5`, `super_4x2`,
`super_4x1_5`. RLS: `anon` and `authenticated` may select an **active** class; inactive classes are visible only to
`finance | admin | super_admin`. Writes only via `staff_save_spacing_class` / `staff_delete_spacing_class`.

### `public.tree_pricing_rules` — one global row + optional per-project overrides

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | uuid | no | PK |
| `project_id` | uuid | yes | **unique**; `null` = the global rule. Unique index `tree_pricing_rules_one_global on ((project_id is null)) where project_id is null` guarantees exactly one global row |
| `land_price_per_m2_millimes` | bigint | yes | `check (>= 0)`; seeded 10 000 (= 10 د/m²) |
| `planting_cost_per_tree_millimes` | bigint | yes | seeded 50 000 (= 50 د) |
| `margin_mode` | text | yes | `check in ('percent','fixed')` |
| `margin_percent_bp` | integer | yes | basis points, `check between 0 and 100000`; seeded 2500 (= 25 %) |
| `margin_fixed_millimes` | bigint | yes | |
| `price_rounding_millimes` | bigint | yes | `check (>= 1)`; seeded 1000 |
| `monthly_rounding_millimes` | bigint | yes | `check (>= 1)`; seeded 1000 |
| `use_global_cost_items` | boolean | no | default `true` — a project may drop the global extra-cost lines |
| `annual_fee_per_tree_millimes` | bigint | yes | 0045. `check (>= 0)`; global row seeded **150 000** (= 150 د/tree/year) |
| `note_ar`, `markups_note_ar` | text | yes | ≤ 1000 chars, internal, never shown to visitors |
| `updated_at`, `updated_by` | | | |

Constraints: `tree_pricing_rules_margin_check` (a mode implies its figure) and `tree_pricing_rules_global_check`
(the global row must carry land price, planting cost and both rounding steps).
RLS: select requires `finance | admin | super_admin`. Writes via `staff_save_pricing_rule` (redefined in **0046** so the
annual fee can actually be saved) and `staff_delete_pricing_rule`.

### `public.tree_cost_items` — extra cost lines

`id uuid pk`, `project_id uuid` (null = global), `label_ar` (1..120), `label_fr`,
`basis text not null check in ('per_tree','per_m2')`, `amount_millimes bigint not null check (>= 0)`,
`sort_order`, `is_active`, `updated_at`, `updated_by`. Index `(project_id, sort_order)`.
RLS select: `finance | admin | super_admin`.

### `public.financing_markups` — markup per payment duration

`id uuid pk`, `project_id uuid` (null = global), `months integer not null check (> 0)`,
`markup_bp integer not null check between 0 and 100000`, `updated_at`, `updated_by`,
`constraint financing_markups_scope_months_key unique nulls not distinct (project_id, months)`.
Trigger `financing_markups_cap` → `app.check_markup_months()` refuses `months > setting pricing.max_months` (84).
Seeded global rows: 36 → 1000 bp (10 %), 48 → 1400, 60 → 1800, 84 → 2500.
RLS select: `finance | admin | super_admin`.

### `public.project_spacing_classes` (join)

`primary key (project_id, spacing_class_id)`, plus `created_at`, `created_by`; index on `spacing_class_id`.
**Its presence is what puts a project on tree pricing** — `app.project_on_tree_pricing(p)` is literally
`exists (select 1 from project_spacing_classes where project_id = p)`. A project with rows sells only those classes;
a project with none is "legacy" and keeps its typed area and cash price.
Trigger `project_spacing_classes_in_use` (before update or delete, 0034) → `app.check_project_class_in_use()` blocks
removing a class that parcels still use. Written by `staff_save_project_spacing_classes`.

### `public.project_down_payment_percents` (join)

`primary key (project_id, option_item_id)` → items of the `down_payment_percent` list. No rows = every active
percentage is offered. Written by `staff_save_project_down_percents`.

## 19.11 Database functions

### `app.*` — private helpers (all `set search_path = ''`; almost all `revoke execute … from public, anon, authenticated`)

| Function | Kind | What it does |
|---|---|---|
| `app.stamp_updated()` | trigger | Sets `updated_at = now()` and, when the row has `updated_by`, `coalesce(auth.uid(), existing)` |
| `app.audit_row_change()` | trigger, definer | Writes the audit row; skips updates that only moved `updated_at` |
| `app.block_audit_mutation()` | trigger | Always raises `audit_logs is append-only` |
| `app.write_audit(action, entity, entity_id, old, new, reason)` | definer | The single audit writer; reads `x-client-ip` / `x-client-ua` and `current_setting('app.reason')` |
| `app.request_header(name)` | stable | `current_setting('request.headers')::json ->> name` |
| `app.current_roles()` / `has_role` / `has_any_role` / `is_staff` / `is_admin` | stable, definer | Role predicates. `current_roles()` joins `profiles` and requires `is_active` |
| `app.can_see_person(id)` | stable, definer | `admin|super_admin|finance|legal`, or `commercial` assigned to that person |
| `app.can_edit_person(id)` | stable, definer | 0008. `is_admin()`, or the assigned `commercial` |
| `app.can_price()` | stable, definer | `finance | admin | super_admin` |
| `app.setting` / `setting_text` / `setting_int` / `setting_bool` | stable, definer | Read `public.settings` with a fallback |
| `app.next_number(scope)` | definer | Upsert-and-return on `app.counters` |
| `app.check_throttle(kind, key_hash, window, max)` | definer | Raises `rate_limited` and records an attempt |
| `app.assert_phone(phone, error)` | stable, definer | E.164 shape, then `^\+216[0-9]{8}$` unless setting `lead.allow_international_phone` |
| `app.clean_source(jsonb)` | immutable | Whitelists and truncates the UTM/referrer keys |
| `app.active_option(list, id)` | stable, definer | Returns the `option_items` row if active |
| `app.like_escape(text)` | — | 0007; escapes `%`/`_` for the CRM search |
| `app.render_template(body, vars)` | immutable | `{key}` substitution |
| `app.enqueue_message(template, to, vars, entity, id)` | definer | Inserts into `notification_outbox`; silently returns if the template is missing or inactive |
| `app.track_person_status()` | trigger, definer | Writes `person_status_history` |
| `app.require_reason(reason, min_len)` / `app.set_reason(reason)` | 0024 | Refuse a reason shorter than `max(1, setting audit.reason_min_length)` (error `reason_required`); `set_reason` puts it in the transaction-local GUC `app.reason` |
| `app.flag_state(key)` / `app.module_open(key)` | stable, definer | `module_open` = `public`, or `internal` **and** `app.is_staff()` |
| `app.project_public_statuses()` / `app.project_visible(status)` | stable, definer | `published`, plus `sold_out`/`operating` when setting `projects.list_closed` (default true); `internal` only for staff. `project_visible` also requires `app.module_open('projects')` |
| `app.parcel_offer_statuses()` / `app.parcel_offered(proj, parcel)` / `app.parcel_visible_status(status)` | stable, definer | "Offered" = project `published` **and** parcel `available` (plus `interested` when setting `projects.offer_includes_interested`). Visible = anything but `withdrawn`, subject to `projects.show_taken_parcels` |
| `app.parcel_offer_payload(parcel, down, installment, force_price)` | stable, definer | Legacy offer card payload; never returns the pricing JSON, model, markup, brackets, `max_months` or `min_down_pct` |
| `app.parcel_pricing(parcel)` | 0013 | `parcels.pricing` → `projects.pricing` → setting `pricing.default` |
| `app.parcel_down_from(parcel, cash)` | 0022 | Smallest down-payment option a parcel really accepts |
| `app.price_rounding(project)` | stable, definer | Project step, else global step, else 1 |
| `app.down_payment_from_percent(cash_total, percent, project)` | stable, definer | `ceil(cash × p / 100 / step) × step`; null unless `0 < p ≤ 100` |
| `app.project_down_percent_items(project)` | stable, definer | The project's percentages, or every active one |
| `app.tree_price(spacing_class, project)` | stable, definer | **The price engine.** See below |
| `app.financed_quote(cash_total, down, months, project)` | stable, definer | **The instalment engine.** See below |
| `app.project_on_tree_pricing(project)` / `app.project_spacing_choice(project, class)` | stable, definer | 0034. `status` ∈ `ok`, `required`, `not_allowed`, `legacy` |
| `app.parcel_price(parcel)` | stable, definer | The one definition of a parcel's price (0034, extended 0045) |
| `app.project_quote_payload(project, class, trees, mode, down_pct_option, duration_option, staff)` | stable, definer | Shared body of `public_project_quote` / `staff_project_quote` (0034, extended 0048 for the annual fee) |
| `app.parcel_tree_unit_sync()` / `app.spacing_area_fanout()` | trigger, definer | 0035, described above |
| `app.check_duration_item()` / `app.check_down_percent_item()` / `app.check_max_months_setting()` / `app.check_markup_months()` / `app.check_parcel_spacing_class()` / `app.check_project_class_in_use()` / `app.project_media_limit()` | trigger, definer | Guards described in their table sections |
| `app.handle_new_auth_user()` | trigger, definer | Creates the `profiles` row on `auth.users` insert |

**`app.tree_price(class, project)`** (final form in 0045) returns jsonb. It resolves each parameter *project row first,
then global row*, and refuses a class the project does not sell (`spacing_not_allowed`). The formula:

```
area          = class.row_spacing_m × class.tree_spacing_m      (generated column)
land          = area × land_price_per_m2_millimes
extras        = Σ(per_tree amount) + Σ(per_m2 amount × area)     (global lines unless use_global_cost_items = false, + project lines)
cost          = land + planting_cost_per_tree + extras
margin        = cost × margin_percent_bp / 10000   OR   margin_fixed_millimes
price_per_tree = ceil((cost + margin) / price_rounding) × price_rounding
```

It also returns `annual_fee_per_tree_millimes` (inherited the same way) and a `sources` object saying, per parameter,
whether it came from `'project'` or `'global'`. Failure shapes: `{ok:false, reason:'spacing_not_found'}`,
`'spacing_not_allowed'`, `'margin_not_set'`.

**`app.financed_quote(cash_total, down, months, project)`** — rewritten in **0036**; the markup applies only to the
financed part:

```
remaining      = ceil((cash − down) × (10000 + markup_bp) / 10000 / price_rounding) × price_rounding
total_financed = down + remaining
monthly        = ceil(remaining / months / monthly_rounding) × monthly_rounding
installments   = ceil(remaining / monthly)                  -- may be fewer than `months` ⇒ `shortened: true`
last           = remaining − monthly × (count − 1)
```

The markup is picked with `where m.months = p_months and (m.project_id is null or m.project_id = p_project) order by
(m.project_id is null) limit 1` — a project row wins over the global row. Failure reasons: `invalid_input`,
`too_many_months`, `duration_not_priced`, `down_covers_total`.

### `public.*` — API-callable RPCs

Grants are explicit everywhere (Supabase grants `execute` to `PUBLIC` on new functions by default, so every migration
revokes first).

| Function | Security | Grants | Callers |
|---|---|---|---|
| `submit_interest_request(p jsonb)` | definer | **`service_role` only** | `src/app/(public)/register/actions.ts` |
| `submit_land_offer(p jsonb)` | definer | **`service_role` only** | `src/app/(public)/land/actions.ts` |
| `submit_offer_request(p jsonb)` | definer | **`service_role` only** | `src/app/(public)/projects/[code]/offer-actions.ts` |
| `million_progress()` | definer, stable | `anon`, `authenticated` | `src/lib/million.ts` |
| `public_projects()`, `public_parcels()`, `public_coverage()`, `public_parcel_offer(uuid,uuid,uuid)`, `public_project_page(text)`, `public_project_quote(...)`, `public_tree_quote(...)` | definer, stable | `anon`, `authenticated` | `src/lib/public-projects.ts`, `src/lib/tree-pricing.ts` |
| `staff_parcel_offer(...)`, `staff_project_quote(...)`, `staff_project_parcel_prices(uuid)`, `staff_tree_quote(...)` | definer, stable, `app.is_staff()` or `app.can_price()` | `authenticated` | `/admin/projects/[id]/parcels/[parcelId]`, `src/lib/parcel-prices.ts`, `/admin/pricing` |
| `staff_save_spacing_class`, `staff_delete_spacing_class`, `staff_save_pricing_rule`, `staff_delete_pricing_rule`, `staff_save_cost_item`, `staff_delete_cost_item`, `staff_save_financing_markups`, `staff_save_project_down_percents`, `staff_save_project_spacing_classes` | definer, `app.can_price()` + `app.set_reason()` | `authenticated` | `src/app/admin/(panel)/pricing/actions.ts`, `src/app/admin/(panel)/projects/actions.ts` |
| `crm_search_requests(p jsonb, limit, offset)` | **invoker**, stable | `authenticated` | `/admin/leads`, `/admin/leads/export`, `src/app/admin/(panel)/leads/actions.ts` |
| `crm_demand_stats(from, to, people)` | **invoker**, stable | `authenticated` | `/admin/analytics`, `/admin` |
| `demand_indicator(smallint)` | definer, role check `agri_manager|legal|finance|admin|super_admin` | `authenticated` | `/admin/land-offers/[id]` |
| `match_requests_for_parcel(uuid, limit)` | definer, `app.is_staff()`; a `commercial` only scores their own files | `authenticated` | `/admin/projects/[id]/parcels/[parcelId]` |
| `compute_installment_plan(bigint,bigint,bigint,jsonb)` | immutable | `authenticated`, `service_role` (0020 revoked `public, anon`) | Only from SQL (`match_requests_for_parcel`, `app.parcel_offer_payload`) |
| `admin_set_role`, `admin_set_user_active`, `admin_assign_persons` | definer, `app.is_admin()` | `authenticated` | `/admin/users`, `/admin/leads` |
| `review_land_offer(...)` | definer, per-stage role checks | `authenticated` | `/admin/land-offers/[id]/actions.ts` |
| `log_action(action, entity, entity_id, data, reason)` | definer, `app.is_staff()` | `authenticated` | Exports, document opens, password changes |

`crm_search_requests` and `crm_demand_stats` are **security invoker** on purpose: a `commercial` only ever counts what
RLS lets them read.

`crm_demand_stats(p_from, p_to, p_people)` returns one jsonb object with `people_mode`, `requests`, `persons`,
`duplicates`, `trees_total`, `today`, `anywhere`, `anywhere_trees`, `unsure_type`, `visit_yes`, `bank_financing_yes`,
and the breakdowns `by_tree_count`, `by_duration`, `by_spacing_class`, `by_payment_mode`, `by_down_payment_percent`,
`by_total_price_band`, `by_invest_governorate`, `by_governorate_trees`, `by_project_type`, `by_scenario`,
`by_desired_area`, `by_priority`, `by_plantation_system`, `by_down_payment`, `by_installment`, `by_goal`, `by_source`,
`daily`. Dates are bucketed in `Africa/Tunis`.

`million_progress()` (rewritten in 0025) returns `goal`, `trees_requested` (sum of `tree_count_min` over
non-duplicate requests), `participants` (distinct persons), `requests`, `projects_under_study`
(projects in `draft|preparing|internal`), `trees_reserved`, `trees_contracted` (`contracting|sold|owned`) and
`trees_planted` (any non-withdrawn parcel of an `operating` project). It returns **null** unless
`app.module_open('public_statistics')` — with one escape hatch: `coalesce(current_setting('request.jwt.claims', true), '') = ''`,
so a direct psql session (migrations, tests, scripts) always reads.

### The three intake RPCs

`public.submit_interest_request(p jsonb)` has been redefined **seven times** (0003, 0009, 0011, 0016, 0019, 0030, 0032);
the live definition is the one in `0032_intake_pricing.sql`. In its final form it: validates name length (3..120), phone
via `app.assert_phone`, WhatsApp shape, e-mail shape (≤200 and `^[^@\s]+@[^@\s]+\.[^@\s]+$`), a non-empty
`consent_text`, an active residence governorate (delegation optional but checked when given); resolves ownership
scenarios into `project_type_ids` / `plantation_systems` / `production_statuses` (or falls back to raw
`project_type_ids`); snapshots each chosen option through `app.active_option`; accepts a typed tree count
(`tree_count_custom`, bounded by settings `million.custom_trees_min` / `million.custom_trees_max`, stored with
`tree_count_code = 'custom'`); recomputes the price with `app.tree_price` and `app.financed_quote` and snapshots
every figure; throttles on `interest:ip` (`antispam.max_requests_per_ip_per_hour`) and on the phone
(`antispam.max_requests_per_phone_per_day`); upserts the person on `phone_e164` **without overwriting existing
data** (only `last_request_at` and `consent_at` are refreshed); optionally auto-assigns round-robin when setting
`crm.auto_assign_mode = 'round_robin'`; allocates `request_no`; inserts the request; and enqueues the
`lead.confirmation` message. Errors are raised with `errcode = 'P0001'` and stable machine codes
(`invalid_full_name`, `invalid_phone`, `phone_not_tunisian`, `invalid_whatsapp`, `invalid_email`, `consent_required`,
`invalid_governorate`, `invalid_delegation`, `invest_location_required`, `invalid_invest_governorate`,
`scenario_required`, `invalid_scenario`, `single_scenario_only`, `invalid_goal`, `invalid_tree_choice`,
`invalid_tree_custom`, `rate_limited`, …), which `src/lib/errors.ts` turns into Arabic sentences.

`public.submit_offer_request(p jsonb)` (0049) is the second intake: it takes `project_id` and `trees`, prices them with
the offer's own rules, writes `request_kind = 'offer'` plus `project_id/code/name`, `offer_trees` and the four
`offer_*` money columns, and reuses the same person-upsert and throttling logic.

`public.submit_land_offer(p jsonb)` validates the landowner form, snapshots the property-type and tree-age options,
builds `available_documents` from the `land_document` list, throttles on `land_offer:ip`
(`antispam.max_land_offers_per_ip_per_day`), allocates `reference_no` and enqueues `land_offer.confirmation`.

## 19.12 RLS summary

Every table listed above has `enable row level security`. The pattern is identical throughout: revoke the default
grants from `anon`/`authenticated`, grant back only what is needed, and add a narrow policy.

| Table | anon | authenticated select | write |
|---|---|---|---|
| `settings` | select where `is_public` | `is_public or is_staff()` | update: `is_admin()` |
| `feature_flags` | select all | select all | update: `is_admin()` |
| `governorates`, `delegations`, `project_types`, `option_lists`, `option_items`, `ownership_scenarios`, `site_media` | select all | select all | insert/update: `is_admin()` (no delete) |
| `lead_statuses` | **none** | `is_staff()` | insert/update: `is_admin()` |
| `tree_spacing_classes` | select where `is_active` | active, or all for `finance|admin|super_admin` | RPC only |
| `profiles` | none | own row or `is_staff()` | update own `full_name, locale` |
| `user_roles` | none | own rows or `is_admin()` | RPC only |
| `audit_logs` | none | `is_admin()` | none (append-only; service role inserts) |
| `persons` | none | all for `admin|super_admin|finance|legal`; own for `commercial` | column-limited update for `is_admin()` or the assignee |
| `interest_requests`, `person_status_history`, `contact_attempts`, `person_notes`, `person_assignments` | none | `app.can_see_person(person_id)` | `contact_attempts` / `person_notes` insert needs `app.can_edit_person`; the rest RPC/trigger only |
| `crm_requests` (view) | revoked | inherits base-table RLS (`security_invoker`) | — |
| `land_offers`, `land_offer_files`, `land_offer_reviews` | none | `agri_manager|legal|finance|admin|super_admin` | RPC only |
| `message_templates`, `notification_outbox` | none | `is_admin()` | `message_templates` update: `is_admin()` |
| `projects`, `parcels` | none | `is_staff()` | insert/update: `finance|admin|super_admin` |
| `project_costs` | none | `finance|admin|super_admin` | insert/update: same |
| `project_media` | none | `is_staff()` | insert/update/delete: `finance|admin|super_admin` |
| `tree_pricing_rules`, `tree_cost_items`, `financing_markups`, `project_spacing_classes`, `project_down_payment_percents` | none | `finance|admin|super_admin` | RPC only |

Note in 0031: *"Policies run with the caller's rights and `app.can_price()` is not executable by API roles, so the role
list is inlined"* — which is why those five policies spell out `array['finance','admin','super_admin']` instead of
calling `app.can_price()`.

## 19.13 Relationship diagram (what actually exists)

```
auth.users ──1:1── profiles ──1:N── user_roles (role: app_role)
                     │
                     ├── granted_by / updated_by / created_by  (many tables)
                     └── persons.assigned_to, persons.profile_id (unique, never written)

governorates ──1:N── delegations
      │                   │
      │                   └──────────────┐
      ├── persons.governorate_id         ├── persons.delegation_id
      ├── interest_requests.residence_governorate_id (NOT NULL)
      │                                  └── interest_requests.residence_delegation_id (nullable since 0009)
      ├── land_offers.governorate_id / delegation_id
      └── projects.governorate_id / delegation_id

option_lists ──1:N── option_items
                         ▲  ▲  ▲
                         │  │  └── land_offers.property_type_option_id, tree_age_option_id
                         │  └───── project_down_payment_percents.option_item_id
                         └──────── interest_requests.{goal, down_payment, installment, contact_time,
                                    desired_area, priority, tree_count, duration, budget,
                                    down_payment_percent}_option_id

project_types ──┬── ownership_scenarios.project_type_id
                └── projects.project_type_id

lead_statuses ──┬── persons.status_id
                └── person_status_history.{from_status_id, to_status_id}

persons ──1:N── interest_requests
   ├──1:N── contact_attempts
   ├──1:N── person_notes
   ├──1:N── person_status_history
   └──1:N── person_assignments (from_user / to_user → profiles)

land_offers ──1:N── land_offer_files      (storage_path → bucket land-offer-files)
      │       └─1:N── land_offer_reviews
      └── projects.land_offer_id  (a studied plot becomes a project)

projects ──1:N── parcels
   ├──1:N── project_costs            (finance/admin only)
   ├──1:N── project_media            (storage_path → bucket project-media)
   ├──1:N── project_spacing_classes ──N:1── tree_spacing_classes
   ├──1:N── project_down_payment_percents ──N:1── option_items('down_payment_percent')
   ├──0:1── tree_pricing_rules   (project_id unique; the row with project_id IS NULL is the global rule)
   ├──1:N── tree_cost_items      (project_id NULL = global line)
   └──1:N── financing_markups    (project_id NULL = global markup; unique nulls not distinct (project_id, months))

parcels.spacing_class_id ──N:1── tree_spacing_classes
interest_requests.spacing_class_id ──N:1── tree_spacing_classes
interest_requests.parcel_id ──N:1── parcels   (on delete set null)
interest_requests.project_id ──N:1── projects (on delete set null)

message_templates ──1:N── notification_outbox   (no consumer in src/)

crm_requests  =  VIEW( interest_requests ⋈ persons ⋈ lead_statuses ⟕ profiles )

audit_logs    ←  every *_audit trigger + app.write_audit + log_action + the service-role auth events
                 (actor_id is a plain uuid, NOT a foreign key)
```

## 19.14 OBSERVATIONS — §19

1. **`crm_requests` and `crm_search_requests` are behind `interest_requests`.** The view is `select r.*` but was last
   created in `0032_intake_pricing.sql`; a view freezes its column list, so the six columns added by
   `0049_offer_intake.sql` (`request_kind`, `offer_trees`, `offer_price_per_tree_millimes`,
   `offer_total_price_millimes`, `offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes`) are not
   exposed by the view or by the search function. `src/app/admin/(panel)/leads/offer-snapshot.ts` works around this by
   re-reading `public.interest_requests` directly for the rows the list already shows, and
   `searchReturnsKind()` probes for the column's presence. A drafted, **unapplied** migration
   `supabase/pending/bb_crm_offer_columns.sql` rebuilds both.
2. **`public.compute_installment_plan` and `app.parcel_pricing` are a second, older pricing engine.** They read
   `parcels.pricing` → `projects.pricing` → setting `pricing.default` with models `markup_brackets`,
   `monthly_rate` and `scenarios`. The tree engine (`app.tree_price` + `app.financed_quote`) is unrelated code with its
   own parameters. Both are live: `app.parcel_offer_payload` and `match_requests_for_parcel` call the old one, every
   `/start`, offer and project quote calls the new one. Which applies to a parcel depends on whether its project has
   rows in `project_spacing_classes`.
3. **`parcels.cash_price_millimes` is `not null` with `check (>= 0)` and is used as a sentinel.** A tree-priced parcel
   stores `0`, and `app.parcel_price` reads `nullif(v_pa.cash_price_millimes, 0)` with the comment *"A parcel saved
   under tree pricing stores 0, which is never a price."* The public listings equally treat `cash_price_millimes > 0`
   as "priced".
4. **`parcels.area_m2` is authored data for legacy projects and derived data for tree-priced ones.** The comment on
   `parcels.olive_tree_count` still says the count is "Never computed from area_m2 (PARC-02)"; since 0035 the reverse
   derivation *does* happen — `app.parcel_tree_unit_sync()` sets `area_m2 = olive_tree_count × class.area_m2`, and
   `app.spacing_area_fanout()` rewrites it across parcels when a class's spacing is edited.
5. **`persons.profile_id`** exists with a unique FK to `profiles` and is never written by any SQL or TypeScript read
   here — the client-account link is declared but unused.
6. **`notification_outbox` has no consumer.** `app.enqueue_message` inserts rows; nothing in `src/` selects, updates or
   sends them. `status` never leaves `'pending'` from this codebase.
7. **`audit_logs.actor_id` has no foreign key** (deliberate — the audit row must survive the actor), so
   `/admin/audit` resolves names with a separate `profiles` read and a client-side `Map`.
8. **Two audit paths bypass RLS by design.** `authenticated` has no insert grant on `audit_logs`, so
   `src/lib/auth-events.ts` and `src/app/admin/setup/actions.ts` insert with the service-role client. Everything else
   uses `public.log_action` or a row trigger.
9. **The `settings` table carries ~295 rows of copy** (195 in group `site`, 58 in `projects`). Several are documented in
   migration headers as dead: `0041_payment_hint.sql` says `start.capacity_hint` "renders nowhere" and marks the pair
   dead but keeps the keys because `supabase/tests/005_start_custom_trees.sql` asserts they exist;
   `0044_goal_line.sql` empties `million.goal`-related copy rather than deleting keys, because test 011 asserts they
   exist.
10. **`lead_statuses` is the only reference table `anon` cannot read.** Everything else in that family
    (`governorates`, `delegations`, `project_types`, `option_lists`, `option_items`, `ownership_scenarios`,
    `site_media`, `feature_flags`) is world-readable.
11. **No delete path exists for `projects`, `parcels` or `project_costs`.** 0012 revoked delete and 0020 re-granted only
    insert and update. `project_media` is the only project-side table with a delete grant and policy.
12. **`app.check_throttle` is not called for `submit_offer_request` on a phone basis** — the offer intake throttles the
    same way the interest intake does via `ip_hash`; see `0049_offer_intake.sql` for the exact set of checks it runs.
13. **Migration numbering is not chronological.** File mtimes show 0025, 0028, 0029 (dated 2026-09-12) sitting between
    0024 and 0026 (dated 2026-09-15). Several headers say "Number claimed at apply time" / "Kept outside
    supabase/migrations until the owner approves" — consistent with the two-session split described in the repo memory.

---

# 20. SUPABASE

## 20.1 The four clients

All four live in `src/lib/supabase/`. Three carry `import "server-only"`.

| File | Factory | Key used | Session | Where it is used |
|---|---|---|---|---|
| `src/lib/supabase/public.ts` | `createPublicClient()` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | none (`persistSession: false, autoRefreshToken: false`) | `src/lib/config.ts` (public config), `src/lib/million.ts`, `src/lib/public-projects.ts` in `anon` mode. Deliberately visitor-independent so it is safe inside `unstable_cache` |
| `src/lib/supabase/server.ts` | `createClient()` | anon key + the request's cookies via `@supabase/ssr`'s `createServerClient` | The signed-in user; **RLS applies** | Every Back Office page and action; `src/lib/public-projects.ts` in `preview` mode; `src/lib/parcel-prices.ts`; the land-offer file route |
| `src/lib/supabase/admin.ts` | `createAdminClient(extraHeaders)` | `SUPABASE_SERVICE_ROLE_KEY` (throws a named error if missing) | none; **bypasses RLS** | Public intake actions (`register`, `land`, `projects/[code]/offer-actions`), `src/lib/auth-events.ts`, `/admin/users` (Auth Admin API + `listUsers`), `/admin/setup`, land-offer signed upload URLs and file listing |
| `src/lib/supabase/storage-upload.ts` | `getStorageUploadClient()` | anon key, memoised singleton | none | **Browser** client in `src/app/(public)/land/land-offer-form.tsx`, used only with `uploadToSignedUrl(path, token, file)`. Comment: *"Holds no session and cannot read private data."* |
| `src/lib/supabase/proxy.ts` | `updateSession(request)` | anon key + request/response cookies | refreshes the session cookie | Called by `src/proxy.ts` (the Next.js proxy/middleware) |

`src/lib/supabase/server.ts` forwards audit headers on every request:
`global: { headers: auditHeaders(requestHeaders) }`, where `auditHeaders` (in `src/lib/request-context.ts`) produces
`x-client-ip` (first hop of `x-forwarded-for`, else `x-real-ip`, capped at 64 chars) and `x-client-ua`
(printable ASCII only, capped at 300). Those are what `app.request_header()` reads inside `app.write_audit`. The file
states explicitly: *"Informational only, never used for access control."* The public intake actions pass the same
headers into `createAdminClient(auditHeaders(requestHeaders))`.

Environment variables (`src/lib/env.ts` + `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(both required at module load, with a named error), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `DATABASE_URL`, `DIRECT_URL`,
`SUPABASE_DB_CA_CERT`, `IP_HASH_SALT`, `ADMIN_SETUP_TOKEN`.

## 20.2 Auth

Supabase Auth with **e-mail + password only**. `auth.users` is the identity store; the trigger `on_auth_user_created`
mirrors each new user into `public.profiles`. No OAuth provider, magic link, OTP or MFA appears anywhere in the code.
Sessions are read with `supabase.auth.getClaims()` (not `getUser()`) in `src/lib/auth.ts`, `src/lib/supabase/proxy.ts`
and `src/app/admin/login/actions.ts`.

Account administration goes through the Auth Admin API with the service-role client:
`auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`,
`auth.admin.updateUserById(id, { password })`, `auth.admin.updateUserById(id, { ban_duration: '876000h' | 'none' })`
and `auth.admin.listUsers({ page: 1, perPage: 1000 })`.

## 20.3 Storage buckets

Three buckets, each inserted by a migration with `on conflict (id) do nothing`.

| Bucket | Public | Size limit | Allowed MIME | Holds | Created in |
|---|---|---|---|---|---|
| `land-offer-files` | **false** | 20 971 520 (20 MB) | `application/pdf`, `image/jpeg`, `image/png` | Landowner documents (title deeds, photos). Object path `<offer_id>/<uuid>.<ext>` | 0003 |
| `site-media` | **true** | 5 242 880 (5 MB) | `image/jpeg`, `image/png`, `image/webp`, `image/avif` | The public site's own photographs, one per `site_media.slot`. Path `<folder>/<Date.now()>.<ext>` | 0015 |
| `project-media` | **true** | 5 242 880 (5 MB) | same four image types | Project gallery pictures (`project_media`) | 0023 |

Policies on `storage.objects`:

- `land_offer_files_read` — select, `authenticated`, `bucket_id = 'land-offer-files'` and
  `agri_manager|legal|finance|admin|super_admin`. **There is no insert policy for this bucket**: uploads happen with
  one-time signed upload tokens minted by the service-role client (`createSignedUploadUrl`) and redeemed in the browser
  with `uploadToSignedUrl`.
- `site_media_objects_write` / `_update` / `_delete` — `bucket_id = 'site-media'` and `app.is_admin()`.
- `project_media_objects_select` / `_insert` / `_update` / `_delete` — `bucket_id = 'project-media'` and
  `finance|admin|super_admin`.

Application-side limits mirror the bucket limits: `src/lib/site-media-upload.ts` hard-codes 5 MB and the four image
types *"Mirrors the bucket's own file_size_limit and allowed_mime_types (0015_site_media.sql)"*; the land form reads
`land_offer.max_file_size_mb` (clamped to ≤ 20) and `land_offer.max_files` from `settings`.

Reading a private document: `src/app/admin/(panel)/land-offers/[id]/files/[fileId]/route.ts` checks
`LAND_OFFER_ROLES`, reads the row **through the user's client** (so RLS applies), calls
`storage.from('land-offer-files').createSignedUrl(path, 300)` (5 minutes), logs `document.open` via `log_action`, and
returns a 302 to the signed URL.

Public buckets are served by their public URL: `bucket.getPublicUrl(path).data.publicUrl`, and only the resulting
`https://…` string is stored (`site_media.url`, `project_media.url`, both with a `~ '^https://[^ ]+$'` check).

## 20.4 How migrations are applied

`scripts/db-migrate.mjs` (`npm run db:migrate` → `node --env-file=.env scripts/db-migrate.mjs`):

- Connects with `pg.Client` to **`DIRECT_URL`** (the session pooler on port 5432). TLS uses
  `SUPABASE_DB_CA_CERT` when set; otherwise it connects with `rejectUnauthorized: false` and prints
  *"SUPABASE_DB_CA_CERT not set: connecting over TLS without certificate verification."*
- Creates `app.schema_migrations (version text primary key, applied_at timestamptz default now())` if absent.
- Reads `supabase/migrations/*.sql`, sorts by filename, skips already-recorded versions.
- Applies each pending file inside its own `begin … commit`, recording the filename; on error it rolls back, prints the
  message with the character position and `error.where`, sets `exitCode = 1` and **breaks** (later files are not tried).

`scripts/db-test.mjs` (`npm run db:test [substring]`) runs each `supabase/tests/*.sql` inside a transaction that is
**always rolled back**, printing `PASS`/`FAIL` and a final `n/m test files passed`. A test "fails" when its SQL raises —
the files are written as `do $$ … assert … $$;` blocks.

`scripts/db-dry-run.mjs` runs an arbitrary list of SQL files (typically `supabase/pending/x.sql` plus its test) inside
ONE transaction that is always rolled back, with `set local lock_timeout = '3s'` and `set local statement_timeout = '60s'`.
It is not wired to an npm script.

`scripts/db-types.mjs` (`npm run db:types`) does **not** read the local files: it calls the Supabase Management API
`GET https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/types/typescript?included_schemas=public` with
`SUPABASE_ACCESS_TOKEN` and writes the answer to `src/lib/supabase/database.types.ts`. So the generated types describe
the **live** database, not the migration folder.

Other scripts: `scripts/create-super-admin.mjs` (`npm run admin:create`) refuses to run if a `super_admin` already
exists, creates the account with the Auth Admin API and inserts the role row directly;
`scripts/reset-admin-password.mjs` (`npm run admin:password`); `scripts/seed-demo-projects.mjs` (`npm run demo:projects`).
`scripts/make-favicon.mjs` is untracked and unrelated to the database.

## 20.5 Caching in front of Supabase

| Cache | Where | Key / tag | TTL |
|---|---|---|---|
| Public configuration (settings, flags, governorates, delegations, project types, scenarios, option items, site media) | `src/lib/config.ts`, `unstable_cache` | key `["public-config-v6"]`, tag `PUBLIC_CONFIG_TAG = "public-config"` | `revalidate: 300` |
| Public project RPC results | `src/lib/public-projects.ts`, `cachedAnonRpc` | key `["public-projects-v1"]`, tag `PUBLIC_PROJECTS_TAG = "public-projects"` | `revalidate: 60` |
| Counter | `src/lib/million.ts` | key `["million-progress-v2"]` | `revalidate: 60` |

`loadPublicConfig` wraps its eight parallel reads in `withRetry(…, 3)` with an 800 ms × attempt backoff, because
*"The home page is prerendered at build time, so a momentary Supabase hiccup would fail the whole deploy."*
`src/lib/public-projects.ts` only caches the **anon** path; in `preview` mode (staff viewing an `internal` module) it
calls with the user's own session and never caches — *"so a staff-only row can never land in the shared cache."*

## 20.6 OBSERVATIONS — §20

1. **The generated types come from the live project, not from `supabase/migrations/`.** `npm run db:types` hits the
   Management API. Any drift between the folder and the deployed database is therefore invisible in the type file —
   and, conversely, the type file is evidence about production. It currently shows `PostgrestVersion: "14.5"`, the
   `owned` value in `parcel_status`, and the 0049 columns on `interest_requests` but **not** on `crm_requests`,
   which matches the migration folder exactly for these points.
2. **`db-migrate.mjs` runs each migration in its own transaction and stops at the first failure**, leaving earlier
   files applied. It has no down-migration, no checksum of applied files, and no dry-run flag of its own.
3. **TLS verification is opt-in.** Without `SUPABASE_DB_CA_CERT`, all three pg-based scripts connect with
   `rejectUnauthorized: false`.
4. **The `land-offer-files` bucket has a read policy and no write policy.** Uploads work only because the server mints
   signed upload tokens with the service-role key; a signed-in staff member cannot upload to that bucket directly.
5. **`project-media` is a public bucket that also carries a restrictive `select` policy.** For a public bucket the
   object is served by URL regardless, so the select policy governs only the authenticated Storage API path.
6. **Uploaded site pictures are never deleted.** `uploadSiteImage` writes a fresh `Date.now()` filename on every
   replacement *"so a replaced picture is never served from a cache"*, and only `project_media` has a removal path
   (`storage.from(PROJECT_MEDIA_BUCKET).remove([path])` in `projects/actions.ts`).
7. **The service-role key reaches five call sites** (`register/actions.ts`, `land/actions.ts`,
   `projects/[code]/offer-actions.ts`, `users/actions.ts`, `setup/actions.ts`) plus `auth-events.ts`. All are
   `"use server"` or `import "server-only"`; `admin.ts` itself is `server-only`.
8. **`README.md` says "Supabase: PostgreSQL 17"** (line 13). Nothing in the repository confirms or contradicts the
   server version — the value in `database.types.ts` is the *PostgREST* version. The actual Postgres version is
   **Could not determine from current codebase.**
9. `README.md` also lists *"Two-factor authentication for Finance, Legal and Admin roles (PERM-04)"* — it appears in a
   section of things not yet built, and indeed no MFA code exists.

---

# 21. AUTHENTICATION & PERMISSIONS

## 21.1 The login page

`src/app/admin/login/page.tsx` — a Server Component. It calls `getStaffSession()` first and `redirect("/admin")` when
one exists, so a signed-in staff member never sees the form. `metadata` sets `robots: { index: false, follow: false }`.
Copy: «دخول فريق AgriZed» and «الـBack Office مخصص لموظفي AgriZed فقط.». It renders `<LoginForm next={…} />`
(`src/app/admin/login/login-form.tsx`, a Client Component) with the `next` search param.

`src/app/admin/login/actions.ts` holds both `signIn` and `signOut`:

- `credentialsSchema` = `z.object({ email: z.email().max(200), password: z.string().min(1).max(200) })`; the e-mail is
  trimmed and lower-cased before parsing.
- `supabase.auth.signInWithPassword(...)`. On failure: `logAuthEvent("auth.login_failed", …)` and the generic Arabic
  message «البريد الإلكتروني أو كلمة السر غير صحيحة.» — the same message whether the address exists or not.
- On success it re-reads `profiles.is_active` and `user_roles.role` and computes
  `isStaff = Boolean(profile?.is_active) && roles.some(row => row.role !== "client")`. If false it calls
  `supabase.auth.signOut()`, logs `auth.login_denied`, and answers
  «هذا الحساب لا يملك صلاحية الدخول إلى الـBack Office، أو تم إيقافه.».
- On success it logs `auth.login` and redirects to `safeNext(formData.get("next"))`, which only accepts a value that
  `startsWith("/admin")`, does not start with `//`, and is not `/admin/login` — otherwise `/admin`. (Open-redirect
  guard, commented as such.)
- `signOut()` reads the claims, signs out, logs `auth.logout`, and redirects to `/admin/login`.

## 21.2 Session handling

`src/lib/auth.ts` is the single source of session truth. `getStaffSession()` is wrapped in React `cache()`
("Deduplicated per request") and:

1. `createClient()` (cookie-bound), `supabase.auth.getClaims()`; returns `null` without `claims.sub`.
2. Reads `profiles.full_name, is_active` and `user_roles.role` in parallel.
3. Returns `null` if `!profile?.is_active`.
4. Filters out `client` and returns `null` if no staff role remains.
5. Returns `{ id, fullName, email, roles: StaffRole[] }`.

So **three conditions** must all hold for a session to exist: a valid JWT, `profiles.is_active = true`, and at least one
non-`client` role.

`requireStaff(roles?)` — *"Use at the top of every Back Office page and Server Action."* No session →
`redirect("/admin/login")`. Session without a listed role → `redirect("/admin?denied=1")`.
`hasRole(session, roles)` is the non-redirecting predicate.

Cookies: `src/lib/supabase/server.ts` writes cookies through `next/headers` `cookies()` inside a `try/catch`, with the
comment *"Server Components cannot write cookies. src/proxy.ts refreshes the session instead."*

## 21.3 The proxy (middleware)

`src/proxy.ts`:

```
export const config = { matcher: ["/admin/:path*"] };
```

`proxy(request)` calls `updateSession(request)` (which refreshes the auth cookies and returns `userId`), then:
if `!userId` and the path is neither `/admin/login` nor `/admin/setup`, it redirects to `/admin/login` with
`?next=<pathname>` and a cleared query string. The comment is explicit: *"Optimistic redirect only. Every Back Office
page and action checks roles on the server."* and *"Only signed-in areas go through Supabase, so public pages stay
fast for visitors."*

The proxy checks **existence of a user id only** — never `is_active`, never roles. Those are re-checked by
`requireStaff()` in `src/app/admin/(panel)/layout.tsx` and in every page and action.

## 21.4 Protected routes

Everything under `/admin` is proxy-gated. Inside, `src/app/admin/(panel)/layout.tsx` calls `requireStaff()` (no role
list) so the panel itself needs only *some* staff role, and each page adds its own gate.

| Route | Gate |
|---|---|
| `/admin` (dashboard) | `requireStaff()`; the tiles then branch on `CRM_READ_ROLES`, `LAND_OFFER_ROLES`, `ADMIN_ROLES`, `["commercial","admin","super_admin"]` |
| `/admin/account` | `requireStaff()` |
| `/admin/leads` | `requireStaff(CRM_READ_ROLES)` |
| `/admin/leads/[personId]` | `requireStaff(CRM_READ_ROLES)`; `canEdit = isAdmin || (commercial && person.assigned_to === session.id)` |
| `/admin/leads/[personId]/actions.ts` | `requireStaff(EDIT_ROLES)` where `EDIT_ROLES = ["commercial","admin","super_admin"]`; the reassign action uses `requireStaff(ADMIN_ROLES)` |
| `/admin/leads/actions.ts` (bulk assign) | `requireStaff(ADMIN_ROLES)` |
| `/admin/leads/export` (route handler) | `getStaffSession()` + `hasRole(session, ADMIN_ROLES)` → 403; then `log_action('crm.export')` |
| `/admin/analytics` | `requireStaff(CRM_READ_ROLES)`; `ownFilesOnly` when the session is `commercial` and none of `admin|super_admin|finance|legal` |
| `/admin/land-offers`, `/admin/land-offers/[id]`, its actions and the file route | `LAND_OFFER_ROLES`; the review form additionally shows `legal_review` only to `legal`, and `technical_review`/`field_visit` only to `agri_manager` (admins see all) |
| `/admin/projects`, `/admin/projects/[id]`, `/admin/projects/parcels`, `/admin/projects/[id]/parcels/[parcelId]` | `requireStaff()` to read; `WRITE_ROLES = ["finance","admin","super_admin"]` to write; `FINANCE_ROLES` (same three) to see costs |
| `/admin/projects/actions.ts` | `requireStaff(WRITE_ROLES)` throughout, except the spacing-class save which uses `requireStaff(PRICE_ROLES)` |
| `/admin/pricing` and all nine of its actions | `requireStaff(PRICE_ROLES)` |
| `/admin/settings`, `/settings/lists`, `/settings/media`, `/settings/modules`, `/admin/users`, `/admin/audit` | `requireStaff(ADMIN_ROLES)` |
| `/admin/login`, `/admin/setup` | Excluded from the proxy redirect |

`/admin/setup` is a development-only escape hatch: `setupAllowed(token)` returns false when
`NODE_ENV === "production"`, when `ADMIN_SETUP_TOKEN` is absent, when the `host` header is not
`localhost|127.0.0.1|[::1]` (optionally with a port), or when the token fails a `timingSafeEqual` comparison. It can
only set the password of an account that **already** holds `super_admin`, and it writes an `auth.password_reset` audit
row.

## 21.5 The role list

Seven values in `public.app_role`. `src/lib/auth.ts` defines `StaffRole = Exclude<AppRole, "client">` and
`ROLE_LABELS`:

| Role | `ROLE_LABELS` (verbatim) | In the database | In the app |
|---|---|---|---|
| `client` | `حريف` | In the enum | **Never granted anywhere.** `STAFF_ROLES` in `/admin/users/actions.ts` excludes it, `getStaffSession` filters it out, and `signIn` refuses a session that has only it. There is no client-facing authenticated area |
| `commercial` | `Commercial` | `app.can_see_person` / `can_edit_person` — own files only; round-robin auto-assignment target | CRM read + edit of own files |
| `agri_manager` | `مسؤول فلاحي` | Land offers: read + `review_land_offer` stages `technical_review`, `field_visit`; `demand_indicator` | Land offers only |
| `finance` | `Finance` | Sees every person (read-only), all land offers, `project_costs`, all pricing tables, writes `projects`/`parcels`/`project_costs` | CRM read, offers, pricing |
| `legal` | `Legal` | Sees every person (read-only), all land offers, `review_land_offer` stage `legal_review` | CRM read, land offers |
| `admin` | `Admin` | `app.is_admin()` — settings, flags, reference lists, audit log, message templates, outbox, user roles, person transfers, every land-offer stage | Full Back Office |
| `super_admin` | `Super Admin` | Everything `admin` can do, plus: only a `super_admin` may grant or revoke `super_admin`, change a `super_admin` account's active state, or reset a `super_admin`'s password. The last `super_admin` cannot be removed | Full Back Office |

Role bundles in `src/lib/auth.ts`:

```
ADMIN_ROLES       = ["admin", "super_admin"]
CRM_READ_ROLES    = ["commercial", "finance", "legal", "admin", "super_admin"]
PRICE_ROLES       = ["finance", "admin", "super_admin"]          // report v3 §53, V2-D9
LAND_OFFER_ROLES  = ["agri_manager", "legal", "finance", "admin", "super_admin"]
```

Locally redeclared bundles, identical in value to `PRICE_ROLES`:
`WRITE_ROLES` in `projects/actions.ts`, `projects/page.tsx`, `projects/[id]/page.tsx`,
`projects/[id]/parcels/[parcelId]/page.tsx`, and `FINANCE_ROLES` in `projects/[id]/page.tsx` — all
`["finance","admin","super_admin"]`. `EDIT_ROLES` in `leads/[personId]/actions.ts` is
`["commercial","admin","super_admin"]`.

### Roles that share the same rights

- **`admin` and `super_admin` are identical everywhere except four places**: granting/revoking the `super_admin` role
  (`public.admin_set_role`), changing a `super_admin` account's active flag (`public.admin_set_user_active`), resetting
  a `super_admin`'s password (`resetUserPassword` in `/admin/users/actions.ts`), and the "cannot remove the last super
  admin" rule. `app.is_admin()` treats them as one.
- **`finance` and `admin`/`super_admin` share the whole pricing and offers surface**: `app.can_price()` is
  `finance|admin|super_admin`, and every RLS policy on `project_costs`, `tree_pricing_rules`, `tree_cost_items`,
  `financing_markups`, `project_spacing_classes`, `project_down_payment_percents`, `projects`, `parcels` and
  `project_media` names exactly those three.
- **`finance` and `legal` have identical CRM rights**: `app.can_see_person` lists
  `admin|super_admin|finance|legal` together, and `app.can_edit_person` (0008) excludes both — they read every file and
  can write neither a note nor a contact attempt. Test 002 asserts `'finance cannot edit files'`.
- **`agri_manager` and `legal` differ only in which `review_land_offer` stage they may record**
  (`technical_review`/`field_visit` vs `legal_review`); both read the same land-offer tables. `agri_manager` is the only
  staff role with **no** CRM access (`CRM_READ_ROLES` omits it) and no `/admin/projects` access beyond
  `requireStaff()`'s read.
- `demand_indicator()` uses the land-offer role list (`agri_manager|legal|finance|admin|super_admin`), not the CRM one —
  so an `agri_manager` who cannot open `/admin/leads` can still see aggregate demand next to a land offer.

## 21.6 Defence in depth, as implemented

The stated rule in `CLAUDE.md` — "Enforce access in the database (RLS, security-definer RPCs with role checks), then
check roles again in each Server Action with `requireStaff()`" — matches the code:

1. **Proxy**: redirects an anonymous visitor away from `/admin/*` (existence check only).
2. **Layout**: `requireStaff()` in `src/app/admin/(panel)/layout.tsx`.
3. **Page / action**: `requireStaff(ROLE_BUNDLE)` or `getStaffSession()` + `hasRole()`.
4. **PostgREST grants**: per-function `revoke … from public, anon` then `grant … to authenticated` / `service_role`.
5. **RLS**: the policies in §19.12.
6. **RPC body**: `if not app.is_admin()/is_staff()/can_price() then raise exception 'forbidden' using errcode = '42501'`.
7. **Reason + audit**: sensitive writes call `app.set_reason(p_reason)` (which raises `reason_required`) before the DML,
   then `app.write_audit('<entity>.<event>', …)`.

The Back Office navigation (`src/app/admin/(panel)/layout.tsx` → `navFor()`) applies the *same* role bundles to decide
which sidebar rows exist, and separately reads each module's `feature_flags` state to draw a «معطّل» or «داخلي» badge.
Its comment states the distinction: *"A row that is off still opens. The flag says what visitors see; it is not an
access rule for the staff."*

Password rules as implemented: `/admin/account` requires ≥ 10 characters, re-verifies the current password with
`signInWithPassword` before `auth.updateUser({ password })`, and logs `auth.password_changed`;
`/admin/setup` requires ≥ 8; `scripts/create-super-admin.mjs` refuses < 6 and warns below 10.
Temporary passwords generated for new staff are `randomBytes(12).toString("base64url")` and are returned **in the
Arabic success message on screen** for the admin to hand over.

## 21.7 OBSERVATIONS — §21

1. **The `client` role is declared and entirely unused.** It exists in `app_role`, is labelled «حريف», is filtered out
   of every session, and is excluded from the role checkboxes. There is no authenticated client area (`zitounti` is a
   `disabled` flag with no tables).
2. **The proxy does not check `is_active` or roles.** A banned or de-roled user with a still-valid cookie passes the
   proxy and is stopped one layer later by `requireStaff()`. `setUserActive(false)` additionally calls
   `auth.admin.updateUserById(id, { ban_duration: "876000h" })`, so the token stops refreshing — but a
   `console.error` is the only handling if that call fails, and the action still reports success.
3. **`PRICE_ROLES` is redeclared verbatim in five other files** as `WRITE_ROLES` / `FINANCE_ROLES`. They are equal
   today; nothing links them, so they can drift independently of `src/lib/auth.ts`.
4. **`/admin/users/page.tsx` uses the service-role client to call `auth.admin.listUsers({ perPage: 1000 })`** on every
   render, then joins by id with `profiles` read through the user's own client. The e-mail addresses of every account
   therefore reach that page outside RLS; the page itself is gated by `requireStaff(ADMIN_ROLES)`.
5. **`getStaffSession()` runs two extra queries per request** (`profiles`, `user_roles`). React `cache()` deduplicates
   within a request, but the layout, the page and each action of the same render all resolve from that one cache only
   because they share the request.
6. **Temporary passwords are displayed in the UI and returned in an action result**, not e-mailed. `createStaffUser`
   and `resetUserPassword` both put the plaintext in `message`. There is no forced change-on-first-login flag.
7. **`signIn` re-queries roles even though `getStaffSession` would do it**, because the redirect must happen inside the
   action; the two role checks are written independently (`row.role !== "client"` in the action vs the typed
   `StaffRole` filter in `auth.ts`) and agree by construction rather than by sharing code.
8. **`/admin/setup` writes its audit row with the service-role client and no `actor_id`** (there is no session at that
   point) — the row carries `new_data: { email, via: "setup_page" }`.
9. **There is no rate limit on `/admin/login`.** `app.check_throttle` is used only by the public intake RPCs;
   failed sign-ins are recorded in `audit_logs` but nothing acts on them.
10. **Row-level access for a `commercial` depends entirely on `persons.assigned_to`**, and that column is not in the
    `grant update (...)` list — so a commercial cannot reassign a file to themselves even through PostgREST; only
    `public.admin_assign_persons` (admin-gated) and the round-robin branch of the intake write it.
