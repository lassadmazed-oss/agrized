import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Empty, Waiting } from "../../src/components";
import { count, money } from "../../src/format";
import { fetchCopy, fetchHeroPhoto, fetchProgress, fetchServices, text, type Copy, type Progress } from "../../src/site";
import { colour, shadow, space } from "../../src/theme";
import { useOffers } from "../../src/useOffers";

/**
 * الرئيسية — the website's phone home, as a native screen (owner, 2026-09-24: «the app should match exactly
 * the mobile design of the website»).
 *
 * IT IS THE SAME COMPOSITION, IN THE SAME ORDER, with the same numbers behind it:
 *
 *   1 · the hero card — photograph, the badge, the promise, two doors, centred;
 *   2 · the figures, in ONE bar with hairlines, lifted onto the foot of the photograph;
 *   3 · the two entry cards — «إلقى العرض المناسب» in forest, «إكتشف العروض» in white;
 *   4 · the offers, two to a line, compact;
 *   5 · «وين وصلنا؟» — the four counted stages;
 *   6 · «إنت تستثمر، وإحنا نتلهاو» — the services, as chips.
 *
 * AND THE SAME WORDS. Every sentence is read from `public.settings` exactly as the browser reads it, with the
 * website's own defaults where no row exists (src/site.ts). The photograph is `home.hero`, the slot the site
 * spends on it. Nothing here is a second copy of the copy.
 *
 * WHAT IS DELIBERATELY DIFFERENT. The measurements are the website's phone values translated once — a
 * 1.75rem headline is 28px, `-mt-10` is -40, `mx-3` is 12 — not re-guessed. The quote strip is absent for the
 * reason the site now hides it on wide screens: it is the one element the owner asked to see less of, and an
 * app that opens on a proverb buries the offers it was installed for.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { offers, placeOf, loading, failed, reload } = useOffers();

  const [copy, setCopy] = useState<Copy>(new Map());
  const [hero, setHero] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [services, setServices] = useState<string[]>([]);

  useEffect(() => {
    void Promise.all([fetchCopy(), fetchHeroPhoto(), fetchProgress(), fetchServices()]).then(
      ([c, h, p, s]) => {
        setCopy(c);
        setHero(h);
        setProgress(p);
        setServices(s);
      },
    );
  }, []);

  if (loading && offers.length === 0) return <Waiting />;
  if (failed) return <Empty text="ما نجّمناش نجيبو العروض. تثبّت من الأنترنات." onRetry={reload} />;

  const from = text(copy, "start.from_prefix");

  // The four figures the phone home prints, in its order, dropping any the counter did not answer.
  const stats = [
    { value: progress?.treesRequested ?? null, label: text(copy, "site.tab_trees"), growing: true },
    { value: progress?.participants ?? null, label: text(copy, "site.stat_people"), growing: true },
    { value: offers.length || null, label: "عرض", growing: false },
  ].filter((stat): stat is { value: number; label: string; growing: boolean } => stat.value !== null);

  const stages = [
    { value: progress?.treesRequested, label: "مطلوبة" },
    { value: progress?.treesReserved, label: "محجوزة" },
    { value: progress?.treesContracted, label: "متعاقد عليها" },
    { value: progress?.treesPlanted, label: "مغروسة" },
  ].filter((row): row is { value: number; label: string } => typeof row.value === "number");

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colour.forest} />}
    >
      {/* 1 · The hero. The whole card is the primary door; the second door is its own control. */}
      <Pressable
        onPress={() => router.push("/offers")}
        accessibilityRole="button"
        style={styles.hero}
      >
        <Image source={hero ?? undefined} contentFit="cover" transition={220} style={StyleSheet.absoluteFill} />
        {/* The site's three layers: a foot dark enough for the words, and a ring closing the card. The side
            wash is `lg:` only on the web, so a phone does not get it here either. */}
        <LinearGradient
          colors={["rgba(22,56,33,0.10)", "rgba(22,56,33,0.50)", "rgba(22,56,33,0.94)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroRing} pointerEvents="none" />

        <View style={styles.heroBody}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🌿 {text(copy, "site.app_greeting_note")}</Text>
          </View>
          <Text style={styles.heroLine}>{text(copy, "site.app_hero_line")}</Text>
          <View style={styles.doors}>
            <Pressable onPress={() => router.push("/offers")} style={styles.doorPrimary} accessibilityRole="button">
              <Text style={styles.doorPrimaryText}>{text(copy, "site.app_hero_cta")} ←</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/calculator")} style={styles.doorGhost} accessibilityRole="button">
              <Text style={styles.doorGhostText}>{text(copy, "site.app_guide_cta")}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>

      {/* 2 · The figures, lifted onto the foot of the photograph. */}
      {stats.length > 0 ? (
        <View style={styles.figures}>
          {stats.map((stat, index) => (
            <View key={stat.label} style={styles.figureCell}>
              {index > 0 ? <View style={styles.hairline} /> : null}
              <View style={{ flex: 1, paddingVertical: 10 }}>
                <Text style={styles.figureValue}>
                  {stat.growing ? "+" : ""}
                  {count(stat.value)}
                </Text>
                <Text style={styles.figureLabel}>{stat.label}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* 3 · The split: two doors named by what the visitor already knows. */}
      <View style={styles.split}>
        <Pressable onPress={() => router.push("/calculator")} style={[styles.entry, styles.entryDark]} accessibilityRole="button">
          <View style={[styles.entryMark, { backgroundColor: "rgba(214,176,74,0.2)" }]}>
            <Text style={{ color: colour.goldBright, fontSize: 13 }}>⌕</Text>
          </View>
          <Text style={styles.entryTitleDark}>{text(copy, "site.app_guide_title")}</Text>
          <Text style={styles.entryNoteDark}>{text(copy, "site.app_guide_note")}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/offers")} style={[styles.entry, styles.entryLight]} accessibilityRole="button">
          <View style={[styles.entryMark, { backgroundColor: colour.goldSoft }]}>
            <Text style={{ color: colour.gold, fontSize: 13 }}>▦</Text>
          </View>
          <Text style={styles.entryTitle}>{text(copy, "site.app_pick_title")}</Text>
          <Text style={styles.entryNote}>{text(copy, "site.app_pick_note")}</Text>
        </Pressable>
      </View>

      {/* 4 · The offers, two to a line. */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{text(copy, "offers.title")}</Text>
        <Pressable onPress={() => router.push("/offers")} accessibilityRole="button">
          <Text style={styles.sectionAll}>{text(copy, "offers.filter_all")} ←</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {offers.slice(0, 4).map((offer) => (
          <Pressable
            key={offer.id}
            onPress={() => router.push(`/offer/${offer.code}`)}
            style={styles.tile}
            accessibilityRole="button"
            accessibilityLabel={offer.name}
          >
            <Image source={offer.cover_url ?? undefined} contentFit="cover" transition={180} style={styles.tileImage} />
            <View style={{ padding: space.sm }}>
              <Text style={styles.tileName} numberOfLines={1}>
                {offer.name}
              </Text>
              <View style={styles.tileFoot}>
                <Text style={styles.tilePlace} numberOfLines={1}>
                  {placeOf(offer)}
                </Text>
                {offer.min_price_per_tree_millimes !== null ? (
                  <Text style={styles.tilePrice}>
                    {money(offer.min_price_per_tree_millimes)}
                    <Text style={styles.tileFrom}> {from}</Text>
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        ))}
      </View>

      {/* 5 · «وين وصلنا؟» */}
      {stages.length > 0 ? (
        <View style={styles.band}>
          <Text style={styles.bandTitle}>{text(copy, "million.title")}</Text>
          <View style={styles.bandGrid}>
            {stages.map((stage) => (
              <View key={stage.label} style={styles.bandCell}>
                <Text style={styles.bandValue}>{count(stage.value)}</Text>
                <Text style={styles.bandLabel}>{stage.label}</Text>
              </View>
            ))}
          </View>
          {progress?.participants ? (
            <Text style={styles.bandNote}>
              {count(progress.participants)} مشارك · {count(progress.projectsUnderStudy ?? 0)} مشروع قيد الدراسة
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* 6 · «إنت تستثمر، وإحنا نتلهاو» */}
      {services.length > 0 ? (
        <View style={styles.services}>
          <Text style={styles.servicesTitle}>{text(copy, "site.services_title")}</Text>
          <Text style={styles.servicesText}>{text(copy, "site.services_text")}</Text>
          <View style={styles.chips}>
            {services.map((service) => (
              <View key={service} style={styles.chip}>
                <Text style={styles.chipText}>{service}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.servicesNote}>{text(copy, "site.services_note")}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const rtl = { writingDirection: "rtl", textAlign: "right" } as const;

const styles = StyleSheet.create({
  // px-4 pb-6 pt-3, as the site's phone column
  page: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },

  // rounded-3xl, min-h-[13rem]
  hero: { borderRadius: 24, overflow: "hidden", minHeight: 208, justifyContent: "flex-end", ...shadow.card },
  heroRing: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  // p-4 pb-14, centred
  heroBody: { padding: 16, paddingBottom: 56, alignItems: "center" },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  badgeText: { color: colour.paper, fontSize: 11, fontWeight: "500", writingDirection: "rtl" },
  // text-[1.75rem] leading-[1.15]
  heroLine: {
    color: colour.surface,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700",
    textAlign: "center",
    writingDirection: "rtl",
    textShadowColor: "rgba(0,0,0,0.28)",
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 2 },
  },
  doors: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 },
  // min-h-11 rounded-full px-4
  doorPrimary: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colour.surface,
    paddingHorizontal: 16,
    ...shadow.card,
  },
  doorPrimaryText: { color: colour.ink, fontSize: 14, fontWeight: "600" },
  doorGhost: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    paddingHorizontal: 16,
  },
  doorGhostText: { color: colour.surface, fontSize: 14, fontWeight: "600" },

  // card -mt-10 mx-3
  figures: {
    backgroundColor: colour.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colour.line,
    flexDirection: "row-reverse",
    marginTop: -40,
    marginHorizontal: 12,
    ...shadow.float,
  },
  figureCell: { flex: 1, flexDirection: "row-reverse", alignItems: "center" },
  hairline: { width: 1, height: 28, backgroundColor: colour.line },
  figureValue: { fontSize: 18, fontWeight: "700", color: colour.forest, textAlign: "center" },
  figureLabel: { fontSize: 10, color: colour.muted, textAlign: "center", marginTop: 4 },

  // mt-4 grid-cols-2 gap-2
  split: { flexDirection: "row-reverse", gap: 8, marginTop: 16 },
  entry: { flex: 1, borderRadius: 16, padding: 12, gap: 6 },
  entryDark: { backgroundColor: colour.forest700 },
  entryLight: { backgroundColor: colour.surface, borderWidth: 1, borderColor: colour.line },
  entryMark: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  entryTitle: { fontSize: 13, fontWeight: "600", color: colour.ink, ...rtl },
  entryNote: { fontSize: 10, lineHeight: 14, color: colour.muted, ...rtl },
  entryTitleDark: { fontSize: 13, fontWeight: "600", color: colour.paper, ...rtl },
  entryNoteDark: { fontSize: 10, lineHeight: 14, color: "rgba(247,245,238,0.7)", ...rtl },

  sectionHead: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "space-between", marginTop: 20 },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: colour.forest, ...rtl },
  sectionAll: { fontSize: 12, fontWeight: "600", color: colour.forest },

  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 8 },
  tile: {
    width: "48%",
    backgroundColor: colour.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colour.line,
    overflow: "hidden",
  },
  tileImage: { width: "100%", height: 112, backgroundColor: colour.leafSoft },
  tileName: { fontSize: 12, fontWeight: "600", color: colour.ink, ...rtl },
  tileFoot: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "space-between", marginTop: 4, gap: 4 },
  tilePlace: { fontSize: 10, color: colour.muted, flexShrink: 1 },
  tilePrice: { fontSize: 14, fontWeight: "700", color: colour.gold },
  tileFrom: { fontSize: 8, fontWeight: "400", color: colour.muted },

  band: { backgroundColor: colour.forest700, borderRadius: 24, padding: 16, marginTop: 20 },
  bandTitle: { fontSize: 18, fontWeight: "700", color: colour.surface, ...rtl },
  bandGrid: { flexDirection: "row-reverse", flexWrap: "wrap", marginTop: 12 },
  bandCell: { width: "50%", paddingVertical: 8 },
  bandValue: { fontSize: 22, fontWeight: "700", color: colour.goldBright, textAlign: "right" },
  bandLabel: { fontSize: 11, color: "rgba(247,245,238,0.75)", ...rtl },
  bandNote: { fontSize: 11, color: "rgba(247,245,238,0.75)", marginTop: 8, ...rtl },

  services: { backgroundColor: colour.goldSoft, borderRadius: 24, padding: 16, marginTop: 16 },
  servicesTitle: { fontSize: 17, fontWeight: "700", color: colour.forest, ...rtl },
  servicesText: { fontSize: 13, lineHeight: 20, color: colour.muted, marginTop: 4, ...rtl },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 12 },
  chip: { backgroundColor: colour.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 11, color: colour.forest, fontWeight: "600" },
  servicesNote: { fontSize: 10, color: colour.muted, marginTop: 10, ...rtl },
});
