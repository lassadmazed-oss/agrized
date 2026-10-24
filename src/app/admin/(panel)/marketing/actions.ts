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
  invalid_network: "الشبكة هذي موش معروفة.",
  empty_token: "اكتب التوكان.",
  no_token: "ما فمّاش توكان مربوط لهالشبكة.",
  not_publishable: "المنشور هذا ماهوش جاهز للنشر (لازم يتوافق عليه، وما يكونش وفّى محاولاتو).",
  instagram_needs_image: "إنستغرام يلزمو صورة، والعرض هذا ما عندوش كوفر.",
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

/* ---------------------------------------------------------------------------
 * Connecting an account, and publishing one post
 * ------------------------------------------------------------------------- */

export type TokenResult = { ok: true } | { ok: false; message: string };

/**
 * An administrator pastes a Page access token in.
 *
 * THE TOKEN IS NEVER LOGGED, NEVER ECHOED AND NEVER RETURNED. The RPC answers that it worked and nothing
 * else, and this function throws nothing that could carry it: a value that reaches a server log, a browser
 * network tab or an error report is a value that has left the building.
 */
export async function setToken(input: {
  network: "facebook" | "instagram";
  externalId: string;
  token: string;
  displayName?: string;
}): Promise<TokenResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

  const { error } = await rpc("staff_social_set_token", {
    p_network: input.network,
    p_external_id: input.externalId.trim(),
    p_token: input.token.trim(),
    p_display_name: input.displayName?.trim() || null,
  });
  if (error) return refuse(error.message);

  revalidatePath("/admin/marketing");
  return { ok: true };
}

const GRAPH = "https://graph.facebook.com/v21.0";

type Claim = {
  id: string;
  network: "facebook" | "instagram";
  caption: string;
  image_url: string | null;
  link_url: string | null;
  page_id: string;
  access_token: string;
  error?: string;
};

/** What Meta answered, reduced to the two things worth writing down. */
async function callMeta(claim: Claim): Promise<{ ok: true; id: string; permalink: string } | { ok: false; error: string }> {
  const body = (fields: Record<string, string>) =>
    ({ method: "POST", body: new URLSearchParams({ ...fields, access_token: claim.access_token }) }) as RequestInit;

  try {
    if (claim.network === "facebook") {
      // A picture when there is one — a photo post is what gets seen — and a plain link post when there is
      // not. Both are one call; neither invents an image.
      const response = claim.image_url
        ? await fetch(`${GRAPH}/${claim.page_id}/photos`, body({ url: claim.image_url, caption: claim.caption }))
        : await fetch(
            `${GRAPH}/${claim.page_id}/feed`,
            body(claim.link_url ? { message: claim.caption, link: claim.link_url } : { message: claim.caption }),
          );
      const json = (await response.json()) as { id?: string; post_id?: string; error?: { message?: string } };
      if (!response.ok || json.error) return { ok: false, error: json.error?.message ?? `HTTP ${response.status}` };
      const id = json.post_id ?? json.id ?? "";
      return { ok: true, id, permalink: id ? `https://www.facebook.com/${id}` : "" };
    }

    // Instagram publishes in two steps: a container, then the publish. There is no picture-less post on
    // Instagram, so an offer with no cover is refused here rather than sent and rejected by Meta.
    if (!claim.image_url) return { ok: false, error: "instagram_needs_image" };

    const container = await fetch(
      `${GRAPH}/${claim.page_id}/media`,
      body({ image_url: claim.image_url, caption: claim.caption }),
    );
    const containerJson = (await container.json()) as { id?: string; error?: { message?: string } };
    if (!container.ok || containerJson.error || !containerJson.id) {
      return { ok: false, error: containerJson.error?.message ?? `HTTP ${container.status}` };
    }

    const published = await fetch(`${GRAPH}/${claim.page_id}/media_publish`, body({ creation_id: containerJson.id }));
    const publishedJson = (await published.json()) as { id?: string; error?: { message?: string } };
    if (!published.ok || publishedJson.error || !publishedJson.id) {
      return { ok: false, error: publishedJson.error?.message ?? `HTTP ${published.status}` };
    }
    return { ok: true, id: publishedJson.id, permalink: `https://www.instagram.com/p/${publishedJson.id}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "network" };
  }
}

export type PublishResult = { ok: true; permalink: string } | { ok: false; message: string };

/**
 * «انشر الآن» — one approved post, out.
 *
 * THREE STEPS AND NOT ONE, because the middle one is a network call that can hang. The claim marks the row
 * `publishing` and counts the attempt; the call happens outside any transaction; the result is written
 * back. A single database function holding a transaction open across a request to Meta would hold a lock
 * for as long as Facebook felt like taking.
 *
 * AND THE RESULT IS ALWAYS WRITTEN. A post left in `publishing` because the server gave up in the middle is
 * the one state nobody can act on: it has not failed, so it will not retry, and it has not published, so
 * nothing is on the page.
 */
export async function publishNow(postId: string): Promise<PublishResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

  const { data, error } = await rpc("staff_social_publish_claim", { p_post: postId });
  if (error) return refuse(error.message);

  const claim = data as Claim;
  if (!claim || claim.error) {
    revalidatePath("/admin/marketing");
    return refuse(claim?.error ?? "not_publishable");
  }

  const result = await callMeta(claim);
  await rpc("staff_social_publish_result", {
    p_post: postId,
    p_ok: result.ok,
    p_post_id: result.ok ? result.id : null,
    p_permalink: result.ok ? result.permalink : null,
    p_error: result.ok ? null : result.error,
  });

  revalidatePath("/admin/marketing");
  return result.ok ? { ok: true, permalink: result.permalink } : { ok: false, message: result.error };
}
