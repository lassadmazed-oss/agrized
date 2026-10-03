import { useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { areaPerTree, stockCounted, treePrice, type Offer, type OfferStock } from "../../src/api";
import { moduleOpen, t, type AppConfig } from "../../src/config";
import { SearchIcon } from "../../src/icons";
import {
  format,
  offersTitle,
  offerWords,
  OfferImage,
  Pill,
  PillLine,
  shapes,
  statusTone,
  statusWord,
  THUMB,
  ROW_PAD,
  type Tone,
} from "../../src/offer-ui";
import { card, colour, frame, isRTL, radius, readingRow, space, type } from "../../src/theme";
import { useOffers } from "../../src/useOffers";

/**
 * عروضنا — the catalogue, as a phone reads it.
 *
 * THIS IS A TRANSLATION OF ONE FILE: src/components/site/mobile/projects-phone.tsx, which is what
 * www.agrized.site renders below `md` and therefore what «match the mobile design» means here. A bar with the
 * page's name centred on it, a pill-shaped search box, one row of one-tap filters, and a list of compact
 * rows — choosing before reading, every control within a thumb of the top (owner, 2026-09-21, on a drawing of
 * this screen, «match the exact design»).
 *
 * ONE THING THE BRIEF AND THE SITE DISAGREE ABOUT, so it is stated rather than quietly decided. The brief
 * says «two cards per row is what the owner asked for on a phone and what the site does». The first half is
 * true and the second is not any more: `<OfferCard>`'s own comments do record that instruction (2026-09-21,
 * «super ugly» about the three-column version), but the grid that holds those cards is
 * `<section className="… hidden … md:block">` (projects/page.tsx:230 and :244) — it is not rendered at all
 * below 768px. The owner replaced the phone catalogue with these rows on the SAME DAY and tightened them again
 * on 2026-09-22 («save more space»). So reproducing the two-card grid would have matched a screen a phone
 * never shows. The rows are what a phone shows, and the rows are what this is. If the owner wants the cards
 * back on a phone, that is a change to the website first.
 *
 * WHAT THE ROWS CARRY, in the order the site puts them (projects-phone.tsx:140): a 68px thumbnail, the name
 * and the price sharing the top line with «ابتداءً من» under the figure, a wrap of hairline pills — place,
 * how many trees, how much land each one carries, the status of an offer that has stopped selling — and a
 * share bar that appears only once the figure has moved.
 *
 * NOTHING HERE IS A SECOND SOURCE OF TRUTH. Every word is one of the owner's settings rows, every figure is
 * one the database answered with, and the filter row is built from the words the offers themselves carry, so
 * it can never offer a choice that matches no offer.
 */

/**
 * One row, resolved once.
 *
 * The screen builds these in a `useMemo` over the offers, their stock and the configuration, so that typing
 * in the search box re-renders the header and NOT a single row: every row's props are referentially identical
 * from one keystroke to the next, and `<OfferRow>` is memoised on them. A row that recomputed its own strings
 * would also re-run `Intl.NumberFormat` once per row per keystroke.
 */
type Row = {
  id: string;
  code: string;
  name: string;
  place: string;
  /** «100 زيتونة متاحة» — worded by the owner's `ui.cards.available_count` / `_trees_count`. */
  trees: string;
  /** «576 م²», or null when the offer does not publish it. */
  areaPerTree: string | null;
  /** «6,336 د.ت», or null while prices are closed to this visitor (PRJ-03). */
  price: string | null;
  /** How much is already spoken for, 0–100, or null while the trees are not numbered yet. */
  takenPercent: number | null;
  takenLabel: string | null;
  status: { label: string; tone: Tone } | null;
  /** The offer's own words, matched against the chosen filter. */
  facets: string[];
  /** Name, place and reference code, folded once for the search box. */
  search: string;
  coverUrl: string | null;
  coverAlt: string | null;
};

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { catalogue, stocks, config, configLoaded, placeOf, loading, failed, reload } = useOffers();
  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<string | null>(null);

  const rows = useMemo<Row[]>(
    () => catalogue.map((offer) => toRow(offer, config, placeOf(offer), stocks.get(offer.id))),
    [catalogue, config, placeOf, stocks],
  );

  /**
   * Every word at least one shown offer carries, in the order the offers put them.
   *
   * Built from the whole catalogue and not from what is currently shown, which is what the site does — its
   * `phoneFacets` comes off the server's `shown` set. A chip row that shrank as you typed would take away the
   * filter you were about to press.
   */
  const facets = useMemo(() => [...new Set(rows.flatMap((row) => row.facets))], [rows]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (facet && !row.facets.includes(facet)) return false;
      return !needle || row.search.includes(needle);
    });
  }, [rows, query, facet]);

  const open = useCallback((code: string) => router.push(`/offer/${code}`), [router]);

  // The two words every row prints the same. They are read once here rather than per row, and they pass to
  // the memoised row as plain strings, which a shallow compare treats as equal from one keystroke to the next.
  const fromPrefix = t(config, "start.from_prefix");
  const pricePending = t(config, "projects.price_pending");

  // The site draws its own bar and title here and takes the shell's header off below `md`
  // (`data-phone-screen`, globals.css:590). The navigator's header is the app's equivalent, and
  // `app/(tabs)/_layout.tsx` already sets `headerShown: false` for every tab — so this screen's bar IS the
  // bar, and nothing has to be turned off from here.
  const title = offersTitle(config);

  // The whole screen is replaced while the projects module is shut (projects/page.tsx:63) — and only once the
  // flags have actually been read, or every cold start would flash «قريباً».
  if (configLoaded && !moduleOpen(config, "projects")) {
    return (
      <View style={styles.ground}>
        <ComingSoon config={config} title={title} top={insets.top} />
      </View>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <View style={styles.ground}>
        <View style={styles.centre}>
          <ActivityIndicator color={colour.forest} />
          <Text style={[type.caption, styles.centred]}>{t(config, "ui.common.loading")}</Text>
        </View>
      </View>
    );
  }

  if (failed && rows.length === 0) {
    return (
      <View style={styles.ground}>
        <Offline onRetry={reload} top={insets.top} />
      </View>
    );
  }

  return (
    <View style={styles.ground}>
      {/* `mx-auto max-w-md`: a phone layout on a tablet is a phone layout centred, not one stretched. */}
      <View style={styles.sheet}>
        <FlatList
          data={shown}
          keyExtractor={keyOf}
          renderItem={({ item }) => (
            <OfferRow row={item} onOpen={open} from={fromPrefix} pricePending={pricePending} />
          )}
          // `px-4 pb-8 pt-3`, with the status bar cleared — the site's 12px sits under a browser chrome that
          // has already done that, and a native screen has to do it itself.
          contentContainerStyle={[styles.page, { paddingTop: frame.top + insets.top }]}
          ItemSeparatorComponent={Gap}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Stock moves when somebody buys, and the habit of pulling a list down to ask again is older than
          // this app. It is also the only retry this screen needs: no drawn button, no invented sentence.
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colour.forest} colors={[colour.forest]} />
          }
          // A list of photographs is the heaviest thing this app does, so the window is deliberately small:
          // ten rows of 88px is about four screens, which is enough to flick through without a blank gap and
          // few enough that a fast scroll never has forty image requests in flight.
          //
          // `removeClippedSubviews` is NOT set, and that is a decision rather than an oversight. It would
          // unmount the rows outside that window, which is the next win on a catalogue of fifty — and on
          // Android it is also the documented cause of rows that come back blank. Nothing in this app has
          // been run on a device yet, so an optimisation that can make a row invisible is not one to take on
          // trust: ten mounted rows is already bounded, and this is the first thing to measure on a real
          // Android build.
          windowSize={10}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          ListHeaderComponent={
            <View>
              {/* 1 · The bar. The site puts the way back at the start edge with the page's name centred
                  over it; a tab root has nowhere to go back to, so the control goes and the title stays
                  exactly where it was. The row keeps its 48px so the rhythm below is unchanged. */}
              <View style={styles.bar}>
                <Text style={[type.pageTitle, styles.centred]} numberOfLines={1}>
                  {title}
                </Text>
              </View>

              {/* 2 · The search box. It reads what is already on the screen — name, place and reference
                  code — so it answers instantly and never asks the database for a second list. */}
              <View style={styles.search}>
                <SearchIcon size={20} color={colour.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t(config, "offers.search_placeholder")}
                  placeholderTextColor={colour.muted}
                  accessibilityLabel={t(config, "offers.search_placeholder")}
                  // 16px is not a style choice: anything smaller makes iOS zoom the page on focus, which is
                  // why `.field` states it too.
                  style={styles.searchInput}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  // `type="search"` on the site; this is the native equivalent and it keeps the keyboard's
                  // own autocorrect out of a reference code.
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>

              {/* 3 · One tap, one facet. «الكل» is not a value, it is the absence of one. */}
              {facets.length > 0 ? (
                <Facets all={t(config, "offers.filter_all")} facets={facets} current={facet} onPick={setFacet} />
              ) : null}

              {/* `mt-4` before the first row. */}
              <View style={{ height: space.cozy }} />
            </View>
          }
          ListEmptyComponent={
            <Text style={[type.body, styles.empty]}>{t(config, "projects.empty_text")}</Text>
          }
        />
      </View>
    </View>
  );
}

const keyOf = (row: Row) => row.id;
const Gap = () => <View style={{ height: space.tight }} />;

/**
 * One offer, resolved from the row the database answered with.
 *
 * `takenPercent` is reserved plus contracted over the whole stock — a figure `public.trees` already holds,
 * never an estimate. Only an offer whose trees are numbered has a share to state: on one that does not,
 * «0٪» would read as «nobody wants it» rather than «not counted yet».
 */
function toRow(offer: Offer, config: AppConfig, place: string, stock: OfferStock | undefined): Row {
  const fmt = format(config);
  const counted = stockCounted(stock);
  const trees = counted ? stock.available : (offer.tree_count ?? 0);
  const perTree = areaPerTree(offer);
  // The site's third leg, read from this visitor's own copy of the flag rather than inferred from a null
  // column: `offerTreePrice(project, pricingOpen)`. With the module shut every row prints the owner's
  // `projects.price_pending` and no row prints a figure.
  const price = treePrice(offer, moduleOpen(config, "pricing"));
  const taken =
    counted && stock.available + stock.reserved + stock.sold > 0
      ? Math.round(((stock.reserved + stock.sold) / (stock.available + stock.reserved + stock.sold)) * 100)
      : null;

  return {
    id: offer.id,
    code: offer.code,
    name: offer.name,
    place,
    // What is free to buy once the trees are numbered, named as such; an offer whose trees are not numbered
    // yet states its own declared count under the bare unit.
    trees: t(config, counted ? "ui.cards.available_count" : "ui.cards.trees_count", { count: trees }),
    areaPerTree: perTree ? fmt.area(Math.round(perTree)) : null,
    price: price === null ? null : fmt.money(price),
    takenPercent: taken,
    // The figure and its words are one text, so a language can put the percent sign where it writes it.
    takenLabel: taken === null ? null : t(config, "ui.catalogue.taken_share", { percent: taken }),
    status:
      offer.status === "published"
        ? null
        : { label: statusWord(config, offer.status), tone: statusTone(offer.status) },
    facets: offerWords(config, offer),
    search: [offer.name, place, offer.code].join(" ").toLowerCase(),
    coverUrl: offer.cover_url,
    coverAlt: offer.cover_alt_ar,
  };
}

/**
 * `.card flex items-stretch gap-2.5 p-2.5` — the whole row is the link, which is why there is no arrow tile
 * at its foot any more (projects-phone.tsx:134: it was a second door to the same place charging a line of
 * height for the privilege).
 *
 * MEMOISED ON PURPOSE. Without it, every keystroke in the search box re-renders every mounted row and every
 * `expo-image` inside it. With it, a keystroke re-renders the header alone: `row` is the same object from the
 * screen's `useMemo` and `onOpen` is a `useCallback`, so the shallow compare bails out.
 */
const OfferRow = memo(function OfferRow({
  row,
  onOpen,
  from,
  pricePending,
}: {
  row: Row;
  onOpen: (code: string) => void;
  /** `start.from_prefix` — «ابتداءً من», set small under the price so the figure keeps the weight. */
  from: string;
  /** `projects.price_pending` — the owner's own sentence, never a dash and never «—». */
  pricePending: string;
}) {
  return (
    <Pressable
      onPress={() => onOpen(row.code)}
      accessibilityRole="button"
      accessibilityLabel={row.name}
      // `active:` has no meaning on a phone and the site has no ripple anywhere, so the press is a 1 % press
      // and nothing else.
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      android_ripple={null}
    >
      <View style={styles.thumb}>
        <OfferImage
          url={row.coverUrl}
          alt={row.coverAlt}
          seed={row.id}
          width={THUMB}
          height={THUMB}
          quality={70}
          recyclingKey={row.id}
          style={styles.thumbImage}
          corner={{ borderRadius: radius.control }}
        />
      </View>

      <View style={styles.body}>
        {/* Name and price share the top line: the two things a row is scanned for. */}
        <View style={styles.topLine}>
          <Text style={[type.cardTitle, styles.name]} numberOfLines={1} ellipsizeMode="tail">
            {row.name}
          </Text>
          {row.price ? (
            <View style={styles.priceCell}>
              <Text style={type.price}>{row.price}</Text>
              {/* «ابتداءً من» is never dropped: this figure is the smallest of the offer's planting classes,
                  and a from-price read as THE price is a different promise. */}
              <Text style={[type.microTight, styles.priceFrom]}>{from}</Text>
            </View>
          ) : (
            <Text style={[type.micro, styles.pending]} numberOfLines={2}>
              {pricePending}
            </Text>
          )}
        </View>

        {/* One line of facts, in the order they are asked: where, how many, how much land each. */}
        <View style={styles.facts}>
          {row.place ? <PillLine>{row.place}</PillLine> : null}
          <PillLine>{row.trees}</PillLine>
          {row.areaPerTree ? <PillLine>{row.areaPerTree}</PillLine> : null}
          {row.status ? <Pill tone={row.status.tone}>{row.status.label}</Pill> : null}
        </View>

        {/* A share nobody has taken yet is the same «0٪» on every offer, which is a line of height spent
            saying nothing. The bar appears once the figure has moved. */}
        {row.takenPercent !== null && row.takenPercent > 0 && row.takenLabel ? (
          <View style={styles.shareRow}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${row.takenPercent}%` }]} />
            </View>
            <Text style={[type.microTight, styles.shareLabel]}>{row.takenLabel}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

/**
 * The filter rail: full-bleed, one tap, and starting at the READING edge.
 *
 * THE ONE PLACE RTL BITES, written down because it is the likeliest regression in the app. The site's rail is
 * `-mx-4 … overflow-x-auto px-4` on a `direction: rtl` document, so its first chip sits against the RIGHT
 * gutter and the rail scrolls leftwards. A React Native `ScrollView` is physically left-to-right — `theme.ts`
 * deliberately does not force `I18nManager`, for the reason written there — so left alone the rail would
 * start «الكل» at the LEFT edge and the reader would have to scroll backwards to reach it.
 *
 * Of the two honest fixes, this is the one that does not touch the data: the ScrollView is mirrored and each
 * chip mirrored back, so scroll offset 0 is the right-hand edge and the chips run right to left in the order
 * they were written. Reversing the array instead would have put «الكل» last, which on a rail wider than the
 * screen means off-screen — the opposite of the site, where it is the first thing under the thumb.
 */
function Facets({
  all,
  facets,
  current,
  onPick,
}: {
  all: string;
  facets: string[];
  current: string | null;
  onPick: (facet: string | null) => void;
}) {
  // In a Latin language the rail already starts at the reading edge and must not be mirrored at all.
  const mirror = isRTL() ? MIRROR_X : undefined;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.rail, mirror]}
      contentContainerStyle={styles.railContent}
    >
      <FacetChip label={all} current={current === null} onPress={() => onPick(null)} mirror={mirror} />
      {facets.map((word) => (
        <FacetChip
          key={word}
          label={word}
          current={current === word}
          onPress={() => onPick(word)}
          mirror={mirror}
        />
      ))}
    </ScrollView>
  );
}

const MIRROR_X = { transform: [{ scaleX: -1 as number }] } as const;

function FacetChip({
  label,
  current,
  onPress,
  mirror,
}: {
  label: string;
  current: boolean;
  onPress: () => void;
  mirror?: typeof MIRROR_X;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      style={[shapes.chip, current && shapes.chipOn, mirror]}
      android_ripple={null}
    >
      <Text style={[type.chip, current && { color: colour.paper }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** What a module's page shows while its flag keeps it closed (src/components/site/module-gate.tsx:10). */
function ComingSoon({ config, title, top }: { config: AppConfig; title: string; top: number }) {
  return (
    <View style={[styles.centre, { paddingTop: top + space.band }]}>
      <Text style={[type.label, styles.centred, { color: colour.gold }]}>
        {t(config, "ui.pages.coming_soon_eyebrow")}
      </Text>
      <Text style={[type.pageTitle, styles.centred, { marginTop: space.tight }]}>{title}</Text>
      <Text style={[type.body, styles.centred, { color: colour.muted, marginTop: space.cozy }]}>
        {t(config, "ui.pages.coming_soon_text")}
      </Text>
    </View>
  );
}

/**
 * What the app says when it could not reach the database.
 *
 * THESE THREE SENTENCES ARE THE WEBSITE'S OWN, verbatim from public/offline.html — the page its service
 * worker serves for exactly this case. They are not settings rows there either, and they cannot be: a
 * fallback page shown without a connection cannot read the database for its own words. So this is the one
 * place in the app where Arabic is written in the file rather than read, it is written because the website
 * writes it, and it says the same thing in the same voice.
 *
 * The owner's own copy has no «could not read» sentence — `ui.offer.form_error_network` and
 * `ui.errors.unknown` both say «تعذّر الإرسال», which is about sending — so printing one of those here would
 * have told the reader their request failed when they had not made one.
 */
function Offline({ onRetry, top }: { onRetry: () => void; top: number }) {
  return (
    <View style={[styles.centre, { paddingTop: top + space.band }]}>
      <Text style={[type.pageTitle, styles.centred]}>ما نجّمناش نوصلو للإنترنت</Text>
      <Text style={[type.body, styles.centred, { color: colour.muted, marginTop: space.snug }]}>
        الصفحة هاذي تحتاج كونكسيون. تثبّت من الـWi‑Fi ولّا من بيانات التلفون، وبعدها عاود.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => [styles.retry, pressed && { transform: [{ scale: 0.99 }] }]}
        android_ripple={null}
      >
        <Text style={[type.button, { color: colour.paper }]}>عاود المحاولة</Text>
      </Pressable>
    </View>
  );
}

/** `text-end`: the reading END edge, which is the physical LEFT in Arabic. */
const END_ALIGN = isRTL() ? "left" : "right";

const styles = StyleSheet.create({
  /** The body's own paper, which is what makes a card read as an object. */
  ground: { flex: 1, backgroundColor: colour.paper },
  sheet: { flex: 1, width: "100%", maxWidth: frame.maxWidth, alignSelf: "center" },
  /** `pb-8` — the catalogue's own 32, not the home's `pb-6`. */
  page: { paddingHorizontal: frame.gutter, paddingBottom: 32 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.roomy },
  centred: { textAlign: "center" },

  /** `relative flex items-center justify-start py-1` with a `size-10` control setting the height. */
  bar: { minHeight: 48, justifyContent: "center", paddingVertical: space.hair },

  /** `mt-3 flex items-center gap-2 rounded-full bg-line/40 px-4 py-2.5`. */
  search: {
    ...readingRow(),
    alignItems: "center",
    gap: space.tight,
    marginTop: space.snug,
    borderRadius: radius.pill,
    backgroundColor: "rgba(227, 224, 212, 0.4)",
    paddingHorizontal: space.cozy,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colour.ink,
    writingDirection: "rtl",
    textAlign: "right",
    // The native input reserves its own vertical room on both platforms; the row's `py-2.5` is the padding
    // the design asks for, and a second helping of it would make the box 12px taller than the site's.
    paddingVertical: 0,
    includeFontPadding: false,
  },

  /** `rail-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5`. */
  rail: { marginHorizontal: -frame.gutter, marginTop: space.snug },
  railContent: { paddingHorizontal: frame.gutter, paddingBottom: 2, gap: space.tight },

  /** `.card flex items-stretch gap-2.5 p-2.5`. */
  row: { ...card, ...readingRow(), alignItems: "stretch", gap: ROW_PAD, padding: ROW_PAD },
  rowPressed: { transform: [{ scale: 0.99 }] },

  /** `size-17 flex-none overflow-hidden rounded-xl`. */
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.control, overflow: "hidden" },
  thumbImage: { width: THUMB, height: THUMB },

  /** `flex min-w-0 flex-1 flex-col justify-center gap-1.5`. */
  body: { flex: 1, minWidth: 0, justifyContent: "center", gap: 6 },

  /** `flex items-start gap-2`. */
  topLine: { ...readingRow(), alignItems: "flex-start", gap: space.tight },
  /**
   * `min-w-0 flex-1 truncate`. On the web `min-w-0` is what lets a flex child be narrower than its text;
   * React Native needs `flexShrink` beside `flex: 1` for the same reason, or the name pushes the price out
   * of the row instead of ellipsing.
   */
  name: { flex: 1, flexShrink: 1, minWidth: 0 },
  /** `flex-none text-end leading-none` — the cell hugs the reading END edge. */
  priceCell: { flexShrink: 0, alignItems: isRTL() ? "flex-start" : "flex-end" },
  priceFrom: { marginTop: 2, textAlign: END_ALIGN },
  /** `w-16 flex-none text-end` — a fixed 64px so a priced row and an unpriced one keep the same shape. */
  pending: { width: 64, flexShrink: 0, lineHeight: 12.5, textAlign: END_ALIGN },

  /** `flex flex-wrap items-center gap-1`. */
  facts: { ...readingRow(), flexWrap: "wrap", alignItems: "center", gap: space.hair },

  /** `flex items-center gap-2` — the track at the reading start, its label at the end. */
  shareRow: { ...readingRow(), alignItems: "center", gap: space.tight },
  /** `h-1 flex-1 overflow-hidden rounded-full bg-line`, filled from the reading edge. */
  track: {
    ...readingRow(),
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colour.line,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colour.leaf },
  /** `flex-none … tabular-nums` — a share that changes must not jog the row as its digits change. */
  shareLabel: { flexShrink: 0, fontVariant: ["tabular-nums"] },

  /** `mt-8 text-center leading-7 text-muted`. */
  empty: { marginTop: 32, textAlign: "center", color: colour.muted },

  /** public/offline.html's own button: forest, a pill, 48px. */
  retry: {
    marginTop: space.roomy,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colour.forest,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
