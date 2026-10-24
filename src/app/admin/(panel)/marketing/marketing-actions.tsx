"use client";

import { useState, useTransition } from "react";

import { createCampaign, decidePost, publishNow, setToken } from "./actions";

/*
 * The three buttons on النشر على الشبكات, and the one sentence each of them can answer with.
 *
 * NOTHING OPTIMISTIC. A post that looks approved because a button was pressed, on a screen whose whole
 * subject is what has and has not gone out under the company's name, is the one lie this page must not
 * tell. Each button waits for the database and then the page revalidates.
 */

export function CampaignButton({ projectId, label }: { projectId: string; label: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="btn btn-primary btn-sm"
        onClick={() =>
          start(async () => {
            const result = await createCampaign(projectId);
            if (!result.ok) {
              setNote(result.message);
              return;
            }
            const parts: string[] = [];
            if (result.made > 0) parts.push(`تحضّرو ${result.made} منشور`);
            if (result.already > 0) parts.push(`${result.already} كانوا موجودين`);
            for (const skip of result.skipped) {
              parts.push(
                skip.reason === "no_template"
                  ? `${skip.network}: ما فمّاش نصّ جاهز`
                  : `${skip.network}: وفّيت حصّة اليوم`,
              );
            }
            setNote(parts.join(" · ") || "ما تحضّر حتى منشور.");
          })
        }
      >
        {pending ? "…" : label}
      </button>
      {note ? <span className="text-[0.6875rem] text-muted">{note}</span> : null}
    </span>
  );
}

export function DecideButtons({ postId }: { postId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const decide = (action: "approve" | "cancel") =>
    start(async () => {
      const result = await decidePost(postId, action);
      setNote(result.ok ? null : result.message);
    });

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button type="button" disabled={pending} className="btn btn-primary btn-sm" onClick={() => decide("approve")}>
        وافق
      </button>
      <button type="button" disabled={pending} className="btn btn-ghost btn-sm" onClick={() => decide("cancel")}>
        الغي
      </button>
      {note ? <span className="text-[0.6875rem] text-danger">{note}</span> : null}
    </span>
  );
}

/**
 * Pasting a Page access token in.
 *
 * THE FIELD IS A PASSWORD FIELD AND THE VALUE IS NEVER PUT BACK INTO IT. A token echoed into a form is a
 * token in the page source, in the browser's autofill and in any screenshot of the screen; the form clears
 * itself and the page then says only whether an account is connected.
 */
export function TokenForm({ network, externalId, label }: { network: "facebook" | "instagram"; externalId: string; label: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  // Named `write` so it cannot shadow the server action of the same name, which is how this file first
  // typechecked into nonsense.
  const [token, write] = useState("");
  const [id, setId] = useState(externalId);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await setToken({ network, externalId: id, token });
          write("");
          setNote(result.ok ? "تربط." : result.message);
        });
      }}
    >
      <label className="block">
        <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">رقم {label}</span>
        <input dir="ltr" value={id} onChange={(event) => setId(event.target.value)} className="field h-9 text-sm" />
      </label>
      <label className="block min-w-60 flex-1">
        <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">Access token</span>
        <input
          dir="ltr"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => write(event.target.value)}
          className="field h-9 text-sm"
          placeholder="EAAG…"
        />
      </label>
      <button type="submit" disabled={pending || !token.trim() || !id.trim()} className="btn btn-secondary btn-sm">
        {pending ? "…" : "اربط"}
      </button>
      {note ? <span className="text-[0.6875rem] text-muted">{note}</span> : null}
    </form>
  );
}

/** «انشر الآن» — the one button that makes something leave the building. */
export function PublishButton({ postId }: { postId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="btn btn-primary btn-sm"
        onClick={() =>
          start(async () => {
            const result = await publishNow(postId);
            setNote(result.ok ? "خرج." : result.message);
          })
        }
      >
        {pending ? "جاري النشر…" : "انشر الآن"}
      </button>
      {note ? <span className="text-[0.6875rem] text-muted">{note}</span> : null}
    </span>
  );
}
