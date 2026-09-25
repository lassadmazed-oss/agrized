import { Tabs } from "expo-router";
import { Text } from "react-native";

import { colour } from "../../src/theme";

/**
 * Four tabs, in the order the visitor's question arrives in: what is on offer, what it would cost me, and how
 * I say I am interested.
 *
 * WHY NO ICON SET. Pulling in an icon font for four tabs costs a megabyte and a loading state on a cold start,
 * and every candidate glyph for «احسب» is a calculator that looks like a spreadsheet. A tab here is its Arabic
 * word, which is unambiguous, needs no legend, and is the only label that is already in the device's font.
 * The mark above it is drawn with text — a leaf, a grid, a sum — which costs nothing.
 */
function Glyph({ mark, focused }: { mark: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 17, color: focused ? colour.forest : colour.muted }} allowFontScaling={false}>
      {mark}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colour.paper },
        headerTintColor: colour.forest,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colour.paper },
        tabBarActiveTintColor: colour.forest,
        tabBarInactiveTintColor: colour.muted,
        tabBarStyle: { backgroundColor: colour.surface, borderTopColor: colour.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "الرئيسية",
          headerTitle: "AgriZed",
          tabBarIcon: ({ focused }) => <Glyph mark="🌿" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="offers"
        options={{
          title: "العروض",
          tabBarIcon: ({ focused }) => <Glyph mark="▦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: "احسب",
          headerTitle: "احسب مشروعك",
          tabBarIcon: ({ focused }) => <Glyph mark="∑" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="contact"
        options={{
          title: "اتصل بينا",
          headerTitle: "سجّل اهتمامك",
          tabBarIcon: ({ focused }) => <Glyph mark="✉" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
