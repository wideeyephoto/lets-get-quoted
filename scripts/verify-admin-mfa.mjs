// Synthetic browser preview. Run with --serve and inspect the printed URL.
// Handler regressions: npm test -- test/admin-mfa-client.test.ts
// Real staging protocol: node scripts/verify-native-mfa-provider.mjs --help
// No actual Supabase project or device credentials are used by this preview.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import QRCode from 'qrcode';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, 'tmp', 'mfa-browser');
const testSecret = 'JBSWY3DPEHPK3PXP';
const accountEmail = 'mfa-browser@example.invalid';
const accountId = 'mfa-browser-user';
function preview(qr, secret) {
  const scenario = new URLSearchParams(location.search).get('scenario');
  const factor = { id: 'totp-one', factor_type: 'totp', friendly_name: 'Authenticator app', status: 'verified' };
  const state = window.mfaPreview = { userId: 'mfa-browser-user', level: scenario === 'verified' ? 'aal2' : 'aal1', factors: scenario ? [factor] : [], passkeys: scenario === 'passkeys' ? [{ id: 'passkey-one', label: 'Dashlane' }, { id: 'passkey-two', label: 'Apple Passwords' }] : [], verified: false, cancel: false, calls: [] };
  let listener;
  const record = (method, args) => { state.calls.push({ method, args }); document.querySelector('#calls').textContent = JSON.stringify(state.calls, null, 2); };
  window.fetch = async (_url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    if (body) {
      record(body.action, { expectedUserId: body.expectedUserId });
      if (body.action === 'register-options' || body.action === 'authenticate-options') return new Response(JSON.stringify({ challengeId: 'fixture-challenge', options: {} }));
      if (body.action === 'register-verify') state.passkeys.push({ id: 'new-passkey', label: 'My passkey' });
      if (body.action === 'authenticate-verify') state.verified = true;
      if (body.action === 'remove') { state.passkeys = state.passkeys.filter(p => p.id !== body.credentialId); state.verified = false; }
    }
    return new Response(JSON.stringify({ userId: state.userId, providerLevel: state.level, passkeys: state.passkeys, verified: state.verified, verifiedUntil: state.verified ? new Date(Date.now() + 900000).toISOString() : null }));
  };
  document.querySelector('#cancel-native').onclick = () => { state.cancel = true; };
  document.querySelector('#switch-account').onclick = () => { state.userId = 'different-user'; listener('SIGNED_IN', { user: { id: state.userId } }); };
  return { auth: {
    async getUser() { return { data: { user: { id: state.userId } }, error: null }; },
    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    async refreshSession() { record('refreshSession'); if (!state.factors.some(f => f.status === 'verified')) state.level = 'aal1'; return { data: { session: { user: { id: state.userId } } }, error: null }; },
    mfa: {
      async listFactors() { return { data: { all: structuredClone(state.factors) }, error: null }; },
      async enroll(args) { record('enroll', args); const created = { ...factor, id: 'new-totp', status: 'unverified', friendly_name: args.friendlyName }; state.factors.push(created); return { data: { ...created, totp: { qr_code: qr, secret } }, error: null }; },
      async challenge(args) { record('challenge', args); return { data: { id: 'totp-challenge' }, error: null }; },
      async verify(args) { record('verify', { factorId: args.factorId }); if (args.code !== '123456') return { error: new Error('Invalid code. Try again.') }; state.level = 'aal2'; state.factors.find(f => f.id === args.factorId).status = 'verified'; return { error: null }; },
      async unenroll(args) { record('unenroll', args); state.factors = state.factors.filter(f => f.id !== args.factorId); return { error: null }; },
    },
  } };
}
if (!process.argv.includes('--serve')) throw new Error('Use --serve for the preview; run npm test for regressions.');
await mkdir(scratch, { recursive: true });
const qr = await QRCode.toDataURL(`otpauth://totp/app.letsgetquoted.com:${accountEmail}?secret=${testSecret}&issuer=app.letsgetquoted.com`);
await writeFile(path.join(scratch, 'supabase.ts'), `export const supabase = (${preview.toString()})(${JSON.stringify(qr)}, ${JSON.stringify(testSecret)});`);
await writeFile(path.join(scratch, 'webauthn.ts'), `export const browserSupportsWebAuthn = () => true;
export const WebAuthnAbortService = {cancelCeremony(){}};
async function prompt(kind){ document.querySelector('#native-status').textContent = 'Native '+kind+' API invoked (synthetic preview)'; if(window.mfaPreview.cancel){ window.mfaPreview.cancel=false; throw new DOMException('cancelled','NotAllowedError'); } return {id:'fixture-credential'}; }
export const startRegistration = () => prompt('registration'); export const startAuthentication = () => prompt('authentication');`);
await writeFile(path.join(scratch, 'main.tsx'), `import React from 'react'; import {createRoot} from 'react-dom/client'; import MfaPanel from '/src/app/admin/security/MfaPanel'; import '/src/app/globals.css'; createRoot(document.getElementById('root')!).render(<main style={{maxWidth:780,margin:'24px auto',padding:16}}><MfaPanel stepUp={true} accountEmail=${JSON.stringify(accountEmail)} accountId=${JSON.stringify(accountId)} /></main>);`);
await writeFile(path.join(scratch, 'index.html'), '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin native MFA preview</title></head><body><div style="padding:12px">Synthetic test: code 123456 · <a href="?">New setup</a> · <a href="?scenario=verified">Code verified</a> · <a href="?scenario=passkeys">Saved passkeys</a><button id="cancel-native">Cancel next native prompt</button><button id="switch-account">Switch account</button><p id="native-status"></p></div><div id="root"></div><details><summary>Test calls</summary><pre id="calls"></pre></details><script type="module" src="/tmp/mfa-browser/main.tsx"></script></body></html>');
const server = await createServer({ root, configFile: false, envFile: false, cacheDir: path.join(scratch, 'vite-cache'), resolve: { alias: [{ find: '@/lib/supabase', replacement: path.join(scratch, 'supabase.ts') }, { find: '@simplewebauthn/browser', replacement: path.join(scratch, 'webauthn.ts') }, { find: '@', replacement: path.join(root, 'src') }] }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port:3026,strictPort:true } });
await server.listen();
console.log('Synthetic MFA preview: http://127.0.0.1:3026/tmp/mfa-browser/index.html');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
