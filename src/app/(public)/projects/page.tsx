import type { Metadata } from "next";
import Link from "next/link";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { ParcelCard } from "@/components/site/parcel-card";
import { ProjectCard } from "@/components/site/project-card";
import { getPublicConfig, optionsFor, settingText, type PublicConfig } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";
import { OFFER_TYPE_LABELS, offerTypeOf, type OfferType } from "@/lib/projects";
import { parcelHref, projectHref } from "@/lib/public-hrefs";
import { getPublicParcels, getPublicProjects, publicMode, type PublicParcel } from "@/lib/public-projects";

export const metadata: Metadata = {
  title: "المشاريع المتوفّرة",
  description: "قطع زيتون بمساحتها وعدد زيتوناتها ونوع غراستها وحالة إنتاجها. بلا وعود.",
};

// The «internal» module state checks the staff session cookie, so this page renders per request.
export const dynamic = "force-dynamic";

/** Report v3 §18. Down payment and duration filters arrive with the duration-based pricing. */
type Filters = {
  gov: number | null;
  del: number | null;
  type: OfferType | null;
  trees: string | null;
  area: string | null;
  price: number | null;
  available: boolean;
};

const MAX_PRICE_DINARS = 10_000_000;

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={settingText(config, "projects.title", "المشاريع المتوفّرة")} />;
  }

  const mode = publicMode(access);
  const [projects, parcels] = await Promise.all([getPublicProjects(mode), getPublicParcels(mode)]);
  const filters = readFilters(await searchParams, config);
  const shown = parcels.filter((parcel) => matches(parcel, filters, config));

  const open = projects.filter((project) => project.status === "published" || project.status === "internal");
  const closed = projects.filter((project) => project.status === "sold_out" || project.status === "operating");
  const place = (governorateId: number) => config.governorates.find((g) => g.id === governorateId)?.name_ar ?? "";
  const pricePending = settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً.");
  const maxMonths = longestDuration(config);

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <section className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="font-display text-4xl font-bold text-forest sm:text-5xl">
              {settingText(config, "projects.title", "المشاريع المتوفّرة")}
            </h1>
            <p className="mt-3 leading-7 text-muted">
              {settingText(
                config,
                "projects.intro",
                "كل مشروع يحدّد وحدته: قدّاش من زيتونة وقدّاش من مساحة. الأرقام تختلف من مشروع لآخر، فتبدا من عدد الزيتونات ونوريوك الباقي حسب المشروع.",
              )}
            </p>
          </div>
          <Link href="/projects/map" className="btn btn-secondary">
            شوف الولايات
          </Link>
        </div>
      </section>

      {open.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <h2 className="text-lg font-semibold text-ink">
            {settingText(config, "projects.open_title", "المشاريع المفتوحة")}
          </h2>
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((project) => (
              <ProjectCard key={project.id} project={project} href={projectHref(project.code)} place={place(project.governorate_id)} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <FilterForm filters={filters} config={config} />

          {shown.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-paper px-6 py-12 text-center">
              <p className="leading-7 text-muted">
                {settingText(
                  config,
                  "projects.empty_text",
                  "ما فماش قطع متاحة بهذه المعايير توّا. سجّل مطلبك ونعلموك أول ما تتوفر قطعة تشبه اللي تحب.",
                )}
              </p>
              <Link href="/register" className="btn btn-primary mt-5">
                سجّل مطلبك
              </Link>
            </div>
          ) : (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((parcel) => (
                <ParcelCard
                  key={parcel.id}
                  parcel={parcel}
                  href={parcelHref(parcel.project_code, parcel.code)}
                  place={`${parcel.project_name} · ${place(parcel.governorate_id)}`}
                  pricePending={pricePending}
                  maxMonths={maxMonths}
                />
              ))}
            </ul>
          )}

          <LegalNotes config={config} />
        </div>
      </section>

      {closed.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h2 className="text-lg font-semibold text-ink">{settingText(config, "projects.closed_title", "مشاريع مكتملة")}</h2>
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((project) => (
              <ProjectCard key={project.id} project={project} href={projectHref(project.code)} place={place(project.governorate_id)} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/**
 * The longest duration in the Back Office's `duration` list (months). That list comes with the
 * duration-based pricing of report v3 §8; until it exists nothing is shown rather than a guessed cap.
 */
export function longestDuration(config: PublicConfig): number | null {
  const months = optionsFor(config, "duration")
    .map((option) => Number(option.min_number))
    .filter((value) => Number.isFinite(value) && value > 0);
  return months.length > 0 ? Math.max(...months) : null;
}

function readFilters(params: Record<string, string | string[] | undefined>, config: PublicConfig): Filters {
  const text = (value: string | string[] | undefined) => (typeof value === "string" && value ? value : null);
  const gov = Number(text(params.gov));
  const del = Number(text(params.del));
  const type = text(params.type);
  const trees = text(params.trees);
  const area = text(params.area);
  const price = Number(text(params.price));
  const validGov = config.governorates.some((g) => g.id === gov) ? gov : null;
  return {
    gov: validGov,
    // A delegation only counts when it belongs to the chosen governorate.
    del: validGov !== null && config.delegations.some((d) => d.id === del && d.governorate_id === validGov) ? del : null,
    type: type && type in OFFER_TYPE_LABELS ? (type as OfferType) : null,
    trees: trees && optionsFor(config, "tree_count").some((option) => option.id === trees) ? trees : null,
    area: area && optionsFor(config, "desired_area").some((option) => option.id === area) ? area : null,
    price: Number.isFinite(price) && price > 0 && price <= MAX_PRICE_DINARS ? price : null,
    available: text(params.available) === "1",
  };
}

function inRange(value: number, option: { min_number: number | null; max_number: number | null } | undefined): boolean {
  if (!option || option.min_number === null) return true; // an open choice filters nothing
  if (value < Number(option.min_number)) return false;
  return option.max_number === null || value <= Number(option.max_number);
}

function matches(parcel: PublicParcel, filters: Filters, config: PublicConfig): boolean {
  if (filters.gov !== null && parcel.governorate_id !== filters.gov) return false;
  if (filters.del !== null && parcel.delegation_id !== filters.del) return false;
  if (filters.type && offerTypeOf(parcel) !== filters.type) return false;
  if (filters.available && !parcel.offered) return false;
  if (filters.price !== null && (parcel.cash_price_millimes === null || parcel.cash_price_millimes > filters.price * 1000)) {
    return false;
  }
  if (filters.area && !inRange(parcel.area_m2, optionsFor(config, "desired_area").find((item) => item.id === filters.area))) {
    return false;
  }
  // Bare land has no trees yet, so a tree count never hides it.
  if (
    filters.trees &&
    parcel.property_type !== "bare_land" &&
    !inRange(parcel.olive_tree_count ?? 0, optionsFor(config, "tree_count").find((item) => item.id === filters.trees))
  ) {
    return false;
  }
  return true;
}

function FilterForm({ filters, config }: { filters: Filters; config: PublicConfig }) {
  const delegations = filters.gov === null ? [] : config.delegations.filter((d) => d.governorate_id === filters.gov);

  return (
    <form method="get" action="/projects" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <p className="text-sm leading-6 text-muted sm:col-span-2 lg:col-span-4">
        {settingText(
          config,
          "projects.filters_hint",
          "صفّي حسب الولاية أو نوع العرض أو السعر أو المساحة أو عدد الزيتونات. الأراضي البيضاء تظهر دايماً مهما كان عدد الزيتونات المختار.",
        )}
      </p>
      <label className="block">
        <span className="label">الولاية</span>
        <select name="gov" defaultValue={filters.gov ?? ""} className="field">
          <option value="">الكل</option>
          {config.governorates.map((governorate) => (
            <option key={governorate.id} value={governorate.id}>
              {governorate.name_ar}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">المعتمدية</span>
        <select name="del" defaultValue={filters.del ?? ""} disabled={delegations.length === 0} className="field">
          <option value="">{delegations.length === 0 ? "اختر الولاية أولاً" : "الكل"}</option>
          {delegations.map((delegation) => (
            <option key={delegation.id} value={delegation.id}>
              {delegation.name_ar}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">نوع العرض</span>
        <select name="type" defaultValue={filters.type ?? ""} className="field">
          <option value="">الكل</option>
          {Object.entries(OFFER_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">أقصى سعر حاضر (د.ت)</span>
        <input
          type="number"
          name="price"
          min={1}
          max={MAX_PRICE_DINARS}
          step={500}
          defaultValue={filters.price ?? ""}
          inputMode="numeric"
          dir="ltr"
          className="field text-left"
        />
      </label>
      <label className="block">
        <span className="label">المساحة</span>
        <select name="area" defaultValue={filters.area ?? ""} className="field">
          <option value="">الكل</option>
          {optionsFor(config, "desired_area").map((option) => (
            <option key={option.id} value={option.id}>
              {option.label_ar}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">عدد الزيتونات</span>
        <select name="trees" defaultValue={filters.trees ?? ""} className="field">
          <option value="">الكل</option>
          {optionsFor(config, "tree_count").map((option) => (
            <option key={option.id} value={option.id}>
              {option.label_ar}
            </option>
          ))}
        </select>
      </label>
      <label className="choice self-end">
        <input type="checkbox" name="available" value="1" defaultChecked={filters.available} />
        <span className="font-medium">المتوفّر فقط</span>
      </label>
      <div className="flex gap-2 self-end">
        <button type="submit" className="btn btn-primary flex-1">
          صفّي
        </button>
        <Link href="/projects" className="btn btn-ghost">
          مسح
        </Link>
      </div>
    </form>
  );
}

export function LegalNotes({ config }: { config: PublicConfig }) {
  return (
    <div className="mt-8 max-w-3xl space-y-2 text-sm leading-6">
      <p className="rounded-xl bg-gold-soft/50 px-4 py-3 text-ink/80">{settingText(config, "legal.parcel_card_note")}</p>
      <p className="text-muted">{settingText(config, "legal.no_guarantee_notice")}</p>
    </div>
  );
}
