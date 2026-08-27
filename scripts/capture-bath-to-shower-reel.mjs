import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.LGQ_CAPTURE_ORIGIN || 'http://localhost:3010';
const outputDir = path.resolve('artifacts/bath-to-shower-reel');
const rawVideoDir = path.join(outputDir, 'raw-video');

await mkdir(rawVideoDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  // A true 9:16 mobile-story canvas. At 720px the simulator deliberately
  // stacks the narrative over the phone, letting the reel move from the lead
  // context into the quote without dead space below a desktop composition.
  viewport: { width: 720, height: 1280 },
  recordVideo: {
    dir: rawVideoDir,
    size: { width: 720, height: 1280 },
  },
  colorScheme: 'dark',
});

const page = await context.newPage();
await page.goto(`${origin}/demo/sms-quote`, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(1_200);
await page.screenshot({ path: path.join(outputDir, '01-intro.png') });

const simulator = page.locator('[data-reel-frame="simulator"]');
await simulator.scrollIntoViewIfNeeded();
await page.waitForTimeout(1_400);

await page.locator('[data-reel-action="replay-flow"]').click();
await page.waitForTimeout(350);
await page.screenshot({ path: path.join(outputDir, '02-lead-received.png') });

await page.waitForTimeout(1_500);
const payAction = page.locator('[data-reel-action="pay-deposit"]');
await payAction.scrollIntoViewIfNeeded();
await page.waitForTimeout(2_200);
await page.screenshot({ path: path.join(outputDir, '03-quote-ready.png') });

await payAction.click();
await page.waitForTimeout(2_400);
await page.screenshot({ path: path.join(outputDir, '04-deposit-paid.png') });
await page.waitForTimeout(1_300);

const video = page.video();
await page.close();
const rawVideoPath = await video.path();
await context.close();
await browser.close();

const finalVideoPath = path.join(outputDir, 'bath-to-shower-quote-reel.webm');
await copyFile(rawVideoPath, finalVideoPath);

const { size } = await stat(finalVideoPath);
process.stdout.write(`${finalVideoPath}\n${size} bytes\n`);
