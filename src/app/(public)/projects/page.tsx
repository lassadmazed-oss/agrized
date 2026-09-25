import type { Metadata } from "next";
import Link from "next/link";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import { OfferCard } from "@/components/site/offer-card";
import {
  areaPerTree,
  getOfferStocks,
  LegalNotes,
  offerCardLabels,
  offersTitle,
  offerTreePrice,
  stockCounted,
} from "@/components/site/offers";
import { RemotePhoto } from "@/components/site/site-photo";
import { estimateLabel } from "@/components/site/site-header";
import { EmptyState, SectionHeader } from "@/components/ui";
import { getPublicConfig, settingText, type PublicConfig } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import { projectHref } from "@/lib/public-hrefs";
import { getPublicProjects, publicMode, type PublicProject } from "@/lib/public-projects";

import { ProjectsPhone, type PhoneOffer } from "./projects-phone";

/**
 * The catalogue of offers.
 *
 * Until 2026-09-18 the lower half of this page was a grid of parcels read from `public_parcels()`, with
 * six filters over parcel columns. `public.parcels` holds no row, so that grid was structurally empty and
 * its «ما فماش قطع متاحة» sat directly under a header announcing 600 available trees — the page
 * contradicted itself on every load. The owner removed the layer: «remove the pieces thing, its simply
 * selling the trees». What is left is the offers, each one carrying the count of its own trees, and the
 * two filters that were never about parcels — the governorate and its delegation.
 */
export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: offersTitle(config),
    description: settingText(
      config,
      "projects.meta_description",
      "عروض زيتون حقيقية: كل عرض بعدد زيتوناته والمساحة اللي تجي مع كل زيتونة ونوع غراستها وحالة إنتاجها. بلا وعود.",
    ),
  };
}

// The «internal» module state checks the staff session cookie, so this page renders per request.
export const dynamic = "force-dynamic";

/** Report v3 §18. Down payment and duration filters arrive with the duration-based pricing. */
type Filters = {
  gov: number | null;
  del: number | null;
  available: boolean;
};

// This module exports nothing but the route: the shared offer vocabulary — areaPerTree, offerCardLabels,
// offersTitle, offerTreePrice and the stock reader — lives in `@/components/site/offers`, and the home page
// imports it from there. Re-exporting it here made another page drag a whole route module into its graph.
// The `offerStock(project, parcels)` shim that stood here until the home page moved is gone with it.

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={offersTitle(config)} />;
  }

  const mode = publicMode(access);
  const projects = await getPublicProjects(mode);
  const filters = readFilters(await searchParams, config);
  const shown = projects.filter((project) => matches(project, filters));

  const open = shown.filter((project) => project.status === "published" || project.status === "internal");
  const closed = shown.filter((project) => project.status === "sold_out" || project.status === "operating");
  const place = (governorateId: number) => config.governorates.find((g) => g.id === governorateId)?.name_ar ?? "";
  // The price of a tree exists for the visitor only while the pricing module is open to them (FLAG-02).
  const pricingOpen = (await moduleAccess(config, "pricing")) !== "closed";

  // One reading of the stock per offer, shared by the cards and by the figure in the header. It is a
  // count of rows in `public.trees` (public_offer_stock, 0054) — not the offer's declared tree_count, and
  // never a price: the stock RPC carries no money key at all and is gated on the projects module alone.
  const stockOf = await getOfferStocks(
    shown.map((project) => project.id),
    mode,
  );
  // An offer whose trees are not numbered yet has an unknown stock, so it is left out of the total
  // instead of adding a confident 0 to it.
  const treesAvailable = open.reduce((sum, project) => {
    const stock = stockOf.get(project.id);
    return stockCounted(stock) ? sum + stock.available : sum;
  }, 0);

  // «زيتونة متاحة» is the tree unit with the state the trees are counted by — the same pair of words the
  // figure in the header carries. The home page prints the same card, so the labels live in one place.
  const cardLabels = offerCardLabels(config);
  const offerCard = (project: PublicProject) => {
    const stock = stockOf.get(project.id);
    return (
      <OfferCard
        key={project.id}
        project={project}
        stock={
          stockCounted(stock)
            ? { available: stock.available, reserved: stock.reserved, sold: stock.sold }
            : { available: null, reserved: 0, sold: 0 }
        }
        href={projectHref(project.code)}
        place={place(project.governorate_id)}
        areaPerTreeM2={areaPerTree(project)}
        pricePerTreeMillimes={offerTreePrice(project, pricingOpen)}
        labels={cardLabels}
      />
    );
  };

  /*
   * The same catalogue, arranged for a phone (owner, 2026-09-21, on a drawing of this screen). <ProjectsPhone>
   * owns everything below `md` — the breakpoint the phone shell's own tab bar uses — and the sections under it
   * own `md` and up, unchanged.
   *
   * Nothing is read twice: the rows below are the offers, stocks and prices this page already resolved, each
   * formatted once. The filter row is built from the words the offers themselves carry, so it can never offer
   * a choice that matches nothing, and a list typed in here would be the hard-coded list CLAUDE.md forbids.
   */
  const treeUnit = settingText(config, "start.trees_unit", "زيتونة");
  const offerWords = (project: PublicProject) =>
    [
      project.production_status ? (PRODUCTION_LABELS[project.production_status] ?? project.production_status) : null,
      project.plantation_system ? (PLANTATION_LABELS[project.plantation_system] ?? project.plantation_system) : null,
    ].filter((word): word is string => Boolean(word));

  const phoneOffer = (project: PublicProject): PhoneOffer => {
    const stock = stockOf.get(project.id);
    const counted = stockCounted(stock);
    const trees = counted ? stock.available : (project.tree_count ?? 0);
    const price = offerTreePrice(project, pricingOpen);
    return {
      id: project.id,
      href: projectHref(project.code),
      name: project.name,
      place: place(project.governorate_id),
      // The count is what is free to buy once the trees are numbered, so it is named as such; an offer whose
      // trees are not numbered yet states its own declared count under the bare unit.
      trees: `${formatCount(trees)} ${counted ? cardLabels.available : treeUnit}`,
      areaPerTree: areaPerTree(project) ? formatArea(Math.round(areaPerTree(project)!)) : null,
      // Reserved plus contracted over the whole stock. Only an offer whose trees are numbered has a share to
      // state: on one that does not, «0٪» would read as «nobody wants it» rather than «not counted yet».
      takenPercent:
        counted && stock.available + stock.reserved + stock.sold > 0
          ? Math.round(((stock.reserved + stock.sold) / (stock.available + stock.reserved + stock.sold)) * 100)
          : null,
      // The money alone: «ابتداءً من» is set under it by the row, so the figure keeps the weight.
      price: price === null ? null : formatMillimes(price),
      status:
        project.status === "published"
          ? null
          : { label: projectStatusLabel(project.status), toneClass: projectStatusTone(project.status) },
      facets: offerWords(project),
      search: [project.name, place(project.governorate_id), project.code].join(" ").toLowerCase(),
      image: (
        <RemotePhoto
          url={project.cover_url}
          alt={project.cover_alt_ar}
          seed={project.id}
          sizes="(min-width: 768px) 0px, 6rem"
          // The thumbnail fills the row rather than reserving a ratio of its own: the row's height is set
          // by the words beside it, and a square in a taller card leaves a notch of blank card under it.
          // `size-full`, not `absolute inset-0`: RemotePhoto's own box is `relative`, and Tailwind defines
          // `relative` after `absolute`, so the latter would lose and the box would collapse to nothing.
          className="size-full"
        />
      ),
    };
  };

  const phoneOffers = [...open, ...closed].map(phoneOffer);
  /** Every word at least one shown offer carries, in the order the offers put them. */
  const phoneFacets = [...new Set(shown.flatMap(offerWords))];

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <ProjectsPhone
        title={offersTitle(config)}
        backHref="/"
        offers={phoneOffers}
        facets={phoneFacets}
        copy={{
          all: settingText(config, "offers.filter_all", "الكل"),
          search: settingText(config, "offers.search_placeholder", "إبحث عن مشروع..."),
          empty: settingText(
            config,
            "projects.empty_text",
            "ما فماش عروض بهذه المعايير توّا. سجّل مطلبك ونعلموك أول ما يتوفّر عرض يشبه اللي تحب.",
          ),
          pricePending: cardLabels.pricePending,
          open: offersTitle(config),
          from: cardLabels.from,
          taken: settingText(config, "offers.taken_share_label", "عليها طلبات"),
        }}
      />

      {/* The opening: what this page is, in one measure, with the one figure that answers «is there
          anything left?». The map link moved down to the filters, where the governorate is chosen.

          On a phone the figure used to sit BETWEEN the paragraph and the list — a number floating in the
          gap between an explanation and the thing it explains. The three parts are one grid now: the name
          of the page, then the figure, then the sentence, in that reading order on a phone (design
          direction §2.2, «الرقم هو البطل» — the figure is read before the prose that qualifies it), and on
          a wide screen the figure moves into a column of its own beside both lines. */}
      <section className="mx-auto hidden max-w-6xl px-4 pb-cozy pt-section sm:px-6 sm:pt-band md:block">
        <div className="grid gap-cozy lg:grid-cols-[1fr_auto] lg:items-end lg:gap-x-roomy">
          <h1 className="section-title lg:col-start-1 lg:row-start-1">{offersTitle(config)}</h1>
          {/* justify-self, not self: in the flex column this used to be, `self-start` was the cross axis and
              kept the tile at the width of its figure. In a grid it is the block axis, and the tile stretched
              to the full 705px of a tablet row — one figure marooned in a white box, which is the exact fault
              this pass is removing from the offer page's hero panel. */}
          {treesAvailable > 0 ? (
            <p className="stat panel justify-self-start self-start px-roomy py-cozy lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-end">
              <span className="stat-figure">{formatCount(treesAvailable)}</span>
              <span className="stat-label">{cardLabels.available}</span>
            </p>
          ) : null}
          <p className="max-w-[34rem] text-body text-muted lg:col-start-1 lg:row-start-2">
            {settingText(
              config,
              "projects.intro",
              "كل مشروع يحدّد وحدته: قدّاش من زيتونة وقدّاش من مساحة. الأرقام تختلف من مشروع لآخر، فتبدا من عدد الزيتونات ونوريوك الباقي حسب المشروع.",
            )}
          </p>
        </div>
      </section>

      {open.length > 0 ? (
        <section className="mx-auto hidden max-w-6xl px-4 pb-band pt-cozy sm:px-6 md:block">
          {/* «المشاريع المفتوحة» is a heading only when there is a second set to tell it apart from. On a
              page whose <h1> already says «عروضنا» and whose next object is the offers themselves, it was a
              second title saying nearly the same thing — and at level 2 it printed at 18px over card titles
              of 24px, a list heading smaller than its own items. When the closed set is on the page the two
              need naming, and both are named at the same size. */}
          {closed.length > 0 ? (
            <SectionHeader
              title={settingText(config, "projects.open_title", "المشاريع المفتوحة")}
              level={1}
              as="h2"
              className="mb-cozy"
            />
          ) : null}
          <ul className="grid gap-cozy sm:grid-cols-2 lg:grid-cols-3">{open.map(offerCard)}</ul>
        </section>
      ) : null}

      {/* A dense band, on purpose: the offers above breathe, the choices are read as controls. */}
      <section className="hidden border-y border-line bg-surface md:block">
        <div className="mx-auto max-w-6xl px-4 py-section sm:px-6">
          <FilterForm filters={filters} config={config} />

          {shown.length === 0 ? (
            <EmptyState
              className="mt-cozy bg-paper"
              // It used to read «سجّل مطلبك» and open /register — a fifth word for one act, on a page that
              // redirects straight back to /start. The calculator is where the journey starts, and it is
              // named here with the word every other surface gives it. 2026-09-19.
              action={
                <Link href="/start" className="btn btn-primary">
                  {estimateLabel(config)}
                </Link>
              }
            >
              {settingText(
                config,
                "projects.empty_text",
                "ما فماش عروض بهذه المعايير توّا. سجّل مطلبك ونعلموك أول ما يتوفّر عرض يشبه اللي تحب.",
              )}
            </EmptyState>
          ) : null}

          <LegalNotes config={config} />
        </div>
      </section>

      {closed.length > 0 ? (
        <section className="mx-auto hidden max-w-6xl px-4 py-section sm:px-6 md:block">
          <SectionHeader title={settingText(config, "projects.closed_title", "مشاريع مكتملة")} level={1} as="h2" />
          <ul className="mt-cozy grid gap-cozy sm:grid-cols-2 lg:grid-cols-3">{closed.map(offerCard)}</ul>
        </section>
      ) : null}
    </>
  );
}

function readFilters(params: Record<string, string | string[] | undefined>, config: PublicConfig): Filters {
  const text = (value: string | string[] | undefined) => (typeof value === "string" && value ? value : null);
  const gov = Number(text(params.gov));
  const del = Number(text(params.del));
  const validGov = config.governorates.some((g) => g.id === gov) ? gov : null;
  return {
    gov: validGov,
    // A delegation only counts when it belongs to the chosen governorate.
    del: validGov !== null && config.delegations.some((d) => d.id === del && d.governorate_id === validGov) ? del : null,
    available: text(params.available) === "1",
  };
}

/** The filters read the offer itself now: where it is, and whether it is still on sale. */
function matches(project: PublicProject, filters: Filters): boolean {
  if (filters.gov !== null && project.governorate_id !== filters.gov) return false;
  if (filters.del !== null && project.delegation_id !== filters.del) return false;
  if (filters.available && !project.offered) return false;
  return true;
}

function FilterForm({ filters, config }: { filters: Filters; config: PublicConfig }) {
  const delegations = filters.gov === null ? [] : config.delegations.filter((d) => d.governorate_id === filters.gov);

  return (
    /* The filters are a tray, not loose fields: on a white band hairline selects and a bordered
       checkbox read as debris next to the offer cards above them, which are all surface and shadow.
       .panel gives the set one edge; bg-paper separates it from the white band it sits on. */
    <form
      method="get"
      action="/projects"
      className="panel grid gap-snug bg-paper p-cozy sm:grid-cols-2 sm:p-roomy lg:grid-cols-4 lg:items-end"
    >
      {/* The map belongs to the sentence about choosing a governorate, not to the top of the page on
          its own (owner, 2026-09-18: the button floated with no relationship to anything). */}
      <div className="flex flex-wrap items-center justify-between gap-snug sm:col-span-2 lg:col-span-4">
        <p className="max-w-[44rem] text-caption leading-6 text-muted">
          {settingText(
            config,
            "projects.filters_hint",
            "صفّي حسب الولاية والمعتمدية، ولا ورّي كان العروض اللي مازالت مفتوحة. كل عرض يقول قدّاش من زيتونة فيه وقدّاش مازال متاح.",
          )}
        </p>
        <Link href="/projects/map" className="btn btn-ghost shrink-0">
          شوف الولايات
          <span aria-hidden="true">←</span>
        </Link>
      </div>
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
