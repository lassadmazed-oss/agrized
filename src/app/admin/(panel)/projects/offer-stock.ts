// The stock of an offer, counted from its trees — the one place the Back Office reads it (0054).
//
// The unit is the olive tree (owner, 2026-09-18: «the unit is a tree not m carré» · «we just give each tree a
// number or an id and associate it with the client»). An offer holds tree_count of them; public.trees holds one
// row per tree, each with its own code; the four figures the owner named are counts of those rows.
//
// Before this, the Back Office counted parcels. public.parcels has no rows, so «إجمالي الزيتونات» read 0 on a
// page whose two offers declare 500 and 100 trees — the screen contradicted itself, which is what the owner
// reported: «here it's messed up, I cannot control the right thing».

import "server-only";

import type { createClient } from "@/lib/supabase/server";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

/**
 * What one offer holds.
 *
 * `status` is the honest part: `not_generated` means nobody has numbered this offer's trees yet, which is not
 * the same as «none left», and `partial` means tree_count and the rows disagree and the Back Office has to
 * renumber. A screen that shows the four counts without reading this would present «0 available» for both.
 */
export type OfferStock = {
  project_id: string;
  project_code: string | null;
  /** What the offer's card declares (projects.tree_count). */
  trees_declared: number | null;
  /** Rows that actually exist in public.trees. */
  trees_total: number;
  trees_available: number;
  trees_reserved: number;
  trees_sold: number;
  /** The smallest basket this offer sells, offer value first, then the global default. */
  min_trees: number;
  status: "ok" | "not_generated" | "partial";
};

const EMPTY = (projectId: string): OfferStock => ({
  project_id: projectId,
  project_code: null,
  trees_declared: null,
  trees_total: 0,
  trees_available: 0,
  trees_reserved: 0,
  trees_sold: 0,
  min_trees: 1,
  status: "not_generated",
});

/** The stock of one offer. A failed read reports «not numbered yet» rather than inventing zeros. */
export async function offerStock(supabase: StaffClient, projectId: string): Promise<OfferStock> {
  const { data, error } = await supabase.rpc("staff_offer_stock", { p_project: projectId });
  if (error || !data) return EMPTY(projectId);
  return data as unknown as OfferStock;
}

/** The stock of several offers, read in parallel; the list page totals them. */
export async function offerStocks(supabase: StaffClient, projectIds: readonly string[]): Promise<Map<string, OfferStock>> {
  const ids = [...new Set(projectIds)];
  const rows = await Promise.all(ids.map((id) => offerStock(supabase, id)));
  return new Map(rows.map((row) => [row.project_id, row]));
}

/** Sum of several offers, for the four tiles at the head of the offers list. */
export function totalStock(stocks: Iterable<OfferStock>) {
  let declared = 0;
  let total = 0;
  let available = 0;
  let reserved = 0;
  let sold = 0;
  let unnumbered = 0;
  for (const stock of stocks) {
    declared += stock.trees_declared ?? 0;
    total += stock.trees_total;
    available += stock.trees_available;
    reserved += stock.trees_reserved;
    sold += stock.trees_sold;
    if (stock.status === "not_generated") unnumbered += 1;
  }
  return { declared, total, available, reserved, sold, unnumbered };
}
