import { Stack, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { siteUrl } from "../src/api";
import { settingText, t } from "../src/config";
import { siteFormat } from "../src/format";
import { card, colour, frame, ltr, radius, space, type } from "../src/theme";
import { BackArrow, Btn, ErrorText, Field, Hint, Label } from "../src/ui";
import { useConfig } from "../src/use-config";

/**
 * «وين وصل مطلبي؟» — the narrow door for somebody who sent a demand and has no account.
 *
 * WHY IT EXISTS IN THE APP AT ALL. The intake ends by handing a visitor a request number
 * (AGZ-2026-000045) and a text message, and until now that number opened nothing here: the only way to learn
 * what had happened was to ring the office. A number a product gives you and then cannot read back is not a
 * reference, it is a receipt for a promise. The website's own page says exactly this; the app had no
 * equivalent.
 *
 * IT IS DELIBERATELY NOT THE SIGN-IN. فضاء «زيتونتي» is the buyer's own room and is the better answer for
 * anybody who has one. This is for everybody else: no account, no session, nothing remembered, and nothing
 * shown but where one demand stands.
 *
 * ONE SENTENCE FOR THREE FAILURES, and it is the database's doing rather than this screen's: a wrong number,
 * a wrong phone, and a real pair that do not belong together all answer `not_found`. Three answers would
 * make this form two oracles.
 */

type Spine = { rank: number; key: string; label: string; reached: boolean; current: boolean; fact_ar: string; has_fact: boolean };
type Found = {
  request_no: string;
  created_at: string | null;
  offer_name: string | null;
  trees: number | null;
  stage: { rank?: number; label?: string } | null;
  spine: Spine[];
};
type Failure = "not_found" | "too_many" | "missing_fields" | "not_applied" | "error" | "offline";

const FAILURE_KEY: Record<Failure, string> = {
  not_found: "ui.track.error_not_found",
  too_many: "ui.track.error_too_many",
  missing_fields: "ui.track.error_missing_fields",
  not_applied: "ui.track.error_not_applied",
  error: "ui.track.error_unavailable",
  offline: "ui.offer.form_error_network",
};

export default function TrackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { config } = useConfig();
  const fmt = useMemo(() => siteFormat(config), [config]);

  const [requestNo, setRequestNo] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [found, setFound] = useState<Found | null>(null);

  const helpPhone = settingText(config, "site.contact_phone");

  const submit = useCallback(async () => {
    if (busy) return;
    setFailure(null);
    if (!requestNo.trim() || !phone.trim()) {
      setFailure("missing_fields");
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${siteUrl}/api/mobile/track`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ requestNo: requestNo.trim(), phone: phone.trim() }),
        signal: controller.signal,
      });
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (json.ok === true && typeof json.request_no === "string") {
        setFound(json as unknown as Found);
      } else {
        const reason = typeof json.reason === "string" ? json.reason : "error";
        setFailure((FAILURE_KEY as Record<string, string>)[reason] ? (reason as Failure) : "error");
      }
    } catch {
      setFailure("offline");
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }, [busy, phone, requestNo]);

  const again = useCallback(() => {
    setFound(null);
    setFailure(null);
    setRequestNo("");
    setPhone("");
  }, []);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.bar, { paddingTop: insets.top + space.tight }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" style={styles.back}>
          <BackArrow size={22} color={colour.forest} />
        </Pressable>
        <Text style={[type.heading, styles.barTitle]} numberOfLines={1}>
          {t(config, "track.title")}
        </Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: space.section + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {found ? (
          <>
            <View style={styles.card}>
              {/* AGZ-2026-000045 is Latin letters and digits: read left to right on an Arabic screen too. */}
              <Text style={[type.pageTitle, styles.ref]}>{found.request_no}</Text>
              {found.created_at ? (
                <Text style={styles.note}>{t(config, "ui.track.created_on", { date: fmt.date(found.created_at) })}</Text>
              ) : null}
              {found.offer_name ? <Text style={[type.body, styles.offer]}>{found.offer_name}</Text> : null}
              {found.trees !== null ? (
                <Text style={styles.note}>{t(config, "ui.track.trees_count", { count: found.trees })}</Text>
              ) : null}
            </View>

            {/*
              The path. Every stage the demand walks, in the owner's own words, with the one it has reached
              marked — the same spine the Back Office draws, because it IS the same spine: the database
              decides which stages are reached and this screen only draws them.
            */}
            <View style={styles.card}>
              <Text style={[type.heading, styles.pathHead]}>{t(config, "ui.track.path_label")}</Text>
              {found.spine.map((stage) => (
                <View key={stage.key} style={styles.stage}>
                  <View style={[styles.bullet, stage.reached ? styles.bulletOn : null, stage.current ? styles.bulletNow : null]} />
                  <View style={styles.stageBody}>
                    <Text style={[type.body, stage.reached ? styles.stageOn : styles.stageOff]}>{stage.label}</Text>
                    {stage.current ? (
                      <Text style={styles.marker}>{t(config, "ui.track.current_marker")}</Text>
                    ) : null}
                    {stage.reached && stage.has_fact && stage.fact_ar ? (
                      <Text style={styles.fact}>{stage.fact_ar}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>

            <Btn label={t(config, "ui.track.track_another")} onPress={again} tone="secondary" style={styles.wide} />
            {helpPhone ? (
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(`tel:${helpPhone.replace(/[^0-9+]/g, "")}`)}
                style={styles.help}
              >
                {t(config, "ui.track.question_call", { phone: helpPhone })}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[type.label, styles.intro]}>{t(config, "track.intro")}</Text>

            <View style={styles.card}>
              <View style={styles.group}>
                <Label>{t(config, "track.request_label")}</Label>
                {/* The reference is Latin letters and digits read left to right, whatever the page's direction. */}
                <Field value={requestNo} onChangeText={setRequestNo} ltr maxLength={40} autoComplete="off" />
                <Hint>{t(config, "track.request_hint")}</Hint>
              </View>

              <View style={styles.group}>
                <Label>{t(config, "track.phone_label")}</Label>
                <Field value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" ltr maxLength={20} />
                <Hint>{t(config, "track.phone_hint")}</Hint>
              </View>

              {failure ? <ErrorText>{t(config, FAILURE_KEY[failure])}</ErrorText> : null}

              <Btn
                label={busy ? t(config, "ui.track.searching") : t(config, "track.submit_label")}
                onPress={() => void submit()}
                busy={busy}
                minHeight={52}
                style={styles.wide}
              />
            </View>

            {helpPhone ? (
              <Text
                accessibilityRole="link"
                onPress={() => void Linking.openURL(`tel:${helpPhone.replace(/[^0-9+]/g, "")}`)}
                style={styles.help}
              >
                {t(config, "ui.track.lost_number_call", { phone: helpPhone })}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colour.paper },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: frame.gutter,
    paddingBottom: space.snug,
    gap: space.tight,
  },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  barTitle: { flex: 1, textAlign: "center", color: colour.forest700 },
  body: {
    paddingHorizontal: frame.gutter,
    paddingTop: space.tight,
    gap: space.cozy,
    width: "100%",
    maxWidth: frame.maxWidth,
    alignSelf: "center",
  },
  intro: { lineHeight: 28, color: colour.muted },
  card: { ...card, padding: space.card, gap: space.cozy },
  group: { gap: space.tight },
  wide: { width: "100%" },
  ref: { ...ltr, color: colour.forest700, textAlign: "center" },
  offer: { fontWeight: "600" },
  note: { ...type.note, color: colour.muted },
  pathHead: { color: colour.forest700 },
  stage: { flexDirection: "row", gap: space.snug, alignItems: "flex-start" },
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 7,
    backgroundColor: colour.line,
  },
  bulletOn: { backgroundColor: colour.leaf },
  bulletNow: { backgroundColor: colour.forest, width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  stageBody: { flex: 1, gap: 2 },
  stageOn: { color: colour.ink, fontWeight: "600" },
  stageOff: { color: colour.muted },
  marker: {
    ...type.caption,
    alignSelf: "flex-start",
    color: colour.forest700,
    backgroundColor: colour.leafSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.tight,
    paddingVertical: 2,
  },
  fact: { ...type.caption, color: colour.muted },
  help: { ...type.caption, textAlign: "center", lineHeight: 26, color: colour.muted },
});
