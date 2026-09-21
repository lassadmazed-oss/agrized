import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * الصابة والجني — the shape of what the database hands back, and the one cast that gets it here.
 *
 * supabase/pending/bb_41_harvest.sql is a DRAFT: it is not applied, so `npm run db:types` cannot have seen
 * public.staff_harvest_overview and its five siblings, and the generated Database type does not carry them.
 * Rather than scatter `as never` over six call sites, the cast lives here once, narrowed to the one shape a
 * PostgREST RPC answers with. THE DAY THE MIGRATION IS APPLIED: run `npm run db:types`, replace harvestRpc()
 * with supabase.rpc(), and delete this file's cast — the payload types below stay, because they describe the
 * jsonb the functions build and no generator can infer that.
 */

export type RpcError = { message: string; code?: string };
export type RpcResult<T> = { data: T | null; error: RpcError | null };

type LooseRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;

export async function harvestRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const supabase = await createClient();
  const call = (supabase.rpc as unknown as LooseRpc).bind(supabase);
  const { data, error } = await call(fn, args);
  return { data: (data ?? null) as T | null, error };
}

/** The five states of public.harvest_season_status. The Arabic is never here: it arrives as status_label_ar. */
export type HarvestStatus = "planned" | "harvesting" | "closed" | "settled" | "cancelled";

/** How the owner's answer reached the system (public.harvest_choice_source). */
export type ChoiceSource = "client" | "staff" | "auto";

/**
 * One season, as app.harvest_season_payload builds it. The two money keys are ABSENT — not null — for a reader
 * without app.can_price(), which is why they are optional here: `"harvest_cost_millimes" in season` is the
 * honest test, and `?? 0` would turn «you may not see this» into «it is zero».
 */
export type HarvestSeason = {
  id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  season_year: number;
  label_ar: string;
  status: HarvestStatus;
  status_label_ar: string;
  started_on: string | null;
  ended_on: string | null;
  choice_deadline: string | null;
  choice_closed: boolean;
  trees_harvested: number | null;
  trees_declared: number | null;
  trees_owned: number;
  holders: number;
  estimated_olives_kg: number | null;
  olives_kg: number | null;
  pressed_olives_kg: number | null;
  oil_litres: number | null;
  stored_oil_litres: number | null;
  sold_olives_kg: number | null;
  sold_oil_litres: number | null;
  note: string | null;
  settled_at: string | null;
  can_settle: boolean;
  shares_written: number;
  choices_recorded: number;
  harvest_cost_millimes?: number | null;
  sale_amount_millimes?: number | null;
};

/** One owner's line: the frozen share after settlement, or the same arithmetic live before it. */
export type HarvestShareRow = {
  person_id: string;
  person_name: string;
  trees_held: number;
  trees_harvested: number | null;
  olives_kg: number | null;
  oil_litres: number | null;
  pick_label_ar: string | null;
  outcome_label_ar: string | null;
  choice_source: ChoiceSource | null;
  counted_at?: string | null;
  /** The Arabic sentence that explains how the figure was computed (settings harvest.share_note). */
  note_ar: string | null;
};

export type HarvestOffer = {
  id: string;
  code: string;
  name: string;
  status: string;
  tree_count: number | null;
  trees_owned: number;
  pick_option_ids: string[];
  pick_default_id: string | null;
  outcome_option_ids: string[];
  outcome_default_id: string | null;
  seasons: number;
};

export type HarvestOverview = {
  current: HarvestSeason | null;
  seasons: HarvestSeason[];
  offers: HarvestOffer[];
  can_price: boolean;
  can_manage: boolean;
};

export type HarvestSeasonDetail = HarvestSeason & {
  shares: HarvestShareRow[];
  estimates: HarvestShareRow[];
  settled: boolean;
};
