import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  ingestRegistryCallback: vi.fn(),
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/webhook-failures', () => ({ logWebhookFailure: mocks.logWebhookFailure }));

const TOKEN = 'aaaaaaaabbbbbbbbccccccccdddddddd';
const OTHER_TOKEN = 'zzzzzzzzyyyyyyyyxxxxxxxxwwwwwwww';
const CALLBACK_ID = '33333333-3333-4333-8333-333333333333';

function url(token: string): string {
  return `https://app.letsgetquoted.com/api/sms/registry-status/${token}`;
}

function callback(
  token: string,
  body: string,
  contentType: string | null = 'application/json',
  extraHeaders: Record<string, string> = {},
): Request {
  const headers: Record<string, string> = { ...extraHeaders };
  if (contentType) headers['content-type'] = contentType;
  return new Request(url(token), { method: 'POST', headers, body });
}

async function post(token: string, request: Request) {
  const { POST } = await import('@/app/api/sms/registry-status/[token]/route');
  return POST(request, { params: Promise.resolve({ token }) });
}

const FAILED_BODY = JSON.stringify({
  project_id: '2687f308-939e-4e73-97bd-4edfc0d7fd5a',
  event_at: '2026-08-21T16:41:03Z',
  event_category: 'number_assignment',
  event_type: 'number_assignment_failed',
  state: 'failed',
  brand_id: '4a09f38f-2de4-48b7-aba5-dac76a398ccf',
  campaign_id: '638bad76-629d-4321-90e2-6fe533c09091',
  number_assignment_order_id: '5dd24379-9176-4984-902e-60afcf47aabf',
  number_assignment_id: '02b2c88d-67af-42fd-a56a-a68d4927f975',
  phone_number: '+19479412323',
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN = TOKEN;
  mocks.createAdminClient.mockReturnValue({});
  mocks.logWebhookFailure.mockResolvedValue(undefined);
  mocks.ingestRegistryCallback.mockResolvedValue({
    callbackId: CALLBACK_ID,
    inserted: true,
    applicationId: null,
    disposition: 'received',
  });
});

afterEach(() => {
  delete process.env.LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN;
  delete process.env.LGQ_SIGNALWIRE_REGISTRY_REQUIRE_SIGNATURE;
  delete process.env.SIGNALWIRE_SIGNING_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('the 10DLC registry callback route', () => {
  describe('authentication', () => {
    it('answers 503, not 401, when no token is configured', async () => {
      // These are different failures and an operator must be able to tell them
      // apart: Vercel bakes env at build, so "never reached the build" is the
      // likelier of the two and looks identical under a shared 401.
      delete process.env.LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN;
      const response = await post(TOKEN, callback(TOKEN, FAILED_BODY));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: 'not_configured' });
    });

    it('answers 503 when the configured token is too short to be a credential', async () => {
      process.env.LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN = 'short';
      const response = await post('short', callback('short', FAILED_BODY));
      expect(response.status).toBe(503);
    });

    it('rejects a wrong token with a bodyless 401 and stores nothing', async () => {
      const response = await post(OTHER_TOKEN, callback(OTHER_TOKEN, FAILED_BODY));
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('');
      // Assert against a mock wired at module scope. `ingestRegistryCallback`
      // is only replaced inside the capture block, so asserting it here would
      // pass whether or not the route reached storage.
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    });

    it('never records the supplied token in the failure log', async () => {
      await post(OTHER_TOKEN, callback(OTHER_TOKEN, FAILED_BODY));
      const logged = JSON.stringify(mocks.logWebhookFailure.mock.calls);
      expect(logged).not.toContain(OTHER_TOKEN);
      expect(logged).not.toContain(TOKEN);
      expect(logged).toContain('mismatch');
    });

    it('logs the failure under a source the CHECK constraint admits', async () => {
      // logWebhookFailure swallows its own insert error, so an unlisted source
      // does not throw -- it silently stops logging, during the exact window
      // someone is watching.
      await post(OTHER_TOKEN, callback(OTHER_TOKEN, FAILED_BODY));
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'sms_registry' }),
      );
    });
  });

  describe('capture', () => {
    beforeEach(() => {
      vi.doMock('@/lib/messaging-registry-callback-ingress', async (importOriginal) => ({
        ...(await importOriginal<object>()),
        ingestRegistryCallback: mocks.ingestRegistryCallback,
      }));
    });

    it('stores the exact bytes it received, unmodified', async () => {
      await post(TOKEN, callback(TOKEN, FAILED_BODY));
      expect(mocks.ingestRegistryCallback).toHaveBeenCalledTimes(1);
      const [, input] = mocks.ingestRegistryCallback.mock.calls[0];
      expect(input.rawBody).toBe(FAILED_BODY);
    });

    it('replaces the token in the stored request path', async () => {
      await post(TOKEN, callback(TOKEN, FAILED_BODY));
      const [, input] = mocks.ingestRegistryCallback.mock.calls[0];
      expect(input.requestPath).toBe('/api/sms/registry-status/[redacted]');
      expect(JSON.stringify(input)).not.toContain(TOKEN);
    });

    it('reads the documented failure fields out of the payload', async () => {
      await post(TOKEN, callback(TOKEN, FAILED_BODY));
      const [, input] = mocks.ingestRegistryCallback.mock.calls[0];
      expect(input.parsed.orderId).toBe('5dd24379-9176-4984-902e-60afcf47aabf');
      expect(input.parsed.assignmentId).toBe('02b2c88d-67af-42fd-a56a-a68d4927f975');
      expect(input.parsed.phoneNumber).toBe('+19479412323');
      expect(input.parsed.normalizedState).toBe('failed');
    });

    it('captures a signature header without gating on it', async () => {
      // Nothing establishes that this surface is signed. Recording the value is
      // what lets the scheme be verified offline; requiring it would 403 every
      // delivery and lose the reason a second time.
      await post(TOKEN, callback(TOKEN, FAILED_BODY, 'application/json', {
        'x-signalwire-signature': 'deadbeef',
      }));
      const [, input] = mocks.ingestRegistryCallback.mock.calls[0];
      expect(input.signatureHeaderName).toBe('x-signalwire-signature');
      expect(input.signatureHeaderValue).toBe('deadbeef');
    });

    it('records an Authorization header as present without keeping its value', async () => {
      await post(TOKEN, callback(TOKEN, FAILED_BODY, 'application/json', {
        authorization: 'Basic c2VjcmV0OnZhbHVl',
      }));
      const [, input] = mocks.ingestRegistryCallback.mock.calls[0];
      expect(input.requestHeaders.authorization).toEqual({ present: true });
      expect(JSON.stringify(input.requestHeaders)).not.toContain('c2VjcmV0OnZhbHVl');
    });

    it('stores an unparseable body rather than rejecting it', async () => {
      // The wire shape has never been captured. A body we cannot read is still
      // evidence, and a 4xx would ask the provider to discard it.
      const response = await post(TOKEN, callback(TOKEN, 'not json at all', 'text/plain'));
      expect(response.status).toBe(204);
      const [, input] = mocks.ingestRegistryCallback.mock.calls[0];
      expect(input.rawBody).toBe('not json at all');
      expect(input.parsed.parsed).toBeNull();
      expect(input.parsed.receiptKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('answers 204 on success', async () => {
      const response = await post(TOKEN, callback(TOKEN, FAILED_BODY));
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
    });

    it('still answers 204 when the callback cannot be correlated', async () => {
      mocks.ingestRegistryCallback.mockResolvedValue({
        callbackId: CALLBACK_ID,
        inserted: true,
        applicationId: null,
        disposition: 'unmatched',
      });
      const response = await post(TOKEN, callback(TOKEN, FAILED_BODY));
      expect(response.status).toBe(204);
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'sms_registry' }),
      );
    });

    it('records a bad signature without rejecting it while measuring', async () => {
      // The scheme was derived from two captured payloads, not a contract. Until
      // real traffic proves it, a mismatch must be VISIBLE but never fatal --
      // rejecting on an unproven scheme would discard the reason all over again.
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.letsgetquoted.com';
      process.env.SIGNALWIRE_SIGNING_KEY = 'signing-key-for-test';
      const response = await post(TOKEN, callback(TOKEN, FAILED_BODY, 'application/json', {
        'x-signalwire-signature': 'ffffffffffffffffffffffffffffffffffffffff',
      }));
      expect(response.status).toBe(204);
      expect(mocks.ingestRegistryCallback).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(mocks.logWebhookFailure.mock.calls)).toContain('signature invalid');
    });

    it('rejects a bad signature ONLY once enforcement is switched on', async () => {
      // Proves the flag bites. A gate nobody has watched bite is not a gate.
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.letsgetquoted.com';
      process.env.SIGNALWIRE_SIGNING_KEY = 'signing-key-for-test';
      process.env.LGQ_SIGNALWIRE_REGISTRY_REQUIRE_SIGNATURE = '1';
      const response = await post(TOKEN, callback(TOKEN, FAILED_BODY, 'application/json', {
        'x-signalwire-signature': 'ffffffffffffffffffffffffffffffffffffffff',
      }));
      expect(response.status).toBe(403);
      expect(mocks.ingestRegistryCallback).not.toHaveBeenCalled();
    });

    it('still accepts a correctly signed delivery under enforcement', async () => {
      // The other half of the gate. Computing the HMAC here is not circular:
      // the scheme itself is pinned by independent fixtures in the
      // interpretation suite. This asserts the ROUTE wires it up correctly --
      // right URL, right key, right header.
      const { createHmac } = await import('node:crypto');
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.letsgetquoted.com';
      process.env.SIGNALWIRE_SIGNING_KEY = 'signing-key-for-test';
      process.env.LGQ_SIGNALWIRE_REGISTRY_REQUIRE_SIGNATURE = '1';
      const signed = createHmac('sha1', 'signing-key-for-test')
        .update(`https://app.letsgetquoted.com/api/sms/registry-status/${TOKEN}${FAILED_BODY}`, 'utf8')
        .digest('hex');
      const response = await post(TOKEN, callback(TOKEN, FAILED_BODY, 'application/json', {
        'x-signalwire-signature': signed,
      }));
      expect(response.status).toBe(204);
      expect(mocks.ingestRegistryCallback).toHaveBeenCalledTimes(1);
    });

    it('treats a missing signing key as our gap, not a failed check', async () => {
      // `unverifiable` must never reach the enforcement branch: a config gap
      // that 403s live provider traffic is worse than the gap itself.
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.letsgetquoted.com';
      delete process.env.SIGNALWIRE_SIGNING_KEY;
      process.env.LGQ_SIGNALWIRE_REGISTRY_REQUIRE_SIGNATURE = '1';
      const response = await post(TOKEN, callback(TOKEN, FAILED_BODY, 'application/json', {
        'x-signalwire-signature': 'ffffffffffffffffffffffffffffffffffffffff',
      }));
      expect(response.status).toBe(204);
      expect(JSON.stringify(mocks.logWebhookFailure.mock.calls)).toContain('signature unverifiable');
    });

    it('asks for a redelivery only when nothing was stored', async () => {
      mocks.ingestRegistryCallback.mockRejectedValue(new Error('database is unreachable'));
      const response = await post(TOKEN, callback(TOKEN, FAILED_BODY));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: 'Receipt unavailable.' });
    });
  });
});

describe('registry callback interpretation', () => {
  it('maps an unrecognized terminal state to unknown, never to pending', async () => {
    // The rest of the rail collapses anything outside complete/failed/rejected
    // to `pending`. If the registry spells a dead assignment 'declined', that
    // convention would read it as in-progress forever.
    const { normalizeRegistryState } = await import('@/lib/messaging-registry-callback-ingress');
    expect(normalizeRegistryState('declined', null)).toBe('failed');
    expect(normalizeRegistryState('quarantined', null)).toBe('unknown');
    expect(normalizeRegistryState('failed', null)).toBe('failed');
    expect(normalizeRegistryState(null, 'number_assignment_failed')).toBe('failed');
    expect(normalizeRegistryState(null, null)).toBeNull();
  });

  it('finds fields nested inside a provider envelope', async () => {
    const { parseRegistryCallback } = await import('@/lib/messaging-registry-callback-ingress');
    const body = JSON.stringify({
      event: 'registry.status',
      params: { number_assignment_order_id: 'order-9', state: 'failed' },
    });
    const parsed = parseRegistryCallback(body, 'application/json');
    expect(parsed.orderId).toBe('order-9');
    expect(parsed.normalizedState).toBe('failed');
  });

  it('reads a form-encoded body as readily as JSON', async () => {
    const { parseRegistryCallback } = await import('@/lib/messaging-registry-callback-ingress');
    const parsed = parseRegistryCallback(
      'number_assignment_order_id=order-9&state=failed',
      'application/x-www-form-urlencoded',
    );
    expect(parsed.orderId).toBe('order-9');
    expect(parsed.normalizedState).toBe('failed');
  });

  it('gives a byte-identical redelivery the same receipt key', async () => {
    const { parseRegistryCallback } = await import('@/lib/messaging-registry-callback-ingress');
    const first = parseRegistryCallback(FAILED_BODY, 'application/json');
    const second = parseRegistryCallback(FAILED_BODY, 'application/json');
    expect(first.receiptKey).toBe(second.receiptKey);
  });

  it('verifies the signature scheme observed on real SignalWire traffic', async () => {
    // FIXTURES COMPUTED INDEPENDENTLY of the implementation, so this asserts the
    // scheme rather than asserting the code agrees with itself.
    //   HMAC-SHA1(key, url + body) -> hex
    const { verifyRegistryCallbackSignature } = await import('@/lib/messaging-registry-callback-ingress');
    const signingKey = 'test-signing-key-not-a-real-one';
    const callbackUrl = 'https://app.example.com/api/sms/registry-status/aaaaaaaabbbbbbbbccccccccdddddddd';
    const rawBody = '{"project_id":"p","event_type":"number_assignment_activated","state":"completed"}';
    const VALID_HEX = '61503da7aaaf1393cc1c5898cf16a76d475a4307';

    expect(verifyRegistryCallbackSignature({
      rawBody, signature: VALID_HEX, callbackUrl, signingKey,
    })).toBe('valid');

    // Hex is case-insensitive on the wire.
    expect(verifyRegistryCallbackSignature({
      rawBody, signature: VALID_HEX.toUpperCase(), callbackUrl, signingKey,
    })).toBe('valid');
  });

  it('rejects the base64 encoding the rest of the rail uses', async () => {
    // THE TRAP: validateWebhookSignature in sms-provider.ts emits base64 via
    // signBase64. This surface is HEX. Reusing that verifier would 403 every
    // real delivery, so this pins the difference rather than leaving it to a
    // comment somebody edits away.
    const { verifyRegistryCallbackSignature } = await import('@/lib/messaging-registry-callback-ingress');
    expect(verifyRegistryCallbackSignature({
      rawBody: '{"project_id":"p","event_type":"number_assignment_activated","state":"completed"}',
      signature: 'YVA9p6qvE5PMHFiYzxanbUdaQwc=',
      callbackUrl: 'https://app.example.com/api/sms/registry-status/aaaaaaaabbbbbbbbccccccccdddddddd',
      signingKey: 'test-signing-key-not-a-real-one',
    })).toBe('invalid');
  });

  it('signs the URL as well as the body, not the body alone', async () => {
    // Pins the construction. A refactor that signed only the body would let an
    // attacker replay one campaign's payload against another endpoint.
    const { verifyRegistryCallbackSignature } = await import('@/lib/messaging-registry-callback-ingress');
    const rawBody = '{"project_id":"p","event_type":"number_assignment_activated","state":"completed"}';
    expect(verifyRegistryCallbackSignature({
      rawBody,
      signature: 'c914aecf5df1f64aa0892a6f6fbebe32ebd2b955', // HMAC over body only
      callbackUrl: 'https://app.example.com/api/sms/registry-status/aaaaaaaabbbbbbbbccccccccdddddddd',
      signingKey: 'test-signing-key-not-a-real-one',
    })).toBe('invalid');
  });

  it('separates "no signature" from "cannot check it"', async () => {
    // These must not collapse: absent means the provider sent nothing, while
    // unverifiable means WE are misconfigured. Enforcement may only ever act on
    // `invalid`, so conflating them would either 403 valid traffic or hide a
    // missing signing key.
    const { verifyRegistryCallbackSignature } = await import('@/lib/messaging-registry-callback-ingress');
    const rawBody = '{"a":1}';
    const callbackUrl = 'https://app.example.com/api/sms/registry-status/tok';
    expect(verifyRegistryCallbackSignature({
      rawBody, signature: null, callbackUrl, signingKey: 'k',
    })).toBe('absent');
    expect(verifyRegistryCallbackSignature({
      rawBody, signature: '   ', callbackUrl, signingKey: 'k',
    })).toBe('absent');
    expect(verifyRegistryCallbackSignature({
      rawBody, signature: 'deadbeef', callbackUrl, signingKey: '',
    })).toBe('unverifiable');
  });

  it('detects a tampered body under a good signature', async () => {
    const { verifyRegistryCallbackSignature } = await import('@/lib/messaging-registry-callback-ingress');
    expect(verifyRegistryCallbackSignature({
      rawBody: '{"project_id":"p","event_type":"number_assignment_activated","state":"failed"}',
      signature: '61503da7aaaf1393cc1c5898cf16a76d475a4307',
      callbackUrl: 'https://app.example.com/api/sms/registry-status/aaaaaaaabbbbbbbbccccccccdddddddd',
      signingKey: 'test-signing-key-not-a-real-one',
    })).toBe('invalid');
  });

  it('gives a genuinely later transition a different receipt key', async () => {
    const { parseRegistryCallback } = await import('@/lib/messaging-registry-callback-ingress');
    const failed = parseRegistryCallback(FAILED_BODY, 'application/json');
    const activated = parseRegistryCallback(
      FAILED_BODY.replace('"state":"failed"', '"state":"active"'),
      'application/json',
    );
    expect(activated.receiptKey).not.toBe(failed.receiptKey);
  });
});
