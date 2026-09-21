import "server-only";

import { unstable_cache } from "next/cache";

import type { OfferCardLabels } from "@/components/site/offer-card";
import { settingText, type PublicConfig } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { PUBLIC_PROJECTS_TAG, type PublicMode, type PublicProject } from "@/lib/public-projects";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything the three offer surfaces share — the home page, the catalogue and one offer's own page.
 *
 * It used to live inside `/projects/page.tsx`, which meant the home page imported a route module and
 * dragged its whole graph along; worse, changing how stock is read changed a page's exported API.
 *
 * What changed here (owner, 2026-09-18: «the unit is a tree not m carre»): the stock of an offer is no
 * longer derived from its parcels. `public.parcels` holds no row and never will again, so every figure
 * a visitor read was really `projects.tree_count` relabelled — a declaration, not an inventory. The four
 * counts now come from `public.public_offer_stock` (migration 0054), which counts rows of `public.trees`.
 * Both live offers are 100 % available today, so no number on screen moves; the difference is that they
 * now CAN move the moment a tree is reserved or sold.
 *
 * PRJ-03 stands: `public_offer_stock` carries no money key at all and is gated on the `projects` module
 * alone — stock is a fact, a price is a permission. The price per tree keeps coming from
 * `public_projects()` through `offerTreePrice()` below, gated twice on the `pricing` flag.
 */

// -----------------------------------------------------------------------------------------------
// The stock of one offer, counted in trees
// -----------------------------------------------------------------------------------------------

/**
 * 'ok'            → the four counts are real and may be shown.
 * 'not_generated' → no tree row exists yet, so the stock is UNKNOWN, not empty. Showing «0 متاحة»
 *                   would be a lie (0054's own header says so), so the pages show no count at all.
 * 'partial'       → the rows disagree with the offer's declared tree_count; the Back Office regenerates.
 */
export type OfferStockStatus = "ok" | "not_generated" | "partial";

export type OfferStock = {
  projectId: string;
  /** What the offer's card declares. Context only — never a count of rows. */
  declared: number | null;
  total: number;
  available: number;
  reserved: number;
  sold: number;
  /** Smallest basket this offer sells (projects.min_trees_per_order, else offers.min_trees_default). */
  minTrees: number;
  status: OfferStockStatus;
};

/** True while the four counts are worth printing. */
export function stockCounted(stock: OfferStock | null | undefined): stock is OfferStock {
  return Boolean(stock && stock.status !== "not_generated");
}

type RpcResult = { data: unknown; error: { message: string } | null };
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

const num = (value: unknown): number => Number(value ?? 0);

async function callOfferStock(mode: PublicMode, projectId: string): Promise<unknown> {
  const client = (mode === "preview" ? await createClient() : createPublicClient()) as unknown as RpcClient;
  const { data, error } = await client.rpc("public_offer_stock", { p_project: projectId });
  if (error) throw new Error(`public_offer_stock: ${error.message}`);
  return data;
}

// Same tag and same 60 s window as the other anon reads of the projects module, so a Back Office action
// that allocates or generates trees expires this with everything else it changed.
const cachedOfferStock = unstable_cache((projectId: string) => callOfferStock("anon", projectId), ["public-offer-stock-v1"], {
  tags: [PUBLIC_PROJECTS_TAG],
  revalidate: 60,
});

function toOfferStock(data: unknown): OfferStock | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const status = row.status;
  return {
    projectId: String(row.project_id ?? ""),
    declared: row.trees_declared === null || row.trees_declared === undefined ? null : num(row.trees_declared),
    total: num(row.trees_total),
    available: num(row.trees_available),
    reserved: num(row.trees_reserved),
    sold: num(row.trees_sold),
    minTrees: Math.max(1, num(row.min_trees)),
    status: status === "ok" || status === "partial" ? status : "not_generated",
  };
}

/**
 * The four counts of one offer, or null when they cannot be read — the offer is not visible to this
 * visitor, or the call failed. A page that gets null shows no count rather than a zero.
 */
export async function getOfferStock(projectId: string, mode: PublicMode): Promise<OfferStock | null> {
  try {
    const data = mode === "anon" ? await cachedOfferStock(projectId) : await callOfferStock(mode, projectId);
    return toOfferStock(data);
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * The same, for a list of offers. One call per offer: `public_offer_stock` takes a single project and
 * there is no set-returning public twin, so the catalogue reads two rows today behind the anon cache.
 */
export async function getOfferStocks(projectIds: readonly string[], mode: PublicMode): Promise<Map<string, OfferStock>> {
  const ids = [...new Set(projectIds)];
  const rows = await Promise.all(ids.map(async (id) => [id, await getOfferStock(id, mode)] as const));
  const stocks = new Map<string, OfferStock>();
  for (const [id, stock] of rows) if (stock) stocks.set(id, stock);
  return stocks;
}

// `declaredStock(project)` stood here while the home page still passed an offer's declared `tree_count`
// as its «متاحة» figure. That page reads `getOfferStocks()` now, like the catalogue, so all three offer
// surfaces count the same rows of `public.trees` and nothing derives a stock from a declaration.

// -----------------------------------------------------------------------------------------------
// The words. Every one of them is a key the Back Office holds.
// -----------------------------------------------------------------------------------------------

/** The four figures the owner named, as the Back Office writes them (migration 0054). */
export type StockLabels = { title: string; total: string; available: string; reserved: string; sold: string };

export function stockLabels(config: PublicConfig): StockLabels {
  return {
    title: settingText(config, "offers.stock_title", "الزيتونات في هذا العرض"),
    total: settingText(config, "offers.stock_total_label", "إجمالي الزيتونات"),
    available: settingText(config, "offers.stock_available_label", "المتاحة"),
    reserved: settingText(config, "offers.stock_reserved_label", "المحجوزة"),
    sold: settingText(config, "offers.stock_sold_label", "المباعة"),
  };
}

/**
 * A label written for a cell that stands alone («المتاحة») read as an adjective after its unit
 * («زيتونة متاحة»). The Back Office keeps one key for both, so the article is dropped here rather than
 * asking the owner to write the same word twice.
 */
function asAdjective(label: string): string {
  return label.replace(/^ال/, "");
}

/**
 * The name of the section, everywhere it is named (owner, 2026-09-18: «عروضنا»). Emptying offers.title
 * falls back to the older projects.title, so the section is renamed from the Back Office without a deploy.
 */
export function offersTitle(config: PublicConfig): string {
  return settingText(config, "offers.title") || settingText(config, "projects.title", "المشاريع المتوفّرة");
}

/**
 * Every word an <OfferCard> prints. The stock words are the offer keys of migration 0054 — the tree's own
 * three states — not the seven-value parcel vocabulary the card used to borrow from `src/lib/projects.ts`.
 */
export function offerCardLabels(config: PublicConfig): OfferCardLabels {
  const treeUnit = settingText(config, "start.trees_unit", "زيتونة");
  const labels = stockLabels(config);
  return {
    available: `${treeUnit} ${asAdjective(labels.available)}`,
    reserved: labels.reserved,
    sold: labels.sold,
    trees: settingText(config, "start.row_trees", "عدد الزيتونات"),
    areaPerTree: settingText(config, "start.row_area_per_tree", "المساحة لكل زيتونة"),
    pricePerTree: settingText(config, "start.row_price_per_tree", "سعر الزيتونة"),
    from: settingText(config, "start.from_prefix", "ابتداءً من"),
    pricePending: settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً."),
  };
}

/** «أقلّ عدد في هذا العرض: 5 زيتونة.», or "" when the offer sells from one tree and there is nothing to say. */
export function minTreesHint(config: PublicConfig, minTrees: number): string {
  if (minTrees <= 1) return "";
  return settingText(config, "offers.min_trees_hint", "أقلّ عدد في هذا العرض: {min} زيتونة.").replace(
    "{min}",
    formatCount(minTrees),
  );
}

// -----------------------------------------------------------------------------------------------
// Facts an offer publishes about itself
// -----------------------------------------------------------------------------------------------

/**
 * The offer's own area per tree, read off the two facts it publishes (57,600 م² over 100 زيتونة → 576 م²).
 * An area is not a price: PRJ-03 stands, and no cost, margin or formula is derived here.
 */
export function areaPerTree(project: PublicProject): number | null {
  if (project.area_per_tree_min_m2) return project.area_per_tree_min_m2;
  if (!project.total_area_m2 || !project.tree_count) return null;
  return project.total_area_m2 / project.tree_count;
}

/**
 * What one olive tree of this offer costs, in millimes, or null when no price may be shown — and then
 * the card prints `projects.price_pending` instead.
 *
 * The gate is checked twice, as everywhere else: `public_projects()` already returns the figure only for
 * a published project while `app.module_open('pricing')` holds, and `pricingOpen` says the same thing
 * again here from the visitor's own reading of the flag.
 */
export function offerTreePrice(project: PublicProject, pricingOpen: boolean): number | null {
  if (!pricingOpen || !project.offered || !project.on_tree_pricing) return null;
  return project.min_price_per_tree_millimes;
}

// -----------------------------------------------------------------------------------------------
// Two small blocks the offer surfaces share
// -----------------------------------------------------------------------------------------------

/** One figure of an offer's stock. The word under it is a Back Office key, never a new string. */
export function StockCell({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="stat gap-0.5 text-center">
      <span className={`font-display text-xl font-bold tabular-nums ${strong ? "text-forest" : "text-ink"}`}>
        {formatCount(value)}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/**
 * The note that belongs to the figures a visitor is looking at.
 *
 * PRN-01 is carried site-wide by the footer, which prints `legal.no_guarantee_notice` on every public page
 * ((public)/layout.tsx). This block sits at the foot of the same pages, so printing it here too put the
 * identical sentence on screen twice — 170px apart on /projects (owner, 2026-09-18: remove what repeats).
 * The money blocks keep their own copy of the notice, because those sit mid-page, next to a figure.
 *
 * The key is still `legal.parcel_card_note`: its name says «parcel», its Arabic says trees and spacing,
 * and five surfaces print it. Renaming a settings key is a migration, not a UI change.
 */
export function LegalNotes({ config }: { config: PublicConfig }) {
  return (
    <p className="mt-8 max-w-3xl rounded-xl bg-gold-soft/50 px-4 py-3 text-sm leading-6 text-ink/80">
      {settingText(config, "legal.parcel_card_note")}
    </p>
  );
}
