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
 * IT ALSO TRIMS. The master carries transparent padding — measured on the old
 * 460x160 output as 10px left, 8px right, 14px top and 26px bottom, none of it
 * symmetrical. The header compensated for that in CSS: a 56px-tall box with
 * `overflow: hidden`, an image sized to `width: 105%` with `height: auto`, and
 * a translate to pull the artwork back into view.
 *
 * That crop was tuned at one viewport width and could not hold at another,
 * because the box height was fixed at 56px while the image height followed its
 * WIDTH. On a 1920 screen the box is 220px wide, so the image rendered 80px
 * tall inside 56px of box and lost 6.6px off the top and 17.7px off the bottom
 * — the clipped logo border. Trimming here means the asset is exactly the
 * artwork, and the CSS can simply fit it.
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

const browser = await chromium.launch();
const page = await browser.newPage();

const encoded = await page.evaluate(
  async ({ b64, w }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();

    // The artwork inside the padding: the tightest box containing every pixel
    // that is not fully transparent. Alpha alone is the test — the master is
    // RGBA on transparency, so there is no background colour to discount.
    const probe = document.createElement('canvas');
    probe.width = img.width; probe.height = img.height;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(img, 0, 0);
    const d = pctx.getImageData(0, 0, img.width, img.height).data;
    let minX = img.width, maxX = -1, minY = img.height, maxY = -1;
    for (let y = 0; y < img.height; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        if (d[(y * img.width + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const sw = maxX - minX + 1;
    const sh = maxY - minY + 1;
    const h = Math.round((w * sh) / sw);

    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, minX, minY, sw, sh, 0, 0, w, h);
    return {
      webp: cv.toDataURL('image/webp', 0.92).split(',')[1],
      png: cv.toDataURL('image/png').split(',')[1],
      trimmed: { l: minX, r: img.width - 1 - maxX, t: minY, b: img.height - 1 - maxY },
      out: { w, h },
    };
  },
  { b64: src.toString('base64'), w: OUT_W },
);

await browser.close();

const webp = Buffer.from(encoded.webp, 'base64');
const png = Buffer.from(encoded.png, 'base64');
writeFileSync('public/lets-get-quoted-logo.webp', webp);
writeFileSync('public/lets-get-quoted-logo.png', png);

const { w: outW, h: outH } = encoded.out;
const t = encoded.trimmed;
const kb = (b) => `${(b.length / 1024).toFixed(1)}KB`;
console.log(`source   ${srcW}x${srcH}  ${kb(src)}`);
console.log(`trimmed  L${t.l} R${t.r} T${t.t} B${t.b} of transparent padding`);
console.log(`webp    ${outW}x${outH}  ${kb(webp)}   (${(100 - (webp.length / src.length) * 100).toFixed(1)}% smaller)`);
console.log(`png     ${outW}x${outH}  ${kb(png)}    (${(100 - (png.length / src.length) * 100).toFixed(1)}% smaller)`);
console.log(`\nrender at ${outW / 2}x${outH / 2} CSS px or smaller.`);
