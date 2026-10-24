import type { Metadata } from "next";

import { EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

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
  project_code: string;
  project_name: string | null;
};

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
    rpc("staff_social_queue", { p_status: null, p_limit: 100 }),
    supabase.from("projects").select("id, code, name").eq("status", "published").order("created_at", { ascending: false }),
  ]);

  const accounts = (accountsRow.data ?? []) as Account[];
  const posts = (queueRow.data ?? []) as Post[];
  const waiting = posts.filter((post) => post.status === "pending_approval");
  const rest = posts.filter((post) => post.status !== "pending_approval");

  return (
    <div className="space-y-8">
      <SectionHeader
        level={1}
        title="النشر على الشبكات"
        description="تحضّر المنشور من العرض نفسه، تقراه، وتوافق عليه. النشر الفعلي يستنّى أذونات Meta."
      />

      {/* Said at the top and plainly. A screen that looks like it is publishing, on a connection that cannot
          publish, wastes the owner's morning before it wastes anything else. */}
      {access === "closed" || !accounts.some((account) => account.has_token && account.is_enabled) ? (
        <p className="card border-gold/50 px-4 py-3 text-sm leading-7 text-forest">
          الربط بـMeta مازال ما كملش، فحتى منشور ما يخرج وحدو. كل اللي تحت يتحضّر ويستنّى: نهار يوصل الإذن،
          الطابور يتفرّغ وحدو وما يتبدّل حتى شيء في هالشاشة.
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
          </ul>
        )}
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

      <Queue title="تستنّى المصادقة" posts={waiting} decide />
      <Queue title="الطابور" posts={rest} />
    </div>
  );
}

function Queue({ title, posts, decide = false }: { title: string; posts: Post[]; decide?: boolean }) {
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
      <h2 className="text-sm font-bold text-forest">
        {title} <span className="text-muted tabular-nums">{posts.length}</span>
      </h2>
      <ul className="space-y-3">
        {posts.map((post) => {
          const status = STATUS[post.status] ?? { label: post.status, tone: "neutral" as const };
          return (
            <li key={post.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
                <span className="text-sm font-semibold text-ink">{NETWORK[post.network] ?? post.network}</span>
                <span className="text-sm text-muted">{post.project_name ?? post.project_code}</span>
                <span className="ms-auto text-[0.6875rem] text-muted">{formatDateTime(post.created_at)}</span>
              </div>

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
