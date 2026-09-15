// Links of the public projects module. Client-safe: ids and codes only, never amounts.

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export function projectsHref(params: { gov?: string | null; trees?: string | null; type?: string | null } = {}): string {
  return withQuery("/projects", params);
}

export function projectHref(projectCode: string): string {
  return `/projects/${encodeURIComponent(projectCode)}`;
}

export function parcelHref(projectCode: string, parcelCode: string): string {
  return `/projects/${encodeURIComponent(projectCode)}/${encodeURIComponent(parcelCode)}`;
}

/**
 * Opens the request form with the calculator's choices filled in, using agrized-db's /register contract
 * (docs/plan-zitouna.md P2-6): the form itself never asks them again, and without a tree count it sends the
 * visitor to the calculator on /start with the other choices kept. Ids are option or class ids, never amounts.
 */
export function interestHref(params: {
  parcelId?: string | null;
  trees?: string | null;
  treesCustom?: number | null;
  scenario?: string | null;
  spacing?: string | null;
  payment?: "cash" | "installments" | null;
  downPercent?: string | null;
  duration?: string | null;
  visit?: boolean;
}): string {
  const installments = params.payment === "installments";
  return withQuery("/register", {
    parcel: params.parcelId,
    trees: params.trees,
    trees_custom: params.trees ? null : params.treesCustom ? String(params.treesCustom) : null,
    scenario: params.scenario,
    spacing: params.spacing,
    payment: params.payment,
    down_pct: installments ? params.downPercent : null,
    duration: installments ? params.duration : null,
    visit: params.visit ? "1" : null,
  });
}
