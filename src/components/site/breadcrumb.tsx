import Link from "next/link";

import { Bi } from "@/components/site/bilingual";

export type Crumb = { href?: string; ar: string; fr?: string | null };

/** Where the visitor is. The last item is the current page; earlier ones link back. */
export function Breadcrumb({ items, className = "" }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="مسار الصفحة" className={`text-sm text-muted ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          const text = <Bi ar={item.ar} fr={item.fr} frClassName="text-[0.85em] text-muted" />;
          return (
            <li key={`${index}-${item.ar}`} className="flex items-center gap-x-2">
              {item.href && !current ? (
                <Link href={item.href} className="hover:text-forest hover:underline">
                  {text}
                </Link>
              ) : (
                <span aria-current={current ? "page" : undefined} className={current ? "font-semibold text-ink" : undefined}>
                  {text}
                </span>
              )}
              {!current ? (
                <span aria-hidden="true" className="text-line-strong">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
