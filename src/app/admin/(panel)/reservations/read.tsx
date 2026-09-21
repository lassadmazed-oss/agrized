// The three reads of the reservations module, in one place, so no screen invents a query of its own.
//
// Everything a reservation screen shows is decided in Postgres (app.reservation_payload, staff_reservations):
// what is owed, what is left, whether the deadline has passed, how many days remain, and the Arabic of the
// status. These functions call the RPC, parse the jsonb, and hand back a shape — they compute nothing.
//
// THE CAST, AND WHEN IT GOES. public.reservations and its eight functions are still a DRAFT in
// supabase/pending/bb_20_reservations.sql, so none of the names below is in the generated
// src/lib/supabase/database.types.ts yet. One narrow, named cast per call site would be five copies of the
// same lie; `callPending` is the single copy, and the day the migration is applied and `npm run db:types` has
// run, deleting it and calling supabase.rpc(…) directly is a mechanical change with the compiler as a guide.

import "server-only";

import type { createClient } from "@/lib/supabase/server";

import {
  parseFilter,
  parseList,
  parseReservation,
  parseTerms,
  type OfferTerms,
  type Reservation,
  type ReservationFilter,
  type ReservationList,
} from "./reservation-model";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

type RpcFailure = { message: string; code?: string };
type RpcResult = { data: unknown; error: RpcFailure | null };
type PendingRpc = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;

/** Calls an RPC the generated types do not know about yet. See the note at the top of this file. */
export function callPending(supabase: StaffClient, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  return (supabase.rpc as unknown as PendingRpc).call(supabase, name, args);
}

/**
 * The Back Office list, with the counts that go above it.
 *
 * A failed read is reported as an empty, module-off list rather than as zeros that look like facts: a screen
 * saying «0 حجز قربت تنتهي» when the read failed is worse than one saying nothing.
 */
export async function readReservations(
  supabase: StaffClient,
  filter: ReservationFilter,
  { projectId = null, limit = 100 }: { projectId?: string | null; limit?: number } = {},
): Promise<ReservationList | null> {
  const { data, error } = await callPending(supabase, "staff_reservations", {
    p_filter: filter,
    p_project: projectId,
    p_limit: limit,
  });
  if (error || !data) return null;
  return parseList(data);
}

/** One reservation in full. Null when it does not exist, or the reader may not see its file. */
export async function readReservation(supabase: StaffClient, reservationId: string): Promise<Reservation | null> {
  const { data, error } = await callPending(supabase, "staff_reservation", { p_reservation: reservationId });
  if (error || !data) return null;
  return parseReservation(data);
}

export type PersonReservations = {
  moduleState: "disabled" | "internal" | "public";
  reservations: Reservation[];
  /** One entry per offer this person has a demand on: what a hold would cost and how long it would last. */
  offerTerms: Map<string, OfferTerms>;
};

/** Everything one client file needs: their reservations, and the terms of the offers they asked about. */
export async function readPersonReservations(
  supabase: StaffClient,
  personId: string,
): Promise<PersonReservations | null> {
  const { data, error } = await callPending(supabase, "staff_person_reservations", { p_person: personId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;

  const payload = data as Record<string, unknown>;
  const state = payload.module_state;
  const rows = Array.isArray(payload.reservations) ? payload.reservations : [];
  const terms = Array.isArray(payload.offer_terms) ? payload.offer_terms : [];

  return {
    moduleState: state === "public" || state === "internal" ? state : "disabled",
    reservations: rows.flatMap((entry) => {
      const parsed = parseReservation(entry);
      return parsed ? [parsed] : [];
    }),
    offerTerms: new Map(
      terms.flatMap((entry) => {
        const parsed = parseTerms(entry);
        return parsed ? ([[parsed.projectId, parsed]] as [string, OfferTerms][]) : [];
      }),
    ),
  };
}

/** What one offer asks for a hold. Used by the offer card; the reservation RPC reads the same function in SQL. */
export async function readOfferTerms(supabase: StaffClient, projectId: string): Promise<OfferTerms | null> {
  const { data, error } = await callPending(supabase, "staff_reservation_terms", { p_project: projectId });
  if (error || !data) return null;
  return parseTerms(data);
}

export { parseFilter };
