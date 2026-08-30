import { describe, it, expect } from 'vitest';
import {
  scanForSensitiveIdentifiers,
  containsSensitiveIdentifiers,
  assertNoSensitiveIdentifiers,
  redactSensitiveIdentifiers,
  DlpValidationError,
} from '../src/lib/dlp';

describe('DLP: SSN Detection', () => {
  it('detects formatted SSNs (XXX-XX-XXXX)', () => {
    const text = 'Subcontractor John Doe SSN is 123-45-6789.';
    const findings = scanForSensitiveIdentifiers(text);

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe('ssn');
    expect(findings[0].maskedMatch).toBe('•••-••-6789');
  });

  it('detects formatted SSNs with spaces (XXX XX XXXX)', () => {
    const text = 'Tax ID: 123 45 6789';
    const findings = scanForSensitiveIdentifiers(text);

    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.type === 'ssn')).toBe(true);
  });

  it('detects labeled 9-digit SSN (SSN: 123456789)', () => {
    const text = 'Note: ssn: 123456789 on file';
    const findings = scanForSensitiveIdentifiers(text);

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe('ssn');
  });
});

describe('DLP: EIN Detection', () => {
  it('detects formatted EIN (XX-XXXXXXX)', () => {
    const text = 'Acme Corp EIN: 12-3456789 for 1099';
    const findings = scanForSensitiveIdentifiers(text);

    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.type === 'ein')).toBe(true);
  });
});

describe('DLP: Safe Inputs (No False Positives)', () => {
  it('allows standard US phone numbers without false positive', () => {
    const text = 'Call client at (555) 123-4567 or 555-987-6543';
    const findings = scanForSensitiveIdentifiers(text);

    expect(findings.length).toBe(0);
    expect(containsSensitiveIdentifiers(text)).toBe(false);
  });

  it('allows standard addresses, zip codes, and item descriptions', () => {
    const text = '123 Main St, Springfield, IL 62701. Installed 500 ft copper pipe #482910.';
    const findings = scanForSensitiveIdentifiers(text);

    expect(findings.length).toBe(0);
  });
});

describe('DLP: Boundary Assertion & Redaction', () => {
  it('throws DlpValidationError on sensitive input', () => {
    expect(() => {
      assertNoSensitiveIdentifiers('Contractor SSN is 123-45-6789', 'Notes');
    }).toThrowError(/Notes contains sensitive confidential data/);
  });

  it('scans nested objects and arrays', () => {
    const nested = {
      description: 'Clean description',
      metadata: {
        rawNotes: ['All good', 'Sub EIN: 12-3456789'],
      },
    };

    expect(() => {
      assertNoSensitiveIdentifiers(nested, 'Payload');
    }).toThrow(DlpValidationError);
  });

  it('redacts sensitive identifiers cleanly for logging', () => {
    const raw = 'John Doe SSN 123-45-6789 and Corp EIN 12-3456789';
    const redacted = redactSensitiveIdentifiers(raw);

    expect(redacted).toBe('John Doe SSN [REDACTED_SSN] and Corp EIN [REDACTED_EIN]');
  });
});
