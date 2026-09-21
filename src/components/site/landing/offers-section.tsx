import Link from "next/link";

import { OfferCard } from "@/components/site/offer-card";
import {
  areaPerTree,
  offerCardLabels,
  offersTitle,
  offerTreePrice,
  stockCounted,
  type OfferStock,
} from "@/components/site/offers";
import { estimateLabel } from "@/components/site/site-header";
import { EmptyState } from "@/components/ui";
import { flagState, settingText, type PublicConfig } from "@/lib/config";
import { projectHref } from "@/lib/public-hrefs";
import type { PublicProject } from "@/lib/public-projects";

/** How many offers the home page shows before sending the visitor to the full list. */
export const HOME_OFFERS = 3;

/** The offers this section renders, out of everything the catalogue holds. */
export function homeOffers(offers: readonly PublicProject[]): readonly PublicProject[] {
  return offers.slice(0, HOME_OFFERS);
}

export type OffersSectionProps = {
  config: PublicConfig;
  /**
   * Every live offer — `offered`, with trees declared. The full list, not the slice: the «شوف العروض» link
   * under the grid appears only when the catalogue actually holds more than this section shows.
   */
  offers: readonly PublicProject[];
  /** The stock of each shown offer, keyed by project id, exactly as `getOfferStocks()` returns it. */
  stockOf: Map<string, OfferStock>;
  /** The offers to render. Defaults to the first `HOME_OFFERS`. */
  shown?: readonly PublicProject[];
};

/**
 * «عروضنا» — the real stock, on the home page.
 *
 * Everything a card prints is the catalogue's own: the same component, the same words, the same price rule,
 * so an offer is one object whether the visitor meets it here or on /projects. Nothing is computed in this
 * file. The price per tree arrives already gated (`offerTreePrice` returns null unless the pricing module is
 * open and the offer is published on tree pricing — PRJ-03, report v3 §8), the stock is a count of rows in
 * `public.trees`, and the area is the offer's own published figure.
 *
 * Restyled 2026-09-21 to the owner's reference drawing, which changes three things about the section and
 * nothing about the data:
 *
 *  · the head is CENTRED — title with a small olive leaf after it, one sentence under it — where it used to
 *    be a title at the start with the «شوف العروض» button pushed to the far end of the same line. A button
 *    beside a heading reads as the heading's control; it belongs after the cards it summarises;
 *  · the sentence under the title is `offers.intro`, a key that does not exist yet. Until the owner writes
 *    it the line is OMITTED, not invented — and `projects.intro` is deliberately not borrowed, because it is
 *    already printed on the stock door in the hero and repeating it is the complaint this rebuild answers;
 *  · the legal note keeps its place under the grid. It is the note that belongs to the figures a visitor is
 *    looking at (PRN-01), and it is not optional on a section that prints a price.
 *
 * INTEGRATION — src/app/(public)/page.tsx section 03 (the `offersOpen ? <section>…</section> : null` block)
 * becomes, with `shownOffers` already computed from `homeOffers(offers)`:
 *
 *   <OffersSection config={config} offers={offers} shown={shownOffers} stockOf={stockOf} />
 *
 * The page keeps reading the offers itself, because the hero's stock door needs `offerPlaces` off the same
 * list. `HOME_OFFERS` and `homeOffers()` are exported from here so the page slices the list the same way
 * this section renders it, and reads the stock of exactly the offers that will be shown.
 */
export function OffersSection({ config, offers, stockOf, shown = homeOffers(offers) }: OffersSectionProps) {
  // Report v3 §17: the section exists only while the module is public, so it never shows stock a visitor
  // cannot open. The page gates it too; saying it here as well keeps the component safe on its own.
  if (flagState(config, "projects") !== "public") return null;

  const title = offersTitle(config);
  const intro = settingText(config, "offers.intro");
  const offersCta = settingText(config, "site.cta_offers_label", "شوف العروض");
  const note = settingText(config, "legal.parcel_card_note");
  const interestOpen = flagState(config, "interest_form") === "public";
  const estimateCta = estimateLabel(config);
  // The price of a tree exists for the visitor only while the pricing module is open to them (FLAG-02).
  // Read from the flag alone, never from the staff session: the home page is prerendered for everyone (§54).
  const pricingOpen = flagState(config, "pricing") === "public";
  const labels = offerCardLabels(config);
  const place = (governorateId: number) => config.governorates.find((g) => g.id === governorateId)?.name_ar ?? "";

  return (
    // A data section: it is the densest rhythm of the page, and it stays that way on a wide screen. It sits
    // on the page's own cream ground and hands off to the dark counter band below with a hard edge — that
    // band is the separation, so nothing here needs a border.
    <section className="mx-auto max-w-6xl px-4 py-section sm:px-6">
      <div className="text-center">
        <h2 className="section-title">
          {title} <SectionLeaf className="text-leaf" />
        </h2>
        {intro ? <p className="mx-auto mt-snug max-w-2xl leading-7 text-muted">{intro}</p> : null}
      </div>

      {shown.length > 0 ? (
        <>
          {/* The catalogue's own card, not a second one: same cover, same «متاحة» figure, same «ابتداءً من». */}
          {/* Two per row on a phone (owner, 2026-09-21). One per row made the section a column of three tall
              photographs a visitor had to scroll past to learn there were three offers at all; side by side,
              the whole catalogue is one glance. The gap tightens with the columns so each card keeps its
              content width. */}
          <ul className="mt-roomy grid grid-cols-2 gap-snug sm:gap-cozy lg:grid-cols-3">
            {shown.map((offer) => {
              const stock = stockOf.get(offer.id);
              return (
                <OfferCard
                  key={offer.id}
                  project={offer}
                  stock={
                    stockCounted(stock)
                      ? { available: stock.available, reserved: stock.reserved, sold: stock.sold }
                      : { available: null, reserved: 0, sold: 0 }
                  }
                  href={projectHref(offer.code)}
                  place={place(offer.governorate_id)}
                  areaPerTreeM2={areaPerTree(offer)}
                  pricePerTreeMillimes={offerTreePrice(offer, pricingOpen)}
                  labels={labels}
                />
              );
            })}
          </ul>

          {note ? (
            <p className="mx-auto mt-cozy max-w-3xl text-center text-caption leading-6 text-muted">{note}</p>
          ) : null}

          {offersCta && offers.length > shown.length ? (
            <p className="mt-cozy text-center">
              <Link href="/projects" className="btn btn-secondary">
                {offersCta}
                <span aria-hidden="true">←</span>
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        // No stock today is said plainly; nothing here invents an offer.
        <EmptyState
          className="mt-roomy"
          action={
            interestOpen && estimateCta ? (
              <Link href="/start" className="btn btn-primary">
                {estimateCta}
              </Link>
            ) : null
          }
        >
          {settingText(
            config,
            "projects.empty_text",
            "ما فماش عروض بهذه المعايير توّا. سجّل مطلبك ونعلموك أول ما يتوفّر عرض يشبه اللي تحب.",
          )}
        </EmptyState>
      )}
    </section>
  );
}

/**
 * The small olive leaf after a section heading, as the reference draws it — which in RTL puts it on the
 * left. Decorative and inline, so `text-wrap: balance` on the heading still balances the sentence rather
 * than a flex row.
 *
 * It is drawn here and again in `million-counter.tsx` rather than shared: a nine-line decorative path is
 * cheaper duplicated than a fifth file neither section owns. If a third section wants it, it should become
 * `src/components/site/glyphs.tsx` and both call sites should move — reported, not done.
 */
function SectionLeaf({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block size-6 shrink-0 align-[-0.12em] sm:size-7 ${className}`.trim()}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21 3c-7.7 0-12.8 2.9-14.7 7.3-1 2.3-.8 4.6.3 6.3l-2.9 2.9a1 1 0 1 0 1.4 1.4l2.9-2.9c1.7 1.1 4 1.3 6.3.3C18.7 16.4 21.6 11.3 21.6 3.6A.6.6 0 0 0 21 3Z" />
    </svg>
  );
}
