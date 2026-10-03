import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { Texts } from "@/components/site/texts";
import { formatFor, getPublicConfig, optionsFor, settingBool, t } from "@/lib/config";
import { intakeErrorMessage } from "@/lib/errors";
import { localePath } from "@/lib/i18n/locales";
import { moduleAccess } from "@/lib/modules";
import { projectHref } from "@/lib/public-hrefs";
import { getPublicProjects, publicMode } from "@/lib/public-projects";

import { getCalculatorLists, quoteChoices, readCalculatorChoices, summaryInput } from "../start/calculator";
import { calculatorGap, calculatorQuery, calculatorSummary } from "../start/calculator-summary";
import { startCopy } from "../start/copy";
import { RegisterWizard, type RecapRow, type SuccessOffer } from "./register-wizard";

/**
 * The texts the wizard reads in the browser: its own, and the five intake sentences it also checks before
 * sending (the same words the database answers with, so the visitor reads one sentence either way).
 */
const WIZARD_TEXTS = [
  "ui.register.",
  "ui.errors.invalid_full_name",
  "ui.errors.invalid_phone",
  "ui.errors.invalid_email",
  "ui.errors.invest_location_required",
  "ui.errors.consent_required",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: t(config, "site.register_meta_title"),
    description: t(config, "site.register_meta_description"),
  };
}

/** Every query parameter as it arrived, for sending a visitor on without losing any. */
function forwardedQuery(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export default async function RegisterPage({ searchParams }: PageProps<"/[lang]/register">) {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "interest_form");
  if (access === "closed") {
    // The register word, from the setting that owns it — this page is the one act it names.
    return <ComingSoon title={t(config, "site.cta_primary_label")} />;
  }

  // P2-6: every calculator question lives on /start, so a visitor without a usable tree count starts there.
  const params = await searchParams;
  const lists = await getCalculatorLists(config);
  const choices = readCalculatorChoices(lists, params);
  if (!choices.treeId && choices.treesCustom === null) {
    redirect(localePath(config.locale, `/start${forwardedQuery(params)}`));
  }

  const wantsVisit = params.visit === "1";
  const copy = startCopy(config);
  const fmt = formatFor(config);

  // Owner 2026-09-18: «in the end show the current offers after the send». The offers travel to the client
  // screen already formatted, and stay empty while the offers module is closed to this visitor.
  const offersAccess = await moduleAccess(config, "projects");
  const offers: SuccessOffer[] =
    offersAccess === "closed"
      ? []
      : (await getPublicProjects(publicMode(offersAccess)))
          .filter((project) => project.offered && project.on_tree_pricing && (project.tree_count ?? 0) > 0)
          .map((project) => ({
            code: project.code,
            name: project.name,
            place: config.governorates.find((g) => g.id === project.governorate_id)?.name ?? "",
            href: projectHref(project.code),
            coverUrl: project.cover_url,
            // The offer's own caption: written by the staff in Arabic, with no translation of its own yet.
            coverAlt: project.cover_alt_ar,
            trees: project.tree_count ? fmt.formatCount(project.tree_count) : null,
            areaPerTree: project.area_per_tree_min_m2 ? fmt.formatArea(project.area_per_tree_min_m2) : null,
            pricePerTree: project.min_price_per_tree_millimes ? fmt.formatMillimes(project.min_price_per_tree_millimes) : null,
          }));
  const quote = await quoteChoices(lists, choices);
  const summary = calculatorSummary(summaryInput(lists, choices, quote, copy));
  const gap = calculatorGap(choices, { downPercents: lists.downPercents.length, durations: lists.durations.length });
  // `ar` is the line in the page's language (calculator-summary.ts, Line).
  const rows: RecapRow[] = summary.rows.flatMap((row) =>
    row.value ? [{ key: row.key, label: row.label.ar, value: row.value.ar, notes: row.notes.map((note) => note.ar) }] : [],
  );

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}
      <Texts prefixes={WIZARD_TEXTS}>
        <RegisterWizard
          governorates={config.governorates}
          goals={optionsFor(config, "goal")}
          contactTimes={optionsFor(config, "contact_time")}
          allowInternationalPhone={settingBool(config, "lead.allow_international_phone")}
          notice={t(config, "site.free_interest_notice")}
          consentText={t(config, "legal.consent_text")}
          initialWantsVisit={wantsVisit}
          choices={choices}
          recap={{
            title: t(config, "register.summary_title"),
            rows,
            notice: summary.notice?.ar || null,
            estimateNote: summary.priced && copy.estimateNote ? copy.estimateNote : null,
            error: gap ? intakeErrorMessage(config, gap) : null,
            editLabel: t(config, "start.edit_choices"),
            editHref: `/start?${calculatorQuery(choices, wantsVisit)}`,
          }}
          successNote={t(config, "register.success_note")}
          successWelcomeTitle={t(config, "register.success_welcome_title")}
          successWelcomeText={t(config, "register.success_welcome_text")}
          successMotivation={t(config, "register.success_motivation")}
          successProgressLabel={t(config, "register.success_progress_label")}
          offers={offers}
          offersTitle={t(config, "register.offers_title")}
          offersText={t(config, "register.offers_text")}
        />
      </Texts>
    </>
  );
}
