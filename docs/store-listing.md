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

## 5 · Screenshots

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

## 6 · Order of operations on Play

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
