import type { Metadata } from "next";

import { Breadcrumb } from "@/components/site/breadcrumb";
import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { SitePhoto } from "@/components/site/site-photo";
import { getPublicConfig, optionsFor, settingInt, settingJson, settingText } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

import { StartChooser, type StartCopy, type Taglines, type ValueItem } from "./start-chooser";

export const metadata: Metadata = {
  title: "اختيار عدد الزيتونات",
  description: "اختر عدد الزيتونات اللي تحب تبدا بيهم في مشروع المليون زيتونة. التسجيل مجاني ولا يمثل التزاماً.",
};

/** A custom tree count from the URL: a plain integer within the Back Office limits, else nothing. */
function parseCustomTrees(value: string | string[] | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
}

/**
 * Where a request begins (MIL-01): the visitor picks how many olive trees and continues to
 * /register with the choice in the URL. Every text and every choice comes from the database
 * (MIL-02, PRN-02, LEAD-01); this page only lays them out.
 */
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const config = await getPublicConfig();
  const title = settingText(config, "site.trees_question", "قدّاش زيتونة تحب تبدا بيهم؟");
  const access = await moduleAccess(config, "interest_form");
  if (access === "closed") {
    return <ComingSoon title={title} />;
  }

  const treeCounts = optionsFor(config, "tree_count");
  const downPayments = optionsFor(config, "down_payment");
  // Report v3 §6, §12: a down payment and a duration; the monthly amount is computed, never chosen.
  const durations = optionsFor(config, "duration");
  const scenarios = config.scenarios;
  const customMin = settingInt(config, "million.custom_trees_min", 1);
  const customMax = settingInt(config, "million.custom_trees_max", 5000);

  // The home page cards and the simulator link here with what was already picked, so nobody answers twice.
  const params = await searchParams;
  const pick = (list: { id: string }[], value: string | string[] | undefined) =>
    typeof value === "string" && list.some((option) => option.id === value) ? value : undefined;
  const initialTreeId = pick(treeCounts, params.trees);
  const initialCustom = initialTreeId ? undefined : parseCustomTrees(params.trees_custom, customMin, customMax);

  // French keys fall back to "" so the second line simply does not render until the settings exist.
  const copy: StartCopy = {
    title,
    titleFr: settingText(config, "site.trees_question_fr"),
    subtitle: settingText(config, "site.trees_subtitle", "اختيارك يمشي معك للخطوة الموالية. تنجم تبدّلو وقت اللي تحب."),
    subtitleFr: settingText(config, "site.trees_subtitle_fr"),
    styleQuestion: settingText(config, "site.style_question", "كيفاش تحب مشروعك يكون؟"),
    styleQuestionFr: settingText(config, "site.style_question_fr"),
    capacityTitle: settingText(config, "start.capacity_title", "قدرتك المالية"),
    capacityTitleFr: settingText(config, "start.capacity_title_fr"),
    capacityHint: settingText(config, "start.capacity_hint", "اختياري. يعاونّا نقترحولك اللي يناسبك."),
    capacityHintFr: settingText(config, "start.capacity_hint_fr"),
    summaryTitle: settingText(config, "start.summary_title", "مشروعك المبدئي"),
    summaryTitleFr: settingText(config, "start.summary_title_fr"),
    rowTrees: settingText(config, "start.row_trees", "عدد الزيتونات"),
    rowTreesFr: settingText(config, "start.row_trees_fr"),
    rowType: settingText(config, "start.row_type", "نوع المشروع"),
    rowTypeFr: settingText(config, "start.row_type_fr"),
    rowDown: settingText(config, "start.row_down", "التسبقة"),
    rowDownFr: settingText(config, "start.row_down_fr"),
    rowDuration: settingText(config, "start.row_duration", "مدة الدفع"),
    rowDurationFr: settingText(config, "start.row_duration_fr"),
    continue: settingText(config, "start.continue", "متابعة"),
    continueFr: settingText(config, "start.continue_fr"),
    continueHint: settingText(config, "start.continue_hint", "اختر عدد الزيتونات باش تكمّل."),
    continueHintFr: settingText(config, "start.continue_hint_fr"),
    secureNote: settingText(config, "start.secure_note", "التسجيل مجاني ولا يمثل التزاماً."),
    secureNoteFr: settingText(config, "start.secure_note_fr"),
    customLabel: settingText(config, "start.custom_label", "عدد آخر"),
    customLabelFr: settingText(config, "start.custom_label_fr"),
    customPlaceholder: settingText(config, "start.custom_placeholder", "مثال: 120"),
    customPlaceholderFr: settingText(config, "start.custom_placeholder_fr"),
    customHint: settingText(config, "start.custom_hint", "اكتب عدداً بين {min} و{max}."),
    customHintFr: settingText(config, "start.custom_hint_fr"),
    treesUnit: settingText(config, "start.trees_unit", "زيتونة"),
    treesUnitFr: settingText(config, "start.trees_unit_fr"),
  };

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}
      <StartChooser
        treeCounts={treeCounts}
        scenarios={scenarios}
        downPayments={downPayments}
        durations={durations}
        copy={copy}
        taglines={settingJson<Taglines>(config, "start.tier_taglines", {})}
        values={settingJson<ValueItem[]>(config, "start.values", [])}
        customMin={customMin}
        customMax={customMax}
        initialTreeId={initialTreeId}
        initialCustom={initialCustom}
        initialScenarioId={pick(scenarios, params.scenario)}
        initialDownId={pick(downPayments, params.down)}
        initialDurationId={pick(durations, params.duration)}
        breadcrumb={
          <Breadcrumb
            items={[
              {
                href: "/",
                ar: settingText(config, "start.home_label", "الرئيسية"),
                fr: settingText(config, "start.home_label_fr"),
              },
              {
                ar: settingText(config, "start.breadcrumb", "اختيار عدد الزيتونات"),
                fr: settingText(config, "start.breadcrumb_fr"),
              },
            ]}
          />
        }
        photo={<SitePhoto config={config} slot="start.side" aspect="3/4" sizes="(min-width: 1024px) 22rem, 100vw" />}
      />
    </>
  );
}
