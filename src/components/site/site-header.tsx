import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { getPublicConfig, settingText, type PublicConfig } from "@/lib/config";

type SiteHeaderProps = {
  tagline: string;
  showInterestCta: boolean;
  /** Modules that are open to the public; a link is never shown for a page that is not there yet. */
  showProjects: boolean;
  showZitounti: boolean;
};

/**
 * The main call to action (report v3 §17, spec v2 §5): label and target from settings. v2 starts every journey
 * with the tree question, so anything but an explicit "register" opens /start.
 */
export function primaryCta(config: PublicConfig): { label: string; href: "/start" | "/register" } {
  return {
    label: settingText(config, "site.cta_primary_label", "سجّل اهتمامك"),
    href: settingText(config, "site.cta_primary_target", "start") === "register" ? "/register" : "/start",
  };
}

export async function SiteHeader({ tagline, showInterestCta, showProjects, showZitounti }: SiteHeaderProps) {
  const config = await getPublicConfig();
  const cta = primaryCta(config);
  const links = [
    { href: "/#million", label: "وين وصلنا" },
    { href: "/#how", label: "كيفاش تخدم" },
    // Owner 2026-09-18: the section is «عروضنا», named from settings so it can be renamed without a deploy.
    ...(showProjects ? [{ href: "/projects", label: settingText(config, "offers.title", "المشاريع") }] : []),
    ...(showZitounti ? [{ href: "/zitounti", label: "زيتونتي" }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-3 rounded-md" aria-label="AgriZed، الصفحة الرئيسية">
          <Wordmark className="text-[1.9rem]" />
          {tagline ? <span className="hidden text-sm text-muted xl:inline">{tagline}</span> : null}
        </Link>

        <nav aria-label="أقسام الموقع" className="hidden flex-1 justify-center md:flex">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-[0.95rem] font-medium text-muted transition-colors hover:bg-leaf-soft hover:text-forest"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Always reachable while scrolling; on a phone the fixed bar at the bottom takes over. */}
        {showInterestCta && cta.label ? (
          <Link href={cta.href} className="btn btn-primary ms-auto hidden min-h-11 px-4 text-[0.95rem] md:ms-0 md:inline-flex">
            {cta.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
