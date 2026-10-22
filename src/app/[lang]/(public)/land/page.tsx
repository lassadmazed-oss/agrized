import type { Metadata } from "next";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { Texts } from "@/components/site/texts";
import { getPublicConfig, optionsFor, settingBool, settingInt, t } from "@/lib/config";
import { readIntakePrefill } from "@/lib/intake-prefill";
import { moduleAccess } from "@/lib/modules";

import { LandOfferForm } from "./land-offer-form";

// The "internal" module state checks the staff session cookie, so this page renders per request.
// Configuration itself stays cached (src/lib/config.ts).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: t(config, "ui.land.meta_title"),
    description: t(config, "ui.land.meta_description"),
  };
}

export default async function LandOfferPage() {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "land_offers");
  if (access === "closed") {
    return <ComingSoon title={t(config, "ui.land.meta_title")} />;
  }

  // The reader's own details if he is signed in, null otherwise — which is most readers, and is fine (0147).
  const prefill = await readIntakePrefill();

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}
      <Texts prefixes={["ui.land.", "ui.prefill."]}>
        <LandOfferForm
          prefill={prefill}
          governorates={config.governorates}
          delegations={config.delegations}
          propertyTypes={optionsFor(config, "property_type")}
          treeAges={optionsFor(config, "tree_age")}
          documents={optionsFor(config, "land_document")}
          intro={t(config, "site.land_section_text")}
          notice={t(config, "legal.land_offer_notice")}
          consentText={t(config, "legal.consent_text")}
          allowInternationalPhone={settingBool(config, "lead.allow_international_phone")}
          maxFiles={settingInt(config, "land_offer.max_files", 10)}
          maxFileSizeMb={Math.min(settingInt(config, "land_offer.max_file_size_mb", 10), 20)}
        />
      </Texts>
    </>
  );
}
