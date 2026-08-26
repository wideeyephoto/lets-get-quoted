import { describe, it, expect } from 'vitest';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '../src/lib/permit-intel/requirement-engine';

describe('Mexican State Trade & NOM Standards', () => {
  it('evaluates Mexico City (CDMX) SEDUVI & RCDF structural DRO and electrical rules', () => {
    const cdmxJurisdiction = resolveJurisdiction({
      raw: 'Paseo de la Reforma 222, Cuauhtémoc, CDMX 06600',
      city: 'Cuauhtémoc',
      state: 'CDMX',
      formattedAddress: 'Paseo de la Reforma 222, Cuauhtémoc, CDMX 06600',
      isValid: true,
    });

    expect(cdmxJurisdiction.authorityId).toBe('mex-cdmx-cuauhtemoc');

    const elecResult = evaluatePermitRequirement(cdmxJurisdiction.authorityId, {
      trade: 'electrical',
      scope: 'replacement',
      freeTextDescription: 'Instalación de acometida CFE y centro de carga 220V',
    });

    expect(elecResult.decision).toBe('required');
    expect(elecResult.permitTypes[0]).toContain('NOM-001-SEDE');
    expect(elecResult.citations[0].codeFamily).toBe('NOM-SEDE');
    expect(elecResult.disclaimer).toContain('SEDUVI');

    const roofResult = evaluatePermitRequirement(cdmxJurisdiction.authorityId, {
      trade: 'roofing',
      scope: 'replacement',
      estimatedCost: 65000,
    });

    expect(roofResult.decision).toBe('required');
    expect(roofResult.requiredDocuments.some((d) => d.includes('Director Responsable de Obra'))).toBe(true);
  });

  it('evaluates Quintana Roo / Cancún hurricane and waterproofing rules', () => {
    const cancunJurisdiction = resolveJurisdiction({
      raw: 'Blvd. Kukulcan Km 12.5, Cancún, Quintana Roo 77500',
      city: 'Cancún',
      state: 'ROO',
      formattedAddress: 'Blvd. Kukulcan Km 12.5, Cancún, Quintana Roo 77500',
      isValid: true,
    });

    expect(cancunJurisdiction.authorityId).toBe('mex-roo-cancun');

    const roofResult = evaluatePermitRequirement(cancunJurisdiction.authorityId, {
      trade: 'roofing',
      scope: 'replacement',
      estimatedCost: 95000,
    });

    expect(roofResult.decision).toBe('required');
    expect(roofResult.permitTypes[0]).toContain('Licencia de Construcción');
    expect(roofResult.citations[0].codeFamily).toBe('RCROO');
  });

  it('evaluates Nuevo León / Monterrey thermal envelope and HVAC rules', () => {
    const mtyJurisdiction = resolveJurisdiction({
      raw: 'Av. Constitución 400, Monterrey, Nuevo León 64000',
      city: 'Monterrey',
      state: 'NL',
      formattedAddress: 'Av. Constitución 400, Monterrey, Nuevo León 64000',
      isValid: true,
    });

    expect(mtyJurisdiction.authorityId).toBe('mex-nl-monterrey');

    const hvacResult = evaluatePermitRequirement(mtyJurisdiction.authorityId, {
      trade: 'mechanical',
      scope: 'replacement',
      freeTextDescription: 'Instalación de sistema minisplit inverter central',
    });

    expect(hvacResult.decision).toBe('required');
    expect(hvacResult.citations[0].codeFamily).toBe('NOM-ENER');
  });

  it('exempts non-structural gutter and downspout work across Mexico', () => {
    const jalJurisdiction = resolveJurisdiction({
      raw: 'Av. Vallarta 1500, Guadalajara, Jalisco 44100',
      city: 'Guadalajara',
      state: 'JAL',
      formattedAddress: 'Av. Vallarta 1500, Guadalajara, Jalisco 44100',
      isValid: true,
    });

    const gutterResult = evaluatePermitRequirement(jalJurisdiction.authorityId, {
      trade: 'gutters',
      scope: 'replacement',
    });

    expect(gutterResult.decision).toBe('not_required');
    expect(gutterResult.confidence).toBe('high');
  });
});
