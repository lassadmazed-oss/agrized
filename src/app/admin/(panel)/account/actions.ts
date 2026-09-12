"use server";

import type { ActionResult } from "@/components/admin/action-form";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function changePassword(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireStaff();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 10) return { ok: false, message: "كلمة السر الجديدة يجب أن تتكوّن من 10 أحرف على الأقل." };
  if (next !== confirm) return { ok: false, message: "تأكيد كلمة السر لا يطابق كلمة السر الجديدة." };
  if (next === current) return { ok: false, message: "اختر كلمة سر مختلفة عن الحالية." };
  if (!session.email) return { ok: false, message: "تعذّر التحقق من حسابك. أعد الدخول وحاول مجدداً." };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: session.email, password: current });
  if (verifyError) return { ok: false, message: "كلمة السر الحالية غير صحيحة." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return {
      ok: false,
      message: error.message.toLowerCase().includes("weak") ? "كلمة السر ضعيفة. استعمل أحرفاً وأرقاماً ورموزاً." : "تعذّر تغيير كلمة السر. حاول مرة أخرى.",
    };
  }

  await supabase.rpc("log_action", { p_action: "auth.password_changed", p_entity: "profiles", p_entity_id: session.id });
  return { ok: true, message: "تم تغيير كلمة السر." };
}
