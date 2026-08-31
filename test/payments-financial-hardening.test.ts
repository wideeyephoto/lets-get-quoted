import { describe, it, expect } from 'vitest';
import {
  toIntegerCents,
  fromIntegerCents,
  formatExactUsd,
  allocateMilestoneCents,
  calculateCashChangeCents,
  calculateSurchargeCents,
  verifyDoubleEntryBalance,
} from '../src/lib/financial-precision';
import { generateGeneralLedgerJournalEntries } from '../src/lib/accounting/accounting-sync-engine';

describe('Financial Precision & Number Hardening Engine', () => {
  it('converts between dollars and integer cents with zero floating-point drift', () => {
    // Classic IEEE 754 precision trap: 0.1 + 0.2 = 0.30000000000000004
    const centsA = toIntegerCents(0.10);
    const centsB = toIntegerCents(0.20);
    expect(centsA + centsB).toBe(30);
    expect(fromIntegerCents(centsA + centsB)).toBe(0.30);

    // Micro-cents additions: $0.07 + $0.08 = $0.15
    const sumCents = toIntegerCents(0.07) + toIntegerCents(0.08);
    expect(sumCents).toBe(15);
    expect(fromIntegerCents(sumCents)).toBe(0.15);

    // String parsing with currency symbols and commas
    expect(toIntegerCents('$1,450.99')).toBe(145099);
    expect(formatExactUsd(1450.99)).toBe('$1,450.99');
  });

  it('allocates milestone splits using largest-remainder method with ZERO lost pennies', () => {
    // Split $10,000 into 3 equal 33.3333...% thirds
    const result1 = allocateMilestoneCents(10000, [33.3333333, 33.3333333, 33.3333334]);
    const sumCents1 = result1.reduce((sum, s) => sum + s.cents, 0);
    const sumDollars1 = result1.reduce((sum, s) => sum + s.dollars, 0);

    expect(sumCents1).toBe(1000000); // exactly $10,000.00
    expect(sumDollars1).toBe(10000);
    expect(result1[0].dollars).toBe(3333.33);
    expect(result1[1].dollars).toBe(3333.33);
    expect(result1[2].dollars).toBe(3333.34);

    // Split odd contract total $14,999.99 with 40% / 30% / 30%
    const result2 = allocateMilestoneCents(14999.99, [40, 30, 30]);
    const sumCents2 = result2.reduce((sum, s) => sum + s.cents, 0);
    const sumDollars2 = result2.reduce((sum, s) => sum + s.dollars, 0);

    expect(sumCents2).toBe(1499999);
    expect(Math.round(sumDollars2 * 100) / 100).toBe(14999.99);
  });

  it('calculates cash change without float precision anomalies', () => {
    // $100.00 tendered on $83.47 due
    const change = calculateCashChangeCents(100.00, 83.47);
    expect(change.isSufficient).toBe(true);
    expect(change.changeCents).toBe(1653);
    expect(change.changeDollars).toBe(16.53);
    expect(change.shortfallDollars).toBe(0);

    // Shortfall case: $50.00 tendered on $75.25 due
    const shortfall = calculateCashChangeCents(50.00, 75.25);
    expect(shortfall.isSufficient).toBe(false);
    expect(shortfall.changeDollars).toBe(0);
    expect(shortfall.shortfallDollars).toBe(25.25);
  });

  it('calculates exact credit card surcharge amounts respecting legal caps', () => {
    // 3.0% surcharge on $2,500.00
    const sc = calculateSurchargeCents(2500.00, 3.0);
    expect(sc.surchargeDollars).toBe(75.00);
    expect(sc.totalWithSurchargeDollars).toBe(2575.00);

    // Fractional surcharge: 2.85% on $1,455.50
    const sc2 = calculateSurchargeCents(1455.50, 2.85);
    expect(sc2.surchargeCents).toBe(4148); // Math.round(145550 * 0.0285) = 4148
    expect(sc2.surchargeDollars).toBe(41.48);
    expect(sc2.totalWithSurchargeDollars).toBe(1496.98);

    // Compliance cap: 5.0% requested is clamped to 3.0%
    const scClamped = calculateSurchargeCents(1000.00, 5.0);
    expect(scClamped.surchargeDollars).toBe(30.00);
  });

  it('guarantees double-entry journal balance equality across 1,000 transactions', () => {
    const transactions: Array<{ id: string; clientName: string; gross: number; fee: number; net: number }> = [];

    // Generate 1,000 realistic contractor transactions with varying rates
    for (let i = 1; i <= 1000; i++) {
      const gross = Math.round((Math.random() * 15000 + 100) * 100) / 100;
      const fee = Math.round((gross * 0.029 + 0.30) * 100) / 100;
      const net = Math.round((gross - fee) * 100) / 100;
      transactions.push({ id: `tx_${i}`, clientName: `Client ${i}`, gross, fee, net });
    }

    const journalEntries = generateGeneralLedgerJournalEntries(transactions);
    const balanceCheck = verifyDoubleEntryBalance(journalEntries);

    expect(balanceCheck.isBalanced).toBe(true);
    expect(balanceCheck.deltaCents).toBe(0);
    expect(balanceCheck.totalDebitsCents).toBe(balanceCheck.totalCreditsCents);
  });
});
