import type { Metadata } from "next";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { getPublicConfig, optionsFor, settingBool, settingInt, settingText } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

import { RegisterWizard } from "./register-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: settingText(config, "site.register_meta_title", "سجّل مطلبك"),
    description: settingText(
      config,
      "site.register_meta_description",
      "سجّل مطلبك في مشروع المليون زيتونة: قداش زيتونة، وين، وكيفاش. التسجيل مجاني ولا يمثل التزاماً بالشراء.",
    ),
  };
}

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "interest_form");
  if (access === "closed") {
    return <ComingSoon title="سجّل اهتمامك" />;
  }

  const downPayments = optionsFor(config, "down_payment");
  // Report v3 §6: a down payment and a duration; the monthly amount is computed per offer, never asked.
  const durations = optionsFor(config, "duration");
  const treeCounts = optionsFor(config, "tree_count");

  // The simulator and the home page chooser link here with what the visitor already picked
  // (SIM-03, MIL-01), so nobody answers the same question twice.
  const params = await searchParams;
  const pick = (list: { id: string }[], value: string | string[] | undefined) =>
    typeof value === "string" && list.some((option) => option.id === value) ? value : undefined;

  // /start also lets the visitor type their own number (MIL-01); a listed option wins when both arrive.
  const customTreesMin = settingInt(config, "million.custom_trees_min", 1);
  const customTreesMax = settingInt(config, "million.custom_trees_max", 5000);
  const initialTreeCountId = pick(treeCounts, params.trees);
  const pickCustomTrees = (value: string | string[] | undefined) => {
    if (initialTreeCountId || typeof value !== "string" || !/^\d{1,9}$/.test(value)) return undefined;
    const count = Number(value);
    return count >= customTreesMin && count <= customTreesMax ? count : undefined;
  };

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}
      <RegisterWizard
        governorates={config.governorates}
        scenarios={config.scenarios}
        treeCounts={treeCounts}
        desiredAreas={optionsFor(config, "desired_area")}
        goals={optionsFor(config, "goal")}
        downPayments={downPayments}
        durations={durations}
        budgets={optionsFor(config, "budget")}
        contactTimes={optionsFor(config, "contact_time")}
        allowMultipleScenarios={settingBool(config, "lead.project_types_multi", true)}
        allowInternationalPhone={settingBool(config, "lead.allow_international_phone")}
        notice={settingText(config, "site.free_interest_notice")}
        consentText={settingText(config, "legal.consent_text")}
        initialDownPaymentId={pick(downPayments, params.down)}
        initialDurationId={pick(durations, params.duration)}
        initialWantsVisit={params.visit === "1"}
        initialTreeCountId={initialTreeCountId}
        initialTreeCountCustom={pickCustomTrees(params.trees_custom)}
        customTreesMin={customTreesMin}
        customTreesMax={customTreesMax}
        initialScenarioId={pick(config.scenarios, params.scenario)}
      />
    </>
  );
}
