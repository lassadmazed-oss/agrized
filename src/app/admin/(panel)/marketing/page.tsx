import type { Metadata } from "next";

import type { ReactNode } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { RemotePhoto } from "@/components/site/site-photo";
import { EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor, settingText } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

import { approveAll, planPost } from "./actions";
import { CampaignButton, DecideButtons, PublishButton, TokenForm } from "./marketing-actions";

export const metadata: Metadata = { title: "النشر على الشبكات" };

/*
 * النشر على الشبكات — where the owner watches the automation work (2026-10-24: «خلينا نبدأ ونهبطوا حاجات
 * نشوفوا الأوتوماتيزاسيون كيفاش قاعدة تخدم»).
 *
 * WHAT HE CAN WATCH TODAY IS EVERYTHING EXCEPT THE LAST STEP. An offer goes in, the copy comes out for each
 * network with that offer's real figures and a UTM link in it, it waits for his approval, and the queue
 * says what each row is waiting for. Meta cannot answer yet — publishing needs permissions that only
 * business verification and app review can grant (0157's header) — so an approved post reads «مبرمج» and
 * stays there. The day the permissions land, a dispatcher drains the queue and this screen does not change.
 *
 * 2026-11-18, 0170 «البرنامج اليومي» (owner: «نحب تهبط اوتوماتيك … يوم بيوم … على الانستغرام وعلى الفيسبوك»):
 * «برمج منشور» puts a photograph and a caption on a day; it waits for «وافق» like everything else, then the
 * cron at /api/social/publish takes it out on its day with nobody pressing anything.
 *
 * THE TOKEN IS NOT ON THIS PAGE, and cannot be: the accounts are read through staff_social_accounts, which
 * returns every column except that one and a has_token flag in its place. The table itself is
 * administrator-only for the same reason.
 */

type Account = {
  id: string;
  network: string;
  external_id: string;
  display_name: string | null;
  is_enabled: boolean;
  token_expires_at: string | null;
  has_token: boolean;
};

type Post = {
  id: string;
  network: string;
  status: string;
  caption: string;
  image_url: string | null;
  link_url: string | null;
  attempts: number;
  last_error: string | null;
  permalink: string | null;
  created_at: string;
  event: string;
  /** When it goes out (0170); null on an offer's post, which goes out from its approval. */
  scheduled_for: string | null;
  project_code: string | null;
  project_name: string | null;
};

/** The day a post is meant for: its own, or — for an offer's post with none — the moment it was made. */
const when = (post: Post) => post.scheduled_for ?? post.created_at;
const byDay = (a: Post, b: Post) => when(a).localeCompare(when(b));

const NETWORK: Record<string, string> = { facebook: "فايسبوك", instagram: "إنستغرام" };

const STATUS: Record<string, { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  draft: { label: "مسودّة", tone: "neutral" },
  pending_approval: { label: "تستنّى المصادقة", tone: "warning" },
  scheduled: { label: "مبرمج", tone: "info" },
  publishing: { label: "قيد النشر", tone: "info" },
  published: { label: "منشور", tone: "success" },
  failed: { label: "فشل", tone: "danger" },
  cancelled: { label: "ملغي", tone: "neutral" },
};

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

export default async function MarketingPage() {
  await requireStaff(ADMIN_ROLES);
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "social");

  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

  const [accountsRow, queueRow, offers] = await Promise.all([
    rpc("staff_social_accounts"),
    rpc("staff_social_queue", { p_status: null, p_limit: 300 }),
    supabase.from("projects").select("id, code, name").eq("status", "published").order("created_at", { ascending: false }),
  ]);

  const accounts = (accountsRow.data ?? []) as Account[];
  const posts = (queueRow.data ?? []) as Post[];
  const waiting = posts.filter((post) => post.status === "pending_approval").sort(byDay);
  const planned = posts.filter((post) => ["scheduled", "publishing", "failed"].includes(post.status)).sort(byDay);
  const done = posts.filter((post) => ["published", "cancelled", "draft"].includes(post.status));
  const stories = optionsFor(config, "tree_for").flatMap((story) => (story.code ? [{ ...story, code: story.code }] : []));
  const defaultTime = settingText(config, "social.default_time", "19:00");
  const instagramLine = settingText(config, "social.instagram_link_line");

  return (
    <div className="space-y-8">
      <SectionHeader
        level={1}
        title="النشر على الشبكات"
        description="تبرمج منشور بنهارو، توافق عليه، ويخرج وحدو على فايسبوك وإنستغرام في النهار هذاك."
      />

      {/* Said at the top and plainly. A screen that looks like it is publishing, on a connection that cannot
          publish, wastes the owner's morning before it wastes anything else. */}
      {access === "closed" || !accounts.some((account) => account.has_token && account.is_enabled) ? (
        <p className="card border-gold/50 px-4 py-3 text-sm leading-7 text-forest">
          الربط بـMeta مازال ما كملش، فحتى منشور ما يخرج توّا. برمج ووافق عادي: نهار تربط التوكان تحت، كل
          منشور موافق عليه يخرج وحدو في نهارو.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-forest">الحسابات</h2>
        {accounts.length === 0 ? (
          <EmptyState>ما فمّا حتى حساب مربوط. اربط صفحة فايسبوك وحساب إنستغرام من Meta.</EmptyState>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="font-semibold text-ink">{NETWORK[account.network] ?? account.network}</span>
                <span className="text-sm text-muted">{account.display_name ?? "—"}</span>
                <span dir="ltr" className="text-[0.6875rem] text-muted tabular-nums">
                  {account.external_id}
                </span>
                <span className="ms-auto">
                  <StatusPill tone={account.has_token && account.is_enabled ? "success" : "warning"}>
                    {account.has_token ? (account.is_enabled ? "مربوط" : "مربوط ومطفي") : "يستنّى توكان"}
                  </StatusPill>
                </span>
                {/* The token goes in here and never comes back out: the field is a password field, it is
                    cleared on submit, and the RPC behind it answers that it worked without echoing it. */}
                <span className="w-full">
                  <TokenForm
                    network={account.network === "instagram" ? "instagram" : "facebook"}
                    externalId={account.external_id}
                    label={NETWORK[account.network] ?? account.network}
                  />
                </span>
              </li>
            ))}
            {/* 0170: the calendar posts to Instagram too, and Instagram had no row to paste its token into. Its
                id is the Instagram business account Meta links to the page (GET {page}?fields=instagram_business_account). */}
            {accounts.some((account) => account.network === "instagram") ? null : (
              <li className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="font-semibold text-ink">{NETWORK.instagram}</span>
                <span className="ms-auto">
                  <StatusPill tone="warning">مازال ما تربطش</StatusPill>
                </span>
                <span className="w-full">
                  <TokenForm network="instagram" externalId="" label={NETWORK.instagram} />
                </span>
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-forest">برمج منشور</h2>
        <ActionForm action={planPost} submitLabel="برمج" pendingLabel="جاري التحضير…" className="card space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm font-semibold">النهار</span>
              <input name="date" type="date" required className="field field-sm w-full" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">الساعة (توقيت تونس)</span>
              <input name="time" type="time" defaultValue={defaultTime} className="field field-sm w-full" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">الرابط يحلّ على</span>
              <select name="story_code" defaultValue="" className="field field-sm w-full">
                <option value="">الصفحة الرئيسية</option>
                {stories.map((story) => (
                  <option key={story.id} value={story.code}>
                    حكاية «{story.label}»
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-semibold">النص</span>
            <textarea
              name="caption"
              required
              minLength={10}
              maxLength={1800}
              rows={5}
              placeholder="زيتونة باسمك، في أرض تونسية حقيقية…"
              className="field min-h-28 w-full"
            />
            <span className="block text-xs text-muted">
              الرابط يتزاد وحدو في فايسبوك{instagramLine ? ` و«${instagramLine}» في إنستغرام` : ""}، والهاشتاغ في الآخر.
              ما تكتبش وعد بربح ولا بصابة.
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold">الصورة (إنستغرام ما ينشرش بلاش صورة)</span>
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="block w-full text-sm" />
          </label>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-forest">حضّر حملة من عرض</h2>
        {(offers.data ?? []).length === 0 ? (
          <EmptyState>ما فمّاش عرض منشور باش يتعلن عليه.</EmptyState>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {(offers.data ?? []).map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{offer.name ?? offer.code}</span>
                  <span dir="ltr" className="block text-[0.6875rem] text-muted">
                    {offer.code}
                  </span>
                </span>
                <CampaignButton projectId={offer.id} label="حضّر حملة" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Queue title="تستنّى موافقتك" posts={waiting} decide>
        {waiting.length > 1 ? (
          <ActionForm
            action={approveAll}
            submitLabel={`وافق على الكل (${waiting.length})`}
            pendingLabel="…"
            buttonClassName="btn btn-secondary btn-sm"
            className="flex items-center gap-2"
          >
            <span className="sr-only">وافق على كل المنشورات اللي تستنّى</span>
          </ActionForm>
        ) : null}
      </Queue>
      <Queue title="مبرمجين: يخرجو وحدهم في نهارهم" posts={planned} />
      <Queue title="خرجو ولا تلغاو" posts={done} />
    </div>
  );
}

function Queue({
  title,
  posts,
  decide = false,
  children,
}: {
  title: string;
  posts: Post[];
  decide?: boolean;
  /** Beside the title: «وافق على الكل» on the posts waiting for it. */
  children?: ReactNode;
}) {
  if (posts.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-forest">{title}</h2>
        <EmptyState>ما فمّا حتى منشور هوني.</EmptyState>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-forest">
          {title} <span className="text-muted tabular-nums">{posts.length}</span>
        </h2>
        {children}
      </div>
      <ul className="space-y-3">
        {posts.map((post) => {
          const status = STATUS[post.status] ?? { label: post.status, tone: "neutral" as const };
          return (
            <li key={post.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
                <span className="text-sm font-semibold text-ink">{NETWORK[post.network] ?? post.network}</span>
                <span className="text-sm text-muted">
                  {post.event === "calendar" ? "البرنامج اليومي" : (post.project_name ?? post.project_code)}
                </span>
                <span className="ms-auto text-[0.6875rem] text-muted">
                  {post.scheduled_for ? `يخرج ${formatDateTime(post.scheduled_for)}` : formatDateTime(post.created_at)}
                </span>
              </div>

              {post.image_url ? (
                <RemotePhoto url={post.image_url} alt={null} seed={post.id} sizes="12rem" className="aspect-square w-48 rounded-xl" />
              ) : null}

              {/* The caption exactly as it would go out — line breaks and all. Reading it any other way is
                  approving something other than what is published. */}
              <p className="whitespace-pre-line rounded-xl bg-paper px-3 py-2.5 text-sm leading-7 text-ink">
                {post.caption}
              </p>

              {post.link_url ? (
                <p dir="ltr" className="truncate text-[0.6875rem] text-muted">
                  {post.link_url}
                </p>
              ) : null}

              {post.last_error ? (
                <p className="text-[0.6875rem] text-danger">
                  {post.last_error} · {post.attempts} محاولة
                </p>
              ) : null}

              {post.permalink ? (
                <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-[0.6875rem] text-forest underline">
                  شوفو على الشبكة
                </a>
              ) : null}

              {decide ? <DecideButtons postId={post.id} /> : null}
              {/* The one button that makes something leave the building. Only on a post that has been
                  approved and has not already gone out. */}
              {post.status === "scheduled" || post.status === "failed" ? <PublishButton postId={post.id} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
