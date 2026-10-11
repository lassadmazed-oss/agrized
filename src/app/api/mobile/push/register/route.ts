import { headers } from "next/headers";
import { z } from "zod";

import { getPublicConfig, settingBool } from "@/lib/config";
import { normalizePhone } from "@/lib/phone";
import { registerPushToken } from "@/lib/push";
import { auditHeaders } from "@/lib/request-context";

/**
 * POST /api/mobile/push/register — the app hands over the push token the operating system gave it.
 *
 * WHY THE APP DOES NOT WRITE THIS ITSELF. public.push_tokens is granted to service_role alone and has RLS
 * with no policy for anon, because a push token is a device address: whoever holds one can make somebody's
 * phone buzz. The app ships the anon key, and anything shipped in an app is readable by whoever installs it.
 * So the token takes the same road a demand takes — through the website, which holds the service role on the
 * server and never in a bundle.
 *
 * WHAT THIS REFUSES. The token's shape and the platform are checked in the database (0138) and again in the
 * schema below, because a request from an app is a request from the internet. The phone is optional: a
 * visitor can install the app, allow notifications and never send a demand, and that device is still worth
 * keeping — it links itself the moment the number is known.
 *
 * NOTHING HERE IS SHOWN TO A CLIENT. Registration happens quietly in the background after the person allows
 * notifications; a failure means they get no notifications, not that they see a sentence. So the messages
 * below are for whoever is reading the logs, and the app is expected to ignore the body and retry later.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  // The same shape 0138 enforces. Checked here too so a bad token is a 400 and not a database exception.
  token: z.string().trim().regex(/^Exp(o|onent)PushToken\[[A-Za-z0-9_-]+\]$/, "token"),
  platform: z.enum(["ios", "android"]),
  phone: z.string().trim().min(1).max(32).optional(),
  appVersion: z.string().trim().max(32).optional(),
});

function fail(reason: string, message: string, status = 400) {
  return Response.json({ ok: false, reason, message }, { status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message === "token" ? "invalid_token" : "invalid_request", "الطلب ناقص ولا غالط.");
  }
  const input = parsed.data;

  /*
   * The phone goes through the same normalizePhone the public forms use, so one number is one row whether it
   * was typed «55 000 185», «+21655000185» or «0021655000185». A number this refuses is dropped rather than
   * refusing the whole registration: the device is still worth having, it simply has nobody attached yet.
   */
  let phone: string | null = null;
  if (input.phone) {
    const config = await getPublicConfig();
    const normalised = normalizePhone(input.phone, settingBool(config, "lead.allow_international_phone"));
    phone = normalised.ok ? normalised.e164 : null;
  }

  const outcome = await registerPushToken(
    { token: input.token, platform: input.platform, phone, appVersion: input.appVersion ?? null },
    auditHeaders(await headers()),
  );

  if (!outcome.ok) {
    if (outcome.reason === "invalid_token") return fail("invalid_token", "رمز الإشعار غير صالح.");
    if (outcome.reason === "invalid_platform") return fail("invalid_platform", "نظام التشغيل غير معروف.");
    return fail("failed", "تعذّر تسجيل الجهاز.", 500);
  }

  return Response.json({ ok: true, linked: outcome.linked });
}
