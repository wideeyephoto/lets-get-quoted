// Real staging provider/database integration with a cryptographic test authenticator.
// This does not exercise or claim compatibility testing of Apple Passwords or Dashlane.
// Usage: node scripts/verify-native-mfa-provider.mjs --env /path/.env.staging.local
// The script creates disposable staging users and deletes them in finally.
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING_REF = 'uydlabvgauzujdwuqzxq';
const args = process.argv.slice(2);
function argument(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  assert(args[i + 1] && !args[i + 1].startsWith('--'), `Missing value for ${name}`);
  return args[i + 1];
}
const envPath = resolve(argument('--env', resolve(root, '.env.staging.local')));
const origin = argument('--origin', 'http://localhost:3031');
const parsedOrigin = new URL(origin);
assert(parsedOrigin.hostname === 'localhost'
  && parsedOrigin.protocol === 'http:' && parsedOrigin.origin === origin,
  'This protocol test only permits an explicit local HTTP origin.');

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}
const selfTest = args.includes('--self-test');
const env = selfTest ? {
  NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-self-test',
  SUPABASE_SERVICE_ROLE_KEY: 'offline-self-test',
} : parseEnv(await readFile(envPath, 'utf8'));
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, `${STAGING_REF}.supabase.co`,
  'Refusing to mutate any project except the designated staging project.');
assert(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
  'The staging file must contain its anon and service-role keys.');
// The selected file, never inherited production variables, determines all provider access.
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  process.env[name] = env[name];
}
process.env.ADMIN_PASSKEY_ORIGIN = origin;
process.env.NODE_ENV = 'test';

const encode = (value) => Buffer.from(value).toString('base64url');
const decode = (value) => Buffer.from(value, 'base64url');
const hash = (value) => createHash('sha256').update(value).digest();
function cborHead(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length <= 255) return Buffer.from([(major << 5) | 24, length]);
  if (length <= 65535) {
    const out = Buffer.alloc(3); out[0] = (major << 5) | 25; out.writeUInt16BE(length, 1); return out;
  }
  const out = Buffer.alloc(5); out[0] = (major << 5) | 26; out.writeUInt32BE(length, 1); return out;
}
function cbor(value) {
  if (Number.isInteger(value)) return cborHead(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
  if (typeof value === 'string') {
    const b = Buffer.from(value); return Buffer.concat([cborHead(3, b.length), b]);
  }
  if (Buffer.isBuffer(value)) return Buffer.concat([cborHead(2, value.length), value]);
  if (value instanceof Map) return Buffer.concat([cborHead(5, value.size),
    ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)])]);
  throw new Error('Unsupported test CBOR value');
}
function authenticator() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  return { id: randomBytes(32), privateKey: pair.privateKey, counter: 0,
    publicKey: cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, decode(jwk.x)], [-3, decode(jwk.y)]])) };
}
function clientData(type, challenge, clientOrigin = origin) {
  return Buffer.from(JSON.stringify({ type, challenge, origin: clientOrigin, crossOrigin: false }));
}
function registration(options, credential) {
  assert(options.pubKeyCredParams.some((item) => item.alg === -7), 'Server must offer ES256.');
  const data = clientData('webauthn.create', options.challenge);
  const counter = Buffer.alloc(4);
  const length = Buffer.alloc(2); length.writeUInt16BE(credential.id.length);
  const authData = Buffer.concat([hash(options.rp.id), Buffer.from([0x45]), counter,
    Buffer.alloc(16), length, credential.id, credential.publicKey]);
  const attestation = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
  return { id: encode(credential.id), rawId: encode(credential.id), type: 'public-key',
    response: { clientDataJSON: encode(data), attestationObject: encode(attestation), transports: ['internal'] },
    clientExtensionResults: {}, authenticatorAttachment: 'platform' };
}
function assertion(options, credential, changes = {}) {
  const data = clientData('webauthn.get', options.challenge, changes.origin ?? origin);
  const counter = Buffer.alloc(4); counter.writeUInt32BE(++credential.counter);
  const authData = Buffer.concat([hash(options.rpId), Buffer.from([changes.uv === false ? 0x01 : 0x05]), counter]);
  const signature = sign('sha256', Buffer.concat([authData, hash(data)]), credential.privateKey);
  return { id: encode(credential.id), rawId: encode(credential.id), type: 'public-key',
    response: { clientDataJSON: encode(data), authenticatorData: encode(authData), signature: encode(signature), userHandle: null },
    clientExtensionResults: {}, authenticatorAttachment: 'platform' };
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=|\s/g, '')) {
    const index = alphabet.indexOf(char); assert(index >= 0, 'Invalid base32 secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const tick = Buffer.alloc(8); tick.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(tick).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? result.error.status ?? 'provider_error'}`);
  return result.data;
}
function jwt(session) { return JSON.parse(decode(session.access_token.split('.')[1]).toString()); }
if (selfTest) {
  const webauthn = await import('@simplewebauthn/server');
  const credential = authenticator();
  const options = await webauthn.generateRegistrationOptions({
    rpName: 'Protocol self-test', rpID: parsedOrigin.hostname, userName: 'offline@example.invalid',
    userID: randomBytes(32), attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  const enrolled = await webauthn.verifyRegistrationResponse({
    response: registration(options, credential), expectedChallenge: options.challenge,
    expectedOrigin: origin, expectedRPID: parsedOrigin.hostname, requireUserVerification: true,
  });
  assert(enrolled.verified);
  const authOptions = await webauthn.generateAuthenticationOptions({
    rpID: parsedOrigin.hostname, userVerification: 'required',
    allowCredentials: [{ id: encode(credential.id) }],
  });
  const verified = await webauthn.verifyAuthenticationResponse({
    response: assertion(authOptions, credential), expectedChallenge: authOptions.challenge,
    expectedOrigin: origin, expectedRPID: parsedOrigin.hostname, requireUserVerification: true,
    credential: enrolled.registrationInfo.credential,
  });
  assert(verified.verified);
  await assert.rejects(webauthn.verifyAuthenticationResponse({
    response: assertion(authOptions, credential, { uv: false }), expectedChallenge: authOptions.challenge,
    expectedOrigin: origin, expectedRPID: parsedOrigin.hostname, requireUserVerification: true,
    credential: enrolled.registrationInfo.credential,
  }));
  console.log('PASS offline P-256/CBOR fixture registration, signed assertion, and required user verification. No provider accessed.');
  process.exit(0);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const clients = [];
function userClient() {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client); return client;
}
const users = [];
const staffIds = [];
let loader;
let failures = 0;
const passes = [];
function pass(label) { passes.push(label); console.log(`PASS ${label}`); }
async function rejection(work, label) {
  let rejected = false;
  try { await work(); } catch { rejected = true; }
  assert(rejected, label); pass(label);
}
async function createTestUser() {
  const email = `native-mfa-test-${randomUUID()}@example.invalid`;
  const password = randomBytes(36).toString('base64url') + '!aA1';
  const { user } = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create disposable user');
  assert(user?.id); users.push(user.id);
  const staff = checked(await admin.from('staff').insert({ email, role: 'super_admin', active: true,
    display_name: 'Disposable native MFA protocol test' }).select('id').single(), 'create disposable staff');
  staffIds.push(staff.id);
  return { email, password, userId: user.id, ctx: { admin, userId: user.id, adminEmail: email } };
}
async function login(account) {
  const client = userClient();
  const { session } = checked(await client.auth.signInWithPassword({ email: account.email, password: account.password }), 'password sign in');
  assert.equal(jwt(session).sub, account.userId); assert.equal(jwt(session).aal, 'aal1');
  return client;
}
async function verifyTotp(client, factorId, secret) {
  const challenge = checked(await client.auth.mfa.challenge({ factorId }), 'TOTP challenge');
  checked(await client.auth.mfa.verify({ factorId, challengeId: challenge.id, code: totp(secret) }), 'TOTP verification');
  const { session } = checked(await client.auth.getSession(), 'verified session');
  assert.equal(jwt(session).aal, 'aal2');
}

try {
  loader = await createServer({ root, configFile: false, envFile: false,
    resolve: { alias: { '@': resolve(root, 'src') } },
    server: { middlewareMode: true, hmr: false }, ssr: { noExternal: ['server-only'] },
    plugins: [{ name: 'integration-server-only', enforce: 'pre',
      resolveId(id) { if (id === 'server-only') return '\0integration-server-only'; },
      load(id) { if (id === '\0integration-server-only') return 'export {}'; } }] });
  const api = await loader.ssrLoadModule('/src/lib/admin-passkeys.ts');
  const account = await createTestUser();
  const other = await createTestUser();
  let client = await login(account);
  for (const table of ['admin_passkey_credentials', 'admin_passkey_challenges', 'admin_passkey_grants']) {
    checked(await admin.from(table).select('*').limit(0), `service access to ${table}`);
    const denied = await client.from(table).select('*').limit(1);
    assert(denied.error, `An authenticated browser client must not read ${table}.`);
  }
  pass('credential, challenge, and grant tables are unavailable to authenticated browser clients');
  const noPrivilege = await client.rpc('admin_passkey_session_active', {
    p_user_id: account.userId,
    p_session_id: jwt(checked(await client.auth.getSession(), 'RPC access test session').session).session_id,
    p_require_totp: false,
  });
  assert(noPrivilege.error, 'Browser clients must not execute privileged session readers.');
  pass('privileged passkey RPC is unavailable to authenticated browser clients');
  await rejection(() => api.beginAdminPasskeyRegistration(account.ctx, client, { label: 'Must reject' }),
    'password-only session cannot bootstrap a passkey');
  const factor = checked(await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Protocol test TOTP' }), 'TOTP enrollment');
  await verifyTotp(client, factor.id, factor.totp.secret);
  pass('real staging TOTP bootstrap produces provider aal2');

  const first = authenticator();
  const second = authenticator();
  for (const [credential, label] of [[first, 'Protocol key one'], [second, 'Protocol key two']]) {
    const challenge = await api.beginAdminPasskeyRegistration(account.ctx, client, { label });
    await api.finishAdminPasskeyRegistration(account.ctx, client,
      { challengeId: challenge.challengeId, response: registration(challenge.options, credential) });
  }
  let status = await api.getAdminPasskeyStatus(account.ctx, client);
  assert.equal(status.passkeys.length, 2);
  pass('real verifier stores two independently generated passkeys');
  client = await login(account);
  assert.equal(await api.hasAdminPasskeyGrant(account.ctx, client), false);
  await rejection(() => api.removeAdminPasskey(account.ctx, client, status.passkeys[0].id),
    'password-only session cannot remove a passkey');

  for (const [label, credential, changes] of [
    ['unknown credential rejected', authenticator(), {}],
    ['user verification required by server', first, { uv: false }],
    ['wrong origin rejected by server', first, { origin: 'https://wrong-origin.invalid' }],
  ]) {
    const challenge = await api.beginAdminPasskeyAuthentication(account.ctx, client);
    await rejection(() => api.finishAdminPasskeyAuthentication(account.ctx, client,
      { challengeId: challenge.challengeId, response: assertion(challenge.options, credential, changes) }), label);
    assert.equal(await api.hasAdminPasskeyGrant(account.ctx, client), false);
  }

  const expired = await api.beginAdminPasskeyAuthentication(account.ctx, client);
  const challengeExpiryTestTime = Date.now();
  checked(await admin.from('admin_passkey_challenges').update({
    created_at: new Date(challengeExpiryTestTime - 360_000).toISOString(),
    expires_at: new Date(challengeExpiryTestTime - 90_000).toISOString(),
  }).eq('id', expired.challengeId).eq('user_id', account.userId), 'expire own disposable challenge');
  await rejection(() => api.finishAdminPasskeyAuthentication(account.ctx, client,
    { challengeId: expired.challengeId, response: assertion(expired.options, first) }), 'expired challenge cannot authorize');

  const auth = await api.beginAdminPasskeyAuthentication(account.ctx, client);
  const response = assertion(auth.options, first);
  await api.finishAdminPasskeyAuthentication(account.ctx, client, { challengeId: auth.challengeId, response });
  assert.equal(await api.hasAdminPasskeyGrant(account.ctx, client), true);
  assert.equal(jwt(checked(await client.auth.getSession(), 'app verified session').session).aal, 'aal1');
  pass('signed passkey assertion grants app step-up while provider aal remains aal1');
  await rejection(() => api.finishAdminPasskeyAuthentication(account.ctx, client,
    { challengeId: auth.challengeId, response }), 'consumed challenge cannot be replayed');
  const activeSessionId = jwt(checked(await client.auth.getSession(), 'grant session').session).session_id;
  const grantExpiryTestTime = Date.now();
  checked(await admin.from('admin_passkey_grants').update({
    verified_at: new Date(grantExpiryTestTime - 960_000).toISOString(),
    expires_at: new Date(grantExpiryTestTime - 120_000).toISOString(),
  }).eq('session_id', activeSessionId).eq('user_id', account.userId), 'expire own disposable grant');
  assert.equal(await api.hasAdminPasskeyGrant(account.ctx, client), false);
  pass('expired app grant leaves the session locked');
  const concurrentClient = await login(account);
  const concurrencyClients = [client, concurrentClient];
  const concurrencyChallenges = await Promise.all([
    api.beginAdminPasskeyAuthentication(account.ctx, client),
    api.beginAdminPasskeyAuthentication(account.ctx, concurrentClient),
  ]);
  const counterBeforeConcurrency = first.counter;
  const concurrencyResponses = concurrencyChallenges.map((challenge) => assertion(challenge.options, first));
  const concurrency = await Promise.allSettled(concurrencyChallenges.map((challenge, i) =>
    api.finishAdminPasskeyAuthentication(account.ctx, concurrencyClients[i],
      { challengeId: challenge.challengeId, response: concurrencyResponses[i] })));
  assert(concurrency.some((result) => result.status === 'fulfilled'), 'At least one independent concurrent assertion must succeed.');
  const expectedCounter = Math.max(...concurrency.flatMap((result, i) =>
    result.status === 'fulfilled' ? [counterBeforeConcurrency + i + 1] : []));
  const counterRow = checked(await admin.from('admin_passkey_credentials').select('counter')
    .eq('user_id', account.userId).eq('id', encode(first.id)).single(), 'counter after concurrency');
  assert.equal(Number(counterRow.counter), expectedCounter, 'Counter must equal the highest committed assertion.');
  const afterConcurrent = await api.beginAdminPasskeyAuthentication(account.ctx, client);
  await api.finishAdminPasskeyAuthentication(account.ctx, client,
    { challengeId: afterConcurrent.challengeId, response: assertion(afterConcurrent.options, first) });
  pass('concurrent signed assertions preserve usable monotonic credential counters');
  const secondSession = await login(account);
  assert.equal(await api.hasAdminPasskeyGrant(account.ctx, secondSession), false);
  pass('grant cannot be reused by another session for the same account');
  const otherClient = await login(other);
  assert.equal(await api.hasAdminPasskeyGrant(other.ctx, otherClient), false);
  await rejection(() => api.getAdminPasskeyStatus(account.ctx, otherClient), 'context cannot impersonate another account');

  const secondAuth = await api.beginAdminPasskeyAuthentication(account.ctx, secondSession);
  await api.finishAdminPasskeyAuthentication(account.ctx, secondSession,
    { challengeId: secondAuth.challengeId, response: assertion(secondAuth.options, second) });
  assert.equal(await api.hasAdminPasskeyGrant(account.ctx, secondSession), true);
  pass('backup passkey independently grants step-up');
  await rejection(() => api.beginAdminPasskeyRegistration(account.ctx, secondSession, { label: 'Must reject app-only bootstrap' }),
    'app passkey grant does not replace TOTP aal2 for enrollment');
  await api.removeAdminPasskey(account.ctx, secondSession, encode(first.id));
  assert.equal(await api.hasAdminPasskeyGrant(account.ctx, client), false);
  assert.equal(await api.hasAdminPasskeyGrant(account.ctx, secondSession), true);
  status = await api.getAdminPasskeyStatus(account.ctx, secondSession);
  assert.equal(status.passkeys.length, 1);
  pass('app-verified removal invalidates that credential grants and preserves the backup passkey');

  const revokedSession = checked(await secondSession.auth.getSession(), 'session before revocation').session;
  checked(await admin.auth.admin.signOut(revokedSession.access_token, 'local'), 'revoke disposable session');
  assert.equal(await api.hasAdminPasskeyGrant(account.ctx, secondSession), false);
  pass('provider session revocation invalidates app grant immediately');

  const fallback = await login(account);
  // Avoid replaying an enrollment TOTP in the same 30-second window.
  const wait = 30000 - (Date.now() % 30000) + 1000;
  console.log(`Waiting ${Math.ceil(wait / 1000)}s for a fresh TOTP window.`);
  await new Promise((done) => setTimeout(done, wait));
  await verifyTotp(fallback, factor.id, factor.totp.secret);
  pass('TOTP fallback independently restores provider aal2');
  await api.removeAdminPasskey(account.ctx, fallback, encode(second.id));
  status = await api.getAdminPasskeyStatus(account.ctx, fallback);
  assert.equal(status.passkeys.length, 0);
  const factors = checked(await fallback.auth.mfa.listFactors(), 'factors after passkey removal');
  assert(factors.totp.some((item) => item.id === factor.id && item.status === 'verified'));
  pass('TOTP-verified last passkey removal preserves provider TOTP');
} catch (error) {
  failures += 1;
  // Errors from the application are safe summaries; never print response/token objects.
  console.error(`FAIL ${error instanceof Error ? error.message : 'Unexpected integration failure'}`);
} finally {
  for (const staffId of staffIds) {
    const result = await admin.from('staff').delete().eq('id', staffId);
    if (result.error) { failures += 1; console.error(`CLEANUP staff ${staffId}: ${result.error.code ?? 'error'}`); }
  }
  for (const userId of users) {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error) { failures += 1; console.error(`CLEANUP user ${userId}: ${result.error.code ?? 'error'}`); }
  }
  if (users.length) {
    for (const table of ['admin_passkey_credentials', 'admin_passkey_challenges', 'admin_passkey_grants']) {
      const result = await admin.from(table).select('user_id', { count: 'exact', head: true }).in('user_id', users);
      if (result.error || result.count !== 0) {
        failures += 1; console.error(`CLEANUP residual verification failed for ${table}`);
      }
    }
  }
  for (const client of clients) client.auth.stopAutoRefresh();
  admin.auth.stopAutoRefresh();
  await loader?.close();
}
if (failures) process.exitCode = 1;
else console.log(`PASS ${passes.length} staging protocol checks; disposable users and staff deleted. Native provider/device UI was not tested.`);
