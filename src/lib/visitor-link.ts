import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

// «إشعارات الموقع» (0174): the browser that sent a request is the person who sent it, so the follow-up waits for
// them when they come back — without an account, without a message. The cookie holds a random token; the
// database keeps only its SHA-256 next to the person (public.site_visitor_links). The privacy page says so.

export const VISITOR_COOKIE = "agz_v";
const ONE_YEAR = 60 * 60 * 24 * 365;
const TOKEN = /^[0-9a-f]{64}$/;

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * After a successful intake: tie this browser to the person behind the request number. Never throws — a
 * registration that went through must not fail because of its follow-up.
 */
export async function linkVisitor(requestNo: string): Promise<void> {
  try {
    const store = await cookies();
    const existing = store.get(VISITOR_COOKIE)?.value;
    const token = existing && TOKEN.test(existing) ? existing : randomBytes(32).toString("hex");
    const admin = createAdminClient();
    const rpc = (admin as unknown as { rpc: Rpc }).rpc.bind(admin);
    const { data, error } = await rpc("site_visitor_link", { p_token_hash: sha256(token), p_request_no: requestNo });
    if (error || !data) return;
    store.set(VISITOR_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ONE_YEAR,
    });
  } catch (error) {
    console.error("[notices] visitor link failed", error);
  }
}

/** The person this browser registered as, or null. */
export async function visitorPerson(): Promise<string | null> {
  try {
    const token = (await cookies()).get(VISITOR_COOKIE)?.value;
    if (!token || !TOKEN.test(token)) return null;
    const admin = createAdminClient();
    const rpc = (admin as unknown as { rpc: Rpc }).rpc.bind(admin);
    const { data, error } = await rpc("site_visitor_person", { p_token_hash: sha256(token) });
    return error || typeof data !== "string" ? null : data;
  } catch {
    return null;
  }
}
