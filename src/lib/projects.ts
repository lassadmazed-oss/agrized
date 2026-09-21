import type { Database } from "@/lib/supabase/database.types";

export type ProjectStatus = Database["public"]["Enums"]["project_status"];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "مسودة",
  preparing: "قيد التحضير",
  internal: "جاهز (داخلي)",
  published: "منشور",
  sold_out: "مكتمل البيع",
  operating: "في طور الاستغلال",
  archived: "مؤرشف",
};

export const PROJECT_STATUS_TONES: Record<ProjectStatus, string> = {
  draft: "bg-stone-100 text-stone-700 ring-stone-200",
  preparing: "bg-amber-50 text-amber-800 ring-amber-200",
  internal: "bg-sky-50 text-sky-800 ring-sky-200",
  published: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  sold_out: "bg-violet-50 text-violet-800 ring-violet-200",
  operating: "bg-leaf-soft text-forest ring-leaf/30",
  archived: "bg-stone-100 text-stone-600 ring-stone-200",
};

const UNKNOWN_TONE = "bg-stone-100 text-stone-700 ring-stone-200";

// The seven parcel statuses and their Arabic labels stood here (PARCEL_STATUS_LABELS / _TONES,
// parcelStatusLabel, parcelStatusTone). The unit is the olive tree: public.trees carries three states and
// their labels are read from `settings` (offers.stock_*), which is where user-facing copy belongs.

export function projectStatusLabel(status: string): string {
  return (PROJECT_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export function projectStatusTone(status: string): string {
  return (PROJECT_STATUS_TONES as Record<string, string>)[status] ?? UNKNOWN_TONE;
}

// The four offer families of report v3 §3 / §18 (OfferType, OFFER_TYPE_LABELS, offerTypeOf) read a parcel's
// own fields and had no caller left. If the rule is wanted again it belongs in SQL beside
// app.project_quote_payload, where an offer's property_type, plantation_system and production_status live.
// durationLabel and PROPERTY_TYPE_LABELS went with the same screens.

/** Project cost categories of report v3 §35. Internal: Finance and Admin only (PRJ-03). */
export const COST_KIND_LABELS: Record<string, string> = {
  purchase: "شراء العقار",
  notary: "موثّق ومصاريف قانونية",
  commission: "عمولة",
  plantation: "غراسة",
  irrigation: "ري",
  fencing: "سياج",
  access: "طريق ونفاذ",
  marketing: "تسويق",
  sales_commission: "عمولة البيع",
  management: "تسيير",
  development: "تهيئة وغراسة",
  fees: "معاليم وأتعاب",
  other: "أخرى",
};

/** Accepted by the database; `development` and `fees` stay valid for rows recorded before v3. */
export const COST_KINDS = Object.keys(COST_KIND_LABELS) as [string, ...string[]];

/** Offered in the form: the v3 categories only. */
export const COST_KINDS_OFFERED = COST_KINDS.filter((kind) => kind !== "development" && kind !== "fees");

// The installment payload of the parcel offer stood here: InstallmentPlan, PlanOption, OfferPlan,
// ParcelOffer (the payload of public_parcel_offer() / staff_parcel_offer(), migration 0020) and
// PLAN_REASON_LABELS. Nothing read them once the parcel screens went on 2026-09-18; a tree offer is
// quoted through public_project_quote() and typed in src/lib/tree-pricing.ts.
