"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { dinarsToMillimes, percentToBp, textValue, wholeNumber } from "@/lib/backoffice/pricing/form-values";
import { referralErrorMessage } from "@/lib/backoffice/referrals";
import { normalizeReferralCode } from "@/lib/referral";
import { createClient } from "@/lib/supabase/server";

// Every write goes through a role-checked RPC of 0136 that keeps its reason in the audit log. The roles here
// are the same ones the SQL checks: the rule, the offers and a referrer correction are Admin's
// (app.is_admin); paying and stopping a commission is Finance's and Admin's (app.can_record_money).

const PAGE = "/admin/referrals";
const MAX_GENERATIONS = 10;

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

function rpcFailure(error: { message: string; code?: string }): ActionResult {
  if (error.code === "42501") return fail(referralErrorMessage("forbidden"));
  return fail(referralErrorMessage(error.message));
}

/** §6: the number of generations, an amount for each, per tree or per order, the cap and the minimum margin. */
export async function saveCommissionRule(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);

  const generations = wholeNumber(formData.get("generations"), MAX_GENERATIONS);
  if (typeof generations !== "number" || generations < 1) {
    return fail("اختار عدد الأجيال، من 1 حتى 10.");
  }
  const amounts: number[] = [];
  for (let generation = 1; generation <= generations; generation += 1) {
    const value = dinarsToMillimes(formData.get(`amount_${generation}`));
    if (typeof value !== "number") {
      return fail(`مبلغ الجيل ${generation} ناقص ولا غالط. اكتبو بالدينار، مثال: 100 ولا 12.5.`);
    }
    amounts.push(value);
  }
  const cap = dinarsToMillimes(formData.get("cap"));
  if (typeof cap !== "number" || cap <= 0) return fail(referralErrorMessage("invalid_commission_cap"));
  const margin = percentToBp(formData.get("min_margin"));
  if (typeof margin !== "number" || margin > 10000) return fail(referralErrorMessage("invalid_min_margin"));
  const basis = String(formData.get("basis") ?? "");
  if (basis !== "tree" && basis !== "order") return fail(referralErrorMessage("invalid_commission_basis"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_commission_rule", {
    p: {
      amounts_millimes: amounts,
      basis,
      cap_millimes: cap,
      min_margin_bp: margin,
      note: textValue(formData, "note", 1000),
      reason: textValue(formData, "reason", 1000),
    },
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "القاعدة الجديدة تسجّلت. تنطبق على المبيعات الجاية، والقديمة تبقى كيف ما هي." };
}

export async function setOfferReferral(
  projectId: string,
  enabled: boolean,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  if (!isUuid(projectId)) return fail(referralErrorMessage("project_not_found"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_set_offer_referral", {
    p_project: projectId,
    p_enabled: enabled,
    p_reason: textValue(formData, "reason", 1000),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: enabled ? "العرض ولّى يجيب كوميسيونات." : "العرض ما عادش يجيب كوميسيونات على المبيعات الجاية." };
}

/** Pays the chosen validated commissions of one person in one payout. */
export async function payCommissions(personId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!isUuid(personId)) return fail(referralErrorMessage("person_not_found"));

  const ids = formData.getAll("ids").map(String).filter(isUuid);
  if (ids.length === 0) return fail(referralErrorMessage("no_commission_selected"));
  const paidOn = textValue(formData, "paid_on", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return fail(referralErrorMessage("invalid_paid_on"));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_pay_commissions", {
    p_person: personId,
    p_ids: ids,
    p_paid_on: paidOn,
    p_method: textValue(formData, "method", 120),
    p_reference: textValue(formData, "reference", 200),
    p_reason: textValue(formData, "reason", 1000),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  const reference = (data as { reference_no?: string } | null)?.reference_no;
  return { ok: true, message: reference ? `الخلاص تسجّل تحت الرقم ${reference}.` : "الخلاص تسجّل." };
}

/** A human stops a commission that is not paid yet. A reason is required by the database. */
export async function cancelCommission(id: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!isUuid(id)) return fail(referralErrorMessage("commission_not_cancellable"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_cancel_commission", {
    p_id: id,
    p_reason: textValue(formData, "reason", 1000),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "الكوميسيون تلغات والسبب تسجّل." };
}

/** An admin's correction of who brought a client: the new parrain's code, or nothing to remove it. */
export async function setReferrer(personId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  if (!isUuid(personId)) return fail(referralErrorMessage("person_not_found"));

  const raw = textValue(formData, "referrer_code", 20);
  const supabase = await createClient();
  let referrerId: string | null = null;
  if (raw) {
    const code = normalizeReferralCode(raw);
    if (!code) return fail("الكود فيه من 6 حتى 12 حرف ورقم، بلا 0 ولا O ولا 1 ولا I ولا L. مثال: K7M2QX.");
    const { data: found } = await supabase.from("persons").select("id").eq("referral_code", code).maybeSingle();
    if (!found) return fail(referralErrorMessage("person_not_found"));
    referrerId = found.id;
  }

  const { error } = await supabase.rpc("staff_set_referrer", {
    p_person: personId,
    p_referrer: referrerId as string,
    p_reason: textValue(formData, "reason", 1000),
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/tree`);
  return { ok: true, message: referrerId ? "الـParrain تبدّل. الكوميسيونات القديمة تبقى كيف ما هي." : "الـParrain تنحّى." };
}
