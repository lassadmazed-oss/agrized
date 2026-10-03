// Display helpers. Amounts are stored as integer millimes (1 TND = 1000 millimes, SIM-07). Dates are shown in
// Africa/Tunis whatever the visitor's clock says.
//
// TWO WAYS IN. The plain functions below are the Back Office's: Arabic, as they always were. The public site
// formats in the visitor's language through `siteFormat(locale, units)` — `formatFor(config)` on the server,
// `useFormat()` in a Client Component — which returns the same functions bound to a language and to the
// owner's units (ui.format.* settings: «د.ت» / «DT», «م²» / «m²»). Digits stay Western in every language.

import { INTL_DATE, INTL_NAMES, INTL_NUMBER, type Locale } from "@/lib/i18n/locales";

const TIME_ZONE = "Africa/Tunis";

/** The words that follow a figure, from the owner's settings in the visitor's language. */
export type FormatUnits = { currency: string; m2: string; m: string };

/** The Back Office's units. The public site reads its own from settings (formatFor). */
const ARABIC_UNITS: FormatUnits = { currency: "د.ت", m2: "م²", m: "م" };

export type SiteFormat = ReturnType<typeof siteFormat>;

export function siteFormat(locale: Locale, units: FormatUnits) {
  const numberTag = INTL_NUMBER[locale];
  const dateTag = INTL_DATE[locale];
  return {
    locale,
    formatMillimes(millimes: number, { withMillimes = false } = {}): string {
      const digits = withMillimes ? 3 : 0;
      const amount = new Intl.NumberFormat(numberTag, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(millimes / 1000);
      return `${amount} ${units.currency}`;
    },
    formatDate(value: string | Date): string {
      return new Intl.DateTimeFormat(dateTag, {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value));
    },
    formatDateTime(value: string | Date): string {
      return new Intl.DateTimeFormat(dateTag, {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value));
    },
    formatCount(value: number): string {
      return new Intl.NumberFormat(numberTag).format(value);
    },
    /** Square metres with at most two decimals, e.g. "35 م²" or "6.5 m²". */
    formatArea(m2: number, unit = units.m2): string {
      return `${new Intl.NumberFormat(numberTag, { maximumFractionDigits: 2 }).format(m2)} ${unit}`;
    },
    /** Planting spacing as it is written in the field, e.g. "7 × 5 م". */
    formatSpacing(rowMetres: number, treeMetres: number, unit = units.m): string {
      const n = new Intl.NumberFormat(numberTag, { maximumFractionDigits: 2 });
      return `${n.format(rowMetres)} × ${n.format(treeMetres)} ${unit}`;
    },
    /**
     * A month and its year, for a date whose day says nothing — «سبتمبر 2024» under a client's name. Month
     * names in the language, digits Western (`-u-nu-latn` for Arabic), so a figure reads the same here as in
     * every other number on the site.
     */
    formatMonthYear(value: string | Date): string {
      return new Intl.DateTimeFormat(INTL_NAMES[locale], {
        timeZone: TIME_ZONE,
        month: "long",
        year: "numeric",
      }).format(new Date(value));
    },
  };
}

const arabic = siteFormat("ar", ARABIC_UNITS);

export const formatMillimes = arabic.formatMillimes;
export const formatDate = arabic.formatDate;
export const formatDateTime = arabic.formatDateTime;
export const formatCount = arabic.formatCount;
export const formatArea = arabic.formatArea;
export const formatSpacing = arabic.formatSpacing;
export const formatMonthYear = arabic.formatMonthYear;
