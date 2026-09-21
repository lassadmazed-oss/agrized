// One table, described once, rendered twice: a scrolling table from the md breakpoint up and a card list below it.
// Server component: no state, no client boundary.
//
// Meant to replace, one file at a time (the migration is a later, separate step):
//   the leads list — src/app/admin/(panel)/leads/page.tsx:409-560, which today writes every row twice: a
//                    min-w-[84rem] table AND a separate <ul> of cards that must be kept in step by hand
//   Th / Td        — src/app/admin/(panel)/leads/page.tsx:646 and :650
//                    src/app/admin/(panel)/projects/[id]/page.tsx:827 and :831
//                    (kept exported below as TableHeadCell / TableCell for tables that stay hand-written,
//                     e.g. the change table in src/app/admin/(panel)/audit/page.tsx:207 and the quote table in
//                     src/components/admin/tree-pricing-quote.tsx:276)
//
// Each column says where it belongs on a phone, so the card list is derived from the same description
// instead of being written a second time. The table sits in a .panel (the surface for a container of rows);
// each phone card is a .card.

import Link from "next/link";
import type { ReactNode } from "react";

import { DataRow } from "./data-row";

export type ColumnAlign = "start" | "center" | "end";

/** Where a column goes on a phone. "body" (the default) becomes a label/value row in the card. */
export type MobileSlot = "title" | "aside" | "body" | "meta" | "hidden";

export type Column<Row> = {
  /** Stable key for React. Not shown. */
  key: string;
  /** The column heading, in Arabic, from the caller. */
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: ColumnAlign;
  /** Figures line up digit by digit and never wrap. */
  numeric?: boolean;
  /** Extra classes on the cell, e.g. "font-semibold" or "max-w-44". */
  className?: string;
  headClassName?: string;
  mobile?: MobileSlot;
  /** Label for this value inside the phone card, when the column heading is too terse. */
  mobileLabel?: ReactNode;
  /**
   * false makes the column feed the phone card only, never the table. The leads list needs it twice
   * over: the reference line of a card («رقم المطلب · التاريخ», one dir="ltr" island) is not a
   * thirteenth column, and under rowHref the whole card is already one <a>, so the cell that carries
   * a <Link> on desktop must not be rendered into it again as a nested anchor.
   */
  desktop?: boolean;
};

export type DataTableProps<Row> = {
  /** Read by screen readers instead of the table markup. Arabic copy from the caller. */
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** When given, each phone card becomes one link — the leads list already behaves this way. */
  rowHref?: (row: Row) => string;
  /** e.g. "84rem". An inline style, so Tailwind needs no arbitrary class for a value passed at runtime. */
  minWidth?: string;
  /** Shown instead of the table when there are no rows, e.g. an <EmptyState>. */
  empty?: ReactNode;
  className?: string;
};

const ALIGN: Record<ColumnAlign, string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

function cellClasses<Row>(column: Column<Row>): string {
  return `${ALIGN[column.align ?? "start"]} ${column.numeric ? "whitespace-nowrap tabular-nums" : ""} ${column.className ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
}

/** A cell that carries nothing needs no row in the phone card. */
function isEmptyValue(value: ReactNode): boolean {
  return value === null || value === undefined || value === false || value === "";
}

export function DataTable<Row>({ caption, columns, rows, rowKey, rowHref, minWidth, empty, className = "" }: DataTableProps<Row>) {
  if (rows.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  const tableColumns = columns.filter((column) => column.desktop !== false);
  const titleColumns = columns.filter((column) => column.mobile === "title");
  const asideColumns = columns.filter((column) => column.mobile === "aside");
  const metaColumns = columns.filter((column) => column.mobile === "meta");
  const bodyColumns = columns.filter((column) => (column.mobile ?? "body") === "body");

  return (
    <div className={className}>
      {/* From md up: the full table, scrolling sideways inside its own panel. */}
      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full text-sm" style={minWidth ? { minWidth } : undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-paper text-xs text-muted">
            <tr>
              {tableColumns.map((column) => (
                <TableHeadCell key={column.key} className={`${ALIGN[column.align ?? "start"]} ${column.headClassName ?? ""}`.trim()}>
                  {column.header}
                </TableHeadCell>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="align-top hover:bg-paper/60">
                {tableColumns.map((column) => (
                  <TableCell key={column.key} className={cellClasses(column)}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below md: the same rows as cards, from the same column description. */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const card = (
            <>
              {titleColumns.length > 0 || asideColumns.length > 0 ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {titleColumns.map((column) => (
                      <div key={column.key} className={`truncate font-semibold ${column.numeric ? "tabular-nums" : ""}`.trim()}>
                        {column.cell(row)}
                      </div>
                    ))}
                  </div>
                  {asideColumns.length > 0 ? (
                    <div className="flex flex-none flex-col items-end gap-1">
                      {asideColumns.map((column) => (
                        <div key={column.key}>{column.cell(row)}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {bodyColumns.length > 0 ? (
                <dl className="mt-2 divide-y divide-line empty:hidden">
                  {bodyColumns.map((column) => {
                    const value = column.cell(row);
                    if (isEmptyValue(value)) return null;
                    return (
                      <DataRow key={column.key} label={column.mobileLabel ?? column.header} size="sm" numeric={column.numeric ?? false}>
                        {value}
                      </DataRow>
                    );
                  })}
                </dl>
              ) : null}

              {metaColumns.length > 0 ? (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted tabular-nums">
                  {metaColumns.map((column) => {
                    const value = column.cell(row);
                    if (isEmptyValue(value)) return null;
                    return <span key={column.key}>{value}</span>;
                  })}
                </p>
              ) : null}
            </>
          );

          return (
            <li key={rowKey(row)}>
              {href ? (
                <Link href={href} className="card block p-4">
                  {card}
                </Link>
              ) : (
                <div className="card p-4">{card}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The <th> of a hand-written table. Replaces the private Th copies. */
export function TableHeadCell({ children, className = "", scope = "col" }: { children: ReactNode; className?: string; scope?: "col" | "row" }) {
  return (
    <th scope={scope} className={`px-4 py-3 text-start font-semibold whitespace-nowrap ${className}`.trim()}>
      {children}
    </th>
  );
}

/** The <td> of a hand-written table. Replaces the private Td copies. */
export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`.trim()}>{children}</td>;
}
