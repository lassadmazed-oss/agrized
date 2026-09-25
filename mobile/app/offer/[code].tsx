import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Empty, Fact, Status, Waiting, treesLine } from "../../src/components";
import { area, count, IRRIGATION, money } from "../../src/format";
import { InterestForm } from "../../src/InterestForm";
import { useOffers } from "../../src/useOffers";
import { card, colour, space, type } from "../../src/theme";

/**
 * One offer, and the form to say you want it.
 *
 * IT READS FROM THE LIST IT CAME FROM rather than fetching itself. `public_projects` returns every open offer
 * in one call and the hook already holds them, so opening an offer is instant and works with no signal a
 * second after the list loaded — which is the difference between an app and a website on a phone. The price
 * is not re-fetched for the same reason the list does not lie: both came from the same call, seconds apart.
 *
 * THE PRICE IS «ابتداءً من», never «السوم». min_price_per_tree_millimes is the cheapest parcel in the offer;
 * saying it plainly is what stops a visitor arriving at the call believing every tree is that price.
 */
export default function OfferScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const navigation = useNavigation();
  const { offers, placeOf, loading, failed, reload } = useOffers();

  const offer = offers.find((row) => row.code === code);

  useEffect(() => {
    if (offer) navigation.setOptions({ title: offer.name });
  }, [navigation, offer]);

  if (loading) return <Waiting />;
  if (failed) return <Empty text="ما نجّمناش نجيبو العرض." onRetry={reload} />;
  if (!offer) return <Empty text="العرض هذا ما عادش موجود." />;

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Image
        source={offer.cover_url ?? undefined}
        accessibilityLabel={offer.cover_alt_ar ?? undefined}
        contentFit="cover"
        transition={200}
        style={styles.cover}
        placeholder={{ blurhash: "L6Ec00~qRj00_3WBofay00WB%MRj" }}
      />

      <View style={styles.head}>
        <Text style={type.title}>{offer.name}</Text>
        <Text style={[type.note, { marginTop: 2 }]}>
          {[placeOf(offer), offer.location_description].filter(Boolean).join(" · ")}
        </Text>
        <View style={{ marginTop: space.sm }}>
          <Status code={offer.production_status} />
        </View>
      </View>

      {offer.min_price_per_tree_millimes !== null ? (
        <View style={styles.price}>
          <Text style={type.caption}>ابتداءً من</Text>
          <Text style={styles.priceFigure}>{money(offer.min_price_per_tree_millimes)}</Text>
          <Text style={type.note}>للزيتونة الواحدة</Text>
        </View>
      ) : (
        <View style={styles.price}>
          <Text style={type.note}>السوم يُعلن لاحقاً — سجّل اهتمامك والفريق يعطيك السوم.</Text>
        </View>
      )}

      <View style={styles.facts}>
        <Fact label="عدد الزيتونات" value={treesLine(offer)} />
        <Fact label="المساحة لكل زيتونة" value={offer.area_per_tree_min_m2 ? area(offer.area_per_tree_min_m2) : null} />
        <Fact label="المساحة الجملية" value={offer.total_area_m2 ? area(offer.total_area_m2) : null} />
        <Fact label="الصنف" value={offer.olive_variety} />
        <Fact
          label="عمر الزياتين"
          value={offer.tree_age_years !== null ? `${count(offer.tree_age_years)} سنوات` : null}
        />
        <Fact label="الري" value={offer.irrigation ? (IRRIGATION[offer.irrigation] ?? offer.irrigation) : null} />
      </View>

      <InterestForm offerCode={offer.code} offerName={offer.name} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, paddingBottom: space.xxl },
  cover: { width: "100%", height: 210, borderRadius: 20, backgroundColor: colour.leafSoft },
  head: { marginTop: space.lg },
  price: {
    ...card,
    backgroundColor: colour.goldSoft,
    borderColor: colour.goldBright,
    padding: space.lg,
    marginTop: space.lg,
  },
  priceFigure: { fontSize: 28, fontWeight: "700", color: colour.forest, textAlign: "right", marginVertical: 2 },
  facts: {
    ...card,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    padding: space.lg,
    paddingBottom: 0,
    marginVertical: space.lg,
    gap: space.md,
  },
});
