import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

import { useReduceMotion } from "./components";
import { colour, display, space } from "./theme";

/**
 * The first screen, and the only one drawn before the owner's words have arrived.
 *
 * WHAT IT REPLACES AND WHY. The app used to drop straight onto the home screen's skeleton while the settings
 * were still being read, so the first thing a reader saw was ten grey blocks and a tab bar labelled
 * «site.tab_home» — `t()` printing a key's own name, which is right for a missing row and wrong for a pending
 * one. The owner photographed exactly that. So the wait has a screen of its own, on every platform, and it is
 * the brand rather than an apology. Nothing here can print a key, because nothing here reads a setting — the
 * only word on it is the brand's own name, which is not the owner's to translate.
 *
 * ── THE SCREEN IS A CONTINUATION OF THE NATIVE SPLASH, NOT A SECOND SCREEN ──────────────────────────────────
 *
 * The system draws the splash before any JavaScript exists: the emblem, centred, on #FFFFFA. This screen's first
 * frame is that same picture — the same cream, the same emblem, the same size, in the same place — so the
 * hand-over is invisible, and the splash is hidden only once this emblem is really on screen (`onDisplay`).
 * Hiding it earlier shows a blank cream frame, and a mark that blinks off and on reads as a fault.
 *
 * Everything after that first frame is addition, and all of it is cheap: the picture of the grove fades in
 * behind the mark and settles from a slow zoom; the mark rises a little to make room for the name; the name
 * arrives; a gold line draws under it and then breathes for as long as the app is still reading. Only opacity
 * and transforms move, all on the native driver, so none of it can drop a frame on the JS thread that is busy
 * starting the app.
 *
 * THE PICTURE IS 36 KB and is not waited for. It is decoration: if it has not arrived the screen is the cream
 * and the mark, which is already a complete launch screen, and the photograph simply fades in when it can.
 * `scripts/launch-bg.mjs` records how it was made and what is baked into it.
 *
 * REDUCED MOTION gets the same screen with everything already arrived. Not a different screen, not a blank
 * one: the same composition, still.
 */

const EMBLEM = require("../assets/agrized-emblem.webp");
const BACKDROP = require("../assets/launch-bg.webp");

/** Native driver on a phone; the web preview has no native animated module and would simply not move. */
const NATIVE = Platform.OS !== "web";

/**
 * How long the launch is held even when the configuration arrives sooner.
 *
 * Without it the screen is a FLASH on a fast connection — the mark appears, and before the picture has
 * finished settling the home screen replaces it. 1400ms is the choreography below played once; a slow read is
 * never made slower, and the hold is already over by the time a slow read lands.
 */
export const LAUNCH_MIN_MS = 1400;

/**
 * app.json's splash `backgroundColor`. It is not the app's `colour.paper` (#f7f5ee) on purpose: the native
 * splash is drawn in #FFFFFA, and a launch screen in any other cream would shift tone at the hand-over.
 */
const SPLASH_PAPER = "#FFFFFA";

/**
 * The emblem at the size the native splash draws it: `imageWidth` 180 in app.json, times the 0.7 coverage
 * `scripts/brand-icons.mjs` leaves inside splash-icon.png. The emblem file is 512 × 500.
 */
const EMBLEM_WIDTH = 126;
const EMBLEM_HEIGHT = Math.round((EMBLEM_WIDTH * 500) / 512);

/** How far the mark rises to make room for the name. */
const LIFT = 18;

export function LaunchScreen({
  fontsReady = true,
  leaving = false,
  onGone,
}: {
  fontsReady?: boolean;
  /** True once the app is ready: the screen dissolves, then says so through `onGone`. */
  leaving?: boolean;
  onGone?: () => void;
}) {
  const still = useReduceMotion();

  const photo = useRef(new Animated.Value(still ? 1 : 0)).current;
  const drift = useRef(new Animated.Value(still ? 1 : 0)).current;
  const lift = useRef(new Animated.Value(still ? 1 : 0)).current;
  const word = useRef(new Animated.Value(still ? 1 : 0)).current;
  const rule = useRef(new Animated.Value(still ? 1 : 0)).current;
  /** The line's breathing while the app is still reading — the only part that means «still working». */
  const breath = useRef(new Animated.Value(1)).current;
  const exit = useRef(new Animated.Value(1)).current;
  const photoStarted = useRef(false);

  /** The grove fades in and settles. Called once, when the picture is decoded or when waiting for it ends. */
  const revealPhoto = useCallback(() => {
    if (photoStarted.current || still) return;
    photoStarted.current = true;
    Animated.parallel([
      Animated.timing(photo, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(drift, { toValue: 1, duration: 2600, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
    ]).start();
  }, [drift, photo, still]);

  /** The native splash goes the moment the mark is really drawn here. */
  const hideNativeSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (still) {
      for (const value of [photo, drift, lift, word, rule]) value.setValue(1);
      return;
    }

    /*
     * THE CHOREOGRAPHY, and why it is staged rather than simultaneous. Everything arriving at once is a single
     * event the eye reads in one blink; arriving in order is a sequence it watches. The picture comes first
     * because it sets the mood, the mark rises because it is the subject, the name follows because it names
     * what has arrived, and the line is last because it is the only part that keeps going.
     */
    const ease = Easing.out(Easing.cubic);
    const steps = [
      Animated.timing(lift, { toValue: 1, duration: 700, delay: 250, easing: ease, useNativeDriver: NATIVE }),
      Animated.timing(word, { toValue: 1, duration: 600, delay: 450, easing: ease, useNativeDriver: NATIVE }),
      Animated.timing(rule, { toValue: 1, duration: 520, delay: 850, easing: ease, useNativeDriver: NATIVE }),
    ];
    for (const step of steps) step.start();

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(breath, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    const startBreathing = setTimeout(() => breathe.start(), 1400);
    // If the picture never reports (a cached decode can skip it), the screen still gets its background.
    const fallback = setTimeout(revealPhoto, 900);

    return () => {
      for (const step of steps) step.stop();
      breathe.stop();
      clearTimeout(startBreathing);
      clearTimeout(fallback);
    };
  }, [breath, drift, lift, photo, revealPhoto, rule, still, word]);

  useEffect(() => {
    if (!leaving) return;
    const out = Animated.timing(exit, {
      toValue: 0,
      duration: still ? 160 : 380,
      easing: Easing.in(Easing.quad),
      useNativeDriver: NATIVE,
    });
    out.start(({ finished }) => {
      if (finished) onGone?.();
    });
    return () => out.stop();
  }, [exit, leaving, onGone, still]);

  const backdropScale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] });
  const markRise = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT] });
  const wordRise = word.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <Animated.View style={[styles.page, { opacity: exit }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: photo, transform: [{ scale: backdropScale }] }]}>
        <Image
          source={BACKDROP}
          alt=""
          accessible={false}
          contentFit="cover"
          transition={null}
          cachePolicy="memory"
          style={StyleSheet.absoluteFill}
          onLoad={revealPhoto}
        />
      </Animated.View>

      <View style={styles.centre} accessible={false} importantForAccessibility="no-hide-descendants">
        <Animated.View style={{ transform: [{ translateY: markRise }] }}>
          <Image
            source={EMBLEM}
            alt=""
            accessible={false}
            contentFit="contain"
            transition={null}
            style={styles.emblem}
            onDisplay={hideNativeSplash}
          />
        </Animated.View>

        {/*
          THE NAME AND THE LINE ARE ABSOLUTE, so they do not push the mark off centre. Laid out in the flow they
          added their own height to the group, and `justifyContent: center` then centred MARK + NAME together —
          which puts the mark above the middle of the screen, where the native splash did not.

          THE NAME WAITS FOR ITS FONT. «AgriZed» is set in Markazi, which arrives with the other five faces;
          before it does, the system face stands in and the word visibly changes shape the moment it lands.
          Nothing is drawn until the font can draw it properly.
        */}
        {fontsReady ? (
          <Animated.Text
            style={[styles.word, { opacity: word, transform: [{ translateY: wordRise }] }]}
            accessibilityRole="header"
          >
            AgriZed
          </Animated.Text>
        ) : null}
        <Animated.View style={[styles.rule, { opacity: Animated.multiply(rule, breath), transform: [{ scaleX: rule }] }]} />
      </View>
    </Animated.View>
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
    <View style={styles.failurePage}>
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
  page: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SPLASH_PAPER },
  failurePage: { flex: 1, backgroundColor: colour.paper, alignItems: "center", justifyContent: "center" },
  centre: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: space.section },
  emblem: { width: EMBLEM_WIDTH, height: EMBLEM_HEIGHT },
  emblemQuiet: { width: 72, height: 72, opacity: 0.85 },
  // Hung under the centred mark rather than laid out after it — see the note at the call site. The mark ends
  // LIFT above where it starts, so the name sits one gap below its final position, not its first.
  word: {
    ...display(700),
    position: "absolute",
    top: "50%",
    marginTop: EMBLEM_HEIGHT / 2 - LIFT + 18,
    fontSize: 34,
    color: colour.forest,
    letterSpacing: 0.4,
  },
  rule: {
    position: "absolute",
    top: "50%",
    marginTop: EMBLEM_HEIGHT / 2 - LIFT + 18 + 52,
    width: 56,
    height: 2,
    borderRadius: 1,
    backgroundColor: colour.gold,
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
