import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  verifyVoiceReceiptAuthorization,
  verifySignedVoiceWebhook,
  signalWireVoiceScope,
  voiceReceiptAuthorization,
  voiceWebhookSecuritySummary,
} from '@/lib/voice/auth';

const ENV = { LGQ_VOICE_RECEIPT_BASIC: 'voice-receipt:test:password' };

afterEach(() => vi.unstubAllEnvs());

function useTrustedCallbackOrigin() {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://lgq.test');
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'lgq.test');
}

function request(authorization?: string) {
  return new Request('https://lgq.test/api/voice/receipt', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

describe('voice receipt Basic authentication', () => {
  it('splits on the first colon and keeps credentials out of the URL contract', () => {
    expect(voiceReceiptAuthorization(ENV)).toEqual({
      scheme: 'basic', username: 'voice-receipt', password: 'test:password',
    });
    expect(voiceReceiptAuthorization({ LGQ_VOICE_RECEIPT_BASIC: ':password' })).toBeNull();
    expect(voiceReceiptAuthorization({ LGQ_VOICE_RECEIPT_BASIC: 'user:' })).toBeNull();
  });

  it('distinguishes missing configuration, missing auth and a mismatch without revealing either side', () => {
    expect(verifyVoiceReceiptAuthorization(request(), {}))
      .toEqual({ ok: false, reason: 'not_configured' });
    expect(verifyVoiceReceiptAuthorization(request(), ENV))
      .toEqual({ ok: false, reason: 'missing' });
    expect(verifyVoiceReceiptAuthorization(
      request(`Basic ${Buffer.from('voice-receipt:wrong').toString('base64')}`), ENV,
    )).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('accepts the exact dedicated credential', () => {
    const header = `Basic ${Buffer.from('voice-receipt:test:password').toString('base64')}`;
    expect(verifyVoiceReceiptAuthorization(request(header), ENV)).toEqual({ ok: true });
  });

  it('reports presence only for health diagnostics', () => {
    expect(voiceWebhookSecuritySummary({
      ...ENV,
      SIGNALWIRE_SIGNING_KEY: 'signing-secret',
      SIGNALWIRE_PROJECT_ID: '2687f308-939e-4e73-97bd-4edfc0d7fd5a',
      SIGNALWIRE_SPACE_ID: '7e9a4752-2bfc-4cd1-a66f-fb3bd902a4ac',
    })).toEqual({
      inboundSigningConfigured: true,
      receiptBasicConfigured: true,
      projectScopeConfigured: true,
      spaceScopeConfigured: true,
    });
  });

  it('requires an exact valid project and space pair before admission', () => {
    const good = {
      SIGNALWIRE_PROJECT_ID: '2687f308-939e-4e73-97bd-4edfc0d7fd5a',
      SIGNALWIRE_SPACE_ID: '7e9a4752-2bfc-4cd1-a66f-fb3bd902a4ac',
    };
    expect(signalWireVoiceScope(good)).toEqual({
      projectId: good.SIGNALWIRE_PROJECT_ID,
      spaceId: good.SIGNALWIRE_SPACE_ID,
    });
    expect(signalWireVoiceScope({ ...good, SIGNALWIRE_PROJECT_ID: '' })).toBeNull();
    expect(signalWireVoiceScope({ ...good, SIGNALWIRE_SPACE_ID: '' })).toBeNull();
    expect(signalWireVoiceScope({ ...good, SIGNALWIRE_SPACE_ID: 'space-url-is-not-an-id' })).toBeNull();
  });
});

describe('voice webhook route boundaries', () => {
  const source = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

  it('has the Dial completion route emitted by admission', () => {
    const status = source('src', 'app', 'api', 'voice', 'ai', 'status', 'route.ts');
    expect(status).toContain('export async function POST');
    expect(status).toContain('verifySignedVoiceWebhook');
  });

  it('accepts a valid SignalWire signature on the SignalWire AI boundary', () => {
    const url = 'https://lgq.test/api/voice/ai';
    const body = 'CallSid=call-1&To=%2B19479412323';
    useTrustedCallbackOrigin();
    vi.stubEnv('SIGNALWIRE_SIGNING_KEY', 'signalwire-signing-key');
    const signature = createHmac('sha1', 'signalwire-signing-key')
      .update(url + body, 'utf8')
      .digest('hex');
    const signed = new Request(url, {
      method: 'POST',
      headers: { 'x-signalwire-signature': signature },
      body,
    });
    expect(verifySignedVoiceWebhook(signed, body)).toEqual({
      ok: true,
      provider: 'signalwire',
    });
  });

  it('rejects even a valid Twilio signature on the SignalWire AI boundary', () => {
    const url = 'https://lgq.test/api/voice/ai';
    useTrustedCallbackOrigin();
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'twilio-auth-token');
    const signature = createHmac('sha1', 'twilio-auth-token').update(url).digest('base64');
    const signed = new Request(url, {
      method: 'POST',
      headers: { 'x-twilio-signature': signature },
    });
    expect(verifySignedVoiceWebhook(signed, '')).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('keeps voice routes behind the voice auth boundary', () => {
    for (const route of [
      source('src', 'app', 'api', 'voice', 'ai', 'route.ts'),
      source('src', 'app', 'api', 'voice', 'ai', 'status', 'route.ts'),
      source('src', 'app', 'api', 'voice', 'receipt', 'route.ts'),
    ]) {
      expect(route).not.toContain("from '@/lib/sms-provider'");
    }
  });

  it('persists the signed test call used by activation readiness', () => {
    const admission = source('src', 'app', 'api', 'voice', 'ai', 'route.ts');
    expect(admission).toContain('recordVoiceRouteVerification(admin');
    expect(admission).toContain('number: call.toNumber');
    expect(admission.indexOf('verifySignedVoiceWebhook')).toBeLessThan(
      admission.indexOf('recordVoiceRouteVerification(admin'),
    );
  });

  it('never logs credential fingerprints or username comparisons', () => {
    const receipt = source('src', 'app', 'api', 'voice', 'receipt', 'route.ts');
    expect(receipt).not.toContain('fingerprint(');
    expect(receipt).not.toContain('username differs');
    expect(receipt).not.toContain('password differs');
  });

  it('minimizes provider receipts before writing the durable event inbox', () => {
    const receipt = source('src', 'app', 'api', 'voice', 'receipt', 'route.ts');
    expect(receipt).toContain('minimizeSignalWireVoiceReceiptPayload');
    expect(receipt).toContain('payload: minimizedPayload');
    expect(receipt).not.toMatch(/ingestVoiceEvent\([\s\S]*?\bpayload,\s*[\s\S]*?\)/);
  });
});
