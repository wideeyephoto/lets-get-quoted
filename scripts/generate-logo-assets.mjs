/**
 * Regenerates the header/footer logo at the size it is actually displayed.
 *
 * public/lets-get-quoted-logo-exact.png is a 2126x740 RGBA master weighing
 * 805KB. It is rendered at 226.8x78.9 in the header and 199.5x69.4 in the
 * footer — roughly a tenth of its intrinsic width — so every visitor on every
 * page downloaded 805KB to paint a 227px image. It was the single heaviest
 * asset on the marketing site by a wide margin.
 *
 * This writes a 2x asset (460x160, covering the largest render on a retina
 * screen) as WebP with a PNG fallback. The master is kept: it is the source
 * these are generated from, and it is the file to hand to a printer.
 *
 * Resizing runs through headless Chromium rather than sharp/jimp, because
 * neither is a dependency of this project and a logo resize is not a good
 * reason to add a native module to the install. Playwright is already here for
 * the measurement scripts.
 *
 *   node scripts/generate-logo-assets.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SRC = 'public/lets-get-quoted-logo-exact.png';
// 2x the largest place it renders (226.8px wide, in the desktop header).
const OUT_W = 460;

const src = readFileSync(SRC);
const srcW = src.readUInt32BE(16);
const srcH = src.readUInt32BE(20);
const OUT_H = Math.round((OUT_W * srcH) / srcW);

const browser = await chromium.launch();
const page = await browser.newPage();

const encoded = await page.evaluate(
  async ({ b64, w, h }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return {
      webp: cv.toDataURL('image/webp', 0.92).split(',')[1],
      png: cv.toDataURL('image/png').split(',')[1],
    };
  },
  { b64: src.toString('base64'), w: OUT_W, h: OUT_H },
);

await browser.close();

const webp = Buffer.from(encoded.webp, 'base64');
const png = Buffer.from(encoded.png, 'base64');
writeFileSync('public/lets-get-quoted-logo.webp', webp);
writeFileSync('public/lets-get-quoted-logo.png', png);

const kb = (b) => `${(b.length / 1024).toFixed(1)}KB`;
console.log(`source  ${srcW}x${srcH}  ${kb(src)}`);
console.log(`webp    ${OUT_W}x${OUT_H}  ${kb(webp)}   (${(100 - (webp.length / src.length) * 100).toFixed(1)}% smaller)`);
console.log(`png     ${OUT_W}x${OUT_H}  ${kb(png)}    (${(100 - (png.length / src.length) * 100).toFixed(1)}% smaller)`);
console.log(`\nrender at ${OUT_W / 2}x${OUT_H / 2} CSS px or smaller.`);
