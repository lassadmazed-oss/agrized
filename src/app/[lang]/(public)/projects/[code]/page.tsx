import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import Link from "@/components/site/link";
import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import {
  areaPerTree,
  getOfferStock,
  LegalNotes,
  offersTitle,
  StockCell,
  stockCounted,
  stockLabels,
} from "@/components/site/offers";
import { ProjectGallery } from "@/components/site/project-gallery";
import { ProjectVideo } from "@/components/site/project-video";
import { RemotePhoto } from "@/components/site/site-photo";
import { DataList, DataRow, StatusPill } from "@/components/ui";
import { flagState, formatFor, getPublicConfig, optionsFor, settingText, t, type PublicConfig } from "@/lib/config";
import type { SiteFormat } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { projectStatusTone, publicStatusKey } from "@/lib/projects";
import { findProject, getProjectPage, getProjectQuote, getPublicProjects, publicMode } from "@/lib/public-projects";

import { OfferPhone, type OfferPhoneFact } from "./offer-phone";

/**
 * The tab said «مشروع» — a word this page stopped using on 2026-09-18 and the last hard-coded one on it.
 * It then named the catalogue it belongs to (2026-09-19), which made every offer the same «عروضنا» to a
 * search engine and in a list of tabs. Since 0109 the offer has a name and a description in every language,
 * so the tab carries the offer's own name — «Domaine Chaal · Nos offres» — and its description is the
 * offer's, cut at a sentence a result page can show. A closed module or an unknown code keeps the catalogue's
 * title; the page itself decides what to answer.
 */
export async function generateMetadata({ params }: PageProps<"/[lang]/projects/[code]">): Promise<Metadata> {
  const config = await getPublicConfig();
  const catalogue = offersTitle(config);
  const { code } = await params;
  if (!CODE.test(code) || flagState(config, "projects") !== "public") return { title: catalogue };
  const [projects, page] = await Promise.all([
    getPublicProjects("anon", config.locale),
    getProjectPage(code, "anon", config.locale),
  ]).catch(() => [[], null] as const);
  const project = findProject([...projects], code);
  if (!project) return { title: catalogue };
  const about = (page?.description ?? project.location_description ?? "").replace(/\s+/g, " ").trim();
  return {
    title: `${project.name} · ${catalogue}`,
    description: about.length > 160 ? `${about.slice(0, 157).replace(/\s\S*$/, "")}…` : about || undefined,
    openGraph: project.cover_url ? { images: [{ url: project.cover_url, alt: project.cover_alt_ar ?? project.name }] } : undefined,
  };
}

export const dynamic = "force-dynamic";

const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/;

/**
 * A short description is a lead line, not a band. Above this many characters it keeps its own section and
 * its own heading; below it, it rides under the title in the hero. Measured, not a business rule: 140
 * characters is about two lines at 375px, and a 30px «على المشروع» heading over one line was the first
 * thing under the hero that read as unfinished (owner, 2026-09-19).
 */
const LEAD_MAX_CHARS = 140;

/** The card-title step: one size between `.section-title` and a value, used by every head on this page. */
const CARD_TITLE = "font-display text-2xl font-bold text-forest";

/**
 * One offer, read in the order a visitor reads it (owner, 2026-09-18, on the live page at 375px):
 * who and where → the two figures he came for → the picture → the facts, in named groups → this
 * offer's own form.
 *
 * What the 2026-09-19 redesign changed, and nothing else — every figure, every rule and every answer the
 * form asks for is untouched:
 *  · the hero is ONE object: title, place, figures and picture bound together, the reference code demoted
 *    to the foot of the figures and the map link moved onto the picture of the place it opens;
 *  · the cover survives an arbitrary upload — one ratio (the catalogue card's 16:9), a forest scrim over
 *    the whole frame and AgriZed's own words set on it, so a promotional collage reads as texture behind
 *    a caption instead of shouting a foreign yield figure louder than the offer's own price;
 *  · the two mid-page doors are gone. They said the form's own title 144px above the form, and the second
 *    one teleported the visitor 1,684px into the middle of it. The form is the next thing on the page and
 *    carries its own bar on a phone;
 *  · «طريقة الدفع» is folded into the payment question inside the form, where it answers something being
 *    asked, and the services are a fact of the offer beside the other facts — so nothing after the form
 *    asks for a scroll it has not earned;
 *  · the legal note rides at the foot of the figures it qualifies (PRN-01) instead of holding a band of
 *    its own, and the hero's own amount carries an estimate note where it is read.
 *
 * Report v3 §20 still orders what comes after the hero: gallery, video, description, documents, prices,
 * payment, services, visit.
 */
export default async function ProjectPage({ params }: PageProps<"/[lang]/projects/[code]">) {
  const code = decodeURIComponent((await params).code);
  if (!CODE.test(code)) notFound();

  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={offersTitle(config)} />;
  }

  const mode = publicMode(access);
  const [projects, page] = await Promise.all([
    getPublicProjects(mode, config.locale),
    getProjectPage(code, mode, config.locale),
  ]);
  const project = findProject(projects, code);
  if (!project) notFound();
  const fmt = formatFor(config);
  const { formatArea, formatCount } = fmt;

  // An offer sold by the tree carries no parcel, so its own page showed no price and no way to ask for it
  // (owner, 2026-09-18). One tree prices the offer; the form multiplies, and the database prices it again on
  // submit. The figures are null while prices are closed, and the form then says so instead of an amount.
  //
  // What the count must NOT depend on is a price. It used to: `project.on_tree_pricing ? tree_count : 0`
  // hid the form on every offer, because on_tree_pricing is false until the offer lists a spacing class.
  // submit_offer_request (0049) asks for a visible offer and 1..tree_count trees, never for a price, so the
  // form is offered on the offer's own trees and the price rows fall back to «السعر يُعلن لاحقاً».
  const declaredTrees = project.tree_count ?? 0;

  // The stock is rows of `public.trees` (public_offer_stock, 0054), never the parcels this page used to
  // sum: there are none, so «متاحة» was the offer's declared tree_count relabelled and could not move when
  // a tree was reserved. An offer whose trees are not numbered yet has an UNKNOWN stock, not an empty one,
  // so nothing is counted for it and the page falls back to what the offer declares, named as such.
  const stock = await getOfferStock(project.id, mode);
  const counted = stockCounted(stock);
  // What the visitor may still ask for. Once trees are numbered, that is what is free — not what the
  // offer declares, which would let someone ask for 500 trees of which 400 are already sold.
  const sellableTrees = counted ? stock.available : declaredTrees;
  // The smallest basket this offer sells, whether or not its trees are numbered yet. It used to be read only
  // while `counted` held, so an offer with `min_trees_per_order = 10` and no tree rows let a visitor fill the
  // whole form and be refused with `below_min_trees` at the end — `app.offer_min_trees()` reads
  // `projects.min_trees_per_order` (else `offers.min_trees_default`) and never looks at the tree rows.
  const minTrees = stock?.minTrees ?? 1;
  const openingTrees = Math.max(1, Math.min(minTrees, Math.max(sellableTrees, 1)));

  // The offer's own quote — asked for the basket the form opens on, so the first figures a visitor reads
  // belong to the first count they see. It carries far more than the price: `choices.down_percents` and
  // `choices.durations` are THIS offer's own payment options (owner, 2026-09-19: «each offer has its own
  // stuff»), resolved in Postgres from `project_down_payment_percents` and `financing_markups` — and never
  // the global lists when the offer has its own. The form re-quotes the same function on every answer.
  const offerQuote =
    declaredTrees > 0 && project.on_tree_pricing ? await getProjectQuote(project.id, mode, { trees: openingTrees }) : null;
  const perTree = areaPerTree(project);
  const governorate = config.governorates.find((g) => g.id === project.governorate_id)?.name;
  const delegation = config.delegations.find((d) => d.id === project.delegation_id)?.name;
  // The two irrigation words and the three production words are the public site's own (ui.offer.*); the
  // planting system is a Back Office list (plantation_system), so its word is the list's.
  const irrigation = project.irrigation ? t(config, `ui.offer.irrigation_${project.irrigation}`) : null;
  const plantation = project.plantation_system ? plantationLabel(config, project.plantation_system) : null;
  const production = project.production_status ? t(config, `ui.offer.production_${project.production_status}`) : null;
  const statusLabel = t(config, publicStatusKey(project.status));

  const pictures = page?.media ?? [];
  const cover = pictures[0] ?? null;
  // The first picture is the cover in the hero; the rest belong to the gallery.
  const gallery = pictures.slice(1);
  const water = page ? waterText(config, page.water_available, page.water_note) : null;
  const documents = chosenLabels(config, "land_document", page?.document_option_ids);
  const services = chosenLabels(config, "agrized_service", page?.service_option_ids);
  const mapHref =
    page && page.latitude !== null && page.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${page.latitude},${page.longitude}`
      : null;
  // Payment and visits only concern an offer that is still selling its trees.
  const selling = project.status === "published" || project.status === "internal";
  const interestOpen = flagState(config, "interest_form") === "public";
  const formOpen = selling && interestOpen && sellableTrees > 0;
  const videoTitle = t(config, "projects.video_title");
  const galleryTitle = t(config, "projects.gallery_title");
  const videoLink = t(config, "ui.offer.video_link");
  // Every label on this page is a key the Back Office holds, in the visitor's language. The
  // four stock words are the offer keys of migration 0054 — the tree's own three states — not the
  // seven-value parcel vocabulary this page used to borrow.
  const treesLabel = t(config, "start.row_trees");
  const stockWords = stockLabels(config);
  const fromPrefix = t(config, "start.from_prefix");
  const perTreeLabel = t(config, "start.row_area_per_tree");
  const paymentText = t(config, "projects.payment_text");

  // PRJ-03: a price is a permission (public_projects() publishes none while pricing is closed to this
  // visitor), stock and area are facts. So the price cell disappears on its own and the offer's area
  // takes its place in the hero — no land price, no planting cost, no margin, no formula, ever.
  const areaLabel = t(config, "start.row_total_area");
  const priceFigure = offerPrice(project, fmt, {
    prefix: fromPrefix,
    perTree: t(config, "start.row_price_per_tree"),
    cash: t(config, "ui.offer.cash_price_label"),
  });
  const areaFigure = project.total_area_m2 ? { value: formatArea(project.total_area_m2), label: areaLabel } : null;
  const leadFigure = priceFigure ?? areaFigure;
  /** The total area is stated once: in the hero when it leads, in the land group otherwise. */
  const areaInHero = !priceFigure && areaFigure !== null;

  /**
   * The land one tree comes with, written the way the offer publishes it — a single area, or the range
   * between the offer's own two spacings. It is the third hero figure, so it is no longer a row of the
   * «الزيتون» card: what a tree costs, how many are left and how much land each one carries are one
   * answer, and two small numbers marooned in a wide panel read as content that failed to load.
   */
  const perTreeText = perTree
    ? project.area_per_tree_max_m2 && project.area_per_tree_max_m2 !== perTree
      ? `${formatCount(Math.round(perTree))} – ${formatArea(Math.round(project.area_per_tree_max_m2))}`
      : formatArea(Math.round(perTree))
    : null;

  const heroFigures: { value: string; label: string; prefix?: string }[] = [];
  if (leadFigure) heroFigures.push({ ...leadFigure, prefix: priceFigure?.prefix });
  // What is free to buy. While the trees are not numbered yet the stock is unknown, so the offer's own
  // declared count takes the cell under its own name instead of a false «0».
  heroFigures.push({
    value: formatCount(counted ? stock.available : declaredTrees),
    label: counted ? stockWords.available : treesLabel,
  });
  if (perTreeText) heroFigures.push({ value: perTreeText, label: perTreeLabel });

  /**
   * PRN-01, where the amount is actually read. The hero states a price two screens above the form that
   * carries the estimate note, so it carries one of its own. `projects.price_note` is the owner's wording
   * for this spot; until it is written the calculator's own note stands in — the same promise, same voice,
   * and no sentence is invented in the code.
   */
  const priceNote = priceFigure ? settingText(config, "projects.price_note") || t(config, "start.estimate_note") : "";

  /**
   * The place, said once. The hero used to print the governorate, then an address line that repeated the
   * governorate and the offer's own name, then a map link on a third line — four lines of chrome between
   * the title and the price. The place now sits on the picture of the place, with the map link beside it.
   */
  const region = [governorate, delegation].filter(Boolean).join(" · ");
  const address = project.location_description?.trim() ?? "";
  const placeLine = address && governorate && address.includes(governorate) ? address : region;
  const placeNote = placeLine === address ? "" : address;

  /** A single short line leads the hero; anything longer keeps its own section below the fold. */
  const description = page?.description?.trim() ?? "";
  const leadText = description && !description.includes("\n") && description.length <= LEAD_MAX_CHARS ? description : "";
  const aboutText = leadText ? "" : description;

  // The strip under the hero figures carries what is left, and only when it says something: an offer with
  // nothing reserved and nothing sold used to print «0 محجوزة · 0 متعاقد عليها», and its total repeated
  // the available count figure for figure. Now that the buckets are tree rows, they can actually move.
  const restStock: { label: string; value: number }[] = [];
  if (counted) {
    if (stock.total !== stock.available) restStock.push({ label: stockWords.total, value: stock.total });
    if (stock.reserved > 0) restStock.push({ label: stockWords.reserved, value: stock.reserved });
    if (stock.sold > 0) restStock.push({ label: stockWords.sold, value: stock.sold });
  }

  // Named groups instead of one flat wall: the land, the olive trees, the paperwork, and what AgriZed does
  // on this offer — a property of the offer, so it is read beside the other facts and not two screens past
  // the form. A row is written only when the offer states it, so nothing is a dash.
  const hasLand = Boolean((project.total_area_m2 && !areaInHero) || water || irrigation || page?.access_note);
  const hasTrees = Boolean(
    project.olive_variety || project.tree_age_years || project.plantation_system || project.production_status,
  );
  const groupCount = [hasLand, hasTrees, documents.length > 0, services.length > 0].filter(Boolean).length;
  const factsGrid = groupCount >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";

  /*
   * The same offer, arranged for a phone (owner, 2026-09-21, on a drawing of this screen): picture, name,
   * figures, the price of one tree with a counter, the booking button — then everything else behind four
   * tabs. <OfferPhone> owns the screen below `md`; the sections under it own `md` and up. Breakpoint `md`
   * on purpose: that is where the bottom tab bar of the phone shell appears, so one shape never carries the
   * furniture of the other.
   *
   * Nothing is recomputed here — the rows below are the figures this page already read, formatted once, and
   * every word is a setting with the fallback the page already uses. The drawing's «27 كم» has no field
   * behind it (no offer states a distance, and from where is a decision, not a value), so the place line is
   * what the offer actually publishes.
   */
  const unitTree = t(config, "offers.unit_tree");

  /**
   * The four facts the phone screen wears as one bar: how many trees are free, how much land each carries,
   * how they are planted and how big the ground is. Label and value are separate here because the bar prints
   * both — the pill row below could only ever print the value, which is why «49 م²» and «2.45 هـ» used to sit
   * side by side with nothing saying which was which. A fact the offer does not publish is left out; the bar
   * draws whatever it is handed, and falls back to the pills when it is handed nothing.
   */
  const phoneHeadline: OfferPhoneFact[] = [
    {
      label: counted ? t(config, "offers.stock_available_label") : unitTree,
      value: formatCount(counted ? stock.available : declaredTrees),
    },
    ...(perTreeText
      ? [{ label: t(config, "offers.unit_per_tree"), value: perTreeText }]
      : []),
    ...(plantation ? [{ label: t(config, "offers.label_plantation"), value: plantation }] : []),
    ...(project.total_area_m2 ? [{ label: areaLabel, value: formatArea(project.total_area_m2) }] : []),
  ];
  // Each pill is one sentence with its figure in it, so a language can put the number where it belongs and
  // say «1 olivier» but «5 oliviers».
  const phoneFigures = [
    t(config, "ui.offer.figure_trees", { count: counted ? stock.available : declaredTrees }),
    perTreeText ? t(config, "ui.offer.figure_area_per_tree", { area: perTreeText }) : null,
    project.tree_age_years ? t(config, "ui.offer.figure_tree_age", { years: project.tree_age_years }) : null,
  ].filter((figure): figure is string => Boolean(figure));

  /** The two words that describe the grove itself, as the drawing wears them: the variety, and whether it bears. */
  const phoneTags: { label: string; tone: "leaf" | "gold" }[] = [];
  if (project.olive_variety) phoneTags.push({ label: project.olive_variety, tone: "leaf" });
  if (production) phoneTags.push({ label: production, tone: "gold" });

  const landRows: OfferPhoneFact[] = [];
  if (project.total_area_m2) landRows.push({ label: areaLabel, value: formatArea(project.total_area_m2) });
  if (water) landRows.push({ label: t(config, "ui.offer.fact_water"), value: water });
  if (irrigation) landRows.push({ label: t(config, "ui.offer.fact_irrigation"), value: irrigation });

  const treeAge = project.tree_age_years ? t(config, "ui.offer.tree_age_value", { years: project.tree_age_years }) : null;
  const treeRows: OfferPhoneFact[] = [];
  if (project.olive_variety) treeRows.push({ label: t(config, "ui.offer.fact_variety"), value: project.olive_variety });
  if (treeAge) treeRows.push({ label: t(config, "ui.offer.fact_tree_age"), value: treeAge });
  if (plantation) treeRows.push({ label: t(config, "ui.offer.fact_plantation_system"), value: plantation });
  if (production) treeRows.push({ label: t(config, "ui.offer.fact_production_status"), value: production });
  // What is left of the offer's stock belongs on the phone too — it is the one figure that moves.
  const stockRows: OfferPhoneFact[] = counted
    ? restStock.map((cell) => ({ label: cell.label, value: formatCount(cell.value) }))
    : [];

  const phoneFacts = [
    landRows.length > 0
      ? { title: t(config, "projects.facts_land_title"), rows: landRows }
      : null,
    treeRows.length > 0
      ? { title: t(config, "projects.facts_trees_title"), rows: treeRows }
      : null,
    stockRows.length > 0 ? { title: offersTitle(config), rows: stockRows } : null,
  ].filter((group): group is { title: string; rows: OfferPhoneFact[] } => group !== null);

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <OfferPhone
        projectId={project.id}
        name={project.name}
        backHref="/projects"
        cover={
          /* 2:1, not the catalogue's 4:3. On a 375px screen 4:3 is 281px of picture — it pushed the price,
             the counter and the booking button past the fold, and the drawing puts all three above it. The
             band the drawing shows is almost exactly half its own width. */
          <RemotePhoto
            url={cover?.url ?? project.cover_url}
            alt={cover?.alt ?? project.cover_alt_ar}
            seed={project.id}
            sizes="(min-width: 768px) 0px, 100vw"
            className="aspect-[2/1] rounded-none"
          />
        }
        slides={(pictures.length > 0 ? pictures : []).map((picture, index) => (
          <RemotePhoto
            key={picture.url ?? index}
            url={picture.url}
            alt={picture.alt}
            seed={project.id}
            sizes="(min-width: 768px) 0px, 100vw"
            className="aspect-[2/1] rounded-none"
          />
        ))}
        place={placeLine}
        placeNote={placeNote}
        mapHref={mapHref}
        status={project.status !== "published" ? { label: statusLabel, toneClass: projectStatusTone(project.status) } : null}
        headline={phoneHeadline}
        figures={phoneFigures}
        tags={phoneTags}
        // The offer's own quote for the basket the counter opens on; the counter re-asks the database for
        // every other count. While prices are closed to this visitor both are null and the screen says so.
        price={{
          perTree:
            offerQuote?.pricing === "ok"
              ? offerQuote.price_per_tree_millimes
              : project.offered
                ? project.min_price_per_tree_millimes
                : null,
          total: offerQuote?.pricing === "ok" ? offerQuote.total_price_millimes : null,
        }}
        trees={{ opening: openingTrees, min: minTrees, max: Math.max(sellableTrees, openingTrees) }}
        description={description}
        facts={phoneFacts}
        photos={gallery.map((picture) => ({
          id: picture.id,
          url: picture.url,
          caption: picture.caption,
          image: (
            <RemotePhoto
              url={picture.url}
              alt={picture.alt}
              seed={picture.id}
              sizes="(min-width: 768px) 0px, 100vw"
              className="aspect-4/3"
            />
          ),
        }))}
        videoUrl={page?.video_url ?? null}
        documents={documents}
        services={services}
        accessNote={page?.access_note ?? ""}
        formHref={formOpen ? `/projects/${encodeURIComponent(code)}/interest` : null}
        copy={{
          back: offersTitle(config),
          share: t(config, "offers.share_label"),
          shareCopied: t(config, "offers.share_copied"),
          perTreeSuffix: t(config, "offers.price_per_tree_suffix"),
          total: t(config, "start.row_total_price"),
          // The floating control and the page it opens say the same thing (owner, 2026-09-22).
          book: t(config, "offers.submit_label"),
          priceNote,
          pricePending: t(config, "projects.price_pending"),
          tabInfo: t(config, "offers.tab_info"),
          tabPhotos: t(config, "offers.tab_photos"),
          tabLocation: t(config, "offers.tab_location"),
          tabDocuments: t(config, "offers.tab_documents"),
          about: t(config, "projects.about_title"),
          documentsText: t(config, "projects.documents_text"),
          servicesTitle: t(config, "projects.services_title"),
          servicesText: t(config, "projects.services_text"),
          videoTitle,
          videoLink,
          mapCta: t(config, "projects.location_cta"),
          accessTitle: t(config, "ui.offer.fact_access"),
        }}
      />

      {/* 1 · One object, not three adjacent blocks: the name, the figures it explains, and the picture
          bound to them. On a phone that is the order of the markup, so no fact waits behind a photo;
          from lg the picture shares the top and the bottom of the text column beside it. */}
      <section className="mx-auto hidden max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pt-10 md:block">
        <Link href="/projects" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          {/* «→» points back on an RTL page; mirrored where the page reads left to right. */}
          <span aria-hidden="true" className="inline-block ltr:-scale-x-100">
            →
          </span>{" "}
          {offersTitle(config)}
        </Link>

        <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="flex flex-col">
            <header>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-display font-bold text-forest text-balance">{project.name}</h1>
                {project.status !== "published" ? (
                  <StatusPill toneClass={projectStatusTone(project.status)}>{statusLabel}</StatusPill>
                ) : null}
              </div>
              {leadText ? <p className="mt-3 max-w-prose leading-7 text-ink/80">{leadText}</p> : null}
            </header>

            {/* 2 · The figures he came for, tight under the title and nothing between them: what one tree
                costs, how many are left, and how much land each one carries. Read off what the database
                published — nothing is computed here. They sit at the reading edge instead of being
                stretched across a two-cell grid, and the panel stops at the width they need instead of
                running the width of the page: at 768px two small numbers used to be marooned in a box
                that was 66 % blank, which does not read as calm, it reads as content that failed to
                load. */}
            <div className="panel mt-5 p-5 sm:max-w-md sm:p-6">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
                {heroFigures.map((figure) => (
                  <Figure key={figure.label} value={figure.value} label={figure.label} prefix={figure.prefix} />
                ))}
              </div>

              {restStock.length > 0 || project.code ? (
                <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line pt-4">
                  {restStock.map((cell) => (
                    <StockCell key={cell.label} label={cell.label} value={cell.value} />
                  ))}
                  {/* The reference code is what someone quotes on the phone, not what they arrived for:
                      it used to be the first thing on the page, above the offer's own name. */}
                  <span dir="ltr" className="pill pill-line">
                    {project.code}
                  </span>
                </div>
              ) : null}

              {/* PRN-01: an amount never appears without the note that it is an estimate. */}
              {priceNote ? <p className="mt-4 text-caption leading-6 text-muted">{priceNote}</p> : null}
            </div>
          </div>

          {/* 3 · The cover, built to survive whatever was uploaded. One ratio — the catalogue card's, so
              the same image is not cropped two different ways on two screens — a forest scrim across the
              whole frame, and the offer's own place set on it. A photograph of a grove reads as a grove;
              a collage of somebody else's figures reads as texture behind AgriZed's words. */}
          <figure className="relative overflow-hidden rounded-3xl lg:min-h-[20rem]">
            <RemotePhoto
              url={cover?.url ?? project.cover_url}
              alt={cover?.alt ?? project.cover_alt_ar}
              seed={project.id}
              sizes="(min-width: 1024px) 34rem, 100vw"
              className="aspect-16/9 lg:absolute lg:inset-0 lg:aspect-auto"
            />
            <div
              aria-hidden="true"
              // Deep enough at the TOP as well, which is where an arbitrary upload puts its own headline:
              // the scrim of the catalogue card fades to transparent and lets a collage's figures through.
              className="absolute inset-0 bg-linear-to-t from-forest-700/90 via-forest-700/60 to-forest-700/35"
            />
            <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 p-cozy text-paper sm:p-roomy">
              {placeLine ? <span className="font-display text-2xl font-bold leading-tight text-balance">{placeLine}</span> : null}
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-paper/90 underline underline-offset-4"
                >
                  {t(config, "projects.location_cta")} <span aria-hidden="true">↗</span>
                </a>
              ) : null}
              {placeNote ? <span className="w-full text-sm leading-6 text-paper/85">{placeNote}</span> : null}
            </figcaption>
          </figure>
        </div>
      </section>

      {aboutText || gallery.length > 0 || page?.video_url ? (
        <section className="mx-auto hidden max-w-6xl space-y-10 px-4 pt-10 sm:px-6 md:block">
          {aboutText ? (
            <div className="max-w-3xl">
              <h2 className="section-title">{t(config, "projects.about_title")}</h2>
              <p className="mt-3 whitespace-pre-line leading-8 text-ink/80">{aboutText}</p>
            </div>
          ) : null}

          {/* A gallery of one is not a gallery: in a three-column grid a single picture took the first
              third and left two thirds of blank page beside it, which reads as two images that failed to
              load. Below two pictures it is one framed image at a readable width. */}
          {gallery.length > 1 ? (
            <ProjectGallery pictures={gallery} title={galleryTitle} />
          ) : gallery.length === 1 ? (
            <div>
              <h2 className="section-title">{galleryTitle}</h2>
              <figure className="mt-5 max-w-2xl">
                <a href={gallery[0].url} target="_blank" rel="noopener noreferrer" className="block">
                  <RemotePhoto
                    url={gallery[0].url}
                    alt={gallery[0].alt}
                    seed={gallery[0].id}
                    sizes="(min-width: 640px) 42rem, 100vw"
                    className="aspect-16/9 rounded-2xl"
                  />
                </a>
                {gallery[0].caption ? (
                  <figcaption className="mt-1.5 text-sm leading-6 text-muted">{gallery[0].caption}</figcaption>
                ) : null}
              </figure>
            </div>
          ) : null}

          {page?.video_url ? (
            <div className="max-w-3xl">
              <h2 className="section-title">{videoTitle}</h2>
              <div className="mt-4">
                <ProjectVideo url={page.video_url} title={`${videoTitle} · ${project.name}`} linkLabel={videoLink} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 4 · The facts that decide it, in groups — dense on purpose, against the wide sections around
          them. Each group wears a head a step above its own values: title and value used to be the same
          size, the same weight and the same face, so a card of facts had no head at all. */}
      {groupCount > 0 ? (
        <section className="mx-auto hidden max-w-6xl px-4 py-9 sm:px-6 md:block">
          <div className={`grid gap-5 ${factsGrid}`}>
            {hasLand ? (
              <FactGroup title={t(config, "projects.facts_land_title")}>
                <DataList>
                  {project.total_area_m2 && !areaInHero ? (
                    <DataRow label={areaLabel}>{formatArea(project.total_area_m2)}</DataRow>
                  ) : null}
                  {water ? (
                    <DataRow label={t(config, "ui.offer.fact_water")} numeric={false}>
                      {water}
                    </DataRow>
                  ) : null}
                  {irrigation ? (
                    <DataRow label={t(config, "ui.offer.fact_irrigation")} numeric={false}>
                      {irrigation}
                    </DataRow>
                  ) : null}
                  {page?.access_note ? (
                    <DataRow label={t(config, "ui.offer.fact_access")} layout="stacked" numeric={false} className="py-2.5">
                      {page.access_note}
                    </DataRow>
                  ) : null}
                </DataList>
              </FactGroup>
            ) : null}

            {hasTrees ? (
              <FactGroup title={t(config, "projects.facts_trees_title")}>
                <DataList>
                  {project.olive_variety ? (
                    <DataRow label={t(config, "ui.offer.fact_variety")} numeric={false}>
                      {project.olive_variety}
                    </DataRow>
                  ) : null}
                  {treeAge ? <DataRow label={t(config, "ui.offer.fact_tree_age")}>{treeAge}</DataRow> : null}
                  {plantation ? (
                    <DataRow label={t(config, "ui.offer.fact_plantation_system")} numeric={false}>
                      {plantation}
                    </DataRow>
                  ) : null}
                  {production ? (
                    <DataRow label={t(config, "ui.offer.fact_production_status")} numeric={false}>
                      {production}
                    </DataRow>
                  ) : null}
                </DataList>
              </FactGroup>
            ) : null}

            {documents.length > 0 ? (
              <FactGroup title={t(config, "projects.documents_title")}>
                <ul className="flex flex-wrap gap-2">
                  {documents.map((label) => (
                    <li key={label} className="pill pill-line">
                      {label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-6 text-muted">{t(config, "projects.documents_text")}</p>
              </FactGroup>
            ) : null}

            {/* What AgriZed does on this offer is a fact of the offer. It used to be read last, under the
                form, by someone who had either already filled it in or already left. */}
            {services.length > 0 ? (
              <FactGroup title={t(config, "projects.services_title")}>
                <ul className="flex flex-wrap gap-2">
                  {services.map((label) => (
                    <li key={label} className="pill bg-leaf-soft text-sm text-forest">
                      {label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-6 text-muted">{t(config, "projects.services_text")}</p>
              </FactGroup>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 5 · «in the offers it's a separate form, not direct to the form of the other thing» (owner,
          2026-09-18): this offer's own form, with its own trees and its own price. It is the next thing
          after the facts — the two buttons that used to stand 144px above it, one of them repeating its
          title word for word, are gone.

          It is also where the phone's «إحجز الآن» lands, so the section carries the anchor and enough
          scroll margin to clear the header it scrolls under. */}
      {/* THE FORM IS A DOOR NOW, NOT A SECTION (owner, 2026-09-22). It used to end this page: eleven
          fields, a payment question with branches and a figures panel that re-quotes on every answer, under
          everything the offer publishes. A reader who came to read scrolled past a form they had not asked
          for; a reader who came to book scrolled past the whole offer to reach it. It lives at
          /projects/<code>/interest now, and this is the way in. */}
      {formOpen ? (
        <section className="mx-auto hidden max-w-6xl px-4 pb-12 sm:px-6 md:block">
          <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className={CARD_TITLE}>{t(config, "offers.form_title")}</h2>
              <p className="mt-2 leading-7 text-muted">{t(config, "offers.form_intro")}</p>
            </div>
            <Link
              href={`/projects/${encodeURIComponent(code)}/interest`}
              className="btn btn-primary shrink-0 gap-2 sm:min-w-56"
            >
              {t(config, "offers.submit_label")}
              <span aria-hidden="true" className="inline-block ltr:-scale-x-100">
                ←
              </span>
            </Link>
          </div>
        </section>
      ) : null}

      {/* The «القطع في هذا المشروع» block stood here: a plan of coloured tiles and a grid of parcel cards,
          both over rows of `public.parcels`. That table has never held a row, so neither has ever rendered
          against live data, and the owner retired the layer outright («remove the pieces thing»). What a
          visitor needs in its place — how many trees, how many free — is the panel in the hero above, and
          `public_offer_stock` returns counts, not tree rows, so there is no per-tree grid to draw.

          What follows is what an offer with no form still owes the reader: how paying works, and the note
          that travels with every figure. While the form is open it carries both itself. */}
      {!formOpen ? (
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          {selling && paymentText ? (
            <InfoCard title={t(config, "projects.payment_title")}>
              <p>{paymentText}</p>
            </InfoCard>
          ) : null}
          <LegalNotes config={config} />
        </section>
      ) : null}
    </>
  );
}

/**
 * The offer's starting price, or null while prices are closed to this visitor (PRJ-03). Per tree first,
 * because the tree is the unit; an offer priced whole falls back to its cash price. Nothing is computed:
 * both amounts are integer millimes the database published, formatted once.
 */
function offerPrice(
  project: { offered: boolean; min_price_per_tree_millimes: number | null; min_cash_price_millimes: number | null },
  fmt: SiteFormat,
  words: { prefix: string; perTree: string; cash: string },
): { value: string; label: string; prefix: string } | null {
  if (!project.offered) return null;
  const { prefix } = words;
  if (project.min_price_per_tree_millimes) {
    return { value: fmt.formatMillimes(project.min_price_per_tree_millimes), label: words.perTree, prefix };
  }
  if (project.min_cash_price_millimes) {
    return { value: fmt.formatMillimes(project.min_cash_price_millimes), label: words.cash, prefix };
  }
  return null;
}

/**
 * A hero number: the figure at --text-figure and what it counts small underneath, never the other way
 * round. «ابتداءً من» takes a line of its own above the amount — inline it stole the width of a phone
 * cell and broke «4,491 د.ت» in two. The cells are bottom-aligned, so a figure with a prefix and one
 * without still sit on the same line.
 */
function Figure({ value, label, prefix }: { value: string; label: string; prefix?: string }) {
  return (
    <div className="stat">
      {prefix ? <p className="stat-label">{prefix}</p> : null}
      <p className="stat-figure">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}


/**
 * One named group of facts: the land, the olive trees, the paperwork, the services.
 *
 * The head is written here rather than taken from <SectionHeader level={3}>, which types a level-3 title
 * at 16px in the body font — the same size, weight and face as the values under it, so the card read as a
 * column of equal-weight fragments with no head at all. One colour and one size step separate them.
 * (The shared component is used by the Back Office too, so it is not changed from here.)
 */
function FactGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card p-5 sm:p-6">
      <h2 className={CARD_TITLE}>{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** «متوفّر · بئر عميقة», or null when the team stated nothing. The two state words are ui.offer.water_*. */
function waterText(config: PublicConfig, available: boolean | null, note: string | null): string | null {
  const state =
    available === true
      ? t(config, "ui.offer.water_available")
      : available === false
        ? t(config, "ui.offer.water_unavailable")
        : null;
  return [state, note].filter(Boolean).join(" · ") || null;
}

/** Names of the active list items a project picked, in the list's own order and the visitor's language. */
function chosenLabels(config: PublicConfig, listKey: string, ids: string[] | undefined): string[] {
  const chosen = new Set(ids ?? []);
  return optionsFor(config, listKey)
    .filter((option) => chosen.has(option.id))
    .map((option) => option.label);
}

/**
 * The planting system in the visitor's language: the word of the Back Office list `plantation_system`, whose
 * codes are the ones a project stores (traditional, intensive, other). A code the list no longer offers is
 * printed as stored rather than hidden.
 */
function plantationLabel(config: PublicConfig, code: string): string {
  return optionsFor(config, "plantation_system").find((option) => option.code === code)?.label ?? code;
}

function InfoCard({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <div id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <h2 className={CARD_TITLE}>{title}</h2>
      <div className="mt-3 leading-7 text-ink/80">{children}</div>
    </div>
  );
}
