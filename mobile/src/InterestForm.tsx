import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { fetchGovernorates, submitInterest, type Governorate, type InterestInput } from "./api";
import { Button } from "./components";
import { card, colour, radius, space, type } from "./theme";

/**
 * «سجّل اهتمامك» — the only thing this app writes.
 *
 * WHAT IT ASKS AND WHY IT IS SO SHORT. A name, a number and a governorate — and the governorate only because
 * the intake will not write a demand without one («اختر ولايتك من القائمة»). Everything else the business
 * needs — the budget, the visit, how many trees — is asked on the phone call that follows, by a person who
 * can hear the answer. A form that asks eleven questions on a 6-inch screen is abandoned at the fourth, and
 * an abandoned form tells the company nothing at all.
 *
 * IT VALIDATES TWICE AND TRUSTS NEITHER SIDE. Here, so the visitor is told immediately and in Arabic; and
 * again on the website's endpoint, because a request from an app is a request from the internet. The phone
 * rule is the one the intake uses: 8 digits, Tunisian, with or without the country code.
 *
 * IT NEVER CLAIMS MORE THAN IT DID. On success it says the interest was recorded and that somebody will
 * ring — it does not say «تم الحجز», because nothing is reserved by this and the trees are still on sale.
 */
export function InterestForm({
  offerCode,
  offerName,
  onDone,
}: {
  offerCode?: string | null;
  offerName?: string | null;
  onDone?: () => void;
}) {
  const [fullName, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [places, setPlaces] = useState<Governorate[]>([]);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [goal, setGoal] = useState<InterestInput["goal"]>("investment");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The governorates, for the one question the intake will not do without. They are fetched here rather than
  // passed in so the form works wherever it is dropped — on an offer, or on its own tab.
  useEffect(() => {
    void fetchGovernorates()
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, []);

  const digits = phone.replace(/[^0-9]/g, "");
  const phoneOk = digits.length === 8 || (digits.length === 11 && digits.startsWith("216"));
  const nameOk = fullName.trim().length >= 3;
  const placeOk = placeId !== null;

  const send = async () => {
    setError(null);
    if (!nameOk) return setError("اكتب إسمك ولقبك.");
    if (!phoneOk) return setError("رقم التلفون موش صحيح. مثال: 98 123 456.");
    if (placeId === null) return setError("إختار ولايتك.");

    setBusy(true);
    const result = await submitInterest({
      fullName: fullName.trim(),
      phone: digits,
      governorateId: placeId,
      goal,
      offerCode: offerCode ?? null,
      note: note.trim() || null,
    });
    setBusy(false);

    if (!result.ok) return setError(result.message);
    setDone(true);
    onDone?.();
  };

  if (done) {
    return (
      <View style={[styles.box, { backgroundColor: colour.leafSoft, borderColor: colour.leaf }]}>
        <Text style={[type.heading, { color: colour.forest }]}>وصلنا طلبك ✓</Text>
        <Text style={[type.note, { marginTop: space.xs }]}>
          الفريق باش يتصل بيك في أقرب وقت. ما تحجزناش حتى زيتونة توّا — الحجز يتعمل معاك في التلفون.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={type.heading}>سجّل اهتمامك</Text>
      <Text style={[type.note, { marginTop: 2 }]}>
        {offerName ? `بـ «${offerName}». إسمك ورقمك برك، ونتصلو بيك.` : "إسمك ورقمك برك، ونتصلو بيك."}
      </Text>

      <Field label="الاسم واللقب" value={fullName} onChange={setName} placeholder="محمد بن علي" />
      <Field
        label="رقم التلفون"
        value={phone}
        onChange={setPhone}
        placeholder="98 123 456"
        keyboard="phone-pad"
        ltr
      />
      {/* The governorate. A wrapped strip and not a dropdown: 24 short Arabic words fit in four rows, and a
          native picker on Android opens a modal that hides the form the visitor is halfway through. */}
      <View style={{ marginTop: space.md }}>
        <Text style={[type.caption, { marginBottom: space.xs }]}>ولايتك</Text>
        <ScrollView style={styles.places} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <View style={styles.placeRow}>
            {places.map((place) => {
              const on = place.id === placeId;
              return (
                <Pressable
                  key={place.id}
                  onPress={() => setPlaceId(place.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.place, on && styles.placeOn]}
                >
                  <Text style={[type.caption, { fontWeight: "600", color: on ? colour.forest : colour.muted }]}>
                    {place.name_ar}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Why they want trees. The intake will not write a demand without it, and it is the first thing the
          commercial would have asked on the call anyway — three words, so it costs the form one line. */}
      <View style={{ marginTop: space.md }}>
        <Text style={[type.caption, { marginBottom: space.xs }]}>علاش تحب زياتين؟</Text>
        <View style={styles.placeRow}>
          {(
            [
              ["investment", "ملكية واستثمار"],
              ["family", "إستهلاك عائلي"],
              ["both", "الاثنين"],
            ] as const
          ).map(([code, label]) => {
            const on = goal === code;
            return (
              <Pressable
                key={code}
                onPress={() => setGoal(code)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.place, on && styles.placeOn]}
              >
                <Text style={[type.caption, { fontWeight: "600", color: on ? colour.forest : colour.muted }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Field label="ملاحظة (اختياري)" value={note} onChange={setNote} placeholder="وقتاش نتصلو بيك؟" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ marginTop: space.md }}>
        <Button label="إبعث" onPress={send} busy={busy} disabled={!nameOk || !phoneOk || !placeOk} />
      </View>
      <Text style={[type.caption, { marginTop: space.sm }]}>
        معطياتك تتستعمل برك باش نتصلو بيك على هذا الطلب.
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  ltr,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  keyboard?: "phone-pad";
  ltr?: boolean;
}) {
  return (
    <View style={{ marginTop: space.md }}>
      <Text style={[type.caption, { marginBottom: space.xs }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colour.muted}
        keyboardType={keyboard}
        autoCorrect={false}
        accessibilityLabel={label}
        // A phone number is read left to right in every language; the rest of the form is not.
        style={[styles.field, ltr ? { textAlign: "left", writingDirection: "ltr" } : null]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { ...card, padding: space.lg },
  field: {
    borderWidth: 1,
    borderColor: colour.lineStrong,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colour.ink,
    backgroundColor: colour.paper,
    textAlign: "right",
    writingDirection: "rtl",
  },
  error: { marginTop: space.md, color: colour.danger, fontSize: 13, textAlign: "right", writingDirection: "rtl" },
  // Bounded, so the list of 24 never pushes the send button off the screen.
  places: { maxHeight: 132 },
  placeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: space.sm },
  place: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.paper,
    paddingHorizontal: space.md,
    paddingVertical: 7,
  },
  placeOn: { backgroundColor: colour.leafSoft, borderColor: colour.leaf },
});
