import { describe, it, expect } from 'vitest';
import { STATE_CODE_REGISTRY, normalizeStateCode } from '../src/lib/permit-intel/state-code-registry';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '../src/lib/permit-intel/requirement-engine';

describe('50-State + DC Building Code & Licensing Coverage', () => {
  const allStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC',
  ];

  it('contains valid registry profiles for all 50 US States + District of Columbia', () => {
    expect(Object.keys(STATE_CODE_REGISTRY)).toHaveLength(51);

    for (const stateCode of allStates) {
      const profile = STATE_CODE_REGISTRY[stateCode];
      expect(profile).toBeDefined();
      expect(profile.stateCode).toBe(stateCode);
      expect(profile.stateName.length).toBeGreaterThan(0);
      expect(profile.fips.length).toBe(2);
      expect(profile.licensingBoard.length).toBeGreaterThan(0);
      expect(profile.licensingUrl).toMatch(/^https?:\/\//);

      // Codes verification
      expect(profile.codes.building.name).toBeDefined();
      expect(profile.codes.electrical.name).toBeDefined();
      expect(profile.codes.mechanical.name).toBeDefined();
      expect(profile.codes.plumbing.name).toBeDefined();

      expect(profile.basePermitFee).toBeGreaterThan(0);
      expect(profile.estAverageFee).toBeGreaterThan(profile.basePermitFee);
    }
  });

  it('normalizes full state names to standard 2-letter codes', () => {
    expect(normalizeStateCode('California')).toBe('CA');
    expect(normalizeStateCode('texas')).toBe('TX');
    expect(normalizeStateCode('Florida')).toBe('FL');
    expect(normalizeStateCode('New York')).toBe('NY');
    expect(normalizeStateCode('Ohio')).toBe('OH');
    expect(normalizeStateCode('Illinois')).toBe('IL');
    expect(normalizeStateCode('District of Columbia')).toBe('DC');
    expect(normalizeStateCode('MI')).toBe('MI');
  });

  it('resolves jurisdiction and evaluates permit requirements across all 50 states', () => {
    for (const stateCode of allStates) {
      const stateProfile = STATE_CODE_REGISTRY[stateCode];
      const address = `100 Main St, Capital City, ${stateCode}`;

      const jurisdiction = resolveJurisdiction(
        {
          raw: address,
          city: 'Capital City',
          state: stateCode,
          formattedAddress: address,
          isValid: true,
        },
        'building',
      );

      expect(jurisdiction.state).toBe(stateCode);
      expect(jurisdiction.authorityName).toBeDefined();
      expect(typeof jurisdiction.isAuthoritative).toBe('boolean');

      const requirement = evaluatePermitRequirement(jurisdiction.authorityId, {
        trade: 'roofing',
        scope: 'replacement',
        estimatedCost: 10000,
      });

      expect(requirement.decision).toBe('required');
      expect(requirement.permitTypes.length).toBeGreaterThan(0);
      expect(requirement.requiredDocuments.length).toBeGreaterThan(0);
      expect(requirement.citations.length).toBeGreaterThan(0);
      expect(requirement.estimatedGovernmentFee?.estimatedTotal).toBeGreaterThan(0);
    }
  });
});
