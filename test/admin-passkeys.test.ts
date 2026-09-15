import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminPasskeyRelyingParty, beginAdminPasskeyAuthentication, beginAdminPasskeyRegistration,
  finishAdminPasskeyAuthentication, finishAdminPasskeyRegistration,
  getAdminPasskeyStatus, hasAdminPasskeyGrant, removeAdminPasskey,
} from '@/lib/admin-passkeys';

const USER = '67be559a-dfe3-42c7-b960-a3fd5bcfa29b';
const SESSION = '74a3498c-80f3-4e6b-9ec3-4fa7c4b490a4';
const CHALLENGE_ID = '7d975f98-03f2-4ba3-8f1d-616c9b9568bc';
const ORIGIN = 'https://app.letsgetquoted.com';
const RP = 'app.letsgetquoted.com';
const b64 = (value: Uint8Array) => Buffer.from(value).toString('base64url');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest();

// A real P-256 test authenticator. Production code only verifies public-key
// responses; private keys here are generated afresh and never leave this test.
function cborHeader(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value <= 255) return Buffer.from([(major << 5) | 24, value]);
  const result = Buffer.alloc(3); result[0] = (major << 5) | 25; result.writeUInt16BE(value, 1); return result;
}
function cbor(value: number | string | Buffer | Map<unknown, unknown>): Buffer {
  if (typeof value === 'number') return cborHeader(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
  if (typeof value === 'string') { const bytes = Buffer.from(value); return Buffer.concat([cborHeader(3, bytes.length), bytes]); }
  if (Buffer.isBuffer(value)) return Buffer.concat([cborHeader(2, value.length), value]);
  return Buffer.concat([cborHeader(5, value.size), ...Array.from(value.entries()).flatMap(([key, item]) => [cbor(key as number), cbor(item as Buffer)])]);
}
function authenticator() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const cose = cbor(new Map<number, number | Buffer>([
    [1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')],
  ]));
  return { id: b64(randomBytes(32)), privateKey: pair.privateKey, publicKey: cose };
}
type Key = ReturnType<typeof authenticator>;
function assertion(key: Key, challenge: string, changes: { origin?: string; uv?: boolean; counter?: number; userHandle?: string; rpID?: string } = {}): AuthenticationResponseJSON {
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: changes.origin ?? ORIGIN, crossOrigin: false }));
  const counter = Buffer.alloc(4); counter.writeUInt32BE(changes.counter ?? 1);
  const authData = Buffer.concat([hash(changes.rpID ?? RP), Buffer.from([changes.uv === false ? 0x01 : 0x05]), counter]);
  return {
    id: key.id, rawId: key.id, type: 'public-key', clientExtensionResults: {},
    response: { clientDataJSON: b64(clientData), authenticatorData: b64(authData),
      signature: b64(sign('sha256', Buffer.concat([authData, hash(clientData)]), key.privateKey)), userHandle: changes.userHandle },
  };
}
function registration(key: Key, challenge: string, uv = true): RegistrationResponseJSON {
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN, crossOrigin: false }));
  const id = Buffer.from(key.id, 'base64url');
  const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
  const authData = Buffer.concat([hash(RP), Buffer.from([uv ? 0x45 : 0x41]), Buffer.alloc(4), Buffer.alloc(16), length, id, key.publicKey]);
  const attestation = cbor(new Map<string, string | Map<unknown, unknown> | Buffer>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
  return { id: key.id, rawId: key.id, type: 'public-key', clientExtensionResults: {},
    response: { clientDataJSON: b64(clientData), attestationObject: b64(attestation), transports: ['internal', 'hybrid'] } };
}

function setup({ totp = false, active = true, counter = 0 } = {}) {
  const key = authenticator();
  const challenge = b64(randomBytes(32));
  const claims = { sub: USER, session_id: SESSION, exp: Math.floor(Date.now() / 1000) + 3600,
    aal: totp ? 'aal2' : 'aal1', amr: [{ method: totp ? 'totp' : 'password', timestamp: 1 }] };
  const rows = [{ id: key.id, user_id: USER, label: 'Apple or Dashlane', public_key: b64(key.publicKey), counter, revision: 4,
    transports: ['internal', 'hybrid'], rp_id: RP, created_at: new Date().toISOString(), last_used_at: null }];
  let consumed = false;
  let until: string | null = null;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === 'admin_passkey_session_active') return { data: active, error: null };
    if (name === 'admin_passkey_begin_challenge') return { data: CHALLENGE_ID, error: null };
    if (name === 'admin_passkey_consume_challenge') {
      if (consumed) return { data: [], error: null };
      consumed = true;
      return { data: [{ id: CHALLENGE_ID, challenge, rp_id: RP, origin: ORIGIN }], error: null };
    }
    if (name === 'admin_passkey_finish_authentication') {
      until = new Date(Date.now() + 15 * 60_000).toISOString();
      return { data: until, error: null };
    }
    if (name === 'admin_passkey_finish_registration') return { data: args.p_credential_id, error: null };
    if (name === 'admin_passkey_grant_status') return { data: until, error: null };
    if (name === 'admin_passkey_remove') return { data: true, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(async () => ({ data: rows, error: null })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const admin = { rpc, from: vi.fn(() => query) } as unknown as SupabaseClient;
  const getClaims = vi.fn(async () => ({ data: { claims }, error: null }));
  const supabase = { auth: {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'opaque-signed-jwt' } }, error: null })), getClaims,
  } } as unknown as SupabaseClient;
  return { key, challenge, claims, rows, calls, rpc, getClaims, query, supabase, context: { admin, userId: USER, adminEmail: 'admin@example.invalid' }, setUntil: (value: string | null) => { until = value; } };
}

beforeEach(() => { vi.stubEnv('ADMIN_PASSKEY_ORIGIN', ORIGIN); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('app-managed admin passkey security', () => {
  it('uses a canonical RP and only permits explicitly configured localhost outside production', () => {
    expect(adminPasskeyRelyingParty()).toEqual({ origin: ORIGIN, rpID: RP });
    vi.stubEnv('ADMIN_PASSKEY_ORIGIN', '  ');
    expect(adminPasskeyRelyingParty()).toEqual({ origin: ORIGIN, rpID: RP });
    vi.stubEnv('ADMIN_PASSKEY_ORIGIN', 'https://attacker.invalid');
    expect(() => adminPasskeyRelyingParty()).toThrow();
    vi.stubEnv('ADMIN_PASSKEY_ORIGIN', 'http://localhost:3031');
    expect(adminPasskeyRelyingParty()).toEqual({ origin: 'http://localhost:3031', rpID: 'localhost' });
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => adminPasskeyRelyingParty()).toThrow();
  });

  it('requires provider TOTP verification before adding any passkey', async () => {
    const t = setup();
    await expect(beginAdminPasskeyRegistration(t.context, t.supabase)).rejects.toThrow('authenticator code');
    expect(t.rpc).not.toHaveBeenCalled();
  });

  it('requests user verification without restricting Apple, password managers, or cross-device authenticators', async () => {
    const t = setup({ totp: true });
    const result = await beginAdminPasskeyRegistration(t.context, t.supabase, { label: 'Dashlane' });
    expect(result.options.authenticatorSelection).toMatchObject({ userVerification: 'required', residentKey: 'preferred' });
    expect(result.options.authenticatorSelection?.authenticatorAttachment).toBeUndefined();
    expect(result.options.rp.id).toBe(RP);
    expect(result.options.excludeCredentials).toContainEqual({ id: t.key.id, type: 'public-key', transports: ['internal', 'hybrid'] });
    expect(t.calls.find((call) => call.name === 'admin_passkey_begin_challenge')?.args).toMatchObject({ p_user_id: USER, p_session_id: SESSION, p_origin: ORIGIN, p_rp_id: RP, p_label: 'Dashlane' });
  });

  it('verifies the signed JWT before authorizing its user and session claims', async () => {
    const t = setup();
    t.claims.sub = 'b96026e8-ac8d-4571-832b-c445082bfe8a';
    await expect(getAdminPasskeyStatus(t.context, t.supabase)).rejects.toThrow('account or session changed');
    expect(t.getClaims).toHaveBeenCalledWith('opaque-signed-jwt');
    expect(t.rpc).not.toHaveBeenCalled();
  });

  it('fails closed for expired JWTs, missing session IDs, or deleted provider sessions', async () => {
    const t = setup();
    t.claims.exp = 1;
    expect(await hasAdminPasskeyGrant(t.context, t.supabase)).toBe(false);
    t.claims.exp = Math.floor(Date.now() / 1000) + 3600;
    t.claims.session_id = '';
    expect(await hasAdminPasskeyGrant(t.context, t.supabase)).toBe(false);
    const revoked = setup({ active: false });
    revoked.setUntil(new Date(Date.now() + 60_000).toISOString());
    expect(await hasAdminPasskeyGrant(revoked.context, revoked.supabase)).toBe(false);
  });

  it('fails closed on database errors and expired grants', async () => {
    const t = setup();
    t.rpc.mockRejectedValueOnce(new Error('Database unavailable'));
    expect(await hasAdminPasskeyGrant(t.context, t.supabase)).toBe(false);
    t.setUntil(new Date(Date.now() - 1000).toISOString());
    expect(await hasAdminPasskeyGrant(t.context, t.supabase)).toBe(false);
  });

  it('only offers credentials owned by the signed-in account and requires device verification', async () => {
    const t = setup();
    const result = await beginAdminPasskeyAuthentication(t.context, t.supabase);
    expect(t.query.eq).toHaveBeenCalledWith('user_id', USER);
    expect(result.options.userVerification).toBe('required');
    expect(result.options.allowCredentials?.map((item) => item.id)).toEqual([t.key.id]);
  });

  it('stores a genuinely verified registration public key without issuing an app grant', async () => {
    const t = setup({ totp: true });
    const key = authenticator();
    await expect(finishAdminPasskeyRegistration(t.context, t.supabase, {
      challengeId: CHALLENGE_ID, response: registration(key, t.challenge),
    })).resolves.toEqual({ id: key.id });
    const commit = t.calls.find((call) => call.name === 'admin_passkey_finish_registration');
    expect(commit?.args).toMatchObject({ p_credential_id: key.id, p_public_key: b64(key.publicKey), p_counter: 0, p_user_id: USER, p_session_id: SESSION });
    expect(t.calls.some((call) => call.name === 'admin_passkey_finish_authentication')).toBe(false);
  });

  it('rejects registration when the authenticator did not verify its user', async () => {
    const t = setup({ totp: true });
    await expect(finishAdminPasskeyRegistration(t.context, t.supabase, { challengeId: CHALLENGE_ID,
      response: registration(authenticator(), t.challenge, false) })).rejects.toThrow('could not be verified');
    expect(t.calls.some((call) => call.name === 'admin_passkey_finish_registration')).toBe(false);
  });

  it.each([
    ['wrong origin', { origin: 'https://evil.invalid' }],
    ['wrong relying party', { rpID: 'evil.invalid' }],
    ['missing user verification', { uv: false }],
    ['wrong account user handle', { userHandle: b64(Buffer.from('another-account')) }],
  ])('rejects a cryptographically signed assertion with %s', async (_name, changes) => {
    const t = setup();
    await expect(finishAdminPasskeyAuthentication(t.context, t.supabase, {
      challengeId: CHALLENGE_ID, response: assertion(t.key, t.challenge, changes),
    })).rejects.toThrow();
    expect(t.calls.some((call) => call.name === 'admin_passkey_finish_authentication')).toBe(false);
  });

  it('rejects wrong challenges, forged signatures, and credentials from another account', async () => {
    for (const mutate of [
      (t: ReturnType<typeof setup>) => assertion(t.key, b64(randomBytes(32))),
      (t: ReturnType<typeof setup>) => ({ ...assertion(authenticator(), t.challenge), id: t.key.id, rawId: t.key.id }),
      (t: ReturnType<typeof setup>) => assertion(authenticator(), t.challenge),
    ]) {
      const t = setup();
      await expect(finishAdminPasskeyAuthentication(t.context, t.supabase, { challengeId: CHALLENGE_ID, response: mutate(t) })).rejects.toThrow();
      expect(t.calls.some((call) => call.name === 'admin_passkey_finish_authentication')).toBe(false);
    }
  });

  it('rejects a non-increasing signature counter before creating a grant', async () => {
    const t = setup({ counter: 4 });
    await expect(finishAdminPasskeyAuthentication(t.context, t.supabase, {
      challengeId: CHALLENGE_ID, response: assertion(t.key, t.challenge, { counter: 4 }),
    })).rejects.toThrow('could not be verified');
    expect(t.calls.some((call) => call.name === 'admin_passkey_finish_authentication')).toBe(false);
  });

  it('binds a verified assertion to the credential revision, user and session; cannot replay the challenge', async () => {
    const t = setup();
    const input = { challengeId: CHALLENGE_ID, response: assertion(t.key, t.challenge) };
    await expect(finishAdminPasskeyAuthentication(t.context, t.supabase, input)).resolves.toMatchObject({ verified: true });
    expect(t.calls.find((call) => call.name === 'admin_passkey_finish_authentication')?.args).toMatchObject({
      p_expected_counter: 0, p_expected_revision: 4, p_new_counter: 1, p_credential_id: t.key.id, p_user_id: USER, p_session_id: SESSION,
    });
    await expect(finishAdminPasskeyAuthentication(t.context, t.supabase, input)).rejects.toThrow('already used');
    expect(t.calls.filter((call) => call.name === 'admin_passkey_finish_authentication')).toHaveLength(1);
  });

  it('permits zero-counter synced passkeys while retaining a database revision comparison', async () => {
    const t = setup();
    await finishAdminPasskeyAuthentication(t.context, t.supabase, { challengeId: CHALLENGE_ID, response: assertion(t.key, t.challenge, { counter: 0 }) });
    expect(t.calls.find((call) => call.name === 'admin_passkey_finish_authentication')?.args).toMatchObject({ p_expected_counter: 0, p_new_counter: 0, p_expected_revision: 4 });
  });

  it('only returns display metadata and the current session proof in status', async () => {
    const t = setup();
    t.setUntil(new Date(Date.now() + 600_000).toISOString());
    const status = await getAdminPasskeyStatus(t.context, t.supabase);
    expect(status.verified).toBe(true);
    expect(status.passkeys[0]).toEqual({ id: t.key.id, label: 'Apple or Dashlane', createdAt: t.rows[0].created_at, lastUsedAt: null });
    expect(t.calls.find((call) => call.name === 'admin_passkey_grant_status')?.args).toEqual({ p_user_id: USER, p_session_id: SESSION });
  });

  it('requires a second factor before removal and delegates ownership/revocation to one transaction', async () => {
    const t = setup();
    await expect(removeAdminPasskey(t.context, t.supabase, t.key.id)).rejects.toThrow('before removing');
    expect(t.calls.some((call) => call.name === 'admin_passkey_remove')).toBe(false);
    t.setUntil(new Date(Date.now() + 600_000).toISOString());
    await expect(removeAdminPasskey(t.context, t.supabase, t.key.id)).resolves.toEqual({ removed: true });
    expect(t.calls.find((call) => call.name === 'admin_passkey_remove')?.args).toEqual({ p_user_id: USER, p_session_id: SESSION, p_credential_id: t.key.id });
  });
});
