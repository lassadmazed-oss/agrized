"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { getStorageUploadClient } from "@/lib/supabase/storage-upload";

import { closeFarmReport, openFarmReport } from "../actions";

const BUCKET = "farm-photos";

/**
 * A phone photo is 3–8 MB and the grove's network is thin: anything the browser can draw is redrawn at most
 * 1600 px wide as a JPEG before it leaves. A format it cannot draw (HEIC on Chrome) goes as it is.
 */
async function shrink(file: File): Promise<File> {
  try {
    if (!file.type.startsWith("image/") || file.type.includes("heic") || file.type.includes("heif")) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function typeOf(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" } as Record<string, string>)[ext] ?? "";
}

/**
 * The worker's day («رابور اليوم») or the supervisor's check («المراقبة»): photos first — taken now or picked —
 * then what was done or the verdict, one press. The photos go straight to private storage; the report counts
 * once the server has seen them arrive.
 */
export function ReportForm({
  taskId,
  kind,
  minPhotos,
  maxPhotos,
  targetTrees,
}: {
  taskId: string;
  kind: "work" | "check";
  minPhotos: number;
  maxPhotos: number;
  targetTrees: number | null;
}) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [trees, setTrees] = useState("");
  const [note, setNote] = useState("");
  const [finished, setFinished] = useState(false);
  const [verdict, setVerdict] = useState<"approved" | "redo" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const add = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((file) => typeOf(file).startsWith("image/"));
    setPhotos((current) => [...current, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, maxPhotos));
    setMessage(null);
  };

  const send = async () => {
    if (photos.length < minPhotos) {
      setMessage({ ok: false, text: minPhotos === 1 ? "زيد تصويرة على الأقل." : `زيد ${minPhotos} تصاور على الأقل.` });
      return;
    }
    if (kind === "check" && !verdict) {
      setMessage({ ok: false, text: "اختار «مقبولة» ولا «عاود»." });
      return;
    }
    if (kind === "check" && verdict === "redo" && note.trim().length < 3) {
      setMessage({ ok: false, text: "قول شنوّا لازم يتعاود." });
      return;
    }
    setMessage(null);
    setBusy("نحضّرو التصاور…");
    const files = await Promise.all(photos.map(async (photo) => {
      const small = await shrink(photo.file);
      const mime = typeOf(small);
      return small.type === mime ? small : new File([small], small.name, { type: mime });
    }));

    const opened = await openFarmReport({
      taskId,
      kind,
      verdict: kind === "check" ? verdict : null,
      treesDone: kind === "work" && trees ? Number.parseInt(trees, 10) : null,
      finished: kind === "work" && finished,
      note,
      photos: files.map((file) => ({ mime: file.type, size: file.size })),
    });
    if (!opened.ok) {
      setBusy(null);
      setMessage({ ok: false, text: opened.message });
      return;
    }

    const storage = getStorageUploadClient().storage.from(BUCKET);
    for (const [index, upload] of opened.uploads.entries()) {
      setBusy(`نبعثو التصاور ${index + 1}/${opened.uploads.length}…`);
      const file = files[index];
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
        const { error } = await storage.uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        ok = !error;
      }
    }

    setBusy("نثبّتو…");
    const closed = await closeFarmReport(taskId, opened.reportId);
    setBusy(null);
    setMessage(closed ? { ok: closed.ok, text: closed.message } : null);
    if (closed?.ok) {
      photos.forEach((photo) => URL.revokeObjectURL(photo.url));
      setPhotos([]);
      setTrees("");
      setNote("");
      setFinished(false);
      setVerdict(null);
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={Boolean(busy)} onClick={() => camera.current?.click()} className="btn btn-primary min-h-14 text-lg">
          📷 صوّر
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => gallery.current?.click()} className="btn btn-secondary min-h-14 text-lg">
          🖼️ اختار
        </button>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => add(event.target.files)} />
        <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => add(event.target.files)} />
      </div>

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.url} className="relative aspect-square overflow-hidden rounded-xl bg-paper">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a photo about to be sent */}
              <img src={photo.url} alt="" className="size-full object-cover" />
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  setPhotos((list) => list.filter((_, i) => i !== index));
                }}
                className="absolute end-1 top-1 grid size-7 place-items-center rounded-full bg-ink/70 text-sm text-surface"
                aria-label="نحّي التصويرة"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{kind === "work" ? "صوّر الخدمة اللي عملتها (قبل وبعد إذا تنجم)." : "صوّر الخدمة كيف لقيتها."}</p>
      )}

      {kind === "work" ? (
        <>
          <label className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ink">قدّاش من زيتونة خدمت اليوم؟</span>
            <input
              inputMode="numeric"
              value={trees}
              onChange={(event) => setTrees(event.target.value.replace(/\D/g, ""))}
              className="field min-h-12 w-28 text-center text-xl font-bold tabular-nums"
              placeholder={targetTrees ? `/ ${targetTrees}` : ""}
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl bg-paper p-3">
            <input type="checkbox" checked={finished} onChange={(event) => setFinished(event.target.checked)} className="size-6 accent-[var(--color-forest)]" />
            <span className="font-semibold text-ink">كمّلت الخدمة الكل (المراقب يجي يشوف)</span>
          </label>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={verdict === "approved"}
            onClick={() => setVerdict("approved")}
            className="min-h-16 rounded-2xl border-2 border-forest/40 bg-surface text-lg font-bold text-forest aria-pressed:bg-leaf-soft aria-pressed:ring-4 aria-pressed:ring-gold-bright/60"
          >
            ✅ مقبولة
          </button>
          <button
            type="button"
            aria-pressed={verdict === "redo"}
            onClick={() => setVerdict("redo")}
            className="min-h-16 rounded-2xl border-2 border-danger/40 bg-surface text-lg font-bold text-danger aria-pressed:bg-danger/10 aria-pressed:ring-4 aria-pressed:ring-gold-bright/60"
          >
            ↩ عاود
          </button>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-ink">
          {kind === "check" && verdict === "redo" ? "شنوّا لازم يتعاود؟" : "ملاحظة (اختياري)"}
        </span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} className="field min-h-16" />
      </label>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm font-semibold ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}

      <button type="button" onClick={() => void send()} disabled={Boolean(busy)} className="btn btn-primary min-h-14 w-full text-lg">
        {busy ?? (kind === "work" ? "ابعث رابور اليوم" : "ابعث المراقبة")}
      </button>
    </div>
  );
}
