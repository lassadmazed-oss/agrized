import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

import { submitInterest, type InterestInput } from "./api";
import { formatMessage, optionsFor, settingBool, t } from "./config";
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

  const [fullName, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [goal, setGoal] = useState<InterestInput["goal"] | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const places = config.governorates;

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
    return (
      <View style={[styles.box, styles.boxDone]}>
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
      </View>
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
  // `flex flex-wrap gap-tight` — 8 apart, as the site's chip rows are.
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: space.tight },
  // The site prints the request number in the display face, large, tabular and left to right.
  reference: {
    ...type.barFigure,
    fontSize: 28,
    lineHeight: 30,
    color: colour.ink,
    textAlign: "left",
  },
});
