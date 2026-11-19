"use client";

// The browser's half of a story upload (0176): the file is cut into the parts the server announced and each part
// goes straight to the private bucket with its one-time token. Bytes are not changed — the parts joined in order
// are the original file. A part that fails is tried again twice before the upload gives up.

import { getStorageUploadClient } from "@/lib/supabase/storage-upload";

export const STORY_BUCKET = "story-media";

export type StoryUploadTicket = { id: string; parts: number; partBytes: number; uploads: { path: string; token: string }[] };

export async function uploadStoryParts(
  file: File,
  ticket: StoryUploadTicket,
  onProgress: (fraction: number) => void,
): Promise<boolean> {
  const storage = getStorageUploadClient().storage.from(STORY_BUCKET);
  let sent = 0;
  for (const [index, upload] of ticket.uploads.entries()) {
    const part = file.slice(index * ticket.partBytes, Math.min((index + 1) * ticket.partBytes, file.size), file.type);
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
      const { error } = await storage.uploadToSignedUrl(upload.path, upload.token, part, { contentType: file.type });
      ok = !error;
      if (error) console.error("story part upload failed", index + 1, error.message);
    }
    if (!ok) return false;
    sent += part.size;
    onProgress(file.size > 0 ? sent / file.size : 1);
  }
  return true;
}

/** Fetches every part in order and gives back one Blob — the original file. */
export async function joinStoryParts(urls: readonly string[], mime: string, onProgress?: (fraction: number) => void): Promise<Blob> {
  const chunks: Blob[] = [];
  for (const [index, url] of urls.entries()) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`part ${index + 1}: ${response.status}`);
    chunks.push(await response.blob());
    onProgress?.((index + 1) / urls.length);
  }
  return new Blob(chunks, { type: mime });
}
