"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ProjectVideo } from "@/components/site/project-video";
import { formatMillimes } from "@/lib/format";

/**
 * The offer, as a phone reads it (owner, 2026-09-21, on a drawing of this screen).
 *
 * The page it replaces below `md` is a column of full-width bands: hero, gallery, video, four cards of
 * facts, then the form. On a 375px screen that is roughly six screens of scrolling before the visitor
 * reaches the one number they came for, and the facts arrive in four cards that each hold two rows.
 *
 * What the drawing asks for instead, and what this component is:
 *  · the picture first, with the offer's name, its place and its own figures immediately under it;
 *  · the price of one tree, a counter, and what that many trees cost — the decision, in one block,
 *    above the fold;
 *  · everything else folded into four tabs (معلومات · صور · موقع · مستندات), so the page ends at the
 *    booking button instead of running past it.
 *
 * Nothing here is a second source of truth. Every amount is quoted by `public_project_quote` through
 * `quoteOffer()` — the counter re-asks the database and never multiplies a price by a count — and every
 * word is a setting read on the server and handed down in `copy` (CLAUDE.md: no business value, no list
 * and no user-facing sentence lives in the code).
 *
 * The desktop page is untouched and still owns everything from `md` up.
 *
 * The pictures arrive already rendered, as nodes. <RemotePhoto> reads the site's configuration and that
 * module is `server-only`, so importing it here would drag the whole config into the browser bundle — and
 * Turbopack refuses the build outright. A Server Component may hand a rendered child to a client module;
 * the other direction is what is forbidden.
 */

export type OfferPhoneFact = { label: string; value: string };
export type OfferPhotoItem = { id: string; url: string; caption: string | null; image: ReactNode };

export type OfferPhoneProps = {
  projectId: string;
  name: string;
  /** The catalogue this offer belongs to, for the back control. */
  backHref: string;
  /** The cover, rendered by the page — see the note above. */
  cover: ReactNode;
  /**
   * Every picture of the offer, cover first, for the hero to slide through (owner, 2026-09-22: «add a
   * sliding effect for the images … to feel more alive»). One picture, or none, falls back to `cover` and
   * no animation: a single frame sliding into itself is a twitch.
   */
  slides?: ReactNode[];
  place: string;
  placeNote: string;
  mapHref: string | null;
  /** «غير منشور» and friends; a published offer wears nothing. */
  status: { label: string; toneClass: string } | null;
  /** The offer's own figures, already formatted: «100 زيتونة», «576 م² للزيتونة», «40 سنة». */
  figures: string[];
  /** The two words that describe the grove itself: its variety, and whether it produces. */
  tags: { label: string; tone: "leaf" | "gold" }[];
  /** Integer millimes, quoted by the database for `trees.opening`. Null while prices are closed (PRJ-03). */
  price: { perTree: number | null; total: number | null };
  trees: { opening: number; min: number; max: number };
  description: string;
  /**
   * The four facts a buyer checks before the price, as ONE bar with hairlines between the cells
   * (owner, 2026-09-22, redesign canvas). They used to be a wrap of loose pills: a pill carries a value
   * and no label, so «49 م²» and «2.45 هـ» sat side by side with nothing saying which was which, and a
   * wrap of six of them cost two lines and read as decoration. Four labelled cells cost one.
   * Empty falls back to the pills below, so an offer that publishes nothing loses nothing.
   */
  headline?: OfferPhoneFact[];
  facts: { title: string; rows: OfferPhoneFact[] }[];
  photos: OfferPhotoItem[];
  videoUrl: string | null;
  documents: string[];
  services: string[];
  accessNote: string;
  /** The anchor of this offer's own form, or null when the offer is not taking requests. */
  formHref: string | null;
  copy: {
    back: string;
    share: string;
    shareCopied: string;
    perTreeSuffix: string;
    total: string;
    plus: string;
    minus: string;
    book: string;
    priceNote: string;
    pricePending: string;
    tabInfo: string;
    tabPhotos: string;
    tabLocation: string;
    tabDocuments: string;
    about: string;
    documentsText: string;
    servicesTitle: string;
    servicesText: string;
    videoTitle: string;
    mapCta: string;
    accessTitle: string;
  };
};

type TabKey = "info" | "photos" | "location" | "documents";

export function OfferPhone(props: OfferPhoneProps) {
  const { copy } = props;
  /* The price of ONE tree, as the page quoted it. It used to be state with a debounced re-quote behind it,
     because the counter could change the basket; the counter is gone, so the figure cannot move and the
     whole machine — state, ticket, timer, server action — went with it. The form's own page re-quotes
     properly, and `submit_offer_request` prices the request again on submit regardless. */
  const price = props.price;
  const [copied, setCopied] = useState(false);

  const tabs: { key: TabKey; label: string; shown: boolean }[] = [
    // The place leads: where the land is decides whether the rest of the page is worth reading.
    { key: "location", label: copy.tabLocation, shown: Boolean(props.place || props.mapHref || props.accessNote) },
    {
      key: "info",
      label: copy.tabInfo,
      shown: Boolean(props.description) || props.facts.length > 0 || props.services.length > 0,
    },
    { key: "photos", label: copy.tabPhotos, shown: props.photos.length > 0 || Boolean(props.videoUrl) },
    { key: "documents", label: copy.tabDocuments, shown: props.documents.length > 0 },
  ];
  const visibleTabs = tabs.filter((tab) => tab.shown);

  /** The offer's own link, shared the way a phone shares: the sheet when there is one, the clipboard otherwise. */
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: props.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // A cancelled share sheet and a refused clipboard are both "nothing happened", not an error to report.
    }
  }

  const priced = price.perTree !== null;

  return (
    /* data-offer-phone is how this screen tells the shell it carries its own top bar: below md the site
       header is hidden on any page holding one (globals.css). The drawing has no site header over this
       screen, and it is right — a back control and a logo bar are two headers, and the logo bar was 68px
       of the 812 spent saying where the reader already is. */
    <div data-offer-phone="" className="bg-surface md:hidden">
      {/* A phone layout on a tablet is a phone layout centred, not one stretched to 900px.
          WHITE, not the site's cream. Everywhere else on the site `paper` is the ground a card sits ON — it
          is what makes a card read as an object. This screen has no cards: the picture is edge to edge and
          everything under it is one sheet, which is what the drawing shows and why the drawing looks like an
          app and the cream version looked like a web page with a photo at the top. `min-h-dvh` keeps the
          sheet white all the way down when an offer is short enough not to fill the screen. */}
      <div className="mx-auto min-h-dvh max-w-md bg-surface">
        {/* 1 · The bar over the picture. The drawing puts «back» on the left because it was drawn in a
            left-to-right frame; on an RTL page the way back is the start edge, and the chevron points the
            way the reader came from. */}
        <div className="flex items-center justify-between px-4 py-2">
          <Link
            href={props.backHref}
            aria-label={copy.back}
            className="flex size-9 items-center justify-center rounded-full text-forest hover:bg-leaf-soft"
          >
            <ChevronBack />
          </Link>
          <div className="flex items-center gap-2">
            {/* Without a share sheet the link goes to the clipboard, and a copy nobody confirms reads as a
                button that did nothing. */}
            {copied ? <span className="text-caption text-muted">{copy.shareCopied}</span> : null}
            <button
              type="button"
              onClick={share}
              aria-label={copy.share}
              className="flex size-9 items-center justify-center rounded-full text-forest hover:bg-leaf-soft"
            >
              <ShareIcon />
            </button>
          </div>
        </div>

        {/* 2 · The place itself, edge to edge — and moving, when the offer has more than one picture. */}
        <figure className="relative">
          <HeroSlides slides={props.slides ?? []} fallback={props.cover} />
          {props.status ? (
            <span className={`pill absolute end-4 top-4 ${props.status.toneClass}`}>{props.status.label}</span>
          ) : null}
        </figure>

        {/* 3 · Name, place, and the offer's own figures — the facts a visitor checks before a price. */}
        {/* The drawing keeps the whole decision above the fold, and the way it does that is by being tight:
            the name, the place, the two rows of pills and the price are a single block, not five. Every step
            down in this section — the title from 30px to 24px, the pills from 1.5 to 1 of vertical padding,
            the gaps from 4/5 to 3/4 — was measured against it at 375, not chosen by eye. */}
        {/* SANS, NOT THE DISPLAY FACE. Everything titled on this site is set in Markazi, and on this screen
            the drawing is not: the name, the price and the total are all one bold sans, which is what an app
            screen reads like and what makes these figures look like controls rather than headlines. This is
            the only screen that departs, and it departs deliberately — `font-sans` is stated rather than
            inherited so nobody restores `font-display` thinking it was forgotten. */}
        <div className="px-4 pb-5 pt-4 font-sans">
          <h1 className="text-[1.375rem] font-bold leading-tight text-forest text-balance">{props.name}</h1>
          {props.place ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.8rem] text-muted">
              <PinIcon />
              <span>{props.place}</span>
            </p>
          ) : null}

          {props.headline && props.headline.length > 0 ? (
            <div className="card mt-3 flex items-center">
              {props.headline.map((cell, index) => (
                <div key={cell.label} className="flex flex-1 items-center">
                  {index > 0 ? <span aria-hidden="true" className="h-7 w-px flex-none bg-line" /> : null}
                  <p className="flex-1 px-1 py-2 text-center">
                    <span className="block text-[0.8125rem] font-bold leading-none text-ink">{cell.value}</span>
                    <span className="mt-1 block text-[0.5625rem] leading-tight text-muted">{cell.label}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : props.figures.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {props.figures.map((figure) => (
                <li key={figure} className="pill pill-line px-2.5 py-1.5 text-[0.72rem] font-medium text-ink">
                  {figure}
                </li>
              ))}
            </ul>
          ) : null}

          {props.tags.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {props.tags.map((tag) => (
                <li
                  key={tag.label}
                  className={`pill px-2.5 py-1.5 text-[0.72rem] font-medium ${
                    tag.tone === "leaf" ? "bg-leaf-soft text-forest" : "bg-gold-soft text-gold"
                  }`}
                >
                  {tag.label}
                </li>
              ))}
            </ul>
          ) : null}

          {/* 4 · The decision: what one tree costs, how many, what that costs. PRJ-03 — no price is
              published unless the database published one, and the offer still takes requests without it. */}
          <div className="mt-4">
            {priced ? (
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold leading-none tabular-nums text-forest">
                  {formatMillimes(price.perTree as number)}
                </span>
                <span className="text-[0.8rem] text-muted">{copy.perTreeSuffix}</span>
              </p>
            ) : (
              <p className="text-sm leading-6 text-muted">{copy.pricePending}</p>
            )}

            {/* THE COUNTER IS GONE (owner, 2026-09-22: «remove the − + thing»). It asked «how many» on a
                page whose job is «what is this», and it asked it twice: the form — its own page since the
                same day — opens on the same question and prices it properly. What stays here is the price
                of ONE tree, which is a fact about the offer rather than a decision about a basket. */}
            {/* PRN-01: an amount never appears without the note that says what it is. */}
            {priced && copy.priceNote ? (
              <p className="mt-3 text-caption leading-6 text-muted">{copy.priceNote}</p>
            ) : null}
          </div>

        </div>

        {/* 4b · THE DOOR, FLOATING (owner, 2026-09-22: «make it a floating button at the bottom of the
            page»). It used to be a button in the flow, a screen and a half above the end: a reader deep in
            «مستندات» had to scroll back to act. Fixed above the tab bar it is reachable from anywhere on the
            page, and it wears the form's own words — «سجّل اهتمامك بهذا العرض» — so the control and the page
            it opens say the same thing. The spacer below keeps it from covering the last section. */}
        {props.formHref ? (
          <div className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
            <a href={props.formHref} className="btn btn-primary min-h-12 w-full gap-2 rounded-2xl text-[0.95rem]">
              {copy.book}
              <span aria-hidden="true">←</span>
            </a>
          </div>
        ) : null}

        {/* 5 · Everything else, all of it, one section after another (owner, 2026-09-22: «show them all
            without the buttons»).
 
            It was four tabs. Tabs are a good trade when the panels are long and a reader wants one of them;
            here they were three short blocks — a few facts, a map, a list of documents — and the cost was
            that two thirds of what the offer publishes was invisible until someone thought to tap a word.
            On a screen a thumb already scrolls, a heading is cheaper than a control: nothing is hidden,
            nothing needs discovering, and the page is barely longer than the tallest panel used to be. */}
        {visibleTabs.length > 0 ? (
          <div className="border-t border-line">
            {visibleTabs.map((item) => (
              <section key={item.key} className="border-b border-line px-4 py-5 last:border-b-0">
                <h2 className="mb-3 font-display text-lg font-bold text-forest">{item.label}</h2>
                {item.key === "info" ? <InfoPanel {...props} /> : null}
                {item.key === "photos" ? <PhotosPanel {...props} /> : null}
                {item.key === "location" ? <LocationPanel {...props} /> : null}
                {item.key === "documents" ? <DocumentsPanel {...props} /> : null}
              </section>
            ))}
          </div>
        ) : null}

        {/* Room for the floating door, at the END of the scroll — which is the only place it covers
            anything. It used to sit where the inline button had been, halfway up the page, and opened an
            80px hole between the price and the first section. */}
        {props.formHref ? <div aria-hidden="true" className="h-20 md:hidden" /> : null}
      </div>
    </div>
  );
}

function InfoPanel({ description, facts, services, copy }: OfferPhoneProps) {
  return (
    <div className="space-y-5">
      {description ? (
        <section>
          <h2 className="text-[1.0625rem] font-bold text-forest">{copy.about}</h2>
          <p className="mt-2 whitespace-pre-line leading-7 text-ink/80">{description}</p>
        </section>
      ) : null}

      {facts.map((group) => (
        <section key={group.title}>
          <h2 className="text-[1.0625rem] font-bold text-forest">{group.title}</h2>
          <dl className="mt-2 divide-y divide-line">
            {group.rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="text-end font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {services.length > 0 ? (
        <section>
          <h2 className="text-[1.0625rem] font-bold text-forest">{copy.servicesTitle}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {services.map((label) => (
              <li key={label} className="pill bg-leaf-soft text-sm text-forest">
                {label}
              </li>
            ))}
          </ul>
          {copy.servicesText ? <p className="mt-3 text-sm leading-6 text-muted">{copy.servicesText}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function PhotosPanel({ photos, videoUrl, name, copy }: OfferPhoneProps) {
  return (
    <div className="space-y-4">
      {photos.map((photo) => (
        <figure key={photo.id}>
          <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
            {photo.image}
          </a>
          {photo.caption ? <figcaption className="mt-1.5 text-sm leading-6 text-muted">{photo.caption}</figcaption> : null}
        </figure>
      ))}

      {videoUrl ? (
        <section>
          <h2 className="text-[1.0625rem] font-bold text-forest">{copy.videoTitle}</h2>
          <div className="mt-2">
            <ProjectVideo url={videoUrl} title={`${copy.videoTitle} · ${name}`} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LocationPanel({ place, placeNote, mapHref, accessNote, copy }: OfferPhoneProps) {
  return (
    <div className="space-y-3">
      {/* A DRAWN preview, not a map (owner, 2026-09-22: «add a preview for the place box»).
 
          It is deliberately a sketch and not a screenshot of the real coordinates: a static map needs a
          keyed tile service this project does not have, and a picture of the WRONG place would be worse
          than no picture at all. What this gives is the shape of the thing — roads, a plot, a pin — so the
          box reads as a location rather than as a link, and the button under it opens the real map at the
          offer's own coordinates, which is where an exact answer belongs. */}
      {mapHref ? (
        <a href={mapHref} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-line">
          <div className="relative aspect-[2/1] bg-[#EDEADC]">
            <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
              <rect width="320" height="160" fill="#EDEADC" />
              <g stroke="#DAD5C2" strokeWidth="1">
                <path d="M0 32h320M0 64h320M0 96h320M0 128h320M40 0v160M80 0v160M120 0v160M160 0v160M200 0v160M240 0v160M280 0v160" />
              </g>
              <path d="M-10 120 Q 80 96 160 112 T 330 92" fill="none" stroke="#CFC8B0" strokeWidth="7" />
              <path d="M40 -10 Q 70 64 130 104 T 190 170" fill="none" stroke="#CFC8B0" strokeWidth="5" />
              <path d="M150 56 L228 68 L236 112 L158 102 Z" fill="#7CA03F" fillOpacity="0.32" stroke="#4F7527" strokeWidth="2" />
              <g transform="translate(192,84)">
                <path d="M0 12 C 0 12 -10 2 -10 -5 A 10 10 0 0 1 10 -5 C 10 2 0 12 0 12 Z" fill="#1B4429" />
                <circle cx="0" cy="-5" r="3.5" fill="#E7C566" />
              </g>
            </svg>
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-forest-700/85 py-2 text-caption font-semibold text-paper">
              {copy.mapCta}
              <span aria-hidden="true">←</span>
            </span>
          </div>
        </a>
      ) : null}

      {place ? <p className="text-[1.0625rem] font-bold text-forest">{place}</p> : null}
      {placeNote ? <p className="leading-7 text-ink/80">{placeNote}</p> : null}
      {accessNote ? (
        <section>
          <h3 className="text-sm font-semibold text-muted">{copy.accessTitle}</h3>
          <p className="mt-1 leading-7 text-ink/80">{accessNote}</p>
        </section>
      ) : null}
    </div>
  );
}

function DocumentsPanel({ documents, copy }: OfferPhoneProps) {
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {documents.map((label) => (
          <li key={label} className="pill pill-line px-3 py-1.5 text-sm">
            {label}
          </li>
        ))}
      </ul>
      {copy.documentsText ? <p className="mt-3 text-sm leading-6 text-muted">{copy.documentsText}</p> : null}
    </div>
  );
}


/** Points the way the reader came from, which on an RTL page is to the right. */
function ChevronBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/**
 * The hero: swipeable, and moving on its own (owner, 2026-09-22: «make the thing slidable and make the
 * slides faster»).
 *
 * WHY THIS IS NOT THE CSS SLIDER THE BANNERS USE. A keyframe animation cannot be dragged — the browser owns
 * the transform, so a finger on it does nothing and the picture keeps marching. The banners are decoration
 * and that is fine; a gallery is something a reader wants to control. So this is a native scroll-snap strip:
 * the finger scrolls it because that is what scrolling is, and a timer nudges it along when nobody is
 * touching it.
 *
 * The timer yields to the hand, and does not come back. Once someone has swiped, they are reading at their
 * own pace, and a carousel that resumes stealing the frame after a polite pause is the thing everyone hates
 * about carousels. It also stops for `prefers-reduced-motion`, where `scrollTo` is called without smoothing
 * so nothing glides.
 */
function HeroSlides({ slides, fallback }: { slides: ReactNode[]; fallback: ReactNode }) {
  const strip = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  /** Set the moment a finger touches the strip; the auto-advance never runs again after it. */
  const taken = useRef(false);

  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timer = setInterval(() => {
      const el = strip.current;
      if (!el || taken.current) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % count;
      // The strip is RTL, so its scrollLeft runs negative; `next * width` with the sign of the current
      // scroll keeps the arithmetic direction-agnostic instead of guessing at the engine's convention.
      const sign = el.scrollLeft <= 0 ? -1 : 1;
      el.scrollTo({ left: sign * next * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
    }, 2600);
    return () => clearInterval(timer);
  }, [count]);

  if (count < 2) return <>{slides[0] ?? fallback}</>;

  return (
    <div className="relative">
      <div
        ref={strip}
        onPointerDown={() => {
          taken.current = true;
        }}
        onScroll={(event) => {
          const el = event.currentTarget;
          setActive(Math.round(Math.abs(el.scrollLeft) / el.clientWidth) % count);
        }}
        className="rail-none flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {slides.map((slide, index) => (
          <div key={index} className="w-full flex-none snap-center">
            {slide}
          </div>
        ))}
      </div>

      {/* Which one is showing, and how many there are. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {slides.map((_, index) => (
          <span
            key={index}
            className={`h-1.5 rounded-full transition-all ${index === active ? "w-4 bg-paper" : "w-1.5 bg-paper/60"}`}
          />
        ))}
      </div>
    </div>
  );
}
