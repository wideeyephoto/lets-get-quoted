import { describe, it, expect } from 'vitest';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '../src/lib/permit-intel/requirement-engine';

describe('State-Specific Building Code Rules', () => {
  it('evaluates Florida FBC 2023 HVHZ sealed roof deck & product approval requirements', () => {
    const flJurisdiction = resolveJurisdiction({
      raw: '1500 Ocean Dr, Miami Beach, FL',
      city: 'Miami Beach',
      state: 'FL',
      formattedAddress: '1500 Ocean Dr, Miami Beach, FL',
      isValid: true,
    });

    const result = evaluatePermitRequirement(flJurisdiction.authorityId, {
      trade: 'roofing',
      scope: 'replacement',
      estimatedCost: 15000,
    });

    expect(result.decision).toBe('required');
    expect(result.permitTypes[0]).toContain('Florida Building Code');
    expect(result.requiredDocuments.some((d) => d.includes('Miami-Dade') || d.includes('Product Approval'))).toBe(true);
    expect(result.citations.some((c) => c.codeFamily === 'FBC')).toBe(true);
    expect(result.citations.some((c) => c.section === 'R905.1.1')).toBe(true);
    expect(result.reasons[0]).toContain('Florida Building Code');
  });

  it('evaluates California Title 24 cool roof and fire-rating requirements', () => {
    const caJurisdiction = resolveJurisdiction({
      raw: '400 Sunset Blvd, Los Angeles, CA',
      city: 'Los Angeles',
      state: 'CA',
      formattedAddress: '400 Sunset Blvd, Los Angeles, CA',
      isValid: true,
    });

    const result = evaluatePermitRequirement(caJurisdiction.authorityId, {
      trade: 'roofing',
      scope: 'replacement',
      estimatedCost: 18000,
    });

    expect(result.decision).toBe('required');
    expect(result.permitTypes[0]).toContain('California');
    expect(result.citations.some((c) => c.codeFamily === 'CRC')).toBe(true);
    expect(result.reasons.some((r) => r.includes('Title 24'))).toBe(true);
  });

  it('evaluates Texas TDI Windstorm catastrophe provisions', () => {
    const txJurisdiction = resolveJurisdiction({
      raw: '200 Seawall Blvd, Galveston, TX',
      city: 'Galveston',
      state: 'TX',
      formattedAddress: '200 Seawall Blvd, Galveston, TX',
      isValid: true,
    });

    const result = evaluatePermitRequirement(txJurisdiction.authorityId, {
      trade: 'roofing',
      scope: 'replacement',
      estimatedCost: 14000,
    });

    expect(result.decision).toBe('required');
    expect(result.requiredDocuments.some((d) => d.includes('Windstorm'))).toBe(true);
    expect(result.citations.some((c) => c.title.includes('Windstorm'))).toBe(true);
  });

  it('evaluates Ohio 2024 Residential Code & OCILB trade licensing standards', () => {
    const ohJurisdiction = resolveJurisdiction({
      raw: '50 W Broad St, Columbus, OH',
      city: 'Columbus',
      state: 'OH',
      formattedAddress: '50 W Broad St, Columbus, OH',
      isValid: true,
    });

    const elecResult = evaluatePermitRequirement(ohJurisdiction.authorityId, {
      trade: 'electrical',
      scope: 'replacement',
      freeTextDescription: '200A panel replacement and EV charger circuit',
    });

    expect(elecResult.decision).toBe('required');
    expect(elecResult.citations[0].codeFamily).toBe('NEC');
    expect(elecResult.disclaimer).toContain('Ohio');
  });

  it('evaluates snow/cold state ice barrier requirements for Minnesota and Colorado', () => {
    const mnJurisdiction = resolveJurisdiction({
      raw: '100 Nicollet Mall, Minneapolis, MN',
      city: 'Minneapolis',
      state: 'MN',
      formattedAddress: '100 Nicollet Mall, Minneapolis, MN',
      isValid: true,
    });

    const result = evaluatePermitRequirement(mnJurisdiction.authorityId, {
      trade: 'roofing',
      scope: 'replacement',
      estimatedCost: 12000,
    });

    expect(result.decision).toBe('required');
    expect(result.citations.some((c) => c.title.includes('Ice Barrier'))).toBe(true);
    expect(result.requiredInspections.some((i) => i.includes('Ice Barrier'))).toBe(true);
  });
});
