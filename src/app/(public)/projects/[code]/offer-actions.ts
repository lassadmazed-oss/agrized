"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getPublicConfig, settingBool, settingText } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { moduleAccess } from "@/lib/modules";
import { normalizePhone } from "@/lib/phone";
import { toProjectQuote, type ProjectQuote } from "@/lib/public-projects";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_MODES } from "@/lib/tree-pricing";

/**
 * The plan the visitor answers on the offer's own form: cash, or a down payment percentage over a duration —
 * both of them THIS offer's own options (owner, 2026-09-19: «each offer has its own stuff»). The ids are
 * checked against the offer in Postgres, never here: `public_project_quote` answers `invalid_choice` for a
 * percentage the offer does not allow, and the intake refuses it outright.
 */
const planSchema = {
  paymentMode: z.enum(PAYMENT_MODES).nullable(),
  downPercentOptionId: z.uuid().nullable(),
  durationOptionId: z.uuid().nullable(),
};

const quoteSchema = z.object({
  projectId: z.uuid(),
  // Postgres integer range only; the RPC applies the offer's own bounds and answers trees = null outside them.
  trees: z.number().int().min(1).max(2_147_483_647).nullable(),
  ...planSchema,
});

export type QuoteOfferInput = z.input<typeof quoteSchema>;

/**
 * This offer's figures for the answers so far — the cash total, and, once the visitor picked a percentage and a
 * duration, the down payment, the financed total and the monthly instalment. Every one of them is computed by
 * `public.public_project_quote`; nothing on the form multiplies, adds a markup or rounds anything (report v3 §12,
 * app.financed_quote). Null when the quote cannot be read, and the form then keeps the figures it already has.
 *
 * It calls the RPC on the REQUEST-SCOPED client on purpose, not through `getProjectQuote()`: that one routes anon
 * reads through `unstable_cache` keyed on its arguments, which would mint a cache entry per (trees, percentage,
 * duration) a single visitor tries and could answer with figures up to 60 s old. The calculator's `quoteStart`
 * takes the same uncached path for the same reason. The caller's own JWT travels with it, so staff previewing an
 * internal `pricing` flag see what staff see and a visitor sees «closed».
 */
export async function quoteOffer(input: QuoteOfferInput): Promise<ProjectQuote | null> {
  const config = await getPublicConfig();
  if ((await moduleAccess(config, "projects")) === "closed") return null;

  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return null;
  const data = parsed.data;

  try {
    const supabase = await createClient();
    const { data: row, error } = await supabase.rpc("public_project_quote", {
      p_project: data.projectId,
      p_trees: data.trees ?? undefined,
      p_payment_mode: data.paymentMode ?? undefined,
      p_down_percent_option_id: data.downPercentOptionId ?? undefined,
      p_duration_option_id: data.durationOptionId ?? undefined,
    });
    if (error) {
      console.error("public_project_quote failed", error.message);
      return null;
    }
    return toProjectQuote(row);
  } catch (error) {
    console.error("public_project_quote failed", error);
    return null;
  }
}

/**
 * The offer form (owner, 2026-09-18: «in the offers it's a separate form»). It asks for one offer and how many
 * of its trees, plus the identity questions the calculator form asks; it never carries a calculator answer, and
 * the calculator form never carries an offer. Both end in public.interest_requests, told apart by request_kind.
 */
const offerSchema = z.object({
  projectId: z.uuid(),
  // A whole positive count, and nothing more: the offer's real bounds are the database's. It checks the
  // count against the offer itself — `invalid_offer_trees` above what exists, `below_min_trees` under the
  // offer's own minimum (projects.min_trees_per_order, else offers.min_trees_default, migration 0054).
  // Writing a floor of 1 here would be a business value hard-coded in TypeScript, and it would be wrong
  // for every offer that sells in baskets.
  trees: z.number().int().positive(),
  fullName: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(6).max(30),
  whatsappSame: z.boolean(),
  whatsapp: z.string().trim().max(30),
  email: z.string().trim().max(200),
  governorateId: z.number().int().positive(),
  contactChannel: z.enum(["phone", "whatsapp", "both"]),
  contactTimeOptionId: z.uuid().nullable(),
  // How the visitor wants to pay for THIS offer (owner, 2026-09-19: «in the form it's missing the payment
  // method like the main form»). Same three answers /start sends to submit_interest_request, and the same
  // rule: the two ids belong to installments only, and which ones are allowed is the offer's own business.
  ...planSchema,
  // «نحب نزور الأرض» (owner, 2026-09-18). The button used to jump to a card that sent the visitor back to
  // this same form, so the intent was never written down. It rides with the request now.
  wantsVisit: z.boolean(),
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
      // The plan travels with the request, in the keys `submit_interest_request` already reads (0032). A cash
      // payer answered neither of the other two questions, so neither key is sent.
      //
      // `public.submit_offer_request` still prices every offer request with the literal 'cash' and writes none
      // of the plan columns (0054_trees.sql:811). It ignores unknown keys of `p`, so sending them today is
      // harmless and changes nothing; the draft that teaches it to read them is waiting in supabase/pending/
      // and is the session owner's to apply. Until then the CRM keeps showing a blank plan for offer leads.
      payment_mode: data.paymentMode,
      ...(data.paymentMode === "installments"
        ? { down_payment_percent_option_id: data.downPercentOptionId, duration_option_id: data.durationOptionId }
        : {}),
      wants_visit: data.wantsVisit,
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
