import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

type SiteHeaderProps = {
  tagline: string;
  showInterestCta: boolean;
  /** Modules that are open to the public; a link is never shown for a page that is not there yet. */
  showProjects: boolean;
  showZitounti: boolean;
};

export function SiteHeader({ tagline, showInterestCta, showProjects, showZitounti }: SiteHeaderProps) {
  const links = [
    { href: "/#million", label: "مشروع المليون زيتونة" },
    { href: "/#how", label: "كيفاش تخدم" },
    ...(showProjects ? [{ href: "/projects", label: "المشاريع" }] : []),
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
        {showInterestCta ? (
          <Link href="/register" className="btn btn-primary ms-auto hidden min-h-11 px-4 text-[0.95rem] md:ms-0 md:inline-flex">
            سجّل مطلبك
          </Link>
        ) : null}
      </div>
    </header>
  );
}
