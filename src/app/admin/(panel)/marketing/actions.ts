"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/*
 * النشر على الشبكات — the three writes the Back Office screen makes.
 *
 * EVERY ONE OF THEM IS CHECKED TWICE, which is the house rule and not belt and braces: requireStaff here
 * answers «is this person allowed to press the button», and the RPC answers «is this person allowed to do
 * the thing» with app.is_admin() inside a security-definer function. The second is the one that holds if
 * this file is ever called from somewhere new.
 *
 * NOTHING HERE TALKS TO META. Composing, approving and cancelling all happen in the database; publishing is
 * a separate job that does not exist yet, because the permissions to do it do not exist yet (0157's header).
 * That is why a post approved on this screen reads «مبرمج» and not «منشور».
 */

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** The reasons the database refuses, in the owner's Arabic. Anything else is reported as itself. */
const MESSAGES: Record<string, string> = {
  not_admin: "الصلاحية هذي للإدارة وحدها.",
  not_staff: "الصلاحية هذي لفريق AgriZed.",
  offer_not_publishable: "العرض هذا ماهوش منشور، فما ينجّمش يتعلن عليه.",
  already_published: "المنشور هذا خرج على الصفحة، فما ينجّمش يتبدّل من هوني.",
  post_not_found: "المنشور هذا ما عادش موجود.",
  invalid_action: "طلب موش مفهوم.",
};

function refuse(message: string): { ok: false; message: string } {
  return { ok: false, message: MESSAGES[message] ?? message };
}

export type CampaignResult =
  | { ok: true; made: number; already: number; skipped: { network: string; reason: string }[]; status: string }
  | { ok: false; message: string };

/** «Créer une campagne» — one offer in, one reviewable post per enabled network out. Publishes nothing. */
export async function createCampaign(projectId: string, locale = "ar"): Promise<CampaignResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

  const { data, error } = await rpc("staff_social_campaign", { p_project: projectId, p_locale: locale });
  if (error) return refuse(error.message);

  const row = (data ?? {}) as {
    made?: unknown[];
    already?: unknown[];
    skipped?: { network: string; reason: string }[];
    status?: string;
  };
  revalidatePath("/admin/marketing");
  return {
    ok: true,
    made: row.made?.length ?? 0,
    already: row.already?.length ?? 0,
    skipped: row.skipped ?? [],
    status: row.status ?? "pending_approval",
  };
}

export type DecideResult = { ok: true; status: string } | { ok: false; message: string };

/** Approve a queued post, or cancel it. §7 keeps this to administrators and records who and when. */
export async function decidePost(postId: string, action: "approve" | "cancel", reason?: string): Promise<DecideResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

  const { data, error } = await rpc("staff_social_decide", {
    p_post: postId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) return refuse(error.message);

  revalidatePath("/admin/marketing");
  return { ok: true, status: String((data as { status?: unknown } | null)?.status ?? "") };
}
