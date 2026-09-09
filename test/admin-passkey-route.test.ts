import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  serverClient: vi.fn(),
  rateLimit: vi.fn(),
  assurance: vi.fn(),
  status: vi.fn(),
  registerOptions: vi.fn(),
  registerVerify: vi.fn(),
  authenticateOptions: vi.fn(),
  authenticateVerify: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/supabase-server', () => ({ createSupabaseServerClient: mocks.serverClient }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitStrict: mocks.rateLimit }));
vi.mock('@/lib/admin-passkeys', () => ({
  AdminPasskeyError: class extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  getAdminPasskeyOrigin: () => 'https://app.letsgetquoted.com',
  getAdminPasskeyStatus: mocks.status,
  beginAdminPasskeyRegistration: mocks.registerOptions,
  finishAdminPasskeyRegistration: mocks.registerVerify,
  beginAdminPasskeyAuthentication: mocks.authenticateOptions,
  finishAdminPasskeyAuthentication: mocks.authenticateVerify,
  removeAdminPasskey: mocks.remove,
}));

import { GET, POST } from '@/app/api/admin/security/passkeys/route';
import { AdminPasskeyError } from '@/lib/admin-passkeys';

const origin = 'https://app.letsgetquoted.com';
const context = {
  admin: { trustedClient: true }, userId: 'staff-user', adminEmail: 'staff@example.com',
  role: 'finance', staff: { id: 'staff-row', active: true },
};
const sessionClient = { auth: { mfa: { getAuthenticatorAssuranceLevel: mocks.assurance } } };
const operationMocks = [mocks.registerOptions, mocks.registerVerify, mocks.authenticateOptions, mocks.authenticateVerify, mocks.remove];

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/admin/security/passkeys`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
function operation(action: string, fields: Record<string, unknown> = {}) {
  return { action, expectedUserId: context.userId, ...fields };
}
function expectNoOperations() {
  for (const mock of operationMocks) expect(mock).not.toHaveBeenCalled();
}
function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('cache-control')).toContain('private');
  expect(response.headers.get('vary')).toContain('Cookie');
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue(context);
  mocks.serverClient.mockResolvedValue(sessionClient);
  mocks.rateLimit.mockResolvedValue(true);
  mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });
  mocks.status.mockResolvedValue({ passkeys: [], verified: false, verifiedUntil: null });
  mocks.registerOptions.mockResolvedValue({ challengeId: 'challenge', options: { challenge: 'registration-options' } });
  mocks.registerVerify.mockResolvedValue({ registered: true });
  mocks.authenticateOptions.mockResolvedValue({ challengeId: 'challenge', options: { challenge: 'authentication-options' } });
  mocks.authenticateVerify.mockResolvedValue({ verified: true, verifiedUntil: '2026-09-09T20:00:00Z' });
  mocks.remove.mockResolvedValue(undefined);
});

describe('Admin passkey API authorization and transport', () => {
  it.each(['GET', 'POST'])('preserves the active-staff guard before %s can access passkeys', async (method) => {
    mocks.requireAdmin.mockRejectedValue(new Error('NEXT_NOT_FOUND'));

    await expect(method === 'GET' ? GET() : POST(request(operation('authenticate-options')))).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mocks.serverClient).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expectNoOperations();
  });

  it('returns status for the server-authenticated user without caching it or claiming provider AAL2', async () => {
    mocks.status.mockResolvedValue({
      passkeys: [{ id: 'credential', label: 'Dashlane', createdAt: '2026-09-09', lastUsedAt: null }],
      verified: true, verifiedUntil: '2026-09-09T20:00:00Z',
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toMatchObject({ userId: 'staff-user', providerLevel: 'aal1', verified: true });
    expect(mocks.status).toHaveBeenCalledWith(context, sessionClient);
  });

  it.each([
    { data: null, error: new Error('Provider down') },
    { data: null, error: null },
  ])('does not return a successful security status when provider assurance is unavailable', async (assurance) => {
    mocks.assurance.mockResolvedValue(assurance);

    const response = await GET();

    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(await response.json()).toEqual({ error: 'Could not check your authenticator session.' });
  });

  it.each(['aal1', 'aal2'])('preserves provider TOTP status when the passkey store is unavailable (%s)', async (providerLevel) => {
    mocks.status.mockRejectedValue(new AdminPasskeyError('Passkeys could not be loaded.', 503));
    mocks.assurance.mockResolvedValue({ data: { currentLevel: providerLevel }, error: null });

    const response = await GET();

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual({
      passkeys: [], verified: false, verifiedUntil: null, passkeysUnavailable: true,
      userId: 'staff-user', providerLevel,
    });
    expectNoOperations();
  });

  it('does not claim a usable TOTP session when both passkey status and provider assurance are unavailable', async () => {
    mocks.status.mockRejectedValue(new AdminPasskeyError('Passkeys could not be loaded.', 503));
    mocks.assurance.mockResolvedValue({ data: null, error: new Error('Provider down') });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Could not check your authenticator session.' });
  });

  it.each([401, 403])('keeps passkey-service authorization failures denied even when the provider reports AAL2 (%s)', async (status) => {
    mocks.status.mockRejectedValue(new AdminPasskeyError('Your security session is no longer authorized.', status));
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });

    const response = await GET();

    expect(response.status).toBe(status);
    expectPrivate(response);
    expect(await response.json()).toEqual({ error: 'Your security session is no longer authorized.' });
  });

  it.each(['https://attacker.example', 'https://app.letsgetquoted.com.attacker.example', 'null', ''])('rejects an untrusted or missing Origin before creating a ceremony (%s)', async (untrustedOrigin) => {
    const response = await POST(request(operation('authenticate-options'), { origin: untrustedOrigin }));

    expect(response.status).toBe(403);
    expectPrivate(response);
    expect(mocks.serverClient).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expectNoOperations();
  });

  it('rejects a form-compatible content type before a credential mutation', async () => {
    const response = await POST(request(operation('remove', { credentialId: 'credential' }), { 'content-type': 'text/plain' }));

    expect(response.status).toBe(415);
    expectNoOperations();
  });

  it.each(['application/json-not-really', 'application/json-patch+json'])('rejects a content type that only shares the JSON prefix (%s)', async (contentType) => {
    const response = await POST(request(operation('authenticate-options'), { 'content-type': contentType }));

    expect(response.status).toBe(415);
    expectNoOperations();
  });

  it('accepts a JSON MIME type with charset parameters', async () => {
    const response = await POST(request(operation('authenticate-options'), { 'content-type': 'application/json; charset=utf-8' }));

    expect(response.status).toBe(200);
    expect(mocks.authenticateOptions).toHaveBeenCalledWith(context, sessionClient);
  });

  it.each([null, [], 'not-an-object', 1])('rejects JSON that is not a request object (%j)', async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expectNoOperations();
  });

  it('rejects invalid JSON and oversized WebAuthn responses', async () => {
    for (const [body, expectedStatus] of [['{', 400], ['x'.repeat(65_537), 413]] as const) {
      const response = await POST(new Request(`${origin}/api/admin/security/passkeys`, {
        method: 'POST', headers: { origin, 'content-type': 'application/json' }, body,
      }));
      expect(response.status).toBe(expectedStatus);
      expectPrivate(response);
    }
    expectNoOperations();
  });

  it.each([undefined, null, 'different-user'])('rejects a stale or missing expected account before accessing credentials (%s)', async (expectedUserId) => {
    const response = await POST(request(operation('authenticate-options', { expectedUserId })));

    expect(response.status).toBe(409);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.serverClient).not.toHaveBeenCalled();
    expectNoOperations();
  });

  it('fails closed on the shared attempt limit before issuing options', async () => {
    mocks.rateLimit.mockResolvedValue(false);

    const response = await POST(request(operation('authenticate-options')));

    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith(context.admin, 'admin-passkeys:staff-user', 40, 300);
    expect(mocks.serverClient).not.toHaveBeenCalled();
    expectNoOperations();
  });

  it('binds registration to the trusted account/session and ignores client attempts to replace them', async () => {
    const response = await POST(request(operation('register-options', {
      label: '  Dashlane  ', userId: 'attacker', sessionId: 'attacker-session',
      admin: { trustedClient: false }, providerLevel: 'aal2', verified: true,
    })));

    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(mocks.registerOptions).toHaveBeenCalledWith(context, sessionClient, { label: 'Dashlane' });
  });

  it.each(['', '   ', 'x'.repeat(81), null])('rejects an invalid registration label (%s)', async (label) => {
    const response = await POST(request(operation('register-options', { label })));

    expect(response.status).toBe(400);
    expectNoOperations();
  });

  it('gets authentication options only from the current trusted context', async () => {
    const response = await POST(request(operation('authenticate-options', { sessionId: 'forged', userId: 'forged' })));

    expect(response.status).toBe(200);
    expect(mocks.authenticateOptions).toHaveBeenCalledWith(context, sessionClient);
  });

  it.each(['register-verify', 'authenticate-verify'])('passes %s cryptographic evidence to the service without trusting client assurance', async (action) => {
    const credentialResponse = { id: 'credential', type: 'public-key', response: { clientDataJSON: 'untrusted-evidence' } };
    const response = await POST(request(operation(action, {
      challengeId: 'challenge', response: credentialResponse, verified: true, sessionId: 'forged',
    })));

    expect(response.status).toBe(200);
    const verify = action === 'register-verify' ? mocks.registerVerify : mocks.authenticateVerify;
    expect(verify).toHaveBeenCalledWith(context, sessionClient, { challengeId: 'challenge', response: credentialResponse });
  });

  it.each([
    { challengeId: '', response: {} },
    { challengeId: null, response: {} },
    { challengeId: 'x'.repeat(65), response: {} },
    { challengeId: 'challenge', response: null },
    { challengeId: 'challenge', response: 'not-an-object' },
    { challengeId: 'challenge', response: [] },
  ])('rejects malformed verification input before cryptographic verification (%j)', async (fields) => {
    const response = await POST(request(operation('authenticate-verify', fields)));

    expect(response.status).toBe(400);
    expectNoOperations();
  });

  it('removes only the supplied credential within the authenticated user context', async () => {
    const response = await POST(request(operation('remove', { credentialId: 'owned-credential', userId: 'another-user' })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true });
    expect(mocks.remove).toHaveBeenCalledWith(context, sessionClient, 'owned-credential');
  });

  it.each(['', null, 'x'.repeat(2049)])('rejects an invalid removal identifier (%s)', async (credentialId) => {
    const response = await POST(request(operation('remove', { credentialId })));

    expect(response.status).toBe(400);
    expectNoOperations();
  });

  it('rejects an unknown action without invoking a credential operation', async () => {
    const response = await POST(request(operation('reset-other-user')));

    expect(response.status).toBe(400);
    expectNoOperations();
  });

  it('preserves safe service errors and never reports rejected verification as successful', async () => {
    const serviceError = new AdminPasskeyError('Challenge expired. Try again.', 400);
    mocks.authenticateVerify.mockRejectedValue(serviceError);

    const response = await POST(request(operation('authenticate-verify', { challengeId: 'challenge', response: {} })));

    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(await response.json()).toEqual({ error: 'Challenge expired. Try again.' });
  });

  it.each(['GET', 'POST'])('does not expose internal provider errors through %s', async (method) => {
    const error = new Error('PRIVATE DATABASE DETAIL: token=do-not-expose');
    mocks.status.mockRejectedValue(error);
    mocks.authenticateOptions.mockRejectedValue(error);

    const response = method === 'GET' ? await GET() : await POST(request(operation('authenticate-options')));

    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(await response.json()).toEqual({ error: 'Could not verify your security session. Try again.' });
  });
});
