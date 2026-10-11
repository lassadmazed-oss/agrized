import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useReduceMotion } from "./components";
import { colour, frame, radius, space } from "./theme";

/**
 * What a screen shows before it has anything, and how what it has arrives.
 *
 * THE PROBLEM THIS REPLACES. The home screen used to wait behind a centred spinner and then swap the whole
 * page in at once. Two things are wrong with that and they are different things. A spinner says «something is
 * happening» and nothing else — it does not say a hero is coming, or four figures, or two cards — so the
 * screen that follows it arrives as a surprise, and a surprise the size of a whole page reads as a glitch
 * rather than as an arrival. And it moves: a spinner is motion in the middle of a page that is about to be
 * full of still content, which draws the eye to exactly the spot nothing will be.
 *
 * So: blocks in the shape of the thing that is coming. The hero's rectangle is the hero's rectangle, the
 * figures bar has four cells because there are four figures, the two door cards are two cards side by side.
 * Nothing moves except a slow breath of opacity, and when the real content lands it fades over the top of
 * shapes it already matches, so the eye has nothing to re-find.
 *
 * REDUCED MOTION IS HONOURED, and it is not a special case bolted on: `useReduceMotion` already governs the
 * disclosure marker and the quote strip, and a reader who asked the system for less movement did not ask for
 * less movement only in the places that were convenient. For them the blocks are simply flat.
 *
 * THESE ARE NOT «GREY BOXES». They are `leafSoft` on `paper` — the palette's own quietest pair — because a
 * grey skeleton on a warm page is the one thing that would look like a different app for the half second it
 * is on screen.
 */

/** One breathing block. Width is a number or a percentage string, as a RN style takes either. */
export function Shimmer({
  width,
  height,
  corner = radius.control,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  corner?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const still = useReduceMotion();
  const breath = useRef(new Animated.Value(still ? 0.7 : 0.45)).current;

  useEffect(() => {
    if (still) {
      breath.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 760, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0.45, duration: 760, useNativeDriver: true }),
      ]),
    );
    loop.start();
    // Stopping on unmount matters: a looping animation left running on a screen that has gone keeps the JS
    // thread awake, and on a list of skeletons that is one timer per block.
    return () => loop.stop();
  }, [breath, still]);

  return (
    <Animated.View
      // Decorative by definition — it stands for content that does not exist yet, so there is nothing to read.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: corner, backgroundColor: colour.leafSoft, opacity: breath }, style]}
    />
  );
}

/**
 * Content arriving, rather than appearing.
 *
 * 220ms is the shortest fade that still reads as a fade rather than as a cut; below about 150 the eye records
 * the change as instantaneous and the skeleton may as well not have been there. It never animates position:
 * the skeleton already put everything where it belongs, and sliding content into place it was already
 * standing in would be movement for its own sake.
 */
export function FadeIn({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const still = useReduceMotion();
  const shown = useRef(new Animated.Value(still ? 1 : 0)).current;

  useEffect(() => {
    if (still) {
      shown.setValue(1);
      return;
    }
    const fade = Animated.timing(shown, { toValue: 1, duration: 220, useNativeDriver: true });
    fade.start();
    return () => fade.stop();
  }, [shown, still]);

  return <Animated.View style={[{ flex: 1, opacity: shown }, style]}>{children}</Animated.View>;
}

/**
 * The home screen's own shape, before it has its words or its pictures.
 *
 * Every measurement here is taken from the real screen rather than guessed, so the fade lands on top of
 * itself: the hero is the hero's height, the figures bar sits over the hero's bottom edge the way the real
 * one does, and the two door cards are the real pair. Where the real screen is uncertain — how many offers
 * there are — it shows two, which is the fewest that still reads as a row.
 */
export function HomeSkeleton() {
  return (
    <View style={styles.page} accessible={false} importantForAccessibility="no-hide-descendants">
      {/* The quote strip: two cards the reader swipes between. */}
      <View style={styles.row}>
        <Shimmer height={92} corner={radius.card} style={styles.flex} />
        <Shimmer height={92} corner={radius.card} style={styles.flexNarrow} />
      </View>

      {/* The hero, and the figures bar that overlaps its lower edge. */}
      <Shimmer height={232} corner={radius.hero} style={styles.hero} />
      <View style={styles.figures}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.figure}>
            <Shimmer height={18} width="62%" corner={radius.mark} />
            <Shimmer height={11} width="80%" corner={radius.mark} style={styles.figureNote} />
          </View>
        ))}
      </View>

      {/* The two doors. */}
      <View style={styles.row}>
        <Shimmer height={116} corner={radius.card} style={styles.flex} />
        <Shimmer height={116} corner={radius.card} style={styles.flex} />
      </View>

      {/* «عروضنا», then the first two cards of the strip. */}
      <View style={styles.heading}>
        <Shimmer height={18} width={96} corner={radius.mark} />
        <Shimmer height={13} width={52} corner={radius.mark} />
      </View>
      <View style={styles.row}>
        <Shimmer height={168} corner={radius.card} style={styles.flex} />
        <Shimmer height={168} corner={radius.card} style={styles.flex} />
      </View>
    </View>
  );
}

/**
 * The hold before the first screen — on the web build only, and that limit is the whole point.
 *
 * Native has a real splash screen: app/_layout.tsx holds it until the fonts and the owner's words have both
 * settled, so nothing half-loaded is ever on screen. The web build has no such thing. It mounts the shell
 * immediately, and for the second or two that `readSettings()` spends paging through a thousand-odd rows,
 * every label on it is `t()` printing a key's own name — «site.app_hero_line» across the hero, «site.tab_home»
 * under a tab. That is correct behaviour for a missing key and a terrible first impression for a pending one,
 * and it is exactly what the owner saw and called «text that looks like code».
 *
 * So on web the same wait is held here instead, showing the shape of the home screen. On native this renders
 * its children immediately and the splash does its job, unchanged.
 */
export function ConfigGate({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  if (Platform.OS !== "web" || ready) return <>{children}</>;
  return (
    <View style={styles.gate}>
      <HomeSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: frame.maxWidth,
    alignSelf: "center",
    paddingHorizontal: frame.gutter,
    paddingTop: frame.top + 44, // clears the brand lockup the real screen draws above this point
    gap: space.snug,
  },
  gate: { flex: 1, backgroundColor: colour.paper },
  row: { flexDirection: "row", gap: space.snug },
  flex: { flex: 1 },
  flexNarrow: { flex: 0.62 },
  hero: { marginTop: space.hair },
  figures: {
    flexDirection: "row",
    backgroundColor: colour.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    marginTop: -36, // the real bar overlaps the hero's bottom edge by this much
    marginHorizontal: space.snug,
    paddingVertical: space.snug,
  },
  figure: { flex: 1, alignItems: "center", gap: space.hair },
  figureNote: { marginTop: 2 },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: space.cozy,
  },
});
