// A single headline number on its own tile: label, figure, and an optional note under it.
// Server component: no state, no client boundary.
//
// Meant to replace these, one file at a time (the migration is a later, separate step):
//   StatTile — src/components/admin/charts.tsx:151
//              (same prop names, so the five call sites in src/app/admin/(panel)/page.tsx:97-101 and the three
//               in src/app/admin/(panel)/analytics/page.tsx:153-155 only change their import path)
//   Figure   — src/components/admin/tree-pricing-quote.tsx:289          → value is already a formatted string
//   Fact (large) — src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx:331
//   the attention tiles — src/app/admin/(panel)/page.tsx:74-86          → href, emphasis, quiet
//   the demand figure   — src/app/admin/(panel)/land-offers/[id]/page.tsx:201
//
// Shape and type come from .card / .stat / .stat-figure / .stat-label in globals.css; .stat is a flex
// column with its own gap, so nothing here sets vertical margins.
//
// A number is formatted with formatCount so the existing call sites keep passing raw counts; anything else
// (money from formatMillimes, an area from formatArea) passes through untouched.

import Link from "next/link";
import type { ReactNode } from "react";

import { formatCount } from "@/lib/format";

export type StatTileSize = "sm" | "md";

export type StatTileProps = {
  /** What the figure counts. Arabic copy comes from the caller. */
  label: ReactNode;
  /** A raw count (formatted here) or an already formatted string — money, area, a percentage. */
  value: ReactNode;
  /** The sentence under the figure that says how it was counted. */
  note?: ReactNode;
  /** Turns the whole tile into one link. */
  href?: string;
  /** Raises the tile with a gold hairline. For a count that is asking to be dealt with. */
  emphasis?: boolean;
  /** Greys the figure, for a count of zero that needs no attention. */
  quiet?: boolean;
  /** "md" keeps the figure at the size .stat-figure sets; "sm" is for a tile inside a card. */
  size?: StatTileSize;
  className?: string;
};

export function StatTile({ label, value, note, href, emphasis = false, quiet = false, size = "md", className = "" }: StatTileProps) {
  const figure = typeof value === "number" ? formatCount(value) : value;
  const box = `card stat p-5 ${emphasis ? "border-gold/40" : ""} ${className}`.replace(/\s+/g, " ").trim();

  const body = (
    <>
      <p className="stat-label">{label}</p>
      <p className={`stat-figure ${size === "sm" ? "text-2xl" : ""} ${quiet ? "text-muted" : ""}`.replace(/\s+/g, " ").trim()}>{figure}</p>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${box} transition-colors hover:border-forest`}>
        {body}
      </Link>
    );
  }

  return <div className={box}>{body}</div>;
}
