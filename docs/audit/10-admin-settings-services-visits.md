## 10. ADMIN CONFIGURATOR SETTINGS, AGRIZED SERVICES AND VISITS

Sections 13, 15 and 16 of the audit. Everything below is read from the repository at the state of migrations
`0001` → `0050` and the current `src/`. Where a document and the code disagree, the code is reported and the
disagreement is named.

**Working-tree warning.** Files under `src/app/(public)/` were being edited by another process while this audit
was read. Nothing under `supabase/`, `src/lib/`, `src/components/` or `src/app/admin/` is affected. The public
files that were read looked syntactically complete; `src/app/(public)/projects/[code]/page.tsx` (511 lines) and
`src/app/(public)/start/page.tsx` (82 lines) both parse end-to-end and their described behaviour below is the
behaviour of the file as read. If they change again, only the *public rendering* paragraphs are at risk, not
the database or admin facts.

---

# 13. ADMIN CONFIGURATOR SETTINGS

## 13.1 CURRENT IMPLEMENTATION — where configuration lives

Configuration is spread over **nine tables**, not one:

| Table | What it holds | Who writes it | Reaches the public how |
|---|---|---|---|
| `public.settings` | 292 seeded key/value rows (jsonb `value`, `value_type`, `group_key`, `label_ar`, `description_ar`, `is_public`, `sort_order`, `updated_at`, `updated_by`) — `supabase/migrations/0001_foundation.sql:103` | `/admin/settings` (update only) | `src/lib/config.ts` loads `is_public = true` rows only; SQL reads any row through `app.setting*` |
| `public.feature_flags` | 15 module flags, enum `flag_state` = `disabled` \| `internal` \| `public` — `0001_foundation.sql:125` | `/admin/settings/modules` | `src/lib/config.ts` loads **all** flags; SQL reads through `app.module_open()` / `app.flag_state()` (`0020_public_projects.sql:31`) |
| `public.option_lists` / `public.option_items` | 15 lists, the visitor's choice values | `/admin/settings/lists` | `config.ts` loads active items; SQL reads through `app.active_option()` |
| `public.project_types` | 4 types | `/admin/settings/lists` | `config.ts` |
| `public.ownership_scenarios` | the «كيفاش تحب مشروعك يكون؟» cards | `/admin/settings/lists` | `config.ts` |
| `public.lead_statuses` | CRM statuses, bound to fixed system `stage` values | `/admin/settings/lists` | internal only |
| `public.site_media` | image slots | `/admin/settings/media` | `config.ts` (`mediaFor`) |
| `public.tree_spacing_classes`, `public.tree_pricing_rules`, `public.tree_cost_items`, `public.financing_markups`, `public.project_spacing_classes`, `public.project_down_payment_percents` | the tree price engine | `/admin/pricing` (through security-definer RPCs) | never directly — only through `public.public_tree_quote()` / `public.public_project_quote()` |
| `public.projects.service_option_ids`, `.document_option_ids` | which services/documents an offer names | `/admin/projects/[id]?tab=card` | `public.public_project_page()` |

**The loader.** `src/lib/config.ts` → `loadPublicConfig` is an `unstable_cache` keyed `"public-config-v6"`, tag
`PUBLIC_CONFIG_TAG = "public-config"`, `revalidate: 300`, with three retries 800/1600 ms apart (comment: the home
page is prerendered, so a Supabase hiccup would fail the build). It issues eight parallel selects:
`settings` (**`.eq("is_public", true)`**), `feature_flags`, `governorates`, `delegations`, `project_types`,
`ownership_scenarios`, `option_items` (`.eq("is_active", true)`), `site_media`. Accessors: `settingText`,
`settingBool`, `settingInt`, `settingJson`, `optionsFor`, `mediaFor`, `mediaCredits`, `flagState`.

**Consequence of `is_public`:** a setting with `is_public = false` is *invisible* to every public page. Calling
`settingText(config, "pricing.default")` from a public page would silently return the fallback. No public page
does; the private keys are read either by direct `supabase.from("settings")` queries in `/admin` or by
`app.setting_text/int/bool` inside Postgres.

**RLS (`0001_foundation.sql:314`).**
```
create policy settings_select on public.settings for select to anon, authenticated
  using (is_public or (select app.is_staff()));
revoke insert, delete on public.settings from anon, authenticated;
revoke update on public.settings from anon;
create policy settings_update ... using ((select app.is_admin())) with check ((select app.is_admin()));
```
So **no application code can create or delete a setting row.** A new key only exists after a numbered migration.
The same shape applies to `feature_flags` (select open to everyone, update admin-only, no insert/delete).

## 13.2 CURRENT IMPLEMENTATION — the Back Office surfaces

| Page | File | Role gate | What it edits |
|---|---|---|---|
| الإعدادات والنصوص | `src/app/admin/(panel)/settings/page.tsx` | `requireStaff(ADMIN_ROLES)` = `admin`, `super_admin` | `settings.value` only |
| الموديولات | `src/app/admin/(panel)/settings/modules/page.tsx` | `ADMIN_ROLES` | `feature_flags.state` |
| القوائم | `src/app/admin/(panel)/settings/lists/page.tsx` | `ADMIN_ROLES` | `option_items`, `project_types`, `ownership_scenarios`, `lead_statuses` |
| صور الموقع | `src/app/admin/(panel)/settings/media/page.tsx` | `ADMIN_ROLES` | `site_media` |
| التسعير | `src/app/admin/(panel)/pricing/page.tsx` | `requireStaff(PRICE_ROLES)` = `finance`, `admin`, `super_admin` | spacing classes, global + per-offer pricing rules, extra cost items, markups per duration; **reads** `down_payment_percent` and `duration` lists read-only and links to القوائم |
| بطاقة العرض | `src/app/admin/(panel)/projects/[id]/card-tab.tsx` | offer write roles | `projects.service_option_ids`, `.document_option_ids`, `.annual_costs_millimes`, `.pricing` (legacy jsonb) |

Navigation (`src/app/admin/(panel)/layout.tsx` `navFor`) exposes four top-level rows: `/admin`, `/admin/leads`
(child `/admin/analytics`), `/admin/projects` (children `/admin/projects/parcels`, `/admin/land-offers`,
`/admin/pricing`), `/admin/settings` (children `modules`, `lists`, `media`, `/admin/users`, `/admin/audit`).
Each row carries its module's flag state as a badge («معطّل» / «داخلي») and is drawn quiet when disabled, but a
disabled row still opens — the flag governs visitors, not staff.

## 13.3 CURRENT IMPLEMENTATION — how one setting row reaches the screen

`settings/page.tsx` selects
`key, value, value_type, group_key, label_ar, description_ar, is_public, updated_at, editor:profiles!settings_updated_by_fkey(full_name)`
ordered by `group_key`, `sort_order`, then renders **only the groups listed in a hardcoded `GROUPS` array**
(`settings/page.tsx:17`):

```
site · legal · lead · sms · simulator · projects · pricing · antispam
```

`SettingInput` (same file, line 105) picks the widget:

| Branch | Applies to | Widget |
|---|---|---|
| `value_type === "boolean"` | any boolean | checkbox «مفعّل» |
| `value_type === "integer"` | any integer | `<input type=number>` with `min/max` from `INTEGER_RANGES` (`settings/ranges.ts`), default `[0, 1_000_000]`; `pricing.max_months` additionally prints «شهراً» |
| key `crm.auto_assign_mode` | that key | `<select>` with two hardcoded options `manual` / `round_robin` |
| key `simulator.durations_months` | that key | comma-separated text |
| key `pricing.default` | that key | `<PricingEditor>` + `<LegacyPricingNotice>` when `treePricingReady` |
| key `site.how_it_works` | that key | `<PairListEditor firstKey="title" secondKey="text" max={10}>` |
| key `site.faq` | that key | `<PairListEditor firstKey="q" secondKey="a" max={30}>` |
| key ∈ `SHORT_TEXT_KEYS` | 6 keys | single-line input, `dir="ltr"` for the 6 `LTR_KEYS` |
| **everything else** | — | `<textarea defaultValue={typeof value === "string" ? value : ""}>` |

`updateSetting` (`settings/actions.ts:118`) re-reads `value_type` from the database, parses, then
`update({ value }).eq("key", key)`. It **never writes `group_key`, `label_ar`, `description_ar`, `is_public`
or `sort_order`** — those are migration-only. On success it calls `updateTag(PUBLIC_CONFIG_TAG)`, plus
`updateTag(PUBLIC_PROJECTS_TAG)` when the key is `pricing.default`, and `revalidatePath("/admin/settings")`.

Validation in `parseText` / `parseValue`:
- `REQUIRED_TEXT` (9 keys) cannot be emptied: `site.home_headline`, `site.free_interest_notice`,
  `legal.no_guarantee_notice`, `legal.consent_text`, `legal.land_offer_notice`, `legal.parcel_card_note`,
  `legal.plan_notice`, `request_no.prefix`, `land_offer_no.prefix`.
- any text > 2000 chars is refused.
- `request_no.prefix` / `land_offer_no.prefix` must match `^[A-Z0-9-]{2,12}$`.
- `sms.sender_id` must match `^[A-Z0-9]{2,11}$`.
- `crm.auto_assign_mode` must be `manual` or `round_robin`.
- `site.contact_phone` / `site.contact_whatsapp` must match `^\+[1-9]\d{6,14}$` or be empty.
- `site.contact_email` must pass `z.email()`.
- integers must be inside `INTEGER_RANGES[key] ?? [0, 1_000_000]`.
- `pricing.max_months`: before saving, the action queries active `duration` items and refuses a cap below the
  longest one; the database also raises `cap_below_durations` via the trigger
  `settings_max_months_floor` (`0031_tree_pricing.sql:286` → `app.check_max_months_setting`), and the action
  translates that error.
- `json`: only `site.how_it_works`, `site.faq` (zod schemas), `simulator.durations_months` and `pricing.default`
  are handled. **Anything else of type `json` is refused with «هذا الإعداد لا يُعدَّل من هذه الصفحة.»**

## 13.4 OBSERVATION — 13 settings exist in groups the Back Office does not render

`GROUPS` names 8 groups. The database holds 12. The rows in `matching`, `audit`, `million` and `start` are
**never rendered on `/admin/settings`** — `page.tsx` filters `settings.group_key === group.key` and renders
nothing for a group that is not in the array.

| group_key | rows | keys | seeded by |
|---|---|---|---|
| `matching` | 2 | `matching.weights`, `matching.min_score` | `0013_pricing_and_matching.sql:27,31` |
| `audit` | 1 | `audit.reason_min_length` | `0024_audit_reason.sql:13` |
| `million` | 6 | `million.people_lead(_fr)`, `million.people_bands(_fr)`, `million.people_encourage(_fr)` | `0043_people_counter.sql` |
| `start` | 4 | `start.row_annual_fee(_fr)`, `start.annual_fee_per_tree(_fr)` | `0047_annual_fee_copy.sql:8` |

The `start` group is the sharpest case: `0047_annual_fee_copy.sql:1-5` states in its own header
«MIL-02: every text on the site is a setting, so the owner renames the line or empties it without a deploy»,
and the four rows it adds are unreachable from the Back Office. They are read at runtime:
`src/app/(public)/start/copy.ts:81-84` and `src/app/(public)/projects/[code]/page.tsx:349`.

Note the historical drift: every other `start.*` key (≈120 rows from `0019`, `0030`, `0032`, `0041`) was seeded
with `group_key = 'site'` and **is** visible; only `0047` used `'start'`.

## 13.5 OBSERVATION — 6 settings look editable but cannot be saved

Any `value_type = 'json'` row inside a rendered group falls through `SettingInput` to the generic
`<textarea>` branch. Because `value` is an array/object, `typeof value === "string"` is false, so the textarea
renders **empty** — it does not show the stored JSON — and `parseValue`'s `json` branch has no schema for the
key, so saving returns «هذا الإعداد لا يُعدَّل من هذه الصفحة.»

| Key | group | Stored value (seed) | Actually read by |
|---|---|---|---|
| `site.facts` | site | JSON list | `src/app/(public)/page.tsx:66` |
| `site.parcel_examples` | site | JSON list | nothing (see 13.9) |
| `start.tier_taglines` | site | `{trees_25:{ar,fr}, …, custom:{ar,fr}}` (`0019_start_page.sql:95`) | `src/app/(public)/start/page.tsx:56` → `start-chooser.tsx:539,604` |
| `start.values` | site | `[{icon,ar,fr} × 4]` (`0019_start_page.sql:107`) | `src/app/(public)/start/page.tsx:57` → `start-chooser.tsx:916` |
| `legal.forbidden_phrases` | legal | `{phrases:[…], allowed_keys:[…]}` (`0026_wording_v2_v3.sql:154`) | only `supabase/tests/012_vocabulary_guard.sql` |
| `analytics.total_price_bands_millimes` | pricing | `[]` | `public.crm_demand_stats` (`0032_intake_pricing.sql`), shown on `/admin/analytics` |

Two of these six (`start.tier_taglines`, `start.values`) are **configurator copy**: the tagline under every
tree-count card on `/start` and the reassurance strip beside the summary. Their Back Office row exists, is
blank, and rejects every save.

## 13.6 CURRENT IMPLEMENTATION — settings that reach the public configurator (`/start`)

`/start` is the configurator. `src/app/(public)/start/page.tsx` gates on the `interest_form` module
(`moduleAccess(config, "interest_form")`; `closed` → `<ComingSoon>`), builds its lists with
`getCalculatorLists` (`start/calculator.ts:21`) and all its words with `startCopy` (`start/copy.ts`).

### 13.6.a Numeric / behavioural settings

| Setting | Table · field | Default | Used by | Admin page | Public impact |
|---|---|---|---|---|---|
| `million.custom_trees_min` | `settings.value` (int, group `site`, public) | `1` (`0019_start_page.sql:124`) | `start/calculator.ts:30`; `app.setting_int` in `submit_interest_request` (`0032_intake_pricing.sql:280`) | الإعدادات ← نصوص الموقع | lower bound of the free «عدد آخر» box; a smaller number is refused by the RPC with `invalid_tree_custom` |
| `million.custom_trees_max` | same (int, public) | `5000` (`0019:127`) | `start/calculator.ts:31`; `0032:281`; also the ceiling in `public.public_tree_quote` (`0045_annual_fee.sql`) and `app.project_quote_payload` (`0048`) via `greatest(setting, max(tree_count.min_number))` | same | upper bound of the free box and of any quote |
| `pricing.max_months` | `settings` (int, group `pricing`, public) | `84` (`0031_tree_pricing.sql:25`) | `app.financed_quote` (`0036:35`), `app.check_duration_item`, `app.check_markup_months`, `app.project_quote_payload` duration list | الإعدادات ← التسعير, range `[12,120]` | a duration longer than the cap is never priced; a markup cannot be saved above it |
| `million.goal` | `settings` (int, group `site`, public) | `1000000` (`0016_million_trees.sql:470`) | `app.setting_int('million.goal', …)` in the counter RPC (`0016:279`) | الإعدادات ← نصوص الموقع, range `[1, 10_000_000]` | denominator of the home progress bar; not the configurator |
| `antispam.max_requests_per_ip_per_hour` | `settings` (int, group `antispam`, **private**) | `10` | `app.check_throttle` in every intake RPC | الإعدادات ← الحماية, `[1,1000]` | how many submissions one IP may make |
| `antispam.max_requests_per_phone_per_day` | same | `3` | every intake RPC | same, `[1,100]` | how many per phone |
| `lead.project_types_multi` | `settings` (bool, public) | `true` | `app.setting_bool` in the intake RPCs | الإعدادات ← التسجيل | whether more than one scenario may be picked |
| `lead.allow_international_phone` | `settings` (bool, public) | `false` | `app.assert_phone` path (`0003:114`) | same | non-`+216` numbers accepted or not |
| `crm.auto_assign_mode` | `settings` (text, private) | `manual` | both intake RPCs (`0032`, `0049_offer_intake.sql:175`) | same | round-robin assignment of a new person |
| `request_no.prefix` | `settings` (text, private) | `AGZ` | both intake RPCs | same | the reference the visitor is given |
| `audit.reason_min_length` | `settings` (int, group `audit`, private) | `5` (`0024:13`) | `app.require_reason`; read directly by `/admin/pricing` and the offer pages | **none — group not rendered** | minimum length of the written reason on every price change |
| `analytics.total_price_bands_millimes` | `settings` (json, group `pricing`, private) | `[]` | `public.crm_demand_stats` | rendered but unsaveable (13.5) | while `[]`, `/admin/analytics` hides the price-band chart |

### 13.6.b The lists the configurator offers

| List | `value_kind` | Seeded items | Read by | Admin page |
|---|---|---|---|---|
| `tree_count` | `number_range` | `trees_25 · trees_50 · trees_100 · trees_250 · trees_500 · trees_500p (أكثر من 500) · trees_any (اقترحولي)`; `trees_250p` retired by `0017_tree_count_500.sql` | `optionsFor(config,"tree_count")` in `calculator.ts:26`, `page.tsx` home cards | القوائم |
| `down_payment_percent` | `number_range` | `dpp_10 · dpp_20 · dpp_30` (`0031:120`), trigger `app.check_down_percent_item` forces `0 < min_number ≤ 100` and `max_number = min_number` | `calculator.ts:29`; `app.down_payment_from_percent` | القوائم (rates shown read-only on /admin/pricing) |
| `duration` | `number_range` | `d_36 · d_48 · d_60 · d_84` (`0030`, `0031:47`), trigger `app.check_duration_item` forces `1 ≤ min_number ≤ pricing.max_months` | `calculator.ts:31`; `app.financed_quote` | القوائم |
| `contact_time` | `time_range` | morning / afternoon / evening | `/register` and the offer form | القوائم |
| `goal`, `desired_area`, `priority`, `plantation_system` | mixed | seeded | `/register` steps | القوائم |
| `ownership_scenarios` | table | cards with icon + optional picture | `calculator.ts:27` («كيفاش تحب مشروعك يكون؟») | القوائم (first section) |
| `tree_spacing_classes` | table | 8 classes, `trad_wide_24x24` → `super_4x1_5` (`0031:155`) | `getSpacingClasses()` in `src/lib/tree-pricing.ts`; `app.tree_price` | **/admin/pricing ← فئات المساحة** |

### 13.6.c The price engine behind the configurator

`public.public_tree_quote(spacing_class, trees, payment_mode, down_percent_option, duration_option)` — latest
definition in `0045_annual_fee.sql` — is the only thing the configurator calls for money. It:
1. refuses an inactive class;
2. computes `v_max = greatest(million.custom_trees_max, max(tree_count.min_number))`;
3. returns `pricing = 'closed'` unless `app.module_open('pricing')`;
4. calls `app.tree_price(class, null)`;
5. for `installments`, resolves the percentage and duration and calls `app.financed_quote`;
6. returns area per tree, total area, price per tree, total price, **annual fee per tree and total**, and the
   installment block. Its comment states what it must never return: «Never the land price, planting cost, extra
   costs, cost, margin, markup or internal notes.»

`app.tree_price` (`0045_annual_fee.sql:29`) resolves, per field, offer-row → global row:

| Field | `tree_pricing_rules` column | Global seed | Admin control |
|---|---|---|---|
| land price per m² | `land_price_per_m2_millimes` | `10000` = 10 DT (`0031:213`) | /admin/pricing ← القواعد العامة, `DinarInput name="land_price"` |
| planting cost per tree | `planting_cost_per_tree_millimes` | `50000` = 50 DT | same, `name="planting_cost"` |
| AgriZed margin | `margin_mode` + `margin_percent_bp` \| `margin_fixed_millimes` | `percent`, `2500` bp = 25 % | same, `<MarginFields>` |
| price rounding | `price_rounding_millimes` | `1000` = 1 DT | same |
| monthly rounding | `monthly_rounding_millimes` | `1000` = 1 DT | same |
| **annual fee per tree** | `annual_fee_per_tree_millimes` | `150000` = 150 DT (`0045:24`) | same, `name="annual_fee"` (`pricing/rule-form.tsx:63`) |
| extra costs | `tree_cost_items` rows, `basis ∈ {per_tree, per_m2}` | none seeded | /admin/pricing ← المصاريف الإضافية |
| markup per duration | `financing_markups.markup_bp` | 36→1000, 48→1400, 60→1800, 84→2500 bp (`0031:279`) | /admin/pricing ← الزيادة حسب المدة |

`app.financed_quote` (`0036_markup_on_remaining.sql`) then computes
`remaining = (cash − down) × (1 + markup)`, `total financed = down + remaining`, monthly rounded up with a
smaller last instalment. A duration with no markup row returns `duration_not_priced`.

Per-offer narrowing: `public.project_spacing_classes` (which classes an offer sells) and
`public.project_down_payment_percents` (which percentages it offers), both edited under
/admin/pricing ← «قواعد خاصة بمشروع» (`pricing/project-section.tsx`, `pricing/allowed-choices-form.tsx`).

### 13.6.d The configurator's words

`start/copy.ts` maps 60 `settings` keys onto `StartCopy`, each with an Arabic fallback hardcoded in the same
line. Representative rows (all `is_public = true`, all in `group_key = 'site'` except the four `'start'` ones):

| Key | Default (seed) | Fallback in code | Renders |
|---|---|---|---|
| `site.trees_question` | «قدّاش زيتونة تحب تبدا بيهم؟» | identical | the tree-count question |
| `site.style_question` | «كيفاش تحب مشروعك يكون؟» | identical | the scenario question |
| `start.spacing_title` / `_hint` / `_any` | «المساحة لكل زيتونة» / … / «ما نعرفش، اقترحولي» | identical | the spacing step |
| `start.payment_title` / `_cash` / `_installments` | «كيفاش تحب تخلّص؟» / «بالحاضر» / «بالتقسيط» | identical | the payment step |
| `start.payment_hint` (`0041`) | seeded | **`""` — no fallback** | the line under the payment question: empty setting = no line |
| `start.down_percent_title` / `_hint` | «نسبة التسبقة» / … | identical | the percentage step |
| `start.row_price_per_tree`, `row_total_price`, `row_total_area`, `row_area_per_tree`, `row_total_financed`, `row_remaining`, `row_monthly`, `row_payment`, `row_duration`, `row_trees`, `row_type`, `row_down` | seeded | identical | the summary rows |
| `start.row_annual_fee` (**group `start`**) | «معاليم الصيانة والتقليم في العام» | identical | the yearly-care row; emptying it hides the row (`calculator-summary.ts:281`) |
| `start.annual_fee_per_tree` (**group `start`**) | «{amount} للزيتونة في العام» | identical | the note under the yearly total |
| `start.estimate_note` | «هذا تقدير أولي…» | identical | the stamp on the estimate card |
| `start.price_unavailable`, `start.duration_not_priced`, `start.down_covers_total` | seeded | identical | the three price failure messages |
| `start.custom_hint` | «اكتب عدداً بين {min} و{max}.» | identical | `{min}`/`{max}` filled from `million.custom_trees_min/max` |
| `start.from_prefix` | «ابتداءً من» | identical | prefix on an open-ended tier |
| `site.start_meta_title` / `_description` | seeded (`0042`) | identical | `<title>` / `<meta description>` of `/start` |
| `start.home_label`, `start.breadcrumb` | seeded | «الرئيسية» / «اختيار عدد الزيتونات» | the breadcrumb |

Every French twin (`*_fr`) falls back to `""` so the second line simply does not render — `copy.ts:10` states
this explicitly. `/start` is the one bilingual page.

## 13.7 CURRENT IMPLEMENTATION — feature flags

Seeded in `0004_seed_configuration.sql:63` (13 flags), `0025_million_counter_split.sql:61`
(`public_statistics`) and `0031_tree_pricing.sql:111` (`pricing`, state `internal`).

| key | seeded state | phase | label_ar | implemented? |
|---|---|---|---|---|
| `interest_form` | `public` | 1 | سجّل اهتمامك | yes |
| `simulator_basic` | `public` | 1 | المحاكي المبدئي «احسب قدرتك» | yes |
| `land_offers` | `public` | 1 | عندك أرض أو ضيعة؟ | yes |
| `pricing` | `internal` | 1 | التسعير | yes |
| `public_statistics` | (`0025`) | — | — | yes |
| `projects` | `disabled` | 2 | المشاريع | yes |
| `matching` | `disabled` | 2 | الـMatching | **no** |
| `visits` | `disabled` | 2 | الزيارات الميدانية | **no** |
| `reservations` | `disabled` | 2 | العربون والحجز | **no** |
| `contracts` | `disabled` | 3 | العقود ووعد البيع | **no** |
| `installments` | `disabled` | 3 | الأقساط | **no** |
| `zitounti` | `disabled` | 4 | فضاء «زيتونتي» | **no** |
| `subscriptions` | `disabled` | 4 | الاشتراك السنوي | **no** |
| `agri_backoffice` | `disabled` | 4 | الـBack Office الفلاحي | **no** |
| `harvest` | `disabled` | 4 | الصابة والجني | **no** |

«implemented» = present in `IMPLEMENTED_MODULES` (`src/lib/modules-catalog.ts:2`):
`["interest_form", "simulator_basic", "land_offers", "projects", "public_statistics", "pricing"]`.
On `/admin/settings/modules`, a flag outside that list renders **no radio group at all** — just the text
«يُبنى في دفعة قادمة» — and `setModuleState` refuses any state other than `disabled` for it.

## 13.8 OBSERVATION — values that look configurable in the UI but are hardcoded

1. **`projects` can never be published.** `settings/modules/actions.ts:25` returns an error for
   `key === "projects" && state === "public"`, with the message «المشاريع تبقى «داخلي فقط» حتى تُضبط جداول
   الأسعار الخاصة بكل عرض». The three-state radio is rendered, the third state is rejected on save. The rule is
   in TypeScript, not in the database.
2. **The eight settings groups are a code array.** `GROUPS` in `settings/page.tsx:17` fixes which groups exist
   and their titles/notes. The `group_key` stored on each row cannot be changed by any admin action, so a
   miss-grouped row is unreachable forever (13.4).
3. **The list order on القوائم is a code array.** `listOrder` (`settings/lists/page.tsx:78`) names 10 of the 15
   lists. `orderedLists` sorts by `listOrder.indexOf(key)`, so the five unnamed lists get `-1` and are rendered
   **before** the named ones, in the DB's alphabetical order: `agrized_service`, `budget`,
   `down_payment_percent`, `duration`, `tree_count`. The services list therefore opens the page, above
   «المساحة المرغوبة».
4. **The `number_range` field labels are hardcoded to square metres.** `OptionFields`
   (`settings/lists/page.tsx:436`) always labels the two bounds «من (م²)» and «إلى (م²)». That list kind is used
   by `desired_area` (m², correct), `tree_count` (trees), `duration` (months) and `down_payment_percent`
   (percent). Three of the four lists show the wrong unit.
5. **`code`-kind lists cannot gain a value.** `settings/lists/page.tsx:177` hides the «إضافة قيمة» form when
   `value_kind === "code"`, and `saveOptionItem` (`lists/actions.ts:44`) refuses an insert with «قيم هذه القائمة
   ثابتة في النظام. يمكن تعديل نصوصها فقط.» This covers `goal`, `priority`, `plantation_system` and
   **`agrized_service`**.
6. **No option item can be deleted.** There is no delete action; the only removal is `is_active = false`.
7. **`crm.auto_assign_mode`'s two choices are hardcoded** in both the `<select>` (`settings/page.tsx:156`) and
   the validator (`settings/actions.ts:57`).
8. **`GROWTH_ICON_CODES` and the scenario picker's `plantation_system` / `production_status` option sets** are
   TypeScript constants (`lists/actions.ts:161-163`, `PLANTATION_LABELS`, `PRODUCTION_LABELS` in `src/lib/crm`).
9. **`STAGES`** — the ten lead-status system stages — is a TypeScript `as const` array
   (`lists/actions.ts:245`) mirrored by a Postgres enum; an admin picks a stage but cannot add one.
10. **`projects.facts_land_title` and `projects.facts_trees_title` are read but never seeded.**
    `src/app/(public)/projects/[code]/page.tsx:234,259` call
    `settingText(config, "projects.facts_land_title", "الأرض")` and `…"projects.facts_trees_title", "الزيتون"`.
    No migration inserts either key, and no admin action can create one, so the two group headings on every
    offer page are permanently the hardcoded Arabic fallbacks.
11. **`lead.whatsapp_first_contact` is read but never seeded.** `src/app/admin/(panel)/leads/[personId]/page.tsx`
    reads it; no migration inserts it.
12. **Hardcoded Arabic labels on public/admin data that is not copy**: `«الماء»`, `«الري»`, `«النفاذ»`,
    `«الصنف»`, `«عمر الأشجار»`, `«نظام الغراسة»`, `«حالة الإنتاج»` on the offer page; `«المصاريف السنوية
    التقديرية»` on `offer-block.tsx:63`; `«مخطط القطع»` passed as a literal `title` to `<ParcelPlan>`
    (`projects/[code]/page.tsx`). These sit beside neighbours that *are* settings-driven.
13. **`INTEGER_RANGES` covers 10 of the 13 integer settings.** Not covered, so silently `[0, 1_000_000]`:
    `million.custom_trees_min`, `million.custom_trees_max` (both editable) and `matching.min_score`,
    `audit.reason_min_length` (both in unrendered groups). Nothing cross-checks `min ≤ max` for the two custom
    tree bounds, and `0` is an accepted minimum although `app.setting_int('million.custom_trees_min', 1)` is
    used as a lower bound on a tree count.

## 13.9 OBSERVATION — settings stored but read by nothing

Verified by scanning every `src/**/*.ts(x)` outside `src/app/admin/(panel)/settings/` and every
`app.setting*('…')` call in `supabase/`. Keys read through a template literal
(`million.tile_${key}_label`, `…_hint` in `src/components/site/million-counter.tsx:33`) are counted as read.

**Dead — nothing renders them (69 rows):**

| Cluster | Keys | Note |
|---|---|---|
| Simulator | `simulator.durations_months` | the **entire** «المحاكي» group of `/admin/settings` is this one key; `SettingInput` gives it a bespoke comma-list widget and a bespoke validator, and no page or RPC reads it |
| SMS | `sms.sender_id`, `sms.provider` | seeded `0037`; asserted by `supabase/tests/022_sms_sender.sql`; no sender worker exists — `app.enqueue_message` only inserts into `notification_outbox` |
| Legal | `legal.forbidden_phrases` | read only by `supabase/tests/012_vocabulary_guard.sql` |
| Legal | `legal.plan_notice` | in `REQUIRED_TEXT` (cannot be emptied) yet no component prints it; only `supabase/tests/006_public_projects.sql` asserts its existence |
| Old projects copy | `projects.picker_title`, `projects.picker_nearest`, `projects.interest_banner`, `projects.browse_cta` | the SIM-05 plan picker and the parcel-linked banner they titled are gone |
| Old home copy | `site.parcels_title`, `site.parcels_text`, `site.parcel_examples`, `site.start_title` | superseded by the `site.unit_*` / `offers.*` copy |
| `/start` leftovers | `start.capacity_title(_fr)`, `start.capacity_hint(_fr)`, `start.per_month(_fr)`, `start.row_installment(_fr)` | the monthly-capacity screen they belonged to was replaced by the percentage + duration screen in `0030`/`0032`; `0039_message_asset.sql:65` still rewrites `start.capacity_hint` |
| French twins | `site.meta_title_fr`, `site.meta_description_fr`, `site.register_meta_title_fr`, `site.register_meta_description_fr`, `site.start_meta_title_fr`, `site.start_meta_description_fr`, `site.cta_primary_label_fr`, `site.cta_secondary_label_fr`, `site.trees_other_card_label_fr`, `register.offers_text_fr`, `start.edit_choices_fr`, all 8 `offers.*_fr`, all 7 `million.*_fr` scalars, all 12 `million.tile_*_fr` | only `/start` renders French; every other page is Arabic-only, so its `_fr` twin is stored and never printed |

The `million.tile_*_fr` case is exact: `millionCounterCopy` builds `million.tile_${key}_label` and
`million.tile_${key}_hint` and never a `_fr` variant, so 12 of the 24 `_fr` tile rows from
`0025_million_counter_split.sql` are unreachable.

## 13.10 OBSERVATIONS — other

- `settings.value` is the **only** column any application code writes. `label_ar`, `description_ar`,
  `sort_order`, `group_key` and `is_public` are migration-controlled, which is why a mistake in a migration's
  `group_key` (13.4) cannot be corrected without a new migration.
- `getPublicConfig` caches for 300 s and is invalidated with `updateTag(PUBLIC_CONFIG_TAG)` by
  `settings/actions.ts`, `settings/lists/actions.ts` (`done()`), `settings/modules/actions.ts` and
  `settings/media/actions.ts`. `/admin/pricing` actions call `revalidatePath("/admin/pricing")` only — the
  pricing tables are not part of `getPublicConfig`, but `getSpacingClasses()` in `src/lib/tree-pricing.ts` is
  itself an `unstable_cache` tagged `PUBLIC_CONFIG_TAG`, so a spacing-class change reaches `/start` only when
  some *other* action invalidates that tag or after its revalidation window.
- Duplication: the same Arabic default string is written twice for most keys — once in the migration's
  `to_jsonb(...)` and once as the `settingText(..., fallback)` argument. They currently agree everywhere
  checked, but nothing enforces it.
- `SHORT_TEXT_KEYS` and `LTR_KEYS` are the same six keys written out twice in `settings/page.tsx:39-40`.
- `docs/plan-rebuild.md:118` records a past outage caused by `million.goal = 0`; `INTEGER_RANGES` now floors
  that key at `1`, and `settings/ranges.ts:6` documents why.

---

# 15. AGRIZED SERVICES

## 15.1 CURRENT IMPLEMENTATION — the data

Services are **an option list and nothing else**. `0023_project_page_v3.sql:123` seeds:

```
insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('agrized_service', 'خدمات AgriZed', 'code',
   'الخدمات التي تقدّمها AgriZed في مشروع (التقرير §20 و§36). تُختار لكل مشروع وتظهر أسماؤها في صفحته، بلا أسعار.')
```

and ten `option_items` (`0023:130`):

| code | label_ar | label_fr | sort_order |
|---|---|---|---|
| `plowing` | الحرث | Labour | 10 |
| `irrigation` | السقي | Irrigation | 20 |
| `monitoring` | المراقبة | Surveillance | 30 |
| `pruning` | التقليم | Taille | 40 |
| `guarding` | الحراسة | Gardiennage | 50 |
| `harvest` | الجني | Récolte | 60 |
| `transport` | النقل | Transport | 70 |
| `pressing` | العصر | Trituration | 80 |
| `tree_follow_up` | متابعة الزيتونة | Suivi de l'olivier | 90 |
| `production_reports` | تقارير الإنتاج | Rapports de production | 100 |

An `option_items` row has exactly these columns available to a service:
`id, list_key, code, label_ar, label_fr, min_millimes, max_millimes, min_number, max_number, time_from, time_to,
sort_order, is_active`. The money and number columns are **never written for `agrized_service`** — the list's
`value_kind` is `code`, so `saveOptionItem` (`settings/lists/actions.ts:70-100`) enters neither the `money` nor
the `number_range` branch and `OptionFields` renders neither pair of inputs.

The per-offer link is `public.projects.service_option_ids uuid[] not null default '{}'`
(`0023:21`), constrained `cardinality(service_option_ids) <= 30` (`0023:30`), commented
«AgriZed services offered in this project (option list agrized_service, report v3 §36). **Names only, no
price.**» (`0023:39`).

## 15.2 CURRENT IMPLEMENTATION — where an admin touches them

| Surface | File | What can be changed |
|---|---|---|
| `/admin/settings/lists` (first section on the page, see 13.8 §3) | `settings/lists/page.tsx` + `OptionFields(kind="code")` | `label_ar`, `label_fr`, `sort_order`, `is_active`. **No add, no delete, no price.** |
| `/admin/projects/[id]?tab=card` | `projects/[id]/card-tab.tsx:200` → `<OptionChecks legend="خدمات AgriZed في هذا المشروع (أسماء بلا أسعار)" name="service_option_ids" options={optionsFor(config,"agrized_service")} chosen={project.service_option_ids} />` | which services this offer names — a checkbox per active item, ids only |
| Server action | `projects/actions.ts:113` `service_option_ids: optionIds(formData, "service_option_ids")` | writes the uuid array |

`OptionChecks` prints «القائمة فارغة. أضف قيماً من الإعدادات ← القوائم.» when the list is empty — which an
admin cannot act on for this list, because adding is refused for `code` lists.

## 15.3 CURRENT IMPLEMENTATION — where they are displayed

**Two places, both name-only.**

1. **Home page** — `src/app/(public)/page.tsx:73-74`, rendered at line 365:
   ```
   const servicesTitle = settingText(config, "site.services_title");
   const services = servicesTitle ? optionsFor(config, "agrized_service") : [];
   ```
   The whole section is gated on `site.services_title` being non-empty («اتركه فارغاً باش يتخبّى القسم كامل»,
   `0039_message_asset.sql:55`). It prints the title, `site.services_text`, then **every active item of the
   list** as a `<li className="pill pill-line">{service.label_ar}</li>`, then `site.services_note`.
   This list is *global* — it is not filtered by any offer.

   | Key | Seed (`0039_message_asset.sql:53`) |
   |---|---|
   | `site.services_title` | «إنت تستثمر، وإحنا نتلهاو» |
   | `site.services_text` | «AgriZed ما تبيعش وتخلّي. بعد التملّك نتابعو زيتونتك ونقدّمو الخدمات الفلاحية بمقابل معلوم ومتّفق عليه قبل، وإنت تتابع كل شيء من فضائك الخاص.» |
   | `site.services_note` | «الخدمات اختيارية، وشروطها وأسعارها تتوضّح قبل الإمضاء.» |

2. **Offer page** — `src/app/(public)/projects/[code]/page.tsx:91` and 412:
   ```
   const services = chosenLabels(config, "agrized_service", page?.service_option_ids);
   …
   {services.length > 0 ? (
     <InfoCard title={settingText(config, "projects.services_title", "خدمات AgriZed في هذا المشروع")}>
       <ul …>{services.map(label => <li className="rounded-full bg-leaf-soft …">{label}</li>)}</ul>
       <p className="mt-3 text-sm text-muted">{settingText(config, "projects.services_text")}</p>
     </InfoCard>) : null}
   ```
   `chosenLabels` (line 495) intersects the offer's ids with the active list **in the list's own order** and
   maps to `label_ar`. The card is hidden entirely when the offer named no service — which also means
   `projects.services_text` never appears on its own.

   | Key | Seed (`0023:268`) |
   |---|---|
   | `projects.services_title` | «خدمات AgriZed في هذا المشروع» |
   | `projects.services_text` | «خدمات تنجم تطلبها بعد التملّك. شروطها وأسعارها تتوضّح قبل الإمضاء.» |

The ids leave Postgres through `public.public_project_page(p_code)` (`0023:210`), which returns
`'service_option_ids', to_jsonb(pj.service_option_ids)` and is gated by `app.project_visible(pj.status)`, the
same gate as the listing. `src/lib/public-projects.ts:256` normalises it.

## 15.4 CURRENT IMPLEMENTATION — separating implemented from displayed-only

| Capability | State | Evidence |
|---|---|---|
| Services exist as data | **implemented** | `option_lists`/`option_items`, `0023` |
| Names editable, reorderable, deactivatable | **implemented** | `/admin/settings/lists` |
| New service can be added from the Back Office | **not implemented** | `value_kind = 'code'` → add form hidden and insert refused |
| Service can be deleted | **not implemented** | no delete action anywhere |
| Configurable **per offer** (which services this offer names) | **implemented** | `projects.service_option_ids`, card tab |
| Configurable **per offer** with different terms/price | **not implemented** | a uuid array; no join table, no per-offer service attributes |
| **Priced** | **not implemented** | no price column is written or read for `agrized_service`; both the DB comment and both public texts say the price is settled «قبل الإمضاء» |
| **Purchasable** | **not implemented** | no cart, order, subscription or payment table exists; no server action takes a service |
| **Linked to a customer** | **not implemented** | no `person`/`interest_request`/`parcel` column or table references a service item |
| **Tracked** (frequency, provider, status, execution, invoice) | **not implemented** | no such column or table |
| Shown on the home page | **displayed only** | `page.tsx:365` chips |
| Shown on an offer page | **displayed only** | `projects/[code]/page.tsx:412` chips |
| Shown anywhere else (parcel page, `/start`, `/register`, CRM, exports) | **absent** | greps for `agrized_service` return only the five sites listed in 15.2/15.3 |
| A Back Office section «الخدمات الفلاحية» | **removed** | `src/components/admin/nav-model.ts:76` — the comment names الحجوزات · الزيارات · العقود · الدفوعات · الخدمات الفلاحية and says they were pulled because each page said only «the domain is not built yet» |

## 15.5 CURRENT IMPLEMENTATION — the money that *is* attached to yearly care

Three separate, unrelated amounts exist. They are easy to confuse and the code keeps them apart deliberately.

| Concept | Column | Scope | Who sets it | Who sees it |
|---|---|---|---|---|
| **Annual fee per tree** («معاليم الصيانة والتقليم في العام») | `tree_pricing_rules.annual_fee_per_tree_millimes` (`0045_annual_fee.sql:14`), global `150000` | global, overridable per offer, resolved offer→global by `app.tree_price` | `/admin/pricing` → `staff_save_pricing_rule` (`0046_annual_fee_save.sql`) | `/start` summary row, the offer form's figure block, `app.parcel_price` — never added to the purchase price, «carries no markup (0036)» per `0045`'s header |
| **Estimated annual costs** («المصاريف السنوية التقديرية») | `projects.annual_costs_millimes` and `parcels.annual_costs_millimes` (`0012_projects_and_parcels.sql:32,75`) | one free amount typed per project and per parcel | `/admin/projects/[id]?tab=card` (`card-tab.tsx:120`) and the parcel form (`parcel-fields.tsx:156`) | `public_parcels()` when the parcel is offered; printed by `src/components/site/offer-block.tsx:63` under a **hardcoded** label |
| **Project cost lines** | `public.project_costs.kind` — 13 kinds including `plantation`, `irrigation`, `fencing`, `access`, `management` (`0022_cards_and_costs_v3.sql:15`) | internal budget of a project | `/admin/projects/[id]?tab=costs`, Finance/Admin only (PRJ-03) | never public |

None of the three is keyed by a service item: `irrigation` as a `project_costs.kind` and `irrigation` as an
`agrized_service.code` are unrelated strings in unrelated tables.

## 15.6 OBSERVATIONS — services

1. **The home chips and the offer chips answer different questions.** The home page prints every active service
   in the catalogue; the offer page prints only the ones that offer named. A visitor reading both sees a longer
   list on the home page than on any offer.
2. **`0045_annual_fee.sql` is the only implementation of "a service that costs money"**, and it is a single
   undifferentiated per-tree figure, not a per-service price. Its label says «الصيانة والتقليم» — upkeep and
   pruning — while the service list has ten entries.
3. **Contradiction with `docs/rapport-developpement-v3.md` §36** (lines 971-996). The report lists exactly the
   ten services the code seeds, then states that **each service carries `Price`, `Frequency`, `Provider`,
   `Status`, `Payment`**. None of the five exists: `agrized_service` items have only a label, an order and an
   active flag. §37 («خدمة الجني») describes a client choosing harvest options; nothing in the code takes such
   a choice.
4. **Contradiction with `docs/rapport-developpement-v3.md` §20 / §35 / §1461 «Agricultural Services»** and with
   `docs/plan-rebuild.md:68` (P6: «حجوزات ← زيارات ← عقود ← دفوعات ← خدمات») and `:75`, which still describe a
   «الخدمات الفلاحية» Back Office section. `nav-model.ts` removed that row on 2026-09-18; the plan is the record
   of intent, the nav is the record of fact.
5. **Dead code left behind by the nav removal**: `src/components/admin/section-not-open.tsx` exports
   `SectionNotOpen` and is imported by nothing; `src/components/admin/nav-icons.tsx` still defines the icons
   `reservations`, `visits`, `contracts`, `payments`, `services` (lines 66, 67, 73, 80, 88) and
   `nav-model.ts:13` still declares those five `AdminIconKey` members, while `navFor` uses none of them.
6. **`site.services_title` doubles as a switch.** Emptying the title hides the title, the text, the chips and
   the note. The same pattern is used for `site.unit_title` and `offers.form_title`; it is a convention, not a
   documented feature flag, and it is invisible from `/admin/settings/modules`.

---

# 16. VISITS

## 16.1 CURRENT IMPLEMENTATION — the visitor preference

The whole of "visits" in the database is **one nullable boolean column**:

```
-- 0030_intake_v3.sql:46
alter table public.interest_requests
  add column if not exists wants_visit boolean,
```

- `0030_intake_v3.sql:109` and its successor `0032_intake_pricing.sql:111` parse it defensively:
  `case when jsonb_typeof(p->'wants_visit') = 'boolean' then (p->>'wants_visit')::boolean end` — a non-boolean
  answer is stored as NULL, i.e. «no answer» (asserted by `supabase/tests/016_intake_v3.sql:190-192`).
- It is written by `public.submit_interest_request` only — the calculator flow.
- `public.crm_search_requests` exposes it as a filter (`0032:595`: `and (f.wants_visit is null or c.wants_visit = f.wants_visit)`).
- `public.crm_demand_stats` counts it: `'visit_yes', (select … from r where wants_visit)` (`0032:802`).

**There is no visits table.** Greps across `supabase/migrations/*.sql` return no `create table` whose name
contains `visit`. There is no date, no time slot, no number of people, no assignee, no status, no calendar, no
notification.

## 16.2 CURRENT IMPLEMENTATION — where the visitor answers

**The `/register` wizard, step 4 «الزيارة والتمويل»** (`src/app/(public)/register/register-wizard.tsx`):

```
const STEPS = ["بياناتك", "أين ترغب في الاستثمار؟", "ما هو هدفك؟", "الزيارة والتمويل", "كيف تحب نتصلوا بيك؟", "راجع طلبك"];
…
function VisitStep({ form, update }) {
  <p className="hint -mt-2">سؤالين اختياريين: تنجم تعدّي للخطوة الموالية بلا ما تجاوب.</p>
  <YesNoGroup name="wantsVisit" legend="تحب تزور الأرض؟" hint="جوابك يعاونّا نحضّرولك زيارة للأرض."
              choices={VISIT_CHOICES} … />
```
`VISIT_CHOICES = [{true,"نعم"},{false,"لا، مازال"}]` (line 110). The review step prints
`{ step: 4, label: "زيارة الأرض", … }` (line 786).

**Every one of these strings is hardcoded in TypeScript** — the step name, the legend, the hint, both choice
labels and the review label. No `settings` key exists for any of them, in contrast with the rest of the site's
copy (MIL-02 / PRN-02). This is the same hardcoding noted in 13.8 §12.

Pre-answering by link: `/register?…&visit=1` sets `initialWantsVisit` (`register/page.tsx:54`), which
`register-wizard.tsx:142,247` turns into `wantsVisit: true` and lets win over a saved draft. The action
`register/actions.ts:37,158` validates `wantsVisit: z.boolean().nullable()` and passes `wants_visit` to the RPC.

`/start` carries the flag through: `start/page.tsx:61` reads `params.visit === "1"` and
`start/calculator-summary.ts:33` re-emits `visit=1` in `calculatorQuery`, so the answer survives a round trip
between the configurator and the form.

## 16.3 CURRENT IMPLEMENTATION — the CTAs

**Parcel page — a real visit CTA.** `src/app/(public)/projects/[code]/[parcel]/page.tsx:105-107`:
```
// «مهتم» and «نحب نزور» are two different wishes (owner, 2026-09-18) …
const visitCta = canAsk
  ? { href: interestHref({ ...asked, visit: true }), label: settingText(config, "projects.visit_cta", "نحب نزور الأرض") }
  : null;
```
`interestHref` (`src/lib/public-hrefs.ts:37`) appends `visit: "1"`. Rendered twice, lines 198 and 219. This is
the **only** path that actually records a visit wish from an offer, and it requires a *parcel*.

**Offer page — a visit card with no visit.** `src/app/(public)/projects/[code]/page.tsx`:
```
const interestOpen = flagState(config, "interest_form") === "public";
const selling = project.status === "published" || project.status === "internal";
const formOpen = selling && interestOpen && offerTrees > 0;
const visitOpen = selling && interestOpen;
…
{visitOpen ? <a href="#offer-visit" className="btn btn-secondary flex-1 text-lg">
   {settingText(config, "projects.visit_cta", "نحب نزور الأرض")}</a> : null}
…
{visitOpen ? (
  <InfoCard id="offer-visit" title={settingText(config, "projects.visit_title", "زيارة الأرض")}>
    <p>{settingText(config, "projects.visit_text")}</p>
    {formOpen ? <a href="#offer-form" className="btn btn-primary mt-4">
      {settingText(config, "offers.submit_label", "سجّل اهتمامك بهذا العرض")}</a> : null}
  </InfoCard>) : null}
```
The top button is an **anchor to `#offer-visit`** on the same page; the card's own button is an anchor to
`#offer-form`. `#offer-form` is `<OfferInterestForm>`, and that form has **no visit field** — greps for
`visit`/`wants` in `src/app/(public)/projects/[code]/offer-interest-form.tsx` return only two comments about
«the visitor». So on an offer page the whole visit journey is: scroll down, read a paragraph, land in a form
that never asks the question. `wants_visit` stays NULL for every offer request.

Copy (all `is_public = true`, group `projects`, seeded `0023_project_page_v3.sql:272`):

| Key | Default | Rendered where |
|---|---|---|
| `projects.visit_title` | «زيارة الأرض» | offer-page card heading |
| `projects.visit_text` | «تحب تشوف الأرض قبل ما تقرّر؟ سجّل اهتمامك ونتصلو بيك باش نرتّبو موعد الزيارة.» | offer-page card body |
| `projects.visit_cta` | «نحب نزور الأرض» | offer-page anchor **and** parcel-page link |

`0049_offer_intake.sql` confirms the gap from the database side: `public.submit_offer_request` inserts 30
columns into `interest_requests` and `wants_visit` is not among them.

## 16.4 CURRENT IMPLEMENTATION — where the answer surfaces internally

| Surface | File | Behaviour |
|---|---|---|
| Lead detail | `admin/(panel)/leads/[personId]/page.tsx:338` | `{isOffer && request.wants_visit === null ? null : <DataRow label="يحب يزور الأرض">{answerLabel(request.wants_visit, "لا، مازال")}</DataRow>}` — the row is suppressed for offer requests, where an empty row «would read as an unanswered question» |
| Lead list filter | `admin/(panel)/leads/page.tsx:505` | `<select name="wants_visit">` — الكل / نعم / «لا، مازال»; parsed by `leads/filters.ts:121` |
| CSV export | `admin/(panel)/leads/export/route.ts:153` | one `answer(row.wants_visit)` column |
| Analytics | `admin/(panel)/analytics/page.tsx:250-256` | a `<ChartCard title="الزيارة والتمويل البنكي" subtitle="اللي جاوبوا بنعم. السؤالين اختياريين في الاستمارة.">` with a single bar «يحب يزور الأرض» = `stats.visit_yes` |
| Lead statuses | `0004_seed_configuration.sql:148` | the `visit` **stage** carries two seeded statuses, «زيارة مبرمجة» (`is_stage_default`) and «تمت الزيارة». These are CRM statuses on a *person*, set by hand; they are not a visit record and carry no date |
| Land-offer pipeline | `0003_land_offers_and_intake.sql:306,477` | an unrelated `field_visit` stage on `land_offers` (AgriZed visiting a landowner's plot), with its own rule at line 477 |
| Module flag | `feature_flags.visits` | seeded `disabled`, phase 2, «الزيارات الميدانية», «البند 12.». Not in `IMPLEMENTED_MODULES`, so `/admin/settings/modules` renders no control for it, only «يُبنى في دفعة قادمة», and `setModuleState` refuses any state but `disabled` |
| Back Office section | — | none. `nav-model.ts:76` records that «الزيارات» had a row and a page and was removed on 2026-09-18 |

## 16.5 OBSERVATIONS — visits, implemented vs displayed-only

| Item | State |
|---|---|
| A yes/no visit wish on a calculator request | **implemented** end to end: form → `wants_visit` → CRM detail, filter, export, analytics |
| Pre-answering the wish from a parcel page | **implemented** (`visit=1` → `/register`) |
| Pre-answering the wish from an offer page | **not implemented** — the CTA is an in-page anchor and the offer form has no field |
| A visit **record** (date, slot, people, assignee) | **does not exist** — no table |
| Scheduling / calendar | **does not exist** |
| Visit **status** (Requested / Confirmed / Completed / No show / Cancelled) | **does not exist** as a visit status. The nearest thing is two `lead_statuses` rows in the `visit` stage, applied to a person |
| Notifications about a visit | **does not exist**. `public.message_templates` holds exactly two keys, `lead.confirmation` and `land_offer.confirmation` (`0004:160`), plus rows added by `0007_crm_queries.sql:223`; none concerns a visit. `app.enqueue_message` writes to `notification_outbox` and **no sender worker exists in this repository** |
| A visits Back Office screen | **removed** (was a placeholder page) |
| The `visits` module flag | **stored, permanently `disabled`, not switchable** |

**Contradiction with `docs/rapport-developpement-v3.md` §25 «الزيارة»** (lines 660-690). The report specifies
that the client chooses **التاريخ، التوقيت المتوفر، عدد الأشخاص، وسيلة الاتصال**, that the Back Office shows a
**Calendar**, and that a visit has five statuses: **Requested, Confirmed, Completed, No show, Cancelled**. The
code implements one nullable boolean and nothing else. §26 lists «الزيارة» as a field of the unified client
profile, and §1053 «زياراتي» describes a client-facing visit list; neither exists.

**Contradiction with `docs/plan-rebuild.md:68` (P6)** and `:75`, which still place «الزيارات» among the Back
Office's ten sections. The section is not in `nav-model.ts`.

**Coupling worth naming.** The offer page derives `visitOpen` from `selling && interestOpen`, i.e. from the
`interest_form` flag and the project status — never from `feature_flags.visits`. The one flag actually named
«الزيارات الميدانية» governs nothing; the visit card appears and disappears with the interest form.

---

## What could not be determined

- Whether the four `start`-group settings and the two `projects.facts_*` fallbacks are intentional or
  accidental: the repository shows the mechanism and the outcome, not the intent. Could not determine from
  current codebase.
- Whether any SMS is actually sent (and therefore whether `sms.sender_id` / `sms.provider` are read by anything
  outside this repository): no worker, cron, edge function or webhook exists here that drains
  `notification_outbox`. Could not determine from current codebase.
