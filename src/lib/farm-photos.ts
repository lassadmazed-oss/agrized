import "server-only";

// «الخدمة في الضيعة» (0178) — the server's half of the farm photos: one-time upload tokens, the count of what
// arrived, and short read links. Bucket farm-photos is private; only the service role touches it, after a farm
// RPC accepted the reader.

import { createAdminClient } from "@/lib/supabase/admin";

export const FARM_BUCKET = "farm-photos";

export async function signFarmUploads(photos: { id: string; path: string }[]): Promise<{ id: string; path: string; token: string }[] | null> {
  const storage = createAdminClient().storage.from(FARM_BUCKET);
  const out: { id: string; path: string; token: string }[] = [];
  for (const photo of photos) {
    const { data, error } = await storage.createSignedUploadUrl(photo.path, { upsert: true });
    if (error || !data) {
      console.error("farm createSignedUploadUrl failed", error);
      return null;
    }
    out.push({ id: photo.id, path: data.path, token: data.token });
  }
  return out;
}

/** The photo ids whose file is in storage under <task>/<report>/. */
export async function farmArrived(folder: string): Promise<string[]> {
  const { data, error } = await createAdminClient().storage.from(FARM_BUCKET).list(folder, { limit: 100 });
  if (error || !data) {
    console.error("farm list failed", error);
    return [];
  }
  return data.filter((object) => Number((object.metadata as { size?: number } | null)?.size ?? 0) > 0).map((object) => object.name);
}

export async function signFarmReads(paths: string[], seconds = 3600): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await createAdminClient().storage.from(FARM_BUCKET).createSignedUrls(paths, seconds);
  if (error || !data) {
    console.error("farm createSignedUrls failed", error);
    return out;
  }
  for (const row of data) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}
