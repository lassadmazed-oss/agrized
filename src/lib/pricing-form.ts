/**
 * Pricing formulas are data (PRN-02 / SIM-06), and the Back Office edits them with plain fields, never JSON.
 * This module turns those fields into the jsonb that compute_installment_plan() reads (migration 0013), and back.
 * It has no imports, so the client editor and the Server Actions validate with exactly the same rules.
 */

export type PricingModel = "markup_brackets" | "monthly_rate" | "scenarios";
export type PricingMode = "inherit" | PricingModel;

export const PRICING_MODELS: { value: PricingModel; label: string; hint: string }[] = [
  {
    value: "markup_brackets",
    label: "هامش حسب مدة الخلاص",
    hint: "السعر الجملي يزيد بنسبة ثابتة حسب قدّاش من شهر يكمل الخلاص.",
  },
  {
    value: "monthly_rate",
    label: "هامش شهري",
    hint: "كل شهر يزيد نسبة صغيرة من المبلغ الباقي بعد التسبقة.",
  },
  {
    value: "scenarios",
    label: "تركيبات جاهزة",
    hint: "تكتب بنفسك كل تركيبة: التسبقة، القسط الشهري، عدد الأشهر والسعر الجملي.",
  },
];

/** Names of the form fields. Rows repeat the same name, in order. */
export const PRICING_FIELDS = {
  mode: "pricing_mode",
  bracketMonths: "pricing_bracket_months",
  bracketPct: "pricing_bracket_pct",
  monthlyRate: "pricing_monthly_rate",
  maxMonths: "pricing_max_months",
  minDownPct: "pricing_min_down_pct",
  minInstallment: "pricing_min_installment",
  scenarioDown: "pricing_scenario_down",
  scenarioInstallment: "pricing_scenario_installment",
  scenarioMonths: "pricing_scenario_months",
  scenarioTotal: "pricing_scenario_total",
} as const;

const F = PRICING_FIELDS;

export const MAX_BRACKETS = 12;
export const MAX_SCENARIOS = 20;

export type BracketRow = { months: string; pct: string };
export type ScenarioRow = { down: string; installment: string; months: string; total: string };

/** What the editor holds while the user types: raw strings, amounts in dinars. */
export type PricingDraft = {
  mode: PricingMode;
  brackets: BracketRow[];
  monthlyRate: string;
  maxMonths: string;
  minDownPct: string;
  minInstallment: string;
  scenarios: ScenarioRow[];
};

export type PricingValue = Record<string, unknown>;

/** value null = no formula of its own (the project uses the default, the parcel uses its project's). */
export type PricingResult = { ok: true; value: PricingValue | null } | { ok: false; message: string };

/** FormData, or the editor's draft seen through draftSource(). */
export type PricingSource = { get(name: string): unknown; getAll(name: string): unknown[] };

export const EMPTY_BRACKET: BracketRow = { months: "", pct: "" };
export const EMPTY_SCENARIO: ScenarioRow = { down: "", installment: "", months: "", total: "" };

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** «1500», «1500,5», «١٥٠٠» → a number; empty → null; anything else → undefined. */
function toNumber(raw: unknown): number | null | undefined {
  const text = String(raw ?? "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

const inRange = (value: number | null | undefined, min: number, max: number): value is number =>
  typeof value === "number" && value >= min && value <= max;
const wholeInRange = (value: number | null | undefined, min: number, max: number): value is number =>
  inRange(value, min, max) && Number.isInteger(value);
const toMillimes = (dinars: number) => Math.round(dinars * 1000);

/** 1500 → «1,500», 1.5 → «1.5». */
export function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function readLimits(source: PricingSource): { ok: true; value: PricingValue } | { ok: false; message: string } {
  const maxMonths = toNumber(source.get(F.maxMonths));
  if (maxMonths !== null && !wholeInRange(maxMonths, 1, 600)) {
    return { ok: false, message: "أقصى مدة تُكتب بعدد أشهر صحيح بين 1 و600، مثال: 84. أو اتركها فارغة." };
  }
  const minDownPct = toNumber(source.get(F.minDownPct));
  if (minDownPct !== null && !inRange(minDownPct, 0, 100)) {
    return { ok: false, message: "أدنى تسبقة نسبة من سعر الحاضر بين 0 و100، مثال: 10. أو اتركها فارغة." };
  }
  const minInstallment = toNumber(source.get(F.minInstallment));
  if (minInstallment !== null && !inRange(minInstallment, 0, 1_000_000)) {
    return { ok: false, message: "أدنى قسط شهري يُكتب بالدينار، مثال: 50. أو اتركه فارغاً." };
  }
  return {
    ok: true,
    value: {
      ...(maxMonths !== null ? { max_months: maxMonths } : {}),
      ...(minDownPct !== null ? { min_down_pct: minDownPct } : {}),
      ...(minInstallment !== null ? { min_installment_millimes: toMillimes(minInstallment) } : {}),
    },
  };
}

function readBrackets(source: PricingSource): PricingResult {
  const months = source.getAll(F.bracketMonths);
  const pcts = source.getAll(F.bracketPct);
  const brackets: { max_months: number; markup_pct: number }[] = [];
  const seen = new Set<number>();

  for (let index = 0; index < Math.max(months.length, pcts.length); index += 1) {
    const month = toNumber(months[index]);
    const pct = toNumber(pcts[index]);
    if (month === null && pct === null) continue; // an untouched row
    if (!wholeInRange(month, 1, 600) || !inRange(pct, 0, 500)) {
      return {
        ok: false,
        message: `السطر ${index + 1}: اكتب المدة بعدد أشهر صحيح (من 1 إلى 600) والهامش بنسبة بين 0 و500.`,
      };
    }
    if (seen.has(month)) return { ok: false, message: `المدة ${month} شهراً مكتوبة مرتين. كل سطر بمدة مختلفة.` };
    seen.add(month);
    brackets.push({ max_months: month, markup_pct: pct });
  }

  if (brackets.length === 0) {
    return { ok: false, message: "زيد سطراً واحداً على الأقل: حتى كم شهر، وقدّاش الهامش." };
  }
  if (brackets.length > MAX_BRACKETS) return { ok: false, message: `${MAX_BRACKETS} مدة كحد أقصى.` };

  const limits = readLimits(source);
  if (!limits.ok) return limits;
  brackets.sort((a, b) => a.max_months - b.max_months);
  return { ok: true, value: { model: "markup_brackets", brackets, ...limits.value } };
}

function readMonthlyRate(source: PricingSource): PricingResult {
  const rate = toNumber(source.get(F.monthlyRate));
  if (!inRange(rate, 0, 20)) {
    return { ok: false, message: "اكتب الهامش الشهري بنسبة بين 0 و20، مثال: 1.5." };
  }
  const limits = readLimits(source);
  if (!limits.ok) return limits;
  return { ok: true, value: { model: "monthly_rate", monthly_rate_pct: rate, ...limits.value } };
}

function readScenarios(source: PricingSource): PricingResult {
  const downs = source.getAll(F.scenarioDown);
  const installments = source.getAll(F.scenarioInstallment);
  const monthsList = source.getAll(F.scenarioMonths);
  const totals = source.getAll(F.scenarioTotal);
  const count = Math.max(downs.length, installments.length, monthsList.length, totals.length);
  const scenarios: { down_millimes: number; installment_millimes: number; months: number; total_millimes: number }[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const down = toNumber(downs[index]);
    const installment = toNumber(installments[index]);
    const months = toNumber(monthsList[index]);
    const total = toNumber(totals[index]);
    if (down === null && installment === null && months === null && total === null) continue;

    const label = `التركيبة ${index + 1}`;
    if (!inRange(down, 0, 10_000_000) || !inRange(installment, 0.001, 10_000_000) || !wholeInRange(months, 1, 600) || !inRange(total, 0.001, 100_000_000)) {
      return {
        ok: false,
        message: `${label}: اكتب التسبقة والقسط الشهري والسعر الجملي بالدينار، وعدد الأشهر بعدد صحيح.`,
      };
    }

    const downMillimes = toMillimes(down);
    const installmentMillimes = toMillimes(installment);
    const totalMillimes = toMillimes(total);
    // The last installment is what remains after the others: it must be above 0 and not above one installment.
    const lowest = downMillimes + installmentMillimes * (months - 1);
    const highest = downMillimes + installmentMillimes * months;
    if (totalMillimes <= lowest || totalMillimes > highest) {
      return {
        ok: false,
        message: `${label}: الأرقام ما تتوافقش. بتسبقة ${formatAmount(down)} د و${months} قسطاً بـ${formatAmount(installment)} د، السعر الجملي لازم يكون أكثر من ${formatAmount(lowest / 1000)} د وما يفوتش ${formatAmount(highest / 1000)} د.`,
      };
    }

    const key = `${downMillimes}:${installmentMillimes}`;
    if (seen.has(key)) {
      return { ok: false, message: `${label} عندها نفس التسبقة والقسط متاع تركيبة أخرى. بدّل واحدة منهم.` };
    }
    seen.add(key);
    scenarios.push({ down_millimes: downMillimes, installment_millimes: installmentMillimes, months, total_millimes: totalMillimes });
  }

  if (scenarios.length === 0) {
    return { ok: false, message: "زيد تركيبة واحدة على الأقل: التسبقة، القسط الشهري، عدد الأشهر والسعر الجملي." };
  }
  if (scenarios.length > MAX_SCENARIOS) return { ok: false, message: `${MAX_SCENARIOS} تركيبة كحد أقصى.` };
  return { ok: true, value: { model: "scenarios", scenarios } };
}

/** Reads the pricing fields of a form. `allowInherit` is false for the default formula itself. */
export function readPricingForm(source: PricingSource, { allowInherit }: { allowInherit: boolean }): PricingResult {
  const mode = String(source.get(F.mode) ?? "");
  if (mode === "inherit" && allowInherit) return { ok: true, value: null };
  if (mode === "markup_brackets") return readBrackets(source);
  if (mode === "monthly_rate") return readMonthlyRate(source);
  if (mode === "scenarios") return readScenarios(source);
  return { ok: false, message: "اختر طريقة التسعير." };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rows(value: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return Array.isArray(value[key]) ? (value[key] as unknown[]).map(asObject) : [];
}

/** The calculator treats a formula without a model as brackets (0013); an empty object means «no formula». */
function modelOf(value: Record<string, unknown>): PricingModel | null {
  if (value.model === "markup_brackets" || value.model === "monthly_rate" || value.model === "scenarios") return value.model;
  return rows(value, "brackets").length > 0 ? "markup_brackets" : null;
}

const asText = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const millimesAsDinars = (value: unknown) => (value === null || value === undefined || value === "" ? "" : String(Number(value) / 1000));

export function draftFromPricing(value: unknown, fallback: PricingMode): PricingDraft {
  const pricing = asObject(value);
  const brackets = rows(pricing, "brackets")
    .sort((a, b) => Number(a.max_months) - Number(b.max_months))
    .map((bracket) => ({ months: asText(bracket.max_months), pct: asText(bracket.markup_pct) }));
  const scenarios = rows(pricing, "scenarios").map((scenario) => ({
    down: millimesAsDinars(scenario.down_millimes),
    installment: millimesAsDinars(scenario.installment_millimes),
    months: asText(scenario.months),
    total: millimesAsDinars(scenario.total_millimes),
  }));

  return {
    mode: modelOf(pricing) ?? fallback,
    brackets: brackets.length > 0 ? brackets : [EMPTY_BRACKET],
    monthlyRate: asText(pricing.monthly_rate_pct),
    maxMonths: asText(pricing.max_months),
    minDownPct: asText(pricing.min_down_pct),
    minInstallment: millimesAsDinars(pricing.min_installment_millimes),
    scenarios: scenarios.length > 0 ? scenarios : [EMPTY_SCENARIO],
  };
}

/** Lets readPricingForm() check a draft exactly as the server will check the submitted form. */
export function draftSource(draft: PricingDraft): PricingSource {
  const values: Record<string, string[]> = {
    [F.mode]: [draft.mode],
    [F.bracketMonths]: draft.brackets.map((row) => row.months),
    [F.bracketPct]: draft.brackets.map((row) => row.pct),
    [F.monthlyRate]: [draft.monthlyRate],
    [F.maxMonths]: [draft.maxMonths],
    [F.minDownPct]: [draft.minDownPct],
    [F.minInstallment]: [draft.minInstallment],
    [F.scenarioDown]: draft.scenarios.map((row) => row.down),
    [F.scenarioInstallment]: draft.scenarios.map((row) => row.installment),
    [F.scenarioMonths]: draft.scenarios.map((row) => row.months),
    [F.scenarioTotal]: draft.scenarios.map((row) => row.total),
  };
  return { get: (name) => values[name]?.[0] ?? null, getAll: (name) => values[name] ?? [] };
}

/** The formula in plain Arabic, one line per rule. Empty when there is no formula. */
export function describePricing(value: unknown): string[] {
  const pricing = asObject(value);
  const model = modelOf(pricing);
  if (!model) return [];

  if (model === "scenarios") {
    const lines = rows(pricing, "scenarios").map(
      (scenario) =>
        `تسبقة ${formatAmount(Number(scenario.down_millimes) / 1000)} د + ${asText(scenario.months)} قسطاً بـ${formatAmount(
          Number(scenario.installment_millimes) / 1000,
        )} د ← السعر الجملي ${formatAmount(Number(scenario.total_millimes) / 1000)} د`,
    );
    return [...lines, "تتطبّق التركيبة كي تكون التسبقة والقسط اللي اختارهم الحريف نفس أرقامها بالضبط."];
  }

  const lines =
    model === "monthly_rate"
      ? [`كل شهر يزيد ${formatAmount(Number(pricing.monthly_rate_pct ?? 0))}% من (سعر الحاضر − التسبقة).`]
      : rows(pricing, "brackets")
          .sort((a, b) => Number(a.max_months) - Number(b.max_months))
          .map((bracket) => `يكمل الخلاص في ${asText(bracket.max_months)} شهراً أو أقل ← سعر الحاضر + ${formatAmount(Number(bracket.markup_pct))}%`);

  lines.push(pricing.max_months ? `أقصى مدة: ${asText(pricing.max_months)} شهراً.` : "أقصى مدة: 120 شهراً (القيمة الافتراضية).");
  if (Number(pricing.min_down_pct) > 0) lines.push(`أدنى تسبقة: ${formatAmount(Number(pricing.min_down_pct))}% من سعر الحاضر.`);
  if (Number(pricing.min_installment_millimes) > 0) {
    lines.push(`أدنى قسط شهري: ${formatAmount(Number(pricing.min_installment_millimes) / 1000)} د.`);
  }
  return lines;
}
