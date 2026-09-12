import "server-only";

import { createHash } from "node:crypto";

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

/**
 * Headers forwarded to Supabase so database audit triggers can record the visitor's IP and
 * browser (see app.write_audit). Informational only, never used for access control.
 */
export function auditHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const ip = clientIp(headers);
  if (ip) result["x-client-ip"] = ip.slice(0, 64);
  const userAgent = headers.get("user-agent");
  if (userAgent) result["x-client-ua"] = userAgent.replace(/[^\x20-\x7E]/g, "").slice(0, 300);
  return result;
}

/** Salted hash so anti-spam throttling never stores raw IP addresses. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    throw new Error("Missing environment variable IP_HASH_SALT. Add it to .env.");
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
