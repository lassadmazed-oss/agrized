import "server-only";

// The two reads of the visits module, in one place: the board and one client's visits.
//
// WHY A CAST LIVES HERE AND NOWHERE ELSE. The untyped call is made once, here, and everything above it reads
// the typed shapes of ./visit-model rather than scattering `as never` through two screens.
//
// The reason the cast was written is gone: the draft it waited for landed as supabase/migrations/0064_visits.sql
// and is applied (verified against the database on 2026-09-21, alongside 0063 and 0065), and
// database.types.ts now carries staff_visit_board and staff_person_visits. What still needs the cast is only
// this helper's shape — it takes the function name as a plain `string`, and supabase.rpc() is overloaded on
// literal names. Give the two callers their literal names and the cast goes with the helper.
//
// Nothing here computes anything. The grouping by day, the counts, the booking window and every Arabic word
// arrive from Postgres (app.visit_terms, app.visit_status_label, app.visit_payload); these functions only ask.

import { createClient } from "@/lib/supabase/server";

import type { PersonVisits, VisitBoard } from "./visit-model";

type RpcAnswer = { data: unknown; error: { message: string; code?: string } | null };

async function callVisitRpc(name: string, args: Record<string, unknown>): Promise<RpcAnswer> {
  const supabase = await createClient();
  // `.bind(supabase)` is not decoration: supabase-js reads `this.rest` inside rpc(), so calling the method
  // detached from its client throws «Cannot read properties of undefined (reading 'rest')» before a request is
  // ever made. ./agri/read.ts and ./harvest/rpc.ts already bind theirs; these did not, and the visits board
  // crashed the dashboard the moment the owner switched the module on (2026-09-21).
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<RpcAnswer>;
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
