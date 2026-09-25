import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "../../src/components";
import { InterestForm } from "../../src/InterestForm";
import { card, colour, space, type } from "../../src/theme";

/** The company's own number, so somebody who would rather talk can. */
const PHONE = process.env.EXPO_PUBLIC_CONTACT_PHONE ?? "";

/**
 * اتصل بينا — the form, and the two ways to reach a human instead.
 *
 * The form is the same component the offer screen uses, with no offer attached: this is somebody who has not
 * chosen one yet, and making them pick before they can ask a question is the sort of gate that loses the
 * question. WhatsApp and the phone are here because a Tunisian buyer deciding on something this size will
 * want to hear a voice, and pretending otherwise costs sales.
 */
export default function ContactScreen() {
  const digits = PHONE.replace(/[^0-9]/g, "");
  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <InterestForm />

      {digits ? (
        <View style={[styles.box, { marginTop: space.lg }]}>
          <Text style={type.heading}>ولا تحب تحكي معانا؟</Text>
          <Text style={[type.note, { marginTop: 2, marginBottom: space.md }]}>
            نجّمو نجاوبوك على الأسعار، على الضيعات، وعلى الخدمات.
          </Text>
          <Button label="واتساب" onPress={() => void Linking.openURL(`https://wa.me/${digits}`)} tone="quiet" />
          <View style={{ height: space.sm }} />
          <Button label={`تلفون · ${PHONE}`} onPress={() => void Linking.openURL(`tel:+${digits}`)} tone="quiet" />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, paddingBottom: space.xxl },
  box: { ...card, padding: space.lg, backgroundColor: colour.surface },
});
