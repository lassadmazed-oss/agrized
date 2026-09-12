import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SourceCapture } from "@/components/site/source-capture";
import { flagState, getPublicConfig, settingText } from "@/lib/config";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const config = await getPublicConfig();

  return (
    <div className="flex min-h-dvh flex-col">
      <SourceCapture />
      <SiteHeader
        tagline={settingText(config, "brand.tagline_ar")}
        showInterestCta={flagState(config, "interest_form") === "public"}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter
        legalNotice={settingText(config, "legal.no_guarantee_notice")}
        taglineFr={settingText(config, "brand.tagline_fr")}
        phone={settingText(config, "site.contact_phone")}
        whatsapp={settingText(config, "site.contact_whatsapp")}
        email={settingText(config, "site.contact_email")}
      />
    </div>
  );
}
