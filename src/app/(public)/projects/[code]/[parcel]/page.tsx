import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { OfferBlock } from "@/components/site/offer-block";
import { ParcelRow } from "@/components/site/parcel-row";
import { RemotePhoto } from "@/components/site/site-photo";
import { flagState, getPublicConfig, settingText } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount } from "@/lib/format";
import { IRRIGATION_LABELS } from "@/lib/land";
import { moduleAccess } from "@/lib/modules";
import { parcelStatusLabel, parcelStatusTone, PROPERTY_TYPE_LABELS } from "@/lib/projects";
import { interestHref, projectHref } from "@/lib/public-hrefs";
import { findParcel, findProject, getParcelOffer, getPublicParcels, getPublicProjects, publicMode } from "@/lib/public-projects";

export const metadata: Metadata = { title: "قطعة" };

export const dynamic = "force-dynamic";

const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ParcelPage({ params, searchParams }: PageProps<"/projects/[code]/[parcel]">) {
  const raw = await params;
  const projectCode = decodeURIComponent(raw.code);
  const parcelCode = decodeURIComponent(raw.parcel);
  if (!CODE.test(projectCode) || !CODE.test(parcelCode)) notFound();

  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={settingText(config, "projects.title", "المشاريع المتوفّرة")} />;
  }

  const mode = publicMode(access);
  const [projects, parcels] = await Promise.all([getPublicProjects(mode), getPublicParcels(mode)]);
  const project = findProject(projects, projectCode);
  const parcel = findParcel(parcels, projectCode, parcelCode);
  if (!project || !parcel) notFound();

  const query = await searchParams;
  const pick = (value: string | string[] | undefined) => (typeof value === "string" && UUID.test(value) ? value : undefined);
  const offer = await getParcelOffer(parcel.id, mode, { down: pick(query.down), installment: pick(query.installment) });
  if (!offer) notFound();

  const governorate = config.governorates.find((g) => g.id === parcel.governorate_id)?.name_ar;
  const irrigation = parcel.irrigation ? (IRRIGATION_LABELS as Record<string, string>)[parcel.irrigation] : null;
  const interestOpen = flagState(config, "interest_form") === "public";
  const canAsk = interestOpen && offer.offered && offer.priced;

  const cta = canAsk
    ? {
        // The old down payment and monthly installment choices are no longer questions (plan P2-6): the calculator
        // asks the payment once, with its own down-payment percentages and durations.
        href: interestHref({
          parcelId: parcel.id,
          trees: pick(query.trees) ?? offer.suggested_tree_count_option_id,
          scenario: pick(query.scenario) ?? offer.suggested_scenario_id,
        }),
        label: settingText(config, "projects.parcel_cta", "أنا مهتم بهذه القطعة"),
      }
    : interestOpen
      ? { href: "/register", label: settingText(config, "projects.taken_cta", "سجّل اهتمامك بقطعة مشابهة") }
      : null;

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <Link href={projectHref(project.code)} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          → {project.name}
        </Link>

        <div className="mt-5 grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="space-y-5">
            <RemotePhoto
              url={parcel.photo_url}
              alt={parcel.photo_alt_ar}
              seed={parcel.id}
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="aspect-4/3 rounded-3xl"
            />

            {/* The offer card in the order of clause 25.6 */}
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-3xl font-bold text-forest">القطعة {parcel.code}</h1>
                  <p className="mt-1 text-sm text-muted">{[project.name, governorate].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${parcelStatusTone(parcel.status)}`}>
                  {parcelStatusLabel(parcel.status)}
                </span>
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                <ParcelRow label="المساحة">{formatCount(parcel.area_m2)} م²</ParcelRow>
                <ParcelRow label="نوع العقار">{PROPERTY_TYPE_LABELS[parcel.property_type] ?? parcel.property_type}</ParcelRow>
                <ParcelRow label="نوع الغراسة">
                  {parcel.plantation_system ? (PLANTATION_LABELS[parcel.plantation_system] ?? parcel.plantation_system) : "—"}
                </ParcelRow>
                <ParcelRow label="عدد الزيتونات">
                  {parcel.property_type === "bare_land" ? "—" : formatCount(parcel.olive_tree_count ?? 0)}
                </ParcelRow>
                {parcel.tree_age_years ? <ParcelRow label="عمر الزيتونات">{formatCount(parcel.tree_age_years)} سنوات</ParcelRow> : null}
                <ParcelRow label="حالة الإنتاج">
                  {parcel.production_status ? (PRODUCTION_LABELS[parcel.production_status] ?? parcel.production_status) : "—"}
                </ParcelRow>
                {irrigation ? <ParcelRow label="الري">{irrigation}</ParcelRow> : null}
              </dl>
            </div>
          </div>

          <div className="space-y-5">
            <OfferBlock offer={offer} config={config} />

            {cta ? (
              <div className="hidden md:block">
                <Link href={cta.href} className="btn btn-primary min-h-14 w-full text-lg">
                  {cta.label}
                </Link>
                <p className="mt-2 text-center text-sm text-muted">{settingText(config, "site.final_cta_note")}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* On a phone this bar replaces the site-wide «سجّل مطلبك» bar, which hides itself on parcel pages. */}
      {cta ? (
        <>
          <div aria-hidden="true" className="h-24 md:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
            <Link href={cta.href} className="btn btn-primary min-h-13 w-full text-lg">
              {cta.label}
            </Link>
          </div>
        </>
      ) : null}
    </>
  );
}
