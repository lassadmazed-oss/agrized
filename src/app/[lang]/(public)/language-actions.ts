"use server";

import { isLocale } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";

/**
 * A signed-in client chose a language in the selector: it goes on their file (persons.preferred_locale, 0109)
 * so every message after this is written in it. Anybody else: nothing to save — their choice lives in the
 * cookie the selector already wrote. Identity comes from the session inside public.set_my_locale, never from
 * the caller.
 */
export async function rememberLanguage(code: string): Promise<void> {
  if (!isLocale(code)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return;
  const { error } = await supabase.rpc("set_my_locale", { p_locale: code });
  if (error) console.warn(`[language] could not save the client's language: ${error.message}`);
}
