import Link from "next/link";

import { ParcelRow } from "@/components/site/parcel-row";
import { RemotePhoto } from "@/components/site/site-photo";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import type { PublicProject } from "@/lib/public-projects";

/**
 * A project at a glance (report v3 §19). The «ابتداءً من» price sits with the project's own area,
 * trees, plantation system and production status, so it is never shown without its facts (PARC-11).
 */
export function ProjectCard({ project, href, place }: { project: PublicProject; href: string; place: string }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface">
      <Link href={href} className="block h-full focus-visible:outline-offset-[-2px]">
        <RemotePhoto
          url={project.cover_url}
          alt={project.cover_alt_ar}
          seed={project.id}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
          className="aspect-3/2"
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-ink">{project.name}</h3>
              <p className="mt-0.5 text-sm text-muted">
                <span dir="ltr">{project.code}</span> · {place}
              </p>
            </div>
            {project.status !== "published" ? (
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${projectStatusTone(project.status)}`}>
                {projectStatusLabel(project.status)}
              </span>
            ) : null}
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            {project.total_area_m2 ? <ParcelRow label="المساحة الجملية">{formatCount(project.total_area_m2)} م²</ParcelRow> : null}
            {project.tree_count ? <ParcelRow label="عدد الأشجار">{formatCount(project.tree_count)}</ParcelRow> : null}
            {project.on_tree_pricing && project.area_per_tree_min_m2 ? (
              <ParcelRow label="مساحة كل زيتونة">{areaPerTree(project.area_per_tree_min_m2, project.area_per_tree_max_m2)}</ParcelRow>
            ) : null}
            <ParcelRow label="نوع الغراسة">
              {project.plantation_system ? (PLANTATION_LABELS[project.plantation_system] ?? project.plantation_system) : "—"}
            </ParcelRow>
            <ParcelRow label="حالة الإنتاج">
              {project.production_status ? (PRODUCTION_LABELS[project.production_status] ?? project.production_status) : "—"}
            </ParcelRow>
          </dl>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3 text-sm">
            {project.offered && project.on_tree_pricing ? (
              project.min_price_per_tree_millimes ? (
                <p>
                  <span className="text-muted">ابتداءً من </span>
                  <span className="font-display text-xl font-bold text-forest tabular-nums">
                    {formatMillimes(project.min_price_per_tree_millimes)}
                  </span>
                  <span className="text-muted"> للزيتونة</span>
                </p>
              ) : null
            ) : project.offered && project.min_cash_price_millimes ? (
              <p>
                <span className="text-muted">ابتداءً من </span>
                <span className="font-display text-xl font-bold text-forest tabular-nums">
                  {formatMillimes(project.min_cash_price_millimes)}
                </span>
              </p>
            ) : null}
            <p className="font-semibold text-ink">
              <span className="tabular-nums">{formatCount(project.parcels_offered)}</span> قطعة متبقية
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

/** «35 م²» for one class, «25 – 49 م²» when the project plants several. */
function areaPerTree(min: number, max: number | null): string {
  return max && max !== min ? `${formatCount(min)} – ${formatArea(max)}` : formatArea(min);
}
