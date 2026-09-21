import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ComingSoon, PreviewBanner } from "@/components/site/module-gate";
import {
  areaPerTree,
  getOfferStock,
  LegalNotes,
  minTreesHint,
  offersTitle,
  StockCell,
  stockCounted,
  stockLabels,
} from "@/components/site/offers";
import { ProjectGallery } from "@/components/site/project-gallery";
import { ProjectVideo } from "@/components/site/project-video";
import { RemotePhoto } from "@/components/site/site-photo";
import { DataList, DataRow, StatusPill } from "@/components/ui";
import { flagState, getPublicConfig, optionsFor, settingText, type PublicConfig } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import { IRRIGATION_LABELS } from "@/lib/land";
import { moduleAccess } from "@/lib/modules";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import { findProject, getProjectPage, getProjectQuote, getPublicProjects, publicMode } from "@/lib/public-projects";

import { OfferInterestForm, type OfferChoice } from "./offer-interest-form";
import { OfferPhone, type OfferPhoneFact } from "./offer-phone";

/**
 * The tab said «مشروع» — a word this page stopped using on 2026-09-18 and the last hard-coded one on it.
 * It now names the catalogue it belongs to, from the same setting that titles the catalogue itself, so a
 * rename in the Back Office reaches the tab too. 2026-09-19.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: offersTitle(await getPublicConfig()) };
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
export default async function ProjectPage({ params }: PageProps<"/projects/[code]">) {
  const code = decodeURIComponent((await params).code);
  if (!CODE.test(code)) notFound();

  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") {
    return <ComingSoon title={offersTitle(config)} />;
  }

  const mode = publicMode(access);
  const [projects, page] = await Promise.all([getPublicProjects(mode), getProjectPage(code, mode)]);
  const project = findProject(projects, code);
  if (!project) notFound();

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
  const governorate = config.governorates.find((g) => g.id === project.governorate_id)?.name_ar;
  const delegation = config.delegations.find((d) => d.id === project.delegation_id)?.name_ar;
  const irrigation = project.irrigation ? (IRRIGATION_LABELS as Record<string, string>)[project.irrigation] : null;

  const pictures = page?.media ?? [];
  const cover = pictures[0] ?? null;
  // The first picture is the cover in the hero; the rest belong to the gallery.
  const gallery = pictures.slice(1);
  const water = page ? waterText(page.water_available, page.water_note) : null;
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
  // The visit is asked for inside the offer's own form, so the door only exists when the form does. It used to
  // be open on its own and led to a card that pointed back at a form that was not there.
  const visitOpen = formOpen;
  const videoTitle = settingText(config, "projects.video_title", "فيديو المشروع");
  const galleryTitle = settingText(config, "projects.gallery_title", "صور المشروع");
  // Every label on this page is a key the Back Office holds, with the fallback the code already uses. The
  // four stock words are the offer keys of migration 0054 — the tree's own three states — not the
  // seven-value parcel vocabulary this page used to borrow.
  const treesLabel = settingText(config, "start.row_trees", "عدد الزيتونات");
  const stockWords = stockLabels(config);
  const fromPrefix = settingText(config, "start.from_prefix", "ابتداءً من");
  const perTreeLabel = settingText(config, "start.row_area_per_tree", "المساحة لكل زيتونة");
  const paymentText = settingText(config, "projects.payment_text");
  // The smallest basket this offer sells (projects.min_trees_per_order, else offers.min_trees_default) is
  // passed to the picker as `minTrees` — its lower bound, its opening count and the quick picks it offers
  // all follow it. The sentence below says it in words as well, because a bound the visitor cannot read is
  // a refusal waiting to happen. `submit_offer_request` is still the authority and refuses anything smaller
  // with `below_min_trees`.
  //
  // ONE sentence, one truth (owner, 2026-09-19, reading «من زيتونة وحدة إلى 8,000 زيتونة. أقلّ عدد في هذا
  // العرض: 20 زيتونة.» on TX-00215). The two settings were joined unconditionally, and `offers.trees_hint`
  // is written for an offer that sells from a single tree, so on every offer with a floor the hint said one
  // and then said twenty. The page picks the sentence that is true instead: the range sentence while it
  // carries `{min}` itself — writing «من {min} زيتونة إلى {max} زيتونة.» in the Back Office makes it say
  // both bounds at once and is the wording to prefer — otherwise the range sentence for an offer that
  // really does start at one tree, and the offer's own floor sentence for every other.
  const treesRange = settingText(config, "offers.trees_hint", "من زيتونة وحدة إلى {max} زيتونة.");
  const treesHint =
    treesRange.includes("{min}") || minTrees <= 1 ? treesRange : minTreesHint(config, minTrees) || treesRange;

  // PRJ-03: a price is a permission (public_projects() publishes none while pricing is closed to this
  // visitor), stock and area are facts. So the price cell disappears on its own and the offer's area
  // takes its place in the hero — no land price, no planting cost, no margin, no formula, ever.
  const areaLabel = settingText(config, "start.row_total_area", "المساحة الجملية");
  const priceFigure = offerPrice(project, fromPrefix, settingText(config, "start.row_price_per_tree", "سعر الزيتونة"));
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
      ? `${formatCount(perTree)} – ${formatArea(project.area_per_tree_max_m2)}`
      : formatArea(perTree)
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
  const priceNote = priceFigure ? settingText(config, "projects.price_note") || settingText(config, "start.estimate_note") : "";

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
  const description = page?.description_ar?.trim() ?? "";
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
  const unitTree = settingText(config, "offers.unit_tree", "زيتونة");
  const phoneFigures = [
    `${formatCount(counted ? stock.available : declaredTrees)} ${unitTree}`,
    perTreeText ? `${perTreeText} ${settingText(config, "offers.unit_per_tree", "للزيتونة")}` : null,
    project.tree_age_years
      ? `${formatCount(project.tree_age_years)} ${settingText(config, "offers.unit_years", "سنة")}`
      : null,
  ].filter((figure): figure is string => Boolean(figure));

  /** The two words that describe the grove itself, as the drawing wears them: the variety, and whether it bears. */
  const phoneTags: { label: string; tone: "leaf" | "gold" }[] = [];
  if (project.olive_variety) phoneTags.push({ label: project.olive_variety, tone: "leaf" });
  if (project.production_status) {
    phoneTags.push({
      label: PRODUCTION_LABELS[project.production_status] ?? project.production_status,
      tone: "gold",
    });
  }

  const landRows: OfferPhoneFact[] = [];
  if (project.total_area_m2) landRows.push({ label: areaLabel, value: formatArea(project.total_area_m2) });
  if (water) landRows.push({ label: "الماء", value: water });
  if (irrigation) landRows.push({ label: "الري", value: irrigation });

  const treeRows: OfferPhoneFact[] = [];
  if (project.olive_variety) treeRows.push({ label: "الصنف", value: project.olive_variety });
  if (project.tree_age_years) treeRows.push({ label: "عمر الأشجار", value: `${formatCount(project.tree_age_years)} سنوات` });
  if (project.plantation_system) {
    treeRows.push({
      label: "نظام الغراسة",
      value: PLANTATION_LABELS[project.plantation_system] ?? project.plantation_system,
    });
  }
  if (project.production_status) {
    treeRows.push({
      label: "حالة الإنتاج",
      value: PRODUCTION_LABELS[project.production_status] ?? project.production_status,
    });
  }
  // What is left of the offer's stock belongs on the phone too — it is the one figure that moves.
  const stockRows: OfferPhoneFact[] = counted
    ? restStock.map((cell) => ({ label: cell.label, value: formatCount(cell.value) }))
    : [];

  const phoneFacts = [
    landRows.length > 0
      ? { title: settingText(config, "projects.facts_land_title", "الأرض"), rows: landRows }
      : null,
    treeRows.length > 0
      ? { title: settingText(config, "projects.facts_trees_title", "الزيتون"), rows: treeRows }
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
            alt={cover?.alt_ar ?? project.cover_alt_ar}
            seed={project.id}
            sizes="(min-width: 768px) 0px, 100vw"
            className="aspect-[2/1] rounded-none"
          />
        }
        place={placeLine}
        placeNote={placeNote}
        mapHref={mapHref}
        status={
          project.status !== "published"
            ? { label: projectStatusLabel(project.status), toneClass: projectStatusTone(project.status) }
            : null
        }
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
          caption: picture.caption_ar,
          image: (
            <RemotePhoto
              url={picture.url}
              alt={picture.alt_ar}
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
        formHref={formOpen ? "#offer-form" : null}
        copy={{
          back: offersTitle(config),
          share: settingText(config, "offers.share_label", "شارك هذا العرض"),
          shareCopied: settingText(config, "offers.share_copied", "تنسخ الرابط"),
          perTreeSuffix: settingText(config, "offers.price_per_tree_suffix", "/ الزيتونة"),
          total: settingText(config, "start.row_total_price", "السعر الجملي للطلب"),
          plus: settingText(config, "offers.trees_plus", "زيد زيتونة"),
          minus: settingText(config, "offers.trees_minus", "نقّص زيتونة"),
          book: settingText(config, "offers.book_cta", "إحجز الآن"),
          priceNote,
          pricePending: settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً."),
          tabInfo: settingText(config, "offers.tab_info", "معلومات"),
          tabPhotos: settingText(config, "offers.tab_photos", "صور"),
          tabLocation: settingText(config, "offers.tab_location", "موقع"),
          tabDocuments: settingText(config, "offers.tab_documents", "مستندات"),
          about: settingText(config, "projects.about_title", "على المشروع"),
          documentsText: settingText(config, "projects.documents_text"),
          servicesTitle: settingText(config, "projects.services_title", "خدمات AgriZed في هذا المشروع"),
          servicesText: settingText(config, "projects.services_text"),
          videoTitle,
          mapCta: settingText(config, "projects.location_cta", "شوف الموقع على الخريطة"),
          accessTitle: "النفاذ",
        }}
      />

      {/* 1 · One object, not three adjacent blocks: the name, the figures it explains, and the picture
          bound to them. On a phone that is the order of the markup, so no fact waits behind a photo;
          from lg the picture shares the top and the bottom of the text column beside it. */}
      <section className="mx-auto hidden max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pt-10 md:block">
        <Link href="/projects" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          {`→ ${offersTitle(config)}`}
        </Link>

        <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="flex flex-col">
            <header>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-display font-bold text-forest text-balance">{project.name}</h1>
                {project.status !== "published" ? (
                  <StatusPill toneClass={projectStatusTone(project.status)}>{projectStatusLabel(project.status)}</StatusPill>
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
              alt={cover?.alt_ar ?? project.cover_alt_ar}
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
                  {settingText(config, "projects.location_cta", "شوف الموقع على الخريطة")} ↗
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
              <h2 className="section-title">{settingText(config, "projects.about_title", "على المشروع")}</h2>
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
                    alt={gallery[0].alt_ar}
                    seed={gallery[0].id}
                    sizes="(min-width: 640px) 42rem, 100vw"
                    className="aspect-16/9 rounded-2xl"
                  />
                </a>
                {gallery[0].caption_ar ? (
                  <figcaption className="mt-1.5 text-sm leading-6 text-muted">{gallery[0].caption_ar}</figcaption>
                ) : null}
              </figure>
            </div>
          ) : null}

          {page?.video_url ? (
            <div className="max-w-3xl">
              <h2 className="section-title">{videoTitle}</h2>
              <div className="mt-4">
                <ProjectVideo url={page.video_url} title={`${videoTitle} · ${project.name}`} />
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
              <FactGroup title={settingText(config, "projects.facts_land_title", "الأرض")}>
                <DataList>
                  {project.total_area_m2 && !areaInHero ? (
                    <DataRow label={areaLabel}>{formatArea(project.total_area_m2)}</DataRow>
                  ) : null}
                  {water ? (
                    <DataRow label="الماء" numeric={false}>
                      {water}
                    </DataRow>
                  ) : null}
                  {irrigation ? (
                    <DataRow label="الري" numeric={false}>
                      {irrigation}
                    </DataRow>
                  ) : null}
                  {page?.access_note ? (
                    <DataRow label="النفاذ" layout="stacked" numeric={false} className="py-2.5">
                      {page.access_note}
                    </DataRow>
                  ) : null}
                </DataList>
              </FactGroup>
            ) : null}

            {hasTrees ? (
              <FactGroup title={settingText(config, "projects.facts_trees_title", "الزيتون")}>
                <DataList>
                  {project.olive_variety ? (
                    <DataRow label="الصنف" numeric={false}>
                      {project.olive_variety}
                    </DataRow>
                  ) : null}
                  {project.tree_age_years ? (
                    <DataRow label="عمر الأشجار">{formatCount(project.tree_age_years)} سنوات</DataRow>
                  ) : null}
                  {project.plantation_system ? (
                    <DataRow label="نظام الغراسة" numeric={false}>
                      {PLANTATION_LABELS[project.plantation_system] ?? project.plantation_system}
                    </DataRow>
                  ) : null}
                  {project.production_status ? (
                    <DataRow label="حالة الإنتاج" numeric={false}>
                      {PRODUCTION_LABELS[project.production_status] ?? project.production_status}
                    </DataRow>
                  ) : null}
                </DataList>
              </FactGroup>
            ) : null}

            {documents.length > 0 ? (
              <FactGroup title={settingText(config, "projects.documents_title", "الوثائق المتوفّرة")}>
                <ul className="flex flex-wrap gap-2">
                  {documents.map((label) => (
                    <li key={label} className="pill pill-line">
                      {label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-6 text-muted">{settingText(config, "projects.documents_text")}</p>
              </FactGroup>
            ) : null}

            {/* What AgriZed does on this offer is a fact of the offer. It used to be read last, under the
                form, by someone who had either already filled it in or already left. */}
            {services.length > 0 ? (
              <FactGroup title={settingText(config, "projects.services_title", "خدمات AgriZed في هذا المشروع")}>
                <ul className="flex flex-wrap gap-2">
                  {services.map((label) => (
                    <li key={label} className="pill bg-leaf-soft text-sm text-forest">
                      {label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm leading-6 text-muted">{settingText(config, "projects.services_text")}</p>
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
      {formOpen ? (
        <section id="offer-form" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-12 sm:px-6">
          <OfferInterestForm
            projectId={project.id}
            projectName={project.name}
            maxTrees={sellableTrees}
            minTrees={minTrees}
            quote={offerQuote}
            // What THIS offer allows, and nothing else: an empty list is «this offer does not sell that way»
            // and the form then shows no instalment door at all. Plain serialisable rows — a Server Component
            // may hand data to a client module, never the other way round.
            downPercents={offerQuote?.choices.down_percents.map(planChoice) ?? []}
            durations={offerQuote?.choices.durations.map(planChoice) ?? []}
            payment={{
              title: settingText(config, "start.payment_title", "كيفاش تحب تخلّص؟"),
              hint: settingText(config, "start.payment_hint"),
              cash: settingText(config, "start.payment_cash", "بالحاضر"),
              installments: settingText(config, "start.payment_installments", "بالتقسيط"),
              downTitle: settingText(config, "start.down_percent_title", "نسبة التسبقة"),
              downHint: settingText(config, "start.down_percent_hint", "التسبقة تتحسب من السعر الجملي بالحاضر."),
              durationTitle: settingText(config, "start.row_duration", "مدة الدفع"),
              cashOnly: settingText(config, "offers.cash_only", "هذا العرض يتباع بالحاضر فقط."),
              requiredHint: settingText(config, "start.continue_hint_payment", "اختر طريقة الدفع باش تكمّل."),
              installmentsRequiredHint: settingText(
                config,
                "start.continue_hint_installments",
                "اختر نسبة التسبقة ومدة الدفع باش تكمّل.",
              ),
              planUnavailable: settingText(
                config,
                "offers.plan_unavailable",
                "هذه الخطة ماهيش متوفّرة في هذا العرض. اختر نسبة تسبقة ولا مدة أخرى.",
              ),
              // «طريقة الدفع» was a prose card two screens BELOW this question, answering something the
              // form had already asked and priced. Same setting, read where it is useful.
              note: selling ? paymentText : "",
            }}
            summary={{
              pricePerTree: settingText(config, "start.row_price_per_tree", "سعر الزيتونة"),
              areaPerTree: perTreeLabel,
              totalArea: areaLabel,
              totalPrice: settingText(config, "start.row_total_price", "السعر الجملي للطلب"),
              annualFee: settingText(config, "start.row_annual_fee", "معاليم الصيانة والتقليم في العام"),
              annualFeePerTree: settingText(config, "start.annual_fee_per_tree", "{amount} للزيتونة في العام"),
              down: settingText(config, "start.row_down", "التسبقة"),
              duration: settingText(config, "start.row_duration", "مدة الدفع"),
              totalFinanced: settingText(config, "start.row_total_financed", "السعر الجملي بالتقسيط"),
              remaining: settingText(config, "start.row_remaining", "المبلغ المتبقي"),
              monthly: settingText(config, "start.row_monthly", "القسط الشهري"),
              lastInstallment: settingText(config, "start.last_installment", "آخر قسط: {amount}"),
              installmentsCount: settingText(config, "start.installments_count", "{count} قسطاً"),
              priceUnavailable: settingText(config, "start.price_unavailable", "السعر يتحدّد قريباً."),
              durationNotPriced: settingText(
                config,
                "start.duration_not_priced",
                "التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى.",
              ),
              downCoversTotal: settingText(
                config,
                "start.down_covers_total",
                "التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر.",
              ),
            }}
            governorates={config.governorates}
            contactTimes={optionsFor(config, "contact_time")}
            title={settingText(config, "offers.form_title", "سجّل اهتمامك بهذا العرض")}
            intro={settingText(config, "offers.form_intro")}
            treesLabel={settingText(config, "offers.trees_label", "قدّاش زيتونة تحب من هذا العرض؟")}
            treesHint={treesHint}
            treesQuickPicks={settingText(config, "offers.quick_picks", "1,5,10,25,50")}
            submitLabel={settingText(config, "offers.submit_label", "سجّل اهتمامك بهذا العرض")}
            visitLabel={visitOpen ? settingText(config, "projects.visit_cta", "نحب نزور الأرض") : ""}
            visitText={settingText(config, "projects.visit_text")}
            successTitle={settingText(config, "offers.success_title", "وصلنا طلبك على هذا العرض")}
            successText={settingText(config, "offers.success_text")}
            consentText={settingText(config, "legal.consent_text")}
            estimateNote={settingText(config, "start.estimate_note")}
            // PRN-01: the note that used to hold a band of its own between the form and the page's tail
            // now rides at the foot of the figures it qualifies.
            legalNote={settingText(config, "legal.parcel_card_note")}
            pricePending={settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً.")}
          />
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
            <InfoCard title={settingText(config, "projects.payment_title", "طريقة الدفع")}>
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
  prefix: string,
  perTreeLabel: string,
): { value: string; label: string; prefix: string } | null {
  if (!project.offered) return null;
  if (project.min_price_per_tree_millimes) {
    return { value: formatMillimes(project.min_price_per_tree_millimes), label: perTreeLabel, prefix };
  }
  if (project.min_cash_price_millimes) {
    return { value: formatMillimes(project.min_cash_price_millimes), label: "السعر حاضر", prefix };
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
 * One of this offer's own payment answers, narrowed to what the form needs: the id it sends back and the word
 * it prints. The percentage and the month count stay on the server — the form never does arithmetic with them,
 * and every figure it shows is quoted again by `public_project_quote`.
 */
function planChoice(choice: { id: string; label_ar: string }): OfferChoice {
  return { id: choice.id, label_ar: choice.label_ar };
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

function InfoCard({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <div id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <h2 className={CARD_TITLE}>{title}</h2>
      <div className="mt-3 leading-7 text-ink/80">{children}</div>
    </div>
  );
}
