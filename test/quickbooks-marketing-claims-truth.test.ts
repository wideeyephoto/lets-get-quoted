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
  it('ensures product-truth.ts accurately describes QuickBooks as direct ledger sync', () => {
    expect(CAPABILITIES.quickbooks_sync.status).toBe('live');
    expect(CAPABILITIES.quickbooks_sync.description).not.toMatch(/bi-directional|two-way|2-way/i);
    expect(CAPABILITIES.quickbooks_sync.description).toContain('pushing invoices, customers, and payments to QuickBooks');
  });

  it('ensures all-features-catalog.ts describes QuickBooks export and sync as direct push sync', () => {
    const qbFeature = ALL_FEATURES_CATALOG
      .flatMap((group) => group.features)
      .find((feat) => feat.id === 'quickbooks-export-sync');
    expect(qbFeature).toBeDefined();
    expect(qbFeature!.desc).not.toMatch(/two-way|2-way|bi-directional/i);
    expect(qbFeature!.desc).toContain('direct push sync');
  });

  it('ensures contractor lifecycle emails do not claim 2-way QuickBooks sync', () => {
    for (const step of CONTRACTOR_LIFECYCLE_STEPS) {
      expect(step.body).not.toMatch(/QuickBooks(?: Online)?\s+(?:2-Way|Two-Way|Bi-Directional)/i);
    }
  });

  it('ensures trade deep data FAQs do not claim 2-way reconciliation for QuickBooks', () => {
    for (const trade of Object.values(TOP_20_DEFINITIVE_TRADES)) {
      for (const faq of trade.faqs) {
        if (/quickbooks/i.test(faq.question)) {
          expect(faq.answer).not.toMatch(/2-way|two-way|bi-directional/i);
          expect(faq.answer).toContain('without manual double entry');
        }
      }
    }
  });

  it('ensures competitor comparison data does not claim 2-way QuickBooks sync', () => {
    for (const comp of Object.values(COMPARISONS)) {
      for (const pillar of comp.visualPillars) {
        for (const highlight of pillar.highlights) {
          if (/quickbooks/i.test(highlight)) {
            expect(highlight).not.toMatch(/2-way|two-way|bi-directional/i);
          }
        }
      }
      for (const faq of comp.faqs) {
        if (/quickbooks/i.test(faq.q)) {
          expect(faq.a).not.toMatch(/2-way|two-way|bi-directional/i);
        }
      }
    }
  });

  it('ensures public marketing pages do not claim 2-way QuickBooks sync', () => {
    const pricingExp = readFile('src/app/pricing/PricingExperience.tsx');
    expect(pricingExp).not.toContain('Two-Way QuickBooks Online Sync');
    expect(pricingExp).toContain('Direct QuickBooks Online Sync');

    const compareSwitcher = readFile('src/components/marketing/CompareTradeSwitcher.tsx');
    expect(compareSwitcher).not.toMatch(/2-way.*QuickBooks|QuickBooks.*2-way/i);

    const marketingAi = readFile('src/components/marketing/MarketingAiAssistant.tsx');
    expect(marketingAi).not.toMatch(/2-way synchronization with QuickBooks/i);

    const forExp = readFile('src/app/for/ForExperience.tsx');
    expect(forExp).not.toMatch(/Two-way real-time QuickBooks/i);
    expect(forExp).toContain('Direct real-time QuickBooks Online synchronization');

    const forMockup = readFile('src/app/for-mockup/ForMockupExperience.tsx');
    expect(forMockup).not.toMatch(/Two-way real-time QuickBooks/i);
    expect(forMockup).toContain('Direct real-time QuickBooks Online synchronization');
  });

  it('ensures FTC substantiation register reflects direct push sync for CLM-007', () => {
    const ftcRegister = readFile('docs/ftc-substantiation-register.md');
    expect(ftcRegister).toContain('CLM-007');
    expect(ftcRegister).not.toMatch(/CLM-007.*2-Way Accounting Sync/);
    expect(ftcRegister).not.toMatch(/CLM-007.*Bi-directional OAuth 2\.0/);
    expect(ftcRegister).toContain('Official Intuit QuickBooks Online Direct Accounting Sync');
    expect(ftcRegister).toContain('Direct push OAuth 2.0 integration');
  });
});
