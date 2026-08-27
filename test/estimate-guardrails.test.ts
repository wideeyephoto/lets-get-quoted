import { describe, it, expect } from 'vitest';
import {
  applyEstimateGuardrails,
  checkSafetyInspectionRequired,
  DEFAULT_MAX_ESTIMATE_RATIO,
} from '@/lib/estimate-guardrails';

describe('estimate-guardrails', () => {
  describe('checkSafetyInspectionRequired', () => {
    it('detects structural and hazard keywords', () => {
      expect(checkSafetyInspectionRequired('Removing an asbestos pipe wrap in basement').required).toBe(true);
      expect(checkSafetyInspectionRequired('Fixing a leak near a load-bearing wall').required).toBe(true);
      expect(checkSafetyInspectionRequired('Suspected gas leak behind the kitchen stove').required).toBe(true);
      expect(checkSafetyInspectionRequired('Standard toilet flange replacement').required).toBe(false);
    });
  });

  describe('applyEstimateGuardrails', () => {
    it('allows clean estimates within sensible spread ratios', () => {
      const outcome = applyEstimateGuardrails({
        minCents: 45000,
        maxCents: 85000,
        description: 'Install 50 gallon water heater',
      });

      expect(outcome.valid).toBe(true);
      expect(outcome.withheld).toBe(false);
      expect(outcome.minCents).toBe(45000);
      expect(outcome.maxCents).toBe(85000);
      expect(outcome.inspectionRequired).toBe(false);
    });

    it('withholds ranges with excessive spread ratios', () => {
      // $500 to $3,000 is a 6x ratio (exceeds default 2.5)
      const outcome = applyEstimateGuardrails({
        minCents: 50000,
        maxCents: 300000,
        description: 'Fix roof leaks and replace rotten decking',
        maxRatio: DEFAULT_MAX_ESTIMATE_RATIO,
      });

      expect(outcome.valid).toBe(false);
      expect(outcome.withheld).toBe(true);
      expect(outcome.withheldReason).toContain('Range variance too wide');
      expect(outcome.inspectionRequired).toBe(true);
    });

    it('withholds estimate when hazardous or safety-critical work is identified', () => {
      const outcome = applyEstimateGuardrails({
        minCents: 50000,
        maxCents: 90000,
        description: 'Remove black mold behind the shower wall',
      });

      expect(outcome.valid).toBe(false);
      expect(outcome.withheld).toBe(true);
      expect(outcome.withheldReason).toContain('safety or structural complexity');
      expect(outcome.inspectionRequired).toBe(true);
    });

    it('withholds estimate when job matches contractor exclusions', () => {
      const outcome = applyEstimateGuardrails({
        minCents: 30000,
        maxCents: 50000,
        description: 'Repair window AC unit in mobile home',
        exclusions: ['mobile homes', 'window AC units'],
      });

      expect(outcome.valid).toBe(false);
      expect(outcome.withheld).toBe(true);
      expect(outcome.withheldReason).toContain('Work matches excluded service');
      expect(outcome.inspectionRequired).toBe(true);
    });

    it('respects configured floor and ceiling bounds', () => {
      const outcome = applyEstimateGuardrails({
        minCents: 20000,
        maxCents: 40000,
        description: 'Minor drywall patch',
        absoluteMinCents: 35000,
        absoluteMaxCents: 100000,
      });

      expect(outcome.valid).toBe(true);
      expect(outcome.minCents).toBe(35000);
      expect(outcome.maxCents).toBe(40000);
    });

    it('withholds estimate if below ceiling is violated', () => {
      const outcome = applyEstimateGuardrails({
        minCents: 500000,
        maxCents: 800000,
        description: 'Whole home repipe',
        absoluteMaxCents: 250000,
      });

      expect(outcome.valid).toBe(false);
      expect(outcome.withheld).toBe(true);
      expect(outcome.withheldReason).toContain('exceeds configured remote estimate ceiling');
    });
  });
});
