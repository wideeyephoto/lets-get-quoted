/**
 * Captures the hero slider's product screenshots from the live /demo routes.
 *
 * The homepage hero used to be a hand-drawn approximation of the dashboard —
 * divs shaped like a product. The site audit's strongest point was "show the
 * actual product, not only a stylized representation", and we already run a
 * full demo of the real thing, so the hero shows that instead.
 *
 * These are REAL SCREENS with the demo's own seeded data. Nothing is drawn and
 * no figure is invented for marketing: whatever /demo shows a visitor who
 * clicks through is what the hero shows them first. If the demo data changes,
 * re-run this and the hero follows.
 *
 * Replacing these by hand is fine and expected — drop a file with the same name
 * into public/product/ at the same aspect ratio (see SHOT_W/SHOT_H) and the
 * slider picks it up with no code change.
 *
 *   npm run dev            # the demo has to be served from somewhere
 *   node scripts/capture-product-shots.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3010';
const OUT = 'public/product';

// 2x the widest the slider is ever painted (about 700px in a 1440 viewport).
const SHOT_W = 1400;
const SHOT_H = 1000;

const SHOTS = [
  { file: 'insights', path: '/demo/insights', label: 'Insights' },
  { file: 'schedule', path: '/demo/schedule', label: 'Schedule' },
  { file: 'jobs', path: '/demo/jobs', label: 'Jobs' },
  { file: 'quick-stops', path: '/demo/quick-stops', label: 'Quick Stops' },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: SHOT_W, height: SHOT_H },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
});

// A second page is used purely as an image encoder — Chromium's canvas gives
// us WebP without adding sharp to the dependency tree for four files.
const encoder = await browser.newPage();

for (const shot of SHOTS) {
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
  // Charts and counters animate in; catching one mid-transition puts a
  // half-drawn bar in the hero.
  await page.waitForTimeout(2200);

  // Demo chrome is not product. "Exit the LIVE Demo" in the sidebar and the
  // banner across the top are scaffolding around the screens, and a visitor who
  // has not clicked into the demo yet has no idea what they refer to.
  await page.addStyleTag({
    content: `
      .demo-exit, .demo-banner, [data-demo-banner],
      .toast, [role="alert"], .skip-link, .mobile-cta { display: none !important; }
      *, *::before, *::after { animation-play-state: paused !important; transition: none !important; }
    `,
  });
  await page.waitForTimeout(250);

  const png = await page.screenshot({ type: 'png' });

  const webp = await encoder.evaluate(async ({ b64, w, h }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return cv.toDataURL('image/webp', 0.82).split(',')[1];
  }, { b64: png.toString('base64'), w: SHOT_W, h: SHOT_H });

  const buf = Buffer.from(webp, 'base64');
  writeFileSync(`${OUT}/${shot.file}.webp`, buf);
  console.log(`${shot.label.padEnd(14)} ${(buf.length / 1024).toFixed(0)}KB  ${OUT}/${shot.file}.webp`);
}

await browser.close();

const total = SHOTS.reduce((n, s) => n + readFileSync(`${OUT}/${s.file}.webp`).length, 0);
console.log(`\n${SHOTS.length} shots, ${(total / 1024).toFixed(0)}KB total, ${SHOT_W}x${SHOT_H} each.`);
console.log('Only the first is eager — the rest are lazy, so the hero pays for one.');
