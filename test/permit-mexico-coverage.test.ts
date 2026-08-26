import { describe, it, expect } from 'vitest';
import { MEXICO_CODE_REGISTRY, normalizeMexicoStateCode } from '../src/lib/permit-intel/mexico-code-registry';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '../src/lib/permit-intel/requirement-engine';

describe('Mexico 32 Federal Entities (31 States + CDMX) Building Code & Licensing Coverage', () => {
  const allMexicanStates = [
    'CDMX', 'NL', 'JAL', 'MEX', 'BCN', 'BCS', 'ROO', 'YUC',
    'GTO', 'PUE', 'QRO', 'VER', 'SON', 'CHH', 'TAM', 'COA',
    'SIN', 'SLP', 'AGU', 'MOR', 'HID', 'MIC', 'CHP', 'OAX',
    'GRO', 'TAB', 'ZAC', 'DUR', 'NAY', 'COL', 'TLA', 'CAM',
  ];

  it('contains valid registry profiles for all 32 Mexican Federal Entities', () => {
    expect(Object.keys(MEXICO_CODE_REGISTRY)).toHaveLength(32);

    for (const stateCode of allMexicanStates) {
      const profile = MEXICO_CODE_REGISTRY[stateCode];
      expect(profile).toBeDefined();
      expect(profile.stateCode).toBe(stateCode);
      expect(profile.country).toBe('MX');
      expect(profile.stateName.length).toBeGreaterThan(0);
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

  it('normalizes full Mexican state names and abbreviations', () => {
    expect(normalizeMexicoStateCode('Ciudad de México')).toBe('CDMX');
    expect(normalizeMexicoStateCode('Nuevo León')).toBe('NL');
    expect(normalizeMexicoStateCode('Jalisco')).toBe('JAL');
    expect(normalizeMexicoStateCode('Estado de México')).toBe('MEX');
    expect(normalizeMexicoStateCode('Quintana Roo')).toBe('ROO');
    expect(normalizeMexicoStateCode('Yucatan')).toBe('YUC');
    expect(normalizeMexicoStateCode('Baja California')).toBe('BCN');
    expect(normalizeMexicoStateCode('Baja California Sur')).toBe('BCS');
    expect(normalizeMexicoStateCode('CDMX')).toBe('CDMX');
  });

  it('resolves Mexican jurisdictions and evaluates permit requirements across all 32 entities', () => {
    const sampleCities: Record<string, string> = {
      CDMX: 'Cuauhtémoc',
      NL: 'Monterrey',
      JAL: 'Guadalajara',
      MEX: 'Toluca',
      BCN: 'Tijuana',
      BCS: 'Los Cabos',
      ROO: 'Cancún',
      YUC: 'Mérida',
      GTO: 'León',
      PUE: 'Puebla',
      QRO: 'Querétaro',
      VER: 'Veracruz',
      SON: 'Hermosillo',
      CHH: 'Chihuahua',
      TAM: 'Reynosa',
      COA: 'Saltillo',
      SIN: 'Culiacán',
      SLP: 'San Luis Potosí',
      AGU: 'Aguascalientes',
      MOR: 'Cuernavaca',
      HID: 'Pachuca',
      MIC: 'Morelia',
      CHP: 'Tuxtla Gutiérrez',
      OAX: 'Oaxaca de Juárez',
      GRO: 'Acapulco',
      TAB: 'Villahermosa',
      ZAC: 'Zacatecas',
      DUR: 'Durango',
      NAY: 'Tepic',
      COL: 'Colima',
      TLA: 'Tlaxcala',
      CAM: 'Campeche',
    };

    for (const stateCode of allMexicanStates) {
      const city = sampleCities[stateCode];
      const address = `Av. Principal 123, ${city}, ${stateCode}`;

      const jurisdiction = resolveJurisdiction({
        raw: address,
        city,
        state: stateCode,
        formattedAddress: address,
        isValid: true,
      });

      expect(jurisdiction.state).toBe(stateCode);
      expect(jurisdiction.authorityId).toContain(`mex-${stateCode.toLowerCase()}`);
      expect(jurisdiction.authorityName).toContain(city);

      const roofingReq = evaluatePermitRequirement(jurisdiction.authorityId, {
        trade: 'roofing',
        scope: 'replacement',
        estimatedCost: 80000,
      });

      expect(roofingReq.decision).toBe('required');
      expect(roofingReq.citations.length).toBeGreaterThan(0);
      expect(roofingReq.estimatedGovernmentFee?.estimatedTotal).toBeGreaterThan(0);
    }
  });
});
