import { Tabs } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { moduleOpen, t } from "../../src/config";
import { colour, radius, readingRow, sans, shadow, space } from "../../src/theme";
import { useConfig } from "../../src/use-config";

/**
 * The phone's bottom bar — the website's, not an approximation of it.
 *
 * WHAT IT WAS. Four hard-coded tabs, «الرئيسية · العروض · احسب · اتصل بينا», marked with the characters
 * 🌿 ▦ ∑ ✉ on react-navigation's default bar, under a native header the site does not draw. Three of the four
 * words were wrong, «حسابي» was missing, «اتصل بينا» answers to no website screen at all, and the emoji were
 * the worst of it: an emoji is a different drawing on each platform and cannot take a colour, so the bar
 * could not be forest-and-muted the way the site's is.
 *
 * WHAT IT IS NOW, point by point from src/components/site/mobile/tab-bar.tsx and the layout above it.
 *
 *  · THE TAB SET IS THE FLAGS'. `src/app/[lang]/(public)/layout.tsx` builds it: «/» always, «/projects»
 *    while `projects` is public, «/start» while `interest_form` is public, «/land» while `land_offers` is,
 *    and «/zitounti» ALWAYS — the layout states that exception and its reason, which is that a door is not a
 *    feature: the sign-in exists whatever the زيتونتي flag says, and that flag decides only what a signed-in
 *    buyer then SEES. So the bar grows and shrinks with the modules instead of being a fixed four, and the
 *    rule the site writes down holds here too: only a tab that opens something is drawn.
 *
 *  · EVERY WORD IS A SETTING: site.tab_home, ui.shell.tab_offers, site.tab_calculator, site.tab_land,
 *    ui.shell.tab_account, and ui.shell.tabbar_aria for the bar's own name. These are the bar's OWN keys
 *    (0116), not the page titles they used to borrow, because a page title fits 70 pixels in Arabic and wraps
 *    in the other four languages.
 *
 *  · THE MARKS ARE THE SITE'S FIVE PATHS, verbatim: a 24px grid, `strokeWidth 2`, round caps and joins.
 *
 *  · THE CURRENT TAB IS MARKED BY GROUND, NOT BY HEIGHT: `bg-leaf-soft text-forest` on a `rounded-2xl`,
 *    `mx-1`, `min-h-15`, `gap-1.5`, with a 12px label that goes bold. The site argues the flatness at length
 *    and it is worth keeping: the simulator used to be a tile lifted above the bar, and «a bar whose shape
 *    depends on how many flags happen to be on is a bar that looks broken half the time».
 *
 * TWO PLACES THE APP MUST DO MORE THAN COPY, because a browser has no such problem.
 *
 *  · THE HOME INDICATOR AND THE GESTURE BAR. The site writes `pb-[max(0.5rem,env(safe-area-inset-bottom))]`.
 *    Here the bar's height is 60 (min-h-15) + 6 (pt-1.5) + max(8, insets.bottom), read from
 *    `useSafeAreaInsets` — so it clears an iPhone's indicator and Android's gesture bar, and it is right on a
 *    device with neither. The website's `--tabbar-h: 4.75rem` is NOT copied as a constant: the navigator owns
 *    this inset, and adding a fixed 76 on top of one it has already applied is the usual Android double-gap.
 *
 *  · THE SHADOW POINTS UP (`0 -6px 18px -12px`), which Android's `elevation` cannot do at all — it casts
 *    downward, always. `theme.ts`'s `shadow.bar` draws it with `boxShadow` where that exists and falls back
 *    to the 1px top hairline alone, which is honest: a bar with its shadow on the wrong side is worse than a
 *    bar with none.
 *
 * `Tabs` COMES FROM `expo-router/js-tabs`: the installed expo-router 57 marks the root `Tabs` export
 * deprecated in favour of that path, and the JS navigator is also the only one that takes a custom renderer —
 * `unstable-native-tabs` draws the platform's own bar, which cannot carry a leaf-soft pill behind the current
 * tab.
 */

type IconName = "home" | "offers" | "calculator" | "land" | "account";

/** tab-bar.tsx:40-73, path for path. */
function Icon({ name, color }: { name: IconName; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg viewBox="0 0 24 24" width={24} height={24} fill="none">
      {name === "home" ? (
        <>
          <Path d="M3 10.5 12 3l9 7.5" {...stroke} />
          <Path d="M5 9.8V21h14V9.8" {...stroke} />
        </>
      ) : null}
      {name === "offers" ? (
        <>
          <Rect x={3} y={3} width={7.5} height={7.5} rx={2} {...stroke} />
          <Rect x={13.5} y={3} width={7.5} height={7.5} rx={2} {...stroke} />
          <Rect x={3} y={13.5} width={7.5} height={7.5} rx={2} {...stroke} />
          <Rect x={13.5} y={13.5} width={7.5} height={7.5} rx={2} {...stroke} />
        </>
      ) : null}
      {name === "calculator" ? (
        <>
          <Rect x={4} y={2} width={16} height={20} rx={3} {...stroke} />
          <Path d="M8 6h8" {...stroke} />
          <Path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3" {...stroke} />
        </>
      ) : null}
      {name === "land" ? (
        <>
          <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" {...stroke} />
          <Circle cx={12} cy={10} r={2.8} {...stroke} />
        </>
      ) : null}
      {name === "account" ? (
        <>
          <Circle cx={12} cy={8} r={4} {...stroke} />
          <Path d="M4.5 21a7.5 7.5 0 0 1 15 0" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}

/**
 * One tab, as `tab-bar.tsx` draws its link.
 *
 * It replaces the navigator's own button rather than tinting it, because the site marks the current tab with
 * a GROUND and react-navigation's default button has no room to put one: the pill is `mx-1 min-h-15
 * rounded-2xl`, inside the bar's own padding, and the label and the icon sit centred in it with a 6px gap.
 */
function TabButton({
  name,
  label,
  current,
  onPress,
}: {
  name: IconName;
  label: string;
  current: boolean;
  onPress: () => void;
}) {
  const colourOf = current ? colour.forest : colour.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: current }}
      android_ripple={null}
      style={[styles.tab, current ? styles.tabCurrent : null]}
    >
      <Icon name={name} color={colourOf} />
      {/* `text-[0.75rem] leading-none`, in the site's own interface face. The weight is the only thing the
          state changes — and on native a weight IS a family, so it is asked for by name. */}
      <Text style={[styles.label, sans(current ? 700 : 500), { color: colourOf }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { config, ready } = useConfig();

  /**
   * The bar, in the site's order, built from the flags.
   *
   * WHILE THE CONFIG IS STILL BEING READ the two unconditional tabs are drawn and no more. The splash is held
   * until that read settles (app/_layout.tsx), so a reader does not normally see this state at all — but a
   * read that FAILED leaves every flag absent, `flagState` answers «disabled», and the honest result is an
   * app showing only the two doors that exist at every setting of every switch, rather than a calculator that
   * opens on nothing. It is the same answer the website gives when its own configuration cannot be read.
   */
  const tabs: { route: string; name: IconName; label: string }[] = [
    { route: "index", name: "home", label: t(config, "site.tab_home") },
    ...(ready && moduleOpen(config, "projects")
      ? [{ route: "offers", name: "offers" as IconName, label: t(config, "ui.shell.tab_offers") }]
      : []),
    ...(ready && moduleOpen(config, "interest_form")
      ? [{ route: "calculator", name: "calculator" as IconName, label: t(config, "site.tab_calculator") }]
      : []),
    /*
     * «أرضك» — the landowner's door. The site adds it while `land_offers` is public; that flag is `disabled`
     * today, and this app has no `app/(tabs)/land.tsx` to open. It is named here rather than forgotten: the
     * day the owner opens the module, this list needs one more entry and the screen beside it, and the bar
     * itself needs no change at all. Drawing it now would break the site's own rule — a tab that opens
     * nothing is worse than a tab that is missing, because the reader taps it and learns the app is a picture
     * of an app.
     */
    { route: "account", name: "account", label: t(config, "ui.shell.tab_account") },
  ];

  const barLabel = t(config, "ui.shell.tabbar_aria");
  // min-h-15 (60) + pt-1.5 (6) + the site's own pb-[max(0.5rem, safe-area-inset-bottom)].
  const bottom = Math.max(space.tight, insets.bottom);

  return (
    <Tabs
      screenOptions={{
        // The website draws no header on any phone screen; each one carries its own furniture.
        headerShown: false,
        sceneStyle: { backgroundColor: colour.paper },
      }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.bar, { paddingBottom: bottom }]}>
          {/* `<nav aria-label>` + `<ul>`: the bar is named once and each tab announces itself as a tab. */}
          <View accessibilityRole="tablist" accessibilityLabel={barLabel} style={styles.list}>
            {tabs.map((tab) => {
              const index = state.routes.findIndex((route) => route.name === tab.route);
              return (
                <View key={tab.route} style={{ flex: 1 }}>
                  <TabButton
                    name={tab.name}
                    label={tab.label}
                    current={index >= 0 && state.index === index}
                    onPress={() => navigation.navigate(tab.route)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      )}
    >
      {/*
        Every screen that exists is declared, whatever the flags say, because a route the navigator does not
        know about cannot be reached by a link either — and the home screen's own two doors push to the offers
        and the calculator. What the FLAGS decide is which of them the bar draws; a module the owner has
        closed therefore has no tab, exactly as on the site, and the sections that would have linked to it are
        gated on the same flag at their own call sites.
      */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="offers" />
      <Tabs.Screen name="calculator" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colour.surface,
    borderTopWidth: 1,
    borderTopColor: colour.line,
    paddingTop: 6,
    ...shadow.bar,
  },
  // `mx-auto flex max-w-lg items-stretch` — 512 wide at most, centred, every tab an equal share. The ROW is
  // in reading order, so «الرئيسية» sits at the right in Arabic and would mirror in the Latin languages.
  list: {
    ...readingRow(),
    alignItems: "stretch",
    maxWidth: 512,
    width: "100%",
    alignSelf: "center",
  },
  tab: {
    marginHorizontal: space.hair,
    minHeight: 60,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.card,
  },
  tabCurrent: { backgroundColor: colour.leafSoft },
  // text-[0.75rem] leading-none. The weight is the only thing that changes with the state.
  label: { fontSize: 12, lineHeight: 12, writingDirection: "rtl" },
});
