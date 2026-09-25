import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * دخول الحريف — the buyer's own session.
 *
 * THE SPLIT THIS MODULE EXISTS TO KEEP. Everything that PROTECTS the door is in SQL
 * (supabase/pending/bb_77_client_login.sql): the codes, their lifetime, how many guesses one gets, how
 * often a number may ask, and the check itself. None of it can be skipped by a caller, because the three
 * functions are revoked from anon and authenticated and only the service role may call them. This file is
 * the other half — the part SQL cannot do — turning a proven phone number into a Supabase session.
 *
 * WHY THERE IS A SYNTHETIC E-MAIL, stated plainly because it looks like a hack and is a deliberate choice.
 * Supabase mints a session for an auth user, and the two ways to mint one without a password are a phone
 * OTP through a provider Supabase itself supports (Twilio, MessageBird, Vonage — AgriZed sends through
 * WinSMS, which is not one of them and is already wired to public.notification_outbox) or an e-mail link.
 * So each buyer gets an auth user carrying an address under a domain RFC 2606 reserves as permanently
 * undeliverable:
 *
 *     <person id>@client.agrized.invalid
 *
 * Nothing is ever sent to it and nothing can be: `.invalid` cannot resolve, by standard. It is an internal
 * identifier shaped like an e-mail because that is the shape the session API takes. The buyer never sees
 * it, never types it, and it is derived from the person id, so it needs no lookup table of its own.
 *
 * THE LINK ITSELF IS NEVER E-MAILED EITHER. `generateLink` is asked for a magic link purely to obtain its
 * `hashed_token`, which is redeemed in the same request. The token never leaves the server.
 *
 * WHAT PROVES IDENTITY IS THE SMS CODE AND ONLY THAT. By the time anything here runs,
 * verify_client_login_code has already returned true for a code that went to the phone on the person's own
 * record. The e-mail address is bookkeeping, not a credential — which is why the auth user is created with
 * `email_confirm: true` and no password at all: there is nothing to guess.
 */

/** Where a client session is allowed to go wrong, in words the screen can turn into a sentence. */
export type ClientLoginFailure =
  | "invalid_phone"
  | "invalid_code"
  | "expired"
  | "no_code"
  | "too_many_attempts"
  | "not_applied"
  | "error";

export type ClientLoginResult =
  | { ok: true; personId: string; fullName: string | null }
  | { ok: false; reason: ClientLoginFailure; attemptsLeft?: number };

/** The signed-in buyer, or null. Never throws: a visitor with no session is the normal case. */
export type CurrentClient = { personId: string; userId: string; fullName: string | null };

/**
 * The address that identifies this buyer's auth user. Derived, never stored twice — public.persons.profile_id
 * is the link that matters and this is only how the auth table spells it.
 */
function clientEmail(personId: string): string {
  return `${personId}@client.agrized.invalid`;
}

/** PostgREST reports a missing function as PGRST202; for a draft migration that is «not applied», not a fault. */
function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * اطلب رمز. Returns how long the code lives so the screen can run its own countdown.
 *
 * IT DOES NOT SAY WHETHER THE NUMBER IS ONE OF OURS, and the caller must not invent that either: the SQL
 * answers identically for a client, a stranger and a number over its limit, so that this endpoint cannot be
 * used to ask whether a given phone belongs to an AgriZed buyer. The screen says «إذا النمرة مسجّلة عندنا،
 * الرمز وصل», which is the true sentence.
 */
export async function requestLoginCode(
  phone: string,
): Promise<{ ok: true; ttlSeconds: number } | { ok: false; reason: ClientLoginFailure }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("request_client_login_code" as never, { p_phone: phone } as never);

  if (error) return { ok: false, reason: isMissingFunction(error) ? "not_applied" : "error" };

  const out = (data ?? {}) as { ok?: boolean; reason?: string; ttl_seconds?: number };
  if (!out.ok) return { ok: false, reason: out.reason === "invalid_phone" ? "invalid_phone" : "error" };
  return { ok: true, ttlSeconds: typeof out.ttl_seconds === "number" ? out.ttl_seconds : 300 };
}

/**
 * تثبّت من الرمز، وافتح الجلسة. Four acts, in an order that matters:
 *
 *   1 · the database checks the code, counts the attempt and burns the code — nothing here re-implements it;
 *   2 · the buyer's auth user is found, or created the first time they ever sign in;
 *   3 · a session is minted and its cookies are written by the SSR client;
 *   4 · public.persons.profile_id is pointed at that user — the column nothing has ever written.
 *
 * Step 4 is LAST on purpose. If the session fails to mint, no person is left linked to an auth user that
 * never signed anyone in, and the next attempt starts clean.
 */
export async function signInWithCode(phone: string, code: string): Promise<ClientLoginResult> {
  const admin = createAdminClient();

  // 1 · The code. Everything that makes this safe happened in SQL before this line returned.
  const { data, error } = await admin.rpc(
    "verify_client_login_code" as never,
    { p_phone: phone, p_code: code } as never,
  );
  if (error) return { ok: false, reason: isMissingFunction(error) ? "not_applied" : "error" };

  const out = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    person_id?: string;
    full_name?: string | null;
    attempts_left?: number;
  };
  if (!out.ok || !out.person_id) {
    const named: ClientLoginFailure[] = ["invalid_code", "expired", "no_code", "too_many_attempts"];
    const reason = named.find((r) => r === out.reason) ?? "error";
    return { ok: false, reason, attemptsLeft: out.attempts_left };
  }

  const personId = out.person_id;
  const email = clientEmail(personId);

  // 2 · The auth user. persons.profile_id is the record of it, so a returning buyer needs no search.
  const { data: person } = await admin.from("persons").select("profile_id").eq("id", personId).maybeSingle();
  let userId = person?.profile_id ?? null;

  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: out.full_name ?? null, person_id: personId },
    });
    // A user may already exist from an attempt whose step 4 never ran. That is not a failure — it is the
    // same buyer — so the address is looked up rather than treated as a collision.
    if (created.error || !created.data.user) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = list?.users.find((u) => u.email === email)?.id ?? null;
      if (!userId) return { ok: false, reason: "error" };
    } else {
      userId = created.data.user.id;
    }
  }

  // 3 · The session. The link is generated only to take its token; it is redeemed here and never sent.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return { ok: false, reason: "error" };

  const supabase = await createClient();
  const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (sessionError) return { ok: false, reason: "error" };

  // 4 · The link, now that there is a session behind it. Idempotent, so signing in again is a no-op.
  const { error: linkError } = await admin.rpc(
    "link_client_profile" as never,
    { p_person: personId, p_user: userId } as never,
  );
  if (linkError) return { ok: false, reason: "error" };

  return { ok: true, personId, fullName: out.full_name ?? null };
}

/**
 * The buyer this request belongs to, or null.
 *
 * READ FROM public.persons BY profile_id, not from the session's metadata: metadata is a copy written once
 * at sign-up and a file that was merged or renamed since would print a stale name. The session proves WHO
 * is asking; the table says what is true about them now.
 */
export async function currentClient(): Promise<CurrentClient | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return null;

  // Service role on purpose: public.persons is narrowed to staff, and a buyer reading their OWN row through
  // a policy would need a `client` policy on every table this page touches. The narrowing here is the
  // profile_id match — one row, the one belonging to the session.
  const admin = createAdminClient();
  const { data: person } = await admin
    .from("persons")
    .select("id, full_name")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!person) return null;

  return { personId: person.id, userId: user.id, fullName: person.full_name };
}

/** اخرج. Clears the session cookies; the buyer's file is untouched. */
export async function signOutClient(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
