import { parsePhoneNumberFromString } from "libphonenumber-js/min";

import { toWesternDigits } from "@/lib/digits";

export type PhoneCheck =
  | { ok: true; e164: string }
  | { ok: false; reason: "invalid" | "not_tunisian" };

/**
 * Normalizes what a visitor typed ("98 123 456", "0021698123456", "+216 98…") to E.164.
 * Numbers without a country code are read as Tunisian.
 */
export function normalizePhone(input: string, allowInternational: boolean): PhoneCheck {
  const cleaned = toWesternDigits(input).replace(/[\s.\-()]/g, "").replace(/^00/, "+");
  if (!cleaned) return { ok: false, reason: "invalid" };

  const phone = parsePhoneNumberFromString(cleaned, "TN");
  if (!phone || !phone.isValid()) return { ok: false, reason: "invalid" };
  if (phone.countryCallingCode !== "216" && !allowInternational) {
    return { ok: false, reason: "not_tunisian" };
  }
  return { ok: true, e164: phone.number };
}

/** "+21698123456" → "98 123 456"; other countries keep the international format. */
export function formatPhone(e164: string): string {
  const tunisian = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(e164);
  if (tunisian) return `${tunisian[1]} ${tunisian[2]} ${tunisian[3]}`;
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
