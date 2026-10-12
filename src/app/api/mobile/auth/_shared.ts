import { getPublicConfig, settingBool } from "@/lib/config";
import { normalizePhone } from "@/lib/phone";

/**
 * What the three mobile auth routes share.
 *
 * THEY RETURN REASONS, NOT SENTENCES. Every other endpoint the app talks to answers in Arabic, because the
 * app shows what it is given. These do not: the sign-in panel's wording is already in the app's own config
 * read — `ui.login.*`, the owner's rows — and the app is the only place that knows which of its screens is
 * asking. A route that invented «الرقم ولا كلمة السر غالطين» would be a second copy of a sentence the owner
 * can edit, drifting from the website's the first time he changes it.
 */

export type Fail = { ok: false; reason: string; retryAfterSeconds?: number; attemptsLeft?: number };

export function fail(reason: string, extra: Omit<Fail, "ok" | "reason"> = {}, status = 400) {
  return Response.json({ ok: false, reason, ...extra }, { status });
}

/** The same normalisation the public forms use, so one number is one person however it was typed. */
export async function phoneOf(raw: string): Promise<{ ok: true; e164: string } | { ok: false; reason: string }> {
  const config = await getPublicConfig();
  const checked = normalizePhone(raw, settingBool(config, "lead.allow_international_phone"));
  if (!checked.ok) return { ok: false, reason: checked.reason === "not_tunisian" ? "phone_not_tunisian" : "invalid_phone" };
  return { ok: true, e164: checked.e164 };
}
