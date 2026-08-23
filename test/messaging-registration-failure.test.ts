import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  logMessagingRegistrationActionFailure,
  redactMessagingRegistrationFailureMessage,
} from '@/lib/messaging-registration-action-failure';

const CORRELATION = '11111111-1111-4111-8111-111111111111';
const APPLICATION = '22222222-2222-4222-8222-222222222222';

describe('messaging registration failure diagnostics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs one structured, correlated record and returns only the opaque reference', () => {
    vi.stubEnv('SIGNALWIRE_API_TOKEN', 'sw-secret-token-value');
    const write = vi.fn();
    const error = new Error(
      'Authorization: Bearer raw-auth-token api_token=sw-secret-token-value ' +
      'owner@example.com +12485550140 EIN 12-3456789 ' +
      'https://user:pass@space.signalwire.com/api/relay/rest/phone_numbers?token=raw#detail',
    ) as Error & { code: string; operatorMessage: string };
    error.code = 'provider_rejected';
    error.operatorMessage = error.message;

    const result = logMessagingRegistrationActionFailure({
      applicationId: APPLICATION,
      action: 'purchase_number',
      fallbackCode: 'purchase_failed',
      error,
    }, {
      correlationId: () => CORRELATION,
      write,
    });

    expect(result).toBe(CORRELATION);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({
      event: 'messaging_registration_action_failed',
      correlationId: CORRELATION,
      applicationId: APPLICATION,
      action: 'purchase_number',
      errorCode: 'provider_rejected',
      safeMessage: expect.any(String),
    });
    const entry = write.mock.calls[0][0] as { safeMessage: string };
    expect(entry.safeMessage).toContain('[redacted-credential]');
    expect(entry.safeMessage).toContain('[redacted-email]');
    expect(entry.safeMessage).toContain('[redacted-phone]');
    expect(entry.safeMessage).not.toContain('raw-auth-token');
    expect(entry.safeMessage).not.toContain('sw-secret-token-value');
    expect(entry.safeMessage).not.toContain('12-3456789');
    expect(entry.safeMessage).not.toContain('user:pass');
    expect(entry.safeMessage).not.toContain('token=raw');
  });

  it('bounds and normalizes untrusted messages and invalid provider codes', () => {
    const write = vi.fn();
    const error = new Error(`line one\n${'x'.repeat(1_000)}`) as Error & { code: string };
    error.code = 'bad code with spaces';

    logMessagingRegistrationActionFailure({
      applicationId: null,
      action: 'review_application',
      fallbackCode: 'review_failed',
      error,
    }, {
      correlationId: () => CORRELATION,
      write,
    });

    const entry = write.mock.calls[0][0] as { errorCode: string; safeMessage: string };
    expect(entry.errorCode).toBe('review_failed');
    expect(entry.safeMessage).not.toContain('\n');
    expect(entry.safeMessage.length).toBeLessThanOrEqual(700);
  });

  it('refuses secret-equal and token-shaped provider codes in favor of the fixed action code', () => {
    vi.stubEnv('SIGNALWIRE_API_TOKEN', 'providerSecretCode');
    const write = vi.fn();
    for (const code of ['providerSecretCode', 'abc123def456ghi789jkl012mnop']) {
      const error = Object.assign(new Error('Provider rejected the request.'), { code });
      logMessagingRegistrationActionFailure({
        applicationId: APPLICATION,
        action: 'purchase_number',
        fallbackCode: 'purchase_failed',
        error,
      }, {
        correlationId: () => CORRELATION,
        write,
      });
    }

    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls.map(([entry]) => entry.errorCode)).toEqual(['purchase_failed', 'purchase_failed']);
    expect(JSON.stringify(write.mock.calls)).not.toContain('providerSecretCode');
    expect(JSON.stringify(write.mock.calls)).not.toContain('abc123def456ghi789jkl012mnop');
  });

  it('redacts query strings even when a provider URL has no credentials', () => {
    const safe = redactMessagingRegistrationFailureMessage(
      'Request failed at https://space.signalwire.com/api/path?phone=%2B12485550140&key=secret.',
    );
    expect(safe).toContain('space.signalwire.com/api/path');
    expect(safe).not.toContain('12485550140');
    expect(safe).not.toContain('key=secret');
  });
});
