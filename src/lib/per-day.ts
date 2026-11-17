// «التقسيط بلغة النهار» (0168, owner's idea 6: «174 د في الشهر تولّي أقل من 6 د في النهار، قدّ قهوتين»). The
// monthly instalment the quote computed, said per day. Pure, so /start, /register and an offer's form say it the
// same way; the server reads the rule and the sentences from settings (src/lib/per-day-copy.ts).
//
// It restates an amount and computes no price: the month is divided by start.per_day_days and the result rounded
// UP to start.per_day_step, so «أقل من» is always true, and an amount that falls exactly is said as exact.

import { formatMessage } from "@/lib/i18n/message";
import type { Locale } from "@/lib/i18n/locales";

/** The owner's numbers: days in a month, the rounding step and the coffee, in millimes. */
export type PerDayRule = { days: number; stepMillimes: number; compareMillimes: number; compareMax: number };

/** ICU sentences: `exact` and `less` carry {amount}, `compare` carries {count}. An empty one hides its part. */
export type PerDayTexts = { exact: string; less: string; compare: string };

export function perDayText(
  monthlyMillimes: number | null | undefined,
  rule: PerDayRule,
  texts: PerDayTexts,
  locale: Locale,
  formatMoney: (millimes: number) => string,
): string | null {
  if (!monthlyMillimes || monthlyMillimes <= 0 || !(rule.days > 0)) return null;
  const step = rule.stepMillimes > 0 ? rule.stepMillimes : 1;
  const rounded = Math.ceil(monthlyMillimes / (rule.days * step)) * step;
  const exact = rounded * rule.days === monthlyMillimes;
  const sentence = exact ? texts.exact : texts.less;
  if (!sentence) return null;

  const parts = [formatMessage(locale, sentence, { amount: formatMoney(rounded) })];
  if (texts.compare && rule.compareMillimes > 0 && rule.compareMax > 0) {
    // 0 means under the price of one («أرخص من قهوة»): the rounded-up amount is, so the real one is too.
    const count = rounded < rule.compareMillimes ? 0 : Math.round(rounded / rule.compareMillimes);
    // A sentence without its «=0» case would print «قدّ 0 قهوة»; then under one coffee says nothing.
    const sayable = count > 0 || texts.compare.includes("=0");
    if (sayable && count <= rule.compareMax) parts.push(formatMessage(locale, texts.compare, { count }));
  }
  return parts.join(" · ");
}
