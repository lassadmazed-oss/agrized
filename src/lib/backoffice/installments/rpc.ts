import "server-only";

// The one read of «الأقساط», in one place, so no screen invents a query of its own.
//
// EVERYTHING IS DECIDED IN POSTGRES. app.contract_money works out what a line owes, what arrived against it,
// whether it is late and by how many days, and which rung of report v3 §31 the contract stands on;
// public.staff_installments picks the lines worth a human's attention and orders them. The function below
// calls the RPC, parses the jsonb and hands back a shape — it computes nothing, and the screens above it
// compute nothing either.
//
// EVERY SIGNATURE HERE WAS READ OFF supabase/pending/bb_60_contracts_installments.sql, not guessed. That
// matters more than it sounds: an earlier draft of this file described a staff_person_installments() and a
// three-argument staff_installments() that do not exist in the draft, and a call to a function PostgREST
// cannot resolve fails with PGRST202 in front of Finance and compiles perfectly.
//
// THE CAST, AND THE DAY IT GOES. public.contracts, public.contract_installments and the functions below are a
// DRAFT in supabase/pending/ that NOBODY has applied, so `npm run db:types` cannot have seen them and the
// generated Database type does not carry their names. The cast lives here once, not scattered over the call
// sites, and the argument map below names every argument of every call — so the compiler checks the half of
// the contract it can check while the other half is still on paper.
//
// WHEN THE DRAFT IS APPLIED: run `npm run db:types`, replace draftRpc() with supabase.rpc(), and delete the
// cast. The payload types in ./installment-model stay — they describe jsonb the functions build, and no
// generator can infer that.

import type { createClient } from "@/lib/supabase/server";

import { parseList, type InstallmentFilter, type InstallmentList } from "@/lib/backoffice/installments/model";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

export type RpcError = { message: string; code?: string };
type RpcResult = { data: unknown; error: RpcError | null };

/**
 * THE CONTRACT WITH THE SQL DRAFT, copied from its own `create or replace function` lines.
 *
 *   staff_installments(p_filter text, p_limit integer) → jsonb
 *       The Finance queue, across every live contract. Returns module_state · filter · limit · grace_days ·
 *       reminder_days · late1_missed · late2_missed · matched · capped · counts{attention,due_soon,overdue,
 *       critical,unpaid,all} · rows[]. Each row is a contract identity plus ONE line of app.contract_money.
 *       Rows are narrowed by app.can_see_person in SQL, so a commercial reads their own files and nobody
 *       else's. There is NO p_person argument and no per-person twin of this function: a client's own plan is
 *       read through staff_person_contracts, which the contract card on their file already calls.
 *       NO MODULE GATE — the Back Office is where a module is prepared before it is published.
 *
 *   staff_record_installment(p_contract uuid, p_installment uuid, p_kind text, p_amount_millimes bigint,
 *                            p_method uuid, p_received_at timestamptz, p_reference text, p_note text,
 *                            p_reason text) → jsonb
 *       Writes ONE public.payments row with kind='installment' (§30, §59) against that contract, labelled with
 *       the line Finance was collecting — never a second money table, because app.zitounti_payments (0068)
 *       already reads public.payments and would silently miss every instalment. Returns the whole contract
 *       payload. Gated by app.assert_installments_open(), app.can_record_money() and app.can_see_person().
 *
 *       p_amount_millimes IS NOT NULL-ABLE: the draft raises invalid_payment_amount for null or ≤ 0. The
 *       screen therefore sends the figure Postgres itself reported as left on the line. That is safe against
 *       a stale remainder because the balances are a WATERFALL over the live payments, not a per-line flag:
 *       money beyond what this line owes flows to the next one, and only a total beyond the whole schedule is
 *       refused (amount_over_due). Nothing is ever silently absorbed and nothing is ever over-collected.
 *
 *   staff_void_payment(p_payment uuid, p_reason text) → jsonb
 *       ALREADY EXISTS (0063); the draft replaces it, keeping the reservation branch byte-for-byte and adding
 *       a contract branch. Its return value is not read here — a reservation payload is not what a voided
 *       instalment should answer with, and its shape depends on which row was voided. The screen re-reads
 *       from the server instead, which is the honest way to show what the void left behind.
 */
type DraftRpcs = {
  staff_installments: { p_filter: InstallmentFilter; p_limit: number };
  staff_record_installment: {
    p_contract: string;
    p_installment: string | null;
    p_kind: "installment" | "down_payment";
    p_amount_millimes: number;
    p_method: string | null;
    p_received_at: string | null;
    p_reference: string | null;
    p_note: string | null;
    p_reason: string;
  };
  staff_void_payment: { p_payment: string; p_reason: string };
};

type LooseRpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

/** Calls an RPC the generated types do not know about yet, with its arguments named. See the note above. */
export function draftRpc<K extends keyof DraftRpcs>(
  supabase: StaffClient,
  fn: K,
  args: DraftRpcs[K],
): Promise<RpcResult> {
  return (supabase.rpc as unknown as LooseRpc).call(supabase, fn, args);
}

/**
 * The Finance queue, with the counts that go above it.
 *
 * A failed read is reported as null rather than as zeros that look like facts: a screen saying «0 قسط متأخر»
 * when the read failed is worse than one saying nothing. Before the draft is applied there is no table to
 * read at all, and that is the state this returns today.
 */
export async function readInstallments(
  supabase: StaffClient,
  filter: InstallmentFilter,
  { limit = 100 }: { limit?: number } = {},
): Promise<InstallmentList | null> {
  const { data, error } = await draftRpc(supabase, "staff_installments", {
    p_filter: filter,
    p_limit: limit,
  });
  if (error || !data) return null;
  return parseList(data);
}
