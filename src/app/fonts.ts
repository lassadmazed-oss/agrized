import { IBM_Plex_Sans_Arabic, Markazi_Text } from "next/font/google";

/**
 * The two faces of the site, shared by its two root layouts (the site under `[lang]`, the Back Office under
 * `admin`). Both carry a Latin subset, which is what the French, German, Italian and English pages are set in:
 * one family across the five languages, so switching language changes the words and not the look.
 */
export const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const markazi = Markazi_Text({
  variable: "--font-markazi",
  subsets: ["arabic", "latin"],
  display: "swap",
});
