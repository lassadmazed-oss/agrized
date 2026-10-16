# AgriZed — تطبيق الموبايل

The client app: browse the olive offers, work out what a number of trees would cost, and register interest.
Expo + React Native, one codebase for iOS and Android.

It is **not** the Back Office. Selling, confirming and collecting instalments stay on the web admin, which is
where the staff roles and the row-level security live.

---

## Running it

```bash
cd mobile
cp .env.example .env     # then fill in the two Supabase values
npm install
npx expo start
```

Scan the QR code with **Expo Go** (iOS App Store / Play Store). For a build that includes native modules,
see *Publishing* below.

`.env` is git-ignored. The anon key belongs in it; the **service role key must never** go near this folder —
anything bundled into an app is readable by whoever installs it.

---

## How it gets its data, and why writes take a different road

**Reading goes straight to Postgres.** `public_projects` is granted to `anon`, returns only what the website
already shows a stranger, and filters every row inside the function. The app reads the same offers the site
reads, with no server in between to be down.

**Writing cannot.** `submit_interest_request` and `submit_offer_request` are granted to `service_role` alone —
they write a person and a demand. So a submission is POSTed to the website:

```
POST https://www.agrized.site/api/mobile/interest
{ fullName, phone, governorateId, goal, offerCode?, trees?, note? }
→ { ok: true, reference: "AGZ-2026-000052" }
```

The endpoint (`src/app/api/mobile/interest/route.ts` in the web repo) re-validates everything the app already
checked — the name, the phone through the same `normalizePhone` the web form uses, the governorate against
`public.governorates`, and the offer code against the offers open at that moment. A request from an app is a
request from the internet.

What the app is **not** allowed to send: a price, a payment plan, or the consent wording. Those are the
database's and the owner's settings. A field a client could set is a field a client could lie about.

---

## Screens

| | |
|---|---|
| `app/(tabs)/index.tsx` | الرئيسية — the promise, live figures, the newest three offers |
| `app/(tabs)/offers.tsx` | العروض — every open offer, filtered by governorate, pull to refresh |
| `app/(tabs)/calculator.tsx` | احسب — trees × the offer's published price, labelled an estimate |
| `app/(tabs)/contact.tsx` | اتصل بينا — the interest form, WhatsApp and a phone number |
| `app/offer/[code].tsx` | one offer: photograph, facts, and the form |

`src/theme.ts` carries the website's palette as plain values — it cannot be imported across that boundary, so
every colour names its source. Arabic is written with `writingDirection: "rtl"` per text rather than by forcing
`I18nManager`: forcing it only takes effect after a restart, so the first run after install would be laid out
backwards, and that first impression cannot be taken back.

---

## Native capabilities

Two system features, both added 2026-10-16. Each is asked for by a tap, never on launch — **iOS allows one
permission prompt per install**, and a refusal cannot be undone from inside the app.

| | |
|---|---|
| `src/push.ts` | Notifications. Permission, the Expo token, and `POST /api/mobile/push/register`. The rest was already built: 0138 holds the devices, 0139 claims the rows, `src/lib/push.ts` in the web repo sends them. |
| `src/nearby.ts` | «قدّاش يبعد عليّ؟» on an offer. Haversine between the phone and the offer's published coordinates — which `public_project_page` returns only where the team ticked «إظهار الموقع». |

**No position and no token is stored on the phone or sent anywhere beyond that one endpoint.** The distance
is computed on the device. That is also the answer to both stores' data-safety questions.

A push token is addressed **by phone number** (0138), so a device registered without one receives nothing.
`src/auth.tsx` therefore keeps the number the person signed in with, in the Keychain beside the session.

**Remote push does not work in Expo Go** — it needs a development or production build. `enablePush()` reports
`unsupported` there rather than treating it as a fault, and the row hides itself.

---

## Publishing

**What is ready:** bundle identifiers (`site.agrized.app` on both stores), icons, the notification silhouette,
splash, version, `eas.json` with its three profiles, and the EAS project id in `app.json`. `npx expo config
--type prebuild` resolves clean, with `NSLocationWhenInUseUsageDescription` and
`ITSAppUsesNonExemptEncryption` in the Info.plist.

**What needs your accounts** — these require credentials that are yours:

1. `npm i -g eas-cli && eas login`
2. `eas build --profile preview --platform android` — an APK to install and try on a real phone. **Do this
   first:** it is the only way to test notifications, and it needs no Apple account and no Mac.
3. For iOS: an **Apple Developer** membership (99 USD/year), then `eas credentials` → iOS → **Push Key**, and
   let EAS create and upload the APNs `.p8`. Without it the app builds and installs and simply never buzzes.
4. `eas build --profile production --platform all`
5. `eas submit --platform ios` / `--platform android`

**A Mac is not required.** EAS builds on its own macOS machines and `eas submit` uploads from there; this
repo has been developed and verified on Windows throughout. A Mac only becomes necessary if you want to run
the iOS simulator locally or debug a native crash.

Before the production build, set `EXPO_PUBLIC_SITE_URL` to the live site (already the default in `eas.json`)
and `EXPO_PUBLIC_CONTACT_PHONE` to the number that should ring.

### What the stores will ask

- A **privacy policy URL** (the site serves one — migration 0140).
- **Screenshots**, including iPad: `app.json` sets `supportsTablet: true`.
- **Data safety / App Privacy.** The app collects a name, a phone number and a governorate and sends them to
  AgriZed. It also registers a push token. It asks for location **when in use**, computes a distance on the
  device, and neither stores nor transmits it — say exactly that.
- **No in-app purchases.** Nothing is transacted in the app, so Apple's 3.1.1 does not apply; olive trees are
  physical goods, which are exempt in any case.

### Guideline 4.2, and why this app is not at risk

4.2 rejects "a repackaged website". This app has **no WebView** — the two places that mention one say so,
and `react-native-webview` is not a dependency. It reads Postgres directly, draws its own screens, and now
uses notifications and location. That is a native app by any reading.

### Camera — deliberately not shipped

`expo-image-picker` was installed, then removed along with `NSCameraUsageDescription` and
`NSPhotoLibraryUsageDescription`. **Nothing in this app can receive a photograph:** there is no land-offer
form here and no upload endpoint beside `/api/mobile/interest`. Declaring a camera permission the app never
exercises invites the review question it was meant to avoid.

The honest way to add it is to build the thing that needs it — the landowner form (`/land` on the website),
with signed upload URLs the way the web flow does it. Then the camera has a destination and a reason.
