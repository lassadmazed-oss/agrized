"use client";

import { ADMIN_LANG_COOKIE, type AdminLang } from "@/lib/admin-lang";

/**
 * «Français» / «عربي». A full reload rather than a refresh: the French screen is a reading of the Arabic one
 * (admin-translator.tsx), and going back to Arabic has to start from the page as the server wrote it.
 * Marked data-no-translate so the word «عربي» stays Arabic on the French screen.
 */
export function AdminLanguageSwitch({ current, className = "" }: { current: AdminLang; className?: string }) {
  const next: AdminLang = current === "fr" ? "ar" : "fr";

  function choose() {
    document.cookie = `${ADMIN_LANG_COOKIE}=${next}; path=/admin; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <button type="button" onClick={choose} lang={next} data-no-translate="" className={className}>
      <span aria-hidden="true">🌐</span> {next === "fr" ? "Français" : "عربي"}
    </button>
  );
}
