import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Markazi_Text } from "next/font/google";

import { getPublicConfig, settingText } from "@/lib/config";

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

/** Site title and description from settings (spec v2 §5, §53, §59): no investment wording in code. */
export async function generateMetadata(): Promise<Metadata> {
  // Metadata wraps every page, the Back Office included, so a configuration outage must not take them down.
  const config = await getPublicConfig().catch(() => null);
  const text = (key: string, fallback: string) => (config ? settingText(config, key, fallback) : fallback) || fallback;

  const title = text("site.meta_title", "AgriZed · مشروع المليون زيتونة");
  const description = text(
    "site.meta_description",
    "كل واحد فينا ينجم يكون فاعل في مشروع المليون زيتونة حسب مقدرته. اختار قداش زيتونة تحب تبدأ بيهم، وإحنا نرافقوك في الباقي.",
  );

  return {
    title: {
      default: title,
      template: "%s · AgriZed",
    },
    description,
    applicationName: "AgriZed",
    openGraph: {
      type: "website",
      locale: "ar_TN",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${markazi.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
