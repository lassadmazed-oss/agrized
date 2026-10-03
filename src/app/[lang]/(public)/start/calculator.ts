import "server-only";

import { optionsFor, settingInt, spacingClassLabel, type OptionItem, type OwnershipScenario, type PublicConfig } from "@/lib/config";
import { getSpacingClasses, parsePaymentMode, publicTreeQuote, type SpacingClass, type TreeQuote } from "@/lib/tree-pricing";

import type { CalculatorChoices, SummaryCopy, SummaryInput } from "./calculator-summary";

type SearchParams = Record<string, string | string[] | undefined>;

/** A spacing class with its name in the page's language (`label`); `label_fr` stays the owner's French twin. */
export type CalculatorSpacingClass = SpacingClass & { label: string };

/** Everything the calculator offers, from the Back Office lists (LEAD-01). */
export type CalculatorLists = {
  treeCounts: OptionItem[];
  scenarios: OwnershipScenario[];
  spacingClasses: CalculatorSpacingClass[];
  downPercents: OptionItem[];
  durations: OptionItem[];
  customMin: number;
  customMax: number;
};


/**
 * The lists, in the page's language — and, when `french` is given (the Arabic site's bilingual page, where every
 * choice carries its French twin), with each `label_fr` / `description_fr` / `image_alt_fr` replaced by the
 * French SITE's word for it: the owner's French translation where there is one, the old French column where
 * there is not. The column alone printed «1 oliviers» under «1 زيتونة» while the translation room held «1 olivier».
 */
export async function getCalculatorLists(config: PublicConfig, french: PublicConfig | null = null): Promise<CalculatorLists> {
  const twinOptions = (list: OptionItem[]) =>
    french
      ? list.map((option) => ({ ...option, label_fr: french.options.find((row) => row.id === option.id)?.label ?? option.label_fr }))
      : list;
  return {
    treeCounts: twinOptions(optionsFor(config, "tree_count")),
    scenarios: french
      ? config.scenarios.map((scenario) => {
          const twin = french.scenarios.find((row) => row.id === scenario.id);
          return twin
            ? { ...scenario, label_fr: twin.label, description_fr: twin.description, image_alt_fr: twin.image_alt }
            : scenario;
        })
      : config.scenarios,
    spacingClasses: (await getSpacingClasses()).map((option) => ({
      ...option,
      label: spacingClassLabel(config, option),
      label_fr: french ? spacingClassLabel(french, option) : option.label_fr,
    })),
    // Q-1: a percentage of the cash total; the amount list 'down_payment' is retired.
    downPercents: twinOptions(optionsFor(config, "down_payment_percent")),
    // Report v3 §6, §12: the visitor picks a duration; the monthly amount is computed, never chosen.
    durations: twinOptions(optionsFor(config, "duration")),
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
