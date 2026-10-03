/**
 * Money, areas, counts and dates, formatted the way the website formats them (src/lib/format.ts).
 *
 * This file is the mirror of src/lib/format.ts, function for function, and the names below are the site's
 * names on purpose: a reviewer can put the two files side by side and see that `formatMillimes` here and
 * `formatMillimes` there answer the same string for the same input. It is a mirror and not an import for the
 * same reason theme.ts copies the palette — nothing can cross that boundary — and the only thing that matters
 * is that the two agree, because the same olive tree must not carry two prices.
 *
 * MONEY IS INTEGER MILLIMES EVERYWHERE — in the database, in the RPC, and in this file until the last line.
 * A price that arrives as 167000 is 167 dinars; handing that number to a screen unconverted is how an app
 * tells somebody an olive tree costs a hundred and sixty-seven thousand dinars. The division happens in ONE
 * function, `formatMillimes` below, and nowhere else. No component divides by 1000, ever.
 *
 * WHAT IS NOT HERE. The owner's sentences — `t`, `formatMessage`, `wordFor`, `isolate` — live in ./config,
 * beside the settings they read. A key's word and a figure's shape are two different jobs and each has one
 * home; duplicating either is how the two drift.
 */

/* ------------------------------------------------------------------ languages */

/**
 * src/lib/i18n/locales.ts. The set is fixed in code on both sides (and in 0109's check constraint), because a
 * language is a text direction and a number format before it is a row.
 *
 * Arabic keeps `en-US` digits and grouping — «12,500» — because that is what every figure on the Arabic site
 * has printed since launch, and a figure should not change its look because the code under it did.
 */
export const LOCALES = ["ar", "fr", "de", "it", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

export const LOCALE_DIR: Record<Locale, "rtl" | "ltr"> = { ar: "rtl", fr: "ltr", de: "ltr", it: "ltr", en: "ltr" };
export const INTL_NUMBER: Record<Locale, string> = { ar: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", en: "en-GB" };
export const INTL_DATE: Record<Locale, string> = { ar: "en-GB", fr: "fr-FR", de: "de-DE", it: "it-IT", en: "en-GB" };
export const INTL_NAMES: Record<Locale, string> = {
  ar: "ar-TN-u-nu-latn",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  en: "en-GB",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------- Intl, cached */

/**
 * Intl objects are built once and kept.
 *
 * The site builds a `new Intl.NumberFormat` inside `formatMillimes`, which is free on a server rendering a
 * page once. A phone renders a FlatList of catalogue rows at sixty frames a second, and constructing an Intl
 * formatter is one of the more expensive things Hermes does. Same output, one allocation.
 */
const numberCache = new Map<string, Intl.NumberFormat>();
function numbers(tag: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = options ? `${tag}|${options.minimumFractionDigits ?? ""}|${options.maximumFractionDigits ?? ""}` : tag;
  let found = numberCache.get(key);
  if (!found) {
    found = new Intl.NumberFormat(tag, options);
    numberCache.set(key, found);
  }
  return found;
}

const dateCache = new Map<string, Intl.DateTimeFormat>();
function dates(tag: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${tag}|${JSON.stringify(options)}`;
  let found = dateCache.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(tag, options);
    dateCache.set(key, found);
  }
  return found;
}

const TIME_ZONE = "Africa/Tunis";

/**
 * Tunisia is UTC+1 the whole year and has had no daylight saving since 2008, so this is exact rather than an
 * approximation — which is what makes the fallback below safe to ship.
 */
const TUNIS_OFFSET_MINUTES = 60;

/**
 * DOES THIS DEVICE'S Intl KNOW «Africa/Tunis»?
 *
 * Dates are shown in Tunis whatever the visitor's clock says, and on the site that is one `timeZone` option.
 * Hermes takes its Intl from the platform — NSDateFormatter on iOS, a trimmed ICU on Android — and a build
 * that quietly ignored the zone would print a date a day out for a reader abroad, which is exactly the reader
 * 0121 was written for. So it is probed once, against an instant whose Tunis hour is known: 00:30 UTC is
 * 01:30 in Tunis.
 */
const zoneWorks: boolean = (() => {
  try {
    const probe = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hour12: false });
    const hour = probe.formatToParts(new Date(Date.UTC(2024, 5, 15, 0, 30))).find((part) => part.type === "hour");
    return hour?.value.replace(/\D/g, "") === "01";
  } catch {
    return false;
  }
})();

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar fields of an instant in Tunis, without asking Intl for the zone. */
function tunisFields(value: string | Date) {
  const shifted = new Date(new Date(value).getTime() + TUNIS_OFFSET_MINUTES * 60_000);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/* ----------------------------------------------------------------- the units */

/** The words that follow a figure, from the owner's settings (`ui.format.currency` / `m2` / `m`). */
export type FormatUnits = { currency: string; m2: string; m: string };

/** The site's own three defaults, verbatim from `formatUnits(config)`, for a screen with no configuration. */
export const ARABIC_UNITS: FormatUnits = { currency: "د.ت", m2: "م²", m: "م" };

function unitsOf(source: UnitSource): FormatUnits {
  if ("currency" in source) return source;
  const read = (key: string): unknown =>
    "settings" in source ? source.settings[key] : source.get(key);
  const word = (key: string, fallback: string) => {
    const value = read(key);
    return typeof value === "string" && value.trim() ? value : fallback;
  };
  return {
    currency: word("ui.format.currency", ARABIC_UNITS.currency),
    m2: word("ui.format.m2", ARABIC_UNITS.m2),
    m: word("ui.format.m", ARABIC_UNITS.m),
  };
}

/**
 * Anything carrying the owner's `ui.format.*` words: the `AppConfig` from ./config, a plain settings Map, or
 * the three words themselves.
 *
 * Typed on the SHAPE and not on `AppConfig` so this file keeps importing nothing — ./config builds the
 * Supabase client's neighbours, and a formatter that cannot be read or tested without a database is a
 * formatter nobody reads or tests.
 */
export type UnitSource =
  | FormatUnits
  | { settings: Record<string, unknown> }
  | { get(key: string): string | undefined };

/* ------------------------------------------------------------ the formatters */

/** A figure that is not a figure. Every function below answers «» for one — see the note on `siteFormat`. */
function missing(value: unknown): boolean {
  return value === null || value === undefined || !Number.isFinite(Number(value));
}

export type SiteFormat = ReturnType<typeof siteFormat>;

/**
 * src/lib/format.ts's `siteFormat(locale, units)`, bound to the owner's words and to the reader's language.
 *
 * ONE DELIBERATE DIVERGENCE, AND IT IS A SAFETY ONE: every function here answers «» for a null, an undefined
 * or a NaN, where the site's would print «0 د.ت». On the site the guard is always at the call site — the
 * catalogue row asks `offer.price ? … : pricePending` before it formats — and on a phone, where a nullable
 * column reaches a list row through a hook, a wrong price is worse than a blank. A missing figure must look
 * missing. Nothing else about the output differs.
 */
export function siteFormat(source: UnitSource, locale: Locale = DEFAULT_LOCALE) {
  const units = unitsOf(source);
  const numberTag = INTL_NUMBER[locale];
  const dateTag = INTL_DATE[locale];

  /**
   * THE ONE PLACE millimes become dinars.
   *
   * WHOLE DINARS BY DEFAULT, which is the one thing this file used to get wrong. It printed two decimals for
   * any amount that was not a round dinar, so 818,500 millimes — exactly the shape a last instalment takes —
   * read «819 د.ت» in the browser and «818.50 د.ت» on the phone: the one kind of difference a buyer notices
   * and asks about. `withMillimes` is the site's own option, for the one place that wants all three digits.
   */
  const formatMillimes = (millimes: number | null | undefined, options?: { withMillimes?: boolean }): string => {
    if (missing(millimes)) return "";
    const places = options?.withMillimes === true ? 3 : 0;
    const amount = numbers(numberTag, {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    }).format(Number(millimes) / 1000);
    return `${amount} ${units.currency}`;
  };

  /** «1,694» — grouped so four figures stay readable. NOT rounded: the site's `formatCount` is not. */
  const formatCount = (value: number | null | undefined): string => {
    if (missing(value)) return "";
    return numbers(numberTag).format(Number(value));
  };

  /**
   * Square metres with AT MOST TWO DECIMALS — «35 م²», «48.75 م²».
   *
   * Not rounded to a whole number, which this file used to do. `area_per_tree_min_m2` is a numeric, and the
   * land that comes with each tree is the figure a buyer compares offers on, so 48.75 m² must not become
   * «49 م²» on the phone while the website prints it in full.
   */
  const formatArea = (m2: number | null | undefined, unit = units.m2): string => {
    if (missing(m2)) return "";
    return `${numbers(numberTag, { maximumFractionDigits: 2 }).format(Number(m2))} ${unit}`;
  };

  /** Planting spacing as it is written in the field: «7 × 5 م». */
  const formatSpacing = (
    rowMetres: number | null | undefined,
    treeMetres: number | null | undefined,
    unit = units.m,
  ): string => {
    if (missing(rowMetres) || missing(treeMetres)) return "";
    const n = numbers(numberTag, { maximumFractionDigits: 2 });
    return `${n.format(Number(rowMetres))} × ${n.format(Number(treeMetres))} ${unit}`;
  };

  const formatDate = (value: string | Date | null | undefined): string => {
    if (value === null || value === undefined) return "";
    if (zoneWorks) {
      return dates(dateTag, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(
        new Date(value),
      );
    }
    const t = tunisFields(value);
    return `${pad(t.day)}/${pad(t.month)}/${t.year}`;
  };

  const formatDateTime = (value: string | Date | null | undefined): string => {
    if (value === null || value === undefined) return "";
    if (zoneWorks) {
      return dates(dateTag, {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value));
    }
    const t = tunisFields(value);
    return `${pad(t.day)}/${pad(t.month)}/${t.year} ${pad(t.hour)}:${pad(t.minute)}`;
  };

  /**
   * A month and its year, for a date whose day says nothing — «سبتمبر 2024» under a holder's name. Month
   * names in the language, digits Western.
   *
   * With no working time zone this falls to «09/2024» rather than carrying twelve Arabic month names in code:
   * a numeric month, in a case that should never happen, beats language data pretending to be design.
   */
  const formatMonthYear = (value: string | Date | null | undefined): string => {
    if (value === null || value === undefined) return "";
    if (zoneWorks) {
      return dates(INTL_NAMES[locale], { timeZone: TIME_ZONE, month: "long", year: "numeric" }).format(
        new Date(value),
      );
    }
    const t = tunisFields(value);
    return `${pad(t.month)}/${t.year}`;
  };

  return {
    locale,
    units,

    // The site's names, so the two files can be read side by side.
    formatMillimes,
    formatCount,
    formatArea,
    formatSpacing,
    formatDate,
    formatDateTime,
    formatMonthYear,

    // The app's shorthand for the same four. A screen reads better as `fmt.money(…)`, and these are the names
    // ./quote already calls; they are aliases, not second implementations.
    money: formatMillimes,
    count: formatCount,
    area: formatArea,
    spacing: formatSpacing,
    date: formatDate,
    dateTime: formatDateTime,
    monthYear: formatMonthYear,
  };
}

/* --------------------------------------------------------------- PRJ-03, once */

/** The three columns the site's `offerTreePrice()` asks about, and nothing more. */
export type Priced = {
  offered?: boolean | null;
  on_tree_pricing?: boolean | null;
  min_price_per_tree_millimes?: number | null;
};

/**
 * A per-tree price, or null — the mirror of `offerTreePrice()` in src/components/site/offers.tsx.
 *
 * PRJ-03 says a figure is shown only while the pricing module is open, and `public_projects()` already nulls
 * this column server-side when it is shut (0035), so nothing leaks today. What this adds is the other two legs
 * of the site's three-part guard, which the app was trusting the far end of the wire to apply: an offer that is
 * not offered, or that is not priced per tree, has no per-tree price to print whatever the column says.
 *
 * EVERY PRICE ON EVERY SCREEN COMES THROUGH HERE. No component reads `min_price_per_tree_millimes` itself, so
 * there is one place to look when somebody asks why a price is or is not on the screen. `treePrice()` in
 * src/api.ts is this function under its old name and delegates to it — there is ONE implementation of the
 * rule, because two of them is two rules the day somebody edits one.
 *
 * THE THREE LEGS ARE FALSY, NOT `=== false`, and that is the whole point of this comment. An earlier spelling
 * tested `offer.offered === false`, so a row that simply did not CARRY the column — a shape from another RPC,
 * a field left out of a select — fell through the guard and printed its price. `toOffer()` coerces both
 * columns with `=== true`, so nothing leaked; but `Priced` marks all three fields optional on purpose, so the
 * guard has to answer the absent case, and the absent case is «no». The site spells it the same way:
 * `if (!pricingOpen || !project.offered || !project.on_tree_pricing) return null`.
 *
 * `pricingOpen` is the site's third leg, read from the visitor's own copy of the flag. It defaults to true
 * because the database has already applied it (`case when … app.module_open('pricing') then …`, 0118:678) and
 * most callers hold no config; pass `moduleOpen(config, "pricing")` wherever one is in hand.
 */
export function treePriceMillimes(offer: Priced | null | undefined, pricingOpen = true): number | null {
  if (!offer || !pricingOpen) return null;
  if (!offer.offered) return null;
  if (!offer.on_tree_pricing) return null;
  const value = offer.min_price_per_tree_millimes;
  return value === null || value === undefined || !Number.isFinite(value) ? null : value;
}

/* ------------------------------------------------------------------------------ gone */

/*
 * THE SIX DEPRECATED EXPORTS THAT STOOD HERE ARE DELETED, and with them the last hard-coded Arabic in this
 * file: `count`, `money` and `area` (the three formatters bound to the owner's DEFAULT unit words rather than
 * to his current ones) and the `PRODUCTION` / `IRRIGATION` code→word maps. Nothing in app/ or src/ imported
 * any of the six — every caller now asks `siteFormat(config)` for a formatter bound to `ui.format.currency`,
 * `ui.format.m2` and `ui.format.m` as they are TODAY, and reads a code's word through
 * `wordFor(config, "ui.cards.production_", code)`, which falls back to the bare code and never to a key.
 *
 * The maps were the drift this run was sent to hunt, in miniature: the owner renames «ري بالتنقيط» in the
 * Back Office, the website says the new word and a map in the app says the old one forever. `ARABIC_UNITS`
 * above stays, because it is not a map of his words — it is the same three defaults `formatUnits()` falls back
 * to in src/lib/config.ts, for the one case where no configuration has loaded at all.
 */
