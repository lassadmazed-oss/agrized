import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { siteUrl } from "../../src/api";
import { settingText, t } from "../../src/config";
import { card, colour, frame, space, type } from "../../src/theme";
import { Btn, Failure } from "../../src/ui";
import { useConfig } from "../../src/use-config";

/**
 * حسابي — the fourth tab, and the honest answer to the one place the website has more than the app.
 *
 * WHAT IT REPLACES. The tab here was «اتصل بينا»: a form and two call buttons, answering to no website screen
 * at all. The site's fourth tab is «حسابي» and it points at فضاء «زيتونتي» — the buyer's own file: their
 * trees and their numbers, their requests, their holds, their visits, their payments, their contracts and
 * instalments, the farm work done on their trees, their subscription, their share of the harvest and their
 * documents. Ten sections, every one of them already built and already answered by the database.
 *
 * WHAT A SIGNED-OUT VISITOR SEES, WHICH IS WHAT THIS SCREEN IS. `src/app/[lang]/(public)/zitounti/page.tsx`
 * returns `ClientLoginPanel` with no session and nothing else — the account screen itself is drawn only for a
 * buyer who has signed in. So the panel IS the screen, and this is it, at the pixel: `max-w-md px-4
 * py-section`, the title in Markazi at 1.5rem over forest-700, the owner's note at 0.95rem/1.75 in muted, and
 * a `.card p-card` holding the door. Nothing of the signed-in screen is drawn, because a fake account page
 * with somebody else's figures on it is the one thing worse than an empty one.
 *
 * ── WHY THE DOOR ITSELF IS NOT NATIVE, VERIFIED AGAINST THE LIVE DATABASE ────────────────────────────────
 *
 * This is the part worth reading, because it is not a gap that more work in this folder would close.
 *
 * The buyer's sign-in is phone + password (0108), with a code by SMS the first time (0096). Every leg of it
 * needs the SERVICE ROLE key:
 *
 *   · `src/lib/client-auth.ts`'s `signInWithPassword` opens an admin client, calls
 *     `public.client_password_attempt` for the rate-limit gate, reads `public.persons` by phone, and only
 *     then derives the auth user's address from the PERSON'S UUID (`clientEmail(person.id)`) to hand to
 *     `auth.signInWithPassword`. The password step itself is plain Supabase auth and the anon key could do
 *     it — but the phone-to-person lookup that produces the address cannot.
 *   · Probed with the anon key against the live project, every one of them is refused:
 *       `persons`                       → 42501 permission denied for table persons
 *       `client_password_attempt`       → 42501 permission denied for function
 *       `request_client_login_code`     → 42501
 *       `verify_client_login_code`      → 42501
 *       `my_zitounti_file`              → 42501
 *       `client_password_policy`        → 42501
 *     Migration 0096 revokes the three login functions from `public, anon, authenticated` explicitly and
 *     writes the reason beside them: «Writes no session and grants no role — the server does that with a true
 *     answer. Service role only.»
 *
 * That is the same decision as the interest write, and it is the right one: the service key can read and
 * rewrite every table in the business, and anything shipped inside an app is readable by whoever installs it.
 * So the app cannot sign a buyer in by itself, and it must not pretend to: a phone-and-password form that
 * posts to an endpoint which does not exist would take a real password and answer «ما نجّمناش», and a form
 * that collects a password it has no use for teaches people to type passwords into things that do not use
 * them.
 *
 * WHAT IS DRAWN INSTEAD. The owner's own «دخول», opening زيتونتي where the session actually works, and the
 * owner's own help line (`ui.login.help_call` with `site.contact_phone`) — which is the sentence that already
 * sits at the foot of that panel on the website, for exactly this reader. No Arabic is invented here and no
 * figure is shown that nobody has earned.
 *
 * WHAT UNLOCKS THE NATIVE SCREEN. One route beside `/api/mobile/interest`, holding the service key on the
 * website's own server as that one does, doing the two steps the app may not: the rate-limit gate and the
 * phone-to-address lookup. With the address in hand the app signs in with the anon key like any Supabase
 * client, and `my_zitounti_file()` then answers that session — so the ten rows and the holdings card can be
 * built natively on top of it with no further server work. That is a `src/` change and belongs to whoever
 * owns the website.
 */
export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { config, failed, reload } = useConfig();

  const phone = settingText(config, "site.contact_phone");
  const helpDigits = phone.replace(/[^0-9+]/g, "");

  return (
    <ScrollView
      style={{ backgroundColor: colour.paper }}
      contentContainerStyle={[styles.page, { paddingTop: space.section + insets.top }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        {/* `font-display text-2xl font-bold text-forest-700` — Markazi, and forest-700 rather than forest:
            this panel's title is the one on the site that sits a shade darker. */}
        <Text style={[type.pageTitle, { color: colour.forest700 }]}>{t(config, "zitounti.title")}</Text>

        {/* `mt-2 text-[0.95rem] leading-7 text-muted` — the owner's own explanation of how to get in. */}
        <Text style={[type.label, styles.note]}>{t(config, "zitounti.password_login_note")}</Text>

        <View style={styles.card}>
          <Btn
            label={t(config, "ui.login.submit_sign_in")}
            onPress={() => void Linking.openURL(`${siteUrl}/zitounti`)}
            // `.btn btn-primary w-full min-h-13` — the one control on this panel, at 52 rather than 48.
            minHeight={52}
            style={{ width: "100%" }}
          />

          {/* The site's own help line on this panel: the number is a `tel:` link there and here. */}
          {helpDigits ? (
            <Text
              accessibilityRole="link"
              onPress={() => void Linking.openURL(`tel:${helpDigits}`)}
              style={styles.help}
            >
              {t(config, "ui.login.help_call", { phone })}
            </Text>
          ) : null}
        </View>

        {/*
          A configuration that did not answer leaves every word above printing its own key, which is `t()`'s
          rule and the right one — but it is not a screen to leave a reader staring at. The owner's own
          network sentence says what happened, and the button retries the read rather than the whole app.
        */}
        {failed ? (
          <Failure
            text={t(config, "ui.offer.form_error_network")}
            retryLabel={t(config, "ui.pages.error_retry")}
            onRetry={reload}
          />
        ) : null}

        {/*
          The website closes this panel with its language switcher (`PhoneLanguage`). It is not drawn here
          because the app has one language: `theme.ts` holds the direction in a single constant and the
          settings read is already language-shaped, so the switcher arrives with the other four languages
          rather than ahead of them. Said out loud so it reads as a decision and not as a missing control.
        */}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // `px-4 py-section` — 16 across, 40 above and below. The top gains the status bar's own inset.
  page: { paddingHorizontal: frame.gutter, paddingBottom: space.section },
  // `mx-auto w-full max-w-md`
  column: { width: "100%", maxWidth: frame.maxWidth, alignSelf: "center" },
  note: { marginTop: space.tight, lineHeight: 28, color: colour.muted },
  // `.card mt-6 p-card`
  card: { ...card, marginTop: space.roomy, padding: space.card, gap: space.cozy },
  // `pt-1 text-center text-caption leading-7 text-muted`, with the number itself in forest and semibold.
  help: {
    ...type.caption,
    marginTop: space.hair,
    lineHeight: 28,
    textAlign: "center",
    color: colour.muted,
  },
});
