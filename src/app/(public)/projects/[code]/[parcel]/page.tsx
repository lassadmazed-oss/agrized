import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { OfferBlock } from "@/components/site/offer-block";
import { TreeOfferBlock } from "@/components/site/tree-offer-block";
import { RemotePhoto } from "@/components/site/site-photo";
import { DataRow } from "@/components/ui";
import { flagState, getPublicConfig, settingText } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount } from "@/lib/format";
import { IRRIGATION_LABELS } from "@/lib/land";
import { moduleAccess } from "@/lib/modules";
import { parcelStatusLabel, parcelStatusTone, PROPERTY_TYPE_LABELS } from "@/lib/projects";
import { interestHref, parcelHref, projectHref } from "@/lib/public-hrefs";
import {
  findParcel,
  findProject,
  getParcelOffer,
  getProjectQuote,
  getPublicParcels,
  getPublicProjects,
  publicMode,
} from "@/lib/public-projects";
import { parsePaymentMode } from "@/lib/tree-pricing";

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
  // Plan P5-4: a parcel of a tree-priced project is quoted on its own trees and class; others keep the 0020 offer.
  const payment = parsePaymentMode(query.payment) ?? null;
  const downPercentId = payment === "installments" ? (pick(query.down_pct) ?? null) : null;
  const durationId = payment === "installments" ? (pick(query.duration) ?? null) : null;
  const treeQuote = parcel.on_tree_pricing
    ? await getProjectQuote(parcel.project_id, mode, {
        spacingClassId: parcel.spacing_class_id,
        trees: parcel.olive_tree_count,
        paymentMode: payment,
        downPercentOptionId: downPercentId,
        durationOptionId: durationId,
      })
    : null;
  const offer = treeQuote ? null : await getParcelOffer(parcel.id, mode, { down: pick(query.down), installment: pick(query.installment) });
  if (!treeQuote && !offer) notFound();

  const governorate = config.governorates.find((g) => g.id === parcel.governorate_id)?.name_ar;
  const irrigation = parcel.irrigation ? (IRRIGATION_LABELS as Record<string, string>)[parcel.irrigation] : null;
  const interestOpen = flagState(config, "interest_form") === "public";
  // A tree parcel can be asked for while its price is still hidden; a legacy parcel needs its offer priced.
  const canAsk = interestOpen && (treeQuote ? parcel.offered : Boolean(offer?.offered && offer.priced));

  const cta = canAsk
    ? {
        // The choices made here travel to the form, which never asks them again (plan P2-6).
        href: treeQuote
          ? interestHref({
              parcelId: parcel.id,
              treesCustom: parcel.olive_tree_count,
              spacing: parcel.spacing_class_id,
              payment,
              downPercent: downPercentId,
              duration: durationId,
            })
          : interestHref({
              parcelId: parcel.id,
              trees: pick(query.trees) ?? offer?.suggested_tree_count_option_id,
              scenario: pick(query.scenario) ?? offer?.suggested_scenario_id,
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
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-3xl font-bold text-forest">القطعة {parcel.code}</h1>
                  <p className="mt-1 text-sm text-muted">{[project.name, governorate].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`pill shrink-0 ring-1 ring-inset ${parcelStatusTone(parcel.status)}`}>
                  {parcelStatusLabel(parcel.status)}
                </span>
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                <DataRow padded={false} label="المساحة">{formatCount(parcel.area_m2)} م²</DataRow>
                <DataRow padded={false} label="نوع العقار">{PROPERTY_TYPE_LABELS[parcel.property_type] ?? parcel.property_type}</DataRow>
                <DataRow padded={false} label="نوع الغراسة">
                  {parcel.plantation_system ? (PLANTATION_LABELS[parcel.plantation_system] ?? parcel.plantation_system) : "—"}
                </DataRow>
                <DataRow padded={false} label="عدد الزيتونات">
                  {parcel.property_type === "bare_land" ? "—" : formatCount(parcel.olive_tree_count ?? 0)}
                </DataRow>
                {parcel.tree_age_years ? <DataRow padded={false} label="عمر الزيتونات">{formatCount(parcel.tree_age_years)} سنوات</DataRow> : null}
                <DataRow padded={false} label="حالة الإنتاج">
                  {parcel.production_status ? (PRODUCTION_LABELS[parcel.production_status] ?? parcel.production_status) : "—"}
                </DataRow>
                {irrigation ? <DataRow padded={false} label="الري">{irrigation}</DataRow> : null}
              </dl>
            </div>
          </div>

          <div className="space-y-5">
            {treeQuote ? (
              <TreeOfferBlock
                quote={treeQuote}
                config={config}
                baseHref={parcelHref(project.code, parcel.code)}
                choice={{ payment, downPercent: downPercentId, duration: durationId }}
              />
            ) : offer ? (
              <OfferBlock offer={offer} config={config} />
            ) : null}

            {cta ? (
              <div className="hidden md:block">
                <Link href={cta.href} className="btn btn-primary w-full text-lg">
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
            <Link href={cta.href} className="btn btn-primary w-full text-lg">
              {cta.label}
            </Link>
          </div>
        </>
      ) : null}
    </>
  );
}
