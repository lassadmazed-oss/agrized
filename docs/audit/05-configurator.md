# AgriZed audit — 05 · Configurator and URL parameters

> Scope of this file: section 4 (CONFIGURATOR) and section 26 (URL PARAMETERS).
> Everything below describes the code as it stands in the working tree on 2026-09-18.
> Working-tree note: `src/app/(public)/start/*` was being edited by another process while this
> audit ran (`start-chooser.tsx` mtime 19:04, `copy.ts` 19:00, `page.tsx` / `calculator-summary.ts`
> 18:32). Every file listed here was read whole and was syntactically complete at read time
> (`start-chooser.tsx` = 1160 lines, closing on a complete `ValueIcon` component). Nothing under
> `supabase/`, `src/lib/`, `src/components/` or `src/app/admin/` was in flux.

---

## 4. CONFIGURATOR

### 4.1 What the configurator is, and where it lives

The configurator is the page `/start`. It is a **one-question-per-screen wizard** that collects at most
six answers, sends them to one database function for pricing, prints an estimate card beside the
question, and then hands the answers to `/register` **in the URL**. It never writes anything.

| Layer | File | Role |
|---|---|---|
| Route (server) | `src/app/(public)/start/page.tsx` | Loads config, gates on the `interest_form` flag, reads the URL, renders `<StartChooser>` |
| Copy (server) | `src/app/(public)/start/copy.ts` | `startCopy(config)` — resolves ~60 `settings` keys into a `StartCopy` object |
| Lists + URL reading (server) | `src/app/(public)/start/calculator.ts` | `getCalculatorLists`, `readCalculatorChoices`, `quoteChoices`, `summaryInput` |
| Shared pure logic | `src/app/(public)/start/calculator-summary.ts` | `calculatorQuery`, `calculatorGap`, `calculatorSummary`, `moneyLine`, `areaLine` |
| UI (client) | `src/app/(public)/start/start-chooser.tsx` | The wizard, the estimate card, the progress bar, the summary rows |
| Server Action | `src/app/(public)/start/actions.ts` | `quoteStart(input)` → `publicTreeQuote` |
| RPC client | `src/lib/tree-pricing.ts` | `publicTreeQuote`, `getSpacingClasses`, `toTreeQuote`, `PAYMENT_MODES` |
| Engine | `supabase/migrations/0031_tree_pricing.sql`, `0036`, `0045`, `0046`, `0048` | `public.public_tree_quote`, `app.tree_price`, `app.financed_quote`, `app.down_payment_from_percent`, `app.price_rounding` |

`src/app/(public)/simulator/page.tsx` is a permanent `redirect("/start")` — the old simulator URL.

**Gate.** `page.tsx` calls `moduleAccess(config, "interest_form")` (`src/lib/modules.ts`). `closed` →
`<ComingSoon title={copy.title} />` and nothing else renders. `preview` (flag `internal` + staff
session) → `<PreviewBanner/>` above the wizard. The **prices** carry a second, independent gate: the
`pricing` feature flag, checked inside the database (`app.module_open('pricing')`).

### 4.2 The step machine (client)

`start-chooser.tsx` builds the step list dynamically:

```
type StepKey = "trees" | "spacing" | "type" | "payment" | "down" | "duration" | "summary";

const steps = ["trees"]
  + (spacingClasses.length > 0 ? ["spacing"] : [])
  + (scenarios.length > 0      ? ["type"]    : [])
  + ["payment"]
  + (installments && downPercents.length > 0 ? ["down"]     : [])
  + (installments && durations.length > 0    ? ["duration"] : [])
  + ["summary"];
```

- An **empty Back Office list deletes its screen** — and, through `calculatorGap`, also deletes the
  requirement to answer it.
- Choosing «بالتقسيط» **adds two screens mid-flow**; choosing «بالحاضر» removes them
  (`activeStep = steps.includes(step) ? step : "summary"`).
- Answering a card auto-advances after `ADVANCE_MS = 220` ms (hardcoded constant). Only the trees
  screen keeps a «التالي» button (a typed number is not a click) and a sticky bottom bar on phones.
- «تبديل» on a summary row jumps to that one screen and returns straight to the summary
  (`editingRef`); the mapping is `rowStep()`: `trees→trees`, `type→type`, `area_per_tree→spacing`,
  `payment→payment`, `down→down`, `duration→duration`. `total_area`, `price_per_tree`,
  `total_price`, `annual_fee`, `total_financed`, `remaining`, `monthly` deliberately carry **no**
  «تبديل».
- Progress: `Progress({step: index+1, total: steps.length})`, label hardcoded in Arabic in the
  component: `الخطوة N من M`, `aria-label="التقدم في الحاسبة"`.
- Deep link: arriving with every answer already in the URL opens directly on `summary`
  (the initial `useState` runs `calculatorGap` on `initial`).

### 4.3 The questions, one by one

| # | Step | Question text (setting) | Options come from | Stored in URL as |
|---|---|---|---|---|
| 1 | `trees` | `site.trees_question` — «قدّاش زيتونة تحب تبدا بيهم؟» | `option_items` where `list_key = 'tree_count'` + a free-number card | `trees` (uuid) **or** `trees_custom` (integer) |
| 2 | `spacing` | `start.spacing_title` — «المساحة لكل زيتونة» | table `public.tree_spacing_classes` where `is_active` | `spacing` (uuid) |
| 3 | `type` | `site.style_question` — «كيفاش تحب مشروعك يكون؟» | `public.ownership_scenarios` where `is_active` (`config.scenarios`) | `scenario` (uuid) |
| 4 | `payment` | `start.payment_title` — «كيفاش تحب تخلّص؟» | **hardcoded pair** `cash` / `installments` | `payment` |
| 5 | `down` | `start.down_percent_title` — «نسبة التسبقة» | `option_items` where `list_key = 'down_payment_percent'` | `down_pct` (uuid) |
| 6 | `duration` | `start.row_duration` — «مدة الدفع» (the row label doubles as the question title) | `option_items` where `list_key = 'duration'` | `duration` (uuid) |

**1 · Number of trees.** Tiers are `option_items` rows; seeded by `0016_million_trees.sql` and
`0017_tree_count_500.sql`:

| code | label_ar | label_fr | min_number | max_number | sort | state |
|---|---|---|---|---|---|---|
| `trees_25` | 25 زيتونة | 25 oliviers | 25 | 25 | 10 | active |
| `trees_50` | 50 زيتونة | 50 oliviers | 50 | 50 | 20 | active |
| `trees_100` | 100 زيتونة | 100 oliviers | 100 | 100 | 30 | active |
| `trees_250` | 250 زيتونة | 250 oliviers | 250 | 250 | 40 | active |
| `trees_500` | 500 زيتونة | 500 oliviers | 500 | 500 | 45 | active |
| `trees_250p` | أكثر من 250 | Plus de 250 | 250 | null | 50 | **retired** by 0017 (`is_active = false`) |
| `trees_500p` | أكثر من 500 | Plus de 500 | 500 | null | 50 | active |
| `trees_any` | اقترحولي | Proposez-moi | **null** | null | 60 | active |

The quote always uses `min_number` (`quoteTrees = chosenTree.min_number`). Consequences that are
visible on screen: `trees_500p` prices **500** trees and every derived amount is prefixed «ابتداءً من»
(`openEnded` in `calculatorSummary`); `trees_any` has `min_number = null`, so `trees` reaches the RPC
as null and **only the per-tree figures** survive (no total area, no total price, no annual total, no
instalments — `public_tree_quote` multiplies by null).

The free-number card: `typeCustom()` converts Arabic-Indic and Persian digits with
`toWesternDigits` (`src/lib/digits.ts`), strips non-digits, `maxLength={9}`, `dir="ltr"`,
`inputMode="numeric"`. Validity is `Number.isInteger(n) && n >= customMin && n <= customMax`, with
`customMin = settingInt(config, "million.custom_trees_min", 1)` and
`customMax = settingInt(config, "million.custom_trees_max", 5000)` (both seeded in `0019_start_page.sql`).
A tier and a custom number are mutually exclusive in both directions (`pickTier` clears the text,
`typeCustom` clears the tier); when both arrive in the URL, `readCalculatorChoices` lets the tier win.
Hint text `start.custom_hint` = «اكتب عدداً بين {min} و{max}.» — `{min}`/`{max}` are filled client-side
by `fillLimits()` with `formatCount` (en-US grouping).

**2 · Spacing class / surface per tree.** Rows of `public.tree_spacing_classes` (created in 0031),
loaded by `getSpacingClasses()` in `src/lib/tree-pricing.ts` through `unstable_cache`
(key `spacing-classes-v1`, tag `PUBLIC_CONFIG_TAG`, `revalidate: 300`). The card shows three lines:
`label_ar`, `formatSpacing(row_spacing_m, tree_spacing_m)` («7 × 5 م») and `formatArea(area_m2)` («35 م²»).
Seeded classes (0031):

| code | label_ar | label_fr | row × tree | area_m2 (generated) |
|---|---|---|---|---|
| `trad_wide_24x24` | تقليدي واسع | Traditionnel large | 24 × 24 | 576 |
| `trad_14x14` | تقليدي | Traditionnel | 14 × 14 | 196 |
| `semi_10x10` | تقليدي / شبه مكثّف | Traditionnel / semi-intensif | 10 × 10 | 100 |
| `int_7x7` | مكثّف | Intensif | 7 × 7 | 49 |
| `int_7x5` | مكثّف | Intensif | 7 × 5 | 35 |
| `int_5x5` | مكثّف | Intensif | 5 × 5 | 25 |
| `super_4x2` | مكثّف جداً | Super intensif | 4 × 2 | 8 |
| `super_4x1_5` | مكثّف جداً | Super intensif | 4 × 1.5 | 6 |

`area_m2` is `numeric(10,2) generated always as (row_spacing_m * tree_spacing_m) stored` — the surface
per tree is **never typed**, it is a generated column.

A last card, `start.spacing_any` = «ما نعرفش، اقترحولي», sets `spacingId = null` and
`spacingAnswered = true`. Because `quoteStart`'s zod schema requires `spacingClassId: z.uuid()` and
`quoteChoices()` returns `null` without a spacing id, **answering «اقترحولي» produces no quote at all**:
no area, no price, no instalments — the card falls back to the photo and the summary rows stay «—».

**3 · Offer type (ownership scenario).** Purely informational: `scenarioId` is **not** sent to
`public_tree_quote` and changes no figure. It travels to `/register` and is snapshotted on the demand
(`scenario_ids`, `project_type_unsure = !scenarioId`). Cards render `image_url` when the Back Office
uploaded one, otherwise `<GrowthIcon code={icon_code}/>`.

**4 · Payment mode.** The only **hardcoded list** of the configurator:

```ts
// src/lib/tree-pricing.ts
export const PAYMENT_MODES = ["cash", "installments"] as const;
```

The two chips are built in `start-chooser.tsx` from copy, not from a list:
`{id: "cash", label_ar: copy.paymentCash}` = «بالحاضر», `{id: "installments", …}` = «بالتقسيط».
`start.payment_hint` (added by `0041_payment_hint.sql`) prints under the question:
«التقسيط وسيلة تسهّل البداية: بمبلغ شهري بسيط يتحوّل الإدخار لأصل حقيقي وملموس.» — it has **no code
fallback** (`text("start.payment_hint")`), so emptying the setting hides the line.

**5 · Down payment percentage.** `option_items` rows of list `down_payment_percent`, created by 0031
with the trigger `option_items_down_percent_range` → `app.check_down_percent_item()`, which refuses a
row unless `min_number > 0 and min_number <= 100` and `max_number` is null or equal to `min_number`
(error `invalid_down_payment_percent`). Seeded: `dpp_10` «10%», `dpp_20` «20%», `dpp_30` «30%».
Hint `start.down_percent_hint` = «التسبقة تتحسب من السعر الجملي بالحاضر.»

**6 · Duration.** `option_items` rows of list `duration`, months in `min_number`. Seeded by
`0030_intake_v3.sql` (`d_36` «3 سنوات», `d_60` «5 سنوات», `d_84` «7 سنوات») plus `d_48` «4 سنوات» by 0031.
The trigger `option_items_duration_cap` → `app.check_duration_item()` refuses a non-integer, a value
< 1, or a value above `app.setting_int('pricing.max_months', 84)` (error `duration_over_cap`), and
`app.check_max_months_setting()` refuses lowering `pricing.max_months` below the longest live duration
or markup (error `cap_below_durations`).

### 4.4 The quote pipeline

```
start-chooser.tsx (client, 250 ms debounce)
  └─ quoteStart()                      src/app/(public)/start/actions.ts  ("use server", zod)
       └─ publicTreeQuote()            src/lib/tree-pricing.ts (createClient → caller's JWT)
            └─ rpc public_tree_quote(p_spacing_class, p_trees, p_payment_mode,
                                     p_down_percent_option_id, p_duration_option_id)
                 ├─ app.module_open('pricing')          → 'closed' for a visitor while the flag is internal
                 ├─ app.tree_price(class, NULL)         → price per tree + annual fee   (0045, was 0031)
                 └─ app.financed_quote(total, down, months, NULL)                        (0036, was 0031)
                      └─ app.down_payment_from_percent(total, percent, NULL)             (0031)
                           └─ app.price_rounding(NULL)                                   (0031)
```

- The debounce is `QUOTE_DEBOUNCE_MS = 250` (hardcoded). A sequence counter `quoteSeq` drops the
  answer of any superseded request. While a newer quote loads the card stays on screen at
  `opacity-60` with `aria-busy`.
- The effect re-fires on `[spacingId, quoteTrees, paymentMode, quoteDown, quoteDuration]` — i.e. the
  scenario never triggers a re-quote.
- `quoteDown`/`quoteDuration` are forced to `null` unless `paymentMode === "installments"`, both in
  the client and again in `quoteChoices()` on the server.
- Zod bounds in `actions.ts`: `spacingClassId: z.uuid()`, `trees: int 1…2_147_483_647 | null`,
  `paymentMode: z.enum(PAYMENT_MODES) | null`, the two option ids `z.uuid() | null`. A parse failure
  returns `null` (the card simply shows nothing) — it never throws.
- `publicTreeQuote` uses the **request-scoped** Supabase client (`@/lib/supabase/server`), so the
  caller's JWT decides `app.module_open('pricing')`: staff previewing an `internal` flag see prices,
  anonymous visitors do not.
- `toTreeQuote()` normalises numerics/bigints (they can arrive as strings) and **blanks every money
  field unless `pricing === "ok"`**.
- `public_tree_quote` returns `null` (not an error) for a retired or unknown spacing class; the page
  then prints no figures.

`public_tree_quote` was **redefined in `0045_annual_fee.sql`**; the 0031 body is dead. `app.tree_price`
was likewise redefined in 0045, and `app.financed_quote` in `0036_markup_on_remaining.sql`. The 0031
`financed_quote` (markup on the whole cash price) is history, not behaviour.

### 4.5 Every calculation — formula, source, values, worked example

Constants used in the worked examples are the **seeded global rule**
(`public.tree_pricing_rules where project_id is null`, 0031 + 0045):
land 10,000 millimes/m², planting 50,000 millimes/tree, margin `percent` 2500 bp (25 %),
`price_rounding_millimes` 1000, `monthly_rounding_millimes` 1000,
`annual_fee_per_tree_millimes` 150,000; no `tree_cost_items` seeded;
markups: 36 → 1000 bp, 48 → 1400 bp, 60 → 1800 bp, 84 → 2500 bp; `pricing.max_months` = 84.
Worked numbers below are the ones asserted in `supabase/tests/017_tree_pricing.sql` and
`supabase/tests/030_annual_fee.sql`.

#### (a) Surface per tree — `area_per_tree_m2`

```
area_m2 = row_spacing_m × tree_spacing_m          -- generated column, tree_spacing_classes (0031)
```
Source: `public.tree_spacing_classes.area_m2`. Echoed unchanged by `public_tree_quote` as
`area_per_tree_m2`. Row label `start.row_area_per_tree` = «المساحة لكل زيتونة».
**Example:** 7 × 5 → 35 م². Rendered by `areaLine()` → `formatArea` → «35 م²» / «35 m²».
Not gated by the pricing flag: the area shows even when `pricing = 'closed'`
(test 017: *“the area is shown even while prices are closed”*).

#### (b) Total surface — `total_area_m2`

```
total_area_m2 = area_m2 × trees                   -- public_tree_quote (0045 l.216)
```
`trees` is `p_trees` only when `p_trees between 1 and v_max`, where
`v_max = greatest(setting 'million.custom_trees_max' (5000), max(min_number) of active tree_count)`;
otherwise `trees = null` and **the total area is null too**.
**Example:** 35 م² × 20 = 700 م². Label `start.row_total_area` = «المساحة الجملية».

#### (c) Price of one tree — `price_per_tree_millimes`

`app.tree_price(p_spacing_class, p_project)` — 0045 (redefines 0031):

```
land_cost      = area_m2 × land_price_per_m2_millimes
extras_total   = Σ  (basis = 'per_m2' ? area_m2 × amount : amount)   over active tree_cost_items in scope
cost_per_tree  = land_cost + planting_cost_per_tree_millimes + extras_total
margin         = margin_mode = 'percent' ? cost_per_tree × margin_percent_bp / 10000
                                         : margin_fixed_millimes
price_per_tree = ceil((cost_per_tree + margin) / price_rounding) × price_rounding
```

Resolution order for every parameter: the project row of `tree_pricing_rules` when the field is
non-null, else the global row (`coalesce(v_rule.x, v_global.x)`); the margin is taken as a **block**
(`margin_mode`, `margin_percent_bp`, `margin_fixed_millimes` together). `use_global_cost_items`
(project rows only) decides whether the global cost lines are added on top of the project's own.
The function returns `ok:false, reason:'margin_not_set'` when mode, land rate, planting or rounding
is missing, `'spacing_not_found'` for an inactive class, `'spacing_not_allowed'` when a project sells
only some classes.
**`/start` always calls it with `p_project = NULL`** (`app.tree_price(v_class.id, null)`), so the
configurator is priced on the **global rule only** — never an offer's.

**Worked example (the owner's own, test 017 §3):** 35 م² × 10,000 = 350,000 land; + 50,000 planting →
`cost_per_tree` 400,000; margin 25 % → 100,000; sum 500,000; rounding 1,000 → **500,000 millimes = 500 د.ت**.
Row label `start.row_price_per_tree` = «سعر الزيتونة», printed as «ابتداءً من 500 د.ت».

Rounding is applied **once**, upward, to the unrounded sum (comment in 0045: *“the displayed parts are
indicative, the price is exact”*). None of the intermediate figures (land, planting, extras, cost,
margin, markup) ever leaves the database for a visitor — test 017 asserts the strings
`land_price`, `planting`, `extras`, `cost_per_tree`, `margin`, `markup`, `note_ar`, `markups_note_ar`
never appear in any public quote.

#### (d) Total price of the request — `total_price_millimes`

```
total_price_millimes = price_per_tree_millimes × trees      -- public_tree_quote
```
No second rounding.
**Example:** 500,000 × 20 = 10,000,000 → «ابتداءً من 10,000 د.ت».
Label `start.row_total_price` = «السعر الجملي للطلب». Null when `trees` is null.

#### (e) Annual maintenance fee — `annual_fee_per_tree_millimes`, `annual_fee_total_millimes`

Added by `0045_annual_fee.sql` (column) and `0046_annual_fee_save.sql` (Back Office write path).

```
annual_fee_per_tree = coalesce(project_rule.annual_fee_per_tree_millimes,
                               global_rule.annual_fee_per_tree_millimes)     -- app.tree_price
annual_fee_total    = annual_fee_per_tree × trees                            -- public_tree_quote
```

It is **never** part of `price_per_tree_millimes`, never financed, carries no markup
(0045 header: *“app.financed_quote is untouched: the fee is not financed and carries no markup”*).
Global seed = 150,000 millimes (150 د) per tree per year.
**Example (test 030):** 24 × 24 class, 10 trees → 150 د/tree/year, total 1,500 د/year, while the
purchase total stays 10 × 4,491 د. With `pricing` internal, both fee keys are null for a visitor while
`total_area_m2` stays visible.
Row label `start.row_annual_fee` = «معاليم الصيانة والتقليم في العام»; the note under it,
`start.annual_fee_per_tree` = «{amount} للزيتونة في العام», is filled client-side by `fill()`.
The row renders only when **both** the total and the per-tree figure exist.

#### (f) Down payment — `down_payment_millimes` and `down_payment_percent`

`app.down_payment_from_percent(p_cash_total, p_percent, p_project)` (0031):

```
down = ceil(cash_total × percent / 100 / price_rounding) × price_rounding
       -- null unless 0 < percent ≤ 100
price_rounding = app.price_rounding(p_project)
               = coalesce(project rule, global rule, 1)
```
`/start` calls it with `p_project = NULL` → the global step (1,000 millimes).
The percentage is `option_items.min_number` of the chosen `down_payment_percent` row; the quote echoes
it back as `down_payment_percent`.
**Example:** 10 % of 10,000,000 = 1,000,000 → 1,000 د.
**Rounding example (test 017):** 3 trees of 6 م² = 414 د; 10 % = 41.4 د → **42 د** (ceil to the dinar).
Row label `start.row_down` = «التسبقة»; rendered as «10% · 1,000 د.ت» (percentage label + « · » + amount).

#### (g) Financing markup, remaining amount, total financed, monthly, last instalment

`app.financed_quote(p_cash_total, p_down, p_months, p_project)` — **`0036_markup_on_remaining.sql`**,
which replaced the 0031 body (owner, 2026-09-16: the markup applies to what is financed, not to the
whole price):

```
markup_bp  = markup of that month count, project row first, else global   -- public.financing_markups
             (order by (project_id is null) limit 1 → the project row sorts first)
price_r    = coalesce(project.price_rounding_millimes,   global.price_rounding_millimes,   1)
monthly_r  = coalesce(project.monthly_rounding_millimes, global.monthly_rounding_millimes, 1)

base       = cash_total − down
remaining  = ceil(base × (10000 + markup_bp) / 10000 / price_r) × price_r
total      = down + remaining
monthly    = ceil(remaining / months / monthly_r) × monthly_r
count      = ceil(remaining / monthly)
last       = remaining − monthly × (count − 1)
shortened  = count < months
```

Guards, in order: `invalid_input` (cash ≤ 0, down < 0, months < 1, any null) → `too_many_months`
(`months > pricing.max_months`) → `duration_not_priced` (no markup row for those months) →
`down_covers_total` (`down >= cash_total`, reported with `total_financed_millimes = cash_total`).

**Worked example 1 — 20 trees, 10 %, 60 months** (test 017, and the figures `/start` prints):

| step | value |
|---|---|
| cash total | 10,000,000 (10,000 د) |
| down 10 % | 1,000,000 (1,000 د) |
| base | 9,000,000 |
| markup 60 months | 1800 bp (+18 %) |
| remaining | ceil(9,000,000 × 1.18 / 1000) × 1000 = 10,620,000 (10,620 د) |
| total financed | 1,000,000 + 10,620,000 = 11,620,000 (11,620 د) |
| monthly | ceil(10,620,000 / 60 / 1000) × 1000 = 177,000 (177 د) |
| instalments | 60, last = 177,000, `shortened = false` |

**Worked example 2 — same, 48 months (+14 %):** remaining 10,260,000; monthly
ceil(10,260,000/48/1000)×1000 = 214,000; count = ceil(10,260,000/214,000) = 48;
last = 10,260,000 − 214,000 × 47 = **202,000** (the note «آخر قسط: 202 د.ت» appears).

**Worked example 3 — 30 %, 84 months (+25 %):** down 3,000,000; base 7,000,000; remaining 8,750,000;
total 11,750,000; monthly 105,000; count 84; last 35,000.

**Worked example 4 — 1 tree, 10 %, 84 months:** cash 500,000; down 50,000; base 450,000;
remaining ceil(562,500/1000)×1000 = 563,000; monthly ceil(563,000/84/1000)×1000 = 7,000;
count = ceil(563,000/7,000) = **81**, so `shortened = true`, last = 3,000. The card then shows both
notes: «آخر قسط: 3 د.ت» and «81 قسطاً».

Row labels: `start.row_total_financed` = «السعر الجملي بالتقسيط», `start.row_remaining` =
«المبلغ المتبقي», `start.row_monthly` = «القسط الشهري», notes `start.last_installment` =
«آخر قسط: {amount}» and `start.installments_count` = «{count} قسطاً».

#### (h) The «remaining» percentage — the one figure computed in TypeScript

`calculator-summary.ts`:

```ts
function remainingShare(cashTotalMillimes, downMillimes) {
  return Math.round(((cashTotalMillimes - downMillimes) / cashTotalMillimes) * 100);
}
```
Rendered by `withPercent()` as «90% · 10,620 د.ت». The **percentage is the share of the cash price left
after the down payment** while the **amount beside it is the financed remaining (markup included)** —
two different bases, by design (the comment quotes the owner, 2026-09-16). Example: cash 10,000 د,
down 1,000 د → 90 %; amount 10,620 د.

#### (i) Duration (months)

Not computed: `duration.min_number` of the chosen `option_items` row, passed to `financed_quote`,
echoed back as `months`. Bounded by `pricing.max_months` (84) at three places: the list trigger, the
markup trigger, and inside `financed_quote`.

#### (j) Bank financing

**Not part of the configurator and never computed.** It is a yes/no question on step 4 of the
`/register` wizard (`register-wizard.tsx` → `VisitStep`), legend «تحب حل تمويل بنكي؟», hint
«التمويل البنكي خيار مستقل على التقسيط مع AgriZed. جوابك ما يلزمك بشيء.», stored as
`interest_requests.wants_bank_financing` and reported in the Back Office
(`analytics/page.tsx`: «يحب حل تمويل بنكي»). Report v3 §54 («bank financing is never computed here»)
is honoured: no code path prices it. The labels are hardcoded in the wizard, not settings.

### 4.6 Where each value comes from — the classification

Legend: **H** hardcoded in code · **DB** read from a database row · **A** admin-editable without a
deploy · **C** computed · **G** global only on `/start` · **O** offer-specific elsewhere.

| Value | Kind | Exact source | Admin screen |
|---|---|---|---|
| Tree tiers (labels, numbers) | DB, A | `option_items` list `tree_count` | Back Office → القوائم |
| Custom tree min / max | DB, A | `settings million.custom_trees_min` (1), `million.custom_trees_max` (5000) | Settings |
| Tree count used for pricing | C | `tier.min_number` or the typed number | — |
| Spacing classes, row/tree spacing | DB, A | `tree_spacing_classes` | `/admin/pricing#spacing` |
| Surface per tree (`area_m2`) | C (generated column), DB | `row_spacing_m × tree_spacing_m` | indirectly |
| Total surface | C | `area_m2 × trees` (SQL) | — |
| Offer types (scenarios) | DB, A | `ownership_scenarios` | Back Office |
| Payment modes `cash`/`installments` | **H** | `PAYMENT_MODES` in `src/lib/tree-pricing.ts`; labels from `start.payment_cash` / `start.payment_installments` | labels only |
| Down payment percentages | DB, A | `option_items` list `down_payment_percent` (`min_number` = %) | Back Office → القوائم |
| Durations (months) | DB, A | `option_items` list `duration` (`min_number` = months) | Back Office → القوائم |
| Months cap | DB, A | `settings pricing.max_months` = 84 | Settings (guarded by a trigger) |
| Land price per m² | DB, A, G (O elsewhere) | `tree_pricing_rules.land_price_per_m2_millimes` = 10,000 | `/admin/pricing` field «ثمن المتر المربع من الأرض» |
| Planting cost per tree | DB, A, G/O | `planting_cost_per_tree_millimes` = 50,000 | «تكلفة غراسة الزيتونة» |
| Extra cost lines | DB, A, G/O | `tree_cost_items` (`per_tree` / `per_m2`), none seeded | `/admin/pricing#extra-costs` |
| AgriZed margin | DB, A, G/O | `margin_mode` + `margin_percent_bp` (2500) or `margin_fixed_millimes` | `/admin/pricing` |
| Price rounding step | DB, A, G/O | `price_rounding_millimes` = 1,000 | «خطوة تدوير سعر الزيتونة» |
| Monthly rounding step | DB, A, G/O | `monthly_rounding_millimes` = 1,000 | «خطوة تدوير القسط الشهري» |
| Price per tree | C | `app.tree_price` | — |
| Total price | C | `price_per_tree × trees` | — |
| Annual fee per tree | DB, A, G/O | `tree_pricing_rules.annual_fee_per_tree_millimes` = 150,000 | «معاليم الصيانة والتقليم في العام» |
| Annual fee total | C | `fee × trees` | — |
| Financing markup per duration | DB, A, G/O | `financing_markups(months, markup_bp)`; global 36/48/60/84 = 1000/1400/1800/2500 bp | `/admin/pricing#markups` |
| Down payment amount | C | `app.down_payment_from_percent` | — |
| Remaining, total financed, monthly, last, count, shortened | C | `app.financed_quote` (0036) | — |
| Remaining **percentage** | C (TypeScript) | `remainingShare()` in `calculator-summary.ts` | — |
| Money formatting | H | `Intl.NumberFormat("en-US")` + « د.ت » (`src/lib/format.ts`), French line `fr-FR` + « DT » | — |
| Every label, hint, notice, prefix | DB, A | ~60 `settings` keys read by `startCopy()` | Settings |
| Step count, debounce, animation | **H** | `QUOTE_DEBOUNCE_MS = 250`, `ADVANCE_MS = 220`, «الخطوة N من M», «رجوع», «التالي», «تبديل» | — |
| Pricing visibility | DB, A | `feature_flags.pricing` (seeded **`internal`**, never changed by a migration) | Back Office → الوحدات |
| Page availability | DB, A | `feature_flags.interest_form` | Back Office → الوحدات |

Note on the per-offer column: `tree_pricing_rules`, `tree_cost_items` and `financing_markups` all
support a `project_id` row that overrides the global one — but **`/start` never passes a project**, so
on the configurator every one of them resolves to the global row. Offer-specific pricing only appears
through `public_project_quote` (§4.10).

### 4.7 Statuses, notices and gating

`public_tree_quote.pricing` ∈ `closed` | `unavailable` | `ok`:

| value | when | what the page shows |
|---|---|---|
| `closed` | `app.module_open('pricing')` false for this caller | areas only; every money key null; `installments` null |
| `unavailable` | `app.tree_price` returned `ok:false` (typically `margin_not_set`) | notice `start.price_unavailable` «السعر يتحدّد قريباً.» |
| `ok` | a price exists | all rows |

`installments.status` ∈ `ok` | `incomplete` | `invalid_choice` | `duration_not_priced` |
`down_covers_total` | `too_many_months` (the TS union in `tree-pricing.ts` lists all six):

| status | cause | on-screen |
|---|---|---|
| `incomplete` | mode is installments but `down_pct` or `duration` missing | no instalment rows, no notice |
| `invalid_choice` | a retired/wrong-list option id, or a percentage outside 0–100 | no rows, no notice |
| `duration_not_priced` | no `financing_markups` row for those months | notice `start.duration_not_priced` «التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى.» |
| `down_covers_total` | down ≥ cash total | notice `start.down_covers_total` «التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر.» |
| `too_many_months` | months > `pricing.max_months` | no rows, **no notice** (`calculatorSummary` maps only the two above) |

The «سجّل اهتمامك» button is enabled by `calculatorGap(choices, listSizes)`, which mirrors the intake
errors the database would raise:

```
!treeId && treesCustom === null      → "invalid_tree_choice"
!paymentMode                         → "invalid_payment_mode"
installments && downPercents.length>0 && !downPercentId → "down_payment_percent_required"
installments && durations.length>0   && !durationId     → "duration_required"
```
Its hints: `start.continue_hint` «اختر عدد الزيتونات باش تكمّل.» (trees screen),
`start.continue_hint_payment` «اختر طريقة الدفع باش تكمّل.»,
`start.continue_hint_installments` «اختر نسبة التسبقة ومدة الدفع باش تكمّل.».
Note that **the spacing class and the scenario are never required** — a request can be sent with no
price at all.

### 4.8 How the estimate card renders

`calculatorSummary(input)` builds `SummaryRow[]` in a fixed order:
`trees`, `type`, [`area_per_tree`, `total_area` — only while `spacingClasses.length > 0`],
[`price_per_tree`, `total_price` — only when priced], [`annual_fee`], `payment`,
[`down`, `duration` — only for instalments], [`total_financed`, `remaining`, `monthly`].

- `atLeast()` prefixes `start.from_prefix` = «ابتداءً من» to totals when the chosen tier is
  **open-ended** (`min_number !== null && (max_number === null || max_number > min_number)`) —
  applied to `total_area`, `annual_fee` total, `down`, `total_financed`, `remaining`, `monthly`.
- `startingAt()` prefixes the **same** «ابتداءً من» to `price_per_tree` and `total_price`
  **unconditionally** (owner, 2026-09-18: «الـMain Form موش عرض»). The two prefixes are deliberately
  not stacked on the price rows.
- The card leads with one big figure (`leadKey`): the monthly instalment when there is one, otherwise
  the total price; that row is then removed from the list below so no amount prints twice.
- The disclaimer `start.estimate_note` = «هذا تقدير أولي حسب الإعدادات الحالية. التفاصيل النهائية في
  بطاقة المشروع والعقد.» is stamped across the head of the card (`.card-estimate`, dashed, unelevated).
- Money: `moneyLine()` prints 0 decimals for whole dinars and 3 when there are millimes; Arabic via
  `formatMillimes` («10,000 د.ت»), French via `Intl.NumberFormat("fr-FR")` + « DT ».
- Accessibility: a `role="status"` live region announces a subset of rows (`ANNOUNCED`: trees,
  area_per_tree, type, total_price, payment, down, duration, monthly) 900 ms after reaching the
  summary; the `<h1>` takes focus on every step with `style={{outline:"none"}}`.
- `start.values` (a JSON array of `{icon, ar, fr}`; icons `people|leaf|hand|chart`) renders under the
  summary; unknown icon keys fall back to the leaf drawing.
- `start.tier_taglines` (JSON keyed by `tree_count` code, plus `"custom"`) prints under each tier card.

### 4.9 What happens to the answers afterwards (`/register`)

`src/app/(public)/register/page.tsx` re-reads the **same** URL contract with the same
`readCalculatorChoices`, and:

- redirects to `/start` + every original parameter (`forwardedQuery`) when no tree count is present;
- recomputes the quote server-side with `quoteChoices()` → the same RPC, and prints the same rows as
  a read-only recap («اختياراتك في الحاسبة», `register.summary_title`) with an edit link
  `/start?${calculatorQuery(choices, wantsVisit)}` labelled `start.edit_choices` «بدّل اختياراتك»;
- on submit, `src/app/(public)/register/actions.ts` re-runs `calculatorGap` before calling
  `submit_interest_request`, and maps `treeCountOptionId` **xor** `tree_count_custom`,
  `spacing_class_id`, `payment_mode`, and (only for instalments) `down_payment_percent_option_id`
  and `duration_option_id`.
- `public.submit_interest_request` (**0032**, the live definition) validates every id again and then
  **recomputes and snapshots** the figures: `price_per_tree_millimes`, `total_price_millimes`,
  `down_payment_percent`, `down_payment_amount_millimes`, `total_financed_millimes`,
  `monthly_millimes`, plus `spacing_label_ar`, `area_per_tree_m2`, `total_area_m2`, `payment_mode` —
  using `app.tree_price(spacing, null)` and the same `financed_quote`, *“so the figures match /start”*.
  It also gates on `app.module_open('pricing')`: a demand submitted while prices are closed carries no
  amounts. **The annual fee is not among the snapshotted columns** for this intake.

### 4.10 The sibling configurator on offer pages (for contrast)

`public.public_project_quote` / `app.project_quote_payload` (0034, redefined by **0048**) is the same
engine bound to one project: it calls `app.tree_price(class, project_id)`,
`app.down_payment_from_percent(total, pct, project_id)` and `app.financed_quote(…, project_id)`, adds
`project_id`/`project_code`/`on_tree_pricing`/`spacing_status`, caps `trees` by the project's own
`tree_count`, offers only the project's spacing classes (`project_spacing_classes`) and percentages
(`app.project_down_percent_items`), and — unlike `/start` — **lists only durations that actually have
a markup**. Extra `pricing` values there: `not_offered` (project not published) and `legacy` (project
lists no spacing class, so the old 0013 parcel pricing applies). It is reached from
`src/app/(public)/projects/[code]/[parcel]/page.tsx` via `getProjectQuote` in
`src/lib/public-projects.ts`. Offer pages have their own intake, `public.submit_offer_request`
(0049), which *does* snapshot `offer_annual_fee_per_tree_millimes` / `offer_annual_fee_total_millimes`
and tags the demand `request_kind = 'offer'` versus `'calculator'` for `/start` → `/register`.

### OBSERVATIONS — configurator

1. **The configurator is global-only.** `public_tree_quote` hardcodes `app.tree_price(v_class.id, null)`
   and passes `null` as the project to `down_payment_from_percent` and `financed_quote`. Per-project
   pricing rows, per-project cost lines, per-project markups and per-project down-payment lists exist
   in the schema and in the Back Office, but no answer on `/start` can reach them.
2. **The offer type answer changes nothing.** `scenarioId` is excluded from the quote effect's
   dependency array and from `TreeQuoteRequest`; it is lead data only.
3. **«ما نعرفش، اقترحولي» on the spacing screen removes every figure**, including the price per tree,
   because `quoteChoices`/`quoteStart` require a spacing uuid. The «اقترحولي» tree tier behaves
   differently: it keeps the per-tree figures and drops only the totals.
4. **`/start` lists durations the engine may not be able to price**, while the offer payload (0048)
   filters durations to those having a markup. A visitor can therefore pick a duration and land on
   «التقسيط على هذه المدة مازال ما تحدّدش».
5. **`too_many_months` has no message.** `calculatorSummary` maps `duration_not_priced` and
   `down_covers_total` to notices; a `too_many_months` plan silently shows no instalment rows.
   (It is currently unreachable from `/start` because the list trigger caps durations at
   `pricing.max_months`.)
6. **The «المبلغ المتبقي» row mixes two bases**: a percentage of the cash price beside an amount that
   includes the markup. This is intentional per the comment quoting the owner, but the row is the only
   place on the card where the number and its percentage do not describe the same quantity.
7. **`remainingShare` is the only money-adjacent computation outside Postgres.** Everything else on
   the card is either a quote field or a formatting call — the header comment of `SummaryInput`
   states the rule («every figure comes from it, never computed here»), and `remainingShare` is the
   one exception.
8. **The pricing flag is seeded `internal` and no migration flips it.** Unless the Back Office
   published it, an anonymous visitor's `/start` shows areas and no amounts at all.
9. **Dead settings are still seeded and public**: `start.per_month` / `start.per_month_fr` and
   `start.row_installment` / `start.row_installment_fr` (0019) are read by no file under `src/`;
   `start.capacity_title|hint` (+ `_fr`) were explicitly marked unused by `0041_payment_hint.sql`
   («غير مستعمل حالياً») but kept because `supabase/tests/005_start_custom_trees.sql` asserts they exist.
10. **Code fallbacks differ from the seeded values** for three keys, so the fallback text would only
    ever appear if the row were deleted: `start.custom_label` (DB «عدد مخصّص» vs code «عدد آخر»),
    `start.custom_placeholder` (DB «أدخل العدد» vs code «مثال: 120»), `start.secure_note`
    (DB «معلوماتك مؤمّنة وآمنة.» vs code «التسجيل مجاني ولا يمثل التزاماً.»).
11. **Some strings on the page are not settings**: «رجوع», «التالي», «تبديل», «الخطوة N من M»,
    «التقدم في الحاسبة» are literals in `start-chooser.tsx`, unlike every other visible word.
12. **The duration question reuses a row label as its title** (`copy.rowDuration`,
    `start.row_duration` = «مدة الدفع»); there is no dedicated question setting for it, unlike the
    five other steps.
13. **Two pricing engines coexist.** `src/lib/pricing-form.ts` + `public.compute_installment_plan`
    (0013, models `markup_brackets` / `monthly_rate` / `scenarios`) still serve legacy parcel offers
    (`public_parcel_offer`, URL params `down` / `installment`); the configurator uses none of it.
14. **The `/start` URL is rewritten on every keystroke-ish change** via
    `window.history.replaceState(window.history.state, "", …)` inside an effect keyed on
    `[query, activeStep]` — the comment records that replacing the state object with `null` broke the
    next router navigation.
15. `docs/tree-area-and-cost.md` (the owner's addendum) and the implementation agree on the formula
    and on the eight default classes. The addendum's visitor example lists five rows
    (عدد الزيتونات / المساحة لكل زيتونة / المساحة الجملية / سعر الزيتونة / السعر الجملي للطلب); the
    implementation adds «نوع المشروع», «معاليم الصيانة والتقليم في العام», «طريقة الدفع» and the four
    instalment rows, and prefixes the two price rows with «ابتداءً من» — a later owner decision
    (2026-09-18) recorded in the code comments, not in that document.

---

## 26. URL PARAMETERS

### 26.1 The `/start` ⇄ `/register` contract

Written by `calculatorQuery(choices, wantsVisit)` and read by `readCalculatorChoices(lists, params)`
— both in `src/app/(public)/start/calculator-summary.ts` / `calculator.ts`. The same contract is
produced by `interestHref()` in `src/lib/public-hrefs.ts`.

| Parameter | Type / format | Validation on read | Effect | Written by |
|---|---|---|---|---|
| `trees` | uuid of an active `tree_count` option | must match an id in `lists.treeCounts`, else dropped | selects a tier; `min_number` is the tree count used for pricing | `/start`, home cards (`/start?trees=<id>`), `/register` edit link, `interestHref` |
| `trees_custom` | 1–9 digits (`/^\d{1,9}$/`) | dropped if `trees` is present, or outside `million.custom_trees_min…max` | free tree count | `/start`, `interestHref` (parcel pages) |
| `scenario` | uuid of an active `ownership_scenarios` row | must match `config.scenarios` | offer type; no effect on any figure | `/start`, `interestHref` |
| `spacing` | uuid of an active `tree_spacing_classes` row | must match the loaded classes | surface per tree; **required for any price** | `/start`, `interestHref` |
| `payment` | `cash` \| `installments` | `parsePaymentMode`; **defaults to `installments`** when absent but `down_pct` or `duration` is present | payment mode | `/start`, `interestHref` |
| `down_pct` | uuid of a `down_payment_percent` option | must match the list; only kept when `payment=installments` | down payment percentage | `/start` (instalments only) |
| `duration` | uuid of a `duration` option | must match the list; only kept when `payment=installments` | months | `/start` (instalments only) |
| `visit` | literal `1` | `params.visit === "1"` | pre-answers «تحب تزور الأرض؟» on `/register` and travels back | `/start`, `interestHref({visit:true})` |
| `parcel` | uuid | — | see below | `interestHref` only |
| `#custom` (hash) | — | — | scroll target of the free-number card (`id="custom"`, `scroll-mt-24`) | home «عدد آخر» links |

Behaviours worth recording:

- **Only answered choices travel.** `calculatorQuery` omits empty values, and drops `down_pct` /
  `duration` entirely when the mode is not `installments`.
- **A tier wins over a typed number** when both appear (`!treeId && custom !== null` in
  `readCalculatorChoices`).
- **Unknown, retired or foreign ids are silently dropped**, never an error — a stale bookmark degrades
  to a partially answered wizard.
- `/start` mirrors the current answers into the address bar on every change
  (`history.replaceState`, §4 observation 14), so reload / share / back preserve the state.
- `/register` **redirects to `/start` with every parameter it received** (`forwardedQuery`, which
  re-appends repeated keys) when no usable tree count is present.
- `/register`'s recap edit link is `/start?${calculatorQuery(choices, wantsVisit)}` — a normalised
  query, not the incoming one.
- **`parcel` is produced but never consumed.** `interestHref({parcelId,…})` on
  `src/app/(public)/projects/[code]/[parcel]/page.tsx` sets `parcel=<uuid>` on the `/register` link,
  but `register/page.tsx` reads only the calculator keys and `visit`, and `submit_interest_request`
  (0032) writes no `project_id`/`parcel_id`. `0049_offer_intake.sql` states it plainly for the older
  columns: *“0020 gave interest_requests its project columns and no intake has ever written them”* —
  and the intake it adds for that purpose is `submit_offer_request`, reached from the offer page's own
  form, not through this parameter.

### 26.2 Public pages other than `/start`

| Route | Parameter | Format / validation | Effect |
|---|---|---|---|
| `/register` | the whole §26.1 contract + `visit` | as above | pre-fills the recap; missing tree count → redirect to `/start` |
| `/projects` | `gov` | integer id present in `config.governorates` | filter by governorate |
| | `del` | integer id, **only kept when it belongs to the chosen `gov`** | filter by delegation |
| | `type` | key of `OFFER_TYPE_LABELS` (`src/lib/projects.ts`) | filter by offer type |
| | `trees` | uuid of a `tree_count` option; filters parcels by `min/max_number` | tree-count filter (bare land is never hidden by it) |
| | `area` | uuid of a `desired_area` option | area range filter |
| | `price` | number, `0 < p ≤ 10_000_000` (dinars; compared as `p × 1000` millimes) | max price filter |
| | `available` | literal `1` | only parcels with `offered` |
| `/projects/[code]/[parcel]` | `payment` | `parsePaymentMode` | instalment simulation on the parcel's own trees (tree-priced parcels) |
| | `down_pct` | uuid (regex-checked), kept only with `payment=installments` | down payment percentage of the **project's** list |
| | `duration` | uuid, same condition | months |
| | `trees` | uuid (legacy parcels only) | pre-selected tree count forwarded to `/register` |
| | `scenario` | uuid (legacy parcels only) | pre-selected scenario forwarded to `/register` |
| | `down`, `installment` | uuids, passed to `public_parcel_offer` as `p_down_option` / `p_installment_option` | legacy (0013) parcel instalment simulation; a failing call retries without them |
| `/simulator` | — | — | permanent `redirect("/start")` |

Route parameters (not query): `/projects/[code]` and `/projects/[code]/[parcel]` are
`decodeURIComponent`-ed and must match `/^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/`, else `notFound()`.

### 26.3 Tracking parameters

`src/components/site/source-capture.tsx` reads, from **any** landing URL, on first visit of a tab:
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `ref` (each truncated to 150 chars), plus
`landing_path` and the external `document.referrer` (300 chars). It stores them in
`sessionStorage["agrized:source"]` and they are later sent with the demand as `source`, cleaned
server-side by `app.clean_source` (0003). They are never part of the calculator contract and are not
re-emitted into the address bar.

### 26.4 Back Office parameters

| Route | Parameters | Validation |
|---|---|---|
| `/admin/leads` | `q`, `residence_governorate_id`, `invest_governorate_id`, `include_anywhere`, `project_type_id`, `include_unsure`, `plantation_system`, `production_status`, `trees_min`, `trees_max`, `include_trees_any`, `duration_min`, `duration_max`, `down_payment_percent`, `wants_visit`, `wants_bank_financing`, `goal_code`, `status_id`, `assigned_to`, `from`, `to`, `source`, `duplicates_only`, `spacing_class_id`, `payment_mode`, `request_kind`, `people`, `page` | `parseLeadFilters` in `src/app/admin/(panel)/leads/filters.ts`: UUID / `^\d{1,13}$` / `^\d{1,7}$` (trees) / `^\d{1,3}$` (months) / `^\d{1,3}(\.\d{1,2})?$` (percent, normalised «10.50»→«10.5») / `^\d{4}-\d{2}-\d{2}$` / `^[a-z0-9_-]{1,50}$`; flags are the literal `1`; `wants_*` are the strings `"true"`/`"false"`; `assigned_to` also accepts `none` |
| `/admin/leads/export` (route handler) | the same set, parsed from `url.searchParams` | same function, so the CSV always matches the list |
| `/admin/pricing` | `project` (uuid, selects the project whose rules are edited); simulator: `class`, `trees` (`^\d{1,6}$`, > 0), `sim_project`, `down`, `duration` | `readSimulation` / `simulationQuery` in `pricing/simulator-section.tsx` |
| `/admin/projects/[id]` | `tab` | `readOfferTab` — must be one of the tabs this reader may open, else `"card"` |
| `/admin/projects/parcels` | `status`, `offer` | read in `parcels/page.tsx` |
| `/admin/projects/[id]/parcels/[parcelId]` | `down`, `installment` | legacy instalment preview |
| `/admin/audit` | `entity`, `action`, `actor`, `from`, `to`, `page` | — |
| `/admin/analytics` | `range`, `color`, `mode` | — |
| `/admin/land-offers` | `status`, `governorate`, `page` | — |
| `/admin` (dashboard) | `denied` | shown after a refused navigation |
| `/admin/login` | `next` | set by `src/proxy.ts` (`loginUrl.searchParams.set("next", pathname)`), which also clears the rest of the query |
| `/admin/setup` | `token` | invite token |

### OBSERVATIONS — URL parameters

1. **`parcel` is a dead parameter on `/register`** (see §26.1). The link is generated on every parcel
   page, so the piece of land a visitor was looking at is lost the moment they cross into the
   calculator intake; the offer intake (0049) solves the same problem with a different form instead.
2. **`payment` is inferred.** A URL carrying `down_pct` or `duration` without `payment` is read as
   `installments`. A URL carrying `payment=cash` together with `down_pct`/`duration` keeps the two ids
   in the parsed choices but never sends them to the quote or to the intake.
3. **Two different vocabularies for the same idea across routes**: the parcel page uses `down_pct` /
   `duration` for tree pricing but `down` / `installment` for legacy parcels, and the admin pricing
   simulator uses `down` / `duration` / `class` / `trees` / `sim_project`. `trees` means an option
   **uuid** on `/start`, `/projects` and the parcel page, but a plain **integer** in the admin
   simulator.
4. **Nothing in the calculator contract is signed or bounded in time.** Ids are validated against the
   live lists on every read, so a link shared after a list changes degrades silently rather than
   showing stale figures — consistent with the fact that `/register` recomputes every amount
   server-side before storing it.
5. **`/projects` declares filters it does not expose in its `Filters` type comment**: the type says
   *“Down payment and duration filters arrive with the duration-based pricing”*, and indeed no
   `down_pct`/`duration` parameter is read on that route today.
