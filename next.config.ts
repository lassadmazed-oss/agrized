import type { NextConfig } from "next";

// Pictures uploaded to the public `site-media` bucket (MED-01) are served from the Supabase host.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

/**
 * The Content-Security-Policy, built from the origins this site actually uses (external review, 2026-10-25,
 * F02: no CSP was present on any page).
 *
 * WHY 'unsafe-inline' IS IN script-src, stated rather than hidden. The strict alternative is a nonce per
 * response, and a nonce makes every response unique — which turns every statically rendered and
 * incrementally revalidated page on this site into a dynamic one. Most of the public site is SSG/ISR; the
 * cost of that is paid by every visitor on a Tunisian phone, on every page, for ever. What the policy still
 * buys without it is the part that matters most here: a script from ANOTHER ORIGIN cannot run, an injected
 * <base> cannot redirect form posts, a form cannot be made to submit somewhere else, and the page cannot be
 * framed. Those are the attacks this site's shape is exposed to; an inline-script injection would need an
 * XSS hole first, and React escapes what the site renders.
 *
 * EVERY ENTRY IS AN ORIGIN SOMETHING ON THE SITE REALLY USES, so that a violation in the console means a
 * real change rather than a policy nobody tuned:
 *   · img/media — Supabase storage, which serves every offer photograph and the site's own pictures.
 *   · connect — Supabase (REST, auth, storage, realtime over wss). Everything else the server calls, it
 *     calls from the server: Meta, OpenAI and WinSMS never appear in a browser request.
 *   · frame — the video embeds (project-video.tsx) and the map on the visit page. Nothing else may be
 *     framed INTO the site, and frame-ancestors 'none' means the site may not be framed BY anything.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `img-src 'self' data: blob:${supabaseHost ? ` https://${supabaseHost}` : ""}`,
  `media-src 'self' blob:${supabaseHost ? ` https://${supabaseHost}` : ""}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // 'unsafe-eval' IN DEVELOPMENT ONLY. React's development build uses eval() to rebuild call stacks for its
  // error overlay — it says so itself in the console when a policy blocks it — and it never uses eval in
  // production. Dropping the whole policy in development instead would mean shipping one nobody had ever
  // watched a page under; this way every other directive is exercised on every page a developer opens, and
  // the one that is relaxed is relaxed only where React needs it.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ""}`,
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation is used by the landowner form ("I am on the property now").
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  // frame-ancestors above supersedes this for browsers that read the CSP; it stays for the ones that do not.
  ...(process.env.NODE_ENV === "production" ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
  // Enforced, not Report-Only. A Report-Only policy protects nobody, and the report that would justify one
  // is a report somebody has to read every day — which on a team this size is nobody. It is kept narrow
  // enough to be verified instead: every page below was opened with the console watched before this shipped.
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // A package-lock.json in the parent home folder would otherwise be picked as the workspace root.
  turbopack: { root: process.cwd() },
  // The development badge sits bottom-left, exactly where the sticky button is on a narrow window, and there is
  // no corner free of it: the bar spans the full width. Compile and runtime errors are still shown.
  devIndicators: false,
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  experimental: {
    // Pictures for the site's photo slots are posted to a Server Action (default limit is 1 MB).
    serverActions: { bodySizeLimit: "6mb" },
    // Two root layouts since the site moved under `[lang]` (0109): an address neither claims is drawn by
    // src/app/global-not-found.tsx.
    globalNotFound: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
