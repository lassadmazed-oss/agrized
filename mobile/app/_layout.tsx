import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colour } from "../src/theme";

/**
 * The root. One stack, so a screen that is not a tab — an offer — slides in over the tabs and can be
 * dismissed by the platform's own back gesture rather than by a control we would have to draw.
 *
 * There is no splash logic and no font loading here on purpose: both are places an app can hang on a cold
 * start, and neither buys anything a stranger would notice. The first screen is the offers, drawn with the
 * system's Arabic face, which is the one font guaranteed to be on the device already.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* The bars are dark-on-light everywhere: every screen in this app stands on `paper`. */}
      <StatusBar style="dark" />
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
        <Stack.Screen name="offer/[code]" options={{ title: "العرض", headerBackTitle: "رجوع" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
