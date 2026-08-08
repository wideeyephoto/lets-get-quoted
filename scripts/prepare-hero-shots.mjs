/**
 * Normalises the hero slider's product screenshots.
 *
 * SOURCE OF TRUTH: assets/product-shots/*.png — screenshots of the real app,
 * taken by hand. Those are what ship. scripts/capture-product-shots.mjs is the
 * fallback for regenerating a set from the /demo routes if nobody has supplied
 * one; it writes to the same place, so run one or the other, not both.
 *
 * WHY NORMALISE AT ALL. The three supplied shots are 1355x899, 1588x905 and
 * 1897x912 — aspect ratios from 1.51 to 2.08. The slider cross-fades between
 * them inside one fixed frame, so a frame sized for any single one crops the
 * others: at 1.4 the website builder loses its live preview off the right edge,
 * which is the half of that screen worth showing.
 *
 * So each is drawn CONTAINED onto a common 1600x1000 canvas, and the letterbox
 * is filled with the colour sampled from that image's own top-left pixel. Every
 * one of these screens is a near-black app chrome, so the padding is invisible
 * rather than a grey bar. Nothing is cropped and nothing is stretched.
 *
 * Encoding goes through headless Chromium: neither sharp nor jimp is a
 * dependency here, and three images is not a reason to add a native module.
 *
 *   node scripts/prepare-hero-shots.mjs
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SRC = 'assets/product-shots';
const OUT = 'public/product';

/** The frame every shot is fitted into. 16:10 sits between the sources. */
const W = 1600;
const H = 1000;

mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.png$/i.test(f));
if (!files.length) throw new Error(`no .png files in ${SRC}`);

const browser = await chromium.launch();
const page = await browser.newPage();

for (const file of files) {
  const src = readFileSync(`${SRC}/${file}`);

  const out = await page.evaluate(
    async ({ b64, w, h }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();

      // The letterbox colour, taken from the screenshot itself rather than
      // guessed — a hard-coded navy would band against any shot whose chrome is
      // a shade off it.
      //
      // Sampled from the most common colour around the image's OUTER EDGE, not
      // from one corner: the website builder's top-left corner is its logo
      // plate, which read as rgb(49,54,56) and would have put two grey bars
      // across an otherwise black frame.
      const probe = document.createElement('canvas');
      probe.width = img.width; probe.height = img.height;
      const pctx = probe.getContext('2d');
      pctx.drawImage(img, 0, 0);
      const edge = new Map();
      const sample = (x, y) => {
        const d = pctx.getImageData(x, y, 1, 1).data;
        const key = `${d[0]},${d[1]},${d[2]}`;
        edge.set(key, (edge.get(key) || 0) + 1);
      };
      const stepX = Math.max(1, Math.floor(img.width / 120));
      const stepY = Math.max(1, Math.floor(img.height / 120));
      for (let x = 0; x < img.width; x += stepX) { sample(x, 0); sample(x, img.height - 1); }
      for (let y = 0; y < img.height; y += stepY) { sample(0, y); sample(img.width - 1, y); }
      // The DARKEST of the half-dozen most common edge colours, not simply the
      // most common. The website builder's edge is mostly its live preview —
      // a photograph of a lawn and a roof — so the modal colour there came back
      // olive. Every one of these screens is the same app with the same
      // near-black chrome, and that chrome is always among the frequent edge
      // colours even when it is not the top one.
      const [r, g, b] = [...edge.entries()]
        .sort((p, q) => q[1] - p[1])
        .slice(0, 6)
        .map(([key]) => key.split(',').map(Number))
        .sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2]))[0];

      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, w, h);

      const scale = Math.min(w / img.width, h / img.height);
      const dw = Math.round(img.width * scale);
      const dh = Math.round(img.height * scale);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);

      return {
        webp: cv.toDataURL('image/webp', 0.86).split(',')[1],
        source: `${img.width}x${img.height}`,
        placed: `${dw}x${dh}`,
        pad: `${Math.round((w - dw) / 2)}x${Math.round((h - dh) / 2)}`,
        ground: `rgb(${r},${g},${b})`,
      };
    },
    { b64: src.toString('base64'), w: W, h: H },
  );

  const buf = Buffer.from(out.webp, 'base64');
  const name = file.replace(/\.png$/i, '.webp');
  writeFileSync(`${OUT}/${name}`, buf);
  console.log(
    `${name.padEnd(16)} ${out.source.padStart(9)} -> ${out.placed.padStart(9)} in ${W}x${H}` +
    `  pad ${out.pad.padStart(7)}  ${out.ground.padEnd(18)} ${(buf.length / 1024).toFixed(0)}KB`,
  );
}

await browser.close();
console.log(`\nFrame aspect is ${W}/${H} — .showcase-frame in the generator must match.`);
