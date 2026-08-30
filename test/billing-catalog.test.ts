import { describe, expect, it } from 'vitest';
import {
  BILLING_PLANS,
  ENTERPRISE_PRICING,
  PRICING_CATALOG_VERSION,
  TOP_UPS,
  annualizedBasePriceCents,
  basePriceCents,
  parseBillingPlanId,
  platformFeeCents,
  platformFeePercent,
  resolveBillingPlanId,
} from '@/lib/billing/catalog';

describe('canonical billing catalog', () => {
  it('pins every base price and plan fee in integer units', () => {
    expect(PRICING_CATALOG_VERSION).toBe('2026-08-18-preview');
    expect(BILLING_PLANS.flex).toMatchObject({ monthlyPriceCents: 0, annualPriceCents: 0, platformFeeBps: 125 });
    expect(BILLING_PLANS.solo).toMatchObject({ monthlyPriceCents: 3_900, annualPriceCents: 42_000, platformFeeBps: 50 });
    expect(BILLING_PLANS.growth).toMatchObject({ monthlyPriceCents: 12_900, annualPriceCents: 118_800, platformFeeBps: 25 });
    expect(BILLING_PLANS.scale).toMatchObject({ monthlyPriceCents: 32_900, annualPriceCents: 358_800, platformFeeBps: 10 });

    expect(platformFeePercent('flex')).toBe(1.25);
    expect(platformFeePercent('solo')).toBe(0.5);
    expect(platformFeePercent('growth')).toBe(0.25);
    expect(platformFeePercent('scale')).toBe(0.1);
  });

  it('calculates application fees from the eligible subtotal and rounds once', () => {
    expect(platformFeeCents(100_00, 'flex')).toBe(125);
    expect(platformFeeCents(100_00, 'solo')).toBe(50);
    expect(platformFeeCents(100_00, 'growth')).toBe(25);
    expect(platformFeeCents(100_00, 'scale')).toBe(10);
    expect(platformFeeCents(250, 'scale')).toBe(0);
    expect(platformFeeCents(500, 'scale')).toBe(1);
    expect(platformFeeCents(-100, 'flex')).toBe(0);
    expect(platformFeeCents(Number.NaN, 'flex')).toBe(0);
  });

  it('keeps monthly and annual base prices explicit', () => {
    expect(basePriceCents('solo', 'monthly')).toBe(3_900);
    expect(basePriceCents('solo', 'annual')).toBe(42_000);
    expect(annualizedBasePriceCents('growth', 'monthly')).toBe(154_800);
    expect(annualizedBasePriceCents('growth', 'annual')).toBe(118_800);
  });

  it('maps only known legacy plans and defaults unclassified development accounts to Flex', () => {
    expect(parseBillingPlanId('free')).toBe('flex');
    expect(parseBillingPlanId('pro')).toBe('growth');
    expect(parseBillingPlanId('crew_plus')).toBe('scale');
    expect(parseBillingPlanId('suspended')).toBeNull();
    expect(resolveBillingPlanId(undefined)).toBe('flex');
  });

  it('pins margin-safe top-ups and the Enterprise floor', () => {
    expect(TOP_UPS.flex_text_250.priceCents).toBe(1_200);
    expect(TOP_UPS.text_1000.priceCents).toBe(4_200);
    expect(TOP_UPS.marketing_email_5000.priceCents).toBe(1_700);
    expect(TOP_UPS.ai_intake_100.priceCents).toBe(1_500);
    expect(TOP_UPS.ai_writing_250.priceCents).toBe(1_900);
    expect(ENTERPRISE_PRICING).toEqual({
      startingMonthlyCents: 79_900,
      includedWorkspaces: 2,
      fullScaleDuoMonthlyCents: 109_900,
    });
  });

  it('gives Scale more of every metered resource than Growth', () => {
    // Scale duplicated Growth's allowances field for field while costing 2.55x,
    // and a test asserted that equality outright — so the duplication read as a
    // decision rather than the copy it was. Catalog 2026-08-18-preview separates
    // them. Every capacity field must now EXCEED Growth, not merely differ, so a
    // future copy-paste cannot pass by moving one number the wrong way.
    const growth = BILLING_PLANS.growth.allowances;
    const scale = BILLING_PLANS.scale.allowances;
    for (const field of [
      'officeUsers', 'crewUsers', 'textCredits', 'marketingEmailSends',
      'aiIntakeCredits', 'aiWritingDrafts', 'storageGb', 'forwardingMinutes',
    ] as const) {
      expect(scale[field], `scale.${field} must exceed growth`).toBeGreaterThan(growth[field]);
    }
    expect(scale).toMatchObject({
      officeUsers: 15,
      crewUsers: 50,
      textCredits: 3_000,
      marketingEmailSends: 5_000,
      aiIntakeCredits: 1_000,
      aiWritingDrafts: 500,
      storageGb: 250,
      forwardingMinutes: 200,
    });
    // Unchanged by design: one business, one domain, one QuickBooks connection.
    expect(scale.customDomainConnections).toBe(growth.customDomainConnections);
    expect(scale.dedicatedBusinessNumbers).toBe(growth.dedicatedBusinessNumbers);
  });

  it('retains the approved Voice differences between Growth and Scale', () => {
    expect(BILLING_PLANS.growth.voice).toMatchObject({
      monthlyPriceCents: 5_500,
      includedMinutes: 200,
      concurrentCalls: 1,
      includedInBasePlan: false,
    });
    expect(BILLING_PLANS.scale.voice).toMatchObject({
      monthlyPriceCents: 0,
      includedMinutes: 100,
      concurrentCalls: 3,
      includedInBasePlan: true,
      advancedRouting: true,
    });
  });
});
