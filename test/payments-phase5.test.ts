import { describe, it, expect } from 'vitest';
import { calculateEarlyPayDiscount } from '../src/lib/early-pay-discount';

describe('Phase 5 Early-Pay Incentives Engine', () => {
  it('calculates 2/10 prompt pay discount terms accurately', () => {
    const invoiceAmount = 4500;
    const discount = calculateEarlyPayDiscount(invoiceAmount, 2);
    expect(discount.discountAmount).toBe(90.00);
    expect(discount.discountedTotal).toBe(4410.00);
    expect(discount.termsText).toContain('save $90.00');
  });
});
