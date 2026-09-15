import "server-only";

import { unstable_cache } from "next/cache";

import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

/** A Back Office spacing class: one olive tree and the area that goes with it (docs/tree-area-and-cost.md). */
export type SpacingClass = {
  id: string;
  code: string;
  label_ar: string;
  label_fr: string | null;
  row_spacing_m: number;
  tree_spacing_m: number;
  area_m2: number;
  sort_order: number;
};

export const PAYMENT_MODES = ["cash", "installments"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export function parsePaymentMode(value: unknown): PaymentMode | undefined {
  return typeof value === "string" && (PAYMENT_MODES as readonly string[]).includes(value) ? (value as PaymentMode) : undefined;
}

/** "closed": the `pricing` module is not open to this caller; "unavailable": no price is set yet. */
export type QuotePricing = "closed" | "unavailable" | "ok";

export type InstallmentStatus =
  | "ok"
  | "incomplete"
  | "invalid_choice"
  | "duration_not_priced"
  | "down_covers_total"
  | "too_many_months";

/** Report v3 §12: financed total, remaining after the down payment, monthly amount rounded up to the dinar. */
export type TreeInstallments = {
  status: InstallmentStatus;
  /** Q-2: the down payment is this percentage of the cash total. */
  down_payment_percent: number | null;
  down_payment_millimes: number | null;
  months: number | null;
  total_financed_millimes: number | null;
  remaining_millimes: number | null;
  monthly_millimes: number | null;
  last_installment_millimes: number | null;
  installments_count: number | null;
  shortened: boolean;
};

/** What public.public_tree_quote returns; every figure is computed in the database. */
export type TreeQuote = {
  spacing_class_id: string;
  label_ar: string;
  label_fr: string | null;
  row_spacing_m: number;
  tree_spacing_m: number;
  area_per_tree_m2: number;
  trees: number | null;
  total_area_m2: number | null;
  pricing: QuotePricing;
  price_per_tree_millimes: number | null;
  total_price_millimes: number | null;
  installments: TreeInstallments | null;
};

const INSTALLMENT_STATUSES: readonly InstallmentStatus[] = [
  "ok",
  "incomplete",
  "invalid_choice",
  "duration_not_priced",
  "down_covers_total",
  "too_many_months",
];

const num = (value: unknown): number => Number(value ?? 0);
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Normalises the RPC's jsonb; numeric and bigint may arrive as numbers or strings. */
export function toTreeQuote(data: unknown): TreeQuote | null {
  if (!isRecord(data)) return null;
  const pricing: QuotePricing = data.pricing === "ok" || data.pricing === "unavailable" ? data.pricing : "closed";
  const raw = data.installments;
  const installments: TreeInstallments | null = isRecord(raw)
    ? {
        status: INSTALLMENT_STATUSES.includes(raw.status as InstallmentStatus)
          ? (raw.status as InstallmentStatus)
          : "incomplete",
        down_payment_percent: numOrNull(raw.down_payment_percent),
        down_payment_millimes: numOrNull(raw.down_payment_millimes),
        months: numOrNull(raw.months),
        total_financed_millimes: numOrNull(raw.total_financed_millimes),
        remaining_millimes: numOrNull(raw.remaining_millimes),
        monthly_millimes: numOrNull(raw.monthly_millimes),
        last_installment_millimes: numOrNull(raw.last_installment_millimes),
        installments_count: numOrNull(raw.installments_count),
        shortened: raw.shortened === true,
      }
    : null;
  return {
    spacing_class_id: String(data.spacing_class_id ?? ""),
    label_ar: String(data.label_ar ?? ""),
    label_fr: typeof data.label_fr === "string" ? data.label_fr : null,
    row_spacing_m: num(data.row_spacing_m),
    tree_spacing_m: num(data.tree_spacing_m),
    area_per_tree_m2: num(data.area_per_tree_m2),
    trees: numOrNull(data.trees),
    total_area_m2: numOrNull(data.total_area_m2),
    pricing,
    price_per_tree_millimes: pricing === "ok" ? numOrNull(data.price_per_tree_millimes) : null,
    total_price_millimes: pricing === "ok" ? numOrNull(data.total_price_millimes) : null,
    installments,
  };
}

export type TreeQuoteRequest = {
  spacingClassId: string;
  trees: number | null;
  paymentMode: PaymentMode | null;
  downPercentOptionId: string | null;
  durationOptionId: string | null;
};

/**
 * Areas and prices computed by public_tree_quote. The request-scoped client carries the caller's JWT, so staff
 * preview an internal `pricing` flag and visitors get "closed". Null when the quote cannot be read.
 */
export async function publicTreeQuote(request: TreeQuoteRequest): Promise<TreeQuote | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("public_tree_quote", {
      p_spacing_class: request.spacingClassId,
      p_trees: request.trees ?? undefined,
      p_payment_mode: request.paymentMode ?? undefined,
      p_down_percent_option_id: request.downPercentOptionId ?? undefined,
      p_duration_option_id: request.durationOptionId ?? undefined,
    });
    if (error) {
      console.error("public_tree_quote failed", error.message);
      return null;
    }
    return toTreeQuote(data);
  } catch (error) {
    console.error("public_tree_quote failed", error);
    return null;
  }
}

const loadSpacingClasses = unstable_cache(
  async (): Promise<SpacingClass[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("tree_spacing_classes")
      .select("id, code, label_ar, label_fr, row_spacing_m, tree_spacing_m, area_m2, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(`Could not load tree spacing classes: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      label_ar: row.label_ar,
      label_fr: row.label_fr,
      row_spacing_m: Number(row.row_spacing_m),
      tree_spacing_m: Number(row.tree_spacing_m),
      area_m2: Number(row.area_m2),
      sort_order: row.sort_order,
    }));
  },
  ["spacing-classes-v1"],
  { tags: [PUBLIC_CONFIG_TAG], revalidate: 300 },
);

/** Active spacing classes in Back Office order; empty (and logged) when they cannot be read, so intake keeps working. */
export async function getSpacingClasses(): Promise<SpacingClass[]> {
  try {
    return await loadSpacingClasses();
  } catch (error) {
    console.error(error);
    return [];
  }
}
