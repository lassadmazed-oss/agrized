"use client";

import { useState, useTransition } from "react";

import { createCampaign, decidePost } from "./actions";

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
