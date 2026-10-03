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

export type ContactCapacity = Database["public"]["Enums"]["contact_capacity"];
export type IrrigationType = Database["public"]["Enums"]["irrigation_type"];

/**
 * The words the PUBLIC site prints for these values live in settings, in the visitor's language: these are
 * their keys — `t(config, IRRIGATION_TEXT_KEYS[value])` on the server, `useT()(CAPACITY_TEXT_KEYS[value])` in a
 * Client Component under <Texts prefixes={["ui.land."]}>. The *_LABELS above stay the Back Office's Arabic.
 * Client-safe: this file imports types only.
 */
export const CAPACITY_TEXT_KEYS = {
  owner: "ui.land.capacity_owner",
  agent: "ui.land.capacity_agent",
  broker: "ui.land.capacity_broker",
} as const satisfies Record<ContactCapacity, string>;

export const IRRIGATION_TEXT_KEYS = {
  rainfed: "ui.land.irrigation_rainfed",
  irrigated: "ui.land.irrigation_irrigated",
} as const satisfies Record<IrrigationType, string>;

export const REVIEW_STAGES = ["under_study", "legal_review", "technical_review", "field_visit"] as const satisfies readonly LandOfferStatus[];
export const FINAL_STATUSES = ["accepted", "rejected", "postponed", "converted"] as const satisfies readonly LandOfferStatus[];
