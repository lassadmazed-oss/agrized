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

/** Opens the request form with the parcel and the visitor's choices already filled in. */
export function interestHref(params: {
  parcelId?: string | null;
  trees?: string | null;
  scenario?: string | null;
  down?: string | null;
  installment?: string | null;
}): string {
  return withQuery("/register", {
    parcel: params.parcelId,
    trees: params.trees,
    scenario: params.scenario,
    down: params.down,
    installment: params.installment,
  });
}
