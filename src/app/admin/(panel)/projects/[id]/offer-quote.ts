// What one tree of this offer costs — read from the offer itself, never from its lots.
//
// The Back Office used to derive the price from public.parcels (staff_project_parcel_prices → app.parcel_price,
// one row per lot). public.parcels has no rows, so the offer page printed «يتحدّد بعد اعتماد فئة المساحة» while
// the public site was already selling at 454 د and 4,491 د the tree. The figures were never missing: they come
// from app.tree_price through app.project_quote_payload, which answers for an OFFER and needs no parcel.
//
// Nothing is computed here (PRJ-03): the total is the database's own trees × price, asked for by passing p_trees.

import "server-only";

import type { createClient } from "@/lib/supabase/server";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

/** 0034: how far the quote got. Staff never see 'closed' or 'not_offered' — those gate the public twin only. */
export type OfferQuotePricing = "ok" | "unavailable" | "legacy" | "closed" | "not_offered";

/** app.project_spacing_choice: null while the offer lists no class at all ('legacy'). */
export type OfferSpacingStatus = "ok" | "required" | "not_allowed" | null;

export type OfferQuote = {
  pricing: OfferQuotePricing;
  spacingStatus: OfferSpacingStatus;
  /** The class's area, the exact figure — not المساحة ÷ الزيتونات. */
  areaPerTreeM2: number | null;
  pricePerTreeMillimes: number | null;
  /** Paid every year for one tree, never inside the price above (0045). */
  annualFeePerTreeMillimes: number | null;
  /** price × the trees asked for, multiplied in Postgres. */
  totalPriceMillimes: number | null;
  /**
   * Why app.tree_price refused: 'margin_not_set', 'spacing_not_found', 'spacing_not_allowed'. Present for
   * Finance and Admin only (app.can_price), so a commercial reads the spacing status and no more.
   */
  reason: string | null;
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const PRICING: readonly OfferQuotePricing[] = ["ok", "unavailable", "legacy", "closed", "not_offered"];

/**
 * The offer's own quote. `p_trees` asks the database for the total as well as the unit price; null asks for the
 * unit price alone. A failed read returns null and the page says the price could not be read, never «0 د.ت».
 */
export async function offerQuote(supabase: StaffClient, projectId: string, trees: number | null): Promise<OfferQuote | null> {
  const args: { p_project: string; p_trees?: number } = { p_project: projectId };
  if (trees && trees > 0) args.p_trees = Math.round(trees);

  const { data, error } = await supabase.rpc("staff_project_quote", args);
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;

  const row = data as Record<string, unknown>;
  const price = (row.price && typeof row.price === "object" && !Array.isArray(row.price) ? row.price : null) as Record<
    string,
    unknown
  > | null;
  const spacing = row.spacing_status;

  return {
    pricing: PRICING.includes(row.pricing as OfferQuotePricing) ? (row.pricing as OfferQuotePricing) : "unavailable",
    spacingStatus: spacing === "ok" || spacing === "required" || spacing === "not_allowed" ? spacing : null,
    areaPerTreeM2: num(row.area_per_tree_m2),
    pricePerTreeMillimes: num(row.price_per_tree_millimes),
    annualFeePerTreeMillimes: num(row.annual_fee_per_tree_millimes),
    totalPriceMillimes: num(row.total_price_millimes),
    reason: price && price.ok === false && typeof price.reason === "string" ? price.reason : null,
  };
}
