
import { ClosingCta } from "@/components/site/landing/closing-cta";
import { CounterBand } from "@/components/site/landing/counter-band";
import { Faq } from "@/components/site/landing/faq";
import { HERO_SLOTS, rowText } from "@/components/site/landing/hero";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { PhotoSlideshow } from "@/components/site/landing/photo-slideshow";
import { ServicesMap } from "@/components/site/landing/services-map";
import { InstallApp } from "@/components/site/install-app";
import { journeyCopy } from "@/components/site/journey/copy";
import { JourneyDemo } from "@/components/site/journey/journey-demo";
import { ExampleStory, HowItWorks, TrustGrid } from "@/components/site/journey/journey-sections";
import { RealOffers } from "@/components/site/journey/real-offers";
import { getOfferStocks } from "@/components/site/offers";
import { HomePhone, type HomePhoneOffer } from "@/components/site/mobile/home-phone";
import { QuoteStrip, type Quote } from "@/components/site/mobile/quote-strip";
import { type AppStat } from "@/components/site/mobile/app-stats";
import { areaPerTree, offersTitle, offerTreePrice } from "@/components/site/offers";
import { estimateLabel } from "@/components/site/site-header";
import { RemotePhoto } from "@/components/site/site-photo";
import { coverSlots, flagState, formatFor, getPublicConfig, settingJson, t } from "@/lib/config";
import { getMillionProgress } from "@/lib/million";
import { projectHref } from "@/lib/public-hrefs";
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
  const fmt = formatFor(config);
  const progress = flagState(config, "public_statistics") === "public" ? await getMillionProgress() : null;

  const interestOpen = flagState(config, "interest_form") === "public";
  // Report v3 §17: the offers door opens only once the module is public, so it never leads to a «قريباً» page.
  const offersOpen = flagState(config, "projects") === "public";
  const offers = offersOpen ? await liveOffers() : [];
  // The journey sections (0127). Every word is the owner's, already in this page's language; a list he has
  // emptied draws nothing, so each section can be switched off from the Back Office without a deploy.
  const journey = journeyCopy(config);
  // Three ids at most, through the same cached anon read the catalogue makes — no query this page was not
  // already making, and the figure is counted over rows of public.trees rather than the declared tree_count.
  const journeyOffers = offers.slice(0, 3);
  const stockOf = journeyOffers.length > 0 ? await getOfferStocks(journeyOffers.map((offer) => offer.id), "anon") : new Map();
  // An answer whose module is closed is not shown: it would name a section that is not on the page.
  const faq = settingJson<Faq[]>(config, "site.faq", []).filter(
    (item) => !item.flag || flagState(config, item.flag) === "public",
  );

  // The calculator's one word, in the hero button, on the door below it, in the bar and on the last card —
  // the rule site-header.tsx states: every control that opens /start says what /start does.
  const estimateCta = estimateLabel(config);

  const place = (governorateId: number) => config.governorates.find((g) => g.id === governorateId)?.name ?? "";
  // FLAG-02: a tree price exists for a visitor only while the pricing module is public. The flag alone
  // decides here, never moduleAccess — this page is prerendered for everyone and must not read a session.
  const pricingOpen = flagState(config, "pricing") === "public";

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
   *
   * Each word is read for its figure (`{count}`), so a language that says «1 olivier» and «512 oliviers» can.
   */
  const stat = (key: string, value: number | null, icon: AppStat["icon"], growing: boolean): AppStat => ({
    label: t(config, key, { count: value ?? 0 }),
    value,
    figure: value === null ? "" : fmt.formatCount(value),
    growing,
    icon,
  });
  const appStats: AppStat[] = [
    stat("site.tab_trees", progress?.treesRequested ?? null, "tree", true),
    stat("site.stat_people", progress?.participants ?? null, "people", true),
    // m² in the database, hectares on screen: the conversion is a unit change, not a business rule, and
    // rounding down keeps the tile from ever claiming more land than the offers hold.
    stat(
      "site.stat_hectares",
      progress?.areaOfferedM2 == null ? null : Math.floor(progress.areaOfferedM2 / 10_000),
      "land",
      true,
    ),
    // Never «+»: the country has 24 governorates and that figure does not grow.
    stat("site.stat_governorates", config.governorates.length || null, "place", false),
  ];

  /**
   * The four compact offer cards on the phone home. Same offers, same stock read and same prices the
   * catalogue already resolved above — formatted once, here, so <HomePhone> stays a drawing and makes no
   * decision about money or units.
   */
  const phoneHomeOffers: HomePhoneOffer[] = offers.slice(0, 12).map((offer) => {
    const price = offerTreePrice(offer, pricingOpen);
    const area = areaPerTree(offer);
    return {
      id: offer.id,
      href: projectHref(offer.code),
      name: offer.name,
      place: place(offer.governorate_id),
      areaPerTree: area ? fmt.formatArea(Math.round(area)) : null,
      price: price === null ? null : fmt.formatMillimes(price),
      image: (
        <RemotePhoto
          url={offer.cover_url}
          alt={offer.cover_alt_ar}
          seed={offer.id}
          // The offers are drawn on a desktop now, so the browser must be told what width to fetch for. This
          // said «0px from 768 up» — correct while the strip was hidden there, and a guarantee of a blurred
          // card the moment the grid appeared: four to a row inside a 72rem column is about a quarter of the
          // viewport, three at md is a third.
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 45vw"
          className="size-full"
        />
      ),
    };
  });

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
      <HomePhone
        // `sizes` describes the BOX, and the box stopped being the full width when the hero split into two
        // columns on 2026-10-05. Left at 100vw the browser asked for a 1920- or 3840-wide frame to fill a
        // column that is never wider than 35rem, and paid for the difference on every picture in the
        // rotation. Measured on the live eleven: 1,245 KB at 100vw against 949 KB with this, on a desktop.
        //   · from lg the page is max-w-6xl (72rem) in two columns with a 3rem gap → (1152 − 48) / 2 ≈ 35rem
        //   · below that the picture is the container, which is the viewport less the 1rem/1.5rem gutters
        hero={
          <PhotoSlideshow
            config={config}
            slots={coverSlots(config, HERO_SLOTS)}
            priority
            sizes="(min-width: 1024px) 35rem, 92vw"
          />
        }
        // The default «header» chip, not the glass one: it is on paper in the phone's top row now, where a
        // translucent control would read as a smudge rather than as a button.
        language={<LanguageSwitcher choices={config.locales} />}
        // Each quote in the page's language: a row still carrying one field per language is read through
        // rowText, the same reader the hero's slogans use.
        quotes={
          <QuoteStrip
            quotes={settingJson<Quote[]>(config, "site.quotes", []).map((quote) => ({
              ...quote,
              ar: rowText(quote, config.locale),
            }))}
          />
        }
        // «وين وصلنا؟» in full. CounterBand's own docstring asked for exactly this line; the section was
        // written for this page and then lost when the wide-screen composition was removed (owner,
        // 2026-09-24). The gate is unchanged: `progress` is null while public_statistics is closed, and then
        // HomePhone falls back to the one-line bar it already drew.
        progressBand={progress ? <CounterBand config={config} progress={progress} /> : null}
        // «إنت تستثمر، وإحنا نتلهاو» — the services are option_items, the places are the governorates, and the
        // ones holding a live offer today are marked from the offers this page already read.
        services={
          <ServicesMap
            config={config}
            offerPlaces={[...new Set(offers.map((offer) => place(offer.governorate_id)).filter(Boolean))]}
          />
        }
        // «حطّ AgriZed في تلفونك». It renders null unless the browser has offered to install the site, which
        // on today's browsers means an Android visitor who has not installed it yet (owner, 2026-10-03).
        install={
          <InstallApp
            title={t(config, "ui.install.title")}
            note={t(config, "ui.install.note")}
            cta={t(config, "ui.install.cta")}
          />
        }
        // 2 · «كيفاش تخدم AgriZed؟» — the journey played inside a phone, then the whole model in seven words.
        journey={
          <>
            <JourneyDemo
              scenes={journey.scenes}
              copy={journey.demo}
              locale={config.locale}
              offersHref={offersOpen ? "/projects" : "/start"}
              interestHref="/register"
            />
            <HowItWorks title={journey.howTitle} steps={journey.steps} />
          </>
        }
        // 3 · «شنوّة موجود توّا؟» — the real offers, in cards that cannot be read as a simulation.
        offersSection={
          journeyOffers.length > 0 ? (
            <RealOffers
              offers={journeyOffers}
              stockOf={stockOf}
              place={place}
              fmt={fmt}
              copy={journey.offers}
              locale={config.locale}
              pricingOpen={flagState(config, "pricing") === "public"}
            />
          ) : null
        }
        // 4 and 5 · «كيفاش نوثّق؟» then «كيفاش نبدا؟» — answered before the counter and the questions.
        trust={<TrustGrid title={journey.trustTitle} lead={journey.trustLead} items={journey.trust} />}
        example={<ExampleStory copy={journey.exampleCopy} steps={journey.example} interestHref="/register" />}
        faq={faq.length > 0 ? <Faq config={config} items={faq} /> : null}
        closing={interestOpen ? <ClosingCta config={config} ctaLabel={estimateCta} /> : null}
        copy={{
          badge: t(config, "site.app_greeting_note"),
          line: t(config, "site.app_hero_line"),
          // Printed only from lg (see HomePhone's `copy.lead`). It is the sentence this page already owned
          // and stopped showing when the wide composition was removed — not a new one written for a layout.
          lead: t(config, "site.home_subheadline"),
          exploreCta: t(config, "site.app_hero_cta"),
          guideCta: t(config, "site.app_guide_cta"),
          offersTitle: offersTitle(config),
          all: t(config, "offers.filter_all"),
          from: t(config, "start.from_prefix"),
          progressTitle: t(config, "million.title"),
        }}
        stats={appStats}
        offers={phoneHomeOffers}
        guideHref="/start"
        offersHref={offersOpen ? "/projects" : "/start"}
        progressNote={
          progress?.treesRequested != null ? t(config, "ui.home.progress_trees", { count: progress.treesRequested }) : null
        }
        progressPercent={
          progress?.treesRequested != null && progress.goal
            ? Math.round((progress.treesRequested / progress.goal) * 100)
            : null
        }
      />

      {/* THE WIDE SCREEN'S SECOND PAGE IS GONE (owner, 2026-09-23: make the desktop match the phone).
          What stood here was a whole other home page for `md` and up — its own hero and stats slab, the two
          cards, the trust line, the offers grid, the counter band, the tree tiers, the four steps, the
          spacing explainer, the services map, the landowner panel and the questions — about seven thousand
          pixels of it, hidden below `md` and hiding the phone screen above it.

          Two compositions meant every change had to be made twice and read as two different products. There
          is one now: <HomePhone> above, rendered at every width. It is not the phone squashed onto a desktop
          either — the component grows its own grids and type from `md`, so the width is used rather than
          left blank beside a column.

          WHAT THAT COST, named because it is a real loss and not a tidy-up: «كيفاش تخدم AgriZed», «الزيتونة
          مع مساحتها», «إنت تستثمر وإحنا نتلهاو», the twenty-four regions and the landowner intake no longer
          appear on the home page at any width. The settings behind every one of them are untouched, and
          /start, /projects and /land still answer for the same ground, so nothing was deleted from the
          product — only from this page. */}

      {/* The closing band that used to sit here is gone. It printed the wordmark, `site.closing_title` and
          `site.vision_text` over `home.closing`, about 140px above a footer that printed the wordmark and
          the French tagline again — the duplication the file's own comment already complained about
          (owner, 2026-09-18: remove what repeats). The footer absorbed it: it is the dark photographic band
          now, and it carries `site.closing_title` in its end column. `home.closing` moved to the card
          above, so nothing lost a picture and nothing prints twice. */}
    </>
  );
}
