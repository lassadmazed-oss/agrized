// The shared layer the app was missing: one copy of each shape that was being redeclared page by page.
// Everything here is a server component and styles itself through the classes in globals.css
// (.card, .panel, .pill, .stat, .section-title), not through a long inline string.
//
// Import either way:
//   import { DataTable, EmptyState } from "@/components/ui";
//   import { DataTable } from "@/components/ui/data-table";
//
// The private copies these replace have all been deleted; the per-file comments below still name where
// each one used to live, as a record of what a given component had to absorb. Two shapes stayed behind
// on purpose: the leads filter form's FilterField (its space-y-1.5 also gaps a <select> from a sibling
// checkbox, which FormField does not do) and tree-pricing-quote's Row (a four-cell <tr>, not a DataRow).

export { DataRow, DataList } from "./data-row";
export type { DataRowProps, DataRowLayout, DataRowSize, DataListProps, DataListVariant, DataListColumns } from "./data-row";

export { StatTile } from "./stat-tile";
export type { StatTileProps, StatTileSize } from "./stat-tile";

export { StatusPill } from "./status-pill";
export type { StatusPillProps, PillTone } from "./status-pill";

export { DataTable, TableHeadCell, TableCell } from "./data-table";
export type { DataTableProps, Column, ColumnAlign, MobileSlot } from "./data-table";

export { FormField } from "./form-field";
export type { FormFieldProps, FormFieldSize } from "./form-field";

export { SectionHeader } from "./section-header";
export type { SectionHeaderProps, SectionHeaderLevel } from "./section-header";

export { EmptyState } from "./empty-state";
export type { EmptyStateProps, EmptyStateSize, EmptyStateVariant } from "./empty-state";
