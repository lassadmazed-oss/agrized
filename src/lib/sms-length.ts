/**
 * How many SMS a body costs — the TypeScript twin of app.sms_segments (0109), so the Back Office can refuse a
 * translation that would be sent as two messages before the database ever sees it.
 *
 * GSM-7 (3GPP 23.038) holds 160 characters per message and 153 per part of a long one, its extension
 * characters costing two; a single character outside it — an Arabic letter, but also ê, â, ç, « or ’ — makes
 * the whole message UCS-2: 70, then 67 per part. Every SMS this platform sends must be ONE (0079).
 */

const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM_EXTENSION = new Set("^{}\\[~]|€\f");

export function smsSegments(body: string): number {
  if (!body) return 0;
  const chars = [...body];
  if (chars.every((char) => GSM_BASIC.has(char) || GSM_EXTENSION.has(char))) {
    const units = chars.reduce((sum, char) => sum + (GSM_EXTENSION.has(char) ? 2 : 1), 0);
    return units <= 160 ? 1 : Math.ceil(units / 153);
  }
  return chars.length <= 70 ? 1 : Math.ceil(chars.length / 67);
}

/** The capacity of one message for this body's alphabet, and what it uses — for a counter beside the field. */
export function smsMeter(body: string): { used: number; limit: number; segments: number } {
  const chars = [...body];
  const gsm = chars.every((char) => GSM_BASIC.has(char) || GSM_EXTENSION.has(char));
  const used = gsm ? chars.reduce((sum, char) => sum + (GSM_EXTENSION.has(char) ? 2 : 1), 0) : chars.length;
  return { used, limit: gsm ? 160 : 70, segments: smsSegments(body) };
}

/**
 * The longest value each placeholder can take, from the database (supabase/tests/049 and 067 use the same).
 * A template is measured filled with these, not with a friendly example: the offer name and the meeting point
 * are Arabic, so any message that names one is UCS-2 whatever language the rest of it is in.
 */
export const SMS_WORST_CASE: Record<string, string> = {
  name: "Abdelhafidh soltani",
  request_no: "AGZ-2026-000041",
  reference_no: "AGZ-2026-000041",
  contract_no: "AGZ-CTR-2026-0041",
  payment_no: "AGZ-PAY-2026-0041",
  visit_no: "AGZ-VIS-2026-00001",
  offer: "ضيعة الدهماني (تجريبي)",
  meeting_point: "مدخل الضيعة الرئيسي",
  slot: "13:00-17:00",
  date: "30/09",
  time: "13:00",
  place: "مدخل الضيعة الرئيسي",
  due_on: "30/09/2026",
  signed_on: "2026-09-30",
  amount: "12 500 TND",
  trees: "1200",
  seq: "3",
  count: "12",
  missed: "2",
  code: "000000",
  minutes: "10",
};

/** The body as it would leave, every placeholder filled with its worst case. */
export function renderWorstCase(body: string, amountUnitArabic = false): string {
  const vars = amountUnitArabic ? { ...SMS_WORST_CASE, amount: "12 500 د" } : SMS_WORST_CASE;
  return body.replace(/\{([a-z_]+)\}/g, (whole, name: string) => vars[name] ?? whole);
}
