"use server";

import { revalidatePath } from "next/cache";

import sharp from "sharp";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { publishToMeta, type SocialClaim } from "@/lib/social-meta";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * النشر على الشبكات — the three writes the Back Office screen makes.
 *
 * EVERY ONE OF THEM IS CHECKED TWICE, which is the house rule and not belt and braces: requireStaff here
 * answers «is this person allowed to press the button», and the RPC answers «is this person allowed to do
 * the thing» with app.is_admin() inside a security-definer function. The second is the one that holds if
 * this file is ever called from somewhere new.
 *
 * Composing, approving and cancelling all happen in the database. Meta is called from src/lib/social-meta.ts:
 * here by «انشر الآن», and by the cron at /api/social/publish for every approved post whose day has come
 * (0170, «البرنامج اليومي»). Until a token is connected nothing leaves, and a post approved here reads «مبرمج».
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
  invalid_caption: "اكتب نص المنشور، من 10 حتى 1800 حرف.",
  invalid_date: "اختار نهار وساعة صحاح.",
  date_in_past: "النهار هذا فات. اختار نهار من اليوم ولقدّام.",
  invalid_image: "الصورة ما تحمّلتش. عاود حمّلها.",
  invalid_story: "الحكاية هذي ما عادش موجودة. اختار وحدة من القائمة.",
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

  const claim = data as SocialClaim;
  if (!claim || claim.error) {
    revalidatePath("/admin/marketing");
    return refuse(claim?.error ?? "not_publishable");
  }

  const result = await publishToMeta(claim);
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

/* ---------------------------------------------------------------------------
 * «البرنامج اليومي» (0170): a post on a day, for every enabled network
 * ------------------------------------------------------------------------- */

const SOCIAL_BUCKET = "social-media";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * A photograph as Meta takes it: JPEG (Instagram publishes nothing else), turned the way the camera held it,
 * 1080 wide, and cropped only when Instagram would refuse its shape — taller than 4:5 or wider than 1.91:1.
 */
async function socialJpeg(file: File): Promise<Buffer> {
  const input = Buffer.from(await file.arrayBuffer());
  const { width = 0, height = 0, orientation = 1 } = await sharp(input).metadata();
  if (!width || !height) throw new Error("not_an_image");
  // A phone photo held upright is stored sideways with an EXIF turn (5–8); `rotate()` applies it, so its ratio
  // is read the way it will be seen.
  const ratio = orientation >= 5 ? height / width : width / height;
  const image = sharp(input).rotate();
  const resized =
    ratio < 0.8
      ? image.resize(1080, 1350, { fit: "cover", position: "attention" })
      : ratio > 1.91
        ? image.resize(1080, 566, { fit: "cover", position: "attention" })
        : image.resize({ width: 1080, withoutEnlargement: true });
  return resized.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/** «برمج منشور»: the day, the hour, the words, the story it links to and a photograph. */
export async function planPost(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const field = (name: string) => String(formData.get(name) ?? "").trim();

  let path: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_UPLOAD_BYTES) return { ok: false, message: "الصورة أكبر من 15 ميغا. صغّرها ومن بعد عاود." };
    let jpeg: Buffer;
    try {
      jpeg = await socialJpeg(photo);
    } catch {
      return { ok: false, message: "الملف هذا موش صورة نقراوها. حمّل JPG ولا PNG ولا WEBP." };
    }
    path = `calendar/${field("date") || "undated"}-${Date.now()}.jpg`;
    const { error: uploadError } = await createAdminClient()
      .storage.from(SOCIAL_BUCKET)
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
    if (uploadError) {
      console.error("social photo upload failed", uploadError);
      return { ok: false, message: "الصورة ما تحمّلتش. ثبّت في الإنترنت وعاود." };
    }
  }

  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const { data, error } = await rpc("staff_social_plan", {
    p: {
      date: field("date"),
      time: field("time"),
      caption: field("caption"),
      story_code: field("story_code") || null,
      image_url: path ? `${publicEnv.supabaseUrl}/storage/v1/object/public/${SOCIAL_BUCKET}/${path}` : null,
    },
  });
  if (error) {
    if (path) await createAdminClient().storage.from(SOCIAL_BUCKET).remove([path]);
    return refuse(error.message);
  }

  const row = (data ?? {}) as { made?: { network: string }[]; skipped?: { network: string; reason: string }[]; status?: string };
  revalidatePath("/admin/marketing");
  const made = row.made?.length ?? 0;
  const noPhoto = row.skipped?.some((skip) => skip.reason === "instagram_needs_image");
  const parts = [
    made > 0 ? `تبرمج على ${made === 1 ? "شبكة وحدة" : `${made} شبكات`}` : "ما تبرمج حتى منشور",
    row.status === "pending_approval" ? "يستنّى موافقتك" : "يخرج وحدو في نهارو",
  ];
  if (noPhoto) parts.push("إنستغرام يلزمو صورة");
  return { ok: made > 0, message: `${parts.join(" · ")}.` };
}

/** «وافق على الكل»: every post waiting for approval, approved by this administrator, one by one. */
export async function approveAll(): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const { data, error } = await rpc("staff_social_queue", { p_status: "pending_approval", p_limit: 500 });
  if (error) return refuse(error.message);

  let approved = 0;
  for (const post of (data ?? []) as { id: string }[]) {
    const { error: decideError } = await rpc("staff_social_decide", { p_post: post.id, p_action: "approve", p_reason: "approve_all" });
    if (!decideError) approved += 1;
  }
  revalidatePath("/admin/marketing");
  return { ok: true, message: approved > 0 ? `توافق على ${approved} منشور.` : "ما فمّا حتى منشور يستنّى." };
}
