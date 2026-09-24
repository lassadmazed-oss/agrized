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

## Publishing

**What is ready:** bundle identifiers (`site.agrized.app` on both stores), icons, splash, version and build
numbers, and `eas.json` with `development` / `preview` / `production` profiles.

**What needs your accounts** — I cannot do these, they require credentials that are yours:

1. `npm i -g eas-cli && eas login`
2. `eas init` — this replaces the placeholder `extra.eas.projectId` in `app.json` with the real one.
3. `eas build --profile preview --platform android` — an APK you can install and try on a real phone.
4. `eas build --profile production --platform all` — the store builds.
5. `eas submit --platform ios` / `--platform android`.

For the stores you will also need: an **Apple Developer** membership (99 USD/year) and a **Google Play**
developer account (25 USD once), a privacy policy URL, and screenshots. The app collects a name, a phone
number and a governorate and sends them to AgriZed — that is what the privacy answers must say on both
stores.

Before the production build, set `EXPO_PUBLIC_SITE_URL` to the live site (it is already the default in
`eas.json`) and `EXPO_PUBLIC_CONTACT_PHONE` to the number that should ring.
