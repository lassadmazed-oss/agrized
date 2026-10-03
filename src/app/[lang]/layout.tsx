import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { NavigationVeil } from "@/components/site/navigation-veil";
import { formatUnits, getPublicConfig, pickTexts, settingText, t } from "@/lib/config";
import { TextProvider } from "@/lib/i18n/client";
import { isLocale, LOCALE_DIR, LOCALES, OG_LOCALE } from "@/lib/i18n/locales";
import { SITE_ORIGIN } from "@/lib/site-origin";

import { markazi, plexArabic } from "../fonts";

import "../globals.css";

/**
 * THE SITE'S ROOT, ONE PER LANGUAGE (0109, owner 2026-10-03). Every public page lives under `[lang]`: the
 * proxy (src/proxy.ts) rewrites an unprefixed address to `/ar/…`, so `/projects` is Arabic as it always was and
 * `/fr/projects` is French. Being the root layout is what lets `<html lang dir>` be right in the first byte —
 * Arabic right to left, the four others left to right — and what makes `lang` a root parameter that any Server
 * Component can read (src/lib/i18n/server.ts) without it being passed down.
 *
 * The Back Office is NOT under here: it has its own root layout (src/app/admin/layout.tsx), Arabic only.
 */

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// Five languages and no sixth: any other first segment never reaches here (the proxy treats it as an Arabic
// path), and this closes the door on a hand-typed one.
export const dynamicParams = false;

/** Site title and description from settings (spec v2 §5, §53, §59): no investment wording in code. */
export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  // Metadata wraps every page, so a configuration outage must not take them down.
  const config = await getPublicConfig(lang).catch(() => null);
  const text = (key: string, fallback: string) => (config ? settingText(config, key, fallback) : fallback) || fallback;

  const title = text("site.meta_title", "AgriZed");
  const description = text("site.meta_description", "");

  return {
    // Absolute addresses for everything a scraper reads, without a single one being written out: the share card
    // (src/app/opengraph-image.png) and the icons are file conventions, and Next composes them onto this base.
    // Without it they would be built from VERCEL_URL — the deployment's own agrized-xxxx.vercel.app address —
    // and every link preview in the wild would point at a deployment instead of at the site.
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      default: title,
      template: "%s · AgriZed",
    },
    description,
    applicationName: "AgriZed",
    // src/app/manifest.ts. Next serves that route, but it does not declare it; the install prompt only appears
    // on a page that links to it.
    manifest: "/manifest.webmanifest",
    // «أضف إلى الشاشة الرئيسية» on an iPhone: opened from the home screen it runs without Safari's chrome,
    // under this name. Android reads the same intent from the manifest's `display`.
    appleWebApp: { capable: true, title: "AgriZed", statusBarStyle: "default" },
    twitter: { card: "summary_large_image", title, description },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[lang],
      alternateLocale: (config?.locales ?? []).filter((choice) => choice.code !== lang).map((choice) => OG_LOCALE[choice.code]),
      siteName: "AgriZed",
      title,
      description,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#1f4a2c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const config = await getPublicConfig(lang);

  return (
    <html lang={lang} dir={LOCALE_DIR[lang]} className={`${plexArabic.variable} ${markazi.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        {/* The language, the units a figure is followed by, and the few words every screen shares — for the
            Client Components. A page adds its own words with <Texts prefixes>. The error screen's words ride
            here too: (public)/error.tsx is a client boundary that replaces the page, so no page can hand them
            to it. */}
        <TextProvider locale={lang} units={formatUnits(config)} texts={pickTexts(config, ["ui.common.", "ui.pages.error_", "ui.pages.back_home"])}>
          {children}
          {/* Inside a Suspense boundary because it reads the query string: without one, every prerendered
              route above it would be pulled into client rendering just to host a component that draws
              nothing until a click. */}
          <Suspense fallback={null}>
            <NavigationVeil label={t(config, "ui.common.loading")} />
          </Suspense>
        </TextProvider>
      </body>
    </html>
  );
}
