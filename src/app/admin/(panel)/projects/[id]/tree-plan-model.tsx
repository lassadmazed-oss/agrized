// The shape of an offer's plan, and the two pieces of arithmetic a plan needs. Nothing else.
//
// WHY THIS FILE EXISTS AT ALL, and why it is not "use client". ./tree-plan.tsx is a client component and
// ./tree-plan-read.tsx is server-only; both need the same types and the same block arithmetic. A Server
// Component that imports a real VALUE from a "use client" module receives a client-reference proxy, which has
// already cost this project one runtime crash (see ./tree-filter.ts, written for exactly this reason). So the
// values live here, in a module with no directive, and both sides import them.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT «THE PLAN» IS, AND WHAT IT IS NOT. Read this before changing anything below.
//
// §11 of the owner's brief asks for «مخطط تفاعلي للأرض»: zones P1/P2/P3, the trees drawn inside them with
// their numbers, and the commercial picking the ones the client walked to. public.trees carries THIRTEEN
// columns and not one of them is a position: no x, no y, no latitude, no longitude, no zone, no parcel. The
// parcel layer that could have held a zone holds zero rows and is being deleted
// (supabase/pending/bb_03_parcel_layer_retires.sql). So there is no geometry in this database, and there is no
// honest way to draw one.
//
// Inventing coordinates would be worse than drawing nothing: a commercial standing in a grove would point at a
// square on a phone, the square would be at a place nobody surveyed, and the plan would lie about where a
// client's tree stands — on the one screen whose whole job is to be exact about that.
//
// So this plan draws THE NUMBER LINE, not the land. An offer's trees are numbered 1..tree_count, dense, and
// every tree carries that number on its own tag (TX-00215-0128). The grid below is those numbers in order,
// coloured by state, and it answers §11's real question — «هذي الزيتونات اللي مشى لها الحريف، مازالوا فاضيين؟»
// — because the client reads a number off a tag and the commercial taps that number. It is labelled on screen
// as «مخطط بالأرقام» so nobody mistakes it for a map. When per-tree positions exist (a zone id and an x/y, the
// three columns supabase/pending/bb_71_tree_picking.sql argues for but does not add), this same component gets
// a second layout and the picking half does not change at all.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** public.tree_state. Three values; the Arabic of each one is a setting (offers.stock_*), never a literal. */
export type PlanTreeState = "available" | "reserved" | "sold";

/**
 * One tree on the plan: its id, its number, its code and its state.
 *
 * `held_by` is deliberately NOT here and is deliberately not selected by the read. public.trees_select is a
 * plain app.is_staff(), so every staff role can read every tree row — but §27 says a reader must not learn
 * things they have no business with, and «who owns tree #4102» is a client fact that belongs to that client's
 * file, behind app.can_see_person. The plan needs to know a tree is taken; it never needs to know by whom.
 */
export type PlanTree = { id: string; seq: number; code: string; state: PlanTreeState };

/** The stretch of numbers one screen is showing, inclusive at both ends. */
export type PlanBlock = { from: number; to: number };

/** What the offer holds in total, counted in Postgres by staff_offer_stock. Never summed from `trees`. */
export type PlanStock = {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  /** The smallest basket this offer sells (app.offer_min_trees), offer value first, then the setting. */
  minTrees: number;
  /** False while nobody has numbered this offer's trees: there is no plan to draw yet. */
  numbered: boolean;
};

/** The Arabic of the four figures, from settings (offers.stock_*). Not written in any component. */
export type PlanStockLabels = { total: string; available: string; reserved: string; sold: string };

/** One window of an offer's plan: everything a picker needs and nothing it does not. */
export type TreePlanWindow = {
  projectId: string;
  offerName: string;
  offerCode: string | null;
  block: PlanBlock;
  blockSize: number;
  /** The highest number that exists in this offer — the end of the last block. */
  maxSeq: number;
  trees: PlanTree[];
  stock: PlanStock;
  labels: PlanStockLabels;
};

/**
 * HOW MANY NUMBERS ONE SCREEN HOLDS.
 *
 * This is a rendering budget, not a business value: it is the same kind of figure as the `limit 50` the
 * الزيتونات tab already uses and the `limit: 200` the visits board already passes, and it says how much fits
 * on a phone before a grid stops being readable. TX-00215 holds 8,000 trees and they cannot all be drawn.
 *
 * It is still read from `settings` first (`trees.plan_block_size`), because the owner is the one standing in
 * the grove and may want shorter or longer runs; bb_71 seeds the key. This number is only what the screen
 * falls back to while that row does not exist. 120 is five columns of twenty-four rows at 375px, which is one
 * thumb-scroll, and a round hundred-and-twenty so a block boundary lands on a number a human can say.
 */
export const PLAN_BLOCK_FALLBACK = 120;

/** Bounds on the setting, so a typo in `settings` cannot ask the browser to draw eight thousand cells. */
export const PLAN_BLOCK_MIN = 20;
export const PLAN_BLOCK_MAX = 600;

/**
 * The biggest set one pick may take.
 *
 * Mirrors the cap public.staff_set_tree_state has carried since 0054 and that bb_71 repeats: one call must not
 * lock a whole inventory, and a bigger correction is several calls, each with its own reason. A safety bound,
 * not a basket size — the basket's floor is the offer's own app.offer_min_trees and has no ceiling here.
 */
export const PLAN_MAX_SELECTION = 1000;

export function clampBlockSize(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return PLAN_BLOCK_FALLBACK;
  const size = Math.trunc(value as number);
  return Math.min(Math.max(size, PLAN_BLOCK_MIN), PLAN_BLOCK_MAX);
}

/** The first number of the block that contains `seq`. Blocks start at 1, so #128 in blocks of 120 → 121. */
export function blockStart(seq: number, size: number): number {
  const safe = Math.max(1, Math.trunc(seq));
  return Math.floor((safe - 1) / Math.max(1, size)) * Math.max(1, size) + 1;
}

/** Every block of an offer, for the «انقز لبلوك» select. Bounded by maxSeq, so a short offer has one row. */
export function blocksOf(maxSeq: number, size: number): PlanBlock[] {
  const step = Math.max(1, size);
  const end = Math.max(1, Math.trunc(maxSeq));
  const out: PlanBlock[] = [];
  for (let from = 1; from <= end; from += step) out.push({ from, to: Math.min(from + step - 1, end) });
  return out;
}

/** A number typed into the address or into a field, or null when it says nothing. */
export function parseSeq(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : typeof value === "number" ? value : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * «من 125 إلى 134» as a set of numbers, in order, capped.
 *
 * Returns an empty array for a backwards or absurd range rather than silently swapping the ends: the
 * commercial typed something, and a screen that quietly reverses it is a screen that will one day reserve the
 * wrong ten trees.
 */
export function seqRange(from: number, to: number, cap = PLAN_MAX_SELECTION): number[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return [];
  if (to - from + 1 > cap) return [];
  const out: number[] = [];
  for (let n = from; n <= to; n += 1) out.push(n);
  return out;
}

/**
 * WHAT A PICK SENDS: NUMBERS, NOT IDS — and this is a decision worth its paragraph.
 *
 * public.staff_set_tree_state takes uuid[], and the obvious sibling would take uuid[] too. This one takes the
 * offer plus the NUMBERS, because (project_id, seq) is unique on public.trees, because the number is what the
 * client actually chose — it is painted on the tag the two of them are standing in front of — and because it
 * makes «a tree from another offer» structurally impossible instead of a runtime refusal. It is also what the
 * refusal has to say back: «زيتونة 125 تحجزت توّا» is a sentence; a uuid is not.
 *
 * The action is passed IN as a prop rather than imported by ./tree-plan.tsx, so the plan stays a picker and
 * knows nothing about reservations: the field desk hands it the reserving act, and an offer's own page could
 * one day hand it a plain hold without this file changing.
 */
export type PickInput = {
  projectId: string;
  personId: string;
  requestId: string | null;
  /** The tree numbers chosen, as the reader tapped them. The database re-checks every one of them. */
  seqs: number[];
  note: string | null;
  reason: string;
};

export type PickResult =
  | { ok: true; message: string; href: string }
  | {
      ok: false;
      message: string;
      /** The numbers that went to somebody else between the tap and the press. §11's «still free?» answered. */
      taken?: number[];
      /** Numbers that were free at the moment of the refusal, so the message is never a dead end. */
      free?: number[];
    };

export type PickAction = (input: PickInput) => Promise<PickResult>;

/**
 * How a set of chosen numbers is said out loud: «125 – 134» when it is one run, «125 – 128 · 140 – 142» when
 * it is not. Presentation of numbers the reader already picked; no business value is decided here.
 */
export function describeRuns(seqs: readonly number[]): string[] {
  const sorted = [...new Set(seqs)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start: number | null = null;
  let previous: number | null = null;

  for (const n of sorted) {
    if (start === null || previous === null) {
      start = n;
      previous = n;
      continue;
    }
    if (n === previous + 1) {
      previous = n;
      continue;
    }
    runs.push(start === previous ? String(start) : `${start} – ${previous}`);
    start = n;
    previous = n;
  }
  if (start !== null && previous !== null) runs.push(start === previous ? String(start) : `${start} – ${previous}`);
  return runs;
}
