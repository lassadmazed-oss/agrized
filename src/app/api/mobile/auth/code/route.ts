import { z } from "zod";

import { requestLoginCode } from "@/lib/client-auth";

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

  return Response.json({ ok: true, ttlSeconds: result.ttlSeconds });
}
