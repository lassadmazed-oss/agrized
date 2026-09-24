/**
 * Money, areas and counts, formatted the way the website formats them (src/lib/format.ts).
 *
 * MONEY IS INTEGER MILLIMES EVERYWHERE — in the database, in the RPC, and in this file until the last line.
 * A price that arrives as 167000 is 167 dinars; handing that number to a screen unconverted is how an app
 * tells somebody an olive tree costs a hundred and sixty-seven thousand dinars. The division happens here and
 * nowhere else.
 */

const digits = new Intl.NumberFormat("en-US");

/** «1,694» — Latin digits, as the site uses, and grouped so four figures stay readable. */
export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return digits.format(Math.round(value));
}

/** «167 د.ت» from 167000 millimes. */
export function money(millimes: number | null | undefined): string {
  if (millimes === null || millimes === undefined || !Number.isFinite(millimes)) return "";
  const dinars = millimes / 1000;
  // A price with no fraction is written without one: «167 د.ت», never «167.00 د.ت».
  const body = Number.isInteger(dinars) ? digits.format(dinars) : dinars.toFixed(2);
  return `${body} د.ت`;
}

/** «25 م²» */
export function area(m2: number | null | undefined): string {
  if (m2 === null || m2 === undefined || !Number.isFinite(m2)) return "";
  return `${digits.format(Math.round(m2))} م²`;
}

/** The Arabic for the three production states (a check constraint, 0010 — not an owner-editable list). */
export const PRODUCTION: Record<string, string> = {
  none: "غير منتج",
  starting: "بداية إنتاج",
  producing: "منتج",
};

/** And for irrigation, which arrives as an English code the site also translates. */
export const IRRIGATION: Record<string, string> = {
  rainfed: "بعلية",
  irrigated: "مروية",
  drip: "ري بالتنقيط",
  partial: "ري جزئي",
};
