import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Empty, OfferCard, Waiting } from "../../src/components";
import { useOffers } from "../../src/useOffers";
import { colour, radius, space, type } from "../../src/theme";

/**
 * العروض — every open offer, filtered by where it is.
 *
 * A FlatList and not a ScrollView: this grows with the business, and a ScrollView mounts every row and every
 * photograph at once. The filter is a strip of places built from the offers themselves, so it can never offer
 * a governorate that has nothing in it — a filter that returns an empty list is a filter that should not have
 * been drawn.
 *
 * PULL TO REFRESH is the one gesture this screen owes its reader: stock moves when somebody buys, and the
 * habit of pulling a list down to ask again is older than this app.
 */
export default function OffersScreen() {
  const router = useRouter();
  const { offers, placeOf, loading, failed, reload } = useOffers();
  const [place, setPlace] = useState<string>("");

  const places = useMemo(() => {
    const names = new Set<string>();
    for (const offer of offers) {
      const name = placeOf(offer);
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "ar"));
  }, [offers, placeOf]);

  const shown = place ? offers.filter((offer) => placeOf(offer) === place) : offers;

  if (loading && offers.length === 0) return <Waiting />;
  if (failed) return <Empty text="ما نجّمناش نجيبو العروض. تثبّت من الأنترنات." onRetry={reload} />;

  return (
    <FlatList
      data={shown}
      keyExtractor={(offer) => offer.id}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colour.forest} />}
      ListHeaderComponent={
        places.length > 1 ? (
          <View style={styles.filters}>
            <Chip label="الكل" on={place === ""} onPress={() => setPlace("")} />
            {places.map((name) => (
              <Chip key={name} label={name} on={place === name} onPress={() => setPlace(name)} />
            ))}
          </View>
        ) : null
      }
      ListEmptyComponent={<Empty text="ما فماش عروض في البلاصة هذي." />}
      renderItem={({ item }) => (
        <OfferCard
          offer={item}
          place={placeOf(item)}
          onPress={() => router.push(`/offer/${item.code}`)}
        />
      )}
    />
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button">
      <Text style={[type.caption, { fontWeight: "600", color: on ? colour.forest : colour.muted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, paddingBottom: space.xxl },
  filters: { flexDirection: "row-reverse", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colour.leafSoft, borderColor: colour.leaf },
});
