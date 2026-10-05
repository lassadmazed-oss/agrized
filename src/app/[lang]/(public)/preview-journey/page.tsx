import type { Metadata } from "next";
import Link from "next/link";

import { JourneyDemo } from "@/components/site/journey/journey-demo";
import { ExampleStory, HowItWorks, TrustGrid } from "@/components/site/journey/journey-sections";
import { getOfferStocks } from "@/components/site/offers";
import { RealOffers } from "@/components/site/journey/real-offers";
import { flagState, formatFor, getPublicConfig } from "@/lib/config";
import { getPublicProjects, type PublicProject } from "@/lib/public-projects";

/**
 * THE PROTOTYPE THE OWNER ASKED FOR BEFORE THE FINAL IMPLEMENTATION (brief, closing line: «قبل implementation
 * النهائي، اعمل Prototype / Preview للـ sections الجديدة»).
 *
 * It is a page of its own and NOT the home page. Nothing links to it, it is `noindex`, and it is not in the
 * sitemap — so the live home page is untouched while these sections are being judged. When the owner settles
 * the shape and the words, the sections move into src/app/[lang]/(public)/page.tsx and this route is deleted.
 *
 * WHAT IS DELIBERATELY NOT DONE YET, and is not an oversight:
 *   · The copy is Arabic and lives in a module, not in `settings`. See components/site/journey/copy.ts for
 *     why; it moves to ui.journey.* with its four translation drafts in the same change that ships it.
 *   · The five languages therefore come with that change too. This page renders its own words in any locale.
 *
 * WHAT IS REAL ALREADY: the offers section below reads the live catalogue through the same cached anon read
 * the home page and /projects make — the same three offers, the same photographs, the same stock. The brief
 * asked for real offers to be unmistakably real, and the surest way to get that right in a prototype is for
 * them to actually be real.
 */

export const revalidate = 60;

export const metadata: Metadata = {
  title: "معاينة · رحلة الحريف",
  // A prototype must not turn up in a search result beside the real pages.
  robots: { index: false, follow: false },
};

async function liveOffers(): Promise<PublicProject[]> {
  try {
    const projects = await getPublicProjects("anon");
    return projects.filter((project) => project.offered && (project.tree_count ?? 0) > 0);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export default async function JourneyPreviewPage() {
  const config = await getPublicConfig();
  const fmt = formatFor(config);
  const offersOpen = flagState(config, "projects") === "public";
  const offers = offersOpen ? await liveOffers() : [];
  const pricingOpen = flagState(config, "pricing") === "public";
  // The same cached anon read the catalogue makes; three ids, and nothing here the site was not asking for.
  const stockOf = await getOfferStocks(offers.slice(0, 3).map((offer) => offer.id), "anon");

  const place = (id: number) => config.governorates.find((row) => row.id === id)?.name ?? "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* The only thing on this page that will not ship: a note saying what it is, so nobody who stumbles on
          the address mistakes a prototype for the site. */}
      <div className="card-estimate rounded-2xl p-3 sm:p-4">
        <p className="text-[0.6875rem] font-bold text-gold">معاينة — موش الصفحة الرسمية</p>
        <p className="mt-1 text-[0.8125rem] leading-6 text-muted">
          هاذي الأقسام الجديدة وحدهم، باش تشوفهم قبل ما نركّبهم في الصفحة الرئيسية. الصفحة الرئيسية ما تبدّلتش.
          النصوص عربية برك في المعاينة؛ الخمس لغات تجي مع التركيب.
        </p>
        <Link href="/" className="mt-2 inline-block text-[0.75rem] font-semibold text-forest underline underline-offset-4">
          الصفحة الرئيسية الحالية
        </Link>
      </div>

      {/* 1 · the journey, played inside a phone */}
      <JourneyDemo offersHref="/projects" interestHref="/register" />

      {/* 2 · the whole model in under ten seconds */}
      <HowItWorks />

      {/* 3 · what exists today, and it is unmistakably real */}
      <RealOffers offers={offers} stockOf={stockOf} place={place} fmt={fmt} pricingOpen={pricingOpen} />

      {/* 4 · answered before anybody has to ask */}
      <TrustGrid />

      {/* 5 · one person, all the way through */}
      <ExampleStory interestHref="/register" />
    </div>
  );
}
