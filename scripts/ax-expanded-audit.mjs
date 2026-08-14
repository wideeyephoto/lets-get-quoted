/**
 * What does the browser's own accessibility tree make of our aria-expanded
 * controls, CLOSED and OPEN?
 *
 * Reads the AX tree over CDP (Accessibility.getFullAXTree), because reading the
 * source or textContent gives the wrong answer — see the note on commit
 * 6fe6f462. Playwright's page.accessibility is gone, hence the raw CDP session.
 *
 * The question this answers: when a trigger carries aria-controls but the popup
 * is only rendered while open, is the relation there when it matters, and is it
 * a dangling IDREF the rest of the time?
 *
 * Run from the repo root with the dev server on :3010:
 *   node scripts/ax-expanded-audit.mjs [route] [width]
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3010';
const ROUTES = process.argv[2]
  ? [process.argv[2]]
  : ['/demo/jobs', '/demo/leads', '/demo/crew', '/demo/schedule', '/demo/quick-stops', '/demo/recurring', '/demo/messages'];
const WIDTH = Number(process.argv[3] || 1440);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Accessibility.enable');

const prop = (node, name) => node?.properties?.find((p) => p.name === name);

/** AX node for every element carrying data-axaudit, keyed by that index. */
async function axByAuditIndex() {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const byBackendId = new Map();
  for (const n of nodes) if (n.backendDOMNodeId != null) byBackendId.set(n.backendDOMNodeId, n);

  const out = new Map();
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-axaudit]' });
  for (const nodeId of nodeIds) {
    const { node } = await cdp.send('DOM.describeNode', { nodeId });
    const attrs = node.attributes || [];
    const idx = attrs[attrs.indexOf('data-axaudit') + 1];
    out.set(Number(idx), byBackendId.get(node.backendNodeId));
  }
  return out;
}

/** The DOM's view of one trigger, by index. */
const readDom = (i) =>
  page.evaluate((n) => {
    const el = document.querySelector(`[data-axaudit="${n}"]`);
    if (!el) return null;
    const controls = el.getAttribute('aria-controls');
    return {
      expanded: el.getAttribute('aria-expanded'),
      haspopup: el.getAttribute('aria-haspopup'),
      controls,
      resolves: controls ? controls.split(/\s+/).every((id) => !!document.getElementById(id)) : null,
    };
  }, i);

function line(tag, dom, ax) {
  const rel = prop(ax, 'controls')?.value?.relatedNodes?.length ?? 0;
  const state = dom.controls === null ? 'no aria-controls' : dom.resolves ? `resolves (ax relatedNodes=${rel})` : 'DANGLING IDREF';
  return `      ${tag}: expanded=${dom.expanded} controls=${dom.controls ?? '-'} -> ${state}`;
}

for (const route of ROUTES) {
  console.log(`\n${'='.repeat(74)}\n${route}  @${WIDTH}px\n${'='.repeat(74)}`);
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const count = await page.$$eval('[aria-expanded]', (els) =>
    els.filter((el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      .map((el, i) => (el.setAttribute('data-axaudit', String(i)), i)).length,
  );

  const axClosed = await axByAuditIndex();

  for (let i = 0; i < count; i += 1) {
    const el = page.locator(`[data-axaudit="${i}"]`);
    if (!(await el.count())) continue;
    const ax = axClosed.get(i);
    const before = await readDom(i);
    if (!before) continue;

    const name = ax?.name?.value ?? '(no ax node)';
    const role = ax?.role?.value ?? '-';
    const cls = (await el.getAttribute('class')) || '';
    console.log(`\n  ${role} "${name}"   .${cls.split(/\s+/)[0]}`);
    console.log(line('closed', before, ax));

    // Open it and look again. Escape afterwards so the next one starts clean.
    try {
      await el.click({ timeout: 1500 });
      await page.waitForTimeout(250);
      const after = await readDom(i);
      const axOpen = (await axByAuditIndex()).get(i);
      if (after) console.log(line('open  ', after, axOpen));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      if ((await readDom(i))?.expanded === 'true') {
        await el.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(150);
      }
    } catch {
      console.log('      open  : could not click (covered or detached)');
    }
  }
}

await browser.close();
