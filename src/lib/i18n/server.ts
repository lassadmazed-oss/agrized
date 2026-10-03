import "server-only";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { lang } from "next/root-params";

import { DEFAULT_LOCALE, DISPLAY_LOCALE_HEADER, isLocale, LOCALE_HEADER, type Locale } from "./locales";

/**
 * The language the current request is rendered in.
 *
 * In a page, a layout or generateMetadata it is the `[lang]` root segment — free, and it keeps static pages
 * static. Next refuses that getter in a Server Action and in a Route Handler (and it is simply absent in the
 * Back Office, which has no `[lang]`), so there the proxy's request header answers: it is set from the URL on
 * every public request, Server Action POSTs included. Anything else is Arabic.
 */
export async function currentLocale(): Promise<Locale> {
  let fromRoute: unknown;
  try {
    fromRoute = await lang();
  } catch (error) {
    // Next's own control flow (redirect, notFound, a dynamic bail-out) must pass; «not allowed in a Server
    // Action» is the expected case and falls through to the header.
    unstable_rethrow(error);
  }
  if (isLocale(fromRoute)) return fromRoute;
  const fromHeader = (await headers()).get(LOCALE_HEADER);
  return isLocale(fromHeader) ? fromHeader : DEFAULT_LOCALE;
}

/**
 * Headers that tell Supabase which language the visitor is using. Spread into createAdminClient(…) by every
 * public Server Action: the database records it on the person (persons.preferred_locale) so their SMS go out
 * in it. It never changes what a function answers — that is `displayHeaders`.
 */
export function localeHeaders(locale: Locale): Record<string, string> {
  return { [LOCALE_HEADER]: locale };
}

/**
 * Headers for a DISPLAY read: the database answers labels and SMS bodies in this language (app.setting_text,
 * 0109 rule 5). Only for calls whose answer is shown to the visitor or sent to them — never an intake call,
 * which snapshots labels for the staff.
 */
export function displayHeaders(locale: Locale): Record<string, string> {
  return { [LOCALE_HEADER]: locale, [DISPLAY_LOCALE_HEADER]: locale };
}
