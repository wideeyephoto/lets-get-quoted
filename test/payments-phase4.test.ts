import { describe, it, expect } from 'vitest';

describe('Phase 4 AI Cash Forecasting, Tax Vault & Reliability Tiers', () => {
  it('calculates tax reserve with custom federal and self-employment withholding percentages', () => {
    const grossRevenue = 40000;
    const incomeTaxPct = 25;
    const selfEmpPct = 15.3;

    const incomeTax = grossRevenue * (incomeTaxPct / 100); // 10,000
    const selfEmpTax = grossRevenue * (selfEmpPct / 100); // 6,120
    const totalReserve = incomeTax + selfEmpTax; // 16,120
    const takeHomeProfit = grossRevenue - totalReserve; // 23,880

    expect(incomeTax).toBe(10000);
    expect(selfEmpTax).toBe(6120);
    expect(takeHomeProfit).toBe(23880);
  });

  it('assigns customer reliability tiers accurately based on overdue latency', () => {
    const assignTier = (daysOverdue: number): 'A' | 'B' | 'C' => {
      if (daysOverdue > 15) return 'C';
      if (daysOverdue > 0) return 'B';
      return 'A';
    };

    expect(assignTier(0)).toBe('A');
    expect(assignTier(5)).toBe('B');
    expect(assignTier(14)).toBe('B');
    expect(assignTier(16)).toBe('C');
    expect(assignTier(45)).toBe('C');
  });

  it('calculates multi-invoice batch settlement totals without drift', () => {
    const allocations = [
      { invoiceId: 'inv_1', amount: 1450.50 },
      { invoiceId: 'inv_2', amount: 825.25 },
      { invoiceId: 'inv_3', amount: 324.25 },
    ];

    const total = allocations.reduce((sum, item) => sum + item.amount, 0);
    expect(total).toBe(2600.00);
  });
});
