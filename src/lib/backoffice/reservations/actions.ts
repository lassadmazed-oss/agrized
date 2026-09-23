"use server";

// The five acts of §23 and §24, each one a call to a security-definer RPC that checks the role again and
// writes its own audit row. Nothing here computes a deposit, a deadline or a status: the amounts, the expiry
// and «Deposit Paid» are all decided in Postgres, and this file passes values and reports sentences.
//
// THE ROLES, and why they are checked here as well as in SQL:
//   createReservation   CRM_READ_ROLES, and the database narrows it to app.can_see_person — a commercial
//                       reserves inside their own file, Admin/Finance/Legal on any, the agricultural manager
//                       never. Checked here only so a refusal is a readable Arabic sentence instead of a
//                       Postgres error; the database decides.
//   recordDeposit ·     PRICE_ROLES (finance · admin · super_admin), which is exactly app.can_record_money().
//   voidPayment ·       Report v3 §33 puts collections under Finance, and §24 gives «يمدد · يلغي · يرجع
//   extendReservation · القطعة Available» to the Admin. The release half additionally needs
//   closeReservation    app.can_manage_trees, and that list meets app.can_see_person on Finance and Admin
//                       only — the same three roles, so one gate covers both halves of the close.
//
// CANCELLING IS ONE CALL. staff_close_reservation ends the paperwork AND frees the trees inside one
// transaction. Sequencing «cancel» then «release» from here is how you get a cancelled reservation whose
// forty trees stay marked reserved the first time the second call is refused.

import { revalidatePath, updateTag } from "next/cache";

import { CRM_READ_ROLES, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { PUBLIC_PROJECTS_TAG } from "@/lib/public-projects";
import { createClient } from "@/lib/supabase/server";

import { parseReservation, type ReservationResult } from "@/lib/backoffice/reservations/model";
import { callPending } from "@/lib/backoffice/reservations/read";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The codes this module's RPCs raise, in Arabic, each saying what happened AND what to do about it.
 *
 * THEY BELONG IN src/lib/errors.ts and are here for one reason: three modules were built in the same batch and
 * that file is shared, so three agents editing it at once would collide. The handover note carries these lines
 * verbatim for whoever merges them; until then intakeErrorMessage() is consulted first for every code the rest
 * of the product already speaks (forbidden, below_min_trees, not_enough_trees, invalid_person…), and only the
 * codes below are answered locally.
 *
 * ONE key here also exists in @/lib/errors, on purpose: `module_closed` is raised by every module-gated RPC in
 * the product, so errors.ts answers it in module-neutral words for whoever has no map of their own. This map is
 * consulted FIRST, which is how the line below gets to name «العربون والحجز» and the switch that turns it on.
 * The other eleven keys are this module's alone and are still owed to errors.ts by whoever merges the batch.
 */
const RESERVATION_MESSAGES: Record<string, string> = {
  module_closed:
    "موديول «العربون والحجز» مازال معطّل، فالحجز وتسجيل العربون موقّفين. شغّلو من الإعدادات ← الموديولات: «داخلي فقط» باش يخدم الفريق برك، ولا «منشور للعموم» كي تكون جاهز.",
  reservation_not_found:
    "هذا الحجز ما عادش موجود. حدّث الصفحة وافتح الحجز من جديد من قائمة الحجوزات.",
  reservation_closed:
    "هذا الحجز تسكّر (تلغى ولا انتهت مدّته ولا ولّى عقد)، فما عادش تنجم تبدّل فيه. إذا الحريف رجع، اعمل حجز جديد من ملفّه.",
  deposit_not_due:
    "هذا العرض ما يطلبش عربون، فما فماش شنوّة يتسجّل. إذا لازمو عربون، اكتب المبلغ في بطاقة العرض ثم اعمل حجز جديد.",
  invalid_deposit_amount:
    "اكتب المبلغ بالدينار، أكبر من صفر. مثال: 50 ولا 50.500",
  invalid_payment_method:
    "طريقة الدفع هاذي ما عادتش متاحة. اختار وحدة من القائمة، ولا زيدها في الإعدادات ← القوائم ← «طرق الدفع المقبولة».",
  payment_not_found: "هذه الدفعة ما عادتش موجودة. حدّث الصفحة وأعد المحاولة.",
  payment_already_void: "هذه الدفعة موقّفة من قبل. ما فماش شنوّة يتعاود.",
  invalid_extend_days:
    "اكتب عدد الأيام بالأرقام، من يوم واحد فما فوق. خلّيها فارغة باش يعاود الحجز نفس مدة العرض.",
  extend_over_cap:
    "عدد الأيام أكبر من السقف المسموح في التمديد الواحد. نقّص العدد، ولا بدّل «أقصى تمديد في المرة الواحدة» في الإعدادات.",
  invalid_reservation_outcome:
    "اختر شنوّة صار بالحجز: «ألغيه» ولا «انتهت مدّته». تحويلو لعقد يصير من وحدة العقود كي تتبنى.",
  invalid_reservation_filter: "هذا الفرز ما عادش موجود. ارجع لقائمة الحجوزات واختر من الفرزات المعروضة.",
};

const FAILED = "تعذّرت العملية ولم يتغيّر أي شيء. حدّث الصفحة وحاول مرة أخرى.";

/** A refusal in words: this module's own codes first, then the ones the rest of the product already speaks. */
function failure(error: { message: string; code?: string }): { ok: false; message: string } {
  const local = RESERVATION_MESSAGES[error.message];
  if (local) return { ok: false, message: local };
  if (isKnownIntakeError(error.message)) return { ok: false, message: intakeErrorMessage(error.message) };
  if (error.code === "42501") return { ok: false, message: intakeErrorMessage("forbidden") };
  return { ok: false, message: FAILED };
}

function refuse(code: string): { ok: false; message: string } {
  return failure({ message: code });
}

function done(data: unknown): ReservationResult {
  const reservation = parseReservation(data);
  if (!reservation) return { ok: false, message: FAILED };
  return { ok: true, reservation };
}

/**
 * Every screen that reads a reservation, a client file or an offer's stock.
 *
 * A hold moves the four public counts (public_offer_stock) as much as an allocation does, so the public
 * offer pages expire with it — a visitor must not read «12 متاحة» from a cached page after three of them
 * were just held.
 */
function reservationsChanged(personId?: string | null) {
  revalidatePath("/admin/reservations");
  revalidatePath("/admin");
  revalidatePath("/admin/leads", "layout");
  revalidatePath("/admin/projects", "layout");
  if (personId) revalidatePath(`/admin/leads/${personId}`);
  updateTag(PUBLIC_PROJECTS_TAG);
  revalidatePath("/projects", "layout");
}

/**
 * §23 · Opens a reservation on an offer for a client.
 *
 * The trees are taken by 0054's engine inside the same transaction — the lowest-numbered available ones, all
 * of them or none — and the deposit, the validity period and the conditions are copied from the offer's own
 * terms at that moment, so editing the offer next week cannot rewrite what this client was told today.
 * Nothing here chooses a tree or works out an amount.
 */
export async function createReservation(input: {
  projectId: string;
  personId: string;
  requestId?: string | null;
  trees: number;
  note?: string | null;
  reason?: string | null;
}): Promise<ReservationResult> {
  await requireStaff(CRM_READ_ROLES);

  if (!UUID.test(input.projectId)) return refuse("offer_not_available");
  if (!UUID.test(input.personId)) return refuse("invalid_person");
  const requestId = input.requestId ?? null;
  if (requestId !== null && !UUID.test(requestId)) return refuse("invalid_request");

  const trees = Number(input.trees);
  if (!Number.isInteger(trees) || trees < 1) return refuse("invalid_offer_trees");

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_create_reservation", {
    p_project: input.projectId,
    p_person: input.personId,
    p_request: requestId,
    p_trees: trees,
    p_note: String(input.note ?? "").trim().slice(0, 1000) || null,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  reservationsChanged(input.personId);
  return done(data);
}

/**
 * §23 · Records money received against a reservation.
 *
 * The amount is typed in dinars because that is what a person says on the phone; the multiplication by 1000 is
 * a UNIT conversion, not a business formula — the same one src/app/admin/(panel)/projects/actions.ts already
 * does for every price field. What is owed, what is left and whether the عربون is settled are all computed in
 * SQL from the rows this call writes.
 */
export async function recordDeposit(input: {
  reservationId: string;
  amountDinars: number;
  methodOptionId?: string | null;
  receivedAt?: string | null;
  reference?: string | null;
  note?: string | null;
  reason?: string | null;
}): Promise<ReservationResult> {
  await requireStaff(PRICE_ROLES);

  if (!UUID.test(input.reservationId)) return refuse("reservation_not_found");

  const dinars = Number(input.amountDinars);
  if (!Number.isFinite(dinars) || dinars <= 0) return refuse("invalid_deposit_amount");
  const millimes = Math.round(dinars * 1000);
  if (!Number.isSafeInteger(millimes) || millimes <= 0) return refuse("invalid_deposit_amount");

  const method = input.methodOptionId ?? null;
  if (method !== null && !UUID.test(method)) return refuse("invalid_payment_method");

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : null;
  if (receivedAt && Number.isNaN(receivedAt.getTime())) {
    return { ok: false, message: "التاريخ موش صحيح. اختر تاريخاً من الروزنامة، ولا خلّيه فارغ باش ياخذ تاريخ اليوم." };
  }

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_record_deposit", {
    p_reservation: input.reservationId,
    p_amount_millimes: millimes,
    p_method: method,
    p_received_at: receivedAt ? receivedAt.toISOString() : null,
    p_reference: String(input.reference ?? "").trim().slice(0, 120) || null,
    p_note: String(input.note ?? "").trim().slice(0, 1000) || null,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  reservationsChanged();
  return done(data);
}

/** Marks a recorded payment void, keeping the row. The way a wrong amount is corrected (§59). */
export async function voidPayment(input: { paymentId: string; reason?: string | null }): Promise<ReservationResult> {
  await requireStaff(PRICE_ROLES);
  if (!UUID.test(input.paymentId)) return refuse("payment_not_found");

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_void_payment", {
    p_payment: input.paymentId,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  reservationsChanged();
  return done(data);
}

/**
 * §24, first choice: «يمدد». Days empty repeats the offer's own period. The new date is computed in Postgres
 * from the deadline it had, or from today when that deadline has already passed.
 */
export async function extendReservation(input: {
  reservationId: string;
  days?: number | null;
  reason?: string | null;
}): Promise<ReservationResult> {
  await requireStaff(PRICE_ROLES);
  if (!UUID.test(input.reservationId)) return refuse("reservation_not_found");

  const days = input.days === null || input.days === undefined || input.days === 0 ? null : Number(input.days);
  if (days !== null && (!Number.isInteger(days) || days < 1)) return refuse("invalid_extend_days");

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_extend_reservation", {
    p_reservation: input.reservationId,
    p_days: days,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  reservationsChanged();
  return done(data);
}

/**
 * §24, the other two choices, in one call: «يلغي» closes the paperwork and `release` also puts its trees back
 * to available — the same transaction, so a closed hold can never leave its stock frozen.
 */
export async function closeReservation(input: {
  reservationId: string;
  outcome: "cancelled" | "expired";
  release: boolean;
  reason?: string | null;
}): Promise<ReservationResult> {
  await requireStaff(PRICE_ROLES);
  if (!UUID.test(input.reservationId)) return refuse("reservation_not_found");
  if (input.outcome !== "cancelled" && input.outcome !== "expired") return refuse("invalid_reservation_outcome");

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_close_reservation", {
    p_reservation: input.reservationId,
    p_outcome: input.outcome,
    p_release: Boolean(input.release),
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  reservationsChanged();
  return done(data);
}
