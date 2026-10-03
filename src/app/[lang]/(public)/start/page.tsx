import type { Metadata } from "next";

import { Breadcrumb } from "@/components/site/breadcrumb";
import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { SitePhoto } from "@/components/site/site-photo";
import { getPublicConfig, t } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

import { getCalculatorLists, readCalculatorChoices } from "./calculator";
import { startCopy, startTaglines } from "./copy";
import { StartChooser } from "./start-chooser";

// MIL-02: the page's own copy comes from settings too, like /register's.
export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: t(config, "site.start_meta_title"),
    description: t(config, "site.start_meta_description"),
  };
}

/**
 * The calculator (MIL-01, P2-6): the only place that asks the tree count, the area per tree, the offer type
 * and how the visitor would pay. The answers travel to /register in the URL. Every text and choice comes
 * from the database (MIL-02, PRN-02, LEAD-01); this page only lays them out.
 */
export default async function StartPage({ searchParams }: PageProps<"/[lang]/start">) {
  const config = await getPublicConfig();
  // Owner 2026-09-12: on the Arabic site this page is bilingual, each line with its French twin beneath
  // (src/components/site/bilingual.tsx prints the twin there and nowhere else). The twin's units and tree
  // count are the French site's own; in every other language the page speaks that language alone.
  const french = config.locale === "ar" ? await getPublicConfig("fr") : null;
  const copy = startCopy(config, french);
  const access = await moduleAccess(config, "interest_form");
  if (access === "closed") {
    return <ComingSoon title={copy.title} />;
  }

  const lists = await getCalculatorLists(config, french);
  // The home cards and «بدّل اختياراتك» on /register link here with what was already picked.
  const params = await searchParams;
  // A simulation is not stock (owner, 2026-09-18), so the last screen also points at the real offers — but only
  // where /projects actually answers: public for everyone, internal for signed-in staff, hidden otherwise (FLAG-02).

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
        taglines={startTaglines(config, french)}
        customMin={lists.customMin}
        customMax={lists.customMax}
        initial={readCalculatorChoices(lists, params)}
        wantsVisit={params.visit === "1"}
        breadcrumb={
          <Breadcrumb
            items={[
              { href: "/", ar: copy.homeLabel, fr: french ? t(config, "start.home_label_fr") : null },
              { ar: t(config, "start.breadcrumb"), fr: french ? t(config, "start.breadcrumb_fr") : null },
            ]}
          />
        }
        photo={<SitePhoto config={config} slot="start.side" aspect="3/4" sizes="(min-width: 1024px) 22rem, 100vw" />}
      />
    </>
  );
}
