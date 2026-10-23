"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { asPushStaffClient, PUSH_AUDIENCES, pushErrorMessage } from "@/lib/backoffice/push-campaigns";
import { textValue } from "@/lib/backoffice/pricing/form-values";
import { normalizePhone } from "@/lib/phone";
import { dispatchCampaigns } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

// Every write goes through a role-checked function of 0152 (app.is_admin()); the roles here are the same ones the
// SQL checks. A message to every phone with the app reaches the buyers, so it is Admin's and nobody else's.

const PAGE = "/admin/notifications";

function fail(message: string): ActionResult {
  return { ok: false, message };
}

/** Tunisia is UTC+1 all year and has had no daylight saving since 2008, so a wall-clock time is one offset away from UTC. */
function tunisLocalToIso(local: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(local);
  if (!match) return null;
  const date = new Date(`${match[1]}T${match[2]}:00+01:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Writes a notification and, when it is due now, sends it in the same breath.
 *
 * «NOW» DOES NOT WAIT FOR A SCHEDULER. The dispatch route is called by whatever job runner the owner has set
 * up, every few minutes at best; a button that says «ابعث» and then makes him wait for the next tick reads as a
 * button that did nothing. So a message due now is sent after the response (`after`), which is the same pattern
 * the forms use for their SMS. A message scheduled for later is kept by the runner, and the page says so.
 */
export async function sendPushCampaign(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);

  const title = textValue(formData, "title", 60);
  const body = textValue(formData, "body", 240);
  if (!title) return fail(pushErrorMessage("push_title_required"));
  if (!body) return fail(pushErrorMessage("push_body_required"));

  const audience = String(formData.get("audience") ?? "");
  const choice = PUSH_AUDIENCES.find((entry) => entry.value === audience);
  if (!choice) return fail(pushErrorMessage("push_audience_invalid"));

  // The three audiences that reach buyers need a tick: a message sent to everyone cannot be taken back.
  if (choice.broadcast && formData.get("confirm") !== "on") {
    return fail("هذا الإشعار يوصل لناس حقيقيين ومايتلغاش بعد ما يخرج. علّم على «نعم، ابعثو» باش تتأكّد.");
  }

  let phone: string | null = null;
  if (audience === "phone") {
    const checked = normalizePhone(textValue(formData, "phone", 30), true);
    if (!checked.ok) return fail(pushErrorMessage("push_phone_invalid"));
    phone = checked.e164;
  }

  let route: string | null = String(formData.get("route") ?? "") || null;
  if (route === "offer") {
    const code = textValue(formData, "offer_code", 64);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return fail("اختار العرض اللي باش يفتحو الإشعار.");
    route = `/offer/${code}`;
  }

  let scheduledAt: string | null = null;
  if (formData.get("when") === "later") {
    scheduledAt = tunisLocalToIso(String(formData.get("scheduled_local") ?? ""));
    if (!scheduledAt) return fail(pushErrorMessage("push_schedule_invalid"));
  }

  const supabase = asPushStaffClient(await createClient());
  const { data, error } = await supabase.rpc("staff_create_push_campaign", {
    p: { title, body, route, audience, phone, scheduled_at: scheduledAt },
  });
  if (error || !data) return fail(pushErrorMessage(error?.message ?? ""));

  const immediate = new Date(data.scheduled_at).getTime() <= Date.now() + 5_000;
  if (immediate) after(() => void dispatchCampaigns());

  revalidatePath(PAGE);
  return {
    ok: true,
    message: immediate
      ? "الإشعار تسجّل وخارج توّا. الحالة تتحدّث تحت في ثواني."
      : "الإشعار تبرمج. يخرج في الوقت المحدّد كي يخدم الـscheduler متاع الإرسال.",
  };
}

/** Stops a notification that has not left yet. One that is sending or already sent cannot be taken back. */
export async function cancelPushCampaign(id: string): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(pushErrorMessage("push_not_cancellable"));

  const supabase = asPushStaffClient(await createClient());
  const { error } = await supabase.rpc("staff_cancel_push_campaign", { p_id: id, p_reason: "ألغاه المسؤول من الصفحة" });
  if (error) return fail(pushErrorMessage(error.message));

  revalidatePath(PAGE);
  return { ok: true, message: "الإشعار تلغى." };
}

/**
 * «شغّل الإرسال توّا» — for when the scheduler that should be calling /api/notifications/dispatch is not, or has
 * not yet. It sends what is due and nothing else; it creates nothing and cannot reach anybody a campaign did not
 * already name.
 */
export async function runCampaignsNow(): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);

  const outcome = await dispatchCampaigns();
  revalidatePath(PAGE);

  if (outcome.claimed === 0) {
    return { ok: true, message: "ما فمّاش إشعار مستني. كان عندك واحد مبرمج لوقت جاي، يستنّى وقتو." };
  }
  return {
    ok: outcome.failed === 0,
    message: `خرج ${outcome.sent} من ${outcome.claimed}${outcome.failed ? `، وفشل ${outcome.failed} (شوف السبب تحت)` : ""}.`,
  };
}
