"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  currentClient,
  passwordPolicy,
  requestLoginCode,
  resetPasswordWithCode,
  setClientPassword,
  signInWithCode,
  signInWithPassword,
  signOutClient,
  establishPasswordSession,
  type ClientLoginFailure,
  type ClientPasswordFailure,
  type CodePurpose,
} from "@/lib/client-auth";
import { normalisePhone } from "@/lib/client-phone";
import { getPublicConfig, t, type PublicConfig } from "@/lib/config";
import { toWesternDigits } from "@/lib/digits";
import { clientIp, hashIp } from "@/lib/request-context";
import { dispatchNotifications } from "@/lib/sms";

import { LOGIN_INITIAL, type LoginState } from "./login-state";

/*
 * The acts of the buyer's door, as Server Actions.
 *
 * EVERY SENTENCE HERE SAYS WHAT TO DO NEXT, which is the house rule for errors. The failure codes come from
 * SQL (0096, 0108) and are deliberately narrow; the mapping from a code to a sentence is here, and the
 * sentence itself is the owner's text under ui.login.*, in the language of the page the form was posted
 * from — so one code prints one sentence for everybody who reads that language.
 *
 * WHAT IS NOT SAID, ON PURPOSE: «هذه النمرة ما عندهاش حساب». The database answers identically for a number
 * that belongs to a client and one that belongs to nobody, so that this form cannot be used to ask whether
 * a given phone is an AgriZed buyer. The code screen therefore says «إذا النمرة مسجّلة عندنا، الرمز وصل» —
 * which is true in both cases — and the password screen says «النمرة ولا كلمة السرّ غالطة» for an unknown
 * number, a number with no password yet and a wrong password alike. A client who really has no file rings
 * the team, whose number is in the footer.
 */

// ONE SENTENCE FOR A CODE THAT DOES NOT OPEN, whatever the reason. SQL (0108) answers «wrong», «no live code»
// and «expired» with the same object, and this prints them the same — with no «باقيلك N محاولات» either —
// because a code is only ever issued to a number that belongs to a client: a different sentence for «no code
// for this number», or a counter that only a live code has, would let a probe tell a number that just asked
// for a code from one that never did. `expired` and `no_code` stay in the type for 0096's callers and print
// the same words.
const INVALID_CODE = "ui.login.error_invalid_code";

/** The sentence for each failure code, as the key of the owner's text; t(config, key) prints it. */
const MESSAGES: Record<ClientLoginFailure, string> = {
  invalid_phone: "ui.login.error_invalid_phone",
  invalid_code: INVALID_CODE,
  expired: INVALID_CODE,
  no_code: INVALID_CODE,
  too_many_attempts: "ui.login.error_too_many_attempts",
  not_applied: "ui.login.error_not_applied",
  error: "ui.login.error_generic",
};

const PASSWORD_MESSAGES: Record<ClientPasswordFailure, string> = {
  // ONE sentence for the three failures it covers. See signInWithPassword in src/lib/client-auth.ts.
  bad_credentials: "ui.login.error_bad_credentials",
  too_many: "ui.login.error_too_many_passwords",
  not_applied: MESSAGES.not_applied,
  error: MESSAGES.error,
};

const SMS_BLOCKED = "ui.login.error_sms_blocked";
const SESSION_GONE = "ui.login.error_session_gone";
const MISMATCH = "ui.login.error_password_mismatch";
const WEAK = "ui.login.error_password_weak";
const PASSWORD_EXISTS = "ui.login.error_password_exists";

/**
 * «استنّى 12 دقيقة» from the seconds SQL answers. The word agreeing with its number is the owner's plural
 * message (ui.login.error_retry_in), per language.
 */
function retryIn(config: PublicConfig, seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return t(config, PASSWORD_MESSAGES.too_many);
  return t(config, "ui.login.error_retry_in", { minutes: Math.max(1, Math.ceil(seconds / 60)) });
}

function tooShort(config: PublicConfig, minLength: number): string {
  return t(config, "ui.login.error_password_short", { count: minLength });
}

// THE PHONE NORMALISER IS IN src/lib/client-phone.ts — one copy, shared with the security page's actions: a
// "use server" file cannot export it, and a second copy written there had already drifted from this one. Every
// phone this door reads goes through that one function.

/** The phone for this submit: the visible field, or the hidden one a later step carries across. */
function phoneFrom(formData: FormData, previous: LoginState): string {
  return normalisePhone(String(formData.get("phone") ?? previous.phone));
}

/*
 * THE PER-CALLER BURST GUARD on password attempts, and an honest account of what it is and is not.
 *
 * The real ceiling is in SQL, per phone number, from the setting auth.client_password_max_per_15min: it is
 * durable, it is the owner's to raise, and it cannot be skipped by any caller. This is the other half — a
 * per-caller layer — and it exists because SQL's counter is keyed on the phone, so somebody walking a thousand
 * DIFFERENT numbers with one password never touches it. Counting the caller is the only way to notice that.
 *
 * IT IS IN MEMORY, WHICH MEANS IT IS PER INSTANCE, and that is stated rather than hidden: a serverless
 * deployment runs several, so a determined caller gets this many attempts per warm instance rather than this
 * many in total. It is a speed bump; the protection is the password itself and the per-number ceiling.
 *
 * THE KEY IS A SALTED HASH, never an address: src/lib/request-context.ts holds that rule and this obeys it.
 * The window is a technical constant and not a setting — a setting here would have to be readable from the
 * public configuration, which is exactly the place a rate limit should not be published.
 */
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = 20;
const bursts = new Map<string, number[]>();

function overBurstLimit(key: string | null): boolean {
  if (!key) return false;
  const now = Date.now();
  const recent = (bursts.get(key) ?? []).filter((at) => now - at < BURST_WINDOW_MS);
  recent.push(now);
  bursts.set(key, recent);

  if (bursts.size > 5_000) {
    for (const [k, hits] of bursts) {
      if (hits.every((at) => now - at >= BURST_WINDOW_MS)) bursts.delete(k);
    }
  }
  return recent.length > BURST_MAX;
}

async function callerKey(): Promise<string | null> {
  // hashIp throws when IP_HASH_SALT is unset. A missing salt must not take the door down; the SQL ceiling
  // still stands, so the burst guard is simply skipped.
  try {
    return hashIp(clientIp(await headers()));
  } catch {
    return null;
  }
}

/**
 * Two fields that must agree, checked BEFORE anything is spent — a code, an attempt, a session. Returns the
 * password or the sentence. `minLength` is read fresh from SQL here: the copy in state is for the screen.
 */
async function newPasswordFrom(
  config: PublicConfig,
  formData: FormData,
): Promise<{ ok: true; password: string; minLength: number } | { ok: false; error: string; minLength: number }> {
  const policy = await passwordPolicy();
  if (!policy.ok) return { ok: false, error: t(config, MESSAGES[policy.reason]), minLength: 0 };

  const password = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (password.length < policy.minLength) {
    return { ok: false, error: tooShort(config, policy.minLength), minLength: policy.minLength };
  }
  if (password !== confirm) return { ok: false, error: t(config, MISMATCH), minLength: policy.minLength };
  return { ok: true, password, minLength: policy.minLength };
}

/**
 * The code, sent and AWAITED — for a login the first time, or a reset. Two decisions, both learned the hard
 * way on 2026-09-25 («sms did not get it»).
 *
 * FIRST: something has to drain the queue. request_client_login_code writes the message to
 * public.notification_outbox — one queue, one provider, one set of retries — but the outbox drains only
 * when somebody asks it to. The three other public forms that queue a message (register, land, offer)
 * each call the dispatcher; this one did not, so the row sat at `pending` with attempts = 0 and no error,
 * nothing having tried, until the code expired five minutes later.
 *
 * SECOND: it is AWAITED rather than left to `after()`, which is how those three do it. A login code is
 * the one message in this product whose failure the person in front of the screen must hear about — they
 * are standing there waiting for it, and «الرمز وصل» followed by silence is the worst answer available.
 * Awaiting costs a moment and buys the sentence below.
 *
 * AND IT LEAKS NOTHING. `blocked` is a provider or configuration state — the same for every caller — so
 * saying it out loud cannot tell anybody whether a given number belongs to a client. That is why this is
 * a real error message while «this number is not registered» is still, deliberately, never said.
 */
async function sendCode(
  config: PublicConfig,
  phone: string,
  purpose: CodePurpose,
): Promise<{ ok: true; ttlSeconds: number } | { ok: false; error: string }> {
  const result = await requestLoginCode(phone, purpose);
  if (!result.ok) return { ok: false, error: t(config, MESSAGES[result.reason]) };

  const outcome = await dispatchNotifications(3);
  if (outcome.blocked) {
    console.warn(`[login] ${purpose} code queued but not sent: ${outcome.blocked}`);
    return { ok: false, error: t(config, SMS_BLOCKED) };
  }
  return { ok: true, ttlSeconds: result.ttlSeconds };
}

// THE SECOND SENTENCE IS NOT PADDING. A number over its hourly ceiling is answered exactly like one that just
// received a code — silently, because «you have asked too many times» would only ever be said to a number
// that IS a client, and that makes this form an oracle for who is one. The cost of that silence is a person
// staring at «الرمز وصل» after their fourth try. This is the most that can be said without answering the
// question: it is true for everybody, and it tells someone who has been retrying what to actually do.
const CODE_SENT_NOTE = "ui.login.code_sent_note";

// THE WORDS ARE READ FIRST in every action that may print one, before anything is checked: the owner's texts
// in the language of the page the form came from (getPublicConfig — cached, so a lookup rather than a query).
// Up front, so every path through an action does the same work; the identical answers above stay identical.

// ---------------------------------------------------------------------------
// 1 · The first time: a code by SMS, then a password of one's own
// ---------------------------------------------------------------------------

/** «أوّل مرّة؟ ادخل برمز SMS» — from the password screen, with the number typed there. */
export async function requestCode(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = await getPublicConfig();
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  if (!phone) return { ...LOGIN_INITIAL, error: t(config, "ui.login.error_phone_required_for_code") };

  const sent = await sendCode(config, phone, "login");
  if (!sent.ok) return { ...LOGIN_INITIAL, phone, error: sent.error };

  // Straight to the code step whatever the truth is — see the note at the top of this file.
  return { ...LOGIN_INITIAL, step: "otp", phone, note: t(config, CODE_SENT_NOTE), ttlSeconds: sent.ttlSeconds };
}

export async function submitCode(previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = await getPublicConfig();
  const phone = phoneFrom(formData, previous);
  const code = toWesternDigits(String(formData.get("code") ?? "")).replace(/\s/g, "").trim();

  const result = await signInWithCode(phone, code);
  if (result.ok) {
    if (!result.passwordSet) {
      // Signed in, but the account stays shut until a password exists. The policy is read now so the field
      // can say its minimum; the action that sets the password reads it again before it accepts one.
      const policy = await passwordPolicy();
      if (!policy.ok) return { ...LOGIN_INITIAL, phone, error: t(config, MESSAGES[policy.reason]) };
      return { ...LOGIN_INITIAL, step: "set_password", phone, minLength: policy.minLength };
    }
    // The page reads the session on the server, so it has to be re-rendered rather than trusted to refetch.
    revalidatePath("/[lang]/zitounti", "page");
    return { ...previous, phone, error: null, note: null };
  }

  // No «باقيلك N محاولات»: see INVALID_CODE.
  return { ...previous, step: "otp", phone, note: null, error: t(config, MESSAGES[result.reason]) };
}

/**
 * «أنشئ كلمة سرّ» — the signed-in buyer chooses the password every later sign-in will use.
 *
 * THE SESSION IS THE PROOF. No phone and no code travel with this submit; currentClient() reads the cookies the
 * code step wrote, and a submit with no session behind it is refused and sent back to the code screen. That is
 * also what makes this safe to reach from page.tsx directly — a buyer who closed the tab between the code and
 * the password lands here again with the same session, or with none.
 *
 * USABLE EXACTLY ONCE, in the first-time flow. A session whose person already has a password is refused: this
 * action asks for no current password, so a live session — a borrowed phone, a tab left open — could otherwise
 * replay it and replace the password without knowing it. Changing a password is the security page's act, and
 * that one checks the current password first.
 */
export async function setPassword(previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = await getPublicConfig();
  const client = await currentClient();
  if (!client) return { ...LOGIN_INITIAL, phone: previous.phone, error: t(config, SESSION_GONE) };
  if (client.passwordSet) return { ...previous, step: "set_password", note: null, error: t(config, PASSWORD_EXISTS) };

  const chosen = await newPasswordFrom(config, formData);
  if (!chosen.ok) return { ...previous, step: "set_password", error: chosen.error, minLength: chosen.minLength };

  const set = await setClientPassword(client.userId, client.personId, chosen.password);
  if (!set.ok) {
    const error = t(config, set.reason === "weak" ? WEAK : MESSAGES[set.reason]);
    return { ...previous, step: "set_password", error, minLength: chosen.minLength };
  }

  // WRITING THE PASSWORD REVOKED THE SESSION THE BUYER IS STANDING ON — see establishPasswordSession.
  // Without this line the first-time flow ended on the sign-in screen with no word of explanation, which
  // is what the demo client hit on 2026-09-28. The remember box on this step decides the cookies'
  // lifetime exactly as it does on the password screen; the same input name, drawn on one step at a time.
  const remember = formData.get("remember") === "1";
  const signedIn = await establishPasswordSession(client.personId, chosen.password, remember);
  revalidatePath("/[lang]/zitounti", "page");
  if (!signedIn) {
    // The password is saved — that must not read as a failure. Say so, and hand them the door it opens.
    return { ...LOGIN_INITIAL, phone: client.phoneE164 ?? previous.phone, note: t(config, "ui.login.password_saved_sign_in") };
  }
  return { ...previous, step: "set_password", error: null, note: null, minLength: chosen.minLength };
}

// ---------------------------------------------------------------------------
// 2 · Every time after: phone + password
// ---------------------------------------------------------------------------

export async function signInPassword(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = await getPublicConfig();
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "1";

  if (!phone || !password) {
    return { ...LOGIN_INITIAL, phone, error: t(config, "ui.login.error_phone_and_password_required") };
  }

  if (overBurstLimit(await callerKey())) {
    return { ...LOGIN_INITIAL, phone, error: t(config, PASSWORD_MESSAGES.too_many) };
  }

  const result = await signInWithPassword(phone, password, remember);
  if (result.ok) {
    revalidatePath("/[lang]/zitounti", "page");
    return { ...LOGIN_INITIAL, phone, error: null };
  }

  return {
    ...LOGIN_INITIAL,
    phone,
    error:
      result.reason === "too_many" ? retryIn(config, result.retryAfterSeconds) : t(config, PASSWORD_MESSAGES[result.reason]),
  };
}

// ---------------------------------------------------------------------------
// 3 · A forgotten password: a code by SMS, a new password, every other device out
// ---------------------------------------------------------------------------

export async function requestResetCode(previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = await getPublicConfig();
  const phone = phoneFrom(formData, previous);
  if (!phone) return { ...LOGIN_INITIAL, step: "forgot_phone", error: t(config, "ui.login.error_phone_required_for_reset") };

  const sent = await sendCode(config, phone, "reset");
  if (!sent.ok) return { ...LOGIN_INITIAL, step: "forgot_phone", phone, error: sent.error };

  // The new password is collected on the same screen as the code, so the policy is needed now.
  const policy = await passwordPolicy();
  if (!policy.ok) return { ...LOGIN_INITIAL, step: "forgot_phone", phone, error: t(config, MESSAGES[policy.reason]) };

  return {
    ...LOGIN_INITIAL,
    step: "forgot_code",
    phone,
    note: t(config, CODE_SENT_NOTE),
    ttlSeconds: sent.ttlSeconds,
    minLength: policy.minLength,
  };
}

/**
 * The code and the new password together. The PASSWORD IS CHECKED FIRST: verify burns the code, and a buyer
 * whose two fields did not match must not have to ask for a new SMS to try again.
 */
export async function resetPassword(previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = await getPublicConfig();
  const phone = phoneFrom(formData, previous);
  const code = toWesternDigits(String(formData.get("code") ?? "")).replace(/\s/g, "").trim();
  const remember = formData.get("remember") === "1";

  const chosen = await newPasswordFrom(config, formData);
  if (!chosen.ok) return { ...previous, step: "forgot_code", phone, note: null, error: chosen.error, minLength: chosen.minLength };

  const result = await resetPasswordWithCode(phone, code, chosen.password, remember);
  if (result.ok) {
    revalidatePath("/[lang]/zitounti", "page");
    return { ...previous, phone, error: null, note: null };
  }

  if (result.reason === "weak") {
    return { ...previous, step: "forgot_code", phone, note: null, error: t(config, WEAK), minLength: chosen.minLength };
  }

  // No «باقيلك N محاولات»: see INVALID_CODE.
  return {
    ...previous,
    step: "forgot_code",
    phone,
    note: null,
    minLength: chosen.minLength,
    error: t(config, MESSAGES[result.reason]),
  };
}

export async function signOut(): Promise<void> {
  await signOutClient();
  revalidatePath("/[lang]/zitounti", "page");
}
