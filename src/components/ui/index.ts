// The shared layer the app was missing: one copy of each shape that was being redeclared page by page.
// Everything here is a server component and styles itself through the classes in globals.css
// (.card, .panel, .pill, .stat, .section-title), not through a long inline string.
//
// Import either way:
//   import { DataTable, EmptyState } from "@/components/ui";
//   import { DataTable } from "@/components/ui/data-table";
//
// Nothing has been migrated yet: the private copies these replace are still in place, each named in the
// comment at the top of its file, so the migration can be done one call site at a time.

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
