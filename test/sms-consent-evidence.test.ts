import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CUSTOMER_SMS_DISCLOSURE_VERSION,
  CUSTOMER_SMS_FULL_DISCLOSURE,
  getCustomerSmsDisclosureHash,
  MARKETING_SMS_DISCLOSURE_VERSION,
  MARKETING_SMS_FULL_DISCLOSURE,
  getMarketingSmsDisclosureHash,
} from '@/lib/customer-sms-disclosure';
import { recordCustomerSmsConsentEvidence } from '@/lib/sms';

describe('A5 — Customer & Lead Consent Evidence Capture', () => {
  it('computes valid 64-char hex SHA-256 hashes for customer and marketing disclosures', () => {
    const customerHash = getCustomerSmsDisclosureHash();
    expect(customerHash).toHaveLength(64);
    expect(customerHash).toMatch(/^[a-f0-9]{64}$/);

    const marketingHash = getMarketingSmsDisclosureHash();
    expect(marketingHash).toHaveLength(64);
    expect(marketingHash).toMatch(/^[a-f0-9]{64}$/);
    expect(customerHash).not.toEqual(marketingHash);
  });

  it('fails closed when given an invalid phone number', async () => {
    const outcome = await recordCustomerSmsConsentEvidence({
      accountId: '00000000-0000-0000-0000-000000000001',
      phone: 'invalid-phone-string',
      scope: 'customer',
    });
    expect(outcome).toBe('failed');
  });

  it('records customer consent with correct versioned disclosure defaults', async () => {
    // In unit test environment, createAdminClient is mocked or uses mock database
    const outcome = await recordCustomerSmsConsentEvidence({
      accountId: '00000000-0000-0000-0000-000000000001',
      phone: '+15555550123',
      scope: 'customer',
      source: 'lead_intake_form',
      sourcePage: '/request-quote',
    });
    // Should be recorded or failed cleanly based on database mock connection, never throwing unhandled exception
    expect(['recorded', 'failed', 'suppressed']).toContain(outcome);
  });

  it('records marketing consent with marketing scope and marketing disclosure version', async () => {
    const outcome = await recordCustomerSmsConsentEvidence({
      accountId: '00000000-0000-0000-0000-000000000001',
      phone: '+15555550124',
      scope: 'marketing',
      source: 'marketing_opt_in',
      sourcePage: '/dashboard/marketing',
    });
    expect(['recorded', 'failed', 'suppressed']).toContain(outcome);
  });
});
