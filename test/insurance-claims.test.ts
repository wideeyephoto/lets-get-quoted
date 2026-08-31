import { describe, expect, it } from 'vitest';
import {
  extractClaimFiguresFromText,
  detectScopeDiscrepancies,
  buildSupplementAnalysis,
  generateAdjusterLetterDraft,
  evaluateDamageClaimFeasibilityHeuristic,
  HOMEOWNER_CLAIM_FAQS,
} from '@/lib/insurance-claims';

describe('insurance-claims.ts', () => {
  const SAMPLE_ADJUSTER_SCOPE = `
    STATE FARM INSURANCE
    CLAIM NUMBER: 49-8821-X01
    TOTAL REPLACEMENT COST VALUE (RCV): $12,450.00
    LESS DEPRECIATION: ($3,200.00)
    ACTUAL CASH VALUE (ACV): $9,250.00
    LESS DEDUCTIBLE: ($1,500.00)
    NET PAYMENT: $7,750.00

    Scope of Work:
    1. Tear off existing asphalt composition shingles (32 SQ) - $1,600.00
    2. Install 3-tab 25yr composition shingles (32 SQ) - $7,040.00
    3. Install synthetic felt underlayment (32 SQ) - $640.00
  `;

  describe('extractClaimFiguresFromText', () => {
    it('correctly parses RCV, ACV, Depreciation, Deductible, and Net Claim figures', () => {
      const figures = extractClaimFiguresFromText(SAMPLE_ADJUSTER_SCOPE);
      expect(figures.rcv).toBe(12450);
      expect(figures.depreciation).toBe(3200);
      expect(figures.acv).toBe(9250);
      expect(figures.deductible).toBe(1500);
      expect(figures.netClaim).toBe(7750);
    });

    it('gracefully handles missing figures or empty strings', () => {
      const figures = extractClaimFiguresFromText('');
      expect(figures.rcv).toBeNull();
      expect(figures.acv).toBeNull();
    });
  });

  describe('detectScopeDiscrepancies', () => {
    it('detects missing drip edge, starter strip, and ice & water shield from incomplete scope', () => {
      const discrepancies = detectScopeDiscrepancies(SAMPLE_ADJUSTER_SCOPE, 'roofers');
      expect(discrepancies.length).toBeGreaterThan(0);

      const items = discrepancies.map((d) => d.item.toLowerCase());
      expect(items.some((name) => name.includes('drip edge'))).toBe(true);
      expect(items.some((name) => name.includes('ice & water') || name.includes('starter'))).toBe(true);
    });
  });

  describe('buildSupplementAnalysis', () => {
    it('calculates total recoverable supplements and adjusted RCV', () => {
      const analysis = buildSupplementAnalysis(SAMPLE_ADJUSTER_SCOPE, 'roofers');
      expect(analysis.parsedFigures.rcv).toBe(12450);
      expect(analysis.totalEstimatedSupplement).toBeGreaterThan(1000);
      expect(analysis.adjustedTotalRcv).toBe(12450 + analysis.totalEstimatedSupplement);
      expect(analysis.justificationDraft).toContain('Building Code Supplements');
      expect(analysis.justificationDraft).toContain('IRC');
    });
  });

  describe('generateAdjusterLetterDraft', () => {
    it('formats a professional, UPPA-compliant dispute letter citing claim and codes', () => {
      const letter = generateAdjusterLetterDraft({
        tradeSlug: 'roofers',
        claimNumber: 'CLM-778899',
        policyholderName: 'Jane Doe',
        propertyAddress: '789 Oak Ridge Ave',
        carrierName: 'Travelers',
        initialRcv: 10000,
        discrepancies: [
          {
            id: 'supp-1',
            item: 'Drip Edge (Eaves & Rakes)',
            codeCitation: 'IRC R905.2.8.5',
            reason: 'Omitted from scope; required by current local building code.',
            category: 'code_compliance',
            estimatedCost: 650,
            selected: true,
          },
        ],
      });

      expect(letter).toContain('CLM-778899');
      expect(letter).toContain('Jane Doe');
      expect(letter).toContain('789 Oak Ridge Ave');
      expect(letter).toContain('IRC R905.2.8.5');
      expect(letter).toContain('$650');
    });
  });

  describe('evaluateDamageClaimFeasibilityHeuristic', () => {
    it('rates high viability for severe hail / storm damage with high costs', () => {
      const result = evaluateDamageClaimFeasibilityHeuristic({
        tradeSlug: 'roofers',
        damageDescription: 'Severe baseball sized hail punched holes through shingles and dented gutters everywhere',
        reportedPeril: 'Hail Storm',
        approxAgeYears: 8,
        knownDeductible: 1000,
      });

      expect(result.feasibilityScore).toBeGreaterThanOrEqual(70);
      expect(result.probability).toBe('high');
      expect(result.recommendation).toBe('file_claim');
      expect(result.detectedPerils.some((p) => p.includes('Hail'))).toBe(true);
    });

    it('rates low viability / recommends out-of-pocket for age-related wear & tear', () => {
      const result = evaluateDamageClaimFeasibilityHeuristic({
        tradeSlug: 'roofers',
        damageDescription: 'Old shingles have heavy moss growth and general rotted aging',
        reportedPeril: 'General Age',
        approxAgeYears: 25,
        knownDeductible: 1500,
      });

      expect(result.feasibilityScore).toBeLessThan(50);
      expect(result.probability).toBe('low');
      expect(result.recommendation).toBe('out_of_pocket_maintenance');
      expect(result.riskFactors.length).toBeGreaterThan(0);
    });
  });

  describe('HOMEOWNER_CLAIM_FAQS', () => {
    it('provides clear answers for RCV vs ACV and deductible regulations', () => {
      expect(HOMEOWNER_CLAIM_FAQS.length).toBeGreaterThan(3);
      const rcvFaq = HOMEOWNER_CLAIM_FAQS.find((f) => f.question.includes('RCV and ACV'));
      expect(rcvFaq).toBeDefined();
      expect(rcvFaq?.detailedExplanation).toContain('Replacement Cost Value');

      const deductibleFaq = HOMEOWNER_CLAIM_FAQS.find((f) => f.question.includes('waive'));
      expect(deductibleFaq).toBeDefined();
      expect(deductibleFaq?.detailedExplanation).toContain('illegal');
    });
  });
});
