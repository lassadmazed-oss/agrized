// The one read of the dashboard's funnel, in one place, so no screen invents a query of its own.
//
// IT DERIVES NOTHING, AND NEITHER DOES THE FUNCTION IT CALLS. Where each customer stands is decided once,
// in supabase/pending/bb_70_journey.sql (app.journey_spine, app.person_stage, app.person_human_status), and
// src/lib/journey.ts is the TypeScript side of that contract. public.admin_funnel_stats() COUNTS over that
// derivation — the suffix sums, the three bar shares, the blockage, the parked files and the three tree
// counts — and this file parses the jsonb. Between the database and the screen nothing is added up, no
// share is worked out, and no stage is named in Arabic: every label arrives from a setting the owner edits.
//
// THE CAST, AND THE DAY IT GOES. public.admin_funnel_stats() is a DRAFT in
// supabase/pending/bb_74_funnel_dashboard.sql that NOBODY has applied — and it depends on bb_70_journey.sql,
// which is also a draft — so `npm run db:types` cannot have seen it and the generated Database type does not
// carry its name. The cast lives here once, the way installments/rpc.ts and reservations/read.tsx each keep
// one. When both drafts are applied: run `npm run db:types`, replace draftRpc() with supabase.rpc(), delete
// the cast. The types below stay — they describe jsonb the function builds, and no generator can infer that.
//
// NULL IS AN ANSWER, NOT A FAILURE TO REPORT AS ZERO. Two different nulls live here and they mean different
// things:
//   · readFunnel() returns null — the read did not happen. The drafts are not applied, or the reader is not
//     an admin. The screen draws no funnel at all rather than a shape made of zeros.
//   · a stage's `at`/`reached` is null — the read happened and NO FACT IN THIS DATABASE can prove that
//     stage. bb_70 marks two that way: «مؤهَّل», because public.contact_outcome carries no value meaning
//     «مؤهل للزيارة», and «موعد العقد محدد», because §19's closing appointment has no table. The screen
//     draws «—» and prints the stage's own `factAr` underneath. «0 مؤهَّل» would read as a statement about
//     the business; it is a statement about a missing column.
// Neither null is ever coalesced to 0 on the way through.

import "server-only";

import type { JourneyStageKey } from "@/lib/journey";
import type { createClient } from "@/lib/supabase/server";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

type RpcFailure = { message: string; code?: string };
type RpcResult = { data: unknown; error: RpcFailure | null };
type DraftRpc = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;

/**
 * THE CONTRACT WITH THE SQL DRAFT, copied from its own `create or replace function` line.
 *
 *   admin_funnel_stats() → jsonb
 *       No arguments: it is the whole company's funnel at one moment. A date filter on it would be a filter
 *       on PEOPLE rather than on cohorts, and would read as a conversion rate it is not.
 *       Gated by app.is_admin() and nothing else — it counts every file in the company, so it cannot ride
 *       on app.can_see_person the way the list screens do. The page checks ADMIN_ROLES before calling.
 */
function draftRpc(supabase: StaffClient, name: "admin_funnel_stats"): Promise<RpcResult> {
  return (supabase.rpc as unknown as DraftRpc).call(supabase, name, {});
}

export type FunnelStage = {
  /** bb_70's stable key. Typed against src/lib/journey.ts so a spine change is a compiler error, not a blank row. */
  key: JourneyStageKey | string;
  /** The owner's Arabic, from settings journey.stage_<key>. The only word that may be printed. */
  label: string;
  /** The row of public.lead_statuses this stage maps onto. Several stages share one. */
  leadStage: string;
  /** False for the two stages nothing in this database can prove. Every figure below is then null. */
  hasFact: boolean;
  /** What proves this stage, or what would — bb_70's own sentence, so the screen writes none of its own. */
  factAr: string;
  /** The last two stages of the journey, where standing still is the point and not a loss. */
  isWin: boolean;
  /** How many files stand at this stage right now. Null when `hasFact` is false. */
  at: number | null;
  /** How many stand at it or beyond it: the suffix sum. Null when `hasFact` is false. */
  reached: number | null;
  /** `reached` as a percent of the top of the funnel: the width of the bar. */
  share: number | null;
  /** `at` on the same scale: the tail of that bar — the people who went no further. */
  atShare: number | null;
  /** The rest of the bar. atShare + passShare === share, by construction in SQL. */
  passShare: number | null;
  /** Of everyone who got this far, the share sitting here. */
  stuck: number | null;
  /** The stage holding the most files, wins and factless stages excluded. Exactly one is true. */
  isBlock: boolean;
};

export type FunnelTrees = {
  total: number;
  totalLabel: string;
  available: number;
  availableLabel: string;
  reserved: number;
  reservedLabel: string;
  sold: number;
  soldLabel: string;
};

export type Funnel = {
  /** Every person on file, in the funnel or out of it. */
  peopleTotal: number;
  /** Everyone the funnel counts: peopleTotal minus the files a human parked. */
  inFunnel: number;
  /** Files whose dropdown disagrees with their facts. Counted, never silently reconciled. */
  mismatch: number;
  left: {
    total: number;
    /** Parked files that nonetheless hold trees, a hold or a contract. Somebody's mistake. */
    conflicts: number;
    /** The breakdown in the owner's own status names, from public.lead_statuses. */
    byStatus: { label: string; count: number }[];
  };
  stages: FunnelStage[];
  trees: FunnelTrees;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** A count that must be a number. Anything else is 0 — only fields SQL always fills are read this way. */
const int = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0);

/** A count that is allowed to be absent. Null survives; it is never turned into a zero. */
const maybeInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;

const text = (value: unknown, fallback = ""): string => (typeof value === "string" && value !== "" ? value : fallback);

function parseStage(entry: unknown): FunnelStage | null {
  const row = asRecord(entry);
  const key = row ? text(row.key) : "";
  if (!row || key === "") return null;

  return {
    key,
    // The key as a last resort, never an Arabic word written here: a missing label is a missing setting,
    // and showing its key is how the owner finds out which box to fill.
    label: text(row.label, key),
    leadStage: text(row.lead_stage),
    hasFact: row.has_fact === true,
    factAr: text(row.fact_ar),
    isWin: row.is_win === true,
    at: maybeInt(row.at),
    reached: maybeInt(row.reached),
    share: maybeInt(row.share),
    atShare: maybeInt(row.at_share),
    passShare: maybeInt(row.pass_share),
    stuck: maybeInt(row.stuck),
    isBlock: row.is_block === true,
  };
}

function parseTrees(entry: unknown): FunnelTrees {
  const row = asRecord(entry) ?? {};
  // Every label is the owner's, read from the same offers.stock_* settings the offer page reads, so a
  // rename lands on every screen at once. The fallbacks exist only for a database that lost the setting.
  return {
    total: int(row.total),
    totalLabel: text(row.total_label, "إجمالي الزيتونات"),
    available: int(row.available),
    availableLabel: text(row.available_label, "المتاحة"),
    reserved: int(row.reserved),
    reservedLabel: text(row.reserved_label, "المحجوزة"),
    sold: int(row.sold),
    soldLabel: text(row.sold_label, "المباعة"),
  };
}

/** {«مغلق»: 3, «غير مهتم حالياً»: 1} → rows, biggest first. The names are the owner's, from lead_statuses. */
function parseByStatus(entry: unknown): { label: string; count: number }[] {
  const row = asRecord(entry);
  if (!row) return [];
  return Object.entries(row)
    .map(([label, value]) => ({ label, count: int(value) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * The funnel and the tree counts, in one answer so no two figures on the screen come from two moments.
 *
 * Null means the read did not happen. The screen then draws no funnel at all rather than a shape made of
 * zeros: «0 زيتونة محجوزة» reads as a statement about the business, not as a read that never happened.
 */
export async function readFunnel(supabase: StaffClient): Promise<Funnel | null> {
  const { data, error } = await draftRpc(supabase, "admin_funnel_stats");
  if (error || !data) return null;

  const payload = asRecord(data);
  if (!payload) return null;

  const stages = Array.isArray(payload.stages)
    ? payload.stages.flatMap((entry) => {
        const stage = parseStage(entry);
        return stage ? [stage] : [];
      })
    : [];
  // A spine with no stages is a payload this screen cannot draw; say nothing rather than draw an empty one.
  if (stages.length === 0) return null;

  const left = asRecord(payload.left_funnel) ?? {};
  return {
    peopleTotal: int(payload.people_total),
    inFunnel: int(payload.in_funnel),
    mismatch: int(payload.mismatch),
    left: {
      total: int(left.total),
      conflicts: int(left.conflicts),
      byStatus: parseByStatus(left.by_status),
    },
    stages,
    trees: parseTrees(payload.trees),
  };
}
