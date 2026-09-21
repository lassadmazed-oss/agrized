import Link from "next/link";

import { AreaSection } from "@/components/site/landing/area-section";
import { ClosingCta } from "@/components/site/landing/closing-cta";
import { CounterBand } from "@/components/site/landing/counter-band";
import { Faq } from "@/components/site/landing/faq";
import { Hero, heroCopy, heroPromises } from "@/components/site/landing/hero";
import { HeroStats, heroStatColumns } from "@/components/site/landing/hero-stats";
import { homeOffers, OffersSection } from "@/components/site/landing/offers-section";
import { OffersTicker } from "@/components/site/landing/offers-ticker";
import { ServicesMap } from "@/components/site/landing/services-map";
import { Steps } from "@/components/site/landing/steps";
import { TreePicks } from "@/components/site/landing/tree-picks";
import { TrustStrip, trustPoints } from "@/components/site/landing/trust-strip";
import { TwinCards, twinCardsCopy } from "@/components/site/landing/twin-cards";
import { AppHero } from "@/components/site/mobile/app-hero";
import { AppStats, type AppStat } from "@/components/site/mobile/app-stats";
import { getOfferStocks } from "@/components/site/offers";
import { estimateLabel, landTitle } from "@/components/site/site-header";
import { SitePhoto } from "@/components/site/site-photo";
import { flagState, getPublicConfig, optionsFor, settingJson, settingText } from "@/lib/config";
import { getMillionProgress } from "@/lib/million";
import { getPublicProjects, type PublicProject } from "@/lib/public-projects";

/**
 * One question and its answer. `flag` is optional and names a module: the question is printed only while
 * that module is open. It exists because an answer can point at a door — «من قسم «عندك أرض أو ضيعة؟»» —
 * and a closed module takes that door off the page while the answer stays, sending the reader nowhere.
 * Nothing is written here: the owner adds `"flag": "land_offers"` to the item in `site.faq`.
 */
type Faq = { q: string; a: string; flag?: string };

// The counter moves as requests arrive, so the page is rebuilt at most once a minute (MIL-01).
export const revalidate = 60;

/**
 * The offers as a visitor sees them (owner, 2026-09-18: an offer is real stock, the calculator is not).
 *
 * How many trees of an offer are still free is counted in Postgres over rows of `public.trees`
 * (public_offer_stock, 0054), exactly as /projects counts it — it used to be read off `public.parcels`,
 * a table that has never held a row, which meant the figure was the offer's declared `tree_count`
 * relabelled «متاحة». Both reads are the cached anon ones the catalogue already makes, so this page adds
 * no query the site was not making.
 *
 * §54: this page is prerendered for everyone, so it must never read the staff session — the "internal"
 * state of the module shows nothing here, exactly as before. A failing RPC leaves the section empty
 * rather than breaking a page that is built for every visitor.
 */
async function liveOffers(): Promise<PublicProject[]> {
  try {
    const projects = await getPublicProjects("anon");
    return projects.filter((project) => project.offered && (project.tree_count ?? 0) > 0);
  } catch (error) {
    console.error(error);
    return [];
  }
}

/**
 * The landing page, rebuilt to the owner's reference drawings (2026-09-21).
 *
 * This file is now an assembly and almost nothing else: every section is a component under
 * components/site/landing, each reads its own settings, each hides itself when the owner empties the
 * setting that names it, and not one Arabic sentence is written here. What this file still owns is the
 * ORDER, the RHYTHM between the bands, and the four reads the whole page shares.
 *
 * THE RHYTHM, which is what makes the reference look composed rather than long. Cream is the page's own
 * ground; a dark band is an event, and two of them never touch:
 *
 *   hero (photograph under a paper wash) → the two doors, straddling its foot → the trust line
 *   → عروضنا            cream, dense            py-section
 *   → وين وصلنا؟        DARK, a photograph      py-band      ← the first event
 *   → قدّاش زيتونة       cream, dense            py-section   ← the breath between two dark bands
 *   → كيفاش تخدم        DARK, flat forest       py-band      ← the second
 *   → الزيتونة مع مساحتها cream, dense           py-section
 *   → الخدمات · التغطية  cream, two cards        py-section
 *   → الأسئلة · آخر نداء  cream, breathes        py-band
 *   → the footer        DARK, a photograph      py-band      ← the last
 *
 * THE FIVE PHOTOGRAPHS are spent once each, which is the constraint that decides three of the sections:
 * `home.hero` in the hero, `home.coverage` on the counter band, `home.journey` on «الزيتونة مع مساحتها»,
 * `home.closing` on the last card, `home.land` in the footer — and in the landowner section instead the day
 * that module opens, at which point the footer falls back to flat forest. The offers door in the hero shows
 * `home.coverage` a second time, which is the one repeat on the page: the counter band's copy sits under a
 * 78 % forest scrim two screens away and reads as a ground, not as a picture. A slot the owner has not
 * filled degrades to the drawn grove of `GrovePlaceholder`, never to a grey box.
 */
export default async function HomePage() {
  const config = await getPublicConfig();
  const progress = flagState(config, "public_statistics") === "public" ? await getMillionProgress() : null;

  const interestOpen = flagState(config, "interest_form") === "public";
  const landOpen = flagState(config, "land_offers") === "public";
  // Report v3 §17: the offers door opens only once the module is public, so it never leads to a «قريباً» page.
  const offersOpen = flagState(config, "projects") === "public";
  const offers = offersOpen ? await liveOffers() : [];
  // Sliced by the section that renders them, so the stock is read for exactly the offers that will be shown.
  const shownOffers = homeOffers(offers);
  // One reading of the stock per offer shown, the same count the catalogue prints. An offer whose trees
  // are not numbered yet has an UNKNOWN stock, so its card falls back to the declared count named as such
  // rather than printing a confident «0 متاحة».
  const stockOf = await getOfferStocks(
    shownOffers.map((offer) => offer.id),
    "anon",
  );

  // An answer whose module is closed is not shown: it would name a section that is not on the page.
  const faq = settingJson<Faq[]>(config, "site.faq", []).filter(
    (item) => !item.flag || flagState(config, item.flag) === "public",
  );

  // The calculator's one word, in the hero button, on the door below it, in the bar and on the last card —
  // the rule site-header.tsx states: every control that opens /start says what /start does.
  const estimateCta = estimateLabel(config);

  const place = (governorateId: number) => config.governorates.find((g) => g.id === governorateId)?.name_ar ?? "";
  // Where the live stock actually is: the door says it in place names, which are rows, not a promise.
  const offerPlaces = [...new Set(offers.map((offer) => place(offer.governorate_id)).filter(Boolean))];

  // The trust line renders nothing until the owner writes `site.trust_points`, on purpose: «عقد قانوني
  // واضح» and «متابعة وصيانة» are claims about how AgriZed operates, and a promise that cannot be deleted
  // from the Back Office is the worst thing to leave in the code of a page whose argument is «بلا وعود».
  const trust = trustPoints(config);

  /**
   * The phone's 2×2, in the mock-up's order: olive trees · investors · hectares · governorates.
   *
   * Every figure is `million_progress()`. The mock-up prints «+317,800 زيتونة», «+12,450 مستثمر» and
   * «+18,250 هكتار»; the real answers today are 512 trees asked for, 20 people and 28 hectares. A mock-up
   * invents numbers to show a shape — that is what it is for — but a page that prints them is telling a
   * stranger something untrue on the screen where they decide whether this is real, and this product answers
   * that question with «بلا وعود». So the shape is the drawing's and every figure is the database's.
   *
   * A tile whose figure the counter did not answer is dropped, not shown as a zero: with the statistics module
   * closed there is no `progress` at all and the grid does not exist.
   */
  const appStats: AppStat[] = [
    { label: settingText(config, "site.tab_trees", "زيتونة"), value: progress?.treesRequested ?? null, growing: true, icon: "tree" },
    { label: settingText(config, "site.stat_people", "مستثمر"), value: progress?.participants ?? null, growing: true, icon: "people" },
    {
      label: settingText(config, "site.stat_hectares", "هكتار"),
      // m² in the database, hectares on screen: the conversion is a unit change, not a business rule, and
      // rounding down keeps the tile from ever claiming more land than the offers hold.
      value: progress?.areaOfferedM2 == null ? null : Math.floor(progress.areaOfferedM2 / 10_000),
      growing: true,
      icon: "land",
    },
    // Never «+»: the country has 24 governorates and that figure does not grow.
    { label: settingText(config, "site.stat_governorates", "ولاية"), value: config.governorates.length || null, icon: "place" },
  ];

  // The number in the drawn stepper on the calculator card: a real Back Office option, never a typed «25».
  const sampleTreeCount = optionsFor(config, "tree_count").find((option) => option.min_number)?.min_number ?? null;

  return (
    <>
      {/* The page names itself, and the header reads it (globals.css: `.site-header`). It is how the bar
          knows to float over this page's photograph instead of sitting above it the way it does on /start
          and /projects, and how «الرئيسية» in the menu knows it is the current section — both without the
          bar reading the client router, which would cost the whole header its server rendering. */}
      <div data-page="home" hidden />

      {/* 01 · THE HERO. The photograph is not darkened any more: a paper wash covers the text side and the
          words are forest and gold ON it, which is the drawing and the exact inverse of what this page did
          before. The promises card hangs beside the headline and the live figures sit low in the picture,
          diagonally opposite the text. */}
      {/* 01a · THE PHONE'S OWN FIRST SCREEN (owner, 2026-09-21, from the AgriZed app mock-up): a greeting, one
          photographic card carrying the promise and a single door, then four figures in a 2×2. It is not the
          desktop hero squashed — that composition is a headline, two sub-lines, two buttons, a promises card and
          a four-column slab, and at 375 it is four scrolls before a visitor reaches anything they can act on.
          Below md this replaces it; from md the drawing's hero takes over unchanged. */}
      <AppHero config={config} href={offersOpen ? "/projects" : "/start"} />
      <AppStats stats={appStats} />

      {/* 01b · THE OFFERS, MOVING (owner, 2026-09-21: «add another banner under it showing our offers to see
          movement like infinite sliding»). It sits directly under the hero on every width, which is the whole
          point of it: the first thing that moves after the photograph is the real stock, named and priced.
          It carries no cover photographs — see the component for why — and it repeats no figure the section
          further down does not already show. */}
      <OffersTicker config={config} offers={offers} />

      <div className="hidden md:block">
        <Hero
          config={config}
          copy={heroCopy(config)}
          promises={heroPromises(config)}
          primaryHref="/start"
          secondaryHref={offersOpen ? "/projects" : ""}
          stats={
          /* Every figure is `million_progress()`. With the statistics module closed there is no `progress`,
             so there are no columns and the slab does not exist — the hero simply has more photograph. */
            <HeroStats
              columns={heroStatColumns(config, progress)}
              href="/#million"
              linkLabel={settingText(config, "site.progress_title", "وين وصلنا؟")}
            />
          }
        />
      </div>

      {/* 02 · THE TWO DOORS, straddling the photograph's bottom edge: the calculator, which answers with an
          example, and the offers, which are real land. They are told apart by surface as well as by colour —
          the calculator keeps the dashed estimate ground (PRN-01), the offers card carries a photograph.
          While the trust line has nothing to print, this is what keeps the cards off «عروضنا». */}
      <div className={trust.length > 0 ? "" : "pb-cozy sm:pb-section"}>
        <TwinCards
          config={config}
          copy={twinCardsCopy(config)}
          estimateHref="/start"
          offersHref="/projects"
          showOffers={offersOpen}
          place={offerPlaces[0] ?? ""}
          sampleTreeCount={sampleTreeCount}
          photoSlot="home.coverage"
        />
      </div>

      {/* 03 · The quiet line that closes the first screen. Empty today — see the report. */}
      <TrustStrip points={trust} />

      {/* 04 · The offers themselves: name, place, olive trees, the area each tree comes with, and the price
          the database computed. Never a formula, never the land price (PRJ-03). */}
      <OffersSection config={config} offers={offers} shown={shownOffers} stockOf={stockOf} />

      {/* 05 · Where the project stands, on the first dark band. Counts of real rows only, one tile per
          stage (spec v2 §6). It keeps id="million", which the bar and the footer both link to. */}
      {progress ? <CounterBand config={config} progress={progress} /> : null}

      {/* 06 · The tree question, on cream between the two dark bands; a tile opens the calculator on /start
          with that tier already chosen (MIL-01). */}
      <TreePicks config={config} />

      {/* 07 · How it works, on the second dark band. It keeps id="how". */}
      <Steps config={config} />

      {/* 08 · The unit the page sells: one olive tree with the land it comes with. The areas are the Back
          Office spacing classes — a planting class and its own area, never a tree count multiplied by one. */}
      <AreaSection config={config} />

      {/* 09 · What AgriZed does after the sale (report v3 §36), beside where it works. Two cards now, not
          two loose columns. The price of a service belongs to the contract, never to this page. */}
      <ServicesMap config={config} offerPlaces={offerPlaces} />

      {/* 10 · Landowners. Not in the reference because the module is closed, which is also why the footer
          may use this section's photograph in the meantime: when `land_offers` opens, `home.land` comes
          back here and the footer falls back to flat forest (site-footer.tsx). */}
      {landOpen ? (
        <section className="mx-auto max-w-6xl px-4 py-section sm:px-6">
          <div className="panel grid items-center gap-roomy border-gold/25 bg-gold-soft/60 p-card sm:p-roomy lg:grid-cols-[1fr_0.55fr]">
            <div>
              <h2 className="font-display text-2xl font-bold text-forest sm:text-3xl">{landTitle(config)}</h2>
              <p className="mt-tight max-w-xl leading-7 text-ink/80">{settingText(config, "site.land_section_text")}</p>
              {/* NEW KEY. This button was the last hard-coded sentence on the page: the owner could rename
                  the section and its door would keep saying something else. */}
              <Link href="/land" className="btn btn-primary mt-cozy">
                {settingText(config, "site.land_cta_label", "ابعث معلومات عقارك")}
              </Link>
            </div>
            <SitePhoto config={config} slot="home.land" sizes="(min-width: 1024px) 28vw, 100vw" />
          </div>
        </section>
      ) : null}

      {/* 11 · The objections answered, then the ask — beside each other, not one screen after the other, and
          in that order on a phone: a stranger's questions first, the ask second. The last band of the page
          before the footer, so it breathes like a story section rather than like the offers. */}
      {faq.length > 0 || interestOpen ? (
        <section className="mx-auto max-w-6xl px-4 py-section sm:px-6 lg:py-band">
          <div className="grid gap-roomy lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <Faq config={config} items={faq} />
            {interestOpen ? <ClosingCta config={config} ctaLabel={estimateCta} /> : null}
          </div>
        </section>
      ) : null}

      {/* The closing band that used to sit here is gone. It printed the wordmark, `site.closing_title` and
          `site.vision_text` over `home.closing`, about 140px above a footer that printed the wordmark and
          the French tagline again — the duplication the file's own comment already complained about
          (owner, 2026-09-18: remove what repeats). The footer absorbed it: it is the dark photographic band
          now, and it carries `site.closing_title` in its end column. `home.closing` moved to the card
          above, so nothing lost a picture and nothing prints twice. */}
    </>
  );
}
