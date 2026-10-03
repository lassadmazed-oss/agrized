import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  areaPerTree,
  fetchDelegationName,
  fetchOfferPage,
  fetchOfferQuote,
  siteUrl,
  stockCounted,
  treePrice,
  type OfferPage,
  type OfferPicture,
  type OfferQuote,
} from "../../src/api";
import { moduleOpen, settingText, t, type AppConfig } from "../../src/config";
import { ArrowGo, ChevronBack, MapSketch, PinIcon, ShareIcon } from "../../src/icons";
import { InterestForm } from "../../src/InterestForm";
import {
  chosenLabels,
  format,
  irrigationWord,
  offersTitle,
  OfferImage,
  Pill,
  plantationLabel,
  productionLabel,
  statusTone,
  statusWord,
  waterText,
} from "../../src/offer-ui";
import {
  alpha,
  card,
  colour,
  edges,
  frame,
  isRTL,
  radius,
  readingRow,
  space,
  type,
} from "../../src/theme";
import { useOffers } from "../../src/useOffers";

/**
 * One offer, as a phone reads it.
 *
 * A TRANSLATION OF src/app/[lang]/(public)/projects/[code]/offer-phone.tsx, which is what the website renders
 * below `md`, plus the figures its server component resolves for it
 * (projects/[code]/page.tsx:264 onwards). The order is the drawing's (owner, 2026-09-21): the picture, the
 * name and place, the four facts as one bar, the price of ONE tree with the note that qualifies it — then
 * everything the offer publishes, section after section, with the door floating above it all.
 *
 * A WHITE SHEET, NOT THE SITE'S CREAM, and the site states why: everywhere else `paper` is the ground a card
 * sits ON, which is what makes a card read as an object. This screen has no cards — the picture is edge to
 * edge and everything under it is one sheet. That is what makes the drawing look like an app and the cream
 * version look like a web page with a photograph at the top.
 *
 * SET IN THE SANS FACE, NOT MARKAZI, for the name and the price. It is the one screen on the site that
 * departs from the display face, and it departs deliberately: those figures should read as controls rather
 * than as headlines. The site writes `font-sans` out rather than inheriting it so nobody restores
 * `font-display` thinking it was forgotten, and that is why this note is here too.
 *
 * NOTHING IS COMPUTED. The price is what `public_project_quote` answered for the basket this screen opens on,
 * falling back to the `min_price_per_tree_millimes` of the listing row — both figures the database published.
 * There is no multiplication anywhere on this screen, no yield, no return and no projection (PRN-01), and an
 * amount never appears without the note that says what it is.
 *
 * WHAT IS READ, AND WHY EACH CALL IS THERE. The listing row arrives with the catalogue, so opening an offer
 * draws instantly and works a second after the list loaded. `public_project_page` adds the description, the
 * water, the access note, the video, the coordinates, the document and service ids and the whole gallery —
 * four fifths of this screen, and the app called none of it. `public_offer_stock` is the one figure that
 * moves. `public_project_quote` is the price, asked for the same basket the website asks for.
 */

export default function OfferScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const { catalogue, stocks, config, configLoaded, placeOf, loading, failed, reload } = useOffers();

  const offer = useMemo(() => catalogue.find((row) => row.code === code), [catalogue, code]);
  const stock = offer ? stocks.get(offer.id) : undefined;

  const [page, setPage] = useState<OfferPage | null>(null);
  const [quote, setQuote] = useState<OfferQuote | null>(null);
  const [delegation, setDelegation] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [doorHeight, setDoorHeight] = useState(0);

  /** `mx-auto max-w-md`: the sheet is a phone layout centred on a tablet, never one stretched to 900px. */
  const sheetWidth = Math.min(viewport.width, frame.maxWidth);

  const counted = stockCounted(stock);
  const declaredTrees = offer?.tree_count ?? 0;
  /** What the visitor may still ask for: once the trees are numbered, what is free — not what is declared. */
  const sellableTrees = counted ? stock.available : declaredTrees;
  const minTrees = stock?.minTrees ?? 1;
  const openingTrees = Math.max(1, Math.min(minTrees, Math.max(sellableTrees, 1)));

  // The rest of the page. One call, re-run only if the offer itself changes.
  useEffect(() => {
    if (!offer) return;
    let gone = false;
    void fetchOfferPage(offer.code)
      .then((answer) => {
        if (!gone) setPage(answer);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [offer?.code]);

  // The offer's own quote, for the basket the screen opens on — the same question the website asks
  // (page.tsx:145), and asked only when the offer sells trees at all.
  useEffect(() => {
    if (!offer || declaredTrees <= 0 || !offer.on_tree_pricing) return;
    let gone = false;
    void fetchOfferQuote(offer.id, openingTrees)
      .then((answer) => {
        if (!gone) setQuote(answer);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [offer?.id, declaredTrees, offer?.on_tree_pricing, openingTrees]);

  const place = offer ? placeOf(offer) : "";
  const address = offer?.location_description?.trim() ?? "";
  /** The place, said once: the offer's own address when it already names the governorate, else the region. */
  const addressNamesPlace = Boolean(address && place && address.includes(place));
  const needsRegion = !addressNamesPlace;

  useEffect(() => {
    if (!needsRegion || !offer?.delegation_id) return;
    let gone = false;
    void fetchDelegationName(offer.delegation_id).then((name) => {
      if (!gone) setDelegation(name);
    });
    return () => {
      gone = true;
    };
  }, [needsRegion, offer?.delegation_id]);

  if (loading && !offer) return <Waiting config={config} />;
  if (failed && !offer) return <Offline onRetry={reload} />;
  if (!offer) {
    // The catalogue answered and this code is not in it: the offer was withdrawn, or the module closed while
    // the screen was open. The owner has a sentence for exactly that.
    return (
      <Missing
        text={t(config, configLoaded && !moduleOpen(config, "projects") ? "ui.pages.coming_soon_text" : "ui.errors.offer_not_available")}
        label={offersTitle(config)}
        onBack={() => router.back()}
      />
    );
  }

  const fmt = format(config);
  const { end, flip } = edges();

  const region = [place, delegation].filter(Boolean).join(" · ");
  const placeLine = addressNamesPlace ? address : region;
  const placeNote = placeLine === address ? "" : address;

  /** Every picture, the cover first — the order `public_project_page` already returns them in. */
  const pictures: OfferPicture[] = page?.media ?? [];
  const gallery = pictures.slice(1);

  const perTree = areaPerTree(offer);
  /** A single area, or the range between the offer's own two spacings (page.tsx:204). */
  const perTreeText = perTree
    ? offer.area_per_tree_max_m2 && offer.area_per_tree_max_m2 !== perTree
      ? `${fmt.count(Math.round(perTree))} – ${fmt.area(Math.round(offer.area_per_tree_max_m2))}`
      : fmt.area(Math.round(perTree))
    : null;

  const plantation = offer.plantation_system ? plantationLabel(config, offer.plantation_system) : null;
  const production = offer.production_status ? productionLabel(config, offer.production_status) : null;
  const irrigation = offer.irrigation ? irrigationWord(config, offer.irrigation) : null;
  const water = page ? waterText(config, page.waterAvailable, page.waterNote) : null;
  const documents = page ? chosenLabels(config, "land_document", page.documentOptionIds) : [];
  const services = page ? chosenLabels(config, "agrized_service", page.serviceOptionIds) : [];
  const mapHref =
    page && page.latitude !== null && page.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${page.latitude},${page.longitude}`
      : null;

  /**
   * THE PRICE, AND THE ONLY TWO PLACES IT MAY COME FROM.
   *
   * The quote when it answered «ok», else the listing row's own smallest class — and `treePrice` refuses
   * that unless the offer is `offered` AND sells by tree, which is one check stricter than the website's own
   * fallback. `public_projects()` already withholds the figure while the pricing module is shut, so a closed
   * module reaches this screen as `null` and the owner's «السعر يُعلن لاحقاً» is printed instead. Nothing
   * here fills the gap with a dash, with the cash price, or with anything else.
   */
  const perTreeMillimes =
    quote?.pricing === "ok" ? quote.pricePerTreeMillimes : treePrice(offer, moduleOpen(config, "pricing"));
  const priced = perTreeMillimes !== null;
  /**
   * PRN-01, where the amount is actually read. `projects.price_note` is the owner's wording for this spot and
   * he has not written it yet, so the calculator's own note stands in — which is what the website does
   * (page.tsx:226). Same promise, same voice, and no sentence invented in the code.
   */
  const priceNote = priced
    ? settingText(config, "projects.price_note") || t(config, "start.estimate_note")
    : "";

  /** The four facts the screen wears as one bar; a fact the offer does not publish is simply left out. */
  const headline = [
    {
      label: counted ? t(config, "offers.stock_available_label") : t(config, "offers.unit_tree"),
      value: fmt.count(counted ? stock.available : declaredTrees),
    },
    ...(perTreeText ? [{ label: t(config, "offers.unit_per_tree"), value: perTreeText }] : []),
    ...(plantation ? [{ label: t(config, "offers.label_plantation"), value: plantation }] : []),
    ...(offer.total_area_m2
      ? [{ label: t(config, "start.row_total_area"), value: fmt.area(offer.total_area_m2) }]
      : []),
  ];

  /** The two words that describe the grove itself: the variety, and whether it bears. */
  const tags: { label: string; tone: "leaf" | "gold" }[] = [];
  if (offer.olive_variety) tags.push({ label: offer.olive_variety, tone: "leaf" });
  if (production) tags.push({ label: production, tone: "gold" });

  const landRows: Fact[] = [];
  if (offer.total_area_m2) landRows.push({ label: t(config, "start.row_total_area"), value: fmt.area(offer.total_area_m2) });
  if (water) landRows.push({ label: t(config, "ui.offer.fact_water"), value: water });
  if (irrigation) landRows.push({ label: t(config, "ui.offer.fact_irrigation"), value: irrigation });

  const treeRows: Fact[] = [];
  if (offer.olive_variety) treeRows.push({ label: t(config, "ui.offer.fact_variety"), value: offer.olive_variety });
  if (offer.tree_age_years)
    treeRows.push({
      label: t(config, "ui.offer.fact_tree_age"),
      value: t(config, "ui.offer.tree_age_value", { years: offer.tree_age_years }),
    });
  if (plantation) treeRows.push({ label: t(config, "ui.offer.fact_plantation_system"), value: plantation });
  if (production) treeRows.push({ label: t(config, "ui.offer.fact_production_status"), value: production });

  /** What is left of the stock — the one figure that moves. A zero bucket is the same on every offer. */
  const stockRows: Fact[] = [];
  if (counted) {
    if (stock.total !== stock.available)
      stockRows.push({ label: t(config, "offers.stock_total_label"), value: fmt.count(stock.total) });
    if (stock.reserved > 0)
      stockRows.push({ label: t(config, "offers.stock_reserved_label"), value: fmt.count(stock.reserved) });
    if (stock.sold > 0) stockRows.push({ label: t(config, "offers.stock_sold_label"), value: fmt.count(stock.sold) });
  }

  const factGroups = [
    landRows.length > 0 ? { title: t(config, "projects.facts_land_title"), rows: landRows } : null,
    treeRows.length > 0 ? { title: t(config, "projects.facts_trees_title"), rows: treeRows } : null,
    stockRows.length > 0 ? { title: offersTitle(config), rows: stockRows } : null,
  ].filter((group): group is { title: string; rows: Fact[] } => group !== null);

  const description = page?.description?.trim() ?? "";
  const accessNote = page?.accessNote ?? "";

  // The place leads: where the land is decides whether the rest of the screen is worth reading
  // (offer-phone.tsx:122). Everything else follows in the site's own order.
  const sections = [
    { key: "location", label: t(config, "offers.tab_location"), shown: Boolean(placeLine || mapHref || accessNote) },
    {
      key: "info",
      label: t(config, "offers.tab_info"),
      shown: Boolean(description) || factGroups.length > 0 || services.length > 0,
    },
    { key: "photos", label: t(config, "offers.tab_photos"), shown: gallery.length > 0 || Boolean(page?.videoUrl) },
    { key: "documents", label: t(config, "offers.tab_documents"), shown: documents.length > 0 },
  ].filter((section) => section.shown);

  /** Payment and visits only concern an offer that is still selling its trees. */
  const selling = offer.status === "published" || offer.status === "internal";
  const formOpen = selling && moduleOpen(config, "interest_form") && sellableTrees > 0;

  async function share() {
    const url = `${siteUrl}/projects/${encodeURIComponent(offer!.code)}`;
    try {
      // The native sheet always exists, so the website's clipboard branch and its «تنسخ الرابط»
      // confirmation are not needed here — a native-wins simplification, not a dropped feature.
      await Share.share({ title: offer!.name, message: url, url });
    } catch {
      // A cancelled sheet is «nothing happened», not an error to report.
    }
  }

  return (
    <View style={styles.ground}>
      {/* The site takes its own header off this screen (`data-offer-phone`, globals.css): a back control and
          a logo bar are two headers, and the logo bar was 68px of the 812 spent saying where the reader
          already is. The navigator's header goes for the same reason. */}
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: doorHeight }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sheet}>
          {/* 1 · The bar over the picture. The way back is the START edge and the chevron points the way the
              reader came from — the right on an Arabic screen. */}
          <View style={[styles.bar, { paddingTop: insets.top + space.tight }]}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={offersTitle(config)}
              style={styles.control}
              hitSlop={8}
              android_ripple={null}
            >
              <View style={flip}>
                <ChevronBack size={24} color={colour.forest} />
              </View>
            </Pressable>
            <Pressable
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel={t(config, "offers.share_label")}
              style={styles.control}
              hitSlop={8}
              android_ripple={null}
            >
              <ShareIcon size={20} color={colour.forest} />
            </Pressable>
          </View>

          {/* 2 · The place itself, edge to edge — and moving, when the offer has more than one picture. */}
          <View>
            <Hero
              pictures={pictures}
              fallbackUrl={offer.cover_url}
              fallbackAlt={offer.cover_alt_ar}
              seed={offer.id}
              width={sheetWidth}
            />
            {offer.status !== "published" ? (
              <Pill
                tone={statusTone(offer.status)}
                style={[
                  styles.statusPill,
                  { top: space.cozy },
                  end === "left" ? { left: space.cozy } : { right: space.cozy },
                ]}
              >
                {statusWord(config, offer.status)}
              </Pill>
            ) : null}
          </View>

          {/* 3 · Name, place, the offer's own figures, and the decision. */}
          <View style={styles.head}>
            <Text style={type.sheetTitle}>{offer.name}</Text>
            {placeLine ? (
              <View style={styles.placeRow}>
                <PinIcon size={16} color={colour.muted} />
                <Text style={[type.caption, styles.place]} numberOfLines={2}>
                  {placeLine}
                </Text>
              </View>
            ) : null}

            {/* The four facts as ONE hairlined bar. They used to be a wrap of loose pills: a pill carries a
                value and no label, so «49 م²» and «2.45 هـ» sat side by side with nothing saying which was
                which. Four labelled cells cost one line where a wrap of six cost two. */}
            {headline.length > 0 ? (
              <View style={styles.factsBar}>
                {headline.map((cell, index) => (
                  <View key={cell.label} style={styles.factsCell}>
                    {index > 0 ? <View style={styles.factsRule} /> : null}
                    <View style={styles.factsBody}>
                      <Text style={styles.factsValue}>{cell.value}</Text>
                      <Text style={styles.factsLabel} numberOfLines={2}>
                        {cell.label}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {tags.length > 0 ? (
              <View style={styles.tags}>
                {tags.map((tag) => (
                  <Pill
                    key={tag.label}
                    tone={
                      tag.tone === "leaf"
                        ? { bg: colour.leafSoft, fg: colour.forest }
                        : { bg: colour.goldSoft, fg: colour.gold }
                    }
                    style={styles.tag}
                    textStyle={styles.tagText}
                  >
                    {tag.label}
                  </Pill>
                ))}
              </View>
            ) : null}

            {/* 4 · What one tree costs. PRJ-03: no price is published unless the database published one, and
                the offer still takes requests without it. */}
            <View style={styles.priceBlock}>
              {priced ? (
                <View style={styles.priceRow}>
                  <Text style={type.priceLarge}>{fmt.money(perTreeMillimes)}</Text>
                  <Text style={styles.priceSuffix}>{t(config, "offers.price_per_tree_suffix")}</Text>
                </View>
              ) : (
                <Text style={styles.pricePending}>{t(config, "projects.price_pending")}</Text>
              )}
              {priced && priceNote ? <Text style={styles.priceNote}>{priceNote}</Text> : null}
            </View>
          </View>

          {/* 5 · Everything else, all of it, one section after another (owner, 2026-09-22: «show them all
              without the buttons»). It was four tabs over three short blocks, which meant two thirds of what
              the offer publishes was invisible until somebody thought to tap a word. */}
          {sections.length > 0 ? (
            <View style={styles.sections}>
              {sections.map((section, index) => (
                <View
                  key={section.key}
                  style={[styles.section, index === sections.length - 1 && styles.sectionLast]}
                >
                  <Text style={[type.cardTitle, styles.sectionHead]}>{section.label}</Text>
                  {section.key === "location" ? (
                    <LocationPanel
                      place={placeLine}
                      note={placeNote}
                      accessNote={accessNote}
                      accessTitle={t(config, "ui.offer.fact_access")}
                      mapHref={mapHref}
                      mapCta={t(config, "projects.location_cta")}
                      width={sheetWidth - frame.gutter * 2}
                    />
                  ) : null}
                  {section.key === "info" ? (
                    <InfoPanel
                      about={t(config, "projects.about_title")}
                      description={description}
                      groups={factGroups}
                      services={services}
                      servicesTitle={t(config, "projects.services_title")}
                      servicesText={t(config, "projects.services_text")}
                    />
                  ) : null}
                  {section.key === "photos" ? (
                    <PhotosPanel
                      gallery={gallery}
                      width={sheetWidth - frame.gutter * 2}
                      videoUrl={page?.videoUrl ?? null}
                      videoTitle={t(config, "projects.video_title")}
                      videoLink={t(config, "ui.offer.video_link")}
                    />
                  ) : null}
                  {section.key === "documents" ? (
                    <DocumentsPanel documents={documents} note={t(config, "projects.documents_text")} />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {/* PRN-01 carried the way the site carries it: its footer prints this on every public page, and
              this app has no footer, so it rides at the foot of the screen that states the amounts. */}
          <Text style={styles.legal}>{t(config, "legal.no_guarantee_notice")}</Text>
        </View>
      </ScrollView>

      {/* 4b · THE DOOR, FLOATING (owner, 2026-09-22: «make it a floating button at the bottom of the page»).
          In the browser it is `position: fixed` at `bottom: var(--tabbar-h)`, riding above the shell's own tab
          bar, with an 80px spacer keeping it off the last section. Here the navigator owns the bar and this
          screen is pushed OVER the tabs, so the door is an absolute View at the foot of the screen, outside
          the ScrollView, and the ScrollView is padded by its MEASURED height. No 76px constant, no double
          inset, and it stays right when the bar's height changes with the device. Same design, better
          mechanism — stated as a native-wins departure. */}
      {formOpen ? (
        <View
          style={[styles.door, { paddingBottom: space.snug + insets.bottom }]}
          onLayout={(event: LayoutChangeEvent) => setDoorHeight(event.nativeEvent.layout.height)}
        >
          <Pressable
            onPress={() => setAsking(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.doorButton, pressed && { transform: [{ scale: 0.99 }] }]}
            android_ripple={null}
          >
            <Text style={styles.doorLabel}>{t(config, "offers.submit_label")}</Text>
            <View style={flip}>
              <ArrowGo size={16} color={colour.surface} />
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* The site's door opens /projects/<code>/interest, a page of its own (owner, 2026-09-22: the form
          stopped being a section of this page). A full-screen sheet is what that page is on a phone: the
          offer stays where it was, the form is the whole frame, and dismissing it returns the reader to the
          exact scroll position instead of to the top of a re-entered screen. */}
      <Modal
        visible={asking}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAsking(false)}
      >
        <View style={styles.ground}>
          <View style={[styles.bar, { paddingTop: insets.top + space.tight }]}>
            <Pressable
              onPress={() => setAsking(false)}
              accessibilityRole="button"
              accessibilityLabel={offer.name}
              style={styles.control}
              hitSlop={8}
              android_ripple={null}
            >
              <View style={flip}>
                <ChevronBack size={24} color={colour.forest} />
              </View>
            </Pressable>
            <View style={styles.control} />
          </View>
          <ScrollView
            contentContainerStyle={[styles.formPage, { paddingBottom: space.section + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheet}>
              <InterestForm offerCode={offer.code} offerName={offer.name} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

type Fact = { label: string; value: string };

// ---------------------------------------------------------------------------------------------------------
// The hero
// ---------------------------------------------------------------------------------------------------------

/**
 * Swipeable, and moving on its own (owner, 2026-09-22: «make the thing slidable and make the slides faster»).
 *
 * THE TIMER YIELDS TO THE HAND AND DOES NOT COME BACK. Once someone has touched the strip they are reading at
 * their own pace, and a carousel that resumes stealing the frame after a polite pause is the thing everyone
 * hates about carousels. That is the site's rule and `taken` is the same one-way latch it uses.
 *
 * IT ALSO NEVER STARTS under «reduce motion». The site reads `prefers-reduced-motion`; the native question is
 * `AccessibilityInfo.isReduceMotionEnabled`, and it is asked once and listened to, because a reader can turn
 * it on while the screen is open.
 *
 * FEWER THAN TWO PICTURES IS ONE STILL FRAME and no dots: a single frame sliding into itself is a twitch.
 *
 * RTL. A paged `ScrollView` is physically left-to-right, so left alone the strip would advance the wrong way
 * under an Arabic thumb — forward is a swipe from the LEFT edge on this site. The strip is mirrored and each
 * slide mirrored back, which reverses the gesture and leaves every picture the right way round. The offset
 * arithmetic is unchanged by it, so the timer and the dots read the same index either way.
 */
function Hero({
  pictures,
  fallbackUrl,
  fallbackAlt,
  seed,
  width,
}: {
  pictures: OfferPicture[];
  fallbackUrl: string | null;
  fallbackAlt: string | null;
  seed: string;
  width: number;
}) {
  /** `aspect-[2/1]`, not the catalogue's 4:3: at 375px a 4:3 band is 281px of picture and pushed the price,
      the figures and the door past the fold, which is the one thing the drawing does not allow. */
  const height = Math.round(width / 2);
  const strip = useRef<ScrollView | null>(null);
  const taken = useRef(false);
  const [active, setActive] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  const mirror = isRTL() ? MIRROR_X : undefined;

  useEffect(() => {
    let gone = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!gone) setReduceMotion(on);
    });
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => setReduceMotion(on));
    return () => {
      gone = true;
      listener.remove();
    };
  }, []);

  const count = pictures.length;

  useEffect(() => {
    if (count < 2 || reduceMotion) return;
    const timer = setInterval(() => {
      if (taken.current || !strip.current) return;
      setActive((current) => {
        const next = (current + 1) % count;
        strip.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 2600);
    return () => clearInterval(timer);
  }, [count, reduceMotion, width]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = Math.abs(event.nativeEvent.contentOffset.x);
      setActive(width > 0 ? Math.round(offset / width) % Math.max(count, 1) : 0);
    },
    [count, width],
  );

  if (count < 2) {
    const only = pictures[0];
    return (
      <OfferImage
        url={only?.url ?? fallbackUrl}
        alt={only?.alt ?? fallbackAlt}
        seed={only?.id ?? seed}
        width={width}
        height={height}
        priority="high"
        style={{ width, height }}
      />
    );
  }

  return (
    <View>
      <ScrollView
        ref={strip}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onTouchStart={() => {
          taken.current = true;
        }}
        // Both, because with `pagingEnabled` a flick ends in momentum and a slow drag does not, and a dot
        // that only moved after a flick would be wrong exactly for the reader who scrolls carefully. Neither
        // fires per frame, so the index is set once per page instead of sixty times a second.
        onMomentumScrollEnd={onScroll}
        onScrollEndDrag={onScroll}
        style={[{ width, height }, mirror]}
      >
        {pictures.map((picture, index) => (
          <View key={picture.id} style={mirror}>
            <OfferImage
              url={picture.url}
              alt={picture.alt}
              seed={picture.id}
              width={width}
              height={height}
              // Only the first frame is worth the network's attention while the reader is still arriving.
              priority={index === 0 ? "high" : "low"}
              style={{ width, height }}
            />
          </View>
        ))}
      </ScrollView>

      {/* Which one is showing, and how many there are. */}
      <View style={styles.dots} pointerEvents="none">
        {pictures.map((picture, index) => (
          <View key={picture.id} style={[styles.dot, index === active ? styles.dotOn : styles.dotOff]} />
        ))}
      </View>
    </View>
  );
}

const MIRROR_X = { transform: [{ scaleX: -1 as number }] } as const;

// ---------------------------------------------------------------------------------------------------------
// The panels
// ---------------------------------------------------------------------------------------------------------

function LocationPanel({
  place,
  note,
  accessNote,
  accessTitle,
  mapHref,
  mapCta,
  width,
}: {
  place: string;
  note: string;
  accessNote: string;
  accessTitle: string;
  mapHref: string | null;
  mapCta: string;
  width: number;
}) {
  const { flip } = edges();
  return (
    <View style={{ gap: space.snug }}>
      {mapHref ? (
        <Pressable
          onPress={() => void Linking.openURL(mapHref)}
          accessibilityRole="link"
          accessibilityLabel={mapCta}
          style={styles.map}
          android_ripple={null}
        >
          <View style={{ width: "100%", height: Math.round(width / 2) }}>
            <MapSketch />
            <View style={styles.mapCaption}>
              <Text style={styles.mapCaptionText}>{mapCta}</Text>
              <View style={flip}>
                <ArrowGo size={16} color={colour.paper} />
              </View>
            </View>
          </View>
        </Pressable>
      ) : null}

      {place ? <Text style={styles.panelHead}>{place}</Text> : null}
      {note ? <Text style={styles.prose}>{note}</Text> : null}
      {accessNote ? (
        <View>
          <Text style={styles.subHead}>{accessTitle}</Text>
          <Text style={[styles.prose, { marginTop: space.hair }]}>{accessNote}</Text>
        </View>
      ) : null}
    </View>
  );
}

function InfoPanel({
  about,
  description,
  groups,
  services,
  servicesTitle,
  servicesText,
}: {
  about: string;
  description: string;
  groups: { title: string; rows: Fact[] }[];
  services: string[];
  servicesTitle: string;
  servicesText: string;
}) {
  return (
    <View style={{ gap: space.card }}>
      {description ? (
        <View>
          <Text style={styles.panelHead}>{about}</Text>
          <Text style={[styles.prose, { marginTop: space.tight }]}>{description}</Text>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.title}>
          <Text style={styles.panelHead}>{group.title}</Text>
          <View style={{ marginTop: space.tight }}>
            {group.rows.map((row, index) => (
              <View key={row.label} style={[styles.dataRow, index > 0 && styles.dataRowRuled]}>
                <Text style={styles.dataLabel}>{row.label}</Text>
                <Text style={styles.dataValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {services.length > 0 ? (
        <View>
          <Text style={styles.panelHead}>{servicesTitle}</Text>
          <View style={styles.servicePills}>
            {services.map((label) => (
              <Pill
                key={label}
                tone={{ bg: colour.leafSoft, fg: colour.forest }}
                style={styles.servicePill}
                textStyle={styles.serviceText}
              >
                {label}
              </Pill>
            ))}
          </View>
          {servicesText ? <Text style={styles.panelNote}>{servicesText}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function PhotosPanel({
  gallery,
  width,
  videoUrl,
  videoTitle,
  videoLink,
}: {
  gallery: OfferPicture[];
  width: number;
  videoUrl: string | null;
  videoTitle: string;
  videoLink: string;
}) {
  /** `aspect-4/3` on the gallery, as the site crops it. */
  const height = Math.round((width * 3) / 4);
  return (
    <View style={{ gap: space.cozy }}>
      {gallery.map((picture) => (
        <View key={picture.id}>
          <OfferImage
            url={picture.url}
            alt={picture.alt}
            seed={picture.id}
            width={width}
            height={height}
            priority="low"
            style={{ width: "100%", height }}
            corner={{ borderRadius: radius.card }}
          />
          {picture.caption ? <Text style={styles.caption}>{picture.caption}</Text> : null}
        </View>
      ))}

      {videoUrl ? (
        <View>
          <Text style={styles.panelHead}>{videoTitle}</Text>
          {/*
           * THE WEBSITE EMBEDS THIS AND THE APP MAY NOT. Its <ProjectVideo> puts a YouTube or Vimeo player in
           * an iframe, and an iframe in a native app is a WebView — which this app does not have and must not
           * get. So the app takes the branch the site itself takes for an address it cannot embed: a
           * `.btn .btn-secondary` that opens the video, in the owner's own words (`ui.offer.video_link`).
           * The platform's player is better at playing video than anything in this bundle would be.
           */}
          <Pressable
            onPress={() => void Linking.openURL(videoUrl)}
            accessibilityRole="link"
            style={({ pressed }) => [styles.secondary, pressed && { transform: [{ scale: 0.99 }] }]}
            android_ripple={null}
          >
            <Text style={styles.secondaryLabel}>{videoLink}</Text>
            <Text style={styles.secondaryMark}>↗</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function DocumentsPanel({ documents, note }: { documents: string[]; note: string }) {
  return (
    <View>
      <View style={styles.documentPills}>
        {documents.map((label) => (
          <Pill key={label} style={styles.documentPill} textStyle={styles.serviceText} ring tone={DOCUMENT_TONE}>
            {label}
          </Pill>
        ))}
      </View>
      {note ? <Text style={styles.panelNote}>{note}</Text> : null}
    </View>
  );
}

/** `.pill .pill-line` at the documents' own `px-3 py-1.5 text-sm`. */
const DOCUMENT_TONE = { bg: colour.surface, fg: colour.muted, ring: colour.line };

// ---------------------------------------------------------------------------------------------------------
// The three states before the offer is there
// ---------------------------------------------------------------------------------------------------------

function Waiting({ config }: { config: AppConfig }) {
  return (
    <View style={[styles.ground, styles.centre]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator color={colour.forest} />
      <Text style={[type.caption, styles.centred]}>{t(config, "ui.common.loading")}</Text>
    </View>
  );
}

/** public/offline.html's own three sentences — see the note on the catalogue screen's `<Offline>`. */
function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={[styles.ground, styles.centre]}>
      <Stack.Screen options={{ headerShown: false }} />
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

function Missing({ text, label, onBack }: { text: string; label: string; onBack: () => void }) {
  return (
    <View style={[styles.ground, styles.centre]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={[type.body, styles.centred, { color: colour.muted }]}>{text}</Text>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        style={({ pressed }) => [styles.retry, pressed && { transform: [{ scale: 0.99 }] }]}
        android_ripple={null}
      >
        <Text style={[type.button, { color: colour.paper }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------

/** `text-end`: the reading END edge, which is the physical LEFT in Arabic. */
const END_ALIGN = isRTL() ? "left" : "right";

const styles = StyleSheet.create({
  /** `bg-surface min-h-dvh`: WHITE, not the site's cream — this screen is one sheet, not cards on paper. */
  ground: { flex: 1, backgroundColor: colour.surface },
  scroll: { flexGrow: 1 },
  sheet: { width: "100%", maxWidth: frame.maxWidth, alignSelf: "center" },
  centre: { alignItems: "center", justifyContent: "center", paddingHorizontal: space.roomy, gap: space.tight },
  centred: { textAlign: "center" },

  /** `flex items-center justify-between px-4 py-2`. */
  bar: {
    ...readingRow(),
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: frame.gutter,
    paddingBottom: space.tight,
  },
  /** `size-9 rounded-full` — 36px, which is a 44pt target with the hitSlop. */
  control: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },

  /** `pill absolute end-4 top-4` — no ring on this one, exactly as the site writes it here. */
  statusPill: { position: "absolute" },

  /** `absolute inset-x-0 bottom-3 flex justify-center gap-1.5`. */
  dots: {
    ...readingRow(),
    position: "absolute",
    left: 0,
    right: 0,
    bottom: space.snug,
    justifyContent: "center",
    gap: 6,
  },
  dot: { height: 6, borderRadius: radius.pill },
  dotOn: { width: 16, backgroundColor: colour.paper },
  dotOff: { width: 6, backgroundColor: alpha(colour.paper, 0.6) },

  /** `px-4 pb-5 pt-4 font-sans`. */
  head: { paddingHorizontal: frame.gutter, paddingTop: space.cozy, paddingBottom: space.card },
  /** `mt-1.5 flex items-center gap-1.5 text-[0.8rem] text-muted`. */
  placeRow: { ...readingRow(), alignItems: "center", gap: 6, marginTop: 6 },
  place: { flex: 1, fontSize: 12.8, lineHeight: 19.2 },

  /** `.card mt-3 flex items-center` — the four facts as one bar. */
  factsBar: { ...card, ...readingRow(), alignItems: "center", marginTop: space.snug },
  factsCell: { ...readingRow(), flex: 1, alignItems: "center" },
  /** `h-7 w-px flex-none bg-line`. */
  factsRule: { width: 1, height: 28, backgroundColor: colour.line },
  /** `flex-1 px-1 py-2 text-center`. */
  factsBody: { flex: 1, paddingHorizontal: space.hair, paddingVertical: space.tight },
  /** `text-[0.8125rem] font-bold leading-none text-ink`, tabular and never reversed. */
  factsValue: {
    fontSize: 13,
    lineHeight: 13,
    fontWeight: "700",
    color: colour.ink,
    textAlign: "center",
    writingDirection: "ltr",
    fontVariant: ["tabular-nums"],
  },
  /** `mt-1 text-[0.5625rem] leading-tight text-muted`. */
  factsLabel: { fontSize: 9, lineHeight: 11.25, color: colour.muted, textAlign: "center", marginTop: space.hair },

  /** `mt-1.5 flex flex-wrap gap-1.5`. */
  tags: { ...readingRow(), flexWrap: "wrap", gap: 6, marginTop: 6 },
  /** `px-2.5 py-1.5 text-[0.72rem] font-medium` on top of `.pill` — 0.72rem is 11.52, not 12. */
  tag: { paddingVertical: 6, paddingHorizontal: 10 },
  tagText: { fontSize: 11.52, fontWeight: "500" },

  /** `mt-4`. */
  priceBlock: { marginTop: space.cozy },
  /** `flex items-baseline gap-1.5`. */
  priceRow: { ...readingRow(), alignItems: "baseline", gap: 6 },
  priceSuffix: { fontSize: 12.8, lineHeight: 19.2, color: colour.muted, writingDirection: "rtl" },
  /** `text-sm leading-6 text-muted`. */
  pricePending: { fontSize: 14, lineHeight: 24, color: colour.muted, writingDirection: "rtl", textAlign: "right" },
  /** `mt-3 text-caption leading-6 text-muted`. */
  priceNote: {
    marginTop: space.snug,
    fontSize: 13.6,
    lineHeight: 24,
    color: colour.muted,
    writingDirection: "rtl",
    textAlign: "right",
  },

  /** `border-t border-line` around the set, `border-b border-line px-4 py-5 last:border-b-0` on each. */
  sections: { borderTopWidth: 1, borderTopColor: colour.line },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: colour.line,
    paddingHorizontal: frame.gutter,
    paddingVertical: space.card,
  },
  sectionLast: { borderBottomWidth: 0 },
  /** `mb-3 font-display text-lg font-bold text-forest`. */
  sectionHead: { marginBottom: space.snug },

  /** `text-[1.0625rem] font-bold text-forest` — a panel's own sub-head. */
  panelHead: { fontSize: 17, lineHeight: 22, fontWeight: "700", color: colour.forest, writingDirection: "rtl", textAlign: "right" },
  /** `text-sm font-semibold text-muted`. */
  subHead: { fontSize: 14, lineHeight: 21, fontWeight: "600", color: colour.muted, writingDirection: "rtl", textAlign: "right" },
  /** `leading-7 text-ink/80`, and `whitespace-pre-line` is what a React Native Text already does. */
  prose: { fontSize: 16, lineHeight: 28, color: alpha(colour.ink, 0.8), writingDirection: "rtl", textAlign: "right" },
  /** `mt-3 text-sm leading-6 text-muted`. */
  panelNote: { marginTop: space.snug, fontSize: 14, lineHeight: 24, color: colour.muted, writingDirection: "rtl", textAlign: "right" },
  /** `mt-1.5 text-sm leading-6 text-muted` under a gallery picture. */
  caption: { marginTop: 6, fontSize: 14, lineHeight: 24, color: colour.muted, writingDirection: "rtl", textAlign: "right" },

  /** `divide-y divide-line` with `flex items-baseline justify-between gap-4 py-2.5`. */
  dataRow: {
    ...readingRow(),
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.cozy,
    paddingVertical: 10,
  },
  dataRowRuled: { borderTopWidth: 1, borderTopColor: colour.line },
  dataLabel: { fontSize: 14, lineHeight: 21, color: colour.muted, writingDirection: "rtl" },
  dataValue: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: colour.ink, writingDirection: "rtl", textAlign: END_ALIGN, flexShrink: 1 },

  /** `mt-2 flex flex-wrap gap-2` of `.pill bg-leaf-soft text-sm text-forest`. */
  servicePills: { ...readingRow(), flexWrap: "wrap", gap: space.tight, marginTop: space.tight },
  servicePill: { paddingVertical: 4, paddingHorizontal: 10 },
  serviceText: { fontSize: 14, lineHeight: 17.5 },
  /** `flex flex-wrap gap-2` of `.pill .pill-line px-3 py-1.5 text-sm`. */
  documentPills: { ...readingRow(), flexWrap: "wrap", gap: space.tight },
  documentPill: { paddingVertical: 6, paddingHorizontal: 12 },

  /** `block overflow-hidden rounded-2xl border border-line` around the drawn sketch. */
  map: { borderRadius: radius.card, borderWidth: 1, borderColor: colour.line, overflow: "hidden" },
  /** `absolute inset-x-0 bottom-0 … bg-forest-700/85 py-2`. */
  mapCaption: {
    ...readingRow(),
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: space.tight,
    paddingVertical: space.tight,
    backgroundColor: alpha(colour.forest700, 0.85),
  },
  mapCaptionText: { fontSize: 13.6, lineHeight: 21.8, fontWeight: "600", color: colour.paper, writingDirection: "rtl" },

  /** `.btn .btn-secondary`: 3rem, the 12px control corner, a 1.5px line-strong border. */
  secondary: {
    ...readingRow(),
    marginTop: space.tight,
    minHeight: 48,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colour.lineStrong,
    backgroundColor: colour.surface,
    paddingHorizontal: space.card,
    alignItems: "center",
    justifyContent: "center",
    gap: space.tight,
    alignSelf: "flex-start",
  },
  secondaryLabel: { fontSize: 16, lineHeight: 19.2, fontWeight: "600", color: colour.forest, writingDirection: "rtl" },
  secondaryMark: { fontSize: 16, color: colour.forest },

  /** PRN-01, at the foot of the sheet. */
  legal: {
    paddingHorizontal: frame.gutter,
    paddingTop: space.card,
    paddingBottom: space.roomy,
    fontSize: 13.6,
    lineHeight: 21.8,
    color: colour.muted,
    writingDirection: "rtl",
    textAlign: "right",
  },

  /** `fixed inset-x-0 … border-t border-line bg-surface/95 px-4 py-3`. */
  door: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: colour.line,
    // The site blurs what passes under this bar (`backdrop-blur`). `expo-blur` is real on iOS and an
    // approximation on Android, and it is a dependency; at 95 % white over a white sheet the blur is
    // invisible anyway, so the bar is opaque and nothing is pretended. Said out loud rather than fudged.
    backgroundColor: colour.surface,
    paddingHorizontal: frame.gutter,
    paddingTop: space.snug,
  },
  /** `.btn .btn-primary min-h-12 w-full gap-2 rounded-2xl text-[0.95rem]` — the 16px corner, not `.btn`'s 12. */
  doorButton: {
    ...readingRow(),
    minHeight: 48,
    width: "100%",
    borderRadius: radius.card,
    backgroundColor: colour.forest,
    alignItems: "center",
    justifyContent: "center",
    gap: space.tight,
    // `.btn`'s own inline padding. It carries NO shadow on the site — the bar's top hairline is what
    // separates it from the sheet, and a shadow under a button inside a bordered bar is two edges.
    paddingHorizontal: space.card,
  },
  doorLabel: { fontSize: 15.2, lineHeight: 21.3, fontWeight: "600", color: colour.surface, writingDirection: "rtl" },

  formPage: { paddingHorizontal: frame.gutter, paddingTop: space.tight },

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
