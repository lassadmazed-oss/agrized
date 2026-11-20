// The Back Office's two languages (owner, 2026-11-20: «حتى الادمين خليه عربي وفرنسي»).
//
// Arabic is the language the Back Office is written in. French is a reading of it, chosen per browser with the
// switch at the foot of the rail; src/components/admin/admin-translator.tsx does the reading from
// src/app/admin/i18n/fr.json. The choice is a cookie scoped to /admin, so the public site never sees it.

export const ADMIN_LANG_COOKIE = "agz_admin_lang";

export type AdminLang = "ar" | "fr";

export function parseAdminLang(value: string | undefined | null): AdminLang {
  return value === "fr" ? "fr" : "ar";
}
