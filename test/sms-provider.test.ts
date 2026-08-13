import { describe, expect, it, afterEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  buildSendRequest,
  configuredSmsProviders,
  hasSignatureHeader,
  isSmsProviderConfigured,
  parseSendResponse,
  smsProviderConfig,
  smsProviderSummary,
  validateWebhookSignature,
  type SmsProviderConfig,
} from '@/lib/sms-provider';
import { isSmsConfigured } from '@/lib/sms';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Every stub sets a sender, because the suite's own environment deliberately
 * has none. Empty string rather than undefined for the "absent" case: every
 * check in the module is a truthiness test, and '' is how you unset a variable
 * that vitest has already injected.
 */
function useTwilio(overrides: Record<string, string> = {}) {
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC11111111111111111111111111111111');
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'twilio-secret');
  vi.stubEnv('TWILIO_FROM_NUMBER', '+15550001111');
  vi.stubEnv('TWILIO_MESSAGING_SERVICE_SID', '');
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

function useSignalWire(overrides: Record<string, string> = {}) {
  vi.stubEnv('SIGNALWIRE_SPACE_URL', 'example.signalwire.com');
  vi.stubEnv('SIGNALWIRE_PROJECT_ID', 'ea108133-d6b3-407c-9536-9fad8a929a6a');
  vi.stubEnv('SIGNALWIRE_API_TOKEN', 'signalwire-token');
  vi.stubEnv('SIGNALWIRE_FROM_NUMBER', '+15550002222');
  vi.stubEnv('SIGNALWIRE_NUMBER_GROUP_ID', '');
  vi.stubEnv('SIGNALWIRE_SIGNING_KEY', '');
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

function noProviders() {
  vi.stubEnv('TWILIO_ACCOUNT_SID', '');
  vi.stubEnv('TWILIO_AUTH_TOKEN', '');
  vi.stubEnv('TWILIO_FROM_NUMBER', '');
  vi.stubEnv('TWILIO_MESSAGING_SERVICE_SID', '');
  vi.stubEnv('SIGNALWIRE_SPACE_URL', '');
  vi.stubEnv('SIGNALWIRE_PROJECT_ID', '');
  vi.stubEnv('SIGNALWIRE_API_TOKEN', '');
}

describe('the suite cannot text anybody', () => {
  /**
   * The single most important assertion in this file.
   *
   * ~30 send functions check nothing but whether a provider is configured, so
   * this predicate — not the isLiveMessagingEnvironment ladder, which guards
   * one sender — is what stands between a test run and a real phone. It is
   * currently false only because vitest.config.ts omits a sender, which is a
   * one-line edit away from being untrue.
   */
  it('has no sender configured, so isSmsConfigured() is false', () => {
    expect(isSmsConfigured()).toBe(false);
    expect(isSmsProviderConfigured()).toBe(false);
  });

  it('blocks a fetch to a provider host at the socket', async () => {
    await expect(fetch('https://api.twilio.com/2010-04-01/Accounts/AC/Messages.json')).rejects.toThrow(/Blocked/);
    await expect(fetch('https://example.signalwire.com/api/laml/2010-04-01/x')).rejects.toThrow(/Blocked/);
  });

  it('lets everything else through, so nobody has a reason to delete it', async () => {
    // A data: URL exercises the passthrough without opening a socket.
    const response = await fetch('data:text/plain,not-a-provider');
    expect(await response.text()).toBe('not-a-provider');
  });
});

describe('which provider is selected', () => {
  it('is null when nothing is configured', () => {
    noProviders();
    expect(smsProviderConfig()).toBeNull();
  });

  it('needs a sender, not just credentials', () => {
    noProviders();
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC1');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok');
    expect(smsProviderConfig()).toBeNull();
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15550001111');
    expect(smsProviderConfig()?.id).toBe('twilio');
  });

  it('infers SignalWire from the Space URL alone — Twilio has no such thing', () => {
    noProviders();
    useSignalWire();
    expect(smsProviderConfig()?.id).toBe('signalwire');
  });

  /**
   * The incumbent wins by default. Both credential sets present is the normal
   * state of a migration window, and drifting to the new provider because its
   * variables appeared would move live customer texts onto a different number
   * and a different A2P registration without anybody deciding to.
   */
  it('prefers the incumbent when both are configured and no tiebreaker is set', () => {
    noProviders();
    useTwilio();
    useSignalWire();
    vi.stubEnv('LGQ_SMS_PROVIDER', '');
    expect(smsProviderConfig()?.id).toBe('twilio');
    expect(configuredSmsProviders().map((c) => c.id)).toEqual(['twilio', 'signalwire']);
  });

  it('honors LGQ_SMS_PROVIDER as the tiebreaker', () => {
    noProviders();
    useTwilio();
    useSignalWire();
    vi.stubEnv('LGQ_SMS_PROVIDER', 'signalwire');
    expect(smsProviderConfig()?.id).toBe('signalwire');
    vi.stubEnv('LGQ_SMS_PROVIDER', 'TWILIO');
    expect(smsProviderConfig()?.id).toBe('twilio');
  });

  /**
   * Asking for a provider that cannot send must stop sending, not silently
   * send through the other one. An operator who set the flag believes they
   * have cut over; texts continuing to leave on the old number, under the old
   * registration, is the failure they would find out about last.
   */
  it('returns null — never the other provider — when the requested one is unconfigured', () => {
    noProviders();
    useTwilio();
    vi.stubEnv('LGQ_SMS_PROVIDER', 'signalwire');
    expect(smsProviderConfig()).toBeNull();
  });

  it('ignores an unrecognized tiebreaker and falls back to inference', () => {
    noProviders();
    useTwilio();
    vi.stubEnv('LGQ_SMS_PROVIDER', 'plivo');
    expect(smsProviderConfig()?.id).toBe('twilio');
  });
});

describe('the REST endpoint', () => {
  it('is Twilio\'s account-scoped Messages resource with the .json suffix', () => {
    noProviders();
    useTwilio();
    expect(smsProviderConfig()?.messagesUrl).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC11111111111111111111111111111111/Messages.json',
    );
  });

  /**
   * The one URL nobody can guess from Twilio's. SignalWire keeps the
   * 2010-04-01 version segment but puts the whole compatibility surface under
   * /api/laml on a per-Space host.
   */
  it('is the Space host plus /api/laml for SignalWire', () => {
    noProviders();
    useSignalWire();
    expect(smsProviderConfig()?.messagesUrl).toBe(
      'https://example.signalwire.com/api/laml/2010-04-01/Accounts/ea108133-d6b3-407c-9536-9fad8a929a6a/Messages.json',
    );
  });

  it('normalizes a Space URL pasted with a scheme or a trailing slash', () => {
    noProviders();
    useSignalWire({ SIGNALWIRE_SPACE_URL: 'https://example.signalwire.com/' });
    expect(smsProviderConfig()?.messagesUrl).toContain('https://example.signalwire.com/api/laml/');
    expect(smsProviderConfig()?.messagesUrl).not.toContain('//api/laml');
  });
});

describe('buildSendRequest', () => {
  const twilio = (): SmsProviderConfig => {
    noProviders();
    useTwilio();
    return smsProviderConfig()!;
  };

  it('sends To and Body', () => {
    const request = buildSendRequest(twilio(), '+15551234567', 'Hello there');
    expect(request.body.get('To')).toBe('+15551234567');
    expect(request.body.get('Body')).toBe('Hello there');
  });

  it('authenticates with Basic user:password', () => {
    const request = buildSendRequest(twilio(), '+15551234567', 'x');
    const decoded = Buffer.from(request.headers.Authorization.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('AC11111111111111111111111111111111:twilio-secret');
    expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('uses the project id for both halves on SignalWire', () => {
    noProviders();
    useSignalWire();
    const config = smsProviderConfig()!;
    const request = buildSendRequest(config, '+15551234567', 'x');
    const decoded = Buffer.from(request.headers.Authorization.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('ea108133-d6b3-407c-9536-9fad8a929a6a:signalwire-token');
    expect(request.url).toContain('/Accounts/ea108133-d6b3-407c-9536-9fad8a929a6a/');
  });

  it('sends From when there is no pool', () => {
    const request = buildSendRequest(twilio(), '+15551234567', 'x');
    expect(request.body.get('From')).toBe('+15550001111');
    expect(request.body.get('MessagingServiceSid')).toBeNull();
  });

  /**
   * The pool wins. Both providers accept the same parameter NAME and reject
   * the two together, and the values are not interchangeable — Twilio wants
   * MG + 32 hex, SignalWire a Number Group UUID — so nothing here inspects the
   * shape of the string.
   */
  it('sends MessagingServiceSid instead of From when a pool is set', () => {
    noProviders();
    useTwilio({ TWILIO_MESSAGING_SERVICE_SID: 'MG22222222222222222222222222222222' });
    const request = buildSendRequest(smsProviderConfig()!, '+15551234567', 'x');
    expect(request.body.get('MessagingServiceSid')).toBe('MG22222222222222222222222222222222');
    expect(request.body.get('From')).toBeNull();
  });

  it('accepts a SignalWire number group in the same parameter', () => {
    noProviders();
    useSignalWire({ SIGNALWIRE_NUMBER_GROUP_ID: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });
    const request = buildSendRequest(smsProviderConfig()!, '+15551234567', 'x');
    expect(request.body.get('MessagingServiceSid')).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
  });

  it('points the delivery callback at the provider-neutral route', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://letsgetquoted.com');
    const request = buildSendRequest(twilio(), '+15551234567', 'x');
    expect(request.body.get('StatusCallback')).toBe('https://letsgetquoted.com/api/sms/status');
  });

  /**
   * No https origin, no callback — which means "Failed texts" on the health
   * page can only ever read zero. That was silent; the admin card now says it.
   */
  it('omits the delivery callback when the origin is not https', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3010');
    expect(buildSendRequest(twilio(), '+15551234567', 'x').body.get('StatusCallback')).toBeNull();
  });
});

describe('parseSendResponse', () => {
  it('reads a Twilio SID', () => {
    const body = JSON.stringify({ sid: 'SM33333333333333333333333333333333', num_segments: '1' });
    expect(parseSendResponse(true, 201, body)).toEqual({ providerId: 'SM33333333333333333333333333333333' });
  });

  it('reads a SignalWire UUID from the same field', () => {
    const body = JSON.stringify({ sid: 'b3d4c9e8-1111-2222-3333-444455556666', num_segments: 1 });
    expect(parseSendResponse(true, 201, body)).toEqual({ providerId: 'b3d4c9e8-1111-2222-3333-444455556666' });
  });

  /**
   * The expensive mistake, in one test.
   *
   * If the .json suffix is not honored the provider answers 200 with XML about
   * a message it really did send. Treating that as a failure makes the caller
   * record a failure and a retry send the customer a SECOND copy.
   */
  it('recovers the id from an XML body, so a sent message is never recorded as failed', () => {
    const xml = '<?xml version="1.0"?><TwilioResponse><Message><Sid>SM44444444444444444444444444444444</Sid></Message></TwilioResponse>';
    expect(parseSendResponse(true, 201, xml)).toEqual({ providerId: 'SM44444444444444444444444444444444' });
  });

  /**
   * This used to throw out of `await response.json()`, and the SyntaxError
   * message — "Unexpected token < in JSON" — was what landed in
   * sms_events.error_reason, telling whoever read it nothing at all.
   */
  it('does not throw on an HTML error page, and says what actually happened', () => {
    const html = '<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>';
    const result = parseSendResponse(false, 502, html);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('502');
    expect((result as { error: string }).error).toContain('502 Bad Gateway');
  });

  it('prefers the provider\'s own explanation when there is one', () => {
    const body = JSON.stringify({ code: 21610, message: 'The message From/To pair violates a blacklist rule.' });
    expect(parseSendResponse(false, 400, body)).toEqual({
      error: 'The message From/To pair violates a blacklist rule.',
    });
  });

  it('falls back to status plus excerpt when the envelope has no message field', () => {
    const body = JSON.stringify({ errors: [{ detail: 'nope' }] });
    const result = parseSendResponse(false, 422, body) as { error: string };
    expect(result.error).toContain('422');
  });

  it('treats a 200 with no id as a failure, not a success with an empty id', () => {
    const result = parseSendResponse(true, 200, '') as { error: string };
    expect(result.error).toContain('no message id');
  });
});

describe('inbound signature validation', () => {
  const URL_UNDER_TEST = 'https://letsgetquoted.com/api/sms/inbound';

  function signedWith(secret: string, fields: Record<string, string>, url = URL_UNDER_TEST): string {
    const payload = Object.entries(fields)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .reduce((acc, [key, value]) => `${acc}${key}${value}`, url);
    return createHmac('sha1', secret).update(payload).digest('base64');
  }

  function formOf(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    return data;
  }

  const FIELDS = { Body: 'STOP', From: '+15551234567', MessageSid: 'SM99', To: '+15550001111' };

  it('accepts a correctly signed Twilio webhook', () => {
    noProviders();
    useTwilio();
    const request = new Request(URL_UNDER_TEST, {
      headers: { 'x-twilio-signature': signedWith('twilio-secret', FIELDS) },
    });
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: true, provider: 'twilio' });
  });

  it('accepts a correctly signed SignalWire webhook', () => {
    noProviders();
    useSignalWire();
    const request = new Request(URL_UNDER_TEST, {
      headers: { 'x-signalwire-signature': signedWith('signalwire-token', FIELDS) },
    });
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: true, provider: 'signalwire' });
  });

  it('uses an explicit signing key over the API token when one is set', () => {
    noProviders();
    useSignalWire({ SIGNALWIRE_SIGNING_KEY: 'separate-signing-key' });
    const request = new Request(URL_UNDER_TEST, {
      headers: { 'x-signalwire-signature': signedWith('separate-signing-key', FIELDS) },
    });
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: true, provider: 'signalwire' });
  });

  it('rejects a request with no signature header at all', () => {
    noProviders();
    useTwilio();
    const request = new Request(URL_UNDER_TEST);
    expect(hasSignatureHeader(request)).toBe(false);
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: false, reason: 'missing-header' });
  });

  /**
   * THE TEST THAT PINS "not try-everything".
   *
   * A request claiming to be SignalWire while only Twilio is configured must be
   * refused for a NAMED reason, never quietly re-checked against the Twilio
   * token. The header chooses which key must verify; it never chooses whether
   * one must.
   */
  it('refuses a SignalWire-headed request when no SignalWire secret exists, without trying the Twilio one', () => {
    noProviders();
    useTwilio();
    const request = new Request(URL_UNDER_TEST, {
      // Signed with the Twilio secret on purpose: if anything fell back, this
      // would pass.
      headers: { 'x-signalwire-signature': signedWith('twilio-secret', FIELDS) },
    });
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: false, reason: 'secret-not-configured' });
  });

  it('rejects a signature that is valid under the other provider\'s key', () => {
    noProviders();
    useTwilio();
    useSignalWire();
    const request = new Request(URL_UNDER_TEST, {
      headers: { 'x-signalwire-signature': signedWith('twilio-secret', FIELDS) },
    });
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('prefers the SignalWire header when a request carries both', () => {
    noProviders();
    useTwilio();
    useSignalWire();
    const request = new Request(URL_UNDER_TEST, {
      headers: {
        'x-signalwire-signature': signedWith('signalwire-token', FIELDS),
        'x-twilio-signature': 'nonsense',
      },
    });
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: true, provider: 'signalwire' });
  });

  it('rejects a tampered body', () => {
    noProviders();
    useTwilio();
    const request = new Request(URL_UNDER_TEST, {
      headers: { 'x-twilio-signature': signedWith('twilio-secret', FIELDS) },
    });
    expect(validateWebhookSignature(request, formOf({ ...FIELDS, Body: 'START' }))).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  /**
   * The provider signs the URL it was configured with — the public one. Behind
   * a proxy, request.url is the internal address, so the forwarded headers are
   * the only way back to the string that was actually signed.
   */
  it('reconstructs the public URL from forwarded headers', () => {
    noProviders();
    useTwilio();
    const request = new Request('http://10.0.0.7:3000/api/sms/inbound', {
      headers: {
        'x-twilio-signature': signedWith('twilio-secret', FIELDS),
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'letsgetquoted.com',
      },
    });
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: true, provider: 'twilio' });
  });

  it('accepts the port-bearing spelling of the same URL', () => {
    noProviders();
    useTwilio();
    const signature = signedWith('twilio-secret', FIELDS, 'https://letsgetquoted.com:443/api/sms/inbound');
    const request = new Request(URL_UNDER_TEST, { headers: { 'x-twilio-signature': signature } });
    expect(validateWebhookSignature(request, formOf(FIELDS))).toEqual({ ok: true, provider: 'twilio' });
  });
});

describe('what the operator is shown', () => {
  it('names both accepted headers during a migration window', () => {
    noProviders();
    useTwilio();
    useSignalWire();
    const summary = smsProviderSummary();
    expect(summary.acceptedSignatureHeaders).toEqual(['x-twilio-signature', 'x-signalwire-signature']);
    expect(summary.active).toBe('twilio');
  });

  it('reports a requested-but-unconfigured provider rather than hiding it', () => {
    noProviders();
    useTwilio();
    vi.stubEnv('LGQ_SMS_PROVIDER', 'signalwire');
    const summary = smsProviderSummary();
    expect(summary.active).toBeNull();
    expect(summary.requestedButUnconfigured).toBe('signalwire');
  });

  it('distinguishes a pool from a single number', () => {
    noProviders();
    useTwilio();
    expect(smsProviderSummary().senderMode).toBe('single-number');
    useTwilio({ TWILIO_MESSAGING_SERVICE_SID: 'MG5' });
    expect(smsProviderSummary().senderMode).toBe('pool');
  });
});

// -- the couplings stay where they were put -----------------------------------

const SMS = stripJs(read('src', 'lib', 'sms.ts'));

describe('the provider surface stays in one file', () => {
  it('leaves no provider endpoint or signature header in lib/sms.ts', () => {
    expect(SMS).not.toContain('api.twilio.com');
    expect(SMS).not.toContain('signalwire.com');
    expect(SMS).not.toContain('x-twilio-signature');
    expect(SMS).not.toContain('MessagingServiceSid');
  });

  it('routes every send through the one egress function', () => {
    expect(SMS).not.toContain('sendTwilioMessage');
    expect(SMS).toContain('sendProviderMessage');
  });

  it('names a provider host in exactly one file under src/', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry)) {
          const source = stripJs(readFileSync(full, 'utf8'));
          if (/api\.twilio\.com|\$\{space\}|\.signalwire\.com/.test(source)) offenders.push(full);
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(offenders.map((f) => f.replace(process.cwd(), '').replace(/\\/g, '/'))).toEqual([
      '/src/lib/sms-provider.ts',
    ]);
  });
});

describe('the /api/twilio aliases', () => {
  const SMS_ROUTES = ['inbound', 'status', 'voice', 'voice/status'];

  /**
   * The alias is permanent, not a transition step: the path only becomes real
   * when a human pastes it into a provider console, and nothing in the code can
   * see whether that happened. A missing twin means inbound customer texts
   * arriving at a 404 while the inbox simply looks quiet.
   */
  it.each(SMS_ROUTES)('has a twin at /api/twilio/%s re-exporting the real handler', (route) => {
    const alias = read('src', 'app', 'api', 'twilio', ...route.split('/'), 'route.ts');
    expect(alias).toContain(`@/app/api/sms/${route}/route`);
    expect(alias).toContain('export { POST }');
    // The runtime has to be declared here too — Next reads it statically per
    // route file, so a re-export alone would silently drop it to the edge.
    expect(alias).toContain(`export const runtime = 'nodejs'`);
  });

  it('keeps the alias files free of logic', () => {
    for (const route of SMS_ROUTES) {
      const alias = stripJs(read('src', 'app', 'api', 'twilio', ...route.split('/'), 'route.ts'));
      expect(alias.split('\n').filter((line) => line.trim()).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('webhook_failures.source', () => {
  /**
   * The one coupling that fails at the DATABASE rather than at a comment — and
   * fails invisibly, because logWebhookFailure catches its own insert error. A
   * value in the TypeScript union that the CHECK constraint does not allow
   * means the failure log stops recording failures and tells nobody.
   */
  it('allows every value the WebhookSource union can produce', () => {
    const schema = read('schema.sql');
    const match = /create table if not exists webhook_failures[\s\S]*?source\s+text not null check \(source in \(([^)]*)\)\)/.exec(schema);
    expect(match, 'could not find the webhook_failures source CHECK in schema.sql').not.toBeNull();
    const allowed = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

    const union = read('src', 'lib', 'webhook-failures.ts');
    const declared = [...union.matchAll(/^\s*\|?\s*'([a-z_]+)'$/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const value of declared) expect(allowed, `${value} is not in the CHECK constraint`).toContain(value);
  });

  it('writes the provider-neutral names from the routes', () => {
    for (const [route, source] of [
      [['inbound'], 'sms_inbound'],
      [['status'], 'sms_status'],
      [['voice'], 'sms_voice'],
      [['voice', 'status'], 'sms_voice'],
    ] as const) {
      const file = stripJs(read('src', 'app', 'api', 'sms', ...route, 'route.ts'));
      expect(file).toContain(`source: '${source}'`);
      expect(file).not.toContain("source: 'twilio_");
    }
  });
});
