"use server";

// The acts of the legal desk (§16 → §21): open the file, tick a paper, record an exception, book the closing,
// say what happened to it, and keep the partner directory.
//
// Each one checks the role again here — requireStaff(LEGAL_DESK_ROLES) — and the database checks it a second
// time with app.can_contract_trees() AND app.can_see_person(), which is the rule that actually holds. Nothing
// here widens or narrows that line: a `commercial` is refused by both layers, which is §27's own example.
//
// NOTHING HERE COMPUTES A DATE, A LIMIT OR A RULE. The earliest and latest bookable day, whether a waiver is
// allowed at all, whether a legal file is required before a sale, and which papers are still missing are all
// resolved in Postgres; this file forwards what the form said and translates the refusal.
//
// THE ARABIC OF A REFUSAL LIVES BELOW, NOT IN src/lib/errors.ts. ../../visits/actions.ts and
// ../../reservations/actions.ts both document why: several sessions are writing against this schema at once,
// and a shared file edited by several hands is a merge conflict in the one place the product must not lose a
// sentence. intakeErrorMessage() is still asked first, so every code that already has an Arabic line keeps it.
//
// ███ THE ONE SENTENCE THAT BELONGS SOMEWHERE ELSE TOO. `legal_checklist_incomplete` and
// ███ `legal_file_required` are raised by the trigger in bb_72 INSIDE the contracts module's own RPCs —
// ███ staff_create_contract, staff_sign_contract and staff_set_contract_owned all go through it. So
// ███ src/app/admin/(panel)/contracts/actions.ts needs these two lines in its CONTRACT_MESSAGES as well, or
// ███ a refused signature reads «تعذّر الحفظ» at the exact moment the product should be naming the paper.

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { hasRole, requireStaff } from "@/lib/auth";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import { callPending, type RpcFailure } from "./read";
import { LEGAL_DESK_ROLES, LEGAL_WAIVE_ROLES } from "./roles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

/** Every one says what went wrong AND what to do about it, and names the setting when the limit is one. */
const LEGAL_MESSAGES: Record<string, string> = {
  legal_checklist_incomplete:
    "ما تنجمش تكمّل: فما بنود إجبارية في القائمة القانونية مازالت ما تثبّتناش فيهم. علّمهم في الملف القانوني، ولا خلّي الإدارة تتجاوز البند إذا ما ينطبقش، ثم أعد المحاولة.",
  legal_file_required:
    "الإعدادات تقول إنّ كل بيعة لازم تعدّي على المكتب القانوني. افتح الملف القانوني للحجز هذا قبل، ولا بدّل الإعداد «وقتاش يولّي الملف القانوني إجباري».",
  deposit_not_paid:
    "الملف هذا مازال ما خلّصش العربون، والمكتب القانوني ياخذ الملف بعد العربون. سجّل العربون في شاشة الحجوزات ثم أرجع لهنا.",
  reservation_not_open:
    "الحجز هذا توفّى (تلغى ولا فاتت مدّتو)، فما فماش شنوّة يتكمّل. اعمل حجز جديد إذا الحريف مازال يحب.",
  reservation_not_found: "الحجز هذا ما عادش موجود. حدّث الصفحة.",
  legal_file_not_found:
    "الملف القانوني ما عادش موجود، ولا مازال ما تفتحش. حدّث الصفحة، وإذا مازال ما تفتحش اضغط «افتح الملف القانوني».",
  legal_check_not_found: "البند هذا ما عادش موجود في الملف. حدّث الصفحة.",
  legal_check_waived: "البند هذا الإدارة علّمتو «ما ينطبقش». إذا تحب تعلّمو كـ«تثبّتنا»، لازم ترفع التجاوز أولاً.",
  legal_check_done: "البند هذا معلّم «تثبّتنا فيه» من قبل. نحّي العلامة قبل ما تعلّمو «ما ينطبقش».",
  legal_check_locked:
    "اللحظة اللي كان يوقّفها البند هذا فاتت (العقد تكتب ولا تمضى ولا التملّك تسجّل). ما نبدّلوش التاريخ وراءه — اكتب ملاحظة عوض.",
  legal_waiver_closed:
    "تجاوز البنود الإجبارية مطفي في الإعدادات. شعّل «الإدارة تنجم تتجاوز بند إجباري»، ولا جيب الوثيقة.",
  legal_waive_reason_required:
    "التجاوز يحب سبب مكتوب (10 أحرف على الأقل). هذا هو الأثر الوحيد اللي يقعد على الاستثناء، فاكتب علاش البند ما ينطبقش.",
  invalid_legal_filter: "الفرز هذا ماهوش معروف. حدّث الصفحة.",
  invalid_checklist_label: "اكتب البند كيما باش يقراه الفريق (حرفين على الأقل).",
  invalid_checklist_gate:
    "اختر وقتاش يوقّف البند: قبل ما يتكتب العقد، ولا قبل الإمضاء، ولا قبل تسجيل التملّك.",
  checklist_item_not_found: "البند هذا ما عادش موجود في القائمة. حدّث الصفحة.",
  invalid_partner_name: "اكتب اسم الشريك كامل (حرفين على الأقل).",
  invalid_partner_speciality:
    "الاختصاص هذا ما عادش متاح. اختر واحد من القائمة، ولا زيدو من الإعدادات ← القوائم ← «اختصاصات الشركاء».",
  partner_not_found: "الشريك هذا ما عادش موجود. حدّث الصفحة.",
  partner_archived: "الشريك هذا مؤرشف، وما ينجمش ياخذ موعد جديد. رجّعو للخدمة، ولا اختر شريك آخر.",
  partner_has_appointments:
    "الشريك هذا مستنّي في موعد عقد. أجّل الموعد ولا ألغيه قبل ما تأرشفو، باش ما يقعدش موعد باسم حتى حدّ.",
  appointment_date_required: "اختر نهار موعد العقد.",
  appointment_date_too_soon:
    "التاريخ قريب برشة. اختر تاريخ من بعد أقرب موعد مسموح — الرقم مكتوب تحت الخانة ويتبدّل من الإعدادات (legal.appointment_min_lead_days).",
  appointment_date_too_far:
    "التاريخ بعيد برشة. تثبّت من السنة — والحدّ الأقصى يتبدّل من الإعدادات (legal.appointment_max_ahead_days).",
  appointment_already_open:
    "الملف هذا عندو موعد عقد محدد. بدّل التاريخ في الموعد الموجود، ولا سجّل شنوّة صار فيه، قبل ما تحجز موعد جديد.",
  appointment_not_open: "الموعد هذا توفّى (تمّ ولا تلغى). احجز موعد جديد إذا يلزم.",
  appointment_not_found: "الموعد هذا ما عادش موجود. حدّث الصفحة.",
  invalid_appointment_status: "اختر «تمّ» ولا «تلغى».",
  module_closed:
    "وحدة العقود مطفية، فكتابة العقد وإمضاؤه موقّفين في قاعدة البيانات. خدمة المكتب القانوني تتحضّر عادي؛ وكي تكون جاهز شعّل «العقود ووعد البيع» من الإعدادات ← الوحدات.",
};

const FAILED = "تعذّر حفظ العملية. تحقق من الخانات وحاول مرة أخرى.";
const NOT_APPLIED =
  "وحدة المكتب القانوني مازالت ما تركّبتش في قاعدة البيانات. طبّق supabase/pending/bb_72_partners_closing.sql ثم أعد المحاولة.";

/**
 * The refusal, in Arabic.
 *
 * `legal_checklist_incomplete` is the one that earns its keep: the database puts the MISSING PAPERS in the
 * exception's DETAIL, which PostgREST forwards as `details`, so the sentence names them instead of asking the
 * reader to go hunting. That is the whole value of §20 on a screen.
 */
function legalFailure(error: RpcFailure): ActionResult {
  const known = LEGAL_MESSAGES[error.message];
  if (known) {
    const detail = typeof error.details === "string" ? error.details.trim() : "";
    if (error.message === "legal_checklist_incomplete" && detail) {
      return { ok: false, message: `${known} الباقي: ${detail}.` };
    }
    return { ok: false, message: known };
  }
  if (isKnownIntakeError(error.message)) return { ok: false, message: intakeErrorMessage(error.message) };
  if (error.code === "42501") return { ok: false, message: intakeErrorMessage("forbidden") };
  if (/does not exist/i.test(error.message)) return { ok: false, message: NOT_APPLIED };
  return { ok: false, message: FAILED };
}

async function call(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  return callPending(supabase, name, args);
}

function field(formData: FormData, name: string, max: number): string | null {
  const value = String(formData.get(name) ?? "").trim().slice(0, max);
  return value || null;
}

function uuid(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return UUID.test(value) ? value : null;
}

/** Every act on this desk is audited, and app.set_reason checks the length again. */
function reason(formData: FormData): string {
  return String(formData.get("reason") ?? "").trim().slice(0, 1000);
}

function refresh(reservationId: string | null) {
  revalidatePath("/admin/desk/legal");
  if (reservationId) revalidatePath(`/admin/desk/legal/${reservationId}`);
}

/* ---------------------------------------------------------------- §16 · the file */

/**
 * Opens the legal file for a hold whose عربون has arrived, and copies §20's active checklist onto it.
 *
 * THE COPY IS THE POINT, not a detail of the implementation: from this moment the owner may edit the
 * template freely without reaching this file, and a file that closes stays closed. Pressing it twice returns
 * the file that already exists.
 */
export async function openLegalFile(
  reservationId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(LEGAL_DESK_ROLES);
  if (!UUID.test(reservationId)) return { ok: false, message: LEGAL_MESSAGES.reservation_not_found };

  const { error } = await call("staff_open_legal_file", {
    p_reservation: reservationId,
    p_note: field(formData, "note", 4000),
    p_reason: reason(formData),
  });
  if (error) return legalFailure(error);

  refresh(reservationId);
  return { ok: true, message: "تفتح الملف القانوني، والقائمة تنسخت عليه كيما هي اليوم." };
}

export async function saveLegalNote(
  fileId: string,
  reservationId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(LEGAL_DESK_ROLES);
  if (!UUID.test(fileId)) return { ok: false, message: LEGAL_MESSAGES.legal_file_not_found };

  const { error } = await call("staff_set_legal_note", {
    p_file: fileId,
    p_note: field(formData, "note", 4000),
    p_reason: reason(formData),
  });
  if (error) return legalFailure(error);

  refresh(reservationId);
  return { ok: true, message: "تسجّلت الملاحظة." };
}

/* ------------------------------------------------------------ §20 · the checklist */

/**
 * Ticks one paper, or un-ticks it. Not a form: it is one control per row and the answer belongs beside the
 * row that caused it.
 *
 * Un-ticking behind a gate that has already passed is refused BY THE DATABASE (`legal_check_locked`), because
 * history is not edited backwards — a contract signed in March cannot be made retroactively unsigned.
 */
export async function setLegalCheck(
  checkId: string,
  reservationId: string,
  done: boolean,
  note: string | null,
): Promise<ActionResult> {
  await requireStaff(LEGAL_DESK_ROLES);
  if (!UUID.test(checkId)) return { ok: false, message: LEGAL_MESSAGES.legal_check_not_found };

  const { error } = await call("staff_set_legal_check", {
    p_check: checkId,
    p_done: done,
    p_note: note ? note.trim().slice(0, 1000) : null,
    p_reason: done ? "تثبّتنا في البند" : "رجّعنا البند للتثبّت",
  });
  if (error) return legalFailure(error);

  refresh(reservationId);
  return { ok: true, message: done ? "تعلّم البند." : "تنحّت العلامة." };
}

/**
 * The recorded exception (§20). Admin only, with a written reason, and it lands in /admin/audit.
 *
 * The role is checked here as well so the control is not drawn for a reader the database would refuse — but
 * the refusal that counts is app.is_admin() inside the RPC, and settings legal.allow_waiver can close the
 * door entirely even for an Admin.
 */
export async function waiveLegalCheck(
  checkId: string,
  reservationId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff(LEGAL_DESK_ROLES);
  if (!hasRole(session, LEGAL_WAIVE_ROLES)) return { ok: false, message: intakeErrorMessage("forbidden") };
  if (!UUID.test(checkId)) return { ok: false, message: LEGAL_MESSAGES.legal_check_not_found };

  const written = String(formData.get("waive_reason") ?? "").trim().slice(0, 1000);
  if (written.length < 10) return { ok: false, message: LEGAL_MESSAGES.legal_waive_reason_required };

  const { error } = await call("staff_waive_legal_check", { p_check: checkId, p_reason: written });
  if (error) return legalFailure(error);

  refresh(reservationId);
  return { ok: true, message: "تسجّل التجاوز مع السبب في سجل العمليات." };
}

/** Pulls items the owner added after this file was opened. Never for a gate that has already been passed. */
export async function syncLegalItems(
  fileId: string,
  reservationId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(LEGAL_DESK_ROLES);
  if (!UUID.test(fileId)) return { ok: false, message: LEGAL_MESSAGES.legal_file_not_found };

  const { data, error } = await call("staff_legal_sync_items", {
    p_file: fileId,
    p_reason: reason(formData) || "تحديث بنود القائمة القانونية",
  });
  if (error) return legalFailure(error);

  refresh(reservationId);
  const added = Number((data as { added?: unknown } | null)?.added ?? 0);
  return {
    ok: true,
    message: added > 0 ? `تزادوا ${added} بند جديد للملف.` : "ما فماش بنود جديدة تنجم تتزاد لهذا الملف.",
  };
}

/* ----------------------------------------------------------- §19 · the closing */

export async function bookClosing(
  fileId: string,
  reservationId: string,
  appointmentId: string | null,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(LEGAL_DESK_ROLES);
  if (!UUID.test(fileId)) return { ok: false, message: LEGAL_MESSAGES.legal_file_not_found };

  const meetOn = String(formData.get("meet_on") ?? "").trim();
  if (!ISO_DATE.test(meetOn)) return { ok: false, message: LEGAL_MESSAGES.appointment_date_required };
  const meetAt = String(formData.get("meet_at") ?? "").trim();

  const { error } = await call("staff_book_closing", {
    p: {
      id: appointmentId,
      legal_file_id: fileId,
      meet_on: meetOn,
      meet_at: HHMM.test(meetAt) ? meetAt : null,
      place: field(formData, "place", 300),
      partner_id: uuid(formData, "partner_id"),
      documents_note: field(formData, "documents_note", 2000),
      note: field(formData, "note", 2000),
    },
    p_reason: reason(formData) || "تحديد موعد إمضاء العقد",
  });
  if (error) return legalFailure(error);

  refresh(reservationId);
  return {
    ok: true,
    // The template row is enqueued into public.notification_outbox and nothing sends it yet, so the sentence
    // does not claim it was delivered.
    message: appointmentId
      ? "تبدّل موعد العقد. الإشعار تحطّ في صندوق الإرسال (ما فماش عامل إرسال بعد)."
      : "تحدّد موعد العقد. الإشعار تحطّ في صندوق الإرسال (ما فماش عامل إرسال بعد).",
  };
}

export async function closeAppointment(
  appointmentId: string,
  reservationId: string,
  status: "completed" | "cancelled",
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(LEGAL_DESK_ROLES);
  if (!UUID.test(appointmentId)) return { ok: false, message: LEGAL_MESSAGES.appointment_not_found };

  const { error } = await call("staff_close_appointment", {
    p_appointment: appointmentId,
    p_status: status,
    p_reason: reason(formData) || (status === "completed" ? "الموعد تمّ" : "الموعد تلغى"),
  });
  if (error) return legalFailure(error);

  refresh(reservationId);
  return { ok: true, message: status === "completed" ? "تسجّل أنّ الموعد تمّ." : "تسجّل إلغاء الموعد." };
}

/* ------------------------------------------------------- §20 · the template */

/**
 * Adds or edits one row of the checklist TEMPLATE. Admin only — app.is_admin() in the RPC is the refusal that
 * counts — because `is_mandatory` and `required_at` decide when the database refuses a sale.
 *
 * It reaches no file that already exists: every open file carries its own copy, and the gate reads only the
 * copy. That is the same property from the other side — an item added later cannot break a closed file, and
 * one deactivated later cannot silently unblock one that was already refused.
 */
export async function saveChecklistItem(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaff(LEGAL_DESK_ROLES);
  if (!hasRole(session, LEGAL_WAIVE_ROLES)) return { ok: false, message: intakeErrorMessage("forbidden") };

  const sort = String(formData.get("sort_order") ?? "").trim();
  const { error } = await call("staff_save_checklist_item", {
    p: {
      id: uuid(formData, "id"),
      label_ar: field(formData, "label_ar", 200),
      help_ar: field(formData, "help_ar", 1000),
      required_at: field(formData, "required_at", 20),
      is_mandatory: formData.get("is_mandatory") === "on",
      is_active: formData.get("is_active") === "on",
      sort_order: /^-?\d{1,6}$/.test(sort) ? Number(sort) : 0,
    },
    p_reason: reason(formData) || "تحديث القائمة القانونية",
  });
  if (error) return legalFailure(error);

  revalidatePath("/admin/desk/legal/checklist");
  return { ok: true, message: "تسجّل البند. التبديل يمشي للملفات اللي باش تتفتح من بعد برك." };
}

/* --------------------------------------------------------- §18 · the directory */

export async function savePartner(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(LEGAL_DESK_ROLES);

  const governorate = String(formData.get("governorate_id") ?? "").trim();
  const { error } = await call("staff_save_partner", {
    p: {
      id: uuid(formData, "id"),
      full_name: field(formData, "full_name", 160),
      phone_e164: field(formData, "phone_e164", 20),
      email: field(formData, "email", 200),
      office_name: field(formData, "office_name", 200),
      governorate_id: /^\d{1,3}$/.test(governorate) ? governorate : null,
      speciality_option_id: uuid(formData, "speciality_option_id"),
      is_available: formData.get("is_available") === "on",
      availability_note: field(formData, "availability_note", 300),
      note: field(formData, "note", 2000),
    },
    p_reason: reason(formData) || "تحديث دليل الشركاء",
  });
  if (error) return legalFailure(error);

  revalidatePath("/admin/desk/legal/partners");
  return { ok: true, message: "تسجّل الشريك." };
}

export async function archivePartner(
  partnerId: string,
  active: boolean,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(LEGAL_DESK_ROLES);
  if (!UUID.test(partnerId)) return { ok: false, message: LEGAL_MESSAGES.partner_not_found };

  const { error } = await call("staff_archive_partner", {
    p_partner: partnerId,
    p_active: active,
    p_reason: reason(formData) || (active ? "رجّعنا الشريك للخدمة" : "أرشفنا الشريك"),
  });
  if (error) return legalFailure(error);

  revalidatePath("/admin/desk/legal/partners");
  return { ok: true, message: active ? "رجع الشريك للخدمة." : "تأرشف الشريك." };
}
