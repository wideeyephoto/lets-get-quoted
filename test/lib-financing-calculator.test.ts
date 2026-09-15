import { describe, it, expect } from 'vitest';
import { calculateEarlyPayDiscount } from '@/lib/financing-calculator';

describe('Financing Calculator Re-export', () => {
  it('re-exports calculateEarlyPayDiscount', () => {
    expect(typeof calculateEarlyPayDiscount).toBe('function');
  });
});
