import { chromium } from 'playwright';

/**
 * The REAL tappable region, by hit-testing — not getBoundingClientRect.
 *
 * A border box is not the target. .infotip-btn is 17px of icon with
 * `::after { position:absolute; inset:-0.6rem }` over it, so the finger has
 * ~36px to land on and the box says 17. Measuring boxes would have reported a
 * control that was fixed months ago and missed the ones that were not.
 *
 * elementFromPoint resolves a pseudo-element to the element that owns it, so
 * probing outward from the centre finds what a tap actually hits.
 */
/*
 * Run from the repo root with the dev server on :3010:
 *   node scripts/tap-target-audit.mjs
 *
 * Reports every interactive element whose REAL tappable region is under 24px in
 * either direction, at desktop and phone widths. What is left after the fixes
 * in this pass is wide, short text — links in prose and a 21px search field —
 * and all of it clears the spacing exception in WCAG 2.5.8, which is the part
 * of that criterion an audit that only measures sizes will always miss.
 */
const BASE = 'http://localhost:3010';
const ROUTES = ['/demo/jobs', '/demo/leads', '/demo/crew', '/demo/clients', '/demo/schedule', '/demo/messages', '/demo/reviews', '/demo/insights', '/demo/quick-stops', '/demo/recurring'];
const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=menuitem], [role=tab]';

const browser = await chromium.launch();
const rows = [];
for (const w of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(450);
    const found = await page.$$eval(SEL, (els) => {
      // The element itself (which is what a ::after hit resolves to) or one of
      // its descendants. NOT an ancestor — accepting those makes every probe
      // succeed the moment it leaves the control and reports everything as huge.
      const owns = (hit, el) => !!hit && (hit === el || el.contains(hit));
      const out = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const cx = Math.round(r.left + r.width / 2);
        const cy = Math.round(r.top + r.height / 2);
        if (cx < 1 || cy < 1 || cx > innerWidth - 2 || cy > innerHeight - 2) continue;
        if (!owns(document.elementFromPoint(cx, cy), el)) continue; // covered

        // Walk out from the centre along both axes until the tap stops landing.
        const reach = (dx, dy) => {
          let n = 0;
          for (let i = 1; i <= 30; i += 1) {
            const x = cx + dx * i;
            const y = cy + dy * i;
            if (x < 0 || y < 0 || x > innerWidth - 1 || y > innerHeight - 1) break;
            if (!owns(document.elementFromPoint(x, y), el)) break;
            n = i;
          }
          return n;
        };
        const hitW = reach(-1, 0) + reach(1, 0) + 1;
        const hitH = reach(0, -1) + reach(0, 1) + 1;
        if (hitW >= 24 && hitH >= 24) continue;
        out.push({
          hitW, hitH,
          boxW: Math.round(r.width * 10) / 10,
          boxH: Math.round(r.height * 10) / 10,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || '',
          cls: (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join(' '),
          name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34),
          // The inline-text exemption in WCAG 2.5.8 turns on whether the link
          // sits in a run of prose, so record enough to judge it.
          display: cs.display,
          parentTag: el.parentElement?.tagName.toLowerCase() ?? '',
        });
      }
      return out;
    });
    for (const f of found) rows.push({ ...f, route, vw: w });
  }
  await ctx.close();
}
await browser.close();

const byKey = new Map();
for (const r of rows) {
  const key = `${r.cls}|${r.tag}${r.type}|${r.hitW}x${r.hitH}|${r.vw}`;
  if (!byKey.has(key)) byKey.set(key, { ...r, count: 0, routes: new Set() });
  const e = byKey.get(key);
  e.count += 1;
  e.routes.add(r.route);
}
const out = [...byKey.values()].sort((a, b) => a.hitW * a.hitH - b.hitW * b.hitH);
console.log(`hit area under 24x24: ${rows.length} instances, ${out.length} distinct\n`);
for (const e of out) {
  console.log(
    `hit ${String(e.hitW).padStart(3)}x${String(e.hitH).padEnd(3)} (box ${e.boxW}x${e.boxH}) @${e.vw} x${e.count}  <${e.tag}${e.type ? ' ' + e.type : ''} display:${e.display}> .${e.cls}\n     "${e.name}"  ${[...e.routes].join(' ')}`,
  );
}
