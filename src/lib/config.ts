import "server-only";

import { unstable_cache } from "next/cache";

import { siteFormat, type FormatUnits, type SiteFormat } from "@/lib/format";
import { DEFAULT_LOCALE, LOCALE_DIR, type Locale } from "@/lib/i18n/locales";
import { formatMessage, type MessageVars } from "@/lib/i18n/message";
import { currentLocale } from "@/lib/i18n/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";

export type FlagState = Database["public"]["Enums"]["flag_state"];

/** Tag to expire after the Back Office changes settings, lists, feature flags, languages or translations. */
export const PUBLIC_CONFIG_TAG = "public-config";

/**
 * The home page is prerendered at build time, so a momentary Supabase hiccup would fail the whole
 * deploy. A couple of short retries turn that into a pause instead of a broken build.
 */
async function withRetry<T>(load: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw lastError;
}

/**
 * PostgREST answers at most 1000 rows per request on this project. Settings passed that the day the site's
 * texts moved into the database (0110), and translations are three times that in a long fallback chain — a
 * single select would silently drop whatever sorted last. So the long tables are read a page at a time.
 */
const PAGE = 1000;
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load public configuration: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

type TranslationRow = { entity: string; entity_key: string; field: string; locale: string; value: Json };

/** The translated entities the site's configuration resolves. */
const CONFIG_ENTITIES = [
  "setting",
  "option_item",
  "project_type",
  "ownership_scenario",
  "governorate",
  "delegation",
  "site_media",
  "tree_spacing_class",
];

/**
 * The languages a missing text is looked up in, nearest first, for `locale`: de → [de, en, fr]. Arabic is not
 * in it — it is the source, already in hand. Mirrors app.locale_chain (0109): a cycle or an unknown code ends
 * the walk.
 */
function chainFor(locale: Locale, fallbacks: Map<string, string | null>): string[] {
  const chain: string[] = [];
  let next: string | null | undefined = locale;
  while (next && next !== DEFAULT_LOCALE && !chain.includes(next) && fallbacks.has(next) && chain.length < 5) {
    chain.push(next);
    next = fallbacks.get(next);
  }
  return chain;
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const loadPublicConfig = unstable_cache(
  (locale: Locale) =>
    withRetry(async () => {
      const supabase = createPublicClient();
      const [settingRows, flags, governorates, delegations, projectTypes, scenarios, optionRows, media, locales] = await Promise.all([
        readAll<{ key: string; value: Json }>((from, to) =>
          supabase.from("settings").select("key, value").eq("is_public", true).order("key").range(from, to),
        ),
        supabase.from("feature_flags").select("key, state"),
        supabase.from("governorates").select("id, name_ar, name_fr").eq("is_active", true).order("sort_order"),
        supabase
          .from("delegations")
          .select("id, governorate_id, name_ar, name_fr")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("project_types")
          .select("id, code, label_ar, label_fr, description_ar, image_url, image_alt_ar")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("ownership_scenarios")
          .select(
            "id, code, label_ar, label_fr, description_ar, description_fr, project_type_id, plantation_system, production_status, is_any, icon_code, image_url, image_alt_ar, image_alt_fr",
          )
          .eq("is_active", true)
          .order("sort_order"),
        readAll((from, to) =>
          supabase
            .from("option_items")
            .select("id, list_key, code, label_ar, label_fr, min_millimes, max_millimes, min_number, max_number, time_from, time_to")
            .eq("is_active", true)
            .order("list_key")
            .order("sort_order")
            .range(from, to),
        ),
        supabase.from("site_media").select("slot, url, alt_ar, aspect, credit_text, credit_url"),
        supabase.from("locales").select("code, name_native, name_ar, is_enabled, fallback_code, sort_order").order("sort_order"),
      ]);

      for (const result of [flags, governorates, delegations, projectTypes, scenarios, media, locales]) {
        if (result.error) throw new Error(`Could not load public configuration: ${result.error.message}`);
      }

      // ---- the language chain, and every translation along it ----
      const fallbacks = new Map((locales.data ?? []).map((row) => [row.code, row.fallback_code ?? null]));
      const chain = chainFor(locale, fallbacks);
      const translations: TranslationRow[] =
        chain.length === 0
          ? []
          : await readAll<TranslationRow>((from, to) =>
              supabase
                .from("translations")
                .select("entity, entity_key, field, locale, value")
                // Only what this object carries. Offers and their pictures are translated by their own loader
                // (src/lib/public-projects.ts), and message templates are the database's business.
                .in("entity", CONFIG_ENTITIES)
                .in("locale", chain)
                .order("entity")
                .order("entity_key")
                .order("field")
                .order("locale")
                .range(from, to),
            );
      const byKey = new Map<string, Json>();
      const spacingRank = new Map<string, number>();
      for (const row of translations) byKey.set(`${row.entity}|${row.entity_key}|${row.field}|${row.locale}`, row.value);

      /**
       * The word for one field: the first language of the chain that has it — a translation row, else the
       * legacy French column for that step (label_fr, name_fr… are the owner's French and count as French) —
       * else the Arabic source.
       */
      const text = (entity: string, key: string, field: string, base: string, legacyFr?: string | null): string => {
        for (const code of chain) {
          const value = byKey.get(`${entity}|${key}|${field}|${code}`);
          if (typeof value === "string" && value.trim()) return value;
          if (code === "fr" && legacyFr && legacyFr.trim()) return legacyFr;
        }
        return base;
      };

      /** A setting's value in this language: strings and lists from the nearest language, maps word by word. */
      const settingValue = (key: string, base: Json): Json => {
        if (chain.length === 0) return base;
        if (isPlainObject(base)) {
          let merged: Record<string, Json> = { ...base };
          for (const code of [...chain].reverse()) {
            const value = byKey.get(`setting|${key}|value|${code}`);
            if (isPlainObject(value)) merged = { ...merged, ...value };
          }
          return merged;
        }
        for (const code of chain) {
          const value = byKey.get(`setting|${key}|value|${code}`);
          if (value !== undefined && value !== null) return value;
        }
        return base;
      };

      const enabled = (locales.data ?? []).filter((row) => row.is_enabled);

      // Planting classes (0113): their names, nearest language first. The classes themselves are read by
      // src/lib/tree-pricing.ts; only their words are resolved here, where the chain is.
      const spacingLabels: Record<string, string> = {};
      for (const row of translations) {
        if (row.entity !== "tree_spacing_class" || row.field !== "label" || typeof row.value !== "string") continue;
        const current = spacingLabels[row.entity_key];
        const rank = chain.indexOf(row.locale);
        if (current === undefined || rank < (spacingRank.get(row.entity_key) ?? Infinity)) {
          spacingLabels[row.entity_key] = row.value;
          spacingRank.set(row.entity_key, rank);
        }
      }

      return {
        locale,
        dir: LOCALE_DIR[locale],
        /** The languages a missing text is looked up in, nearest first (Arabic, the source, not included). */
        chain,
        /** The languages a visitor may choose, in the owner's order, each in its own name. */
        locales: enabled.map((row) => ({ code: row.code as Locale, name: row.name_native })),
        settings: Object.fromEntries(settingRows.map((row) => [row.key, settingValue(row.key, row.value)])),
        flags: Object.fromEntries((flags.data ?? []).map((row) => [row.key, row.state])) as Record<string, FlagState>,
        governorates: (governorates.data ?? []).map((row) => ({
          ...row,
          name: text("governorate", String(row.id), "name", row.name_ar, row.name_fr),
        })),
        delegations: (delegations.data ?? []).map((row) => ({
          ...row,
          name: text("delegation", String(row.id), "name", row.name_ar, row.name_fr),
        })),
        projectTypes: (projectTypes.data ?? []).map((row) => ({
          ...row,
          label: text("project_type", row.id, "label", row.label_ar, row.label_fr),
          description: row.description_ar ? text("project_type", row.id, "description", row.description_ar) : null,
          image_alt: row.image_alt_ar ? text("project_type", row.id, "image_alt", row.image_alt_ar) : null,
        })),
        scenarios: (scenarios.data ?? []).map((row) => ({
          ...row,
          label: text("ownership_scenario", row.id, "label", row.label_ar, row.label_fr),
          description: row.description_ar
            ? text("ownership_scenario", row.id, "description", row.description_ar, row.description_fr)
            : null,
          image_alt: row.image_alt_ar ? text("ownership_scenario", row.id, "image_alt", row.image_alt_ar, row.image_alt_fr) : null,
        })),
        options: optionRows.map((row) => ({
          ...row,
          label: text("option_item", row.id, "label", row.label_ar, row.label_fr),
        })),
        /** Planting-class names in this language, by class id; absent = the class's Arabic. */
        spacingLabels,
        media: Object.fromEntries(
          (media.data ?? []).map((row) => [
            row.slot,
            { ...row, alt: row.alt_ar ? text("site_media", row.slot, "alt", row.alt_ar) : null },
          ]),
        ),
      };
    }),
  ["public-config-v7"],
  { tags: [PUBLIC_CONFIG_TAG], revalidate: 300 },
);

export type PublicConfig = Awaited<ReturnType<typeof loadPublicConfig>>;
export type OptionItem = PublicConfig["options"][number];
export type Governorate = PublicConfig["governorates"][number];
export type Delegation = PublicConfig["delegations"][number];
export type ProjectType = PublicConfig["projectTypes"][number];
export type OwnershipScenario = PublicConfig["scenarios"][number];
export type MediaSlot = PublicConfig["media"][string];

/**
 * The site's configuration in the language of the current request (src/lib/i18n/server.ts): every text setting,
 * list label, place name and picture caption already resolved through the owner's fallback chain. Pass a
 * language to read another one (the Back Office reads Arabic by default, having no `[lang]`).
 */
export async function getPublicConfig(locale?: Locale): Promise<PublicConfig> {
  return loadPublicConfig(locale ?? (await currentLocale()));
}

export function settingText(config: PublicConfig, key: string, fallback = ""): string {
  const value = config.settings[key];
  return typeof value === "string" ? value : fallback;
}

/**
 * A text of the site, in the request's language, with its blanks filled ({name}, plurals — see
 * src/lib/i18n/message.ts). There is no fallback argument on purpose: the words live in the database
 * (0110 seeded every one of them), `npm run i18n:check` proves each key the code uses exists, and a key that
 * is somehow missing prints itself — visible, findable, never a silent Arabic sentence on a German page.
 */
export function t(config: PublicConfig, key: string, vars?: MessageVars): string {
  const value = config.settings[key];
  if (typeof value !== "string") return key;
  return formatMessage(config.locale, value, vars);
}

/**
 * The texts a Client Component needs, by prefix, for TextProvider: `pickTexts(config, ["ui.login."])`.
 * Only strings travel to the browser, and only the ones asked for.
 */
export function pickTexts(config: PublicConfig, prefixes: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.settings)) {
    if (typeof value === "string" && prefixes.some((prefix) => key.startsWith(prefix))) result[key] = value;
  }
  return result;
}

/** A planting class's name in the request's language (0113), else its Arabic. */
export function spacingClassLabel(config: PublicConfig, spacing: { id: string; label_ar: string }): string {
  return config.spacingLabels[spacing.id] ?? spacing.label_ar;
}

/** The units a figure is followed by, in the request's language (ui.format.*). */
export function formatUnits(config: PublicConfig): FormatUnits {
  return {
    currency: settingText(config, "ui.format.currency", "د.ت"),
    m2: settingText(config, "ui.format.m2", "م²"),
    m: settingText(config, "ui.format.m", "م"),
  };
}

/** Number, money, date and area formatting in the request's language. */
export function formatFor(config: PublicConfig): SiteFormat {
  return siteFormat(config.locale, formatUnits(config));
}

export function settingBool(config: PublicConfig, key: string, fallback = false): boolean {
  const value = config.settings[key];
  return typeof value === "boolean" ? value : fallback;
}

export function settingInt(config: PublicConfig, key: string, fallback: number): number {
  const value = config.settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function settingJson<T>(config: PublicConfig, key: string, fallback: T): T {
  const value = config.settings[key];
  return value === undefined || value === null ? fallback : (value as T);
}

export function optionsFor(config: PublicConfig, listKey: string): OptionItem[] {
  return config.options.filter((option) => option.list_key === listKey);
}

/** A picture slot (MED-01). Returns undefined when AgriZed has not uploaded one yet. */
export function mediaFor(config: PublicConfig, slot: string): MediaSlot | undefined {
  const row = config.media[slot];
  return row?.url ? row : undefined;
}

/** Photo credits the licences require us to print (CC BY). Own and CC0 pictures carry none. */
export function mediaCredits(config: PublicConfig): { text: string; url: string | null }[] {
  return Object.values(config.media)
    .filter((row) => row.url && row.credit_text)
    .map((row) => ({ text: row.credit_text as string, url: row.credit_url }));
}

export function flagState(config: PublicConfig, key: string): FlagState {
  return config.flags[key] ?? "disabled";
}
