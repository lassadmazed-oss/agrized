import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

import { publicEnv } from "@/lib/env";
import { currentLocale, displayHeaders, localeHeaders } from "@/lib/i18n/server";
import { auditHeaders } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/*
 * دخول الحريف — the buyer's own session.
 *
 * THE SPLIT THIS MODULE EXISTS TO KEEP. Everything that PROTECTS the door is in SQL (0096, 0100, 0108): the
 * codes, their lifetime, how many guesses one gets, how often a number may ask, how many password attempts a
 * number gets in a quarter of an hour, and every check itself. None of it can be skipped by a caller, because
 * all of those functions are revoked from anon and authenticated and only the service role may call them.
 * This file is the other half — the part SQL cannot do — turning a proven identity into a Supabase session,
 * and a chosen password into something Supabase Auth will check.
 *
 * THE SIGN-IN MODEL SINCE 2026-09-28 (the owner's spec, verbatim in the task):
 *   · the SMS code is sent ONCE, the first time, to prove the phone number;
 *   · after that proof the buyer chooses a password of their own (persons.password_set_at records that);
 *   · every later sign-in is phone + password, no SMS, with «تذكّر هذا الجهاز» deciding whether the cookies
 *     outlive the browser window;
 *   · SMS comes back only for the sensitive acts: a forgotten password, a change of number.
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
 * it, never types it, and it is derived from the person id, so it needs no lookup table of its own. The
 * password the buyer chooses is set on that same auth user, and `signInWithPassword` is given that address
 * and their password — which is why the phone → person → address resolution below runs with the service
 * role, before any credential is checked.
 *
 * THE LINK ITSELF IS NEVER E-MAILED EITHER. `generateLink` is asked for a magic link purely to obtain its
 * `hashed_token`, which is redeemed in the same request. The token never leaves the server.
 *
 * WHAT PROVES IDENTITY THE FIRST TIME IS THE SMS CODE AND ONLY THAT. By the time the session is minted,
 * verify_client_login_code has already returned true for a code that went to the phone on the person's own
 * record. The e-mail address is bookkeeping, not a credential — which is why the auth user is created with
 * `email_confirm: true` and no password at all: until the buyer chooses one there is nothing to guess.
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

/** What a phone + password sign-in can answer, and it is deliberately blunt: see signInWithPassword. */
export type ClientPasswordFailure = "bad_credentials" | "too_many" | "not_applied" | "error";

export type ClientLoginResult =
  | { ok: true; personId: string; fullName: string | null; passwordSet: boolean }
  | { ok: false; reason: ClientLoginFailure; attemptsLeft?: number };

export type ClientPasswordResult =
  | { ok: true; personId: string; fullName: string | null }
  | { ok: false; reason: ClientPasswordFailure; retryAfterSeconds?: number };

/** What a code may be asked for. `phone_change` has its own pair of functions and never goes through these. */
export type CodePurpose = "login" | "reset";

/**
 * The signed-in buyer, or null. Never throws: a visitor with no session is the normal case.
 * `passwordSet` is false until the buyer has chosen a password; the page insists on that step before the
 * account, and a returning buyer without one cannot use the phone + password door yet.
 */
export type CurrentClient = {
  personId: string;
  userId: string;
  fullName: string | null;
  phoneE164: string | null;
  passwordSet: boolean;
};

/** The shape of a persons row as this module reads it. 0108's column is not in database.types until db:types runs. */
type PersonAuthRow = {
  id: string;
  full_name: string | null;
  phone_e164: string | null;
  profile_id: string | null;
  password_set_at: string | null;
};

const PERSON_AUTH_COLUMNS = "id, full_name, phone_e164, profile_id, password_set_at";

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

/** A missing column reads the same way: 0108 has not been applied and the screen should say so. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42703" || /password_set_at/.test(error?.message ?? "");
}

// ---------------------------------------------------------------------------
// The three clients this module builds, and why there are three
// ---------------------------------------------------------------------------

/**
 * The SSR client whose cookies do NOT outlive the browser window — «تذكّر هذا الجهاز» left unticked.
 *
 * @supabase/ssr writes every auth cookie with a 400-day maxAge, so a buyer who signed in on a borrowed phone
 * is still signed in on it a year later. Stripping maxAge and expires turns each cookie into a session cookie,
 * which the browser drops when it is closed — the plain reading of «do not remember this device». Nothing
 * else about the client changes: same URL, same key, same audit headers, so src/lib/supabase/server.ts is
 * copied here rather than edited, because the copy differs in one line and that line is the feature.
 *
 * REMOVALS ARE LEFT ALONE. When the library clears a cookie it writes an empty value with maxAge 0; stripping
 * THAT would turn a deletion into a live empty cookie. Only a cookie carrying a value loses its lifetime.
 *
 * A KNOWN EDGE, stated rather than hidden: a token refresh performed later by a Server Action goes through the
 * ordinary client and rewrites the cookies with the default lifetime. The buyer's choice holds for the session
 * as minted and for every page read; a refresh inside an action on a long-lived tab may extend it.
 */
async function createSessionOnlyClient() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            if (!value) {
              cookieStore.set(name, value, options);
              continue;
            }
            const sessionOnly = { ...options };
            delete sessionOnly.maxAge;
            delete sessionOnly.expires;
            cookieStore.set(name, value, sessionOnly);
          }
        } catch {
          // Server Components cannot write cookies; every caller of this client is a Server Action.
        }
      },
    },
    global: { headers: auditHeaders(requestHeaders) },
  });
}

/** The cookie-writing client for a sign-in: remembered on this device, or gone when the window closes. */
async function createSessionClient(remember: boolean) {
  return remember ? createClient() : createSessionOnlyClient();
}

/**
 * A client that touches NO cookies, for checking a password without signing anybody in or out.
 *
 * Verifying «your current password» on the security page must not replace the session the buyer already
 * holds, and must not leave a second one behind; the plain supabase-js client with persistence off has no
 * storage at all, so a successful check is a token that lives in this function's frame and dies with it.
 */
function createThrowawayClient() {
  return createBareClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * The service-role client for an auth RPC, carrying the language of the page the buyer is on (0109).
 *
 * `display` is for the two calls that WRITE AN SMS — request_client_login_code here and
 * request_phone_change_code below: their body is app.setting_text(…), which answers in the display language,
 * so the code arrives in the language the buyer asked for it in. Every other auth call only says which
 * language that is, so the trigger on public.persons records it on the buyer's file (preferred_locale) and the
 * messages after it go out in it. Neither header changes what any of these functions answers — the same
 * object for a client and a stranger, the same throttles.
 */
async function createAuthAdminClient({ display = false }: { display?: boolean } = {}) {
  const locale = await currentLocale();
  return createAdminClient(display ? displayHeaders(locale) : localeHeaders(locale));
}

// ---------------------------------------------------------------------------
// Reading a person for the door
// ---------------------------------------------------------------------------

/** One person by phone, live rows only. Service role: public.persons is narrowed to staff by RLS. */
async function personByPhone(phone: string): Promise<{ row: PersonAuthRow | null; error: { code?: string; message?: string } | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("persons")
    .select(PERSON_AUTH_COLUMNS)
    .eq("phone_e164", phone)
    .is("archived_at", null)
    .maybeSingle();
  return { row: (data as unknown as PersonAuthRow | null) ?? null, error };
}

async function personById(personId: string): Promise<PersonAuthRow | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("persons").select(PERSON_AUTH_COLUMNS).eq("id", personId).maybeSingle();
  return (data as unknown as PersonAuthRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Codes by SMS — login (the first time) and reset (a forgotten password)
// ---------------------------------------------------------------------------

/**
 * اطلب رمز. Returns how long the code lives so the screen can run its own countdown.
 *
 * IT DOES NOT SAY WHETHER THE NUMBER IS ONE OF OURS, and the caller must not invent that either: the SQL
 * answers identically for a client, a stranger and a number over its limit, so that this endpoint cannot be
 * used to ask whether a given phone belongs to an AgriZed buyer. The screen says «إذا النمرة مسجّلة عندنا،
 * الرمز وصل», which is the true sentence. A reset asked for a number that never confirmed itself is answered
 * the same way and sends nothing.
 */
export async function requestLoginCode(
  phone: string,
  purpose: CodePurpose = "login",
): Promise<{ ok: true; ttlSeconds: number } | { ok: false; reason: ClientLoginFailure }> {
  const admin = await createAuthAdminClient({ display: true });
  const { data, error } = await admin.rpc(
    "request_client_login_code" as never,
    { p_phone: phone, p_purpose: purpose } as never,
  );

  if (error) return { ok: false, reason: isMissingFunction(error) ? "not_applied" : "error" };

  const out = (data ?? {}) as { ok?: boolean; reason?: string; ttl_seconds?: number };
  if (!out.ok) return { ok: false, reason: out.reason === "invalid_phone" ? "invalid_phone" : "error" };
  return { ok: true, ttlSeconds: typeof out.ttl_seconds === "number" ? out.ttl_seconds : 300 };
}

type VerifiedCode =
  | { ok: true; personId: string; fullName: string | null }
  | { ok: false; reason: ClientLoginFailure; attemptsLeft?: number };

/**
 * The code, checked and burned by SQL. Nothing here re-implements the count of attempts or the expiry, and
 * only a code issued for THIS purpose verifies: a login code cannot reset a password and a reset code cannot
 * open a session.
 */
async function verifyCode(phone: string, code: string, purpose: CodePurpose): Promise<VerifiedCode> {
  const admin = await createAuthAdminClient();
  const { data, error } = await admin.rpc(
    "verify_client_login_code" as never,
    { p_phone: phone, p_code: code, p_purpose: purpose } as never,
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
  return { ok: true, personId: out.person_id, fullName: out.full_name ?? null };
}

/**
 * The auth user behind a person: found through persons.profile_id, or created the first time.
 *
 * A user may already exist from an attempt whose link step never ran. That is not a failure — it is the same
 * buyer — so the address is looked up rather than treated as a collision.
 */
async function ensureAuthUser(personId: string, fullName: string | null, knownUserId: string | null): Promise<string | null> {
  if (knownUserId) return knownUserId;

  const admin = createAdminClient();
  const email = clientEmail(personId);
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, person_id: personId },
  });
  if (!created.error && created.data.user) return created.data.user.id;

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return list?.users.find((u) => u.email === email)?.id ?? null;
}

/**
 * تثبّت من الرمز، وافتح الجلسة — the FIRST sign-in. Four acts, in an order that matters:
 *
 *   1 · the database checks the code, counts the attempt and burns the code — nothing here re-implements it;
 *   2 · the buyer's auth user is found, or created the first time they ever sign in;
 *   3 · a session is minted and its cookies are written by the SSR client;
 *   4 · public.persons.profile_id is pointed at that user.
 *
 * Step 4 is LAST on purpose. If the session fails to mint, no person is left linked to an auth user that
 * never signed anyone in, and the next attempt starts clean.
 *
 * The answer carries `passwordSet`, and the caller must act on it: a buyer who has not chosen a password is
 * signed in but is shown nothing but «أنشئ كلمة سرّ» until they do.
 */
export async function signInWithCode(phone: string, code: string): Promise<ClientLoginResult> {
  const admin = await createAuthAdminClient();

  // 1 · The code. Everything that makes this safe happened in SQL before this line returned.
  const verified = await verifyCode(phone, code, "login");
  if (!verified.ok) return verified;

  const { personId, fullName } = verified;
  const email = clientEmail(personId);

  // 2 · The auth user. persons.profile_id is the record of it, so a returning buyer needs no search.
  const person = await personById(personId);
  const userId = await ensureAuthUser(personId, fullName, person?.profile_id ?? null);
  if (!userId) return { ok: false, reason: "error" };

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

  return { ok: true, personId, fullName, passwordSet: person?.password_set_at != null };
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/**
 * The owner's password rule, from SQL. Service-role only, so it is read here and handed to the screen; the
 * screen never carries a number of its own. A missing function means 0108 is not applied.
 */
export async function passwordPolicy(): Promise<{ ok: true; minLength: number } | { ok: false; reason: "not_applied" | "error" }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("client_password_policy" as never, {} as never);
  if (error) return { ok: false, reason: isMissingFunction(error) ? "not_applied" : "error" };
  const out = (data ?? {}) as { min_length?: number };
  if (typeof out.min_length !== "number" || out.min_length < 1) return { ok: false, reason: "error" };
  return { ok: true, minLength: out.min_length };
}

/**
 * Sets (or replaces) the buyer's password and records that they have one.
 *
 * The password goes to Supabase Auth through the admin API — it hashes it, it checks it later, and this
 * codebase never stores or compares one. mark_password_set is what flips the door from «code by SMS» to
 * «phone + password» for this person, so it runs only after Auth has accepted the password.
 */
export async function setClientPassword(
  userId: string,
  personId: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: "not_applied" | "weak" | "error" }> {
  const admin = await createAuthAdminClient();
  const updated = await admin.auth.admin.updateUserById(userId, { password });
  if (updated.error) {
    // Auth's own minimum (its dashboard setting) is enforced there too; «weak» lets the screen say so.
    return { ok: false, reason: updated.error.code === "weak_password" ? "weak" : "error" };
  }

  const { error } = await admin.rpc("mark_password_set" as never, { p_person: personId } as never);
  if (error) return { ok: false, reason: isMissingFunction(error) ? "not_applied" : "error" };
  return { ok: true };
}

/**
 * Puts THIS device back into a session after its password was just written — and that sentence is the
 * whole reason the function exists.
 *
 * `admin.auth.admin.updateUserById(id, { password })` revokes every session the user holds, including the
 * one the buyer is standing on while they choose the password. Proven on the demo client on 2026-09-28: the
 * OTP minted a session at 21:14, the password was written at 21:16, and auth.sessions held ZERO rows a second
 * later. The first-time flow therefore ended on the sign-in screen with no explanation, and «change password»
 * on the security page would have logged the buyer out of their own phone while promising the opposite.
 *
 * The reset flow never had the bug because it signs in afresh after writing the password. This is that step,
 * lifted out so the other two flows can take it too. It does NOT go through signInWithPassword: that one
 * charges the brute-force ledger and resolves the phone, and neither belongs to a password the server itself
 * just set. The address is derived, the password is in hand, the client is the remember-aware one.
 *
 * Returns whether a session now exists. A false is not an error to shout about — the password IS saved — it
 * is a reason to send the buyer to the sign-in screen with a sentence that says so.
 */
export async function establishPasswordSession(personId: string, password: string, remember: boolean): Promise<boolean> {
  const supabase = await createSessionClient(remember);
  const { error } = await supabase.auth.signInWithPassword({ email: clientEmail(personId), password });
  if (error) console.warn(`[client-auth] password written but the session could not be re-established: ${error.message}`);
  return !error;
}

/**
 * ادخل بالنمرة وكلمة السرّ — the RETURNING sign-in.
 *
 * THE ATTEMPT IS CHARGED BEFORE ANYTHING IS LOOKED UP. client_password_attempt counts this call against the
 * phone whether the number is a client's, a stranger's, or a client's with no password yet, and whether the
 * password turns out right or wrong. A guess costs exactly what a correct sign-in costs, so the ceiling cannot
 * be probed for which numbers exist.
 *
 * ONE SENTENCE FOR EVERY FAILURE. An unknown number, a number that has not chosen a password yet, and a wrong
 * password all answer `bad_credentials`, and the screen prints «النمرة ولا كلمة السرّ غالطة» for all three.
 * Saying which would turn this form into the oracle the OTP door was built not to be. `too_many` is the one
 * exception, and it leaks nothing: the counter is charged for every number alike.
 *
 * `remember` decides the cookies' lifetime and nothing else — see createSessionOnlyClient.
 */
export async function signInWithPassword(
  phone: string,
  password: string,
  remember: boolean,
): Promise<ClientPasswordResult> {
  const admin = await createAuthAdminClient();

  const attempt = await admin.rpc("client_password_attempt" as never, { p_phone: phone } as never);
  if (attempt.error) return { ok: false, reason: isMissingFunction(attempt.error) ? "not_applied" : "error" };
  const gate = (attempt.data ?? {}) as { ok?: boolean; reason?: string; retry_after_seconds?: number };
  if (!gate.ok) {
    return { ok: false, reason: "too_many", retryAfterSeconds: gate.retry_after_seconds };
  }

  const { row: person, error } = await personByPhone(phone);
  if (error) return { ok: false, reason: isMissingColumn(error) ? "not_applied" : "error" };
  if (!person || !person.profile_id || !person.password_set_at) {
    return { ok: false, reason: "bad_credentials" };
  }

  const supabase = await createSessionClient(remember);
  const signedIn = await supabase.auth.signInWithPassword({ email: clientEmail(person.id), password });
  if (signedIn.error || !signedIn.data.user) return { ok: false, reason: "bad_credentials" };

  return { ok: true, personId: person.id, fullName: person.full_name };
}

/**
 * Checks the buyer's CURRENT password without touching their session — the guard in front of «change my
 * password». No cookie is read or written; a right answer is a token that dies here.
 */
export async function checkClientPassword(personId: string, password: string): Promise<boolean> {
  const client = createThrowawayClient();
  const { data, error } = await client.auth.signInWithPassword({ email: clientEmail(personId), password });
  return !error && data.user !== null;
}

/**
 * نسيت كلمة السرّ — a code by SMS, a new password, and every other device signed out.
 *
 *   1 · the reset code is verified and burned (purpose `reset`, so a login code cannot be reused here);
 *   2 · the new password is set on the auth user and password_set_at is stamped;
 *   3 · a session is opened here with that password;
 *   4 · every OTHER session of this user is revoked, because a buyer who resets a password is usually a buyer
 *       who fears somebody else holds the old one.
 *
 * The password fields are validated by the caller BEFORE this runs: a mismatch must not burn the code.
 */
export async function resetPasswordWithCode(
  phone: string,
  code: string,
  password: string,
  remember: boolean,
): Promise<ClientLoginResult | { ok: false; reason: "weak" }> {
  const verified = await verifyCode(phone, code, "reset");
  if (!verified.ok) return verified;

  const person = await personById(verified.personId);
  if (!person?.profile_id) return { ok: false, reason: "error" };

  const set = await setClientPassword(person.profile_id, person.id, password);
  if (!set.ok) return set.reason === "weak" ? { ok: false, reason: "weak" } : { ok: false, reason: set.reason };

  const supabase = await createSessionClient(remember);
  const signedIn = await supabase.auth.signInWithPassword({ email: clientEmail(person.id), password });
  if (signedIn.error) return { ok: false, reason: "error" };

  // The password just changed; whoever else was signed in as this buyer is out. A failure here is logged
  // and not surfaced: the reset itself succeeded and the sentence on screen must say so.
  const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
  if (othersError) console.warn(`[client-auth] reset done but other sessions not revoked: ${othersError.message}`);

  return { ok: true, personId: person.id, fullName: person.full_name, passwordSet: true };
}

// ---------------------------------------------------------------------------
// Changing the phone number — SMS to the NEW number is the sensitive-action check
// ---------------------------------------------------------------------------

/**
 * Sends a code to the number the buyer wants to move to. Answered `ok` whether or not that number is free —
 * SQL sends nothing when it belongs to another live person, and says nothing, so this cannot ask whether a
 * given phone is a client's.
 */
export async function requestPhoneChange(
  personId: string,
  newPhone: string,
): Promise<{ ok: true; ttlSeconds: number } | { ok: false; reason: ClientLoginFailure | "same_phone" }> {
  const admin = await createAuthAdminClient({ display: true });
  const { data, error } = await admin.rpc(
    "request_phone_change_code" as never,
    { p_person: personId, p_new_phone: newPhone } as never,
  );
  if (error) return { ok: false, reason: isMissingFunction(error) ? "not_applied" : "error" };

  const out = (data ?? {}) as { ok?: boolean; reason?: string; ttl_seconds?: number };
  if (!out.ok) {
    // `same_phone` is the buyer's OWN number, which they are authenticated as: naming it leaks nothing.
    if (out.reason === "invalid_phone" || out.reason === "same_phone") return { ok: false, reason: out.reason };
    return { ok: false, reason: "error" };
  }
  return { ok: true, ttlSeconds: typeof out.ttl_seconds === "number" ? out.ttl_seconds : 300 };
}

export type PhoneChangeFailure = ClientLoginFailure | "phone_taken";

/** Confirms the code that went to the new number and moves persons.phone_e164 to it. */
export async function confirmPhoneChange(
  personId: string,
  code: string,
): Promise<{ ok: true; phoneE164: string } | { ok: false; reason: PhoneChangeFailure; attemptsLeft?: number }> {
  const admin = await createAuthAdminClient();
  const { data, error } = await admin.rpc(
    "confirm_phone_change" as never,
    { p_person: personId, p_code: code } as never,
  );
  if (error) return { ok: false, reason: isMissingFunction(error) ? "not_applied" : "error" };

  const out = (data ?? {}) as { ok?: boolean; reason?: string; phone_e164?: string; attempts_left?: number };
  if (!out.ok || !out.phone_e164) {
    const named: PhoneChangeFailure[] = ["invalid_code", "expired", "no_code", "too_many_attempts", "phone_taken"];
    const reason = named.find((r) => r === out.reason) ?? "error";
    return { ok: false, reason, attemptsLeft: out.attempts_left };
  }
  return { ok: true, phoneE164: out.phone_e164 };
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/**
 * The buyer this request belongs to, or null.
 *
 * READ FROM public.persons BY profile_id, not from the session's metadata: metadata is a copy written once
 * at sign-up and a file that was merged or renamed since would print a stale name. The session proves WHO
 * is asking; the table says what is true about them now — including whether they have chosen a password.
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
  const { data, error } = await admin
    .from("persons")
    .select(PERSON_AUTH_COLUMNS)
    .eq("profile_id", user.id)
    .maybeSingle();

  // Before 0108 the column does not exist; the buyer still has a session, so the read is repeated without it
  // and «no password yet» is reported, which sends them to a screen whose action says 0108 is not applied.
  let person = (data as unknown as PersonAuthRow | null) ?? null;
  if (error && isMissingColumn(error)) {
    const { data: legacy } = await admin.from("persons").select("id, full_name, phone_e164").eq("profile_id", user.id).maybeSingle();
    person = legacy ? { ...legacy, profile_id: user.id, password_set_at: null } : null;
  }
  if (!person) return null;

  return {
    personId: person.id,
    userId: user.id,
    fullName: person.full_name,
    phoneE164: person.phone_e164,
    passwordSet: person.password_set_at != null,
  };
}

/** اخرج. Clears the session cookies on THIS device; the buyer's file is untouched. */
export async function signOutClient(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** اخرج من الأجهزة الأخرى. This device keeps its session; every other one is revoked. */
export async function signOutOtherDevices(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return { ok: !error };
}
