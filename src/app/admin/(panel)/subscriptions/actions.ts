"use server";

// The three acts of الاشتراك السنوي. Each one calls a security-definer RPC that checks the role AGAIN in SQL,
// applies the client-file rule on top of it (app.can_see_person), and writes its own audit row (§51).
//
// NOT ONE AMOUNT IS COMPUTED HERE. The annual fee, the total and the package are all decided in Postgres,
// from the offer's own pricing rule, and frozen at creation. That is the whole point of the module: the
// visitor is quoted «معاليم الصيانة والتقليم في العام» on the offer page, and the subscription must bill that
// same figure and no other. A total assembled in TypeScript would be a second opinion about a number the
// client has already been shown.
//
// THE ROLES:
//   createSubscription ·        PRICE_ROLES — app.can_price(). Report v3 §53 puts every price with Finance
//   setSubscriptionStatus       and Admin, and both the amount and «مخلّص» are money. The database narrows it
//                               further with app.can_see_person: nobody writes into a file they may not see.
//   requestSubscriptionService  CRM_READ_ROLES — recording that a client ASKED for a service is CRM work, not
//                               pricing. It creates a line with status «requested» and no commitment, which
//                               is exactly report v3 §33's «الخدمات المطلوبة».
//
// THE REASON IS NEVER VALIDATED HERE — audit.reason_min_length is the single authority and the owner set it
// to 0. See the same note in ../agri/actions.ts.

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { CRM_READ_ROLES, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { agriErrorMessage, isKnownAgriError } from "../agri/pending-errors";
import { callPending, type RpcFailure } from "../agri/read";
import { dinarsToMillimes, textValue, wholeNumber } from "../pricing/form-values";

const PAGE = "/admin/subscriptions";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STALE: ActionResult = { ok: false, message: "هذا الاشتراك لم يعد موجوداً. حدّث الصفحة وحاول مرة أخرى." };

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function rpcFailure(error: RpcFailure): ActionResult {
  if (isKnownAgriError(error.message)) return fail(agriErrorMessage(error.message));
  if (error.code === "42501") return fail(agriErrorMessage("forbidden"));
  if (error.code === "42883" || /does not exist/i.test(error.message)) {
    return fail(
      "وحدة الاشتراك السنوي مازالت ما تركّبتش في قاعدة البيانات، فما ينجّم يتسجّل شيء. المطوّر يطبّق ملف الترحيل الخاص بيها، ثم الشاشة تخدم كيما هي.",
    );
  }
  return fail("تعذّر الحفظ ولم يتغيّر شيء. حدّث الصفحة وتحقّق من القيم، ثم حاول مرة أخرى.");
}

function readReason(formData: FormData): string {
  return textValue(formData, "reason", 1000) || "";
}

export async function createSubscription(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);

  const projectId = textValue(formData, "project_id", 40);
  const personId = textValue(formData, "person_id", 40);
  if (!UUID.test(projectId)) return fail("اختر العرض من القائمة.");
  if (!UUID.test(personId)) return fail("اختر الحريف من القائمة.");

  // Left empty, the database counts the trees this client actually owns in this offer. A number typed here
  // overrides it, for the client whose contract was signed on paper before the rows were marked sold.
  const trees = wholeNumber(formData.get("tree_count"), 1_000_000);
  if (trees === undefined) return fail("اكتب عدد الزيتونات بالأرقام، ولا خلّي الخانة فارغة باش يتحسبوا وحدهم.");

  // Same for the fee: empty means «the offer's own annual fee», which is what the visitor was quoted. A
  // figure typed here is recorded as «مبلغ مكتوب باليد» so it is never mistaken for the offer's price.
  const fee = dinarsToMillimes(formData.get("fee_per_tree_millimes"));
  if (fee === undefined) return fail("اكتب المعاليم السنوية للزيتونة بالدينار، ولا خلّي الخانة فارغة.");

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_create_subscription", {
    p: {
      project_id: projectId,
      person_id: personId,
      ...(trees === null ? {} : { tree_count: trees }),
      ...(fee === null ? {} : { fee_per_tree_millimes: fee }),
      note: textValue(formData, "note", 2000) || null,
    },
    p_reason: readReason(formData),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تم تسجيل الاشتراك كمسوّدة. بدّل حالته لـ«نشيط» كي يمضي الحريف." };
}

/**
 * §36 names Status and Payment as two attributes, and they move separately here for the same reason they are
 * two columns: an active subscription that has not been paid is one fact about the paperwork and another
 * about the money, and either can change without the other.
 */
export async function setSubscriptionStatus(
  subscriptionId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!UUID.test(subscriptionId)) return STALE;

  const status = textValue(formData, "status", 20);
  const payment = textValue(formData, "payment_status", 20);
  if (status && !["draft", "active", "declined", "ended", "cancelled"].includes(status)) {
    return fail(agriErrorMessage("invalid_subscription_status"));
  }
  if (payment && !["unpaid", "partial", "paid"].includes(payment)) {
    return fail(agriErrorMessage("invalid_payment_status"));
  }
  if (!status && !payment) return fail("ما بدّلت حتى حاجة. اختر حالة الاشتراك ولا حالة الخلاص.");

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_set_subscription_status", {
    p_id: subscriptionId,
    p_status: status || null,
    p_payment: payment || null,
    p_reason: readReason(formData),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تم تحديث الاشتراك." };
}

/** report v3 §33's «الخدمات المطلوبة»: the client asked for a service on top of their package. */
export async function requestSubscriptionService(
  subscriptionId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);
  if (!UUID.test(subscriptionId)) return STALE;

  const serviceId = textValue(formData, "service_option_id", 40);
  if (!UUID.test(serviceId)) return fail(agriErrorMessage("invalid_service"));

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_request_subscription_service", {
    p_subscription: subscriptionId,
    p_service: serviceId,
    p_reason: readReason(formData),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تسجّل مطلب الخدمة. يلزم يتسعّر ويتبرمج." };
}
