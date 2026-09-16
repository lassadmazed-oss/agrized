// Shared by /start (client) and /register (server): the URL contract between them and the rows of
// «مشروعك المبدئي». Pure functions only, so both sides show the same figures the same way.

import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import type { PaymentMode, TreeQuote } from "@/lib/tree-pricing";

/** An Arabic value and its French twin; `fr` is null when the French wording is not set yet. */
export type Line = { ar: string; fr: string | null };

/** The calculator answers (P2-6): asked on /start only, carried to /register and back in the URL. */
export type CalculatorChoices = {
  treeId: string | null;
  treesCustom: number | null;
  scenarioId: string | null;
  spacingId: string | null;
  paymentMode: PaymentMode | null;
  downPercentId: string | null;
  durationId: string | null;
};

/** Query string of the /start ⇄ /register contract; only answered choices travel. */
export function calculatorQuery(choices: CalculatorChoices, wantsVisit: boolean): string {
  const params = new URLSearchParams();
  if (choices.treeId) params.set("trees", choices.treeId);
  else if (choices.treesCustom !== null) params.set("trees_custom", String(choices.treesCustom));
  if (choices.scenarioId) params.set("scenario", choices.scenarioId);
  if (choices.spacingId) params.set("spacing", choices.spacingId);
  if (choices.paymentMode) params.set("payment", choices.paymentMode);
  if (choices.paymentMode === "installments") {
    if (choices.downPercentId) params.set("down_pct", choices.downPercentId);
    if (choices.durationId) params.set("duration", choices.durationId);
  }
  if (wantsVisit) params.set("visit", "1");
  return params.toString();
}

/** What still blocks a request, named by the intake error the database would raise. */
export type CalculatorGap = "invalid_tree_choice" | "invalid_payment_mode" | "down_payment_percent_required" | "duration_required";

/** A question whose Back Office list is empty is hidden, so it cannot be required. */
export function calculatorGap(
  choices: CalculatorChoices,
  listSizes: { downPercents: number; durations: number },
): CalculatorGap | null {
  if (!choices.treeId && choices.treesCustom === null) return "invalid_tree_choice";
  if (!choices.paymentMode) return "invalid_payment_mode";
  if (choices.paymentMode === "installments") {
    if (listSizes.downPercents > 0 && !choices.downPercentId) return "down_payment_percent_required";
    if (listSizes.durations > 0 && !choices.durationId) return "duration_required";
  }
  return null;
}

/** Row labels and notes of the summary, resolved from `settings` on the server (PRN-02). */
export type SummaryCopy = {
  rowTrees: string;
  rowTreesFr: string;
  treesUnit: string;
  treesUnitFr: string;
  rowType: string;
  rowTypeFr: string;
  rowAreaPerTree: string;
  rowAreaPerTreeFr: string;
  rowTotalArea: string;
  rowTotalAreaFr: string;
  rowPricePerTree: string;
  rowPricePerTreeFr: string;
  rowTotalPrice: string;
  rowTotalPriceFr: string;
  rowPayment: string;
  rowPaymentFr: string;
  paymentCash: string;
  paymentCashFr: string;
  paymentInstallments: string;
  paymentInstallmentsFr: string;
  rowDown: string;
  rowDownFr: string;
  rowDuration: string;
  rowDurationFr: string;
  rowTotalFinanced: string;
  rowTotalFinancedFr: string;
  rowRemaining: string;
  rowRemainingFr: string;
  rowMonthly: string;
  rowMonthlyFr: string;
  /** Contains `{amount}`. */
  lastInstallment: string;
  lastInstallmentFr: string;
  /** Contains `{count}`. */
  installmentsCount: string;
  installmentsCountFr: string;
  fromPrefix: string;
  fromPrefixFr: string;
  priceUnavailable: string;
  priceUnavailableFr: string;
  durationNotPriced: string;
  durationNotPricedFr: string;
  downCoversTotal: string;
  downCoversTotalFr: string;
};

export type SummaryRowKey =
  | "trees"
  | "type"
  | "area_per_tree"
  | "total_area"
  | "price_per_tree"
  | "total_price"
  | "payment"
  | "down"
  | "duration"
  | "total_financed"
  | "remaining"
  | "monthly";

/** `value` is null for a question not answered yet. */
export type SummaryRow = { key: SummaryRowKey; label: Line; value: Line | null; notes: Line[] };

type Labelled = { label_ar: string; label_fr: string | null };
type Tier = Labelled & { min_number: number | null; max_number: number | null };

export type SummaryInput = {
  copy: SummaryCopy;
  tree: Tier | null;
  treesCustom: number | null;
  scenario: Labelled | null;
  /** The area rows exist only while the Back Office has spacing classes. */
  withSpacing: boolean;
  areaPerTreeM2: number | null;
  paymentMode: PaymentMode | null;
  downPercent: Labelled | null;
  duration: Labelled | null;
  /** The database quote for these choices; every figure comes from it, never computed here. */
  quote: TreeQuote | null;
};

export type CalculatorSummary = {
  rows: SummaryRow[];
  /** Why a figure is missing: no price yet, an unpriced duration, a down payment above the total. */
  notice: Line | null;
  priced: boolean;
};

function line(ar: string, fr: string): Line {
  return { ar, fr: fr || null };
}

function fill(template: string, key: string, value: string): string {
  return template.split(`{${key}}`).join(value);
}

export function areaLine(m2: number): Line {
  return { ar: formatArea(m2), fr: formatArea(m2, "m²") };
}

export function moneyLine(millimes: number): Line {
  // Whole dinars stay short; an amount with millimes is shown exactly rather than rounded.
  const withMillimes = millimes % 1000 !== 0;
  const digits = withMillimes ? 3 : 0;
  const fr = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    millimes / 1000,
  );
  return { ar: formatMillimes(millimes, { withMillimes }), fr: `${fr} DT` };
}

function moneyOrNull(millimes: number | null | undefined): Line | null {
  return millimes === null || millimes === undefined ? null : moneyLine(millimes);
}

function labelled(option: Labelled | null): Line | null {
  return option ? { ar: option.label_ar, fr: option.label_fr } : null;
}

/**
 * Owner, 2026-09-16: «المتبقي بعد التسبقة زيدو النسبة بالمئة … من المتبقي من الثمن بالحاضر» — the share of the
 * CASH price left after the down payment, so 20 % paid reads as 80 % left. The amount beside it is what the client
 * actually still pays, markup included, and it sits under the financed total.
 */
function remainingShare(cashTotalMillimes: number | null, downMillimes: number | null): number | null {
  return cashTotalMillimes && downMillimes !== null
    ? Math.round(((cashTotalMillimes - downMillimes) / cashTotalMillimes) * 100)
    : null;
}

/** «83% · 9,800 د.ت», in the shape the down payment row already uses. */
function withPercent(value: Line | null, percent: number | null): Line | null {
  if (!value || percent === null) return value;
  const share = `${formatCount(percent)}%`;
  return { ar: `${share} · ${value.ar}`, fr: value.fr ? `${share} · ${value.fr}` : value.fr };
}

export function calculatorSummary(input: SummaryInput): CalculatorSummary {
  const { copy, tree, treesCustom, quote } = input;
  const installments = input.paymentMode === "installments";
  const priced = quote?.pricing === "ok";

  // A tier covers "N trees or more" unless its upper bound equals its lower one, so its totals are minimums.
  const openEnded = tree !== null && tree.min_number !== null && (tree.max_number === null || tree.max_number > tree.min_number);
  const atLeast = (value: Line | null): Line | null =>
    value && openEnded
      ? {
          ar: [copy.fromPrefix, value.ar].filter(Boolean).join(" "),
          fr: copy.fromPrefixFr && value.fr ? `${copy.fromPrefixFr} ${value.fr}` : null,
        }
      : value;

  const trees: Line | null = tree
    ? labelled(tree)
    : treesCustom !== null
      ? {
          ar: `${formatCount(treesCustom)} ${copy.treesUnit}`,
          fr: copy.treesUnitFr ? `${formatCount(treesCustom)} ${copy.treesUnitFr}` : null,
        }
      : null;

  const rows: SummaryRow[] = [
    { key: "trees", label: line(copy.rowTrees, copy.rowTreesFr), value: trees, notes: [] },
    { key: "type", label: line(copy.rowType, copy.rowTypeFr), value: labelled(input.scenario), notes: [] },
  ];

  if (input.withSpacing) {
    rows.push(
      {
        key: "area_per_tree",
        label: line(copy.rowAreaPerTree, copy.rowAreaPerTreeFr),
        value: input.areaPerTreeM2 === null ? null : areaLine(input.areaPerTreeM2),
        notes: [],
      },
      {
        key: "total_area",
        label: line(copy.rowTotalArea, copy.rowTotalAreaFr),
        value: quote?.total_area_m2 != null ? atLeast(areaLine(quote.total_area_m2)) : null,
        notes: [],
      },
    );
  }

  const pricePerTree = priced ? moneyOrNull(quote?.price_per_tree_millimes) : null;
  const totalPrice = priced ? atLeast(moneyOrNull(quote?.total_price_millimes)) : null;
  if (pricePerTree) {
    rows.push({ key: "price_per_tree", label: line(copy.rowPricePerTree, copy.rowPricePerTreeFr), value: pricePerTree, notes: [] });
  }
  if (totalPrice) {
    rows.push({ key: "total_price", label: line(copy.rowTotalPrice, copy.rowTotalPriceFr), value: totalPrice, notes: [] });
  }

  const payment: Line | null =
    input.paymentMode === "cash"
      ? line(copy.paymentCash, copy.paymentCashFr)
      : installments
        ? line(copy.paymentInstallments, copy.paymentInstallmentsFr)
        : null;
  rows.push({ key: "payment", label: line(copy.rowPayment, copy.rowPaymentFr), value: payment, notes: [] });

  const plan = installments && priced ? (quote?.installments ?? null) : null;
  const okPlan = plan?.status === "ok" ? plan : null;

  if (installments) {
    const percent = labelled(input.downPercent);
    const downAmount = atLeast(moneyOrNull(okPlan?.down_payment_millimes));
    // «10% · 1,000 د.ت»: the percentage label is language-neutral, so it also leads the French line.
    const down: Line | null =
      percent && downAmount
        ? {
            ar: `${percent.ar} · ${downAmount.ar}`,
            fr: downAmount.fr ? `${percent.fr ?? percent.ar} · ${downAmount.fr}` : percent.fr,
          }
        : percent;
    rows.push(
      { key: "down", label: line(copy.rowDown, copy.rowDownFr), value: down, notes: [] },
      { key: "duration", label: line(copy.rowDuration, copy.rowDurationFr), value: labelled(input.duration), notes: [] },
    );
  }

  const totalFinanced = atLeast(moneyOrNull(okPlan?.total_financed_millimes));
  const remaining = atLeast(moneyOrNull(okPlan?.remaining_millimes));
  const monthly = atLeast(moneyOrNull(okPlan?.monthly_millimes));
  if (okPlan && totalFinanced && remaining && monthly) {
    const notes: Line[] = [];
    // Q-11: rounding the monthly amount up can end the plan early with a smaller last installment.
    if (okPlan.last_installment_millimes !== null && okPlan.last_installment_millimes !== okPlan.monthly_millimes && copy.lastInstallment) {
      const last = moneyLine(okPlan.last_installment_millimes);
      notes.push({
        ar: fill(copy.lastInstallment, "amount", last.ar),
        fr: copy.lastInstallmentFr && last.fr ? fill(copy.lastInstallmentFr, "amount", last.fr) : null,
      });
    }
    if (okPlan.shortened && okPlan.installments_count !== null && copy.installmentsCount) {
      const count = formatCount(okPlan.installments_count);
      notes.push({
        ar: fill(copy.installmentsCount, "count", count),
        fr: copy.installmentsCountFr ? fill(copy.installmentsCountFr, "count", count) : null,
      });
    }
    rows.push(
      { key: "total_financed", label: line(copy.rowTotalFinanced, copy.rowTotalFinancedFr), value: totalFinanced, notes: [] },
      {
        key: "remaining",
        label: line(copy.rowRemaining, copy.rowRemainingFr),
        value: withPercent(remaining, remainingShare(quote?.total_price_millimes ?? null, okPlan.down_payment_millimes)),
        notes: [],
      },
      { key: "monthly", label: line(copy.rowMonthly, copy.rowMonthlyFr), value: monthly, notes },
    );
  }

  const notice: Line | null =
    quote?.pricing === "unavailable"
      ? line(copy.priceUnavailable, copy.priceUnavailableFr)
      : plan?.status === "duration_not_priced"
        ? line(copy.durationNotPriced, copy.durationNotPricedFr)
        : plan?.status === "down_covers_total"
          ? line(copy.downCoversTotal, copy.downCoversTotalFr)
          : null;

  return { rows, notice, priced };
}
