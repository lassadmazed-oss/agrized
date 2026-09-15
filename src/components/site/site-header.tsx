import { HeaderBar, type HeaderLink } from "@/components/site/header-bar";

type SiteHeaderProps = {
  tagline: string;
  showInterestCta: boolean;
  /** Modules that are open to the public; a link is never shown for a page that is not there yet. */
  showProjects: boolean;
  showZitounti: boolean;
  showSimulator: boolean;
  showLand: boolean;
};

/** Links of the site bar and the footer, in reading order. */
export function siteLinks({ showProjects, showZitounti, showSimulator, showLand }: Omit<SiteHeaderProps, "tagline" | "showInterestCta">): HeaderLink[] {
  return [
    { href: "/#million", label: "مشروع المليون زيتونة" },
    { href: "/#how", label: "كيفاش تخدم" },
    ...(showSimulator ? [{ href: "/simulator", label: "احسب قدرتك" }] : []),
    ...(showProjects ? [{ href: "/projects", label: "المشاريع" }] : []),
    ...(showLand ? [{ href: "/land", label: "عندك أرض؟" }] : []),
    ...(showZitounti ? [{ href: "/zitounti", label: "زيتونتي" }] : []),
  ];
}

export function SiteHeader({ tagline, showInterestCta, ...modules }: SiteHeaderProps) {
  return (
    <HeaderBar
      tagline={tagline}
      links={siteLinks(modules)}
      cta={showInterestCta ? { href: "/register", label: "سجّل مطلبك" } : null}
    />
  );
}
