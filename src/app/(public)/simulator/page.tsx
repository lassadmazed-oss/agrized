import type { Metadata } from "next";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { flagState, getPublicConfig, optionsFor, settingJson, settingText } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

import { CapacitySimulator } from "./capacity-simulator";

// The "internal" module state checks the staff session cookie, so this page renders per request.
// Configuration itself stays cached (src/lib/config.ts).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "احسب قدرتك",
  description: "اختر التسبقة والقسط الشهري واعرف قدرتك التقديرية على مدد مختلفة.",
};

export default async function SimulatorPage() {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "simulator_basic");
  if (access === "closed") {
    return <ComingSoon title="احسب قدرتك" />;
  }

  const durations = settingJson<number[]>(config, "simulator.durations_months", [])
    .filter((months) => Number.isInteger(months) && months > 0)
    .sort((a, b) => a - b);

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}
      <CapacitySimulator
        downPayments={optionsFor(config, "down_payment")}
        installments={optionsFor(config, "monthly_installment")}
        durations={durations}
        legalNotice={settingText(config, "legal.no_guarantee_notice")}
        interestFormOpen={flagState(config, "interest_form") === "public"}
      />
    </>
  );
}
