/**
 * The /for hero graphic: a laptop and a phone showing the quote builder.
 *
 * SOURCE OF TRUTH: assets/for-hero/hero-quote-devices.png — the supplied master,
 * a palette PNG on transparency. Same arrangement as assets/product-shots: the
 * PNG stays in the repo as the source of record, only the WebP ships.
 *
 * THE MARGIN IS THE POINT OF TRIMMING. The master carries ~20px of empty pixels
 * on every side. Left in, that margin is layout — the art renders smaller than
 * its box says it does and no amount of CSS can close the gap, because the gap
 * is inside the image. So it is trimmed to the artwork and the real intrinsic
 * size is printed at the end; those numbers are what the <Image> width/height on
 * the page must carry, or Next reserves the wrong box and the hero shifts.
 *
 * WHY CHROMIUM AND NOT SHARP. Same reason build-trade-icons.mjs gives: neither
 * sharp nor jimp is a dependency of this project, and one decorative image is
 * not a good reason to put a native module in everybody's install. Playwright is
 * already here.
 *
 * NO UPSCALING. The master is 1000px wide and the hero renders at ~600px, so the
 * file already carries ~1.6x density at the largest place it is drawn. Doubling
 * it would add bytes and no detail.
 *
 *   node scripts/build-for-hero.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const SRC = 'assets/for-hero/hero-quote-devices.png';
const OUT = 'public/for/hero-quote-devices.webp';

mkdirSync('public/for', { recursive: true });

const src = readFileSync(SRC);
const browser = await chromium.launch();
const page = await browser.newPage();

const encoded = await page.evaluate(async ({ b64 }) => {
  const decode = async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return { img, data: ctx.getImageData(0, 0, img.width, img.height).data };
  };

  const { img, data } = await decode(`data:image/png;base64,${b64}`);

  // The artwork inside the padding. Alpha alone is the test — the master is a
  // cut-out, so there is no ground colour to discount. Threshold 12 rather than
  // 0 because the drop shadow under the laptop fades to nearly nothing and a
  // stray alpha-1 pixel would defeat the trim.
  let minX = img.width;
  let maxX = -1;
  let minY = img.height;
  let maxY = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (data[(y * img.width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const sw = maxX - minX + 1;
  const sh = maxY - minY + 1;

  const cv = document.createElement('canvas');
  cv.width = sw;
  cv.height = sh;
  cv.getContext('2d').drawImage(img, minX, minY, sw, sh, 0, 0, sw, sh);

  // 0.9 rather than the 0.86 the product shots use: this one carries legible UI
  // text at ~9px and the lower quality visibly softened the quote-line labels.
  const webp = cv.toDataURL('image/webp', 0.9);

  // The cut-out only blends into the navy page if the encoder kept the alpha
  // channel — a WebP written without it arrives as a white slab, which is the
  // one failure here that no amount of CSS can fix. So the output is decoded
  // back and its own corner is read.
  const round = await decode(webp);
  const corner = [0, 1, 2, 3].map((i) => round.data[i]);

  return {
    webp: webp.split(',')[1],
    source: { w: img.width, h: img.height },
    trimmed: { l: minX, r: img.width - 1 - maxX, t: minY, b: img.height - 1 - maxY },
    out: { w: sw, h: sh },
    cornerAlpha: corner[3],
  };
}, { b64: src.toString('base64') });

await browser.close();

if (encoded.cornerAlpha !== 0) {
  throw new Error(`the WebP lost its transparency (corner alpha ${encoded.cornerAlpha}) — it would render as a slab on the navy`);
}

const webp = Buffer.from(encoded.webp, 'base64');
writeFileSync(OUT, webp);

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
console.log(`source   ${encoded.source.w}x${encoded.source.h}  ${kb(src.length)} png`);
console.log(`trimmed  L${encoded.trimmed.l} R${encoded.trimmed.r} T${encoded.trimmed.t} B${encoded.trimmed.b}`);
console.log(`out      ${encoded.out.w}x${encoded.out.h}  ${kb(webp.length)} webp, transparent corner`);
console.log(`\n<Image width={${encoded.out.w}} height={${encoded.out.h}} …> — must match, or the hero shifts on load.`);
