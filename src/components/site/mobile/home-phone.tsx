import Link from "next/link";
import type { ReactNode } from "react";

import { formatCount } from "@/lib/format";

/**
 * The home screen, as a phone reads it (owner, 2026-09-22, from the redesign canvas: «fully remake them to
 * match the designs»).
 *
 * WHAT THIS REPLACES. Below `md` the page used to be <AppHero> + <AppStats> + <OffersTicker>: a greeting on
 * paper, a photographic card, four separate tiles and a sliding strip of offer names. Three components, three
 * grounds, and nothing on the screen that said what a visitor is meant to do first. This is one screen with
 * one rhythm, in the canvas's order:
 *
 *   1 · the hero card — the promise, and the two doors out of it;
 *   2 · the figures, in ONE bar with hairlines between them rather than four floating tiles;
 *   3 · the two entry cards — the part that was missing entirely, and the reason the rest is shorter;
 *   4 · the offers, two per line, compact;
 *   5 · where the counter has got to.
 *
 * WHY THE TWO ENTRY CARDS ARE THE POINT. The canvas splits the visitor in two before anything else: someone
 * with an offer in mind, and someone who only knows they want olive trees. They need different things — the
 * first wants to get out of the way fast, the second wants to be asked what suits them — and the old screen
 * sent both down the same door. Naming the split on the home screen is what makes the two intake flows
 * legible instead of arbitrary.
 *
 * WHAT THE CANVAS DRAWS AND THIS DOES NOT. A notification bell, an avatar and «أهلاً بيك يا …». There is no
 * public account in this product: nobody has told us their name, the bell would ring for nothing and the
 * avatar would be a stranger's face. A control that does nothing is worse than a missing one — it teaches a
 * visitor the app is a picture of an app. The brand lockup stays, the furniture of a signed-in app does not.
 *
 * Every figure is the database's. The canvas prints invented ones, as a drawing should; a page that printed
 * them would be telling a stranger something untrue on the screen where they decide whether this is real.
 */

export type HomePhoneStat = {
  label: string;
  /** Null when nothing honest answers it — the cell is dropped rather than shown as a zero. */
  value: number | null;
  /** «+» before a figure that keeps growing. Never on a fixed one like the governorates. */
  growing?: boolean;
};

export type HomePhoneOffer = {
  id: string;
  href: string;
  name: string;
  place: string;
  /** «49 م²» — the land one tree comes with, or null when the offer does not publish it. */
  areaPerTree: string | null;
  /** «454 د.ت», or null while the pricing module keeps prices closed (PRJ-03). */
  price: string | null;
  image: ReactNode;
};

export type HomePhoneProps = {
  /** The photographic card at the top: whatever the hero strip already shows. */
  hero: ReactNode;
  /** The sliding quote cards, above everything. Null when the owner emptied `site.quotes`. */
  quotes?: ReactNode;
  /**
   * «وين وصلنا؟» in full — the six counted figures on their photographic band (CounterBand).
   *
   * When it is given it REPLACES the one-line bar below, rather than joining it: both carry id="million",
   * which the header and the footer link to as /#million, and two elements answering one anchor is a bug
   * the browser resolves by guessing. Null when the statistics module is closed, and then the short bar
   * stands on its own as before.
   */
  progressBand?: ReactNode;
  /** «إنت تستثمر، وإحنا نتلهاو» and the governorates beside it (ServicesMap). */
  services?: ReactNode;
  /**
   * The questions and the last ask, both already drawn by the landing page.
   *
   * They are passed in rather than rebuilt here. Every sentence in them is a setting the owner edits
   * (`site.faq`, `site.final_cta_title`, `site.contact_whatsapp`…), and a second copy on the phone would
   * be a second place to forget. The phone only decides WHERE they sit and how they arrive.
   */
  faq?: ReactNode;
  closing?: ReactNode;
  copy: {
    badge: string;
    line: string;
    exploreCta: string;
    /** The door for someone who has not chosen an offer — «ما نعرفش نبدا». */
    guideCta: string;
    offersTitle: string;
    all: string;
    from: string;
    /** The two entry cards. */
    guideTitle: string;
    guideNote: string;
    pickTitle: string;
    pickNote: string;
    progressTitle: string;
  };
  stats: readonly HomePhoneStat[];
  offers: readonly HomePhoneOffer[];
  /** Where to send someone who wants to be asked what suits them, and someone who wants the catalogue. */
  guideHref: string;
  offersHref: string;
  /** The counter line, already worded by the page, or null while the statistics module is closed. */
  progressNote: string | null;
  /** 0–100, how far the counter has come. Null when there is nothing to draw. */
  progressPercent: number | null;
};

export function HomePhone({
  hero,
  quotes,
  progressBand,
  services,
  faq,
  closing,
  copy,
  stats,
  offers,
  guideHref,
  offersHref,
  progressNote,
  progressPercent,
}: HomePhoneProps) {
  const shownStats = stats.filter((stat) => stat.value !== null);

  return (
    // `data-phone-screen` is the marker the stylesheet reads to take the site's own header off a phone that
    // carries its own furniture — the same hook /projects and the offer screen already set.
    <div data-phone-screen="">
      {/* ONE COMPOSITION, EVERY WIDTH (owner, 2026-09-23: the desktop should match the phone).
          This used to be `md:hidden` with a second, different home page underneath it. Now it is the home
          page. The column keeps its phone measure up to `md` and then opens out — the sections below grow
          their own grids at the same breakpoint, so a wide screen gets the same design using the space
          rather than a phone-width strip stranded in the middle of it.

          `data-phone-screen` stays: the rule that reads it (globals.css) is inside `@media (width < 48rem)`,
          so it still takes the site header off a phone that carries its own furniture, and still leaves the
          header alone on a wide screen where the bar is the only navigation there is. */}
      <div className="mx-auto max-w-md px-4 pb-6 pt-3 md:max-w-5xl md:px-6 md:pb-14 md:pt-6 lg:max-w-6xl">
        {/* 0 · The quote strip — on a phone only (owner, 2026-09-24: «remove the quotes from the desktop
            view»). It is a sliding card of proverbs: on a 375px screen, above a photograph, it reads as the
            app greeting somebody. Across 1200px it is a wide band of aphorism sitting above the one thing the
            visitor came for, and the first impression of the business becomes a fortune cookie. The setting
            still feeds it, so emptying `site.quotes` still removes it everywhere. */}
        <div className="md:hidden">{quotes}</div>

        {/* 1 · The hero. The whole card is the link target for the primary door; the second door is a
            separate control, because «ما نعرفش نبدا» goes somewhere else entirely. */}
        <section className="relative overflow-hidden rounded-3xl shadow-[var(--shadow-card)]">
          <div className="absolute inset-0">{hero}</div>
          {/* Bottom-weighted: the sky is why the photograph is here, the words live on its foot. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-forest-700/94 via-forest-700/55 to-forest-700/15"
          />
          <div className="relative flex min-h-[13rem] flex-col justify-end p-4 md:min-h-[26rem] md:p-9 lg:min-h-[30rem]">
            {copy.badge ? (
              <span className="mb-2 inline-flex self-start items-center gap-1.5 rounded-full border border-surface/25 bg-surface/15 px-2.5 py-1 text-[0.6875rem] font-medium text-paper backdrop-blur-sm">
                <LeafGlyph />
                {copy.badge}
              </span>
            ) : null}
            <p className="max-w-2xl font-display text-[1.75rem] font-bold leading-[1.15] text-surface md:text-5xl lg:text-6xl">{copy.line}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={offersHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-label font-semibold text-ink transition-transform active:scale-[0.98]"
              >
                {copy.exploreCta}
                <ArrowGo className="size-4" />
              </Link>
              <Link
                href={guideHref}
                className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-surface/40 px-4 text-label font-semibold text-surface"
              >
                {copy.guideCta}
              </Link>
            </div>
          </div>
        </section>

        {/* 2 · The figures. ONE bar with hairlines, not four floating tiles: four cards on four grounds read
            as four separate claims, and these are one fact about the same thing. */}
        {shownStats.length > 0 ? (
          <section className="card mt-3 flex items-center md:mt-5">
            {shownStats.map((stat, index) => (
              <div key={stat.label} className="flex flex-1 items-center">
                {index > 0 ? <span aria-hidden="true" className="h-7 w-px flex-none bg-line" /> : null}
                <p className="flex-1 py-2.5 text-center md:py-5">
                  <span className="figure-in block font-display text-lg font-bold leading-none tabular-nums text-forest md:text-3xl">
                    {stat.growing ? "+" : ""}
                    {formatCount(stat.value as number)}
                  </span>
                  <span className="mt-1 block text-[0.625rem] leading-none text-muted md:mt-2 md:text-sm">{stat.label}</span>
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {/* 3 · The split. Two doors, named by what the visitor already knows, not by what we want to sell. */}
        <section className="mt-3 grid grid-cols-2 gap-2 md:mt-5 md:gap-5">
          <Link
            href={guideHref}
            className="flex flex-col gap-1.5 rounded-2xl bg-forest-700 p-3 text-paper transition-transform active:scale-[0.99] md:gap-3 md:p-6"
          >
            <span className="flex size-7 items-center justify-center rounded-[0.625rem] bg-gold-bright/20">
              <SearchGlyph className="size-4 text-gold-bright" />
            </span>
            <span className="text-[0.8125rem] font-semibold leading-tight md:text-xl">{copy.guideTitle}</span>
            <span className="text-[0.625rem] leading-[1.4] text-paper/70 md:text-sm">{copy.guideNote}</span>
          </Link>
          <Link
            href={offersHref}
            className="card flex flex-col gap-1.5 p-3 transition-transform active:scale-[0.99] md:gap-3 md:p-6"
          >
            <span className="flex size-7 items-center justify-center rounded-[0.625rem] bg-gold-soft">
              <GridGlyph className="size-4 text-gold" />
            </span>
            <span className="text-[0.8125rem] font-semibold leading-tight text-ink md:text-xl">{copy.pickTitle}</span>
            <span className="text-[0.625rem] leading-[1.4] text-muted md:text-sm">{copy.pickNote}</span>
          </Link>
        </section>

        {/* 4 · The offers, sliding (owner, 2026-09-22: «make this section slide infinitely»). A two-per-line
            grid showed four of thirteen and gave no sign the rest existed; a strip that never stops says
            «there are more» without a control and without a second screen. The same .marquee primitive the
            rest of the site uses: the list is rendered twice and the track travels exactly -50%, so the seam
            lands on an identical copy and nothing here has to know how many offers there are. The second copy
            is aria-hidden — it is the same offers, and a reader told there are twenty-six is told wrong. */}
        {offers.length > 0 ? (
          <section className="mt-4">
            <div className="flex items-baseline justify-between px-0">
              <h2 className="font-display text-xl font-bold text-forest">{copy.offersTitle}</h2>
              <Link href={offersHref} className="text-caption font-semibold text-forest">
                {copy.all} ←
              </Link>
            </div>
            <div className="marquee -mx-4 mt-2" style={{ ["--marquee-duration" as string]: "48s" }}>
              <div className="marquee-track marquee-track-reverse">
                {offers.map((offer) => (
                  <OfferTile key={offer.id} offer={offer} from={copy.from} />
                ))}
                {offers.map((offer) => (
                  <OfferTile key={`echo-${offer.id}`} offer={offer} from={copy.from} echo />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* 5 · Where the counter has got to (owner, 2026-09-24: «add these 2 in the landing page»).
            The full band was written for the landing page it was then taken off — six counted figures, the
            «عشرات الأشخاص بدات» line and the goal — and what stood here instead was a single bar carrying one
            of those six. The band is back, and it answers #million; the short bar below is what shows when
            the statistics module is closed and there is no band to render. */}
        {progressBand ? (
          <div className="mt-3 overflow-hidden rounded-3xl md:mt-5">{progressBand}</div>
        ) : progressNote ? (
          <section id="million" className="card mt-3 scroll-mt-24 p-3 md:mt-5 md:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[0.8125rem] font-semibold text-ink">{copy.progressTitle}</p>
              <p className="text-[0.625rem] text-muted">{progressNote}</p>
            </div>
            {progressPercent !== null ? (
              <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
                <span
                  className="counter-fill block h-full rounded-full bg-leaf"
                  style={{ inlineSize: `${Math.min(100, Math.max(2, progressPercent))}%` }}
                />
              </span>
            ) : null}
          </section>
        ) : null}

        {/* 5b · «إنت تستثمر، وإحنا نتلهاو» — what the company keeps doing after the money changes hands, and
            where the land can be. Both lists are database rows (option_items `agrized_service`, and the active
            governorates), and `site.services_note` — «الخدمات اختيارية، وشروطها وأسعارها تتوضّح قبل الإمضاء» —
            is why the chip row cannot be read as «free». It sits after the counter because it answers the
            question the figures raise: «fine, but what do I actually get». */}
        {services ? <div className="mt-3 md:mt-5">{services}</div> : null}

        {/* 6 · The stranger's questions, then the ask. Owner, 2026-09-23: both were on the wide screen
            only — a visitor on a telephone reached the offers, the figures, and then the footer, with
            the objections answered nowhere and nothing at the end to act on.

            The order is the one the wide page already argues for: questions first, ask second. Someone
            still hesitating is not asked to register; someone whose last doubt has just been answered
            is. Each arrives with `.reveal`, the scroll-driven lift the rest of the site uses, so they
            come up into place as they are scrolled to rather than all at once on load. */}
        {/* On a wide screen the questions and the ask sit side by side — the arrangement the page used to
            have before there was one composition, and the reason it worked: a column of six questions and a
            photographic card are each about half a screen, and stacked they are two scrolls of half-empty
            page. Below `lg` they stack, questions first, which is the order a stranger reads them in. */}
        {faq || closing ? (
          <section className="mt-4 grid gap-3 md:mt-8 md:gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            {faq ? <div className="reveal">{faq}</div> : null}
            {closing ? <div className="reveal">{closing}</div> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One offer in the sliding strip.
 *
 * The picture is the point (owner, 2026-09-22: «the images not visible … show more of the img»). It used to
 * be 56px under 76px of words — a third of the tile was the photograph and two thirds were a two-line name
 * with a floor under it, a meta line and a price line. Now it is 112px of photograph over one line of name,
 * with the place and the price sharing the last row: the same four facts in half the text height, and the
 * grove is the first thing seen rather than a strip above the caption.
 *
 * Fixed width, because a track of items that size to their own text stutters as it slides.
 */
function OfferTile({ offer, from, echo }: { offer: HomePhoneOffer; from: string; echo?: boolean }) {
  return (
    <Link href={offer.href} aria-hidden={echo || undefined} tabIndex={echo ? -1 : undefined} className="card w-44 flex-none overflow-hidden md:w-64">
      <div className="relative h-28 overflow-hidden md:h-40">{offer.image}</div>
      <div className="p-2">
        <p className="truncate text-[0.75rem] font-semibold leading-tight text-ink">{offer.name}</p>
        <div className="mt-1 flex items-baseline justify-between gap-1.5">
          <span className="min-w-0 truncate text-[0.625rem] leading-none text-muted">
            {[offer.place, offer.areaPerTree].filter(Boolean).join(" · ")}
          </span>
          {offer.price ? (
            <span className="flex-none whitespace-nowrap">
              <span className="font-display text-sm font-bold leading-none tabular-nums text-gold">{offer.price}</span>
              <span className="ms-0.5 text-[0.5rem] leading-none text-muted">{from}</span>
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function LeafGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20C11 12 14 7 21 4c1 7-2 13-10 14z" />
    </svg>
  );
}

function ArrowGo({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12H4m0 0 6-6m-6 6 6 6" />
    </svg>
  );
}

function SearchGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

function GridGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}
