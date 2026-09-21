## 14. PAYMENT / INSTALLMENT ENGINE (AND THE MONEY HALF OF SECTION 23)

Scope of this section: every financial calculation that exists in the repository — the price of one olive tree,
the cash total of an order, the down payment, the markup, the financed total, the remaining amount, the monthly
installment, the last installment, every rounding step, and the annual maintenance fee. Everything below is read
from `supabase/migrations/0001…0050`, `supabase/tests/`, `src/lib/`, `src/app/admin/` and `src/app/(public)/`.

Two engines exist side by side in the database. They are unrelated code paths with different arithmetic:

| Engine | Entry point | Unit priced | Introduced | Status in code |
|---|---|---|---|---|
| **Tree engine** (current) | `app.tree_price` → `app.financed_quote` | one olive tree with its area | `0031_tree_pricing.sql`, rewritten by `0036_markup_on_remaining.sql`, `0045_annual_fee.sql`, `0048_offer_annual_fee.sql` | drives `/start`, `/register`, offer pages, parcel pages of tree-priced projects, the Back Office simulator |
| **Legacy engine** | `public.compute_installment_plan` | a whole parcel with a typed cash price | `0013_pricing_and_matching.sql` | never redefined; still installed and granted; reached only by `app.parcel_offer_payload` (0020) and `public.match_requests_for_parcel` (0013) |

---

### 14.1 Units, storage, and where money is formatted

* Money is stored everywhere as **integer millimes** (`bigint`). 1 TND = 1000 millimes. Stated in
  `src/lib/format.ts` line 1 (`SIM-07`) and in the project instructions.
* Percentages of the pricing rules are stored as **basis points** (`integer`, 1 bp = 0.01 %):
  `tree_pricing_rules.margin_percent_bp`, `financing_markups.markup_bp`.
* The down-payment percentage is stored as a plain percentage in `option_items.min_number`
  (`numeric(12,2)`, added by `0010_ownership_area_priority.sql`), and snapshotted on a demand as
  `interest_requests.down_payment_percent numeric(5,2)`.
* Durations are stored as whole **months** in `option_items.min_number` for `list_key = 'duration'`, and in
  `financing_markups.months integer`.
* Areas are `numeric`; `tree_spacing_classes.area_m2` is a **generated stored column**
  `row_spacing_m * tree_spacing_m` (`numeric(10,2)`).
* Formatting is done only in TypeScript, never in SQL:
  * `src/lib/format.ts` → `formatMillimes(millimes, { withMillimes })` divides by 1000 and appends `د.ت`,
    with `en-US` grouping, 0 or 3 fraction digits.
  * `src/app/(public)/start/calculator-summary.ts` → `moneyLine()` shows millimes **only when
    `millimes % 1000 !== 0`**, and produces the French twin as `… DT` with `fr-FR` grouping.
  * `src/components/admin/tree-pricing-inputs.ts(x)` → `formatMoney`, `formatPercent` (`12.5%`),
    `formatBp(bp) = formatPercent(bp/100)`, plus the input round-trip helpers `millimesToInput`
    (`10500 → "10.5"`) and `bpToInput` (`1250 → "12.5"`).
  * `src/app/admin/(panel)/leads/export/route.ts` → `dinars(v) = (v/1000).toFixed(3)` for the CSV,
    `percent(v) = String(Number(v))`.
* Back-office input parsing is text-scaled, never float-scaled:
  `src/app/admin/(panel)/pricing/form-values.ts` — `dinarsToMillimes` = up to 3 decimals, 9 integer digits;
  `percentToBp` = up to 2 decimals, 4 integer digits; `metres` = up to 2 decimals. Arabic-Indic digits and
  `٫`/`,` decimal separators are normalised first.

---

### 14.2 The tables the tree engine reads

| Table (migration) | Rows | What it holds |
|---|---|---|
| `public.tree_spacing_classes` (0031) | 8 seeded | `row_spacing_m`, `tree_spacing_m`, generated `area_m2`, `is_active` |
| `public.tree_pricing_rules` (0031, `annual_fee_per_tree_millimes` added by 0045) | 1 global row (`project_id is null`, unique partial index `tree_pricing_rules_one_global`) + at most one row per project (`project_id` is `unique`) | land rate, planting cost, margin, the two rounding steps, `use_global_cost_items`, the annual fee, two internal notes |
| `public.tree_cost_items` (0031) | none seeded | extra cost lines, `basis in ('per_tree','per_m2')`, `amount_millimes`, global (`project_id is null`) or per project |
| `public.financing_markups` (0031) | 4 global rows seeded | `(project_id, months) unique nulls not distinct`, `markup_bp` |
| `public.project_spacing_classes` (0031) | — | which classes an offer sells; no rows = every active class |
| `public.project_down_payment_percents` (0031) | — | which down-payment percentages an offer offers; no rows = every active item |
| `public.option_items` list `down_payment_percent` (0031) | 3 seeded | percentage in `min_number` |
| `public.option_items` list `duration` (0030 + 0031) | 4 seeded | months in `min_number` |
| `public.settings` key `pricing.max_months` (0031) | 1 | system cap, seeded `84` |

Inheritance rule, implemented identically in `app.tree_price` and `app.financed_quote`: a project row's
**null field inherits the global value**, field by field, except the margin which inherits as a *triple*
(`margin_mode` / `margin_percent_bp` / `margin_fixed_millimes`) — `0045_annual_fee.sql` lines 74-78:

```sql
if v_rule.margin_mode is not null then
  v_mode := v_rule.margin_mode;  v_bp := v_rule.margin_percent_bp;  v_fixed := v_rule.margin_fixed_millimes;
else
  v_mode := v_global.margin_mode;  v_bp := v_global.margin_percent_bp;  v_fixed := v_global.margin_fixed_millimes;
end if;
```

`tree_pricing_rules_global_check` forces the global row to carry `land_price_per_m2_millimes`,
`planting_cost_per_tree_millimes`, `price_rounding_millimes` and `monthly_rounding_millimes`.

---

### 14.3 `app.tree_price(p_spacing_class uuid, p_project uuid default null) returns jsonb`

Current definition: **`supabase/migrations/0045_annual_fee.sql` lines 27-131** (it replaces the first definition
in `0031_tree_pricing.sql` lines 401-497; the only change is the annual fee). `stable security definer`,
`revoke execute … from public, anon, authenticated` — the formula never leaves Postgres.

Guards, in order:
1. class must exist **and** be `is_active`, else `{"ok": false, "reason": "spacing_not_found"}`;
2. if the project lists classes and this one is not among them →
   `{"ok": false, "reason": "spacing_not_allowed", "area_m2": …}`;
3. if `margin_mode`, land rate, planting cost or price rounding resolve to null →
   `{"ok": false, "reason": "margin_not_set", "area_m2": …, "annual_fee_per_tree_millimes": …}`.

**The formula** (0045 lines 101-105):

```
area            = tree_spacing_classes.area_m2                       -- row_spacing_m × tree_spacing_m
land            = area × land_price_per_m2_millimes
extras_total    = Σ over active tree_cost_items in scope:
                     basis = 'per_m2'  → area × amount_millimes
                     basis = 'per_tree'→ amount_millimes
cost            = land + planting_cost_per_tree_millimes + extras_total          -- unrounded numeric
margin          = margin_mode = 'percent' → cost × margin_percent_bp / 10000
                  margin_mode = 'fixed'   → margin_fixed_millimes
price_per_tree  = ceil( (cost + margin) / price_rounding_millimes ) × price_rounding_millimes
```

Notes that matter:
* The **margin percentage applies to the whole cost**, extras included — not to the land only.
* There is **one rounding, at the end, upward**. The comment on line 104 is explicit: *"Rounded once, up, from
  the unrounded sum: the displayed parts are indicative, the price is exact."* The component amounts returned in
  the payload (`land_cost_millimes`, `extras_total_millimes`, `cost_per_tree_millimes`, `margin_millimes`) are
  `round()`-ed to the nearest millime **for display only** and do not feed the price.
* A `'fixed'` margin ignores the cost entirely.

Which cost lines are in scope (0045 lines 95-98): global lines (`project_id is null`) are included when
`p_project is null` **or** when the project's `use_global_cost_items` is true (default true); the project's own
lines are always included when `p_project` is given. `scope_rank` puts global lines before project lines in the
returned `extras` array.

Returned keys: `ok, area_m2, land_price_per_m2_millimes, land_cost_millimes, planting_cost_millimes, extras,
extras_total_millimes, cost_per_tree_millimes, margin_mode, margin_percent_bp, margin_fixed_millimes,
margin_millimes, price_per_tree_millimes, annual_fee_per_tree_millimes, sources{land, planting, margin,
rounding, annual_fee}` — each `sources` entry is the literal string `'project'` or `'global'`.

**Worked value with the seeded global rule** (`supabase/tests/017_tree_pricing.sql` lines 158, 264-270):
class `int_7x5` = 7 × 5 = 35 m²; 35 × 10 د = 350 د land; + 50 د planting = 400 د cost; + 25 % = 100 د margin;
500 د → rounded up to the 1 د step = **500 د per tree**. 24 trees would be … the test uses 25 trees →
`total_price_millimes = 12,000,000` (12,000 د) and `total_area_m2 = 875`.

**Second worked value** (`supabase/tests/030_annual_fee.sql` lines 71-76): class 24 × 24 = 576 m², rule
7 د/m² + 50 د planting + 10 % margin → 4032 + 50 = 4082 د cost, margin 408.2 د, 4490.2 د → ceil to 1 د =
**4,491 د**; and an offer with its own 8 د/m² + 20 د on 7 × 7 = 49 m² → 392 + 20 = 412 د, +10 % = 453.2 د →
**454 د**.

---

### 14.4 Cash total, and the price of a parcel

**Cash total of an order** is a plain multiplication, done in SQL, never re-rounded:
`v_total := v_per_tree * v_trees` — `0045_annual_fee.sql` line 177 (`public_tree_quote`),
`0048_offer_annual_fee.sql` line 68 (`app.project_quote_payload`), `0031` line 693 (`staff_tree_quote`),
`0032_intake_pricing.sql` line 352 (`submit_interest_request`). Because `price_per_tree_millimes` is already a
multiple of the rounding step, the total is too.

**`app.parcel_price(p_parcel uuid) returns jsonb`** — current definition `0045_annual_fee.sql` lines 243-311
(first written in `0034_project_quote.sql` lines 157-219). It is described in `0034` and in the plan as *the one
definition of a parcel's price*. Two branches:

* `status = 'legacy'` (the project lists no spacing class):
  `cash_total_millimes = nullif(parcels.cash_price_millimes, 0)`,
  `total_area_m2 = parcels.area_m2`,
  `annual_fee_total_millimes = nullif(parcels.annual_costs_millimes, 0)`,
  `annual_fee_per_tree_millimes = null`, `pricing = 'legacy'`, `on_tree_pricing = false`.
* tree pricing: class resolved by `app.project_spacing_choice` (the parcel's class, or the project's only class),
  then
  `price_per_tree_millimes = app.tree_price(class, project)->price_per_tree_millimes`,
  `cash_total_millimes = price_per_tree × trees`,
  `total_area_m2 = area_per_tree × trees`,
  `annual_fee_per_tree_millimes` / `annual_fee_total_millimes = fee × trees`,
  `pricing = 'ok'` only when both the per-tree price and the tree count exist, otherwise `'unavailable'` with a
  `reason` of `spacing_required | spacing_not_allowed | spacing_not_found | margin_not_set | trees_missing`.
  `trees` is guarded by `v_trees := case when olive_tree_count >= 1 then olive_tree_count end`.

`app.parcel_price` has **no flag and no status gate**; every caller gates
(`public_parcels()`, `public_projects()`, `public_coverage()`, `staff_project_parcel_prices()` in
`0035_projects_tree.sql`).

A tree-priced parcel stores `cash_price_millimes = 0`
(`src/app/admin/(panel)/projects/actions.ts` line 275: `cash_price_millimes: onTree ? 0 : …`), and
`app.parcel_price` treats a stored `0` as "no price" via `nullif`.

---

### 14.5 The down payment — `app.down_payment_from_percent`

`0031_tree_pricing.sql` lines 371-381:

```sql
select case
         when p_cash_total_millimes >= 0 and p_percent > 0 and p_percent <= 100
         then (ceil(p_cash_total_millimes::numeric * p_percent / 100 / app.price_rounding(p_project))
               * app.price_rounding(p_project))::bigint
       end
```

* The percentage is applied to the **cash total**, never to the financed total (plan Q-2; the `/start` hint
  setting says so in Arabic: `start.down_percent_hint` = «التسبقة تتحسب من السعر الجملي بالحاضر.»).
* The result is **rounded up to the price step** of the scope. Test evidence
  (`supabase/tests/017_tree_pricing.sql` lines 599-602): 3 trees at 138 د = 414 د, 10 % = 41.4 د → **42 د**.
* Returns `null` outside `0 < p ≤ 100` — the caller then reports `invalid_choice`.
* `app.price_rounding(p_project)` (0031 lines 360-366) = the project's `price_rounding_millimes` if set,
  else the global one, else `1`.

There is **no minimum-down-payment rule in the tree engine**. `min_down_pct` exists only in the legacy
`pricing.default` JSON (§14.11).

---

### 14.6 `app.financed_quote` — the installment engine

**Current definition: `supabase/migrations/0036_markup_on_remaining.sql` lines 16-82.** It replaces the first
definition in `0031_tree_pricing.sql` lines 504-566, same signature
`(p_cash_total_millimes bigint, p_down_millimes bigint, p_months integer, p_project uuid default null)`
and same output keys, so `public_tree_quote`, `submit_interest_request` and `app.project_quote_payload` call it
unchanged.

**The change of 2026-09-16 (the single most important fact of this section).** Before 0036 the markup applied to
the whole cash price and the down payment was subtracted afterwards, so the markup in dinars was identical
whatever the down payment. After 0036 the down payment is paid at the cash price and **only the financed part
carries the markup**.

| | Superseded (0031) | Current (0036) |
|---|---|---|
| refusal test | `p_down >= total_financed` | `p_down >= p_cash_total` |
| total financed | `ceil(cash × (10000+bp)/10000 / price_r) × price_r` | `down + remaining` |
| remaining | `total_financed − down` | `ceil((cash − down) × (10000+bp)/10000 / price_r) × price_r` |
| effect of a bigger down payment | markup unchanged in dinars | markup smaller in dinars |

**Current algorithm, step by step** (0036 lines 30-81):

1. **Input guard.** `cash > 0`, `down >= 0`, `months >= 1`, else `{"ok": false, "reason": "invalid_input"}`.
2. **Cap.** `months > app.setting_int('pricing.max_months', 84)` → `{"ok": false, "reason": "too_many_months"}`.
3. **Markup lookup.**
   ```sql
   select m.markup_bp from public.financing_markups m
   where m.months = p_months and (m.project_id is null or m.project_id = p_project)
   order by (m.project_id is null) limit 1;
   ```
   `order by (project_id is null)` puts `false` (the project row) first, so **a project row wins over the
   global row for the same months**. No row at all → `{"ok": false, "reason": "duration_not_priced"}` —
   *a duration without a markup is never priced*.
4. **Rounding steps.** `price_rounding_millimes` and `monthly_rounding_millimes`, project row first then global
   row, `coalesce(…, 1)` as the last resort.
5. **Down-payment ceiling.** `if p_down >= p_cash_total` →
   `{"ok": false, "reason": "down_covers_total", "total_financed_millimes": <the cash total>}`.
6. **The arithmetic:**
   ```
   base       = cash_total − down
   remaining  = ceil( base × (10000 + markup_bp) / 10000 / price_rounding ) × price_rounding
   total      = down + remaining
   monthly    = ceil( remaining / months / monthly_rounding ) × monthly_rounding
   count      = ceil( remaining / monthly )
   last       = remaining − monthly × (count − 1)
   shortened  = count < months
   ```
7. Output keys: `ok, markup_bp, total_financed_millimes, down_payment_millimes, months, remaining_millimes,
   monthly_millimes, last_installment_millimes, installments_count, shortened`.

**Why the last installment differs.** `monthly` is rounded **up** to the monthly step, so every installment is
at or above the exact share `remaining / months`. The excess accumulates and the last installment absorbs it:
`last = remaining − monthly × (count − 1)`, which is always `≤ monthly` and `> 0`. When the rounding-up is
large enough relative to the duration, `count` falls below `months` and the plan ends early — that is the
`shortened` flag. Comment, 0036 line 68: *"Rounded up so no installment is below the exact share; the last one
absorbs the difference (owner choice)."*

**Worked examples, all from `supabase/tests/017_tree_pricing.sql` lines 542-603** (global rule: 10 د/m²,
50 د planting, 25 % margin, 1 د price step, 1 د monthly step; class 7 × 5 = 35 m² → 500 د/tree):

| Order | % down | Months | Markup | Down | Base | Remaining | Total financed | Monthly | Count | Last | shortened |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 trees = 10,000 د | 10 % | 60 | 18 % | 1,000 د | 9,000 د | 10,620 د | 11,620 د | 177 د | 60 | 177 د | false |
| 20 trees = 10,000 د | 10 % | 48 | 14 % | 1,000 د | 9,000 د | 10,260 د | 11,260 د | 214 د | 48 | 202 د | false |
| 20 trees = 10,000 د | 30 % | 84 | 25 % | 3,000 د | 7,000 د | 8,750 د | 11,750 د | 105 د | 84 | 35 د | false |
| 1 tree = 500 د | 10 % | 84 | 25 % | 50 د | 450 د | 563 د | 613 د | 7 د | **81** | 3 د | **true** |
| 3 trees of 6 m² = 414 د | 10 % | 60 | 18 % | 42 د | 372 د | 439 د | 481 د | — | — | — | — |

The 48-month row shows the rounding tail exactly: `10,260 / 48 = 213.75` → 214 د; `214 × 47 = 10,058`;
last = `10,260 − 10,058 = 202 د`. The 84-month one-tree row shows the shortening: `563 / 84 = 6.70` → 7 د;
`ceil(563/7) = 81` installments instead of 84; last = `563 − 7 × 80 = 3 د`.

**There is no interest, no amortisation schedule and no compounding.** The markup is a flat multiplier applied
once to the financed part. Nothing in the repository stores a payment schedule, a due date, a receipt, a contract
or a balance: the table list of the whole database (`supabase/migrations/*.sql`) contains no contract, payment,
invoice or installment table. The engine produces quotes only.

Bank financing is explicitly out of scope; `0031` header line 10 records *"§54: bank financing is never computed
here"*, and the only trace of it is the yes/no question `interest_requests.wants_bank_financing`.

---

### 14.7 The public entry points and their staff twins

| Function | File / lines | Scope it prices | Granted to | Gate |
|---|---|---|---|---|
| `public.public_tree_quote(p_spacing_class, p_trees, p_payment_mode, p_down_percent_option_id, p_duration_option_id)` | `0045_annual_fee.sql` 137-231 (replaces `0031` 573-662) | **always the global rule** (`app.tree_price(v_class.id, null)`, `down_payment_from_percent(…, null)`, `financed_quote(…, null)`) | `anon`, `authenticated` | `app.module_open('pricing')`; otherwise `pricing = 'closed'` |
| `public.staff_tree_quote(p_spacing_class, p_trees, p_project, p_down_percent numeric, p_months integer)` | `0031` 674-720 | the given project, or global | `authenticated`, body raises `forbidden` unless `app.can_price()` | none (no flag gate) |
| `public.public_project_quote(p_project, p_spacing_class, p_trees, p_payment_mode, p_down_percent_option_id, p_duration_option_id)` | `0034_project_quote.sql` 378-392, builder replaced by `0048` 7-159 | that project | `anon`, `authenticated` | `app.project_visible(status)`, then `pricing = 'closed'` (flag) / `'not_offered'` (status ≠ `published`) / `'legacy'` (no classes) |
| `public.staff_project_quote(…)` | `0034` 394-405 | that project | `authenticated`, raises `forbidden` unless `app.is_staff()` | no flag gate, no published-only rule |

`app.project_quote_payload(…, p_staff boolean)` — `0048_offer_annual_fee.sql` lines 7-159 — is the one builder
behind the last two. `p_staff = true` skips the flag and the published rule; the internal breakdown
(`price`) and `installments.markup_bp` are added only when `v_breakdown := p_staff and app.can_price()`.

Differences that change the numbers:

* `public_tree_quote` **never takes a project**, so `/start` always quotes the global rate card. Per-offer
  overrides only ever appear on an offer page or a parcel page.
* `public_tree_quote` validates the two choices with `app.active_option('down_payment_percent', …)` and
  `app.active_option('duration', …)`; `app.project_quote_payload` instead validates the percentage against
  `app.project_down_percent_items(project)`, i.e. the percentages that offer narrows to.
* The maximum tree count is
  `greatest(app.setting_int('million.custom_trees_max', 5000), max(option_items.min_number for 'tree_count'))`,
  and in `project_quote_payload` it is then replaced by `nullif(projects.tree_count, 0)` when the offer has one
  (`0048` lines 45-50). A count outside `1..max` yields `trees = null` and therefore no total.
* `choices.durations` in `project_quote_payload` lists only durations that are active, within
  `pricing.max_months`, **and have a markup row** for this project or globally (`0048` lines 125-133) — the
  unpriced durations never reach the page.

`installments.status` values produced by the public quotes: `ok`, `incomplete` (a choice missing),
`invalid_choice` (an id not in the allowed list / retired), or the `reason` of `app.financed_quote`
(`duration_not_priced`, `down_covers_total`, `too_many_months`, `invalid_input`).

What the public payload deliberately does **not** contain: `land_price`, `planting`, `extras`,
`cost_per_tree`, `margin`, `markup`, `note_ar`, `markups_note_ar` — asserted word by word in
`supabase/tests/017_tree_pricing.sql` lines 629-632.

---

### 14.8 The annual maintenance fee — **outside** the purchase price

Unambiguous, at every layer:

* **Storage.** `tree_pricing_rules.annual_fee_per_tree_millimes bigint check (>= 0)`, added by
  `0045_annual_fee.sql` lines 12-13, seeded on the global row with **150,000 millimes = 150 د per tree per
  year** (`0045` lines 19-21). Column comment: *"Yearly care of one tree (pruning, upkeep, follow-up)…
  Null on an offer inherits the global row; null on the global row means no fee is shown."*
* **The engine never adds it.** `app.tree_price` resolves `v_annual` (0045 line 73) and returns it as a separate
  key `annual_fee_per_tree_millimes`, with the comment on line 121: *"Paid every year, not part of the price
  above."* It is absent from `v_cost`, from `v_margin` and from `v_price`.
* **`app.financed_quote` never sees it.** `0045` header lines 9-10: *"app.financed_quote is untouched: the fee
  is not financed and carries no markup (0036)."* The function takes only a cash total, a down payment and a
  number of months.
* **Test.** `supabase/tests/030_annual_fee.sql` lines 71-76 asserts the price of a 576 m² tree is exactly
  4,491,000 millimes *"the yearly fee never joins the purchase price"*.
* **Totals.** The quotes expose `annual_fee_total_millimes = annual_fee_per_tree_millimes × trees`
  (`0045` line 228, `0048` line 155), `app.parcel_price` the same for a parcel's trees (`0045` line 307).
* **It is gated exactly like a price.** When `app.module_open('pricing')` is false, the quote returns
  `pricing = 'closed'` and both fee keys are null (`0045` lines 227-228; test 030 lines 100-113:
  *"a visitor who may not see prices sees no yearly fee either"*, while areas stay visible).
* **Scope.** Per-offer overridable, inherited from the global row. `app.tree_price` reports the origin in
  `sources.annual_fee` (`'project'` or `'global'`).
* **Saving it** goes through `public.staff_save_pricing_rule`, re-defined by `0046_annual_fee_save.sql`
  lines 7-87 (the 0031 version ignored the key, so the field was inert). An empty string clears it
  (`nullif(p->>'annual_fee_per_tree_millimes','')::bigint`, line 42) — meaning "no fee of its own".
* **Arabic copy** (`0047_annual_fee_copy.sql`): row label `start.row_annual_fee` =
  «معاليم الصيانة والتقليم في العام», note `start.annual_fee_per_tree` = «{amount} للزيتونة في العام»
  (and the `_fr` twins «Entretien et taille par an», «{amount} par olivier et par an»). Emptying the label
  hides the row; emptying the note hides the note.

Rendered: `/start` and `/register` summary (`src/app/(public)/start/calculator-summary.ts` lines 269-282, a row
keyed `annual_fee` whose value is the total and whose note is the per-tree amount) and the offer interest form
(`src/app/(public)/projects/[code]/offer-interest-form.tsx` line 99, 250).

**Separate, older concept with a similar name:** `projects.annual_costs_millimes` and
`parcels.annual_costs_millimes` (`0012_projects_and_parcels.sql` lines 32 and 75), typed by hand per project or
parcel, shown publicly as «المصاريف السنوية التقديرية» (`src/components/site/offer-block.tsx` lines 62-64).
`app.parcel_price` maps the parcel one into the key `annual_fee_total_millimes` for **legacy** parcels only
(`0045` line 275).

---

### 14.9 Snapshots — the figures a demand keeps (LEAD-02)

**Calculator intake** — `public.submit_interest_request(p jsonb)`, current definition
`0032_intake_pricing.sql` (money block lines 347-366, insert lines 377-417). The prices are **recomputed at
submission**, never trusted from the client:

```sql
if v_spacing.id is not null and v_tree_n is not null and app.module_open('pricing') then
  v_price := app.tree_price(v_spacing.id, null);
  ...
  v_price_total := v_price_tree * v_tree_n;
  if v_payment_mode = 'installments' and v_percent.id is not null and v_duration.id is not null then
    v_quote := app.financed_quote(v_price_total,
                                  app.down_payment_from_percent(v_price_total, v_percent.min_number, null),
                                  v_duration.min_number::integer, null);
```

Columns written: `spacing_class_id`, `spacing_label_ar`, `area_per_tree_m2`, `total_area_m2`, `payment_mode`,
`price_per_tree_millimes`, `total_price_millimes`, `down_payment_percent_option_id`, `down_payment_percent`,
`down_payment_amount_millimes`, `total_financed_millimes`, `monthly_millimes`, `duration_option_id`,
`duration_label_ar`, `duration_months`. Prices are left null when the `pricing` module is closed to the caller
(test 018 line 151). The confirmation SMS payload carries `trees`, `total_area_m2`, `total_price_millimes`
(`0032` lines 418-423).

**Offer intake** — `public.submit_offer_request(p jsonb)`, `0049_offer_intake.sql` lines 53-236. It prices with
the same builder the offer page uses, for the requested number of trees:

```sql
v_quote := app.project_quote_payload(v_project.id, null, v_trees, 'cash', null, null, false);
```

and writes `request_kind = 'offer'`, `offer_trees`, `offer_price_per_tree_millimes`,
`offer_total_price_millimes`, `offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes`, plus the
shared `price_per_tree_millimes` / `total_price_millimes` so the existing CRM lists keep working. Trees are
bounded `1 .. projects.tree_count` (`invalid_offer_trees`). When prices are closed the request is still taken,
with the money columns null. Both intakes are `security definer`, `revoke … from public, anon, authenticated`,
`grant … to service_role`, and are called from the server with `createAdminClient(...)`
(`src/app/(public)/register/actions.ts` line 137, `src/app/(public)/projects/[code]/offer-actions.ts` line 73).

**Reading them back.** `public.crm_search_requests` (`0032` lines ~480-648) returns `total_price_millimes`,
`down_payment_percent`, `down_payment_amount_millimes`, `total_financed_millimes`, `monthly_millimes`,
`duration_months` and filters on `down_payment_percent` (exact) among others. The CSV export
(`src/app/admin/(panel)/leads/export/route.ts` lines 146-152) writes them as dinar amounts.
The **0049 offer columns are not in the view** — `src/app/admin/(panel)/leads/offer-snapshot.ts` reads them
straight from `public.interest_requests` and documents why; the fixing migration
`supabase/pending/bb_crm_offer_columns.sql` is drafted and **not applied**.

**Analytics.** `analytics.total_price_bands_millimes` (`0032` line 658, seeded `[]`, `json`, group `pricing`,
not public) holds the upper bounds of the total-price bands of the demand report; with `[]` the report returns
no band at all. The report also breaks down `by_down_payment_percent` and `by_duration`.

---

### 14.10 The legacy engine — `public.compute_installment_plan`

`0013_pricing_and_matching.sql` lines 39-134. `immutable`, granted to `authenticated` and `service_role`
(`0020` line 23 revokes it from `public, anon`). Never redefined by a later migration.

Signature `(p_cash_millimes, p_down_millimes, p_installment_millimes, p_pricing jsonb)`. The visitor picks a
**monthly amount**, and the function derives the number of months — the opposite of the tree engine. Three
models:

* `markup_brackets` (the default): for each bracket in ascending `max_months`,
  `total = round(cash × (1 + markup_pct/100))` — **`round()`, nearest, no rounding step** —
  `months = ceil((total − down) / installment)`; the first bracket whose `months <= least(bracket.max_months,
  max_months)` wins; `last_installment = (total − down) − installment × (months − 1)`.
* `monthly_rate`: `months = ceil(financed / (installment − financed × rate))`,
  `total = cash + round(financed × rate × months)`.
* `scenarios`: a stored table of `{down, installment, months, total}` rows; no arithmetic.
* Refusals: `missing_price`, `invalid_input`, `down_payment_too_low` (below
  `ceil(cash × min_down_pct / 100)`), `installment_too_low` (below `min_installment_millimes`),
  `too_many_months`, `no_matching_scenario`. `down >= cash` returns a `model: 'cash'` plan with `months = 0`.

The formula a parcel uses is `app.parcel_pricing(parcel)` (`0013` lines 137-147): the parcel's own `pricing`
jsonb, else the project's, else the setting `pricing.default`. `src/lib/pricing-form.ts` edits that jsonb with
plain fields (models labelled «هامش حسب مدة الخلاص», «هامش شهري», «تركيبات جاهزة»).

Callers: `app.parcel_offer_payload` (`0020_public_projects.sql` lines 92-266) which builds a full
down × installment **matrix** and up to `projects.installment_examples` worked examples, and
`public.match_requests_for_parcel` (`0013` lines 211-213) which uses a successful plan as a 15-point matching
weight. Rendered by `src/components/site/offer-block.tsx` (legacy parcels) and by
`src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx`.

`app.parcel_down_from(p_parcel, p_cash)` (`0022_cards_and_costs_v3.sql` lines 35-45) is the listing card's
«ابتداءً من X د تسبقة»: the smallest active `down_payment` option that is `< cash` and
`>= ceil(cash × min_down_pct / 100)`. In `public_parcels()` (`0035` lines 122-127) a tree-priced parcel instead
gets `app.down_payment_from_percent(cash_total, min(project percentages), project)`.

---

### 14.11 Every rounding step in one place

| Step | Direction | Granularity | Where |
|---|---|---|---|
| price of one tree | **up** (`ceil`) | `price_rounding_millimes` (seeded 1000 = 1 د) | `app.tree_price`, `0045` line 105 |
| down payment | **up** (`ceil`) | `price_rounding_millimes` | `app.down_payment_from_percent`, `0031` line 377 |
| remaining (financed part, markup applied) | **up** (`ceil`) | `price_rounding_millimes` | `app.financed_quote`, `0036` line 64 |
| monthly installment | **up** (`ceil`) | `monthly_rounding_millimes` (seeded 1000 = 1 د) | `app.financed_quote`, `0036` line 67 |
| installments count | **up** (`ceil`) | 1 | `app.financed_quote`, `0036` line 68 |
| last installment | none — it is the remainder | 1 millime | `app.financed_quote`, `0036` line 76 |
| cash total = per-tree × trees | none | — | already a multiple of the price step |
| total financed = down + remaining | none | — | both terms already rounded |
| annual fee total = fee × trees | none | — | `0045` line 228 |
| displayed cost parts (`land_cost_millimes`, `margin_millimes`, `cost_per_tree_millimes`, `extras_total_millimes`, each extra's `cost_millimes`) | nearest (`round`) | 1 millime | `app.tree_price`, display only |
| legacy `total_millimes` | nearest (`round`) | 1 millime, no step | `compute_installment_plan`, `0013` lines 106, 119 |
| legacy `months` | **up** (`ceil`) | 1 | `0013` lines 102, 120 |
| legacy minimum down payment | **up** (`ceil`) | 1 millime | `0013` line 68, `0022` line 43 |

Rounding steps are **per offer with a global default** (§14.12). A step of `1` millime means "no rounding"; the
Back Office hint says exactly that: «مثال: 1 للتدوير إلى الدينار، أو 0.001 بلا تدوير»
(`src/app/admin/(panel)/pricing/actions.ts` line 153).

---

### 14.12 SECTION 23 (money half) — every stored number, its current value, and its scope

#### 23.a `public.tree_pricing_rules` — global row and per-offer overrides

| Column | Seeded global value | Per offer? | Constraint |
|---|---|---|---|
| `land_price_per_m2_millimes` | `10000` = **10 د / m²** | **yes** (null inherits) | `>= 0`; required on the global row |
| `planting_cost_per_tree_millimes` | `50000` = **50 د / tree** | **yes** | `>= 0`; required on the global row |
| `margin_mode` | `'percent'` | **yes**, as a triple with the two below | `in ('percent','fixed')`; once set globally it can be changed but never unset (`staff_save_pricing_rule`) |
| `margin_percent_bp` | `2500` = **25 %** | **yes** | `between 0 and 100000` (0 %…1000 %) |
| `margin_fixed_millimes` | `null` | **yes** | `>= 0` |
| `price_rounding_millimes` | `1000` = **1 د** | **yes** | `>= 1`; required on the global row |
| `monthly_rounding_millimes` | `1000` = **1 د** | **yes** | `>= 1`; required on the global row |
| `annual_fee_per_tree_millimes` | `150000` = **150 د / tree / year** | **yes** | `>= 0`; null on the global row = no fee shown |
| `use_global_cost_items` | `true` | **project only** (forced `true` on the global row) | — |
| `note_ar` | «هامش 25% مأخوذ من مثال المالك (زيتونة 35 م² ← 500 د). يُراجع مع المالية قبل نشر الأسعار.» | per scope | ≤ 1000 chars, never public |
| `markups_note_ar` | «نِسَب الزيادة حسب المدة (36 شهر +10%، 48 +14%، 60 +18%، 84 +25%) أمثلة مبدئية من المالك. تُراجع مع المالية قبل نشر الأسعار.» | per scope | ≤ 1000 chars, never public |

Both seeded notes flag the figures as **owner examples awaiting Finance approval**.

#### 23.b `public.financing_markups` — the markup per duration

Seeded global rows (`0031` lines 279-284):

| months | `markup_bp` | percentage | Arabic label of the matching duration item |
|---|---|---|---|
| 36 | `1000` | **+10 %** | «3 سنوات» (`d_36`) |
| 48 | `1400` | **+14 %** | «4 سنوات» (`d_48`) |
| 60 | `1800` | **+18 %** | «5 سنوات» (`d_60`) |
| 84 | `2500` | **+25 %** | «7 سنوات» (`d_84`) |

**Per offer: yes** — a row with a `project_id` wins over the global row for the same months. `markup_bp` is
constrained `between 0 and 100000`. Rows are replaced wholesale by
`public.staff_save_financing_markups(p_project, p_rows, p_reason)`; a month with an empty field is simply not
saved, and a duration with no row is **not priced** (`duration_not_priced`). Keyed by months, not by option id —
two duration items with the same months share one markup row
(`src/app/admin/(panel)/pricing/page.tsx` lines 110-115).

#### 23.c `public.option_items` list `down_payment_percent` (list created by `0031` line 81)

| code | `label_ar` | `min_number` |
|---|---|---|
| `dpp_10` | `10%` | 10 |
| `dpp_20` | `20%` | 20 |
| `dpp_30` | `30%` | 30 |

Guard `app.check_down_percent_item`: `min_number` must be `> 0` and `<= 100`, and `max_number` must equal
`min_number` when given. **The values are global**: an offer can only *narrow* the list through
`project_down_payment_percents` (an empty selection = every active percentage). List description, verbatim:
«نِسَب التسبقة اللي يختار منها الحريف كي يخلّص بالتقسيط… التسبقة تتحسب من السعر الجملي بالحاضر، مقرّبة لخطوة
تقريب السعر، وكل مشروع ينجم يحصرها في جزء منها. القيم 10% و20% و30% أمثلة من المالك، تُراجع مع المالية قبل نشر
الأسعار.»

#### 23.d `public.option_items` list `duration` (list created by `0030` line 18)

| code | `label_ar` / `label_fr` | months |
|---|---|---|
| `d_36` | «3 سنوات» / `3 ans` | 36 |
| `d_48` | «4 سنوات» / `4 ans` | 48 |
| `d_60` | «5 سنوات» / `5 ans` | 60 |
| `d_84` | «7 سنوات» / `7 ans` | 84 |

Guard `app.check_duration_item`: whole months, `>= 1`, `<= pricing.max_months`. **Global only** — there is no
per-offer duration list; an offer withholds a duration by having no markup for it.

#### 23.e `public.tree_spacing_classes` — the area multiplier

| code | `label_ar` | spacing | `area_m2` (generated) |
|---|---|---|---|
| `trad_wide_24x24` | تقليدي واسع | 24 × 24 | 576 |
| `trad_14x14` | تقليدي | 14 × 14 | 196 |
| `semi_10x10` | تقليدي / شبه مكثّف | 10 × 10 | 100 |
| `int_7x7` | مكثّف | 7 × 7 | 49 |
| `int_7x5` | مكثّف | 7 × 5 | 35 |
| `int_5x5` | مكثّف | 5 × 5 | 25 |
| `super_4x2` | مكثّف جداً | 4 × 2 | 8 |
| `super_4x1_5` | مكثّف جداً | 4 × 1.5 | 6 |

**Global list**, narrowed per offer by `project_spacing_classes`. Editing a class's spacing re-computes the area
of every parcel planted with it (`app.spacing_area_fanout`, `0035` lines 50-65).

#### 23.f `public.tree_cost_items` — extra cost lines

**No rows are seeded.** Each line is `basis in ('per_tree','per_m2')` with an `amount_millimes >= 0`.
**Both scopes:** global lines and per-offer lines; an offer drops the global ones by setting
`use_global_cost_items = false`.

#### 23.g `public.settings` touching money

| key | seeded value | type / group / public | Scope |
|---|---|---|---|
| `pricing.max_months` | `84` | integer / `pricing` / **public** | **global**; enforced by the duration trigger, the markup trigger and `app.financed_quote`; cannot be lowered below the largest active duration or markup (`app.check_max_months_setting`) |
| `pricing.default` | `{"model":"markup_brackets","brackets":[{"max_months":36,"markup_pct":10},{"max_months":60,"markup_pct":18},{"max_months":84,"markup_pct":25}],"max_months":84,"min_down_pct":10,"min_installment_millimes":50000}` | json / `pricing` / not public | **legacy engine only**; overridable per project and per parcel through the `pricing` jsonb column |
| `analytics.total_price_bands_millimes` | `[]` | json / `pricing` / not public | global, analytics only |
| `million.custom_trees_max` | `5000` | integer / `site` | global cap on the tree count; an offer's own `projects.tree_count` replaces it in `project_quote_payload` |
| `projects.installment_examples` | `3` | integer / `projects` | legacy engine; clamped to `1..5` |
| `projects.listing_limit` | `300` | integer / `projects` | clamped to `20..1000` |

#### 23.h The `pricing` feature flag

`0031` lines 111-115 seeds `feature_flags.pricing` with `state = 'internal'`, phase 1, label «التسعير».
`app.module_open('pricing')` returns true for everyone when the state is `'public'`, and only for staff
(`app.is_staff()`) when it is `'internal'`. Its live state today is not stored in the repository —
**Could not determine from current codebase.** Every money figure in the public quotes, **including the annual
fee**, disappears when it is closed; areas and tree counts stay.

#### 23.i Who may change these values

`app.can_price()` = `finance | admin | super_admin` (`0031` lines 121-124). Every write RPC
(`staff_save_spacing_class`, `staff_delete_spacing_class`, `staff_save_pricing_rule`,
`staff_delete_pricing_rule`, `staff_save_cost_item`, `staff_delete_cost_item`,
`staff_save_financing_markups`, `staff_save_project_spacing_classes`, `staff_save_project_down_percents`)
starts with `if not app.can_price() then raise exception 'forbidden'`, calls `app.set_reason(p_reason)`, and ends
with a named `app.write_audit(...)` event (`pricing.rule_save`, `pricing.markups_save`,
`pricing.cost_item_save`, `pricing.spacing_class_save`, `pricing.project_classes_save`,
`pricing.project_down_percents_save`, and the matching `…_delete`). The Server Actions in
`src/app/admin/(panel)/pricing/actions.ts` repeat the check with `requireStaff(PRICE_ROLES)` and refuse an empty
reason.
RLS: `anon` may select `tree_spacing_classes` only (active rows); `tree_pricing_rules`, `tree_cost_items`,
`financing_markups`, `project_spacing_classes`, `project_down_payment_percents` are selectable only by
`finance | admin | super_admin` (`0031` lines 343-354), and the `app.*` engine functions are revoked from
`public, anon, authenticated` altogether.

#### 23.j Money copy held in `settings` (all `is_public`, MIL-02 / PRN-02)

| key | seeded Arabic value | seeded French value |
|---|---|---|
| `start.row_price_per_tree` | سعر الزيتونة | Prix par olivier |
| `start.row_total_price` | السعر الجملي للطلب | Prix total de la demande |
| `start.row_total_financed` | السعر الجملي بالتقسيط | Prix total financé |
| `start.row_remaining` | المبلغ المتبقي | Montant restant |
| `start.row_monthly` | القسط الشهري | Mensualité |
| `start.last_installment` | آخر قسط: {amount} | Dernière mensualité : {amount} |
| `start.installments_count` | {count} قسطاً | {count} mensualités |
| `start.from_prefix` | ابتداءً من | À partir de |
| `start.estimate_note` | هذا تقدير أولي حسب الإعدادات الحالية. التفاصيل النهائية في بطاقة المشروع والعقد. | Estimation initiale selon les paramètres actuels… |
| `start.price_unavailable` | السعر يتحدّد قريباً. | Prix bientôt disponible. |
| `start.duration_not_priced` | التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى. | Cette durée n'est pas encore proposée. Choisissez-en une autre. |
| `start.down_covers_total` | التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر. | L'apport dépasse le prix total… |
| `start.down_percent_title` | نسبة التسبقة | Apport (en %) |
| `start.down_percent_hint` | التسبقة تتحسب من السعر الجملي بالحاضر. | L'apport est calculé sur le prix total au comptant. |
| `start.payment_hint` (0041) | التقسيط وسيلة تسهّل البداية: بمبلغ شهري بسيط يتحوّل الإدخار لأصل حقيقي وملموس. | Les mensualités facilitent le départ… |
| `start.row_annual_fee` (0047) | معاليم الصيانة والتقليم في العام | Entretien et taille par an |
| `start.annual_fee_per_tree` (0047) | {amount} للزيتونة في العام | {amount} par olivier et par an |
| `legal.no_guarantee_notice` (0004) | AgriZed لا تضمن أي إنتاج أو مردود مالي. كل الأرقام المعروضة تقديرية وغير ملزمة. | — |

`0041_payment_hint.sql` also rewrites the description of the four `start.capacity_*` keys to say they are dead:
«غير مستعمل حالياً: الحاسبة v3 عوّضت خطوة «قدرتك المالية» بأسئلة طريقة الدفع والتسبقة والمدة».

---

### 14.13 Where the numbers surface

| Surface | File | What it shows |
|---|---|---|
| `/start` calculator + `/register` summary | `src/app/(public)/start/calculator-summary.ts` (rows), `copy.ts` (labels), `start-chooser.tsx`, `actions.ts` → `quoteStart` | rows `price_per_tree`, `total_price`, `annual_fee`, `down`, `duration`, `total_financed`, `remaining`, `monthly`; notes for the last installment and the shortened count |
| offer page `/projects/[code]` | `page.tsx` lines 75-76, 325-355 → `offer-interest-form.tsx` | per-tree price, per-tree area, total price, annual total, all from `public_project_quote(trees = 1)` |
| parcel page `/projects/[code]/[parcel]` | `page.tsx` lines 61-70, 182-190 → `src/components/site/tree-offer-block.tsx` or `offer-block.tsx` | tree engine block (payment / percentage / duration chips + the five money rows) or the legacy block |
| listing `/projects` | `page.tsx` lines 115-117, 165 → `src/components/site/offer-card.tsx` | `min_price_per_tree_millimes`, only when the offer is published, tree-priced and `pricing` is open |
| parcel cards | `src/components/site/parcel-card.tsx` lines 79-99 | «ابتداءً من X تسبقة» from `down_from_millimes` |
| Back Office `/admin/pricing` | `page.tsx`, `rule-form.tsx`, `markups-form.tsx`, `cost-items.tsx`, `rates-section.tsx`, `project-section.tsx`, `simulator-section.tsx` | every parameter above, plus the simulator calling `staff_tree_quote` |
| Back Office breakdown | `src/components/admin/tree-pricing-quote.tsx` | the internal table «التفصيل الداخلي لسعر الزيتونة (ما يظهرش للزائر)» and the «التقسيط» table |
| Back Office offer page | `src/app/admin/(panel)/projects/[id]/pricing-tab.tsx`, `identity.tsx`, `costs-tab.tsx`, `lots-table.tsx` | verdict «يتسعّر بالزيتونة» vs «المسار القديم», price per tree, internal `project_costs` total |
| CRM | `leads/page.tsx`, `leads/[personId]/page.tsx`, `leads/export/route.ts`, `leads/offer-snapshot.ts` | the snapshot columns of each demand |

The only money computed in TypeScript rather than read from the database:
`offer-interest-form.tsx` lines 98-100 (`price_per_tree × trees`, `annual_fee × trees`, `area × trees` — the
comment cites `v_total := v_per_tree * v_trees` and notes the database recomputes on submit), and the remaining
**percentage** shown beside the remaining amount (`calculator-summary.ts` line 186-190,
`tree-offer-block.tsx` lines 81-84).

---

### 14.14 Failure reasons, verbatim

| Code | Raised by | Arabic message shown |
|---|---|---|
| `spacing_not_found` | `app.tree_price` | «فئة المساحة هذه غير موجودة أو معطّلة. اختر فئة أخرى، أو فعّلها في «فئات المساحة».» (`tree-pricing-quote.tsx`) |
| `spacing_not_allowed` | `app.tree_price` | «فئة المساحة هذه موش مسموحة في المشروع المختار…» |
| `margin_not_set` | `app.tree_price` | «الأسعار ما تنحسبش وما تبانش في الموقع حتى يتضبط هامش AgriZed.» |
| `spacing_required` / `trees_missing` | `app.parcel_price` | `PARCEL_PRICE_REASONS` in `src/lib/parcel-prices.ts` |
| `duration_not_priced` | `app.financed_quote` | «التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى.» (`start.duration_not_priced`) |
| `down_covers_total` | `app.financed_quote` | «التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر.» (`start.down_covers_total`) |
| `too_many_months` | `app.financed_quote` | «المدة أطول من الحدّ الأقصى المسموح (الإعداد pricing.max_months).» |
| `invalid_input` | `app.financed_quote` | generic |
| `duration_over_cap` | `app.check_duration_item`, `app.check_markup_months`, `staff_save_financing_markups` | — |
| `cap_below_durations` | `app.check_max_months_setting` | — |
| `invalid_down_payment_percent` | `app.check_down_percent_item`, `staff_save_project_down_percents` | reworded per screen |
| `invalid_pricing_rule`, `invalid_cost_item`, `invalid_markup`, `invalid_spacing_class`, `spacing_in_use`, `duplicate_code` | the save/delete RPCs | `src/lib/errors.ts` + local overrides |

---

## OBSERVATIONS

Factual remarks about the code as it stands. No proposals.

1. **Two installment engines with different arithmetic are installed at once.** `app.financed_quote` rounds
   *up* to a configurable step and derives the monthly amount from a chosen duration; `compute_installment_plan`
   rounds to the *nearest* millime with no step and derives the duration from a chosen monthly amount. Their
   results for the same parcel would not agree.

2. **The legacy engine's inputs were deactivated, so its output is empty.** `0032_intake_pricing.sql` lines
   70-73 set `is_active = false` on every item of `down_payment`, `monthly_installment`, `desired_area`,
   `priority` and `budget`. `app.parcel_offer_payload` (`0020` lines 129-151) builds its down and installment
   lists from the **active** items of exactly those two lists, so on a database that has run 0032 the matrix,
   the examples and `entry` are all empty for legacy parcels, and `src/components/site/offer-block.tsx` prints
   «غير متاح بالقيم الحالية». `app.parcel_down_from` (`0022` lines 35-45) selects from the same deactivated
   list and therefore returns null, so `down_from_millimes` is null and the «ابتداءً من X تسبقة» line on
   `parcel-card.tsx` never renders for a legacy parcel.

3. **Two of the seven matching weights score zero for every demand created since 0030/0032.**
   `public.match_requests_for_parcel` (`0013` lines 207-213) scores `down_payment` (weight 15) from
   `r.down_payment_min_millimes` and `installment` (weight 15) from `r.installment_min_millimes` through
   `compute_installment_plan`. The v3 intake never fills either column (`0030` made
   `installment_option_id` nullable, `0032` made `down_payment_option_id` nullable and new demands carry
   `down_payment_percent` instead). `s_down` is written `case when r.down_payment_min_millimes is null then 0`,
   and a null installment makes `compute_installment_plan` return `invalid_input`, so `s_installment = 0`. The
   `area` weight (15) likewise degrades to `w.area * 0.6` because `desired_area_min_m2` is no longer collected.

4. **The Back Office breakdown explains the pre-0036 formula.** In
   `src/components/admin/tree-pricing-quote.tsx` lines 238-243 the row «السعر الجملي بالتقسيط» carries the
   detail `formatMoney(totalPrice) + formatBp(markup_bp)` — i.e. *cash total plus the markup* — and line 252
   describes the monthly as `remaining ÷ months`. Since `0036` the markup is applied to `cash − down`, not to
   the cash total. The **amounts** printed all come from the RPC and are correct; only the "الحساب" explanation
   column describes the superseded arithmetic.

5. **The staff simulator does not show the annual fee.** `QuotePriceDetail` in
   `src/components/admin/tree-pricing-quote.tsx` lines 13-28 has no `annual_fee_per_tree_millimes` field, so the
   figure `app.tree_price` returns since `0045` is not rendered anywhere on `/admin/pricing`, although the value
   is editable on the same page (`rule-form.tsx` line 65).

6. **`src/lib/parcel-prices.ts` drops the annual fee.** The `ParcelPrice` type (lines 10-20) and
   `toParcelPrice` (lines 36-51) do not carry `annual_fee_per_tree_millimes` / `annual_fee_total_millimes`,
   which `app.parcel_price` has returned since `0045`. Every Back Office reader of
   `staff_project_parcel_prices` therefore loses them.

7. **`TreeOfferBlock` does not render the annual fee either.** `src/components/site/tree-offer-block.tsx`
   renders `price_per_tree`, `total_price`, down, total financed, remaining, monthly and the last installment,
   but not `annual_fee_per_tree_millimes` / `annual_fee_total_millimes`, which `public_project_quote` has
   returned since `0048`. The `/start` summary and the offer form do render them.

8. **A calculator demand does not snapshot the annual fee.** `submit_interest_request` (`0032`) writes
   `price_per_tree_millimes`, `total_price_millimes`, `down_payment_amount_millimes`,
   `total_financed_millimes`, `monthly_millimes` — no annual-fee column. Only an offer demand records it
   (`offer_annual_fee_per_tree_millimes`, `offer_annual_fee_total_millimes`, `0049`). So the yearly figure a
   `/start` visitor saw is not kept with their demand.

9. **`down_covers_total` reuses `total_financed_millimes` for a different quantity.** In `0036` lines 60-62 the
   refusal payload sets `'total_financed_millimes', p_cash_total_millimes` — the cash total, not a financed
   total. The pre-0036 version returned the actual financed total there. Callers null the key out when the
   status is not `ok`, so it is not displayed today.

10. **`/start` can never show a per-offer price.** `public_tree_quote` calls
    `app.tree_price(v_class.id, null)`, `app.down_payment_from_percent(…, null)` and
    `app.financed_quote(…, null)` — the global scope only. Per-offer land rates, margins, markups, rounding
    steps and annual fees are visible only on an offer or parcel page, and in the Back Office simulator.

11. **The "remaining %" is computed twice in TypeScript with the same formula.**
    `calculator-summary.ts` `remainingShare()` (lines 186-190) and `tree-offer-block.tsx` `remainingPercent`
    (lines 81-84) both compute `round((cash_total − down) / cash_total × 100)`. Both are documented as the
    owner's 2026-09-16 wording («من المتبقي من الثمن بالحاضر»), and both express the **share of the cash price**,
    while the amount printed next to it is the **markup-inclusive** remaining — the two do not describe the same
    quantity.

12. **The CRM cannot see the offer money columns through its own view.** `public.crm_requests` is
    `select r.*` but was last created in `0032`, before the `0049` columns existed, and a view freezes its
    column list; `public.crm_search_requests` names its columns one by one. The workaround in
    `src/app/admin/(panel)/leads/offer-snapshot.ts` re-reads `public.interest_requests` in chunks of 100 ids,
    and it also applies the calculator-vs-offer filter in TypeScript because the search function cannot. The
    corrective migration `supabase/pending/bb_crm_offer_columns.sql` exists but is **outside**
    `supabase/migrations/` and therefore not applied.

13. **Duration months are cast, not validated, at the call site.** `app.project_quote_payload` and
    `public_tree_quote` pass `v_duration.min_number::integer` into `app.financed_quote`. Whole months are
    guaranteed only by the `option_items_duration_cap` trigger
    (`new.min_number <> trunc(new.min_number)` → `duration_over_cap`), which applies to the `duration` list
    only; the cast itself would round a fractional value.

14. **Two different "annual" money concepts share a vocabulary.** `tree_pricing_rules.annual_fee_per_tree_millimes`
    (per tree, per year, per offer) and `projects/parcels.annual_costs_millimes` (a typed lump sum, «المصاريف
    السنوية التقديرية»). `app.parcel_price` returns the legacy lump sum under the key
    `annual_fee_total_millimes` for legacy parcels (`0045` line 275), so one key carries two different
    definitions depending on the branch.

15. **`pricing.default` still exists and is still reachable.** The legacy jsonb formula is seeded with
    `min_down_pct: 10`, `min_installment_millimes: 50000` and three markup brackets (10 % / 18 % / 25 %) whose
    values overlap but do not match the `financing_markups` rows (which add a 14 % bracket at 48 months). Its
    description already records that the numbers await Finance approval (decision D-06).

16. **Nothing in the repository records a payment.** There is no contract, schedule, installment, receipt or
    balance table anywhere in `supabase/migrations/`. Every figure in this section is a quote produced on the
    fly, or a snapshot of a quote on `public.interest_requests`.

17. **Files under `src/app/(public)/` were being modified while this audit read them.** The money-bearing files
    read here — `start/calculator-summary.ts` (354 lines), `start/copy.ts`, `start/page.tsx`,
    `projects/page.tsx`, `projects/[code]/page.tsx` (511 lines), `projects/[code]/[parcel]/page.tsx` (230 lines),
    `projects/[code]/offer-interest-form.tsx`, `projects/[code]/offer-actions.ts` — were each syntactically
    complete at the time of reading, and the descriptions above reflect that state. `supabase/`, `src/lib/`,
    `src/components/` and `src/app/admin/` were not being modified.

18. **Live parameter values are not knowable from the repository.** Every figure in section 23 is the value
    *seeded by a migration*; `tree_pricing_rules`, `financing_markups`, `option_items` and `settings` are all
    editable from the Back Office, and `supabase/tests/017_tree_pricing.sql` line 8 acknowledges this
    («Seed values are asserted only while nobody has saved them from the Back Office»). Whether any project-scoped
    `tree_pricing_rules` or `financing_markups` rows exist in production, and whether the `pricing` flag is
    currently `public`: **Could not determine from current codebase.**
