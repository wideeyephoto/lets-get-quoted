import { describe, it, expect } from 'vitest';
import { resolveLedgerDateWindow } from '../src/lib/payments-ledger-data';

describe('resolveLedgerDateWindow', () => {
  it('correctly sets null start date for "all"', () => {
    const { start, end } = resolveLedgerDateWindow('all');
    expect(start).toBeNull();
    expect(end).toBeDefined();
  });

  it('correctly sets 7d window', () => {
    const { start, end } = resolveLedgerDateWindow('7d');
    expect(start).toBeDefined();
    const startMs = new Date(start!).getTime();
    const endMs = new Date(end).getTime();
    const diffDays = Math.round((endMs - startMs) / 86400000);
    expect(diffDays).toBe(7);
  });

  it('correctly sets 30d window by default', () => {
    const { start, end } = resolveLedgerDateWindow();
    expect(start).toBeDefined();
    const startMs = new Date(start!).getTime();
    const endMs = new Date(end).getTime();
    const diffDays = Math.round((endMs - startMs) / 86400000);
    expect(diffDays).toBe(30);
  });

  it('correctly sets 90d window', () => {
    const { start, end } = resolveLedgerDateWindow('90d');
    expect(start).toBeDefined();
    const startMs = new Date(start!).getTime();
    const endMs = new Date(end).getTime();
    const diffDays = Math.round((endMs - startMs) / 86400000);
    expect(diffDays).toBe(90);
  });
});
