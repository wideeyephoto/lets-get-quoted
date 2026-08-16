import { describe, expect, it } from 'vitest';
import { rankPlanCosts } from '@/app/pricing/pricing-ranking';

describe('pricing calculator ranking', () => {
  it('prefers the more capable plan at an exact price tie', () => {
    const result = rankPlanCosts([
      { planId: 'flex', annualCost: 1_328 },
      { planId: 'solo', annualCost: 1_328 },
      { planId: 'growth', annualCost: 1_948 },
      { planId: 'scale', annualCost: 3_628 },
    ]);

    expect(result.winner?.planId).toBe('solo');
    expect(result.tiedPlanIds).toEqual(['solo', 'flex']);
    expect(result.runnerUp?.planId).toBe('growth');
  });

  it('never reports a zero-savings tied plan as the runner-up', () => {
    const result = rankPlanCosts([
      { planId: 'solo', annualCost: 2_000 },
      { planId: 'growth', annualCost: 2_000 },
      { planId: 'scale', annualCost: 3_000 },
      { planId: 'flex', annualCost: null },
    ]);

    expect(result.winner?.planId).toBe('growth');
    expect(result.runnerUp).toEqual({ planId: 'scale', annualCost: 3_000 });
  });
});
