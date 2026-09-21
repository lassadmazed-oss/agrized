"use server";

// The two acts of «الأقساط»: money arrives against a line of the schedule, and a receipt written by mistake is
// stopped. Report v3 §29 (the schedule), §30 (Reference · Receipt) and §59 (Monthly Payment Receipt).
//
// NOTHING HERE COMPUTES ANYTHING, and that is the whole point of the module. What a line owes, what is left on
// it, whether it is late and which rung of §31 its contract stands on are all worked out in Postgres from the
// contract's frozen snapshot and the live public.payments rows. This file checks a role, converts a typed
// amount from dinars to millimes, and reports a sentence.
//
// THE AMOUNT IS ALWAYS SENT, and that is the draft's rule, not a preference: staff_record_installment raises
// invalid_payment_amount for a null or non-positive amount. «الباقي الكامل» therefore sends back the figure
// POSTGRES reported as left on the line — never a figure this code worked out. That is safe against a stale
// remainder because the balances are a WATERFALL over the live payments rather than a flag on the line: money
// beyond what this line owes flows to the next one, and only a total beyond the whole schedule is refused
// (amount_over_due). Nothing is silently absorbed and nothing is over-collected.
//
// THE ROLES, and why they are checked here as well as in SQL:
//   recordInstallment ·  PRICE_ROLES (finance · admin · super_admin), which is exactly app.can_record_money()
//   voidInstallmentPayment (0063:98) — «signing the contract and taking the cash are two different desks», so
//                        `legal` may sign a contract and may not record a dinar against it. The database
//                        narrows it again with app.can_see_person, so a commercial reading their own client's
//                        plan sees it and cannot collect on it.
//
// NO CRON, NO TIMER, NO AUTOMATIC ANYTHING. Report v3 §31 and cahier v2 §36 both refuse automatic termination
// («لا يوجد فسخ آلي»): the system flags, a human decides. There is no scheduled job in this module, and the
// lateness stage is a read, recomputed from the clock on every query and stored nowhere.

import { revalidatePath } from "next/cache";

import { PRICE_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

import { dinarsToMillimes } from "../pricing/form-values";
import { newestReceiptNo, type InstallmentResult } from "./installment-model";
import { installmentErrorMessage } from "./messages";
import { draftRpc } from "./rpc";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(code: string): { ok: false; message: string } {
  return { ok: false, message: installmentErrorMessage({ message: code }) };
}

/**
 * Every screen a recorded instalment changes.
 *
 * NOT the public pages, and not PUBLIC_PROJECTS_TAG: a payment moves no tree from `reserved` to `sold`, so the
 * «وين وصلنا؟» counter — which counts trees in state 'sold' (0059) — does not move when money arrives. The
 * signature does that, and it belongs to the contracts module.
 */
function installmentsChanged(personId?: string | null) {
  revalidatePath("/admin/installments");
  revalidatePath("/admin/contracts", "layout");
  revalidatePath("/admin/leads", "layout");
  revalidatePath("/admin");
  if (personId) revalidatePath(`/admin/leads/${personId}`);
}

/** The module has to be open for THIS reader before either act runs. app.module_open() checks it again. */
async function moduleClosed(): Promise<boolean> {
  const config = await getPublicConfig();
  return (await moduleAccess(config, "installments")) === "closed";
}

/**
 * §29/§30 · Records money received against one line of the schedule.
 *
 * ONE public.payments row, kind='installment', carrying both the contract and the line it was collected for.
 * Never a second money table and never a `paid` flag written onto the line: «زيتونتي» (0068) already reads
 * public.payments for a client's receipts, and the day an instalment lived anywhere else that screen would be
 * wrong from the first payment and would not say so. Voiding a receipt therefore takes the line back with it,
 * because what the line shows was derived from the receipt.
 *
 * The answer carries the RECEIPT number — the AGZ-PAY reference — because that is what the client is told on
 * the phone, and a collection screen that does not hand it back makes somebody go looking for it.
 */
export async function recordInstallment(input: {
  contractId: string;
  installmentId: string;
  /**
   * «الباقي الكامل»: the `left_millimes` app.contract_money reported for this line, passed back UNCHANGED.
   *
   * It is a pass-through, not a computation — the integer Postgres produced travels to the form and back
   * without being scaled, divided or re-rounded anywhere, which is why the browser never has to know that a
   * dinar is a thousand millimes. Sending it beats sending nothing because the draft refuses a null amount
   * (invalid_payment_amount), and it is safe against a stale figure because the balances are a waterfall:
   * a surplus lands on the next line and only a total beyond the whole schedule is refused.
   */
  amountMillimes?: number | null;
  /** What Finance typed instead, in dinars. Converted below as TEXT, never as a float. */
  amountDinars?: string | number | null;
  methodOptionId?: string | null;
  receivedAt?: string | null;
  reference?: string | null;
  note?: string | null;
  reason?: string | null;
  personId?: string | null;
}): Promise<InstallmentResult> {
  await requireStaff(PRICE_ROLES);
  if (await moduleClosed()) return refuse("module_closed");

  if (!UUID.test(input.contractId)) return refuse("contract_not_found");
  if (!UUID.test(input.installmentId)) return refuse("installment_not_found");

  // Two ways in, and they never mix. Either Postgres's own figure comes back untouched, or Finance typed a
  // number in dinars and it is scaled HERE — dinarsToMillimes works on the digits as TEXT, so «245.5» is
  // exactly 245,500 millimes and no float ever touches an amount of money.
  const typed = input.amountDinars;
  const hasTyped = typed !== null && typed !== undefined && String(typed).trim() !== "";
  const scaled = hasTyped ? dinarsToMillimes(typed) : input.amountMillimes;
  if (typeof scaled !== "number" || !Number.isInteger(scaled) || scaled <= 0) {
    return refuse("invalid_payment_amount");
  }

  const method = input.methodOptionId ?? null;
  if (method !== null && method !== "" && !UUID.test(method)) return refuse("invalid_payment_method");

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : null;
  if (receivedAt && Number.isNaN(receivedAt.getTime())) return refuse("invalid_received_at");

  const supabase = await createClient();
  const { data, error } = await draftRpc(supabase, "staff_record_installment", {
    p_contract: input.contractId,
    p_installment: input.installmentId,
    // The عربون belongs to a reservation and is recorded by staff_record_deposit; this screen collects the
    // schedule, so its kind is fixed. A contract's «تسبقة» is taken on the contract page, not here.
    p_kind: "installment",
    p_amount_millimes: scaled,
    p_method: method === "" ? null : method,
    p_received_at: receivedAt ? receivedAt.toISOString() : null,
    p_reference: String(input.reference ?? "").trim().slice(0, 120) || null,
    p_note: String(input.note ?? "").trim().slice(0, 1000) || null,
    p_reason: String(input.reason ?? "").trim().slice(0, 1000),
  });
  if (error) return { ok: false, message: installmentErrorMessage(error) };

  installmentsChanged(input.personId ?? null);
  // The call answers with the whole contract payload. Only the receipt number is kept: every other figure in
  // it is derived, and the screen re-reads from the server rather than render a shape that travelled through
  // a form.
  return { ok: true, receiptNo: newestReceiptNo(data) };
}

// §59 · VOIDING A RECEIPT IS NOT HERE, on purpose.
//
// public.staff_void_payment is already called by ../contracts/actions.ts (voidContractPayment), and the
// contract page is the one screen that shows a receipt IN FULL — its kind, who recorded it, the bank
// reference, and the void reason once it has one. This queue carries only the thin `receipts` that
// app.contract_money hangs off each line, which is enough to READ what arrived and not enough to decide
// responsibly that it should be undone.
//
// So the queue links to the contract instead of drawing a second void button over a partial view of the same
// row. One act, one place, one audit story — and no chance of two screens disagreeing about what a voided
// payment left behind.
