// Draws public/favicon.ico from the same shapes as src/app/icon.svg.
//
//   node scripts/make-favicon.mjs
//
// The page declares the SVG icon, but browsers still ask for /favicon.ico on their own; without the file
// every page load logs a 404. Re-run this after changing src/app/icon.svg so the two stay the same drawing.

import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const VIEW_BOX = 64; // icon.svg coordinate space
const SIZES = [16, 32, 48];
const SAMPLES = 4; // supersampling per axis, for antialiased edges

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** A point rotated by `degrees` around (cx, cy), in the y-down space SVG uses. */
function rotate(x, y, cx, cy, degrees) {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** Distance from (x, y) to the segment (ax, ay)–(bx, by): a stroke with round caps is a fattened segment. */
function distanceToSegment(x, y, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const length = vx * vx + vy * vy;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / length));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
}

/** The cubic Bézier of icon.svg's branch, flattened once into a polyline. */
const branch = (() => {
  const [p0, p1, p2, p3] = [
    [12, 50],
    [21, 35],
    [33, 29],
    [52, 31],
  ];
  const points = [];
  for (let i = 0; i <= 64; i += 1) {
    const t = i / 64;
    const u = 1 - t;
    points.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return points;
})();

// Painted back to front, exactly like icon.svg.
const shapes = [
  {
    color: rgb("#1f4a2c"),
    hit(x, y) {
      const r = 14;
      const nx = Math.max(r - x, x - (VIEW_BOX - r), 0);
      const ny = Math.max(r - y, y - (VIEW_BOX - r), 0);
      return x >= 0 && y >= 0 && x <= VIEW_BOX && y <= VIEW_BOX && Math.hypot(nx, ny) <= r;
    },
  },
  {
    color: rgb("#d6b04a"),
    hit: (x, y) => Math.hypot(x - 42, y - 21) <= 9,
  },
  {
    color: rgb("#e8eed9"),
    hit(x, y) {
      for (let i = 1; i < branch.length; i += 1) {
        const [ax, ay] = branch[i - 1];
        const [bx, by] = branch[i];
        if (distanceToSegment(x, y, ax, ay, bx, by) <= 1.5) return true;
      }
      return false;
    },
  },
  {
    color: rgb("#8fae4a"),
    hit(x, y) {
      const [px, py] = rotate(x, y, 24, 39, 32);
      return ((px - 24) / 5) ** 2 + ((py - 39) / 7.5) ** 2 <= 1;
    },
  },
  {
    color: rgb("#6e8e3a"),
    hit(x, y) {
      const [px, py] = rotate(x, y, 36, 43, -22);
      return ((px - 36) / 4.5) ** 2 + ((py - 43) / 7) ** 2 <= 1;
    },
  },
];

/** RGBA pixels for one square size, averaged over SAMPLES² samples per pixel. */
function draw(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = VIEW_BOX / (size * SAMPLES);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let [r, g, b, covered] = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px * SAMPLES + sx + 0.5) * step;
          const y = (py * SAMPLES + sy + 0.5) * step;
          let color = null;
          for (const shape of shapes) if (shape.hit(x, y)) color = shape.color;
          if (!color) continue; // outside the rounded square: transparent
          r += color[0];
          g += color[1];
          b += color[2];
          covered += 1;
        }
      }
      const offset = (py * size + px) * 4;
      if (covered > 0) {
        // Straight (non-premultiplied) alpha: average the colour over the covered samples only, so the
        // rounded corners fade to transparent instead of to black.
        pixels[offset] = Math.round(r / covered);
        pixels[offset + 1] = Math.round(g / covered);
        pixels[offset + 2] = Math.round(b / covered);
        pixels[offset + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
      }
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 32-bit RGBA PNG; an .ico may hold PNG images, which keeps the alpha channel simple. */
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const images = SIZES.map((size) => ({ size, data: png(size, draw(size)) }));

const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(1, 2); // type: icon
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  directory[entry] = image.size; // 0 would mean 256
  directory[entry + 1] = image.size;
  directory.writeUInt16LE(1, entry + 4); // colour planes
  directory.writeUInt16LE(32, entry + 6); // bits per pixel
  directory.writeUInt32LE(image.data.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.data.length;
});

const file = path.join(process.cwd(), "public", "favicon.ico");
await writeFile(file, Buffer.concat([directory, ...images.map((image) => image.data)]));
console.log(`favicon.ico written: ${SIZES.join(", ")} px → ${path.relative(process.cwd(), file)}`);
