import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([
  { name: 'contractor_auth', value: '1', domain: 'localhost', path: '/' },
  { name: 'lgq-theme', value: 'light', domain: 'localhost', path: '/' }
]);
const page = await context.newPage();

// Go to dev server
await page.goto('http://localhost:3010/dashboard', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// Trigger Cmd+K
await page.keyboard.press('Control+k');
await page.waitForTimeout(800);

await page.screenshot({ path: 'light-workbench-screenshot.png' });

const inspection = await page.evaluate(() => {
  const dialog = document.querySelector('[data-smart-search="true"], [class*="dialog"]');
  const resultsBody = document.querySelector('[class*="resultsBody"]');
  const items = document.querySelectorAll('[class*="resultItem"], [class*="item"]');
  const firstItem = items[0];

  const getMatchedRules = (el) => {
    if (!el) return [];
    const matched = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && el.matches(rule.selectorText)) {
            matched.push({ selector: rule.selectorText, bg: rule.style.backgroundColor || rule.style.background, color: rule.style.color });
          }
        }
      } catch (e) {}
    }
    return matched.filter(r => r.bg || r.color);
  };

  return {
    theme: document.documentElement.getAttribute('data-theme'),
    dialog: dialog ? {
      bg: window.getComputedStyle(dialog).backgroundColor,
      color: window.getComputedStyle(dialog).color,
      matched: getMatchedRules(dialog)
    } : null,
    resultsBody: resultsBody ? {
      bg: window.getComputedStyle(resultsBody).backgroundColor,
      color: window.getComputedStyle(resultsBody).color,
      matched: getMatchedRules(resultsBody)
    } : null,
    firstItem: firstItem ? {
      tag: firstItem.tagName,
      className: firstItem.className,
      bg: window.getComputedStyle(firstItem).backgroundColor,
      color: window.getComputedStyle(firstItem).color,
      border: window.getComputedStyle(firstItem).border,
      matched: getMatchedRules(firstItem)
    } : null
  };
});

console.log('Inspection:', JSON.stringify(inspection, null, 2));

await browser.close();
