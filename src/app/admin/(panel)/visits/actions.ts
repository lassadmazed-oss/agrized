"use server";

// The three acts of the visits module (report v3 §25): book one, move it along, reschedule it.
//
// Each one checks the role again here — requireStaff(CRM_READ_ROLES) — and the database checks it a second time
// with app.is_staff() AND app.can_see_person(), which is the rule that actually holds: a commercial books only
// inside a file assigned to them, Finance, Legal and Admin book anywhere, and the agricultural manager books
// nothing at all because they read no client file. Nothing here widens or narrows that line.
//
// NOTHING HERE COMPUTES A DATE, A DELAY OR A CEILING. The earliest and latest bookable day, the number of people
// allowed, the available times and the closed weekdays are resolved by app.visit_terms and enforced by
// app.assert_visit_booking; this file forwards what the form said and translates the refusal.
//
// THE ARABIC OF A REFUSAL LIVES BELOW, NOT IN src/lib/errors.ts, ON PURPOSE. Three modules were written against
// this schema at the same time and each one had new codes; a shared file edited by three hands is a merge
// conflict in the one place the product must not lose a sentence. These eight lines belong in
// src/lib/errors.ts and should be moved there by whoever wires the modules together — the handover says so, and
// intakeErrorMessage() is still asked first so every code that already has an Arabic line keeps it.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every one says what went wrong AND what to do about it, and names the setting when the limit is one. */
const VISIT_MESSAGES: Record<string, string> = {
  visits_disabled:
    "موديول الزيارات مطفي للزوّار، فالحريف ما ينجمش يطلب زيارة من الموقع. الفريق يبرمج عادي من هنا؛ وإذا تحب تفتحو للعموم شعّل «الزيارات الميدانية» في الإعدادات › الموديولات.",
  visit_not_found: "الزيارة هذي ما عادتش موجودة. حدّث الصفحة وأعد المحاولة.",
  visit_not_open:
    "الزيارة هذي توفّات (تمّت ولا ما حضرش الحريف ولا تلغات)، وما تتبدّلش من بعد. إذا فما موعد جديد، برمج زيارة جديدة.",
  visit_date_required: "اختر تاريخ الزيارة.",
  visit_date_in_past: "التاريخ هذا فات. اختر تاريخ جاي.",
  visit_date_too_soon:
    "التاريخ قريب برشة. اختر تاريخ من بعد أقرب موعد مسموح — الرقم مكتوب تحت الخانة ويتبدّل من الإعدادات (visits.min_lead_days).",
  visit_date_too_far:
    "التاريخ بعيد برشة. اختر تاريخ داخل المدة المسموحة — مكتوبة تحت الخانة وتتبدّل من الإعدادات (visits.max_ahead_days).",
  visit_day_closed:
    "النهار هذا ما فيهش زيارات. اختر نهار آخر، ولا بدّل «أيام ما فيهاش زيارات» في الإعدادات.",
  invalid_visit_slot:
    "اختر التوقيت من القائمة. الأوقات المعروضة تتزاد وتتنحّى من الإعدادات › القوائم، في قائمة «توقيت الزيارة المتوفر».",
  invalid_visit_people:
    "عدد الأشخاص موش صحيح. اكتب عدد من 1 حتى الحدّ الأقصى المكتوب تحت الخانة (إعداد visits.max_people).",
  invalid_visit_status: "حالة الزيارة موش صحيحة. اختر وحدة من الحالات المعروضة.",
  invalid_visit_transition:
    "ما تنجمش تنقّل الزيارة للحالة هذي من حالتها الحالية. أكّد الزيارة قبل ما تسجّل «تمّت» ولا «ما حضرش»، والزيارة اللي وفّات ما ترجعش.",
  invalid_visit_project: "العرض هذا ما عادش موجود. حدّث الصفحة واختر عرضاً آخر.",
  invalid_visit_request:
    "المطلب هذا موش متاع نفس الحريف ولا موش متاع هذا العرض. اختر مطلباً متاع الحريف في نفس العرض، ولا برمج الزيارة بلا مطلب.",
  visit_offer_required: "المطلب هذا ما فيهش عرض محدّد. اختر العرض اللي باش يزورو الحريف.",
};

const FAILED = "تعذّر حفظ الزيارة. تحقق من القيم وحاول مرة أخرى.";

type RpcAnswer = { data: unknown; error: { message: string; code?: string } | null };

async function callVisitRpc(name: string, args: Record<string, unknown>): Promise<RpcAnswer> {
  const supabase = await createClient();
  // The same one-line cast as ./visit-data: the RPCs arrive with supabase/pending/bb_21_visits.sql, so the
  // generated types do not know them until that draft is applied and `npm run db:types` is run.
  const rpc = supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<RpcAnswer>;
  return rpc(name, args);
}

function visitFailure(error: { message: string; code?: string }): ActionResult {
  if (VISIT_MESSAGES[error.message]) return { ok: false, message: VISIT_MESSAGES[error.message] };
  if (isKnownIntakeError(error.message)) return { ok: false, message: intakeErrorMessage(error.message) };
  if (error.code === "42501") return { ok: false, message: intakeErrorMessage("forbidden") };
  // The most likely cause on a machine where the draft has not been applied yet, said plainly.
  if (/does not exist/i.test(error.message)) {
    return { ok: false, message: "موديول الزيارات مازال ما تركّبش في قاعدة البيانات. طبّق supabase/pending/bb_21_visits.sql ثم أعد المحاولة." };
  }
  return { ok: false, message: FAILED };
}

function text(formData: FormData, name: string, max: number): string | null {
  const value = String(formData.get(name) ?? "").trim().slice(0, max);
  return value || null;
}

function uuid(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return UUID.test(value) ? value : null;
}

const bookSchema = z.object({
  person_id: z.string().regex(UUID),
  project_id: z.string().regex(UUID),
  visit_date: z.string().regex(ISO_DATE),
  slot_option_id: z.string().regex(UUID),
  people_count: z.coerce.number().int().min(1),
  contact_channel: z.enum(["phone", "whatsapp", "both"]),
  status: z.enum(["requested", "confirmed"]),
});

/**
 * Books a field visit for one client on one offer.
 *
 * It is the same action from both screens — the board's waiting list and the card on a client's file — because
 * it is the same act: the demand that asked for the visit is carried along when there is one, and the offer is
 * chosen here when the demand named none, which is 22 of the 25 wishes standing in the database today.
 */
export async function bookVisit(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);

  const parsed = bookSchema.safeParse({
    person_id: String(formData.get("person_id") ?? ""),
    project_id: String(formData.get("project_id") ?? ""),
    visit_date: String(formData.get("visit_date") ?? ""),
    slot_option_id: String(formData.get("slot_option_id") ?? ""),
    people_count: String(formData.get("people_count") ?? "1"),
    contact_channel: String(formData.get("contact_channel") ?? "phone"),
    status: String(formData.get("status") ?? "requested"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "project_id") return { ok: false, message: "اختر العرض اللي باش يزورو الحريف." };
    if (field === "visit_date") return { ok: false, message: VISIT_MESSAGES.visit_date_required };
    if (field === "slot_option_id") return { ok: false, message: VISIT_MESSAGES.invalid_visit_slot };
    if (field === "people_count") return { ok: false, message: VISIT_MESSAGES.invalid_visit_people };
    return { ok: false, message: "تحقق من خانات الزيارة: العرض والتاريخ والتوقيت وعدد الأشخاص." };
  }

  const { data, error } = await callVisitRpc("staff_book_visit", {
    p: {
      ...parsed.data,
      request_id: uuid(formData, "request_id"),
      assigned_to: uuid(formData, "assigned_to"),
      meeting_point: text(formData, "meeting_point", 300),
      staff_note: text(formData, "staff_note", 2000),
      client_note: text(formData, "client_note", 2000),
    },
    p_reason: text(formData, "reason", 1000),
  });
  if (error) return visitFailure(error);

  const payload = (data ?? {}) as { visit_no?: string };
  revalidatePath("/admin/visits");
  revalidatePath(`/admin/leads/${parsed.data.person_id}`);
  return {
    ok: true,
    message: payload.visit_no ? `تبرمجت الزيارة تحت رقم ${payload.visit_no}.` : "تبرمجت الزيارة.",
  };
}

/**
 * Moves a visit between the five statuses §25 names. «تمّت» carries what came out of the visit — whether the
 * client liked the land, which offer they chose and what happens next — because a Completed with nothing
 * written down is a tick, and the sales question the visit exists to answer is lost with it.
 */
export async function setVisitStatus(visitId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);
  if (!UUID.test(visitId)) return { ok: false, message: VISIT_MESSAGES.visit_not_found };

  const status = String(formData.get("status") ?? "").trim();
  if (!["requested", "confirmed", "completed", "no_show", "cancelled"].includes(status)) {
    return { ok: false, message: VISIT_MESSAGES.invalid_visit_status };
  }

  const liked = String(formData.get("outcome_liked") ?? "").trim();
  const { data, error } = await callVisitRpc("staff_set_visit_status", {
    p_visit: visitId,
    p_status: status,
    p: {
      meeting_point: text(formData, "meeting_point", 300),
      assigned_to: uuid(formData, "assigned_to"),
      staff_note: text(formData, "staff_note", 2000),
      cancel_reason: text(formData, "cancel_reason", 500),
      outcome_liked: liked === "yes" ? true : liked === "no" ? false : null,
      outcome_project_id: uuid(formData, "outcome_project_id"),
      outcome_next_step: text(formData, "outcome_next_step", 500),
      outcome_note: text(formData, "outcome_note", 2000),
    },
    p_reason: text(formData, "reason", 1000),
  });
  if (error) return visitFailure(error);

  const payload = (data ?? {}) as { status_label?: string; person?: { id?: string } };
  revalidatePath("/admin/visits");
  if (payload.person?.id) revalidatePath(`/admin/leads/${payload.person.id}`);
  return { ok: true, message: payload.status_label ? `الزيارة ولّات «${payload.status_label}».` : "تسجّلت الحالة." };
}

/** Rescheduling, and the Back Office's own fields. Refused once the visit has ended (visit_not_open). */
export async function rescheduleVisit(visitId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);
  if (!UUID.test(visitId)) return { ok: false, message: VISIT_MESSAGES.visit_not_found };

  const date = String(formData.get("visit_date") ?? "").trim();
  if (date && !ISO_DATE.test(date)) return { ok: false, message: VISIT_MESSAGES.visit_date_required };
  const people = String(formData.get("people_count") ?? "").trim();
  if (people && !/^\d{1,3}$/.test(people)) return { ok: false, message: VISIT_MESSAGES.invalid_visit_people };

  const { data, error } = await callVisitRpc("staff_update_visit", {
    p_visit: visitId,
    p: {
      visit_date: date || null,
      slot_option_id: uuid(formData, "slot_option_id"),
      people_count: people || null,
      contact_channel: text(formData, "contact_channel", 20),
      meeting_point: text(formData, "meeting_point", 300),
      assigned_to: uuid(formData, "assigned_to"),
      staff_note: text(formData, "staff_note", 2000),
    },
    p_reason: text(formData, "reason", 1000),
  });
  if (error) return visitFailure(error);

  const payload = (data ?? {}) as { person?: { id?: string } };
  revalidatePath("/admin/visits");
  if (payload.person?.id) revalidatePath(`/admin/leads/${payload.person.id}`);
  return { ok: true, message: "تبدّل موعد الزيارة." };
}
