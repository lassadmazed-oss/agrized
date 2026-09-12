"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { LAND_OFFER_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS = z.enum([
  "under_study",
  "legal_review",
  "technical_review",
  "field_visit",
  "accepted",
  "rejected",
  "postponed",
  "converted",
]);

export async function reviewLandOffer(offerId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(LAND_OFFER_ROLES);

  const stage = STATUS.safeParse(formData.get("stage"));
  const outcome = z.enum(["passed", "failed", "needs_info", "note"]).safeParse(formData.get("outcome"));
  if (!stage.success || !outcome.success) return { ok: false, message: "اختر المرحلة والنتيجة." };

  const rawNext = formData.get("next_status");
  const nextStatus = rawNext ? STATUS.safeParse(rawNext) : null;
  if (nextStatus && !nextStatus.success) return { ok: false, message: "الحالة الموالية غير صحيحة." };
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 5000);

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_land_offer", {
    p_offer: offerId,
    p_stage: stage.data,
    p_outcome: outcome.data,
    p_notes: notes,
    ...(nextStatus?.data ? { p_next_status: nextStatus.data } : {}),
  });
  if (error) {
    return {
      ok: false,
      message: error.code === "42501" ? "لا تملك صلاحية هذه المرحلة أو هذا القرار." : "تعذّر حفظ المراجعة. حاول مرة أخرى.",
    };
  }

  revalidatePath(`/admin/land-offers/${offerId}`);
  revalidatePath("/admin/land-offers");
  return { ok: true, message: "تم تسجيل المراجعة." };
}
