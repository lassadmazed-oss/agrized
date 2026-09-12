import type { Database } from "@/lib/supabase/database.types";

export type LandOfferStatus = Database["public"]["Enums"]["land_offer_status"];

export const LAND_STATUS_LABELS: Record<LandOfferStatus, string> = {
  under_study: "قيد الدراسة",
  legal_review: "مراجعة قانونية",
  technical_review: "مراجعة فنية",
  field_visit: "زيارة ميدانية",
  accepted: "مقبول",
  rejected: "مرفوض",
  postponed: "مؤجّل",
  converted: "محوّل إلى مشروع",
};

export const LAND_STATUS_TONES: Record<LandOfferStatus, string> = {
  under_study: "bg-sky-50 text-sky-800 ring-sky-200",
  legal_review: "bg-violet-50 text-violet-800 ring-violet-200",
  technical_review: "bg-amber-50 text-amber-800 ring-amber-200",
  field_visit: "bg-orange-50 text-orange-800 ring-orange-200",
  accepted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rejected: "bg-stone-100 text-stone-600 ring-stone-200",
  postponed: "bg-stone-100 text-stone-700 ring-stone-200",
  converted: "bg-leaf-soft text-forest ring-leaf/30",
};

export const REVIEW_OUTCOME_LABELS = {
  passed: "مطابق",
  failed: "غير مطابق",
  needs_info: "يحتاج معلومات",
  note: "ملاحظة",
} as const;

export const CAPACITY_LABELS = { owner: "مالك", agent: "وكيل", broker: "وسيط" } as const;
export const IRRIGATION_LABELS = { rainfed: "بعلية", irrigated: "مروية" } as const;

export const REVIEW_STAGES = ["under_study", "legal_review", "technical_review", "field_visit"] as const satisfies readonly LandOfferStatus[];
export const FINAL_STATUSES = ["accepted", "rejected", "postponed", "converted"] as const satisfies readonly LandOfferStatus[];
