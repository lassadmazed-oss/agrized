"use server";

import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { headers } from "next/headers";
import { z } from "zod";

import { getPublicConfig, t } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { withReferral } from "@/lib/referral";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

import type { VideoVisitState, VideoVisitValues } from "./video-visit-state";

const schema = z.object({
  fullName: z.string().trim().min(3).max(120),
  whatsapp: z.string().trim().min(6).max(30),
  offer: z.string().trim().max(31),
  slot: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timeZone: z.string().trim().max(64),
  note: z.string().trim().max(500),
  consent: z.literal("on"),
  website: z.string().max(200), // honeypot: real visitors never fill it
  source: z.string().max(4000),
});

/** The database's refusal → the owner's sentence for it, and the field it is about. */
const REFUSALS: Record<string, { key: string; field?: "name" | "whatsapp" | "slot" | "consent" }> = {
  invalid_full_name: { key: "ui.abroad.error_name", field: "name" },
  invalid_whatsapp: { key: "ui.abroad.error_whatsapp", field: "whatsapp" },
  invalid_video_slot: { key: "ui.abroad.error_slot", field: "slot" },
  video_slot_taken: { key: "ui.abroad.error_slot", field: "slot" },
  consent_required: { key: "ui.abroad.error_consent", field: "consent" },
  rate_limited: { key: "ui.abroad.error_limit" },
  abroad_closed: { key: "ui.abroad.error_closed" },
};

/**
 * «احجز الزيارة بالفيديو» (0130). The number may be from any country — that is the point of this form — and
 * it is WhatsApp the team writes on, so nothing is queued for SMS. The database re-checks the time against the
 * owner's hours and the full ones, finds or creates the person by the number and marks them as living abroad.
 */
export async function requestVideoVisit(_previous: VideoVisitState, formData: FormData): Promise<VideoVisitState> {
  const config = await getPublicConfig();
  const field = (name: string) => String(formData.get(name) ?? "");
  const values: VideoVisitValues = {
    fullName: field("full_name").slice(0, 120),
    whatsapp: field("whatsapp").slice(0, 30),
    offer: field("offer").slice(0, 31),
    note: field("note").slice(0, 500),
    consent: field("consent") === "on",
  };
  const refuse = (code: string): VideoVisitState => {
    const known = REFUSALS[code];
    if (known) return { status: "error", message: t(config, known.key), field: known.field, values };
    // The offer's own refusal has a public sentence already (ui.errors.offer_not_available).
    if (code === "offer_not_available") return { status: "error", message: intakeErrorMessage(config, code), values };
    return { status: "error", message: t(config, "ui.abroad.error_generic"), values };
  };

  const parsed = schema.safeParse({
    fullName: field("full_name"),
    whatsapp: field("whatsapp"),
    offer: field("offer"),
    slot: field("slot"),
    timeZone: field("time_zone"),
    note: field("note"),
    consent: field("consent"),
    website: field("website"),
    source: field("source"),
  });
  if (!parsed.success) {
    const wrong = parsed.error.issues[0]?.path[0];
    if (wrong === "fullName") return refuse("invalid_full_name");
    if (wrong === "whatsapp") return refuse("invalid_whatsapp");
    if (wrong === "slot") return refuse("invalid_video_slot");
    if (wrong === "consent") return refuse("consent_required");
    return refuse("unknown");
  }
  const data = parsed.data;
  if (data.website) return refuse("unknown");

  // International always: «+33 6 12 34 56 78», «0033…» and a Tunisian number are all fine here.
  const phone = normalizePhone(data.whatsapp, true);
  if (!phone.ok) return refuse("invalid_whatsapp");

  let source: Record<string, string> = {};
  try {
    const raw = JSON.parse(data.source || "{}") as unknown;
    if (raw && typeof raw === "object") source = raw as Record<string, string>;
  } catch {
    source = {};
  }

  const requestHeaders = await headers();
  const ipHash = hashIp(clientIp(requestHeaders));
  // An intake call: auditHeaders carries the page's language, which the database records on the person and on
  // the request — the team writes to them in it.
  const supabase = createAdminClient(auditHeaders(requestHeaders));
  const { data: result, error } = await supabase.rpc("submit_video_visit", {
    p: {
      full_name: data.fullName,
      whatsapp_e164: phone.e164,
      country_code: parsePhoneNumberFromString(phone.e164)?.country ?? null,
      // Absent or odd, the database refuses it by name; the browser always knows its own zone.
      time_zone: data.timeZone || "Africa/Tunis",
      project_code: data.offer,
      slot: data.slot,
      note: data.note,
      // The sentence the visitor ticked, in the language they read it in.
      consent_text: t(config, "legal.consent_text"),
      ip_hash: ipHash,
      // 0136: the code of the referral link that brought this visitor, if any.
      source: await withReferral(config, source, ipHash),
    },
  });

  if (error) {
    if (!REFUSALS[error.message] && !isKnownIntakeError(error.message)) {
      console.error("submit_video_visit failed", error);
    }
    return refuse(error.message);
  }
  const answer = result as { request_no?: string; preferred_at?: string } | null;
  if (!answer?.request_no || !answer.preferred_at) {
    console.error("submit_video_visit returned no request number", result);
    return refuse("unknown");
  }
  return { status: "done", requestNo: answer.request_no, at: answer.preferred_at };
}
