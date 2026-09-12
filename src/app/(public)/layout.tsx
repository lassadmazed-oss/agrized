import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SourceCapture } from "@/components/site/source-capture";
import { StickyCta } from "@/components/site/sticky-cta";
import { flagState, getPublicConfig, mediaCredits, settingText } from "@/lib/config";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const config = await getPublicConfig();
  const interestOpen = flagState(config, "interest_form") === "public";

  return (
    <div className="flex min-h-dvh flex-col">
      <SourceCapture />
      <SiteHeader
        tagline={settingText(config, "brand.tagline_ar")}
        showInterestCta={interestOpen}
        showProjects={flagState(config, "projects") === "public"}
        showZitounti={flagState(config, "zitounti") === "public"}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter
        legalNotice={settingText(config, "legal.no_guarantee_notice")}
        taglineFr={settingText(config, "brand.tagline_fr")}
        phone={settingText(config, "site.contact_phone")}
        whatsapp={settingText(config, "site.contact_whatsapp")}
        email={settingText(config, "site.contact_email")}
        credits={mediaCredits(config)}
      />
      {interestOpen ? (
        <>
          {/* Room for the fixed bar, so it never covers the end of the footer on a phone. */}
          <div aria-hidden="true" className="h-24 md:hidden" />
          <StickyCta note={settingText(config, "site.final_cta_note")} />
        </>
      ) : null}
    </div>
  );
}
