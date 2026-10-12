import { z } from "zod";

import { requestLoginCode } from "@/lib/client-auth";
import { dispatchNotifications } from "@/lib/sms";

import { fail, phoneOf } from "../_shared";

/**
 * POST /api/mobile/auth/code — send the SMS code that proves a phone number.
 *
 * This is the first-time door and the forgotten-password door; after it the buyer chooses a password and
 * every later sign-in is /login. How often one number may ask, how long a code lives and how many guesses it
 * allows are all decided in SQL (0096) by a function only the service role may call, so this route adds no
 * policy of its own — it normalises the number and passes it on.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().trim().min(1).max(32),
  purpose: z.enum(["login", "reset"]).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid_request");

  const phone = await phoneOf(parsed.data.phone);
  if (!phone.ok) return fail(phone.reason);

  const result = await requestLoginCode(phone.e164, parsed.data.purpose ?? "login");
  if (!result.ok) return fail(result.reason, {}, result.reason === "not_applied" ? 503 : 400);

  /*
   * SOMETHING HAS TO DRAIN THE QUEUE, and this route did not — the same fault zitounti/actions.ts records
   * learning on 2026-09-25 under the words «sms did not get it». request_client_login_code writes the
   * message to public.notification_outbox and nothing else happens: the row sits at pending with attempts
   * = 0 and no error, nobody having tried, until the code expires five minutes later. Which is exactly what
   * the owner saw today.
   *
   * AWAITED, not left to after(). A login code is the one message whose failure the person holding the
   * phone must hear about — they are standing there waiting for it, and «the code is on its way» followed
   * by silence is the worst answer available. The three public forms that queue a confirmation can afford
   * after(); this cannot.
   *
   * `blocked` is a provider or configuration state, identical for every caller, so returning it tells
   * nobody whether a given number belongs to a client. That is why it is said out loud while «this number
   * is not registered» is still never said.
   */
  const outcome = await dispatchNotifications(3);
  if (outcome.blocked) {
    console.warn(`[mobile auth] login code queued but not sent: ${outcome.blocked}`);
    return fail("sms_blocked", {}, 503);
  }

  return Response.json({ ok: true, ttlSeconds: result.ttlSeconds });
}
