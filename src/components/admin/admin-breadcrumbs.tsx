"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { trailFor } from "./nav-model";

/**
 * Where you are, in the page header of every Back Office screen. The separator is a middle dot rather
 * than a chevron: a chevron would point the wrong way in RTL, a dot points nowhere.
 */
export function AdminBreadcrumbs({ className = "" }: { className?: string }) {
  const pathname = usePathname() ?? "/admin";
  const crumbs = trailFor(pathname);

  return (
    <nav aria-label="مسار الصفحة" className={`min-w-0 ${className}`.trim()}>
      <ol className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
        {crumbs.map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>
            ) : null}
            {crumb.href === pathname ? (
              <span aria-current="page" className="font-semibold text-ink">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="underline-offset-4 hover:text-forest hover:underline">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
