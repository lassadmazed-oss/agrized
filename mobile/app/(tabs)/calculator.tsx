import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button, Empty, Waiting } from "../../src/components";
import { area, count, money } from "../../src/format";
import { useOffers } from "../../src/useOffers";
import { card, colour, radius, space, type } from "../../src/theme";

const TIERS = [1, 25, 50, 100, 250, 500];

/**
 * احسب — how many trees, from which offer, and what that comes to.
 *
 * WHAT THIS IS AND IS NOT. The website's /start is a five-step simulator: tier, spacing, project type,
 * payment mode, down payment. It asks those five because it is also an intake — the answers travel to
 * /register and become a demand. Here the visitor has an offer in front of them with ONE published price per
 * tree, so four of those five questions have already been answered by the offer itself. Asking them again on
 * a phone would be a form pretending to be a calculator.
 *
 * SO IT MULTIPLIES, AND SAYS SO. Trees × the offer's price per tree, with the area that comes with them. It
 * is labelled a تقدير and it names the reason: the final figure is in the contract, not in an app. No
 * financing, no instalment plan, no monthly figure — those depend on markup tables the app has no business
 * copying, and a monthly payment invented on a phone is the one number nobody would forgive.
 */
export default function CalculatorScreen() {
  const router = useRouter();
  const { offers, placeOf, loading, failed, reload } = useOffers();

  const priced = useMemo(
    () => offers.filter((offer) => offer.min_price_per_tree_millimes !== null),
    [offers],
  );
  const [offerId, setOfferId] = useState<string | null>(null);
  const [trees, setTrees] = useState("25");

  if (loading) return <Waiting />;
  if (failed) return <Empty text="ما نجّمناش نجيبو العروض." onRetry={reload} />;
  if (priced.length === 0) {
    return (
      <Empty text="ما فماش عرض معلن سومو توّا. سجّل اهتمامك والفريق يعطيك السوم." />
    );
  }

  const offer = priced.find((row) => row.id === offerId) ?? priced[0];
  const perTree = offer.min_price_per_tree_millimes ?? 0;
  const wanted = Number(trees.replace(/[^0-9]/g, ""));
  const valid = Number.isInteger(wanted) && wanted > 0;
  const total = valid ? perTree * wanted : 0;
  const land = valid && offer.area_per_tree_min_m2 ? offer.area_per_tree_min_m2 * wanted : null;

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>قدّاش يجيك مشروعك؟</Text>
      <Text style={[type.note, { marginTop: 2, marginBottom: space.lg }]}>
        إختار العرض وعدد الزيتونات، ونحسبولك تقدير.
      </Text>

      <Text style={[type.caption, { marginBottom: space.sm }]}>العرض</Text>
      <View style={styles.row}>
        {priced.map((row) => {
          const on = row.id === offer.id;
          return (
            <Pressable
              key={row.id}
              onPress={() => setOfferId(row.id)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
            >
              <Text style={[type.caption, { fontWeight: "600", color: on ? colour.forest : colour.muted }]}>
                {row.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.caption, { marginTop: space.xs }]}>
        {[placeOf(offer), money(perTree) + " للزيتونة"].filter(Boolean).join(" · ")}
      </Text>

      <Text style={[type.caption, { marginTop: space.lg, marginBottom: space.sm }]}>عدد الزيتونات</Text>
      <View style={styles.row}>
        {TIERS.map((tier) => {
          const on = String(tier) === trees;
          return (
            <Pressable
              key={tier}
              onPress={() => setTrees(String(tier))}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
            >
              <Text style={[type.caption, { fontWeight: "600", color: on ? colour.forest : colour.muted }]}>
                {count(tier)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={trees}
        onChangeText={setTrees}
        keyboardType="number-pad"
        placeholder="ولا اكتب العدد"
        placeholderTextColor={colour.muted}
        style={styles.field}
        accessibilityLabel="عدد الزيتونات"
      />

      <View style={styles.result}>
        <Text style={type.caption}>تقدير أوّلي</Text>
        <Text style={styles.total}>{valid ? money(total) : "—"}</Text>
        <Text style={type.note}>
          {valid
            ? `${count(wanted)} زيتونة × ${money(perTree)}${land ? ` · الأرض ${area(land)}` : ""}`
            : "اكتب عدد صحيح."}
        </Text>
        <Text style={[type.caption, { marginTop: space.sm }]}>
          هذا تقدير حسب السوم المعلن. الرقم النهائي في بطاقة المشروع والعقد.
        </Text>
      </View>

      <Button label="سجّل اهتمامك بهذا العرض" onPress={() => router.push(`/offer/${offer.code}`)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: "row-reverse", flexWrap: "wrap", gap: space.sm },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colour.leafSoft, borderColor: colour.leaf },
  field: {
    ...card,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colour.ink,
    textAlign: "right",
    writingDirection: "rtl",
  },
  result: {
    ...card,
    backgroundColor: colour.goldSoft,
    borderColor: colour.goldBright,
    borderStyle: "dashed",
    padding: space.lg,
    marginVertical: space.lg,
  },
  total: { fontSize: 30, fontWeight: "700", color: colour.forest, textAlign: "right", marginVertical: 2 },
});
