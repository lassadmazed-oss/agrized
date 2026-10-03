import { Bi } from "@/components/site/bilingual";
import Link from "@/components/site/link";
import { getPublicConfig, t } from "@/lib/config";

/**
 * One step of the trail. `ar` is the step's name in the page's language (the field kept its name from the
 * days the site was Arabic only); `fr` is the French twin /start prints under it on the Arabic site.
 */
export type Crumb = { href?: string; ar: string; fr?: string | null };

/**
 * Where the visitor is. The last item is the current page; earlier ones link back.
 *
 * The French twin is printed on the Arabic site only (owner, 2026-09-12: /start is bilingual there). On a
 * page that is already in French, German, Italian or English it would be a second language nobody asked for.
 * The separator «›» needs no mirroring: it is a bidi-mirrored character and turns with the line.
 */
export async function Breadcrumb({ items, className = "" }: { items: Crumb[]; className?: string }) {
  const config = await getPublicConfig();
  const twin = config.locale === "ar";
  return (
    <nav aria-label={t(config, "ui.cards.breadcrumb_label")} className={`text-sm text-muted ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          const text = <Bi ar={item.ar} fr={twin ? item.fr : null} frClassName="text-[0.85em] text-muted" />;
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
