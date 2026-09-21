"use server";

// The acts of §28-§31, each one a call to a security-definer RPC that checks the role again and writes its own
// audit row. Nothing here computes a price, a schedule, a balance or a lateness: the plan is snapshotted in
// Postgres by one call to app.financed_quote inside staff_create_contract, and everything downstream is
// derived from that snapshot and the live payment rows by app.contract_money.
//
// EVERY SIGNATURE BELOW MATCHES supabase/pending/bb_60_contracts_installments.sql EXACTLY — argument names,
// order and all. They were written against that draft after reading it, not against a guess, which is the
// difference between screens that work the day it is applied and screens that raise PGRST202 forever.
//
// THE ROLES, and why they are checked here as well as in SQL:
//   createContract ·   CONTRACT_ROLES = app.can_contract_trees() (legal · finance · admin · super_admin), and
//   signContract ·     the database narrows it with app.can_see_person. The commercial who sold the deal
//   setOwned ·         cannot sign it — 0054:85's rule, not this module's.
//   generateSchedule
//   recordPayment ·    PRICE_ROLES, which is exactly app.can_record_money(). Legal is excluded on purpose:
//   voidPayment        «signing the contract and taking the cash are two different desks» (0063:98).
//   cancelContract     CANCEL_ROLES — can_contract_trees ∩ can_manage_trees ∩ can_see_person meets on
//                      finance · admin · super_admin, because cancelling has to decide what happens to trees.
//
// CREATING A CONTRACT IS ONE CALL. staff_create_contract converts the reservation (status='converted' AND
// closed_at, which reservations_closed_check at 0063:325 makes inseparable), sells its trees through
// app.sell_reservation_trees, snapshots the quote and writes the row — one transaction. Sequencing «convert»
// then «sell» from here is how you get a converted reservation whose forty trees are still marked `reserved`
// the first time the second call is refused; 0063:1055 already says so about cancel/release.
//
// NOTHING HERE EVER CANCELS A CONTRACT ON A TIMER. Both documents forbid it in the same words (v2 §36 «لا
// يوجد فسخ آلي», v3 §31 «ما نخليوش النظام يلغي… وحده»), so every state change below is a human act with a
// reason, and lateness is a READ.

import { revalidatePath, updateTag } from "next/cache";

import { PRICE_ROLES, requireStaff } from "@/lib/auth";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { PUBLIC_PROJECTS_TAG } from "@/lib/public-projects";
import { createClient } from "@/lib/supabase/server";

import { dinarsToMillimes } from "../pricing/form-values";
import { parseContract, type ContractResult, type MoneyResult } from "./contract-model";
import { callPending, type RpcFailure } from "./read";
import { CANCEL_ROLES, CONTRACT_ROLES } from "./roles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The codes these RPCs raise, in Arabic, each saying what happened AND what to do about it. Every key was read
 * off the draft's own `raise exception` lines, so none of them is a sentence for an error that cannot arrive.
 *
 * THEY BELONG IN src/lib/errors.ts and are here for the reason the reservations module already wrote down at
 * src/app/admin/(panel)/reservations/actions.ts:48: that file is 120 lines shared by every module, several
 * sessions are editing this repository at once, and agents writing into it in the same batch collide. The
 * handover carries every line below verbatim for whoever merges them; until then intakeErrorMessage() answers
 * every code the rest of the product already speaks (forbidden, invalid_person, reason_required…) and only the
 * codes below are answered locally.
 *
 * ONE key here also exists in @/lib/errors, on purpose: `module_closed` is raised by every module-gated RPC in
 * the product, so errors.ts answers it in module-neutral words for whoever has no map. This map is consulted
 * FIRST, which is how the line below gets to name both switches — app.assert_contracts_open() and
 * app.assert_installments_open() raise the SAME code, so one sentence has to cover both and point at the
 * screen where either is turned on.
 */
const CONTRACT_MESSAGES: Record<string, string> = {
  module_closed:
    "العملية هاذي موقّفة خاطر الموديول معطّل: كتابة العقد وإمضاؤه يحبّو «العقود ووعد البيع»، وتسجيل الأقساط يحبّ «الأقساط». شغّل اللي يلزم من الإعدادات ← الموديولات: «داخلي فقط» تكفي باش يخدم بيه الفريق.",

  // -- the doorway from a reservation (0063: 'converted' has exactly one writer, and this is it) ------------
  reservation_not_found:
    "هذا الحجز ما عادش موجود. حدّث الصفحة وافتح ملفّ الحريف من جديد باش تشوف حجوزاتو الحيّة.",
  reservation_not_convertible:
    "هذا الحجز ما ينجمش يولّي عقد: تلغى ولا انتهت مدّته ولا ولّى عقد قبل. إذا الحريف مازال حابّ، اعمل حجز جديد من ملفّه ثم اكتب العقد عليه.",
  reservation_already_contracted:
    "هذا الحجز عندو عقد من قبل. افتح العقد الموجود من ملفّ الحريف بدل ما تعمل واحد جديد — العقد الواحد يمشي مع حجز واحد.",
  deposit_not_paid:
    "العربون متاع هذا الحجز مازال ما كملش، والإعدادات تفرض خلاصو قبل العقد. سجّل الباقي من قسم «الحجز والعربون» في ملفّ الحريف، ولا بدّل الشرط من إعداد contracts.require_deposit_paid.",
  no_trees_to_contract:
    "هذا الحجز ما عادش ماسك زيتونات، فما فماش شنوّة يتباع. شوف تبويب «الزيتونات» متاع العرض: يمكن تفكّ حجزها. اعمل حجز جديد قبل ما تكتب العقد.",
  contract_price_unavailable:
    "ما لقيناش ثمن الزيتونة لهذا العرض. حدّد التسعير في صفحة العرض (ولا في مطلب الحريف) ثم أعد المحاولة.",

  // -- the plan: app.financed_quote's own four refusals, each named ---------------------------------------
  payment_mode_required:
    "ما حدّدناش طريقة الخلاص. اختار «بالحاضر» ولا «بالتقسيط» في الفورم، ولا حدّدها في مطلب الحريف قبل.",
  invalid_payment_mode: "طريقة الخلاص موش صحيحة. اختار «بالحاضر» ولا «بالتقسيط».",
  down_payment_required:
    "التسبقة ناقصة. اكتب مبلغ التسبقة في الفورم، ولا حدّدها في مطلب الحريف، ولا اختار الخلاص بالحاضر.",
  duration_required:
    "مدة التقسيط ناقصة. اكتب عدد الأشهر في الفورم، ولا حدّدها في مطلب الحريف، ولا اختار الخلاص بالحاضر.",
  duration_not_priced:
    "هذه المدة ما عندهاش نسبة زيادة في هذا العرض، فما ينجمش يتولّد جدول أقساط. زيد نسبة المدة في التسعير ← «زيادة التقسيط»، ولا بدّل المدة.",
  down_covers_total:
    "التسبقة تغطّي الثمن الكامل، فما باقي شيء يتقسّط. اكتب العقد بالحاضر، ولا نقّص التسبقة.",
  too_many_months:
    "المدة أطول من الحدّ الأقصى المسموح (إعداد pricing.max_months). قصّر المدة، ولا ارفع الحدّ من التسعير.",
  invalid_input:
    "معطيات التقسيط ناقصة ولا موش صحيحة: يلزم ثمن أكبر من صفر، وتسبقة صفر ولا أكثر، ومدة من شهر فما فوق. راجع الثمن والتسبقة والمدة.",

  // -- the contract itself --------------------------------------------------------------------------------
  contract_not_found: "هذا العقد ما عادش موجود. حدّث الصفحة وافتحو من قائمة العقود.",
  contract_not_draft:
    "هذا العقد ممضي من قبل. إذا تاريخ الإمضاء ولا مرجع الوثيقة غالطين، كلّم الإدارة — الإمضاء يتسجّل مرة وحدة.",
  contract_not_signed:
    "العقد مازال ما تمضاش. سجّل تاريخ الإمضاء ومرجع الوثيقة القانونية الأول، ومن بعد تنجم تكمّل.",
  contract_cancelled: "هذا العقد تفسخ، فما عادش يقبل خلاص ولا تبديل.",
  contract_closed: "هذا العقد مسكّر. إذا لزم عقد جديد، اعمل حجز جديد للحريف.",
  contract_is_cash:
    "هذا العقد بالحاضر، فما عندوش جدول أقساط. الخلاص الكامل يتسجّل في «الخلاص بالحاضر».",
  contract_owned: "هذا العقد مسجّل «ولّى مالك»، فما ينجمش يتفسخ من هنا. كلّم الإدارة والقانوني.",
  contract_already_owned: "التملّك مسجّل من قبل في هذا العقد.",
  invalid_contract_kind:
    "نوع العقد هذا ما عادش متاح. اختار واحد من القائمة، ولا زيدو في الإعدادات ← القوائم ← «أنواع العقود».",
  first_due_date_required:
    "لازم تحدّد تاريخ أول قسط باش يتولّد الجدول. اكتبو في الفورم — ما فماش قاعدة تلقائية محدّدة في الإعدادات (installments.first_due_rule).",
  first_due_before_signature:
    "تاريخ أول قسط قبل تاريخ الإمضاء. اختار تاريخاً بعد الإمضاء ولا في نفس النهار.",
  schedule_not_generated:
    "جدول الأقساط مازال ما تولّدش، فما فماش قسط يتسجّل عليه. ولّد الجدول من صفحة العقد (يحبّ موديول «الأقساط» يكون مشغّل).",
  schedule_total_mismatch:
    "مجموع الجدول ما يوافقش اللي تفاهمنا عليه في العقد. ما بدّلناش شيء. كلّم المسؤول باش يشوف الجدول.",

  // -- the money ------------------------------------------------------------------------------------------
  installment_not_found: "هذا القسط ما عادش موجود في هذا العقد. حدّث الصفحة وافتح الجدول من جديد.",
  invalid_payment_kind:
    "نوع الدفعة موش صحيح. من هنا يتسجّلو «التسبقة» و«القسط» برك؛ العربون يتسجّل من قسم «الحجز والعربون».",
  invalid_payment_amount: "اكتب المبلغ بالدينار، أكبر من صفر. مثال: 245 ولا 245.500",
  amount_over_due:
    "المبلغ أكبر من اللي مطلوب. سجّل اللي وصل فعلاً؛ إذا الحريف خلّص أكثر، سجّل الباقي كي يجي وقت القسط اللي بعدو.",
  amount_below_paid:
    "المبلغ الجديد أقلّ من اللي تخلّص في هذا القسط. وقّف الوصل الغالط الأول، ومن بعد سجّل المبلغ الصحيح.",
  invalid_payment_method:
    "طريقة الدفع هاذي ما عادتش متاحة. اختار وحدة من القائمة، ولا زيدها في الإعدادات ← القوائم ← «طرق الدفع المقبولة».",
  payment_not_found: "هذه الدفعة ما عادتش موجودة. حدّث الصفحة وأعد المحاولة.",
  payment_already_void: "هذه الدفعة موقّفة من قبل. ما فماش شنوّة يتعاود.",
  invalid_contract_filter: "هذا الفرز ما عادش موجود. ارجع لقائمة العقود واختار من الفرزات المعروضة.",
};

const FAILED = "تعذّرت العملية ولم يتغيّر أي شيء. حدّث الصفحة وحاول مرة أخرى.";

/**
 * The sentence for a missing table, said once. Before the draft is applied, staff_create_contract does not
 * exist and PostgREST answers PGRST202 / 42883 — «function not found». Blaming the connection for that would
 * send a commercial to check their wifi for a migration that has not been run.
 */
const NOT_INSTALLED =
  "وحدة العقود مازالت ما تركّبتش في قاعدة البيانات (supabase/pending/bb_60_contracts_installments.sql). كلّم المسؤول باش يركّبها، ومن بعد حدّث الصفحة.";

/** A refusal in words: this module's own codes first, then the ones the rest of the product already speaks. */
function failure(error: RpcFailure): { ok: false; message: string } {
  const local = CONTRACT_MESSAGES[error.message];
  if (local) return { ok: false, message: local };
  if (isKnownIntakeError(error.message)) return { ok: false, message: intakeErrorMessage(error.message) };
  if (error.code === "PGRST202" || error.code === "42883") return { ok: false, message: NOT_INSTALLED };
  // module_closed is raised with 42501 by both asserts, so the local map above has already caught it; anything
  // else arriving as 42501 really is a role refusal.
  if (error.code === "42501") return { ok: false, message: intakeErrorMessage("forbidden") };
  return { ok: false, message: FAILED };
}

function refuse(code: string): { ok: false; message: string } {
  return failure({ message: code });
}

function done(data: unknown): ContractResult {
  const contract = parseContract(data);
  if (!contract) return { ok: false, message: FAILED };
  return { ok: true, contract };
}

/** A date the user picked, as YYYY-MM-DD, or null. Anything else is refused by name, never silently dropped. */
function isoDate(value: string | null | undefined): string | null | false {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  if (!DATE.test(raw)) return false;
  return Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime()) ? false : raw;
}

function text(value: string | null | undefined, max: number): string | null {
  return String(value ?? "").trim().slice(0, max) || null;
}

/** A UUID the form may have left empty. `false` means «filled in, but not a UUID». */
function optionalId(value: string | null | undefined): string | null | false {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  return UUID.test(raw) ? raw : false;
}

/**
 * Dinars off a form into integer millimes. A UNIT conversion, not a business formula — and it is done by
 * dinarsToMillimes, the helper the pricing forms already use, rather than by a ×1000 written again here.
 *
 * IT SCALES THE DIGITS AS TEXT, which matters three times over in an Arabic-first product. A hand-rolled
 * `Number(raw) * 1000` — which this function used to be — rejected «٢٤٥» and «245,500» outright, so a
 * Tunisian typing on an Arabic keyboard or using a comma could not record a payment at all; and it silently
 * accepted «0x10» as 16 dinars and «1e3» as 1,000. dinarsToMillimes normalises Arabic-Indic digits and both
 * decimal separators, caps the decimals at three, and refuses everything else.
 *
 * `false` is «filled in, but not a number», kept as this file's own vocabulary so the call sites below read
 * the same way they do for optionalId().
 */
function millimes(value: number | string | null | undefined): number | null | false {
  const scaled = dinarsToMillimes(value);
  if (scaled === undefined) return false;
  return scaled;
}

const BAD_DATE = "التاريخ موش صحيح. اختار تاريخاً من الروزنامة، ولا خلّيه فارغ باش ياخذ تاريخ اليوم.";

/**
 * Every screen that reads a contract, a client file, an offer's stock or the public counters.
 *
 * WRITING A CONTRACT MOVES A PUBLIC NUMBER. staff_create_contract marks its trees `sold`, and
 * public.million_progress() counts trees_contracted as exactly that (0059:86, still the expression at
 * 0071:63), so the home page's «زيتونات تمّ التعاقد عليها» tile moves — while the `contracts` module is still
 * switched off, because that tile is gated by `public_statistics` and not by this module. The tag below
 * expires the offer pages; the counter carries no tag of its own (src/lib/million.ts revalidates every 60s),
 * so it catches up within the minute. The handover names this to the owner rather than quietly decoupling it:
 * v2 §6 is explicit that the counter counts stages.
 */
function contractsChanged(personId?: string | null) {
  revalidatePath("/admin/contracts", "layout");
  revalidatePath("/admin");
  revalidatePath("/admin/leads", "layout");
  revalidatePath("/admin/projects", "layout");
  revalidatePath("/admin/reservations");
  if (personId) revalidatePath(`/admin/leads/${personId}`);
  updateTag(PUBLIC_PROJECTS_TAG);
  revalidatePath("/projects", "layout");
}

/**
 * §28 · Writes the contract on a reservation, and closes the reservation into it.
 *
 * ONE TRANSACTION, four things: the reservation becomes 'converted' with its closed_at (the two are
 * inseparable — reservations_closed_check), its still-held trees go from `reserved` to `sold`, the agreed plan
 * is frozen onto the contract by one call to app.financed_quote, and the عربون credit is resolved once under
 * whatever settings contracts.deposit_counts_toward_down_payment says today. `trees_released` stays false:
 * converting a hold does not free trees, it sells them.
 *
 * THE CONTRACT IS BORN A DRAFT. v3 §45 gives the commercial «Generate Contract Request» — a request, not an
 * issuance — and neither document says the platform signs anything, so the signature is a separate human act
 * with a date and a legal reference. The schedule is generated at the SIGNATURE, not here, because every due
 * date counts from the signature (v3 §29: «بعد العقد، يتولد Schedule كامل»).
 *
 * EVERY PLAN FIELD MAY BE LEFT EMPTY. staff_create_contract falls back to the client's own demand for the
 * mode, the down payment and the duration, and refuses by name when neither the form nor the demand answers —
 * «not answering is an answer», which is 0061's rule and why nothing here defaults to cash.
 */
export async function createContract(input: {
  reservationId: string;
  kindOptionId?: string | null;
  /** Empty takes the mode from the client's demand. */
  paymentMode?: "cash" | "installments" | null;
  /** In DINARS, as a person says it. Empty takes the demand's down payment. Ignored for a cash contract. */
  downPaymentDinars?: number | string | null;
  /** Empty takes the demand's duration. Ignored for a cash contract. */
  durationMonths?: number | string | null;
  methodOptionId?: string | null;
  note?: string | null;
  reason?: string | null;
}): Promise<ContractResult> {
  await requireStaff(CONTRACT_ROLES);

  if (!UUID.test(input.reservationId)) return refuse("reservation_not_found");

  const kind = optionalId(input.kindOptionId);
  if (kind === false) return refuse("invalid_contract_kind");
  const method = optionalId(input.methodOptionId);
  if (method === false) return refuse("invalid_payment_method");

  const mode = input.paymentMode ?? null;
  if (mode !== null && mode !== "cash" && mode !== "installments") return refuse("invalid_payment_mode");

  const down = millimes(input.downPaymentDinars);
  if (down === false) return refuse("invalid_payment_amount");

  const rawMonths = String(input.durationMonths ?? "").trim();
  const months = rawMonths === "" ? null : Number(rawMonths);
  if (months !== null && (!Number.isInteger(months) || months < 1)) return refuse("duration_required");

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_create_contract", {
    p_reservation: input.reservationId,
    p_kind: kind,
    p_payment_mode: mode,
    p_down_payment_millimes: mode === "cash" ? null : down,
    p_duration_months: mode === "cash" ? null : months,
    p_method: method,
    p_note: text(input.note, 1000),
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  const result = done(data);
  if (result.ok) contractsChanged(result.contract.personId);
  return result;
}

/**
 * §28 · Records that the paper was signed, and generates the schedule in the same transaction.
 *
 * THE PLATFORM SIGNS NOTHING. v2 §34 asks a contract for a «Signature Date» and a «Legal document reference»
 * — a DATE and a TEXT — and neither document says who signs or whether the platform captures a signature. So
 * this records a date a human enters and a reference a human types; the database never infers a signature from
 * a click, a status or an elapsed time. It is audited with its reason, like every sensitive act in this
 * product (v3 §58 names «من حمل العقد؟» by name).
 *
 * THE FIRST DUE DATE IS ASKED FOR, NOT GUESSED. Neither document says on what date the first instalment falls
 * due, and every stage of §31 counts from it, so staff_sign_contract raises `first_due_date_required` rather
 * than inventing one — until the owner picks a rule in settings installments.first_due_rule.
 */
export async function signContract(input: {
  contractId: string;
  signedOn?: string | null;
  legalDocumentRef?: string | null;
  firstDueOn?: string | null;
  reason?: string | null;
}): Promise<ContractResult> {
  await requireStaff(CONTRACT_ROLES);

  if (!UUID.test(input.contractId)) return refuse("contract_not_found");
  const signedOn = isoDate(input.signedOn);
  if (signedOn === false) return { ok: false, message: BAD_DATE };
  const firstDueOn = isoDate(input.firstDueOn);
  if (firstDueOn === false) return { ok: false, message: BAD_DATE };

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_sign_contract", {
    p_contract: input.contractId,
    p_signed_on: signedOn,
    p_legal_ref: text(input.legalDocumentRef, 120),
    p_first_due_on: firstDueOn,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  const result = done(data);
  if (result.ok) contractsChanged(result.contract.personId);
  return result;
}

/**
 * §29, as its own act · Generates the schedule for a contract signed while `installments` was still off.
 *
 * staff_sign_contract writes the schedule in the signing transaction when the module is open, and signs the
 * contract anyway when it is not — the payload then says `schedule_pending`, which is the screen's cue to
 * offer this. Idempotent in the database: running it twice produces one schedule.
 */
export async function generateSchedule(input: { contractId: string; reason?: string | null }): Promise<ContractResult> {
  await requireStaff(CONTRACT_ROLES);
  if (!UUID.test(input.contractId)) return refuse("contract_not_found");

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_generate_schedule", {
    p_contract: input.contractId,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  const result = done(data);
  if (result.ok) contractsChanged(result.contract.personId);
  return result;
}

/**
 * §30 · Records money received on a contract: the down payment at signature, or one instalment of the schedule.
 *
 * ONE FUNCTION FOR BOTH, because it is one act and one table. public.staff_record_installment takes the kind
 * and an optional instalment, and writes a public.payments row — the same table the عربون uses, the same table
 * «زيتونتي» reads (app.zitounti_payments, 0068). Nothing is written onto the schedule line: whether it is
 * paid, part-paid or late, and what is left of the contract, are all derived by app.contract_money from the
 * live, non-void payment rows, so voiding a receipt takes the schedule back with it.
 *
 * WHY THE DOWN PAYMENT GOES THROUGH HERE. A cash contract has a down payment equal to the whole price and ZERO
 * schedule rows, so without this path a cash buyer's contract could never be settled and the cash path would
 * dead-end at a piece of paper. v3 §51 makes «Prix cash» one of four numbers a developer must distinguish, so
 * it is a real case and not an edge one.
 *
 * ITS RETURN IS DELIBERATELY NOT PARSED — see MoneyResult in ./contract-model. The screen re-reads instead.
 *
 * THERE IS NO ONLINE PAYMENT, twice over: v3 §30 defers «Payment gateway لاحقاً» and v3 §63 puts online
 * payments in Phase 3. This records money a human already received, exactly as staff_record_deposit does.
 */
export async function recordPayment(input: {
  contractId: string;
  /** Null for the down payment; a schedule line's id for an instalment. */
  installmentId?: string | null;
  kind: "down_payment" | "installment";
  amountDinars: number | string;
  methodOptionId?: string | null;
  receivedAt?: string | null;
  reference?: string | null;
  note?: string | null;
  /** Only so the client's own file is repainted too. The database does not need it and is not sent it. */
  personId?: string | null;
  reason?: string | null;
}): Promise<MoneyResult> {
  await requireStaff(PRICE_ROLES);

  if (!UUID.test(input.contractId)) return refuse("contract_not_found");
  if (input.kind !== "down_payment" && input.kind !== "installment") return refuse("invalid_payment_kind");

  const installment = optionalId(input.installmentId);
  if (installment === false) return refuse("installment_not_found");
  if (input.kind === "installment" && installment === null) return refuse("installment_not_found");

  const amount = millimes(input.amountDinars);
  if (amount === false || amount === null || amount <= 0) return refuse("invalid_payment_amount");

  const method = optionalId(input.methodOptionId);
  if (method === false) return refuse("invalid_payment_method");

  const receivedAt = isoDate(input.receivedAt);
  if (receivedAt === false) return { ok: false, message: BAD_DATE };

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_record_installment", {
    p_contract: input.contractId,
    p_installment: input.kind === "installment" ? installment : null,
    p_kind: input.kind,
    p_amount_millimes: amount,
    p_method: method,
    p_received_at: receivedAt,
    p_reference: text(input.reference, 120),
    p_note: text(input.note, 1000),
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  contractsChanged(input.personId ?? null);
  return { ok: true };
}

/**
 * §59 · Marks a recorded receipt void, keeping the row. The way a wrong amount is corrected.
 *
 * It calls the SAME public.staff_void_payment the reservations module calls — there is one void path for one
 * money table. That function answers with a reservation payload when the payment had a reservation behind it
 * and with a two-key object when it did not (0063:983), so this action parses NEITHER and the screen re-reads.
 * Guessing at a shape that depends on which row was voided is how a screen shows a stale balance after the one
 * act whose whole purpose is to change it.
 */
export async function voidContractPayment(input: {
  paymentId: string;
  personId?: string | null;
  reason?: string | null;
}): Promise<MoneyResult> {
  await requireStaff(PRICE_ROLES);
  if (!UUID.test(input.paymentId)) return refuse("payment_not_found");

  const supabase = await createClient();
  const { error } = await callPending(supabase, "staff_void_payment", {
    p_payment: input.paymentId,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  contractsChanged(input.personId ?? null);
  return { ok: true };
}

/**
 * v2 §38 · «بعد اكتمال الشروط القانونية: Parcel status: Owned ويتفتح للحريف: زيتونتي».
 *
 * OWNERSHIP IS NOT THE SIGNATURE and it is not the last instalment: the spec separates three moments and the
 * tree enum can express only one of them. A tree went to `sold` when the contract was written (0054:83 says
 * that is what the state means, and the public counter reads it); ownership is a CONTRACT-level fact, a date a
 * human enters after the legal conditions complete, and «زيتونتي» keys off THIS and not off the tree state.
 * No fourth tree state is added — 0054:217 records that one was considered and deliberately left out.
 */
export async function setOwned(input: {
  contractId: string;
  ownedOn?: string | null;
  reason?: string | null;
}): Promise<ContractResult> {
  await requireStaff(CONTRACT_ROLES);

  if (!UUID.test(input.contractId)) return refuse("contract_not_found");
  const ownedOn = isoDate(input.ownedOn);
  if (ownedOn === false) return { ok: false, message: BAD_DATE };

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_set_contract_owned", {
    p_contract: input.contractId,
    p_owned_on: ownedOn,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  const result = done(data);
  if (result.ok) contractsChanged(result.contract.personId);
  return result;
}

/**
 * §31 · Records a cancellation already decided outside the software.
 *
 * «لا يوجد فسخ آلي» (v2 §36). This action exists so a decision Legal already took, under the contract and the
 * law, can be RECORDED with its reason, and so the trees it was holding stop being sold to nobody. Nothing
 * reaches it on a timer, and §31's stages only put a file in front of a person.
 *
 * THERE IS NO «MARK COMPLETED» BESIDE IT, on purpose: app.contract_settle_state flips a contract to
 * 'completed' when its last millime arrives, so «كمّل خلاصو» is something that HAPPENS and not something
 * somebody declares. A button for it would let a contract be closed with money still owed.
 *
 * `release` is the same choice §24 gives a cancelled reservation: put the trees back to available, or leave
 * them sold while somebody decides. Both halves are one transaction, for the reason 0063:1055 gives.
 */
export async function cancelContract(input: {
  contractId: string;
  release: boolean;
  reason?: string | null;
}): Promise<ContractResult> {
  await requireStaff(CANCEL_ROLES);

  if (!UUID.test(input.contractId)) return refuse("contract_not_found");

  const supabase = await createClient();
  const { data, error } = await callPending(supabase, "staff_cancel_contract", {
    p_contract: input.contractId,
    p_release: Boolean(input.release),
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return failure(error);

  const result = done(data);
  if (result.ok) contractsChanged(result.contract.personId);
  return result;
}
