// «قصّتي مع AgriZed» (0176, owner 2026-11-19: «كل كليون عنده قصة معانا … ينجم ينزل فيديو، صور»). The moments of
// his road with us, once each and in order; a card to send a photo or a video, with the permission to publish
// asked in so many words and never ticked for him; what he has sent, each removable; and the permission itself,
// given or taken back with one press. Every word is a setting; the story comes from public.client_story().

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Link from "@/components/site/link";
import { Texts } from "@/components/site/texts";
import { SectionHeader } from "@/components/ui";
import { currentClient } from "@/lib/client-auth";
import { formatFor, getPublicConfig, t } from "@/lib/config";
import { localePath } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { signStoryReads } from "@/lib/story-media";
import { createAdminClient } from "@/lib/supabase/admin";

import { removeClientStoryMedia, setClientStoryConsent } from "./actions";
import { StoryUpload } from "./story-upload";

export const dynamic = "force-dynamic";

type Media = { id: string; source: string; kind: "photo" | "video"; mime: string; size_bytes: number; parts: number; path: string; caption: string | null; created_at: string };
type Story = {
  ok: boolean;
  consent: "none" | "granted" | "withdrawn";
  milestones: { key: string; at: string; detail: string | null }[];
  media: Media[];
  limits: { max_video_mb: number; max_photo_mb: number };
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return { title: `${t(config, "zitounti.story_title")} — ${t(config, "zitounti.title")}` };
}

export default async function ZitountiStoryPage() {
  const locale = await currentLocale();
  const client = await currentClient();
  if (!client || !client.passwordSet) redirect(localePath(locale, "/zitounti"));

  const config = await getPublicConfig();
  const fmt = formatFor(config);
  const admin = createAdminClient();
  const { data, error } = await (admin as unknown as { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> }).rpc(
    "client_story",
    { p_person: client.personId },
  );
  if (error) console.error("client_story failed", error.message);
  const story = (data ?? null) as Story | null;
  if (!story?.ok) redirect(localePath(locale, "/zitounti"));

  // Read links for what can be shown in place: photos, and videos that came in one part.
  const reads = await signStoryReads(story.media.filter((item) => item.parts === 1).map(({ id, path, parts }) => ({ id, path, parts })));
  const granted = story.consent === "granted";

  return (
    <div data-phone-screen="" className="mx-auto min-h-dvh w-full max-w-md bg-surface px-4 pb-section pt-cozy font-sans">
      <Link href="/zitounti" className="inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 ltr:-scale-x-100">
          <path d="M9.5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(config, "zitounti.back_label")}
      </Link>

      <SectionHeader title={t(config, "zitounti.story_title")} level={1} className="mt-cozy" />
      <p className="mt-2 text-caption leading-7 text-ink/80">{t(config, "ui.story.intro")}</p>

      {story.milestones.length > 0 ? (
        <section className="mt-roomy space-y-3">
          <h2 className="font-display text-lg font-bold text-forest">{t(config, "ui.story.road_title")}</h2>
          <ol className="relative space-y-4 border-s-2 border-leaf-soft ps-5">
            {story.milestones.map((step) => (
              <li key={step.key} className="relative">
                <span className="absolute -start-[1.72rem] top-1.5 size-3 rounded-full bg-forest ring-4 ring-surface" aria-hidden="true" />
                <p className="font-semibold text-ink">{t(config, `ui.story.m_${step.key}`)}</p>
                <p className="text-xs text-muted">
                  {fmt.formatDate(step.at)}
                  {step.detail ? ` · ${step.detail}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="card mt-roomy space-y-3 p-card">
        <h2 className="font-display text-lg font-bold text-forest">{t(config, "ui.story.upload_title")}</h2>
        <p className="text-caption leading-6 text-muted">{t(config, "ui.story.upload_hint")}</p>
        <Texts prefixes={["ui.story."]}>
          <StoryUpload consentGiven={granted} maxVideoMb={story.limits.max_video_mb} maxPhotoMb={story.limits.max_photo_mb} />
        </Texts>
      </section>

      <section className="mt-roomy space-y-3">
        <h2 className="font-display text-lg font-bold text-forest">{t(config, "ui.story.mine_title")}</h2>
        {story.media.length === 0 ? (
          <p className="text-caption text-muted">{t(config, "ui.story.empty_media")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {story.media.map((item) => {
              const url = reads.get(item.id)?.[0];
              return (
                <li key={item.id} className="card overflow-hidden">
                  <div className="aspect-square bg-paper">
                    {item.kind === "photo" && url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link to the client's own photo
                      <img src={url} alt={item.caption ?? ""} className="size-full object-cover" loading="lazy" />
                    ) : item.kind === "video" && url ? (
                      <video src={url} controls preload="metadata" className="size-full bg-ink object-contain" />
                    ) : (
                      <span className="grid size-full place-items-center text-3xl" aria-hidden="true">
                        {item.kind === "video" ? "🎬" : "📷"}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 p-2 text-xs">
                    <p className="font-semibold text-ink">
                      {t(config, item.kind === "video" ? "ui.story.video" : "ui.story.photo")}
                      {item.source === "staff" ? ` · ${t(config, "ui.story.by_team")}` : ""}
                    </p>
                    {item.caption ? <p className="line-clamp-2 text-muted">{item.caption}</p> : null}
                    <p className="text-muted">{fmt.formatDate(item.created_at)}</p>
                    {item.source === "client" ? (
                      <form action={removeClientStoryMedia}>
                        <input type="hidden" name="media_id" value={item.id} />
                        <button type="submit" className="font-semibold text-danger underline-offset-4 hover:underline">
                          {t(config, "ui.story.delete")}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card mt-roomy space-y-3 p-card">
        <h2 className="font-display text-lg font-bold text-forest">{t(config, "ui.story.consent_title")}</h2>
        <p className="text-caption leading-6 text-ink/80">{t(config, granted ? "ui.story.consent_on" : "ui.story.consent_off")}</p>
        {granted ? null : <p className="text-xs leading-6 text-muted">{t(config, "ui.story.consent_label")}</p>}
        <form action={setClientStoryConsent}>
          <input type="hidden" name="granted" value={granted ? "0" : "1"} />
          <button type="submit" className={`btn w-full ${granted ? "btn-secondary border-line" : "btn-primary"}`}>
            {t(config, granted ? "ui.story.consent_withdraw" : "ui.story.consent_give")}
          </button>
        </form>
      </section>
    </div>
  );
}
