"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig, settingInt } from "@/lib/config";
import { readPricingForm } from "@/lib/pricing-form";
import { COST_KINDS } from "@/lib/projects";
import { PUBLIC_PROJECTS_TAG } from "@/lib/public-projects";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const WRITE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

const FAILED_MESSAGE = "تعذّر الحفظ. تحقق من القيم وحاول مرة أخرى.";
const FAILED: ActionResult = { ok: false, message: FAILED_MESSAGE };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** The public projects pages cache their rows; any change to a project or parcel expires them. */
function expirePublicProjects() {
  updateTag(PUBLIC_PROJECTS_TAG);
  revalidatePath("/projects", "layout");
}

const PLANTATION = ["", "traditional", "intensive", "other"] as const;
const PRODUCTION = ["", "none", "starting", "producing"] as const;
const IRRIGATION = ["", "rainfed", "irrigated"] as const;

/**
 * Pricing formulas are data, never code (PRN-02 / SIM-06), and are edited with plain fields (PricingEditor).
 * value null = no formula of its own: the project uses the default, the parcel uses its project's.
 */
function parsePricing(formData: FormData): { ok: true; value: Json | null } | { ok: false; message: string } {
  const result = readPricingForm(formData, { allowInherit: true });
  return result.ok ? { ok: true, value: result.value as Json | null } : result;
}

function coordinate(formData: FormData, name: string, limit: number): number | null | undefined {
  const raw = String(formData.get(name) ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? Math.round(value * 1e6) / 1e6 : undefined;
}

/** Checked items of an option list, as ids. Unknown or inactive ids are simply not shown by the site. */
function optionIds(formData: FormData, name: string): string[] {
  return [...new Set(formData.getAll(name).map(String).filter((id) => UUID.test(id)))].slice(0, 30);
}

type PageFields = {
  description_ar: string | null;
  water_available: boolean | null;
  water_note: string | null;
  access_note: string | null;
  video_url: string | null;
  latitude: number | null;
  longitude: number | null;
  show_location: boolean;
  document_option_ids: string[];
  service_option_ids: string[];
};

/** Report v3 §20: what the public project page shows beyond the listing facts. */
function readPageFields(formData: FormData): { ok: true; value: PageFields } | { ok: false; message: string } {
  const videoUrl = text(formData, "video_url", 500);
  if (videoUrl && !/^https:\/\/[^ ]+$/.test(videoUrl)) {
    return { ok: false, message: "رابط الفيديو يبدأ بـ https://، مثال: https://www.youtube.com/watch?v=…" };
  }

  const latitude = coordinate(formData, "latitude", 90);
  const longitude = coordinate(formData, "longitude", 180);
  if (latitude === undefined || longitude === undefined || (latitude === null) !== (longitude === null)) {
    return { ok: false, message: "اكتب خط العرض وخط الطول معاً بالأرقام، مثال: 34.55 و 10.30." };
  }
  const showLocation = formData.get("show_location") === "on";
  if (showLocation && latitude === null) {
    return { ok: false, message: "اكتب خط العرض وخط الطول قبل إظهار الموقع في صفحة المشروع." };
  }

  const water = String(formData.get("water_available") ?? "");
  return {
    ok: true,
    value: {
      description_ar: text(formData, "description_ar", 4000) || null,
      water_available: water === "yes" ? true : water === "no" ? false : null,
      water_note: text(formData, "water_note", 300) || null,
      access_note: text(formData, "access_note", 300) || null,
      video_url: videoUrl || null,
      latitude,
      longitude,
      show_location: showLocation,
      document_option_ids: optionIds(formData, "document_option_ids"),
      service_option_ids: optionIds(formData, "service_option_ids"),
    },
  };
}

export async function saveProject(projectId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);

  const name = text(formData, "name", 160);
  if (!name) return { ok: false, message: "اكتب اسم المشروع." };
  const governorateId = Number(formData.get("governorate_id"));
  if (!Number.isInteger(governorateId) || governorateId <= 0) return { ok: false, message: "اختر الولاية." };

  const pricing = parsePricing(formData);
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

  // Written only when the form carries the page fields, so the short «new project» form never erases them.
  const page = formData.has("page_fields") ? readPageFields(formData) : null;
  if (page && !page.ok) return page;

  const row = {
    name,
    project_type_id: text(formData, "project_type_id", 40) || null,
    governorate_id: governorateId,
    // Written only when the form carries the field, so editing a project never erases its delegation.
    ...(formData.has("delegation_id") ? { delegation_id: Number(formData.get("delegation_id")) || null } : {}),
    location_description: text(formData, "location_description", 1000) || null,
    total_area_m2: totalArea,
    olive_variety: text(formData, "olive_variety", 120) || null,
    tree_count: treeCount === null ? null : Math.round(treeCount),
    tree_age_years: treeAge,
    plantation_system: plantation.data || null,
    production_status: production.data || null,
    irrigation: irrigation.data || null,
    annual_costs_millimes: dinarsToMillimes(annualCosts) ?? null,
    // {} = no formula of its own: app.parcel_pricing() falls back to the default setting.
    pricing: pricing.value ?? {},
    status: status.data,
    ...(page?.ok ? page.value : {}),
  };

  const supabase = await createClient();
  if (projectId) {
    const { data, error } = await supabase.from("projects").update(row).eq("id", projectId).select("id");
    if (error || !data?.length) return FAILED;
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath("/admin/projects");
    expirePublicProjects();
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
  expirePublicProjects();
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
    .enum(["available", "interested", "reserved", "contracting", "sold", "owned", "withdrawn"])
    .safeParse(formData.get("status") ?? "available");
  if (!plantation.success || !production.success || !irrigation.success || !status.success) return FAILED;

  const pricing = parsePricing(formData);
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
    expirePublicProjects();
    return { ok: true, message: `تم حفظ القطعة ${code}.` };
  }

  const { error } = await supabase.from("parcels").insert(row);
  if (error) {
    return error.code === "23505" ? { ok: false, message: "رمز القطعة مستعمل في هذا المشروع." } : FAILED;
  }
  revalidatePath(`/admin/projects/${projectId}`);
  expirePublicProjects();
  return { ok: true, message: `تمت إضافة القطعة ${code}.` };
}

// Internal costs never reach the public pages (PRJ-03), so this action leaves their cache alone.
export async function addProjectCost(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);
  const label = text(formData, "label", 160);
  const amount = optionalNumber(formData, "amount_dinars");
  const kind = z.enum(COST_KINDS).safeParse(formData.get("kind"));
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

// ---------------------------------------------------------------------------
// Report v3 §20 · project gallery, in the public project-media bucket (MED-01)
// ---------------------------------------------------------------------------

const PROJECT_MEDIA_BUCKET = "project-media";

// Mirrors the bucket's own file_size_limit and allowed_mime_types.
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
const PICTURE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function pictureChanged(projectId: string) {
  revalidatePath(`/admin/projects/${projectId}`);
  expirePublicProjects();
}

export async function addProjectPicture(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);

  const file = formData.get("file");
  const alt = text(formData, "alt", 160);
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "اختر ملف الصورة من جهازك." };
  if (!alt) {
    return { ok: false, message: "اكتب وصفاً مختصراً للصورة (نص بديل). إلزامي حتى تبقى الصفحة مقروءة للجميع." };
  }
  const extension = PICTURE_TYPES[file.type];
  if (!extension) return { ok: false, message: "الصيغ المقبولة: JPG، PNG، WEBP أو AVIF." };
  if (file.size > MAX_PICTURE_BYTES) return { ok: false, message: "حجم الصورة يتجاوز 5 ميغا. اضغطها ثم أعد المحاولة." };

  const supabase = await createClient();
  const [project, pictures, config] = await Promise.all([
    supabase.from("projects").select("code").eq("id", projectId).maybeSingle(),
    supabase.from("project_media").select("sort_order").eq("project_id", projectId),
    getPublicConfig(),
  ]);
  if (!project.data || pictures.error) return FAILED;

  const limit = settingInt(config, "projects.gallery_max", 24);
  const existing = pictures.data ?? [];
  if (existing.length >= limit) {
    return { ok: false, message: `وصل المشروع للحد الأقصى (${limit} صورة). احذف صورة أو غيّر الحد من الإعدادات.` };
  }

  // A fresh name on every upload, so a replaced picture is never served from a cache.
  const path = `${project.data.code.toLowerCase()}/${Date.now()}.${extension}`;
  const bucket = supabase.storage.from(PROJECT_MEDIA_BUCKET);
  const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { ok: false, message: `تعذّر رفع الصورة: ${uploadError.message}` };

  const { error } = await supabase.from("project_media").insert({
    project_id: projectId,
    url: bucket.getPublicUrl(path).data.publicUrl,
    storage_path: path,
    alt_ar: alt,
    caption_ar: text(formData, "caption", 200) || null,
    sort_order: Math.max(0, ...existing.map((picture) => picture.sort_order)) + 10,
  });
  if (error) {
    // Never leave a file in the public bucket that no row points to.
    await bucket.remove([path]);
    return error.code === "23514" ? { ok: false, message: `وصل المشروع للحد الأقصى (${limit} صورة).` } : FAILED;
  }

  pictureChanged(projectId);
  return { ok: true, message: "تمت إضافة الصورة." };
}

/** One cover per project: the previous one is released first, as the database allows only one. */
export async function setProjectCover(projectId: string, pictureId: string): Promise<void> {
  await requireStaff(WRITE_ROLES);
  const supabase = await createClient();
  await supabase.from("project_media").update({ is_cover: false }).eq("project_id", projectId).eq("is_cover", true);
  await supabase.from("project_media").update({ is_cover: true }).eq("id", pictureId).eq("project_id", projectId);
  pictureChanged(projectId);
}

export async function moveProjectPicture(projectId: string, pictureId: string, step: -1 | 1): Promise<void> {
  await requireStaff(WRITE_ROLES);
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_media")
    .select("id, sort_order")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("created_at");
  const rows = data ?? [];
  const from = rows.findIndex((row) => row.id === pictureId);
  const to = from + step;
  if (from < 0 || to < 0 || to >= rows.length) return;

  [rows[from], rows[to]] = [rows[to], rows[from]];
  await Promise.all(
    rows.map((row, index) =>
      row.sort_order === (index + 1) * 10
        ? null
        : supabase.from("project_media").update({ sort_order: (index + 1) * 10 }).eq("id", row.id),
    ),
  );
  pictureChanged(projectId);
}

/** Removes the picture from the gallery and its file from the bucket. */
export async function removeProjectPicture(projectId: string, pictureId: string): Promise<void> {
  await requireStaff(WRITE_ROLES);
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_media")
    .delete()
    .eq("id", pictureId)
    .eq("project_id", projectId)
    .select("storage_path");
  const path = data?.[0]?.storage_path;
  if (path) await supabase.storage.from(PROJECT_MEDIA_BUCKET).remove([path]);
  pictureChanged(projectId);
}
