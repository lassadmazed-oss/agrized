import { timingSafeEqual } from "node:crypto";

import { dispatchCampaigns, dispatchPush } from "@/lib/push";
import { dispatchNotifications } from "@/lib/sms";

/**
 * Drains the message queue. Meant for a scheduler (Vercel Cron, or any job runner) that calls it every few
 * minutes; running it twice at once is safe, because a claimed message is handed to one run only.
 *
 * The caller proves itself with NOTIFY_DISPATCH_SECRET, either as `Authorization: Bearer <secret>` or as the
 * `x-dispatch-secret` header. No secret configured means no endpoint: it answers 503 rather than running open.
 */

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.NOTIFY_DISPATCH_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const provided = bearer ?? request.headers.get("x-dispatch-secret");
  if (!provided) return false;

  // Compare in constant time so the endpoint does not leak the secret one character at a time.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.NOTIFY_DISPATCH_SECRET) {
    return Response.json(
      { error: "لم يُضبط NOTIFY_DISPATCH_SECRET. زيدو في ملف البيئة باش تنجم تشغّل الإرسال." },
      { status: 503 },
    );
  }

  if (!authorized(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : Number.NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : undefined;

  const outcome = await dispatchNotifications(limit);

  /*
   * The push side of the same queue, drained in the same run.
   *
   * Sequential rather than parallel, and that is deliberate: both dispatchers call
   * release_stuck_notifications first, and two of those racing would each hand the other's in-flight rows
   * back to the queue. The two claims then take different channels (0139), so nothing is claimed twice.
   *
   * A push failure must never make an SMS run look failed. They are reported side by side and the status
   * follows the SMS outcome, which is the one that can be blocked by a missing provider key.
   */
  const push = await dispatchPush(limit);

  // The notifications the owner wrote by hand (0152), which are the ones with a time on them: «send this at
  // nine» is only ever kept by a run like this one. Last, and never able to fail the others.
  const campaigns = await dispatchCampaigns();

  // A blocked run is a configuration problem the operator must see, not a server fault.
  return Response.json({ ...outcome, push, campaigns }, { status: outcome.blocked ? 409 : 200 });
}
