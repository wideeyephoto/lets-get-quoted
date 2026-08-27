import { chromium } from 'playwright';

async function diagnose() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3010/tools/estimate-generator', { waitUntil: 'networkidle' });

  const overflowingElements = await page.evaluate(() => {
    const results = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.clientWidth > 320 || el.scrollWidth > 320 || el.offsetWidth > 320) {
        results.push({
          tag: el.tagName,
          className: el.className,
          id: el.id,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          offsetWidth: el.offsetWidth,
          outerHTML: el.outerHTML.slice(0, 120),
        });
      }
    }
    return results;
  });

  console.log('Overflowing elements on 320px:', JSON.stringify(overflowingElements, null, 2));
  await browser.close();
}

diagnose();
