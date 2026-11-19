"use server";

// «قصّتي مع AgriZed» (0176) — the client's four acts: open an upload, confirm it arrived, give or take back his
// permission, remove a file. Each starts from his own session (currentClient); the RPCs are service-role only
// and receive his person id from here, never from the browser.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { currentClient } from "@/lib/client-auth";
import { getPublicConfig, t, type PublicConfig } from "@/lib/config";
import { localePath } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { removeStoryParts, signStoryUploads, storyArrived } from "@/lib/story-media";
import type { StoryUploadTicket } from "@/lib/story-upload-client";
import { createAdminClient } from "@/lib/supabase/admin";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

function rpc(fn: string, args: Record<string, unknown>) {
  const admin = createAdminClient();
  return (admin as unknown as { rpc: Rpc }).rpc.bind(admin)(fn, args);
}

// story_media is newer than the generated database types (the access token that regenerates them has expired),
// so this one read goes through a narrow hand-written shape instead of the typed client.
type Query = {
  select: (columns: string) => Query;
  eq: (column: string, value: string) => Query;
  maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
};
function untyped() {
  return createAdminClient() as unknown as { from: (table: string) => Query };
}

/** «أكثر من 600 MB»: the owner's own ceiling for this kind of file, read when it is needed. */
async function maxLabel(kind: "photo" | "video"): Promise<string> {
  const { data } = await untyped()
    .from("settings")
    .select("value")
    .eq("key", kind === "photo" ? "story.max_photo_mb" : "story.max_video_mb")
    .maybeSingle();
  const value = Number((data as { value?: unknown } | null)?.value);
  return Number.isFinite(value) && value > 0 ? `${value} MB` : "";
}

async function messageFor(config: PublicConfig, code: string | undefined, kind: "photo" | "video"): Promise<string> {
  switch ((code ?? "").trim()) {
    case "story_too_big":
      return t(config, "ui.story.too_big", { max: await maxLabel(kind) });
    case "story_bad_type":
      return t(config, "ui.story.bad_type");
    case "story_too_many":
      return t(config, "ui.story.too_many");
    default:
      return t(config, "ui.story.failed");
  }
}

async function refresh() {
  revalidatePath(localePath(await currentLocale(), "/zitounti/story"));
}

const startSchema = z.object({
  kind: z.enum(["photo", "video"]),
  mime: z.string().min(3).max(60),
  size: z.number().int().positive(),
  name: z.string().max(200),
  caption: z.string().max(300),
  consent: z.boolean(),
});

export type StartUpload = { ok: true; ticket: StoryUploadTicket } | { ok: false; message: string };

export async function startClientStoryUpload(input: z.input<typeof startSchema>): Promise<StartUpload> {
  const config = await getPublicConfig();
  const client = await currentClient();
  if (!client || !client.passwordSet) return { ok: false, message: t(config, "ui.story.failed") };
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t(config, "ui.story.bad_type") };
  const data = parsed.data;

  const { data: opened, error } = await rpc("client_story_start", {
    p_person: client.personId,
    p: {
      kind: data.kind,
      mime: data.mime,
      size_bytes: data.size,
      file_name: data.name,
      caption: data.caption,
      consent: data.consent,
      // The exact sentence he ticked, in his language, kept beside his permission.
      consent_text: data.consent ? t(config, "ui.story.consent_label") : null,
    },
  });
  if (error) {
    if (!error.message.startsWith("story_")) console.error("client_story_start failed", error.message);
    return { ok: false, message: await messageFor(config, error.message, data.kind) };
  }
  const row = opened as { id: string; path: string; parts: number; part_bytes: number };
  const uploads = await signStoryUploads(row.path, row.parts);
  if (!uploads) return { ok: false, message: t(config, "ui.story.failed") };
  return { ok: true, ticket: { id: row.id, parts: row.parts, partBytes: row.part_bytes, uploads } };
}

/** The server counts what reached storage; only a complete file becomes part of the story. */
export async function finishClientStoryUpload(mediaId: string): Promise<{ ok: boolean; message: string }> {
  const config = await getPublicConfig();
  const client = await currentClient();
  if (!client || !client.passwordSet || !z.uuid().safeParse(mediaId).success) {
    return { ok: false, message: t(config, "ui.story.failed") };
  }
  const { data: media } = await untyped()
    .from("story_media")
    .select("path")
    .eq("id", mediaId)
    .eq("person_id", client.personId)
    .maybeSingle();
  const path = (media as { path?: string } | null)?.path;
  if (!path) return { ok: false, message: t(config, "ui.story.failed") };

  const arrived = await storyArrived(path);
  const { error } = await rpc("client_story_arrived", {
    p_person: client.personId,
    p_media: mediaId,
    p_bytes: arrived.bytes,
    p_parts: arrived.parts,
  });
  if (error) {
    console.error("client_story_arrived failed", error.message);
    return { ok: false, message: t(config, "ui.story.failed") };
  }
  await refresh();
  return { ok: true, message: t(config, "ui.story.sent") };
}

export async function setClientStoryConsent(formData: FormData): Promise<void> {
  const config = await getPublicConfig();
  const client = await currentClient();
  if (!client || !client.passwordSet) return;
  const granted = formData.get("granted") === "1";
  const { error } = await rpc("client_story_consent", {
    p_person: client.personId,
    p_granted: granted,
    p_text: granted ? t(config, "ui.story.consent_label") : null,
  });
  if (error) console.error("client_story_consent failed", error.message);
  await refresh();
}

export async function removeClientStoryMedia(formData: FormData): Promise<void> {
  const client = await currentClient();
  const mediaId = String(formData.get("media_id") ?? "");
  if (!client || !client.passwordSet || !z.uuid().safeParse(mediaId).success) return;
  const { data, error } = await rpc("client_story_remove", { p_person: client.personId, p_media: mediaId });
  if (error) {
    console.error("client_story_remove failed", error.message);
    return;
  }
  const gone = data as { path: string; parts: number };
  await removeStoryParts(gone.path, gone.parts);
  await refresh();
}
