import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "@/components/site/link";
import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { ResumeStory } from "@/components/site/resume-story";
import { SitePhoto } from "@/components/site/site-photo";
import { StoryIcon } from "@/components/site/story-icon";
import { flagState, getPublicConfig, mediaFor, t } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";
import { storyByCode, storyPhotoSlot, storyResumeCopy } from "@/lib/story";

import { startTimeline } from "../../start/copy";

/**
 * /story/<code> — the page an ad lands on (owner, 2026-11-17, idea 4: «الإعلان يكمّل نفس الحكاية في الموقع»).
 *
 * An ad that shows a child beside a young tree must not open on the home page's general promise: it opens here,
 * on the same story — its picture (site_media story.<code>, the home cover until the owner uploads one), its
 * title, its line, the years ahead — and one door, «احسب زيتونتك», into /start with that story already chosen.
 * The ad's utm_* are recorded by the site on arrival like on every page, so the request says which story and
 * which network brought it (/admin/stories counts them).
 *
 * The code is a code of the list tree_for (0164); anything else is a 404. The page follows the interest form's
 * module: a door to a closed form is not a door.
 */
export async function generateMetadata({ params }: PageProps<"/[lang]/story/[code]">): Promise<Metadata> {
  const { code } = await params;
  const config = await getPublicConfig();
  const story = storyByCode(config, code);
  if (!story) return {};
  // The link's preview in a chat or a feed shows the story's own picture, as the ad did.
  const media = mediaFor(config, storyPhotoSlot(config, story.code));
  return {
    title: story.title,
    description: story.line ?? undefined,
    openGraph: media?.url ? { images: [{ url: media.url, alt: media.alt ?? story.title }] } : undefined,
  };
}

export default async function StoryPage({ params }: PageProps<"/[lang]/story/[code]">) {
  const { code } = await params;
  const config = await getPublicConfig();
  const story = storyByCode(config, code);
  if (!story) notFound();

  const access = await moduleAccess(config, "interest_form");
  if (access === "closed") return <ComingSoon title={story.title} />;

  const milestones = startTimeline(config);
  const startYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Africa/Tunis", year: "numeric" }).format(new Date()));
  const offersOpen = flagState(config, "projects") === "public";
  const timelineNote = t(config, "start.timeline_note");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-section pt-4 sm:px-6 md:pt-10">
      {access === "preview" ? <PreviewBanner /> : null}

      <section className="grid overflow-hidden rounded-3xl bg-forest text-paper shadow-[var(--shadow-card)] md:grid-cols-[1.1fr_1fr]">
        <div className="relative min-h-56 md:order-2 md:min-h-full">
          <SitePhoto config={config} slot={storyPhotoSlot(config, story.code)} fill priority sizes="(min-width: 768px) 30rem, 100vw" />
        </div>
        <div className="p-6 md:p-10">
          <span className="grid size-12 place-items-center rounded-full bg-paper/15 text-gold-bright">
            <StoryIcon code={story.code} />
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">{story.title}</h1>
          {story.line ? <p className="mt-3 max-w-md text-lg leading-8 text-paper/85">{story.line}</p> : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={`/start?for=${encodeURIComponent(story.id)}`}
              className="btn min-h-12 bg-gold-bright px-6 text-lg text-forest-700 hover:bg-gold-soft"
            >
              {t(config, "story.cta")}
            </Link>
            {offersOpen ? (
              <Link href="/projects" className="btn min-h-12 border border-paper/30 bg-paper/10 px-6 text-paper hover:bg-paper/20">
                {t(config, "story.offers_cta")}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <ResumeStory copy={storyResumeCopy(config)} />

      {/* The years ahead (0165), the same milestones and the same estimate stamp as on /start. */}
      {milestones.length > 0 ? (
        <section aria-labelledby="story-timeline" className="card mt-6 p-6 md:mt-10 md:p-8">
          <h2 id="story-timeline" className="font-display text-2xl font-bold leading-tight text-forest">
            {t(config, "start.timeline_title")}
          </h2>
          <ol className="mt-5 grid gap-5 border-s-2 border-leaf/40 ps-5 md:grid-cols-5 md:gap-4 md:border-s-0 md:border-t-2 md:ps-0 md:pt-5">
            {milestones.map((milestone) => (
              <li key={milestone.years} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -start-[1.72rem] top-1 size-3 rounded-full bg-leaf ring-4 ring-surface md:-top-[1.72rem] md:start-0"
                />
                <p className="text-sm font-bold tabular-nums text-gold">{startYear + milestone.years}</p>
                <p className="font-semibold leading-snug text-forest">{milestone.title.ar}</p>
                {milestone.line ? <p className="mt-0.5 text-sm leading-6 text-muted">{milestone.line.ar}</p> : null}
              </li>
            ))}
          </ol>
          {timelineNote ? (
            <p className="mt-5 border-t border-dashed border-gold/50 pt-3 text-xs leading-5 text-muted">{timelineNote}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
