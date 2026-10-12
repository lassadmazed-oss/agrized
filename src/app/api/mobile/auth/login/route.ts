import { z } from "zod";

import { appSignInWithPassword } from "@/lib/client-auth";

import { fail, phoneOf } from "../_shared";

/**
 * POST /api/mobile/auth/login — phone + password, the everyday door, natively.
 *
 * WHAT THIS REPLACES. mobile/app/(tabs)/account.tsx opened /zitounti in the phone's browser, and its comment
 * explained that it had to: the two steps before the password can even be checked — the rate-limit gate and
 * turning a phone number into the auth address — are service-role-only, and the app holds the anon key,
 * which anyone who installs it can read. This route is those two steps, on the side of the wire that may do
 * them, and it hands back a session the app sets on its own client.
 *
 * THE PASSWORD PASSES THROUGH HERE AND IS NOT KEPT. It goes to Supabase Auth in the same request and is
 * never written, logged or returned. That is the same path the website's own form takes.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid_request");

  const phone = await phoneOf(parsed.data.phone);
  if (!phone.ok) return fail(phone.reason);

  const result = await appSignInWithPassword(phone.e164, parsed.data.password);
  if (!result.ok) {
    // 429 for the throttle so the app can show the wait, 401 for a refusal, 503 for a schema not applied.
    const status = result.reason === "too_many" ? 429 : result.reason === "not_applied" ? 503 : 401;
    return fail(result.reason, { retryAfterSeconds: result.retryAfterSeconds }, status);
  }

  return Response.json({
    ok: true,
    session: result.session,
    person: { id: result.personId, fullName: result.fullName },
  });
}
