import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { failureKey, useAuth, type AuthFailure } from "../../src/auth";
import { settingText, t } from "../../src/config";
import { siteFormat } from "../../src/format";
import { Shimmer } from "../../src/skeleton";
import { card, colour, frame, space, type } from "../../src/theme";
import { Btn, ErrorText, Field, Hairline, Hint, Label } from "../../src/ui";
import { buildRows, failureKey as fileFailureKey, fetchMyFile, type Failure, type Row, type ZitountiFile } from "../../src/zitounti";
import { useConfig } from "../../src/use-config";

/**
 * حسابي — the buyer's door, and since 2026-10-12 it is a door rather than a signpost.
 *
 * WHAT THIS FILE USED TO SAY, AND WHY IT IS NO LONGER TRUE. It opened /zitounti in the phone's browser and
 * explained at length that it had to: the rate-limit gate and the phone-to-address lookup are service-role
 * only, the app ships the anon key, and «a form that collects a password it has no use for teaches people to
 * type passwords into things that do not use them». It also named what would unlock this screen — «one route
 * beside /api/mobile/interest, holding the service key on the website's own server». Those routes exist now
 * (/api/mobile/auth/{code,verify,login}), src/auth.tsx talks to them, and the session they return is set on
 * this app's own Supabase client.
 *
 * SO THE FORM IS REAL. The password goes to the website over HTTPS, is checked behind the same gate the site
 * uses, and is never stored on the phone — only the session tokens are, in the Keychain.
 *
 * EVERY WORD IS STILL THE OWNER'S. The labels, the hints and every refusal are `ui.login.*` rows, and the
 * refusals use the website's own map (src/auth.tsx's failureKey), so the two say the same sentence to the
 * same person. Nothing Arabic is written in this file.
 */
export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { config } = useConfig();
  const { person, ready, signOut } = useAuth();

  return (
    <ScrollView
      style={{ backgroundColor: colour.paper }}
      contentContainerStyle={[styles.page, { paddingTop: space.section + insets.top }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        {!ready ? (
          // Looking in the Keychain. A door drawn for a second and then replaced by a name is the flicker
          // the skeleton work exists to stop.
          <View style={styles.waiting}>
            <Shimmer height={26} width="58%" />
            <Shimmer height={14} width="86%" />
            <Shimmer height={132} corner={16} />
          </View>
        ) : person ? (
          <SignedIn name={person.fullName} onSignOut={() => void signOut()} />
        ) : (
          <SignInPanel />
        )}
      </View>
    </ScrollView>
  );
}

/* ----------------------------------------------------------------------------------------- signed out */

type Step = "password" | "code";

function SignInPanel() {
  const { config } = useConfig();
  const router = useRouter();
  const { requestCode, signInWithCode, signInWithPassword } = useAuth();

  const [step, setStep] = useState<Step>("password");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthFailure | null>(null);

  const say = (reason: AuthFailure) => t(config, failureKey(reason));

  const submitPassword = useCallback(async () => {
    if (busy) return;
    setError(null);
    if (!phone.trim() || !password) {
      setError("invalid_request");
      return;
    }
    setBusy(true);
    const answer = await signInWithPassword(phone.trim(), password);
    setBusy(false);
    if (!answer.ok) setError(answer.reason);
    // On success the provider sets `person` and this panel is replaced; nothing to do here.
  }, [busy, password, phone, signInWithPassword]);

  const askForCode = useCallback(async () => {
    if (busy) return;
    setError(null);
    if (!phone.trim()) {
      setError("invalid_phone");
      return;
    }
    setBusy(true);
    const answer = await requestCode(phone.trim());
    setBusy(false);
    if (!answer.ok) {
      setError(answer.reason);
      return;
    }
    setCode("");
    setStep("code");
  }, [busy, phone, requestCode]);

  const submitCode = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const answer = await signInWithCode(phone.trim(), code.trim());
    setBusy(false);
    if (!answer.ok) setError(answer.reason);
  }, [busy, code, phone, signInWithCode]);

  return (
    <>
      <Text style={[type.pageTitle, { color: colour.forest700 }]}>{t(config, "zitounti.title")}</Text>

      {/*
        WHAT THIS SPACE IS, BEFORE WHAT IT WANTS FROM YOU.
        The screen used to open on «ادخل بنمرة التلفون وكلمة السرّ متاعك» — an instruction to somebody who has
        no idea what they would be entering, or why. The owner's own one-line description of زيتونتي exists
        and was only ever used as a page description nobody reads. It goes first now.
      */}
      <Text style={[type.label, styles.note]}>
        {t(config, step === "code" ? "ui.login.code_sent_note" : "ui.zitounti.meta_description")}
      </Text>

      <View style={styles.card}>
        <View style={styles.group}>
          <Label>{t(config, "ui.login.phone_label")}</Label>
          <Field
            value={phone}
            onChangeText={setPhone}
            /*
             * NO PLACEHOLDER. It used to repeat ui.login.phone_hint, which now sits under the field as a
             * hint — so the same sentence was printed twice, once in grey inside the box and once below it.
             * A placeholder that duplicates the hint is noise; a placeholder that contradicts it is worse;
             * and an empty phone field is unambiguous on its own, because the label above says what it is.
             */
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={20}
            // A phone number is Latin digits read left to right, on an Arabic screen as on any other.
            ltr
            accessibilityLabel={t(config, "ui.login.phone_label")}
            // The number is fixed once the code is out: changing it would check the code against someone else.
            style={step === "code" ? styles.locked : undefined}
          />
          {/*
            «نفس النمرة اللي سجّلت بيها عند AgriZed» was the field's PLACEHOLDER — grey, inside the box, and
            gone the moment anybody typed. It is the one sentence that tells a first-time reader this door
            needs a number AgriZed already knows, so it is a hint under the field where it stays readable.
          */}
          {step === "password" ? <Hint>{t(config, "ui.login.phone_hint")}</Hint> : null}
        </View>

        {step === "password" ? (
          <>
            <View style={styles.group}>
              <Label>{t(config, "ui.login.password_label")}</Label>
              <Field
                value={password}
                onChangeText={setPassword}
                secure
                autoComplete="current-password"
                maxLength={200}
                accessibilityLabel={t(config, "ui.login.password_label")}
                onSubmitEditing={() => void submitPassword()}
              />
            </View>

            {error ? <ErrorText>{say(error)}</ErrorText> : null}

            <Btn
              label={t(config, "ui.login.submit_sign_in")}
              onPress={() => void submitPassword()}
              busy={busy}
              minHeight={52}
              style={styles.wide}
            />

            <Hairline />

            {/*
              The first time there is no password yet, and a forgotten one takes the same road: a code by
              SMS. One control for both, worded as the website words it.
            */}
            <Text style={[type.caption, styles.quiet]}>{t(config, "ui.login.first_time_sms")}</Text>
            <Btn
              label={t(config, "ui.login.submit_send_code")}
              onPress={() => void askForCode()}
              tone="secondary"
              busy={busy}
              style={styles.wide}
            />
          </>
        ) : (
          <>
            <View style={styles.group}>
              <Label>{t(config, "ui.login.code_label")}</Label>
              <Field
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={10}
                ltr
                centre
                accessibilityLabel={t(config, "ui.login.code_label")}
                onSubmitEditing={() => void submitCode()}
              />
            </View>

            {error ? <ErrorText>{say(error)}</ErrorText> : null}

            <Btn
              label={t(config, "ui.login.submit_sign_in")}
              onPress={() => void submitCode()}
              busy={busy}
              minHeight={52}
              style={styles.wide}
            />
            <Btn
              label={t(config, "ui.login.resend_code")}
              onPress={() => void askForCode()}
              tone="ghost"
              busy={busy}
              style={styles.wide}
            />
            <Btn
              label={t(config, "ui.login.back")}
              onPress={() => {
                setStep("password");
                setError(null);
              }}
              tone="ghost"
              style={styles.wide}
            />
          </>
        )}

        <HelpLine />
      </View>

      {/*
        THE DOOR FOR SOMEBODY WHO HAS NEVER BEEN HERE, which is what this screen was missing entirely.
        فضاء «زيتونتي» holds a file, and a file exists only after a person has been in touch with AgriZed —
        so a visitor who downloaded the app five minutes ago has no account, cannot make one here, and had no
        way of learning either: the SMS door answers them with silence, by design, because saying «this number
        is not registered» would tell any stranger who else is. The owner already had the sentence for exactly
        this — it is what the file read returns for a number with no file — and it is said here BEFORE they
        waste a code finding out.
      */}
      {step === "password" ? (
        <View style={styles.card}>
          <Text style={[type.body, styles.newcomer]}>{t(config, "ui.zitounti.failure_no_file")}</Text>
          <Btn
            label={t(config, "site.app_hero_cta")}
            onPress={() => router.push("/offers")}
            tone="secondary"
            style={styles.wide}
          />
        </View>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------------------------------ signed in */

/**
 * What a signed-in buyer sees here for now: who they are, and the way out.
 *
 * THE TEN SECTIONS ARE NOT DRAWN YET, and that is said out loud rather than left as a gap. `my_zitounti_file`
 * is granted to `authenticated` — checked against the live database — so this session can already read the
 * whole file in one round trip: trees, requests, holds, visits, payments, contracts, instalments, farm work,
 * subscription, harvest, documents and the totals. Rendering them is a screen of its own and belongs with
 * the website's `sections.tsx` beside it, not bolted onto the door.
 */
function SignedIn({ name, onSignOut }: { name: string | null; onSignOut: () => void }) {
  const { config } = useConfig();
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
    void read();
    return () => {
      gone.current = true;
    };
  }, [read]);

  /*
   * The rows are drawn even when the file did not open, and that is the website's decision repeated here:
   * «a reader who was promised a space is owed the shape of it». What changes is the note beside each one —
   * the owner's «قريباً» when the module is genuinely closed, and nothing at all for any other failure,
   * because a note there would be a guess about why.
   */
  const rows: Row[] = useMemo(
    () => buildRows(file, (key) => t(config, key), (n) => fmt.count(n), failure === "closed" ? t(config, "zitounti.section_later") : null),
    [config, failure, file, fmt],
  );

  const trees = file?.totals?.trees ?? 0;
  const paid = file?.totals?.paid_millimes ?? null;

  return (
    <>
      <Text style={[type.pageTitle, { color: colour.forest700 }]}>
        {name ? t(config, "ui.zitounti.greeting", { name }) : t(config, "ui.zitounti.greeting_anonymous")}
      </Text>

      {loading ? (
        <View style={styles.waiting}>
          <Shimmer height={88} corner={16} />
          <Shimmer height={260} corner={16} />
        </View>
      ) : (
        <>
          {/* The figures a buyer owns, straight from the payload — nothing added up here. */}
          {file && trees > 0 ? (
            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={type.figure}>{fmt.count(trees)}</Text>
                <Text style={[type.caption, styles.totalLabel]}>{t(config, "ui.zitounti.my_trees")}</Text>
              </View>
              {paid !== null ? (
                <View style={styles.total}>
                  <Text style={type.figure}>{fmt.money(paid)}</Text>
                  <Text style={[type.caption, styles.totalLabel]}>{t(config, "ui.zitounti.amount")}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Why the file did not open, in the owner's words — never a sentence invented here. */}
          {failure ? (
            <View style={styles.card}>
              <Text style={[type.body, { color: colour.muted }]}>{t(config, fileFailureKey(failure))}</Text>
              <Btn
                label={t(config, "ui.pages.error_retry")}
                onPress={() => void read()}
                tone="secondary"
                style={styles.wide}
              />
            </View>
          ) : null}

          <View style={styles.card}>
            {rows.map((row, index) => (
              <View key={row.key}>
                {index > 0 ? <Hairline /> : null}
                <View style={styles.row}>
                  <Text style={[type.heading, styles.rowLabel]}>{row.label}</Text>
                  <Text style={[type.caption, { color: row.open ? colour.forest : colour.muted }]}>{row.note}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.card}>
        <Btn label={t(config, "ui.login.sign_out")} onPress={onSignOut} tone="secondary" style={styles.wide} />
        <HelpLine />
      </View>
    </>
  );
}

/** The site's own help line at the foot of this panel: the number is a `tel:` link there and here. */
function HelpLine() {
  const { config } = useConfig();
  const phone = settingText(config, "site.contact_phone");
  const digits = phone.replace(/[^0-9+]/g, "");
  if (!digits) return null;
  return (
    <Text
      accessibilityRole="link"
      onPress={() => void Linking.openURL(`tel:${digits}`)}
      style={styles.help}
    >
      {t(config, "ui.login.help_call", { phone })}
    </Text>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: frame.gutter, paddingBottom: space.section },
  column: { width: "100%", maxWidth: frame.maxWidth, alignSelf: "center" },
  waiting: { gap: space.cozy },
  note: { marginTop: space.tight, lineHeight: 28, color: colour.muted },
  card: { ...card, marginTop: space.roomy, padding: space.card, gap: space.cozy },
  group: { gap: space.tight },
  wide: { width: "100%" },
  locked: { opacity: 0.6 },
  newcomer: { color: colour.muted, lineHeight: 26 },
  totals: { ...card, marginTop: space.roomy, padding: space.card, flexDirection: "row", gap: space.cozy },
  total: { flex: 1, alignItems: "center", gap: space.hair },
  totalLabel: { color: colour.muted, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space.snug, gap: space.cozy },
  rowLabel: { flex: 1 },
  quiet: { textAlign: "center", color: colour.muted, lineHeight: 24 },
  help: {
    ...type.caption,
    marginTop: space.hair,
    lineHeight: 28,
    textAlign: "center",
    color: colour.muted,
  },
});
