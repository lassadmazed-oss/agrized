import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Markazi_Text } from "next/font/google";

import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const markazi = Markazi_Text({
  variable: "--font-markazi",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const description =
  "AgriZed منصة تونسية تسهّل الاستثمار في الزيتون والأراضي الفلاحية حسب القدرة المالية لكل شخص. سجّل اهتمامك مجاناً.";

export const metadata: Metadata = {
  title: {
    default: "AgriZed · استثمر في الزيتون حسب قدرتك",
    template: "%s · AgriZed",
  },
  description,
  applicationName: "AgriZed",
  openGraph: {
    type: "website",
    locale: "ar_TN",
    siteName: "AgriZed",
    title: "AgriZed · استثمر في الزيتون حسب قدرتك",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#1f4a2c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${markazi.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
