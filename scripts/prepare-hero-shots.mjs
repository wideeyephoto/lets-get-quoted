/**
 * Normalises the hero slider's product screenshots.
 *
 * SOURCE OF TRUTH: assets/product-shots/* — screenshots of the real app, taken
 * by hand. Those are what ship. scripts/capture-product-shots.mjs is the
 * fallback for regenerating a set from the /demo routes if nobody has supplied
 * one; it writes to the same place, so run one or the other, not both.
 *
 * WHAT THIS DOES. Every shot is fitted to one 1600x1000 canvas — the slider
 * cross-fades between them inside a single fixed frame, so they have to agree
 * on a shape first. Sources captured at 16:10 need no scaling or cropping to
 * get there; the rest of this exists for the ones that are not.
 *
 * The other half of the job is making the set agree on SCALE. A shot taken in
 * a window that was not maximised carries dead ground down its sides, and left
 * in, that screen's UI renders smaller than the others and the slider appears
 * to zoom as it rotates. That band is detected and trimmed — see TRIMMING.
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

/** The frame every shot is fitted into. Must match .showcase-frame's aspect. */
const W = 1600;
const H = 1000;

/**
 * How much of a shot may be cropped before the border trim is refused, as a
 * fraction of the canvas. See TRIMMING below for why this exists. Deliberately
 * low: the default should refuse and report rather than quietly cut a screen
 * in half. Raise it for one file in TRIM_BUDGET, with the reason.
 */
const MAX_TRIM_CROP = 0.08;

/**
 * Per-file overrides of the above, where the cost has been looked at and taken.
 *
 *   insights  arrived with 183px of dead ground down each side — captured in a
 *             window that was not maximised. Left in, the app rendered at 77%
 *             the scale of the other two and the slider appeared to zoom as it
 *             rotated. Trimming to the content costs 297px of height, which is
 *             a lot, but what goes is the lower half of the bottom card row —
 *             and the Jobs queue and the Website preview both already run off
 *             the bottom edge, so a screen continuing past the frame is the
 *             house style here rather than an exception. The 1.30x upscale that
 *             comes with it leaves ~1.7x effective density at the largest
 *             render, which is still above 1x.
 *             The real fix is a maximised re-take; this is the good version of
 *             the shot we have.
 */
const TRIM_BUDGET = {
  insights: 0.32,
};

/**
 * Where to crop from, per file, as 0..1 on each axis (0 = left/top edge held).
 *
 * ANCHORED LEFT, never centred. An earlier set needed real horizontal cropping
 * and centring it sliced the sidebar down its middle, so every nav label came
 * out as "hedule", "ick $tops", "ew & Labor". A sidebar cut mid-word reads as a
 * broken screenshot. Held at the left edge, the sidebar stays whole and the
 * surplus comes off the right, which on all of these is margin or photograph.
 *
 * ANCHORED TOP, because the top of each screen is the part that says what the
 * screen is: "SUMMARY — LAST 90 DAYS / You kept $12,816", "PIPELINE / Current
 * jobs", "Website LIVE". The bottom is always continuing content.
 */
const FOCUS = {
  insights: { x: 0, y: 0 },
  jobs: { x: 0, y: 0 },
  website: { x: 0, y: 0 },
};

/**
 * Pixels to shave off an edge by hand, after the automatic trim.
 *
 * The automatic trim only removes bands of uniform ground, which is the right
 * rule — it will not eat into content. But a capture clipped mid-element leaves
 * a sliver that is not ground and so survives: the website builder ends on a
 * ~16px band of a light-coloured panel at the top right, which reads as a
 * rendering glitch sitting in the corner of the frame. Nothing but a hand
 * measurement can tell that apart from content, so it goes here.
 */
const INSET = {
  website: { right: 24 },
};

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) throw new Error(`no images in ${SRC}`);

// One stem must not arrive twice — insights.png and insights.jpg would both
// want to write insights.webp, and which one won would come down to readdir
// order. Better to say so than to ship whichever it happened to be.
const stems = new Map();
for (const f of files) {
  const stem = f.replace(/\.[^.]+$/, '').toLowerCase();
  if (stems.has(stem)) throw new Error(`two sources for "${stem}": ${stems.get(stem)} and ${f} — delete one`);
  stems.set(stem, f);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const warnings = [];

for (const file of files) {
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  const src = readFileSync(`${SRC}/${file}`);

  const out = await page.evaluate(
    async ({ b64, mime, w, h, focus, inset, maxTrimCrop }) => {
      const img = new Image();
      img.src = `data:${mime};base64,${b64}`;
      await img.decode();

      const probe = document.createElement('canvas');
      probe.width = img.width; probe.height = img.height;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(img, 0, 0);
      const px = pctx.getImageData(0, 0, img.width, img.height).data;
      const at = (x, y) => { const i = (y * img.width + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };

      // The ground colour, taken from the screenshot itself rather than
      // guessed — a hard-coded navy would band against any shot whose chrome is
      // a shade off it.
      //
      // Sampled from the most common colour around the image's OUTER EDGE, not
      // from one corner: one earlier shot's top-left corner was its logo plate,
      // which read as rgb(49,54,56) and would have put two grey bars across an
      // otherwise black frame.
      const edge = new Map();
      const tally = (x, y) => { const k = at(x, y).join(','); edge.set(k, (edge.get(k) || 0) + 1); };
      const stepX = Math.max(1, Math.floor(img.width / 120));
      const stepY = Math.max(1, Math.floor(img.height / 120));
      for (let x = 0; x < img.width; x += stepX) { tally(x, 0); tally(x, img.height - 1); }
      for (let y = 0; y < img.height; y += stepY) { tally(0, y); tally(img.width - 1, y); }
      // The DARKEST of the half-dozen most common edge colours, not simply the
      // most common. The website builder's edge is mostly its live preview — a
      // photograph of a lawn and a roof — so the modal colour there came back
      // olive. Every one of these screens is the same app with the same
      // near-black chrome, and that chrome is always among the frequent edge
      // colours even when it is not the top one.
      const ground = [...edge.entries()]
        .sort((p, q) => q[1] - p[1])
        .slice(0, 6)
        .map(([k]) => k.split(',').map(Number))
        .sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2]))[0];

      // ---- TRIMMING ------------------------------------------------------
      // A screenshot taken in a window that was not maximised carries a band of
      // dead ground down each side. Left in, it makes that screen's UI render
      // smaller than the others, and the slider appears to zoom as it rotates.
      //
      // So: find the content box, and trim to it — but ONLY when trimming does
      // not itself force a big crop. Trimming changes the aspect ratio, and a
      // shot that was 16:10 with wide margins becomes a narrow one that has to
      // lose a lot of height to fill the frame again. Cutting a third off the
      // bottom of a screen is worse than an inset screen, so past a threshold
      // this refuses and reports instead.
      const TOL = 10;
      const near = (c) => Math.abs(c[0] - ground[0]) <= TOL && Math.abs(c[1] - ground[1]) <= TOL && Math.abs(c[2] - ground[2]) <= TOL;
      const colBlank = (x) => { for (let y = 0; y < img.height; y += 2) if (!near(at(x, y))) return false; return true; };
      const rowBlank = (y) => { for (let x = 0; x < img.width; x += 2) if (!near(at(x, y))) return false; return true; };

      let l = 0; while (l < img.width - 1 && colBlank(l)) l++;
      let r = img.width - 1; while (r > l && colBlank(r)) r--;
      let t = 0; while (t < img.height - 1 && rowBlank(t)) t++;
      let b = img.height - 1; while (b > t && rowBlank(b)) b--;

      const border = { l, r: img.width - 1 - r, t, b: img.height - 1 - b };
      const found = border.l + border.r + border.t + border.b > 0;

      // What would the trim cost? Measure the cover crop both ways and pick.
      const cost = (sx, sy, sw, sh) => {
        const s = Math.max(w / sw, h / sh);
        return Math.max((sw * s - w) / w, (sh * s - h) / h);
      };
      const trimmed = found && cost(l, t, r - l + 1, b - t + 1) <= maxTrimCrop;
      const box = trimmed
        ? { x: l, y: t, w: r - l + 1, h: b - t + 1 }
        : { x: 0, y: 0, w: img.width, h: img.height };

      // The hand-measured inset comes off whatever the automatic pass left.
      box.x += inset.left; box.w -= inset.left + inset.right;
      box.y += inset.top; box.h -= inset.top + inset.bottom;

      // ---- FIT -----------------------------------------------------------
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      // The ground still gets painted. Cover leaves nothing showing, but a
      // rounding error on one edge against pure white would be visible; against
      // the app's own black it is not.
      ctx.fillStyle = `rgb(${ground.join(',')})`;
      ctx.fillRect(0, 0, w, h);

      // COVER: scale by whichever axis needs the most, then crop the surplus on
      // the other.
      const scale = Math.max(w / box.w, h / box.h);
      const dw = box.w * scale;
      const dh = box.h * scale;
      const dx = Math.round(-(dw - w) * focus.x);
      const dy = Math.round(-(dh - h) * focus.y);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, box.x, box.y, box.w, box.h, dx, dy, Math.round(dw), Math.round(dh));

      return {
        webp: cv.toDataURL('image/webp', 0.86).split(',')[1],
        source: `${img.width}x${img.height}`,
        border, found, trimmed,
        // How much of the source width the app itself occupies — measured from
        // the DETECTED content box, not the box actually drawn, so it still
        // reports 77% on a shot whose trim was refused. This is the number that
        // has to agree across the set: two shots at 100% and one at 77% is a
        // slider that appears to zoom as it rotates.
        appWidth: Math.round(((r - l + 1) / img.width) * 100),
        scaled: `${Math.round(dw)}x${Math.round(dh)}`,
        cropX: Math.round(dw - w),
        cropY: Math.round(dh - h),
        ground: `rgb(${ground.join(',')})`,
      };
    },
    {
      b64: src.toString('base64'),
      mime: MIME[ext] ?? 'image/png',
      w: W, h: H,
      focus: FOCUS[file.replace(/\.[^.]+$/, '').toLowerCase()] ?? { x: 0.5, y: 0.5 },
      inset: { left: 0, right: 0, top: 0, bottom: 0, ...(INSET[file.replace(/\.[^.]+$/, '').toLowerCase()] ?? {}) },
      maxTrimCrop: TRIM_BUDGET[file.replace(/\.[^.]+$/, '').toLowerCase()] ?? MAX_TRIM_CROP,
    },
  );

  const buf = Buffer.from(out.webp, 'base64');
  const name = file.replace(/\.[^.]+$/, '.webp');
  writeFileSync(`${OUT}/${name}`, buf);

  const note = out.trimmed
    ? `trimmed L${out.border.l} R${out.border.r} T${out.border.t} B${out.border.b}`
    : out.found
      ? 'BORDER KEPT'
      : 'edge to edge';
  console.log(
    `${name.padEnd(15)} ${out.source} -> ${out.scaled.padStart(9)}` +
    `  crop ${String(out.cropX).padStart(3)}w ${String(out.cropY).padStart(3)}h` +
    `  ${note.padEnd(26)} ${out.ground.padEnd(16)} ${(buf.length / 1024).toFixed(0)}KB`,
  );

  // Refusing to trim is the interesting case, so it does not scroll past in a
  // log line. Say what it costs and what fixes it.
  if (out.found && !out.trimmed) {
    warnings.push(
      `${name}: ${out.border.l}px of dead ground on the left and ${out.border.r}px on the right ` +
      `(${out.border.t}px top, ${out.border.b}px bottom). The app fills only ${out.appWidth}% of ` +
      `the width, so this screen renders smaller than the others and the slider appears to zoom ` +
      `as it rotates. Not trimmed: cropping back to ${W}:${H} afterwards would cost more than ` +
      `${Math.round((TRIM_BUDGET[name.replace(/\.webp$/, '')] ?? MAX_TRIM_CROP) * 100)}% of the ` +
      `height. Re-take it with the window maximised, or raise its TRIM_BUDGET if losing that ` +
      `much of the bottom is acceptable for this screen.`,
    );
  }
  // A trim this deep is a deliberate exception, so say so on every run rather
  // than letting it look like the normal case.
  if (out.trimmed && Math.abs(out.cropY) > H * MAX_TRIM_CROP) {
    warnings.push(
      `${name}: trimmed ${out.border.l}px + ${out.border.r}px of dead ground to bring it up to ` +
      `the same scale as the rest of the set, which cost ${out.cropY}px off the bottom and a ` +
      `${(1600 / (1600 - out.border.l - out.border.r)).toFixed(2)}x upscale. Allowed by ` +
      `TRIM_BUDGET. A maximised re-take would need neither.`,
    );
  }
}

await browser.close();

if (warnings.length) {
  console.log('');
  for (const w of warnings) console.log(`!  ${w}\n`);
}
console.log(`Frame aspect is ${W}/${H} — .showcase-frame in the generator must match.`);
