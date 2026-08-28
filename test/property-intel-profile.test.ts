import { describe, it, expect } from 'vitest';
import {
  matchTradeFamilies,
  resolvePropertyIntelProfile,
  resolveProfileFromIntel,
  resolveProfileFromSummary,
  getAvailableSectionsFromIntel,
  getAvailableSectionsFromSummary,
  type PropertySection,
} from '../src/lib/property-intel/profile';
import { buildDraftInstructions, type DraftContext } from '../src/lib/quote-draft-ai';
import type { PropertyIntelligence, PropertyIntelligenceSummary } from '../src/lib/property-intel/types';

describe('Property Intelligence Profile - Trade Matching & Disambiguation', () => {
  it('correctly matches singular, plural, and suffix variations for canonical trades', () => {
    expect(matchTradeFamilies('plumber')).toContain('plumbing');
    expect(matchTradeFamilies('plumbing')).toContain('plumbing');
    expect(matchTradeFamilies('roofing contractor')).toContain('roofing');
    expect(matchTradeFamilies('roofer')).toContain('roofing');
    expect(matchTradeFamilies('electrician')).toContain('electrical');
    expect(matchTradeFamilies('electrical service')).toContain('electrical');
    expect(matchTradeFamilies('hvac technician')).toContain('hvac');
    expect(matchTradeFamilies('heating and cooling')).toContain('hvac');
    expect(matchTradeFamilies('flooring installer')).toContain('flooring');
    expect(matchTradeFamilies('tile setter')).toContain('flooring');
    expect(matchTradeFamilies('landscaping & lawn care')).toContain('landscaping');
  });

  it('unions multi-trade contractor businesses', () => {
    const families = matchTradeFamilies('Roofing and solar energy solutions');
    expect(families).toContain('roofing');
    expect(families).toContain('solar');

    const multi = matchTradeFamilies('Painting and landscaping services');
    expect(multi).toContain('finishing');
    expect(multi).toContain('landscaping');
  });

  it('disambiguates window cleaning from window installation', () => {
    const cleaning = matchTradeFamilies('Residential window cleaning & power washing');
    expect(cleaning).toContain('outdoor_maintenance');
    expect(cleaning).not.toContain('window_installation');

    const install = matchTradeFamilies('Custom window replacement and installation');
    expect(install).toContain('window_installation');
    expect(install).not.toContain('outdoor_maintenance');
  });

  it('returns unknown for empty, null, or unrecognized trades', () => {
    expect(matchTradeFamilies('')).toEqual(['unknown']);
    expect(matchTradeFamilies(null)).toEqual(['unknown']);
    expect(matchTradeFamilies('Underwater basket weaving')).toEqual(['unknown']);
  });
});

describe('Property Intelligence Profile - Fact Resolver', () => {
  const allSections: PropertySection[] = [
    'building_specs',
    'mep_systems',
    'roof_geometry',
    'solar_energy',
    'site_lot',
  ];

  it('orders sections according to trade defaults', () => {
    // Roofer defaults: roof_geometry, building_specs (primary), site_lot, solar_energy, mep_systems (secondary)
    const rooferProfile = resolvePropertyIntelProfile({
      trade: 'Roofing Specialist',
      scope: 'Replace asphalt shingles',
      availableSections: allSections,
      yearBuilt: 1995,
    });
    expect(rooferProfile.primarySections).toEqual(['roof_geometry', 'building_specs']);
    expect(rooferProfile.secondarySections).toEqual(['site_lot', 'solar_energy', 'mep_systems']);
    expect(rooferProfile.isPre1978).toBe(false);
    expect(rooferProfile.needsLeadScreening).toBe(false);
  });

  it('promotes scope-relevant sections to primary for non-trade contractors', () => {
    // Painter doing a roof repair scope
    const painterProfile = resolvePropertyIntelProfile({
      trade: 'Exterior Painting Co',
      scope: 'Repaint exterior trim and replace leaking roof flashing',
      availableSections: allSections,
      yearBuilt: 1985,
    });
    // roof_geometry is promoted because scope contains "roof"
    expect(painterProfile.primarySections).toContain('roof_geometry');
    expect(painterProfile.primarySections).toContain('building_specs');
  });

  it('only includes sections in primary/secondary that are present in availableSections', () => {
    // Roofer where only building specs exist (no aerial solar/roof coverage)
    const partialProfile = resolvePropertyIntelProfile({
      trade: 'Roofing Specialist',
      scope: 'Full roof replacement',
      availableSections: ['building_specs', 'site_lot'],
      yearBuilt: 2005,
    });
    expect(partialProfile.primarySections).toEqual(['building_specs']);
    expect(partialProfile.secondarySections).toEqual(['site_lot']);
    expect(partialProfile.primarySections).not.toContain('roof_geometry');
  });

  it('triggers EPA RRP lead screening only when pre-1978 AND scope plausibly disturbs paint', () => {
    // Pre-1978 with paint disturbance scope
    const leadRisk = resolvePropertyIntelProfile({
      trade: 'Remodeling Contractor',
      scope: 'Sand drywall, replace window trim, and paint interior',
      availableSections: allSections,
      yearBuilt: 1964,
    });
    expect(leadRisk.isPre1978).toBe(true);
    expect(leadRisk.needsLeadScreening).toBe(true);

    // Pre-1978 with scope that does NOT disturb painted surfaces (e.g. clean gutters)
    const noLeadRisk = resolvePropertyIntelProfile({
      trade: 'Maintenance',
      scope: 'Clean gutters and inspect downspouts',
      availableSections: allSections,
      yearBuilt: 1964,
    });
    expect(noLeadRisk.isPre1978).toBe(true);
    expect(noLeadRisk.needsLeadScreening).toBe(false);

    // Post-1978 with paint scope
    const modernHouse = resolvePropertyIntelProfile({
      trade: 'Painter',
      scope: 'Repaint entire house exterior',
      availableSections: allSections,
      yearBuilt: 1992,
    });
    expect(modernHouse.isPre1978).toBe(false);
    expect(modernHouse.needsLeadScreening).toBe(false);
  });
});

describe('Property Intelligence Profile - Adapters', () => {
  const sampleIntel: PropertyIntelligence = {
    address: '1418 S Main St, Royal Oak, MI',
    lat: 42.4895,
    lng: -83.1446,
    streetView: { available: true, imageUrl: 'https://example.com/sv', date: '2023-08' },
    satellite: { imageUrl: 'https://example.com/sat', zoom: 20 },
    roof: {
      totalAreaSqFt: 3240,
      roofingSquares: 32.4,
      groundAreaSqFt: 1650,
      dominantPitchRatio: '8/12',
      dominantPitchDegrees: 33.7,
      maxPitchDegrees: 35.0,
      isSteep: true,
      complexity: 'complex',
      complexityLabel: 'Complex Hip & Valley',
      segmentCount: 9,
      segments: [],
      maxSunshineHoursPerYear: 1820,
      solarPotentialPanels: 42,
    },
    specs: {
      yearBuilt: 1972,
      squareFootage: 2400,
      lotSizeSqFt: 12196,
      lotSizeAcres: 0.28,
      bedrooms: 4,
      bathrooms: 2.5,
      stories: 2,
      ownerOccupied: true,
      heatingFuel: 'Gas',
      foundationType: 'Basement',
    },
    hasSolarCoverage: true,
    hasSpecs: true,
  };

  it('adapts PropertyIntelligence object into accurate available sections', () => {
    const sections = getAvailableSectionsFromIntel(sampleIntel);
    expect(sections.has('building_specs')).toBe(true);
    expect(sections.has('mep_systems')).toBe(true);
    expect(sections.has('roof_geometry')).toBe(true);
    expect(sections.has('solar_energy')).toBe(true);
    expect(sections.has('site_lot')).toBe(true);

    const profile = resolveProfileFromIntel(sampleIntel, 'Plumber', 'Repipe hot water lines');
    expect(profile.primarySections[0]).toBe('mep_systems');
    expect(profile.primarySections[1]).toBe('building_specs');
    expect(profile.isPre1978).toBe(true);
  });

  it('adapts PropertyIntelligenceSummary object into accurate available sections', () => {
    const summary: PropertyIntelligenceSummary = {
      roofingSquares: 28,
      totalRoofAreaSqFt: 2800,
      groundFootprintSqFt: 1400,
      dominantPitch: '6/12',
      isSteep: false,
      complexityLabel: 'Moderate Gable',
      solarPanelCapacity: 30,
      yearBuilt: 1982,
      isPre1978LeadRisk: false,
      livingAreaSqFt: 2100,
      lotSizeAcres: 0.25,
      lotSizeSqFt: 10890,
      stories: 1,
      bedrooms: 3,
      bathrooms: 2,
      ownerOccupied: true,
      heatingFuel: 'Electric',
      foundationType: 'Slab',
    };

    const sections = getAvailableSectionsFromSummary(summary);
    expect(sections.has('building_specs')).toBe(true);
    expect(sections.has('mep_systems')).toBe(true);
    expect(sections.has('roof_geometry')).toBe(true);
    expect(sections.has('solar_energy')).toBe(true);
    expect(sections.has('site_lot')).toBe(true);

    const profile = resolveProfileFromSummary(summary, 'Solar installer', 'Install 8kW rooftop solar array');
    expect(profile.primarySections).toContain('solar_energy');
    expect(profile.primarySections).toContain('roof_geometry');
  });
});

describe('AI Quote Drafter - Instruction Preservation and Scoping', () => {
  it('preserves all core quotation rules, line-item limits, and anti-padding guidance', () => {
    const sampleSummary: PropertyIntelligenceSummary = {
      roofingSquares: 32.4,
      totalRoofAreaSqFt: 3240,
      groundFootprintSqFt: 1650,
      dominantPitch: '8/12',
      isSteep: true,
      complexityLabel: 'Complex Hip & Valley',
      solarPanelCapacity: 42,
      yearBuilt: 1968,
      isPre1978LeadRisk: true,
      livingAreaSqFt: 2400,
      lotSizeAcres: 0.28,
      lotSizeSqFt: 12196,
      stories: 2,
      bedrooms: 4,
      bathrooms: 2.5,
      ownerOccupied: true,
      heatingFuel: 'Gas',
      foundationType: 'Crawlspace',
    };

    const context: DraftContext = {
      accountId: 'acc-456',
      scope: 'Replace architectural shingles on main roof and detached garage',
      trade: 'Roofing Contractor',
      estimatedHours: 16,
      services: [
        { id: 's1', name: 'Architectural Shingle Reroof (per sq)', unitPrice: 425, unit: 'sq' },
        { id: 's2', name: 'Steep Pitch Labor Adder', unitPrice: 50, unit: 'sq' },
      ],
      history: [
        { scope: 'Reroof 30 squares', total: 12750, lines: [{ label: 'Shingles', amount: 12750 }] },
      ],
      propertyIntel: sampleSummary,
    };

    const prompt = buildDraftInstructions(context);

    // Structural rules preservation
    expect(prompt).toContain('You draft an itemized quote for a Roofing Contractor');
    expect(prompt).toContain("THIS CONTRACTOR'S PRICE BOOK");
    expect(prompt).toContain('WHAT THEY HAVE CHARGED RECENTLY');
    expect(prompt).toContain('Return STRICT JSON only:');
    expect(prompt).toContain('ITEMIZE. Break the work into the parts');
    expect(prompt).toContain('Do NOT pad.');
    expect(prompt).toContain('SCOPE-CONSCIOUS MEASUREMENT APPLICATION:');
    expect(prompt).toContain('Living Area is total finished interior floor space');
    expect(prompt).toContain('Roof Squares and Pitch reflect 3D roof surface geometry');
    expect(prompt).toContain('When nothing in the book matches, omit "service" and price it yourself.');
    expect(prompt).toContain('Prefer their own numbers over national averages.');
    expect(prompt).toContain('"assumptions" is where you say what you could not tell from the description');
    expect(prompt).toContain('Never include the customer\'s name or address in any label.');
  });
});
