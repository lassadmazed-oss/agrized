import Link from "next/link";

import { LandingIcon, OliveSprig } from "@/components/site/landing/hero";
import { offersTitle } from "@/components/site/offers";
import { estimateLabel } from "@/components/site/site-header";
import { SitePhoto } from "@/components/site/site-photo";
import { flagState, settingText, type PublicConfig } from "@/lib/config";
import { formatCount } from "@/lib/format";

/*
 * The two very wide cards that straddle the foot of the hero photograph.
 *
 * They are the page's two doors, and the product's first rule about them has not changed: the calculator
 * answers with a worked example, «عروضنا» is real land with a code and a number of olive trees, and the
 * two must never look alike (home-paths.tsx). The reference draws both as solid floating cards and tells
 * them apart by colour alone. This build keeps `.card-estimate` on the calculator — the warm ground, the
 * dashed gold edge and NO elevation, which is the stylesheet's way of saying «this is explicitly not an
 * object on the page» — and gives the offers card the full float. So the two are told apart by surface,
 * by edge and by elevation, which is a stronger signal than the drawing's, not a weaker one.
 *
 * WHAT THE DRAWING PUTS IN THE CALCULATOR CARD AND WE DO NOT: a phone mock-up printing «السعر التقديري
 * 112,275 د.ت». That is an amount with no note saying it is an estimate (PRN-01) and a price shown
 * without asking whether the pricing module is open to this visitor (PRJ-03) — the two rules this whole
 * page is built around. The stepper is drawn as real markup instead, with the tree count and no amount at
 * all; the price belongs on /start, where the note travels with it and the flag gates it.
 */

export type TwinCardsCopy = {
  estimatePill: string;
  estimateTitle: string;
  estimateText: string;
  estimateCta: string;
  estimateNote: string;
  /** «عدد الزيتونات» over the illustrated stepper. */
  stepperLabel: string;
  offersPill: string;
  offersTitle: string;
  offersText: string;
  offersCta: string;
};

export function twinCardsCopy(config: PublicConfig): TwinCardsCopy {
  const interestOpen = flagState(config, "interest_form") === "public";
  return {
    // NEW KEY, fallback "" — the card ships without a pill until the owner writes one.
    estimatePill: settingText(config, "site.paths_estimate_pill"),
    // «تبدا بزيتونة، ويكبر مع الوقت»: seeded, owner-editable, unused anywhere else in the app, and the
    // heading of the very paragraph below it. The drawing's heading is «احسب مشروعك» — which is also what
    // the button says, so taking it here would print the same three words twice inside one small card.
    estimateTitle: settingText(config, "site.start_title") || settingText(config, "site.unit_cta", "احسب مشروعك"),
    estimateText: settingText(config, "site.start_text"),
    estimateCta: interestOpen ? estimateLabel(config) : "",
    estimateNote: settingText(
      config,
      "start.estimate_note",
      "هذا تقدير أولي حسب الإعدادات الحالية. التفاصيل النهائية في بطاقة المشروع والعقد.",
    ),
    stepperLabel: settingText(config, "start.row_trees", "عدد الزيتونات"),
    // NEW KEY, fallback "".
    offersPill: settingText(config, "site.paths_offers_pill"),
    offersTitle: offersTitle(config),
    offersText: settingText(config, "projects.intro"),
    offersCta: settingText(config, "site.cta_offers_label", "شوف العروض"),
  };
}

export type TwinCardsProps = {
  config: PublicConfig;
  copy: TwinCardsCopy;
  estimateHref: string;
  offersHref: string;
  /** false while the offers module is closed: the calculator then stands alone at a readable width. */
  showOffers: boolean;
  /** The governorate a live offer is actually in, e.g. «صفاقس». Empty prints no lozenge. */
  place?: string;
  /** A real tree-count option from the Back Office. Absent draws no stepper, only the olive drawing. */
  sampleTreeCount?: number | null;
  /** The `site_media` slot the offers card shows. See the report: every slot is spoken for. */
  photoSlot?: string;
};

export function TwinCards({
  config,
  copy,
  estimateHref,
  offersHref,
  showOffers,
  place = "",
  sampleTreeCount = null,
  photoSlot = "home.coverage",
}: TwinCardsProps) {
  return (
    /* The cards straddle the photograph's bottom edge. The pull is 96px at desktop and 32px at 375, where
       a card lifted the full desktop amount would cover the hero's own buttons. The drawing hangs almost
       the whole card over the picture; ours cannot, because a card holding a pill, a heading, two lines,
       a call to action and the estimate note is taller than the 228px the drawing gives it.

       BELOW md THE PULL IS GONE. The phone no longer opens on a photograph at all — it opens on a greeting, a
       photo card and a 2×2 of figures (the app mock-up, owner 2026-09-21) — so a card lifted 32px had no edge
       to straddle and simply climbed over the last row of tiles. The straddle starts at sm, where the
       drawing's hero is what sits above it. */
    <section className="relative z-10 mx-auto mt-cozy max-w-7xl px-4 sm:-mt-8 sm:px-6 lg:-mt-24">
      <div className={showOffers ? "grid gap-cozy lg:grid-cols-2 lg:gap-roomy" : "mx-auto max-w-4xl"}>
        {/* ---------------------------------------------------------------- the calculator */}
        <article className="card card-estimate flex flex-col overflow-hidden rounded-[1.5rem] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)] lg:items-stretch">
          <div className="p-card sm:p-roomy">
            {copy.estimatePill ? (
              <p className="pill gap-tight bg-gold-soft px-3 py-1.5 text-caption text-gold">
                <LandingIcon name="calculator" className="size-4" />
                {copy.estimatePill}
              </p>
            ) : null}

            <h2
              className={`font-display text-2xl font-bold leading-tight text-forest sm:text-3xl ${
                copy.estimatePill ? "mt-snug" : ""
              }`}
            >
              {copy.estimateTitle}
            </h2>

            {copy.estimateText ? (
              <p className="mt-tight text-[0.95rem] leading-7 text-muted">{copy.estimateText}</p>
            ) : null}

            {copy.estimateCta ? (
              /* The reference's signature control: a solid gold disc holding a forward arrow, with the
                 label beside it toward the start. The whole row is one link, and the label is its
                 accessible name — the disc is decoration and a 48px tap target, nothing more. It stays a
                 disc at 375, where it works better than a full-width bar would. */
              <Link
                href={estimateHref}
                className="group mt-cozy inline-flex items-center gap-snug rounded-full text-forest"
              >
                <span className="font-semibold">{copy.estimateCta}</span>
                <span
                  aria-hidden="true"
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-gold-bright text-surface transition-colors group-hover:bg-gold"
                >
                  <LandingIcon name="arrow" className="size-5" />
                </span>
              </Link>
            ) : null}

            {/* PRN-01. The dashed edge above is the surface saying it; this is the sentence saying it, and
                in a card this shallow it has no other home. It is not optional. */}
            {copy.estimateNote ? (
              <p className="mt-snug text-caption leading-6 text-muted">{copy.estimateNote}</p>
            ) : null}
          </div>

          {/* The calculator's own half: no photograph at all. None of the five pictures in `site_media` is
              a close-up of olives, we hold no cut-outs with alpha, and a crop faked into a blur looks
              exactly like a mistake — so it is a gold-soft ground with the tree-count control drawn in
              markup and an olive branch drawn in line. That also keeps the two cards told apart on sight:
              the one with a real photograph is the one with real stock.
              Hidden below lg: at 375 it is decoration, and vertical space is the scarcest thing there. */}
          <div
            aria-hidden="true"
            className="relative hidden items-center justify-center overflow-hidden bg-gold-soft/60 p-roomy lg:flex"
          >
            <OliveSprig className="pointer-events-none absolute -bottom-3 start-1 w-28 text-gold/30" />
            {sampleTreeCount !== null && sampleTreeCount !== undefined ? (
              <div className="relative w-full max-w-[12.5rem] rounded-2xl bg-surface/95 p-cozy shadow-[var(--shadow-card)]">
                <p className="text-center text-caption text-muted">{copy.stepperLabel}</p>
                <div className="mt-tight flex items-center justify-between rounded-xl border border-line px-3 py-2">
                  <span className="text-lg leading-none text-muted">−</span>
                  <span className="font-display text-2xl font-bold leading-none text-forest tabular-nums">
                    {formatCount(sampleTreeCount)}
                  </span>
                  <span className="text-lg leading-none text-muted">+</span>
                </div>
              </div>
            ) : null}
          </div>
        </article>

        {/* ---------------------------------------------------------------- the offers */}
        {showOffers ? (
          /* `flex flex-col` at 375 is what makes `order` mean anything: the photograph goes ON TOP there
             (order-1) and beside the words from lg (order-2), where the article becomes a grid. Order is
             the RTL-safe way to say it — no side is ever named. */
          <article className="panel flex flex-col overflow-hidden rounded-[1.5rem] border-transparent bg-forest-700 text-paper shadow-[var(--shadow-float)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)] lg:items-stretch">
            <div className="order-2 p-card sm:p-roomy lg:order-1">
              {copy.offersPill ? (
                <p className="pill gap-tight bg-paper/15 px-3 py-1.5 text-caption text-paper">
                  <LandingIcon name="map" className="size-4" />
                  {copy.offersPill}
                </p>
              ) : null}

              <h2
                className={`font-display text-2xl font-bold leading-tight text-paper sm:text-3xl ${
                  copy.offersPill ? "mt-snug" : ""
                }`}
              >
                {copy.offersTitle}
              </h2>

              {copy.offersText ? (
                <p className="mt-tight text-[0.95rem] leading-7 text-paper/80">{copy.offersText}</p>
              ) : null}

              {copy.offersCta ? (
                <Link
                  href={offersHref}
                  className="group mt-cozy inline-flex items-center gap-snug rounded-full text-paper"
                >
                  <span className="font-semibold">{copy.offersCta}</span>
                  <span
                    aria-hidden="true"
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-surface text-forest-700 transition-colors group-hover:bg-gold-bright"
                  >
                    <LandingIcon name="arrow" className="size-5" />
                  </span>
                </Link>
              ) : null}

              {/* No estimate warning under this door: only an estimate has to announce itself as one, and
                  the note every offer carries sits under the offer cards further down the page. */}
            </div>

            <div className="relative order-1 aspect-[16/9] lg:order-2 lg:aspect-auto">
              <SitePhoto
                config={config}
                slot={photoSlot}
                fill
                sizes="(min-width: 1024px) 28vw, 100vw"
              />
              {/* The photograph meets the card's forest ground on a straight edge; the gradient is what
                  stops that edge reading as a seam. It runs from the inner side at 375 (the picture is on
                  top there) and from the inline-start side at lg (the picture is beside the words). */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-linear-to-t from-forest-700/85 via-forest-700/25 to-transparent lg:hidden"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 hidden bg-linear-to-l from-forest-700 via-forest-700/30 to-transparent lg:block"
              />
              {/* Where the live stock actually is. «صفاقس» is a row the page looked up from the offers'
                  own governorate, not a caption; an empty place prints nothing. */}
              {place ? (
                <p className="chip absolute bottom-4 start-4 gap-tight border-transparent bg-paper text-forest shadow-[var(--shadow-card)]">
                  <LandingIcon name="pin" className="size-4" />
                  {place}
                </p>
              ) : null}
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
