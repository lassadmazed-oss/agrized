import "server-only";

import { unstable_cache } from "next/cache";

import { getPublicConfig, PUBLIC_CONFIG_TAG } from "@/lib/config";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import type { ModuleAccess } from "@/lib/modules";
import { toTreeQuote, type PaymentMode, type TreeQuote } from "@/lib/tree-pricing";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

/** Expired by every Back Office action that changes a project or the module flag. */
export const PUBLIC_PROJECTS_TAG = "public-projects";

/**
 * anon    → the visitor's view, cached and shared by everyone.
 * preview → signed-in staff while the module is «internal»: read with their session, never cached,
 *           so a staff-only row can never land in the shared cache.
 */
export type PublicMode = "anon" | "preview";

export function publicMode(access: ModuleAccess): PublicMode {
  return access === "preview" ? "preview" : "anon";
}

/**
 * One offer of the catalogue. Its own words — `name`, `location_description`, `olive_variety` — arrive in the
 * visitor's language (public.translations, 0109), falling back along the owner's chain and then to the Arabic
 * the team typed.
 */
export type PublicProject = {
  id: string;
  code: string;
  name: string;
  project_type_id: string | null;
  governorate_id: number;
  delegation_id: number | null;
  location_description: string | null;
  total_area_m2: number | null;
  olive_variety: string | null;
  tree_count: number | null;
  tree_age_years: number | null;
  plantation_system: string | null;
  production_status: string | null;
  irrigation: string | null;
  status: string;
  offered: boolean;
  /** Plan P5-4: the project sells trees with their area (it lists spacing classes). */
  on_tree_pricing: boolean;
  parcels_total: number;
  parcels_offered: number;
  min_cash_price_millimes: number | null;
  /** Smallest price of one tree over the project's classes; null unless published and pricing is open. */
  min_price_per_tree_millimes: number | null;
  area_per_tree_min_m2: number | null;
  area_per_tree_max_m2: number | null;
  min_area_m2: number | null;
  max_area_m2: number | null;
  parcel_trees: number | null;
  cover_url: string | null;
  /**
   * The cover's alt text, in the visitor's language. The name is the column's, kept for the pages that read
   * it; public_project_covers() (0114) names which picture the cover is, which is where its translation is
   * filed.
   */
  cover_alt_ar: string | null;
};

/** One picture of an offer; `alt` and `caption` in the visitor's language (else the Arabic source). */
export type ProjectPicture = { id: string; url: string; alt: string; caption: string | null; is_cover: boolean };

/** Report v3 §20: what public_project_page() adds to a project's listing row. Texts in the visitor's language. */
export type ProjectPage = {
  description: string | null;
  water_available: boolean | null;
  water_note: string | null;
  access_note: string | null;
  video_url: string | null;
  /** Both null unless the team chose to show the location. */
  latitude: number | null;
  longitude: number | null;
  document_option_ids: string[];
  service_option_ids: string[];
  media: ProjectPicture[];
};

// The RPCs of migration 0020 are called by name; PostgREST returns numeric and bigint as JSON numbers
// or strings depending on size, so every figure goes through num().
type RpcResult = { data: unknown; error: { message: string } | null };
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

const num = (value: unknown): number => Number(value ?? 0);
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

async function callRpc(mode: PublicMode, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const client = (mode === "preview" ? await createClient() : createPublicClient()) as unknown as RpcClient;
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

const cachedAnonRpc = unstable_cache(
  async (fn: string, argsJson: string) => callRpc("anon", fn, JSON.parse(argsJson) as Record<string, unknown>),
  ["public-projects-v1"],
  { tags: [PUBLIC_PROJECTS_TAG], revalidate: 60 },
);

function load(mode: PublicMode, fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  return mode === "anon" ? cachedAnonRpc(fn, JSON.stringify(args)) : callRpc(mode, fn, args);
}

// ---------------------------------------------------------------------------------------------------------
// The offers' own words, in the visitor's language (0109)
//
// The RPCs answer in Arabic, the source: an offer's name, its description, its notes and its pictures' alt
// texts are what the team typed. Every other language lives in public.translations — entity 'project' keyed
// by the project's id, entity 'project_media' keyed by the picture's id — readable by anon for exactly the
// offers anon may see (app.translation_readable). The raw RPC answer stays cached once for every language;
// the translations are read beside it, per language, and laid over the fields the pages print.
// ---------------------------------------------------------------------------------------------------------

/** `entity|entity_key|field` → the text in the nearest language of the chain that has one. */
type Words = Record<string, string>;

/** PostgREST's page size on this project, as in src/lib/config.ts. */
const PAGE = 1000;

/**
 * The translations of `entities` (all the readable ones, or only `keys`) along `locale`'s chain, nearest
 * language first: the chain is the one the site's own texts fall back along (config.chain, mirroring
 * app.locale_chain), so an offer's words and the page's words never disagree about which language fills in.
 */
async function readWords(mode: PublicMode, locale: Locale, entities: readonly string[], keys: readonly string[] | null): Promise<Words> {
  const { chain } = await getPublicConfig(locale);
  if (chain.length === 0 || (keys && keys.length === 0)) return {};
  const rank = new Map(chain.map((code, index) => [code, index]));
  const supabase = mode === "preview" ? await createClient() : createPublicClient();
  const words: Words = {};
  const rankOf: Record<string, number> = {};
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("translations")
      .select("entity, entity_key, field, locale, value")
      .in("entity", [...entities])
      .in("locale", chain);
    if (keys) query = query.in("entity_key", [...keys]);
    const { data, error } = await query
      .order("entity")
      .order("entity_key")
      .order("field")
      .order("locale")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`translations: ${error.message}`);
    for (const row of data ?? []) {
      const position = rank.get(row.locale);
      if (position === undefined || typeof row.value !== "string" || !row.value.trim()) continue;
      const id = `${row.entity}|${row.entity_key}|${row.field}`;
      if (rankOf[id] === undefined || position < rankOf[id]) {
        rankOf[id] = position;
        words[id] = row.value;
      }
    }
    if (!data || data.length < PAGE) return words;
  }
}

/**
 * Keyed by the language (and the entities and ids asked for). Expired with the offers (PUBLIC_PROJECTS_TAG,
 * which every Back Office change to a project already sends) and with the site's texts (PUBLIC_CONFIG_TAG,
 * which a translation saved in the Back Office sends).
 */
const cachedAnonWords = unstable_cache(
  async (locale: Locale, entitiesJson: string, keysJson: string) =>
    readWords("anon", locale, JSON.parse(entitiesJson) as string[], JSON.parse(keysJson) as string[] | null),
  ["public-projects-words-v1"],
  { tags: [PUBLIC_PROJECTS_TAG, PUBLIC_CONFIG_TAG], revalidate: 60 },
);

async function wordsFor(mode: PublicMode, locale: Locale, entities: readonly string[], keys: readonly string[] | null): Promise<Words> {
  // Arabic is the source: there is nothing to lay over it.
  if (locale === DEFAULT_LOCALE) return {};
  try {
    return mode === "anon"
      ? await cachedAnonWords(locale, JSON.stringify(entities), JSON.stringify(keys))
      : await readWords(mode, locale, entities, keys);
  } catch (error) {
    // A translation that cannot be read leaves the offer in Arabic, its source — never a broken page.
    console.error(error);
    return {};
  }
}

/** The word for one field: the nearest translation, else the Arabic source (an empty source stays empty). */
function worded(words: Words, entity: string, key: string, field: string, base: string): string;
function worded(words: Words, entity: string, key: string, field: string, base: string | null): string | null;
function worded(words: Words, entity: string, key: string, field: string, base: string | null): string | null {
  if (base === null || !base.trim()) return base;
  return words[`${entity}|${key}|${field}`] ?? base;
}

/**
 * Every offer the visitor may see, its words in `locale` — the request's language when it is not given (the
 * proxy's header in a Route Handler, the `[lang]` segment in a page).
 */
export async function getPublicProjects(mode: PublicMode, locale?: Locale): Promise<PublicProject[]> {
  const language = locale ?? (await currentLocale());
  const rows = ((await load(mode, "public_projects")) ?? []) as Record<string, unknown>[];
  // public_projects() draws the cover by url; public_project_covers() (0114) says which picture that is, so its
  // description can be read in the visitor's language like every other picture's. Arabic needs neither.
  const covers =
    language === DEFAULT_LOCALE
      ? []
      : (((await load(mode, "public_project_covers").catch(() => [])) ?? []) as { project_id: string; media_id: string }[]);
  const coverOf = new Map(covers.map((cover) => [String(cover.project_id), String(cover.media_id)]));
  const words = await wordsFor(mode, language, coverOf.size > 0 ? ["project", "project_media"] : ["project"], null);
  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    name: worded(words, "project", String(row.id), "name", String(row.name)),
    project_type_id: (row.project_type_id as string | null) ?? null,
    governorate_id: num(row.governorate_id),
    delegation_id: numOrNull(row.delegation_id),
    location_description: worded(words, "project", String(row.id), "location_description", (row.location_description as string | null) ?? null),
    total_area_m2: numOrNull(row.total_area_m2),
    olive_variety: worded(words, "project", String(row.id), "olive_variety", (row.olive_variety as string | null) ?? null),
    tree_count: numOrNull(row.tree_count),
    tree_age_years: numOrNull(row.tree_age_years),
    plantation_system: (row.plantation_system as string | null) ?? null,
    production_status: (row.production_status as string | null) ?? null,
    irrigation: (row.irrigation as string | null) ?? null,
    status: String(row.status),
    offered: Boolean(row.offered),
    on_tree_pricing: row.on_tree_pricing === true,
    parcels_total: num(row.parcels_total),
    parcels_offered: num(row.parcels_offered),
    min_cash_price_millimes: numOrNull(row.min_cash_price_millimes),
    min_price_per_tree_millimes: numOrNull(row.min_price_per_tree_millimes),
    area_per_tree_min_m2: numOrNull(row.area_per_tree_min_m2),
    area_per_tree_max_m2: numOrNull(row.area_per_tree_max_m2),
    min_area_m2: numOrNull(row.min_area_m2),
    max_area_m2: numOrNull(row.max_area_m2),
    parcel_trees: numOrNull(row.parcel_trees),
    cover_url: (row.cover_url as string | null) ?? null,
    cover_alt_ar: worded(words, "project_media", coverOf.get(String(row.id)) ?? "", "alt", (row.cover_alt_ar as string | null) ?? null),
  }));
}

// getPublicParcels() (public_parcels), getCoverage() (public_coverage) and getParcelOffer()
// (public_parcel_offer), with the PublicParcel and CoverageRow types, stood here. Every screen moved off
// the parcel on 2026-09-18 — the coverage map now reads public_offer_stock — and none of the three had a
// caller left. The three RPCs behind them now have no caller in the product either.

/**
 * Report v3 §20: description, water, access, video, documents, services and gallery of one project — its
 * words in `locale` (the request's language when it is not given).
 */
export async function getProjectPage(code: string, mode: PublicMode, locale?: Locale): Promise<ProjectPage | null> {
  const language = locale ?? (await currentLocale());
  const row = (await load(mode, "public_project_page", { p_code: code })) as Record<string, unknown> | null;
  if (!row) return null;
  const text = (value: unknown) => (typeof value === "string" && value ? value : null);
  const ids = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  const media = Array.isArray(row.media) ? (row.media as Record<string, unknown>[]) : [];
  const projectId = String(row.project_id ?? "");
  const words = await wordsFor(
    mode,
    language,
    ["project", "project_media"],
    [projectId, ...media.map((picture) => String(picture.id))].filter(Boolean),
  );
  return {
    description: worded(words, "project", projectId, "description", text(row.description_ar)),
    water_available: typeof row.water_available === "boolean" ? row.water_available : null,
    water_note: worded(words, "project", projectId, "water_note", text(row.water_note)),
    access_note: worded(words, "project", projectId, "access_note", text(row.access_note)),
    video_url: text(row.video_url),
    latitude: numOrNull(row.latitude),
    longitude: numOrNull(row.longitude),
    document_option_ids: ids(row.document_option_ids),
    service_option_ids: ids(row.service_option_ids),
    media: media.map((picture) => ({
      id: String(picture.id),
      url: String(picture.url),
      alt: worded(words, "project_media", String(picture.id), "alt", String(picture.alt_ar ?? "")),
      caption: worded(words, "project_media", String(picture.id), "caption", text(picture.caption_ar)),
      is_cover: Boolean(picture.is_cover),
    })),
  };
}

export type ProjectQuotePricing = "closed" | "not_offered" | "legacy" | "unavailable" | "ok";

type QuoteChoice = { id: string; label_ar: string; label_fr: string | null };

/** public_project_quote (migration 0034): the /start quote on one project's rules and classes. */
/**
 * The quantity tier a basket fell in, and what it took off (0132/0133). Null when no tier applied, which is
 * the one condition a page needs: `promotion` present means the three figures below are worth printing.
 *
 * `before_millimes − amount_millimes` is the total the quote carries. The database rounds the DISCOUNT and
 * not the final price precisely so that holds — a client who subtracts the two numbers printed to him must
 * not get a third.
 */
export type QuotePromotion = {
  id: string;
  label_ar: string;
  min_trees: number;
  /** Basis points: 1000 = 10%. Null when the tier is a special price per tree instead. */
  percent_bp: number | null;
  unit_price_millimes: number | null;
  before_millimes: number;
  amount_millimes: number;
};

export type ProjectQuote = Omit<TreeQuote, "pricing"> & {
  project_id: string;
  project_code: string;
  on_tree_pricing: boolean;
  spacing_status: "ok" | "required" | "not_allowed" | null;
  trees_max: number | null;
  pricing: ProjectQuotePricing;
  /** The tier the CASH total carries. The instalment plan may have been built on a different one. */
  promotion: QuotePromotion | null;
  total_before_promotion_millimes: number | null;
  choices: {
    spacing_classes: (QuoteChoice & { area_m2: number; price_per_tree_millimes: number | null })[];
    down_percents: (QuoteChoice & { percent: number })[];
    durations: (QuoteChoice & { months: number })[];
  };
};

export type ProjectQuoteRequest = {
  spacingClassId?: string | null;
  trees?: number | null;
  paymentMode?: PaymentMode | null;
  downPercentOptionId?: string | null;
  durationOptionId?: string | null;
};

const QUOTE_PRICING: readonly ProjectQuotePricing[] = ["closed", "not_offered", "legacy", "unavailable", "ok"];

function toChoice(value: unknown): QuoteChoice & Record<string, unknown> {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { ...row, id: String(row.id ?? ""), label_ar: String(row.label_ar ?? ""), label_fr: (row.label_fr as string | null) ?? null };
}

export function toProjectQuote(data: unknown): ProjectQuote | null {
  const base = toTreeQuote(data);
  if (!base || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const pricing = QUOTE_PRICING.includes(row.pricing as ProjectQuotePricing) ? (row.pricing as ProjectQuotePricing) : "closed";
  const choices = (row.choices && typeof row.choices === "object" ? row.choices : {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.map(toChoice) : []);
  const spacing = row.spacing_status;

  return {
    ...base,
    project_id: String(row.project_id ?? ""),
    project_code: String(row.project_code ?? ""),
    on_tree_pricing: row.on_tree_pricing === true,
    spacing_status: spacing === "ok" || spacing === "required" || spacing === "not_allowed" ? spacing : null,
    trees_max: numOrNull(row.trees_max),
    pricing,
    // toTreeQuote already drops the figures unless its own reading of pricing is "ok".
    price_per_tree_millimes: pricing === "ok" ? base.price_per_tree_millimes : null,
    total_price_millimes: pricing === "ok" ? base.total_price_millimes : null,
    promotion: pricing === "ok" ? toPromotion(row.promotion) : null,
    total_before_promotion_millimes: pricing === "ok" ? numOrNull(row.total_before_promotion_millimes) : null,
    choices: {
      spacing_classes: list(choices.spacing_classes).map((choice) => ({
        ...choice,
        area_m2: num(choice.area_m2),
        price_per_tree_millimes: pricing === "ok" ? numOrNull(choice.price_per_tree_millimes) : null,
      })),
      down_percents: list(choices.down_percents).map((choice) => ({ ...choice, percent: num(choice.percent) })),
      durations: list(choices.durations).map((choice) => ({ ...choice, months: num(choice.months) })),
    },
  };
}

/** A tier as the quote publishes it, or null — including when the database predates 0132. */
function toPromotion(raw: unknown): QuotePromotion | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const before = numOrNull(row.before_millimes);
  const amount = numOrNull(row.amount_millimes);
  if (before === null || amount === null) return null;
  return {
    id: String(row.id ?? ""),
    label_ar: String(row.label_ar ?? ""),
    min_trees: num(row.min_trees),
    percent_bp: numOrNull(row.percent_bp),
    unit_price_millimes: numOrNull(row.unit_price_millimes),
    before_millimes: before,
    amount_millimes: amount,
  };
}

/**
 * One project's quote (plan P5-4). Null when the project is not visible, or when the quote cannot be read
 * (for instance before migration 0034), so pages fall back to what they showed before.
 */
export async function getProjectQuote(projectId: string, mode: PublicMode, request: ProjectQuoteRequest = {}): Promise<ProjectQuote | null> {
  const args: Record<string, unknown> = { p_project: projectId };
  if (request.spacingClassId) args.p_spacing_class = request.spacingClassId;
  if (request.trees) args.p_trees = request.trees;
  if (request.paymentMode) args.p_payment_mode = request.paymentMode;
  if (request.downPercentOptionId) args.p_down_percent_option_id = request.downPercentOptionId;
  if (request.durationOptionId) args.p_duration_option_id = request.durationOptionId;
  try {
    return toProjectQuote(await load(mode, "public_project_quote", args));
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function findProject(projects: PublicProject[], code: string): PublicProject | undefined {
  return projects.find((project) => project.code === code);
}
