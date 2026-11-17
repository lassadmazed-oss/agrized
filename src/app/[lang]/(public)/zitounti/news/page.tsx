// أخبار زيتونتك — the client's feed (0167, owner's idea 5: «الحكاية تكمل بعد الشراء»). What the grove team posted
// on the offers this client holds trees in, newest first: a photograph, what kind of news it is, a sentence. Under
// it the two ways a happy owner passes the story on: «اهدي زيتونة» (the gift story, /story/gift) and «احكي
// لصحابك» (the site's share chooser).
//
// The door is the account's door, as on /zitounti/security and /zitounti/referral. Every word is a setting; the
// posts arrive from public.my_tree_news(), read with the client's own session.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Link from "@/components/site/link";
import { ShareButton, ShareMark } from "@/components/site/share-button";
import { RemotePhoto } from "@/components/site/site-photo";
import { Texts } from "@/components/site/texts";
import { SectionHeader } from "@/components/ui";
import { currentClient } from "@/lib/client-auth";
import { formatFor, getPublicConfig, t } from "@/lib/config";
import { localePath } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { parseMyTreeNews, treeNewsPhotoUrl } from "@/lib/tree-news";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return { title: `${t(config, "zitounti.news_title")} — ${t(config, "zitounti.title")}` };
}

export default async function ZitountiNewsPage() {
  const locale = await currentLocale();
  const client = await currentClient();
  if (!client || !client.passwordSet) redirect(localePath(locale, "/zitounti"));

  const config = await getPublicConfig();
  const fmt = formatFor(config);
  const supabase = await createClient({ display: config.locale });
  const { data, error } = await supabase.rpc("my_tree_news");
  if (error) console.error("my_tree_news failed", error);
  const result = error ? { ok: false as const, reason: "error" as const } : parseMyTreeNews(data);
  const items = result.ok ? result.items : [];

  return (
    <div data-phone-screen="" className="mx-auto min-h-dvh w-full max-w-md bg-surface px-4 pb-section pt-cozy font-sans">
      <Link href="/zitounti" className="inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 ltr:-scale-x-100">
          <path d="M9.5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(config, "zitounti.back_label")}
      </Link>

      <SectionHeader title={t(config, "zitounti.news_title")} level={1} className="mt-cozy" />

      {items.length === 0 ? (
        <p className="card mt-roomy p-card text-caption leading-7 text-muted">{t(config, "ui.news.empty")}</p>
      ) : (
        <Texts prefixes={["ui.common."]}>
          <ol className="mt-roomy space-y-6">
            {items.map((item) => (
              <li key={item.id} className="card overflow-hidden">
                {item.photo_path ? (
                  <RemotePhoto
                    url={treeNewsPhotoUrl(item.photo_path)}
                    alt={item.photo_alt}
                    seed={item.id}
                    sizes="(min-width: 448px) 28rem, 100vw"
                    className="aspect-[4/3]"
                  />
                ) : null}
                <div className="p-card">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {item.kind_label ? (
                      <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 font-semibold text-forest">{item.kind_label}</span>
                    ) : null}
                    <span>{item.project_name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fmt.formatDate(item.published_at)}</span>
                  </p>
                  <h2 className="mt-2 font-display text-xl font-bold leading-tight text-forest">{item.title}</h2>
                  {item.body ? <p className="mt-1.5 text-sm leading-7 text-ink">{item.body}</p> : null}
                  <ShareButton
                    url={`/projects/${item.project_code}`}
                    text={t(config, "ui.news.share_text", { title: item.title })}
                    className="btn btn-secondary mt-3 gap-2 border-line"
                  >
                    <ShareMark />
                    {t(config, "ui.news.share")}
                  </ShareButton>
                </div>
              </li>
            ))}
          </ol>
        </Texts>
      )}

      {/* The story passed on: a tree for someone else. */}
      <Link href="/story/gift" className="btn btn-primary mt-roomy w-full">
        {t(config, "ui.news.gift")}
      </Link>
    </div>
  );
}
