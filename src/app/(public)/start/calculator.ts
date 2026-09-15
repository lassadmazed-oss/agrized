import "server-only";

import { optionsFor, settingInt, type OptionItem, type OwnershipScenario, type PublicConfig } from "@/lib/config";
import { getSpacingClasses, parsePaymentMode, publicTreeQuote, type SpacingClass, type TreeQuote } from "@/lib/tree-pricing";

import type { CalculatorChoices, SummaryCopy, SummaryInput } from "./calculator-summary";

type SearchParams = Record<string, string | string[] | undefined>;

/** Everything the calculator offers, from the Back Office lists (LEAD-01). */
export type CalculatorLists = {
  treeCounts: OptionItem[];
  scenarios: OwnershipScenario[];
  spacingClasses: SpacingClass[];
  downPercents: OptionItem[];
  durations: OptionItem[];
  customMin: number;
  customMax: number;
};

export async function getCalculatorLists(config: PublicConfig): Promise<CalculatorLists> {
  return {
    treeCounts: optionsFor(config, "tree_count"),
    scenarios: config.scenarios,
    spacingClasses: await getSpacingClasses(),
    // Q-1: a percentage of the cash total; the amount list 'down_payment' is retired.
    downPercents: optionsFor(config, "down_payment_percent"),
    // Report v3 §6, §12: the visitor picks a duration; the monthly amount is computed, never chosen.
    durations: optionsFor(config, "duration"),
    customMin: settingInt(config, "million.custom_trees_min", 1),
    customMax: settingInt(config, "million.custom_trees_max", 5000),
  };
}

/** The answers in the URL, each checked against the current lists; unknown or retired values are dropped. */
export function readCalculatorChoices(lists: CalculatorLists, params: SearchParams): CalculatorChoices {
  const pick = (list: { id: string }[], value: string | string[] | undefined) =>
    typeof value === "string" && list.some((option) => option.id === value) ? value : null;

  const treeId = pick(lists.treeCounts, params.trees);
  const custom = typeof params.trees_custom === "string" && /^\d{1,9}$/.test(params.trees_custom) ? Number(params.trees_custom) : null;
  const downPercentId = pick(lists.downPercents, params.down_pct);
  const durationId = pick(lists.durations, params.duration);

  return {
    treeId,
    // A listed tier wins when both arrive.
    treesCustom: !treeId && custom !== null && custom >= lists.customMin && custom <= lists.customMax ? custom : null,
    scenarioId: pick(lists.scenarios, params.scenario),
    spacingId: pick(lists.spacingClasses, params.spacing),
    // A down payment or duration without a payment mode only makes sense in installments.
    paymentMode: parsePaymentMode(params.payment) ?? (downPercentId || durationId ? "installments" : null),
    downPercentId,
    durationId,
  };
}

/** The database quote for these choices, as /start shows it; null without a spacing class. */
export async function quoteChoices(lists: CalculatorLists, choices: CalculatorChoices): Promise<TreeQuote | null> {
  if (!choices.spacingId) return null;
  const installments = choices.paymentMode === "installments";
  const tier = choices.treeId ? lists.treeCounts.find((option) => option.id === choices.treeId) : undefined;
  return publicTreeQuote({
    spacingClassId: choices.spacingId,
    trees: tier ? tier.min_number : choices.treesCustom,
    paymentMode: choices.paymentMode,
    downPercentOptionId: installments ? choices.downPercentId : null,
    durationOptionId: installments ? choices.durationId : null,
  });
}

export function summaryInput(
  lists: CalculatorLists,
  choices: CalculatorChoices,
  quote: TreeQuote | null,
  copy: SummaryCopy,
): SummaryInput {
  const find = <T extends { id: string }>(list: T[], id: string | null) => (id ? (list.find((item) => item.id === id) ?? null) : null);
  return {
    copy,
    tree: find(lists.treeCounts, choices.treeId),
    treesCustom: choices.treesCustom,
    scenario: find(lists.scenarios, choices.scenarioId),
    withSpacing: lists.spacingClasses.length > 0,
    areaPerTreeM2: find(lists.spacingClasses, choices.spacingId)?.area_m2 ?? null,
    paymentMode: choices.paymentMode,
    downPercent: find(lists.downPercents, choices.downPercentId),
    duration: find(lists.durations, choices.durationId),
    quote,
  };
}
