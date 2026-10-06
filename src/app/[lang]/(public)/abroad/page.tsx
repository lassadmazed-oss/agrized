import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AbroadClocks } from "@/components/site/abroad/abroad-clocks";
import { CallChooser, PhoneMark, WhatsAppMark } from "@/components/site/call-chooser";
import Link from "@/components/site/link";
import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { ShareButton, ShareMark } from "@/components/site/share-button";
import { RemotePhoto, SitePhoto } from "@/components/site/site-photo";
import { Texts } from "@/components/site/texts";
import { abroadPhotoSlot, videoDays, videoMinutes } from "@/lib/abroad";
import { flagState, getPublicConfig, settingText, t, type PublicConfig } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";
import { getPublicProjects, type PublicProject } from "@/lib/public-projects";
import { createPublicClient } from "@/lib/supabase/public";

import { VideoVisitForm } from "./video-visit-form";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: t(config, "ui.abroad.meta_title"),
    description: t(config, "ui.abroad.meta_description"),
  };
}

// The free times move as people book them, and «from tomorrow» moves at midnight.
export const dynamic = "force-dynamic";

/** How many offers the virtual-visit row shows; the catalogue holds the rest. */
const TOUR_OFFERS = 6;

/**
 * للتوانسة اللي برّا (owner, 2026-10-05: «something special … i want it to feel special for them more than
 * the insiders»).
 *
 * Everything a person at home does by driving to the grove, this page does from where they are:
 *   01 · the title, and the hour at home beside their own — the page knows where they are before it says so;
 *   02 · a virtual visit of each offer (/projects/<code>/visit), built from what the offer already publishes;
 *   03 · a LIVE video visit — the one dark band, because it is the event: someone from the team walks the grove
 *        with a phone, at a time picked on the visitor's own clock;
 *   04 · the whole path from abroad, in four steps;
 *   05 · a way to send the page on to someone else who lives abroad;
 *   06 · the summer, when they come home, and a way to reach the team from any country.
 *
 * Every word is `ui.abroad.*`, every hour and limit is `abroad.*`, the picture is the slot `abroad.hero`, and the
 * module `abroad` opens and closes the page. The person who books is the CRM's ordinary person, marked
 * `lives_abroad` — the flag 0121 already gave the forms.
 */
export default async function AbroadPage({ searchParams }: PageProps<"/[lang]/abroad">) {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "abroad");
  if (access === "closed") return <ComingSoon title={t(config, "ui.abroad.nav")} />;

  const offersOpen = flagState(config, "projects") === "public";
  const [offers, taken] = await Promise.all([
    offersOpen ? liveOffers(config) : Promise.resolve([] as PublicProject[]),
    takenTimes(),
  ]);
  const days = videoDays(config, taken);
  const wanted = (await searchParams).offer;
  const defaultOffer = typeof wanted === "string" && offers.some((offer) => offer.code === wanted) ? wanted : null;

  const phone = settingText(config, "site.contact_phone");
  const whatsapp = settingText(config, "site.contact_whatsapp") || phone;
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : null;
  const photoSlot = abroadPhotoSlot(config);
  const place = (offer: PublicProject) => config.governorates.find((g) => g.id === offer.governorate_id)?.name ?? "";

  const steps = (
    [
      ["choose", "ui.abroad.step_choose_title", "ui.abroad.step_choose_text"],
      ["book", "ui.abroad.step_book_title", "ui.abroad.step_book_text"],
      ["sign", "ui.abroad.step_sign_title", "ui.abroad.step_sign_text"],
      ["follow", "ui.abroad.step_follow_title", "ui.abroad.step_follow_text"],
    ] as const
  )
    // The owner hides a step by emptying its title.
    .map(([icon, title, text]) => ({ icon, title: t(config, title), text: t(config, text) }))
    .filter((step) => step.title.trim() !== "");

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      {/* 01 · THE TITLE AND THE TWO CLOCKS. Words beside the photograph, never on it (the home hero's rule since
          2026-10-05); the clocks hang off the picture's foot so the two read as one object. */}
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 md:pt-12">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-3.5 py-1.5 text-sm font-semibold text-gold">
              <GlobeMark className="size-4" />
              {t(config, "ui.abroad.eyebrow")}
            </p>
            <h1 className="mt-4 font-display text-display font-bold text-forest text-balance">{t(config, "ui.abroad.title")}</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-ink/80">{t(config, "ui.abroad.lead")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {offers.length > 0 ? (
                <Link href={`/projects/${encodeURIComponent(offers[0].code)}/visit`} className="btn btn-primary gap-2">
                  <PlayMark className="size-4" />
                  {t(config, "ui.abroad.cta_tour")}
                </Link>
              ) : null}
              <a href="#video" className="btn btn-secondary gap-2 border-line">
                <VideoMark className="size-5" />
                {t(config, "ui.abroad.cta_live")}
              </a>
            </div>
          </div>

          <div>
            <SitePhoto
              config={config}
              slot={photoSlot}
              priority
              sizes="(min-width: 1024px) 34rem, 100vw"
              className="rounded-3xl shadow-[var(--shadow-card)]"
            />
            <div className="relative z-1 -mt-12 px-3 sm:px-8">
              <Texts prefixes={["ui.abroad.clock_"]}>
                <AbroadClocks />
              </Texts>
            </div>
          </div>
        </div>
      </section>

      {/* 02 · THE VIRTUAL VISIT, one card per offer: the cover with a play mark, the name, the place. */}
      {offers.length > 0 ? (
        <section id="tour" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="section-title">{t(config, "ui.abroad.tour_title")}</h2>
            <p className="mt-3 leading-7 text-muted">{t(config, "ui.abroad.tour_text")}</p>
          </div>
          <ul className="-mx-4 mt-6 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {offers.map((offer) => (
              <li key={offer.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                <Link
                  href={`/projects/${encodeURIComponent(offer.code)}/visit`}
                  className="group block overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-raise)] transition-shadow hover:shadow-[var(--shadow-card)]"
                >
                  <div className="relative">
                    <RemotePhoto
                      url={offer.cover_url}
                      alt={offer.cover_alt_ar}
                      seed={offer.id}
                      sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 78vw"
                      className="aspect-4/3 transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                    <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-forest-700/55 via-transparent to-transparent" />
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid size-16 place-items-center rounded-full bg-paper/90 text-forest shadow-[var(--shadow-float)] backdrop-blur-sm transition-transform group-hover:scale-110">
                        <PlayMark className="size-6 translate-x-0.5" />
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      {/* `auto`: an offer named only in Arabic keeps its own direction on a French page, so the cut falls at
                          its end and not at its beginning. */}
                      <p dir="auto" className="truncate font-display text-xl font-bold text-forest">
                        {offer.name}
                      </p>
                      {place(offer) ? <p className="truncate text-caption text-muted">{place(offer)}</p> : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-leaf-soft px-3 py-1.5 text-caption font-semibold text-forest">
                      {t(config, "ui.abroad.tour_cta")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 03 · THE LIVE VIDEO VISIT — the page's one dark band. A phone mid-call on one side (a drawing, not a
          promise of any screen), the form on the other. */}
      <section id="video" className="scroll-mt-20 px-0 py-6 sm:px-4 md:py-10">
        <div className="mx-auto max-w-6xl overflow-hidden bg-forest text-paper sm:rounded-[2rem]">
          {/* grid-cols-1 is minmax(0, 1fr): without it the row of days, which scrolls sideways, would hold the column
              at its full width and push the whole page wider than the phone. */}
          <div className="grid grid-cols-1 gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 lg:px-12 lg:py-14">
            <div>
              <h2 className="font-display text-section-title font-bold text-paper">{t(config, "ui.abroad.live_title")}</h2>
              <p className="mt-3 max-w-lg leading-8 text-paper/85">{t(config, "ui.abroad.live_text")}</p>
              <ul className="mt-6 space-y-3">
                <Point icon={<ClockMark className="size-5" />}>{t(config, "ui.abroad.live_point_time")}</Point>
                <Point icon={<WhatsAppMark className="size-5" />}>
                  {t(config, "ui.abroad.live_point_length", { minutes: videoMinutes(config) })}
                </Point>
                <Point icon={<FamilyMark className="size-5" />}>{t(config, "ui.abroad.live_point_family")}</Point>
              </ul>
              <CallScene>
                {offers[0] ? (
                  <div className="absolute inset-0">
                    <RemotePhoto url={offers[0].cover_url} alt="" seed={offers[0].id} sizes="12rem" className="size-full" />
                  </div>
                ) : (
                  <SitePhoto config={config} slot={photoSlot} fill sizes="12rem" />
                )}
              </CallScene>
            </div>

            <div className="rounded-3xl bg-surface p-5 text-ink shadow-[var(--shadow-float)] sm:p-7">
              <h3 className="font-display text-2xl font-bold text-forest">{t(config, "ui.abroad.form_title")}</h3>
              <div className="mt-4">
                <Texts prefixes={["ui.abroad.", "legal.consent_text"]}>
                  <VideoVisitForm
                    days={days}
                    offers={offers.map((offer) => ({ code: offer.code, name: offer.name }))}
                    defaultOffer={defaultOffer}
                    whatsappHref={whatsappHref}
                  />
                </Texts>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 04 · THE WHOLE PATH FROM ABROAD. */}
      {steps.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h2 className="section-title text-center">{t(config, "ui.abroad.steps_title")}</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              // Icon beside the words on a phone (four tall cards were four screens), above them from sm.
              <li key={step.icon} className="relative flex items-start gap-4 rounded-3xl border border-line bg-surface p-5 sm:block">
                <span className="absolute end-4 top-4 font-display text-4xl font-bold leading-none text-gold-soft" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="grid size-11 flex-none place-items-center rounded-2xl bg-leaf-soft text-forest">
                  <StepMark name={step.icon} className="size-5" />
                </span>
                <div className="min-w-0 pe-8 sm:pe-0">
                  <p className="font-display text-xl font-bold text-forest sm:mt-4">{step.title}</p>
                  <p className="mt-1 text-sm leading-7 text-muted sm:mt-1.5">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* 05 · PASS IT ON (owner, 2026-10-06: «partager»). Most people who live abroad will hear of this page from
          someone at home, so it asks the reader to send it on — with a sentence written for the one receiving it. */}
      <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
        <div className="flex flex-col items-start gap-4 rounded-3xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
          <span className="grid size-12 flex-none place-items-center rounded-2xl bg-leaf-soft text-forest">
            <ShareMark className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold text-forest sm:text-3xl">{t(config, "ui.abroad.share_title")}</h2>
            <p className="mt-1 leading-7 text-ink/80">{t(config, "ui.abroad.share_text")}</p>
          </div>
          <ShareButton text={t(config, "ui.abroad.share_message")} className="btn btn-primary shrink-0 gap-2">
            <WhatsAppMark className="size-5" />
            {t(config, "ui.abroad.share_cta")}
          </ShareButton>
        </div>
      </section>

      {/* 06 · THE SUMMER, AND A LINE HOME. */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-14 pt-4 sm:px-6 md:grid-cols-2">
        <div className="flex flex-col rounded-3xl bg-gold-soft/70 p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-surface text-gold">
            <SunMark className="size-6" />
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold text-forest">{t(config, "ui.abroad.summer_title")}</h2>
          <p className="mt-2 flex-1 leading-7 text-ink/80">{t(config, "ui.abroad.summer_text")}</p>
          <Link href={offersOpen ? "/projects" : "/start"} className="btn btn-primary mt-5 self-start">
            {t(config, "ui.abroad.summer_cta")}
          </Link>
        </div>
        <div className="flex flex-col rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-leaf-soft text-forest">
            <PhoneMark className="size-6" />
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold text-forest">{t(config, "ui.abroad.contact_title")}</h2>
          <p className="mt-2 flex-1 leading-7 text-ink/80">{t(config, "ui.abroad.contact_text")}</p>
          {phone ? (
            <CallChooser phone={phone} whatsapp={whatsapp} className="btn btn-secondary mt-5 gap-2 self-start border-line">
              <WhatsAppMark className="size-5 text-[#128c4a]" />
              {t(config, "ui.abroad.contact_cta")}
            </CallChooser>
          ) : whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-5 gap-2 self-start border-line">
              <WhatsAppMark className="size-5 text-[#128c4a]" />
              {t(config, "ui.abroad.contact_cta")}
            </a>
          ) : null}
        </div>
      </section>
    </>
  );
}

/** The offers anyone may see, in the visitor's language, the ones with a picture first. */
async function liveOffers(config: PublicConfig): Promise<PublicProject[]> {
  try {
    const projects = await getPublicProjects("anon", config.locale);
    return [...projects]
      .filter((project) => project.code)
      .sort((a, b) => Number(Boolean(b.cover_url)) - Number(Boolean(a.cover_url)))
      .slice(0, TOUR_OFFERS);
  } catch (error) {
    console.error(error);
    return [];
  }
}

/** The full times; an error leaves every time open, and the database still refuses a full one on submit. */
async function takenTimes(): Promise<string[]> {
  const { data, error } = await createPublicClient().rpc("video_visit_taken");
  if (error) {
    console.error("video_visit_taken failed", error);
    return [];
  }
  return Array.isArray(data) ? data.filter((value): value is string => typeof value === "string") : [];
}

function Point({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-10 flex-none place-items-center rounded-full bg-paper/10 text-gold-bright">{icon}</span>
      <span className="font-semibold text-paper">{children}</span>
    </li>
  );
}

/**
 * A phone in the middle of a video call: the grove filling the screen, a small square of the person calling,
 * the three round buttons. A drawing — it stands for the call, it does not show one — so it is hidden from
 * assistive technology and from narrow phones, where the form needs the room.
 */
function CallScene({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" className="mt-10 hidden justify-center sm:flex lg:justify-start">
      <div className="relative">
        <div className="absolute -inset-6 rounded-full bg-gold-bright/15 blur-2xl" />
        <div className="relative aspect-[9/17] w-48 overflow-hidden rounded-[2.2rem] border-[6px] border-ink bg-ink shadow-[var(--shadow-float)]">
          {children}
          <span className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-ink/60 to-transparent" />
          <span className="absolute start-3 top-3 flex items-center gap-1.5 rounded-full bg-ink/50 px-2 py-1">
            <span className="size-2 rounded-full bg-danger" />
            <span dir="ltr" className="text-[0.6rem] font-semibold tabular-nums text-paper">
              12:48
            </span>
          </span>
          <span className="absolute end-3 top-3 grid h-16 w-12 place-items-center rounded-xl border-2 border-paper/70 bg-forest-600">
            <svg viewBox="0 0 24 24" className="size-7 text-paper/80" fill="currentColor">
              <circle cx="12" cy="9" r="4" />
              <path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6Z" />
            </svg>
          </span>
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-linear-to-t from-ink/70 to-transparent pb-4 pt-10">
            <span className="grid size-9 place-items-center rounded-full bg-paper/20 text-paper">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </span>
            <span className="grid size-11 place-items-center rounded-full bg-danger text-paper">
              <PhoneMark className="size-5 rotate-[135deg]" />
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-paper/20 text-paper">
              <VideoMark className="size-4" />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function GlobeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" />
    </svg>
  );
}

function PlayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function VideoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      <path d="m16 10.5 5-3v9l-5-3" />
    </svg>
  );
}

function ClockMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function FamilyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <circle cx="8" cy="7" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M2.5 20c.6-3.6 2.8-5.5 5.5-5.5s4.9 1.9 5.5 5.5M14 15.2c.9-.6 1.9-.9 3-.9 2.3 0 4 1.6 4.5 4.7" />
    </svg>
  );
}

function SunMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </svg>
  );
}

function StepMark({ name, className }: { name: "choose" | "book" | "sign" | "follow"; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    choose: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.2-4.2" />
      </>
    ),
    book: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4M8.5 14.5l2 2 4-4" />
      </>
    ),
    sign: (
      <>
        <path d="M4 20h16" />
        <path d="M14.5 4.5 19.5 9.5 10 19H5v-5Z" />
      </>
    ),
    follow: (
      <>
        <path d="M12 21v-7" />
        <path d="M12 14c-4 0-6.5-2.6-6.5-6 3.6 0 6.5 2.4 6.5 6Zm0 0c4 0 6.5-2.6 6.5-6-3.6 0-6.5 2.4-6.5 6Z" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      {paths[name]}
    </svg>
  );
}
