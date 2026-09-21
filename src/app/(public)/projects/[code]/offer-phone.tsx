"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ProjectVideo } from "@/components/site/project-video";
import { formatMillimes } from "@/lib/format";

import { quoteOffer } from "./offer-actions";

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
  const { copy, trees: bounds } = props;
  const [trees, setTrees] = useState(bounds.opening);
  /** The figures on screen and the count they were quoted for; while they differ the price is stale. */
  const [price, setPrice] = useState(props.price);
  const [quotedFor, setQuotedFor] = useState(bounds.opening);
  /** Derived, not stored: the figures are stale from the tap until the answer lands. */
  const quoting = trees !== quotedFor;
  const [copied, setCopied] = useState(false);
  const request = useRef(0);

  const tabs: { key: TabKey; label: string; shown: boolean }[] = [
    {
      key: "info",
      label: copy.tabInfo,
      shown: Boolean(props.description) || props.facts.length > 0 || props.services.length > 0,
    },
    { key: "photos", label: copy.tabPhotos, shown: props.photos.length > 0 || Boolean(props.videoUrl) },
    { key: "location", label: copy.tabLocation, shown: Boolean(props.place || props.mapHref || props.accessNote) },
    { key: "documents", label: copy.tabDocuments, shown: props.documents.length > 0 },
  ];
  const visibleTabs = tabs.filter((tab) => tab.shown);
  const [tab, setTab] = useState<TabKey>(visibleTabs[0]?.key ?? "info");

  // The price of a basket is the database's answer, never `perTree × trees`: an offer may price its trees
  // in classes, and the intake prices the request again on submit. So the counter asks, and until the answer
  // comes back the figures on screen are the ones that were quoted last — dimmed, never wrong.
  useEffect(() => {
    if (trees === quotedFor) return;
    const ticket = (request.current += 1);
    const timer = setTimeout(() => {
      void quoteOffer({
        projectId: props.projectId,
        trees,
        paymentMode: null,
        downPercentOptionId: null,
        durationOptionId: null,
      })
        .then((quote) => {
          if (ticket !== request.current) return; // a later count already won
          if (quote && quote.pricing === "ok") {
            setPrice({ perTree: quote.price_per_tree_millimes, total: quote.total_price_millimes });
          }
          setQuotedFor(trees);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [trees, quotedFor, props.projectId]);

  const step = (by: number) => setTrees((count) => Math.min(bounds.max, Math.max(bounds.min, count + by)));

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

        {/* 2 · The place itself, edge to edge. */}
        <figure className="relative">
          {props.cover}
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

          {props.figures.length > 0 ? (
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

            <div className="mt-3.5 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[0.72rem] leading-none text-muted">{copy.total}</span>
                <span
                  aria-live="polite"
                  className={`text-[1.125rem] font-bold leading-none tabular-nums text-forest transition-opacity ${
                    quoting ? "opacity-50" : ""
                  }`}
                >
                  {priced && price.total !== null ? formatMillimes(price.total) : "—"}
                </span>
              </div>

              {/* A numeric control reads the same in both directions, so it keeps its own LTR frame:
                  minus, count, plus, exactly as drawn. The drawing's is a soft-cornered rectangle, not the
                  pill this was: a pill reads as a chip you choose, a rectangle reads as a field you set. */}
              <div dir="ltr" className="flex items-center rounded-[0.625rem] border border-line-strong p-0.5">
                <StepButton onClick={() => step(-1)} disabled={trees <= bounds.min} label={copy.minus}>
                  −
                </StepButton>
                <output className="min-w-7 text-center text-[0.9375rem] font-semibold tabular-nums">{trees}</output>
                <StepButton onClick={() => step(1)} disabled={trees >= bounds.max} label={copy.plus}>
                  +
                </StepButton>
              </div>
            </div>

            {/* PRN-01: an amount never appears without the note that says what it is. */}
            {priced && copy.priceNote ? (
              <p className="mt-3 text-caption leading-6 text-muted">{copy.priceNote}</p>
            ) : null}
          </div>

          {props.formHref ? (
            <a href={props.formHref} className="btn btn-primary mt-4 min-h-[2.625rem] w-full rounded-[0.625rem] text-[0.95rem]">
              {copy.book}
            </a>
          ) : null}
        </div>

        {/* 5 · Everything else, behind four words instead of four screens. */}
        {visibleTabs.length > 0 ? (
          <div className="border-t border-line">
            {/* The drawing's tabs are words in a row that starts at the start edge, each underlined only as
                wide as itself — not four equal columns spanning the screen with a rule under a whole third
                of it. `flex-1` was doing the spanning, so it goes; the row scrolls sideways instead if a
                fourth word ever makes it too long, which is what keeps it from wrapping into two lines. */}
            <div
              role="tablist"
              className="flex items-stretch gap-5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {visibleTabs.map((item) => {
                const current = item.key === tab;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={current}
                    aria-controls={`offer-panel-${item.key}`}
                    id={`offer-tab-${item.key}`}
                    onClick={() => setTab(item.key)}
                    className={`shrink-0 whitespace-nowrap border-b-2 py-3 text-[0.8rem] transition-colors ${
                      current ? "border-forest font-bold text-forest" : "border-transparent font-medium text-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              id={`offer-panel-${tab}`}
              aria-labelledby={`offer-tab-${tab}`}
              className="px-4 py-5"
            >
              {tab === "info" ? <InfoPanel {...props} /> : null}
              {tab === "photos" ? <PhotosPanel {...props} /> : null}
              {tab === "location" ? <LocationPanel {...props} /> : null}
              {tab === "documents" ? <DocumentsPanel {...props} /> : null}
            </div>
          </div>
        ) : null}
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
    <div className="space-y-4">
      {place ? <p className="text-[1.0625rem] font-bold text-forest">{place}</p> : null}
      {placeNote ? <p className="leading-7 text-ink/80">{placeNote}</p> : null}
      {accessNote ? (
        <section>
          <h2 className="text-sm font-semibold text-muted">{copy.accessTitle}</h2>
          <p className="mt-1 leading-7 text-ink/80">{accessNote}</p>
        </section>
      ) : null}
      {mapHref ? (
        <a href={mapHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary w-full">
          {copy.mapCta}
        </a>
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

function StepButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg text-lg font-semibold text-muted transition-colors hover:bg-leaf-soft hover:text-forest disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
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
