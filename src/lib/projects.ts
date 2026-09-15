import type { Database } from "@/lib/supabase/database.types";

export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export type ParcelStatus = Database["public"]["Enums"]["parcel_status"];

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

/** Plot statuses of spec v2 §28. They change through events, not free editing (COM-01). */
export const PARCEL_STATUS_LABELS: Record<ParcelStatus, string> = {
  available: "متاحة",
  interested: "مهتم بها",
  reserved: "محجوزة",
  contracting: "في طور التعاقد",
  sold: "متعاقد عليها",
  owned: "مملوكة",
  withdrawn: "موقوفة",
};

export const PARCEL_STATUS_TONES: Record<ParcelStatus, string> = {
  available: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  interested: "bg-sky-50 text-sky-800 ring-sky-200",
  reserved: "bg-orange-50 text-orange-800 ring-orange-200",
  contracting: "bg-violet-50 text-violet-800 ring-violet-200",
  sold: "bg-stone-100 text-stone-700 ring-stone-200",
  owned: "bg-leaf-soft text-forest ring-leaf/30",
  withdrawn: "bg-danger-soft text-danger ring-danger/30",
};

const UNKNOWN_TONE = "bg-stone-100 text-stone-700 ring-stone-200";

/** Label for any parcel status, including ones a later migration adds (v2 adds «owned»). */
export function parcelStatusLabel(status: string): string {
  return (PARCEL_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export function parcelStatusTone(status: string): string {
  return (PARCEL_STATUS_TONES as Record<string, string>)[status] ?? UNKNOWN_TONE;
}

export function projectStatusLabel(status: string): string {
  return (PROJECT_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export function projectStatusTone(status: string): string {
  return (PROJECT_STATUS_TONES as Record<string, string>)[status] ?? UNKNOWN_TONE;
}

/** The four offer families of report v3 §3 / §18, read from a parcel's own fields. */
export type OfferType = "productive" | "new_planting" | "intensive" | "bare_land";

export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  productive: "زيتون منتج",
  new_planting: "غراسة جديدة",
  intensive: "زيتون مكثّف",
  bare_land: "أرض بيضاء",
};

export function offerTypeOf(parcel: {
  property_type: string;
  plantation_system: string | null;
  production_status: string | null;
}): OfferType {
  if (parcel.property_type === "bare_land") return "bare_land";
  if (parcel.plantation_system === "intensive") return "intensive";
  return parcel.production_status === "producing" ? "productive" : "new_planting";
}

/** «7 سنوات» when the months are whole years, «30 شهراً» otherwise. */
export function durationLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12} سنوات` : `${months} شهراً`;
}

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  bare_land: "أرض بيضاء",
  planted: "زيتون موجود",
};

export const PRICING_MODEL_LABELS: Record<string, string> = {
  markup_brackets: "هامش حسب المدة",
  monthly_rate: "هامش شهري على الرصيد",
  scenarios: "سيناريوهات محددة",
};

export type InstallmentPlan =
  | {
      ok: true;
      model: string;
      months: number;
      total_millimes: number;
      financed_millimes: number;
      last_installment_millimes: number;
      markup_pct?: number;
    }
  | { ok: false; reason: string; min_installment_millimes?: number; min_down_millimes?: number; months?: number; max_months?: number };

/** One option of the down-payment or monthly-installment lists, as returned by the offer RPC. */
export type PlanOption = { id: string; code: string | null; label_ar: string; min_millimes: number };

/** A plan computed in Postgres. The pricing formula itself never leaves the database (PRJ-03). */
export type OfferPlan = {
  ok: boolean;
  reason?: string;
  months?: number;
  total_millimes?: number;
  financed_millimes?: number;
  last_installment_millimes?: number;
  min_installment_millimes?: number;
  min_down_millimes?: number;
  down_option_id: string;
  installment_option_id: string;
  down_millimes: number;
  installment_millimes: number;
  nearest_installment_option_id?: string | null;
  nearest_down_option_id?: string | null;
};

/** Payload of public_parcel_offer() / staff_parcel_offer() (migration 0020). */
export type ParcelOffer = {
  parcel_id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  parcel_code: string;
  parcel_status: string;
  project_status: string;
  offered: boolean;
  priced: boolean;
  cash_price_millimes: number | null;
  annual_costs_millimes: number | null;
  down_from_millimes: number | null;
  down_options: PlanOption[];
  installment_options: PlanOption[];
  plans: OfferPlan[];
  examples: OfferPlan[];
  examples_max: number;
  entry: OfferPlan | null;
  chosen: OfferPlan | null;
  suggested_tree_count_option_id: string | null;
  suggested_scenario_id: string | null;
};

export const PLAN_REASON_LABELS: Record<string, string> = {
  installment_too_low: "القسط غير كافٍ لهذه القطعة.",
  down_payment_too_low: "التسبقة أقل من الحد الأدنى لهذه القطعة.",
  too_many_months: "المدة تتجاوز الحد الأقصى المسموح.",
  no_matching_scenario: "لا يوجد سيناريو مطابق لهذه القيم.",
  missing_price: "سعر الحاضر غير محدد.",
  invalid_input: "القيم المدخلة غير صحيحة.",
};
