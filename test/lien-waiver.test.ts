import { describe, expect, it } from 'vitest';
import {
  buildLienWaiverLegalText,
  generateLienWaiverDocument,
  selectLienWaiverType,
  LIEN_WAIVER_TITLES,
} from '@/lib/lien-waiver';

describe('Lien Waiver Statutory Generation', () => {
  const sampleParams = {
    claimantName: 'Summit Ridge Builders LLC',
    customerName: 'Marcus Sterling',
    propertyAddress: '742 Evergreen Terrace, Maplewood, NJ 07040',
    paymentAmount: 8450.50,
    throughDate: '2026-08-25',
    exceptions: ['Unapproved electrical change order #3 ($450)'],
  };

  it('generates Conditional Progress Waiver with statutory warning and exact sum', () => {
    const text = buildLienWaiverLegalText({
      ...sampleParams,
      type: 'conditional_progress',
    });

    expect(text).toContain('CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT');
    expect(text).toContain('Summit Ridge Builders LLC');
    expect(text).toContain('Marcus Sterling');
    expect(text).toContain('$8,450.50');
    expect(text).toContain('2026-08-25');
    expect(text).toContain('Exceptions: Unapproved electrical change order #3 ($450)');
    expect(text).toContain('EFFECTIVE ON RECEIPT OF PAYMENT');
  });

  it('generates Unconditional Progress Waiver with unconditional statutory warning', () => {
    const text = buildLienWaiverLegalText({
      ...sampleParams,
      type: 'unconditional_progress',
    });

    expect(text).toContain('UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT');
    expect(text).toContain('$8,450.50');
    expect(text).toContain('The undersigned has been paid and has received a progress payment');
  });

  it('generates Conditional Final Waiver for completion invoices', () => {
    const text = buildLienWaiverLegalText({
      ...sampleParams,
      type: 'conditional_final',
    });

    expect(text).toContain('CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT');
    expect(text).toContain('final payment');
    expect(text).toContain('$8,450.50');
  });

  it('generates Unconditional Final Waiver upon full 100% project settlement', () => {
    const text = buildLienWaiverLegalText({
      ...sampleParams,
      type: 'unconditional_final',
    });

    expect(text).toContain('UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT');
    expect(text).toContain('paid in full in the sum of $8,450.50');
    expect(text).toContain('property is fully released from all lien claims');
  });
});

describe('generateLienWaiverDocument', () => {
  it('creates structured document with exact money format and conditional flags', () => {
    const doc = generateLienWaiverDocument({
      type: 'conditional_progress',
      claimantName: 'BrokePipes LLC',
      customerName: 'Sarah Jenkins',
      jobRef: 'JOB-9021',
      propertyAddress: '123 Main St',
      paymentAmount: 2500,
    });

    expect(doc.id).toContain('LW-JOB-9021');
    expect(doc.formattedAmount).toBe('$2,500.00');
    expect(doc.isConditional).toBe(true);
    expect(doc.isFinal).toBe(false);
    expect(doc.title).toBe(LIEN_WAIVER_TITLES.conditional_progress);
  });
});

describe('selectLienWaiverType', () => {
  it('correctly maps milestone progress and clearance state', () => {
    expect(selectLienWaiverType(false, false)).toBe('conditional_progress');
    expect(selectLienWaiverType(false, true)).toBe('unconditional_progress');
    expect(selectLienWaiverType(true, false)).toBe('conditional_final');
    expect(selectLienWaiverType(true, true)).toBe('unconditional_final');
  });
});
