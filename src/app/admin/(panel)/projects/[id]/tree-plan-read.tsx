import "server-only";

// The one read behind the plan: a window of an offer's trees, plus the four counts that go above it.
//
// IT READS THE TABLE DIRECTLY, AND THAT IS DELIBERATE. There is no RPC that lists an offer's trees for
// picking — app.offer_stock_payload returns four COUNTS, and the الزيتونات tab lists only HELD trees, saying
// so in its own header («an available tree is never listed: five hundred identical rows reading «متاحة · بلا
// صاحب» tell nobody anything»). That is exactly the set a picker needs. public.trees grants SELECT to
// authenticated and its policy is app.is_staff(), so a staff reader may read these four columns today, with no
// migration and nothing pending. supabase/pending/bb_71_tree_picking.sql proposes public.staff_offer_tree_plan
// as the eventual home for this read — it can scope and page in Postgres and it can hide a holder properly —
// and until it is applied this function is the honest equivalent: four columns, one window, no holder.
//
// FOUR COLUMNS AND NOT FIVE. `held_by` is not selected. The plan must know a tree is taken; it must never say
// by whom. §27 draws that line and the RLS on public.trees does not — trees_select is a plain is_staff(), so
// every role reads every row — which is precisely why the restraint has to live here and be stated.
//
// NOTHING IS COUNTED HERE. The four figures come from staff_offer_stock (0054), which counts them in Postgres
// from trees.state, per §24's «never entered by hand». Summing the window would give the block's counts, not
// the offer's, and the two would disagree on every screen that showed both.

import { getPublicConfig, settingInt, settingText } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

import { offerStock } from "../offer-stock";
import {
  blockStart,
  clampBlockSize,
  PLAN_BLOCK_FALLBACK,
  type PlanTree,
  type PlanTreeState,
  type TreePlanWindow,
} from "./tree-plan-model";

const STATES: readonly PlanTreeState[] = ["available", "reserved", "sold"];

function planState(value: unknown): PlanTreeState {
  return STATES.includes(value as PlanTreeState) ? (value as PlanTreeState) : "available";
}

/**
 * One window of an offer's plan, starting at the block that contains `startAt`.
 *
 * Returns null when the offer does not exist or the reader may not see it — the caller then says so rather
 * than drawing an empty grid, because «ما فماش زيتونات» and «ما نجمناش نقراو» are different sentences.
 */
export async function readTreePlan(projectId: string, startAt: number | null): Promise<TreePlanWindow | null> {
  const supabase = await createClient();

  const [config, { data: offer }] = await Promise.all([
    getPublicConfig(),
    supabase.from("projects").select("id, code, name").eq("id", projectId).maybeSingle(),
  ]);
  if (!offer) return null;

  const blockSize = clampBlockSize(settingInt(config, "trees.plan_block_size", PLAN_BLOCK_FALLBACK));

  const [stock, { data: last }] = await Promise.all([
    offerStock(supabase, projectId),
    supabase.from("trees").select("seq").eq("project_id", projectId).order("seq", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const maxSeq = last?.seq ?? 0;
  const from = maxSeq > 0 ? Math.min(blockStart(startAt ?? 1, blockSize), blockStart(maxSeq, blockSize)) : 1;
  const to = from + blockSize - 1;

  const { data: rows } = await supabase
    .from("trees")
    .select("id, seq, code, state")
    .eq("project_id", projectId)
    .gte("seq", from)
    .lte("seq", to)
    .order("seq");

  const trees: PlanTree[] = (rows ?? []).map((row) => ({
    id: row.id,
    seq: row.seq,
    code: row.code,
    state: planState(row.state),
  }));

  return {
    projectId,
    offerName: offer.name,
    offerCode: offer.code,
    block: { from, to: Math.min(to, Math.max(maxSeq, from)) },
    blockSize,
    maxSeq,
    trees,
    stock: {
      total: stock.trees_total,
      available: stock.trees_available,
      reserved: stock.trees_reserved,
      sold: stock.trees_sold,
      minTrees: stock.min_trees,
      numbered: stock.status !== "not_generated" && stock.trees_total > 0,
    },
    labels: {
      total: settingText(config, "offers.stock_total_label", "إجمالي الزيتونات"),
      available: settingText(config, "offers.stock_available_label", "المتاحة"),
      reserved: settingText(config, "offers.stock_reserved_label", "المحجوزة"),
      sold: settingText(config, "offers.stock_sold_label", "المباعة"),
    },
  };
}
