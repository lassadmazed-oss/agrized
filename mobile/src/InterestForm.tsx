import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { submitInterest, type InterestInput } from "./api";
import { useAuth } from "./auth";
import { formatMessage, optionsFor, settingBool, t } from "./config";
import { fetchIntakePrefill, type IntakePrefill } from "./prefill";
import { card, colour, radius, space, type } from "./theme";
import { Btn, CheckRow, Chip, ErrorText, Field, Hint, Label } from "./ui";
import { useConfig } from "./use-config";

/**
 * «سجّل اهتمامك» — the only thing this app writes.
 *
 * THE ARCHITECTURE IS UNCHANGED AND IS CORRECT. `submit_interest_request` and `submit_offer_request` are
 * granted to `service_role` alone, because they write a person and a demand; the key that can do that can
 * also read and rewrite every table in the business, and anything shipped inside an app is readable by
 * whoever installs it. So the app POSTs to the website's `/api/mobile/interest`, which holds the key on its
 * own server and re-validates every field with the same rules the web form uses. Probed against the live
 * project: both intake RPCs answer this key 42501.
 *
 * ── WHAT CHANGED, AND WHY EACH ONE WAS WRONG ─────────────────────────────────────────────────────────────
 *
 *  1 · EVERY WORD IS THE OWNER'S NOW. Every label, placeholder, error and note in this file was Arabic typed
 *      into a component, while the row already existed and said something else: the app's «رقم التلفون موش
 *      صحيح. مثال: 98 123 456.» against `ui.errors.mobile_phone_invalid_example`, its «إختار ولايتك.»
 *      against `ui.errors.mobile_governorate_required`, its «ملكية واستثمار» against the owner's own
 *      «ملكية زيتون وأرض». Worse, the ENDPOINT answers in those same `ui.errors.mobile_*` sentences — so a
 *      refusal from the server arrived in the owner's Arabic and a refusal from the app in the app's, two
 *      voices in one form. Now both are his.
 *
 *  2 · THE CONSENT IS SHOWN AND ASKED FOR. The endpoint writes `consent_text: t(config,
 *      'legal.consent_text')` on every submission — «أوافق على أن تتصل بي AgriZed بخصوص طلبي، وعلى معالجة
 *      معطياتي الشخصية لهذا الغرض فقط.» The app showed its own, shorter sentence and asked nobody to agree
 *      to anything, so it recorded an agreement to words the visitor had never read. The website requires a
 *      ticked box (`consent: z.literal(true)`) and the RPC raises `consent_required` without one; this form
 *      now shows the owner's sentence verbatim beside a box that must be ticked.
 *
 *  3 · THE REFERENCE NUMBER IS PRINTED. `submitInterest` has always returned it and the success view threw
 *      it away, so a visitor who submitted from the app had nothing to quote back — while the site shows it
 *      under `ui.offer.form_request_no_label` and has a whole /track screen keyed on it.
 *
 *  4 · THE GOAL LIST COMES FROM THE DATABASE. Three codes and three Arabic words were hard-coded. They are
 *      `option_items` where `list_key = 'goal'`, in the Back Office's order, with the owner's labels.
 *
 *  5 · THE GOVERNORATES ARE A WRAPPED CHIP ROW, not a 132px-tall nested ScrollView inside a page that also
 *      scrolls — which on Android is a scroll trap the visitor has to fight. The site asks the same question
 *      as a plain wrapped row, and 24 short Arabic words wrap to four lines. They are also the ACTIVE ones
 *      only, which `loadPublicConfig` filters and this app did not: an inactive governorate is offered by
 *      the picker and then refused by the intake with `invalid_governorate`, so the visitor was told off for
 *      a choice the app had put in front of them.
 *
 *  6 · THE PHONE RULE IS THE OWNER'S SWITCH. The app accepted 8 digits, or 11 beginning 216, and nothing
 *      else. The site asks `normalizePhone(phone, settingBool(config, 'lead.allow_international_phone'))`.
 *      The two agree today because that setting is false — but migration 0121 exists precisely because the
 *      diaspora matters, and the one person this form would refuse hardest is a Tunisian abroad with a
 *      French number. The length check below relaxes with the setting, and the final word is the endpoint's,
 *      in the owner's sentences.
 *
 *  7 · THE FIELDS ARE `.field` AND THE BUTTON IS `.btn`. They were a hand-rolled box and a pill.
 *
 *  8 · THE NOTE FIELD IS GONE. It is the one removal, and it is a removal rather than a fix: the endpoint
 *      PARSES `note` (max 500, with its own error key) and then never puts it in either payload, so a
 *      visitor typed «وقتاش نتصلو بيك؟» into a field labelled ملاحظة, the request succeeded, and the
 *      sentence was thrown away — neither the app nor the commercial ever learned it existed. Collecting
 *      something nothing stores is worse than not asking, so it is not asked. It comes back the day the
 *      route threads it into the RPC payload.
 *
 * ── WHAT THE SITE ASKS THAT THIS FORM STILL CANNOT ──────────────────────────────────────────────────────
 *
 * The website's offer form also asks: «من المواطنين بالخارج» (`livesAbroad`, migration 0121, a real column
 * on both intakes), «نحب نزور الأرض» (`wantsVisit`), how to be called back (`contactChannel`), a separate
 * WhatsApp number, the preferred time (`contactTimeOptionId` from the live `contact_time` list), and the
 * payment plan (`paymentMode`, `downPercentOptionId`, `durationOptionId`).
 *
 * NOT ONE OF THEM IS DRAWN HERE, and that is deliberate. `/api/mobile/interest`'s schema accepts exactly
 * eight keys — fullName, phone, governorateId, goal, email, offerCode, trees, note — and zod STRIPS anything
 * else without complaining. So adding those checkboxes to this file would repeat fault 8 above six times
 * over: six answers collected, six answers discarded, and the request written with the route's own
 * `payment_mode: "cash"` whatever the visitor chose. The route is `src/`, it is the website's, and widening
 * its schema and payload is the one change that unlocks all six at once.
 *
 * IT STILL NEVER CLAIMS MORE THAN IT DID. On success it says the interest was recorded and that somebody
 * will ring; it does not say «تم الحجز», because nothing is reserved by this and the trees are still on sale.
 */
export function InterestForm({
  offerCode,
  offerName,
  /** The tree count the calculator worked with, or the one the offer screen is showing. */
  trees,
  onDone,
}: {
  offerCode?: string | null;
  offerName?: string | null;
  trees?: number | null;
  onDone?: () => void;
}) {
  const { config } = useConfig();
  const router = useRouter();
  const { person, ready: authReady, signOut } = useAuth();

  const [fullName, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [goal, setGoal] = useState<InterestInput["goal"] | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** The buyer's own details, when somebody is signed in and the database knew them. Null asks as usual. */
  const [prefill, setPrefill] = useState<IntakePrefill | null>(null);
  /** The number as it was typed, kept for «افتح حسابي» — `dismiss` empties the field before the link is used. */
  const [sentPhone, setSentPhone] = useState("");

  const places = config.governorates;
  const signedIn = Boolean(person);

  /*
   * ما يقعدش كل مرّة يعمّر. A buyer who has an account sends from it and is not asked for his name and number
   * again — the owner's own sentence, 2026-10-22, and the mirror of what the site's two request forms do.
   *
   * IT FILLS ONLY WHAT IS STILL EMPTY, AND ONLY ONCE PER PERSON: a field the visitor has already typed in is
   * theirs, and a prefill that landed late must not overwrite it. A governorate is applied only while it is
   * still on the active list — the intake refuses an inactive one, and a pre-filled form that gets refused is
   * worse than an empty one. A failed read is not a failure on screen: the form simply stays as it was.
   */
  const personId = person?.id ?? null;
  useEffect(() => {
    if (!authReady) return;
    if (!personId) {
      setPrefill(null);
      return;
    }
    let current = true;
    void fetchIntakePrefill().then((found) => {
      if (!current || !found) return;
      setPrefill(found);
      setName((typed) => (typed === "" ? (found.fullName ?? "") : typed));
      setPhone((typed) => (typed === "" ? (found.phone ?? "") : typed));
      setPlaceId((chosen) =>
        chosen === null && found.governorateId !== null && places.some((place) => place.id === found.governorateId)
          ? found.governorateId
          : chosen,
      );
    });
    return () => {
      current = false;
    };
    // `places` is read, not depended on: a governorate list arriving later must not re-run the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, personId]);

  /** «موش إنت؟ اخرج» — the form is somebody else's, so it is emptied along with the session. */
  const notYou = useCallback(async () => {
    await signOut();
    setPrefill(null);
    setName("");
    setPhone("");
    setPlaceId(null);
  }, [signOut]);

  /**
   * Closes the confirmation and empties the form: the demand is sent, so the answers must not linger.
   *
   * «EMPTIES» MEANS BACK TO WHAT IT WAS WHEN IT OPENED. For a signed-in buyer that is his own details, not
   * blank fields — the prefill ran once, and nothing will run it again.
   */
  const dismiss = useCallback(() => {
    setDone(false);
    setReference(null);
    setName(prefill?.fullName ?? "");
    setPhone(prefill?.phone ?? "");
    setPlaceId(
      prefill && prefill.governorateId !== null && places.some((place) => place.id === prefill.governorateId)
        ? prefill.governorateId
        : null,
    );
    setGoal(null);
    setConsent(false);
    setError(null);
  }, [places, prefill]);

  /**
   * «افتح حسابي» on the confirmation. The number goes with the buyer to the sign-in screen as a PREFILL and
   * nothing else: no SMS is queued by this, and nothing is created — the code goes out only when he presses
   * «أوّل مرّة؟ ادخل برمز SMS» there, which is 0096's own door and not a second sign-up path.
   */
  const openAccount = useCallback(() => {
    const typed = sentPhone;
    dismiss();
    router.push(typed ? { pathname: "/account", params: { phone: typed } } : "/account");
  }, [dismiss, router, sentPhone]);

  /**
   * The reasons somebody wants olive trees, from `option_items`.
   *
   * FILTERED TO THE THREE CODES THE ROUTE WILL ACCEPT, which is a limit worth naming rather than hiding: its
   * schema is `z.enum(["family", "investment", "both"])`, so a fourth goal the owner adds in الإعدادات ←
   * القوائم would be refused by the route even though the intake resolves the code against the live list and
   * would have taken it. The LABELS are his, from the live rows, so renaming one reaches the app; adding one
   * needs the enum widened. Offering a row the route would bounce would be worse than leaving it out.
   */
  const goals = useMemo(() => {
    const accepted = new Set(["family", "investment", "both"]);
    return optionsFor(config, "goal").filter((option) => accepted.has(option.code));
  }, [config]);

  const international = settingBool(config, "lead.allow_international_phone", false);
  const digits = phone.replace(/[^0-9]/g, "");
  // The shape, locally, so the visitor is answered at once; the RULE is the endpoint's, through the same
  // `normalizePhone` the web form uses, and its refusal is the owner's sentence.
  const phoneOk = international
    ? digits.length >= 8 && digits.length <= 20
    : digits.length === 8 || (digits.length === 11 && digits.startsWith("216"));
  const nameOk = fullName.trim().length >= 3;
  const ready = nameOk && phoneOk && placeId !== null && goal !== null && consent;

  const send = async () => {
    setError(null);
    if (!nameOk) return setError(t(config, "ui.offer.form_error_name"));
    if (!phoneOk) return setError(t(config, "ui.errors.mobile_phone_invalid_example"));
    if (placeId === null) return setError(t(config, "ui.offer.form_error_governorate"));
    if (goal === null) return setError(t(config, "ui.register.error_goal"));
    if (!consent) return setError(t(config, "ui.offer.form_error_consent"));

    setBusy(true);
    const result = await submitInterest(
      {
        fullName: fullName.trim(),
        phone: digits,
        governorateId: placeId,
        goal,
        offerCode: offerCode ?? null,
        trees: trees ?? null,
      },
      // The language the endpoint should refuse in, and the sentence to show when it never answered at all.
      // `submitInterest` holds no Arabic of its own — ./config imports ./api, so that module cannot read a
      // setting without a cycle, and this one already has the configuration in hand.
      "ar",
      t(config, "ui.offer.form_error_network"),
    );
    setBusy(false);

    if (!result.ok) return setError(result.message);
    setReference(result.reference);
    setSentPhone(phone.trim());
    setDone(true);
    onDone?.();
  };

  if (done) {
    /*
     * The two success screens the site has, and the app picks the one that fits where the form stood: an
     * offer gets `offers.success_*`, a request with no offer behind it gets `register.success_welcome_*`.
     * Neither says «تم الحجز» — nothing is reserved by this and the trees are still on sale, which is what
     * `register.success_note` and `offers.success_text` both say in the owner's own words.
     */
    const title = offerCode ? "offers.success_title" : "register.success_welcome_title";
    const text = offerCode ? "offers.success_text" : "register.success_welcome_text";
    /*
     * IT IS A POPUP NOW, NOT A PAGE.
     *
     * The owner: «after submitting a form I don't like the page of ‹we got your thing›, make it a simple
     * popup with an X». He is right about what it was doing: replacing the whole form with a page of
     * confirmation left the reader on a screen with nothing to do and no way out but the back gesture, and
     * on the offer screen that meant a sheet inside a sheet. A confirmation is an interruption; it should
     * be dismissible, and what is underneath should still be there when it goes.
     *
     * The X resets the form rather than only hiding the card: the demand has been sent, so leaving the
     * answers in the fields invites somebody to send it twice.
     */
    return (
      <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
        <Pressable style={styles.backdrop} onPress={dismiss} accessibilityRole="button">
          {/* The card itself swallows the press, or tapping inside it would close the thing being read. */}
          <Pressable style={styles.popup} onPress={() => {}}>
            <Pressable
              onPress={dismiss}
              hitSlop={12}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel={t(config, "ui.common.close")}
            >
              <Text style={styles.closeMark}>✕</Text>
            </Pressable>
            <Text style={[type.cardTitle, { color: colour.forest }]}>{t(config, title)}</Text>
            <Text style={[type.body, { marginTop: space.tight }]}>{t(config, text)}</Text>

            {/* «رقم مطلبك» — the number the website prints and the one /track is keyed on. The app used to throw
                it away, so a visitor who submitted from the phone had nothing to quote back. */}
            {reference ? (
              <View style={{ marginTop: space.cozy, gap: space.hair }}>
                <Hint>{t(config, "ui.offer.form_request_no_label")}</Hint>
                <Text style={styles.reference}>{reference}</Text>
              </View>
            ) : null}

            {offerName && trees ? (
              <Text style={[type.caption, { marginTop: space.snug }]}>
                {formatMessage(t(config, "ui.offer.form_success_summary"), { name: offerName, count: trees })}
              </Text>
            ) : null}

            <Hint style={{ marginTop: space.snug }}>{t(config, "register.success_note")}</Hint>

            {/*
              «افتح حسابك» — offered to a reader who has no account, on the screen that already says «تمّ». The
              owner chose offering over making the account for him (2026-10-22): an account made automatically
              is an SMS to everyone who fills a form, out of the budget he is trying to cut, to people who did not
              ask. NOTHING IS SENT FROM HERE — it is a card and a button, and it is not drawn for somebody who
              is already signed in, who has the account and saw «عمّرنا معلوماتك» one screen earlier.
            */}
            {!signedIn ? (
              <View style={styles.invite}>
                <Text style={[type.cardTitle, { color: colour.forest }]}>{t(config, "ui.account_invite.title")}</Text>
                <Hint style={{ marginTop: space.hair }}>{t(config, "ui.account_invite.text")}</Hint>
                <Btn
                  label={t(config, "ui.account_invite.cta")}
                  onPress={openAccount}
                  tone="secondary"
                  style={{ marginTop: space.snug, width: "100%" }}
                />
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <KeyboardAvoidingView
      /*
       * THE TWO PLATFORMS GENUINELY DIFFER HERE, and the honest answer is to do LESS on Android, not more.
       *
       * iOS does nothing about a keyboard covering a field, so the view is lifted by its height. Android's
       * window manager already resizes or insets the window itself, so asking this component to shrink the
       * view as well shrinks it twice and the form jumps as the keyboard opens. `undefined` lets the platform
       * keep doing its own job.
       *
       * Unverified on a device: this is read from the platforms' behaviour, not observed. It is the one thing
       * in this file that should be checked on a real Android build with `edgeToEdgeEnabled` on, because
       * edge-to-edge changes how that resize arrives.
       */
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.box}
    >
      <Text style={type.cardTitle}>{t(config, offerCode ? "offers.form_title" : "site.register_meta_title")}</Text>
      <Hint style={{ marginTop: 2 }}>
        {offerName ?? t(config, offerCode ? "offers.form_intro" : "register.success_note")}
      </Hint>

      {/*
        TWO LINES ABOUT THE ACCOUNT BEHIND THE FORM, and neither blocks anything: a box for a reader we
        recognise, one quiet sentence and a link for a reader we do not. A form that stops to ask a buyer to
        sign in is a form that loses the buyers who will not — a request still goes out with no account at all.
      */}
      {prefill ? (
        <View style={[styles.prefill, { marginTop: space.cozy }]}>
          <View style={styles.prefillHead}>
            <Text style={[type.label, { color: colour.forest }]}>{t(config, "ui.prefill.title")}</Text>
            <Pressable onPress={() => void notYou()} hitSlop={10} accessibilityRole="button">
              <Text style={styles.link}>{t(config, "ui.prefill.not_you")}</Text>
            </Pressable>
          </View>
          {prefill.fullName ? <Text style={[type.label, { marginTop: space.hair }]}>{prefill.fullName}</Text> : null}
          <Hint style={{ marginTop: space.hair }}>{t(config, "ui.prefill.text")}</Hint>
          {/* Only once there is something to be «alongside»: a first request has no earlier ones. */}
          {prefill.requests > 0 ? <Hint style={{ marginTop: space.hair }}>{t(config, "ui.prefill.offer")}</Hint> : null}
        </View>
      ) : authReady && !signedIn ? (
        <Text style={[type.caption, { marginTop: space.cozy }]}>
          {t(config, "ui.prefill.sign_in")}{" "}
          <Text style={styles.link} onPress={() => router.push("/account")} accessibilityRole="link">
            {t(config, "ui.prefill.sign_in_cta")}
          </Text>
        </Text>
      ) : null}

      <View style={{ marginTop: space.cozy }}>
        <Label>{t(config, "ui.offer.form_name_label")}</Label>
        <Field
          value={fullName}
          onChangeText={setName}
          autoComplete="name"
          accessibilityLabel={t(config, "ui.offer.form_name_label")}
          invalid={fullName !== "" && !nameOk}
        />
      </View>

      <View style={{ marginTop: space.cozy }}>
        <Label>{t(config, "ui.offer.form_phone_label")}</Label>
        <Field
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          accessibilityLabel={t(config, "ui.offer.form_phone_label")}
          invalid={phone !== "" && !phoneOk}
          // A phone number is Latin digits read left to right, on an Arabic screen as on any other.
          ltr
        />
        <Hint style={{ marginTop: space.tight }}>{t(config, "ui.offer.form_phone_hint")}</Hint>
      </View>

      {/* ولاية إقامتك — a wrapped chip row. See note 5. */}
      <View style={{ marginTop: space.cozy }}>
        <Label>{t(config, "ui.offer.form_governorate_label")}</Label>
        <View style={styles.wrap}>
          {places.map((place) => (
            <Chip
              key={place.id}
              label={place.name}
              on={place.id === placeId}
              onPress={() => setPlaceId(place.id)}
            />
          ))}
        </View>
        {places.length === 0 ? <Hint>{t(config, "ui.offer.form_governorate_placeholder")}</Hint> : null}
      </View>

      {/* ما هو هدفك؟ — the owner's list, his words. */}
      {goals.length > 0 ? (
        <View style={{ marginTop: space.cozy }}>
          <Label>{t(config, "ui.register.step_goal")}</Label>
          <View style={styles.wrap}>
            {goals.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                on={option.code === goal}
                onPress={() => setGoal(option.code as InterestInput["goal"])}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* The sentence the request records, shown before it is recorded. See note 2. */}
      <View style={{ marginTop: space.cozy }}>
        <CheckRow on={consent} onToggle={() => setConsent((was) => !was)}>
          <Text style={[type.label, consent ? { color: colour.surface } : null]}>
            {t(config, "legal.consent_text")}
          </Text>
        </CheckRow>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <View style={{ marginTop: space.cozy }}>
        <Btn
          label={busy ? t(config, "ui.offer.form_sending") : t(config, "start.continue")}
          onPress={() => void send()}
          busy={busy}
          disabled={!ready}
          style={{ width: "100%" }}
        />
      </View>

      {/* PRN-01: the notice that travels on every public page of the site travels with this form too. */}
      <Hint style={{ marginTop: space.snug }}>{t(config, "legal.no_guarantee_notice")}</Hint>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  box: { ...card, padding: space.card },
  boxDone: { backgroundColor: colour.leafSoft, borderColor: colour.leaf, borderRadius: radius.card },
  // `rounded-2xl border border-forest/15 bg-forest/5 p-4` — the site's PrefillNote and AccountInvite boxes.
  prefill: {
    backgroundColor: colour.leafSoft,
    borderColor: colour.line,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space.snug,
  },
  prefillHead: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "space-between", gap: space.tight },
  invite: {
    marginTop: space.cozy,
    backgroundColor: colour.leafSoft,
    borderColor: colour.line,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space.snug,
  },
  link: { fontSize: 12.8, lineHeight: 20, color: colour.forest, textDecorationLine: "underline", fontWeight: "600" },
  // `flex flex-wrap gap-tight` — 8 apart, as the site's chip rows are.
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: space.tight },
  // The site prints the request number in the display face, large, tabular and left to right.
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(13,17,14,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.card,
  },
  popup: { ...card, width: "100%", maxWidth: 420, padding: space.card, gap: space.hair },
  close: { position: "absolute", top: space.snug, end: space.snug, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  closeMark: { fontSize: 17, lineHeight: 20, color: colour.muted },
  reference: {
    ...type.barFigure,
    fontSize: 28,
    lineHeight: 30,
    color: colour.ink,
    textAlign: "left",
  },
});
