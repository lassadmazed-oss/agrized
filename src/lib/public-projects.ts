import "server-only";

import { unstable_cache } from "next/cache";

import type { ModuleAccess } from "@/lib/modules";
import type { ParcelOffer } from "@/lib/projects";
import { toTreeQuote, type PaymentMode, type TreeQuote } from "@/lib/tree-pricing";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

/** Expired by every Back Office action that changes a project, a parcel or the module flag. */
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
  cover_alt_ar: string | null;
};

export type PublicParcel = {
  id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  project_status: string;
  project_type_id: string | null;
  governorate_id: number;
  delegation_id: number | null;
  code: string;
  area_m2: number;
  property_type: string;
  plantation_system: string | null;
  olive_tree_count: number | null;
  tree_age_years: number | null;
  production_status: string | null;
  irrigation: string | null;
  status: string;
  offered: boolean;
  /** Plan P5-3: area = trees × area per tree, price = trees × price per tree (app.parcel_price). */
  on_tree_pricing: boolean;
  spacing_class_id: string | null;
  spacing_label_ar: string | null;
  area_per_tree_m2: number | null;
  price_per_tree_millimes: number | null;
  cash_price_millimes: number | null;
  /** Smallest down payment this parcel accepts (report v3 §19); null until the listing returns it. */
  down_from_millimes: number | null;
  annual_costs_millimes: number | null;
  sort_order: number;
  photo_url: string | null;
  photo_alt_ar: string | null;
};

export type ProjectPicture = { id: string; url: string; alt_ar: string; caption_ar: string | null; is_cover: boolean };

/** Report v3 §20: what public_project_page() adds to a project's listing row. */
export type ProjectPage = {
  description_ar: string | null;
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

export type CoverageRow = {
  governorate_id: number;
  projects_count: number;
  parcels_total: number;
  parcels_offered: number;
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

export async function getPublicProjects(mode: PublicMode): Promise<PublicProject[]> {
  const rows = ((await load(mode, "public_projects")) ?? []) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    project_type_id: (row.project_type_id as string | null) ?? null,
    governorate_id: num(row.governorate_id),
    delegation_id: numOrNull(row.delegation_id),
    location_description: (row.location_description as string | null) ?? null,
    total_area_m2: numOrNull(row.total_area_m2),
    olive_variety: (row.olive_variety as string | null) ?? null,
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
    cover_alt_ar: (row.cover_alt_ar as string | null) ?? null,
  }));
}

export async function getPublicParcels(mode: PublicMode): Promise<PublicParcel[]> {
  const rows = ((await load(mode, "public_parcels")) ?? []) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    project_id: String(row.project_id),
    project_code: String(row.project_code),
    project_name: String(row.project_name),
    project_status: String(row.project_status),
    project_type_id: (row.project_type_id as string | null) ?? null,
    governorate_id: num(row.governorate_id),
    delegation_id: numOrNull(row.delegation_id),
    code: String(row.code),
    area_m2: num(row.area_m2),
    property_type: String(row.property_type),
    plantation_system: (row.plantation_system as string | null) ?? null,
    olive_tree_count: numOrNull(row.olive_tree_count),
    tree_age_years: numOrNull(row.tree_age_years),
    production_status: (row.production_status as string | null) ?? null,
    irrigation: (row.irrigation as string | null) ?? null,
    status: String(row.status),
    offered: Boolean(row.offered),
    on_tree_pricing: row.on_tree_pricing === true,
    spacing_class_id: (row.spacing_class_id as string | null) ?? null,
    spacing_label_ar: (row.spacing_label_ar as string | null) ?? null,
    area_per_tree_m2: numOrNull(row.area_per_tree_m2),
    price_per_tree_millimes: numOrNull(row.price_per_tree_millimes),
    cash_price_millimes: numOrNull(row.cash_price_millimes),
    down_from_millimes: numOrNull(row.down_from_millimes),
    annual_costs_millimes: numOrNull(row.annual_costs_millimes),
    sort_order: num(row.sort_order),
    photo_url: (row.photo_url as string | null) ?? null,
    photo_alt_ar: (row.photo_alt_ar as string | null) ?? null,
  }));
}

export async function getCoverage(mode: PublicMode): Promise<CoverageRow[]> {
  const rows = ((await load(mode, "public_coverage")) ?? []) as Record<string, unknown>[];
  return rows.map((row) => ({
    governorate_id: num(row.governorate_id),
    projects_count: num(row.projects_count),
    parcels_total: num(row.parcels_total),
    parcels_offered: num(row.parcels_offered),
  }));
}

/**
 * The offer card of one parcel: price, entry installment and worked examples, all computed in SQL.
 * Choices are option ids only; an invalid pair falls back to the plain offer rather than failing the page.
 */
export async function getParcelOffer(
  parcelId: string,
  mode: PublicMode,
  choice: { down?: string; installment?: string } = {},
): Promise<ParcelOffer | null> {
  const base = { p_parcel: parcelId };
  const withChoice =
    choice.down && choice.installment ? { ...base, p_down_option: choice.down, p_installment_option: choice.installment } : null;
  try {
    return ((await load(mode, "public_parcel_offer", withChoice ?? base)) as ParcelOffer | null) ?? null;
  } catch (error) {
    if (!withChoice) throw error;
    return ((await load(mode, "public_parcel_offer", base)) as ParcelOffer | null) ?? null;
  }
}

/** Report v3 §20: description, water, access, video, documents, services and gallery of one project. */
export async function getProjectPage(code: string, mode: PublicMode): Promise<ProjectPage | null> {
  const row = (await load(mode, "public_project_page", { p_code: code })) as Record<string, unknown> | null;
  if (!row) return null;
  const text = (value: unknown) => (typeof value === "string" && value ? value : null);
  const ids = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  const media = Array.isArray(row.media) ? (row.media as Record<string, unknown>[]) : [];
  return {
    description_ar: text(row.description_ar),
    water_available: typeof row.water_available === "boolean" ? row.water_available : null,
    water_note: text(row.water_note),
    access_note: text(row.access_note),
    video_url: text(row.video_url),
    latitude: numOrNull(row.latitude),
    longitude: numOrNull(row.longitude),
    document_option_ids: ids(row.document_option_ids),
    service_option_ids: ids(row.service_option_ids),
    media: media.map((picture) => ({
      id: String(picture.id),
      url: String(picture.url),
      alt_ar: String(picture.alt_ar),
      caption_ar: text(picture.caption_ar),
      is_cover: Boolean(picture.is_cover),
    })),
  };
}

export type ProjectQuotePricing = "closed" | "not_offered" | "legacy" | "unavailable" | "ok";

type QuoteChoice = { id: string; label_ar: string; label_fr: string | null };

/** public_project_quote (migration 0034): the /start quote on one project's rules and classes. */
export type ProjectQuote = Omit<TreeQuote, "pricing"> & {
  project_id: string;
  project_code: string;
  on_tree_pricing: boolean;
  spacing_status: "ok" | "required" | "not_allowed" | null;
  trees_max: number | null;
  pricing: ProjectQuotePricing;
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

export function findParcel(parcels: PublicParcel[], projectCode: string, parcelCode: string): PublicParcel | undefined {
  return parcels.find((parcel) => parcel.project_code === projectCode && parcel.code === parcelCode);
}
