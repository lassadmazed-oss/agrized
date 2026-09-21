import Link from "next/link";

import { areaPerTree, offersTitle, offerTreePrice } from "@/components/site/offers";
import { flagState, settingText, type PublicConfig } from "@/lib/config";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import { projectHref } from "@/lib/public-hrefs";
import type { PublicProject } from "@/lib/public-projects";

/**
 * The offers, moving (owner, 2026-09-21: «add another banner under it showing our offers to see movement
 * like infinite sliding», «i want the thing to feel alive»).
 *
 * WHY IT CARRIES NO COVER PHOTOGRAPHS, which is the one decision in this file worth arguing with. The live
 * offer covers are uploads, and one of them — TX-00215 — is a promotional collage reading «3,500 DT»,
 * «RENDEMENT MOYEN PAR ARBRE 28 kg» and «ESTIMATION DES GAINS ANNUELS (HUILE)». That is a yield and a return
 * promise, which PRN-01 forbids this product from making and which the disclaimer further down this very page
 * contradicts. It is the owner's data and his to fix; it is already live. But «third card in a grid» and
 * «sliding across the landing page on an endless loop» are not the same exposure, and putting a yield claim
 * in motion at the top of the page would be this component's doing, not the upload's. So the band is built
 * from what the DATABASE says about each offer — its name, its place, its trees, its area per tree, the price
 * it publishes — and every figure here is one the catalogue card already shows. The photography on this page
 * is the hero strip above, which is real grove photography from site_media.
 *
 * No figure is computed here. `offerTreePrice` and `areaPerTree` are the catalogue's own readers, so a price
 * on this band and a price on the card below it can never disagree, and the price appears only while the
 * pricing module is open to a visitor (FLAG-02, §54).
 *
 * Seamless because the list is rendered twice and the track travels -50% (.marquee, globals.css); the second
 * copy is aria-hidden so the offers are announced once. A reader who asked for no motion gets a static row —
 * see the reduced-motion rule there. Hovering or tabbing into it pauses the drift, because a link that is
 * moving is a link you have to chase.
 *
 * Server component.
 */

export type OffersTickerProps = {
  config: PublicConfig;
  offers: readonly PublicProject[];
};

export function OffersTicker({ config, offers }: OffersTickerProps) {
  // Same gate as the section below it: no band while the module is not public to a visitor.
  if (flagState(config, "projects") !== "public" || offers.length === 0) return null;

  const pricingOpen = flagState(config, "pricing") === "public";
  const unitTree = settingText(config, "offers.unit_tree", "زيتونة");
  const perTree = settingText(config, "offers.unit_per_tree", "للزيتونة");
  const fromWord = settingText(config, "start.from_prefix", "ابتداءً من");
  const place = (governorateId: number) => config.governorates.find((g) => g.id === governorateId)?.name_ar ?? "";

  const items = offers.map((offer) => {
    const price = offerTreePrice(offer, pricingOpen);
    const area = areaPerTree(offer);
    return { offer, price, area, place: place(offer.governorate_id) };
  });

  const strip = (copy: number) =>
    items.map(({ offer, price, area, place: where }) => (
      <li key={`${copy}-${offer.id}`} className="flex-none">
        <Link
          href={projectHref(offer.code)}
          tabIndex={copy === 0 ? undefined : -1}
          className="flex items-center gap-snug rounded-full border border-line bg-surface py-2 ps-5 pe-2 shadow-[var(--shadow-raise)] transition-colors hover:border-forest"
        >
          <span className="flex flex-col">
            <span className="whitespace-nowrap font-semibold leading-tight text-forest">{offer.name}</span>
            <span className="whitespace-nowrap text-caption leading-tight text-muted">
              {[
                where,
                offer.tree_count ? `${formatCount(offer.tree_count)} ${unitTree}` : null,
                area ? formatArea(area) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>

          {/* The price keeps «ابتداءً من» with it wherever it goes: it is the cheapest planting class of the
              offer, and a "from" price read as THE price is a different claim. */}
          {price !== null ? (
            <span className="flex flex-col items-center rounded-full bg-leaf-soft px-4 py-1.5 leading-tight">
              <span className="whitespace-nowrap text-[0.6875rem] text-forest/70">{fromWord}</span>
              <span className="whitespace-nowrap font-bold tabular-nums text-forest">
                {formatMillimes(price)}
              </span>
              <span className="whitespace-nowrap text-[0.6875rem] text-forest/70">{perTree}</span>
            </span>
          ) : null}
        </Link>
      </li>
    ));

  return (
    <section aria-label={offersTitle(config)} className="border-y border-line bg-paper py-snug">
      {/* Short chips want a quicker pass than a strip of photographs; twelve seconds an offer reads as a
          ticker rather than a slideshow. It is per-offer, so publishing a fourth lengthens the loop. */}
      <div className="marquee" style={{ ["--marquee-duration" as string]: `${items.length * 12}s` }}>
        <ul className="marquee-track gap-snug px-snug">
          {strip(0)}
          {/* The seam: identical content, announced once. */}
          <div aria-hidden="true" className="contents">
            {strip(1)}
          </div>
        </ul>
      </div>
    </section>
  );
}
