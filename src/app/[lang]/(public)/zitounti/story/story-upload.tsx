"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n/client";
import { uploadStoryParts } from "@/lib/story-upload-client";

import { finishClientStoryUpload, startClientStoryUpload } from "./actions";

/** A phone sometimes hands over a file with no type (a .mov from a gallery app); the name tells it. */
function mimeOf(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const known: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
    mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp",
  };
  return known[ext] ?? "";
}

/**
 * «زيد تصويرة ولا فيديو»: pick a file on the phone, a word about it, the permission box (never ticked for him,
 * and not shown once he has given it), send. A long video goes in parts; the percentage is the bytes sent.
 */
export function StoryUpload({ consentGiven, maxVideoMb, maxPhotoMb }: { consentGiven: boolean; maxVideoMb: number; maxPhotoMb: number }) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = progress !== null;

  // Leaving the page in the middle of a long video would lose it; the browser asks first.
  useEffect(() => {
    if (!busy) return;
    const stay = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", stay);
    return () => window.removeEventListener("beforeunload", stay);
  }, [busy]);

  const send = async () => {
    if (!file) return;
    const mime = mimeOf(file);
    const kind = mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "photo" : null;
    if (!kind) {
      setMessage({ ok: false, text: t("ui.story.bad_type") });
      return;
    }
    const maxMb = kind === "video" ? maxVideoMb : maxPhotoMb;
    if (file.size > maxMb * 1024 * 1024) {
      setMessage({ ok: false, text: t("ui.story.too_big", { max: `${maxMb} MB` }) });
      return;
    }

    setMessage(null);
    setProgress(0);
    const started = await startClientStoryUpload({ kind, mime, size: file.size, name: file.name.slice(0, 200), caption, consent });
    if (!started.ok) {
      setProgress(null);
      setMessage({ ok: false, text: started.message });
      return;
    }
    const typed = mime === file.type ? file : new File([file], file.name, { type: mime });
    const sent = await uploadStoryParts(typed, started.ticket, (fraction) => setProgress(Math.round(fraction * 100)));
    if (!sent) {
      setProgress(null);
      setMessage({ ok: false, text: t("ui.story.failed") });
      return;
    }
    const done = await finishClientStoryUpload(started.ticket.id);
    setProgress(null);
    setMessage({ ok: done.ok, text: done.message });
    if (done.ok) {
      setFile(null);
      setCaption("");
      if (input.current) input.current.value = "";
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-forest/40 bg-leaf-soft px-4 text-center font-semibold text-forest">
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setMessage(null);
          }}
          className="sr-only"
        />
        <span aria-hidden="true">📷 🎬</span>
        {file ? file.name : t("ui.story.pick")}
      </label>

      {file ? (
        <>
          <label className="block space-y-1">
            <span className="text-caption font-semibold text-ink">{t("ui.story.caption_label")}</span>
            <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={300} disabled={busy} className="field" />
          </label>

          {consentGiven ? null : (
            <label className="flex items-start gap-3 rounded-2xl bg-paper p-3 text-caption leading-6 text-ink">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                disabled={busy}
                className="mt-1 size-5 flex-none accent-[var(--color-forest)]"
              />
              <span>{t("ui.story.consent_label")}</span>
            </label>
          )}

          <button type="button" onClick={send} disabled={busy} className="btn btn-primary w-full">
            {busy ? t("ui.story.sending", { percent: progress ?? 0 }) : t("ui.story.send")}
          </button>
          {busy ? (
            <div className="h-2 overflow-hidden rounded-full bg-paper" aria-hidden="true">
              <div className="h-full bg-forest transition-[width]" style={{ width: `${progress ?? 0}%` }} />
            </div>
          ) : null}
        </>
      ) : null}

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-caption font-semibold ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
