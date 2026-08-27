import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:3011/tools/estimate-generator', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check visibility of estimateSheet
  const sheet = await page.$('[class*="estimateSheet"]');
  console.log('Sheet found:', !!sheet);

  // Emulate print media
  await page.emulateMedia({ media: 'print' });
  
  const display = await page.evaluate(() => {
    const el = document.querySelector('[class*="estimateSheet"]');
    if (!el) return 'NOT_FOUND';
    return {
      display: window.getComputedStyle(el).display,
      visibility: window.getComputedStyle(el).visibility,
      height: el.offsetHeight,
      topRow: document.querySelector('[class*="estimateTopRow"]')?.offsetHeight,
      table: document.querySelector('table')?.offsetHeight,
      pageClass: document.querySelector('[class*="page"]')?.className,
      pageDisplay: window.getComputedStyle(document.querySelector('[class*="page"]')).display,
      bodyHeight: document.body.offsetHeight
    };
  });
  console.log('Print computed styles:', display);

  await browser.close();
}

main().catch(console.error);
