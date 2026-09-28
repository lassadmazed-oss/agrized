"use server";

import { createServerClient } from "@supabase/ssr";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { currentClient, establishPasswordSession, passwordPolicy } from "@/lib/client-auth";
import { lettersAr, minutesAr, normalisePhone } from "@/lib/client-phone";
import { toWesternDigits } from "@/lib/digits";
import { publicEnv } from "@/lib/env";
import { dispatchNotifications } from "@/lib/sms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  PHONE_CHANGE_INITIAL,
  SECURITY_INITIAL,
  type PhoneChangeState,
  type SecurityFormState,
} from "./security-state";

/*
 * The security page's three acts, as Server Actions: change the password, change the phone number, and
 * put every other device out.
 *
 * WHO MAY CALL THEM. Each one starts with currentClient(): a request with no client session is sent back to
 * the door, whatever the form data says. The person id used everywhere below is the SESSION'S, never a
 * field — a form cannot ask to change somebody else's number by posting their id.
 *
 * WHAT PROTECTS THE DOOR IS IN SQL (0108): the codes, their lifetime, the attempt count, the per-number
 * cooldown and hourly ceiling, and the password-attempt ledger. Every RPC here is service-role only and is
 * reached through the admin client; the Server Action is the only caller and adds the session check above.
 *
 * EVERY SENTENCE IS ARABIC AND SAYS WHAT TO DO NEXT. The database answers in codes; turning a code into a
 * sentence is user-facing copy and belongs here.
 *
 * THE PHONE NORMALISER AND THE ARABIC COUNTS come from src/lib/client-phone.ts — one copy, shared with the
 * door's actions next door, because a "use server" file cannot export a synchronous helper and the copy that
 * used to live here had already drifted from the original.
 */

/** PostgREST reports a missing function as PGRST202; for a migration not yet applied that is «not applied». */
function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

const NOT_APPLIED = "خدمة الأمان مازالت ما تفعّلتش. لازم تتطبّق supabase/migrations/0108 قبل.";
const GENERIC = "تعذّر تنفيذ الطلب توّا. حاول مرّة أخرى، وإذا تعاود المشكل كلّم الفريق.";
const POLICY_UNREADABLE = "تعذّر قراءة شروط كلمة السرّ توّا. حاول مرّة أخرى، وإذا تعاود المشكل كلّم الفريق.";

/**
 * The address that identifies this buyer's auth user — the same derivation as src/lib/client-auth.ts, spelt
 * again here because that module keeps it private and the password check below has to sign in with it. It
 * is bookkeeping, never a credential: RFC 2606 reserves `.invalid`, so nothing is ever sent to it.
 */
function clientEmail(personId: string): string {
  return `${personId}@client.agrized.invalid`;
}

/** The signed-in buyer, or straight back to the door. Never renders a security form to a stranger. */
async function requireClient() {
  const client = await currentClient();
  if (!client) redirect("/zitounti");
  return client;
}

/** The buyer's own number, read by the session's person id; null only if the row is gone. */
async function phoneOf(personId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("persons").select("phone_e164").eq("id", personId).maybeSingle();
  return data?.phone_e164 ?? null;
}

/**
 * A Supabase client that reads no cookies and writes none.
 *
 * It exists for ONE call: checking the current password with signInWithPassword. A sign-in mints a session,
 * and the SSR client from src/lib/supabase/server.ts would write that session over the real one — the buyer
 * would be silently re-signed-in as a side effect of a password check, and a wrong guess would still have
 * touched their cookies. With getAll returning nothing and setAll doing nothing, the session this call
 * mints lives in this object and dies with it.
 */
function throwawayClient() {
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // On purpose: nothing this client does may reach the browser.
      },
    },
  });
}

/**
 * Charge one password attempt to the ledger BEFORE any credential is looked at, so a wrong guess costs
 * exactly what a right one does. The ceiling is auth.client_password_max_per_15min, in SQL.
 */
async function chargePasswordAttempt(
  phone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("client_password_attempt" as never, { p_phone: phone } as never);
  if (error) return { ok: false, error: isMissingFunction(error) ? NOT_APPLIED : GENERIC };

  const out = (data ?? {}) as { ok?: boolean; reason?: string; retry_after_seconds?: number };
  if (out.ok) return { ok: true };

  const minutes = Math.max(Math.ceil((out.retry_after_seconds ?? 900) / 60), 1);
  return { ok: false, error: `جرّبت برشة مرّات. استنّى ${minutesAr(minutes)} وعاود.` };
}

/**
 * The buyer's CURRENT password, proved: the ledger is charged FIRST (whatever the outcome), then the
 * password is tried on the throwaway client. One sentence for a wrong one; the caller decides which act
 * this guards and prints nothing else.
 */
async function provePassword(
  personId: string,
  phone: string,
  password: string,
  wrongSentence: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const charged = await chargePasswordAttempt(phone);
  if (!charged.ok) return charged;

  const check = throwawayClient();
  const { error: wrong } = await check.auth.signInWithPassword({ email: clientEmail(personId), password });
  if (wrong) return { ok: false, error: wrongSentence };
  return { ok: true };
}

/**
 * The minimum length the owner set (auth.client_password_min_length), from SQL through client-auth's
 * passwordPolicy. There is NO fallback number: a policy that cannot be read is a sentence and a refused
 * form, never a minimum nobody set — the door's actions refuse the same way, and the page disables the form.
 */
async function readPolicy(): Promise<{ ok: true; minLength: number } | { ok: false; error: string }> {
  const policy = await passwordPolicy();
  if (!policy.ok) return { ok: false, error: policy.reason === "not_applied" ? NOT_APPLIED : POLICY_UNREADABLE };
  return { ok: true, minLength: policy.minLength };
}

// ---------------------------------------------------------------------------
// 1 · بدّل كلمة السرّ
// ---------------------------------------------------------------------------

/**
 * Current + new twice.
 *
 * Order: the ledger is charged, THEN the current password is checked on the throwaway client, THEN the new
 * one is written by the admin API and password_set_at is stamped, THEN every other device is signed out.
 * A wrong current password is one sentence and nothing else changes.
 */
export async function changePassword(
  _previous: SecurityFormState,
  formData: FormData,
): Promise<SecurityFormState> {
  const client = await requireClient();

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const again = String(formData.get("new_password_again") ?? "");

  const policy = await readPolicy();
  if (!policy.ok) return { ...SECURITY_INITIAL, error: policy.error };

  if (!current) {
    return { ...SECURITY_INITIAL, error: "اكتب كلمة السرّ الحالية قبل." };
  }
  if (next.length < policy.minLength) {
    return { ...SECURITY_INITIAL, error: `كلمة السرّ الجديدة قصيرة. لازم ${lettersAr(policy.minLength)} على الأقلّ.` };
  }
  if (next !== again) {
    return { ...SECURITY_INITIAL, error: "كلمة السرّ الجديدة موش متطابقة في الخانتين. اكتبها مرّتين كيف كيف." };
  }
  if (next === current) {
    return { ...SECURITY_INITIAL, error: "كلمة السرّ الجديدة هي نفس القديمة. اختار وحدة أخرى." };
  }

  const phone = await phoneOf(client.personId);
  if (!phone) return { ...SECURITY_INITIAL, error: GENERIC };

  const proved = await provePassword(
    client.personId,
    phone,
    current,
    "كلمة السرّ الحالية غالطة. عاود اكتبها، ولا اخرج واستعمل «نسيت كلمة السرّ».",
  );
  if (!proved.ok) return { ...SECURITY_INITIAL, error: proved.error };

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(client.userId, { password: next });
  if (updateError) return { ...SECURITY_INITIAL, error: GENERIC };

  const { error: markError } = await admin.rpc("mark_password_set" as never, { p_person: client.personId } as never);
  if (markError && !isMissingFunction(markError)) return { ...SECURITY_INITIAL, error: GENERIC };

  // THE OTHER DEVICES GO OUT, as the reset does. A buyer changing a password because they suspect somebody
  // holds the old one must not leave that somebody signed in on the device they hold; this device keeps its
  // session. A failure here is logged and not surfaced: the password did change, and the sentence must say so
  // — but it must not claim the devices are out when they are not.
  // FIRST, THIS DEVICE COMES BACK. updateUserById revoked every session of the user, this one included —
  // so «the other devices go out, this device keeps its session» below was a promise the code could not
  // keep: signOut({scope:"others"}) was being called on a session that no longer existed, and the buyer
  // was logged out of the phone in their hand. Re-establishing the session with the password just
  // written is what makes the sentence true (see establishPasswordSession). Remembered, because a buyer
  // on the security page is on a device they are already signed in on.
  const back = await establishPasswordSession(client.personId, next, true);
  if (!back) {
    return { ...SECURITY_INITIAL, done: "تبدّلت كلمة السرّ. ادخل بيها من جديد من صفحة الدخول." };
  }

  const supabase = await createClient();
  const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
  if (othersError) {
    console.warn(`[security] password changed but other sessions not revoked: ${othersError.message}`);
    return { ...SECURITY_INITIAL, done: "تبدّلت كلمة السرّ. من توّا ادخل بالجديدة. ما نجّمناش نخرّجو الأجهزة الأخرى توّا — اعمل هذا من الزرّ لوطا." };
  }

  return {
    ...SECURITY_INITIAL,
    done: "تبدّلت كلمة السرّ، وخرجنا من كل الأجهزة الأخرى. الجهاز هذا باقي داخل، ومن توّا ادخل بالجديدة.",
  };
}

// ---------------------------------------------------------------------------
// 2 · بدّل النمرة — one action, two steps, and the restart
// ---------------------------------------------------------------------------

/**
 * The ONE server action behind the change-phone form. The form's step and its button decide which act runs
 * — the way the door's form does it — so the form can pass this function itself to useActionState and still
 * post without JavaScript: a closure built on the client is not an action the browser can submit to.
 *
 *   phone_intent=restart   back to the number step, nothing sent;
 *   step phone             the new number, the current password, and a code to the new number;
 *   step code              the code from the new number, and the record changes.
 */
export async function changePhone(previous: PhoneChangeState, formData: FormData): Promise<PhoneChangeState> {
  if (formData.get("phone_intent") === "restart") return PHONE_CHANGE_INITIAL;
  return previous.step === "code" ? confirmPhoneChange(previous, formData) : requestPhoneChange(formData);
}

/**
 * Step one: a code goes to the NEW number — after the buyer has proved they are the account holder.
 *
 * WHY THE CURRENT PASSWORD, AND NOT JUST THE SESSION. A remembered device is a session that outlives the
 * person who left it: a phone lent for an hour, a tab on a shared computer. With the session alone as the
 * proof, whoever holds it could move the number to one of their own — and the reset flow, which sends its
 * code to «the number on file», would then hand them the password too: phone → attacker, then reset →
 * takeover, with the real owner locked out. The password is the one thing a borrowed session does not carry.
 * It is charged through client_password_attempt FIRST, then checked on the throwaway client, BEFORE
 * request_phone_change_code sends anything — so a wrong guess costs what a right one does and sends no SMS.
 *
 * THE SMS IS THE CHECK the spec asks for on a sensitive action: nobody keeps a number they cannot read a
 * code from. It is queued by request_phone_change_code and drained HERE, awaited, the way the login does it
 * — a code that sits in the outbox is a buyer staring at «الرمز وصل» for five minutes.
 *
 * WHAT IS NOT SAID: whether the new number already belongs to somebody. SQL answers ok and sends nothing in
 * that case, so this form cannot be used to ask who is a client. The confirm step, which needs a code that
 * only the holder of that phone can have, is where the collision is finally named.
 */
async function requestPhoneChange(formData: FormData): Promise<PhoneChangeState> {
  const client = await requireClient();
  const newPhone = normalisePhone(String(formData.get("new_phone") ?? ""));
  const password = String(formData.get("phone_current_password") ?? "");

  if (!/^\+[1-9][0-9]{6,14}$/.test(newPhone)) {
    return { ...PHONE_CHANGE_INITIAL, newPhone, error: "النمرة موش مكتوبة كيما يلزم. اكتبها بالشكل 98 124 111 ولا +216XXXXXXXX." };
  }
  if (!password) {
    return { ...PHONE_CHANGE_INITIAL, newPhone, error: "اكتب كلمة السرّ متاعك باش نبدّلو النمرة." };
  }

  const current = await phoneOf(client.personId);
  if (!current) return { ...PHONE_CHANGE_INITIAL, newPhone, error: GENERIC };
  if (current === newPhone) {
    return { ...PHONE_CHANGE_INITIAL, newPhone, error: "هذه هي نمرتك الحالية. اكتب النمرة الجديدة اللي تحبّ تبدّل ليها." };
  }

  // The proof, before anything is sent. ONE sentence for a wrong password.
  const proved = await provePassword(
    client.personId,
    current,
    password,
    "كلمة السرّ غالطة. عاود اكتبها، ولا اخرج واستعمل «نسيت كلمة السرّ».",
  );
  if (!proved.ok) return { ...PHONE_CHANGE_INITIAL, newPhone, error: proved.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "request_phone_change_code" as never,
    { p_person: client.personId, p_new_phone: newPhone } as never,
  );
  if (error) {
    return { ...PHONE_CHANGE_INITIAL, newPhone, error: isMissingFunction(error) ? NOT_APPLIED : GENERIC };
  }

  const out = (data ?? {}) as { ok?: boolean; reason?: string; ttl_seconds?: number };
  if (!out.ok) {
    return {
      ...PHONE_CHANGE_INITIAL,
      newPhone,
      error:
        out.reason === "invalid_phone"
          ? "النمرة موش مكتوبة كيما يلزم. اكتبها بالشكل +216XXXXXXXX."
          : GENERIC,
    };
  }

  // Drain the outbox now and wait for it: a blocked provider is a sentence, never silence. `blocked` is the
  // same state for every caller, so saying it leaks nothing about the number.
  const outcome = await dispatchNotifications(3);
  if (outcome.blocked) {
    console.warn(`[security] phone-change code queued but not sent: ${outcome.blocked}`);
    return {
      ...PHONE_CHANGE_INITIAL,
      newPhone,
      error: "ما نجّمناش نبعثو الرمز توّا — خدمة الرسائل موش مضبوطة. كلّم الفريق، ولا جرّب بعد شويّة.",
    };
  }

  return {
    step: "code",
    newPhone,
    error: null,
    done: null,
    note: "بعثنا رمز للنمرة الجديدة. إذا ما وصلكش، استنّى دقيقة وجرّب مرّة أخرى — وإذا طلبتو برشة مرّات، خلّيه يرتاح شويّة.",
    ttlSeconds: typeof out.ttl_seconds === "number" ? out.ttl_seconds : 300,
  };
}

/**
 * Step two: the code from the new phone, and the record changes.
 *
 * `phone_taken` IS said here, and it is the one deliberate exception to «never say whose number it is»:
 * the caller is authenticated, is changing their OWN record, and has just proved they hold the new phone
 * by reading a code from it — the cheapest way to learn whether a number is a client's would already be
 * to own that phone. The step is also behind the per-number cooldown and hourly ceiling, so it cannot be
 * walked. The SQL comment on confirm_phone_change makes the same argument.
 *
 * ONE SENTENCE FOR A CODE THAT DOES NOT OPEN — wrong, expired or none at all — and never «باقيلك N
 * محاولات»: SQL answers the three with one object (0108, verify_client_login_code's argument), and this
 * prints one sentence for it, so a probe cannot tell a live code from none.
 */
async function confirmPhoneChange(previous: PhoneChangeState, formData: FormData): Promise<PhoneChangeState> {
  const client = await requireClient();
  const newPhone = normalisePhone(String(formData.get("new_phone") ?? previous.newPhone));
  const code = toWesternDigits(String(formData.get("phone_code") ?? "")).replace(/\s/g, "").trim();

  if (!code) {
    return { ...previous, step: "code", newPhone, note: null, error: "اكتب الرمز اللي وصلك على النمرة الجديدة." };
  }

  const admin = createAdminClient();
  const { data, error: rpcError } = await admin.rpc(
    "confirm_phone_change" as never,
    { p_person: client.personId, p_code: code } as never,
  );
  if (rpcError) {
    return { ...previous, step: "code", newPhone, note: null, error: isMissingFunction(rpcError) ? NOT_APPLIED : GENERIC };
  }

  const out = (data ?? {}) as { ok?: boolean; reason?: string; phone_e164?: string };
  if (out.ok) {
    revalidatePath("/zitounti/security");
    revalidatePath("/zitounti");
    return {
      ...PHONE_CHANGE_INITIAL,
      done: `تبدّلت نمرتك. من توّا ادخل بـ ${out.phone_e164 ?? newPhone}.`,
    };
  }

  const sentences: Record<string, string> = {
    invalid_code: "الرمز غالط ولا فات وقتو. شوف الرسالة مرّة أخرى واكتبو كيما هو، ولا اطلب رمز جديد.",
    too_many_attempts: "جرّبت برشة مرّات والرمز تبطّل. اطلب رمز جديد.",
    phone_taken: "النمرة هذه مسجّلة عند حريف آخر. إذا هي نمرتك، كلّم الفريق باش يصلّحها.",
  };
  const message = sentences[out.reason ?? ""] ?? GENERIC;

  // A burnt code sends the form back to the number step; a code that did not open keeps it open, so the
  // buyer can retype or ask for a new one.
  const step = out.reason === "invalid_code" ? "code" : "phone";
  return { ...previous, step, newPhone, note: null, done: null, error: message };
}

// ---------------------------------------------------------------------------
// 3 · اخرج من الأجهزة الأخرى
// ---------------------------------------------------------------------------

/**
 * Every session of this user but THIS one is revoked; the phone in hand stays in.
 * There is no admin «sign out user X» — the scope on the buyer's own signOut is the API for it.
 *
 * Takes no arguments on purpose: useActionState hands it (state, formData) and needs neither, and a
 * zero-arg function is assignable to that shape.
 */
export async function signOutOtherDevices(): Promise<SecurityFormState> {
  await requireClient();

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ...SECURITY_INITIAL, error: GENERIC };

  return { ...SECURITY_INITIAL, done: "خرجت من كل الأجهزة الأخرى. الجهاز هذا باقي داخل." };
}
