import "server-only";

import type { createClient } from "@/lib/supabase/server";

export const SITE_MEDIA_BUCKET = "site-media";

// Mirrors the bucket's own file_size_limit and allowed_mime_types (0015_site_media.sql).
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type SiteImageUpload = { ok: true; url: string } | { ok: false; message: string };

/** True when a file input was filled, not submitted empty. */
export function isPickedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

/**
 * Puts one picture in the public `site-media` bucket under `folder` and returns its https address (MED-01).
 * The client must act as an admin: the bucket's storage policies refuse everyone else.
 */
export async function uploadSiteImage(supabase: ServerClient, folder: string, file: File): Promise<SiteImageUpload> {
  const extension = EXTENSIONS[file.type];
  if (!extension) return { ok: false, message: "صيغة الصورة غير مقبولة. اختر ملف JPG أو PNG أو WEBP أو AVIF." };
  if (file.size > MAX_BYTES) return { ok: false, message: "حجم الصورة يتجاوز 5 ميغا. اضغطها ثم أعد المحاولة." };

  // A fresh name on every upload, so a replaced picture is never served from a cache.
  const path = `${folder.replace(/[^a-z0-9._/-]/gi, "-")}/${Date.now()}.${extension}`;
  const bucket = supabase.storage.from(SITE_MEDIA_BUCKET);
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { ok: false, message: `تعذّر رفع الصورة: ${error.message}. حاول مرة أخرى.` };

  return { ok: true, url: bucket.getPublicUrl(path).data.publicUrl };
}
