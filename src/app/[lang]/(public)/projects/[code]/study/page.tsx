import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "@/components/site/link";
import { ComingSoon } from "@/components/site/module-gate";
import { getOfferStock, offersTitle, stockCounted } from "@/components/site/offers";
import { Texts } from "@/components/site/texts";
import { getPublicConfig, settingInt, settingJson, t } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";
import { findProject, getProjectQuote, getPublicProjects, publicMode } from "@/lib/public-projects";

import { quoteStudy } from "./actions";
import { StudyForm } from "./study-form";

const CODE = /^[A-Za-z0-9-]{2,40}$/;

export async function generateMetadata({ params }: PageProps<"/[lang]/projects/[code]/study">): Promise<Metadata> {
  const config = await getPublicConfig();
  const code = decodeURIComponent((await params).code);
  return { title: `${t(config, "ui.study.title")} · ${code}`, robots: { index: false, follow: true } };
}

/**
 * صفحة دراسة المردودية — one offer, one visitor's assumptions, one financial study (§2, §4).
 *
 * OPEN WITHOUT AN ACCOUNT, which the owner asked for in the last paragraph of his brief: the figures are
 * what persuade somebody to look further, so nothing is held back behind a sign-in. Signing in is asked for
 * to SAVE a study, to download it under a name, or to send a request — the batch after this one.
 *
 * THE MODULE IS THE GATE. While `study` is «داخلي فقط» this page answers staff and shows «قريباً» to
 * everyone else, so the owner reads real figures on the real site before a client can. Both halves of that
 * are enforced twice: here, and inside public.public_project_study (0154), which is the only thing that
 * ever computes anything.
 *
 * `robots: noindex` — the page has no content of its own. Its text is the labels and the rest is one
 * visitor's assumptions, and a search engine indexing a hundred of those indexes nothing.
 */
export default async function StudyPage({ params }: PageProps<"/[lang]/projects/[code]/study">) {
  const code = decodeURIComponent((await params).code);
  if (!CODE.test(code)) notFound();

  const config = await getPublicConfig();
  const projectsAccess = await moduleAccess(config, "projects");
  if (projectsAccess === "closed") return <ComingSoon title={offersTitle(config)} />;
  if ((await moduleAccess(config, "study")) === "closed") {
    return <ComingSoon title={t(config, "ui.study.title")} />;
  }

  const mode = publicMode(projectsAccess);
  const project = findProject(await getPublicProjects(mode, config.locale), code);
  if (!project) notFound();

  const stock = await getOfferStock(project.id, mode);
  const declared = project.tree_count ?? 0;
  const sellable = stockCounted(stock) ? stock.available : declared;
  const minTrees = stock?.minTrees ?? settingInt(config, "study.min_trees", 1);
  const maxTrees = Math.max(minTrees, sellable > 0 ? sellable : declared || 1000);
  const opening = Math.max(minTrees, Math.min(10, maxTrees));

  // §2.7: the study offers the ways of paying THIS offer sells on. The ids are the offer's own, read from
  // the one function that prices anything — never a list this page decides.
  const quote = await getProjectQuote(project.id, mode, { trees: opening });
  const down = quote?.choices.down_percents?.[0] ?? null;
  const duration = quote?.choices.durations?.[0] ?? null;
  const plan =
    down && duration
      ? {
          downOptionId: down.id,
          downLabel: down.label_ar ?? "",
          durationOptionId: duration.id,
          durationLabel: duration.label_ar ?? "",
        }
      : null;

  // The first paint already carries figures: a page that opens empty and fills in after a round trip reads
  // as broken on a slow connection, which is most of them.
  const initial = await quoteStudy({
    projectId: project.id,
    trees: opening,
    years: 10,
    scenario: null,
    mode: "olives",
    paymentMode: "cash",
    downPercentOptionId: null,
    durationOptionId: null,
  });

  const horizons = settingJson<number[]>(config, "study.horizons", [5, 10, 15, 20]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href={`/projects/${project.code}`} className="text-sm text-muted hover:text-ink">
        {t(config, "offers.back_to_offer")}
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold text-forest">{t(config, "ui.study.title")}</h1>
      <p className="mt-1 text-sm text-muted">{project.name}</p>
      <p className="mt-2 text-sm leading-7 text-muted">{t(config, "ui.study.intro")}</p>

      <div className="mt-5">
        <Texts prefixes={["ui.study."]}>
          <StudyForm
            projectId={project.id}
            projectCode={project.code}
            initial={initial}
            horizons={horizons.filter((year) => Number.isInteger(year) && year > 0)}
            minTrees={minTrees}
            maxTrees={maxTrees}
            plan={plan}
          />
        </Texts>
      </div>
    </div>
  );
}
