import type { MetadataRoute } from "next";

import { getPublicConfig, settingText } from "@/lib/config";

/**
 * /manifest.webmanifest — what a phone saves when «أضف إلى الشاشة الرئيسية» is tapped.
 *
 * THE NAME AND THE SENTENCE ARE THE OWNER'S, not the code's: they are the same `site.meta_*` settings the page
 * title and the share card already read, so renaming the site in the Back Office renames the installed app too.
 * The fallbacks are there for one reason only — a manifest must never fail to render, or the install prompt
 * disappears on a configuration outage.
 *
 * ARABIC AT THE ROOT. `lang: "ar"` and `dir: "rtl"` describe the app the way it opens: `/` is Arabic (the proxy
 * rewrites it to /ar), and that is the address `start_url` points at. The four other languages are the same
 * app, reached from inside it; a manifest describes one entry point, not five.
 *
 * `theme_color` matches the `themeColor` in the layout's viewport, so the status bar on an installed Android app
 * is the same green as the bar at the top of the site.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const config = await getPublicConfig("ar").catch(() => null);
  const text = (key: string, fallback: string) =>
    (config ? settingText(config, key, fallback) : fallback) || fallback;

  return {
    name: text("site.meta_title", "AgriZed"),
    short_name: "AgriZed",
    description: text("site.meta_description", ""),
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffffa",
    theme_color: "#1f4a2c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Cropped to the launcher's own shape; its emblem sits inside the safe circle (scripts/brand-icons.mjs).
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
