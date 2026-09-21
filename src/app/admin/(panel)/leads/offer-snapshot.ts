// The offer side of a demand: what the search function returns, and the one part of it that it does not.
//
// 0049 gave public.interest_requests its offer columns — request_kind, project_id/code/name, offer_trees and the
// price and yearly-fee snapshot. 0052 IS APPLIED and taught public.crm_search_requests six of them: it returns
// request_kind, project_id, project_code, project_name and offer_trees, and it filters on request_kind and on
// project_id inside the database (read off the live function on 2026-09-19:
// `and (f.request_kind is null or c.request_kind = f.request_kind)`). Everything the CRM used to work around
// there is gone — a caller reads row.request_kind and the search pages, counts and totals are the database's.
//
// What 0052 did NOT put in its RETURNS TABLE is the price snapshot of an offer demand:
//   offer_price_per_tree_millimes, offer_total_price_millimes,
//   offer_annual_fee_per_tree_millimes, offer_annual_fee_total_millimes.
// (public.crm_requests, being `select r.*`, does have them; the function's own column list does not.) Those four
// are the whole reason this module still exists, so it reads exactly those four, for the rows the caller is
// already showing: same rows, same RLS (interest_requests is read here exactly as
// src/app/admin/(panel)/leads/[personId]/page.tsx reads it), no new grant and nothing invented. Add them to
// crm_search_requests' RETURNS TABLE with the next search migration and this file goes away entirely.

import "server-only";

import type { createClient } from "@/lib/supabase/server";

import { REQUEST_KINDS, type RequestKind } from "./filters";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

/** The four price figures a demand froze when it was sent. Null throughout for a calculator demand. */
export type OfferPrices = {
  offer_price_per_tree_millimes: number | null;
  offer_total_price_millimes: number | null;
  offer_annual_fee_per_tree_millimes: number | null;
  offer_annual_fee_total_millimes: number | null;
};

/** The offer a demand names — its identity from the search row, its prices from the read below. */
export type OfferSummary = OfferPrices & {
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  offer_trees: number | null;
};

/** A row of public.crm_search_requests, in the few columns this module touches. */
type SearchRow = {
  id: string;
  request_kind?: string | null;
  project_id?: string | null;
  project_code?: string | null;
  project_name?: string | null;
  offer_trees?: number | null;
};

const COLUMNS =
  "id, offer_price_per_tree_millimes, offer_total_price_millimes, offer_annual_fee_per_tree_millimes, offer_annual_fee_total_millimes";

/** PostgREST puts the whole id list in the URL; a hundred uuids keep it well inside every proxy's limit. */
const CHUNK = 100;

/**
 * The price snapshot of each given demand, keyed by request id. A failed read gives an empty map: the caller
 * then shows no price rather than a wrong one.
 */
export async function offerSnapshots(supabase: StaffClient, requestIds: readonly string[]): Promise<Map<string, OfferPrices>> {
  const snapshots = new Map<string, OfferPrices>();
  const ids = [...new Set(requestIds)];

  for (let start = 0; start < ids.length; start += CHUNK) {
    const { data } = await supabase
      .from("interest_requests")
      .select(COLUMNS)
      .in("id", ids.slice(start, start + CHUNK));
    for (const { id, ...prices } of data ?? []) snapshots.set(id, prices);
  }

  return snapshots;
}

/**
 * Which intake wrote this demand, or null when nothing says. The column is the search function's own since 0052,
 * so this only narrows its text to the two kinds the CRM knows. It takes the row and nothing else: the snapshot
 * map it used to need went with the workaround, and both callers that still passed it have dropped it
 * (src/app/admin/(panel)/leads/actions.ts no longer filters at all, export/route.ts passes the row alone).
 */
export function requestKindOf(row: SearchRow): RequestKind | null {
  return REQUEST_KINDS.find((kind) => kind === row.request_kind) ?? null;
}

/** The offer a demand names, or null when it names none. */
export function offerOf(row: SearchRow, snapshots: Map<string, OfferPrices>): OfferSummary | null {
  if (requestKindOf(row) !== "offer") return null;
  const prices = snapshots.get(row.id);
  return {
    project_id: row.project_id ?? null,
    project_code: row.project_code ?? null,
    project_name: row.project_name ?? null,
    offer_trees: typeof row.offer_trees === "number" ? row.offer_trees : null,
    offer_price_per_tree_millimes: prices?.offer_price_per_tree_millimes ?? null,
    offer_total_price_millimes: prices?.offer_total_price_millimes ?? null,
    offer_annual_fee_per_tree_millimes: prices?.offer_annual_fee_per_tree_millimes ?? null,
    offer_annual_fee_total_millimes: prices?.offer_annual_fee_total_millimes ?? null,
  };
}
