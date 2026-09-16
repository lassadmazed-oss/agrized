import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation is used by the landowner form ("I am on the property now").
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
];

// Pictures uploaded to the public `site-media` bucket (MED-01) are served from the Supabase host.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

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
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
