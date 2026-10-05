import Link from "next/link";

import { RemotePhoto } from "@/components/site/site-photo";
import type { SiteFormat } from "@/lib/format";
import { projectHref } from "@/lib/public-hrefs";
import { areaPerTree, offerTreePrice, stockCounted, type OfferStock } from "@/components/site/offers";
import type { PublicProject } from "@/lib/public-projects";

/**
 * The offers that exist today, drawn so they cannot be mistaken for a simulation (owner brief, section 3).
 *
 * THE DISTINCTION THE BRIEF ASKS FOR IS ALREADY THE SITE'S OWN RULE, and it is worth saying out loud rather
 * than inventing a second one: a real thing sits on `.card` — white, a hairline edge, a shadow, an object on
 * the page. An estimate sits on `.card-estimate` — warm sand, a dashed gold edge, no elevation at all,
 * explicitly not an object. That grammar is in globals.css with its reasoning, the offer form's figures card
 * already uses it, and the brief's «photo + clean premium white card» versus «warm sand / dashed border» is
 * the same two surfaces. So nothing new is defined here; the rule is applied, and the band under the cards
 * says in words what the materials already say.
 *
 * A photograph is the other half of it. A real offer has one; the drawn grove `RemotePhoto` falls back to is
 * for an offer whose pictures the owner has not uploaded yet, never a grey box.
 */

export function RealOffers({
  offers,
  stockOf,
  place,
  fmt,
  pricingOpen,
}: {
  offers: readonly PublicProject[];
  /** Counted over rows of public.trees (public_offer_stock), never the offer's declared tree_count. */
  stockOf: Map<string, OfferStock>;
  place: (id: number) => string;
  fmt: SiteFormat;
  pricingOpen: boolean;
}) {
  if (offers.length === 0) return null;

  // Three at most on the home page: the brief asked for two or three, and the catalogue is one tap away.
  const shown = offers.slice(0, 3);

  return (
    <section className="mt-6 md:mt-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="section-title">عروض موجودة توّا</h2>
          <p className="mt-1.5 text-sm leading-7 text-muted sm:text-base">أراضٍ حقيقية، بصورها وأرقامها. تنجم تزورها قبل أي التزام.</p>
        </div>
        <Link href="/projects" className="btn btn-secondary btn-sm flex-none border-line">
          الكل
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:mt-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((offer) => {
          const area = areaPerTree(offer);
          const price = offerTreePrice(offer, pricingOpen);
          // An offer whose trees are not numbered yet has an UNKNOWN stock, not an empty one, so it shows
          // no figure at all rather than a confident «0 متاحة» (0054's own rule).
          const stock = stockOf.get(offer.id);
          const free = stockCounted(stock) ? stock.available : null;
          return (
            <article key={offer.id} className="card flex flex-col overflow-hidden">
              <RemotePhoto
                url={offer.cover_url}
                alt={offer.cover_alt_ar}
                seed={offer.code}
                sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
                className="h-40 w-full sm:h-44"
              />

              <div className="flex flex-1 flex-col p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 font-display text-base font-bold leading-tight text-forest">{offer.name}</h3>
                  {/* Real stock, counted in Postgres over rows of public.trees — not the declared count. */}
                  {free !== null ? (
                    <span className="pill flex-none bg-leaf-soft text-forest">{fmt.formatCount(free)} متاحة</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[0.75rem] text-muted">{place(offer.governorate_id)}</p>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-dashed border-line pt-3">
                  <Fact label="الزيتونات" value={offer.tree_count !== null ? fmt.formatCount(offer.tree_count) : "—"} />
                  <Fact label="المساحة" value={offer.total_area_m2 !== null ? fmt.formatArea(Number(offer.total_area_m2)) : "—"} />
                  {offer.olive_variety ? <Fact label="الصنف" value={offer.olive_variety} /> : null}
                  {area !== null ? <Fact label="لكل زيتونة" value={fmt.formatArea(area)} /> : null}
                  {offer.tree_age_years !== null ? <Fact label="عمر الزيتون" value={`${fmt.formatCount(offer.tree_age_years)} عام`} /> : null}
                </dl>

                <div className="mt-auto pt-3">
                  {price !== null ? (
                    <p className="font-display text-lg font-bold text-forest tabular-nums">
                      {fmt.formatMillimes(price)}
                      <span className="ms-1.5 text-[0.6875rem] font-normal text-muted">سعر الزيتونة · ابتداءً من</span>
                    </p>
                  ) : null}
                  <Link href={projectHref(offer.code)} className="btn btn-primary btn-sm mt-2.5 w-full">
                    شوف العرض
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* The legend. It is one line, and it is the whole point of the section: these are not simulations. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.75rem] leading-5">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-4 flex-none rounded-md border border-line bg-surface shadow-[var(--shadow-raise)]" />
          <span className="text-ink">
            <b className="font-semibold text-forest">أرض موجودة</b> — بصورتها وأرقامها، تنجم تزورها.
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="card-estimate size-4 flex-none rounded-md" />
          <span className="text-ink">
            <b className="font-semibold text-gold">تقدير</b> — حساب تقريبي، موش عرض.
          </span>
        </span>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.625rem] text-muted">{label}</dt>
      <dd className="truncate text-[0.8125rem] font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
