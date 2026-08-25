import { describe, it, expect } from 'vitest';
import {
  pitchDegreesToRatio,
  isSteepPitch,
  degreesToCompass,
  classifyRoofComplexity,
  sqMetersToSqFt,
  sqFtToRoofingSquares,
} from '../src/lib/property-intel/pitch-calc';
import { summarizePropertyIntelligence } from '../src/lib/property-intel/property-service';
import { buildDraftInstructions, type DraftContext } from '../src/lib/quote-draft-ai';
import type { PropertyIntelligence } from '../src/lib/property-intel/types';

describe('Property Intelligence - Pitch & Geometry Calculations', () => {
  it('converts pitch angles in degrees to standard X/12 ratios accurately', () => {
    // 0 degrees -> Flat (0/12)
    expect(pitchDegreesToRatio(0)).toBe('Flat (0/12)');
    expect(pitchDegreesToRatio(0.4)).toBe('Flat (0/12)');

    // 18.4 degrees -> 4/12
    expect(pitchDegreesToRatio(18.43)).toBe('4/12');

    // 26.56 degrees -> 6/12
    expect(pitchDegreesToRatio(26.56)).toBe('6/12');

    // 33.69 degrees -> 8/12
    expect(pitchDegreesToRatio(33.69)).toBe('8/12');

    // 39.8 degrees -> 10/12
    expect(pitchDegreesToRatio(39.8)).toBe('10/12');

    // 45 degrees -> 12/12
    expect(pitchDegreesToRatio(45)).toBe('12/12');
  });

  it('correctly flags steep slope pitches (>= 30° / ~7/12)', () => {
    expect(isSteepPitch(25)).toBe(false); // ~5.5/12
    expect(isSteepPitch(28)).toBe(false); // ~6.4/12
    expect(isSteepPitch(30.0)).toBe(true); // 6.9/12 -> steep
    expect(isSteepPitch(33.7)).toBe(true); // 8/12 -> steep
    expect(isSteepPitch(45)).toBe(true); // 12/12 -> steep
  });

  it('converts compass azimuths (0-360°) to cardinal directions', () => {
    expect(degreesToCompass(0)).toBe('N');
    expect(degreesToCompass(360)).toBe('N');
    expect(degreesToCompass(45)).toBe('NE');
    expect(degreesToCompass(90)).toBe('E');
    expect(degreesToCompass(135)).toBe('SE');
    expect(degreesToCompass(180)).toBe('S');
    expect(degreesToCompass(225)).toBe('SW');
    expect(degreesToCompass(270)).toBe('W');
    expect(degreesToCompass(315)).toBe('NW');
  });

  it('classifies roof complexity based on facet counts', () => {
    expect(classifyRoofComplexity(1).complexity).toBe('simple');
    expect(classifyRoofComplexity(2).complexity).toBe('simple');
    expect(classifyRoofComplexity(4).complexity).toBe('moderate');
    expect(classifyRoofComplexity(8).complexity).toBe('complex');
    expect(classifyRoofComplexity(12).complexityLabel).toContain('Complex Hip & Valley (12 planes)');
  });

  it('converts square meters to square feet and roofing squares accurately', () => {
    // 100 m^2 ~ 1,076 sq ft
    const sqFt = sqMetersToSqFt(100);
    expect(sqFt).toBe(1076);

    // 3,240 sq ft -> 32.4 squares
    expect(sqFtToRoofingSquares(3240)).toBe(32.4);
    expect(sqFtToRoofingSquares(0)).toBe(0);
  });
});

describe('Property Intelligence - Summarizer & Quote AI Context', () => {
  const sampleIntel: PropertyIntelligence = {
    address: '1418 S Main St, Royal Oak, MI 48067',
    lat: 42.4895,
    lng: -83.1446,
    streetView: {
      available: true,
      imageUrl: 'https://maps.googleapis.com/maps/api/streetview?location=42.4895,-83.1446',
      date: '2023-08',
    },
    satellite: {
      imageUrl: 'https://maps.googleapis.com/maps/api/staticmap?center=42.4895,-83.1446',
      zoom: 20,
    },
    roof: {
      totalAreaSqFt: 3240,
      roofingSquares: 32.4,
      groundAreaSqFt: 1650,
      dominantPitchRatio: '8/12',
      dominantPitchDegrees: 33.7,
      maxPitchDegrees: 35.0,
      isSteep: true,
      complexity: 'complex',
      complexityLabel: 'Complex Hip & Valley (9 facets)',
      segmentCount: 9,
      segments: [],
      maxSunshineHoursPerYear: 1820,
      solarPotentialPanels: 42,
    },
    specs: {
      yearBuilt: 1968,
      squareFootage: 2400,
      lotSizeSqFt: 12196,
      lotSizeAcres: 0.28,
      bedrooms: 4,
      bathrooms: 2.5,
      stories: 2,
      ownerOccupied: true,
      heatingFuel: 'Gas',
      foundationType: 'Crawlspace',
    },
    hasSolarCoverage: true,
    hasSpecs: true,
  };

  it('summarizes property intelligence for compact AI context injection', () => {
    const summary = summarizePropertyIntelligence(sampleIntel);
    expect(summary).not.toBeNull();
    expect(summary?.roofingSquares).toBe(32.4);
    expect(summary?.totalRoofAreaSqFt).toBe(3240);
    expect(summary?.groundFootprintSqFt).toBe(1650);
    expect(summary?.dominantPitch).toBe('8/12');
    expect(summary?.isSteep).toBe(true);
    expect(summary?.complexityLabel).toBe('Complex Hip & Valley (9 facets)');
    expect(summary?.solarPanelCapacity).toBe(42);

    // RentCast specs
    expect(summary?.yearBuilt).toBe(1968);
    expect(summary?.isPre1978LeadRisk).toBe(true);
    expect(summary?.livingAreaSqFt).toBe(2400);
    expect(summary?.lotSizeAcres).toBe(0.28);
    expect(summary?.stories).toBe(2);
    expect(summary?.bedrooms).toBe(4);
    expect(summary?.bathrooms).toBe(2.5);
    expect(summary?.ownerOccupied).toBe(true);
    expect(summary?.heatingFuel).toBe('Gas');
    expect(summary?.foundationType).toBe('Crawlspace');
  });

  it('injects verified property dimensions into buildDraftInstructions', () => {
    const summary = summarizePropertyIntelligence(sampleIntel);
    const draftContext: DraftContext = {
      accountId: 'acc-123',
      scope: 'Repaint exterior siding and replace roof',
      trade: 'painting',
      estimatedHours: 24,
      services: [
        { id: 'srv-1', name: 'Exterior Siding Painting (per sqft)', unitPrice: 2.5, unit: 'sqft' },
        { id: 'srv-2', name: 'Lead Paint Containment Prep', unitPrice: 350, unit: 'flat' },
      ],
      history: [],
      propertyIntel: summary,
    };

    const instructions = buildDraftInstructions(draftContext);
    expect(instructions).toContain('VERIFIED PROPERTY & ROOF MEASUREMENTS');
    expect(instructions).toContain('Year Built: 1968');
    expect(instructions).toContain('Pre-1978 structure: consider EPA Lead-Safe');
    expect(instructions).toContain('Interior Living Area: 2,400 sq ft');
    expect(instructions).toContain('Total Lot Size: 0.28 acres (12,196 sq ft)');
    expect(instructions).toContain('Stories: 2');
    expect(instructions).toContain('Layout: 4 beds / 2.5 baths');
    expect(instructions).toContain('3,240 sq ft (32.4 roofing squares)');
    expect(instructions).toContain('1,650 sq ft');
    expect(instructions).toContain('8/12 (Steep slope');
  });

  it('builds valid draft instructions without property intel when unavailable', () => {
    const draftContext: DraftContext = {
      accountId: 'acc-123',
      scope: 'Fix leaky kitchen faucet',
      trade: 'plumbing',
      estimatedHours: 2,
      services: [],
      history: [],
      propertyIntel: null,
    };

    const instructions = buildDraftInstructions(draftContext);
    expect(instructions).not.toContain('VERIFIED PROPERTY & ROOF MEASUREMENTS');
    expect(instructions).toContain('You draft an itemized quote for a plumbing contractor');
  });
});
