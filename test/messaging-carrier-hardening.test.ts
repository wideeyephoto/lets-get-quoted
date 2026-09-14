import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLeadVerificationConfigured, isLeadVerificationValid } from '@/lib/lead-verification';

/**
 * Tier 3 — Messaging Carrier Hardening invariants from docs/hardening-backlog-2026-09-14.md
 *
 * Items 9-12:
 * 9. The delivery worker and its three lanes (shared, dispatch, contractor messaging)
 * 10. Dedicated number provisioning blocked on the carrier; purchase fails closed
 * 11. No separately-authenticated 10DLC status callback route (must stay blank)
 * 12. LGQ_LEAD_VERIFICATION_SECRET must be set before Twilio token removed
 */

describe('Tier 3 — messaging carrier hardening invariants', () => {
  it('documents LGQ_SIGNALWIRE_10DLC_STATUS_CALLBACK_URL as unsupported in .env.example', () => {
    const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    expect(envExample).toContain('LGQ_SIGNALWIRE_10DLC_STATUS_CALLBACK_URL=');
    expect(envExample).toContain('Unsupported until LGQ has a separately authenticated 10DLC callback route.');
  });

  it('fails closed when lead verification secrets are completely absent', () => {
    const prevSecret = process.env.LGQ_LEAD_VERIFICATION_SECRET;
    const prevTwilio = process.env.TWILIO_AUTH_TOKEN;
    try {
      delete process.env.LGQ_LEAD_VERIFICATION_SECRET;
      delete process.env.TWILIO_AUTH_TOKEN;

      expect(isLeadVerificationConfigured()).toBe(false);
      expect(
        isLeadVerificationValid(
          '+15551234567',
          '123456',
          Date.now() + 60_000,
          'any-token',
        ),
      ).toBe(false);
    } finally {
      if (prevSecret !== undefined) process.env.LGQ_LEAD_VERIFICATION_SECRET = prevSecret;
      if (prevTwilio !== undefined) process.env.TWILIO_AUTH_TOKEN = prevTwilio;
    }
  });

  it('keeps the 3 SMS traffic lanes dark by default in .env.example', () => {
    const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    expect(envExample).toMatch(/^LGQ_SMS_SHARED_ENABLED=0$/m);
    expect(envExample).toMatch(/^LGQ_SMS_DISPATCH_ENABLED=0$/m);
    expect(envExample).toMatch(/^LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED=0$/m);
    expect(envExample).toMatch(/^LGQ_SMS_DELIVERY_WORKER_ENABLED=0$/m);
  });
});
