import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasCurrentSmsConsent,
  sendCampaignSms,
} from '@/lib/sms';
import {
  MARKETING_SMS_DISCLOSURE_VERSION,
  MARKETING_SMS_FULL_DISCLOSURE,
  getMarketingSmsDisclosureHash,
} from '@/lib/customer-sms-disclosure';

let mockScopeData: { consent_scope: string } | null = null;
let mockBaseData: { status: string; consented_at: string; updated_at: string; opted_out_at: string | null } | null = null;

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockScopeData, error: null }),
            }),
            maybeSingle: async () => ({ data: mockBaseData, error: null }),
          }),
          maybeSingle: async () => ({ data: mockBaseData, error: null }),
        }),
      }),
    }),
  }),
}));

describe('A4 — Marketing SMS Consent Scope & Campaign Gate', () => {
  const migration = readFileSync(
    join(process.cwd(), 'migrations/20260915000000_sms_marketing_consent_scope.sql'),
    'utf8',
  );

  beforeEach(() => {
    mockScopeData = null;
    mockBaseData = null;
  });

  it('migration updates CHECK constraints on sms_consent_scopes and sms_consent_evidence to admit marketing', () => {
    expect(migration).toContain("check (consent_scope in ('customer', 'crew', 'owner', 'marketing'))");
    expect(migration).toContain('sms_consent_scopes_marketing_lookup_idx');
    expect(migration).toContain("'marketing_opt_in'");
  });

  it('defines deterministic marketing disclosure constants and 64-char SHA-256 hash', () => {
    expect(MARKETING_SMS_DISCLOSURE_VERSION).toBe('2026-09-15-marketing-sms-v1');
    expect(MARKETING_SMS_FULL_DISCLOSURE).toContain('promotional and marketing SMS text messages');
    expect(MARKETING_SMS_FULL_DISCLOSURE).toContain('Reply STOP to cancel');
    const hash = getMarketingSmsDisclosureHash();
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hasCurrentSmsConsent requires marketing scope when requested', async () => {
    mockBaseData = {
      status: 'opted_in',
      consented_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      opted_out_at: null,
    };
    // Contact has customer scope only
    mockScopeData = { consent_scope: 'customer' };

    const hasCustomer = await hasCurrentSmsConsent('acc-1', '+15555550199', 'customer');
    expect(hasCustomer).toBe(true);

    // Marketing scope check must fail closed when scope is only customer
    mockScopeData = null; // Query with .eq('consent_scope', 'marketing') returns no match
    const hasMarketing = await hasCurrentSmsConsent('acc-1', '+15555550199', 'marketing');
    expect(hasMarketing).toBe(false);
  });

  it('sendCampaignSms refuses to queue when recipient lacks marketing scope consent', async () => {
    mockBaseData = {
      status: 'opted_in',
      consented_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      opted_out_at: null,
    };
    mockScopeData = null; // no marketing scope

    await expect(
      sendCampaignSms({
        phone: '+15555550199',
        businessName: 'Apex Plumbing',
        body: 'Seasonal winterization special!',
        accountId: '00000000-0000-0000-0000-000000000001',
        idempotencyKey: 'test-campaign-gate-1',
      }),
    ).rejects.toThrow(/marketing SMS consent/i);
  });
});
