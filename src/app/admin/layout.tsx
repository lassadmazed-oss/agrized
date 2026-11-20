import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { AdminTranslator } from "@/components/admin/admin-translator";
import { NavigationVeil } from "@/components/site/navigation-veil";
import { ADMIN_LANG_COOKIE, parseAdminLang } from "@/lib/admin-lang";

import { markazi, plexArabic } from "../fonts";

import "../globals.css";

/**
 * The Back Office's own root (0109). The public site moved under `[lang]` to speak five languages; the team's
 * tools stay in Arabic, right to left, at /admin — which is why this is a second root layout rather than a
 * page of the first. Navigating between the two is a full page load, which they always were in practice.
 *
 * 2026-11-20 (owner: «حتى الادمين خليه عربي وفرنسي»): a reader may choose French with the switch at the foot of
 * the rail. The page is still written in Arabic; in French it is laid out left to right and read through
 * src/app/admin/i18n/fr.json by AdminTranslator, the body kept hidden until that first reading is done
 * (globals.css, html[data-translating]) so nobody sees the Arabic flash.
 */

export const metadata: Metadata = {
  title: { default: "AgriZed · الإدارة", template: "%s · AgriZed" },
  applicationName: "AgriZed",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1f4a2c",
  width: "device-width",
  initialScale: 1,
};

export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  const lang = parseAdminLang((await cookies()).get(ADMIN_LANG_COOKIE)?.value);
  const french = lang === "fr";
  return (
    <html
      lang={lang}
      dir={french ? "ltr" : "rtl"}
      data-translating={french ? "" : undefined}
      className={`${plexArabic.variable} ${markazi.variable}`}
    >
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        {children}
        {french ? <AdminTranslator /> : null}
        <Suspense fallback={null}>
          <NavigationVeil label="جارٍ التحميل…" />
        </Suspense>
      </body>
    </html>
  );
}
