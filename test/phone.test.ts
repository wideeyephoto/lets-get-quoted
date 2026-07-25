import { describe, it, expect } from 'vitest';
import { normalizeUsPhone, displayPhone, formatPhoneDashes } from '@/lib/phone';

describe('normalizeUsPhone', () => {
  it('normalizes a formatted 10-digit US number to E.164', () => {
    expect(normalizeUsPhone('(517) 555-1234')).toBe('+15175551234');
    expect(normalizeUsPhone('517-555-1234')).toBe('+15175551234');
    expect(normalizeUsPhone('5175551234')).toBe('+15175551234');
  });

  it('accepts an 11-digit number that starts with the US country code', () => {
    expect(normalizeUsPhone('15175551234')).toBe('+15175551234');
    expect(normalizeUsPhone('1 (517) 555-1234')).toBe('+15175551234');
  });

  it('passes through a valid +-prefixed international number', () => {
    expect(normalizeUsPhone('+44 7911 123456')).toBe('+447911123456');
  });

  it('rejects too-short or ambiguous input', () => {
    expect(normalizeUsPhone('12345')).toBeNull();
    expect(normalizeUsPhone('555-1234')).toBeNull();
    // 11 digits not starting with 1, no + → not a US number
    expect(normalizeUsPhone('25175551234')).toBeNull();
    expect(normalizeUsPhone('')).toBeNull();
  });
});

describe('displayPhone', () => {
  it('formats an E.164 US number for humans', () => {
    expect(displayPhone('+15175551234')).toBe('(517) 555-1234');
  });
  it('returns non-US E.164 numbers unchanged', () => {
    expect(displayPhone('+447911123456')).toBe('+447911123456');
  });
});

describe('formatPhoneDashes', () => {
  it('renders 10- and 11-digit numbers as dashed', () => {
    expect(formatPhoneDashes('+15175551234')).toBe('517-555-1234');
    expect(formatPhoneDashes('5175551234')).toBe('517-555-1234');
    expect(formatPhoneDashes('15175551234')).toBe('517-555-1234');
  });
  it('returns empty string for null/undefined', () => {
    expect(formatPhoneDashes(null)).toBe('');
    expect(formatPhoneDashes(undefined)).toBe('');
  });
});
