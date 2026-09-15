// Rows of the tree pricing tables as the Back Office reads them (tree pricing addendum, docs/tree-area-and-cost.md).

export type SpacingClass = {
  id: string;
  code: string;
  label_ar: string;
  label_fr: string | null;
  row_spacing_m: number;
  tree_spacing_m: number;
  area_m2: number;
  sort_order: number;
  is_active: boolean;
};

export type MarginMode = "percent" | "fixed";

/** project_id null = the global rule. In a project rule, null values inherit the global ones. */
export type PricingRule = {
  id: string;
  project_id: string | null;
  land_price_per_m2_millimes: number | null;
  planting_cost_per_tree_millimes: number | null;
  margin_mode: MarginMode | null;
  margin_percent_bp: number | null;
  margin_fixed_millimes: number | null;
  price_rounding_millimes: number | null;
  monthly_rounding_millimes: number | null;
  use_global_cost_items: boolean;
  /** Where the margin figures come from until Finance confirms them (seeded on the global row). */
  note_ar: string | null;
  /** Same for the markups per duration. */
  markups_note_ar: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type CostBasis = "per_tree" | "per_m2";

export type CostItem = {
  id: string;
  project_id: string | null;
  label_ar: string;
  label_fr: string | null;
  basis: CostBasis;
  amount_millimes: number;
  sort_order: number;
  is_active: boolean;
};

export type Markup = { id: string; project_id: string | null; months: number; markup_bp: number };

export type ProjectOption = { id: string; code: string; name: string };

/** An item of the `duration` list; min_number holds the months. */
export type DurationItem = { id: string; label_ar: string; label_fr: string | null; months: number };

/** One markup row per months value, even when two list items share it. */
export type Duration = { id: string; label_ar: string; months: number };

/** An item of the `down_payment_percent` list; min_number holds the percentage of the cash total. */
export type DownPercent = { id: string; label_ar: string; label_fr: string | null; percent: number };

/** Longest note_ar / markups_note_ar the forms accept. */
export const NOTE_MAX_LENGTH = 1000;

export const BASIS_LABELS: Record<CostBasis, string> = {
  per_tree: "للزيتونة",
  per_m2: "للمتر المربع",
};
