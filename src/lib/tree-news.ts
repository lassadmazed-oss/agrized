// «أخبار زيتونتك» (0167): the posts the grove team writes per offer, as the client's page and the Back Office read
// them. The photographs live in the public bucket `tree-news`; only the server writes there.

import { publicEnv } from "@/lib/env";

export const TREE_NEWS_BUCKET = "tree-news";

/** The public address of a post's photograph, or null when it has none. */
export function treeNewsPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/${TREE_NEWS_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** One post as public.my_tree_news() answers it. */
export type TreeNewsItem = {
  id: string;
  project_code: string;
  project_name: string;
  kind_code: string | null;
  kind_label: string | null;
  title: string;
  body: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  published_at: string;
};

export type MyTreeNews = { ok: true; items: TreeNewsItem[] } | { ok: false; reason: "no_session" | "no_person" | "closed" | "error" };

export function parseMyTreeNews(data: unknown): MyTreeNews {
  if (!data || typeof data !== "object") return { ok: false, reason: "error" };
  const value = data as { ok?: unknown; reason?: unknown; items?: unknown };
  if (value.ok === true && Array.isArray(value.items)) return { ok: true, items: value.items as TreeNewsItem[] };
  const reason = value.reason;
  return { ok: false, reason: reason === "no_session" || reason === "no_person" || reason === "closed" ? reason : "error" };
}
