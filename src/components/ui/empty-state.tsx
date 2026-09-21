// What a list says when it holds nothing yet.
// Server component: no state, no client boundary.
//
// Meant to replace, one file at a time (the migration is a later, separate step), the twenty-odd blocks
// written out as `rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-muted`:
//   src/app/admin/(panel)/leads/page.tsx:390 (with a "clear the filters" link → action)
//   src/app/admin/(panel)/land-offers/page.tsx:95, land-offers/[id]/page.tsx:174
//   src/app/admin/(panel)/leads/[personId]/page.tsx:293
//   src/app/admin/(panel)/projects/page.tsx:109, projects/[id]/page.tsx:191
//   src/app/admin/(panel)/pricing/allowed-choices-form.tsx:33, cost-items.tsx:26, markups-form.tsx:59,
//     project-section.tsx:83                                                        → size="sm"
//   src/app/(public)/projects/page.tsx:108, projects/[code]/page.tsx:270
//
// The dashed edge says "nothing here yet", not "something went wrong": it keeps the card's ground and
// corner and drops the elevation, so it reads as an outline rather than an object on the page.
// Every word is the caller's — nothing here writes copy.

import type { ReactNode } from "react";

export type EmptyStateSize = "sm" | "md";
export type EmptyStateVariant = "dashed" | "plain";

export type EmptyStateProps = {
  /** The sentence, in Arabic, from the caller. */
  children: ReactNode;
  /** An optional stronger first line above it. */
  title?: ReactNode;
  /** What to do about it: a link to clear the filters, a button to add the first row. */
  action?: ReactNode;
  size?: EmptyStateSize;
  variant?: EmptyStateVariant;
  className?: string;
};

const SIZE_CLASS: Record<EmptyStateSize, string> = {
  sm: "px-4 py-6 text-sm",
  md: "px-6 py-12",
};

export function EmptyState({ children, title, action, size = "md", variant = "dashed", className = "" }: EmptyStateProps) {
  const edge = variant === "dashed" ? "border-dashed border-line-strong shadow-none" : "";

  return (
    <div className={`card ${edge} ${SIZE_CLASS[size]} text-center text-muted ${className}`.replace(/\s+/g, " ").trim()}>
      {title ? <p className="font-semibold text-ink">{title}</p> : null}
      <p className={title ? "mt-1" : ""}>{children}</p>
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
