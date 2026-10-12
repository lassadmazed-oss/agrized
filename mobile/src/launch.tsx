import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "./components";
import { alpha, colour, display, radius, space } from "./theme";

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

export function LaunchScreen() {
  const still = useReduceMotion();

  // One value drives the entrance: the bloom, the emblem's scale and the fade all read from it, so they
  // cannot drift apart the way three separate timings would.
  const enter = useRef(new Animated.Value(still ? 1 : 0)).current;
  // A separate, slower loop for the line underneath — the only thing that keeps moving once the entrance
  // has finished, because a screen that goes completely still reads as frozen rather than as waiting.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) {
      enter.setValue(1);
      return;
    }
    const entrance = Animated.timing(enter, {
      toValue: 1,
      duration: 620,
      // Slight overshoot: the emblem settles rather than stops, which is the difference between a logo that
      // arrives and one that is simply switched on.
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: NATIVE,
    });
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE }),
      ]),
    );
    entrance.start();
    breathing.start();
    return () => {
      entrance.stop();
      breathing.stop();
    };
  }, [enter, pulse, still]);

  const emblemScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const bloomScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const bloomFade = enter.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.9, 0.55] });
  const wordFade = enter.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  const lineFade = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.8] });

  return (
    <View style={styles.page}>
      <View style={styles.centre}>
        {/* The bloom: a soft disc of the palette's quietest green, opening behind the mark. */}
        <Animated.View
          style={[styles.bloom, { opacity: bloomFade, transform: [{ scale: bloomScale }] }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
        <Animated.View style={{ opacity: enter, transform: [{ scale: emblemScale }] }}>
          <Image source={EMBLEM} alt="" accessible={false} contentFit="contain" style={styles.emblem} />
        </Animated.View>

        {/* The one word on this screen, and it is a name rather than copy — so it needs no settings row. */}
        <Animated.Text style={[styles.word, { opacity: wordFade }]} accessibilityRole="header">
          AgriZed
        </Animated.Text>

        {/* Something is still happening. One line, breathing — no percentage, because we do not have one and
            a made-up number is worse than none. */}
        <Animated.View style={[styles.line, { opacity: lineFade }]} accessible={false} />
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
  centre: { alignItems: "center", justifyContent: "center", paddingHorizontal: space.section },
  bloom: {
    position: "absolute",
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: alpha(colour.leafSoft, 0.9),
  },
  emblem: { width: 104, height: 104 },
  emblemQuiet: { width: 72, height: 72, opacity: 0.85 },
  word: { ...display(700), fontSize: 30, color: colour.forest, marginTop: space.cozy, letterSpacing: 0.4 },
  line: {
    marginTop: space.roomy,
    width: 56,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colour.leaf,
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
