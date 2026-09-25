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
    /**
     * The supporting sentence, DRAWN ONLY FROM `lg`. It is `site.home_subheadline` — copy the owner already
     * wrote and that this page stopped printing when the wide composition was removed on 2026-09-23.
     *
     * Why it is desktop-only rather than everywhere: on a 375px screen the hero card is 13rem tall and the
     * promise plus two doors already fill it; a third block of prose there pushes the doors below the fold,
     * which is the exact failure the phone composition was built to fix. At 1024px and up the same card is
     * 38rem and the headline alone leaves two thirds of it empty. Empty is the reason the desktop hero reads
     * as a phone stretched wide.
     *
     * Optional, like every other sentence on this page: empty renders nothing and the composition closes up.
     */
    lead?: string;
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
        <section className="group relative overflow-hidden rounded-3xl shadow-[var(--shadow-card)] lg:rounded-[2rem] lg:shadow-[var(--shadow-float)]">
          <div className="absolute inset-0 [&_img]:transition-transform [&_img]:duration-[1.2s] group-hover:[&_img]:scale-[1.03]">{hero}</div>

          {/* DEPTH IS THREE LAYERS, NOT ONE WASH (owner, 2026-09-24: «make it nice and deep and clean»).
              A single bottom-to-top gradient flattens a photograph into a poster: every part of the image is
              dimmed by the same rule, so nothing recedes. Here the foot is darkened for the words, the start
              edge carries a second, softer wash so the headline has ground on the side it begins from, and a
              faint inset ring closes the card against the page. The sky — the reason this picture is here —
              keeps almost all of its light. */}
          {/* FROM lg THE TWO WASHES SWAP ROLES (owner, 2026-09-25: «more modern», desktop only).
              Below lg nothing here changes: the foot carries the words, so the foot is the dark end.
              At 1024px and up the words move off the foot and onto the inline-start edge, and the washes
              follow them — otherwise the page darkens the half of the picture with nothing on it and lights
              the half carrying the headline, which is how a hero ends up looking like a poster.
              So the bottom wash drops to what the figures bar needs to sit on, and the SIDE wash becomes the
              strong one. `to-l` is the inline-start here because the site is RTL at the root. The sea and the
              sky — the reason this photograph was chosen — keep their light instead of being flattened. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-forest-700/94 via-forest-700/50 to-forest-700/10 lg:from-forest-700/80 lg:via-forest-700/18 lg:via-38% lg:to-transparent"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 hidden bg-gradient-to-l from-forest-700/92 via-forest-700/55 via-44% to-transparent to-82% lg:block"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-surface/12 lg:rounded-[2rem]"
          />

          {/* CENTRED, AND WITH A FOOT TO SPARE (owner, 2026-09-24, against the mock-up). The words used to
              hang off the start edge at the bottom of the card, which is a poster composition: it reads from
              the corner, and the two doors ended up in the corner with it. The mock-up centres the promise
              and puts the figures across the foot of the photograph — so the card keeps bottom padding deep
              enough for the bar that now overlaps it, and nothing it says can end up behind that bar. */}
          {/* THE DESKTOP COMPOSITION IS ANCHORED, NOT CENTRED (owner, 2026-09-25). Below lg this is exactly
              what it was: centred on the foot of the card, which is right for a 375px screen where the card
              is 13rem tall and there is no «beside».
              From lg it stops being that composition. A centred block inside a 34rem card on a 1900px screen
              leaves a third of the width empty on each side of the words and reads as the phone layout
              stretched — which is what it literally is. Anchoring the stack to the inline-start and centring
              it VERTICALLY gives the picture a subject and the words a ground, and lets the headline run to a
              real measure instead of a centred ribbon.
              `pb` stays deep at every width: the figures bar is lifted onto the foot of this card and nothing
              said here may end up behind it. */}
          <div className="relative flex min-h-[13rem] flex-col items-center justify-end p-4 pb-14 text-center md:min-h-[26rem] md:p-9 md:pb-24 lg:min-h-[38rem] lg:items-start lg:justify-center lg:p-14 lg:pb-32 lg:text-start xl:min-h-[41rem] xl:p-16">
            {copy.badge ? (
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-surface/25 bg-surface/15 px-2.5 py-1 text-[0.6875rem] font-medium text-paper backdrop-blur-sm md:mb-4 lg:mb-6 lg:px-3.5 lg:py-1.5 lg:text-label">
                <LeafGlyph />
                {copy.badge}
              </span>
            ) : null}
            {/* NO `tracking-*` AT ANY WIDTH. Letter-spacing breaks the joins in Arabic, which this project has
                already written down once in landing/hero.tsx. The size and the leading do the work instead. */}
            <p className="max-w-2xl font-display text-[1.75rem] font-bold leading-[1.15] text-surface [text-shadow:0_2px_28px_rgb(0_0_0/0.28)] md:text-5xl lg:max-w-[15ch] lg:text-[4rem] lg:leading-[1.04] xl:text-[4.75rem]">
              {copy.line}
            </p>
            {/* The supporting sentence, from lg only — see `copy.lead`. It sits on the strong half of the side
                wash, so it is paper at 88 % over forest rather than white on a photograph. */}
            {/* MEASURED AGAINST THE PICTURE, NOT AGAINST ONE PICTURE. The card drifts through five grove
                slots the owner uploads, so this line has to stay readable over whichever is in the slot next
                month — including the brightest sea-and-sky frame, which is the one that broke it first.
                Two things keep it honest: a measure short enough that the line never leaves the strong half
                of the side wash, and the headline's own text-shadow, so the words carry their own ground
                instead of relying on the photograph being dark where they happen to fall. */}
            {copy.lead ? (
              <p className="hidden lg:mt-7 lg:block lg:max-w-[33rem] lg:text-lg lg:leading-8 lg:text-paper/90 lg:[text-shadow:0_1px_16px_rgb(0_0_0/0.45)]">
                {copy.lead}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-center gap-2 lg:mt-9 lg:justify-start lg:gap-3">
              <Link
                href={offersHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-label font-semibold text-ink shadow-[var(--shadow-card)] transition-all active:scale-[0.98] lg:min-h-[3.25rem] lg:gap-2.5 lg:px-7 lg:text-base lg:hover:-translate-y-0.5 lg:hover:shadow-[var(--shadow-float)]"
              >
                {copy.exploreCta}
                <ArrowGo className="size-4" />
              </Link>
              <Link
                href={guideHref}
                className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-surface/40 px-4 text-label font-semibold text-surface backdrop-blur-sm transition-colors hover:border-surface/70 hover:bg-surface/10 lg:min-h-[3.25rem] lg:px-7 lg:text-base"
              >
                {copy.guideCta}
              </Link>
            </div>
          </div>
        </section>

        {/* 2 · The figures. ONE bar with hairlines, not four floating tiles: four cards on four grounds read
            as four separate claims, and these are one fact about the same thing. */}
        {/* THE FIGURES OVERLAP THE HERO, as the mock-up draws them: a white bar lifted onto the foot of the
            photograph rather than the next card down the page. It is one composition that way — the promise
            and the evidence for it — instead of a picture followed by a statistic. The bar is inset from the
            card's edges so the rounded corners of the photograph still read behind it, and it is raised above
            the hero so its own shadow falls on the image. */}
        {shownStats.length > 0 ? (
          <section className="card relative z-10 -mt-10 mx-3 flex items-center shadow-[var(--shadow-float)] md:-mt-16 md:mx-10 lg:-mt-20 lg:mx-16">
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
        <section className="mt-4 grid grid-cols-2 gap-2 md:mt-8 md:gap-5">
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
          <section className="mt-4 md:mt-8">
            <div className="flex items-baseline justify-between px-0">
              <h2 className="font-display text-xl font-bold text-forest md:text-3xl">{copy.offersTitle}</h2>
              <Link
                href={offersHref}
                className="text-caption font-semibold text-forest transition-colors hover:text-leaf md:text-sm"
              >
                {copy.all} ←
              </Link>
            </div>

            {/* A GRID ON A DESKTOP, A STRIP ON A PHONE (owner, 2026-09-24: «redesign this section on the
                desktop only»).

                The marquee was asked for and is right where it was asked for: on a 375px screen two cards fit,
                a grid would show two of thirteen, and a strip that never stops says «there are more» without a
                control. Across 1100px the same primitive reads as a fault — it bleeds past both edges, so the
                first and last card are permanently sliced, and the whole row drifts while somebody is trying
                to read a price. Motion is how a phone says «scroll me»; a desktop has already shown you the
                whole row and has no such question to answer.

                So from `md` the offers settle into a grid: eight of them, three up and four at lg, each card
                whole, still, and the same height as its neighbours. «الكل» carries the rest, which is what it
                was always for. */}
            <div className="mt-3 hidden gap-4 md:grid md:grid-cols-3 lg:mt-5 lg:grid-cols-4 lg:gap-5">
              {offers.slice(0, 8).map((offer) => (
                <OfferCard key={offer.id} offer={offer} from={copy.from} />
              ))}
            </div>

            <div className="marquee -mx-4 mt-2 md:hidden" style={{ ["--marquee-duration" as string]: "48s" }}>
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
/**
 * One offer, as a desktop reads it: a picture, what it is called, where it is, and what a tree costs.
 *
 * It is a different component from <OfferTile> rather than the same one with breakpoints, because the two
 * answer different questions. The tile is a glimpse going past at 48 seconds a lap — 176px wide, one line of
 * name, a price squeezed against the place. This one is still, so it can afford the things a still card is
 * read for: a 4:3 photograph, the name on its own line, and the price on a ruled foot where the eye already
 * goes looking for it.
 *
 * THE FOOT IS DRAWN EVEN WITH NO PRICE. The pricing module can be closed (PRJ-03) and then no offer publishes
 * one; a card that dropped the row would stand shorter than the card beside it, and a grid of uneven cards
 * reads as a loading fault rather than as a fact about prices.
 */
function OfferCard({ offer, from }: { offer: HomePhoneOffer; from: string }) {
  return (
    <Link
      href={offer.href}
      className="card group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-float)] motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[4/3] overflow-hidden [&_img]:size-full [&_img]:object-cover [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-105">
        {offer.image}
      </div>
      <div className="flex flex-1 flex-col p-3.5 pb-3">
        <p className="truncate text-sm font-semibold leading-snug text-ink">{offer.name}</p>
        <p className="mt-0.5 truncate text-xs leading-snug text-muted">
          {[offer.place, offer.areaPerTree].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-auto flex items-baseline gap-1.5 border-t border-line pt-2.5">
          {offer.price ? (
            <>
              <span className="text-[0.625rem] leading-none text-muted">{from}</span>
              <span className="font-display text-base font-bold leading-none tabular-nums text-gold">
                {offer.price}
              </span>
            </>
          ) : (
            <span className="text-[0.625rem] leading-none text-muted">&nbsp;</span>
          )}
        </div>
      </div>
    </Link>
  );
}

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
