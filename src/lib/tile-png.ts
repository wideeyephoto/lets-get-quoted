import { deflateSync } from 'node:zlib';

// A minimal opaque-PNG writer, used for iOS touch icons.
//
// Everything here is color type 2 — truecolour with NO alpha channel — because
// that is the whole point: iOS flattens any transparency in a touch icon to
// white, so the only way to stop getting a white tile is to ship pixels that
// were never transparent.
//
// Pure JS on purpose. The obvious tool, next/og's ImageResponse, cannot run in
// every environment this repo is built in (it resolves a bundled font through
// fileURLToPath, which throws on a Windows path containing spaces), and an icon
// route that throws leaves iOS with nothing.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodeOpaquePng(size: number, rgb: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = rgb(x, y);
      const o = rowStart + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 — truecolour, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * A contractor's touch icon as a plain shape: their accent color, corner to
 * corner, with a ring in the contrasting tone so it reads as a deliberate mark
 * rather than a colored square. Drawn with arithmetic, so it works anywhere.
 */
export function brandTilePng(accentHex: string, inkHex: string, size = 180): Buffer {
  const accent = hexToRgb(accentHex);
  const ink = hexToRgb(inkHex);
  const c = size / 2;
  const rOut = size * 0.30;
  const rIn = size * 0.225;
  const SS = 3; // supersample, so the ring's edge isn't stepped

  return encodeOpaquePng(size, (x, y) => {
    let hits = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const dx = x + (sx + 0.5) / SS - c;
        const dy = y + (sy + 0.5) / SS - c;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= rOut && d >= rIn) hits += 1;
      }
    }
    return mix(accent, ink, hits / (SS * SS));
  });
}
