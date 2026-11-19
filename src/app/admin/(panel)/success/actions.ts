"use server";

// «قصص النجاح» (0176): the team's acts. Each checks the role here and the database checks the file again
// (app.can_edit_person; publishing: app.is_admin) inside the RPC. The bucket is touched with the service role
// only after the RPC accepted the act.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { removeStoryParts, signStoryUploads, storyArrived } from "@/lib/story-media";
import type { StoryUploadTicket } from "@/lib/story-upload-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { storyError } from "./story-model";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function call(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  return (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase)(fn, args);
}

const uuid = z.uuid();

function refresh(personId: string) {
  revalidatePath("/admin/success");
  revalidatePath(`/admin/success/${personId}`);
  revalidatePath(`/admin/terrain/${personId}`);
}

const startSchema = z.object({
  personId: z.uuid(),
  kind: z.enum(["photo", "video"]),
  mime: z.string().min(3).max(60),
  size: z.number().int().positive(),
  name: z.string().max(200),
  caption: z.string().max(300),
  role: z.enum(["raw", "final"]),
});

export async function startStaffStoryUpload(
  input: z.input<typeof startSchema>,
): Promise<{ ok: true; ticket: StoryUploadTicket } | { ok: false; message: string }> {
  await requireStaff(CRM_READ_ROLES);
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: storyError("story_bad_type") };
  const data = parsed.data;
  const { data: opened, error } = await call("staff_story_media_start", {
    p_person: data.personId,
    p: { kind: data.kind, mime: data.mime, size_bytes: data.size, file_name: data.name, caption: data.caption, role: data.role },
  });
  if (error) return { ok: false, message: storyError(error.message) };
  const row = opened as { id: string; path: string; parts: number; part_bytes: number };
  const uploads = await signStoryUploads(row.path, row.parts);
  if (!uploads) return { ok: false, message: storyError(null) };
  return { ok: true, ticket: { id: row.id, parts: row.parts, partBytes: row.part_bytes, uploads } };
}

export async function finishStaffStoryUpload(personId: string, mediaId: string): Promise<{ ok: boolean; message: string }> {
  await requireStaff(CRM_READ_ROLES);
  if (!uuid.safeParse(mediaId).success || !uuid.safeParse(personId).success) return { ok: false, message: storyError(null) };
  // Only where to count: the RPC below decides whether this reader may finish it.
  const admin = createAdminClient() as unknown as {
    from: (table: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } } };
  };
  const { data } = await admin.from("story_media").select("path").eq("id", mediaId).maybeSingle();
  const path = (data as { path?: string } | null)?.path;
  if (!path) return { ok: false, message: storyError("story_media_not_found") };
  const arrived = await storyArrived(path);
  const { error } = await call("staff_story_media_arrived", { p_media: mediaId, p_bytes: arrived.bytes, p_parts: arrived.parts });
  if (error) return { ok: false, message: storyError(error.message) };
  refresh(personId);
  return { ok: true, message: "وصل الملف." };
}

/** The title and the story the montage will tell. */
export async function saveStoryText(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);
  const personId = String(formData.get("person_id") ?? "");
  if (!uuid.safeParse(personId).success) return { ok: false, message: storyError("person_not_found") };
  const { error } = await call("staff_story_save", {
    p_person: personId,
    p: { title: String(formData.get("title") ?? ""), story_text: String(formData.get("story_text") ?? "") },
  });
  if (error) return { ok: false, message: storyError(error.message) };
  refresh(personId);
  return { ok: true, message: "تسجّل." };
}

/** One step of the story: نجمعو → مونتاج → جاهزة → تنشرت (with where). */
export async function setStoryStatus(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);
  const personId = String(formData.get("person_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!uuid.safeParse(personId).success) return { ok: false, message: storyError("person_not_found") };
  const url = String(formData.get("published_url") ?? "").trim();
  if (status === "published" && !url) return { ok: false, message: "حطّ رابط المنشور (فيسبوك، إنستغرام ولا الموقع) باش نعرفو وين تنشرت." };
  const { error } = await call("staff_story_save", {
    p_person: personId,
    p: status === "published" ? { status, published_url: url } : { status },
  });
  if (error) return { ok: false, message: storyError(error.message) };
  refresh(personId);
  return { ok: true, message: "تبدّلت المرحلة." };
}

/** A permission given on paper or WhatsApp, recorded with how — or taken back. */
export async function recordStoryConsent(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);
  const personId = String(formData.get("person_id") ?? "");
  if (!uuid.safeParse(personId).success) return { ok: false, message: storyError("person_not_found") };
  const granted = formData.get("granted") === "1";
  const { error } = await call("staff_story_consent", {
    p_person: personId,
    p_granted: granted,
    p_note: String(formData.get("note") ?? ""),
  });
  if (error) return { ok: false, message: storyError(error.message) };
  refresh(personId);
  return { ok: true, message: granted ? "الموافقة تسجّلت." : "الموافقة تنحّات." };
}

/** «نخلّيها» · «نحّيها جنب» · «فسخ». */
export async function setStoryMedia(personId: string, mediaId: string, patch: { status?: "kept" | "set_aside" | "ready"; remove?: boolean }) {
  await requireStaff(CRM_READ_ROLES);
  if (!uuid.safeParse(mediaId).success) return { ok: false, message: storyError("story_media_not_found") };
  const { data, error } = await call("staff_story_media_set", {
    p_media: mediaId,
    p: patch.remove ? { delete: true } : { status: patch.status },
  });
  if (error) return { ok: false, message: storyError(error.message) };
  const gone = data as { deleted?: boolean; path?: string; parts?: number } | null;
  if (gone?.deleted && gone.path && gone.parts) await removeStoryParts(gone.path, gone.parts);
  refresh(personId);
  return { ok: true, message: patch.remove ? "تفسخ." : "تسجّل." };
}
