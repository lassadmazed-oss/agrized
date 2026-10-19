# Store listing — Google Play and App Store

Everything the two consoles ask for, written from what the app actually does. Copy the fields straight
across. Where an answer is a judgement rather than a fact, the reasoning is given, because a Data Safety
form that disagrees with the privacy policy is one of the quickest ways to fail review.

Sources of truth, if any of this drifts:

| Claim | Where it is true |
|---|---|
| What the app collects | `mobile/src/api.ts` (`submitInterest`), `mobile/src/auth.tsx` |
| Push token | `mobile/src/push.ts` → `/api/mobile/push/register`, migration 0138 |
| Location | `mobile/src/nearby.ts` — haversine on the device, nothing transmitted |
| Privacy policy | `https://www.agrized.site/privacy` (settings `legal.privacy_*`, migrations 0140 + 0144) |

---

## 1 · Identity

| Field | Value |
|---|---|
| App name | `AgriZed` |
| Package / bundle id | `site.agrized.app` |
| Category | Finance — *see note* |
| Website | `https://www.agrized.site` |
| Privacy policy | `https://www.agrized.site/privacy` |
| Support email | `contact@agrized.site` |

**On the category.** *Finance* fits what people come for, but it attracts the heavier review — both stores
look harder at anything touching investment. *Lifestyle* or *Business* are defensible for an app that is a
catalogue plus a contact form and takes no money. Start with **Business**; it describes what the app does
today, and nothing in it transacts.

---

## 2 · Google Play store listing

**App name** (30 characters max)

```
AgriZed
```

**Short description** (80 characters max)

```
زيتونتك اليوم… أصل لعمر كامل. تصفّح عروض الزيتون واحسب مشروعك.
```

**Full description** (4000 characters max)

```
AgriZed يقرّبلك الاستثمار في الزيتون في تونس.

تصفّح العروض المتوفّرة، شوف تفاصيل كل ضيعة — الولاية، الصنف، عمر الزياتين، الري وعدد الزيتونات — واحسب
قدّاش يلزمك باش تبدا، كل شيء من تلفونك.

شنوّة تنجّم تعمل في التطبيق:

· تصفّح العروض المفتوحة، مرتّبة حسب الولاية
· شوف تصاور كل ضيعة ومعطياتها الفلاحية
· اعرف قدّاش تبعد عليك الأرض من بلاصتك
· احسب مشروعك: قدّاش زيتونة وقدّاش يسوى
· سجّل اهتمامك بعرض، والفريق يتصل بيك
· تبّع مطلبك برقمو
· فضاء «زيتونتي»: زياتينك، عقودك، أقساطك وزياراتك

الإشعارات (اختيارية): نعلّموك كي تتأكّد زيارة، كي يوفّى عقدك، ولا كي يقرب قسط. إشعارات على ملفّك برك،
بلا إشهار.

تسجيل الاهتمام مجاني وما يلزمك بالشراء. الأرقام الكل في التطبيق تقديرية. AgriZed ما تضمن حتّى إنتاج ولا
مردود مالي.

الموقع: نطلبو موقعك كان كي تنقر على «قدّاش يبعد عليّ؟» في صفحة عرض، والحساب يتعمل في التلفون متاعك —
الموقع ما يوصلناش.

للاتصال: contact@agrized.site
```

> The disclaimer sentences are not decoration. Both stores read an investment pitch sceptically, and the app
> already carries that wording on screen (`legal.no_guarantee_notice`). The listing must not promise what the
> product refuses to.

---

## 3 · Data safety (Play) / App Privacy (Apple)

Answer exactly this. Each line is checkable against the code.

### Collected and sent off the device

| Data type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Name | Yes | No | App functionality — the interest request | Yes |
| Phone number | Yes | No | App functionality, account | Yes |
| Email address | Yes | No | App functionality | Yes (optional field) |
| Approximate location — **governorate only, typed by the person** | Yes | No | App functionality | Yes |
| User IDs — push token, person id | Yes | No | App functionality — notifications | Yes |
| App interactions / diagnostics | No | — | — | — |

**Encrypted in transit:** Yes — HTTPS everywhere.
**Can users request deletion:** Yes — `contact@agrized.site`, stated in the privacy policy.

### Precise location — **NOT collected**

This is the answer people get wrong and it is the one most likely to be checked, because the manifest
carries a location permission.

The app asks for location **only** when someone taps «قدّاش يبعد عليّ؟» on an offer. The offer's coordinates
are already on the device; `mobile/src/nearby.ts` runs the haversine there and shows a number. **No position
is transmitted, logged or stored** — not to AgriZed, not to anyone.

So: location permission **yes**, location data collection **no**. If Play's form will not accept that pair,
say the data is *accessed but not collected*, and point to the privacy policy section «موقعك», which says the
same thing in Arabic.

Background location: **not requested** — `isAndroidBackgroundLocationEnabled` and
`isIosBackgroundLocationEnabled` are both `false` in `mobile/app.json`.

### Third parties that see data

| Who | What | Why |
|---|---|---|
| Supabase | everything stored | hosting and database |
| Expo (push service) | push token, notification title and body | delivering notifications |
| WinSMS | phone number, message text | delivering SMS |

All three are named in the privacy policy. Notification payloads carry **ids only** — never an amount or a
name — because a notification sits on a lock screen (migration 0138).

---

## 4 · Content rating questionnaire

Answer **No** to every question about violence, sexual content, profanity, drugs, gambling and user-generated
content. The app has no chat, no user content and no ads.

- Does the app contain ads? **No**
- Does it allow users to interact or exchange content? **No**
- Does it share user location with other users? **No**
- Does it contain gambling or simulated gambling? **No** — this is the one to read carefully. Investment is
  not gambling, and the app takes no stake and pays out nothing. Answer No.

Expected result: **PEGI 3 / Everyone**, with a *Finance* qualifier if you chose the finance category.

---

## 5 · Graphics

Generated from the one brand source by `npm run brand:icons`, committed, and ready to upload:

| File | Size | Where it goes |
|---|---|---|
| `store/play-icon-512.png` | 512 × 512 | Play listing icon |
| `store/play-feature-graphic.png` | 1024 × 500 | Play feature graphic — **required** |

Both are fully opaque, which both slots require. The feature graphic knocks the lockup out of the artwork
by luminance and paints it cream on brand green — the artwork itself is opaque corner to corner, so placing
it directly would have framed the logo in a cream box. The lockup is held to 62% of the width because Play
crops and overlays this image differently across its surfaces, and anything near an edge can be lost.

Re-run `npm run brand:icons` after replacing the artwork; the outputs are committed, so a deploy never
depends on the script having run.

## 6 · Screenshots

Play requires **2–8 phone screenshots**, 16:9 or 9:16, each side between 320 px and 3840 px.
1080 × 1920 is the safe size. Apple wants 6.7" (1290 × 2796) and, because `supportsTablet: true`,
**iPad screenshots too** — turn that off in `app.json` if you do not want to produce them.

Take them from the real app, not a mock-up. Once the preview APK is installed:

1. Open each screen below, wait for it to finish loading, take a normal phone screenshot
2. Crop out the status bar only if it shows a low battery or a carrier you would rather not publish

The five worth shipping, in this order — the first two are what most people ever look at:

| # | Screen | Why it earns the slot |
|---|---|---|
| 1 | الرئيسية | the promise, the live figures, the newest offers |
| 2 | العروض | the catalogue — the thing people came for |
| 3 | one offer | photographs and the farm facts |
| 4 | احسب | the calculator, with a number on screen |
| 5 | حسابي | the file, and the notifications row |

Avoid an empty state, a skeleton, or a screen mid-load. A screenshot of a spinner is a screenshot of nothing.

---

## 6b · The declarations on the «Set up your app» dashboard

Play asks a dozen yes/no questions before it will let you release. Most are obvious. Two are not, and both
can cost you a rejection or a licensing demand if answered carelessly.

### Financial features — the one to get right

Play asks whether the app provides loans, debt management, insurance, **investments and trading**, crypto,
or other financial products. Declare investments and some regions demand a regulatory licence before the app
can ship.

**The honest answer for AgriZed today is «My app doesn't provide any financial features».** The app:

- moves no money — there is no payment, no wallet, no balance, no checkout
- executes no transaction — `submitInterest` writes a name, a phone and a governorate
- gives no advice — the assistant is forbidden from saying «invest» or «don't» (migration 0080)
- states plainly that nothing is guaranteed (`legal.no_guarantee_notice`)

The purchase itself happens offline, in a contract, outside the app. That is a catalogue and a contact form,
not a financial service.

**This changes the day the app takes a payment or shows a balance.** If `contracts` or `installments` are
ever surfaced to buyers with real figures inside the app, revisit this answer before that release — not
after.

### App access — reviewers must be able to see زيتونتي

Anything behind a sign-in is invisible to the reviewer, and Play rejects apps whose content it cannot reach.
The فضاء «زيتونتي» section needs a phone number and a password, so you must declare it and supply working
credentials:

> **App access → All or some functionality is restricted** → add an instruction for زيتونتي with a phone
> number and password a reviewer can actually sign in with.

Create a real client account for this and leave it alone. Note the password goes into Play Console, so use
an account that holds nothing sensitive — not your own file.

### The rest

| Question | Answer |
|---|---|
| Ads | **No** — the app shows none |
| Target audience | **18+** — it is about buying agricultural land |
| News app | No |
| Government app | No |
| COVID-19 contact tracing | No |
| Data safety | section 3 above |
| Content rating | section 4 above |
| Privacy policy | `https://www.agrized.site/privacy` |

## 7 · Order of operations on Play

Production is disabled until the testing requirement is met, so the sequence is fixed:

1. Finish the phone verification — nothing can be created before it
2. Create the app, fill in this listing, the Data Safety form and the content rating
3. Upload the **AAB** (`eas build --profile production --platform android`) to **internal testing** first —
   it reaches your own testers in seconds
4. Move to **closed testing** and get **12+ testers opted in**
5. Wait **14 continuous days**. If the count drops below 12 the clock restarts, so recruit 15–20
6. Apply for production access and answer their questions about the test
7. Google reviews, then you release

Steps 1–3 are one afternoon. Step 5 is the floor nothing shortens.


---

## 8 · Closed testing: recruiting the 12

This is the slowest part of the whole launch and the only one that cannot be bought or rushed. **12 testers
opted in continuously for 14 days.** If the count drops below 12 on any day, the clock restarts.

So recruit **15–20**. The extras are not optimism, they are the margin for the two or three people who
change phone, clear their Google account, or lose interest in week two.

### Use a Google Group, not an email list

Play lets you add testers either as a pasted list of addresses or as a Google Group. Use the **Group**:

- people join themselves, so you are not collecting addresses by hand
- you can see at a glance how many are actually in, which is the number Play counts
- adding someone in week two does not mean editing the track

Create a group (e.g. `agrized-testers@googlegroups.com`), then in Play Console:
**Test and release → Testing → Closed testing → Create track → Testers → Google Groups**.

### What a tester must do

They need a **Google account on an Android phone**, and they must:

1. Open the opt-in link you send
2. Tap **Become a tester**
3. Install AgriZed from the Play link that then appears
4. **Leave it installed for two weeks**

Point 4 is the one to say out loud. People help by installing, then tidy their phone a week later and
silently reset your clock.

### The message to send

Arabic, ready to forward on WhatsApp — replace the link before sending:

```
عسلامة 👋

عملت تطبيق AgriZed — تطبيق تونسي للاستثمار في الزيتون. قبل ما نحطّوه في Google Play،
لازمني 12 شخص يجرّبوه مدّة أسبوعين (شرط من Google، موش منّي 😅).

شنوّة لازمك تعمل:
1. تحلّ الرابط هذا من تلفونك الأندرويد: [الرابط]
2. تنقر «Become a tester»
3. تنزّل التطبيق وتشوفو
4. ⚠️ تخلّيه مركّب أسبوعين — كان تشيلو، العدّاد يرجع من الأول

ما فمّا حتّى خلاص وما فمّا حتّى التزام. كان تلقى حاجة ما تخدمش، قلّي.
برشا يعيشك ❤️
```

French, for anyone who prefers it:

```
Salut 👋

J'ai développé AgriZed, une application tunisienne pour investir dans l'olivier. Avant de la publier
sur Google Play, il me faut 12 personnes qui la testent pendant deux semaines (une exigence de Google).

Ce qu'il faut faire :
1. Ouvrir ce lien depuis ton téléphone Android : [lien]
2. Appuyer sur « Become a tester »
3. Installer l'application et y jeter un œil
4. ⚠️ La garder installée deux semaines — si tu la désinstalles, le compteur repart à zéro

Rien à payer, aucun engagement. Si quelque chose ne marche pas, dis-le moi.
Merci beaucoup ❤️
```

### Keep a list

Play shows you a count, not who left. Keep your own so you can chase the right person:

| # | Name | Opted in | Still in? |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

Check it twice a week. The day the count touches 11, the fourteen days start again from that day — and
nothing in the console will warn you.

### Before you start the clock

Do not open the closed track until the listing, the Data Safety form and the content rating are all
submitted. You want the 14 days running in the background while you finish everything else, not after.
