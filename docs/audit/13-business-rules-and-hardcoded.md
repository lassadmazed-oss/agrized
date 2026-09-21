## 13. BUSINESS RULES AND HARDCODED VALUES

Scope: sections 27 (business rules the code enforces) and 28 (hardcoded business values). Everything below
was read from the repository at `C:/Users/saif/Desktop/agrized`: `supabase/migrations/0001…0050`,
`supabase/tests/001…031`, `src/lib/**`, `src/components/**`, `src/app/admin/**` and `src/app/(public)/**`.

Two notes on method:

- Where a later migration redefines an earlier function, only the **last** definition is reported as current.
  The redefinition chains that matter are listed in §27.0.
- Files under `src/app/(public)/` were being edited by another process while this audit ran. Every public file
  read here parsed as complete (balanced, ending on `}`), and line counts are recorded where a line number is
  cited. Line numbers in `src/app/(public)/**` may have shifted since.

---

## 27. BUSINESS RULES

### 27.0 Where rules live, and which definition is current

The system enforces the same rule in up to three places, by design (CLAUDE.md: "Enforce access in the database
… then check roles again in each Server Action"):

| Layer | File / object | What it enforces |
|---|---|---|
| Database constraints and triggers | `supabase/migrations/*` | Shape, ranges, uniqueness, append-only audit |
| Security-definer RPCs | `public.submit_interest_request`, `public.submit_offer_request`, `public.submit_land_offer`, `public.staff_*` | Business validation, throttling, role checks, reason capture |
| RLS policies | all `public.*` tables | Who may read/write a row |
| Server Actions | `src/app/**/actions.ts` | Zod shape check, role check via `requireStaff()`, module-flag check, Arabic error message |
| Config reader | `src/lib/config.ts` | Reads `settings`, `feature_flags`, `option_items`, `project_types`, `ownership_scenarios`, `site_media`, `governorates`, `delegations` |

**Functions redefined more than once — the last definition wins:**

| Object | Defined in | Current definition |
|---|---|---|
| `public.submit_interest_request(jsonb)` | 0003, 0009, 0011, 0016, 0019, 0030, **0032** | `supabase/migrations/0032_intake_pricing.sql` |
| `public.crm_search_requests(jsonb,int,int)` | 0007, 0011, 0016, 0028, 0030, **0032** | `0032_intake_pricing.sql` |
| `public.crm_demand_stats(...)` | 0007, 0011, 0028, 0030, **0032** | `0032_intake_pricing.sql` (signature gains `p_people boolean`) |
| `public.million_progress()` | 0016, **0025** | `0025_million_counter_split.sql` |
| `app.tree_price(uuid,uuid)` | 0031, **0045** | `0045_annual_fee.sql` |
| `app.financed_quote(bigint,bigint,int,uuid)` | 0031, **0036** | `0036_markup_on_remaining.sql` |
| `public.public_tree_quote(...)` | 0031, **0045** | `0045_annual_fee.sql` |
| `public.public_parcels()` | 0020, 0022, **0035** | `0035_projects_tree.sql` |
| `public.public_projects()` | 0020, **0023** (+ rebuilt in 0035 chain) | `0023_project_page_v3.sql` / `0035` |
| `app.parcel_price(uuid)` | 0034, **0045** | `0045_annual_fee.sql` |
| `app.project_quote_payload(...)` | 0034, **0048** | `0048_offer_annual_fee.sql` |
| `public.staff_save_pricing_rule(uuid,jsonb,text)` | 0031, **0046** | `0046_annual_fee_save.sql` |

---

### 27.1 Identity, phone and contact rules

1. **A person is a phone number.** `public.persons.phone_e164` is `unique` (`0002_reference_and_crm.sql`).
   Both intakes insert with `on conflict (phone_e164) do update set last_request_at, consent_at` — nothing
   else on an existing person is ever overwritten from a public form (`0032`, `0049`).
2. **Phone shape.** `persons.phone_e164` and `persons.whatsapp_e164` carry
   `check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')` (`0002`).
3. **Phone validation on intake** is `app.assert_phone(p_phone, p_error)` (`0003_land_offers_and_intake.sql`):
   rejects anything not matching `^\+[1-9][0-9]{6,14}$`, then — unless `lead.allow_international_phone` is
   true — rejects anything not matching `^\+216[0-9]{8}$`, raising `phone_not_tunisian`.
4. **Client-side normalisation.** `src/lib/phone.ts::normalizePhone()` parses with `libphonenumber-js`,
   default region `"TN"`, converts Arabic-Indic digits first (`src/lib/digits.ts`), strips spaces/dots/dashes/
   parentheses, rewrites a leading `00` to `+`, and refuses a non-216 country code when
   `allowInternational` is false.
5. **WhatsApp defaults to the phone.** When `whatsapp_e164` is not supplied the intake stores
   `coalesce(v_whatsapp, v_phone)` (`0032`, `0049`). In the forms, ticking «نفس رقم الهاتف» sends the phone
   (`register-wizard.tsx`, `offer-interest-form.tsx`). A separate WhatsApp number is validated with
   `allowInternational = true` regardless of the setting (`register/actions.ts:127`,
   `projects/[code]/offer-actions.ts:63`).
6. **Full name** must be 3–120 characters after trimming, in both intakes (`0032`, `0049`) and in both Zod
   schemas (`register/actions.ts:17`, `offer-actions.ts:22`).
7. **E-mail** is optional; when given it must be ≤ 200 characters and match `^[^@\s]+@[^@\s]+\.[^@\s]+$`
   (`0032`, `0049`). It is lower-cased and trimmed before storage.
8. **Contact channel is required**: one of `phone | whatsapp | both` (`public.contact_channel` enum, `0002`);
   a value that does not cast raises `contact_channel_required`.
9. **Preferred contact time** is optional and must be an active item of the `contact_time` list
   (`app.active_option('contact_time', …)`).
10. **Consent is required and stored verbatim.** `interest_requests.consent_text` and
    `land_offers.consent_text` are `not null`; a blank consent raises `consent_required`. The server sends the
    live `legal.consent_text` setting (`register/actions.ts`, `offer-actions.ts`, `land/actions.ts`).

### 27.2 Residence and "where to invest" rules

11. **Residence governorate is required** and must be active (`invalid_governorate`).
12. **Residence delegation is optional** since `0009_optional_delegation.sql` (`alter column
    residence_delegation_id drop not null`), but when present must belong to the chosen governorate and be
    active (`invalid_delegation`).
13. **A request must name where to invest**: table constraint
    `interest_requests_location_chk check (invest_anywhere or cardinality(invest_governorate_ids) > 0)`
    (`0002`). The RPC raises `invest_location_required` first, and clears `invest_governorate_ids` to `{}`
    when `invest_anywhere` is true.
14. Every id in `invest_governorate_ids` must be an **active** governorate (`invalid_invest_governorate`).
15. **A request must name a project type or say it is unsure**: constraint
    `interest_requests_type_chk check (project_type_unsure or cardinality(project_type_ids) > 0)` (`0002`).
16. **Scenario → project type.** When `scenario_ids` are sent, the RPC derives `project_type_ids`,
    `plantation_systems`, `production_statuses` and `scenario_labels` from `public.ownership_scenarios`;
    a scenario with `is_any = true` clears the types and sets `project_type_unsure` (`0011` onward).
17. **Multi-select gate.** `lead.project_types_multi = false` makes more than one scenario raise
    `single_scenario_only`, and more than one project type raise `single_project_type_only`.
18. Since `0032`, a calculator request with **no** scenario no longer raises `scenario_required`; it sets
    `project_type_unsure := true` (`0032`, the `elsif cardinality(v_types) = 0 then v_unsure := true` branch).

### 27.3 Tree-count rules (the sale unit)

19. **The tree count is either a listed option or a typed number, never both.** Sending both
    `tree_count_option_id` and `tree_count_custom` raises `invalid_tree_choice` (`0019`, `0032`).
20. **A typed number is bounded by settings**: `million.custom_trees_min` (default 1) ≤ n ≤
    `million.custom_trees_max` (default 5000), otherwise `invalid_tree_custom` (`0019`, `0032`).
21. **Western digits only in the database**; a non-integer raises `invalid_tree_custom`. The page converts
    Arabic-Indic digits before sending (`src/lib/digits.ts`).
22. **A typed number is snapshotted like an option**: `tree_count_code = 'custom'`,
    `tree_count_label_ar = <n> || ' ' || app.setting_text('start.trees_unit','زيتونة')`, and
    `tree_count_min = tree_count_max = n` (`0019`, `0032`).
23. **The public counter reads `tree_count_min`**, the lower bound of the stated choice, "so the figure is
    never larger than what people asked for" (`0016`, comment on the column; `0025`).
24. **A tree count is never derived from an area, and an area never from a tree count** — stated on
    `parcels.olive_tree_count` (`0012`) and enforced by keeping both as independent columns. The one
    exception, added later and explicit, is §27.9 rule 57.
25. **The `duration` option list is capped.** Trigger `option_items_duration_cap`
    (`app.check_duration_item`, `0031`) refuses a `duration` item whose `min_number` is null, non-integer,
    `< 1`, or `> app.setting_int('pricing.max_months', 84)` → `duration_over_cap`.
26. **The `down_payment_percent` list is bounded.** Trigger `option_items_down_percent_range`
    (`app.check_down_percent_item`, `0031`) requires `0 < min_number ≤ 100` and `max_number` either null or
    equal to `min_number` → `invalid_down_payment_percent`.

### 27.4 Payment-mode rules (calculator intake, `0032`)

27. `payment_mode`, when given, must be `cash` or `installments`, else `invalid_payment_mode`.
28. **Cash suppresses the money questions**: `down_payment_percent_option_id`, `down_payment_option_id`,
    `installment_option_id` and `duration_option_id` are only read when
    `v_payment_mode is distinct from 'cash'`.
29. **Installments require both a down-payment percentage and a duration** — unless the corresponding
    Back Office list is empty. The guard is `if v_percent.id is null and exists(active
    'down_payment_percent') then raise down_payment_percent_required`, and the same shape for
    `duration_required` (`0032`). The client mirrors it in
    `src/app/(public)/start/calculator-summary.ts::calculatorGap()`, which returns
    `invalid_tree_choice` → `invalid_payment_mode` → `down_payment_percent_required` → `duration_required`
    in that order, and is re-checked server-side in `register/actions.ts` before the RPC call.
30. **A question whose Back Office list is empty is hidden and therefore cannot be required** — stated in
    `calculator-summary.ts` and matched by the SQL guard above.

### 27.5 Offer-page intake rules (`0049_offer_intake.sql`)

31. **`request_kind` tells the two intakes apart**:
    `check (request_kind in ('calculator','offer'))`, default `'calculator'`.
32. **A goal is required only for the calculator flow**:
    `check (request_kind <> 'calculator' or (goal_option_id is not null and goal_label_ar is not null))`.
    `goal_option_id` / `goal_label_ar` lost their `not null` in the same migration.
33. **The offer must be publicly sellable**: `submit_offer_request` refuses unless
    `v_project.status = any (app.project_public_statuses())` → `offer_not_available`. A draft or internal
    offer can never take a request even if a form reaches it.
34. **Trees requested: 1 … the offer's own `tree_count`.**
    `if v_trees is null or v_trees < 1 or (coalesce(v_project.tree_count,0) > 0 and v_trees > v_project.tree_count)`
    → `invalid_offer_trees`. Table constraint `interest_requests_offer_trees_check check (offer_trees is null
    or offer_trees > 0)`. The form re-checks `trees >= 1 && trees <= props.maxTrees`
    (`src/app/(public)/projects/[code]/offer-interest-form.tsx:95`).
35. **An offer request is priced by the same builder as the offer page**:
    `app.project_quote_payload(project, null, trees, 'cash', null, null, false)`; money columns are filled
    only when `pricing = 'ok'`, "so a request never carries a figure the visitor could not see". When
    pricing is closed the request is still accepted, without money.
36. **An offer request answers the shared questions implicitly**: `invest_anywhere := false`,
    `invest_governorate_ids := array[<the offer's governorate>]`, `project_type_unsure := true`,
    `tree_count_code := 'offer'`, `tree_count_min = tree_count_max = trees` — so
    `interest_requests_location_chk` and `interest_requests_type_chk` are satisfied and the CRM/counter keep
    working without a second set of screens.
37. **The offer form is gated on the `projects` module**, not on `interest_form`:
    `if ((await moduleAccess(config, "projects")) === "closed") return offer_not_available`
    (`offer-actions.ts:44-47`). Staff previewing an `internal` module may still send one.

### 27.6 Landowner-offer rules (`0003_land_offers_and_intake.sql`)

38. Contact name 3–120; phone through `app.assert_phone`; consent required.
39. Delegation **is** required here and must belong to the governorate (`invalid_delegation`).
40. `area_value > 0` and `area_unit in ('ha','m2')` → `invalid_area`
    (table check `land_offers_area_unit`, plus RPC guard).
41. `olive_tree_count >= 0` when given (`invalid_tree_count`); `asking_price_millimes >= 0`
    (`invalid_price`).
42. `property_type_option_id` must be an active `property_type` item; `tree_age_option_id`, when given,
    an active `tree_age` item.
43. `irrigation` ∈ `rainfed | irrigated`, `contact_capacity` ∈ `owner | agent | broker`; a bad cast raises
    `invalid_choice`.
44. `available_documents` is built server-side from active `land_document` items — ids sent that are not
    active are silently dropped, not rejected.
45. Coordinates, when given, are bounded by table checks: `latitude between -90 and 90`,
    `longitude between -180 and 180`; `location_description ≤ 1000`, `water_source ≤ 200`.
46. **Review-stage permissions** (`public.review_land_offer`): `legal_review` needs `legal|admin|super_admin`;
    `technical_review` and `field_visit` need `agri_manager|admin|super_admin`; `under_study`, `accepted`,
    `rejected`, `postponed`, `converted` need admin; moving to any of the four final statuses needs admin.
47. **File upload limits are two-sided.** The bucket itself is created with
    `file_size_limit = 20971520` (20 MB) and `allowed_mime_types = {application/pdf, image/jpeg, image/png}`
    (`0003`). The Server Action applies the Back Office limits on top:
    `maxFiles = land_offer.max_files` (default 10) and
    `maxBytes = min(land_offer.max_file_size_mb, 20) * 1024 * 1024`
    (`src/app/(public)/land/actions.ts:77-83`).
48. **Files are registered only if they really landed**, and only within **two hours** of the offer being
    created (`finalizeLandOfferFiles`, `land/actions.ts:160`); the paths must start with `<offerId>/` and
    must exist in the bucket listing.
49. `water_source` is only stored when `irrigation === "irrigated"` (`land/actions.ts:104`).

### 27.7 Throttling and anti-abuse rules

50. **Per-IP throttle**, `app.check_throttle(kind, key_hash, window, max)` (`0003`): counts rows in
    `app.submission_throttle` for that `(kind, key_hash)` inside the window and raises `rate_limited`
    (errcode `P0001`) at or above `max`; otherwise records the attempt. A null `key_hash` skips the check
    entirely.
    - Interest + offer intakes: kind `interest:ip`, window `1 hour`, max
      `antispam.max_requests_per_ip_per_hour` (default 10). The offer intake uses the **same** kind, so
      "one person cannot flood both" (`0049`).
    - Land offers: kind `land_offer:ip`, window `1 day`, max
      `antispam.max_land_offers_per_ip_per_day` (default 5).
51. **Per-phone throttle**: a phone with `≥ antispam.max_requests_per_phone_per_day` (default 3)
    `interest_requests` rows in the last `1 day` raises `rate_limited`. Enforced identically in both
    intakes.
52. **IPs are never stored raw.** `src/lib/request-context.ts::hashIp()` returns
    `sha256(IP_HASH_SALT + ":" + ip)` and throws if `IP_HASH_SALT` is missing. The IP itself is forwarded to
    Postgres only as the audit header `x-client-ip`, truncated to 64 characters.
53. **Honeypot.** Every public form carries a `website` field (`z.string().max(200)`); a non-empty value
    returns the generic failure message without calling the database
    (`register/actions.ts`, `offer-actions.ts`, `land/actions.ts`).
54. **Custom tree ceiling is an anti-abuse rule.** `0019` states the reason in the setting's own
    description: "each request adds its number to the public counter, so a low ceiling limits what one
    spammer can inflate."
55. **Duplicate flag, not duplicate block.** A second request from a known phone is accepted and stored with
    `is_duplicate = not v_inserted`. Duplicates are excluded from `trees_requested` and `requests` in
    `million_progress()` and contribute 0 trees in `crm_demand_stats` (`0032`).

### 27.8 Numbering and uniqueness rules

56. **Request number**: `app.setting_text('request_no.prefix','AGZ') || '-' || <year in Africa/Tunis> || '-' ||
    lpad(app.next_number('interest_request:'||year)::text, 6, '0')`. `interest_requests.request_no` is
    `unique`. Both intakes share the same counter scope, so calculator and offer requests draw from one
    sequence.
    **Land offer reference**: same shape with `land_offer_no.prefix` (default `AGZ-LND`) and scope
    `land_offer:<year>`.
    `app.next_number` is an upsert on `app.counters`, revoked from every API role.
57. Other uniqueness: `projects.code` unique; `parcels (project_id, code)` unique;
    `option_items (list_key, code)` unique; `delegations (governorate_id, name_ar)` unique;
    `project_types.code`, `ownership_scenarios.code`, `tree_spacing_classes.code` unique;
    `land_offer_files.storage_path` unique;
    `financing_markups (project_id, months)` unique **nulls not distinct** (so the global row and a project
    row coexist for the same months);
    `tree_pricing_rules.project_id` unique plus partial index `tree_pricing_rules_one_global` forcing exactly
    one global row;
    `lead_statuses_stage_default_idx` — at most one default status per stage;
    `project_media_one_cover` — at most one cover picture per project;
    `governorates_map_tile_idx` — at most one governorate per map tile.

### 27.9 Pricing rules — the tree with its area

The sale unit is one olive tree together with the land area implied by its spacing class.

58. **Area per tree is generated, never typed**:
    `tree_spacing_classes.area_m2 numeric(10,2) generated always as (row_spacing_m * tree_spacing_m) stored`
    (`0031`), with `row_spacing_m > 0` and `tree_spacing_m > 0`.
59. **Price of one tree** — `app.tree_price(spacing_class, project)` (current definition `0045`):
    ```
    land      = area_m2 × land_price_per_m2_millimes
    extras    = Σ (per_tree → amount ;  per_m2 → area_m2 × amount)
    cost      = land + planting_cost_per_tree_millimes + extras
    margin    = percent ? cost × margin_percent_bp / 10000 : margin_fixed_millimes
    price     = ceil((cost + margin) / price_rounding_millimes) × price_rounding_millimes
    ```
    Rounded **once, up, from the unrounded sum**: "the displayed parts are indicative, the price is exact".
60. **Inheritance**: a project row's null field inherits the global row (`project_id is null`) field by field
    for `land_price_per_m2_millimes`, `planting_cost_per_tree_millimes`, `price_rounding_millimes`,
    `annual_fee_per_tree_millimes`. Margin inherits **as a block**: if `v_rule.margin_mode is not null` the
    project's mode + bp + fixed are used, otherwise the global's three.
61. **Cost lines**: global lines apply unless the project sets `use_global_cost_items = false`; project lines
    always apply. Global lines sort before project lines (`scope_rank`).
62. **A project that lists spacing classes sells only those.** `app.tree_price` returns
    `{ok:false, reason:'spacing_not_allowed'}` for a class the project does not list.
63. **No margin, no price.** When `margin_mode`, `land_price_per_m2_millimes`,
    `planting_cost_per_tree_millimes` or `price_rounding_millimes` resolves to null, the result is
    `{ok:false, reason:'margin_not_set'}`.
64. **The annual fee is not part of the price.** `annual_fee_per_tree_millimes` is carried beside the price
    and is explicitly not financed and carries no markup (`0045` header; `app.financed_quote` untouched).
    Null on a project inherits the global; null on the global means no fee is shown.
65. **Financed quote** — `app.financed_quote(cash_total, down, months, project)` (current definition
    `0036_markup_on_remaining.sql`):
    ```
    guard: cash_total > 0, down >= 0, months >= 1          else invalid_input
    guard: months <= pricing.max_months (default 84)       else too_many_months
    markup: financing_markups row for (months) with project row winning over global
                                                           else duration_not_priced
    guard: down < cash_total                               else down_covers_total
    remaining      = ceil((cash − down) × (10000 + markup_bp) / 10000 / price_r) × price_r
    total_financed = down + remaining
    monthly        = ceil(remaining / months / monthly_r) × monthly_r
    count          = ceil(remaining / monthly)
    last           = remaining − monthly × (count − 1)
    shortened      = count < months
    ```
    The rule the migration exists to install: **the markup applies to what is financed, not to the whole
    price** — the down payment is always paid at the cash price, so a larger down payment carries a smaller
    markup in dinars.
66. **The monthly amount is rounded up and the last installment absorbs the difference** — an explicit owner
    choice recorded in the function body and in its comment.
67. **A duration without a markup row is not priced.** There is no fallback rate.
68. **The down payment is a percentage of the cash total, rounded up to the price step**:
    `app.down_payment_from_percent(cash, percent, project) =
     ceil(cash × percent / 100 / price_rounding) × price_rounding`, returning null unless
    `0 < percent ≤ 100`.
69. **A project may narrow the percentages it offers.** `app.project_down_percent_items(project)` returns the
    project's own rows when it has any, otherwise every active `down_payment_percent` item. Same rule for
    spacing classes via `project_spacing_classes`.
70. **`pricing.max_months` cannot be lowered below what is live.** Trigger
    `settings_max_months_floor` → `app.check_max_months_setting` (`0031`) refuses a value below
    `max(active duration items' min_number, max financing_markups.months)` → `cap_below_durations`, and
    refuses a non-numeric or `< 1` value → `invalid_pricing_rule`. The Server Action
    (`settings/actions.ts:118-135`) performs the duration half of this check first with its own Arabic
    message, and translates the database's `cap_below_durations` into a second message about markups.
71. **Trigger `financing_markups_cap`** refuses a markup row with `months > pricing.max_months`.
72. **Parcel price** — `app.parcel_price(parcel)` (current definition `0045`):
    - project lists no class → `pricing = 'legacy'`: report the typed `area_m2`,
      `nullif(cash_price_millimes, 0)` and `nullif(annual_costs_millimes, 0)`;
    - otherwise `total_area = area_per_tree × trees`, `cash_total = price_per_tree × trees`,
      `annual_fee_total = annual_fee_per_tree × trees`;
    - `reason` is one of `spacing_required`, `spacing_not_allowed`, `spacing_not_found`, `margin_not_set`,
      `trees_missing`;
    - `pricing = 'ok'` means exactly "both totals are known".
73. **`app.project_spacing_choice(project, class)`** returns status `legacy` (project lists no class), `ok`,
    `required` (several classes and none given) or `not_allowed`.
74. **Offer/project quote gating** (`app.project_quote_payload`, current definition `0048`):
    `pricing = 'closed'` when the caller is not staff and the `pricing` module is not open;
    `'not_offered'` when not staff and the project is not `published`;
    `'legacy'` when the project lists no class; then `'unavailable'` or `'ok'`.
    The internal breakdown (`price`) and `installments.markup_bp` are added only when
    `p_staff and app.can_price()`.
75. **Tree ceiling on a quote**: `v_max := greatest(million.custom_trees_max, max active tree_count
    min_number)`, then on an offer `v_max := coalesce(nullif(project.tree_count,0), v_max)`; trees outside
    `1 … v_max` come back as `trees = null` rather than as an error.
76. **The durations a project offers** are the active `duration` items whose months are within
    `1 … pricing.max_months` **and** for which a markup row exists for that project or globally (`0034`).

### 27.10 Legacy pricing rules (`compute_installment_plan`, `0013`)

Still present and still used by the 0020 parcel-offer path.

77. Models: `markup_brackets` (default), `monthly_rate`, `scenarios`.
78. `cash <= 0` → `missing_price`; `down < 0` or `installment <= 0` → `invalid_input`.
79. `down >= cash` → a cash plan: `months = 0`, `total = cash`, `model = 'cash'`.
80. `min_down_pct > 0` and `down < ceil(cash × pct / 100)` → `down_payment_too_low` plus the minimum.
81. `installment < min_installment_millimes` → `installment_too_low` plus the minimum.
82. `scenarios`: an exact `(down_millimes, installment_millimes)` match is required, else
    `no_matching_scenario`.
83. `monthly_rate`: `installment <= financed × rate` → `installment_too_low`;
    `months = ceil(financed / (installment − financed × rate))`; `months > max_months` → `too_many_months`.
84. `markup_brackets`: brackets are walked in ascending `max_months`; the first bracket whose computed
    `months <= least(bracket.max_months, max_months)` wins. Falling through every bracket returns
    `installment_too_low`.
85. `app.parcel_pricing(parcel)` resolves the formula: the parcel's own `pricing` jsonb, else the project's,
    else `settings['pricing.default']`.
86. **The formula never leaves the database.** `app.parcel_offer_payload` strips `model`, `markup_pct` and
    `max_months` from every plan it returns, and `compute_installment_plan` had its execute grant revoked
    from `public, anon` in `0020`.
87. **Down-payment floor on a listing card** (`app.parcel_down_from`, `0022`): the smallest active
    `down_payment` option that is `< cash` and `>= ceil(cash × min_down_pct / 100)`.
88. **Back Office formula editor limits** (`src/lib/pricing-form.ts`, shared by client and server):
    `max_months` 1–600 whole; `min_down_pct` 0–100; `min_installment` 0–1 000 000 dinars;
    bracket months 1–600 whole and markup 0–500 %, at least one bracket, at most `MAX_BRACKETS = 12`,
    no duplicate months; monthly rate 0–20 %; scenarios: down 0–10 000 000, installment
    0.001–10 000 000, months 1–600 whole, total 0.001–100 000 000, at most `MAX_SCENARIOS = 20`, no two
    scenarios sharing a `(down, installment)` pair, and the coherence rule
    `down + inst×(months−1) < total ≤ down + inst×months`.

### 27.11 Back Office pricing-write validation (`0031`, `0046`)

All nine writers begin with `if not app.can_price() then raise 'forbidden' (42501)` and then
`perform app.set_reason(p_reason)`.

89. `staff_save_spacing_class`: `code ~ '^[a-z0-9_]{2,40}$'`, `label_ar` 1–120, `label_fr` ≤ 120,
    `0 < row_spacing_m < 10000`, `0 < tree_spacing_m < 10000`, code unique → `duplicate_code`.
90. `staff_delete_spacing_class`: refuses a class in use → `spacing_in_use`.
91. `staff_save_pricing_rule` (current `0046`): amounts ≥ 0; `annual_fee ≥ 0`;
    `price_rounding ≥ 1`; `monthly_rounding ≥ 1`; `margin_percent_bp` 0–100000;
    `margin_mode` ∈ `percent|fixed`; `percent` requires `bp`, `fixed` requires the amount;
    notes ≤ 1000 each; **the global row must carry land, planting and both rounding steps**; and
    **once the global margin is set it may be changed but never unset** — "prices on the site would vanish".
    The mode field is normalised: a mode other than `percent` nulls `bp`, other than `fixed` nulls the fixed
    amount; the global row always has `use_global_cost_items = true`.
92. `staff_save_cost_item`: `label_ar` 1–120, `label_fr` ≤ 120, `basis` ∈ `per_tree|per_m2`, `amount ≥ 0`,
    project must exist. An update that does not name `project_id` keeps the current scope, "so a partial
    payload never turns a project line global".
93. `staff_save_financing_markups`: replaces every row of the scope; each `months ≥ 1`,
    `markup_bp` 0–100000, months unique in the payload, none above `pricing.max_months`
    → `invalid_markup` / `duration_over_cap`.
94. `staff_save_project_spacing_classes` / `staff_save_project_down_percents`: every id must be **active**;
    an empty array clears the list (meaning "every active entry"); the project row is locked
    `for no key update` to serialise concurrent saves.
95. **A parcel may only use a class its project sells** — trigger `parcels_spacing_class_check`
    (`app.check_parcel_spacing_class`, `0034`) → `parcel_spacing_not_in_project`. It takes a `for share`
    lock on the project row so it cannot cross a concurrent class save.
96. **A project cannot drop a class one of its parcels uses** — trigger
    `project_spacing_classes_in_use` → `spacing_used_by_parcels`.
97. **Tree-priced parcels keep their area in sync.** Trigger `parcels_tree_unit_sync` (`0035`):
    on a tree-pricing project, a null `spacing_class_id` is filled with the project's *only* class, and
    `area_m2 := olive_tree_count × area_per_tree`.
98. **Editing a spacing class moves every parcel planted with it** — trigger
    `tree_spacing_classes_area_fanout` (`0035`) rewrites `parcels.area_m2` for that class on tree-pricing
    projects.
99. **Back Office parcel form mirrors the switch** (`src/app/admin/(panel)/projects/actions.ts::saveParcel`):
    when the project lists classes, `area_m2` and `cash_price_dinars` are ignored, the tree count is
    required (`اكتب عدد الزيتونات…`), a class of the project must be chosen (or the single one is taken),
    `area_m2` is computed locally as `round(trees) × class.area_m2`, and `cash_price_millimes` is stored as
    **0** — "a parcel saved under tree pricing stores 0, which is never a price". On a legacy project the
    area and the cash price are required instead.

### 27.12 Visibility and gating rules

100. **Module states.** `public.flag_state` enum = `disabled | internal | public`.
     `app.module_open(key)` (`0020`) = true for `public`, `app.is_staff()` for `internal`, false otherwise.
     `src/lib/modules.ts::moduleAccess()` mirrors it as `open | preview | closed`.
101. **A page whose module is closed shows «قريباً» and its actions refuse** — `ComingSoon` in
     `src/app/(public)/start/page.tsx`, `projects/page.tsx`; `submitInterest` returns
     «التسجيل غير متاح حالياً…» when `interest_form` is `disabled`, or `internal` without a staff session.
102. **Which projects are publicly visible.** `app.project_public_statuses()` = `{published}` plus
     `{sold_out, operating}` when `projects.list_closed` (default true).
     `app.project_visible(status)` = `app.module_open('projects')` AND (status in those, OR
     status = `internal` AND caller is staff).
103. **Which parcels are offered.** `app.parcel_offer_statuses()` = `{available}` plus `{interested}` when
     `projects.offer_includes_interested` (default false, decision D-15).
     `app.parcel_offered(project_status, parcel_status)` = `project_status = 'published'` AND parcel status
     in those — **a closed (sold_out / operating) project never prices a parcel**.
104. **Which parcels are listed at all.** `app.parcel_visible_status(status)` = status ≠ `withdrawn` AND
     (status is offered OR `projects.show_taken_parcels`, default true).
105. **A taken parcel keeps its link** but returns `offered = false` with empty plans, "so shared links never
     404" (`public_parcel_offer`, `0020`).
106. **Public listings never expose internals.** `public_projects()`, `public_parcels()`,
     `public_parcel_offer()`, `public_coverage()`, `public_project_page()` are whitelisted-column
     security-definer RPCs; their comments name what is never returned: pricing formulas, `project_costs`,
     `legal_notes`, `notes`, `land_offer_id`, `plan_storage_path`, coordinates, staff ids.
107. **Coordinates are opt-in per project**: `public_project_page()` returns latitude/longitude only when
     `projects.show_location` (default false). The Back Office refuses `show_location` without coordinates
     and refuses one coordinate without the other (`projects/actions.ts::readPageFields`).
108. **The public parcel listing is bounded in SQL**:
     `limit greatest(20, least(1000, app.setting_int('projects.listing_limit', 300)))`.
109. **The gallery is bounded**: trigger `project_media_limit` refuses an insert at or above
     `projects.gallery_max` (default 24) → errcode `23514`; `public_project_page()` also limits its
     `media` array to that number; the Server Action checks it a third time before uploading.
110. **The public counter is itself a module.** `million_progress()` returns `null` unless
     `app.module_open('public_statistics')` **or** the session carries no JWT (migrations, tests, direct
     scripts). `src/lib/million.ts` turns a null into "the section disappears rather than showing a zero".
111. **`projects` may never be published from the Back Office.**
     `src/app/admin/(panel)/settings/modules/actions.ts:23-28` hard-refuses
     `key === "projects" && state === "public"` with «المشاريع تبقى «داخلي فقط» حتى تُضبط جداول الأسعار…».
112. **A module that does not exist in this build cannot be switched on.**
     `isImplementedModule(key)` (`src/lib/modules-catalog.ts`) gates any state other than `disabled`.
113. **Header links follow the flags**: `/projects` appears only when `projects` is `public`
     (`src/components/site/site-header.tsx:27-32`, fed by `showProjects={flagState(config,"projects") ===
     "public"}` in `src/app/(public)/layout.tsx:17`). The sticky CTA renders only when `interest_form` is
     `public` (`src/app/(public)/layout.tsx:9`, `:29`).
     *(While this audit was running, the `showZitounti` prop and the `/zitounti` link were removed from both
     files by the concurrent edit; the `zitounti` feature flag still exists in `feature_flags`, seeded
     `disabled` by `0004`, and is no longer read by any page.)*
114. **The sticky CTA hides itself on pages that carry their own bottom action**: `/start`, `/register`,
     `/land`, an offer page and a parcel page — but not `/projects/map`
     (`src/components/site/sticky-cta.tsx:14-20`).
115. **Preview reads are never cached.** `src/lib/public-projects.ts::publicMode()` returns `preview` for
     staff on an internal module and those reads go through the caller's session, "so a staff-only row can
     never land in the shared cache".
116. **The primary CTA target is a setting.** `site.cta_primary_target` = `register` sends to `/register`;
     **anything else** reads as `start` (`src/components/site/site-header.tsx::primaryCta`).
117. **Empty copy hides its element.** Stated repeatedly and implemented: an empty tile label hides the tile
     (`million-counter.tsx`), an empty `million.goal_label` hides the goal line, an empty
     `site.unit_title` hides the unit section, an empty `offers.form_title` hides the offer form, an empty
     `site.cta_primary_label` hides the sticky bar.

### 27.13 Access-control rules

118. **Roles**: `public.app_role` = `client, commercial, agri_manager, finance, legal, admin, super_admin`
     (`0001`). `app.current_roles()` only counts roles of an **active** profile.
119. **Role groups in SQL**: `app.is_staff()` = everything but `client`; `app.is_admin()` =
     `admin|super_admin`; `app.can_price()` = `finance|admin|super_admin`.
     Mirrored in `src/lib/auth.ts`: `ADMIN_ROLES`, `CRM_READ_ROLES`, `PRICE_ROLES`, `LAND_OFFER_ROLES`.
120. **Only a super admin manages the super_admin role**, and **the last super admin cannot be removed**
     (`public.admin_set_role`, `0001`).
121. **You cannot deactivate your own account** (`public.admin_set_user_active`), and only a super admin may
     change a super admin's account. The Server Action adds: you cannot strip your own admin rights
     (`users/actions.ts:83-85`), and a super admin's password may only be reset by a super admin.
122. **Deactivation also blocks sign-in** at the auth layer: `ban_duration: "876000h"` (≈ 100 years)
     (`users/actions.ts:109`).
123. **CRM visibility**: `app.can_see_person()` = `admin|super_admin|finance|legal`, or `commercial`
     **assigned to that person**. `app.can_edit_person()` (`0008`) drops finance and legal — "Finance and
     Legal read the CRM but do not write to it".
124. **Persons are updatable only on a whitelist of columns**:
     `grant update (full_name, whatsapp_e164, email, governorate_id, delegation_id, status_id)` (`0002`).
     `is_active` on profiles goes through the RPC only; profiles allow `update (full_name, locale)`.
125. **Reassignment**: `admin_assign_persons` is admin-only and refuses a target that is not an **active
     commercial** → `target_not_active_commercial`. Every move writes a `person_assignments` row.
126. **Round-robin auto-assignment** (`crm.auto_assign_mode = 'round_robin'`) runs **only for a newly
     created person**, picks the active commercial with the oldest last assignment
     (`order by la.last_at nulls first, ur.granted_at`), and records the reason `auto:round_robin`.
127. **Interest requests, status history and assignments are read-only to `authenticated`**; land offers,
     their files and reviews are readable by `agri_manager|legal|finance|admin|super_admin` and never by
     `anon`.
128. **Project costs are Finance/Admin only** (`project_costs_select`), and so are the tree-pricing tables
     (`tree_pricing_rules`, `tree_cost_items`, `financing_markups`, `project_spacing_classes`,
     `project_down_payment_percents`). `tree_spacing_classes` is the exception: `anon` may read the
     **active** ones.
129. **The public intake RPCs are service-role only.**
     `submit_interest_request`, `submit_offer_request`, `submit_land_offer` are revoked from
     `public, anon, authenticated` and granted to `service_role`; the Next.js server calls them with
     `createAdminClient()`.
130. **The `app` schema is not reachable through the API.** Every helper there is revoked from
     `public, anon, authenticated`.
131. **Every Back Office page and action re-checks the role** with `requireStaff([...])`, which redirects to
     `/admin/login` without a session and to `/admin?denied=1` without the role.
     `src/proxy.ts` adds only an "optimistic redirect" for `/admin/:path*`.

### 27.14 Audit and reason rules

132. **`audit_logs` is append-only**: triggers `audit_logs_no_update` (update/delete) and
     `audit_logs_no_truncate` raise `audit_logs is append-only`; the table is revoked from `anon` and
     `authenticated` for insert/update/delete/truncate; only admins may select.
133. **Row changes are logged automatically** by `app.audit_row_change()` on profiles, user_roles, settings,
     feature_flags, governorates, delegations, project_types, option_items, lead_statuses, persons,
     interest_requests, person_assignments, message_templates, land_offers, land_offer_reviews,
     land_offer_files, ownership_scenarios, projects, project_costs, parcels, site_media, project_media,
     tree_spacing_classes, tree_pricing_rules, tree_cost_items, financing_markups, project_spacing_classes,
     project_down_payment_percents.
134. **An update that only touches `updated_at` is not logged** (`v_old - 'updated_at' = v_new -
     'updated_at'` → return).
135. **A reason is required for sensitive operations.** `app.require_reason()` (`0024`) trims and requires
     `char_length >= greatest(1, audit.reason_min_length)` (default 5) → `reason_required`; the floor of 1
     means an empty reason is refused whatever the setting holds. `app.set_reason()` stores it
     transaction-locally in `app.reason`, which `app.write_audit` picks up.
136. **The convention is fixed** (`0024` header): role check → `set_reason` → validation → DML → named audit
     event. Every `staff_*` pricing RPC follows it and writes `pricing.rule_save`,
     `pricing.rule_delete`, `pricing.cost_item_save`, `pricing.cost_item_delete`, `pricing.markups_save`,
     `pricing.project_classes_save`, `pricing.project_down_percents_save`.
137. **The Server Actions refuse without a reason too**, before calling the RPC
     (`pricing/actions.ts::readReason` + `REASON_MISSING`; `projects/actions.ts::saveOfferSpacingClasses`).
138. **Sign-ins are audited from the app**: `auth.login`, `auth.login_failed`, `auth.login_denied`,
     `auth.logout` (`src/lib/auth-events.ts`), plus `auth.password_changed` and `auth.password_reset`
     through `public.log_action` (staff-only).
139. **Request context** is forwarded as headers `x-client-ip` and `x-client-ua` and read by
     `app.request_header()`; the user agent is stripped of non-ASCII and truncated to 300 characters.

### 27.15 CRM query rules

140. **Search paging is bounded in SQL**: `limit least(greatest(p_limit,1),500) offset greatest(p_offset,0)`
     (`crm_search_requests`, all versions).
141. **`crm_search_requests` is `security invoker`** over the `crm_requests` view, so a commercial's results
     are already limited by RLS.
142. **Free-text search** matches `full_name ilike`, `request_no ilike`, and the phone **only when the typed
     digits are ≥ 3** (`length(f.q_digits) >= 3`).
143. **Range filters are overlap tests, not containment** — for desired area and for tree count:
     `c.min <= f.max AND coalesce(c.max, c.min) >= f.min`, with an `include_*_any` switch to also return
     rows that answered nothing.
144. **Date filters are read in Africa/Tunis**: `>= from::timestamp at time zone 'Africa/Tunis'` and
     `< (to + 1)::timestamp at time zone 'Africa/Tunis'`.
145. **Unattributed source reads as `direct`**: `coalesce(source->>'utm_source','direct')`.
146. **Source fields are truncated on capture** (`app.clean_source`, `0003`): utm_source/medium/ref 100,
     utm_campaign/utm_content 150, referrer/landing_path 300, then `jsonb_strip_nulls`.
147. **`match_requests_for_parcel`** (`0013`) requires `app.is_staff()`; a commercial only scores their own
     files (`v_all or p.assigned_to = auth.uid()`); archived persons are excluded; rows below
     `matching.min_score` (default 40) are dropped; **ties are broken by seniority**
     (`order by score desc, created_at asc`); the result is capped at `least(greatest(p_limit,1),200)`.
     Partial credits are hardcoded in the scoring expression: `location × 0.6` for "anywhere",
     `project_type × 0.5` for "unsure", `plantation × 0.5` when either side is unset, `area × 0.6` when no
     area was stated, `area × 0.5` inside a ±20 % band, `down_payment × 0.5` when the stated down payment is
     below the parcel's `min_down_pct`.
148. **Demand statistics windows**: `last_7_days` = `now() - interval '7 days'`; the daily series is
     `today - 29 days … today` in Africa/Tunis.
149. **Duplicates contribute zero trees**: `case when ir.is_duplicate then 0 else coalesce(tree_count_min,0) end`.
150. **Total-price bands come from a setting** (`analytics.total_price_bands_millimes`); while the array is
     empty the analytics page shows no price distribution at all.
151. **Bulk transfer paging**: `BATCH = 500`, `MAX_ROWS = 100_000`
     (`src/app/admin/(panel)/leads/actions.ts:14-15`). The CSV export uses the same `BATCH = 500`
     (`leads/export/route.ts:9`).
152. **The two intakes are never mixed in a bulk action.** When the list is filtered by `request_kind`, the
     bulk transfer pages the demands (not the persons) and reads the kind per row, "so «كل الملفات المطابقة
     للبحث» never quietly takes in the other one" (`leads/actions.ts:35-52`).
153. **The CRM reads the offer columns from the table, not the view.**
     `src/app/admin/(panel)/leads/offer-snapshot.ts` states that `public.crm_requests` was last created
     before `0049`, so `request_kind` and the offer columns are read from `public.interest_requests` in
     chunks of `CHUNK = 100` ids. The corrective migration is present but **not applied**:
     `supabase/pending/bb_crm_offer_columns.sql`.

### 27.16 Settings-editing rules (`src/app/admin/(panel)/settings/actions.ts`)

154. **Legal texts may be edited but never emptied.** `REQUIRED_TEXT` = `site.home_headline`,
     `site.free_interest_notice`, `legal.no_guarantee_notice`, `legal.consent_text`,
     `legal.land_offer_notice`, `legal.parcel_card_note`, `legal.plan_notice`, `request_no.prefix`,
     `land_offer_no.prefix`.
155. Any text setting is capped at **2000 characters**.
156. `request_no.prefix` / `land_offer_no.prefix` must match `^[A-Z0-9-]{2,12}$`.
157. `sms.sender_id` must match `^[A-Z0-9]{2,11}$` — "the operator registers this name; a shape it refuses
     would silently block every message".
158. `crm.auto_assign_mode` ∈ `manual | round_robin`.
159. `site.contact_phone` / `site.contact_whatsapp`, when non-empty, must match `^\+[1-9]\d{6,14}$`.
160. `site.contact_email`, when non-empty, must be a valid e-mail.
161. **Integer settings are range-checked** from `src/app/admin/(panel)/settings/ranges.ts`; an integer
     setting not listed there accepts 0–1 000 000.
162. **JSON settings are schema-checked**: `site.how_it_works` (≤ 10 steps, title ≤ 80, text ≤ 300),
     `site.faq` (≤ 30 pairs, q ≤ 200, a ≤ 2000), `simulator.durations_months` (1–8 months values, each
     1–600, de-duplicated and sorted), `pricing.default` (through `readPricingForm`). **Any other json
     setting is not editable from that page** — «هذا الإعداد لا يُعدَّل من هذه الصفحة.»
163. **Option-list editing rules** (`settings/lists/actions.ts`): a list whose `value_kind = 'code'` cannot
     gain new items ("قيم هذه القائمة ثابتة في النظام"); `money` items need `min ≥ 0` and `max ≥ min` or
     empty; `number_range` items need both bounds ≥ 0 and `max ≥ min`; `time_range` items need
     `HH:MM` (`^([01]\d|2[0-3]):[0-5]\d$`) with `from < to`; `sort_order` is clamped to 0–100000; a new item
     gets an auto-generated code `<listKey>_<base36 timestamp>`.
164. **At least one active «جديد» status must remain** — deactivating the last active `new` lead status is
     refused, because the intake resolves the new person's status from it.
165. **A scenario must be bound to a project type or flagged `is_any`**; its `icon_code` must be one of
     `GROWTH_ICON_CODES`; a card with a picture must have Arabic alt text (also a table check,
     `ownership_scenarios_image_alt_needed`).
166. **Retired, never deleted.** `0017` deactivates `trees_250p`; `0032` deactivates the whole
     `desired_area`, `priority`, `monthly_installment`, `down_payment` and `budget` lists — "LEAD-02 keeps
     every demand's snapshot … and the option ids those demands point to".
167. **Copy migrations only overwrite the seed.** `0021`, `0026`, `0033` update a setting `where value = <the
     exact previous seed>`, so a text the owner already edited is never overwritten.

### 27.17 Media and upload rules

168. Buckets and their server-side limits: `land-offer-files` — private, 20 MB, `{pdf, jpeg, png}`;
     `site-media` — public, 5 MB, `{jpeg, png, webp, avif}`; `project-media` — public, 5 MB, same four types.
169. **A picture slot requires Arabic alt text as soon as it has a URL** — table check
     `site_media_alt_needed`, plus the Server Action and the scenario form.
170. **A URL must be absolute https** — checks `site_media_url_shape`, `project_types_image_shape`,
     `ownership_scenarios_image_shape`, `projects_video_shape` (also ≤ 500 chars),
     `project_media.url ~ '^https://[^ ]+$' and length ≤ 1000`.
171. **Slots are created by migrations; admins only fill them in** — `revoke insert, delete on
     public.site_media from authenticated`.
172. **Every upload gets a fresh filename** (`Date.now()`), "so a replaced picture is never served from a
     cache".
173. **A failed row insert deletes the uploaded file**, so no orphan file stays in a public bucket
     (`projects/actions.ts::addProjectPicture`).
174. **Gallery ordering is renormalised to multiples of 10** on every move
     (`moveProjectPicture`), and a new picture gets `max(sort_order) + 10`.
175. **One cover per project**: the previous cover is released before the new one is set.
176. **Photo credits are printed when the licence requires it.** `mediaCredits()` returns every slot with a
     `credit_text`; the footer renders them inside a `<details>`.

### 27.18 Counter rules (`million_progress`, `0025`)

177. Four tree figures are kept separate and are never added together:
     - `trees_requested` = `sum(tree_count_min)` over non-duplicate requests;
     - `trees_reserved` = `sum(olive_tree_count)` of parcels with status `reserved`;
     - `trees_contracted` = parcels with status in `contracting, sold, owned`
       ("'contracting' counts here by agreement; the tile label says so in settings");
     - `trees_planted` = parcels not `withdrawn` whose project status is `operating`.
178. `participants` = `count(distinct person_id)` over **all** requests (duplicates included);
     `requests` = non-duplicate count; `projects_under_study` = projects in `draft, preparing, internal`.
179. **The bar shows the true share even when it is a sliver**: `share = min(requested/goal, 1)`,
     `barWidth = requested > 0 ? max(share × 100, 0.8) : 0`
     (`src/components/site/million-counter.tsx`), and a share too small to print falls back to the
     `million.share_below` text rather than being rounded up.
180. **The participant band is chosen by the real count**: `million.people_bands` is a list of
     `{min, text}`; the counter picks the largest band the count reaches.
181. **The goal is no longer announced.** `0044_goal_line.sql` empties `million.goal_label` and
     `million.goal_label_fr` and rewrites `million.bar_caption` to «{count} زيتونة مطلوبة إلى حدّ اليوم»;
     `million.goal` is relabelled «العدد المرجعي لشريط التقدّم» — it stays the bar's denominator only.

### 27.19 Rounding rules, collected

| Rule | Where |
|---|---|
| Price per tree: `ceil((cost + margin) / price_rounding) × price_rounding`, rounded **once** from the unrounded sum | `app.tree_price`, `0045` |
| Down payment: `ceil(cash × pct / 100 / price_rounding) × price_rounding` | `app.down_payment_from_percent`, `0031` |
| Remaining: `ceil((cash − down) × (10000 + bp) / 10000 / price_rounding) × price_rounding` | `app.financed_quote`, `0036` |
| Monthly: `ceil(remaining / months / monthly_rounding) × monthly_rounding`, last installment absorbs the difference | `app.financed_quote`, `0036` |
| Legacy markup total: `round(cash × (1 + pct/100))` | `compute_installment_plan`, `0013` |
| Legacy months: `ceil((total − down) / installment)` | `compute_installment_plan`, `0013` |
| Dinars → millimes in forms: scaled **as text**, never through floats, so «0.1» د is exactly 100 millimes | `src/app/admin/(panel)/pricing/form-values.ts` |
| Dinars → millimes elsewhere: `Math.round(value * 1000)` | `land/actions.ts:107`, `projects/actions.ts::dinarsToMillimes`, `settings/lists/actions.ts` |
| Percentages → basis points: 2 decimals, scaled as text | `form-values.ts::percentToBp` |
| Metres: 2 decimals, scaled as text then `/100` | `form-values.ts::metres` |
| Coordinates: `Math.round(value * 1e6) / 1e6` (matches `numeric(9,6)`) | `projects/actions.ts::coordinate` |
| Money display: `millimes / 1000`, 0 decimals unless `withMillimes` | `src/lib/format.ts:7-11` |

### 27.20 Required-if rules, collected

| If… | then… | Where |
|---|---|---|
| not `invest_anywhere` | at least one investment governorate | `interest_requests_location_chk`, RPC |
| not `project_type_unsure` | at least one project type | `interest_requests_type_chk` |
| `request_kind = 'calculator'` | `goal_option_id` and `goal_label_ar` | `interest_requests_goal_check`, `0049` |
| `payment_mode = 'installments'` and the list is non-empty | a down-payment percentage | `0032` |
| `payment_mode = 'installments'` and the list is non-empty | a duration | `0032` |
| `tree_count_custom` given | `tree_count_option_id` must be absent | `0019`, `0032` |
| `margin_mode = 'percent'` | `margin_percent_bp` | table check + RPC |
| `margin_mode = 'fixed'` | `margin_fixed_millimes` | table check + RPC |
| global pricing rule | land price, planting cost and both rounding steps | `tree_pricing_rules_global_check` |
| global margin already set | it may change but never be unset | `staff_save_pricing_rule`, `0046` |
| a site-media / scenario / project picture has a URL | Arabic alt text | table checks + actions |
| `show_location` | both coordinates present | `projects/actions.ts` |
| latitude given | longitude given, and vice versa | `projects/actions.ts` |
| a project lists spacing classes | a parcel needs a tree count and a class; area and price are computed | `saveParcel`, `0034`, `0035` |
| a project lists no class | a parcel needs a typed area and a typed cash price | `saveParcel` |
| land offer `irrigation = 'irrigated'` | `water_source` is kept (otherwise blanked) | `land/actions.ts:104` |
| a sensitive pricing RPC is called | a non-empty reason | `app.require_reason`, `0024` |
| `map_row` set | `map_col` set, and vice versa | `governorates_map_tile_pair`, `0029` |

---

## 28. HARDCODED VALUES

### 28.0 The stated rule, and how the code stands against it

`CLAUDE.md` states: *"Never hard-code business values (amounts, lists, texts, limits, module visibility).
Read them from `settings`, `option_items`, `project_types`, `lead_statuses` or `feature_flags` via
`src/lib/config.ts`."*

The code follows this closely: prices, margins, markups, spacing, durations, tree counts, page copy and
module states are all rows. What remains hardcoded in TypeScript falls into six groups, listed below:
(a) fallback defaults passed to `settingText/Int/Bool`, (b) validation bounds, (c) staff-facing enum
labels, (d) staff-facing Arabic copy, (e) infrastructure constants (buckets, caches, MIME types), and
(f) a handful of public Arabic headings.

### 28.1 Money and pricing values

| Value | Where | Purpose | Belongs in the database? |
|---|---|---|---|
| `10000` millimes/m² (land price), `50000` millimes (planting per tree), `2500` bp (25 % margin), `1000` millimes price rounding, `1000` millimes monthly rounding | `supabase/migrations/0031_tree_pricing.sql` seed of the global `tree_pricing_rules` row | Starting values from the owner's own example (35 m² × 10 د + 50 د → «السعر النهائي 500 د») | **Already in the database.** Seeded, editable from `/admin/pricing`, flagged in `note_ar` as "يُراجع مع المالية قبل نشر الأسعار" |
| `150000` millimes (150 د) annual fee per tree | `0045_annual_fee.sql:20` — `update … set annual_fee_per_tree_millimes = 150000 where project_id is null` | The owner's figure for yearly pruning/upkeep/follow-up | **Already in the database**, per-offer overridable |
| Markups `36 → 1000 bp`, `48 → 1400 bp`, `60 → 1800 bp`, `84 → 2500 bp` | `0031` seed of `financing_markups` (global scope) | Initial markup per duration | **Already in the database**, per-offer overridable |
| `84` months (`pricing.max_months`) | `0031` seed; default argument repeated in SQL as `app.setting_int('pricing.max_months', 84)` in `app.check_duration_item`, `app.check_max_months_setting`, `app.check_markup_months`, `app.financed_quote`, `staff_save_financing_markups`, `app.project_quote_payload` | System cap on payment duration (report v3 §8) | **Already a setting**; the literal `84` is the in-code fallback if the row is missing |
| `10 %`, `20 %`, `30 %` down-payment percentages | `0031` seed of `option_items` list `down_payment_percent` | The percentages a visitor may choose | **Already in the database** |
| `36 / 48 / 60 / 84` month durations | `0030` and `0031` seeds of `option_items` list `duration` | The durations a visitor may choose | **Already in the database** |
| `500 / 1000 / 1500 / 2000 / 3000` د down payments and `50 / 60 / 70 / 80 / 100` د installments | `0004_seed_configuration.sql` | The retired v1/v2 money lists | **Already in the database**, deactivated by `0032` but kept for snapshots |
| `pricing.default` = brackets `{36 → 10 %, 60 → 18 %, 84 → 25 %}`, `max_months 84`, `min_down_pct 10`, `min_installment_millimes 50000` | `0013_pricing_and_matching.sql` | The legacy parcel-pricing formula | **Already a setting**, editable through `PricingEditor` |
| `matching.weights` = `{location 25, project_type 20, plantation 10, area 15, down_payment 15, installment 15, priority_bonus 5}` and `matching.min_score = 40` | `0013` | Matching score | **Already settings**; the same numbers are repeated as SQL `coalesce` defaults inside `match_requests_for_parcel` |
| `120` months | `compute_installment_plan`, `0013`: `coalesce((p_pricing->>'max_months')::integer, 120)` | Fallback duration cap for a formula with no `max_months` | **Observation:** this default is in code only, and `src/lib/pricing-form.ts::describePricing` repeats it in Arabic — «أقصى مدة: 120 شهراً (القيمة الافتراضية).» |
| `MAX_PRICE_DINARS = 10_000_000` and `step={500}` | `src/app/(public)/projects/page.tsx:42`, `:373` | Upper bound and step of the "max cash price" filter input | **Observation:** a display/validation bound, not a price; not read from `settings` |
| `10_000_000`, `10_000_000_000`, `10_000_000` | `src/app/(public)/land/actions.ts:37,41,38` | Zod ceilings on area, asking price (dinars) and olive-tree count in the landowner form | **Observation:** sanity ceilings only; the database checks only `> 0` / `>= 0` |
| `0–500 %` bracket markup, `0–20 %` monthly rate, `1–600` months, `0–1 000 000` د minimum installment, `MAX_BRACKETS = 12`, `MAX_SCENARIOS = 20`, scenario bounds `10 000 000` / `100 000 000` | `src/lib/pricing-form.ts` | Bounds of the legacy formula editor | **Observation:** editor bounds in code, shared verbatim between client and server |
| `0–100000` basis points (0–1000 %) | table checks on `tree_pricing_rules.margin_percent_bp` and `financing_markups.markup_bp`, `0031` | Margin and markup ceiling | In the database as a constraint |
| `100_000` | `pricing/actions.ts::readSortOrder` | `sort_order` ceiling | Cosmetic |

### 28.2 Counts, areas, spacings and durations

| Value | Where | Purpose | Belongs in the database? |
|---|---|---|---|
| Eight spacing classes — `24×24`, `14×14`, `10×10`, `7×7`, `7×5`, `5×5`, `4×2`, `4×1.5` m | `0031` seed of `tree_spacing_classes` | The area attached to one tree | **Already in the database**, editable and extensible |
| Tree-count cards `25, 50, 100, 250, 500, >500, اقترحولي` | `0016_million_trees.sql`, `0017_tree_count_500.sql` | The tree tiers on the calculator | **Already in the database** |
| `million.custom_trees_min = 1`, `million.custom_trees_max = 5000` | `0019` seed; fallbacks repeated as `app.setting_int('million.custom_trees_max', 5000)` in `0019`, `0031`, `0032`, `0034`, `0045`, `0048`, and as `settingInt(config, "million.custom_trees_max", 5000)` in `src/app/(public)/start/calculator.ts:30` | Bounds of the typed tree count | **Already a setting** |
| `million.goal = 1000000` | `0016`; fallback `app.setting_int('million.goal', 1000000)` in `million_progress()` | Denominator of the progress bar | **Already a setting** |
| `QUICK_PICKS = [1, 5, 10, 25, 50]` | `src/app/(public)/projects/[code]/offer-interest-form.tsx:68` | Quick-choice buttons for "how many trees of this offer" | **Observation:** a list of business-facing numbers in code; every other tree-count list on the site is an `option_items` row |
| `people_bands` thresholds `1 / 10 / 100 / 1000` | `0043_people_counter.sql` seed of `million.people_bands` | Wording bands of the participant count | **Already a setting** |
| `projects.installment_examples = 3`, clamped in SQL to `greatest(1, least(5, …))` | `0020` | How many worked installment examples the offer RPC returns | **Already a setting**; the 1–5 clamp is in code |
| `projects.listing_limit = 300`, clamped to `greatest(20, least(1000, …))` | `0020`, `0022`, `0035` | Public parcel listing cap | **Already a setting**; the 20–1000 clamp is in code |
| `projects.gallery_max = 24` | `0023`; fallback repeated in `app.project_media_limit`, `public_project_page`, `projects/actions.ts:412` | Pictures per project | **Already a setting** |
| `INTEGER_RANGES` — `million.goal [1, 10_000_000]`, `projects.installment_examples [1,5]`, `projects.listing_limit [20,1000]`, `projects.gallery_max [1,60]`, `pricing.max_months [12,120]`, `antispam.* [1,1000] / [1,100] / [1,100]`, `land_offer.max_file_size_mb [1,20]`, `land_offer.max_files [0,50]` | `src/app/admin/(panel)/settings/ranges.ts` | Accepted range of each integer setting | **Observation:** these are limits on limits; the comment explains why `million.goal` may not be 0 (a zero denominator makes the bar meaningless) |
| `simulator.durations_months = [36, 48, 60]` | `0004` | The Phase-1 capacity simulator's durations | **Already a setting.** **Observation:** `/simulator` now redirects to `/start` (`src/app/(public)/simulator/page.tsx`), so the setting and `capacity-simulator.tsx` are a dead path |
| `1000` (millimes per dinar) | `src/lib/format.ts:10`, and every `× 1000` / `/ 1000` conversion | Money unit | Unit of account, not a business value |
| `24` governorates, `279` delegations | `supabase/migrations/0005_seed_governorates.sql` | Tunisian administrative geography, INS codes as primary keys | **Already in the database**; `is_active` and `sort_order` per row |
| Governorate map tiles (24 `(id, row, col)` triples) | `0029_demand_map.sql` | Layout of the Back Office demand cartogram | **Already in the database** (`governorates.map_row/map_col`), bounded 1–30 |
| `"24"` as the fact «24 ولاية مفتوحة للتسجيل» | `site.facts` setting (`0015`, rewritten by `0026`, `0033`, `0039`) | Home-page fact | **Already a setting.** **Observation:** it is a hand-written string, not derived from `count(*) from governorates`, so it will not follow a governorate being deactivated |

### 28.3 Throttling, security and infrastructure numbers

| Value | Where | Purpose | Belongs in the database? |
|---|---|---|---|
| `antispam.max_requests_per_ip_per_hour = 10`, `antispam.max_requests_per_phone_per_day = 3`, `antispam.max_land_offers_per_ip_per_day = 5` | `0004`; the same defaults repeated as `app.setting_int(…, 10 / 3 / 5)` in `0032` and `0049` | Anti-abuse | **Already settings** |
| Windows `interval '1 hour'` and `interval '1 day'` | `0032`, `0049`, `0003` | Throttle windows | **Observation:** the *limits* are settings, the *windows* are literals in the RPC bodies |
| `land_offer.max_file_size_mb = 10` (hard-capped at 20), `land_offer.max_files = 10` | `0004`; `Math.min(…, 20)` in `land/actions.ts:77` and `land/page.tsx:39` | Landowner upload limits | **Already settings**; the 20 MB ceiling matches the bucket's own `file_size_limit = 20971520` |
| `20971520` bytes (20 MB), `5242880` bytes (5 MB) | bucket definitions in `0003`, `0015`, `0023` | Storage limits | In the database (bucket rows) |
| `MAX_BYTES = 5 * 1024 * 1024` | `src/lib/site-media-upload.ts:8`, `src/app/admin/(panel)/settings/media/actions.ts:12`, `src/app/admin/(panel)/projects/actions.ts:380` (as `MAX_PICTURE_BYTES`) | Mirrors the bucket limit so the error is Arabic instead of a storage error | **Observation:** the same 5 MB is written in four places (three TS constants + the bucket rows) and the Arabic message «حجم الصورة يتجاوز 5 ميغا» repeats it a fifth and sixth time |
| MIME → extension maps `{pdf, jpeg, png}` and `{jpeg, png, webp, avif}` | `land/actions.ts:15-19`, `site-media-upload.ts:9-14`, `settings/media/actions.ts:13-18`, `projects/actions.ts:381-386` | Allowed upload types | Mirrors the buckets' `allowed_mime_types` |
| `twoHours = 2 * 60 * 60 * 1000` | `land/actions.ts:160` | Window in which uploaded land-offer files may still be registered | **Observation:** in code only |
| `limit: 100` on the storage listing | `land/actions.ts:165` | Files listed per offer | Cosmetic |
| `10` characters minimum password | `src/app/admin/(panel)/account/actions.ts:13` | Staff password policy | **Observation:** a security policy value in code |
| `randomBytes(12).toString("base64url")` | `users/actions.ts:20` | Temporary password length | In code |
| `ban_duration: "876000h"` | `users/actions.ts:109` | "Forever" ban for a deactivated account (≈ 100 years) | In code |
| `createSignedUrl(path, 300)` | `admin/(panel)/land-offers/[id]/files/[fileId]/route.ts:24` | Signed download link lifetime, 5 minutes | In code |
| `audit.reason_min_length = 5` (floored at 1) | `0024`; fallback `app.setting_int('audit.reason_min_length', 5)` | Minimum length of a change reason | **Already a setting** |
| `revalidate: 300` (config, spacing classes), `revalidate: 60` (counter) | `src/lib/config.ts:79`, `src/lib/tree-pricing.ts:180`, `src/lib/million.ts:46` | Cache lifetimes | Infrastructure |
| `withRetry(load, attempts = 3)` and back-off `attempt * 800` ms | `src/lib/config.ts:18-27` | Retries on build-time config load | Infrastructure |
| `bodySizeLimit: "6mb"`, `themeColor: "#1f4a2c"`, security headers | `next.config.ts`, `src/app/layout.tsx:51` | Platform configuration and brand colour | Infrastructure |
| `AUTO_NEXT_MS = 220` | `src/app/(public)/register/register-wizard.tsx:121` | Delay before the wizard advances on an answer | UI timing |
| `timeout: 15000` for geolocation | `src/app/(public)/land/land-offer-form.tsx:126` | "I am on the property now" button | UI |
| `CHUNK = 100` (offer snapshots), `BATCH = 500` and `MAX_ROWS = 100_000` (bulk/export), `limit(100)` (dashboard) | `leads/offer-snapshot.ts:39`, `leads/actions.ts:14-15`, `leads/export/route.ts:9`, `admin/(panel)/page.tsx:59` | Paging | Infrastructure |
| `500` search cap, `200` matching cap, `10` down/installment options in the offer payload | `crm_search_requests`, `match_requests_for_parcel`, `app.parcel_offer_payload` (`limit 10` on each option query) | Query bounds | **Observation:** the `limit 10` on the down-payment and installment option lists silently truncates a longer Back Office list |

### 28.4 Company details, phone and WhatsApp numbers

There is **no phone number, WhatsApp number or e-mail address hardcoded anywhere in the codebase.**

| Item | Where | Notes |
|---|---|---|
| `site.contact_phone`, `site.contact_whatsapp`, `site.contact_email` | seeded **empty** in `0004_seed_configuration.sql` | Read in `src/app/(public)/layout.tsx:23-27` and rendered by `SiteFooter`. When all three are empty the whole «تواصل معنا» block is not rendered (`site-footer.tsx:17`, `:33`) |
| WhatsApp link shape `https://wa.me/<digits>` | `src/components/site/site-footer.tsx:48` | The number itself comes from the setting; only the URL template is in code |
| `tel:` and `mailto:` templates | `site-footer.tsx:39`, `:57` | Same |
| `© AgriZed` | `site-footer.tsx:95` | Copyright line, no year |
| `AgriZed` as `applicationName` and `siteName`, `locale: "ar_TN"` | `src/app/layout.tsx:39-43` | Brand identity in metadata |
| `"AgriZed · زيتونتك هي مشروعك"` and the matching description | `src/app/layout.tsx:27-31` | **Fallbacks** for `site.meta_title` / `site.meta_description`; the live values are settings (`0039_message_asset.sql`) |
| SMS sender `AGRIZED`, provider `winsms` | `0037_sms_sender.sql` seeds `sms.sender_id` and `sms.provider` | **In the database.** **Observation:** nothing in `src/` reads either key — there is no sending worker; `notification_outbox` rows are only enqueued |
| Example numbers in placeholders and hints: `98 123 456`, `+21600000000`, `+21671000000`, `nom@exemple.tn` | `src/lib/errors.ts:6-9`, `register-wizard.tsx:189,203,551`, `offer-interest-form.tsx:272`, `land-offer-form.tsx:147,564`, `settings/actions.ts:62,65`, `0004` (`site.contact_whatsapp` description) | Illustrative examples, not company data |
| `request_no.prefix = 'AGZ'`, `land_offer_no.prefix = 'AGZ-LND'` | `0004`; fallbacks repeated in the RPCs | **Already settings** |

### 28.5 Disclaimers, legal and public copy

Every legal disclaimer is a `settings` row and is protected from being emptied (§27.16 rule 154).

| Setting | Seed text (verbatim) | Where it is printed |
|---|---|---|
| `legal.no_guarantee_notice` | «AgriZed لا تضمن أي إنتاج أو مردود مالي. كل الأرقام المعروضة تقديرية وغير ملزمة.» | site footer, every page |
| `legal.consent_text` | «أوافق على أن تتصل بي AgriZed بخصوص طلبي، وعلى معالجة معطياتي الشخصية لهذا الغرض فقط.» | sent with, and stored on, every request and land offer |
| `legal.land_offer_notice` | «إرسال العرض لا يمثل التزاماً بالشراء من AgriZed. كل عقار يخضع لدراسة قانونية وفنية وميدانية.» | `/land` |
| `legal.parcel_card_note` | «عدد الزيتونات والإنتاج يختلفان حسب المشروع، المسافات الزراعية، العمر، الري والحالة الفلاحية.» | under every offer card (`0014`) |
| `legal.plan_notice` | «مخطط تقسيم مبدئي، لا يمثل قسمة نهائية قبل استكمال الإجراءات القانونية اللازمة.» | under every plan image (`0020`) |
| `site.free_interest_notice` | «تسجيل الاهتمام مجاني ولا يمثل التزاماً بالشراء.» | beside the CTA and in the form |
| `projects.examples_note` | «هذه أمثلة محسوبة بالتسبقة الأصغر من القائمة … المبلغ النهائي والمدة يُضبطان في وعد البيع.» | under every installment example |
| `legal.forbidden_phrases` | `{"phrases": ["أرباح مضمونة","دخل مضمون","أفضل استثمار","مردودية مضمونة"], "allowed_keys": ["site.faq","legal.no_guarantee_notice","legal.forbidden_phrases"]}` (`0026`) | Not shown to anyone; `supabase/tests/012_vocabulary_guard.sql` scans every public setting, option label, message template, scenario and project type against it |

**Hardcoded copies of those disclaimers, used as fallbacks in code:**

| Text | File:line |
|---|---|
| «هذه أمثلة محسوبة بالتسبقة الأصغر من القائمة وبصيغة التسعير الحالية…» | `src/components/site/offer-block.tsx:81` |
| «هذه القطعة ما عادش معروضة. تنجم تسجّل اهتمامك بقطعة مشابهة ونعلموك أول ما تتوفر.» | `src/components/site/offer-block.tsx:26` |
| «هذا تقدير أولي حسب الإعدادات الحالية. التفاصيل النهائية في بطاقة المشروع والعقد.» | `src/app/(public)/page.tsx:87`, `src/app/(public)/start/copy.ts` (`start.estimate_note` fallback) |
| «ما فماش قطع متاحة بهذه المعايير توّا…» | `src/app/(public)/page.tsx:259` (`projects.empty_text` fallback) |
| «موافقة على التواصل ومعالجة المعطيات» | `register/actions.ts`, `offer-actions.ts`, `land/actions.ts` — the fallback sent as `consent_text` if `legal.consent_text` is missing |
| «صفّي حسب الولاية أو نوع العرض أو السعر أو المساحة أو عدد الزيتونات. الأراضي البيضاء تظهر دايماً…» | `src/app/(public)/projects/page.tsx` (`projects.filters_hint` fallback) |
| ~60 further one-line fallbacks | `src/app/(public)/start/copy.ts` — every `text("start.*", "…")` second argument |

**Public Arabic headings written directly in JSX (no setting behind them):**

| Text | File:line |
|---|---|
| «كيفاش تخدم AgriZed؟» | `src/app/(public)/page.tsx:294` |
| «عندك أرض أو ضيعة زيتون؟» | `src/app/(public)/page.tsx:409` |
| «أسئلة شائعة» | `src/app/(public)/page.tsx:427` |
| «وين وصلنا» / «كيفاش تخدم» (nav labels; the third, «زيتونتي», was removed during this audit) | `src/components/site/site-header.tsx:28,29` |
| «تواصل معنا», «مصادر الصور», «دخول الفريق», «الهاتف:», «البريد:» | `src/components/site/site-footer.tsx:35,70,97,39,57` |
| «شوف الولايات» (link to `/projects/map`) | `src/app/(public)/projects/page.tsx` filter row |
| «الولاية», «المعتمدية», «نوع العرض», «أقصى سعر حاضر (د.ت)», «المساحة», «عدد الزيتونات», «الكل» | `src/app/(public)/projects/page.tsx` filter labels |
| Wizard step titles «بياناتك», «أين ترغب في الاستثمار؟», «ما هو هدفك؟», «الزيارة والتمويل», «كيف تحب نتصلوا بيك؟», «راجع طلبك» | `src/app/(public)/register/register-wizard.tsx:94-101` |
| Channel labels «مكالمة هاتفية» / «WhatsApp» / «الاثنين» | `register-wizard.tsx:103-107` |
| Yes/no choices «نعم» / «لا، مازال» / «لا», and «بدون إجابة» | `register-wizard.tsx:110-118` |
| Field labels and hints «الاسم واللقب», «رقم الهاتف», «8 أرقام، مثال: 98 123 456», «تحب تزور الأرض؟», «تحب حل تمويل بنكي؟», «أي وقت», «رقم مطلبك»… | `register-wizard.tsx:539-977` |
| «احسب قدرتك», «التسبقة», «القسط الشهري», «شهرياً» | `src/app/(public)/simulator/capacity-simulator.tsx:44-58` (dead path — the page redirects) |
| Card row labels «المساحة», «عدد الزيتونات», «مساحة كل زيتونة», «نوع الغراسة», «حالة الإنتاج» | `src/components/site/parcel-card.tsx:50-59`, `project-card.tsx:41-50` |
| Offer-block labels «السعر حاضر», «التسبقة», «القسط», «المصاريف السنوية التقديرية», «عدد الأشهر», «السعر الجملي», «آخر قسط», «الفارق عن الحاضر», «غير متاح بالقيم الحالية» | `src/components/site/offer-block.tsx:53-107` |
| «عدد الزيتونات», «مساحة كل زيتونة», «المساحة الجملية», «طريقة الدفع», and three installment-status sentences | `src/components/site/tree-offer-block.tsx:49-51,96,179-183` |
| «مسار الصفحة» (aria-label), «التقدم في الحاسبة», «التقدم في الطلب», «أقسام الموقع», «AgriZed، الصفحة الرئيسية», «الخطوة … من …» | `breadcrumb.tsx:10`, `start-chooser.tsx:954,961`, `register-wizard.tsx:844,851`, `site-header.tsx:39,44,72` |

**Staff-facing Arabic copy in code** (deliberate; `src/components/admin/nav-model.ts` states the precedent
explicitly — "The labels are Arabic staff copy written in code … Public user-facing copy still comes from
`settings`"):

| Group | File |
|---|---|
| Lead stage labels and colour tones, channel labels, outcome labels, plantation/production labels, attempt-channel labels | `src/lib/crm.ts` |
| Land-offer status labels/tones, review outcomes, capacity labels, irrigation labels, review stages, final statuses | `src/lib/land.ts` |
| Project and parcel status labels/tones, offer-type labels, property-type labels, cost-kind labels, plan-reason labels, `durationLabel()` («7 سنوات» vs «30 شهراً») | `src/lib/projects.ts` |
| Role labels | `src/lib/auth.ts:12-20` |
| Flag-state labels and phase labels | `src/lib/modules-catalog.ts:4-16` |
| Back Office section names, nav state labels | `src/components/admin/nav-model.ts` |
| Stock bucket labels «المتاحة / المحجوزة / المباعة / الموقوفة» | `src/app/admin/(panel)/projects/stock.ts:30-35` |
| Pricing model names and hints, basis labels «للزيتونة / للمتر المربع` | `src/lib/pricing-form.ts:10-24`, `pricing/types.ts` |
| Request-kind labels «محاكي / عرض», payment-mode labels «بالحاضر / بالتقسيط», analytics range labels | `leads/filters.ts`, `analytics/demand-stats.ts:45-50` |
| Parcel-price failure reasons in Arabic | `src/lib/parcel-prices.ts:24-29` |
| ~70 intake error messages, plus the fallback | `src/lib/errors.ts` |
| Every Server Action success/failure message | all `src/app/**/actions.ts` |

### 28.6 Status and enum values hardcoded in code

These are code-level mirrors of database enums. Each is a closed list the database also enforces.

| List | File | Mirrors |
|---|---|---|
| `IMPLEMENTED_MODULES = ["interest_form","simulator_basic","land_offers","projects","public_statistics","pricing"]` | `src/lib/modules-catalog.ts:2` | `feature_flags.key` — **Observation:** the flags table also holds `matching`, `visits`, `reservations`, `contracts`, `installments`, `zitounti`, `subscriptions`, `agri_backoffice`, `harvest`, which this list deliberately excludes so they cannot be switched on |
| `PLANTATION`, `PRODUCTION`, `IRRIGATION`, project status enum, parcel status enum, `["bare_land","planted"]` | `src/app/admin/(panel)/projects/actions.ts:45-47,138-141,251-255` | table checks + `project_status` / `parcel_status` enums |
| `STAGES` (10 lead stages) | `settings/lists/actions.ts:260` | `public.lead_stage` |
| `STAFF_ROLES` (6) | `users/actions.ts:13` | `public.app_role` minus `client` |
| `PAYMENT_MODES = ["cash","installments"]` | `src/lib/tree-pricing.ts:21`, `leads/filters.ts:43` | `interest_requests.payment_mode` check |
| `REQUEST_KINDS = ["calculator","offer"]` | `leads/filters.ts:57` | `interest_requests_kind_check` |
| `COST_KINDS` (13) and `COST_KINDS_OFFERED` (11, dropping `development` and `fees`) | `src/lib/projects.ts:96-116` | `project_costs_kind_check` (`0022`) |
| `HELD_STATUSES = {interested, reserved, contracting}`, `SOLD_STATUSES = {sold, owned}` | `src/app/(public)/projects/page.tsx:68-69` | The public stock split |
| `STOCK_BUCKET_OF` — `interested → available`, `contracting → reserved`, `owned → sold`, `withdrawn → withdrawn` | `src/app/admin/(panel)/projects/stock.ts:19-28` | The Back Office stock split |
| `REVIEW_STAGES` / `FINAL_STATUSES` | `src/lib/land.ts:36-37` | `land_offer_status` and the role matrix in `review_land_offer` |
| `INSTALLMENT_STATUSES` (6) | `src/lib/tree-pricing.ts:71-78` | The `reason` strings `app.financed_quote` can return |
| `ERROR_STEP` and `CALCULATOR_ERRORS` | `register/actions.ts:53-80` | Maps each database error code to a wizard step, or to "go back to /start" |
| `OWN_ACTION` route patterns | `src/components/site/sticky-cta.tsx:14-20` | Which pages suppress the sticky bar |
| `OFFER_TYPE_LABELS` + `offerTypeOf()` — `bare_land` → bare land, `intensive` → intensive, `producing` → productive, else new planting | `src/lib/projects.ts:70-84` | Report v3's four offer families, **derived in code from parcel columns**, not stored |

**Observation:** `offerTypeOf()` and `ownership_scenarios` describe the same four families twice — the
scenarios table maps a citizen's words to `(project_type, plantation_system, production_status)`, while
`offerTypeOf()` re-derives the family from `(property_type, plantation_system, production_status)` in code.

### 28.7 Time zone and formatting

| Value | Where | Purpose |
|---|---|---|
| `"Africa/Tunis"` | `src/lib/format.ts:3`; `analytics/demand-stats.ts::tunisToday`; and ~20 places in SQL (`to_char(now() at time zone 'Africa/Tunis','YYYY')`, every date filter, every daily series) | The single display and business time zone |
| `+01:00`, "no daylight saving" | `src/app/admin/(panel)/leads/[personId]/actions.ts:12-17` — `tunisLocalToIso()` builds `new Date(value + ":00+01:00")` | Converting a typed follow-up time to an ISO timestamp. **Observation:** the offset is written as a literal here rather than derived from the time-zone name |
| `"en-US"` / `"en-GB"` / `"en-CA"` `Intl` locales | `src/lib/format.ts:7,15,24,36,41,46`; `demand-stats.ts` | Western digits and `dd/mm/yyyy` dates inside an Arabic RTL page |
| `"د.ت"`, `"م²"`, `"م"`, `"د"`, `"×"` | `src/lib/format.ts:11,40,44,46`; `tree-pricing-inputs.tsx` | Currency and unit suffixes. **Observation:** `start.trees_unit` («زيتونة») is a setting, but the currency and area symbols are not |
| Arabic-Indic and Persian digit ranges | `src/lib/digits.ts`, `pricing/form-values.ts:4`, `pricing-form.ts:69` | Converting typed digits to 0–9 before validation |

---

## OBSERVATIONS

Factual remarks about the code as it stands. None of these is a proposal.

1. **The same default is written in three or four places.** `pricing.max_months` appears as the literal `84`
   in six SQL fallbacks and once more as a range bound `[12, 120]` in `ranges.ts`; `million.custom_trees_max`
   appears as `5000` in six SQL fallbacks and once in `calculator.ts`; `projects.gallery_max` appears as `24`
   in three SQL sites and once in `projects/actions.ts`. If a row is missing, the behaviour is defined; if a
   default is changed, it must be changed in every copy.

2. **Two pricing engines coexist.** `compute_installment_plan` (`0013`, brackets / monthly rate / scenarios,
   legacy `parcels.pricing` jsonb) and the tree engine (`app.tree_price` + `app.financed_quote`, `0031`/`0036`/
   `0045`). Which one a parcel uses is decided by whether its project has rows in `project_spacing_classes`
   (`app.project_spacing_choice` → `'legacy'`). Both are reachable from public RPCs, and the Back Office
   parcel form switches its required fields between them (`saveParcel`).

3. **Three "minimum down payment" concepts exist side by side**: `pricing.default.min_down_pct` (legacy
   formula), `app.parcel_down_from()` (the smallest *amount* option a parcel accepts, `0022`), and the
   `down_payment_percent` option list with `app.down_payment_from_percent()` (tree engine). The `down_payment`
   amount list they refer to was deactivated by `0032`, so `app.parcel_down_from` and
   `app.parcel_offer_payload`'s `down_options` / `installment_options` now query lists whose items are all
   `is_active = false` and will return empty.

4. **`app.parcel_offer_payload` takes at most 10 down-payment and 10 installment options** (`limit 10` in each
   subquery, `0020`) and then computes the full 10 × 10 plan matrix. A longer Back Office list is silently
   truncated.

5. **The CRM cannot yet filter or export `request_kind` through the database.** `src/app/admin/(panel)/leads/
   offer-snapshot.ts` documents that `public.crm_requests` was created before `0049` and therefore does not
   carry the offer columns; the Back Office reads them from `public.interest_requests` in a second query. The
   migration that would fix it exists at `supabase/pending/bb_crm_offer_columns.sql` and is **not** in
   `supabase/migrations/`.

6. **`sms.sender_id` and `sms.provider` are stored and never read.** `grep` over `src/` finds no consumer;
   `notification_outbox` rows are created by `app.enqueue_message` and nothing dequeues them. The provider,
   sender and template are all configured; the sending step is absent from this repository.

7. **The `projects` module can be previewed but not published.** `settings/modules/actions.ts:23-28` refuses
   `projects → public` unconditionally, so `app.project_visible()`'s `published` branch is only ever reached
   by staff (through the `internal` branch) or by a direct database change.

8. **`/simulator` is a dead path.** `src/app/(public)/simulator/page.tsx` is a `redirect("/start")`, but
   `capacity-simulator.tsx` (a full component with its own Arabic copy and its own arithmetic
   `down + installment × months`) and the setting `simulator.durations_months` — together with the
   `simulator_basic` feature flag and its `'public'` state — are all still present.

9. **Dead but asserted settings.** `0041_payment_hint.sql` records that `start.capacity_title`,
   `start.capacity_hint` and their `_fr` twins render nowhere since the v3 calculator replaced the capacity
   step, and rewrites their `description_ar` to say so — but keeps the rows because
   `supabase/tests/005_start_custom_trees.sql` asserts all four exist and are public. `0039` and `0040` then
   continue to rewrite `start.capacity_hint`'s text.

10. **`site.facts` states «24 ولاية» as a literal string** inside a JSON setting, while the governorate count
    is a real table with an `is_active` column. The figure will not follow the data.

11. **The area-per-tree figure on an offer card is derived two different ways.**
    `src/app/(public)/projects/page.tsx::areaPerTree()` prefers `project.area_per_tree_min_m2` (from the
    spacing class) and otherwise divides `total_area_m2 / tree_count` — a division of two independently
    entered project fields, in a codebase whose stated rule (PARC-02) is that area and tree count are never
    derived from one another. The comment acknowledges it and limits the claim to "an area is not a price".

12. **5 MB appears six times.** Twice as `MAX_BYTES` / `MAX_PICTURE_BYTES` constants, once in
    `site-media-upload.ts`, twice in Arabic messages («حجم الصورة يتجاوز 5 ميغا»), and twice as
    `file_size_limit = 5242880` on the two public buckets.

13. **`formatMillimes` hardcodes «د.ت» while `start.trees_unit` is a setting.** The unit of the thing being
    counted is data; the unit of the money is not. The same asymmetry holds for «م²» (`formatArea`'s default
    parameter) and «م» (`formatSpacing`).

14. **The throttle windows are literals while the throttle limits are settings.** `interval '1 hour'` and
    `interval '1 day'` are written into `submit_interest_request`, `submit_offer_request` and
    `submit_land_offer`; only the counts are configurable.

15. **`match_requests_for_parcel` carries a second copy of `matching.weights`.** The seven weights are read
    from the setting with `coalesce(…, 25 / 20 / 10 / 15 / 15 / 15 / 5)` — the same numbers the setting is
    seeded with — and the partial-credit multipliers (`0.6`, `0.5`, `0.8`, `1.2`) are literals with no
    setting behind them.

16. **`QUICK_PICKS = [1, 5, 10, 25, 50]`** on the offer form is the only visitor-facing list of tree counts
    that is not an `option_items` row; the calculator's own tiers (`tree_count`) are.

17. **The `tree_count` list and `million.custom_trees_max` interact.**
    `greatest(app.setting_int('million.custom_trees_max', 5000), max(active tree_count min_number))` means
    adding a tree-count card above the custom ceiling silently raises the quote ceiling, in
    `public_tree_quote` (`0045`) and `app.project_quote_payload` (`0048`).

18. **`0032` changed a required answer into an optional one without changing the constraint.** The
    calculator intake no longer raises `scenario_required`; it sets `project_type_unsure := true`. The table
    constraint `interest_requests_type_chk` still holds because the flag is set, but the error code
    `scenario_required` remains in `src/lib/errors.ts:17` and in `CALCULATOR_ERRORS`
    (`register/actions.ts:76`), where nothing can now raise it.

19. **`crm.auto_assign_mode = 'round_robin'` only assigns brand-new persons.** A returning phone number
    (`v_inserted = false`) is never auto-assigned, in either intake, even if it is currently unassigned.

20. **`public.log_action` is granted to `authenticated` but refuses non-staff** (`if not app.is_staff() then
    raise 'forbidden'`), while `app.write_audit` is revoked from every API role — so the only way an app
    user writes an audit line is through a security-definer RPC or `log_action`. One exception: the Next.js
    server inserts `auth.*` rows directly into `public.audit_logs` with the service-role client
    (`src/lib/auth-events.ts`), bypassing both.

21. **`interest_requests` has accumulated three generations of snapshot columns** — the v1 money columns
    (`down_payment_*`, `installment_*`), the v2/v3 columns (`duration_*`, `budget_*`, `wants_visit`,
    `wants_bank_financing`, `desired_area_*`, `priority_*`), and the tree-pricing columns
    (`spacing_class_id`, `area_per_tree_m2`, `payment_mode`, `price_per_tree_millimes`,
    `down_payment_percent*`, `total_financed_millimes`, `monthly_millimes`), plus the `0020` parcel columns
    (`parcel_id`, `parcel_plan_*`) which no intake has ever written, and the `0049` offer columns. Several
    `not null` constraints were dropped one at a time (`installment_option_id` in `0030`,
    `down_payment_option_id` in `0032`, `goal_option_id` in `0049`) as each question left a form.

22. **`supabase/tests/` is used as a specification.** `0041` keeps four dead settings alive because test 005
    asserts them; `0044` empties two settings rather than deleting them because test 011 asserts they exist;
    `0021` adds the `owned` enum value and deliberately never references it because Postgres forbids using a
    new enum value in the transaction that adds it, leaving `supabase/tests/007_parcel_statuses_v2.sql` to
    exercise it afterwards.
