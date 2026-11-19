import "server-only";

// The four reads behind «الميدان». Each is one security-definer RPC (0175) that checks the reader again in
// Postgres; nothing here filters, counts or computes a date.

import { createClient } from "@/lib/supabase/server";

import type { Candidates, FieldBoard, FieldFile, FieldReceipt } from "./field-model";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const supabase = await createClient();
  const call = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const { data, error } = await call(fn, args);
  if (error) {
    console.error(`${fn} failed`, error.message);
    return { data: null, error: error.message };
  }
  return { data: data as T, error: null };
}

/** One commercial's list. An administrator may pass someone else's id; anybody else gets their own. */
export function readBoard(userId?: string) {
  return rpc<FieldBoard>("field_board", userId ? { p_user: userId } : {});
}

export function readFile(personId: string) {
  return rpc<FieldFile>("field_person", { p_person: personId });
}

export function readReceipt(paymentId: string) {
  return rpc<FieldReceipt>("field_receipt", { p_payment: paymentId });
}

export function readCandidates() {
  return rpc<Candidates>("admin_field_candidates");
}
