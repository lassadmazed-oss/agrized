"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

/**
 * The catalogue, as a phone reads it (owner, 2026-09-21, on a drawing of this screen, «match the exact
 * design»).
 *
 * The page it replaces below `md` opens with a title, a paragraph, a stock figure, then three full-width
 * cards, and only then — past the offers — a tray of two selects and a checkbox. The drawing turns that
 * order around: a bar, a search box, one row of one-tap filters, and a list of compact rows. Choosing comes
 * before reading, and every control is within a thumb's reach of the top.
 *
 * What is drawn but is not here, and why:
 *  · the bottom tab bar belongs to the phone shell (TabBar), which already draws it on every public page;
 *  · the drawing titles the page «المشاريع». The word on this surface is whatever `offers.title` says —
 *    «عروضنا» today — because the owner renamed it in the Back Office and a second word hard-coded here
 *    would fight that rename (CLAUDE.md).
 *
 * The filter row is built from the words the offers actually carry — their production state and their
 * planting system — never from a list typed in here. An offer that says nothing contributes nothing, so
 * the row cannot offer a filter that matches no offer.
 */

export type PhoneOffer = {
  id: string;
  href: string;
  name: string;
  place: string;
  /** «100 زيتونة», formatted by the page. */
  trees: string;
  /** «4,491 د.ت», or null while prices are closed to this visitor (PRJ-03). */
  price: string | null;
  /** The status word of an offer that is no longer selling; open offers carry none. */
  status: { label: string; toneClass: string } | null;
  /** The offer's own words — «منتج», «تقليدية» — matched against the chosen filter. */
  facets: string[];
  /** Name, place and reference code, folded once by the page for the search box. */
  search: string;
  image: ReactNode;
};

export type ProjectsPhoneProps = {
  title: string;
  backHref: string;
  offers: PhoneOffer[];
  /** Every word that occurs on at least one offer, in the order the page put them. */
  facets: string[];
  copy: { all: string; search: string; empty: string; pricePending: string; open: string };
};

export function ProjectsPhone({ title, backHref, offers, facets, copy }: ProjectsPhoneProps) {
  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return offers.filter((offer) => {
      if (facet && !offer.facets.includes(facet)) return false;
      return !needle || offer.search.includes(needle);
    });
  }, [offers, query, facet]);

  return (
    // The marker the stylesheet reads to take the site's own header off a phone screen that carries its
    // own bar — below `md` only, because this tree is hidden by a utility here, not removed.
    <div data-phone-screen="" className="md:hidden">
      <div className="mx-auto max-w-md px-4 pb-8 pt-3">
        {/* 1 · The bar: the way back, and the name of the page centred on it. See <ArrowBack> for the one
            place this screen does not follow the drawing. */}
        <div className="relative flex items-center justify-start py-1">
          <Link
            href={backHref}
            aria-label={copy.open}
            className="flex size-10 items-center justify-center rounded-full text-forest hover:bg-leaf-soft"
          >
            <ArrowBack />
          </Link>
          <h1 className="pointer-events-none absolute inset-x-12 text-center font-display text-2xl font-bold text-forest">
            {title}
          </h1>
        </div>

        {/* 2 · The search box. It reads what is already on the page — name, place and reference code — so
            it answers instantly and never asks the database for a second list. */}
        <label className="mt-3 flex items-center gap-2 rounded-full bg-line/40 px-4 py-2.5">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            aria-label={copy.search}
            className="w-full bg-transparent text-base outline-none placeholder:text-muted"
          />
        </label>

        {/* 3 · One tap, one facet. «الكل» is not a value, it is the absence of one. */}
        {facets.length > 0 ? (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            <FacetChip label={copy.all} current={facet === null} onPick={() => setFacet(null)} />
            {facets.map((word) => (
              <FacetChip key={word} label={word} current={facet === word} onPick={() => setFacet(word)} />
            ))}
          </div>
        ) : null}

        {/* 4 · The offers, as rows: the picture, what it is called, where it is, how many trees, what one
            costs — and the door, where the thumb already is. */}
        {shown.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {shown.map((offer) => (
              <li key={offer.id}>
                <Link href={offer.href} className="card flex items-stretch gap-3 p-3 hover:border-forest">
                  <div className="relative w-24 flex-none overflow-hidden rounded-xl">{offer.image}</div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate font-display text-xl font-bold leading-tight text-forest">{offer.name}</p>
                    {offer.place ? <p className="mt-0.5 truncate text-sm text-muted">{offer.place}</p> : null}
                    <p className="mt-0.5 text-sm text-muted">{offer.trees}</p>

                    <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                      {offer.price ? (
                        <p className="flex items-center gap-1.5">
                          <CoinIcon />
                          <span className="font-display text-xl font-bold tabular-nums text-forest">{offer.price}</span>
                        </p>
                      ) : (
                        <p className="text-caption text-muted">{copy.pricePending}</p>
                      )}
                      <span
                        aria-hidden="true"
                        className="flex size-9 flex-none items-center justify-center rounded-xl bg-forest text-paper"
                      >
                        <ArrowGo />
                      </span>
                    </div>

                    {offer.status ? (
                      <span className={`pill mt-1.5 self-start ${offer.status.toneClass}`}>{offer.status.label}</span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 text-center leading-7 text-muted">{copy.empty}</p>
        )}
      </div>
    </div>
  );
}

function FacetChip({ label, current, onPick }: { label: string; current: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={current}
      // The chosen one fills forest, as the drawing has it — a step past .chip's own tint, which reads as a
      // hover on a phone.
      className={`chip flex-none ${current ? "border-forest bg-forest text-paper" : ""}`}
    >
      {label}
    </button>
  );
}

/**
 * Back, and forward, the way this app already draws them — not the way the drawing mirrors them.
 *
 * The mock-up is drawn in a left-to-right frame: it puts the way back on the left, pointing left, and the
 * card's door on the right, pointing right. Both are reversed here, because on an RTL page the way back is
 * the start edge and points right, and the catalogue's own «أكتشف العرض ←» has pointed left for forward on
 * this very page since before the drawing. The offer screen makes the same two choices, so the two screens
 * agree; it is the one departure from the drawing on this page and the owner has it in writing.
 */
function ArrowBack() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12h16m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowGo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 12H4m0 0 6-6m-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5 flex-none text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" strokeLinecap="round" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-gold" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.9 15.4v1.1h-1.6v-1.05c-1.2-.12-2.2-.62-2.8-1.25l.85-1.2c.6.5 1.4.9 2.35.9.9 0 1.45-.37 1.45-.98 0-.6-.5-.86-1.7-1.2-1.6-.44-2.7-1-2.7-2.5 0-1.25.9-2.1 2.3-2.33V7.5h1.6v1.06c1 .12 1.8.5 2.4 1.02l-.8 1.22c-.55-.42-1.25-.74-2.05-.74-.86 0-1.3.36-1.3.88 0 .58.55.8 1.75 1.14 1.66.47 2.65 1.1 2.65 2.57 0 1.3-.9 2.2-2.4 2.44Z" />
    </svg>
  );
}
