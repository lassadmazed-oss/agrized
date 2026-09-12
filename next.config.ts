import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation is used by the landowner form ("I am on the property now").
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
];

const nextConfig: NextConfig = {
  // A package-lock.json in the parent home folder would otherwise be picked as the workspace root.
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
