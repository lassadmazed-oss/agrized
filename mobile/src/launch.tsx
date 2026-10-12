import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "./components";
import { colour, display, radius, space } from "./theme";

/**
 * The first screen, and the only one drawn before the owner's words have arrived.
 *
 * WHAT IT REPLACES AND WHY. The app used to drop straight onto the home screen's skeleton while the settings
 * were still being read, so the first thing a reader saw was ten grey blocks and a tab bar labelled
 * «site.tab_home» — `t()` printing a key's own name, which is right for a missing row and wrong for a pending
 * one. The owner photographed exactly that. A splash was supposed to cover it, and on a real build it does;
 * in Expo Go it does not, and «it does on the build you have not made yet» is not an answer.
 *
 * So the wait has a screen of its own, on every platform, and it is the brand rather than an apology: the
 * emblem settling into place over a soft bloom, the name under it, and one quiet line that says something is
 * still happening. Nothing here can print a key, because nothing here reads a setting — the only word on it
 * is the brand's own name, which is not the owner's to translate.
 *
 * REDUCED MOTION gets the same screen with everything already arrived. Not a different screen, not a blank
 * one: the same composition, still.
 */

const EMBLEM = require("../assets/agrized-emblem.webp");

/** Native driver on a phone; the web preview has no native animated module and would simply not move. */
const NATIVE = Platform.OS !== "web";

/**
 * How long the launch is held even when the configuration arrives sooner.
 *
 * Without it the screen is a FLASH on a fast connection — the emblem appears, and before it has finished
 * settling the home screen replaces it. A thing that appears and vanishes inside half a second reads as a
 * glitch, which is most of what «super ugly» was describing. 1800ms is the choreography below played once:
 * the rings open, the mark settles, the name arrives, and then the app does.
 */
export const LAUNCH_MIN_MS = 1800;

export function LaunchScreen({ fontsReady = true }: { fontsReady?: boolean }) {
  const still = useReduceMotion();

  const enter = useRef(new Animated.Value(still ? 1 : 0)).current;
  const word = useRef(new Animated.Value(still ? 1 : 0)).current;
  // Three rings, started one after another, so the ripple is continuous rather than a single pulse.
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) {
      enter.setValue(1);
      word.setValue(1);
      return;
    }

    /*
     * THE CHOREOGRAPHY, and why it is staged rather than simultaneous.
     *
     * Everything arriving at once is a single event the eye reads in one blink; arriving in order is a
     * sequence it watches. The mark settles first because it is the subject, the name follows because it
     * names what has arrived, and the rings keep going because they are the only part that means «still
     * working» — the other two have finished saying what they say.
     */
    const mark = Animated.timing(enter, {
      toValue: 1,
      duration: 820,
      // Overshoot, gently: the mark settles rather than stopping dead.
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: NATIVE,
    });
    const name = Animated.sequence([
      Animated.delay(520),
      Animated.timing(word, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
    ]);

    /*
     * Rings opening outward from behind the mark — growth rings, or water going into soil, which is the
     * right gesture for this business and the reason this is not the flat disc it replaces. Each one takes
     * 2.6s to travel and fade, and they are staggered by a third of that, so one is always on its way out
     * while the next is leaving.
     */
    const ripple = (value: Animated.Value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: 2600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: NATIVE,
        }),
      );
    const r1 = ripple(ring1);
    const r2 = ripple(ring2);
    const r3 = ripple(ring3);

    mark.start();
    name.start();
    r1.start();
    const t2 = setTimeout(() => r2.start(), 870);
    const t3 = setTimeout(() => r3.start(), 1740);

    return () => {
      mark.stop();
      name.stop();
      r1.stop();
      r2.stop();
      r3.stop();
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [enter, ring1, ring2, ring3, still, word]);

  const markScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const wordFade = word;
  const wordRise = word.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  const ringStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.75, 2.2] }) }],
  });

  return (
    <View style={styles.page}>
      <View style={styles.centre}>
        <View style={styles.stage} accessible={false} importantForAccessibility="no-hide-descendants">
          {still ? null : (
            <>
              <Animated.View style={[styles.ring, ringStyle(ring1)]} />
              <Animated.View style={[styles.ring, ringStyle(ring2)]} />
              <Animated.View style={[styles.ring, ringStyle(ring3)]} />
            </>
          )}
          {/*
            NO CARD UNDER THE MARK. It used to sit on a white rounded tile, and while the asset was still
            decoding that tile was a conspicuous empty white box in the middle of the screen — the worst
            possible failure mode, because it looks like something broke rather than like something loading.
            On paper, a mark that has not arrived yet is simply not there, and the rings carry the moment.
            The home lockup already draws this emblem straight onto the same cream.
          */}
          <Animated.View style={{ opacity: enter, transform: [{ scale: markScale }] }}>
            <Image source={EMBLEM} alt="" accessible={false} contentFit="contain" style={styles.emblem} />
          </Animated.View>
        </View>

        {/*
          THE WORD IS ABSOLUTE, so it does not push the mark off centre.
          Laid out in the flow it added its own height to the group, and `justifyContent: center` then centred
          MARK + WORD together — which puts the mark above the middle of the screen and the word below it, and
          reads as «not centred» because nothing is. Hanging it under a centred stage leaves the mark exactly
          in the middle, where the eye expects it.

          IT ALSO WAITS FOR ITS FONT. «AgriZed» is set in Markazi, which arrives with the other five faces;
          before it does, the system face stands in and the word visibly changes shape the moment it lands —
          the «weird effect on text» he saw. Nothing is drawn until the font can draw it properly.
        */}
        {fontsReady ? (
          <Animated.Text
            style={[styles.word, { opacity: wordFade, transform: [{ translateY: wordRise }] }]}
            accessibilityRole="header"
          >
            AgriZed
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A launch that did not finish.
 *
 * It takes its sentence from the caller rather than reading a setting, because the whole reason this is on
 * screen is that the settings did not arrive — a failure screen that printed `ui.offer.form_error_network`
 * as a key name would be the fault announcing itself twice.
 */
export function LaunchFailure({ text, retryLabel, onRetry }: { text: string; retryLabel: string; onRetry: () => void }) {
  return (
    <View style={styles.page}>
      <View style={styles.centre}>
        <Image source={EMBLEM} alt="" accessible={false} contentFit="contain" style={styles.emblemQuiet} />
        <Text style={styles.failure}>{text}</Text>
        <Text accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          {retryLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colour.paper, alignItems: "center", justifyContent: "center" },
  centre: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: space.section },
  // A fixed stage so the rings have something to be centred in and the layout cannot shift as they grow.
  stage: { width: 240, height: 240, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: colour.leaf,
  },
  emblem: { width: 116, height: 116 },
  emblemQuiet: { width: 72, height: 72, opacity: 0.85 },
  // Hung under the centred stage rather than laid out after it — see the note at the call site.
  word: {
    ...display(700),
    position: "absolute",
    top: "50%",
    marginTop: 128,
    fontSize: 32,
    color: colour.forest,
    letterSpacing: 0.4,
  },
  failure: {
    marginTop: space.roomy,
    fontSize: 15,
    lineHeight: 26,
    color: colour.muted,
    textAlign: "center",
    writingDirection: "rtl",
  },
  retry: {
    marginTop: space.cozy,
    fontSize: 15,
    fontWeight: "600",
    color: colour.forest,
    textDecorationLine: "underline",
  },
});
