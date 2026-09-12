import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { auditHeaders } from "@/lib/request-context";

/** AUD-03: sign-ins and failed attempts go to the append-only audit log. */
export async function logAuthEvent(
  action: "auth.login" | "auth.login_failed" | "auth.login_denied" | "auth.logout",
  requestHeaders: Headers,
  details: { userId?: string | null; email?: string | null },
) {
  const context = auditHeaders(requestHeaders);
  const { error } = await createAdminClient().from("audit_logs").insert({
    action,
    entity: "auth",
    entity_id: details.userId ?? null,
    actor_id: details.userId ?? null,
    new_data: details.email ? { email: details.email } : null,
    ip: context["x-client-ip"] ?? null,
    user_agent: context["x-client-ua"] ?? null,
  });
  if (error) {
    console.error("Could not write auth audit event", error);
  }
}
