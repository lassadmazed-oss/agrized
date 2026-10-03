import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/** The site is open to search engines; the Back Office and the API are not (0109 added the sitemap). */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "www.agrized.site";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
