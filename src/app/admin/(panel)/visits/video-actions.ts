"use server";

// The live video visits of the abroad page (0130): the team confirms the time, marks the call done, or cancels.
// The role is checked here and again in public.staff_set_video_visit (app.is_staff() and app.can_see_person()),
// so a commercial moves only the requests of their own files.

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { intakeErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const STATUSES = new Set(["requested", "confirmed", "done", "cancelled"]);

const MESSAGES: Record<string, string> = {
  video_visit_not_found: "الطلب هذا ما عادش موجود. حدّث الصفحة.",
  invalid_status: "اختر حالة من القائمة: مطلوبة، مؤكّدة، تمّت ولا تلغات.",
  invalid_video_time: "الوقت موش مفهوم. اختر النهار والساعة بتوقيت تونس من الخانة.",
  note_too_long: "الملاحظة طويلة برشة. قصّرها لـ1000 حرف ولا أقل.",
};

export async function setVideoVisit(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const scheduledAt = String(formData.get("scheduled_at") ?? "").trim();
  const note = String(formData.get("staff_note") ?? "").trim().slice(0, 1000);
  if (!UUID.test(id)) return { ok: false, message: MESSAGES.video_visit_not_found };
  if (!STATUSES.has(status)) return { ok: false, message: MESSAGES.invalid_status };
  if (scheduledAt && !WALL_TIME.test(scheduledAt)) return { ok: false, message: MESSAGES.invalid_video_time };

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_set_video_visit", {
    p_id: id,
    p: { status, scheduled_at: scheduledAt || null, staff_note: note || null },
  });
  if (error) {
    if (MESSAGES[error.message]) return { ok: false, message: MESSAGES[error.message] };
    if (error.code === "42501") return { ok: false, message: intakeErrorMessage("forbidden") };
    console.error("staff_set_video_visit failed", error);
    return { ok: false, message: "تعذّر حفظ الطلب. حدّث الصفحة وأعد المحاولة." };
  }
  revalidatePath("/admin/visits");
  return { ok: true, message: "تحفظ." };
}
