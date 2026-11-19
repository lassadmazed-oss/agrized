"use client";

import { useEffect, useState, useTransition } from "react";

import { formatDate } from "@/lib/format";
import { joinStoryParts } from "@/lib/story-upload-client";

import { setStoryMedia } from "./actions";
import { sizeLabel, type StoryMedia } from "./story-model";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
};

/**
 * One photo or video of a story. A video sent in several parts is joined in the browser — the parts in order
 * are the original file — to play it here or to download it whole for the montage.
 */
export function MediaTile({ personId, personName, item, urls, canEdit }: { personId: string; personName: string; item: StoryMedia; urls: string[]; canEdit: boolean }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const direct = urls.length === 1 ? urls[0] : null;
  const playable = blobUrl ?? direct;

  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const join = async (): Promise<string | null> => {
    if (blobUrl) return blobUrl;
    try {
      setLoading(0);
      const blob = await joinStoryParts(urls, item.mime, (fraction) => setLoading(Math.round(fraction * 100)));
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return url;
    } catch (error) {
      setFailed(`ما نجمناش نجيبوه: ${(error as Error).message}. حدّث الصفحة وعاود.`);
      return null;
    } finally {
      setLoading(null);
    }
  };

  const download = async () => {
    const url = await join();
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${personName.replace(/\s+/g, "-")}-${item.created_at.slice(0, 10)}-${item.id.slice(0, 6)}.${EXT[item.mime] ?? "bin"}`;
    anchor.click();
  };

  const act = (patch: { status?: "kept" | "set_aside" | "ready"; remove?: boolean }) =>
    start(async () => {
      const result = await setStoryMedia(personId, item.id, patch);
      setFailed(result.ok ? null : result.message);
    });

  return (
    <div className={`card overflow-hidden ${item.status === "kept" ? "border-gold" : item.status === "set_aside" ? "opacity-60" : ""}`}>
      <div className="relative aspect-video bg-ink/90">
        {item.kind === "photo" && playable ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link to a story photo
          <img src={playable} alt={item.caption ?? ""} className="size-full object-contain" loading="lazy" />
        ) : item.kind === "video" && playable ? (
          <video src={playable} controls preload="metadata" className="size-full object-contain" />
        ) : (
          <button type="button" onClick={() => void join()} disabled={loading !== null} className="grid size-full place-items-center text-surface">
            <span className="text-center">
              <span className="block text-3xl" aria-hidden="true">▶</span>
              <span className="text-sm">{loading !== null ? `جارٍ التحميل ${loading}%` : `شغّل (${item.parts} أجزاء)`}</span>
            </span>
          </button>
        )}
        {item.status === "kept" ? (
          <span className="absolute start-2 top-2 rounded-full bg-gold-bright px-2 text-xs font-bold text-forest">⭐ مختارة</span>
        ) : null}
      </div>
      <div className="space-y-2 p-3 text-sm">
        <p className="text-xs text-muted">
          {item.kind === "video" ? "🎬 فيديو" : "📷 تصويرة"} · {sizeLabel(item.size_bytes)} · {formatDate(item.created_at)} ·{" "}
          {item.source === "client" ? "بعثها الحريف" : `الفريق${item.uploaded_by ? ` (${item.uploaded_by})` : ""}`}
        </p>
        {item.caption ? <p className="leading-6 text-ink">«{item.caption}»</p> : null}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void download()} disabled={loading !== null} className="btn btn-secondary btn-sm">
            ⬇ نزّل
          </button>
          {canEdit ? (
            <>
              {item.status !== "kept" ? (
                <button type="button" disabled={pending} onClick={() => act({ status: "kept" })} className="btn btn-ghost btn-sm">
                  ⭐ نخلّيها
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => act({ status: "ready" })} className="btn btn-ghost btn-sm">
                  نحّي النجمة
                </button>
              )}
              {item.status !== "set_aside" ? (
                <button type="button" disabled={pending} onClick={() => act({ status: "set_aside" })} className="btn btn-ghost btn-sm">
                  نحّيها جنب
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("تفسخ الملف هذا نهائياً؟")) act({ remove: true });
                }}
                className="btn btn-ghost btn-sm text-danger"
              >
                فسخ
              </button>
            </>
          ) : null}
        </div>
        {failed ? <p className="text-xs text-danger">{failed}</p> : null}
      </div>
    </div>
  );
}
