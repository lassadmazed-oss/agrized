import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader } from "@/components/ui";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, mediaFor, optionsFor } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { SITE_ORIGIN } from "@/lib/site-origin";
import { storyByCode } from "@/lib/story";
import { createClient } from "@/lib/supabase/server";

import { CopyLink } from "./copy-link";

export const metadata: Metadata = { title: "روابط الإعلانات" };

type StoryStats = { id: string; code: string; label_ar: string; requests: number; from_ads: number; sources: Record<string, number> };

/** How many days the counts cover. A reading window, not a business rule: the page says it in its heading. */
const DAYS = 30;

/**
 * روابط الإعلانات (0166, owner 2026-11-17, idea 4): one landing page per story of «لمن الزيتونة؟», and for each
 * the link to put in an ad on each network — utm_source = the network, utm_campaign = story_<code> — so a request
 * says which story and which network brought it. Beside each story: how many requests chose it, how many its ads
 * brought, and from where, over the last thirty days (public.staff_story_stats — counts, never a person).
 *
 * The networks are the owner's list (settings story.ad_channels); the pictures are site_media story.<code>, set in
 * الإعدادات ← صور الموقع; the words are story.titles and start.for_lines.
 */
export default async function StoriesPage() {
  await requireStaff(CRM_READ_ROLES);
  const supabase = await createClient();
  const [config, statsRes, channelsRes] = await Promise.all([
    getPublicConfig(),
    supabase.rpc("staff_story_stats", { p_days: DAYS }),
    supabase.from("settings").select("value").eq("key", "story.ad_channels").maybeSingle(),
  ]);

  const stats = new Map(((statsRes.data as unknown as StoryStats[] | null) ?? []).map((row) => [row.code, row]));
  const rawChannels = channelsRes.data?.value;
  const channels = Array.isArray(rawChannels) ? rawChannels.filter((value): value is string => typeof value === "string") : [];
  const stories = optionsFor(config, "tree_for")
    .map((option) => (option.code ? storyByCode(config, option.code) : null))
    .filter((story): story is NonNullable<typeof story> => story !== null);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        level={1}
        title="روابط الإعلانات"
        description={`كل حكاية عندها صفحتها. حطّ الرابط متاع الشبكة في الإعلان، والطلبات اللي يجيبها تتحسب هنا (آخر ${formatCount(DAYS)} يوم).`}
      />

      {stories.length === 0 ? (
        <EmptyState title="ما فماش حكايات.">قائمة «لمن الزيتونة؟» فارغة في الإعدادات ← القوائم.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {stories.map((story) => {
            const page = `${SITE_ORIGIN}/story/${story.code}`;
            const row = stats.get(story.code);
            const hasPhoto = Boolean(mediaFor(config, `story.${story.code}`));
            const sources = Object.entries(row?.sources ?? {}).sort((a, b) => b[1] - a[1]);
            return (
              <li key={story.code} className="card space-y-4 p-cozy">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-bold text-forest">{story.title}</h2>
                    {story.line ? <p className="mt-1 text-sm text-muted">{story.line}</p> : null}
                  </div>
                  <dl className="flex gap-4 text-center">
                    <div>
                      <dt className="text-xs text-muted">اختاروها</dt>
                      <dd className="text-xl font-bold tabular-nums">{formatCount(row?.requests ?? 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">جابتهم الإعلانات</dt>
                      <dd className="text-xl font-bold tabular-nums">{formatCount(row?.from_ads ?? 0)}</dd>
                    </div>
                  </dl>
                </div>
                {sources.length > 0 ? (
                  <p className="text-xs text-muted">
                    من: {sources.map(([source, count]) => `${source} ${formatCount(count)}`).join(" · ")}
                  </p>
                ) : null}

                <div className="space-y-2">
                  <CopyLink label="الصفحة" href={page} />
                  {channels.map((channel) => (
                    <CopyLink
                      key={channel}
                      label={channel}
                      href={`${page}?utm_source=${encodeURIComponent(channel)}&utm_medium=ad&utm_campaign=story_${story.code}`}
                    />
                  ))}
                </div>

                <p className="flex flex-wrap items-center gap-3 text-sm">
                  <a href={page} target="_blank" rel="noopener noreferrer" className="font-semibold text-forest underline underline-offset-4">
                    شوف الصفحة
                  </a>
                  <span className={hasPhoto ? "text-success" : "text-muted"}>
                    {hasPhoto ? "عندها صورتها." : "ما عندهاش صورة: تظهر صورة الصفحة الرئيسية."}
                  </span>
                  <Link href="/admin/settings/media" className="text-forest underline underline-offset-4">
                    {hasPhoto ? "بدّل الصورة" : "حطّ صورة"}
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
