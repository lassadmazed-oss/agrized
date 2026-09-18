import type { Metadata } from "next";
import Link from "next/link";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { getPublicConfig, settingText } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { projectsHref } from "@/lib/public-hrefs";
import { getCoverage, publicMode } from "@/lib/public-projects";

export const metadata: Metadata = { title: "وين تلقى قطعتك؟" };

export const dynamic = "force-dynamic";

/** Counts per governorate. The tile list is the accessible source of truth until a real map exists. */
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

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <Link href="/projects" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          → كل المشاريع
        </Link>
        <h1 className="mt-4 font-display text-4xl font-bold text-forest sm:text-5xl">
          {settingText(config, "projects.map_title", "وين تلقى قطعتك؟")}
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          {settingText(
            config,
            "projects.map_text",
            "الأرقام هي عدد المشاريع والقطع المعروضة فعلاً في كل ولاية اليوم. الولايات بلا رقم مفتوحة للتسجيل.",
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
                      <span className="mt-1 block text-sm text-muted">
                        {formatCount(row?.projects_count ?? 0)} مشروع · {formatCount(row?.parcels_total ?? 0)} قطعة
                      </span>
                    </span>
                    <span className="font-display text-4xl font-bold text-forest tabular-nums">
                      {formatCount(row?.parcels_offered ?? 0)}
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
                <li key={governorate.id} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted">
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
