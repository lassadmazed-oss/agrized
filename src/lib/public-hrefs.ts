// Links of the public projects module. Client-safe: ids and codes only, never amounts.

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** The catalogue, optionally narrowed to one governorate — the only parameter /projects reads. */
export function projectsHref(params: { gov?: string | null } = {}): string {
  return withQuery("/projects", params);
}

export function projectHref(projectCode: string): string {
  return `/projects/${encodeURIComponent(projectCode)}`;
}

// `parcelHref(projectCode, parcelCode)` stood here. It built /projects/<offer>/<parcel>, a route deleted with
// the parcel layer on 2026-09-18, and its only caller was the parcel row that went with it.
//
// `interestHref(params)` stood here too: it built the /register query string from the calculator's answers.
// The chooser on /start builds that query itself now (calculatorQuery, src/app/(public)/start/calculator-summary.ts),
// so the builder had no caller left. A second builder of the same link is how one of them silently loses a
// parameter, which is what the dropped `parcel=` did.
