// One labelled figure, plus the list that holds a set of them.
// Server component: no state, no client boundary.
//
// Meant to replace these private copies, one file at a time (the migration is a later, separate step):
//   Row   — src/app/(public)/projects/[code]/offer-interest-form.tsx:442
//           src/components/site/offer-block.tsx:114
//           src/components/site/tree-offer-block.tsx:210
//           src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx:322   → layout="inline"
//   Fact  — src/app/admin/(panel)/land-offers/page.tsx:159
//           src/app/admin/(panel)/projects/page.tsx:165
//           src/app/admin/(panel)/projects/[id]/page.tsx:818
//           src/components/site/offer-block.tsx:123                               → layout="stacked"
//           src/app/admin/(panel)/projects/[id]/parcels/[parcelId]/page.tsx:331   → layout="stacked" size="lg"
//   Item  — src/app/admin/(panel)/leads/[personId]/page.tsx:424
//           src/app/admin/(panel)/land-offers/[id]/page.tsx:263                   → layout="stacked" numeric={false}
//   ParcelRow — src/components/site/parcel-row.tsx:4                              → layout="inline"
//
// The <dl>/<dt>/<dd> markup is kept: these are name/value pairs, and screen readers announce them as such.

import type { ReactNode } from "react";

export type DataRowLayout = "inline" | "stacked";
export type DataRowSize = "sm" | "md" | "lg";

export type DataRowProps = {
  /** The name of the figure. Arabic copy comes from the caller (database or page text). */
  label: ReactNode;
  /** The value. Wrap Latin text or a phone number in its own dir="ltr" island. */
  children: ReactNode;
  /** "inline": label at the start, value at the end of the same line (default). "stacked": label above value. */
  layout?: DataRowLayout;
  size?: DataRowSize;
  /** Figures line up digit by digit. Turn it off for values that are prose. */
  numeric?: boolean;
  /**
   * Inline only. The row carries its own vertical padding, which is what a divided list wants: the
   * hairline then sits midway between two values. A list that spaces its rows from the outside
   * instead (`space-y-2` on the <dl>, as the parcel and project cards do) would get that padding on
   * top of its own gap, so it passes padded={false} and keeps the spacing it already had.
   */
  padded?: boolean;
  className?: string;
};

const VALUE_SIZE: Record<DataRowSize, string> = {
  sm: "text-sm",
  md: "",
  lg: "text-lg",
};

const LABEL_SIZE: Record<DataRowSize, string> = {
  sm: "text-xs",
  md: "",
  lg: "text-xs",
};

export function DataRow({ label, children, layout = "inline", size = "md", numeric = true, padded = true, className = "" }: DataRowProps) {
  const digits = numeric ? "tabular-nums" : "";

  if (layout === "stacked") {
    const weight = size === "lg" ? "font-semibold" : "font-medium";
    return (
      <div className={className}>
        <dt className={`text-muted ${LABEL_SIZE[size] || "text-xs"}`}>{label}</dt>
        <dd className={`mt-0.5 text-ink ${weight} ${VALUE_SIZE[size]} ${digits}`}>{children}</dd>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-4 ${padded ? "py-2.5" : ""} ${className}`.replace(/\s+/g, " ").trim()}>
      <dt className={`text-muted ${LABEL_SIZE[size]}`}>{label}</dt>
      <dd className={`text-end font-semibold text-ink ${VALUE_SIZE[size]} ${digits}`}>{children}</dd>
    </div>
  );
}

export type DataListVariant = "divided" | "grid" | "plain";
export type DataListColumns = 2 | 3 | 4;

export type DataListProps = {
  children: ReactNode;
  /** "divided": hairline between inline rows. "grid": a fact grid. "plain": no decoration. */
  variant?: DataListVariant;
  /** Grid only. Written out in full so Tailwind sees every class it must generate. */
  columns?: DataListColumns;
  className?: string;
};

const GRID_COLUMNS: Record<DataListColumns, string> = {
  2: "grid gap-x-6 gap-y-3 sm:grid-cols-2",
  3: "grid gap-x-6 gap-y-3 sm:grid-cols-3",
  4: "grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4",
};

/**
 * The <dl> around a set of DataRows.
 * Replaces the hand-written wrappers such as `divide-y divide-line` (src/components/site/offer-block.tsx:53)
 * and `grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2` (src/app/admin/(panel)/leads/[personId]/page.tsx:179).
 */
export function DataList({ children, variant = "divided", columns = 2, className = "" }: DataListProps) {
  const shape = variant === "grid" ? GRID_COLUMNS[columns] : variant === "divided" ? "divide-y divide-line" : "";
  return <dl className={`${shape} ${className}`.trim()}>{children}</dl>;
}
