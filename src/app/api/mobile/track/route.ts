import { headers } from "next/headers";
import { z } from "zod";

import { getPublicConfig, settingBool } from "@/lib/config";
import { toWesternDigits } from "@/lib/digits";
import { normalizePhone } from "@/lib/phone";
import { auditHeaders } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/mobile/track — «وين وصل مطلبي؟» for the app.
 *
 * WHY IT CANNOT BE A DIRECT CALL. public.track_request is revoked from public, anon AND authenticated, and
 * the comment on the website's action says exactly why: this is not a policy-protected table read, it is a
 * lookup by a secret somebody was handed. A function anon could call is a function anon could call in a
 * loop, so it is reachable only with the service-role key, from a side of the wire where a caller can be
 * counted. The app ships the anon key; so it asks here, the same road the sign-in and the interest form take.
 *
 * ONE SENTENCE FOR THREE FAILURES, and that is the database's doing rather than this file's: a wrong number,
 * a wrong phone, and a real pair that do not belong together all answer `not_found`. Three answers would
 * make this form two oracles — type a code with a wrong phone and you would learn the code is real. This
 * route could not tell them apart even if it wanted to.
 *
 * THE CEILING IS SQL'S. `track.max_lookups_per_hour` is counted per request number inside the function, is
 * durable, and is the owner's to raise. Nothing here re-implements it; `too_many` is passed through.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  requestNo: z.string().trim().min(3).max(40),
  phone: z.string().trim().min(6).max(32),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, reason: "missing_fields" }, { status: 400 });

  // The same cleaning the website does: Western digits, no spaces, upper case. AGZ-2026-000045 however typed.
  const requestNo = toWesternDigits(parsed.data.requestNo).replace(/[\s ]/g, "").trim().toUpperCase();

  /*
   * The phone is cleaned, not judged. public.track_request compares DIGITS by suffix with an eight-digit
   * floor on both sides, so any spelling of the right number matches and no spelling of a wrong one does —
   * which means a shape normalizePhone refuses is passed through unchanged and answered `not_found`, never a
   * sentence about the number itself. Saying «that is not a Tunisian number» here would tell a stranger
   * something about the number rather than about their demand.
   */
  const config = await getPublicConfig();
  const checked = normalizePhone(parsed.data.phone, settingBool(config, "lead.allow_international_phone"));
  const phone = checked.ok ? checked.e164 : toWesternDigits(parsed.data.phone).replace(/[\s ]/g, "").trim();

  const admin = createAdminClient(auditHeaders(await headers()));
  const { data, error } = await admin.rpc("track_request", { p_request_no: requestNo, p_phone: phone });

  if (error) {
    console.error("[mobile track] track_request failed:", error);
    return Response.json({ ok: false, reason: "error" }, { status: 503 });
  }

  const out = (data ?? {}) as { ok?: boolean; reason?: string };
  if (!out.ok) {
    // Only the two reasons SQL is contracted to send are passed on. Anything else is a version of that
    // function this build has not met, and is answered as an error — telling somebody their number is wrong
    // when the truth is that the server changed sends them looking in the wrong place.
    const reason = out.reason === "too_many" ? "too_many" : out.reason === "not_found" ? "not_found" : "error";
    return Response.json({ ok: false, reason }, { status: reason === "too_many" ? 429 : 404 });
  }

  return Response.json(data);
}
