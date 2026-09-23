import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Drains public.notification_outbox (spec LEAD-11..12, D-05).
 *
 * The queue has existed since 0003 and the enqueue trigger has been filling it; 0073 added the three calls
 * used here. Nothing about the message is decided in this file: the sender name, the provider and the switch
 * are business values read from `settings`, and the body was rendered from a template when the row was
 * enqueued.
 *
 * Credentials are the one thing that belongs in the environment, not the database:
 *   WINSMS_API_KEY   — required; the key from the WinSMS account
 *   WINSMS_API_URL   — optional; defaults to the account's documented endpoint
 *
 * Without the key nothing is claimed, so no row is ever marked as attempted on a run that could not send.
 */

export type DispatchOutcome = {
  claimed: number;
  sent: number;
  failed: number;
  /** Why the run sent nothing at all, when that is the case. Arabic: it is shown in the Back Office. */
  blocked?: string;
  /**
   * Credits left on the provider account after the last message of the run, when it reported one.
   * The account raises its own alert at 500, and a run that can see the figure should pass it on.
   */
  balance?: number | null;
};

type SmsConfig = {
  senderId: string;
  provider: string;
};

const DEFAULT_WINSMS_URL = "https://www.winsmspro.com/sms/sms/api";

/** The sender name and the provider are business values: they live in `settings`, never in this file. */
async function readSmsConfig(supabase: ReturnType<typeof createAdminClient>): Promise<SmsConfig | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["sms.sender_id", "sms.provider"]);

  if (error || !data) return null;

  const byKey = new Map(data.map((row) => [row.key, row.value]));
  const senderId = typeof byKey.get("sms.sender_id") === "string" ? (byKey.get("sms.sender_id") as string) : "";
  const provider = typeof byKey.get("sms.provider") === "string" ? (byKey.get("sms.provider") as string) : "";
  if (!senderId || !provider) return null;
  return { senderId, provider };
}

type SendResult =
  | { ok: true; providerMessageId: string | null; balance: number | null }
  | { ok: false; error: string };

/**
 * WinSMS takes the request as query parameters and answers with JSON.
 *
 * Confirmed against the live account on 2026-09-22 (two messages, sender AGRIZED). A success is:
 *
 *   {"code":"ok","message":"Successfully Send","balance":554,"user":"…","licence":"…","reference":"4984439"}
 *
 * `reference` is the provider's own id for the message and is what goes in `provider_message_id`.
 * `balance` is the credits left on the account, carried back so a run can warn before the account runs dry.
 *
 * THE QUERY STRING IS BUILT BY HAND, not with URLSearchParams. The api_key is base64 and ends in «=»,
 * which URLSearchParams escapes to %3D; the documented call passes it raw, and raw is what was verified to
 * work. Everything else is percent-encoded, which the Arabic body needs.
 *
 * An answer this function does not recognise is never treated as a success: the raw body is written to
 * `last_error` and the message goes back in the queue, so a change at the provider surfaces as a reported
 * failure instead of a silently dropped message.
 */
async function sendViaWinSms(
  apiKey: string,
  senderId: string,
  toE164: string,
  body: string,
  signal: AbortSignal,
): Promise<SendResult> {
  const base = process.env.WINSMS_API_URL ?? DEFAULT_WINSMS_URL;
  const query = [
    "action=send-sms",
    `api_key=${apiKey}`,
    `to=${encodeURIComponent(toE164.replace(/^\+/, ""))}`,
    `from=${encodeURIComponent(senderId)}`,
    `sms=${encodeURIComponent(body)}`,
  ].join("&");
  const url = `${base}?${query}`;

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", signal, cache: "no-store" });
  } catch (cause) {
    return { ok: false, error: `تعذّر الاتصال بالمزوّد: ${cause instanceof Error ? cause.message : String(cause)}` };
  }

  const text = (await response.text()).trim();

  if (!response.ok) {
    return { ok: false, error: `المزوّد ردّ بالحالة ${response.status}: ${text.slice(0, 300)}` };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: `ردّ المزوّد ما تقراش كـJSON: ${text.slice(0, 300)}` };
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
    if (code === "ok") {
      const reference = record.reference;
      const balance = typeof record.balance === "number" ? record.balance : null;

      /*
       * «ok» WITH NO REFERENCE IS NOT A SEND (probed against the live account, 2026-09-22).
       *
       * WinSMS answers `{"code":"ok","message":"Successfully Send","reference":null}` for a well-formed
       * number it will not route — 21600000000 returns exactly that, and the balance is still charged. A
       * number it accepts comes back with a reference («4985181»). So the reference, not the code, is the
       * signal that a message was taken for delivery.
       *
       * Treating the first case as a success would mark the row `sent`, and the message would be recorded
       * as delivered when the provider had quietly dropped it. It goes back in the queue as a failure with
       * the reason written down.
       */
      if (reference === null || reference === undefined || reference === "") {
        return {
          ok: false,
          error: "المزوّد قبل الرسالة بلا مرجع، يعني ما وجّهها لحتّى وجهة. تثبّت من الرقم ومن اسم المرسل عند المزوّد.",
        };
      }

      return {
        ok: true,
        providerMessageId: String(reference),
        balance,
      };
    }
    const message = typeof record.message === "string" ? record.message : text.slice(0, 300);
    return { ok: false, error: `المزوّد رفض الرسالة: ${message}` };
  }

  return { ok: false, error: `ردّ المزوّد غير متوقّع: ${text.slice(0, 300)}` };
}

/**
 * Claims a batch and sends it. Safe to run twice at once: a claimed row is handed to one run only.
 * `limit` overrides the batch size in settings; leave it out to use the configured one.
 */
export async function dispatchNotifications(limit?: number): Promise<DispatchOutcome> {
  const apiKey = process.env.WINSMS_API_KEY;
  if (!apiKey) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      blocked: "مفتاح المزوّد ناقص. زيد WINSMS_API_KEY في ملف البيئة قبل ما تشعّل الإرسال.",
    };
  }

  const supabase = createAdminClient();

  const config = await readSmsConfig(supabase);
  if (!config) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      blocked: "إعدادات الرسائل ناقصة. تثبّت من sms.sender_id وsms.provider في الإعدادات.",
    };
  }

  // A previous run that died leaves rows in flight; they go back in the queue before this one claims.
  await supabase.rpc("release_stuck_notifications");

  const { data: claimed, error: claimError } = await supabase.rpc("claim_notifications", {
    p_limit: limit ?? undefined,
  });

  if (claimError) {
    return { claimed: 0, sent: 0, failed: 0, blocked: `تعذّر قراءة الصف: ${claimError.message}` };
  }

  const batch = claimed ?? [];
  if (batch.length === 0) {
    return { claimed: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  let balance: number | null = null;

  for (const message of batch) {
    // One message must not hang the whole run.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let result: SendResult;
    try {
      if (config.provider === "winsms") {
        result = await sendViaWinSms(apiKey, config.senderId, message.to_phone_e164, message.body, controller.signal);
      } else {
        result = { ok: false, error: `مزوّد غير معروف: ${config.provider}` };
      }
    } finally {
      clearTimeout(timer);
    }

    if (result.ok) {
      await supabase.rpc("mark_notification_sent", {
        p_id: message.id,
        p_provider: config.provider,
        p_provider_message_id: result.providerMessageId ?? undefined,
      });
      if (result.balance !== null) balance = result.balance;
      sent += 1;
    } else {
      await supabase.rpc("mark_notification_failed", {
        p_id: message.id,
        p_error: result.error,
        p_provider: config.provider,
      });
      failed += 1;
    }
  }

  return { claimed: batch.length, sent, failed, balance };
}
