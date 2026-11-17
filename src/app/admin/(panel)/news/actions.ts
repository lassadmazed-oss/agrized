"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { requireStaff } from "@/lib/auth";
import { dispatchPush } from "@/lib/push";
import { dispatchAfterResponse } from "@/lib/sms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TREE_NEWS_BUCKET } from "@/lib/tree-news";

import { AGRI_ROLES } from "../agri/agri-model";

// «أخبار الزيتونات» (0167). The database decides who may post (app.can_manage_operations — the same four roles as
// AGRI_ROLES) and keeps the reason; the photograph goes to the public bucket through the service role, after the
// role check, and is removed again if the post itself is refused.

const PAGE = "/admin/news";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

const ERRORS: Record<string, string> = {
  forbidden: "ما عندكش الصلاحية تنشر أخبار. هذي للمسؤول الفلاحي والمالية والإدارة.",
  project_not_found: "اختار العرض اللي الخبر عليه.",
  invalid_news_title: "اكتب عنوان الخبر، من حرف واحد حتى 120 حرف. مثال: «زيتونتك نوّرت».",
  news_not_found: "الخبر هذا ما عادش موجود ولا تأرشف. حدّث الصفحة.",
  reason_required: "اكتب السبب، ومن بعد عاود.",
};

function fail(code: string | undefined): ActionResult {
  return { ok: false, message: (code && ERRORS[code]) || "ما تسجّل شي. حدّث الصفحة وثبّت في القيم، وعاود." };
}

function text(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

/** A new post, as a draft: the offer, its kind, a title, a few lines and a photograph. */
export async function createNews(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(AGRI_ROLES);
  const projectId = text(formData, "project_id", 40);
  if (!z.uuid().safeParse(projectId).success) return fail("project_not_found");
  const title = text(formData, "title", 120);
  if (!title) return fail("invalid_news_title");

  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("code").eq("id", projectId).maybeSingle();
  if (!project) return fail("project_not_found");

  let photoPath: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const ext = PHOTO_TYPES[photo.type];
    if (!ext) return { ok: false, message: "الصورة لازم تكون JPG ولا PNG ولا WEBP ولا AVIF." };
    if (photo.size > MAX_PHOTO_BYTES) return { ok: false, message: "الصورة أكبر من 5 ميغا. صغّرها ومن بعد عاود." };
    photoPath = `${project.code}/${Date.now()}.${ext}`;
    const { error: uploadError } = await createAdminClient()
      .storage.from(TREE_NEWS_BUCKET)
      .upload(photoPath, photo, { contentType: photo.type, upsert: false });
    if (uploadError) {
      console.error("tree-news upload failed", uploadError);
      return { ok: false, message: "الصورة ما تحمّلتش. ثبّت في الإنترنت وعاود." };
    }
  }

  const { error } = await supabase.rpc("staff_save_tree_news", {
    p: {
      project_id: projectId,
      kind_option_id: text(formData, "kind_option_id", 40) || null,
      title,
      body: text(formData, "body", 600),
      photo_path: photoPath,
      photo_alt: text(formData, "photo_alt", 200) || title,
      reason: text(formData, "reason", 1000),
    },
  });
  if (error) {
    if (photoPath) await createAdminClient().storage.from(TREE_NEWS_BUCKET).remove([photoPath]);
    return fail(error.code === "42501" ? "forbidden" : error.message);
  }

  revalidatePath(PAGE);
  return { ok: true, message: "الخبر تسجّل كمسودّة. انشرو كي تكون جاهز." };
}

/** Publishes a post and tells its readers once: push to the app, SMS only when ticked. */
export async function publishNews(id: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(AGRI_ROLES);
  if (!z.uuid().safeParse(id).success) return fail("news_not_found");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_publish_tree_news", {
    p_id: id,
    p_push: formData.get("push") === "on",
    p_sms: formData.get("sms") === "on",
    p_reason: text(formData, "reason", 1000),
  });
  if (error) return fail(error.code === "42501" ? "forbidden" : error.message);

  const result = (data ?? {}) as { holders?: number; push?: number; sms?: number; already_notified?: boolean };
  // The SMS and the push leave the queue once the answer is on screen; what one run does not carry, the
  // scheduler (/api/notifications/dispatch) does.
  if ((result.sms ?? 0) > 0) dispatchAfterResponse(25);
  if ((result.push ?? 0) > 0) after(() => dispatchPush(50).then(() => undefined));
  revalidatePath(PAGE);
  if (result.already_notified) return { ok: true, message: "الخبر منشور. الحرفاء وصلهم إشعار من قبل، وما نعاودوش نبعثو." };
  return {
    ok: true,
    message: `الخبر تنشر. عندو ${result.holders ?? 0} حريف: إشعار على ${result.push ?? 0} تلفون، و${result.sms ?? 0} SMS.`,
  };
}

export async function archiveNews(id: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(AGRI_ROLES);
  if (!z.uuid().safeParse(id).success) return fail("news_not_found");
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_archive_tree_news", { p_id: id, p_reason: text(formData, "reason", 1000) });
  if (error) return fail(error.code === "42501" ? "forbidden" : error.message);
  revalidatePath(PAGE);
  return { ok: true, message: "الخبر تأرشف وما عادش يبان للحرفاء." };
}
