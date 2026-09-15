import "server-only";

import type { createClient } from "@/lib/supabase/server";

/**
 * app.parcel_price for one parcel (migration 0034), as the Back Office reads it through
 * staff_project_parcel_prices (0035). A parcel of a tree-priced project has its area and price computed from its
 * trees; a legacy parcel reports its typed values.
 */
export type ParcelPrice = {
  on_tree_pricing: boolean;
  spacing_class_id: string | null;
  area_per_tree_m2: number | null;
  trees: number | null;
  total_area_m2: number | null;
  price_per_tree_millimes: number | null;
  cash_total_millimes: number | null;
  pricing: "ok" | "unavailable" | "legacy";
  reason: string | null;
};

/** What stops a tree parcel from having a price, and how to fix it. */
export const PARCEL_PRICE_REASONS: Record<string, string> = {
  spacing_required: "المشروع فيه أكثر من فئة مساحة: اختر فئة القطعة.",
  spacing_not_allowed: "فئة القطعة ما عادش من فئات المشروع: اختر فئة أخرى.",
  trees_missing: "اكتب عدد الزيتونات باش تتحسب المساحة والسعر.",
  margin_not_set: "هامش AgriZed مازال ما تضبطش في صفحة التسعير.",
};

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type RpcResult = { data: unknown; error: { message: string } | null };
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

function toParcelPrice(value: unknown): ParcelPrice | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const pricing = row.pricing === "ok" || row.pricing === "unavailable" ? row.pricing : "legacy";
  return {
    on_tree_pricing: row.on_tree_pricing === true,
    spacing_class_id: typeof row.spacing_class_id === "string" ? row.spacing_class_id : null,
    area_per_tree_m2: numOrNull(row.area_per_tree_m2),
    trees: numOrNull(row.trees),
    total_area_m2: numOrNull(row.total_area_m2),
    price_per_tree_millimes: numOrNull(row.price_per_tree_millimes),
    cash_total_millimes: numOrNull(row.cash_total_millimes),
    pricing,
    reason: typeof row.reason === "string" ? row.reason : null,
  };
}

/**
 * The price of every parcel of a project, keyed by parcel id. Empty when it cannot be read (for instance before
 * migration 0035), so pages keep showing the typed values.
 */
export async function getStaffParcelPrices(supabase: ServerClient, projectId: string): Promise<Map<string, ParcelPrice>> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc("staff_project_parcel_prices", { p_project: projectId });
  if (error || !Array.isArray(data)) return new Map();
  const prices = new Map<string, ParcelPrice>();
  for (const row of data as { parcel_id?: unknown; price?: unknown }[]) {
    const price = toParcelPrice(row.price);
    if (typeof row.parcel_id === "string" && price) prices.set(row.parcel_id, price);
  }
  return prices;
}

/** The area and cash price to show for a parcel: computed for tree pricing, typed otherwise. */
export function effectiveParcelFigures(
  parcel: { id: string; area_m2: number | string; cash_price_millimes: number },
  prices: Map<string, ParcelPrice>,
): { area: number; cash: number | null; price: ParcelPrice | null } {
  const price = prices.get(parcel.id) ?? null;
  if (price?.on_tree_pricing) {
    return { area: price.total_area_m2 ?? Number(parcel.area_m2), cash: price.cash_total_millimes, price };
  }
  return { area: Number(parcel.area_m2), cash: parcel.cash_price_millimes, price };
}
