import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, StatBar, Waiting } from "../../src/components";
import { moduleOpen, t } from "../../src/config";
import {
  BrandLockup,
  ClosingCta,
  DoorCards,
  FaqCard,
  Hero,
  OffersStrip,
  ProgressBand,
  ProgressNote,
  QuoteStrip,
  ServicesMap,
  faqItems,
  homeStats,
  useHomeData,
} from "../../src/home-sections";
import { colour, frame, space, type } from "../../src/theme";
import { useConfig } from "../../src/use-config";
import { useOffers } from "../../src/useOffers";

/**
 * الرئيسية — the website's phone home, as a native screen.
 *
 * THE OWNER'S BRIEF, 2026-10-03: «fully native not a website inside the app … for the desing it should match
 * exactly the mobile desing of the website, like in evry single detiels». Those two pull against each other
 * and both are held here: nothing on this screen is a WebView or a page in a frame, and the composition is
 * `src/components/site/mobile/home-phone.tsx` section for section, in its order, at its measurements, with
 * its words.
 *
 * WHAT THIS REPLACES. The screen that stood here was a careful translation of the site's 2026-09-24
 * composition, and the site has rebuilt that composition around it since. It had no brand lockup (the exact
 * fault the owner reported on the website: «in the mobile view i dont see any logo»), no quote strip — its
 * comment had the site's own rule backwards, since the strip is `md:hidden`, which means phone-ONLY — no
 * offers strip but a two-up grid, which is the DESKTOP arrangement, no real counter band but four hard-coded
 * Arabic labels that none of them matched the owner's rows, no coverage card, no FAQ, no closing ask, and a
 * third figure («عرض», a count of offers) that appears nowhere on the website.
 *
 * THE ORDER, which is this file's whole job:
 *
 *   0  the brand lockup, on the end side        ·  0b  the sliding quote cards
 *   1  the hero — photograph, badge, promise, two doors, with a 56px foot kept clear
 *   2  the four figures, in one hairlined bar lifted onto that foot
 *   3  the two door cards — the split between somebody with an offer in mind and somebody without one
 *   4  the offers, as a strip the reader flicks        ·  5  «وين وصلنا؟»
 *   5b «إنت تستثمر، وإحنا نتلهاو» and «وين تحب تكون أرضك؟»
 *   6  the questions, then the last ask
 *
 * EVERY SENTENCE IS A `public.settings` ROW, read through `src/config.ts` — the same rows the browser reads,
 * paged the same way. The owner edits a sentence once and both surfaces change. There is one exception on
 * this screen and it is the three sentences in `LAST_RESORT` below, which is argued where it is declared.
 *
 * EVERY SECTION HIDES ON THE SAME CONDITION AS THE SITE'S: an empty setting, a closed module, or a figure the
 * database did not answer with. A figure that is absent is ABSENT and never a zero — «0 زيتونة محجوزة» reads
 * as a statement about the business where no answer at all is simply a gap.
 *
 * WHAT IS DELIBERATELY NOT HERE. The site's `install` slot («حطّ AgriZed في تلفونك») sits between the two
 * door cards and the offers; it asks a browser to install the site as an app, and this IS the app. And the
 * site's `copy.lead` (`site.home_subheadline`) is `hidden lg:block` — it must never appear on a phone.
 */

/**
 * THE ONLY ARABIC IN THIS SCREEN, AND THE ONE PLACE IT CANNOT BE AVOIDED.
 *
 * These three are `ui.pages.error_title`, `ui.pages.error_text` and `ui.pages.error_retry`, copied character
 * for character from the rows the WEBSITE shows on the same failure — so the two still say the same thing.
 * They are printed only when the settings read itself did not answer, which is the one state in which reading
 * them from the database is impossible: a phone with no signal, opened for the first time. `say()` below
 * prefers the owner's row whenever there is one, so a configuration that loaded always wins, and the day one
 * of these keys is edited in the Back Office the app follows for every reader who has ever had signal.
 *
 * Anything softer would be worse than this. `t()` prints a key's own name for a missing key — right for a gap
 * in a loaded configuration, and unreadable as a whole screen of «ui.pages.error_title».
 */
const LAST_RESORT = {
  "ui.pages.error_title": "صارت مشكلة في هذه الصفحة",
  "ui.pages.error_text":
    "ما كمّلتش كيما لازم. جرّب مرّة أخرى، واختياراتك تقعد كيما هي. كان عاودت، اتصل بينا ونحلّوها.",
  "ui.pages.error_retry": "جرّب مرّة أخرى",
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /**
   * The configuration comes from the PROVIDER and not from `useOffers`, although that hook carries one too.
   *
   * The root layout holds the splash until the provider's read settles, so by the first frame of this screen
   * every word and every flag is already in hand: no section appears a third of a second late, and no tab or
   * price is drawn from a flag that has not arrived. `useOffers`'s own copy is for the screens that mount
   * without the provider above them.
   */
  const { config, failed: configFailed, reload: reloadConfig } = useConfig();
  const { offers, placeOf, reload: reloadOffers } = useOffers();
  const { data, ready: homeReady, reload: reloadHome } = useHomeData();

  const [refreshing, setRefreshing] = useState(false);

  /**
   * PULL TO REFRESH, which the website has no equivalent of and an app must: the stock behind these figures
   * moves when somebody buys, and «وين وصلنا؟» is a counter. It re-reads everything — the words, the flags,
   * the offers, the pictures and the counter — because a reader who pulls is saying «this looks old».
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([reloadOffers(), reloadHome(), Promise.resolve(reloadConfig())]);
    } finally {
      setRefreshing(false);
    }
  }, [reloadConfig, reloadHome, reloadOffers]);

  /** The owner's sentence when it is there, and the site's own wording for the failure when it is not. */
  const say = useCallback(
    (key: keyof typeof LAST_RESORT) => {
      const words = t(config, key);
      return words === key ? LAST_RESORT[key] : words;
    },
    [config],
  );

  const frameStyle = useMemo(
    () => ({
      paddingHorizontal: frame.gutter,
      paddingTop: frame.top + insets.top,
      paddingBottom: frame.bottom,
    }),
    [insets.top],
  );

  /** The four figures, built once per render and not once per cell: each one carries a bound formatter. */
  const stats = useMemo(() => homeStats(config, data.progress), [config, data.progress]);

  /**
   * WITHOUT THE OWNER'S WORDS THERE IS NO SCREEN, so this is the one failure that takes the whole page.
   *
   * Every other read fails alone, exactly as on the site: an offers read that did not answer costs the strip
   * and nothing else (`liveOffers()` catches and returns an empty list), a photograph that did not arrive is
   * the site's own drawn grove, and a counter that did not answer takes the band away exactly as a closed
   * statistics module does. The app's old home returned ONE empty state for all of it, so a single rejected
   * query blanked the hero, the figures, the services and the words — four other reads that had succeeded.
   */
  if (configFailed) {
    return (
      <View style={[styles.page, frameStyle, styles.failure]}>
        <BrandLockup />
        <View style={styles.failureBody}>
          <Text style={[type.sheetTitle, styles.centre]}>{say("ui.pages.error_title")}</Text>
          <Text style={[type.body, styles.centre, { color: colour.muted }]}>{say("ui.pages.error_text")}</Text>
          <Button label={say("ui.pages.error_retry")} onPress={() => void refresh()} variant="secondary" busy={refreshing} />
        </View>
      </View>
    );
  }

  /**
   * THE FIRST FRAME IS NOT A BLANK SCREEN, AND IT IS NOT A SHELL OF EMPTY SECTIONS EITHER.
   *
   * The splash has already waited for the fonts and the words (app/_layout.tsx); what is still in flight when
   * this screen mounts is the pictures, the counter and the offers. The first two are what would VISIBLY pop:
   * a figures bar of one cell that jumps to four, and a hero whose drawn grove is replaced by a photograph —
   * both read as a fault rather than as loading. So the frame, the brand and a spinner until they settle.
   *
   * `ready` IS A LATCH AND IS SETTLED, NOT SUCCEEDED: a phone in a grove loses signal, and an app that never
   * leaves its spinner is worse than one that opens and shows what it has. It never goes back to false, so a
   * pull-to-refresh cannot replace the page somebody is reading with a spinner.
   *
   * THE OFFERS ARE NOT WAITED FOR, deliberately. Their strip is one section and it hides itself until they
   * arrive, exactly as the site's does when `liveOffers()` catches and returns an empty list — and holding
   * the whole screen for it would be the old home's fault in a new place.
   */
  if (!homeReady) {
    return (
      <View style={[styles.page, frameStyle]}>
        <BrandLockup />
        <Waiting style={styles.waiting} />
      </View>
    );
  }

  // FLAG-02 / PRJ-03: the offers door opens only once the module is public, so it never leads to a «قريباً»
  // screen — report v3 §17, and the same `offersOpen ? "/projects" : "/start"` the site resolves.
  const offersOpen = moduleOpen(config, "projects");
  const interestOpen = moduleOpen(config, "interest_form");
  const hasQuestions = faqItems(config).length > 0;
  const toOffers = () => router.push(offersOpen ? "/offers" : "/calculator");
  const toGuide = () => router.push("/calculator");

  // The offers are read for every screen, but this one may only show them while the module is open.
  const live = offersOpen ? offers : [];
  // The places that actually hold a live offer today — a marked chip on the coverage card is a row, not a
  // caption.
  const offerPlaces = new Set(live.map((offer) => placeOf(offer)).filter(Boolean));

  const progress = data.progress;
  const progressNote =
    progress?.treesRequested != null ? t(config, "ui.home.progress_trees", { count: progress.treesRequested }) : null;
  const progressPercent =
    progress?.treesRequested != null && progress.goal
      ? Math.round((progress.treesRequested / progress.goal) * 100)
      : null;

  return (
    <ScrollView
      style={styles.ground}
      contentContainerStyle={[styles.page, frameStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colour.forest}
          colors={[colour.forest]}
        />
      }
    >
      {/* 0 · The brand, which the phone has nowhere else: the tab bar carries the navigation and the
          navigator draws no header, exactly as the site takes its own header off below 48rem. */}
      <BrandLockup />

      {/* 0b · The proverbs. Phone-only on the site, so the app is where they belong. */}
      <QuoteStrip config={config} />

      {/* 1 · The hero. The whole card is not the link: the primary door is a control, because the second one
          goes somewhere else entirely. */}
      <Hero config={config} covers={data.covers} onExplore={toOffers} onGuide={toGuide} />

      {/* 2 · The figures, lifted onto the foot of the photograph — `-mt-10 mx-3`, above the hero so their own
          shadow falls on the picture, and inset so its rounded corners still read behind the bar. */}
      <StatBar cells={stats} surface="float" size="home" style={styles.figures} />

      {/* 3 · The split, which is the point of the composition. */}
      <DoorCards config={config} onGuide={toGuide} onOffers={toOffers} />

      {/* 4 · Every offer, once, as a strip. */}
      <OffersStrip
        config={config}
        offers={live}
        placeOf={placeOf}
        onAll={toOffers}
        onOpen={(offer) => router.push(`/offer/${offer.code}`)}
      />

      {/* 5 · «وين وصلنا؟». The band and the one-line bar are MUTUALLY EXCLUSIVE, as on the site: both answer
          the same question, and the band already carries the figure the bar carries one of. With the
          statistics module closed the counter answers a stranger with nothing and neither is drawn. */}
      {progress ? (
        <ProgressBand config={config} progress={progress} photo={data.media.get("home.coverage")} />
      ) : progressNote ? (
        <ProgressNote config={config} note={progressNote} percent={progressPercent} />
      ) : null}

      {/* 5b · What the company keeps doing after the money changes hands, and where the land can be. It sits
          after the counter because it answers the question the figures raise: «fine, but what do I get». */}
      <ServicesMap config={config} offerPlaces={offerPlaces} />

      {/* 6 · The stranger's questions, then the ask — in that order, which the site argues for: somebody
          still hesitating is not asked to register, somebody whose last doubt has just been answered is.
          The wrapper is drawn only when one of the two exists, so an emptied `site.faq` with a closed
          interest module leaves no spacer behind. */}
      {hasQuestions || interestOpen ? (
        <View style={styles.closingGroup}>
          <FaqCard config={config} />
          {interestOpen ? (
            <ClosingCta
              config={config}
              photo={data.media.get("home.closing")}
              onEstimate={() => router.push("/calculator")}
            />
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  /** The body's own ground (`--color-paper`), under a column that never exceeds `max-w-md`. */
  ground: { flex: 1, backgroundColor: colour.paper },
  page: { maxWidth: frame.maxWidth, width: "100%", alignSelf: "center" },

  // `.card relative z-10 -mt-10 mx-3 shadow-float`
  figures: { marginTop: -space.section, marginHorizontal: space.snug, zIndex: 10 },

  // `mt-4 grid gap-3` around the questions and the ask.
  closingGroup: { marginTop: space.cozy, gap: space.snug },

  failure: { flex: 1 },
  failureBody: { flex: 1, justifyContent: "center", gap: space.cozy },
  centre: { textAlign: "center" },
  waiting: { flex: 0, paddingVertical: space.section * 2 },
});
