import type { Metadata } from "next";
import Link from "next/link";

import { markazi, plexArabic } from "./fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "404 · AgriZed",
  robots: { index: false, follow: false },
};

/**
 * The 404 for an address no root layout claims (0109). Since the site moved under `[lang]` there are two root
 * layouts — the site and the Back Office — and no single one to draw a lost page in, so Next renders this file
 * on its own (experimental.globalNotFound, next.config.ts).
 *
 * It is the rare case. Every public path is rewritten by the proxy into `[lang]`, where a catch-all throws
 * notFound() inside the site's shell and the visitor gets the full, translated page
 * (src/app/[lang]/(public)/[...missing]/page.tsx). What lands here is a mistyped Back Office address or a
 * stale asset: Arabic, with the five languages' word for home, since nothing here knows which one was meant.
 */
export default function GlobalNotFound() {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${markazi.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
          <p className="font-display text-7xl font-bold text-leaf sm:text-8xl" dir="ltr">
            404
          </p>
          <nav className="mt-8 flex flex-wrap justify-center gap-3" aria-label="AgriZed">
            <Link href="/" className="btn btn-primary">
              الصفحة الرئيسية
            </Link>
            <Link href="/fr" lang="fr" dir="ltr" className="btn btn-secondary">
              Accueil
            </Link>
            <Link href="/de" lang="de" dir="ltr" className="btn btn-secondary">
              Startseite
            </Link>
            <Link href="/it" lang="it" dir="ltr" className="btn btn-secondary">
              Home page
            </Link>
            <Link href="/en" lang="en" dir="ltr" className="btn btn-secondary">
              Home
            </Link>
          </nav>
        </main>
      </body>
    </html>
  );
}
