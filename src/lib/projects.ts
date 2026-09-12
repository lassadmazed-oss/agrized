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

/** Plot statuses of clause 11.1. They change through events, not free editing (COM-01). */
export const PARCEL_STATUS_LABELS: Record<ParcelStatus, string> = {
  available: "متاحة",
  interested: "مهتم بها",
  reserved: "محجوزة",
  contracting: "في طور التعاقد",
  sold: "متعاقد عليها",
  withdrawn: "موقوفة",
};

export const PARCEL_STATUS_TONES: Record<ParcelStatus, string> = {
  available: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  interested: "bg-sky-50 text-sky-800 ring-sky-200",
  reserved: "bg-orange-50 text-orange-800 ring-orange-200",
  contracting: "bg-violet-50 text-violet-800 ring-violet-200",
  sold: "bg-stone-100 text-stone-700 ring-stone-200",
  withdrawn: "bg-danger-soft text-danger ring-danger/30",
};

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

export const PLAN_REASON_LABELS: Record<string, string> = {
  installment_too_low: "القسط غير كافٍ لهذه القطعة.",
  down_payment_too_low: "التسبقة أقل من الحد الأدنى لهذه القطعة.",
  too_many_months: "المدة تتجاوز الحد الأقصى المسموح.",
  no_matching_scenario: "لا يوجد سيناريو مطابق لهذه القيم.",
  missing_price: "سعر الحاضر غير محدد.",
  invalid_input: "القيم المدخلة غير صحيحة.",
};
