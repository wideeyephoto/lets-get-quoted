import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  BASE_PLAN_RECURRING_CONSENT,
  BASE_PLAN_RECURRING_CONSENT_CLAIM_TTL_SECONDS,
  BASE_PLAN_RECURRING_CONSENT_TEXT,
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from '@/lib/terms';

describe('canonical paid base-plan recurring consent', () => {
  it('pins the exact UTF-8 artifact to its published SHA-256', () => {
    expect(createHash('sha256').update(BASE_PLAN_RECURRING_CONSENT_TEXT, 'utf8').digest('hex'))
      .toBe(BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256);
    expect(BASE_PLAN_RECURRING_CONSENT).toEqual({
      version: BASE_PLAN_RECURRING_CONSENT_VERSION,
      text: BASE_PLAN_RECURRING_CONSENT_TEXT,
      textSha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    });
    expect(Object.isFrozen(BASE_PLAN_RECURRING_CONSENT)).toBe(true);
  });

  it('states the approved cadence, renewal, cancellation, Stripe, and annual guarantee rules plainly', () => {
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain('through Stripe, to charge');
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain('in advance');
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain('monthly or annual');
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain('automatically renews');
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain('cancellation takes effect at the end');
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain('once per verified business');
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain('within 30 days');
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain(
      'annual prepayment minus one normal month-to-month base charge for the selected plan',
    );
    expect(BASE_PLAN_RECURRING_CONSENT_TEXT).toContain(
      'Consumed add-ons, AI Voice Receptionist or carrier costs, Stripe fees, taxes, and custom work are excluded.',
    );
    expect(BASE_PLAN_RECURRING_CONSENT_CLAIM_TTL_SECONDS).toBe(1_800);
  });

  it('moves the material platform Terms version and publishes matching billing disclosures', () => {
    expect(TERMS_VERSION).toBe('2026-08-16');
    expect(TERMS_EFFECTIVE_DATE).toBe('August 16, 2026');

    const termsPath = fileURLToPath(new URL('../src/app/terms/page.tsx', import.meta.url));
    const terms = readFileSync(termsPath, 'utf8');
    expect(terms).toContain('Paid base plans are prepaid monthly or annually and renew automatically');
    expect(terms).toContain('you authorize us, through Stripe, to charge');
    expect(terms).toContain('cancellation takes effect at the end of the current paid billing period');
    expect(terms).toContain('<strong>First annual base-plan guarantee.</strong>');
    expect(terms).toContain('annual prepayment minus one normal month-to-month base charge');
  });
});
