"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { flagState, getPublicConfig, optionsFor, settingBool, settingText } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { getStaffSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_MODES } from "@/lib/tree-pricing";

import { calculatorGap } from "../start/calculator-summary";

const interestSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(6).max(30),
  whatsappSame: z.boolean(),
  whatsapp: z.string().trim().max(30),
  email: z.string().trim().max(200),
  governorateId: z.number().int().positive(),
  investAnywhere: z.boolean(),
  investGovernorateIds: z.array(z.number().int().positive()).max(30),
  // P2-6: the calculator answers come from /start through the URL; the database checks each against its list.
  treeCountOptionId: z.uuid().nullable(),
  // /start also lets the visitor type a number; the database enforces the limits (invalid_tree_custom).
  treeCountCustom: z.number().int().positive().nullable(),
  // Q-6: one optional offer type; none means the visitor is not sure.
  scenarioId: z.uuid().nullable(),
  spacingClassId: z.uuid().nullable(),
  paymentMode: z.enum(PAYMENT_MODES).nullable(),
  downPercentOptionId: z.uuid().nullable(),
  durationOptionId: z.uuid().nullable(),
  goalOptionId: z.uuid(),
  // Report v3 §40 and §14 (decision N-9): optional yes/no answers, null when skipped.
  wantsVisit: z.boolean().nullable(),
  wantsBankFinancing: z.boolean().nullable(),
  contactChannel: z.enum(["phone", "whatsapp", "both"]),
  contactTimeOptionId: z.uuid().nullable(),
  consent: z.literal(true),
  website: z.string().max(200), // honeypot: real visitors never fill it
  source: z.record(z.string(), z.string().max(300)),
}).refine((data) => data.treeCountOptionId === null || data.treeCountCustom === null, {
  path: ["treeCountCustom"],
  message: "tree_count_option_id and tree_count_custom are mutually exclusive",
});

export type InterestInput = z.input<typeof interestSchema>;

/** Wizard step to reopen when the database rejects a value (1-based, see register-wizard). */
const ERROR_STEP: Record<string, number> = {
  invalid_full_name: 1,
  invalid_phone: 1,
  phone_not_tunisian: 1,
  invalid_whatsapp: 1,
  invalid_email: 1,
  invalid_governorate: 1,
  invalid_delegation: 1,
  invest_location_required: 2,
  invalid_invest_governorate: 2,
  invalid_goal: 3,
  invalid_contact_time: 5,
  contact_channel_required: 5,
  consent_required: 6,
};

/** Answers only /start can change; the wizard links back there instead of reopening a step. */
const CALCULATOR_ERRORS = new Set([
  "invalid_tree_choice",
  "invalid_tree_custom",
  "invalid_spacing",
  "invalid_payment_mode",
  "invalid_down_payment_percent",
  "down_payment_percent_required",
  "invalid_duration",
  "duration_required",
  "invalid_scenario",
  "single_scenario_only",
  "scenario_required",
  "invalid_project_type",
]);

export type SubmitInterestResult =
  | { ok: true; requestNo: string }
  | { ok: false; message: string; step?: number; calculator?: boolean };

export async function submitInterest(input: InterestInput): Promise<SubmitInterestResult> {
  const config = await getPublicConfig();
  const state = flagState(config, "interest_form");
  if (state === "disabled" || (state === "internal" && !(await getStaffSession()))) {
    return { ok: false, message: "التسجيل غير متاح حالياً. حاول لاحقاً." };
  }

  const parsed = interestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "بعض المعلومات ناقصة أو غير صحيحة. راجع الخطوات وحاول مجدداً." };
  }
  const data = parsed.data;
  if (data.website) {
    return { ok: false, message: intakeErrorMessage(null) };
  }
  const gap = calculatorGap(
    {
      treeId: data.treeCountOptionId,
      treesCustom: data.treeCountCustom,
      scenarioId: data.scenarioId,
      spacingId: data.spacingClassId,
      paymentMode: data.paymentMode,
      downPercentId: data.downPercentOptionId,
      durationId: data.durationOptionId,
    },
    { downPercents: optionsFor(config, "down_payment_percent").length, durations: optionsFor(config, "duration").length },
  );
  if (gap) {
    return { ok: false, message: intakeErrorMessage(gap), calculator: true };
  }

  const phone = normalizePhone(data.phone, settingBool(config, "lead.allow_international_phone"));
  if (!phone.ok) {
    const code = phone.reason === "not_tunisian" ? "phone_not_tunisian" : "invalid_phone";
    return { ok: false, message: intakeErrorMessage(code), step: 1 };
  }

  let whatsapp = phone.e164;
  if (!data.whatsappSame) {
    const parsedWhatsapp = normalizePhone(data.whatsapp, true);
    if (!parsedWhatsapp.ok) {
      return { ok: false, message: intakeErrorMessage("invalid_whatsapp"), step: 1 };
    }
    whatsapp = parsedWhatsapp.e164;
  }

  const requestHeaders = await headers();
  const supabase = createAdminClient(auditHeaders(requestHeaders));

  const { data: result, error } = await supabase.rpc("submit_interest_request", {
    p: {
      full_name: data.fullName,
      phone_e164: phone.e164,
      whatsapp_e164: whatsapp,
      email: data.email,
      residence_governorate_id: data.governorateId,
      invest_anywhere: data.investAnywhere,
      invest_governorate_ids: data.investAnywhere ? [] : data.investGovernorateIds,
      scenario_ids: data.scenarioId ? [data.scenarioId] : [],
      project_type_unsure: !data.scenarioId,
      ...(data.treeCountOptionId
        ? { tree_count_option_id: data.treeCountOptionId }
        : { tree_count_custom: data.treeCountCustom === null ? null : String(data.treeCountCustom) }),
      spacing_class_id: data.spacingClassId,
      payment_mode: data.paymentMode,
      // A cash payer answered neither question, so neither key is sent.
      ...(data.paymentMode === "installments"
        ? { down_payment_percent_option_id: data.downPercentOptionId, duration_option_id: data.durationOptionId }
        : {}),
      goal_option_id: data.goalOptionId,
      wants_visit: data.wantsVisit,
      wants_bank_financing: data.wantsBankFinancing,
      contact_channel: data.contactChannel,
      contact_time_option_id: data.contactTimeOptionId,
      consent_text: settingText(config, "legal.consent_text", "موافقة على التواصل ومعالجة المعطيات"),
      ip_hash: hashIp(clientIp(requestHeaders)),
      source: data.source,
    },
  });

  if (error) {
    if (!isKnownIntakeError(error.message)) {
      console.error("submit_interest_request failed", error);
    }
    const message = intakeErrorMessage(error.message);
    return CALCULATOR_ERRORS.has(error.message)
      ? { ok: false, message, calculator: true }
      : { ok: false, message, step: ERROR_STEP[error.message] };
  }

  const requestNo = (result as { request_no?: string } | null)?.request_no;
  if (!requestNo) {
    console.error("submit_interest_request returned no request number", result);
    return { ok: false, message: intakeErrorMessage(null) };
  }
  return { ok: true, requestNo };
}
