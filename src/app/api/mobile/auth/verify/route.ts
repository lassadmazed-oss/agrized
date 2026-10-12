import { z } from "zod";

import { appSignInWithCode } from "@/lib/client-auth";

import { fail, phoneOf } from "../_shared";

/**
 * POST /api/mobile/auth/verify — the code the SMS carried, exchanged for a session.
 *
 * The code itself is checked in SQL, which is where its lifetime and its attempt ceiling live. What this
 * side adds is the part SQL cannot: making sure the buyer has an auth user, redeeming a one-time link for a
 * session, and linking the profile — then handing the tokens back rather than writing cookies.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().trim().min(1).max(32),
  // Digits only, and bounded: the length itself is the database's to judge.
  code: z.string().trim().regex(/^[0-9]{4,10}$/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("invalid_code");

  const phone = await phoneOf(parsed.data.phone);
  if (!phone.ok) return fail(phone.reason);

  const result = await appSignInWithCode(phone.e164, parsed.data.code);
  if (!result.ok) {
    const status = result.reason === "not_applied" ? 503 : result.reason === "too_many_attempts" ? 429 : 401;
    return fail(result.reason, { attemptsLeft: result.attemptsLeft }, status);
  }

  return Response.json({
    ok: true,
    session: result.session,
    person: { id: result.personId, fullName: result.fullName },
    passwordSet: result.passwordSet,
  });
}
