"use server";

// The two acts of §11 → §12: take the trees the client actually chose, by their numbers, and open the
// reservation on them.
//
// NOTHING HERE PICKS A TREE, AND NOTHING HERE CHECKS WHETHER ONE IS FREE. Both happen in Postgres, inside one
// transaction, under FOR UPDATE SKIP LOCKED, because two commercials on two phones in the same grove WILL tap
// the same number. A pre-check in this file would be the textbook time-of-check-to-time-of-use bug, sitting
// exactly where the money is: it would read «متاحة», the other phone would take it, and this one would write
// the reservation anyway. So the only thing this file does about the race is carry the refusal back in words.
//
// THE REFUSAL IS NOT A DEAD END (§11: «النظام يأكّد في نفس اللحظة أنها مازالت متاحة»). When the chosen set has
// moved, the database raises `trees_taken` and puts, in the error's DETAIL, the numbers that went and a few
// that are still free. PostgREST hands DETAIL back as `details`, so the loser is told «زيتونة 125 و130 تحجزو
// توّا؛ 141 و142 و143 مازالوا فاضيين» instead of «تعذّرت العملية».
//
// THE ARABIC LINES ARE HERE AND NOT IN src/lib/errors.ts, following the precedent
// src/app/admin/(panel)/reservations/actions.ts set and documented: that file is shared and three sessions are
// writing in it at once. intakeErrorMessage() is consulted for every code the product already speaks
// (below_min_trees · invalid_tree_selection · offer_not_available · invalid_person · invalid_request ·
// forbidden · module_closed), and only the codes this act adds are answered locally. They are owed to
// errors.ts by whoever merges the batch, verbatim.

import { revalidatePath, updateTag } from "next/cache";

import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { PUBLIC_PROJECTS_TAG } from "@/lib/public-projects";
import { createClient } from "@/lib/supabase/server";

import { PLAN_MAX_SELECTION, type PickInput, type PickResult } from "../../projects/[id]/tree-plan-model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owed to src/lib/errors.ts. See the note at the head of this file. */
const PICK_MESSAGES: Record<string, string> = {
  trees_taken:
    "وحدة ولا أكثر من الزيتونات اللي اخترتها تحجزت قبل ما تثبّت. المخطط تحدّث توّا: شوف شنوّة مازال أخضر واختار البديل مع الحريف.",
  tree_not_in_offer:
    "رقم من الأرقام اللي اخترتها موش موجود في هذا العرض. تثبّت من الرقم المكتوب على الزيتونة، وتثبّت إلّي إنت في العرض الصحيح.",
  invalid_tree_numbers:
    "اختيار الأرقام موش صحيح: اختار من زيتونة وحدة إلى 1000 زيتونة، وكل رقم يكون رقم صحيح أكبر من صفر.",
  reservation_exists:
    "هذا المطلب عندو حجز مفتوح توّا. كمّل عليه من ملفّ الحريف — ما تعملش حجز ثاني على نفس المطلب.",
};

const MISSING_RPC =
  "وحدة اختيار الزيتونات بأرقامها مازالت ما تركّبتش في قاعدة البيانات. الملف موجود في supabase/pending/bb_71_tree_picking.sql وهو مسوّدة ما تطبّقتش. كلّم المسؤول باش يطبّقها، ومن بعد حدّث الصفحة.";

const FAILED = "تعذّرت العملية وما تبدّل حتى شيء. حدّث الصفحة وأعد المحاولة.";

type RpcFailure = { message: string; code?: string; details?: string | null };

/** The numbers the database named in its DETAIL, when it named any. Data, never a decision. */
function pickedApart(error: RpcFailure): { taken?: number[]; free?: number[] } {
  if (!error.details) return {};
  try {
    const parsed: unknown = JSON.parse(error.details);
    if (!parsed || typeof parsed !== "object") return {};
    const asSeqs = (value: unknown) =>
      Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n)).slice(0, 60) : undefined;
    const record = parsed as Record<string, unknown>;
    return { taken: asSeqs(record.taken), free: asSeqs(record.free) };
  } catch {
    return {};
  }
}

function failure(error: RpcFailure): PickResult {
  // PGRST202: PostgREST could not find the function — i.e. the draft is not applied on this database.
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    return { ok: false, message: MISSING_RPC };
  }

  const { taken, free } = pickedApart(error);
  const base =
    PICK_MESSAGES[error.message] ??
    (isKnownIntakeError(error.message)
      ? intakeErrorMessage(error.message)
      : error.code === "42501"
        ? intakeErrorMessage("forbidden")
        : FAILED);

  const said = [base];
  if (taken && taken.length > 0) said.push(`الزيتونات اللي راحت: ${taken.join(" · ")}.`);
  if (free && free.length > 0) said.push(`مازال فاضي قريب منها: ${free.join(" · ")}.`);

  return { ok: false, message: said.join(" "), taken, free };
}

function refuse(code: string): PickResult {
  return failure({ message: code });
}

/**
 * Everything a hold moves. Identical to the reservations module's own list, and for the same reason: the four
 * public counts (public_offer_stock) change the moment trees are taken, so a visitor must not read «12 متاحة»
 * from a cached page after ten of them were just chosen in a grove.
 */
function treesChanged(personId: string, projectId: string) {
  revalidatePath("/admin/desk/field", "layout");
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/visits");
  revalidatePath("/admin");
  revalidatePath("/admin/leads", "layout");
  revalidatePath(`/admin/leads/${personId}`);
  revalidatePath("/admin/projects", "layout");
  revalidatePath(`/admin/projects/${projectId}`);
  updateTag(PUBLIC_PROJECTS_TAG);
  revalidatePath("/projects", "layout");
}

/** The numbers, cleaned: distinct, whole, positive, in order, and bounded by the same cap the database uses. */
function cleanSeqs(input: readonly number[]): number[] | null {
  const seqs = [...new Set(input.filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b);
  if (seqs.length < 1 || seqs.length > PLAN_MAX_SELECTION) return null;
  return seqs;
}

function guard(input: PickInput): PickResult | null {
  if (!UUID.test(input.projectId)) return refuse("offer_not_available");
  if (!UUID.test(input.personId)) return refuse("invalid_person");
  if (input.requestId !== null && !UUID.test(input.requestId)) return refuse("invalid_request");
  if (cleanSeqs(input.seqs) === null) return refuse("invalid_tree_numbers");
  return null;
}

/**
 * §12 · «احجز وادفع العربون» — opens the reservation on the exact trees the client chose.
 *
 * One call, one transaction: the reservation row, the deposit due, the validity period and the conditions are
 * copied from the offer's own terms by app.open_reservation (the same half the count path has always used), and
 * the trees are taken by number. Either all of it happens or none of it does.
 *
 * The role check here is CRM_READ_ROLES so a refusal is a readable Arabic sentence; the database decides, and
 * it narrows further to app.can_see_person — a commercial acts inside their own file and nowhere else.
 */
export async function reserveChosenTrees(input: PickInput): Promise<PickResult> {
  await requireStaff(CRM_READ_ROLES);
  const bad = guard(input);
  if (bad) return bad;
  const seqs = cleanSeqs(input.seqs);
  if (!seqs) return refuse("invalid_tree_numbers");

  const supabase = await createClient();
  const { error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcFailure | null }>).call(supabase, "staff_create_reservation_from_trees", {
    p_project: input.projectId,
    p_person: input.personId,
    p_request: input.requestId,
    p_seqs: seqs,
    p_note: input.note?.slice(0, 1000) ?? null,
    p_reason: input.reason.slice(0, 1000),
  });
  if (error) return failure(error);

  treesChanged(input.personId, input.projectId);
  return {
    ok: true,
    message: "تحجزت.",
    // §12's hand-off: the EXISTING reservation screen on the client's file, where the عربون is recorded by
    // whoever holds the money role. Nothing is retyped there — it opens on this demand.
    href: `/admin/leads/${input.personId}${input.requestId ? `?reserve=${input.requestId}` : ""}#reservations`,
  };
}

/**
 * The same pick without the paperwork: hold the chosen trees for this client.
 *
 * It exists so a commercial in a field is never stuck when the `reservations` module is switched off — the
 * client still walked to ten trees and those ten must stop being sold to somebody else. It is the same
 * transaction minus the reservation row, and the trees can be turned into a reservation afterwards from the
 * client's file.
 */
export async function holdChosenTrees(input: PickInput): Promise<PickResult> {
  await requireStaff(CRM_READ_ROLES);
  const bad = guard(input);
  if (bad) return bad;
  const seqs = cleanSeqs(input.seqs);
  if (!seqs) return refuse("invalid_tree_numbers");

  const supabase = await createClient();
  const { error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcFailure | null }>).call(supabase, "staff_allocate_chosen_trees", {
    p_project: input.projectId,
    p_person: input.personId,
    p_request: input.requestId,
    p_seqs: seqs,
    p_state: "reserved",
    p_reason: input.reason.slice(0, 1000),
  });
  if (error) return failure(error);

  treesChanged(input.personId, input.projectId);
  return { ok: true, message: "تحجزت.", href: `/admin/leads/${input.personId}#reserve-trees` };
}
