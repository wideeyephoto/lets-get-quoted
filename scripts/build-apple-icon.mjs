// Generates src/app/apple-icon.png — the iOS home-screen icon.
//
// Why a baked file rather than Next's ImageResponse: @vercel/og eagerly loads a
// default font even when nothing draws text, and that load throws on a project
// path containing spaces (this one does). A metadata route that 500s gives iOS
// NO touch icon, which is worse than the white one we're fixing. A committed
// PNG has no runtime, no font, and can be looked at.
//
// Run: node scripts/build-apple-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 180;
const SS = 3; // 3x3 supersampling — the ring and the check both need clean edges
const NAVY = [0x0e, 0x16, 0x22];
const ORANGE = [0xff, 0x7a, 0x21];

const C = SIZE / 2;
const R_OUT = 74;   // outer edge of the ring
const R_IN = 61;    // inner edge of the ring
// The check, as two segments, in the same proportions as the source mark.
const CHECK = [
  [56, 92, 78, 114],
  [78, 114, 126, 66],
];
const CHECK_HALF = 9.5; // half stroke width

function distToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Is this sample point orange? Ring OR check; everything else is the tile.
function isMark(x, y) {
  const d = Math.hypot(x - C, y - C);
  if (d <= R_OUT && d >= R_IN) return true;
  for (const seg of CHECK) {
    // Round caps and joins, same as the SVG.
    if (distToSegment(x, y, seg) <= CHECK_HALF) return true;
  }
  return false;
}

// --- rasterize: colorType 2 (RGB, no alpha) so every pixel is opaque ---
const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
for (let y = 0; y < SIZE; y += 1) {
  const rowStart = y * (1 + SIZE * 3);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < SIZE; x += 1) {
    let hits = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        if (isMark(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits += 1;
      }
    }
    const a = hits / (SS * SS);
    const o = rowStart + 1 + x * 3;
    for (let ch = 0; ch < 3; ch += 1) {
      raw[o + ch] = Math.round(NAVY[ch] + (ORANGE[ch] - NAVY[ch]) * a);
    }
  }
}

// --- encode PNG ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // colour type 2 = truecolour, NO alpha channel
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../src/app/apple-icon.png', import.meta.url), png);
console.log(`apple-icon.png written: ${SIZE}x${SIZE}, colourType 2 (opaque), ${png.length} bytes`);
