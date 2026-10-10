// Parrainage (0136): the link /ref/<code> keeps the code in a cookie, and the intake forms hand it to the
// database with the visitor's request. Whether it attaches, and to whom, is decided there (app.attach_referral):
// only for a person that request created, only while the module is open, never to oneself.

import "server-only";

import { cookies } from "next/headers";

import { flagState, type PublicConfig } from "@/lib/config";
import { SITE_ORIGIN } from "@/lib/site-origin";

/** The cookie that remembers which link brought a visitor. httpOnly: only the server reads it. */
export const REFERRAL_COOKIE = "agrized.ref";

/** Six to twelve characters with no 0/O or 1/I/L — the same alphabet as persons_referral_code_check. */
const CODE = /^[2-9A-HJKMNP-Z]{6,12}$/;

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return CODE.test(code) ? code : null;
}

/** The address a client shares. Unprefixed: the proxy sends each visitor to the language they read. */
export function referralLink(code: string): string {
  return `${SITE_ORIGIN}/ref/${encodeURIComponent(code)}`;
}

/**
 * The intake's `source`, with the referral code read from the cookie and the request's hashed IP (for the
 * duplicate-account alerts). Unchanged when the module is off or no link brought this visitor.
 */
export async function withReferral(
  config: PublicConfig,
  source: Record<string, string>,
  ipHash: string | null,
): Promise<Record<string, string>> {
  if (flagState(config, "referrals") === "disabled") return source;
  const code = normalizeReferralCode((await cookies()).get(REFERRAL_COOKIE)?.value);
  if (!code) return source;
  return { ...source, referral: code, ...(ipHash ? { referral_ip: ipHash } : {}) };
}

// ---------------------------------------------------------------------------
// The client's page: public.my_referral()
// ---------------------------------------------------------------------------

export type MyReferral = {
  ok: true;
  code: string;
  rule: { amounts_millimes: number[]; basis: "tree" | "order"; generations: number };
  people: { generation: number; count: number }[];
  sales_count: number;
  by_generation: { generation: number; pending_millimes: number; validated_millimes: number; paid_millimes: number }[];
  totals: { pending_millimes: number; validated_millimes: number; paid_millimes: number };
  payouts: { reference_no: string; paid_on: string; total_millimes: number; method_label: string | null }[];
};

export type MyReferralResult = MyReferral | { ok: false; reason: "no_session" | "no_person" | "closed" | "error" };

export function parseMyReferral(data: unknown): MyReferralResult {
  if (!data || typeof data !== "object") return { ok: false, reason: "error" };
  const value = data as { ok?: unknown; reason?: unknown };
  if (value.ok === true) return data as MyReferral;
  const reason = value.reason;
  return {
    ok: false,
    reason: reason === "no_session" || reason === "no_person" || reason === "closed" ? reason : "error",
  };
}
