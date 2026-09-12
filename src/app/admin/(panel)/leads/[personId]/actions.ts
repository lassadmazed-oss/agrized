"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const EDIT_ROLES = ["commercial", "admin", "super_admin"] as const;

/** "2026-09-12T10:30" typed in Tunisia (UTC+1, no daylight saving) → ISO timestamp. */
function tunisLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+01:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const DENIED: ActionResult = { ok: false, message: "لا تملك صلاحية تعديل هذا الملف." };

export async function updateStatus(personId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(EDIT_ROLES);
  const statusId = z.uuid().safeParse(formData.get("status_id"));
  if (!statusId.success) return { ok: false, message: "اختر الحالة من القائمة." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("persons").update({ status_id: statusId.data }).eq("id", personId).select("id");
  if (error) return { ok: false, message: "تعذّر حفظ الحالة. حاول مرة أخرى." };
  if (!data?.length) return DENIED;

  revalidatePath(`/admin/leads/${personId}`);
  return { ok: true, message: "تم تحديث الحالة." };
}

export async function assignPerson(personId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const target = String(formData.get("to_user") ?? "");
  const toUser = target === "none" ? null : z.uuid().safeParse(target).data;
  if (target !== "none" && !toUser) return { ok: false, message: "اختر الـCommercial من القائمة." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_persons", {
    p_person_ids: [personId],
    p_to_user: toUser as string,
    p_reason: reason as string,
  });
  if (error) {
    return {
      ok: false,
      message: error.message === "target_not_active_commercial" ? "هذا المستخدم ليس Commercial نشطاً." : "تعذّر تحويل الملف. حاول مرة أخرى.",
    };
  }

  revalidatePath(`/admin/leads/${personId}`);
  revalidatePath("/admin/leads");
  return { ok: true, message: toUser ? "تم تحويل الملف." : "تم إلغاء إسناد الملف." };
}

const attemptSchema = z.object({
  channel: z.enum(["phone", "whatsapp", "sms", "other"]),
  outcome: z.enum(["answered", "no_answer", "wrong_number", "callback", "not_interested"]),
  note: z.string().trim().max(5000),
  next_follow_up_at: z.string(),
});

export async function addContactAttempt(personId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireStaff(EDIT_ROLES);
  const parsed = attemptSchema.safeParse({
    channel: formData.get("channel"),
    outcome: formData.get("outcome"),
    note: formData.get("note") ?? "",
    next_follow_up_at: formData.get("next_follow_up_at") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "اختر القناة والنتيجة." };

  const followUp = parsed.data.next_follow_up_at ? tunisLocalToIso(parsed.data.next_follow_up_at) : null;
  if (parsed.data.next_follow_up_at && !followUp) return { ok: false, message: "تاريخ المتابعة غير صحيح." };

  const supabase = await createClient();
  const { error } = await supabase.from("contact_attempts").insert({
    person_id: personId,
    channel: parsed.data.channel,
    outcome: parsed.data.outcome,
    note: parsed.data.note || null,
    next_follow_up_at: followUp,
    created_by: session.id,
  });
  if (error) return error.code === "42501" ? DENIED : { ok: false, message: "تعذّر حفظ المحاولة. حاول مرة أخرى." };

  revalidatePath(`/admin/leads/${personId}`);
  return { ok: true, message: "تم تسجيل محاولة التواصل." };
}

export async function addNote(personId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireStaff(EDIT_ROLES);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, message: "اكتب الملاحظة." };
  if (body.length > 5000) return { ok: false, message: "الملاحظة طويلة جداً (5000 حرف كحد أقصى)." };

  const supabase = await createClient();
  const { error } = await supabase.from("person_notes").insert({ person_id: personId, body, created_by: session.id });
  if (error) return error.code === "42501" ? DENIED : { ok: false, message: "تعذّر حفظ الملاحظة. حاول مرة أخرى." };

  revalidatePath(`/admin/leads/${personId}`);
  return { ok: true, message: "تمت إضافة الملاحظة." };
}
