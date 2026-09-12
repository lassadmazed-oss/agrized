"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { requireStaff, type StaffRole } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const WRITE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

const FAILED_MESSAGE = "تعذّر الحفظ. تحقق من القيم وحاول مرة أخرى.";
const FAILED: ActionResult = { ok: false, message: FAILED_MESSAGE };

function text(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function optionalNumber(formData: FormData, name: string): number | null | undefined {
  const raw = String(formData.get(name) ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function dinarsToMillimes(value: number | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value;
  return Math.round(value * 1000);
}

const PLANTATION = ["", "traditional", "intensive", "other"] as const;
const PRODUCTION = ["", "none", "starting", "producing"] as const;
const IRRIGATION = ["", "rainfed", "irrigated"] as const;

/** Pricing formulas are data, never code (PRN-02 / SIM-06). Empty means "use the project or global default". */
const pricingSchema = z.union([
  z.object({
    model: z.literal("markup_brackets"),
    brackets: z.array(z.object({ max_months: z.number().int().positive().max(600), markup_pct: z.number().min(0).max(500) })).min(1),
    max_months: z.number().int().positive().max(600).optional(),
    min_down_pct: z.number().min(0).max(100).optional(),
    min_installment_millimes: z.number().int().min(0).optional(),
  }),
  z.object({
    model: z.literal("monthly_rate"),
    monthly_rate_pct: z.number().min(0).max(20),
    max_months: z.number().int().positive().max(600).optional(),
    min_down_pct: z.number().min(0).max(100).optional(),
    min_installment_millimes: z.number().int().min(0).optional(),
  }),
  z.object({
    model: z.literal("scenarios"),
    scenarios: z
      .array(
        z.object({
          down_millimes: z.number().int().min(0),
          installment_millimes: z.number().int().positive(),
          months: z.number().int().positive().max(600),
          total_millimes: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
]);

function parsePricing(raw: string): { ok: true; value: Json } | { ok: false; message: string } {
  if (!raw.trim()) return { ok: true, value: {} as Json };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "صيغة التسعير يجب أن تكون JSON صحيحاً." };
  }
  const result = pricingSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      message: "صيغة التسعير غير مقبولة. النماذج المتاحة: markup_brackets، monthly_rate، scenarios.",
    };
  }
  return { ok: true, value: result.data as Json };
}

export async function saveProject(projectId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);

  const name = text(formData, "name", 160);
  if (!name) return { ok: false, message: "اكتب اسم المشروع." };
  const governorateId = Number(formData.get("governorate_id"));
  if (!Number.isInteger(governorateId) || governorateId <= 0) return { ok: false, message: "اختر الولاية." };

  const pricing = parsePricing(String(formData.get("pricing") ?? ""));
  if (!pricing.ok) return pricing;

  const totalArea = optionalNumber(formData, "total_area_m2");
  const treeCount = optionalNumber(formData, "tree_count");
  const treeAge = optionalNumber(formData, "tree_age_years");
  const annualCosts = optionalNumber(formData, "annual_costs_dinars");
  if (totalArea === undefined || treeCount === undefined || treeAge === undefined || annualCosts === undefined) {
    return { ok: false, message: "المساحة وعدد الأشجار والعمر والمصاريف تُكتب بالأرقام." };
  }

  const status = z
    .enum(["draft", "preparing", "internal", "published", "sold_out", "operating", "archived"])
    .safeParse(formData.get("status"));
  const plantation = z.enum(PLANTATION).safeParse(formData.get("plantation_system") ?? "");
  const production = z.enum(PRODUCTION).safeParse(formData.get("production_status") ?? "");
  const irrigation = z.enum(IRRIGATION).safeParse(formData.get("irrigation") ?? "");
  if (!status.success || !plantation.success || !production.success || !irrigation.success) return FAILED;

  const row = {
    name,
    project_type_id: text(formData, "project_type_id", 40) || null,
    governorate_id: governorateId,
    delegation_id: Number(formData.get("delegation_id")) || null,
    location_description: text(formData, "location_description", 1000) || null,
    total_area_m2: totalArea,
    olive_variety: text(formData, "olive_variety", 120) || null,
    tree_count: treeCount === null ? null : Math.round(treeCount),
    tree_age_years: treeAge,
    plantation_system: plantation.data || null,
    production_status: production.data || null,
    irrigation: irrigation.data || null,
    annual_costs_millimes: dinarsToMillimes(annualCosts) ?? null,
    pricing: pricing.value,
    status: status.data,
  };

  const supabase = await createClient();
  if (projectId) {
    const { data, error } = await supabase.from("projects").update(row).eq("id", projectId).select("id");
    if (error || !data?.length) return FAILED;
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath("/admin/projects");
    return { ok: true, message: "تم حفظ المشروع." };
  }

  const code = z
    .string()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,20}$/)
    .safeParse(text(formData, "code", 21).toUpperCase());
  if (!code.success) return { ok: false, message: "رمز المشروع بأحرف لاتينية كبيرة وأرقام و«-»، مثال: SFX-01" };

  const { error } = await supabase.from("projects").insert({ ...row, code: code.data });
  if (error) return error.code === "23505" ? { ok: false, message: "هذا الرمز مستعمل." } : FAILED;
  revalidatePath("/admin/projects");
  return { ok: true, message: `تم إنشاء المشروع ${code.data}.` };
}

/**
 * PARC-01 / PARC-02: every parcel field is stored exactly as entered. Nothing is derived from the area.
 */
export async function saveParcel(
  projectId: string,
  parcelId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);

  const code = text(formData, "code", 20);
  if (!code) return { ok: false, message: "اكتب رمز القطعة، مثال: P07." };

  const area = optionalNumber(formData, "area_m2");
  const trees = optionalNumber(formData, "olive_tree_count");
  const age = optionalNumber(formData, "tree_age_years");
  const price = optionalNumber(formData, "cash_price_dinars");
  const annual = optionalNumber(formData, "annual_costs_dinars");
  if (area === undefined || trees === undefined || age === undefined || price === undefined || annual === undefined) {
    return { ok: false, message: "المساحة وعدد الزيتونات والعمر والأسعار تُكتب بالأرقام." };
  }
  if (!area || area <= 0) return { ok: false, message: "اكتب مساحة القطعة بالمتر المربع." };
  if (price === null) return { ok: false, message: "اكتب سعر الحاضر بالدينار." };

  const propertyType = z.enum(["bare_land", "planted"]).safeParse(formData.get("property_type"));
  if (!propertyType.success) return { ok: false, message: "اختر نوع العقار." };
  const plantation = z.enum(PLANTATION).safeParse(formData.get("plantation_system") ?? "");
  const production = z.enum(PRODUCTION).safeParse(formData.get("production_status") ?? "");
  const irrigation = z.enum(IRRIGATION).safeParse(formData.get("irrigation") ?? "");
  const status = z
    .enum(["available", "interested", "reserved", "contracting", "sold", "withdrawn"])
    .safeParse(formData.get("status") ?? "available");
  if (!plantation.success || !production.success || !irrigation.success || !status.success) return FAILED;

  const pricing = parsePricing(String(formData.get("pricing") ?? ""));
  if (!pricing.ok) return pricing;
  const parcelPricing = pricing.value && Object.keys(pricing.value as object).length > 0 ? pricing.value : null;

  const sortOrder = Number(formData.get("sort_order"));
  const row = {
    project_id: projectId,
    code,
    area_m2: area,
    property_type: propertyType.data,
    plantation_system: plantation.data || null,
    olive_tree_count: trees === null ? null : Math.round(trees),
    tree_age_years: age,
    production_status: production.data || null,
    irrigation: irrigation.data || null,
    cash_price_millimes: dinarsToMillimes(price) as number,
    annual_costs_millimes: dinarsToMillimes(annual) ?? null,
    pricing: parcelPricing,
    status: status.data,
    notes: text(formData, "notes", 2000) || null,
    sort_order: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
  };

  const supabase = await createClient();
  if (parcelId) {
    const { data, error } = await supabase.from("parcels").update(row).eq("id", parcelId).eq("project_id", projectId).select("id");
    if (error || !data?.length) return FAILED;
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/admin/projects/${projectId}/parcels/${parcelId}`);
    return { ok: true, message: `تم حفظ القطعة ${code}.` };
  }

  const { error } = await supabase.from("parcels").insert(row);
  if (error) {
    return error.code === "23505" ? { ok: false, message: "رمز القطعة مستعمل في هذا المشروع." } : FAILED;
  }
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true, message: `تمت إضافة القطعة ${code}.` };
}

export async function addProjectCost(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);
  const label = text(formData, "label", 160);
  const amount = optionalNumber(formData, "amount_dinars");
  const kind = z.enum(["purchase", "development", "fees", "other"]).safeParse(formData.get("kind"));
  if (!label || amount === undefined || amount === null || !kind.success) {
    return { ok: false, message: "اكتب البيان والمبلغ بالدينار واختر النوع." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_costs").insert({
    project_id: projectId,
    kind: kind.data,
    label,
    amount_millimes: Math.round(amount * 1000),
    note: text(formData, "note", 500) || null,
  });
  if (error) return FAILED;

  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true, message: "تمت إضافة المصروف." };
}
