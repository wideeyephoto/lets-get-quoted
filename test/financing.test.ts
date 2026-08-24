import { describe, it, expect } from 'vitest';
import {
  calculateMonthlyPayment,
  formatMonthlyEstimate,
  isFinancingEligible,
  getFinancingOptions,
  buildFinancingBadgeCopy,
} from '../src/lib/financing';

describe('Financing Payment Calculator', () => {
  it('calculates accurate amortized monthly payments', () => {
    // $5,000 over 36 months at 9.99% APR -> ~$161.30/mo
    const monthly = calculateMonthlyPayment(5000, 36, 9.99);
    expect(monthly).toBeGreaterThan(160);
    expect(monthly).toBeLessThan(163);

    // 0% APR (interest-free promo) -> exact division
    const interestFree = calculateMonthlyPayment(1200, 12, 0);
    expect(interestFree).toBe(100);
  });

  it('formats monthly estimates into readable currency strings', () => {
    expect(formatMonthlyEstimate(161.3)).toBe('$161/mo');
    expect(formatMonthlyEstimate(75)).toBe('$75/mo');
    expect(formatMonthlyEstimate(0)).toBe('$0/mo');
  });

  it('determines financing eligibility based on minimum ticket threshold', () => {
    expect(isFinancingEligible(500)).toBe(true);
    expect(isFinancingEligible(4500)).toBe(true);
    expect(isFinancingEligible(499)).toBe(false);
    expect(isFinancingEligible(0)).toBe(false);
  });

  it('returns structured breakdown options across standard terms', () => {
    const options = getFinancingOptions(3000);
    expect(options).toHaveLength(4);
    const monthsList = options.map((o) => o.months);
    expect(monthsList).toEqual([12, 24, 36, 60]);

    // 60-month option should have lowest monthly payment
    const monthly60 = options.find((o) => o.months === 60)!.monthlyPayment;
    const monthly12 = options.find((o) => o.months === 12)!.monthlyPayment;
    expect(monthly60).toBeLessThan(monthly12);
  });

  it('builds clear badge copy for quote approval headers', () => {
    const badge = buildFinancingBadgeCopy(4800);
    expect(badge).not.toBeNull();
    expect(badge).toContain('Or as low as');
    expect(badge).toContain('/mo with financing');

    const ineligibleBadge = buildFinancingBadgeCopy(250);
    expect(ineligibleBadge).toBeNull();
  });
});
