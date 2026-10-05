import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";
import Link from "@/components/site/link";

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
  /** The figure as the page's language writes it, formatted by the page like every other figure here. */
  figure: string;
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
  /**
   * «ثبّت التطبيق». Drawn between the two doors and the offers, where the visitor has seen what this is and
   * has not yet been handed anything to read. It is a slot and not a component built here because it renders
   * nothing at all on most visits — the browser decides — and this file must stay a drawing.
   */
  install?: ReactNode;

  /**
   * The journey: the demo in its phone, and the seven steps under it. It sits between the two doors and the
   * offers, because by then the visitor knows what this is and has not yet been asked to choose anything.
   */
  journey?: ReactNode;
  /**
   * «عايش برّا تونس؟» — the invitation to the diaspora pages, between the journey and the offers: the
   * visitor has just watched what the thing is and has not yet been shown stock, which is the moment the
   * question «and if I am not in the country?» actually arrives.
   *
   * A slot and not a component, like the rest of them: it is owned by another session's work and this file
   * must stay a drawing. Nothing passes it yet, and an unfilled slot renders nothing.
   */
  abroad?: ReactNode;
  /**
   * Stands in the offers' place when it is given (owner brief, 2026-10-05: «Real Offers لازم تكون أكثر
   * وضوحاً»). The sliding strip is what runs when it is not, unchanged — three premium cards and a strip of
   * thirteen are answers to different catalogues, and which one is right stays the owner's to change without
   * this file being touched again.
   */
  offersSection?: ReactNode;
  /** What exactly a buyer ends up with, and one worked example. Both after the offers, before the counter. */
  trust?: ReactNode;
  example?: ReactNode;
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
  /**
   * The language selector, for a phone (0109): the site header that carries it is not drawn there, so it sits
   * in the hero's top corner — the first thing a visitor who cannot read the page is looking for.
   */
  language?: ReactNode;
};

export function HomePhone({
  hero,
  quotes,
  progressBand,
  services,
  faq,
  closing,
  install,
  journey,
  abroad,
  offersSection,
  trust,
  example,
  copy,
  stats,
  offers,
  guideHref,
  offersHref,
  progressNote,
  progressPercent,
  language,
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
        {/* THE BRAND, ON A PHONE ONLY (owner, 2026-10-03: «in the mobile view i dont see any logo»).
            He was right, and it was not the logo that was missing — it was the whole bar. `data-phone-screen`
            above takes the site header off below md, which is deliberate: this screen carries its own
            furniture and a second navigation bar on a 375px phone is a row of nothing useful. But the lockup
            went with the bar, so AgriZed appeared NOWHERE on a phone — not at the top, not in the hero, not
            above the fold at all. A visitor arriving from a shared link met a green card with no name on it.

            The same thing happened to the language chip in 0109 and was solved the same way: what the header
            carried and the phone still needs gets re-placed on the screen itself (see `language` below). This
            is that, for the brand.

            `md:hidden` because from md the real header is drawn again and would make two lockups. The mark
            and the wordmark are the header's own, one size down. No aria-label: Wordmark renders «AgriZed»
            as text, so the link already has its name — an aria-label here would only override it with a
            worse one, and in the wrong language.

            `ms-auto` puts it on the END side (owner, 2026-10-03: «make the logo in the mobile on the other
            side left side»). It is `ms-auto` and not `ml-auto` on purpose: on the Arabic site the end IS the
            left, which is what he asked for and what he is looking at, and on the French, German, Italian
            and English sites the same rule puts it on the right. A physical `ml-auto` would pin it to the
            left in every language and break the mirror that the rest of this page — and the header's own
            lockup, with its flex-row-reverse / ltr:flex-row — keeps. The logo sits in the same place in
            every language; which hand that is depends on which way the language runs. */}
        {/* THE LANGUAGE CHIP SITS HERE, NOT ON THE PICTURE (owner, 2026-10-05: «put the language thing on
            the top in the header, not in the cover — much better, make it more visible»).
            On the photograph it had to be glass — a translucent chip with a blur, because anything solid
            would have been a hole punched in the image — and glass over a changing photograph is exactly as
            legible as whatever frame is behind it that week. In the header it is the site's own chip: paper,
            a hairline border, forest text, the same control the wide header has carried all along. */}
        <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
          {language}
          <Link href="/" className="ms-auto flex w-fit flex-row-reverse items-center gap-snug rounded-xl ltr:flex-row">
            <LogoMark className="h-9 w-auto" />
            <Wordmark className="text-[1.15rem] leading-none" />
          </Link>
        </div>

        {/* 0 · The quote strip — on a phone only (owner, 2026-09-24: «remove the quotes from the desktop
            view»). It is a sliding card of proverbs: on a 375px screen, above a photograph, it reads as the
            app greeting somebody. Across 1200px it is a wide band of aphorism sitting above the one thing the
            visitor came for, and the first impression of the business becomes a fortune cookie. The setting
            still feeds it, so emptying `site.quotes` still removes it everywhere. */}
        <div className="md:hidden">{quotes}</div>

        {/* 1 · THE HERO: THE PHOTOGRAPH AND THE WORDS, SIDE BY SIDE — NOT ONE ON TOP OF THE OTHER.
            Owner, 2026-10-05, against a screenshot of what stood here: «i don't like the shadow, even on the
            mobile the img not visible, text is over, try different layout».

            What stood here was a photograph with two dark washes over it and the words on top. Every one of
            his four complaints came from that single decision, so softening the washes would have answered
            none of them: text over a picture ALWAYS needs the picture dimmed to stay readable, and the
            dimmer it is the less of it there is to see. On a 375px screen the card was 13rem tall with a
            94 %-opaque wash across its foot — there was barely a photograph left to look at.

            So the two are separated. The picture is shown clean, at a real size, with nothing on it; the
            words sit on the page's own paper beside it (from lg) or under it (below lg), in forest and
            muted, where they need no shadow, no scrim and no backdrop to be read. The headline loses its
            text-shadow because it is no longer fighting an image, and the buttons become the site's own
            .btn pair instead of the white-pill-on-dark pair that only made sense over a photograph.

            The language chip stays on the picture's corner: it is a control, not content, and it is the one
            thing that belongs over the image. */}
        <section className="grid items-center gap-4 md:gap-6 lg:grid-cols-2 lg:gap-12">
          {/* The words come SECOND in the source and first from lg, so a phone opens on the photograph —
              which is what he is actually missing — and a wide screen reads words-then-picture. */}
          <div className="order-2 text-center lg:order-1 lg:text-start">
            {copy.badge ? (
              <span className="pill mb-2 bg-gold-soft text-forest ring-1 ring-gold/30 md:mb-4 lg:mb-6">
                <LeafGlyph />
                {copy.badge}
              </span>
            ) : null}
            {/* NO `tracking-*` AT ANY WIDTH. Letter-spacing breaks the joins in Arabic, which this project
                has already written down once in landing/hero.tsx. The size and the leading do the work. */}
            <p className="font-display text-[1.75rem] font-bold leading-[1.15] text-forest md:text-5xl lg:max-w-[15ch] lg:text-[3.75rem] lg:leading-[1.04] xl:text-[4.25rem]">
              {copy.line}
            </p>
            {/* It can be read at every width now: there is no photograph underneath it to lose a contest
                with. It used to be printed from lg only because below that it sat on the darkest part of
                the wash, on top of the picture, in a card 13rem tall. */}
            {copy.lead ? (
              <p className="mx-auto mt-2.5 max-w-prose text-sm leading-7 text-muted md:mt-4 md:text-base md:leading-8 lg:mx-0 lg:mt-7 lg:max-w-[33rem] lg:text-lg">
                {copy.lead}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-center gap-2 md:mt-6 lg:mt-9 lg:justify-start lg:gap-3">
              <Link href={offersHref} className="btn btn-primary gap-2 lg:min-h-[3.25rem] lg:px-7 lg:text-base">
                {copy.exploreCta}
                <ArrowGo className="size-4" />
              </Link>
              <Link href={guideHref} className="btn btn-secondary border-line lg:min-h-[3.25rem] lg:px-7 lg:text-base">
                {copy.guideCta}
              </Link>
            </div>
          </div>

          {/* The picture, and nothing over it but the chip. A ratio per width rather than a fixed height:
              wide on a phone where it is the top of the screen, and tall beside the words on a desktop so
              the two columns finish together. */}
          <div className="order-1 lg:order-2">
            <div className="group relative aspect-[4/3] overflow-hidden rounded-3xl shadow-[var(--shadow-card)] sm:aspect-[16/10] lg:aspect-[4/5] lg:rounded-[2rem] lg:shadow-[var(--shadow-float)]">
              <div className="absolute inset-0 [&_img]:transition-transform [&_img]:duration-[1.2s] group-hover:[&_img]:scale-[1.03]">
                {hero}
              </div>
              {/* A hairline, not a wash: it closes the card against the page without touching the image. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-ink/10 lg:rounded-[2rem]"
              />
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
          // It used to be lifted onto the foot of the hero photograph, which was one composition with it.
          // The picture is its own column now, so the bar is simply the next thing down the page.
          <section className="card mt-3 flex items-center shadow-[var(--shadow-card)] md:mt-5">
            {shownStats.map((stat, index) => (
              <div key={stat.label} className="flex flex-1 items-center">
                {index > 0 ? <span aria-hidden="true" className="h-7 w-px flex-none bg-line" /> : null}
                <p className="flex-1 py-2.5 text-center md:py-5">
                  <span className="figure-in block font-display text-lg font-bold leading-none tabular-nums text-forest md:text-3xl">
                    {stat.growing ? "+" : ""}
                    {stat.figure}
                  </span>
                  <span className="mt-1 block text-[0.625rem] leading-none text-muted md:mt-2 md:text-sm">{stat.label}</span>
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {/* THE TWO DOOR CARDS ARE GONE (owner, 2026-10-05: «remove these 2 buttons, keep the 2 simple ones
            on the top, they are the same»). «إكتشف العروض» and «إلقى العرض المناسب» led to offersHref and
            guideHref — the exact two destinations the hero's own two buttons already carry, one screen
            above. Two cards restating the two buttons is not a second chance to choose; it is the same
            choice asked twice, and it pushed everything real further down the page. */}

        {install}

        {journey}

        {abroad}

        {/* 4 · The offers, sliding (owner, 2026-09-22: «make this section slide infinitely»). A two-per-line
            grid showed four of thirteen and gave no sign the rest existed; a strip that never stops says
            «there are more» without a control and without a second screen. The same .marquee primitive the
            rest of the site uses: the list is rendered twice and the track travels exactly -50%, so the seam
            lands on an identical copy and nothing here has to know how many offers there are. The second copy
            is aria-hidden — it is the same offers, and a reader told there are twenty-six is told wrong. */}
        {offersSection ?? (offers.length > 0 ? (
          <section className="mt-4 md:mt-8">
            <div className="flex items-baseline justify-between px-0">
              <h2 className="font-display text-xl font-bold text-forest md:text-3xl">{copy.offersTitle}</h2>
              <Link
                href={offersHref}
                className="text-caption font-semibold text-forest transition-colors hover:text-leaf md:text-sm"
              >
                {copy.all}{" "}
                <span aria-hidden="true" className="inline-block ltr:-scale-x-100">
                  ←
                </span>
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

            {/* THE STRIP NO LONGER DRIVES ITSELF (owner, 2026-10-03: «offre remove it»).
                It was a marquee — the tiles rendered twice and drifted right to left forever on a 48s loop.
                The reasoning above still holds about a STRIP rather than a grid on a 375px screen, and that is
                kept: this is the same row of the same tiles at the same size. What is gone is the motion. A
                price that slides away while somebody is reading it is the one thing a page selling olive trees
                cannot afford, and «there are more» is already said by a tile cut off at the edge.

                It scrolls because the reader scrolls it: `snap-x` parks each tile at the start edge, which is
                the right edge here and the left on the Latin sites, since `scroll-ps-4` is logical. The second,
                aria-hidden copy of every offer is gone with the loop that needed it, so a screen reader now
                hears thirteen offers instead of twenty-six. */}
            <div className="-mx-4 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-ps-4 px-4 pb-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
              {offers.map((offer) => (
                <div key={offer.id} className="snap-start">
                  <OfferTile offer={offer} from={copy.from} />
                </div>
              ))}
            </div>
          </section>
        ) : null)}

        {trust}
        {example}

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

// `echo` is gone with the marquee that needed it: it marked the second, duplicated copy of every offer
// aria-hidden and out of the tab order so the loop did not read the catalogue twice. A strip the reader
// scrolls renders each offer once, so there is nothing to hide.
function OfferTile({ offer, from }: { offer: HomePhoneOffer; from: string }) {
  return (
    <Link href={offer.href} className="card w-44 flex-none overflow-hidden md:w-64">
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

/** Forward: drawn toward the physical left for the Arabic page, turned on a left-to-right one. */
function ArrowGo({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} ltr:-scale-x-100`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12H4m0 0 6-6m-6 6 6 6" />
    </svg>
  );
}


