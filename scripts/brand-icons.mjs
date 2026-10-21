// Draws every icon the site and the installable app need, from the owner's logo.
//
//   npm run brand:icons
//
// ONE SOURCE, public/brand/agrized-emblem.webp, so the tab, the home screen, the share card and the installed
// app can never drift apart. Re-run this after replacing the artwork; the files it writes are committed, so a
// deploy never depends on this script having run.
//
// THE EMBLEM IS TRANSPARENT AROUND THE TREE since the 2026-10-21 artwork — the drawing's own ground was keyed
// out so the header mark sits on the site's paper without a pale rectangle behind it. Every function here
// therefore has to SAY what goes behind the tree, and they all say the same off-white: an app icon must be
// opaque (iOS fills transparency with black, and a logo on a black square is not this brand), and #FFFFFA is
// what src/app/manifest.ts already gives the installed app as its `background_color`.
//
// WHY A SEPARATE MASKABLE ICON. Android crops an installed app's icon to whatever shape the launcher uses —
// circle, squircle, teardrop — and a `purpose: "any"` icon drawn edge to edge loses its corners to that crop.
// The maskable one keeps the emblem inside the safe circle (40% of the width as a margin) so no mask can cut
// into it, and the off-white bleeds to the edge to fill whatever the launcher keeps.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const ROOT = process.cwd();
const EMBLEM = path.join(ROOT, "public", "brand", "agrized-emblem.webp");
const LOCKUP = path.join(ROOT, "public", "brand", "agrized-logo-full.webp");

/** The artwork's own background, sampled from its corners: the icons extend it to the edge of the square. */
const PAPER = { r: 255, g: 255, b: 250, alpha: 1 };
/** The same cream and the brand green, for the store banner that pairs them. */
const PAPER_HEX = "#fffffa";
const FOREST = { r: 31, g: 74, b: 44, alpha: 1 };

/**
 * The emblem centred on an opaque square.
 *
 * `fit: "contain"` with the same background keeps the drawing's proportions — the emblem is 512×500, and
 * stretching it to a square would bend the tree — and `coverage` leaves the margin around it.
 */
async function square(source, size, coverage) {
  const inner = Math.round(size * coverage);
  const art = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: PAPER })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: art, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The Android status-bar notification icon: a WHITE SILHOUETTE on transparency.
 *
 * Android ignores an icon's colours entirely and draws its alpha channel in white. The emblem's own
 * transparency is not usable for this: it is keyed to the OUTLINE of the tree, so Android would paint the
 * whole tree — leaves, trunk and the gaps between branches — as one solid white blob.
 *
 * The shape is taken from LUMINANCE instead, which keeps the drawing's internal detail: the dark green ink
 * becomes opaque, the pale ground becomes clear. `negate` on a greyscale copy turns «dark» into «opaque», and
 * that becomes the alpha of a plain white image. The emblem is flattened onto its paper first so the keyed
 * ground reads as light rather than as whatever lies under it, and is held well inside the square
 * (coverage 0.7) because Android crops this icon to a circle on some versions.
 */
async function silhouette(source, size, coverage) {
  const inner = Math.round(size * coverage);

  // Flattened onto the artwork's own ground first: without it, `greyscale` reads straight through the keyed
  // ground and the threshold lands in the wrong place.
  const mask = await sharp(source)
    .flatten({ background: PAPER })
    .resize(inner, inner, { fit: "contain", background: PAPER })
    .greyscale()
    // Ink is dark, so inverted it is bright — and bright is what `joinChannel` wants for «opaque».
    .negate()
    // The emblem's ground is #FFFFFA rather than pure white, so a plain inversion leaves the whole square
    // faintly opaque — a dim white haze around the mark. This drops everything below mid-grey to nothing.
    .linear(1.6, -90)
    .toColourspace("b-w")
    .toBuffer();

  const white = await sharp({ create: { width: inner, height: inner, channels: 3, background: "#ffffff" } })
    .joinChannel(mask)
    .png()
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: white, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The full lockup on the card every share and every link preview shows.
 *
 * Bounded on BOTH axes with `fit: "inside"`, because the lockup is wide (1200×338 since 2026-10-21) and
 * fitting it into a square the height of the card would leave it filling a third of the width — a stamp in
 * the middle of a 1200×630 picture. 0.72 of each axis lets a wide lockup take the width and a tall one the
 * height, and keeps a margin either way.
 */
async function card(width, height) {
  const art = await sharp(LOCKUP)
    .resize(Math.round(width * 0.72), Math.round(height * 0.72), { fit: "inside", background: PAPER })
    .toBuffer();
  return sharp({ create: { width, height, channels: 4, background: PAPER } })
    .composite([{ input: art, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * An .ico holding one PNG per size — the format allows it, and it keeps the 32-bit colour the emblem needs.
 * Browsers still ask for /favicon.ico on their own whatever the page declares, so the file has to exist.
 */
function ico(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(1, 2); // type: icon
  directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    directory[entry] = image.size === 256 ? 0 : image.size; // 0 means 256
    directory[entry + 1] = image.size === 256 ? 0 : image.size;
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });
  return Buffer.concat([directory, ...images.map((image) => image.data)]);
}

/**
 * The Play Store feature graphic: 1024x500, the banner above the listing.
 *
 * WHY THE LOCKUP IS KNOCKED OUT RATHER THAN PLACED. Dropped onto the brand green as it is, the lockup keeps
 * its own dark green ink — the name would be forest on forest and the tree nearly so. Its shape is taken from
 * luminance instead and painted in paper on forest, which is the pairing the app's own header uses.
 *
 * NOTHING IMPORTANT NEAR THE EDGE. Play crops and overlays this image differently across its surfaces — a
 * play button lands on it where a video exists, and the sides are trimmed on some layouts. The lockup is
 * held to 62% of the width, centred, so no crop can reach it. No extra text: it is rendered at a fraction
 * of this size in most places, and a sentence that cannot be read is clutter with a cost.
 */
async function featureGraphic(width, height) {
  // Bounded on BOTH axes. Constraining width alone let the lockup's own proportions carry it past 500px
  // tall, and sharp refuses to composite something larger than its canvas.
  const innerW = Math.round(width * 0.62);
  const innerH = Math.round(height * 0.62);

  const mask = await sharp(LOCKUP)
    .flatten({ background: PAPER })
    .resize(innerW, innerH, { fit: "inside" })
    .greyscale()
    .negate()
    // The ground is #FFFFFA rather than pure white, so a plain inversion leaves a faint haze over the whole
    // rectangle. This drops everything below mid-grey to nothing, exactly as the notification icon does.
    .linear(1.6, -90)
    .toColourspace("b-w")
    .toBuffer();

  const { width: w, height: h } = await sharp(mask).metadata();

  const art = await sharp({ create: { width: w, height: h, channels: 3, background: PAPER_HEX } })
    .joinChannel(mask)
    .png()
    .toBuffer();

  return sharp({ create: { width, height, channels: 4, background: FOREST } })
    .composite([{ input: art, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const write = async (relative, data) => {
  const file = path.join(ROOT, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  console.log(`  ${relative.padEnd(34)} ${(data.length / 1024).toFixed(1)} KB`);
};

console.log("brand icons from public/brand/agrized-emblem.webp");

// The tab, and the icon Next declares for every page (src/app/icon.png).
await write("src/app/icon.png", await square(EMBLEM, 512, 0.86));

// iOS home screen. 180 is the size every recent iPhone asks for, and it must be opaque.
await write("src/app/apple-icon.png", await square(EMBLEM, 180, 0.84));

// The installable app (src/app/manifest.ts points at these).
await write("public/icons/icon-192.png", await square(EMBLEM, 192, 0.86));
await write("public/icons/icon-512.png", await square(EMBLEM, 512, 0.86));
await write("public/icons/maskable-512.png", await square(EMBLEM, 512, 0.6));

// The card a link shows in a message or a post.
//
// It lives under src/app/[lang]/ and NOT at the root of src/app/, which is where the icons live. The icons are
// read from the root segment for every route, the Back Office included; this one is not — a share card is only
// picked up from the segment that holds the root LAYOUT, and that layout is [lang]/layout.tsx. Put at the root
// it is silently ignored: the page renders, nothing errors, and og:image is simply absent.
await write("src/app/[lang]/opengraph-image.png", await card(1200, 630));

// The phone app's notification icon (mobile/app.json points at this one). 96px is Android's xxhdpi size for
// a status-bar icon; the system scales it down for smaller densities.
await write("mobile/assets/notification-icon.png", await silhouette(EMBLEM, 96, 0.7));

// The two assets the Play listing asks for, beside the screenshots you take on the phone.
await write("store/play-feature-graphic.png", await featureGraphic(1024, 500));
await write("store/play-icon-512.png", await square(EMBLEM, 512, 0.86));

const sizes = [16, 32, 48];
await write(
  "public/favicon.ico",
  ico(await Promise.all(sizes.map(async (size) => ({ size, data: await square(EMBLEM, size, 0.92) })))),
);

console.log("done — commit these files; the deploy reads them, it does not run this script.");
