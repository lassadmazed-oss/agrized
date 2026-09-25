import { AssistantBubble } from "@/components/site/assistant/assistant-bubble";
import { TabBar, type Tab } from "@/components/site/mobile/tab-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SourceCapture } from "@/components/site/source-capture";
import { assistantCopy, assistantEnabled } from "@/lib/assistant";
import { flagState, getPublicConfig, mediaCredits, settingText } from "@/lib/config";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const config = await getPublicConfig();
  const interestOpen = flagState(config, "interest_form") === "public";
  const offersOpen = flagState(config, "projects") === "public";

  /**
   * The phone's bottom bar (owner, 2026-09-21, from two AgriZed app mock-ups). It takes the place of StickyCta,
   * which repeated a button the page already carried; a tab bar earns that strip by saying where you are.
   *
   * Only tabs that open something are built. A module that is closed takes its tab with it, the same way the
   * header already drops its link.
   *
   * «حسابي» IS THE ONE EXCEPTION, and it became one on 2026-09-25 when the buyer's sign-in was built.
   *
   * It used to be gated on the زيتونتي module like everything else, on the reasoning that no buyer could
   * sign in so the tab would open nothing. That reasoning expired: /zitounti now answers the sign-in form
   * to anyone without a session, whatever that flag says, because a door is not a feature — it is how
   * somebody proves who they are, and switching it off with the room behind it is what made the account
   * icon land on «قريباً». The flag still decides what a signed-in buyer SEES; it no longer decides
   * whether they may sign in.
   *
   * So the tab is unconditional, and it still obeys the rule above: it opens something real at every
   * setting of every flag.
   */
  const tabs: Tab[] = [
    { href: "/", label: settingText(config, "site.tab_home", "الرئيسية"), icon: "home" },
    ...(offersOpen ? [{ href: "/projects", label: settingText(config, "offers.title", "عروضنا"), icon: "offers" } as Tab] : []),
    ...(interestOpen ? [{ href: "/start", label: settingText(config, "site.tab_calculator", "محاكاة"), icon: "calculator" } as Tab] : []),
    ...(flagState(config, "land_offers") === "public"
      ? [{ href: "/land", label: settingText(config, "site.tab_land", "أرضك"), icon: "land" } as Tab]
      : []),
    { href: "/zitounti", label: settingText(config, "zitounti.screen_title", "حسابي"), icon: "account" },
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
      {/* The assistant rides above every public page; its flag is the only thing that removes it. */}
      {assistantEnabled(config) ? <AssistantBubble copy={assistantCopy(config)} /> : null}
    </div>
  );
}
