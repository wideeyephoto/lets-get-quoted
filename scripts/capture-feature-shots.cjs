// Capture real product screenshots for the /features bento tiles.
//
// Usage (with the dev server running on :3010):
//   npm i -D playwright && npx playwright install chromium   # one-time
//   node scripts/capture-feature-shots.cjs
//
// Writes /public/features/<feature-id>.jpg for each favorite feature, captured
// from the live demo/theme pages. Re-run to refresh the shots after UI changes.
const { chromium } = require('playwright');
const path = require('path');

const OUT = path.resolve(process.cwd(), 'public/features');
const BASE = process.env.CAPTURE_BASE || 'http://localhost:3010';

const SHOTS = [
  { file: 'hosted-website', url: '/themes/modern' },
  { file: 'ai-smart-intake', url: '/demo/leads' },
  { file: 'client-esignature', url: '/demo/jobs' },
  { file: 'stripe-payments', url: '/demo/insights' },
  { file: 'payment-plans', url: '/demo/clients' },
  { file: 'online-booking', url: '/demo/schedule' },
  { file: 'recurring-plans', url: '/demo/recurring' },
  { file: 'review-routing', url: '/demo/reviews' },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  for (const s of SHOTS) {
    try {
      await page.goto(BASE + s.url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1600);
      await page.screenshot({
        path: path.join(OUT, s.file + '.jpg'),
        type: 'jpeg',
        quality: 80,
        clip: { x: 0, y: 0, width: 1440, height: 900 },
      });
      console.log('captured', s.file, '<-', s.url);
    } catch (err) {
      console.error('FAILED', s.file, s.url, err && err.message);
    }
  }
  await browser.close();
  console.log('done');
})();
