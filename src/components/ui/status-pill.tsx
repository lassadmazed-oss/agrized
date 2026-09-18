// The small coloured label that carries a status.
// Server component: no state, no client boundary.
//
// Meant to replace, one file at a time (the migration is a later, separate step):
//   StatusChip — src/app/admin/(panel)/leads/page.tsx:638
//   and the hand-written `rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset …` spans at
//     src/app/admin/(panel)/leads/[personId]/page.tsx:133
//     src/app/admin/(panel)/land-offers/page.tsx:110, land-offers/[id]/page.tsx:75
//     src/app/admin/(panel)/projects/page.tsx:130, projects/[id]/page.tsx:132 and :227
//     src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx:121
//     src/app/admin/(panel)/settings/modules/page.tsx:55
//     src/app/(public)/projects/[code]/page.tsx:110, projects/[code]/[parcel]/page.tsx:126
//
// The shape is .pill from globals.css; the ring is added here because the tone strings the app already
// holds are written for `ring-1 ring-inset`.
//
// The label is always Arabic copy the caller reads from the database (lead_statuses, option_items, …);
// nothing here names a status or its text.
//
// Two ways to colour it, on purpose:
//   tone="success"  — a semantic tone, for new call sites.
//   toneClass={…}   — the ready-made strings already exported from src/lib (STAGE_TONES, LAND_STATUS_TONES,
//                     PROJECT_STATUS_TONES, PARCEL_STATUS_TONES, parcelStatusTone()), so a call site can move
//                     to this component without also rewriting its status map. toneClass wins when both are given.

import type { ReactNode } from "react";

export type PillTone = "neutral" | "info" | "progress" | "warning" | "attention" | "success" | "brand" | "danger" | "line";

/** The same vocabulary the four status maps in src/lib already use, in one place. */
const TONE_CLASS: Record<PillTone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  progress: "bg-violet-50 text-violet-800 ring-violet-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  attention: "bg-orange-50 text-orange-800 ring-orange-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  brand: "bg-leaf-soft text-forest ring-leaf/30",
  danger: "bg-danger-soft text-danger ring-danger/30",
  /* A badge carrying no status: the hairline pill of globals.css, with no ring of its own. */
  line: "pill-line ring-0",
};

export type StatusPillProps = {
  /** The status label, in Arabic, as it is stored. */
  children: ReactNode;
  tone?: PillTone;
  /** Escape hatch for the tone strings already exported from src/lib. */
  toneClass?: string;
  className?: string;
};

export function StatusPill({ children, tone = "neutral", toneClass, className = "" }: StatusPillProps) {
  return <span className={`pill ring-1 ring-inset ${toneClass ?? TONE_CLASS[tone]} ${className}`.trim()}>{children}</span>;
}
