/*
 * ONE WEIGHT PER IMPORT, FROM ITS OWN SUBPATH, and this is not a style preference.
 *
 * Importing from the package root pulls in that package's index, which re-exports every weight it ships —
 * and because each export is a `require` of a `.ttf`, the bundler then packs all of them. Measured: the root
 * imports put eleven font files in the Android bundle (Plex at 100 through 700, Markazi at 400 through 700),
 * about 1.5 MB of faces the app never asks for. These six subpaths bundle six files.
 */
import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_500Medium } from "@expo-google-fonts/ibm-plex-sans-arabic/500Medium";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic/700Bold";
import { MarkaziText_400Regular } from "@expo-google-fonts/markazi-text/400Regular";
import { MarkaziText_700Bold } from "@expo-google-fonts/markazi-text/700Bold";
import { useAssets } from "expo-asset";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { LogBox, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { settingText } from "../src/config";
import { colour, FONT } from "../src/theme";
import { AuthProvider } from "../src/auth";
import { LAUNCH_MIN_MS, LaunchFailure, LaunchScreen } from "../src/launch";
import { ConfigProvider, useConfig } from "../src/use-config";
import { configureNotifications, notificationsModule, routeForNotification } from "../src/push";

/**
 * The root. One stack, so a screen that is not a tab — an offer — slides in over the tabs and can be
 * dismissed by the platform's own back gesture rather than by a control we would have to draw.
 *
 * TWO THINGS THE FIRST FRAME WAITS FOR, AND WHY THE ARGUMENT AGAINST WAITING NO LONGER HOLDS.
 *
 * This file used to load no fonts and hold no splash, and it said why: both are places an app can hang on a
 * cold start, and the system's Arabic face is the one font guaranteed to be on the device. That was a sound
 * trade while the brief was «a native app». It cannot survive «every single detail matches the website's
 * phone design», because the website sets every headline, every section title, every card name, every price
 * and every counter figure in Markazi Text over IBM Plex Sans Arabic — and those are the three things a
 * reader actually looks at. A screen can be right to the pixel and still be a different product if the
 * letters are a different shape.
 *
 *  1 · THE TWO FACES. `theme.ts`'s `FONT` names the exact family per weight, because native has no such
 *      thing as asking a family for a weight — each weight is its own registered family. The keys below are
 *      those names, so every `sans(600)` and `display(700)` in the type scale resolves. Five faces: Plex at
 *      400/500/600/700 and Markazi at 400/700. The site loads Markazi with no weight array and lets the
 *      browser synthesise its bold; native synthetic bold for Arabic is unreliable on both platforms, so the
 *      real bold file is bundled instead.
 *
 *  2 · THE OWNER'S WORDS. Every label on every screen is a settings row, and `t()` prints a key's own name
 *      when the key is absent — right for a gap, wrong for a read still in flight. Nobody should see
 *      «site.tab_home» under a tab icon for half a second.
 *
 * SO THE FIRST FRAME IS HELD UNTIL BOTH SETTLE — not until both SUCCEED. A phone loses signal in a grove and a
 * font asset can fail to decode; an app that never leaves its launch screen is worse than one that opens and
 * says what went wrong. `useFonts` returns an error rather than throwing, the config provider reports a
 * failure rather than rejecting, and either way the launch screen goes.
 *
 * NO HEADER, ANYWHERE ON THE TABS. The website takes its own header off every phone screen (globals.css
 * reads `data-phone-screen` below 48rem) because the screen carries its own furniture: the home has the brand
 * lockup, the catalogue and the calculator have their own bars, and the tab bar carries the navigation. A
 * native header above all of that is a second header the design does not have.
 */

// Before the first render, so there is no frame between the splash deciding to go and the fonts arriving.
void SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or hidden by a fast reload. Not a failure worth a screen.
});

/** The longest the native splash is held, whatever the launch screen is doing. */
const SPLASH_CEILING_MS = 3000;

// Expo Go on Android says on every launch that it cannot do remote push. True, expected, and drawn as a yellow
// bar over the tab bar that swallows the first tap. A development-only filter: a real build never logs it.
if (__DEV__) LogBox.ignoreLogs(["[expo-notifications]"]);

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts({
    [FONT.sans[400]]: IBMPlexSansArabic_400Regular,
    [FONT.sans[500]]: IBMPlexSansArabic_500Medium,
    [FONT.sans[600]]: IBMPlexSansArabic_600SemiBold,
    [FONT.sans[700]]: IBMPlexSansArabic_700Bold,
    [FONT.display[400]]: MarkaziText_400Regular,
    [FONT.display[700]]: MarkaziText_700Bold,
  });

  /*
   * THE LAUNCH SCREEN'S OWN ARTWORK, waited for like the fonts.
   *
   * The emblem is the only thing that screen draws, and it was being asked for at the moment nothing is
   * cached — so for the first part of the animation the middle of the screen was empty and the rings opened
   * around nothing. Measured in the running app: the <img> was present with the right source and opacity 1,
   * `complete: false`, naturalWidth 0, 700ms in.
   *
   * `useAssets` returns an error rather than throwing, and an error counts as settled: a launch screen that
   * waits forever for a picture is worse than one that opens without it.
   */
  const [markAssets, markError] = useAssets([require("../assets/agrized-emblem.webp")]);
  const markSettled = Boolean(markAssets) || Boolean(markError);

  const fontsSettled = fontsReady || fontError !== null;

  /*
   * THE NATIVE SPLASH IS HIDDEN BY THE LAUNCH SCREEN, not here (src/launch.tsx: the moment its own mark is on
   * screen), and no longer waits for the configuration to arrive.
   *
   * It used to wait for the words, the faces and the emblem to ALL settle, through a callback handed to the
   * provider once. On a phone the read crosses the network and ends last, so it called the callback it had been
   * given at the start — one that still believed nothing else had arrived — and the splash never left; and even
   * when it did, the animation that was meant to be the entrance had played out underneath it while the
   * network was read. The launch screen continues the splash frame for frame (same cream, same mark, same
   * size), so handing over as soon as it is drawn is invisible, and the wait for the words happens on a
   * screen with something to look at.
   */

  /*
   * THE WAY OUT WHATEVER HAPPENS. The launch screen hides the splash once its mark is drawn, and a mark that
   * cannot be drawn is a promise a decoder can fail to keep. Past this the native splash goes regardless, and
   * what is underneath is the launch screen — better than a logo that never leaves.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, SPLASH_CEILING_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaProvider>
      {/*
        DARK CONTENT IN THE SYSTEM BAR, SET ONCE.
        Every screen in this app opens on `paper` or on white — the home's brand lockup and quote strip stand
        above the hero rather than under it, the offer screen and the account screen are white sheets — so the
        clock and the battery have to be dark on both platforms. The one screen that argues otherwise is the
        hero photograph, and it is NOT the top of the home screen: the lockup is. Setting this per screen
        would mean a bar that changes colour as the home scrolls, which is the sort of flicker that reads as a
        bug. `translucent` is left alone: `android.edgeToEdgeEnabled` is already true in app.json, and each
        screen clears the inset with `useSafeAreaInsets`.
      */}
      <StatusBar style="dark" />
      <ConfigProvider>
        {/*
          The buyer's session sits INSIDE the configuration and not outside it: restoring a session is a read
          from the Keychain and a refresh against Supabase, and neither is worth starting before the owner's
          words have arrived — the screen that would show the result cannot draw a label until they have.
        */}
        <AuthProvider>
          <Shell fontsReady={fontsSettled} markReady={markSettled} />
        </AuthProvider>
      </ConfigProvider>
    </SafeAreaProvider>
  );
}

/**
 * Everything under the provider, so it can ask whether the owner's words have arrived.
 *
 * IT HOLDS ON EVERY PLATFORM NOW, which is the fix for what the owner photographed. The splash above is
 * supposed to cover this wait and on a real build it does — but in Expo Go it does not, and the app dropped
 * straight onto the home screen's skeleton with every label printing its own key name and two tabs instead of
 * four, because an empty configuration means every feature flag reads as closed. A gate that only guards the
 * platform where the problem does not happen guards nothing.
 *
 * A FAILED READ GETS A SCREEN RATHER THAN A SHELL. use-config.tsx retries once; if it still cannot read, the
 * app says so and offers to try again instead of drawing a page of key names. That was always the stated
 * intent — the provider's own comment says the caller «shows the owner's network sentence instead of a shell
 * full of printed key names» — and no caller was doing it.
 */
/*
 * Set once, at module scope, before anything renders.
 *
 * The handler decides what happens to a notification that arrives while the app is open and in front. There
 * is no default: without this, such a notification is delivered to the code and shown to nobody, which reads
 * as «the push did not arrive» to everyone including whoever is testing it.
 */
configureNotifications();

/**
 * Opens the screen a tapped notification is about.
 *
 * TWO ROADS IN, because a notification is tapped in two quite different situations. A running app gets an
 * event — that is the listener. An app that was NOT running is launched by the tap, and by the time this
 * component mounts the event has already been and gone; `getLastNotificationResponseAsync` is the only way
 * to learn that is why the app is open at all. Handling just the first is the classic bug: notifications
 * work perfectly while you are testing, and do nothing from a cold start, which is how a real person taps.
 *
 * It renders nothing. It is mounted beside the navigator rather than inside the gate above, so the router
 * exists by the time it can be asked to go anywhere.
 */
function PushTaps() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const go = (data: unknown) => {
      if (cancelled) return;
      // `replace: false` — the tab the person was on stays underneath, so the back gesture behaves.
      router.push(routeForNotification(data) as never);
    };

    // Expo Go has no notifications module: nothing can have been tapped, and nothing to listen for.
    const Notifications = notificationsModule();
    if (!Notifications) return;

    // The cold start: the tap that opened the app.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) go(response.notification.request.content.data);
      })
      .catch(() => {
        // Nothing to route to is not a failure worth a screen; the app opens where it normally would.
      });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      go(response.notification.request.content.data);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router]);

  return null;
}

function Shell({ fontsReady, markReady }: { fontsReady: boolean; markReady: boolean }) {
  const { config, ready, failed, reload } = useConfig();

  /*
   * THE LAUNCH IS HELD FOR ITS OWN LENGTH, even when the configuration beats it.
   *
   * On a good connection the read finishes in a few hundred milliseconds, and the screen then appeared and
   * vanished before the mark had finished settling — a thing that flashes reads as a glitch, not as an
   * entrance, which is most of what «super ugly» was describing. So the gate waits for the LATER of the two:
   * the words arriving, and the animation having been allowed to play once.
   *
   * It is a floor and not a delay — a slow read is never made slower, and the hold is already over by the
   * time a slow read lands.
   */
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPlayed(true), LAUNCH_MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  /*
   * THE FONTS ARE PART OF «READY», which they were not before.
   *
   * The splash above waits for them, and in Expo Go the splash does not hold — so the app drew its screens in
   * the system face and every word changed shape the moment the five bundled faces landed. That flicker is
   * «this weird effect on text when entering the app»: nothing was moving, the letters were being redrawn.
   * Holding here until they have settled means the first words a reader sees are the right ones.
   */
  const holding = !ready || !played || !fontsReady || !markReady;

  /*
   * THE LAUNCH SCREEN DISSOLVES; IT IS NOT SWAPPED FOR THE APP. Swapping is one frame of a green-and-gold
   * entrance and the next of a paper-coloured list, which reads as a cut. Instead the app is mounted underneath
   * the moment it can be drawn and the launch screen, still on top, fades out over it; `onGone` takes it off
   * the tree once it is transparent so it costs nothing afterwards.
   */
  const [launchGone, setLaunchGone] = useState(false);

  if (failed && !holding) {
    /*
     * THE ONE SENTENCE IN THIS APP THAT CARRIES A FALLBACK IN CODE, and the exception proves the rule: it is
     * shown only when the owner's rows could not be read, so reading his row for it is the one thing that
     * cannot work. settingText returns the row when there is one — a retry may have landed the config since —
     * and this short Arabic when there is not.
     */
    return (
      <LaunchFailure
        text={settingText(config, "ui.offer.form_error_network", "ما نجّمناش نحمّلو التطبيق. تثبّت من الاتصال بالإنترنت.")}
        retryLabel={settingText(config, "ui.pages.error_retry", "عاود")}
        onRetry={reload}
      />
    );
  }

  return (
    <View style={styles.root}>
      {holding ? null : <PushTaps />}
      {holding ? null : (
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colour.paper },
          headerTintColor: colour.forest,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colour.paper },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/*
          NO NATIVE HEADER ANYWHERE, offer screen included. This line used to say the opposite — it set
          `title: "العرض"` and a `headerBackTitle`, and a comment beside it said the header was the only way
          out of that screen «until app/offer/[code].tsx draws its own controls». It does draw them: a 36px
          back and a 36px share over the photograph, exactly as offer-phone.tsx does, and it renders
          `<Stack.Screen options={{ headerShown: false }} />` in all four of its branches, which wins over
          whatever this navigator says. So the header was already gone, this line was dead, and its two
          Arabic words were dead copy the owner could not edit — the drift this run was sent to find, left
          behind by two sessions each assuming the other had not landed yet.

          It is spelled out rather than deleted because `name` is also what fixes the route's place in the
          stack, and because the next reader deserves the answer to «why has the offer screen no header?»
          here, where they will look for it: globals.css hides .site-header below 48rem, so no phone screen
          on the website has one either.
        */}
        <Stack.Screen name="offer/[code]" options={{ headerShown: false }} />
        {/* One route for the ten sections of فضاء «زيتونتي»; it draws its own bar, like the offer screen. */}
        <Stack.Screen name="zitounti/[section]" options={{ headerShown: false }} />
        {/* «وين وصل مطلبي؟» — no session, no account; it draws its own bar like the others. */}
        <Stack.Screen name="track" options={{ headerShown: false }} />
      </Stack>
      )}

      {launchGone ? null : (
        // Over everything, and out of the way of touches once the app is underneath it.
        <View style={StyleSheet.absoluteFill} pointerEvents={holding ? "auto" : "none"}>
          <LaunchScreen fontsReady={fontsReady} leaving={!holding} onGone={() => setLaunchGone(true)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colour.paper },
});
