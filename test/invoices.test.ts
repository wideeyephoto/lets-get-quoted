import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals, selectPrimaryInvoice, formatMoney, type Invoice } from '@/lib/invoices';

// Build just enough of an Invoice for selectPrimaryInvoice (it reads status/total/created_at).
function inv(partial: Partial<Invoice>): Invoice {
  return { id: 'i', account_id: 'a', job_id: 'j', ref: 'INV-1', status: 'sent', total: 0, discount_percent: 0, tax_rate: 0, signed_at: null, signer_name: null, created_at: '2026-01-01T00:00:00Z', ...partial } as Invoice;
}

describe('computeInvoiceTotals', () => {
  it('sums items with no discount or tax', () => {
    const t = computeInvoiceTotals([{ amount: 100 }, { amount: 49.5 }], 0, 0);
    expect(t.subtotal).toBe(149.5);
    expect(t.discountAmount).toBe(0);
    expect(t.taxAmount).toBe(0);
    expect(t.total).toBe(149.5);
  });

  it('applies discount to subtotal, then tax to the DISCOUNTED subtotal (order matters)', () => {
    const t = computeInvoiceTotals([{ amount: 100 }], 10, 8.25);
    expect(t.subtotal).toBe(100);
    expect(t.discountAmount).toBe(10);
    // tax is 8.25% of 90 (not of 100) — the whole point of the ordering
    expect(t.taxAmount).toBe(7.43);
    expect(t.total).toBe(97.43);
  });

  it('clamps discount to 0..100', () => {
    expect(computeInvoiceTotals([{ amount: 100 }], 150, 0).discountPercent).toBe(100);
    expect(computeInvoiceTotals([{ amount: 100 }], -5, 0).discountPercent).toBe(0);
    // discount clamped to 100 => taxable 0 => total 0
    expect(computeInvoiceTotals([{ amount: 100 }], 150, 10).total).toBe(0);
  });

  it('floors a negative tax rate to 0', () => {
    expect(computeInvoiceTotals([{ amount: 100 }], 0, -5).taxRate).toBe(0);
    expect(computeInvoiceTotals([{ amount: 100 }], 0, -5).total).toBe(100);
  });

  it('treats NaN / non-finite discount and tax as 0', () => {
    const t = computeInvoiceTotals([{ amount: 200 }], NaN, Infinity);
    expect(t.discountPercent).toBe(0);
    expect(t.taxRate).toBe(0);
    expect(t.total).toBe(200);
  });

  it('rounds to cents', () => {
    // 3 * 33.333 = 99.999 -> subtotal rounds to 100.00
    const t = computeInvoiceTotals([{ amount: 33.333 }, { amount: 33.333 }, { amount: 33.333 }], 0, 0);
    expect(t.subtotal).toBe(100);
  });

  it('empty item list totals zero', () => {
    expect(computeInvoiceTotals([], 10, 8).total).toBe(0);
  });

  it('coerces string amounts (Postgres numerics arrive as strings)', () => {
    const t = computeInvoiceTotals([{ amount: '50' as unknown as number }, { amount: '25.5' as unknown as number }], 0, 0);
    expect(t.subtotal).toBe(75.5);
  });
});

describe('selectPrimaryInvoice', () => {
  it('returns null for an empty list', () => {
    expect(selectPrimaryInvoice([])).toBeNull();
  });

  it('picks the highest total', () => {
    const chosen = selectPrimaryInvoice([inv({ id: 'a', total: 100 }), inv({ id: 'b', total: 300 }), inv({ id: 'c', total: 200 })]);
    expect(chosen?.id).toBe('b');
  });

  it('excludes voided invoices even when they are the largest', () => {
    const chosen = selectPrimaryInvoice([inv({ id: 'void-big', total: 999, status: 'void' }), inv({ id: 'live', total: 100 })]);
    expect(chosen?.id).toBe('live');
  });

  it('breaks a total tie by newest created_at', () => {
    const chosen = selectPrimaryInvoice([
      inv({ id: 'old', total: 100, created_at: '2026-01-01T00:00:00Z' }),
      inv({ id: 'new', total: 100, created_at: '2026-06-01T00:00:00Z' }),
    ]);
    expect(chosen?.id).toBe('new');
  });

  it('returns null when every invoice is void', () => {
    expect(selectPrimaryInvoice([inv({ status: 'void' }), inv({ status: 'void' })])).toBeNull();
  });
});

describe('formatMoney', () => {
  it('rounds to whole dollars with a $ prefix', () => {
    expect(formatMoney(42)).toBe('$42');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(149.5)).toBe('$150');
    expect(formatMoney(149.49)).toBe('$149');
  });

  it('groups thousands', () => {
    expect(formatMoney(1000)).toBe('$1,000');
    expect(formatMoney(1234567)).toBe('$1,234,567');
  });

  // A loss is "-$1,500", not "$-1,500". Insights shows a negative gross profit,
  // job margin a negative profit, and a client statement a negative balance.
  it('puts the sign outside the currency symbol', () => {
    expect(formatMoney(-1500)).toBe('-$1,500');
    expect(formatMoney(-0.4)).toBe('$0');
    expect(formatMoney(-1)).toBe('-$1');
  });
});
