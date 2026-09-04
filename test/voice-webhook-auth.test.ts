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
  signVoiceToolToken,
  verifyVoiceToolToken,
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

  it.each([
    'Basic !!!not-base64!!!',
    `Basic ${Buffer.from('voice-receipt:test:password').toString('base64')}=`,
    'Basic /w==',
  ])('rejects malformed or noncanonical Basic credentials', (header) => {
    expect(verifyVoiceReceiptAuthorization(request(header), ENV))
      .toEqual({ ok: false, reason: 'malformed' });
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

  it('binds ?account= query parameter into the SignalWire HMAC signature', () => {
    const accountId = '22222222-2222-4222-8222-222222222222';
    const legitimateUrl = `https://lgq.test/api/voice/ai/status?account=${accountId}`;
    const rawBody = 'CallSid=call-sw-1&DialCallStatus=no-answer&From=%2B18105550199';
    useTrustedCallbackOrigin();
    vi.stubEnv('SIGNALWIRE_SIGNING_KEY', 'signalwire-signing-key');

    // SignalWire compatibility form signature: base64(hmac-sha1(url + sorted_form_pairs))
    const sortedPairs = 'CallSidcall-sw-1DialCallStatusno-answerFrom+18105550199';
    const validSignature = createHmac('sha1', 'signalwire-signing-key')
      .update(legitimateUrl + sortedPairs)
      .digest('base64');

    // Legitimate signed request succeeds and yields provider: 'signalwire'
    const legitimateReq = new Request(legitimateUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-signalwire-signature': validSignature,
      },
      body: rawBody,
    });
    const legitCheck = verifySignedVoiceWebhook(legitimateReq, rawBody);
    expect(legitCheck).toEqual({ ok: true, provider: 'signalwire' });

    // Attack 1: Replaying with a different workspace's account id in the query parameter fails
    const attackerAccountId = '33333333-3333-4333-8333-333333333333';
    const tamperedUrl = `https://lgq.test/api/voice/ai/status?account=${attackerAccountId}`;
    const tamperedReq = new Request(tamperedUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-signalwire-signature': validSignature,
      },
      body: rawBody,
    });
    expect(verifySignedVoiceWebhook(tamperedReq, rawBody)).toEqual({
      ok: false,
      reason: 'mismatch',
    });

    // Attack 2: Stripping the account query parameter fails
    const strippedUrl = 'https://lgq.test/api/voice/ai/status';
    const strippedReq = new Request(strippedUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-signalwire-signature': validSignature,
      },
      body: rawBody,
    });
    expect(verifySignedVoiceWebhook(strippedReq, rawBody)).toEqual({
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

describe('SWAIG admission-bound tool token security', () => {
  const tokenEnv = { SIGNALWIRE_SIGNING_KEY: 'test-secret-key-1234567890' };

  it('signs and verifies a valid admission-bound token', () => {
    const token = signVoiceToolToken(
      {
        accountId: 'acc-111',
        providerCallId: 'call-222',
        callerPhone: '+12485550199',
      },
      3600,
      tokenEnv,
    );

    expect(token).toBeTruthy();
    const result = verifyVoiceToolToken(token, tokenEnv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.accountId).toBe('acc-111');
      expect(result.payload.providerCallId).toBe('call-222');
      expect(result.payload.callerPhone).toBe('+12485550199');
      expect(result.payload.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it('rejects tampered or forged tokens', () => {
    const token = signVoiceToolToken(
      { accountId: 'acc-111', providerCallId: 'call-222' },
      3600,
      tokenEnv,
    );
    expect(token).toBeTruthy();
    if (!token) return;
    const [payload] = token.split('.');
    const tampered = `${payload}.invalid-signature`;
    expect(verifyVoiceToolToken(tampered, tokenEnv)).toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  it('rejects expired tokens', () => {
    const expiredToken = signVoiceToolToken(
      { accountId: 'acc-111', providerCallId: 'call-222' },
      -10,
      tokenEnv,
    );
    expect(expiredToken).toBeTruthy();
    if (!expiredToken) return;
    expect(verifyVoiceToolToken(expiredToken, tokenEnv)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

