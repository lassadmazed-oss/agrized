import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { ParcelCard } from "@/components/site/parcel-card";
import { ParcelRow } from "@/components/site/parcel-row";
import { RemotePhoto } from "@/components/site/site-photo";
import { getPublicConfig, settingText } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount } from "@/lib/format";
import { IRRIGATION_LABELS } from "@/lib/land";
import { moduleAccess } from "@/lib/modules";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import { parcelHref } from "@/lib/public-hrefs";
import { findProject, getPublicParcels, getPublicProjects, publicMode } from "@/lib/public-projects";

import { LegalNotes } from "../page";

export const metadata: Metadata = { title: "مشروع" };

export const dynamic = "force-dynamic";

const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/;

export default async function ProjectPage({ params }: PageProps<"/projects/[code]">) {
  const code = decodeURIComponent((await params).code);
  if (!CODE.test(code)) notFound();

  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={settingText(config, "projects.title", "المشاريع المتوفّرة")} />;
  }

  const mode = publicMode(access);
  const [projects, parcels] = await Promise.all([getPublicProjects(mode), getPublicParcels(mode)]);
  const project = findProject(projects, code);
  if (!project) notFound();

  const own = parcels.filter((parcel) => parcel.project_id === project.id);
  const governorate = config.governorates.find((g) => g.id === project.governorate_id)?.name_ar;
  const delegation = config.delegations.find((d) => d.id === project.delegation_id)?.name_ar;
  const place = [governorate, delegation].filter(Boolean).join(" · ");
  const irrigation = project.irrigation ? (IRRIGATION_LABELS as Record<string, string>)[project.irrigation] : null;
  const hasTaken = own.some((parcel) => !parcel.offered);

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <section className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <Link href="/projects" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          → كل المشاريع
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <RemotePhoto
            url={project.cover_url}
            alt={project.cover_alt_ar}
            seed={project.id}
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="aspect-3/2 rounded-3xl shadow-float"
          />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p dir="ltr" className="text-sm font-semibold text-muted">
                {project.code}
              </p>
              {project.status !== "published" ? (
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${projectStatusTone(project.status)}`}>
                  {projectStatusLabel(project.status)}
                </span>
              ) : null}
            </div>
            <h1 className="section-title mt-2 text-4xl sm:text-5xl">{project.name}</h1>
            {place ? (
              <p className="mt-2 flex items-center gap-1.5 text-muted">
                <MapPin aria-hidden="true" className="size-4 text-forest" />
                {place}
              </p>
            ) : null}
            {project.location_description ? <p className="mt-4 leading-7 text-ink/80">{project.location_description}</p> : null}

            <dl className="card mt-6 space-y-2.5 p-5 text-sm">
              {project.total_area_m2 ? <ParcelRow label="المساحة الجملية">{formatCount(project.total_area_m2)} م²</ParcelRow> : null}
              {project.olive_variety ? <ParcelRow label="الصنف">{project.olive_variety}</ParcelRow> : null}
              {project.tree_count ? <ParcelRow label="عدد الأشجار">{formatCount(project.tree_count)}</ParcelRow> : null}
              {project.tree_age_years ? <ParcelRow label="عمر الأشجار">{formatCount(project.tree_age_years)} سنوات</ParcelRow> : null}
              <ParcelRow label="نظام الغراسة">
                {project.plantation_system ? (PLANTATION_LABELS[project.plantation_system] ?? project.plantation_system) : "—"}
              </ParcelRow>
              <ParcelRow label="حالة الإنتاج">
                {project.production_status ? (PRODUCTION_LABELS[project.production_status] ?? project.production_status) : "—"}
              </ParcelRow>
              {irrigation ? <ParcelRow label="الري">{irrigation}</ParcelRow> : null}
              <ParcelRow label="القطع">
                {formatCount(project.parcels_total)} · {formatCount(project.parcels_offered)} معروضة
              </ParcelRow>
            </dl>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="section-title">{settingText(config, "projects.detail_parcels_title", "القطع في هذا المشروع")}</h2>
          {hasTaken ? (
            <p className="mt-2 text-sm text-muted">
              {settingText(config, "projects.taken_hint", "القطع المحجوزة أو المتعاقد عليها تظهر للمعلومة فقط، بلا سعر.")}
            </p>
          ) : null}

          {own.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-line-strong bg-cream px-6 py-10 text-center text-muted">
              {settingText(config, "projects.empty_text", "ما فماش قطع متاحة توّا.")}
            </p>
          ) : (
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {own.map((parcel) => (
                <ParcelCard
                  key={parcel.id}
                  parcel={parcel}
                  href={parcelHref(project.code, parcel.code)}
                  place={project.name}
                  pricePending={settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً.")}
                />
              ))}
            </ul>
          )}

          <LegalNotes config={config} />
        </div>
      </section>
    </>
  );
}
