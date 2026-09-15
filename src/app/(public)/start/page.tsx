import type { Metadata } from "next";

import { Breadcrumb } from "@/components/site/breadcrumb";
import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { SitePhoto } from "@/components/site/site-photo";
import { getPublicConfig, settingJson, settingText } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

import { getCalculatorLists, readCalculatorChoices } from "./calculator";
import { startCopy } from "./copy";
import { StartChooser, type Taglines, type ValueItem } from "./start-chooser";

export const metadata: Metadata = {
  title: "اختيار عدد الزيتونات",
  description: "اختر عدد الزيتونات اللي تحب تبدا بيهم في مشروع المليون زيتونة. التسجيل مجاني ولا يمثل التزاماً.",
};

/**
 * The calculator (MIL-01, P2-6): the only place that asks the tree count, the area per tree, the offer type
 * and how the visitor would pay. The answers travel to /register in the URL. Every text and choice comes
 * from the database (MIL-02, PRN-02, LEAD-01); this page only lays them out.
 */
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const config = await getPublicConfig();
  const copy = startCopy(config);
  const access = await moduleAccess(config, "interest_form");
  if (access === "closed") {
    return <ComingSoon title={copy.title} />;
  }

  const lists = await getCalculatorLists(config);
  // The home cards and «بدّل اختياراتك» on /register link here with what was already picked.
  const params = await searchParams;

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}
      <StartChooser
        treeCounts={lists.treeCounts}
        scenarios={lists.scenarios}
        spacingClasses={lists.spacingClasses}
        downPercents={lists.downPercents}
        durations={lists.durations}
        copy={copy}
        taglines={settingJson<Taglines>(config, "start.tier_taglines", {})}
        values={settingJson<ValueItem[]>(config, "start.values", [])}
        customMin={lists.customMin}
        customMax={lists.customMax}
        initial={readCalculatorChoices(lists, params)}
        wantsVisit={params.visit === "1"}
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
