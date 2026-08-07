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

describe('displayPhone and the shapes numbers actually arrive in', () => {
  // Supabase's auth user stores the phone as bare digits with no plus. That is
  // what Login & security renders, and it used to render it raw.
  it('formats the bare-digit form the auth user carries', () => {
    expect(displayPhone('15175551234')).toBe('(517) 555-1234');
  });

  it('formats a plain 10-digit number', () => {
    expect(displayPhone('5175551234')).toBe('(517) 555-1234');
  });

  it('is idempotent, so formatting something already formatted is harmless', () => {
    expect(displayPhone('(517) 555-1234')).toBe('(517) 555-1234');
  });

  it('still leaves anything it cannot read alone', () => {
    expect(displayPhone('')).toBe('');
    expect(displayPhone('ext. 214')).toBe('ext. 214');
    expect(displayPhone('+447911123456')).toBe('+447911123456');
  });
});
