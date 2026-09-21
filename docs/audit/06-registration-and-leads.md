## 06. CUSTOMER / LEAD REGISTRATION (§5) AND THE REQUEST MODEL (§6)

Audit of what the repository actually does today. Sources: `supabase/migrations/0001`→`0050`,
`supabase/tests/`, `src/app/(public)/register/`, `src/app/(public)/start/`,
`src/app/(public)/projects/[code]/`, `src/app/admin/(panel)/leads/`, `src/lib/`.
The latest definition of every SQL function was used; earlier definitions are named only where they
explain a column that still exists.

**Working-tree note.** While this audit was written another process was editing files under
`src/app/(public)/`. The files read for this report that are listed as modified —
`src/app/(public)/start/page.tsx`, `src/app/(public)/start/calculator-summary.ts`,
`src/app/(public)/start/start-chooser.tsx`, `src/app/(public)/projects/[code]/page.tsx` — all read as
syntactically complete files at the time they were read. `src/app/(public)/register/page.tsx`,
`src/app/(public)/register/register-wizard.tsx`, `src/app/(public)/register/actions.ts`,
`src/app/(public)/projects/[code]/offer-actions.ts` and
`src/app/(public)/projects/[code]/offer-interest-form.tsx` are **not** modified in the working tree.

---

# PART A — CURRENT IMPLEMENTATION: CUSTOMER / LEAD REGISTRATION

## A.1 There are two registration flows, not one

Since migration `0049_offer_intake.sql` (2026-09-18) the product has **two distinct public intakes** that
both land in the same table `public.interest_requests`, told apart by the column `request_kind`.

| | Calculator intake | Offer intake |
|---|---|---|
| `request_kind` value | `'calculator'` (column default) | `'offer'` |
| Questions asked on | `/start` (the calculator) then `/register` (6-step wizard) | the offer page `/projects/[code]`, inline form |
| Client component | `src/app/(public)/register/register-wizard.tsx` (`RegisterWizard`) | `src/app/(public)/projects/[code]/offer-interest-form.tsx` (`OfferInterestForm`) |
| Server Action | `submitInterest` in `src/app/(public)/register/actions.ts` | `submitOfferInterest` in `src/app/(public)/projects/[code]/offer-actions.ts` |
| RPC | `public.submit_interest_request(jsonb)` — last defined in `0032_intake_pricing.sql` | `public.submit_offer_request(jsonb)` — defined in `0049_offer_intake.sql` |
| Feature flag gate | `interest_form` | `projects` |
| Names a real project? | no (`project_id` stays null) | yes (`project_id`, `project_code`, `project_name`) |
| Asks a goal? | yes, required | no (and `interest_requests_goal_check` allows it to be null only for `request_kind <> 'calculator'`) |
| Returns | `{ request_no }` | `{ request_no, project_code }` |

Both RPCs are `security definer`, `set search_path = ''`, and are **revoked from `public`, `anon`,
`authenticated` and granted only to `service_role`** (`0003` line 298-299 for the first,
`0049` for the second). Both Server Actions therefore call them through
`createAdminClient(...)` (`src/lib/supabase/admin.ts`) — the service-role client — never from the browser.
`supabase/tests/031_offer_intake.sql` §6 asserts exactly this grant posture for `submit_offer_request`.

## A.2 Route map and module gating

| Route | File | Gate |
|---|---|---|
| `/start` | `src/app/(public)/start/page.tsx` | `moduleAccess(config, "interest_form")`; `closed` → `<ComingSoon title={copy.title} />`; `preview` → `<PreviewBanner />` |
| `/register` | `src/app/(public)/register/page.tsx` | same flag; `closed` → `<ComingSoon title="سجّل اهتمامك" />` |
| `/projects/[code]` (offer form section) | `src/app/(public)/projects/[code]/page.tsx` | `moduleAccess(config, "projects")` for the page; the form itself needs `formOpen = selling && interestOpen && offerTrees > 0` where `selling = project.status === "published" \|\| "internal"` and `interestOpen = flagState(config, "interest_form") === "public"` |

`moduleAccess` (`src/lib/modules.ts`) maps flag state → `open` (state `public`), `preview` (state
`internal` **and** a staff session exists), `closed` (everything else).
`feature_flags` seeds `('interest_form', 'public', …)` in `0004_seed_configuration.sql`.

The Server Actions repeat the gate:
* `submitInterest` reads `flagState(config, "interest_form")` and refuses with
  `"التسجيل غير متاح حالياً. حاول لاحقاً."` when the state is `disabled`, or `internal` without
  `getStaffSession()`.
* `submitOfferInterest` refuses when `moduleAccess(config, "projects") === "closed"`, with the message of
  the error code `offer_not_available`. Staff previewing an internal module may still submit.

## A.3 The `/start` → `/register` URL contract (plan P2-6)

Every calculator question is asked **once**, on `/start`; `/register` never re-asks them. The answers
travel in the query string. The contract is the pure module
`src/app/(public)/start/calculator-summary.ts`:

```
calculatorQuery(choices, wantsVisit) →
  trees=<option uuid>  |  trees_custom=<integer>
  scenario=<uuid>  spacing=<uuid>  payment=cash|installments
  down_pct=<uuid>  duration=<uuid>     (only when payment=installments)
  visit=1                              (only when the visitor asked for a visit)
```

`readCalculatorChoices` (`src/app/(public)/start/calculator.ts`) parses them back and **drops any id that
is not in the current Back-Office list**; `trees_custom` must match `/^\d{1,9}$/` and sit between
`million.custom_trees_min` (seeded 1) and `million.custom_trees_max` (seeded 5000)
(`0019_start_page.sql` lines 124-127). A listed tier wins when both `trees` and `trees_custom` arrive.
`paymentMode` falls back to `"installments"` when a `down_pct` or `duration` arrived without `payment`.

`/register` redirects to `/start` (forwarding **every** query parameter verbatim through
`forwardedQuery`) when `!choices.treeId && choices.treesCustom === null`.

`calculatorGap(choices, {downPercents, durations})` names what still blocks a request, using the
database's own error codes: `invalid_tree_choice`, `invalid_payment_mode`,
`down_payment_percent_required`, `duration_required`. A question whose Back-Office list is empty is not
required. The gap is computed three times: on `/start` (to disable the CTA), on `/register` (server side,
rendered as `recap.error` with a link back to `/start?<query>`), and again inside `submitInterest`
before the RPC call.

## A.4 Calculator intake — every collected field

Legend: **C** = checked in `register-wizard.tsx`, **A** = checked by the zod schema / code in
`register/actions.ts`, **D** = checked inside `public.submit_interest_request`.

### A.4.1 Asked on `/register` (the 6-step wizard)

`STEPS` = `["بياناتك", "أين ترغب في الاستثمار؟", "ما هو هدفك؟", "الزيارة والتمويل", "كيف تحب نتصلوا بيك؟", "راجع طلبك"]`.

| Step | Field (label) | Req. | C | A | D | DB destination |
|---|---|---|---|---|---|---|
| 1 | `fullName` — «الاسم واللقب» | yes | `trim().length >= 3` → «اكتب الاسم واللقب كاملين.» | `z.string().trim().min(3).max(120)` | `length between 3 and 120` else `invalid_full_name` | `interest_requests.full_name`; `persons.full_name` **only on first insert** |
| 1 | `phone` — «رقم الهاتف», hint «8 أرقام، مثال: 98 123 456» | yes | `phoneError()`: western-digit conversion, strips ` .-()`, accepts local `^[2-9]\d{7}$` after stripping `+216`/`00216`; international only when `lead.allow_international_phone` | `z.string().trim().min(6).max(30)`, then `normalizePhone(value, settingBool(config,"lead.allow_international_phone"))` (libphonenumber-js, default region `TN`) → E.164 | `app.assert_phone`: `^\+[1-9][0-9]{6,14}$` else `invalid_phone`; not `^\+216[0-9]{8}$` and setting false → `phone_not_tunisian` | `interest_requests.phone_e164`; `persons.phone_e164` (**unique key**) |
| 1 | `whatsappSame` — checkbox «رقم WhatsApp هو نفس رقم الهاتف» | default `true` | — | `z.boolean()` | — | when true the action sends `whatsapp_e164 = phone.e164` |
| 1 | `whatsapp` — «رقم WhatsApp» (shown only when the checkbox is off) | conditional | `phoneError(value, true)`; empty → «اكتب رقم WhatsApp، أو اختر «نفس رقم الهاتف».» | `max(30)`, `normalizePhone(value, true)` — **international always allowed here**, independent of the setting | regex `^\+[1-9][0-9]{6,14}$` else `invalid_whatsapp`; no Tunisian-only rule | `interest_requests.whatsapp_e164`; `persons.whatsapp_e164` on first insert, `coalesce(v_whatsapp, v_phone)` |
| 1 | `email` — «البريد الإلكتروني (اختياري)» | no | `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` when non-empty | `z.string().trim().max(200)` | lower-cased + trimmed, `nullif('')`; `length <= 200` and same regex else `invalid_email` | `interest_requests.email`; `persons.email` on first insert |
| 1 | `governorateId` — «الولاية», hint «ولاية إقامتك.» | yes | must be set | `z.number().int().positive()` | must exist in `public.governorates` with `is_active` else `invalid_governorate` | `interest_requests.residence_governorate_id`; `persons.governorate_id` on first insert |
| 2 | `investAnywhere` — «المكان غير مهم» | one of the two | at least one governorate **or** this box | `z.boolean()` | true → `invest_governorate_ids` forced to `'{}'` | `interest_requests.invest_anywhere` |
| 2 | `investGovernorateIds` — 24 governorate chips | see above | `investAnywhere \|\| length > 0` → «اختر ولاية واحدة على الأقل، أو «المكان غير مهم».» | `z.array(z.number().int().positive()).max(30)` | empty and not anywhere → `invest_location_required`; any inactive/unknown id → `invalid_invest_governorate`; stored `array_agg(distinct …)` | `interest_requests.invest_governorate_ids smallint[]` |
| 3 | `goalOptionId` — the `goal` option list | yes | must be set → «اختر هدفك.» | `z.uuid()` | `app.active_option('goal', …)`; null → `invalid_goal` | `goal_option_id`, `goal_code`, `goal_label_ar` (snapshot, LEAD-02) |
| 4 | `wantsVisit` — «تحب تزور الأرض؟» / «نعم» · «لا، مازال» | **no** | none | `z.boolean().nullable()` | only a JSON boolean counts; anything else = no answer, never an error | `wants_visit boolean` |
| 4 | `wantsBankFinancing` — «تحب حل تمويل بنكي؟» / «نعم» · «لا» | **no** | none | `z.boolean().nullable()` | same rule | `wants_bank_financing boolean` |
| 5 | `contactChannel` — «طريقة التواصل»: `phone` «مكالمة هاتفية», `whatsapp` «WhatsApp», `both` «الاثنين» | yes | must be set → «اختر طريقة التواصل.» | `z.enum(["phone","whatsapp","both"])` | cast to `public.contact_channel`; failure → `contact_channel_required` | `contact_channel` |
| 5 | `contactTimeOptionId` — «الوقت المفضل (اختياري)», plus a radio «أي وقت» that sets it to null | no | none | `z.uuid().nullable()` | `app.active_option('contact_time', …)` when present; unknown → `invalid_contact_time` | `contact_time_option_id`, `contact_time_label_ar` |
| 6 | `consent` — checkbox carrying `legal.consent_text` | yes | must be ticked → «لإرسال الطلب، وافق على التواصل ومعالجة معطياتك.» | `z.literal(true)` | the action sends `consent_text = settingText(config,"legal.consent_text", "موافقة على التواصل ومعالجة المعطيات")`; empty/blank → `consent_required` | `consent_text text not null`; also stamps `persons.consent_at = now()` |
| hidden | `website` — honeypot, visually hidden with `clipPath: inset(50%)` | — | — | `z.string().max(200)`; non-empty → refuse with the generic fallback message | never sent to the database | — |
| hidden | `source` | — | `readVisitSource()` from `sessionStorage` | `z.record(z.string(), z.string().max(300))` | `app.clean_source()` | `source jsonb` |

The seeded `goal` items (`0004_seed_configuration.sql`): `family` «استهلاك عائلي», `investment`
«استثمار» — relabelled to «ملكية زيتون وأرض» by `0026_wording_v2_v3.sql` — and `both` «الاثنين».
The seeded `contact_time` items: `morning` «صباحاً» 08:00-12:00, `afternoon` «بعد الظهر» 12:00-17:00,
`evening` «مساءً» 17:00-20:00.

### A.4.2 Carried from `/start` in the URL, never re-asked

| URL key | Payload key | Validation in `submit_interest_request` | DB destination |
|---|---|---|---|
| `trees` | `tree_count_option_id` | `app.active_option('tree_count', …)`; unknown → `invalid_tree_choice` | `tree_count_option_id`, `tree_count_code`, `tree_count_label_ar`, `tree_count_min = min_number`, `tree_count_max = max_number` |
| `trees_custom` | `tree_count_custom` (sent as a **string**) | cast to integer inside a `begin … exception` block → `invalid_tree_custom`; both keys present → `invalid_tree_choice`; outside `million.custom_trees_min`/`_max` → `invalid_tree_custom` | `tree_count_code = 'custom'`, `tree_count_label_ar = <n> || ' ' || app.setting_text('start.trees_unit','زيتونة')`, `tree_count_min = tree_count_max = n` |
| `scenario` | `scenario_ids` (array of 0 or 1) | every id must be an active `public.ownership_scenarios` row → `invalid_scenario`; more than one while `lead.project_types_multi` is false → `single_scenario_only` | `scenario_ids`, `scenario_labels`, and the derived `project_type_ids`, `plantation_systems`, `production_statuses`, `project_type_unsure` |
| — | `project_type_unsure` | the action sends `!data.scenarioId` | `project_type_unsure` |
| `spacing` | `spacing_class_id` | must be an active `public.tree_spacing_classes` row → `invalid_spacing` | `spacing_class_id`, `spacing_label_ar`, `area_per_tree_m2 = class.area_m2`, `total_area_m2 = area_m2 × tree_n` |
| `payment` | `payment_mode` | must be `cash` or `installments` → `invalid_payment_mode` | `payment_mode text check (payment_mode in ('cash','installments'))` |
| `down_pct` | `down_payment_percent_option_id` (**only sent when `payment_mode === 'installments'`**) | `app.active_option('down_payment_percent', …)` → `invalid_down_payment_percent`; missing while the list has active items → `down_payment_percent_required` | `down_payment_percent_option_id`, `down_payment_percent = option.min_number` |
| `duration` | `duration_option_id` (same condition) | `app.active_option('duration', …)` → `invalid_duration`; missing while the list has active items → `duration_required` | `duration_option_id`, `duration_label_ar`, `duration_months = option.min_number` |
| `visit=1` | — | — | pre-answers the wizard's `wantsVisit` with `true` (the link wins over a saved draft) |

Seeded lists: `tree_count` (`0016`, `0017`) — `trees_25` «25 زيتونة», `trees_50`, `trees_100`,
`trees_250`, `trees_500` «500 زيتونة», `trees_500p` «أكثر من 500» (min 500, max null),
`trees_any` «اقترحولي» (min/max null); `trees_250p` was **deactivated, not deleted**, by `0017`.
`down_payment_percent` (`0031`) — `dpp_10` «10%», `dpp_20`, `dpp_30`.
`duration` (`0030`) — `d_36` «3 سنوات» (36), `d_60` «5 سنوات» (60), `d_84` «7 سنوات» (84);
`sort_order` equals the months.

### A.4.3 Money figures the visitor never types — recomputed at submission

Inside `submit_interest_request` (0032), after validation and **only** when
`v_spacing.id is not null and v_tree_n is not null and app.module_open('pricing')`:

```
v_price := app.tree_price(v_spacing.id, null)
  → price_per_tree_millimes, total_price_millimes = price_per_tree × tree_n
if payment_mode = 'installments' and a percentage and a duration were chosen:
  v_quote := app.financed_quote(total, app.down_payment_from_percent(total, percent, null), months, null)
  → down_payment_amount_millimes, total_financed_millimes, monthly_millimes
```

`supabase/tests/018_intake_pricing.sql` asserts both halves: with the `pricing` flag `internal` the demand
keeps the class, the areas, the payment mode, the percentage and the duration but **all five money
columns stay null**; with the flag `public` the demand holds exactly the figures `public_tree_quote`
returns for the same inputs, and a later `tree_pricing_rules` edit never changes them.

### A.4.4 Payload keys the RPC still accepts but no page sends any more

`submit_interest_request` still reads and snapshots these legacy keys (plan Q-7 retired their lists with
`is_active = false` in `0032`, it never deleted them):
`down_payment_option_id` (→ `invalid_down_payment`), `installment_option_id` (→ `invalid_installment`),
`budget_option_id` (→ `invalid_budget`), `desired_area_option_id` (→ `invalid_desired_area`),
`priority_option_id` (→ `invalid_priority`), `residence_delegation_id` (→ `invalid_delegation` when it
does not belong to the chosen governorate), and a direct `project_type_ids` array (fallback when
`scenario_ids` is empty, with `single_project_type_only` / `invalid_project_type`).
**None of these keys is produced by `register/actions.ts`.** The delegation is therefore always null for
web-submitted requests; `0009_optional_delegation.sql` dropped its `not null`.

## A.5 Offer intake — every collected field

`OfferInterestForm` props come from `src/app/(public)/projects/[code]/page.tsx`; every label is a
setting seeded by `0050_offer_copy.sql` (`offers.form_title` «سجّل اهتمامك بهذا العرض»,
`offers.form_intro`, `offers.trees_label` «قدّاش زيتونة تحب من هذا العرض؟»,
`offers.trees_hint` «من زيتونة وحدة إلى {max} زيتونة.», `offers.submit_label`,
`offers.success_title` «وصلنا طلبك على هذا العرض», `offers.success_text`).

| Field | Req. | Client check | Action check | DB check | Destination |
|---|---|---|---|---|---|
| `trees` (text input + quick-pick chips `1, 5, 10, 25, 50` and «الكل (N)») | yes | `parseInt` of western digits; `trees >= 1 && trees <= maxTrees` where `maxTrees = project.tree_count` | `z.number().int().positive()`, sent as a **string** | must parse, `>= 1`, and `<= projects.tree_count` when that is `> 0`, else `invalid_offer_trees` | `offer_trees`, and `tree_count_min = tree_count_max = trees`, `tree_count_code = 'offer'`, `tree_count_label_ar = '<n> زيتونة'` |
| `projectId` | yes (hidden) | — | `z.uuid()` | the project must exist **and** its `status` must be in `app.project_public_statuses()`, else `offer_not_available` | `project_id`, `project_code`, `project_name` |
| `fullName` «الاسم واللقب» | yes | `trim().length >= 3` | `min(3).max(120)` | 3..120 → `invalid_full_name` | as in A.4.1 |
| `phone` «رقم الهاتف» | yes | at least 8 digits | `normalizePhone(...)` with the same setting | `app.assert_phone` | as in A.4.1 |
| `whatsappSame` / `whatsapp` | conditional | 8 digits when the box is off | `normalizePhone(value, true)` | E.164 regex | `whatsapp_e164` |
| `email` | no | not validated client-side | `max(200)` | lower/trim + regex → `invalid_email` | `email` |
| `governorateId` «ولاية إقامتك» | yes | must be chosen | `z.number().int().positive()` | active governorate → `invalid_governorate` | `residence_governorate_id` |
| `contactChannel` «كيفاش تحب نتصلوا بيك؟» — labels here are `phone` «مكالمة», `whatsapp` «WhatsApp», `both` «الزوز» | yes | must be chosen | `z.enum([...])` | `contact_channel_required` | `contact_channel` |
| `contactTimeOptionId` «الوقت المفضّل للمكالمة (اختياري)» | no | — | `z.uuid().nullable()` | `invalid_contact_time` | `contact_time_option_id`, `contact_time_label_ar` |
| `consent` | yes | must be ticked | `z.literal(true)` | `consent_required` | `consent_text` |
| `website` honeypot | — | — | non-empty → generic refusal | — | — |
| `source` | — | `readVisitSource()` | `z.record(...)` | `app.clean_source` | `source` |

The offer form **never asks** a goal, an offer type, a place of investment, a visit wish, a bank-financing
wish, a payment mode, a down payment or a duration. `submit_offer_request` fills the two columns that
carry `not null`/`check` constraints on their own: `invest_anywhere = false`,
`invest_governorate_ids = array[project.governorate_id]`, `project_type_unsure = true`.

Money is taken from `app.project_quote_payload(project_id, null, trees, 'cash', null, null, false)`;
when `pricing` is not `ok` the request is still accepted, **without any money**. The figures are written
twice — to the offer columns (`offer_price_per_tree_millimes`, `offer_total_price_millimes`,
`offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes`) **and** to the shared columns
(`price_per_tree_millimes`, `total_price_millimes`) so the existing CRM list, filters and CSV keep
working. `supabase/tests/031_offer_intake.sql` §1 asserts that the two sets agree.

## A.6 When the person record is created versus updated (LEAD-04)

Both RPCs run the identical statement:

```sql
select id into v_status_id from public.lead_statuses
where stage = 'new' and is_active order by is_stage_default desc, sort_order limit 1;

insert into public.persons as ps
  (full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id,
   status_id, consent_at, last_request_at)
values (v_name, v_phone, coalesce(v_whatsapp, v_phone), v_email, v_gov, v_del,
        v_status_id, now(), now())
on conflict (phone_e164) do update
  set last_request_at = excluded.last_request_at, consent_at = excluded.consent_at
returning ps.id, (ps.xmax = 0) into v_person_id, v_inserted;
```

* **The phone number is the person's identity.** `persons.phone_e164` is `unique` with the check
  `^\+[1-9][0-9]{6,14}$`.
* **Created** when no person holds that phone: full name, WhatsApp, e-mail, governorate, delegation,
  status and both timestamps are written.
* **Updated** when the phone already exists: **only `last_request_at` and `consent_at`**. The name,
  e-mail, WhatsApp and governorate of an existing person are **never overwritten from the public form**.
  `supabase/tests/001_interest_intake.sql` asserts this literally: after a second request under the name
  «شخص آخر», `persons.full_name` is still «محمد التونسي».
* `v_inserted` (`xmax = 0`) drives two things: the duplicate flag (A.9) and the optional auto-assignment.
* The status of an existing person is **not** reset to «جديد» by a new request.
* Nothing in the codebase ever writes `persons.profile_id`; no visitor account is created by either
  intake.

**Auto-assignment (LEAD-12)** — identical in both RPCs, and only for a newly inserted person:

```sql
if v_inserted and app.setting_text('crm.auto_assign_mode','manual') = 'round_robin' then
  -- the active `commercial` whose last person_assignments row is oldest (nulls first), tie-broken by
  -- user_roles.granted_at; then update persons.assigned_to and insert person_assignments
  --   (person_id, null, v_assignee, 'auto:round_robin')
```

`crm.auto_assign_mode` is seeded `'manual'` in `0004_seed_configuration.sql`, so by default nothing is
auto-assigned.

## A.7 How temporary data is carried

| Store | Key | Written by | Contents | Cleared |
|---|---|---|---|---|
| URL query string | — | `/start` (`window.history.replaceState` on every answer) and `calculatorQuery()` | every calculator answer + `visit` | never; it is the transport to `/register` and back («بدّل اختياراتك» links to `/start?<query>`) |
| `localStorage` | `agrized:register-draft-v4` | `RegisterWizard` on every `form` change | the whole `FormState` **minus `consent`** | on a successful submit; also `agrized:register-draft` and `…-v3` are deleted on mount, and `…-v3` is read once as a fallback |
| `sessionStorage` | `agrized:source` | `SourceCapture` (`src/components/site/source-capture.tsx`) on the first page of the visit | `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `ref` (each ≤150 chars), `referrer` (≤300, only when cross-origin), `landing_path` | never; written once per tab |
| React state | — | `RegisterWizard` / `OfferInterestForm` | current answers, `returnStep`, honeypot | on navigation |

On mount the wizard runs `sanitize(...)`: it rebuilds the form field by field, so keys of questions the
form no longer asks are dropped, and it clears any option id or governorate id that is no longer in the
lists handed down from the server. `consent` is always reset to `false`. A `visit=1` link overrides a
saved `wantsVisit`. Every read and write is wrapped in `try/catch`.

The offer form keeps **no draft at all**.

## A.8 The request number

Both RPCs build it the same way:

```sql
v_year := to_char(now() at time zone 'Africa/Tunis', 'YYYY');
v_request_no := app.setting_text('request_no.prefix','AGZ') || '-' || v_year || '-'
             || lpad(app.next_number('interest_request:' || v_year)::text, 6, '0');
```

* `request_no.prefix` is a setting seeded `'AGZ'` (`0004`, label «بادئة رقم المطلب», description
  «مثال: AGZ-2026-000123»), so the prefix is editable from the Back Office.
* The year is the **Africa/Tunis** year.
* `app.next_number(scope)` (`0002_reference_and_crm.sql`) is *not* a sequence; it is
  `insert into app.counters (scope, value) values (scope, 1) on conflict (scope) do update set value = c.value + 1 returning value`,
  over the table `app.counters (scope text primary key, value bigint)`. It is `security definer` and
  revoked from `public, anon, authenticated`.
* The counter scope is `'interest_request:<year>'` — **shared by both intakes**, so calculator and offer
  requests draw from one series and the numbers interleave. The counter restarts at 1 each calendar year.
* Format therefore: `AGZ-2026-000027`. `supabase/tests/001_interest_intake.sql` asserts
  `'^AGZ-' || <current Tunis year> || '-[0-9]{6}$'` and that numbers increase.
* `interest_requests.request_no` is `text not null unique`.

## A.9 Duplicate handling

* `interest_requests.is_duplicate boolean not null default false` is set to `not v_inserted` — i.e. **true
  whenever the phone number already had a person record**, in both intakes.
* Nothing is blocked or merged: the second request is inserted normally, under the same `person_id`.
* Consequences elsewhere: `million_progress()` sums `tree_count_min` only `where not r.is_duplicate` and
  counts `requests` the same way; `crm_search_requests` computes `trees_total` as
  `sum(tree_count_min) filter (where not is_duplicate)`; the leads list shows a «مكرّر» chip; the CSV
  writes «نعم»; the filter `duplicates_only=1` keeps only duplicates; `crm_demand_stats` reports a
  `duplicates` figure shown on the dashboard as «منها مكرّرة».
* There is **no** de-duplication on name or e-mail, and no cross-check between the two intakes beyond the
  shared phone key.

## A.10 Anti-abuse

| Mechanism | Where | Rule |
|---|---|---|
| Honeypot `website` | both client forms + both Server Actions | a non-empty value returns `intakeErrorMessage(null)` = «تعذّر إرسال الطلب. تحقق من اتصالك وحاول مرة أخرى.» and never reaches the database |
| IP throttle | `app.check_throttle('interest:ip', ip_hash, interval '1 hour', app.setting_int('antispam.max_requests_per_ip_per_hour', 10))` | more than 10 per hour per hashed IP → `rate_limited`; the helper also inserts a row into `app.submission_throttle` |
| Phone throttle | inline `select count(*) from public.interest_requests where phone_e164 = v_phone and created_at > now() - interval '1 day'` | `>= app.setting_int('antispam.max_requests_per_phone_per_day', 3)` → `rate_limited`; counts **both** intakes |
| IP hashing | `hashIp()` in `src/lib/request-context.ts` | `sha256(`​`${IP_HASH_SALT}:${ip}`​`)`; raw IPs are never stored. Throws when `IP_HASH_SALT` is missing |
| Source whitelist | `app.clean_source(jsonb)` | keeps only `utm_source` (100), `utm_medium` (100), `utm_campaign` (150), `utm_content` (150), `ref` (100), `referrer` (300), `landing_path` (300); `jsonb_strip_nulls`. Test 001 asserts an injected key is dropped |
| Audit | `auditHeaders()` forwards `x-client-ip` (≤64) and `x-client-ua` (ASCII-filtered, ≤300) to Supabase for `app.write_audit` | informational only, never used for access control |

Both throttles run **after** all field validation and **before** the person upsert.

## A.11 Errors: code → message → what the UI does

`src/lib/errors.ts` holds the single Arabic message map; `intakeErrorMessage(code)` falls back to
«تعذّر إرسال الطلب. تحقق من اتصالك وحاول مرة أخرى.», and `isKnownIntakeError(code)` decides whether the
Server Action logs the failure with `console.error`.

The wizard routes a failure to one of three places:

| Database error | Arabic message (verbatim) | Wizard reaction |
|---|---|---|
| `invalid_full_name` | اكتب الاسم واللقب كاملين. | reopen step 1 |
| `invalid_phone` | رقم الهاتف غير صحيح. اكتب 8 أرقام، مثال: 98 123 456. | step 1 |
| `phone_not_tunisian` | نقبل حالياً الأرقام التونسية فقط. اكتب رقماً يبدأ بـ ‎+216‎ أو من 8 أرقام. | step 1 |
| `invalid_whatsapp` | رقم WhatsApp غير صحيح. اكتب 8 أرقام، أو فعّل «نفس رقم الهاتف». | step 1 |
| `invalid_email` | البريد الإلكتروني غير صحيح. مثال: nom@exemple.tn | step 1 |
| `invalid_governorate` | اختر ولايتك من القائمة. | step 1 |
| `invalid_delegation` | اختر المعتمدية من القائمة. | step 1 |
| `invest_location_required` | اختر ولاية واحدة على الأقل، أو «المكان غير مهم». | step 2 |
| `invalid_invest_governorate` | إحدى الولايات المختارة لم تعد متاحة. أعد الاختيار. | step 2 |
| `invalid_goal` | اختر هدفك من القائمة. | step 3 |
| `invalid_contact_time` | اختر الوقت المفضل من القائمة. | step 5 |
| `contact_channel_required` | اختر كيف تحب نتصلوا بيك. | step 5 |
| `consent_required` | لإرسال الطلب، وافق على التواصل ومعالجة معطياتك. | step 6 |
| `invalid_tree_choice` | اختر عدد الزيتونات من القائمة. | **calculator** banner + link «بدّل اختياراتك» → `/start?<query>` |
| `invalid_tree_custom` | اكتب عدد الزيتونات بالأرقام، ضمن الحدود المسموح بها. | calculator |
| `invalid_spacing` | اختر المساحة لكل زيتونة من القائمة، أو اتركها بلا اختيار. | calculator |
| `invalid_payment_mode` | اختر طريقة الدفع: بالحاضر أو بالتقسيط. | calculator |
| `invalid_down_payment_percent` | نسبة التسبقة اللي اخترتها ما عادتش متاحة. ارجع للحاسبة واختر نسبة أخرى. | calculator |
| `down_payment_percent_required` | نسبة التسبقة ناقصة. ارجع للحاسبة واختر نسبة التسبقة، أو اختر الدفع بالحاضر. | calculator |
| `invalid_duration` | اختر مدة الدفع من القائمة. | calculator |
| `duration_required` | مدة الدفع ناقصة. ارجع للحاسبة واختر مدة الدفع، أو اختر الدفع بالحاضر. | calculator |
| `invalid_scenario` / `single_scenario_only` / `scenario_required` / `invalid_project_type` | أحد الاختيارات لم يعد متاحاً… / اختر خياراً واحداً فقط. / اختر شنوّة تحب تملك. / أحد أنواع المشاريع المختارة لم يعد متاحاً. | calculator |
| `rate_limited` | وصلنا عدد كبير من الطلبات من نفس المصدر. حاول مرة أخرى بعد ساعة. | plain banner, no step change |
| `offer_not_available` | هذا العرض ما عادش متوفّر. شوف بقية العروض أو سجّل مطلبك من الحاسبة. | offer form only |
| `invalid_offer_trees` | اكتب عدد الزيتونات بالأرقام، من زيتونة وحدة إلى العدد المتوفّر في العرض. | offer form only |

Two more paths: a zod failure returns «بعض المعلومات ناقصة أو غير صحيحة. راجع الخطوات وحاول مجدداً.»
(offer form: «… راجع المعطيات وحاول مجدداً.»), and a thrown Server Action returns, from the client's own
`catch`, «تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.». A successful RPC that somehow
returns no `request_no` is logged and answered with the generic fallback.

## A.12 Submission behaviour

**Wizard.** `noValidate` form; the submit button reads «التالي» on steps 1-5 and «أرسل الطلب» on step 6
(«جارٍ الإرسال…» while `useTransition` is pending, button disabled). `goNext()` validates only the current
step; `submit()` re-validates **all six** steps in order and jumps to the first one that fails, then
checks `recap.error` before calling the action. Screens that one click completes advance by themselves
after `AUTO_NEXT_MS = 220`ms (`advanceWith`) — the governorate «المكان غير مهم» box and the goal radio;
a multi-select list still waits for «التالي». The review screen's «تعديل» buttons set `returnStep`, so the
next move returns to step 6. Focus and scroll: the `<h1>` is focused and the window scrolled to top on
every step change; `focusFirstError()` focuses `[aria-invalid="true"], [data-error-anchor]` on a failed
step. A `<Progress>` bar renders «الخطوة N من 6» with `role="progressbar"`.

**Offer form.** Single screen, one `validate()` pass, `useTransition`, button label from
`offers.submit_label` and «جارٍ الإرسال…» while pending.

## A.13 What the success screen shows

**Calculator (`Success` in `register-wizard.tsx`)** — replaces the whole wizard:

1. a green check mark in a circle;
2. `<h1>` **«تم تسجيل مطلبك»**;
3. `register.success_welcome_title` — «مرحباً بيك، زيتونتك بدات» (set by `0039_message_asset.sql`);
4. `register.success_welcome_text` — «مطلبك وصلنا وتسجّل باسمك. من هنا للأمام نرافقوك: نراجعو اختياراتك،
   نتصلو بيك، ونعرضو عليك المشروع اللي يناسبك.»;
5. «رقم مطلبك» and the number itself, `dir="ltr"`, plus a **«نسخ الرقم»** button that writes it to the
   clipboard and then reads «تم نسخ الرقم»;
6. a recap list of the calculator rows, in the fixed order
   `SUCCESS_ROWS = ["trees", "area_per_tree", "total_area", "payment", "total_price"]` — only the rows the
   server actually produced, so the total price appears only while prices were open to this visitor;
7. «احتفظ بهذا الرقم. سيتصل بك فريق AgriZed **عبر {channel}** (**{وقت}**) عند دراسة طلبك.» built from the
   chosen channel and contact-time labels;
8. `register.success_note` — «التسجيل مجاني ولا يلزمك بالشراء.»;
9. `register.success_motivation` — «كل زيتونة تبدا بيها اليوم تولّي أصل باسمك يكبر مع الوقت، وإحنا نتلهاو
   بالمتابعة.»;
10. two buttons: `register.success_progress_label` «شوف وين وصل المشروع» → `/#million`, and «العودة
    للصفحة الرئيسية» → `/`;
11. **the current offers** under `register.offers_title` «عروضنا الحالية» with `register.offers_text`
    (both from `0050_offer_copy.sql`). The list is built **server-side** in
    `src/app/(public)/register/page.tsx` from `getPublicProjects(publicMode(offersAccess))`, filtered to
    `project.offered && project.on_tree_pricing && (project.tree_count ?? 0) > 0`, and each card carries
    the cover image, name, governorate name, «عدد الزيتونات», «مساحة كل زيتونة» and «ابتداءً من … للزيتونة».
    The array is empty when the `projects` module is closed to this visitor.

The draft in `localStorage` is removed at this point.

**Offer form success** — replaces the form section in place: `offers.success_title`
«وصلنا طلبك على هذا العرض», `offers.success_text`, «رقم مطلبك» + the number, and the line
«طلبك على «{اسم العرض}» بـ {N} زيتونة.». No copy button, no offers list.

## A.14 Side effects of a successful submission

1. **Row** in `public.interest_requests` (see Part B).
2. **Person** created or touched in `public.persons` (A.6).
3. **Status history**: the trigger `persons_status_history` (`app.track_person_status`) writes a
   `person_status_history` row on insert, with `changed_by = auth.uid()` — which is **null** for a
   service-role intake. The person detail page renders such rows as «النظام».
4. **Audit**: the trigger `interest_requests_audit` (`app.audit_row_change`) writes to `public.audit_logs`
   on every insert/update/delete; test 001 asserts the intake row is audited. `persons_audit` does the same
   for persons.
5. **Message queue**: `app.enqueue_message('lead.confirmation', v_phone, vars, 'interest_requests', v_request_id)`
   renders the active template into `public.notification_outbox` with `status = 'pending'`. The seeded SMS
   body (`0004`) is
   «AgriZed: شكراً {name}، سجّلنا مطلبك رقم {request_no}. سنتصل بك قريباً. التسجيل مجاني ولا يمثل التزاماً بالشراء.»
   The calculator intake passes `name` (first word of the full name), `request_no`, `trees`,
   `total_area_m2`, `total_price_millimes`; the offer intake passes the same plus `offer` (the project
   name). `app.enqueue_message` **returns silently when the template row is missing or inactive**.
6. **Auto-assignment**, when enabled (A.6).

---

# PART B — CURRENT IMPLEMENTATION: THE REQUEST / LEAD MODEL

## B.1 Does a request have a status of its own?

**No.** `public.interest_requests` has **no status, stage or state column of any kind**. The only
lifecycle state is `public.persons.status_id → public.lead_statuses(id)`. A person with three requests has
one status covering all three.

The illusion of a per-request status comes from the view `public.crm_requests`, which joins the person's
status onto every request row:

```sql
create view public.crm_requests with (security_invoker = on) as
select r.*, p.status_id, s.stage, s.label_ar as status_label_ar,
       p.assigned_to, pr.full_name as assigned_to_name, p.archived_at as person_archived_at
from public.interest_requests r
join public.persons p on p.id = r.person_id
join public.lead_statuses s on s.id = p.status_id
left join public.profiles pr on pr.id = p.assigned_to;
```

(last created in `0032_intake_pricing.sql`). The leads table therefore shows the same status pill on
every request of the same person, and `updateStatus` in
`src/app/admin/(panel)/leads/[personId]/actions.ts` writes to `persons`, not to a request.

The **only** request-level classification is `request_kind` (`'calculator' | 'offer'`), added by `0049`,
and the boolean `is_duplicate`.

## B.2 The statuses that exist in the data

`public.lead_stage` is an enum of exactly **ten** values (`0002_reference_and_crm.sql`):

`new`, `contacting`, `qualified`, `proposed`, `visit`, `reserved`, `contracting`, `owner`, `paused`, `closed`.

`public.lead_statuses` is the editable label layer; `0004_seed_configuration.sql` seeds **twelve** rows and
no later migration adds, renames or deactivates any of them:

| stage | `label_ar` | `label_fr` | `sort_order` | `is_stage_default` |
|---|---|---|---|---|
| `new` | جديد | Nouveau | 10 | ✔ |
| `contacting` | قيد الاتصال | En cours de contact | 20 | ✔ |
| `qualified` | مؤهَّل | Qualifié | 30 | ✔ |
| `qualified` | في انتظار مشروع مطابق | En attente de projet | 40 | — |
| `proposed` | تم اقتراح مشروع | Projet proposé | 50 | ✔ |
| `visit` | زيارة مبرمجة | Visite planifiée | 60 | ✔ |
| `visit` | تمت الزيارة | Visite effectuée | 70 | — |
| `reserved` | حجز | Réservé | 80 | ✔ |
| `contracting` | في طور التعاقد | En contractualisation | 90 | ✔ |
| `owner` | مالك | Propriétaire | 100 | ✔ |
| `paused` | غير مهتم حالياً | Pas intéressé pour le moment | 110 | ✔ |
| `closed` | مغلق | Clôturé | 120 | ✔ |

Table shape: `id uuid pk`, `stage public.lead_stage not null`, `label_ar text not null`, `label_fr text`,
`sort_order integer not null default 0`, `is_active boolean not null default true`,
`is_stage_default boolean not null default false`, `updated_at`, `updated_by`.
A partial unique index `lead_statuses_stage_default_idx on (stage) where is_stage_default` allows exactly
one default per stage. `STAGE_LABELS` and `STAGE_TONES` in `src/lib/crm.ts` map each of the ten stages to a
fallback Arabic word and a chip colour.

**There is no status transition machine.** Any active status can be selected from the dropdown on the
person page; nothing in the database or the Server Action restricts the order, and no code moves a status
automatically at any point. The seeded order above is presentational (`sort_order`).

## B.3 `public.interest_requests` — every column

Base table from `0002_reference_and_crm.sql`, then `0009`, `0010`, `0016`, `0020`, `0030`, `0032`, `0049`.
"Filled by" — **C** = `submit_interest_request`, **O** = `submit_offer_request`, **—** = never written by
any code in the repository.

| Column | Type / default | Filled by | Meaning |
|---|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | C O | |
| `request_no` | `text not null unique` | C O | `AGZ-YYYY-NNNNNN` (A.8) |
| `person_id` | `uuid not null → persons(id)` | C O | |
| `full_name` | `text not null` | C O | as typed on this request, kept even if the person's name differs |
| `phone_e164` | `text not null` | C O | |
| `whatsapp_e164` | `text` | C O | `coalesce(whatsapp, phone)` |
| `email` | `text` | C O | lower-cased |
| `residence_governorate_id` | `smallint not null → governorates` | C O | |
| `residence_delegation_id` | `integer → delegations` (`not null` dropped by `0009`) | — | accepted by the RPC, never sent by the web forms |
| `invest_anywhere` | `boolean not null default false` | C O | O writes `false` |
| `invest_governorate_ids` | `smallint[] not null default '{}'` | C O | O writes `array[project.governorate_id]` |
| `project_type_unsure` | `boolean not null default false` | C O | O writes `true` |
| `project_type_ids` | `uuid[] not null default '{}'` | C | derived from the chosen scenario |
| `scenario_ids` / `scenario_labels` | `uuid[]` / `text[]`, both `not null default '{}'` (0010) | C | the «شنوّة تحب تملك» answer + its label snapshot |
| `plantation_systems` / `production_statuses` | `text[] not null default '{}'` (0010) | C | derived from the scenario |
| `tree_count_option_id` | `uuid → option_items` (0016) | C | null for a typed number and for offers |
| `tree_count_code` | `text` (0016) | C O | list code, `'custom'`, or `'offer'` |
| `tree_count_label_ar` | `text` (0016) | C O | e.g. «100 زيتونة», «37 زيتونة» |
| `tree_count_min` / `tree_count_max` | `integer` (0016) | C O | the counter sums `tree_count_min`, so it can never overstate demand |
| `desired_area_option_id`, `desired_area_label_ar`, `desired_area_min_m2`, `desired_area_max_m2` | (0010) | — | retired question (Q-7); kept for old rows |
| `priority_option_id`, `priority_code`, `priority_label_ar` | (0010) | — | retired question |
| `goal_option_id` | `uuid → option_items` (`not null` dropped by 0049) | C | |
| `goal_code`, `goal_label_ar` | `text` (`goal_label_ar` `not null` dropped by 0049) | C | |
| `down_payment_option_id`, `down_payment_label_ar`, `down_payment_min_millimes`, `down_payment_max_millimes` | (`not null` dropped by 0032) | — | retired amount list; a legacy caller sending one is still validated |
| `installment_option_id`, `installment_label_ar`, `installment_min_millimes`, `installment_max_millimes` | (`not null` dropped by 0030) | — | retired monthly-amount question (report v3 §6) |
| `duration_option_id`, `duration_label_ar`, `duration_months` | (0030) | C | payment duration in months |
| `budget_option_id`, `budget_label_ar`, `budget_min_millimes`, `budget_max_millimes` | (0030) | — | list seeded empty, question hidden |
| `wants_visit` | `boolean` (0030) | C | true / false / null = no answer |
| `wants_bank_financing` | `boolean` (0030) | C | same |
| `spacing_class_id` | `uuid → tree_spacing_classes` (0032) | C O | |
| `spacing_label_ar` | `text` (0032) | C O | |
| `area_per_tree_m2` | `numeric(10,2)` (0032) | C O | |
| `total_area_m2` | `numeric(14,2)` (0032) | C O | `area_per_tree × trees` |
| `payment_mode` | `text check in ('cash','installments')` (0032) | C | O leaves it null although it quotes cash |
| `price_per_tree_millimes`, `total_price_millimes` | `bigint` (0032) | C O | only while the `pricing` module is open |
| `down_payment_percent_option_id`, `down_payment_percent` | `uuid`, `numeric(5,2)` (0032) | C | |
| `down_payment_amount_millimes`, `total_financed_millimes`, `monthly_millimes` | `bigint` (0032) | C | the plan as shown on `/start` |
| `contact_channel` | `public.contact_channel not null` (`phone`/`whatsapp`/`both`) | C O | |
| `contact_time_option_id`, `contact_time_label_ar` | | C O | |
| `is_duplicate` | `boolean not null default false` | C O | `not v_inserted` |
| `source` | `jsonb not null default '{}'` | C O | whitelisted by `app.clean_source` |
| `consent_text` | `text not null` | C O | the exact sentence the visitor agreed to |
| `created_at` | `timestamptz not null default now()` | C O | **the only timestamp on the table** |
| `parcel_id` | `uuid → parcels on delete set null` (0020) | — | |
| `project_id` | `uuid → projects on delete set null` (0020) | O | |
| `project_code`, `project_name` | `text` (0020) | O | |
| `parcel_code`, `parcel_area_m2`, `parcel_property_type`, `parcel_plantation_system`, `parcel_olive_tree_count`, `parcel_production_status`, `parcel_cash_price_millimes`, `parcel_plan_months`, `parcel_plan_total_millimes`, `parcel_plan_last_millimes`, `parcel_captured_at` | (0020) | — | **no intake has ever written any of them** (stated verbatim in the header of `0049`) |
| `request_kind` | `text not null default 'calculator'` (0049) | C (by default) O (`'offer'`) | |
| `offer_trees` | `integer` (0049) | O | |
| `offer_price_per_tree_millimes`, `offer_total_price_millimes` | `bigint` (0049) | O | |
| `offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes` | `bigint` (0049) | O | yearly care, never part of the price |

**There is no `updated_at`, no `status`, no `closed_at`, no soft-delete column on `interest_requests`.**
The generated types in `src/lib/supabase/database.types.ts` (`interest_requests.Row`) match this list
exactly.

### Constraints

| Name | Rule | Added |
|---|---|---|
| `interest_requests_location_chk` | `invest_anywhere or cardinality(invest_governorate_ids) > 0` | 0002 |
| `interest_requests_type_chk` | `project_type_unsure or cardinality(project_type_ids) > 0` | 0002 |
| `interest_requests_kind_check` | `request_kind in ('calculator','offer')` | 0049 |
| `interest_requests_offer_trees_check` | `offer_trees is null or offer_trees > 0` | 0049 |
| `interest_requests_goal_check` | `request_kind <> 'calculator' or (goal_option_id is not null and goal_label_ar is not null)` | 0049 |
| `payment_mode` inline check | `in ('cash','installments')` | 0032 |

`supabase/tests/031_offer_intake.sql` §5 proves the last two by attempting raw inserts: a `calculator` row
without a goal and a row with `request_kind = 'whatever'` both raise `check_violation`.

### Indexes

`interest_requests_person_idx (person_id, created_at desc)`, `…_created_idx (created_at desc)`,
`…_residence_idx (residence_governorate_id, residence_delegation_id)`,
`…_invest_govs_idx gin (invest_governorate_ids)`, `…_types_idx gin (project_type_ids)`,
`…_down_idx (down_payment_min_millimes)`, `…_installment_idx (installment_min_millimes)`,
`…_phone_idx (phone_e164, created_at desc)`, `…_scenarios_idx gin (scenario_ids)`,
`…_plantation_idx gin (plantation_systems)`, `…_area_idx (desired_area_min_m2, desired_area_max_m2)`,
`…_priority_idx (priority_code)`, `…_trees_idx (tree_count_min, tree_count_max)`,
`…_parcel_idx (parcel_id) where parcel_id is not null`, `…_duration_idx (duration_months)`,
`…_spacing_idx (spacing_class_id) where spacing_class_id is not null`,
`…_project_idx (project_id) where project_id is not null`.

## B.4 `public.persons` — the lead record

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid pk` | |
| `full_name` | `text not null` | written once, by the first request |
| `phone_e164` | `text not null unique check (~ '^\+[1-9][0-9]{6,14}$')` | the identity key |
| `whatsapp_e164` | `text check (same regex)` | |
| `email` | `text` | |
| `governorate_id` | `smallint → governorates` | |
| `delegation_id` | `integer → delegations` | always null from the web |
| `status_id` | `uuid not null → lead_statuses` | **the lifecycle state** |
| `assigned_to` | `uuid → profiles` | the `commercial` who owns the file |
| `profile_id` | `uuid unique → profiles` | never written anywhere in the repository |
| `consent_at` | `timestamptz` | refreshed on every request |
| `last_request_at` | `timestamptz` | refreshed on every request |
| `created_at`, `updated_at` | `timestamptz not null default now()` | `updated_at` maintained by the `persons_stamp` trigger |
| `archived_at` | `timestamptz` | exposed by `crm_requests` as `person_archived_at`; no TypeScript code reads or writes it |

Indexes: `persons_assigned_idx`, `persons_status_idx`, `persons_created_idx (created_at desc)`,
`persons_name_trgm_idx gin (full_name gin_trgm_ops)`.

## B.5 The surrounding lead tables

| Table | Columns | Written by |
|---|---|---|
| `person_status_history` | `id, person_id, from_status_id, to_status_id, changed_by, created_at` | trigger `persons_status_history` on insert or update of `persons.status_id` |
| `contact_attempts` | `id, person_id, channel ('phone','whatsapp','sms','other'), outcome public.contact_outcome, note (≤5000), next_follow_up_at, created_by (default auth.uid()), created_at` | `addContactAttempt` |
| `person_notes` | `id, person_id, body (1..5000), created_by, created_at` | `addNote` |
| `person_assignments` | `id, person_id, from_user, to_user, reason, created_by, created_at` | `public.admin_assign_persons` and the auto-assign block (`reason = 'auto:round_robin'`) |
| `notification_outbox` | `id, channel ('sms','whatsapp'), to_phone_e164, template_key, body, related_entity, related_id, status public.notification_status, attempts, last_error, provider, provider_message_id, scheduled_at, sent_at, created_at` | `app.enqueue_message` |

`public.contact_outcome` enum: `answered` «تم الرد», `no_answer` «لم يرد», `wrong_number` «رقم خاطئ»,
`callback` «طلب إعادة الاتصال», `not_interested` «غير مهتم حالياً» (labels in `src/lib/crm.ts`).
`public.notification_status` enum: `pending`, `sending`, `sent`, `failed`, `skipped`.

## B.6 Relations

```
governorates ─┐
delegations  ─┤
option_items ─┤ (goal, contact_time, tree_count, duration, down_payment_percent,
              │  and the retired desired_area / priority / down_payment /
              │  monthly_installment / budget)
ownership_scenarios ─┤
tree_spacing_classes ┤
projects ────────────┴──▶ interest_requests ──▶ persons ──▶ lead_statuses ──▶ lead_stage (enum)
                                │                  │
                                │                  ├──▶ profiles (assigned_to, profile_id)
                                │                  ├──▶ person_status_history
                                │                  ├──▶ contact_attempts
                                │                  ├──▶ person_notes
                                │                  └──▶ person_assignments
                                └──▶ notification_outbox (related_entity='interest_requests')
                                     audit_logs (entity='interest_requests')
```

`parcels` is referenced by `interest_requests.parcel_id` but never populated.

## B.7 The full lifecycle of a request

1. **Creation.** A visitor submits one of the two public forms. The Server Action gates on the feature
   flag, validates, normalises the phone, hashes the IP and calls the service-role RPC. The RPC validates
   again, throttles, upserts the person, may auto-assign, recomputes the money, draws a request number and
   inserts one `interest_requests` row. Everything is one transaction.
2. **First state.** The person lands on the `new` stage — the active `lead_statuses` row with
   `stage = 'new'`, preferring `is_stage_default`, then lowest `sort_order`; with the seed that is
   **«جديد»**. A `person_status_history` row is written by the trigger with `changed_by = null`.
   A request that lands on an already-known phone does **not** change that person's status.
3. **Confirmation.** A `lead.confirmation` row is queued in `notification_outbox` with `status='pending'`.
   No worker that sends it exists in this repository — `grep` finds no code that moves a row out of
   `pending`.
4. **Triage in the Back Office.** `/admin/leads` (`src/app/admin/(panel)/leads/page.tsx`) lists demands —
   or one row per person in «شخص في كل سطر» mode (`people=1`) — via
   `public.crm_search_requests(p jsonb, p_limit, p_offset)`, 50 per page. The tabs «كل الطلبات» ·
   «عروض حقيقية» · «محاكي (تقديري)» filter on `request_kind`. The dashboard
   (`src/app/admin/(panel)/page.tsx`) surfaces two lead queues: «ملفات في «جديد»» (count of `persons`
   with the default `new` status, linking to `/admin/leads?status_id=…&people=1`) and «ملفات بلا مسؤول»
   (`assigned_to=none`), plus «متابعاتي المستحقة» built from `contact_attempts.next_follow_up_at`.
5. **Assignment.** `public.admin_assign_persons(uuid[], uuid, text)` — `security definer`, raises
   `forbidden` (`42501`) unless `app.is_admin()`, and `target_not_active_commercial` when the target is
   not an active `commercial`. It skips persons already assigned to the target, updates
   `persons.assigned_to` and writes a `person_assignments` row per move, returning the count. It is
   called one-by-one from the person page (`assignPerson`) and in bulk from the list
   (`assignPersons`, batches of 500, cap 100 000 rows).
6. **Contact.** `addContactAttempt` inserts into `contact_attempts` (channel, outcome, optional note,
   optional `next_follow_up_at`, converted from a Tunis-local `datetime-local` string by
   `tunisLocalToIso`, i.e. `+01:00`, no DST). A «WhatsApp» button on the person page opens
   `https://wa.me/<digits>?text=…` with the `lead.whatsapp_first_contact` template rendered client-side —
   «مرحبا {name}، معاك {agent} من AgriZed. نتصل بيك بخصوص مطلبك رقم {request_no}. وقتاش يناسبك نحكيو؟»
   (`0042_million_leftovers.sql`). Nothing is sent by the server.
7. **Status moves.** `updateStatus` performs
   `supabase.from("persons").update({ status_id }).eq("id", personId).select("id")`; an empty result means
   RLS refused, answered with «لا تملك صلاحية تعديل هذا الملف.». Every move is recorded by the trigger and
   rendered in the «سجل الملف» timeline, merged with notes, attempts and assignments and sorted by
   timestamp descending.
8. **Notes.** `addNote` inserts into `person_notes` (1..5000 chars).
9. **End states.** `owner` «مالك», `paused` «غير مهتم حالياً» and `closed` «مغلق» are ordinary statuses
   chosen from the same dropdown. Nothing in the code treats them specially — no archiving, no locking,
   no deletion. There is **no delete path for a request or a person** anywhere in the application:
   `revoke insert, update, delete on public.interest_requests from authenticated` and
   `revoke insert, delete on public.persons from authenticated`.

## B.8 Who may read and write (RLS)

| Object | Rule |
|---|---|
| `persons` SELECT | `app.has_any_role(['admin','super_admin','finance','legal'])` **or** (`assigned_to = auth.uid()` **and** `app.has_role('commercial')`) |
| `persons` UPDATE | `app.is_admin()` **or** own-assigned commercial; column grant limited to `full_name, whatsapp_e164, email, governorate_id, delegation_id, status_id` |
| `interest_requests` SELECT | `app.can_see_person(person_id)` — same rule as above. INSERT/UPDATE/DELETE revoked from `authenticated` |
| `person_status_history`, `person_assignments` SELECT | `app.can_see_person(person_id)`; writes revoked |
| `contact_attempts`, `person_notes` SELECT | `app.can_see_person(person_id)` |
| `contact_attempts`, `person_notes` INSERT | `created_by = auth.uid() and app.can_edit_person(person_id)` where `can_edit_person` = admin **or** own-assigned commercial (`0008_crm_edit_rights.sql` — Finance and Legal read but never write) |
| `crm_requests` | `security_invoker = on`; `revoke all … from anon` |
| `crm_search_requests` | `stable security invoker`, revoked from `public, anon`, granted to `authenticated` |
| `lead_statuses` SELECT | staff only (`app.is_staff()`); insert/update admin only |
| CSV export | additionally gated in the route handler: `hasRole(session, ADMIN_ROLES)` else `403`, then logged with `log_action('crm.export', 'interest_requests', {filters, rows})` |

Server Actions repeat the check: `requireStaff(EDIT_ROLES)` with
`EDIT_ROLES = ['commercial','admin','super_admin']` for status/attempt/note,
`requireStaff(ADMIN_ROLES)` for assignment, `requireStaff(CRM_READ_ROLES)` for the pages.

## B.9 Reading surfaces built on the request

| Surface | Function / file | What it returns |
|---|---|---|
| Leads list & bulk assign & CSV | `public.crm_search_requests(jsonb, int, int)` (0032) | 55 named columns + `total_count` (rows being paged) + `requests_total`, `persons_total`, `trees_total` for the **whole filtered set**; `trees_total` excludes duplicates. `people=true` returns one row per person (`person_rank = 1`, latest demand). Ordering `created_at desc, id desc`; `limit least(greatest(p_limit,1),500)` |
| Search filters | same | `q` (name / request_no ILIKE, or ≥3 digits against the phone), residence governorate & delegation, invest governorate (+`include_anywhere`), project type (+`include_unsure`), plantation system, production status, priority code, desired-area overlap, **tree-count overlap** (+`include_trees_any`), down/installment ranges, `duration_min`/`duration_max` in months, `wants_visit`, `wants_bank_financing`, `spacing_class_id`, `payment_mode`, exact `down_payment_percent`, `goal_code`, `stage`, `status_id`, `assigned_to` (`'none'` = unassigned), `from`/`to` dates read in Africa/Tunis, `source` (`utm_source`, default `'direct'`), `duplicates_only` |
| Person file | `src/app/admin/(panel)/leads/[personId]/page.tsx` | `persons` + `interest_requests.select("*")` + attempts + notes + status history + assignments, merged into one timeline; every demand is an anchored card `#request-<id>`, offer cards on a green surface, calculator cards on `card-estimate` with the line «محاكاة تقديرية من الموقع: أرقام تتبع اختيارات الحريف، موش عرض عقاري.» and a «إجابات قديمة» block for retired answers |
| Analytics | `public.crm_demand_stats(from, to, people)` (0029/0030/0032) | counts by tree-count band, governorate, duration, goal, spacing class, payment mode, down-payment percentage and total-price band; `today`, `last_7_days`, `anywhere`, `unsure_type`, `duplicates` |
| Public counter | `public.million_progress()` (0025) | `trees_requested = sum(tree_count_min) where not is_duplicate`, `participants = count(distinct person_id)`, `requests = count(*) where not is_duplicate`, plus parcel-derived reserved/contracted/planted |

---

# OBSERVATIONS

These are factual remarks about the code as it stands. They are not proposals.

1. **The CRM cannot see an offer request through its own view.** `public.crm_requests` is
   `select r.*`, but a view freezes its column list at creation time and it was last created in
   `0032_intake_pricing.sql` — before `0049` added `request_kind`, `offer_trees` and the four offer money
   columns. `crm_search_requests` names its columns one by one and was defined in the same file. So the
   leads list, the bulk-assign scope and the CSV get **none** of the 0049 columns from the database.
   `src/app/admin/(panel)/leads/offer-snapshot.ts` compensates by re-reading
   `interest_requests` directly for the ids already on screen (chunks of 100). The corrective migration
   exists but is **not applied and not numbered**: `supabase/pending/bb_crm_offer_columns.sql`, with
   `supabase/pending/tests/bb_crm_offer_columns.sql`.
2. **Consequence: the `request_kind` tab filter is a page-local filter.** `src/app/admin/(panel)/leads/page.tsx`
   computes `kindServerFiltered` and, when false, filters only the 50 rows it holds, then renders a warning
   panel saying the counts above and the CSV still include the other intake. `BulkAssignBar` receives
   `matchingIsUpperBound={!kindServerFiltered}`. The CSV route applies the same filter per batch over every
   matching demand. `filtersToRpc` already forwards the `request_kind` key; today's function ignores unknown
   keys.
3. **Two dead link contracts point at `/register`.**
   `src/app/(public)/simulator/capacity-simulator.tsx` links to
   `` `/register?down=${downId}&installment=${installmentId}` ``. `readCalculatorChoices` reads none of
   those keys, so `/register` sees no tree count and immediately redirects to `/start`, carrying `down` and
   `installment` along, where they are also ignored.
   `interestHref()` in `src/lib/public-hrefs.ts` sets `parcel=<uuid>`; `/register` never reads it,
   `register/actions.ts` never sends a parcel, and `submit_interest_request` never writes
   `interest_requests.parcel_id`. The parcel page's «أنا مهتم بهذه القطعة» and «نحب نزور الأرض» CTAs
   therefore lose the parcel on the way.
4. **The 0020 parcel snapshot block is unreachable data.** Fifteen columns (`parcel_id` …
   `parcel_captured_at`) are declared, indexed and commented, and no intake has ever written them — the
   header of `0049_offer_intake.sql` states this outright.
5. **The retired-question columns are a large inert surface.** `desired_area_*`, `priority_*`,
   `down_payment_*` (amount), `installment_*` and `budget_*` — 17 columns — are still validated and
   snapshotted by the RPC for callers that send them, still filtered by `crm_search_requests`
   (`down_min`, `down_max`, `installment_min`, `installment_max`, `area_min`, `area_max`, `priority_code`)
   and still rendered as «إجابات قديمة», but no page collects them. `0032` deactivated their option lists
   rather than deleting them, deliberately (plan Q-7).
6. **Duplicated intake logic.** `submit_offer_request` reproduces, statement for statement, the identity
   validation, the two throttles, the `lead_statuses` lookup, the person upsert and the round-robin block
   of `submit_interest_request`. The same duplication exists in TypeScript between `register/actions.ts`
   and `offer-actions.ts` (phone normalisation, honeypot, `hashIp`, `auditHeaders`, error mapping).
7. **`payment_mode` is null for offer requests** even though `submit_offer_request` quotes
   `app.project_quote_payload(..., 'cash', ...)`. The leads table's «الفئة والسعر» cell therefore shows no
   payment word for an offer row, and the `payment_mode` filter never matches an offer request.
8. **The confirmation SMS has no sender.** `app.enqueue_message` writes `notification_outbox` rows with
   `status='pending'`; no code in this repository reads that table to send anything. It also returns
   silently when the template is missing or inactive, so a disabled `lead.confirmation` template makes the
   confirmation disappear without any error.
9. **Request numbers come from a row-locked counter, not a sequence.** `app.next_number` updates one row
   of `app.counters` per request, so concurrent submissions serialise on that row, and a transaction that
   fails after the call rolls the counter back. The scope `'interest_request:<year>'` is shared by both
   intakes.
10. **The throttle rows are transactional too.** `app.check_throttle` inserts into
    `app.submission_throttle` before the person upsert; if any later statement in the same RPC raises, that
    insert is rolled back with it, so only submissions that complete are counted against the hourly IP
    limit.
11. **`hashIp` throws when `IP_HASH_SALT` is unset**, inside the Server Action and before the RPC call.
    The thrown action is caught by the client component's `catch`, which shows the network-flavoured
    message «تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.».
12. **WhatsApp numbers bypass the Tunisian-only rule.** `lead.allow_international_phone` is applied to the
    main phone in both the client check and `app.assert_phone`, but the alternate WhatsApp number is parsed
    with `normalizePhone(value, true)` on the server action and validated in the database only against the
    generic `^\+[1-9][0-9]{6,14}$`.
13. **Two different Arabic label sets for the same enum.** The contact channel reads
    «مكالمة هاتفية» / «WhatsApp» / «الاثنين» on `/register`, «مكالمة» / «WhatsApp» / «الزوز» on the offer
    form, and «هاتف» / «WhatsApp» / «هاتف وWhatsApp» in the Back Office (`src/lib/crm.ts`). All three are
    hard-coded in TypeScript, not read from `settings`.
14. **Some validation messages are hard-coded in components** rather than taken from `src/lib/errors.ts` —
    e.g. `phoneError()` and `validateStep()` in `register-wizard.tsx`, and the whole `validate()` of
    `offer-interest-form.tsx`. The strings mostly match the `errors.ts` entries but are maintained twice
    (`phone_not_tunisian` differs: «… اكتب رقماً من 8 أرقام.» client-side vs
    «… اكتب رقماً يبدأ بـ ‎+216‎ أو من 8 أرقام.» server-side).
15. **`persons.archived_at` and `persons.profile_id` are inert.** `crm_requests` exposes
    `person_archived_at`; no TypeScript file reads either column, and nothing writes them.
16. **A request carries no lifecycle of its own**, so two requests from the same phone — for instance one
    calculator simulation and one offer request — cannot be in different states, and closing a file closes
    every request in it. The person page counts them apart («N على عروض حقيقية · M محاكاة تقديرية») but
    shows a single status pill in the header.
17. **The status dropdown lists every active status flat.** `lead_statuses` is ordered by `sort_order`;
    `stage` and `is_stage_default` are used only by the intake (to find `new`) and by `STAGE_TONES` for
    colour. No code prevents, for example, `مالك` → `جديد`.
18. **The wizard's auto-advance validates a state React has not committed**, which the code handles by
    passing the patched object into `validateStep` inside `advanceWith`; the 220 ms timer is cleared on
    «رجوع» but not on unmount.
19. **`register/page.tsx` fetches the whole public project list on every render** to build the
    success-screen offers, including for visitors who never reach the success screen, because the array is
    a prop of `RegisterWizard`.
20. **The `interest_form` flag is read three ways** for the same flow: `moduleAccess` on `/start` and
    `/register`, `flagState(...) === "public"` on the offer page (so an `internal` preview hides the offer
    form even for staff, unlike `/register`), and `flagState` again inside `submitInterest`.

---

# COULD NOT DETERMINE FROM CURRENT CODEBASE

* Whether `supabase/pending/bb_crm_offer_columns.sql` has been applied to the live database — the file
  itself says it is «Deliberately not applied and not numbered», and the repository holds no migration
  history dump. Could not determine from current codebase.
* Whether any external worker (outside this repository) drains `public.notification_outbox`.
  Could not determine from current codebase.
* Whether the seeded `lead_statuses` rows were later edited through the Back Office (the table is
  admin-editable and no migration changes them after `0004`). Could not determine from current codebase.
* The live values of `crm.auto_assign_mode`, `lead.allow_international_phone`,
  `antispam.max_requests_per_*`, `request_no.prefix` and the `interest_form` / `projects` / `pricing`
  flags — only their seeded defaults are in the repository. Could not determine from current codebase.
