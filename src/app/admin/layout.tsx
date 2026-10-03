import { Suspense } from "react";
import type { Metadata, Viewport } from "next";

import { NavigationVeil } from "@/components/site/navigation-veil";

import { markazi, plexArabic } from "../fonts";

import "../globals.css";

/**
 * The Back Office's own root (0109). The public site moved under `[lang]` to speak five languages; the team's
 * tools stay in Arabic, right to left, at /admin — which is why this is a second root layout rather than a
 * page of the first. Navigating between the two is a full page load, which they always were in practice.
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

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${markazi.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        {children}
        <Suspense fallback={null}>
          <NavigationVeil label="جارٍ التحميل…" />
        </Suspense>
      </body>
    </html>
  );
}
