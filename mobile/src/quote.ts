import { supabase } from "./api";
import { formatMessage, t, type AppConfig, type OptionItem, type Scenario, type SpacingClass } from "./config";
import { siteFormat, type SiteFormat } from "./format";

/**
 * What a project costs — answered by Postgres, never by this file.
 *
 * THE ONE RULE THAT MATTERS HERE. `public_tree_quote` returns the price per tree, the total, the yearly care,
 * the down payment, the financed total, the amount remaining, the monthly instalment and the last instalment.
 * Not one of them is a multiplication the app could do: the instalment plan carries a markup per duration
 * (report v3 §12, app.financed_quote), the monthly is rounded up to the dinar which can end the plan early
 * with a smaller final payment, and a tier is a MINIMUM so its totals are «ابتداءً من». The calculator tab
 * used to do `perTree × trees` in a component and call the result a تقدير — the arithmetic agreed with the
 * database for the cash total of a single spacing class and with nothing else, and it offered no instalment
 * at all while the `installments` flag has been public all along. Every formula in this product is in the
 * database, deliberately, and this file only asks.
 *
 * The RPC is granted to `anon` (0034), and it decides the pricing gate itself: `app.module_open('pricing')`
 * resolves `internal` to `app.is_staff()`, which is false for this key, so a closed module answers
 * `pricing: "closed"` with every amount null. PRJ-03 is therefore enforced in the database and reaches the
 * app for free — the app's job is only to never print a figure the answer did not carry.
 */

export type QuotePricing = "closed" | "unavailable" | "ok";

export type InstallmentStatus =
  | "ok"
  | "incomplete"
  | "invalid_choice"
  | "duration_not_priced"
  | "down_covers_total"
  | "too_many_months";

export type TreeInstallments = {
  status: InstallmentStatus;
  down_payment_percent: number | null;
  down_payment_millimes: number | null;
  months: number | null;
  total_financed_millimes: number | null;
  remaining_millimes: number | null;
  monthly_millimes: number | null;
  last_installment_millimes: number | null;
  installments_count: number | null;
  shortened: boolean;
};

/** Exactly what public.public_tree_quote answers. Mirrors src/lib/tree-pricing.ts's TreeQuote. */
export type TreeQuote = {
  spacing_class_id: string;
  area_per_tree_m2: number;
  trees: number | null;
  total_area_m2: number | null;
  pricing: QuotePricing;
  price_per_tree_millimes: number | null;
  total_price_millimes: number | null;
  /** Pruning, upkeep and follow-up, paid every year and never part of the price above (0045). */
  annual_fee_per_tree_millimes: number | null;
  annual_fee_total_millimes: number | null;
  installments: TreeInstallments | null;
};

export type PaymentMode = "cash" | "installments";

const STATUSES: readonly InstallmentStatus[] = [
  "ok",
  "incomplete",
  "invalid_choice",
  "duration_not_priced",
  "down_covers_total",
  "too_many_months",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const num = (value: unknown): number => Number(value ?? 0);
const orNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/**
 * Normalises the RPC's jsonb. `numeric` and `bigint` reach a JavaScript client as either numbers or strings
 * depending on their size, so every figure goes through Number() — and the three price fields are nulled
 * unless the answer says `pricing: "ok"`, the same belt-and-braces the website's `toTreeQuote` applies.
 */
export function toTreeQuote(data: unknown): TreeQuote | null {
  if (!isRecord(data)) return null;
  const pricing: QuotePricing = data.pricing === "ok" || data.pricing === "unavailable" ? data.pricing : "closed";
  const raw = data.installments;
  // THE PLAN IS NULLED ON THE SAME CONDITION AS THE PRICE, which it was not: the four price fields below were
  // dropped unless `pricing === "ok"` while this block kept its down payment, its monthly and its financed
  // total intact. `buildSummary` gates the whole instalment section on the same flag, so nothing reached a
  // screen — but a quote object that says «no price» while carrying seven amounts is a loaded gun for the next
  // caller, and an instalment IS a price. PRJ-03 is one answer, not one answer per field.
  const installments: TreeInstallments | null =
    pricing === "ok" && isRecord(raw)
      ? {
          status: STATUSES.includes(raw.status as InstallmentStatus)
            ? (raw.status as InstallmentStatus)
            : "incomplete",
          down_payment_percent: orNull(raw.down_payment_percent),
          down_payment_millimes: orNull(raw.down_payment_millimes),
          months: orNull(raw.months),
          total_financed_millimes: orNull(raw.total_financed_millimes),
          remaining_millimes: orNull(raw.remaining_millimes),
          monthly_millimes: orNull(raw.monthly_millimes),
          last_installment_millimes: orNull(raw.last_installment_millimes),
          installments_count: orNull(raw.installments_count),
          shortened: raw.shortened === true,
        }
      : null;
  return {
    spacing_class_id: String(data.spacing_class_id ?? ""),
    area_per_tree_m2: num(data.area_per_tree_m2),
    trees: orNull(data.trees),
    total_area_m2: orNull(data.total_area_m2),
    pricing,
    price_per_tree_millimes: pricing === "ok" ? orNull(data.price_per_tree_millimes) : null,
    total_price_millimes: pricing === "ok" ? orNull(data.total_price_millimes) : null,
    annual_fee_per_tree_millimes: pricing === "ok" ? orNull(data.annual_fee_per_tree_millimes) : null,
    annual_fee_total_millimes: pricing === "ok" ? orNull(data.annual_fee_total_millimes) : null,
    installments,
  };
}

export type TreeQuoteRequest = {
  spacingClassId: string;
  trees: number | null;
  paymentMode: PaymentMode | null;
  downPercentOptionId: string | null;
  durationOptionId: string | null;
};

/** The quote for these answers, or null when it could not be read. Never throws at a screen. */
export async function treeQuote(request: TreeQuoteRequest): Promise<TreeQuote | null> {
  const { data, error } = await supabase.rpc("public_tree_quote", {
    p_spacing_class: request.spacingClassId,
    p_trees: request.trees ?? undefined,
    p_payment_mode: request.paymentMode ?? undefined,
    p_down_percent_option_id: request.downPercentOptionId ?? undefined,
    p_duration_option_id: request.durationOptionId ?? undefined,
  });
  if (error) return null;
  return toTreeQuote(data);
}

/* ------------------------------------------------------------- what to print */

export type SummaryRowKey =
  | "trees"
  | "type"
  | "area_per_tree"
  | "total_area"
  | "price_per_tree"
  | "total_price"
  | "annual_fee"
  | "payment"
  | "down"
  | "duration"
  | "total_financed"
  | "remaining"
  | "monthly";

/** `value` null is a question not answered yet; the card keeps the row and prints nothing in it. */
export type SummaryRow = { key: SummaryRowKey; label: string; value: string | null; notes: string[] };

export type Answers = {
  tree: OptionItem | null;
  treesCustom: number | null;
  scenario: Scenario | null;
  spacing: SpacingClass | null;
  withSpacing: boolean;
  paymentMode: PaymentMode | null;
  downPercent: OptionItem | null;
  duration: OptionItem | null;
};

export type Summary = { rows: SummaryRow[]; notice: string | null; priced: boolean };

/**
 * The figures card, row by row, in the website's order — `src/app/[lang]/(public)/start/calculator-summary.ts`
 * with the bilingual twin taken out (the app is one language at a time; the French twin of /start is the
 * owner's page-scoped exception and belongs to whoever ports that screen).
 *
 * TWO THINGS IT IS CAREFUL ABOUT, both for the same reason — a figure on this card must not read as the price
 * of something that exists:
 *
 *  · «ابتداءً من» on every amount, because `public_tree_quote` prices one global rate card and an open-ended
 *    tier («أكثر من 500») is a minimum twice over. The prefix is `start.from_prefix`, the key the tiers
 *    already use, and it is said once per figure, never twice.
 *  · An amount that is not a whole number of dinars is printed exactly, in millimes, rather than rounded —
 *    `withMillimes` when `millimes % 1000 !== 0`, which is the site's own rule.
 */
export function buildSummary(config: AppConfig, answers: Answers, quote: TreeQuote | null): Summary {
  const fmt = siteFormat(config);
  const priced = quote?.pricing === "ok";
  const installments = answers.paymentMode === "installments";

  const money = (millimes: number | null | undefined): string | null =>
    millimes === null || millimes === undefined
      ? null
      : fmt.money(millimes, { withMillimes: millimes % 1000 !== 0 });
  const area = (m2: number | null | undefined): string | null =>
    m2 === null || m2 === undefined ? null : fmt.area(m2);

  const fromPrefix = t(config, "start.from_prefix");
  const startingAt = (value: string | null): string | null =>
    value && fromPrefix && !fromPrefix.startsWith("start.") ? `${fromPrefix} ${value}` : value;

  // A tier covers «N or more» unless its upper bound equals its lower one, so its totals are minimums.
  const tier = answers.tree;
  const openEnded = tier !== null && tier.min_number !== null && (tier.max_number === null || tier.max_number > tier.min_number);
  const atLeast = (value: string | null): string | null => (value && openEnded ? startingAt(value) : value);

  const trees: string | null = tier
    ? tier.label
    : answers.treesCustom !== null
      ? t(config, "ui.start.trees_count", { count: answers.treesCustom })
      : null;

  const rows: SummaryRow[] = [
    { key: "trees", label: t(config, "start.row_trees"), value: trees, notes: [] },
    { key: "type", label: t(config, "start.row_type"), value: answers.scenario?.label ?? null, notes: [] },
  ];

  if (answers.withSpacing) {
    rows.push(
      {
        key: "area_per_tree",
        label: t(config, "start.row_area_per_tree"),
        value: area(answers.spacing?.area_m2),
        notes: [],
      },
      {
        key: "total_area",
        label: t(config, "start.row_total_area"),
        value: atLeast(area(quote?.total_area_m2)),
        notes: [],
      },
    );
  }

  const pricePerTree = priced ? startingAt(money(quote?.price_per_tree_millimes)) : null;
  const totalPrice = priced ? startingAt(money(quote?.total_price_millimes)) : null;
  if (pricePerTree) {
    rows.push({ key: "price_per_tree", label: t(config, "start.row_price_per_tree"), value: pricePerTree, notes: [] });
  }
  if (totalPrice) {
    rows.push({ key: "total_price", label: t(config, "start.row_total_price"), value: totalPrice, notes: [] });
  }

  // Owner 2026-09-18: the yearly care of a tree belongs to the offer and is read BESIDE the price, never
  // inside it. The app never showed it at all, so a project looked cheaper on the phone than on the site.
  const annualTotal = priced ? atLeast(money(quote?.annual_fee_total_millimes)) : null;
  const annualPerTree = priced ? money(quote?.annual_fee_per_tree_millimes) : null;
  if (annualTotal && annualPerTree) {
    const template = t(config, "start.annual_fee_per_tree");
    rows.push({
      key: "annual_fee",
      label: t(config, "start.row_annual_fee"),
      value: annualTotal,
      notes: template.startsWith("start.") ? [] : [formatMessage(template, { amount: annualPerTree })],
    });
  }

  const payment =
    answers.paymentMode === "cash"
      ? t(config, "start.payment_cash")
      : installments
        ? t(config, "start.payment_installments")
        : null;
  rows.push({ key: "payment", label: t(config, "start.row_payment"), value: payment, notes: [] });

  const plan = installments && priced ? (quote?.installments ?? null) : null;
  const okPlan = plan?.status === "ok" ? plan : null;

  if (installments) {
    const percent = answers.downPercent?.label ?? null;
    const downAmount = atLeast(money(okPlan?.down_payment_millimes));
    rows.push(
      {
        key: "down",
        label: t(config, "start.row_down"),
        // «30% · 2,993 د.ت»: the percentage is the owner's label and the amount is the database's.
        value: percent && downAmount ? `${percent} · ${downAmount}` : percent,
        notes: [],
      },
      { key: "duration", label: t(config, "start.row_duration"), value: answers.duration?.label ?? null, notes: [] },
    );
  }

  const totalFinanced = atLeast(money(okPlan?.total_financed_millimes));
  const remaining = atLeast(money(okPlan?.remaining_millimes));
  const monthly = atLeast(money(okPlan?.monthly_millimes));
  if (okPlan && totalFinanced && remaining && monthly) {
    const notes: string[] = [];
    // Q-11: rounding the monthly amount up can end the plan early with a smaller last instalment.
    const lastTemplate = t(config, "start.last_installment");
    if (
      okPlan.last_installment_millimes !== null &&
      okPlan.last_installment_millimes !== okPlan.monthly_millimes &&
      !lastTemplate.startsWith("start.")
    ) {
      const last = money(okPlan.last_installment_millimes);
      if (last) notes.push(formatMessage(lastTemplate, { amount: last }));
    }
    const countTemplate = t(config, "start.installments_count");
    if (okPlan.shortened && okPlan.installments_count !== null && !countTemplate.startsWith("start.")) {
      notes.push(formatMessage(countTemplate, { count: okPlan.installments_count }));
    }
    rows.push(
      { key: "total_financed", label: t(config, "start.row_total_financed"), value: totalFinanced, notes: [] },
      { key: "remaining", label: t(config, "start.row_remaining"), value: remaining, notes: [] },
      { key: "monthly", label: t(config, "start.row_monthly"), value: monthly, notes },
    );
  }

  const notice =
    quote?.pricing === "unavailable"
      ? t(config, "start.price_unavailable")
      : plan?.status === "duration_not_priced"
        ? t(config, "start.duration_not_priced")
        : plan?.status === "down_covers_total"
          ? t(config, "start.down_covers_total")
          : null;

  return { rows, notice, priced };
}

/**
 * The figure the card leads with, because a number is read before its name: the monthly instalment once the
 * visitor picked instalments, the total of the request otherwise. It is moved to the head of the card and
 * taken out of the list underneath, so the same amount is never printed twice.
 */
export function leadKeyOf(summary: Summary): SummaryRowKey | null {
  if (summary.rows.some((row) => row.key === "monthly" && row.value)) return "monthly";
  if (summary.rows.some((row) => row.key === "total_price" && row.value)) return "total_price";
  return null;
}

/** Re-exported so a screen never reaches for a formatter of its own. */
export type { SiteFormat };
