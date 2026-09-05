import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Recovery must work while the app's database or session service is unavailable.
const { unavailableDependency } = vi.hoisted(() => ({
  unavailableDependency: vi.fn(() => { throw new Error('database/session unavailable'); }),
}));
vi.mock('@/lib/auth', () => ({
  createAdminClient: unavailableDependency,
  requireOfficeContext: unavailableDependency,
}));

const ORIGIN = 'https://app.letsgetquoted.com';
const KEY = 'voice-fallback-signing-key';
const FORM_BODY = new URLSearchParams({
  CallSid: 'fallback-call-123', To: '+18105550101', From: '+18105550102',
  ErrorCode: '11200',
}).toString();
const JSON_BODY = JSON.stringify({ call: {
  call_id: 'fallback-call-123', to: '+18105550101', from: '+18105550102',
} });

function request(path: string, format: 'laml' | 'swml', options: {
  signedPath?: string; key?: string; signatureHeader?: string; tamper?: boolean;
} = {}) {
  const body = format === 'laml' ? FORM_BODY : JSON_BODY;
  const signedBody = format === 'laml'
    ? [...new URLSearchParams(body)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, value]) => key + value).join('')
    : body;
  const signature = createHmac('sha1', options.key ?? KEY)
    .update(ORIGIN + (options.signedPath ?? path) + signedBody)
    .digest(format === 'laml' ? 'base64' : 'hex');
  return new Request(ORIGIN + path, {
    method: 'POST',
    headers: {
      'content-type': format === 'laml' ? 'application/x-www-form-urlencoded' : 'application/json',
      [options.signatureHeader ?? 'x-signalwire-signature']: signature,
    },
    body: options.tamper ? body.replace('fallback-call-123', 'different-call') : body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', ORIGIN);
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'letsgetquoted.com');
  vi.stubEnv('SIGNALWIRE_SIGNING_KEY', KEY);
});
afterEach(() => vi.unstubAllEnvs());

describe.each([
  ['/api/voice/fallback', () => import('@/app/api/voice/fallback/route')],
  ['/api/voice/health', () => import('@/app/api/voice/health/route')],
] as const)('provider recovery at %s', (path, loadRoute) => {
  it.each(['laml', 'swml'] as const)('returns bounded voicemail for a real %s signature during a database outage', async (format) => {
    const { POST } = await loadRoute();
    const response = await POST(request(path, format));
    expect(response.status).toBe(200);
    expect(unavailableDependency).not.toHaveBeenCalled();
    if (format === 'laml') {
      expect(response.headers.get('content-type')).toContain('text/xml');
      expect(await response.text()).toContain('<Record maxLength="120" playBeep="true" />');
    } else {
      expect(response.headers.get('content-type')).toContain('application/json');
      const { sections: { main } } = await response.json();
      expect(main[0]).toEqual({ answer: {} });
      expect(main[1].play.url).toContain('after the beep');
      expect(main[2]).toEqual({ record: expect.objectContaining({ beep: true, max_length: 120 }) });
      expect(main[3]).toEqual({ hangup: {} });
      expect(main.some((step: object) => 'ai' in step || 'record_call' in step)).toBe(false);
    }
  });

  it.each(['laml', 'swml'] as const)('rejects a tampered %s body and a signature captured for a different path', async (format) => {
    const { POST } = await loadRoute();
    for (const options of [{ tamper: true }, { signedPath: '/api/voice/ai' }]) {
      const response = await POST(request(path, format, options));
      expect(response.status).toBe(403);
      expect(await response.text()).not.toMatch(/record/i);
    }
    expect(unavailableDependency).not.toHaveBeenCalled();
  });

  it('rejects unsigned requests and valid Twilio signatures without opening a recording', async () => {
    const { POST } = await loadRoute();
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'separate-twilio-token');
    for (const req of [
      new Request(ORIGIN + path, { method: 'POST', body: FORM_BODY }),
      request(path, 'laml', { key: 'separate-twilio-token', signatureHeader: 'x-twilio-signature' }),
    ]) {
      const response = await POST(req);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toMatch(/record/i);
    }
    expect(unavailableDependency).not.toHaveBeenCalled();
  });

  it('fails closed when the signing key is missing', async () => {
    const { POST } = await loadRoute();
    vi.stubEnv('SIGNALWIRE_SIGNING_KEY', '');
    expect((await POST(request(path, 'swml'))).status).toBe(403);
    expect(unavailableDependency).not.toHaveBeenCalled();
  });
});
