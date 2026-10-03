import { supabase } from "./api";

/**
 * The owner's words, his switches and his lists — read by the app from the same rows the website reads.
 *
 * This file is the app's `src/lib/config.ts`. The website loads EVERY public setting in one paged request and
 * then looks words up by key; it reads `feature_flags` to know which modules exist; and it never writes a
 * list, a label or a limit in code. An app that enumerated the keys it happens to need today would go quiet
 * the moment the owner wrote a sentence outside that list — which is what `src/site.ts` does with its 17
 * names, and why every label on the calculator and the account screen used to be Arabic typed into a
 * component.
 *
 * FOUR RULES CARRIED OVER FROM THE SITE, EACH FOR ITS OWN REASON.
 *
 *  1 · EVERYTHING, PAGED. `settings` passed a thousand rows in migration 0110 and PostgREST truncates a
 *      larger answer silently, so the read loops in pages of 1000 exactly as `readAll` does. It is one
 *      request today (919 public rows) and it stays correct the day it is two.
 *
 *  2 · A MISSING KEY PRINTS ITSELF. `t()` returns the key, never a hard-coded Arabic default. A gap is then
 *      visible on the screen and findable by its name; a fallback would be an invisible wrong sentence, and
 *      on a French screen it would be the wrong language as well. This is `t()`'s own stated rule.
 *
 *  3 · A FLAG THAT IS NOT THERE IS SHUT. `flagState` answers "disabled" for an absent key, and only "public"
 *      opens a module to a stranger. The app must never draw a door the website has closed (PRJ-03, FLAG-02).
 *
 *  4 · NO BUSINESS VALUE IN CODE. The tree tiers, the down-payment percentages, the durations, the spacing
 *      classes, the project types, the reasons someone wants olive trees, the governorates and the custom
 *      range all arrive from the database, in the Back Office's own order.
 *
 * Every table below is granted to `anon`: `settings` where `is_public` (policy settings_select, 0001),
 * `feature_flags` (feature_flags_select, 0001), `option_items` (option_items_read, 0002), `governorates`,
 * `tree_spacing_classes` and `ownership_scenarios`. So this is the anon key doing exactly what it is for, and
 * there is no server in between to go down.
 */

export type FlagState = "disabled" | "internal" | "public";

/** A Back Office list row, in the Arabic the owner wrote. */
export type OptionItem = {
  id: string;
  list_key: string;
  code: string;
  label: string;
  /** A tier's lower bound («25 زيتونة» → 25); a percentage's own number; a duration's months. */
  min_number: number | null;
  max_number: number | null;
  sort_order: number;
};

export type Governorate = { id: number; name: string };

/** One olive tree and the area that goes with it (docs/tree-area-and-cost.md). */
export type SpacingClass = {
  id: string;
  code: string;
  label: string;
  row_spacing_m: number;
  tree_spacing_m: number;
  area_m2: number;
  sort_order: number;
};

/** «زيتون منتج», «غراسة جديدة», «اقترحولي الأنسب» — the kind of project somebody is after. */
export type Scenario = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  icon_code: string | null;
  is_any: boolean;
  sort_order: number;
};

export type AppConfig = {
  settings: Record<string, unknown>;
  flags: Record<string, FlagState>;
  options: OptionItem[];
  governorates: Governorate[];
  spacingClasses: SpacingClass[];
  scenarios: Scenario[];
};

export const EMPTY_CONFIG: AppConfig = {
  settings: {},
  flags: {},
  options: [],
  governorates: [],
  spacingClasses: [],
  scenarios: [],
};

/* ------------------------------------------------------------------ reading */

const PAGE = 1000;

/**
 * Every public setting, in pages of 1000.
 *
 * The website's `readAll` exists because PostgREST answers at most 1000 rows and says nothing about the ones
 * it dropped, so a single `select` would have silently stopped carrying the owner's words the day he wrote the
 * thousand-and-first. Same loop, same reason.
 */
async function readSettings(): Promise<Record<string, unknown>> {
  const settings: Record<string, unknown> = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("settings")
      .select("key, value")
      .eq("is_public", true)
      .order("key")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { key: string; value: unknown }[];
    for (const row of rows) settings[row.key] = row.value;
    if (rows.length < PAGE) return settings;
  }
}

/**
 * The whole configuration, in one round of parallel reads.
 *
 * A read that fails takes only its own part down: a governorate list that did not answer must not blank the
 * calculator's questions, the way one failed read currently blanks the entire home screen. The settings are
 * the exception and are allowed to reject — with no words at all there is no screen to draw, and the caller
 * shows the owner's own network sentence instead of a shell full of printed key names.
 */
export async function loadConfig(): Promise<AppConfig> {
  const [settings, flags, options, governorates, spacingClasses, scenarios] = await Promise.all([
    readSettings(),
    readFlags(),
    readOptions(),
    readGovernorates(),
    readSpacingClasses(),
    readScenarios(),
  ]);
  return { settings, flags, options, governorates, spacingClasses, scenarios };
}

async function readFlags(): Promise<Record<string, FlagState>> {
  const { data } = await supabase.from("feature_flags").select("key, state");
  const flags: Record<string, FlagState> = {};
  for (const row of (data ?? []) as { key: string; state: string }[]) {
    if (row.state === "disabled" || row.state === "internal" || row.state === "public") flags[row.key] = row.state;
  }
  return flags;
}

async function readOptions(): Promise<OptionItem[]> {
  const { data } = await supabase
    .from("option_items")
    .select("id, list_key, code, label_ar, min_number, max_number, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    list_key: String(row.list_key),
    code: String(row.code ?? ""),
    label: String(row.label_ar ?? ""),
    min_number: numberOrNull(row.min_number),
    max_number: numberOrNull(row.max_number),
    sort_order: Number(row.sort_order ?? 0),
  }));
}

/**
 * The 24 governorates — ACTIVE ones only, which is the filter `loadPublicConfig` applies and the app did not.
 * Without it the form offers a place `submit_interest_request` then refuses with `invalid_governorate`, so the
 * visitor is told off for a choice the app put in front of them.
 */
async function readGovernorates(): Promise<Governorate[]> {
  const { data } = await supabase
    .from("governorates")
    .select("id, name_ar")
    .eq("is_active", true)
    .order("sort_order");
  return ((data ?? []) as { id: number; name_ar: string }[]).map((row) => ({ id: row.id, name: row.name_ar }));
}

async function readSpacingClasses(): Promise<SpacingClass[]> {
  const { data } = await supabase
    .from("tree_spacing_classes")
    .select("id, code, label_ar, row_spacing_m, tree_spacing_m, area_m2, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    label: String(row.label_ar ?? ""),
    row_spacing_m: Number(row.row_spacing_m ?? 0),
    tree_spacing_m: Number(row.tree_spacing_m ?? 0),
    area_m2: Number(row.area_m2 ?? 0),
    sort_order: Number(row.sort_order ?? 0),
  }));
}

async function readScenarios(): Promise<Scenario[]> {
  const { data } = await supabase
    .from("ownership_scenarios")
    .select("id, code, label_ar, description_ar, icon_code, is_any, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    label: String(row.label_ar ?? ""),
    description: typeof row.description_ar === "string" && row.description_ar.trim() ? row.description_ar : null,
    icon_code: typeof row.icon_code === "string" ? row.icon_code : null,
    is_any: row.is_any === true,
    sort_order: Number(row.sort_order ?? 0),
  }));
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/* ------------------------------------------------------------------ lookups */

export function settingText(config: AppConfig, key: string, fallback = ""): string {
  const value = config.settings[key];
  return typeof value === "string" ? value : fallback;
}

/**
 * One of the owner's sentences, with its blanks filled.
 *
 * NO FALLBACK ARGUMENT, DELIBERATELY — `src/lib/config.ts`'s own rule. 0110 seeded every key the product uses
 * and `npm run i18n:check` proves the set; a key that is somehow absent prints its own name, which is visible
 * on the screen and greppable in the repo. A hard-coded Arabic default would hide the same fault behind a
 * sentence that is merely out of date, and the owner would hear it quoted back to him by a customer.
 */
export function t(config: AppConfig, key: string, vars?: MessageVars): string {
  const value = config.settings[key];
  if (typeof value !== "string") return key;
  return formatMessage(value, vars);
}

export function settingBool(config: AppConfig, key: string, fallback = false): boolean {
  const value = config.settings[key];
  return typeof value === "boolean" ? value : fallback;
}

export function settingInt(config: AppConfig, key: string, fallback: number): number {
  const value = config.settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function settingJson<T>(config: AppConfig, key: string, fallback: T): T {
  const value = config.settings[key];
  return value === undefined || value === null ? fallback : (value as T);
}

/** A Back Office list, in the order that screen puts it in. */
export function optionsFor(config: AppConfig, listKey: string): OptionItem[] {
  return config.options.filter((option) => option.list_key === listKey);
}

/**
 * A word the owner may NOT have written, for a code the database can hold: the setting when there is one, the
 * CODE itself otherwise — never the key.
 *
 * This is `wordFor` from src/components/site/offers.tsx:155, and it is the one documented exception to rule 2
 * above. `t()` prints a missing key, which is right for a sentence the product owns: there is a finite set of
 * them and 0110 seeded every one. A CODE is different — `plantation_system`, `production_status` and the
 * offer statuses are open sets the owner extends from the Back Office, and the day he adds a planting system
 * the card must say «goblet», not «ui.cards.plantation_goblet».
 */
export function wordFor(config: AppConfig, key: string, code: string): string {
  return typeof config.settings[key] === "string" ? t(config, key) : code;
}

/** A module's state. Absent means shut — never «probably fine». */
export function flagState(config: AppConfig, key: string): FlagState {
  return config.flags[key] ?? "disabled";
}

/** What a stranger may see. `internal` is staff previewing a module, and this app has no staff. */
export function moduleOpen(config: AppConfig, key: string): boolean {
  return flagState(config, key) === "public";
}

/** The words that follow a figure, the owner's (ui.format.*), with the site's own three defaults. */
export function units(config: AppConfig): { currency: string; m2: string; m: string } {
  return {
    currency: settingText(config, "ui.format.currency", "د.ت"),
    m2: settingText(config, "ui.format.m2", "م²"),
    m: settingText(config, "ui.format.m", "م"),
  };
}

/* ------------------------------------------------- the owner's blanks, filled */

export type MessageVars = Record<string, string | number | null | undefined>;

const NUMBERS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/**
 * Arabic's six plural branches, by the CLDR rule.
 *
 * `Intl.PluralRules` is what the website uses, and Hermes does not reliably carry it: Android's Expo build
 * ships a trimmed ICU and iOS answers from the platform's. So the rule is written out — it is six lines, it is
 * the same answer `new Intl.PluralRules("ar")` gives, and a plural that silently fell back to `other` would
 * print «3 زيتونة» where the owner wrote «3 زيتونات». Intl is still preferred when it is there, so the day
 * the app grows French and German this follows without a second table.
 */
function pluralBranch(n: number): string {
  try {
    if (typeof Intl.PluralRules === "function") return new Intl.PluralRules("ar").select(n);
  } catch {
    // Fall through to the written rule.
  }
  if (n === 0) return "zero";
  if (n === 1) return "one";
  if (n === 2) return "two";
  const hundred = n % 100;
  if (hundred >= 3 && hundred <= 10) return "few";
  if (hundred >= 11 && hundred <= 99) return "many";
  return "other";
}

/** Index of the brace closing the one opened at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** «one {a} other {b}» → { one: "a", other: "b" }. */
function branches(body: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i += 1;
    if (i >= body.length) break;
    const keyStart = i;
    while (i < body.length && !/[\s{]/.test(body[i])) i += 1;
    const key = body.slice(keyStart, i);
    while (i < body.length && /\s/.test(body[i])) i += 1;
    if (body[i] !== "{" || !key) return null;
    const end = closing(body, i);
    if (end < 0) return null;
    result[key] = body.slice(i + 1, end);
    i = end + 1;
  }
  return result;
}

function show(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? NUMBERS.format(value) : value;
}

function render(text: string, vars: MessageVars, hash: string | null): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "#" && hash !== null) {
      out += hash;
      i += 1;
      continue;
    }
    if (char !== "{") {
      out += char;
      i += 1;
      continue;
    }
    const end = closing(text, i);
    if (end < 0) return out + text.slice(i);
    const inner = text.slice(i + 1, end);
    const comma = inner.indexOf(",");
    if (comma < 0) {
      const name = inner.trim();
      out += name in vars ? show(vars[name]) : `{${inner}}`;
    } else {
      const name = inner.slice(0, comma).trim();
      const rest = inner.slice(comma + 1);
      const second = rest.indexOf(",");
      const kind = (second < 0 ? rest : rest.slice(0, second)).trim();
      const options = second < 0 ? null : branches(rest.slice(second + 1));
      const value = vars[name];
      if (!options || (kind !== "plural" && kind !== "select")) {
        out += text.slice(i, end + 1);
      } else if (kind === "plural") {
        const n = typeof value === "number" ? value : Number(value);
        const exact = options[`=${n}`];
        const branch = exact ?? options[Number.isFinite(n) ? pluralBranch(n) : "other"] ?? options.other ?? "";
        out += render(branch, vars, Number.isFinite(n) ? show(n) : "");
      } else {
        const branch = options[String(value ?? "")] ?? options.other ?? "";
        out += render(branch, vars, hash);
      }
    }
    i = end + 1;
  }
  return out;
}

/**
 * The same small subset of ICU MessageFormat `src/lib/i18n/message.ts` implements, so a sentence written once
 * in the Back Office reads the same in the browser and on the phone: `{name}`, `{count, plural, …}` with `#`,
 * and `{kind, select, …}`. A text it cannot parse comes back as written — a typo must show as a typo and not
 * take the screen down.
 */
export function formatMessage(text: string, vars?: MessageVars): string {
  if (!vars || !text.includes("{")) return text;
  return render(text, vars, null);
}

/**
 * A name set inside a sentence of the other direction, wrapped in Unicode's first-strong isolate
 * (U+2068 … U+2069) exactly as `account-screen.tsx` does it. Without it a truncated Arabic name inside a Latin
 * sentence loses its beginning and wears its ellipsis on the wrong side — React Native's bidi has the same
 * failure and takes the same cure.
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}
