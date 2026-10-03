import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { flagState, getPublicConfig } from "@/lib/config";
import { LOCALES, localePath, type Locale } from "@/lib/i18n/locales";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Every public page in every language the owner has switched on (0109), each entry naming its translations so
 * a search engine files /fr/projects as the French /projects rather than as a second page saying the same
 * thing. Pages behind a closed module are left out, as the site leaves them out of its own navigation.
 *
 * The client's space and the tracking page are deliberately absent: one is behind a sign-in, the other is a
 * form whose answer depends on a number only its owner holds — neither is something to find by searching.
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") ?? "www.agrized.site";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const config = await getPublicConfig("ar");
  const enabled = config.locales.map((choice) => choice.code).filter((code): code is Locale => LOCALES.includes(code));

  const paths = ["/"];
  if (flagState(config, "projects") === "public") paths.push("/projects", "/projects/map");
  if (flagState(config, "interest_form") === "public") paths.push("/start");
  if (flagState(config, "land_offers") === "public") paths.push("/land");

  if (flagState(config, "projects") === "public") {
    const { data } = await createPublicClient().rpc("public_projects");
    for (const project of data ?? []) paths.push(`/projects/${encodeURIComponent(project.code)}`);
  }

  return paths.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path.startsWith("/projects/") ? "weekly" : "daily",
    priority: path === "/" ? 1 : path.startsWith("/projects") ? 0.8 : 0.6,
    alternates: {
      languages: Object.fromEntries([
        ...enabled.map((code) => [code, `${origin}${localePath(code, path)}`]),
        ["x-default", `${origin}${path}`],
      ]),
    },
  }));
}
