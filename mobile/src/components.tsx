import { Image } from "expo-image";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { area, count, money, PRODUCTION } from "./format";
import type { Offer } from "./api";
import { card, colour, radius, space, type } from "./theme";

/** The screen's own title line, used where a native header would say too little. */
export function Title({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={type.title}>{children}</Text>
      {note ? <Text style={[type.note, { marginTop: 2 }]}>{note}</Text> : null}
    </View>
  );
}

/** One offer in a list: the photograph, the name, where it is, and what a tree costs. */
export function OfferCard({
  offer,
  place,
  onPress,
}: {
  offer: Offer;
  place: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={offer.name}
      style={({ pressed }) => [styles.offer, pressed && { opacity: 0.85 }]}
    >
      {/* `expo-image` and not the RN one: it caches to disk, so a list scrolled twice does not re-download
          nine photographs over a grove's worth of signal. */}
      <Image
        source={offer.cover_url ?? undefined}
        accessibilityLabel={offer.cover_alt_ar ?? undefined}
        contentFit="cover"
        transition={180}
        style={styles.offerImage}
        placeholder={{ blurhash: "L6Ec00~qRj00_3WBofay00WB%MRj" }}
      />
      <View style={{ padding: space.md }}>
        <Text style={type.heading} numberOfLines={1}>
          {offer.name}
        </Text>
        <Text style={[type.note, { marginTop: 2 }]} numberOfLines={1}>
          {[place, offer.area_per_tree_min_m2 ? area(offer.area_per_tree_min_m2) : null]
            .filter(Boolean)
            .join(" · ")}
        </Text>

        <View style={styles.offerFoot}>
          {offer.min_price_per_tree_millimes !== null ? (
            <>
              <Text style={styles.price}>{money(offer.min_price_per_tree_millimes)}</Text>
              <Text style={type.caption}>ابتداءً من · للزيتونة</Text>
            </>
          ) : (
            // The foot is drawn either way, so two cards side by side are the same height and the grid does
            // not read as half-loaded.
            <Text style={type.caption}>السوم يُعلن لاحقاً</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** A labelled fact, as the offer screen prints them. An empty one is not drawn at all. */
export function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.body, { fontWeight: "600" }]}>{value}</Text>
    </View>
  );
}

/** The green button. One shape for the one action a screen is asking for. */
export function Button({
  label,
  onPress,
  busy,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "primary" | "quiet";
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        tone === "primary" ? styles.buttonPrimary : styles.buttonQuiet,
        off && { opacity: 0.5 },
        pressed && !off && { transform: [{ scale: 0.99 }] },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tone === "primary" ? colour.surface : colour.forest} />
      ) : (
        <Text style={tone === "primary" ? styles.buttonPrimaryText : styles.buttonQuietText}>{label}</Text>
      )}
    </Pressable>
  );
}

/** What a screen shows while it has nothing yet — and what it shows when it never will. */
export function Waiting() {
  return (
    <View style={styles.centre}>
      <ActivityIndicator color={colour.forest} />
    </View>
  );
}

export function Empty({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={styles.centre}>
      <Text style={[type.note, { textAlign: "center" }]}>{text}</Text>
      {onRetry ? (
        <View style={{ marginTop: space.md }}>
          <Button label="عاود جرّب" onPress={onRetry} tone="quiet" />
        </View>
      ) : null}
    </View>
  );
}

/** The stat strip the home screen leads with. */
export function Figures({ items }: { items: { value: string; label: string }[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.figures}>
      {items.map((item, index) => (
        <View key={item.label} style={styles.figureCell}>
          {index > 0 ? <View style={styles.figureRule} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[type.figure, { textAlign: "center" }]}>{item.value}</Text>
            <Text style={[type.caption, { textAlign: "center", marginTop: 2 }]}>{item.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** «منتج» and the rest, as a small stated fact rather than a coloured dot nobody can read. */
export function Status({ code }: { code: string | null }) {
  if (!code) return null;
  const label = PRODUCTION[code] ?? code;
  return (
    <View style={styles.pill}>
      <Text style={[type.caption, { color: colour.forest, fontWeight: "600" }]}>{label}</Text>
    </View>
  );
}

export function treesLine(offer: Offer): string | null {
  return offer.tree_count !== null ? `${count(offer.tree_count)} زيتونة` : null;
}

const styles = StyleSheet.create({
  offer: { ...card, overflow: "hidden", marginBottom: space.md },
  offerImage: { width: "100%", height: 170, backgroundColor: colour.leafSoft },
  offerFoot: {
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colour.line,
    flexDirection: "row-reverse",
    alignItems: "baseline",
    gap: space.sm,
  },
  price: { fontSize: 17, fontWeight: "700", color: colour.gold },
  fact: {
    flexBasis: "47%",
    flexGrow: 1,
    marginBottom: space.md,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },
  buttonPrimary: { backgroundColor: colour.forest },
  buttonPrimaryText: { color: colour.surface, fontSize: 16, fontWeight: "700" },
  buttonQuiet: { backgroundColor: colour.surface, borderWidth: 1, borderColor: colour.lineStrong },
  buttonQuietText: { color: colour.forest, fontSize: 16, fontWeight: "700" },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  figures: { ...card, flexDirection: "row-reverse", paddingVertical: space.md },
  figureCell: { flex: 1, flexDirection: "row-reverse", alignItems: "center" },
  figureRule: { width: 1, height: 26, backgroundColor: colour.line },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: colour.leafSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
});
