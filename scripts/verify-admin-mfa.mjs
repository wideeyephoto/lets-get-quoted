// Run --serve for a local component preview, then --check for browser regressions.
// All provider responses and credentials are synthetic; no Supabase project is used.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, 'tmp', 'mfa-browser');
const baseURL = 'http://127.0.0.1:3026';
const testSecret = 'JBSWY3DPEHPK3PXP';
const accountEmail = 'mfa-browser@example.invalid';
const issuer = 'app.letsgetquoted.com';
const uri = 'otpauth://totp/' + encodeURIComponent(issuer + ':' + accountEmail)
  + '?secret=' + testSecret + '&issuer=' + issuer + '&algorithm=SHA1&digits=6&period=30';

function mockProvider(qr, secret) {
  const scenario = new URLSearchParams(location.search).get('scenario');
  const existing = { id: 'existing-factor', factor_type: 'totp', friendly_name: 'Authenticator app', status: 'verified' };
  const state = window.mfaTest = {
    calls: [], factors: scenario === 'existing' ? [existing] : [],
    level: 'aal1', rejectVerify: false, rejectRemove: false, stayAal1: false,
  };
  const record = (method, args) => state.calls.push({ method, args });
  return { auth: { mfa: {
    async listFactors() {
      return scenario === 'load-error'
        ? { data: null, error: new Error('Simulated load failure') }
        : { data: { all: structuredClone(state.factors) }, error: null };
    },
    async getAuthenticatorAssuranceLevel() {
      return { data: { currentLevel: state.level }, error: null };
    },
    async enroll(args) {
      record('enroll', args);
      assertTotp(args);
      const factor = { id: 'new-factor', status: 'unverified', factor_type: 'totp', friendly_name: args.friendlyName };
      state.factors.push(factor);
      return { data: { ...factor, totp: { qr_code: qr, secret } }, error: null };
    },
    async challenge(args) {
      record('challenge', args);
      return { data: { id: 'challenge-id' }, error: null };
    },
    async verify(args) {
      record('verify', args);
      if (state.rejectVerify) return { error: { message: 'Invalid verification code. Try again.' } };
      state.factors.find(f => f.id === args.factorId).status = 'verified';
      if (!state.stayAal1) state.level = 'aal2';
      return { error: null };
    },
    async unenroll(args) {
      record('unenroll', args);
      if (state.rejectRemove) return { error: { message: 'Could not cancel setup. Try again.' } };
      state.factors = state.factors.filter(f => f.id !== args.factorId);
      return { error: null };
    },
  } } };
  function assertTotp(args) {
    if (args.factorType !== 'totp') throw new Error('Unsupported MFA enrollment attempted');
    if (args.issuer !== 'app.letsgetquoted.com') throw new Error('Unexpected TOTP issuer');
  }
}

async function serve() {
  await mkdir(scratch, { recursive: true });
  const qr = await QRCode.toDataURL(uri, { width: 256 });
  await writeFile(path.join(scratch, 'supabase.ts'),
    'export const supabase = (' + mockProvider.toString() + ')(' + JSON.stringify(qr) + ',' + JSON.stringify(testSecret) + ');');
  await writeFile(path.join(scratch, 'main.tsx'), [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import MfaPanel from '/src/app/admin/security/MfaPanel';",
    "import '/src/app/globals.css';",
    "createRoot(document.getElementById('root')!).render(<main style={{maxWidth:780,margin:'24px auto',padding:16}}><MfaPanel stepUp={true} accountEmail=" + JSON.stringify(accountEmail) + " /></main>);",
  ].join('\n'));
  await writeFile(path.join(scratch, 'index.html'),
    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>MFA setup verification</title></head><body><div id="root"></div><script type="module" src="/tmp/mfa-browser/main.tsx"></script></body></html>');
  const server = await createServer({
    root, configFile: false, envFile: false,
    cacheDir: path.join(scratch, 'vite-cache'),
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: path.join(scratch, 'supabase.ts') },
      { find: '@', replacement: path.join(root, 'src') },
    ] },
    esbuild: { jsx: 'automatic' },
    server: { host: '127.0.0.1', port: 3026, strictPort: true, fs: { allow: [root, await import('node:fs').then(fs => fs.realpathSync(path.join(root, 'node_modules')))] } },
  });
  await server.listen();
  console.log('MFA preview: ' + baseURL + '/tmp/mfa-browser/index.html');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
}

async function check() {
  await mkdir(scratch, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(text) {
        if (window.denyClipboard) throw new Error('Clipboard denied');
        window.copiedMfaKey = text;
      },
    } });
  });
  const setupButton = () => page.getByRole('button', { name: 'Set up Authenticator App (TOTP)', exact: false });
  const open = async (scenario = '') => {
    await page.goto(baseURL + '/tmp/mfa-browser/index.html?scenario=' + scenario);
    await page.getByRole('heading', { name: 'Two-factor authentication' }).waitFor();
    if (scenario !== 'load-error') await setupButton().waitFor();
  };
  const start = async () => {
    await setupButton().click();
    await page.getByAltText('Authenticator enrollment QR code').waitFor();
  };
  const submit = async () => {
    await page.getByLabel('Six-digit authenticator code', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Verify & activate' }).click();
  };
  const report = label => console.log('PASS: ' + label);
  try {
    await open();
    assert.equal(await page.getByRole('button', { name: 'Set up Passkey', exact: false }).count(), 0);
    await start();
    const calls = await page.evaluate(() => window.mfaTest.calls);
    assert.deepEqual(calls[0], { method: 'enroll', args: { factorType: 'totp', friendlyName: 'Authenticator app', issuer } });
    assert.equal(await page.getByText('MFA verified', { exact: true }).count(), 0);
    report('Only supported TOTP enrollment is offered; scanning does not grant MFA assurance');

    const qrPixels = await page.getByAltText('Authenticator enrollment QR code').evaluate(img => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return { data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data), width: canvas.width, height: canvas.height };
    });
    assert.equal(jsQR(Uint8ClampedArray.from(qrPixels.data), qrPixels.width, qrPixels.height)?.data, uri);
    await page.getByText('Using Apple Passwords?', { exact: true }).click();
    await page.getByRole('button', { name: 'Copy setup key', exact: true }).click();
    await page.getByRole('button', { name: 'Setup key copied', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.copiedMfaKey), testSecret);
    assert.match(await page.locator('details').innerText(), /Set Up Code/);
    await page.screenshot({ path: path.join(scratch, 'desktop-setup.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(scratch, 'mobile-setup.png'), fullPage: true });
    report('QR remains scannable; setup key copies exactly; Apple instructions fit desktop and mobile');

    await page.evaluate(() => { window.mfaTest.rejectVerify = true; });
    await submit();
    await page.getByText('Invalid verification code. Try again.', { exact: true }).waitFor();
    assert.equal(await page.getByAltText('Authenticator enrollment QR code').count(), 1);
    assert.equal(await page.getByText('MFA verified', { exact: true }).count(), 0);
    report('Rejected codes preserve the setup without claiming MFA verification');

    await page.evaluate(() => { window.mfaTest.rejectVerify = false; });
    await submit();
    await page.getByText('MFA verified', { exact: true }).waitFor();
    assert.equal(await page.getByAltText('Authenticator enrollment QR code').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Copy setup key', exact: true }).count(), 0);
    assert.equal((await page.locator('body').innerText()).includes(testSecret), false);
    const verification = await page.evaluate(() => window.mfaTest.calls.filter(c => c.method === 'verify').at(-1));
    assert.deepEqual(verification.args, { factorId: 'new-factor', challengeId: 'challenge-id', code: '123456' });
    await setupButton().click();
    await page.getByAltText('Authenticator enrollment QR code').waitFor();
    assert.equal(await page.evaluate(() => window.mfaTest.calls.filter(c => c.method === 'enroll').at(-1).args.friendlyName), 'Authenticator app 2');
    report('Valid verification clears the secret; additional authenticators get distinct names');

    await open('existing');
    assert.equal(await page.getByRole('button', { name: 'Remove', exact: true }).count(), 0);
    await start();
    await page.evaluate(() => { window.mfaTest.rejectRemove = true; });
    await page.getByRole('button', { name: 'Cancel setup', exact: true }).click();
    await page.getByText('Could not cancel setup. Try again.', { exact: true }).waitFor();
    assert.equal(await page.getByAltText('Authenticator enrollment QR code').count(), 1);
    await page.evaluate(() => { window.mfaTest.rejectRemove = false; });
    await page.getByRole('button', { name: 'Cancel setup', exact: true }).click();
    await setupButton().waitFor();
    const remaining = await page.evaluate(() => window.mfaTest.factors);
    assert.deepEqual(remaining.map(f => f.id), ['existing-factor']);
    assert.equal((await page.locator('body').innerText()).includes(testSecret), false);
    report('Cancellation failure preserves setup; retry removes only the pending factor and clears its key');

    await open();
    await start();
    await page.evaluate(() => { window.denyClipboard = true; });
    await page.getByRole('button', { name: 'Copy setup key', exact: true }).click();
    await page.getByText('Could not copy automatically.', { exact: false }).waitFor();
    assert.equal((await page.locator('body').innerText()).includes(testSecret), true);
    report('Clipboard denial leaves a selectable manual setup key');

    await page.evaluate(() => { window.mfaTest.stayAal1 = true; });
    await submit();
    await page.getByText('Your session still needs two-factor verification.', { exact: false }).waitFor();
    assert.equal(await page.getByText('MFA verified', { exact: true }).count(), 0);
    assert.equal((await page.locator('body').innerText()).includes('High-impact actions are unlocked'), false);
    report('AAL1 sessions never receive an unlocked success message');

    await open('load-error');
    await page.getByText('Could not load your authenticators.', { exact: false }).waitFor();
    assert.equal(await setupButton().isDisabled(), true);
    assert.deepEqual(errors, []);
    report('Provider read failure blocks enrollment; no browser exceptions');
  } finally {
    await browser.close();
  }
}
if (process.argv.includes('--serve')) await serve();
else if (process.argv.includes('--check')) await check();
else throw new Error('Use --serve or --check.');

