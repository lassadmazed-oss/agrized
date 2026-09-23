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
  /** «49 م²», the land one tree comes with, or null when the offer does not publish it. */
  areaPerTree: string | null;
  /**
   * How much of the offer is already spoken for, 0–100, or null when the trees are not numbered yet.
   * Reserved plus contracted over the whole stock — a figure `public.trees` already holds, never an estimate.
   */
  takenPercent: number | null;
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
  copy: {
    all: string;
    search: string;
    empty: string;
    pricePending: string;
    open: string;
    /** `start.from_prefix` — «ابتداءً من», set small under the price so the figure keeps the weight. */
    from: string;
    /** What the share bar counts, e.g. «عليها طلبات». */
    taken: string;
  };
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
          <div className="rail-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5">
            <FacetChip label={copy.all} current={facet === null} onPick={() => setFacet(null)} />
            {facets.map((word) => (
              <FacetChip key={word} label={word} current={facet === word} onPick={() => setFacet(word)} />
            ))}
          </div>
        ) : null}

        {/* 4 · The offers, as rows (tightened 2026-09-22 on the owner's word, «save more space»).
            What changed, and why each thing earned or lost its room:
             · the thumbnail went from 6rem to 4.25rem, which is the height of the three lines beside it, so
               the picture and the words finish level and the row is as tall as its content and no taller;
             · place and tree count were two lines of their own. They are facts of one breath, so they share
               a line as chips, and the land per tree — published, and the thing a buyer compares offers on —
               fits in the room that saved;
             · the 2.25rem arrow tile at the foot is gone. The whole row is already one link, so it was a
               second door to the same place charging a line of height for the privilege. The price took its
               end of the row instead, where the eye was going anyway;
             · the share bar is new. It is reserved + contracted over the whole stock, a figure the trees
               table already holds, and it answers «is there anything left» without a second tap.
            Four rows now fit where two did. */}
        {shown.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {shown.map((offer) => (
              <li key={offer.id}>
                <Link href={offer.href} className="card flex items-stretch gap-2.5 p-2.5 hover:border-forest">
                  <div className="relative size-17 flex-none overflow-hidden rounded-xl">{offer.image}</div>

                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                    {/* Name and price share the top line: the two things a row is scanned for. */}
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 truncate font-display text-lg font-bold leading-tight text-forest">
                        {offer.name}
                      </p>
                      {offer.price ? (
                        <p className="flex-none text-end leading-none">
                          <span className="font-display text-lg font-bold tabular-nums text-gold">{offer.price}</span>
                          <span className="mt-0.5 block text-[0.625rem] leading-none text-muted">{copy.from}</span>
                        </p>
                      ) : (
                        <span className="w-16 flex-none text-end text-[0.625rem] leading-tight text-muted">{copy.pricePending}</span>
                      )}
                    </div>

                    {/* One line of facts, in the order they are asked: where, how many, how much land each. */}
                    <ul className="flex flex-wrap items-center gap-1">
                      {offer.place ? <li className="pill pill-line">{offer.place}</li> : null}
                      <li className="pill pill-line">{offer.trees}</li>
                      {offer.areaPerTree ? <li className="pill pill-line">{offer.areaPerTree}</li> : null}
                      {offer.status ? (
                        <li className={`pill ${offer.status.toneClass}`}>{offer.status.label}</li>
                      ) : null}
                    </ul>

                    {/* A share nobody has taken yet is the same «0٪» on every offer, which is a line of
                        height spent saying nothing — the same reason the card drops its zero buckets. The bar
                        appears once the figure has moved. */}
                    {offer.takenPercent !== null && offer.takenPercent > 0 ? (
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-1 flex-1 overflow-hidden rounded-full bg-line"
                        >
                          <span
                            className="block h-full rounded-full bg-leaf"
                            style={{ inlineSize: `${offer.takenPercent}%` }}
                          />
                        </span>
                        <span className="flex-none text-[0.625rem] leading-none text-muted">
                          <span dir="ltr" className="tabular-nums">
                            {offer.takenPercent}٪
                          </span>{" "}
                          {copy.taken}
                        </span>
                      </div>
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

