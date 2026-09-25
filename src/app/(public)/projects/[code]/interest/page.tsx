import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/site/module-gate";
import { getOfferStock, minTreesHint, offersTitle, stockCounted } from "@/components/site/offers";
import { flagState, getPublicConfig, optionsFor, settingText } from "@/lib/config";
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

export async function generateMetadata({ params }: PageProps<"/projects/[code]/interest">): Promise<Metadata> {
  const config = await getPublicConfig();
  const code = decodeURIComponent((await params).code);
  const projects = await getPublicProjects("anon").catch(() => []);
  const project = CODE.test(code) ? findProject(projects, code) : null;
  const title = settingText(config, "offers.form_title", "سجّل اهتمامك بهذا العرض");
  return { title: project ? `${title} · ${project.name}` : title };
}

// The «internal» module state checks the staff session cookie, so this page renders per request.
export const dynamic = "force-dynamic";

/** One of this offer's own payment answers, narrowed to what the form needs. */
function planChoice(choice: { id: string; label_ar: string }): OfferChoice {
  return { id: choice.id, label_ar: choice.label_ar };
}

export default async function OfferInterestPage({ params }: PageProps<"/projects/[code]/interest">) {
  const code = decodeURIComponent((await params).code);
  if (!CODE.test(code)) notFound();

  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={offersTitle(config)} />;
  }

  const mode = publicMode(access);
  const projects = await getPublicProjects(mode);
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
  const perTreeLabel = settingText(config, "start.row_area_per_tree", "المساحة لكل زيتونة");
  const areaLabel = settingText(config, "start.row_total_area", "المساحة الجملية");
  const paymentText = settingText(config, "projects.payment_text");
  const treesRange = settingText(config, "offers.trees_hint", "من زيتونة وحدة إلى {max} زيتونة.");
  const treesHint =
    treesRange.includes("{min}") || minTrees <= 1 ? treesRange : minTreesHint(config, minTrees) || treesRange;

  const backLabel = settingText(config, "offers.back_to_offer", "رجوع للعرض");

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-8">
      {/* The way back, first and always. A form on its own page with no way out is a trap: this one names
          the offer it belongs to, so it says where «back» goes rather than just that it exists. */}
      <Link
        href={`/projects/${encodeURIComponent(code)}`}
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl text-label font-semibold text-forest hover:bg-leaf-soft"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h16m0 0-6-6m6 6-6 6" />
        </svg>
        <span className="truncate">{backLabel}</span>
      </Link>

      <p className="mb-3 text-caption text-muted">{project.name}</p>

        <OfferInterestForm
          projectId={project.id}
          projectName={project.name}
          maxTrees={sellableTrees}
          minTrees={minTrees}
          quote={offerQuote}
          // What THIS offer allows, and nothing else: an empty list is «this offer does not sell that way»
          // and the form then shows no instalment door at all. Plain serialisable rows — a Server Component
          // may hand data to a client module, never the other way round.
          downPercents={offerQuote?.choices.down_percents.map(planChoice) ?? []}
          durations={offerQuote?.choices.durations.map(planChoice) ?? []}
          payment={{
            title: settingText(config, "start.payment_title", "كيفاش تحب تخلّص؟"),
            hint: settingText(config, "start.payment_hint"),
            cash: settingText(config, "start.payment_cash", "بالحاضر"),
            installments: settingText(config, "start.payment_installments", "بالتقسيط"),
            downTitle: settingText(config, "start.down_percent_title", "نسبة التسبقة"),
            downHint: settingText(config, "start.down_percent_hint", "التسبقة تتحسب من السعر الجملي بالحاضر."),
            durationTitle: settingText(config, "start.row_duration", "مدة الدفع"),
            cashOnly: settingText(config, "offers.cash_only", "هذا العرض يتباع بالحاضر فقط."),
            requiredHint: settingText(config, "start.continue_hint_payment", "اختر طريقة الدفع باش تكمّل."),
            installmentsRequiredHint: settingText(
              config,
              "start.continue_hint_installments",
              "اختر نسبة التسبقة ومدة الدفع باش تكمّل.",
            ),
            planUnavailable: settingText(
              config,
              "offers.plan_unavailable",
              "هذه الخطة ماهيش متوفّرة في هذا العرض. اختر نسبة تسبقة ولا مدة أخرى.",
            ),
            // «طريقة الدفع» was a prose card two screens BELOW this question, answering something the
            // form had already asked and priced. Same setting, read where it is useful.
            note: selling ? paymentText : "",
          }}
          summary={{
            pricePerTree: settingText(config, "start.row_price_per_tree", "سعر الزيتونة"),
            areaPerTree: perTreeLabel,
            totalArea: areaLabel,
            totalPrice: settingText(config, "start.row_total_price", "السعر الجملي للطلب"),
            annualFee: settingText(config, "start.row_annual_fee", "معاليم الصيانة والتقليم في العام"),
            annualFeePerTree: settingText(config, "start.annual_fee_per_tree", "{amount} للزيتونة في العام"),
            down: settingText(config, "start.row_down", "التسبقة"),
            duration: settingText(config, "start.row_duration", "مدة الدفع"),
            totalFinanced: settingText(config, "start.row_total_financed", "السعر الجملي بالتقسيط"),
            remaining: settingText(config, "start.row_remaining", "المبلغ المتبقي"),
            monthly: settingText(config, "start.row_monthly", "القسط الشهري"),
            lastInstallment: settingText(config, "start.last_installment", "آخر قسط: {amount}"),
            installmentsCount: settingText(config, "start.installments_count", "{count} قسطاً"),
            priceUnavailable: settingText(config, "start.price_unavailable", "السعر يتحدّد قريباً."),
            durationNotPriced: settingText(
              config,
              "start.duration_not_priced",
              "التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى.",
            ),
            downCoversTotal: settingText(
              config,
              "start.down_covers_total",
              "التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر.",
            ),
          }}
          governorates={config.governorates}
          contactTimes={optionsFor(config, "contact_time")}
          title={settingText(config, "offers.form_title", "سجّل اهتمامك بهذا العرض")}
          intro={settingText(config, "offers.form_intro")}
          treesLabel={settingText(config, "offers.trees_label", "قدّاش زيتونة تحب من هذا العرض؟")}
          treesHint={treesHint}
          treesQuickPicks={settingText(config, "offers.quick_picks", "1,5,10,25,50")}
          submitLabel={settingText(config, "offers.submit_label", "سجّل اهتمامك بهذا العرض")}
          visitLabel={visitOpen ? settingText(config, "projects.visit_cta", "نحب نزور الأرض") : ""}
          visitText={settingText(config, "projects.visit_text")}
          successTitle={settingText(config, "offers.success_title", "وصلنا طلبك على هذا العرض")}
          successText={settingText(config, "offers.success_text")}
          consentText={settingText(config, "legal.consent_text")}
          estimateNote={settingText(config, "start.estimate_note")}
          // PRN-01: the note that used to hold a band of its own between the form and the page's tail
          // now rides at the foot of the figures it qualifies.
          legalNote={settingText(config, "legal.parcel_card_note")}
          pricePending={settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً.")}
        />
    </div>
  );
}
