"use server";

// The four acts of الـBack Office الفلاحي, each one a call to a security-definer RPC that checks the role
// AGAIN in SQL and writes its own audit row (§51). Nothing here computes a price, a due date or a status:
// the tariff, «what is overdue» and the Arabic of every state are decided in Postgres, and this file passes
// values and reports sentences.
//
// THE ROLES, and why they are checked here as well as in SQL:
//   saveOperation ·     AGRI_ROLES — app.can_manage_operations(): the agricultural manager runs the grove,
//   approveOperation    Finance and Admin may too. A commercial never writes an operation and never reads
//                       one: an operation names a tree code, never the person who holds it.
//   saveOfferService ·  PRICE_ROLES — app.can_price(). Report v3 §53 puts every price with Finance and
//   deleteOfferService  Admin, and a service tariff is a price the client is quoted.
// Checked here only so a refusal is a readable Arabic sentence instead of a Postgres error; the database
// decides, and it refuses the same call made any other way.
//
// THE REASON IS NEVER VALIDATED HERE. audit.reason_min_length is a setting and the owner turned it to 0 on
// 2026-09-19, so app.require_reason is the single authority: it accepts an empty reason today and raises
// reason_required the moment anyone sets it above zero, which agriErrorMessage already turns into Arabic. A
// second gate in TypeScript could only ever disagree with it — and once did, on the pricing screen.

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { PRICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { AGRI_ROLES } from "./agri-model";
import { agriErrorMessage, isKnownAgriError } from "./pending-errors";
import { callPending, type RpcFailure } from "./read";
import { dinarsToMillimes, textValue } from "../pricing/form-values";

const PAGE = "/admin/agri";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STALE: ActionResult = { ok: false, message: "هذا السطر لم يعد موجوداً. حدّث الصفحة وحاول مرة أخرى." };

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function rpcFailure(error: RpcFailure): ActionResult {
  if (isKnownAgriError(error.message)) return fail(agriErrorMessage(error.message));
  if (error.code === "42501") return fail(agriErrorMessage("forbidden"));
  // The draft is not applied yet: the function simply does not exist in this database.
  if (error.code === "42883" || /does not exist/i.test(error.message)) {
    return fail(
      "وحدة العمليات الفلاحية مازالت ما تركّبتش في قاعدة البيانات، فما ينجّم يتسجّل شيء. المطوّر يطبّق ملف الترحيل الخاص بيها، ثم الشاشة تخدم كيما هي.",
    );
  }
  return fail("تعذّر الحفظ ولم يتغيّر شيء. حدّث الصفحة وتحقّق من القيم، ثم حاول مرة أخرى.");
}

/** Whatever the writer typed, or nothing at all. The database decides whether nothing is allowed. */
function readReason(formData: FormData): string {
  return textValue(formData, "reason", 1000) || "";
}

/** "" → null, so an empty date box means «not known yet» and not «the first of January». */
function readDate(formData: FormData, name: string): string | null {
  const raw = textValue(formData, name, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

// ---------------------------------------------------------------------------
// The tariff: what one service costs in one offer (report v3 §36)
// ---------------------------------------------------------------------------

export async function saveOfferService(
  projectId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (projectId !== null && !UUID.test(projectId)) return STALE;

  const serviceId = textValue(formData, "service_option_id", 40);
  if (!UUID.test(serviceId)) return fail(agriErrorMessage("invalid_service"));

  const basis = textValue(formData, "basis", 20);
  if (!["per_tree", "per_season", "per_operation"].includes(basis)) {
    return fail(agriErrorMessage("invalid_service_basis"));
  }

  const inPackage = formData.get("in_annual_package") === "on";
  const amount = dinarsToMillimes(formData.get("amount_millimes"));
  if (amount === undefined) return fail(agriErrorMessage("invalid_service_amount"));
  // Said here as well as in SQL because it is the rule the whole module rests on, and a writer who sees it
  // before the save understands it better than one who sees it after.
  if (inPackage && (amount ?? 0) !== 0) return fail(agriErrorMessage("package_service_has_price"));

  const frequencyId = textValue(formData, "frequency_option_id", 40);
  const providerId = textValue(formData, "provider_option_id", 40);

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_save_offer_service", {
    p: {
      ...(textValue(formData, "id", 40) ? { id: textValue(formData, "id", 40) } : {}),
      project_id: projectId,
      service_option_id: serviceId,
      basis,
      amount_millimes: inPackage ? 0 : (amount ?? 0),
      in_annual_package: inPackage,
      frequency_option_id: UUID.test(frequencyId) ? frequencyId : null,
      provider_option_id: UUID.test(providerId) ? providerId : null,
      provider_note: textValue(formData, "provider_note", 300) || null,
      note: textValue(formData, "note", 500) || null,
      is_active: true,
    },
    p_reason: readReason(formData),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تم حفظ شروط الخدمة." };
}

export async function deleteOfferService(
  termsId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!UUID.test(termsId)) return STALE;

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_delete_offer_service", {
    p_id: termsId,
    p_reason: readReason(formData),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تم حذف شروط الخدمة." };
}

// ---------------------------------------------------------------------------
// The work: one agricultural act (cahier v2 §41)
// ---------------------------------------------------------------------------

export async function saveOperation(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(AGRI_ROLES);

  const projectId = textValue(formData, "project_id", 40);
  const serviceId = textValue(formData, "service_option_id", 40);
  if (!UUID.test(projectId)) return fail("اختر العرض من القائمة.");
  if (!UUID.test(serviceId)) return fail(agriErrorMessage("invalid_service"));

  const status = textValue(formData, "status", 20) || "planned";
  if (!["planned", "done", "cancelled"].includes(status)) return fail(agriErrorMessage("invalid_operation_status"));

  const executedOn = readDate(formData, "executed_on");
  if (status === "done" && !executedOn) return fail(agriErrorMessage("operation_date_required"));

  const cost = dinarsToMillimes(formData.get("cost_millimes"));
  if (cost === undefined) return fail(agriErrorMessage("invalid_operation_cost"));

  // «من الزيتونة رقم … للزيتونة رقم …» is left for a later pass: today a subset is written by pasting the
  // tree ids, and leaving the box empty means the whole grove, which is the normal case.
  const treeIds = textValue(formData, "tree_ids", 4000)
    .split(/[\s,]+/)
    .filter((value) => UUID.test(value));

  const providerId = textValue(formData, "provider_option_id", 40);

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_save_agri_operation", {
    p: {
      ...(textValue(formData, "id", 40) ? { id: textValue(formData, "id", 40) } : {}),
      project_id: projectId,
      service_option_id: serviceId,
      status,
      planned_on: readDate(formData, "planned_on"),
      executed_on: executedOn,
      cost_millimes: cost,
      provider_option_id: UUID.test(providerId) ? providerId : null,
      provider_note: textValue(formData, "provider_note", 300) || null,
      note: textValue(formData, "note", 2000) || null,
      ...(treeIds.length > 0 ? { tree_ids: treeIds } : {}),
    },
    p_reason: readReason(formData),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تم تسجيل العملية." };
}

/** v2 §41's «Approved by», as its own act: approving is not editing. */
export async function approveOperation(
  operationId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(AGRI_ROLES);
  if (!UUID.test(operationId)) return STALE;

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_approve_agri_operation", {
    p_id: operationId,
    p_reason: readReason(formData),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تمت المصادقة على العملية." };
}
