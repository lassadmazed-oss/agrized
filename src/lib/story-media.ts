import "server-only";

// «قصص النجاح» (0176) — the server's half of the story files. They live in the PRIVATE bucket story-media as
// <path>/001, <path>/002 … : the original file cut in order, because the project's storage takes at most 50 MB
// per file. Only the service role touches the bucket, and only after the caller's right was checked (the
// client's session, or a staff RPC that ran app.can_edit_person / can_see_person).

import { createAdminClient } from "@/lib/supabase/admin";

export const STORY_BUCKET = "story-media";

export function partPath(path: string, index: number): string {
  return `${path}/${String(index).padStart(3, "0")}`;
}

/** One-time upload tokens, one per part. */
export async function signStoryUploads(path: string, parts: number): Promise<{ path: string; token: string }[] | null> {
  const storage = createAdminClient().storage.from(STORY_BUCKET);
  const out: { path: string; token: string }[] = [];
  for (let index = 1; index <= parts; index += 1) {
    // upsert: a part sent again after a lost answer overwrites itself instead of failing as «already exists».
    const { data, error } = await storage.createSignedUploadUrl(partPath(path, index), { upsert: true });
    if (error || !data) {
      console.error("story createSignedUploadUrl failed", error);
      return null;
    }
    out.push({ path: data.path, token: data.token });
  }
  return out;
}

/** What really reached storage under a path: how many parts and how many bytes. */
export async function storyArrived(path: string): Promise<{ parts: number; bytes: number }> {
  const { data, error } = await createAdminClient().storage.from(STORY_BUCKET).list(path, { limit: 100 });
  if (error || !data) {
    console.error("story list failed", error);
    return { parts: 0, bytes: 0 };
  }
  const files = data.filter((object) => /^\d{3}$/.test(object.name));
  const bytes = files.reduce((sum, object) => sum + Number((object.metadata as { size?: number } | null)?.size ?? 0), 0);
  return { parts: files.length, bytes };
}

export type SignedMedia = { id: string; urls: string[] };

/** Short-lived read links for every part of every item, in order. */
export async function signStoryReads(items: { id: string; path: string; parts: number }[], seconds = 3600): Promise<Map<string, string[]>> {
  const all = items.flatMap((item) => Array.from({ length: item.parts }, (_, index) => partPath(item.path, index + 1)));
  const out = new Map<string, string[]>();
  if (all.length === 0) return out;
  const { data, error } = await createAdminClient().storage.from(STORY_BUCKET).createSignedUrls(all, seconds);
  if (error || !data) {
    console.error("story createSignedUrls failed", error);
    return out;
  }
  const byPath = new Map(data.map((row) => [row.path, row.signedUrl]));
  for (const item of items) {
    const urls = Array.from({ length: item.parts }, (_, index) => byPath.get(partPath(item.path, index + 1)) ?? "");
    if (urls.every(Boolean)) out.set(item.id, urls);
  }
  return out;
}

export async function removeStoryParts(path: string, parts: number): Promise<void> {
  const paths = Array.from({ length: parts }, (_, index) => partPath(path, index + 1));
  const { error } = await createAdminClient().storage.from(STORY_BUCKET).remove(paths);
  if (error) console.error("story remove failed", error);
}
