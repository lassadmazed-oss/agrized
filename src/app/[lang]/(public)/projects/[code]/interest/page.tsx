import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "@/components/site/link";
import { ComingSoon } from "@/components/site/module-gate";
import { getOfferStock, minTreesHint, offersTitle, stockCounted } from "@/components/site/offers";
import { Texts } from "@/components/site/texts";
import { flagState, getPublicConfig, optionsFor, settingText, t, type PublicConfig } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";
import { findProject, getProjectQuote, getPublicProjects, publicMode } from "@/lib/public-projects";

import { OfferInterestForm, type OfferChoice } from "../offer-interest-form";

/**
 * The offer's interest form, on a page of its own (owner, 2026-09-22: «in the project details I don't want
 * the form integrated in the main page — a button leading to the page of the form instead»).
 *
 * WHY IT MOVED. The form was the last section of the offer page: eleven fields, a payment question with its
 * own branches, and a figures panel that re-quotes the database on every answer — sitting under everything
 * the offer publishes. A reader who only wanted to read about the grove scrolled past a form they had not
 * asked for, and a reader who came to book scrolled past the whole offer to reach it. One screen, one job:
 * the offer page describes, this page asks.
 *
 * It loads its own data rather than receiving it. The offer page's loader is a hundred lines of stock,
 * quote and label resolution that this page needs a quarter of; re-reading the four things it does need is
 * cheaper than threading the rest through a route boundary, and both reads are the cached anon ones the
 * catalogue already makes.
 *
 * The form is refused the same way the offer page refuses it — closed module, not selling, nothing left in
 * stock — so the route cannot be reached past a door that is shut on the page that links to it.
 */

const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export async function generateMetadata({ params }: PageProps<"/[lang]/projects/[code]/interest">): Promise<Metadata> {
  const config = await getPublicConfig();
  const code = decodeURIComponent((await params).code);
  const projects = await getPublicProjects("anon", config.locale).catch(() => []);
  const project = CODE.test(code) ? findProject(projects, code) : null;
  const title = t(config, "offers.form_title");
  return { title: project ? `${title} · ${project.name}` : title };
}

// The «internal» module state checks the staff session cookie, so this page renders per request.
export const dynamic = "force-dynamic";

/**
 * One of this offer's own payment answers, narrowed to what the form needs. The answers are rows of
 * option_items (down_payment_percent, duration), so their words are the list's own in the visitor's language;
 * the Arabic the quote carries is the fallback for a row the configuration does not list.
 */
function planChoice(config: PublicConfig, choice: { id: string; label_ar: string }): OfferChoice {
  return { id: choice.id, label: config.options.find((option) => option.id === choice.id)?.label ?? choice.label_ar };
}

export default async function OfferInterestPage({ params }: PageProps<"/[lang]/projects/[code]/interest">) {
  const code = decodeURIComponent((await params).code);
  if (!CODE.test(code)) notFound();

  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={offersTitle(config)} />;
  }

  const mode = publicMode(access);
  const projects = await getPublicProjects(mode, config.locale);
  const project = findProject(projects, code);
  if (!project) notFound();

  const declaredTrees = project.tree_count ?? 0;
  const stock = await getOfferStock(project.id, mode);
  const counted = stockCounted(stock);
  const sellableTrees = counted ? stock.available : declaredTrees;
  const minTrees = stock?.minTrees ?? 1;
  const openingTrees = Math.max(1, Math.min(minTrees, Math.max(sellableTrees, 1)));

  const selling = project.status === "published" || project.status === "internal";
  const interestOpen = flagState(config, "interest_form") === "public";
  const formOpen = selling && interestOpen && sellableTrees > 0;
  // The offer page hides the door in exactly these cases, so the route behind it is shut too.
  if (!formOpen) notFound();

  const offerQuote =
    declaredTrees > 0 && project.on_tree_pricing
      ? await getProjectQuote(project.id, mode, { trees: openingTrees })
      : null;

  const visitOpen = formOpen;
  const perTreeLabel = t(config, "start.row_area_per_tree");
  const areaLabel = t(config, "start.row_total_area");
  const paymentText = t(config, "projects.payment_text");
  const treesRange = t(config, "offers.trees_hint");
  const treesHint =
    treesRange.includes("{min}") || minTrees <= 1 ? treesRange : minTreesHint(config, minTrees) || treesRange;

  const backLabel = t(config, "offers.back_to_offer");

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-8">
      {/* The way back, first and always. A form on its own page with no way out is a trap: this one names
          the offer it belongs to, so it says where «back» goes rather than just that it exists. */}
      <Link
        href={`/projects/${encodeURIComponent(code)}`}
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl text-label font-semibold text-forest hover:bg-leaf-soft"
      >
        {/* Drawn pointing right, the way back on an RTL page; mirrored where the page reads left to right. */}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 ltr:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h16m0 0-6-6m6 6-6 6" />
        </svg>
        <span className="truncate">{backLabel}</span>
      </Link>

      <p className="mb-3 text-caption text-muted">{project.name}</p>

      {/* The form's own sentences (ui.offer.form_*) travel with it; every other word arrives in its props. */}
      <Texts prefixes={["ui.offer.form_"]}>
        <OfferInterestForm
          projectId={project.id}
          projectName={project.name}
          maxTrees={sellableTrees}
          minTrees={minTrees}
          quote={offerQuote}
          // What THIS offer allows, and nothing else: an empty list is «this offer does not sell that way»
          // and the form then shows no instalment door at all. Plain serialisable rows — a Server Component
          // may hand data to a client module, never the other way round.
          downPercents={offerQuote?.choices.down_percents.map((choice) => planChoice(config, choice)) ?? []}
          durations={offerQuote?.choices.durations.map((choice) => planChoice(config, choice)) ?? []}
          payment={{
            title: t(config, "start.payment_title"),
            hint: t(config, "start.payment_hint"),
            cash: t(config, "start.payment_cash"),
            installments: t(config, "start.payment_installments"),
            downTitle: t(config, "start.down_percent_title"),
            downHint: t(config, "start.down_percent_hint"),
            durationTitle: t(config, "start.row_duration"),
            cashOnly: t(config, "offers.cash_only"),
            requiredHint: t(config, "start.continue_hint_payment"),
            installmentsRequiredHint: t(config, "start.continue_hint_installments"),
            planUnavailable: t(config, "offers.plan_unavailable"),
            // «طريقة الدفع» was a prose card two screens BELOW this question, answering something the
            // form had already asked and priced. Same setting, read where it is useful.
            note: selling ? paymentText : "",
          }}
          summary={{
            pricePerTree: t(config, "start.row_price_per_tree"),
            areaPerTree: perTreeLabel,
            totalArea: areaLabel,
            totalPrice: t(config, "start.row_total_price"),
            // The two lines above the final price when a quantity tier applied (0132/0134). The tier's own
            // name comes from the quote: it is the owner's sentence, typed once in the Back Office.
            promoBefore: t(config, "ui.promo.before"),
            promoDiscount: t(config, "ui.promo.discount"),
            promoBadge: t(config, "ui.promo.badge"),
            annualFee: t(config, "start.row_annual_fee"),
            annualFeePerTree: t(config, "start.annual_fee_per_tree"),
            down: t(config, "start.row_down"),
            duration: t(config, "start.row_duration"),
            totalFinanced: t(config, "start.row_total_financed"),
            remaining: t(config, "start.row_remaining"),
            monthly: t(config, "start.row_monthly"),
            lastInstallment: t(config, "start.last_installment"),
            installmentsCount: t(config, "start.installments_count"),
            priceUnavailable: t(config, "start.price_unavailable"),
            durationNotPriced: t(config, "start.duration_not_priced"),
            downCoversTotal: t(config, "start.down_covers_total"),
          }}
          governorates={config.governorates}
          contactTimes={optionsFor(config, "contact_time")}
          title={t(config, "offers.form_title")}
          intro={t(config, "offers.form_intro")}
          treesLabel={t(config, "offers.trees_label")}
          treesHint={treesHint}
          treesQuickPicks={settingText(config, "offers.quick_picks", "1,5,10,25,50")}
          submitLabel={t(config, "offers.submit_label")}
          visitLabel={visitOpen ? t(config, "projects.visit_cta") : ""}
          visitText={t(config, "projects.visit_text")}
          successTitle={t(config, "offers.success_title")}
          successText={t(config, "offers.success_text")}
          consentText={t(config, "legal.consent_text")}
          estimateNote={t(config, "start.estimate_note")}
          // PRN-01: the note that used to hold a band of its own between the form and the page's tail
          // now rides at the foot of the figures it qualifies.
          legalNote={t(config, "legal.parcel_card_note")}
          pricePending={t(config, "projects.price_pending")}
        />
      </Texts>
    </div>
  );
}
