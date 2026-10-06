import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VirtualTour, type TourScene } from "@/components/site/abroad/virtual-tour";
import { ComingSoon } from "@/components/site/module-gate";
import { areaPerTree, getOfferStock, offersTitle, stockCounted, stockLabels } from "@/components/site/offers";
import { ProjectVideo, videoEmbedUrl } from "@/components/site/project-video";
import { RemotePhoto } from "@/components/site/site-photo";
import { Texts } from "@/components/site/texts";
import { flagState, formatFor, getPublicConfig, optionsFor, t, type PublicConfig } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";
import { findProject, getProjectPage, getPublicProjects, publicMode } from "@/lib/public-projects";

const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,30}$/;

export async function generateMetadata({ params }: PageProps<"/[lang]/projects/[code]/visit">): Promise<Metadata> {
  const config = await getPublicConfig();
  const { code } = await params;
  const tour = t(config, "ui.tour.open");
  if (!CODE.test(code) || flagState(config, "projects") !== "public") return { title: tour };
  const project = findProject([...(await getPublicProjects("anon", config.locale).catch(() => []))], code);
  return {
    title: project ? `${tour} · ${project.name}` : tour,
    openGraph: project?.cover_url ? { images: [{ url: project.cover_url, alt: project.cover_alt_ar ?? project.name }] } : undefined,
  };
}

export const dynamic = "force-dynamic";

/** Seconds a scene stays before the next: a photograph is looked at, a scene of figures is read. */
const PHOTO_SECONDS = 6;
const WELCOME_SECONDS = 7;
const FACTS_SECONDS = 9;

/** Left-to-right isolate and its end: a run of figures that must not be reordered inside an Arabic line. */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

/**
 * «زيارة افتراضية» of one offer (0130). Nothing here is new data: the scenes are the offer's own photographs
 * and captions, the facts its page already publishes, its coordinates and its video — told one at a time,
 * full screen, the way a phone tells a story. The order is the order of arriving somewhere: the gate, a walk
 * through the pictures, the land under your feet, the trees, where exactly you are, and «عجبتك؟».
 *
 * It opens with the offers module, like the offer page itself; the module `abroad` decides only whether its
 * last scene offers the live video visit.
 */
export default async function OfferVisitPage({ params }: PageProps<"/[lang]/projects/[code]/visit">) {
  const code = decodeURIComponent((await params).code);
  if (!CODE.test(code)) notFound();

  const config = await getPublicConfig();
  const access = await moduleAccess(config, "projects");
  if (access === "closed") return <ComingSoon title={offersTitle(config)} />;

  const mode = publicMode(access);
  const [projects, page] = await Promise.all([
    getPublicProjects(mode, config.locale),
    getProjectPage(code, mode, config.locale),
  ]);
  const project = findProject(projects, code);
  if (!project) notFound();
  const { formatArea, formatCount } = formatFor(config);
  const stock = await getOfferStock(project.id, mode);
  const offerHref = `/projects/${encodeURIComponent(code)}`;

  const pictures = page?.media ?? [];
  const cover = pictures[0] ?? null;
  const photo = (url: string | null, alt: string | null, seed: string) => (
    <RemotePhoto url={url} alt={alt} seed={seed} sizes="100vw" className="size-full" />
  );
  const coverPhoto = photo(cover?.url ?? project.cover_url, cover?.alt ?? project.cover_alt_ar, project.id);
  // The facts scenes stand on a picture of the place too: the second photograph when there is one, so the
  // visit does not look at the same frame twice in a row.
  const factsPhoto = pictures[1] ? photo(pictures[1].url, pictures[1].alt, pictures[1].id) : coverPhoto;

  const governorate = config.governorates.find((g) => g.id === project.governorate_id)?.name;
  const delegation = config.delegations.find((d) => d.id === project.delegation_id)?.name;
  const place = [delegation, governorate].filter(Boolean).join(" · ");

  const scenes: TourScene[] = [
    {
      key: "welcome",
      backdrop: coverPhoto,
      seconds: WELCOME_SECONDS,
      eyebrow: place || t(config, "ui.tour.open"),
      title: t(config, "ui.tour.welcome", { name: project.name }),
      text: project.location_description?.trim() || undefined,
      clock: true,
    },
  ];

  // The walk: every other photograph, with the caption the team wrote for it.
  pictures.slice(1).forEach((picture, i, rest) => {
    scenes.push({
      key: `photo-${picture.id}`,
      backdrop: photo(picture.url, picture.alt, picture.id),
      seconds: PHOTO_SECONDS,
      // Isolated left to right, or an Arabic line turns «1 / 4» into «4 / 1».
      eyebrow: `${LRI}${formatCount(i + 1)} / ${formatCount(rest.length)}${PDI}`,
      title: picture.caption?.trim() || undefined,
    });
  });

  // The land under your feet.
  const perTree = areaPerTree(project);
  const water = waterText(config, page?.water_available ?? null, page?.water_note ?? null);
  const landRows = [
    project.total_area_m2 ? { label: t(config, "start.row_total_area"), value: formatArea(project.total_area_m2) } : null,
    perTree ? { label: t(config, "start.row_area_per_tree"), value: formatArea(Math.round(perTree)) } : null,
    water ? { label: t(config, "ui.offer.fact_water"), value: water } : null,
    project.irrigation ? { label: t(config, "ui.offer.fact_irrigation"), value: t(config, `ui.offer.irrigation_${project.irrigation}`) } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
  if (landRows.length > 0 || page?.access_note) {
    scenes.push({
      key: "land",
      backdrop: factsPhoto,
      seconds: FACTS_SECONDS,
      title: t(config, "ui.tour.land_title"),
      text: page?.access_note?.trim() || undefined,
      rows: landRows,
    });
  }

  // The trees.
  const counted = stockCounted(stock);
  const plantation = project.plantation_system
    ? optionsFor(config, "plantation_system").find((option) => option.code === project.plantation_system)?.label ??
      project.plantation_system
    : null;
  const treeRows = [
    (counted ? stock.available : project.tree_count)
      ? {
          label: counted ? stockLabels(config).available : t(config, "start.row_trees"),
          value: formatCount((counted ? stock.available : project.tree_count) ?? 0),
        }
      : null,
    project.olive_variety ? { label: t(config, "ui.offer.fact_variety"), value: project.olive_variety } : null,
    project.tree_age_years
      ? { label: t(config, "ui.offer.fact_tree_age"), value: t(config, "ui.offer.tree_age_value", { years: project.tree_age_years }) }
      : null,
    plantation ? { label: t(config, "ui.offer.fact_plantation_system"), value: plantation } : null,
    project.production_status
      ? { label: t(config, "ui.offer.fact_production_status"), value: t(config, `ui.offer.production_${project.production_status}`) }
      : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
  if (treeRows.length > 0) {
    scenes.push({
      key: "trees",
      backdrop: pictures[2] ? photo(pictures[2].url, pictures[2].alt, pictures[2].id) : factsPhoto,
      seconds: FACTS_SECONDS,
      title: t(config, "ui.tour.trees_title"),
      rows: treeRows,
    });
  }

  // Where exactly: the satellite view of the offer's own point, which the visitor can move and zoom.
  if (page && page.latitude !== null && page.longitude !== null) {
    const point = `${page.latitude},${page.longitude}`;
    scenes.push({
      key: "map",
      interactive: true,
      title: t(config, "ui.tour.map_title"),
      eyebrow: place || undefined,
      backdrop: (
        <iframe
          src={`https://maps.google.com/maps?q=${point}&t=k&z=16&output=embed`}
          title={`${t(config, "ui.tour.map_title")} · ${project.name}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 size-full border-0"
        />
      ),
      actions: [
        {
          href: `https://www.google.com/maps/search/?api=1&query=${point}`,
          label: t(config, "ui.tour.map_open"),
          tone: "light",
          external: true,
        },
      ],
    });
  }

  // The offer's own film, when it has one a page can play.
  if (page?.video_url && videoEmbedUrl(page.video_url)) {
    const videoTitle = t(config, "projects.video_title");
    scenes.push({
      key: "video",
      interactive: true,
      title: videoTitle,
      backdrop: (
        <div className="grid size-full place-items-center">
          <div className="w-full">
            <ProjectVideo url={page.video_url} title={`${videoTitle} · ${project.name}`} linkLabel={t(config, "ui.offer.video_link")} />
          </div>
        </div>
      ),
    });
  }

  // «عجبتك الضيعة؟» — the live visit for whoever is far, the offer's own form, or back to the page.
  const abroadOpen = flagState(config, "abroad") === "public";
  const selling = project.status === "published" || project.status === "internal";
  const formOpen = selling && flagState(config, "interest_form") === "public" && (project.tree_count ?? 0) > 0;
  scenes.push({
    key: "end",
    backdrop: coverPhoto,
    title: t(config, "ui.tour.end_title"),
    text: abroadOpen ? t(config, "ui.tour.end_text") : undefined,
    actions: [
      ...(abroadOpen
        ? [{ href: `/abroad?offer=${encodeURIComponent(code)}#video`, label: t(config, "ui.tour.end_live"), tone: "primary" as const }]
        : []),
      ...(formOpen
        ? [{ href: `${offerHref}/interest`, label: t(config, "offers.submit_label"), tone: abroadOpen ? ("light" as const) : ("primary" as const) }]
        : []),
      { href: offerHref, label: t(config, "ui.tour.end_back"), tone: "light" as const },
    ],
  });

  return (
    <Texts prefixes={["ui.tour."]}>
      <VirtualTour name={project.name} backHref={offerHref} scenes={scenes} />
    </Texts>
  );
}

/** «متوفّر · بئر عميقة», or null when the team stated nothing — the offer page's own reading. */
function waterText(config: PublicConfig, available: boolean | null, note: string | null): string | null {
  const state =
    available === true
      ? t(config, "ui.offer.water_available")
      : available === false
        ? t(config, "ui.offer.water_unavailable")
        : null;
  return [state, note].filter(Boolean).join(" · ") || null;
}
