import Link from "next/link";

import { ParcelRow } from "@/components/site/parcel-row";
import { RemotePhoto } from "@/components/site/site-photo";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount } from "@/lib/format";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import type { PublicProject } from "@/lib/public-projects";

/** A project at a glance. No price here: prices only sit next to a parcel's own facts (PARC-11). */
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
            <ParcelRow label="نوع الغراسة">
              {project.plantation_system ? (PLANTATION_LABELS[project.plantation_system] ?? project.plantation_system) : "—"}
            </ParcelRow>
            <ParcelRow label="حالة الإنتاج">
              {project.production_status ? (PRODUCTION_LABELS[project.production_status] ?? project.production_status) : "—"}
            </ParcelRow>
            <ParcelRow label="القطع">
              {formatCount(project.parcels_total)} · {formatCount(project.parcels_offered)} معروضة
            </ParcelRow>
          </dl>
        </div>
      </Link>
    </li>
  );
}
