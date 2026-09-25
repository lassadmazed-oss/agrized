import "server-only";

// The three reads of the legal desk, in one place, so no screen invents a query of its own.
//
// Everything a legal screen shows is decided in Postgres (app.legal_file_payload, app.legal_checklist_state,
// app.legal_stage, staff_legal_queue): the stage, the tree numbers, the money, who handled the file at each
// step, everyone's notes merged, which papers are still missing and at which gate, and the Arabic of every
// label. These functions call the RPC, parse the jsonb and hand back a shape — they compute nothing.
//
// THE CAST, AND WHEN IT GOES. public.legal_files, public.legal_file_checks, public.legal_appointments,
// public.partners and their functions do not exist yet: they are
// supabase/pending/bb_72_partners_closing.sql, which the owner applies, so none of the names below is in the
// generated src/lib/supabase/database.types.ts. Until `npm run db:types` has run against an applied migration
// there is no typed way to name them, and one narrow cast per call site would be three copies of the same
// lie. `callPending` is the single copy — the day the draft is applied and the types are regenerated,
// deleting it and calling supabase.rpc(…) directly is a mechanical change with the compiler as a guide.
//
// `.bind(supabase)` is not decoration: supabase-js reads `this.rest` inside rpc(), so calling the method
// detached from its client throws «Cannot read properties of undefined (reading 'rest')» before a request is
// ever made. The visits board crashed the dashboard that exact way on 2026-09-21.
//
// EVERY READ RETURNS NULL WHEN THE FUNCTION IS MISSING OR REFUSES, and every screen says so in one line
// instead of drawing an empty list that reads as «ما فماش ملفات». Before the draft is applied that is the
// only honest thing on the screen.

import type { createClient } from "@/lib/supabase/server";

import {
  parseChecklistTemplate,
  parseLegalFile,
  parsePartners,
  parseQueue,
  type ChecklistTemplate,
  type LegalFile,
  type LegalQueue,
  type PartnerDirectory,
  type QueueFilter,
} from "./legal-model";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

export type RpcFailure = { message: string; code?: string; details?: string | null };
type RpcResult = { data: unknown; error: RpcFailure | null };
type PendingRpc = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;

/** Calls an RPC the generated types do not know about yet. See the note at the top of this file. */
export function callPending(
  supabase: StaffClient,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const rpc = supabase.rpc.bind(supabase) as unknown as PendingRpc;
  return rpc(name, args);
}

/** True when the refusal is «this migration is not applied», which deserves its own sentence on screen. */
export function isMissingModule(error: RpcFailure | null): boolean {
  return Boolean(error && /does not exist/i.test(error.message));
}

/**
 * §16's queue, with the counts that go above it.
 *
 * A failed read is reported as null rather than as zeros that look like facts: a screen saying «0 ملف مستنّي»
 * when the read failed is worse than one saying nothing. The ordering — an appointment first, then a file
 * nobody has opened — is decided by staff_legal_queue and is not re-sorted here.
 */
export async function readLegalQueue(
  supabase: StaffClient,
  filter: QueueFilter,
  { projectId = null, limit = 100 }: { projectId?: string | null; limit?: number } = {},
): Promise<LegalQueue | null> {
  const { data, error } = await callPending(supabase, "staff_legal_queue", {
    p_filter: filter,
    p_project: projectId,
    p_limit: limit,
  });
  if (error || !data) return null;
  return parseQueue(data);
}

/**
 * One legal file in full (§17). Null when it does not exist, or the reader may not see the client's file —
 * app.can_see_person decides that, not this function, and the page answers both with a 404 so that naming a
 * file a reader may not open never leaks that it exists.
 */
export async function readLegalFile(
  supabase: StaffClient,
  reservationId: string,
): Promise<LegalFile | null> {
  const { data, error } = await callPending(supabase, "staff_legal_file", { p_reservation: reservationId });
  if (error || !data) return null;
  return parseLegalFile(data);
}

/**
 * §20's template — the owner's list, as opposed to the copy a file carries.
 *
 * `canEdit` comes from app.is_admin() in the RPC, not from a role list here, so the screen and the database
 * agree about who may change a rule.
 */
export async function readChecklistTemplate(
  supabase: StaffClient,
  { includeInactive = true }: { includeInactive?: boolean } = {},
): Promise<ChecklistTemplate | null> {
  const { data, error } = await callPending(supabase, "staff_legal_checklist_template", {
    p_include_inactive: includeInactive,
  });
  if (error || !data) return null;
  return parseChecklistTemplate(data);
}

/** §18's directory, with the owner's speciality list and the governorates beside it. */
export async function readPartners(
  supabase: StaffClient,
  {
    speciality = null,
    governorate = null,
    search = null,
    includeArchived = false,
  }: {
    speciality?: string | null;
    governorate?: number | null;
    search?: string | null;
    includeArchived?: boolean;
  } = {},
): Promise<PartnerDirectory | null> {
  const { data, error } = await callPending(supabase, "staff_partners", {
    p_speciality: speciality,
    p_governorate: governorate,
    p_search: search,
    p_include_archived: includeArchived,
  });
  if (error || !data) return null;
  return parsePartners(data);
}
