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

  const themes = ['dark', 'dim', 'light', 'sunlight'];

  const selectors = [
    // Header
    '.site-header nav a',
    '.header-signin',
    '.header-cta',
    // Hero proof points
    '.hero-pillars a',
    // Flagships / showcase
    '.showcase-tabs button',
    // Suite tabs & cards
    '.suite-tabs button',
    '.suite-grid article',
    // Pricing
    '.pricing-actions a',
    // FAQ
    '.home-faq-list details summary',
    '.home-faq-more a',
    // Final CTA
    '.final-cta .button.primary',
    // Footer
    '.footer-links a',
    '.footer-legal a',
    // Trust strip
    '.trust-strip span',
  ];

  for (const theme of themes) {
    console.log(`\n================== THEME: ${theme} ==================`);
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(150);

    for (const sel of selectors) {
      const els = page.locator(sel);
      const count = await els.count();
      if (count === 0) continue;

      for (let i = 0; i < Math.min(count, 3); i++) {
        const el = els.nth(i);
        try {
          await el.scrollIntoViewIfNeeded();
          const restStyle = await el.evaluate(e => {
            const cs = getComputedStyle(e);
            return { bg: cs.backgroundColor, color: cs.color, text: e.textContent.trim().slice(0, 25) };
          });

          await el.hover({ force: true });
          await page.waitForTimeout(50);

          const hoverStyle = await el.evaluate(e => {
            const cs = getComputedStyle(e);
            // Also check children if text color is on child
            const child = e.querySelector('a, b, span, p, h3, summary') || e;
            const childCs = getComputedStyle(child);
            return {
              bg: cs.backgroundColor,
              color: cs.color,
              childColor: childCs.color,
              text: e.textContent.trim().slice(0, 25),
              class: e.className
            };
          });

          // Check effective color (if el bg is transparent, try to get parent bg)
          const effBg = await el.evaluate(e => {
            let cur = e;
            while (cur) {
              const bg = getComputedStyle(cur).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && !bg.includes('rgba(0, 0, 0, 0)')) {
                return bg;
              }
              cur = cur.parentElement;
            }
            return 'rgb(7, 19, 29)';
          });

          const bgToUse = hoverStyle.bg && hoverStyle.bg !== 'rgba(0, 0, 0, 0)' ? hoverStyle.bg : effBg;
          const colorToUse = hoverStyle.childColor || hoverStyle.color;
          const c = contrast(parseRgb(bgToUse), parseRgb(colorToUse));

          if (c < 4.5) {
            console.log(`FAIL [${sel} (${hoverStyle.text})]: hoverBg=${bgToUse} text=${colorToUse} c=${c.toFixed(2)}:1`);
          }
        } catch (err) {
          // ignore
        }
      }
    }
  }

  await browser.close();
})();
