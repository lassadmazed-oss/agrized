import { LOCALES, type Locale } from "./locales";

/**
 * What the Back Office's translation room shows and how it takes a structured text apart (0109).
 * Client-safe: no server imports.
 */

/** Every language but the source: the ones a translation row is written for. */
export const TARGET_LOCALES = LOCALES.filter((code): code is Exclude<Locale, "ar"> => code !== "ar");

/**
 * Settings that hold a code, an address or a number rather than words: never offered for translation. The
 * `_fr` twins are the bilingual /start page's French, which the translation of their Arabic key replaced.
 */
const NOT_WORDS = [
  /_fr$/,
  /\.contact_(phone|whatsapp|email|address_url)$/,
  /\.cta_primary_target$/,
  /^(request_no|land_offer_no|visit_no)\.prefix$/,
  /^crm\.auto_assign_mode$/,
  /^simulator\.durations_months$/,
  /^sms\.(sender_id|provider)$/,
  /\.(url|href|model)$/,
];

export function isTranslatableSetting(key: string, valueType: string, value: unknown): boolean {
  if (valueType !== "text" && valueType !== "json") return false;
  if (NOT_WORDS.some((pattern) => pattern.test(key))) return false;
  if (valueType === "json") return jsonLeaves(value).length > 0;
  return typeof value === "string" && /\p{L}/u.test(value);
}

/** Object keys whose string values are codes or addresses, not words, inside a json setting. */
const CODE_KEYS = new Set(["href", "url", "icon", "icon_code", "code", "image", "slot", "key", "tone", "kind"]);

export type JsonLeaf = { path: (string | number)[]; text: string };

/** Every string of a json value that a reader sees, with the path to it. */
export function jsonLeaves(value: unknown, path: (string | number)[] = []): JsonLeaf[] {
  if (typeof value === "string") {
    const last = path[path.length - 1];
    if (typeof last === "string" && CODE_KEYS.has(last)) return [];
    return /\p{L}/u.test(value) ? [{ path, text: value }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => jsonLeaves(item, [...path, index]));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => jsonLeaves(item, [...path, key]));
  }
  return [];
}

export function leafId(path: (string | number)[]): string {
  return path.join(".");
}

/** A deep copy of `base` with the string at `path` replaced. */
export function withLeaf(base: unknown, path: (string | number)[], text: string): unknown {
  if (path.length === 0) return text;
  const [head, ...rest] = path;
  if (Array.isArray(base)) {
    const copy = [...base];
    copy[head as number] = withLeaf(copy[head as number], rest, text);
    return copy;
  }
  const record = { ...(base as Record<string, unknown>) };
  record[head as string] = withLeaf(record[head as string], rest, text);
  return record;
}

/** The string at `path` of `value`, if there is one. */
export function leafAt(value: unknown, path: (string | number)[]): string | undefined {
  let cursor: unknown = value;
  for (const step of path) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string | number, unknown>)[step];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

/**
 * A map of codes to words ({ draft: "…", signed: "…" }): the database merges its translation word by word,
 * so a partial one is fine. Anything else (a list, nested objects) is replaced whole and must be complete.
 */
export function isFlatStringMap(value: unknown): value is Record<string, string> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((item) => typeof item === "string")
  );
}
