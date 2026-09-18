import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { getPublicConfig, optionsFor, settingBool, settingText } from "@/lib/config";
import { intakeErrorMessage } from "@/lib/errors";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { projectHref } from "@/lib/public-hrefs";
import { getPublicProjects, publicMode } from "@/lib/public-projects";

import { getCalculatorLists, quoteChoices, readCalculatorChoices, summaryInput } from "../start/calculator";
import { calculatorGap, calculatorQuery, calculatorSummary } from "../start/calculator-summary";
import { startCopy } from "../start/copy";
import { RegisterWizard, type RecapRow, type SuccessOffer } from "./register-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: settingText(config, "site.register_meta_title", "سجّل مطلبك"),
    description: settingText(
      config,
      "site.register_meta_description",
      "سجّل اهتمامك: قدّاش زيتونة تحب تبدا بيهم، وين، وكيفاش تحب تخلّص. التسجيل مجاني ولا يمثل التزاماً بالشراء.",
    ),
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

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "interest_form");
  if (access === "closed") {
    return <ComingSoon title="سجّل اهتمامك" />;
  }

  // P2-6: every calculator question lives on /start, so a visitor without a usable tree count starts there.
  const params = await searchParams;
  const lists = await getCalculatorLists(config);
  const choices = readCalculatorChoices(lists, params);
  if (!choices.treeId && choices.treesCustom === null) {
    redirect(`/start${forwardedQuery(params)}`);
  }

  const wantsVisit = params.visit === "1";
  const copy = startCopy(config);

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
            place: config.governorates.find((g) => g.id === project.governorate_id)?.name_ar ?? "",
            href: projectHref(project.code),
            coverUrl: project.cover_url,
            coverAlt: project.cover_alt_ar,
            trees: project.tree_count ? formatCount(project.tree_count) : null,
            areaPerTree: project.area_per_tree_min_m2 ? formatArea(project.area_per_tree_min_m2) : null,
            pricePerTree: project.min_price_per_tree_millimes ? formatMillimes(project.min_price_per_tree_millimes) : null,
          }));
  const quote = await quoteChoices(lists, choices);
  const summary = calculatorSummary(summaryInput(lists, choices, quote, copy));
  const gap = calculatorGap(choices, { downPercents: lists.downPercents.length, durations: lists.durations.length });
  const rows: RecapRow[] = summary.rows.flatMap((row) =>
    row.value ? [{ key: row.key, label: row.label.ar, value: row.value.ar, notes: row.notes.map((note) => note.ar) }] : [],
  );

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}
      <RegisterWizard
        governorates={config.governorates}
        goals={optionsFor(config, "goal")}
        contactTimes={optionsFor(config, "contact_time")}
        allowInternationalPhone={settingBool(config, "lead.allow_international_phone")}
        notice={settingText(config, "site.free_interest_notice")}
        consentText={settingText(config, "legal.consent_text")}
        initialWantsVisit={wantsVisit}
        choices={choices}
        recap={{
          title: settingText(config, "register.summary_title", "اختياراتك في الحاسبة"),
          rows,
          notice: summary.notice?.ar || null,
          estimateNote: summary.priced && copy.estimateNote ? copy.estimateNote : null,
          error: gap ? intakeErrorMessage(gap) : null,
          editLabel: settingText(config, "start.edit_choices", "بدّل اختياراتك"),
          editHref: `/start?${calculatorQuery(choices, wantsVisit)}`,
        }}
        successNote={settingText(config, "register.success_note", "التسجيل مجاني ولا يلزمك بالشراء.")}
        successWelcomeTitle={settingText(config, "register.success_welcome_title", "مرحباً بيك، زيتونتك بدات")}
        successWelcomeText={settingText(
          config,
          "register.success_welcome_text",
          "مطلبك وصلنا وتسجّل باسمك. من هنا للأمام نرافقوك: نراجعو اختياراتك، نتصلو بيك، ونعرضو عليك المشروع اللي يناسبك.",
        )}
        successMotivation={settingText(
          config,
          "register.success_motivation",
          "كل زيتونة تبدا بيها اليوم تولّي أصل باسمك يكبر مع الوقت، وإحنا نتلهاو بالمتابعة.",
        )}
        successProgressLabel={settingText(config, "register.success_progress_label", "شوف وين وصل المشروع")}
        offers={offers}
        offersTitle={settingText(config, "register.offers_title", "عروضنا الحالية")}
        offersText={settingText(config, "register.offers_text")}
      />
    </>
  );
}
