/**
 * The languages of the site, as the router knows them (0109, owner 2026-10-03).
 *
 * WHY THE LIST IS IN CODE when the rule is that lists live in the database: a language is a route segment, a
 * text direction and a number format before it is a row. The proxy has to recognise `/de/` on every request
 * before any query could run, and `<html dir>` has to be right in the first byte. So the SET is fixed here and
 * in the `locales_code_check` constraint of 0109 together — adding a sixth language is a code change — while
 * everything the owner decides about them lives in public.locales: which are switched on, what each is called,
 * their order in the selector, and which language fills in when a text is missing.
 *
 * Client-safe: no server imports.
 */

export const LOCALES = ["ar", "fr", "de", "it", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Arabic is the source language and the one at the root of the site: `/projects` is Arabic, `/fr/projects`
 * French. Every link printed in an SMS since 2026-09 is unprefixed and keeps meaning what it meant.
 */
export const DEFAULT_LOCALE: Locale = "ar";

export const LOCALE_DIR: Record<Locale, "rtl" | "ltr"> = { ar: "rtl", fr: "ltr", de: "ltr", it: "ltr", en: "ltr" };

/**
 * The Intl tag each language formats numbers and dates with. Arabic keeps `en-US` digits and grouping —
 * «12,500» — because that is what every figure on the Arabic site has printed since launch, and a figure
 * should not change its look because the code under it did. `-u-nu-latn` keeps month names Arabic and
 * digits Western where a date is spelled out.
 */
export const INTL_NUMBER: Record<Locale, string> = { ar: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", en: "en-GB" };
export const INTL_DATE: Record<Locale, string> = { ar: "en-GB", fr: "fr-FR", de: "de-DE", it: "it-IT", en: "en-GB" };
export const INTL_NAMES: Record<Locale, string> = {
  ar: "ar-TN-u-nu-latn",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  en: "en-GB",
};

/** Open Graph locale per language, for link previews. */
export const OG_LOCALE: Record<Locale, string> = { ar: "ar_TN", fr: "fr_FR", de: "de_DE", it: "it_IT", en: "en_GB" };

/** The visitor's chosen language, remembered for a year. Read by the proxy, written by it and the selector. */
export const LOCALE_COOKIE = "agrized.locale";

/**
 * Set by the proxy on every public request from the URL (overwriting anything a visitor sent) and forwarded to
 * Supabase by the Server Actions, so the database can record the client's language (persons.preferred_locale).
 */
export const LOCALE_HEADER = "x-agrized-locale";

/**
 * Sent to Supabase ONLY by display reads (the client file, request tracking, the sign-in SMS): it is what makes
 * app.setting_text answer in another language. Intake calls never send it — they snapshot labels for the staff.
 */
export const DISPLAY_LOCALE_HEADER = "x-agrized-display-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Paths that never carry a language: the Back Office, the API, Next's own files. */
function isUnlocalisedPath(path: string): boolean {
  return /^\/(admin|api|_next)(\/|$)/.test(path);
}

/**
 * The address of `path` in `locale`: «/projects» → «/fr/projects» (Arabic stays unprefixed). Anything that is
 * not a site path — an absolute URL, `tel:`, `#anchor`, a query alone, the Back Office — is returned as is.
 * A path that already carries a language is re-pointed, not double-prefixed.
 */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || isUnlocalisedPath(path)) return path;
  const { path: bare } = splitLocale(path);
  if (locale === DEFAULT_LOCALE) return bare;
  return bare === "/" ? `/${locale}` : `/${locale}${bare.startsWith("/?") || bare.startsWith("/#") ? bare.slice(1) : bare}`;
}

/**
 * «/fr/projects?x=1» → { locale: "fr", path: "/projects?x=1" }; «/projects» → { locale: null, path: "/projects" }.
 * `locale` is null when the path carries none, which on this site means Arabic.
 */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const match = /^\/([a-z]{2})(?=\/|\?|#|$)(.*)$/.exec(pathname);
  if (match && isLocale(match[1])) {
    const rest = match[2] || "/";
    return { locale: match[1], path: rest.startsWith("/") ? rest : `/${rest}` };
  }
  return { locale: null, path: pathname || "/" };
}
