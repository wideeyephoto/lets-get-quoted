import { chromium } from 'playwright';

/**
 * What does each of our CSP variants permit WebAssembly to do?
 *
 *   node scripts/csp-wasm-check.mjs
 *
 * Kept because the question comes up and is easy to get wrong from reading:
 * development ships 'unsafe-eval' for Fast Refresh and 'unsafe-eval' permits
 * wasm too, so the dev server can never demonstrate what production does. Each
 * header below is served for real and WebAssembly.compile is called under it.
 *
 * Production deliberately permits none of it — nothing in this app compiles
 * wasm. This is the tool to re-run if that ever changes, or if someone
 * proposes 'wasm-unsafe-eval' again. It answers "is wasm blocked", which is
 * NOT the same question as "why did the map fall back to raster": that one is
 * WebGL, and it needs a headed browser to see. See the note in src/lib/csp.ts.
 *
 * No dev server needed — the pages are fulfilled by the router.
 */
const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA==';
const PROD_SCRIPT_SRC = `'self' 'nonce-${NONCE}' 'strict-dynamic' https: 'unsafe-inline'`;
const DEV_SCRIPT_SRC = `${PROD_SCRIPT_SRC} 'unsafe-eval'`;
const FIXED_SCRIPT_SRC = `${PROD_SCRIPT_SRC} 'wasm-unsafe-eval'`;

// The smallest valid wasm module: magic + version, empty.
const WASM = '00 61 73 6d 01 00 00 00';

const browser = await chromium.launch();
for (const [label, scriptSrc] of [
  ['production, as shipped today', PROD_SCRIPT_SRC],
  ['dev, which has unsafe-eval  ', DEV_SCRIPT_SRC],
  ['production + wasm-unsafe-eval', FIXED_SCRIPT_SRC],
]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Serve a page carrying the CSP as a real response header.
  await page.route('**/csp-test', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html', 'content-security-policy': `default-src 'self'; script-src ${scriptSrc}` },
      body: `<!doctype html><meta charset=utf8><title>t</title><script nonce="${NONCE}">
        window.__r = (async () => {
          const bytes = new Uint8Array('${WASM}'.split(' ').map((h) => parseInt(h, 16)));
          try { await WebAssembly.compile(bytes); return 'wasm ALLOWED'; }
          catch (e) { return 'wasm BLOCKED: ' + e.constructor.name + ' — ' + String(e.message).slice(0, 90); }
        })();
      </script>`,
    }),
  );
  await page.goto('https://example.test/csp-test');
  const result = await page.evaluate(() => window.__r);
  console.log(`${label}  ->  ${result}`);
  await ctx.close();
}
await browser.close();
