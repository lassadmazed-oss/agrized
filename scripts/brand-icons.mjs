// Draws every icon the site and the installable app need, from the owner's logo.
//
//   npm run brand:icons
//
// ONE SOURCE, public/brand/agrized-emblem.webp, so the tab, the home screen, the share card and the installed
// app can never drift apart. Re-run this after replacing the artwork; the files it writes are committed, so a
// deploy never depends on this script having run.
//
// THE ARTWORK HAS AN ALPHA CHANNEL BUT NOTHING TRANSPARENT IN IT — the corners read #FFFFFA at full opacity.
// So the icons cannot be composited onto the brand green: that would frame the emblem in a white box. They are
// drawn on that same off-white instead, which makes the square look like part of the drawing. An app icon has
// to be opaque anyway: iOS fills transparency with black, and a logo on a black square is not this brand.
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

/**
 * The emblem centred on an opaque square.
 *
 * `fit: "contain"` with the same background keeps the drawing's proportions — the emblem is 256×241, and
 * stretching it to a square would thicken the «A» — and `coverage` leaves the margin around it.
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

/** The full lockup on the card every share and every link preview shows. */
async function card(width, height) {
  const art = await sharp(LOCKUP)
    .resize(Math.round(height * 0.9), Math.round(height * 0.9), { fit: "contain", background: PAPER })
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

const sizes = [16, 32, 48];
await write(
  "public/favicon.ico",
  ico(await Promise.all(sizes.map(async (size) => ({ size, data: await square(EMBLEM, size, 0.92) })))),
);

console.log("done — commit these files; the deploy reads them, it does not run this script.");
