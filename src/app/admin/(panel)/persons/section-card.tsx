// One section of the client file: its heading, and — when it holds nothing — the reason it holds nothing.
//
// The whole point of this component is the difference between «ما فمّاش» and «مازال ما تبناش». A section whose
// module is switched off, a section whose table does not exist yet, and a section that is genuinely empty are
// three different sentences with three different next steps, and a screen that renders all three as a blank
// area teaches the reader to distrust it.
//
// Server component: no state, no client boundary.

import type { ReactNode } from "react";

import { EmptyState, SectionHeader } from "@/components/ui";

import type { SectionStatus } from "./read";

export type SectionCardProps = {
  title: string;
  /** What this section is, in one line. Optional. */
  description?: ReactNode;
  status: SectionStatus;
  count: number;
  /** The sentence for a section whose table does not exist yet (settings zitounti.not_built_note). */
  notBuiltNote: string;
  /** The sentence for a section whose module is switched off (settings zitounti.closed_section_note). */
  closedNote: string;
  /** The sentence for a section that was read and is genuinely empty. Written by the caller, in Arabic. */
  emptyNote: string;
  children: ReactNode;
};

export function SectionCard({
  title,
  description,
  status,
  count,
  notBuiltNote,
  closedNote,
  emptyNote,
  children,
}: SectionCardProps) {
  const note =
    status === "closed"
      ? closedNote
      : status === "not_built" || status === "phase_later"
        ? notBuiltNote
        : count === 0
          ? emptyNote
          : null;

  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader level={2} title={title} description={description} />
      <div className="mt-4">
        {note ? (
          <EmptyState size="sm" variant={status === "ok" ? "dashed" : "plain"}>
            {note}
          </EmptyState>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
