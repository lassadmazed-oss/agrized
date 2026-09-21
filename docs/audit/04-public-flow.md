## 3. PUBLIC USER FLOW

Everything below is read from the repository as it stands. Paths are repo-relative. Arabic strings are quoted
verbatim; where a string is a `settings` key with a code fallback, both the key and the fallback are given.

> **Working-tree note.** Files under `src/app/(public)/` were being edited by another process while this audit was
> written. Every public file cited here was read end to end and each one parsed as a complete module (balanced
> braces, a closing `}` on the default export). Nothing appeared truncated or mid-edit. Should any of these files
> differ later, the described behaviour is that of the version read on 2026-09-18.

---

### 3.1 The public surface

| Route | File | Rendering directive | Module gate |
|---|---|---|---|
| `/` | `src/app/(public)/page.tsx` | `export const revalidate = 60` | none (reads flags itself, `"anon"` data only) |
| `/start` | `src/app/(public)/start/page.tsx` | none (dynamic in practice: `moduleAccess` reads the staff cookie) | `interest_form` |
| `/register` | `src/app/(public)/register/page.tsx` | none | `interest_form` |
| `/projects` | `src/app/(public)/projects/page.tsx` | `export const dynamic = "force-dynamic"` | `projects` |
| `/projects/[code]` | `src/app/(public)/projects/[code]/page.tsx` | `force-dynamic` | `projects` |
| `/projects/[code]/[parcel]` | `src/app/(public)/projects/[code]/[parcel]/page.tsx` | `force-dynamic` | `projects` |
| `/projects/map` | `src/app/(public)/projects/map/page.tsx` | `force-dynamic` | `projects` |
| `/land` | `src/app/(public)/land/page.tsx` | `force-dynamic` | `land_offers` |
| `/simulator` | `src/app/(public)/simulator/page.tsx` | — | none; the whole body is `redirect("/start")` |
| error boundary | `src/app/(public)/error.tsx` | client | — |

The shell is `src/app/(public)/layout.tsx`: `SourceCapture` → `SiteHeader` → `main` → `SiteFooter` → `StickyCta`
(the last two only while `interest_form` is `public`).

**The gate itself.** `src/lib/modules.ts` maps a flag to three states:

```
moduleAccess(config, key) → "open"    when flagState === "public"
                          → "preview" when flagState === "internal" AND getStaffSession() returns a staff session
                          → "closed"  otherwise
```

`closed` renders `<ComingSoon title=…/>` from `src/components/site/module-gate.tsx` («قريباً» + «هذا القسم غير متاح
حالياً. سنفتحه قريباً.») and every Server Action re-checks the flag before touching the database. `preview` renders
`<PreviewBanner/>` («معاينة داخلية: هذا القسم غير منشور للعموم، ويراه فريق AgriZed فقط.») above the page.

Flags read by public code: `interest_form`, `projects`, `pricing`, `land_offers`, `public_statistics`, `zitounti`.

---

### 3.2 Entry points into the journey

| Where | Component / file | Target |
|---|---|---|
| Header button (≥ md) and mobile sticky bar | `src/components/site/site-header.tsx` `primaryCta()`, `src/components/site/sticky-cta.tsx` | `settings.site.cta_primary_target === "register" ? "/register" : "/start"`, label `settings.site.cta_primary_label` (default «سجّل اهتمامك») |
| Home door 1 — «احسب مشروعك» | `HomePath variant="estimate"` (`src/components/site/home-paths.tsx`) | `primaryCta().href` |
| Home door 2 — «عروضنا» | `HomePath variant="stock"` | `/projects`, label `settings.site.cta_offers_label` (default «شوف العروض») |
| Home tree cards | `src/components/site/million-start.tsx` | `/start?trees=<option_item.id>`; the «عدد آخر» card → `/start#custom` |
| Home offer cards (max 3, `HOME_OFFERS`) | `src/components/site/offer-card.tsx` | `/projects/<code>` |
| Home final CTA | inline in `page.tsx` | `primaryCta().href`, then `/projects` |
| `/start` last screen | `start-chooser.tsx` | `/register?…` and (when `projects` is not closed) `/projects` |
| `/projects` empty state | `projects/page.tsx` | `/register` with **no** parameters |
| Parcel page CTAs | `projects/[code]/[parcel]/page.tsx` via `interestHref()` | `/register?…` |
| Offer page CTAs | `projects/[code]/page.tsx` | `#offer-form` / `#offer-visit` anchors on the same page |
| `/register` success screen | `register-wizard.tsx` `Success` | `/#million`, `/`, and one link per live offer |

`StickyCta` hides itself on `/start`, `/register`, `/land`, `/projects/<code>` and `/projects/<code>/<parcel>`
(regex list `OWN_ACTION`, which deliberately excludes `/projects/map`).

`SourceCapture` (`src/components/site/source-capture.tsx`) writes `sessionStorage["agrized:source"]` **once per tab**
on first render: `landing_path`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `ref` (each ≤ 150 chars)
and `referrer` (≤ 300 chars, only when off-origin). `readVisitSource()` is sent with both intake forms and lands in
`interest_requests.source` after `app.clean_source()`.

---

## PATH A — THE CALCULATOR

### 3.3 `/start` — the step machine

`src/app/(public)/start/page.tsx` is a thin server shell. It:

1. gates on `interest_form`;
2. loads `getCalculatorLists(config)` (`start/calculator.ts`);
3. reads the answers already in the URL with `readCalculatorChoices(lists, params)`;
4. computes `offersOpen = moduleAccess(config, "projects") !== "closed"`;
5. hands everything to the client component `StartChooser` together with all copy from `startCopy(config)`
   (`start/copy.ts`, ~55 setting keys), `settings.start.tier_taglines` and `settings.start.values`.

Metadata: `settings.site.start_meta_title` (default «اختيار عدد الزيتونات») and `site.start_meta_description`.

**The step list** is rebuilt on every render (`useMemo` in `start-chooser.tsx`):

```
["trees"]
  + ["spacing"]  if spacingClasses.length > 0
  + ["type"]     if scenarios.length > 0
  + ["payment"]
  + ["down"]     if paymentMode === "installments" && downPercents.length > 0
  + ["duration"] if paymentMode === "installments" && durations.length > 0
  + ["summary"]
```

So an empty Back-Office list removes its screen entirely, and switching back to «بالحاضر» deletes two screens
mid-flight — `activeStep` falls back to `"summary"` when the current step is no longer in the list.

**Progress**: `الخطوة <n> من <total>` plus a `role="progressbar"` with `aria-label="التقدم في الحاسبة"`. Both strings
are hard-coded in the component.

**Movement.** Choosing an answer calls `advance()`, which waits `ADVANCE_MS = 220` ms (so the tick is visible) then
moves to the next step in `stepsRef.current`. `goBack()` («رجوع», hard-coded) steps back one. `goEdit(step)` is used
by the «تبديل» link on a summary row: it sets `editingRef` so the **next answer returns straight to the summary**.
The heading takes focus and the window scrolls to top on every step change.

**Landing step** (`useState` initialiser): if `calculatorGap(initial)` is `null` → `"summary"`; else if no tree
answer → `"trees"`; else if no payment mode → `"spacing"` when spacing classes exist and none was chosen, otherwise
`"payment"`; else `"duration"` or `"down"` depending on the gap. This is what makes a return from `/register` land
on the figures rather than on question one.

**URL sync**: `window.history.replaceState(window.history.state, "", query ? "/start?"+query : "/start")` on every
change of `query`/`activeStep`. The comment states explicitly that the router's own history state must be preserved,
otherwise the following `<Link>` click lands on a blank screen. Any query parameter that is not part of
`calculatorQuery` (for example `parcel`) is **dropped** by this rewrite.

---

### 3.4 `/start` — the questions, one by one

#### Step 1 — «قدّاش زيتونة تحب تبدا بيهم؟»

| | |
|---|---|
| Question | `settings.site.trees_question`, default «قدّاش زيتونة تحب تبدا بيهم؟» |
| Sub-line | `settings.site.trees_subtitle`, default «اختيارك يمشي معك للخطوة الموالية. تنجم تبدّلو وقت اللي تحب.» |
| Options | `optionsFor(config, "tree_count")` → `public.option_items` where `list_key='tree_count' and is_active`, ordered by `sort_order` |
| Seeded items | `trees_25` «25 زيتونة», `trees_50`, `trees_100`, `trees_250`, `trees_500` (0017), `trees_500p` «أكثر من 500» (min 500, max null), `trees_any` «اقترحولي» (min/max null). `trees_250p` was deactivated, not deleted, by `0017_tree_count_500.sql` |
| Card body | `label_ar` / `label_fr`, `min_number` drawn as olive marks, tagline from `settings.start.tier_taglines[option.code]` |
| Free number | the card labelled `settings.start.custom_label` (default «عدد آخر»), `id="custom"` so `/start#custom` scrolls to it |
| Free-number rules | input is passed through `toWesternDigits()` then `replace(/\D/g,"")`, `maxLength={9}`; valid when integer and `customMin ≤ n ≤ customMax` |
| Limits | `customMin = settings.million.custom_trees_min` (seeded 1), `customMax = settings.million.custom_trees_max` (seeded 5000) — `0019_start_page.sql` |
| Hint | `settings.start.custom_hint`, default «اكتب عدداً بين {min} و{max}.» — `{min}`/`{max}` filled by `fillLimits()` |
| Exclusivity | picking a tier clears the typed number; typing clears the tier (`treeId = null`) |
| URL | `trees=<option_item.id>` **or** `trees_custom=<n>`, never both |
| Advance | a tier click auto-advances; a typed number does not — `Enter` or the «التالي» button does |

This is the **only** step with a bar pinned to the bottom of a phone (`sticky bottom-0 … sm:static`), holding
«رجوع» (when `index > 0`) and «التالي» (disabled until `hasTrees`). Below it, while nothing is chosen,
`settings.start.continue_hint` («اختر عدد الزيتونات باش تكمّل.») is shown.

#### Step 2 — «المساحة لكل زيتونة» (skipped when no spacing classes exist)

| | |
|---|---|
| Question | `settings.start.spacing_title`, default «المساحة لكل زيتونة» |
| Hint | `settings.start.spacing_hint`, default «كل فئة تعني تباعداً بين الزيتونات ومساحة مرتبطة بكل زيتونة.» |
| Options | `getSpacingClasses()` (`src/lib/tree-pricing.ts`) → `public.tree_spacing_classes` where `is_active`, ordered by `sort_order`, cached 300 s under tag `public-config` |
| Card shows | `label_ar`, `formatSpacing(row_spacing_m, tree_spacing_m)` e.g. `24 × 24 م`, and `formatArea(area_m2)` |
| `area_m2` | a **generated column**: `numeric(10,2) generated always as (row_spacing_m * tree_spacing_m) stored` (`0031_tree_pricing.sql:138`) |
| Seeded classes | `trad_wide_24x24` «تقليدي واسع» 24×24, `trad_14x14` «تقليدي» 14×14, `semi_10x10` «تقليدي / شبه مكثّف» 10×10, `int_7x7` / `int_7x5` / `int_5x5` «مكثّف», `super_4x2` / `super_4x1_5` «مكثّف جداً» |
| Opt-out | a final card `settings.start.spacing_any`, default «ما نعرفش، اقترحولي», `value=""` → `spacingId = null`, `spacingAnswered = true`, and `setQuote(null)` |
| URL | `spacing=<uuid>`; the opt-out writes nothing |

**Consequence:** with no spacing class there is **no quote at all** — `useEffect` returns early on `if (!spacingId)`,
so every money and area row stays empty for the rest of the flow.

#### Step 3 — «كيفاش تحب مشروعك يكون؟» (skipped when no scenarios exist)

| | |
|---|---|
| Question | `settings.site.style_question`, default «كيفاش تحب مشروعك يكون؟» |
| Options | `config.scenarios` → `public.ownership_scenarios` where `is_active`, ordered by `sort_order` |
| Seeded (0010) | `big_productive` «قطعة فيها زيتون كبير ومنتج», `intensive_grove` «قطعة فيها غراسة مكثفة», `bare_land` «أرض بيضاء نغرسوها», `young_trees` «زيتون صغير يكبر مع الوقت», `any` «ما يهمنيش النوع، نحب العرض الأنسب حسب ميزانيتي» (`is_any = true`) |
| Card | `image_url` when the Back Office uploaded one, otherwise `<GrowthIcon code={icon_code}/>`; `description_ar` under the label |
| URL | `scenario=<uuid>` |
| Required? | **No.** `calculatorGap` never asks for it; the intake records «no specific type» when it is absent |

#### Step 4 — «كيفاش تحب تخلّص؟»

| | |
|---|---|
| Question | `settings.start.payment_title`, default «كيفاش تحب تخلّص؟» |
| Hint | `settings.start.payment_hint` — **no code fallback**; seeded by `0041_payment_hint.sql` as «التقسيط وسيلة تسهّل البداية: بمبلغ شهري بسيط يتحوّل الإدخار لأصل حقيقي وملموس.» |
| Options | built in the component, not from a list: `{id:"cash"}` labelled `settings.start.payment_cash` («بالحاضر») and `{id:"installments"}` labelled `settings.start.payment_installments` («بالتقسيط») |
| Allowed values | `PAYMENT_MODES = ["cash","installments"]` (`src/lib/tree-pricing.ts`), mirrored by a DB check constraint on `interest_requests.payment_mode` |
| URL | `payment=cash` / `payment=installments` |
| Effect | choosing «بالتقسيط» *adds* the two screens below; choosing «بالحاضر» removes them and clears `down_pct` / `duration` from the query |

#### Step 5 — «نسبة التسبقة» (only for installments, only when the list is non-empty)

| | |
|---|---|
| Question | `settings.start.down_percent_title`, default «نسبة التسبقة» |
| Hint | `settings.start.down_percent_hint`, default «التسبقة تتحسب من السعر الجملي بالحاضر.» |
| Options | `optionsFor(config, "down_payment_percent")` — seeded by `0031_tree_pricing.sql`: `dpp_10` «10%», `dpp_20` «20%», `dpp_30` «30%», with `min_number` = the percentage |
| Guard | a trigger `app.check_down_percent_item()` fires on inserts into that list |
| URL | `down_pct=<uuid>` |
| Retired | the old amount list `down_payment` is retired (plan Q-7); `calculator.ts` comments say so explicitly |

#### Step 6 — «مدة الدفع» (only for installments, only when the list is non-empty)

| | |
|---|---|
| Question | `copy.rowDuration` = `settings.start.row_duration`, default «مدة الدفع» |
| Options | `optionsFor(config, "duration")` — `d_36` «3 سنوات» (36), `d_48` «4 سنوات» (48, added by 0031), `d_60` «5 سنوات», `d_84` «7 سنوات»; `min_number` = months |
| URL | `duration=<uuid>` |
| Never asked | the monthly amount. Report v3 §6 is implemented literally: the visitor picks a duration, the monthly figure is computed |

#### Step 7 — «مشروعك المبدئي» (the summary screen)

A raised `.panel` holding:

* the continue button `settings.start.continue` (default «سجّل اهتمامك») → `/register?<calculatorQuery>`. When
  `calculatorGap` is non-null the button is rendered as a disabled `<span aria-disabled="true">` with a hint;
* `settings.start.secure_note` («التسجيل مجاني ولا يمثل التزاماً.») with a padlock;
* when `offersOpen && copy.offersLabel`: a divider, `settings.register.offers_title` («عروضنا الحالية») and a
  secondary button `settings.site.cta_offers_label` → `/projects`;
* below the grid, `settings.start.values` renders a reassurance strip (`{icon, ar, fr}`; icon keys
  `people | leaf | hand | chart`, unknown keys fall back to the leaf drawing).

---

### 3.5 `/start` — the live quote

Every figure on the page comes from Postgres. The chain:

```
start-chooser.tsx  useEffect (debounce QUOTE_DEBOUNCE_MS = 250, with a monotonic quoteSeq guard)
  → quoteStart()                      src/app/(public)/start/actions.ts   ("use server")
  → publicTreeQuote()                 src/lib/tree-pricing.ts
  → supabase.rpc("public_tree_quote") request-scoped client (carries the caller's JWT)
  → public.public_tree_quote()        supabase/migrations/0045_annual_fee.sql  (latest definition; first in 0031)
       → app.tree_price(class, NULL)
       → app.down_payment_from_percent()     0031
       → app.financed_quote()                0036 (redefined; first in 0031)
```

`quoteStart` validates with zod: `spacingClassId: uuid`, `trees: int 1..2147483647 | null`,
`paymentMode: enum | null`, `downPercentOptionId: uuid | null`, `durationOptionId: uuid | null`. A parse failure
returns `null` — no error is shown; the card simply has no figures.

What is sent as `trees`: `chosenTree.min_number` for a listed tier, the typed number for a custom count, and `null`
for «اقترحولي» (whose `min_number` is null). `downPercentOptionId` / `durationOptionId` are forced to `null` unless
the mode is `installments`.

**`public.public_tree_quote(p_spacing_class, p_trees, p_payment_mode, p_down_percent_option_id, p_duration_option_id)`**

* returns `null` when the class does not exist or is inactive;
* `v_max := greatest(app.setting_int('million.custom_trees_max', 5000), max(option_items.min_number) for active
  'tree_count')`; a `p_trees` outside `1..v_max` becomes `null` (no error) so areas and totals disappear;
* `pricing = 'closed'` unless `app.module_open('pricing')` — i.e. the `pricing` flag is `public`, or `internal` and
  the caller is staff (`app.is_staff()`);
* otherwise `app.tree_price(class, **null**)` — always the **global** rate card, never a project's;
* `pricing = 'ok'` or `'unavailable'`;
* output keys: `spacing_class_id, label_ar, label_fr, row_spacing_m, tree_spacing_m, area_per_tree_m2, trees,
  total_area_m2, pricing, price_per_tree_millimes, total_price_millimes, annual_fee_per_tree_millimes,
  annual_fee_total_millimes, installments`;
* the function comment states what it must never return: «Never the land price, planting cost, extra costs, cost,
  margin, markup or internal notes.» `grant execute … to anon, authenticated`.

**`app.tree_price(class, project)`** (redefined in 0045):

```
cost   = area_m2 × land_price_per_m2_millimes
       + planting_cost_per_tree_millimes
       + Σ active tree_cost_items  (basis 'per_tree' → amount; basis 'per_m2' → area × amount)
margin = margin_mode 'percent' → cost × margin_percent_bp / 10000
       | margin_mode 'fixed'   → margin_fixed_millimes
price  = ceil((cost + margin) / price_rounding_millimes) × price_rounding_millimes
```

Values are resolved per-offer first, then from the global row (`tree_pricing_rules where project_id is null`).
`annual_fee_per_tree_millimes` follows the same inheritance; the global row was seeded to `150000` millimes
(150 د.ت/tree/year) by 0045. When `margin_mode`, land rate, planting cost or rounding is missing the function
returns `ok:false, reason:'margin_not_set'` → the page shows `settings.start.price_unavailable`
(«السعر يتحدّد قريباً.»).

**Installments** (only when `pricing='ok'`, mode is `installments` and the tree count is known):

* both ids missing → `status = 'incomplete'`;
* `down = ceil(total × percent / 100 / price_rounding) × price_rounding` (`app.down_payment_from_percent`, which
  returns null unless `0 < percent ≤ 100`);
* `app.financed_quote(total, down, months, null)` — **0036 semantics**:
  * `months > app.setting_int('pricing.max_months', 84)` → `too_many_months`;
  * no row in `financing_markups` for those months (project row preferred over the global one) → `duration_not_priced`;
  * `down ≥ cash total` → `down_covers_total`;
  * `remaining = ceil((cash − down) × (10000 + markup_bp) / 10000 / price_rounding) × price_rounding`;
  * `total_financed = down + remaining`;
  * `monthly = ceil(remaining / months / monthly_rounding) × monthly_rounding`;
  * `installments_count = ceil(remaining / monthly)`, `last_installment = remaining − monthly × (count − 1)`,
    `shortened = count < months`.
  The markup therefore applies **only to the financed part**, not to the whole price.

`toTreeQuote()` in `src/lib/tree-pricing.ts` normalises the jsonb (numerics may arrive as strings) and forcibly
nulls `price_per_tree_millimes`, `total_price_millimes` and both annual-fee fields unless `pricing === "ok"`.

---

### 3.6 `/start` — what the estimate card prints

`calculatorSummary()` in `src/app/(public)/start/calculator-summary.ts` is a pure function shared by `/start`
(client) and `/register` (server), so both render the same rows the same way.

| Row key | Label setting (default) | Value | Condition |
|---|---|---|---|
| `trees` | `start.row_trees` («عدد الزيتونات») | tier `label_ar`, or `"<n> <start.trees_unit>"` for a typed count | always present |
| `type` | `start.row_type` («نوع المشروع») | scenario `label_ar` | always present (null value until answered) |
| `area_per_tree` | `start.row_area_per_tree` («المساحة لكل زيتونة») | `formatArea(area_m2)` | only when spacing classes exist |
| `total_area` | `start.row_total_area` («المساحة الجملية») | `formatArea(quote.total_area_m2)` | only when spacing classes exist |
| `price_per_tree` | `start.row_price_per_tree` («سعر الزيتونة») | money, prefixed «ابتداءً من» | only when `pricing === "ok"` |
| `total_price` | `start.row_total_price` («السعر الجملي للطلب») | money, prefixed «ابتداءً من» | only when `pricing === "ok"` |
| `annual_fee` | `start.row_annual_fee` («معاليم الصيانة والتقليم في العام») | annual total, with the note `start.annual_fee_per_tree` («{amount} للزيتونة في العام») | only when both annual figures exist |
| `payment` | `start.row_payment` («طريقة الدفع») | «بالحاضر» / «بالتقسيط» | always present |
| `down` | `start.row_down` («التسبقة») | `"<percent label> · <amount>"` | installments only |
| `duration` | `start.row_duration` («مدة الدفع») | duration `label_ar` | installments only |
| `total_financed` | `start.row_total_financed` («السعر الجملي بالتقسيط») | money | only when the plan status is `ok` |
| `remaining` | `start.row_remaining` («المبلغ المتبقي») | `"<share>% · <amount>"` where share = `round((cash − down)/cash × 100)` | plan `ok` |
| `monthly` | `start.row_monthly` («القسط الشهري») | money, plus notes `start.last_installment` («آخر قسط: {amount}») when the last instalment differs, and `start.installments_count` («{count} قسطاً») when the plan is shortened | plan `ok` |

Two prefixing rules:

* `startingAt()` puts `settings.start.from_prefix` («ابتداءً من») in front of **price per tree** and **total price**,
  always — the stated reason is that `public_tree_quote` prices one global rate card, so the figure must not read as
  the price of a specific thing;
* `atLeast()` puts the same prefix on every quote-derived amount when the chosen tier is *open-ended*, i.e.
  `min_number` is set and (`max_number` is null or greater than `min_number`) — that is `trees_500p` today.

**Notices** (one at a time, in this order):

| Quote state | Setting (default) |
|---|---|
| `pricing === "unavailable"` | `start.price_unavailable` — «السعر يتحدّد قريباً.» |
| plan `duration_not_priced` | `start.duration_not_priced` — «التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى.» |
| plan `down_covers_total` | `start.down_covers_total` — «التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر.» |

**The card itself** (`aside` in `start-chooser.tsx`) is shown as soon as one row has a value or a notice exists;
before that the column holds the `start.side` photo. It carries `settings.start.estimate_note` as a permanent badge
across its head (default «هذا تقدير أولي حسب الإعدادات الحالية. التفاصيل النهائية في بطاقة المشروع والعقد.») on the
`.card .card-estimate` surface. The lead figure is the `monthly` row when present, otherwise `total_price`; that row
is moved to the head and removed from the list beneath. Rows that already have a value carry a «تبديل» button whose
target comes from `rowStep()`:

```
trees → "trees" | type → "type" | area_per_tree → "spacing" | payment → "payment" | down → "down" | duration → "duration"
```

(`total_area` deliberately has none, because the spacing screen already owns one.) A `role="status"` live region
announces a subset of rows (`ANNOUNCED`) 900 ms after reaching the summary.

---

### 3.7 `/start` ⇄ `/register` — the URL contract

`calculatorQuery(choices, wantsVisit)` (`calculator-summary.ts`) emits only what was answered:

| Param | Value | Emitted when |
|---|---|---|
| `trees` | `option_items.id` | a tier was chosen |
| `trees_custom` | integer as text | no tier and a valid typed number |
| `scenario` | `ownership_scenarios.id` | answered |
| `spacing` | `tree_spacing_classes.id` | answered and not «اقترحولي» |
| `payment` | `cash` \| `installments` | answered |
| `down_pct` | `option_items.id` | `payment === "installments"` |
| `duration` | `option_items.id` | `payment === "installments"` |
| `visit` | `1` | the visitor arrived with `visit=1` |

`readCalculatorChoices(lists, params)` re-validates every value against the *current* lists and silently drops
unknown or retired ids. `trees_custom` must match `/^\d{1,9}$/` **and** sit inside `customMin..customMax`. A listed
tier wins when both arrive. A missing `payment` is inferred as `"installments"` when `down_pct` or `duration` is
present.

`calculatorGap(choices, listSizes)` names what still blocks a request, using the intake's own error codes:

| Gap | Raised when | Hint shown on `/start` |
|---|---|---|
| `invalid_tree_choice` | no tier and no custom number | `start.continue_hint` — «اختر عدد الزيتونات باش تكمّل.» |
| `invalid_payment_mode` | no payment mode | `start.continue_hint_payment` — «اختر طريقة الدفع باش تكمّل.» |
| `down_payment_percent_required` | installments, list non-empty, nothing chosen | `start.continue_hint_installments` — «اختر نسبة التسبقة ومدة الدفع باش تكمّل.» |
| `duration_required` | installments, list non-empty, nothing chosen | same as above |

The same function is called a second time inside the Server Action, and the database enforces the same four rules
again in `submit_interest_request`.

---

### 3.8 `/register` — the request form

`src/app/(public)/register/page.tsx`:

1. gates on `interest_form`;
2. **redirect rule** — `if (!choices.treeId && choices.treesCustom === null) redirect("/start" + forwardedQuery(params))`.
   `forwardedQuery` re-emits *every* incoming parameter, including ones `/start` does not understand;
3. computes the recap server-side: `quoteChoices()` → `publicTreeQuote()` (the same RPC as `/start`, so the figures
   are recomputed, not carried in the URL) → `calculatorSummary()`. Only rows with a value are passed on
   (`RecapRow = {key,label,value,notes}`, Arabic only);
4. builds `editHref = "/start?" + calculatorQuery(choices, wantsVisit)` with label `settings.start.edit_choices`
   («بدّل اختياراتك»);
5. loads the offers for the success screen when `projects` is not closed:
   `getPublicProjects(mode).filter(p => p.offered && p.on_tree_pricing && (p.tree_count ?? 0) > 0)`, formatted on
   the server into `SuccessOffer`.

Metadata: `site.register_meta_title` (default «سجّل مطلبك»), `site.register_meta_description`.

The recap **table** is not rendered on the form any more; only the `editHref` link (on step 1) or the blocking error
banner is. The wizard is `RegisterWizard` in `register-wizard.tsx`.

#### The six steps (`STEPS`, hard-coded Arabic)

| # | Title | Fields | Options from | Client validation | Auto-advance |
|---|---|---|---|---|---|
| 1 | «بياناتك» | `fullName`, `phone`, `whatsappSame` + `whatsapp`, `email` (optional), `governorateId` | `config.governorates` (`public.governorates` where `is_active`, by `sort_order`) | name ≥ 3 chars; `phoneError()`; whatsapp when not same; email regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`; governorate required | no |
| 2 | «أين ترغب في الاستثمار؟» | `investAnywhere` («المكان غير مهم») or `investGovernorateIds[]` chips | same governorate list | at least one governorate, or «المكان غير مهم» | only when «المكان غير مهم» is ticked |
| 3 | «ما هو هدفك؟» | `goalOptionId` | `optionsFor(config,"goal")` — seeded `family` «استهلاك عائلي», `investment` «استثمار», `both` «الاثنين» | required | yes |
| 4 | «الزيارة والتمويل» | `wantsVisit`, `wantsBankFinancing` | hard-coded yes/no: «نعم» / «لا، مازال» and «نعم» / «لا» | none — both may stay `null` | no |
| 5 | «كيف تحب نتصلوا بيك؟» | `contactChannel`, `contactTimeOptionId` | channel hard-coded `phone`→«مكالمة هاتفية», `whatsapp`→«WhatsApp», `both`→«الاثنين»; times `optionsFor(config,"contact_time")` — `morning` «صباحاً», `afternoon` «بعد الظهر», `evening` «مساءً», plus «أي وقت» = `null` | channel required | no |
| 6 | «راجع طلبك» | read-only table with «تعديل» per row, `consent` checkbox carrying `settings.legal.consent_text` | — | consent required | — |

`phoneError()` (client) strips `+216`/`00216` and accepts `^[2-9]\d{7}$`; an international number is accepted only
when `settings.lead.allow_international_phone` is true (seeded `false`), in which case `^(\+|00)[1-9]\d{6,14}$`.
Messages: «رقم الهاتف غير صحيح. اكتب 8 أرقام، مثال: 98 123 456.» and «نقبل حالياً الأرقام التونسية فقط. اكتب رقماً من
8 أرقام.»

Hint line `settings.site.free_interest_notice` («تسجيل الاهتمام مجاني ولا يمثل التزاماً بالشراء.») appears on step 1
and on the last step.

`visit=1` in the URL pre-answers step 4 with «نعم» and wins over a restored draft.

Editing from step 6 sets `returnStep = 6`, so completing the edited step jumps back to the review.

#### Client-side persistence

`localStorage["agrized:register-draft-v4"]` holds every `FormState` field **except `consent`**, written on every
change and removed after a successful submit. On mount the wizard reads v4, falls back to
`agrized:register-draft-v3`, then deletes the old keys `agrized:register-draft` and `…-v3`. `sanitize()` rebuilds the
object field by field and clears ids that no longer exist in the current Back-Office lists. Every access is wrapped
in `try/catch`. **No calculator answer is stored here** — those live only in the URL (P2-6).

A honeypot input named `Website` is rendered inside a 1×1 clipped, `aria-hidden` container.

#### Submission

`submitInterest()` in `register/actions.ts`:

1. re-reads the flag: `disabled`, or `internal` without a staff session → «التسجيل غير متاح حالياً. حاول لاحقاً.»;
2. zod parse (with a refinement that `treeCountOptionId` and `treeCountCustom` are mutually exclusive) → generic
   «بعض المعلومات ناقصة أو غير صحيحة. راجع الخطوات وحاول مجدداً.»;
3. honeypot → generic failure message;
4. `calculatorGap` again → `{ok:false, calculator:true}` so the UI shows the «بدّل اختياراتك» link instead of a step;
5. `normalizePhone()` (libphonenumber-js, default region `TN`) for phone and, when different, WhatsApp;
6. `createAdminClient(auditHeaders(headers()))` — the **service-role** client — and
   `rpc("submit_interest_request", { p: … })`.

Payload keys sent: `full_name, phone_e164, whatsapp_e164, email, residence_governorate_id, invest_anywhere,
invest_governorate_ids, scenario_ids (0 or 1 id), project_type_unsure (= no scenario), tree_count_option_id **or**
tree_count_custom, spacing_class_id, payment_mode, down_payment_percent_option_id + duration_option_id (installments
only), goal_option_id, wants_visit, wants_bank_financing, contact_channel, contact_time_option_id, consent_text
(= settings.legal.consent_text), ip_hash (hashed client IP), source`.

Error routing back into the wizard:

* `ERROR_STEP` maps DB codes to a step: `invalid_full_name|invalid_phone|phone_not_tunisian|invalid_whatsapp|
  invalid_email|invalid_governorate|invalid_delegation → 1`, `invest_location_required|invalid_invest_governorate → 2`,
  `invalid_goal → 3`, `invalid_contact_time|contact_channel_required → 5`, `consent_required → 6`;
* `CALCULATOR_ERRORS` (a `Set` of 12 codes including `invalid_tree_choice`, `invalid_spacing`,
  `invalid_down_payment_percent`, `duration_required`, `invalid_scenario`…) instead sets `calculator: true` — the
  banner then links back to `/start`, because no wizard step can fix them;
* Arabic text for each code comes from `src/lib/errors.ts` (`MESSAGES`), fallback «تعذّر إرسال الطلب. تحقق من اتصالك
  وحاول مرة أخرى.»

#### `public.submit_interest_request(p jsonb)` — latest definition in `0032_intake_pricing.sql`

Order of operations:

1. name length 3..120 → `invalid_full_name`; `app.assert_phone()` (E.164 `^\+[1-9][0-9]{6,14}$`, plus
   `^\+216[0-9]{8}$` unless `lead.allow_international_phone`) → `invalid_phone` / `phone_not_tunisian`; WhatsApp
   regex; email ≤ 200 and regex; consent text non-empty → `consent_required`;
2. residence governorate must be active; delegation optional but must belong to it;
3. investment location: `invest_anywhere` clears the array, otherwise at least one **active** governorate, else
   `invest_location_required` / `invalid_invest_governorate`;
4. scenarios: each must be active; `lead.project_types_multi` (default true) limits to one when false; the scenario
   rows supply `project_type_ids`, `scenario_labels`, `plantation_systems`, `production_statuses`; `is_any` or an
   empty type set records `project_type_unsure = true`;
5. `goal_option_id` required (`invalid_goal`);
6. `payment_mode` must be `cash`/`installments`; percent/duration/legacy amount ids are only read when the mode is
   **not** cash; installments require a percentage and a duration **as long as the corresponding list has active
   items** → `down_payment_percent_required` / `duration_required`;
7. tree count: `tree_count_option_id` must be active; `tree_count_custom` must parse as an integer
   (`invalid_tree_custom`), must not be combined with an option id (`invalid_tree_choice`), and must lie between
   `million.custom_trees_min` and `million.custom_trees_max`;
8. spacing class must exist and be active (`invalid_spacing`); contact channel must cast to
   `public.contact_channel` (`contact_channel_required`);
9. **throttling**: `app.check_throttle('interest:ip', ip_hash, interval '1 hour',
   app.setting_int('antispam.max_requests_per_ip_per_hour', 10))` and, per phone,
   `count(interest_requests in the last day) >= app.setting_int('antispam.max_requests_per_phone_per_day', 3)` →
   `rate_limited`;
10. **person upsert**: `insert into public.persons … on conflict (phone_e164) do update set last_request_at, consent_at`.
    Existing person data is never overwritten. `is_duplicate = not inserted` (`xmax = 0` trick). The new person's
    status is the first active `lead_statuses` row with `stage='new'`;
11. optional round-robin assignment when `settings.crm.auto_assign_mode = 'round_robin'`: the `commercial` with the
    oldest (or no) last assignment, recorded in `person_assignments` with reason `auto:round_robin`;
12. **price snapshot** — recomputed here, not trusted from the client: only when a spacing class was chosen, the
    tree count is known and `app.module_open('pricing')`. `total_area_m2 = area_m2 × trees`,
    `price_per_tree_millimes`, `total_price_millimes = per_tree × trees`, and for installments
    `down_payment_amount_millimes`, `total_financed_millimes`, `monthly_millimes` from the same
    `app.down_payment_from_percent` + `app.financed_quote` pair the page used;
13. `request_no = settings.request_no.prefix ('AGZ') || '-' || to_char(now() at time zone 'Africa/Tunis','YYYY') ||
    '-' || lpad(app.next_number('interest_request:<year>'), 6, '0')`;
14. one row into `public.interest_requests` with ~50 columns (every chosen label and bound snapshotted beside its id
    — LEAD-02);
15. `app.enqueue_message('lead.confirmation', phone, {name, request_no, trees, total_area_m2,
    total_price_millimes}, 'interest_requests', id)` → a row in `public.notification_outbox` **only if an active
    template with that key exists**;
16. returns `{"request_no": …}`.

`revoke execute … from public, anon, authenticated; grant execute … to service_role` — reachable only through the
Server Action's service-role client.

#### The confirmation screen

Rendered in place of the wizard once `requestNo` is set (`Success` in `register-wizard.tsx`):

* «تم تسجيل مطلبك» (hard-coded), then `settings.register.success_welcome_title` («مرحباً بيك، زيتونتك بدات»),
  `register.success_welcome_text` and later `register.success_motivation` — all from 0038;
* «رقم مطلبك» + the number in LTR, with a «نسخ الرقم» / «تم نسخ الرقم» clipboard button;
* a recap limited to `SUCCESS_ROWS = ["trees","area_per_tree","total_area","payment","total_price"]`, taken from the
  server-rendered rows (so the price appears only if it was visible before);
* «احتفظ بهذا الرقم. سيتصل بك فريق AgriZed عبر <channel> (<time>) عند دراسة طلبك.» built from the answers;
* `settings.register.success_note` («التسجيل مجاني ولا يلزمك بالشراء.»);
* buttons: `settings.register.success_progress_label` («شوف وين وصل المشروع») → `/#million`, and «العودة للصفحة
  الرئيسية» → `/`;
* finally, when offers exist and `register.offers_title` is non-empty, a grid of live offers
  (`register.offers_text` above it) — each card links to `/projects/<code>`, showing cover, name, governorate,
  «عدد الزيتونات», «مساحة كل زيتونة» and «ابتداءً من <price> للزيتونة».

The draft is deleted from `localStorage` at this point.

---

## PATH B — THE OFFER PAGES

### 3.9 `/projects` — the catalogue

Gate `projects`. Data: `getPublicProjects(mode)` and `getPublicParcels(mode)` (`src/lib/public-projects.ts`), where
`mode = "anon"` (shared `unstable_cache`, 60 s, tag `public-projects`) or `"preview"` (the staff session's own
client, never cached).

Title everywhere: `offersTitle(config)` = `settings.offers.title` («عروضنا», 0050) falling back to
`settings.projects.title` («المشاريع المتوفّرة»).

Sections: **open** offers (`status` `published` or `internal`) then the parcel grid then **closed** offers
(`sold_out`, `operating`). The header prints one figure, the sum of available trees, labelled
`"<settings.start.trees_unit> <PARCEL_STATUS_LABELS.available>"` → «زيتونة متاحة».

`offerStock(project, parcels)` (exported from this file and reused by the home page, the offer page and the parcel
page) counts in **trees**, ignoring `withdrawn` parcels:

* `total` = `project.tree_count` when > 0, else the sum of the parcels' `olive_tree_count`;
* when any parcel carries trees: `available` = trees on `available` parcels, `held` = `interested|reserved|
  contracting`, `sold` = `sold|owned`, `fromParcels = true`;
* otherwise the offer is sold whole: `sold = total` when `status = 'sold_out'`, `available = total − sold` while the
  offer is `published`/`internal`, `held = 0`.

`areaPerTree(project)` = `area_per_tree_min_m2`, else `total_area_m2 / tree_count`, else null.

`offerTreePrice(project, pricingOpen)` returns `min_price_per_tree_millimes` only when the `pricing` module is not
closed to this visitor **and** `project.offered` **and** `project.on_tree_pricing`; otherwise the card prints
`settings.projects.price_pending` («السعر يُعلن لاحقاً.»).

**Parcel filters** (`GET` form, `readFilters`), all validated against the config and silently dropped when invalid:

| Param | Meaning | Source of the choices |
|---|---|---|
| `gov` | governorate | `config.governorates` |
| `del` | delegation — kept only when it belongs to `gov` | `config.delegations` |
| `type` | offer type | `OFFER_TYPE_LABELS` in `src/lib/projects.ts` |
| `price` | max cash price in dinars, `1..10 000 000` | free number; compared against `cash_price_millimes` (× 1000) |
| `area` | area band | `optionsFor(config,"desired_area")` |
| `trees` | tree band | `optionsFor(config,"tree_count")`; bare land is never filtered out by it |
| `available` | `1` → offered parcels only | checkbox |

`LegalNotes` (`settings.legal.parcel_card_note` and `legal.no_guarantee_notice`) closes the band.

### 3.10 `/projects/[code]` — one offer, and its own form

Code must match `/^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/`, else `notFound()`.

Reading order implemented in the markup: header (code pill, status pill, name, governorate · delegation,
`location_description`, optional Google-Maps link from `public_project_page`'s lat/long) → the two hero figures →
cover photo → description/gallery/video → three fact groups («الأرض», «الزيتون», «الوثائق المتوفّرة») → the two
doors → **the offer form** → the parcel plan and parcel cards → payment/services/visit cards.

Key derived values:

```ts
const offerTrees = project.tree_count ?? 0;
const offerQuote = offerTrees > 0 && project.on_tree_pricing
  ? await getProjectQuote(project.id, mode, { trees: 1 })   // one tree prices the offer
  : null;
const selling      = project.status === "published" || project.status === "internal";
const interestOpen = flagState(config, "interest_form") === "public";
const formOpen     = selling && interestOpen && offerTrees > 0;
const visitOpen    = selling && interestOpen;
```

The comment above `offerTrees` records that the count must **not** depend on a price, because
`project.on_tree_pricing` is false until the offer lists a spacing class — the form is offered on the offer's own
trees and the price rows fall back to «السعر يُعلن لاحقاً».

Hero figure: `offerPrice()` prefers `min_price_per_tree_millimes` (labelled `settings.start.row_price_per_tree`),
falls back to `min_cash_price_millimes` (labelled «السعر حاضر»), and returns null when the offer is not `offered` —
in which case the total area takes the hero slot instead. The prefix is `settings.start.from_prefix`. The second
hero figure is always `stock.available` labelled «متاحة».

The two doors are in-page anchors: `settings.offers.submit_label` («سجّل اهتمامك بهذا العرض») → `#offer-form`, and
`settings.projects.visit_cta` («نحب نزور الأرض») → `#offer-visit`. The visit card repeats the first anchor; the
code comment states the visit must start at the offer's own form because `/register` «knows nothing about which land
the visitor wants to see».

#### The offer form — `OfferInterestForm`

| Question | Copy | Options / rules |
|---|---|---|
| how many trees | `settings.offers.trees_label` («قدّاش زيتونة تحب من هذا العرض؟») | quick chips `QUICK_PICKS = [1, 5, 10, 25, 50]` **hard-coded in the component**, filtered to `≤ maxTrees`, plus «الكل (N)»; then a free numeric field, default `"1"`, parsed through `toWesternDigits` |
| hint | `settings.offers.trees_hint` («من زيتونة وحدة إلى {max} زيتونة.») | `{max}` = `project.tree_count` |
| figures | `start.row_price_per_tree`, `start.row_area_per_tree`, `start.row_total_price`, `start.row_annual_fee` | `total = pricePerTree × trees`, `area = areaPerTree × trees`, `annualTotal = annualFeePerTree × trees` — multiplied **client-side**, the per-tree figures come from `public_project_quote`. When no price: `settings.projects.price_pending` |
| estimate note | `settings.start.estimate_note` | printed only when a price is shown |
| identity | «الاسم واللقب», «رقم الهاتف», «رقم WhatsApp هو نفس رقم الهاتف» + «رقم WhatsApp», «ولاية إقامتك» | `config.governorates` |
| contact | «كيفاش تحب نتصلوا بيك؟» → «مكالمة» / «WhatsApp» / «الزوز» (hard-coded), «الوقت المفضّل للمكالمة (اختياري)» → `optionsFor(config,"contact_time")` with «أي وقت» = null | |
| consent | `settings.legal.consent_text` | required |
| honeypot | hidden `Website` input, clipped (explicitly *not* offset by `-10000px`, which broke the RTL page) | |

Client validation is deliberately lighter than `/register`'s: trees in `1..maxTrees`, name ≥ 3 chars, phone digits
≥ 8, WhatsApp digits ≥ 8 when not the same, governorate, channel and consent. **Email is collected but never
validated on the client.**

Everything is a single screen — no wizard, no progress bar, no draft in `localStorage`.

#### `submitOfferInterest()` → `public.submit_offer_request(p jsonb)` (0049)

Server Action: refuses when `moduleAccess(config,"projects") === "closed"` with
`settings`-independent message «هذا العرض ما عادش متوفّر. شوف بقية العروض أو سجّل مطلبك من الحاسبة.»
(`offer_not_available` in `src/lib/errors.ts`); then zod, honeypot, `normalizePhone`, service-role RPC.

The RPC:

* runs the same identity checks as the calculator intake («so one person is one person in both flows», LEAD-04);
* requires the project to exist **and** `status = any (app.project_public_statuses())`, which is
  `['published']` plus `['sold_out','operating']` when `settings.projects.list_closed` is true (default true,
  `0020_public_projects.sql`). A `draft` or `internal` offer raises `offer_not_available` even if a form reached it;
* `trees` must parse and satisfy `1 ≤ trees ≤ project.tree_count` (when that count is > 0) → `invalid_offer_trees`
  («اكتب عدد الزيتونات بالأرقام، من زيتونة وحدة إلى العدد المتوفّر في العرض.»);
* prices via `app.project_quote_payload(project, null, trees, 'cash', null, null, false)` — the **project's own**
  rules and classes, not the global card. When pricing is closed the request is still accepted, without money;
* shares the IP/phone throttle and the person upsert + round-robin assignment with the calculator intake;
* writes `request_kind = 'offer'`, `project_id/project_code/project_name`, `offer_trees`,
  `offer_price_per_tree_millimes`, `offer_total_price_millimes`, `offer_annual_fee_per_tree_millimes`,
  `offer_annual_fee_total_millimes`, and fills the shared CRM columns so no new Back-Office screen is needed:
  `invest_anywhere=false`, `invest_governorate_ids = [offer's governorate]`, `project_type_unsure=true`,
  `tree_count_code='offer'`, `tree_count_label_ar = "<n> <settings.start.trees_unit>"`,
  `tree_count_min = tree_count_max = n`, `spacing_class_id/spacing_label_ar/area_per_tree_m2/total_area_m2`,
  `price_per_tree_millimes`, `total_price_millimes`;
* **no goal is asked or invented** — 0049 dropped the `not null` on `goal_option_id` and replaced it with
  `check (request_kind <> 'calculator' or goal_option_id is not null)`;
* enqueues the same `lead.confirmation` template, with an extra `offer` variable;
* returns `{request_no, project_code}`.

Confirmation replaces the form in place: `settings.offers.success_title` («وصلنا طلبك على هذا العرض»),
`offers.success_text`, «رقم مطلبك» + number, and «طلبك على «<name>» بـ <n> زيتونة.». There is **no** offers list,
no `/#million` link and no clipboard button here.

### 3.11 `/projects/[code]/[parcel]` — the third door

A parcel page quotes itself in one of two ways:

```ts
const treeQuote = parcel.on_tree_pricing
  ? await getProjectQuote(parcel.project_id, mode, {
      spacingClassId: parcel.spacing_class_id, trees: parcel.olive_tree_count,
      paymentMode: payment, downPercentOptionId: downPercentId, durationOptionId: durationId })
  : null;
const offer = treeQuote ? null : await getParcelOffer(parcel.id, mode, {down, installment});
if (!treeQuote && !offer) notFound();
```

URL parameters read here: `payment` (`parsePaymentMode`), `down_pct`, `duration` (UUID regex, only when
`payment === "installments"`), and for legacy parcels `down`, `installment`, `trees`, `scenario`. `TreeOfferBlock`
(`src/components/site/tree-offer-block.tsx`) renders the payment/percentage/duration choices as **links back to the
same page** (`?payment=…&down_pct=…&duration=…#offer`), so the page stays server-rendered — the same questions as
`/start`, asked on the parcel instead.

`canAsk = interestOpen && (treeQuote ? parcel.offered : offer.offered && offer.priced)`. The two CTAs are built with
`interestHref()` (`src/lib/public-hrefs.ts`):

```
/register?parcel=<parcel uuid>&trees_custom=<olive_tree_count>&spacing=<class uuid>
         [&payment=…][&down_pct=…][&duration=…][&visit=1]
```

(for a legacy parcel: `?parcel=…&trees=<tree_count option id>&scenario=<scenario id>`, both defaulted from
`public_parcel_offer`'s `suggested_tree_count_option_id` / `suggested_scenario_id`).

When the parcel cannot be asked for, the CTA becomes `settings.projects.taken_cta`
(«سجّل اهتمامك بقطعة مشابهة») pointing at the offer page, not at a bare `/register`.

---

### 3.12 Where the two paths converge — and where they do not

**They converge in the database, not in the UI.**

| Shared | Detail |
|---|---|
| Table | both intakes insert into `public.interest_requests`, told apart by `request_kind` (`'calculator'` \| `'offer'`, check constraint `interest_requests_kind_check`) |
| Person | both upsert `public.persons` on `phone_e164`, set `consent_at`/`last_request_at`, mark `is_duplicate` when the person already existed |
| Numbering | one counter, `app.next_number('interest_request:<year>')`, one prefix `settings.request_no.prefix` |
| Throttle | the same IP-hour and phone-day limits, so «one person cannot flood both» (0049 comment) |
| Assignment | the same `crm.auto_assign_mode = 'round_robin'` rule and `person_assignments` row |
| Consent | the same `settings.legal.consent_text` snapshotted into `consent_text` |
| Messaging | both call `app.enqueue_message('lead.confirmation', …)` → `public.notification_outbox` |
| Lists | the same `governorates` and `contact_time` lists; the same `start.*` row labels for money and area |
| Source | both send `readVisitSource()` → `app.clean_source()` → `interest_requests.source` |
| Tree columns | `tree_count_min/max/label_ar/code` are filled by both, so CRM counts and exports see one population |

**They do not converge anywhere else.** Two different forms, two different Server Actions, two different RPCs, two
different confirmation screens, and — importantly — **two different price sources**: `/start` is priced by
`app.tree_price(class, NULL)`, the single global rate card; an offer page is priced by
`app.project_quote_payload(project, …)`, which uses the offer's own `tree_pricing_rules`, `project_spacing_classes`,
`project_down_payment_percents` and `financing_markups` rows. The same visitor can therefore see one price on
`/start` and a different one on an offer page for the same spacing class.

**The parcel door is a third path that ends inside Path A, and loses the parcel on the way.** `interestHref()`
writes `parcel=<uuid>`, but:

* `readCalculatorChoices()` never reads `parcel`;
* `RegisterWizardProps` / `FormState` / `InterestInput` contain no parcel or project field (grep for `parcel` under
  `src/app/(public)/register/` returns nothing);
* `submit_interest_request` writes no `project_id`, although `interest_requests` has had project columns since 0020
  and 0049 added an index on them.

The `parcel` parameter also disappears from the address bar as soon as the visitor goes back to `/start`, because
`history.replaceState` rewrites the URL from `calculatorQuery()` alone. A parcel with more olive trees than
`million.custom_trees_max` is dropped by `readCalculatorChoices`, after which `/register` redirects to `/start`.

The reverse crossing — from Path A to Path B — is offered twice, both as plain links that carry nothing: the last
`/start` screen («عروضنا الحالية» → `/projects`) and the `/register` confirmation screen's offer grid.

---

### 3.13 Conditional and skipped steps, in one place

| Step / block | Disappears when | Where decided |
|---|---|---|
| `/start` spacing screen | `tree_spacing_classes` has no active row | `steps` memo; `getSpacingClasses()` also returns `[]` (and logs) when the query fails, so intake keeps working |
| `/start` type screen | `ownership_scenarios` has no active row | `steps` memo |
| `/start` down-payment screen | payment is `cash`, or the `down_payment_percent` list is empty | `steps` memo; mirrored by `calculatorGap` and by the RPC's `exists(...)` guard |
| `/start` duration screen | payment is `cash`, or the `duration` list is empty | same |
| `/start` area rows | no spacing classes (`withSpacing`) | `calculatorSummary` |
| `/start` price rows | `pricing !== "ok"` (flag closed, or no rate card) | `calculatorSummary` |
| `/start` annual-fee row | either annual figure is null | `calculatorSummary` |
| `/start` instalment rows | plan status is not `ok` | `calculatorSummary` |
| `/start` offers button | `projects` module closed to this visitor, or `site.cta_offers_label` empty | `start/page.tsx` + `start-chooser.tsx` |
| `/start` value strip | `settings.start.values` empty | `start-chooser.tsx` |
| `/register` entirely | no tree answer in the URL → `redirect("/start…")` | `register/page.tsx` |
| `/register` step 5 time list | `contact_time` list empty | `ContactStep` |
| `/register` steps 4 answers | never required — `wants_visit` / `wants_bank_financing` may both stay `null` | `validateStep` |
| `/register` success offers | `projects` closed, or no offer passes `offered && on_tree_pricing && tree_count > 0`, or `register.offers_title` empty | `register/page.tsx`, `Success` |
| Offer form on `/projects/[code]` | `interest_form` is not `public`, or the offer is not `published`/`internal`, or `tree_count` is 0/null | `formOpen` |
| Offer price rows | `on_tree_pricing` false, `tree_count` 0, or the quote is not `ok` | `offerQuote` + `OfferInterestForm` |
| Offer «الكل (N)» chip | `maxTrees === 1` | `OfferInterestForm` |
| Parcel section on an offer page | the offer has no parcels | `own.length > 0` |
| Parcel CTAs | `interest_form` not public, or the parcel is not offered / not priced | `canAsk` |
| Home offer section | `projects` flag is not `public` (`internal` shows nothing here, because the page is prerendered and must not read the staff session) | `offersOpen` in `page.tsx` |
| Home counter | `public_statistics` not `public` | `progress` |
| Home unit section | `settings.site.unit_title` empty, or no spacing classes | `page.tsx` |
| Home services / land sections | `site.services_title` empty / `land_offers` not public | `page.tsx` |
| Sticky mobile CTA | `interest_form` not public, label empty, or the path matches `OWN_ACTION` | `layout.tsx`, `sticky-cta.tsx` |

---

### 3.14 What an admin can change, per step

All Back-Office screens live under `src/app/admin/(panel)/` and every one of them calls `requireStaff(ADMIN_ROLES)`.

| Step / element | Admin screen | Storage |
|---|---|---|
| Whether `/start`, `/register`, `/projects`, `/land`, the counter exist at all | `settings/modules/page.tsx` — three states «مخفي عن الجميع» / «يراه فريق AgriZed المسجّل فقط» / «ظاهر لكل الزوار» | `public.feature_flags.state` |
| Every question title, hint, button label, note, error copy on `/start`, `/register` and the offer form | `settings/page.tsx` | `public.settings` (`is_public = true` rows are what the site reads) |
| Tree-count tiers, goals, contact times, durations, down-payment percentages, areas, documents, services | `settings/lists/page.tsx` (`saveOptionItem`) | `public.option_items` (`is_active`, `sort_order`, `label_ar/fr`, `min_number`, `max_number`) |
| Offer types shown on step 3, with their picture and icon | `settings/lists/page.tsx` (`saveScenario`, `clearScenarioImage`) | `public.ownership_scenarios` |
| Typed-number limits | `settings/page.tsx` | `settings.million.custom_trees_min` / `…_max` |
| Spacing classes (the area per tree), rate card, extra cost items, margin, rounding, yearly fee, duration markups, month cap | `pricing/page.tsx` | `tree_spacing_classes`, `tree_pricing_rules`, `tree_cost_items`, `financing_markups`, `settings.pricing.max_months` |
| An offer's own price rules, its spacing classes, its percentages | `projects/[id]/page.tsx` (pricing tab) | `tree_pricing_rules(project_id)`, `project_spacing_classes`, `project_down_payment_percents` |
| Whether an offer appears, and whether it can take requests | `projects/[id]/page.tsx` | `projects.status`, `projects.tree_count`; plus `settings.projects.list_closed` |
| Parcel statuses that count as held/sold | `projects/[id]/parcels/[parcelId]/page.tsx` | `parcels.status` |
| Photos behind `home.hero`, `start.side`, `home.journey`, `home.land`, `home.closing` | `settings/media/page.tsx` | `public.site_media` |
| Anti-spam limits, international phones, auto-assignment, request-number prefix, consent text | `settings/page.tsx` | `settings.antispam.*`, `lead.allow_international_phone`, `crm.auto_assign_mode`, `request_no.prefix`, `legal.consent_text` |
| Lead statuses a new request lands in | `settings/lists/page.tsx` (`saveLeadStatus`) | `public.lead_statuses` (`stage='new'`, `is_stage_default`) |

Cache invalidation: `src/lib/config.ts` caches the whole public configuration for 300 s under tag `public-config`;
`src/lib/public-projects.ts` caches the anon RPC results for 60 s under tag `public-projects`; the home page also
carries `revalidate = 60`. So an admin edit is not instantaneous on the public site unless the corresponding tag is
revalidated by the admin action.

---

### 3.15 Validation and error catalogue (public intake)

| Code | Raised by | Arabic message (`src/lib/errors.ts`) |
|---|---|---|
| `invalid_full_name` | both RPCs | «اكتب الاسم واللقب كاملين.» |
| `invalid_phone` | `app.assert_phone` | «رقم الهاتف غير صحيح. اكتب 8 أرقام، مثال: 98 123 456.» |
| `phone_not_tunisian` | `app.assert_phone` | «نقبل حالياً الأرقام التونسية فقط…» |
| `invalid_whatsapp` / `invalid_email` | both RPCs | «رقم WhatsApp غير صحيح…» / «البريد الإلكتروني غير صحيح…» |
| `consent_required` | both RPCs | «لإرسال الطلب، وافق على التواصل ومعالجة معطياتك.» |
| `invalid_governorate` / `invalid_delegation` | both RPCs | «اختر ولايتك من القائمة.» / «اختر المعتمدية من القائمة.» |
| `invest_location_required` / `invalid_invest_governorate` | calculator RPC | «اختر ولاية واحدة على الأقل، أو «المكان غير مهم».» |
| `invalid_scenario` / `single_scenario_only` | calculator RPC | «أحد الاختيارات لم يعد متاحاً…» / «اختر خياراً واحداً فقط.» |
| `invalid_goal` | calculator RPC | «اختر هدفك من القائمة.» |
| `invalid_tree_choice` / `invalid_tree_custom` | calculator RPC + `calculatorGap` | «اختر عدد الزيتونات من القائمة.» / «اكتب عدد الزيتونات بالأرقام، ضمن الحدود المسموح بها.» |
| `invalid_spacing` | calculator RPC | «اختر المساحة لكل زيتونة من القائمة، أو اتركها بلا اختيار.» |
| `invalid_payment_mode` | calculator RPC + `calculatorGap` | «اختر طريقة الدفع: بالحاضر أو بالتقسيط.» |
| `invalid_down_payment_percent` / `down_payment_percent_required` | calculator RPC + `calculatorGap` | «نسبة التسبقة اللي اخترتها ما عادتش متاحة…» / «نسبة التسبقة ناقصة. ارجع للحاسبة…» |
| `invalid_duration` / `duration_required` | calculator RPC + `calculatorGap` | «اختر مدة الدفع من القائمة.» / «مدة الدفع ناقصة. ارجع للحاسبة…» |
| `contact_channel_required` / `invalid_contact_time` | both RPCs | «اختر كيف تحب نتصلوا بيك.» / «اختر الوقت المفضل من القائمة.» |
| `rate_limited` | `app.check_throttle` + the phone-per-day count | «وصلنا عدد كبير من الطلبات من نفس المصدر. حاول مرة أخرى بعد ساعة.» |
| `offer_not_available` | offer RPC + the offer Server Action | «هذا العرض ما عادش متوفّر. شوف بقية العروض أو سجّل مطلبك من الحاسبة.» |
| `invalid_offer_trees` | offer RPC | «اكتب عدد الزيتونات بالأرقام، من زيتونة وحدة إلى العدد المتوفّر في العرض.» |
| (unknown) | — | «تعذّر إرسال الطلب. تحقق من اتصالك وحاول مرة أخرى.» |

`isKnownIntakeError()` decides whether the Server Action also logs to the server console — known business errors
are not logged, everything else is.

---

### 3.16 Adjacent public routes

* **`/land`** — the landowner path, gated on `land_offers`. `LandOfferForm` collects governorate + delegation,
  location text, optional lat/long, area with unit (`ha`/`m2`), property type, olive-tree count, tree age,
  irrigation (`rainfed`/`irrigated`), water source, asking price, «قابل للتفاوض», documents, contact name/phone,
  capacity (`owner`/`agent`/`broker`), consent and up to `settings.land_offer.max_files` (10) files of
  `application/pdf`, `image/jpeg`, `image/png`, each at most `min(settings.land_offer.max_file_size_mb, 20)` MB.
  It ends in a different table via `submitLandOffer`, not in `interest_requests`.
* **`/projects/map`** — governorate tiles from `public_coverage`, each linking to `/projects?gov=<id>`; governorates
  with no project are listed under `settings.projects.map_empty_governorate`.
* **`/simulator`** — `redirect("/start")`. Its former UI, `simulator/capacity-simulator.tsx` (141 lines,
  «احسب قدرتك»), is **not imported anywhere**; it is dead code.
* **`/zitounti`** — the header renders a link to it when `flagState(config,"zitounti") === "public"`
  (`src/components/site/site-header.tsx:33`), but no route file exists under `src/app/`.

---

## OBSERVATIONS

These are factual remarks about the code as read. None of them is a proposal.

1. **The parcel identity is dropped at the `/start`→`/register` boundary.** `interestHref()` writes `parcel=<uuid>`;
   `/register` never reads it, `submitInterest` has no field for it, and `submit_interest_request` writes no
   `project_id`. The columns and the index exist (`interest_requests.project_id`, `interest_requests_project_idx`,
   added by 0020 and 0049) and are only ever written by `submit_offer_request`. A visitor who arrives from a parcel
   page produces a request indistinguishable from one started on the home page.

2. **`/start` and an offer page can quote different prices for the same spacing class.** `public_tree_quote` hard-codes
   `app.tree_price(v_class.id, null)` — the global rate card — while `app.project_quote_payload` uses the offer's own
   rules. `docs/plan-rebuild.md:54` describes this exact coupling as something to change; the code has not changed.

3. **`readCalculatorChoices` infers a payment mode.** `paymentMode: parsePaymentMode(params.payment) ?? (downPercentId
   || durationId ? "installments" : null)` — a hand-written URL carrying only `down_pct` silently becomes an
   instalment request.

4. **The two intakes validate identity to different depths on the client.** `/register` runs `phoneError()` and an
   email regex; the offer form only checks that the phone has ≥ 8 digits and never validates the email at all. Both
   are re-validated in Postgres, so the difference is only in when the visitor learns about it.

5. **Hard-coded business values in the public flow**, against the rule in `CLAUDE.md` that amounts, lists and texts
   come from `settings` / `option_items`: `QUICK_PICKS = [1, 5, 10, 25, 50]` and the channel labels «مكالمة /
   WhatsApp / الزوز» in `offer-interest-form.tsx`; `STEPS`, `CHANNEL_LABELS` («مكالمة هاتفية / WhatsApp / الاثنين»),
   `VISIT_CHOICES` («نعم» / «لا، مازال»), `BANK_CHOICES`, `NO_ANSWER` and the two step legends «تحب تزور الأرض؟» /
   «تحب حل تمويل بنكي؟» in `register-wizard.tsx`; «رجوع», «التالي», «الخطوة … من …», «تبديل» in `start-chooser.tsx`;
   «تعديل», «أرسل الطلب», «جارٍ الإرسال…» in `register-wizard.tsx`. The same channel triple is spelled two different
   ways in the two forms.

6. **The same contact channel is labelled differently on the two paths** (item 5), so a lead's channel reads
   «الاثنين» when it came from the calculator and «الزوز» when it came from an offer page — although the stored value
   is the same `contact_channel` enum.

7. **`settings.start.capacity_title` / `capacity_hint` (and their `_fr` twins) are dead keys**, kept alive only
   because `supabase/tests/005_start_custom_trees.sql` asserts they exist and are public. `0041_payment_hint.sql`
   documents this in their `description_ar`.

8. **`simulator/capacity-simulator.tsx` is unreachable code** — 141 lines with its own copy and money arithmetic,
   imported by nothing; `/simulator` redirects to `/start` before rendering anything.

9. **The header can link to a route that does not exist.** `showZitounti` turns on a `/zitounti` link when the flag
   is `public`, and there is no `src/app/(public)/zitounti/` directory.

10. **`app.enqueue_message` is the end of the line in this repository.** Both intakes enqueue `lead.confirmation`
    into `public.notification_outbox`; nothing under `src/` reads or sends from that table (the only match for
    `notification_outbox` in `src/` is the generated `database.types.ts`), and there is no route handler or worker
    for it.

11. **A `sold_out` or `operating` offer can still accept requests.** `submit_offer_request` checks
    `status = any (app.project_public_statuses())`, and that function includes `sold_out` and `operating` whenever
    `settings.projects.list_closed` is true (its default). The page-level `formOpen` gate would normally hide the
    form for those statuses (`selling` is `published`/`internal` only), so the two guards disagree; the RPC is the
    looser one.

12. **Staff preview is treated inconsistently between the offer page and its Server Action.** The page computes
    `interestOpen = flagState(config, "interest_form") === "public"`, so staff previewing an `internal`
    `interest_form` never see the form; `submitOfferInterest` gates on `moduleAccess(config,"projects") !== "closed"`
    and does not consult `interest_form` at all, with the comment that staff should be able to try the flow.

13. **`/register`'s `forwardedQuery` and `/start`'s `replaceState` disagree.** The redirect back to `/start` carefully
    preserves every incoming parameter; the first `useEffect` on `/start` then rewrites the URL from
    `calculatorQuery()` alone, deleting anything the calculator does not own (`parcel`, `utm_*`, `ref`).

14. **`getSpacingClasses()` swallows its own failure** (`catch { console.error; return [] }`). When the query fails,
    the spacing question silently vanishes from `/start` and every area and price row disappears with it — the page
    renders as if the Back Office had no spacing classes.

15. **The offer form multiplies money on the client.** `total = pricePerTreeMillimes × trees` in
    `offer-interest-form.tsx`, justified in a comment by `v_total := v_per_tree * v_trees` in 0034. The displayed
    figure and the snapshotted one are computed by two different pieces of code that happen to agree.

16. **Duplicate stock logic lives in a page file.** `offerStock()`, `areaPerTree()`, `longestDuration()`,
    `StockCell`, `StockStrip`, `LegalNotes` and `offersTitle()` are exported from
    `src/app/(public)/projects/page.tsx` and imported by `src/app/(public)/page.tsx`,
    `projects/[code]/page.tsx` and `projects/[code]/[parcel]/page.tsx` — a route module is acting as a shared
    component library.

17. **Documentation that disagrees with the code.** `README.md:48` describes `src/app/(public)/` as «home, /register
    (step-by-step form), /simulator, /land» — it names `/simulator` (now a redirect) and omits `/start` and the whole
    `/projects` module. `docs/gap-rapport-v3.md:41` still describes `/register` as having a «قدرتك المالية» step
    asking for a monthly instalment; that step does not exist in the code (payment mode / percentage / duration on
    `/start` replaced it). `docs/gap-rapport-v3.md:50` describes the home-page buttons as «سجّل مطلبك» +
    «اكتشف كيفاش تخدم»; the home page now renders two doors labelled from `site.unit_cta` and `offers.title`, and
    «اكتشف كيفاش تخدم» (`site.cta_secondary_label`) is rendered only when the `projects` module is closed.

18. **Digits are always Western.** `formatCount`, `formatMillimes`, `formatArea` and `formatSpacing`
    (`src/lib/format.ts`) all use `Intl.NumberFormat("en-US")`, and `toWesternDigits()` converts Arabic-Indic input
    before parsing, so an Arabic-Indic number typed by a visitor is accepted but never echoed back in that form.

19. **`down_payment_percent` items are read through `min_number`, and their label is free text.** The percentage used
    in the arithmetic is `option_items.min_number`; the label «10%» is independent of it. An admin can make the two
    disagree, and the page will print the label while the database computes from the number.
