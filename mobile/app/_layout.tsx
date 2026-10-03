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
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colour, FONT } from "../src/theme";
import { ConfigProvider } from "../src/use-config";

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
 * SO THE SPLASH IS HELD, AND IT IS HELD UNTIL BOTH SETTLE — not until both SUCCEED. A phone loses signal in
 * a grove and a font asset can fail to decode; an app that never leaves its splash screen is worse than one
 * that opens and says what went wrong. `useFonts` returns an error rather than throwing, the config provider
 * reports a failure rather than rejecting, and either way the splash goes.
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

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts({
    [FONT.sans[400]]: IBMPlexSansArabic_400Regular,
    [FONT.sans[500]]: IBMPlexSansArabic_500Medium,
    [FONT.sans[600]]: IBMPlexSansArabic_600SemiBold,
    [FONT.sans[700]]: IBMPlexSansArabic_700Bold,
    [FONT.display[400]]: MarkaziText_400Regular,
    [FONT.display[700]]: MarkaziText_700Bold,
  });

  const configReady = useRef(false);
  const fontsSettled = fontsReady || fontError !== null;

  /**
   * The splash goes when the LAST of the two settles, whichever that is. It is a ref and not state because
   * nothing on the screen depends on which one arrived first, and a re-render for that would be a re-render
   * behind a splash nobody can see.
   */
  const hideWhenBothSettled = useCallback(() => {
    if (!configReady.current || !fontsSettled) return;
    void SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled]);

  const onConfigReady = useCallback(() => {
    configReady.current = true;
    hideWhenBothSettled();
  }, [hideWhenBothSettled]);

  useEffect(() => {
    hideWhenBothSettled();
  }, [hideWhenBothSettled]);

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
      <ConfigProvider onReady={onConfigReady}>
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
        </Stack>
      </ConfigProvider>
    </SafeAreaProvider>
  );
}
