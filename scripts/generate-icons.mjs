// Generates the PWA icon set. Run with: npm run icons
//
// Written against node:zlib rather than pulling in sharp/canvas — this runs
// once in a while and the icon is simple geometry, so a dependency (and a
// native build step) isn't worth it.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ── Colours ───────────────────────────────────────────────────────
const BLUE  = [37, 99, 235];    // #2563eb — matches theme-color
const WHITE = [255, 255, 255];

// ── PNG encoding ──────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** Encode an RGBA pixel buffer as a PNG. */
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  // 10-12: compression, filter, interlace — all 0

  // One filter byte (0 = none) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Shapes ────────────────────────────────────────────────────────
// All geometry is in normalised 0..1 coordinates so one definition scales to
// every icon size. Coverage functions return 0..1 for antialiasing.

/**
 * Signed distance to a rounded rectangle; negative inside.
 * Standard box SDF — measuring from the centre is what keeps the corners
 * actually round instead of degrading to a plain rectangle.
 */
function roundRectDist(x, y, x0, y0, x1, y1, r) {
  const halfW = (x1 - x0) / 2;
  const halfH = (y1 - y0) / 2;
  const qx = Math.abs(x - (x0 + x1) / 2) - (halfW - r);
  const qy = Math.abs(y - (y0 + y1) / 2) - (halfH - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  return roundRectDist(x, y, x0, y0, x1, y1, r) <= 0;
}

/**
 * The glyph: a backpack. Returns the colour at a point, or null for the
 * background. Kept inside the maskable safe zone (the middle 80%) so Android's
 * adaptive-icon mask never clips it.
 */
function glyphAt(x, y) {
  // Top carry handle — upper half of a ring, sitting proud of the body.
  const hy = y - 0.365;
  const hr = Math.hypot(x - 0.5, hy);
  if (hy <= 0 && hr <= 0.085 && hr >= 0.05) return WHITE;

  // Main body — generous rounding so it reads as a soft bag, not a box.
  if (inRoundRect(x, y, 0.275, 0.365, 0.725, 0.79, 0.135)) {
    // Flap seam, inset so it doesn't collide with the rounded sides.
    if (inRoundRect(x, y, 0.325, 0.503, 0.675, 0.532, 0.014)) return BLUE;
    // Front pocket.
    if (inRoundRect(x, y, 0.385, 0.60, 0.615, 0.715, 0.035)) return BLUE;
    return WHITE;
  }

  return null;
}

// ── Rasteriser ────────────────────────────────────────────────────

const SS = 4;   // supersampling factor per axis

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          // Full-bleed background: iOS rounds it, Android masks it.
          const c = glyphAt(x, y) || BLUE;
          r += c[0]; g += c[1]; b += c[2];
        }
      }

      const n = SS * SS;
      const i = (py * size + px) * 4;
      rgba[i]     = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }

  return encodePNG(size, size, rgba);
}

// ── Write ─────────────────────────────────────────────────────────

const SIZES = [32, 180, 192, 512];

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log(`  wrote icons/icon-${size}.png`);
}
console.log(`${SIZES.length} icons generated`);
