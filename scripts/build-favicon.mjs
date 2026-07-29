// Regenerates the platform favicon (src/app/icon.png + public/favicon.png) from a
// self-contained vector: a dark navy disc inside a thick accent ring, with the
// accent checkmark centered — the letsgetquoted.com brand mark. Rasterized to a
// 512×512 transparent PNG via the already-installed Playwright chromium.
//
//   node scripts/build-favicon.mjs
//
// Vector-only, so re-run any time to tweak colors/geometry and stay crisp.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ACCENT = '#ff7a21';
const NAVY = '#0e1622';
const S = 512;

// Ring: an accent disc with a navy disc on top leaves a ring at the edge.
// Check: a bold, round-jointed polyline centered on the navy.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <circle cx="256" cy="256" r="246" fill="${ACCENT}"/>
  <circle cx="256" cy="256" r="212" fill="${NAVY}"/>
  <path d="M168 262 L226 322 L350 192" fill="none" stroke="${ACCENT}" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0">${SVG}</body></html>`, { waitUntil: 'load' });
  const el = await page.$('svg');
  const png = await el.screenshot({ omitBackground: true });
  for (const rel of ['src/app/icon.png', 'public/favicon.png']) {
    await writeFile(join(ROOT, rel), png);
    console.log('wrote', rel, `(${png.length} bytes)`);
  }
} finally {
  await browser.close();
}
