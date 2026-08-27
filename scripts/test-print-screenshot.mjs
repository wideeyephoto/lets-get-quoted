import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 1600 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3010/tools/estimate-generator', { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'C:/Users/brett/.gemini/antigravity-ide/brain/a9ba53cb-59ab-4806-8d43-69b568d7a820/screenshots/05_estimate_gen_print_mode.png', fullPage: true });
  console.log('Saved 05_estimate_gen_print_mode.png');

  await page.emulateMedia({ media: null });
  await page.goto('http://localhost:3010/tools/leakage-calculator', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'C:/Users/brett/.gemini/antigravity-ide/brain/a9ba53cb-59ab-4806-8d43-69b568d7a820/screenshots/12_leakage_calculator.png', fullPage: true });
  console.log('Saved 12_leakage_calculator.png');

  await browser.close();
}

test();
