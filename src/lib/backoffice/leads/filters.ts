// Parsing of CRM filters from the URL, shared by the list page, the CSV export and bulk transfer
// (CRM-01..03, PARC-12, spec v2 §47, report v3 §44). Lists retired by plan Q-7 have no filter any more.

import { formatMoney, formatPercent } from "@/components/admin/tree-pricing-inputs";

type SearchParams = Record<string, string | string[] | undefined>;

export type LeadFilters = {
  q?: string;
  residence_governorate_id?: string;
  invest_governorate_id?: string;
  include_anywhere?: boolean;
  project_type_id?: string;
  include_unsure?: boolean;
  plantation_system?: string;
  production_status?: string;
  trees_min?: string;
  trees_max?: string;
  include_trees_any?: boolean;
  /** Months, compared with the duration snapshot of each demand. */
  duration_min?: string;
  duration_max?: string;
  /** Plan Q-1: the percentage of the cash total, matched exactly («10», «12.5»). */
  down_payment_percent?: string;
  /** "true" or "false" as text: a boolean false would be dropped as «no filter» below. */
  wants_visit?: YesNo;
  wants_bank_financing?: YesNo;
  goal_code?: string;
  status_id?: string;
  assigned_to?: string;
  from?: string;
  to?: string;
  source?: string;
  duplicates_only?: boolean;
  /** Tree pricing addendum: the spacing class and the payment mode chosen with the price. */
  spacing_class_id?: string;
  payment_mode?: PaymentMode;
  /** 0049: which intake wrote the demand — the client simulator, or a real offer page. */
  request_kind?: RequestKind;
  /**
   * 0049/0052: the offer a demand was sent from. crm_search_requests has filtered on it in SQL since 0052
   * (verified against the live function, 2026-09-19); nothing read it out of the address until now, so «show
   * me the demands on TX-00215» could not be linked to from the offer itself.
   */
  project_id?: string;
  /** View mode, not a filter: one row per person instead of one per demand. */
  people?: boolean;
};

type YesNo = "true" | "false";

export const PAYMENT_MODES = ["cash", "installments"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "بالحاضر",
  installments: "بالتقسيط",
};

/**
 * The two intakes, kept apart everywhere the Back Office shows a demand (0049 · interest_requests.request_kind).
 * «calculator» is a simulation the visitor ran on /start; «offer» is a demand on a real offer page, with its
 * stock, its trees and its own price. They must never read as the same thing.
 */
export const REQUEST_KINDS = ["calculator", "offer"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** Staff labels. Short, because they are read inside a table cell. */
export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  calculator: "محاكي",
  offer: "عرض",
};

/** The same two, spelled out for a filter control. */
export const REQUEST_KIND_FILTER_LABELS: Record<RequestKind, string> = {
  calculator: "محاكي (تقديري)",
  offer: "عروض حقيقية",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^\d{1,13}$/;
const TREES = /^\d{1,7}$/;
const MONTHS = /^\d{1,3}$/;
const PERCENT = /^\d{1,3}(?:\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[a-z0-9_-]{1,50}$/i;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function matching(value: string | string[] | undefined, pattern: RegExp): string | undefined {
  const candidate = first(value);
  return candidate && pattern.test(candidate) ? candidate : undefined;
}

function yesNo(value: string | string[] | undefined): YesNo | undefined {
  const candidate = first(value);
  return candidate === "true" || candidate === "false" ? candidate : undefined;
}

/** A percentage in its shortest form («10.50» → «10.5»), so it matches the values of the filter select. */
function percentValue(value: string | string[] | undefined): string | undefined {
  const candidate = matching(value, PERCENT);
  return candidate === undefined ? undefined : String(Number(candidate));
}

export function parseLeadFilters(params: SearchParams): LeadFilters {
  const assigned = first(params.assigned_to);
  return {
    q: first(params.q)?.slice(0, 100),
    residence_governorate_id: matching(params.residence_governorate_id, INTEGER),
    invest_governorate_id: matching(params.invest_governorate_id, INTEGER),
    include_anywhere: first(params.include_anywhere) === "1",
    project_type_id: matching(params.project_type_id, UUID),
    include_unsure: first(params.include_unsure) === "1",
    plantation_system: matching(params.plantation_system, CODE),
    production_status: matching(params.production_status, CODE),
    trees_min: matching(params.trees_min, TREES),
    trees_max: matching(params.trees_max, TREES),
    include_trees_any: first(params.include_trees_any) === "1",
    duration_min: matching(params.duration_min, MONTHS),
    duration_max: matching(params.duration_max, MONTHS),
    down_payment_percent: percentValue(params.down_payment_percent),
    wants_visit: yesNo(params.wants_visit),
    wants_bank_financing: yesNo(params.wants_bank_financing),
    goal_code: matching(params.goal_code, CODE),
    status_id: matching(params.status_id, UUID),
    assigned_to: assigned === "none" || (assigned && UUID.test(assigned)) ? assigned : undefined,
    from: matching(params.from, DATE),
    to: matching(params.to, DATE),
    source: first(params.source)?.slice(0, 100),
    duplicates_only: first(params.duplicates_only) === "1",
    spacing_class_id: matching(params.spacing_class_id, UUID),
    payment_mode: PAYMENT_MODES.find((mode) => mode === first(params.payment_mode)),
    request_kind: REQUEST_KINDS.find((kind) => kind === first(params.request_kind)),
    project_id: matching(params.project_id, UUID),
    people: first(params.people) === "1",
  };
}

/**
 * Arguments for public.crm_search_requests. The people mode is sent only when the caller asks for it.
 *
 * Every key is forwarded as it stands and the function reads the ones it knows. request_kind and project_id
 * are among them since 0052, which IS APPLIED (it landed as supabase/migrations/0052_crm_offer_columns.sql,
 * not as the pending draft an earlier comment here named): the search filters on both inside the database, so
 * no caller narrows the rows itself any more and the counts and pagination the list shows are exact.
 */
export function filtersToRpc(filters: LeadFilters, { withPeople = false } = {}): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === false) continue;
    if (key === "people" && !withPeople) continue;
    result[key] = value;
  }
  return result;
}

export function filtersToQuery(filters: LeadFilters, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === false) continue;
    query.set(key, value === true ? "1" : value);
  }
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query.toString();
}

export function hasActiveFilters(filters: LeadFilters): boolean {
  return Object.entries(filters).some(([key, value]) => key !== "people" && value !== undefined && value !== false);
}

/** «تسبقة 10% · 1,000 د.ت» from a demand's snapshot; null when it has no percentage (cash or an older demand). */
export function downPaymentSummary(percent: number | string | null | undefined, amountMillimes: number | null | undefined): string | null {
  if (percent === null || percent === undefined || percent === "") return null;
  const parts = [`تسبقة ${formatPercent(percent)}`];
  if (typeof amountMillimes === "number") parts.push(formatMoney(amountMillimes));
  return parts.join(" · ");
}
