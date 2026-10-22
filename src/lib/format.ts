// Display helpers. Amounts are stored as integer millimes (1 TND = 1000 millimes, SIM-07). Dates are shown in
// Africa/Tunis whatever the visitor's clock says.
//
// TWO WAYS IN. The plain functions below are the Back Office's: Arabic, as they always were. The public site
// formats in the visitor's language through `siteFormat(locale, units)` — `formatFor(config)` on the server,
// `useFormat()` in a Client Component — which returns the same functions bound to a language and to the
// owner's units (ui.format.* settings: «د.ت» / «DT», «م²» / «m²»). Digits stay Western in every language.

import { INTL_DATE, INTL_NAMES, INTL_NUMBER, type Locale } from "@/lib/i18n/locales";
import { moneyWordsAr } from "@/lib/money-words";

const TIME_ZONE = "Africa/Tunis";

/** The words that follow a figure, from the owner's settings in the visitor's language. */
export type FormatUnits = { currency: string; m2: string; m: string };

/** The Back Office's units. The public site reads its own from settings (formatFor). */
const ARABIC_UNITS: FormatUnits = { currency: "د.ت", m2: "م²", m: "م" };

export type SiteFormat = ReturnType<typeof siteFormat>;

export function siteFormat(locale: Locale, units: FormatUnits) {
  const numberTag = INTL_NUMBER[locale];
  const dateTag = INTL_DATE[locale];

  /**
   * THE ARABIC SITE GROUPS WITH A THIN SPACE, NOT A COMMA (owner, 2026-10-22).
   *
   * INTL_NUMBER.ar is "en-US", so every figure came out «4,450» — and a comma is exactly where his
   * complaint starts: «تعملها فيرجول، تقولش عليها المليون، يولي تقولش عليها الألف دينار». app.money_ar has
   * printed money with a space since the SMS work, so the site was also disagreeing with its own messages
   * about what a thousand looks like. U+202F is the narrow NO-BREAK space — the one French uses — so a
   * figure can never be split across two lines in the middle.
   *
   * Only the grouping changes. The decimal point stays «.», which is what the millimes fraction has always
   * used, and no other language is touched: a comma in «4,450» is unambiguous to a reader of English.
   *
   * EVERY FIGURE AND NOT ONLY MONEY. «1 439 د.ت» beside «24,000 م²» on one offer page reads as a bug in
   * one of them, and the reader cannot tell which — so counts, areas and spacings group the same way.
   */
  // Written as a code point, not pasted: U+202F is invisible in a source file and a maintainer would be
  // editing a character he cannot see.
  const NARROW_NO_BREAK_SPACE = String.fromCharCode(0x202f);
  const group = (value: string) => (locale === "ar" ? value.replace(/,/g, NARROW_NO_BREAK_SPACE) : value);

  return {
    locale,
    formatMillimes(millimes: number, { withMillimes = false } = {}): string {
      const digits = withMillimes ? 3 : 0;
      const amount = new Intl.NumberFormat(numberTag, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(millimes / 1000);
      return `${group(amount)} ${units.currency}`;
    },
    /**
     * The same amount written out, for the few prices a reader decides on: «أربعة آلاف وأربعمائة وخمسون
     * ديناراً». Empty outside Arabic — src/lib/money-words.ts says at length why the question only exists
     * there — and a screen prints nothing when it is empty rather than an empty line.
     */
    formatMillimesInWords(millimes: number): string {
      return locale === "ar" ? moneyWordsAr(millimes) : "";
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
      return group(new Intl.NumberFormat(numberTag).format(value));
    },
    /** Square metres with at most two decimals, e.g. "35 م²" or "6.5 m²". */
    formatArea(m2: number, unit = units.m2): string {
      return `${group(new Intl.NumberFormat(numberTag, { maximumFractionDigits: 2 }).format(m2))} ${unit}`;
    },
    /** Planting spacing as it is written in the field, e.g. "7 × 5 م". */
    formatSpacing(rowMetres: number, treeMetres: number, unit = units.m): string {
      const n = new Intl.NumberFormat(numberTag, { maximumFractionDigits: 2 });
      return `${group(n.format(rowMetres))} × ${group(n.format(treeMetres))} ${unit}`;
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
