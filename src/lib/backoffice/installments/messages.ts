/**
 * The Arabic of every code «الأقساط» can raise, each one saying what happened AND the next step.
 *
 * EVERY KEY WAS READ OFF the draft's own `raise exception` lines in
 * supabase/pending/bb_60_contracts_installments.sql, so none of them is a sentence for an error that cannot
 * arrive — and, more usefully, no code that CAN arrive is left to fall through to «تعذّرت العملية». An earlier
 * version of this file answered installment_already_paid and amount_over_installment, which the database never
 * raises, and said nothing about amount_over_due and schedule_not_generated, which it does.
 *
 * THEY BELONG IN src/lib/errors.ts, keyed by the code exactly as the rest are. That file is 120 shared lines
 * and three sessions are writing in this repository right now, so the module carries its own map and consults
 * it FIRST — the arrangement the reservations module documented (src/app/admin/(panel)/reservations/actions.ts)
 * and the harvest module repeated (../harvest/messages.ts). Whoever merges the batch moves these lines across
 * and deletes this file.
 *
 * ONE key here also exists in @/lib/errors on purpose: `module_closed` is raised by every module-gated RPC in
 * the product, so errors.ts answers it in module-neutral words for whoever has no map of their own. This map
 * is consulted first, which is how the line below gets to name «الأقساط» and the switch that turns it on.
 *
 * NO LINE NAMES A NUMBER. How many days of grace, how many missed instalments put a contract under review —
 * all of them are settings (installments.grace_days_after, installments.late_stage2_missed) and the screen
 * prints the live value beside the queue. A message that said «بعد شهرين» would freeze the commercial rule
 * report v3 §31 itself walked back.
 */

import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";

const INSTALLMENT_MESSAGES: Record<string, string> = {
  // app.assert_installments_open(). The contracts module raises the same code from
  // app.assert_contracts_open(), which is why its own map names both switches; here only one can be the cause.
  module_closed:
    "موديول «الأقساط» مازال معطّل، فتسجيل الدفعات موقّف في قاعدة البيانات روحها. شغّلو من الإعدادات ← الموديولات: «داخلي فقط» تكفي باش يخدم بيه الفريق، و«منشور للعموم» كي تحب يبان للحرفاء.",

  // -- the line itself -------------------------------------------------------------------------------------
  installment_not_found:
    "هذا القسط ما عادش موجود، ولا هو ما ينتميش لهذا العقد. حدّث الصفحة وافتح جدول الأقساط متاع العقد من جديد.",
  schedule_not_generated:
    "جدول الأقساط متاع هذا العقد مازال ما تولّدش، فما فماش قسط يتسجّل عليه. ولّدو من صفحة العقد في وحدة «العقود ووعد البيع» ثم ارجع.",

  // -- the money ------------------------------------------------------------------------------------------
  // The cap is the WHOLE contract, not the line: دفعة أكبر من قسط واحد تمشي للقسط اللي بعدو وحدها.
  amount_over_due:
    "المبلغ هذا يفوت اللي باقي على العقد الكل. سجّل الباقي كيما هو مبيّن، وإذا الحريف خلّص زيادة بالحق كلّم المالية قبل — الفلوس الزايدة ما عندهاش وين تتحسب.",
  invalid_payment_amount:
    "اكتب المبلغ بالدينار، أكبر من صفر. مثال: 245 ولا 245.500. ولا خلّي «الباقي الكامل» مختار باش ياخذ الباقي كيما حسبتو قاعدة البيانات.",
  invalid_payment_kind:
    "نوع الدفعة موش صحيح. القسط يتسجّل من هنا، والتسبقة والخلاص بالحاضر يتسجّلو من صفحة العقد.",
  invalid_payment_method:
    "طريقة الدفع هاذي ما عادتش متاحة. اختار وحدة من القائمة، ولا زيدها في الإعدادات ← القوائم ← «طرق الدفع المقبولة».",
  invalid_received_at:
    "تاريخ الخلاص موش صحيح. اختار تاريخ من الروزنامة، ولا خلّيه فارغ باش ياخذ تاريخ اليوم.",

  // -- the contract behind it -----------------------------------------------------------------------------
  contract_not_found:
    "العقد متاع هذا القسط ما عادش موجود. حدّث الصفحة، وإذا تواصل المشكل كلّم الإدارة قبل ما تسجّل أي فلوس.",
  contract_cancelled:
    "هذا العقد تفسخ، فما تتسجّلش عليه أقساط. إذا الحريف خلّص فعلاً، كلّم الإدارة والمالية قبل أي تسجيل.",

  // -- the screen's own argument --------------------------------------------------------------------------
  // parseFilter() clamps an unknown ?filter= to «يلزمها تدخّل» before it ever reaches SQL, so this is the
  // sentence for the day somebody calls the reader from somewhere that does not clamp.
  invalid_installment_filter:
    "هذا الفرز ما عادش موجود. ارجع لقائمة الأقساط واختر من الفرزات المعروضة.",

  // VOIDING IS NOT THIS MODULE'S ACT, so payment_not_found and payment_already_void are deliberately absent:
  // ../contracts/actions.ts owns staff_void_payment and answers both there, where a receipt is shown in full.
};

const FAILED = "تعذّرت العملية ولم يتسجّل أي شيء. حدّث الصفحة وحاول مرة أخرى.";

/** A refusal in words: this module's own codes first, then the ones the rest of the product already speaks. */
export function installmentErrorMessage(error: { message: string; code?: string } | null): string {
  if (!error) return FAILED;
  const named = INSTALLMENT_MESSAGES[error.message];
  if (named) return named;
  if (isKnownIntakeError(error.message)) return intakeErrorMessage(error.message);
  // A grant the RPC did not name itself: app.can_record_money() or app.can_see_person() said no.
  if (error.code === "42501") return intakeErrorMessage("forbidden");
  return FAILED;
}

export { FAILED as INSTALLMENT_FAILED };
