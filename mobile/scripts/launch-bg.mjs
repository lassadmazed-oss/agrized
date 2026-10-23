// Builds assets/launch-bg.webp — the picture behind the launch screen — from a generated source image.
//
//   node scripts/launch-bg.mjs path/to/source.png
//
// The source is not in the repository (a 2.3 MB PNG nobody needs at runtime); this script is the record of what
// was done to it, so the asset can be rebuilt from any new picture without guessing the numbers.
//
// The picture is an olive grove at golden hour, made with OpenAI's image model (gpt-image-2, 1024×1536) from a
// prompt that asks for a soft, calm, glowing centre so a logo can sit there. Three things happen to it:
//
//   1 · CROPPED TO THE MIDDLE 1:2. A phone is about 1:2.2, and the app draws this with `cover`, which throws away
//       the sides of anything wider. Cropping here means the bytes we ship are the bytes that get seen.
//
//   2 · A CREAM VEIL IS BAKED INTO THE MIDDLE (the paper colour, #FFFFFA, radial, strongest at the centre). The
//       dark-green mark and the name must read on any phone and in any light, and the veil is also what the
//       native splash screen (the same cream) melts into when the picture fades in. Baking it costs nothing at
//       runtime; a gradient layer would cost a draw on every frame of the launch.
//
//   3 · 600×1200, WEBP QUALITY 50 — about 40 KB. The picture is bokeh and haze by design, so it loses nothing
//       to a small size, and it sits under a veil and a slow zoom where detail would not be read anyway.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "assets", "launch-bg.webp");

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/launch-bg.mjs path/to/source.png");
  process.exit(1);
}

const WIDTH = 600;
const HEIGHT = 1200;

const meta = await sharp(source).metadata();
const cropWidth = Math.round(meta.height / 2);
const left = Math.round((meta.width - cropWidth) / 2);

const veil = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
     <defs>
       <radialGradient id="v" cx="0.5" cy="0.5" r="0.55" fx="0.5" fy="0.5">
         <stop offset="0" stop-color="#fffffa" stop-opacity="0.60"/>
         <stop offset="0.55" stop-color="#fffffa" stop-opacity="0.30"/>
         <stop offset="1" stop-color="#fffffa" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="100%" height="100%" fill="url(#v)"/>
   </svg>`,
);

const data = await sharp(source)
  .extract({ left, top: 0, width: cropWidth, height: meta.height })
  .resize(WIDTH, HEIGHT, { kernel: "lanczos3" })
  .composite([{ input: veil, top: 0, left: 0 }])
  .webp({ quality: 50, effort: 6, smartSubsample: true })
  .toBuffer();

// Written as it is: handing the buffer back to sharp would encode it a second time, at its default quality.
await writeFile(OUT, data);
console.log(`assets/launch-bg.webp  ${WIDTH}x${HEIGHT}  ${(data.length / 1024).toFixed(1)} KB`);
