// Reads the tree pricing forms: dinars (up to 3 decimals) → integer millimes, percentages (up to 2) → basis points.
// Digit strings are scaled as text, never through floats, so «0.1» dinar is exactly 100 millimes.

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalize(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/\s/g, "")
    .replace(/[,٫]/, ".");
}

/** "" → null; a number with at most `decimals` decimals → an integer in 1/10^decimals units; anything else → undefined. */
function scaled(raw: unknown, decimals: number, maxIntegerDigits: number): number | null | undefined {
  const text = normalize(raw);
  if (!text) return null;
  const match = new RegExp(`^(\\d{1,${maxIntegerDigits}})(?:\\.(\\d{1,${decimals}}))?$`).exec(text);
  if (!match) return undefined;
  return Number(match[1]) * 10 ** decimals + Number((match[2] ?? "").padEnd(decimals, "0"));
}

export function dinarsToMillimes(raw: unknown): number | null | undefined {
  return scaled(raw, 3, 9);
}

export function percentToBp(raw: unknown): number | null | undefined {
  return scaled(raw, 2, 4);
}

/** Metres with at most two decimals, e.g. «1.5». */
export function metres(raw: unknown): number | null | undefined {
  const centimetres = scaled(raw, 2, 3);
  return typeof centimetres === "number" ? centimetres / 100 : centimetres;
}

export function wholeNumber(raw: unknown, max: number): number | null | undefined {
  const text = normalize(raw);
  if (!text) return null;
  if (!/^\d{1,9}$/.test(text)) return undefined;
  const value = Number(text);
  return value <= max ? value : undefined;
}

export function textValue(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, max);
}
