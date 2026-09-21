// The three reads of the contracts module, in one place, so no screen invents a query of its own.
//
// Everything a contract screen shows is decided in Postgres (app.contract_payload, staff_contracts): the
// frozen plan, what has been paid, what is still owed, which instalment is next, how late it is and which
// rung of §31's ladder the file is on, and the Arabic of every status. These functions call the RPC, parse
// the jsonb and hand back a shape — they compute nothing.
//
// THE CAST, AND WHEN IT GOES. public.contracts, public.contract_installments and their functions do not exist
// yet: they are supabase/pending/bb_60_contracts_installments.sql, which the session owner applies, so none of
// the names below is in the generated src/lib/supabase/database.types.ts. Until `npm run db:types` has run
// against an applied migration there is no typed way to name them, and one narrow cast per call site would be
// three copies of the same lie. `callPending` is the single copy — the day the draft is applied and the types
// are regenerated, deleting it and calling supabase.rpc(…) directly is a mechanical change with the compiler
// as a guide, and the handover lists it as owed work rather than leaving it to be discovered.
//
// EVERY READ RETURNS NULL WHEN THE FUNCTION IS MISSING, and every screen says so in one line instead of
// drawing an empty list that reads as «this client has no contracts». Before the draft is applied that is the
// only honest thing on the screen.

import "server-only";

import type { createClient } from "@/lib/supabase/server";

import {
  parseContract,
  parseFilter,
  parseList,
  parsePersonContracts,
  type Contract,
  type ContractFilter,
  type ContractList,
  type PersonContracts,
} from "./contract-model";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

export type RpcFailure = { message: string; code?: string };
type RpcResult = { data: unknown; error: RpcFailure | null };
type PendingRpc = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;

/** Calls an RPC the generated types do not know about yet. See the note at the top of this file. */
export function callPending(supabase: StaffClient, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  return (supabase.rpc as unknown as PendingRpc).call(supabase, name, args);
}

/**
 * The queue, with the counts that go above it.
 *
 * A failed read is reported as null rather than as zeros that look like facts: a screen saying «0 عقد في حالة
 * حرجة» when the read failed is worse than one saying nothing. The ordering — what needs a human today, first
 * — is decided by staff_contracts and is not re-sorted here.
 */
export async function readContracts(
  supabase: StaffClient,
  filter: ContractFilter,
  { projectId = null, limit = 100 }: { projectId?: string | null; limit?: number } = {},
): Promise<ContractList | null> {
  const { data, error } = await callPending(supabase, "staff_contracts", {
    p_filter: filter,
    p_project: projectId,
    p_limit: limit,
  });
  if (error || !data) return null;
  return parseList(data);
}

/**
 * One contract in full, schedule included. Null when it does not exist, or the reader may not see its file
 * (app.can_see_person decides that, not this function).
 */
export async function readContract(supabase: StaffClient, contractId: string): Promise<Contract | null> {
  const { data, error } = await callPending(supabase, "staff_contract", { p_contract: contractId });
  if (error || !data) return null;
  return parseContract(data);
}

/**
 * Everything one client file needs: their contracts, the holds that could become one today, and the option
 * list the signing form offers. One call, because three would be three chances to disagree about which
 * reservations are convertible.
 */
export async function readPersonContracts(
  supabase: StaffClient,
  personId: string,
): Promise<PersonContracts | null> {
  const { data, error } = await callPending(supabase, "staff_person_contracts", { p_person: personId });
  if (error || !data) return null;
  return parsePersonContracts(data);
}

export { parseFilter };
