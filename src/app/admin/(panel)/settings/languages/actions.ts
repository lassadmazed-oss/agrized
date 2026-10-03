"use server";

import { revalidatePath, updateTag } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { isLocale } from "@/lib/i18n/locales";
import { PUBLIC_PROJECTS_TAG } from "@/lib/public-projects";
import { createClient } from "@/lib/supabase/server";

/**
 * One language's row in public.locales (0109): on/off, its own name, its Arabic name, where a missing text
 * goes next, and its place in the selector. Arabic is the source: the database refuses switching it off or
 * giving it a fallback, and this action does not offer either.
 */
export async function saveLocale(code: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  if (!isLocale(code)) return { ok: false, message: "لغة غير معروفة." };

  const nameNative = String(formData.get("name_native") ?? "").trim();
  const nameAr = String(formData.get("name_ar") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order"));
  if (!nameNative || !nameAr) return { ok: false, message: "اكتب اسم اللغة بلغتها وبالعربية." };
  if (nameNative.length > 40 || nameAr.length > 40) return { ok: false, message: "الاسم طويل برشا (40 حرف كأقصى حد)." };
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 99) {
    return { ok: false, message: "الترتيب عدد صحيح بين 0 و99." };
  }

  const update: { name_native: string; name_ar: string; sort_order: number; is_enabled?: boolean; fallback_code?: string | null } = {
    name_native: nameNative,
    name_ar: nameAr,
    sort_order: sortOrder,
  };
  if (code !== "ar") {
    const fallback = String(formData.get("fallback_code") ?? "ar");
    if (!isLocale(fallback) || fallback === code) return { ok: false, message: "اختار لغة بديلة أخرى من القائمة." };
    update.is_enabled = formData.get("is_enabled") === "on";
    update.fallback_code = fallback;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("locales").update(update).eq("code", code).select("code");
  if (error?.message.includes("fallback_cycle")) {
    return {
      ok: false,
      message: "هذا الاختيار يعمل دورة: اللغة ترجع، خطوة بخطوة، لنفسها. خلّي وحدة من اللغات في السلسلة ترجع للعربية.",
    };
  }
  if (error || !data?.length) return { ok: false, message: "تعذّر الحفظ. تحقق من صلاحياتك وحاول مرة أخرى." };

  updateTag(PUBLIC_CONFIG_TAG);
  updateTag(PUBLIC_PROJECTS_TAG);
  revalidatePath("/admin/settings/languages");
  return {
    ok: true,
    message: "تم الحفظ. الموقع يتبدّل في أقل من دقيقة (القائمة متاع اللغات تتحفظ في الذاكرة دقيقة).",
  };
}
