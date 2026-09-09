import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), listFactors: vi.fn(), enroll: vi.fn(), challenge: vi.fn(), verify: vi.fn(), unenroll: vi.fn(),
  refreshSession: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(),
  startRegistration: vi.fn(), startAuthentication: vi.fn(), browserSupportsWebAuthn: vi.fn(), cancelCeremony: vi.fn(),
  fetch: vi.fn(), reload: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {
  getUser: mocks.getUser, refreshSession: mocks.refreshSession, onAuthStateChange: mocks.onAuthStateChange,
  mfa: { listFactors: mocks.listFactors, enroll: mocks.enroll, challenge: mocks.challenge, verify: mocks.verify, unenroll: mocks.unenroll },
} } }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: mocks.browserSupportsWebAuthn,
  startRegistration: mocks.startRegistration, startAuthentication: mocks.startAuthentication,
  WebAuthnAbortService: { cancelCeremony: mocks.cancelCeremony },
}));
import MfaPanel from '@/app/admin/security/MfaPanel';

type Factor = { id: string; factor_type: string; friendly_name: string; status: string };
type State = {
  userId: string; providerLevel: string; verified: boolean; verifiedUntil: string | null;
  passkeys: Array<{ id: string; label: string; createdAt: string; lastUsedAt: string | null }>;
  passkeysUnavailable?: boolean;
};
let factors: Factor[];
let security: State;
let currentUser: { id: string } | null;
let renderer: ReactTestRenderer | undefined;
const accountId = 'staff-user';
const accountEmail = 'staff@example.com';
const secret = 'SYNTHETIC-SETUP-SECRET';
const nativeResponse = { id: 'native-credential', type: 'public-key', response: { clientDataJSON: 'synthetic' } };
const registrationOptions = { challenge: 'create-challenge', rp: { id: 'app.letsgetquoted.com', name: 'Let’s Get Quoted' } };
const authenticationOptions = { challenge: 'request-challenge', rpId: 'app.letsgetquoted.com' };
const backup = (id: string, name: string, status = 'verified'): Factor => ({ id, friendly_name: name, status, factor_type: 'totp' });
const savedPasskey = { id: 'native-credential', label: 'Dashlane', createdAt: '2026-09-09', lastUsedAt: null };

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
function text(node: ReactTestInstance): string { return node.children.map(child => typeof child === 'string' ? child : text(child)).join(''); }
function screen() { return text(renderer!.root); }
function button(name: string) {
  const found = renderer!.root.findAllByType('button').find(node => node.props['aria-label'] === name || text(node) === name);
  if (!found) throw new Error(`Button not found: ${name}`);
  return found;
}
function input(id: string) { return renderer!.root.findByProps({ id }); }
async function flush() { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }
async function mount() {
  await act(async () => {
    renderer = create(React.createElement(MfaPanel, { stepUp: true, accountEmail, accountId }));
    await flush();
  });
}
async function click(name: string) {
  const target = button(name);
  expect(target.props.disabled).not.toBe(true);
  await act(async () => { await target.props.onClick(); await flush(); });
}
async function change(id: string, value: string) {
  await act(async () => { input(id).props.onChange({ target: { value } }); await flush(); });
}
async function submitCode(code = '123456') {
  await change('mfa-code', code);
  await act(async () => {
    renderer!.root.findByProps({ 'aria-label': 'Verify authenticator code' }).props.onSubmit({ preventDefault() {} });
    await flush();
  });
}
function posts(action?: string) {
  return mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(init.body as string) as Record<string, unknown>)
    .filter(body => !action || body.action === action);
}
function authEvent(event: string, user: { id: string } | null) {
  const callback = mocks.onAuthStateChange.mock.calls[0]![0];
  callback(event, user ? { user } : null);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('React', React);
  vi.stubGlobal('window', { isSecureContext: true, location: { reload: mocks.reload } });
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  vi.stubGlobal('fetch', mocks.fetch);
  currentUser = { id: accountId };
  factors = [backup('totp-main', 'Main authenticator')];
  security = { userId: accountId, providerLevel: 'aal1', passkeys: [savedPasskey], verified: false, verifiedUntil: null };
  mocks.getUser.mockImplementation(async () => ({ data: { user: currentUser }, error: null }));
  mocks.listFactors.mockImplementation(async () => ({ data: { all: structuredClone(factors) }, error: null }));
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
  mocks.browserSupportsWebAuthn.mockReturnValue(true);
  mocks.startRegistration.mockResolvedValue(nativeResponse);
  mocks.startAuthentication.mockResolvedValue(nativeResponse);
  mocks.enroll.mockImplementation(async (args) => {
    const factor = backup('pending-factor', args.friendlyName, 'unverified');
    factors.push(factor);
    return { data: { ...factor, totp: { qr_code: 'data:image/png;base64,synthetic', secret } }, error: null };
  });
  mocks.challenge.mockResolvedValue({ data: { id: 'totp-challenge' }, error: null });
  mocks.verify.mockImplementation(async ({ factorId }) => {
    factors.find(factor => factor.id === factorId)!.status = 'verified';
    security.providerLevel = 'aal2';
    return { data: {}, error: null };
  });
  mocks.unenroll.mockImplementation(async ({ factorId }) => {
    factors = factors.filter(factor => factor.id !== factorId);
    return { data: {}, error: null };
  });
  mocks.refreshSession.mockImplementation(async () => {
    security.providerLevel = 'aal1';
    return { data: { session: { user: currentUser } }, error: null };
  });
  mocks.fetch.mockImplementation(async (_url, init?: RequestInit) => {
    if (init?.method !== 'POST') return json(security);
    const body = JSON.parse(init.body as string);
    switch (body.action) {
      case 'register-options': return json({ challengeId: 'registration-id', options: registrationOptions });
      case 'register-verify': security.passkeys = [savedPasskey]; return json({ registered: true });
      case 'authenticate-options': return json({ challengeId: 'authentication-id', options: authenticationOptions });
      case 'authenticate-verify':
        security.verified = true; security.verifiedUntil = new Date(Date.now() + 15 * 60_000).toISOString();
        return json({ verified: true });
      case 'remove': security.passkeys = []; security.verified = false; security.verifiedUntil = null; return json({ removed: true });
      default: throw new Error(`Unexpected operation: ${body.action}`);
    }
  });
});

afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); await flush(); });
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Admin security client flows', () => {
  it('requires verified TOTP bootstrap before invoking native passkey registration', async () => {
    factors = []; security.passkeys = [];
    await mount();
    expect(button('Add passkey').props.disabled).toBe(true);

    await click('Set up authenticator backup');
    expect(screen()).toContain(secret);
    expect(mocks.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Authenticator app', issuer: 'app.letsgetquoted.com' });
    expect(button('Add passkey').props.disabled).toBe(true);
    await submitCode();

    expect(screen()).not.toContain(secret);
    expect(screen()).toContain('Authenticator verified.');
    expect(button('Add passkey').props.disabled).toBe(false);
    await change('passkey-label', 'Apple Passwords');
    await click('Add passkey');

    expect(mocks.startRegistration).toHaveBeenCalledWith({ optionsJSON: registrationOptions });
    expect(posts('register-options')).toEqual([{ action: 'register-options', label: 'Apple Passwords', expectedUserId: accountId }]);
    expect(posts('register-verify')).toEqual([{ action: 'register-verify', challengeId: 'registration-id', response: nativeResponse, expectedUserId: accountId }]);
    expect(screen()).toContain('Passkey added. Keep your authenticator codes available as backup.');
  });

  it('uses server challenge options for native authentication and requires refreshed server assurance', async () => {
    await mount();
    await click('Verify with passkey');

    expect(mocks.startAuthentication).toHaveBeenCalledWith({ optionsJSON: authenticationOptions });
    expect(posts('authenticate-options')).toEqual([{ action: 'authenticate-options', expectedUserId: accountId }]);
    expect(posts('authenticate-verify')).toEqual([{ action: 'authenticate-verify', challengeId: 'authentication-id', response: nativeResponse, expectedUserId: accountId }]);
    expect(screen()).toContain('Passkey verified. High-impact actions are unlocked for 15 minutes.');
    expect(screen()).toContain('MFA verified');
    expect(security.providerLevel).toBe('aal1');
  });

  it('keeps authenticator codes available after the native prompt is cancelled', async () => {
    const cancelled = new Error('User closed the native prompt'); cancelled.name = 'NotAllowedError';
    mocks.startAuthentication.mockRejectedValueOnce(cancelled);
    await mount();
    await click('Verify with passkey');

    expect(screen()).toContain('Passkey prompt closed. Try again or use an authenticator code.');
    expect(screen()).not.toContain('MFA verified');
    expect(posts('authenticate-verify')).toEqual([]);
    expect(input('mfa-code').props.disabled).toBe(false);
    await submitCode();
    expect(screen()).toContain('Authenticator verified.');
  });

  it('does not claim success when the server rejects the native response', async () => {
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url, init) => init?.method === 'POST' && JSON.parse(init.body).action === 'authenticate-verify'
      ? json({ error: 'Passkey verification failed.' }, 400) : original(url, init));
    await mount();
    await click('Verify with passkey');

    expect(screen()).toContain('Passkey verification failed.');
    expect(screen()).not.toContain('MFA verified');
    expect(screen()).not.toContain('High-impact actions are unlocked');
    expect(input('mfa-code').props.disabled).toBe(false);
  });

  it('does not claim success from the verify response when refreshed server state is still unverified', async () => {
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url, init) => init?.method === 'POST' && JSON.parse(init.body).action === 'authenticate-verify'
      ? json({ verified: true }) : original(url, init));
    await mount();
    await click('Verify with passkey');

    expect(screen()).toContain('Your session still needs verification. Try an authenticator code.');
    expect(screen()).not.toContain('MFA verified');
    expect(screen()).not.toContain('High-impact actions are unlocked');
  });

  it('preserves a selected backup authenticator through rejected codes and retry', async () => {
    factors.push(backup('totp-backup', 'Backup authenticator'));
    mocks.verify.mockResolvedValueOnce({ data: null, error: new Error('Incorrect code. Try again.') });
    await mount();
    await change('totp-factor', 'totp-backup');
    await submitCode('111111');

    expect(screen()).toContain('Incorrect code. Try again.');
    expect(input('totp-factor').props.value).toBe('totp-backup');
    expect(screen()).not.toContain('MFA verified');
    await submitCode('222222');

    expect(mocks.challenge.mock.calls).toEqual([[{ factorId: 'totp-backup' }], [{ factorId: 'totp-backup' }]]);
    expect(mocks.verify.mock.calls).toEqual([
      [{ factorId: 'totp-backup', challengeId: 'totp-challenge', code: '111111' }],
      [{ factorId: 'totp-backup', challengeId: 'totp-challenge', code: '222222' }],
    ]);
    expect(input('totp-factor').props.value).toBe('totp-backup');
    expect(screen()).toContain('Authenticator verified.');
  });

  it('invalidates a pending native prompt when the account changes and never posts its response', async () => {
    const native = deferred<typeof nativeResponse>();
    mocks.startAuthentication.mockReturnValueOnce(native.promise);
    await mount();
    await act(async () => { void button('Verify with passkey').props.onClick(); await flush(); });
    expect(mocks.startAuthentication).toHaveBeenCalledOnce();

    await act(async () => {
      currentUser = { id: 'different-account' }; authEvent('SIGNED_IN', currentUser);
      native.resolve(nativeResponse); await flush();
    });

    expect(mocks.cancelCeremony).toHaveBeenCalled();
    expect(posts('authenticate-verify')).toEqual([]);
    expect(screen()).toContain('Your signed-in account changed. Reload Security before continuing.');
    expect(screen()).not.toContain('MFA verified');
    expect(button('Add passkey').props.disabled).toBe(true);
    expect(button('Reload Security')).toBeDefined();
  });

  it('clears setup secrets on sign-out while a TOTP challenge is pending and never verifies it', async () => {
    factors = []; security.passkeys = [];
    await mount();
    await click('Set up authenticator backup');
    expect(screen()).toContain(secret);
    const challenge = deferred<{ data: { id: string }; error: null }>();
    mocks.challenge.mockReturnValueOnce(challenge.promise);
    await submitCode();
    expect(mocks.challenge).toHaveBeenCalledOnce();

    await act(async () => {
      currentUser = null; authEvent('SIGNED_OUT', null);
      challenge.resolve({ data: { id: 'late-challenge' }, error: null }); await flush();
    });

    expect(mocks.verify).not.toHaveBeenCalled();
    expect(screen()).not.toContain(secret);
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    expect(screen()).not.toContain('MFA verified');
    expect(button('Set up authenticator backup').props.disabled).toBe(true);
  });

  it('clears the prior account setup when the server renders the panel for a different account', async () => {
    factors = []; security.passkeys = [];
    await mount();
    await click('Set up authenticator backup');
    expect(screen()).toContain(secret);

    await act(async () => {
      currentUser = { id: 'new-staff-user' };
      factors = [];
      security = { userId: currentUser.id, providerLevel: 'aal1', passkeys: [], verified: false, verifiedUntil: null };
      renderer!.update(React.createElement(MfaPanel, { stepUp: true, accountEmail: 'other@example.com', accountId: currentUser.id }));
      await flush();
    });

    expect(screen()).not.toContain(secret);
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    expect(mocks.cancelCeremony).toHaveBeenCalled();
    expect(screen()).not.toContain('MFA verified');
  });

  it('locks security after factor removal if the provider session cannot refresh', async () => {
    security.providerLevel = 'aal2';
    factors.push(backup('totp-backup', 'Backup authenticator'));
    mocks.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('Refresh failed') });
    await mount();
    await click('Remove authenticator Main authenticator');

    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: 'totp-main' });
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
    expect(screen()).toContain('Authenticator removed, but your session could not refresh. Sign in again before continuing.');
    expect(screen()).not.toContain('MFA verified');
    expect(button('Add passkey').props.disabled).toBe(true);
    expect(input('mfa-code').props.disabled).toBe(true);
    expect(button('Reload Security')).toBeDefined();
  });

  it.each([false, true])('preserves the only verified TOTP backup while passkeys exist or their status is unavailable (%s)', async (unavailable) => {
    security.providerLevel = 'aal2';
    if (unavailable) { security.passkeys = []; security.passkeysUnavailable = true; }
    await mount();
    expect(button('Remove authenticator Main authenticator').props.disabled).toBe(true);

    // The handler also protects the backup if invoked before a stale button
    // render catches up with refreshed factor state.
    await act(async () => { await button('Remove authenticator Main authenticator').props.onClick(); await flush(); });

    expect(mocks.unenroll).not.toHaveBeenCalled();
    expect(screen()).toContain('Add and verify a replacement authenticator before removing your last backup.');
  });

  it('expires the displayed passkey assurance and asks for verification again', async () => {
    vi.useFakeTimers();
    security.verified = true; security.verifiedUntil = new Date(Date.now() + 1_000).toISOString();
    await mount();
    expect(screen()).toContain('MFA verified');

    await act(async () => { vi.advanceTimersByTime(1_001); await flush(); });

    expect(screen()).not.toContain('MFA verified');
    expect(screen()).toContain('This action needs an authenticator check before it can continue.');
    expect(button('Remove passkey Dashlane').props.disabled).toBe(true);
    expect(button('Verify with passkey').props.disabled).toBe(false);
  });

  it('resumes an incomplete TOTP enrollment after page reload without generating or deleting a factor', async () => {
    factors = [backup('saved-pending', 'Saved setup', 'unverified')]; security.passkeys = [];
    await mount();
    expect(screen()).toContain('Already saved this setup? Enter its current code to finish.');
    expect(renderer!.root.findAllByType('img')).toHaveLength(0);
    await submitCode();

    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.unenroll).not.toHaveBeenCalled();
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: 'saved-pending', challengeId: 'totp-challenge', code: '123456' });
    expect(screen()).toContain('Authenticator verified.');
    expect(button('Add passkey').props.disabled).toBe(false);
  });

  it('keeps TOTP usable while server reports that passkeys are unavailable', async () => {
    security.passkeys = []; security.passkeysUnavailable = true;
    await mount();
    expect(screen()).toContain('Passkeys are temporarily unavailable. Use your authenticator backup below.');
    expect(button('Add passkey').props.disabled).toBe(true);
    expect(input('mfa-code').props.disabled).toBe(false);
    await submitCode();

    expect(screen()).toContain('Authenticator verified.');
    expect(button('Add passkey').props.disabled).toBe(true);
  });
});
