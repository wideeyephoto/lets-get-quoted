import { createRequire } from 'node:module';
const requireFromProject = createRequire('file:///C:/dev/CLAUDE%20CODE%20FOLDER/package.json');
const { chromium } = requireFromProject('playwright');

function luminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(rgb1, rgb2) {
  const l1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function parseRgb(str) {
  if (!str) return [255, 255, 255];
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : [255, 255, 255];
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://letsgetquoted.com', { waitUntil: 'networkidle', timeout: 30000 });

  const themes = ['dark', 'dim', 'light', 'sunlight', 'parchment'];
  
  for (const theme of themes) {
    console.log('\n========================================');
    console.log('=== THEME:', theme);
    console.log('========================================');
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(200);

    // Test suite tabs
    const tabs = page.locator('.suite-tabs button');
    const tabCount = await tabs.count();
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      const text = (await tab.textContent()).trim();
      await tab.scrollIntoViewIfNeeded();
      await tab.hover({ force: true });
      await page.waitForTimeout(100);
      const styles = await tab.evaluate(el => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          text: el.textContent.trim(),
          border: cs.borderColor,
          boxShadow: cs.boxShadow,
        };
      });
      const c = contrast(parseRgb(styles.bg), parseRgb(styles.color));
      const status = c < 4.5 ? 'FAIL' : 'OK  ';
      console.log(`${status} Tab [${text}]: bg=${styles.bg} color=${styles.color} contrast=${c.toFixed(2)}:1`);
    }

    // Test suite grid cards
    const cards = page.locator('.suite-grid article');
    const cardCount = await cards.count();
    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      await card.hover({ force: true });
      await page.waitForTimeout(100);
      const res = await card.evaluate(el => {
        const cs = getComputedStyle(el);
        const link = el.querySelector('h3 a, .suite-card-link');
        const p = el.querySelector('p');
        return {
          bg: cs.backgroundColor,
          linkCs: link ? getComputedStyle(link).color : null,
          pCs: p ? getComputedStyle(p).color : null,
          title: link ? link.textContent.trim() : ''
        };
      });
      const cLink = res.linkCs ? contrast(parseRgb(res.bg), parseRgb(res.linkCs)) : 999;
      const cP = res.pCs ? contrast(parseRgb(res.bg), parseRgb(res.pCs)) : 999;
      const fail = cLink < 4.5 || cP < 4.5;
      const status = fail ? 'FAIL' : 'OK  ';
      console.log(`${status} Card [${res.title}]: bg=${res.bg} link=${res.linkCs} (${cLink.toFixed(2)}:1) p=${res.pCs} (${cP.toFixed(2)}:1)`);
    }
  }

  await browser.close();
})();
