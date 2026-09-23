import "server-only";

import { settingText, type PublicConfig } from "@/lib/config";

import type { StartCopy } from "./start-chooser";

/**
 * Every text of the calculator, from `settings` (MIL-02, PRN-02); /register reuses the summary labels.
 * French keys fall back to "" so the second line simply does not render until the settings exist.
 */
export function startCopy(config: PublicConfig): StartCopy {
  const text = (key: string, fallback = "") => settingText(config, key, fallback);
  return {
    // What the screen is, in its own words (owner: «هذا مثال تقديري … موش عرض عقاري نهائي»). It sits beside
    // the step counter, where the visitor reads it before answering the first question.
    eyebrow: text("start.eyebrow", "حاسبة تقديرية"),
    eyebrowFr: text("start.eyebrow_fr"),
    // Where a simulation leads once it is done: the real offers, under the projects module gate.
    // Both keys are the ones the home page and /register already use for this same link (no new copy).
    /** The phone bar's own title and the label of its way back. Existing keys: no new copy to write. */
    screenTitle: text("start.estimate_cta", "احسب مشروعك"),
    homeLabel: text("start.home_label", "الرئيسية"),
    title: text("site.trees_question", "قدّاش زيتونة تحب تبدا بيهم؟"),
    titleFr: text("site.trees_question_fr"),
    subtitle: text("site.trees_subtitle", "اختيارك يمشي معك للخطوة الموالية. تنجم تبدّلو وقت اللي تحب."),
    subtitleFr: text("site.trees_subtitle_fr"),
    styleQuestion: text("site.style_question", "كيفاش تحب مشروعك يكون؟"),
    styleQuestionFr: text("site.style_question_fr"),
    summaryTitle: text("start.summary_title", "مشروعك المبدئي"),
    summaryTitleFr: text("start.summary_title_fr"),
    rowTrees: text("start.row_trees", "عدد الزيتونات"),
    rowTreesFr: text("start.row_trees_fr"),
    rowType: text("start.row_type", "نوع المشروع"),
    rowTypeFr: text("start.row_type_fr"),
    rowDown: text("start.row_down", "التسبقة"),
    rowDownFr: text("start.row_down_fr"),
    rowDuration: text("start.row_duration", "مدة الدفع"),
    rowDurationFr: text("start.row_duration_fr"),
    continue: text("start.continue", "سجّل اهتمامك"),
    continueFr: text("start.continue_fr"),
    continueHint: text("start.continue_hint", "اختر عدد الزيتونات باش تكمّل."),
    continueHintFr: text("start.continue_hint_fr"),
    continueHintPayment: text("start.continue_hint_payment", "اختر طريقة الدفع باش تكمّل."),
    continueHintPaymentFr: text("start.continue_hint_payment_fr"),
    continueHintInstallments: text("start.continue_hint_installments", "اختر نسبة التسبقة ومدة الدفع باش تكمّل."),
    continueHintInstallmentsFr: text("start.continue_hint_installments_fr"),
    secureNote: text("start.secure_note", "التسجيل مجاني ولا يمثل التزاماً."),
    secureNoteFr: text("start.secure_note_fr"),
    customLabel: text("start.custom_label", "عدد آخر"),
    customLabelFr: text("start.custom_label_fr"),
    customPlaceholder: text("start.custom_placeholder", "مثال: 120"),
    customPlaceholderFr: text("start.custom_placeholder_fr"),
    customHint: text("start.custom_hint", "اكتب عدداً بين {min} و{max}."),
    customHintFr: text("start.custom_hint_fr"),
    treesUnit: text("start.trees_unit", "زيتونة"),
    treesUnitFr: text("start.trees_unit_fr"),
    spacingTitle: text("start.spacing_title", "المساحة لكل زيتونة"),
    spacingTitleFr: text("start.spacing_title_fr"),
    spacingHint: text("start.spacing_hint", "كل فئة تعني تباعداً بين الزيتونات ومساحة مرتبطة بكل زيتونة."),
    spacingHintFr: text("start.spacing_hint_fr"),
    spacingAny: text("start.spacing_any", "ما نعرفش، اقترحولي"),
    spacingAnyFr: text("start.spacing_any_fr"),
    paymentTitle: text("start.payment_title", "كيفاش تحب تخلّص؟"),
    paymentTitleFr: text("start.payment_title_fr"),
    // No fallback: the line under the payment question shows only once the Back Office has written it.
    paymentHint: text("start.payment_hint"),
    paymentHintFr: text("start.payment_hint_fr"),
    paymentCash: text("start.payment_cash", "بالحاضر"),
    paymentCashFr: text("start.payment_cash_fr"),
    paymentInstallments: text("start.payment_installments", "بالتقسيط"),
    paymentInstallmentsFr: text("start.payment_installments_fr"),
    downPercentTitle: text("start.down_percent_title", "نسبة التسبقة"),
    downPercentTitleFr: text("start.down_percent_title_fr"),
    downPercentHint: text("start.down_percent_hint", "التسبقة تتحسب من السعر الجملي بالحاضر."),
    downPercentHintFr: text("start.down_percent_hint_fr"),
    rowAreaPerTree: text("start.row_area_per_tree", "المساحة لكل زيتونة"),
    rowAreaPerTreeFr: text("start.row_area_per_tree_fr"),
    rowTotalArea: text("start.row_total_area", "المساحة الجملية"),
    rowTotalAreaFr: text("start.row_total_area_fr"),
    rowPricePerTree: text("start.row_price_per_tree", "سعر الزيتونة"),
    rowPricePerTreeFr: text("start.row_price_per_tree_fr"),
    rowTotalPrice: text("start.row_total_price", "السعر الجملي للطلب"),
    rowTotalPriceFr: text("start.row_total_price_fr"),
    rowAnnualFee: text("start.row_annual_fee", "معاليم الصيانة والتقليم في العام"),
    rowAnnualFeeFr: text("start.row_annual_fee_fr"),
    annualFeePerTree: text("start.annual_fee_per_tree", "{amount} للزيتونة في العام"),
    annualFeePerTreeFr: text("start.annual_fee_per_tree_fr"),
    rowPayment: text("start.row_payment", "طريقة الدفع"),
    rowPaymentFr: text("start.row_payment_fr"),
    rowTotalFinanced: text("start.row_total_financed", "السعر الجملي بالتقسيط"),
    rowTotalFinancedFr: text("start.row_total_financed_fr"),
    rowRemaining: text("start.row_remaining", "المبلغ المتبقي"),
    rowRemainingFr: text("start.row_remaining_fr"),
    rowMonthly: text("start.row_monthly", "القسط الشهري"),
    rowMonthlyFr: text("start.row_monthly_fr"),
    lastInstallment: text("start.last_installment", "آخر قسط: {amount}"),
    lastInstallmentFr: text("start.last_installment_fr"),
    installmentsCount: text("start.installments_count", "{count} قسطاً"),
    installmentsCountFr: text("start.installments_count_fr"),
    fromPrefix: text("start.from_prefix", "ابتداءً من"),
    fromPrefixFr: text("start.from_prefix_fr"),
    // The stamp the estimate card carries at all times (owner: «موش عرض عقاري نهائي»). The wording itself is
    // `start.estimate_note` in the Back Office; this default is only what ships before it is edited.
    estimateNote: text("start.estimate_note", "هذا تقدير أولي حسب الإعدادات الحالية. التفاصيل النهائية في بطاقة المشروع والعقد."),
    estimateNoteFr: text("start.estimate_note_fr"),
    priceUnavailable: text("start.price_unavailable", "السعر يتحدّد قريباً."),
    priceUnavailableFr: text("start.price_unavailable_fr"),
    durationNotPriced: text("start.duration_not_priced", "التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى."),
    durationNotPricedFr: text("start.duration_not_priced_fr"),
    downCoversTotal: text("start.down_covers_total", "التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر."),
    downCoversTotalFr: text("start.down_covers_total_fr"),
  };
}
