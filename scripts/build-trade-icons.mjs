/**
 * The five trade objects that orbit the homepage hero.
 *
 * The masters are photoreal renders on transparency, 49-95KB each and 348KB for
 * the set. That is a lot of bytes for decoration, and it sits in the hero — the
 * region the LCP is measured in — so the set gets the same treatment the logo
 * got: trim the transparent padding, resize to twice the largest place it
 * renders, and write WebP with a PNG fallback.
 *
 * WHY CHROMIUM AND NOT SHARP. Neither sharp nor jimp is a dependency of this
 * project, and resizing five decorative PNGs is not a good reason to add a
 * native module to everybody's install. Playwright is already here for the
 * measurement scripts, and generate-logo-assets.mjs established the pattern —
 * this is that script, over a list.
 *
 * THE BOX IS A BOUNDING BOX, NOT A SIZE. Each icon has an approved display size
 * (a pipe elbow at 82x82, a shingle strip at 142x88). Forcing the trimmed art to
 * those exact numbers would stretch it, because trimming changes the aspect
 * ratio by however much padding there was. So the art is fitted INSIDE the box
 * and the real CSS size is printed at the end — those printed numbers are what
 * TRADE_ICONS in src/lib/trade-orbit.ts carries. Re-run this and update them if
 * the art ever changes.
 *
 *   node scripts/build-trade-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const SRC_DIR = 'scripts/raw-icons/trades';
const OUT_DIR = 'public/trades';

// slug -> the approved display box, in CSS pixels, at full (desktop) scale.
const ICONS = [
  { slug: 'plumber-pipe', box: [82, 82] },
  { slug: 'paint-brush', box: [108, 132] },
  { slug: 'shingles', box: [142, 88] },
  { slug: 'grass-lawncare', box: [126, 86] },
  { slug: 'tape-measure-contractor', box: [120, 96] },
];

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

const rows = [];
let srcBytes = 0;
let webpBytes = 0;

for (const icon of ICONS) {
  const src = readFileSync(`${SRC_DIR}/${icon.slug}.png`);
  srcBytes += src.length;

  const encoded = await page.evaluate(
    async ({ b64, boxW, boxH }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();

      // The artwork inside the padding: the tightest box holding every pixel
      // that is not fully transparent. Alpha alone is the test — these are RGBA
      // cut-outs, so there is no background colour to discount. The threshold is
      // 12 rather than 0 because the baked drop shadows fade to nearly nothing
      // and a stray alpha-1 pixel would defeat the trim.
      const probe = document.createElement('canvas');
      probe.width = img.width;
      probe.height = img.height;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(img, 0, 0);
      const d = pctx.getImageData(0, 0, img.width, img.height).data;
      let minX = img.width;
      let maxX = -1;
      let minY = img.height;
      let maxY = -1;
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

      // Contain, never cover: the art keeps its own proportions and one axis of
      // the approved box goes unused.
      const scale = Math.min(boxW / sw, boxH / sh);
      const cssW = Math.round(sw * scale);
      const cssH = Math.round(sh * scale);

      const cv = document.createElement('canvas');
      cv.width = cssW * 2;
      cv.height = cssH * 2;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, minX, minY, sw, sh, 0, 0, cv.width, cv.height);

      return {
        webp: cv.toDataURL('image/webp', 0.9).split(',')[1],
        png: cv.toDataURL('image/png').split(',')[1],
        source: { w: img.width, h: img.height },
        trimmed: { l: minX, r: img.width - 1 - maxX, t: minY, b: img.height - 1 - maxY },
        css: { w: cssW, h: cssH },
        out: { w: cv.width, h: cv.height },
      };
    },
    { b64: src.toString('base64'), boxW: icon.box[0], boxH: icon.box[1] },
  );

  const webp = Buffer.from(encoded.webp, 'base64');
  const png = Buffer.from(encoded.png, 'base64');
  writeFileSync(`${OUT_DIR}/${icon.slug}.webp`, webp);
  writeFileSync(`${OUT_DIR}/${icon.slug}.png`, png);
  webpBytes += webp.length;

  rows.push({ slug: icon.slug, box: icon.box, ...encoded, webpLen: webp.length, pngLen: png.length, srcLen: src.length });
}

await browser.close();

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
console.log('slug                       source     trimmed L/R/T/B   css      2x        webp     png');
for (const r of rows) {
  console.log(
    `${r.slug.padEnd(26)} ${`${r.source.w}x${r.source.h}`.padEnd(10)} ` +
      `${`${r.trimmed.l}/${r.trimmed.r}/${r.trimmed.t}/${r.trimmed.b}`.padEnd(17)} ` +
      `${`${r.css.w}x${r.css.h}`.padEnd(8)} ${`${r.out.w}x${r.out.h}`.padEnd(9)} ` +
      `${kb(r.webpLen).padEnd(8)} ${kb(r.pngLen)}`,
  );
}
console.log(
  `\nset: ${kb(srcBytes)} of PNG masters -> ${kb(webpBytes)} of WebP ` +
    `(${(100 - (webpBytes / srcBytes) * 100).toFixed(1)}% smaller)`,
);

console.log('\nTRADE_ICONS in src/lib/trade-orbit.ts must match these css sizes:\n');
for (const r of rows) {
  console.log(`  { slug: '${r.slug}', w: ${r.css.w}, h: ${r.css.h} },`);
}
