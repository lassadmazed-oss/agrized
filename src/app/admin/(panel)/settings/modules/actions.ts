"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { FLAG_STATE_LABELS, isImplementedModule } from "@/lib/modules-catalog";
import { PUBLIC_PROJECTS_TAG } from "@/lib/public-projects";
import { createClient } from "@/lib/supabase/server";

/** FLAG-03: takes effect immediately, no deployment; the change is recorded by the audit trigger. */
export async function setModuleState(key: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);

  const state = z.enum(["disabled", "internal", "public"]).safeParse(formData.get("state"));
  if (!state.success) return { ok: false, message: "اختر حالة الموديول." };
  if (!isImplementedModule(key) && state.data !== "disabled") {
    return { ok: false, message: "هذا الموديول لم يُبنَ بعد في هذه النسخة، ولا يمكن تفعيله." };
  }
  // Until v2's per-offer pricing matrix exists, the projects pages price with the interim formula,
  // so they may be previewed by staff but never published (cahier v2 §13, WP-27).
  if (key === "projects" && state.data === "public") {
    return {
      ok: false,
      message: "المشاريع تبقى «داخلي فقط» حتى تُضبط جداول الأسعار الخاصة بكل عرض. يمكن معاينتها من الفريق فقط.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("feature_flags").update({ state: state.data }).eq("key", key).select("key");
  if (error || !data?.length) {
    return { ok: false, message: "تعذّر حفظ الحالة. تحقق من صلاحياتك وحاول مرة أخرى." };
  }

  updateTag(PUBLIC_CONFIG_TAG);
  // The projects RPCs gate on the flag in SQL, but their cached rows would outlive a flip for a minute.
  if (key === "projects") {
    updateTag(PUBLIC_PROJECTS_TAG);
    revalidatePath("/projects", "layout");
  }
  revalidatePath("/admin/settings/modules");
  return { ok: true, message: `تم الحفظ: ${FLAG_STATE_LABELS[state.data]}.` };
}
