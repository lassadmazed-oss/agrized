import { LandPlot, MapPin, TreeDeciduous } from "lucide-react";
import Link from "next/link";

import { FactTile } from "@/components/site/fact-tile";
import { ParcelRow } from "@/components/site/parcel-row";
import { RemotePhoto } from "@/components/site/site-photo";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount } from "@/lib/format";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import type { PublicProject } from "@/lib/public-projects";

/** A project at a glance, like the board's property cards. No price here: prices only sit next to a parcel's own facts (PARC-11). */
export function ProjectCard({ project, href, place }: { project: PublicProject; href: string; place: string }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-float">
      <Link href={href} className="block h-full focus-visible:outline-offset-[-2px]">
        <RemotePhoto
          url={project.cover_url}
          alt={project.cover_alt_ar}
          seed={project.id}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
          className="aspect-4/3"
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-ink">{project.name}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-forest" />
                <span dir="ltr">{project.code}</span> · {place}
              </p>
            </div>
            {project.status !== "published" ? (
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${projectStatusTone(project.status)}`}>
                {projectStatusLabel(project.status)}
              </span>
            ) : null}
          </div>

          {project.tree_count || project.total_area_m2 ? (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {project.tree_count ? (
                <FactTile icon={<TreeDeciduous aria-hidden="true" className="size-4" />} label="عدد الأشجار">
                  {formatCount(project.tree_count)}
                </FactTile>
              ) : null}
              {project.total_area_m2 ? (
                <FactTile icon={<LandPlot aria-hidden="true" className="size-4" />} label="المساحة الجملية">
                  {formatCount(project.total_area_m2)} م²
                </FactTile>
              ) : null}
            </dl>
          ) : null}

          <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
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
