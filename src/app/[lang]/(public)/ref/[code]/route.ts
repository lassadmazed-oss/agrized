// /ref/<code> — a client's referral link (0136). The visitor lands on the home page in their language; the code
// is kept in a cookie for referral.cookie_days, and the first request they send carries it to the database.
//
// First link wins: a cookie already holding a code is not replaced, so a later link cannot take a visitor away
// from the client who brought them. Nothing is kept while the module is off, nor for a code nobody holds.

import { NextResponse } from "next/server";

import { flagState, getPublicConfig, settingInt } from "@/lib/config";
import { isLocale, localePath, DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { normalizeReferralCode, REFERRAL_COOKIE } from "@/lib/referral";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/[lang]/ref/[code]">) {
  const { lang, code } = await context.params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  // The query travels on (`?ref=whatsapp` from the share chooser), so the home page records the channel too.
  const target = new URL(localePath(locale, "/"), request.url);
  target.search = new URL(request.url).search;
  const response = NextResponse.redirect(target, 307);

  const clean = normalizeReferralCode(code);
  if (!clean) return response;

  const config = await getPublicConfig(locale);
  if (flagState(config, "referrals") === "disabled") return response;

  const held = request.headers.get("cookie")?.split(/;\s*/).some((part) => part.startsWith(`${REFERRAL_COOKIE}=`));
  if (held) return response;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("referral_code_exists", { p_code: clean });
  if (error) {
    console.error("referral_code_exists failed", error);
    return response;
  }
  if (data === true) {
    const days = settingInt(config, "referral.cookie_days", 0);
    if (days > 0) {
      response.cookies.set(REFERRAL_COOKIE, clean, {
        path: "/",
        maxAge: days * 24 * 60 * 60,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });
    }
  }
  return response;
}
