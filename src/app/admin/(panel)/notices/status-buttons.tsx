"use client";

import { useState, useTransition } from "react";

import { setNoticeStatus } from "./actions";

/** انشر · رجّعها مسودّة · أرشف — each one waits for the database, nothing optimistic. */
export function StatusButtons({ id, status }: { id: string; status: "draft" | "published" | "archived" }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const run = (next: "draft" | "published" | "archived") =>
    start(async () => {
      const result = await setNoticeStatus(id, next);
      setNote(result?.ok ? null : (result?.message ?? null));
    });

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {status !== "published" ? (
        <button type="button" disabled={pending} onClick={() => run("published")} className="btn btn-primary btn-sm">
          انشر
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => run("draft")} className="btn btn-secondary btn-sm">
          وقّف النشر
        </button>
      )}
      {status !== "archived" ? (
        <button type="button" disabled={pending} onClick={() => run("archived")} className="btn btn-ghost btn-sm">
          أرشف
        </button>
      ) : null}
      {note ? <span className="text-[0.6875rem] text-danger">{note}</span> : null}
    </span>
  );
}
