import { describe, it, expect } from 'vitest';
import {
  calculateMonthlyPayment,
  calculateFinancingOptions,
  calculateEarlyPayDiscount,
} from '../src/lib/financing-calculator';

describe('Phase 5 Homeowner Financing & Early-Pay Incentives Engine', () => {
  it('computes 0% promotional loan amortization accurately', () => {
    const principal = 12000;
    const monthly = calculateMonthlyPayment(principal, 0, 12);
    expect(monthly).toBe(1000);
  });

  it('computes fixed APR loan monthly payment using standard amortization formula', () => {
    const principal = 10000;
    const apr = 8.99;
    const months = 36;
    const monthly = calculateMonthlyPayment(principal, apr, months);
    // Standard amortization for $10k at 8.99% for 36 months is ~$317.94
    expect(monthly).toBeCloseTo(317.94, 0);
  });

  it('generates multi-term financing options (12, 24, 36, 60, 84 months)', () => {
    const options = calculateFinancingOptions(15000, 7.99);
    expect(options.length).toBe(5);
    expect(options[0].months).toBe(12);
    expect(options[0].monthlyPayment).toBe(1250); // 0% promo for 12 months
    expect(options[3].months).toBe(60);
    expect(options[3].monthlyPayment).toBeGreaterThan(0);
  });

  it('calculates 2/10 prompt pay discount terms accurately', () => {
    const invoiceAmount = 4500;
    const discount = calculateEarlyPayDiscount(invoiceAmount, 2);
    expect(discount.discountAmount).toBe(90.00);
    expect(discount.discountedTotal).toBe(4410.00);
    expect(discount.termsText).toContain('save $90.00');
  });
});
