// Shape of public.crm_demand_stats and the period picker shared by the dashboard and the analytics page.

export type CountItem = { label: string; count: number };

export type DemandStats = {
  people_mode: boolean;
  requests: number;
  persons: number;
  duplicates: number;
  trees_total: number;
  today: number;
  last_7_days: number;
  anywhere: number;
  anywhere_trees: number;
  unsure_type: number;
  /** Report v3 §40 and §14: demands (or persons) that answered yes. */
  visit_yes: number;
  bank_financing_yes: number;
  /** Active durations, retired ones still carried by demands, then no answer (id null). */
  by_duration: { id: string | null; label: string; months: number | null; count: number }[];
  by_tree_count: { code: string | null; label: string; min: number | null; count: number; trees: number }[];
  by_invest_governorate: { id: number; name: string; count: number; trees: number }[];
  by_governorate_trees: { id: number; name: string; trees: number; count: number }[];
  by_project_type: { id: string; name: string; count: number }[];
  by_scenario: { id: string; name: string; count: number }[];
  by_desired_area: { label: string; min: number | null; count: number }[];
  by_priority: CountItem[];
  by_plantation_system: { code: string; name: string; count: number }[];
  by_down_payment: { label: string; min: number | null; count: number }[];
  by_installment: { label: string; min: number | null; count: number }[];
  by_goal: CountItem[];
  by_source: { source: string; count: number }[];
  daily: { day: string; count: number }[];
};

export const RANGES = [
  { key: "all", label: "كل الفترة", days: null },
  { key: "7d", label: "آخر 7 أيام", days: 7 },
  { key: "30d", label: "آخر 30 يوماً", days: 30 },
  { key: "90d", label: "آخر 90 يوماً", days: 90 },
] as const;

export type Range = (typeof RANGES)[number];

export function tunisToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
}

export function daysAgo(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

/** The chosen period and its first day in Africa/Tunis, or null for the whole period. */
export function resolveRange(value: string | string[] | undefined): { range: Range; from: string | null; today: string } {
  const key = Array.isArray(value) ? value[0] : value;
  const range = RANGES.find((r) => r.key === key) ?? RANGES[0];
  const today = tunisToday();
  return { range, from: range.days ? daysAgo(today, range.days) : null, today };
}
