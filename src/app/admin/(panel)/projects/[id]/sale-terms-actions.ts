"use server";

// «شروط البيع» of one offer (0180): the عربون taken on the land, how many days it holds the trees, and the down
// payment (التسبقة) a contract asks when the client chose none. public.staff_save_offer_sale_terms checks the
// role and the bounds again; an empty box sends the value back to the general setting.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { PRICE_ROLES, requireStaff } from "@/lib/auth";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import { dinarsToMillimes, percentToBp, wholeNumber } from "@/lib/backoffice/pricing/form-values";

const MESSAGES: Record<string, string> = {
  invalid_deposit_amount: "مبلغ العربون لازم يكون رقم موجب بالدينار، مثلاً 50. ولّا خلّيه فارغ باش يتبع القيمة العامة.",
  invalid_valid_days: "مدّة الحجز لازم تكون عدد أيام بين 0 و365. ولّا خلّيها فارغة باش تتبع القيمة العامة.",
  invalid_down_payment_percent: "نسبة التسبقة لازم تكون أكبر من 0 وأصغر من 100، مثلاً 30. ولّا خلّيها فارغة باش تتبع القيمة العامة.",
  offer_not_found: "هذا العرض ما عادش موجود. ارجع لقائمة العروض.",
};

const fail = (message: string): ActionResult => ({ ok: false, message });

export async function saveOfferSaleTerms(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!z.uuid().safeParse(projectId).success) return fail(MESSAGES.offer_not_found);

  const deposit = dinarsToMillimes(formData.get("deposit_dinars"));
  if (deposit === undefined) return fail(MESSAGES.invalid_deposit_amount);
  const days = wholeNumber(formData.get("valid_days"), 365);
  if (days === undefined) return fail(MESSAGES.invalid_valid_days);
  const percentBp = percentToBp(formData.get("down_payment_percent"));
  if (percentBp === undefined || (percentBp !== null && (percentBp <= 0 || percentBp >= 10_000))) {
    return fail(MESSAGES.invalid_down_payment_percent);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_offer_sale_terms", {
    p_project: projectId,
    p: {
      deposit_millimes: deposit === null ? "" : String(deposit),
      valid_days: days === null ? "" : String(days),
      down_payment_percent: percentBp === null ? "" : String(percentBp / 100),
    },
  });
  if (error) {
    if (MESSAGES[error.message]) return fail(MESSAGES[error.message]);
    if (isKnownIntakeError(error.message)) return fail(intakeErrorMessage(error.message));
    if (error.code === "42501") return fail(intakeErrorMessage("forbidden"));
    return fail("ما تسجّلتش شروط البيع. حدّث الصفحة وعاود؛ وكان تعاود الخطأ، اعلم التقني.");
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true, message: "تسجّلت شروط البيع متاع هذا العرض." };
}
