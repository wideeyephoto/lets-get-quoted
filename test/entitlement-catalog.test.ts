import { describe, expect, it } from 'vitest';
import {
  planCreditGrants,
  planUpgradeCreditDeltas,
  proratedPlanUpgradeCreditDeltas,
  isTopUpEligible,
  topUpGrant,
  workspaceEntitlementCatalogSnapshot,
} from '@/lib/billing/entitlement-catalog';

describe('billing entitlement catalog compiler', () => {
  it('compiles Flex without inventing a subscription or Voice allowance', () => {
    const snapshot = workspaceEntitlementCatalogSnapshot('flex', 'none');

    expect(snapshot).toMatchObject({
      planCode: 'flex',
      billingInterval: 'none',
      platformFeeBps: 125,
      featureLimits: {
        office_users: 1,
        crew_users: 2,
        custom_domain_connections: 1,
        dedicated_business_numbers: 0,
        storage_gb: 5,
        quickbooks_connections: 1,
        voice_included_minutes: 0,
      },
      featureFlags: {
        quickbooks: true,
        shared_lgq_texting_number: true,
        voice_included: false,
      },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => workspaceEntitlementCatalogSnapshot('flex', 'monthly')).toThrow(/non-subscription/i);
  });

  it('compiles paid limits and Scale Voice directly from the canonical plan', () => {
    const snapshot = workspaceEntitlementCatalogSnapshot('scale', 'annual');

    expect(snapshot).toMatchObject({
      planCode: 'scale',
      billingInterval: 'annual',
      platformFeeBps: 10,
      featureLimits: {
        office_users: 5,
        crew_users: 10,
        storage_gb: 100,
        voice_concurrent_calls: 3,
        voice_history_days: 90,
        voice_included_minutes: 100,
      },
      featureFlags: {
        shared_lgq_texting_number: false,
        voice_included: true,
        voice_advanced_routing: true,
      },
    });
    expect(() => workspaceEntitlementCatalogSnapshot('solo', 'none')).toThrow(/paid plans/i);
  });

  it('issues one-time Flex credits and monthly paid-plan credits', () => {
    expect(planCreditGrants('flex')).toEqual([
      { resourceCode: 'text_segments', units: 50, cadence: 'one_time' },
      { resourceCode: 'marketing_email_sends', units: 100, cadence: 'one_time' },
      { resourceCode: 'ai_intake_threads', units: 30, cadence: 'one_time' },
      { resourceCode: 'ai_writing_drafts', units: 25, cadence: 'one_time' },
    ]);
    expect(planCreditGrants('growth')).toEqual([
      { resourceCode: 'text_segments', units: 1_500, cadence: 'monthly' },
      { resourceCode: 'marketing_email_sends', units: 2_500, cadence: 'monthly' },
      { resourceCode: 'ai_intake_threads', units: 500, cadence: 'monthly' },
      { resourceCode: 'ai_writing_drafts', units: 250, cadence: 'monthly' },
    ]);
  });

  it('adds only a paid plan-period difference on a mid-cycle upgrade', () => {
    expect(planUpgradeCreditDeltas('flex', 'solo')).toEqual([
      { resourceCode: 'text_segments', units: 500, cadence: 'one_time' },
      { resourceCode: 'marketing_email_sends', units: 500, cadence: 'one_time' },
      { resourceCode: 'ai_intake_threads', units: 250, cadence: 'one_time' },
      { resourceCode: 'ai_writing_drafts', units: 50, cadence: 'one_time' },
    ]);
    expect(planUpgradeCreditDeltas('solo', 'growth')).toEqual([
      { resourceCode: 'text_segments', units: 1_000, cadence: 'one_time' },
      { resourceCode: 'marketing_email_sends', units: 2_000, cadence: 'one_time' },
      { resourceCode: 'ai_intake_threads', units: 250, cadence: 'one_time' },
      { resourceCode: 'ai_writing_drafts', units: 200, cadence: 'one_time' },
    ]);
    expect(planUpgradeCreditDeltas('growth', 'scale')).toEqual([]);
    expect(planUpgradeCreditDeltas('growth', 'solo')).toEqual([]);
  });

  it('maps every top-up to a machine-readable quantity', () => {
    expect(topUpGrant('text_1000')).toEqual({
      topUpId: 'text_1000',
      resourceCode: 'text_segments',
      units: 1_000,
      recurring: false,
      fulfillment: 'usage_credit',
    });
    expect(topUpGrant('storage_100gb')).toEqual({
      topUpId: 'storage_100gb',
      resourceCode: 'storage_gb',
      units: 100,
      recurring: true,
      fulfillment: 'recurring_capacity',
    });
    expect(isTopUpEligible('flex_text_250', 'flex')).toBe(true);
    expect(isTopUpEligible('flex_text_250', 'solo')).toBe(false);
    expect(isTopUpEligible('office_user', 'flex')).toBe(false);
    expect(isTopUpEligible('office_user', 'growth')).toBe(true);
  });

  it('prorates paid mid-cycle allowance deltas to the paid period fraction', () => {
    const periodStartMs = Date.UTC(2026, 7, 1);
    const periodEndMs = Date.UTC(2026, 8, 1);
    const halfway = periodStartMs + ((periodEndMs - periodStartMs) / 2);

    expect(proratedPlanUpgradeCreditDeltas('solo', 'growth', {
      periodStartMs,
      periodEndMs,
      effectiveAtMs: halfway,
    })).toEqual([
      { resourceCode: 'text_segments', units: 500, cadence: 'one_time' },
      { resourceCode: 'marketing_email_sends', units: 1_000, cadence: 'one_time' },
      { resourceCode: 'ai_intake_threads', units: 125, cadence: 'one_time' },
      { resourceCode: 'ai_writing_drafts', units: 100, cadence: 'one_time' },
    ]);

    expect(() => proratedPlanUpgradeCreditDeltas('solo', 'growth', {
      periodStartMs,
      periodEndMs,
      effectiveAtMs: periodEndMs + 1,
    })).toThrow(/inside the current billing period/i);
  });
});
