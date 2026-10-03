import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_LOCALE,
  DISPLAY_LOCALE_HEADER,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  LOCALES,
  localePath,
  splitLocale,
  type Locale,
} from "@/lib/i18n/locales";
import { publicEnv } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Two jobs, by address.
 *
 * THE BACK OFFICE (/admin…) — unchanged: the Supabase session is refreshed and a visitor without one is sent
 * to the sign-in page. Optimistic only; every Back Office page and action checks roles on the server.
 *
 * THE SITE (everything else) — the language (0109, owner 2026-10-03):
 *   /fr/projects     French. Served as is, and «fr» is remembered in a cookie: the language a visitor reads
 *                    is the language they chose.
 *   /projects        Arabic, the root language — rewritten to /ar/projects inside, so the address in the bar
 *                    and in every SMS ever sent stays the one it was. A visitor who chose another language
 *                    (the cookie) is sent to it instead: /projects → /fr/projects.
 *   /ar/projects     «switch to Arabic»: remembered, then sent to /projects, the one Arabic address.
 *   /de/… switched off by the owner → the Arabic address, and the cookie forgets German.
 * Every page answer carries a Link header naming the same page in each language (hreflang), which is how a
 * search engine learns that /fr/projects is the French /projects.
 *
 * The URL's language is written into the request as `x-agrized-locale`, overwriting whatever the visitor
 * sent, so a Server Action — where Next's `[lang]` getter is not available — knows the page it was posted
 * from, and the database can record the client's language from it.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return backOffice(request);
  return site(request);
}

async function backOffice(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!userId && pathname !== "/admin/login" && pathname !== "/admin/setup") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// ---- the languages the owner has switched on, cached per server instance ----

const ENABLED_TTL_MS = 60_000;
let enabledCache: { at: number; codes: Set<Locale> } | null = null;

/**
 * Which languages are switched on (public.locales), read at most once a minute per instance. If the read fails
 * the answer is «all five» — a switched-off language staying reachable for a minute is better than the site
 * refusing its own languages because the database blinked. The page itself never depends on this.
 */
async function enabledLocales(): Promise<Set<Locale>> {
  if (enabledCache && Date.now() - enabledCache.at < ENABLED_TTL_MS) return enabledCache.codes;
  try {
    const response = await fetch(`${publicEnv.supabaseUrl}/rest/v1/locales?select=code&is_enabled=eq.true`, {
      headers: { apikey: publicEnv.supabaseAnonKey, Authorization: `Bearer ${publicEnv.supabaseAnonKey}` },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error(`locales ${response.status}`);
    const rows = (await response.json()) as { code: string }[];
    const codes = new Set<Locale>([DEFAULT_LOCALE, ...rows.map((row) => row.code).filter(isLocale)]);
    enabledCache = { at: Date.now(), codes };
    return codes;
  } catch {
    return new Set(LOCALES);
  }
}

const COOKIE_OPTIONS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };

function remember(response: NextResponse, request: NextRequest, locale: Locale): NextResponse {
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) response.cookies.set(LOCALE_COOKIE, locale, COOKIE_OPTIONS);
  return response;
}

/** The same page in every switched-on language, as an HTTP Link header (Google reads hreflang there too). */
function alternates(request: NextRequest, path: string, enabled: Set<Locale>): string {
  const origin = request.nextUrl.origin;
  const links = LOCALES.filter((code) => enabled.has(code)).map(
    (code) => `<${origin}${localePath(code, path)}>; rel="alternate"; hreflang="${code}"`,
  );
  links.push(`<${origin}${path}>; rel="alternate"; hreflang="x-default"`);
  return links.join(", ");
}

function forwardedHeaders(request: NextRequest, locale: Locale): Headers {
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  // Only the server decides when the database answers in another language (src/lib/i18n/server.ts).
  headers.delete(DISPLAY_LOCALE_HEADER);
  return headers;
}

async function site(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { locale: prefixed, path } = splitLocale(pathname);
  const enabled = await enabledLocales();
  const isRead = request.method === "GET" || request.method === "HEAD";
  const isPage = isRead && !request.headers.has("rsc") && !request.headers.has("next-router-prefetch");

  // «switch to Arabic», or a language the owner switched off: to the one Arabic address.
  if (prefixed === DEFAULT_LOCALE || (prefixed && !enabled.has(prefixed))) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = search;
    return remember(NextResponse.redirect(url), request, DEFAULT_LOCALE);
  }

  // /fr/…: served as is, remembered.
  if (prefixed) {
    const response = NextResponse.next({ request: { headers: forwardedHeaders(request, prefixed) } });
    if (isPage) response.headers.set("Link", alternates(request, path, enabled));
    return isRead ? remember(response, request, prefixed) : response;
  }

  // Unprefixed: a visitor who chose another language reads the page in it. Only on a read — a form posted
  // from an Arabic page is answered in Arabic whatever the cookie says.
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isRead && isLocale(chosen) && chosen !== DEFAULT_LOCALE && enabled.has(chosen)) {
    const url = request.nextUrl.clone();
    url.pathname = localePath(chosen, pathname);
    return NextResponse.redirect(url);
  }

  // Arabic, at its own address: the page that answers is /ar/….
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
  const response = NextResponse.rewrite(url, { request: { headers: forwardedHeaders(request, DEFAULT_LOCALE) } });
  if (isPage) response.headers.set("Link", alternates(request, pathname, enabled));
  if (isRead && chosen && chosen !== DEFAULT_LOCALE) remember(response, request, DEFAULT_LOCALE);
  return response;
}

export const config = {
  // Everything but Next's own files, the API and anything with a file extension (the public folder, the
  // favicon, sitemap.xml, robots.txt) — those have no language.
  matcher: ["/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
