"use server";

import { revalidatePath, updateTag } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const SITE_MEDIA_BUCKET = "site-media";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function done(message: string): ActionResult {
  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath("/admin/settings/media");
  revalidatePath("/");
  return { ok: true, message };
}

/**
 * Puts one picture in a slot of the public site (MED-01).
 * The file goes to the public `site-media` bucket; only the address is stored on the row.
 */
export async function saveSlotImage(slot: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const file = formData.get("file");
  const alt = String(formData.get("alt") ?? "").trim();
  const hasNewFile = file instanceof File && file.size > 0;

  const { data: current, error: readError } = await supabase
    .from("site_media")
    .select("url, alt_ar")
    .eq("slot", slot)
    .maybeSingle();
  if (readError) return { ok: false, message: `تعذّرت القراءة: ${readError.message}` };
  if (!current) return { ok: false, message: "هذا الموضع غير موجود." };

  // A picture without alternative text is unusable for a screen reader, and the database refuses it.
  if ((hasNewFile || current.url) && !alt) {
    return { ok: false, message: "اكتب وصفاً مختصراً للصورة (نص بديل). إلزامي حتى تبقى الصفحة مقروءة للجميع." };
  }

  let url = current.url;

  if (hasNewFile) {
    const extension = TYPES[file.type];
    if (!extension) return { ok: false, message: "الصيغ المقبولة: JPG، PNG، WEBP أو AVIF." };
    if (file.size > MAX_BYTES) return { ok: false, message: "حجم الصورة يتجاوز 5 ميغا. اضغطها ثم أعد المحاولة." };

    // A fresh name on every upload, so a replaced picture is never served from a cache.
    const path = `${slot.replace(/[^a-z0-9._-]/gi, "-")}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(SITE_MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { ok: false, message: `تعذّر رفع الصورة: ${uploadError.message}` };

    url = supabase.storage.from(SITE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("site_media").update({ url, alt_ar: alt }).eq("slot", slot);
  if (error) return { ok: false, message: `تعذّر الحفظ: ${error.message}` };

  return done(hasNewFile ? "تم رفع الصورة ونشرها في الموقع." : "تم تحديث النص البديل.");
}

/** Empties a slot. The site falls back to the branded drawing, never to a broken frame. */
export async function clearSlotImage(slot: string): Promise<void> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  await supabase.from("site_media").update({ url: null, alt_ar: null }).eq("slot", slot);
  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath("/admin/settings/media");
  revalidatePath("/");
}

/**
 * Puts a picture into the home page's sliding cover, or takes it out (owner, 2026-10-03: «in the cover giv
 * me in the admin some acsess to manige the imges of the cover thing that is auto sliding»).
 *
 * Which pictures slide was an array in src/components/site/landing/hero.tsx until today, so changing the
 * front page of the business needed a developer and a deploy. It is a checkbox now.
 *
 * The decision is made in SQL (staff_set_media_cover, 0123) rather than with an update from here, because
 * two of the three rules it enforces cannot be seen from one row: a slot with no picture may not be in the
 * slider, and the slider may not be emptied — the home page would open on a blank frame either way, and the
 * second one is only knowable by counting every other row. A disabled checkbox is not a rule.
 */
export async function setSlotInCover(slot: string, inCover: boolean): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const { error } = await supabase.rpc("staff_set_media_cover", { p_slot: slot, p_in_cover: inCover });
  if (error) return { ok: false, message: coverMessage(error.message) };

  return done(inCover ? "تزادت الصورة في شريط الغلاف." : "تنحّات الصورة من شريط الغلاف.");
}

/** Every refusal says what happened AND what to do about it. */
function coverMessage(code: string): string {
  if (code.includes("media_slot_empty")) {
    return "ما تنجّمش تحطّ في شريط الغلاف موضع فارغ: الشريط بش يوري رسم العلامة في وسط الدوران وكأنّ الصورة تكسّرت. إرفع الصورة الأول، ومن بعد علّمها.";
  }
  if (code.includes("media_cover_empty")) {
    return "لازم تبقى صورة وحدة على الأقل في شريط الغلاف: كان نحّيناهم الكل، الصفحة الرئيسية تفتح على إطار فارغ. علّم صورة أخرى الأول، ومن بعد نحّي هذي.";
  }
  if (code.includes("media_slot_not_found")) {
    return "هذا الموضع ما عادش موجود. حدّث الصفحة وأعد المحاولة.";
  }
  if (code.includes("forbidden") || code.includes("42501")) {
    return "ما عندكش الصلاحية باش تبدّل صور الموقع. هذي شاشة إدارة.";
  }
  if (code.includes("PGRST202") || code.includes("42883")) {
    return "ميزة شريط الغلاف مازالت ما تركّبتش في قاعدة البيانات (supabase/migrations/0123_cover_slots.sql). كلّم المسؤول باش يركّبها.";
  }
  return "تعذّر الحفظ. حدّث الصفحة وأعد المحاولة.";
}
