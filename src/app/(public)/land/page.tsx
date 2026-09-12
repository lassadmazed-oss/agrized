import type { Metadata } from "next";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { getPublicConfig, optionsFor, settingBool, settingInt, settingText } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

import { LandOfferForm } from "./land-offer-form";

// The "internal" module state checks the staff session cookie, so this page renders per request.
// Configuration itself stays cached (src/lib/config.ts).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "عندك أرض أو ضيعة؟",
  description: "ابعث معلومات أرضك أو ضيعة الزيتون إلى AgriZed. كل عرض يُدرس قبل أي قرار.",
};

export default async function LandOfferPage() {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "land_offers");
  if (access === "closed") {
    return <ComingSoon title="عندك أرض أو ضيعة؟" />;
  }

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}
      <LandOfferForm
        governorates={config.governorates}
        delegations={config.delegations}
        propertyTypes={optionsFor(config, "property_type")}
        treeAges={optionsFor(config, "tree_age")}
        documents={optionsFor(config, "land_document")}
        intro={settingText(config, "site.land_section_text")}
        notice={settingText(config, "legal.land_offer_notice")}
        consentText={settingText(config, "legal.consent_text")}
        allowInternationalPhone={settingBool(config, "lead.allow_international_phone")}
        maxFiles={settingInt(config, "land_offer.max_files", 10)}
        maxFileSizeMb={Math.min(settingInt(config, "land_offer.max_file_size_mb", 10), 20)}
      />
    </>
  );
}
