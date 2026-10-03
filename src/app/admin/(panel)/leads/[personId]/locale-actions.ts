"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { isLocale } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";

/**
 * The client's language, set from their file (0109, 0110): every SMS after this is written in it. The
 * database decides who may — the admins and the commercial the file is assigned to, as for the file itself.
 */
export async function setPersonLocale(personId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);
  const code = String(formData.get("locale") ?? "");
  if (!isLocale(code)) return { ok: false, message: "اختار لغة من القائمة." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_set_person_locale", { p_person: personId, p_locale: code });
  if (error) {
    if (error.message.includes("forbidden")) return { ok: false, message: "تبديل اللغة للمسؤول على الملف وللإدارة فقط." };
    return { ok: false, message: "تعذّر الحفظ. حاول مرة أخرى." };
  }
  revalidatePath(`/admin/leads/${personId}`);
  return { ok: true, message: "تم. الرسائل الجاية تخرج بهاللغة." };
}
