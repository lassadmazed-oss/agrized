import Link from "next/link";
import type { ReactNode } from "react";

import { formatCount } from "@/lib/format";

/**
 * The four shapes every v2 screen is built from (owner, 2026-09-23: «saving maximum space, easy to use, nice
 * and clean»).
 *
 * WHAT CHANGED AND WHY. Each list used to be one bordered card per row with p-4 — a border, a shadow and
 * 32px of padding around every line. Twelve clients filled a phone screen. The cost is not only space: a
 * border around each row says «these are twelve separate objects», when what a reader is looking at is one
 * list. So a list here is ONE surface divided by hairlines, the way a table is, and a row is 40px instead of
 * 76. The same twelve clients now fit with room to spare, and the eye reads down a column instead of
 * hopping between boxes.
 *
 * NOTHING IS SMALLER THAN IT SHOULD BE, though. A row is still a full-width tap target on a phone, the text
 * stays at 14px, and the end column keeps its own line for the status — density paid for by squinting is not
 * density, it is a smaller version of the same problem.
 */

/** A screen's head: its name, and how many of the thing it lists. Nothing else — the title is not a place
 *  to explain the screen, and a screen that needs explaining has not been designed yet. */
export function Screen({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold text-forest">{title}</h1>
        {count !== undefined && count !== null ? (
          <span className="text-sm text-muted tabular-nums">{formatCount(count)}</span>
        ) : null}
        {action ? <div className="ms-auto">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** The filter strip: one line, scrolls sideways under the thumb rather than wrapping to three rows. */
export function Filters({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">{children}</div>;
}

export function Filter({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
        active ? "bg-leaf-soft text-forest" : "text-muted hover:bg-paper hover:text-forest"
      }`}
    >
      {children}
    </Link>
  );
}

/** One surface, hairline-divided. Empty and error states live here so no screen writes its own card for them. */
export function Rows({ children, empty }: { children?: ReactNode; empty?: string }) {
  if (empty) {
    return <p className="card p-5 text-center text-sm text-muted">{empty}</p>;
  }
  return <ul className="card divide-y divide-line overflow-hidden">{children}</ul>;
}

/**
 * A row: who, what, and where it stands — three columns that always mean the same thing on every screen.
 *
 * `middle` is hidden below `sm`. It carries context (the offer, the date, the instalment number), and on a
 * phone the first and last columns are the two a reader is scanning for. Hiding it is what lets the row stay
 * one line there instead of wrapping to three.
 */
export function Row({
  href,
  title,
  subtitle,
  middle,
  middleSub,
  end,
  endSub,
  tone,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  middle?: ReactNode;
  middleSub?: ReactNode;
  end?: ReactNode;
  endSub?: ReactNode;
  tone?: "danger";
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-paper">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{title}</span>
          {subtitle ? (
            // TWO properties, and both are needed — this line has been wrong in three different ways.
            //
            // dir="ltr" alone (what was here) puts the number in the right ORDER but the wrong PLACE:
            // `text-align: start` resolves against the element's own direction, so an ltr box inside an rtl
            // column aligns its text left, half a row away from the name it belongs to. On four screens.
            //
            // Dropping the dir (or using <bdi>, whose dir defaults to `auto` and resolves to ltr for a run of
            // digits) fixes the place and breaks the order: «+» is a bidi separator with no digit to its left,
            // so it is treated as neutral, takes the paragraph's direction and is printed at the far end —
            // ‎21698123456+ instead of +21698123456.
            //
            // So: ltr for the content, end-aligned for the box. In an ltr element `text-end` is the right
            // edge, which is where an rtl column starts, which is where the name above it starts.
            <span dir="ltr" className="block truncate text-end text-[0.6875rem] leading-tight text-muted">
              {subtitle}
            </span>
          ) : null}
        </span>

        {middle ? (
          <span className="hidden min-w-0 flex-1 text-[0.6875rem] leading-tight text-muted sm:block">
            <span className="block truncate">{middle}</span>
            {middleSub ? <span className="block truncate">{middleSub}</span> : null}
          </span>
        ) : null}

        <span className="shrink-0 text-end">
          {end ? (
            <span className={`block text-sm font-semibold ${tone === "danger" ? "text-danger" : "text-ink"}`}>
              {end}
            </span>
          ) : null}
          {endSub ? <span className="block text-[0.6875rem] leading-tight text-muted">{endSub}</span> : null}
        </span>
      </Link>
    </li>
  );
}

/**
 * The identity of a record, as a grid instead of a column.
 *
 * A contract has eleven facts on it. Stacked one per line they are eleven rows of ~46px — some 500px of
 * page, each row carrying one short value against a 1900px-wide screen that is otherwise empty. The same
 * eleven facts in three columns are four rows, read in one glance, and the screen stops looking like a
 * receipt printer.
 *
 * A fact with nothing in it is not drawn at all, so a cash contract does not show «—» where an instalment
 * plan would have been.
 */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="card grid gap-x-8 gap-y-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children?: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] leading-tight text-muted">{label}</dt>
      <dd className="truncate text-sm font-semibold leading-snug text-ink">{children}</dd>
    </div>
  );
}

/** The two or three figures a screen leads with. Half the padding of a StatTile, same legibility. */
export function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-3">{children}</div>;
}

export function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-[0.6875rem] leading-tight text-muted">{label}</p>
      <p className={`font-display text-xl font-bold leading-tight tabular-nums ${tone === "danger" ? "text-danger" : "text-forest"}`}>
        {value}
      </p>
      {note ? <p className="text-[0.6875rem] leading-tight text-muted">{note}</p> : null}
    </div>
  );
}
