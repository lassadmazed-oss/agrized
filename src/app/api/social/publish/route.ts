import { timingSafeEqual } from "node:crypto";

import { publishToMeta, type SocialClaim } from "@/lib/social-meta";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * «البرنامج اليومي» (0170): every approved post whose day has come goes out, with nobody pressing anything.
 *
 * Vercel Cron calls this every quarter of an hour (vercel.json) with `Authorization: Bearer <CRON_SECRET>`; no
 * secret configured means no endpoint. The database decides what is due — approved (§7), its time come, its
 * network under social.max_per_day, a token connected — and this route only carries each post to Meta and the
 * answer back. Two runs at once are safe: a claimed row is `publishing` and the next claim skips it.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "لم يُضبط CRON_SECRET. زيدو في إعدادات Vercel باش النشر المبرمج يخدم." }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

  const { data, error } = await rpc("cron_social_claim_due", { p_limit: 5 });
  if (error) {
    console.error("[social] claim failed", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const claims = (Array.isArray(data) ? data : []) as SocialClaim[];
  let published = 0;
  let failed = 0;
  for (const claim of claims) {
    const answer = await publishToMeta(claim);
    const { error: writeError } = await rpc("cron_social_result", {
      p_post: claim.id,
      p_ok: answer.ok,
      p_post_id: answer.ok ? answer.id : null,
      p_permalink: answer.ok ? answer.permalink : null,
      p_error: answer.ok ? null : answer.error,
    });
    if (writeError) console.error("[social] result not written", claim.id, writeError.message);
    if (answer.ok) published += 1;
    else {
      failed += 1;
      console.warn(`[social] ${claim.network} post ${claim.id} failed: ${answer.error}`);
    }
  }

  return Response.json({ claimed: claims.length, published, failed });
}
