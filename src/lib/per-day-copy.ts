import "server-only";

import { settingInt, settingText, type PublicConfig } from "@/lib/config";
import type { PerDayRule, PerDayTexts } from "@/lib/per-day";

// The settings of «التقسيط بلغة النهار» (0168), read on the server for the pages that print a monthly instalment.

export function perDayRule(config: PublicConfig): PerDayRule {
  return {
    days: settingInt(config, "start.per_day_days", 0),
    stepMillimes: settingInt(config, "start.per_day_step", 1000),
    compareMillimes: settingInt(config, "start.per_day_compare_price", 0),
    compareMax: settingInt(config, "start.per_day_compare_max", 0),
  };
}

/** The page's sentences; with `twin`, the owner's French lines under the Arabic on the bilingual /start. */
export function perDayTexts(config: PublicConfig, twin = false): PerDayTexts {
  // settingText, not t(): a sentence that is missing hides its line instead of printing its key.
  const suffix = twin ? "_fr" : "";
  return {
    exact: settingText(config, `start.per_day_exact${suffix}`),
    less: settingText(config, `start.per_day_less${suffix}`),
    compare: settingText(config, `start.per_day_compare${suffix}`),
  };
}
