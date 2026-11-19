// «الميدان» (0175) — the shapes the tablet reads, and the sentence for every refusal the database can give.
//
// Every figure and word here arrives from public.field_board / field_person / field_receipt; this file only
// names their shape. Kept free of "server-only" so the client forms can import the types and the messages.

import type { StaffRole } from "@/lib/auth";

/** Who opens the tablet. Mirrors app.can_edit_person(): admin, or the commercial the file is assigned to. */
export const FIELD_ROLES = ["commercial", "admin", "super_admin"] as const satisfies readonly StaffRole[];

export type FieldStep = "today" | "report" | "call" | "planned" | "done";
export type FieldResult = "took" | "deposit" | "not_now" | "disliked" | "no_show";

export type FieldPerson = {
  id: string;
  full_name: string;
  phone_e164: string | null;
  whatsapp_e164: string | null;
  governorate: string | null;
};

export type FieldRequest = {
  id: string;
  request_no: string;
  project_id: string | null;
  offer_name: string | null;
  offer_code: string | null;
  trees: number | null;
  trees_label: string | null;
  budget_label: string | null;
  payment_mode: "cash" | "installments" | null;
  monthly_millimes: number | null;
  total_millimes: number | null;
  contact_time_label: string | null;
  wants_visit: boolean | null;
  created_at: string;
} | null;

export type FieldVisit = {
  id: string;
  visit_no: string;
  status: "requested" | "confirmed" | "completed" | "no_show" | "cancelled";
  status_label: string;
  visit_date: string;
  slot_label: string | null;
  slot_from: string | null;
  slot_to: string | null;
  people_count: number;
  meeting_point: string | null;
  meeting_time: string | null;
  staff_note: string | null;
  project_id: string;
  offer: { id: string; code: string; name: string; governorate: string | null; delegation: string | null };
  assigned: { id: string; full_name: string } | null;
  field_result: FieldResult | null;
  field_reservation_id: string | null;
  map_url: string | null;
  status_changed_at: string | null;
  outcome: { liked: boolean | null; note: string | null } | null;
};

export type FieldCall = { at: string; outcome: string; note: string | null; by?: string | null };

export type BoardItem = {
  person: FieldPerson;
  assigned_at: string;
  request: FieldRequest;
  last_call: FieldCall | null;
  calls: number;
  step: FieldStep;
  visit: FieldVisit | null;
  last: FieldVisit | null;
};

export type Commercial = { id: string; full_name: string; open: number };

export type FieldBoard = {
  user: { id: string; full_name: string } | null;
  today: string;
  labels: Partial<Record<FieldResult, string>>;
  people: BoardItem[];
  commercials: Commercial[] | null;
};

export type FieldReservation = {
  id: string;
  reference_no: string;
  status: string;
  status_label: string;
  person_id: string;
  offer_name: string;
  trees_count: number;
  first_code: string | null;
  last_code: string | null;
  deposit_due_millimes: number;
  deposit_paid_millimes: number;
  expires_at: string | null;
  days_left: number | null;
  is_open: boolean;
  payments: { id: string; reference_no: string; kind: string; amount_millimes: number; voided: boolean; received_at: string }[];
};

export type FieldOffer = {
  id: string;
  code: string;
  name: string;
  meeting_point: string | null;
  available: number;
  deposit_millimes: number;
  valid_days: number;
};

export type VisitSlot = { id: string; code: string; label_ar: string; time_from: string | null; time_to: string | null };

export type FieldFile = {
  person: FieldPerson;
  can_edit: boolean;
  listed: { commercial: { id: string; full_name: string } | null; assigned_at: string } | null;
  request: FieldRequest;
  state: { step: FieldStep; visit: FieldVisit | null; last: FieldVisit | null };
  visits: FieldVisit[];
  reservation: FieldReservation | null;
  calls: FieldCall[];
  offers: FieldOffer[];
  terms: {
    today: string;
    min_date: string;
    max_date: string;
    max_people: number;
    closed_weekdays: number[];
    meeting_point: string | null;
    slots: VisitSlot[];
  };
  labels: Partial<Record<FieldResult, string>>;
  quick_amounts: number[];
  methods: { id: string; code: string; label_ar: string }[];
};

export type FieldReceipt = {
  id: string;
  reference_no: string;
  kind: string;
  amount_millimes: number;
  method_label: string | null;
  received_at: string;
  voided: boolean;
  recorded_by: string | null;
  person: { full_name: string; phone_e164: string | null; whatsapp_e164: string | null } | null;
  reservation: FieldReservation | null;
  offer: { name: string; code: string; governorate: string | null; delegation: string | null } | null;
  title: string;
  note: string;
  contact_phone: string;
};

export type Candidate = {
  person: { id: string; full_name: string; phone_e164: string | null; governorate: string | null };
  owner: string | null;
  request: FieldRequest;
  client_asked: boolean;
};

export type Candidates = {
  commercials: Commercial[];
  candidates: Candidate[];
  listed: { person: { id: string; full_name: string }; commercial_id: string; assigned_at: string; step: FieldStep }[];
};

/** What the tablet calls each step. Staff copy, like every Back Office heading. */
export const STEP_LABELS: Record<FieldStep, string> = {
  today: "زيارة اليوم",
  report: "يستنّى النتيجة",
  call: "كلّمو",
  planned: "عندو موعد",
  done: "كمل",
};

/** The calls the tablet can log, in the words a commercial uses. Codes are public.contact_outcome. */
export const CALL_OUTCOMES = [
  { code: "answered", label: "ردّ" },
  { code: "no_answer", label: "ما ردّش" },
  { code: "callback", label: "قال عاود عيّطلي" },
  { code: "not_interested", label: "ما يحبّش" },
] as const;

const ERRORS: Record<string, string> = {
  forbidden: "الملف هذا موش متاعك. اطلب من الإدارة تعطيهولك من «وزّع الزيارات».",
  person_not_found: "الحريف هذا ما عادش موجود. ارجع للّيستا.",
  invalid_visit_project: "اختار العرض اللي باش يزورو.",
  invalid_visit_time: "اختار الساعة.",
  visit_time_outside_slots: "الساعة هذي برّا أوقات الزيارة. اختار ساعة من اللي ظاهرين.",
  visit_date_required: "اختار النهار.",
  visit_date_in_past: "النهار هذا فات. اختار نهار جاي.",
  visit_date_too_soon: "النهار هذا قريب برشا على الإعدادات متاع الزيارات. اختار نهار من بعد.",
  visit_date_too_far: "النهار هذا بعيد برشا. اختار نهار أقرب.",
  visit_day_closed: "النهار هذا ما فيهش زيارات. اختار نهار آخر.",
  invalid_visit_people: "عدد الناس موش مقبول. اختار عدد من الأزرار.",
  visit_not_found: "الزيارة هذي ما عادش موجودة. حدّث الصفحة.",
  visit_already_reported: "نتيجة الزيارة هذي تسجّلت قبل. حدّث الصفحة.",
  invalid_field_result: "اختار النتيجة.",
  invalid_tree_count: "اكتب قدّاش من زيتونة خذا (واحدة على الأقل).",
  invalid_deposit_amount: "اكتب قدّاش خلّص عربون (أكثر من صفر).",
  invalid_payment_method: "اختار كيفاش خلّص.",
  not_enough_trees: "ما فمّاش زيتونات فارغة بالعدد هذا في العرض. نقّص العدد ولا اختار عرض آخر.",
  below_min_trees: "العرض هذا يطلب عدد أكبر من الزيتونات. زيد العدد.",
  offer_not_available: "العرض هذا موش متوفّر للحجز توّا. كلّم الإدارة.",
  module_closed: "الحجز مسكّر توّا في الإعدادات. كلّم الإدارة.",
  target_not_active_commercial: "اختار كوميرسيال خدّام.",
  payment_not_found: "الوصل هذا ما عادش موجود.",
};

/** The database's error word, said as a sentence that tells the commercial what to do. */
export function fieldError(message: string | undefined | null): string {
  const key = (message ?? "").trim();
  return ERRORS[key] ?? "ما تسجّلش. ثبّت في الخانات وعاود، وإذا تعاودت كلّم الإدارة.";
}

/** «+21698123456» → «98 123 456» for reading aloud; the link keeps the full number. */
export function phoneDisplay(phone: string | null): string {
  if (!phone) return "";
  const local = phone.startsWith("+216") ? phone.slice(4) : phone;
  return local.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1 $2 $3");
}

export function waHref(phone: string | null, text?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** The hours a commercial can pick: every hour and half-hour inside the owner's visit slots. */
export function slotHours(slots: readonly VisitSlot[]): string[] {
  const out: string[] = [];
  for (const slot of slots) {
    if (!slot.time_from || !slot.time_to) continue;
    const [fh, fm] = slot.time_from.split(":").map(Number);
    const [th, tm] = slot.time_to.split(":").map(Number);
    for (let minutes = fh * 60 + fm; minutes < th * 60 + tm; minutes += 30) {
      const label = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      if (!out.includes(label)) out.push(label);
    }
  }
  return out;
}
