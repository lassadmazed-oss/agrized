import { TabBar, type Tab } from "@/components/site/mobile/tab-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SourceCapture } from "@/components/site/source-capture";
import { flagState, getPublicConfig, mediaCredits, settingText } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const config = await getPublicConfig();
  const interestOpen = flagState(config, "interest_form") === "public";
  const offersOpen = flagState(config, "projects") === "public";
  // moduleAccess, not flagState: the account screen is the one tab a staff member should reach while the
  // module is still internal, because previewing it is the only way to look at it today.
  const accountOpen = (await moduleAccess(config, "zitounti")) !== "closed";

  /**
   * The phone's bottom bar (owner, 2026-09-21, from two AgriZed app mock-ups). It takes the place of StickyCta,
   * which repeated a button the page already carried; a tab bar earns that strip by saying where you are.
   *
   * Only tabs that open something are built. A module that is closed takes its tab with it, the same way the
   * header already drops its link.
   *
   * «حسابي» follows that same rule and nothing softer (2026-09-21, the third mock-up: the account screen). The
   * screen exists now — /zitounti — but it is still true that no buyer can sign in, so the tab appears only
   * once the زيتونتي module is open, which today means a staff member previewing it. While the module is
   * disabled, this bar is exactly the four tabs it was.
   */
  const tabs: Tab[] = [
    { href: "/", label: settingText(config, "site.tab_home", "الرئيسية"), icon: "home" },
    ...(offersOpen ? [{ href: "/projects", label: settingText(config, "offers.title", "عروضنا"), icon: "offers" } as Tab] : []),
    ...(interestOpen ? [{ href: "/start", label: settingText(config, "site.tab_calculator", "محاكاة"), icon: "calculator" } as Tab] : []),
    ...(flagState(config, "land_offers") === "public"
      ? [{ href: "/land", label: settingText(config, "site.tab_land", "أرضك"), icon: "land" } as Tab]
      : []),
    ...(accountOpen
      ? [{ href: "/zitounti", label: settingText(config, "zitounti.screen_title", "حسابي"), icon: "account" } as Tab]
      : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SourceCapture />
      <SiteHeader
        tagline={settingText(config, "brand.tagline_ar")}
        showInterestCta={interestOpen}
        showProjects={flagState(config, "projects") === "public"}
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
      <TabBar tabs={tabs} />
    </div>
  );
}
