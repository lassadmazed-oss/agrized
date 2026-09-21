import Link from "next/link";

import { RemotePhoto } from "@/components/site/site-photo";
import { StatusPill } from "@/components/ui";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import type { PublicProject } from "@/lib/public-projects";

/**
 * One offer in the catalogue of /projects and in «عروضنا» on the home page.
 *
 * What it answers, in the order a buyer asks it: what does it look like, where is it, how much does one
 * olive tree cost, how much land does that tree come with, and how many are still available.
 *
 * Restyled 2026-09-21 to the owner's reference drawing. The composition changed, the reading did NOT:
 *
 *  · the offer's NAME left the photograph and now opens the body, centred, so the cover is a picture of a
 *    grove rather than a title card. With no title to carry, the scrim no longer has to darken the whole
 *    frame: it is bottom-weighted, the photo comes through, and only the place line sits on the dark foot
 *    (design direction §2.4, «الشجرة تتشاف»). The reason the ramp used to reach the top — an uploaded
 *    promotional collage shouting over AgriZed's own price — is gone with the price, which is now printed
 *    on the card's own white ground where nothing can compete with it;
 *  · the three figures became three equal columns, each with its own gold glyph, split by hairlines that
 *    are inset rather than full-height. They used to be two figures on one baseline with the stock as the
 *    hero and the price filed at the foot under a hairline. Three facts, three columns, no hero: that is
 *    what the drawing shows and it is also the honest hierarchy — price, land, stock are asked together;
 *  · the card ends in a full-width button, so what to do next is a control and not an inference. It is a
 *    <span>, not a link: the whole card is already one <Link>, and an <a> inside an <a> is invalid HTML
 *    and gives the card two competing tap targets.
 *
 * Nothing is computed here. The price is the figure `public_projects()` already returned for the project's
 * cheapest planting class, and it is only ever passed in when the pricing module is open; the land price,
 * the planting cost, the margin and every formula stay in the Back Office (PRJ-03), and no word on the card
 * speaks of a yield or a return (PRN-01). «ابتداءً من» stays printed under the price, because that figure is
 * the smallest of the offer's classes and a "from" price read as THE price is a different claim.
 *
 * The three counts are rows of `public.trees`, not parcels summed in TypeScript, so they are the tree's own
 * three states — available, reserved, sold — and nothing else (migration 0054).
 */
export type OfferCardStock = {
  /**
   * Olive trees still on sale: the hero figure of the card. Null when the offer has not numbered its
   * trees yet — the stock is then unknown, not empty, and printing «0» would be a lie. The card falls
   * back to the count the offer declares, named as such.
   */
  available: number | null;
  /** Reserved for someone, not contracted. Shown only when > 0. */
  reserved: number;
  /** Contracted. Shown only when > 0. */
  sold: number;
};

export type OfferCardLabels = {
  /** The tree unit with the «متاحة» status: the word under the stock figure. */
  available: string;
  /** `offers.stock_reserved_label` — «المحجوزة». */
  reserved: string;
  /** `offers.stock_sold_label` — «المباعة». */
  sold: string;
  /** `start.row_trees` — what the stock figure counts while the trees are not numbered yet. */
  trees: string;
  /** `start.row_area_per_tree` — «المساحة لكل زيتونة». */
  areaPerTree: string;
  /** `start.row_price_per_tree` — «سعر الزيتونة». */
  pricePerTree: string;
  /** `start.from_prefix` — «ابتداءً من». Printed under the price, never dropped. */
  from: string;
  /** `projects.price_pending` — what stands in for a price that is not published yet. */
  pricePending: string;
  /**
   * `offers.card_cta_label` — «أكتشف العرض», the button at the foot.
   *
   * Optional, and only until `offerCardLabels()` (src/components/site/offers.tsx) reads the two keys:
   * that function is the one place the card's words are built from settings, and both belong there so the
   * owner can rewrite them. The defaults below keep every existing call site compiling and rendering.
   */
  cta?: string;
  /** `offers.card_cta_unavailable` — «غير متاح», the same button on an offer nobody can buy into today. */
  ctaUnavailable?: string;
};

export type OfferCardProps = {
  project: PublicProject;
  stock: OfferCardStock;
  href: string;
  /** The governorate. It is set over the foot of the cover, beside a pin. */
  place: string;
  /** Square metres one tree comes with, or null when the offer does not publish it. */
  areaPerTreeM2: number | null;
  /** Millimes for one tree, or null while the pricing module keeps it closed. */
  pricePerTreeMillimes: number | null;
  labels: OfferCardLabels;
};

/** The word on the button while the offer can still be bought into, and while it cannot. */
const CTA_FALLBACK = "أكتشف العرض";
const CTA_UNAVAILABLE_FALLBACK = "غير متاح";

type GlyphName = "price" | "area" | "tree";

/**
 * One of the three columns. `value` is a formatted figure; `note` stands in for it when there is a
 * sentence to print instead of one (an unpublished price), so a sentence never wears figure type.
 */
type StatCell = {
  key: string;
  glyph: GlyphName;
  value?: string;
  note?: string;
  label: string;
  hint?: string;
  /** A figure that is real but says «nothing left»: it keeps its place and loses its weight. */
  dim?: boolean;
};

/** The track count for however many columns the offer could fill. Three is the drawing; two is a real case. */
/**
 * One column on a phone, the drawing's own count from sm up. Written out in full rather than composed as
 * `sm:${…}`: Tailwind reads class names out of the source text, so a name built at runtime is never generated
 * and the rule silently does not exist.
 */
const CELL_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
};

export function OfferCard({ project, stock, href, place, areaPerTreeM2, pricePerTreeMillimes, labels }: OfferCardProps) {
  const facts = [
    project.olive_variety,
    project.plantation_system ? PLANTATION_LABELS[project.plantation_system] : null,
    project.production_status ? PRODUCTION_LABELS[project.production_status] : null,
  ].filter((fact): fact is string => Boolean(fact));

  // Zeros are the same on every offer and say nothing; a figure that moved is worth the room.
  const taken = [
    { key: "reserved", value: stock.reserved, label: labels.reserved },
    { key: "sold", value: stock.sold, label: labels.sold },
  ].filter((bucket) => bucket.value > 0);

  // An offer whose trees are not numbered yet has no availability to state, so the card counts what the
  // offer declares and says so, instead of a confident 0.
  const counted = stock.available !== null;
  const trees = stock.available ?? project.tree_count ?? 0;
  // Nothing left to buy is a state of the offer, not a broken read: the card stays, the button goes flat.
  const soldOut = counted && stock.available === 0;
  const open = project.offered && !soldOut;

  // The columns the offer can actually fill, in the drawing's order: price, land, stock. A price the
  // pricing module keeps closed takes no column at all unless the offer is still on sale, in which case
  // the column says so in words rather than leaving the row two-thirds full and unexplained.
  const cells: StatCell[] = [];
  if (pricePerTreeMillimes) {
    cells.push({
      key: "price",
      glyph: "price",
      value: formatMillimes(pricePerTreeMillimes),
      label: labels.pricePerTree,
      hint: labels.from,
    });
  } else if (project.offered && labels.pricePending) {
    cells.push({ key: "price", glyph: "price", note: labels.pricePending, label: labels.pricePerTree });
  }
  if (areaPerTreeM2) {
    cells.push({ key: "area", glyph: "area", value: formatArea(areaPerTreeM2), label: labels.areaPerTree });
  }
  cells.push({
    key: "trees",
    glyph: "tree",
    value: formatCount(trees),
    label: counted ? labels.available : labels.trees,
    dim: !counted || trees === 0,
  });

  return (
    <li className="card overflow-hidden transition-shadow hover:shadow-card">
      <Link href={href} className="flex h-full flex-col focus-visible:outline-offset-[-2px]">
        <OfferCover project={project} place={place} />

        <div className="flex flex-1 flex-col p-card">
          {/* The offer's own name, off the photograph and on the card's ground where it is a heading
              rather than a caption. Centred, because the three columns under it are centred too. */}
          {/* text-lg on the narrowest screen: the owner asked for two cards per row on a phone (2026-09-21),
              which leaves each one about 163px of content at 375. «عرض طريق تونس كلم 20» set at 24px takes
              four lines there and pushes the figures off the fold. */}
          <h3 className="text-center font-display text-lg font-bold leading-tight text-balance text-forest sm:text-2xl">
            {project.name}
          </h3>

          {/* Price · land · stock. The hairlines are drawn per cell and inset, so they never touch the
              card's padding and never need a physical side named: `start-0` follows `direction`. */}
          {/* One column on a phone, the drawing's three from sm up. Two cards per row leave ~163px, and three
              columns inside that is ~50px each — «4,491 د.ت» cannot be set in 50px, and the labels under it
              cannot either. Stacked, each figure keeps its own line and the card stays readable; the hairline
              turns with them, from a vertical rule between columns to a horizontal one between rows. */}
          <dl className={`mt-cozy grid grid-cols-1 sm:${CELL_COLUMNS[cells.length]}`}>
            {cells.map((cell, index) => (
              <div key={cell.key} className="stat relative items-center px-hair py-tight text-center sm:py-0">
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 top-0 h-px bg-line sm:inset-x-auto sm:inset-y-2 sm:start-0 sm:h-auto sm:w-px"
                  />
                ) : null}
                <dt className="stat-label order-3">{cell.label}</dt>
                <dd aria-hidden="true" className="order-1 mb-tight text-gold">
                  <StatGlyph name={cell.glyph} />
                </dd>
                {cell.value ? (
                  // text-xl until md, not text-2xl: three columns of a card that is itself one of three
                  // leave about 76px of content each between 640 and 768, and «4,491 د.ت» set at 24px is
                  // 76px wide — it wrapped onto two lines there and dropped that column's label below its
                  // neighbours'. The figure is still twice the label, which is the hierarchy the drawing has.
                  <dd
                    className={`order-2 font-display text-xl font-bold leading-none tabular-nums md:text-2xl ${
                      cell.dim ? "text-muted" : "text-ink"
                    }`}
                  >
                    {cell.value}
                  </dd>
                ) : (
                  // Still on sale, price not published: say so rather than leave the column empty.
                  <dd className="order-2 text-caption leading-5 text-muted">{cell.note}</dd>
                )}
                {/* «ابتداءً من»: the figure above is the smallest of the offer's planting classes, and a
                    from-price read as the price is a different promise. It rides last so the three
                    figures stay on one baseline. */}
                {cell.hint ? <dd className="order-4 text-xs leading-4 text-muted">{cell.hint}</dd> : null}
              </div>
            ))}
          </dl>

          {/* What the offer is, after what it costs: variety, planting system, production stage. The
              drawing has no room for them; leaving them out would take three published facts off the
              catalogue, so they sit quiet and centred under the figures instead. */}
          {facts.length > 0 || taken.length > 0 ? (
            <ul className="mt-cozy flex flex-wrap justify-center gap-tight">
              {facts.map((fact) => (
                <li key={fact} className="pill pill-line">
                  {fact}
                </li>
              ))}
              {taken.map((bucket) => (
                <li key={bucket.key} className="pill pill-line">
                  <span dir="ltr" className="tabular-nums">
                    {formatCount(bucket.value)}
                  </span>
                  {bucket.label}
                </li>
              ))}
            </ul>
          ) : null}

          {/* The foot: one control, then the reference code. The code is what a buyer quotes on the
              phone, never what he arrives for, so it stays last and quiet — it used to open the body.
              The button is a <span>: the card is already the link, and an <a> in an <a> is invalid. */}
          <div className="mt-auto pt-cozy">
            <span className={`btn w-full ${open ? "btn-primary" : "bg-line text-ink"}`}>
              {open ? labels.cta || CTA_FALLBACK : labels.ctaUnavailable || CTA_UNAVAILABLE_FALLBACK}
              <span aria-hidden="true">←</span>
            </span>
            <p className="mt-snug text-center text-xs leading-4 text-muted">
              <span dir="ltr" className="tabular-nums">
                {project.code}
              </span>
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

/**
 * The cover, one treatment whether the offer has a photograph or not: the same 16:9 frame, the same
 * bottom-weighted scrim, the same place line — so a missing photograph is a deliberate cover (the drawn
 * grove of `RemotePhoto`) rather than a gap. The ratio is fixed on the frame, never a height, so nothing
 * crops differently at another width.
 *
 * The status pill sits at the end of the top edge and the place at the start of the bottom one, exactly as
 * the reference draws them; both sides are logical, so the pair mirrors with the document.
 *
 * The cover carries no figure of its own, so nothing on it can be mistaken for a price (PRN-01) or for a
 * stock count (PRJ-03) — those are printed below it, from the values the page was given.
 */
function OfferCover({ project, place }: { project: PublicProject; place: string }) {
  return (
    <div className="relative">
      <RemotePhoto
        url={project.cover_url}
        alt={project.cover_alt_ar}
        seed={project.id}
        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
        className="aspect-16/9"
      />
      {/* Bottom-weighted, not a blanket: the only text on the cover is the place line on its foot. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-forest-700/92 via-forest-700/26 to-forest-700/8"
      />
      {project.status !== "published" ? (
        <StatusPill
          toneClass={projectStatusTone(project.status)}
          className="absolute end-3 top-3 shadow-[var(--shadow-raise)]"
        >
          {projectStatusLabel(project.status)}
        </StatusPill>
      ) : null}
      {place ? (
        <p className="absolute inset-x-0 bottom-0 flex items-center gap-tight p-cozy text-sm font-semibold text-paper">
          <PinGlyph />
          {place}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The three column marks, drawn rather than imported: a price tag, a plot of land, an olive tree. Inline
 * SVG in currentColor, aria-hidden — the figure and its label already say everything, and no icon here
 * decides whether its column renders.
 */
function StatGlyph({ name }: { name: GlyphName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "price" ? (
        <>
          <path d="M13.1 3H5.5A2.5 2.5 0 0 0 3 5.5v7.6a2 2 0 0 0 .6 1.4l7.3 7.3a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8l-7.2-7.3a2 2 0 0 0-1.4-.7Z" />
          <path d="M7.6 7.6h.01" />
        </>
      ) : null}
      {name === "area" ? (
        <>
          <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="2.6" />
          <path d="M8.8 15.2 15.2 8.8M15.2 12.4V8.8h-3.6" />
        </>
      ) : null}
      {name === "tree" ? (
        <>
          <path d="M12 21.5v-6.8" />
          <path d="M12 16.6 9.2 14.8M12 14.6l2.8-1.8" />
          <circle cx="12" cy="7.6" r="4.3" />
          <circle cx="7.1" cy="11.2" r="2.7" />
          <circle cx="16.9" cy="11.1" r="2.5" />
        </>
      ) : null}
    </svg>
  );
}

/** The place mark on the cover's foot. Gold, so it reads on a photograph of any season. */
function PinGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0 text-gold-bright"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21.5s7-6 7-11.3a7 7 0 1 0-14 0c0 5.3 7 11.3 7 11.3Z" />
      <circle cx="12" cy="9.9" r="2.4" />
    </svg>
  );
}
