"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const FAILED: ActionResult = { ok: false, message: "تعذّر الحفظ. تحقق من القيم وحاول مرة أخرى." };

function done(message = "تم الحفظ."): ActionResult {
  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath("/admin/settings/lists");
  return { ok: true, message };
}

function text(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function sortOrder(formData: FormData): number {
  const value = Number(formData.get("sort_order"));
  return Number.isInteger(value) && value >= 0 && value <= 100000 ? value : 0;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** LEAD-01 / PARC-04: list values are edited here, never in code. Requests keep their snapshot (LEAD-02). */
export async function saveOptionItem(
  itemId: string | null,
  listKey: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const { data: list } = await supabase.from("option_lists").select("key, value_kind").eq("key", listKey).maybeSingle();
  if (!list) return { ok: false, message: "القائمة غير موجودة." };
  if (list.value_kind === "code" && !itemId) {
    return { ok: false, message: "قيم هذه القائمة ثابتة في النظام. يمكن تعديل نصوصها فقط." };
  }

  const labelAr = text(formData, "label_ar", 120);
  if (!labelAr) return { ok: false, message: "اكتب النص بالعربية." };

  const row: {
    label_ar: string;
    label_fr: string | null;
    sort_order: number;
    is_active: boolean;
    min_millimes?: number | null;
    max_millimes?: number | null;
    min_number?: number | null;
    max_number?: number | null;
    time_from?: string | null;
    time_to?: string | null;
  } = {
    label_ar: labelAr,
    label_fr: text(formData, "label_fr", 120) || null,
    sort_order: sortOrder(formData),
    is_active: formData.get("is_active") === "on",
  };

  if (list.value_kind === "money") {
    const min = Number(String(formData.get("min_dinars") ?? "").replace(",", "."));
    const rawMax = String(formData.get("max_dinars") ?? "").trim();
    const max = rawMax ? Number(rawMax.replace(",", ".")) : null;
    if (!Number.isFinite(min) || min < 0) return { ok: false, message: "اكتب المبلغ بالدينار، مثال: 1000" };
    if (max !== null && (!Number.isFinite(max) || max < min)) return { ok: false, message: "الحد الأقصى يجب أن يكون أكبر من المبلغ أو فارغاً." };
    row.min_millimes = Math.round(min * 1000);
    row.max_millimes = max === null ? null : Math.round(max * 1000);
  }

  // Areas in square metres. Both bounds may be empty, which means "no preference".
  if (list.value_kind === "number_range") {
    const rawMin = String(formData.get("min_number") ?? "").trim();
    const rawMax = String(formData.get("max_number") ?? "").trim();
    const min = rawMin ? Number(rawMin.replace(",", ".")) : null;
    const max = rawMax ? Number(rawMax.replace(",", ".")) : null;
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) {
      return { ok: false, message: "اكتب المساحة بالأرقام، مثال: 500" };
    }
    if (min !== null && max !== null && max < min) {
      return { ok: false, message: "الحد الأقصى يجب أن يكون أكبر من الحد الأدنى أو فارغاً." };
    }
    row.min_number = min;
    row.max_number = max;
  }

  if (list.value_kind === "time_range") {
    const from = text(formData, "time_from", 5);
    const to = text(formData, "time_to", 5);
    if (!TIME.test(from) || !TIME.test(to) || from >= to) return { ok: false, message: "اكتب مجال الساعات، مثال: 08:00 إلى 12:00." };
    row.time_from = from;
    row.time_to = to;
  }

  if (itemId) {
    const { data, error } = await supabase.from("option_items").update(row).eq("id", itemId).eq("list_key", listKey).select("id");
    if (error || !data?.length) return FAILED;
    return done();
  }

  const code = `${listKey}_${Date.now().toString(36)}`;
  const { error } = await supabase.from("option_items").insert({ ...row, list_key: listKey, code });
  if (error) return FAILED;
  return done("تمت الإضافة.");
}

export async function saveProjectType(typeId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const labelAr = text(formData, "label_ar", 120);
  if (!labelAr) return { ok: false, message: "اكتب اسم نوع المشروع." };

  const row = {
    label_ar: labelAr,
    label_fr: text(formData, "label_fr", 120) || null,
    description_ar: text(formData, "description_ar", 300) || null,
    sort_order: sortOrder(formData),
    is_active: formData.get("is_active") === "on",
  };

  const supabase = await createClient();
  if (typeId) {
    const { data, error } = await supabase.from("project_types").update(row).eq("id", typeId).select("id");
    if (error || !data?.length) return FAILED;
    return done();
  }

  const code = z
    .string()
    .regex(/^[a-z][a-z0-9_]{2,40}$/)
    .safeParse(text(formData, "code", 41));
  if (!code.success) return { ok: false, message: "الرمز التقني بأحرف لاتينية صغيرة وأرقام و«_»، مثال: olive_orchard" };
  const { error } = await supabase.from("project_types").insert({ ...row, code: code.data });
  if (error) return error.code === "23505" ? { ok: false, message: "هذا الرمز مستعمل." } : FAILED;
  return done("تمت الإضافة.");
}

/** Clause 25.3: each scenario maps the citizen's words to project type, plantation system and production status. */
export async function saveScenario(scenarioId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const labelAr = text(formData, "label_ar", 160);
  if (!labelAr) return { ok: false, message: "اكتب نص الخيار كما يقرأه المواطن." };

  const isAny = formData.get("is_any") === "on";
  const projectType = text(formData, "project_type_id", 40);
  const plantation = text(formData, "plantation_system", 20);
  const production = text(formData, "production_status", 20);

  if (!isAny && !projectType) {
    return { ok: false, message: "اربط الخيار بنوع مشروع، أو علّمه كـ«ما يهمنيش النوع»." };
  }
  if (plantation && !["traditional", "intensive", "other"].includes(plantation)) return FAILED;
  if (production && !["none", "starting", "producing"].includes(production)) return FAILED;

  const row = {
    label_ar: labelAr,
    label_fr: text(formData, "label_fr", 160) || null,
    description_ar: text(formData, "description_ar", 300) || null,
    project_type_id: isAny || !projectType ? null : projectType,
    plantation_system: plantation || null,
    production_status: production || null,
    is_any: isAny,
    sort_order: sortOrder(formData),
    is_active: formData.get("is_active") === "on",
  };

  const supabase = await createClient();
  if (scenarioId) {
    const { data, error } = await supabase.from("ownership_scenarios").update(row).eq("id", scenarioId).select("id");
    if (error || !data?.length) return FAILED;
    return done();
  }

  const code = z
    .string()
    .regex(/^[a-z][a-z0-9_]{2,40}$/)
    .safeParse(text(formData, "code", 41));
  if (!code.success) return { ok: false, message: "الرمز التقني بأحرف لاتينية صغيرة وأرقام و«_»، مثال: intensive_grove" };
  const { error } = await supabase.from("ownership_scenarios").insert({ ...row, code: code.data });
  if (error) return error.code === "23505" ? { ok: false, message: "هذا الرمز مستعمل." } : FAILED;
  return done("تمت الإضافة.");
}

const STAGES = ["new", "contacting", "qualified", "proposed", "visit", "reserved", "contracting", "owner", "paused", "closed"] as const;

export async function saveLeadStatus(statusId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const labelAr = text(formData, "label_ar", 120);
  if (!labelAr) return { ok: false, message: "اكتب اسم الحالة." };
  const isActive = formData.get("is_active") === "on";
  const supabase = await createClient();

  if (statusId) {
    if (!isActive) {
      const { data: current } = await supabase.from("lead_statuses").select("stage").eq("id", statusId).maybeSingle();
      if (current?.stage === "new") {
        const { count } = await supabase
          .from("lead_statuses")
          .select("id", { count: "exact", head: true })
          .eq("stage", "new")
          .eq("is_active", true)
          .neq("id", statusId);
        if (!count) return { ok: false, message: "يجب أن تبقى حالة «جديد» واحدة نشطة على الأقل لتسجيل المطالب." };
      }
    }
    const { data, error } = await supabase
      .from("lead_statuses")
      .update({ label_ar: labelAr, label_fr: text(formData, "label_fr", 120) || null, sort_order: sortOrder(formData), is_active: isActive })
      .eq("id", statusId)
      .select("id");
    if (error || !data?.length) return FAILED;
    return done();
  }

  const stage = z.enum(STAGES).safeParse(formData.get("stage"));
  if (!stage.success) return { ok: false, message: "اختر مرحلة النظام التي تنتمي لها الحالة." };
  const { error } = await supabase
    .from("lead_statuses")
    .insert({ stage: stage.data, label_ar: labelAr, label_fr: text(formData, "label_fr", 120) || null, sort_order: sortOrder(formData), is_active: isActive });
  if (error) return FAILED;
  return done("تمت الإضافة.");
}
