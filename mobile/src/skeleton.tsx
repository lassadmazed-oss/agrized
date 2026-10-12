import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useReduceMotion } from "./components";
import { alpha, colour, fill, frame, isRTL, radius, space } from "./theme";

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

/**
 * ONE CLOCK FOR THE WHOLE SCREEN.
 *
 * Every block reads this single value, so a page of them sweeps as one movement instead of eight blocks
 * blinking on their own schedules. That difference is most of what separates a skeleton that looks designed
 * from one that looks broken — and it is why this is a module-level value rather than one per component.
 *
 * It is reference-counted: the loop starts when the first block appears and stops when the last goes, so
 * nothing is animating behind a screen nobody is looking at. `useNativeDriver` keeps the sweep on the UI
 * thread, so a slow settings read cannot make it stutter — which was the other half of the ugliness, since
 * the JS thread is busy with exactly that read while this is on screen.
 */
const sweep = new Animated.Value(0);
let watchers = 0;
let loop: Animated.CompositeAnimation | null = null;

function startSweep() {
  watchers += 1;
  if (loop) return;
  loop = Animated.loop(
    Animated.sequence([
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1150,
        // Ease in and out: a sweep at constant speed reads as a machine, and the pause at the end of each
        // pass is what stops it feeling frantic.
        easing: Easing.inOut(Easing.ease),
        /*
         * Native driver on a phone, JS driver on the web preview.
         *
         * react-native-web has no native animated module, so `true` there means the sweep silently does not
         * run — which is harmless for the product and useless for whoever is designing it, because the
         * preview then shows a still skeleton and says nothing is wrong. Measured: the transforms stayed at
         * the identity matrix across 350ms. On iOS and Android the native driver is the whole point, since
         * the JS thread is busy with the very settings read this is covering for.
         */
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.delay(320),
    ]),
  );
  loop.start();
}

function stopSweep() {
  watchers = Math.max(0, watchers - 1);
  if (watchers > 0 || !loop) return;
  loop.stop();
  loop = null;
  sweep.setValue(0);
}

/**
 * One block, with a light passing over it.
 *
 * WHAT THIS REPLACES. The first version pulsed opacity between 0.45 and 1 — every block fading in and out
 * where it stood. On one block that reads as «loading»; on eight it reads as a fault, and the owner called it
 * ugly, which it was. A highlight travelling across a still block is the shape the eye already knows, and it
 * says the same thing without anything blinking.
 *
 * IT SWEEPS IN THE READING DIRECTION. Right to left on an Arabic screen, because a highlight that enters
 * from the wrong side feels like it is going backwards even when nobody can say why.
 *
 * The width is measured rather than assumed: these blocks are mostly `flex: 1` inside rows, so their width
 * is not known until layout, and a gradient translated by a guessed distance either stops short or overshoots.
 */
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
  const [measured, setMeasured] = useState(0);

  useEffect(() => {
    if (still) return;
    startSweep();
    return stopSweep;
  }, [still]);

  const travel = measured * 1.6;
  const shift = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: isRTL() ? [travel, -travel] : [-travel, travel],
  });

  return (
    <View
      // Decorative by definition — it stands for content that does not exist yet, so there is nothing to read.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={[
        { width, height, borderRadius: corner, backgroundColor: colour.leafSoft, overflow: "hidden" },
        style,
      ]}
    >
      {still || measured === 0 ? null : (
        <Animated.View style={[fill, { transform: [{ translateX: shift }] }]}>
          <LinearGradient
            // Cream rather than white: the page is #f7f5ee, and a white highlight on a warm page reads as a
            // cold rectangle sliding about.
            colors={[alpha(colour.paper, 0), alpha(colour.paper, 0.85), alpha(colour.paper, 0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
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
