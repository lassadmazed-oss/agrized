"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getPublicConfig, settingBool, settingText } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { moduleAccess } from "@/lib/modules";
import { normalizePhone } from "@/lib/phone";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The offer form (owner, 2026-09-18: «in the offers it's a separate form»). It asks for one offer and how many
 * of its trees, plus the identity questions the calculator form asks; it never carries a calculator answer, and
 * the calculator form never carries an offer. Both end in public.interest_requests, told apart by request_kind.
 */
const offerSchema = z.object({
  projectId: z.uuid(),
  // 1..tree_count, checked again by the database against the offer itself (invalid_offer_trees).
  trees: z.number().int().positive(),
  fullName: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(6).max(30),
  whatsappSame: z.boolean(),
  whatsapp: z.string().trim().max(30),
  email: z.string().trim().max(200),
  governorateId: z.number().int().positive(),
  contactChannel: z.enum(["phone", "whatsapp", "both"]),
  contactTimeOptionId: z.uuid().nullable(),
  consent: z.literal(true),
  website: z.string().max(200), // honeypot: real visitors never fill it
  source: z.record(z.string(), z.string().max(300)),
});

export type OfferInterestInput = z.input<typeof offerSchema>;

export type SubmitOfferResult = { ok: true; requestNo: string } | { ok: false; message: string };

export async function submitOfferInterest(input: OfferInterestInput): Promise<SubmitOfferResult> {
  const config = await getPublicConfig();
  // FLAG-02: while the offers module is closed the form refuses, exactly like the page that carries it.
  // Staff previewing an internal module may still send one, so the owner can try the flow before opening it.
  if ((await moduleAccess(config, "projects")) === "closed") {
    return { ok: false, message: intakeErrorMessage("offer_not_available") };
  }

  const parsed = offerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "بعض المعلومات ناقصة أو غير صحيحة. راجع المعطيات وحاول مجدداً." };
  }
  const data = parsed.data;
  if (data.website) {
    return { ok: false, message: intakeErrorMessage(null) };
  }

  const phone = normalizePhone(data.phone, settingBool(config, "lead.allow_international_phone"));
  if (!phone.ok) {
    return { ok: false, message: intakeErrorMessage(phone.reason === "not_tunisian" ? "phone_not_tunisian" : "invalid_phone") };
  }

  let whatsapp = phone.e164;
  if (!data.whatsappSame) {
    const parsedWhatsapp = normalizePhone(data.whatsapp, true);
    if (!parsedWhatsapp.ok) {
      return { ok: false, message: intakeErrorMessage("invalid_whatsapp") };
    }
    whatsapp = parsedWhatsapp.e164;
  }

  const requestHeaders = await headers();
  const supabase = createAdminClient(auditHeaders(requestHeaders));

  const { data: result, error } = await supabase.rpc("submit_offer_request", {
    p: {
      project_id: data.projectId,
      trees: String(data.trees),
      full_name: data.fullName,
      phone_e164: phone.e164,
      whatsapp_e164: whatsapp,
      email: data.email,
      residence_governorate_id: data.governorateId,
      contact_channel: data.contactChannel,
      contact_time_option_id: data.contactTimeOptionId,
      consent_text: settingText(config, "legal.consent_text", "موافقة على التواصل ومعالجة المعطيات"),
      ip_hash: hashIp(clientIp(requestHeaders)),
      source: data.source,
    },
  });

  if (error) {
    if (!isKnownIntakeError(error.message)) {
      console.error("submit_offer_request failed", error);
    }
    return { ok: false, message: intakeErrorMessage(error.message) };
  }

  const requestNo = (result as { request_no?: string } | null)?.request_no;
  if (!requestNo) {
    console.error("submit_offer_request returned no request number", result);
    return { ok: false, message: intakeErrorMessage(null) };
  }
  return { ok: true, requestNo };
}
