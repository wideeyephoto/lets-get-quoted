import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.LGQ_CAPTURE_ORIGIN || 'http://localhost:3010';
const outputDir = path.resolve('artifacts/bath-to-shower-reel-v2');
const rawVideoDir = path.join(outputDir, 'raw-video');

await mkdir(rawVideoDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

const stillContext = await browser.newContext({
  viewport: { width: 720, height: 1280 },
  colorScheme: 'dark',
});
const stillPage = await stillContext.newPage();

for (let scene = 0; scene < 5; scene += 1) {
  await stillPage.goto(
    `${origin}/demo/reel/bath-to-shower?autoplay=0&scene=${scene}`,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await stillPage.locator('[data-reel-ready="true"]').waitFor();
  await stillPage.waitForTimeout(scene === 2 ? 3_200 : 1_200);
  await stillPage.screenshot({
    path: path.join(outputDir, `0${scene + 1}-scene.png`),
    fullPage: false,
  });
}

await stillContext.close();

const videoContext = await browser.newContext({
  viewport: { width: 720, height: 1280 },
  recordVideo: {
    dir: rawVideoDir,
    size: { width: 720, height: 1280 },
  },
  colorScheme: 'dark',
});
const videoPage = await videoContext.newPage();
await videoPage.goto(`${origin}/demo/reel/bath-to-shower?autoplay=1`, {
  waitUntil: 'networkidle',
  timeout: 60_000,
});
await videoPage.locator('[data-reel-ready="true"]').waitFor();
await videoPage.waitForTimeout(32_000);

const video = videoPage.video();
await videoPage.close();
const rawVideoPath = await video.path();
await videoContext.close();
await browser.close();

const finalVideoPath = path.join(outputDir, 'bath-to-shower-contractor-quote-reel.webm');
await copyFile(rawVideoPath, finalVideoPath);

const { size } = await stat(finalVideoPath);
process.stdout.write(`${finalVideoPath}\n${size} bytes\n`);
