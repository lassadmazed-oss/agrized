"use server";

import { revalidatePath } from "next/cache";

import { requestLoginCode, signInWithCode, signOutClient, type ClientLoginFailure } from "@/lib/client-auth";
import { dispatchNotifications } from "@/lib/sms";

import { LOGIN_INITIAL, type LoginState } from "./login-state";

/*
 * The two acts of the buyer's door, as Server Actions.
 *
 * EVERY SENTENCE HERE IS ARABIC AND SAYS WHAT TO DO NEXT, which is the house rule for errors. The failure
 * codes come from SQL (bb_77) and are deliberately narrow; the mapping from a code to a sentence is here
 * because it is user-facing copy, and the database has no business holding one side of a conversation.
 *
 * WHAT IS NOT SAID, ON PURPOSE: «هذه النمرة ما عندهاش حساب». The database answers identically for a number
 * that belongs to a client and one that belongs to nobody, so that this form cannot be used to ask whether
 * a given phone is an AgriZed buyer. The screen therefore says «إذا النمرة مسجّلة عندنا، الرمز وصل» — which
 * is true in both cases — and a client who really has no file rings the team, whose number is in the footer.
 */

const MESSAGES: Record<ClientLoginFailure, string> = {
  invalid_phone: "النمرة موش مكتوبة كيما يلزم. اكتبها بالشكل +216XXXXXXXX.",
  invalid_code: "الرمز غالط. شوف الرسالة مرّة أخرى واكتبو كيما هو.",
  expired: "الرمز فات وقتو. اطلب رمز جديد.",
  no_code: "ما فماش رمز في الانتظار لهذه النمرة. اطلب رمز جديد.",
  too_many_attempts: "جرّبت برشة مرّات والرمز تبطّل. اطلب رمز جديد.",
  not_applied: "خدمة الدخول مازالت ما تفعّلتش. لازم تتطبّق supabase/pending/bb_77_client_login.sql.",
  error: "تعذّر الدخول توّا. حاول مرّة أخرى، وإذا تعاود المشكل كلّم الفريق.",
};

/**
 * Tunisian numbers as people actually type them — 98 124 111, 20123456, +216 98 124 111 — normalised to the
 * one shape public.persons stores and its own CHECK enforces (`^\+[1-9][0-9]{6,14}$`).
 *
 * The eight-digit local form is the common case and is assumed Tunisian, because this is a Tunisian product
 * and the intake has never collected a foreign number. Anything already carrying a `+` is left alone: a
 * client who wrote their French number is not helped by having +216 forced onto the front of it.
 */
function normalisePhone(raw: string): string {
  // The non-breaking space is written as an ESCAPE, not pasted: it is invisible in a source file, and a
  // character class that depends on nobody deleting a character they cannot see is a trap for the next
  // reader. Numbers arrive carrying them from copy-paste out of WhatsApp and contact cards.
  const trimmed = raw.replace(/[\s\u00a0.-]/g, "").trim();
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  if (/^216[0-9]{8}$/.test(trimmed)) return `+${trimmed}`;
  if (/^[0-9]{8}$/.test(trimmed)) return `+216${trimmed}`;
  return trimmed;
}

export async function requestCode(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const result = await requestLoginCode(phone);

  if (!result.ok) {
    return { ...LOGIN_INITIAL, phone, error: MESSAGES[result.reason] };
  }

  /*
   * SEND IT NOW, AND AWAIT IT. Two decisions, both learned the hard way on 2026-09-25 («sms did not get it»).
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
  const outcome = await dispatchNotifications(3);
  if (outcome.blocked) {
    console.warn(`[login] code queued but not sent: ${outcome.blocked}`);
    return {
      ...LOGIN_INITIAL,
      phone,
      error: "ما نجّمناش نبعثو الرمز توّا — خدمة الرسائل موش مضبوطة. كلّم الفريق، ولا جرّب بعد شويّة.",
    };
  }

  // Straight to the code step whatever the truth is — see the note at the top of this file.
  return {
    step: "code",
    phone,
    error: null,
    note: "إذا النمرة مسجّلة عندنا، الرمز وصل بالSMS.",
    ttlSeconds: result.ttlSeconds,
  };
}

export async function submitCode(previous: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normalisePhone(String(formData.get("phone") ?? previous.phone));
  const code = String(formData.get("code") ?? "").replace(/\s/g, "").trim();

  const result = await signInWithCode(phone, code);
  if (result.ok) {
    // The page reads the session on the server, so it has to be re-rendered rather than trusted to refetch.
    revalidatePath("/zitounti");
    return { ...previous, phone, error: null, note: null };
  }

  const left = result.attemptsLeft;
  return {
    ...previous,
    step: "code",
    phone,
    note: null,
    error:
      result.reason === "invalid_code" && typeof left === "number" && left > 0
        ? `${MESSAGES.invalid_code} باقيلك ${left} ${left === 1 ? "محاولة" : "محاولات"}.`
        : MESSAGES[result.reason],
  };
}

export async function signOut(): Promise<void> {
  await signOutClient();
  revalidatePath("/zitounti");
}
