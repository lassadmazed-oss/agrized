"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { finishStaffStoryUpload, startStaffStoryUpload } from "@/app/admin/(panel)/success/actions";
import { uploadStoryParts } from "@/lib/story-upload-client";

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
 * The team's upload for a client's story (0176): photos and videos from a visit or a planting day («raw»), or
 * the finished montage («final»). Several files in a row; a long video goes in parts, straight to the private
 * bucket. The permission to publish is the client's and is NOT asked here.
 */
export function StoryUploader({ personId, role, label }: { personId: string; role: "raw" | "final"; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [state, setState] = useState<{ busy: boolean; text: string; ok: boolean | null }>({ busy: false, text: "", ok: null });

  useEffect(() => {
    if (!state.busy) return;
    const stay = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", stay);
    return () => window.removeEventListener("beforeunload", stay);
  }, [state.busy]);

  const send = async (files: File[]) => {
    let done = 0;
    for (const [index, original] of files.entries()) {
      const mime = mimeOf(original);
      const kind = mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "photo" : null;
      if (!kind) {
        setState({ busy: false, ok: false, text: `«${original.name}»: كان التصاور والفيديوات يتقبلو.` });
        continue;
      }
      const file = mime === original.type ? original : new File([original], original.name, { type: mime });
      const prefix = files.length > 1 ? `${index + 1}/${files.length} · ` : "";
      setState({ busy: true, ok: null, text: `${prefix}جارٍ البعث… 0%` });
      const started = await startStaffStoryUpload({ personId, kind, mime, size: file.size, name: file.name.slice(0, 200), caption, role });
      if (!started.ok) {
        setState({ busy: false, ok: false, text: `«${file.name}»: ${started.message}` });
        continue;
      }
      const sent = await uploadStoryParts(file, started.ticket, (fraction) =>
        setState({ busy: true, ok: null, text: `${prefix}جارٍ البعث… ${Math.round(fraction * 100)}%` }),
      );
      if (!sent) {
        setState({ busy: false, ok: false, text: `«${file.name}» ما وصلش. ثبّت في الإنترنت وعاود.` });
        continue;
      }
      const finished = await finishStaffStoryUpload(personId, started.ticket.id);
      if (finished.ok) done += 1;
      else setState({ busy: false, ok: false, text: `«${file.name}»: ${finished.message}` });
    }
    if (done > 0) {
      setState({ busy: false, ok: true, text: done === 1 ? "وصل الملف." : `وصلو ${done} ملفات.` });
      setCaption("");
      router.refresh();
    }
    if (input.current) input.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`btn btn-secondary btn-sm cursor-pointer ${state.busy ? "pointer-events-none opacity-60" : ""}`}>
          <input
            ref={input}
            type="file"
            accept={role === "final" ? "video/*" : "image/*,video/*"}
            multiple={role === "raw"}
            disabled={state.busy}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              if (files.length > 0) void send(files);
            }}
            className="sr-only"
          />
          {label}
        </label>
        {role === "raw" ? (
          <input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={300}
            placeholder="كلمة على اللي باش تبعثو (اختياري)"
            disabled={state.busy}
            className="field field-sm min-w-0 flex-1"
          />
        ) : null}
      </div>
      {state.text ? (
        <p role={state.ok === false ? "alert" : "status"} className={`text-sm font-medium ${state.ok === false ? "text-danger" : state.ok ? "text-success" : "text-muted"}`}>
          {state.text}
        </p>
      ) : null}
    </div>
  );
}
