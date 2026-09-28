import { toWesternDigits } from "@/lib/digits";

/*
 * The buyer's phone number and the buyer's Arabic, in a plain module.
 *
 * WHY A MODULE OF ITS OWN. A `"use server"` file may export only async functions, so a synchronous helper
 * written in one action file could not be imported by the next — and the phone normaliser was copied into
 * src/app/(public)/zitounti/security/security-actions.ts as a «twin» that had already drifted (it did not
 * convert Arabic-Indic digits and did not strip parentheses). One copy, imported by both, and by the client
 * components for the sentences below. No "server-only", no React: it must run on both sides.
 */

/**
 * Tunisian numbers as people actually type them — 98 124 111, 20123456, +216 98 124 111, ٩٨١٢٤١١١ — normalised
 * to the one shape public.persons stores and its own CHECK enforces (`^\+[1-9][0-9]{6,14}$`).
 *
 * The eight-digit local form is the common case and is assumed Tunisian, because this is a Tunisian product
 * and the intake has never collected a foreign number. Anything already carrying a `+` is left alone: a
 * client who wrote their French number is not helped by having +216 forced onto the front of it.
 *
 * The non-breaking space is covered by `\s`, written as a class rather than pasted: it is invisible in a
 * source file, and a character class that depends on nobody deleting a character they cannot see is a trap
 * for the next reader. Numbers arrive carrying them from copy-paste out of WhatsApp and contact cards.
 */
export function normalisePhone(raw: string): string {
  const trimmed = toWesternDigits(raw).replace(/[\s .\-()]/g, "").trim();
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  if (/^216[0-9]{8}$/.test(trimmed)) return `+${trimmed}`;
  if (/^[0-9]{8}$/.test(trimmed)) return `+216${trimmed}`;
  return trimmed;
}

/**
 * Tunisian Arabic agreement for a counted noun: the singular alone for one (no numeral — «دقيقة», never
 * «1 دقايق»), the dual for two, the plural with the numeral from three to ten, and the singular with the
 * numeral above ten. The forms are passed in so every screen that prints a count reads one rule.
 */
export function countAr(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

/** «دقيقة» · «دقيقتين» · «5 دقايق» · «12 دقيقة». */
export function minutesAr(n: number): string {
  return countAr(n, { one: "دقيقة", two: "دقيقتين", few: "دقايق", many: "دقيقة" });
}

/** «حرف واحد» · «حرفين» · «8 أحرف» · «12 حرف». */
export function lettersAr(n: number): string {
  return countAr(n, { one: "حرف واحد", two: "حرفين", few: "أحرف", many: "حرف" });
}
