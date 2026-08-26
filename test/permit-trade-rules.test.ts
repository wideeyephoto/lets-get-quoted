import { describe, it, expect } from 'vitest';
import { evaluatePermitRequirement } from '../src/lib/permit-intel/requirement-engine';
import { getApplicableCodes } from '../src/lib/permit-intel/code-catalog';

describe('Multi-Discipline Permit Requirement Rules & Codes', () => {
  const authorityId = 'mi-royal-oak';

  describe('Electrical Discipline Rules', () => {
    it('requires permit for EV charger and service upgrade', () => {
      const res = evaluatePermitRequirement(authorityId, {
        trade: 'electrical',
        scope: 'new_construction',
        freeTextDescription: 'Install 50A EV charger and subpanel',
      });

      expect(res.decision).toBe('required');
      expect(res.permitTypes).toContain('Residential Electrical Permit');
      expect(res.estimatedGovernmentFee?.estimatedTotal).toBeGreaterThan(0);
      expect(res.citations.some((c) => c.codeFamily.includes('NEC'))).toBe(true);
    });

    it('exempts minor switch or outlet device replacement', () => {
      const res = evaluatePermitRequirement(authorityId, {
        trade: 'electrical',
        scope: 'repair',
        freeTextDescription: 'Replace switch and light fixture in hallway',
      });

      expect(res.decision).toBe('not_required');
    });

    it('returns 2023 NEC / MEC Part 8 applicable codes', () => {
      const codes = getApplicableCodes(authorityId, 'electrical');
      expect(codes[0].codeFamily).toContain('Electrical');
      expect(codes[0].editionYear).toBe('2023');
    });
  });

  describe('Mechanical / HVAC Discipline Rules', () => {
    it('requires permit for furnace or heat pump replacement', () => {
      const res = evaluatePermitRequirement(authorityId, {
        trade: 'mechanical',
        scope: 'replacement',
        freeTextDescription: 'Replace 80k BTU furnace and 3-ton AC',
      });

      expect(res.decision).toBe('required');
      expect(res.permitTypes).toContain('Residential Mechanical Permit');
      expect(res.requiredDocuments).toContain('Equipment Sizing Load Calculation (ACCA Manual J/S)');
    });

    it('exempts ordinary filter change and thermostat replacement', () => {
      const res = evaluatePermitRequirement(authorityId, {
        trade: 'mechanical',
        scope: 'repair',
        freeTextDescription: 'Seasonal tune-up, change filter and smart thermostat',
      });

      expect(res.decision).toBe('not_required');
    });

    it('returns 2021 MMC applicable codes', () => {
      const codes = getApplicableCodes(authorityId, 'mechanical');
      expect(codes[0].codeFamily).toContain('Mechanical');
      expect(codes[0].editionYear).toBe('2021');
    });
  });

  describe('Plumbing Discipline Rules', () => {
    it('requires permit for water heater replacement', () => {
      const res = evaluatePermitRequirement(authorityId, {
        trade: 'plumbing',
        scope: 'replacement',
        freeTextDescription: 'Install 50 gallon natural gas water heater',
      });

      expect(res.decision).toBe('required');
      expect(res.permitTypes).toContain('Residential Plumbing Permit');
      expect(res.citations.some((c) => c.section.includes('P2804'))).toBe(true);
    });

    it('exempts clearing drain stoppage or replacing faucet washer', () => {
      const res = evaluatePermitRequirement(authorityId, {
        trade: 'plumbing',
        scope: 'repair',
        freeTextDescription: 'Faucet repair, replace toilet flapper and clear drain',
      });

      expect(res.decision).toBe('not_required');
    });

    it('returns 2021 MPC applicable codes', () => {
      const codes = getApplicableCodes(authorityId, 'plumbing');
      expect(codes[0].codeFamily).toContain('Plumbing');
      expect(codes[0].editionYear).toBe('2021');
    });
  });
});
