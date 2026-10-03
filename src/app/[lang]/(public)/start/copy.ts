import "server-only";

import { formatUnits, settingJson, settingText, t, type PublicConfig } from "@/lib/config";

import type { Line } from "./calculator-summary";
import type { StartCopy, Taglines } from "./start-chooser";

/**
 * Every text of the calculator, from `settings` in the page's language (MIL-02, PRN-02); /register reuses the
 * summary labels. Templates keep their blanks ({amount}, {count}…): the summary fills them as figures arrive.
 *
 * `french` is the French site's configuration, handed in by the bilingual Arabic /start only (owner 2026-09-12;
 * whether a twin is printed is decided in src/components/site/bilingual.tsx). It switches the `…Fr` twins on —
 * the owner's `…_fr` settings, which fall back to "" so a twin nobody has written simply does not render — and
 * gives the twin line its French units and its French tree count. Without it every twin is "".
 */
export function startCopy(config: PublicConfig, french?: PublicConfig | null): StartCopy {
  const twin = (key: string) => (french ? settingText(config, key) : "");
  const treesCount = t(config, "ui.start.trees_count");
  // The twin's tree count is the French translation of the same text; while there is none, the French site
  // answers the Arabic one, and an Arabic line printed twice is no twin.
  const treesCountFr = french ? settingText(french, "ui.start.trees_count") : "";
  return {
    locale: config.locale,
    units: formatUnits(config),
    twinUnits: french ? formatUnits(french) : null,
    // What the screen is, in its own words (owner: «هذا مثال تقديري … موش عرض عقاري نهائي»). It sits beside
    // the step counter, where the visitor reads it before answering the first question.
    eyebrow: t(config, "start.eyebrow"),
    // Where a simulation leads once it is done: the real offers, under the projects module gate.
    // Both keys are the ones the home page and /register already use for this same link (no new copy).
    /** The phone bar's own title and the label of its way back. */
    screenTitle: t(config, "start.estimate_cta"),
    homeLabel: t(config, "start.home_label"),
    title: t(config, "site.trees_question"),
    titleFr: twin("site.trees_question_fr"),
    subtitle: t(config, "site.trees_subtitle"),
    subtitleFr: twin("site.trees_subtitle_fr"),
    styleQuestion: t(config, "site.style_question"),
    styleQuestionFr: twin("site.style_question_fr"),
    summaryTitle: t(config, "start.summary_title"),
    summaryTitleFr: twin("start.summary_title_fr"),
    rowTrees: t(config, "start.row_trees"),
    rowTreesFr: twin("start.row_trees_fr"),
    treesCount,
    treesCountFr: treesCountFr !== treesCount ? treesCountFr : "",
    rowType: t(config, "start.row_type"),
    rowTypeFr: twin("start.row_type_fr"),
    rowDown: t(config, "start.row_down"),
    rowDownFr: twin("start.row_down_fr"),
    rowDuration: t(config, "start.row_duration"),
    rowDurationFr: twin("start.row_duration_fr"),
    continue: t(config, "start.continue"),
    continueFr: twin("start.continue_fr"),
    continueHint: t(config, "start.continue_hint"),
    continueHintFr: twin("start.continue_hint_fr"),
    continueHintPayment: t(config, "start.continue_hint_payment"),
    continueHintPaymentFr: twin("start.continue_hint_payment_fr"),
    continueHintInstallments: t(config, "start.continue_hint_installments"),
    continueHintInstallmentsFr: twin("start.continue_hint_installments_fr"),
    secureNote: t(config, "start.secure_note"),
    secureNoteFr: twin("start.secure_note_fr"),
    customLabel: t(config, "start.custom_label"),
    customLabelFr: twin("start.custom_label_fr"),
    customPlaceholder: t(config, "start.custom_placeholder"),
    customPlaceholderFr: twin("start.custom_placeholder_fr"),
    customHint: t(config, "start.custom_hint"),
    customHintFr: twin("start.custom_hint_fr"),
    spacingTitle: t(config, "start.spacing_title"),
    spacingTitleFr: twin("start.spacing_title_fr"),
    spacingHint: t(config, "start.spacing_hint"),
    spacingHintFr: twin("start.spacing_hint_fr"),
    spacingAny: t(config, "start.spacing_any"),
    spacingAnyFr: twin("start.spacing_any_fr"),
    paymentTitle: t(config, "start.payment_title"),
    paymentTitleFr: twin("start.payment_title_fr"),
    // The line under the payment question shows only while the Back Office has written it.
    paymentHint: t(config, "start.payment_hint"),
    paymentHintFr: twin("start.payment_hint_fr"),
    paymentCash: t(config, "start.payment_cash"),
    paymentCashFr: twin("start.payment_cash_fr"),
    paymentInstallments: t(config, "start.payment_installments"),
    paymentInstallmentsFr: twin("start.payment_installments_fr"),
    downPercentTitle: t(config, "start.down_percent_title"),
    downPercentTitleFr: twin("start.down_percent_title_fr"),
    downPercentHint: t(config, "start.down_percent_hint"),
    downPercentHintFr: twin("start.down_percent_hint_fr"),
    rowAreaPerTree: t(config, "start.row_area_per_tree"),
    rowAreaPerTreeFr: twin("start.row_area_per_tree_fr"),
    rowTotalArea: t(config, "start.row_total_area"),
    rowTotalAreaFr: twin("start.row_total_area_fr"),
    rowPricePerTree: t(config, "start.row_price_per_tree"),
    rowPricePerTreeFr: twin("start.row_price_per_tree_fr"),
    rowTotalPrice: t(config, "start.row_total_price"),
    rowTotalPriceFr: twin("start.row_total_price_fr"),
    rowAnnualFee: t(config, "start.row_annual_fee"),
    rowAnnualFeeFr: twin("start.row_annual_fee_fr"),
    annualFeePerTree: t(config, "start.annual_fee_per_tree"),
    annualFeePerTreeFr: twin("start.annual_fee_per_tree_fr"),
    rowPayment: t(config, "start.row_payment"),
    rowPaymentFr: twin("start.row_payment_fr"),
    rowTotalFinanced: t(config, "start.row_total_financed"),
    rowTotalFinancedFr: twin("start.row_total_financed_fr"),
    rowRemaining: t(config, "start.row_remaining"),
    rowRemainingFr: twin("start.row_remaining_fr"),
    rowMonthly: t(config, "start.row_monthly"),
    rowMonthlyFr: twin("start.row_monthly_fr"),
    lastInstallment: t(config, "start.last_installment"),
    lastInstallmentFr: twin("start.last_installment_fr"),
    installmentsCount: t(config, "start.installments_count"),
    installmentsCountFr: twin("start.installments_count_fr"),
    fromPrefix: t(config, "start.from_prefix"),
    fromPrefixFr: twin("start.from_prefix_fr"),
    // The stamp the estimate card carries at all times (owner: «موش عرض عقاري نهائي»). The wording itself is
    // `start.estimate_note` in the Back Office.
    estimateNote: t(config, "start.estimate_note"),
    estimateNoteFr: twin("start.estimate_note_fr"),
    priceUnavailable: t(config, "start.price_unavailable"),
    priceUnavailableFr: twin("start.price_unavailable_fr"),
    durationNotPriced: t(config, "start.duration_not_priced"),
    durationNotPricedFr: twin("start.duration_not_priced_fr"),
    downCoversTotal: t(config, "start.down_covers_total"),
    downCoversTotalFr: twin("start.down_covers_total_fr"),
    // The chooser's own furniture: one language, no twin (as before).
    back: t(config, "ui.start.back"),
    next: t(config, "ui.start.next"),
    stepOf: t(config, "ui.start.step_of"),
    progressLabel: t(config, "ui.start.progress_label"),
    edit: t(config, "ui.start.edit"),
    announceRow: t(config, "ui.start.announce_row"),
    announceJoiner: t(config, "ui.start.announce_joiner"),
    announceSummary: t(config, "ui.start.announce_summary"),
  };
}

/**
 * `start.tier_taglines`: one short line per tree_count code ("custom" for the free number), stored as {ar, fr}
 * pairs. The line of the page is the pair's field for the page's language when the owner wrote one (`fr` on the
 * French site), else `ar` — which a translation of the setting replaces with that language's words. The French
 * twin is `fr`, on the bilingual Arabic page only (`french` handed in, as for startCopy).
 */
export function startTaglines(config: PublicConfig, french?: PublicConfig | null): Taglines {
  const pairs = settingJson<Record<string, unknown>>(config, "start.tier_taglines", {});
  const result: Taglines = {};
  for (const [code, pair] of Object.entries(pairs)) {
    const line = pairLine(config, pair, Boolean(french));
    if (line) result[code] = line;
  }
  return result;
}

function pairLine(config: PublicConfig, pair: unknown, withTwin: boolean): Line | null {
  if (typeof pair === "string") return pair.trim() ? { ar: pair, fr: null } : null;
  if (!pair || typeof pair !== "object") return null;
  const fields = pair as Record<string, unknown>;
  const word = (code: string) => {
    const value = fields[code];
    return typeof value === "string" && value.trim() ? value : null;
  };
  const main = word(config.locale) ?? word("ar");
  return main ? { ar: main, fr: withTwin ? word("fr") : null } : null;
}
