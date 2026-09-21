// The reads of both stage 4 modules, in one place, so no screen invents a query of its own.
//
// THE CAST, AND WHEN IT GOES. public.project_service_terms, public.agri_operations, public.subscriptions and
// their functions are still a DRAFT in supabase/pending/bb_40_agri_services.sql, so none of the names below is
// in the generated src/lib/supabase/database.types.ts yet. One narrow cast per call site would be six copies
// of the same lie; `callPending` is the single copy, and the day the migration is applied and
// `npm run db:types` has run, deleting it and calling supabase.rpc(…) directly is a mechanical change with
// the compiler as a guide. (The same helper, for the same reason, lives in the reservations module — its
// tables are a draft too. They are kept separate on purpose: two teams are editing this repository right now
// and neither should have to touch the other's files to ship.)
//
// UNTIL THE DRAFT IS APPLIED, every call below fails and every read returns null. That is not an error state
// to hide: the screens say, in one Arabic line, that the module is not installed in the database yet. A page
// that showed zeros instead would be stating facts nobody has measured.

import "server-only";

import type { createClient } from "@/lib/supabase/server";

import {
  parseOfferServices,
  parseOperationList,
  parsePreview,
  parseSubscriptionList,
  type OfferServices,
  type OperationFilter,
  type OperationList,
  type SubscriptionFilter,
  type SubscriptionList,
  type SubscriptionPreview,
} from "./agri-model";

export type StaffClient = Awaited<ReturnType<typeof createClient>>;

export type RpcFailure = { message: string; code?: string };
export type RpcResult = { data: unknown; error: RpcFailure | null };
type PendingRpc = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;

/** Calls an RPC the generated types do not know about yet. See the note at the top of this file. */
export function callPending(supabase: StaffClient, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  return (supabase.rpc as unknown as PendingRpc).call(supabase, name, args);
}

/**
 * The grove work log, with the three counts above it.
 *
 * A failed read is reported as null rather than as an empty list: «0 عملية» and «the module is not installed»
 * are different facts, and a screen that cannot tell them apart will eventually tell the owner the grove was
 * never ploughed.
 */
export async function readOperations(
  supabase: StaffClient,
  filter: OperationFilter,
  { projectId = null }: { projectId?: string | null } = {},
): Promise<OperationList | null> {
  const { data, error } = await callPending(supabase, "staff_agri_operations", {
    p_project: projectId,
    p_filter: filter,
    p_limit: null,
  });
  if (error || !data) return null;
  return parseOperationList(data);
}

/** One offer's services: the price, the frequency, the provider, and what is owed against that frequency. */
export async function readOfferServices(supabase: StaffClient, projectId: string): Promise<OfferServices | null> {
  const { data, error } = await callPending(supabase, "staff_offer_services", { p_project: projectId });
  if (error || !data) return null;
  return parseOfferServices(data);
}

/** Several offers at once, in the order they were given. An offer whose read fails is left out, not faked. */
export async function readOfferServicesMany(
  supabase: StaffClient,
  projectIds: string[],
): Promise<OfferServices[]> {
  const payloads = await Promise.all(projectIds.map((id) => readOfferServices(supabase, id)));
  return payloads.filter((row): row is OfferServices => row !== null);
}

/** Who pays for what this season, and who has not paid. */
export async function readSubscriptions(
  supabase: StaffClient,
  filter: SubscriptionFilter,
  { projectId = null }: { projectId?: string | null } = {},
): Promise<SubscriptionList | null> {
  const { data, error } = await callPending(supabase, "staff_subscriptions", {
    p_filter: filter,
    p_project: projectId,
    p_limit: null,
  });
  if (error || !data) return null;
  return parseSubscriptionList(data);
}

/**
 * What a subscription WOULD cost this person on this offer, before anyone writes one. The writer recomputes
 * exactly the same figures, so the form can never promise an amount the write would not honour.
 */
export async function readSubscriptionPreview(
  supabase: StaffClient,
  projectId: string,
  personId: string,
): Promise<SubscriptionPreview | null> {
  const { data, error } = await callPending(supabase, "staff_subscription_preview", {
    p_project: projectId,
    p_person: personId,
  });
  if (error || !data) return null;
  return parsePreview(data);
}
