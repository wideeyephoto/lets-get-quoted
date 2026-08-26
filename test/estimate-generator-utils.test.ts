import { describe, it, expect } from 'vitest';
import {
  calculateEstimateTotals,
  clampPercentage,
  clampQuantity,
  clampUnitPrice,
  formatCurrency,
  generateEstimateNumber,
  getTodaysDateString,
  getInitialBlankEstimate,
  getInitialExampleEstimate,
  formatEstimateSummaryText,
  type LineItem,
} from '@/lib/tools/estimate-generator-utils';

describe('estimate-generator-utils', () => {
  describe('clampPercentage', () => {
    it('clamps numbers within 0 and 100', () => {
      expect(clampPercentage(50)).toBe(50);
      expect(clampPercentage(-5)).toBe(0);
      expect(clampPercentage(125)).toBe(100);
      expect(clampPercentage(0)).toBe(0);
      expect(clampPercentage(100)).toBe(100);
    });

    it('handles string input and NaN gracefully', () => {
      expect(clampPercentage('8.25')).toBe(8.25);
      expect(clampPercentage('abc', 10)).toBe(10);
      expect(clampPercentage(null, 0)).toBe(0);
      expect(clampPercentage(undefined, 5)).toBe(5);
    });
  });

  describe('clampQuantity', () => {
    it('clamps quantity to positive values', () => {
      expect(clampQuantity(5)).toBe(5);
      expect(clampQuantity(0, 1)).toBe(1);
      expect(clampQuantity(-3, 1)).toBe(1);
      expect(clampQuantity(2.5)).toBe(2.5);
    });

    it('handles NaN and strings', () => {
      expect(clampQuantity('3')).toBe(3);
      expect(clampQuantity('invalid', 1)).toBe(1);
    });
  });

  describe('clampUnitPrice', () => {
    it('clamps unit price to zero or greater', () => {
      expect(clampUnitPrice(150)).toBe(150);
      expect(clampUnitPrice(0)).toBe(0);
      expect(clampUnitPrice(-50)).toBe(0);
      expect(clampUnitPrice(99.99)).toBe(99.99);
    });

    it('handles invalid inputs', () => {
      expect(clampUnitPrice('invalid', 0)).toBe(0);
      expect(clampUnitPrice(null, 0)).toBe(0);
    });
  });

  describe('calculateEstimateTotals', () => {
    it('calculates subtotal, tax amount, grand total, and deposit due correctly', () => {
      const items: LineItem[] = [
        { id: '1', description: 'Labor', type: 'Labor', quantity: 2, unitPrice: 100 }, // 200
        { id: '2', description: 'Materials', type: 'Material', quantity: 1, unitPrice: 300 }, // 300
      ];
      const totals = calculateEstimateTotals(items, 10, 20); // 10% tax, 20% deposit

      expect(totals.subtotal).toBe(500);
      expect(totals.taxAmount).toBe(50);
      expect(totals.grandTotal).toBe(550);
      expect(totals.depositDue).toBe(110);
    });

    it('handles zero tax and zero deposit', () => {
      const items: LineItem[] = [
        { id: '1', description: 'Labor', type: 'Labor', quantity: 1, unitPrice: 250 },
      ];
      const totals = calculateEstimateTotals(items, 0, 0);

      expect(totals.subtotal).toBe(250);
      expect(totals.taxAmount).toBe(0);
      expect(totals.grandTotal).toBe(250);
      expect(totals.depositDue).toBe(0);
    });

    it('guards against negative or corrupted inputs', () => {
      const items: LineItem[] = [
        { id: '1', description: 'Bad item', type: 'Labor', quantity: -2, unitPrice: -100 },
      ];
      const totals = calculateEstimateTotals(items, -10, -50);

      expect(totals.subtotal).toBe(0);
      expect(totals.taxAmount).toBe(0);
      expect(totals.grandTotal).toBe(0);
      expect(totals.depositDue).toBe(0);
    });
  });

  describe('currency formatting', () => {
    it('formats numbers as USD', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCurrency(NaN)).toBe('$0.00');
    });
  });

  describe('date and estimate number generator', () => {
    it('generates a valid YYYY-MM-DD date', () => {
      const date = getTodaysDateString();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('generates an estimate number starting with EST-', () => {
      const estNo = generateEstimateNumber();
      expect(estNo).toMatch(/^EST-\d{4}-\d{3}$/);
    });
  });

  describe('preset initialization', () => {
    it('returns a valid blank estimate preset', () => {
      const blank = getInitialBlankEstimate();
      expect(blank.isSample).toBe(false);
      expect(blank.contractorName).toBe('');
      expect(blank.items.length).toBeGreaterThan(0);
      expect(blank.estimateNumber).toMatch(/^EST-/);
      expect(blank.estimateDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns a valid example estimate preset', () => {
      const example = getInitialExampleEstimate();
      expect(example.isSample).toBe(true);
      expect(example.contractorName).toBe('Apex Trade Solutions');
      expect(example.items.length).toBe(3);
    });
  });

  describe('formatEstimateSummaryText', () => {
    it('formats clean text for clipboard / SMS export', () => {
      const example = getInitialExampleEstimate();
      const totals = calculateEstimateTotals(example.items, example.taxRate, example.depositPct);
      const text = formatEstimateSummaryText(example, totals);

      expect(text).toContain(`ESTIMATE #${example.estimateNumber}`);
      expect(text).toContain('Apex Trade Solutions');
      expect(text).toContain('Sarah Jenkins');
      expect(text).toContain('Initial Diagnostic & Site Inspection');
      expect(text).toContain(`TOTAL AMOUNT: ${formatCurrency(totals.grandTotal)}`);
      expect(text).toContain(`Deposit Required (${example.depositPct}%)`);
    });
  });
});
