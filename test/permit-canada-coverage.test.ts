import { describe, it, expect } from 'vitest';
import { CANADA_CODE_REGISTRY, normalizeCanadaProvinceCode } from '../src/lib/permit-intel/canada-code-registry';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '../src/lib/permit-intel/requirement-engine';

describe('Canada 10 Provinces + 3 Territories Building Code & Licensing Coverage', () => {
  const canadianProvincesAndTerritories = [
    'ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU',
  ];

  it('contains valid registry profiles for all 10 Canadian Provinces and 3 Territories', () => {
    expect(Object.keys(CANADA_CODE_REGISTRY)).toHaveLength(13);

    for (const provCode of canadianProvincesAndTerritories) {
      const profile = CANADA_CODE_REGISTRY[provCode];
      expect(profile).toBeDefined();
      expect(profile.provinceCode).toBe(provCode);
      expect(profile.country).toBe('CA');
      expect(profile.provinceName.length).toBeGreaterThan(0);
      expect(profile.licensingBoard.length).toBeGreaterThan(0);
      expect(profile.licensingUrl).toMatch(/^https?:\/\//);

      // Canadian code editions
      expect(profile.codes.building.name).toBeDefined();
      expect(profile.codes.electrical.name).toBeDefined();
      expect(profile.codes.mechanical.name).toBeDefined();
      expect(profile.codes.plumbing.name).toBeDefined();

      expect(profile.basePermitFee).toBeGreaterThan(0);
      expect(profile.estAverageFee).toBeGreaterThan(profile.basePermitFee);
    }
  });

  it('normalizes full Canadian province names and abbreviations', () => {
    expect(normalizeCanadaProvinceCode('Ontario')).toBe('ON');
    expect(normalizeCanadaProvinceCode('British Columbia')).toBe('BC');
    expect(normalizeCanadaProvinceCode('Alberta')).toBe('AB');
    expect(normalizeCanadaProvinceCode('Quebec')).toBe('QC');
    expect(normalizeCanadaProvinceCode('Québec')).toBe('QC');
    expect(normalizeCanadaProvinceCode('Manitoba')).toBe('MB');
    expect(normalizeCanadaProvinceCode('Nova Scotia')).toBe('NS');
    expect(normalizeCanadaProvinceCode('Yukon')).toBe('YT');
    expect(normalizeCanadaProvinceCode('Nunavut')).toBe('NU');
    expect(normalizeCanadaProvinceCode('ON')).toBe('ON');
  });

  it('resolves Canadian jurisdictions and evaluates permit requirements for all provinces and territories', () => {
    const sampleCities: Record<string, string> = {
      ON: 'Toronto',
      BC: 'Vancouver',
      AB: 'Calgary',
      QC: 'Montreal',
      MB: 'Winnipeg',
      SK: 'Saskatoon',
      NS: 'Halifax',
      NB: 'Moncton',
      NL: 'St. John\'s',
      PE: 'Charlottetown',
      YT: 'Whitehorse',
      NT: 'Yellowknife',
      NU: 'Iqaluit',
    };

    for (const provCode of canadianProvincesAndTerritories) {
      const city = sampleCities[provCode];
      const address = `100 Queen St, ${city}, ${provCode}`;

      const jurisdiction = resolveJurisdiction({
        raw: address,
        city,
        state: provCode,
        formattedAddress: address,
        isValid: true,
      });

      expect(jurisdiction.state).toBe(provCode);
      expect(jurisdiction.authorityId).toContain(`can-${provCode.toLowerCase()}`);
      expect(jurisdiction.authorityName).toContain(city);

      const roofingReq = evaluatePermitRequirement(jurisdiction.authorityId, {
        trade: 'roofing',
        scope: 'replacement',
        estimatedCost: 15000,
      });

      expect(roofingReq.decision).toBe('required');
      expect(roofingReq.citations.length).toBeGreaterThan(0);
      expect(roofingReq.citations.some((c) => c.section.includes('9.26') || c.title.includes('Eave Protection'))).toBe(true);
      expect(roofingReq.estimatedGovernmentFee?.estimatedTotal).toBeGreaterThan(0);
    }
  });
});
