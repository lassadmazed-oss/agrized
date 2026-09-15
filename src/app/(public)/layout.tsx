import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader, siteLinks } from "@/components/site/site-header";
import { SourceCapture } from "@/components/site/source-capture";
import { StickyCta } from "@/components/site/sticky-cta";
import { flagState, getPublicConfig, mediaCredits, settingText } from "@/lib/config";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const config = await getPublicConfig();
  const interestOpen = flagState(config, "interest_form") === "public";
  const modules = {
    showProjects: flagState(config, "projects") === "public",
    showZitounti: flagState(config, "zitounti") === "public",
    showSimulator: flagState(config, "simulator_basic") === "public",
    showLand: flagState(config, "land_offers") === "public",
  };

  return (
    // overflow-x-clip: the olive branches tuck past card edges; clip (unlike hidden) keeps sticky bars working.
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <SourceCapture />
      <SiteHeader tagline={settingText(config, "brand.tagline_ar")} showInterestCta={interestOpen} {...modules} />
      <main className="flex-1">{children}</main>
      <SiteFooter
        legalNotice={settingText(config, "legal.no_guarantee_notice")}
        taglineAr={settingText(config, "brand.tagline_ar")}
        taglineFr={settingText(config, "brand.tagline_fr")}
        phone={settingText(config, "site.contact_phone")}
        whatsapp={settingText(config, "site.contact_whatsapp")}
        email={settingText(config, "site.contact_email")}
        links={siteLinks(modules)}
        credits={mediaCredits(config)}
      />
      {interestOpen ? <StickyCta note={settingText(config, "site.final_cta_note")} /> : null}
    </div>
  );
}
