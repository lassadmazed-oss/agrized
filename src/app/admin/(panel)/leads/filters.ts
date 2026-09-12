// Parsing of CRM filters from the URL, shared by the list page and the CSV export (CRM-01..03, PARC-12).

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
  priority_code?: string;
  area_min?: string;
  area_max?: string;
  include_area_any?: boolean;
  down_min?: string;
  down_max?: string;
  installment_min?: string;
  installment_max?: string;
  goal_code?: string;
  status_id?: string;
  assigned_to?: string;
  from?: string;
  to?: string;
  source?: string;
  duplicates_only?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^\d{1,13}$/;
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
    priority_code: matching(params.priority_code, CODE),
    area_min: matching(params.area_min, INTEGER),
    area_max: matching(params.area_max, INTEGER),
    include_area_any: first(params.include_area_any) === "1",
    down_min: matching(params.down_min, INTEGER),
    down_max: matching(params.down_max, INTEGER),
    installment_min: matching(params.installment_min, INTEGER),
    installment_max: matching(params.installment_max, INTEGER),
    goal_code: matching(params.goal_code, CODE),
    status_id: matching(params.status_id, UUID),
    assigned_to: assigned === "none" || (assigned && UUID.test(assigned)) ? assigned : undefined,
    from: matching(params.from, DATE),
    to: matching(params.to, DATE),
    source: first(params.source)?.slice(0, 100),
    duplicates_only: first(params.duplicates_only) === "1",
  };
}

/** Arguments for public.crm_search_requests. */
export function filtersToRpc(filters: LeadFilters): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === false) continue;
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
  return Object.values(filters).some((value) => value !== undefined && value !== false);
}
