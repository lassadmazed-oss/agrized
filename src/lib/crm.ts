import type { Database } from "@/lib/supabase/database.types";

export type LeadStage = Database["public"]["Enums"]["lead_stage"];
export type ContactChannel = Database["public"]["Enums"]["contact_channel"];
export type ContactOutcome = Database["public"]["Enums"]["contact_outcome"];

/** Fixed system stages (spec 8.1). Labels shown to staff come from lead_statuses. */
export const STAGE_LABELS: Record<LeadStage, string> = {
  new: "جديد",
  contacting: "قيد الاتصال",
  qualified: "مؤهَّل",
  proposed: "تم اقتراح مشروع",
  visit: "زيارة",
  reserved: "حجز",
  contracting: "في طور التعاقد",
  owner: "مالك",
  paused: "غير مهتم حالياً",
  closed: "مغلق",
};

/** Status chip colors. Semantic, independent from the brand accent. */
export const STAGE_TONES: Record<LeadStage, string> = {
  new: "bg-sky-50 text-sky-800 ring-sky-200",
  contacting: "bg-amber-50 text-amber-800 ring-amber-200",
  qualified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  proposed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  visit: "bg-violet-50 text-violet-800 ring-violet-200",
  reserved: "bg-orange-50 text-orange-800 ring-orange-200",
  contracting: "bg-violet-50 text-violet-800 ring-violet-200",
  owner: "bg-leaf-soft text-forest ring-leaf/30",
  paused: "bg-stone-100 text-stone-700 ring-stone-200",
  closed: "bg-stone-100 text-stone-600 ring-stone-200",
};

export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone: "هاتف",
  whatsapp: "WhatsApp",
  both: "هاتف وWhatsApp",
};

export const OUTCOME_LABELS: Record<ContactOutcome, string> = {
  answered: "تم الرد",
  no_answer: "لم يرد",
  wrong_number: "رقم خاطئ",
  callback: "طلب إعادة الاتصال",
  not_interested: "غير مهتم حالياً",
};

/** Clause 25: plantation system and production status, kept separate from area and price. */
export const PLANTATION_LABELS: Record<string, string> = {
  traditional: "تقليدية",
  intensive: "مكثفة",
  other: "نظام آخر",
};

export const PRODUCTION_LABELS: Record<string, string> = {
  none: "غير منتج",
  starting: "بداية إنتاج",
  producing: "منتج",
};

export const ATTEMPT_CHANNEL_LABELS: Record<string, string> = {
  phone: "مكالمة",
  whatsapp: "WhatsApp",
  sms: "SMS",
  other: "أخرى",
};
