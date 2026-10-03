"use server";

import { headers } from "next/headers";

import { normalisePhone } from "@/lib/client-phone";
import { getPublicConfig, t, type PublicConfig } from "@/lib/config";
import { toWesternDigits } from "@/lib/digits";
import { displayHeaders } from "@/lib/i18n/server";
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
 * EVERY SENTENCE SAYS WHAT TO DO NEXT, which is the house rule for errors. The reason codes come from SQL and
 * are deliberately narrow; the words are the owner's, in settings (ui.track.error_*), in the visitor's language
 * (0109) — read through the public configuration like every other text on the page.
 */

/** Where a lookup can go wrong: SQL's two answers, and the three this file can reach on its own. */
type TrackFailure = "not_found" | "too_many" | "missing_fields" | "not_applied" | "error";

function message(config: PublicConfig, reason: TrackFailure): string {
  switch (reason) {
    // ONE SENTENCE FOR THREE CASES — see the note above. It names both halves precisely because it must not
    // point at either one: the reader is told to check the pair, which is the only honest instruction available.
    case "not_found":
      return t(config, "ui.track.error_not_found");
    case "too_many":
      return t(config, "ui.track.error_too_many");
    case "missing_fields":
      return t(config, "ui.track.error_missing_fields");
    // A VISITOR IS NOT SHOWN A MIGRATION NAME. This used to read «لازم تتطبّق الهجرة اللي فيها
    // public.track_request» — an instruction to a developer, printed on a public page to a stranger who can do
    // nothing with it and should not be told the shape of the database. The operator sentence goes to the
    // server log, where the person who can act on it actually looks.
    case "not_applied":
      return t(config, "ui.track.error_not_applied");
    default:
      return t(config, "ui.track.error_unavailable");
  }
}

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

/*
 * THE PHONE goes through src/lib/client-phone.ts — the one normaliser the sign-in and the client's own file
 * use — and not through a copy kept here. That copy used to run libphonenumber first and fall back to the raw
 * shape when the library refused, on the theory that landing on the exact stored string mattered. It does not:
 * public.track_request compares DIGITS by suffix, with an eight-digit floor on both sides (0103 §4), so any
 * spelling of the right number matches and no spelling of a wrong one does. What this side owes SQL is only a
 * clean string — Western digits, no spaces, 00 read as + — and a shape the shared function does not recognise
 * is passed through unchanged and answered `not_found`, never a sentence about the number itself, which would
 * say more than this page is allowed to.
 */

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

function failed(config: PublicConfig, state: { requestNo: string; phone: string }, reason: TrackFailure): TrackState {
  return { ...TRACK_INITIAL, ...state, error: message(config, reason) };
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
  // In the language of the page the form was posted from: the proxy's header answers here (src/lib/i18n/server.ts).
  const config = await getPublicConfig();

  if (!requestNo || !phone) return failed(config, echo, "missing_fields");

  const requestHeaders = await headers();

  // hashIp throws when IP_HASH_SALT is unset. A missing salt must not take the whole page down over a burst
  // guard that is explicitly not an access control — the lookup goes on, and SQL's own ceiling still applies.
  let burstKey: string | null = null;
  try {
    burstKey = hashIp(clientIp(requestHeaders));
  } catch (error) {
    console.warn("[track] burst guard disabled:", error instanceof Error ? error.message : error);
  }
  if (overBurstLimit(burstKey)) return failed(config, echo, "too_many");

  // The audit headers, so app.write_audit records this read the way it records every other public call. They
  // are informational and never used for access control (src/lib/request-context.ts).
  //
  // AND THE DISPLAY LANGUAGE, because this is a display read: the stage names and the «unknown» word come back
  // from app.setting_text (journey.stage_*, journey.unknown_label), and only this header makes it answer in the
  // visitor's language instead of Arabic (0109 rule 5). It changes no lookup, no counter and no answer code.
  const admin = createAdminClient({ ...auditHeaders(requestHeaders), ...displayHeaders(config.locale) });

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
    return failed(config, echo, isMissingFunction(error) ? "not_applied" : "error");
  }

  const out = (data ?? {}) as { ok?: boolean; reason?: string } & Partial<TrackFound>;

  if (!out.ok) {
    // Only the two reasons SQL is contracted to send are translated. Anything else is a version of that
    // function this build has not met, and it is answered as an error rather than as «no such demand» —
    // telling somebody their number is wrong when the truth is that the server changed is the one failure
    // sentence that sends them looking in the wrong place.
    const reason: TrackFailure = out.reason === "too_many" ? "too_many" : out.reason === "not_found" ? "not_found" : "error";
    if (reason === "error") console.error("track_request answered an unknown reason", out.reason);
    return failed(config, echo, reason);
  }

  // A payload that says ok but carries no stage cannot be drawn, and half a path is worse than an error.
  if (!out.request_no || !out.stage || !Array.isArray(out.spine)) {
    console.error("track_request answered ok with an incomplete payload", out);
    return failed(config, echo, "error");
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
      // SQL always sends it; the owner's same word, read on this side, covers a payload that somehow did not.
      unknown: typeof out.unknown === "string" ? out.unknown : t(config, "journey.unknown_label"),
    },
  };
}
