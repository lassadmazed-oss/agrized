import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { failureKey, useAuth, type AuthFailure } from "../../src/auth";
import { settingText, t } from "../../src/config";
import { siteFormat } from "../../src/format";
import { Shimmer } from "../../src/skeleton";
import { card, colour, frame, ltr, pull, readingRow, space, type } from "../../src/theme";
import { Btn, Chevron, ErrorText, Field, Hairline, Hint, Label } from "../../src/ui";
import { buildRows, failureKey as fileFailureKey, type Failure, type Row, type ZitountiFile } from "../../src/zitounti";
import { useConfig } from "../../src/use-config";
import { useMyFile } from "../../src/useMyFile";
import { enablePush, pushAlreadyOn } from "../../src/push";

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
  const { reload: reloadConfig } = useConfig();
  const { person, ready, signOut } = useAuth();
  // ?phone= comes from «افتح حسابي» on a request's confirmation (0149). Only a string is taken, and only to
  // fill the field: nothing about this number is trusted until the reader submits the form himself.
  const { phone: asked } = useLocalSearchParams<{ phone?: string }>();

  /*
   * THE FILE IS READ HERE, NOT INSIDE <SignedIn>, and the reason is this screen's one scroll view.
   *
   * A pull-to-refresh belongs to whatever scrolls, and what scrolls is out here; what knows how to re-read
   * is in there. One of the two had to move, and moving the reader up is the move that also lets the
   * section screens share it (src/useMyFile.ts) instead of keeping a second copy.
   */
  const { file, failure, loading, reload } = useMyFile(ready ? Boolean(person) : null);

  const [refreshing, setRefreshing] = useState(false);

  /*
   * PULL DOWN TO ASK AGAIN — the gesture every phone app answers to, and the one this screen needed most:
   * it is where «did my demand arrive» is asked, and until now the only way to ask again was to kill the
   * app. It re-reads the words and the flags as well as the file, because somebody who pulls a screen down
   * is saying «this looks old», not «re-run one query».
   *
   * The read is QUIET: the file stays on screen under the spinner instead of collapsing into a skeleton.
   * That is what every other app does, and it is also the honest picture — the rows are not wrong, they
   * are merely a minute old, and the spinner is already saying so.
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      reloadConfig();
      await reload(true);
    } finally {
      setRefreshing(false);
    }
  }, [reload, reloadConfig]);

  return (
    <ScrollView
      style={{ backgroundColor: colour.paper }}
      contentContainerStyle={[styles.page, { paddingTop: space.section + insets.top }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} {...pull} />}
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
          <SignedIn
            name={person.fullName}
            onSignOut={() => void signOut()}
            file={file}
            failure={failure}
            loading={loading}
            onRetry={() => void reload()}
          />
        ) : (
          <SignInPanel invitedPhone={typeof asked === "string" ? asked : undefined} />
        )}

        {/*
          Shown in both states. A person who has registered interest but has no account is exactly who a
          «your visit is confirmed» notification is for, and making the offer only to signed-in people would
          hide it from most of the people it serves. When there is a session the device is linked to that
          phone number; without one it registers unattached, and 0138 links it the moment the number is known.
        */}
        {ready ? <PushRow phone={person?.phone ?? null} /> : null}
      </View>
    </ScrollView>
  );
}

/* ----------------------------------------------------------------------------------------- signed out */

type Step = "password" | "code";

function SignInPanel({ invitedPhone }: { invitedPhone?: string }) {
  const { config } = useConfig();
  const router = useRouter();
  const { requestCode, signInWithCode, signInWithPassword } = useAuth();

  // A reader who arrived from «افتح حسابي» has no password yet, so the ordinary sentence would be the wrong
  // instruction on his first screen: he is pointed at the SMS door instead.
  const invited = Boolean(invitedPhone?.trim());

  const [step, setStep] = useState<Step>("password");
  const [phone, setPhone] = useState(invitedPhone?.trim() ?? "");
  // The tabs keep this screen mounted, so a second «افتح حسابي» arrives as a changed param, not a new mount.
  useEffect(() => {
    const typed = invitedPhone?.trim();
    if (typed) setPhone(typed);
  }, [invitedPhone]);
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
        {t(
          config,
          step === "code"
            ? "ui.login.code_sent_note"
            : invited
              ? "zitounti.invite_login_note"
              : "ui.zitounti.meta_description",
        )}
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
          {/*
            AND THE OTHER DOOR FOR THE SAME READER. Somebody who HAS sent a demand has a reference number and
            still no account — the room is not theirs yet, but «where has my demand got to» is. The website
            puts this in its footer; the app has no footer, so it rides here, beside the sentence that says
            this number has no file.
          */}
          <Btn
            label={t(config, "track.title")}
            onPress={() => router.push("/track")}
            tone="ghost"
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
function SignedIn({
  name,
  onSignOut,
  file,
  failure,
  loading,
  onRetry,
}: {
  name: string | null;
  onSignOut: () => void;
  file: ZitountiFile | null;
  failure: Failure | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const { config } = useConfig();
  const router = useRouter();
  const fmt = useMemo(() => siteFormat(config), [config]);

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
          {/*
            WHICH ACCOUNT AM I IN. The screen greeted the reader by name and said nothing else about them —
            and on a phone that remembers a session for weeks, «whose file is this» is a fair question with
            no answer on screen. Everything here is already in the payload; none of it is fetched again.

            The number is the identity in this product: it is what signs in, what an SMS reaches, and what a
            demand is matched on. It is shown in full rather than masked, because this screen is only ever
            drawn to the person who just proved they hold it.
          */}
          {file?.person ? (
            <View style={styles.card}>
              <View style={styles.idRow}>
                <Text style={styles.idLabel}>{t(config, "ui.register.full_name_label")}</Text>
                <Text style={styles.idValue}>{file.person.full_name}</Text>
              </View>
              <View style={styles.idRow}>
                <Text style={styles.idLabel}>{t(config, "ui.login.phone_label")}</Text>
                {/* A number is Latin digits read left to right, on an Arabic screen as on any other. */}
                <Text style={[styles.idValue, ltr]}>{file.person.phone_e164}</Text>
              </View>
              {file.person.email ? (
                <View style={styles.idRow}>
                  <Text style={styles.idLabel}>{t(config, "ui.register.review_email")}</Text>
                  <Text style={[styles.idValue, ltr]} numberOfLines={1}>
                    {file.person.email}
                  </Text>
                </View>
              ) : null}
              {file.person.governorate ? (
                <View style={styles.idRow}>
                  <Text style={styles.idLabel}>{t(config, "ui.land.governorate_label")}</Text>
                  <Text style={styles.idValue}>
                    {[file.person.governorate, file.person.delegation].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              ) : null}
              {file.person.created_at ? (
                <Text style={styles.since}>
                  {t(config, "ui.zitounti.member_since", { date: fmt.date(file.person.created_at) })}
                </Text>
              ) : null}
            </View>
          ) : null}

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
                onPress={onRetry}
                tone="secondary"
                style={styles.wide}
              />
            </View>
          ) : null}

          <View style={styles.card}>
            {rows.map((row, index) => (
              <View key={row.key}>
                {index > 0 ? <Hairline /> : null}
                {/*
                  A ROW OPENS ONLY WHEN THERE IS SOMETHING BEHIND IT. `open` is true when the section holds
                  rows; an empty one, a closed module and a part not built yet all stay flat, so nothing
                  promises a tap it cannot answer — which is what these rows did until this screen existed.
                */}
                <Pressable
                  onPress={row.open ? () => router.push(`/zitounti/${row.key}`) : undefined}
                  disabled={!row.open}
                  accessibilityRole={row.open ? "button" : undefined}
                  style={styles.row}
                >
                  <Text style={[type.heading, styles.rowLabel]}>{row.label}</Text>
                  <Text style={[type.caption, { color: row.open ? colour.forest : colour.muted }]}>{row.note}</Text>
                  {row.open ? <Chevron size={18} color={colour.lineStrong} /> : null}
                </Pressable>
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

type PushState = "unknown" | "off" | "on" | "denied" | "failed" | "working";

/**
 * الإشعارات — the one screen in the app that asks for a system permission, and it asks twice on purpose.
 *
 * iOS allows ONE permission prompt per install. Tapped «Don't Allow», an app can never ask again from its
 * own code — only point at Settings, which nearly nobody opens. So the owner's sentence is shown first and
 * Apple's dialog only to someone who has read it and tapped «فعّل». The second prompt is the one whose
 * refusal rate matters, and this ordering is the only thing that moves it.
 *
 * A REFUSAL IS NOT AN ERROR. It is drawn in the quiet colour with the sentence that says where to change it,
 * and the button does not come back to ask again on every visit. `ui.push.failed` — network, server — is the
 * only state that invites another try.
 *
 * The row hides itself where there can be no notifications: a simulator, Expo Go, or a token that cannot be
 * had. Offering a switch that cannot work is worse than offering nothing.
 */
function PushRow({ phone }: { phone: string | null }) {
  const { config } = useConfig();
  const [state, setState] = useState<PushState>("unknown");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    pushAlreadyOn()
      .then((on) => {
        if (alive) setState(on ? "on" : "off");
      })
      .catch(() => {
        if (alive) setState("off");
      });
    return () => {
      alive = false;
    };
  }, []);

  /*
   * ALREADY ON, AND THE NUMBER HAS JUST BECOME KNOWN. Signing in is the moment an unattached device can be
   * attached to a person, and it costs one POST that the stored stamp makes idempotent — enablePush does
   * nothing when the token and the phone are the pair the server already holds. Without this the first
   * notification after signing in would go nowhere, because the row that addresses a person by phone would
   * find no device on that number.
   */
  useEffect(() => {
    if (state !== "on" || !phone) return;
    void enablePush(phone);
  }, [state, phone]);

  const turnOn = useCallback(async () => {
    setState("working");
    const outcome = await enablePush(phone);
    if (outcome.ok) {
      setState("on");
      return;
    }
    if (outcome.reason === "denied") setState("denied");
    else if (outcome.reason === "unsupported") setHidden(true);
    else setState("failed");
  }, [phone]);

  if (hidden || state === "unknown") return null;

  return (
    <View style={styles.card}>
      <Label>{t(config, "ui.push.title")}</Label>
      <Hint>{t(config, "ui.push.text")}</Hint>

      {state === "on" ? (
        <Text style={[type.caption, { color: colour.forest }]}>{t(config, "ui.push.on")}</Text>
      ) : state === "denied" ? (
        <Text style={[type.caption, { color: colour.muted }]}>{t(config, "ui.push.denied")}</Text>
      ) : (
        <>
          {state === "failed" ? <ErrorText>{t(config, "ui.push.failed")}</ErrorText> : null}
          <Btn
            label={t(config, "ui.push.enable")}
            onPress={() => void turnOn()}
            tone="secondary"
            disabled={state === "working"}
            style={styles.wide}
          />
        </>
      )}
    </View>
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
  row: { ...readingRow(), alignItems: "center", justifyContent: "space-between", paddingVertical: space.snug, gap: space.cozy },
  rowLabel: { flex: 1 },
  // readingRow, not a bare row: on an Arabic screen the label belongs where the eye starts.
  idRow: { ...readingRow(), alignItems: "baseline", justifyContent: "space-between", gap: space.cozy },
  idLabel: { ...type.caption, color: colour.muted, flexShrink: 0 },
  idValue: { ...type.body, fontWeight: "600", flexShrink: 1 },
  since: { ...type.caption, color: colour.muted, marginTop: space.hair },
  quiet: { textAlign: "center", color: colour.muted, lineHeight: 24 },
  help: {
    ...type.caption,
    marginTop: space.hair,
    lineHeight: 28,
    textAlign: "center",
    color: colour.muted,
  },
});
