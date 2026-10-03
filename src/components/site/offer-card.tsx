import Link from "@/components/site/link";
import { RemotePhoto } from "@/components/site/site-photo";
import { StatusPill } from "@/components/ui";
import type { SiteFormat } from "@/lib/format";
import { projectStatusTone } from "@/lib/projects";
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
 *  · the price is the one figure that gets size, and land-per-tree and stock sit under it as label→figure
 *    rows. They were three equal centred columns with a gold glyph each and inset hairlines between them,
 *    which is what the reference drawing shows — and the drawing is a card that spans half a desktop. At
 *    two cards per row on a phone (owner, 2026-09-21) each card has ~163px of content, the three columns
 *    stacked, and three stacks of glyph + figure + label + hint spent fourteen lines of height on three
 *    numbers. The owner's word for the result was «super ugly» and he was right. Rows cost one line each,
 *    the labels keep the width they need — they come from settings, and «المساحة لكل زيتونة» does not fit
 *    in 60px — and the price is no longer one third of a committee. The reading did not change;
 *  · the card ends in a full-width button, so what to do next is a control and not an inference. It is a
 *    <span>, not a link: the whole card is already one <Link>, and an <a> inside an <a> is invalid HTML
 *    and gives the card two competing tap targets.
 *
 * Nothing is computed here. The price is the figure `public_projects()` already returned for the project's
 * cheapest planting class, and it is only ever passed in when the pricing module is open; the land price,
 * the planting cost, the margin and every formula stay in the Back Office (PRJ-03), and no word on the card
 * speaks of a yield or a return (PRN-01). «ابتداءً من» stays printed with the price, because that figure is
 * the smallest of the offer's classes and a "from" price read as THE price is a different claim. It moved
 * onto the unit's caption line rather than off the card: one line, both qualifications, neither dropped.
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

/**
 * Every word the card prints, built once per page by `offerCardLabels()` (src/components/site/offers.tsx)
 * from settings in the request's language, and the format its figures are written in. The card is a Server
 * Component on every page that renders it, so the words that depend on a figure travel as functions.
 */
export type OfferCardLabels = {
  /** `ui.cards.available_label` — «زيتونة متاحة», the word beside the stock figure, worded for `count`. */
  available: (count: number) => string;
  /** `ui.cards.reserved_count` — «3 المحجوزة», a figure and its word in one text. */
  reservedCount: (count: number) => string;
  /** `ui.cards.sold_count` — «3 المباعة». */
  soldCount: (count: number) => string;
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
  /** `ui.cards.cta_open` — «أكتشف العرض», the button at the foot. */
  cta: string;
  /** `ui.cards.cta_unavailable` — «غير متاح», the same button on an offer nobody can buy into today. */
  ctaUnavailable: string;
  /** `ui.cards.plantation_*` — the planting system's word, or the code when the owner has not named it. */
  plantation: (code: string) => string;
  /** `ui.cards.production_*` — the production stage's word. */
  production: (code: string) => string;
  /** `ui.offer.status_*` — the status pill's word. */
  status: (status: string) => string;
  /** Money, areas and counts in the page's language. */
  format: SiteFormat;
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

/**
 * One of the secondary facts under the price: land per tree, and stock. `label` is the owner's own wording
 * from settings, which is why it gets the room and the figure gets the weight.
 */
type StatCell = {
  key: string;
  value: string;
  label: string;
  /** A figure that is real but says «nothing left»: it keeps its place and loses its weight. */
  dim?: boolean;
};

export function OfferCard({ project, stock, href, place, areaPerTreeM2, pricePerTreeMillimes, labels }: OfferCardProps) {
  const facts = [
    project.olive_variety,
    project.plantation_system ? labels.plantation(project.plantation_system) : null,
    project.production_status ? labels.production(project.production_status) : null,
  ].filter((fact): fact is string => Boolean(fact));

  // Zeros are the same on every offer and say nothing; a figure that moved is worth the room.
  const taken = [
    { key: "reserved", value: stock.reserved, text: labels.reservedCount },
    { key: "sold", value: stock.sold, text: labels.soldCount },
  ].filter((bucket) => bucket.value > 0);

  // An offer whose trees are not numbered yet has no availability to state, so the card counts what the
  // offer declares and says so, instead of a confident 0.
  const counted = stock.available !== null;
  const trees = stock.available ?? project.tree_count ?? 0;
  // Nothing left to buy is a state of the offer, not a broken read: the card stays, the button goes flat.
  const soldOut = counted && stock.available === 0;
  const open = project.offered && !soldOut;

  // The price is the card's one figure of size, and the two facts under it are read against it: what one
  // tree costs, then how much land comes with it and how many are left. A price the pricing module keeps
  // closed prints the owner's own sentence in caption type, so a sentence never wears figure type.
  const fmt = labels.format;
  const price = pricePerTreeMillimes ? fmt.formatMillimes(pricePerTreeMillimes) : null;
  const pricePending = !price && project.offered ? labels.pricePending : "";

  const cells: StatCell[] = [];
  if (areaPerTreeM2) {
    cells.push({ key: "area", value: fmt.formatArea(areaPerTreeM2), label: labels.areaPerTree });
  }
  cells.push({
    key: "trees",
    value: fmt.formatCount(trees),
    label: counted ? labels.available(trees) : labels.trees,
    dim: !counted || trees === 0,
  });

  return (
    <li className="card overflow-hidden transition-shadow hover:shadow-card">
      <Link href={href} className="flex h-full flex-col focus-visible:outline-offset-[-2px]">
        <OfferCover
          project={project}
          place={place}
          status={project.status !== "published" ? labels.status(project.status) : ""}
        />

        <div className="flex flex-1 flex-col p-card">
          {/* The offer's own name, off the photograph and on the card's ground where it is a heading
              rather than a caption. Centred, because the three columns under it are centred too. */}
          {/* text-lg on the narrowest screen: the owner asked for two cards per row on a phone (2026-09-21),
              which leaves each one about 163px of content at 375. «عرض طريق تونس كلم 20» set at 24px takes
              four lines there and pushes the figures off the fold. */}
          {/* Clamped to two lines AND floored at two lines: «عرض طريق المطار» sets on one line and «عرض طريق
              تونس كلم 20» on two, so without a floor the two cards in a row start their price on different
              baselines and the pair reads as broken. min-h is in `em`, so it follows the type at every width. */}
          {/* text-balance so «عرض طريق تونس كلم 20» breaks as «عرض طريق تونس / كلم 20» instead of orphaning
              «20» on a line of its own. */}
          <h3 className="line-clamp-2 min-h-[2.5em] text-balance font-display text-[0.95rem] font-bold leading-[1.25] text-forest sm:text-xl">
            {project.name}
          </h3>

          {/* The price, the one figure on the card that gets size. «ابتداءً من» rides on the caption beside
              the unit — it is never dropped, because this figure is the smallest of the offer's planting
              classes and a from-price read as THE price is a different promise. */}
          {price ? (
            <p className="mt-snug font-display text-xl font-bold leading-none tabular-nums text-ink sm:text-2xl">
              {price}
            </p>
          ) : pricePending ? (
            <p className="mt-snug text-caption leading-5 text-muted">{pricePending}</p>
          ) : null}
          {price ? (
            <p className="mt-1 text-[0.7rem] leading-4 text-muted">
              {labels.pricePerTree}
              {labels.from ? ` · ${labels.from}` : ""}
            </p>
          ) : null}

          {/* Price · land · stock. The hairlines are drawn per cell and inset, so they never touch the
              card's padding and never need a physical side named: `start-0` follows `direction`. */}
          {/* One column on a phone, the drawing's three from sm up. Two cards per row leave ~163px, and three
              columns inside that is ~50px each — «4,491 د.ت» cannot be set in 50px, and the labels under it
              cannot either. Stacked, each figure keeps its own line and the card stays readable; the hairline
              turns with them, from a vertical rule between columns to a horizontal one between rows. */}
          {/* Land per tree and stock, as label→figure rows rather than columns.
              They were three centred columns with a gold glyph each, split by hairlines. At two cards per
              row on a phone (the owner's instruction, 2026-09-21) each card has about 163px of content, so
              the columns stacked — and a stack of three, each carrying an icon row, a figure, a label and a
              hint, spent fourteen lines of height on three numbers. That is what «super ugly» was.
              Rows instead: the label keeps the full width it needs (labels come from settings and «المساحة
              لكل زيتونة» does not fit in 60px), the figure keeps the weight, and the pair costs one line. */}
          {/* leading-4 and gap-1, not leading-5 and gap-2: «المساحة لكل زيتونة» beside a three-digit figure
              («576 م²») is about 135px and the row has 126px at 375, so that one label wraps. It is allowed
              to — the label is the owner's wording and cutting or ellipsing it would be worse — but a wrapped
              line costs 16px here instead of 20, and the cards in a row still finish level because the grid
              stretches them and the foot is pushed down by mt-auto. */}
          <dl className="mt-cozy space-y-1 border-t border-line pt-snug text-[0.7rem] leading-4 sm:text-caption sm:leading-5">
            {cells.map((cell) => (
              <div key={cell.key} className="flex items-baseline justify-between gap-1 sm:gap-2">
                <dt className="min-w-0 text-muted">{cell.label}</dt>
                <dd
                  className={`shrink-0 font-semibold tabular-nums ${cell.dim ? "text-muted" : "text-ink"}`}
                >
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>

          {/* What the offer is, after what it costs: variety, planting system, production stage. The
              drawing has no room for them; leaving them out would take three published facts off the
              catalogue, so they sit quiet and centred under the figures instead. */}
          {facts.length > 0 || taken.length > 0 ? (
            // Hidden on a phone. Two cards per row leave ~163px, where «غير منتج» and «مكثفة» wrap onto two
            // lines and land on a different count in each card — the loudest misalignment in the pair, for
            // the least valuable facts on it. They are published in full on the offer's own page, one tap
            // away, and from sm the card is wide enough to carry them on one line.
            <ul className="mt-cozy hidden flex-wrap justify-center gap-tight sm:flex">
              {facts.map((fact) => (
                <li key={fact} className="pill pill-line">
                  {fact}
                </li>
              ))}
              {taken.map((bucket) => (
                <li key={bucket.key} className="pill pill-line tabular-nums">
                  {bucket.text(bucket.value)}
                </li>
              ))}
            </ul>
          ) : null}

          {/* The foot: one control, then the reference code. The code is what a buyer quotes on the
              phone, never what he arrives for, so it stays last and quiet — it used to open the body.
              The button is a <span>: the card is already the link, and an <a> in an <a> is invalid. */}
          <div className="mt-auto pt-cozy">
            {/* `.btn` is 16px type on 1.25rem of inline padding and a 3rem box — at 163px that left «أكتشف
                العرض» about 83px and it broke across two lines with the arrow stranded, which is what the
                screenshot shows. Smaller type, tighter padding and a 2.5rem box on a phone; the class's own
                size returns at sm. 2.5rem is still a full tap target, and the whole card is the link anyway. */}
            <span
              className={`btn min-h-10 w-full gap-1 whitespace-nowrap px-2 text-sm sm:min-h-12 sm:gap-2 sm:px-5 sm:text-base ${
                open ? "btn-primary" : "bg-line text-ink"
              }`}
            >
              {open ? labels.cta : labels.ctaUnavailable}
              {/* Forward is the inline end: drawn for Arabic, turned for a left-to-right page. */}
              <span aria-hidden="true" className="inline-block ltr:-scale-x-100">
                ←
              </span>
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
function OfferCover({ project, place, status }: { project: PublicProject; place: string; status: string }) {
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
      {status ? (
        <StatusPill
          toneClass={projectStatusTone(project.status)}
          className="absolute end-3 top-3 shadow-[var(--shadow-raise)]"
        >
          {status}
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
