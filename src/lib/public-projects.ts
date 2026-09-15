import "server-only";

import { unstable_cache } from "next/cache";

import type { ModuleAccess } from "@/lib/modules";
import type { ParcelOffer } from "@/lib/projects";
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
  parcels_total: number;
  parcels_offered: number;
  min_cash_price_millimes: number | null;
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
  cash_price_millimes: number | null;
  /** Smallest down payment this parcel accepts (report v3 §19); null until the listing returns it. */
  down_from_millimes: number | null;
  annual_costs_millimes: number | null;
  sort_order: number;
  photo_url: string | null;
  photo_alt_ar: string | null;
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
    parcels_total: num(row.parcels_total),
    parcels_offered: num(row.parcels_offered),
    min_cash_price_millimes: numOrNull(row.min_cash_price_millimes),
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

export function findProject(projects: PublicProject[], code: string): PublicProject | undefined {
  return projects.find((project) => project.code === code);
}

export function findParcel(parcels: PublicParcel[], projectCode: string, parcelCode: string): PublicParcel | undefined {
  return parcels.find((parcel) => parcel.project_code === projectCode && parcel.code === parcelCode);
}
