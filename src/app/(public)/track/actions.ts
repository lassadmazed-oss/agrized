"use server";

import { headers } from "next/headers";

import { toWesternDigits } from "@/lib/digits";
import { normalizePhone } from "@/lib/phone";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

import { TRACK_INITIAL, type TrackFound, type TrackState } from "./track-result";

/*
 * «وين وصل مطلبي؟» — the one act of this page, as a Server Action.
 *
 * WHY THE SERVICE ROLE. public.track_request is revoked from public, anon AND authenticated: it is not a
 * policy-protected table read, it is a lookup by a secret somebody was handed, and the only thing standing
 * between a stranger and a stage is that they must present the right code AND the right phone together. A
 * function anon could call would be a function anon could call in a loop, so it is reachable only through
 * this file, with the service-role key, which is where a caller can be counted. Exactly the shape
 * src/lib/client-auth.ts uses for the login codes, and for the same reason.
 *
 * WHAT IS NEVER SAID, ON PURPOSE. There is one sentence for «no such demand», one for «that is not the phone
 * on it», and one for «those two do not belong together» — and it is the SAME sentence, because three
 * sentences would turn this form into two oracles. Type a code and a wrong phone and you would learn the code
 * is real; type a real phone and a wrong code and you would learn the phone belongs to a client. Neither is
 * anybody's business, and public.track_request answers `not_found` to all three so that this file cannot tell
 * them apart even if it wanted to.
 *
 * EVERY SENTENCE HERE IS ARABIC AND SAYS WHAT TO DO NEXT, which is the house rule for errors. The reason codes
 * come from SQL and are deliberately narrow; the words are here, because the database has no business holding
 * one side of a conversation.
 */

/** Where a lookup can go wrong: SQL's two answers, and the three this file can reach on its own. */
type TrackFailure = "not_found" | "too_many" | "missing_fields" | "not_applied" | "error";

const MESSAGES: Record<TrackFailure, string> = {
  // ONE SENTENCE FOR THREE CASES — see the note above. It names both halves precisely because it must not
  // point at either one: the reader is told to check the pair, which is the only honest instruction available.
  not_found:
    "ما لقيناش مطلب بالرقم والنمرة هاذيّة. راجع رقم المطلب كيما وصلك في الرسالة (AGZ-…) والنمرة اللي سجّلت بيها، وجرّب مرّة أخرى.",
  too_many: "طلبت التتبّع برشة مرّات في وقت قصير. استنّى ساعة وجرّب مرّة أخرى، ولا كلّم الفريق.",
  missing_fields: "لازم تكتب رقم المطلب ونمرة التلفون الزوز. الزوز مع بعضهم هوما اللي يثبّتو أنّ المطلب متاعك.",
  // A VISITOR IS NOT SHOWN A MIGRATION NAME. This used to read «لازم تتطبّق الهجرة اللي فيها
  // public.track_request» — an instruction to a developer, printed on a public page to a stranger who can do
  // nothing with it and should not be told the shape of the database. The operator sentence goes to the
  // server log, where the person who can act on it actually looks.
  not_applied: "خدمة تتبّع المطالب موش متوفّرة توّا. كلّم الفريق ويعطيوك وين وصل مطلبك.",
  error: "تعذّر التتبّع توّا. حدّث الصفحة وجرّب مرّة أخرى، وإذا تعاود المشكل كلّم الفريق.",
};

/**
 * AGZ-2026-000045 as people actually paste it: with spaces, in lower case, or with the Arabic-Indic digits a
 * phone keyboard produces. The database trims and upper-cases as well — this is not a substitute for that, it
 * is so a visitor who typed «agz 2026 000045» gets their stage instead of a sentence telling them to look
 * again at a number that was right.
 *
 * Nothing is REJECTED here. A shape this function does not recognise is passed through unchanged and answered
 * `not_found` by SQL, which is the one answer that leaks nothing; deciding «that cannot be a request number»
 * in TypeScript would be a second rule to keep in step with the intake's own format.
 */
function normaliseRequestNo(raw: string): string {
  return toWesternDigits(raw).replace(/[\s ]/g, "").trim().toUpperCase();
}

/**
 * The phone, normalised to the one shape public.interest_requests and public.persons store.
 *
 * TWO PASSES, IN THIS ORDER, AND THE ORDER IS THE POINT.
 *
 * FIRST src/lib/phone.ts — the shared normaliser, and not a second one written here. It is the very function
 * that PRODUCED the value this lookup is compared against: register/actions.ts runs a visitor's number
 * through it before submit_interest_request stores it, so running the same input through it again is the only
 * way to be sure of landing on the same string. (zitounti/actions.ts keeps a small local copy of these rules
 * — 00 → +, a bare eight digits read as Tunisian — because a `"use server"` file may not export a helper for
 * anyone to share. The rules are the same; the library is the original.)
 *
 * THEN the raw shape, when the library refuses. `persons.phone_e164` is only ever CHECKed against
 * `^\+[1-9][0-9]{6,14}$`, and a row created by hand in the Back Office may carry a number libphonenumber does
 * not consider valid. Refusing it here would lock a real client out of their own file over a parser's opinion,
 * so the cleaned form is sent on and SQL decides. The failure mode is `not_found` either way — never a
 * sentence about the number itself, which would say more than this page is allowed to.
 */
function normalisePhone(raw: string): string {
  // The non-breaking space is written as an ESCAPE and not pasted: it is invisible in a source file, and a
  // character class that depends on nobody deleting a character they cannot see is a trap for the next
  // reader. Numbers arrive carrying them from copy-paste out of WhatsApp and contact cards.
  const cleaned = toWesternDigits(raw).replace(/[\s .\-()]/g, "").replace(/^00/, "+").trim();
  if (!cleaned) return "";

  const parsed = normalizePhone(cleaned, true);
  if (parsed.ok) return parsed.e164;

  if (cleaned.startsWith("+")) return cleaned;
  if (/^216[0-9]{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^[0-9]{8}$/.test(cleaned)) return `+216${cleaned}`;
  return cleaned;
}

/*
 * THE BURST GUARD, and an honest account of what it is and is not.
 *
 * The real ceiling is in SQL, per request number, from the setting `track.max_lookups_per_hour`: it is durable,
 * it is the owner's to raise, and it cannot be skipped by any caller. This is the other half — a per-caller
 * burst guard — and it exists because SQL's counter is keyed on the request number, so somebody walking a
 * thousand DIFFERENT numbers never touches it. Counting the caller is the only way to notice that.
 *
 * IT IS IN MEMORY, WHICH MEANS IT IS PER INSTANCE, and that is stated rather than hidden: a serverless
 * deployment runs several, so a determined caller gets this many attempts per warm instance rather than this
 * many in total. It is a speed bump on a lookup whose real protection is that the pair must already match, not
 * an access control. Nothing on this page is protected BY it.
 *
 * THE KEY IS A SALTED HASH, never an address: src/lib/request-context.ts holds that rule and this obeys it.
 * The window is a technical constant and not a setting — a setting here would have to be readable from the
 * public configuration, which is exactly the place a rate limit should not be published.
 */
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = 12;
const bursts = new Map<string, number[]>();

function overBurstLimit(key: string | null): boolean {
  if (!key) return false;
  const now = Date.now();
  const recent = (bursts.get(key) ?? []).filter((at) => now - at < BURST_WINDOW_MS);
  recent.push(now);
  bursts.set(key, recent);

  // The map would otherwise grow for the lifetime of the instance. Swept opportunistically — on the same call
  // that added an entry — so there is no timer to own and nothing to clean up on shutdown.
  if (bursts.size > 5_000) {
    for (const [otherKey, hits] of bursts) {
      if (hits.every((at) => now - at >= BURST_WINDOW_MS)) bursts.delete(otherKey);
    }
  }

  return recent.length > BURST_MAX;
}

/** PostgREST reports a missing function as PGRST202; until the migration is applied that is «not built», not a fault. */
function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

function failed(state: { requestNo: string; phone: string }, reason: TrackFailure): TrackState {
  return { ...TRACK_INITIAL, ...state, error: MESSAGES[reason] };
}

/**
 * Look the demand up and answer where it stands.
 *
 * BOTH HALVES ARE REQUIRED and the form says why: the request number alone travels — it is in a text message,
 * in a screenshot, on a piece of paper — so it is not a secret by itself. The phone is what makes the pair
 * proof that the demand is yours. Neither is checked for «existence» separately anywhere in this path.
 */
export async function lookupRequest(_previous: TrackState, formData: FormData): Promise<TrackState> {
  const requestNo = normaliseRequestNo(String(formData.get("requestNo") ?? ""));
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const echo = { requestNo, phone };

  if (!requestNo || !phone) return failed(echo, "missing_fields");

  const requestHeaders = await headers();

  // hashIp throws when IP_HASH_SALT is unset. A missing salt must not take the whole page down over a burst
  // guard that is explicitly not an access control — the lookup goes on, and SQL's own ceiling still applies.
  let burstKey: string | null = null;
  try {
    burstKey = hashIp(clientIp(requestHeaders));
  } catch (error) {
    console.warn("[track] burst guard disabled:", error instanceof Error ? error.message : error);
  }
  if (overBurstLimit(burstKey)) return failed(echo, "too_many");

  // The audit headers, so app.write_audit records this read the way it records every other public call. They
  // are informational and never used for access control (src/lib/request-context.ts).
  const admin = createAdminClient(auditHeaders(requestHeaders));

  // The casts are gone: 0103 is applied and `npm run db:types` has seen public.track_request, so the call is
  // checked against the generated Database type. That is worth more than tidiness — a cast here would erase
  // the check on BOTH the function name and the two parameter names, and a renamed argument would ship green
  // and fail only when a visitor pressed the button.
  const { data, error } = await admin.rpc("track_request", {
    p_request_no: requestNo,
    p_phone: phone,
  });

  if (error) {
    if (!isMissingFunction(error)) console.error("track_request failed", error);
    return failed(echo, isMissingFunction(error) ? "not_applied" : "error");
  }

  const out = (data ?? {}) as { ok?: boolean; reason?: string } & Partial<TrackFound>;

  if (!out.ok) {
    // Only the two reasons SQL is contracted to send are translated. Anything else is a version of that
    // function this build has not met, and it is answered as an error rather than as «no such demand» —
    // telling somebody their number is wrong when the truth is that the server changed is the one failure
    // sentence that sends them looking in the wrong place.
    const reason: TrackFailure = out.reason === "too_many" ? "too_many" : out.reason === "not_found" ? "not_found" : "error";
    if (reason === "error") console.error("track_request answered an unknown reason", out.reason);
    return failed(echo, reason);
  }

  // A payload that says ok but carries no stage cannot be drawn, and half a path is worse than an error.
  if (!out.request_no || !out.stage || !Array.isArray(out.spine)) {
    console.error("track_request answered ok with an incomplete payload", out);
    return failed(echo, "error");
  }

  return {
    requestNo,
    phone,
    error: null,
    found: {
      request_no: out.request_no,
      created_at: out.created_at ?? null,
      offer_name: out.offer_name ?? null,
      offer_code: out.offer_code ?? null,
      trees: typeof out.trees === "number" ? out.trees : null,
      stage: out.stage,
      spine: out.spine,
      unknown: typeof out.unknown === "string" ? out.unknown : "غير معروف",
    },
  };
}
