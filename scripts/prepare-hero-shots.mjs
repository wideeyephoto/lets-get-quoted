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
 * them inside one fixed frame, so they have to agree on a shape first.
 *
 * Each is scaled to COVER a common 1600x1000 canvas and cropped to fit, so
 * every shot fills the frame edge to edge. An earlier pass letterboxed them
 * instead, which was safe — nothing cut — but left 47px bars beside Insights
 * and 116px above and below the website builder, and a slider whose panel
 * changes size as it rotates reads as broken rather than considered.
 *
 * WHERE EACH ONE IS CROPPED is a per-image decision, in FOCUS below, because
 * the middle is not always the right answer: Insights loses 62px vertically
 * and its "SUMMARY — LAST 90 DAYS" header sits ~30px from the top, so a
 * centred crop would shave it.
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

/**
 * Where to crop from, per file, as 0..1 on each axis (0 = left/top edge held).
 *
 * ANCHORED LEFT, not centred. Centring looked reasonable on paper and was
 * wrong in practice: taking half the surplus off the left edge sliced the
 * sidebar down its middle, so every nav label came out as "hedule", "ick
 * $tops", "ew & Labor". A sidebar cut mid-word reads as a broken screenshot.
 * Held at the left edge, the sidebar stays whole and the surplus comes off the
 * right, which on all three of these is margin or photograph.
 *
 *   insights  loses 62px of HEIGHT and nothing horizontally. Held at the top:
 *             the summary band and "You kept $12,816" are the first 300px and
 *             are the point of the screen; the bottom of the metric row goes.
 *   jobs      loses 155px from the right — the detail panel's outer margin.
 *   website   loses 480px from the right. The live preview keeps its header,
 *             its headline and most of the photo; what goes is the far edge of
 *             the image and the Site Preview button.
 */
const FOCUS = {
  insights: { x: 0, y: 0 },
  jobs: { x: 0, y: 0.5 },
  website: { x: 0, y: 0.5 },
};

mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.png$/i.test(f));
if (!files.length) throw new Error(`no .png files in ${SRC}`);

const browser = await chromium.launch();
const page = await browser.newPage();

for (const file of files) {
  const src = readFileSync(`${SRC}/${file}`);

  const out = await page.evaluate(
    async ({ b64, w, h, focus }) => {
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
      // The ground still gets painted. Cover leaves nothing showing, but a
      // rounding error on one edge against pure white would be visible; against
      // the app's own black it is not.
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, w, h);

      // COVER: scale by whichever axis needs the most, then crop the surplus on
      // the other. max() rather than min() is the whole difference from the
      // letterboxed version.
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = Math.round(-(dw - w) * focus.x);
      const dy = Math.round(-(dh - h) * focus.y);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx, dy, Math.round(dw), Math.round(dh));

      return {
        webp: cv.toDataURL('image/webp', 0.86).split(',')[1],
        source: `${img.width}x${img.height}`,
        scaled: `${Math.round(dw)}x${Math.round(dh)}`,
        cropX: Math.round(dw - w),
        cropY: Math.round(dh - h),
        offset: `${dx},${dy}`,
        ground: `rgb(${r},${g},${b})`,
      };
    },
    { b64: src.toString('base64'), w: W, h: H, focus: FOCUS[file.replace(/\.png$/i, '')] ?? { x: 0.5, y: 0.5 } },
  );

  const buf = Buffer.from(out.webp, 'base64');
  const name = file.replace(/\.png$/i, '.webp');
  writeFileSync(`${OUT}/${name}`, buf);
  console.log(
    `${name.padEnd(16)} ${out.source.padStart(9)} -> ${out.scaled.padStart(10)} filling ${W}x${H}` +
    `  cropped ${String(out.cropX).padStart(4)}w ${String(out.cropY).padStart(3)}h` +
    `  offset ${out.offset.padStart(9)}  ${(buf.length / 1024).toFixed(0)}KB`,
  );
}

await browser.close();
console.log(`\nFrame aspect is ${W}/${H} — .showcase-frame in the generator must match.`);
