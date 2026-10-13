import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth";
import { t } from "../../src/config";
import { siteFormat } from "../../src/format";
import { Shimmer } from "../../src/skeleton";
import { card, colour, frame, radius, readingRow, space, type } from "../../src/theme";
import { BackArrow, Btn, Hairline } from "../../src/ui";
import { useConfig } from "../../src/use-config";
import {
  failureKey,
  fetchMyFile,
  SECTION_SETTING,
  type Failure,
  type SectionKey,
  type ZitountiFile,
} from "../../src/zitounti";

/**
 * One section of فضاء «زيتونتي» — the screen the account list's rows had nothing to open.
 *
 * ONE ROUTE FOR TEN SECTIONS, which is what the website does too (/zitounti/[section]): the key in the URL
 * picks both the heading and the part of the payload to draw, and a key this build does not know is simply
 * not a screen. The file is read once per visit from `my_zitounti_file()` — the same no-argument function
 * the account list reads, which resolves the person from the session and cannot be asked for anybody else's.
 *
 * EVERY ITEM IS DRAWN AS FACTS, and that is a decision rather than a shortcut. The website gives several of
 * these sections bespoke layouts; repeating eleven of those here, each with its own notion of what matters,
 * is how two screens start disagreeing about the same row. A titled card with labelled facts says exactly
 * what the payload holds, in the owner's own words, for all eleven — and where a section earns a layout of
 * its own (the instalment schedule below) it gets one.
 *
 * NO WORD IS WRITTEN HERE. Every label is a `ui.zitounti.*` row and every heading a `zitounti.section_*` one;
 * I listed all 139 of them from the database before writing a line, because the last two times I guessed at
 * key names most of them did not exist and the screen printed them at the reader.
 */

const KEYS: readonly SectionKey[] = [
  "trees",
  "requests",
  "reservations",
  "visits",
  "payments",
  "contracts",
  "installments",
  "operations",
  "subscription",
  "harvest",
  "documents",
];

/**
 * The sections an empty state can offer a way out of: everything a reader reaches by choosing an offer.
 * The rest fill themselves as AgriZed works — a document, a farm operation, a harvest — and pointing at
 * the catalogue from those would be a non sequitur.
 */
const ACTIONABLE = new Set<SectionKey>(["trees", "requests", "reservations", "visits", "contracts", "installments"]);

type Fact = { label: string; value: string };
type Card = { title: string; note?: string | null; pill?: string | null; facts: Fact[]; lines?: Line[] };
type Line = { head: string; facts: Fact[]; late?: boolean };

export default function SectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { config } = useConfig();
  const { person, ready } = useAuth();
  const fmt = useMemo(() => siteFormat(config), [config]);

  const [file, setFile] = useState<ZitountiFile | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const gone = useRef(false);

  const read = useCallback(async () => {
    setLoading(true);
    const result = await fetchMyFile();
    if (gone.current) return;
    if (result.ok) {
      setFile(result.file);
      setFailure(null);
    } else {
      setFile(null);
      setFailure(result.reason);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    gone.current = false;
    if (ready && person) void read();
    else if (ready) setLoading(false);
    return () => {
      gone.current = true;
    };
  }, [person, read, ready]);

  const key = KEYS.find((candidate) => candidate === section) ?? null;
  const title = key ? t(config, SECTION_SETTING[key]) : "";
  const cards = useMemo(() => (key && file ? build(key, file, config, fmt) : []), [config, file, fmt, key]);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.bar, { paddingTop: insets.top + space.tight }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" style={styles.back}>
          <BackArrow size={22} color={colour.forest} />
        </Pressable>
        <Text style={[type.heading, styles.barTitle]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: space.section + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.waiting}>
            <Shimmer height={118} corner={radius.card} />
            <Shimmer height={118} corner={radius.card} />
          </View>
        ) : !person ? (
          // Reached without a session — the one case where the answer is a door rather than a sentence.
          <View style={styles.card}>
            <Text style={styles.note}>{t(config, "ui.zitounti.failure_not_signed_in")}</Text>
            <Btn label={t(config, "ui.login.submit_sign_in")} onPress={() => router.replace("/account")} />
          </View>
        ) : failure ? (
          <View style={styles.card}>
            <Text style={styles.note}>{t(config, failureKey(failure))}</Text>
            <Btn label={t(config, "ui.pages.error_retry")} onPress={() => void read()} tone="secondary" />
          </View>
        ) : cards.length === 0 ? (
          /*
           * EMPTY IS A PAGE, NOT A SHRUG. A reader who opened «حجوزاتي» and found one grey line has been
           * told what is missing and nothing about what would fill it. So: the section's own name, the
           * owner's sentence for an empty part, and the one door that could put something in it — the
           * offers, when that module is open. The door is drawn only for the sections a visitor can
           * actually act on; «الوثائق» fills itself when AgriZed files one, and sending somebody to the
           * catalogue for that would be a non sequitur.
           */
          <View style={styles.empty}>
            <Text style={[type.pageTitle, styles.emptyTitle]}>{title}</Text>
            <Text style={[styles.note, styles.emptyNote]}>{t(config, "zitounti.section_empty_note")}</Text>
            {ACTIONABLE.has(key as SectionKey) ? (
              <Btn
                label={t(config, "site.app_hero_cta")}
                onPress={() => router.replace("/offers")}
                tone="secondary"
                style={styles.emptyBtn}
              />
            ) : null}
          </View>
        ) : (
          cards.map((item, index) => (
            <View key={`${item.title}-${index}`} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={[type.heading, styles.cardTitle]} numberOfLines={2}>
                  {item.title}
                </Text>
                {/* A local badge rather than offer-ui's Pill: that one takes a Tone object built for the
                    catalogue's statuses, and borrowing it here would tie this screen to a palette it does
                    not share. One word on leafSoft is all these states need. */}
                {item.pill ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.pill}</Text>
                  </View>
                ) : null}
              </View>
              {item.note ? <Text style={styles.note}>{item.note}</Text> : null}

              {item.facts.length > 0 ? (
                <View style={styles.facts}>
                  {item.facts.map((fact) => (
                    <View key={fact.label} style={styles.fact}>
                      <Text style={styles.factLabel}>{fact.label}</Text>
                      <Text style={styles.factValue}>{fact.value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* The instalment schedule is the one section that earns a layout of its own: a client reading
                  it is looking for which line is late, and that cannot be a fact among facts. */}
              {item.lines?.map((line, lineIndex) => (
                <View key={line.head}>
                  {lineIndex === 0 ? <Hairline /> : null}
                  <View style={styles.line}>
                    <Text style={[styles.lineHead, line.late ? styles.lateText : null]}>{line.head}</Text>
                    <View style={styles.lineFacts}>
                      {line.facts.map((fact) => (
                        <Text key={fact.label} style={styles.lineFact}>
                          {fact.label} {fact.value}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------ */

type Fmt = ReturnType<typeof siteFormat>;
type Config = Parameters<typeof t>[0];

/** A fact only exists when it has a value: an empty row is a label pointing at nothing. */
function facts(...rows: (Fact | null)[]): Fact[] {
  return rows.filter((row): row is Fact => row !== null && row.value !== "" && row.value !== "—");
}

function build(key: SectionKey, file: ZitountiFile, config: Config, fmt: Fmt): Card[] {
  const label = (suffix: string) => t(config, `ui.zitounti.${suffix}`);
  const items = (file[key]?.items ?? []) as Record<string, unknown>[];
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : "");
  const num = (value: unknown) => (typeof value === "number" ? value : null);
  const money = (value: unknown) => (num(value) === null ? "" : fmt.money(num(value) as number));
  const date = (value: unknown) => (text(value) ? fmt.date(text(value)) : "");
  const count = (value: unknown) => (num(value) === null ? "" : fmt.count(num(value) as number));

  switch (key) {
    case "trees":
      return items.map((row) => ({
        title: text(row.project_name) || label("offer_fallback_title"),
        note: [text(row.governorate), text(row.delegation)].filter(Boolean).join(" · ") || null,
        facts: facts(
          { label: label("trees_owned"), value: count(row.trees_owned) },
          { label: label("trees_reserved"), value: count(row.trees_reserved) },
          { label: label("variety"), value: text(row.olive_variety) },
          { label: label("plantation_system"), value: text(row.plantation_system) },
        ),
      }));

    case "requests":
      return items.map((row) => ({
        title: text(row.request_no) || label("request_fallback_title"),
        note: text(row.project_name) || null,
        facts: facts(
          { label: label("date"), value: date(row.created_at) },
          { label: label("trees_count_label"), value: count(row.trees) },
          { label: label("price_per_tree"), value: money(row.price_per_tree_millimes) },
          { label: label("total_price"), value: money(row.total_price_millimes) },
        ),
      }));

    case "reservations":
      return items.map((row) => ({
        title: text(row.reference_no) || label("reservation_fallback_title"),
        note: text(row.project_code) || null,
        facts: facts(
          { label: label("trees_count_label"), value: count(row.trees) },
          { label: label("deposit"), value: money(row.deposit_due_millimes) },
          { label: label("reserved_on"), value: date(row.reserved_at) },
          { label: label("expires_on"), value: date(row.expires_at) },
          { label: label("deposit_paid_on"), value: date(row.deposit_paid_at) },
        ),
      }));

    case "visits":
      return items.map((row) => ({
        title: text(row.visit_no) || label("visit_fallback_title"),
        note: text(row.project_code) || null,
        facts: facts(
          { label: label("date"), value: date(row.visit_date) },
          { label: label("time_slot"), value: text(row.slot_label_ar) },
          { label: label("meeting_point"), value: text(row.meeting_point) },
        ),
      }));

    case "payments":
      return items.map((row) => ({
        title: text(row.reference_no) || label("amount"),
        pill: row.voided === true ? label("voided") : null,
        facts: facts(
          { label: label("amount"), value: money(row.amount_millimes) },
          { label: label("payment_method"), value: text(row.method_label_ar) },
          { label: label("paid_on"), value: date(row.received_at) },
        ),
      }));

    case "contracts":
      return items.map((row) => ({
        title: text(row.reference_no) || label("contract_fallback_title"),
        pill: text(row.status_label) || null,
        note: text(row.offer_code) || null,
        facts: facts(
          { label: label("trees_count_label"), value: count(row.trees_count) },
          { label: label("total_price"), value: money(row.total_price_millimes) },
          { label: label("signed_on"), value: date(row.signed_on) },
          { label: label("owned_on"), value: date(row.owned_on) },
        ),
      }));

    case "installments":
      return items.map((row) => {
        const lines = (row.lines ?? []) as Record<string, unknown>[];
        return {
          title: text(row.contract_no) || label("schedule_title"),
          facts: [],
          lines: lines.map((line) => ({
            head: t(config, "ui.zitounti.installment_number", { seq: num(line.seq) ?? 0 }),
            late: line.is_late === true,
            facts: facts(
              { label: label("amount"), value: money(line.amount_millimes) },
              { label: label("left"), value: money(line.left_millimes) },
              { label: label("date"), value: date(line.due_on) },
            ),
          })),
        };
      });

    case "operations":
      return items.map((row) => ({
        title: text(row.service_ar) || label("service_fallback_title"),
        note: text(row.project_code) || null,
        facts: facts(
          { label: label("applies_to"), value: row.scope === "offer" ? label("scope_offer") : label("scope_trees") },
          { label: label("planned_on"), value: date(row.planned_on) },
          { label: label("done_on"), value: date(row.executed_on) },
        ),
      }));

    case "subscription":
      return items.map((row) => ({
        title: text(row.season_label) || label("subscription_fallback_title"),
        note: text(row.project_code) || null,
        facts: facts(
          { label: label("trees_count_label"), value: count(row.trees) },
          { label: label("annual_fee_per_tree"), value: money(row.fee_per_tree_millimes) },
          { label: label("annual_fee_total"), value: money(row.amount_millimes) },
          { label: label("season_start"), value: date(row.season_starts_on) },
        ),
      }));

    case "harvest":
      return items.map((row) => ({
        title: text(row.season_label) || label("harvest_fallback_title"),
        pill: row.settled === true ? label("harvest_settled") : label("harvest_pending"),
        note: text(row.project_code) || null,
        facts: facts(
          { label: label("olives"), value: count(row.season_olives_kg) },
          { label: label("choice_deadline"), value: date(row.choice_deadline) },
        ),
      }));

    case "documents":
      return items.map((row) => ({
        title: text(row.reference_no) || text(row.kind) || label("legal_ref"),
        note: text(row.offer_code) || null,
        facts: facts(
          { label: label("legal_ref"), value: text(row.legal_ref) },
          { label: label("date"), value: date(row.at) },
        ),
      }));

    default:
      return [];
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colour.paper },
  bar: {
    ...readingRow(),
    alignItems: "center",
    paddingHorizontal: frame.gutter,
    paddingBottom: space.snug,
    backgroundColor: colour.paper,
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
  waiting: { gap: space.cozy },
  empty: { ...card, padding: space.card, gap: space.snug, alignItems: "center", marginTop: space.roomy },
  emptyTitle: { color: colour.forest700, textAlign: "center" },
  emptyNote: { textAlign: "center", lineHeight: 26 },
  emptyBtn: { marginTop: space.tight, minWidth: 200 },
  card: { ...card, padding: space.card, gap: space.snug },
  cardHead: { ...readingRow(), alignItems: "center", gap: space.tight },
  cardTitle: { flex: 1 },
  badge: {
    paddingHorizontal: space.tight,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colour.leafSoft,
  },
  badgeText: { ...type.caption, color: colour.forest700 },
  note: { ...type.note, color: colour.muted },
  facts: { gap: space.hair },
  fact: { ...readingRow(), alignItems: "baseline", justifyContent: "space-between", gap: space.cozy },
  factLabel: { ...type.caption, color: colour.muted, flexShrink: 1 },
  factValue: { ...type.body, fontWeight: "600" },
  line: { paddingVertical: space.tight, gap: 2 },
  lineHead: { ...type.body, fontWeight: "600" },
  lateText: { color: colour.danger },
  lineFacts: { ...readingRow(), flexWrap: "wrap", gap: space.snug },
  lineFact: { ...type.caption, color: colour.muted },
});
