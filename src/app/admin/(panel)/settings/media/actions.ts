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
