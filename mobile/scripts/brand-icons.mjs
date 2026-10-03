// Draws the native app's icons from the owner's logo — the mobile twin of ../../scripts/brand-icons.mjs.
//
//   node scripts/brand-icons.mjs        (from mobile/)
//
// WHY THIS EXISTS. The Expo app shipped with the template's artwork: assets/icon.png was the stock blue
// chevron with the construction guides still drawn on it, and the splash was the blank template grid. The
// owner's emblem has been the website's face since 2026-10-03, so on a home screen beside the installed site
// they were two different products. These three files are now drawn from the same single source.
//
// IT IS A COPY OF THE WEBSITE'S `square()`, DELIBERATELY, and the numbers are copied with it:
//
//   · ONE SOURCE, assets/agrized-emblem.webp, byte for byte the same file as public/brand/agrized-emblem.webp.
//     It is duplicated into mobile/ rather than read across the tree because a native bundle cannot reach out
//     of its own project directory, and because this app must build when only mobile/ is checked out.
//
//   · THE ARTWORK HAS AN ALPHA CHANNEL AND NOTHING TRANSPARENT IN IT — its corners read #FFFFFA at full
//     opacity. So the emblem cannot be composited onto the brand green: that would frame it in a white box.
//     It is drawn on that same off-white instead, which makes the square read as part of the drawing. An app
//     icon has to be opaque in any case — iOS fills transparency with black, and this brand is not a logo on
//     a black square.
//
//   · `fit: "contain"` keeps the drawing's proportions. The emblem is 256×241; stretched to a square the «A»
//     would thicken. `coverage` is the share of the square the art occupies, and the rest is margin.
//
// THE THREE COVERAGES, each one a different mask doing the cropping:
//
//   icon.png            0.86   iOS and the Play listing. The platform applies its own rounded-rect, which
//                              takes only the corners, so the art may sit close to the edge.
//   adaptive foreground 0.60   Android crops an installed icon to whatever shape the launcher uses — circle,
//                              squircle, teardrop. 0.60 keeps the emblem inside the safe circle so no mask
//                              can cut into it, and the off-white bleeds to the edge to fill whatever the
//                              launcher keeps. It is the same 0.6 as the website's maskable-512.
//   splash-icon.png     0.70   expo-splash-screen centres this on `backgroundColor` at `imageWidth`, so the
//                              margin here is only what keeps the art off its own edge.
//
// THE SPLASH GROUND IS #FFFFFA AND NOT THE BRAND GREEN, which is a change from what app.json used to say.
// The reason is not a preference: src/app/manifest.ts already answers this exact question for the installed
// web app with `background_color: "#fffffa"` and `theme_color: "#1f4a2c"` — the paper is the splash, the
// green is the bar. On forest green an opaque off-white emblem reads as a sticker stuck on the screen. The
// two installs now open on the same colour.
//
// `sharp` resolves from the repository root's node_modules (Node walks up), the same copy the website's
// script uses. It is a build-time tool and is not a dependency of the app.
//
// -----------------------------------------------------------------------------------------------------
// WHAT CHANGED IN app.json AT THE SAME TIME, recorded here because JSON cannot hold a comment and a
// `_comment` key makes Expo print «Ignoring extra keys» on every single command.
//
//   · THE ROOT `splash` BLOCK AND `newArchEnabled` ARE GONE. Neither existed in the SDK 57 schema and both
//     were silently ignored — checked, not assumed, against node_modules/@expo/config-types: the root
//     ExpoConfig has `icon` but no `splash` (it survives only under `web`, for PWAs), and `newArchEnabled`
//     appears nowhere in the file, because the new architecture is the default in 57. expo-splash-screen was
//     in dependencies, imported nowhere and absent from `plugins`, so the app in fact had NO splash
//     configuration at all. It is a plugin entry now, with the props its own types.d.ts declares.
//
//   · THE ADAPTIVE ICON IS A FOREGROUND PLUS A FLAT COLOUR. `backgroundImage` and `monochromeImage` both
//     pointed at the Expo template's artwork. The monochrome one is the worst of the three: it is what
//     Android 13+ draws when the reader turns on themed icons, so the app would have worn Expo's chevron as
//     its silhouette. There is no honest monochrome version of a full-colour drawing, and Android falls back
//     to the normal adaptive icon when none is given, so it is dropped rather than guessed at.
//
//   · `ios.buildNumber` AND `android.versionCode` ARE GONE. eas.json sets `appVersionSource: "remote"`,
//     which means EAS owns both numbers; pinning them in app.json beside it is the exact pair that makes a
//     build stop incrementing without saying so.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const EMBLEM = path.join(ROOT, "assets", "agrized-emblem.webp");

/** The artwork's own background, sampled from its corners: the icons extend it to the edge of the square. */
const PAPER = { r: 255, g: 255, b: 250, alpha: 1 };

async function square(size, coverage) {
  const inner = Math.round(size * coverage);
  const art = await sharp(EMBLEM).resize(inner, inner, { fit: "contain", background: PAPER }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: art, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const write = async (relative, data) => {
  const file = path.join(ROOT, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  console.log(`  ${relative.padEnd(36)} ${(data.length / 1024).toFixed(1)} KB`);
};

console.log("native icons from assets/agrized-emblem.webp");

// iOS, the Play Store listing, and Expo's own fallback for anything it is not given.
await write("assets/icon.png", await square(1024, 0.86));

// Android's adaptive icon. The foreground is opaque, so it is the whole icon and the layer under it only
// shows through where a launcher's mask would have cut — which is why app.json gives it a flat
// `backgroundColor` instead of the template's `android-icon-background.png`.
await write("assets/android-icon-foreground.png", await square(1024, 0.6));

// The splash, centred on #FFFFFA at the width app.json sets.
await write("assets/splash-icon.png", await square(512, 0.7));

// The web favicon, for `expo start --web`. Small, so the art gets nearly the whole square.
await write("assets/favicon.png", await square(48, 0.92));
