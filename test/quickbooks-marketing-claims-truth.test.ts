import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAPABILITIES } from '@/lib/product-truth';
import { ALL_FEATURES_CATALOG } from '@/lib/all-features-catalog';
import { TOP_20_DEFINITIVE_TRADES } from '@/lib/trade-deep-data';
import { CONTRACTOR_LIFECYCLE_STEPS } from '@/lib/contractor-lifecycle-emails';
import { COMPARISONS } from '@/app/compare/compare-data';

function readFile(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8');
}

describe('QuickBooks Marketing Claims & Architecture Truth', () => {
  it('ensures product-truth.ts accurately describes QuickBooks as 2-way sync', () => {
    expect(CAPABILITIES.quickbooks_sync.status).toBe('live');
    expect(CAPABILITIES.quickbooks_sync.name).toContain('2-Way Sync');
    expect(CAPABILITIES.quickbooks_sync.description).toMatch(/two-way|bidirectional/i);
    expect(CAPABILITIES.quickbooks_sync.description).toContain('pushes invoices and payments to QuickBooks');
    expect(CAPABILITIES.quickbooks_sync.description).toContain('pulls customers and payment reconciliations');
  });

  it('ensures all-features-catalog.ts describes QuickBooks export and sync as 2-way sync', () => {
    const qbFeature = ALL_FEATURES_CATALOG
      .flatMap((group) => group.features)
      .find((feat) => feat.id === 'quickbooks-export-sync');
    expect(qbFeature).toBeDefined();
    expect(qbFeature!.name).toContain('2-Way Sync');
    expect(qbFeature!.desc).toMatch(/two-way|2-way/i);
  });

  it('ensures FTC substantiation register reflects verified 2-way sync for CLM-007', () => {
    const ftcRegister = readFile('docs/ftc-substantiation-register.md');
    expect(ftcRegister).toContain('CLM-007');
    expect(ftcRegister).toContain('Official Intuit QuickBooks Online 2-Way Accounting Sync');
    expect(ftcRegister).toContain('Bi-directional OAuth 2.0 integration');
    expect(ftcRegister).toContain('VERIFIED');
  });
});

