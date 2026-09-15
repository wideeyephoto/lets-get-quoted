import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CARRIER_CAPS,
  assertCampaignNumberCeiling,
  getCampaignLifecycleWarnings,
} from '@/lib/messaging-carrier-caps';

describe('B2 — Carrier 10DLC Lifecycle & Approved Rate Caps', () => {
  const migration = readFileSync(
    join(process.cwd(), 'migrations/20260915010000_sms_campaign_lifecycle_and_canary.sql'),
    'utf8',
  );

  it('migration declares carrier caps and lifecycle columns on messaging_registration_applications', () => {
    expect(migration).toContain('campaign_renewal_at timestamptz');
    expect(migration).toContain('brand_revet_at timestamptz');
    expect(migration).toContain('max_assigned_numbers integer not null default 49');
    expect(migration).toContain('att_sms_per_minute_cap integer not null default 75');
    expect(migration).toContain('tmobile_daily_brand_cap integer not null default 2000');
  });

  it('defines exact approved carrier limits as recorded in operations standard', () => {
    expect(CARRIER_CAPS.MAX_ASSIGNED_NUMBERS_PER_CAMPAIGN).toBe(49);
    expect(CARRIER_CAPS.ATT_SMS_PER_MINUTE_CAP).toBe(75);
    expect(CARRIER_CAPS.ATT_MMS_PER_MINUTE_CAP).toBe(50);
    expect(CARRIER_CAPS.TMOBILE_DAILY_BRAND_CAP).toBe(2000);
  });

  it('getCampaignLifecycleWarnings generates proactive alerts for imminent renewal', () => {
    const fifteenDaysFromNow = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const warnings = getCampaignLifecycleWarnings({
      campaignRenewalAt: fifteenDaysFromNow,
      assignedNumbersCount: 20,
    });

    expect(warnings.renewalImminent).toBe(true);
    expect(warnings.daysUntilRenewal).toBe(15);
    expect(warnings.warningMessages.some((msg) => msg.includes('15 days'))).toBe(true);
  });

  it('getCampaignLifecycleWarnings flags assigned number count approaching 49 cap', () => {
    const warnings = getCampaignLifecycleWarnings({
      assignedNumbersCount: 47,
    });

    expect(warnings.nearNumberCap).toBe(true);
    expect(warnings.warningMessages.some((msg) => msg.includes('47/49'))).toBe(true);
  });

  it('assertCampaignNumberCeiling rejects when count reaches 49', async () => {
    // Mock Supabase client returning 49 rows
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => Promise.resolve({ count: 49, error: null }),
            }),
          }),
        }),
      }),
    } as any;

    await expect(
      assertCampaignNumberCeiling('test-campaign-uuid', mockClient),
    ).rejects.toThrow(/reached the approved ceiling of 49 assigned numbers/i);
  });

  it('assertCampaignNumberCeiling allows assignment when count is below 49', async () => {
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => Promise.resolve({ count: 12, error: null }),
            }),
          }),
        }),
      }),
    } as any;

    const result = await assertCampaignNumberCeiling('test-campaign-uuid', mockClient);
    expect(result.count).toBe(12);
    expect(result.maxAllowed).toBe(49);
  });
});
