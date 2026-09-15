import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { ParcelCard } from "@/components/site/parcel-card";
import { ParcelPlan } from "@/components/site/parcel-plan";
import { ParcelRow } from "@/components/site/parcel-row";
import { ProjectGallery } from "@/components/site/project-gallery";
import { ProjectVideo } from "@/components/site/project-video";
import { RemotePhoto } from "@/components/site/site-photo";
import { flagState, getPublicConfig, optionsFor, settingText, type PublicConfig } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount, formatMillimes } from "@/lib/format";
import { IRRIGATION_LABELS } from "@/lib/land";
import { moduleAccess } from "@/lib/modules";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import { parcelHref } from "@/lib/public-hrefs";
import { findProject, getProjectPage, getPublicParcels, getPublicProjects, publicMode } from "@/lib/public-projects";

import { LegalNotes, longestDuration } from "../page";

export const metadata: Metadata = { title: "مشروع" };

export const dynamic = "force-dynamic";

const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/;

/** Report v3 §20, in its order: gallery, video, location, description and facts, documents, plan, prices, payment, services, visit. */
export default async function ProjectPage({ params }: PageProps<"/projects/[code]">) {
  const code = decodeURIComponent((await params).code);
  if (!CODE.test(code)) notFound();

  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={settingText(config, "projects.title", "المشاريع المتوفّرة")} />;
  }

  const mode = publicMode(access);
  const [projects, parcels, page] = await Promise.all([
    getPublicProjects(mode),
    getPublicParcels(mode),
    getProjectPage(code, mode),
  ]);
  const project = findProject(projects, code);
  if (!project) notFound();

  const own = parcels.filter((parcel) => parcel.project_id === project.id);
  const governorate = config.governorates.find((g) => g.id === project.governorate_id)?.name_ar;
  const delegation = config.delegations.find((d) => d.id === project.delegation_id)?.name_ar;
  const irrigation = project.irrigation ? (IRRIGATION_LABELS as Record<string, string>)[project.irrigation] : null;
  const hasTaken = own.some((parcel) => !parcel.offered);
  const maxMonths = longestDuration(config);

  const pictures = page?.media ?? [];
  const cover = pictures[0] ?? null;
  const water = page ? waterText(page.water_available, page.water_note) : null;
  const documents = chosenLabels(config, "land_document", page?.document_option_ids);
  const services = chosenLabels(config, "agrized_service", page?.service_option_ids);
  const mapHref =
    page && page.latitude !== null && page.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${page.latitude},${page.longitude}`
      : null;
  // Payment and visits only concern a project that still sells parcels.
  const selling = project.status === "published" || project.status === "internal";
  const visitOpen = selling && flagState(config, "interest_form") === "public";
  const videoTitle = settingText(config, "projects.video_title", "فيديو المشروع");

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6 sm:pt-12">
        <Link href="/projects" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          → كل المشاريع
        </Link>

        <div className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <RemotePhoto
            url={cover?.url ?? project.cover_url}
            alt={cover?.alt_ar ?? project.cover_alt_ar}
            seed={project.id}
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="aspect-3/2 rounded-3xl"
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
            <h1 className="mt-2 font-display text-4xl font-bold text-forest text-balance sm:text-5xl">{project.name}</h1>
            <p className="mt-2 text-muted">{[governorate, delegation].filter(Boolean).join(" · ")}</p>
            {project.location_description ? <p className="mt-4 leading-7 text-ink/80">{project.location_description}</p> : null}
            {mapHref ? (
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex text-sm font-semibold text-forest underline-offset-4 hover:underline"
              >
                {settingText(config, "projects.location_cta", "شوف الموقع على الخريطة")} ↗
              </a>
            ) : null}

            <dl className="mt-6 space-y-2.5 rounded-2xl border border-line bg-surface p-5 text-sm">
              {project.total_area_m2 ? <ParcelRow label="المساحة الجملية">{formatCount(project.total_area_m2)} م²</ParcelRow> : null}
              {project.tree_count ? <ParcelRow label="عدد الأشجار">{formatCount(project.tree_count)}</ParcelRow> : null}
              {project.olive_variety ? <ParcelRow label="الصنف">{project.olive_variety}</ParcelRow> : null}
              {project.tree_age_years ? <ParcelRow label="عمر الأشجار">{formatCount(project.tree_age_years)} سنوات</ParcelRow> : null}
              <ParcelRow label="نظام الغراسة">
                {project.plantation_system ? (PLANTATION_LABELS[project.plantation_system] ?? project.plantation_system) : "—"}
              </ParcelRow>
              <ParcelRow label="حالة الإنتاج">
                {project.production_status ? (PRODUCTION_LABELS[project.production_status] ?? project.production_status) : "—"}
              </ParcelRow>
              {water ? <ParcelRow label="الماء">{water}</ParcelRow> : null}
              {irrigation ? <ParcelRow label="الري">{irrigation}</ParcelRow> : null}
              {page?.access_note ? <ParcelRow label="النفاذ">{page.access_note}</ParcelRow> : null}
              <ParcelRow label="القطع">
                {formatCount(project.parcels_total)} · {formatCount(project.parcels_offered)} متبقية
              </ParcelRow>
              {project.offered && project.min_cash_price_millimes ? (
                <ParcelRow label="السعر حاضر">ابتداءً من {formatMillimes(project.min_cash_price_millimes)}</ParcelRow>
              ) : null}
            </dl>
          </div>
        </div>
      </section>

      {page && (page.description_ar || pictures.length > 1 || page.video_url || documents.length > 0) ? (
        <section className="mx-auto max-w-6xl space-y-12 px-4 pb-12 sm:px-6">
          {page.description_ar || documents.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              {page.description_ar ? (
                <div>
                  <h2 className="font-display text-3xl font-bold text-forest">
                    {settingText(config, "projects.about_title", "على المشروع")}
                  </h2>
                  <p className="mt-3 whitespace-pre-line leading-8 text-ink/80">{page.description_ar}</p>
                </div>
              ) : null}
              {documents.length > 0 ? (
                <InfoCard title={settingText(config, "projects.documents_title", "الوثائق المتوفّرة")}>
                  <ul className="space-y-1.5">
                    {documents.map((label) => (
                      <li key={label} className="flex items-start gap-2">
                        <span aria-hidden="true" className="font-bold text-leaf">
                          ✓
                        </span>
                        {label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-muted">{settingText(config, "projects.documents_text")}</p>
                </InfoCard>
              ) : null}
            </div>
          ) : null}

          {/* The first picture is the cover above; the gallery holds the others. */}
          {pictures.length > 1 ? (
            <ProjectGallery pictures={pictures.slice(1)} title={settingText(config, "projects.gallery_title", "صور المشروع")} />
          ) : null}

          {page.video_url ? (
            <div className="max-w-3xl">
              <h2 className="font-display text-3xl font-bold text-forest">{videoTitle}</h2>
              <div className="mt-4">
                <ProjectVideo url={page.video_url} title={`${videoTitle} · ${project.name}`} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
          <div>
            <h2 className="font-display text-3xl font-bold text-forest">
              {settingText(config, "projects.detail_parcels_title", "القطع في هذا المشروع")}
            </h2>
            {hasTaken ? (
              <p className="mt-2 text-sm text-muted">
                {settingText(config, "projects.taken_hint", "القطع المحجوزة أو المتعاقد عليها تظهر للمعلومة فقط، بلا سعر.")}
              </p>
            ) : null}
          </div>

          {/* Report v3 §21: the parcels at a glance, coloured by status, each tile opening its parcel */}
          <ParcelPlan
            title="مخطط القطع"
            tiles={own.map((parcel) => ({
              id: parcel.id,
              code: parcel.code,
              status: parcel.status,
              href: parcelHref(project.code, parcel.code),
              detail: `${formatCount(parcel.area_m2)} م²`,
            }))}
          />

          {own.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong bg-paper px-6 py-10 text-center text-muted">
              {settingText(config, "projects.empty_text", "ما فماش قطع متاحة توّا.")}
            </p>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {own.map((parcel) => (
                <ParcelCard
                  key={parcel.id}
                  parcel={parcel}
                  href={parcelHref(project.code, parcel.code)}
                  place={project.name}
                  pricePending={settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً.")}
                  maxMonths={maxMonths}
                />
              ))}
            </ul>
          )}

          <LegalNotes config={config} />
        </div>
      </section>

      {selling || services.length > 0 ? (
        <section className="mx-auto grid max-w-6xl gap-5 px-4 py-12 sm:px-6 md:grid-cols-2">
          {selling ? (
            <InfoCard title={settingText(config, "projects.payment_title", "طريقة الدفع")}>
              <p>{settingText(config, "projects.payment_text")}</p>
            </InfoCard>
          ) : null}

          {services.length > 0 ? (
            <InfoCard title={settingText(config, "projects.services_title", "خدمات AgriZed في هذا المشروع")}>
              <ul className="flex flex-wrap gap-2">
                {services.map((label) => (
                  <li key={label} className="rounded-full bg-leaf-soft px-3 py-1 text-sm font-medium text-forest">
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">{settingText(config, "projects.services_text")}</p>
            </InfoCard>
          ) : null}

          {visitOpen ? (
            <InfoCard title={settingText(config, "projects.visit_title", "زيارة الأرض")}>
              <p>{settingText(config, "projects.visit_text")}</p>
              <Link href="/register" className="btn btn-primary mt-4">
                {settingText(config, "projects.visit_cta", "نحب نزور الأرض")}
              </Link>
            </InfoCard>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/** «متوفّر · بئر عميقة», or null when the team stated nothing. */
function waterText(available: boolean | null, note: string | null): string | null {
  const state = available === true ? "متوفّر" : available === false ? "غير متوفّر" : null;
  return [state, note].filter(Boolean).join(" · ") || null;
}

/** Names of the active list items a project picked, in the list's own order. */
function chosenLabels(config: PublicConfig, listKey: string, ids: string[] | undefined): string[] {
  const chosen = new Set(ids ?? []);
  return optionsFor(config, listKey)
    .filter((option) => chosen.has(option.id))
    .map((option) => option.label_ar);
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-2xl font-bold text-forest">{title}</h2>
      <div className="mt-3 leading-7 text-ink/80">{children}</div>
    </div>
  );
}
