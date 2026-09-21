import "server-only";

// The two reads of the visits module, in one place: the board and one client's visits.
//
// WHY A CAST LIVES HERE AND NOWHERE ELSE. public.visits and its RPCs arrive with
// supabase/pending/bb_21_visits.sql, which is a DRAFT — it has not been applied, so `npm run db:types` has not
// regenerated src/lib/supabase/database.types.ts and supabase.rpc() does not know these three names yet. Rather
// than scatter `as never` through two screens, the untyped call is made once, here, and everything above it
// reads the typed shapes of ./visit-model. The day the migration is applied and the types are regenerated, the
// cast in callVisitRpc is the only line to delete.
//
// Nothing here computes anything. The grouping by day, the counts, the booking window and every Arabic word
// arrive from Postgres (app.visit_terms, app.visit_status_label, app.visit_payload); these functions only ask.

import { createClient } from "@/lib/supabase/server";

import type { PersonVisits, VisitBoard } from "./visit-model";

type RpcAnswer = { data: unknown; error: { message: string; code?: string } | null };

async function callVisitRpc(name: string, args: Record<string, unknown>): Promise<RpcAnswer> {
  const supabase = await createClient();
  const rpc = supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<RpcAnswer>;
  return rpc(name, args);
}

export type BoardFilters = {
  from?: string;
  to?: string;
  status?: string;
  projectId?: string;
  assignedTo?: string;
};

/**
 * The Back Office calendar. Returns null when the read fails — the page then says the module is not applied
 * yet rather than crashing, because the most likely reason on this machine is exactly that.
 */
export async function readVisitBoard(filters: BoardFilters): Promise<VisitBoard | null> {
  const { data, error } = await callVisitRpc("staff_visit_board", {
    p: {
      from: filters.from ?? null,
      to: filters.to ?? null,
      status: filters.status ?? null,
      project_id: filters.projectId ?? null,
      assigned_to: filters.assignedTo ?? null,
      limit: 200,
    },
  });
  if (error || !data || typeof data !== "object") return null;
  return data as VisitBoard;
}

/** One client's visits, the offers a visit can be booked on, and their unanswered wishes. */
export async function readPersonVisits(personId: string): Promise<PersonVisits | null> {
  const { data, error } = await callVisitRpc("staff_person_visits", { p_person: personId });
  if (error || !data || typeof data !== "object") return null;
  return data as PersonVisits;
}
