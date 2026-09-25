import { timingSafeEqual } from "node:crypto";

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

  // A blocked run is a configuration problem the operator must see, not a server fault.
  return Response.json(outcome, { status: outcome.blocked ? 409 : 200 });
}
