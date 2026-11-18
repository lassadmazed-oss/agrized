import { currentClient } from "@/lib/client-auth";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { parseNotices, type NoticesAnswer } from "@/lib/site-notices";
import { createAdminClient } from "@/lib/supabase/admin";
import { visitorPerson } from "@/lib/visitor-link";

/**
 * «إشعارات الموقع» (0174) for whoever opened the page: the notices for everyone, and — for a signed-in client or a
 * browser that registered — their own follow-up. Read by the bell after the page has loaded, so every page keeps
 * its static cache and only this small answer is personal (and never cached).
 */

export const dynamic = "force-dynamic";

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const PRIVATE = { "Cache-Control": "private, no-store" };
const ID = /^[0-9a-f-]{36}$/;

async function personOfRequest(): Promise<string | null> {
  const client = await currentClient().catch(() => null);
  return client?.personId ?? (await visitorPerson());
}

export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("locale");
  const locale: Locale = (LOCALES as readonly string[]).includes(asked ?? "") ? (asked as Locale) : "ar";
  const person = await personOfRequest();

  const admin = createAdminClient();
  const rpc = (admin as unknown as { rpc: Rpc }).rpc.bind(admin);
  const { data, error } = await rpc("site_notices_for", { p_person: person, p_locale: locale });
  if (error) {
    console.error("[notices] list failed", error.message);
    return Response.json({ personal: false, notices: [] } satisfies NoticesAnswer, { headers: PRIVATE });
  }
  return Response.json({ personal: person !== null, notices: parseNotices(data) } satisfies NoticesAnswer, { headers: PRIVATE });
}

/** Read or dismissed, for a known person. A browser without one keeps its own list and never calls this. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null;
  const id = typeof body?.id === "string" && ID.test(body.id) ? body.id : null;
  const action = body?.action === "dismiss" ? "dismiss" : body?.action === "read" ? "read" : null;
  if (!id || !action) return new Response(null, { status: 400, headers: PRIVATE });

  const person = await personOfRequest();
  if (!person) return new Response(null, { status: 204, headers: PRIVATE });

  const admin = createAdminClient();
  const rpc = (admin as unknown as { rpc: Rpc }).rpc.bind(admin);
  const { error } = await rpc("site_notice_mark", { p_person: person, p_notice: id, p_action: action });
  if (error) console.error("[notices] mark failed", error.message);
  return new Response(null, { status: 204, headers: PRIVATE });
}
