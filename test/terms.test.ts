import { describe, it, expect } from 'vitest';
import {
  TERMS_VERSION,
  PLACEHOLDER_BUSINESS_NAME,
  businessNameProblem,
  initialBusinessName,
  needsFirstRun,
  normalizeBusinessName,
  normalizePostalCode,
  postalCodeProblem,
} from '../src/lib/terms';

describe('needsFirstRun', () => {
  it('gates an account that has never accepted', () => {
    expect(needsFirstRun({ terms_accepted_at: null, terms_version: null })).toBe(true);
  });

  it('lets through an account on the current version', () => {
    expect(needsFirstRun({ terms_accepted_at: '2026-08-03T00:00:00Z', terms_version: TERMS_VERSION })).toBe(false);
  });

  it('re-gates when the document version moves on', () => {
    expect(needsFirstRun({ terms_accepted_at: '2026-01-01T00:00:00Z', terms_version: '2025-01-01' })).toBe(true);
  });

  it('gates an acceptance with no version recorded at all', () => {
    // Would mean a row written by something that skipped the version — treat it
    // as unaccepted rather than trusting a record that cannot be identified.
    expect(needsFirstRun({ terms_accepted_at: '2026-08-03T00:00:00Z', terms_version: null })).toBe(true);
  });

  it('does NOT gate when the account could not be read', () => {
    // The deploy-ahead-of-migration case. Failing closed here would lock every
    // owner out of their own dashboard over a deploy ordering mistake.
    expect(needsFirstRun(null)).toBe(false);
    expect(needsFirstRun(undefined)).toBe(false);
  });
});

describe('initialBusinessName', () => {
  it('treats the auto-provisioned placeholder as empty', () => {
    expect(initialBusinessName({ business_name: PLACEHOLDER_BUSINESS_NAME })).toBe('');
  });

  it('pre-fills a real name so accepting is one click', () => {
    expect(initialBusinessName({ business_name: 'Brookhaven Plumbing' })).toBe('Brookhaven Plumbing');
  });

  it('survives a missing account', () => {
    expect(initialBusinessName(null)).toBe('');
  });

  it('falls back to the site name, which is where the real name actually lives', () => {
    // Measured on the live DB: every account still reads the placeholder while
    // its site carries the name the owner typed in the builder.
    expect(initialBusinessName({ business_name: PLACEHOLDER_BUSINESS_NAME }, 'BrokePipes')).toBe('BrokePipes');
    expect(initialBusinessName(null, "Chelsea's Cleaning Service")).toBe("Chelsea's Cleaning Service");
  });

  it('prefers the account name when it is a real one', () => {
    expect(initialBusinessName({ business_name: 'Acme Roofing' }, 'Stale Site Name')).toBe('Acme Roofing');
  });

  it('does not offer the placeholder from either side', () => {
    expect(initialBusinessName({ business_name: PLACEHOLDER_BUSINESS_NAME }, PLACEHOLDER_BUSINESS_NAME)).toBe('');
  });
});

describe('businessNameProblem', () => {
  it('rejects empty and whitespace-only', () => {
    expect(businessNameProblem('')).toBeTruthy();
    expect(businessNameProblem('    ')).toBeTruthy();
  });

  it('rejects a single character', () => {
    expect(businessNameProblem('A')).toBeTruthy();
  });

  it('accepts a real name', () => {
    expect(businessNameProblem("Chelsea's Cleaning Service")).toBeNull();
  });

  it('collapses runs of whitespace when normalizing', () => {
    expect(normalizeBusinessName('  Acme   Roofing  ')).toBe('Acme Roofing');
  });
});

describe('postalCodeProblem', () => {
  it('accepts a 5-digit ZIP', () => {
    expect(postalCodeProblem('48226')).toBeNull();
  });

  it('accepts ZIP+4 in both spellings', () => {
    expect(postalCodeProblem('48226-1234')).toBeNull();
    expect(postalCodeProblem('482261234')).toBeNull();
  });

  it('rejects empty, short, and non-numeric', () => {
    expect(postalCodeProblem('')).toBeTruthy();
    expect(postalCodeProblem('482')).toBeTruthy();
    expect(postalCodeProblem('ABCDE')).toBeTruthy();
  });

  it('keeps a leading zero — 02134 is Boston, 2134 is nothing', () => {
    expect(postalCodeProblem('02134')).toBeNull();
    expect(normalizePostalCode('02134')).toBe('02134');
    // The bug this guards: anything that round-trips through a number loses it.
    expect(String(Number('02134'))).toBe('2134');
  });

  it('stores only the 5-digit prefix of a ZIP+4', () => {
    expect(normalizePostalCode('48226-1234')).toBe('48226');
  });
});
