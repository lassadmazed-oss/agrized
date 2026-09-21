import type { Metadata } from "next";
import Link from "next/link";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { getOfferStocks, offerCardLabels, offersTitle, stockCounted } from "@/components/site/offers";
import { getPublicConfig, settingText } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { projectsHref } from "@/lib/public-hrefs";
import { getPublicProjects, publicMode } from "@/lib/public-projects";

export const metadata: Metadata = { title: "وين تلقى زيتونتك؟" };

export const dynamic = "force-dynamic";

/**
 * Counts per governorate. The tile list is the accessible source of truth until a real map exists.
 *
 * It used to read `public_coverage()`, whose two figures are `parcels_total` and `parcels_offered` — counts
 * over `public.parcels`, a table that has never held a row. So every tile printed «N مشروع · 0 قطعة» with a
 * headline «0», on a page whose own sentence promises «الأرقام ... المعروضة فعلاً». The figures are the
 * offers the visitor can already see and the trees still free in them (public_offer_stock, migration 0054),
 * grouped by governorate: the same rows /projects lists, so a tile and the list it opens agree.
 *
 * Nothing is computed here beyond the grouping — each offer's four counts are counted in Postgres — and no
 * price appears on this page at all (PRJ-03).
 */
export default async function CoveragePage() {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={settingText(config, "projects.map_title", "وين تلقى زيتونتك؟")} />;
  }

  const mode = publicMode(access);
  const projects = await getPublicProjects(mode);
  const stocks = await getOfferStocks(
    projects.map((project) => project.id),
    mode,
  );

  // One row per governorate that has an offer: how many offers, and how many of their trees are still free.
  // An offer whose trees are not numbered yet has an UNKNOWN stock, so it counts as an offer and adds
  // nothing to the tree figure — never a confident 0.
  const byGovernorate = new Map<number, { offers: number; available: number }>();
  for (const project of projects) {
    const row = byGovernorate.get(project.governorate_id) ?? { offers: 0, available: 0 };
    const stock = stocks.get(project.id);
    row.offers += 1;
    if (stockCounted(stock)) row.available += stock.available;
    byGovernorate.set(project.governorate_id, row);
  }

  const withProjects = config.governorates.filter((g) => byGovernorate.has(g.id));
  const without = config.governorates.filter((g) => !byGovernorate.has(g.id));
  // «المتاحة» stands alone in a table of four stock cells; here it follows its unit, so the tile reads
  // «600 زيتونة متاحة» and never «600 المتاحة». Same Back Office key, read through the card vocabulary.
  const availableLabel = offerCardLabels(config).available;

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <Link href="/projects" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          {`→ ${offersTitle(config)}`}
        </Link>
        <h1 className="mt-4 font-display text-4xl font-bold text-forest sm:text-5xl">
          {settingText(config, "projects.map_title", "وين تلقى زيتونتك؟")}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          {settingText(
            config,
            "projects.map_text",
            "الأرقام هي عدد العروض والزيتونات المتاحة فعلاً في كل ولاية اليوم. الولايات بلا رقم مفتوحة للتسجيل.",
          )}
        </p>

        {withProjects.length > 0 ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {withProjects.map((governorate) => {
              const row = byGovernorate.get(governorate.id);
              return (
                <li key={governorate.id}>
                  <Link
                    href={projectsHref({ gov: String(governorate.id) })}
                    className="card flex h-full items-center justify-between gap-4 p-5 transition-colors hover:border-leaf"
                  >
                    <span>
                      <span className="block text-lg font-semibold text-ink">{governorate.name_ar}</span>
                      <span className="mt-1 block text-sm text-muted">{formatCount(row?.offers ?? 0)} عرض</span>
                    </span>
                    {/* The figure carries its own word, so «600» is never read as a count of offers. */}
                    <span className="stat shrink-0 gap-0.5 text-center">
                      <span className="font-display text-4xl font-bold text-forest tabular-nums">
                        {formatCount(row?.available ?? 0)}
                      </span>
                      <span className="stat-label">{availableLabel}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {without.length > 0 ? (
          <div className="mt-10">
            <p className="text-sm text-muted">
              {settingText(
                config,
                "projects.map_empty_governorate",
                "ما عندناش مشروع في هذه الولاية توّا. سجّل مطلبك باش نعرفو وين نلوّجو.",
              )}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {without.map((governorate) => (
                <li key={governorate.id} className="pill pill-line px-3.5 py-1.5 text-sm font-normal">
                  {governorate.name_ar}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </>
  );
}
