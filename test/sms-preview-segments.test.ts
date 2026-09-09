import { describe, expect, it } from 'vitest';
import { calculateSmsSegments } from '@/components/sms/SmsPreview';

describe('SMS preview carrier segment counts', () => {
  it('counts GSM extension characters as two units', () => {
    expect(calculateSmsSegments('^'.repeat(81))).toEqual({ count: 2, unicode: false });
    expect(calculateSmsSegments('€'.repeat(81))).toEqual({ count: 2, unicode: false });
  });

  it('does not split a two-unit emoji across multipart boundaries', () => {
    // 67-unit parts can hold only 33 of these emoji apiece.
    expect(calculateSmsSegments('🚪'.repeat(67))).toEqual({ count: 3, unicode: true });
  });

  it('recognizes accented GSM names and the exact single-part boundary', () => {
    expect(calculateSmsSegments('é'.repeat(160))).toEqual({ count: 1, unicode: false });
    expect(calculateSmsSegments('é'.repeat(161))).toEqual({ count: 2, unicode: false });
  });
});
