"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { PRICE_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import { dinarsToMillimes, metres, percentToBp, textValue, wholeNumber } from "./form-values";
import { NOTE_MAX_LENGTH } from "./types";

// Tree pricing addendum (docs/tree-area-and-cost.md): every value is a Back Office parameter, and every write
// goes through a role-checked RPC that stores the written reason in the audit log (§51).

const PAGE = "/admin/pricing";
const CODE = /^[a-z0-9][a-z0-9_]{1,40}$/;

const STALE: ActionResult = { ok: false, message: "هذا العنصر لم يعد موجوداً. حدّث الصفحة وحاول مرة أخرى." };
// The reason is no longer refused here. app.require_reason (0058) is the single authority: it accepts an empty
// reason while audit.reason_min_length is 0 — the owner turned the field off on 2026-09-19 — and raises
// reason_required the moment anyone sets it above zero, which intakeErrorMessage already turns into Arabic. A
// second gate in TypeScript could only ever disagree with it, and it did: the field was hidden and every save
// still failed with «سبب التغيير ناقص أو قصير جداً».

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

function rpcFailure(error: { message: string; code?: string }): ActionResult {
  if (isKnownIntakeError(error.message)) return fail(intakeErrorMessage(error.message));
  // Refused grant or unique violation that the RPC did not name itself.
  if (error.code === "42501") return fail(intakeErrorMessage("forbidden"));
  if (error.code === "23505") return fail(intakeErrorMessage("duplicate_code"));
  return fail("تعذّر الحفظ ولم يتغيّر شيء. حدّث الصفحة وتحقّق من القيم، ثم حاول مرة أخرى.");
}

/** Whatever the writer typed, or nothing at all. The database decides whether nothing is allowed. */
function readReason(formData: FormData): string {
  return textValue(formData, "reason", 1000) || "";
}

function readSortOrder(formData: FormData): number | undefined {
  const value = wholeNumber(formData.get("sort_order"), 100_000);
  return value === null ? 0 : value;
}

const SORT_ORDER_INVALID = "الترتيب عدد صحيح بين 0 و100000، مثال: 10. الأصغر يظهر أولاً.";

export async function saveSpacingClass(classId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (classId !== null && !isUuid(classId)) return STALE;

  const labelAr = textValue(formData, "label_ar", 120);
  const rowSpacing = metres(formData.get("row_spacing_m"));
  const treeSpacing = metres(formData.get("tree_spacing_m"));
  if (!labelAr || typeof rowSpacing !== "number" || typeof treeSpacing !== "number" || rowSpacing <= 0 || treeSpacing <= 0) {
    return fail(`${intakeErrorMessage("invalid_spacing_class")} مثال: 9 و9، أو 4 و1.5.`);
  }
  const code = textValue(formData, "code", 41);
  if (!CODE.test(code)) {
    return fail("الرمز التقني من 2 إلى 41 حرفاً: أحرف لاتينية صغيرة وأرقام و«_»، مثال: intensif_9x9.");
  }
  const sortOrder = readSortOrder(formData);
  if (sortOrder === undefined) return fail(SORT_ORDER_INVALID);
  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_spacing_class", {
    p: {
      ...(classId ? { id: classId } : {}),
      code,
      label_ar: labelAr,
      label_fr: textValue(formData, "label_fr", 120) || null,
      row_spacing_m: rowSpacing,
      tree_spacing_m: treeSpacing,
      sort_order: sortOrder,
      is_active: formData.get("is_active") === "on",
    },
    p_reason: reason,
  });
  if (error) return rpcFailure(error);

  // The public /start page caches the classes under the configuration tag.
  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath(PAGE);
  return { ok: true, message: classId ? "تم حفظ الفئة." : "تمت إضافة الفئة." };
}

export async function deleteSpacingClass(classId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!isUuid(classId)) return STALE;
  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_delete_spacing_class", { p_id: classId, p_reason: reason });
  if (error) return rpcFailure(error);

  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath(PAGE);
  return { ok: true, message: "تم حذف الفئة." };
}

type AmountCheck = { ok: true; value: number | null } | { ok: false; message: string };

function readAmount(formData: FormData, name: string, { required, positive, message }: { required: boolean; positive: boolean; message: string }): AmountCheck {
  const value = dinarsToMillimes(formData.get(name));
  if (value === undefined || (required && value === null) || (positive && value === 0)) return { ok: false, message };
  return { ok: true, value };
}

export async function savePricingRule(projectId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (projectId !== null && !isUuid(projectId)) return STALE;
  const isGlobal = projectId === null;
  const orInherit = isGlobal ? "" : " أو اتركها فارغة لتتبع القاعدة العامة.";

  const land = readAmount(formData, "land_price", {
    required: isGlobal,
    positive: false,
    message: `اكتب ثمن المتر المربع بالدينار، حتى 3 أرقام بعد الفاصل، مثال: 10 أو 12.5.${orInherit}`,
  });
  if (!land.ok) return fail(land.message);
  const planting = readAmount(formData, "planting_cost", {
    required: isGlobal,
    positive: false,
    message: `اكتب تكلفة غراسة الزيتونة بالدينار، مثال: 50.${orInherit}`,
  });
  if (!planting.ok) return fail(planting.message);

  const mode = String(formData.get("margin_mode") ?? "");
  if (mode !== "" && mode !== "percent" && mode !== "fixed") return fail("اختر طريقة هامش AgriZed من القائمة.");
  let marginPercent: number | null = null;
  let marginFixed: number | null = null;
  if (mode === "percent") {
    const bp = percentToBp(formData.get("margin_percent"));
    if (typeof bp !== "number") return fail("اكتب نسبة هامش AgriZed بالأرقام، حتى رقمين بعد الفاصل، مثال: 15 أو 12.5.");
    marginPercent = bp;
  }
  if (mode === "fixed") {
    const fixed = readAmount(formData, "margin_fixed", {
      required: true,
      positive: false,
      message: "اكتب مبلغ هامش AgriZed للزيتونة بالدينار، مثال: 40.",
    });
    if (!fixed.ok) return fail(fixed.message);
    marginFixed = fixed.value;
  }

  const roundingMessage = `خطوة التدوير تُكتب بالدينار وتكون أكبر من صفر، مثال: 1 للتدوير إلى الدينار، أو 0.001 بلا تدوير.${orInherit}`;
  const priceRounding = readAmount(formData, "price_rounding", { required: isGlobal, positive: true, message: roundingMessage });
  if (!priceRounding.ok) return fail(priceRounding.message);
  const monthlyRounding = readAmount(formData, "monthly_rounding", { required: isGlobal, positive: true, message: roundingMessage });
  if (!monthlyRounding.ok) return fail(monthlyRounding.message);

  // Paid every year, per tree, and never part of the purchase price. Empty on an offer inherits the global figure.
  const annualFee = readAmount(formData, "annual_fee", {
    required: false,
    positive: false,
    message: `اكتب معاليم الصيانة والتقليم في العام بالدينار، مثال: 150، أو اتركها فارغة.`,
  });
  if (!annualFee.ok) return fail(annualFee.message);

  // Free text explaining where the margin and markup figures come from; empty clears it.
  const note = textValue(formData, "note_ar", NOTE_MAX_LENGTH) || null;
  const markupsNote = textValue(formData, "markups_note_ar", NOTE_MAX_LENGTH) || null;

  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_pricing_rule", {
    p_project: projectId as string,
    p: {
      land_price_per_m2_millimes: land.value,
      planting_cost_per_tree_millimes: planting.value,
      margin_mode: mode || null,
      margin_percent_bp: marginPercent,
      margin_fixed_millimes: marginFixed,
      price_rounding_millimes: priceRounding.value,
      monthly_rounding_millimes: monthlyRounding.value,
      use_global_cost_items: isGlobal || formData.get("use_global_cost_items") === "on",
      annual_fee_per_tree_millimes: annualFee.value,
      note_ar: note,
      markups_note_ar: markupsNote,
    },
    p_reason: reason,
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: isGlobal ? "تم حفظ القواعد العامة." : "تم حفظ قواعد المشروع." };
}

export async function deletePricingRule(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!isUuid(projectId)) return STALE;
  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_delete_pricing_rule", { p_project: projectId, p_reason: reason });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تم حذف القواعد الخاصة. المشروع يتبع القواعد العامة من الآن." };
}

export async function saveCostItem(itemId: string | null, projectId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if ((itemId !== null && !isUuid(itemId)) || (projectId !== null && !isUuid(projectId))) return STALE;

  const labelAr = textValue(formData, "label_ar", 120);
  const basis = String(formData.get("basis") ?? "");
  const amount = dinarsToMillimes(formData.get("amount"));
  if (!labelAr || (basis !== "per_tree" && basis !== "per_m2") || typeof amount !== "number") {
    return fail(`${intakeErrorMessage("invalid_cost_item")} المبلغ بالدينار، حتى 3 أرقام بعد الفاصل.`);
  }
  const sortOrder = readSortOrder(formData);
  if (sortOrder === undefined) return fail(SORT_ORDER_INVALID);
  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_cost_item", {
    p: {
      ...(itemId ? { id: itemId } : {}),
      project_id: projectId,
      label_ar: labelAr,
      label_fr: textValue(formData, "label_fr", 120) || null,
      basis,
      amount_millimes: amount,
      sort_order: sortOrder,
      is_active: formData.get("is_active") === "on",
    },
    p_reason: reason,
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: itemId ? "تم حفظ البند." : "تمت إضافة البند." };
}

export async function deleteCostItem(itemId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!isUuid(itemId)) return STALE;
  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_delete_cost_item", { p_id: itemId, p_reason: reason });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: "تم حذف البند." };
}

/** Replaces every markup of the scope. Fields are named markup_<months>; an empty field means no markup. */
export async function saveMarkups(projectId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (projectId !== null && !isUuid(projectId)) return STALE;

  const rows: { months: number; markup_bp: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const match = /^markup_(\d{1,3})$/.exec(key);
    if (!match) continue;
    const months = Number(match[1]);
    const bp = percentToBp(typeof value === "string" ? value : "");
    if (bp === null) continue;
    if (bp === undefined) {
      return fail(`مدة ${months} شهراً: اكتب نسبة الزيادة بالأرقام، حتى رقمين بعد الفاصل، مثال: 12.5، أو اتركها فارغة.`);
    }
    rows.push({ months, markup_bp: bp });
  }
  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_financing_markups", {
    p_project: projectId as string,
    p_rows: rows,
    p_reason: reason,
  });
  if (error) return rpcFailure(error);

  revalidatePath(PAGE);
  return { ok: true, message: rows.length === 0 ? "تم الحفظ: ما فماش نسب زيادة في هذا المستوى." : "تم حفظ نسب الزيادة." };
}

/** Ticked boxes named «ids»; null when one of them is not an id, i.e. the page is stale or tampered with. */
function readIds(formData: FormData): string[] | null {
  const ids = [...new Set(formData.getAll("ids").map(String))];
  return ids.every(isUuid) ? ids : null;
}

/** Plan P1-2: the down payment percentages a project offers. An empty selection means every active percentage. */
export async function saveProjectDownPercents(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  const ids = readIds(formData);
  if (!isUuid(projectId) || ids === null) return STALE;
  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_project_down_percents", {
    p_project: projectId,
    p_option_item_ids: ids,
    p_reason: reason,
  });
  if (error) {
    // The shared message for this code sends a visitor back to the calculator; here a ticked item was retired meanwhile.
    if (error.message === "invalid_down_payment_percent") {
      return fail("إحدى النِّسَب المختارة ما عادتش نشطة في «القوائم». حدّث الصفحة وأعد الاختيار.");
    }
    return rpcFailure(error);
  }

  revalidatePath(PAGE);
  return { ok: true, message: ids.length === 0 ? "تم الحفظ: المشروع يعرض كل نِسَب التسبقة النشطة." : "تم حفظ نِسَب التسبقة المسموحة للمشروع." };
}

/** Plan Q-13: the spacing classes a project is planted with. An empty selection means every active class. */
export async function saveProjectSpacingClasses(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  const ids = readIds(formData);
  if (!isUuid(projectId) || ids === null) return STALE;
  const reason = readReason(formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_project_spacing_classes", {
    p_project: projectId,
    p_class_ids: ids,
    p_reason: reason,
  });
  if (error) {
    // The shared message for this code explains the class form; here it means a ticked class was retired meanwhile.
    if (error.message === "invalid_spacing_class") {
      return fail("إحدى الفئات المختارة ما عادتش نشطة. حدّث الصفحة وأعد الاختيار، أو فعّل الفئة في «فئات المساحة».");
    }
    return rpcFailure(error);
  }

  revalidatePath(PAGE);
  return { ok: true, message: ids.length === 0 ? "تم الحفظ: المشروع يقبل كل فئات المساحة النشطة." : "تم حفظ فئات المساحة المسموحة للمشروع." };
}
