"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { flagState, getPublicConfig, optionsFor, settingBool, settingText } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { getStaffSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

const interestSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(6).max(30),
  whatsappSame: z.boolean(),
  whatsapp: z.string().trim().max(30),
  email: z.string().trim().max(200),
  governorateId: z.number().int().positive(),
  investAnywhere: z.boolean(),
  investGovernorateIds: z.array(z.number().int().positive()).max(30),
  // Clause 25: what the citizen wants to own; the scenario decides the project type.
  scenarioIds: z.array(z.uuid()).min(1).max(10),
  // MIL-01: how many olive trees, asked before anything else. Independent of the surface (PARC-02).
  treeCountOptionId: z.uuid().nullable(),
  // /start also lets the visitor type a number; the database enforces the limits (invalid_tree_custom).
  treeCountCustom: z.number().int().positive().nullable(),
  desiredAreaOptionId: z.uuid().nullable(),
  // Priority is not in report v3 §40 and the wizard no longer asks it; the database still accepts one.
  priorityOptionId: z.uuid().nullable().optional(),
  goalOptionId: z.uuid(),
  downPaymentOptionId: z.uuid(),
  // Report v3 §6: the client picks a duration, never a monthly amount; kept only for older callers.
  installmentOptionId: z.uuid().nullable().optional(),
  durationOptionId: z.uuid().nullable(),
  budgetOptionId: z.uuid().nullable(),
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
  scenario_required: 3,
  invalid_scenario: 3,
  single_scenario_only: 3,
  invalid_project_type: 3,
  invalid_tree_choice: 4,
  invalid_tree_custom: 4,
  invalid_desired_area: 4,
  invalid_goal: 5,
  invalid_down_payment: 6,
  invalid_installment: 6,
  invalid_duration: 6,
  invalid_budget: 6,
  invalid_contact_time: 8,
  contact_channel_required: 8,
  consent_required: 9,
};

export type SubmitInterestResult =
  | { ok: true; requestNo: string }
  | { ok: false; message: string; step?: number };

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
  // The database keeps the duration optional for other callers; this form requires it once AgriZed lists durations.
  if (!data.durationOptionId && optionsFor(config, "duration").length > 0) {
    return { ok: false, message: intakeErrorMessage("invalid_duration"), step: ERROR_STEP.invalid_duration };
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
      // The public form no longer asks for the delegation; a commercial can add it later.
      residence_delegation_id: null,
      invest_anywhere: data.investAnywhere,
      invest_governorate_ids: data.investAnywhere ? [] : data.investGovernorateIds,
      scenario_ids: data.scenarioIds,
      tree_count_option_id: data.treeCountOptionId,
      tree_count_custom: data.treeCountCustom === null ? null : String(data.treeCountCustom),
      desired_area_option_id: data.desiredAreaOptionId,
      priority_option_id: data.priorityOptionId ?? null,
      goal_option_id: data.goalOptionId,
      down_payment_option_id: data.downPaymentOptionId,
      installment_option_id: data.installmentOptionId ?? null,
      duration_option_id: data.durationOptionId,
      budget_option_id: data.budgetOptionId,
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
    return { ok: false, message: intakeErrorMessage(error.message), step: ERROR_STEP[error.message] };
  }

  const requestNo = (result as { request_no?: string } | null)?.request_no;
  if (!requestNo) {
    console.error("submit_interest_request returned no request number", result);
    return { ok: false, message: intakeErrorMessage(null) };
  }
  return { ok: true, requestNo };
}
