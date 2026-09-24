import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Empty, Figures, OfferCard, Waiting } from "../../src/components";
import { count, money } from "../../src/format";
import { useOffers } from "../../src/useOffers";
import { colour, space, type } from "../../src/theme";

/**
 * الرئيسية — the promise, what is true about the business, and the way in.
 *
 * WHAT IT DOES NOT DO is reproduce the website's home page. That page has a photographic hero, a counter
 * band, a services card and a FAQ, because a visitor who lands on it from a search has to be told what this
 * company is before anything else. Somebody who has INSTALLED the app has already been told; what they open
 * it for is the offers. So the home is one sentence, the figures that are actually counted, and the three
 * newest offers with a door to the rest.
 *
 * EVERY FIGURE HERE IS DERIVED FROM THE ROWS ON SCREEN — how many offers are open, what the cheapest tree
 * costs — rather than fetched from the statistics module. A number the visitor can check against the list
 * underneath it cannot go stale or contradict it.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { offers, placeOf, loading, failed, reload } = useOffers();

  if (loading) return <Waiting />;
  if (failed) return <Empty text="ما نجّمناش نجيبو العروض. تثبّت من الأنترنات." onRetry={reload} />;

  const priced = offers
    .map((offer) => offer.min_price_per_tree_millimes)
    .filter((value): value is number => value !== null);
  const cheapest = priced.length > 0 ? Math.min(...priced) : null;
  const trees = offers.reduce((sum, offer) => sum + (offer.tree_count ?? 0), 0);

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.heroBadge}>نحو مستقبل أكثر خضرة</Text>
        <Text style={styles.heroLine}>زيتونتك اليوم… أصل لعمر كامل.</Text>
        <Text style={styles.heroNote}>
          إختار زيتونتك من ضيعة حقيقية، وإحنا نتلهاو بيها. كل زيتونة أصل باسمك.
        </Text>
        <View style={{ marginTop: space.lg }}>
          <Button label="شوف العروض" onPress={() => router.push("/offers")} />
        </View>
      </View>

      <Figures
        items={[
          { value: count(offers.length), label: "عرض مفتوح" },
          ...(trees > 0 ? [{ value: count(trees), label: "زيتونة" }] : []),
          ...(cheapest !== null ? [{ value: money(cheapest), label: "أرخص زيتونة" }] : []),
        ]}
      />

      <View style={styles.section}>
        <Text style={type.title}>عروضنا</Text>
        <Text style={[type.note, { marginTop: 2, marginBottom: space.md }]}>
          {offers.length > 0 ? "أحدث العروض المفتوحة" : "ما فماش عروض مفتوحة توّا."}
        </Text>

        {offers.slice(0, 3).map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            place={placeOf(offer)}
            onPress={() => router.push(`/offer/${offer.code}`)}
          />
        ))}

        {offers.length > 3 ? (
          <Button label={`شوف الكل (${count(offers.length)})`} onPress={() => router.push("/offers")} tone="quiet" />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, paddingBottom: space.xxl },
  hero: {
    backgroundColor: colour.forest,
    borderRadius: 24,
    padding: space.xl,
  },
  heroBadge: {
    alignSelf: "flex-start",
    color: colour.goldBright,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: space.sm,
    writingDirection: "rtl",
  },
  heroLine: {
    color: colour.surface,
    fontSize: 27,
    lineHeight: 36,
    fontWeight: "700",
    writingDirection: "rtl",
    textAlign: "right",
  },
  heroNote: {
    color: "#d9e4d5",
    fontSize: 14,
    lineHeight: 22,
    marginTop: space.sm,
    writingDirection: "rtl",
    textAlign: "right",
  },
  section: { marginTop: space.xl },
});
