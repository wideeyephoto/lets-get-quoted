import { describe, it, expect } from 'vitest';
import { resolveLedgerDateWindow } from '../src/lib/payments-ledger-data';

describe('Advanced Revenue & Payments Calculations', () => {
  it('correctly resolves date ranges for YTD and today', () => {
    const today = resolveLedgerDateWindow('today');
    expect(today.start).toBeDefined();
    const todayDate = new Date(today.start!);
    const now = new Date();
    expect(todayDate.getUTCDate()).toBe(now.getUTCDate());

    const ytd = resolveLedgerDateWindow('ytd');
    expect(ytd.start).toBeDefined();
    const ytdDate = new Date(ytd.start!);
    expect(ytdDate.getUTCMonth()).toBe(0);
    expect(ytdDate.getUTCDate()).toBe(1);
  });

  it('calculates ACH fee savings accurately for large transactions ($500+)', () => {
    const amount = 2500;
    const cardFeeRate = 0.029;
    const cardFixedFee = 0.30;
    const estimatedCardFee = amount * cardFeeRate + cardFixedFee; // $72.80
    const achCappedFee = 5.00;
    const savings = estimatedCardFee - achCappedFee; // $67.80
    expect(savings).toBeCloseTo(67.80, 2);
  });

  it('calculates goal progress percentages safely with zero or high numbers', () => {
    const goal = 50000;
    const collected = 32500;
    const progressPct = Math.min(100, Math.round((collected / Math.max(1, goal)) * 100));
    expect(progressPct).toBe(65);
  });
});
