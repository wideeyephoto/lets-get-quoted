import { describe, it, expect } from 'vitest';
import {
  calculatePitchMultiplier,
  categorizePitch,
  calculateRoofGeometry,
  measureRoofFromAddress,
} from '../src/lib/measurements/roof-measurement-engine';

describe('Aerial Rooftop Measurement & Geometry Engine', () => {
  describe('Pitch Multiplier & Slope Categorization', () => {
    it('calculates correct geometric multipliers across standard pitches', () => {
      // 0/12 -> 1.0
      expect(calculatePitchMultiplier(0)).toBe(1.0);
      // 4/12 -> sqrt(1 + (4/12)^2) = sqrt(1.1111) = 1.054
      expect(calculatePitchMultiplier(4)).toBe(1.054);
      // 6/12 -> sqrt(1 + (6/12)^2) = sqrt(1.25) = 1.118
      expect(calculatePitchMultiplier(6)).toBe(1.118);
      // 8/12 -> sqrt(1 + (8/12)^2) = sqrt(1.4444) = 1.202
      expect(calculatePitchMultiplier(8)).toBe(1.202);
      // 12/12 -> sqrt(1 + 1) = sqrt(2) = 1.414
      expect(calculatePitchMultiplier(12)).toBe(1.414);
    });

    it('categorizes pitch slopes correctly', () => {
      expect(categorizePitch(2).category).toBe('flat');
      expect(categorizePitch(4).category).toBe('low_slope');
      expect(categorizePitch(6).category).toBe('standard');
      expect(categorizePitch(8).category).toBe('steep');
      expect(categorizePitch(12).category).toBe('extreme');
    });
  });

  describe('Roof Geometry & Material Takeoffs', () => {
    it('computes 3D surface area, waste factor, and bundles for a 2,000 sq ft footprint', () => {
      const report = calculateRoofGeometry({
        footprintSqFt: 2000,
        pitchNumerator: 6,
        complexity: 'moderate',
      });

      expect(report.summary.trueRoofSurfaceSqFt).toBeGreaterThan(2000);
      expect(report.summary.trueRoofSquares).toBeGreaterThan(20);
      expect(report.summary.suggestedWastePercent).toBe(12.5);
      expect(report.summary.grossSquaresWithWaste).toBeGreaterThan(report.summary.trueRoofSquares);
      expect(report.summary.bundleCount).toBe(Math.ceil(report.summary.grossSquaresWithWaste * 3));

      // Linear measurements
      expect(report.linearMeasurements.eavesFeet).toBeGreaterThan(0);
      expect(report.linearMeasurements.dripEdgeFeet).toBeGreaterThan(report.linearMeasurements.eavesFeet);
      expect(report.linearMeasurements.ridgeFeet).toBeGreaterThan(0);
      expect(report.linearMeasurements.valleysFeet).toBeGreaterThan(0);

      // Material Takeoff Estimates
      expect(report.materialTakeoffEstimates.shingleBundles).toBe(report.summary.bundleCount);
      expect(report.materialTakeoffEstimates.syntheticUnderlaymentRolls).toBeGreaterThan(1);
      expect(report.materialTakeoffEstimates.iceAndWaterRolls).toBeGreaterThan(0);
      expect(report.materialTakeoffEstimates.dripEdgePieces).toBeGreaterThan(10);
    });

    it('measures roof from address and home square footage', () => {
      const addressReport = measureRoofFromAddress('1500 N Main St, Royal Oak, MI 48067', {
        livingSquareFootage: 2400,
        stories: 2,
        pitchNumerator: 8,
        complexity: 'complex',
      });

      expect(addressReport.propertyAddress).toBe('1500 N Main St, Royal Oak, MI 48067');
      expect(addressReport.pitch.slopeRatio).toBe('8/12');
      expect(addressReport.pitch.multiplier).toBe(1.202);
      expect(addressReport.complexity).toBe('complex');
      expect(addressReport.summary.suggestedWastePercent).toBe(15);
    });
  });
});
