"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { FLAG_STATE_LABELS, isImplementedModule } from "@/lib/modules-catalog";
import { createClient } from "@/lib/supabase/server";

/** FLAG-03: takes effect immediately, no deployment; the change is recorded by the audit trigger. */
export async function setModuleState(key: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);

  const state = z.enum(["disabled", "internal", "public"]).safeParse(formData.get("state"));
  if (!state.success) return { ok: false, message: "اختر حالة الموديول." };
  if (!isImplementedModule(key) && state.data !== "disabled") {
    return { ok: false, message: "هذا الموديول لم يُبنَ بعد في هذه النسخة، ولا يمكن تفعيله." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("feature_flags").update({ state: state.data }).eq("key", key).select("key");
  if (error || !data?.length) {
    return { ok: false, message: "تعذّر حفظ الحالة. تحقق من صلاحياتك وحاول مرة أخرى." };
  }

  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath("/admin/settings/modules");
  return { ok: true, message: `تم الحفظ: ${FLAG_STATE_LABELS[state.data]}.` };
}
