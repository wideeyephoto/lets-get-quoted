import { describe, expect, it } from 'vitest';
import {
  calculateSatellitePropertyDimensions,
  calculateSatellitePropertyDimensionsFromIntel,
  calculateSatelliteInstantEstimateBracket,
  generateInstantAiEstimateWithClusterDiscount,
  ROOF_PITCH_MULTIPLIERS,
} from '@/lib/satellite-property-sizing';

describe('Instant Satellite Property Sizing — Geometry & Envelope Math', () => {
  it('calculates roof squares and pitch multipliers accurately for standard pitches', () => {
    // 2,000 sq ft ground footprint with a 6/12 pitch (1.118 multiplier) and 12% waste factor
    const dims = calculateSatellitePropertyDimensions({
      footprintSqFt: 2000,
      roofPitch: '6/12',
      stories: 2,
    });

    expect(dims.pitchMultiplier).toBe(ROOF_PITCH_MULTIPLIERS['6/12']);
    expect(dims.roofSquares).toBeGreaterThan(25);
    expect(dims.roofSquares).toBeLessThan(32);
    expect(dims.perimeterLinearFt).toBeGreaterThan(150);
    expect(dims.gutterLinearFt).toBeGreaterThan(120);
    expect(dims.sidingWallSqFt).toBeGreaterThan(2000);
    expect(dims.hvacRecommendedTons).toBeGreaterThanOrEqual(3.0);
  });

  it('handles steep pitch adjustments (10/12 pitch)', () => {
    const steep = calculateSatellitePropertyDimensions({
      footprintSqFt: 1800,
      roofPitch: '10/12',
    });

    const standard = calculateSatellitePropertyDimensions({
      footprintSqFt: 1800,
      roofPitch: '4/12',
    });

    // 10/12 pitch must yield significantly more roof area/squares than a 4/12 pitch for same footprint
    expect(steep.roofSquares).toBeGreaterThan(standard.roofSquares);
    expect(steep.pitchMultiplier).toBe(ROOF_PITCH_MULTIPLIERS['10/12']);
  });
});

describe('Instant Satellite Property Sizing — Trade Estimate Brackets', () => {
  it('computes accurate price brackets for Roofing based on roof squares', () => {
    const dims = calculateSatellitePropertyDimensions({ footprintSqFt: 1800, roofPitch: '6/12' });
    const bracket = calculateSatelliteInstantEstimateBracket('Roofing', dims);

    expect(bracket.trade).toBe('Roof Replacement');
    expect(bracket.unitOfMeasurement).toContain('squares');
    expect(bracket.lowDollars).toBe(Math.round(dims.roofSquares * 425));
    expect(bracket.highDollars).toBe(Math.round(dims.roofSquares * 650));
    expect(bracket.dimensionSummary).toContain('squares');
    expect(bracket.dimensionSummary).toContain('6/12');
  });

  it('computes accurate price brackets for HVAC based on recommended tonnage', () => {
    const dims = calculateSatellitePropertyDimensions({ footprintSqFt: 2200, stories: 2 });
    const bracket = calculateSatelliteInstantEstimateBracket('HVAC', dims);

    expect(bracket.trade).toBe('HVAC Complete System Replacement');
    expect(bracket.quantity).toBe(dims.hvacRecommendedTons);
    expect(bracket.lowDollars).toBe(Math.round(dims.hvacRecommendedTons * 2400));
    expect(bracket.highDollars).toBe(Math.round(dims.hvacRecommendedTons * 3800));
  });

  it('computes accurate price brackets for Seamless Gutters based on linear footage', () => {
    const dims = calculateSatellitePropertyDimensions({ footprintSqFt: 1500 });
    const bracket = calculateSatelliteInstantEstimateBracket('Gutters', dims);

    expect(bracket.trade).toBe('Seamless Gutters & Guards');
    expect(bracket.quantity).toBe(dims.gutterLinearFt);
    expect(bracket.lowDollars).toBe(Math.round(dims.gutterLinearFt * 12));
    expect(bracket.highDollars).toBe(Math.round(dims.gutterLinearFt * 22));
  });
});

describe('AI Instant Estimate with Cluster Pricing & Viral Street Sharing', () => {
  it('generates a complete AI instant estimate response with satellite sizing, group discounts, and viral link', () => {
    const estimate = generateInstantAiEstimateWithClusterDiscount({
      address: '1428 Maple Ave, Rochester, MI 48307',
      subdivisionName: 'Oakridge Estates',
      trade: 'Roofing',
      businessName: 'Apex Roofing Experts',
      customerName: 'Sarah Jenkins',
      footprintSqFt: 1800,
      roofPitch: '6/12',
      activeClusterHomes: 1, // 1st home on street
      domainUrl: 'apexroofing.com',
      batchDate: 'Friday',
    });

    // 1. Satellite Sizing Information
    expect(estimate.summaryMarkdown).toContain('Instant Aerial Satellite Sizing for Maple Ave');
    expect(estimate.summaryMarkdown).toContain('Oakridge Estates');
    expect(estimate.dimensions.roofSquares).toBeGreaterThan(20);

    // 2. Street Cluster Discount
    expect(estimate.clusterDiscount.activeDiscountDollars).toBe(100);
    expect(estimate.clusterDiscount.nextDiscountDollars).toBe(100); // 2nd home triggers $100
    expect(estimate.summaryMarkdown).toContain('Active Street Cluster Group Pricing');
    expect(estimate.summaryMarkdown).toContain('Maple Ave');

    // 3. Viral Share Link & Pre-Drafted Copy
    expect(estimate.viralShare.shareLink).toBe('https://apexroofing.com/street/maple-ave?ref=neighbor_cluster');
    expect(estimate.viralShare.smsText).toContain('Maple Ave');
    expect(estimate.viralShare.smsText).toContain('Apex Roofing Experts');
    expect(estimate.viralShare.hoaPostText).toContain('Oakridge Estates');
    expect(estimate.viralShare.hoaPostText).toContain('Friday');

    // 4. Same-Day Street Batching Callout
    expect(estimate.sameDayBatching.isAvailable).toBe(true);
    expect(estimate.sameDayBatching.batchDate).toBe('Friday');
    expect(estimate.sameDayBatching.callout).toContain('Maple Ave');
    expect(estimate.sameDayBatching.callout).toContain('Friday');
  });

  it('updates discount and milestones when 2 homes are already active on the street', () => {
    const estimate = generateInstantAiEstimateWithClusterDiscount({
      address: '1500 Maple Ave, Rochester, MI 48307',
      trade: 'Roofing',
      businessName: 'Apex Roofing Experts',
      activeClusterHomes: 2, // 2 homes already participating
    });

    // Tier 1 active ($100 off), next tier is $250 off
    expect(estimate.clusterDiscount.activeDiscountDollars).toBe(100);
    expect(estimate.clusterDiscount.nextDiscountDollars).toBe(250);
    expect(estimate.clusterDiscount.nextMilestoneHomes).toBe(1); // 1 more needed for 3-home tier
    expect(estimate.summaryMarkdown).toContain('$250 Total Savings');
    expect(estimate.summaryMarkdown).toContain('1 more neighbor');
  });
});

describe('Instant Satellite Property Sizing — Fallback & Confidence Integrity', () => {
  it('correctly marks confidence as estimated_fallback when footprintSqFt is omitted', () => {
    const dims = calculateSatellitePropertyDimensions({});
    expect(dims.footprintSqFt).toBe(1800);
    expect(dims.confidence).toBe('estimated_fallback');
    expect(dims.isEstimatedFallback).toBe(true);
  });

  it('correctly marks confidence as high_satellite when footprintSqFt is explicitly passed', () => {
    const dims = calculateSatellitePropertyDimensions({ footprintSqFt: 2400 });
    expect(dims.footprintSqFt).toBe(2400);
    expect(dims.confidence).toBe('high_satellite');
    expect(dims.isEstimatedFallback).toBe(false);
  });

  it('generates truthful copy when dimensions rely on fallback', () => {
    const estimate = generateInstantAiEstimateWithClusterDiscount({
      address: '742 Evergreen Terrace, Springfield',
      trade: 'Roofing',
      businessName: 'Springfield Roofing',
      // no footprintSqFt provided
    });

    expect(estimate.dimensions.isEstimatedFallback).toBe(true);
    expect(estimate.dimensions.confidence).toBe('estimated_fallback');
    expect(estimate.summaryMarkdown).toContain('Estimated Property Sizing');
    expect(estimate.summaryMarkdown).not.toContain('Instant Aerial Satellite Sizing');
  });

  it('derives sizing dimensions from PropertyIntelligence summary accurately', () => {
    const fromSolar = calculateSatellitePropertyDimensionsFromIntel({
      groundFootprintSqFt: 1950,
      dominantPitch: '6/12',
      stories: 2,
    });
    expect(fromSolar.footprintSqFt).toBe(1950);
    expect(fromSolar.confidence).toBe('high_satellite');
    expect(fromSolar.isEstimatedFallback).toBe(false);

    const fromRecords = calculateSatellitePropertyDimensionsFromIntel({
      livingAreaSqFt: 2400,
      stories: 2,
    });
    expect(fromRecords.footprintSqFt).toBe(1200);
    expect(fromRecords.confidence).toBe('medium_records');
    expect(fromRecords.isEstimatedFallback).toBe(false);

    const empty = calculateSatellitePropertyDimensionsFromIntel({});
    expect(empty.confidence).toBe('estimated_fallback');
    expect(empty.isEstimatedFallback).toBe(true);
  });
});

