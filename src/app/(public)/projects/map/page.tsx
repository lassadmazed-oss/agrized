import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { OliveBranch } from "@/components/site/olive-decor";
import { TunisiaMap } from "@/components/site/tunisia-map";
import { getPublicConfig, settingText } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { projectsHref } from "@/lib/public-hrefs";
import { getCoverage, publicMode } from "@/lib/public-projects";

export const metadata: Metadata = { title: "وين تلقى قطعتك؟" };

export const dynamic = "force-dynamic";

/** Counts per governorate. The list is the accessible source of truth; the outline beside it is decoration. */
export default async function CoveragePage() {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={settingText(config, "projects.map_title", "وين تلقى قطعتك؟")} />;
  }

  const coverage = await getCoverage(publicMode(access));
  const byGovernorate = new Map(coverage.map((row) => [row.governorate_id, row]));
  const withProjects = config.governorates.filter((g) => byGovernorate.has(g.id));
  const without = config.governorates.filter((g) => !byGovernorate.has(g.id));

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <section className="border-b border-line bg-cream">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <Link href="/projects" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
            → كل المشاريع
          </Link>
          <h1 className="section-title mt-4 text-4xl sm:text-5xl">{settingText(config, "projects.map_title", "وين تلقى قطعتك؟")}</h1>
          <p className="section-lead mt-3 max-w-2xl">
            {settingText(
              config,
              "projects.map_text",
              "الأرقام هي عدد المشاريع والقطع المعروضة فعلاً في كل ولاية اليوم. الولايات بلا رقم مفتوحة للتسجيل.",
            )}
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:px-8">
        <div>
          {withProjects.length > 0 ? (
            <ul className="card divide-y divide-line px-2">
              {withProjects.map((governorate) => {
                const row = byGovernorate.get(governorate.id);
                return (
                  <li key={governorate.id}>
                    <Link
                      href={projectsHref({ gov: String(governorate.id) })}
                      className="flex items-center gap-4 rounded-xl px-3 py-4 transition-colors hover:bg-cream"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf-soft text-forest">
                        <MapPin aria-hidden="true" className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-ink">{governorate.name_ar}</span>
                        <span className="mt-0.5 block text-sm text-muted">
                          {formatCount(row?.projects_count ?? 0)} مشروع · {formatCount(row?.parcels_total ?? 0)} قطعة
                        </span>
                      </span>
                      <span className="text-3xl font-bold text-forest tabular-nums">{formatCount(row?.parcels_offered ?? 0)}</span>
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
                  <li key={governorate.id} className="rounded-lg border border-line bg-surface px-3.5 py-1.5 text-sm text-muted">
                    {governorate.name_ar}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="relative hidden overflow-hidden rounded-3xl bg-sand px-6 py-10 shadow-card lg:block">
          <OliveBranch className="-bottom-10 -end-12 w-56 rotate-[160deg]" />
          <TunisiaMap className="relative mx-auto h-[30rem] w-auto text-sand-deep" />
        </div>
      </section>
    </>
  );
}
