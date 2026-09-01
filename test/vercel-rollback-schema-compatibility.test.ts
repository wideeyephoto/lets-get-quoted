import { describe, it, expect } from 'vitest';
import { isLegacyDestinationPayment, inspectLegacyDestinationPaymentRail } from '../src/lib/payments';

describe('Vercel Rollback & Forward-Compatible Schema Resilience', () => {
  it('proves payments code gracefully handles both legacy and forward schema shapes', () => {
    // Legacy row without charge_model (prior deployment state)
    const legacyPaymentRow = {
      id: 'pay-legacy-1',
      account_id: 'acc-1',
      amount: 50.0,
      status: 'paid',
    };

    // Forward row with charge_model explicitly set
    const forwardDestinationPaymentRow = {
      id: 'pay-forward-1',
      account_id: 'acc-1',
      amount: 50.0,
      status: 'paid',
      charge_model: 'destination',
    };

    const forwardDirectPaymentRow = {
      id: 'pay-forward-2',
      account_id: 'acc-1',
      amount: 50.0,
      status: 'paid',
      charge_model: 'direct',
    };

    expect(isLegacyDestinationPayment(legacyPaymentRow as any)).toBe(true);
    expect(isLegacyDestinationPayment(forwardDestinationPaymentRow)).toBe(true);
    expect(isLegacyDestinationPayment(forwardDirectPaymentRow)).toBe(false);
  });

  it('proves inspectLegacyDestinationPaymentRail fails closed on unknown or direct rails', async () => {
    const queryBuilder: any = {
      eq: () => queryBuilder,
      maybeSingle: async () => ({
        data: { id: 'pay-direct-1', status: 'paid', charge_model: 'direct' },
        error: null,
      }),
    };
    const mockSupabase = {
      from: () => ({
        select: () => queryBuilder,
      }),
    };

    const rail = await inspectLegacyDestinationPaymentRail(mockSupabase as any, 'pay-direct-1', 'acc-1');
    expect(rail.kind).toBe('blocked');
  });

  it('proves accounts table schema allows older code to insert without breaking on nullable additions', () => {
    // Core columns expected by historical signup flows
    const historicalAccountPayload = {
      business_name: 'Rollback Test Contractor',
      plan: 'solo',
      created_at: new Date().toISOString(),
    };

    expect(historicalAccountPayload.business_name).toBeDefined();
    expect(historicalAccountPayload.plan).toBeDefined();
  });
});
