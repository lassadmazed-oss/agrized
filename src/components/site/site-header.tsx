import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

type SiteHeaderProps = {
  tagline: string;
  showInterestCta: boolean;
};

export function SiteHeader({ tagline, showInterestCta }: SiteHeaderProps) {
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-3 rounded-md" aria-label="AgriZed، الصفحة الرئيسية">
          <Wordmark className="text-[1.9rem]" />
          {tagline ? <span className="hidden text-sm text-muted sm:inline">{tagline}</span> : null}
        </Link>
        {showInterestCta ? (
          <Link href="/register" className="btn btn-primary min-h-11 px-4 text-[0.95rem]">
            سجّل اهتمامك
          </Link>
        ) : null}
      </div>
    </header>
  );
}
