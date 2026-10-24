import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useState } from "react";
import { Linking, Modal, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Button } from "./components";
import { settingInt, settingText, t } from "./config";
import { colour, alpha, radius, shadow, space, type } from "./theme";
import { decideUpdate, storeTargets } from "./update-logic";
import { useConfig } from "./use-config";

/**
 * «تحديث جديد متوفّر» — the notice that leads a person to the store, on this app's own page, to update.
 *
 * EVERYTHING IT SAYS OR COMPARES IS THE OWNER'S (migration 0153): the newest build in the store, the oldest build
 * still allowed, the store's address, and the five sentences. Nothing here knows a version number. The owner
 * publishes a build, types its number in الإعدادات ← تحديث التطبيق, and every older install shows the notice on its
 * next launch; until he does, both numbers are 0 and this renders nothing.
 *
 * TWO KINDS, AND ONLY ONE CAN BE CLOSED.
 *  · optional — the build is behind the newest. «لاحقاً» closes it and the choice is remembered FOR THAT BUILD,
 *    so it comes back when a newer one is published and not on every launch.
 *  · required — the build is behind the floor the owner set (a release that must not stay in use). The notice
 *    covers the app, there is no way past it but the store, and the Android back button does nothing.
 *
 * THE BUILD IT COMPARES IS THE ONE INSTALLED (`nativeBuildVersion`: Android's versionCode, iOS's build). Where it
 * cannot be read — Expo Go, the web — it is 0 and no notice is due, so a developer's session is never covered by
 * a notice about the store. It is also skipped in development for the same reason.
 */

const DISMISSED_KEY = "update.dismissed_build";

function installedBuild(): number {
  const raw = Application.nativeBuildVersion;
  const number = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(number) ? number : 0;
}

/** Tries Play's own app first, then the address as written. Resolves false when neither opened. */
async function openStore(storeUrl: string): Promise<boolean> {
  for (const target of storeTargets(storeUrl)) {
    try {
      await Linking.openURL(target);
      return true;
    } catch {
      // No app answers this address (a phone without Play): the next one is the https page.
    }
  }
  return false;
}

export function UpdatePrompt() {
  const { config, ready, failed } = useConfig();
  // null until the stored choice has been read, so a closed notice does not flash open for a frame.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const [couldNotOpen, setCouldNotOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(DISMISSED_KEY)
      .then((value) => {
        if (alive) setDismissed(value ? Number.parseInt(value, 10) || 0 : 0);
      })
      .catch(() => {
        if (alive) setDismissed(0);
      });
    return () => {
      alive = false;
    };
  }, []);

  const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : null;
  const storeUrl = platform ? settingText(config, `app.${platform}.store_url`) : "";

  const decision = useMemo(() => {
    if (!platform) return { kind: "none" as const, latest: 0 };
    return decideUpdate({
      installed: installedBuild(),
      latest: settingInt(config, `app.${platform}.latest_build`, 0),
      min: settingInt(config, `app.${platform}.min_build`, 0),
      storeUrl,
    });
  }, [config, platform, storeUrl]);

  // A sentence that did not arrive would print its own key name; a notice with no words is better left unshown.
  const worded = typeof config.settings["ui.app_update.title"] === "string";

  if (__DEV__ || !ready || failed || !worded || decision.kind === "none") return null;

  const required = decision.kind === "required";
  if (!required && (closed || dismissed === null || dismissed >= decision.latest)) return null;

  const later = () => {
    setClosed(true);
    SecureStore.setItemAsync(DISMISSED_KEY, String(decision.latest)).catch(() => {
      // Not remembering the choice only means it is asked again next launch.
    });
  };

  const update = async () => {
    setCouldNotOpen(!(await openStore(storeUrl)));
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // The back button closes a notice that may be closed, and does nothing to one that may not.
      onRequestClose={required ? () => {} : later}
    >
      <View style={[styles.backdrop, required ? styles.backdropSolid : null]}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 19V5M5 12l7-7 7 7"
                stroke={colour.forest}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>

          <Text style={[type.sheetTitle, styles.centred]}>{t(config, "ui.app_update.title")}</Text>
          <Text style={[type.body, styles.centred, styles.text]}>
            {t(config, required ? "ui.app_update.text_required" : "ui.app_update.text")}
          </Text>

          <View style={styles.actions}>
            <Button label={t(config, "ui.app_update.cta")} onPress={() => void update()} fullWidth />
            {required ? null : <Button label={t(config, "ui.app_update.later")} onPress={later} variant="ghost" fullWidth />}
          </View>

          {couldNotOpen ? (
            // The same sentence the app uses when it cannot reach the network: the store could not be opened either.
            <Text style={[type.error, styles.centred]}>{t(config, "ui.offer.form_error_network")}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.roomy,
    backgroundColor: alpha(colour.forest700, 0.55),
  },
  // A required update leaves nothing of the app showing through, or tappable around the edges.
  backdropSolid: { backgroundColor: colour.paper },
  card: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: space.snug,
    padding: space.roomy,
    borderRadius: radius.card,
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
    ...shadow.card,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colour.leafSoft,
  },
  centred: { textAlign: "center", alignSelf: "stretch" },
  text: { color: colour.muted },
  actions: { alignSelf: "stretch", gap: space.tight, marginTop: space.tight },
});
