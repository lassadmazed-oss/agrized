// Display helpers. Amounts are stored as integer millimes (1 TND = 1000 millimes, SIM-07).

const TIME_ZONE = "Africa/Tunis";

export function formatMillimes(millimes: number, { withMillimes = false } = {}): string {
  const digits = withMillimes ? 3 : 0;
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(millimes / 1000);
  return `${amount} د.ت`;
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** Square metres with at most two decimals, e.g. "35 م²" or "6.5 م²". */
export function formatArea(m2: number, unit = "م²"): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(m2)} ${unit}`;
}

/** Planting spacing as it is written in the field, e.g. "7 × 5 م". */
export function formatSpacing(rowMetres: number, treeMetres: number, unit = "م"): string {
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  return `${n.format(rowMetres)} × ${n.format(treeMetres)} ${unit}`;
}
