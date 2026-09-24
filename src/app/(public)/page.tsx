
import { ClosingCta } from "@/components/site/landing/closing-cta";
import { CounterBand } from "@/components/site/landing/counter-band";
import { Faq } from "@/components/site/landing/faq";
import { HERO_SLOTS } from "@/components/site/landing/hero";
import { PhotoSlideshow } from "@/components/site/landing/photo-slideshow";
import { ServicesMap } from "@/components/site/landing/services-map";
import { HomePhone, type HomePhoneOffer } from "@/components/site/mobile/home-phone";
import { QuoteStrip, type Quote } from "@/components/site/mobile/quote-strip";
import { type AppStat } from "@/components/site/mobile/app-stats";
import { areaPerTree, offersTitle, offerTreePrice } from "@/components/site/offers";
import { estimateLabel } from "@/components/site/site-header";
import { RemotePhoto } from "@/components/site/site-photo";
import { flagState, getPublicConfig, settingJson, settingText } from "@/lib/config";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
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
  const progress = flagState(config, "public_statistics") === "public" ? await getMillionProgress() : null;

  const interestOpen = flagState(config, "interest_form") === "public";
  // Report v3 §17: the offers door opens only once the module is public, so it never leads to a «قريباً» page.
  const offersOpen = flagState(config, "projects") === "public";
  const offers = offersOpen ? await liveOffers() : [];
  // An answer whose module is closed is not shown: it would name a section that is not on the page.
  const faq = settingJson<Faq[]>(config, "site.faq", []).filter(
    (item) => !item.flag || flagState(config, item.flag) === "public",
  );

  // The calculator's one word, in the hero button, on the door below it, in the bar and on the last card —
  // the rule site-header.tsx states: every control that opens /start says what /start does.
  const estimateCta = estimateLabel(config);

  const place = (governorateId: number) => config.governorates.find((g) => g.id === governorateId)?.name_ar ?? "";
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
      areaPerTree: area ? formatArea(Math.round(area)) : null,
      price: price === null ? null : formatMillimes(price),
      image: (
        <RemotePhoto
          url={offer.cover_url}
          alt={offer.cover_alt_ar}
          seed={offer.id}
          sizes="(min-width: 768px) 0px, 45vw"
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
        hero={<PhotoSlideshow config={config} slots={HERO_SLOTS} priority sizes="100vw" />}
        quotes={<QuoteStrip quotes={settingJson<Quote[]>(config, "site.quotes", [])} />}
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
        faq={faq.length > 0 ? <Faq config={config} items={faq} /> : null}
        closing={interestOpen ? <ClosingCta config={config} ctaLabel={estimateCta} /> : null}
        copy={{
          badge: settingText(config, "site.app_greeting_note", "نحو مستقبل أكثر خضرة"),
          line: settingText(config, "site.app_hero_line", "زيتونتك اليوم… أصل لعمر كامل."),
          exploreCta: settingText(config, "site.app_hero_cta", "شوف العروض"),
          guideCta: settingText(config, "site.app_guide_cta", "عاونّي نختار"),
          offersTitle: offersTitle(config),
          all: settingText(config, "offers.filter_all", "الكل"),
          from: settingText(config, "start.from_prefix", "ابتداءً من"),
          guideTitle: settingText(config, "site.app_guide_title", "إلقى العرض المناسب"),
          guideNote: settingText(config, "site.app_guide_note", "جاوب على بعض الأسئلة باش نعاونك تختار."),
          pickTitle: settingText(config, "site.app_pick_title", "إكتشف العروض"),
          pickNote: settingText(config, "site.app_pick_note", "تصفّح العروض المتوفّرة واختار بسهولة."),
          progressTitle: settingText(config, "million.title", "وين وصلنا؟"),
        }}
        stats={appStats}
        offers={phoneHomeOffers}
        guideHref="/start"
        offersHref={offersOpen ? "/projects" : "/start"}
        progressNote={
          progress?.treesRequested != null
            ? `${formatCount(progress.treesRequested)} ${settingText(config, "site.tab_trees", "زيتونة")}`
            : null
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
